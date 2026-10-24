// 매물 사진으로 쇼츠 만들기(단계 1~6)와 맨 위 'AI 키' 칸.
//  ① 매물 사진 넣기 → 장면으로 들어감(숏폼 화면의 addImageFiles 그대로), 썸네일로 순서 바꾸기·빼기
//  ② 매물 정보(선택)·중개사무소 정보(store 'office' 에 기억)·화면 비율·쓸 AI
//  ③ AI 로 매물 설명 대본: 사진(최대 10장, 1024px)과 적은 정보 → llm.generateJSON(buildListingPrompt, LISTING_SCHEMA)
//     → normalizeListingResult → 장면 순서를 photo 번호대로 다시 짜고 자막·읽을 문장(scene.narration)·제목·업로드 글을 넣음
//  ④ 목소리: 제미나이(기본·무료 한도) / 내 목소리 녹음 / 일레븐랩스 / Fish Audio → 내레이션 자리 + 장면 길이를 읽을 문장 비율로
//  ⑤ 영상 만들기(숏폼 화면의 exportVideo 그대로)  ⑥ 영상 저장·업로드 글 복사·업무 대시보드로 보내기(outbox.js)
// 이 상자는 아래 숏폼 화면(스타일·장면·소리·미리보기)과 같은 project 를 씁니다 — shorts.js 가 initListing(api) 로 손잡이를 넘겨 줍니다.
// 사진·소리는 서버로 보내지 않습니다(사용자가 고른 AI 서비스로만 바로). AI 키는 keys.js 한 곳에만 있고 프로젝트 .json 에 넣지 않습니다.

import { $, store, toast, formatTime, wireDrop, clamp, debounce } from './util.js';
import { KEY_PROVIDERS, getKey, setKey, clearKeys, rememberKeys, setRemember, onKeysChange } from './keys.js';
import { LLM_PROVIDERS, llmProviderOf, pickProvider, generateJSON, imageToBase64 } from './llm.js';
import {
  buildListingPrompt, LISTING_SCHEMA, normalizeListingResult, disclosureLines, captionLength, CAPTION_MAX,
  missingDisclosure, isBuildingType, findBannedWords,
} from './listing-prompt.js';
import { providerOf as voiceOf } from './tts.js';
import { canRecord, startRecording, decodeAudio, trimSilence, audioBufferToWavBlob } from './recorder.js';
import { sendToDashboard, dashboardAvailable } from './outbox.js';
import { inArtifact, saveBlob, copyText, serverInfo } from './platform.js';
import { plainText } from './shorts-render.js';

// ════════════════════════════════════════════════════════
// 맨 위 'AI 키' 칸
// ════════════════════════════════════════════════════════
const KEY_ROWS = { keyRowsMain: ['gemini'], keyRowsText: ['claude', 'openai'], keyRowsVoice: ['elevenlabs', 'fish'] };
const KEY_PLACEHOLDER = {
  gemini: 'AIza… 로 시작하는 키',
  claude: 'sk-ant-… 로 시작하는 키',
  openai: 'sk-… 로 시작하는 키',
  elevenlabs: '일레븐랩스 API 키',
  fish: 'Fish Audio API 키',
};
const KEY_OK = /^[\x21-\x7E]{8,300}$/; // keys.js 와 같은 글자 검사(빠른 확인용 — 저장은 keys.js 가 한 번 더 검사)
let keyBarReady = false;
let keyQuiet = false; // 이 칸에서 바꾼 키 → 입력 칸 값을 다시 덮어쓰지 않음

const keyInput = (id) => document.getElementById(`key-${id}`);
const keyStatus = (id) => document.getElementById(`key-${id}-st`);

function applyKey(id, value) {
  keyQuiet = true;
  try { setKey(id, value); } finally { keyQuiet = false; }
}

function makeKeyRow(p) {
  const id = `key-${p.id}`;
  const row = document.createElement('div');
  row.className = `key-row${p.primary ? ' primary' : ''}`;
  row.dataset.key = p.id;

  const head = document.createElement('div');
  head.className = 'key-label';
  const label = document.createElement('label');
  label.htmlFor = id;
  label.textContent = `${p.name} API 키`;
  const hint = document.createElement('small');
  hint.className = 'hint';
  hint.textContent = p.hint;
  head.append(label, hint);
  if (p.url && !p.primary) {
    const a = document.createElement('a');
    a.href = p.url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.className = 'key-link';
    a.textContent = '발급 ↗';
    a.setAttribute('aria-label', `${p.name} 키 발급 화면 열기`);
    head.append(a);
  }

  const box = document.createElement('div');
  box.className = 'key-input';
  const input = document.createElement('input');
  input.type = 'password';
  input.id = id;
  input.name = `mrkv-${p.id}-key`;
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.setAttribute('autocapitalize', 'off');
  input.setAttribute('autocorrect', 'off');
  input.setAttribute('data-lpignore', 'true'); // 비밀번호 관리자가 '로그인 칸'으로 오해하지 않게
  input.setAttribute('data-1p-ignore', 'true');
  input.placeholder = KEY_PLACEHOLDER[p.id] || '';
  input.setAttribute('aria-describedby', `${id}-st`);
  input.value = getKey(p.id);

  const show = document.createElement('button');
  show.type = 'button';
  show.className = 'btn small ghost';
  show.textContent = '보이기';
  show.setAttribute('aria-pressed', 'false');
  show.setAttribute('aria-label', `${p.name} 키 보이기`);
  show.addEventListener('click', () => {
    const on = input.type === 'password';
    input.type = on ? 'text' : 'password';
    show.textContent = on ? '가리기' : '보이기';
    show.setAttribute('aria-pressed', String(on));
  });

  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'btn small ghost';
  clear.textContent = '지우기';
  clear.setAttribute('aria-label', `${p.name} 키 지우기`);
  clear.addEventListener('click', () => {
    input.value = '';
    applyKey(p.id, '');
    setKeyStatus(p.id, '지웠습니다.', '');
    input.focus();
  });
  box.append(input, show, clear);

  const st = document.createElement('small');
  st.className = 'key-st';
  st.id = `${id}-st`;
  st.setAttribute('aria-live', 'polite');

  // 붙여 넣으면 바로 넣고(글자 검사 통과 시), 칸을 떠날 때 한 번 더 확인합니다. 오류 문구에 키는 넣지 않습니다.
  input.addEventListener('input', () => {
    const v = input.value.trim();
    if (!v) { applyKey(p.id, ''); setKeyStatus(p.id, '', ''); return; }
    if (KEY_OK.test(v)) {
      try { applyKey(p.id, v); setKeyStatus(p.id, '✓ 넣었습니다', 'ok'); } catch (e) { setKeyStatus(p.id, e.message, 'bad'); }
    } else setKeyStatus(p.id, '', '');
  });
  input.addEventListener('change', () => {
    const v = input.value.trim();
    if (!v) return;
    try {
      applyKey(p.id, v);
      setKeyStatus(p.id, '✓ 넣었습니다', 'ok');
    } catch (e) {
      applyKey(p.id, ''); // 잘못된 글자가 섞였으면 예전 키도 쓰지 않음(화면에 보이는 것과 쓰는 키가 다르지 않게)
      setKeyStatus(p.id, e.message, 'bad');
    }
  });
  row.append(head, box, st);
  return row;
}

function setKeyStatus(id, text, kind) {
  const st = keyStatus(id);
  if (!st) return;
  st.textContent = text;
  st.className = `key-st${kind ? ` ${kind}` : ''}`;
}

/** 접힌 상태의 칩: 서비스마다 ✓/미입력. 하나도 없으면 안내 한 줄. */
function renderKeyChips() {
  const box = $('#keyChips');
  if (!box) return;
  box.textContent = '';
  const any = KEY_PROVIDERS.some((p) => getKey(p.id));
  if (!any) {
    const c = document.createElement('span');
    c.className = 'kchip lead';
    c.textContent = 'AI 키를 넣으면 대본을 자동으로 씁니다';
    const f = document.createElement('span');
    f.className = 'kchip free';
    f.textContent = '제미나이 키는 무료로 받을 수 있어요';
    box.append(c, f);
    return;
  }
  for (const p of KEY_PROVIDERS) {
    const has = !!getKey(p.id);
    const c = document.createElement('span');
    c.className = `kchip ${has ? 'on' : 'off'}`;
    c.dataset.key = p.id;
    c.textContent = `${p.name} ${has ? '✓' : '미입력'}`;
    box.append(c);
  }
}

function renderKeyBar({ syncInputs = true } = {}) {
  renderKeyChips();
  const rem = $('#keyRemember');
  if (rem) rem.checked = rememberKeys();
  const toggle = $('#keyToggle');
  if (toggle && $('#keyBody').hidden) toggle.textContent = KEY_PROVIDERS.some((p) => getKey(p.id)) ? '키 바꾸기' : '키 넣기';
  if (!syncInputs) return;
  for (const p of KEY_PROVIDERS) {
    const input = keyInput(p.id);
    if (input && input !== document.activeElement && input.value.trim() !== getKey(p.id)) input.value = getKey(p.id);
  }
}

function setKeyBarOpen(open) {
  const body = $('#keyBody');
  const toggle = $('#keyToggle');
  if (!body || !toggle) return;
  body.hidden = !open;
  toggle.setAttribute('aria-expanded', String(open));
  toggle.textContent = open ? '접기' : (KEY_PROVIDERS.some((p) => getKey(p.id)) ? '키 바꾸기' : '키 넣기');
}

/**
 * 'AI 키' 칸을 펼치고 그 서비스 칸으로 옮겨 갑니다(키가 없을 때 여러 곳에서 부름).
 * @param {{ focus?: string, scroll?: boolean }} [o]
 */
export function openKeyBar({ focus = 'gemini', scroll = true } = {}) {
  const bar = $('#aiKeys');
  if (!bar || bar.hidden) return;
  setKeyBarOpen(true);
  const input = keyInput(focus) || keyInput('gemini');
  if (scroll) bar.scrollIntoView({ behavior: 'smooth', block: 'start' });
  input?.focus({ preventScroll: true });
}

/** 'AI 키' 칸을 그립니다(한 번만). 칸 목록은 keys.js KEY_PROVIDERS 를 따릅니다. */
export function initKeyBar() {
  if (keyBarReady) return;
  const bar = $('#aiKeys');
  if (!bar) return;
  keyBarReady = true;
  // Claude 미리보기에서는 외부 AI 호출이 막혀 있어(보는 사람의 Claude 를 씀) 키 칸을 숨깁니다.
  if (inArtifact) { bar.hidden = true; return; }
  for (const [boxId, ids] of Object.entries(KEY_ROWS)) {
    const box = document.getElementById(boxId);
    if (!box) continue;
    for (const id of ids) {
      const p = KEY_PROVIDERS.find((x) => x.id === id);
      if (p) box.append(makeKeyRow(p));
    }
  }
  $('#keyToggle').addEventListener('click', () => {
    const open = $('#keyBody').hidden;
    setKeyBarOpen(open);
    if (open) keyInput(KEY_PROVIDERS.find((p) => !getKey(p.id))?.id || 'gemini')?.focus({ preventScroll: true });
  });
  $('#keyRemember').addEventListener('change', (e) => {
    setRemember(e.target.checked);
    toast(e.target.checked ? '키를 이 브라우저에 기억합니다. 같이 쓰는 PC 라면 끝나고 “키 모두 지우기”를 눌러 주세요.' : '키를 이 탭에만 둡니다. 탭을 닫으면 지워집니다.');
  });
  $('#keyClearAll').addEventListener('click', () => {
    clearKeys();
    for (const p of KEY_PROVIDERS) { const i = keyInput(p.id); if (i) i.value = ''; setKeyStatus(p.id, '', ''); }
    toast('AI 키를 모두 지웠습니다.');
  });
  onKeysChange(() => renderKeyBar({ syncInputs: !keyQuiet }));
  renderKeyBar();
}

// ════════════════════════════════════════════════════════
// 매물 사진으로 쇼츠 만들기
// ════════════════════════════════════════════════════════
/** AI 에 보내는 사진 수 한도 */
export const MAX_AI_PHOTOS = 10;

// ② 매물 칸 — 아래 6개(사용승인일~관리비)는 건축물 항목(토지가 아니면 보임, listing-prompt.js FACT_FIELDS need:'building')
const FACT_INPUTS = [
  ['lsType', 'propertyType'], ['lsDeal', 'dealType'], ['lsPrice', 'price'], ['lsArea', 'area'], ['lsLoc', 'location'], ['lsFloor', 'floor'], ['lsMemo', 'memo'],
  ['lsApproval', 'approvalDate'], ['lsDir', 'direction'], ['lsRooms', 'rooms'], ['lsMoveIn', 'moveIn'], ['lsParking', 'parking'], ['lsMaint', 'maintenance'],
];
const OFFICE_INPUTS = [['lsOfName', 'name'], ['lsOfAgent', 'agent'], ['lsOfReg', 'regNo'], ['lsOfAddr', 'address'], ['lsOfPhone', 'phone']];
const VOICE_TABS = ['gemini', 'record', 'elevenlabs', 'fish'];
const STEP_NAMES = ['', '매물 사진 넣기', '매물 정보', 'AI 대본 만들기', '목소리 넣기', '영상 만들기', '저장하고 보내기'];

/** 글자 칸 값 정리(문자열만, 앞뒤 공백 제거, 길이 제한) */
const cleanStr = (v, max = 200) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
function cleanObj(obj, keys) {
  const out = {};
  for (const k of keys) out[k] = cleanStr(obj?.[k]);
  return out;
}

let api = null;
const saved = store.get('listing', {}) || {};
const ls = {
  facts: cleanObj({}, FACT_INPUTS.map(([, k]) => k)),
  office: cleanObj(store.get('office', {}), OFFICE_INPUTS.map(([, k]) => k)),
  ai: ['auto', ...LLM_PROVIDERS.map((p) => p.id)].includes(saved.ai) ? saved.ai : 'auto',
  voiceTab: VOICE_TABS.includes(saved.voiceTab) ? saved.voiceTab : 'gemini',
  gen: null, // AI 대본 진행 { abort }
  voice: null, // 목소리 만들기 진행 { abort, id }
  rec: null, // 녹음 중 { handle, timer, script }
  recStarting: null, // 마이크 허용을 기다리는 중 { cancelled } — 두 번 눌러 녹음기가 둘 생기지 않게
  recResult: null, // 마지막 녹음 { url, duration }
  recAudio: null, // 듣기용 <audio>
  sending: false,
  sent: false,
  saved: false,
  dashOk: false,
  scriptIds: '', // 대본 목록이 그려진 장면 id 묶음(같으면 다시 그리지 않고 값만 맞춤)
  lastBlob: null, // 마지막으로 본 결과 영상(바뀌면 ⑥ 표시를 새로)
  lastStep: 0,
  sendConfirm: '', // ⑥ 보내기 경고(예전 영상·빠진 표시 항목)를 보여 준 내용 — 같은 경고에서 한 번 더 누르면 보냄
  staleVoice: false, // '예전 대본 목소리' 안내를 이미 띄웠는지
  staleVideo: false, // '예전 영상' 안내를 이미 띄웠는지
  autoTitle: '', // 이 상자가 ② 정보로 만들어 넣은 제목(사용자가 고치지 않았으면 정보가 바뀔 때 같이 바꿈)
  autoChannel: typeof saved.autoChannel === 'string' ? saved.autoChannel : '', // 이 상자가 넣은 영상 이름(상호)
  autoEnding: saved.autoEnding && typeof saved.autoEnding === 'object' ? saved.autoEnding : null, // 이 상자가 넣은 엔딩 { text, sub }
};
const saveListingPrefs = () => store.set('listing', { ai: ls.ai, voiceTab: ls.voiceTab, autoChannel: ls.autoChannel, autoEnding: ls.autoEnding });
/** 상태 칸의 처음 안내 문구(index.html) — 프로젝트를 새로 열 때 되돌림 */
const NOTES = {};
const saveOffice = debounce(() => store.set('office', ls.office), 300);

/** 사용자가 고른 매물 사진 장면(예시 장면은 뺌) */
const photoScenes = () => api.project.scenes.filter((s) => s.img && !s.sample);
/** 건축물 칸(종류가 토지면 숨김) — 숨긴 칸에 남은 값은 대본·표시 항목에 넣지 않음 */
const BUILDING_KEYS = new Set(['approvalDate', 'direction', 'rooms', 'moveIn', 'parking', 'maintenance']);
/** 적은 사실만(빈 칸은 뺌) — 프롬프트와 필수 표시 항목에 씀 */
function factsFilled() {
  const out = {};
  const land = ls.facts.propertyType === '토지';
  for (const [, k] of FACT_INPUTS) if (ls.facts[k] && !(land && BUILDING_KEYS.has(k))) out[k] = ls.facts[k];
  return out;
}
const anyFilled = (o) => Object.values(o || {}).some((v) => String(v || '').trim());
/** 읽을 대본 — 장면마다 읽을 문장(없으면 자막) 한 줄씩 */
const readScript = () => api.project.scenes.map(api.spokenText).filter(Boolean).join('\n');
/** 읽을 문장 길이로 장면 길이 어림(목소리를 넣기 전 미리보기용, 목소리를 넣으면 실제 길이로 다시 맞춤) */
const estimateDuration = (text) => Math.round(clamp(0.6 + plainText(text).length * 0.15, 2.5, 9) * 10) / 10;

function say(id, text, kind = '') {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('bad', kind === 'bad');
  el.classList.toggle('ok', kind === 'ok');
}

// ── ① 사진 ──────────────────────────────────────────
function renderThumbs() {
  const list = $('#lsThumbs');
  const photos = photoScenes();
  const focusedId = document.activeElement?.closest?.('#lsThumbs li')?.dataset.id;
  const focusedAct = document.activeElement?.dataset?.act;
  list.textContent = '';
  photos.forEach((s, i) => {
    const li = document.createElement('li');
    li.className = 'ls-thumb';
    li.dataset.id = s.id;
    const im = document.createElement('img');
    im.src = s.img.src;
    im.alt = `${i + 1}번 사진`;
    const no = document.createElement('span');
    no.className = 'ls-thumb-no';
    no.textContent = String(i + 1);
    if (i >= MAX_AI_PHOTOS) no.title = 'AI 에는 보내지 않는 사진(10장 넘음)';
    const tools = document.createElement('div');
    tools.className = 'ls-thumb-tools';
    const mk = (act, label, aria, fn, disabled = false) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.act = act;
      b.textContent = label;
      b.setAttribute('aria-label', aria);
      b.title = aria;
      b.disabled = disabled || !!ls.gen;
      b.addEventListener('click', fn);
      return b;
    };
    tools.append(
      mk('prev', '←', `${i + 1}번 사진 앞으로`, () => movePhoto(s, -1), i === 0),
      mk('next', '→', `${i + 1}번 사진 뒤로`, () => movePhoto(s, 1), i === photos.length - 1),
      mk('del', '✕', `${i + 1}번 사진 빼기`, () => removePhoto(s)),
    );
    li.append(im, no, tools);
    list.append(li);
  });
  list.hidden = !photos.length;
  if (focusedId) {
    const li = list.querySelector(`li[data-id="${focusedId}"]`);
    const b = li?.querySelector(`button[data-act="${focusedAct}"]:not(:disabled)`) || li?.querySelector('button:not(:disabled)');
    b?.focus({ preventScroll: true });
  }
  const over = photos.length > MAX_AI_PHOTOS ? ` · AI 에는 앞의 ${MAX_AI_PHOTOS}장만 보냅니다(나머지는 자막 없이 뒤에 붙음)` : '';
  $('#lsPhotoHint').textContent = photos.length
    ? `사진 ${photos.length}장 = 장면 ${photos.length}개${over}. ←·→ 로 순서를 바꾸고 ✕ 로 뺍니다.`
    : '외관 → 거실 → 주방 → 방 → 욕실 → 주변처럼 보기 좋은 순서로 놓으면 AI 도 그 흐름을 참고합니다. 순서는 AI 가 다시 짤 수 있습니다.';
}

/** 사진 장면을 앞/뒤 사진 장면과 맞바꿉니다(사이에 있는 글자 장면은 그대로). */
function movePhoto(scene, d) {
  if (ls.gen) return;
  const photos = photoScenes();
  const i = photos.indexOf(scene);
  const other = photos[i + d];
  if (!other) return;
  const arr = api.project.scenes;
  const a = arr.indexOf(scene);
  const b = arr.indexOf(other);
  [arr[a], arr[b]] = [arr[b], arr[a]];
  api.changed(true);
}

function removePhoto(scene) {
  if (ls.gen) return;
  const arr = api.project.scenes;
  const i = arr.indexOf(scene);
  if (i < 0) return;
  arr.splice(i, 1);
  api.changed(true);
  toast('사진 한 장을 뺐습니다.');
}

async function addPhotos(files) {
  if (ls.gen) return toast('대본을 만드는 중에는 사진을 넣을 수 없습니다. 끝나거나 멈춘 뒤 넣어 주세요.');
  const n = await api.addImageFiles(files);
  if (!n) return;
  // 예시(강의) 제목이 그대로면 ② 정보로 만든 매물 제목으로 바꿉니다(엉뚱한 강의 제목으로 영상·파일·업로드 글이 나가지 않게)
  syncAutoTitle(true);
  applyOfficeBrand();
  api.seek(0.6); // 미리보기에 넣은 사진이 바로 보이게
}

/** ②에 적은 위치·종류·거래로 만든 기본 제목(예: "수원시 영통구 이의동 *아파트* 매매"). 아무것도 없으면 '*매물* 소개'. */
function autoTitle() {
  const f = ls.facts;
  const parts = [f.location, f.propertyType && `*${f.propertyType}*`, f.dealType].filter(Boolean);
  return parts.length ? parts.join(' ') : '*매물* 소개';
}

/**
 * 제목을 ② 정보로 맞춥니다. 예시 제목(fromSample 일 때)이거나 이 상자가 넣은 제목 그대로일 때만 — 사용자가 고친 제목·AI 제목은 건드리지 않음.
 */
function syncAutoTitle(fromSample = false) {
  if (!photoScenes().length) return;
  const t = api.project.title;
  const mine = ls.autoTitle && t === ls.autoTitle;
  if (!mine && !(fromSample && api.isSampleTitle(t))) return;
  const next = autoTitle();
  ls.autoTitle = next;
  if (next !== t) api.setTitle(next);
}

/**
 * 수강생(중개사) 매물 영상이 강사 채널 이름·강의 구독 엔딩으로 나가지 않게, 영상 왼쪽 위 이름을 상호로, 엔딩을 문의 안내로 바꿉니다.
 * 처음 값(DEFAULTS)이거나 이 상자가 넣은 값 그대로일 때만 바꾸고, 사용자가 아래 세부 조절에서 고친 값은 그대로 둡니다.
 */
function applyOfficeBrand() {
  const p = api.project;
  const d = api.defaults;
  const name = ls.office.name;
  if (name && (p.channel === d.channel || (ls.autoChannel && p.channel === ls.autoChannel))) {
    if (p.channel !== name) api.setChannel(name);
    ls.autoChannel = name;
  }
  const end = { text: '*문의*는 설명란 연락처로', sub: [ls.office.name, ls.office.phone].filter(Boolean).join(' ') };
  const e = p.ending || {};
  const isDefault = e.text === d.ending.text && e.sub === d.ending.sub;
  const isMine = ls.autoEnding && e.text === ls.autoEnding.text && e.sub === ls.autoEnding.sub;
  if (isDefault || isMine) {
    if (e.text !== end.text || e.sub !== end.sub) api.setEnding({ text: end.text, sub: end.sub });
    ls.autoEnding = end;
  }
  saveListingPrefs();
}

// ── ② 정보 ──────────────────────────────────────────
function fillInfoFields() {
  for (const [id, k] of FACT_INPUTS) { const el = document.getElementById(id); if (el) el.value = ls.facts[k] || ''; }
  for (const [id, k] of OFFICE_INPUTS) { const el = document.getElementById(id); if (el) el.value = ls.office[k] || ''; }
}

/** 종류가 토지가 아니면 건축물 항목(사용승인일·방향·방/욕실·입주일·주차·관리비)을 보여 줍니다. */
function renderBuildingFields() {
  const box = $('#lsBld');
  if (!box) return;
  const t = ls.facts.propertyType;
  box.hidden = t === '토지';
  const note = $('#lsBldNote');
  if (note) note.textContent = isBuildingType(t) ? `${t} — 건축물이라 아래 항목도 밝혀야 합니다.` : '종류를 고르면 필요한 항목을 알려 드립니다(토지는 이 칸이 없어집니다).';
}

/** 매물·사무소 정보가 바뀌면 이미 만든 업로드 글 끝의 필수 표시 항목도 새로 맞춥니다. */
function refreshDisclosure() {
  const u = api.uploadInfo;
  if (u?.source !== 'listing') return;
  api.setUploadInfo({ ...u, disclosure: disclosureLines(ls.office, factsFilled()) });
}

function renderAiSelect() {
  const sel = $('#lsAi');
  for (const opt of sel.options) {
    if (opt.value === 'auto') continue;
    const p = llmProviderOf(opt.value);
    const has = !!getKey(opt.value);
    opt.disabled = !has;
    opt.textContent = `${p?.name || opt.value}${has ? '' : ' (키 없음)'}`;
  }
  if (ls.ai !== 'auto' && !getKey(ls.ai)) ls.ai = 'auto';
  sel.value = ls.ai;
  const auto = sel.options[0];
  const first = pickProvider();
  auto.textContent = first ? `자동 — ${llmProviderOf(first).name}` : '자동 (제미나이 먼저)';
}

// ── ③ 대본 ──────────────────────────────────────────
async function generate() {
  if (ls.gen) { ls.gen.abort.abort(); return; }
  const out = (t, k) => say('lsGenStatus', t, k);
  if (inArtifact) return out('Claude 미리보기에서는 매물 대본 AI 를 쓸 수 없습니다. ko372.com 에서 써 주세요.', 'bad');
  if (ls.rec || ls.recStarting) return out('녹음을 먼저 멈춰 주세요. 녹음하는 동안 대본이 바뀌면 읽은 내용과 어긋납니다.', 'bad');
  const photos = photoScenes();
  if (!photos.length) { out('매물 사진을 먼저 넣어 주세요(① 매물 사진 넣기).', 'bad'); $('#lsFiles')?.focus(); return; }
  if (api.busy) return out('영상이나 목소리를 만드는 중입니다. 끝난 뒤 다시 눌러 주세요.', 'bad');
  const provider = pickProvider(ls.ai === 'auto' ? undefined : ls.ai);
  if (!provider) {
    out('AI 키가 없습니다. 맨 위 AI 키 칸에 제미나이 키(무료)를 넣어 주세요.', 'bad');
    openKeyBar({ focus: 'gemini' });
    return;
  }
  const P = llmProviderOf(provider);
  const used = photos.slice(0, MAX_AI_PHOTOS);
  const usedImgs = used.map((s) => s.img);
  const token = api.projectToken;
  const abort = new AbortController();
  ls.gen = { abort };
  // 쓰는 동안(10~60초) 아래 장면 목록 ✕·사진 넣기·프로젝트 열기로 장면이 바뀌면 결과가 엉뚱한 사진·매물에 붙으므로 잠급니다
  api.lockStructure('AI 가 대본을 쓰는 중에는 장면·사진을 바꾸거나 프로젝트를 열 수 없습니다. 끝나거나 ‘멈춤’을 누른 뒤 해 주세요.');
  renderButtons();
  renderThumbs();
  try {
    out(`사진 ${used.length}장을 1024px 로 줄이는 중…`);
    const images = [];
    for (const s of used) {
      const { mime, base64 } = await imageToBase64(s.img, { max: 1024, quality: 0.85 });
      images.push({ mime, base64 });
      if (abort.signal.aborted) throw Object.assign(new Error('멈춤'), { name: 'AbortError' });
    }
    const st = api.currentStyle();
    const prompt = buildListingPrompt({
      facts: factsFilled(),
      office: ls.office,
      photoCount: used.length,
      style: st ? { name: st.name, hint: api.styleHintOf(st) } : undefined,
      aspect: api.project.aspect,
    });
    out(`${P.name}가 사진 ${used.length}장을 보고 대본을 쓰는 중… (보통 10~60초)`);
    const data = await generateJSON({ provider, prompt, schema: LISTING_SCHEMA, images, signal: abort.signal });
    const r = normalizeListingResult(data, used.length);
    // 잠금으로 막았어도 남는 경합(다른 탭·늦은 이벤트)에 대비: 보낸 사진이 그대로 있는지, 그사이 장면 묶음이 통째로 바뀌지 않았는지
    const alive = new Set(api.project.scenes);
    if (used.some((s, i) => !alive.has(s) || s.img !== usedImgs[i]) || token !== api.projectToken) {
      throw new Error('대본을 쓰는 동안 사진이나 프로젝트가 바뀌어 적용하지 않았습니다. 다시 눌러 주세요.');
    }
    const note = applyResult(r, used);
    const warn = [];
    if (r.longCount) warn.push(`자막이 긴 장면 ${r.longCount}개 — 아래 빨간 글자 수를 ${CAPTION_MAX}자 이내로 줄여 주세요.`);
    if (r.banned?.length) warn.push(`과장 표현으로 보일 수 있는 말: ${r.banned.join('·')} — 표시·광고 규정에 걸리지 않게 고쳐 주세요.`);
    out(`${P.name}로 장면 ${r.scenes.length}개 대본을 만들었습니다. 아래에서 자막·읽을 문장을 고칠 수 있습니다. 가격·면적 같은 숫자는 올리기 전에 꼭 확인하세요.${note}${warn.length ? ` ${warn.join(' ')}` : ''}`, warn.length ? 'bad' : 'ok');
    if (!anyFilled(ls.office)) toast('중개사무소 정보(②)를 넣으면 업로드 설명 끝에 필수 표시 항목이 붙습니다.', 4500);
  } catch (e) {
    if (e?.name === 'AbortError') out('대본 만들기를 멈췄습니다.');
    else {
      out(e?.message || '대본을 만들지 못했습니다. 다시 시도해 보세요.', 'bad');
      if (/키가 (맞지 않|없)|키도 확인/.test(e?.message || '')) openKeyBar({ focus: provider });
    }
  } finally {
    ls.gen = null;
    api.unlockStructure();
    renderButtons();
    renderThumbs();
  }
}

/**
 * AI 결과를 장면에 넣습니다. used[i] = AI 에 i 번으로 보낸 사진 장면.
 * 장면 순서는 AI 가 고른 photo 번호 순서. 같은 사진을 두 번 쓰면 복사본 장면을 만들고, AI 가 안 쓴 사진은 마지막(문의 안내) 앞에 자막 없이.
 * @returns {string} 상태 칸에 덧붙일 말
 */
function applyResult(r, used) {
  const usedSet = new Set();
  const scenes = [];
  // 이미 목소리가 있으면 장면 길이를 글자 수 어림값으로 바꾸지 않습니다(예전 목소리와 길이가 더 어긋나지 않게) — 대신 다시 만들라고 알림
  const hadVoice = !!api.audio.narr;
  const hadVideo = !!api.resultBlob;
  for (const rs of r.scenes) {
    const base = used[rs.photo];
    if (!base) continue;
    let sc = base;
    if (usedSet.has(base)) sc = api.newScene(base.img, '', { img2: base.img2 || null });
    usedSet.add(base);
    Object.assign(sc, { caption: rs.caption, narration: rs.narration, kind: 'normal', sample: false, hint: '' });
    if (!hadVoice) sc.duration = estimateDuration(rs.narration);
    scenes.push(sc);
  }
  const rest = photoScenes().filter((s) => !usedSet.has(s));
  for (const s of rest) Object.assign(s, { caption: '', narration: '', kind: 'normal' });
  if (rest.length && scenes.length > 1) scenes.splice(scenes.length - 1, 0, ...rest);
  else scenes.push(...rest);
  const textScenes = api.project.scenes.filter((s) => !s.img && !s.sample).length;
  if (scenes[0]) scenes[0].kind = 'hook';
  if (scenes.length > 1) scenes[scenes.length - 1].kind = 'cta';
  api.setScenes(scenes);
  if (r.title) { api.setTitle(r.title); ls.autoTitle = ''; }
  applyOfficeBrand(); // 영상 왼쪽 위 이름 = 상호, 엔딩 = 문의 안내(사용자가 고친 값은 그대로)
  const u = r.upload || {};
  api.setUploadInfo({
    source: 'listing',
    title: u.youtubeTitle || plainText(r.title).replace(/\n/g, ' ').trim(),
    description: u.youtubeDescription || '',
    hashtags: u.hashtags || [],
    platforms: { instagram: u.instagram || '', tiktok: u.tiktok || '', threads: u.threads || '', facebook: u.facebook || '' },
    disclosure: disclosureLines(ls.office, factsFilled()),
  });
  ls.sent = false;
  renderScriptList(true);
  api.seek(0.6);
  const notes = [];
  if (hadVoice) notes.push('지금 목소리는 예전 대본으로 만든 것이라 ④에서 다시 만들어 주세요(장면 길이는 그대로 두었습니다).');
  if (hadVideo) notes.push('영상도 ⑤에서 다시 만들어 주세요.');
  if (rest.length) notes.push(`AI 가 쓰지 않은 사진 ${rest.length}장은 자막 없이 마지막 장면 앞에 넣었습니다.`);
  if (textScenes) notes.push(`글자 장면 ${textScenes}개는 빼고 사진 장면으로 다시 짰습니다.`);
  return notes.length ? ` ${notes.join(' ')}` : '';
}

const KIND_TAG = { hook: '첫 장면(훅)', cta: '마지막(문의 안내)' };

/** ③ 결과 목록: 장면별 자막·읽을 문장을 고쳐 쓰는 칸. 장면 순서가 그대로면 다시 그리지 않고 값만 맞춥니다. */
function renderScriptList(force = false) {
  const list = $('#lsScript');
  const scenes = api.project.scenes;
  const has = scenes.some((s) => s.narration);
  list.hidden = !has;
  if (!has) { list.textContent = ''; ls.scriptIds = ''; return; }
  const ids = scenes.map((s) => `${s.id}:${s.kind}`).join(',');
  if (!force && ids === ls.scriptIds) { syncScriptValues(); return; }
  ls.scriptIds = ids;
  list.textContent = '';
  scenes.forEach((s, i) => {
    const li = document.createElement('li');
    li.className = 'ls-line';
    li.dataset.id = s.id;
    const th = document.createElement('div');
    th.className = 'ls-line-thumb';
    th.setAttribute('aria-hidden', 'true');
    if (s.img) { const im = document.createElement('img'); im.src = s.img.src; im.alt = ''; th.append(im); } else th.textContent = '글자';
    const body = document.createElement('div');
    body.className = 'ls-line-body';
    const head = document.createElement('div');
    head.className = 'ls-line-head';
    const b = document.createElement('b');
    b.textContent = `장면 ${i + 1}`;
    head.append(b);
    if (KIND_TAG[s.kind]) { const t = document.createElement('span'); t.className = 'tag'; t.textContent = KIND_TAG[s.kind]; head.append(t); }
    const count = document.createElement('small');
    count.className = 'ls-count';
    // 과장·단정으로 보일 수 있는 말(최고·무조건…) 표시 — 자동으로 지우지는 않고 알려만 줍니다
    const flag = document.createElement('small');
    flag.className = 'ls-flag';
    flag.hidden = true;
    head.append(count, flag);

    const capId = `lsCap-${s.id}`;
    const capLabel = document.createElement('label');
    capLabel.htmlFor = capId;
    capLabel.className = 'ls-line-label';
    capLabel.textContent = '화면 자막';
    const cap = document.createElement('input');
    cap.type = 'text';
    cap.id = capId;
    cap.maxLength = 60;
    cap.value = s.caption;
    cap.dataset.field = 'caption';
    let nar;
    const showCount = () => {
      const n = captionLength(cap.value);
      count.textContent = n > CAPTION_MAX ? `자막 ${n}자 · ${CAPTION_MAX}자 이내로` : `자막 ${n}자`;
      count.classList.toggle('warn', n > CAPTION_MAX);
      const words = findBannedWords(cap.value, nar ? nar.value : s.narration || '');
      flag.hidden = !words.length;
      flag.textContent = words.length ? `과장 표현? ${words.join('·')}` : '';
    };
    li.refresh = showCount; // 다른 곳(장면 목록)에서 고친 값이 들어오면 글자 수·표시도 다시
    cap.addEventListener('input', () => { s.caption = cap.value; showCount(); api.changed(false); });

    const narId = `lsNar-${s.id}`;
    const narLabel = document.createElement('label');
    narLabel.htmlFor = narId;
    narLabel.className = 'ls-line-label';
    narLabel.textContent = '읽을 문장';
    nar = document.createElement('textarea');
    nar.id = narId;
    nar.rows = 2;
    nar.maxLength = 400;
    nar.value = s.narration || '';
    nar.dataset.field = 'narration';
    nar.placeholder = '비워 두면 자막을 읽습니다';
    nar.addEventListener('input', () => { s.narration = nar.value; showCount(); api.changed(false); });
    showCount();
    cap.addEventListener('focus', () => seekScene(s));
    nar.addEventListener('focus', () => seekScene(s));

    body.append(head, capLabel, cap, narLabel, nar);
    li.append(th, body);
    list.append(li);
  });
}

/** 다른 곳(장면 목록)에서 고친 자막·읽을 문장을 이 목록에도 맞춥니다(지금 쓰는 칸은 그대로). */
function syncScriptValues() {
  const byId = new Map(api.project.scenes.map((s) => [s.id, s]));
  for (const li of $('#lsScript').children) {
    const s = byId.get(li.dataset.id);
    if (!s) continue;
    for (const el of li.querySelectorAll('[data-field]')) {
      if (el === document.activeElement) continue;
      const v = el.dataset.field === 'caption' ? s.caption : (s.narration || '');
      if (el.value !== v) el.value = v;
    }
    li.refresh?.();
  }
}

function seekScene(scene) {
  let t = 0;
  for (const s of api.project.scenes) {
    if (s === scene) break;
    t += clamp(Number(s.duration) || 3, 0.5, 30);
  }
  api.seek(t + 0.6);
}

// ── ④ 목소리 ────────────────────────────────────────
function selectTab(id, { focus = false } = {}) {
  if (!VOICE_TABS.includes(id)) id = 'gemini';
  ls.voiceTab = id;
  saveListingPrefs();
  for (const t of VOICE_TABS) {
    const tab = document.getElementById(`lsTab-${t}`);
    const pane = document.getElementById(`lsPane-${t}`);
    const on = t === id;
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
    pane.hidden = !on;
  }
  if (focus) document.getElementById(`lsTab-${id}`).focus();
  if (id === 'record') renderReader();
  if (id === 'fish') renderFishNote();
}

function wireTabs() {
  for (const t of VOICE_TABS) {
    const tab = document.getElementById(`lsTab-${t}`);
    tab.addEventListener('click', () => selectTab(t));
    tab.addEventListener('keydown', (e) => {
      const i = VOICE_TABS.indexOf(t);
      let j = -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % VOICE_TABS.length;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + VOICE_TABS.length) % VOICE_TABS.length;
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = VOICE_TABS.length - 1;
      if (j < 0) return;
      e.preventDefault();
      selectTab(VOICE_TABS[j], { focus: true });
    });
  }
}

/** 목소리 칸들을 tts 설정(store 'tts' — 소리 패널 '내레이션 만들기'와 같이 씀)대로 채웁니다. 지금 쓰는 칸은 그대로. */
function syncVoiceFields() {
  const t = api.tts;
  const g = voiceOf('gemini');
  const gs = $('#lsGemVoice');
  if (gs !== document.activeElement) gs.value = g.voices?.some((v) => v.id === t.voice.gemini) ? t.voice.gemini : g.voices?.[0]?.id || '';
  const el = $('#lsElVoice');
  if (el !== document.activeElement) el.value = t.voice.elevenlabs || '';
  const f = voiceOf('fish');
  const fv = $('#lsFishVoice');
  if (fv !== document.activeElement) fv.value = t.voice.fish || f.defaultVoice || '';
  const fm = $('#lsFishModel');
  if (fm !== document.activeElement) fm.value = f.models?.some((m) => m.id === t.model) ? t.model : f.models?.[0]?.id || '';
}

function wireVoiceFields() {
  const g = voiceOf('gemini');
  $('#lsGemVoice').replaceChildren(...(g.voices || []).map((v) => new Option(v.name, v.id)));
  $('#lsGemNote').textContent = g.freeNote || '';
  const f = voiceOf('fish');
  $('#lsFishModel').replaceChildren(...(f.models || []).map((m) => new Option(m.name, m.id)));
  const setVoice = (id, v) => { api.tts.voice[id] = String(v || '').trim(); api.saveTts(); api.refreshTts(); };
  $('#lsGemVoice').addEventListener('input', (e) => setVoice('gemini', e.target.value));
  $('#lsElVoice').addEventListener('input', (e) => setVoice('elevenlabs', e.target.value));
  $('#lsFishVoice').addEventListener('input', (e) => setVoice('fish', e.target.value));
  $('#lsFishModel').addEventListener('input', (e) => { api.tts.model = e.target.value; api.saveTts(); api.refreshTts(); });
  for (const b of document.querySelectorAll('#listingBox [data-run]')) b.addEventListener('click', () => runVoice(b.dataset.run));
  $('#lsVoiceCancel').addEventListener('click', () => ls.voice?.abort.abort());
  syncVoiceFields();
}

function renderFishNote() {
  const note = $('#lsFishNote');
  note.textContent = '';
  if (inArtifact) { note.textContent = 'Claude 미리보기에서는 목소리 만들기가 안 됩니다. ko372.com 에서 써 주세요.'; return; }
  serverInfo().then((info) => { if (!info.tts) note.textContent = 'Fish Audio 는 인터넷 배포 버전(ko372.com)에서만 됩니다.'; });
}

async function runVoice(id) {
  if (ls.voice || ls.rec || ls.recStarting) return;
  const out = (t, k) => say('lsVoiceStatus', t, k);
  if (inArtifact) return out('Claude 미리보기에서는 목소리 만들기가 안 됩니다. ko372.com 에서 써 주세요.', 'bad');
  if (ls.gen) return out('대본을 만드는 중입니다. 끝난 뒤 눌러 주세요.', 'bad');
  const p = voiceOf(id);
  if (!getKey(p.keyId || p.id)) {
    out(`${p.short} 키가 없습니다. 맨 위 AI 키 칸에 넣어 주세요. (${p.keyHint})`, 'bad');
    openKeyBar({ focus: p.keyId || p.id });
    return;
  }
  const text = readScript();
  if (!text) return out('읽을 대본이 없습니다. ③에서 대본을 먼저 만들거나 장면 자막을 넣어 주세요.', 'bad');
  const voice = id === 'gemini' ? $('#lsGemVoice').value : id === 'elevenlabs' ? $('#lsElVoice').value.trim() : $('#lsFishVoice').value.trim();
  if (!voice) { out(p.voiceLabel ? `${p.voiceLabel}를 넣어 주세요.` : '목소리를 골라 주세요.', 'bad'); return; }
  const abort = new AbortController();
  ls.voice = { abort, id };
  renderButtons();
  out(`${p.short}로 목소리를 만드는 중… (10~40초)`);
  try {
    const { duration } = await api.makeNarration({
      provider: id, voice, model: id === 'fish' ? $('#lsFishModel').value : undefined, speed: api.tts.speed, text, signal: abort.signal,
      onProgress: (o) => {
        if (o?.wait) out(`${p.short} 무료 한도 때문에 ${o.wait}초 기다렸다가 이어서 만듭니다…`);
        else if (o?.total > 1) out(`${p.short}로 목소리를 만드는 중… (${Math.min(o.done + 1, o.total)}/${o.total}조각)`);
      },
    });
    api.fitToNarration(true);
    out(`완성 — ${p.short} ${formatTime(duration)}. 내레이션에 넣고 장면 길이를 장면마다 읽을 문장 길이 비율로 맞췄습니다.`, 'ok');
  } catch (e) {
    if (e?.name === 'AbortError') out('목소리 만들기를 멈췄습니다.');
    else {
      out(e?.message || '목소리를 만들지 못했습니다. 다시 시도하세요.', 'bad');
      if (e?.code === 'nokey' || e?.code === 'key') openKeyBar({ focus: p.keyId || p.id });
    }
  } finally {
    ls.voice = null;
    renderButtons();
  }
}

// 내 목소리 녹음
function renderReader() {
  const box = $('#lsReader');
  box.textContent = '';
  const lines = api.project.scenes.map(api.spokenText);
  if (!lines.some(Boolean)) {
    const p = document.createElement('p');
    p.className = 'ls-reader-empty';
    p.textContent = '읽을 대본이 아직 없습니다. ③에서 대본을 만들거나 장면 자막을 넣으면 여기에 크게 나옵니다.';
    box.append(p);
    return;
  }
  lines.forEach((t, i) => {
    if (!t) return;
    const p = document.createElement('p');
    const n = document.createElement('span');
    n.className = 'ls-reader-no';
    n.textContent = String(i + 1);
    p.append(n, document.createTextNode(t));
    box.append(p);
  });
}

function renderRecButtons() {
  const recording = !!ls.rec;
  const starting = !!ls.recStarting;
  const start = $('#lsRecStart');
  start.setAttribute('aria-pressed', String(recording));
  start.textContent = recording ? '● 녹음 중' : starting ? '마이크 허용을 기다리는 중…' : '● 녹음';
  start.setAttribute('aria-busy', String(starting));
  // 마이크 허용을 기다리는 동안·대본을 만드는 동안·영상을 만드는 동안에는 누를 수 없게(두 번 눌러 녹음기가 둘 생기지 않게)
  start.disabled = recording || starting || !!ls.voice || !!ls.gen || (api.busy && !recording) || !canRecord() || inArtifact;
  $('#lsRecStop').disabled = !recording;
  $('#lsRecRedo').disabled = starting || !!ls.gen || (!recording && (!ls.recResult || api.busy));
  $('#lsRecPlay').disabled = recording || starting || !ls.recResult;
}

async function recStart() {
  if (ls.rec || ls.voice || ls.recStarting) return;
  const out = (t, k) => say('lsVoiceStatus', t, k);
  if (ls.gen) return out('대본을 만드는 중입니다. 끝난 뒤 눌러 주세요.', 'bad');
  if (api.busy) return out(api.recording ? '앞 녹음을 정리하는 중입니다. 잠시 뒤 눌러 주세요.' : '영상이나 목소리를 만드는 중입니다. 끝난 뒤 녹음해 주세요.', 'bad');
  stopListen();
  const meter = $('#lsRecMeter');
  const starting = { cancelled: false };
  ls.recStarting = starting;
  api.setRecording(true); // 마이크를 기다리는 동안에도 영상 만들기·음성 만들기를 막음
  renderButtons();
  out('마이크 허용을 기다리는 중… 브라우저가 묻는 창에서 ‘허용’을 눌러 주세요.');
  try {
    const handle = await startRecording({ onLevel: (v) => { meter.style.transform = `scaleX(${v.toFixed(3)})`; } });
    if (starting.cancelled || ls.rec) {
      // 기다리는 사이 다른 화면으로 갔거나(또는 혹시 다른 녹음이 시작됐으면) 이 녹음기는 바로 끕니다 — 마이크가 몰래 켜져 있지 않게
      handle.cancel();
      meter.style.transform = 'scaleX(0)';
      if (starting.cancelled) out('다른 화면으로 옮겨서 녹음을 시작하지 않았습니다.');
      return;
    }
    ls.rec = {
      handle,
      script: readScript(), // 이 녹음이 읽는 대본(멈춘 뒤 대본이 바뀌었으면 '예전 대본 목소리'로 알림)
      timer: setInterval(() => { $('#lsRecTime').textContent = formatTime(handle.elapsed); }, 100),
    };
    out('녹음 중… 대본을 다 읽으면 ■ 멈춤을 누르세요.');
    $('#lsRecStop').focus({ preventScroll: true });
  } catch (e) {
    out(e?.message || '녹음을 시작하지 못했습니다.', 'bad');
  } finally {
    if (ls.recStarting === starting) ls.recStarting = null;
    if (!ls.rec) api.setRecording(false);
    renderButtons();
  }
}

async function recStop() {
  const r = ls.rec;
  if (!r) return;
  ls.rec = null;
  clearInterval(r.timer);
  $('#lsRecMeter').style.transform = 'scaleX(0)';
  renderButtons();
  const out = (t, k) => say('lsVoiceStatus', t, k);
  out('녹음을 다듬는 중… (앞뒤 무음 자르기)');
  // 내레이션을 넣을 때까지 api.recording 을 켜 둡니다 — 그사이 영상 만들기가 시작돼 녹음이 반만 들어가는 일이 없게
  try {
    const { blob, duration } = await r.handle.stop();
    const raw = await decodeAudio(blob);
    const buf = await trimSilence(raw);
    const wav = audioBufferToWavBlob(buf);
    if (ls.recResult?.url) URL.revokeObjectURL(ls.recResult.url);
    ls.recResult = { url: URL.createObjectURL(wav), duration: buf.duration };
    api.setNarration({ buffer: buf, name: '내레이션 (내 목소리)', blob: wav, ext: 'wav', script: r.script });
    api.fitToNarration(true);
    $('#lsRecTime').textContent = formatTime(buf.duration);
    out(`녹음 ${duration.toFixed(1)}초 → 앞뒤 무음을 잘라 ${buf.duration.toFixed(1)}초. 내레이션에 넣고 장면 길이를 읽을 문장 비율로 맞췄습니다.`, 'ok');
  } catch (e) {
    out(e?.message || '녹음을 쓰지 못했습니다. 다시 녹음해 주세요.', 'bad');
  } finally {
    api.setRecording(false);
    renderButtons();
  }
}

/** 녹음을 버립니다(마이크 끄기). 화면을 떠날 때·다시 녹음할 때 */
function recCancel() {
  if (ls.recStarting) ls.recStarting.cancelled = true;
  if (!ls.rec) return;
  const r = ls.rec;
  ls.rec = null;
  clearInterval(r.timer);
  r.handle.cancel();
  $('#lsRecMeter').style.transform = 'scaleX(0)';
  api.setRecording(false);
}

function recRedo() {
  if (ls.recStarting) return;
  recCancel();
  $('#lsRecTime').textContent = formatTime(0);
  recStart();
}

function stopListen() {
  if (!ls.recAudio) return;
  ls.recAudio.pause();
  ls.recAudio = null;
  const b = $('#lsRecPlay');
  b.textContent = '▶ 듣기';
  b.setAttribute('aria-pressed', 'false');
}

function recListen() {
  if (ls.recAudio) return stopListen();
  if (!ls.recResult) return;
  const a = new Audio(ls.recResult.url);
  ls.recAudio = a;
  const b = $('#lsRecPlay');
  b.textContent = '■ 그만 듣기';
  b.setAttribute('aria-pressed', 'true');
  a.addEventListener('ended', stopListen, { once: true });
  a.play().catch(() => stopListen());
}

let readerHome = null; // '크게 보기' 동안 녹음 칸이 원래 있던 자리(같은 높이의 빈 칸)
let readerScroll = 0; // '크게 보기' 전 페이지 스크롤 위치(닫을 때 되돌림)

/**
 * 녹음 칸을 화면 가득(프롬프터처럼) 보이거나 되돌립니다.
 * 조상 상자에 transform·filter 가 남아 있으면 position:fixed 가 화면이 아니라 그 상자에 붙으므로,
 * 크게 볼 때는 칸을 body 바로 아래로 잠깐 옮겼다가 닫을 때 제자리로 돌립니다. '작게 보기'·멈춤 버튼은 화면 맨 위(style.css).
 */
function toggleReaderFull(force) {
  const pane = $('#lsPane-record');
  const was = pane.classList.contains('full');
  const on = typeof force === 'boolean' ? force : !was;
  if (on === was) return;
  const focused = pane.contains(document.activeElement) ? document.activeElement : null;
  if (on) {
    readerScroll = window.scrollY;
    // 같은 높이의 빈 자리를 남겨 뒤 페이지가 출렁이지 않게(닫을 때 스크롤 위치도 그대로)
    readerHome = document.createElement('div');
    readerHome.className = 'ls-rec-home';
    readerHome.setAttribute('aria-hidden', 'true');
    readerHome.style.height = `${pane.offsetHeight}px`;
    pane.before(readerHome);
    document.body.append(pane);
  } else if (readerHome) {
    readerHome.replaceWith(pane);
    readerHome = null;
  }
  pane.classList.toggle('full', on);
  if (on) { pane.setAttribute('role', 'dialog'); pane.setAttribute('aria-modal', 'true'); pane.setAttribute('aria-label', '녹음 대본 크게 보기'); }
  else { pane.setAttribute('role', 'tabpanel'); pane.removeAttribute('aria-modal'); pane.removeAttribute('aria-label'); }
  const b = $('#lsRecFull');
  b.setAttribute('aria-pressed', String(on));
  b.textContent = on ? '작게 보기' : '크게 보기';
  document.documentElement.classList.toggle('ls-reading', on);
  if (!on) window.scrollTo({ top: readerScroll, behavior: 'instant' });
  (focused || b).focus({ preventScroll: true });
}

function wireRecorder() {
  $('#lsRecStart').addEventListener('click', recStart);
  $('#lsRecStop').addEventListener('click', recStop);
  $('#lsRecRedo').addEventListener('click', recRedo);
  $('#lsRecPlay').addEventListener('click', recListen);
  $('#lsRecFull').addEventListener('click', () => toggleReaderFull());
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#lsPane-record').classList.contains('full')) toggleReaderFull(false); });
  // 다른 메뉴로 가면 녹음 중 표시가 안 보이므로 녹음을 멈춥니다(마이크가 켜진 채 대화가 녹음되지 않게). 녹음한 데까지는 내레이션에 넣음.
  window.addEventListener('hashchange', () => {
    if (location.hash.replace('#', '') === 'shorts') return;
    if ($('#lsPane-record').classList.contains('full')) toggleReaderFull(false);
    if (ls.recStarting) ls.recStarting.cancelled = true;
    if (ls.rec) {
      recStop();
      toast('다른 화면으로 가서 녹음을 멈췄습니다. 녹음한 데까지 내레이션에 넣었습니다.', 4500);
    }
  });
  // 탭을 닫거나 다른 주소로 떠날 때는 녹음을 버리고 마이크를 끕니다
  window.addEventListener('pagehide', () => recCancel());
  if (!canRecord() || inArtifact) {
    say('lsVoiceStatus', inArtifact ? 'Claude 미리보기에서는 녹음이 안 됩니다. ko372.com 에서 써 주세요.' : '이 브라우저(또는 http 주소)에서는 녹음이 안 됩니다. 크롬·엣지·사파리 최신 버전의 https 주소에서 열어 주세요.');
  }
  renderRecButtons();
}

// ── ⑤ 영상 ──────────────────────────────────────────
async function runExport() {
  if (api.exporting) { api.exportVideo(); return; } // 만드는 중이면 멈춤
  const out = (t, k) => say('lsExportStatus', t, k);
  if (!api.project.scenes.length) return out('장면이 없습니다. 매물 사진을 먼저 넣어 주세요.', 'bad');
  if (ls.gen) return out('대본을 만드는 중입니다. 끝난 뒤 눌러 주세요.', 'bad');
  if (ls.rec || ls.recStarting || api.recording) return out('녹음을 먼저 멈춰 주세요.', 'bad');
  const bar = $('#lsExportProgress');
  bar.hidden = false;
  bar.classList.add('rec');
  const r = await api.exportVideo({
    onStatus: (text, ratio) => {
      out(text);
      bar.firstElementChild.style.transform = `scaleX(${clamp(Number(ratio) || 0, 0, 1)})`;
    },
  });
  bar.classList.remove('rec');
  setTimeout(() => { bar.hidden = true; bar.firstElementChild.style.transform = 'scaleX(0)'; }, 600);
  if (r) {
    out(`완성: ${r.ext.toUpperCase()} · ${r.W}×${r.H} · ${(r.blob.size / 1048576).toFixed(1)}MB · ${formatTime(r.duration)}. ⑥에서 저장하거나 보내세요.`, 'ok');
  }
  renderAll();
}

function renderExportInfo() {
  const st = api.currentStyle();
  const p = api.project;
  const voice = api.audio.narr ? `${api.audio.narr.name}${api.narrStale ? '(예전 대본 — ④에서 다시 만들기 권장)' : ''}` : '내레이션 없음';
  const end = p.ending?.enabled === false ? '엔딩 없음' : `엔딩 「${plainText(p.ending?.text || '').replace(/\s*\n\s*/g, ' ').trim()}${p.ending?.sub ? ` / ${plainText(p.ending.sub)}` : ''}」`;
  $('#lsExportInfo').textContent = `${st ? `스타일 「${st.name.split(' — ')[0]}」` : '기본 스타일'} · ${p.aspect} · ${p.quality === '720' ? '720p' : '1080p'} · 약 ${Math.round(api.duration)}초 · ${voice}. 영상 이름 「${p.channel || '없음'}」 · ${end}. 스타일·화질·이름·엔딩은 아래 세부 조절에서 바꿀 수 있습니다.`;
  const t = $('#lsTitle');
  if (t && t !== document.activeElement && t.value !== p.title) t.value = p.title;
}

// ── ⑥ 저장·보내기 ───────────────────────────────────
/** 본문 뒤에 필수 표시 항목을 붙여 max 자 안에 넣습니다(표시 항목은 자르지 않고 본문을 줄임). */
function withDisclosure(body, disc, max = Infinity) {
  const b = String(body || '').trim();
  const d = String(disc || '').trim();
  if (!d) return b.slice(0, max);
  if (!b) return d.slice(0, max);
  const room = max - d.length - 2;
  if (room <= 0) return d.slice(0, max);
  return `${b.length > room ? `${b.slice(0, Math.max(0, room - 1)).trimEnd()}…` : b}\n\n${d}`;
}

/** 업로드 글의 플랫폼별 칸 — 복사 글에 이 순서로 붙습니다(shorts.js 와 같은 순서). */
const UPLOAD_SECTIONS = [['instagram', '인스타그램 릴스'], ['tiktok', '틱톡'], ['threads', '쓰레드'], ['facebook', '페이스북']];

/**
 * 업로드 글 재료 — 대시보드 보내기(dashboardPack)와 '업로드 글 복사'(listingUploadText)가 같이 씁니다.
 * AI 대본이 있으면 그 제목·설명·해시태그, 없으면(키 없이 녹음·직접 자막) 영상 제목과 자막의 *강조* 단어로.
 * 표시 항목은 ②에 지금 적힌 값으로 늘 새로 만듭니다(적은 것만).
 */
function uploadPack() {
  const u = api.uploadInfo || {};
  const plats = u.platforms && typeof u.platforms === 'object' ? u.platforms : {};
  const discLines = disclosureLines(ls.office, factsFilled()).filter(Boolean);
  // 예시(강의) 제목이 그대로 남아 있으면 매물 제목으로(엉뚱한 강의 제목으로 올라가지 않게)
  const rawTitle = api.isSampleTitle(api.project.title) && photoScenes().length ? autoTitle() : api.project.title;
  const title = String(u.title || plainText(rawTitle).replace(/\n/g, ' ')).replace(/\s+/g, ' ').trim();
  const desc = String(u.description || '').trim();
  const captions = api.project.scenes.map((s) => plainText(s.caption).replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean).join('\n');
  let tags = (Array.isArray(u.hashtags) ? u.hashtags : []).map((t) => String(t).replace(/^#+/, '').trim()).filter(Boolean);
  if (!tags.length) {
    const words = api.project.scenes.flatMap((s) => (String(s.caption).match(/\*([^*]+)\*/g) || []).map((w) => w.replace(/\*/g, '').replace(/\s+/g, '')));
    tags = [...new Set(['부동산', '매물', ...words])].slice(0, 10);
  }
  return { title, desc, disc: discLines.join('\n'), discLines, tags, plats, captions };
}

/** 대시보드로 보낼 제목·설명·태그·플랫폼별 글(outbox.js 약속 모양) */
export function dashboardPack() {
  const k = uploadPack();
  const { title, disc, plats, captions, tags } = k;
  const desc = k.desc || `${title}\n${api.project.channel || ''}`.trim();
  return {
    title,
    desc: withDisclosure(desc, disc, 300),
    tags,
    texts: {
      youtube: withDisclosure(desc, disc),
      clip: withDisclosure(plats.threads || plats.instagram || desc, disc, 300),
      blog: withDisclosure([captions, desc].filter(Boolean).join('\n\n'), disc),
      insta: withDisclosure(plats.instagram || desc, disc),
      threads: withDisclosure(plats.threads || desc, disc, 500),
      tiktok: withDisclosure(plats.tiktok || desc, disc),
    },
  };
}

/**
 * '업로드 글 복사'·ZIP 의 업로드 글 — dashboardPack 과 같은 규칙: 제목, 설명 + 적은 표시 항목 + 해시태그, 플랫폼별 글(각각 표시 항목 포함).
 */
function listingUploadText() {
  const k = uploadPack();
  const tags = k.tags.map((t) => `#${t}`).join(' ');
  const block = (body) => [body, k.disc, tags].filter((x) => String(x || '').trim()).join('\n\n');
  const head = [k.title, block(k.desc)].filter((x) => String(x || '').trim()).join('\n\n');
  const more = UPLOAD_SECTIONS.filter(([key]) => String(k.plats[key] || '').trim()).map(([key, name]) => `── ${name} ──\n${block(k.plats[key])}`);
  return [head, ...more].join('\n\n').trim();
}

/** 아래 숏폼 화면의 업로드 글(복사·ZIP)도 매물 글로 쓸지: 매물 대본이거나, 대본 없이 매물 사진 + ② 정보를 넣었을 때 */
function listingContext() {
  const u = api.uploadInfo;
  if (u?.source === 'listing') return true;
  if (u) return false; // 숏폼 'AI 대본'(강의) 글은 그대로
  return photoScenes().length > 0 && (anyFilled(ls.office) || anyFilled(ls.facts));
}

/** 표시·광고에 밝혀야 하는데 ②에 비어 있는 항목 */
const missingItems = () => missingDisclosure(ls.office, factsFilled());

/** ⑥ 보내기 전에 알려야 할 것: 예전 영상, 빠진 표시 항목 */
function sendWarnings() {
  const w = [];
  if (api.resultStale) w.push('지금 영상은 예전 대본·목소리로 만든 것입니다(⑤에서 다시 만들 수 있음)');
  const miss = missingItems();
  if (miss.length) w.push(`빠진 표시 항목: ${miss.join('·')}`);
  return w;
}

const isWide = () => {
  const m = api.resultBlob ? api.resultMeta : null;
  return m ? m.W > m.H : api.project.aspect === '16:9';
};

function send() {
  if (ls.sending) return;
  const out = (t, k) => say('lsSendStatus', t, k);
  const blob = api.resultBlob;
  if (!blob) return out('영상을 먼저 만들어 주세요(⑤).', 'bad');
  if (!ls.dashOk) return out('업무 대시보드 보내기는 ko372.com 에서 됩니다. 지금은 “영상 저장” 후 직접 올려 주세요.', 'bad');
  if (api.exporting) return out('영상을 만드는 중입니다. 끝난 뒤 보내 주세요.', 'bad');
  // 경고가 있으면 한 번 알리고, 같은 경고에서 한 번 더 누르면 보냅니다(확인 창을 띄우면 팝업이 막힐 수 있어 두 번 누르기로)
  const warns = sendWarnings();
  const key = warns.join('|');
  if (warns.length && ls.sendConfirm !== key) {
    ls.sendConfirm = key;
    out(`${warns.join(' / ')} — 고친 뒤 보내거나, 그대로 보내려면 ‘그래도 보내기’를 한 번 더 누르세요.`, 'bad');
    renderButtons();
    return;
  }
  ls.sendConfirm = '';
  const pack = dashboardPack();
  ls.sending = true;
  renderButtons();
  // 팝업이 막히지 않게 다른 await 없이 바로 부른다(창은 sendToDashboard 첫 줄에서 열림)
  sendToDashboard({ videoBlob: blob, videoName: api.videoFileName(), ...pack, onStatus: (t) => out(t) })
    .then(() => {
      ls.sent = true;
      out(`대시보드 바구니에 담았습니다 — 영상 1개 · 글 ${Object.values(pack.texts).filter(Boolean).length}가지. 대시보드 창에서 [발행하기]를 누르세요.${isWide() ? ' (16:9 영상 — 릴스·틱톡은 세로를 권장)' : ''}`, 'ok');
    })
    .catch((e) => out(e?.message || '대시보드로 보내지 못했습니다.', 'bad'))
    .finally(() => { ls.sending = false; renderAll(); });
}

async function copyUpload() {
  const ok = await copyText(listingUploadText());
  const out = (t, k) => say('lsSendStatus', t, k);
  if (!ok) return out('복사하지 못했습니다. 브라우저가 복사를 막았을 수 있습니다 — 아래 화면의 “업로드용 글”을 직접 골라 복사해 주세요.', 'bad');
  const has = disclosureLines(ls.office, factsFilled()).length > 0;
  const miss = missingItems();
  if (!anyFilled(ls.office)) out('업로드 글을 복사했습니다. 다만 중개사무소 정보(②)를 넣어야 설명 끝에 필수 표시 항목이 붙습니다 — 넣은 뒤 다시 복사하세요.', 'bad');
  else if (miss.length) out(`업로드 글을 복사했습니다${has ? '(설명 끝에 적은 표시 항목 포함)' : ''}. 빠진 표시 항목: ${miss.join('·')} — ②에서 채운 뒤 다시 복사하세요.`, 'bad');
  else out('업로드 글을 복사했습니다(설명 끝에 필수 표시 항목 포함). 업로드 화면에 붙여 넣으세요.', 'ok');
}

async function saveVideo() {
  const blob = api.resultBlob;
  if (!blob) return;
  try {
    if (await saveBlob(blob, api.videoFileName())) {
      ls.saved = true;
      say('lsSendStatus', `영상 파일을 저장했습니다. 각 플랫폼 업로드 화면에서 고르면 됩니다.${api.resultStale ? ' (지금 영상은 예전 대본·목소리로 만든 것입니다 — ⑤에서 다시 만들 수 있습니다)' : ''}`, api.resultStale ? 'bad' : 'ok');
      renderAll();
    }
  } catch (e) { say('lsSendStatus', e.message, 'bad'); }
}

// ── 그리기 ──────────────────────────────────────────
function stepStates() {
  const s = {
    1: photoScenes().length > 0,
    2: anyFilled(ls.facts) || anyFilled(ls.office),
    // 대본: AI 의 '읽을 문장'이 있거나, 키 없이 사진 장면에 자막을 직접 썼으면 끝난 것
    3: api.project.scenes.some((x) => x.narration || (x.img && !x.sample && plainText(x.caption).trim())),
    // 목소리·영상: 지금 대본으로 만든 것이어야 끝(대본을 고치면 다시 '차례'로)
    4: !!api.audio.narr && !api.narrStale,
    5: !!api.resultBlob && !api.resultStale,
    6: ls.sent || ls.saved,
  };
  const current = [1, 3, 4, 5, 6].find((n) => !s[n]) || 6;
  return { s, current };
}

function renderProgress() {
  const { s, current } = stepStates();
  const stateOf = (n) => (s[n] ? 'done' : n === current ? 'current' : n === 2 && current > 2 ? 'skip' : 'todo');
  for (const li of $('#lsProgress').children) {
    const n = Number(li.dataset.step);
    li.dataset.state = stateOf(n);
    if (n === current) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    li.title = `${n}. ${STEP_NAMES[n]} — ${s[n] ? '끝남' : n === current ? '지금 할 차례' : n === 2 ? '선택' : '아직'}`;
  }
  for (const sec of document.querySelectorAll('#listingBox .ls-step')) sec.dataset.state = stateOf(Number(sec.dataset.step));
  if (current !== ls.lastStep) {
    ls.lastStep = current;
    $('#lsProgressText').textContent = `${current}단계 ${STEP_NAMES[current]} 차례입니다.`;
  }
}

/** 대본이 바뀌어 목소리·영상이 예전 것이 되면 한 번 알립니다(만드는 중에는 그 진행 문구를 덮지 않음). */
function renderStale() {
  const sv = api.narrStale;
  if (sv && !ls.staleVoice && !ls.voice && !ls.rec) say('lsVoiceStatus', '대본이 바뀌었습니다 — 목소리를 다시 만들어 주세요(지금 목소리는 예전 대본).', 'bad');
  ls.staleVoice = sv;
  const vv = api.resultStale;
  if (vv && !ls.staleVideo && !api.exporting) say('lsExportStatus', '대본이나 목소리가 바뀌었습니다 — 영상을 다시 만들어 주세요(지금 영상은 예전 것).', 'bad');
  ls.staleVideo = vv;
}

function renderButtons() {
  const gen = $('#lsGen');
  gen.disabled = !!ls.gen;
  gen.textContent = ls.gen ? 'AI 가 대본을 쓰는 중…' : (api.project.scenes.some((s) => s.narration) ? 'AI로 대본 다시 만들기' : 'AI로 매물 설명 대본 만들기');
  gen.setAttribute('aria-busy', String(!!ls.gen));
  $('#lsGenCancel').hidden = !ls.gen;
  $('#lsFiles').disabled = !!ls.gen;

  const vBusy = !!ls.voice;
  for (const b of document.querySelectorAll('#listingBox [data-run]')) {
    // 대본을 쓰는 동안·녹음하는 동안에는 목소리를 만들지 않습니다(곧 바뀔 대본·녹음 중인 대본으로 만들지 않게)
    b.disabled = vBusy || !!ls.rec || !!ls.recStarting || !!ls.gen;
    b.setAttribute('aria-busy', String(vBusy && ls.voice?.id === b.dataset.run));
  }
  $('#lsVoiceCancel').hidden = !vBusy || ls.voice?.id === 'fish'; // Fish Audio 중계는 중간에 멈출 수 없음
  renderRecButtons();

  const ex = $('#lsExport');
  ex.textContent = api.exporting ? '만들기 멈춤' : (api.resultBlob ? '영상 다시 만들기' : '영상 만들기');
  ex.disabled = !api.exporting && (api.busy || !api.project.scenes.length || !!ls.gen || !!ls.rec || !!ls.recStarting);

  const hasVideo = !!api.resultBlob;
  $('#lsSave').disabled = !hasVideo;
  const sendBtn = $('#lsSend');
  sendBtn.disabled = !hasVideo || !ls.dashOk || ls.sending || api.exporting;
  sendBtn.setAttribute('aria-busy', String(ls.sending));
  const confirming = !!ls.sendConfirm && hasVideo && ls.sendConfirm === sendWarnings().join('|');
  sendBtn.textContent = confirming ? '그래도 보내기 (경고를 확인했습니다)' : '업무 대시보드로 보내기 (인스타·틱톡·페이스북·쓰레드·유튜브)';
  $('#lsSendWarn').hidden = !isWide();
  const st = $('#lsSendStatus');
  if (!ls.dashOk && !st.textContent) {
    st.textContent = inArtifact
      ? '업무 대시보드 보내기는 ko372.com 에서 됩니다(Claude 미리보기에서는 안 됨).'
      : '업무 대시보드 보내기는 ko372.com 회원 화면에서 됩니다. 여기서는 “영상 저장” 후 직접 올려 주세요.';
  } else if (ls.dashOk && !hasVideo && !st.textContent) {
    st.textContent = '영상을 만들면 인스타·틱톡·페이스북·쓰레드·유튜브에 올릴 글과 함께 업무 대시보드로 한 번에 보냅니다.';
  }
}

function syncAspect() {
  const sel = $('#lsAspect');
  if (sel !== document.activeElement && sel.value !== api.project.aspect) sel.value = api.project.aspect;
  $('#lsAspectWarn').hidden = api.project.aspect !== '16:9';
}

function renderAll() {
  renderProgress();
  renderButtons();
  syncAspect();
  renderExportInfo();
  renderStale();
}

// ── 프로젝트 저장/열기 ──────────────────────────────
const listingIO = {
  get() { return { facts: { ...ls.facts }, office: { ...ls.office } }; },
  set(obj) {
    ls.facts = cleanObj(obj?.facts || {}, FACT_INPUTS.map(([, k]) => k));
    // 프로젝트에 중개사무소 정보가 있으면 그것을 보여 줍니다(이 브라우저에 기억한 값은 직접 고칠 때만 바뀜)
    if (obj?.office && anyFilled(obj.office)) ls.office = cleanObj(obj.office, OFFICE_INPUTS.map(([, k]) => k));
    ls.sent = false;
    ls.saved = false;
    ls.sendConfirm = '';
    ls.autoTitle = ''; // 프로젝트에 저장된 제목을 그대로 씀
    // 앞 프로젝트의 녹음·결과 표시를 버립니다(shorts.js 가 내레이션·영상을 지움 — 프로젝트에는 소리·영상이 들어가지 않음)
    stopListen();
    recCancel();
    if (ls.recResult?.url) URL.revokeObjectURL(ls.recResult.url);
    ls.recResult = null;
    ls.lastBlob = null;
    ls.staleVoice = false;
    ls.staleVideo = false;
    $('#lsRecTime').textContent = formatTime(0);
    for (const id of ['lsGenStatus', 'lsVoiceStatus', 'lsExportStatus']) say(id, NOTES[id] || '');
    say('lsSendStatus', '');
    fillInfoFields();
    renderBuildingFields();
    if (anyFilled(ls.facts)) $('#lsInfo').open = true;
    renderScriptList(true);
  },
  /** 아래 숏폼 화면의 업로드 글(복사·ZIP) — 매물 영상이면 매물 글, 아니면 null(숏폼 기본 글) */
  uploadText() { return api && listingContext() ? listingUploadText() : null; },
};

// ── 시작 ─────────────────────────────────────────────
/**
 * 매물 상자를 엽니다. shorts.js 가 같은 project 를 다루는 손잡이(api)를 넘겨 줍니다.
 * @param {object} shortsApi  shorts.js 의 api(project·audio·changed·addImageFiles·exportVideo·makeNarration…)
 */
export function initListing(shortsApi) {
  if (api || !$('#listingBox')) return;
  api = shortsApi;
  api.registerIO(listingIO);
  for (const id of ['lsGenStatus', 'lsVoiceStatus', 'lsExportStatus']) NOTES[id] = document.getElementById(id)?.textContent || '';

  // ①
  wireDrop($('#lsDrop'), addPhotos);

  // ②
  fillInfoFields();
  renderBuildingFields();
  for (const [id, k] of FACT_INPUTS) {
    document.getElementById(id).addEventListener('input', (e) => {
      ls.facts[k] = cleanStr(e.target.value);
      if (k === 'propertyType') renderBuildingFields();
      if (['location', 'propertyType', 'dealType'].includes(k)) syncAutoTitle();
      refreshDisclosure();
      renderAll();
    });
  }
  for (const [id, k] of OFFICE_INPUTS) {
    document.getElementById(id).addEventListener('input', (e) => {
      ls.office[k] = cleanStr(e.target.value);
      saveOffice();
      refreshDisclosure();
      if ((k === 'name' || k === 'phone') && photoScenes().length) applyOfficeBrand();
      renderAll();
    });
  }
  if (anyFilled(ls.office) && !anyFilled(ls.facts)) $('#lsInfo').open = false;
  $('#lsAspect').addEventListener('input', (e) => { api.setAspect(e.target.value); renderAll(); });
  $('#lsAi').addEventListener('input', (e) => { ls.ai = e.target.value; saveListingPrefs(); });
  renderAiSelect();
  onKeysChange(() => { renderAiSelect(); renderButtons(); });

  // ③
  $('#lsGen').addEventListener('click', generate);
  $('#lsGenCancel').addEventListener('click', () => ls.gen?.abort.abort());

  // ④
  wireTabs();
  wireVoiceFields();
  wireRecorder();
  selectTab(ls.voiceTab);

  // ⑤ ⑥
  $('#lsTitle')?.addEventListener('input', (e) => { ls.autoTitle = ''; api.setTitle(e.target.value); });
  $('#lsExport').addEventListener('click', runExport);
  $('#lsSave').addEventListener('click', saveVideo);
  $('#lsCopy').addEventListener('click', copyUpload);
  $('#lsSend').addEventListener('click', send);
  dashboardAvailable().then((ok) => { ls.dashOk = ok; $('#lsSendStatus').textContent = ''; renderButtons(); });

  // 아래 숏폼 화면에서 장면·소리·설정이 바뀔 때마다 상자도 따라갑니다
  api.onChange((structural) => {
    // 새 영상이 생기면(아래 '이 스타일로 영상 만들기'로 만든 것도) 예전 영상의 저장·보냄 표시를 지운다
    if (api.resultBlob !== ls.lastBlob) {
      ls.lastBlob = api.resultBlob;
      ls.sent = false;
      ls.saved = false;
      ls.sendConfirm = '';
      say('lsSendStatus', '');
    }
    if (structural) {
      renderThumbs();
      renderScriptList();
      // 아래 장면 목록으로 매물 사진을 넣었어도(② 정보를 적은 매물 영상이면) 예시 강의 제목을 매물 제목으로
      if (listingContext() && api.isSampleTitle(api.project.title)) syncAutoTitle(true);
    } else syncScriptValues();
    syncVoiceFields();
    if (ls.voiceTab === 'record' && !ls.rec) renderReader();
    renderAll();
  });
  renderThumbs();
  renderScriptList(true);
  renderAll();
}
