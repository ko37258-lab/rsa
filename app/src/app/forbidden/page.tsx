import { redirect } from 'next/navigation'
import { getAdminContext } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const metadata = { title: '접근 거부' }

export default async function ForbiddenPage() {
  const ctx = await getAdminContext()
  if (ctx.kind === 'config') redirect('/setup')
  if (ctx.kind === 'anon') redirect('/login')
  if (ctx.kind === 'admin') redirect('/dashboard')
  return (
    <main className="auth-page">
      <div className="auth-card">
        <h1 style={{ fontSize: 20 }}>접근 권한이 없습니다</h1>
        <p className="muted">
          로그인한 계정({ctx.email ?? '이메일 없음'})은 관리자 목록(report_admins)에 등록되어 있지 않습니다. 관리자 등록은 데이터베이스 소유자가 직접
          수행해야 하며, 이 사이트에서 스스로 등록할 수 없습니다.
        </p>
        <form method="post" action="/api/auth/logout">
          <button className="button primary" type="submit">
            로그아웃
          </button>
        </form>
      </div>
    </main>
  )
}
