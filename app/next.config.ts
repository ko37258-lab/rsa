import type { NextConfig } from 'next'

const securityHeaders = [
  { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
  { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'same-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "base-uri 'self'",
      "object-src 'none'",
    ].join('; '),
  },
]

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // 비공개 데이터: 정적 export/ISR 사용 금지. 모든 페이지는 요청 시 서버에서 인증 후 렌더링한다.
  async headers() {
    return [
      // _next/static 자산(해시 파일)은 데이터가 없으므로 Next 기본 캐시 헤더를 유지한다.
      { source: '/((?!_next/static|_next/image).*)', headers: securityHeaders },
    ]
  },
}

export default nextConfig
