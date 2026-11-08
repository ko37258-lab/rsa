import "server-only";
import { env } from "@/lib/env";

/**
 * 네이버 로그인 (OAuth 2.0 Authorization Code) — 공식 문서:
 * https://developers.naver.com/docs/login/api/api.md
 */
const AUTHORIZE_URL = "https://nid.naver.com/oauth2.0/authorize";
const TOKEN_URL = "https://nid.naver.com/oauth2.0/token";
const PROFILE_URL = "https://openapi.naver.com/v1/nid/me";

export const naverRedirectUri = () => `${env.appUrl}/api/auth/naver/callback`;

export function buildAuthorizeUrl(state: string): string {
  const u = new URL(AUTHORIZE_URL);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", env.naverClientId);
  u.searchParams.set("redirect_uri", naverRedirectUri());
  u.searchParams.set("state", state);
  return u.toString();
}

export type NaverProfile = {
  id: string;
  nickname?: string;
  name?: string;
  email?: string;
  profile_image?: string;
};

export async function exchangeCodeForProfile(code: string, state: string): Promise<NaverProfile> {
  const tokenUrl = new URL(TOKEN_URL);
  tokenUrl.searchParams.set("grant_type", "authorization_code");
  tokenUrl.searchParams.set("client_id", env.naverClientId);
  tokenUrl.searchParams.set("client_secret", env.naverClientSecret);
  tokenUrl.searchParams.set("code", code);
  tokenUrl.searchParams.set("state", state);

  const tokenRes = await fetch(tokenUrl, { method: "POST", cache: "no-store" });
  const token = (await tokenRes.json().catch(() => ({}))) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!tokenRes.ok || !token.access_token) {
    throw new Error(`네이버 토큰 발급 실패: ${token.error_description || token.error || tokenRes.status}`);
  }

  const profileRes = await fetch(PROFILE_URL, {
    headers: { Authorization: `Bearer ${token.access_token}` },
    cache: "no-store",
  });
  const profile = (await profileRes.json().catch(() => ({}))) as {
    resultcode?: string;
    message?: string;
    response?: NaverProfile;
  };
  if (!profileRes.ok || profile.resultcode !== "00" || !profile.response?.id) {
    throw new Error(`네이버 프로필 조회 실패: ${profile.message || profileRes.status}`);
  }
  // 네이버 access token 은 저장하지 않습니다 (블로그 디자인 API 가 없어 이후 호출이 불필요).
  return profile.response;
}
