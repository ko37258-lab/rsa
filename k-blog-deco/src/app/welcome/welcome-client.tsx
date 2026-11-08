"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { Button, Card, Input, Logo, Notice, Spinner, cx } from "@/components/ui";

type Me = {
  user: { name: string; profileImage: string | null };
  termsVersion: string;
  needs: { terms: boolean; member: boolean };
};

const CONSENTS = [
  { key: "agreeTerms", label: "이용약관에 동의합니다", href: "/terms" },
  { key: "agreePrivacy", label: "개인정보 수집·이용에 동의합니다", href: "/privacy" },
  { key: "agreeTransfer", label: "AI 처리를 위한 개인정보 국외 이전에 동의합니다", href: "/privacy#transfer" },
] as const;

type ConsentKey = (typeof CONSENTS)[number]["key"];

export function WelcomeClient() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") || "/dashboard";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  const [me, setMe] = useState<Me | null>(null);
  const [checks, setChecks] = useState<Record<ConsentKey, boolean>>({ agreeTerms: false, agreePrivacy: false, agreeTransfer: false });
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Me>("/api/v1/me")
      .then((r) => {
        if (!r.needs.terms && !r.needs.member) router.replace(safeNext);
        else setMe(r);
      })
      .catch((e: Error) => setError(e.message));
  }, [router, safeNext]);

  const allChecked = CONSENTS.every((c) => checks[c.key]);
  const ready = (!me?.needs.terms || allChecked) && (!me?.needs.member || code.trim().length > 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!me || !ready) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/v1/me/onboarding", { body: { version: me.termsVersion, ...checks, memberCode: code || undefined } });
      router.replace(safeNext);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col items-center px-5 py-12">
      <Link href="/" aria-label="첫 화면"><Logo className="text-base" /></Link>
      <Card className="mt-8 w-full max-w-lg p-7">
        {!me && !error && <div className="flex justify-center py-10 text-ink-3"><Spinner /></div>}
        {error && !me && <Notice tone="error">{error}</Notice>}
        {me && (
          <form onSubmit={submit} className="space-y-6">
            <div>
              <h1 className="text-[22px] font-extrabold tracking-tight">{me.user.name}님, 반갑습니다</h1>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-3">처음 한 번만 확인하면 바로 홈형 블로그를 만들 수 있습니다.</p>
            </div>

            {me.needs.terms && (
              <fieldset className="space-y-3">
                <legend className="mb-2 text-[13px] font-bold text-ink-2">약관 동의</legend>
                <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-line-2 bg-paper px-3.5 py-3 text-sm font-bold">
                  <input
                    id="agree-all"
                    type="checkbox"
                    className="size-4 accent-[#e5532d]"
                    checked={allChecked}
                    onChange={(e) => setChecks({ agreeTerms: e.target.checked, agreePrivacy: e.target.checked, agreeTransfer: e.target.checked })}
                  />
                  모두 동의합니다
                </label>
                <ul className="space-y-2 px-1">
                  {CONSENTS.map((c) => (
                    <li key={c.key} className="flex items-center gap-2.5 text-sm">
                      <input
                        id={c.key}
                        type="checkbox"
                        className="size-4 accent-[#e5532d]"
                        checked={checks[c.key]}
                        onChange={(e) => setChecks((s) => ({ ...s, [c.key]: e.target.checked }))}
                      />
                      <label htmlFor={c.key} className="flex-1 cursor-pointer text-ink-2">
                        <span className="font-semibold text-accent-ink">[필수]</span> {c.label}
                      </label>
                      <Link href={c.href} target="_blank" className="text-xs text-ink-3 underline hover:text-ink">보기</Link>
                    </li>
                  ))}
                </ul>
                <div className="overflow-hidden rounded-lg border border-line text-[12px] leading-relaxed text-ink-2">
                  <table className="w-full">
                    <tbody className="divide-y divide-line">
                      <tr><th className="w-24 bg-paper-2 px-3 py-2 text-left font-semibold">수집 항목</th><td className="px-3 py-2">네이버 회원 식별자·별명·프로필 사진·이메일, 입력한 블로그 정보, 올린 사진과 참고 자료</td></tr>
                      <tr><th className="bg-paper-2 px-3 py-2 text-left font-semibold">이용 목적</th><td className="px-3 py-2">로그인, AI 디자인 생성·보관·내보내기</td></tr>
                      <tr><th className="bg-paper-2 px-3 py-2 text-left font-semibold">국외 이전</th><td className="px-3 py-2">AI 생성 시 Anthropic(미국)으로 입력 내용·이미지 전송</td></tr>
                      <tr><th className="bg-paper-2 px-3 py-2 text-left font-semibold">보유 기간</th><td className="px-3 py-2">회원 탈퇴 시까지 (탈퇴하면 바로 삭제)</td></tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-ink-3">동의하지 않으면 서비스를 이용할 수 없습니다.</p>
              </fieldset>
            )}

            {me.needs.member && (
              <div>
                <label htmlFor="member-code" className="mb-1.5 block text-[13px] font-bold text-ink-2">회원 코드</label>
                <Input id="member-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="강의·회원 안내에서 받은 코드" autoComplete="off" />
                <p className="mt-1.5 text-xs text-ink-3">MR.K 회원 전용 서비스입니다. 코드는 한 번만 입력하면 됩니다.</p>
              </div>
            )}

            {error && <Notice tone="error">{error}</Notice>}

            <div className="flex items-center gap-3">
              <Button type="submit" variant="accent" size="lg" className={cx("flex-1")} disabled={!ready || busy}>
                {busy ? <Spinner /> : "시작하기"}
              </Button>
            </div>
          </form>
        )}
      </Card>
      <form action="/api/auth/logout" method="post" className="mt-4">
        <button className="text-xs text-ink-3 underline hover:text-ink">동의하지 않고 나가기</button>
      </form>
    </main>
  );
}
