import { assertSameOrigin, authenticate, handle, HttpError, json, readJsonBody } from '@/lib/http'
import { changedTopLevelSections, diffKeyFields } from '@/lib/report/diff'
import { contentHash, etagFor } from '@/lib/report/hash'
import { getReport } from '@/lib/report/store'
import { validateReport } from '@/lib/report/validate'
import { summarizeReport } from '@/lib/report/summary'

export const dynamic = 'force-dynamic'

/**
 * POST /api/import/preview — 관리자 업로드 미리보기(저장하지 않음).
 * 검증 결과, 기존 저장본과의 관계(new/unchanged/changed), 핵심 필드 변경을 돌려준다.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const actor = await authenticate(req, { allowMachine: false })
    if (actor.kind !== 'admin') throw new HttpError(403, 'forbidden', '관리자 권한이 없습니다.')
    assertSameOrigin(req)
    const body = await readJsonBody(req)
    const result = validateReport(body)
    if (!result.ok || !result.report) return json({ ok: false, stage: 'validation', errors: result.errors, warnings: result.warnings }, 422)

    const report = result.report
    const hash = contentHash(report)
    const existing = await getReport(actor.supabase, report.reportId)
    const base = { ok: true, reportId: report.reportId, reportType: report.reportType, contentHash: hash, warnings: result.warnings, summary: summarizeReport(report) }
    if (!existing) return json({ ...base, relation: 'new' })
    if (existing.contentHash === hash) return json({ ...base, relation: 'unchanged', savedAt: existing.updatedAt })
    return json({
      ...base,
      relation: 'changed',
      currentEtag: etagFor(existing.contentHash),
      savedAt: existing.updatedAt,
      changes: diffKeyFields(existing.payload, report),
      changedSections: changedTopLevelSections(existing.payload, report),
    })
  })
}
