// 내레이션 만들기 — 제미나이(Gemini TTS)·일레븐랩스(ElevenLabs)·Fish Audio 의 API 키로 대본을 목소리로 만듭니다.
//  - 제미나이·일레븐랩스: 브라우저에서 각 서비스로 바로 부릅니다(키는 그 서비스로만 갑니다).
//  - Fish Audio: 브라우저에서 직접 부르면 CORS 로 막혀서, 이 사이트의 서버 함수(api/tts)가 한 번 전달만 합니다. 서버는 키를 저장하지 않습니다.
// 결과는 { blob, mime } — shorts.js 가 내레이션 자리에 넣습니다.

import { inArtifact, serverInfo, ttsRelay } from './platform.js';

/** 대본 글자 수 한도 */
export const MAX_TEXT = 3000;
/** 속도 범위(화면 슬라이더와 같음). Fish Audio 에만 적용됩니다. */
export const SPEED_MIN = 0.8;
export const SPEED_MAX = 1.3;

export const PROVIDERS = [
  {
    id: 'gemini',
    name: '제미나이 (Google)',
    short: '제미나이',
    direct: true, // 브라우저에서 바로 부름
    keyHint: 'AI Studio → Get API key',
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
    model: 'gemini-2.5-flash-preview-tts',
  },
  {
    id: 'elevenlabs',
    name: '일레븐랩스',
    short: '일레븐랩스',
    direct: true,
    keyHint: 'elevenlabs.io → Profile → API Keys',
    voiceLabel: 'Voice ID',
    model: 'eleven_multilingual_v2',
  },
  {
    id: 'fish',
    name: 'Fish Audio',
    short: 'Fish Audio',
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

/**
 * 대본을 음성으로 만듭니다.
 * @param {{ provider: string, key: string, voice: string, model?: string, text: string, speed?: number }} o
 * @returns {Promise<{ blob: Blob, mime: string }>}
 */
export async function synthesize({ provider, key, voice, model, text, speed = 1 }) {
  if (inArtifact) throw new Error('Claude 미리보기에서는 음성 생성이 안 됩니다. ko372.com 에서 써 주세요.');
  const p = providerOf(provider);
  key = String(key || '').trim();
  voice = String(voice || '').trim();
  text = String(text || '').trim();
  if (!key) throw new Error(`${p.name} API 키를 넣어 주세요. (${p.keyHint})`);
  // 복사하다 붙은 줄바꿈·전각·보이지 않는 글자는 fetch 가 '잘못된 헤더' 로 던져 연결 실패처럼 보이므로 먼저 걸러 준다
  if (!/^[\x21-\x7E]+$/.test(key)) throw new Error('API 키에 허용되지 않는 글자(공백·한글·줄바꿈 등)가 있습니다. 키를 다시 복사해 넣으세요.');
  if (!voice) throw new Error(p.voiceLabel ? `${p.voiceLabel}를 넣어 주세요.` : '목소리를 골라 주세요.');
  if (!text) throw new Error('대본이 비어 있습니다. 장면 자막을 가져오거나 직접 적어 주세요.');
  if (text.length > MAX_TEXT) throw new Error(`대본이 너무 깁니다 (${text.length.toLocaleString()}자). ${MAX_TEXT.toLocaleString()}자 이하로 줄여 주세요.`);
  speed = Number(speed);
  if (!Number.isFinite(speed)) speed = 1;
  speed = Math.min(SPEED_MAX, Math.max(SPEED_MIN, speed));

  // 제미나이·일레븐랩스는 고정 모델을 씁니다(화면의 "엔진" 칸은 Fish Audio 전용이라 넘어온 model 은 무시).
  if (p.id === 'gemini') return gemini(p, { key, voice, model: p.model, text });
  if (p.id === 'elevenlabs') return elevenlabs(p, { key, voice, model: p.model, text });
  return fish(p, { key, voice, model, text, speed });
}

// ── 제미나이 ─────────────────────────────────────────
async function gemini(p, { key, voice, model, text }) {
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
    });
  } catch {
    throw new Error('제미나이에 연결하지 못했습니다. 인터넷 연결을 확인하세요.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = String(data?.error?.message || '');
    if (res.status === 400 && /api key/i.test(msg)) throw new Error('제미나이 API 키가 맞지 않습니다. AI Studio 에서 키를 다시 확인하세요.');
    if (res.status === 403) throw new Error(`제미나이가 이 키의 사용을 막았습니다. ${msg}`);
    if (res.status === 429) throw new Error(`제미나이 사용 한도를 넘었습니다. 잠시 뒤 다시 시도하세요. ${msg}`);
    throw new Error(`제미나이 오류 (${res.status}). ${msg}`.trim());
  }
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const inline = parts.find((pt) => pt?.inlineData?.data)?.inlineData;
  if (!inline) {
    const why = data?.promptFeedback?.blockReason || data?.candidates?.[0]?.finishReason || '';
    throw new Error(`제미나이가 음성을 돌려주지 않았습니다. ${why ? `(${why}) ` : ''}대본을 조금 바꿔 다시 시도하세요.`);
  }
  const mime = String(inline.mimeType || '');
  const bytes = base64ToBytes(inline.data);
  // 보통 audio/L16;codec=pcm;rate=24000 (헤더 없는 PCM16 모노) 로 옵니다. 다른 형식이면 그대로 씁니다.
  if (/^audio\/L16/i.test(mime) || /pcm/i.test(mime)) {
    const rate = Number((/rate=(\d+)/.exec(mime) || [])[1]) || 24000;
    return { blob: pcm16ToWav(bytes, rate, 1), mime: 'audio/wav' };
  }
  return { blob: new Blob([bytes], { type: mime || 'application/octet-stream' }), mime: mime || 'application/octet-stream' };
}

// ── 일레븐랩스 ─────────────────────────────────────────
async function elevenlabs(p, { key, voice, model, text }) {
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
    });
  } catch {
    throw new Error('일레븐랩스에 연결하지 못했습니다. 인터넷 연결을 확인하세요.');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const detail = data?.detail;
    const msg = String((typeof detail === 'string' ? detail : detail?.message) || data?.message || '');
    const st = String(detail?.status || '');
    if (res.status === 401) {
      if (/quota|limit/i.test(st)) throw new Error(`일레븐랩스 글자 수 한도가 부족합니다. ${msg}`.trim());
      if (st === 'detected_unusual_activity') throw new Error(`일레븐랩스가 무료 요금제 사용을 막았습니다(비정상 사용 감지). 유료 요금제가 필요합니다. ${msg}`.trim());
      if (!st || st === 'invalid_api_key') throw new Error('일레븐랩스 API 키가 맞지 않습니다. Profile → API Keys 에서 다시 확인하세요.');
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
