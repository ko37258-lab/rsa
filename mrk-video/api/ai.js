// AI 쇼츠 대본 — 주제·유형·장면 수를 받아 Claude로 JSON 대본을 만듭니다.
// 필요한 환경 변수: ANTHROPIC_API_KEY, ACCESS_CODE (둘 다 없으면 꺼짐 — 남이 내 키로 쓰지 못하게)

import Anthropic from '@anthropic-ai/sdk';
import { buildScriptPrompt, normalizeScriptParams, normalizeScriptResult, SCRIPT_SCHEMA } from '../js/script-prompt.js';

const client = new Anthropic();

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST 요청만 받습니다.' });
  if (!process.env.ANTHROPIC_API_KEY || !process.env.ACCESS_CODE) {
    return res.status(503).json({ error: '서버에 ANTHROPIC_API_KEY와 ACCESS_CODE를 설정해야 AI를 쓸 수 있습니다.' });
  }
  if (req.headers['x-access-code'] !== process.env.ACCESS_CODE) {
    return res.status(401).json({ error: '접속 코드가 맞지 않습니다. 사용 안내 화면에서 접속 코드를 입력하세요.' });
  }

  const params = normalizeScriptParams(req.body || {});
  if (!params.topic) return res.status(400).json({ error: '주제를 적어 주세요.' });

  try {
    const message = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: {
        effort: 'medium',
        format: { type: 'json_schema', schema: SCRIPT_SCHEMA },
      },
      messages: [{ role: 'user', content: buildScriptPrompt(params) }],
    });

    if (message.stop_reason === 'refusal') {
      return res.status(422).json({ error: '이 주제로는 대본을 만들 수 없습니다. 주제를 바꿔 보세요.' });
    }
    if (message.stop_reason === 'max_tokens') {
      return res.status(502).json({ error: '대본이 너무 길어 중간에 끊겼습니다. 장면 수를 줄여 보세요.' });
    }
    const text = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    return res.status(200).json(normalizeScriptResult(JSON.parse(text)));
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return res.status(429).json({ error: '요청이 많습니다. 잠시 뒤 다시 시도하세요.' });
    }
    if (error instanceof Anthropic.AuthenticationError) {
      return res.status(500).json({ error: '서버의 ANTHROPIC_API_KEY가 올바르지 않습니다.' });
    }
    if (error instanceof Anthropic.APIError) {
      console.error('anthropic', error.status, error.message);
      return res.status(502).json({ error: `AI 서버 오류 (${error.status ?? '연결'})` });
    }
    console.error(error);
    return res.status(500).json({ error: 'AI 대본을 만들지 못했습니다.' });
  }
}
