import Link from "next/link";
import { OPERATOR } from "@/lib/legal";

export function SiteFooter() {
  return (
    <footer className="border-t border-line px-5 py-8 text-center text-xs leading-relaxed text-ink-3">
      <nav className="flex flex-wrap justify-center gap-x-4 gap-y-1 font-semibold">
        <Link href="/guide" className="hover:text-ink">따라하기 가이드</Link>
        <Link href="/terms" className="hover:text-ink">이용약관</Link>
        <Link href="/privacy" className="font-bold text-ink-2 hover:text-ink">개인정보처리방침</Link>
        <a href="https://ko372.com/" className="hover:text-ink">ko372.com</a>
      </nav>
      <p className="mt-3">
        {OPERATOR.service} · 운영 {OPERATOR.name} (대표 {OPERATOR.ceo}) · {OPERATOR.email}
      </p>
      <p className="mt-1">네이버 블로그와 제휴 관계가 없는 독립 서비스입니다.</p>
    </footer>
  );
}
