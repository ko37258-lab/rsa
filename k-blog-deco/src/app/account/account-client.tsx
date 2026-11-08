"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { Button, Card, Input, Notice, Spinner } from "@/components/ui";

type Me = {
  user: { name: string; email: string | null; profileImage: string | null; provider: string; termsAgreedAt: number | null; memberVerifiedAt: number | null; createdAt: number };
};
type Summary = { projects: number; assets: number; assetBytes: number; tokens: number };

const date = (t: number | null) => (t ? new Date(t).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" }) : "—");
const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)}MB`;

export function AccountClient() {
  const [me, setMe] = useState<Me | null>(null);
  const [sum, setSum] = useState<Summary | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Me>("/api/v1/me").then(setMe).catch((e: Error) => setError(e.message));
    api<Summary>("/api/v1/me/summary").then(setSum).catch(() => {});
  }, []);

  async function withdraw() {
    setBusy(true);
    setError("");
    try {
      await api("/api/v1/me", { method: "DELETE" });
      // 세션이 지워졌으므로 앱 상태를 모두 버리고 첫 화면을 새로 엽니다.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/?withdrawn=1");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  if (!me) return <div className="flex flex-1 justify-center py-20 text-ink-3">{error ? <Notice tone="error">{error}</Notice> : <Spinner />}</div>;
  const u = me.user;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-5 py-10">
      <h1 className="text-[28px] font-extrabold tracking-tight">계정</h1>

      <Card className="divide-y divide-line">
        {[
          ["이름", u.name],
          ["이메일", u.email ?? "제공 안 함"],
          ["로그인", u.provider === "naver" ? "네이버" : u.provider],
          ["가입일", date(u.createdAt)],
          ["약관 동의", date(u.termsAgreedAt)],
          ["회원 확인", u.memberVerifiedAt ? date(u.memberVerifiedAt) : "해당 없음"],
        ].map(([k, v]) => (
          <div key={k} className="flex gap-4 px-5 py-3 text-sm">
            <span className="w-24 shrink-0 font-semibold text-ink-3">{k}</span>
            <span className="min-w-0 break-words">{v}</span>
          </div>
        ))}
      </Card>

      <Card className="p-5">
        <p className="text-sm font-bold">저장된 데이터</p>
        <p className="mt-1.5 text-sm text-ink-2">
          {sum ? `디자인 ${sum.projects}개 · 이미지 ${sum.assets}개 (${mb(sum.assetBytes)}) · API 토큰 ${sum.tokens}개` : "불러오는 중…"}
        </p>
        <p className="mt-3 text-xs text-ink-3">
          <Link href="/terms" className="underline">이용약관</Link> · <Link href="/privacy" className="underline">개인정보처리방침</Link>
        </p>
      </Card>

      <Card className="p-5">
        <p className="text-sm font-bold text-danger">회원 탈퇴</p>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-2">
          디자인, 버전 기록, 올린 사진과 내보낸 위젯 이미지, API 토큰이 모두 바로 삭제되며 되돌릴 수 없습니다. 네이버 블로그에 붙여넣은 위젯 이미지도 더 이상 보이지 않습니다.
        </p>
        {!confirming ? (
          <Button variant="danger" className="mt-4" onClick={() => setConfirming(true)}>탈퇴하기</Button>
        ) : (
          <div className="mt-4 space-y-2.5">
            <label htmlFor="withdraw-confirm" className="block text-sm text-ink-2">확인을 위해 <b>탈퇴</b>라고 입력해 주세요.</label>
            <div className="flex gap-2">
              <Input id="withdraw-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} className="max-w-[160px]" autoComplete="off" />
              <Button variant="danger" onClick={withdraw} disabled={typed.trim() !== "탈퇴" || busy}>{busy ? <Spinner /> : "모든 데이터 삭제하고 탈퇴"}</Button>
              <Button variant="ghost" onClick={() => { setConfirming(false); setTyped(""); }}>취소</Button>
            </div>
          </div>
        )}
        {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
      </Card>
    </main>
  );
}
