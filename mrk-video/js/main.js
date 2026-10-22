// 시작점 — 메뉴 전환(움직임 포함)과 각 화면 초기화

import { $, $$ } from './util.js';
import { inArtifact, canPickFolder, serverInfo, aiAvailable, accessCode, setAccessCode } from './platform.js';
import { kinetic, rise, swapViews, topline, wirePressFeedback } from './motion.js';
import { initShorts, pauseShorts } from './shorts.js';
import { initCompose } from './compose.js';
import { initDownloader } from './downloader.js';
import { initShowcase, pauseShowcase, resumeShowcase } from './showcase.js';

const VIEWS = ['showcase', 'shorts', 'compose', 'download', 'guide'];
let current = null;
let switching = Promise.resolve();

function viewEl(name) { return document.querySelector(`.view[data-view="${name}"]`); }

function moveIndicator(name) {
  const ind = $('.nav-ind');
  const a = document.querySelector(`.nav a[data-view="${name}"]`);
  if (!ind || !a) return;
  ind.style.transform = `translateY(${a.offsetTop}px)`;
  ind.style.height = `${a.offsetHeight}px`;
  ind.style.opacity = '1';
  // 좁은 화면(가로 메뉴)에서는 현재 메뉴가 보이게 메뉴 줄만 가로로 스크롤
  const nav = a.parentElement;
  if (nav.scrollWidth > nav.clientWidth + 1) {
    nav.scrollTo({ left: a.offsetLeft - (nav.clientWidth - a.offsetWidth) / 2, behavior: 'smooth' });
  }
}

/** 화면 들어올 때의 움직임: 제목 키네틱 + 패널 떠오르기 */
function enterMotion(name) {
  const view = viewEl(name);
  if (!view) return;
  const title = view.querySelector('.view-head h1[data-kinetic], .hero-title[data-kinetic]');
  if (title) kinetic(title, { delay: 80 });
  const panels = view.querySelectorAll('.studio-controls > .panel, .studio-preview > *, .prose > .panel, .view > .panel, .grid4 > .panel, .runbar, .hero');
  rise(panels, { delay: 120, stagger: 45 });
}

function show(name) {
  if (!VIEWS.includes(name)) name = 'showcase';
  if (name === current) return;
  const prev = current;
  current = name;
  for (const a of $$('.nav a')) {
    if (a.dataset.view === name) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  moveIndicator(name);
  topline();
  if (prev === 'shorts') pauseShorts();
  if (prev === 'showcase') pauseShowcase();
  const dir = VIEWS.indexOf(name) >= VIEWS.indexOf(prev || 'showcase') ? 1 : -1;
  // 첫 진입(주소에 #shorts 같은 해시가 붙어 있을 때)에는 목표 화면 외 전부 숨긴다
  if (!prev) for (const v of VIEWS) { const el = viewEl(v); if (el && v !== name) el.hidden = true; }
  switching = switching.then(async () => {
    await swapViews(prev ? viewEl(prev) : null, viewEl(name), dir);
    window.scrollTo({ top: 0, behavior: 'instant' });
    enterMotion(name);
    if (name === 'showcase') resumeShowcase();
  });
  return switching;
}

function currentView() {
  const h = location.hash.replace('#', '');
  // 사례 화면 안의 앵커(#case-shorts 등)는 사례 화면으로
  if (h.startsWith('case-')) return 'showcase';
  return h || 'showcase';
}

async function renderEnv() {
  const info = await serverInfo();
  const ai = await aiAvailable();
  const rec = typeof MediaRecorder !== 'undefined' && !!HTMLCanvasElement.prototype.captureStream;
  const mp4 = rec && ['video/mp4;codecs=avc1', 'video/mp4'].some((m) => MediaRecorder.isTypeSupported(m));
  $('#envBadge').textContent = inArtifact ? 'Claude 미리보기' : info.proxy ? '웹 배포 + 서버' : '웹 (정적)';

  const items = [
    ['실행 위치', inArtifact ? 'Claude 아티팩트 화면' : info.proxy ? '인터넷 배포 버전 (서버 함수 사용 가능)' : '정적 웹 페이지 (서버 함수 없음)', true],
    ['영상 녹화', rec ? (mp4 ? '가능 · MP4로 저장' : '가능 · WEBM으로 저장') : '이 브라우저에서는 안 됨 (크롬·엣지 권장)', rec],
    ['AI 대본', ai ? '사용 가능' : inArtifact ? '사용할 수 없음' : '서버에 ANTHROPIC_API_KEY·접속 코드를 넣으면 켜집니다', ai],
    ['빵터진 영상 찾기', info.youtube ? '사용 가능 (유튜브 검색)' : '유튜브 검색 링크로 대신합니다', !!info.youtube],
    ['주소로 이미지 받기', inArtifact ? '배포 버전에서만 동작' : info.proxy ? '사용 가능 (서버 프록시)' : '직접 받기만 가능 (일부 사이트는 막힘)', !inArtifact],
    ['PC 폴더에 바로 저장', canPickFolder ? '사용 가능' : 'ZIP 파일로 저장됩니다', canPickFolder],
  ];
  const ul = $('#envList');
  ul.textContent = '';
  for (const [k, v, good] of items) {
    const li = document.createElement('li');
    const b = document.createElement('b');
    b.textContent = k;
    const mark = document.createElement('span');
    mark.className = good ? 'yes' : 'no';
    mark.textContent = good ? '●' : '○';
    const val = document.createElement('span');
    val.className = 'val';
    val.textContent = v;
    li.append(mark, b, val);
    ul.append(li);
  }

  // 서버가 접속 코드를 요구하면 안내 화면에서 입력받습니다.
  if (info.needsCode) {
    const li = document.createElement('li');
    const label = document.createElement('label');
    label.className = 'field';
    label.style.flex = '1';
    const span = document.createElement('span');
    span.textContent = '접속 코드 (AI·프록시 사용 시 필요, 이 브라우저에만 저장)';
    const inp = document.createElement('input');
    inp.type = 'password';
    inp.id = 'accessCode';
    inp.value = accessCode();
    inp.autocomplete = 'off';
    inp.addEventListener('change', () => setAccessCode(inp.value.trim()));
    label.append(span, inp);
    li.append(label);
    ul.append(li);
  }
}

/** 화면 곳곳의 "N가지" 숫자(index.html 의 data-style-count 자리표시)를 실제 스타일 수로 채웁니다. 데이터를 못 읽으면 HTML 에 적힌 수를 그대로 둡니다. */
async function fillStyleCount() {
  try {
    const { STYLES } = await import('./styles.js');
    if (!STYLES.length) return;
    for (const el of document.querySelectorAll('[data-style-count]')) el.textContent = String(STYLES.length);
  } catch (e) { console.warn('styles.js 없음', e); }
}

/** 사용법 영상 파일이 있으면 안내 화면에 보여 줍니다(없으면 그 칸은 숨긴 채로). */
async function wireGuideVideo() {
  const box = $('#guideVideo');
  const v = $('#guideVideoEl');
  if (!box || !v) return;
  const src = 'assets/video/tutorial.mp4';
  try {
    const r = await fetch(src, { method: 'HEAD' });
    if (!r.ok) return;
    v.src = src;
    v.poster = 'assets/video/tutorial-poster.jpg';
    box.hidden = false;
  } catch { /* 영상 없음 */ }
}

async function boot() {
  wirePressFeedback();
  wireGuideVideo();
  window.addEventListener('hashchange', () => {
    const v = currentView();
    show(v);
    const h = location.hash.replace('#', '');
    if (h.startsWith('case-')) switching.then(() => document.getElementById(h)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  });
  window.addEventListener('resize', () => current && moveIndicator(current));
  show(currentView());
  // 스타일 수 채우기는 사례 화면(initShowcase)의 제목 움직임(kinetic)이 글자를 다시 짜기 전에 끝나야 한다
  await Promise.all([
    fillStyleCount(),
    initShorts().catch((e) => console.error('shorts', e)),
    initCompose().catch((e) => console.error('compose', e)),
    initDownloader().catch((e) => console.error('download', e)),
  ]);
  await initShowcase().catch((e) => console.error('showcase', e));
  if (current === 'showcase') resumeShowcase();
  document.fonts?.ready?.then(() => current && moveIndicator(current));
  renderEnv();
}

boot();
