// 시작점 — 메뉴 전환과 각 화면 초기화

import { $, $$ } from './util.js';
import { inArtifact, canPickFolder, serverInfo, aiAvailable, accessCode, setAccessCode } from './platform.js';
import { initShorts, pauseShorts } from './shorts.js';
import { initCompose } from './compose.js';
import { initDownloader } from './downloader.js';

const VIEWS = ['shorts', 'compose', 'download', 'guide'];

function show(view) {
  if (!VIEWS.includes(view)) view = 'shorts';
  for (const sec of $$('.view')) sec.hidden = sec.dataset.view !== view;
  for (const a of $$('.nav a')) {
    if (a.dataset.view === view) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  if (view !== 'shorts') pauseShorts();
}

function currentView() {
  return location.hash.replace('#', '') || 'shorts';
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
    ['AI 대본', ai ? '사용 가능' : inArtifact ? '사용할 수 없음' : '서버에 ANTHROPIC_API_KEY·ACCESS_CODE를 넣으면 켜집니다', ai],
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

async function boot() {
  window.addEventListener('hashchange', () => show(currentView()));
  show(currentView());
  await Promise.all([
    initShorts().catch((e) => console.error('shorts', e)),
    initCompose().catch((e) => console.error('compose', e)),
    initDownloader().catch((e) => console.error('download', e)),
  ]);
  renderEnv();
}

boot();
