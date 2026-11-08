import { NAVER_SPEC, skinContentOffset } from "@/lib/naver/spec";
import { cssFont } from "@/lib/design/fonts";
import type {
  ArtboardT,
  BlogDesignT,
  FillT,
  ImageLayerT,
  LayerT,
  MenuItemT,
  ShadowT,
  TextLayerT,
} from "@/lib/design/schema";

/**
 * 디자인 JSON → Canvas 렌더러.
 * 미리보기와 PNG 내보내기가 같은 함수를 쓰므로 '보이는 그대로' 내보내집니다.
 */
export type AssetImages = Map<string, HTMLImageElement>;

type Ctx2D = CanvasRenderingContext2D;

export function makeFill(ctx: Ctx2D, fill: FillT, x: number, y: number, w: number, h: number): string | CanvasGradient {
  if (fill.type === "solid") return fill.color;
  const a = (fill.angle * Math.PI) / 180;
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const g = ctx.createLinearGradient(cx - dx * half, cy - dy * half, cx + dx * half, cy + dy * half);
  for (const s of fill.stops) g.addColorStop(Math.min(1, Math.max(0, s.at)), s.color);
  return g;
}

function applyShadow(ctx: Ctx2D, s: ShadowT | null) {
  if (!s) return;
  ctx.shadowColor = s.color;
  ctx.shadowBlur = s.blur;
  ctx.shadowOffsetX = s.x;
  ctx.shadowOffsetY = s.y;
}

function clearShadow(ctx: Ctx2D) {
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

export function roundRectPath(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function shapePath(ctx: Ctx2D, l: ImageLayerT, x: number, y: number) {
  if (l.shape === "circle") {
    ctx.beginPath();
    ctx.ellipse(x + l.w / 2, y + l.h / 2, l.w / 2, l.h / 2, 0, 0, Math.PI * 2);
    ctx.closePath();
  } else if (l.shape === "arch") {
    const r = Math.min(l.w / 2, l.h);
    ctx.beginPath();
    ctx.moveTo(x, y + l.h);
    ctx.lineTo(x, y + r);
    ctx.arc(x + l.w / 2, y + r, l.w / 2, Math.PI, 0);
    ctx.lineTo(x + l.w, y + l.h);
    ctx.closePath();
  } else {
    roundRectPath(ctx, x, y, l.w, l.h, l.radius);
  }
}

function drawImageFit(ctx: Ctx2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, fit: "cover" | "contain") {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const scale = fit === "cover" ? Math.max(w / iw, h / ih) : Math.min(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

const supportsLetterSpacing = typeof CanvasRenderingContext2D !== "undefined" && "letterSpacing" in CanvasRenderingContext2D.prototype;

function setLetterSpacing(ctx: Ctx2D, px: number) {
  if (supportsLetterSpacing) (ctx as Ctx2D & { letterSpacing: string }).letterSpacing = `${px}px`;
}

/** 공백 기준 줄바꿈, 너무 긴 단어는 글자 단위로 끊습니다. */
export function wrapText(ctx: Ctx2D, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    const words = para.split(/(\s+)/).filter((t) => t.length);
    let line = "";
    for (const word of words) {
      const test = line + word;
      if (ctx.measureText(test).width <= maxWidth || !line.trim()) {
        if (ctx.measureText(test).width > maxWidth && !line.trim()) {
          // 한 단어가 너무 길면 글자 단위로 분할
          let chunk = "";
          for (const ch of Array.from(word)) {
            if (ctx.measureText(chunk + ch).width > maxWidth && chunk) {
              out.push(chunk);
              chunk = ch;
            } else chunk += ch;
          }
          line = chunk;
        } else line = test;
      } else {
        out.push(line.trimEnd());
        line = word.trimStart();
      }
    }
    out.push(line.trimEnd());
  }
  return out;
}

function drawText(ctx: Ctx2D, l: TextLayerT, x: number, y: number) {
  ctx.font = cssFont(l.font, l.weight, l.size);
  setLetterSpacing(ctx, l.letterSpacing);
  ctx.fillStyle = l.color;
  ctx.textBaseline = "middle";
  ctx.textAlign = l.align;
  applyShadow(ctx, l.shadow);
  const lines = wrapText(ctx, l.text, Math.max(10, l.w));
  const lh = l.size * l.lineHeight;
  const ax = l.align === "center" ? x + l.w / 2 : l.align === "right" ? x + l.w : x;
  lines.forEach((line, i) => ctx.fillText(line, ax, y + i * lh + lh / 2));
  clearShadow(ctx);
  setLetterSpacing(ctx, 0);
}

export function measureTextHeight(ctx: Ctx2D, l: TextLayerT): number {
  ctx.font = cssFont(l.font, l.weight, l.size);
  setLetterSpacing(ctx, l.letterSpacing);
  const n = wrapText(ctx, l.text, Math.max(10, l.w)).length;
  setLetterSpacing(ctx, 0);
  return n * l.size * l.lineHeight;
}

function drawPlaceholder(ctx: Ctx2D, l: ImageLayerT, x: number, y: number) {
  ctx.fillStyle = "#D9D6CF";
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = "#BDB8AE";
  ctx.lineWidth = 2;
  for (let i = -l.h; i < l.w; i += 18) {
    ctx.beginPath();
    ctx.moveTo(x + i, y + l.h);
    ctx.lineTo(x + i + l.h, y);
    ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = "#6B665C";
  ctx.font = cssFont("pretendard", 700, Math.max(12, Math.min(22, Math.min(l.w, l.h) / 7)));
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`📷 ${l.placeholder}`, x + l.w / 2, y + l.h / 2);
}

function drawLayer(ctx: Ctx2D, l: LayerT, ox: number, assets: AssetImages) {
  const x = l.x + ox;
  const y = l.y;
  ctx.save();
  ctx.globalAlpha = l.opacity;
  if (l.rotation) {
    ctx.translate(x + l.w / 2, y + l.h / 2);
    ctx.rotate((l.rotation * Math.PI) / 180);
    ctx.translate(-(x + l.w / 2), -(y + l.h / 2));
  }
  switch (l.type) {
    case "rect": {
      roundRectPath(ctx, x, y, l.w, l.h, l.radius);
      applyShadow(ctx, l.shadow);
      ctx.fillStyle = makeFill(ctx, l.fill, x, y, l.w, l.h);
      ctx.fill();
      clearShadow(ctx);
      if (l.stroke) {
        ctx.strokeStyle = l.stroke.color;
        ctx.lineWidth = l.stroke.width;
        ctx.stroke();
      }
      break;
    }
    case "ellipse": {
      ctx.beginPath();
      ctx.ellipse(x + l.w / 2, y + l.h / 2, l.w / 2, l.h / 2, 0, 0, Math.PI * 2);
      ctx.fillStyle = makeFill(ctx, l.fill, x, y, l.w, l.h);
      ctx.fill();
      if (l.stroke) {
        ctx.strokeStyle = l.stroke.color;
        ctx.lineWidth = l.stroke.width;
        ctx.stroke();
      }
      break;
    }
    case "image": {
      const img = l.assetId ? assets.get(l.assetId) : undefined;
      shapePath(ctx, l, x, y);
      if (l.shadow) {
        applyShadow(ctx, l.shadow);
        ctx.fillStyle = "#000000";
        ctx.fill();
        clearShadow(ctx);
      }
      if (img && img.complete && img.naturalWidth) {
        ctx.save();
        ctx.clip();
        drawImageFit(ctx, img, x, y, l.w, l.h, l.fit);
        ctx.restore();
      } else {
        drawPlaceholder(ctx, l, x, y);
      }
      if (l.stroke) {
        shapePath(ctx, l, x, y);
        ctx.strokeStyle = l.stroke.color;
        ctx.lineWidth = l.stroke.width;
        ctx.stroke();
      }
      break;
    }
    case "text":
      drawText(ctx, l, x, y);
      break;
  }
  ctx.restore();
}

/** 아트보드를 캔버스에 그립니다. offsetX 는 966 칼럼이 시작되는 x (스킨 이미지에서 가운데 정렬용) */
export function drawArtboard(
  ctx: Ctx2D,
  ab: ArtboardT,
  opts: { width: number; height: number; offsetX?: number; assets: AssetImages },
) {
  const { width, height, assets } = opts;
  const ox = opts.offsetX ?? 0;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = makeFill(ctx, ab.background, 0, 0, width, height);
  ctx.fillRect(0, 0, width, height);
  if (ab.backgroundImage) {
    const img = assets.get(ab.backgroundImage.assetId);
    if (img?.complete && img.naturalWidth) {
      ctx.save();
      ctx.globalAlpha = ab.backgroundImage.opacity;
      drawImageFit(ctx, img, 0, 0, width, height, "cover");
      ctx.restore();
    }
    if (ab.backgroundImage.overlay) {
      ctx.fillStyle = makeFill(ctx, ab.backgroundImage.overlay, 0, 0, width, height);
      ctx.fillRect(0, 0, width, height);
    }
  }
  for (const l of ab.layers) drawLayer(ctx, l, ox, assets);
}

export function drawWidget(ctx: Ctx2D, d: BlogDesignT, item: MenuItemT, w: number = NAVER_SPEC.widget.width, h: number = d.menu.itemHeight) {
  const st = d.menu.style;
  ctx.clearRect(0, 0, w, h);
  const inset = st.stroke ? st.stroke.width / 2 : 0;
  roundRectPath(ctx, inset, inset, w - inset * 2, h - inset * 2, st.radius);
  ctx.fillStyle = makeFill(ctx, item.fill ?? st.fill, 0, 0, w, h);
  ctx.fill();
  if (st.stroke) {
    ctx.strokeStyle = st.stroke.color;
    ctx.lineWidth = st.stroke.width;
    ctx.stroke();
  }
  const color = item.textColor ?? st.textColor;
  const pad = 12;
  const maxW = w - pad * 2;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const fitFont = (text: string, size: number, weight: number, font = st.font) => {
    let s = size;
    ctx.font = cssFont(font, weight, s);
    while (s > 10 && ctx.measureText(text).width > maxW) {
      s -= 1;
      ctx.font = cssFont(font, weight, s);
    }
    return s;
  };
  const cx = w / 2;
  const cy = h / 2;
  const emoji = item.emoji;
  const label = item.label;
  switch (st.layout) {
    case "label-sub": {
      const subSize = Math.max(9, Math.round(st.size * 0.58));
      const hasSub = !!item.sublabel;
      const s = fitFont(label, st.size, st.weight);
      ctx.fillStyle = color;
      ctx.fillText(label, cx, hasSub ? cy - subSize * 0.75 : cy);
      if (hasSub) {
        fitFont(item.sublabel, subSize, 500, "pretendard");
        setLetterSpacing(ctx, 1.5);
        ctx.fillStyle = st.sublabelColor;
        ctx.fillText(item.sublabel, cx, cy + s * 0.62);
        setLetterSpacing(ctx, 0);
      }
      break;
    }
    case "emoji-top": {
      const es = Math.min(h * 0.38, st.size * 1.6);
      ctx.font = `${es}px sans-serif`;
      ctx.fillStyle = color;
      if (emoji) ctx.fillText(emoji, cx, emoji ? cy - es * 0.45 : cy);
      fitFont(label, st.size, st.weight);
      ctx.fillText(label, cx, emoji ? cy + es * 0.62 : cy);
      break;
    }
    case "emoji-label": {
      const s = fitFont(emoji ? `${emoji} ${label}` : label, st.size, st.weight);
      ctx.fillStyle = color;
      ctx.font = cssFont(st.font, st.weight, s);
      ctx.fillText(emoji ? `${emoji} ${label}` : label, cx, cy);
      break;
    }
    default: {
      fitFont(label, st.size, st.weight);
      ctx.fillStyle = color;
      ctx.fillText(label, cx, cy);
    }
  }
}

// ───────── 내보내기용 캔버스 생성 ─────────

function canvasOf(w: number, h: number, scale = 1) {
  const c = document.createElement("canvas");
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  const ctx = c.getContext("2d")!;
  ctx.scale(scale, scale);
  return { c, ctx };
}

export function renderSkin(d: BlogDesignT, assets: AssetImages, scale = 1) {
  const W = NAVER_SPEC.skinWidth;
  const { c, ctx } = canvasOf(W, d.hero.height, scale);
  drawArtboard(ctx, d.hero, { width: W, height: d.hero.height, offsetX: skinContentOffset(W), assets });
  return c;
}

export function renderTitle(d: BlogDesignT, assets: AssetImages, scale = 1) {
  const W = NAVER_SPEC.contentWidth;
  const { c, ctx } = canvasOf(W, d.layout.titleHeight, scale);
  drawArtboard(ctx, { ...d.hero, height: d.layout.titleHeight }, { width: W, height: d.layout.titleHeight, assets });
  return c;
}

export function renderWidget(d: BlogDesignT, item: MenuItemT, scale = 1) {
  const { c, ctx } = canvasOf(NAVER_SPEC.widget.width, d.menu.itemHeight, scale);
  drawWidget(ctx, d, item);
  return c;
}

export function renderMobile(d: BlogDesignT, assets: AssetImages, scale = 1) {
  const { width, height } = d.mobile;
  const { c, ctx } = canvasOf(width, height, scale);
  drawArtboard(ctx, d.mobile, { width, height, assets });
  return c;
}

export const canvasToBlob = (c: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG 변환 실패"))), "image/png"));
