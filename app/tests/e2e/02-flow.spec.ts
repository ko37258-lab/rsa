import fs from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { clone } from '../helpers'
import { classifyChannel } from '../../src/lib/report/traffic'
import { hasData, ko, login, noHorizontalOverflow, ORIGIN, put, readReport, reportFile, reportUpload } from './util'

test.describe.configure({ mode: 'serial' })
test.skip(!hasData, 'MRK_DATA_DIR(비공개 원자료)가 없어 실제 데이터 종단 테스트를 건너뜁니다.')

const weekly = hasData ? readReport('weekly') : null
const baseline = hasData ? readReport('baseline') : null
const WID = weekly?.reportId as string
const metric = (id: string) => weekly.metrics.find((m: { id: string }) => m.id === id)

let page: Page
test.beforeAll(async ({ browser }) => {
  page = await browser.newPage()
  await login(page, 'admin')
  await expect(page).toHaveURL(/\/dashboard/)
})
test.afterAll(async () => page?.close())

test('초기 상태: 보고서 없음, 자동화 미연결, 가짜 데이터 없음', async () => {
  await page.goto('/dashboard')
  await expect(page.getByText('아직 데이터베이스에 저장된 주간 보고서가 없습니다.')).toBeVisible()
  await page.goto('/admin/integration')
  await expect(page.getByText('자동화 미연결').first()).toBeVisible()
  await expect(page.getByText('수집 이력이 없습니다(자동화 미연결).')).toBeVisible()
  await expect(page.getByText('다음 예정(Aside 기준)')).toHaveCount(0)
})

test('관리자 UI로 실제 JSON 2개 업로드 → DB 재조회 확인 후 완료 표시', async () => {
  await page.goto('/admin/import')
  await page.locator('[data-ready="true"]').waitFor()
  await page.locator('#json-files').setInputFiles([reportUpload('weekly'), reportUpload('baseline')])
  await expect(page.getByText('미리보기 · 아직 저장되지 않음')).toHaveCount(2, { timeout: 20_000 })
  const saveButtons = page.getByRole('button', { name: '데이터베이스에 저장' })
  await expect(saveButtons).toHaveCount(2)
  await saveButtons.first().click()
  await expect(page.getByText('저장 완료 · DB 재조회 확인됨')).toHaveCount(1, { timeout: 20_000 })
  await page.getByRole('button', { name: '데이터베이스에 저장' }).click()
  await expect(page.getByText('저장 완료 · DB 재조회 확인됨')).toHaveCount(2, { timeout: 20_000 })
})

test('주간 대시보드 수치가 원자료와 일치', async () => {
  await page.goto('/dashboard')
  const main = page.locator('main')
  const cards = main.locator('#overview .metric')
  const card = (label: string) => cards.filter({ has: page.locator('.label', { hasText: label }) })
  await expect(card('조회수').locator('.value')).toHaveText(`${ko(metric('pageViews').current)}회`)
  await expect(card('순방문자').locator('.value')).toHaveText(`${ko(metric('uniqueVisitors').current)}명`)
  await expect(card('방문 횟수').locator('.value')).toHaveText(`${ko(metric('visits').current)}회`)
  await expect(card('재방문율').locator('.value')).toHaveText(`${metric('retentionRate').current}%`)
  const rr = metric('retentionRate')
  await expect(card('재방문율').locator('.delta')).toContainText(`+${rr.change}%p`)
  const sec = metric('averageDuration').current
  await expect(card('평균 사용 시간').locator('.value')).toHaveText(`${Math.floor(sec / 60)}분 ${sec % 60}초`)
  await expect(card('이웃 추가수').locator('.value')).toHaveText(`${ko(metric('neighborAdditions').current)}회`)
  // 기간·관측일·저장 시각 분리 표시(오늘 날짜로 재표시하지 않음)
  const scope = main.locator('.scope').first()
  await expect(scope).toContainText(weekly.period.start.replaceAll('-', '.'))
  await expect(scope).toContainText(weekly.comparisonPeriod.start.replaceAll('-', '.'))
  await expect(scope).toContainText(`데이터 관측일 ${weekly.observedOn.replaceAll('-', '.')}`)
  await expect(scope).toContainText('사이트 저장')
  // 유입경로 전체 행 + 합계는 정규화하지 않음
  const channelTable = main.locator('#traffic table').first()
  await expect(channelTable.locator('tbody tr')).toHaveCount(weekly.traffic.channels.length)
  const sum = weekly.traffic.channels.reduce((s: number, c: { sharePercent: number }) => s + c.sharePercent, 0)
  await expect(main.getByText(`원 비중 합계 ${Number(sum.toFixed(2))}%`)).toBeVisible()
  // 누적 추이: 1주뿐이라는 안내, 가짜 주차 없음
  await expect(main.getByText('저장된 주간이 1개뿐입니다.')).toBeVisible()
  // 순위 합계 차이 보존
  await expect(main.locator('.mini-stat', { hasText: '원인 미확인' }).locator('b')).toHaveText(`${ko(weekly.content.unreconciledViews)}회`)
})

test('경로 검색 필터와 CSV 내보내기(수식 방지 포함)', async () => {
  await page.goto('/dashboard')
  await page.waitForLoadState('networkidle')
  const search = page.getByPlaceholder('유입경로 검색')
  await search.fill('검색')
  const visible = page.locator('#traffic tbody tr:not(.is-filtered-out)')
  // 경로명 또는 분류(검색 경유)에 '검색'이 들어간 행
  const expected = weekly.traffic.channels.filter((c: { name: string }) => c.name.includes('검색') || classifyChannel(c.name) === 'search').length
  await expect(visible).toHaveCount(expected)
  const res = await page.request.get(`/api/reports/${WID}/export?kind=channels`)
  expect(res.status()).toBe(200)
  expect(res.headers()['cache-control']).toContain('no-store')
  expect(res.headers()['content-disposition']).toContain('attachment')
  const text = await res.text()
  expect(text.charCodeAt(0)).toBe(0xfeff)
  expect(text.trim().split('\r\n')).toHaveLength(weekly.traffic.channels.length + 1)
  const kw = await page.request.get(`/api/reports/${WID}/export?kind=keywords`)
  expect((await kw.text()).trim().split('\r\n')).toHaveLength(weekly.traffic.keywords.length + 1)
})

test('동일 파일 재업로드: 변경 없음, 보고서 1개·리비전 1개 유지', async () => {
  await page.goto('/admin/import')
  await page.locator('[data-ready="true"]').waitFor()
  await page.locator('#json-files').setInputFiles(reportUpload('weekly'))
  await expect(page.getByText('변경 없음 · 이미 동일한 내용이 저장됨')).toBeVisible({ timeout: 20_000 })
  const direct = await put(page.request, WID, fs.readFileSync(reportFile('weekly'), 'utf8'), { 'If-None-Match': '*' })
  expect(direct.status()).toBe(200)
  expect((await direct.json()).result).toBe('unchanged')
  const list = await (await page.request.get('/api/reports')).json()
  expect(list.reports).toHaveLength(1)
  expect(list.reports[0].revisionCount).toBe(1)
})

test('같은 ID 다른 데이터: 변경 미리보기 → 확인 후에만 교체, 이전 리비전 보존', async () => {
  const changed = clone(weekly)
  const nb = changed.metrics.find((m: { id: string }) => m.id === 'neighborAdditions')
  nb.previous = 0
  nb.change = nb.current
  nb.changePercent = null // 이전 값 0 → 증감률 없음
  changed.limitations.push('검증용 수정 리비전(테스트)')
  await page.goto('/admin/import')
  await page.locator('[data-ready="true"]').waitFor()
  await page.locator('#json-files').setInputFiles({ name: 'changed.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(changed)) })
  await expect(page.getByText('같은 ID의 다른 보고서가 이미 저장되어 있습니다.')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('cell', { name: 'metrics.neighborAdditions.previous' })).toBeVisible()
  const replace = page.getByRole('button', { name: '확인 후 교체 저장' })
  await expect(replace).toBeDisabled()
  await page.getByLabel('기존 보고서를 이 파일로 교체하고 이전 내용은 리비전으로 보존하는 데 동의합니다.').check()
  await replace.click()
  await expect(page.getByText('저장 완료 · DB 재조회 확인됨')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('교체 저장(이전 리비전 보존)')).toBeVisible()

  await page.goto(`/reports/${WID}`)
  const revRows = page.locator('#rev-h').locator('xpath=ancestor::section').locator('tbody tr')
  await expect(revRows).toHaveCount(2)
  // 이전 증감률 null → '비교 불가'
  await expect(page.locator('#overview').getByText('비교 불가').first()).toBeVisible()
  // 이전 리비전 그대로 보기
  await page.getByRole('link', { name: '이 리비전 보기' }).click()
  await expect(page.getByText(/이전 리비전 #\d+/)).toBeVisible()
  await expect(page.getByText('검증용 수정 리비전(테스트)')).toHaveCount(0)
})

test('동시 수정/잘못된 If-Match는 412, 헤더 없으면 428, 리비전 유실 없음', async () => {
  const cur = await page.request.get(`/api/reports/${WID}`)
  const etag = cur.headers()['etag']
  const other = clone(weekly)
  other.limitations.push('경쟁 쓰기')
  const stale = await put(page.request, WID, other, { 'If-Match': `"${'0'.repeat(64)}"` })
  expect(stale.status()).toBe(412)
  const create = await put(page.request, WID, other, { 'If-None-Match': '*' })
  expect(create.status()).toBe(412)
  expect((await create.json()).currentEtag).toBe(etag)
  const none = await put(page.request, WID, other)
  expect(none.status()).toBe(428)
  // 같은 ETag로 동시에 두 요청 → 하나만 성공
  const a = clone(weekly)
  a.limitations.push('A')
  const b = clone(weekly)
  b.limitations.push('B')
  const [ra, rb] = await Promise.all([put(page.request, WID, a, { 'If-Match': etag }), put(page.request, WID, b, { 'If-Match': etag })])
  expect([ra.status(), rb.status()].sort()).toEqual([200, 412])
  const list = await (await page.request.get('/api/reports')).json()
  expect(list.reports[0].revisionCount).toBe(3)
})

test('잘못된 입력 거부: 기간 6/8일, ID 불일치, 음수, 날짜, NaN, 과대 본문, 위험 URL, 다른 출처', async () => {
  const mk = (fn: (r: any) => void) => {
    const r = clone(weekly)
    fn(r)
    return r
  }
  const cases: [string, string | object, number][] = [
    ['6일', mk((r) => { r.period.end = '2026-09-26'; r.reportId = 'ko372_2026-09-21_2026-09-26' }), 422],
    ['8일', mk((r) => { r.period.end = '2026-09-28'; r.reportId = 'ko372_2026-09-21_2026-09-28' }), 422],
    ['ID 불일치', mk((r) => { r.reportId = 'ko372_2026-09-14_2026-09-20' }), 422],
    ['음수', mk((r) => { r.metrics[0].current = -5 }), 422],
    ['없는 날짜', mk((r) => { r.observedOn = '2026-02-30' }), 422],
    ['위험 URL', mk((r) => { r.sources = [{ label: 'x', url: 'javascript:alert(1)' }] }), 422],
    ['NaN', JSON.stringify(weekly).replace(/"current":\d+/, '"current":NaN'), 400],
    ['JSON 아님', '{not json', 400],
  ]
  for (const [name, body, status] of cases) {
    const target = typeof body === 'object' && (body as { reportId: string }).reportId ? (body as { reportId: string }).reportId : WID
    const res = await put(page.request, name === 'ID 불일치' ? WID : target, body, { 'If-None-Match': '*' })
    expect(res.status(), name).toBe(status)
  }
  const big = '{"x":"' + 'a'.repeat(2 * 1024 * 1024 + 10) + '"}'
  expect((await put(page.request, WID, big, { 'If-None-Match': '*' })).status()).toBe(413)
  const evil = await page.request.put(`/api/reports/${WID}`, { headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' }, data: JSON.stringify(weekly) })
  expect(evil.status()).toBe(403)
  const txt = await page.request.put(`/api/reports/${WID}`, { headers: { 'Content-Type': 'text/plain', Origin: ORIGIN }, data: JSON.stringify(weekly) })
  expect(txt.status()).toBe(415)
  const list = await (await page.request.get('/api/reports')).json()
  expect(list.reports).toHaveLength(1)
})

test('최초 종합분석 화면: 30일 비교·주간/월간 유입 분리', async () => {
  await page.goto('/baseline')
  await page.waitForLoadState('networkidle')
  const pvSeries = baseline.analysisData.metrics['조회수_일간']
  await expect(page.locator('.hero-status')).toContainText(`${ko(pvSeries.previous[0])}회 → ${ko(pvSeries.current[0])}회`)
  const pct = ((pvSeries.current[0] / pvSeries.previous[0] - 1) * 100).toFixed(1)
  await expect(page.locator('.hero-status b')).toHaveText(`+${pct}%`)
  const uv = baseline.analysisData.metrics['순방문자수_일간']
  const uvCard = page.locator('.metric', { has: page.locator('.label', { hasText: '일평균 순방문자' }) })
  await expect(uvCard.locator('.value')).toHaveText(`${(uv.current[0] / 30).toFixed(1).replace(/\.0$/, '')}명`)
  await expect(uvCard.locator('.delta')).toContainText(`${(uv.previous[0] / 30).toFixed(1)}명`)
  // 주간 유입 20개 → 월간 19개 전환
  const table = page.locator('#b-acq').locator('xpath=ancestor::section').locator('table').first()
  await expect(table.locator('tbody tr')).toHaveCount(baseline.analysisData.refs['유입분석_주간'].channels.length)
  await page.getByRole('button', { name: /월간 참고/ }).click()
  await expect(table.locator('tbody tr')).toHaveCount(baseline.analysisData.refs['유입분석_월간'].channels.length)
  await expect(page.getByText('전월 대비 증감률로 비교하지 않습니다.')).toBeVisible()
  // baseline은 주간 목록에 들어가지 않는다
  const list = await (await page.request.get('/api/reports')).json()
  expect(list.reports.every((r: { reportType: string }) => r.reportType === 'weekly')).toBe(true)
})

test('보고서 목록·연도 필터·기간 선택', async () => {
  await page.goto('/reports')
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await page.getByLabel('연도').selectOption('2026')
  await page.getByRole('button', { name: '적용' }).click()
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await page.getByLabel('기간 선택').selectOption(WID)
  await page.getByRole('button', { name: '이동' }).click()
  await expect(page).toHaveURL(new RegExp(`/reports/${WID}`))
  await expect(page.getByText('← 이전 주 없음')).toBeVisible()
})

test('수집 토큰: 로그인 필요·실패 기록 시 마지막 정상 보고서 유지, 성공은 저장 확인 후', async ({ request }) => {
  const auth = { Authorization: `Bearer ${process.env.REPORT_INGEST_TOKEN}`, 'Content-Type': 'application/json' }
  const get = await request.get(`/api/reports/${WID}`, { headers: { Authorization: auth.Authorization } })
  expect(get.status()).toBe(200)
  const etag = get.headers()['etag']
  // 다른 내용 자동 덮어쓰기 금지
  const other = clone(weekly)
  other.limitations.push('자동 덮어쓰기 시도')
  const blocked = await request.put(`/api/reports/${WID}`, { headers: { ...auth, 'If-Match': etag }, data: JSON.stringify(other) })
  expect(blocked.status()).toBe(409)

  const start = await request.post('/api/collection-runs', { headers: auth, data: { expectedPeriodStart: weekly.period.start, expectedPeriodEnd: weekly.period.end, status: 'running' } })
  expect(start.status()).toBe(201)
  const { runId } = await start.json()
  const fail = await request.patch(`/api/collection-runs/${runId}`, {
    headers: auth,
    data: { status: 'needs_login', errorCode: 'naver_login_required', safeMessage: '네이버 로그인 필요 https://nid.naver.com/login?token=abc' },
  })
  expect(fail.status()).toBe(200)
  const again = await request.patch(`/api/collection-runs/${runId}`, { headers: auth, data: { status: 'failed' } })
  expect(again.status()).toBe(409)

  await page.goto('/dashboard')
  await expect(page.getByText('네이버 로그인 필요').first()).toBeVisible()
  await expect(page.getByText('마지막 정상 보고서와 관측일은 그대로 유지')).toBeVisible()
  await expect(page.locator('.scope').first()).toContainText(`데이터 관측일 ${weekly.observedOn.replaceAll('-', '.')}`)
  await page.goto('/admin/integration')
  await expect(page.getByText('[링크 생략]').first()).toBeVisible()
  await expect(page.locator('body')).not.toContainText('token=abc')

  // 성공 기록은 실제 저장된 보고서가 있어야만 가능
  const run2 = await (await request.post('/api/collection-runs', { headers: auth, data: { expectedPeriodStart: weekly.period.start, expectedPeriodEnd: weekly.period.end, status: 'running' } })).json()
  const wrong = await request.patch(`/api/collection-runs/${run2.runId}`, { headers: auth, data: { status: 'succeeded', reportId: 'ko372_2026-09-14_2026-09-20' } })
  expect(wrong.status()).toBe(422)
  const ok = await request.patch(`/api/collection-runs/${run2.runId}`, { headers: auth, data: { status: 'succeeded', reportId: WID } })
  expect(ok.status()).toBe(200)
  await page.goto('/admin/integration')
  await expect(page.locator('.card').filter({ hasText: '갱신 상태' }).getByText('정상 저장')).toBeVisible()
})

test('반응형 390/768/1440 가로 넘침 없음, 인쇄 시 숨긴 행 출력', async () => {
  for (const [w, h] of [[390, 844], [768, 1024], [1440, 900]]) {
    await page.setViewportSize({ width: w, height: h })
    for (const p of ['/dashboard', `/reports/${WID}`, '/baseline', '/reports', '/admin/import', '/admin/integration']) {
      await page.goto(p)
      await noHorizontalOverflow(page)
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`/reports/${WID}`)
  await page.waitForLoadState('networkidle')
  const hiddenPost = page.locator('#content tbody tr').nth(weekly.content.posts.length - 1)
  await expect(hiddenPost).toBeHidden()
  await page.emulateMedia({ media: 'print' })
  await expect(hiddenPost).toBeVisible()
  await expect(page.locator('.sidebar')).toBeHidden()
  await page.emulateMedia({ media: 'screen' })
})

test('보안 헤더·새로고침/새 세션 후에도 DB 데이터 유지·로그아웃', async ({ browser }) => {
  const res = await page.goto('/dashboard')
  expect(res!.headers()['cache-control']).toContain('no-store')
  expect(res!.headers()['x-frame-options']).toBe('DENY')
  expect(res!.headers()['content-security-policy']).toContain("frame-ancestors 'none'")
  await page.reload()
  await expect(page.locator('#overview .metric .value').first()).toHaveText(`${ko(metric('pageViews').current)}회`)
  const fresh = await browser.newPage()
  await login(fresh, 'admin')
  await expect(fresh.locator('#overview .metric .value').first()).toHaveText(`${ko(metric('pageViews').current)}회`)
  await fresh.getByRole('button', { name: '로그아웃' }).click()
  await expect(fresh).toHaveURL(/reason=signed_out/)
  await fresh.goto('/dashboard')
  await expect(fresh).toHaveURL(/\/login/)
  await fresh.close()
})
