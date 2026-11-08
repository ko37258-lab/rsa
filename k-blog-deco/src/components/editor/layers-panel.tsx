"use client";

import { useState } from "react";
import type { ArtboardT, BlogDesignT, LayerT } from "@/lib/design/schema";
import { nearestWeight, FONTS } from "@/lib/design/fonts";
import { downscaleImage, uploadImage, type Asset } from "@/lib/client/api";
import { Button, Textarea, cx } from "@/components/ui";
import { ColorInput, FillEditor, FontSelect, Group, NumberInput, Row, Select, Slider, Toggle } from "./controls";

const TYPE_LABEL: Record<LayerT["type"], string> = { text: "글자", rect: "사각형", ellipse: "원", image: "사진" };
const TYPE_ICON: Record<LayerT["type"], string> = { text: "T", rect: "▭", ellipse: "◯", image: "▣" };

let seq = 0;
const newLayerId = (t: string) => `${t}-${Date.now().toString(36)}${(seq++).toString(36)}`;

export function newLayer(type: LayerT["type"], d: BlogDesignT, ab: ArtboardT): LayerT {
  const base = { id: newLayerId(type), x: Math.round(ab.width / 2 - 120), y: Math.round(ab.height / 2 - 40), opacity: 1, rotation: 0 };
  switch (type) {
    case "text":
      return { ...base, type, name: "새 글자", w: 240, h: 40, text: "새 문구를 입력하세요", font: d.fonts.body, size: 28, weight: nearestWeight(d.fonts.body, 700), color: d.palette.text, align: "left", lineHeight: 1.3, letterSpacing: 0, shadow: null };
    case "rect":
      return { ...base, type, name: "사각형", w: 240, h: 80, fill: { type: "solid", color: d.palette.accent }, radius: 12, stroke: null, shadow: null };
    case "ellipse":
      return { ...base, type, name: "원", w: 120, h: 120, fill: { type: "solid", color: d.palette.secondary }, stroke: null };
    case "image":
      return { ...base, type, name: "사진", w: 240, h: 180, assetId: null, placeholder: "사진", fit: "cover", shape: "rect", radius: 16, stroke: null, shadow: null };
  }
}

export function LayersPanel({
  design,
  which,
  selectedId,
  onSelect,
  updateArtboard,
  updateLayer,
  photos,
  projectId,
  onAssetAdded,
}: {
  design: BlogDesignT;
  which: "hero" | "mobile";
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  updateArtboard: (fn: (ab: ArtboardT) => ArtboardT) => void;
  updateLayer: (id: string, patch: Partial<LayerT>, merge?: boolean) => void;
  photos: Asset[];
  projectId: string;
  onAssetAdded: (a: Asset) => void;
}) {
  const ab = which === "hero" ? design.hero : design.mobile;
  const sel = ab.layers.find((l) => l.id === selectedId) ?? null;
  const ordered = [...ab.layers].reverse(); // 위에 있는 레이어가 목록 위로

  const move = (id: string, dir: 1 | -1) =>
    updateArtboard((a) => {
      const i = a.layers.findIndex((l) => l.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= a.layers.length) return a;
      const layers = [...a.layers];
      [layers[i], layers[j]] = [layers[j], layers[i]];
      return { ...a, layers };
    });

  const remove = (id: string) => {
    updateArtboard((a) => ({ ...a, layers: a.layers.filter((l) => l.id !== id) }));
    onSelect(null);
  };

  const duplicate = (l: LayerT) => {
    const copy = { ...structuredClone(l), id: newLayerId(l.type), name: `${l.name} 복사`, x: l.x + 16, y: l.y + 16 } as LayerT;
    updateArtboard((a) => ({ ...a, layers: [...a.layers, copy] }));
    onSelect(copy.id);
  };

  const add = (t: LayerT["type"]) => {
    const l = newLayer(t, design, ab);
    updateArtboard((a) => ({ ...a, layers: [...a.layers, l] }));
    onSelect(l.id);
  };

  return (
    <div>
      <Group title="레이어" right={<span className="text-[11px] text-ink-3">{ab.layers.length}개</span>}>
        <div className="mb-2 grid grid-cols-4 gap-1.5">
          {(["text", "image", "rect", "ellipse"] as const).map((t) => (
            <Button key={t} size="sm" onClick={() => add(t)} className="px-1">
              + {TYPE_LABEL[t]}
            </Button>
          ))}
        </div>
        <ul className="max-h-56 overflow-y-auto rounded-lg border border-line scroll-thin">
          {ordered.map((l) => (
            <li key={l.id}>
              <button
                onClick={() => onSelect(l.id)}
                className={cx(
                  "flex w-full items-center gap-2 border-b border-line px-2.5 py-1.5 text-left text-[12px] last:border-b-0",
                  l.id === selectedId ? "bg-accent-soft font-bold text-accent-ink" : "hover:bg-paper",
                )}
              >
                <span className="grid size-5 shrink-0 place-items-center rounded bg-paper-2 font-mono text-[10px] text-ink-2">{TYPE_ICON[l.type]}</span>
                <span className="truncate">{l.type === "text" ? l.text.split("\n")[0] : l.name}</span>
              </button>
            </li>
          ))}
          {!ab.layers.length && <li className="px-3 py-4 text-center text-xs text-ink-3">레이어가 없습니다</li>}
        </ul>
      </Group>

      {sel && (
        <>
          <Group
            title={`선택: ${TYPE_LABEL[sel.type]}`}
            right={
              <div className="flex gap-1">
                <IconBtn label="앞으로" onClick={() => move(sel.id, 1)}>↑</IconBtn>
                <IconBtn label="뒤로" onClick={() => move(sel.id, -1)}>↓</IconBtn>
                <IconBtn label="복제" onClick={() => duplicate(sel)}>⧉</IconBtn>
                <IconBtn label="삭제" onClick={() => remove(sel.id)} danger>✕</IconBtn>
              </div>
            }
          >
            <Row label="이름">
              <input value={sel.name} onChange={(e) => updateLayer(sel.id, { name: e.target.value }, true)} className="h-7 w-40 rounded border border-line-2 bg-card px-1.5 text-[12px]" />
            </Row>
            <Row label="위치 X / Y">
              <NumberInput value={sel.x} onChange={(v) => updateLayer(sel.id, { x: v }, true)} />
              <NumberInput value={sel.y} onChange={(v) => updateLayer(sel.id, { y: v }, true)} />
            </Row>
            <Row label="크기 W / H">
              <NumberInput value={sel.w} min={1} onChange={(v) => updateLayer(sel.id, { w: v }, true)} />
              <NumberInput value={sel.h} min={1} onChange={(v) => updateLayer(sel.id, { h: v }, true)} />
            </Row>
            <Row label="투명도"><Slider value={sel.opacity} min={0} max={1} step={0.05} onChange={(v) => updateLayer(sel.id, { opacity: v }, true)} /></Row>
            <Row label="회전"><Slider value={sel.rotation} min={-180} max={180} onChange={(v) => updateLayer(sel.id, { rotation: v }, true)} /></Row>
          </Group>
          <LayerProps layer={sel} update={(p, m) => updateLayer(sel.id, p, m)} photos={photos} projectId={projectId} onAssetAdded={onAssetAdded} />
        </>
      )}
      {!sel && <p className="px-4 py-6 text-center text-xs leading-relaxed text-ink-3">미리보기에서 요소를 클릭하면 여기서 글자·색·크기를 고칠 수 있어요.<br />끌어서 옮기고, 오른쪽 아래 점을 끌어 크기를 바꿉니다.</p>}
    </div>
  );
}

function IconBtn({ label, onClick, children, danger }: { label: string; onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button title={label} aria-label={label} onClick={onClick} className={cx("grid size-6 place-items-center rounded border border-line-2 bg-card text-[12px] hover:bg-paper-2", danger && "text-danger")}>
      {children}
    </button>
  );
}

function LayerProps({
  layer: l,
  update,
  photos,
  projectId,
  onAssetAdded,
}: {
  layer: LayerT;
  update: (p: Partial<LayerT>, merge?: boolean) => void;
  photos: Asset[];
  projectId: string;
  onAssetAdded: (a: Asset) => void;
}) {
  const [uploading, setUploading] = useState(false);
  if (l.type === "text") {
    return (
      <Group title="글자">
        <Textarea rows={3} value={l.text} onChange={(e) => update({ text: e.target.value } as Partial<LayerT>, true)} className="mb-2 text-[13px]" />
        <Row label="폰트"><FontSelect value={l.font} onChange={(f) => update({ font: f, weight: nearestWeight(f, l.weight) } as Partial<LayerT>)} /></Row>
        <Row label="크기 / 굵기">
          <NumberInput value={l.size} min={8} max={400} onChange={(v) => update({ size: v } as Partial<LayerT>, true)} />
          <Select
            value={String(l.weight)}
            onChange={(v) => update({ weight: Number(v) } as Partial<LayerT>)}
            options={FONTS[l.font].weights.map((w) => ({ value: String(w), label: String(w) }))}
          />
        </Row>
        <Row label="색"><ColorInput value={l.color} onChange={(c) => update({ color: c } as Partial<LayerT>, true)} /></Row>
        <Row label="정렬">
          <Select value={l.align} onChange={(v) => update({ align: v } as Partial<LayerT>)} options={[{ value: "left", label: "왼쪽" }, { value: "center", label: "가운데" }, { value: "right", label: "오른쪽" }]} />
        </Row>
        <Row label="줄 간격"><Slider value={l.lineHeight} min={0.8} max={2.5} step={0.05} onChange={(v) => update({ lineHeight: v } as Partial<LayerT>, true)} /></Row>
        <Row label="자간"><Slider value={l.letterSpacing} min={-5} max={20} step={0.5} onChange={(v) => update({ letterSpacing: v } as Partial<LayerT>, true)} /></Row>
        <Row label="그림자">
          <Toggle checked={!!l.shadow} onChange={(on) => update({ shadow: on ? { color: "#00000059", blur: 8, x: 0, y: 2 } : null } as Partial<LayerT>)} />
        </Row>
      </Group>
    );
  }
  if (l.type === "rect" || l.type === "ellipse") {
    return (
      <Group title="도형">
        <FillEditor value={l.fill} onChange={(f) => update({ fill: f } as Partial<LayerT>, true)} />
        {l.type === "rect" && <Row label="모서리 둥글기"><Slider value={l.radius} min={0} max={200} onChange={(v) => update({ radius: v } as Partial<LayerT>, true)} /></Row>}
        <Row label="테두리">
          <Toggle checked={!!l.stroke} onChange={(on) => update({ stroke: on ? { color: "#000000", width: 2 } : null } as Partial<LayerT>)} />
          {l.stroke && <ColorInput value={l.stroke.color} onChange={(c) => update({ stroke: { ...l.stroke!, color: c } } as Partial<LayerT>, true)} />}
        </Row>
        {l.type === "rect" && (
          <Row label="그림자">
            <Toggle checked={!!l.shadow} onChange={(on) => update({ shadow: on ? { color: "#00000033", blur: 20, x: 0, y: 8 } : null } as Partial<LayerT>)} />
          </Row>
        )}
      </Group>
    );
  }
  // image
  const upload = async (file: File) => {
    setUploading(true);
    try {
      const a = await uploadImage(await downscaleImage(file), { kind: "photo", projectId, filename: file.name });
      onAssetAdded(a);
      update({ assetId: a.id } as Partial<LayerT>);
    } finally {
      setUploading(false);
    }
  };
  return (
    <Group title="사진">
      <div className="grid grid-cols-4 gap-1.5">
        {photos.map((p) => (
          <button
            key={p.id}
            onClick={() => update({ assetId: p.id } as Partial<LayerT>)}
            className={cx("aspect-square overflow-hidden rounded-md border-2", l.assetId === p.id ? "border-accent" : "border-transparent hover:border-line-2")}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt={p.label ?? ""} className="size-full object-cover" />
          </button>
        ))}
        <label className="grid aspect-square cursor-pointer place-items-center rounded-md border-2 border-dashed border-line-2 text-[11px] font-semibold text-ink-3 hover:border-ink-3">
          {uploading ? "…" : "+ 올리기"}
          <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </label>
      </div>
      {l.assetId && <button onClick={() => update({ assetId: null } as Partial<LayerT>)} className="mt-1 text-[11px] text-ink-3 underline">사진 빼기</button>}
      <Row label="모양">
        <Select value={l.shape} onChange={(v) => update({ shape: v } as Partial<LayerT>)} options={[{ value: "rect", label: "사각형" }, { value: "circle", label: "원형" }, { value: "arch", label: "아치형" }]} />
      </Row>
      <Row label="맞춤">
        <Select value={l.fit} onChange={(v) => update({ fit: v } as Partial<LayerT>)} options={[{ value: "cover", label: "꽉 채우기" }, { value: "contain", label: "전체 보이기" }]} />
      </Row>
      {l.shape === "rect" && <Row label="모서리 둥글기"><Slider value={l.radius} min={0} max={200} onChange={(v) => update({ radius: v } as Partial<LayerT>, true)} /></Row>}
      <Row label="그림자">
        <Toggle checked={!!l.shadow} onChange={(on) => update({ shadow: on ? { color: "#00000033", blur: 24, x: 0, y: 10 } : null } as Partial<LayerT>)} />
      </Row>
    </Group>
  );
}
