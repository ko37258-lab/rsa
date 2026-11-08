"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import JSZip from "jszip";
import { api, uploadImage, type Asset, type Project, type Version } from "@/lib/client/api";
import type { BlogDesignT } from "@/lib/design/schema";
import { ensureFonts, loadAssetImages } from "@/lib/render/fonts";
import { canvasToBlob, renderMobile, renderSkin, renderTitle, renderWidget } from "@/lib/render/canvas";
import { Button, Card, Notice, Spinner } from "@/components/ui";

type GuideSection = { title: string; steps: string[] };
type WidgetCode = { itemId: string; label: string; link: string; imageUrl: string | null; html: string | null };
type ExportInfo = { files: { name: string; width: number; height: number; use: string }[]; guide: GuideSection[]; widgets: WidgetCode[] };
type Rendered = { name: string; label: string; use: string; width: number; height: number; url: string; blob: Blob; itemId?: string };

export function ExportClient() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [design, setDesign] = useState<BlogDesignT | null>(null);
  const [info, setInfo] = useState<ExportInfo | null>(null);
  const [files, setFiles] = useState<Rendered[] | null>(null);
  const [codes, setCodes] = useState<WidgetCode[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const p = await api<{ project: Project; version: Version | null; design: BlogDesignT | null; assets: Asset[] }>(`/api/v1/projects/${id}`);
        setProject(p.project);
        if (!p.design) throw new Error("아직 디자인이 없습니다. 편집기에서 먼저 만들어 주세요.");
        setDesign(p.design);
        const ex = await api<ExportInfo>(`/api/v1/projects/${id}/export`);
        setInfo(ex);

        // 실제 크기로 렌더링 (미리보기와 같은 렌더러)
        await ensureFonts(p.design);
        const images = await loadAssetImages(Object.fromEntries(p.assets.map((a) => [a.id, a.url])));
        const d = p.design;
        const out: Rendered[] = [];
        const push = async (c: HTMLCanvasElement, name: string, label: string, use: string, itemId?: string) => {
          const blob = await canvasToBlob(c);
          out.push({ name, label, use, width: c.width, height: c.height, blob, url: URL.createObjectURL(blob), itemId });
        };
        await push(renderSkin(d, images), "skin-background.png", "스킨 배경 (상단 이미지)", "리모콘 > 스킨배경 > 직접등록");
        for (const [i, it] of d.menu.items.entries()) {
          await push(renderWidget(d, it), `widget-${i + 1}.png`, `버튼 위젯 ${i + 1} · ${it.label}`, "레이아웃·위젯 설정 > 위젯 직접등록", it.id);
        }
        await push(renderMobile(d, images), "mobile-cover.png", "모바일 커버", "블로그 앱 > 홈편집 > 커버 이미지");
        await push(renderTitle(d, images), "title-area.png", "타이틀 이미지 (선택)", "스킨 배경을 쓰지 않을 때 리모콘 > 타이틀에 등록");
        setFiles(out);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [id]);

  function download(f: Rendered) {
    const a = document.createElement("a");
    a.href = f.url;
    a.download = f.name;
    a.click();
  }

  async function downloadZip() {
    if (!files || !info || !project) return;
    setBusy("zip");
    try {
      const zip = new JSZip();
      for (const f of files) zip.file(f.name, f.blob);
      const guide = info.guide.map((s) => `${s.title}\n${s.steps.map((x) => `  - ${x}`).join("\n")}`).join("\n\n");
      zip.file("적용가이드.txt", guide);
      if (codes) zip.file("위젯코드.txt", codes.map((c) => `[${c.label}]\n${c.html ?? "(이미지 주소 없음)"}`).join("\n\n"));
      const blob = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${project.title.replace(/[\\/:*?"<>|]/g, "_")}-네이버블로그.zip`;
      a.click();
    } finally {
      setBusy(null);
    }
  }

  async function makeWidgetCodes() {
    if (!files) return;
    setBusy("codes");
    setError("");
    try {
      const widgetAssets: Record<string, string> = {};
      for (const f of files.filter((x) => x.itemId)) {
        const a = await uploadImage(f.blob, { kind: "export", projectId: id, filename: f.name, label: f.label });
        widgetAssets[f.itemId!] = a.id;
      }
      const r = await api<ExportInfo>(`/api/v1/projects/${id}/export`, { body: { widgetAssets } });
      setCodes(r.widgets);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function copy(text: string, key: string) {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }

  if (error && !files) {
    return (
      <main className="mx-auto max-w-lg flex-1 px-5 py-20">
        <Notice tone="error">{error}</Notice>
        <Link href={`/projects/${id}`} className="mt-4 inline-block text-sm underline">편집기로 돌아가기</Link>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[1100px] flex-1 px-5 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href={`/projects/${id}`} className="text-[13px] font-semibold text-ink-3 hover:text-ink">← 편집기로</Link>
          <h1 className="mt-1 text-[28px] font-extrabold tracking-tight">네이버 블로그에 적용하기</h1>
          <p className="mt-1 text-sm text-ink-3">{project?.title} · 마지막으로 저장한 디자인이 내보내집니다.</p>
        </div>
        <Button variant="accent" size="lg" onClick={downloadZip} disabled={!files || busy === "zip"}>
          {busy === "zip" ? <Spinner /> : "전체 ZIP 받기"}
        </Button>
      </div>

      {!files && <div className="mt-16 flex items-center justify-center gap-2 text-sm text-ink-3"><Spinner /> 실제 크기로 이미지를 만드는 중…</div>}

      {files && design && (
        <>
          <h2 className="mt-10 text-lg font-extrabold">1. 이미지 파일</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {files.map((f) => (
              <Card key={f.name} className={f.name === "skin-background.png" ? "overflow-hidden sm:col-span-2" : "overflow-hidden"}>
                <div className="checker flex max-h-[300px] items-center justify-center overflow-hidden border-b border-line p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.url} alt={f.label} className="max-h-[270px] max-w-full object-contain" />
                </div>
                <div className="flex items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{f.label}</p>
                    <p className="mt-0.5 text-xs text-ink-3">{f.name} · {f.width}×{f.height}px · {f.use}</p>
                  </div>
                  <Button size="sm" onClick={() => download(f)}>PNG 받기</Button>
                </div>
              </Card>
            ))}
          </div>

          <h2 className="mt-12 text-lg font-extrabold">2. 버튼 위젯 코드</h2>
          <p className="mt-1 text-sm text-ink-3">
            버튼 이미지를 인터넷 주소로 올려야 네이버 위젯에서 보입니다. 아래 버튼을 누르면 주소를 만들고, 붙여넣을 코드를 완성합니다.
          </p>
          {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
          {!codes && (
            <Button variant="primary" className="mt-4" onClick={makeWidgetCodes} disabled={busy === "codes"}>
              {busy === "codes" ? <><Spinner /> 올리는 중…</> : "위젯 이미지 주소 만들기"}
            </Button>
          )}
          {codes && (
            <ul className="mt-4 space-y-3">
              {codes.map((c, i) => (
                <li key={c.itemId}>
                  <Card className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-bold">위젯 {i + 1} · {c.label}</p>
                      {c.html && (
                        <Button size="sm" onClick={() => copy(c.html!, c.itemId)}>{copied === c.itemId ? "복사됨 ✓" : "코드 복사"}</Button>
                      )}
                    </div>
                    {!c.link && <p className="mt-1 text-xs text-warn">링크가 비어 있어 블로그 첫 화면으로 연결됩니다. 편집기 &gt; 버튼 탭에서 링크를 넣어 주세요.</p>}
                    <pre className="mt-3 overflow-x-auto rounded-lg bg-ink p-3 text-[12px] leading-relaxed text-white scroll-thin"><code>{c.html ?? "이미지 주소를 만들지 못했습니다."}</code></pre>
                  </Card>
                </li>
              ))}
            </ul>
          )}

          <h2 className="mt-12 text-lg font-extrabold">3. 적용 순서</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {info?.guide.map((s) => (
              <Card key={s.title} className="p-5">
                <p className="font-bold">{s.title}</p>
                <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[13px] leading-relaxed text-ink-2">
                  {s.steps.map((x, i) => <li key={i}>{x}</li>)}
                </ol>
              </Card>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
