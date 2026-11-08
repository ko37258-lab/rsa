// 따라하기 사례(레시피) 데이터 — 사용자는 사진만 넣고, 자막·읽을 문장·스타일·음악·엔딩은 이 데이터 그대로 씁니다.
// 사례 화면(갤러리)과 숏폼 화면의 레시피 모드가 js/cases.js 의 변환 함수를 통해 이 배열을 읽습니다.
//
// 참조하는 다른 데이터
// - 사진 id: js/samples.js 의 SAMPLES(assets/samples/*.jpg). 같은 id 를 두 장면이 쓰면 사용자 사진도 같은 장이 두 장면에 들어갑니다.
// - 스타일 id: js/styles-data.js (광고용 추천 10 + 새 광고 스타일 4 가운데 고름. lecture-paper·quote-wave 는 예외 — notes 에 이유).
// - 음악: js/music.js 의 MOODS id.
//
// 항목 형식(js/cases.js 머리 주석에 API 설명)
//   id            영문 소문자-하이픈, 고유. 딥링크 #follow=<id>, 저장 .json 의 recipe.id
//   name          카드·레시피 바 이름(14자 이내)
//   category      CASE_CATEGORIES 의 id 하나 — listing 매물 · brand 브랜드/가맹 · course 강의 · consult 상담 · proof 후기/성과 · event 행사
//   purpose       카드 한 줄 설명
//   inputLine     사례 화면 "넣는 것" 한 줄
//   platforms     잘 맞는 플랫폼(설명용)
//   aspect        '9:16' | '1:1' | '16:9' — 스타일을 입힌 뒤 다시 덮는 값(스타일 visual 은 모두 9:16)
//   style         styles-data id
//   title         영상 제목(2줄 이내, *강조* 하나). 사례 제목은 '예시 제목'이라 ② 매물 정보를 적으면 바뀔 수 있음
//   channel       비우면 중개사무소 상호 → 없으면 기본 채널 'MR.K 고상철'
//   ending        { text(*강조* 하나), sub('{office}' 는 상호+연락처로 치환, 없으면 채널명), cta(엔딩 버튼 문구 → p.ending.cta), duration(≥2.5) }
//   music         MOODS id
//   scenes[]      { slot(사진 자리 번호 1부터, 같은 번호 = 같은 사진; 글자 장면은 null), img(예시 사진 id | null), hint(어떤 사진을 넣을지 한두 단어),
//                   slot2/img2/hint2(비교·전후의 둘째 사진 자리), kind('hook'|'normal'|'answer'|'cta'), duration(초),
//                   caption(별표 뺀 32자 이내, *강조* 1개, \n 허용), narration(읽을 문장 70자 이내, 별표 없음),
//                   tag(가격·리본·날짜 장식 ≤7자) · label(핀 라벨) · labelA/labelB(vs 좌우 라벨) · vsLabel(가운데 원 글자) · stamp(도장 ≤6자) · counter{from,to,suffix} }
//                 장식이 읽는 필드만 채웁니다: price·date·ribbon → tag, pin·comment → label, counter → counter, vs → img2(+labelA/labelB), stamp → stamp.
//   extraScene    사진이 자리보다 많을 때 마지막 cta 앞에 추가하는 장면 틀. caption 의 {n} 은 본문 순서 번호
//   upload        { desc(2~3문장), hashtags(6~8개) } — 매물 사례는 업로드 때 표시·광고 필수 항목(disclosureLines)이 뒤에 붙습니다
//   notes         따라할 때 지킬 것(과장어 금지·예시 숫자·표시광고). 화면에는 "대본 보기" 아래 힌트로만
//
// 규칙: 장면 6~8개(첫 장면 hook, 마지막 cta), 총 길이 21~30초, 과장·단정 표현(js/listing-prompt.js BANNED_WORDS) 없음, 가격·면적·숫자는 모두 예시.
// 점검: `node tests/check-cases.mjs`(데이터) · `node tests/cases-sheet.cjs`(실제 렌더 시트 → tests/out/cases-sheet.png)

export const CASE_CATEGORIES = [
  { id: 'listing', label: '매물' },
  { id: 'brand', label: '브랜드·가맹' },
  { id: 'course', label: '강의·과정' },
  { id: 'consult', label: '상담' },
  { id: 'proof', label: '후기·성과' },
  { id: 'event', label: '행사' },
];

export const CASE_DATA = [
  // ───────── 01 매물 · 아파트 매매 ─────────
  {
    id: 'apt-sale-tour',
    name: '아파트 매매 투어',
    category: 'listing',
    purpose: '아파트 매매 매물을 외관→거실→주방→안방→욕실 순서로 가격 태그와 함께 보여 주고 문의로 연결',
    inputLine: '사진 5장(외관·거실·주방·안방·욕실) + 대본 그대로',
    platforms: ['instagram', 'facebook', 'youtube', 'threads'],
    aspect: '9:16',
    style: 'listing-price',
    title: '역 가까운 *남향* 24평\n아파트 매매',
    channel: '',
    ending: { text: '*문의*는 프로필·전화로', sub: '{office}', cta: '문의하기', duration: 2.6 },
    music: 'calm',
    scenes: [
      { slot: 1, img: 'a01-apt-exterior', hint: '외관', kind: 'hook', tag: '매매 7.2억', stamp: '남향', caption: '이 가격에 *남향* 24평?', narration: '남향 24평 아파트가 이 가격이면, 한번 보실 만하죠.', duration: 2.8 },
      { slot: 2, img: 'a02-apt-living', hint: '거실', kind: 'normal', tag: '남향', caption: '거실 창으로 *햇살*이 가득 들어와요', narration: '거실 창이 남쪽이라 낮에 햇살이 깊게 들어옵니다.', duration: 3 },
      { slot: 3, img: 'a03-apt-kitchen', hint: '주방', kind: 'normal', tag: '아일랜드', stamp: '올수리', caption: '주방은 *올수리*, 아일랜드 조리대', narration: '주방은 올수리를 마쳤고, 아일랜드 조리대가 있습니다.', duration: 3 },
      { slot: 4, img: 'a04-apt-bedroom', hint: '안방', kind: 'normal', tag: '방 3', caption: '안방엔 *붙박이장*, 방은 세 개', narration: '안방에는 붙박이장이 있고, 방은 모두 세 개입니다.', duration: 3 },
      { slot: 5, img: 'a05-apt-bath', hint: '욕실', kind: 'normal', tag: '욕실 2', caption: '욕실 두 개, *유리 파티션*으로 깔끔', narration: '욕실은 두 개고, 유리 파티션이라 물 튐 걱정이 적습니다.', duration: 3 },
      { slot: 1, img: 'a01-apt-exterior', hint: '외관(1번 다시)', kind: 'normal', tag: '즉시 입주', caption: '*즉시 입주* 가능, 계약 전 등기부 확인', narration: '바로 입주할 수 있고, 계약 전에는 등기부등본을 꼭 확인하세요.', duration: 3 },
      { slot: null, img: null, kind: 'cta', tag: '문의', caption: '더 궁금하면 *프로필·전화*로 문의', narration: '더 궁금한 점은 프로필이나 전화로 편하게 문의 주세요.', duration: 2.8 },
    ],
    extraScene: { caption: '*{n}번째* 포인트, 사진으로 확인하세요', narration: '{n}번째 포인트도 사진으로 확인해 보세요.', duration: 3 },
    upload: {
      desc: '역에서 가까운 남향 24평 아파트 매매 매물(예시)을 사진 순서대로 소개합니다. 거실·주방·안방·욕실을 영상으로 먼저 보고, 방문은 프로필·전화로 예약해 주세요. 가격·면적 등 자세한 정보는 아래 표시 항목을 확인하세요.',
      hashtags: ['#아파트매매', '#남향아파트', '#24평아파트', '#역세권아파트', '#아파트매물', '#부동산쇼츠', '#공인중개사'],
    },
    notes: '가격(7.2억)·면적(24평)·방 수는 예시 — 따라하기 때 ② 매물 정보 칸의 값으로 바꾼다. 채광·조망은 사진에 보이는 만큼만, 과장어(최고·무조건·100%·보장·확실) 금지. 도장(남향·올수리)은 사실일 때만 남긴다. 업로드 글 끝에 표시·광고 필수 항목(상호·등록번호·소재지·연락처·개업공인중개사)이 붙어야 함. 건축물이므로 층수·사용승인일·방향·방·욕실 수·입주 가능일·주차·관리비도 밝힌다. 마지막 장면의 상호·전화는 {office} 자리로 자동.',
  },

  // ───────── 02 매물 · 1층 코너 상가 임대 ─────────
  {
    id: 'shop-corner-lease',
    name: '코너 상가 임대 투어',
    category: 'listing',
    purpose: '1층 코너 상가 임대 매물을 현장 투어처럼 핀 라벨로 공간마다 포인트 하나씩 짚고 업종 상담으로 연결',
    inputLine: '사진 3장(전면·내부·앞 거리) + 대본 그대로',
    platforms: ['instagram', 'youtube', 'facebook', 'threads'],
    aspect: '9:16',
    style: 'site-tour-tag',
    title: '1층 *코너* 상가\n임대 같이 보기',
    channel: '',
    ending: { text: '*임대 문의*는 프로필·전화로', sub: '{office}', cta: '전화하기', duration: 2.6 },
    music: 'playful',
    scenes: [
      { slot: 1, img: 'b01-shop-front', hint: '상가 전면', kind: 'hook', label: '역 앞 코너', caption: '1층 코너 상가, *같이* 보시죠', narration: '역 앞 1층 코너 상가, 저와 같이 한번 보시죠.', duration: 2.8 },
      { slot: 1, img: 'b01-shop-front', hint: '전면(1번 다시)', kind: 'normal', label: '전면', caption: '*통유리* 전면, 두 면이 길에 닿아요', narration: '전면이 통유리고 두 면이 길에 닿아 있어 멀리서도 잘 보입니다.', duration: 3 },
      { slot: 2, img: 'b02-shop-inside', hint: '내부 공실', kind: 'normal', label: '내부', caption: '전용 *15평*, 바닥·천장 마감 완료', narration: '전용 15평이고, 바닥과 천장 마감이 되어 있습니다.', duration: 3 },
      { slot: 2, img: 'b02-shop-inside', hint: '내부(2번 다시)', kind: 'normal', label: '설비', caption: '*화장실*·급배수 안에 있어요', narration: '화장실과 급배수가 안에 있어서 쓸 수 있는 업종이 많습니다.', duration: 3 },
      { slot: 3, img: 's04-city-commercial', hint: '앞 거리', kind: 'normal', label: '유동인구', caption: '퇴근길 *유동인구* 많은 거리', narration: '퇴근 시간대에 사람이 많이 지나는 거리입니다.', duration: 3 },
      { slot: 1, img: 'b01-shop-front', hint: '전면(1번 다시)', kind: 'normal', label: '임대 조건', caption: '보증금 *5천*, 월세 250만원', narration: '임대 조건은 보증금 5천만원에 월세 250만원입니다.', duration: 3 },
      { slot: null, img: null, kind: 'cta', label: '문의', caption: '업종 상담은 *프로필·전화*로', narration: '어떤 업종이 맞을지 프로필이나 전화로 상담해 드릴게요.', duration: 2.8 },
    ],
    extraScene: { caption: '*{n}번째* 포인트, 현장에서 확인', narration: '{n}번째 포인트도 현장에서 직접 확인했습니다.', duration: 3 },
    upload: {
      desc: '역 앞 1층 코너 상가 임대 매물(예시)입니다. 통유리 전면에 두 면이 길에 닿고, 전용 15평에 화장실·급배수가 안에 있습니다. 보증금·월세와 업종 상담은 프로필·전화로 문의해 주세요.',
      hashtags: ['#상가임대', '#1층상가', '#코너상가', '#역세권상가', '#상가매물', '#창업자리', '#공인중개사'],
    },
    notes: '보증금·월세·전용면적은 예시. 음식점 등 업종 가능 여부(용도·정화조·소방)는 단정하지 말고 "확인 후"로. 권리금·유동인구 숫자는 쓰지 않음. 업로드 글 끝에 표시·광고 필수 항목(상호·등록번호·소재지·연락처·개업공인중개사)이 붙어야 함. 상가는 건축물이므로 층수·사용승인일·주차·관리비도 밝힌다. 핀 라벨(label)은 장소·지점 이름 — 사용자 사진에 맞춰 바꿔도 됨. 전면 가로 사진은 photoFit smart 로 흐린 배경 위에 온전히 들어간다.',
  },

  // ───────── 03 매물 · 계획관리지역 토지 ─────────
  {
    id: 'land-plan-road',
    name: '계획관리 토지 답사',
    category: 'listing',
    purpose: '도로에 접한 계획관리지역 토지 매물을 답사하듯 핀 라벨로 보여 주고(도로·용도지역·건폐율·가격·허가 확인) 문의 유도',
    inputLine: '사진 4장(도로 쪽·항공·부지·주변) + 대본 그대로',
    platforms: ['youtube', 'facebook', 'instagram'],
    aspect: '9:16',
    style: 'field-pin',
    title: '도로 붙은 *계획관리* 땅\n직접 가봤습니다',
    channel: '',
    ending: { text: '*토지 문의*는 프로필·전화로', sub: '{office}', cta: '문의하기', duration: 2.6 },
    music: 'epic',
    scenes: [
      { slot: 1, img: 'l01-land-road', hint: '대지 전경', kind: 'hook', label: '현장', caption: '이 땅, 직접 *가봤습니다*', narration: '도로 바로 옆 이 땅, 제가 직접 가봤습니다.', duration: 2.8 },
      { slot: 1, img: 'l01-land-road', hint: '도로 접면(1번 다시)', kind: 'normal', label: '도로', stamp: '도로 접함', caption: '*2차선 도로*에 바로 붙어 있어요', narration: '2차선 도로에 바로 접해 있어 진입이 쉽습니다.', duration: 3 },
      { slot: 2, img: 's01-land-zoning', hint: '항공·필지 경계', kind: 'normal', label: '용도지역', stamp: '계획관리', caption: '용도지역은 *계획관리지역*', narration: '토지이용계획확인원 기준으로 계획관리지역입니다.', duration: 3 },
      { slot: 3, img: 's03-permit-site', hint: '평탄한 부지', kind: 'normal', label: '지형', caption: '평탄한 *660㎡*, 성토 부담 적어 보여요', narration: '660제곱미터 평탄한 땅이라 흙을 돋울 부담이 적어 보입니다.', duration: 3 },
      { slot: 4, img: 'h01-hero-land', hint: '주변 드론', kind: 'normal', label: '건폐율', caption: '계획관리는 *건폐율 40%*까지, 조례 확인', narration: '계획관리지역은 건폐율 40퍼센트까지인데, 시군 조례를 꼭 확인하세요.', duration: 3 },
      { slot: 1, img: 'l01-land-road', hint: '대지(1번 다시)', kind: 'normal', label: '가격', stamp: '155만/평', caption: '매매가 *3억 1천*, 평당 155만원', narration: '매매가는 3억 1천만원, 평당 155만원 정도입니다.', duration: 3 },
      { slot: 3, img: 's03-permit-site', hint: '부지(3번 다시)', kind: 'normal', label: '허가', caption: '*개발행위허가* 여부, 계약 전 확인', narration: '개발행위허가가 나는 땅인지 계약 전에 꼭 확인합니다.', duration: 3 },
      { slot: null, img: null, kind: 'cta', label: '문의', caption: '땅 문의는 *프로필·전화*로', narration: '이 땅이 궁금하면 프로필이나 전화로 문의 주세요.', duration: 2.8 },
    ],
    extraScene: { caption: '*{n}번째* 포인트, 현장에서 확인', narration: '{n}번째 포인트도 현장에서 확인했습니다.', duration: 3 },
    upload: {
      desc: '2차선 도로에 접한 계획관리지역 토지 매물(예시)을 현장 답사 순서로 소개합니다. 용도지역·건폐율은 토지이용계획확인원과 시군 조례로 확인했고, 개발행위허가 가능 여부는 계약 전에 함께 확인해 드립니다. 자세한 사항은 프로필·전화로 문의해 주세요.',
      hashtags: ['#토지매매', '#계획관리지역', '#도로접한땅', '#전원주택부지', '#창고부지', '#토지투자', '#공법의신'],
    },
    notes: '면적(660㎡)·가격(3억 1천)·평당가는 예시. 용도지역·건폐율은 토지이용계획확인원·조례로 확인한 것만 쓰고 "개발 예정·값 오른다" 같은 기대 표현 금지. 도장(도로 접함·계획관리·평당가)도 확인된 사실로 바꾼다. 업로드 글 끝에 표시·광고 필수 항목(상호·등록번호·소재지·연락처·개업공인중개사)이 붙어야 함(토지는 건축물 항목 불필요). 지역명은 핀 라벨(label)에 사용자가 적는다.',
  },

  // ───────── 04 매물 · 빌라 리모델링 비포애프터(1:1) ─────────
  {
    id: 'villa-remodel-ba',
    name: '빌라 리모델링 전후',
    category: 'listing',
    purpose: '리모델링을 마친 빌라 매물을 전·후 사진 짝 비교로 보여 주고 방문 예약으로 연결(인스타 피드용 정사각)',
    inputLine: '사진 3장(전·후 짝 + 외관) + 대본 그대로',
    platforms: ['instagram', 'facebook', 'threads'],
    aspect: '1:1',
    style: 'before-after',
    title: '*올수리* 빌라\n전과 후',
    channel: '',
    ending: { text: '*방문 예약*은 프로필·전화로', sub: '{office}', cta: '방문 예약', duration: 2.6 },
    music: 'upbeat',
    scenes: [
      { slot: 1, img: 'v01-villa-before', hint: '전(거실)', slot2: 2, img2: 'v02-villa-after', hint2: '후(거실)', labelA: '전', labelB: '후', vsLabel: '→', kind: 'hook', stamp: '올수리', caption: '이 거실, *두 달* 만에 이렇게', narration: '이 거실이 두 달 만에 이렇게 바뀌었습니다.', duration: 2.8 },
      { slot: 1, img: 'v01-villa-before', hint: '전(1번 다시)', slot2: 2, img2: 'v02-villa-after', hint2: '후(2번 다시)', labelA: '전', labelB: '후', vsLabel: '→', kind: 'normal', caption: '전: 낡은 장판과 *어두운* 벽', narration: '전에는 장판이 낡고 벽이 어두웠습니다.', duration: 3 },
      { slot: 1, img: 'v01-villa-before', hint: '전(1번 다시)', slot2: 2, img2: 'v02-villa-after', hint2: '후(2번 다시)', labelA: '전', labelB: '후', vsLabel: '→', kind: 'normal', caption: '후: *마루*·조명·도배 새로 했어요', narration: '후에는 마루와 조명, 도배를 모두 새로 했습니다.', duration: 3 },
      { slot: 2, img: 'v02-villa-after', hint: '후(2번 다시)', kind: 'normal', caption: '*새시*·보일러까지 교체', narration: '새시와 보일러까지 바꿨습니다.', duration: 3 },
      { slot: 3, img: 'c04-listing-sub', hint: '빌라 외관', kind: 'normal', caption: '*3층*, 방 2 욕실 1, 주차 1대', narration: '3층이고 방 둘에 욕실 하나, 주차는 한 대 됩니다.', duration: 3 },
      { slot: 1, img: 'v01-villa-before', hint: '전(1번 다시)', slot2: 2, img2: 'v02-villa-after', hint2: '후(2번 다시)', labelA: '전', labelB: '후', vsLabel: '→', kind: 'normal', stamp: '즉시 입주', caption: '매매 *2억 4천*, 바로 입주 가능', narration: '매매가는 2억 4천만원이고, 바로 입주할 수 있습니다.', duration: 3 },
      { slot: null, img: null, kind: 'cta', caption: '보러 오실 분은 *프로필·전화*로', narration: '직접 보고 싶으시면 프로필이나 전화로 예약해 주세요.', duration: 2.8 },
    ],
    extraScene: { caption: '전후 *{n}번째* 비교', narration: '{n}번째 전후 비교입니다.', duration: 3 },
    upload: {
      desc: '리모델링을 마친 빌라 매매 매물(예시)을 전·후 사진으로 비교했습니다. 마루·조명·도배·새시·보일러를 새로 했고 바로 입주할 수 있습니다. 방문 예약은 프로필·전화로 해 주세요.',
      hashtags: ['#빌라매매', '#리모델링빌라', '#올수리', '#비포애프터', '#신혼집', '#빌라매물', '#공인중개사'],
    },
    notes: '리모델링 범위는 실제 한 것만(사진에 없는 새시·보일러는 사용자 사실로 바꾸거나 뺀다). 하자·누수 없음 같은 단정 금지. 전·후 사진은 같은 자리·같은 각도여야 비교가 통한다(사진 자리 1=전, 2=후, 3=외관). 1:1 정사각 — before-after 의 card 템플릿은 엔진이 정사각 배치로 바꾼다. 업로드 글 끝에 표시·광고 필수 항목(상호·등록번호·소재지·연락처·개업공인중개사)이 붙어야 함. 건축물 항목(층수·사용승인일·방향·방·욕실·입주일·주차·관리비)도 밝힌다. labelA/labelB(전/후 칩)와 vsLabel(→)은 cases.js 변환이 장면에 그대로 넘긴다.',
  },

  // ───────── 05 매물 · 수익률 계산형 상가 ─────────
  {
    id: 'shop-yield-calc',
    name: '상가 수익률 계산',
    category: 'listing',
    purpose: '상가 매매 매물의 임대 수익률을 숫자 카운트로 단순 계산해 보여 주고(매매가→월세→연 임대료→실투자→수익률) 상담 유도',
    inputLine: '사진 4장 + 숫자 5개(매매가·월세·연 임대료·실투자·수익률)',
    platforms: ['youtube', 'instagram', 'facebook'],
    aspect: '9:16',
    style: 'calc-marker',
    title: '이 상가 사면\n*수익률* 몇 %?',
    channel: '',
    ending: { text: '*수익률 상담*은 프로필·전화로', sub: '{office}', cta: '상담 신청', duration: 2.8 },
    music: 'corporate',
    scenes: [
      { slot: 1, img: 'b01-shop-front', hint: '상가 전면', kind: 'hook', caption: '이 상가, 연 *수익률* 몇 %일까요?', narration: '이 1층 상가, 연 수익률이 몇 퍼센트쯤 나올까요? 같이 계산해 보죠.', duration: 2.8 },
      { slot: 1, img: 'b01-shop-front', hint: '전면(1번 다시)', kind: 'normal', counter: { from: 0, to: 60000, suffix: '만원' }, caption: '매매가 *6억*원', narration: '매매가는 6억원입니다.', duration: 3 },
      { slot: 2, img: 'b02-shop-inside', hint: '내부', kind: 'normal', counter: { from: 0, to: 250, suffix: '만원' }, stamp: '임대 중', caption: '보증금 1억, 월세 *250만원*', narration: '지금 보증금 1억에 월세 250만원으로 임대 중입니다.', duration: 3 },
      { slot: 2, img: 'b02-shop-inside', hint: '내부(2번 다시)', kind: 'normal', counter: { from: 0, to: 3000, suffix: '만원' }, caption: '연 임대료 *3,000만원*', narration: '월세 250만원이면 1년에 3천만원입니다.', duration: 3 },
      { slot: 3, img: 's04-city-commercial', hint: '앞 거리', kind: 'normal', counter: { from: 60000, to: 50000, suffix: '만원' }, caption: '보증금 빼면 실투자 *5억*', narration: '매매가에서 보증금 1억을 빼면 실제 들어가는 돈은 5억입니다.', duration: 3 },
      { slot: null, img: null, kind: 'normal', counter: { from: 0, to: 6, suffix: '%' }, stamp: '단순 계산', caption: '연 *6%*, 세금·대출 전 단순 계산', narration: '3천만원 나누기 5억, 연 6퍼센트. 세금과 대출을 빼기 전 단순 계산입니다.', duration: 3.2 },
      { slot: 4, img: 'r01-contract', hint: '계약서·서류', kind: 'normal', caption: '계약 전 *임대차계약서*·공실 확인', narration: '계약 전에 임대차계약서와 공실 가능성은 꼭 확인하세요.', duration: 3 },
      { slot: null, img: null, kind: 'cta', caption: '내 조건 계산은 *프로필·전화*로', narration: '내 대출 조건으로 계산해 보고 싶으면 프로필이나 전화로 문의하세요.', duration: 2.8 },
    ],
    extraScene: { caption: '*{n}번째* 숫자도 확인', narration: '{n}번째 숫자도 같이 보시죠.', duration: 3 },
    upload: {
      desc: '1층 상가 매매 매물(예시)의 임대 수익률을 단순 계산해 보았습니다. 매매가 6억, 보증금 1억·월세 250만원이면 연 임대료 3,000만원, 실투자금 5억 기준 연 6%입니다(세금·대출·공실·관리비 반영 전, 예시 계산). 내 조건으로 계산은 프로필·전화로 문의해 주세요.',
      hashtags: ['#상가투자', '#상가수익률', '#1층상가', '#상가매매', '#임대수익', '#수익형부동산', '#공인중개사'],
    },
    notes: '수익률은 "세금·대출·공실·관리비 반영 전 단순 계산 예시" 문구를 자막·설명에 반드시 유지 — "확정 수익"·"수익 보장" 같은 말은 findBannedWords 가 잡는다. 숫자는 ② 매물 정보 값으로 치환하고 계산도 다시 한다(연 임대료 ÷ (매매가 − 보증금)). counter 가 없는 장면은 숫자가 뜨지 않음(추가 장면은 세부 조절에서 counter 를 넣어야 숫자 등장). 업로드 글 끝에 표시·광고 필수 항목(상호·등록번호·소재지·연락처·개업공인중개사)이 붙어야 함. 상가는 건축물 항목(층수·사용승인일·주차·관리비)도 밝힌다.',
  },

  // ───────── 06 브랜드 · 미스터홈즈 FC 가맹 문의 ─────────
  {
    id: 'fc-franchise-ask',
    name: '미스터홈즈 가맹 문의',
    category: 'brand',
    purpose: '미스터홈즈 FC 가맹(체인 가입) 문의를 받는 브랜드 광고 — 사실은 "대한민국 최초 기업형부동산, 100여 개 체인점, 28년 공법 강의" 세 가지만',
    inputLine: '사진 6장 + 대본 그대로(사실 3개만)',
    platforms: ['instagram', 'facebook', 'youtube', 'threads'],
    aspect: '9:16',
    style: 'brand-lower3',
    title: '혼자 하는 중개,\n*함께* 하면 달라집니다',
    channel: '',
    ending: { text: '*가맹 문의*는 프로필 링크로', sub: '미스터홈즈 FC · MR.K 고상철', cta: '가맹 문의', duration: 2.8 },
    music: 'corporate',
    scenes: [
      { slot: 1, img: 's06-consultant-desk', hint: '혼자 일하는 책상', kind: 'hook', stamp: '가맹 모집', caption: '이런 고민 있으세요?\n*혼자* 하는 중개', narration: '혼자 사무소를 꾸리면서 광고에 상담까지, 벅차지 않으세요?', duration: 2.8 },
      { slot: 2, img: 'h02-hero-studio', hint: '영상 작업실', kind: 'normal', caption: '매물 광고도 *교육*도 혼자서는 벅차죠', narration: '매물 광고도 교육도 혼자 다 하기는 벅찹니다.', duration: 3 },
      { slot: 3, img: 'o01-office-front', hint: '중개사무소 내부', kind: 'normal', caption: '대한민국 *최초* 기업형부동산, 미스터홈즈', narration: '미스터홈즈는 대한민국 최초의 기업형 부동산입니다.', duration: 3 },
      { slot: 4, img: 's04-city-commercial', hint: '상가 거리', kind: 'normal', caption: '전국 *100여 개* 체인점이 함께합니다', narration: '전국 100여 개 체인점이 함께하고 있습니다.', duration: 3 },
      { slot: 5, img: 'e01-seminar', hint: '세미나·교육', kind: 'normal', stamp: '교육 지원', caption: '*28년* 공법 강의, 고상철이 함께합니다', narration: '28년 부동산공법을 가르친 고상철이 같이 갑니다.', duration: 3 },
      { slot: 6, img: 'r01-contract', hint: '계약·상담', kind: 'normal', caption: '가맹 조건은 *상담*으로 설명드려요', narration: '가맹 조건은 전화 상담으로 자세히 설명드리겠습니다.', duration: 3 },
      { slot: null, img: null, kind: 'cta', caption: '프로필 링크에서 *가맹 문의*', narration: '프로필 링크에서 가맹 문의를 남겨 주세요.', duration: 2.8 },
    ],
    extraScene: { caption: '*{n}번째* 이유, 사진으로', narration: '{n}번째 이유입니다.', duration: 3 },
    upload: {
      desc: '대한민국 최초 기업형부동산 미스터홈즈 FC가 가맹 문의를 받습니다. 전국 100여 개 체인점과 함께하며, 28년 부동산공법 강의의 고상철이 교육을 맡습니다. 가맹 조건은 프로필 링크로 문의해 주세요.',
      hashtags: ['#미스터홈즈', '#부동산가맹', '#공인중개사창업', '#기업형부동산', '#중개사무소', '#부동산프랜차이즈', '#MRK'],
    },
    notes: '사실은 "대한민국 최초 기업형부동산"·"100여 개 체인점"·"28년 공법 강의" 세 가지만 쓰고 정확한 점포 수·매출·수익은 쓰지 않는다. 수익·매출 보장 표현 금지(가맹사업법상 예상 매출은 서면 자료 없이 말하지 않는다). 가맹비·조건 숫자는 영상에 넣지 않고 상담으로. 매물 광고가 아니므로 표시·광고 항목은 불필요하나 상호·연락처는 설명란에. 스타일은 brand-lower3 — 상호·연락처 로워서드가 끝까지 보이는 브랜드형(설계 초안의 cta-consult 는 09 상담 사례가 쓴다). 채널 이름은 MR.K 고상철(기본값), 사무소 정보가 있으면 상호로 바뀐다.',
  },

  // ───────── 07 강의 · 부동산AI 자동화 기수 모집(16:9 유튜브용) ─────────
  {
    id: 'ai-cohort-recruit',
    name: '부동산AI 기수 모집',
    category: 'course',
    purpose: '공인중개사 대상 부동산AI 자동화 기수 모집 — "사진만 넣으면 매물 쇼츠" 3단계 시연 흐름, 유튜브 가로 영상용',
    inputLine: '가로 사진 5장 + 3단계 대본 그대로',
    platforms: ['youtube', 'facebook'],
    aspect: '16:9',
    style: 'ai-tool-glass',
    title: '사진만 넣으면 *매물 쇼츠*\n자동화 기수 모집',
    channel: '',
    ending: { text: '*기수 신청*은 설명란 링크로', sub: 'MR.K 고상철 · 부동산AI 자동화', cta: '신청하기', duration: 2.8 },
    music: 'lofi',
    scenes: [
      { slot: 1, img: 'h02-hero-studio', hint: '작업실(가로)', kind: 'hook', stamp: '모집중', caption: '매물 사진만 넣으면 *쇼츠*가 나옵니다', narration: '매물 사진만 넣으면 쇼츠 한 편이 나옵니다. 어떻게 하는지 보여 드릴게요.', duration: 2.8 },
      { slot: 2, img: 'a02-apt-living', hint: '매물 사진 예(거실)', kind: 'normal', caption: '1단계: 매물 *사진*을 올립니다', narration: '1단계, 매물 사진을 순서대로 올립니다.', duration: 3 },
      { slot: 3, img: 's06-consultant-desk', hint: '책상·서류', kind: 'normal', caption: '2단계: AI가 *대본*과 자막을 씁니다', narration: '2단계, AI가 사진을 보고 대본과 자막을 써 줍니다.', duration: 3 },
      { slot: 1, img: 'h02-hero-studio', hint: '작업실(1번 다시)', kind: 'normal', caption: '3단계: 목소리 입혀 *MP4*로 저장', narration: '3단계, 목소리를 입혀 MP4로 바로 저장합니다.', duration: 3 },
      { slot: 4, img: 'e01-seminar', hint: '강의 장면(가로)', kind: 'normal', stamp: '실습 과정', caption: '기수 과정에서 *직접* 만들어 봅니다', narration: '자동화 기수 과정에서는 이걸 내 매물로 직접 만들어 봅니다.', duration: 3 },
      { slot: 5, img: 'o01-office-front', hint: '중개사무소 내부', kind: 'normal', caption: '표시·광고 *규정*까지 같이 배웁니다', narration: '매물 광고의 표시·광고 규정까지 같이 배웁니다.', duration: 3 },
      { slot: null, img: null, kind: 'cta', caption: '다음 기수 신청은 *설명란 링크*로', narration: '다음 기수 신청은 설명란 링크에서 하실 수 있습니다.', duration: 2.8 },
    ],
    extraScene: { caption: '*{n}번째* 단계도 화면으로', narration: '{n}번째 단계입니다.', duration: 3 },
    upload: {
      desc: '공인중개사를 위한 부동산AI 자동화 기수를 모집합니다. 매물 사진만 넣으면 AI가 대본·자막을 쓰고 목소리를 입혀 MP4 쇼츠로 저장하는 과정을 직접 만들어 보고, 표시·광고 규정까지 함께 배웁니다. 다음 기수 일정과 신청은 설명란 링크를 확인하세요.',
      hashtags: ['#부동산AI', '#자동화기수', '#공인중개사교육', '#매물쇼츠', '#AI영상', '#고상철', '#MRK영상만들기'],
    },
    notes: '합격·매출·수익 보장 표현 금지. 기수 번호·날짜·수강료는 영상에 넣지 않고 설명란 링크로(바뀌는 값) — 도장도 "모집중"처럼 숫자 없는 말만. 16:9 는 제목 띠가 얇고 제목 줄바꿈이 한 줄로 이어지므로 제목을 짧게 유지. 3:2 가로 사진(h02·e01)이 16:9 에 잘 맞는다. 매물 상자(listing.js)로 따라하면 비율 경고가 뜰 수 있음.',
  },

  // ───────── 08 강의 · 토지 디벨로퍼 과정 ─────────
  {
    id: 'developer-course',
    name: '토지 디벨로퍼 과정',
    category: 'course',
    purpose: '건국대 디벨로퍼 과정(대표강사 고상철) 모집 — 땅을 개발하는 사람이 보는 3가지를 STEP 으로 맛보기',
    inputLine: '사진 6장 + 원칙 3개 대본 그대로',
    platforms: ['youtube', 'instagram', 'facebook', 'threads'],
    aspect: '9:16',
    style: 'lecture-paper',
    title: '땅을 *개발*하는 사람은\n이 세 가지를 봅니다',
    channel: '',
    ending: { text: '*과정 안내*는 설명란 링크로', sub: '건국대 디벨로퍼 과정 · 대표강사 고상철', cta: '과정 안내', duration: 2.8 },
    music: 'corporate',
    scenes: [
      { slot: 1, img: 'h01-hero-land', hint: '개발 예정지 드론', kind: 'hook', caption: '땅을 *개발*하는 사람은\n이걸 먼저 봅니다', narration: '땅을 개발하는 사람은 가격보다 이것부터 봅니다.', duration: 2.8 },
      { slot: 2, img: 's01-land-zoning', hint: '항공·필지', kind: 'normal', caption: '*용도지역*, 무엇을 지을 수 있나', narration: '첫째, 용도지역. 이 땅에 무엇을 지을 수 있는지 정합니다.', duration: 3 },
      { slot: 3, img: 'l01-land-road', hint: '도로 접한 대지', kind: 'normal', caption: '*도로*, 허가의 출발점', narration: '둘째, 도로. 도로가 있어야 허가가 시작됩니다.', duration: 3 },
      { slot: 4, img: 's03-permit-site', hint: '공사 준비 부지', kind: 'normal', caption: '*개발행위허가*, 나야 사업이 됩니다', narration: '셋째, 개발행위허가. 이게 나야 사업이 됩니다.', duration: 3 },
      { slot: 5, img: 'e01-seminar', hint: '세미나·강의', kind: 'normal', caption: '건국대 디벨로퍼 과정에서 *실전*으로', narration: '건국대 디벨로퍼 과정에서는 이 세 가지를 실전 사례로 익힙니다.', duration: 3 },
      { slot: 6, img: 's06-consultant-desk', hint: '강사 책상·지적도', kind: 'normal', caption: '28년 공법 강의, *대표강사* 고상철', narration: '28년 부동산공법을 가르친 고상철이 대표강사로 함께합니다.', duration: 3 },
      { slot: null, img: null, kind: 'cta', caption: '과정 안내는 *설명란 링크*에서', narration: '과정 안내와 신청은 설명란 링크에서 확인하세요.', duration: 2.8 },
    ],
    extraScene: { caption: '*{n}번째* 원칙, 현장 사진으로', narration: '{n}번째 원칙입니다.', duration: 3 },
    upload: {
      desc: '땅을 개발하는 사람이 가격보다 먼저 보는 세 가지, 용도지역·도로·개발행위허가를 건국대 디벨로퍼 과정에서 실전 사례로 익힙니다. 28년 부동산공법을 가르친 고상철이 대표강사로 함께합니다. 과정 안내와 신청은 설명란 링크를 확인하세요.',
      hashtags: ['#디벨로퍼과정', '#건국대', '#토지개발', '#부동산공법', '#공법의신', '#토지투자', '#고상철'],
    },
    notes: '모집 일정·수강료·정원은 설명란에(영상엔 넣지 않음). 수익·인허가 보장 표현 금지. 과정 정식 명칭·기관명은 사용자가 확인해 적는다. steps 장식은 훅·cta 를 빼고 STEP 01/05 로 번호를 매기므로 본문 장면 수가 곧 STEP 수. 스타일은 광고용 추천이 아닌 lecture-paper(공법의 신 대표 스타일) — 강의 브랜드 일관성 때문에 그대로 둔다.',
  },

  // ───────── 09 상담 · 토지 컨설팅 Q&A ─────────
  {
    id: 'land-consult-qna',
    name: '토지 컨설팅 Q&A',
    category: 'consult',
    purpose: '땅 가진 사람이 자주 묻는 질문 3개에 결론부터 답하고 토지 컨설팅 상담 신청으로 연결',
    inputLine: '사진 6장 + 질문·답 3쌍 그대로',
    platforms: ['youtube', 'instagram', 'facebook'],
    aspect: '9:16',
    style: 'cta-consult',
    title: '땅 가진 분들 *질문* 3개,\n답해 드립니다',
    channel: '',
    ending: { text: '*내 땅 상담*은 프로필 링크로', sub: 'MR.K 고상철 · 토지 컨설팅', cta: '상담 신청', duration: 2.8 },
    music: 'lofi',
    scenes: [
      { slot: 1, img: 's01-land-zoning', hint: '농촌 토지 항공', kind: 'hook', stamp: '무료 상담', caption: '물려받은 땅, *팔아야* 할까요?', narration: '첫 질문. 물려받은 땅, 지금 팔아야 할까요?', duration: 2.8 },
      { slot: 2, img: 's06-consultant-desk', hint: '상담 책상·지적도', kind: 'normal', caption: '*용도지역*부터 보고 정합니다', narration: '용도지역부터 확인하고 정하자는 게 답입니다. 땅마다 다르니까요.', duration: 3 },
      { slot: 3, img: 's02-landlocked', hint: '맹지', kind: 'normal', caption: '맹지라는데 *방법*이 있나요?', narration: '둘째 질문. 우리 땅이 맹지라는데 방법이 있을까요?', duration: 2.8 },
      { slot: 4, img: 'l01-land-road', hint: '도로 접한 대지', kind: 'normal', caption: '*진입로* 확보 방법이 몇 가지 있어요', narration: '진입로를 확보하는 방법이 몇 가지 있습니다. 조건을 봐야 해요.', duration: 3 },
      { slot: 5, img: 's03-permit-site', hint: '공사 준비 부지', kind: 'normal', caption: '창고 지으려는데 *허가* 될까요?', narration: '셋째 질문. 창고를 지으려는데 허가가 날까요?', duration: 2.8 },
      { slot: 6, img: 'h01-hero-land', hint: '개발 예정지 드론', kind: 'normal', stamp: '공법 28년', caption: '도로·경사·용도지역 *세 가지*로 판단', narration: '도로와 경사도, 용도지역 세 가지를 보면 대략 판단이 됩니다.', duration: 3 },
      { slot: null, img: null, kind: 'cta', caption: '내 땅은 어떤지 *프로필 링크*로 상담', narration: '내 땅은 어떤지 궁금하면 프로필 링크로 상담을 신청하세요.', duration: 2.8 },
    ],
    extraScene: { caption: '*{n}번째* 질문도 같이 봅니다', narration: '{n}번째 질문입니다.', duration: 3 },
    upload: {
      desc: '물려받은 땅을 팔아야 할지, 맹지에 방법이 있는지, 창고 허가가 날지 — 땅 가진 분들이 자주 묻는 질문 3개에 결론부터 답했습니다. 내 땅은 어떤지 궁금하면 프로필 링크로 상담을 신청하세요.',
      hashtags: ['#토지컨설팅', '#토지상담', '#맹지', '#용도지역', '#개발행위허가', '#땅투자', '#공법의신'],
    },
    notes: '답은 일반론 — "됩니다" 단정 대신 조건부("조건을 봐야")로. 상담 비용·절차는 설명란에. 과장어 금지. 질문·답 장면이 번갈아 가므로 추가 사진(extraScene)은 질문 틀로 들어가고 답은 사용자가 세부 조절에서 적는다. 스타일은 상담 용도 1순위 cta-consult(점 진행 + 무료 상담 도장 + 로워서드) — 설계 초안의 qna-bubble 은 말풍선이 사진을 크게 가려 광고용 추천에서 빠진 스타일이라 바꿨고, 자막의 "Q./A." 접두는 pop 등장과 어울리게 뺐다. 채널 이름은 MR.K 고상철.',
  },

  // ───────── 10 후기 · 컨설팅 후기 이야기(익명·예시) ─────────
  {
    id: 'consult-review-story',
    name: '컨설팅 후기 이야기',
    category: 'proof',
    purpose: '토지 컨설팅 후기를 익명·예시로 재구성해 상담 신뢰를 쌓는 광고(3년 묵힌 맹지가 풀린 이야기)',
    inputLine: '사진 5장 + 사례 한 편 그대로',
    platforms: ['youtube', 'facebook', 'threads'],
    aspect: '9:16',
    style: 'review-stamp',
    title: '맹지 때문에 *3년* 묵힌 땅,\n이렇게 풀렸습니다',
    channel: '',
    ending: { text: '*내 땅도* 상담받기', sub: 'MR.K 고상철 · 토지 컨설팅', cta: '상담 신청', duration: 2.8 },
    music: 'calm',
    scenes: [
      { slot: 1, img: 's02-landlocked', hint: '맹지(문제의 땅)', kind: 'hook', stamp: '상담 사례', caption: '3년 동안 *안 팔리던* 땅이 있었습니다', narration: '3년 동안 안 팔리던 땅이 있었습니다. 상담 사례를 재구성한 이야기입니다.', duration: 2.8 },
      { slot: 1, img: 's02-landlocked', hint: '맹지(1번 다시)', kind: 'normal', caption: '"도로가 없어서 *건축*이 안 된대요"', narration: '의뢰인은 도로가 없어 건축이 안 된다는 말만 들었다고 했습니다.', duration: 3 },
      { slot: 2, img: 's06-consultant-desk', hint: '지적도·상담 책상', kind: 'normal', caption: '지적도를 보니 *현황도로*가 있었습니다', narration: '지적도와 현장을 같이 보니 현황도로가 있었습니다.', duration: 3 },
      { slot: 3, img: 'l01-land-road', hint: '도로 접한 대지', kind: 'normal', caption: '*토지사용승낙*으로 진입로 정리', narration: '옆 필지 소유자의 토지사용승낙으로 진입로를 정리했습니다.', duration: 3 },
      { slot: 4, img: 's03-permit-site', hint: '공사 준비 부지', kind: 'normal', caption: '허가 신청 뒤 *매수 문의*가 왔습니다', narration: '개발행위허가를 신청하자 매수 문의가 들어오기 시작했습니다.', duration: 3 },
      { slot: 5, img: 'r01-contract', hint: '계약서 서명', kind: 'normal', stamp: '의뢰인 후기', caption: '"*먼저* 물어볼걸 그랬어요" — 의뢰인', narration: '의뢰인은 먼저 물어볼걸 그랬다고 하셨습니다.', duration: 3 },
      { slot: null, img: null, kind: 'cta', caption: '내 땅도 *상담*, 프로필 링크로', narration: '내 땅도 풀 방법이 있는지 프로필 링크로 상담 신청하세요.', duration: 2.8 },
    ],
    extraScene: { caption: '*{n}번째* 장면, 사진으로', narration: '{n}번째 장면입니다.', duration: 3 },
    upload: {
      desc: '3년 동안 팔리지 않던 맹지가 현황도로 확인과 토지사용승낙으로 진입로를 정리한 뒤 매수 문의를 받기까지의 상담 사례를 익명으로 재구성했습니다. 모든 땅에 같은 방법이 통하는 것은 아니며, 내 땅은 어떤지 프로필 링크로 상담을 신청하세요.',
      hashtags: ['#토지컨설팅후기', '#맹지탈출', '#토지사용승낙', '#현황도로', '#토지상담', '#공법의신', '#고상철'],
    },
    notes: '실제 인물·지번·지역을 드러내지 않는다(익명·예시 표시, 후기 사용 동의 확인). "모든 땅이 된다" 같은 일반화와 땅값 몇 배 같은 결과 수치는 쓰지 않는다. 후기 인용(따옴표)은 의뢰인이 한 말의 뜻을 바꾸지 않는 범위에서. 도장은 "상담 사례"·"의뢰인 후기"처럼 사례임을 밝히는 말만("실제 후기" 도장은 동의받은 실제 후기일 때만). 스타일은 후기형 review-stamp(형광펜 자막 + 도장 + 상호 로워서드) — 설계 초안의 case-gradient 는 제목이 없어(titleMode none) 브랜드 노출이 약해 바꿨다. 채널 이름은 MR.K 고상철.',
  },

  // ───────── 11 매물 · 속보형 신규 매물(아파트 전세) ─────────
  {
    id: 'new-listing-flash',
    name: '신규 매물 속보',
    category: 'listing',
    purpose: '방금 나온 신규 매물(아파트 전세 예시)을 속보처럼 알려 빠른 문의를 받는 광고',
    inputLine: '사진 5장 + 가격·입주일',
    platforms: ['youtube', 'instagram', 'threads', 'facebook'],
    aspect: '9:16',
    style: 'breaking-news',
    title: '[속보] *역세권* 24평\n전세 매물 나왔습니다',
    channel: '',
    ending: { text: '*전세 문의*는 프로필·전화로', sub: '{office}', cta: '전화하기', duration: 2.6 },
    music: 'news',
    scenes: [
      { slot: 1, img: 'a01-apt-exterior', hint: '외관(단지)', kind: 'hook', stamp: '신규 매물', caption: '방금 나왔습니다\n*역세권* 전세 24평', narration: '방금 나온 매물입니다. 역세권 24평 전세예요.', duration: 2.8 },
      { slot: 2, img: 'a02-apt-living', hint: '거실', kind: 'normal', caption: '전세 *3억 5천*, 남향 거실', narration: '전세가는 3억 5천만원, 거실은 남향입니다.', duration: 3 },
      { slot: 3, img: 'a03-apt-kitchen', hint: '주방', kind: 'normal', stamp: '올수리', caption: '주방·욕실 *올수리* 마쳤습니다', narration: '주방과 욕실은 올수리를 마쳤습니다.', duration: 3 },
      { slot: 4, img: 'a04-apt-bedroom', hint: '안방', kind: 'normal', caption: '입주는 *다음 달*부터 가능', narration: '입주는 다음 달부터 가능합니다.', duration: 3 },
      { slot: 5, img: 'a05-apt-bath', hint: '욕실', kind: 'normal', caption: '계약 전 *등기부* 근저당 꼭 확인', narration: '전세는 계약 전에 등기부등본의 근저당을 꼭 확인하세요.', duration: 3 },
      { slot: 1, img: 'a01-apt-exterior', hint: '외관(1번 다시)', kind: 'normal', caption: '*전세보증보험* 가입 여부도 체크', narration: '전세보증보험 가입이 되는지도 같이 확인해 드립니다.', duration: 3 },
      { slot: null, img: null, kind: 'cta', caption: '문의는 *프로필·전화*로', narration: '문의는 프로필이나 전화로 주세요. 연락 주신 순서대로 안내합니다.', duration: 2.8 },
    ],
    extraScene: { caption: '*{n}번째* 포인트도 확인하세요', narration: '{n}번째 포인트입니다.', duration: 3 },
    upload: {
      desc: '방금 나온 역세권 24평 아파트 전세 매물(예시)입니다. 전세 3억 5천, 남향 거실, 주방·욕실 올수리, 입주는 다음 달부터 가능합니다. 계약 전 등기부 근저당과 전세보증보험 가입 여부를 함께 확인해 드리니 프로필·전화로 문의해 주세요.',
      hashtags: ['#신규매물', '#아파트전세', '#역세권전세', '#24평전세', '#전세매물', '#부동산속보', '#공인중개사'],
    },
    notes: '"방금 나왔습니다"와 "신규 매물" 도장은 실제 신규 매물일 때만. "선착순·마감 임박" 같은 압박 문구는 쓰지 않는다. 전세가·입주일은 예시 — ② 매물 정보 값으로. 업로드 글 끝에 표시·광고 필수 항목(상호·등록번호·소재지·연락처·개업공인중개사)이 붙어야 함. 건축물 항목(층수·사용승인일·방향·방·욕실·입주일·주차·관리비)도 밝힌다. breaking-news 는 날짜 라벨을 쓰지 않는다(ticker 만 p.dateLabel 사용); 연락처는 fx 가 하단 띠에 작게 넣는다.',
  },

  // ───────── 12 브랜드 · 슬로건(글자만, 사진 한 장) ─────────
  {
    id: 'brand-slogan-wave',
    name: '사무소 슬로건',
    category: 'brand',
    purpose: '사무소·채널 슬로건을 글자만으로 크게 띄우는 브랜딩 영상 — 사진 없이 또는 사무소 사진 한 장',
    inputLine: '사진 0~1장 + 문장 6개',
    platforms: ['instagram', 'threads', 'tiktok', 'youtube'],
    aspect: '9:16',
    style: 'quote-wave',
    title: '우리 사무소 *한 문장*',
    channel: '',
    ending: { text: '*공법*을 아는 중개', sub: '{office}', cta: '프로필 보기', duration: 3 },
    music: 'epic',
    scenes: [
      { slot: null, img: null, kind: 'hook', caption: '부동산은 *아는 만큼* 보입니다', narration: '부동산은 아는 만큼 보입니다.', duration: 3 },
      { slot: null, img: null, kind: 'normal', caption: '모르면 *계약서*에 사인만 하고', narration: '모르면 계약서에 사인만 하게 되고요.', duration: 3 },
      { slot: null, img: null, kind: 'normal', caption: '알면 *손해*를 먼저 막습니다', narration: '알면 손님의 손해를 먼저 막습니다.', duration: 3 },
      { slot: null, img: null, kind: 'normal', caption: '*공법*을 아는 중개가 다릅니다', narration: '공법을 아는 중개가 다릅니다.', duration: 3 },
      { slot: 1, img: 'o01-office-front', hint: '사무소 사진(없어도 됨)', kind: 'normal', caption: '믿고 맡길 중개, *가까이* 있습니다', narration: '믿고 맡길 중개, 가까이 있습니다.', duration: 3 },
      { slot: null, img: null, kind: 'cta', caption: '지금 *프로필*에서 확인하세요', narration: '지금 프로필에서 확인하세요.', duration: 3 },
    ],
    extraScene: { caption: '*{n}번째* 문장', narration: '{n}번째 문장입니다.', duration: 3 },
    upload: {
      desc: '부동산은 아는 만큼 보입니다. 공법을 아는 중개가 손해를 먼저 막습니다. 믿고 맡길 중개사무소, 프로필에서 확인하세요.',
      hashtags: ['#공인중개사', '#부동산공법', '#공법의신', '#중개사무소', '#부동산슬로건', '#미스터홈즈'],
    },
    notes: '글자만 — 사진은 1장 이하(사진 자리 1개, 비워도 됨). 모든 장면 20자 이내·강조 1개(quote-wave 규칙). 과장어 금지. 상호는 채널(왼쪽 위)과 엔딩 {office} 로 자동 — 사무소 정보가 없으면 MR.K 고상철 채널로 나간다. 슬로건 문장은 사용자가 바꿔도 되며, 글자 장면은 사진 없이도 완성된다. 스타일은 광고용 추천이 아닌 quote-wave — 슬로건은 사진 없는 큰 글자가 곧 용도라 그대로 둔다.',
  },

  // ───────── 13 행사 · 사무소 오픈 기념 설명회 ─────────
  {
    id: 'office-open-event',
    name: '사무소 오픈 설명회',
    category: 'event',
    purpose: '새 사무소 오픈 기념 토지 공법 설명회를 D-day 리본과 함께 알려 참가 신청을 받는 행사 안내',
    inputLine: '사진 5장(사무소·설명회·토지·책상·작업실) + 날짜·시간',
    platforms: ['instagram', 'facebook', 'youtube', 'threads'],
    aspect: '9:16',
    style: 'event-ribbon',
    title: '사무소 *오픈* 기념\n토지 공법 설명회',
    channel: '',
    ending: { text: '*참가 신청*은 프로필·전화로', sub: '{office}', cta: '참가 신청', duration: 2.8 },
    music: 'upbeat',
    scenes: [
      { slot: 1, img: 'o01-office-front', hint: '새 사무소', kind: 'hook', tag: 'D-7', caption: '11월 20일, 새 사무소 *문 엽니다*', narration: '11월 20일 토요일, 새 사무소가 문을 엽니다.', duration: 2.8 },
      { slot: 2, img: 'e01-seminar', hint: '설명회 자리', kind: 'normal', tag: 'D-7', caption: '오픈 기념 *토지 공법* 설명회', narration: '오픈을 기념해 토지 공법 설명회를 열어요.', duration: 3 },
      { slot: 3, img: 's01-land-zoning', hint: '토지 항공', kind: 'normal', tag: '특강', caption: '내 땅에 *무엇을* 지을 수 있나', narration: '주제는 내 땅에 무엇을 지을 수 있는지, 용도지역 읽는 법입니다.', duration: 3 },
      { slot: 4, img: 's06-consultant-desk', hint: '상담 책상', kind: 'normal', tag: '무료', caption: '설명회 뒤 *무료 상담* 30분', narration: '설명회가 끝나면 한 분씩 30분 무료 상담을 해 드립니다.', duration: 3 },
      { slot: 5, img: 'h02-hero-studio', hint: '영상 작업실', kind: 'normal', tag: '시연', caption: '매물 쇼츠 만들기 *시연*도 합니다', narration: '사진만 넣어 매물 쇼츠를 만드는 시연도 보여 드립니다.', duration: 3 },
      { slot: 1, img: 'o01-office-front', hint: '사무소(1번 다시)', kind: 'normal', tag: 'D-7', caption: '토요일 *오후 2시*, 사무소 2층', narration: '시간은 토요일 오후 2시, 장소는 사무소 2층입니다.', duration: 3 },
      { slot: null, img: null, kind: 'cta', tag: '선착순', caption: '신청은 *프로필·전화*로, 선착순 20명', narration: '참가 신청은 프로필이나 전화로 해 주세요. 선착순 스무 분입니다.', duration: 2.8 },
    ],
    extraScene: { caption: '*{n}번째* 순서도 준비했습니다', narration: '{n}번째 순서도 준비했습니다.', duration: 3 },
    upload: {
      desc: '새 사무소 오픈을 기념해 토지 공법 설명회(예시 일정)를 엽니다. 내 땅에 무엇을 지을 수 있는지 용도지역 읽는 법을 배우고, 설명회 뒤에는 30분 무료 상담과 매물 쇼츠 시연이 이어집니다. 참가 신청은 프로필·전화로 해 주세요.',
      hashtags: ['#사무소오픈', '#부동산설명회', '#토지공법', '#용도지역', '#무료상담', '#공인중개사', '#공법의신'],
    },
    notes: '날짜·시간·장소·정원(20명)은 예시 — 확정되지 않은 날짜는 "예정"으로 적고, 선착순은 실제 정원일 때만. 리본 글(tag)은 D-7·특강·무료·선착순처럼 2~3자로(리본 폭이 좁아 4자부터 글자가 작아짐). 행사 안내는 매물 광고가 아니라 표시·광고 항목이 붙지 않지만 상호·연락처는 설명란에 적는다. 사무소 사진은 오픈 전이면 공사 중 사진이나 간판 사진도 된다.',
  },
];

/** id 로 사례 하나 찾기(없으면 null) */
export const findCase = (id) => CASE_DATA.find((c) => c.id === id) || null;
