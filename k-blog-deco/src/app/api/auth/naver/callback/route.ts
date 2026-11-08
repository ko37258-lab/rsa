import { NextResponse, type NextRequest } from "next/server";
import { exchangeCodeForProfile } from "@/lib/auth/naver";
import { onboardingNeeds, upsertUser } from "@/lib/auth/users";

const isReady = (u: Parameters<typeof onboardingNeeds>[0]) => {
  const n = onboardingNeeds(u);
  return !n.terms && !n.member;
};
import { createSessionToken, OAUTH_STATE_COOKIE, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { safeNextPath } from "@/lib/auth/next-path";
import { appUrl } from "@/lib/env";

/** 네이버 로그인 콜백: state 검증 → 토큰 교환 → 프로필 조회 → 회원 생성/갱신 → 세션 발급 */
export async function GET(req: NextRequest) {
  const fail = (code: string) => {
    const res = NextResponse.redirect(appUrl(`/?login_error=${code}`));
    res.cookies.delete(OAUTH_STATE_COOKIE);
    return res;
  };

  const sp = req.nextUrl.searchParams;
  if (sp.get("error")) return fail(sp.get("error") === "access_denied" ? "cancelled" : "naver_error");

  let saved: { state?: string; next?: string } = {};
  try {
    saved = JSON.parse(Buffer.from(req.cookies.get(OAUTH_STATE_COOKIE)?.value ?? "", "base64url").toString());
  } catch {}
  const code = sp.get("code");
  const state = sp.get("state");
  if (!code || !state || !saved.state || saved.state !== state) return fail("invalid_state");

  try {
    const profile = await exchangeCodeForProfile(code, state);
    const user = await upsertUser({
      provider: "naver",
      providerId: profile.id,
      name: profile.name ?? null,
      nickname: profile.nickname ?? null,
      email: profile.email ?? null,
      profileImage: profile.profile_image ?? null,
    });
    const next = safeNextPath(saved.next);
    // 첫 로그인(또는 약관 개정 후)이면 동의 화면을 먼저 보여 줍니다.
    const dest = isReady(user) ? next : `/welcome?next=${encodeURIComponent(next)}`;
    const res = NextResponse.redirect(appUrl(dest));
    res.cookies.set(SESSION_COOKIE, await createSessionToken(user.id), sessionCookieOptions());
    res.cookies.delete(OAUTH_STATE_COOKIE);
    return res;
  } catch (err) {
    console.error("[naver-callback]", err);
    return fail("naver_failed");
  }
}
