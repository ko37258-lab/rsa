import { inclusiveDays, isRealIsoDate, weekdayMon0 } from '@/lib/dates'
import { authenticate, handle, HttpError, json, readJsonBody } from '@/lib/http'
import { ERROR_CODE, listRuns, sanitizeSafeMessage } from '@/lib/ops'
import { consumeRateLimit } from '@/lib/ratelimit'
import { createAnonClient } from '@/lib/supabase/server'
import { rpcFail } from '@/lib/report/store'

export const dynamic = 'force-dynamic'

/** GET /api/collection-runs — 관리자 수집 이력 */
export async function GET(req: Request) {
  return handle(async () => {
    const actor = await authenticate(req, { allowMachine: false })
    if (actor.kind !== 'admin') throw new HttpError(403, 'forbidden', '관리자 권한이 없습니다.')
    return json({ ok: true, runs: await listRuns(actor.supabase) })
  })
}

/** POST /api/collection-runs — Aside 수집 시작/실패/로그인 필요 기록(수집 토큰 전용) */
export async function POST(req: Request) {
  return handle(async () => {
    const actor = await authenticate(req, { allowMachine: true })
    if (actor.kind !== 'machine') throw new HttpError(403, 'forbidden', '수집 토큰 전용 경로입니다.')
    await consumeRateLimit('ingest', 'ko372-runs', 60, 3600)
    const body = (await readJsonBody(req)) as Record<string, unknown>
    if (!body || typeof body !== 'object') throw new HttpError(422, 'validation_failed', '본문이 올바르지 않습니다.')
    const { expectedPeriodStart: s, expectedPeriodEnd: e, status, errorCode } = body as Record<string, string>
    if (!isRealIsoDate(s) || !isRealIsoDate(e) || inclusiveDays(s, e) !== 7 || weekdayMon0(s) !== 0)
      throw new HttpError(422, 'invalid_period', '수집 대상은 월~일 7일 주간이어야 합니다.')
    if (!['running', 'needs_login', 'failed'].includes(status)) throw new HttpError(422, 'invalid_status', 'status는 running, needs_login, failed 중 하나여야 합니다.')
    if (errorCode !== undefined && errorCode !== null && !ERROR_CODE.test(String(errorCode)))
      throw new HttpError(422, 'invalid_error_code', 'errorCode는 영문 소문자·숫자·밑줄 64자 이하입니다.')
    const { data, error } = await createAnonClient().rpc('blog_create_run', {
      p_token: actor.token,
      p_start: s,
      p_end: e,
      p_status: status,
      p_error_code: errorCode ?? null,
      p_message: sanitizeSafeMessage(body.safeMessage),
    })
    if (error) rpcFail(error)
    return json({ ok: true, runId: data.run_id, status: data.status, startedAt: data.started_at }, 201)
  })
}
