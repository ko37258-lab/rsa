import { z } from "zod";
import { route, requireUser, ok, readJson } from "@/lib/api/http";
import { BlogDesign } from "@/lib/design/schema";
import { getCurrentVersion, getOwnedProject, publicVersion, saveVersion } from "@/lib/services/projects";

/** 현재 디자인 JSON */
export const GET = route(async (req, ctx: RouteContext<"/api/v1/projects/[id]/design">) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const v = await getCurrentVersion(await getOwnedProject(user.id, id));
  return ok({ version: v ? publicVersion(v) : null, design: v ? JSON.parse(v.design) : null });
});

const Body = z.object({ design: BlogDesign, note: z.string().max(300).optional() });

/** 직접 편집한 디자인 저장 → 새 버전 (값은 서버에서 안전 범위로 보정) */
export const PUT = route(async (req, ctx: RouteContext<"/api/v1/projects/[id]/design">) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const body = await readJson(req, Body);
  const p = await getOwnedProject(user.id, id);
  const v = await saveVersion(user.id, p, body.design, "manual", body.note ?? "직접 편집");
  return ok({ version: publicVersion(v), design: JSON.parse(v.design) });
});
