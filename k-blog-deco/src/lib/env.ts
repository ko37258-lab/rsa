import "server-only";

/** 서버 환경 변수 접근을 한곳에 모읍니다. */
export const env = {
  appUrl: (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, ""),
  sessionSecret: process.env.SESSION_SECRET || "",
  naverClientId: process.env.NAVER_CLIENT_ID || "",
  naverClientSecret: process.env.NAVER_CLIENT_SECRET || "",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
  aiModel: process.env.AI_MODEL || "claude-opus-5-5",
  dataDir: process.env.DATA_DIR || "./data",
  databaseUrl: process.env.DATABASE_URL || "",
  databaseAuthToken: process.env.DATABASE_AUTH_TOKEN || "",
  isProduction: process.env.NODE_ENV === "production",
  allowDevLogin:
    process.env.NODE_ENV !== "production" && process.env.ALLOW_DEV_LOGIN === "true",
  aiRateLimitPerHour: Number(process.env.AI_RATE_LIMIT_PER_HOUR || 30),
};

export const naverLoginConfigured = () =>
  Boolean(env.naverClientId && env.naverClientSecret);

export const aiConfigured = () => Boolean(env.anthropicApiKey);

export function sessionKey(): Uint8Array {
  let secret = env.sessionSecret;
  if (secret.length < 32) {
    if (env.isProduction) {
      throw new Error("SESSION_SECRET 은 32자 이상이어야 합니다.");
    }
    // 개발 환경 전용 기본값 — 운영에서는 위에서 차단됩니다.
    secret = "dev-only-insecure-session-secret-k-blog-deco";
  }
  return new TextEncoder().encode(secret);
}

/** 리다이렉트용 절대 주소 — 리버스 프록시 뒤에서도 공개 주소(APP_URL)를 쓰도록 */
export const appUrl = (path: string) => new URL(path, env.appUrl);
