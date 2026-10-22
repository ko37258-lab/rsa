// 쇼츠 스타일 데이터(임시 2개).
// ※ 이 파일은 렌더 엔진 작업용 임시본입니다. 스타일 담당이 만드는 20개짜리 styles-data.js 로 나중에 덮어써집니다.
// 형식은 docs/STYLE-SPEC.md 2절을 따릅니다.

export const STYLE_DATA = [
  {
    id: 'lecture-paper',
    name: '강의형 — 공법의 신',
    tagline: '종이 배경에 초록 강조, 한 문장씩 밑줄',
    ref: {
      format: '지식 강의 숏츠',
      why: '한 문장 핵심 + 가라오케 자막이 끝까지 보게 만든다',
      search: '부동산 공법 쇼츠 강의',
    },
    platforms: ['youtube', 'instagram', 'tiktok', 'facebook', 'threads'],
    hook: '손해 경고로 시작',
    beats: ['훅: ~하면 손해봅니다', '원칙 1', '원칙 2', '원칙 3', '요약 + 구독'],
    visual: {
      aspect: '9:16', template: 'card', captionAnim: 'karaoke', captionStyle: 'plain', overlay: 'steps',
      bandColor: '#e9e7e2', panelColor: '#ffffff', textColor: '#ffffff', inkColor: '#111111', highlightColor: '#1fcf62',
      font: '900', captionSize: 64, motion: 'in', transition: 'fade', titleMode: 'band', showProgress: true,
    },
    sample: {
      title: '공법의 신이 알려주는\n*토지투자* 3원칙',
      scenes: [
        { caption: '이거 모르고 땅 사면\n*손해*봅니다', img: 's01-land-zoning', kind: 'hook', duration: 2.4 },
        { caption: '*용도지역*부터 확인', img: 's01-land-zoning', duration: 3 },
        { caption: '*도로*에 붙었는지 확인', img: 's02-landlocked', duration: 3 },
      ],
    },
    prompt: '강의형: 첫 장면은 손해 경고, 이어서 원칙 3개를 한 문장씩, 마지막은 한 줄 요약. 각 장면 자막 35자 이내.',
  },
  {
    id: 'breaking-news',
    name: '속보형 — 정책 뉴스',
    tagline: '빨간 속보 라벨과 흰 자막 띠, 와이프 전환',
    ref: {
      format: '뉴스 속보 숏츠',
      why: '속보 형식이 긴급함을 주어 첫 1초 이탈을 줄인다',
      search: '부동산 정책 속보 쇼츠',
    },
    platforms: ['youtube', 'facebook', 'threads'],
    hook: '방금 바뀐 규정으로 시작',
    beats: ['훅: 방금 바뀌었습니다', '무엇이 바뀌었나', '누가 영향받나', '지금 할 일', '요약 + 구독'],
    visual: {
      aspect: '9:16', template: 'full', captionAnim: 'words', captionStyle: 'plain', overlay: 'news',
      bandColor: '#0b0d14', panelColor: '#ffffff', textColor: '#ffffff', inkColor: '#111111', highlightColor: '#e8473c',
      font: '800', captionSize: 60, motion: 'auto', transition: 'wipe', titleMode: 'hook', showProgress: true,
    },
    sample: {
      title: '*개발행위허가* 기준\n이렇게 바뀝니다',
      scenes: [
        { caption: '방금 *개발행위허가* 기준이\n바뀌었습니다', img: 's03-permit-site', kind: 'hook', duration: 2.4 },
        { caption: '*신도시 상가* 투자자부터\n영향을 받습니다', img: 's04-city-commercial', duration: 3 },
        { caption: '지금 *토지이용계획*을\n다시 확인하세요', img: 's01-land-zoning', duration: 3 },
      ],
    },
    prompt: '속보형: 첫 장면은 "방금 바뀌었습니다", 이어서 변경 내용·영향·할 일을 한 문장씩. 각 장면 자막 30자 이내.',
  },
];
