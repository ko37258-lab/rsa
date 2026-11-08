"use client";

import { useEffect, useRef } from "react";
import { NAVER_SPEC } from "@/lib/naver/spec";
import { drawWidget } from "@/lib/render/canvas";
import type { BlogDesignT, MenuItemT } from "@/lib/design/schema";

/** 버튼(위젯) 하나를 실제 내보내기와 같은 방식으로 그립니다. */
export function WidgetCanvas({ design, item, fontsTick, scale = 1 }: { design: BlogDesignT; item: MenuItemT; fontsTick: number; scale?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const W = NAVER_SPEC.widget.width;
  const H = design.menu.itemHeight;
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const k = Math.min(3, (window.devicePixelRatio || 1) * scale);
    c.width = Math.round(W * k);
    c.height = Math.round(H * k);
    const ctx = c.getContext("2d")!;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    drawWidget(ctx, design, item, W, H);
  }, [design, item, fontsTick, scale, W, H]);
  return <canvas ref={ref} style={{ width: W * scale, height: H * scale }} className="block" />;
}
