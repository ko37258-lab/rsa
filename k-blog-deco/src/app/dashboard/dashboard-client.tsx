"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, type AppConfig, type Project } from "@/lib/client/api";
import { Button, Card, Notice, Spinner } from "@/components/ui";

const STATUS: Record<Project["status"], { label: string; cls: string }> = {
  draft: { label: "작성 중", cls: "bg-paper-2 text-ink-3" },
  generating: { label: "생성 중", cls: "bg-accent-soft text-accent-ink" },
  ready: { label: "완성", cls: "bg-[#e8f5ed] text-ok" },
  error: { label: "오류", cls: "bg-accent-soft text-danger" },
};

const fmt = (t: number) =>
  new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(t);

export function DashboardClient() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ projects: Project[] }>("/api/v1/projects").then((r) => setProjects(r.projects)).catch((e) => setError(e.message));
    fetch("/api/config").then((r) => r.json()).then(setCfg).catch(() => {});
  }, []);

  async function remove(p: Project) {
    if (!confirm(`'${p.title}' 디자인을 삭제할까요? 버전 기록도 함께 지워집니다.`)) return;
    await api(`/api/v1/projects/${p.id}`, { method: "DELETE" });
    setProjects((ps) => ps?.filter((x) => x.id !== p.id) ?? null);
  }

  return (
    <main className="mx-auto w-full max-w-[1100px] flex-1 px-5 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-extrabold tracking-tight">내 블로그 디자인</h1>
          <p className="mt-1 text-sm text-ink-3">레퍼런스를 넣고 AI 로 홈페이지형 블로그를 만들어 보세요.</p>
        </div>
        <Link href="/projects/new">
          <Button variant="accent" size="lg">+ 새 디자인 만들기</Button>
        </Link>
      </div>

      {cfg?.ai.mode === "template" && (
        <div className="mt-6">
          <Notice>
            지금은 <b>템플릿 모드</b>입니다. AI 키(ANTHROPIC_API_KEY)를 설정하면 레퍼런스 분석·자유로운 말로 수정이 켜집니다.
          </Notice>
        </div>
      )}
      {error && <div className="mt-6"><Notice tone="error">{error}</Notice></div>}

      {!projects && !error && (
        <div className="mt-16 flex justify-center text-ink-3"><Spinner /></div>
      )}

      {projects && projects.length === 0 && (
        <Card className="mt-10 flex flex-col items-center px-6 py-16 text-center">
          <p className="text-lg font-bold">아직 만든 디자인이 없어요</p>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-3">
            참고하고 싶은 블로그 주소나 캡처 한 장, 그리고 블로그 이름만 있으면 시작할 수 있습니다.
          </p>
          <Link href="/projects/new" className="mt-6"><Button variant="primary">첫 디자인 만들기</Button></Link>
        </Card>
      )}

      {projects && projects.length > 0 && (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <li key={p.id}>
              <Card className="group flex h-full flex-col p-5 transition hover:border-line-2 hover:shadow-[0_12px_30px_-18px_rgba(26,26,25,0.35)]">
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/projects/${p.id}`} className="text-[17px] font-bold leading-snug tracking-tight hover:underline">
                    {p.title}
                  </Link>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS[p.status].cls}`}>{STATUS[p.status].label}</span>
                </div>
                <p className="mt-1.5 line-clamp-2 text-[13px] text-ink-3">{p.brief.tagline || p.brief.industry || "소개 문구 없음"}</p>
                <p className="mt-auto pt-5 text-xs text-ink-3">{fmt(p.updatedAt)} 수정</p>
                <div className="mt-3 flex gap-2">
                  <Link href={`/projects/${p.id}`} className="flex-1"><Button size="sm" className="w-full">편집</Button></Link>
                  {p.currentVersionId && (
                    <Link href={`/projects/${p.id}/export`} className="flex-1"><Button size="sm" className="w-full">내보내기</Button></Link>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => remove(p)} aria-label="삭제">삭제</Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
