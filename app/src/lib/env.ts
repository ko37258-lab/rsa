import 'server-only'

export interface ServerEnv {
  supabaseUrl: string
  supabaseAnonKey: string
  serviceRoleKey: string
  ingestToken: string | null
  appOrigin: string
  allowedBlogId: 'ko372'
}

export type EnvStatus =
  | { ok: true; env: ServerEnv }
  | { ok: false; missing: string[]; problems: string[] }

/** 설정 누락 여부만 알려주며 값 자체는 절대 반환·로그하지 않는다. */
export function readEnv(): EnvStatus {
  const missing: string[] = []
  const problems: string[] = []
  const get = (k: string) => {
    const v = process.env[k]?.trim()
    if (!v) missing.push(k)
    return v ?? ''
  }
  const supabaseUrl = get('NEXT_PUBLIC_SUPABASE_URL')
  const supabaseAnonKey = get('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  const serviceRoleKey = get('SUPABASE_SERVICE_ROLE_KEY')
  const appOrigin = get('APP_ORIGIN')
  const blog = process.env.ALLOWED_BLOG_ID?.trim() || 'ko372'
  const token = process.env.REPORT_INGEST_TOKEN?.trim() || null

  if (blog !== 'ko372') problems.push('ALLOWED_BLOG_ID는 현재 ko372만 허용합니다.')
  if (process.env.DEMO_MODE === 'true') problems.push('DEMO_MODE는 이 앱에서 지원하지 않습니다. false로 두고 실제 Supabase를 연결하세요.')
  if (token && token.length < 32) problems.push('REPORT_INGEST_TOKEN은 32자 이상 무작위 값이어야 합니다.')
  if (appOrigin) {
    try {
      const u = new URL(appOrigin)
      if (u.origin !== appOrigin) problems.push('APP_ORIGIN은 경로 없이 https://도메인 형태여야 합니다.')
      if (process.env.NODE_ENV === 'production' && u.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(u.hostname))
        problems.push('운영 환경의 APP_ORIGIN은 https여야 합니다.')
    } catch {
      problems.push('APP_ORIGIN 형식이 올바르지 않습니다.')
    }
  }
  if (supabaseUrl) {
    try {
      new URL(supabaseUrl)
    } catch {
      problems.push('NEXT_PUBLIC_SUPABASE_URL 형식이 올바르지 않습니다.')
    }
  }
  if (serviceRoleKey && serviceRoleKey === supabaseAnonKey) problems.push('서비스 역할 키와 anon 키가 같습니다.')

  if (missing.length || problems.length) return { ok: false, missing, problems }
  return {
    ok: true,
    env: { supabaseUrl, supabaseAnonKey, serviceRoleKey, ingestToken: token, appOrigin, allowedBlogId: 'ko372' },
  }
}

export class ConfigError extends Error {
  constructor() {
    super('server configuration incomplete')
  }
}

export function requireEnv(): ServerEnv {
  const s = readEnv()
  if (!s.ok) throw new ConfigError()
  return s.env
}
