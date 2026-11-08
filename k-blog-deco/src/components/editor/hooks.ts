"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Asset } from "@/lib/client/api";
import type { BlogDesignT } from "@/lib/design/schema";
import { ensureFonts, loadAssetImages } from "@/lib/render/fonts";
import type { AssetImages } from "@/lib/render/canvas";

/** 프로젝트 이미지들을 <img> 로 미리 불러와 캔버스에서 쓸 수 있게 합니다. */
export function useAssetImages(assets: Asset[]): AssetImages {
  const [map, setMap] = useState<AssetImages>(new Map());
  const key = assets.map((a) => a.id).join(",");
  useEffect(() => {
    let alive = true;
    loadAssetImages(Object.fromEntries(assets.map((a) => [a.id, a.url]))).then((m) => alive && setMap(m));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return map;
}

/** 디자인에 쓰인 폰트가 로드되면 증가하는 값 (캔버스 다시 그리기 트리거) */
export function useFontsReady(design: BlogDesignT | null): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!design) return;
    let alive = true;
    ensureFonts(design).then(() => alive && setTick((t) => t + 1));
    return () => {
      alive = false;
    };
  }, [design]);
  return tick;
}

/** 실행 취소/다시 실행이 되는 디자인 상태. 짧은 시간 안의 연속 변경(드래그·타이핑)은 하나로 묶습니다. */
type History = { past: BlogDesignT[]; present: BlogDesignT | null; future: BlogDesignT[]; lastPush: number };

export function useDesignHistory(initial: BlogDesignT | null) {
  const [h, setH] = useState<History>({ past: [], present: initial, future: [], lastPush: 0 });

  const set = useCallback((next: BlogDesignT | ((d: BlogDesignT) => BlogDesignT), opts: { merge?: boolean; reset?: boolean } = {}) => {
    const now = Date.now();
    setH((cur) => {
      const value = typeof next === "function" ? (cur.present ? next(cur.present) : null) : next;
      if (!value) return cur;
      if (opts.reset) return { past: [], present: value, future: [], lastPush: 0 };
      if (value === cur.present) return cur;
      const coalesce = opts.merge && now - cur.lastPush < 600;
      const past = coalesce || !cur.present ? cur.past : [...cur.past.slice(-49), cur.present];
      return { past, present: value, future: [], lastPush: now };
    });
  }, []);

  const undo = useCallback(() => {
    setH((cur) => {
      const prev = cur.past.at(-1);
      if (!prev || !cur.present) return cur;
      return { past: cur.past.slice(0, -1), present: prev, future: [cur.present, ...cur.future], lastPush: 0 };
    });
  }, []);

  const redo = useCallback(() => {
    setH((cur) => {
      const nxt = cur.future[0];
      if (!nxt || !cur.present) return cur;
      return { past: [...cur.past, cur.present], present: nxt, future: cur.future.slice(1), lastPush: 0 };
    });
  }, []);

  return { design: h.present, set, undo, redo, canUndo: h.past.length > 0, canRedo: h.future.length > 0 };
}

export function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}
