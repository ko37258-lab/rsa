// 날짜 유틸. 보고서 날짜는 'YYYY-MM-DD' 달력 날짜(Asia/Seoul 기준)이며 시각대 변환을 하지 않는다.

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** 실제로 존재하는 달력 날짜인지 검사한다(2026-02-30 같은 값 거부). */
export function isRealIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const m = ISO_DATE.exec(value)
  if (!m) return false
  const d = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

/** 1970-01-01 기준 일수. 유효하지 않으면 NaN. */
export function dayNumber(value: string): number {
  if (!isRealIsoDate(value)) return Number.NaN
  return Date.parse(`${value}T00:00:00.000Z`) / 86_400_000
}

export function addDays(value: string, days: number): string {
  const n = dayNumber(value)
  return new Date((n + days) * 86_400_000).toISOString().slice(0, 10)
}

/** 시작·종료 포함 일수. */
export function inclusiveDays(start: string, end: string): number {
  return dayNumber(end) - dayNumber(start) + 1
}

/** 0=월 … 6=일 */
export function weekdayMon0(value: string): number {
  const js = new Date(`${value}T00:00:00.000Z`).getUTCDay()
  return (js + 6) % 7
}

/** 주어진 시각(기본: 지금)의 한국 날짜. */
export function kstToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 3_600_000).toISOString().slice(0, 10)
}

/** 한국시간 기준 마지막으로 완료된 월~일 주간. 오늘이 일요일이면 지난주. */
export function lastCompletedNaverWeek(now: Date = new Date()): { start: string; end: string } {
  const today = kstToday(now)
  const dow = weekdayMon0(today)
  const end = addDays(today, -(dow + 1))
  return { start: addDays(end, -6), end }
}

/** 표시용: 2026-09-21 → 2026.09.21 */
export function dotDate(value: string | null | undefined): string {
  if (!value || !isRealIsoDate(value)) return '확인 불가'
  return value.replaceAll('-', '.')
}

/** 표시용: 2026-09-21 → 9/21 */
export function shortDate(value: string): string {
  if (!isRealIsoDate(value)) return '확인 불가'
  const [, m, d] = value.split('-')
  return `${Number(m)}/${Number(d)}`
}

export function periodLabel(p: { start: string; end: string } | null | undefined, style: 'short' | 'dot' = 'short'): string {
  if (!p) return '확인 불가'
  const f = style === 'short' ? shortDate : dotDate
  return `${f(p.start)}~${f(p.end)}`
}

/** 서버 저장 시각(ISO timestamp)을 한국시간으로 표시. */
export function kstDateTime(value: string | null | undefined): string {
  if (!value) return '기록 없음'
  const t = Date.parse(value)
  if (Number.isNaN(t)) return '확인 불가'
  const d = new Date(t + 9 * 3_600_000)
  const iso = d.toISOString()
  return `${iso.slice(0, 10).replaceAll('-', '.')} ${iso.slice(11, 16)} (KST)`
}
