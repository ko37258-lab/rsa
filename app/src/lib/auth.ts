import 'server-only'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { readEnv } from './env'
import { createSessionClient } from './supabase/server'

export type AdminContext =
  | { kind: 'config' }
  | { kind: 'anon'; expired: boolean }
  | { kind: 'forbidden'; email: string | null }
  | { kind: 'admin'; user: User; supabase: SupabaseClient }

async function hadSessionCookie(): Promise<boolean> {
  const store = await cookies()
  return store.getAll().some((c) => c.name.startsWith('sb-') && c.name.includes('auth-token'))
}

/**
 * 모든 서버 로더/API에서 호출한다(proxy만 믿지 않는다).
 * auth.getUser()로 Supabase Auth 서버에 토큰을 검증하고, report_admins 소속을 확인한다.
 */
export async function getAdminContext(): Promise<AdminContext> {
  if (!readEnv().ok) return { kind: 'config' }
  const supabase = await createSessionClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return { kind: 'anon', expired: await hadSessionCookie() }
  const user = data.user
  const { data: row, error: memberError } = await supabase
    .from('report_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (memberError || !row) return { kind: 'forbidden', email: user.email ?? null }
  return { kind: 'admin', user, supabase }
}

/** 페이지용: 관리자가 아니면 로그인/거부 화면으로 보낸다. */
export async function requireAdminPage(): Promise<{ user: User; supabase: SupabaseClient }> {
  const ctx = await getAdminContext()
  switch (ctx.kind) {
    case 'config':
      redirect('/setup')
    case 'anon':
      redirect(ctx.expired ? '/login?reason=expired' : '/login')
    case 'forbidden':
      redirect('/forbidden')
    default:
      return { user: ctx.user, supabase: ctx.supabase }
  }
}
