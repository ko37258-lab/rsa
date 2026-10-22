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

/** 템플릿별 영역 나누기. 돌려주는 값: u, pad, img, title, cap, textBox (+ panel, card, thumb, hook) */
export function layout(p, W, H) {
  const u = Math.min(W, H) / 1080;
  const pad = 56 * u;
  const portrait = H > W;
  const tm = p.titleMode || 'band';
  const titleH = tm === 'band' ? (portrait ? 0.215 : 0.2) * H : (portrait ? 0.09 : 0.13) * H;
  const title = { x: pad, y: pad * 1.25, w: W - pad * 2, h: Math.max(10 * u, titleH - pad * 1.5) };
  const hook = { x: pad, y: titleH, w: W - pad * 2, h: H - titleH - 150 * u };
  const tpl = p.template || 'band';
  const base = { u, pad, portrait, titleH, hook };

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
    return { ...base, img, card, title, cap, textBox: { x: img.x + pad * 0.5, y: img.y + pad * 0.5, w: img.w - pad, h: img.h - pad } };
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
  // band · blur (기존)
  const imgH = Math.min(W, H * 0.56);
  const img = { x: 0, y: titleH, w: W, h: imgH };
  const capY = img.y + img.h + 24 * u;
  return {
    ...base, img, title,
    cap: { x: pad, y: capY, w: W - pad * 2, h: H - capY - 50 * u },
    textBox: { x: pad, y: img.y + pad * 0.5, w: W - pad * 2, h: img.h - pad },
  };
}

const easeInOut = (x) => 0.5 - Math.cos(Math.PI * clamp(x, 0, 1)) / 2;
const easeOut = (x) => { x = clamp(x, 0, 1); return 1 - (1 - x) * (1 - x) * (1 - x); };

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
 */
function wrapRich(ctx, text, maxW) {
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
    for (const run of parseRuns(paras[pi])) {
      for (const tok of run.text.split(/(\s+)/)) {
        if (!tok) continue;
        const ws = /^\s+$/.test(tok);
        const start = ci;
        ci += tok.length;
        if (!ws) wi++;
        if (!line.length && ws) continue;
        const w = ctx.measureText(tok).width;
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
function layoutText(ctx, text, box, o) {
  const weight = o.weight ?? o.family;
  const lhMul = o.lineHeight || (o.style === 'pill' ? 1.42 : 1.28);
  const maxLines = o.maxLines || 99;
  const key = `${text}\u0001${o.size.toFixed(1)}\u0001${weight}\u0001${Math.round(box.w)}\u0001${Math.round(box.h)}\u0001${maxLines}\u0001${lhMul}`;
  let v = textLayoutCache.get(key);
  if (v) return v;
  let size = o.size;
  const minSize = o.size * 0.5;
  let wrapped;
  for (;;) {
    ctx.font = fontCss(weight, size);
    wrapped = wrapRich(ctx, text, box.w);
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

/** 자막 애니메이션별 조각 상태 함수. anim = { mode, t(장면 시작 후 초), dur(장면 길이) } */
function makeState(anim, TL, size) {
  if (!anim) return null;
  const { mode } = anim;
  const t = Math.max(0, anim.t);
  const dur = Math.max(0.5, anim.dur || 3);
  const N = Math.max(1, TL.words);
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

/**
 * 상자 안에 강조 글씨를 그립니다. 넘치면 글자를 줄여 맞춥니다.
 * o = { size, weight(또는 family), color, hl, style: outline|box|plain|pill, valign: top|center|bottom, align: center|left,
 *       maxLines, alpha, u, shadow, strokeColor, boxColor, pillColor, anim: {mode, t, dur}, lineHeight }
 */
export function drawRichText(ctx, text, box, o) {
  if (!plainText(text).trim()) return;
  let anim = o.anim && o.anim.mode && o.anim.mode !== 'none' ? o.anim : null;
  const u = o.u || 1;
  let popScale = 1;
  if (anim?.mode === 'pop') {
    const g = popGroup(text, anim);
    if (!g) return;
    text = g.text;
    popScale = g.scale;
    o = { ...o, size: o.size * 1.25, valign: 'center', maxLines: 3 };
    anim = null;
  }
  const TL = layoutText(ctx, text, box, o);
  const { size, lh, lines } = TL;
  const blockH = lines.length * lh;
  let y0 = box.y;
  if (o.valign === 'center') y0 = box.y + (box.h - blockH) / 2;
  else if (o.valign === 'bottom') y0 = box.y + box.h - blockH;
  const left = o.align === 'left';
  const lineX = (ln) => (left ? box.x : box.x + (box.w - ln.w) / 2);
  const state = makeState(anim, TL, size);

  ctx.save();
  const baseAlpha = ctx.globalAlpha * (o.alpha ?? 1);
  ctx.globalAlpha = baseAlpha;
  if (popScale !== 1) {
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    ctx.translate(cx, cy);
    ctx.scale(popScale, popScale);
    ctx.translate(-cx, -cy);
  }
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.lineJoin = 'round';
  ctx.font = fontCss(TL.weight, size);

  // 줄 배경(검은 띠·알약)
  if (o.style === 'box' || o.style === 'pill') {
    const pill = o.style === 'pill';
    ctx.fillStyle = pill ? (o.pillColor || o.hl) : (o.boxColor || 'rgba(0,0,0,0.72)');
    lines.forEach((ln, i) => {
      if (!ln.runs.length) return;
      let a = 1;
      if (state) { a = 0; for (const r of ln.runs) a = Math.max(a, state(r).alpha); if (a <= 0) return; }
      ctx.globalAlpha = baseAlpha * a;
      const x = lineX(ln);
      const py = size * (pill ? 0.16 : 0.2);
      const px = size * (pill ? 0.42 : 0.32);
      roundRectPath(ctx, x - px, y0 + i * lh + (lh - size) / 2 - py, ln.w + px * 2, size + py * 2, pill ? size : 10 * u);
      ctx.fill();
    });
    ctx.globalAlpha = baseAlpha;
  }

  // 밝은 글자엔 검은 테두리, 어두운 글자엔 흰 테두리
  const strokeColor = o.strokeColor || (isBright(o.color) ? 'rgba(0,0,0,0.92)' : 'rgba(255,255,255,0.9)');
  const doStroke = o.style === 'outline';
  // 흐림 그림자(shadowBlur)는 비싸서, 살짝 어긋난 어두운 글씨로 대신합니다(1080p 30fps 를 지키기 위함).
  const fakeShadow = o.style === 'plain' && o.shadow !== false && isBright(o.color);

  const drawPiece = (r, st, x, y, pass) => {
    const txt = st.cut != null ? r.text.slice(0, st.cut) : r.text;
    if (!txt) return;
    let color = r.hl ? o.hl : o.color;
    if (st.kind === 'cur') color = o.hl;
    if (st.kind === 'dim') color = o.color; // 아직 안 읽은 강조 단어는 본문색으로 흐리게 깔고, 읽는 순간부터 강조색
    const yy = y + st.dy;
    if (st.kind === 'cur') {
      ctx.save();
      const cx = x + r.w / 2;
      ctx.translate(cx, yy);
      ctx.scale(1.06, 1.06);
      ctx.translate(-cx, -yy);
      if (pass === 0) { if (doStroke) ctx.strokeText(txt, x, yy); }
      else {
        ctx.fillStyle = color;
        ctx.fillText(txt, x, yy);
        ctx.fillRect(x, yy + size * 0.5, r.w, Math.max(2, size * 0.08));
      }
      ctx.restore();
      return;
    }
    if (pass === 0) {
      if (doStroke) ctx.strokeText(txt, x, yy);
      else if (fakeShadow) {
        ctx.fillStyle = 'rgba(0,0,0,0.38)';
        ctx.fillText(txt, x + size * 0.035, yy + size * 0.05);
      }
    } else {
      ctx.fillStyle = color;
      ctx.fillText(txt, x, yy);
    }
  };

  // 1차: 테두리/그림자, 2차: 글자 (테두리가 옆 글자를 덮지 않게 두 번에 나눠 그립니다)
  for (let pass = 0; pass < 2; pass++) {
    if (pass === 0) {
      if (!doStroke && !fakeShadow) continue;
      if (doStroke) {
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = Math.max(2, size * 0.17);
      }
    }
    lines.forEach((ln, i) => {
      let x = lineX(ln);
      const y = y0 + i * lh + lh / 2;
      for (const r of ln.runs) {
        const st = state ? state(r) : VIS;
        if (st.alpha > 0 && !r.ws) {
          if (st.alpha !== 1) ctx.globalAlpha = baseAlpha * st.alpha;
          drawPiece(r, st, x, y, pass);
          if (st.alpha !== 1) ctx.globalAlpha = baseAlpha;
        }
        x += r.w;
      }
    });
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
  let y = H * 0.32;
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
  drawRichText(ctx, p.ending?.text, { x: L.pad, y, w: W - L.pad * 2, h: H * 0.24 }, {
    size: p.captionSize * 1.15 * u, weight: p.font, color, hl: p.highlightColor,
    style: 'plain', valign: 'center', maxLines: 3, u,
  });
  ctx.font = uiFont(36 * u);
  ctx.fillStyle = rgba(color, 0.72);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(plainText(p.ending?.sub), W / 2, y + H * 0.24 + 40 * u);
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
  if (p.template === 'split' && L.panel) {
    const bottom = L.panel.y + L.panel.h;
    return { x: pad, y: L.img.y + pad * 0.5, w: L.img.w - pad * 2, h: bottom - L.img.y - pad - 30 * u };
  }
  return L.textBox;
}

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
    const card = L.card;
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
    const r = L.img;
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
    ctx.fillStyle = p.panelColor;
    ctx.fillRect(rect.x, rect.y, rect.w, L.panel.y + L.panel.h - rect.y);
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
    ctx.fillRect(rect.x + inset + 6 * u, rect.y + inset + 10 * u, rect.w - inset * 2, rect.h - inset * 2);
    drawImageFit(ctx, scene.img, rect.x + inset, rect.y + inset, rect.w - inset * 2, rect.h - inset * 2, 'contain', 1 + (zoom - 1) * 0.35, 0, 0);
  } else {
    drawImageFit(ctx, scene.img, rect.x, rect.y, rect.w, rect.h, 'cover', zoom, m.ox, m.oy);
  }
  ctx.restore();
}

/** 자막 모양 옵션(색·스타일)을 배경에 맞게 정리합니다. */
function captionLook(p, bg, overPhoto) {
  let color = overPhoto ? p.textColor : onColor(bg, p);
  let hl = p.highlightColor;
  let style = p.captionStyle || 'outline';
  if (style === 'box') color = isBright(p.textColor) ? p.textColor : '#ffffff';
  if (style === 'pill') { color = isBright(p.highlightColor) ? p.inkColor : (isBright(p.textColor) ? p.textColor : '#ffffff'); hl = color; }
  return { color, hl, style, shadow: !isBright(color), pillColor: p.highlightColor };
}

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
    o = { ...look, size: p.captionSize * 1.4 * u, valign: 'center', maxLines: 5, style: look.style === 'pill' ? 'pill' : 'plain', shadow: isBright(look.color) };
  } else if (!scene.img && tpl !== 'dark') {
    // 사진 없는 장면: split 은 패널색 위(글자색은 패널 기준), 그 밖은 남색 도면 패널 위 흰 글자. 가운데 크게
    box = noImgBox(p, L);
    const bg = tpl === 'split' ? p.panelColor : null;
    o = {
      size: p.captionSize * (tpl === 'card' ? 1.1 : 1.25) * u, color: bg ? onColor(bg, p) : '#ffffff', hl: p.highlightColor,
      style: p.captionStyle === 'pill' ? 'pill' : 'plain', valign: 'center', maxLines: 5, align: tpl === 'split' ? 'left' : 'center',
    };
    if (o.style === 'pill') Object.assign(o, captionLook(p, bg || '#000', false));
  } else if (tpl === 'split') {
    box = L.cap;
    o = { ...captionLook(p, p.panelColor, false), size: p.captionSize * 1.12 * u, align: 'left', valign: 'top', maxLines: 4 };
  } else if (tpl === 'card') {
    box = L.cap;
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
    drawRichText(ctx, p.title, L.title, {
      size: p.captionSize * 1.08 * u, weight: p.font, color: p.titleColor || ink, hl: p.highlightColor,
      style: overPhoto ? 'outline' : 'plain', shadow: overPhoto,
      valign: 'center', maxLines: 3, u,
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

function ovNews(ctx, e) {
  const { p, L, W, u, pad, top, scene } = e;
  const img = L.img;
  chip(ctx, '속보', img.x + pad * 0.5, top + pad * 0.5 + 26 * u, { size: 34 * u, weight: '900', bg: p.highlightColor, color: onHl(p), h: 58 * u, padX: 22 * u, radius: 8 * u, border: hookChipBorder(p, scene), u });
  const cap = L.cap;
  const bandY = cap.y - 10 * u;
  const bandH = Math.min(cap.h + 20 * u, 340 * u);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, bandY, W, bandH);
  ctx.fillStyle = p.highlightColor;
  ctx.fillRect(0, bandY, W, 8 * u);
  if (p.channel) {
    ctx.font = uiFont(26 * u, 800);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = p.highlightColor;
    ctx.fillText(p.channel, pad * 0.6, bandY + 38 * u);
  }
  return { box: { x: pad * 0.6, y: bandY + 62 * u, w: W - pad * 1.2, h: bandH - 76 * u }, color: p.inkColor, hl: p.highlightColor, style: 'plain', shadow: false, align: 'left', valign: 'top', maxLines: 3 };
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
  let y = top + pad * 0.5 + 27 * u;
  for (const s of prev) {
    const label = checkLabel(s.scene.caption);
    if (!label) continue;
    const size = 30 * u;
    chip(ctx, '      ' + label, L.img.x + pad * 0.5, y, { size, weight: '700', bg: 'rgba(255,255,255,0.94)', color: p.inkColor, h: 54 * u, padX: 16 * u, radius: 14 * u });
    drawCheckMark(ctx, L.img.x + pad * 0.5 + 30 * u, y, 26 * u, '#1fcf62');
    y += 62 * u;
  }
}

function ovPin(ctx, e) {
  const { p, L, u, scene } = e;
  const img = L.img;
  const x = img.x + img.w / 2;
  const y = img.y + img.h * 0.42;
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
  const box = centered
    ? { x: cap.x, y: Math.max(cap.y + 44 * u, cap.y + cap.h / 2 - 240 * u), w: cap.w, h: Math.min(460 * u, cap.h - 120 * u) }
    : { x: cap.x, y: cap.y + 44 * u, w: cap.w, h: cap.h - 100 * u };
  const qy = centered ? Math.max(cap.y - 36 * u, box.y - 150 * u) : cap.y - 36 * u;
  ctx.save();
  ctx.font = fontCss('900', 150 * u);
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillStyle = p.highlightColor;
  ctx.globalAlpha *= 0.9;
  ctx.fillText('“', cap.x - 8 * u, qy);
  ctx.restore();
  if (p.channel) {
    ctx.font = uiFont(30 * u, 700);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    const bg = tpl === 'split' ? p.panelColor : p.bandColor;
    const ink = overPhoto || (!scene.img && tpl !== 'dark' && tpl !== 'split') ? '#ffffff' : onColor(bg, p); // 사진 없는 band/card 는 남색 도면 패널 위
    ctx.fillStyle = rgba(ink, 0.75);
    ctx.fillText(`— ${p.channel}`, cap.x + cap.w, centered ? box.y + box.h + 30 * u : cap.y + cap.h - 16 * u);
  }
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
  if (!e.scene.img) return; // 사진 없는 장면의 자막은 자막 칸이 아니라 패널 가운데라 티커와 겹치지 않음
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
  const b = hookBg
    ? { x: pad * 0.7, y: L.hook.y + L.hook.h / 2 - H * 0.15, w: W - pad * 1.4, h: H * 0.3 } // 질문 말풍선은 화면 가운데 크게
    : { x: pad * 0.7, y: cap.y, w: W - pad * 1.4, h: cap.h };
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
  const box = hookBg ? L.hook : (darkImg ? { x: L.cap.x, y: L.cap.y, w: L.cap.w, h: 220 * u } : L.img);
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
  let x = (W - total) / 2 + 9 * u;
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
  if (!e.scene.img) return; // 사진 없는 장면의 자막은 패널·카드 가운데라 점과 겹치지 않음
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
