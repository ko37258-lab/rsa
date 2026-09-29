import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireAdminPage } from '@/lib/auth'
import { dotDate, kstDateTime, periodLabel } from '@/lib/dates'
import { count, num } from '@/lib/format'
import { listWeekly, REPORT_ID_PATTERN, yearsWithReports } from '@/lib/report/store'

export const dynamic = 'force-dynamic'
export const metadata = { title: '주간 보고서 목록' }

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { supabase } = await requireAdminPage()
  const sp = await searchParams
  if (sp.go && REPORT_ID_PATTERN.test(sp.go)) redirect(`/reports/${encodeURIComponent(sp.go)}`)
  const year = sp.year && /^\d{4}$/.test(sp.year) ? Number(sp.year) : undefined
  const [rows, years, all] = await Promise.all([listWeekly(supabase, { year }), yearsWithReports(supabase), year ? listWeekly(supabase) : null])
  const everything = all ?? rows

  return (
    <>
      <div className="topline">
        <div>
          <div className="eyebrow">Weekly archive</div>
          <h1>주간 보고서 목록</h1>
          <p className="muted">최신 순서는 보고 기간 종료일 기준입니다. 같은 주차는 하나의 보고서로만 저장되며, 수정 시 이전 내용은 리비전으로 보존됩니다.</p>
        </div>
        <div className="actions no-print">
          <Link className="button primary" href="/admin/import">
            JSON 업로드
          </Link>
        </div>
      </div>

      <div className="card no-print" style={{ marginBottom: 16 }}>
        <div className="controls" style={{ margin: 0 }}>
          <form method="get" className="controls" style={{ margin: 0 }}>
            <label htmlFor="year">연도</label>
            <select id="year" name="year" defaultValue={year ? String(year) : ''}>
              <option value="">전체</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}년
                </option>
              ))}
            </select>
            <button className="button" type="submit">
              적용
            </button>
          </form>
          <form method="get" className="controls" style={{ margin: 0 }}>
            <label htmlFor="go">기간 선택</label>
            <select id="go" name="go" defaultValue="">
              <option value="" disabled>
                주차를 선택하세요
              </option>
              {everything.map((r) => (
                <option key={r.reportId} value={r.reportId}>
                  {r.periodStart && r.periodEnd ? periodLabel({ start: r.periodStart, end: r.periodEnd }, 'dot') : r.reportId}
                </option>
              ))}
            </select>
            <button className="button" type="submit">
              이동
            </button>
          </form>
        </div>
      </div>

      <div className="table-wrap" style={{ background: '#fff' }}>
        <table>
          <caption className="sr-only">주간 보고서 목록{year ? ` ${year}년` : ''}</caption>
          <thead>
            <tr>
              <th scope="col">보고 기간</th>
              <th scope="col">관측일</th>
              <th scope="col">사이트 저장</th>
              <th scope="col" className="num">
                조회수
              </th>
              <th scope="col" className="num">
                유입경로 수
              </th>
              <th scope="col">상태</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="empty">
                  {year ? `${year}년에 저장된 주간 보고서가 없습니다.` : '저장된 주간 보고서가 없습니다. JSON 업로드로 첫 보고서를 저장하세요.'}
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.reportId}>
                <td>
                  <Link href={`/reports/${encodeURIComponent(r.reportId)}`}>
                    {r.periodStart && r.periodEnd ? periodLabel({ start: r.periodStart, end: r.periodEnd }, 'dot') : r.reportId}
                  </Link>
                </td>
                <td>{dotDate(r.observedOn)}</td>
                <td>{kstDateTime(r.updatedAt)}</td>
                <td className="num">{count(r.pageViews)}</td>
                <td className="num">{r.channelCount === null ? '미수집' : `${num(r.channelCount)}개`}</td>
                <td>
                  <span className="badge">저장됨</span>{' '}
                  {r.revisionCount > 1 && <span className="badge warn">수정 {r.revisionCount - 1}회</span>}{' '}
                  {r.saveSource === 'ingest_api' && <span className="badge neutral">자동 저장</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note">최초 종합분석(baseline)은 주간 목록에 포함하지 않고 <Link href="/baseline">최초 종합분석</Link> 화면에서 따로 봅니다.</p>
    </>
  )
}
