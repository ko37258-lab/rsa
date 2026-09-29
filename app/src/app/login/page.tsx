import { redirect } from 'next/navigation'
import { getAdminContext } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const metadata = { title: '로그인' }

const MESSAGES: Record<string, { tone: 'error' | 'info' | 'warn'; text: string }> = {
  invalid: { tone: 'error', text: '이메일 또는 비밀번호가 올바르지 않습니다.' },
  forbidden: { tone: 'error', text: '로그인은 되었지만 관리자로 등록된 계정이 아닙니다. 접근이 거부되었습니다.' },
  rate: { tone: 'warn', text: '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.' },
  origin: { tone: 'error', text: '허용되지 않은 출처에서 보낸 요청입니다. 사이트 주소를 직접 입력해 접속해 주세요.' },
  config: { tone: 'error', text: '서버 환경 설정이 완료되지 않았습니다.' },
  unavailable: { tone: 'error', text: '로그인 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.' },
  expired: { tone: 'warn', text: '세션이 만료되었습니다. 다시 로그인해 주세요.' },
  signed_out: { tone: 'info', text: '로그아웃되었습니다.' },
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await getAdminContext()
  if (ctx.kind === 'config') redirect('/setup')
  if (ctx.kind === 'admin') redirect('/dashboard')
  const sp = await searchParams
  const msg = MESSAGES[sp.error ?? ''] ?? MESSAGES[sp.reason ?? '']
  const next = typeof sp.next === 'string' && sp.next.startsWith('/') && !sp.next.startsWith('//') ? sp.next : '/dashboard'

  return (
    <main className="auth-page">
      <div className="auth-card">
        <div className="brand">
          MR.K<small>BLOG INTELLIGENCE</small>
        </div>
        <h1 style={{ fontSize: 20, marginTop: 18 }}>관리자 로그인</h1>
        <p className="note">비공개 운영 보고서입니다. 등록된 관리자만 열람할 수 있으며 공개 회원가입은 없습니다.</p>
        {ctx.kind === 'forbidden' && (
          <div className="alert error" role="alert">
            현재 로그인한 계정({ctx.email ?? '이메일 없음'})은 관리자로 등록되어 있지 않습니다.
          </div>
        )}
        {msg && (
          <div className={`alert ${msg.tone}`} role={msg.tone === 'error' ? 'alert' : 'status'}>
            {msg.text}
          </div>
        )}
        <form method="post" action="/api/auth/login">
          <input type="hidden" name="next" value={next} />
          <div className="field">
            <label htmlFor="email">이메일</label>
            <input id="email" name="email" type="email" autoComplete="username" required maxLength={254} />
          </div>
          <div className="field">
            <label htmlFor="password">비밀번호</label>
            <input id="password" name="password" type="password" autoComplete="current-password" required maxLength={256} />
          </div>
          <button className="button primary" type="submit" style={{ width: '100%', justifyContent: 'center', padding: '11px' }}>
            로그인
          </button>
        </form>
        {ctx.kind === 'forbidden' && (
          <form method="post" action="/api/auth/logout" style={{ marginTop: 12 }}>
            <button className="button" type="submit" style={{ width: '100%', justifyContent: 'center' }}>
              다른 계정으로 로그인(로그아웃)
            </button>
          </form>
        )}
      </div>
    </main>
  )
}
