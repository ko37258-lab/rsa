import { authenticate, handle, HttpError, json, readJsonBody } from '@/lib/http'
import { ERROR_CODE, sanitizeSafeMessage } from '@/lib/ops'
import { consumeRateLimit } from '@/lib/ratelimit'
import { createServiceClient } from '@/lib/supabase/server'

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

    const db = createServiceClient()
    const { data: run, error } = await db.from('collection_runs').select('run_id, status, expected_period_start, expected_period_end').eq('run_id', runId).maybeSingle()
    if (error) throw new HttpError(500, 'storage_error', '수집 이력 조회에 실패했습니다.')
    if (!run) throw new HttpError(404, 'not_found', '수집 이력을 찾을 수 없습니다.')
    if (run.status !== 'running') throw new HttpError(409, 'run_finished', '이미 종료된 수집 이력입니다.')

    let reportId: string | null = null
    if (status === 'succeeded') {
      reportId = typeof body.reportId === 'string' ? body.reportId : null
      const expectedId = `ko372_${run.expected_period_start}_${run.expected_period_end}`
      if (reportId !== expectedId) throw new HttpError(422, 'report_mismatch', `성공 기록에는 저장된 보고서 ${expectedId}가 필요합니다.`)
      const { data: rep } = await db.from('blog_reports').select('report_id').eq('report_id', reportId).maybeSingle()
      if (!rep) throw new HttpError(422, 'report_not_saved', '보고서 저장이 확인되지 않아 성공으로 기록할 수 없습니다.')
    }

    const { data: updated, error: upErr } = await db
      .from('collection_runs')
      .update({
        status,
        report_id: reportId,
        error_code: status === 'succeeded' ? null : ((body.errorCode as string | undefined) ?? null),
        safe_message: status === 'succeeded' ? null : sanitizeSafeMessage(body.safeMessage),
        finished_at: new Date().toISOString(),
      })
      .eq('run_id', runId)
      .eq('status', 'running')
      .select('run_id, status, finished_at')
    if (upErr) throw new HttpError(500, 'storage_error', '수집 이력 저장에 실패했습니다.')
    if (!updated?.length) throw new HttpError(409, 'run_finished', '이미 종료된 수집 이력입니다.')
    return json({ ok: true, runId, status: updated[0].status, finishedAt: updated[0].finished_at })
  })
}
