"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type AppConfig, type Asset, type Project, type Version } from "@/lib/client/api";
import type { ArtboardT, BlogDesignT, LayerT } from "@/lib/design/schema";
import { Button, Logo, Notice, Spinner, cx } from "@/components/ui";
import { useAssetImages, useDesignHistory, useFontsReady } from "./hooks";
import { ArtboardEditor } from "./artboard-editor";
import { NaverPreview } from "./naver-preview";
import { LayersPanel } from "./layers-panel";
import { StylePanel } from "./style-panel";
import { MenuPanel } from "./menu-panel";
import { AiPanel, type AiLog } from "./ai-panel";
import { VersionsPanel } from "./versions-panel";

type View = "pc" | "hero" | "mobile";
type Tab = "ai" | "layers" | "style" | "menu" | "versions";

const TABS: { id: Tab; label: string }[] = [
  { id: "ai", label: "AI 수정" },
  { id: "layers", label: "요소" },
  { id: "style", label: "스타일" },
  { id: "menu", label: "버튼" },
  { id: "versions", label: "버전" },
];

const VIEWS: { id: View; label: string }[] = [
  { id: "pc", label: "PC 미리보기" },
  { id: "hero", label: "상단 편집" },
  { id: "mobile", label: "모바일 커버" },
];

export function EditorClient() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  const [loadError, setLoadError] = useState("");
  const { design, set, undo, redo, canUndo, canRedo } = useDesignHistory(null);
  const [savedJson, setSavedJson] = useState("");
  const [currentVersionId, setCurrentVersionId] = useState<string | null>(null);
  const [view, setView] = useState<View>("pc");
  const [tab, setTab] = useState<Tab>("ai");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiLogs, setAiLogs] = useState<AiLog[]>([]);
  const [versionsKey, setVersionsKey] = useState(0);
  const [generating, setGenerating] = useState(false);

  const images = useAssetImages(assets);
  const fontsTick = useFontsReady(design);
  const photos = useMemo(() => assets.filter((a) => a.kind === "photo"), [assets]);
  const dirty = useMemo(() => !!design && JSON.stringify(design) !== savedJson, [design, savedJson]);

  const applyServerDesign = useCallback(
    (d: BlogDesignT, versionId: string | null, reset = false) => {
      set(d, { reset });
      setSavedJson(JSON.stringify(d));
      setCurrentVersionId(versionId);
      setVersionsKey((k) => k + 1);
    },
    [set],
  );

  type Loaded = { project: Project; version: Version | null; design: BlogDesignT | null; assets: Asset[] };

  const applyLoaded = useCallback(
    (r: Loaded) => {
      setProject(r.project);
      setAssets(r.assets);
      if (r.design) applyServerDesign(r.design, r.version?.id ?? null, true);
    },
    [applyServerDesign],
  );

  const load = useCallback(
    () =>
      api<Loaded>(`/api/v1/projects/${id}`)
        .then(applyLoaded)
        .catch((e: Error) => setLoadError(e.message)),
    [id, applyLoaded],
  );

  useEffect(() => {
    api<Loaded>(`/api/v1/projects/${id}`)
      .then(applyLoaded)
      .catch((e: Error) => setLoadError(e.message));
    fetch("/api/config").then((r) => r.json()).then(setCfg).catch(() => {});
  }, [id, applyLoaded]);

  // 다른 창에서 생성 중이면 완료될 때까지 확인
  useEffect(() => {
    if (project?.status !== "generating" || design) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [project?.status, design, load]);

  // 저장하지 않은 변경이 있을 때 창 닫기 경고
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const save = useCallback(async () => {
    if (!design || saving) return;
    setSaving(true);
    setSaveError("");
    try {
      const r = await api<{ version: Version; design: BlogDesignT }>(`/api/v1/projects/${id}/design`, { method: "PUT", body: { design } });
      applyServerDesign(r.design, r.version.id);
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [design, saving, id, applyServerDesign]);

  async function generate() {
    setGenerating(true);
    setLoadError("");
    try {
      const r = await api<{ version: Version; design: BlogDesignT; project: Project }>(`/api/v1/projects/${id}/generate`, { body: {} });
      setProject(r.project);
      applyServerDesign(r.design, r.version.id, true);
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  async function revise(instruction: string, referenceAssetIds: string[]) {
    if (!design) return false;
    setAiBusy(true);
    setAiError("");
    try {
      const r = await api<{ version: Version; design: BlogDesignT; note: string; mode: string }>(`/api/v1/projects/${id}/revise`, {
        body: { instruction, referenceAssetIds, ...(dirty ? { design } : {}) },
      });
      applyServerDesign(r.design, r.version.id);
      setAiLogs((l) => [{ id: r.version.id, instruction, note: r.note, mode: r.mode, at: Date.now() }, ...l]);
      setSelectedId(null);
      return true;
    } catch (e) {
      setAiError((e as Error).message);
      return false;
    } finally {
      setAiBusy(false);
    }
  }

  async function restore(versionId: string) {
    const r = await api<{ version: Version; design: BlogDesignT }>(`/api/v1/projects/${id}/versions/${versionId}/restore`, { body: {} });
    applyServerDesign(r.design, r.version.id);
    setSelectedId(null);
  }

  const which: "hero" | "mobile" = view === "mobile" ? "mobile" : "hero";

  const updateArtboard = useCallback(
    (fn: (ab: ArtboardT) => ArtboardT, merge = false) =>
      set((d) => (which === "hero" ? { ...d, hero: fn(d.hero) } : { ...d, mobile: fn(d.mobile) }), { merge }),
    [set, which],
  );

  const updateLayer = useCallback(
    (lid: string, patch: Partial<LayerT>, merge = false) =>
      updateArtboard((ab) => ({ ...ab, layers: ab.layers.map((l) => (l.id === lid ? ({ ...l, ...patch } as LayerT) : l)) }), merge),
    [updateArtboard],
  );

  const setDesign = useCallback((fn: (d: BlogDesignT) => BlogDesignT, merge = false) => set(fn, { merge }), [set]);

  // 단축키: 저장, 실행 취소/다시 실행, 삭제, 화살표 이동
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = /INPUT|TEXTAREA|SELECT/.test(target.tagName);
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
      } else if (mod && e.key.toLowerCase() === "z" && !typing) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (!typing && selectedId && view !== "pc") {
        if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault();
          updateArtboard((ab) => ({ ...ab, layers: ab.layers.filter((l) => l.id !== selectedId) }));
          setSelectedId(null);
        }
        const step = e.shiftKey ? 10 : 1;
        const delta: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
        if (delta[e.key]) {
          e.preventDefault();
          const [dx, dy] = delta[e.key];
          updateArtboard((ab) => ({ ...ab, layers: ab.layers.map((l) => (l.id === selectedId ? { ...l, x: l.x + dx, y: l.y + dy } : l)) }), true);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save, undo, redo, selectedId, view, updateArtboard]);

  if (loadError && !project) {
    return (
      <main className="mx-auto max-w-lg flex-1 px-5 py-20">
        <Notice tone="error">{loadError}</Notice>
        <Link href="/dashboard" className="mt-4 inline-block text-sm underline">내 디자인으로</Link>
      </main>
    );
  }

  if (!project) return <div className="flex flex-1 items-center justify-center text-ink-3"><Spinner /></div>;

  if (!design) {
    const isGen = generating || project.status === "generating";
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-5 py-20 text-center">
        <p className="text-xl font-extrabold">{project.title}</p>
        {isGen ? (
          <p className="mt-4 flex items-center gap-2 text-sm text-ink-2"><Spinner className="text-accent" /> 디자인을 만들고 있어요. 잠시만 기다려 주세요…</p>
        ) : (
          <>
            <p className="mt-2 text-sm text-ink-3">아직 디자인이 없습니다.</p>
            {project.lastError && <div className="mt-4 max-w-md"><Notice tone="error">지난 생성 실패: {project.lastError}</Notice></div>}
            {loadError && <div className="mt-4 max-w-md"><Notice tone="error">{loadError}</Notice></div>}
            <Button variant="accent" size="lg" className="mt-6" onClick={generate}>디자인 만들기</Button>
          </>
        )}
      </main>
    );
  }

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-card px-3 sm:px-4">
        <Link href="/dashboard" aria-label="내 디자인"><Logo className="text-[14px]" /></Link>
        <span className="text-line-2">/</span>
        <span className="max-w-[220px] truncate text-[14px] font-bold">{project.title}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <Button size="sm" variant="ghost" onClick={undo} disabled={!canUndo} title="실행 취소 (Ctrl+Z)">↶</Button>
          <Button size="sm" variant="ghost" onClick={redo} disabled={!canRedo} title="다시 실행 (Ctrl+Shift+Z)">↷</Button>
          <span className={cx("hidden px-2 text-[12px] sm:inline", dirty ? "text-warn" : "text-ink-3")}>
            {saving ? "저장 중…" : dirty ? "저장 안 됨" : "저장됨"}
          </span>
          <Button size="sm" onClick={save} disabled={!dirty || saving}>저장</Button>
          <Link href={`/projects/${id}/export`} onClick={(e) => { if (dirty && !confirm("저장하지 않은 변경이 있습니다. 저장 없이 내보내기로 이동할까요? (마지막 저장본이 내보내집니다)")) e.preventDefault(); }}>
            <Button size="sm" variant="primary">내보내기 →</Button>
          </Link>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="flex max-h-[45dvh] shrink-0 flex-col border-b border-line bg-card lg:max-h-none lg:w-[340px] lg:border-b-0 lg:border-r">
          <nav className="flex shrink-0 border-b border-line" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={cx("flex-1 border-b-2 py-2.5 text-[13px] font-bold", tab === t.id ? "border-accent text-ink" : "border-transparent text-ink-3 hover:text-ink")}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <div className="min-h-0 flex-1 overflow-y-auto scroll-thin">
            {tab === "ai" && <AiPanel aiMode={cfg?.ai.mode ?? null} busy={aiBusy} error={aiError} logs={aiLogs} projectId={id} onSubmit={revise} />}
            {tab === "layers" && (
              <LayersPanel
                design={design}
                which={which}
                selectedId={selectedId}
                onSelect={(lid) => {
                  setSelectedId(lid);
                  if (lid && view === "pc") setView("hero");
                }}
                updateArtboard={(fn) => updateArtboard(fn)}
                updateLayer={updateLayer}
                photos={photos}
                projectId={id}
                onAssetAdded={(a) => setAssets((as) => [a, ...as])}
              />
            )}
            {tab === "style" && <StylePanel design={design} which={which} set={setDesign} photos={photos} />}
            {tab === "menu" && <MenuPanel design={design} set={setDesign} />}
            {tab === "versions" && <VersionsPanel projectId={id} currentVersionId={currentVersionId} reloadKey={versionsKey} onRestore={restore} />}
          </div>
        </aside>

        <section className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-paper px-4 py-5 sm:px-8 scroll-thin">
          <div className="mx-auto max-w-[1180px]">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <div className="inline-flex rounded-lg border border-line-2 bg-card p-0.5" role="tablist" aria-label="보기">
                {VIEWS.map((v) => (
                  <button
                    key={v.id}
                    role="tab"
                    aria-selected={view === v.id}
                    onClick={() => {
                      setView(v.id);
                      setSelectedId(null);
                    }}
                    className={cx("rounded-md px-3 py-1.5 text-[13px] font-semibold", view === v.id ? "bg-ink text-white" : "text-ink-2 hover:text-ink")}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
              {aiBusy && <span className="flex items-center gap-1.5 text-[12px] text-accent-ink"><Spinner /> AI 가 수정하는 중…</span>}
              {saveError && <span className="text-[12px] text-danger">{saveError}</span>}
            </div>

            <div className={cx("transition-opacity", aiBusy && "pointer-events-none opacity-60")}>
              {view === "pc" && <NaverPreview design={design} assets={images} fontsTick={fontsTick} />}
              {view !== "pc" && (
                <ArtboardEditor
                  design={design}
                  which={which}
                  assets={images}
                  fontsTick={fontsTick}
                  selectedId={selectedId}
                  onSelect={(lid) => {
                    setSelectedId(lid);
                    if (lid) setTab("layers");
                  }}
                  onLayerChange={updateLayer}
                />
              )}
            </div>

            {design.summary && (
              <div className="mx-auto mt-6 max-w-3xl rounded-xl border border-line bg-card px-5 py-4">
                <p className="text-[12px] font-bold text-ink-3">디자인 콘셉트</p>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{design.summary}</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
