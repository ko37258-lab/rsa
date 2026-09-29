import { addDays, dayNumber } from '../dates'
import type { Metric, MetricId } from './types'

export interface WeekSlot {
  start: string
  end: string
  reportId: string | null
  value: number | null
}

/**
 * 저장된 주간 보고서들로 연속 주차 축을 만든다. 보고서가 없는 주차는 value=null(빈 구간)이며
 * 0이나 보간값으로 채우지 않는다. 첫 보고서~마지막 보고서 사이만 표시한다.
 */
export function buildWeeklySlots(
  reports: { report_id: string; period_start: string; period_end: string; metrics: Metric[] | null }[],
  metricId: MetricId,
  maxWeeks = 52,
): WeekSlot[] {
  if (!reports.length) return []
  const sorted = [...reports].sort((a, b) => a.period_start.localeCompare(b.period_start))
  const byStart = new Map(sorted.map((r) => [r.period_start, r]))
  const last = sorted[sorted.length - 1].period_start
  let first = sorted[0].period_start
  const weeks = Math.round((dayNumber(last) - dayNumber(first)) / 7) + 1
  if (weeks > maxWeeks) first = addDays(last, -(maxWeeks - 1) * 7)
  const slots: WeekSlot[] = []
  for (let s = first; dayNumber(s) <= dayNumber(last); s = addDays(s, 7)) {
    const r = byStart.get(s)
    const v = r?.metrics?.find((m) => m.id === metricId)?.current
    slots.push({ start: s, end: addDays(s, 6), reportId: r?.report_id ?? null, value: typeof v === 'number' ? v : null })
  }
  return slots
}
