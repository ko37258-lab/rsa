import { IntegrationForm } from '@/components/IntegrationForm'
import { StatusPanel } from '@/components/StatusPanel'
import { requireAdminPage } from '@/lib/auth'
import { dotDate, kstDateTime, periodLabel } from '@/lib/dates'
import { readEnv } from '@/lib/env'
import { getIntegrationSettings, listRuns } from '@/lib/ops'
import { latestWeekly } from '@/lib/report/store'
import { deriveUpdateStatus, type RunStatus } from '@/lib/status'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Aside 연결 상태' }

const RUN_LABEL: Record<RunStatus, string> = { running: '진행 중', succeeded: '성공', needs_login: '네이버 로그인 필요', failed: '실패' }

export default async function IntegrationPage() {
  const { supabase } = await requireAdminPage()
  const [runs, settings, latest] = await Promise.all([listRuns(supabase, 50), getIntegrationSettings(supabase), latestWeekly(supabase)])
  const status = deriveUpdateStatus({ settings, runs, latestWeeklyEnd: latest?.periodEnd ?? null })
  const env = readEnv()
  const tokenConfigured = env.ok && !!env.env.ingestToken
  const origin = env.ok ? env.env.appOrigin : '(사이트 주소)'

  return (
    <>
      <div className="topline">
        <div>
          <div className="eyebrow">Automation</div>
          <h1>Aside 연결 상태</h1>
          <p className="muted">자동 수집은 사이트 밖의 Aside 작업입니다. 이 사이트는 네이버에 로그인하거나 쿠키를 저장하거나 수집 크론·AI 호출을 실행하지 않습니다.</p>
        </div>
      </div>

      <div className="grid wide">
        <StatusPanel status={status} latestPeriod={latest?.payload.period ?? null} />
        <div className="card">
          <h3>연결 등록</h3>
          <dl className="meta" style={{ marginBottom: 12 }}>
            <dt>연결 상태</dt>
            <dd>{settings?.aside_connected ? `연결 등록됨 (${kstDateTime(settings.connected_at)})` : '자동화 미연결'}</dd>
            <dt>첫 실행일</dt>
            <dd>{settings?.first_run_on ? dotDate(settings.first_run_on) : '미정'}</dd>
            <dt>수집 API 토큰</dt>
            <dd>{tokenConfigured ? '서버에 설정됨(값은 표시하지 않음)' : '미설정 — 수집 API 비활성(503)'}</dd>
          </dl>
          <IntegrationForm connected={!!settings?.aside_connected} firstRunOn={settings?.first_run_on ?? null} note={settings?.note ?? null} />
        </div>
      </div>

      <section className="section" aria-labelledby="runs-h">
        <div className="section-head">
          <div>
            <h2 id="runs-h">수집 이력</h2>
            <p>Aside가 수집 API로 기록한 실제 이력만 표시합니다.</p>
          </div>
        </div>
        <div className="table-wrap" style={{ background: '#fff' }}>
          <table>
            <caption className="sr-only">수집 이력</caption>
            <thead>
              <tr>
                <th scope="col">시작</th>
                <th scope="col">대상 주간</th>
                <th scope="col">상태</th>
                <th scope="col">종료</th>
                <th scope="col">보고서</th>
                <th scope="col">사유</th>
              </tr>
            </thead>
            <tbody>
              {runs.length === 0 && (
                <tr>
                  <td colSpan={6} className="empty">
                    수집 이력이 없습니다(자동화 미연결).
                  </td>
                </tr>
              )}
              {runs.map((r) => (
                <tr key={r.run_id}>
                  <td>{kstDateTime(r.started_at)}</td>
                  <td>{periodLabel({ start: r.expected_period_start, end: r.expected_period_end }, 'dot')}</td>
                  <td>
                    <span className={`badge ${r.status === 'succeeded' ? '' : r.status === 'running' ? 'warn' : 'danger'}`}>{RUN_LABEL[r.status]}</span>
                  </td>
                  <td>{r.finished_at ? kstDateTime(r.finished_at) : '-'}</td>
                  <td>{r.report_id ? <a href={`/reports/${encodeURIComponent(r.report_id)}`}>{r.report_id}</a> : '-'}</td>
                  <td>
                    {r.error_code ? <span className="mono">{r.error_code}</span> : null} {r.safe_message ?? ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section" aria-labelledby="guide-h">
        <div className="section-head">
          <div>
            <h2 id="guide-h">안전한 연결 안내</h2>
            <p>기본 연결 방식은 관리자 JSON 업로드입니다. API 연결은 서버 전용 토큰이 설정된 경우에만 동작합니다.</p>
          </div>
        </div>
        <div className="grid two">
          <div className="card">
            <h3>예정 주기(기본안)</h3>
            <ul className="kv-list">
              <li>7일마다 한국시간 오전 9시, 대상은 네이버의 최근 완료된 월~일 주간(현재 기준 {periodLabel(status.expectedWeek, 'dot')}).</li>
              <li>실제 첫 실행일과 루틴 생성은 사이트 연결 후 Aside에서 확정합니다. 이 사이트는 스스로 수집을 예약·실행하지 않습니다.</li>
              <li>실행마다 크레딧이 들 수 있으므로 반복 실행 승인은 Aside에서 따로 관리합니다.</li>
              <li>실패·네이버 로그인 필요 시 마지막 정상 보고서는 삭제되거나 0으로 덮어써지지 않습니다.</li>
            </ul>
          </div>
          <div className="card">
            <h3>API 경로</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">요청</th>
                    <th scope="col">용도</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="mono">POST {origin}/api/collection-runs</td>
                    <td>수집 시작(running)·실패·로그인 필요 기록</td>
                  </tr>
                  <tr>
                    <td className="mono">PUT {origin}/api/reports/&#123;reportId&#125;</td>
                    <td>보고서 저장(신규: If-None-Match: *)</td>
                  </tr>
                  <tr>
                    <td className="mono">GET {origin}/api/reports/&#123;reportId&#125;</td>
                    <td>저장 확인(ETag)</td>
                  </tr>
                  <tr>
                    <td className="mono">PATCH {origin}/api/collection-runs/&#123;runId&#125;</td>
                    <td>종료 결과 기록(성공은 저장 확인 후)</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="note">
              인증: <span className="mono">Authorization: Bearer &lt;REPORT_INGEST_TOKEN&gt;</span>. 토큰 값은 서버 환경변수/비밀 저장소에만 두고 화면·로그·채팅에 쓰지 않습니다.
              기존의 다른 보고서는 자동으로 덮어쓰지 않으며(409), 정정은 If-Match와 <span className="mono">X-Report-Correction: true</span>가 모두 필요합니다.
            </p>
          </div>
        </div>
      </section>
    </>
  )
}
