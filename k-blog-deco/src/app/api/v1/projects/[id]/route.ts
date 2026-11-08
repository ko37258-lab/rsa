import { z } from "zod";
import { route, requireUser, ok, readJson } from "@/lib/api/http";
import { BriefSchema } from "@/lib/design/schema";
import {
  deleteProject,
  getCurrentVersion,
  getOwnedProject,
  listProjectAssets,
  publicAsset,
  publicProject,
  publicVersion,
  updateProject,
} from "@/lib/services/projects";

/** 프로젝트 상세: 브리프 + 현재 디자인 + 연결된 이미지 */
export const GET = route(async (req, ctx: RouteContext<"/api/v1/projects/[id]">) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const p = await getOwnedProject(user.id, id);
  const v = await getCurrentVersion(p);
  const assets = await listProjectAssets(user.id, p.id);
  return ok({
    project: publicProject(p),
    version: v ? publicVersion(v) : null,
    design: v ? JSON.parse(v.design) : null,
    assets: assets.map(publicAsset),
  });
});

const PatchBody = z.object({ title: z.string().max(60).optional(), brief: BriefSchema.optional() });

export const PATCH = route(async (req, ctx: RouteContext<"/api/v1/projects/[id]">) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const body = await readJson(req, PatchBody);
  const p = await updateProject(user.id, id, body);
  return ok({ project: publicProject(p) });
});

export const DELETE = route(async (req, ctx: RouteContext<"/api/v1/projects/[id]">) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  await deleteProject(user.id, id);
  return ok({ deleted: true });
});
