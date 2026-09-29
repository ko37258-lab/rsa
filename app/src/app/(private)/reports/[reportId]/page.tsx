import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { PrintButton } from '@/components/PrintButton'
import { WeeklyReportView } from '@/components/WeeklyReportView'
import { requireAdminPage } from '@/lib/auth'
import { kstDateTime, periodLabel } from '@/lib/dates'
import { diffKeyFields } from '@/lib/report/diff'
import { getReport, getRevision, listRevisions, neighbours } from '@/lib/report/store'
import type { WeeklyReport } from '@/lib/report/types'

export const dynamic = 'force-dynamic'
export const metadata = { title: '주간 보고서' }

const SOURCE_LABEL: Record<string, string> = { admin_upload: '관리자 업로드', ingest_api: '자동 저장(API)' }

export default async function ReportDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ reportId: string }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const { supabase } = await requireAdminPage()
  const { reportId } = await params
  const sp = await searchParams
  const stored = await getReport(supabase, reportId)
  if (!stored) notFound()
  if (stored.reportType === 'baseline') redirect(`/baseline?reportId=${encodeURIComponent(reportId)}`)

  const revisions = await listRevisions(supabase, reportId)
  const revParam = sp.rev && /^\d{1,18}$/.test(sp.rev) ? Number(sp.rev) : null
  const latestRevision = revisions[0]
  let payload = stored.payload as WeeklyReport
  let viewingOld: { revisionId: number; savedAt: string } | null = null
  if (revParam !== null && revParam !== latestRevision?.revisionId) {
    const rev = await getRevision(supabase, reportId, revParam)
    if (!rev) notFound()
    payload = rev.payload as WeeklyReport
    viewingOld = { revisionId: rev.revision_id, savedAt: rev.saved_at }
  }
  const nav = await neighbours(supabase, stored.periodStart!)
  const changes = viewingOld ? diffKeyFields(payload, stored.payload) : []
  const exportBase = `/api/reports/${encodeURIComponent(reportId)}/export${viewingOld ? `?revision=${viewingOld.revisionId}` : ''}`

  return (
    <>
      <div className="topline">
        <div>
          <div className="eyebrow">Weekly report</div>
          <h1 id="report-title">주간 보고서 {periodLabel(payload.period, 'dot')}</h1>
          <p className="muted">{payload.blogName}</p>
        </div>
        <div className="actions no-print">
          <PrintButton />
          <Link className="button" href="/reports">
            목록
          </Link>
        </div>
      </div>
      <div className="pager no-print">
        {nav.prev ? (
          <Link className="button" href={`/reports/${encodeURIComponent(nav.prev)}`} rel="prev">
            ← 이전 주
          </Link>
        ) : (
          <span className="button" aria-disabled="true">
            ← 이전 주 없음
          </span>
        )}
        {nav.next ? (
          <Link className="button" href={`/reports/${encodeURIComponent(nav.next)}`} rel="next">
            다음 주 →
          </Link>
        ) : (
          <span className="button" aria-disabled="true">
            다음 주 없음 →
          </span>
        )}
      </div>

      {viewingOld && (
        <div className="alert warn" role="status">
          이전 리비전 #{viewingOld.revisionId}({kstDateTime(viewingOld.savedAt)} 저장)을 보고 있습니다. 현재 저장본과 다른 핵심 필드 {changes.length}개.{' '}
          <Link href={`/reports/${encodeURIComponent(reportId)}`}>현재 저장본 보기</Link>
        </div>
      )}

      <WeeklyReportView report={payload} savedAt={viewingOld?.savedAt ?? stored.updatedAt} createdAt={stored.createdAt} exportBase={exportBase} />

      <section className="section" aria-labelledby="rev-h">
        <div className="section-head">
          <div>
            <div className="eyebrow">History</div>
            <h2 id="rev-h">수정 이력</h2>
            <p>저장 당시 보고서를 그대로 보존합니다. 동일 내용 재업로드는 새 리비전을 만들지 않습니다.</p>
          </div>
        </div>
        <div className="table-wrap" style={{ background: '#fff' }}>
          <table>
            <caption className="sr-only">리비전 목록</caption>
            <thead>
              <tr>
                <th scope="col">리비전</th>
                <th scope="col">저장 시각</th>
                <th scope="col">저장 경로</th>
                <th scope="col">내용 해시</th>
                <th scope="col">보기</th>
              </tr>
            </thead>
            <tbody>
              {revisions.map((rv, i) => (
                <tr key={rv.revisionId}>
                  <td>
                    #{rv.revisionId} {i === 0 && <span className="badge">현재</span>}
                  </td>
                  <td>{kstDateTime(rv.savedAt)}</td>
                  <td>{SOURCE_LABEL[rv.saveSource] ?? rv.saveSource}</td>
                  <td>
                    <span className="mono">{rv.contentHash.slice(0, 12)}…</span>
                  </td>
                  <td>
                    {i === 0 ? (
                      <Link href={`/reports/${encodeURIComponent(reportId)}`}>현재 저장본</Link>
                    ) : (
                      <Link href={`/reports/${encodeURIComponent(reportId)}?rev=${rv.revisionId}`}>이 리비전 보기</Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {viewingOld && changes.length > 0 && (
          <div className="card" style={{ marginTop: 16 }}>
            <h3>이 리비전 → 현재 저장본 핵심 변경</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">필드</th>
                    <th scope="col">이 리비전</th>
                    <th scope="col">현재</th>
                  </tr>
                </thead>
                <tbody>
                  {changes.map((c) => (
                    <tr key={c.field}>
                      <td className="mono">{c.field}</td>
                      <td>{c.before}</td>
                      <td>{c.after}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </>
  )
}
