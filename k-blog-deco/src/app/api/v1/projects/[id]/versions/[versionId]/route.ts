import { route, requireUser, ok } from "@/lib/api/http";
import { getOwnedProject, getVersion, publicVersion } from "@/lib/services/projects";

export const GET = route(async (req, ctx: RouteContext<"/api/v1/projects/[id]/versions/[versionId]">) => {
  const user = await requireUser(req);
  const { id, versionId } = await ctx.params;
  const p = await getOwnedProject(user.id, id);
  return ok({ version: publicVersion(await getVersion(p.id, versionId), true) });
});
