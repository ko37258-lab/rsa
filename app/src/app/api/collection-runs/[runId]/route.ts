import { authenticate, handle, HttpError, json, readJsonBody } from '@/lib/http'
import { ERROR_CODE, sanitizeSafeMessage } from '@/lib/ops'
import { consumeRateLimit } from '@/lib/ratelimit'
import { createAnonClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ runId: string }> }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * PATCH /api/collection-runs/{runId} — 수집 종료 결과 기록(수집 토큰 전용).
 * succeeded는 해당 주간 보고서가 DB에 실제 저장돼 있을 때만 허용한다.
 * 실패/로그인 필요 기록은 기존 보고서를 건드리지 않는다.
 */
export async function PATCH(req: Request, ctx: Ctx) {
  return handle(async () => {
    const { runId } = await ctx.params
    const actor = await authenticate(req, { allowMachine: true })
    if (actor.kind !== 'machine') throw new HttpError(403, 'forbidden', '수집 토큰 전용 경로입니다.')
    await consumeRateLimit('ingest', 'ko372-runs', 60, 3600)
    if (!UUID.test(runId)) throw new HttpError(404, 'not_found', '수집 이력을 찾을 수 없습니다.')
    const body = (await readJsonBody(req)) as Record<string, unknown>
    const status = body?.status
    if (!['succeeded', 'needs_login', 'failed'].includes(String(status)))
      throw new HttpError(422, 'invalid_status', 'status는 succeeded, needs_login, failed 중 하나여야 합니다.')
    if (body.errorCode != null && !ERROR_CODE.test(String(body.errorCode)))
      throw new HttpError(422, 'invalid_error_code', 'errorCode는 영문 소문자·숫자·밑줄 64자 이하입니다.')

    const { data, error } = await createAnonClient().rpc('blog_finish_run', {
      p_token: actor.token,
      p_run_id: runId,
      p_status: status,
      p_report_id: typeof body.reportId === 'string' ? body.reportId : null,
      p_error_code: (body.errorCode as string | undefined) ?? null,
      p_message: sanitizeSafeMessage(body.safeMessage),
    })
    if (error) {
      switch (error.code) {
        case 'P0002':
          throw new HttpError(404, 'not_found', '수집 이력을 찾을 수 없습니다.')
        case 'P0003':
          throw new HttpError(409, 'run_finished', '이미 종료된 수집 이력입니다.')
        case 'P0004':
          throw new HttpError(422, 'report_mismatch', '성공 기록에는 대상 주간과 같은 보고서 ID가 필요합니다.')
        case 'P0005':
          throw new HttpError(422, 'report_not_saved', '보고서 저장이 확인되지 않아 성공으로 기록할 수 없습니다.')
        case '42501':
          throw new HttpError(401, 'unauthorized', '인증이 필요합니다.')
        default:
          throw new HttpError(500, 'storage_error', '수집 이력 저장에 실패했습니다.')
      }
    }
    const updated = data as { status: string; finished_at: string }
    return json({ ok: true, runId, status: updated.status, finishedAt: updated.finished_at })
  })
}
