"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { AppConfig } from "@/lib/client/api";
import { Notice } from "./ui";

const ERRORS: Record<string, string> = {
  cancelled: "네이버 로그인을 취소했습니다.",
  invalid_state: "로그인 확인 값이 맞지 않습니다. 다시 시도해 주세요.",
  naver_failed: "네이버 로그인 처리 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.",
  naver_error: "네이버에서 로그인을 완료하지 못했습니다.",
  naver_not_configured: "네이버 로그인 키가 아직 설정되지 않았습니다. (.env 의 NAVER_CLIENT_ID / SECRET)",
};

export function LoginActions({ size = "lg" }: { size?: "lg" | "md" }) {
  const sp = useSearchParams();
  const next = sp.get("next") ?? "/dashboard";
  const error = sp.get("login_error");
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  useEffect(() => {
    fetch("/api/config").then((r) => r.json()).then(setCfg).catch(() => {});
  }, []);

  return (
    <div className="flex flex-col items-start gap-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <a
          href={`/api/auth/naver/login?next=${encodeURIComponent(next)}`}
          className={`inline-flex items-center gap-2.5 rounded-lg bg-naver font-bold text-white shadow-sm transition hover:brightness-95 ${
            size === "lg" ? "h-13 px-6 text-[16px]" : "h-10 px-4 text-sm"
          }`}
        >
          <svg viewBox="0 0 20 20" className="size-4" aria-hidden>
            <path fill="currentColor" d="M13.56 10.7 6.17 0H0v20h6.44V9.3L13.83 20H20V0h-6.44z" />
          </svg>
          네이버로 시작하기
        </a>
        {cfg?.devLogin && (
          <form action="/api/auth/dev-login" method="post">
            <button className="h-10 rounded-lg border border-dashed border-line-2 px-3 text-[13px] font-semibold text-ink-3 hover:text-ink">
              개발용 로그인
            </button>
          </form>
        )}
      </div>
      {error && <Notice tone="error">{ERRORS[error] ?? "로그인에 실패했습니다."}</Notice>}
      {cfg && !cfg.naverLogin && !error && (
        <p className="text-xs text-ink-3">※ 네이버 로그인 키가 설정되지 않았습니다. 관리자에게 문의하세요.</p>
      )}
    </div>
  );
}
