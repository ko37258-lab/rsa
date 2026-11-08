import { z } from "zod";
import { route, requireUser, ok, ApiError } from "@/lib/api/http";
import { BriefSchema, type BriefT } from "@/lib/design/schema";
import { generateDesign } from "@/lib/ai/design-ai";
import {
  getOwnedProject,
  publicProject,
  publicVersion,
  saveVersion,
  setProjectStatus,
  updateProject,
} from "@/lib/services/projects";

export const maxDuration = 300;

const Body = z.object({ brief: BriefSchema.optional() }).default({});

/**
 * AI 디자인 생성. brief 를 함께 보내면 먼저 저장한 뒤 생성합니다.
 * 결과는 새 버전으로 저장되고 현재 디자인이 됩니다.
 */
export const POST = route(async (req, ctx: RouteContext<"/api/v1/projects/[id]/generate">) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const raw = await req.text();
  const body = Body.parse(raw ? JSON.parse(raw) : {});
  let p = await getOwnedProject(user.id, id);
  if (p.status === "generating" && Date.now() - p.updatedAt < 5 * 60_000) {
    throw new ApiError(409, "already_generating", "이미 디자인을 만들고 있습니다. 잠시만 기다려 주세요.");
  }
  if (body.brief) p = await updateProject(user.id, id, { brief: body.brief });
  const brief = JSON.parse(p.brief) as BriefT;

  await setProjectStatus(p.id, "generating");
  try {
    const result = await generateDesign(user, p, brief);
    const v = await saveVersion(user.id, p, result.design, result.source, result.note);
    const fresh = await getOwnedProject(user.id, id);
    return ok({ project: publicProject(fresh), version: publicVersion(v), design: JSON.parse(v.design), note: result.note, mode: result.mode });
  } catch (err) {
    await setProjectStatus(p.id, p.currentVersionId ? "ready" : "error", (err as Error)?.message ?? "생성 실패");
    throw err;
  }
});
