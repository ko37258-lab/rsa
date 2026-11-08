"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { Button, Card, Input, Notice } from "@/components/ui";

type Token = { id: string; name: string; prefix: string; lastUsedAt: number | null; createdAt: number };

export function DevelopersClient() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ tokens: Token[] }>("/api/v1/tokens").then((r) => setTokens(r.tokens)).catch((e) => setError(e.message));
  }, []);

  async function create() {
    setError("");
    try {
      const r = await api<{ token: string; record: Token }>("/api/v1/tokens", { body: { name: name.trim() || "API 토큰" } });
      setFresh(r.token);
      setTokens((t) => [r.record, ...t]);
      setName("");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove(t: Token) {
    if (!confirm(`'${t.name}' 토큰을 삭제할까요? 이 토큰을 쓰는 연동이 멈춥니다.`)) return;
    await api(`/api/v1/tokens/${t.id}`, { method: "DELETE" });
    setTokens((ts) => ts.filter((x) => x.id !== t.id));
  }

  return (
    <section className="mt-10">
      <h2 className="text-lg font-extrabold">개인 API 토큰</h2>
      <Card className="mt-4 p-5">
        <div className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="토큰 이름 (예: 사내 자동화)" maxLength={60} />
          <Button variant="primary" onClick={create}>발급</Button>
        </div>
        {fresh && (
          <div className="mt-4">
            <Notice tone="ok">
              새 토큰입니다. <b>지금 한 번만</b> 보여 드리니 안전한 곳에 보관하세요.
              <code className="mt-2 block break-all rounded bg-card px-2 py-1.5 font-mono text-[12px] text-ink">{fresh}</code>
            </Notice>
          </div>
        )}
        {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}
        <ul className="mt-4 divide-y divide-line">
          {tokens.map((t) => (
            <li key={t.id} className="flex items-center gap-3 py-2.5 text-[13px]">
              <span className="font-semibold">{t.name}</span>
              <code className="font-mono text-[12px] text-ink-3">{t.prefix}…</code>
              <span className="ml-auto text-xs text-ink-3">{t.lastUsedAt ? `마지막 사용 ${new Date(t.lastUsedAt).toLocaleDateString("ko-KR")}` : "사용 기록 없음"}</span>
              <Button size="sm" variant="ghost" onClick={() => remove(t)}>삭제</Button>
            </li>
          ))}
          {!tokens.length && <li className="py-3 text-center text-xs text-ink-3">발급한 토큰이 없습니다.</li>}
        </ul>
      </Card>
    </section>
  );
}
