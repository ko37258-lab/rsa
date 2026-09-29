import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { requireEnv } from '../env'

/** 로그인 사용자 세션으로 동작하는 클라이언트(anon 키 + RLS). 읽기는 이 클라이언트로 한다. */
export async function createSessionClient(): Promise<SupabaseClient> {
  const env = requireEnv()
  const store = await cookies()
  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options)
        } catch {
          // 서버 컴포넌트에서는 쿠키를 쓸 수 없다. 세션 갱신은 proxy.ts가 담당한다.
        }
      },
    },
  })
}

let admin: SupabaseClient | null = null

/**
 * 서비스 역할 클라이언트. RLS를 우회하므로 반드시 서버에서 관리자 확인 또는
 * 수집 토큰 확인을 마친 뒤에만 사용한다. 이 모듈은 브라우저 번들에 포함될 수 없다(server-only).
 */
export function createServiceClient(): SupabaseClient {
  if (admin) return admin
  const env = requireEnv()
  admin = createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { 'X-Client-Info': 'mrk-blog-insights-server' } },
  })
  return admin
}
