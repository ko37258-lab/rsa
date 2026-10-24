// 01 숏폼 영상 만들기 — 스타일 갤러리, 장면 편집, 미리보기 재생, 소리, 내보내기(한 편 / 모든 스타일 전부), 바로 올리기

import {
  $, clamp, debounce, formatTime, srtTime, uid, store, toast, wireDrop,
  imageFromFile, loadImage, safeFileName, canvasToBlob, readAsDataURL, drawImageFit,
} from './util.js';
import { FONTS, dims, buildTimeline, segmentAt, previewTime, drawFrame, ensureFonts, buildSrt, plainText } from './shorts-render.js';
import { pickMime, exportProject, exportStyles } from './export.js';
import { inArtifact, saveBlob, openSink, copyText, aiAvailable, generateScript, serverInfo, findViralShorts, youtubeSearchUrl } from './platform.js';
import { SCRIPT_STYLES } from './script-prompt.js';
import { sample, SHORTS_CASE } from './samples.js';
import { popIn } from './motion.js';
import { MOODS, renderMood, playMood } from './music.js';
import { PROVIDERS, providerOf, synthesize, MAX_TEXT } from './tts.js';
import { getKey, onKeysChange } from './keys.js';
import { initKeyBar, openKeyBar, initListing } from './listing.js';

const SETTINGS_KEYS = [
  'aspect', 'template', 'font', 'captionSize', 'captionStyle', 'captionAnim', 'overlay', 'titleMode', 'motion', 'transition',
  'textColor', 'highlightColor', 'bandColor', 'panelColor', 'inkColor', 'showProgress', 'title', 'channel', 'ending',
  'bgmVolume', 'narrVolume', 'quality', 'style', 'styleMusic',
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
  styleMusic: 'auto', // 'auto' = 스타일이 추천하는 분위기, 'off' = 끄기, 그 외 = music.js MOODS 의 id
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
let playPrep = false; // 재생 직전 스타일 음악 루프를 만드는 중(▶ 는 '…' 로 잠김)
let playJob = 0; // 준비 중 멈춤·화면 이동이 있었는지 가리는 번호
let musicPreview = null; // 스타일 음악 미리듣기 { handle, moodId }
let exporting = null; // { abort }
let batch = null; // { abort, results }
let lastBatch = []; // 마지막으로 만든 전체 스타일 결과
let resultBlob = null;
let resultExt = 'mp4';
let resultMeta = null; // { W, H, duration }
let STYLES = [];
let styleJob = 0; // 스타일 예시 장면을 받는 중 다른 스타일을 누르면 먼저 것은 버린다
let viralRef = ''; // 빵터진 영상에서 고른 참고 제목

// 내레이션 만들기(tts.js) 설정 — 프로젝트 .json 에는 넣지 않고 store 'tts' 에만 저장합니다. voice 는 서비스별로 따로 둡니다.
// API 키는 여기서 다루지 않습니다 — 맨 위 'AI 키' 칸(js/keys.js)에 모이고, synthesize 가 거기서 꺼내 씁니다.
const tts = { provider: 'gemini', voice: {}, model: 'drama-3', speed: 1, ...store.get('tts', {}) };
if (!tts.voice || typeof tts.voice !== 'object') tts.voice = {};
delete tts.key; // 혹시 예전 설정에 섞여 있던 키 칸은 버린다
let ttsResult = null; // 마지막으로 만든 음성 { blob, ext } — "파일로 저장" 용
let ttsTextEdited = false; // 사용자가 대본 칸을 직접 고쳤으면 장면이 바뀌어도 덮어쓰지 않는다
let ttsBusy = false; // '음성 만들기' 진행 중 — 그동안 영상 만들기·전부 만들기를 막는다(내레이션이 반만 들어가지 않게)
const changeHooks = new Set(); // 장면·설정이 바뀔 때 알려 줄 곳(매물 쇼츠 상자 listing.js)
let listingIO = null; // 프로젝트 저장/열기 때 매물 정보를 주고받는 곳 { get(): object, set(obj): void, uploadText?(): string|null } — listing.js 가 등록
let structureLock = ''; // 매물 대본 AI 가 쓰는 동안 장면 구성(추가·삭제·순서·프로젝트 열기)을 막는 까닭 문구 — 비어 있으면 안 막음
let projectToken = 0; // 장면 묶음이 통째로 바뀔 때마다(프로젝트 열기·대본 적용·모두 지우기) 1씩 — 늦게 온 AI 결과를 버릴 때 비교
let recording = false; // 매물 상자 ④ '내 목소리 녹음' 중 — 그동안 영상 만들기·전부 만들기·음성 만들기를 막는다(내레이션이 반만 들어가지 않게)
let narrSerial = 0; // 내레이션이 바뀔 때마다 1씩(영상이 지금 내레이션으로 만든 것인지 가릴 때)

/** 장면 구성을 바꾸는 동작 앞에서 부릅니다. 잠겨 있으면 까닭을 알리고 true. */
function structureLocked() {
  if (!structureLock) return false;
  toast(structureLock);
  return true;
}

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

/** 사진 파일들을 장면으로 넣습니다(이름 순). 넣은 장 수를 돌려줍니다. 예시 장면뿐이면 먼저 비웁니다. */
async function addImageFiles(files) {
  if (structureLocked()) return 0;
  const imgs = files.filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(f.name));
  if (!imgs.length) { toast('이미지 파일만 넣을 수 있습니다.'); return 0; }
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
  return imgs.length - fails;
}

function applyLines(lines, hints = []) {
  if (structureLocked()) return;
  lines = lines.map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return toast('대본이 비어 있습니다. 한 줄에 한 장면씩 적어 주세요.');
  dropSamples();
  lines.forEach((line, i) => {
    const s = project.scenes[i];
    if (s) {
      s.caption = line;
      s.narration = ''; // 새 자막을 넣었으니 예전 '읽을 문장'(매물 대본)은 버린다 — 내레이션은 새 자막을 읽음
      s.hint = hints[i] || s.hint;
      if (!s.img) s.duration = defaultDuration(s);
    } else {
      project.scenes.push(newScene(null, line, { hint: hints[i] || '' }));
    }
  });
  if (project.scenes[0] && project.scenes[0].kind === 'normal') project.scenes[0].kind = 'hook';
  ttsTextEdited = false; // 새 대본을 넣었으니 내레이션 대본 칸도 새 자막으로
  changed(true);
  toast(`대본 ${lines.length}줄을 장면 자막에 넣었습니다.`);
}

function moveScene(i, d) {
  if (structureLocked()) return;
  const j = i + d;
  if (j < 0 || j >= project.scenes.length) return;
  const arr = project.scenes;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  changed(true);
  focusSceneTool(arr[j].id, d < 0 ? '위로' : '아래로');
}

/** 목록을 다시 그린 뒤에도 키보드 초점이 같은 장면의 같은 버튼에 남게 합니다(장면이 없으면 '글자 장면 추가'로). */
function focusSceneTool(id, title) {
  const li = id ? $('#sceneList').querySelector(`li[data-id="${id}"]`) : null;
  const b = li?.querySelector(`.scene-tools button[title="${title}"]`);
  (b || $('#addTextScene')).focus({ preventScroll: true });
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
    thumb.setAttribute('aria-label', `${i + 1}번 장면 ${s.img ? '사진 바꾸기' : '글자 장면 — 사진 넣기'}`);
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
      mk('✕', '지우기', () => {
        if (structureLocked()) return;
        const next = project.scenes[i + 1] || project.scenes[i - 1];
        project.scenes.splice(i, 1);
        changed(true);
        focusSceneTool(next?.id, '지우기');
      }, 'danger'),
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
  if (structureLocked()) return;
  replaceTarget = scene;
  replaceInput.click();
}

/** 다른 곳(매물 상자 ③ 대본 목록)에서 자막·길이를 고쳤을 때 장면 목록 칸도 따라오게 합니다(지금 쓰고 있는 칸은 건드리지 않음). */
function syncSceneFields() {
  const byId = new Map(project.scenes.map((s) => [s.id, s]));
  for (const li of $('#sceneList').children) {
    const s = byId.get(li.dataset.id);
    if (!s) continue;
    const ta = li.querySelector('textarea');
    if (ta && ta !== document.activeElement && ta.value !== s.caption) ta.value = s.caption;
    const dur = li.querySelector('input[type=number]');
    if (dur && dur !== document.activeElement && Number(dur.value) !== Number(s.duration)) dur.value = s.duration;
  }
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
  else {
    $('#sceneSummary').textContent = project.scenes.length ? `${project.scenes.length}개 장면 · 총 ${tl.total.toFixed(1)}초` : '';
    syncSceneFields();
  }
  curT = Math.min(curT, Math.max(0, tl.total - 0.01));
  persist();
  refreshFonts();
  draw();
  scheduleStripRender();
  $('#fitToNarr').disabled = !audio.narr || !project.scenes.length;
  syncTtsText(); // 자막을 한 글자만 고쳐도 내레이션 대본 칸이 따라온다(사용자가 손댔으면 덮어쓰지 않고 '자막과 다름' 힌트만)
  for (const fn of changeHooks) { try { fn(structural); } catch (e) { console.error('change hook', e); } }
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

async function startPlayback() {
  if (!tl.total || playing || playPrep) return;
  stopMusicPreview();
  // 배경음악 파일이 없으면 스타일 음악 루프를 먼저 만든다(분위기마다 한 번만, 그다음부터는 바로).
  // 만드는 동안 ▶ 는 '…' 로 바꾸고 잠가 두어, 기다리다 한 번 더 누른 것이 조용히 취소되는 일이 없게 합니다.
  const job = ++playJob;
  const btn = $('#playBtn');
  playPrep = true;
  btn.textContent = '…';
  btn.disabled = true;
  btn.setAttribute('aria-label', '소리 준비 중');
  let bgm = null;
  try { bgm = await bgmSource(); } finally {
    playPrep = false;
    btn.disabled = false;
  }
  if (job !== playJob) { btn.textContent = '▶'; btn.setAttribute('aria-label', '재생'); return; } // 준비 중에 멈췄거나 화면을 떠났다
  if (curT >= tl.total - 0.05) curT = 0;
  const from = curT;
  const stopAudio = startAudio(audioCtx().destination, from, tl.total, bgm);
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
  playJob++; // 소리를 준비하던 재생도 취소
  playPrep = false;
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

/**
 * offset초부터 total초까지 배경음악·내레이션을 dest로 보냅니다. 멈추는 함수를 돌려줍니다.
 * @param {{buffer: AudioBuffer, loop: boolean}|null} bgm  배경음악 소스 — 사용자 파일(loop) 또는 스타일 음악 버퍼(bgmSource 가 만듦). 없으면 내레이션만.
 */
function startAudio(dest, offset, total, bgm) {
  if (!bgm?.buffer && !audio.narr) return () => {};
  const ctx = audioCtx();
  const now = ctx.currentTime + 0.05;
  const remain = Math.max(0.1, total - offset);
  const nodes = [];
  if (bgm?.buffer) {
    const src = ctx.createBufferSource();
    src.buffer = bgm.buffer;
    src.loop = !!bgm.loop;
    const g = ctx.createGain();
    const vol = project.bgmVolume;
    // 시작은 0.25초 페이드인(루프 중간에서 시작해도 툭 끊기지 않게), 끝은 1.5초 페이드아웃
    const fadeIn = Math.min(0.25, remain * 0.3);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(vol, now + fadeIn);
    const fadeAt = now + Math.max(fadeIn, remain - 1.5);
    g.gain.setValueAtTime(vol, fadeAt);
    g.gain.linearRampToValueAtTime(0.0001, now + remain);
    src.connect(g).connect(dest);
    // 반복 소스(사용자 파일·스타일 음악 루프)는 길이로 나눈 자리에서, 한 번짜리 버퍼는 그 자리에서 시작
    const at = bgm.loop ? offset % src.buffer.duration : Math.min(offset, Math.max(0, src.buffer.duration - 0.01));
    src.start(now, at);
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

/** 지금 무엇이 깔리는지 보여 줍니다. busy 가 있으면(스타일 음악 만드는 중) 그 글을 대신 보여 줍니다. */
function renderAudioInfo(busy = '') {
  const parts = [];
  if (audio.bgm) parts.push(`배경음악 ${audio.bgm.name} (${formatTime(audio.bgm.buffer.duration)})`);
  else if (busy) parts.push(busy);
  else {
    const mood = currentMood();
    if (mood) parts.push(`스타일 음악: ${mood.name}${project.styleMusic === 'auto' ? ' (자동)' : ''}`);
  }
  // 만든 음성(made)은 이름에 '내레이션' 이 이미 들어 있습니다: "내레이션 (제미나이)"
  if (audio.narr) parts.push(`${audio.narr.made ? '' : '내레이션 '}${audio.narr.name} (${formatTime(audio.narr.buffer.duration)})`);
  $('#audioInfo').textContent = parts.length ? parts.join(' · ') : '스타일 음악을 꺼 두었습니다. 소리 파일이 없으면 무음 영상이 만들어집니다.';
  $('#fitToNarr').disabled = !audio.narr || !project.scenes.length;
  for (const fn of changeHooks) { try { fn(false); } catch (e) { console.error('change hook', e); } } // 매물 상자의 '목소리' 단계 표시도 따라가게
}

// ── 스타일 음악(music.js) ────────────────────────────
/** 이 스타일에 깔 분위기(MOODS 항목). 끄기면 null. 자동이면 스타일의 music, 없으면 '깔끔 기업'. */
function moodFor(style) {
  const pick = project.styleMusic || 'auto';
  if (pick === 'off') return null;
  const id = pick === 'auto' ? (style?.music || 'corporate') : pick;
  return MOODS.find((m) => m.id === id) || MOODS.find((m) => m.id === 'corporate') || null;
}
const currentMood = () => moodFor(currentStyle());

/** 스타일 음악 루프 길이(초). renderMood 가 코드 진행 한두 바퀴에 맞춰 반올림합니다. 미리듣기(playMood)와 같은 값이라 캐시를 함께 씁니다. */
const STYLE_LOOP_SECONDS = 16;

/**
 * 지금 영상에 깔릴 배경음악 소스. 사용자 파일이 있으면 그 파일(반복), 없으면 스타일 음악을 이음새 없는 루프로 만들어 돌려줍니다.
 * 루프는 분위기마다 한 번만 만들어 캐시되므로(영상 길이·장면 길이와 무관) 첫 한 번만 몇 초 걸리고 그다음부터는 바로 시작하며,
 * 메모리도 분위기당 루프 하나입니다. 반복과 끝 페이드아웃은 startAudio 가 맡습니다. 만들지 못하면 null(음악 없이).
 * @returns {Promise<{buffer: AudioBuffer, loop: boolean, name: string}|null>}
 */
async function bgmSource(style = currentStyle()) {
  if (audio.bgm) return { buffer: audio.bgm.buffer, loop: true, name: audio.bgm.name };
  const mood = moodFor(style);
  if (!mood) return null;
  renderAudioInfo(`스타일 음악 「${mood.name}」 만드는 중…`);
  try {
    const buffer = await renderMood(mood.id, STYLE_LOOP_SECONDS, { sampleRate: audioCtx().sampleRate, loop: true });
    return { buffer, loop: true, name: mood.name };
  } catch (e) {
    console.warn('스타일 음악', e);
    toast(`스타일 음악을 만들지 못해 음악 없이 진행합니다: ${e.message || e}`);
    return null;
  } finally {
    renderAudioInfo();
  }
}

function setMusicPreviewButton(on, mood) {
  const b = $('#musicPreview');
  if (!b) return;
  b.textContent = on ? '■' : '▶';
  b.setAttribute('aria-pressed', String(on));
  b.setAttribute('aria-label', on ? `「${mood?.name || ''}」 미리듣기 멈춤` : '스타일 음악 미리듣기');
}

function stopMusicPreview() {
  if (!musicPreview) return;
  musicPreview.handle.stop();
  musicPreview = null;
  setMusicPreviewButton(false);
}

/** 고른 분위기를 루프로 들려 줍니다. 미리보기 재생 중이면 그쪽을 멈춥니다(둘이 겹치지 않게). */
function startMusicPreview() {
  const mood = currentMood();
  if (!mood) return toast('스타일 음악이 꺼져 있습니다. 분위기를 고르거나 "스타일 추천 (자동)"으로 바꿔 주세요.');
  stopMusicPreview();
  if (playing || playPrep) stopPlayback();
  const handle = playMood(audioCtx(), mood.id, { gain: project.bgmVolume });
  musicPreview = { handle, moodId: mood.id };
  setMusicPreviewButton(true, mood);
  handle.ready.catch((e) => {
    console.warn('미리듣기', e);
    if (musicPreview?.handle === handle) { stopMusicPreview(); toast(`스타일 음악을 만들지 못했습니다: ${e.message || e}`); }
  });
}

/** 분위기 선택·스타일이 바뀌었을 때: 미리듣기 중이면 새 분위기로 갈아타고, 끄기면 버튼을 잠급니다. */
function syncMusicPreview() {
  const mood = currentMood();
  const b = $('#musicPreview');
  if (b) b.disabled = !mood;
  if (!musicPreview) return;
  if (!mood) stopMusicPreview();
  else if (musicPreview.moodId !== mood.id) startMusicPreview();
}

/** 장면이 읽어 줄 글 — 매물 대본의 '읽을 문장'(scene.narration)이 있으면 그것, 없으면 자막(별표 뺀 글) */
const spokenText = (s) => plainText(s.narration || s.caption).replace(/\s*\n\s*/g, ' ').trim();

/**
 * 장면 길이를 내레이션 길이에 맞춥니다. 장면마다 읽을 글(읽을 문장이 있으면 그 글자 수, 없으면 자막 글자 수) 비율로 나눕니다.
 * quiet 면 안내 토스트를 띄우지 않습니다. 맞췄으면 true.
 */
function fitToNarration(quiet = false) {
  if (!audio.narr || !project.scenes.length) return false;
  const target = audio.narr.buffer.duration + 0.4;
  const weights = project.scenes.map((s) => Math.max(8, spokenText(s).length));
  const sum = weights.reduce((a, b) => a + b, 0);
  project.scenes.forEach((s, i) => { s.duration = Math.max(0.8, Math.round(((target * weights[i]) / sum) * 10) / 10); });
  changed(true);
  const by = project.scenes.some((s) => s.narration) ? '읽을 문장 글자 수 비율' : '자막 글자 수 비율';
  if (!quiet) toast(`장면 길이를 내레이션 ${target.toFixed(1)}초에 맞췄습니다(${by}).`);
  return true;
}

// ── 스타일 갤러리 ─────────────────────────────────────
/** 지금 설정·장면의 복사본(장면·엔딩은 얕게). 내보내기는 이 복사본으로 하므로 녹화 중 화면을 바꿔도 영상은 그대로 끝까지 만들어집니다. */
function previewProject() {
  return { ...project, ending: { ...project.ending }, scenes: project.scenes.map((s) => ({ ...s })) };
}

function currentStyle() {
  return STYLES.find((s) => s.id === project.style) || null;
}

function exportLabel() {
  const st = currentStyle();
  return st ? `"${st.name.split(' — ')[0]}" 스타일로 영상 만들기` : '이 스타일로 영상 만들기';
}

/** 스타일 수. 데이터를 못 읽었을 때는 index.html 자리표시(data-style-count)에 적힌 수를 쓴다 */
const styleCount = () => STYLES.length || Number(document.querySelector('[data-style-count]')?.textContent) || 0;
const batchLabel = () => `${styleCount()}가지 전부 만들기`;

function markStyleCards() {
  for (const card of document.querySelectorAll('#styleStrip .style-card')) card.setAttribute('aria-pressed', String(card.dataset.id === project.style));
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
    card.dataset.id = st.id;
    card.setAttribute('aria-pressed', String(project.style === st.id));
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
        drawFrame(c.getContext('2d'), p, c.width, c.height, previewTime(ptl), ptl);
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
  markStyleCards();
  const finish = () => {
    sizePreview();
    syncControls();
    renderStyleDesc();
    changed(true);
    renderAudioInfo(); // 자동이면 스타일에 따라 음악이 바뀐다
    syncMusicPreview();
    if (!exporting) $('#exportBtn').textContent = exportLabel(); // 녹화 중이면 '만들기 멈춤' 글자를 지키기
  };
  finish();
  // 예시 장면뿐이면 스타일의 예시 장면으로 바꿔 보여 준다(연달아 눌렀으면 마지막에 누른 것만 반영)
  const job = ++styleJob;
  if (allSamples() && st.sample?.scenes?.length) {
    loadStyleSample(st).then((scenes) => {
      if (job !== styleJob) return;
      project.scenes = scenes;
      ttsTextEdited = false; // 예시 장면으로 바뀌면 대본 칸도 새로
      if (st.sample.title) { project.title = st.sample.title; $('#title').value = project.title; }
      finish();
    });
  }
  toast(`스타일: ${st.name}`);
}

/** 스타일의 예시 장면을 만들어 돌려줍니다(project 는 건드리지 않음). */
async function loadStyleSample(st) {
  const scenes = [];
  for (const s of st.sample.scenes) {
    scenes.push(newScene(s.img ? await sample(s.img) : null, s.caption, {
      duration: s.duration, kind: s.kind || 'normal', tag: s.tag, label: s.label, sample: true,
      // 비교(vs)·비포애프터의 둘째 사진과 숫자 카운트(counter)도 함께 — 빠지면 갤러리 설명(좌우 비교·카운트업)과 다른 영상이 됩니다
      img2: s.img2 ? await sample(s.img2) : null,
      counter: s.counter ? { ...s.counter } : undefined,
    }));
  }
  return scenes;
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
      // 카드(div) 안에 "이 컨셉으로 대본 쓰기" 버튼과 "영상 열기" 링크를 따로 둔다(버튼 안에 링크를 넣지 않음)
      const card = document.createElement('div');
      card.className = 'vcard';
      const use = document.createElement('button');
      use.type = 'button';
      use.className = 'vuse';
      use.setAttribute('aria-label', `${v.title} — 이 컨셉으로 대본 쓰기`);
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
      use.append(im, b, s);
      use.addEventListener('click', () => useViral(v));
      card.append(use, open);
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
/**
 * 지금 스타일로 영상 한 편을 만듭니다. 만드는 중에 다시 부르면 멈춥니다.
 * opts.onStatus(text, ratio) — 매물 상자처럼 다른 곳에도 진행 상황을 보여 줄 때(없어도 됨).
 * 완성되면 결과 { blob, ext, W, H, duration }, 멈추거나 실패하면 null 을 돌려줍니다.
 */
async function exportVideo(opts = {}) {
  const onStatus = typeof opts?.onStatus === 'function' ? opts.onStatus : () => {};
  if (exporting) { exporting.abort.abort(); return null; }
  const refuse = (msg) => { toast(msg); onStatus(msg, 0); return null; };
  if (batch) return refuse(`${batchLabel()}가 진행 중입니다. 먼저 멈춰 주세요.`);
  if (ttsBusy) return refuse('내레이션을 만드는 중입니다. 끝난 뒤 영상을 만들어 주세요.');
  if (recording) return refuse('녹음 중입니다. 매물 상자 ④에서 녹음을 먼저 멈춰 주세요.');
  if (structureLock) return refuse(structureLock);
  if (!project.scenes.length) return refuse('장면이 없습니다. 사진이나 대본을 먼저 넣어 주세요.');
  stopPlayback();
  stopMusicPreview();
  const btn = $('#exportBtn');
  const bar = $('#exportProgress');
  const status = $('#exportStatus');
  const say = (text, ratio) => { status.textContent = text; try { onStatus(text, ratio); } catch { /* 표시 문제는 무시 */ } };
  $('#exportResult').hidden = true;
  btn.textContent = '만들기 멈춤';
  $('#styleBatchBtn').disabled = true; // 한 편과 전부 만들기가 동시에 돌지 않게
  bar.hidden = false;
  bar.classList.add('rec');
  say('소리를 준비하는 중…', 0);
  const abort = new AbortController();
  exporting = { abort };
  for (const fn of changeHooks) { try { fn(false); } catch { /* 무시 */ } } // 매물 상자 버튼도 '멈춤'으로
  try {
    const snap = previewProject();
    const sig = projectSig(snap); // 이 영상이 어떤 장면·내레이션으로 만든 것인지(나중에 대본이 바뀌면 '예전 영상'으로 알림)
    // 배경음악 파일이 없으면 스타일 음악 루프를 먼저 만든다(분위기마다 한 번만, 비동기). 그동안 멈춤을 눌렀으면 여기서 끝.
    const bgm = await bgmSource();
    if (abort.signal.aborted) throw new DOMException('내보내기를 멈췄습니다.', 'AbortError');
    say('글꼴과 사진을 준비하는 중…', 0);
    const withAudio = !!(bgm || audio.narr);
    const r = await exportProject({
      project: snap,
      quality: project.quality,
      startAudio: withAudio ? (dest, offset, total) => startAudio(dest, offset, total, bgm) : null,
      audioCtx: withAudio ? audioCtx() : null,
      signal: abort.signal,
      onProgress: ({ t, total, text }) => {
        bar.firstElementChild.style.transform = `scaleX(${t / total})`;
        say(`${text} — 이 탭을 띄워 두세요.`, total ? t / total : 0);
      },
    });
    r.sig = sig;
    showResult(r);
    say(`완성: ${r.ext.toUpperCase()} · ${r.W}×${r.H} · ${(r.blob.size / 1048576).toFixed(1)}MB · ${formatTime(r.duration)}`, 1);
    toast('영상이 완성됐습니다. “영상 파일 저장”을 누르세요.');
    return r;
  } catch (e) {
    if (e?.name === 'AbortError') say('만들기를 멈췄습니다.', 0);
    else { console.error(e); say(`영상을 만들지 못했습니다: ${e.message || e}`, 0); }
    return null;
  } finally {
    exporting = null;
    btn.textContent = exportLabel();
    $('#styleBatchBtn').disabled = false;
    bar.classList.remove('rec');
    setTimeout(() => { bar.hidden = true; bar.firstElementChild.style.transform = 'scaleX(0)'; }, 600);
    for (const fn of changeHooks) { try { fn(false); } catch { /* 무시 */ } }
  }
}

function showResult(r) {
  resultExt = r.ext;
  resultBlob = r.blob;
  resultMeta = { W: r.W, H: r.H, duration: r.duration, sig: r.sig ?? null };
  const v = $('#resultVideo');
  if (v.src) URL.revokeObjectURL(v.src);
  v.src = URL.createObjectURL(resultBlob);
  $('#exportResult').hidden = false;
  renderUploadPanel();
  for (const fn of changeHooks) { try { fn(false); } catch { /* 무시 */ } } // 매물 상자 ⑥(저장·보내기)도 새 영상으로
  // 고정된 미리보기 열이 길어졌을 때 결과 영상·저장 버튼이 바로 보이게(영상 크기가 정해진 뒤 한 번 더)
  const reveal = () => $('#exportResult').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  reveal();
  v.addEventListener('loadedmetadata', reveal, { once: true });
}

/**
 * 영상 내용의 지문: 제목·장면(id·자막·읽을 문장)·내레이션(바뀔 때마다 오르는 번호). 같으면 '지금 대본으로 만든 영상'.
 * (길이·스타일은 넣지 않습니다 — 대본·목소리가 바뀐 경우만 '예전 영상'으로 알리려는 것)
 */
function projectSig(p = project, narr = audio.narr) {
  return JSON.stringify([plainText(p.title), p.scenes.map((s) => [s.id, s.caption, s.narration || '']), narr ? narr.serial || narr.name : null]);
}

/** 만든 영상·전부 만들기 결과를 버립니다(다른 프로젝트를 열었을 때 — 예전 매물 영상이 새 제목으로 나가지 않게). */
function clearResults() {
  resultBlob = null;
  resultMeta = null;
  const v = $('#resultVideo');
  if (v.src) URL.revokeObjectURL(v.src);
  v.removeAttribute('src');
  v.load?.();
  $('#exportResult').hidden = true;
  $('#uploadPanel').hidden = true;
  $('#plats').textContent = '';
  lastBatch = [];
  $('#batchPanel').hidden = true;
  $('#batchList').textContent = '';
  $('#batchZip').disabled = true;
}

function videoFileName(ext = resultExt, suffix = '') {
  const first = plainText(project.title).split('\n').map((s) => s.trim()).filter(Boolean).join(' ');
  return `${safeFileName(first || 'MRK-shorts')}${suffix}.${ext}`;
}

// ── 내보내기(모든 스타일 전부) ─────────────────────────────
async function exportAllStyles() {
  if (batch) { batch.abort.abort(); return; }
  if (exporting) return toast('한 편 만들기가 진행 중입니다. 먼저 멈춰 주세요.');
  if (ttsBusy) return toast('내레이션을 만드는 중입니다. 끝난 뒤 영상을 만들어 주세요.');
  if (recording) return toast('녹음 중입니다. 매물 상자 ④에서 녹음을 먼저 멈춰 주세요.');
  if (structureLocked()) return;
  if (!STYLES.length) return toast('스타일 데이터가 없습니다.');
  if (!project.scenes.length) return toast('장면이 없습니다. 사진이나 대본을 먼저 넣어 주세요.');
  stopPlayback();
  stopMusicPreview();
  const snap = previewProject(); // 모든 스타일을 시작 시점의 장면·설정으로
  const sig = projectSig(snap);
  $('#exportBtn').disabled = true;
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
  // 한 스타일씩 돌려서, 중간에 멈춰도 그때까지 만든 것은 남깁니다.
  for (let i = 0; i < STYLES.length; i++) {
    if (abort.signal.aborted) break;
    const st = STYLES[i];
    try {
      // 배경음악 파일이 없고 '자동'이면 스타일마다 그 스타일이 추천하는 분위기 루프로(분위기마다 한 번만 만듦. 파일이 있으면 모두 그 파일)
      status.textContent = `${i + 1}/${STYLES.length} ${st.name} — 소리 준비 중…`;
      const bgm = await bgmSource(st);
      if (abort.signal.aborted) break;
      const withAudio = !!(bgm || audio.narr);
      const [r] = await exportStyles({
        project: snap, styles: [st], quality: project.quality,
        startAudio: withAudio ? (dest, offset, total) => startAudio(dest, offset, total, bgm) : null,
        audioCtx: withAudio ? audioCtx() : null,
        signal: abort.signal,
        onProgress: ({ t, total }) => {
          bar.firstElementChild.style.transform = `scaleX(${(i + t / total) / STYLES.length})`;
          status.textContent = `${i + 1}/${STYLES.length} ${st.name} — ${formatTime(t)} / ${formatTime(total)}`;
        },
      });
      if (r) { r.sig = sig; batch.results.push(r); renderBatchList(batch.results); }
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
  $('#styleBatchBtn').textContent = batchLabel();
  $('#exportBtn').disabled = false;
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
    play.setAttribute('aria-label', `${r.style.name} 보기`);
    play.addEventListener('click', () => { showResult(r); $('#resultVideo').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'btn small';
    save.textContent = '저장';
    save.setAttribute('aria-label', `${r.style.name} 저장`);
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

/** 매물 대본(listing.js)이 만든 업로드 글의 플랫폼별 칸 — 복사·ZIP 글에 이 순서로 붙습니다. */
const UPLOAD_SECTIONS = [['instagram', '인스타그램 릴스'], ['tiktok', '틱톡'], ['threads', '쓰레드'], ['facebook', '페이스북']];

/**
 * 업로드용 글(복사·ZIP '업로드용-글.txt'). AI 대본이 있으면 그 제목·설명·해시태그,
 * 매물 대본이면 설명 끝에 중개대상물 표시·광고 필수 항목(uploadInfo.disclosure)을 붙이고 플랫폼별 글도 이어 붙입니다.
 */
function uploadTextOf() {
  // 매물 영상(매물 대본이거나, 대본 없이 매물 사진 + 중개사무소·매물 정보를 넣은 경우)은 매물 상자(listing.js)가 만든 글 —
  // 대시보드로 보내는 글과 같은 규칙(제목·설명 + 적은 표시 항목 + 해시태그)
  const lt = listingIO?.uploadText?.();
  if (typeof lt === 'string' && lt.trim()) return lt;
  const title = plainText(project.title).replace(/\n/g, ' ').trim();
  if (uploadInfo) {
    const tags = (uploadInfo.hashtags || []).join(' ');
    const disc = Array.isArray(uploadInfo.disclosure) ? uploadInfo.disclosure.filter(Boolean).join('\n') : '';
    const block = (body) => [body || '', disc, tags].filter((x) => String(x).trim()).join('\n\n');
    const head = [plainText(uploadInfo.title || title).replace(/\n/g, ' '), block(uploadInfo.description)].filter(Boolean).join('\n\n');
    const plats = uploadInfo.platforms && typeof uploadInfo.platforms === 'object' ? uploadInfo.platforms : null;
    if (!plats) return head.trim();
    const more = UPLOAD_SECTIONS.filter(([k]) => String(plats[k] || '').trim()).map(([k, name]) => `── ${name} ──\n${block(plats[k])}`);
    return [head, ...more].join('\n\n').trim();
  }
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
    // 매물 정보·중개사무소 정보(listing.js). AI 키는 여기에도, 어디에도 넣지 않습니다.
    listing: listingIO ? listingIO.get() : null,
    scenes: await Promise.all(project.scenes.map(async (s) => ({
      caption: s.caption, narration: s.narration || '', duration: s.duration, hint: s.hint || '', sample: !!s.sample, kind: s.kind || 'normal', tag: s.tag || '', label: s.label || '',
      counter: s.counter || null,
      image: await imageToDataURL(s.img),
      image2: await imageToDataURL(s.img2), // 비교(vs)·비포애프터의 둘째 사진
    }))),
  };
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const name = `${safeFileName(plainText(project.title).split('\n')[0] || 'MRK')}-프로젝트.json`;
  try {
    if (await saveBlob(blob, name)) toast('프로젝트를 저장했습니다. 소리 파일은 들어가지 않습니다.');
  } catch (e) { toast(e.message); }
}

async function openProject(file) {
  if (structureLocked()) return;
  if (exporting || batch || ttsBusy || recording) return toast('영상·목소리를 만들거나 녹음하는 중에는 프로젝트를 열 수 없습니다. 끝나거나 멈춘 뒤 열어 주세요.');
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== 'mrk-video') throw new Error('MR.K 영상만들기 프로젝트 파일이 아닙니다.');
    if (structureLock) throw new Error(structureLock); // 파일을 읽는 사이 대본 만들기가 시작됐으면 열지 않음
    Object.assign(project, pickSettings(data.settings || {}));
    project.ending = { ...DEFAULTS.ending, ...(project.ending || {}) };
    project.logo = data.logo ? await loadImage(data.logo) : null;
    project.scenes = await Promise.all((data.scenes || []).map(async (s) => newScene(
      s.image ? await loadImage(s.image) : null,
      s.caption || '',
      {
        duration: s.duration, hint: s.hint, sample: s.sample, kind: s.kind || 'normal', tag: s.tag, label: s.label,
        narration: typeof s.narration === 'string' ? s.narration : '',
        counter: s.counter || undefined, img2: s.image2 ? await loadImage(s.image2) : null,
      },
    )));
    projectToken++;
    uploadInfo = data.uploadInfo && typeof data.uploadInfo === 'object' ? data.uploadInfo : null;
    // 프로젝트 파일에는 소리·영상이 들어가지 않습니다. 앞 프로젝트(다른 매물)의 내레이션·결과 영상이 남아 새 제목·표시 항목과 함께
    // 저장·전송되지 않게 버립니다(사용자가 넣은 배경음악 파일은 그대로 둠).
    const hadMedia = !!(audio.narr || resultBlob || lastBatch.length);
    audio.narr = null;
    $('#narrFile').value = '';
    ttsResult = null;
    $('#ttsSave').hidden = true;
    clearResults();
    $('#exportStatus').textContent = '영상 길이만큼 시간이 걸립니다. 만드는 동안 이 탭을 띄워 두세요.';
    ttsNote();
    listingIO?.set(data.listing && typeof data.listing === 'object' ? data.listing : null);
    ttsTextEdited = false; // 다른 프로젝트를 열었으니 대본 칸도 그 자막으로
    syncControls();
    renderUploadInfo();
    sizePreview();
    changed(true);
    markStyleCards();
    renderStyleDesc();
    renderAudioInfo();
    syncMusicPreview();
    $('#exportBtn').textContent = exportLabel();
    $('#scriptText').value = project.scenes.map((s) => s.caption).join('\n');
    toast(hadMedia ? '프로젝트를 열었습니다. 목소리와 영상은 프로젝트에 들어가지 않아 다시 만들어야 합니다.' : '프로젝트를 열었습니다.', hadMedia ? 5000 : undefined);
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
  if (structureLocked()) return;
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
      styleHint: styleHintOf(st),
      reference: viralRef,
    });
    if (structureLocked()) return; // 기다리는 사이 매물 대본 만들기가 시작됐으면 넣지 않음
    if (r.title) project.title = r.title;
    $('#title').value = project.title;
    $('#scriptText').value = r.scenes.map((s) => s.caption).join('\n');
    applyLines(r.scenes.map((s) => s.caption), r.scenes.map((s) => s.imageHint));
    uploadInfo = { title: r.title, description: r.description, hashtags: r.hashtags };
    renderUploadInfo();
    status.textContent = `장면 ${r.scenes.length}개를 만들었습니다. 법령·수치는 올리기 전에 꼭 확인하세요.`;
  } catch (e) {
    status.textContent = e.message;
    if (/AI 키가 없습니다|키가 없습니다/.test(e.message || '')) openKeyBar({ focus: 'gemini' });
  } finally {
    btn.disabled = false;
  }
}

/** AI 에게 알려 줄 스타일 뼈대(훅·장면 순서·스타일 안내). 스타일을 안 골랐으면 '' */
function styleHintOf(st) {
  return st ? `${st.hook ? '훅: ' + st.hook + '. ' : ''}장면 뼈대: ${(st.beats || []).join(' → ')}. ${st.prompt || ''}`.trim() : '';
}

/** AI 대본 상자: 아티팩트는 보는 사람의 Claude, 웹은 맨 위 AI 키(또는 서버 AI)가 있을 때만 보입니다. 키를 넣거나 빼면 다시 확인. */
async function refreshAiBox() {
  try { $('#aiBox').hidden = !(await aiAvailable()); } catch { /* 그대로 둠 */ }
}

// ── 내레이션 만들기(tts.js) ───────────────────────────
const ttsProvider = () => providerOf(tts.provider);
const saveTts = () => store.set('tts', tts);

/** 장면마다 읽을 글(매물 대본의 '읽을 문장'이 있으면 그것, 없으면 별표 없는 자막)을 한 줄씩 이어 붙인 것 — 대본 칸의 기본값. */
function scenesScript() {
  return project.scenes
    .map(spokenText)
    .filter(Boolean)
    .join('\n');
}

/** 대본 칸이 지금 장면 자막과 다르면 '장면 자막과 다릅니다' 힌트를 보여 줍니다(손댄 대본으로 음성을 만들기 전에 알 수 있게). */
function renderTtsDiff() {
  const hint = $('#ttsDiffHint');
  const ta = $('#ttsText');
  if (!hint || !ta) return;
  hint.hidden = ta.value.trim() === scenesScript().trim();
}

/** 장면 자막을 별표 없는 글로 한 줄씩 대본 칸에 넣습니다. 사용자가 손댄 뒤에는 force 일 때만 덮어쓰고, 아니면 힌트만 갱신합니다. */
function syncTtsText(force = false) {
  const ta = $('#ttsText');
  if (!ta) return;
  if (ttsTextEdited && !force) { renderTtsDiff(); return; }
  const next = scenesScript();
  if (ta.value !== next) ta.value = next;
  ttsTextEdited = false;
  renderTtsDiff();
}

/** 상태 칸의 기본 안내 — 아티팩트(Claude 미리보기)·서버 없는 Fish Audio 는 미리 알려 줍니다. */
function ttsNote() {
  const st = $('#ttsStatus');
  if (inArtifact) {
    st.textContent = 'Claude 미리보기에서는 음성 생성이 안 됩니다. ko372.com 에서 써 주세요.';
    $('#ttsRun').disabled = true; // 쓸 수 없는 기능으로 이끌지 않도록 버튼을 잠근다
    return;
  }
  st.textContent = '';
  if (ttsProvider().id !== 'fish') return;
  serverInfo().then((info) => {
    if (ttsProvider().id === 'fish' && !info.tts) st.textContent = 'Fish Audio 는 인터넷 배포 버전(ko372.com)에서만 됩니다. 제미나이나 일레븐랩스를 골라 주세요.';
  });
}

/** 지금 서비스의 키가 맨 위 'AI 키' 칸에 있는지 보여 줍니다(키 자체는 보여 주지 않음). */
function renderTtsKeyState() {
  const p = ttsProvider();
  const el = $('#ttsKeyState');
  if (!el) return;
  const has = !!getKey(p.keyId || p.id);
  el.textContent = has ? `${p.short} 키 ✓` : `${p.short} 키 없음`;
  el.className = `kchip ${has ? 'on' : 'off'}`;
  // 'AI 키 칸' 바로 가기도 지금 고른 서비스의 칸으로(일레븐랩스를 골랐는데 제미나이 칸으로 가지 않게)
  const link = document.querySelector('.tts-keynote [data-open-keys]');
  if (link) link.dataset.openKeys = p.keyId || p.id;
}

/** 서비스에 맞게 키 안내·목소리 칸(제미나이는 고르기, 나머지는 ID 글자 칸)·엔진 칸·속도 안내를 바꿉니다. */
function renderTtsProvider() {
  const p = ttsProvider();
  $('#ttsProvider').value = p.id;
  $('#ttsKeyHint').textContent = p.free && p.freeNote ? `${p.keyHint} · ${p.freeNote}` : p.keyHint;
  $('#l-ttsVoice').textContent = p.voiceLabel || '목소리';
  const saved = typeof tts.voice[p.id] === 'string' ? tts.voice[p.id] : '';
  let el;
  if (p.voices) {
    el = document.createElement('select');
    for (const v of p.voices) el.append(new Option(v.name, v.id));
    el.value = p.voices.some((v) => v.id === saved) ? saved : p.voices[0].id;
  } else {
    el = document.createElement('input');
    el.type = 'text';
    el.autocomplete = 'off';
    el.spellcheck = false;
    el.placeholder = p.voiceLabel || '';
    el.value = saved || p.defaultVoice || '';
  }
  el.id = 'ttsVoice';
  el.setAttribute('aria-labelledby', 'l-ttsVoice');
  el.addEventListener('input', () => { tts.voice[p.id] = el.value.trim(); saveTts(); notifyTts(); });
  $('#ttsVoice').replaceWith(el);
  tts.voice[p.id] = el.value.trim();

  const modelSel = $('#ttsModel');
  $('#ttsModelField').hidden = !p.models;
  if (p.models) {
    modelSel.replaceChildren(...p.models.map((m) => new Option(m.name, m.id)));
    modelSel.value = p.models.some((m) => m.id === tts.model) ? tts.model : p.models[0].id;
    tts.model = modelSel.value;
  }
  $('#ttsSpeedHint').textContent = p.id === 'fish' ? '' : '속도는 Fish Audio 에만 적용됩니다.';
  renderTtsKeyState();
  saveTts();
  ttsNote();
}

/** 목소리 설정이 바뀌었음을 매물 상자(④ 목소리)에 알려 줍니다. */
function notifyTts() {
  for (const fn of changeHooks) { try { fn(false); } catch { /* 무시 */ } }
}

/**
 * 아래 makeNarration 과 녹음이 함께 쓰는 마무리: 만든 소리를 내레이션 자리에 넣고 '파일로 저장'을 켭니다.
 * script = 이 소리가 읽은 장면 대본(scenesScript) — 나중에 대본이 바뀌면 '예전 대본 목소리'로 알려 주는 데 씁니다(없으면 지금 대본).
 */
function setNarration({ buffer, name, blob, ext, script }) {
  audio.narr = { name, buffer, made: true, script: typeof script === 'string' ? script : scenesScript(), serial: ++narrSerial };
  $('#narrFile').value = '';
  renderAudioInfo();
  ttsResult = blob ? { blob, ext: ext || 'wav' } : null;
  $('#ttsSave').hidden = !ttsResult;
}

/**
 * 대본을 목소리로 만들어 내레이션 자리에 넣습니다(소리 패널 '음성 만들기'와 매물 상자 ④ 가 같이 씀).
 * 키는 맨 위 AI 키 칸(keys.js)에서 꺼내 씁니다. 실패하면 한국어 Error(code: 'nokey' 면 키 없음).
 * @param {{ provider: string, voice?: string, model?: string, speed?: number, text: string, onProgress?: Function, signal?: AbortSignal }} o
 * @returns {Promise<{ duration: number, provider: string }>}
 */
async function makeNarration({ provider, voice, model, speed, text, onProgress, signal } = {}) {
  const p = providerOf(provider);
  if (inArtifact) throw new Error('Claude 미리보기에서는 음성 생성이 안 됩니다. ko372.com 에서 써 주세요.');
  if (exporting || batch) throw new Error('영상을 만드는 중에는 내레이션을 만들 수 없습니다. 먼저 멈춰 주세요.');
  if (ttsBusy) throw new Error('다른 내레이션을 만드는 중입니다. 끝난 뒤 다시 눌러 주세요.');
  if (recording) throw new Error('녹음 중입니다. 녹음을 먼저 멈춰 주세요.');
  if (structureLock) throw new Error(structureLock);
  if (!getKey(p.keyId || p.id)) throw Object.assign(new Error(`${p.short} 키가 없습니다. 맨 위 'AI 키' 칸에 넣어 주세요. (${p.keyHint})`), { code: 'nokey', keyId: p.keyId || p.id });
  text = String(text || '').trim();
  if (!text) throw new Error('읽을 대본이 비어 있습니다. 대본을 먼저 만들거나 적어 주세요.');
  if (text.length > MAX_TEXT) throw new Error(`대본이 너무 깁니다 (${text.length.toLocaleString()}자). ${MAX_TEXT.toLocaleString()}자 이하로 줄여 주세요.`);
  ttsBusy = true;
  const script = scenesScript(); // 이 목소리가 읽는 장면 대본(만드는 동안 고쳐도 '예전 대본'으로 알 수 있게 시작할 때 기억)
  try {
    // 엔진(model)은 Fish Audio 에만 있습니다. 제미나이·일레븐랩스는 tts.js 의 고정 모델을 씁니다. key 를 넘기지 않으면 keys.js 의 키를 씁니다.
    const { blob, mime } = await synthesize({ provider: p.id, voice, model: p.models ? model : undefined, text, speed, onProgress, signal });
    const buffer = await loadAudioFile(blob);
    setNarration({ buffer, name: `내레이션 (${p.short})`, blob, ext: mime === 'audio/wav' ? 'wav' : 'mp3', script });
    return { duration: buffer.duration, provider: p.id };
  } finally {
    ttsBusy = false;
  }
}

async function runTts() {
  const p = ttsProvider();
  const st = $('#ttsStatus');
  const btn = $('#ttsRun');
  if (btn.disabled) return;
  if (inArtifact) { st.textContent = 'Claude 미리보기에서는 음성 생성이 안 됩니다. ko372.com 에서 써 주세요.'; return; } // 키 검사보다 먼저(키를 넣으라고 이끌지 않게)
  if (exporting || batch) return toast('영상을 만드는 중에는 내레이션을 만들 수 없습니다. 먼저 멈춰 주세요.');
  if (recording) return toast('녹음 중입니다. 매물 상자 ④에서 녹음을 먼저 멈춰 주세요.');
  if (structureLocked()) return;
  const voice = $('#ttsVoice').value.trim();
  const text = $('#ttsText').value.trim();
  if (!getKey(p.keyId || p.id)) {
    st.textContent = `${p.short} 키가 없습니다. 맨 위 'AI 키' 칸에 넣어 주세요. (${p.keyHint})`;
    openKeyBar({ focus: p.keyId || p.id });
    return;
  }
  if (!voice) { st.textContent = p.voiceLabel ? `${p.voiceLabel}를 넣어 주세요.` : '목소리를 골라 주세요.'; $('#ttsVoice').focus(); return; }
  if (!text) { st.textContent = '대본이 비어 있습니다. "대본 다시 가져오기"를 누르거나 직접 적어 주세요.'; $('#ttsText').focus(); return; }
  if (text.length > MAX_TEXT) { st.textContent = `대본이 너무 깁니다 (${text.length.toLocaleString()}자). ${MAX_TEXT.toLocaleString()}자 이하로 줄여 주세요.`; return; }
  btn.disabled = true;
  $('#ttsSave').hidden = true;
  st.textContent = '만드는 중… (10~40초)';
  try {
    const { duration } = await makeNarration({
      provider: p.id, voice, model: tts.model, speed: tts.speed, text,
      onProgress: (o) => {
        if (o?.wait) st.textContent = `무료 한도 때문에 ${o.wait}초 기다렸다가 이어서 만듭니다…`;
        else if (o?.total > 1) st.textContent = `만드는 중… (${Math.min(o.done + 1, o.total)}/${o.total}조각)`;
      },
    });
    st.textContent = `완성 — ${formatTime(duration)}. 내레이션 자리에 넣었습니다.`;
    toast("내레이션을 넣었습니다. 필요하면 '장면 길이를 내레이션에 맞추기'를 누르세요.");
  } catch (e) {
    st.textContent = e?.message || '음성을 만들지 못했습니다. 다시 시도하세요.';
    if (e?.code === 'nokey' || e?.code === 'key') openKeyBar({ focus: p.keyId || p.id });
  } finally {
    btn.disabled = false;
  }
}

function wireTts() {
  $('#ttsProvider').addEventListener('input', () => { tts.provider = $('#ttsProvider').value; renderTtsProvider(); notifyTts(); });
  $('#ttsModel').addEventListener('input', () => { tts.model = $('#ttsModel').value; saveTts(); notifyTts(); });
  const speed = $('#ttsSpeed');
  const showSpeed = () => { $('#ttsSpeedOut').textContent = `${Number(tts.speed).toFixed(2)}×`; };
  speed.value = String(tts.speed);
  tts.speed = Number(speed.value); // 범위 밖 값은 슬라이더가 잘라 준다
  showSpeed();
  speed.addEventListener('input', () => { tts.speed = Number(speed.value); showSpeed(); saveTts(); notifyTts(); });
  $('#ttsText').addEventListener('input', () => { ttsTextEdited = true; renderTtsDiff(); });
  $('#ttsFromScenes').addEventListener('click', () => { syncTtsText(true); toast('장면 자막을 대본 칸에 다시 넣었습니다.'); });
  $('#ttsRun').addEventListener('click', runTts);
  $('#ttsSave').addEventListener('click', async () => {
    if (!ttsResult) return;
    try {
      if (await saveBlob(ttsResult.blob, `내레이션.${ttsResult.ext}`)) toast('내레이션 파일을 저장했습니다.');
    } catch (e) { toast(e.message); }
  });
  if (!PROVIDERS.some((p) => p.id === tts.provider)) tts.provider = PROVIDERS[0].id;
  renderTtsProvider();
}

/**
 * 매물 상자(listing.js)에 넘겨 주는 숏폼 화면의 손잡이. 같은 project·소리·결과를 같이 씁니다(상자와 아래 화면이 그대로 이어짐).
 * project.scenes 는 바뀔 때마다 새 배열이 될 수 있으니 늘 api.project.scenes 로 읽습니다.
 */
const api = {
  project,
  audio,
  get resultBlob() { return resultBlob; },
  get resultExt() { return resultExt; },
  get resultMeta() { return resultMeta; },
  get exporting() { return !!exporting; },
  /** 영상(한 편·전부)·내레이션을 만들거나 녹음하는 중 */
  get busy() { return !!(exporting || batch || ttsBusy || recording); },
  get uploadInfo() { return uploadInfo; },
  /** 장면 묶음이 통째로 바뀐 횟수(프로젝트 열기·대본 적용·모두 지우기) — 늦게 온 AI 결과를 버릴 때 비교 */
  get projectToken() { return projectToken; },
  /** 매물 대본 AI 가 쓰는 동안 장면 구성(추가·삭제·순서·사진 바꾸기·프로젝트 열기·AI 대본)을 막습니다. reason 은 눌렀을 때 보일 말. */
  lockStructure(reason) { structureLock = String(reason || '대본을 만드는 중에는 장면을 바꿀 수 없습니다. 끝나거나 멈춘 뒤 해 주세요.'); },
  unlockStructure() { structureLock = ''; },
  /** 매물 상자 ④ 녹음 중 표시 — 켜져 있는 동안 영상 만들기·전부 만들기·음성 만들기를 막습니다. */
  setRecording(on) {
    recording = !!on;
    if (!exporting) $('#exportBtn').disabled = recording || !!batch;
    if (!batch) $('#styleBatchBtn').disabled = recording || !!exporting;
    if (!inArtifact) $('#ttsRun').disabled = recording;
    for (const fn of changeHooks) { try { fn(false); } catch { /* 무시 */ } }
  },
  get recording() { return recording; },
  /** 내레이션이 지금 장면 대본과 다른 대본으로 만든 것인지(올린 파일처럼 대본을 모르면 false) */
  get narrStale() { return !!audio.narr && typeof audio.narr.script === 'string' && audio.narr.script !== scenesScript(); },
  /** 결과 영상이 지금 장면·내레이션과 다른 상태로 만든 것인지 */
  get resultStale() { return !!resultBlob && resultMeta?.sig != null && resultMeta.sig !== projectSig(); },
  /** 영상 왼쪽 위 이름(채널) 바꾸기 — 세부 조절 칸도 같이 */
  setChannel(v) { project.channel = String(v ?? '').slice(0, 60); syncControls(); changed(false); },
  /** 엔딩 문구 바꾸기({ text, sub, enabled } 중 일부) — 세부 조절 칸도 같이 */
  setEnding(patch) { project.ending = { ...project.ending, ...(patch || {}) }; syncControls(); changed(false); },
  /** 처음부터 들어 있던 값(DEFAULTS) — 사용자가 고친 값인지 가릴 때 */
  defaults: { channel: DEFAULTS.channel, ending: { ...DEFAULTS.ending }, title: DEFAULTS.title },
  /** 예시(강의) 제목인지 — 첫 화면 예시나 스타일 예시 제목이면 true */
  isSampleTitle(t) {
    const k = (x) => plainText(String(x || '')).replace(/\s+/g, ' ').trim();
    const v = k(t);
    if (!v) return false;
    return v === k(SHORTS_CASE.title) || STYLES.some((st) => st.sample?.title && k(st.sample.title) === v);
  },
  /** 지금 영상 길이(초) */
  get duration() { return tl.total; },
  tts,
  saveTts,
  /** 소리 패널의 '내레이션 만들기' 칸을 tts 설정대로 다시 그립니다(매물 상자에서 목소리를 바꿨을 때) */
  refreshTts() { renderTtsProvider(); },
  addImageFiles,
  changed,
  /** 화면 비율 바꾸기('9:16'|'16:9'|'1:1') — 세부 조절의 화면 비율 칸·미리보기 크기도 같이 */
  setAspect(v) {
    if (!['9:16', '16:9', '1:1'].includes(v)) return;
    project.aspect = v;
    syncControls();
    sizePreview();
    changed(false);
    scheduleStripRender();
  },
  setTitle(t) { project.title = String(t || ''); $('#title').value = project.title; changed(false); },
  /** 장면 목록을 통째로 바꿉니다(매물 대본 적용). 내레이션 대본 칸도 새 글로 */
  setScenes(scenes) {
    projectToken++;
    project.scenes = scenes;
    ttsTextEdited = false;
    $('#scriptText').value = scenes.map((s) => s.caption).join('\n');
    changed(true);
  },
  newScene,
  seek,
  currentStyle,
  styleHintOf,
  setUploadInfo(info) { uploadInfo = info && typeof info === 'object' ? info : null; renderUploadInfo(); },
  uploadTextOf,
  videoFileName: () => videoFileName(),
  exportVideo,
  makeNarration,
  setNarration,
  fitToNarration,
  spokenText,
  onChange(fn) { changeHooks.add(fn); return () => changeHooks.delete(fn); },
  registerIO(io) { listingIO = io; },
  openKeyBar,
};

// ── 설정 입력 연결 ─────────────────────────────────────
const BINDINGS = [
  ['aspect', 'aspect'], ['template', 'template'], ['font', 'font'],
  ['captionSize', 'captionSize', Number], ['captionStyle', 'captionStyle'], ['captionAnim', 'captionAnim'], ['overlay', 'overlay'], ['titleMode', 'titleMode'],
  ['motion', 'motion'], ['transition', 'transition'], ['textColor', 'textColor'], ['highlightColor', 'highlightColor'],
  ['bandColor', 'bandColor'], ['panelColor', 'panelColor'], ['inkColor', 'inkColor'], ['showProgress', 'showProgress', 'check'], ['title', 'title'],
  ['channel', 'channel'], ['quality', 'quality'], ['styleMusic', 'styleMusic'],
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
      if (key === 'bgmVolume') musicPreview?.handle.setGain(project.bgmVolume); // 미리듣기 크기도 바로 따라가게
      if (key === 'styleMusic') { renderAudioInfo(); syncMusicPreview(); }
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
  const musicSel = $('#styleMusic');
  if (musicSel) for (const m of MOODS) musicSel.append(new Option(m.name, m.id)); // 저장된 값이 목록에 없으면 syncControls 가 '자동'으로 되돌린다
  document.body.append(replaceInput);

  try { ({ STYLES } = await import('./styles.js')); } catch (e) { console.warn('styles.js 없음', e); STYLES = []; }

  syncControls();
  wireControls();
  initKeyBar(); // 맨 위 'AI 키' 칸 — 내레이션·AI 대본·매물 대본이 모두 여기 키를 씁니다
  wireTts();
  sizePreview();
  // 키를 넣거나 빼면 AI 대본 상자·내레이션 키 표시를 다시 맞춘다(다른 탭에서 바꾼 것도)
  onKeysChange(() => { refreshAiBox(); renderTtsKeyState(); });
  $('#aiRun').addEventListener('click', runAI);
  initListing(api); // 매물 사진으로 쇼츠 만들기(단계 1~6) — 이 화면과 같은 project 를 씁니다

  wireDrop($('#sceneDrop'), addImageFiles);
  $('#addTextScene').addEventListener('click', () => {
    if (structureLocked()) return;
    dropSamples();
    project.scenes.push(newScene(null, '새 장면 — *핵심 단어*를 별표로 감싸세요'));
    changed(true);
  });
  $('#clearScenes').addEventListener('click', () => {
    if (structureLocked()) return;
    if (!project.scenes.length) return;
    projectToken++;
    project.scenes = [];
    ttsTextEdited = false; // 대본 칸도 비운다
    changed(true);
    toast('장면을 모두 지웠습니다.');
  });
  $('#applyScript').addEventListener('click', () => applyLines($('#scriptText').value.split('\n')));

  $('#playBtn').addEventListener('click', () => ((playing || playPrep) ? stopPlayback() : startPlayback()));
  $('#musicPreview')?.addEventListener('click', () => (musicPreview ? stopMusicPreview() : startMusicPreview()));
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
      const buffer = await loadAudioFile(f);
      if (slot === 'narr' && audio.narr?.made) $('#ttsStatus').textContent = '올린 파일을 내레이션으로 씁니다. 만든 음성은 "파일로 저장"으로 남길 수 있습니다.';
      // 올린 내레이션 파일은 어떤 대본을 읽었는지 알 수 없으므로 script 는 null('예전 대본' 경고를 하지 않음)
      audio[slot] = slot === 'narr' ? { name: f.name, buffer, script: null, serial: ++narrSerial } : { name: f.name, buffer };
      renderAudioInfo();
    } catch {
      toast(`${f.name}: 소리 파일을 읽지 못했습니다. mp3·m4a·wav를 써 주세요.`);
    }
  });
  onAudio('bgm', $('#bgmFile'));
  onAudio('narr', $('#narrFile'));
  $('#clearAudio').addEventListener('click', () => {
    if (audio.narr?.made) $('#ttsStatus').textContent = '내레이션을 뺐습니다. 만든 음성은 "파일로 저장"으로 남길 수 있습니다.';
    audio.bgm = null;
    audio.narr = null;
    $('#bgmFile').value = '';
    $('#narrFile').value = '';
    renderAudioInfo();
  });
  $('#fitToNarr').addEventListener('click', fitToNarration);

  const mime = pickMime(true) || pickMime(false);
  $('#mimeOut').textContent = mime ? (mime.startsWith('video/mp4') ? 'MP4' : 'WEBM') : '지원 안 됨';
  $('#exportBtn').addEventListener('click', () => exportVideo());
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
  $('#viralToggle').addEventListener('click', (e) => {
    const box = $('#viralBox');
    box.hidden = !box.hidden;
    e.currentTarget.setAttribute('aria-expanded', String(!box.hidden));
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
  // 기다리는 사이에 매물 상자(①)로 사진을 먼저 넣었으면 예시로 덮어쓰지 않는다
  if (!project.scenes.length || allSamples()) project.scenes = scenes;
  if (project.style && currentStyle()) {
    currentStyle().apply(project);
    syncControls();
    $('#exportBtn').textContent = exportLabel();
  }
  renderStyleStrip();
  renderAudioInfo();
  syncMusicPreview();
  $('#styleBatchBtn').textContent = batchLabel();
  changed(true);
  curT = 1.2;
  await ensureFonts(project);
  draw();
  if (document.fonts?.ready) document.fonts.ready.then(() => { draw(); renderStripThumbs(); });

  await refreshAiBox();
  serverInfo().then((info) => { if (!info.youtube) $('#viralToggle').textContent = '빵터진 영상 찾기 ↗'; });
}

export function pauseShorts() { stopPlayback(); stopMusicPreview(); }
