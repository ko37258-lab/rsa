import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { and, count, eq, gt, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { env, aiConfigured } from "@/lib/env";
import { newId } from "@/lib/ids";
import { ApiError } from "@/lib/api/http";
import { readFile } from "@/lib/storage";
import { BlogDesign, type BlogDesignT, type BriefT } from "@/lib/design/schema";
import { normalizeDesign } from "@/lib/design/normalize";
import { findPreset } from "@/lib/design/presets";
import { deriveMobile, templateDesign, templateRevise } from "@/lib/design/template";
import { briefAssetIds, userAssetIdSet } from "@/lib/services/projects";
import type { AssetRow, ProjectRow, UserRow } from "@/lib/db/schema";
import { GENERATE_SYSTEM, REVISE_SYSTEM } from "./prompts";
import { designToolCall, type AiUsage, type Check, type DesignTool } from "./claude";

const GenerateOutput = z.object({
  referenceAnalysis: z.string().describe("레퍼런스에서 읽어낸 스타일 특징 (한국어 3~6줄)"),
  design: BlogDesign,
});

const ReviseOutput = z.object({
  changeSummary: z.string().describe("바꾼 내용 요약 (한국어 1~3문장)"),
  design: BlogDesign,
});

/** zod 스키마 → 도구 입력 스키마(JSON Schema). strict 가 아니므로 문법 크기 제한이 없습니다. */
function toInputSchema(s: z.ZodType): Anthropic.Beta.BetaTool.InputSchema {
  const js = z.toJSONSchema(s, { unrepresentable: "any" }) as Record<string, unknown>;
  delete js.$schema;
  return js as Anthropic.Beta.BetaTool.InputSchema;
}

const GENERATE_TOOL: DesignTool = {
  name: "submit_design",
  description: "완성한 BlogDesign 과 레퍼런스 분석을 제출합니다. 결과는 반드시 이 도구를 한 번 호출해 제출하세요.",
  inputSchema: toInputSchema(GenerateOutput),
};

const REVISE_TOOL: DesignTool = {
  name: "submit_revision",
  description: "수정한 전체 BlogDesign 과 바꾼 내용 요약을 제출합니다. 결과는 반드시 이 도구를 한 번 호출해 제출하세요.",
  inputSchema: toInputSchema(ReviseOutput),
};

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/** 도구 입력의 뼈대만 확인합니다. 세부 값(범위·색·글꼴 등)은 normalizeDesign 이 보정합니다. */
function readDesign(raw: unknown): Check<BlogDesignT> {
  let d = raw;
  if (typeof d === "string") {
    try {
      d = JSON.parse(d); // 가끔 design 을 문자열로 감싸 보내는 경우
    } catch {
      return { ok: false, reason: "design 이 올바른 JSON 객체가 아님" };
    }
  }
  if (!isObj(d)) return { ok: false, reason: "design 객체가 없음" };
  if (!isObj(d.hero) || !Array.isArray(d.hero.layers) || d.hero.layers.length === 0) {
    return { ok: false, reason: "design.hero.layers 가 비어 있음" };
  }
  if (!isObj(d.menu) || !Array.isArray(d.menu.items)) return { ok: false, reason: "design.menu.items 가 없음" };
  return { ok: true, data: d as unknown as BlogDesignT };
}

function validateGenerate(input: unknown): Check<{ referenceAnalysis: string; design: BlogDesignT }> {
  if (!isObj(input)) return { ok: false, reason: "도구 입력이 객체가 아님" };
  const d = readDesign(input.design);
  if (!d.ok) return d;
  return { ok: true, data: { referenceAnalysis: typeof input.referenceAnalysis === "string" ? input.referenceAnalysis : "", design: d.data } };
}

function validateRevise(input: unknown): Check<{ changeSummary: string; design: BlogDesignT }> {
  if (!isObj(input)) return { ok: false, reason: "도구 입력이 객체가 아님" };
  const d = readDesign(input.design);
  if (!d.ok) return d;
  return { ok: true, data: { changeSummary: typeof input.changeSummary === "string" ? input.changeSummary : "요청한 내용을 반영했습니다.", design: d.data } };
}

const MAX_IMAGE_BYTES = 4_500_000;

async function assetsByIds(userId: string, ids: string[]) {
  if (!ids.length) return new Map<string, AssetRow>();
  const db = await getDb();
  const rows = await db.query.assets.findMany({
    where: and(eq(schema.assets.userId, userId), inArray(schema.assets.id, ids)),
  });
  return new Map(rows.map((r) => [r.id, r]));
}

async function imageBlock(a: AssetRow | undefined): Promise<Anthropic.Beta.BetaImageBlockParam | null> {
  if (!a || a.size > MAX_IMAGE_BYTES) return null;
  const bytes = await readFile(a.storageKey);
  if (!bytes) return null;
  const media = a.mime as "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  return { type: "image", source: { type: "base64", media_type: media, data: bytes.toString("base64") } };
}

function briefText(b: BriefT): string {
  const preset = findPreset(b.presetId);
  const lines = [
    `블로그 이름: ${b.blogName}`,
    b.tagline && `한 줄 소개: ${b.tagline}`,
    b.industry && `업종/분야: ${b.industry}`,
    b.audience && `주요 방문자: ${b.audience}`,
    b.blogUrl && `블로그 주소: ${b.blogUrl}`,
    b.moods.length ? `원하는 분위기: ${b.moods.join(", ")}` : "",
    b.colorPreference && `색상 취향: ${b.colorPreference}`,
    preset && `선택한 스타일 프리셋: ${preset.id} "${preset.name}" — ${preset.description}`,
    b.menu.length
      ? `버튼(메뉴) 목록:\n${b.menu.map((m, i) => `  ${i + 1}. ${m.label} → ${m.link || "(링크 미입력)"}`).join("\n")}`
      : "버튼(메뉴) 목록: 사용자가 지정하지 않음 — 업종에 맞게 4~5개 제안",
    Object.entries(b.contacts).some(([, v]) => v)
      ? `연락처/SNS:\n${Object.entries(b.contacts).filter(([, v]) => v).map(([k, v]) => `  - ${k}: ${v}`).join("\n")}`
      : "",
    b.styleRequest && `스타일·세부 요청 (가장 중요):\n${b.styleRequest}`,
  ];
  return lines.filter(Boolean).join("\n");
}

async function buildGenerateContent(user: UserRow, brief: BriefT) {
  const assets = await assetsByIds(user.id, briefAssetIds(brief));
  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    { type: "text", text: `# 사용자 요구사항\n${briefText(brief)}` },
  ];

  if (brief.references.length) {
    content.push({ type: "text", text: `# 레퍼런스 (${brief.references.length}개) — 이 스타일을 벤치마킹하세요` });
    for (const [i, r] of brief.references.entries()) {
      const head =
        r.kind === "url" ? `레퍼런스 ${i + 1}: 웹사이트 ${r.url}` : r.kind === "video" ? `레퍼런스 ${i + 1}: 영상에서 뽑은 장면들` : `레퍼런스 ${i + 1}: 이미지`;
      const parts = [head, r.note && `사용자 메모: ${r.note}`];
      if (r.inspected) {
        const ins = r.inspected;
        parts.push(
          ins.title && `페이지 제목: ${ins.title}`,
          ins.description && `설명: ${ins.description}`,
          ins.colors.length ? `페이지에서 많이 쓰인 색: ${ins.colors.join(", ")}` : "",
          ins.fonts.length ? `사용 폰트: ${ins.fonts.join(", ")}` : "",
          ins.navLabels.length ? `메뉴 구성: ${ins.navLabels.join(" / ")}` : "",
          ins.headings.length ? `주요 제목: ${ins.headings.join(" / ")}` : "",
        );
      }
      content.push({ type: "text", text: parts.filter(Boolean).join("\n") });
      for (const id of r.assetIds) {
        const block = await imageBlock(assets.get(id));
        if (block) content.push(block);
      }
    }
  } else {
    content.push({ type: "text", text: "# 레퍼런스: 없음 — 요구사항과 업종에 어울리는 스타일을 직접 제안하세요." });
  }

  const photos = brief.photoAssetIds.map((id) => assets.get(id)).filter((a): a is AssetRow => !!a);
  if (photos.length) {
    content.push({ type: "text", text: `# 사용자 사진 (${photos.length}장) — image 레이어의 assetId 로 사용할 수 있는 ID` });
    for (const p of photos) {
      content.push({ type: "text", text: `사진 ID: ${p.id}${p.label ? ` (${p.label})` : ""} — ${p.width ?? "?"}x${p.height ?? "?"}` });
      const block = await imageBlock(p);
      if (block) content.push(block);
    }
  } else {
    content.push({ type: "text", text: "# 사용자 사진: 없음 — image 레이어를 쓰려면 assetId=null 로 두세요." });
  }
  content.push({ type: "text", text: "위 내용으로 BlogDesign 을 만들어 submit_design 도구로 제출해 주세요." });
  return content;
}

async function assertAiQuota(userId: string) {
  const db = await getDb();
  const [{ n }] = await db
    .select({ n: count() })
    .from(schema.aiRuns)
    .where(and(eq(schema.aiRuns.userId, userId), gt(schema.aiRuns.createdAt, Date.now() - 3600_000)));
  if (n >= env.aiRateLimitPerHour) {
    throw new ApiError(429, "quota_exceeded", `AI 사용 한도(시간당 ${env.aiRateLimitPerHour}회)를 넘었습니다. 잠시 후 다시 시도해 주세요.`);
  }
}

async function logRun(r: {
  userId: string;
  projectId: string;
  kind: "generate" | "revise";
  status: "ok" | "error";
  usage?: AiUsage;
  ms: number;
  error?: string;
}) {
  const db = await getDb();
  await db.insert(schema.aiRuns).values({
    id: newId("run"),
    userId: r.userId,
    projectId: r.projectId,
    kind: r.kind,
    model: r.usage?.model ?? env.aiModel,
    status: r.status,
    inputTokens: r.usage?.inputTokens ?? null,
    outputTokens: r.usage?.outputTokens ?? null,
    durationMs: r.ms,
    error: r.error?.slice(0, 500) ?? null,
    createdAt: Date.now(),
  });
}

export type AiResult = {
  design: BlogDesignT;
  note: string;
  source: "ai-generate" | "ai-revise" | "template";
  mode: "ai" | "template";
};

/** 브리프·레퍼런스·사진으로 새 디자인 생성 */
export async function generateDesign(user: UserRow, project: ProjectRow, brief: BriefT): Promise<AiResult> {
  if (!aiConfigured()) {
    const design = templateDesign(brief);
    return { design, note: "템플릿 모드로 생성", source: "template", mode: "template" };
  }
  await assertAiQuota(user.id);
  const started = Date.now();
  try {
    const content = await buildGenerateContent(user, brief);
    const { data, usage } = await designToolCall({ system: GENERATE_SYSTEM, content, tool: GENERATE_TOOL, validate: validateGenerate, effort: "high" });
    const allowed = await userAssetIdSet(user.id);
    let design = normalizeDesign(data.design, { allowedAssetIds: allowed });
    if (!design.mobile.layers.length) design = { ...design, mobile: deriveMobile(design) };
    await logRun({ userId: user.id, projectId: project.id, kind: "generate", status: "ok", usage, ms: Date.now() - started });
    return { design, note: data.referenceAnalysis, source: "ai-generate", mode: "ai" };
  } catch (err) {
    await logRun({ userId: user.id, projectId: project.id, kind: "generate", status: "error", ms: Date.now() - started, error: String((err as Error)?.message ?? err) });
    throw err;
  }
}

/** 자연어 수정 요청으로 기존 디자인 수정 */
export async function reviseDesign(
  user: UserRow,
  project: ProjectRow,
  base: BlogDesignT,
  instruction: string,
  referenceAssetIds: string[],
): Promise<AiResult> {
  if (!aiConfigured()) {
    const r = templateRevise(base, instruction);
    return { design: r.design, note: r.summary, source: "ai-revise", mode: "template" };
  }
  await assertAiQuota(user.id);
  const started = Date.now();
  try {
    const assets = await assetsByIds(user.id, referenceAssetIds);
    const brief = JSON.parse(project.brief) as BriefT;
    const photoIds = await userAssetIdSet(user.id);
    const content: Anthropic.Beta.BetaContentBlockParam[] = [
      { type: "text", text: `# 프로젝트 요구사항 (참고)\n${briefText(brief)}` },
      { type: "text", text: `# 사용할 수 있는 사진 ID\n${[...photoIds].filter((id) => brief.photoAssetIds.includes(id)).join(", ") || "(없음)"}` },
      { type: "text", text: `# 현재 BlogDesign\n${JSON.stringify(base)}` },
    ];
    for (const id of referenceAssetIds) {
      const block = await imageBlock(assets.get(id));
      if (block) content.push({ type: "text", text: "# 수정 참고 이미지" }, block);
    }
    content.push({ type: "text", text: `# 수정 요청\n${instruction}\n\n수정한 전체 BlogDesign 을 submit_revision 도구로 제출해 주세요.` });
    const { data, usage } = await designToolCall({ system: REVISE_SYSTEM, content, tool: REVISE_TOOL, validate: validateRevise, effort: "medium" });
    let design = normalizeDesign(data.design, { allowedAssetIds: photoIds });
    if (!design.mobile.layers.length) design = { ...design, mobile: deriveMobile(design) };
    await logRun({ userId: user.id, projectId: project.id, kind: "revise", status: "ok", usage, ms: Date.now() - started });
    return { design, note: data.changeSummary, source: "ai-revise", mode: "ai" };
  } catch (err) {
    await logRun({ userId: user.id, projectId: project.id, kind: "revise", status: "error", ms: Date.now() - started, error: String((err as Error)?.message ?? err) });
    throw err;
  }
}
