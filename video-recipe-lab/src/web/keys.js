// 웹판 API 키 보관 — 이 브라우저(localStorage)에만 둔다. 우리 서버로는 보내지 않고, 각 AI 회사로 바로 보낸다.
const STORE = 'mrkvr.keys.v1';
const FIELDS = { anthropic: 'ANTHROPIC_API_KEY', gemini: 'GEMINI_API_KEY', openai: 'OPENAI_API_KEY', elevenlabs: 'ELEVENLABS_API_KEY' };

function read() {
  try {
    return JSON.parse(localStorage.getItem(STORE) || '{}');
  } catch {
    return {};
  }
}
let memory = read();
function write(v) {
  memory = v;
  try {
    localStorage.setItem(STORE, JSON.stringify(v));
  } catch {
    /* 저장이 막힌 브라우저(시크릿 창 등)는 이번 화면에서만 쓴다 */
  }
}

export const getKey = (id) => (memory[id] || '').trim();

export function saveKeys(values) {
  const next = { ...memory };
  for (const id of Object.keys(FIELDS)) {
    if (typeof values[id] === 'string') {
      const v = values[id].trim().replace(/[\r\n]/g, '');
      if (v) next[id] = v;
      else delete next[id];
    }
  }
  if (values.textAI === 'claude' || values.textAI === 'gemini') next.textAI = values.textAI;
  write(next);
}
export const clearKeys = () => {
  write({});
  try {
    localStorage.removeItem(STORE);
  } catch {
    /* 저장이 막힌 브라우저 */
  }
};

export function providers() {
  const claude = Boolean(getKey('anthropic'));
  const gemini = Boolean(getKey('gemini'));
  const pref = memory.textAI;
  const text = pref === 'gemini' && gemini ? 'gemini' : pref === 'claude' && claude ? 'claude' : claude ? 'claude' : gemini ? 'gemini' : null;
  return { claude, gemini, text, openai: Boolean(getKey('openai')), elevenlabs: Boolean(getKey('elevenlabs')) };
}

const mask = (v) => (v ? `${v.slice(0, 7)}…${v.slice(-4)}` : null);
export const keyStatus = () => Object.fromEntries(Object.entries(FIELDS).map(([id, env]) => [env, mask(getKey(id))]));
