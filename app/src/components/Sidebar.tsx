'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

const LINKS = [
  { href: '/dashboard', label: '주간 대시보드' },
  { href: '/reports', label: '주간 보고서 목록' },
  { href: '/baseline', label: '최초 종합분석' },
]
const ADMIN = [
  { href: '/admin/import', label: 'JSON 업로드' },
  { href: '/admin/integration', label: 'Aside 연결 상태' },
]

export function Sidebar({ email }: { email: string }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  useEffect(() => setOpen(false), [pathname])
  const current = (href: string) => (pathname === href || pathname.startsWith(`${href}/`) ? 'page' : undefined)

  return (
    <>
      <div className="mobile-bar">
        <Link className="brand" href="/dashboard">
          MR.K
        </Link>
        <button type="button" aria-expanded={open} aria-controls="site-nav" onClick={() => setOpen((v) => !v)}>
          {open ? '닫기' : '메뉴'}
        </button>
      </div>
      <aside id="site-nav" className={`sidebar${open ? ' open' : ''}`} aria-label="주 메뉴">
        <Link className="brand" href="/dashboard">
          MR.K<small>BLOG INTELLIGENCE</small>
        </Link>
        <div className="side-name">
          고상철의
          <br />
          부동산법률 · AI중개 · 투자
          <br />
          <span className="mono" style={{ background: 'transparent', color: '#8db5b8', padding: 0 }}>
            ko372
          </span>
        </div>
        <nav className="nav">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} aria-current={current(l.href)}>
              {l.label}
            </Link>
          ))}
          <div className="nav-label">관리</div>
          {ADMIN.map((l) => (
            <Link key={l.href} href={l.href} aria-current={current(l.href)}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="side-bottom">
          PRIVATE REPORT
          <br />
          네이버 관리자 통계 기반
          <br />
          <span title={email}>{email}</span>
          <form method="post" action="/api/auth/logout">
            <button className="btn-ghost-dark" type="submit">
              로그아웃
            </button>
          </form>
        </div>
      </aside>
    </>
  )
}
