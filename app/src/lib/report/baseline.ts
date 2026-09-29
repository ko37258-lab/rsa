// 최초 종합분석(baseline) 화면용 파생 데이터. 모든 수치는 저장된 payload에서 계산하며 코드에 하드코딩하지 않는다.
import { relativeChange } from '../format'
import { inclusiveDays } from '../dates'
import { groupShares } from './traffic'
import type { BaselineReport, Channel, Keyword, Period } from './types'

export interface ThirtyDayMetric {
  key: string
  label: string
  unit: string
  current: number | null
  previous: number | null
  changePercent: number | null
  note: string
  perDay?: { current: number | null; previous: number | null }
}

export interface TrafficView {
  key: 'weekly' | 'monthly'
  label: string
  badge: string
  period: Period
  channels: Channel[]
  keywords: Keyword[]
  details: [string, string, number][]
  groups: ReturnType<typeof groupShares>
  providedSearchPct: number | null
  providedNaverBlogPct: number | null
}

function series(r: BaselineReport, name: string) {
  return r.analysisData.metrics?.[name]
}

function sumDaily(r: BaselineReport, name: string, p: Period): number | null {
  const s = series(r, name)
  if (!s?.daily) return null
  const rows = s.daily.filter((row) => row[0] >= p.start && row[0] <= p.end)
  if (!rows.length) return null
  return rows.reduce((acc, row) => acc + (Number(row[1]) || 0), 0)
}

export function thirtyDayMetrics(r: BaselineReport): ThirtyDayMetric[] {
  const P = r.periods
  const pick = (name: string) => ({ current: sumDaily(r, name, P.current30Days), previous: sumDaily(r, name, P.previous30Days) })
  const pv = pick('조회수_일간')
  const visits = pick('방문횟수_일간')
  const uv = pick('순방문자수_일간')
  const nb = pick('이웃증감수_일간')
  const days = inclusiveDays(P.current30Days.start, P.current30Days.end)
  const pdays = inclusiveDays(P.previous30Days.start, P.previous30Days.end)
  const perDay = (v: number | null, d: number) => (v === null ? null : Number((v / d).toFixed(1)))
  return [
    { key: 'pv', label: '조회수', unit: '회', ...pv, changePercent: pv.current === null ? null : relativeChange(pv.current, pv.previous), note: '일별 조회수 합계' },
    { key: 'visits', label: '방문 횟수', unit: '회', ...visits, changePercent: visits.current === null ? null : relativeChange(visits.current, visits.previous), note: '일별 방문 횟수 합계' },
    {
      key: 'uvPerDay',
      label: '일평균 순방문자',
      unit: '명',
      current: perDay(uv.current, days),
      previous: perDay(uv.previous, pdays),
      changePercent: uv.current === null ? null : relativeChange(uv.current, uv.previous),
      perDay: { current: uv.current, previous: uv.previous },
      note: '일별 순방문자 합계 ÷ 일수. 날짜를 넘는 중복 방문자가 있어 합계를 ‘30일 순방문자’로 쓰지 않습니다.',
    },
    { key: 'neighbors', label: '이웃 추가수', unit: '명', ...nb, changePercent: nb.current === null ? null : relativeChange(nb.current, nb.previous), note: '추가 집계이며 삭제를 뺀 순증이 아닙니다.' },
  ]
}

/** 60일 일별 조회수(직전 30일 + 최근 30일). 비어 있는 날짜는 null로 둔다. */
export function sixtyDayViews(r: BaselineReport) {
  const s = series(r, '조회수_일간')
  const P = r.periods
  const map = new Map((s?.daily ?? []).map((row) => [row[0], Number(row[1])]))
  const out: { date: string; value: number | null; series: 'current' | 'previous' }[] = []
  const start = Date.parse(`${P.previous30Days.start}T00:00:00Z`)
  const end = Date.parse(`${P.current30Days.end}T00:00:00Z`)
  for (let t = start; t <= end; t += 86_400_000) {
    const d = new Date(t).toISOString().slice(0, 10)
    const v = map.get(d)
    out.push({ date: d, value: v === undefined || Number.isNaN(v) ? null : v, series: d >= P.current30Days.start ? 'current' : 'previous' })
  }
  return out
}

function refToView(r: BaselineReport, name: string, key: 'weekly' | 'monthly', period: Period): TrafficView | null {
  const ref = r.analysisData.refs?.[name]
  if (!ref) return null
  const channels = (ref.channels ?? []).map(([n, s]) => ({ name: String(n), sharePercent: Number(s), count: null }))
  return {
    key,
    label: key === 'weekly' ? '최근 완료 주간' : '월간 참고',
    badge: key === 'weekly' ? '주간' : '월간',
    period,
    channels,
    keywords: (ref.keywords ?? []).map(([k, s]) => ({ keyword: String(k), sharePercent: Number(s) })),
    details: (ref.details ?? []).map(([c, u, s]) => [String(c), String(u), Number(s)] as [string, string, number]),
    groups: groupShares(channels),
    providedSearchPct: typeof ref.searchPct === 'number' ? Number(ref.searchPct.toFixed(2)) : null,
    providedNaverBlogPct: typeof ref.naverBlogPct === 'number' ? Number(ref.naverBlogPct.toFixed(2)) : null,
  }
}

export function trafficViews(r: BaselineReport): TrafficView[] {
  return [refToView(r, '유입분석_주간', 'weekly', r.periods.weekly), refToView(r, '유입분석_월간', 'monthly', r.periods.monthlyTraffic)].filter(
    (v): v is TrafficView => v !== null,
  )
}

export function parseDemo(rows: (string | null)[][]) {
  const genders: { gender: string; views: number; share: number }[] = []
  const ages = new Map<string, { male: number; female: number }>()
  let band = ''
  for (const row of rows) {
    if (row[0]) band = row[0]
    const g = row[1] ?? ''
    const views = Number(row[2])
    const share = Number(row[3])
    if (band === '전체') genders.push({ gender: g, views, share })
    else {
      const a = ages.get(band) ?? { male: 0, female: 0 }
      if (g === '남') a.male += views
      else if (g === '여') a.female += views
      ages.set(band, a)
    }
  }
  const total = [...ages.values()].reduce((s, a) => s + a.male + a.female, 0)
  const over45 = [...ages.entries()].filter(([b]) => Number.parseInt(b, 10) >= 45).reduce((s, [, a]) => s + a.male + a.female, 0)
  return { genders, ages: [...ages.entries()].map(([band, a]) => ({ band, ...a })), total, over45Share: total ? Number(((over45 / total) * 100).toFixed(1)) : null }
}

/** '3m 32s' → 212 */
export function parseDurationText(v: string | null | undefined): number | null {
  if (!v) return null
  const m = /^(?:(\d+)m)?\s*(?:(\d+)s)?$/.exec(v.trim())
  if (!m || (!m[1] && !m[2])) return null
  return Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0)
}

export function weekDurations(r: BaselineReport) {
  const rows = (r.analysisData.time as (string | null)[][] | undefined) ?? []
  return rows.map((row) => {
    const [start, end] = String(row[0] ?? '').split('~')
    return { start, end, seconds: parseDurationText(row[2]) }
  })
}
