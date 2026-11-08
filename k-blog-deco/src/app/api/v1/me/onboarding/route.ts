import { z } from "zod";
import { route, requireUser, ok, readJson, ApiError } from "@/lib/api/http";
import { agreeTerms, findUser, onboardingNeeds, toPublicUser, verifyMemberCode } from "@/lib/auth/users";
import { TERMS_VERSION } from "@/lib/legal";

const Body = z.object({
  version: z.string().max(20),
  agreeTerms: z.boolean(),
  agreePrivacy: z.boolean(),
  agreeTransfer: z.boolean(),
  memberCode: z.string().max(100).optional(),
});

/**
 * 첫 이용 절차: 이용약관·개인정보 수집·국외 이전 동의 + (설정된 경우) 회원 코드 확인.
 * 이미 끝난 항목은 건너뜁니다.
 */
export const POST = route(async (req) => {
  const user = await requireUser(req, { allowUnagreed: true });
  const body = await readJson(req, Body);
  const needs = onboardingNeeds(user);

  if (needs.terms) {
    if (body.version !== TERMS_VERSION) throw new ApiError(409, "terms_outdated", "약관이 바뀌었습니다. 화면을 새로고침해 주세요.");
    if (!body.agreeTerms || !body.agreePrivacy || !body.agreeTransfer) {
      throw new ApiError(400, "consent_required", "필수 항목에 모두 동의해야 서비스를 이용할 수 있습니다.");
    }
  }
  if (needs.member) {
    if (!body.memberCode?.trim()) throw new ApiError(400, "member_code_required", "회원 코드를 입력해 주세요.");
    const r = await verifyMemberCode(user, body.memberCode);
    if (!r.ok) {
      throw r.locked
        ? new ApiError(429, "member_code_locked", "회원 코드를 여러 번 잘못 입력했습니다. 10분 뒤에 다시 시도해 주세요.")
        : new ApiError(400, "member_code_invalid", "회원 코드가 맞지 않습니다. 강의 공지나 회원 안내에서 코드를 확인해 주세요.");
    }
  }
  if (needs.terms) await agreeTerms(user.id);

  const fresh = (await findUser(user.id))!;
  return ok({ user: toPublicUser(fresh), needs: onboardingNeeds(fresh) });
});
