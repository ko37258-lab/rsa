import { assertSameOrigin, authenticate, handle, HttpError, json, problem } from '@/lib/http'
import { consumeRateLimit } from '@/lib/ratelimit'
import { etagFor, parseIfMatch } from '@/lib/report/hash'
import { getReport, REPORT_ID_PATTERN, saveReport } from '@/lib/report/store'
import { validateReport } from '@/lib/report/validate'
import { readJsonBody } from '@/lib/http'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ reportId: string }> }

/** GET /api/reports/{reportId} — 관리자 세션 또는 ko372 수집 토큰 */
export async function GET(req: Request, ctx: Ctx) {
  return handle(async () => {
    const { reportId } = await ctx.params
    const actor = await authenticate(req, { allowMachine: true })
    if (!REPORT_ID_PATTERN.test(reportId)) throw new HttpError(404, 'not_found', '보고서를 찾을 수 없습니다.')
    const db = actor.kind === 'admin' ? actor.supabase : createServiceClient()
    const stored = await getReport(db, reportId)
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
      const out = await saveReport(createServiceClient(), result.report, {
        ifMatch: parseIfMatch(ifMatchRaw),
        ifMatchRaw,
        ifNoneMatchStar: req.headers.get('if-none-match')?.trim() === '*',
        machine: actor.kind === 'machine',
        correction: req.headers.get('x-report-correction') === 'true',
        userId: actor.kind === 'admin' ? actor.user.id : null,
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
