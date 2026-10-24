// 사용자 AI 키를 한 곳에 보관합니다(제미나이·클로드·GPT·일레븐랩스·Fish Audio).
//  - 기본: 이 탭 안에만(sessionStorage + 메모리). 탭을 닫으면 사라집니다.
//  - '이 브라우저에 기억'을 켜면 localStorage 'mrkv.keys' 에 남기고, 끄면 바로 지웁니다.
//  - 키는 프로젝트 .json·로그·오류 문구에 절대 넣지 않습니다. 키는 사용자가 고른 AI 서비스로만 직접 갑니다.
//  - 예전 내레이션 키 저장(store 'ttsKeys' = localStorage 'mrk:ttsKeys')이 있으면 한 번 옮겨 오고 지웁니다.

export const KEY_PROVIDERS = [
  { id: 'gemini', name: '제미나이', primary: true, free: true, hint: 'Google AI Studio → Get API key (무료 한도 있음)', url: 'https://aistudio.google.com/apikey' },
  { id: 'claude', name: '클로드', hint: 'console.anthropic.com → API Keys', url: 'https://console.anthropic.com/settings/keys' },
  { id: 'openai', name: 'GPT', hint: 'platform.openai.com → API keys', url: 'https://platform.openai.com/api-keys' },
  { id: 'elevenlabs', name: '일레븐랩스', voice: true, hint: 'elevenlabs.io → Profile → API Keys' },
  { id: 'fish', name: 'Fish Audio', voice: true, hint: 'fish.audio → API Keys (브라우저 제한 때문에 ko372.com 서버가 한 번 전달 — 저장·기록 안 함)' },
];

const STORE_KEY = 'mrkv.keys'; // localStorage(기억 켬)·sessionStorage(기본) 같은 이름
const OLD_TTS_KEY = 'mrk:ttsKeys'; // util.js store('ttsKeys') 가 쓰던 자리
const KEY_RE = /^[\x21-\x7E]{8,300}$/; // 눈에 보이는 영문·숫자·기호 8~300자(공백·한글·줄바꿈 없음)
const IDS = new Set(KEY_PROVIDERS.map((p) => p.id));

const mem = {}; // 지금 쓰는 키(메모리)
let remember = false;
const listeners = new Set();

// ── 저장소(막혀 있어도 앱이 멈추지 않게 try/catch) ─────
function read(storage) {
  try {
    const raw = storage.getItem(STORE_KEY);
    if (raw == null) return null;
    const j = JSON.parse(raw);
    return j && typeof j === 'object' ? j : null;
  } catch { return null; }
}
function write(storage, data) {
  try { storage.setItem(STORE_KEY, JSON.stringify(data)); } catch { /* 저장소 사용 불가 — 메모리에만 둠 */ }
}
function remove(storage, key = STORE_KEY) {
  try { storage.removeItem(key); } catch { /* 무시 */ }
}
const ls = () => { try { return window.localStorage; } catch { return null; } };
const ss = () => { try { return window.sessionStorage; } catch { return null; } };

/** 저장소에서 읽은 값 중 올바른 키만 골라 냅니다. */
function cleanKeys(obj) {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  for (const id of IDS) {
    const v = typeof obj[id] === 'string' ? obj[id].trim() : '';
    if (v && KEY_RE.test(v)) out[id] = v;
  }
  return out;
}

/** 지금 상태를 저장소에 씁니다. 기억 켬 → localStorage 만, 끔 → sessionStorage 만. */
function persist() {
  const data = { v: 1, keys: { ...mem } };
  const L = ls();
  const S = ss();
  if (remember) {
    if (L) write(L, data);
    if (S) remove(S);
  } else {
    if (L) remove(L);
    if (S) write(S, data);
  }
}

function notify(id = null) {
  for (const fn of [...listeners]) {
    try { fn({ id, remember }); } catch (e) { console.error('keys listener', e?.message || e); }
  }
}

// ── 처음 한 번: 불러오기 + 옛 내레이션 키 옮기기 ──────────
function load() {
  const L = ls();
  const S = ss();
  const saved = L ? read(L) : null;
  for (const id of Object.keys(mem)) delete mem[id];
  if (saved) {
    remember = true;
    Object.assign(mem, cleanKeys(saved.keys));
  } else {
    remember = false;
    Object.assign(mem, cleanKeys(S ? read(S)?.keys : null));
  }
}

function migrateOldTtsKeys() {
  const L = ls();
  if (!L) return;
  let old = null;
  try {
    const raw = L.getItem(OLD_TTS_KEY);
    if (raw == null) return;
    old = JSON.parse(raw);
  } catch { old = null; }
  const found = cleanKeys(old);
  let moved = 0;
  for (const [id, v] of Object.entries(found)) {
    if (!mem[id]) { mem[id] = v; moved++; }
  }
  // 예전 저장은 사용자가 '기억'을 켰을 때만 생겼으므로, 옮겨 온 키가 있으면 기억도 켠 상태로 이어 갑니다.
  if (moved) remember = true;
  remove(L, OLD_TTS_KEY);
  persist();
}

load();
migrateOldTtsKeys();

// 다른 탭에서 기억된 키를 바꾸면 이 탭도 따라갑니다(기억 켬일 때만 localStorage 를 같이 씀).
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('storage', (e) => {
    if (e.key !== STORE_KEY || e.storageArea !== ls()) return;
    load();
    notify(null);
  });
}

// ── 바깥에서 쓰는 함수 ─────────────────────────────────

/** 키 하나. 없으면 '' */
export function getKey(id) {
  return typeof mem[id] === 'string' ? mem[id] : '';
}

/**
 * 키를 넣거나(빈 값이면 지움) 바꿉니다. 앞뒤 공백은 지우고, 공백·한글·줄바꿈 같은 글자가 섞이면 Error.
 * 오류 문구에는 키를 넣지 않습니다.
 */
export function setKey(id, value) {
  if (!IDS.has(id)) throw new Error('알 수 없는 AI 서비스입니다.');
  const v = String(value ?? '').trim();
  if (!v) {
    if (!(id in mem)) return;
    delete mem[id];
  } else {
    if (!KEY_RE.test(v)) throw new Error('키에 허용되지 않는 글자(공백·한글·줄바꿈 등)가 있거나 길이가 맞지 않습니다. 키를 다시 복사해 넣으세요.');
    if (mem[id] === v) return;
    mem[id] = v;
  }
  persist();
  notify(id);
}

/** 모든 키와 '기억' 선택을 지웁니다(같이 쓰는 PC 에서 나갈 때). */
export function clearKeys() {
  for (const id of Object.keys(mem)) delete mem[id];
  remember = false;
  const L = ls();
  const S = ss();
  if (L) { remove(L); remove(L, OLD_TTS_KEY); }
  if (S) remove(S);
  notify(null);
}

/** '이 브라우저에 기억'이 켜져 있는지 */
export function rememberKeys() {
  return remember;
}

/** '이 브라우저에 기억' 켜기/끄기. 끄면 localStorage 에서 바로 지우고 이 탭(sessionStorage)에만 둡니다. */
export function setRemember(on) {
  const next = !!on;
  if (next === remember) { persist(); return; }
  remember = next;
  persist();
  notify(null);
}

/** 키가 바뀔 때 부를 함수를 등록합니다. fn({ id, remember }) — id 는 바뀐 서비스(여럿이면 null). 해제 함수를 돌려줍니다. */
export function onKeysChange(fn) {
  if (typeof fn !== 'function') return () => {};
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 순서대로 보며 키가 있는 첫 서비스 id. 없으면 null */
export function firstWithKey(order = ['gemini', 'claude', 'openai']) {
  for (const id of order) if (getKey(id)) return id;
  return null;
}

/** 화면에 보여 줄 가린 키(앞 4자 + … + 뒤 3자). 키 전체는 화면에도 다시 보여 주지 않을 때 씁니다. */
export function maskKey(value) {
  const v = String(value || '');
  if (!v) return '';
  if (v.length <= 10) return '•'.repeat(v.length);
  return `${v.slice(0, 4)}…${v.slice(-3)}`;
}
