import { Sidebar } from '@/components/Sidebar'
import { requireAdminPage } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export default async function PrivateLayout({ children }: { children: React.ReactNode }) {
  // 레이아웃에서 한 번 확인하지만, 각 페이지도 데이터 조회 전에 다시 확인한다.
  const { user } = await requireAdminPage()
  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        본문으로 건너뛰기
      </a>
      <Sidebar email={user.email ?? '관리자'} />
      <main id="main" className="main">
        {children}
      </main>
    </div>
  )
}
