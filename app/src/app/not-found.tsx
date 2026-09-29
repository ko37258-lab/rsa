import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="auth-page">
      <div className="auth-card">
        <h1>페이지를 찾을 수 없습니다</h1>
        <p className="muted">주소를 확인하거나 대시보드로 이동하세요.</p>
        <Link className="button primary" href="/dashboard">대시보드로</Link>
      </div>
    </main>
  )
}
