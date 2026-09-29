import Link from 'next/link'
import { kstDateTime, periodLabel } from '@/lib/dates'
import type { UpdateStatus } from '@/lib/status'

const DOT: Record<string, string> = { ok: 'ok', awaiting: 'warn', running: 'warn', needs_login: 'danger', failed: 'danger', unconfigured: '' }

export function StatusPanel({ status, latestPeriod }: { status: UpdateStatus; latestPeriod: { start: string; end: string } | null }) {
  return (
    <div className="card" aria-labelledby="status-h">
      <div className="card-head">
        <h3 id="status-h">갱신 상태</h3>
        <span className={`badge ${status.state === 'ok' ? '' : status.state === 'unconfigured' ? 'neutral' : status.state === 'failed' || status.state === 'needs_login' ? 'danger' : 'warn'}`}>
          <span className={`status-dot ${DOT[status.state]}`} aria-hidden="true" />
          {status.label}
        </span>
      </div>
      <dl className="meta">
        <dt>표시 중인 보고서</dt>
        <dd>{latestPeriod ? periodLabel(latestPeriod, 'dot') : '없음'}</dd>
        <dt>최근 완료 주간</dt>
        <dd>
          {periodLabel(status.expectedWeek, 'dot')}{' '}
          {status.stale ? <span className="badge warn">데이터 오래됨 · 이 주간 보고서 없음</span> : <span className="badge">저장됨</span>}
        </dd>
        <dt>마지막 수집 성공</dt>
        <dd>{status.lastSuccess ? kstDateTime(status.lastSuccess.finished_at) : '기록 없음'}</dd>
        <dt>마지막 수집 시도</dt>
        <dd>
          {status.lastRun ? `${kstDateTime(status.lastRun.started_at)} · ${status.lastRun.status}` : '기록 없음'}
          {status.lastRun?.safe_message ? ` · ${status.lastRun.safe_message}` : ''}
        </dd>
        {status.nextPlannedAt && (
          <>
            <dt>다음 예정(Aside 기준)</dt>
            <dd>{kstDateTime(status.nextPlannedAt)} · 실행 보장 아님</dd>
          </>
        )}
      </dl>
      {(status.state === 'failed' || status.state === 'needs_login') && (
        <p className="alert warn" style={{ marginTop: 12 }}>
          마지막 수집이 {status.label} 상태입니다. 마지막 정상 보고서와 관측일은 그대로 유지되며 0이나 빈 값으로 덮어쓰지 않았습니다.
        </p>
      )}
      {status.state === 'unconfigured' && (
        <p className="note" style={{ marginTop: 10 }}>
          자동 수집은 아직 연결되지 않았습니다. 보고서는 관리자 JSON 업로드로 저장합니다. <Link href="/admin/integration">연결 안내 보기</Link>
        </p>
      )}
    </div>
  )
}
