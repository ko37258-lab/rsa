// 쇼츠 한 프레임을 그리는 순수 그리기 코드.
// 미리보기와 영상 내보내기가 같은 drawFrame()을 쓰므로, 화면 모양을 바꾸려면 이 파일만 고치면 됩니다.
// 모든 크기는 1080px 기준 값에 u(=짧은 변/1080)를 곱해 해상도와 상관없이 같은 비율로 그립니다.
// 어휘(template·captionAnim·overlay·transition·titleMode 등)는 docs/STYLE-SPEC.md 를 따릅니다.

import { clamp, drawImageFit, roundRectPath } from './util.js';

// ── 글꼴 ──────────────────────────────────────────────
// 글꼴은 Pretendard Variable 하나. "굵기"만 고릅니다.
export const FONTS = [
  { id: '700', label: 'Pretendard 700 — 굵게', weight: 700 },
  { id: '800', label: 'Pretendard 800 — 더 굵게', weight: 800 },
  { id: '900', label: 'Pretendard 900 — 가장 굵게', weight: 900 },
];
export const FONT_FAMILY = '"Pretendard Variable", Pretendard, sans-serif';
const UI_FONT = FONT_FAMILY;

const isWeight = (w) => /^[1-9]00$/.test(String(w ?? '').trim());
/** fontCss(weight, px). 첫 인자가 숫자 문자열이 아니면(옛 글꼴 이름 등) 900으로 봅니다. */
export function fontCss(weight, px) {
  const w = isWeight(weight) ? String(weight).trim() : '900';
  return `${w} ${Math.round(px)}px ${FONT_FAMILY}`;
}
const uiFont = (px, weight = 600) => `${weight} ${Math.round(px)}px ${UI_FONT}`;

// ── 기본값 ────────────────────────────────────────────
export const RENDER_DEFAULTS = {
  aspect: '9:16', template: 'band', captionAnim: 'none', captionStyle: 'outline', overlay: 'none',
  transition: 'fade', motion: 'auto', titleMode: 'band',
  bandColor: '#0b0d14', panelColor: '#ffffff', textColor: '#ffffff', inkColor: '#111111', highlightColor: '#ffd43b',
  font: '900', captionSize: 68,
};
const DEFAULT_KEYS = Object.keys(RENDER_DEFAULTS);
/** 없는 필드는 기본값으로 채웁니다(옛 프로젝트 호환). 모두 있으면 같은 객체를 돌려줍니다. */
function withDefaults(p) {
  for (const k of DEFAULT_KEYS) if (p[k] == null || p[k] === '') return { ...RENDER_DEFAULTS, ...Object.fromEntries(Object.entries(p).filter(([, v]) => v != null && v !== '')) };
  return p;
}

// ── 색 ────────────────────────────────────────────────
const rgbCache = new Map();
function rgbOf(c) {
  let v = rgbCache.get(c);
  if (v) return v;
  const s = String(c || '').trim();
  let m;
  if ((m = /^#([0-9a-f]{3})$/i.exec(s))) v = { r: parseInt(m[1][0] + m[1][0], 16), g: parseInt(m[1][1] + m[1][1], 16), b: parseInt(m[1][2] + m[1][2], 16) };
  else if ((m = /^#([0-9a-f]{6})/i.exec(s))) v = { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16) };
  else if ((m = /^rgba?\(\s*(\d+)\D+(\d+)\D+(\d+)/i.exec(s))) v = { r: +m[1], g: +m[2], b: +m[3] };
  else v = { r: 0, g: 0, b: 0 };
  rgbCache.set(c, v);
  return v;
}
const lum = (c) => { const { r, g, b } = rgbOf(c); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
/** 밝은 색이면 true (그 위 글자는 inkColor) */
export const isBright = (c) => lum(c) > 0.6;
const rgba = (c, a) => { const { r, g, b } = rgbOf(c); return `rgba(${r},${g},${b},${a})`; };
/** 배경색 위에 읽히는 글자색 */
const onColor = (bg, p) => (isBright(bg) ? p.inkColor : p.textColor);

// ── 크기·시간표 ───────────────────────────────────────
/** 화면 비율·화질 → 실제 픽셀 크기 */
export function dims(aspect, quality = '1080') {
  const s = quality === '720' ? 720 : 1080;
  if (aspect === '16:9') return { W: Math.round((s * 16) / 9), H: s };
  if (aspect === '1:1') return { W: s, H: s };
  return { W: s, H: Math.round((s * 16) / 9) };
}

/** 장면 목록 → 시간표 */
export function buildTimeline(p) {
  const segs = [];
  let t = 0;
  (p.scenes || []).forEach((scene, index) => {
    const d = clamp(Number(scene.duration) || 3, 0.5, 30);
    segs.push({ kind: 'scene', scene, index, start: t, end: t + d });
    t += d;
  });
  if (p.ending?.enabled && segs.length) {
    const d = clamp(Number(p.ending.duration) || 2.5, 1, 10);
    segs.push({ kind: 'ending', index: segs.length, start: t, end: t + d });
    t += d;
  }
  return { segs, total: t };
}

export function segmentAt(tl, t) {
  const { segs } = tl;
  for (let i = segs.length - 1; i >= 0; i--) if (t >= segs[i].start) return i;
  return 0;
}

/**
 * 썸네일·미리보기용 시각: 훅 장면은 레이아웃과 상관없이 "흐린 사진 + 큰 자막"으로 그려지므로,
 * 스타일 모양이 드러나는 첫 보통 장면 안의 시각을 고릅니다(없으면 첫 장면).
 */
export function previewTime(tl, { offset = 1.4 } = {}) {
  const seg = tl.segs.find((s) => s.kind === 'scene' && s.scene.kind !== 'hook') || tl.segs[0];
  if (!seg) return 0;
  const dur = seg.end - seg.start;
  return clamp(seg.start + clamp(offset, 0.2, Math.max(0.2, dur - 0.2)), 0, Math.max(0.05, tl.total - 0.1));
}

/**
 * 템플릿별 영역 나누기. 돌려주는 값: u, pad, portrait, wide, img, title, cap, textBox (+ panel, card, thumb, hook)
 * 세로(9:16)·정사각(1:1)은 아래 그대로, 가로(16:9 처럼 폭이 높이의 1.3배 이상)는 layoutWide() 가 따로 나눕니다.
 */
export function layout(p, W, H) {
  const u = Math.min(W, H) / 1080;
  const pad = 56 * u;
  const portrait = H > W;
  if (W / H >= 1.3) return layoutWide(p, W, H, u, pad);
  const tm = p.titleMode || 'band';
  const titleH = tm === 'band' ? (portrait ? 0.215 : 0.2) * H : (portrait ? 0.09 : 0.13) * H;
  const title = { x: pad, y: pad * 1.25, w: W - pad * 2, h: Math.max(10 * u, titleH - pad * 1.5) };
  const hook = { x: pad, y: titleH, w: W - pad * 2, h: H - titleH - 150 * u };
  const tpl = p.template || 'band';
  const base = { u, pad, portrait, wide: false, titleH, hook };

  if (tpl === 'full') {
    return {
      ...base,
      img: { x: 0, y: 0, w: W, h: H },
      title: { x: pad, y: pad * 1.6, w: W - pad * 2, h: Math.max(10 * u, titleH - pad) },
      cap: { x: pad, y: H * (portrait ? 0.64 : 0.6), w: W - pad * 2, h: H * (portrait ? 0.22 : 0.3) },
      textBox: { x: pad, y: titleH, w: W - pad * 2, h: H * (portrait ? 0.62 : 0.66) - titleH },
    };
  }
  if (tpl === 'split') {
    const splitY = H * (portrait ? 0.56 : 0.6);
    const img = { x: 0, y: titleH, w: W, h: splitY - titleH };
    const panel = { x: 0, y: splitY, w: W, h: H - splitY };
    const cap = { x: pad, y: panel.y + pad * 0.8, w: W - pad * 2, h: panel.h - pad * 1.6 - 30 * u };
    return { ...base, img, panel, title, cap, textBox: { x: pad, y: img.y + pad * 0.5, w: W - pad * 2, h: img.h - pad } };
  }
  if (tpl === 'card') {
    const inset = pad * 1.1;
    let cardW = W - inset * 2;
    const cardH = portrait ? Math.min(cardW * 1.04, H * 0.45) : H * 0.56;
    if (!portrait) cardW = Math.min(cardW, cardH * 1.5);
    const card = { x: (W - cardW) / 2, y: titleH + 10 * u, w: cardW, h: cardH };
    const border = 16 * u;
    const img = { x: card.x + border, y: card.y + border, w: card.w - border * 2, h: card.h - border * 2 };
    const capY = card.y + card.h + 70 * u;
    const cap = { x: pad, y: capY, w: W - pad * 2, h: H - capY - 70 * u };
    const out = { ...base, img, card, title, cap, textBox: { x: img.x + pad * 0.5, y: img.y + pad * 0.5, w: img.w - pad, h: img.h - pad } };
    if (!portrait) {
      // 정사각 훅 장면: 카드 아래 칸이 110u 쯤이라 1.4배 훅 자막이 제목보다 작게 줄어들어서, 카드를 0.82배로 줄이고 자막 칸을 넓힙니다
      const hookH = cardH * 0.82;
      const hookW = Math.min(W - inset * 2, hookH * 1.5);
      const cardHook = { x: (W - hookW) / 2, y: titleH + 10 * u, w: hookW, h: hookH };
      const imgHook = { x: cardHook.x + border, y: cardHook.y + border, w: cardHook.w - border * 2, h: cardHook.h - border * 2 };
      const capHookY = cardHook.y + cardHook.h + 50 * u;
      Object.assign(out, { cardHook, imgHook, capHook: { x: pad, y: capHookY, w: W - pad * 2, h: H - capHookY - 56 * u } });
    }
    return out;
  }
  if (tpl === 'dark') {
    const thumb = { w: W * 0.62, h: portrait ? H * 0.24 : H * 0.4 };
    thumb.x = (W - thumb.w) / 2;
    thumb.y = titleH + 16 * u;
    const capY = thumb.y + thumb.h + 40 * u;
    const cap = { x: pad, y: capY, w: W - pad * 2, h: H - capY - 80 * u };
    const capNoImg = { x: pad, y: titleH + 20 * u, w: W - pad * 2, h: H - titleH - 100 * u };
    return { ...base, img: thumb, thumb, title, cap, capNoImg, textBox: capNoImg };
  }
  // band · blur (기존). 정사각에서 댓글 장식(comment)은 말풍선(아바타 줄 + 글)이 들어가게 사진을 조금 낮춥니다
  const imgH = Math.min(W, H * (portrait || p.overlay !== 'comment' ? 0.56 : 0.46));
  const img = { x: 0, y: titleH, w: W, h: imgH };
  const capY = img.y + img.h + 24 * u;
  return {
    ...base, img, title,
    cap: { x: pad, y: capY, w: W - pad * 2, h: H - capY - 50 * u },
    textBox: { x: pad, y: img.y + pad * 0.5, w: W - pad * 2, h: img.h - pad },
  };
}

/**
 * 가로 화면(16:9) 영역 나누기. 세로용 배치를 옆으로 늘이면 사진은 납작한 띠가 되고 자막 칸은 좁아지므로:
 * - 제목 띠는 얇게(높이의 16.5%, 제목은 한 줄로 이어 씀 — drawChrome), 제목 없는 모드는 채널 이름 자리(10%)만
 * - split: 왼쪽 사진(54%) · 오른쪽 글 패널(panelColor)에 자막을 세로 가운데로
 * - card: 카드를 왼쪽, 자막을 오른쪽 칸에. 사진 없는 글자 장면은 카드를 가운데 넓게(cardText)
 * - dark: 위 썸네일을 16:9 비율로(납작하게 잘리지 않게), 아래 큰 자막
 * - band·blur: 아래 자막 칸을 높이의 25%(댓글 장식이면 36%)로 잡고 나머지를 사진에
 * - full: 자막 칸 좌우 여백을 넓게(한 줄이 너무 길어지지 않게)
 * 크기는 모두 1080 기준 값 × u(=높이/1080)라 720p·1080p 가 같은 모양입니다.
 */
function layoutWide(p, W, H, u, pad) {
  const tm = p.titleMode || 'band';
  const titleH = (tm === 'band' ? 0.165 : 0.1) * H;
  const title = { x: pad, y: pad * 1.25, w: W - pad * 2, h: Math.max(10 * u, titleH - pad * 1.5) };
  const side = pad * 2; // 가운데 정렬 자막의 좌우 여백
  const hook = { x: side, y: titleH, w: W - side * 2, h: H - titleH - 150 * u };
  const tpl = p.template || 'band';
  const base = { u, pad, portrait: false, wide: true, titleH, hook };

  if (tpl === 'full') {
    return {
      ...base,
      img: { x: 0, y: 0, w: W, h: H },
      title: { x: pad, y: pad * 1.6, w: W - pad * 2, h: Math.max(10 * u, titleH - pad) },
      cap: { x: side, y: H * 0.6, w: W - side * 2, h: H * 0.3 },
      textBox: { x: side, y: titleH, w: W - side * 2, h: H * 0.6 - titleH },
    };
  }
  if (tpl === 'split') {
    const splitX = Math.round(W * 0.54);
    const img = { x: 0, y: titleH, w: splitX, h: H - titleH };
    const panel = { x: splitX, y: titleH, w: W - splitX, h: H - titleH };
    const cap = { x: panel.x + pad * 1.1, y: panel.y + pad, w: panel.w - pad * 2.2, h: panel.h - pad * 2 - 30 * u };
    // 사진 없는 장면은 사진 칸까지 패널색으로 채우므로(splitFill) 글은 화면 폭 전체에서 왼쪽 정렬
    const noImg = { x: side, y: titleH + pad * 0.8, w: W - side * 2, h: H - titleH - pad * 1.6 - 30 * u };
    return {
      ...base, img, panel, title, cap, noImg, splitFill: { x: 0, y: titleH, w: W, h: H - titleH },
      textBox: { x: pad, y: img.y + pad * 0.5, w: img.w - pad * 2, h: img.h - pad },
    };
  }
  if (tpl === 'card') {
    const top = titleH + 10 * u;
    const avail = H - top - 60 * u;
    const cardH = Math.min(avail, H * 0.66);
    const cardW = Math.min(W * 0.5, cardH * 1.32);
    const card = { x: pad * 1.6, y: top + (avail - cardH) / 2, w: cardW, h: cardH };
    const border = 16 * u;
    const inset = (c) => ({ x: c.x + border, y: c.y + border, w: c.w - border * 2, h: c.h - border * 2 });
    const img = inset(card);
    const capX = card.x + card.w + pad * 1.4;
    const cap = { x: capX, y: card.y + pad * 0.5, w: W - capX - pad * 1.4, h: card.h - pad };
    const textW = Math.min(W - pad * 4.4, cardH * 1.75);
    const cardText = { x: (W - textW) / 2, y: card.y, w: textW, h: cardH };
    const imgText = inset(cardText);
    const textBoxText = { x: imgText.x + pad, y: imgText.y + pad * 0.5, w: imgText.w - pad * 2, h: imgText.h - pad };
    return {
      ...base, img, card, cardText, imgText, textBoxText, title, cap,
      textBox: { x: img.x + pad * 0.5, y: img.y + pad * 0.5, w: img.w - pad, h: img.h - pad },
    };
  }
  if (tpl === 'dark') {
    const th = H * 0.44;
    const thumb = { w: Math.min(W * 0.62, (th * 16) / 9), h: th };
    thumb.x = (W - thumb.w) / 2;
    thumb.y = titleH + 16 * u;
    const capY = thumb.y + thumb.h + 40 * u;
    const cap = { x: side, y: capY, w: W - side * 2, h: H - capY - 80 * u };
    const capNoImg = { x: side, y: titleH + 20 * u, w: W - side * 2, h: H - titleH - 100 * u };
    return { ...base, img: thumb, thumb, title, cap, capNoImg, textBox: capNoImg };
  }
  // band · blur
  const capZone = H * (p.overlay === 'comment' ? 0.36 : 0.25);
  const img = { x: 0, y: titleH, w: W, h: H - titleH - capZone };
  const capY = img.y + img.h + 22 * u;
  return {
    ...base, img, title,
    cap: { x: side, y: capY, w: W - side * 2, h: H - capY - 46 * u },
    textBox: { x: side, y: img.y + pad * 0.5, w: W - side * 2, h: img.h - pad },
  };
}

const easeInOut = (x) => 0.5 - Math.cos(Math.PI * clamp(x, 0, 1)) / 2;
const easeOut = (x) => { x = clamp(x, 0, 1); return 1 - (1 - x) * (1 - x) * (1 - x); };
/** 바닥에서 한 번 튀는 easeOutBounce 근사(0→1, 중간에 0.75·0.94 까지 되튀어 오름) */
const easeOutBounce = (x) => {
  x = clamp(x, 0, 1);
  const n1 = 7.5625;
  const d1 = 2.75;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
  if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
  return n1 * (x -= 2.625 / d1) * x + 0.984375;
};

function motionFor(p, index, prog) {
  let mode = p.motion;
  if (mode === 'none') return { zoom: 1, ox: 0, oy: 0 };
  if (mode === 'auto' || !mode) mode = ['in', 'right', 'out', 'left'][index % 4];
  const e = easeInOut(prog);
  if (mode === 'in') return { zoom: 1 + 0.12 * e, ox: 0, oy: 0 };
  if (mode === 'out') return { zoom: 1.12 - 0.12 * e, ox: 0, oy: 0 };
  if (mode === 'left') return { zoom: 1.12, ox: 0.85 - 1.7 * e, oy: 0 };
  return { zoom: 1.12, ox: -0.85 + 1.7 * e, oy: 0 };
}

// ── 캐시된 무거운 그림(흐림·격자·테이프·도면 패널) ─────────────
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

// 흐린 배경: 아주 작게 줄였다가 두 번에 나눠 키우면 가볍게 흐림 효과가 납니다(모든 브라우저 동작).
const blurCache = new WeakMap();
function blurredOf(img, W, H) {
  let per = blurCache.get(img);
  if (!per) blurCache.set(img, (per = new Map()));
  const key = `${W}x${H}`;
  if (per.has(key)) return per.get(key);
  const tiny = makeCanvas(Math.max(6, W / 36), Math.max(6, H / 36));
  drawImageFit(tiny.getContext('2d'), img, 0, 0, tiny.width, tiny.height, 'cover', 1.15);
  const mid = makeCanvas(Math.max(12, W / 9), Math.max(12, H / 9));
  const g = mid.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(tiny, 0, 0, mid.width, mid.height);
  // 프레임마다 작은 그림을 크게 키우면 느려서(고품질 확대 20ms+), 실제 크기로 한 번 키워 둡니다.
  const full = makeCanvas(W, H);
  const f = full.getContext('2d');
  f.imageSmoothingQuality = 'high';
  f.drawImage(mid, 0, 0, full.width, full.height);
  per.set(key, full);
  return full;
}

const patternCache = new Map();
function cached(key, make) {
  let v = patternCache.get(key);
  if (!v) {
    if (patternCache.size > 64) patternCache.clear();
    patternCache.set(key, (v = make()));
  }
  return v;
}

/** 도면·지적도 느낌의 글자 장면 배경(크기별 캐시) */
function panelCanvas(w, h, u) {
  return cached(`panel:${Math.round(w)}x${Math.round(h)}`, () => {
    const c = makeCanvas(w, h);
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, c.width, c.height);
    grad.addColorStop(0, '#18213f');
    grad.addColorStop(1, '#0c1020');
    g.fillStyle = grad;
    g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = 'rgba(255,255,255,0.05)';
    g.lineWidth = 2 * u;
    const step = 90 * u;
    g.beginPath();
    for (let x = step; x < c.width; x += step) { g.moveTo(x, 0); g.lineTo(x, c.height); }
    for (let y = step; y < c.height; y += step) { g.moveTo(0, y); g.lineTo(c.width, y); }
    g.stroke();
    return c;
  });
}
function drawTextPanel(ctx, p, L, rect) {
  ctx.drawImage(panelCanvas(rect.w, rect.h, L.u), rect.x, rect.y, rect.w, rect.h);
}

/** card 템플릿의 옅은 도트 격자(패턴 캐시) */
function dotPattern(ctx, u, color) {
  return cached(`dots:${u.toFixed(3)}:${color}`, () => {
    const s = Math.max(8, Math.round(38 * u));
    const c = makeCanvas(s, s);
    const g = c.getContext('2d');
    g.fillStyle = color;
    g.beginPath();
    g.arc(s / 2, s / 2, Math.max(1, 2.2 * u), 0, Math.PI * 2);
    g.fill();
    return ctx.createPattern(c, 'repeat');
  });
}

/** 노랑-검정 사선 경고 테이프(패턴 캐시) */
function tapePattern(ctx, u) {
  return cached(`tape:${u.toFixed(3)}`, () => {
    const s = Math.max(8, Math.round(56 * u));
    const c = makeCanvas(s, s);
    const g = c.getContext('2d');
    g.fillStyle = '#ffd400';
    g.fillRect(0, 0, s, s);
    // 45° 검은 띠: (x+y) 가 s 주기로 0~s/2 인 구간. 타일 경계가 이어지게 세 번 그립니다.
    g.fillStyle = '#111';
    g.beginPath();
    for (const k of [-1, 0, 1]) {
      const b = k * s;
      g.moveTo(b, 0); g.lineTo(b + s / 2, 0); g.lineTo(b + s / 2 - s, s); g.lineTo(b - s, s); g.closePath();
    }
    g.fill();
    return ctx.createPattern(c, 'repeat');
  });
}

// ── 자막 어휘 ─────────────────────────────────────────
/** 자막 모양(captionStyle) 전체. 모르는 값은 outline 으로 봅니다. 뜻은 docs/STYLE-SPEC.md 1절. */
export const CAPTION_STYLES = ['outline', 'box', 'plain', 'pill', 'neon', 'shadow3d', 'marker', 'glass', 'tag', 'underline', 'gradient', 'bubble'];
/** 자막 등장(captionAnim) 전체. 모르는 값은 none 으로 봅니다. */
export const CAPTION_ANIMS = ['none', 'words', 'karaoke', 'type', 'pop', 'bounce', 'scale', 'slide', 'wave', 'flash'];
const CAPTION_STYLE_SET = new Set(CAPTION_STYLES);
/** 줄 간격 배율(모양별). 칩·알약처럼 줄 뒤에 배경이 붙는 모양은 줄 사이가 붙지 않게 넓힙니다. */
const LINE_HEIGHT = { pill: 1.42, tag: 1.5, marker: 1.36, glass: 1.3, bubble: 1.3 };
/** 띄어쓰기 폭 배율(모양별). 단어 칩(tag)은 칩 사이에 틈이 보이게 공백을 넓힙니다. */
const WS_MUL = { tag: 2.3 };
/** 글자 블록 바깥에 패널·칩이 붙는 모양은 글자 영역을 그만큼(글자 크기 배) 안쪽으로 들여 상자 밖으로 나가지 않게 합니다. */
const BLOCK_INSET = { glass: { x: 0.32, y: 0.2 }, bubble: { x: 0.42, y: 0.28, tail: 0.45 }, tag: { x: 0.2, y: 0.1 } };

// ── 글자 ──────────────────────────────────────────────
/** "*강조*" 표시를 읽어 [{text, hl}] 조각으로 나눕니다. */
export function parseRuns(line) {
  const runs = [];
  let hl = false;
  for (const part of String(line).split('*')) {
    if (part) runs.push({ text: part, hl });
    hl = !hl;
  }
  return runs;
}

export const plainText = (s) => String(s || '').replace(/\*/g, '');

/** 띄어쓰기 단위 단어 목록(강조 표시는 각 단어 안에 다시 넣어 돌려줍니다). pop 자막용 */
function markedWords(text) {
  const words = [];
  let cur = null;
  for (const run of parseRuns(String(text).replace(/\n/g, ' '))) {
    for (const tok of run.text.split(/(\s+)/)) {
      if (!tok) continue;
      if (/^\s+$/.test(tok)) { cur = null; continue; }
      if (!cur) words.push((cur = []));
      cur.push(run.hl ? `*${tok}*` : tok);
    }
  }
  return words.map((segs) => segs.join(''));
}

/**
 * 폭에 맞춰 줄을 나눕니다. 띄어쓰기 단위로 자르고, 한 단어가 너무 길면 글자 단위로 자릅니다.
 * 조각마다 wi(단어 번호)·ci(글자 위치)·ws(공백 여부)를 붙여 자막 애니메이션이 씁니다.
 * wi 는 띄어쓰기(문단 시작) 기준으로만 늘어나므로 "*90%*가"·"*균열*·누수" 처럼 강조 뒤에 붙은 조사·조각은 강조어와 같은 단어입니다.
 * wsMul: 띄어쓰기 폭 배율(단어 칩 모양에서 칩 사이 틈)
 */
function wrapRich(ctx, text, maxW, wsMul = 1) {
  const lines = [];
  let wi = -1;
  let ci = 0;
  const paras = String(text).split('\n');
  for (let pi = 0; pi < paras.length; pi++) {
    if (pi) ci += 1;
    let line = [];
    let lineW = 0;
    const push = () => {
      while (line.length && line[line.length - 1].ws) lineW -= line.pop().w;
      lines.push({ runs: line, w: lineW });
      line = [];
      lineW = 0;
    };
    let newWord = true; // 문단 시작·띄어쓰기 뒤에만 새 단어 번호(run 이 바뀌어도 공백 없이 이어지면 같은 단어)
    for (const run of parseRuns(paras[pi])) {
      for (const tok of run.text.split(/(\s+)/)) {
        if (!tok) continue;
        const ws = /^\s+$/.test(tok);
        const start = ci;
        ci += tok.length;
        if (ws) newWord = true;
        else if (newWord) { wi++; newWord = false; }
        if (!line.length && ws) continue;
        const w = ctx.measureText(tok).width * (ws ? wsMul : 1);
        if (lineW + w <= maxW || !line.length) {
          if (w > maxW && !ws) {
            let k = 0;
            for (const ch of tok) {
              const cw = ctx.measureText(ch).width;
              if (lineW + cw > maxW && line.length) push();
              line.push({ text: ch, hl: run.hl, w: cw, wi, ci: start + k, ws: false });
              lineW += cw;
              k += ch.length;
            }
          } else {
            line.push({ text: tok, hl: run.hl, w, wi, ci: start, ws });
            lineW += w;
          }
        } else {
          push();
          if (ws) continue;
          line.push({ text: tok, hl: run.hl, w, wi, ci: start, ws });
          lineW += w;
        }
      }
    }
    push();
  }
  return { lines: lines.filter((l, i, all) => l.runs.length || all.length === 1), words: wi + 1, chars: ci };
}

// 글자 줄나눔은 프레임마다 똑같으므로 캐시합니다(글·크기·폭이 같으면 재사용).
const textLayoutCache = new Map();
function layoutText(ctx, text, box, o, style = o.style) {
  const weight = o.weight ?? o.family;
  const lhMul = o.lineHeight || LINE_HEIGHT[style] || 1.28;
  const wsMul = WS_MUL[style] || 1;
  const maxLines = o.maxLines || 99;
  const key = `${text}\u0001${o.size.toFixed(1)}\u0001${weight}\u0001${Math.round(box.w)}\u0001${Math.round(box.h)}\u0001${maxLines}\u0001${lhMul}\u0001${wsMul}`;
  let v = textLayoutCache.get(key);
  if (v) return v;
  let size = o.size;
  const minSize = o.size * 0.5;
  let wrapped;
  for (;;) {
    ctx.font = fontCss(weight, size);
    wrapped = wrapRich(ctx, text, box.w, wsMul);
    const h = wrapped.lines.length * size * lhMul;
    if ((wrapped.lines.length <= maxLines && h <= box.h) || size <= minSize) break;
    size *= 0.93;
  }
  v = { size, lh: size * lhMul, lines: wrapped.lines, words: wrapped.words, chars: wrapped.chars, weight };
  if (textLayoutCache.size > 400) textLayoutCache.clear();
  textLayoutCache.set(key, v);
  return v;
}

const VIS = { alpha: 1, dy: 0, kind: 'read' };
const HIDE = { alpha: 0, dy: 0, kind: 'hide' };
const CUR = { alpha: 1, dy: 0, kind: 'cur' };
const DIM = { alpha: 0.55, dy: 0, kind: 'dim' }; // 가라오케에서 아직 안 읽은 글자(밝은 배경에서도 보이게 0.55)

/**
 * 자막 애니메이션별 조각 상태 함수. anim = { mode, t(장면 시작 후 초), dur(장면 길이) }
 * 돌려주는 함수 state(pc, li, ln) → { alpha, dy, dx?, cut?, kind }  (li=줄 번호, ln=줄)
 *   kind: read(평소) · hide · cur(가라오케 읽는 단어: 강조색+살짝 확대+밑줄) · dim(아직 안 읽음) · flash(깜빡 강조: 강조색만)
 * slide 처럼 줄 단위로 움직이는 모드는 state.lineDx(li, ln) 도 붙여서 줄 배경(띠·칩·밑줄)이 글자와 함께 움직이게 합니다.
 * env = { lineX(ln)(줄의 시작 x), u }
 */
function makeState(anim, TL, size, env) {
  if (!anim) return null;
  const { mode } = anim;
  const t = Math.max(0, anim.t);
  const dur = Math.max(0.5, anim.dur || 3);
  const N = Math.max(1, TL.words);
  if (mode === 'bounce') {
    // 단어가 줄 위 글자 크기의 0.5 에서 떨어져 바닥에서 한 번 튀며 자리 잡음(장면 앞 55% 안에 단어 분배, 단어마다 0.5초).
    // 낙하 거리를 줄 안에 두어 사진·카드 테두리·패널 경계 위로 나가지 않고(drawRichText 가 상자로 한 번 더 잘라 냄),
    // 여러 줄이면 앞 줄 단어가 다 떨어진 뒤 다음 줄이 시작해 떨어지는 글자가 앞 줄 글자를 관통하지 않습니다.
    const FALL = 0.5;
    const win = Math.max(0.3, dur * 0.55);
    const L = Math.max(1, TL.lines.length);
    // 줄 경계 간격 g: 단어 간격(spread/N) + g = FALL 이 되게 풉니다. 줄이 아주 많아 win 안에 못 넣으면 겹침을 조금 허용(spread ≥ 0)
    const g = L > 1 ? clamp((FALL * N - win) / Math.max(1, N - L + 1), 0, win / (L - 1)) : 0;
    const spread = win - g * (L - 1);
    return (pc, li = 0) => {
      if (pc.ws) return VIS;
      const x = (t - ((pc.wi / N) * spread + li * g)) / FALL;
      if (x <= 0) return HIDE;
      if (x >= 1) return VIS;
      return { alpha: Math.min(1, x * 2.5), dy: -(1 - easeOutBounce(x)) * size * 0.5, kind: 'read' };
    };
  }
  if (mode === 'slide') {
    // 줄 단위로 왼쪽 화면 밖에서 미끄러져 들어옴(줄마다 0.12초 지연, 0.42초 easeOut)
    const lineDx = (li, ln) => {
      const e = easeOut((t - li * 0.12) / 0.42);
      if (e >= 1) return 0;
      return -(1 - e) * (env.lineX(ln) + ln.w + 60 * env.u);
    };
    const fn = (pc, li, ln) => {
      const dx = lineDx(li, ln);
      return dx === 0 ? VIS : { alpha: 1, dy: 0, dx, kind: 'read' };
    };
    fn.lineDx = lineDx;
    return fn;
  }
  if (mode === 'wave') {
    // 단어가 순서대로 살짝 위아래로 물결(진폭 글자 크기의 0.06, 주기 1.6초). 등장은 0.4초 페이드
    const alpha = easeOut(t / 0.4);
    const phase = (t / 1.6) * Math.PI * 2;
    return (pc) => (pc.ws ? VIS : { alpha, dy: Math.sin(phase - pc.wi * 0.55) * size * 0.06, kind: 'read' });
  }
  if (mode === 'flash') {
    // 읽는 단어(가라오케와 같은 시간 분배)가 강조색으로 0.1초 간격 깜빡임(알파 1↔0.55). 나머지는 평소대로
    const win = Math.max(0.4, dur * 0.85);
    const cur = t >= win ? N : Math.floor(t / (win / N));
    const flash = { alpha: Math.floor(t / 0.1) % 2 === 0 ? 1 : 0.55, dy: 0, kind: 'flash' };
    return (pc) => (pc.ws || pc.wi !== cur ? VIS : flash);
  }
  if (mode === 'words') {
    const win = Math.max(0.3, dur * 0.6);
    return (pc) => {
      if (pc.ws) return VIS;
      const tw = ((pc.wi) / N) * win;
      const e = easeOut((t - tw) / 0.22);
      if (e <= 0) return HIDE;
      if (e >= 1) return VIS;
      return { alpha: e, dy: (1 - e) * 0.45 * size, kind: 'read' };
    };
  }
  if (mode === 'karaoke') {
    const win = Math.max(0.4, dur * 0.85);
    const step = win / N;
    const cur = t >= win ? N : Math.floor(t / step);
    return (pc) => (pc.ws || pc.wi < cur ? VIS : pc.wi === cur ? CUR : DIM);
  }
  if (mode === 'type') {
    const win = Math.max(0.3, dur * 0.6);
    const C = Math.max(1, TL.chars);
    const vis = t >= win ? C : Math.floor((t / win) * C);
    return (pc) => {
      const end = pc.ci + pc.text.length;
      if (end <= vis) return VIS;
      if (pc.ci >= vis) return HIDE;
      return { alpha: 1, dy: 0, kind: 'read', cut: vis - pc.ci };
    };
  }
  return null;
}

/** pop 자막: 1~2단어씩 교체. 줄바꿈을 먼저 지키고(구 경계가 깨지지 않게) 줄 안에서만 2단어씩 묶습니다. 현재 보여 줄 글과 크기 배율 */
function popGroup(text, anim) {
  const groups = [];
  for (const line of String(text).split('\n')) {
    const words = markedWords(line);
    if (!words.length) continue;
    if (words.length <= 3) groups.push(words.join(' ')); // 짧은 줄은 통째로(구 하나가 한 묶음)
    else for (let i = 0; i < words.length; i += 2) groups.push(words.slice(i, i + 2).join(' '));
  }
  if (!groups.length) return null;
  const G = groups.length;
  const step = Math.max(0.2, (anim.dur || 3) / G);
  const g = clamp(Math.floor(Math.max(0, anim.t) / step), 0, G - 1);
  const lt = Math.max(0, anim.t) - g * step;
  return { text: groups[g], scale: 1.35 - 0.35 * easeOut(lt / 0.18) };
}

/** 한 줄의 조각을 띄어쓰기 기준 "단어 묶음"으로 나눕니다(단어 칩용). 줄 객체에 캐시(글자 구조만 쓰므로 모양과 무관). */
function wordGroups(ln) {
  if (ln.groups) return ln.groups;
  const groups = [];
  let x = 0;
  let cur = null;
  for (const r of ln.runs) {
    if (r.ws) { cur = null; x += r.w; continue; }
    if (!cur) groups.push((cur = { x, w: 0, hl: false, runs: [] }));
    cur.w += r.w;
    cur.hl = cur.hl || r.hl;
    cur.runs.push(r);
    r.group = cur;
    x += r.w;
  }
  ln.groups = groups;
  return groups;
}

/**
 * 상자 안에 강조 글씨를 그립니다. 넘치면 글자를 줄여 맞춥니다.
 * o = { size, weight(또는 family), color, hl, style: CAPTION_STYLES 중 하나(모르면 outline), valign: top|center|bottom, align: center|left,
 *       maxLines, alpha, u, shadow, strokeColor, boxColor, pillColor, anim: {mode, t, dur}, lineHeight,
 *       accent(강조색 원본 — 빛무리·형광펜 띠·밑줄·칩에 씀, 없으면 hl), ink(밝은 면 위 글자색), brightBg(밝은 배경 위인지), chipColor(단어 칩 본문 색) }
 * 그리는 순서: 1) 줄·블록 배경(띠·알약·형광펜·밑줄·칩·유리 패널·말풍선) 2) 글자 레이어(빛무리·그림자·테두리 → 글자) — 레이어마다 모든 글자를 한 번씩 돌아,
 * 테두리나 그림자가 옆 글자를 덮지 않게 합니다. shadowBlur·filter 는 느려서 쓰지 않습니다.
 */
export function drawRichText(ctx, text, box, o) {
  if (!plainText(text).trim()) return;
  let anim = o.anim && o.anim.mode && o.anim.mode !== 'none' ? o.anim : null;
  const u = o.u || 1;
  const style = CAPTION_STYLE_SET.has(o.style) ? o.style : 'outline';
  // 블록 전체가 커지거나(pop·scale) 흐려지는 애니메이션
  let blockScale = 1;
  let blockAlpha = 1;
  let popScale = null; // pop 묶음의 현재 배율(1.35→1). 줄 폭을 안 뒤 상자에 맞춰 blockScale 로 바꿉니다
  if (anim?.mode === 'pop') {
    const g = popGroup(text, anim);
    if (!g) return;
    text = g.text;
    popScale = g.scale;
    o = { ...o, size: o.size * 1.25, valign: 'center', maxLines: 3 };
    anim = null;
  } else if (anim?.mode === 'scale') {
    // 자막 전체가 0.6→1.0 으로 커지며 알파 0→1 (0.35초), 이후 정지
    const e = easeOut(Math.max(0, anim.t) / 0.35);
    if (e <= 0) return;
    blockScale = 0.6 + 0.4 * e;
    blockAlpha = e;
    anim = null;
  }
  // 패널·칩이 붙는 모양은 글자 영역을 안쪽으로 들여 상자 밖으로 나가지 않게(자동 축소·maxLines 는 들인 상자 기준으로 그대로 동작)
  const inset = BLOCK_INSET[style];
  const lbox = inset
    ? { x: box.x + o.size * inset.x, y: box.y + o.size * inset.y, w: Math.max(10, box.w - o.size * inset.x * 2), h: Math.max(10, box.h - o.size * (inset.y * 2 + (inset.tail || 0))) }
    : box;
  const TL = layoutText(ctx, text, lbox, o, style);
  const { size, lh, lines } = TL;
  const blockH = lines.length * lh;
  let y0 = lbox.y;
  if (o.valign === 'center') y0 = lbox.y + (lbox.h - blockH) / 2;
  else if (o.valign === 'bottom') y0 = lbox.y + lbox.h - blockH;
  const left = o.align === 'left';
  const lineX = (ln) => (left ? lbox.x : lbox.x + (lbox.w - ln.w) / 2);
  const lineY = (i) => y0 + i * lh + lh / 2;
  if (popScale != null) {
    // pop 묶음은 상자 가운데를 중심으로 커지므로, 가장 긴 줄·전체 높이가 상자 밖으로 나가지 않는 최대 배율(≤1.35)까지만 커집니다
    // (상자 폭에 꽉 찬 묶음은 1.35 배에서 화면 좌우가 잘렸음)
    const cx = box.x + box.w / 2;
    let peak = 1.35;
    for (const ln of lines) {
      const x0 = lineX(ln);
      const x1 = x0 + ln.w;
      if (x0 < cx) peak = Math.min(peak, (cx - box.x) / (cx - x0));
      if (x1 > cx) peak = Math.min(peak, (box.x + box.w - cx) / (x1 - cx));
    }
    peak = Math.max(1, Math.min(peak, box.h / Math.max(1, blockH)));
    blockScale = 1 + (popScale - 1) * ((peak - 1) / 0.35);
  }
  const state = makeState(anim, TL, size, { lineX, u });
  const lineDx = state?.lineDx || null;
  const shift = (i, ln) => (lineDx ? lineDx(i, ln) : 0);
  const stateOf = (r, i, ln) => (state ? state(r, i, ln) : VIS);
  /**
   * 줄에서 가장 진한 글자 조각의 알파(줄 배경이 첫 글자와 함께 나타나게. 공백 조각은 항상 보이는 상태라 뺍니다).
   * 가라오케의 '아직 안 읽은'(dim) 글자는 보이는 것으로 쳐서 띠·알약·형광펜·밑줄이 55% 로 깔렸다가 튀지 않게 합니다(글자만 흐림).
   */
  const lineAlpha = (ln, i) => {
    if (!state) return 1;
    let a = 0;
    for (const r of ln.runs) {
      if (r.ws) continue;
      const st = stateOf(r, i, ln);
      a = Math.max(a, st.kind === 'dim' ? 1 : st.alpha);
      if (a >= 1) break;
    }
    return a;
  };
  const accent = o.accent || o.hl;
  const ink = o.ink || '#111111';
  const onAccent = isBright(accent) ? ink : '#ffffff'; // 강조색 면 위 글자색
  const brightGlyph = isBright(o.color);

  ctx.save();
  const baseAlpha = ctx.globalAlpha * (o.alpha ?? 1) * blockAlpha;
  ctx.globalAlpha = baseAlpha;
  if (blockScale !== 1) {
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    ctx.translate(cx, cy);
    ctx.scale(blockScale, blockScale);
    ctx.translate(-cx, -cy);
  }
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.lineJoin = 'round';
  ctx.font = fontCss(TL.weight, size);
  // 튕기며 떨어지는 자막은 떨어지는 동안 상자 밖(사진·카드 테두리·패널 경계)으로 나가지 않게 상자(좌우 글자 크기, 아래 0.5 만 여유)로 잘라 냅니다
  if (anim?.mode === 'bounce') {
    ctx.beginPath();
    ctx.rect(box.x - size, box.y, box.w + size * 2, box.h + size * 0.5);
    ctx.clip();
  }

  // ── 1) 배경 ──
  if (style === 'box' || style === 'pill') {
    // 줄마다 검은 띠·강조색 알약
    const pill = style === 'pill';
    ctx.fillStyle = pill ? (o.pillColor || o.hl) : (o.boxColor || 'rgba(0,0,0,0.72)');
    lines.forEach((ln, i) => {
      if (!ln.runs.length) return;
      const a = lineAlpha(ln, i);
      if (a <= 0) return;
      ctx.globalAlpha = baseAlpha * a;
      const x = lineX(ln) + shift(i, ln);
      const py = size * (pill ? 0.16 : 0.2);
      const px = size * (pill ? 0.42 : 0.32);
      roundRectPath(ctx, x - px, y0 + i * lh + (lh - size) / 2 - py, ln.w + px * 2, size + py * 2, pill ? size : 10 * u);
      ctx.fill();
    });
    ctx.globalAlpha = baseAlpha;
  } else if (style === 'marker') {
    // 줄 뒤에 형광펜처럼 살짝 기울어진 강조색 띠(줄 높이의 0.7, 줄마다 기울기 번갈아)
    ctx.fillStyle = accent;
    const bh = lh * 0.7;
    const bx = size * 0.18;
    lines.forEach((ln, i) => {
      if (!ln.runs.length) return;
      const a = lineAlpha(ln, i);
      if (a <= 0) return;
      ctx.globalAlpha = baseAlpha * a * 0.92;
      const cx = lineX(ln) + shift(i, ln) + ln.w / 2;
      ctx.save();
      ctx.translate(cx, lineY(i) + size * 0.06);
      ctx.rotate((i % 2 ? 1 : -1) * 0.012);
      ctx.fillRect(-ln.w / 2 - bx, -bh / 2, ln.w + bx * 2, bh);
      ctx.restore();
    });
    ctx.globalAlpha = baseAlpha;
  } else if (style === 'underline') {
    // 줄 아래 강조색 굵은 밑줄, 강조 단어 구간은 더 두껍게
    ctx.fillStyle = accent;
    lines.forEach((ln, i) => {
      if (!ln.runs.length) return;
      const a = lineAlpha(ln, i);
      if (a <= 0) return;
      ctx.globalAlpha = baseAlpha * a;
      const x0 = lineX(ln) + shift(i, ln);
      const uy = lineY(i) + size * 0.5;
      ctx.fillRect(x0, uy, ln.w, Math.max(2, size * 0.09));
      let x = x0;
      for (const r of ln.runs) {
        if (r.hl && !r.ws) ctx.fillRect(x, uy - size * 0.05, r.w, Math.max(3, size * 0.17));
        x += r.w;
      }
    });
    ctx.globalAlpha = baseAlpha;
  } else if (style === 'tag') {
    // 단어마다 작은 둥근 칩(본문은 어두운 반투명, 강조 단어는 강조색). 칩은 단어와 같은 알파·높이로 움직입니다
    const px = size * 0.2;
    const ch = size * 1.14;
    lines.forEach((ln, i) => {
      if (!ln.runs.length) return;
      const x0 = lineX(ln) + shift(i, ln);
      const y = lineY(i);
      for (const g of wordGroups(ln)) {
        const st = stateOf(g.runs[0], i, ln);
        if (st.alpha <= 0) continue;
        ctx.globalAlpha = baseAlpha * (st.kind === 'dim' ? 1 : st.alpha); // 가라오케의 안 읽은 단어도 칩은 꽉 차게(글자만 흐림)
        ctx.fillStyle = g.hl ? accent : (o.chipColor || 'rgba(0,0,0,0.62)');
        roundRectPath(ctx, x0 + g.x - px, y + st.dy - ch / 2 + size * 0.03, g.w + px * 2, ch, size * 0.3);
        ctx.fill();
      }
    });
    ctx.globalAlpha = baseAlpha;
  } else if (style === 'glass' || style === 'bubble') {
    // 줄 블록 전체 뒤에 패널 하나: glass=반투명 둥근 패널+가는 테두리, bubble=흰 말풍선(왼쪽 아래 꼬리)+그림자
    const bubble = style === 'bubble';
    const padX = size * (bubble ? 0.42 : 0.32);
    const padY = size * (bubble ? 0.28 : 0.2);
    let minX = Infinity;
    let maxX = -Infinity;
    let a = 0;
    lines.forEach((ln, i) => {
      if (!ln.runs.length) return;
      const x = lineX(ln);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x + ln.w);
      a = Math.max(a, lineAlpha(ln, i));
    });
    if (minX < maxX && a > 0) {
      const rect = { x: minX - padX, y: y0 - padY, w: maxX - minX + padX * 2, h: blockH + padY * 2 };
      const rad = bubble ? size * 0.5 : 20 * u;
      ctx.globalAlpha = baseAlpha * a;
      if (bubble) {
        const bottom = rect.y + rect.h;
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        roundRectPath(ctx, rect.x + 3 * u, rect.y + 8 * u, rect.w, rect.h, rad);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); // 꼬리
        ctx.moveTo(rect.x + size * 0.55, bottom - 2 * u);
        ctx.lineTo(rect.x + size * 1.2, bottom - 2 * u);
        ctx.lineTo(rect.x + size * 0.3, bottom + size * 0.42);
        ctx.closePath();
        ctx.fill();
        roundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, rad);
        ctx.fill();
      } else {
        ctx.fillStyle = o.brightBg ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.22)';
        roundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, rad);
        ctx.fill();
        ctx.strokeStyle = o.brightBg ? 'rgba(0,0,0,0.28)' : 'rgba(255,255,255,0.6)';
        ctx.lineWidth = Math.max(1, 1.5 * u);
        ctx.stroke();
      }
      ctx.globalAlpha = baseAlpha;
      // 줄이 옆에서 밀려오는 애니메이션이면 패널 안에서 나타나게 패널로 잘라 냅니다
      if (lineDx) { roundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, rad); ctx.clip(); }
    }
  }

  // ── 2) 글자 레이어 ──
  // 밝은 글자엔 검은 테두리, 사진 위 어두운 글자엔 흰 테두리. 밝은 면(흰 패널·밝은 띠) 위 어두운 글자는 흰 테두리가 면에 묻혀
  // '글씨만'과 똑같이 보였으므로 강조색 테두리(강조 단어는 잉크색 테두리로 뒤집어 강조색 속에 묻히지 않게), 강조색마저 어두우면 얇은 반투명 검정 테두리
  let strokeColor = o.strokeColor;
  let strokeHl;
  let strokeW = Math.max(2, size * 0.17);
  if (!strokeColor) {
    if (brightGlyph) strokeColor = 'rgba(0,0,0,0.92)';
    else if (!o.brightBg) strokeColor = 'rgba(255,255,255,0.9)';
    else if (isBright(accent)) { strokeColor = rgba(accent, 0.9); strokeHl = rgba(isBright(ink) ? '#111111' : ink, 0.9); }
    else { strokeColor = 'rgba(0,0,0,0.25)'; strokeW = Math.max(1.5, size * 0.08); }
  }
  // 흐림 그림자(shadowBlur)는 비싸서, 살짝 어긋난 어두운 글씨로 대신합니다(1080p 30fps 를 지키기 위함).
  const layers = [];
  if (style === 'outline') layers.push({ kind: 'stroke', color: strokeColor, hlColor: strokeHl, width: strokeW });
  else if (style === 'plain' || style === 'underline') { if (o.shadow !== false && brightGlyph) layers.push({ kind: 'shadow', color: 'rgba(0,0,0,0.38)', dx: size * 0.035, dy: size * 0.05 }); }
  else if (style === 'neon') {
    // 넓은 반투명 강조색 스트로크 2겹이 빛무리. 강조 단어(강조색 글자)는 빛무리를 반대색(흰/잉크)으로 뒤집어 강조색 속에 묻히지 않게.
    // 사진 위(shadow)에서는 가는 검은 테두리를 한 겹 더
    const hlGlow = brightGlyph ? '#ffffff' : (isBright(ink) ? '#111111' : ink);
    layers.push({ kind: 'stroke', color: rgba(accent, 0.3), hlColor: rgba(hlGlow, 0.3), width: size * 0.44 });
    layers.push({ kind: 'stroke', color: rgba(accent, 0.55), hlColor: rgba(hlGlow, 0.55), width: size * 0.22 });
    if (o.shadow && brightGlyph) layers.push({ kind: 'stroke', color: 'rgba(0,0,0,0.5)', width: Math.max(1.5, size * 0.07) });
  } else if (style === 'shadow3d') {
    // 오른쪽 아래로 4단 쌓인 단색 그림자(총 글자 크기의 0.1). 밝은 글자엔 검정(inkColor), 어두운 글자엔 강조색. 강조색 글자의 그림자는 늘 검정(inkColor)
    const dark = isBright(ink) ? '#111111' : ink;
    const sc = brightGlyph ? dark : accent;
    for (let k = 4; k >= 1; k--) layers.push({ kind: 'shadow', color: sc, hlColor: dark, dx: size * 0.025 * k, dy: size * 0.025 * k });
  } else if (style === 'glass') { if (brightGlyph) layers.push({ kind: 'shadow', color: 'rgba(0,0,0,0.45)', dx: size * 0.03, dy: size * 0.04 }); }
  else if (style === 'gradient') layers.push({ kind: 'stroke', color: 'rgba(0,0,0,0.8)', width: Math.max(1.5, size * 0.07) });
  layers.push({ kind: 'fill' });

  /** 줄마다 1회 만드는 세로 그라데이션(위 35% 는 본문색 그대로, 아래로 갈수록 강조색) */
  const lineGrad = (y) => {
    const g = ctx.createLinearGradient(0, y - size * 0.5, 0, y + size * 0.5);
    g.addColorStop(0, o.color);
    g.addColorStop(0.35, o.color);
    g.addColorStop(1, accent);
    return g;
  };
  const colorOf = (r, st, lineFill) => {
    if (style === 'tag') {
      if (r.group?.hl) return onAccent; // 강조색 칩 안 글자
      if (st.kind === 'cur' || st.kind === 'flash') return accent;
      return st.kind !== 'dim' && r.hl ? o.hl : o.color;
    }
    if (st.kind === 'cur' || st.kind === 'flash') return o.hl;
    if (st.kind === 'dim') return o.color; // 아직 안 읽은 강조 단어는 본문색으로 흐리게 깔고, 읽는 순간부터 강조색
    if (r.hl) return o.hl;
    return lineFill || o.color;
  };

  const drawPiece = (r, st, x, y, layer, lineFill) => {
    const txt = st.cut != null ? r.text.slice(0, st.cut) : r.text;
    if (!txt) return;
    const xx = x + (st.dx || 0);
    const yy = y + st.dy;
    const cur = st.kind === 'cur';
    if (cur) {
      ctx.save();
      const cx = xx + r.w / 2;
      ctx.translate(cx, yy);
      ctx.scale(1.06, 1.06);
      ctx.translate(-cx, -yy);
    }
    if (layer.kind === 'stroke') {
      if (layer.hlColor) ctx.strokeStyle = r.hl ? layer.hlColor : layer.color; // 강조 단어만 다른 빛무리 색
      ctx.strokeText(txt, xx, yy);
    } else if (layer.kind === 'shadow') {
      ctx.fillStyle = layer.hlColor && r.hl ? layer.hlColor : layer.color;
      ctx.fillText(txt, xx + layer.dx, yy + layer.dy);
    } else {
      ctx.fillStyle = colorOf(r, st, lineFill);
      ctx.fillText(txt, xx, yy);
      if (cur) ctx.fillRect(xx, yy + size * 0.5, r.w, Math.max(2, size * 0.08));
    }
    if (cur) ctx.restore();
  };

  for (const layer of layers) {
    if (layer.kind === 'stroke') {
      ctx.strokeStyle = layer.color;
      ctx.lineWidth = layer.width;
    }
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      if (!ln.runs.length) continue;
      const y = lineY(i);
      let x = lineX(ln);
      const lineFill = layer.kind === 'fill' && style === 'gradient' ? lineGrad(y) : null;
      for (const r of ln.runs) {
        if (!r.ws) {
          const st = stateOf(r, i, ln);
          if (st.alpha > 0) {
            if (st.alpha !== 1) ctx.globalAlpha = baseAlpha * st.alpha;
            drawPiece(r, st, x, y, layer, lineFill);
            if (st.alpha !== 1) ctx.globalAlpha = baseAlpha;
          }
        }
        x += r.w;
      }
    }
  }
  ctx.restore();
}

/** 작은 라벨 칩. 돌려주는 값: 칩 폭 */
function chip(ctx, text, x, y, o) {
  const size = o.size;
  ctx.save();
  ctx.font = o.font || fontCss(o.weight || '800', size);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const padX = o.padX ?? size * 0.6;
  const h = o.h ?? size * 1.65;
  const w = ctx.measureText(text).width + padX * 2;
  let x0 = x;
  if (o.align === 'right') x0 = x - w;
  else if (o.align === 'center') x0 = x - w / 2;
  if (o.bg) {
    ctx.fillStyle = o.bg;
    roundRectPath(ctx, x0, y - h / 2, w, h, o.radius ?? h / 2);
    ctx.fill();
    // 배경과 칩 색이 비슷할 때(훅 장면) 윤곽이 사라지지 않게 테두리
    if (o.border) { ctx.strokeStyle = o.border; ctx.lineWidth = 3 * (o.u || 1); ctx.stroke(); }
  }
  ctx.fillStyle = o.color || '#fff';
  ctx.fillText(text, x0 + padX, y + size * 0.04);
  ctx.restore();
  return w;
}

// ── 장면 그리기 ───────────────────────────────────────
function drawEnding(ctx, p, L, W, H, logo, textAlpha = 1) {
  const { u } = L;
  ctx.save();
  ctx.fillStyle = p.bandColor;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, H * 0.45, 10 * u, W / 2, H * 0.45, Math.max(W, H) * 0.6);
  glow.addColorStop(0, isBright(p.bandColor) ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.10)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  // 가로 화면은 화면이 넓어 세로용 크기(자막 1.15배)로는 엔딩 문구가 작아 보여서 1.4배·칸 높이 30%로 키웁니다
  const E = L.wide ? { top: 0.28, h: 0.3, size: 1.4, sub: 42 } : { top: 0.32, h: 0.24, size: 1.15, sub: 36 };
  let y = H * E.top;
  if (logo) {
    const lh = 150 * u;
    const lw = (logo.naturalWidth / logo.naturalHeight) * lh;
    ctx.drawImage(logo, (W - lw) / 2, y - lh / 2, lw, lh);
    y += lh * 0.8;
  }
  const color = onColor(p.bandColor, p);
  // 글은 배경보다 늦게 나타납니다(전환 중 앞 장면 자막과 겹치지 않게) — textAlpha
  ctx.save();
  ctx.globalAlpha *= textAlpha;
  drawRichText(ctx, p.ending?.text, { x: L.pad, y, w: W - L.pad * 2, h: H * E.h }, {
    size: p.captionSize * E.size * u, weight: p.font, color, hl: p.highlightColor,
    style: 'plain', valign: 'center', maxLines: 3, u,
  });
  ctx.font = uiFont(E.sub * u);
  ctx.fillStyle = rgba(color, 0.72);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(plainText(p.ending?.sub), W / 2, y + H * E.h + 40 * u);
  ctx.restore();
  ctx.restore();
}

/**
 * 훅 전용 배경을 쓰는 장면인지. 사진이 화면을 채우는 full/blur 템플릿의 훅 장면만 "색 틴트 사진 + 큰 자막"으로 그리고,
 * card/split/band/dark 는 평소 레이아웃을 그대로 두고 자막만 키웁니다(20개 훅이 다 똑같아 보이지 않게).
 */
const hasHookBg = (p, scene) => scene?.kind === 'hook' && (p.template === 'full' || p.template === 'blur');

/** 훅 장면 배경: 선명한 사진 위에 highlight→band 그라데이션 틴트. 자막이 놓이는 화면 가운데 아래는 bandColor */
function drawHookBackground(ctx, p, W, H, scene) {
  if (scene.img) drawImageFit(ctx, scene.img, 0, 0, W, H, 'cover', 1.08);
  else { ctx.fillStyle = p.bandColor; ctx.fillRect(0, 0, W, H); }
  const g = ctx.createLinearGradient(0, 0, W * 0.35, H);
  g.addColorStop(0, p.highlightColor);
  g.addColorStop(0.45, p.bandColor);
  g.addColorStop(1, p.bandColor);
  ctx.save();
  if (scene.img) ctx.globalAlpha *= 0.62;
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/** 사진 없는 글자 장면의 자막 상자(템플릿별). split 은 사진 칸까지 패널색으로 채우므로 둘을 합친 영역 */
function noImgBox(p, L) {
  const { u, pad } = L;
  if (p.template === 'dark') return L.capNoImg;
  if (p.template === 'full') return L.hook;
  if (L.wide && p.template === 'split') return L.noImg;
  if (L.wide && p.template === 'card') return wideCardText(p, L) ? L.textBoxText : L.textBox;
  if (p.template === 'split' && L.panel) {
    const bottom = L.panel.y + L.panel.h;
    return { x: pad, y: L.img.y + pad * 0.5, w: L.img.w - pad * 2, h: bottom - L.img.y - pad - 30 * u };
  }
  return L.textBox;
}

/**
 * 가로 card 의 사진 없는 장면을 가운데 넓은 카드(cardText)로 그릴지. 왼쪽 카드에 글만 넣으면 오른쪽 자막 칸이 비므로 가운데로 옮기되,
 * 숫자 카운터(counter: 숫자는 왼쪽 카드, 자막은 오른쪽 칸)와 댓글(comment: 자막이 오른쪽 칸 말풍선)은 오른쪽 칸을 쓰므로 왼쪽 카드 그대로.
 */
const wideCardText = (p, L) => L.wide && p.template === 'card' && p.overlay !== 'counter' && p.overlay !== 'comment';
/** card 템플릿에서 이 장면이 쓰는 카드·사진 칸 */
const cardRects = (p, L, scene) => {
  if (!scene.img && wideCardText(p, L)) return { card: L.cardText, img: L.imgText };
  if (squareCardHook(L, scene)) return { card: L.cardHook, img: L.imgHook };
  return { card: L.card, img: L.img };
};
/** 정사각 card 의 사진 있는 훅 장면 — 카드를 줄이고 자막 칸을 넓힌 자리(layout 의 cardHook·imgHook·capHook)를 씁니다 */
const squareCardHook = (L, scene) => !!L.cardHook && !!scene?.img && scene.kind === 'hook';

/** 템플릿의 고정 배경(장면과 무관): card 도트 격자, split 패널 */
function drawStaticBackground(ctx, p, L, W, H) {
  if (p.template === 'card') {
    const color = isBright(p.bandColor) ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.12)';
    // 패턴 채우기는 화면 전체에 쓰면 느려서 화면 크기 그림으로 한 번 만들어 둡니다.
    const bg = cached(`dotsbg:${W}x${H}:${color}`, () => {
      const c = makeCanvas(W, H);
      const g = c.getContext('2d');
      g.fillStyle = dotPattern(g, L.u, color);
      g.fillRect(0, 0, W, H);
      return c;
    });
    ctx.drawImage(bg, 0, 0);
  } else if (p.template === 'split' && L.panel) {
    ctx.fillStyle = p.panelColor;
    ctx.fillRect(L.panel.x, L.panel.y, L.panel.w, L.panel.h);
  }
}

function drawSplitImages(ctx, scene, rect, zoom, m) {
  // vs 장식: 사진 두 장 좌우 비교
  const gap = Math.max(4, rect.w * 0.006);
  const half = (rect.w - gap) / 2;
  ctx.save();
  ctx.beginPath(); ctx.rect(rect.x, rect.y, half, rect.h); ctx.clip();
  drawImageFit(ctx, scene.img, rect.x, rect.y, half, rect.h, 'cover', zoom, m.ox, m.oy);
  ctx.restore();
  ctx.save();
  ctx.beginPath(); ctx.rect(rect.x + half + gap, rect.y, half, rect.h); ctx.clip();
  drawImageFit(ctx, scene.img2, rect.x + half + gap, rect.y, half, rect.h, 'cover', zoom, -m.ox, m.oy);
  ctx.restore();
  ctx.fillStyle = '#fff';
  ctx.fillRect(rect.x + half, rect.y, gap, rect.h);
}

function drawSceneVisual(ctx, p, L, W, H, seg, t, fx) {
  const scene = seg.scene;
  const { u } = L;
  const dur = seg.end - seg.start;
  const prog = (t - seg.start) / (dur + 0.5);
  const m = motionFor(p, seg.index, prog);
  const zoom = m.zoom * (fx.zoom || 1);
  const tpl = p.template;
  ctx.save();
  ctx.globalAlpha *= fx.alpha;
  ctx.translate(fx.dx, 0);

  if (hasHookBg(p, scene)) {
    drawHookBackground(ctx, p, W, H, scene);
    ctx.restore();
    return;
  }

  if (tpl === 'blur' && scene.img) {
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(blurredOf(scene.img, W, H), 0, 0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.fillRect(0, 0, W, H);
  }

  if (tpl === 'card') {
    const { card, img: r } = cardRects(p, L, scene);
    const cx = card.x + card.w / 2;
    const cy = card.y + card.h / 2;
    ctx.translate(cx, cy);
    ctx.rotate((-2 * Math.PI) / 180);
    ctx.translate(-cx, -cy);
    // 흐림 대신 겹친 반투명 사각형으로 가벼운 그림자
    for (let i = 3; i >= 1; i--) {
      ctx.fillStyle = 'rgba(0,0,0,0.07)';
      roundRectPath(ctx, card.x - i * 3 * u, card.y + i * 5 * u, card.w + i * 6 * u, card.h + i * 4 * u, 20 * u);
      ctx.fill();
    }
    ctx.fillStyle = '#ffffff';
    roundRectPath(ctx, card.x, card.y, card.w, card.h, 18 * u);
    ctx.fill();
    roundRectPath(ctx, r.x, r.y, r.w, r.h, 8 * u);
    ctx.clip();
    if (!scene.img) drawTextPanel(ctx, p, L, r);
    else if (p.overlay === 'vs' && scene.img2) drawSplitImages(ctx, scene, r, zoom, m);
    else drawImageFit(ctx, scene.img, r.x, r.y, r.w, r.h, 'cover', zoom, m.ox, m.oy);
    ctx.restore();
    return;
  }

  if (tpl === 'dark') {
    if (scene.img) {
      const r = L.thumb;
      roundRectPath(ctx, r.x, r.y, r.w, r.h, 28 * u);
      ctx.clip();
      if (p.overlay === 'vs' && scene.img2) drawSplitImages(ctx, scene, r, zoom, m);
      else drawImageFit(ctx, scene.img, r.x, r.y, r.w, r.h, 'cover', zoom, m.ox, m.oy);
    }
    ctx.restore();
    return;
  }

  const rect = L.img;
  if (!scene.img && tpl === 'split' && L.panel) {
    // split 은 사진 칸까지 패널색으로 채워 한 장의 글자 패널로(빈 사진 자리처럼 보이지 않게). 경계선이 남지 않게 한 번에 칠합니다.
    // (가로 화면은 사진 칸이 왼쪽이라 사진 칸 + 오른쪽 패널을 합친 splitFill 을 칠합니다)
    ctx.fillStyle = p.panelColor;
    if (L.splitFill) ctx.fillRect(L.splitFill.x, L.splitFill.y, L.splitFill.w, L.splitFill.h);
    else ctx.fillRect(rect.x, rect.y, rect.w, L.panel.y + L.panel.h - rect.y);
    ctx.restore();
    return;
  }
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  if (!scene.img) {
    drawTextPanel(ctx, p, L, rect);
  } else if (p.overlay === 'vs' && scene.img2) {
    drawSplitImages(ctx, scene, rect, zoom, m);
  } else if (tpl === 'blur') {
    const inset = 24 * u;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    if (!L.portrait) {
      // 가로·정사각 화면은 사진 칸이 사진보다 넓어 칸 전체 그림자가 사진 양옆에 어두운 띠로 보이므로, 그림자를 실제 사진 크기(contain)에만 깝니다
      const bw = rect.w - inset * 2;
      const bh = rect.h - inset * 2;
      const ratio = (scene.img.naturalWidth || scene.img.width || 1) / (scene.img.naturalHeight || scene.img.height || 1);
      const w = Math.min(bw, bh * ratio);
      const h = w / ratio;
      ctx.fillRect(rect.x + inset + (bw - w) / 2 + 6 * u, rect.y + inset + (bh - h) / 2 + 10 * u, w, h);
    } else ctx.fillRect(rect.x + inset + 6 * u, rect.y + inset + 10 * u, rect.w - inset * 2, rect.h - inset * 2);
    drawImageFit(ctx, scene.img, rect.x + inset, rect.y + inset, rect.w - inset * 2, rect.h - inset * 2, 'contain', 1 + (zoom - 1) * 0.35, 0, 0);
  } else {
    drawImageFit(ctx, scene.img, rect.x, rect.y, rect.w, rect.h, 'cover', zoom, m.ox, m.oy);
  }
  ctx.restore();
}

/**
 * 자막 모양 옵션(색·스타일)을 배경에 맞게 정리합니다. bg=자막이 놓이는 면의 색, overPhoto=사진 위인지.
 * 모르는 captionStyle 은 outline. bubble 은 댓글 장식(overlay=comment)과 겹치지 않게 plain 으로 내립니다.
 */
function captionLook(p, bg, overPhoto) {
  let style = CAPTION_STYLE_SET.has(p.captionStyle) ? p.captionStyle : 'outline';
  if (style === 'bubble' && p.overlay === 'comment') style = 'plain';
  const brightBg = !overPhoto && isBright(bg);
  let color = overPhoto ? p.textColor : onColor(bg, p);
  let hl = p.highlightColor;
  const brightText = isBright(p.textColor) ? p.textColor : '#ffffff'; // 어두운 면 위에 쓸 밝은 글자색
  const onAccent = isBright(p.highlightColor) ? p.inkColor : brightText; // 강조색 면 위 글자색
  let shadow = !isBright(color);
  let chipColor;
  if (style === 'box') color = brightText;
  else if (style === 'pill' || style === 'marker') { color = onAccent; hl = color; } // 강조색 면 위라 강조 단어도 같은 색
  else if (style === 'neon') { color = brightBg ? p.inkColor : '#ffffff'; shadow = overPhoto; } // 빛무리는 highlightColor, 사진 위에선 가는 검은 테두리
  else if (style === 'glass') { color = brightBg ? p.inkColor : '#ffffff'; if (brightBg && isBright(hl)) hl = p.inkColor; }
  else if (style === 'tag') { color = '#ffffff'; chipColor = overPhoto ? 'rgba(0,0,0,0.62)' : brightBg ? 'rgba(0,0,0,0.72)' : 'rgba(255,255,255,0.16)'; }
  else if (style === 'bubble') { color = p.inkColor; if (isBright(hl)) hl = p.inkColor; } // 흰 말풍선 위
  // shadow3d · underline · gradient 는 글자색을 plain 처럼 배경 밝기로 고르고, 그림자·밑줄·그라데이션 끝은 accent 를 씁니다
  return { color, hl, style, shadow, pillColor: p.highlightColor, accent: p.highlightColor, ink: p.inkColor, brightBg, chipColor };
}
/** 훅 배경·사진 없는 장면처럼 큰 글자를 가운데 놓는 자리에서도 유지하는 자막 모양(outline·box 는 plain 으로 단순화) */
const KEEP_STYLES = new Set(['pill', 'neon', 'shadow3d', 'marker', 'glass', 'tag', 'underline', 'gradient', 'bubble']);

function drawCaption(ctx, p, L, seg, alpha, t, adj) {
  if (seg.kind !== 'scene') return;
  const { u } = L;
  const scene = seg.scene;
  const dur = seg.end - seg.start;
  const anim = { mode: p.captionAnim, t: t - seg.start, dur };
  // titleMode=hook 이면 첫 장면의 자막 애니메이션은 제목 화면이 사라진 뒤 시작(제목에 덮여 첫 단어가 안 보이는 일이 없게)
  if (p.titleMode === 'hook' && seg.index === 0 && plainText(p.title).trim()) {
    const d = Math.min(HOOK_TITLE_HOLD + HOOK_TITLE_FADE, dur * 0.6);
    anim.t -= d;
    anim.dur = dur - d;
  }
  const tpl = p.template;
  const hook = scene.kind === 'hook';
  const overPhoto = tpl === 'full' || tpl === 'blur';
  const hookBg = hasHookBg(p, scene);
  let box;
  let o;
  if (hookBg) {
    // 훅 배경(틴트 사진) 위: 자막 자리는 bandColor 이므로 그 밝기로 글자색을 고릅니다
    const look = captionLook(p, p.bandColor, false);
    box = L.hook;
    o = { ...look, size: p.captionSize * 1.4 * u, valign: 'center', maxLines: 5, style: KEEP_STYLES.has(look.style) ? look.style : 'plain', shadow: isBright(look.color) };
  } else if (!scene.img && tpl !== 'dark') {
    // 사진 없는 장면: split 은 패널색 위(글자색은 패널 기준), 그 밖은 남색 도면 패널 위 흰 글자. 가운데 크게
    box = noImgBox(p, L);
    const bg = tpl === 'split' ? p.panelColor : null;
    o = {
      size: p.captionSize * (tpl === 'card' ? 1.1 : 1.25) * u, color: bg ? onColor(bg, p) : '#ffffff', hl: p.highlightColor,
      style: 'plain', valign: 'center', maxLines: 5, align: tpl === 'split' ? 'left' : 'center',
    };
    const look = captionLook(p, bg || '#000', false);
    if (KEEP_STYLES.has(look.style)) Object.assign(o, look);
    if (L.wide) o.size *= 1.2; // 가로 화면의 글자 장면은 칸이 넓어 1.2배로
  } else if (tpl === 'split') {
    box = L.cap;
    o = { ...captionLook(p, p.panelColor, false), size: p.captionSize * 1.12 * u, align: 'left', valign: 'top', maxLines: 4 };
  } else if (tpl === 'card') {
    box = squareCardHook(L, scene) ? L.capHook : L.cap;
    o = { ...captionLook(p, p.bandColor, false), size: p.captionSize * u, valign: 'top', maxLines: 3 };
  } else if (tpl === 'dark') {
    box = scene.img ? L.cap : L.capNoImg;
    o = { ...captionLook(p, p.bandColor, false), size: p.captionSize * (scene.img ? 1.3 : 1.5) * u, valign: 'center', maxLines: 5 };
  } else if (tpl === 'full') {
    box = L.cap;
    o = { ...captionLook(p, p.bandColor, true), size: p.captionSize * u, valign: 'center', maxLines: 3 };
  } else {
    box = L.cap;
    o = { ...captionLook(p, p.bandColor, tpl === 'blur'), size: p.captionSize * u, valign: 'top', maxLines: 3 };
  }
  // 가로 화면: split 오른쪽 패널·card 오른쪽 칸은 세로로 긴 칸이라 자막을 세로 가운데에(card 는 카드 옆이라 왼쪽 정렬, 조금 크게)
  if (L.wide && scene.img && !hookBg) {
    if (tpl === 'split') Object.assign(o, { size: o.size * 1.1, valign: 'center', maxLines: 5 });
    else if (tpl === 'card') Object.assign(o, { size: o.size * 1.3, align: 'left', valign: 'center', maxLines: 4 });
  }
  // 훅 장면은 평소 레이아웃이라도 자막을 1.4배로(이미 더 큰 글자 장면은 그대로)
  if (hook && !hookBg) o.size = Math.max(o.size, p.captionSize * 1.4 * u);
  if (adj) {
    if (adj.box) box = adj.box;
    if (adj.sizeMul) o.size *= adj.sizeMul;
    for (const k of ['color', 'hl', 'style', 'shadow', 'align', 'valign', 'maxLines']) if (adj[k] !== undefined) o[k] = adj[k];
  }
  drawRichText(ctx, scene.caption, box, { ...o, weight: p.font, alpha, u, anim });
}

function drawChrome(ctx, p, L, W, H, logo, alpha) {
  const { u, pad } = L;
  const overPhoto = p.template === 'full' || p.template === 'blur';
  ctx.save();
  ctx.globalAlpha *= alpha;
  if (p.template === 'full') {
    const top = ctx.createLinearGradient(0, 0, 0, L.title.y + L.title.h + pad);
    top.addColorStop(0, 'rgba(0,0,0,0.72)');
    top.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, W, L.title.y + L.title.h + pad);
    const bottom = ctx.createLinearGradient(0, L.cap.y - pad * 2, 0, H);
    bottom.addColorStop(0, 'rgba(0,0,0,0)');
    bottom.addColorStop(1, 'rgba(0,0,0,0.7)');
    ctx.fillStyle = bottom;
    ctx.fillRect(0, L.cap.y - pad * 2, W, H - L.cap.y + pad * 2);
  }
  const ink = overPhoto ? '#ffffff' : onColor(p.bandColor, p);
  // 채널 이름 + 로고
  const chY = L.title.y - pad * 0.45;
  if (p.channel) {
    ctx.font = uiFont(30 * u);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = p.highlightColor;
    ctx.beginPath();
    ctx.arc(pad + 9 * u, chY, 8 * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgba(ink, 0.85);
    ctx.fillText(p.channel, pad + 26 * u, chY);
  }
  if (logo) {
    const lh = 64 * u;
    const lw = (logo.naturalWidth / logo.naturalHeight) * lh;
    ctx.drawImage(logo, W - pad - lw, chY - lh / 2, lw, lh);
  }
  if (p.titleMode === 'band') {
    // 가로 화면은 제목 띠가 얇고 넓으므로 세로용 줄바꿈을 이어 한 줄로 씁니다(길면 자동으로 두 줄)
    drawRichText(ctx, L.wide ? String(p.title || '').replace(/\s*\n\s*/g, ' ') : p.title, L.title, {
      size: p.captionSize * 1.08 * u, weight: p.font, color: p.titleColor || ink, hl: p.highlightColor,
      style: overPhoto ? 'outline' : 'plain', shadow: overPhoto,
      valign: 'center', maxLines: L.wide ? 2 : 3, u,
    });
  }
  ctx.restore();
}

/** titleMode=hook: 첫 1.2초 동안 큰 제목이 화면을 덮고 0.25초에 걸쳐 사라집니다. */
const HOOK_TITLE_HOLD = 1.2;
const HOOK_TITLE_FADE = 0.25;
function drawHookTitle(ctx, p, L, W, H, t, logo) {
  const HOLD = HOOK_TITLE_HOLD;
  const FADE = HOOK_TITLE_FADE;
  if (t >= HOLD + FADE || !plainText(p.title).trim()) return;
  const a = t < HOLD ? 1 : 1 - (t - HOLD) / FADE;
  const { u, pad } = L;
  ctx.save();
  ctx.globalAlpha *= a;
  // 제목이 놓이는 화면 가운데는 bandColor 가 되게(강조색과 글자색이 겹치지 않음)
  const g = ctx.createLinearGradient(0, 0, W * 0.4, H);
  g.addColorStop(0, p.highlightColor);
  g.addColorStop(0.45, p.bandColor);
  g.addColorStop(1, p.bandColor);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const brightBg = isBright(p.bandColor);
  const color = brightBg ? p.inkColor : (isBright(p.textColor) ? p.textColor : '#ffffff');
  const hl = brightBg && isBright(p.highlightColor) ? p.inkColor : p.highlightColor;
  const e = easeOut(t / 0.35);
  const scale = 0.92 + 0.08 * e;
  ctx.translate(W / 2, H / 2);
  ctx.scale(scale, scale);
  ctx.translate(-W / 2, -H / 2);
  drawRichText(ctx, p.title, { x: pad, y: H * 0.2, w: W - pad * 2, h: H * 0.6 }, {
    size: p.captionSize * 1.6 * u, weight: p.font, color, hl,
    style: 'plain', shadow: !brightBg, valign: 'center', maxLines: 4, u,
  });
  if (p.channel) {
    ctx.font = uiFont(34 * u, 700);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = rgba(color, 0.8);
    ctx.fillText(p.channel, W / 2, H * 0.8 + 20 * u);
  }
  if (logo) {
    const lh = 90 * u;
    const lw = (logo.naturalWidth / logo.naturalHeight) * lh;
    ctx.drawImage(logo, (W - lw) / 2, H * 0.12, lw, lh);
  }
  ctx.restore();
}

// ── 장식(overlay) ─────────────────────────────────────
// 각 함수는 장면이 그려진 뒤 호출되며, 자막 위치·색을 바꾸고 싶으면 { box, color, hl, style, shadow, align, valign, maxLines, sizeMul } 를 돌려줍니다.
// e = { p, L, W, H, u, pad, seg, scene, index, count, t, local, dur, alpha, tl }

const firstLine = (s, n = 8) => plainText(s).split('\n')[0].trim().slice(0, n);
const firstWord = (s) => plainText(s).trim().split(/\s+/)[0] || '';
const onHl = (p) => (isBright(p.highlightColor) ? p.inkColor : '#ffffff');

function drawCheckMark(ctx, x, y, s, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = s * 0.22;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x - s * 0.4, y);
  ctx.lineTo(x - s * 0.1, y + s * 0.32);
  ctx.lineTo(x + s * 0.45, y - s * 0.35);
  ctx.stroke();
  ctx.restore();
}

/** 훅 장면(배경 윗부분이 강조색)에서 강조색 칩의 윤곽이 사라지지 않게 쓰는 테두리 색 */
const hookChipBorder = (p, scene) => (scene.kind === 'hook' ? (isBright(p.highlightColor) ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.85)') : undefined);

/**
 * 가로 화면(16:9)의 속보 띠 자리 { x, y, w, h } — 템플릿마다 사진·카드를 가리지 않고, 비는 칸이 생기지 않게 둡니다.
 *  split: 오른쪽 글 패널 안 세로 가운데(사진 칸을 덮지 않음). 사진 없는 장면은 화면 폭 전체, 세로 가운데
 *  card: 사진 장면은 카드 옆 자막 칸, 글자 장면(가운데 카드)은 카드 안 세로 가운데
 *  dark: 썸네일 바로 아래(L.cap 기준). 사진 없는 장면은 세로 가운데
 *  full·band·blur: 예전처럼 화면 아래쪽 높이의 24%(0.68H~0.92H) 화면 폭 전체
 */
function newsBandWide(e) {
  const { p, L, W, H, u, pad, scene } = e;
  const tpl = p.template;
  const bandH0 = H * 0.24;
  const middle = (x, w, y0, y1, h = bandH0) => { const hh = Math.min(h, y1 - y0); return { x, y: y0 + (y1 - y0 - hh) / 2, w, h: hh }; };
  if (tpl === 'split' && L.panel) {
    if (!scene.img) return middle(0, W, L.titleH, H - 30 * u, H * 0.3);
    return middle(L.panel.x, L.panel.w, L.panel.y + pad * 0.5, L.panel.y + L.panel.h - 30 * u, Math.min(L.panel.h * 0.62, H * 0.42));
  }
  if (tpl === 'card' && L.card) {
    if (!scene.img && wideCardText(p, L)) {
      const r = L.img; // drawOverlay 가 가운데 카드(imgText)로 바꿔 넘겨 줌
      return middle(r.x, r.w, r.y, r.y + r.h, Math.min(r.h * 0.6, H * 0.34));
    }
    const x = L.cap.x - pad * 0.5;
    return middle(x, W - x, L.card.y, L.card.y + L.card.h, Math.min(L.card.h * 0.72, H * 0.42));
  }
  if (tpl === 'dark' && L.cap) {
    if (!scene.img) return middle(0, W, L.titleH, H - 30 * u, H * 0.3);
    const y = L.cap.y - 16 * u;
    return { x: 0, y, w: W, h: Math.min(bandH0, H - y - 30 * u) };
  }
  return { x: 0, y: H * 0.68, w: W, h: bandH0 };
}

function ovNews(ctx, e) {
  const { p, L, W, u, pad, top, scene } = e;
  const img = L.img;
  const cap = L.cap;
  // 세로·정사각: 자막 칸 자리에 띠(최대 340u), 가로: 템플릿마다 정한 자리(newsBandWide)
  const band = L.wide ? newsBandWide(e) : { x: 0, y: cap.y - 10 * u, w: W, h: Math.min(cap.h + 20 * u, 340 * u) };
  const chipOpt = { size: 34 * u, weight: '900', bg: p.highlightColor, color: onHl(p), h: 58 * u, padX: 22 * u, radius: 8 * u, border: hookChipBorder(p, scene), u };
  // '속보' 칩: 사진 왼쪽 위. 가로 화면의 사진 없는 장면은 빈 화면에 떠 있지 않게 띠 왼쪽 위에 붙입니다
  if (L.wide && !scene.img) chip(ctx, '속보', band.x + pad * 0.6, Math.max(top + pad * 0.5, band.y - 40 * u), chipOpt);
  else chip(ctx, '속보', img.x + pad * 0.5, top + pad * 0.5 + 26 * u, chipOpt);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(band.x, band.y, band.w, band.h);
  ctx.fillStyle = p.highlightColor;
  ctx.fillRect(band.x, band.y, band.w, 8 * u);
  if (p.channel) {
    ctx.font = uiFont(26 * u, 800);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = p.highlightColor;
    ctx.fillText(p.channel, band.x + pad * 0.6, band.y + 38 * u);
  }
  return { box: { x: band.x + pad * 0.6, y: band.y + 62 * u, w: band.w - pad * 1.2, h: band.h - 76 * u }, color: p.inkColor, hl: p.highlightColor, style: 'plain', shadow: false, align: 'left', valign: 'top', maxLines: 3 };
}

function ovWarning(ctx, e) {
  const { p, W, H, u, pad, top } = e;
  const h = 30 * u;
  ctx.fillStyle = tapePattern(ctx, u);
  ctx.fillRect(0, 0, W, h);
  const bottomY = H - h - (p.showProgress ? 9 * u : 0);
  ctx.fillRect(0, bottomY, W, h);
  chip(ctx, '주의', pad, Math.max(h + 44 * u, top + 30 * u), { size: 34 * u, weight: '900', bg: '#111111', color: '#ffd400', h: 58 * u, padX: 22 * u, radius: 8 * u });
}

// STEP 칩·번호 배지는 "항목" 번호(훅·CTA 를 뺀 순번, e.itemIndex)를 씁니다. 훅·CTA 장면에는 그리지 않습니다.
function ovSteps(ctx, e) {
  const { p, L, u, pad, scene, top, itemIndex, itemCount } = e;
  if (itemIndex < 0) return;
  const img = L.img;
  const n = String(itemIndex + 1).padStart(2, '0');
  const total = String(itemCount).padStart(2, '0');
  const y = top + pad * 0.5 + 24 * u;
  const w = chip(ctx, `STEP ${n} / ${total}`, img.x + pad * 0.5, y, { size: 28 * u, weight: '800', bg: p.highlightColor, color: onHl(p), h: 50 * u, padX: 18 * u, radius: 10 * u });
  let x = img.x + pad * 0.5 + w + 22 * u;
  for (let i = 0; i < Math.min(itemCount, 12); i++) {
    ctx.fillStyle = i <= itemIndex ? p.highlightColor : 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.arc(x, y, 7 * u, 0, Math.PI * 2);
    ctx.fill();
    x += 24 * u;
  }
  if (!scene.img) {
    // 글자 장면: 큰 번호를 왼쪽에, 자막은 그 오른쪽에 세로 가운데. 칩·점 줄(위 70u)은 비워 둡니다.
    const base = noImgBox(p, L);
    const box = { x: base.x, y: base.y + 70 * u, w: base.w, h: base.h - 70 * u };
    const bg = p.template === 'split' ? p.panelColor : p.template === 'dark' ? p.bandColor : null; // 그 밖(card·band·blur·full)은 남색 도면 패널
    const color = bg ? onColor(bg, p) : '#ffffff';
    ctx.font = fontCss('900', 190 * u);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = p.highlightColor;
    ctx.fillText(n, box.x, box.y + box.h / 2);
    const shift = ctx.measureText(n).width + 30 * u;
    return { box: { x: box.x + shift, y: box.y, w: box.w - shift, h: box.h }, align: 'left', valign: 'center', sizeMul: 0.9, color, hl: p.highlightColor, shadow: false };
  }
}

function ovNumber(ctx, e) {
  const { p, L, W, u, pad, scene, top, itemIndex } = e;
  if (itemIndex < 0) return;
  const r = 64 * u;
  const cx = scene.img ? L.img.x + pad + r : W / 2;
  const cy = top + pad * 0.6 + r;
  ctx.fillStyle = p.highlightColor;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = fontCss('900', 66 * u);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = onHl(p);
  ctx.fillText(String(itemIndex + 1), cx, cy + 4 * u);
}

/** ✓ 칩 라벨: *강조* 단어가 있으면 그것(항목명), 없으면 첫 줄 앞 10자 */
function checkLabel(caption) {
  const hl = parseRuns(String(caption || '').replace(/\n/g, ' ')).find((r) => r.hl && r.text.trim());
  return hl ? hl.text.trim().slice(0, 12) : firstLine(caption, 10);
}

function ovCheck(ctx, e) {
  const { p, L, u, pad, index, tl, top } = e;
  // 훅(경고문)·CTA 는 항목이 아니므로 쌓지 않습니다
  const prev = tl.segs.filter((s) => s.kind === 'scene' && s.index < index && s.scene.kind !== 'hook' && s.scene.kind !== 'cta').slice(-6);
  // 가로·정사각 card 의 글자 장면은 카드가 낮아 칩이 카드 가운데 글을 덮으므로, 칩을 그 장면의 카드(가로는 가운데 카드) 왼쪽 위에 쌓고 자막을 칩 아래로 내립니다
  const cardText = !L.portrait && p.template === 'card' && !e.scene.img;
  const x0 = (cardText ? cardRects(p, L, e.scene).img.x : L.img.x) + pad * 0.5;
  let y = top + pad * 0.5 + 27 * u;
  let bottom = 0;
  for (const s of prev) {
    const label = checkLabel(s.scene.caption);
    if (!label) continue;
    const size = 30 * u;
    chip(ctx, '      ' + label, x0, y, { size, weight: '700', bg: 'rgba(255,255,255,0.94)', color: p.inkColor, h: 54 * u, padX: 16 * u, radius: 14 * u });
    drawCheckMark(ctx, x0 + 30 * u, y, 26 * u, '#1fcf62');
    bottom = y + 27 * u;
    y += 62 * u;
  }
  if (cardText && bottom) {
    const base = noImgBox(p, L);
    const y1 = Math.max(base.y, bottom + 14 * u);
    return { box: { x: base.x, y: y1, w: base.w, h: Math.max(60 * u, base.y + base.h - y1) } };
  }
}

function ovPin(ctx, e) {
  const { p, L, u, scene } = e;
  const img = L.img;
  let x = img.x + img.w / 2;
  let y = img.y + img.h * 0.42;
  let adj;
  const hookBg = hasHookBg(p, scene);
  if (!L.portrait && (!scene.img || hookBg)) {
    // 가로·정사각의 글자 장면·훅 배경 장면은 글 칸이 낮아 화면 가운데 핀이 큰 글을 덮으므로, 핀을 글 칸 위쪽에 두고 자막은 핀 아래로 내립니다
    // (split 글자 장면은 글이 왼쪽 정렬이라 핀도 왼쪽에)
    const box = hookBg ? L.hook : noImgBox(p, L);
    x = !hookBg && p.template === 'split' ? box.x + 40 * u : box.x + box.w / 2;
    y = box.y + 96 * u;
    const y1 = y + 80 * u;
    adj = { box: { x: box.x, y: y1, w: box.w, h: Math.max(60 * u, box.y + box.h - y1) } };
  }
  ctx.fillStyle = p.highlightColor;
  ctx.beginPath();
  ctx.arc(x, y - 52 * u, 32 * u, Math.PI * 0.85, Math.PI * 2.15);
  ctx.lineTo(x, y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x, y - 52 * u, 13 * u, 0, Math.PI * 2);
  ctx.fill();
  const label = scene.label || firstWord(scene.caption);
  if (label) chip(ctx, label, x, y + 36 * u, { size: 30 * u, weight: '800', bg: '#ffffff', color: p.inkColor, h: 54 * u, padX: 20 * u, align: 'center', radius: 12 * u });
  return adj;
}

function ovPrice(ctx, e) {
  const { p, L, W, u, pad, scene, top } = e;
  if (!scene.tag) return;
  const img = L.img;
  const common = { weight: '900', bg: p.highlightColor, color: onHl(p), border: hookChipBorder(p, scene), u };
  if (hasHookBg(p, scene)) {
    // 매물형 훅: 가격이 먼저 보이게 화면 위 가운데에 크게
    chip(ctx, String(scene.tag), W / 2, L.hook.y + 120 * u, { ...common, size: 72 * u, h: 120 * u, padX: 40 * u, align: 'center', radius: 24 * u });
    return;
  }
  chip(ctx, String(scene.tag), img.x + img.w - pad * 0.5, top + pad * 0.5 + 40 * u, { ...common, size: 52 * u, h: 86 * u, padX: 28 * u, align: 'right', radius: 16 * u });
}

function ovQuote(ctx, e) {
  const { p, L, u, scene } = e;
  const tpl = p.template;
  const overPhoto = tpl === 'full' || tpl === 'blur';
  // 글이 세로 가운데에 오는 장면(훅 배경·사진 없는 장면)은 따옴표를 글 블록 바로 위에, 서명을 바로 아래에 둡니다
  const centered = hasHookBg(p, scene) || !scene.img;
  const cap = hasHookBg(p, scene) ? L.hook : (!scene.img ? noImgBox(p, L) : L.cap);
  // 가로·정사각의 낮은 자막 칸(360u 미만)은 위 44u·아래 56u 를 빼면 글이 반쯤으로 줄어들어, 위 12u·아래 40u 만 뺍니다
  const lowCap = !L.portrait && cap.h < 360 * u;
  const box = centered
    ? { x: cap.x, y: Math.max(cap.y + 44 * u, cap.y + cap.h / 2 - 240 * u), w: cap.w, h: Math.min(460 * u, cap.h - 120 * u) }
    : lowCap ? { x: cap.x, y: cap.y + 12 * u, w: cap.w, h: cap.h - 52 * u } : { x: cap.x, y: cap.y + 44 * u, w: cap.w, h: cap.h - 100 * u };
  let qy = centered ? Math.max(cap.y - 36 * u, box.y - 150 * u) : cap.y - 36 * u;
  // 가로 화면: 가운데 정렬 자막은 칸이 1700u 쯤으로 넓어 따옴표(칸 왼쪽 끝)가 글에서 수백 px 떨어져 떠 보입니다.
  // 글 상자를 화면 가운데 1300u 폭으로 좁히고 왼쪽 정렬해 따옴표를 글 바로 앞에 둡니다(split·card 사진 장면은 원래 왼쪽 정렬이라 그대로).
  // 사진 없는 장면·훅 배경은 상자 높이를 글 높이 가까이(340u) 줄이고 세로 가운데로 — 따옴표·글·서명이 한 묶음으로 화면 가운데에. 9:16·1:1 은 그대로.
  const leftAligned = tpl === 'split' || (tpl === 'card' && scene.img);
  const wideQuote = L.wide && !leftAligned;
  if (wideQuote) {
    const bw = Math.min(cap.w, 1300 * u);
    box.x = cap.x + (cap.w - bw) / 2;
    box.w = bw;
    if (centered) {
      box.h = Math.max(160 * u, Math.min(340 * u, cap.h - 160 * u));
      box.y = cap.y + (cap.h - box.h) / 2;
      qy = Math.max(cap.y - 36 * u, box.y - 130 * u);
    }
  }
  ctx.save();
  ctx.font = fontCss('900', 150 * u);
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillStyle = p.highlightColor;
  ctx.globalAlpha *= 0.9;
  // 가로의 낮은 자막 칸(사진 장면)은 따옴표가 첫 글자에 겹치지 않게 글 앞(왼쪽)에 매달고, 가운데 장면은 글 묶음 바로 위에
  const qx = wideQuote ? box.x - (centered ? 8 : 72) * u : cap.x - 8 * u;
  ctx.fillText('“', qx, qy);
  ctx.restore();
  if (p.channel) {
    ctx.font = uiFont(30 * u, 700);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    const bg = tpl === 'split' ? p.panelColor : p.bandColor;
    const ink = overPhoto || (!scene.img && tpl !== 'dark' && tpl !== 'split') ? '#ffffff' : onColor(bg, p); // 사진 없는 band/card 는 남색 도면 패널 위
    ctx.fillStyle = rgba(ink, 0.75);
    ctx.fillText(`— ${p.channel}`, wideQuote ? box.x + box.w : cap.x + cap.w, centered ? box.y + box.h + 30 * u : cap.y + cap.h - 16 * u);
  }
  if (wideQuote) return centered ? { box, valign: 'center', align: 'left' } : { box, align: 'left' };
  return centered ? { box, valign: 'top' } : { box };
}

function ovQuiz(ctx, e) {
  const { p, L, u, pad, scene, index, local, dur, top } = e;
  const img = L.img;
  if (scene.kind === 'answer') {
    chip(ctx, 'A.', img.x + pad * 0.5, top + pad * 0.5 + 34 * u, { size: 44 * u, weight: '900', bg: '#1fcf62', color: '#ffffff', h: 70 * u, padX: 22 * u, radius: 14 * u });
    return;
  }
  if (scene.kind === 'hook' || index === 0) {
    chip(ctx, 'Q.', img.x + pad * 0.5, top + pad * 0.5 + 34 * u, { size: 44 * u, weight: '900', bg: p.highlightColor, color: onHl(p), h: 70 * u, padX: 22 * u, radius: 14 * u, border: hookChipBorder(p, scene), u });
    const remain = dur - local;
    if (remain <= 1 && remain > 0) {
      const n = clamp(Math.ceil(remain * 3), 1, 3);
      const frac = (remain * 3) - (n - 1);
      const cx = img.x + img.w / 2;
      const cy = hasHookBg(p, scene) ? L.hook.y + L.hook.h - 120 * u : img.y + img.h / 2;
      const r = 80 * u;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = p.highlightColor;
      ctx.lineWidth = 10 * u;
      ctx.beginPath(); ctx.arc(cx, cy, r - 5 * u, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(frac, 0, 1)); ctx.stroke();
      ctx.font = fontCss('900', 84 * u);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(String(n), cx, cy + 6 * u);
    }
  }
}

function ovTicker(ctx, e) {
  const { p, L, W, H, u, pad, t, top } = e;
  const h = 64 * u;
  const y = H - h - (p.showProgress ? 9 * u : 0);
  ctx.fillStyle = p.highlightColor;
  ctx.fillRect(0, y, W, h);
  const text = plainText(p.title).replace(/\s*\n\s*/g, ' ').trim() || p.channel || '';
  if (text) {
    const size = 30 * u;
    ctx.font = fontCss('800', size);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = onHl(p);
    const unit = `${text}   ·   `;
    const unitW = cached(`tickw:${unit}:${size.toFixed(1)}`, () => ctx.measureText(unit).width);
    const off = (t * 150 * u) % unitW;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, y, W, h); ctx.clip();
    for (let x = -off; x < W; x += unitW) ctx.fillText(unit, x, y + h / 2 + 2 * u);
    ctx.restore();
  }
  if (p.dateLabel) chip(ctx, String(p.dateLabel), W - pad * 0.5, top + pad * 0.5 + 26 * u, { size: 28 * u, weight: '700', bg: 'rgba(0,0,0,0.62)', color: '#ffffff', h: 50 * u, padX: 18 * u, align: 'right', radius: 10 * u });
  // 사진 없는 장면·훅 배경 장면(full/blur 훅)의 자막은 자막 칸이 아니라 화면 가운데(L.hook)라 티커와 겹치지 않음 — 상자를 내리면 훅 말풍선이 맨 아래로 떨어짐
  if (!e.scene.img || hasHookBg(e.p, e.scene)) return;
  const cap = L.cap;
  if (cap.y + cap.h > y - 10 * u) return { box: { x: cap.x, y: cap.y, w: cap.w, h: Math.max(60 * u, y - 16 * u - cap.y) } };
}

function ovDate(ctx, e) {
  const { p, L, u, pad, scene, top } = e;
  if (!scene.tag) return;
  const img = L.img;
  ctx.save();
  ctx.font = fontCss('900', 110 * u);
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 14 * u;
  ctx.strokeText(String(scene.tag), img.x + pad * 0.5, top + pad * 0.4);
  ctx.fillStyle = p.highlightColor;
  ctx.fillText(String(scene.tag), img.x + pad * 0.5, top + pad * 0.4);
  ctx.restore();
}

function ovComment(ctx, e) {
  const { p, L, W, H, u, pad, scene } = e;
  // 훅 = 시청자 질문(회색 아바타, 닉네임 '시청자' 또는 scene.label), 나머지 = MR.K 답변(강조색 아바타 + 강조색 테두리)
  const question = scene.kind === 'hook';
  const hookBg = hasHookBg(p, scene);
  const cap = L.cap;
  let b = hookBg
    ? { x: pad * 0.7, y: L.hook.y + L.hook.h / 2 - H * 0.15, w: W - pad * 1.4, h: H * 0.3 } // 질문 말풍선은 화면 가운데 크게
    : { x: pad * 0.7, y: cap.y, w: W - pad * 1.4, h: cap.h };
  if (L.wide) {
    // 가로 화면: 화면 폭 전체 말풍선은 글이 한쪽에 몰려 비어 보이므로 폭을 1300u 로 줄여 가운데에(훅 질문은 조금 더 높게)
    // split·card 처럼 자막 칸이 오른쪽 좁은 칸이면 그 칸에 맞춥니다
    const bw = Math.min(W - pad * 1.4, 1300 * u);
    if (hookBg) b = { x: (W - bw) / 2, y: L.hook.y + L.hook.h / 2 - H * 0.18, w: bw, h: H * 0.36 };
    else if (cap.w > W * 0.7) b = { x: (W - bw) / 2, y: cap.y, w: bw, h: cap.h };
    else b = { x: cap.x - pad * 0.3, y: cap.y, w: cap.w + pad * 0.6, h: cap.h };
  }
  ctx.fillStyle = 'rgba(255,255,255,0.96)';
  roundRectPath(ctx, b.x, b.y, b.w, b.h, 26 * u);
  ctx.fill();
  if (!question) { ctx.strokeStyle = rgba(p.highlightColor, 0.5); ctx.lineWidth = 4 * u; ctx.stroke(); }
  const nick = scene.label || (question ? '시청자' : p.channel || '');
  const r = 32 * u;
  const ax = b.x + 30 * u + r;
  const ay = b.y + 30 * u + r;
  ctx.fillStyle = question ? '#8b949e' : p.highlightColor;
  ctx.beginPath(); ctx.arc(ax, ay, r, 0, Math.PI * 2); ctx.fill();
  const ch = (nick || 'K').trim().charAt(0).toUpperCase();
  ctx.font = fontCss('900', 34 * u);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = question ? '#ffffff' : onHl(p);
  ctx.fillText(ch, ax, ay + 2 * u);
  ctx.font = uiFont(30 * u, 800);
  ctx.textAlign = 'left';
  ctx.fillStyle = p.inkColor;
  ctx.fillText(nick, ax + r + 18 * u, ay - 2 * u);
  const nw = ctx.measureText(nick).width;
  ctx.font = uiFont(24 * u, 600);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillText(question ? '· 댓글' : '· 방금', ax + r + 18 * u + nw + 12 * u, ay);
  const top = ay + r + 22 * u;
  return {
    box: { x: b.x + 30 * u, y: top, w: b.w - 60 * u, h: b.h - (top - b.y) - 24 * u },
    color: p.inkColor, hl: p.highlightColor, style: 'plain', shadow: false, align: 'left', valign: hookBg ? 'center' : 'top', maxLines: 4, sizeMul: hookBg ? 0.8 : 1,
  };
}

function ovVs(ctx, e) {
  const { p, L, u, scene } = e;
  if (!(scene.img && scene.img2)) return;
  const img = L.img;
  const cx = img.x + img.w / 2;
  const cy = img.y + img.h / 2;
  const r = 60 * u;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = p.highlightColor;
  ctx.lineWidth = 8 * u;
  ctx.beginPath(); ctx.arc(cx, cy, r - 4 * u, 0, Math.PI * 2); ctx.stroke();
  ctx.font = fontCss('900', 44 * u);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = p.inkColor;
  ctx.fillText(scene.vsLabel || 'VS', cx, cy + 3 * u);
}

function ovCounter(ctx, e) {
  const { p, L, u, scene, local, dur } = e;
  const c = scene.counter;
  if (!c || typeof c !== 'object') return;
  const from = Number(c.from) || 0;
  const to = Number(c.to) || 0;
  const k = easeOut(local / Math.max(0.3, dur * 0.8));
  const v = Math.round(from + (to - from) * k);
  // 만원 단위가 1억을 넘으면 '2.6억'처럼 억 단위로(자막의 단위와 맞게)
  const text = c.suffix === '만원' && Math.abs(v) >= 10000
    ? `${(v / 10000).toFixed(1).replace(/\.0$/, '')}억`
    : `${v.toLocaleString('ko-KR')}${c.suffix || ''}`;
  const hookBg = hasHookBg(p, scene);
  const darkImg = scene.img && p.template === 'dark';
  // dark 사진 장면: 숫자는 썸네일을 가리지 않게 썸네일 아래·자막 위 띠(220u)에
  // 가로 split 글자 장면: 사진 칸(왼쪽 반)에 숫자만 있고 자막이 오른쪽 위에 떨어져 보였으므로, 글 칸 위 55% 에 숫자·아래에 자막(가운데)
  // 가로·정사각 dark 글자 장면도 썸네일 자리(위쪽) 숫자와 화면 가운데 큰 자막이 맞닿으므로, 글 칸 위 45% 에 숫자·아래에 자막
  const wideSplitText = L.wide && !scene.img && p.template === 'split' && !hookBg;
  const darkText = !L.portrait && !scene.img && p.template === 'dark' && !hookBg;
  const box = hookBg ? L.hook : (darkImg ? { x: L.cap.x, y: L.cap.y, w: L.cap.w, h: 220 * u }
    : wideSplitText ? { x: L.noImg.x, y: L.noImg.y, w: L.noImg.w, h: L.noImg.h * 0.55 }
    : darkText ? { x: L.capNoImg.x, y: L.capNoImg.y, w: L.capNoImg.w, h: L.capNoImg.h * 0.45 } : L.img);
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  ctx.save();
  ctx.font = fontCss('900', 170 * u);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  let size = 170 * u;
  while (ctx.measureText(text).width > box.w - 40 * u && size > 50 * u) { size *= 0.9; ctx.font = fontCss('900', size); }
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = size * 0.1;
  ctx.strokeText(text, cx, cy);
  ctx.fillStyle = p.highlightColor;
  ctx.fillText(text, cx, cy);
  ctx.restore();
  if (hookBg) return { box: { x: L.hook.x, y: cy + size * 0.6, w: L.hook.w, h: L.hook.h - (cy + size * 0.6 - L.hook.y) }, sizeMul: 0.6, valign: 'top' };
  if (darkImg) return { box: { x: L.cap.x, y: L.cap.y + 220 * u, w: L.cap.w, h: L.cap.h - 220 * u }, sizeMul: 0.85, valign: 'top' };
  if (wideSplitText) return { box: { x: L.noImg.x, y: box.y + box.h, w: L.noImg.w, h: L.noImg.h - box.h }, sizeMul: 0.8, valign: 'top', align: 'center' };
  if (darkText) return { box: { x: L.capNoImg.x, y: box.y + box.h, w: L.capNoImg.w, h: L.capNoImg.h - box.h }, sizeMul: 0.85, valign: 'top' };
  // 사진 없는 장면: 숫자가 사진 자리(도면 패널·카드)에 있으므로 자막은 그 아래 자막 칸에
  if (!scene.img && p.template !== 'dark') {
    const onBand = p.template === 'card';
    return { box: { x: L.cap.x, y: L.cap.y, w: L.cap.w, h: L.cap.h }, sizeMul: 0.8, valign: 'top', ...(onBand ? { color: onColor(p.bandColor, p), hl: p.highlightColor, shadow: false, align: 'center' } : {}) };
  }
  return { sizeMul: 0.85 };
}

function ovDots(ctx, e) {
  const { p, L, W, H, u, index, count } = e;
  const y = H - 40 * u - (p.showProgress ? 9 * u : 0);
  const n = Math.min(count, 14);
  const gap = 34 * u;
  const label = `${index + 1} / ${count}`;
  ctx.font = uiFont(28 * u, 800);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const lw = ctx.measureText(label).width;
  const total = n * gap + 24 * u + lw;
  // 가로 split 은 아래 가운데가 사진·패널 경계라 점이 사진 위에 묻히므로, 오른쪽 패널 가운데에 둡니다
  let x = L.wide && L.panel ? L.panel.x + (L.panel.w - total) / 2 + 9 * u : (W - total) / 2 + 9 * u;
  const bg = p.template === 'split' ? p.panelColor : p.bandColor;
  const overPhoto = p.template === 'full';
  const dim = overPhoto ? 'rgba(255,255,255,0.4)' : rgba(onColor(bg, p), 0.3);
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = i <= index ? p.highlightColor : dim;
    ctx.beginPath();
    ctx.arc(x, y, i === index ? 10 * u : 7 * u, 0, Math.PI * 2);
    ctx.fill();
    x += gap;
  }
  ctx.fillStyle = overPhoto ? '#ffffff' : onColor(bg, p);
  ctx.fillText(label, x + 6 * u, y);
  // 사진 없는 장면·훅 배경 장면(full/blur 훅)의 자막은 패널·카드·화면 가운데(L.hook 은 아래 150u 를 비워 둠)라 점과 겹치지 않음
  if (!e.scene.img || hasHookBg(e.p, e.scene)) return;
  const cap = L.cap;
  if (cap.y + cap.h > y - 24 * u) return { box: { x: cap.x, y: cap.y, w: cap.w, h: Math.max(60 * u, y - 30 * u - cap.y) } };
}

export const OVERLAYS = {
  none: null, news: ovNews, warning: ovWarning, steps: ovSteps, number: ovNumber, check: ovCheck, pin: ovPin,
  price: ovPrice, quote: ovQuote, quiz: ovQuiz, ticker: ovTicker, date: ovDate, comment: ovComment, vs: ovVs,
  counter: ovCounter, dots: ovDots,
};
// 장면이 바뀌어도 항상 보이는 장식(전환 중 흐려지지 않음)
const PERSISTENT_OVERLAYS = new Set(['warning', 'steps', 'ticker', 'dots', 'news', 'check']);

/** hidden=true 면 그리지 않고(알파 0) 자막 상자·색 조정값만 받아 옵니다(전환 중 사라지는 앞 장면 자막용) */
function drawOverlay(ctx, p, L, W, H, seg, t, tl, alpha, hidden = false) {
  const fn = OVERLAYS[p.overlay];
  if (!fn || seg.kind !== 'scene') return undefined;
  const count = tl.segs.reduce((n, s) => n + (s.kind === 'scene' ? 1 : 0), 0);
  // 항목 번호: 훅·CTA 를 뺀 순번(STEP 칩·번호 배지가 '1단계'와 어긋나지 않게). 훅·CTA 면 -1
  const items = tl.segs.filter((s) => s.kind === 'scene' && s.scene.kind !== 'hook' && s.scene.kind !== 'cta');
  // 가로 card 의 사진 없는 장면은 카드가 가운데로 옮겨지므로(cardRects) 장식도 가운데 카드 기준으로 놓습니다
  if (!seg.scene.img && wideCardText(p, L)) L = { ...L, card: L.cardText, img: L.imgText };
  else if (p.template === 'card' && squareCardHook(L, seg.scene)) L = { ...L, card: L.cardHook, img: L.imgHook, cap: L.capHook };
  const e = {
    p, L, W, H, u: L.u, pad: L.pad, seg, scene: seg.scene, index: seg.index, count, t, tl,
    itemIndex: items.findIndex((s) => s.index === seg.index), itemCount: items.length,
    local: t - seg.start, dur: seg.end - seg.start, alpha,
    top: Math.max(L.img.y, L.titleH), // 배지가 채널 이름·제목과 겹치지 않는 위쪽 기준선
  };
  ctx.save();
  if (hidden) ctx.globalAlpha = 0;
  else if (!PERSISTENT_OVERLAYS.has(p.overlay)) ctx.globalAlpha *= alpha;
  let adj;
  try { adj = fn(ctx, e); } finally { ctx.restore(); }
  return adj;
}

/** t초 시점의 화면 한 장을 그립니다. */
export function drawFrame(ctx, p0, W, H, t, tl = buildTimeline(p0), logo = p0.logo) {
  const p = withDefaults(p0);
  const L = layout(p, W, H);
  ctx.save();
  ctx.fillStyle = p.bandColor;
  ctx.fillRect(0, 0, W, H);

  if (!tl.segs.length) {
    drawRichText(ctx, '사진을 넣거나\n대본을 적어\n*장면*을 만드세요', { x: L.pad, y: 0, w: W - L.pad * 2, h: H }, {
      size: 70 * L.u, weight: p.font, color: onColor(p.bandColor, p), hl: p.highlightColor, style: 'plain', valign: 'center', u: L.u,
    });
    ctx.restore();
    return;
  }

  t = clamp(t, 0, Math.max(0, tl.total - 1e-3));
  const i = segmentAt(tl, t);
  const seg = tl.segs[i];
  const prev = i > 0 ? tl.segs[i - 1] : null;
  const trMax = p.transition === 'wipe' ? 0.55 : 0.5;
  const trDur = p.transition === 'none' || !prev ? 0 : Math.min(trMax, (seg.end - seg.start) * 0.4, (prev.end - prev.start) * 0.4);
  const inTr = trDur > 0 && t - seg.start < trDur;
  const raw = inTr ? (t - seg.start) / trDur : 1;
  const k = inTr ? easeInOut(raw) : 1;

  drawStaticBackground(ctx, p, L, W, H);

  // 자막은 겹치면 읽기 어려워서, 앞 자막이 먼저 사라진 뒤(전환 후반부) 새 자막이 나타납니다. 엔딩 문구도 같은 규칙.
  const capAlpha = inTr ? clamp(k * 2 - 1, 0, 1) : 1;
  const draw = (s, fx) => {
    if (s.kind === 'ending') {
      ctx.save();
      ctx.globalAlpha = fx.alpha;
      ctx.translate(fx.dx, 0);
      drawEnding(ctx, p, L, W, H, logo, inTr && p.transition !== 'slide' ? capAlpha : 1);
      ctx.restore();
    } else {
      drawSceneVisual(ctx, p, L, W, H, s, t, fx);
    }
  };

  if (inTr) {
    if (p.transition === 'slide') {
      draw(prev, { alpha: 1, dx: -k * W, zoom: 1 });
      draw(seg, { alpha: 1, dx: (1 - k) * W, zoom: 1 });
    } else if (p.transition === 'zoom') {
      draw(prev, { alpha: 1, dx: 0, zoom: 1 });
      draw(seg, { alpha: k, dx: 0, zoom: 1 + 0.18 * (1 - k) });
    } else if (p.transition === 'wipe') {
      // 사선 띠가 왼쪽 위→오른쪽 아래로 쓸고 지나가며 그 뒤로 새 장면
      draw(prev, { alpha: 1, dx: 0, zoom: 1 });
      const bw = 260 * L.u;
      const span = W + H;
      const c = -bw + easeOut(raw) * (span + bw * 2);
      const edge = c + bw * 0.5;
      if (edge > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(edge, 0); ctx.lineTo(0, edge); ctx.closePath();
        ctx.clip();
        // 띠가 지나간 영역은 앞 장면이 남지 않게 바탕(밴드색·패널·도트)부터 다시 칠합니다
        ctx.fillStyle = p.bandColor;
        ctx.fillRect(0, 0, W, H);
        drawStaticBackground(ctx, p, L, W, H);
        draw(seg, { alpha: 1, dx: 0, zoom: 1 });
        ctx.restore();
      }
      ctx.fillStyle = p.highlightColor;
      ctx.beginPath();
      ctx.moveTo(c, 0); ctx.lineTo(c + bw, 0); ctx.lineTo(0, c + bw); ctx.lineTo(0, c); ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.moveTo(c + bw, 0); ctx.lineTo(c + bw + 14 * L.u, 0); ctx.lineTo(0, c + bw + 14 * L.u); ctx.lineTo(0, c + bw); ctx.closePath();
      ctx.fill();
    } else {
      draw(prev, { alpha: 1, dx: 0, zoom: 1 });
      draw(seg, { alpha: k, dx: 0, zoom: 1 });
    }
  } else {
    draw(seg, { alpha: 1, dx: 0, zoom: 1 });
  }

  // 제목·채널: 엔딩으로 넘어갈 때만 함께 사라집니다. 훅 배경(full/blur 훅) 위에는 채널만.
  const chromeAlpha = seg.kind === 'ending' ? (inTr && prev?.kind === 'scene' ? 1 - k : 0) : 1;
  if (chromeAlpha > 0) {
    if (seg.kind === 'scene' && hasHookBg(p, seg.scene)) drawChrome(ctx, { ...p, titleMode: 'none' }, L, W, H, logo, chromeAlpha);
    else drawChrome(ctx, p, L, W, H, logo, chromeAlpha);
  }

  // 장식 → 자막. 사라지는 앞 장면 자막도 그 장면의 장식(말풍선·숫자 등)과 함께 흐려지고, 상자·색 조정을 그대로 받아 자리가 튀지 않게 합니다.
  // 항상 보이는 장식(STEP 칩·티커 등)은 앞 장면 것을 그리지 않고 조정값만 받습니다(같은 자리에 두 번 찍히지 않게).
  if (inTr && prev.kind === 'scene' && k < 0.5) {
    const prevAlpha = clamp(1 - k * 2, 0, 1);
    const adjPrev = drawOverlay(ctx, p, L, W, H, prev, t, tl, prevAlpha, PERSISTENT_OVERLAYS.has(p.overlay));
    drawCaption(ctx, p, L, prev, prevAlpha, t, adjPrev);
  }
  const adj = drawOverlay(ctx, p, L, W, H, seg, t, tl, capAlpha);
  drawCaption(ctx, p, L, seg, capAlpha, t, adj);

  if (p.showProgress) {
    const bh = 9 * L.u;
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(0, H - bh, W, bh);
    ctx.fillStyle = p.highlightColor;
    ctx.fillRect(0, H - bh, (W * t) / tl.total, bh);
  }

  if (p.titleMode === 'hook') drawHookTitle(ctx, p, L, W, H, t, logo);
  ctx.restore();
}

/** 화면에 들어가는 글꼴을 미리 받아 둡니다(받기 전에 그리면 기본 글꼴로 나옵니다). */
export async function ensureFonts(p) {
  if (!document.fonts?.load) return;
  const text = plainText([p.title, p.channel, p.ending?.text, p.ending?.sub, ...(p.scenes || []).map((s) => s.caption)].join(' ')) || '가나다';
  const jobs = ['700', '800', '900'].map((w) => document.fonts.load(`${w} 48px "Pretendard Variable"`, text));
  await Promise.all(jobs.map((j) => j.catch(() => null)));
  textLayoutCache.clear();
}

/** 자막 파일(SRT) */
export function buildSrt(p, srtTime) {
  const tl = buildTimeline(p);
  return tl.segs
    .filter((s) => s.kind === 'scene' && plainText(s.scene.caption).trim())
    .map((s, n) => `${n + 1}\n${srtTime(s.start)} --> ${srtTime(s.end)}\n${plainText(s.scene.caption).trim()}\n`)
    .join('\n');
}
