import { NAVER_SPEC } from "@/lib/naver/spec";
import { FONTS, FONT_KEYS, nearestWeight, type FontKey } from "./fonts";
import type {
  ArtboardT,
  BlogDesignT,
  FillT,
  LayerT,
  MenuT,
  ShadowT,
  StrokeT,
} from "./schema";

// AI 출력은 형식이 강제되지 않으므로 숫자 대신 "24px" 같은 문자열, 배열 대신 객체 등이 올 수 있습니다.
const toNum = (n: unknown): number | null => {
  if (typeof n === "number" && Number.isFinite(n)) return n;
  if (typeof n === "string" && n.trim()) {
    const v = parseFloat(n);
    return Number.isFinite(v) ? v : null;
  }
  return null;
};
const clamp = (n: unknown, min: number, max: number, fallback: number) => Math.min(max, Math.max(min, toNum(n) ?? fallback));
const str = (x: unknown): string => (typeof x === "string" ? x : typeof x === "number" ? String(x) : "");
const arr = <T = unknown>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : []);
const obj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const round = (n: number) => Math.round(n * 100) / 100;

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export function normColor(c: unknown, fallback: string): string {
  if (typeof c !== "string") return fallback;
  const v = c.trim();
  if (!HEX_RE.test(v)) return fallback;
  if (v.length === 4 || v.length === 5) {
    return ("#" + v.slice(1).split("").map((ch) => ch + ch).join("")).toUpperCase();
  }
  return v.toUpperCase();
}

const normFont = (f: unknown, fallback: FontKey): FontKey =>
  FONT_KEYS.includes(f as FontKey) ? (f as FontKey) : fallback;

export function normFill(f: FillT | string | null | undefined, fallback: string): FillT {
  if (typeof f === "string") return { type: "solid", color: normColor(f, fallback) };
  if (!obj(f)) return { type: "solid", color: fallback };
  if (f.type === "linear") {
    const stops = arr<{ at?: unknown; color?: unknown }>(f.stops)
      .filter(obj)
      .slice(0, 6)
      .map((s) => ({ at: round(clamp(s.at, 0, 1, 0)), color: normColor(s.color, fallback) }))
      .sort((a, b) => a.at - b.at);
    if (stops.length < 2) return { type: "solid", color: stops[0]?.color ?? fallback };
    return { type: "linear", angle: round(((clamp(f.angle, -3600, 3600, 90) % 360) + 360) % 360), stops };
  }
  return { type: "solid", color: normColor(f.color, fallback) };
}

const normShadow = (s: ShadowT | null | undefined): ShadowT | null =>
  obj(s) ? { color: normColor(s.color, "#00000033"), blur: clamp(s.blur, 0, 120, 12), x: clamp(s.x, -80, 80, 0), y: clamp(s.y, -80, 80, 4) } : null;

const normStroke = (s: StrokeT | null | undefined): StrokeT | null =>
  obj(s) && (toNum(s.width) ?? 0) > 0 ? { color: normColor(s.color, "#000000"), width: clamp(s.width, 0.5, 40, 1) } : null;

/** http(s) 링크만 허용. 도메인만 적은 경우 https:// 를 붙입니다. */
export function sanitizeLink(url: unknown): string {
  if (typeof url !== "string") return "";
  let v = url.trim();
  if (!v) return "";
  if (!/^[a-z][a-z0-9+.-]*:/i.test(v)) {
    if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(v)) v = "https://" + v;
    else return "";
  }
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : "";
  } catch {
    return "";
  }
}

type Ctx = { allowedAssetIds?: Set<string>; usedIds: Set<string>; palette: BlogDesignT["palette"]; fonts: BlogDesignT["fonts"] };

function uniqueId(raw: unknown, prefix: string, ctx: Ctx): string {
  let id = typeof raw === "string" && /^[\w-]{1,40}$/.test(raw) ? raw : "";
  if (!id || ctx.usedIds.has(id)) {
    let i = ctx.usedIds.size + 1;
    do id = `${prefix}${i++}`;
    while (ctx.usedIds.has(id));
  }
  ctx.usedIds.add(id);
  return id;
}

function normAsset(id: unknown, ctx: Ctx): string | null {
  if (typeof id !== "string" || !id) return null;
  if (ctx.allowedAssetIds && !ctx.allowedAssetIds.has(id)) return null;
  return id;
}

function normLayer(l: LayerT, ctx: Ctx, maxW: number, maxH: number): LayerT | null {
  const common = {
    id: uniqueId(l.id, "L", ctx),
    name: str(l.name).slice(0, 40) || l.type,
    x: round(clamp(l.x, -1600, maxW + 1600, 0)),
    y: round(clamp(l.y, -600, maxH + 600, 0)),
    w: round(clamp(l.w, 1, 4000, 100)),
    h: round(clamp(l.h, 1, 4000, 40)),
    opacity: round(clamp(l.opacity, 0, 1, 1)),
    rotation: round(clamp(l.rotation, -360, 360, 0)),
  };
  switch (l.type) {
    case "rect":
      return { ...common, type: "rect", fill: normFill(l.fill, ctx.palette.primary), radius: clamp(l.radius, 0, 2000, 0), stroke: normStroke(l.stroke), shadow: normShadow(l.shadow) };
    case "ellipse":
      return { ...common, type: "ellipse", fill: normFill(l.fill, ctx.palette.accent), stroke: normStroke(l.stroke) };
    case "image":
      return {
        ...common,
        type: "image",
        assetId: normAsset(l.assetId, ctx),
        placeholder: (str(l.placeholder) || "사진").slice(0, 30),
        fit: l.fit === "contain" ? "contain" : "cover",
        shape: (["rect", "circle", "arch"] as const).includes(l.shape) ? l.shape : "rect",
        radius: clamp(l.radius, 0, 2000, 0),
        stroke: normStroke(l.stroke),
        shadow: normShadow(l.shadow),
      };
    case "text": {
      const font = normFont(l.font, ctx.fonts.body);
      const text = str(l.text).slice(0, 400);
      if (!text.trim()) return null;
      return {
        ...common,
        type: "text",
        text,
        font,
        size: round(clamp(l.size, 8, 400, 24)),
        weight: nearestWeight(font, clamp(l.weight, 100, 900, 400)),
        color: normColor(l.color, ctx.palette.text),
        align: (["left", "center", "right"] as const).includes(l.align) ? l.align : "left",
        lineHeight: round(clamp(l.lineHeight, 0.8, 3, 1.3)),
        letterSpacing: round(clamp(l.letterSpacing, -10, 40, 0)),
        shadow: normShadow(l.shadow),
      };
    }
    default:
      return null;
  }
}

function normArtboard(a: ArtboardT, w: number, h: number, ctx: Ctx, fallbackBg: string): ArtboardT {
  return {
    width: w,
    height: h,
    background: normFill(a?.background, fallbackBg),
    backgroundImage:
      a?.backgroundImage && normAsset(a.backgroundImage.assetId, ctx)
        ? {
            assetId: a.backgroundImage.assetId,
            opacity: round(clamp(a.backgroundImage.opacity, 0, 1, 1)),
            overlay: a.backgroundImage.overlay ? normFill(a.backgroundImage.overlay, "#00000066") : null,
          }
        : null,
    layers: arr<LayerT>(a?.layers)
      .filter(obj)
      .slice(0, 60)
      .map((l) => normLayer(l, ctx, w, h))
      .filter((l): l is LayerT => l !== null),
  };
}

function normMenu(m: MenuT, ctx: Ctx): MenuT {
  const st = m?.style;
  const font = normFont(st?.font, ctx.fonts.body);
  return {
    itemHeight: Math.round(clamp(m?.itemHeight, NAVER_SPEC.widget.minHeight, NAVER_SPEC.widget.maxHeight, 64)),
    gap: Math.round(clamp(m?.gap, 0, 60, 12)),
    align: m?.align === "left" ? "left" : "center",
    style: {
      fill: normFill(st?.fill, ctx.palette.primary),
      textColor: normColor(st?.textColor, "#FFFFFF"),
      sublabelColor: normColor(st?.sublabelColor, "#FFFFFFB3"),
      radius: clamp(st?.radius, 0, 300, 8),
      stroke: normStroke(st?.stroke),
      font,
      size: round(clamp(st?.size, 10, 48, 17)),
      weight: nearestWeight(font, clamp(st?.weight, 100, 900, 700)),
      layout: (["label", "label-sub", "emoji-label", "emoji-top"] as const).includes(st?.layout) ? st.layout : "label",
    },
    items: arr<MenuT["items"][number]>(m?.items).filter(obj).slice(0, 10).map((it) => ({
      id: uniqueId(it.id, "M", ctx),
      label: (str(it.label) || "메뉴").slice(0, 20),
      sublabel: str(it.sublabel).slice(0, 30),
      emoji: Array.from(str(it.emoji)).slice(0, 2).join(""),
      link: sanitizeLink(it.link),
      fill: it.fill ? normFill(it.fill, ctx.palette.primary) : null,
      textColor: it.textColor ? normColor(it.textColor, "#FFFFFF") : null,
    })),
  };
}

/**
 * AI 출력·API 입력·편집기 저장값을 모두 이 함수로 통과시켜 안전한 범위로 보정합니다.
 * allowedAssetIds 를 주면 본인 소유가 아닌 사진 ID 는 제거됩니다.
 */
export function normalizeDesign(d: BlogDesignT, opts: { allowedAssetIds?: Set<string> } = {}): BlogDesignT {
  const palette = {
    primary: normColor(d.palette?.primary, "#1F2937"),
    secondary: normColor(d.palette?.secondary, "#4B5563"),
    accent: normColor(d.palette?.accent, "#E4572E"),
    background: normColor(d.palette?.background, "#FFFFFF"),
    surface: normColor(d.palette?.surface, "#F5F5F4"),
    text: normColor(d.palette?.text, "#111111"),
    muted: normColor(d.palette?.muted, "#6B7280"),
  };
  const fonts = {
    heading: normFont(d.fonts?.heading, "pretendard"),
    body: normFont(d.fonts?.body, "pretendard"),
  };
  const ctx: Ctx = { allowedAssetIds: opts.allowedAssetIds, usedIds: new Set(), palette, fonts };
  const heroH = Math.round(clamp(d.hero?.height, NAVER_SPEC.heroHeight.min, NAVER_SPEC.heroHeight.max, NAVER_SPEC.heroHeight.default));
  const titleHeight = Math.round(clamp(d.layout?.titleHeight, NAVER_SPEC.titleHeight.min, NAVER_SPEC.titleHeight.max, NAVER_SPEC.titleHeight.default));
  const showMenuBar = d.layout?.showMenuBar !== false;
  const defaultWidgetTop = titleHeight + (showMenuBar ? NAVER_SPEC.menuBarHeight : 0) + 18;

  return {
    version: 1,
    name: (str(d.name) || "새 블로그 디자인").slice(0, 60),
    summary: str(d.summary).slice(0, 600),
    palette,
    fonts,
    pageBackground: normColor(d.pageBackground, palette.background),
    layout: {
      titleHeight,
      showMenuBar,
      widgetTop: Math.round(clamp(d.layout?.widgetTop, 0, heroH + 400, defaultWidgetTop)),
    },
    hero: normArtboard(d.hero, NAVER_SPEC.contentWidth, heroH, ctx, palette.background),
    menu: normMenu(d.menu, ctx),
    mobile: normArtboard(d.mobile, NAVER_SPEC.mobileCover.width, NAVER_SPEC.mobileCover.height, ctx, palette.background),
  };
}

export const fontLabel = (k: FontKey) => FONTS[k].label;
