import { describe, expect, it } from 'vitest'
import { clone, hasData, readReport } from '../helpers'
import { syntheticWeekly } from '../fixtures'
import { validateReport, safeHttpUrl } from '@/lib/report/validate'
import { groupShares } from '@/lib/report/traffic'
import { thirtyDayMetrics } from '@/lib/report/baseline'

const TODAY = '2026-09-29'
const v = (x: unknown) => validateReport(x, { today: TODAY })

describe('합성 주간 보고서 검증', () => {
  it('유효한 보고서는 통과하고 경고만 남긴다', () => {
    const r = v(syntheticWeekly())
    expect(r.errors).toEqual([])
    expect(r.ok).toBe(true)
    expect(r.warnings.some((w) => w.message.includes('원인 미확인'))).toBe(true)
  })

  it('기간 6일/8일을 거부한다', () => {
    const six = syntheticWeekly()
    six.period.end = '2026-09-12'
    six.reportId = 'ko372_2026-09-07_2026-09-12'
    for (const s of ['traffic', 'content', 'audience'] as const) six[s].period.end = '2026-09-12'
    expect(v(six).errors.some((e) => e.message.includes('정확히 7일'))).toBe(true)
    const eight = syntheticWeekly()
    eight.period.end = '2026-09-14'
    eight.reportId = 'ko372_2026-09-07_2026-09-14'
    expect(v(eight).ok).toBe(false)
  })

  it('reportId 불일치를 거부한다', () => {
    const r = syntheticWeekly()
    r.reportId = 'ko372_2026-09-08_2026-09-14'
    expect(v(r).errors.some((e) => e.path === '/reportId')).toBe(true)
  })

  it('음수 수치를 거부한다', () => {
    const r = syntheticWeekly()
    r.metrics[0].current = -1
    expect(v(r).ok).toBe(false)
  })

  it('존재하지 않는 날짜(2026-02-30)를 거부한다', () => {
    const r = syntheticWeekly()
    r.observedOn = '2026-02-30'
    expect(v(r).ok).toBe(false)
  })

  it('Infinity(1e400) 같은 비유한 숫자를 거부한다', () => {
    const r = JSON.parse(JSON.stringify(syntheticWeekly()).replace('"current":70', '"current":1e400'))
    const res = v(r)
    expect(res.ok).toBe(false)
    expect(res.errors.some((e) => e.message.includes('유한값'))).toBe(true)
  })

  it('NaN 토큰은 JSON 파싱 단계에서 실패한다', () => {
    expect(() => JSON.parse('{"a": NaN}')).toThrow()
  })

  it('javascript:/data: URL과 토큰 쿼리를 거부한다', () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,hi', 'https://x.test/?token=abc', 'https://user:pw@x.test/']) {
      const r = syntheticWeekly()
      r.sources[0].url = url
      expect(v(r).ok, url).toBe(false)
    }
    expect(safeHttpUrl('https://blog.naver.com/ko372').ok).toBe(true)
  })

  it('인증정보 흔적 문자열을 거부한다', () => {
    const r = syntheticWeekly()
    r.limitations.push('Authorization: Bearer abcdefghijklmnop')
    expect(v(r).errors.some((e) => e.message.includes('인증정보'))).toBe(true)
  })

  it('change/changePercent 산술을 서버에서 대조한다', () => {
    const r = syntheticWeekly()
    r.metrics[0].changePercent = 50
    expect(v(r).errors.some((e) => e.path === '/metrics/0/changePercent')).toBe(true)
  })

  it('이전 값이 0이면 changePercent는 null이어야 한다(Infinity 금지)', () => {
    const r = syntheticWeekly()
    const nb = r.metrics.find((m) => m.id === 'neighborAdditions')!
    ;(nb as { changePercent: number | null }).changePercent = 100
    expect(v(r).ok).toBe(false)
  })

  it('필수 지표 누락은 0으로 채우지 않고 거부한다', () => {
    const r = syntheticWeekly()
    r.metrics = r.metrics.filter((m) => m.id !== 'visits')
    expect(v(r).errors.some((e) => e.message.includes('visits'))).toBe(true)
  })

  it('지표 id 중복과 일별 날짜 중복을 거부한다', () => {
    const r = syntheticWeekly()
    r.metrics.push(clone(r.metrics[0]))
    r.daily.push(clone(r.daily[0]))
    const errs = v(r).errors.map((e) => e.message).join('\n')
    expect(errs).toContain('중복')
  })

  it('월요일 시작이 아닌 주간·미완료 주간(관측일<=종료일)을 거부한다', () => {
    const r = syntheticWeekly('2026-09-08', '2026-09-14', '2026-09-01', '2026-09-07')
    expect(v(r).ok).toBe(false)
    const early = syntheticWeekly()
    early.observedOn = '2026-09-13'
    expect(v(early).errors.some((e) => e.path === '/observedOn')).toBe(true)
  })

  it('지원하지 않는 schemaVersion은 임의 변환 없이 거부한다', () => {
    const r = syntheticWeekly() as Record<string, unknown>
    r.schemaVersion = '2.0.0'
    expect(v(r).errors[0].path).toBe('/schemaVersion')
  })

  it('다른 blogId는 스키마에서 거부한다', () => {
    const r = syntheticWeekly() as Record<string, unknown>
    r.blogId = 'other'
    expect(v(r).ok).toBe(false)
  })

  it('rankedViews와 게시물 합계 불일치는 오류, 전체 조회수와의 차이는 경고', () => {
    const r = syntheticWeekly()
    r.content.rankedViews = 31
    expect(v(r).errors.some((e) => e.path === '/content/rankedViews')).toBe(true)
  })
})

describe.skipIf(!hasData)('실제 보고서 JSON(MRK_DATA_DIR)', () => {
  it('주간 보고서가 스키마·교차 규칙을 통과한다', () => {
    const r = v(readReport('weekly'))
    expect(r.errors).toEqual([])
    expect(r.ok).toBe(true)
  })

  it('baseline 보고서가 통과하고 30일 합계가 일별 원자료와 일치한다', () => {
    const raw = readReport('baseline')
    const r = v(raw)
    expect(r.errors).toEqual([])
    const m = thirtyDayMetrics(raw)
    const series = raw.analysisData.metrics
    expect(m.find((x) => x.key === 'pv')!.current).toBe(series['조회수_일간'].current[0])
    expect(m.find((x) => x.key === 'pv')!.previous).toBe(series['조회수_일간'].previous[0])
    expect(m.find((x) => x.key === 'visits')!.current).toBe(series['방문횟수_일간'].current[0])
    expect(m.find((x) => x.key === 'neighbors')!.current).toBe(series['이웃증감수_일간'].current[0])
  })

  it('유입 분류(검색·네이버 블로그)가 원자료에 기록된 값과 같다', () => {
    const raw = readReport('baseline')
    for (const name of ['유입분석_주간', '유입분석_월간']) {
      const ref = raw.analysisData.refs[name]
      const g = groupShares(ref.channels.map(([n, s]: [string, number]) => ({ name: n, sharePercent: s })))
      expect(g.search).toBeCloseTo(ref.searchPct, 2)
      expect(g.naverBlog).toBeCloseTo(ref.naverBlogPct, 2)
    }
  })

  it('주간 보고서와 baseline의 주간 수치가 서로 일치한다', () => {
    const w = readReport('weekly')
    const b = readReport('baseline')
    const pv = w.metrics.find((m: { id: string }) => m.id === 'pageViews')
    expect(pv.current).toBe(b.analysisData.week.pv)
    expect(pv.previous).toBe(b.analysisData.week.previousPv)
    expect(w.content.rankedViews).toBe(b.analysisData.rankTotal)
    expect(w.traffic.channels.length).toBe(20)
    expect(b.analysisData.refs['유입분석_월간'].channels.length).toBe(19)
    expect(w.content.posts.length).toBe(44)
    const weeklyGroups = groupShares(w.traffic.channels)
    expect(weeklyGroups.search).toBeCloseTo(b.analysisData.refs['유입분석_주간'].searchPct, 2)
  })
})
