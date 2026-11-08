import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/ids";

export type PublicUser = {
  id: string;
  name: string;
  email: string | null;
  profileImage: string | null;
  provider: string;
};

export function toPublicUser(u: typeof schema.users.$inferSelect): PublicUser {
  return {
    id: u.id,
    name: u.nickname || u.name || "사용자",
    email: u.email,
    profileImage: u.profileImage,
    provider: u.provider,
  };
}

export async function upsertUser(input: {
  provider: "naver" | "dev";
  providerId: string;
  name?: string | null;
  nickname?: string | null;
  email?: string | null;
  profileImage?: string | null;
}) {
  const db = await getDb();
  const now = Date.now();
  const existing = await db.query.users.findFirst({
    where: and(eq(schema.users.provider, input.provider), eq(schema.users.providerId, input.providerId)),
  });
  if (existing) {
    await db
      .update(schema.users)
      .set({
        name: input.name ?? existing.name,
        nickname: input.nickname ?? existing.nickname,
        email: input.email ?? existing.email,
        profileImage: input.profileImage ?? existing.profileImage,
        updatedAt: now,
      })
      .where(eq(schema.users.id, existing.id));
    return { ...existing, ...input, updatedAt: now } as typeof existing;
  }
  const row = {
    id: newId("usr"),
    provider: input.provider,
    providerId: input.providerId,
    name: input.name ?? null,
    nickname: input.nickname ?? null,
    email: input.email ?? null,
    profileImage: input.profileImage ?? null,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(schema.users).values(row);
  return row;
}

export async function findUser(id: string) {
  const db = await getDb();
  return db.query.users.findFirst({ where: eq(schema.users.id, id) });
}
