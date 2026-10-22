// 00 사례 보기 — 실제 렌더 엔진으로 "넣는 것 → 나오는 것"을 살아 있는 미리보기로 보여 줍니다.

import { $, clamp } from './util.js';
import { buildTimeline, drawFrame, ensureFonts, plainText } from './shorts-render.js';
import { drawComposite, COMPOSE_DEFAULTS } from './compose.js';
import { sample, SHORTS_CASE, COMPOSE_CASE, DOWNLOAD_CASE } from './samples.js';
import { revealOnScroll, popIn, countUp } from './motion.js';

let heroProject = null;
let tl = null;
let styles = [];
let raf = null;
let running = false;
let t0 = 0;

function baseProject(scenes) {
  return {
    aspect: '9:16', template: 'band', font: '900', captionSize: 68, captionStyle: 'outline', captionAnim: 'none', overlay: 'none',
    motion: 'auto', transition: 'fade', titleMode: 'band', textColor: '#ffffff', highlightColor: '#ffd43b', bandColor: '#0b0d14',
    panelColor: '#ffffff', inkColor: '#111111', showProgress: true,
    title: SHORTS_CASE.title, channel: 'MR.K 고상철',
    ending: { enabled: true, text: '*구독*하고\n땅 공부 같이 해요', sub: 'MR.K 고상철 · 부동산 AI', duration: 2.2 },
    logo: null, scenes,
  };
}

async function loadScenes() {
  const scenes = [];
  for (const s of SHORTS_CASE.scenes) scenes.push({ caption: s.caption, duration: s.duration, img: s.img ? await sample(s.img) : null });
  return scenes;
}

function drawLoop() {
  if (!running) return;
  const t = ((performance.now() - t0) / 1000) % tl.total;
  for (const id of ['heroCanvas', 'caseShortsCanvas']) {
    const c = document.getElementById(id);
    if (!c || c.closest('[hidden]')) continue;
    const r = c.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) continue;
    drawFrame(c.getContext('2d'), heroProject, c.width, c.height, t, tl);
  }
  raf = requestAnimationFrame(drawLoop);
}

export function resumeShowcase() {
  if (!heroProject || running) return;
  running = true;
  t0 = performance.now() - 1200;
  raf = requestAnimationFrame(drawLoop);
}
export function pauseShowcase() {
  running = false;
  if (raf) cancelAnimationFrame(raf);
  raf = null;
}

function fillShortsCase(scenes) {
  const strip = $('#caseShortsPhotos');
  strip.textContent = '';
  scenes.filter((s) => s.img).slice(0, 4).forEach((s, i) => {
    const f = document.createElement('figure');
    const im = document.createElement('img');
    im.src = s.img.src;
    im.alt = `장면 ${i + 1} 사진`;
    im.loading = 'lazy';
    const cap = document.createElement('figcaption');
    cap.textContent = `사진 ${i + 1}`;
    f.append(im, cap);
    strip.append(f);
  });
  const lines = $('#caseShortsLines');
  lines.textContent = '';
  for (const s of scenes) {
    const li = document.createElement('li');
    li.innerHTML = '';
    let hl = false;
    for (const part of s.caption.replace(/\n/g, ' ').split('*')) {
      if (part) { const node = hl ? document.createElement('em') : document.createTextNode(part); if (hl) node.textContent = part; li.append(node); }
      hl = !hl;
    }
    lines.append(li);
  }
  const sl = $('#caseStyleLines');
  sl.textContent = '';
  for (const s of scenes.slice(0, 3)) {
    const li = document.createElement('li');
    li.textContent = plainText(s.caption).replace(/\n/g, ' ');
    sl.append(li);
  }
}

async function fillStyleWall() {
  const wall = $('#caseStyleWall');
  wall.textContent = '';
  try { ({ STYLES: styles } = await import('./styles.js')); } catch { styles = []; }
  const list = styles.length ? styles : [{ id: 'default', name: '기본', apply: (p) => p }];
  $('#caseStyleCount').textContent = String(Math.max(styles.length, 1));
  const picks = list.slice(0, 10);
  const pending = [];
  picks.forEach((st, i) => {
    const c = document.createElement('canvas');
    c.width = 216; c.height = 384;
    c.title = st.name;
    c.setAttribute('aria-label', st.name);
    wall.append(c);
    const p = st.apply({ ...heroProject, scenes: heroProject.scenes.map((s) => ({ ...s })) });
    const ptl = buildTimeline(p);
    const t = clamp(1.4 + (i % 3) * 0.9, 0, Math.max(0.1, ptl.total - 0.2));
    try { drawFrame(c.getContext('2d'), p, c.width, c.height, t, ptl); } catch (e) { console.warn('style preview', st.id, e); }
    pending.push(c);
  });
  return pending;
}

async function fillComposeCase() {
  const [main, sub] = await Promise.all([sample(COMPOSE_CASE.mains[0]), sample(COMPOSE_CASE.subs[0])]);
  const pair = $('#caseComposePair');
  pair.textContent = '';
  for (const [img, alt] of [[main, '메인 사진'], [sub, '서브 사진']]) {
    const im = document.createElement('img');
    im.src = img.src;
    im.alt = alt;
    pair.append(im);
  }
  const c = $('#caseComposeCanvas');
  drawComposite(c.getContext('2d'), c.width, { img: main, name: 'main' }, { img: sub, name: 'sub' }, { ...COMPOSE_DEFAULTS, badgeText: COMPOSE_CASE.badge });

  const table = $('#caseDlTable');
  DOWNLOAD_CASE.slice(0, 3).forEach(([code, url]) => {
    const row = document.createElement('div');
    row.className = 'mrow';
    const a = document.createElement('span'); a.textContent = code; a.style.fontWeight = '700';
    const b = document.createElement('span'); b.className = 'url'; b.textContent = url.replace(/^.*\//, '…/');
    const s = document.createElement('span'); s.className = 'st done'; s.textContent = '완료';
    row.append(a, b, s);
    table.append(row);
  });
  const files = $('#caseFiles');
  files.textContent = '';
  const items = [['JPG', '예시-상품_대표.jpg', '1000×1000'], ['JPG', 'mrk_A1001_main.jpg', '1000×1000'], ['ZIP', '이미지_4개.zip', '한 번에 저장']];
  items.forEach(([ic, name, meta]) => {
    const card = document.createElement('div');
    card.className = 'file-card';
    card.dataset.pop = '';
    const i = document.createElement('span'); i.className = 'ic'; i.textContent = ic;
    const n = document.createElement('span'); n.textContent = name;
    const m = document.createElement('span'); m.className = 'meta'; m.textContent = meta;
    card.append(i, n, m);
    files.append(card);
  });
}

function wireCaseDots() {
  const cases = [...document.querySelectorAll('.case')];
  const dots = [...document.querySelectorAll('#caseDots .dot')];
  if (!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const i = cases.indexOf(e.target);
      dots.forEach((d, k) => d.classList.toggle('on', k === i));
      $('#caseIdx').textContent = String(i + 1);
      if (e.target.id === 'case-compose') {
        const sts = e.target.querySelectorAll('.mini-table .st');
        sts.forEach((s, k) => { s.style.opacity = '1'; popIn([s], { delay: 300 + k * 260 }); });
      }
    }
  }, { threshold: 0.45 });
  cases.forEach((c) => io.observe(c));
}

export async function initShowcase() {
  const scenes = await loadScenes();
  heroProject = baseProject(scenes);
  await ensureFonts(heroProject);
  tl = buildTimeline(heroProject);
  fillShortsCase(scenes);
  await fillStyleWall();
  await fillComposeCase();
  revealOnScroll(document.getElementById('view-showcase'));
  wireCaseDots();
  popIn(document.querySelectorAll('#heroChips .chip'), { delay: 500 });
  const cnt = $('#caseStyleCount');
  if (cnt) countUp(cnt, Number(cnt.textContent) || 20);
  // 첫 프레임은 바로 그려 둔다(정지 상태에서도 보이게)
  for (const id of ['heroCanvas', 'caseShortsCanvas']) {
    const c = document.getElementById(id);
    if (c) drawFrame(c.getContext('2d'), heroProject, c.width, c.height, 1.2, tl);
  }
}
