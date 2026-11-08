import "server-only";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId, randomToken } from "@/lib/ids";

/** 외부 연동용 개인 API 토큰. 원문은 발급 시 한 번만 보여주고 해시만 저장합니다. */
export const TOKEN_PREFIX = "kbd_";

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function issueToken(userId: string, name: string) {
  const raw = TOKEN_PREFIX + randomToken(32);
  const db = await getDb();
  const row = {
    id: newId("tok"),
    userId,
    name: name.slice(0, 60) || "API 토큰",
    prefix: raw.slice(0, 10),
    tokenHash: hashToken(raw),
    lastUsedAt: null,
    createdAt: Date.now(),
  };
  await db.insert(schema.apiTokens).values(row);
  return { token: raw, record: publicToken(row) };
}

export function publicToken(t: typeof schema.apiTokens.$inferSelect) {
  return { id: t.id, name: t.name, prefix: t.prefix, lastUsedAt: t.lastUsedAt, createdAt: t.createdAt };
}

export async function resolveToken(raw: string): Promise<string | null> {
  if (!raw.startsWith(TOKEN_PREFIX)) return null;
  const db = await getDb();
  const row = await db.query.apiTokens.findFirst({ where: eq(schema.apiTokens.tokenHash, hashToken(raw)) });
  if (!row) return null;
  // 마지막 사용 시각은 1분 단위로만 갱신 (쓰기 부하 최소화)
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt > 60_000) {
    await db.update(schema.apiTokens).set({ lastUsedAt: Date.now() }).where(eq(schema.apiTokens.id, row.id));
  }
  return row.userId;
}
