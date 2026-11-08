"use client";

import { useEffect, useRef } from "react";
import { drawArtboard, type AssetImages } from "@/lib/render/canvas";
import { NAVER_SPEC } from "@/lib/naver/spec";
import type { BlogDesignT } from "@/lib/design/schema";
import { useElementWidth } from "./hooks";
import { WidgetCanvas } from "./widget-canvas";

const VIEWPORT = 1440; // 시뮬레이션 모니터 폭

/** 네이버 블로그 PC 화면 시뮬레이션: 스킨 배경 + 투명 타이틀 + 메뉴 바 + 버튼 위젯 + 본문 */
export function NaverPreview({ design, assets, fontsTick }: { design: BlogDesignT; assets: AssetImages; fontsTick: number }) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const scale = width ? Math.min(1, width / VIEWPORT) : 0;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const colX = (VIEWPORT - NAVER_SPEC.contentWidth) / 2;
  const heroH = design.hero.height;
  const postTop = Math.max(heroH, design.layout.widgetTop + design.menu.itemHeight) + 28;
  const totalH = postTop + 360;

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !scale) return;
    const k = Math.min(2, (window.devicePixelRatio || 1) * scale);
    c.width = Math.round(VIEWPORT * k);
    c.height = Math.round(heroH * k);
    const ctx = c.getContext("2d")!;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    drawArtboard(ctx, design.hero, { width: VIEWPORT, height: heroH, offsetX: colX, assets });
  }, [design, assets, scale, fontsTick, heroH, colX]);

  const items = design.menu.items;
  const rowW = items.length * NAVER_SPEC.widget.width + Math.max(0, items.length - 1) * design.menu.gap;
  const rowLeft = design.menu.align === "center" ? Math.max(0, (NAVER_SPEC.contentWidth - rowW) / 2) : 0;

  return (
    <div ref={ref} className="w-full">
      {scale > 0 && (
        <div className="mx-auto overflow-hidden rounded-lg ring-1 ring-line" style={{ width: VIEWPORT * scale, height: totalH * scale }}>
          <div className="relative origin-top-left" style={{ width: VIEWPORT, height: totalH, transform: `scale(${scale})`, background: design.pageBackground }}>
            <canvas ref={canvasRef} className="absolute left-0 top-0" style={{ width: VIEWPORT, height: heroH }} />
            <div className="absolute top-0" style={{ left: colX, width: NAVER_SPEC.contentWidth, height: totalH }}>
              {design.layout.showMenuBar && (
                <div
                  className="absolute inset-x-0 flex items-center gap-6 border-y border-black/10 bg-white/80 px-5 text-[13px] text-neutral-600 backdrop-blur-sm"
                  style={{ top: design.layout.titleHeight, height: NAVER_SPEC.menuBarHeight }}
                >
                  {["프롤로그", "블로그", "지도", "서재", "메모", "안부"].map((t) => (
                    <span key={t} className={t === "블로그" ? "font-bold text-neutral-900" : ""}>{t}</span>
                  ))}
                </div>
              )}
              <div className="absolute flex" style={{ top: design.layout.widgetTop, left: rowLeft, gap: design.menu.gap }}>
                {items.map((it) => (
                  <a key={it.id} href={it.link || undefined} target="_blank" rel="noreferrer" title={it.link || "링크 없음"}>
                    <WidgetCanvas design={design} item={it} fontsTick={fontsTick} />
                  </a>
                ))}
              </div>
              <div className="absolute inset-x-0 rounded-sm bg-white px-10 py-8 shadow-sm" style={{ top: postTop, height: 340 }}>
                <div className="h-4 w-1/2 rounded bg-neutral-200" />
                <div className="mt-3 h-2.5 w-24 rounded bg-neutral-100" />
                <div className="mt-8 space-y-3">
                  {[92, 85, 96, 70, 88, 60].map((w, i) => (
                    <div key={i} className="h-2.5 rounded bg-neutral-100" style={{ width: `${w}%` }} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      <p className="mt-2 text-center text-[11px] text-ink-3">
        {VIEWPORT}px 모니터 기준 미리보기 · 네이버 화면 구성(상단 바·메뉴 위치)은 실제와 조금 다를 수 있습니다
      </p>
    </div>
  );
}
