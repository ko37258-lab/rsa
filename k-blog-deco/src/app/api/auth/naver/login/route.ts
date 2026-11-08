import { NextResponse, type NextRequest } from "next/server";
import { appUrl, naverLoginConfigured } from "@/lib/env";
import { buildAuthorizeUrl } from "@/lib/auth/naver";
import { OAUTH_STATE_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { randomToken } from "@/lib/ids";
import { safeNextPath } from "@/lib/auth/next-path";

/** 네이버 로그인 시작: state(CSRF 방지 값)를 쿠키에 저장하고 네이버 인증 화면으로 보냅니다. */
export async function GET(req: NextRequest) {
  if (!naverLoginConfigured()) {
    return NextResponse.redirect(appUrl("/?login_error=naver_not_configured"));
  }
  const state = randomToken(18);
  const next = safeNextPath(req.nextUrl.searchParams.get("next"));
  const res = NextResponse.redirect(buildAuthorizeUrl(state));
  res.cookies.set(OAUTH_STATE_COOKIE, Buffer.from(JSON.stringify({ state, next })).toString("base64url"), sessionCookieOptions(600));
  return res;
}
