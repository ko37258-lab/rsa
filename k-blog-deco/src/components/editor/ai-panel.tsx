"use client";

import { useState } from "react";
import { downscaleImage, uploadImage, type Asset } from "@/lib/client/api";
import { Button, Notice, Spinner, Textarea } from "@/components/ui";

export type AiLog = { id: string; instruction: string; note: string; mode: string; at: number };

const QUICK = [
  "전체적으로 더 고급스럽게",
  "버튼을 둥근 알약 모양으로",
  "제목을 더 크고 굵게",
  "사진을 원형으로 바꿔줘",
  "색을 더 밝고 산뜻하게",
  "여백을 넉넉하게, 장식은 줄여줘",
];

export function AiPanel({
  aiMode,
  busy,
  error,
  logs,
  projectId,
  onSubmit,
}: {
  aiMode: "claude" | "template" | null;
  busy: boolean;
  error: string;
  logs: AiLog[];
  projectId: string;
  onSubmit: (instruction: string, referenceAssetIds: string[]) => Promise<boolean>;
}) {
  const [text, setText] = useState("");
  const [refs, setRefs] = useState<Asset[]>([]);
  const [uploading, setUploading] = useState(false);

  async function addRef(file: File) {
    setUploading(true);
    try {
      const a = await uploadImage(await downscaleImage(file), { kind: "reference", projectId, filename: file.name, label: "수정 참고" });
      setRefs((r) => [...r, a].slice(-4));
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    if (!text.trim() || busy) return;
    const okDone = await onSubmit(text.trim(), refs.map((r) => r.id));
    if (okDone) {
      setText("");
      setRefs([]);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line px-4 py-4">
        <p className="text-[12px] font-bold tracking-wide text-ink-3">말로 수정하기</p>
        <p className="mt-1 text-[12px] leading-relaxed text-ink-3">
          {aiMode === "template"
            ? "템플릿 모드: '제목 크게', '버튼 둥글게', '네이비 톤으로 바꿔줘' 같은 간단한 요청만 됩니다."
            : "바꾸고 싶은 점을 자유롭게 적으세요. 참고 이미지를 붙이면 그 느낌으로 고칩니다."}
        </p>
        <Textarea
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
          placeholder="예: 상단 배경을 진한 네이비로 바꾸고, 버튼은 흰 테두리만 있는 스타일로 해줘"
          className="mt-3"
          maxLength={2000}
          disabled={busy}
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {QUICK.map((q) => (
            <button key={q} onClick={() => setText(q)} disabled={busy} className="rounded-full border border-line-2 bg-card px-2.5 py-1 text-[11px] text-ink-2 hover:border-ink-3">
              {q}
            </button>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          {refs.map((r) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={r.id} src={r.url} alt="" className="size-9 rounded border border-line object-cover" />
          ))}
          {aiMode !== "template" && (
            <label className="cursor-pointer rounded-md border border-dashed border-line-2 px-2 py-1.5 text-[11px] font-semibold text-ink-3 hover:border-ink-3">
              {uploading ? "올리는 중…" : "+ 참고 이미지"}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && addRef(e.target.files[0])} />
            </label>
          )}
          <Button variant="accent" className="ml-auto" onClick={submit} disabled={busy || !text.trim()}>
            {busy ? <><Spinner /> 수정 중…</> : "AI 로 수정"}
          </Button>
        </div>
        {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 scroll-thin">
        {logs.length === 0 && <p className="py-6 text-center text-xs text-ink-3">수정 기록이 여기에 쌓입니다.</p>}
        <ul className="space-y-3">
          {logs.map((l) => (
            <li key={l.id} className="text-[12px] leading-relaxed">
              <p className="ml-6 rounded-lg rounded-tr-sm bg-ink px-3 py-2 text-white">{l.instruction}</p>
              <p className="mr-6 mt-1.5 rounded-lg rounded-tl-sm border border-line bg-card px-3 py-2 text-ink-2">{l.note}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
