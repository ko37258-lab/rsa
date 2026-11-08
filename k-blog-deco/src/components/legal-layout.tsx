import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "./ui";
import { SiteFooter } from "./site-footer";

export function LegalLayout({ title, effective, children }: { title: string; effective: string; children: ReactNode }) {
  return (
    <main className="flex-1">
      <header className="mx-auto flex h-16 max-w-3xl items-center px-5">
        <Link href="/" aria-label="첫 화면">
          <Logo className="text-base" />
        </Link>
        <nav className="ml-auto flex gap-4 text-[13px] font-semibold text-ink-3">
          <Link href="/terms" className="hover:text-ink">이용약관</Link>
          <Link href="/privacy" className="hover:text-ink">개인정보처리방침</Link>
        </nav>
      </header>
      <article className="mx-auto max-w-3xl px-5 pb-24 pt-6">
        <h1 className="text-[30px] font-extrabold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-ink-3">시행일 {effective}</p>
        <div className="mt-8 space-y-9 text-[15px] leading-relaxed text-ink-2 [&_a]:text-accent-ink [&_a]:underline [&_li]:mb-1.5 [&_ul]:list-disc [&_ul]:pl-5">
          {children}
        </div>
      </article>
      <SiteFooter />
    </main>
  );
}

export function Section({ n, title, id, children }: { n: number; title: string; id?: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6">
      <h2 className="mb-2.5 text-[17px] font-bold text-ink">
        제{n}조 {title}
      </h2>
      {children}
    </section>
  );
}
