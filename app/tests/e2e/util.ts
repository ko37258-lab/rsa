import fs from 'node:fs'
import path from 'node:path'
import { expect, type APIRequestContext, type Page } from '@playwright/test'
import { DATA_DIR, hasData, readReport } from '../helpers'

export { hasData, readReport, DATA_DIR }
export const ORIGIN = 'http://127.0.0.1:3000'

export function state(): {
  admin: { email: string; password: string }
  viewer: { email: string; password: string; cookies: { name: string; value: string }[] }
} {
  return JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../test-results/e2e-state.json'), 'utf8'))
}

export async function login(page: Page, who: 'admin' | 'viewer' = 'admin') {
  const s = state()[who]
  await page.goto('/login')
  await page.getByLabel('이메일').fill(s.email)
  await page.getByLabel('비밀번호').fill(s.password)
  await page.getByRole('button', { name: '로그인' }).click()
}

/** 실제 파일 내용을 그대로 업로드 입력으로 쓴다(경로 주입은 비ASCII 경로에서 Chromium이 무시함). */
export function reportUpload(kind: 'weekly' | 'baseline') {
  const f = reportFile(kind)
  return { name: path.basename(f), mimeType: 'application/json', buffer: fs.readFileSync(f) }
}

export function reportFile(kind: 'weekly' | 'baseline') {
  const dir = path.join(DATA_DIR, 'reports')
  const f = fs.readdirSync(dir).find((x) => (kind === 'baseline' ? x.includes('_baseline_') : !x.includes('_baseline_') && x.endsWith('.json')))!
  return path.join(dir, f)
}

/** 세션 쿠키로 쓰기 API를 호출(같은 출처 Origin 포함). */
export async function put(req: APIRequestContext, id: string, body: string | object, headers: Record<string, string> = {}) {
  return req.put(`/api/reports/${encodeURIComponent(id)}`, {
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...headers },
    // Playwright는 JSON이 아닌 문자열을 다시 문자열화하므로 원문을 Buffer로 보낸다.
    data: Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)),
  })
}

export const ko = (n: number) => n.toLocaleString('ko-KR')

export async function noHorizontalOverflow(page: Page) {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }))
  expect(sw, '페이지 전체 가로 스크롤 없음').toBeLessThanOrEqual(iw + 1)
}
