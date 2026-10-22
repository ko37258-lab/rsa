// AI 쇼츠 대본 — 주제·스타일·참고 영상을 받아 Claude(claude-opus-5-5)로 JSON 대본을 만듭니다.
// 필요한 환경 변수: ANTHROPIC_API_KEY, 접속 코드(MRK_VIDEO_ACCESS_CODE 또는 ACCESS_CODE). 둘 다 있어야 켜집니다(남이 내 키로 쓰지 못하게).
// Anthropic SDK 없이 fetch 로 호출합니다(이 저장소의 다른 서버 코드와 같은 방식).
import { buildScriptPrompt, normalizeScriptParams, normalizeScriptResult, SCRIPT_SCHEMA } from '../js/script-prompt.js';
import { accessCode, checkCode, readBody } from './_common.mjs';

const MODEL = 'claude-opus-5-5';

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST 요청만 받습니다.' });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || !accessCode()) {
    return res.status(503).json({ error: '서버에 ANTHROPIC_API_KEY와 접속 코드를 설정해야 AI를 쓸 수 있습니다.' });
  }
  if (!checkCode(req, res)) return;

  const params = normalizeScriptParams(readBody(req));
  if (!params.topic) return res.status(400).json({ error: '주제를 적어 주세요.' });

  let response, data;
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'server-side-fallback-2026-07-01',
      },
      signal: AbortSignal.timeout(110_000),
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 16000,
        fallbacks: 'default',
        output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCRIPT_SCHEMA } },
        messages: [{ role: 'user', content: buildScriptPrompt(params) }],
      }),
    });
    data = await response.json();
  } catch (e) {
    const slow = e?.name === 'TimeoutError';
    return res.status(slow ? 504 : 502).json({ error: slow ? 'AI 응답이 너무 늦습니다. 장면 수를 줄여 다시 시도하세요.' : 'AI 서버에 연결하지 못했습니다.' });
  }
  if (!response.ok) {
    const message = String(data?.error?.message || '');
    console.error('anthropic', response.status, message);
    if (response.status === 401) return res.status(500).json({ error: '서버의 ANTHROPIC_API_KEY가 올바르지 않습니다.' });
    if (response.status === 429) return res.status(429).json({ error: '요청이 많습니다. 잠시 뒤 다시 시도하세요.' });
    return res.status(502).json({ error: `AI 서버 오류 (${response.status})` });
  }
  if (data.stop_reason === 'refusal') return res.status(422).json({ error: '이 주제로는 대본을 만들 수 없습니다. 주제를 바꿔 보세요.' });
  if (data.stop_reason === 'max_tokens') return res.status(502).json({ error: '대본이 너무 길어 중간에 끊겼습니다. 장면 수를 줄여 보세요.' });
  const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  try {
    return res.status(200).json(normalizeScriptResult(JSON.parse(text)));
  } catch (e) {
    return res.status(502).json({ error: e.message || 'AI 답을 읽지 못했습니다. 다시 시도하세요.' });
  }
}
