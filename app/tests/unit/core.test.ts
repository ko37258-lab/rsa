import { describe, expect, it } from 'vitest'
import { canonicalJson, contentHash, parseIfMatch } from '@/lib/report/hash'
import { decideWrite, type WriteRequest } from '@/lib/report/decide'
import { csvCell, neutralizeFormula, toCsv } from '@/lib/csv'
import { changePercentText, changeText, count, duration, percent, relativeChange } from '@/lib/format'
import { isRealIsoDate, kstToday, lastCompletedNaverWeek } from '@/lib/dates'
import { deriveUpdateStatus, nextPlannedRun } from '@/lib/status'
import { buildWeeklySlots } from '@/lib/report/trend'
import { classifyChannel } from '@/lib/report/traffic'
import { sanitizeSafeMessage } from '@/lib/ops'
import { sniffSourceType } from '@/lib/sources'
import { parseDurationText } from '@/lib/report/baseline'

describe('canonical JSON 해시', () => {
  it('키 순서와 무관, 배열 순서는 보존', () => {
    expect(canonicalJson({ b: 1, a: { d: [2, 1], c: null } })).toBe('{"a":{"c":null,"d":[2,1]},"b":1}')
    expect(contentHash({ a: 1, b: 2 })).toBe(contentHash({ b: 2, a: 1 }))
    expect(contentHash({ a: [1, 2] })).not.toBe(contentHash({ a: [2, 1] }))
    expect(contentHash({})).toMatch(/^[a-f0-9]{64}$/)
  })
  it('비유한 숫자는 해시하지 않는다', () => {
    expect(() => canonicalJson({ a: Infinity })).toThrow()
  })
  it('If-Match는 강한 ETag 하나만 허용', () => {
    const h = 'a'.repeat(64)
    expect(parseIfMatch(`"${h}"`)).toBe(h)
    expect(parseIfMatch(`W/"${h}"`)).toBeNull()
    expect(parseIfMatch('*')).toBeNull()
  })
})

describe('멱등성·동시성 결정', () => {
  const base: WriteRequest = { existingHash: null, newHash: 'n', ifMatch: null, ifMatchRaw: null, ifNoneMatchStar: false, machine: false, correction: false }
  it('신규는 If-None-Match: * 필요', () => {
    expect(decideWrite(base)).toMatchObject({ action: 'reject', status: 428 })
    expect(decideWrite({ ...base, ifNoneMatchStar: true })).toEqual({ action: 'insert' })
  })
  it('동일 해시는 헤더와 무관하게 unchanged', () => {
    expect(decideWrite({ ...base, existingHash: 'n', ifNoneMatchStar: true })).toEqual({ action: 'unchanged' })
    expect(decideWrite({ ...base, existingHash: 'n' })).toEqual({ action: 'unchanged' })
  })
  it('기존과 다른 내용 + If-None-Match: * 는 412', () => {
    expect(decideWrite({ ...base, existingHash: 'o', ifNoneMatchStar: true })).toMatchObject({ status: 412 })
  })
  it('교체는 최신 If-Match 필요, 불일치 412, 없음 428', () => {
    expect(decideWrite({ ...base, existingHash: 'o' })).toMatchObject({ status: 428 })
    expect(decideWrite({ ...base, existingHash: 'o', ifMatch: 'x', ifMatchRaw: '"x"' })).toMatchObject({ status: 412 })
    expect(decideWrite({ ...base, existingHash: 'o', ifMatch: 'o', ifMatchRaw: '"o"' })).toEqual({ action: 'update', expectedHash: 'o' })
  })
  it('수집 토큰은 정정 표시 없이 기존 다른 보고서를 덮어쓰지 못한다(409)', () => {
    expect(decideWrite({ ...base, existingHash: 'o', ifMatch: 'o', ifMatchRaw: '"o"', machine: true })).toMatchObject({ status: 409 })
    expect(decideWrite({ ...base, existingHash: 'o', ifMatch: 'o', ifMatchRaw: '"o"', machine: true, correction: true })).toMatchObject({ action: 'update' })
  })
  it('형식이 틀린 If-Match는 412', () => {
    expect(decideWrite({ ...base, existingHash: 'o', ifMatchRaw: 'garbage' })).toMatchObject({ status: 412 })
  })
})

describe('CSV 수식 실행 방지', () => {
  it('=, +, -, @, 탭으로 시작하면 작은따옴표', () => {
    for (const s of ['=1+1', '+x', '-y', '@SUM(A1)', '\tz']) expect(neutralizeFormula(s).startsWith("'")).toBe(true)
    expect(neutralizeFormula('네이버')).toBe('네이버')
  })
  it('쉼표·따옴표 이스케이프, BOM·CRLF', () => {
    expect(csvCell('a,"b"')).toBe('"a,""b"""')
    const csv = toCsv(['h'], [['=cmd'], [1]])
    expect(csv.startsWith('﻿h\r\n')).toBe(true)
    expect(csv).toContain("'=cmd")
  })
})

describe('한글 숫자 표기', () => {
  it('단위별 표시', () => {
    expect(count(1234)).toBe('1,234회')
    expect(count(12, '명')).toBe('12명')
    expect(duration(95)).toBe('1분 35초')
    expect(duration(7)).toBe('7초')
    expect(changeText('percent', 1.5)).toBe('+1.5%p')
    expect(changeText('seconds', -4)).toBe('−4초')
    expect(percent(12.34)).toBe('12.34%')
  })
  it('값이 없으면 0이 아니라 미수집', () => {
    expect(count(null)).toBe('미수집')
    expect(duration(undefined)).toBe('미수집')
  })
  it('이전 값 0이면 증감률 null(Infinity 금지)', () => {
    expect(relativeChange(3, 0)).toBeNull()
    expect(relativeChange(3, null)).toBeNull()
    expect(changePercentText(null)).toBe('비교 불가')
    expect(relativeChange(150, 120)).toBe(25)
  })
})

describe('날짜', () => {
  it('실제 날짜 검사', () => {
    expect(isRealIsoDate('2026-02-28')).toBe(true)
    expect(isRealIsoDate('2026-02-30')).toBe(false)
    expect(isRealIsoDate('2026-9-1')).toBe(false)
  })
  it('한국시간 기준 최근 완료 월~일 주간', () => {
    // 2026-09-29(화) 12:00 KST
    expect(lastCompletedNaverWeek(new Date('2026-09-29T03:00:00Z'))).toEqual({ start: '2026-09-21', end: '2026-09-27' })
    // 일요일 23:30 KST 에는 아직 그 주가 완료되지 않음
    expect(lastCompletedNaverWeek(new Date('2026-09-27T14:30:00Z'))).toEqual({ start: '2026-09-14', end: '2026-09-20' })
    expect(kstToday(new Date('2026-09-28T15:30:00Z'))).toBe('2026-09-29')
  })
})

describe('갱신 상태', () => {
  const now = new Date('2026-09-29T03:00:00Z')
  const run = (status: 'running' | 'succeeded' | 'needs_login' | 'failed') => ({
    run_id: '1', expected_period_start: '2026-09-21', expected_period_end: '2026-09-27', status, report_id: null, error_code: null, safe_message: null, started_at: now.toISOString(), finished_at: now.toISOString(),
  })
  it('처음 상태는 자동화 미연결이며 예정일이 없다', () => {
    const s = deriveUpdateStatus({ settings: null, runs: [], latestWeeklyEnd: '2026-09-27', now })
    expect(s.state).toBe('unconfigured')
    expect(s.label).toBe('자동화 미연결')
    expect(s.nextPlannedAt).toBeNull()
    expect(s.stale).toBe(false)
  })
  it('실패·로그인 필요 상태와 오래된 데이터 배지', () => {
    expect(deriveUpdateStatus({ settings: null, runs: [run('needs_login')], latestWeeklyEnd: '2026-09-20', now })).toMatchObject({ state: 'needs_login', stale: true })
    expect(deriveUpdateStatus({ settings: null, runs: [run('failed')], latestWeeklyEnd: '2026-09-27', now }).state).toBe('failed')
  })
  it('연결 등록 후 이번 주 보고서가 없으면 대기', () => {
    const settings = { aside_connected: true, first_run_on: '2026-09-29', connected_at: now.toISOString(), note: null, updated_at: now.toISOString() }
    expect(deriveUpdateStatus({ settings, runs: [], latestWeeklyEnd: '2026-09-20', now }).state).toBe('awaiting')
    expect(nextPlannedRun('2026-09-29', now)).toBe('2026-10-06T09:00:00+09:00') // 12:00 KST: 오늘 9시는 지남
    expect(nextPlannedRun('2026-09-29', new Date('2026-09-28T23:00:00Z'))).toBe('2026-09-29T09:00:00+09:00')
    expect(nextPlannedRun('2026-09-22', new Date('2026-09-29T05:00:00Z'))).toBe('2026-10-06T09:00:00+09:00')
  })
})

describe('주간 추이 빈 구간', () => {
  it('없는 주차는 null로 남긴다', () => {
    const m = (v: number) => [{ id: 'pageViews' as const, label: '', unit: 'count' as const, current: v, previous: 0, change: 0, changePercent: null, notes: '' }]
    const slots = buildWeeklySlots(
      [
        { report_id: 'a', period_start: '2026-09-07', period_end: '2026-09-13', metrics: m(10) },
        { report_id: 'b', period_start: '2026-09-21', period_end: '2026-09-27', metrics: m(30) },
      ],
      'pageViews',
    )
    expect(slots.map((s) => s.value)).toEqual([10, null, 30])
  })
})

describe('기타', () => {
  it('유입경로 분류', () => {
    expect(classifyChannel('네이버 블로그_PC')).toBe('naverBlog')
    expect(classifyChannel('네이버 블로그검색_모바일')).toBe('search')
    expect(classifyChannel('Google')).toBe('search')
    expect(classifyChannel('l.threads.com')).toBe('other')
  })
  it('실패 사유 정제', () => {
    expect(sanitizeSafeMessage('로그인 필요 https://nid.naver.com/?x=1 cookie=abc <b>x</b>')).toBe('로그인 필요 [링크 생략] [민감정보 생략] x')
    expect(sanitizeSafeMessage('a'.repeat(500))!.length).toBe(300)
  })
  it('원자료 파일 형식은 내용으로 판정', () => {
    expect(sniffSourceType('a.xlsx', new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1]))).toContain('spreadsheetml')
    expect(sniffSourceType('a.xlsx', new TextEncoder().encode('not zip'))).toBeNull()
    expect(sniffSourceType('a.csv', new TextEncoder().encode('a,b\n1,2'))).toBe('text/csv')
    expect(sniffSourceType('a.exe', new Uint8Array([0x4d, 0x5a]))).toBeNull()
  })
  it('평균 사용 시간 텍스트', () => {
    expect(parseDurationText('3m 32s')).toBe(212)
    expect(parseDurationText('7s')).toBe(7)
    expect(parseDurationText('11m 18s')).toBe(678)
  })
})
