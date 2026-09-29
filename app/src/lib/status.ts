// 갱신 상태 판정. 실제 기록(수집 이력·연결 등록·저장된 보고서)만으로 계산하며,
// 페이지 방문이나 코드 존재만으로 '정상'·'예정' 상태를 만들지 않는다.
import { addDays, dayNumber, kstToday, lastCompletedNaverWeek } from './dates'

export type RunStatus = 'running' | 'succeeded' | 'needs_login' | 'failed'

export interface CollectionRun {
  run_id: string
  expected_period_start: string
  expected_period_end: string
  status: RunStatus
  report_id: string | null
  error_code: string | null
  safe_message: string | null
  started_at: string
  finished_at: string | null
}

export interface IntegrationSettings {
  aside_connected: boolean
  first_run_on: string | null
  connected_at: string | null
  note: string | null
  updated_at: string
}

export type UpdateState = 'unconfigured' | 'awaiting' | 'running' | 'ok' | 'needs_login' | 'failed'

export const STATE_LABEL: Record<UpdateState, string> = {
  unconfigured: '자동화 미연결',
  awaiting: '예정된 보고서 대기',
  running: '수집 진행 중',
  ok: '정상 저장',
  needs_login: '네이버 로그인 필요',
  failed: '수집 실패',
}

export interface UpdateStatus {
  state: UpdateState
  label: string
  lastRun: CollectionRun | null
  lastSuccess: CollectionRun | null
  expectedWeek: { start: string; end: string }
  latestWeekStored: boolean
  stale: boolean
  nextPlannedAt: string | null
}

export function deriveUpdateStatus(input: {
  settings: IntegrationSettings | null
  runs: CollectionRun[] // 최신순
  latestWeeklyEnd: string | null
  now?: Date
}): UpdateStatus {
  const now = input.now ?? new Date()
  const expectedWeek = lastCompletedNaverWeek(now)
  const latestWeekStored = !!input.latestWeeklyEnd && input.latestWeeklyEnd >= expectedWeek.end
  const stale = !latestWeekStored
  const lastRun = input.runs[0] ?? null
  const lastSuccess = input.runs.find((r) => r.status === 'succeeded') ?? null
  const connected = !!input.settings?.aside_connected

  let state: UpdateState
  if (lastRun) {
    if (lastRun.status === 'running') state = 'running'
    else if (lastRun.status === 'needs_login') state = 'needs_login'
    else if (lastRun.status === 'failed') state = 'failed'
    else state = latestWeekStored || !connected ? 'ok' : 'awaiting'
  } else {
    state = connected ? (latestWeekStored ? 'ok' : 'awaiting') : 'unconfigured'
  }

  return {
    state,
    label: STATE_LABEL[state],
    lastRun,
    lastSuccess,
    expectedWeek,
    latestWeekStored,
    stale,
    nextPlannedAt: connected ? nextPlannedRun(input.settings!.first_run_on, now) : null,
  }
}

/** 연결 등록된 첫 실행일 기준 7일 간격, 한국시간 오전 9시. Aside 설정 기준의 예정일일 뿐 실행 보장이 아니다. */
export function nextPlannedRun(firstRunOn: string | null, now: Date = new Date()): string | null {
  if (!firstRunOn || Number.isNaN(dayNumber(firstRunOn))) return null
  const today = kstToday(now)
  const kstHour = new Date(now.getTime() + 9 * 3_600_000).getUTCHours()
  let d = firstRunOn
  if (dayNumber(d) < dayNumber(today)) {
    const diff = dayNumber(today) - dayNumber(d)
    d = addDays(d, Math.ceil(diff / 7) * 7)
  }
  if (d === today && kstHour >= 9) d = addDays(d, 7)
  return `${d}T09:00:00+09:00`
}
