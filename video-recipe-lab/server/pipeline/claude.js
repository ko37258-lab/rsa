// Claude 로 분석·대본 만들기 (규칙과 출력 형식은 prompts.js, 어느 AI 를 쓸지는 llm.js 가 정한다)
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { config } from '../config.js';

let client;
const getClient = () => (client ??= new Anthropic());
export const resetClient = () => {
  client = undefined; // 화면에서 키를 바꾸면 새 키로 다시 만든다
};

// SDK 오류를 사용자가 알아들을 말로
export function friendlyError(e) {
  if (e instanceof Anthropic.AuthenticationError) return 'Claude 키가 올바르지 않습니다. 스튜디오 오른쪽 위 🔑 API 키 등록에서 다시 확인하세요.';
  if (e instanceof Anthropic.PermissionDeniedError) return 'Claude 키 권한 문제입니다. Anthropic 콘솔에서 결제(크레딧) 등록을 확인하세요.';
  if (e instanceof Anthropic.RateLimitError) return 'Claude 사용 한도에 걸렸습니다. 잠시 후 다시 시도하거나 콘솔에서 크레딧을 확인하세요.';
  if (e instanceof Anthropic.APIConnectionError) return '인터넷 연결을 확인하세요 (Anthropic 서버에 연결 실패).';
  if (e instanceof Anthropic.InternalServerError) return 'Anthropic 서버가 일시적으로 바쁩니다. 잠시 후 다시 시도하세요.';
  return String(e?.message || e);
}

// 키 확인: 모델 정보 조회는 토큰을 쓰지 않으므로 요금이 나가지 않는다
export async function verifyClaude() {
  try {
    await getClient().models.retrieve(config.claudeModel);
    return { ok: true, msg: `연결됨 (${config.claudeModel})` };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return { ok: false, msg: '키가 올바르지 않습니다. 복사할 때 앞뒤가 잘리지 않았는지 확인하세요.' };
    if (e instanceof Anthropic.PermissionDeniedError) return { ok: false, msg: '이 키로는 사용할 수 없습니다. 콘솔에서 결제(크레딧) 등록을 확인하세요.' };
    if (e instanceof Anthropic.NotFoundError) return { ok: false, msg: `이 계정에서 ${config.claudeModel} 모델을 쓸 수 없습니다.` };
    if (e instanceof Anthropic.APIConnectionError) return { ok: false, msg: '인터넷 연결을 확인하세요 (Anthropic 서버에 연결 실패).' };
    return { ok: false, msg: String(e.message || e).slice(0, 200) };
  }
}

// ---------- 공통 호출 ----------
// 긴 대본(10분 영상 ≈ 장면 75개)도 잘리지 않게 스트리밍 + 넉넉한 max_tokens 로 받는다
export async function askClaude({ system, user, schema, effort = 'medium', maxTokens = 64000 }) {
  const stream = getClient().beta.messages.stream({
    model: config.claudeModel,
    max_tokens: maxTokens,
    // Opus 5.5 안전 분류기가 요청을 거절하면 서버가 알아서 다른 모델로 재시도한다
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort, format: betaZodOutputFormat(schema) },
    system,
    messages: [{ role: 'user', content: user }],
  });
  const res = await stream.finalMessage();
  if (res.stop_reason === 'refusal') {
    throw new Error(`Claude가 요청을 거절했습니다 (${res.stop_details?.category ?? '사유 미상'})`);
  }
  if (res.stop_reason === 'max_tokens') throw new Error('응답이 길이 제한에 걸려 잘렸습니다. 영상 길이를 줄여 다시 시도하세요.');
  if (res.parsed_output) return res.parsed_output;
  // 자동 파싱이 안 된 경우 직접 해석
  const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  try {
    return schema.parse(JSON.parse(text));
  } catch {
    throw new Error('Claude 응답을 JSON 으로 해석하지 못했습니다.');
  }
}
