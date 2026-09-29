import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'MR.K 블로그 인사이트', template: '%s | MR.K 블로그 인사이트' },
  description: '비공개 운영 보고서',
  robots: { index: false, follow: false, nocache: true },
  referrer: 'same-origin',
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#132b36' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
