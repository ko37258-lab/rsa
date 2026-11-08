import { NextResponse, type NextRequest } from "next/server";

/**
 * 로그인 필요한 화면에 세션 쿠키가 없으면 첫 화면으로 보냅니다 (빠른 1차 확인).
 * 실제 권한 검사는 모든 API 에서 서명 검증으로 다시 합니다.
 */
export function proxy(req: NextRequest) {
  if (!req.cookies.get("kbd_session")) {
    // 리버스 프록시 뒤에서도 공개 주소로 보내도록 APP_URL 우선
    const url = new URL("/", process.env.APP_URL || req.url);
    url.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/projects/:path*", "/developers/:path*", "/account/:path*", "/welcome"],
};
