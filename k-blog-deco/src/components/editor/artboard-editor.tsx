"use client";

import { useEffect, useRef, useState } from "react";
import { drawArtboard, measureTextHeight, type AssetImages } from "@/lib/render/canvas";
import type { ArtboardT, BlogDesignT, LayerT } from "@/lib/design/schema";
import { NAVER_SPEC } from "@/lib/naver/spec";
import { useElementWidth } from "./hooks";
import { cx } from "@/components/ui";

const HERO_BLEED = 140;

/**
 * 히어로(PC 상단) 또는 모바일 커버를 그리고, 레이어를 클릭·드래그·크기 조절할 수 있게 합니다.
 * 히어로는 가운데 966px 칼럼 좌우로 스킨 여백(bleed)을 흐리게 함께 보여 줍니다.
 */
export function ArtboardEditor({
  design,
  which,
  assets,
  fontsTick,
  selectedId,
  onSelect,
  onLayerChange,
}: {
  design: BlogDesignT;
  which: "hero" | "mobile";
  assets: AssetImages;
  fontsTick: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onLayerChange: (id: string, patch: Partial<LayerT>, merge: boolean) => void;
}) {
  const ab: ArtboardT = which === "hero" ? design.hero : design.mobile;
  const bleed = which === "hero" ? HERO_BLEED : 0;
  const W = ab.width + bleed * 2;
  const H = ab.height;
  const [wrapRef, wrapW] = useElementWidth<HTMLDivElement>();
  const maxScale = which === "mobile" ? 0.6 : 1;
  const scale = wrapW ? Math.min(maxScale, wrapW / W) : 0;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [measured, setMeasured] = useState<Record<string, number>>({});

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !scale) return;
    const k = Math.min(2, (window.devicePixelRatio || 1) * scale);
    c.width = Math.round(W * k);
    c.height = Math.round(H * k);
    const ctx = c.getContext("2d")!;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    drawArtboard(ctx, ab, { width: W, height: H, offsetX: bleed, assets });
    const m: Record<string, number> = {};
    for (const l of ab.layers) if (l.type === "text") m[l.id] = measureTextHeight(ctx, l);
    setMeasured(m);
  }, [ab, W, H, bleed, assets, scale, fontsTick]);

  const drag = useRef<{ id: string; mode: "move" | "resize"; sx: number; sy: number; ox: number; oy: number; ow: number; oh: number } | null>(null);

  function onPointerDown(e: React.PointerEvent, l: LayerT, mode: "move" | "resize") {
    e.stopPropagation();
    e.preventDefault();
    onSelect(l.id);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { id: l.id, mode, sx: e.clientX, sy: e.clientY, ox: l.x, oy: l.y, ow: l.w, oh: l.h };
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || !scale) return;
    const dx = (e.clientX - d.sx) / scale;
    const dy = (e.clientY - d.sy) / scale;
    if (d.mode === "move") onLayerChange(d.id, { x: Math.round(d.ox + dx), y: Math.round(d.oy + dy) }, true);
    else onLayerChange(d.id, { w: Math.max(8, Math.round(d.ow + dx)), h: Math.max(8, Math.round(d.oh + dy)) }, true);
  }
  function onPointerUp() {
    drag.current = null;
  }

  const titleY = design.layout.titleHeight;
  const wTop = design.layout.widgetTop;
  const wH = design.menu.itemHeight;

  return (
    <div ref={wrapRef} className="w-full">
      {scale > 0 && (
        <div
          className="relative mx-auto select-none overflow-hidden rounded-md shadow-[0_20px_50px_-30px_rgba(0,0,0,0.5)] ring-1 ring-line"
          style={{ width: W * scale, height: H * scale }}
          onPointerDown={() => onSelect(null)}
        >
          <canvas ref={canvasRef} style={{ width: W * scale, height: H * scale }} className="absolute inset-0" />
          {bleed > 0 && (
            <>
              <div className="pointer-events-none absolute inset-y-0 left-0 bg-white/45" style={{ width: bleed * scale }} />
              <div className="pointer-events-none absolute inset-y-0 right-0 bg-white/45" style={{ width: bleed * scale }} />
              <Guide y={titleY * scale} label={`타이틀 영역 ${titleY}px`} />
              <div
                className="pointer-events-none absolute border border-dashed border-sky-500/80 bg-sky-400/10"
                style={{ left: bleed * scale, width: NAVER_SPEC.contentWidth * scale, top: wTop * scale, height: wH * scale }}
              >
                <span className="absolute -top-4 left-0 rounded-sm bg-sky-500 px-1 text-[9px] font-bold text-white">버튼(위젯) 자리</span>
              </div>
            </>
          )}
          {ab.layers.map((l) => {
            const h = l.type === "text" ? (measured[l.id] ?? l.h) : l.h;
            const sel = l.id === selectedId;
            return (
              <div
                key={l.id}
                onPointerDown={(e) => onPointerDown(e, l, "move")}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                title={l.name}
                className={cx(
                  "absolute cursor-move",
                  sel ? "outline outline-2 outline-accent" : "hover:outline hover:outline-1 hover:outline-accent/60",
                )}
                style={{
                  left: (l.x + bleed) * scale,
                  top: l.y * scale,
                  width: l.w * scale,
                  height: h * scale,
                  transform: l.rotation ? `rotate(${l.rotation}deg)` : undefined,
                }}
              >
                {sel && (
                  <span
                    onPointerDown={(e) => onPointerDown(e, l, "resize")}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    className="absolute -bottom-1.5 -right-1.5 size-3 cursor-nwse-resize rounded-sm border-2 border-accent bg-white"
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-2 text-center text-[11px] text-ink-3">
        {which === "hero"
          ? `가운데 ${NAVER_SPEC.contentWidth}px 이 블로그 본문 폭 · 흐린 좌우는 넓은 화면에서 보이는 스킨 여백 · 실제 ${W}×${H} 중 일부`
          : `모바일 커버 ${ab.width}×${ab.height}`}
      </p>
    </div>
  );
}

function Guide({ y, label }: { y: number; label: string }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-fuchsia-500/80" style={{ top: y }}>
      <span className="absolute right-1 top-0.5 rounded-sm bg-fuchsia-500 px-1 text-[9px] font-bold text-white">{label}</span>
    </div>
  );
}
