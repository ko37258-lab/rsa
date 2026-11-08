"use client";

import { useEffect, useState } from "react";
import { api, type Version } from "@/lib/client/api";
import { Button, Spinner, cx } from "@/components/ui";

const SOURCE: Record<string, string> = {
  "ai-generate": "AI 생성",
  "ai-revise": "AI 수정",
  manual: "직접 편집",
  restore: "되돌림",
  template: "템플릿 생성",
};

export function VersionsPanel({ projectId, currentVersionId, reloadKey, onRestore }: { projectId: string; currentVersionId: string | null; reloadKey: number; onRestore: (versionId: string) => Promise<void> }) {
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    api<{ versions: Version[] }>(`/api/v1/projects/${projectId}/versions`).then((r) => setVersions(r.versions)).catch(() => setVersions([]));
  }, [projectId, reloadKey]);

  if (!versions) return <div className="flex justify-center py-10 text-ink-3"><Spinner /></div>;
  return (
    <div className="px-4 py-4">
      <p className="text-[12px] font-bold tracking-wide text-ink-3">버전 기록</p>
      <p className="mt-1 text-[11px] text-ink-3">저장·AI 수정마다 버전이 남습니다. 되돌려도 기록은 지워지지 않습니다.</p>
      <ul className="mt-3 space-y-2">
        {versions.map((v) => (
          <li key={v.id} className={cx("rounded-lg border px-3 py-2.5", v.id === currentVersionId ? "border-ink bg-card" : "border-line bg-paper")}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-bold">v{v.versionNo} <span className="ml-1 text-[11px] font-semibold text-ink-3">{SOURCE[v.source] ?? v.source}</span></span>
              {v.id === currentVersionId ? (
                <span className="text-[11px] font-bold text-ok">현재</span>
              ) : (
                <Button
                  size="sm"
                  disabled={!!busy}
                  onClick={async () => {
                    setBusy(v.id);
                    try {
                      await onRestore(v.id);
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  {busy === v.id ? <Spinner /> : "되돌리기"}
                </Button>
              )}
            </div>
            <p className="mt-1 text-[11px] text-ink-3">{new Date(v.createdAt).toLocaleString("ko-KR")}</p>
            {v.note && <p className="mt-1.5 line-clamp-4 whitespace-pre-line text-[12px] leading-relaxed text-ink-2">{v.note}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
