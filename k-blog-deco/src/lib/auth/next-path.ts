/** 로그인 후 이동할 경로 — 같은 사이트 내부 경로만 허용 (오픈 리다이렉트 방지) */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/dashboard";
  return next.slice(0, 300);
}
