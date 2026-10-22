// AI 쇼츠 대본: 프롬프트와 결과 형식을 한곳에서 관리합니다.
// 브라우저(아티팩트)와 서버(api/ai.js)가 이 파일을 함께 씁니다. 문구를 고치려면 여기만 고치면 됩니다.

export const SCRIPT_STYLES = {
  law: '부동산 공법 핵심 강의',
  info: '부동산 정보·이슈 해설',
  listing: '매물 소개',
  invest: '토지 투자 노하우',
  product: '상품 홍보',
  free: '자유 주제',
};

const STYLE_GUIDE = {
  law: '어려운 공법 조문을 일상 언어로 풀어 주는 강의형. 첫 장면에서 시청자가 겪을 손해를 짚고, 핵심 규칙을 하나씩 정리한 뒤 마지막에 한 줄 요약.',
  info: '최근 부동산 이슈를 빠르게 정리하는 뉴스 해설형. 무엇이 바뀌었는지, 누구에게 영향이 있는지, 지금 할 일 순서.',
  listing: '매물 소개형. 위치·교통·면적·용도지역·가격 포인트를 장면마다 하나씩. 과장 광고 표현은 쓰지 않음.',
  invest: '토지 투자 실전형. 사기 전 확인할 것, 피해야 할 땅, 수익이 나는 구조를 사례처럼 설명.',
  product: '상품 홍보형. 문제 제기 → 해결 → 핵심 장점 → 구매 유도.',
  free: '주제에 맞는 흐름으로 자유롭게.',
};

export function normalizeScriptParams(input = {}) {
  const topic = String(input.topic ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
  const style = Object.hasOwn(SCRIPT_STYLES, input.style) ? input.style : 'law';
  const n = Number.parseInt(input.scenes, 10);
  const scenes = Number.isFinite(n) ? Math.min(12, Math.max(3, n)) : 6;
  const channel = String(input.channel ?? 'MR.K 고상철').trim().slice(0, 40) || 'MR.K 고상철';
  return { topic, style, scenes, channel };
}

export function buildScriptPrompt({ topic, style, scenes, channel }) {
  return `너는 유튜브 쇼츠(60초 이하 세로 영상) 대본 작가다.
채널: ${channel} — 28년간 부동산공법을 가르쳐 "공법의 신"으로 불리는 부동산 전문가 채널. 말투는 쉽고 명쾌하며, 핵심을 3가지 안팎으로 정리하는 강의 스타일이다.

주제: ${topic}
영상 유형: ${SCRIPT_STYLES[style]} — ${STYLE_GUIDE[style]}
장면 수: 정확히 ${scenes}개

규칙
- 장면 하나 = 화면 자막 한 덩어리. 자막은 한국어 1~2문장, 공백 포함 40자 이내.
- 첫 장면은 3초 안에 멈춰 보게 만드는 질문이나 경고로 시작.
- 마지막 장면은 요약 또는 구독·상담 유도.
- 장면마다 가장 중요한 단어 1개를 *별표*로 감싼다. 예: "땅은 *용도지역*부터 보세요"
- 법령 조문 번호나 수치는 확실한 것만 쓰고, 불확실하면 일반적인 표현으로 쓴다.
- imageHint: 그 장면에 어울리는 사진·자료를 한국어 한 구절로 제안.
- title: 영상 위쪽에 계속 떠 있을 제목. 2줄 이내, 줄바꿈은 \\n, 핵심어 하나를 *별표*로.
- hashtags: 5~8개, # 포함.
- description: 유튜브 설명란 2~3문장.

다른 말 없이 아래 형식의 JSON만 출력한다.
{"title": "...", "scenes": [{"caption": "...", "imageHint": "..."}], "hashtags": ["#..."], "description": "..."}`;
}

/** 서버 구조화 출력(output_config.format)에 쓰는 JSON 스키마 */
export const SCRIPT_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    scenes: {
      type: 'array',
      items: {
        type: 'object',
        properties: { caption: { type: 'string' }, imageHint: { type: 'string' } },
        required: ['caption', 'imageHint'],
        additionalProperties: false,
      },
    },
    hashtags: { type: 'array', items: { type: 'string' } },
    description: { type: 'string' },
  },
  required: ['title', 'scenes', 'hashtags', 'description'],
  additionalProperties: false,
};

/** AI 응답을 화면에서 바로 쓸 수 있는 모양으로 정리합니다(형식이 조금 어긋나도 버티도록). */
export function normalizeScriptResult(data) {
  const obj = typeof data === 'string' ? JSON.parse(data) : data || {};
  const scenes = (Array.isArray(obj.scenes) ? obj.scenes : [])
    .map((s) => (typeof s === 'string' ? { caption: s, imageHint: '' } : s))
    .filter((s) => s && String(s.caption || '').trim())
    .map((s) => ({ caption: String(s.caption).trim(), imageHint: String(s.imageHint || '').trim() }));
  if (!scenes.length) throw new Error('AI 응답에 장면이 없습니다. 다시 시도해 보세요.');
  return {
    title: String(obj.title || '').replace(/\\n/g, '\n').trim(),
    scenes,
    hashtags: (Array.isArray(obj.hashtags) ? obj.hashtags : []).map(String).filter(Boolean),
    description: String(obj.description || '').trim(),
  };
}
