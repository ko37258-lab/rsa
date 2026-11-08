import { and, eq } from "drizzle-orm";
import { route, requireUser, ok, notFound } from "@/lib/api/http";
import { getDb, schema } from "@/lib/db";

export const DELETE = route(async (req, ctx: RouteContext<"/api/v1/tokens/[id]">) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const db = await getDb();
  const t = await db.query.apiTokens.findFirst({ where: and(eq(schema.apiTokens.id, id), eq(schema.apiTokens.userId, user.id)) });
  if (!t) throw notFound("토큰");
  await db.delete(schema.apiTokens).where(eq(schema.apiTokens.id, t.id));
  return ok({ deleted: true });
});
