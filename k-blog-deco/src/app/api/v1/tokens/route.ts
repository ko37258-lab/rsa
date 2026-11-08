import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { route, requireUser, ok, readJson, ApiError } from "@/lib/api/http";
import { getDb, schema } from "@/lib/db";
import { issueToken, publicToken } from "@/lib/auth/tokens";

/** 개인 API 토큰 목록 (토큰 원문은 다시 볼 수 없음) */
export const GET = route(async (req) => {
  const user = await requireUser(req);
  const db = await getDb();
  const rows = await db.query.apiTokens.findMany({ where: eq(schema.apiTokens.userId, user.id), orderBy: desc(schema.apiTokens.createdAt) });
  return ok({ tokens: rows.map(publicToken) });
});

/** 토큰 발급 — 응답의 token 값은 이때 한 번만 확인할 수 있습니다. */
export const POST = route(async (req) => {
  const user = await requireUser(req);
  if (req.headers.get("authorization")) {
    throw new ApiError(403, "session_required", "토큰 발급은 웹에서 로그인한 상태로만 할 수 있습니다.");
  }
  const body = await readJson(req, z.object({ name: z.string().trim().min(1).max(60) }));
  const db = await getDb();
  const existing = await db.query.apiTokens.findMany({ where: eq(schema.apiTokens.userId, user.id), columns: { id: true } });
  if (existing.length >= 10) throw new ApiError(400, "too_many_tokens", "토큰은 최대 10개까지 만들 수 있습니다.");
  const { token, record } = await issueToken(user.id, body.name);
  return ok({ token, record }, 201);
});
