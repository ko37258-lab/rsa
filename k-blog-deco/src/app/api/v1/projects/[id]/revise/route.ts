import { z } from "zod";
import { route, requireUser, ok, readJson, ApiError } from "@/lib/api/http";
import { BlogDesign, type BlogDesignT } from "@/lib/design/schema";
import { reviseDesign } from "@/lib/ai/design-ai";
import { assertOwnsAssets, getCurrentVersion, getOwnedProject, publicVersion, saveVersion } from "@/lib/services/projects";

export const maxDuration = 300;

const Body = z.object({
  instruction: z.string().trim().min(1, "수정 요청을 입력해 주세요.").max(2000),
  /** 편집기에서 저장하지 않은 변경이 있으면 그 디자인을 기준으로 수정 */
  design: BlogDesign.optional(),
  referenceAssetIds: z.array(z.string().max(40)).max(4).default([]),
});

/** 자연어로 디자인 수정 ("버튼을 더 둥글게", "레퍼런스처럼 어둡게" 등) → 새 버전 저장 */
export const POST = route(async (req, ctx: RouteContext<"/api/v1/projects/[id]/revise">) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const body = await readJson(req, Body);
  const p = await getOwnedProject(user.id, id);
  await assertOwnsAssets(user.id, body.referenceAssetIds);
  let base: BlogDesignT | undefined = body.design;
  if (!base) {
    const v = await getCurrentVersion(p);
    if (!v) throw new ApiError(409, "no_design", "아직 디자인이 없습니다. 먼저 생성해 주세요.");
    base = JSON.parse(v.design) as BlogDesignT;
  }
  const result = await reviseDesign(user, p, base, body.instruction, body.referenceAssetIds);
  const v = await saveVersion(user.id, p, result.design, result.source, `요청: ${body.instruction}\n→ ${result.note}`);
  return ok({ version: publicVersion(v), design: JSON.parse(v.design), note: result.note, mode: result.mode });
});
