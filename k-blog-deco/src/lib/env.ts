import "server-only";
import { createHmac } from "node:crypto";

/** 서버 환경 변수 접근을 한곳에 모읍니다. */
export const env = {
  appUrl: (
    process.env.APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "") ||
    "http://localhost:3000"
  ).replace(/\/+$/, ""),
  sessionSecret: process.env.SESSION_SECRET || "",
  naverClientId: process.env.NAVER_CLIENT_ID || "",
  naverClientSecret: process.env.NAVER_CLIENT_SECRET || "",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
  aiModel: process.env.AI_MODEL || "claude-opus-5-5",
  dataDir: process.env.DATA_DIR || "./data",
  /** Supabase 연결 풀러 주소. Vercel 의 Supabase 연동을 켜면 POSTGRES_URL 이 자동으로 들어옵니다. */
  databaseUrl: process.env.DATABASE_URL || process.env.POSTGRES_URL || "",
  /** 이미지 저장(Supabase Storage). 둘 다 있으면 Supabase, 없으면 로컬 디스크 */
  supabaseUrl: (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, ""),
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "",
  storageBucket: process.env.SUPABASE_STORAGE_BUCKET || "kblog",
  isProduction: process.env.NODE_ENV === "production",
  allowDevLogin:
    process.env.NODE_ENV !== "production" && process.env.ALLOW_DEV_LOGIN === "true",
  aiRateLimitPerHour: Number(process.env.AI_RATE_LIMIT_PER_HOUR || 30),
};

export const naverLoginConfigured = () =>
  Boolean(env.naverClientId && env.naverClientSecret);

export const aiConfigured = () => Boolean(env.anthropicApiKey);

export function sessionKey(): Uint8Array {
  const secret = env.sessionSecret;
  if (secret.length >= 32) return new TextEncoder().encode(secret);
  // SESSION_SECRET 이 없으면, 이미 서버에만 있는 다른 비밀값(Supabase 연동이 넣어 주는 값)에서
  // 용도 구분 문자열로 파생한 키를 씁니다. 비밀값을 바꾸면 모든 로그인이 풀립니다.
  const base = process.env.SUPABASE_JWT_SECRET || env.supabaseServiceKey || process.env.POSTGRES_PASSWORD || "";
  if (base.length >= 32) return new Uint8Array(createHmac("sha256", base).update("k-blog-deco/session/v1").digest());
  if (env.isProduction) {
    throw new Error("SESSION_SECRET(32자 이상) 또는 Supabase 연동 비밀값이 필요합니다.");
  }
  // 개발 환경 전용 기본값 — 운영에서는 위에서 차단됩니다.
  return new TextEncoder().encode("dev-only-insecure-session-secret-k-blog-deco");
}

/** 리다이렉트용 절대 주소 — 리버스 프록시 뒤에서도 공개 주소(APP_URL)를 쓰도록 */
export const appUrl = (path: string) => new URL(path, env.appUrl);
