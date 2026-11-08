"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { Logo, cx } from "./ui";

type Me = { id: string; name: string; profileImage: string | null };

export function AppHeader({ right }: { right?: React.ReactNode }) {
  return (
    <Suspense fallback={<header className="sticky top-0 z-30 h-14 border-b border-line bg-paper/90" />}>
      <HeaderInner right={right} />
    </Suspense>
  );
}

function HeaderInner({ right }: { right?: React.ReactNode }) {
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    api<{ user: Me }>("/api/v1/me").then((r) => setMe(r.user)).catch(() => {});
  }, []);
  const nav = [
    { href: "/dashboard", label: "내 디자인" },
    { href: "/developers", label: "API 연동" },
  ];
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-6 px-4 sm:px-6">
        <Link href="/dashboard" aria-label="K 블로그 꾸미기 홈">
          <Logo className="text-[15px]" />
        </Link>
        <nav className="hidden items-center gap-1 sm:flex">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cx(
                "rounded-md px-2.5 py-1.5 text-[13px] font-semibold",
                pathname.startsWith(n.href) ? "bg-paper-2 text-ink" : "text-ink-3 hover:text-ink",
              )}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          {right}
          {me && (
            <div className="flex items-center gap-2">
              {me.profileImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={me.profileImage} alt="" className="size-7 rounded-full border border-line object-cover" />
              ) : (
                <span className="grid size-7 place-items-center rounded-full bg-paper-2 text-xs font-bold text-ink-2">{me.name.slice(0, 1)}</span>
              )}
              <span className="hidden text-[13px] font-semibold text-ink-2 md:inline">{me.name}</span>
              <form action="/api/auth/logout" method="post">
                <button className="rounded-md px-2 py-1 text-[12px] text-ink-3 hover:bg-paper-2 hover:text-ink">로그아웃</button>
              </form>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
