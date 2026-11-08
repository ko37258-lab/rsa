import { NAVER_SPEC } from "@/lib/naver/spec";
import { PRESETS, findPreset, type StylePreset } from "./presets";
import { normalizeDesign } from "./normalize";
import type { ArtboardT, BlogDesignT, BriefT, LayerT, MenuItemT } from "./schema";

/**
 * AI 키가 없을 때 쓰는 '템플릿 모드' 생성기.
 * 브리프(이름·업종·메뉴·색상 취향·사진)만으로 규칙 기반 디자인을 만듭니다.
 */
export function pickPreset(brief: BriefT): StylePreset {
  const direct = findPreset(brief.presetId);
  if (direct) return direct;
  const hay = [brief.industry, brief.colorPreference, brief.styleRequest, ...brief.moods].join(" ");
  let best = PRESETS[0];
  let bestScore = 0;
  for (const p of PRESETS) {
    const score = p.keywords.reduce((s, k) => (hay.includes(k) ? s + 1 : s), 0);
    if (score > bestScore) {
      best = p;
      bestScore = score;
    }
  }
  return best;
}

const EMOJI_RULES: [RegExp, string][] = [
  [/소개|about|인사|프로필/i, "👋"],
  [/상담|문의|연락|contact/i, "💬"],
  [/오시는|위치|지도|찾아/i, "📍"],
  [/후기|리뷰|review/i, "⭐"],
  [/공지|notice|소식/i, "📢"],
  [/이벤트|event|혜택/i, "🎁"],
  [/예약|booking|일정/i, "📅"],
  [/매물|분양|부동산|토지/i, "🏢"],
  [/강의|교육|수업|클래스/i, "🎓"],
  [/유튜브|youtube|영상/i, "▶️"],
  [/인스타|instagram|사진/i, "📷"],
  [/메뉴|menu|음식/i, "🍽️"],
  [/쇼핑|스토어|구매|shop/i, "🛍️"],
];

export const emojiFor = (label: string) => EMOJI_RULES.find(([re]) => re.test(label))?.[1] ?? "✨";

const SUBLABELS: [RegExp, string][] = [
  [/소개|about|인사|프로필/i, "ABOUT"],
  [/상담|문의|연락/i, "CONTACT"],
  [/오시는|위치|지도/i, "LOCATION"],
  [/후기|리뷰/i, "REVIEW"],
  [/공지|소식/i, "NOTICE"],
  [/이벤트|혜택/i, "EVENT"],
  [/예약/i, "BOOKING"],
  [/매물|분양/i, "LISTINGS"],
  [/강의|교육|클래스/i, "CLASS"],
  [/유튜브|영상/i, "YOUTUBE"],
];
const subFor = (label: string) => SUBLABELS.find(([re]) => re.test(label))?.[1] ?? "MORE";

function defaultMenu(brief: BriefT): { label: string; link: string }[] {
  if (brief.menu.length) return brief.menu.filter((m) => m.label.trim());
  const base = brief.blogUrl || "https://blog.naver.com/";
  if (/부동산|중개|분양|토지/.test(brief.industry))
    return [
      { label: "대표 소개", link: base },
      { label: "추천 매물", link: base },
      { label: "투자 칼럼", link: base },
      { label: "상담 문의", link: base },
      { label: "오시는 길", link: base },
    ];
  return [
    { label: "블로그 소개", link: base },
    { label: "최신 소식", link: base },
    { label: "후기", link: base },
    { label: "상담 문의", link: base },
    { label: "오시는 길", link: base },
  ];
}

export function deriveMobile(d: Pick<BlogDesignT, "hero" | "palette" | "fonts">): ArtboardT {
  const W = NAVER_SPEC.mobileCover.width;
  const texts = d.hero.layers.filter((l): l is Extract<LayerT, { type: "text" }> => l.type === "text").sort((a, b) => b.size - a.size);
  const image = d.hero.layers.find((l): l is Extract<LayerT, { type: "image" }> => l.type === "image" && !!l.assetId);
  const layers: LayerT[] = [];
  let y = 120;
  if (image) {
    layers.push({ ...image, id: "m-photo", name: "대표 사진", x: 0, y: 0, w: W, h: 620, shape: "rect", radius: 0, stroke: null, shadow: null, rotation: 0 });
    layers.push({ id: "m-shade", name: "사진 그림자", type: "rect", x: 0, y: 420, w: W, h: 200, opacity: 1, rotation: 0, radius: 0, stroke: null, shadow: null, fill: { type: "linear", angle: 90, stops: [{ at: 0, color: "#00000000" }, { at: 1, color: d.palette.background }] } });
    y = 660;
  }
  const [title, sub, ...rest] = texts;
  if (title) {
    layers.push({ ...title, id: "m-title", name: "제목", x: 80, y, w: W - 160, h: 200, size: Math.min(110, Math.max(64, title.size * 1.6)), align: "left", rotation: 0, color: image ? d.palette.text : title.color });
    y += Math.min(110, Math.max(64, title.size * 1.6)) * 1.25 * Math.max(1, title.text.split("\n").length) + 28;
  }
  if (sub) {
    layers.push({ ...sub, id: "m-sub", name: "부제", x: 80, y, w: W - 160, h: 120, size: Math.min(44, Math.max(30, sub.size * 1.5)), align: "left", rotation: 0, color: image ? d.palette.muted : sub.color });
    y += 90;
  }
  if (rest[0] && y < 960) {
    layers.push({ ...rest[0], id: "m-extra", name: "추가 문구", x: 80, y, w: W - 160, h: 80, size: 30, align: "left", rotation: 0, color: image ? d.palette.muted : rest[0].color });
  }
  layers.push({ id: "m-bar", name: "포인트 선", type: "rect", x: 80, y: 1000, w: 120, h: 8, opacity: 1, rotation: 0, radius: 4, stroke: null, shadow: null, fill: { type: "solid", color: d.palette.accent } });
  return {
    width: W,
    height: NAVER_SPEC.mobileCover.height,
    background: image ? { type: "solid", color: d.palette.background } : d.hero.background,
    backgroundImage: null,
    layers,
  };
}

export function templateDesign(brief: BriefT): BlogDesignT {
  const p = pickPreset(brief);
  const pal = p.palette;
  const dark = isDark(pal.background);
  const W = NAVER_SPEC.contentWidth;
  const titleHeight = NAVER_SPEC.titleHeight.default;
  const widgetTop = titleHeight + NAVER_SPEC.menuBarHeight + 18;
  const itemHeight = 64;
  const heroH = widgetTop + itemHeight + 48;
  const photo = brief.photoAssetIds[0] ?? null;

  const layers: LayerT[] = [];
  const L = <T extends LayerT>(l: T) => layers.push(l);

  // 장식 도형
  L({ id: "deco-circle", name: "장식 원", type: "ellipse", x: -260, y: -120, w: 420, h: 420, opacity: dark ? 0.12 : 0.18, rotation: 0, fill: { type: "solid", color: pal.accent }, stroke: null });
  L({ id: "deco-band", name: "하단 띠", type: "rect", x: -600, y: widgetTop - 6, w: W + 1200, h: itemHeight + 12, opacity: dark ? 0.35 : 0.6, rotation: 0, radius: 0, stroke: null, shadow: null, fill: { type: "solid", color: pal.surface } });

  const textW = photo ? 520 : W - 120;
  const tx = photo ? 40 : 60;
  const align = photo ? "left" : "center";
  const kicker = brief.industry ? brief.industry.toUpperCase() : "OFFICIAL BLOG";
  L({ id: "kicker", name: "상단 키워드", type: "text", x: tx, y: 54, w: textW, h: 24, opacity: 1, rotation: 0, text: kicker, font: p.fonts.body, size: 15, weight: 700, color: pal.accent, align, lineHeight: 1.2, letterSpacing: 3, shadow: null });
  L({ id: "title", name: "메인 제목", type: "text", x: tx, y: 86, w: textW, h: 120, opacity: 1, rotation: 0, text: brief.blogName, font: p.fonts.heading, size: brief.blogName.length > 12 ? 46 : 58, weight: 800, color: dark ? pal.text : pal.primary, align, lineHeight: 1.15, letterSpacing: -1, shadow: null });
  if (brief.tagline)
    L({ id: "tagline", name: "한 줄 소개", type: "text", x: tx, y: 176, w: textW, h: 60, opacity: 1, rotation: 0, text: brief.tagline, font: p.fonts.body, size: 19, weight: 400, color: pal.muted, align, lineHeight: 1.5, letterSpacing: 0, shadow: null });
  const contact = brief.contacts.phone || brief.contacts.kakao || "";
  if (contact)
    L({ id: "contact", name: "연락처", type: "text", x: tx, y: 238, w: textW, h: 30, opacity: 1, rotation: 0, text: `☎ ${contact}`, font: p.fonts.body, size: 17, weight: 700, color: dark ? pal.accent : pal.secondary, align, lineHeight: 1.3, letterSpacing: 0, shadow: null });
  if (photo) {
    L({ id: "photo-frame", name: "사진 테두리", type: "rect", x: 592, y: 30, w: 350, h: 262, opacity: 1, rotation: 0, radius: 24, stroke: null, shadow: null, fill: { type: "solid", color: pal.accent } });
    L({ id: "photo", name: "대표 사진", type: "image", x: 576, y: 16, w: 350, h: 262, opacity: 1, rotation: 0, assetId: photo, placeholder: "대표 사진", fit: "cover", shape: "rect", radius: 24, stroke: null, shadow: { color: "#00000033", blur: 24, x: 0, y: 10 } });
  }

  const items: MenuItemT[] = defaultMenu(brief).map((m, i) => ({
    id: `menu-${i + 1}`,
    label: m.label,
    sublabel: subFor(m.label),
    emoji: emojiFor(m.label),
    link: m.link || brief.blogUrl || "https://blog.naver.com/",
    fill: null,
    textColor: null,
  }));

  const hero: ArtboardT = {
    width: W,
    height: heroH,
    background: dark
      ? { type: "linear", angle: 90, stops: [{ at: 0, color: pal.secondary }, { at: 1, color: pal.primary }] }
      : { type: "linear", angle: 90, stops: [{ at: 0, color: pal.background }, { at: 1, color: pal.surface }] },
    backgroundImage: null,
    layers,
  };

  const design: BlogDesignT = {
    version: 1,
    name: `${brief.blogName} — ${p.name}`,
    summary: `'${p.name}' 스타일(${p.description}) 을 바탕으로 템플릿 모드에서 만든 디자인입니다. AI 키를 연결하면 레퍼런스를 분석해 훨씬 정교하게 만들어 드립니다.`,
    palette: pal,
    fonts: p.fonts,
    pageBackground: pal.background,
    layout: { titleHeight, showMenuBar: true, widgetTop },
    hero,
    menu: {
      itemHeight,
      gap: 12,
      align: "center",
      style: {
        fill: p.button.filled ? { type: "solid", color: pal.primary } : { type: "solid", color: dark ? "#FFFFFF00" : pal.surface },
        textColor: p.button.filled ? "#FFFFFF" : pal.text,
        sublabelColor: p.button.filled ? "#FFFFFFB3" : pal.muted,
        radius: Math.min(p.button.radius, itemHeight / 2),
        stroke: p.button.filled ? null : { color: dark ? pal.accent : pal.text, width: 1 },
        font: p.fonts.body,
        size: 17,
        weight: 700,
        layout: "label-sub",
      },
      items,
    },
    mobile: { width: 1080, height: 1080, background: { type: "solid", color: pal.background }, backgroundImage: null, layers: [] },
  };
  design.mobile = deriveMobile(design);
  return normalizeDesign(design);
}

export function isDark(hex: string): boolean {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
}

/** 템플릿 모드의 간단한 '말로 수정' — 자주 쓰는 요청만 규칙으로 처리 */
export function templateRevise(design: BlogDesignT, instruction: string): { design: BlogDesignT; summary: string } {
  const d = structuredClone(design);
  const done: string[] = [];
  const text = instruction;
  if (/크게|키워/.test(text) && /제목|글자|폰트/.test(text)) {
    d.hero.layers.forEach((l) => l.type === "text" && l.size >= 30 && (l.size = Math.round(l.size * 1.15)));
    done.push("제목 글자를 15% 키웠습니다");
  }
  if (/작게|줄여/.test(text) && /제목|글자|폰트/.test(text)) {
    d.hero.layers.forEach((l) => l.type === "text" && l.size >= 30 && (l.size = Math.round(l.size * 0.87)));
    done.push("제목 글자를 줄였습니다");
  }
  if (/둥글|라운드/.test(text)) {
    d.menu.style.radius = d.menu.itemHeight / 2;
    done.push("버튼을 둥글게 바꿨습니다");
  }
  if (/각지|네모/.test(text)) {
    d.menu.style.radius = 0;
    done.push("버튼 모서리를 각지게 바꿨습니다");
  }
  const preset = PRESETS.find((p) => p.keywords.some((k) => text.includes(k)) && /색|톤|분위기|스타일|바꿔/.test(text));
  if (preset) {
    const map = new Map(Object.entries(d.palette).map(([k, v]) => [v, preset.palette[k as keyof typeof preset.palette]]));
    const swap = (c: string) => map.get(c) ?? c;
    const json = JSON.stringify(d).replace(/"#[0-9A-F]{6,8}"/g, (m) => JSON.stringify(swap(JSON.parse(m))));
    Object.assign(d, JSON.parse(json));
    d.palette = preset.palette;
    done.push(`색상을 '${preset.name}' 톤으로 바꿨습니다`);
  }
  return {
    design: normalizeDesign(d),
    summary: done.length
      ? done.join(", ") + ". (템플릿 모드 — AI 키를 연결하면 어떤 요청이든 반영할 수 있습니다)"
      : "템플릿 모드에서는 '제목 크게', '버튼 둥글게', '네이비 톤으로 바꿔줘' 같은 간단한 요청만 처리할 수 있습니다. AI 키를 연결해 주세요.",
  };
}
