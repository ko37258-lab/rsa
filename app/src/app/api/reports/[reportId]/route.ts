import { assertSameOrigin, authenticate, handle, HttpError, json, problem } from '@/lib/http'
import { consumeRateLimit } from '@/lib/ratelimit'
import { etagFor, parseIfMatch } from '@/lib/report/hash'
import { getReport, REPORT_ID_PATTERN, rpcFail, saveReport } from '@/lib/report/store'
import { validateReport } from '@/lib/report/validate'
import { readJsonBody } from '@/lib/http'
import { createAnonClient } from '@/lib/supabase/server'
import type { Report } from '@/lib/report/types'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ reportId: string }> }

/** GET /api/reports/{reportId} — 관리자 세션 또는 ko372 수집 토큰 */
export async function GET(req: Request, ctx: Ctx) {
  return handle(async () => {
    const { reportId } = await ctx.params
    const actor = await authenticate(req, { allowMachine: true })
    if (!REPORT_ID_PATTERN.test(reportId)) throw new HttpError(404, 'not_found', '보고서를 찾을 수 없습니다.')
    let stored: Awaited<ReturnType<typeof getReport>>
    if (actor.kind === 'admin') stored = await getReport(actor.supabase, reportId)
    else {
      const { data, error } = await createAnonClient().rpc('blog_get_report', { p_report_id: reportId, p_token: actor.token })
      if (error) rpcFail(error)
      const r = data as Record<string, string> | null
      stored = r
        ? {
            reportId: r.report_id,
            reportType: r.report_type as 'weekly' | 'baseline',
            observedOn: r.observed_on,
            periodStart: r.period_start ?? null,
            periodEnd: r.period_end ?? null,
            contentHash: r.content_hash,
            saveSource: r.save_source as 'admin_upload' | 'ingest_api',
            createdAt: r.created_at,
            updatedAt: r.updated_at,
            payload: (r as unknown as { payload: Report }).payload,
          }
        : null
    }
    if (!stored) throw new HttpError(404, 'not_found', '보고서를 찾을 수 없습니다.')
    const { payload, ...meta } = stored
    return json({ ok: true, report: meta, payload }, 200, { ETag: etagFor(stored.contentHash) })
  })
}

/** PUT /api/reports/{reportId} — 본문은 contracts/report.schema.json 을 만족하는 보고서 자체 */
export async function PUT(req: Request, ctx: Ctx) {
  return handle(async () => {
    const { reportId } = await ctx.params
    const actor = await authenticate(req, { allowMachine: true })
    if (actor.kind === 'admin') assertSameOrigin(req)
    else await consumeRateLimit('ingest', 'ko372', 60, 3600)

    if (!REPORT_ID_PATTERN.test(reportId)) throw new HttpError(422, 'invalid_report_id', '허용되지 않는 reportId 형식입니다.')
    const body = await readJsonBody(req)
    const result = validateReport(body)
    if (!result.ok || !result.report) return problem(422, 'validation_failed', '보고서 검증에 실패했습니다.', { errors: result.errors, warnings: result.warnings })
    if (result.report.reportId !== reportId)
      return problem(422, 'report_id_mismatch', 'URL의 reportId와 본문의 reportId가 다릅니다.', { errors: [{ path: '/reportId', message: 'URL과 본문 ID 불일치' }] })

    const ifMatchRaw = req.headers.get('if-match')
    try {
      const out = await saveReport(actor.kind === 'admin' ? actor.supabase : createAnonClient(), result.report, {
        ifMatch: parseIfMatch(ifMatchRaw),
        ifMatchRaw,
        ifNoneMatchStar: req.headers.get('if-none-match')?.trim() === '*',
        machine: actor.kind === 'machine',
        correction: req.headers.get('x-report-correction') === 'true',
        token: actor.kind === 'machine' ? actor.token : null,
      })
      return json({ ...out.body, warnings: result.warnings }, out.status, { ETag: out.etag, Location: `/api/reports/${encodeURIComponent(reportId)}` })
    } catch (e) {
      if (e instanceof HttpError && 'currentEtag' in e) {
        const current = (e as HttpError & { currentEtag: string | null }).currentEtag
        return problem(e.status, e.code, e.message, current ? { currentEtag: current } : {})
      }
      throw e
    }
  })
}
