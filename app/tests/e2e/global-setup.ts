// 종단 테스트 준비: 로컬 DB 초기화(마이그레이션 재적용) → 테스트 계정 생성 → 관리자 1명만 등록.
// 비밀번호는 실행마다 무작위로 만들고 test-results/(git 제외)에만 저장한다.
import { execSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import pg from 'pg'
import { createServerClient } from '@supabase/ssr'
import { loadEnvLocal } from '../helpers'

export const STATE_FILE = path.resolve(__dirname, '../../test-results/e2e-state.json')

async function createUser(url: string, serviceKey: string, email: string, password: string): Promise<string> {
  const res = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true }),
  })
  if (!res.ok) throw new Error(`createUser failed: ${res.status}`)
  return (await res.json()).id
}

/** @supabase/ssr와 같은 형식의 세션 쿠키를 만든다(비관리자 세션 시나리오용). */
async function sessionCookies(url: string, anon: string, email: string, password: string) {
  const jar: { name: string; value: string }[] = []
  const client = createServerClient(url, anon, {
    cookies: {
      getAll: () => jar,
      setAll: (list) => {
        for (const c of list) {
          const i = jar.findIndex((x) => x.name === c.name)
          if (i >= 0) jar.splice(i, 1)
          if (c.value) jar.push({ name: c.name, value: c.value })
        }
      },
    },
  })
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw error
  return jar
}

export default async function globalSetup() {
  loadEnvLocal()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY!
  if (!url || !service || !process.env.LOCAL_DB_URL) throw new Error('.env.local(로컬 Supabase) 설정이 필요합니다.')
  if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(url)) throw new Error('종단 테스트는 로컬 Supabase에서만 실행합니다(DB 초기화 포함).')

  execSync('npx supabase db reset --local', { cwd: path.resolve(__dirname, '../..'), stdio: 'ignore' })
  // Auth·REST 서비스가 재기동될 때까지 대기
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${url}/auth/v1/health`, { headers: { apikey: anon } })
      if (r.ok) break
    } catch {}
    await new Promise((r) => setTimeout(r, 1000))
  }

  const pw = () => randomBytes(18).toString('base64url')
  const admin = { email: `admin-${Date.now()}@example.test`, password: pw() }
  const viewer = { email: `viewer-${Date.now()}@example.test`, password: pw() }
  const adminId = await createUser(url, service, admin.email, admin.password)
  await createUser(url, service, viewer.email, viewer.password)

  const db = new pg.Client({ connectionString: process.env.LOCAL_DB_URL })
  await db.connect()
  await db.query('INSERT INTO public.report_admins(user_id) VALUES ($1)', [adminId])
  await db.end()

  const viewerCookies = await sessionCookies(url, anon, viewer.email, viewer.password)
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true })
  fs.writeFileSync(STATE_FILE, JSON.stringify({ admin, viewer: { ...viewer, cookies: viewerCookies } }), { mode: 0o600 })
}
