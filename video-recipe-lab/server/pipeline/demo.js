// API 키 없이 전체 흐름을 체험하기 위한 데모 데이터.
// 내용은 실제 법령 기준(국토계획법 시행령 제84·85조의 용도지역별 건폐율·용적률 상한)으로 작성했다.

export const demoAnalysis = {
  summary: '겉보기엔 같은 대상이 결과는 극단적으로 다른 이유를, 숨은 규칙 하나로 설명하는 정보형 영상',
  genre: '경제·부동산 상식',
  hook: {
    opening: '첫 문장에서 "같은데 왜 다르지?"라는 모순을 던지고, 답은 끝까지 미룬다',
    technique: '모순 제시형 질문 + 정답 지연',
  },
  structure: [
    { section: '후킹', role: '모순 제시 — 같은 조건, 다른 결과', share: 0.1 },
    { section: '정답 예고', role: '보이지 않는 규칙이 있다고만 알려줌', share: 0.1 },
    { section: '원리 설명', role: '규칙을 숫자로 보여줌 (그래프)', share: 0.35 },
    { section: '체감 사례', role: '시청자 상황에 대입', share: 0.25 },
    { section: '정리·다음편', role: '한 문장 요약 + 후속편 예고', share: 0.2 },
  ],
  tone: '짧은 평서문, 질문으로 끊어 가는 호흡, 전문용어는 바로 쉬운 말로 풀어줌',
  whyItWorked: [
    '첫 5초 안에 시청자가 답을 궁금해하는 질문을 던진다',
    '어려운 개념을 숫자 비교 하나로 단순화한다',
    '시청자가 바로 써먹을 행동(서류 확인)을 준다',
    '다음 편 예고로 연속 시청을 유도한다',
  ],
  titlePattern: '같은 A인데 결과가 극단적으로 다른 이유',
  titles: [
    { text: '길 하나 차이로 땅값이 몇 배 벌어지는 이유', angle: '모순 제시' },
    { text: '같은 100평인데 왜 값이 이렇게 다를까', angle: '숫자 + 의문' },
    { text: '땅값을 정하는 건 땅이 아니었습니다', angle: '통념 뒤집기' },
    { text: '부동산 고수들이 지번부터 넣어보는 이유', angle: '고수의 습관' },
    { text: '이 서류 한 장 모르면 땅 사면 안 됩니다', angle: '손실 회피' },
  ],
  thumbnails: [
    { line1: '같은 100평인데', line2: '값이 몇 배?', imageConcept: 'aerial view of two land plots divided by a road, one empty field and one dense city blocks, dramatic lighting' },
    { line1: '땅값을 정하는 건', line2: '보이지 않는 선', imageConcept: 'glowing invisible boundary line drawn over a korean town map, cinematic' },
    { line1: '모르면 손해 보는', line2: '서류 한 장', imageConcept: 'close up of an official land document on a desk with a magnifying glass, warm light' },
  ],
  newTopic: '용도지역 — 같은 땅이 다른 값을 갖는 이유',
};

export const demoScript = {
  title: '길 하나 차이로 땅값이 몇 배 벌어지는 이유',
  scenes: [
    {
      narration: '길 하나를 사이에 두고 땅값이 몇 배씩 차이 나는 동네가 있습니다. 위치도 모양도 비슷한데, 왜일까요?',
      visualType: 'motion',
      imagePrompt: 'aerial view of a korean neighborhood split by a road, left side empty farmland, right side dense buildings, golden hour',
      onScreenText: '같은 땅, 다른 값?',
    },
    {
      narration: '답은 땅 위에 보이지 않게 그어진 선, 바로 용도지역에 있습니다.',
      visualType: 'ai_image',
      imagePrompt: 'glowing translucent zoning lines drawn over a city map from above, blue and green light, cinematic',
      onScreenText: '용도지역',
    },
    {
      narration: '용도지역은 그 땅에 얼마나 넓게, 얼마나 높이 지을 수 있는지를 정합니다. 이걸 숫자로 나타낸 게 건폐율과 용적률이죠.',
      visualType: 'chart',
      imagePrompt: 'clean isometric diagram of a building on a land plot showing footprint and floor stacking, minimal infographic style',
      onScreenText: '건폐율 · 용적률',
    },
    {
      narration: '법이 정한 상한만 보면, 제1종 전용주거지역의 용적률은 100퍼센트까지지만 일반상업지역은 1,300퍼센트까지 열려 있습니다.',
      visualType: 'chart',
      imagePrompt: 'two buildings side by side, one low house and one tall commercial tower, simple flat infographic, contrast in height',
      onScreenText: '100% vs 1,300%',
    },
    {
      narration: '같은 100평이라도 지을 수 있는 연면적이 열 배 넘게 달라질 수 있으니, 땅값이 다를 수밖에 없습니다.',
      visualType: 'ai_image',
      imagePrompt: 'split image of the same sized land plot, one with a small house, one with a high-rise building, dramatic sky',
      onScreenText: '지을 수 있는 크기 = 땅값',
    },
    {
      narration: '그래서 땅을 볼 때는 지번을 넣고 토지이용계획확인원부터 확인해야 합니다. 이 서류 한 장에 용도지역이 적혀 있습니다.',
      visualType: 'stock',
      imagePrompt: 'person checking an official land use document on a laptop and paper at a desk, natural light, photorealistic',
      onScreenText: '토지이용계획확인원',
    },
    {
      narration: '정리하면, 땅값을 정하는 건 땅 모양이 아니라 그 위에 그어진 규칙입니다. 다음 영상에서는 용도지역이 바뀌는 순간 땅값이 어떻게 움직이는지 보여드리겠습니다.',
      visualType: 'motion',
      imagePrompt: 'sunrise over a korean city skyline with subtle glowing grid lines, hopeful mood',
      onScreenText: '규칙이 값을 만든다',
    },
  ],
};

export const demoTranscript =
  '(데모) 같은 아파트 단지인데 동마다 가격이 다른 이유, 알고 계셨나요? 답은 보이지 않는 규칙에 있습니다. ...';
