import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// 1차 방어선: 세션 쿠키 갱신 + 비로그인 페이지 접근을 로그인으로 보낸다.
// 실제 권한 판정(관리자 여부)은 각 서버 페이지/API에서 다시 수행한다.
const PUBLIC_PAGES = ['/login', '/setup', '/forbidden']

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const isApi = pathname.startsWith('/api/')
  const isPublic = PUBLIC_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`))

  if (!url || !anon) {
    if (isApi || isPublic) return NextResponse.next()
    return NextResponse.redirect(new URL('/setup', request.url))
  }

  let response = NextResponse.next({ request })
  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value)
        response = NextResponse.next({ request })
        for (const { name, value, options } of list) response.cookies.set(name, value, options)
      },
    },
  })
  // 토큰을 Auth 서버에서 검증(getUser)하며 필요 시 갱신한다.
  const { data } = await supabase.auth.getUser()

  if (!data.user && !isApi && !isPublic) {
    const login = new URL('/login', request.url)
    const hadSession = request.cookies.getAll().some((c) => c.name.startsWith('sb-') && c.name.includes('auth-token'))
    if (hadSession) login.searchParams.set('reason', 'expired')
    if (pathname !== '/') login.searchParams.set('next', pathname + request.nextUrl.search)
    const redirect = NextResponse.redirect(login)
    redirect.headers.set('Cache-Control', 'private, no-store')
    return redirect
  }
  response.headers.set('Cache-Control', 'private, no-store, max-age=0')
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
