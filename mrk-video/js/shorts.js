// 01 숏폼 영상 만들기 — 스타일 갤러리, 장면 편집, 미리보기 재생, 소리, 내보내기(한 편 / 20가지 전부), 바로 올리기

import {
  $, clamp, debounce, formatTime, srtTime, uid, store, toast, wireDrop,
  imageFromFile, loadImage, safeFileName, canvasToBlob, readAsDataURL, drawImageFit,
} from './util.js';
import { FONTS, dims, buildTimeline, segmentAt, drawFrame, ensureFonts, buildSrt, plainText } from './shorts-render.js';
import { pickMime, exportProject, exportStyles } from './export.js';
import { inArtifact, saveBlob, openSink, copyText, aiAvailable, generateScript, serverInfo, findViralShorts, youtubeSearchUrl } from './platform.js';
import { SCRIPT_STYLES } from './script-prompt.js';
import { sample, SHORTS_CASE } from './samples.js';
import { popIn } from './motion.js';

const SETTINGS_KEYS = [
  'aspect', 'template', 'font', 'captionSize', 'captionStyle', 'captionAnim', 'overlay', 'titleMode', 'motion', 'transition',
  'textColor', 'highlightColor', 'bandColor', 'panelColor', 'inkColor', 'showProgress', 'title', 'channel', 'ending',
  'bgmVolume', 'narrVolume', 'quality', 'style',
];

const DEFAULTS = {
  aspect: '9:16',
  template: 'band',
  font: '900',
  captionSize: 68,
  captionStyle: 'outline',
  captionAnim: 'none',
  overlay: 'none',
  titleMode: 'band',
  motion: 'auto',
  transition: 'fade',
  textColor: '#ffffff',
  highlightColor: '#ffd43b',
  bandColor: '#0b0d14',
  panelColor: '#ffffff',
  inkColor: '#111111',
  showProgress: true,
  title: SHORTS_CASE.title,
  channel: 'MR.K 고상철',
  ending: { enabled: true, text: '*구독*하고\n땅 공부 같이 해요', sub: 'MR.K 고상철 · 부동산 AI', duration: 2.5 },
  bgmVolume: 0.35,
  narrVolume: 1,
  quality: '1080',
  style: '',
};

const project = {
  ...structuredClone(DEFAULTS),
  ...pickSettings(store.get('shorts', {})),
  scenes: [],
  logo: null,
};
project.ending = { ...DEFAULTS.ending, ...(project.ending || {}) };

const audio = { bgm: null, narr: null }; // { name, buffer }
let uploadInfo = null; // AI가 만든 업로드용 제목·설명·해시태그
let tl = buildTimeline(project);
let curT = 0;
let playing = null; // { t0, from, stopAudio }
let exporting = null; // { abort }
let batch = null; // { abort, results }
let lastBatch = []; // 마지막으로 만든 20가지 결과
let resultBlob = null;
let resultExt = 'mp4';
let resultMeta = null; // { W, H, duration }
let STYLES = [];
let viralRef = ''; // 빵터진 영상에서 고른 참고 제목

function pickSettings(obj) {
  const out = {};
  for (const k of SETTINGS_KEYS) if (obj && obj[k] !== undefined) out[k] = obj[k];
  return out;
}
const persist = debounce(() => store.set('shorts', pickSettings(project)), 300);

// ── 장면 ─────────────────────────────────────────────
function defaultDuration(scene) {
  if (scene.img) return 3;
  const len = plainText(scene.caption).length;
  return Math.round(clamp(1.8 + len * 0.09, 2.5, 6) * 10) / 10;
}

function newScene(img = null, caption = '', extra = {}) {
  const s = { id: uid(), img, caption, duration: 3, kind: 'normal', ...extra };
  if (extra.duration == null) s.duration = defaultDuration(s);
  return s;
}

const allSamples = () => project.scenes.length > 0 && project.scenes.every((s) => s.sample);
function dropSamples() {
  if (allSamples()) project.scenes = [];
}

async function addImageFiles(files) {
  const imgs = files.filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(f.name));
  if (!imgs.length) return toast('이미지 파일만 넣을 수 있습니다.');
  dropSamples();
  imgs.sort((a, b) => a.name.localeCompare(b.name, 'ko', { numeric: true }));
  let fails = 0;
  for (const f of imgs) {
    try {
      project.scenes.push(newScene(await imageFromFile(f), ''));
    } catch { fails++; }
  }
  changed(true);
  toast(`사진 ${imgs.length - fails}장을 장면으로 넣었습니다.${fails ? ` (${fails}장은 열지 못함)` : ''}`);
}

function applyLines(lines, hints = []) {
  lines = lines.map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return toast('대본이 비어 있습니다. 한 줄에 한 장면씩 적어 주세요.');
  dropSamples();
  lines.forEach((line, i) => {
    const s = project.scenes[i];
    if (s) {
      s.caption = line;
      s.hint = hints[i] || s.hint;
      if (!s.img) s.duration = defaultDuration(s);
    } else {
      project.scenes.push(newScene(null, line, { hint: hints[i] || '' }));
    }
  });
  if (project.scenes[0] && project.scenes[0].kind === 'normal') project.scenes[0].kind = 'hook';
  changed(true);
  toast(`대본 ${lines.length}줄을 장면 자막에 넣었습니다.`);
}

function moveScene(i, d) {
  const j = i + d;
  if (j < 0 || j >= project.scenes.length) return;
  const arr = project.scenes;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  changed(true);
}

const KINDS = [['normal', '보통'], ['hook', '훅(첫 장면)'], ['answer', '정답·결론'], ['cta', '마무리']];

function renderScenes() {
  const list = $('#sceneList');
  list.textContent = '';
  project.scenes.forEach((s, i) => {
    const li = document.createElement('li');
    li.className = 'scene';
    li.dataset.id = s.id;

    const no = document.createElement('span');
    no.className = 'scene-no';
    no.textContent = String(i + 1).padStart(2, '0');

    const thumb = document.createElement('button');
    thumb.type = 'button';
    thumb.className = 'scene-thumb';
    thumb.title = '사진 바꾸기';
    if (s.img) {
      const im = document.createElement('img');
      im.src = s.img.src;
      im.alt = '';
      thumb.append(im);
    } else {
      thumb.textContent = '글자\n장면';
    }
    thumb.addEventListener('click', () => pickReplacement(s));

    const body = document.createElement('div');
    body.className = 'scene-body';
    const ta = document.createElement('textarea');
    ta.rows = 2;
    ta.value = s.caption;
    ta.placeholder = s.img ? '이 장면의 자막 (비워 두면 자막 없음)' : '화면 가운데 크게 나올 글';
    ta.setAttribute('aria-label', `${i + 1}번 장면 자막`);
    ta.addEventListener('input', () => { s.caption = ta.value; changed(false); });
    ta.addEventListener('focus', () => seek(tl.segs[i]?.start + 0.6 || 0));

    const meta = document.createElement('div');
    meta.className = 'scene-meta';
    const dur = document.createElement('input');
    dur.type = 'number';
    dur.min = '0.5';
    dur.max = '30';
    dur.step = '0.1';
    dur.value = s.duration;
    dur.setAttribute('aria-label', `${i + 1}번 장면 길이(초)`);
    dur.addEventListener('input', () => { s.duration = clamp(Number(dur.value) || 3, 0.5, 30); changed(false); });
    const kind = document.createElement('select');
    kind.setAttribute('aria-label', `${i + 1}번 장면 종류`);
    for (const [v, l] of KINDS) kind.append(new Option(l, v));
    kind.value = s.kind || 'normal';
    kind.addEventListener('input', () => { s.kind = kind.value; changed(false); });
    const tag = document.createElement('input');
    tag.type = 'text';
    tag.value = s.tag || '';
    tag.placeholder = '태그(가격·날짜)';
    tag.style.width = '110px';
    tag.setAttribute('aria-label', `${i + 1}번 장면 태그`);
    tag.addEventListener('input', () => { s.tag = tag.value; changed(false); });
    meta.append(dur, document.createTextNode('초'), kind, tag);
    if (s.sample) {
      const t = document.createElement('span');
      t.className = 'tag';
      t.textContent = '예시';
      meta.append(t);
    }
    if (s.hint) {
      const hint = document.createElement('span');
      hint.textContent = `사진 제안: ${s.hint}`;
      meta.append(hint);
    }
    body.append(ta, meta);

    const tools = document.createElement('div');
    tools.className = 'scene-tools';
    const mk = (label, title, fn, cls = '') => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `btn small ghost ${cls}`;
      b.textContent = label;
      b.title = title;
      b.setAttribute('aria-label', `${i + 1}번 장면 ${title}`);
      b.addEventListener('click', fn);
      return b;
    };
    tools.append(
      mk('↑', '위로', () => moveScene(i, -1)),
      mk('↓', '아래로', () => moveScene(i, 1)),
      mk('✕', '지우기', () => { project.scenes.splice(i, 1); changed(true); }, 'danger'),
    );
    li.append(no, thumb, body, tools);
    list.append(li);
  });
  $('#sceneSummary').textContent = project.scenes.length ? `${project.scenes.length}개 장면 · 총 ${tl.total.toFixed(1)}초` : '';
  markCurrentScene();
}

const replaceInput = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*', hidden: true });
let replaceTarget = null;
replaceInput.addEventListener('change', async () => {
  const f = replaceInput.files?.[0];
  replaceInput.value = '';
  if (!f || !replaceTarget) return;
  try {
    replaceTarget.img = await imageFromFile(f);
    replaceTarget.sample = false;
    changed(true);
  } catch (e) { toast(e.message); }
});
function pickReplacement(scene) {
  replaceTarget = scene;
  replaceInput.click();
}

function markCurrentScene() {
  const i = tl.segs.length ? segmentAt(tl, curT) : -1;
  const seg = tl.segs[i];
  const id = seg?.kind === 'scene' ? seg.scene.id : null;
  for (const li of $('#sceneList').children) li.classList.toggle('current', li.dataset.id === id);
}

// ── 변경 처리 ─────────────────────────────────────────
function changed(structural) {
  tl = buildTimeline(project);
  if (structural) renderScenes();
  else $('#sceneSummary').textContent = project.scenes.length ? `${project.scenes.length}개 장면 · 총 ${tl.total.toFixed(1)}초` : '';
  curT = Math.min(curT, Math.max(0, tl.total - 0.01));
  persist();
  refreshFonts();
  draw();
  scheduleStripRender();
  $('#fitToNarr').disabled = !audio.narr || !project.scenes.length;
}

const refreshFonts = debounce(async () => { await ensureFonts(project); draw(); }, 250);

// ── 미리보기 ─────────────────────────────────────────
const pv = () => $('#previewCanvas');

function sizePreview() {
  const { W, H } = dims(project.aspect, '1080');
  const c = pv();
  const w = Math.round(W * 0.5);
  const h = Math.round(H * 0.5);
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
}

function draw() {
  const c = pv();
  try {
    drawFrame(c.getContext('2d'), project, c.width, c.height, curT, tl);
  } catch (e) { console.error('draw', e); }
  $('#timecode').textContent = `${formatTime(curT)} / ${formatTime(tl.total)}`;
  if (!playing) $('#scrub').value = tl.total ? Math.round((curT / tl.total) * 1000) : 0;
  markCurrentScene();
}

function seek(t) {
  if (playing) stopPlayback();
  curT = clamp(t, 0, Math.max(0, tl.total - 0.01));
  draw();
}

function startPlayback() {
  if (!tl.total) return;
  if (curT >= tl.total - 0.05) curT = 0;
  const from = curT;
  const stopAudio = startAudio(audioCtx().destination, from, tl.total);
  playing = { t0: performance.now(), from, stopAudio };
  $('#playBtn').textContent = '❚❚';
  $('#playBtn').setAttribute('aria-label', '일시정지');
  const loop = () => {
    if (!playing) return;
    curT = playing.from + (performance.now() - playing.t0) / 1000;
    if (curT >= tl.total) { curT = tl.total - 0.01; draw(); stopPlayback(); return; }
    draw();
    $('#scrub').value = Math.round((curT / tl.total) * 1000);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

function stopPlayback() {
  playing?.stopAudio?.();
  playing = null;
  $('#playBtn').textContent = '▶';
  $('#playBtn').setAttribute('aria-label', '재생');
}

// ── 소리 ─────────────────────────────────────────────
let ac;
function audioCtx() {
  ac ??= new (window.AudioContext || window.webkitAudioContext)();
  if (ac.state === 'suspended') ac.resume().catch(() => {});
  return ac;
}

async function loadAudioFile(file) {
  const buf = await file.arrayBuffer();
  return audioCtx().decodeAudioData(buf);
}

/** offset초부터 total초까지 배경음악·내레이션을 dest로 보냅니다. 멈추는 함수를 돌려줍니다. */
function startAudio(dest, offset, total) {
  if (!audio.bgm && !audio.narr) return () => {};
  const ctx = audioCtx();
  const now = ctx.currentTime + 0.05;
  const remain = Math.max(0.1, total - offset);
  const nodes = [];
  if (audio.bgm) {
    const src = ctx.createBufferSource();
    src.buffer = audio.bgm.buffer;
    src.loop = true;
    const g = ctx.createGain();
    const vol = project.bgmVolume;
    g.gain.setValueAtTime(vol, now);
    const fadeAt = now + Math.max(0, remain - 1.5);
    g.gain.setValueAtTime(vol, fadeAt);
    g.gain.linearRampToValueAtTime(0.0001, now + remain);
    src.connect(g).connect(dest);
    src.start(now, offset % src.buffer.duration);
    src.stop(now + remain + 0.05);
    nodes.push(src);
  }
  if (audio.narr && offset < audio.narr.buffer.duration) {
    const src = ctx.createBufferSource();
    src.buffer = audio.narr.buffer;
    const g = ctx.createGain();
    g.gain.value = project.narrVolume;
    src.connect(g).connect(dest);
    src.start(now, offset);
    src.stop(now + remain + 0.05);
    nodes.push(src);
  }
  return () => nodes.forEach((n) => { try { n.stop(); } catch { /* 이미 멈춤 */ } });
}

function renderAudioInfo() {
  const parts = [];
  if (audio.bgm) parts.push(`배경음악 ${audio.bgm.name} (${formatTime(audio.bgm.buffer.duration)})`);
  if (audio.narr) parts.push(`내레이션 ${audio.narr.name} (${formatTime(audio.narr.buffer.duration)})`);
  $('#audioInfo').textContent = parts.length ? parts.join(' · ') : '소리 파일이 없으면 무음 영상이 만들어집니다.';
  $('#fitToNarr').disabled = !audio.narr || !project.scenes.length;
}

function fitToNarration() {
  if (!audio.narr || !project.scenes.length) return;
  const target = audio.narr.buffer.duration + 0.4;
  const weights = project.scenes.map((s) => Math.max(8, plainText(s.caption).length));
  const sum = weights.reduce((a, b) => a + b, 0);
  project.scenes.forEach((s, i) => { s.duration = Math.max(0.8, Math.round(((target * weights[i]) / sum) * 10) / 10); });
  changed(true);
  toast(`장면 길이를 내레이션 ${target.toFixed(1)}초에 맞췄습니다(자막 글자 수 비율).`);
}

// ── 스타일 갤러리 ─────────────────────────────────────
function previewProject() {
  return { ...project, scenes: project.scenes.map((s) => ({ ...s })) };
}

function currentStyle() {
  return STYLES.find((s) => s.id === project.style) || null;
}

function renderStyleDesc() {
  const box = $('#styleDesc');
  box.textContent = '';
  const st = currentStyle();
  if (!st) {
    box.textContent = STYLES.length ? '스타일을 누르면 미리보기가 그 형식으로 바뀝니다.' : '스타일 데이터를 불러오지 못했습니다. 세부 조절로 직접 꾸밀 수 있습니다.';
    return;
  }
  const b = document.createElement('b');
  b.textContent = st.name;
  const why = document.createElement('span');
  why.textContent = `${st.ref?.format || ''} — ${st.ref?.why || st.tagline || ''}`;
  const plat = document.createElement('span');
  plat.textContent = `잘 맞는 곳: ${(st.platforms || []).map(platformLabel).join(' · ')}`;
  const a = document.createElement('a');
  a.href = youtubeSearchUrl(st.ref?.search || st.name);
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = '이 형식의 잘 나가는 영상 보기 ↗';
  box.append(b, why, plat, a);
}

function renderStyleStrip() {
  const strip = $('#styleStrip');
  strip.textContent = '';
  $('#styleCount').textContent = STYLES.length ? `${STYLES.length}가지` : '';
  STYLES.forEach((st, i) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'style-card';
    card.setAttribute('role', 'option');
    card.dataset.id = st.id;
    card.setAttribute('aria-selected', String(project.style === st.id));
    const no = document.createElement('span');
    no.className = 'no';
    no.textContent = String(i + 1).padStart(2, '0');
    const c = document.createElement('canvas');
    c.width = 216;
    c.height = 384;
    const name = document.createElement('b');
    name.textContent = st.name;
    const tag = document.createElement('small');
    tag.textContent = st.tagline || st.ref?.format || '';
    const pick = document.createElement('span');
    pick.className = 'pick';
    pick.textContent = '✓';
    card.append(no, c, name, tag, pick);
    card.addEventListener('click', () => applyStyle(st));
    strip.append(card);
  });
  renderStyleDesc();
  renderStripThumbs();
}

let stripJob = 0;
function renderStripThumbs() {
  const job = ++stripJob;
  const cards = [...document.querySelectorAll('#styleStrip .style-card')];
  const base = previewProject();
  let i = 0;
  const step = () => {
    if (job !== stripJob) return;
    const t0 = performance.now();
    while (i < cards.length && performance.now() - t0 < 12) {
      const card = cards[i++];
      const st = STYLES.find((s) => s.id === card.dataset.id);
      const c = card.querySelector('canvas');
      if (!st || !c) continue;
      try {
        const p = st.apply({ ...base, scenes: base.scenes.map((s) => ({ ...s })) });
        const ptl = buildTimeline(p);
        const t = clamp(1.4, 0, Math.max(0.05, ptl.total - 0.1));
        drawFrame(c.getContext('2d'), p, c.width, c.height, t, ptl);
      } catch (e) { console.warn('style thumb', st.id, e); }
    }
    if (i < cards.length) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
const scheduleStripRender = debounce(renderStripThumbs, 400);

function applyStyle(st) {
  st.apply(project);
  project.style = st.id;
  for (const card of document.querySelectorAll('#styleStrip .style-card')) card.setAttribute('aria-selected', String(card.dataset.id === st.id));
  const finish = () => {
    sizePreview();
    syncControls();
    renderStyleDesc();
    changed(true);
    $('#exportBtn').textContent = `"${st.name.split(' — ')[0]}" 스타일로 영상 만들기`;
  };
  // 예시 장면뿐이면 스타일의 예시 장면으로 바꿔 보여 준다
  if (allSamples() && st.sample?.scenes?.length) loadStyleSample(st).then(finish);
  else finish();
  toast(`스타일: ${st.name}`);
}

async function loadStyleSample(st) {
  const scenes = [];
  for (const s of st.sample.scenes) {
    scenes.push(newScene(s.img ? await sample(s.img) : null, s.caption, { duration: s.duration, kind: s.kind || 'normal', tag: s.tag, label: s.label, sample: true }));
  }
  project.scenes = scenes;
  if (st.sample.title) { project.title = st.sample.title; $('#title').value = project.title; }
}

// ── 빵터진 영상 찾기 ──────────────────────────────────
function fmtViews(n) {
  if (n >= 1e8) return `${(n / 1e8).toFixed(1)}억`;
  if (n >= 1e4) return `${Math.round(n / 1e4)}만`;
  return String(n);
}

async function runViral() {
  const topic = $('#viralTopic').value.trim();
  if (!topic) { $('#viralTopic').focus(); return toast('주제를 넣어 주세요.'); }
  const grid = $('#viralGrid');
  const hint = $('#viralHint');
  grid.textContent = '';
  hint.textContent = '찾는 중…';
  try {
    const list = await findViralShorts(topic);
    if (list === null) {
      hint.textContent = '이 환경에는 유튜브 검색이 없어 유튜브 검색 결과를 새 탭으로 엽니다. 마음에 드는 영상 제목을 AI 대본 주제 칸에 붙여 넣으면 그 컨셉으로 대본을 씁니다.';
      const a = document.createElement('a');
      a.className = 'btn small accent';
      a.href = youtubeSearchUrl(topic);
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = `유튜브에서 "${topic}" 인기 쇼츠 보기 ↗`;
      grid.append(a);
      return;
    }
    if (!list.length) { hint.textContent = '찾은 영상이 없습니다. 주제를 더 넓게 써 보세요.'; return; }
    hint.textContent = `최근 1년 조회수 순 ${list.length}개. 영상을 누르면 그 컨셉으로 AI 대본을 씁니다.`;
    for (const v of list) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'vcard';
      const im = document.createElement('img');
      im.src = v.thumb;
      im.alt = '';
      im.loading = 'lazy';
      const b = document.createElement('b');
      b.textContent = v.title;
      const s = document.createElement('small');
      const views = document.createElement('span');
      views.className = 'views';
      views.textContent = `${fmtViews(v.views)}회`;
      s.append(views, document.createTextNode(` · ${v.channel}`));
      const open = document.createElement('a');
      open.href = v.url;
      open.target = '_blank';
      open.rel = 'noopener';
      open.className = 'hint';
      open.textContent = '영상 열기 ↗';
      open.addEventListener('click', (e) => e.stopPropagation());
      card.append(im, b, s, open);
      card.addEventListener('click', () => useViral(v));
      grid.append(card);
    }
    popIn(grid.children, { stagger: 40 });
  } catch (e) {
    hint.textContent = e.message || '유튜브 검색에 실패했습니다.';
  }
}

async function useViral(v) {
  viralRef = `${v.title} (${v.channel}, ${fmtViews(v.views)}회)`;
  $('#aiTopic').value = `${$('#viralTopic').value.trim()} — "${v.title}" 컨셉으로`;
  toast('이 영상 컨셉을 참고합니다. AI 대본을 쓰면 비슷한 구성으로 나옵니다.');
  if (await aiAvailable()) runAI();
  else $('#aiTopic').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ── 내보내기(한 편) ───────────────────────────────────
async function exportVideo() {
  if (exporting) { exporting.abort.abort(); return; }
  if (!project.scenes.length) return toast('장면이 없습니다. 사진이나 대본을 먼저 넣어 주세요.');
  stopPlayback();
  const btn = $('#exportBtn');
  const bar = $('#exportProgress');
  const status = $('#exportStatus');
  const label = btn.textContent;
  $('#exportResult').hidden = true;
  btn.textContent = '만들기 멈춤';
  bar.hidden = false;
  bar.classList.add('rec');
  status.textContent = '글꼴과 사진을 준비하는 중…';
  const abort = new AbortController();
  exporting = { abort };
  try {
    const withAudio = !!(audio.bgm || audio.narr);
    const r = await exportProject({
      project,
      quality: project.quality,
      startAudio: withAudio ? startAudio : null,
      audioCtx: withAudio ? audioCtx() : null,
      signal: abort.signal,
      onProgress: ({ t, total, text }) => {
        bar.firstElementChild.style.transform = `scaleX(${t / total})`;
        status.textContent = `${text} — 이 탭을 띄워 두세요.`;
      },
    });
    showResult(r);
    status.textContent = `완성: ${r.ext.toUpperCase()} · ${r.W}×${r.H} · ${(r.blob.size / 1048576).toFixed(1)}MB · ${formatTime(r.duration)}`;
    toast('영상이 완성됐습니다. “영상 파일 저장”을 누르세요.');
  } catch (e) {
    if (e?.name === 'AbortError') status.textContent = '만들기를 멈췄습니다.';
    else { console.error(e); status.textContent = `영상을 만들지 못했습니다: ${e.message || e}`; }
  } finally {
    exporting = null;
    btn.textContent = label;
    bar.classList.remove('rec');
    setTimeout(() => { bar.hidden = true; bar.firstElementChild.style.transform = 'scaleX(0)'; }, 600);
  }
}

function showResult(r) {
  resultExt = r.ext;
  resultBlob = r.blob;
  resultMeta = { W: r.W, H: r.H, duration: r.duration };
  const v = $('#resultVideo');
  if (v.src) URL.revokeObjectURL(v.src);
  v.src = URL.createObjectURL(resultBlob);
  $('#exportResult').hidden = false;
  renderUploadPanel();
}

function videoFileName(ext = resultExt, suffix = '') {
  const first = plainText(project.title).split('\n').map((s) => s.trim()).filter(Boolean).join(' ');
  return `${safeFileName(first || 'MRK-shorts')}${suffix}.${ext}`;
}

// ── 내보내기(20가지 전부) ─────────────────────────────
async function exportAllStyles() {
  if (batch) { batch.abort.abort(); return; }
  if (!STYLES.length) return toast('스타일 데이터가 없습니다.');
  if (!project.scenes.length) return toast('장면이 없습니다. 사진이나 대본을 먼저 넣어 주세요.');
  stopPlayback();
  const panel = $('#batchPanel');
  const bar = $('#batchProgress');
  const status = $('#batchStatus');
  const zipBtn = $('#batchZip');
  panel.hidden = false;
  $('#batchList').textContent = '';
  zipBtn.disabled = true;
  $('#batchHint').textContent = '';
  const abort = new AbortController();
  batch = { abort, results: [] };
  $('#styleBatchBtn').textContent = '멈춤';
  status.textContent = `${STYLES.length}가지 × ${tl.total.toFixed(0)}초 ≈ ${formatTime(tl.total * STYLES.length)} 걸립니다. 이 탭을 띄워 두세요.`;
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  const withAudio = !!(audio.bgm || audio.narr);
  // 한 스타일씩 돌려서, 중간에 멈춰도 그때까지 만든 것은 남깁니다.
  for (let i = 0; i < STYLES.length; i++) {
    if (abort.signal.aborted) break;
    const st = STYLES[i];
    try {
      const [r] = await exportStyles({
        project, styles: [st], quality: project.quality,
        startAudio: withAudio ? startAudio : null,
        audioCtx: withAudio ? audioCtx() : null,
        signal: abort.signal,
        onProgress: ({ t, total }) => {
          bar.firstElementChild.style.transform = `scaleX(${(i + t / total) / STYLES.length})`;
          status.textContent = `${i + 1}/${STYLES.length} ${st.name} — ${formatTime(t)} / ${formatTime(total)}`;
        },
      });
      if (r) { batch.results.push(r); renderBatchList(batch.results); }
    } catch (e) {
      if (e?.name === 'AbortError') break;
      console.error(e);
      toast(`${st.name}: ${e.message || e}`);
    }
  }
  const results = batch.results;
  lastBatch = results;
  status.textContent = results.length ? `${results.length}개 완성. 하나씩 저장하거나 ZIP으로 한 번에 저장하세요.` : '만든 영상이 없습니다.';
  zipBtn.disabled = !results.length;
  $('#styleBatchBtn').textContent = '20가지 전부 만들기';
  batch = null;
  if (results.length) { showResult(results[0]); toast(`${results.length}가지 스타일 영상이 완성됐습니다.`); }
}

function renderBatchList(results) {
  const list = $('#batchList');
  list.textContent = '';
  results.forEach((r, i) => {
    const item = document.createElement('div');
    item.className = 'result-item';
    const no = document.createElement('span');
    no.className = 'tag';
    no.textContent = String(i + 1).padStart(2, '0');
    const name = document.createElement('b');
    name.textContent = r.style.name;
    const meta = document.createElement('span');
    meta.className = 'meta';
    meta.textContent = `${(r.blob.size / 1048576).toFixed(1)}MB`;
    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'btn small ghost';
    play.textContent = '보기';
    play.addEventListener('click', () => { showResult(r); $('#resultVideo').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'btn small';
    save.textContent = '저장';
    save.addEventListener('click', async () => {
      try { await saveBlob(r.blob, videoFileName(r.ext, `-${String(i + 1).padStart(2, '0')}-${r.style.id}`)); } catch (e) { toast(e.message); }
    });
    item.append(no, name, meta, play, save);
    list.append(item);
  });
  if (results.length) popIn([list.lastElementChild]);
}

async function saveBatchZip() {
  const results = lastBatch;
  if (!results.length) return;
  let sink;
  try {
    sink = await openSink('zip', videoFileName('zip', `-스타일${results.length}가지`));
  } catch (e) { return toast(e.message || 'ZIP을 만들지 못했습니다.'); }
  $('#batchHint').textContent = 'ZIP을 묶는 중…';
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    await sink.add(`${String(i + 1).padStart(2, '0')}-${r.style.id}.${r.ext}`, r.blob);
  }
  await sink.add('업로드용-글.txt', new Blob([uploadTextOf()], { type: 'text/plain' }));
  await sink.add('자막.srt', new Blob([buildSrt(project, srtTime)], { type: 'text/plain' }));
  try {
    const saved = await sink.finish();
    $('#batchHint').textContent = saved === false ? '저장을 취소했습니다.' : `${results.length}개를 ZIP으로 저장했습니다.`;
  } catch (e) { $('#batchHint').textContent = e.message; }
}

// ── 바로 올리기 ───────────────────────────────────────
const PLATFORMS = [
  { key: 'youtube', name: '유튜브 쇼츠', color: '#ff0033', ic: 'YT', max: 60, size: 256, url: 'https://www.youtube.com/upload' },
  { key: 'instagram', name: '인스타그램 릴스', color: '#e1306c', ic: 'IG', max: 90, size: 1024, url: 'https://www.instagram.com/' },
  { key: 'tiktok', name: '틱톡', color: '#111111', ic: 'TT', max: 600, size: 4096, url: 'https://www.tiktok.com/upload' },
  { key: 'facebook', name: '페이스북 릴스', color: '#1877f2', ic: 'FB', max: 90, size: 4096, url: 'https://www.facebook.com/reels/create' },
  { key: 'threads', name: '쓰레드', color: '#222222', ic: 'TH', max: 300, size: 1024, url: 'https://www.threads.net/' },
];
const platformLabel = (k) => PLATFORMS.find((p) => p.key === k)?.name || k;

function renderUploadPanel() {
  const panel = $('#uploadPanel');
  const box = $('#plats');
  panel.hidden = false;
  box.textContent = '';
  const dur = resultMeta?.duration ?? tl.total;
  const sizeMB = resultBlob ? resultBlob.size / 1048576 : 0;
  const vertical = project.aspect === '9:16';
  for (const p of PLATFORMS) {
    const row = document.createElement('div');
    row.className = 'plat';
    const ic = document.createElement('span');
    ic.className = 'pi';
    ic.style.background = p.color;
    ic.textContent = p.ic;
    const txt = document.createElement('div');
    const b = document.createElement('b');
    b.textContent = p.name;
    const s = document.createElement('small');
    const problems = [];
    if (!vertical) problems.push('세로(9:16)가 아님');
    if (dur > p.max) problems.push(`길이 ${formatTime(dur)} > ${p.max}초`);
    if (sizeMB > p.size) problems.push(`용량 ${sizeMB.toFixed(0)}MB 초과`);
    s.className = problems.length ? 'warn' : 'ok';
    s.textContent = problems.length ? problems.join(' · ') : `규격 맞음 · ${formatTime(dur)} · ${resultExt.toUpperCase()}`;
    txt.append(b, s);
    const a = document.createElement('a');
    a.className = 'btn';
    a.href = p.url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = '업로드 화면 열기 ↗';
    row.append(ic, txt, a);
    box.append(row);
  }
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'btn small accent';
  copy.textContent = '제목·설명·해시태그 복사';
  copy.addEventListener('click', async () => toast((await copyText(uploadTextOf())) ? '복사했습니다. 업로드 화면에 붙여 넣으세요.' : '복사하지 못했습니다.'));
  box.append(copy);
}

function uploadTextOf() {
  const title = plainText(project.title).replace(/\n/g, ' ').trim();
  if (uploadInfo) return [plainText(uploadInfo.title || title).replace(/\n/g, ' '), '', uploadInfo.description || '', '', (uploadInfo.hashtags || []).join(' ')].join('\n').trim();
  const words = project.scenes.flatMap((s) => (s.caption.match(/\*([^*]+)\*/g) || []).map((w) => '#' + w.replace(/\*/g, '').replace(/\s+/g, '')));
  return [title, '', `${project.channel} — 부동산 공법·토지·부동산 AI`, '', [...new Set(['#부동산', '#공법의신', '#쇼츠', ...words])].join(' ')].join('\n');
}

// ── 프로젝트 저장/열기 ────────────────────────────────
async function imageToDataURL(img, max = 1600) {
  if (!img) return null;
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const s = Math.min(1, max / Math.max(iw, ih));
  const c = document.createElement('canvas');
  c.width = Math.round(iw * s);
  c.height = Math.round(ih * s);
  drawImageFit(c.getContext('2d'), img, 0, 0, c.width, c.height, 'contain');
  return readAsDataURL(await canvasToBlob(c, 'image/jpeg', 0.86));
}

async function saveProject() {
  const data = {
    app: 'mrk-video',
    version: 2,
    savedAt: new Date().toISOString(),
    settings: pickSettings(project),
    logo: project.logo ? await imageToDataURL(project.logo, 600) : null,
    uploadInfo,
    scenes: await Promise.all(project.scenes.map(async (s) => ({
      caption: s.caption, duration: s.duration, hint: s.hint || '', sample: !!s.sample, kind: s.kind || 'normal', tag: s.tag || '', label: s.label || '',
      image: await imageToDataURL(s.img),
    }))),
  };
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const name = `${safeFileName(plainText(project.title).split('\n')[0] || 'MRK')}-프로젝트.json`;
  try {
    if (await saveBlob(blob, name)) toast('프로젝트를 저장했습니다. 소리 파일은 들어가지 않습니다.');
  } catch (e) { toast(e.message); }
}

async function openProject(file) {
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== 'mrk-video') throw new Error('MR.K 영상만들기 프로젝트 파일이 아닙니다.');
    Object.assign(project, pickSettings(data.settings || {}));
    project.ending = { ...DEFAULTS.ending, ...(project.ending || {}) };
    project.logo = data.logo ? await loadImage(data.logo) : null;
    project.scenes = await Promise.all((data.scenes || []).map(async (s) => newScene(
      s.image ? await loadImage(s.image) : null,
      s.caption || '',
      { duration: s.duration, hint: s.hint, sample: s.sample, kind: s.kind || 'normal', tag: s.tag, label: s.label },
    )));
    uploadInfo = data.uploadInfo || null;
    syncControls();
    renderUploadInfo();
    sizePreview();
    changed(true);
    for (const card of document.querySelectorAll('#styleStrip .style-card')) card.setAttribute('aria-selected', String(card.dataset.id === project.style));
    renderStyleDesc();
    toast('프로젝트를 열었습니다.');
  } catch (e) {
    toast(e.message || '프로젝트를 열지 못했습니다.');
  }
}

// ── AI 대본 ───────────────────────────────────────────
function renderUploadInfo() {
  const box = $('#uploadInfo');
  if (!uploadInfo) { box.hidden = true; return; }
  box.hidden = false;
  $('#uploadText').textContent = uploadTextOf();
}

async function runAI() {
  const topic = $('#aiTopic').value.trim();
  if (!topic) { $('#aiTopic').focus(); return toast('주제를 먼저 적어 주세요.'); }
  const btn = $('#aiRun');
  const status = $('#aiStatus');
  btn.disabled = true;
  status.textContent = 'AI가 대본을 쓰는 중… (보통 10~40초)';
  try {
    const st = currentStyle();
    const r = await generateScript({
      topic, style: $('#aiStyle').value, scenes: $('#aiScenes').value, channel: project.channel,
      styleName: st?.name || '',
      styleHint: st ? `${st.hook ? '훅: ' + st.hook + '. ' : ''}장면 뼈대: ${(st.beats || []).join(' → ')}. ${st.prompt || ''}` : '',
      reference: viralRef,
    });
    if (r.title) project.title = r.title;
    $('#title').value = project.title;
    $('#scriptText').value = r.scenes.map((s) => s.caption).join('\n');
    applyLines(r.scenes.map((s) => s.caption), r.scenes.map((s) => s.imageHint));
    uploadInfo = { title: r.title, description: r.description, hashtags: r.hashtags };
    renderUploadInfo();
    status.textContent = `장면 ${r.scenes.length}개를 만들었습니다. 법령·수치는 올리기 전에 꼭 확인하세요.`;
  } catch (e) {
    status.textContent = e.message;
  } finally {
    btn.disabled = false;
  }
}

// ── 설정 입력 연결 ─────────────────────────────────────
const BINDINGS = [
  ['aspect', 'aspect'], ['template', 'template'], ['font', 'font'],
  ['captionSize', 'captionSize', Number], ['captionStyle', 'captionStyle'], ['captionAnim', 'captionAnim'], ['overlay', 'overlay'], ['titleMode', 'titleMode'],
  ['motion', 'motion'], ['transition', 'transition'], ['textColor', 'textColor'], ['highlightColor', 'highlightColor'],
  ['bandColor', 'bandColor'], ['panelColor', 'panelColor'], ['inkColor', 'inkColor'], ['showProgress', 'showProgress', 'check'], ['title', 'title'],
  ['channel', 'channel'], ['quality', 'quality'],
  ['bgmVolume', 'bgmVolume', Number], ['narrVolume', 'narrVolume', Number],
];
const ENDING_BINDINGS = [
  ['endingOn', 'enabled', 'check'], ['endingText', 'text'], ['endingSub', 'sub'], ['endingDur', 'duration', Number],
];

function syncControls() {
  for (const [id, key, kind] of BINDINGS) {
    const el = document.getElementById(id);
    if (!el) continue;
    if (kind === 'check') { el.checked = !!project[key]; continue; }
    el.value = project[key] ?? DEFAULTS[key];
    if (el.tagName === 'SELECT' && el.value !== String(project[key] ?? '')) {
      // 저장된 값이 목록에 없으면(예전 글꼴 이름 등) 기본값으로
      el.value = String(DEFAULTS[key]);
      project[key] = DEFAULTS[key];
    }
  }
  for (const [id, key, kind] of ENDING_BINDINGS) {
    const el = document.getElementById(id);
    if (kind === 'check') el.checked = !!project.ending[key];
    else el.value = project.ending[key];
  }
  $('#bgmVolOut').textContent = `${Math.round(project.bgmVolume * 100)}%`;
  $('#narrVolOut').textContent = `${Math.round(project.narrVolume * 100)}%`;
}

function wireControls() {
  for (const [id, key, kind] of BINDINGS) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.addEventListener('input', () => {
      project[key] = kind === 'check' ? el.checked : kind ? kind(el.value) : el.value;
      if (key === 'aspect') sizePreview();
      if (key === 'bgmVolume' || key === 'narrVolume') syncControls();
      changed(false);
    });
  }
  for (const [id, key, kind] of ENDING_BINDINGS) {
    const el = document.getElementById(id);
    el.addEventListener('input', () => {
      project.ending[key] = kind === 'check' ? el.checked : kind ? kind(el.value) : el.value;
      changed(false);
    });
  }
}

// ── 시작 ─────────────────────────────────────────────
export async function initShorts() {
  const fontSel = $('#font');
  for (const f of FONTS) fontSel.append(new Option(f.label, f.id));
  if (!FONTS.some((f) => f.id === project.font)) project.font = FONTS[0]?.id ?? '900';
  const styleSel = $('#aiStyle');
  for (const [k, v] of Object.entries(SCRIPT_STYLES)) styleSel.append(new Option(v, k));
  document.body.append(replaceInput);

  try { ({ STYLES } = await import('./styles.js')); } catch (e) { console.warn('styles.js 없음', e); STYLES = []; }

  syncControls();
  wireControls();
  sizePreview();

  wireDrop($('#sceneDrop'), addImageFiles);
  $('#addTextScene').addEventListener('click', () => {
    dropSamples();
    project.scenes.push(newScene(null, '새 장면 — *핵심 단어*를 별표로 감싸세요'));
    changed(true);
  });
  $('#clearScenes').addEventListener('click', () => {
    if (!project.scenes.length) return;
    project.scenes = [];
    changed(true);
    toast('장면을 모두 지웠습니다.');
  });
  $('#applyScript').addEventListener('click', () => applyLines($('#scriptText').value.split('\n')));

  $('#playBtn').addEventListener('click', () => (playing ? stopPlayback() : startPlayback()));
  $('#scrub').addEventListener('input', (e) => seek((Number(e.target.value) / 1000) * tl.total));

  $('#logoFile').addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try { project.logo = await imageFromFile(f); changed(false); } catch (err) { toast(err.message); }
  });

  const onAudio = (slot, input) => input.addEventListener('change', async () => {
    const f = input.files?.[0];
    if (!f) return;
    try {
      audio[slot] = { name: f.name, buffer: await loadAudioFile(f) };
      renderAudioInfo();
    } catch {
      toast(`${f.name}: 소리 파일을 읽지 못했습니다. mp3·m4a·wav를 써 주세요.`);
    }
  });
  onAudio('bgm', $('#bgmFile'));
  onAudio('narr', $('#narrFile'));
  $('#clearAudio').addEventListener('click', () => {
    audio.bgm = null;
    audio.narr = null;
    $('#bgmFile').value = '';
    $('#narrFile').value = '';
    renderAudioInfo();
  });
  $('#fitToNarr').addEventListener('click', fitToNarration);

  const mime = pickMime(true) || pickMime(false);
  $('#mimeOut').textContent = mime ? (mime.startsWith('video/mp4') ? 'MP4' : 'WEBM') : '지원 안 됨';
  $('#exportBtn').addEventListener('click', exportVideo);
  $('#saveVideo').addEventListener('click', async () => {
    if (!resultBlob) return;
    try {
      if (await saveBlob(resultBlob, videoFileName())) toast('영상 파일을 저장했습니다. “바로 올리기”에서 플랫폼을 고르세요.');
    } catch (e) { toast(e.message); }
  });
  $('#copySrt').addEventListener('click', async () => {
    const ok = await copyText(buildSrt(project, srtTime));
    toast(ok ? '자막(SRT)을 복사했습니다. 메모장에 붙여 넣고 .srt로 저장하면 됩니다.' : '복사하지 못했습니다.');
  });
  // .srt는 아티팩트 저장 허용 형식이 아니라서 그 화면에서는 복사만 제공합니다.
  $('#saveSrt').hidden = inArtifact;
  $('#saveSrt').addEventListener('click', async () => {
    try { await saveBlob(new Blob([buildSrt(project, srtTime)], { type: 'text/plain' }), videoFileName('srt')); } catch (e) { toast(e.message); }
  });
  $('#copyUpload').addEventListener('click', async () => {
    toast((await copyText($('#uploadText').textContent)) ? '업로드용 글을 복사했습니다.' : '복사하지 못했습니다.');
  });

  $('#styleBatchBtn').addEventListener('click', exportAllStyles);
  $('#batchStop').addEventListener('click', () => batch?.abort.abort());
  $('#batchZip').addEventListener('click', saveBatchZip);
  $('#viralToggle').addEventListener('click', () => {
    const box = $('#viralBox');
    box.hidden = !box.hidden;
    if (!box.hidden) $('#viralTopic').focus();
  });
  $('#viralRun').addEventListener('click', runViral);
  $('#viralTopic').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); runViral(); } });

  $('#projSaveBtn').addEventListener('click', saveProject);
  $('#projOpenBtn').addEventListener('click', () => $('#projFile').click());
  $('#projFile').addEventListener('change', (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) openProject(f);
  });

  // 첫 화면: 예시 장면(실사 예시 이미지, 없으면 그림)
  const scenes = [];
  for (const s of SHORTS_CASE.scenes) {
    scenes.push(newScene(s.img ? await sample(s.img) : null, s.caption, { sample: true, duration: s.duration, kind: 'normal' }));
  }
  if (scenes[0]) scenes[0].kind = 'hook';
  project.scenes = scenes;
  if (project.style && currentStyle()) {
    currentStyle().apply(project);
    syncControls();
    $('#exportBtn').textContent = `"${currentStyle().name.split(' — ')[0]}" 스타일로 영상 만들기`;
  }
  renderStyleStrip();
  changed(true);
  curT = 1.2;
  await ensureFonts(project);
  draw();
  if (document.fonts?.ready) document.fonts.ready.then(() => { draw(); renderStripThumbs(); });

  if (await aiAvailable()) $('#aiBox').hidden = false;
  serverInfo().then((info) => { if (!info.youtube) $('#viralToggle').textContent = '빵터진 영상 찾기 ↗'; });
}

export function pauseShorts() { stopPlayback(); }
