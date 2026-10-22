// 02 대표 이미지 합성 — 메인 사진 + 서브 사진 + 문구 뱃지를 정사각형 캔버스에 일괄 합성

import {
  $, clamp, debounce, store, toast, wireDrop, imageFromFile, makeSampleImage,
  drawImageFit, roundRectPath, canvasToBlob, baseName, safeFileName, uniqueNamer, MIME_BY_EXT,
} from './util.js';
import { openSink, canPickFolder } from './platform.js';

const DEFAULTS = {
  size: 1000,
  bg: '#ffffff',
  fit: 'contain',
  pad: 4,
  subMode: 'pair',
  subW: 34,
  subX: 77,
  subY: 77,
  border: 8,
  borderColor: '#ffffff',
  radius: 18,
  shadow: true,
  badgeOn: true,
  badgeText: '1+1 특가',
  badgePos: 'tl',
  badgeColor: '#e5383b',
  badgeTextColor: '#ffffff',
  format: 'jpg',
  quality: 0.92,
  name: '{name}_대표',
  sink: 'zip',
};

const cfg = { ...DEFAULTS, ...store.get('compose', {}) };
const mains = []; // { name, img, sample? }
const subs = [];
let cur = 0;
const persist = debounce(() => store.set('compose', cfg), 300);

function subFor(i) {
  if (!subs.length) return null;
  if (cfg.subMode === 'single' || subs.length === 1) return subs[0];
  return subs[i] || null;
}

/** 한 장 합성. 미리보기와 저장이 같은 함수를 씁니다. */
function drawComposite(ctx, S, main, sub, o = cfg) {
  ctx.save();
  ctx.fillStyle = o.bg;
  ctx.fillRect(0, 0, S, S);
  if (main) {
    const pad = (S * o.pad) / 100;
    drawImageFit(ctx, main.img, pad, pad, S - pad * 2, S - pad * 2, o.fit);
  }
  const subRect = sub ? subRectOf(S, sub.img, o) : null;
  if (sub) {
    const { x, y, w, h } = subRect;
    const k = S / 1000;
    const bw = o.border * k;
    const r = o.radius * k;
    ctx.save();
    if (o.shadow) {
      ctx.shadowColor = 'rgba(0,0,0,0.28)';
      ctx.shadowBlur = 24 * k;
      ctx.shadowOffsetY = 8 * k;
    }
    ctx.fillStyle = bw > 0 ? o.borderColor : o.bg;
    roundRectPath(ctx, x - bw, y - bw, w + bw * 2, h + bw * 2, r + bw);
    ctx.fill();
    ctx.restore();
    ctx.save();
    roundRectPath(ctx, x, y, w, h, r);
    ctx.clip();
    drawImageFit(ctx, sub.img, x, y, w, h, 'cover');
    ctx.restore();
  }
  if (o.badgeOn && o.badgeText.trim()) drawBadge(ctx, S, o);
  ctx.restore();
  return subRect;
}

function subRectOf(S, img, o = cfg) {
  const w = (S * o.subW) / 100;
  const h = w * (img.naturalHeight / img.naturalWidth);
  const x = clamp((S * o.subX) / 100 - w / 2, 0, S - w);
  const y = clamp((S * o.subY) / 100 - h / 2, 0, S - h);
  return { x, y, w, h };
}

function drawBadge(ctx, S, o) {
  const k = S / 1000;
  const size = 54 * k;
  ctx.save();
  ctx.font = `${Math.round(size)}px "Black Han Sans", "Noto Sans KR", sans-serif`;
  ctx.textBaseline = 'middle';
  const tw = ctx.measureText(o.badgeText).width;
  const bw = tw + size * 1.1;
  const bh = size * 1.6;
  const m = 34 * k;
  const x = o.badgePos.endsWith('r') ? S - m - bw : m;
  const y = o.badgePos.startsWith('b') ? S - m - bh : m;
  ctx.fillStyle = o.badgeColor;
  roundRectPath(ctx, x, y, bw, bh, bh / 2);
  ctx.fill();
  ctx.fillStyle = o.badgeTextColor;
  ctx.textAlign = 'center';
  ctx.fillText(o.badgeText, x + bw / 2, y + bh / 2 + size * 0.04);
  ctx.restore();
}

// ── 미리보기 ─────────────────────────────────────────
let lastSubRect = null;
function draw() {
  const c = $('#cCanvas');
  const S = clamp(Number(cfg.size) || 1000, 300, 2000);
  if (c.width !== S) { c.width = S; c.height = S; }
  const ctx = c.getContext('2d');
  if (!mains.length) {
    ctx.fillStyle = cfg.bg;
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#8a90a2';
    ctx.font = `600 ${Math.round(S * 0.04)}px "IBM Plex Sans KR", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('메인 사진을 넣어 주세요', S / 2, S / 2);
    lastSubRect = null;
  } else {
    cur = clamp(cur, 0, mains.length - 1);
    lastSubRect = drawComposite(ctx, S, mains[cur], subFor(cur));
  }
  $('#cIndex').textContent = mains.length ? `${cur + 1} / ${mains.length} · ${mains[cur].name}` : '0 / 0';
  renderThumbs();
}

function renderThumbs() {
  const fill = (ul, arr, isMain) => {
    ul.textContent = '';
    arr.forEach((it, i) => {
      const li = document.createElement('li');
      if (isMain && i === cur) li.classList.add('current');
      const im = document.createElement('img');
      im.src = it.img.src;
      im.alt = it.name;
      im.title = it.name;
      if (isMain) im.addEventListener('click', () => { cur = i; draw(); });
      const del = document.createElement('button');
      del.type = 'button';
      del.textContent = '✕';
      del.setAttribute('aria-label', `${it.name} 빼기`);
      del.addEventListener('click', () => { arr.splice(i, 1); draw(); });
      li.append(im, del);
      ul.append(li);
    });
  };
  fill($('#mainThumbs'), mains, true);
  fill($('#subThumbs'), subs, false);
  $('#mainCount').textContent = mains.length ? `${mains.length}장${mains.every((m) => m.sample) ? ' · 예시' : ''}` : '';
  $('#subCount').textContent = subs.length ? `${subs.length}장${subs.every((m) => m.sample) ? ' · 예시' : ''}` : '';
}

async function addFiles(arr, files) {
  if (arr.length && arr.every((x) => x.sample)) arr.length = 0;
  const list = files.filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(f.name));
  list.sort((a, b) => a.name.localeCompare(b.name, 'ko', { numeric: true }));
  let fails = 0;
  for (const f of list) {
    try { arr.push({ name: f.name, img: await imageFromFile(f) }); } catch { fails++; }
  }
  if (fails) toast(`${fails}장은 열지 못했습니다.`);
  draw();
}

// 미리보기에서 서브 사진 끌어 옮기기
function wireDrag() {
  const c = $('#cCanvas');
  let drag = null;
  const toCanvas = (e) => {
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  };
  c.addEventListener('pointerdown', (e) => {
    if (!lastSubRect) return;
    const p = toCanvas(e);
    const s = lastSubRect;
    if (p.x < s.x || p.x > s.x + s.w || p.y < s.y || p.y > s.y + s.h) return;
    drag = { dx: p.x - (s.x + s.w / 2), dy: p.y - (s.y + s.h / 2) };
    c.setPointerCapture(e.pointerId);
    c.classList.add('dragging');
  });
  c.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const p = toCanvas(e);
    cfg.subX = Math.round(clamp(((p.x - drag.dx) / c.width) * 100, 0, 100) * 2) / 2;
    cfg.subY = Math.round(clamp(((p.y - drag.dy) / c.height) * 100, 0, 100) * 2) / 2;
    $('#subPreset').value = '';
    syncControls();
    persist();
    draw();
  });
  const end = () => { drag = null; c.classList.remove('dragging'); };
  c.addEventListener('pointerup', end);
  c.addEventListener('pointercancel', end);
}

const PRESETS = { br: [77, 77], bl: [23, 77], tr: [77, 23], tl: [23, 23], c: [50, 50] };

// ── 일괄 저장 ─────────────────────────────────────────
async function runAll() {
  if (!mains.length) return toast('메인 사진을 먼저 넣어 주세요.');
  const btn = $('#cRun');
  const status = $('#cStatus');
  const bar = $('#cProgress');
  let sink;
  try {
    sink = await openSink(cfg.sink, `대표이미지_${mains.length}장.zip`);
  } catch (e) {
    if (e?.name === 'AbortError') return;
    return toast(e.message || '저장 위치를 열지 못했습니다.');
  }
  btn.disabled = true;
  bar.hidden = false;
  const S = clamp(Number(cfg.size) || 1000, 300, 2000);
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d');
  const ext = cfg.format;
  const mime = MIME_BY_EXT[ext];
  const nameOf = uniqueNamer();
  let ok = 0;
  try {
    for (let i = 0; i < mains.length; i++) {
      drawComposite(ctx, S, mains[i], subFor(i));
      const blob = await canvasToBlob(canvas, mime, ext === 'png' ? undefined : Number(cfg.quality));
      const stem = (cfg.name || '{name}')
        .replaceAll('{name}', baseName(mains[i].name))
        .replaceAll('{n}', String(i + 1).padStart(3, '0'));
      await sink.add(nameOf(`${safeFileName(stem, `image_${i + 1}`)}.${ext}`), blob);
      ok++;
      bar.firstElementChild.style.width = `${(ok / mains.length) * 100}%`;
      status.textContent = `${ok} / ${mains.length}장 합성`;
      await new Promise((r) => setTimeout(r, 0));
    }
    status.textContent = `${ok}장을 묶는 중…`;
    const saved = await sink.finish();
    status.textContent = saved === false ? '저장을 취소했습니다.' : `${ok}장 저장 완료 → ${sink.label}`;
  } catch (e) {
    status.textContent = `중간에 멈췄습니다: ${e.message || e}`;
  } finally {
    btn.disabled = false;
    setTimeout(() => { bar.hidden = true; bar.firstElementChild.style.width = '0'; }, 800);
  }
}

// ── 입력 연결 ─────────────────────────────────────────
const BIND = [
  ['cSize', 'size', Number], ['cFit', 'fit'], ['cPad', 'pad', Number], ['cSubW', 'subW', Number],
  ['cSubX', 'subX', Number], ['cSubY', 'subY', Number], ['cBorder', 'border', Number],
  ['cRadius', 'radius', Number], ['cShadow', 'shadow', 'check'], ['cBg', 'bg'], ['cBorderColor', 'borderColor'],
  ['subMode', 'subMode'], ['bOn', 'badgeOn', 'check'], ['bText', 'badgeText'], ['bPos', 'badgePos'],
  ['bColor', 'badgeColor'], ['bTextColor', 'badgeTextColor'], ['cFormat', 'format'],
  ['cQuality', 'quality', Number], ['cName', 'name'], ['cSink', 'sink'],
];

function syncControls() {
  for (const [id, key, kind] of BIND) {
    const el = document.getElementById(id);
    if (kind === 'check') el.checked = !!cfg[key];
    else el.value = cfg[key];
  }
  $('#cPadOut').textContent = `${cfg.pad}%`;
  $('#cSubWOut').textContent = `${cfg.subW}%`;
  $('#cSubXOut').textContent = `${cfg.subX}%`;
  $('#cSubYOut').textContent = `${cfg.subY}%`;
  $('#cQualityOut').textContent = cfg.format === 'png' ? '무손실' : `${Math.round(cfg.quality * 100)}`;
}

export async function initCompose() {
  if (!canPickFolder) {
    $('#cSink').querySelector('option[value=folder]').disabled = true;
    if (cfg.sink === 'folder') cfg.sink = 'zip';
  }
  syncControls();
  for (const [id, key, kind] of BIND) {
    document.getElementById(id).addEventListener('input', (e) => {
      cfg[key] = kind === 'check' ? e.target.checked : kind ? kind(e.target.value) : e.target.value;
      if (key === 'subX' || key === 'subY') $('#subPreset').value = '';
      syncControls();
      persist();
      draw();
    });
  }
  $('#subPreset').addEventListener('input', (e) => {
    const p = PRESETS[e.target.value];
    if (!p) return;
    [cfg.subX, cfg.subY] = p;
    syncControls();
    persist();
    draw();
  });
  wireDrop($('#mainFiles').closest('label'), (f) => addFiles(mains, f));
  wireDrop($('#subFiles').closest('label'), (f) => addFiles(subs, f));
  $('#cPrev').addEventListener('click', () => { cur = (cur - 1 + mains.length) % Math.max(1, mains.length); draw(); });
  $('#cNext').addEventListener('click', () => { cur = (cur + 1) % Math.max(1, mains.length); draw(); });
  $('#cRun').addEventListener('click', runAll);
  wireDrag();

  // 예시 사진으로 첫 화면 채우기
  const [m1, m2, s1] = await Promise.all([makeSampleImage('product', 1000, 1000), makeSampleImage('land', 1000, 1000), makeSampleImage('tag', 600, 600)]);
  mains.push({ name: '예시-상품.jpg', img: m1, sample: true }, { name: '예시-토지.jpg', img: m2, sample: true });
  subs.push({ name: '예시-구성품.jpg', img: s1, sample: true });
  draw();
  document.fonts?.ready?.then(draw);
}
