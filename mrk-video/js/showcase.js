// 00 사례 보기 — 실제 렌더 엔진으로 "넣는 것 → 나오는 것"을 살아 있는 미리보기로 보여 줍니다.
// 「따라하기 사례」 갤러리(fillFollowGallery)도 여기 있습니다: js/cases.js 의 caseToProject 결과를 그대로 drawFrame 에 넣으므로
// 숏폼 화면의 「이대로 따라하기」(레시피 모드, 같은 함수)와 미리보기가 어긋나지 않습니다.

import { $, store } from './util.js';
import { buildTimeline, drawFrame, ensureFonts, plainText, previewTime } from './shorts-render.js';
import { drawComposite, COMPOSE_DEFAULTS } from './compose.js';
import { sample, sampleUrl, SHORTS_CASE, COMPOSE_CASE, DOWNLOAD_CASE } from './samples.js';
import { revealOnScroll, popIn, countUp } from './motion.js';
import { CASE_DATA, CASE_CATEGORIES, BASE_VISUAL, casesByCategory, categoryOf, caseSlots, caseSeconds, caseInputLine, caseToProject, caseScript } from './cases.js';
import { findStyle } from './styles.js';
import { MOODS } from './music.js';

let heroProject = null;
let tl = null;
let styles = [];
let raf = null;
let running = false;
let t0 = 0;
let userPaused = false; // 멈춤 버튼을 눌렀는지(다른 화면을 오가도 유지). 히어로·갤러리 버튼이 같이 씁니다.
const reduce = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function baseProject(scenes) {
  return {
    ...BASE_VISUAL,
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
  const now = performance.now();
  const t = ((now - t0) / 1000) % tl.total;
  for (const id of ['heroCanvas', 'caseShortsCanvas']) {
    const c = document.getElementById(id);
    if (!c || c.closest('[hidden]')) continue;
    const r = c.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) continue;
    drawFrame(c.getContext('2d'), heroProject, c.width, c.height, t, tl);
  }
  drawFollow(now);
  raf = requestAnimationFrame(drawLoop);
}

export function resumeShowcase() {
  if (!heroProject || running || userPaused) return;
  running = true;
  t0 = performance.now() - 1200;
  raf = requestAnimationFrame(drawLoop);
}
export function pauseShowcase() {
  running = false;
  if (raf) cancelAnimationFrame(raf);
  raf = null;
}

/** 폰 미리보기 멈춤/재생 버튼(히어로 #heroPause 와 갤러리 #followPause 는 같은 상태를 공유). 움직임 줄이기 설정이면 처음부터 멈춰 두고 원할 때만 재생합니다. */
function wirePause() {
  const btns = [$('#heroPause'), $('#followPause')].filter(Boolean);
  if (!btns.length) return;
  const sync = () => {
    for (const btn of btns) {
      btn.setAttribute('aria-pressed', String(userPaused));
      if (btn.id === 'followPause') {
        btn.setAttribute('aria-label', userPaused ? '사례 미리보기 재생' : '사례 미리보기 멈춤');
        btn.textContent = userPaused ? '▶ 미리보기 재생' : '❚❚ 미리보기 멈춤';
      } else {
        btn.setAttribute('aria-label', userPaused ? '미리보기 재생' : '미리보기 멈춤');
        btn.textContent = userPaused ? '▶' : '❚❚';
      }
    }
  };
  userPaused = !!reduce();
  sync();
  for (const btn of btns) {
    btn.addEventListener('click', () => {
      userPaused = !userPaused;
      if (userPaused) pauseShowcase(); else resumeShowcase();
      sync();
    });
  }
}

/** `*강조*` 를 <em> 으로 바꾼 조각(줄바꿈은 빈칸으로) */
function richLine(text) {
  const frag = document.createDocumentFragment();
  let hl = false;
  for (const part of String(text || '').replace(/\n/g, ' ').split('*')) {
    if (part) {
      if (hl) { const em = document.createElement('em'); em.textContent = part; frag.append(em); }
      else frag.append(document.createTextNode(part));
    }
    hl = !hl;
  }
  return frag;
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
    li.append(richLine(s.caption));
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

// ── 따라하기 사례 갤러리 ─────────────────────────────────────
// 카드마다 { el, canvas, ctx, data, project, tl, ready, ratio, active } 를 둡니다(설계: 보이기 전엔 준비하지 않고, 움직이는 캔버스는 2개까지).
const follow = { cards: [], active: [], byEl: new Map() };
const MAX_LIVE = 2; // 동시에 움직이는 갤러리 캔버스 수
const MAX_PHOTOS = 5; // 사진 띠에 보여 주는 자리 수(그 뒤는 +N)
const RATIO_LABEL = { '9:16': '9:16 쇼츠', '16:9': '16:9 가로', '1:1': '1:1 정사각' };
const CANVAS_SIZE = { '9:16': [216, 384], '16:9': [384, 216], '1:1': [300, 300] };
const KIND_LABEL = { hook: '훅', answer: '답', cta: '마무리' };

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};
const ioLabel = (text, out) => el('span', out ? 'io-label out' : 'io-label', text);

/** "넣는 것" 사진 띠 — 사진 자리(슬롯) 순서로 최대 MAX_PHOTOS 장, 라벨은 자리 hint. 예시 사진 파일이 없으면 sample() 의 그림으로 대신합니다. */
function buildPhotos(c, slots) {
  const ol = el('ol', 'fc-photos');
  ol.setAttribute('aria-label', `넣을 사진 자리 ${slots.length}개`);
  for (const s of slots.slice(0, MAX_PHOTOS)) {
    const li = el('li');
    const im = el('img');
    im.alt = '';
    im.loading = 'lazy';
    im.decoding = 'async';
    im.addEventListener('error', () => { sample(s.img).then((img) => { im.src = img.src; }).catch(() => {}); }, { once: true });
    im.src = sampleUrl(s.img);
    const label = s.hint || `사진 ${s.no}`;
    const sp = el('span', '', label);
    sp.title = label;
    li.append(im, el('b', '', String(s.no)), sp);
    ol.append(li);
  }
  if (slots.length > MAX_PHOTOS) {
    const li = el('li', 'more', `+${slots.length - MAX_PHOTOS}`);
    li.setAttribute('aria-label', `사진 자리 ${slots.length - MAX_PHOTOS}개 더`);
    ol.append(li);
  }
  return ol;
}

/** 「대본 보기」 상자 — 줄마다 자리·자막(*강조* 는 em)·읽기·메타 */
function buildScript(c) {
  const box = el('div', 'fc-script');
  box.id = `fs-${c.id}`;
  box.hidden = true;
  const ol = el('ol');
  let lines = [];
  try { lines = caseScript(c); } catch (e) { console.warn('사례 대본', c.id, e); }
  for (const l of lines) {
    const li = el('li');
    let where = '글자 장면';
    if (l.kind === 'ending') where = '엔딩';
    else if (l.slot != null) where = (l.slot2 != null ? `자리 ${l.slot}·${l.slot2}` : `자리 ${l.slot}`) + (l.hint ? ` · ${l.hint}` : '');
    li.append(el('b', '', where));
    if (KIND_LABEL[l.kind]) li.append(el('i', 'kind', KIND_LABEL[l.kind]));
    const cap = el('span', 'cap');
    cap.append(richLine(l.caption));
    li.append(cap);
    if (l.narration) li.append(el('span', 'nar', `읽기: ${l.narration}`));
    if (l.meta?.length) li.append(el('span', 'meta', l.meta.join(' · ')));
    ol.append(li);
  }
  const hint = c.category === 'listing'
    ? '가격·면적 같은 숫자는 예시입니다. 따라하기에서 매물 정보를 적고 「AI 로 사진에 맞춰 대본 다듬기」를 누르면 실제 값으로 바뀝니다.'
    : '날짜·숫자·이름은 예시입니다. 따라하기에서 자막을 고치거나 「AI 로 사진에 맞춰 대본 다듬기」로 내 사진에 맞출 수 있습니다.';
  box.append(ol, el('p', 'hint', hint));
  return box;
}

/** 사례 카드 한 장(설계 1-3). 미리보기 캔버스 크기는 사례 비율을 따릅니다(9:16 폰 · 16:9 모니터 · 1:1). */
function buildCard(c, index) {
  const card = el('article', 'follow-card');
  card.setAttribute('role', 'listitem');
  card.dataset.id = c.id;
  card.dataset.cat = c.category || '';
  card.setAttribute('aria-labelledby', `fc-${c.id}`);
  const aspect = CANVAS_SIZE[c.aspect] ? c.aspect : '9:16';

  // 넣는 것
  const io = el('div', 'fc-io');
  io.append(ioLabel('넣는 것'));
  const slots = caseSlots(c);
  if (slots.length) io.append(buildPhotos(c, slots));
  const count = el('p', 'fc-count');
  count.append(el('b', '', slots.length ? caseInputLine(c) : '사진 없이 글자만'), el('span', '', `장면 ${(c.scenes || []).length}개 · 약 ${Math.round(caseSeconds(c))}초`));
  io.append(count);

  // 나오는 것
  const out = el('div', 'fc-out');
  out.append(ioLabel('나오는 것', true));
  const frame = el('div', aspect === '9:16' ? 'phone sm' : 'monitor');
  frame.dataset.aspect = aspect;
  const canvas = el('canvas');
  [canvas.width, canvas.height] = CANVAS_SIZE[aspect];
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', `사례 「${c.name}」 미리보기`);
  frame.append(canvas);
  if (aspect === '9:16') frame.append(el('div', 'phone-notch'));
  out.append(frame);

  // 설명·버튼
  const body = el('div', 'fc-body');
  const chips = el('div', 'fc-chips');
  chips.append(el('span', 'tag cat', categoryOf(c).label), el('span', 'tag', RATIO_LABEL[aspect]), el('span', 'fc-no', `따라하기 ${String(index + 1).padStart(2, '0')}`));
  const h3 = el('h3', '', c.name);
  h3.id = `fc-${c.id}`;
  const st = findStyle(c.style);
  const mood = MOODS.find((m) => m.id === c.music);
  const styleLine = st ? `스타일 「${st.name}」 · 음악 「${mood ? mood.name : '스타일 추천'}」` : '스타일 데이터를 불러오지 못했습니다';
  const row = el('div', 'row wrap');
  const go = el('a', 'btn accent small', '이대로 따라하기');
  go.href = `#follow=${c.id}`;
  go.setAttribute('aria-label', `「${c.name}」 이대로 따라하기`);
  const toggle = el('button', 'btn ghost small', '대본 보기');
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', `fs-${c.id}`);
  row.append(go, toggle);
  const script = buildScript(c);
  toggle.addEventListener('click', () => {
    const open = script.hidden;
    script.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.textContent = open ? '대본 닫기' : '대본 보기';
  });
  body.append(chips, h3, el('p', 'fc-desc', c.purpose || ''), el('p', 'fc-style', styleLine), row, script);

  card.append(io, out, body);
  return { el: card, canvas, ctx: canvas.getContext('2d'), data: c, index, project: null, tl: null, ready: false, preparing: false, broken: false, ratio: 0, active: false };
}

function markBroken(card, e) {
  card.broken = true;
  card.active = false;
  console.warn('사례 미리보기', card.data.id, e);
}

/** 정지 프레임 한 장(첫 보통 장면 +1.4초 — 등장 효과가 끝난 정착 모습) */
function drawStill(card) {
  if (!card.ready || card.broken) return;
  try { drawFrame(card.ctx, card.project, card.canvas.width, card.canvas.height, previewTime(card.tl), card.tl); } catch (e) { markBroken(card, e); }
}

const cardVisible = (card) => card.ratio > 0 && !card.el.hidden && !card.el.closest('[hidden]');

/** 보이는 비율이 큰 순(같으면 문서 순)으로 MAX_LIVE 개만 움직입니다. 활동에서 빠지는 카드는 정지 프레임을 다시 그립니다. */
function pickActive() {
  const next = follow.cards
    .filter((c) => c.ready && !c.broken && cardVisible(c))
    .sort((a, b) => (b.ratio - a.ratio) || (a.index - b.index))
    .slice(0, MAX_LIVE);
  for (const c of follow.active) if (!next.includes(c)) { c.active = false; drawStill(c); }
  for (const c of next) c.active = true;
  follow.active = next;
}

/** 움직이는 카드 그리기 — drawLoop 가 매 프레임 부릅니다(t0 는 히어로와 공유). */
function drawFollow(now) {
  for (const c of follow.active) {
    if (!c.ready || c.broken || !cardVisible(c)) continue;
    const t = ((now - t0) / 1000) % c.tl.total;
    try { drawFrame(c.ctx, c.project, c.canvas.width, c.canvas.height, t, c.tl); } catch (e) { markBroken(c, e); }
  }
  if (follow.active.some((c) => c.broken)) follow.active = follow.active.filter((c) => !c.broken);
}

/** 보이기 직전에 한 번: 사례 → 프로젝트(예시 사진은 sample 캐시, 상호는 store 'office') → 시간표 → 정지 프레임 */
async function prepare(card) {
  if (card.ready || card.preparing || card.broken) return;
  card.preparing = true;
  try {
    const project = await caseToProject(card.data, { office: store.get('office', {}) });
    await ensureFonts(project);
    card.project = project;
    card.tl = buildTimeline(project);
    card.ready = true;
    drawStill(card);
    card.el.dataset.ready = '1';
  } catch (e) {
    markBroken(card, e);
  } finally {
    card.preparing = false;
  }
  pickActive();
}

function observeCards() {
  if (!('IntersectionObserver' in window)) {
    for (const c of follow.cards) { c.ratio = 1; prepare(c); }
    return;
  }
  // A: 화면 가까이(320px) 오면 준비
  const ioPrepare = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      ioPrepare.unobserve(e.target);
      const card = follow.byEl.get(e.target);
      if (card) prepare(card);
    }
  }, { rootMargin: '320px 0px', threshold: 0 });
  // B: 보이는 비율 → 움직일 카드 고르기
  const ioRatio = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const card = follow.byEl.get(e.target);
      if (card) card.ratio = e.isIntersecting ? e.intersectionRatio : 0;
    }
    pickActive();
  }, { threshold: [0, 0.25, 0.5, 0.75, 1] });
  for (const c of follow.cards) { ioPrepare.observe(c.el); ioRatio.observe(c.el); }
}

/** 용도 필터 칩: 전체 + CASE_CATEGORIES 순서, 개수 표시. 고른 용도는 store 'followFilter' 에 기억합니다. */
function renderFilter() {
  const box = $('#followFilter');
  if (!box) return;
  box.textContent = '';
  for (const k of [{ id: 'all', label: '전체' }, ...CASE_CATEGORIES]) {
    const n = casesByCategory(k.id).length;
    const b = el('button', 'chipbtn');
    b.type = 'button';
    b.dataset.cat = k.id;
    b.setAttribute('aria-pressed', 'false');
    b.append(document.createTextNode(k.label), el('small', '', String(n)));
    b.disabled = n === 0;
    b.addEventListener('click', () => applyFilter(k.id, { remember: true }));
    box.append(b);
  }
}

/** 16:9 카드는 격자가 2열 이상일 때 두 칸(.wide)을 차지해 가로 미리보기가 작아지지 않게, 1:1 카드는 2열(폰)일 때만 — 옆의 9:16 폰보다 훨씬 낮아 카드 아래가 비기 때문.
 *  1열인데 span 2 를 주면 격자가 옆으로 넘치므로 실제 열 수를 보고 붙입니다. */
function fitWideCards(grid) {
  if (!grid.clientWidth) return; // 화면이 숨겨져 있으면 열 수를 알 수 없음(보이면 ResizeObserver 가 다시 부름)
  const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
  const wide = (c) => (c.data.aspect === '16:9' ? cols >= 2 : c.data.aspect === '1:1' ? cols === 2 : false);
  for (const c of follow.cards) c.el.classList.toggle('wide', wide(c));
}

function applyFilter(id, { remember = false } = {}) {
  if (id !== 'all' && !CASE_CATEGORIES.some((k) => k.id === id)) id = 'all';
  for (const b of document.querySelectorAll('#followFilter .chipbtn')) b.setAttribute('aria-pressed', String(b.dataset.cat === id));
  for (const c of follow.cards) c.el.hidden = !(id === 'all' || c.data.category === id);
  if (remember) store.set('followFilter', id);
  pickActive();
}

/** 「따라하기 사례」 갤러리 채우기 — 카드 DOM·필터·살아 있는 미리보기. 예외는 경고만 남기고 나머지 화면은 그대로 둡니다. */
function fillFollowGallery() {
  try {
    for (const node of document.querySelectorAll('[data-case-count]')) node.textContent = String(CASE_DATA.length);
    const grid = $('#followGrid');
    if (!grid) return;
    grid.textContent = '';
    follow.cards = CASE_DATA.map((c, i) => {
      try { return buildCard(c, i); } catch (e) { console.warn('사례 카드', c.id, e); return null; }
    }).filter(Boolean);
    follow.byEl = new Map(follow.cards.map((c) => [c.el, c]));
    for (const c of follow.cards) grid.append(c.el);
    fitWideCards(grid);
    if (typeof ResizeObserver === 'function') new ResizeObserver(() => fitWideCards(grid)).observe(grid);
    else window.addEventListener('resize', () => fitWideCards(grid));
    renderFilter();
    applyFilter(store.get('followFilter', 'all'));
    observeCards();
    // 글꼴이 늦게 오면 준비된 카드의 정지 프레임을 다시 그린다(움직이는 카드는 루프가 그림)
    document.fonts?.ready?.then(() => { for (const c of follow.cards) if (c.ready && !c.active) drawStill(c); });
  } catch (e) {
    console.warn('따라하기 사례 갤러리', e);
  }
}

/** 주소가 #case-follow 로 바로 열렸을 때(hashchange 가 없어 main.js 가 스크롤하지 않음) 갤러리로 내려갑니다. 사용자가 이미 스크롤했으면 그대로 둡니다. */
function scrollToFollowIfAsked() {
  if (location.hash !== '#case-follow' || window.scrollY > 40) return;
  document.getElementById('case-follow')?.scrollIntoView({ behavior: 'auto', block: 'start' });
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
    const t = previewTime(ptl, { offset: 1.4 + (i % 3) * 0.9 });
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
  fillFollowGallery(); // 갤러리 DOM(제목·칩)은 revealOnScroll·popIn 전에 있어야 한다
  await fillStyleWall();
  await fillComposeCase();
  revealOnScroll(document.getElementById('view-showcase'));
  wireCaseDots();
  wirePause();
  popIn(document.querySelectorAll('#heroChips .chip'), { delay: 500 });
  const cnt = $('#caseStyleCount');
  if (cnt) countUp(cnt, Number(cnt.textContent) || styles.length);
  // 첫 프레임은 바로 그려 둔다(정지 상태에서도 보이게)
  for (const id of ['heroCanvas', 'caseShortsCanvas']) {
    const c = document.getElementById(id);
    if (c) drawFrame(c.getContext('2d'), heroProject, c.width, c.height, 1.2, tl);
  }
  scrollToFollowIfAsked();
}
