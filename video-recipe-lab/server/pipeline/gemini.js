// Gemini 로 분석·대본 만들기 — Claude 키가 없는 사람을 위한 선택지.
// Google AI Studio 키(무료 사용량 있음)로 동작한다. 규칙과 출력 형식은 prompts.js 를 Claude 와 똑같이 쓴다.
import { z } from 'zod';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const key = () => process.env.GEMINI_API_KEY?.trim();

// 어떤 모델이 열려 있는지는 계정·시기마다 다르므로, 키로 모델 목록을 받아 가장 알맞은 것을 고른다.
// .env 의 GEMINI_MODEL 로 직접 지정할 수도 있다.
const PREFER = ['gemini-3-flash', 'gemini-3.0-flash', 'gemini-2.5-flash', 'gemini-flash-latest', 'gemini-3-pro', 'gemini-2.5-pro'];
let chosen = null;
export const resetGemini = () => {
  chosen = null;
};

class GeminiError extends Error {}

async function call(path, init = {}) {
  let r;
  try {
    r = await fetch(`${BASE}${path}`, { ...init, headers: { 'x-goog-api-key': key(), 'Content-Type': 'application/json', ...(init.headers || {}) } });
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
  if (process.env.GEMINI_MODEL) return process.env.GEMINI_MODEL.trim();
  if (chosen) return chosen;
  const names = [];
  let token = '';
  do {
    const j = await call(`/models?pageSize=200${token ? `&pageToken=${token}` : ''}`);
    for (const m of j.models || []) {
      const name = m.name.replace(/^models\//, '');
      if (!(m.supportedGenerationMethods || []).includes('generateContent')) continue;
      if (/image|tts|audio|live|embed|vision|robotics|computer|native|nano|gemma|learnlm|aqa/i.test(name)) continue;
      names.push(name);
    }
    token = j.nextPageToken || '';
  } while (token);
  for (const p of PREFER) {
    const exact = names.find((n) => n === p);
    const variant = names.find((n) => n.startsWith(p) && !/lite/.test(n));
    if (exact || variant) return (chosen = exact || variant);
  }
  chosen = names.find((n) => /flash/.test(n) && !/lite/.test(n)) || names.find((n) => n.startsWith('gemini')) || null;
  if (!chosen) throw new GeminiError('이 키로 쓸 수 있는 Gemini 글쓰기 모델을 찾지 못했습니다.');
  return chosen;
}

// 키 확인: 모델 목록 조회는 요금이 나가지 않는다
export async function verifyGemini() {
  try {
    resetGemini();
    const m = await pickModel();
    return { ok: true, msg: `연결됨 (${m})` };
  } catch (e) {
    return { ok: false, msg: e instanceof GeminiError ? e.message : String(e.message || e).slice(0, 200) };
  }
}

const jsonSchemaOf = (schema) => {
  const s = z.toJSONSchema(schema);
  delete s.$schema;
  return s;
};

function textOf(j) {
  const block = j?.promptFeedback?.blockReason;
  if (block) throw new GeminiError(`Gemini가 요청을 거절했습니다 (${block}).`);
  const c = j?.candidates?.[0];
  if (!c) throw new GeminiError('Gemini 응답이 비어 있습니다. 다시 시도해 주세요.');
  if (c.finishReason === 'MAX_TOKENS') throw new GeminiError('응답이 길이 제한에 걸려 잘렸습니다. 영상 길이를 줄여 다시 시도하세요.');
  if (['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION'].includes(c.finishReason)) {
    throw new GeminiError(`Gemini가 응답을 중단했습니다 (${c.finishReason}).`);
  }
  return (c.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || '').join('');
}

const parseJson = (text) => JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, ''));

export async function askGemini({ system, user, schema }) {
  const model = await pickModel();
  const jsonSchema = jsonSchemaOf(schema);
  const body = (withSchema, extra = '') => ({
    systemInstruction: { parts: [{ text: system }] },
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: withSchema
              ? user + extra
              : `${user}${extra}\n\n반드시 아래 JSON 스키마에 맞는 JSON 하나만 출력하세요.\n${JSON.stringify(jsonSchema)}`,
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      ...(withSchema ? { responseJsonSchema: jsonSchema } : {}),
      maxOutputTokens: 32768,
    },
  });
  const send = (b) => call(`/models/${model}:generateContent`, { method: 'POST', body: JSON.stringify(b) });

  // 1차: 스키마를 지정해서 요청. 모델이 스키마 지정을 지원하지 않으면 프롬프트에 스키마를 넣어 다시 요청
  let withSchema = true;
  let j;
  try {
    j = await send(body(true));
  } catch (e) {
    if (!(e instanceof GeminiError) || e.status !== 400 || /API key/i.test(e.raw || '')) throw e;
    withSchema = false;
    j = await send(body(false));
  }
  let text = textOf(j);
  let result = (() => {
    try {
      return schema.safeParse(parseJson(text));
    } catch {
      return { success: false, error: { message: 'JSON 이 아님' } };
    }
  })();
  if (result.success) return result.data;

  // 2차: 형식이 어긋났으면 무엇이 틀렸는지 알려 주고 한 번 더
  j = await send(body(withSchema, `\n\n(이전 출력이 형식에 맞지 않았습니다: ${String(result.error?.message).slice(0, 400)}. 형식을 정확히 지켜 다시 작성하세요.)`));
  text = textOf(j);
  try {
    return schema.parse(parseJson(text));
  } catch {
    throw new GeminiError('Gemini 응답을 정해진 형식으로 해석하지 못했습니다. 다시 시도해 주세요.');
  }
}
