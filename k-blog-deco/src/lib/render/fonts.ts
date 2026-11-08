import { cssFont, type FontKey } from "@/lib/design/fonts";
import type { BlogDesignT } from "@/lib/design/schema";

/**
 * 캔버스는 CSS 처럼 폰트를 자동으로 내려받지 않으므로,
 * 디자인에 쓰인 (폰트, 굵기, 글자) 조합을 미리 로드합니다. (한글 웹폰트는 글자 범위별로 쪼개져 있음)
 */
const loaded = new Set<string>();

export async function ensureFonts(d: BlogDesignT): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  const reqs: { font: FontKey; weight: number; text: string }[] = [];
  for (const ab of [d.hero, d.mobile]) {
    for (const l of ab.layers) if (l.type === "text") reqs.push({ font: l.font, weight: l.weight, text: l.text });
  }
  const st = d.menu.style;
  for (const it of d.menu.items) {
    reqs.push({ font: st.font, weight: st.weight, text: it.label });
    if (it.sublabel) reqs.push({ font: "pretendard", weight: 500, text: it.sublabel });
  }
  reqs.push({ font: "pretendard", weight: 700, text: "📷 사진" });

  const jobs = reqs
    .map((r) => ({ key: `${cssFont(r.font, r.weight, 16)}|${r.text}`, css: cssFont(r.font, r.weight, 16), text: r.text || "가" }))
    .filter((r) => !loaded.has(r.key))
    .map(async (r) => {
      try {
        await document.fonts.load(r.css, r.text);
        loaded.add(r.key);
      } catch {
        /* 폰트 실패 시 기본 글꼴로 그려짐 */
      }
    });
  await Promise.all(jobs);
}

const imageCache = new Map<string, Promise<HTMLImageElement | null>>();

export function loadImage(url: string): Promise<HTMLImageElement | null> {
  let p = imageCache.get(url);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    });
    imageCache.set(url, p);
  }
  return p;
}

export async function loadAssetImages(urls: Record<string, string>) {
  const map = new Map<string, HTMLImageElement>();
  await Promise.all(
    Object.entries(urls).map(async ([id, url]) => {
      const img = await loadImage(url);
      if (img) map.set(id, img);
    }),
  );
  return map;
}
