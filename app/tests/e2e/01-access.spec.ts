import { expect, test } from '@playwright/test'
import { ORIGIN, state } from './util'

test.describe('인증 없는 접근 차단', () => {
  test('비공개 페이지는 로그인으로 이동', async ({ page }) => {
    for (const p of ['/dashboard', '/reports', '/reports/ko372_2026-09-21_2026-09-27', '/baseline', '/admin/import', '/admin/integration']) {
      await page.goto(p)
      await expect(page).toHaveURL(/\/login/)
    }
    await expect(page.getByRole('heading', { name: '관리자 로그인' })).toBeVisible()
  })

  test('API·CSV·원자료 다운로드는 401과 no-store', async ({ request }) => {
    const checks = [
      request.get('/api/reports'),
      request.get('/api/reports/ko372_2026-09-21_2026-09-27'),
      request.get('/api/reports/ko372_2026-09-21_2026-09-27/export?kind=channels'),
      request.get('/api/sources/00000000-0000-4000-8000-000000000000'),
      request.get('/api/sources'),
      request.get('/api/collection-runs'),
      request.get('/api/integration'),
      request.put('/api/reports/ko372_2026-09-21_2026-09-27', { headers: { 'Content-Type': 'application/json', Origin: ORIGIN }, data: '{}' }),
      request.post('/api/import/preview', { headers: { 'Content-Type': 'application/json', Origin: ORIGIN }, data: '{}' }),
    ]
    for (const res of await Promise.all(checks)) {
      expect(res.status(), res.url()).toBe(401)
      expect(res.headers()['cache-control']).toContain('no-store')
      const body = await res.json()
      expect(JSON.stringify(body)).not.toMatch(/payload|pageViews/)
    }
  })

  test('잘못된 수집 토큰은 401(사유 비노출)', async ({ request }) => {
    const bad = await request.get('/api/reports/ko372_2026-09-21_2026-09-27', { headers: { Authorization: 'Bearer wrong-token-value-1234567890' } })
    expect(bad.status()).toBe(401)
    expect(await bad.json()).toMatchObject({ error: 'unauthorized' })
    const runs = await request.post('/api/collection-runs', { headers: { Authorization: 'Bearer wrong-token-value-1234567890', 'Content-Type': 'application/json' }, data: '{}' })
    expect(runs.status()).toBe(401)
  })

  test('로그인했지만 관리자가 아닌 계정은 거부', async ({ page, context }) => {
    // 폼 로그인: 관리자 아님 → 즉시 로그아웃 후 안내
    const s = state()
    await page.goto('/login')
    await page.getByLabel('이메일').fill(s.viewer.email)
    await page.getByLabel('비밀번호').fill(s.viewer.password)
    await page.getByRole('button', { name: '로그인' }).click()
    await expect(page).toHaveURL(/error=forbidden/)
    await expect(page.locator('.alert[role=alert]')).toContainText('관리자로 등록된 계정이 아닙니다')

    // 세션이 살아 있는 비관리자(쿠키 직접 주입)도 페이지·API 모두 차단
    await context.addCookies(s.viewer.cookies.map((c) => ({ ...c, domain: '127.0.0.1', path: '/' })))
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/forbidden/)
    await expect(page.getByRole('heading', { name: '접근 권한이 없습니다' })).toBeVisible()
    const api = await page.request.get('/api/reports')
    expect(api.status()).toBe(403)
    const exp = await page.request.get('/api/reports/ko372_2026-09-21_2026-09-27/export?kind=channels')
    expect(exp.status()).toBe(403)
  })

  test('비관리자 JWT로 Supabase REST 직접 조회 시 0행, 직접 쓰기 거부', async ({ request }) => {
    const s = state()
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const tok = await request.post(`${url}/auth/v1/token?grant_type=password`, { headers: { apikey: anon }, data: { email: s.viewer.email, password: s.viewer.password } })
    const jwt = (await tok.json()).access_token as string
    const read = await request.get(`${url}/rest/v1/blog_reports?select=report_id`, { headers: { apikey: anon, Authorization: `Bearer ${jwt}` } })
    expect(read.status()).toBe(200)
    expect(await read.json()).toEqual([])
    const write = await request.post(`${url}/rest/v1/report_admins`, { headers: { apikey: anon, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' }, data: { user_id: '00000000-0000-4000-8000-000000000000' } })
    expect([401, 403]).toContain(write.status())
    const anonRead = await request.get(`${url}/rest/v1/blog_reports?select=report_id`, { headers: { apikey: anon } })
    expect([401, 403]).toContain(anonRead.status())
    // 공개 회원가입 차단
    const signup = await request.post(`${url}/auth/v1/signup`, { headers: { apikey: anon }, data: { email: `new-${Date.now()}@example.test`, password: 'Aa1!'.repeat(5) } })
    expect(signup.ok()).toBe(false)
  })

  test('만료·위조 세션 쿠키는 세션 만료 안내', async ({ page, context }) => {
    await context.addCookies([{ name: 'sb-127-auth-token', value: 'base64-eyJmYWtlIjp0cnVlfQ', domain: '127.0.0.1', path: '/' }])
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/reason=expired/)
    await expect(page.getByRole('status')).toContainText('세션이 만료')
  })

  test('다른 출처의 로그인 POST는 거부', async ({ request }) => {
    const res = await request.post('/api/auth/login', { headers: { Origin: 'https://evil.example', 'Content-Type': 'application/x-www-form-urlencoded' }, data: 'email=a%40b.c&password=x', maxRedirects: 0 })
    expect(res.status()).toBe(303)
    expect(res.headers()['location']).toContain('error=origin')
  })
})
