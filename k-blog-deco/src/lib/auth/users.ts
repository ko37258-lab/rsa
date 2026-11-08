import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { TERMS_VERSION } from "@/lib/legal";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/ids";

export type PublicUser = {
  id: string;
  name: string;
  email: string | null;
  profileImage: string | null;
  provider: string;
  termsAgreedAt: number | null;
  termsVersion: string | null;
  memberVerifiedAt: number | null;
  createdAt: number;
};

export function toPublicUser(u: typeof schema.users.$inferSelect): PublicUser {
  return {
    id: u.id,
    name: u.nickname || u.name || "사용자",
    email: u.email,
    profileImage: u.profileImage,
    provider: u.provider,
    termsAgreedAt: u.termsAgreedAt,
    termsVersion: u.termsVersion,
    memberVerifiedAt: u.memberVerifiedAt,
    createdAt: u.createdAt,
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
    termsAgreedAt: null,
    termsVersion: null,
    memberVerifiedAt: null,
    memberCodeFails: null,
    memberCodeLastFailAt: null,
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

/** 이 사용자가 아직 거쳐야 할 첫 이용 절차 */
export function onboardingNeeds(u: typeof schema.users.$inferSelect) {
  return {
    terms: u.termsVersion !== TERMS_VERSION || !u.termsAgreedAt,
    member: Boolean(env.memberAccessCode) && !u.memberVerifiedAt,
  };
}

const sha = (v: string) => createHash("sha256").update(v).digest();
const normCode = (v: string) => v.replace(/\s+/g, "").toUpperCase();

/** 회원 코드 확인 — 10분 안에 5번 틀리면 잠시 막습니다. */
export async function verifyMemberCode(u: typeof schema.users.$inferSelect, code: string) {
  const db = await getDb();
  const now = Date.now();
  const recentFails = u.memberCodeLastFailAt && now - u.memberCodeLastFailAt < 10 * 60_000 ? (u.memberCodeFails ?? 0) : 0;
  if (recentFails >= 5) return { ok: false as const, locked: true };
  const good = timingSafeEqual(sha(normCode(code)), sha(normCode(env.memberAccessCode)));
  if (!good) {
    await db.update(schema.users).set({ memberCodeFails: recentFails + 1, memberCodeLastFailAt: now }).where(eq(schema.users.id, u.id));
    return { ok: false as const, locked: false };
  }
  await db.update(schema.users).set({ memberVerifiedAt: now, memberCodeFails: 0, updatedAt: now }).where(eq(schema.users.id, u.id));
  return { ok: true as const };
}

/** 약관 동의 기록 */
export async function agreeTerms(userId: string) {
  const db = await getDb();
  const now = Date.now();
  await db.update(schema.users).set({ termsAgreedAt: now, termsVersion: TERMS_VERSION, updatedAt: now }).where(eq(schema.users.id, userId));
  return now;
}
