import { redirect } from 'next/navigation'
import { readEnv } from '@/lib/env'

export const dynamic = 'force-dynamic'
export const metadata = { title: '환경 설정 필요' }

export default function SetupPage() {
  const env = readEnv()
  if (env.ok) redirect('/login')
  return (
    <main className="auth-page">
      <div className="auth-card" style={{ maxWidth: 560 }}>
        <div className="brand">
          MR.K<small>BLOG INTELLIGENCE</small>
        </div>
        <h1 style={{ fontSize: 20, marginTop: 18 }}>서버 환경 설정이 필요합니다</h1>
        <p className="note">
          데이터베이스와 로그인이 연결되지 않아 보고서를 표시하지 않습니다. 이 화면은 설정 누락 안내이며, 예시 데이터나 공개 화면으로 대체하지 않습니다.
        </p>
        {env.missing.length > 0 && (
          <>
            <h3>누락된 환경변수</h3>
            <ul className="kv-list">
              {env.missing.map((k) => (
                <li key={k}>
                  <code>{k}</code>
                </li>
              ))}
            </ul>
          </>
        )}
        {env.problems.length > 0 && (
          <>
            <h3 style={{ marginTop: 14 }}>확인이 필요한 설정</h3>
            <ul className="kv-list">
              {env.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </>
        )}
        <p className="note" style={{ marginTop: 16 }}>
          값은 서버 환경변수(.env.local 또는 배포 환경의 비밀 설정)에만 입력하세요. 채팅이나 저장소에 비밀값을 붙여넣지 마세요. 자세한 순서는 app/README.md의
          「환경 설정 체크리스트」를 참고하세요.
        </p>
      </div>
    </main>
  )
}
