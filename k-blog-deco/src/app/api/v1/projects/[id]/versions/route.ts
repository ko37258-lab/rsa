import { route, requireUser, ok } from "@/lib/api/http";
import { getOwnedProject, listVersions, publicVersion } from "@/lib/services/projects";

/** 버전 기록 (최신순) */
export const GET = route(async (req, ctx: RouteContext<"/api/v1/projects/[id]/versions">) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const p = await getOwnedProject(user.id, id);
  const rows = await listVersions(p.id);
  return ok({ currentVersionId: p.currentVersionId, versions: rows.map((v) => publicVersion(v)) });
});
