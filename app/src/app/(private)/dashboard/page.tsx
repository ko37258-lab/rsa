import Link from 'next/link'
import { WeeklyTrend } from '@/components/charts'
import { StatusPanel } from '@/components/StatusPanel'
import { WeeklyReportView } from '@/components/WeeklyReportView'
import { requireAdminPage } from '@/lib/auth'
import { periodLabel } from '@/lib/dates'
import { getIntegrationSettings, listRuns } from '@/lib/ops'
import { latestWeekly, weeklyMetricsSeries } from '@/lib/report/store'
import { buildWeeklySlots } from '@/lib/report/trend'
import { deriveUpdateStatus } from '@/lib/status'

export const dynamic = 'force-dynamic'
export const metadata = { title: '주간 대시보드' }

export default async function DashboardPage() {
  const { supabase } = await requireAdminPage()
  const [latest, series, runs, settings] = await Promise.all([latestWeekly(supabase), weeklyMetricsSeries(supabase), listRuns(supabase, 20), getIntegrationSettings(supabase)])
  const status = deriveUpdateStatus({ settings, runs, latestWeeklyEnd: latest?.periodEnd ?? null })
  const pvSlots = buildWeeklySlots(series, 'pageViews')
  const uvSlots = buildWeeklySlots(series, 'uniqueVisitors')

  return (
    <>
      <div className="topline">
        <div>
          <div className="eyebrow">MR.K performance review</div>
          <h1 id="report-title">주간 대시보드</h1>
          <p className="muted">
            {latest ? `${latest.payload.blogName} · 최근 저장 주간 ${periodLabel(latest.payload.period, 'dot')}` : '저장된 주간 보고서가 없습니다.'}
          </p>
        </div>
        <div className="actions no-print">
          {latest && (
            <Link className="button" href={`/reports/${encodeURIComponent(latest.reportId)}`}>
              보고서 상세·인쇄
            </Link>
          )}
          <Link className="button" href="/reports">
            전체 주간 목록
          </Link>
          <Link className="button primary" href="/admin/import">
            JSON 업로드
          </Link>
        </div>
      </div>

      <div className="grid wide" style={{ marginBottom: 8 }}>
        <div className="card">
          <h3>누적 주간 추이 · 조회수</h3>
          {pvSlots.length ? (
            <>
              <WeeklyTrend id="trend-pv" title="주간 조회수 추이" points={pvSlots} />
              {pvSlots.length === 1 && <p className="note">저장된 주간이 1개뿐입니다. 다음 주간 보고서가 쌓이면 추이가 이어집니다(가짜 예시 데이터는 넣지 않습니다).</p>}
            </>
          ) : (
            <p className="empty">저장된 주간 보고서가 없습니다.</p>
          )}
        </div>
        <StatusPanel status={status} latestPeriod={latest?.payload.period ?? null} />
      </div>
      {uvSlots.length > 1 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3>누적 주간 추이 · 순방문자(주간 중복 제거)</h3>
          <WeeklyTrend id="trend-uv" title="주간 순방문자 추이" points={uvSlots} unit="명" />
        </div>
      )}

      {latest ? (
        <div style={{ marginTop: 24 }}>
          <WeeklyReportView
            report={latest.payload}
            savedAt={latest.updatedAt}
            createdAt={latest.createdAt}
            exportBase={`/api/reports/${encodeURIComponent(latest.reportId)}/export`}
          />
        </div>
      ) : (
        <div className="card empty" style={{ marginTop: 24 }}>
          <p>아직 데이터베이스에 저장된 주간 보고서가 없습니다.</p>
          <p className="note">관리자 업로드 화면에서 실제 주간 보고서 JSON을 올리면 여기에 표시됩니다.</p>
          <Link className="button primary" href="/admin/import">
            JSON 업로드로 이동
          </Link>
        </div>
      )}
    </>
  )
}
