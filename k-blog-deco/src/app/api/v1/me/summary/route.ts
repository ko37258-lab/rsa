import { route, requireUser, ok } from "@/lib/api/http";
import { accountSummary } from "@/lib/services/account";

/** 계정에 저장된 데이터 요약 (계정 화면용) */
export const GET = route(async (req) => {
  const user = await requireUser(req);
  return ok(await accountSummary(user.id));
});
