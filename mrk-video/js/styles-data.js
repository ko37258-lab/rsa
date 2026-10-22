// 쇼츠 스타일 데이터 — "잘 나가는 쇼츠 형식" 20가지를 스타일 모델로 담아 둔 파일입니다.
// 사용자가 만든 장면(사진+자막)에 어떤 스타일이든 입혀 렌더링하고, 갤러리·"20가지 전부 만들기"·사례 화면이 이 배열을 그대로 읽습니다.
// 형식과 어휘(template·captionAnim·overlay·transition·titleMode 등)는 docs/STYLE-SPEC.md 를 따릅니다.
// 스타일을 추가하려면 이 배열에 항목을 하나 넣으면 됩니다. (id 는 영문 소문자-하이픈으로 고유하게, 색은 hex, 샘플 이미지는 js/samples.js 의 SAMPLES 키)
// 추가한 뒤 `node tests/style-sheet.cjs` 로 시트를 만들어 눈으로 확인하세요.

export const STYLE_DATA = [
  {
    id: 'lecture-paper',
    name: '강의형 — 공법의 신',
    tagline: '종이 배경에 초록 강조, STEP 헤더로 원칙을 하나씩',
    ref: {
      format: '지식 강의 숏츠',
      why: '손해 경고 한 문장으로 멈추게 하고, 가라오케 자막이 끝까지 읽게 만든다',
      search: '부동산 공법 쇼츠 강의',
    },
    platforms: ['youtube', 'instagram', 'tiktok', 'facebook', 'threads'],
    hook: '손해 경고로 시작 — "이거 모르고 사면 손해봅니다"',
    beats: ['훅: ~하면 손해봅니다', '원칙 1 (STEP 01)', '원칙 2 (STEP 02)', '원칙 3 (STEP 03)', '한 줄 요약 + 구독'],
    visual: {
      aspect: '9:16', template: 'card', captionAnim: 'karaoke', captionStyle: 'plain', overlay: 'steps', transition: 'fade', motion: 'in', titleMode: 'band',
      bandColor: '#e9e7e2', panelColor: '#ffffff', textColor: '#ffffff', inkColor: '#111111', highlightColor: '#0f8f3f', // 종이색 위에서도 읽히는 진한 초록(대비 약 3.4:1)
      font: '900', captionSize: 64, showProgress: true,
    },
    sample: {
      title: '공법의 신이 알려주는\n*토지투자* 3원칙',
      scenes: [
        { caption: '이거 모르고 땅 사면\n*손해*봅니다', img: 's01-land-zoning', kind: 'hook', duration: 2.4 },
        { caption: '*용도지역*부터 확인', img: 's01-land-zoning', duration: 3 },
        { caption: '*도로*에 붙어 있는지 확인', img: 's02-landlocked', duration: 3 },
        { caption: '*개발행위허가* 가능 여부 확인', img: 's03-permit-site', duration: 3 },
        { caption: '세 가지만 기억하면\n*토지투자* 실패가 줄어듭니다', img: null, kind: 'cta', duration: 3.4 },
      ],
    },
    prompt: '강의형: 첫 장면은 손해 경고, 이어서 원칙 3개를 한 문장씩, 마지막은 한 줄 요약. 각 장면 자막 35자 이내.',
  },

  {
    id: 'check-blue',
    name: '체크형 — 흰 바탕 파란 체크',
    tagline: '흰 바탕에 파란 강조, 확인한 항목이 ✓ 칩으로 쌓인다',
    ref: {
      format: '체크리스트·저장용 숏츠',
      why: '항목이 하나씩 체크되며 쌓이는 화면은 끝까지 보게 하고 저장 버튼을 누르게 한다',
      search: '토지 계약 전 체크리스트 쇼츠',
    },
    platforms: ['youtube', 'instagram', 'threads'],
    hook: '"이 서류 안 보면 계약 취소" 확인 경고',
    beats: ['훅: 계약 전 꼭 보는 서류', '등기부등본', '토지이용계획확인원', '건축물대장', '지적도', '요약 + 저장 유도'],
    visual: {
      aspect: '9:16', template: 'card', captionAnim: 'words', captionStyle: 'plain', overlay: 'check', transition: 'wipe', motion: 'in', titleMode: 'band',
      bandColor: '#ffffff', panelColor: '#f1f5f9', textColor: '#ffffff', inkColor: '#0f172a', highlightColor: '#2563eb',
      font: '800', captionSize: 60, showProgress: true,
    },
    sample: {
      title: '땅 계약 전\n*서류 5가지* 체크',
      scenes: [
        { caption: '계약 전 이 서류 안 보면\n*계약 취소*됩니다', img: 's06-consultant-desk', kind: 'hook', duration: 2.4 },
        { caption: '*등기부등본*\n소유자·근저당 확인', img: 's01-land-zoning', duration: 3 },
        { caption: '*토지이용계획확인원*\n용도지역 확인', img: 's02-landlocked', duration: 3 },
        { caption: '*건축물대장*\n위반건축물 여부', img: 's04-city-commercial', duration: 3 },
        { caption: '*지적도*로\n도로 접함 확인', img: 's03-permit-site', duration: 3 },
        { caption: '다섯 가지 체크하고\n*안전하게* 계약하세요', img: null, kind: 'cta', duration: 3 },
      ],
    },
    prompt: '체크형: 첫 장면은 "이 서류 안 보면 손해" 경고, 이어서 확인 항목을 한 장면에 하나씩 서류명+한 줄 설명으로, 마지막은 요약. 각 장면 자막 35자 이내, 항목명을 *강조*.',
  },

  {
    id: 'karaoke-cyan',
    name: '가라오케형 — 캡컷 자막',
    tagline: '사진 꽉 찬 화면에 외곽선 자막, 읽는 단어가 시안으로 켜진다',
    ref: {
      format: '가라오케 자막 숏츠(캡컷식)',
      why: '읽는 단어가 켜지면 소리 없이도 따라 읽어 완주율이 높다',
      search: '캡컷 자막 쇼츠 부동산 강의',
    },
    platforms: ['tiktok', 'youtube', 'instagram'],
    hook: '"99%가 모르는" 호기심 훅',
    beats: ['훅: 99%가 모르는 사실', '사실 1', '사실 2', '사실 3', '한 줄 정리'],
    visual: {
      aspect: '9:16', template: 'full', captionAnim: 'karaoke', captionStyle: 'outline', overlay: 'none', transition: 'none', motion: 'auto', titleMode: 'hook',
      bandColor: '#000000', panelColor: '#111111', textColor: '#ffffff', inkColor: '#111111', highlightColor: '#00e5ff',
      font: '900', captionSize: 78, showProgress: true,
    },
    sample: {
      title: '99%가 모르는\n*건폐율*의 비밀',
      scenes: [
        { caption: '건폐율 모르면\n*땅값* 절반 날립니다', img: 's04-city-commercial', kind: 'hook', duration: 2.4 },
        { caption: '건폐율은 *땅 대비*\n건물 바닥 비율', img: 's05-apartment', duration: 3 },
        { caption: '용도지역마다\n*상한*이 다릅니다', img: 's01-land-zoning', duration: 3 },
        { caption: '같은 땅도 *용도*가 바뀌면\n두 배로 짓습니다', img: 's03-permit-site', duration: 3 },
        { caption: '땅값은 *건폐율*이\n정합니다', img: null, kind: 'cta', duration: 2.8 },
      ],
    },
    prompt: '가라오케형: 첫 장면은 "99%가 모르는 ~" 호기심 훅, 이어서 사실 3개를 말하듯 한 문장씩, 마지막은 한 줄 정리. 음성과 자막이 같은 말이어야 한다.',
  },

  {
    id: 'top3-badge',
    name: 'TOP3형 — 번호 배지',
    tagline: '검은 배경에 주황 번호 배지, 팝 자막으로 항목 세 개',
    ref: {
      format: 'TOP3 순위 숏츠',
      why: '숫자가 정해져 있어 끝까지 보게 되는 완결 구조',
      search: '사면 안 되는 땅 TOP3 쇼츠',
    },
    platforms: ['youtube', 'tiktok', 'instagram'],
    hook: '"TOP3 공개" — 개수 예고로 완주 유도',
    beats: ['훅: ○○ TOP3 공개', '항목 1 (배지 1)', '항목 2 (배지 2)', '항목 3 (배지 3)', '정리 + 행동 유도'],
    visual: {
      aspect: '9:16', template: 'dark', captionAnim: 'pop', captionStyle: 'plain', overlay: 'number', transition: 'zoom', motion: 'in', titleMode: 'hook',
      bandColor: '#0b0b0f', panelColor: '#1a1a24', textColor: '#ffffff', inkColor: '#111111', highlightColor: '#ff8a00',
      font: '900', captionSize: 84, showProgress: true,
    },
    sample: {
      title: '절대 사면 안 되는\n*땅* TOP3',
      scenes: [
        { caption: '사면 망하는 땅\n*TOP3* 공개', img: 's01-land-zoning', kind: 'hook', duration: 3 },
        { caption: '도로 없는 *맹지*', img: 's02-landlocked', duration: 3 },
        { caption: '*개발제한구역* 안의 땅', img: 's01-land-zoning', duration: 3 },
        { caption: '*허가* 안 나는 농지', img: 's03-permit-site', duration: 3 },
        { caption: '하나라도 걸리면\n*MR.K*에게 먼저 물어보세요', img: null, kind: 'cta', duration: 3 },
      ],
    },
    prompt: 'TOP3형: 첫 장면에 "TOP3 공개"를 선언하고, 항목 3개를 각각 명사구 중심 짧은 자막(20자 안팎)으로, 마지막은 정리와 행동 유도.',
  },

  {
    id: 'breaking-news',
    name: '속보형 — 뉴스 하단띠',
    tagline: '빨간 속보 라벨과 흰 하단 자막 띠, 하드 컷',
    ref: {
      format: '속보·뉴스 요약 숏츠',
      why: '"방금 발표"라는 시의성이 3초 안에 손가락을 멈추게 한다',
      search: '부동산 속보 쇼츠 정책 발표',
    },
    platforms: ['youtube', 'instagram', 'threads', 'facebook'],
    hook: '"방금 발표됐습니다" — 시간 압박형 속보 선언',
    beats: ['훅: 방금 발표된 사실', '무엇이 바뀌나', '누가 영향받나', '지금 할 일', '채널 안내'],
    visual: {
      aspect: '9:16', template: 'full', captionAnim: 'none', captionStyle: 'plain', overlay: 'news', transition: 'none', motion: 'in', titleMode: 'band',
      bandColor: '#0a0a0a', panelColor: '#ffffff', textColor: '#ffffff', inkColor: '#111111', highlightColor: '#e0232e',
      font: '900', captionSize: 58, showProgress: false,
    },
    sample: {
      title: '[속보] *그린벨트*\n해제 발표',
      scenes: [
        { caption: '방금 발표됐습니다\n*그린벨트* 해제', img: 's01-land-zoning', kind: 'hook', duration: 2.6 },
        { caption: '풀리는 땅은 *어디*일까요', img: 's05-apartment', duration: 3 },
        { caption: '해당 땅은 *용도지역*이 바뀝니다', img: 's03-permit-site', duration: 3 },
        { caption: '지금 확인할 건 *토지이용계획*', img: 's06-consultant-desk', duration: 3 },
        { caption: '자세한 분석은 *MR.K* 채널에서', img: null, kind: 'cta', duration: 2.8 },
      ],
    },
    prompt: '속보형: 첫 장면은 "방금 발표/확정"으로 시작, 바뀐 것·영향받는 사람·지금 할 일 순서로 뉴스 앵커 말투. 추측은 "예정·검토"로 표시.',
  },

  {
    id: 'myth-vs-truth',
    name: '오해vs진실형 — 좌우 비교',
    tagline: '사진 두 장 좌우 비교와 VS 원, 밝은 패널에 큰 글씨',
    ref: {
      format: '오해 vs 진실(팩트체크) 숏츠',
      why: '"다들 이렇게 알죠?"로 공감시킨 뒤 뒤집는 반전이 댓글을 부른다',
      search: '부동산 오해와 진실 쇼츠',
    },
    platforms: ['youtube', 'instagram', 'threads'],
    hook: '공감 유도 질문 — "다들 이렇게 알고 있죠?"',
    beats: ['훅: 흔한 믿음 제시', '오해 1', '진실 1', '오해 2', '진실 2', '정리 + 문의'],
    visual: {
      aspect: '9:16', template: 'split', captionAnim: 'words', captionStyle: 'plain', overlay: 'vs', transition: 'wipe', motion: 'none', titleMode: 'band',
      bandColor: '#101418', panelColor: '#f4f1ea', textColor: '#ffffff', inkColor: '#14181c', highlightColor: '#ff5a36',
      font: '800', captionSize: 62, showProgress: true,
    },
    sample: {
      title: '*맹지*에 대한\n오해와 진실',
      scenes: [
        { caption: '다들 이렇게 알고 있죠?\n*맹지*는 무조건 손해', img: 's02-landlocked', kind: 'hook', duration: 2.6 },
        { caption: '오해: 맹지는 *건축*이 영원히 불가', img: 's02-landlocked', img2: 's03-permit-site', duration: 3.2 },
        { caption: '진실: *도로* 확보하면 허가 가능', img: 's02-landlocked', img2: 's03-permit-site', duration: 3.2 },
        { caption: '오해: 싸게 사면 *무조건* 이득', img: 's01-land-zoning', img2: 's04-city-commercial', duration: 3 },
        { caption: '진실: *진입로* 비용까지 계산해야', img: 's01-land-zoning', img2: 's04-city-commercial', duration: 3 },
        { caption: '헷갈리는 땅은 *MR.K*에게', img: null, kind: 'cta', duration: 2.6 },
      ],
    },
    prompt: '오해vs진실형: 첫 장면은 사람들이 흔히 믿는 말을 그대로, 이후 "오해:"와 "진실:"을 번갈아 짝지어 2~3쌍, 마지막은 정리. 진실 장면은 근거 한 구절 포함.',
  },

  {
    id: 'quiz-mint',
    name: '퀴즈형 — 3초 카운트',
    tagline: '민트 패널에 코랄 강조, Q 카운트다운 뒤 정답 공개',
    ref: {
      format: '퀴즈·정답 맞히기 숏츠',
      why: '3초 카운트다운이 끝날 때까지 손가락이 멈추고 댓글로 답을 단다',
      search: '부동산 상식 퀴즈 쇼츠',
    },
    platforms: ['instagram', 'tiktok', 'youtube', 'threads'],
    hook: '문제 출제 + 3·2·1 카운트다운',
    beats: ['훅: Q. 문제', '힌트', 'A. 정답 공개', '이유 설명', '다음 퀴즈 예고'],
    visual: {
      aspect: '9:16', template: 'split', captionAnim: 'type', captionStyle: 'plain', overlay: 'quiz', transition: 'slide', motion: 'out', titleMode: 'hook',
      bandColor: '#eaf8f1', panelColor: '#d8f3e8', textColor: '#ffffff', inkColor: '#10302a', highlightColor: '#e5484d', // 민트 패널 위에서 읽히는 진한 코랄(대비 약 3.3:1)
      font: '800', captionSize: 62, showProgress: true,
    },
    sample: {
      title: '*공법 퀴즈*\n맞히면 고수',
      scenes: [
        { caption: '농지에 *집*을\n지을 수 있을까?', img: 's01-land-zoning', kind: 'hook', duration: 3.4 },
        { caption: '힌트: *농업인*이면\n조건이 달라집니다', img: 'h01-hero-land', duration: 3 },
        { caption: '정답: *농지전용* 허가를\n받으면 가능', img: 's03-permit-site', kind: 'answer', duration: 3 },
        { caption: '허가 없이 지으면\n*원상복구* 명령', img: null, duration: 2.8 },
        { caption: '다음 퀴즈는\n*댓글*로 신청하세요', img: 's06-consultant-desk', kind: 'cta', duration: 2.6 },
      ],
    },
    prompt: '퀴즈형: 첫 장면은 "~할 수 있을까?" 질문(kind:hook), 힌트 1~2개, 정답 장면은 kind:answer로 "정답:"으로 시작, 이어서 이유 한 줄. 각 장면 35자 이내.',
  },

  {
    id: 'story-ssul',
    name: '썰풀이형 — 타자기 자막',
    tagline: '사진 꽉 채운 화면에 타자기 자막, 큰 따옴표로 사례 이야기',
    ref: {
      format: '실제 사례 썰 숏츠',
      why: '"제 수강생이 실제로…"라는 1인칭 사례는 정보보다 끝까지 보게 된다',
      search: '부동산 사기 실제 사례 썰 쇼츠',
    },
    platforms: ['youtube', 'tiktok', 'facebook'],
    hook: '1인칭 사례 예고 — "실제로 겪은 사건입니다"',
    beats: ['훅: 실제 사례 예고', '사건 발단', '문제 발견', '결과(손해)', '교훈 한 줄', '구독 유도'],
    visual: {
      aspect: '9:16', template: 'full', captionAnim: 'type', captionStyle: 'plain', overlay: 'quote', transition: 'fade', motion: 'out', titleMode: 'none',
      bandColor: '#121214', panelColor: '#26262c', textColor: '#f5f0e6', inkColor: '#111111', highlightColor: '#f2b84b',
      font: '800', captionSize: 66, showProgress: true,
    },
    sample: {
      title: '*맹지* 사서 울었던\n수강생 이야기',
      scenes: [
        { caption: '제 수강생이 실제로\n겪은 *사건*입니다', img: 's06-consultant-desk', kind: 'hook', duration: 2.8 },
        { caption: '시세보다 싼 땅을 *덜컥* 계약', img: 's01-land-zoning', duration: 3.2 },
        { caption: '알고 보니 *도로*가 없는 맹지', img: 's02-landlocked', duration: 3.2 },
        { caption: '진입로 땅값이 *본 땅값*보다 비쌌죠', img: 's03-permit-site', duration: 3.2 },
        { caption: '계약 전 *지적도* 한 장이면 막습니다', img: null, duration: 3.2 },
        { caption: '이런 사례 더 보려면 *구독*', img: null, kind: 'cta', duration: 2.6 },
      ],
    },
    prompt: '썰형: 1인칭 구어체로 실제 사례처럼 서술. 발단→문제 발견→결과→교훈 순서, 개인정보는 익명 처리하고 마지막에 교훈 한 줄.',
  },

  {
    id: 'step-tutorial',
    name: '튜토리얼형 — 3단계',
    tagline: '위 사진·아래 크림 패널에 청록 STEP 헤더, 따라 하기 순서',
    ref: {
      format: '단계별 튜토리얼(How-to) 숏츠',
      why: '"3분이면 됩니다" 약속과 1·2·3 단계는 저장하고 따라 하게 만든다',
      search: '토지이음 확인 방법 쇼츠',
    },
    platforms: ['youtube', 'instagram'],
    hook: '시간 약속 — "3분이면 다 봅니다"',
    beats: ['훅: 3분이면 됩니다', '1단계', '2단계', '3단계', '저장 유도'],
    visual: {
      aspect: '9:16', template: 'split', captionAnim: 'karaoke', captionStyle: 'plain', overlay: 'steps', transition: 'slide', motion: 'in', titleMode: 'band',
      bandColor: '#101010', panelColor: '#fff7ed', textColor: '#ffffff', inkColor: '#0b1b3a', highlightColor: '#0d9488',
      font: '800', captionSize: 58, showProgress: true,
    },
    sample: {
      title: '*토지이용계획*\n확인 3단계',
      scenes: [
        { caption: '3분이면 *땅 정보* 다 봅니다', img: 's06-consultant-desk', kind: 'hook', duration: 2.6 },
        { caption: '1단계: *토지이음* 사이트 접속', img: 's06-consultant-desk', duration: 3 },
        { caption: '2단계: *지번* 입력 후 열람', img: 's01-land-zoning', duration: 3 },
        { caption: '3단계: *용도지역* 줄부터 읽기', img: 's01-land-zoning', duration: 3 },
        { caption: '따라 했으면 *저장*해 두세요', img: null, kind: 'cta', duration: 2.6 },
      ],
    },
    prompt: '튜토리얼형: 첫 장면은 소요 시간 약속, 이어서 "1단계: / 2단계: / 3단계:"로 시작하는 행동 문장, 마지막은 저장 유도. 단계는 3~4개.',
  },

  {
    id: 'warning-tape',
    name: '경고형 — 노랑 테이프',
    tagline: '위아래 노랑-검정 사선 테이프와 주의 라벨, 상자 자막',
    ref: {
      format: '경고·금지 숏츠',
      why: '"절대 ~하지 마세요" 금지 명령은 손실 회피 심리를 건드린다',
      search: '절대 사면 안 되는 땅 쇼츠',
    },
    platforms: ['youtube', 'facebook', 'instagram'],
    hook: '금지 명령 — "절대 사지 마세요"',
    beats: ['훅: 절대 ~하지 마세요', '위험 1', '위험 2', '위험 3', '하나라도 해당되면 멈추세요'],
    visual: {
      aspect: '9:16', template: 'band', captionAnim: 'none', captionStyle: 'box', overlay: 'warning', transition: 'none', motion: 'in', titleMode: 'band',
      bandColor: '#141414', panelColor: '#ffcc00', textColor: '#ffffff', inkColor: '#111111', highlightColor: '#ffcc00',
      font: '900', captionSize: 64, showProgress: true,
    },
    sample: {
      title: '이 땅은 *절대*\n사지 마세요',
      scenes: [
        { caption: '이런 땅은 *절대* 사지 마세요', img: 's01-land-zoning', kind: 'hook', duration: 2.6 },
        { caption: '*개발제한구역* 안의 땅', img: 's01-land-zoning', duration: 3 },
        { caption: '*군사시설보호구역* 땅', img: 's02-landlocked', duration: 3 },
        { caption: '*도로* 없는 맹지', img: 's02-landlocked', duration: 3 },
        { caption: '하나라도 해당되면 *멈추세요*', img: null, kind: 'cta', duration: 2.8 },
      ],
    },
    prompt: '경고형: 첫 장면은 "절대 ~하지 마세요" 금지문, 이어서 위험 항목 3개를 명사구로, 마지막은 "하나라도 해당되면 멈추세요". 공포 조장 없이 근거 있는 위험만.',
  },

  {
    id: 'glossary-number',
    name: '용어사전형 — 한 줄 정의',
    tagline: '남색 밴드에 하늘색 번호 배지, 용어 하나에 뜻 한 줄',
    ref: {
      format: '용어 정리(사전형) 숏츠',
      why: '"이 세 단어 구분 되세요?"는 모르면 끝까지 보고, 알면 댓글로 아는 척을 한다',
      search: '용도지역 용도지구 용도구역 차이 쇼츠',
    },
    platforms: ['youtube', 'instagram', 'threads'],
    hook: '구분 질문 — "이 세 단어 구분 되세요?"',
    beats: ['훅: 세 단어 구분 질문', '용어 1: 뜻', '용어 2: 뜻', '용어 3: 뜻', '이제 구분 되시죠?'],
    visual: {
      aspect: '9:16', template: 'band', captionAnim: 'words', captionStyle: 'plain', overlay: 'number', transition: 'slide', motion: 'in', titleMode: 'band',
      bandColor: '#1f2a44', panelColor: '#ffffff', textColor: '#ffffff', inkColor: '#111111', highlightColor: '#7cc4ff',
      font: '800', captionSize: 62, showProgress: true,
    },
    sample: {
      title: '헷갈리는 *공법 용어*\n한 방 정리',
      scenes: [
        { caption: '이 세 단어 *구분* 되세요?', img: 's06-consultant-desk', kind: 'hook', duration: 2.6 },
        { caption: '*용도지역*: 땅의 쓰임 등급', img: 's01-land-zoning', duration: 3 },
        { caption: '*용도지구*: 지역 위에 덧씌운 규제', img: 's05-apartment', duration: 3 },
        { caption: '*용도구역*: 개발을 막거나 푸는 틀', img: 's03-permit-site', duration: 3 },
        { caption: '이제 *구분* 되시죠?', img: null, kind: 'cta', duration: 2.4 },
      ],
    },
    prompt: '용어형: 첫 장면은 "이 ○단어 구분 되세요?", 이후 장면마다 "*용어*: 뜻" 형식으로 한 줄 정의(비유 허용), 마지막은 "이제 구분 되시죠?". 용어는 3~4개.',
  },

  {
    id: 'comment-reply',
    name: '댓글답변형 — 말풍선',
    tagline: '댓글 말풍선으로 질문을 띄우고 타자기로 답한다',
    ref: {
      format: '댓글 답변(Reply) 숏츠',
      why: '실제 질문에 답하는 형식은 "내 얘기"처럼 느껴져 댓글이 또 쌓인다',
      search: '댓글 답변 부동산 질문 쇼츠',
    },
    platforms: ['tiktok', 'youtube', 'instagram'],
    hook: '실제 댓글 질문을 그대로 보여 주기',
    beats: ['훅: 댓글 질문 인용', '결론부터', '조건 1', '조건 2', '댓글 유도'],
    visual: {
      aspect: '9:16', template: 'blur', captionAnim: 'type', captionStyle: 'plain', overlay: 'comment', transition: 'fade', motion: 'in', titleMode: 'band',
      bandColor: '#121212', panelColor: '#ffffff', textColor: '#ffffff', inkColor: '#1a1a1a', highlightColor: '#ff2d55',
      font: '700', captionSize: 60, showProgress: true,
    },
    sample: {
      title: '댓글 *질문*에\n답해 드립니다',
      scenes: [
        { caption: '"맹지도 *건축* 되나요?"\n댓글 질문 왔습니다', img: 's06-consultant-desk', kind: 'hook', duration: 2.8, label: '시청자 질문' },
        { caption: '결론부터, *조건부*로 됩니다', img: 's02-landlocked', duration: 3 },
        { caption: '*현황도로*가 있으면 가능성 있고', img: 's02-landlocked', duration: 3 },
        { caption: '없으면 *도로 지정* 절차가 필요', img: 's03-permit-site', duration: 3 },
        { caption: '궁금한 건 *댓글*에 남겨 주세요', img: null, kind: 'cta', duration: 2.8 },
      ],
    },
    prompt: '댓글답변형: 첫 장면은 따옴표로 감싼 시청자 질문 한 문장, 둘째 장면은 "결론부터,"로 시작, 이어서 조건·예외 두 장면, 마지막은 댓글 유도.',
  },

  {
    id: 'number-counter',
    name: '숫자형 — 카운트업',
    tagline: '검은 화면에 민트색 숫자가 커지고 자막은 아래 작게',
    ref: {
      format: '숫자 카운트업 숏츠',
      why: '숫자가 올라가는 동안 눈을 떼지 못하고 결과를 기다린다',
      search: '땅값 얼마 올랐나 숫자 쇼츠',
    },
    platforms: ['youtube', 'instagram', 'tiktok'],
    hook: '숫자 예고 — "이 숫자부터 보세요"',
    beats: ['훅: 시작 숫자', '변화 1 (숫자 상승)', '비용 (숫자)', '결과 (숫자)', '채널 안내'],
    visual: {
      aspect: '9:16', template: 'dark', captionAnim: 'words', captionStyle: 'plain', overlay: 'counter', transition: 'fade', motion: 'none', titleMode: 'hook',
      bandColor: '#0d0f14', panelColor: '#1a1d26', textColor: '#ffffff', inkColor: '#111111', highlightColor: '#00e5a0',
      font: '900', captionSize: 56, showProgress: true,
    },
    sample: {
      title: '*맹지* 탈출하면\n땅값이 이렇게',
      scenes: [
        { caption: '평당 *30만원*짜리 땅이', img: 's01-land-zoning', kind: 'hook', duration: 2.8, counter: { from: 0, to: 30, suffix: '만원' } },
        { caption: '도로 붙이니 *평당* 120만원', img: 's02-landlocked', duration: 3.2, counter: { from: 30, to: 120, suffix: '만원' } },
        { caption: '진입로 비용 *4천만원*', img: 's03-permit-site', duration: 3, counter: { from: 0, to: 4000, suffix: '만원' } },
        { caption: '순이익 *2.6억*', img: null, duration: 3, counter: { from: 0, to: 26000, suffix: '만원' } },
        { caption: '숫자로 보는 공법, *MR.K*', img: null, kind: 'cta', duration: 2.6 },
      ],
    },
    prompt: '숫자형: 장면마다 핵심 숫자 하나(금액·면적·기간)를 자막 앞쪽에 두고 counter{from,to,suffix}로 제공. 숫자는 예시임을 전제로 단순하게, 마지막은 채널 안내.',
  },

  {
    id: 'policy-timeline',
    name: '타임라인형 — 날짜 라벨',
    tagline: '위에 큰 날짜 라벨, 밝은 패널에 타자기 자막으로 변경 순서',
    ref: {
      format: '달라지는 제도 타임라인 숏츠',
      why: '날짜가 바뀌며 넘어가는 구조는 "언제부터"를 궁금하게 해 저장이 많다',
      search: '내년부터 달라지는 부동산 제도 쇼츠',
    },
    platforms: ['youtube', 'instagram', 'facebook', 'threads'],
    hook: '시점 예고 — "내년부터 달라집니다"',
    beats: ['훅: 언제부터 바뀐다', '지금까지 (날짜)', '다음 단계 (날짜)', '그 다음 (날짜)', '저장 유도'],
    visual: {
      aspect: '9:16', template: 'split', captionAnim: 'type', captionStyle: 'plain', overlay: 'date', transition: 'slide', motion: 'none', titleMode: 'band',
      bandColor: '#0f2236', panelColor: '#e8f1f8', textColor: '#ffffff', inkColor: '#0f2236', highlightColor: '#f43f5e',
      font: '800', captionSize: 58, showProgress: true,
    },
    sample: {
      title: '*농지법*\n이렇게 바뀝니다',
      scenes: [
        { caption: '내년부터 농지 규칙이\n*달라집니다*', img: 's01-land-zoning', kind: 'hook', duration: 2.6, tag: '내년' },
        { caption: '올해까지: 농지 취득 *자격* 심사', img: 's01-land-zoning', duration: 3, tag: '올해' },
        { caption: '내년부터: *임대* 규정 강화', img: 's03-permit-site', duration: 3, tag: '내년 1월' },
        { caption: '그 다음: *전용* 절차도 변경 예고', img: 's03-permit-site', duration: 3, tag: '내년 7월' },
        { caption: '시행 날짜 놓치지 말고 *저장*', img: null, kind: 'cta', duration: 2.6, tag: '지금' },
      ],
    },
    prompt: '타임라인형: 장면마다 tag에 시점(연도·월)을 넣고 자막은 "시점: 바뀌는 내용" 형식. 시행일이 불확실하면 "예정"으로 쓰고, 마지막은 저장 유도.',
  },

  {
    id: 'news-ticker',
    name: '브리핑형 — 뉴스 티커',
    tagline: '파란 바탕 아래 흐르는 글줄과 날짜, 노란 가라오케 자막',
    ref: {
      format: '경제 뉴스 브리핑 숏츠',
      why: '흐르는 티커가 방송 같은 현장감을 주고 매일 보는 습관을 만든다',
      search: '부동산 뉴스 브리핑 쇼츠',
    },
    platforms: ['youtube', 'facebook', 'threads'],
    hook: '"오늘의 부동산 3줄" 데일리 선언',
    beats: ['훅: 오늘 꼭 알 소식 3개', '소식 1', '소식 2', '소식 3', '내일 다시 봐요'],
    visual: {
      aspect: '9:16', template: 'band', captionAnim: 'karaoke', captionStyle: 'plain', overlay: 'ticker', transition: 'slide', motion: 'auto', titleMode: 'band',
      bandColor: '#0a2a6b', panelColor: '#ffffff', textColor: '#ffffff', inkColor: '#111111', highlightColor: '#ffcc00',
      font: '800', captionSize: 58, showProgress: true,
    },
    sample: {
      title: '오늘의 부동산\n*3줄 요약*',
      scenes: [
        { caption: '오늘 꼭 알아야 할\n부동산 소식 *3가지*', img: 's05-apartment', kind: 'hook', duration: 2.6 },
        { caption: '*대출 규제* 지역\n추가 지정', img: 's04-city-commercial', duration: 3 },
        { caption: '*농지법* 개정안\n국회 통과', img: 's01-land-zoning', duration: 3 },
        { caption: '*GTX* 신규 노선\n예타 통과', img: 'h01-hero-land', duration: 3 },
        { caption: '내일도 *3줄*로\n정리해 드립니다', img: null, kind: 'cta', duration: 2.6 },
      ],
    },
    prompt: '브리핑형: 첫 장면은 "오늘 꼭 알 소식 N가지", 이어서 소식을 제목처럼 짧게 하나씩, 마지막은 내일 예고. 각 장면 35자 이내. 날짜는 p.dateLabel에 넣는다.',
  },

  {
    id: 'field-pin',
    name: '답사형 — 현장 핀',
    tagline: '사진 꽉 채우고 초록 지도 핀 라벨, 테두리 자막으로 현장감',
    ref: {
      format: '현장 답사 브이로그 숏츠',
      why: '"직접 가봤습니다"는 책상 정보와 달리 신뢰와 현장감을 준다',
      search: '토지 임장 현장 답사 쇼츠',
    },
    platforms: ['youtube', 'instagram', 'facebook'],
    hook: '현장 선언 — "이 땅, 직접 가봤습니다"',
    beats: ['훅: 직접 가봤습니다 (위치 핀)', '관찰 1 (진입로)', '관찰 2 (경계)', '관찰 3 (주변)', '구독 유도'],
    visual: {
      aspect: '9:16', template: 'full', captionAnim: 'words', captionStyle: 'outline', overlay: 'pin', transition: 'slide', motion: 'auto', titleMode: 'hook',
      bandColor: '#111111', panelColor: '#ffffff', textColor: '#ffffff', inkColor: '#111111', highlightColor: '#22c55e',
      font: '800', captionSize: 62, showProgress: true,
    },
    sample: {
      title: '이 땅 *직접*\n가봤습니다',
      scenes: [
        { caption: '이 땅, 직접 *가봤습니다*', img: 'h01-hero-land', kind: 'hook', duration: 2.6, label: '경기 양평' },
        { caption: '입구부터 *도로* 폭이 좁습니다', img: 's02-landlocked', duration: 3, label: '진입로' },
        { caption: '경계 말뚝으로 *면적* 확인', img: 's01-land-zoning', duration: 3, label: '경계' },
        { caption: '옆 땅 *개발허가* 흔적 발견', img: 's03-permit-site', duration: 3, label: '옆 필지' },
        { caption: '답사 포인트 더 보려면 *구독*', img: null, kind: 'cta', duration: 2.6, label: 'MR.K' },
      ],
    },
    prompt: '답사형: 첫 장면은 "직접 가봤습니다"와 지역명(label), 이후 장면마다 현장에서 본 것 하나를 관찰 문장으로, label에 장소·지점명을 넣는다.',
  },

  {
    id: 'one-line-advice',
    name: '한줄조언형 — 종이 명언',
    tagline: '종이색 바탕에 아주 큰 글씨, 사진 없이 문장만',
    ref: {
      format: '한 줄 조언·명언 숏츠',
      why: '글자만 크게 띄운 한 문장은 소리 없이도 읽히고 공유된다',
      search: '부동산 한 줄 조언 쇼츠',
    },
    platforms: ['instagram', 'threads', 'tiktok'],
    hook: '단정문 — "땅은 도로가 전부입니다"',
    beats: ['훅: 단정 한 문장', '이유 1', '이유 2', '이 한 줄만 기억'],
    visual: {
      aspect: '9:16', template: 'dark', captionAnim: 'karaoke', captionStyle: 'plain', overlay: 'quote', transition: 'fade', motion: 'none', titleMode: 'none',
      bandColor: '#f5f1e8', panelColor: '#ffffff', textColor: '#ffffff', inkColor: '#1b1b1b', highlightColor: '#d6453d',
      font: '900', captionSize: 96, showProgress: false,
    },
    sample: {
      title: '오늘의 *한 줄*',
      scenes: [
        { caption: '땅은 *도로*가 전부입니다', img: null, kind: 'hook', duration: 3 },
        { caption: '도로가 없으면 *허가*도 없고', img: null, duration: 3 },
        { caption: '허가가 없으면 *가치*도 없습니다', img: null, duration: 3 },
        { caption: '딱 이 한 줄만 *기억*하세요', img: null, kind: 'cta', duration: 3 },
      ],
    },
    prompt: '한줄형: 사진 없이 문장만. 첫 장면은 단정적인 한 문장(20자 이내), 이어서 이유 두 문장, 마지막은 "이 한 줄만 기억하세요". 모든 장면 25자 이내.',
  },

  {
    id: 'kinetic-type',
    name: '키네틱형 — 글자만 크게',
    tagline: '사진 없이 검정 화면에 빨간 강조, 단어가 크게 튀어나온다',
    ref: {
      format: '틱톡 키네틱 타이포 숏츠',
      why: '글자만으로 리듬을 만들어 음성과 함께 집중도가 높다',
      search: '키네틱 타이포 쇼츠 부동산',
    },
    platforms: ['tiktok', 'instagram', 'youtube'],
    hook: '한 단어 질문으로 시작',
    beats: ['훅: 맹지, 사도 될까?', '결론 먼저', '이유 1', '이유 2', '반전 조건'],
    visual: {
      aspect: '9:16', template: 'dark', captionAnim: 'pop', captionStyle: 'plain', overlay: 'none', transition: 'none', motion: 'none', titleMode: 'none',
      bandColor: '#000000', panelColor: '#1a1a1a', textColor: '#ffffff', inkColor: '#111111', highlightColor: '#ff3131',
      font: '900', captionSize: 104, showProgress: false,
    },
    sample: {
      title: '*맹지*\n사도 될까?',
      scenes: [
        { caption: '*맹지*\n사도 될까?', img: null, kind: 'hook', duration: 2 },
        { caption: '결론은\n*조건부* 예스', img: null, duration: 2.4 },
        { caption: '*도로* 낼 땅을\n같이 사면 됩니다', img: 's02-landlocked', duration: 3 },
        { caption: '*토지사용승낙서*\n받으면 건축 가능', img: null, duration: 3 },
        { caption: '못 받으면\n*그냥 밭*입니다', img: null, kind: 'cta', duration: 2.6 },
      ],
    },
    prompt: '키네틱형: 사진 없이 글자만으로. 첫 장면은 한 단어 질문, 이어서 결론·이유를 3~5단어 문장으로 짧게 끊어서. 장면마다 강조 단어 1개.',
  },

  {
    id: 'listing-price',
    name: '매물형 — 가격 태그',
    tagline: '사진 꽉 채운 화면에 금색 가격 태그와 알약 자막, 장면마다 포인트 하나',
    ref: {
      format: '매물 소개 쇼룸 숏츠',
      why: '가격 태그가 먼저 보이고 위치·면적·수익이 한 장면씩 이어져 문의로 연결된다',
      search: '상가 매물 소개 쇼츠',
    },
    platforms: ['instagram', 'facebook', 'youtube', 'threads'],
    hook: '가격 대비 의문 — "이 가격에 이 위치?"',
    beats: ['훅: 가격 vs 위치', '교통', '면적·구조', '수익 포인트', '문의 안내'],
    visual: {
      aspect: '9:16', template: 'full', captionAnim: 'none', captionStyle: 'pill', overlay: 'price', transition: 'fade', motion: 'auto', titleMode: 'band',
      bandColor: '#1c1a17', panelColor: '#ffffff', textColor: '#ffffff', inkColor: '#1d1d1d', highlightColor: '#c9a227',
      font: '700', captionSize: 64, showProgress: false,
    },
    sample: {
      title: '*역세권* 신축 상가\n매물 소개',
      scenes: [
        { caption: '이 가격에 이 *위치*?', img: 's04-city-commercial', kind: 'hook', duration: 2.6, tag: '3.2억' },
        { caption: '지하철역 도보 *5분*', img: 's04-city-commercial', duration: 3, tag: '역세권' },
        { caption: '전용 *12평*, 코너 자리', img: 'c04-listing-sub', duration: 3, tag: '코너' },
        { caption: '월세 *150만원* 수익 가능', img: 'c03-listing-main', duration: 3, tag: '월 150' },
        { caption: '매물 문의는 *MR.K* 프로필', img: null, kind: 'cta', duration: 2.6, tag: '문의' },
      ],
    },
    prompt: '매물형: 장면마다 위치·교통·면적·용도지역·가격 중 하나만, tag에 가격·키워드를 짧게. 과장 표현(최고·무조건) 금지, 마지막은 문의 안내.',
  },

  {
    id: 'cta-consult',
    name: '상담유도형 — CTA 카드',
    tagline: '보라 카드 배경에 라임 알약 자막, 아래 점 진행',
    ref: {
      format: '문제→해결→상담 유도(CTA) 숏츠',
      why: '고민 공감으로 시작해 해결 가능성을 보여 주면 프로필 링크 클릭으로 이어진다',
      search: '땅 안 팔릴 때 상담 쇼츠',
    },
    platforms: ['instagram', 'facebook', 'youtube'],
    hook: '고민 공감 — "이런 고민 있으세요?"',
    beats: ['훅: 이런 고민 있으세요?', '고민 구체화', '해결 가능 선언', '전문가 근거', '상담 신청 CTA'],
    visual: {
      aspect: '9:16', template: 'card', captionAnim: 'pop', captionStyle: 'pill', overlay: 'dots', transition: 'zoom', motion: 'in', titleMode: 'band',
      bandColor: '#5b2bd9', panelColor: '#ffffff', textColor: '#ffffff', inkColor: '#1e1b4b', highlightColor: '#b4f03a',
      font: '900', captionSize: 66, showProgress: true,
    },
    sample: {
      title: '땅 때문에\n*고민*이라면',
      scenes: [
        { caption: '이런 고민 있으세요?\n*땅*이 안 팔려요', img: 's01-land-zoning', kind: 'hook', duration: 2.6 },
        { caption: '맹지라서, *허가*가 안 나서', img: 's02-landlocked', duration: 3 },
        { caption: '해결 방법은 분명히 *있습니다*', img: 's03-permit-site', duration: 3 },
        { caption: '28년 공법 전문가가 *직접* 봅니다', img: 's06-consultant-desk', duration: 3 },
        { caption: '프로필 링크에서 *상담* 신청', img: null, kind: 'cta', duration: 3 },
      ],
    },
    prompt: 'CTA형: 첫 장면은 "이런 고민 있으세요?" 공감 질문, 고민을 구체화한 뒤 해결 가능성과 전문가 근거를 짚고, 마지막 장면(kind: cta)은 상담·링크 안내 한 문장.',
  },
];
