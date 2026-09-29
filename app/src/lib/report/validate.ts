// 보고서 검증: JSON Schema(2020-12, 날짜·URI 포맷 포함) + 계약서의 교차 필드 규칙.
import Ajv2020 from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import schema from './report.schema.json'
import { dayNumber, inclusiveDays, isRealIsoDate, kstToday, weekdayMon0 } from '../dates'
import type { BaselineReport, Metric, MetricId, MetricUnit, Report, WeeklyReport } from './types'

export interface Issue {
  path: string
  message: string
}

export interface ValidationResult {
  ok: boolean
  report: Report | null
  errors: Issue[]
  warnings: Issue[]
}

export const SUPPORTED_SCHEMA_VERSION = '1.0.0'
/** 네이버 유입 비중 합계의 반올림 허용 오차(퍼센트포인트). */
export const SHARE_SUM_TOLERANCE = 0.5
const MATH_TOLERANCE = 0.011
const MAX_STRING_LENGTH = 2000
const MAX_ARRAY_LENGTH = 5000

const ajv = new Ajv2020({ allErrors: true, strict: false })
addFormats(ajv, ['date', 'uri'])
const validateSchema = ajv.compile(schema)

const EXPECTED_UNITS: Record<MetricId, MetricUnit> = {
  pageViews: 'count',
  uniqueVisitors: 'people',
  visits: 'count',
  retentionRate: 'percent',
  averageDuration: 'seconds',
  neighborAdditions: 'count',
}
const REQUIRED_METRICS: MetricId[] = ['pageViews', 'uniqueVisitors', 'visits']
const OPTIONAL_METRICS: MetricId[] = ['retentionRate', 'averageDuration', 'neighborAdditions']

// 인증정보·세션 흔적. 데이터 어디에도 들어가면 안 된다.
const SENSITIVE_TEXT =
  /(authcode|access[_-]?token|refresh[_-]?token|id[_-]?token|set-cookie|cookie\s*[:=]|authorization\s*[:=]|bearer\s+[a-z0-9._~+/-]{8,}|nid_aut|nid_ses|service[_-]?role|sb-[a-z0-9]+-auth-token)/i
const SENSITIVE_QUERY_KEYS = /^(token|access_token|refresh_token|id_token|authcode|auth|code|cookie|session|sessionid|sig|signature|key|apikey|api_key|password|pw)$/i

/** http/https 이외 스킴, 자격증명 포함 URL, 민감한 쿼리 키를 거부한다. */
export function safeHttpUrl(value: string): { ok: true } | { ok: false; reason: string } {
  let u: URL
  try {
    u = new URL(value)
  } catch {
    return { ok: false, reason: 'URL 형식이 아닙니다.' }
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, reason: 'http/https 링크만 허용합니다.' }
  if (u.username || u.password) return { ok: false, reason: 'URL에 계정 정보를 넣을 수 없습니다.' }
  for (const k of u.searchParams.keys()) {
    if (SENSITIVE_QUERY_KEYS.test(k)) return { ok: false, reason: `민감한 쿼리 매개변수(${k})가 포함된 URL은 허용하지 않습니다.` }
  }
  return { ok: true }
}

function walk(value: unknown, path: string, visit: (v: unknown, path: string) => void, depth = 0): void {
  if (depth > 40) {
    visit(Symbol.for('too-deep'), path)
    return
  }
  visit(value, path)
  if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${path}/${i}`, visit, depth + 1))
  else if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) walk(v, `${path}/${k}`, visit, depth + 1)
}

function genericChecks(input: unknown, errors: Issue[]) {
  walk(input, '', (v, path) => {
    if (typeof v === 'symbol') errors.push({ path, message: 'JSON 중첩이 너무 깊습니다.' })
    else if (typeof v === 'number' && !Number.isFinite(v)) errors.push({ path, message: '숫자는 유한값이어야 합니다(NaN·Infinity 불가).' })
    else if (typeof v === 'string') {
      if (v.length > MAX_STRING_LENGTH) errors.push({ path, message: `문자열이 너무 깁니다(최대 ${MAX_STRING_LENGTH}자).` })
      if (SENSITIVE_TEXT.test(v)) errors.push({ path, message: '인증정보·세션으로 보이는 문자열은 저장할 수 없습니다.' })
    } else if (Array.isArray(v) && v.length > MAX_ARRAY_LENGTH)
      errors.push({ path, message: `배열 항목이 너무 많습니다(최대 ${MAX_ARRAY_LENGTH}개).` })
  })
}

function near(a: number, b: number, tol = MATH_TOLERANCE) {
  return Math.abs(a - b) <= tol
}

function checkPeriod7(p: { start: string; end: string }, path: string, errors: Issue[]) {
  if (!isRealIsoDate(p.start) || !isRealIsoDate(p.end)) {
    errors.push({ path, message: '실제 존재하는 날짜가 아닙니다.' })
    return false
  }
  const days = inclusiveDays(p.start, p.end)
  if (days !== 7) {
    errors.push({ path, message: `주간 기간은 시작·종료 포함 정확히 7일이어야 합니다(현재 ${days}일).` })
    return false
  }
  return true
}

function checkMetric(m: Metric, i: number, errors: Issue[]) {
  const path = `/metrics/${i}`
  const expected = EXPECTED_UNITS[m.id]
  if (expected && m.unit !== expected) errors.push({ path: `${path}/unit`, message: `${m.id}의 단위는 ${expected}여야 합니다.` })
  if (m.unit === 'percent' && (m.current > 100 || (m.previous ?? 0) > 100))
    errors.push({ path, message: '비율 지표는 100을 넘을 수 없습니다.' })
  if (m.previous === null) {
    if (m.change !== null || m.changePercent !== null)
      errors.push({ path, message: '이전 값이 없으면 change·changePercent는 null이어야 합니다.' })
    return
  }
  if (m.change === null || !near(m.change, m.current - m.previous))
    errors.push({ path: `${path}/change`, message: `change는 current−previous(${+(m.current - m.previous).toFixed(4)})와 같아야 합니다.` })
  if (m.previous === 0) {
    if (m.changePercent !== null) errors.push({ path: `${path}/changePercent`, message: '이전 값이 0이면 증감률은 null이어야 합니다.' })
  } else {
    const expectedPct = Number(((m.current / m.previous - 1) * 100).toFixed(2))
    if (m.changePercent === null || !near(m.changePercent, expectedPct))
      errors.push({ path: `${path}/changePercent`, message: `changePercent는 ${expectedPct}여야 합니다(상대 증감률, 소수 둘째 자리).` })
  }
}

function sharesWarning(rows: { sharePercent: number }[], path: string, warnings: Issue[], label: string) {
  if (rows.length === 0) return
  const sum = rows.reduce((s, r) => s + r.sharePercent, 0)
  if (!near(sum, 100, SHARE_SUM_TOLERANCE))
    warnings.push({ path, message: `${label} 비중 합계가 ${sum.toFixed(2)}%로 반올림 허용 범위(100±${SHARE_SUM_TOLERANCE}%p)를 벗어났습니다.` })
  else if (!near(sum, 100, 0.001))
    warnings.push({ path, message: `${label} 비중 합계 ${sum.toFixed(2)}%는 네이버 반올림 오차로 보고 원 수치를 그대로 보존합니다.` })
}

function validateWeekly(r: WeeklyReport, errors: Issue[], warnings: Issue[], today: string) {
  const expectedId = `${r.blogId}_${r.period.start}_${r.period.end}`
  if (r.reportId !== expectedId) errors.push({ path: '/reportId', message: `주간 reportId는 ${expectedId} 이어야 합니다.` })

  const periodOk = checkPeriod7(r.period, '/period', errors)
  const compOk = checkPeriod7(r.comparisonPeriod, '/comparisonPeriod', errors)
  if (periodOk && weekdayMon0(r.period.start) !== 0)
    errors.push({ path: '/period/start', message: '네이버 주간 기준(월~일)에 맞게 월요일에 시작해야 합니다.' })
  if (periodOk && compOk && dayNumber(r.period.start) - dayNumber(r.comparisonPeriod.end) !== 1)
    errors.push({ path: '/comparisonPeriod', message: '비교 기간은 보고 기간 바로 직전 7일이어야 합니다.' })
  for (const section of ['traffic', 'content', 'audience'] as const) {
    const p = r[section].period
    if (p.start !== r.period.start || p.end !== r.period.end)
      errors.push({ path: `/${section}/period`, message: `${section}.period는 보고 기간과 같아야 합니다.` })
  }
  if (isRealIsoDate(r.observedOn) && periodOk) {
    if (dayNumber(r.observedOn) <= dayNumber(r.period.end))
      errors.push({ path: '/observedOn', message: '관측일은 보고 기간이 끝난 뒤여야 합니다(완료된 주간만 저장).' })
    if (dayNumber(r.observedOn) > dayNumber(today) + 1)
      errors.push({ path: '/observedOn', message: '관측일이 미래 날짜입니다.' })
  }

  // 지표
  const seen = new Set<string>()
  r.metrics.forEach((m, i) => {
    if (seen.has(m.id)) errors.push({ path: `/metrics/${i}/id`, message: `지표 ${m.id}가 중복되었습니다.` })
    seen.add(m.id)
    checkMetric(m, i, errors)
  })
  for (const id of REQUIRED_METRICS)
    if (!seen.has(id)) errors.push({ path: '/metrics', message: `필수 지표 ${id}가 없습니다. 0으로 채우지 말고 수집 실패로 기록하세요.` })
  for (const id of OPTIONAL_METRICS)
    if (!seen.has(id)) warnings.push({ path: '/metrics', message: `${id} 지표가 없어 '미수집'으로 표시됩니다.` })
  const metric = (id: MetricId) => r.metrics.find((m) => m.id === id)

  // 일별
  const dates = new Set<string>()
  r.daily.forEach((d, i) => {
    if (dates.has(d.date)) errors.push({ path: `/daily/${i}/date`, message: `일별 날짜 ${d.date}가 중복되었습니다.` })
    dates.add(d.date)
    if (isRealIsoDate(d.date) && compOk && periodOk &&
      (dayNumber(d.date) < dayNumber(r.comparisonPeriod.start) || dayNumber(d.date) > dayNumber(r.period.end)))
      errors.push({ path: `/daily/${i}/date`, message: '일별 날짜가 비교·보고 기간 밖입니다.' })
  })
  const within = (p: { start: string; end: string }) => r.daily.filter((d) => d.date >= p.start && d.date <= p.end)
  for (const [p, key, label] of [[r.period, 'current', '보고'], [r.comparisonPeriod, 'previous', '비교']] as const) {
    const rows = within(p)
    if (rows.length === 0) continue
    if (rows.length !== 7) {
      warnings.push({ path: '/daily', message: `${label} 기간 일별 자료가 ${rows.length}일뿐입니다. 합계 대조를 생략합니다.` })
      continue
    }
    for (const id of ['pageViews', 'visits'] as const) {
      const m = metric(id)
      const v = m?.[key]
      const sum = rows.reduce((s, d) => s + d[id], 0)
      if (typeof v === 'number' && !near(sum, v))
        warnings.push({ path: '/daily', message: `${label} 기간 일별 ${id} 합계(${sum})가 주간 지표(${v})와 다릅니다.` })
    }
    const uv = metric('uniqueVisitors')?.[key]
    const uvSum = rows.reduce((s, d) => s + d.uniqueVisitors, 0)
    if (typeof uv === 'number' && uvSum < uv)
      warnings.push({ path: '/daily', message: `${label} 기간 일별 순방문자 합계(${uvSum})가 주간 중복 제거 순방문자(${uv})보다 작습니다.` })
  }

  // 유입
  const names = new Set<string>()
  r.traffic.channels.forEach((c, i) => {
    if (names.has(c.name)) warnings.push({ path: `/traffic/channels/${i}`, message: `유입경로 '${c.name}'가 중복되었습니다.` })
    names.add(c.name)
  })
  if (r.traffic.channels.length === 0) warnings.push({ path: '/traffic/channels', message: '유입경로가 비어 있어 미수집으로 표시됩니다.' })
  sharesWarning(r.traffic.channels, '/traffic/channels', warnings, '유입경로')
  if (r.traffic.comparisonChannels === null && !r.traffic.comparisonUnavailableReason)
    warnings.push({ path: '/traffic/comparisonUnavailableReason', message: '비교 유입경로가 없는 사유를 기록하는 것을 권합니다.' })

  // 콘텐츠
  const c = r.content
  const ranked = c.posts.reduce((s, p) => s + p.pageViews, 0)
  if (!near(ranked, c.rankedViews)) errors.push({ path: '/content/rankedViews', message: `rankedViews(${c.rankedViews})는 게시물 조회수 합계(${ranked})와 같아야 합니다.` })
  const pv = metric('pageViews')?.current
  if (typeof pv === 'number' && !near(pv, c.blogPageViews))
    errors.push({ path: '/content/blogPageViews', message: `blogPageViews(${c.blogPageViews})는 주간 조회수(${pv})와 같아야 합니다.` })
  if (c.unreconciledViews !== null && !near(c.unreconciledViews, c.blogPageViews - c.rankedViews))
    errors.push({ path: '/content/unreconciledViews', message: 'unreconciledViews는 blogPageViews − rankedViews여야 합니다.' })
  if (!near(c.rankedViews, c.blogPageViews))
    warnings.push({ path: '/content', message: `순위 합계 ${c.rankedViews}회와 전체 조회수 ${c.blogPageViews}회의 차이 ${+(c.blogPageViews - c.rankedViews).toFixed(2)}회는 원인 미확인으로 보존합니다.` })
  const ranks = new Set<number>()
  c.posts.forEach((p, i) => {
    if (ranks.has(p.rank)) warnings.push({ path: `/content/posts/${i}/rank`, message: `순위 ${p.rank}가 중복되었습니다.` })
    ranks.add(p.rank)
    if (p.publishedOn !== null && !isRealIsoDate(p.publishedOn)) errors.push({ path: `/content/posts/${i}/publishedOn`, message: '실제 존재하는 날짜가 아닙니다.' })
    if (p.postUrl !== null) {
      const u = safeHttpUrl(p.postUrl)
      if (!u.ok) errors.push({ path: `/content/posts/${i}/postUrl`, message: u.reason })
    }
  })
  const topicSum = c.topics.reduce((s, t) => s + t.pageViews, 0)
  if (c.topics.length && !near(topicSum, c.rankedViews))
    warnings.push({ path: '/content/topics', message: `주제별 합계(${topicSum})가 순위 합계(${c.rankedViews})와 다릅니다.` })

  // 독자
  const a = r.audience
  const devSum = a.devices.reduce((s, d) => s + d.pageViews, 0)
  if (a.devices.length && !near(devSum, c.blogPageViews))
    warnings.push({ path: '/audience/devices', message: `기기별 조회 합계(${devSum})가 전체 조회수(${c.blogPageViews})와 다릅니다.` })
  sharesWarning(a.devices, '/audience/devices', warnings, '기기')
  const gSum = a.genders.reduce((s, g) => s + g.pageViews, 0)
  if (a.genders.length && !near(gSum, a.demographicSampleViews))
    warnings.push({ path: '/audience/genders', message: `성별 조회 합계(${gSum})가 성·연령 집계 조회(${a.demographicSampleViews})와 다릅니다.` })
  const ageSum = a.ages.reduce((s, x) => s + x.maleViews + x.femaleViews, 0)
  if (a.ages.length && !near(ageSum, a.demographicSampleViews))
    warnings.push({ path: '/audience/ages', message: `연령별 조회 합계(${ageSum})가 성·연령 집계 조회(${a.demographicSampleViews})와 다릅니다.` })

  r.sources.forEach((s, i) => {
    const u = safeHttpUrl(s.url)
    if (!u.ok) errors.push({ path: `/sources/${i}/url`, message: u.reason })
  })
}

function validateBaseline(r: BaselineReport, errors: Issue[], warnings: Issue[], today: string) {
  const expectedId = `${r.blogId}_baseline_${r.observedOn}`
  if (r.reportId !== expectedId) errors.push({ path: '/reportId', message: `baseline reportId는 ${expectedId} 이어야 합니다.` })
  const P = r.periods
  for (const [k, p] of Object.entries(P))
    if (!isRealIsoDate(p.start) || !isRealIsoDate(p.end) || dayNumber(p.end) < dayNumber(p.start))
      errors.push({ path: `/periods/${k}`, message: '실제 존재하는 날짜 범위가 아닙니다.' })
  if (errors.length) return
  for (const k of ['current30Days', 'previous30Days'] as const)
    if (inclusiveDays(P[k].start, P[k].end) !== 30) errors.push({ path: `/periods/${k}`, message: '30일 비교 기간은 정확히 30일이어야 합니다.' })
  if (dayNumber(P.current30Days.start) - dayNumber(P.previous30Days.end) !== 1)
    errors.push({ path: '/periods/previous30Days', message: '직전 30일은 최근 30일 바로 앞이어야 합니다.' })
  checkPeriod7(P.weekly, '/periods/weekly', errors)
  checkPeriod7(P.previousWeek, '/periods/previousWeek', errors)
  if (dayNumber(P.weekly.start) - dayNumber(P.previousWeek.end) !== 1)
    errors.push({ path: '/periods/previousWeek', message: '직전 주간은 주간 기간 바로 앞 7일이어야 합니다.' })
  const m = P.monthlyTraffic
  const lastDay = new Date(Date.UTC(Number(m.start.slice(0, 4)), Number(m.start.slice(5, 7)), 0)).getUTCDate()
  if (!m.start.endsWith('-01') || m.end !== `${m.start.slice(0, 8)}${String(lastDay).padStart(2, '0')}`)
    errors.push({ path: '/periods/monthlyTraffic', message: '월간 유입 기간은 한 달의 1일~말일이어야 합니다.' })
  if (dayNumber(r.observedOn) <= dayNumber(P.current30Days.end))
    errors.push({ path: '/observedOn', message: '관측일은 30일 비교 기간 이후여야 합니다.' })
  if (dayNumber(r.observedOn) > dayNumber(today) + 1) errors.push({ path: '/observedOn', message: '관측일이 미래 날짜입니다.' })

  // 30일 합계를 일별 원자료에서 재계산해 대조한다.
  const metrics = r.analysisData.metrics
  for (const [name, series] of Object.entries(metrics ?? {})) {
    const base = `/analysisData/metrics/${name}`
    if (!series || !Array.isArray(series.daily)) {
      errors.push({ path: base, message: '일별 원자료(daily)가 없습니다.' })
      continue
    }
    const seen = new Set<string>()
    series.daily.forEach((row, i) => {
      const d = row?.[0]
      if (!isRealIsoDate(d)) errors.push({ path: `${base}/daily/${i}`, message: '실제 존재하는 날짜가 아닙니다.' })
      else if (seen.has(d)) errors.push({ path: `${base}/daily/${i}`, message: `날짜 ${d}가 중복되었습니다.` })
      else seen.add(d)
      for (const v of row.slice(1)) if (v !== null && (typeof v !== 'number' || v < 0)) errors.push({ path: `${base}/daily/${i}`, message: '일별 수치는 0 이상의 숫자여야 합니다.' })
    })
    const sum = (p: { start: string; end: string }) =>
      series.daily.filter((row) => row[0] >= p.start && row[0] <= p.end).reduce((s, row) => s + (Number(row[1]) || 0), 0)
    if (Array.isArray(series.current) && typeof series.current[0] === 'number' && !near(sum(P.current30Days), series.current[0]))
      errors.push({ path: `${base}/current`, message: `최근 30일 합계(${series.current[0]})가 일별 합계(${sum(P.current30Days)})와 다릅니다.` })
    if (Array.isArray(series.previous) && typeof series.previous[0] === 'number' && !near(sum(P.previous30Days), series.previous[0]))
      errors.push({ path: `${base}/previous`, message: `직전 30일 합계(${series.previous[0]})가 일별 합계(${sum(P.previous30Days)})와 다릅니다.` })
  }
  for (const [name, ref] of Object.entries(r.analysisData.refs ?? {})) {
    if (!ref || !Array.isArray(ref.channels)) continue
    sharesWarning(ref.channels.map(([, s]) => ({ sharePercent: Number(s) })), `/analysisData/refs/${name}`, warnings, name)
  }
  warnings.push({ path: '/', message: '종합분석(baseline)은 주간 추이에 포함되지 않고 /baseline 화면에서만 표시됩니다.' })
}

/** 이미 JSON.parse 된 값을 검증한다. today는 테스트용 주입(기본: 한국 날짜). */
export function validateReport(input: unknown, opts: { today?: string } = {}): ValidationResult {
  const errors: Issue[] = []
  const warnings: Issue[] = []
  const today = opts.today ?? kstToday()

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, report: null, errors: [{ path: '/', message: '보고서는 JSON 객체여야 합니다.' }], warnings }
  }
  const obj = input as Record<string, unknown>
  if (obj.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    return {
      ok: false,
      report: null,
      errors: [{ path: '/schemaVersion', message: `지원하지 않는 schemaVersion입니다(지원: ${SUPPORTED_SCHEMA_VERSION}). 임의 변환하지 않습니다.` }],
      warnings,
    }
  }
  genericChecks(input, errors)
  if (errors.length) return { ok: false, report: null, errors, warnings }

  if (!validateSchema(input)) {
    const type = obj.reportType
    for (const e of validateSchema.errors ?? []) {
      // oneOf 분기 중 reportType이 다른 쪽의 오류는 소음이므로 걸러낸다.
      const branch = /^#\/oneOf\/(\d)/.exec(e.schemaPath)?.[1]
      if (branch === '0' && type !== 'weekly') continue
      if (branch === '1' && type !== 'baseline') continue
      if (e.keyword === 'oneOf') continue
      errors.push({ path: e.instancePath || '/', message: `스키마 위반: ${e.message ?? e.keyword}` })
    }
    if (!errors.length) errors.push({ path: '/reportType', message: 'reportType은 weekly 또는 baseline이어야 합니다.' })
    return { ok: false, report: null, errors: dedupe(errors), warnings }
  }

  const report = input as unknown as Report
  if (report.reportType === 'weekly') validateWeekly(report, errors, warnings, today)
  else validateBaseline(report, errors, warnings, today)
  return { ok: errors.length === 0, report: errors.length ? null : report, errors: dedupe(errors), warnings: dedupe(warnings) }
}

function dedupe(list: Issue[]): Issue[] {
  const seen = new Set<string>()
  return list.filter((i) => {
    const k = `${i.path}|${i.message}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/** DB 행으로 옮길 메타데이터. */
export function reportKeys(r: Report) {
  return {
    report_id: r.reportId,
    blog_id: r.blogId,
    report_type: r.reportType,
    observed_on: r.observedOn,
    period_start: r.reportType === 'weekly' ? r.period.start : null,
    period_end: r.reportType === 'weekly' ? r.period.end : null,
  }
}
