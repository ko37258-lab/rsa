// 01 숏폼 영상 만들기 — 화면 조작, 미리보기 재생, 소리, 영상 내보내기

import {
  $, clamp, debounce, formatTime, srtTime, uid, store, toast, wireDrop,
  imageFromFile, loadImage, makeSampleImage, safeFileName, canvasToBlob, readAsDataURL, drawImageFit,
} from './util.js';
import { FONTS, dims, buildTimeline, segmentAt, drawFrame, ensureFonts, buildSrt, plainText } from './shorts-render.js';
import { inArtifact, saveBlob, copyText, aiAvailable, generateScript } from './platform.js';
import { SCRIPT_STYLES } from './script-prompt.js';

const SETTINGS_KEYS = [
  'aspect', 'template', 'font', 'captionSize', 'captionStyle', 'motion', 'transition',
  'textColor', 'highlightColor', 'bandColor', 'showProgress', 'title', 'channel', 'ending',
  'bgmVolume', 'narrVolume', 'quality',
];

const DEFAULTS = {
  aspect: '9:16',
  template: 'band',
  font: 'Black Han Sans',
  captionSize: 68,
  captionStyle: 'outline',
  motion: 'auto',
  transition: 'fade',
  textColor: '#ffffff',
  highlightColor: '#ffd43b',
  bandColor: '#0b0d14',
  showProgress: true,
  title: '공법의 신이 알려주는\n*토지투자* 3원칙',
  channel: 'MR.K 고상철',
  ending: { enabled: true, text: '*구독*하고\n땅 공부 같이 해요', sub: 'MR.K 고상철 · 부동산 AI', duration: 2.5 },
  bgmVolume: 0.35,
  narrVolume: 1,
  quality: '1080',
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
let exporting = null; // { cancel }
let resultBlob = null;
let resultExt = 'mp4';

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
  const s = { id: uid(), img, caption, duration: 3, ...extra };
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
    meta.append(dur, document.createTextNode('초'));
    if (s.sample) {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = '예시';
      meta.append(tag);
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
  const total = tl.total;
  $('#sceneSummary').textContent = project.scenes.length
    ? `${project.scenes.length}개 장면 · 총 ${total.toFixed(1)}초`
    : '';
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
    if (replaceTarget.duration == null) replaceTarget.duration = 3;
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
  else {
    $('#sceneSummary').textContent = project.scenes.length ? `${project.scenes.length}개 장면 · 총 ${tl.total.toFixed(1)}초` : '';
  }
  curT = Math.min(curT, Math.max(0, tl.total - 0.01));
  persist();
  refreshFonts();
  draw();
}

const refreshFonts = debounce(async () => { await ensureFonts(project); draw(); }, 250);

// ── 미리보기 ─────────────────────────────────────────
const pv = () => $('#previewCanvas');

function sizePreview() {
  const { W, H } = dims(project.aspect, '1080');
  const c = pv();
  const scale = 0.5;
  const w = Math.round(W * scale);
  const h = Math.round(H * scale);
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
}

function draw() {
  const c = pv();
  drawFrame(c.getContext('2d'), project, c.width, c.height, curT, tl);
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

// ── 내보내기 ─────────────────────────────────────────
function pickMime(withAudio) {
  if (typeof MediaRecorder === 'undefined') return null;
  const list = withAudio
    ? ['video/mp4;codecs=avc1.640033,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    : ['video/mp4;codecs=avc1.640033', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  return list.find((m) => MediaRecorder.isTypeSupported(m)) || null;
}

async function exportVideo() {
  if (exporting) { exporting.cancel(); return; }
  if (!project.scenes.length) return toast('장면이 없습니다. 사진이나 대본을 먼저 넣어 주세요.');
  const withAudio = !!(audio.bgm || audio.narr);
  const mime = pickMime(withAudio);
  if (!mime || !HTMLCanvasElement.prototype.captureStream) {
    return toast('이 브라우저는 영상 녹화를 지원하지 않습니다. 크롬이나 엣지 최신 버전을 써 주세요.');
  }
  stopPlayback();
  const btn = $('#exportBtn');
  const bar = $('#exportProgress');
  const status = $('#exportStatus');
  $('#exportResult').hidden = true;
  btn.textContent = '만들기 멈춤';
  bar.hidden = false;
  bar.classList.add('rec');
  status.textContent = '글꼴과 사진을 준비하는 중…';

  let cancelled = false;
  exporting = { cancel: () => { cancelled = true; } };
  let stopAudio = () => {};
  try {
    await ensureFonts(project);
    const { W, H } = dims(project.aspect, project.quality);
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    const timeline = buildTimeline(project);
    drawFrame(ctx, project, W, H, 0, timeline);

    const stream = canvas.captureStream(30);
    let dest = null;
    if (withAudio) {
      dest = audioCtx().createMediaStreamDestination();
      dest.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr));
    }
    const rec = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: project.quality === '720' ? 5_000_000 : 10_000_000,
      audioBitsPerSecond: 160_000,
    });
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
    const stopped = new Promise((r) => { rec.onstop = r; });
    rec.start(250);
    if (dest) stopAudio = startAudio(dest, 0, timeline.total);
    const t0 = performance.now() + 50;

    await new Promise((resolve) => {
      const tick = () => {
        const t = (performance.now() - t0) / 1000;
        if (cancelled || t >= timeline.total) {
          drawFrame(ctx, project, W, H, timeline.total, timeline);
          resolve();
          return;
        }
        drawFrame(ctx, project, W, H, Math.max(0, t), timeline);
        bar.firstElementChild.style.transform = `scaleX(${Math.max(0, t) / timeline.total})`;
        status.textContent = `녹화 중 ${formatTime(Math.max(0, t))} / ${formatTime(timeline.total)} — 이 탭을 띄워 두세요.`;
        if (document.hidden) setTimeout(tick, 1000 / 30);
        else requestAnimationFrame(tick);
      };
      tick();
    });
    await new Promise((r) => setTimeout(r, 200));
    rec.stop();
    stopAudio();
    await stopped;
    stream.getTracks().forEach((tr) => tr.stop());
    if (cancelled) {
      status.textContent = '만들기를 멈췄습니다.';
      return;
    }
    resultExt = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
    resultBlob = new Blob(chunks, { type: mime.split(';')[0] });
    const v = $('#resultVideo');
    if (v.src) URL.revokeObjectURL(v.src);
    v.src = URL.createObjectURL(resultBlob);
    $('#exportResult').hidden = false;
    status.textContent = `완성: ${resultExt.toUpperCase()} · ${W}×${H} · ${(resultBlob.size / 1048576).toFixed(1)}MB`;
    toast('영상이 완성됐습니다. “영상 파일 저장”을 누르세요.');
  } catch (e) {
    console.error(e);
    status.textContent = `영상을 만들지 못했습니다: ${e.message || e}`;
  } finally {
    stopAudio();
    exporting = null;
    btn.textContent = '영상 만들기';
    bar.classList.remove('rec');
    setTimeout(() => { bar.hidden = true; bar.firstElementChild.style.transform = 'scaleX(0)'; }, 600);
  }
}

function videoFileName() {
  const first = plainText(project.title).split('\n').map((s) => s.trim()).filter(Boolean).join(' ');
  return `${safeFileName(first || 'MRK-shorts')}.${resultExt}`;
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
    version: 1,
    savedAt: new Date().toISOString(),
    settings: pickSettings(project),
    logo: project.logo ? await imageToDataURL(project.logo, 600) : null,
    uploadInfo,
    scenes: await Promise.all(project.scenes.map(async (s) => ({
      caption: s.caption, duration: s.duration, hint: s.hint || '', sample: !!s.sample, image: await imageToDataURL(s.img),
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
      { duration: s.duration, hint: s.hint, sample: s.sample },
    )));
    uploadInfo = data.uploadInfo || null;
    syncControls();
    renderUploadInfo();
    sizePreview();
    changed(true);
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
  $('#uploadText').textContent = [plainText(uploadInfo.title).replace(/\n/g, ' '), '', uploadInfo.description, '', uploadInfo.hashtags.join(' ')].join('\n').trim();
}

async function runAI() {
  const topic = $('#aiTopic').value.trim();
  if (!topic) { $('#aiTopic').focus(); return toast('주제를 먼저 적어 주세요.'); }
  const btn = $('#aiRun');
  const status = $('#aiStatus');
  btn.disabled = true;
  status.textContent = 'AI가 대본을 쓰는 중… (보통 10~40초)';
  try {
    const r = await generateScript({
      topic, style: $('#aiStyle').value, scenes: $('#aiScenes').value, channel: project.channel,
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
  ['captionSize', 'captionSize', Number], ['captionStyle', 'captionStyle'], ['motion', 'motion'],
  ['transition', 'transition'], ['textColor', 'textColor'], ['highlightColor', 'highlightColor'],
  ['bandColor', 'bandColor'], ['showProgress', 'showProgress', 'check'], ['title', 'title'],
  ['channel', 'channel'], ['quality', 'quality'],
  ['bgmVolume', 'bgmVolume', Number], ['narrVolume', 'narrVolume', Number],
];
const ENDING_BINDINGS = [
  ['endingOn', 'enabled', 'check'], ['endingText', 'text'], ['endingSub', 'sub'], ['endingDur', 'duration', Number],
];

function syncControls() {
  for (const [id, key, kind] of BINDINGS) {
    const el = document.getElementById(id);
    if (kind === 'check') el.checked = !!project[key];
    else el.value = project[key];
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
  const styleSel = $('#aiStyle');
  for (const [k, v] of Object.entries(SCRIPT_STYLES)) styleSel.append(new Option(v, k));
  document.body.append(replaceInput);

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
      if (await saveBlob(resultBlob, videoFileName())) toast('영상 파일을 저장했습니다.');
    } catch (e) { toast(e.message); }
  });
  $('#copySrt').addEventListener('click', async () => {
    const ok = await copyText(buildSrt(project, srtTime));
    toast(ok ? '자막(SRT)을 복사했습니다. 메모장에 붙여 넣고 .srt로 저장하면 됩니다.' : '복사하지 못했습니다.');
  });
  // .srt는 아티팩트 저장 허용 형식이 아니라서 그 화면에서는 복사만 제공합니다.
  $('#saveSrt').hidden = inArtifact;
  $('#saveSrt').addEventListener('click', async () => {
    const name = videoFileName().replace(/\.(mp4|webm)$/, '.srt');
    try { await saveBlob(new Blob([buildSrt(project, srtTime)], { type: 'text/plain' }), name); } catch (e) { toast(e.message); }
  });
  $('#copyUpload').addEventListener('click', async () => {
    toast((await copyText($('#uploadText').textContent)) ? '업로드용 글을 복사했습니다.' : '복사하지 못했습니다.');
  });

  $('#projSaveBtn').addEventListener('click', saveProject);
  $('#projOpenBtn').addEventListener('click', () => $('#projFile').click());
  $('#projFile').addEventListener('change', (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) openProject(f);
  });

  // 첫 화면: 예시 장면(사진은 코드로 그린 그림)
  const [land, road, permit, city] = await Promise.all(['land', 'road', 'permit', 'city'].map((k) => makeSampleImage(k, 1200, 1200)));
  project.scenes = [
    newScene(land, '땅을 살 때는\n*용도지역*부터 확인하세요', { sample: true, duration: 3 }),
    newScene(road, '*도로*에 붙지 않은 맹지는\n건축이 어렵습니다', { sample: true, duration: 3 }),
    newScene(permit, '*개발행위허가*가 나는 땅인지\n꼭 알아보세요', { sample: true, duration: 3 }),
    newScene(null, '세 가지만 지켜도\n*토지투자* 실패가 줄어듭니다', { sample: true }),
    newScene(city, '궁금한 땅은\n*MR.K*에게 물어보세요', { sample: true, duration: 3 }),
  ];
  changed(true);
  curT = 1.2;
  await ensureFonts(project);
  draw();
  if (document.fonts?.ready) document.fonts.ready.then(draw);

  if (await aiAvailable()) $('#aiBox').hidden = false;
}

export function pauseShorts() { stopPlayback(); }
