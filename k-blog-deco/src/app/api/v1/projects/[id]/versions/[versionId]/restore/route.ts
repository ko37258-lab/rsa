import { route, requireUser, ok } from "@/lib/api/http";
import { getOwnedProject, getVersion, publicVersion, saveVersion } from "@/lib/services/projects";

/** 예전 버전으로 되돌리기 — 기록을 지우지 않고 그 내용을 새 버전으로 복사합니다. */
export const POST = route(async (req, ctx: RouteContext<"/api/v1/projects/[id]/versions/[versionId]/restore">) => {
  const user = await requireUser(req);
  const { id, versionId } = await ctx.params;
  const p = await getOwnedProject(user.id, id);
  const old = await getVersion(p.id, versionId);
  const v = await saveVersion(user.id, p, JSON.parse(old.design), "restore", `v${old.versionNo} 로 되돌림`);
  return ok({ version: publicVersion(v), design: JSON.parse(v.design) });
});
