// 분석·대본 작성에 쓰는 공통 규칙과 출력 형식 — Claude 와 Gemini 가 똑같이 쓴다
import { z } from 'zod';

// ---------- 스키마 ----------
export const AnalysisSchema = z.object({
  summary: z.string().describe('원본 영상 한 줄 요약'),
  genre: z.string().describe('장르 (역사/과학/경제/사연/심리/부동산 등)'),
  hook: z.object({
    opening: z.string().describe('첫 10~20초에서 시청자를 붙잡는 방식'),
    technique: z.string().describe('후킹 기법 이름 (질문형, 반전 예고, 숫자 충격 등)'),
  }),
  structure: z
    .array(z.object({ section: z.string(), role: z.string(), share: z.number().describe('전체 대비 비중 0~1') }))
    .describe('대본의 뼈대. 도입→전개→반전→결론 등'),
  tone: z.string().describe('말투·호흡·문장 길이 특징'),
  whyItWorked: z.array(z.string()).describe('조회수가 터진 이유 3~5개'),
  titlePattern: z.string().describe('원본 제목의 공식 (예: 결과 + 의외의 이유)'),
  titles: z.array(z.object({ text: z.string(), angle: z.string() })).describe('새 영상 제목 후보 5개 — 원본 문장 복사 금지'),
  thumbnails: z
    .array(
      z.object({
        line1: z.string().describe('썸네일 윗줄 (흰색, 8~14자)'),
        line2: z.string().describe('썸네일 아랫줄 (강조색, 6~12자, 가장 자극적인 말)'),
        imageConcept: z.string().describe('배경 그림 콘셉트 (영어 이미지 프롬프트)'),
      }),
    )
    .describe('썸네일 문구 3안'),
  newTopic: z.string().describe('같은 공식을 적용할 새 주제 제안'),
});

const VisualType = z.enum(['ai_image', 'stock', 'chart', 'motion']);

export const ScriptSchema = z.object({
  title: z.string(),
  scenes: z
    .array(
      z.object({
        narration: z.string().describe('이 장면에서 읽을 내레이션 (한국어, 1~3문장)'),
        visualType: VisualType.describe('ai_image=AI 그림, stock=실사 느낌, chart=그래프/도표, motion=모션그래픽 자막'),
        imagePrompt: z.string().describe('이 장면 그림을 만들 영어 프롬프트. 16:9, 텍스트 없음'),
        onScreenText: z.string().describe('화면에 크게 띄울 짧은 키워드 (12자 이내)'),
      }),
    )
    .describe('장면 컷 목록'),
});

// ---------- ① 벤치마킹 분석 + ② 제목·썸네일 기획 ----------
export const ANALYZE_SYSTEM = `당신은 한국 유튜브 정보형 채널(역사·과학·경제·부동산 등)의 수석 기획자입니다.
잘된 영상의 대본을 받으면 "왜 잘됐는지"를 구조적으로 해부하고, 같은 공식으로 새 영상을 기획합니다.

원칙:
- 원본 문장·표현을 그대로 가져오지 않습니다. 가져오는 것은 구조(후킹 방식, 전개 순서, 호흡)뿐입니다.
  유튜브는 재사용 콘텐츠를 수익화에서 제외하므로, 베끼면 채널이 손해를 봅니다.
- 제목은 25자 안팎, 썸네일 문구는 짧고 강하게. 사실이 아닌 과장(가짜 숫자, 허위 사건)은 쓰지 않습니다.`;

export function analyzeUser({ meta, transcript, topicHint }) {
  return `[원본 영상]
제목: ${meta.title ?? '(알 수 없음)'}
채널: ${meta.author ?? '(알 수 없음)'}

[원본 대본]
${transcript}

${topicHint ? `[내가 만들고 싶은 주제]\n${topicHint}\n` : ''}
위 영상을 해부하고, ${topicHint ? '내 주제' : '같은 장르의 새 주제'}로 만들 새 영상의 제목 5개와 썸네일 문구 3안을 기획하세요.`;
}

// ---------- ③ 대본 작성 + 장면 컷 설계 ----------
export const SCRIPT_SYSTEM = `당신은 한국 유튜브 정보형 채널의 대본 작가 겸 영상 연출가입니다.
분석된 "성공 공식"을 새 주제에 적용해, 처음부터 새로 쓴 대본을 장면 단위로 나눕니다.

규칙:
- 첫 장면은 반드시 강한 후킹(질문·반전 예고·숫자). 마지막 장면은 다음 영상으로 이어지는 여운.
- 문장은 말하듯 짧게. 한 장면 내레이션은 5~12초 분량(한국어 30~80자).
- visualType 배분: ai_image 위주, 숫자가 나오면 chart, 핵심 정리는 motion, 현장감이 필요하면 stock.
- imagePrompt 는 영어로, 장면 분위기·구도·화풍을 구체적으로. 그림 속 글자는 넣지 않습니다.
- 확인되지 않은 수치나 사건을 지어내지 않습니다. 불확실하면 "~라고 알려져 있다" 수준으로 씁니다.`;

export function scriptUser({ analysis, title, topic, minutes }) {
  const sceneCount = Math.max(4, Math.round((minutes * 60) / 8));
  return `[성공 공식 분석]
${JSON.stringify(
    { hook: analysis.hook, structure: analysis.structure, tone: analysis.tone, whyItWorked: analysis.whyItWorked },
    null,
    2,
  )}

[새 영상]
제목: ${title}
주제: ${topic}
목표 길이: 약 ${minutes}분 (장면 ${sceneCount}개 안팎)

위 공식대로 새 대본을 쓰고 장면 컷으로 나누세요.`;
}
