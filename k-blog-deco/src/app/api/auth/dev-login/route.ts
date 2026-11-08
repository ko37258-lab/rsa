import { NextResponse } from "next/server";
import { appUrl, env } from "@/lib/env";
import { onboardingNeeds, upsertUser } from "@/lib/auth/users";

const isReady = (u: Parameters<typeof onboardingNeeds>[0]) => {
  const n = onboardingNeeds(u);
  return !n.terms && !n.member;
};
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";

/** 개발용 로그인 — ALLOW_DEV_LOGIN=true 이고 운영 환경이 아닐 때만 동작 */
export async function POST() {
  if (!env.allowDevLogin) return NextResponse.json({ error: { code: "disabled", message: "비활성화됨" } }, { status: 404 });
  const user = await upsertUser({ provider: "dev", providerId: "local-dev", nickname: "개발용 사용자" });
  const res = NextResponse.redirect(appUrl(isReady(user) ? "/dashboard" : "/welcome?next=%2Fdashboard"), 303);
  res.cookies.set(SESSION_COOKIE, await createSessionToken(user.id), sessionCookieOptions());
  return res;
}
