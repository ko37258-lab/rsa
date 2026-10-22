// 쇼츠 한 프레임을 그리는 순수 그리기 코드.
// 미리보기와 영상 내보내기가 같은 drawFrame()을 쓰므로, 화면 모양을 바꾸려면 이 파일만 고치면 됩니다.
// 모든 크기는 1080px 기준 값에 u(=짧은 변/1080)를 곱해 해상도와 상관없이 같은 비율로 그립니다.

import { clamp, drawImageFit, roundRectPath } from './util.js';

export const FONTS = [
  { id: 'Black Han Sans', label: '검은고딕 — 굵고 강하게', weight: 400 },
  { id: 'Noto Sans KR', label: '본고딕 Black — 깔끔하게', weight: 900 },
  { id: 'Do Hyeon', label: '도현 — 단단하게', weight: 400 },
  { id: 'Jua', label: '주아 — 둥글고 친근하게', weight: 400 },
  { id: 'Nanum Myeongjo', label: '나눔명조 — 진지하게', weight: 800 },
  { id: 'Gowun Dodum', label: '고운돋움 — 차분하게', weight: 400 },
];

const UI_FONT = '"IBM Plex Sans KR", "Noto Sans KR", sans-serif';

export function fontCss(family, px, weight) {
  const w = weight ?? FONTS.find((f) => f.id === family)?.weight ?? 400;
  return `${w} ${Math.round(px)}px "${family}", "Noto Sans KR", sans-serif`;
}

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
  p.scenes.forEach((scene, index) => {
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

/** 템플릿별 영역 나누기 */
export function layout(p, W, H) {
  const u = Math.min(W, H) / 1080;
  const pad = 56 * u;
  const portrait = H > W;
  const titleH = (portrait ? 0.215 : 0.2) * H;
  if (p.template === 'full') {
    return {
      u, pad,
      img: { x: 0, y: 0, w: W, h: H },
      title: { x: pad, y: pad * 1.6, w: W - pad * 2, h: titleH - pad },
      cap: { x: pad, y: H * (portrait ? 0.64 : 0.6), w: W - pad * 2, h: H * (portrait ? 0.22 : 0.3) },
      textBox: { x: pad, y: titleH, w: W - pad * 2, h: H * (portrait ? 0.62 : 0.66) - titleH },
    };
  }
  const imgH = Math.min(W, H * 0.56);
  const img = { x: 0, y: titleH, w: W, h: imgH };
  const capY = img.y + img.h + 24 * u;
  return {
    u, pad,
    img,
    title: { x: pad, y: pad * 1.25, w: W - pad * 2, h: titleH - pad * 1.5 },
    cap: { x: pad, y: capY, w: W - pad * 2, h: H - capY - 50 * u },
    textBox: { x: pad, y: img.y + pad * 0.5, w: W - pad * 2, h: img.h - pad },
  };
}

const easeInOut = (x) => 0.5 - Math.cos(Math.PI * clamp(x, 0, 1)) / 2;

function motionFor(p, index, prog) {
  let mode = p.motion;
  if (mode === 'none') return { zoom: 1, ox: 0, oy: 0 };
  if (mode === 'auto') mode = ['in', 'right', 'out', 'left'][index % 4];
  const e = easeInOut(prog);
  if (mode === 'in') return { zoom: 1 + 0.12 * e, ox: 0, oy: 0 };
  if (mode === 'out') return { zoom: 1.12 - 0.12 * e, ox: 0, oy: 0 };
  if (mode === 'left') return { zoom: 1.12, ox: 0.85 - 1.7 * e, oy: 0 };
  return { zoom: 1.12, ox: -0.85 + 1.7 * e, oy: 0 };
}

// 흐린 배경: 아주 작게 줄였다가 두 번에 나눠 키우면 가볍게 흐림 효과가 납니다(모든 브라우저 동작).
const blurCache = new WeakMap();
function blurredOf(img, W, H) {
  let per = blurCache.get(img);
  if (!per) blurCache.set(img, (per = new Map()));
  const key = `${W}x${H}`;
  if (per.has(key)) return per.get(key);
  const tiny = document.createElement('canvas');
  tiny.width = Math.max(6, Math.round(W / 36));
  tiny.height = Math.max(6, Math.round(H / 36));
  drawImageFit(tiny.getContext('2d'), img, 0, 0, tiny.width, tiny.height, 'cover', 1.15);
  const mid = document.createElement('canvas');
  mid.width = Math.max(12, Math.round(W / 9));
  mid.height = Math.max(12, Math.round(H / 9));
  const g = mid.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(tiny, 0, 0, mid.width, mid.height);
  per.set(key, mid);
  return mid;
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

/** 폭에 맞춰 줄을 나눕니다. 띄어쓰기 단위로 자르고, 한 단어가 너무 길면 글자 단위로 자릅니다. */
function wrapRich(ctx, text, maxW) {
  const lines = [];
  for (const para of String(text).split('\n')) {
    let line = [];
    let lineW = 0;
    const push = () => {
      while (line.length && /^\s+$/.test(line[line.length - 1].text)) lineW -= line.pop().w;
      lines.push({ runs: line, w: lineW });
      line = [];
      lineW = 0;
    };
    for (const run of parseRuns(para)) {
      for (const tok of run.text.split(/(\s+)/)) {
        if (!tok) continue;
        if (!line.length && /^\s+$/.test(tok)) continue;
        const w = ctx.measureText(tok).width;
        if (lineW + w <= maxW || !line.length) {
          if (w > maxW && !/^\s+$/.test(tok)) {
            for (const ch of tok) {
              const cw = ctx.measureText(ch).width;
              if (lineW + cw > maxW && line.length) push();
              line.push({ text: ch, hl: run.hl, w: cw });
              lineW += cw;
            }
          } else {
            line.push({ text: tok, hl: run.hl, w });
            lineW += w;
          }
        } else {
          push();
          if (/^\s+$/.test(tok)) continue;
          line.push({ text: tok, hl: run.hl, w });
          lineW += w;
        }
      }
    }
    push();
  }
  return lines.filter((l, i, all) => l.runs.length || all.length === 1);
}

/**
 * 상자 안에 강조 글씨를 그립니다. 넘치면 글자를 줄여 맞춥니다.
 * o = { size, family, weight, color, hl, style: outline|box|plain, valign: top|center|bottom, maxLines, alpha, u }
 */
export function drawRichText(ctx, text, box, o) {
  if (!plainText(text).trim()) return;
  let size = o.size;
  let lines;
  const minSize = o.size * 0.5;
  for (;;) {
    ctx.font = fontCss(o.family, size, o.weight);
    lines = wrapRich(ctx, text, box.w);
    const h = lines.length * size * 1.28;
    if ((lines.length <= (o.maxLines || 99) && h <= box.h) || size <= minSize) break;
    size *= 0.93;
  }
  const lh = size * 1.28;
  const blockH = lines.length * lh;
  let y0 = box.y;
  if (o.valign === 'center') y0 = box.y + (box.h - blockH) / 2;
  else if (o.valign === 'bottom') y0 = box.y + box.h - blockH;

  ctx.save();
  ctx.globalAlpha *= o.alpha ?? 1;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.lineJoin = 'round';
  ctx.font = fontCss(o.family, size, o.weight);
  const u = o.u || 1;

  if (o.style === 'box') {
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    lines.forEach((ln, i) => {
      if (!ln.runs.length) return;
      const x = box.x + (box.w - ln.w) / 2;
      const py = size * 0.2;
      roundRectPath(ctx, x - size * 0.32, y0 + i * lh + (lh - size) / 2 - py, ln.w + size * 0.64, size + py * 2, 10 * u);
      ctx.fill();
    });
  }
  if (o.style === 'outline') {
    ctx.strokeStyle = 'rgba(0,0,0,0.92)';
    ctx.lineWidth = Math.max(2, size * 0.17);
    lines.forEach((ln, i) => {
      let x = box.x + (box.w - ln.w) / 2;
      const y = y0 + i * lh + lh / 2;
      for (const r of ln.runs) { ctx.strokeText(r.text, x, y); x += r.w; }
    });
  } else if (o.style === 'plain' && o.shadow !== false) {
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = size * 0.18;
    ctx.shadowOffsetY = size * 0.04;
  }
  lines.forEach((ln, i) => {
    let x = box.x + (box.w - ln.w) / 2;
    const y = y0 + i * lh + lh / 2;
    for (const r of ln.runs) {
      ctx.fillStyle = r.hl ? o.hl : o.color;
      ctx.fillText(r.text, x, y);
      x += r.w;
    }
  });
  ctx.restore();
}

// ── 장면 그리기 ───────────────────────────────────────
function drawTextPanel(ctx, p, L, rect) {
  const { u } = L;
  ctx.save();
  const g = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.w, rect.y + rect.h);
  g.addColorStop(0, '#18213f');
  g.addColorStop(1, '#0c1020');
  ctx.fillStyle = g;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  // 바둑판 눈금 — 도면·지적도 느낌
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 2 * u;
  const step = 90 * u;
  for (let x = rect.x + step; x < rect.x + rect.w; x += step) { ctx.beginPath(); ctx.moveTo(x, rect.y); ctx.lineTo(x, rect.y + rect.h); ctx.stroke(); }
  for (let y = rect.y + step; y < rect.y + rect.h; y += step) { ctx.beginPath(); ctx.moveTo(rect.x, y); ctx.lineTo(rect.x + rect.w, y); ctx.stroke(); }
  ctx.restore();
}

function drawEnding(ctx, p, L, W, H, logo) {
  const { u } = L;
  ctx.save();
  ctx.fillStyle = p.bandColor;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, H * 0.45, 10 * u, W / 2, H * 0.45, Math.max(W, H) * 0.6);
  glow.addColorStop(0, 'rgba(255,255,255,0.10)');
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
  drawRichText(ctx, p.ending.text, { x: L.pad, y, w: W - L.pad * 2, h: H * 0.24 }, {
    size: p.captionSize * 1.15 * u, family: p.font, color: p.textColor, hl: p.highlightColor,
    style: 'plain', valign: 'center', maxLines: 3, u,
  });
  ctx.font = `600 ${Math.round(36 * u)}px ${UI_FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(plainText(p.ending.sub), W / 2, y + H * 0.24 + 40 * u);
  ctx.restore();
}

function drawSceneVisual(ctx, p, L, W, H, seg, t, fx) {
  const scene = seg.scene;
  const dur = seg.end - seg.start;
  const prog = (t - seg.start) / (dur + 0.5);
  const m = motionFor(p, seg.index, prog);
  const zoom = m.zoom * (fx.zoom || 1);
  const rect = L.img;
  ctx.save();
  ctx.globalAlpha *= fx.alpha;
  if (p.template === 'blur' && scene.img) {
    ctx.save();
    ctx.translate(fx.dx, 0);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(blurredOf(scene.img, W, H), 0, 0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  ctx.translate(fx.dx, 0);
  if (!scene.img) {
    drawTextPanel(ctx, p, L, rect);
  } else if (p.template === 'blur') {
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 40 * L.u;
    const inset = 24 * L.u;
    drawImageFit(ctx, scene.img, rect.x + inset, rect.y + inset, rect.w - inset * 2, rect.h - inset * 2, 'contain', 1 + (zoom - 1) * 0.35, 0, 0);
  } else {
    drawImageFit(ctx, scene.img, rect.x, rect.y, rect.w, rect.h, 'cover', zoom, m.ox, m.oy);
  }
  ctx.restore();
}

function drawCaption(ctx, p, L, seg, alpha) {
  if (seg.kind !== 'scene') return;
  const { u } = L;
  const scene = seg.scene;
  if (!scene.img) {
    // 사진 없는 장면: 자막을 화면 가운데 크게
    drawRichText(ctx, scene.caption, L.textBox, {
      size: p.captionSize * 1.25 * u, family: p.font, color: '#ffffff', hl: p.highlightColor,
      style: 'plain', valign: 'center', maxLines: 5, alpha, u,
    });
    return;
  }
  drawRichText(ctx, scene.caption, L.cap, {
    size: p.captionSize * u, family: p.font, color: p.textColor, hl: p.highlightColor,
    style: p.captionStyle, valign: p.template === 'full' ? 'center' : 'top', maxLines: 3, alpha, u,
  });
}

function drawChrome(ctx, p, L, W, H, logo, alpha) {
  const { u, pad } = L;
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
  // 채널 이름 + 로고
  const chY = L.title.y - pad * 0.45;
  if (p.channel) {
    ctx.font = `600 ${Math.round(30 * u)}px ${UI_FONT}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = p.highlightColor;
    ctx.beginPath();
    ctx.arc(pad + 9 * u, chY, 8 * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(p.channel, pad + 26 * u, chY);
  }
  if (logo) {
    const lh = 64 * u;
    const lw = (logo.naturalWidth / logo.naturalHeight) * lh;
    ctx.drawImage(logo, W - pad - lw, chY - lh / 2, lw, lh);
  }
  drawRichText(ctx, p.title, L.title, {
    size: p.captionSize * 1.08 * u, family: p.font, color: p.titleColor || '#ffffff', hl: p.highlightColor,
    style: p.template === 'band' ? 'plain' : 'outline', shadow: p.template !== 'band',
    valign: 'center', maxLines: 3, u,
  });
  ctx.restore();
}

/** t초 시점의 화면 한 장을 그립니다. */
export function drawFrame(ctx, p, W, H, t, tl = buildTimeline(p), logo = p.logo) {
  const L = layout(p, W, H);
  ctx.save();
  ctx.fillStyle = p.bandColor;
  ctx.fillRect(0, 0, W, H);

  if (!tl.segs.length) {
    drawRichText(ctx, '사진을 넣거나\n대본을 적어\n*장면*을 만드세요', { x: L.pad, y: 0, w: W - L.pad * 2, h: H }, {
      size: 70 * L.u, family: p.font, color: '#ffffff', hl: p.highlightColor, style: 'plain', valign: 'center', u: L.u,
    });
    ctx.restore();
    return;
  }

  t = clamp(t, 0, Math.max(0, tl.total - 1e-3));
  const i = segmentAt(tl, t);
  const seg = tl.segs[i];
  const prev = i > 0 ? tl.segs[i - 1] : null;
  const trDur = p.transition === 'none' || !prev ? 0 : Math.min(0.5, (seg.end - seg.start) * 0.4, (prev.end - prev.start) * 0.4);
  const inTr = trDur > 0 && t - seg.start < trDur;
  const k = inTr ? easeInOut((t - seg.start) / trDur) : 1;

  const draw = (s, fx) => {
    if (s.kind === 'ending') {
      ctx.save();
      ctx.globalAlpha = fx.alpha;
      ctx.translate(fx.dx, 0);
      drawEnding(ctx, p, L, W, H, logo);
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
    } else {
      draw(prev, { alpha: 1, dx: 0, zoom: 1 });
      draw(seg, { alpha: k, dx: 0, zoom: 1 });
    }
  } else {
    draw(seg, { alpha: 1, dx: 0, zoom: 1 });
  }

  // 제목·채널: 엔딩으로 넘어갈 때만 함께 사라집니다.
  const chromeAlpha = seg.kind === 'ending' ? (inTr && prev?.kind === 'scene' ? 1 - k : 0) : 1;
  if (chromeAlpha > 0) drawChrome(ctx, p, L, W, H, logo, chromeAlpha);

  // 자막은 겹치면 읽기 어려워서, 앞 자막이 먼저 사라진 뒤 새 자막이 나타납니다.
  if (inTr && prev.kind === 'scene') drawCaption(ctx, p, L, prev, clamp(1 - k * 2, 0, 1));
  drawCaption(ctx, p, L, seg, inTr ? clamp(k * 2 - 1, 0, 1) : 1);

  if (p.showProgress) {
    const bh = 9 * L.u;
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(0, H - bh, W, bh);
    ctx.fillStyle = p.highlightColor;
    ctx.fillRect(0, H - bh, (W * t) / tl.total, bh);
  }
  ctx.restore();
}

/** 화면에 들어가는 글꼴을 미리 받아 둡니다(받기 전에 그리면 기본 글꼴로 나옵니다). */
export async function ensureFonts(p) {
  if (!document.fonts?.load) return;
  const text = plainText([p.title, p.channel, p.ending?.text, p.ending?.sub, ...p.scenes.map((s) => s.caption)].join(' ')) || '가나다';
  const jobs = [
    document.fonts.load(fontCss(p.font, 48), text),
    document.fonts.load(`600 30px "IBM Plex Sans KR"`, text),
    document.fonts.load(`900 30px "Noto Sans KR"`, text),
  ];
  await Promise.all(jobs.map((j) => j.catch(() => null)));
}

/** 자막 파일(SRT) */
export function buildSrt(p, srtTime) {
  const tl = buildTimeline(p);
  return tl.segs
    .filter((s) => s.kind === 'scene' && plainText(s.scene.caption).trim())
    .map((s, n) => `${n + 1}\n${srtTime(s.start)} --> ${srtTime(s.end)}\n${plainText(s.scene.caption).trim()}\n`)
    .join('\n');
}
