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

let anon: SupabaseClient | null = null

/**
 * 세션 없는 anon 클라이언트. 로그인 전 요청 제한과 수집 토큰 경로에서만 쓴다.
 * 서비스 역할 키는 사용하지 않으며, 모든 쓰기는 DB 함수가 관리자/토큰을 다시 확인한다.
 */
export function createAnonClient(): SupabaseClient {
  if (anon) return anon
  const env = requireEnv()
  anon = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { 'X-Client-Info': 'mrk-blog-insights-server' } },
  })
  return anon
}
