// 한글 숫자 표기: 1,234회 · 175명 · 3분 32초 · +4.2%p. 값이 없으면 0이 아니라 '미수집'으로 표시한다.
import type { Metric, MetricUnit } from './report/types'

export const MISSING = '미수집'

const nf = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 })

export function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

export function num(v: number | null | undefined, digits = 2): string {
  if (!isFiniteNumber(v)) return MISSING
  return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: digits }).format(v)
}

export function count(v: number | null | undefined, suffix = '회'): string {
  return isFiniteNumber(v) ? `${nf.format(v)}${suffix}` : MISSING
}

export function people(v: number | null | undefined): string {
  return count(v, '명')
}

export function percent(v: number | null | undefined, digits = 2): string {
  return isFiniteNumber(v) ? `${num(v, digits)}%` : MISSING
}

export function duration(seconds: number | null | undefined): string {
  if (!isFiniteNumber(seconds)) return MISSING
  const s = Math.round(seconds)
  const m = Math.floor(s / 60)
  const r = s % 60
  if (m === 0) return `${r}초`
  return r === 0 ? `${m}분` : `${m}분 ${r}초`
}

function signed(v: number, digits: number): string {
  const body = num(Math.abs(v), digits)
  if (v > 0) return `+${body}`
  if (v < 0) return `−${body}`
  return body
}

/** 증감(절대값) 표시. percent 단위는 퍼센트포인트(%p). */
export function changeText(unit: MetricUnit, change: number | null | undefined): string {
  if (!isFiniteNumber(change)) return '비교 불가'
  switch (unit) {
    case 'percent':
      return `${signed(change, 2)}%p`
    case 'seconds':
      return change === 0 ? '0초' : `${change > 0 ? '+' : '−'}${duration(Math.abs(change))}`
    case 'people':
      return `${signed(change, 2)}명`
    default:
      return `${signed(change, 2)}회`
  }
}

/** 상대 증감률. 이전 값이 0이거나 없으면 null → '비교 불가'. */
export function changePercentText(v: number | null | undefined): string {
  if (!isFiniteNumber(v)) return '비교 불가'
  return `${signed(v, 1)}%`
}

export function metricValue(m: Pick<Metric, 'unit' | 'current'>): string {
  return unitValue(m.unit, m.current)
}

export function unitValue(unit: MetricUnit, v: number | null | undefined): string {
  switch (unit) {
    case 'percent':
      return percent(v)
    case 'seconds':
      return duration(v)
    case 'people':
      return people(v)
    default:
      return count(v)
  }
}

/** 상대 변화율 계산. 이전 값이 0/없음이면 null (Infinity 금지). */
export function relativeChange(current: number, previous: number | null): number | null {
  if (!isFiniteNumber(current) || !isFiniteNumber(previous) || previous === 0) return null
  const r = (current / previous - 1) * 100
  return Number.isFinite(r) ? Number(r.toFixed(2)) : null
}

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}
