// 내레이션 만들기 — 제미나이(무료 한도 안에서 먼저 권함)·일레븐랩스·Fish Audio 로 대본을 목소리로 만듭니다.
//  - API 키는 js/keys.js 한 곳(맨 위 'AI 키' 칸)에 모입니다. synthesize 에 key 를 넘기지 않으면 getKey(서비스) 를 씁니다.
//  - 제미나이·일레븐랩스: 브라우저에서 각 서비스로 바로 부릅니다(키는 그 서비스로만 갑니다).
//  - Fish Audio: 브라우저에서 직접 부르면 CORS 로 막혀서, 이 사이트의 서버 함수(api/tts)가 한 번 전달만 합니다. 서버는 키를 저장하지 않습니다.
//  - 제미나이 긴 대본: 문장 경계에서 몇 조각으로 나눠 차례로 부르고, 받은 소리(PCM)를 0.25초 쉼을 두고 이어 붙여 WAV 하나로 만듭니다.
// 결과는 { blob, mime } — shorts.js 가 내레이션 자리에 넣습니다.

import { inArtifact, serverInfo, ttsRelay } from './platform.js';
import { getKey } from './keys.js';

/** 대본 글자 수 한도 */
export const MAX_TEXT = 3000;
/** 속도 범위(화면 슬라이더와 같음). Fish Audio 에만 적용됩니다. */
export const SPEED_MIN = 0.8;
export const SPEED_MAX = 1.3;
/**
 * 제미나이에 한 번에 보내는 글자 수.
 * 제미나이 3.8 음성 모델의 한 번 요청 한도는 입력 8,192토큰·출력 16,384토큰(소리 1초 = 25토큰, 약 10분)입니다.
 * 넉넉히 작게 잡아 한 조각이 3~4분을 넘지 않게 하고, 무료 등급의 '1분 요청 수' 를 아끼려고 문장을 최대한 묶어 보냅니다.
 */
export const GEMINI_CHUNK_CHARS = 1000;
/** 조각 사이 쉼(초) */
export const GAP_SEC = 0.25;

export const PROVIDERS = [
  {
    id: 'gemini',
    name: '제미나이 (Google)',
    short: '제미나이',
    keyId: 'gemini', // keys.js 의 KEY_PROVIDERS id
    direct: true, // 브라우저에서 바로 부름
    free: true, // 무료 한도 안에서 쓸 수 있음(구글 AI Studio 무료 등급)
    freeNote: '무료 한도 안에서 쓸 수 있습니다. 한도를 넘으면 잠시 뒤(하루 한도는 내일) 다시 하거나 다른 목소리를 고르세요.',
    keyHint: 'AI Studio → Get API key (무료 한도 안에서)',
    voices: [
      { id: 'Kore', name: 'Kore (차분한 여성)' },
      { id: 'Puck', name: 'Puck (밝은 남성)' },
      { id: 'Charon', name: 'Charon (낮은 남성)' },
      { id: 'Fenrir', name: 'Fenrir (힘찬 남성)' },
      { id: 'Aoede', name: 'Aoede (부드러운 여성)' },
      { id: 'Leda', name: 'Leda (젊은 여성)' },
      { id: 'Orus', name: 'Orus (단단한 남성)' },
      { id: 'Zephyr', name: 'Zephyr (밝은 여성)' },
    ],
    // 2026-10 공식 문서 기준: 3.8 음성 모델 두 가지 모두 무료 등급 "Free of charge".
    // (2.5 음성 모델은 '예전에 써 본 사용자만' 쓸 수 있게 막혀서 새 키로는 안 될 수 있음)
    model: 'gemini-3.8-flash-tts',
    // 첫 조각에서 위 모델이 없거나(404) 하루 무료 한도를 다 썼을 때 한 번 바꿔 보는 모델(무료 한도가 따로 셈)
    altModel: 'gemini-3.8-flash-lite-tts',
  },
  {
    id: 'elevenlabs',
    name: '일레븐랩스',
    short: '일레븐랩스',
    keyId: 'elevenlabs',
    direct: true,
    keyHint: 'elevenlabs.io → Profile → API Keys',
    voiceLabel: 'Voice ID',
    model: 'eleven_multilingual_v2',
  },
  {
    id: 'fish',
    name: 'Fish Audio',
    short: 'Fish Audio',
    keyId: 'fish',
    direct: false, // 서버(api/tts)가 한 번 전달
    keyHint: 'fish.audio → API Keys',
    voiceLabel: '음성 모델 ID',
    defaultVoice: '440b9066d8d64a988638af6e2820dc4b', // 대표님이 만든 「밝은 고상철」
    models: [
      { id: 'drama-3', name: 'Drama 3' },
      { id: 's2.1-pro', name: 'S2.1 Pro' },
      { id: 's1', name: 'S1' },
    ],
  },
];

export const providerOf = (id) => PROVIDERS.find((p) => p.id === id) || PROVIDERS[0];

/** keys.js 에서 이 서비스의 키를 꺼냅니다(없거나 읽다 문제가 생기면 ''). */
function savedKey(p) {
  try { return String(getKey(p.keyId || p.id) || '').trim(); } catch { return ''; }
}

/**
 * 대본을 음성으로 만듭니다.
 * key 가 비어 있으면 맨 위 'AI 키' 칸(keys.js getKey)에 넣은 키를 씁니다.
 * onProgress({ done, total, wait }) — 제미나이 긴 대본일 때 몇 조각째인지, 무료 한도 때문에 몇 초 기다리는지 알려 줍니다(없어도 됨).
 * @param {{ provider: string, key?: string, voice?: string, model?: string, text: string, speed?: number, onProgress?: Function, signal?: AbortSignal }} o
 * @returns {Promise<{ blob: Blob, mime: string, model?: string, chunks?: number }>}
 */
export async function synthesize({ provider, key, voice, model, text, speed = 1, onProgress, signal } = {}) {
  if (inArtifact) throw new Error('Claude 미리보기에서는 음성 생성이 안 됩니다. ko372.com 에서 써 주세요.');
  const p = providerOf(provider);
  key = String(key || '').trim() || savedKey(p);
  voice = String(voice || '').trim() || p.defaultVoice || p.voices?.[0]?.id || '';
  text = String(text || '').trim();
  if (!key) throw new Error(`${p.short} API 키가 없습니다. 맨 위 'AI 키' 칸에 넣어 주세요. (${p.keyHint})`);
  // 복사하다 붙은 줄바꿈·전각·보이지 않는 글자는 fetch 가 '잘못된 헤더' 로 던져 연결 실패처럼 보이므로 먼저 걸러 준다
  if (!/^[\x21-\x7E]+$/.test(key)) throw new Error('API 키에 허용되지 않는 글자(공백·한글·줄바꿈 등)가 있습니다. 키를 다시 복사해 넣으세요.');
  if (!voice) throw new Error(p.voiceLabel ? `${p.voiceLabel}를 넣어 주세요.` : '목소리를 골라 주세요.');
  if (!text) throw new Error('대본이 비어 있습니다. 장면 자막을 가져오거나 직접 적어 주세요.');
  if (text.length > MAX_TEXT) throw new Error(`대본이 너무 깁니다 (${text.length.toLocaleString()}자). ${MAX_TEXT.toLocaleString()}자 이하로 줄여 주세요.`);
  speed = Number(speed);
  if (!Number.isFinite(speed)) speed = 1;
  speed = Math.min(SPEED_MAX, Math.max(SPEED_MIN, speed));
  const progress = typeof onProgress === 'function' ? (o) => { try { onProgress(o); } catch { /* 화면 표시 문제는 무시 */ } } : () => {};

  // 제미나이·일레븐랩스는 고정 모델을 씁니다(화면의 "엔진" 칸은 Fish Audio 전용이라 넘어온 model 은 무시).
  if (p.id === 'gemini') return gemini(p, { key, voice, text, progress, signal });
  if (p.id === 'elevenlabs') return elevenlabs(p, { key, voice, model: p.model, text, signal });
  return fish(p, { key, voice, model, text, speed });
}

// ── 대본 나누기 ─────────────────────────────────────────
/**
 * 대본을 문장으로 나눕니다. 마침표·물음표·느낌표·말줄임표 뒤가 띄어쓰기·줄바꿈·끝일 때, 그리고 줄바꿈에서 끊습니다.
 * "3.5억" 처럼 숫자 사이 점은 끊지 않습니다. nl 은 그 문장 뒤가 줄바꿈이었는지(다시 붙일 때 그대로 살림).
 */
function sentencesOf(text) {
  const out = [];
  let cur = '';
  const push = (nl) => { const s = cur.trim(); if (s) out.push({ s, nl }); else if (nl && out.length) out[out.length - 1].nl = true; cur = ''; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\n') { push(true); continue; }
    cur += ch;
    if (/[.!?。！？…]/.test(ch)) {
      const next = text[i + 1];
      if (next === undefined || /\s/.test(next)) push(false);
    }
  }
  push(false);
  return out;
}

/** 한 문장이 max 보다 길면 쉼표·띄어쓰기 자리에서 자릅니다(없으면 max 글자에서). */
function cutLong(s, max) {
  const out = [];
  let rest = s;
  while (rest.length > max) {
    const head = rest.slice(0, max);
    let at = Math.max(head.lastIndexOf(', '), head.lastIndexOf('，'));
    if (at < max * 0.5) at = head.lastIndexOf(' ');
    if (at < max * 0.5) at = max - 1;
    out.push(rest.slice(0, at + 1).trim());
    rest = rest.slice(at + 1).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/**
 * 대본을 제미나이 한 번 요청에 맞는 조각들로 나눕니다. 문장을 자르지 않고 max 글자까지 묶습니다.
 * max 이하면 한 조각 그대로 돌려줍니다.
 * @returns {string[]}
 */
export function splitScript(text, max = GEMINI_CHUNK_CHARS) {
  const all = String(text || '').replace(/\r\n?/g, '\n').trim();
  if (!all) return [];
  if (all.length <= max) return [all];
  const chunks = [];
  let cur = '';
  let sep = ' ';
  for (const { s, nl } of sentencesOf(all)) {
    const pieces = cutLong(s, max);
    pieces.forEach((piece, i) => {
      if (cur && cur.length + 1 + piece.length > max) { chunks.push(cur); cur = ''; }
      cur = cur ? cur + sep + piece : piece;
      sep = i === pieces.length - 1 && nl ? '\n' : ' ';
    });
  }
  if (cur) chunks.push(cur);
  return chunks;
}

// ── 제미나이 ─────────────────────────────────────────
async function gemini(p, { key, voice, text, progress, signal }) {
  const chunks = splitScript(text, GEMINI_CHUNK_CHARS);
  let models = [p.model, p.altModel].filter(Boolean);
  const pieces = [];
  for (let i = 0; i < chunks.length; i++) {
    progress({ done: i, total: chunks.length });
    for (;;) {
      try {
        pieces.push(await geminiOnce({ key, voice, model: models[0], text: chunks[i], signal, progress }));
        break;
      } catch (e) {
        // 첫 조각에서 모델이 없거나(404) 하루 무료 한도를 다 썼으면 다른 무료 모델로 한 번 바꿔 본다.
        // 조각마다 목소리 결이 달라지지 않게, 이미 받은 조각이 있으면 바꾸지 않는다.
        if (!pieces.length && models.length > 1 && (e.code === 'model' || e.code === 'daily')) { models = models.slice(1); continue; }
        throw e;
      }
    }
  }
  progress({ done: chunks.length, total: chunks.length });

  if (pieces.length === 1 && pieces[0].raw) {
    const { bytes, mime } = pieces[0];
    return { blob: new Blob([bytes], { type: mime }), mime, model: models[0], chunks: 1 };
  }
  if (pieces.some((pc) => pc.raw)) throw new Error('제미나이가 이어 붙일 수 없는 형식으로 소리를 보냈습니다. 대본을 짧게 줄여 다시 시도하세요.');
  const { rate, channels } = pieces[0];
  if (pieces.some((pc) => pc.rate !== rate || pc.channels !== channels)) throw new Error('제미나이가 조각마다 다른 형식으로 소리를 보냈습니다. 다시 시도하세요.');
  const pcm = joinPcm(pieces.map((pc) => pc.pcm), Math.round(rate * GAP_SEC) * channels * 2);
  return { blob: pcm16ToWav(pcm, rate, channels), mime: 'audio/wav', model: models[0], chunks: pieces.length };
}

/** PCM16 조각들을 gapBytes 만큼의 무음(0)을 사이에 두고 이어 붙입니다. */
function joinPcm(list, gapBytes) {
  const even = (n) => n - (n % 2);
  const total = list.reduce((s, b) => s + even(b.byteLength), 0) + gapBytes * Math.max(0, list.length - 1);
  const out = new Uint8Array(total); // 새 배열은 0 으로 차 있으니 쉼 자리는 그대로 무음
  let o = 0;
  list.forEach((b, i) => {
    if (i) o += gapBytes;
    const n = even(b.byteLength);
    out.set(b.subarray(0, n), o);
    o += n;
  });
  return out;
}

/** 제미나이 한 번 부르기. 1분 무료 한도(429)·잠깐 서버 오류(5xx)면 알려 준 만큼 기다렸다가 두 번까지 다시 부릅니다. */
async function geminiOnce({ key, voice, model, text, signal, progress }, tries = 0) {
  // 키는 URL(?key=)이 아니라 헤더로 보낸다 — 실패한 요청의 URL 은 콘솔·네트워크 탭·프록시 로그에 그대로 남기 때문
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
        },
      }),
      signal,
    });
  } catch (e) {
    if (e?.name === 'AbortError') throw stopped();
    throw new Error('제미나이에 연결하지 못했습니다. 인터넷 연결을 확인하세요.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = geminiError(res.status, data, key, model);
    if ((err.code === 'minute' || err.code === 'busy') && tries < 2 && err.wait <= 65) {
      progress({ wait: err.wait });
      await sleep(err.wait * 1000, signal);
      return geminiOnce({ key, voice, model, text, signal, progress }, tries + 1);
    }
    throw err;
  }
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const inlines = parts.map((pt) => pt?.inlineData || pt?.inline_data).filter((d) => d?.data);
  if (!inlines.length) {
    const why = data?.promptFeedback?.blockReason || data?.candidates?.[0]?.finishReason || '';
    throw new Error(`제미나이가 음성을 돌려주지 않았습니다. ${why ? `(${why}) ` : ''}대본을 조금 바꿔 다시 시도하세요.`);
  }
  // 소리가 여러 덩어리로 오면 이어 붙인다(보통은 한 덩어리)
  const got = inlines.map((d) => readAudio(base64ToBytes(d.data), String(d.mimeType || d.mime_type || '')));
  if (got.length === 1) return got[0];
  if (got.some((g) => g.raw || g.rate !== got[0].rate || g.channels !== got[0].channels)) return got[0];
  return { pcm: joinPcm(got.map((g) => g.pcm), 0), rate: got[0].rate, channels: got[0].channels };
}

/**
 * 받은 소리 바이트를 PCM16 으로 읽습니다.
 *  - 2.5 모델: audio/L16;codec=pcm;rate=24000 (헤더 없는 PCM16 모노)
 *  - 3.8 모델: 기본이 audio/wav (RIFF 헤더 + 24kHz 모노 PCM16)
 * 그 밖의 형식은 { raw: true, bytes, mime } 로 그대로 돌려줍니다.
 */
function readAudio(bytes, mime) {
  if (/^audio\/(L16|pcm)/i.test(mime) || /codec=pcm/i.test(mime)) {
    const rate = Number((/rate=(\d+)/i.exec(mime) || [])[1]) || 24000;
    const channels = Number((/channels=(\d+)/i.exec(mime) || [])[1]) || 1;
    return { pcm: bytes, rate, channels };
  }
  if (/wav|wave/i.test(mime) || isRiff(bytes)) {
    const w = parseWav(bytes);
    if (w) return w;
  }
  return { raw: true, bytes, mime: mime || 'application/octet-stream' };
}

const isRiff = (b) => b.length >= 12 && String.fromCharCode(b[0], b[1], b[2], b[3]) === 'RIFF' && String.fromCharCode(b[8], b[9], b[10], b[11]) === 'WAVE';

/** WAV(RIFF) 에서 PCM16 데이터와 표본률·채널 수를 꺼냅니다. 16비트 PCM 이 아니면 null. */
function parseWav(bytes) {
  if (!isRiff(bytes)) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let off = 12;
  let fmt = null;
  while (off + 8 <= bytes.length) {
    const id = String.fromCharCode(bytes[off], bytes[off + 1], bytes[off + 2], bytes[off + 3]);
    const size = v.getUint32(off + 4, true);
    const body = off + 8;
    if (id === 'fmt ' && body + 16 <= bytes.length) {
      fmt = { format: v.getUint16(body, true), channels: v.getUint16(body + 2, true), rate: v.getUint32(body + 4, true), bits: v.getUint16(body + 14, true) };
    } else if (id === 'data') {
      if (!fmt || fmt.bits !== 16 || (fmt.format !== 1 && fmt.format !== 0xfffe)) return null;
      // 흘려 보내기(stream)용 WAV 는 길이 칸이 0 이나 0xFFFFFFFF 로 오기도 해서, 그때는 끝까지 읽는다
      const end = size && size !== 0xffffffff ? Math.min(bytes.length, body + size) : bytes.length;
      return { pcm: bytes.subarray(body, end), rate: fmt.rate || 24000, channels: fmt.channels || 1 };
    }
    off = body + size + (size % 2);
  }
  return null;
}

/** 제미나이 오류 응답을 쉬운 한국어로 바꿉니다. code: key·blocked·model·daily·minute·busy·other, wait: 기다릴 초. */
function geminiError(status, data, key, model) {
  const e = data?.error || {};
  const msg = scrub(e.message, key);
  const details = Array.isArray(e.details) ? e.details : [];
  const reason = String(details.find((d) => d?.reason)?.reason || '');
  const quotaIds = details.flatMap((d) => (Array.isArray(d?.violations) ? d.violations.map((x) => String(x?.quotaId || '')) : []));
  const retry = details.find((d) => /RetryInfo/.test(String(d?.['@type'] || '')))?.retryDelay;
  const retrySec = Math.ceil(parseFloat(String(retry || '')) || 0);
  const make = (code, text, wait = 0) => Object.assign(new Error(text), { code, status, wait });

  if (status === 401 || (status === 400 && (reason === 'API_KEY_INVALID' || /api key/i.test(msg)))) {
    return make('key', "제미나이 API 키가 맞지 않습니다. 맨 위 'AI 키' 칸의 제미나이 키를 AI Studio 에서 다시 복사해 넣으세요.");
  }
  if (status === 403) return make('blocked', `제미나이가 이 키의 사용을 막았습니다. AI Studio 에서 키와 프로젝트를 확인하세요. ${msg}`.trim());
  if (status === 404) return make('model', `제미나이 음성 모델(${model})을 찾지 못했습니다. 잠시 뒤 다시 시도하거나 다른 목소리를 고르세요.`);
  if (status === 429) {
    const free = quotaIds.some((q) => /free/i.test(q)) || /free/i.test(msg);
    if (quotaIds.some((q) => /per\s*day/i.test(q)) || /per day|daily/i.test(msg)) {
      return make('daily', free
        ? '제미나이 오늘 무료 한도를 다 썼습니다. 내일 다시 하거나, 일레븐랩스·Fish Audio 또는 "내 목소리 녹음"을 써 주세요.'
        : '제미나이 오늘 사용 한도를 다 썼습니다. 내일 다시 하거나 다른 목소리를 써 주세요.');
    }
    const wait = Math.min(120, Math.max(1, retrySec || 20));
    return make('minute', `제미나이 ${free ? '무료 ' : ''}한도(1분 요청 수)를 넘었습니다. ${wait}초쯤 뒤 다시 시도하세요.`, wait);
  }
  if (status >= 500) return make('busy', `제미나이 서버가 잠시 바쁩니다 (${status}). 잠시 뒤 다시 시도하세요.`, 3);
  return make('other', `제미나이 오류 (${status}). ${msg}`.trim());
}

// ── 일레븐랩스 ─────────────────────────────────────────
async function elevenlabs(p, { key, voice, model, text, signal }) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'xi-api-key': key, accept: 'audio/mpeg' },
      body: JSON.stringify({
        text,
        model_id: model || 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
      signal,
    });
  } catch (e) {
    if (e?.name === 'AbortError') throw stopped();
    throw new Error('일레븐랩스에 연결하지 못했습니다. 인터넷 연결을 확인하세요.');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const detail = data?.detail;
    const msg = scrub((typeof detail === 'string' ? detail : detail?.message) || data?.message, key);
    const st = String(detail?.status || '');
    if (res.status === 401) {
      if (/quota|limit/i.test(st)) throw new Error(`일레븐랩스 글자 수 한도가 부족합니다. ${msg}`.trim());
      if (st === 'detected_unusual_activity') throw new Error(`일레븐랩스가 무료 요금제 사용을 막았습니다(비정상 사용 감지). 유료 요금제가 필요합니다. ${msg}`.trim());
      if (!st || st === 'invalid_api_key') throw new Error("일레븐랩스 API 키가 맞지 않습니다. 맨 위 'AI 키' 칸의 키를 Profile → API Keys 에서 다시 확인하세요.");
      throw new Error(`일레븐랩스가 요청을 거절했습니다 (${st}). ${msg}`.trim());
    }
    if (res.status === 402) throw new Error(`일레븐랩스 크레딧이 부족합니다. ${msg}`.trim());
    if (res.status === 404 || res.status === 422) throw new Error(`Voice ID 또는 대본을 확인하세요. ${msg}`.trim());
    if (res.status === 429) throw new Error('일레븐랩스 요청이 많습니다. 잠시 뒤 다시 시도하세요.');
    throw new Error(`일레븐랩스 오류 (${res.status}). ${msg}`.trim());
  }
  const blob = await res.blob();
  if (!blob.size) throw new Error('일레븐랩스가 빈 음성을 돌려주었습니다. 다시 시도하세요.');
  return { blob: blob.type ? blob : new Blob([blob], { type: 'audio/mpeg' }), mime: 'audio/mpeg' };
}

// ── Fish Audio(서버 중계) ─────────────────────────────
async function fish(p, { key, voice, model, text, speed }) {
  const info = await serverInfo();
  if (!info.tts) throw new Error('Fish Audio 는 인터넷 배포 버전(ko372.com)에서만 됩니다. 제미나이나 일레븐랩스를 골라 주세요.');
  const ok = (p.models || []).some((m) => m.id === model);
  const blob = await ttsRelay({ provider: 'fish', key, voice, model: ok ? model : 'drama-3', text, speed });
  if (!blob.size) throw new Error('Fish Audio 가 빈 음성을 돌려주었습니다. 다시 시도하세요.');
  return { blob: blob.type ? blob : new Blob([blob], { type: 'audio/mpeg' }), mime: 'audio/mpeg' };
}

// ── 도구 ─────────────────────────────────────────────
/** 오류 문구에 키가 섞여 오면 지우고, 너무 길면 줄입니다(키는 화면·로그에 남기지 않음). */
function scrub(msg, key) {
  let s = String(msg || '');
  if (key && key.length >= 4) s = s.split(key).join('***');
  s = s.replace(/AIza[0-9A-Za-z_-]{10,}/g, '***').replace(/\bsk[-_][0-9A-Za-z_-]{10,}/g, '***');
  return s.length > 200 ? s.slice(0, 200) + '…' : s;
}

/** 사용자가 멈췄을 때 던지는 오류 */
function stopped() {
  const e = new Error('음성 만들기를 멈췄습니다.');
  e.name = 'AbortError';
  return e;
}

/** ms 동안 기다립니다(signal 로 멈추면 바로 끝). */
function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(stopped());
    const t = setTimeout(() => { signal?.removeEventListener?.('abort', onAbort); resolve(); }, ms);
    function onAbort() { clearTimeout(t); reject(stopped()); }
    signal?.addEventListener?.('abort', onAbort, { once: true });
  });
}

function base64ToBytes(b64) {
  const bin = atob(String(b64 || '').replace(/[\r\n\s]/g, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** 헤더 없는 PCM16(리틀엔디언) 바이트에 WAV 헤더(44바이트)를 붙입니다. */
export function pcm16ToWav(pcm, sampleRate = 24000, channels = 1) {
  const dataLen = pcm.byteLength - (pcm.byteLength % 2);
  const buf = new ArrayBuffer(44 + dataLen);
  const v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF');
  v.setUint32(4, 36 + dataLen, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true); // fmt 덩어리 길이
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, channels, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * channels * 2, true); // 초당 바이트
  v.setUint16(32, channels * 2, true); // 한 샘플 묶음 바이트
  v.setUint16(34, 16, true); // 비트
  str(36, 'data');
  v.setUint32(40, dataLen, true);
  new Uint8Array(buf, 44).set(pcm.subarray(0, dataLen));
  return new Blob([buf], { type: 'audio/wav' });
}
