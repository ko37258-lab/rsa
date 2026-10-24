// 사용자 AI 키로 브라우저에서 직접 부르는 AI — 사진을 보고 정해진 JSON 모양으로 답을 받습니다.
//  - 제미나이(무료 한도 있음)·클로드·GPT 세 곳. 키는 keys.js 한 곳에서 꺼내고, 그 서비스로만 보냅니다(이 사이트 서버를 거치지 않음).
//  - 사진은 긴 변 1024px JPEG 로 줄여 base64 로 보냅니다(imageToBase64).
//  - 오류는 서비스별 쉬운 한국어로 바꿉니다. 응답 본문에 키(또는 일부)가 섞여 와도 문구에는 넣지 않습니다.
// 모델 이름은 아래 LLM_PROVIDERS 한 곳에만 적습니다(2026-10 공식 문서 기준).

import { getKey, firstWithKey } from './keys.js';

export const LLM_PROVIDERS = [
  // 제미나이 3.8 Flash: 무료 등급 있음, 사진 입력·구조화 출력 지원(ai.google.dev 모델·가격 문서). 2.5 계열은 지원 종료 예정이라 쓰지 않음.
  { id: 'gemini', name: '제미나이', model: 'gemini-3.8-flash', free: true },
  { id: 'claude', name: '클로드', model: 'claude-opus-5-5' },
  // GPT-6.1 Sol: 성능과 비용의 균형형 범용 모델, 사진 입력·Structured Outputs 지원(developers.openai.com 모델 문서).
  { id: 'openai', name: 'GPT', model: 'gpt-6.1-sol' },
];

const ORDER = LLM_PROVIDERS.map((p) => p.id);
export const llmProviderOf = (id) => LLM_PROVIDERS.find((p) => p.id === id) || null;

/** 고른 서비스(키가 있을 때) → 아니면 키가 있는 첫 서비스(제미나이→클로드→GPT) → 없으면 null */
export function pickProvider(preferred) {
  if (preferred && llmProviderOf(preferred) && getKey(preferred)) return preferred;
  return firstWithKey(ORDER);
}

const TIMEOUT_MS = 150_000;

/**
 * 프롬프트(+사진)를 보내 JSON 으로 받습니다.
 * @param {{ provider?: string, prompt: string, schema: object, images?: {mime: string, base64: string}[], signal?: AbortSignal, maxTokens?: number }} o
 * @returns {Promise<object>} 파싱된 객체
 */
export async function generateJSON({ provider, prompt, schema, images = [], signal, maxTokens } = {}) {
  if (provider && !llmProviderOf(provider)) throw new Error('알 수 없는 AI 서비스입니다.');
  const p = llmProviderOf(provider || pickProvider());
  if (!p) throw new Error('AI 키가 없습니다. 맨 위 AI 키 칸에 제미나이(무료) 키를 넣어 주세요.');
  const key = getKey(p.id);
  if (!key) throw new Error(`${p.name} 키가 없습니다. 맨 위 AI 키 칸에 넣어 주세요.`);
  const text = String(prompt || '').trim();
  if (!text) throw new Error('AI 에게 보낼 내용이 비어 있습니다.');
  if (!schema || typeof schema !== 'object') throw new Error('답 형식(스키마)이 없습니다.');
  const imgs = (Array.isArray(images) ? images : []).filter((im) => im && typeof im.base64 === 'string' && im.base64);
  const max = Number.isFinite(Number(maxTokens)) && Number(maxTokens) > 0 ? Math.round(Number(maxTokens)) : 16000;

  const call = { gemini: callGemini, claude: callClaude, openai: callOpenAI }[p.id];
  const { signal: sig, cleanup, timedOut } = withTimeout(signal, TIMEOUT_MS);
  try {
    const out = await call({ p, key, prompt: text, schema, images: imgs, signal: sig, max });
    return parseJSONText(out, p);
  } catch (e) {
    if (e?.name === 'AbortError' || sig.aborted) {
      if (timedOut()) throw new Error(`${p.name} 응답이 너무 늦습니다. 사진 수를 줄이거나 잠시 뒤 다시 시도하세요.`);
      const err = new Error('AI 요청을 멈췄습니다.');
      err.name = 'AbortError';
      throw err;
    }
    throw e;
  } finally {
    cleanup();
  }
}

// ── 스키마를 서비스마다 받는 모양으로 바꾸기 ──────────────
// 기본 스키마는 평범한 JSON Schema(type·properties·items·required·additionalProperties:false·description)에
// 몇 가지 제한(minLength·maxLength·minimum·maximum·minItems·maxItems)을 적어 둔 것입니다.
// 서비스가 못 받는 제한은 빼고, 대신 description 에 말로 적어 AI 가 지키게 합니다(앱에서 한 번 더 정리함).

const SUPPORT = {
  // 제미나이(generateContent responseFormat.text.schema): minItems·maxItems·minimum·maximum·additionalProperties 지원, 글자 수 제한은 무시됨
  gemini: { minItems: true, maxItems: true, minimum: true, maximum: true, minLength: false, maxLength: false },
  // 클로드(output_config.format): 숫자·글자 수 제한 없음, minItems 는 0·1 만
  claude: { minItems: 'zeroOrOne', maxItems: false, minimum: false, maximum: false, minLength: false, maxLength: false },
  // GPT(Responses text.format strict): 모든 속성 required·additionalProperties:false 필수, minItems·maxItems·minimum·maximum 지원, 글자 수 제한 없음
  openai: { minItems: true, maxItems: true, minimum: true, maximum: true, minLength: false, maxLength: false },
};
const LIMIT_WORDS = {
  minLength: (n) => `${n}자 이상`,
  maxLength: (n) => `${n}자 이하`,
  minimum: (n) => `${n} 이상`,
  maximum: (n) => `${n} 이하`,
  minItems: (n) => `${n}개 이상`,
  maxItems: (n) => `${n}개 이하`,
};
const DROP_ALWAYS = new Set(['$schema', '$id', 'default', 'examples', 'pattern', 'format', 'multipleOf', 'exclusiveMinimum', 'exclusiveMaximum', 'minProperties', 'maxProperties', 'uniqueItems', 'title']);

/** 기본 JSON 스키마 → provider('gemini'|'claude'|'openai')가 받는 스키마(원본은 바꾸지 않음) */
export function schemaFor(provider, schema) {
  const rule = SUPPORT[provider];
  if (!rule) throw new Error('알 수 없는 AI 서비스입니다.');
  const walk = (node) => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== 'object') return node;
    const out = {};
    const notes = [];
    for (const [k, v] of Object.entries(node)) {
      if (DROP_ALWAYS.has(k)) continue;
      if (k in LIMIT_WORDS) {
        const ok = rule[k] === true || (rule[k] === 'zeroOrOne' && (v === 0 || v === 1));
        if (ok) out[k] = v;
        else if (rule[k] === 'zeroOrOne' && Number(v) > 1) { out[k] = 1; notes.push(LIMIT_WORDS[k](v)); }
        else notes.push(LIMIT_WORDS[k](v));
        continue;
      }
      if (k === 'properties' && v && typeof v === 'object') {
        out.properties = Object.fromEntries(Object.entries(v).map(([pk, pv]) => [pk, walk(pv)]));
        continue;
      }
      out[k] = walk(v);
    }
    if (notes.length) out.description = `${out.description ? out.description + ' ' : ''}(${notes.join(', ')})`;
    const isObject = out.type === 'object' || (Array.isArray(out.type) && out.type.includes('object'));
    if (isObject && out.properties) {
      out.additionalProperties = false; // 세 서비스 모두 받는 값. 클로드·GPT 는 반드시 false
      if (provider === 'openai') out.required = Object.keys(out.properties); // strict 모드: 모든 속성 required
      else if (!Array.isArray(out.required)) out.required = Object.keys(out.properties);
    }
    return out;
  };
  return walk(schema);
}

// ── 제미나이 ─────────────────────────────────────────
// 공식 REST: POST /v1beta/models/{model}:generateContent, 헤더 x-goog-api-key,
// generationConfig.responseFormat.text = { mimeType:'APPLICATION_JSON', schema }(현재 문서 방식).
// 예전 방식(responseMimeType + responseJsonSchema)만 받는 경우를 위해 400 "알 수 없는 필드"면 한 번만 예전 방식으로 다시 보냅니다.
async function callGemini({ p, key, prompt, schema, images, signal, max }) {
  // 키는 URL(?key=)에 넣지 않습니다 — 실패한 요청 주소는 콘솔·네트워크 탭·프록시 기록에 그대로 남기 때문
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(p.model)}:generateContent`;
  const parts = [
    // 여러 장이면 번호 라벨(0부터)을 붙여 대본의 photo 번호와 맞춘다
    ...images.flatMap((im, i) => [
      ...(images.length > 1 ? [{ text: `사진 ${i}:` }] : []),
      { inline_data: { mime_type: im.mime || 'image/jpeg', data: im.base64 } },
    ]),
    { text: prompt },
  ];
  const gschema = schemaFor('gemini', schema);
  const body = (legacy) => JSON.stringify({
    contents: [{ role: 'user', parts }],
    generationConfig: {
      ...(legacy
        ? { responseMimeType: 'application/json', responseJsonSchema: gschema }
        : { responseFormat: { text: { mimeType: 'APPLICATION_JSON', schema: gschema } } }),
      maxOutputTokens: max,
      thinkingConfig: { thinkingLevel: 'low' }, // 3.8 Flash 는 minimal 을 받지 않음 → low(빠르고 무료 한도를 덜 씀)
    },
  });
  const send = (legacy) => post(p, url, { 'content-type': 'application/json', 'x-goog-api-key': key }, body(legacy), signal);
  let { res, data } = await send(false);
  if (res.status === 400 && /responseFormat|Unknown name|Invalid JSON payload/i.test(errText(data))) ({ res, data } = await send(true));
  if (!res.ok) throw geminiError(res.status, data, key);
  const blocked = data?.promptFeedback?.blockReason;
  const cand = data?.candidates?.[0];
  const textOut = (cand?.content?.parts || []).filter((pt) => typeof pt?.text === 'string' && !pt.thought).map((pt) => pt.text).join('');
  if (!textOut) {
    const why = blocked || cand?.finishReason || '';
    if (/MAX_TOKENS/.test(why)) throw new Error('제미나이 답이 너무 길어 중간에 끊겼습니다. 사진이나 장면 수를 줄여 다시 시도하세요.');
    throw new Error(`제미나이가 이 사진·내용으로는 답하지 않았습니다${why ? ` (${why})` : ''}. 사진이나 내용을 조금 바꿔 다시 시도하세요.`);
  }
  if (cand?.finishReason === 'MAX_TOKENS') throw new Error('제미나이 답이 너무 길어 중간에 끊겼습니다. 사진이나 장면 수를 줄여 다시 시도하세요.');
  return textOut;
}

function geminiError(status, data, key) {
  const msg = errText(data);
  const reason = JSON.stringify(data?.error?.details || '') + ' ' + String(data?.error?.status || '') + ' ' + String(data?.error?.code || '');
  if (status === 401 || (status === 400 && /api[_ ]?key|API_KEY_INVALID|authentication/i.test(msg + reason))) {
    return new Error('제미나이 API 키가 맞지 않습니다. Google AI Studio(aistudio.google.com/apikey)에서 키를 다시 복사해 넣으세요.');
  }
  if (status === 400 && /location|region|country|FAILED_PRECONDITION|billing/i.test(msg + reason)) {
    return new Error('이 계정(또는 지역)에서는 제미나이 무료 사용이 막혀 있습니다. AI Studio 에서 계정 상태를 확인하거나 클로드·GPT 키를 써 주세요.');
  }
  if (status === 402) return new Error('제미나이 선불 크레딧이 모두 떨어졌습니다. AI Studio 결제 설정을 확인하세요.');
  if (status === 403) return new Error('제미나이가 이 키의 사용을 막았습니다. AI Studio 에서 키 권한과 프로젝트 상태를 확인하세요.');
  if (status === 404) return new Error(`제미나이 모델(${llmProviderOf('gemini').model})을 찾지 못했습니다. 모델 이름이 바뀌었을 수 있으니 관리자에게 알려 주세요.`);
  if (status === 413) return new Error('사진이 너무 많거나 큽니다. 사진 수를 줄여 다시 시도하세요.');
  if (status === 429) {
    // tts.js 와 같은 방식: QuotaFailure.violations[].quotaId(…PerDay…-FreeTier)로 하루·분 한도를 가르고, RetryInfo.retryDelay 로 기다릴 초를 알려 줍니다.
    // 하루 한도(RPD)는 미국 태평양 시간 자정에 초기화됩니다(한국 시간 오후 4시, 겨울에는 오후 5시쯤).
    const details = Array.isArray(data?.error?.details) ? data.error.details : [];
    const quotaIds = details.flatMap((d) => (Array.isArray(d?.violations) ? d.violations.map((x) => String(x?.quotaId || '')) : []));
    const free = quotaIds.some((q) => /free/i.test(q)) || /free/i.test(msg);
    if (quotaIds.some((q) => /per\s*day/i.test(q)) || /per day|daily/i.test(msg)) {
      return new Error(free
        ? '제미나이 오늘 무료 한도를 다 썼습니다. 내일(한국 시간 오후 4~5시쯤 초기화) 다시 하거나, 맨 위 AI 키 칸에 클로드·GPT 키를 넣어 쓰세요.'
        : '제미나이 오늘 사용 한도를 다 썼습니다. 내일(한국 시간 오후 4~5시쯤 초기화) 다시 하거나 클로드·GPT 키를 쓰세요.');
    }
    const retry = details.find((d) => /RetryInfo/.test(String(d?.['@type'] || '')))?.retryDelay;
    const wait = Math.min(120, Math.max(1, Math.ceil(parseFloat(String(retry || '')) || 0) || 60));
    return new Error(`제미나이 ${free ? '무료 ' : ''}한도(1분 요청 수)를 넘었습니다. ${wait}초쯤 뒤 다시 시도하세요. 급하면 클로드·GPT 키를 쓰세요.`);
  }
  if (status >= 500) return new Error(`제미나이 서버가 잠시 바쁩니다 (${status}). 잠시 뒤 다시 시도하세요.`);
  return new Error(`제미나이 요청 오류 (${status}). ${scrub(msg, key)}`.trim());
}

// ── 클로드 ───────────────────────────────────────────
// 공식 REST: POST https://api.anthropic.com/v1/messages, 헤더 x-api-key·anthropic-version,
// 브라우저 직접 호출은 anthropic-dangerous-direct-browser-access: true. 구조화 출력은 output_config.format(json_schema).
async function callClaude({ p, key, prompt, schema, images, signal, max }) {
  const content = [
    // 사진을 글보다 앞에 두면 결과가 더 좋다는 공식 안내를 따름. 여러 장이면 번호 라벨을 붙여 photo 번호와 맞춘다.
    ...images.flatMap((im, i) => [
      ...(images.length > 1 ? [{ type: 'text', text: `사진 ${i}:` }] : []),
      { type: 'image', source: { type: 'base64', media_type: im.mime || 'image/jpeg', data: im.base64 } },
    ]),
    { type: 'text', text: prompt },
  ];
  const { res, data } = await post(p, 'https://api.anthropic.com/v1/messages', {
    'content-type': 'application/json',
    'x-api-key': key,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  }, JSON.stringify({
    model: p.model,
    max_tokens: max,
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: schemaFor('claude', schema) } },
    messages: [{ role: 'user', content }],
  }), signal);
  if (!res.ok) throw claudeError(res.status, data, key, res.headers);
  if (data?.stop_reason === 'refusal') throw new Error('클로드가 이 사진·내용으로는 답하지 않았습니다. 내용을 조금 바꿔 다시 시도하세요.');
  if (data?.stop_reason === 'max_tokens') throw new Error('클로드 답이 너무 길어 중간에 끊겼습니다. 사진이나 장면 수를 줄여 다시 시도하세요.');
  const textOut = (data?.content || []).filter((b) => b?.type === 'text').map((b) => b.text).join('');
  if (!textOut) throw new Error('클로드가 빈 답을 돌려주었습니다. 다시 시도하세요.');
  return textOut;
}

function claudeError(status, data, key, headers) {
  const msg = errText(data);
  const type = String(data?.error?.type || '');
  if (status === 401 || type === 'authentication_error') return new Error('클로드 API 키가 맞지 않습니다. console.anthropic.com → API Keys 에서 키를 다시 복사해 넣으세요.');
  // 402 billing_error(공식 오류 문서): 결제·크레딧 문제
  if (status === 402 || type === 'billing_error' || /credit balance|billing/i.test(msg)) return new Error('클로드 크레딧(결제)이 부족합니다. console.anthropic.com → Billing 에서 충전하거나 결제 수단을 확인한 뒤 다시 시도하세요.');
  // 직접 정한 조직·워크스페이스 지출 한도에 닿으면 400 'You have reached your specified (workspace) API usage limits…'(공식 Rate limits 문서)
  if (status === 400 && /specified (workspace )?API usage limits|usage limit|spend(ing)? limit/i.test(msg)) return new Error('클로드 콘솔에서 직접 정한 사용(지출) 한도에 걸렸습니다. console.anthropic.com → Billing 의 Spend limits 에서 한도를 올리거나 풀릴 때까지 기다리세요.');
  if (status === 403 || type === 'permission_error') return new Error('클로드가 이 키의 사용을 막았습니다(권한 없음). 콘솔에서 키 권한을 확인하세요.');
  if (status === 404 || type === 'not_found_error') return new Error(`클로드 모델(${llmProviderOf('claude').model})을 찾지 못했습니다. 이 키로 쓸 수 없는 모델일 수 있습니다.`);
  if (status === 413 || type === 'request_too_large') return new Error('사진이 너무 많거나 큽니다. 사진 수를 줄여 다시 시도하세요.');
  if (status === 429 || type === 'rate_limit_error') {
    // 등급의 월 지출 상한(spend cap)에 닿은 429 는 error.details.error_code 'enforced_spend_limit_reached'·retry-after 없음이고,
    // 다음 달까지 계속 실패합니다(공식 Rate limits 문서). 브라우저에서는 retry-after 를 못 읽을 수도 있어 본문으로 먼저 가립니다.
    const code = String(data?.error?.details?.error_code || '');
    if (code === 'enforced_spend_limit_reached' || /reached your API usage limits|monthly API usage|spend cap/i.test(msg)) {
      return new Error('클로드 이번 달 사용 상한에 걸렸습니다. 기다려도 다음 달 전까지는 풀리지 않으니 console.anthropic.com → Billing·Limits 를 확인하거나 제미나이·GPT 키를 쓰세요.');
    }
    const sec = Math.ceil(Number(headers?.get?.('retry-after')) || 0);
    return new Error(`클로드 사용 한도(분당 요청 수)를 넘었습니다. ${sec > 0 && sec <= 600 ? `${sec}초` : '1분'}쯤 뒤에 다시 시도하세요. 계속 같으면 콘솔 Billing·Limits 를 확인하세요.`);
  }
  if (status === 529 || type === 'overloaded_error' || status >= 500) return new Error(`클로드 서버가 잠시 바쁩니다 (${status}). 잠시 뒤 다시 시도하세요.`);
  return new Error(`클로드 요청 오류 (${status}). ${scrub(msg, key)}`.trim());
}

// ── GPT(OpenAI) ──────────────────────────────────────
// 공식 REST: POST https://api.openai.com/v1/responses(현재 권장 Responses API), 헤더 Authorization: Bearer,
// 사진은 input_image(data URL), JSON 은 text.format = { type:'json_schema', name, schema, strict:true }.
async function callOpenAI({ p, key, prompt, schema, images, signal, max }) {
  const content = [
    { type: 'input_text', text: prompt },
    ...images.flatMap((im, i) => [
      ...(images.length > 1 ? [{ type: 'input_text', text: `사진 ${i}:` }] : []),
      { type: 'input_image', image_url: `data:${im.mime || 'image/jpeg'};base64,${im.base64}`, detail: 'auto' },
    ]),
  ];
  const { res, data } = await post(p, 'https://api.openai.com/v1/responses', {
    'content-type': 'application/json',
    authorization: `Bearer ${key}`,
  }, JSON.stringify({
    model: p.model,
    input: [{ role: 'user', content }],
    text: { format: { type: 'json_schema', name: 'mrk_result', schema: schemaFor('openai', schema), strict: true } },
    reasoning: { effort: 'low' },
    max_output_tokens: max,
    store: false, // 사용자 사진·대본을 OpenAI 쪽 대화 기록으로 남기지 않음
  }), signal);
  if (!res.ok) throw openaiError(res.status, data, key);
  if (data?.status === 'incomplete') {
    if (data?.incomplete_details?.reason === 'max_output_tokens') throw new Error('GPT 답이 너무 길어 중간에 끊겼습니다. 사진이나 장면 수를 줄여 다시 시도하세요.');
    throw new Error('GPT 가 답을 끝까지 만들지 못했습니다. 내용을 조금 바꿔 다시 시도하세요.');
  }
  const items = (data?.output || []).filter((o) => o?.type === 'message').flatMap((o) => o.content || []);
  if (items.some((c) => c?.type === 'refusal')) throw new Error('GPT 가 이 사진·내용으로는 답하지 않았습니다. 내용을 조금 바꿔 다시 시도하세요.');
  const textOut = items.filter((c) => c?.type === 'output_text').map((c) => c.text).join('') || (typeof data?.output_text === 'string' ? data.output_text : '');
  if (!textOut) throw new Error('GPT 가 빈 답을 돌려주었습니다. 다시 시도하세요.');
  return textOut;
}

function openaiError(status, data, key) {
  const msg = errText(data);
  const code = String(data?.error?.code || '') + ' ' + String(data?.error?.type || '');
  if (status === 401 || /invalid_api_key/.test(code)) return new Error('GPT API 키가 맞지 않습니다. platform.openai.com → API keys 에서 키를 다시 복사해 넣으세요.');
  if (/insufficient_quota|billing/i.test(code + msg)) return new Error('GPT 사용 크레딧(한도)이 부족합니다. platform.openai.com → Billing 에서 확인하세요.');
  if (status === 403) return new Error('GPT 가 이 키(또는 지역·조직)의 사용을 막았습니다. 키 권한과 조직 설정을 확인하세요.');
  if (status === 404 || /model_not_found/.test(code)) return new Error(`GPT 모델(${llmProviderOf('openai').model})을 찾지 못했거나 이 키로 쓸 수 없습니다. 관리자에게 알려 주세요.`);
  if (status === 413) return new Error('사진이 너무 많거나 큽니다. 사진 수를 줄여 다시 시도하세요.');
  if (status === 429) return new Error('GPT 사용 한도(분당 요청 수)를 넘었습니다. 1분쯤 뒤에 다시 시도하세요.');
  if (status >= 500) return new Error(`GPT 서버가 잠시 바쁩니다 (${status}). 잠시 뒤 다시 시도하세요.`);
  return new Error(`GPT 요청 오류 (${status}). ${scrub(msg, key)}`.trim());
}

// ── 공통 도구 ────────────────────────────────────────

/** POST 후 { res, data }. 연결 자체가 안 되면 한국어 Error(키·주소는 문구에 넣지 않음). */
async function post(p, url, headers, body, signal) {
  let res;
  try {
    res = await fetch(url, { method: 'POST', headers, body, signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
  } catch (e) {
    if (e?.name === 'AbortError' || signal?.aborted) throw e;
    if (p.id === 'openai') throw await openaiNetError(p, headers, signal);
    throw new Error(`${p.name}에 연결하지 못했습니다. 인터넷 연결을 확인하고 다시 시도하세요.`);
  }
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

/**
 * GPT 요청이 '연결 실패'로 끝났을 때 원인을 한 번 더 확인합니다.
 * OpenAI 의 /v1/responses 는 틀린 키(401)에 CORS 헤더를 붙이지 않아서, 브라우저에서는 키 오류가 연결 실패(TypeError)처럼 보입니다
 * (2026-10 실측. 같은 키로 GET /v1/models 를 부르면 401 에도 CORS 헤더가 붙어 읽힘). 그래서 같은 키로 /v1/models 를 한 번 불러
 * 401 이면 '키가 맞지 않습니다'를, 확인도 안 되면 두 가지 가능성을 함께 알려 줍니다. 키는 OpenAI 로만 가고 문구에는 넣지 않습니다.
 */
async function openaiNetError(p, headers, signal) {
  const key = String(headers?.authorization || '').replace(/^Bearer\s+/i, '');
  let r;
  try {
    r = await fetch('https://api.openai.com/v1/models', {
      method: 'GET', headers: { authorization: `Bearer ${key}` }, signal, credentials: 'omit', referrerPolicy: 'no-referrer',
    });
  } catch (e) {
    if (e?.name === 'AbortError' || signal?.aborted) return e;
    return new Error('GPT에 연결하지 못했습니다. 인터넷 연결을 확인하세요. GPT 키가 틀려도 이렇게 보일 수 있으니 맨 위 AI 키 칸의 GPT 키도 확인하세요.');
  }
  if (r.status === 401 || r.status === 403) return openaiError(r.status, await r.json().catch(() => ({})), key);
  return new Error(`${p.name}에 연결하지 못했습니다. 인터넷 연결을 확인하고 다시 시도하세요.`);
}

function errText(data) {
  const e = data?.error;
  if (typeof e === 'string') return e;
  return String(e?.message || data?.message || '');
}

/** 서비스가 돌려준 문구에서 키(전체·일부)와 키처럼 보이는 긴 글자를 지우고 짧게 줄입니다. */
export function scrub(text, key = '') {
  let s = String(text || '');
  if (key) {
    s = s.split(key).join('•••');
    // 앞·뒤 일부만 보여 주는 경우(sk-abc…wxyz)도 지움
    for (const part of [key.slice(0, 8), key.slice(-6)]) if (part.length >= 6) s = s.split(part).join('•••');
  }
  s = s
    .replace(/\b(?:sk|pk|rk)-[\w*.\-]{3,}/gi, '•••')
    .replace(/AIza[\w\-]{6,}/g, '•••')
    .replace(/[A-Za-z0-9_\-]{24,}/g, '•••')
    .replace(/\*{4,}[\w\-]*/g, '•••')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > 140 ? s.slice(0, 140) + '…' : s;
}

/** AI 가 돌려준 글 → 객체. 혹시 ```json 울타리가 붙어 와도 벗겨서 읽습니다. */
function parseJSONText(text, p) {
  const raw = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(raw);
  } catch {
    const a = raw.indexOf('{');
    const b = raw.lastIndexOf('}');
    if (a >= 0 && b > a) {
      try { return JSON.parse(raw.slice(a, b + 1)); } catch { /* 아래로 */ }
    }
    throw new Error(`${p.name} 답을 읽지 못했습니다(형식 오류). 다시 시도해 보세요.`);
  }
}

/** 사용자 signal 과 시간 제한을 하나로 묶습니다. */
function withTimeout(signal, ms) {
  const ctrl = new AbortController();
  let timed = false;
  const t = setTimeout(() => { timed = true; ctrl.abort(); }, ms);
  const onAbort = () => ctrl.abort();
  if (signal) {
    if (signal.aborted) ctrl.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  return {
    signal: ctrl.signal,
    timedOut: () => timed,
    cleanup: () => { clearTimeout(t); signal?.removeEventListener?.('abort', onAbort); },
  };
}

/**
 * 사진(<img>·ImageBitmap·<canvas>·Blob/File) → { mime:'image/jpeg', base64, width, height }.
 * 긴 변을 max(기본 1024px)로 줄이고(작으면 그대로) 흰 바탕 JPEG 로 만듭니다. 사진은 이 함수 밖으로 저장하지 않습니다.
 */
export async function imageToBase64(src, { max = 1024, quality = 0.85 } = {}) {
  let source = src;
  let bitmap = null;
  if (typeof Blob !== 'undefined' && src instanceof Blob) {
    try {
      bitmap = await createImageBitmap(src);
    } catch {
      throw new Error('사진을 열 수 없습니다. JPG·PNG·WEBP 사진인지 확인하세요.');
    }
    source = bitmap;
  }
  const w0 = source?.naturalWidth || source?.videoWidth || source?.width || 0;
  const h0 = source?.naturalHeight || source?.videoHeight || source?.height || 0;
  if (!w0 || !h0) throw new Error('사진 크기를 알 수 없습니다. 사진을 다시 넣어 주세요.');
  const scale = Math.min(1, max / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * scale));
  const h = Math.max(1, Math.round(h0 * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; // 투명 PNG 가 검게 나오지 않게(그림 바탕일 뿐 화면 색이 아님)
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, w, h);
  bitmap?.close?.();
  let blob;
  try {
    blob = await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('empty'))), 'image/jpeg', quality));
  } catch (e) {
    if (e?.name === 'SecurityError') throw new Error('다른 사이트에서 온 사진이라 AI 에 보낼 수 없습니다. 사진 파일을 직접 올려 주세요.');
    throw new Error('사진을 줄이지 못했습니다. 다른 사진으로 다시 시도하세요.');
  }
  const dataUrl = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(new Error('사진을 읽지 못했습니다.'));
    r.readAsDataURL(blob);
  });
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  return { mime: 'image/jpeg', base64, width: w, height: h };
}
