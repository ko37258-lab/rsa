// 웹판 AI 호출 — 서버 없이 브라우저에서 각 회사로 바로 보낸다. 규칙·출력 형식은 서버판과 같은 prompts.js 를 쓴다.
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { ANALYZE_SYSTEM, AnalysisSchema, analyzeUser, SCRIPT_SYSTEM, ScriptSchema, scriptUser } from '../../server/pipeline/prompts.js';
import { getKey, providers } from './keys.js';

const CLAUDE_MODEL = 'claude-opus-5-5';
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta';
const PREFER = ['gemini-3-flash', 'gemini-3.0-flash', 'gemini-2.5-flash', 'gemini-flash-latest', 'gemini-3-pro', 'gemini-2.5-pro'];

// ---------- Claude ----------
// 사용자 본인 키로 본인 브라우저에서 호출하므로 dangerouslyAllowBrowser 를 켠다(키는 Anthropic 으로만 간다)
const claude = () => new Anthropic({ apiKey: getKey('anthropic'), dangerouslyAllowBrowser: true });

export function friendlyError(e) {
  if (e instanceof Anthropic.AuthenticationError) return 'Claude 키가 올바르지 않습니다. 오른쪽 위 🔑 API 키 등록에서 다시 확인하세요.';
  if (e instanceof Anthropic.PermissionDeniedError) return 'Claude 키 권한 문제입니다. Anthropic 콘솔에서 결제(크레딧) 등록을 확인하세요.';
  if (e instanceof Anthropic.RateLimitError) return 'Claude 사용 한도에 걸렸습니다. 잠시 후 다시 시도하거나 콘솔에서 크레딧을 확인하세요.';
  if (e instanceof Anthropic.APIConnectionError) return '인터넷 연결을 확인하세요 (Anthropic 서버에 연결 실패).';
  if (e instanceof Anthropic.InternalServerError) return 'Anthropic 서버가 일시적으로 바쁩니다. 잠시 후 다시 시도하세요.';
  return String(e?.message || e);
}

export async function verifyClaude() {
  try {
    await claude().models.retrieve(CLAUDE_MODEL);
    return { ok: true, msg: `연결됨 (${CLAUDE_MODEL})` };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return { ok: false, msg: '키가 올바르지 않습니다. 복사할 때 앞뒤가 잘리지 않았는지 확인하세요.' };
    if (e instanceof Anthropic.PermissionDeniedError) return { ok: false, msg: '이 키로는 사용할 수 없습니다. 콘솔에서 결제(크레딧) 등록을 확인하세요.' };
    if (e instanceof Anthropic.NotFoundError) return { ok: false, msg: `이 계정에서 ${CLAUDE_MODEL} 모델을 쓸 수 없습니다.` };
    if (e instanceof Anthropic.APIConnectionError) return { ok: false, msg: '인터넷 연결을 확인하세요 (Anthropic 서버에 연결 실패).' };
    return { ok: false, msg: String(e.message || e).slice(0, 200) };
  }
}

async function askClaude({ system, user, schema, effort = 'medium' }) {
  const stream = claude().beta.messages.stream({
    model: CLAUDE_MODEL,
    max_tokens: 64000,
    // 안전 분류기가 요청을 거절하면 서버가 알아서 다른 모델로 재시도한다
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort, format: betaZodOutputFormat(schema) },
    system,
    messages: [{ role: 'user', content: user }],
  });
  const res = await stream.finalMessage();
  if (res.stop_reason === 'refusal') throw new Error(`Claude가 요청을 거절했습니다 (${res.stop_details?.category ?? '사유 미상'})`);
  if (res.stop_reason === 'max_tokens') throw new Error('응답이 길이 제한에 걸려 잘렸습니다. 영상 길이를 줄여 다시 시도하세요.');
  if (res.parsed_output) return res.parsed_output;
  const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  try {
    return schema.parse(JSON.parse(text));
  } catch {
    throw new Error('Claude 응답을 JSON 으로 해석하지 못했습니다.');
  }
}

// ---------- Gemini ----------
class GeminiError extends Error {}
let chosen = null;
export const resetAi = () => {
  chosen = null;
};

async function gemini(path, init = {}) {
  let r;
  try {
    r = await fetch(`${GEMINI}${path}`, { ...init, headers: { 'x-goog-api-key': getKey('gemini'), 'Content-Type': 'application/json' } });
  } catch {
    throw new GeminiError('인터넷 연결을 확인하세요 (Google 서버에 연결 실패).');
  }
  const j = await r.json().catch(() => ({}));
  if (r.ok) return j;
  const msg = j?.error?.message || '';
  const reason = j?.error?.details?.find?.((d) => d.reason)?.reason || '';
  const err = new GeminiError(
    reason === 'API_KEY_INVALID' || /API key not valid/i.test(msg)
      ? 'Gemini 키가 올바르지 않습니다. 복사할 때 앞뒤가 잘리지 않았는지 확인하세요.'
      : r.status === 429
        ? 'Gemini 사용 한도(무료 사용량)에 걸렸습니다. 잠시 후 다시 시도하거나 Google AI Studio 에서 결제를 연결하세요.'
        : r.status === 403
          ? 'Gemini 키 권한 문제입니다. Google AI Studio 에서 새 키를 만들어 보세요.'
          : `Gemini 오류 (${r.status}): ${msg.slice(0, 160)}`,
  );
  err.status = r.status;
  err.raw = msg;
  throw err;
}

async function pickModel() {
  if (chosen) return chosen;
  const names = [];
  let token = '';
  do {
    const j = await gemini(`/models?pageSize=200${token ? `&pageToken=${token}` : ''}`);
    for (const m of j.models || []) {
      const name = m.name.replace(/^models\//, '');
      if (!(m.supportedGenerationMethods || []).includes('generateContent')) continue;
      if (/image|tts|audio|live|embed|vision|robotics|computer|native|nano|gemma|learnlm|aqa/i.test(name)) continue;
      names.push(name);
    }
    token = j.nextPageToken || '';
  } while (token);
  for (const p of PREFER) {
    const hit = names.find((n) => n === p) || names.find((n) => n.startsWith(p) && !/lite/.test(n));
    if (hit) return (chosen = hit);
  }
  chosen = names.find((n) => /flash/.test(n) && !/lite/.test(n)) || names.find((n) => n.startsWith('gemini')) || null;
  if (!chosen) throw new GeminiError('이 키로 쓸 수 있는 Gemini 글쓰기 모델을 찾지 못했습니다.');
  return chosen;
}

export async function verifyGemini() {
  try {
    chosen = null;
    return { ok: true, msg: `연결됨 (${await pickModel()})` };
  } catch (e) {
    return { ok: false, msg: String(e.message || e).slice(0, 200) };
  }
}

function textOf(j) {
  if (j?.promptFeedback?.blockReason) throw new GeminiError(`Gemini가 요청을 거절했습니다 (${j.promptFeedback.blockReason}).`);
  const c = j?.candidates?.[0];
  if (!c) throw new GeminiError('Gemini 응답이 비어 있습니다. 다시 시도해 주세요.');
  if (c.finishReason === 'MAX_TOKENS') throw new GeminiError('응답이 길이 제한에 걸려 잘렸습니다. 영상 길이를 줄여 다시 시도하세요.');
  if (['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION'].includes(c.finishReason)) throw new GeminiError(`Gemini가 응답을 중단했습니다 (${c.finishReason}).`);
  return (c.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || '').join('');
}
const parseJson = (t) => JSON.parse(t.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, ''));

async function askGemini({ system, user, schema, videoUrl }) {
  const model = await pickModel();
  const jsonSchema = z.toJSONSchema(schema);
  delete jsonSchema.$schema;
  const body = (withSchema, extra = '') => ({
    systemInstruction: { parts: [{ text: system }] },
    contents: [
      {
        role: 'user',
        parts: [
          // 브라우저는 유튜브 자막을 못 읽으므로, 대본이 없으면 Gemini 가 영상을 직접 본다
          ...(videoUrl ? [{ fileData: { fileUri: videoUrl } }] : []),
          { text: withSchema ? user + extra : `${user}${extra}\n\n반드시 아래 JSON 스키마에 맞는 JSON 하나만 출력하세요.\n${JSON.stringify(jsonSchema)}` },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      ...(withSchema ? { responseJsonSchema: jsonSchema } : {}),
      ...(videoUrl ? { mediaResolution: 'MEDIA_RESOLUTION_LOW' } : {}),
      maxOutputTokens: 32768,
    },
  });
  const send = (b) => gemini(`/models/${model}:generateContent`, { method: 'POST', body: JSON.stringify(b) });

  let withSchema = true;
  let j;
  try {
    j = await send(body(true));
  } catch (e) {
    if (!(e instanceof GeminiError) || e.status !== 400 || /API key/i.test(e.raw || '')) throw e;
    withSchema = false;
    j = await send(body(false));
  }
  let result;
  try {
    result = schema.safeParse(parseJson(textOf(j)));
  } catch (e) {
    if (e instanceof GeminiError) throw e;
    result = { success: false, error: { message: 'JSON 이 아님' } };
  }
  if (result.success) return result.data;
  j = await send(body(withSchema, `\n\n(이전 출력이 형식에 맞지 않았습니다: ${String(result.error?.message).slice(0, 400)}. 형식을 정확히 지켜 다시 작성하세요.)`));
  try {
    return schema.parse(parseJson(textOf(j)));
  } catch (e) {
    if (e instanceof GeminiError) throw e;
    throw new GeminiError('Gemini 응답을 정해진 형식으로 해석하지 못했습니다. 다시 시도해 주세요.');
  }
}

const ask = (opts) => (providers().text === 'gemini' ? askGemini(opts) : askClaude(opts));

export const analyzeBenchmark = ({ videoUrl, ...args }) =>
  ask({ system: ANALYZE_SYSTEM, user: analyzeUser(args), schema: AnalysisSchema, effort: 'medium', videoUrl });

export const writeScript = (args) => ask({ system: SCRIPT_SYSTEM, user: scriptUser(args), schema: ScriptSchema, effort: 'high' });

// ---------- OpenAI · ElevenLabs ----------
export async function verifyOpenAI() {
  try {
    const r = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${getKey('openai')}` } });
    if (r.ok) return { ok: true, msg: '연결됨 (그림·목소리 사용 가능)' };
    if (r.status === 401) return { ok: false, msg: '키가 올바르지 않습니다. 복사할 때 앞뒤가 잘리지 않았는지 확인하세요.' };
    if (r.status === 429) return { ok: false, msg: '사용 한도 초과 또는 결제 미등록입니다. OpenAI 결제(Billing) 페이지를 확인하세요.' };
    return { ok: false, msg: `OpenAI 응답 오류 (${r.status})` };
  } catch {
    return { ok: false, msg: '인터넷 연결을 확인하세요 (OpenAI 서버에 연결 실패).' };
  }
}

export async function openaiImage(prompt) {
  const r = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${getKey('openai')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-image-1', prompt: `${prompt}. 16:9 cinematic composition, no text, no letters, no watermark.`, size: '1536x1024', n: 1 }),
  });
  if (!r.ok) throw new Error(`OpenAI 이미지 ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const b64 = (await r.json()).data?.[0]?.b64_json;
  if (!b64) throw new Error('OpenAI 이미지 응답에 데이터가 없습니다');
  return new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: 'image/png' });
}

export async function openaiTts(text, voice) {
  const r = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${getKey('openai')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice, input: text, response_format: 'mp3', instructions: '한국어 유튜브 정보 채널 내레이터처럼, 또렷하고 리듬감 있게 읽어 주세요.' }),
  });
  if (!r.ok) throw new Error(`OpenAI TTS ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.arrayBuffer();
}

export async function elevenTts(text, voiceId) {
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': getKey('elevenlabs'), 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2' }),
  });
  if (!r.ok) throw new Error(`ElevenLabs ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.arrayBuffer();
}

let elevenVoices = [];
export const elevenVoiceCache = () => elevenVoices;
const CATEGORY = { cloned: '내가 복제한 목소리', professional: '전문 복제 목소리', generated: '생성한 목소리', premade: '기본 목소리' };
export const categoryLabel = (c) => CATEGORY[c] || 'ElevenLabs';

export async function loadElevenVoices() {
  const r = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': getKey('elevenlabs') } });
  if (!r.ok) throw Object.assign(new Error(`ElevenLabs ${r.status}`), { status: r.status });
  const list = ((await r.json()).voices || []).map((v) => ({ id: v.voice_id, name: v.name, category: v.category }));
  const rank = (c) => (c === 'cloned' || c === 'professional' ? 0 : c === 'generated' ? 1 : 2);
  list.sort((a, b) => rank(a.category) - rank(b.category) || a.name.localeCompare(b.name));
  elevenVoices = list;
  return list;
}
export async function verifyEleven() {
  try {
    const list = await loadElevenVoices();
    const mine = list.filter((v) => v.category === 'cloned' || v.category === 'professional').length;
    return { ok: true, msg: `연결됨 (목소리 ${list.length}개${mine ? `, 내 복제 목소리 ${mine}개` : ''})` };
  } catch (e) {
    elevenVoices = [];
    if (e.status === 401) return { ok: false, msg: '키가 올바르지 않거나, 키 권한에 "Voices(목소리) 읽기"가 꺼져 있습니다.' };
    if (e.status) return { ok: false, msg: `ElevenLabs 응답 오류 (${e.status})` };
    return { ok: false, msg: '인터넷 연결을 확인하세요 (ElevenLabs 서버에 연결 실패).' };
  }
}
