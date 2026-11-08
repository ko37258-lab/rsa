import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { route, requireUser, ok, readJson, notFound } from "@/lib/api/http";
import { getDb, schema } from "@/lib/db";
import { deleteFile } from "@/lib/storage";
import { publicAsset } from "@/lib/services/projects";

async function owned(userId: string, id: string) {
  const db = await getDb();
  const a = await db.query.assets.findFirst({ where: and(eq(schema.assets.id, id), eq(schema.assets.userId, userId)) });
  if (!a) throw notFound("이미지");
  return a;
}

export const PATCH = route(async (req, ctx: RouteContext<"/api/v1/assets/[id]">) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const a = await owned(user.id, id);
  const body = await readJson(req, z.object({ label: z.string().max(80) }));
  const db = await getDb();
  await db.update(schema.assets).set({ label: body.label || null }).where(eq(schema.assets.id, a.id));
  return ok({ asset: publicAsset({ ...a, label: body.label || null }) });
});

export const DELETE = route(async (req, ctx: RouteContext<"/api/v1/assets/[id]">) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const a = await owned(user.id, id);
  const db = await getDb();
  await db.delete(schema.assets).where(eq(schema.assets.id, a.id));
  await deleteFile(a.storageKey);
  return ok({ deleted: true });
});
