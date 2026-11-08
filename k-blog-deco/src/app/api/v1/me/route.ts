import { route, requireUser, ok } from "@/lib/api/http";
import { onboardingNeeds, toPublicUser } from "@/lib/auth/users";
import { deleteUserCompletely } from "@/lib/services/account";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { TERMS_VERSION } from "@/lib/legal";

/** 내 정보 (약관 동의 전에도 조회 가능 — 동의 화면에서 사용) */
export const GET = route(async (req) => {
  const user = await requireUser(req, { allowUnagreed: true });
  return ok({ user: toPublicUser(user), termsVersion: TERMS_VERSION, needs: onboardingNeeds(user) });
});

/** 회원 탈퇴: 프로젝트·디자인·이미지·토큰·사용 기록을 모두 지우고 로그아웃 */
export const DELETE = route(async (req) => {
  const user = await requireUser(req, { allowUnagreed: true });
  if (req.headers.get("authorization")) {
    return ok({ error: { code: "session_required", message: "회원 탈퇴는 웹에서 로그인한 상태로만 할 수 있습니다." } }, 403);
  }
  await deleteUserCompletely(user.id);
  const res = ok({ deleted: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
});
