// 매물 소개 영상 대본: 프롬프트·JSON 스키마·결과 정리·표시광고 필수 항목을 한곳에서 관리합니다.
// 사진(번호 0부터)과 사용자가 적은 사실만으로 장면마다 자막·내레이션을 만들고, 올릴 곳별 설명 글도 함께 받습니다.
// 문구를 고치려면 여기만 고치면 됩니다. 이 파일은 키·사진을 다루지 않습니다(llm.js 가 보냄).

/** 화면 자막 글자 수(별표 제외) */
export const CAPTION_MIN = 18;
export const CAPTION_MAX = 32;

/**
 * 매물 사실 칸(사용자가 적는 것). 공인중개사법 제18조의2·시행령 제17조의2(인터넷 표시·광고 명시사항) 항목과 같은 순서.
 * key 는 facts 객체의 이름, label 은 화면·설명 글에 쓰는 말.
 * need: 'all' = 모든 매물에 밝혀야 하는 항목(시행령 제17조의2 ② 1~5호: 소재지·면적·가격·중개대상물 종류·거래 형태)
 *       'building' = 건축물(토지가 아닌 매물)이면 더 밝혀야 하는 항목(② 6호: 총 층수, 사용승인·사용검사·준공검사 받은 날,
 *       방향, 방·욕실 개수, 입주 가능일, 주차 대수, 관리비). 2026-10 국가법령정보 현행 조문 기준.
 */
export const FACT_FIELDS = [
  { key: 'location', label: '소재지', need: 'all' },
  { key: 'area', label: '면적', need: 'all' },
  { key: 'price', label: '가격', need: 'all' },
  { key: 'propertyType', label: '매물 종류', need: 'all' },
  { key: 'dealType', label: '거래 형태', need: 'all' },
  { key: 'floor', label: '층수(해당 층/총 층)', need: 'building' },
  { key: 'approvalDate', label: '사용승인일', need: 'building' },
  { key: 'direction', label: '방향', need: 'building' },
  { key: 'rooms', label: '방·욕실 수', need: 'building' },
  { key: 'moveIn', label: '입주 가능일', need: 'building' },
  { key: 'parking', label: '주차 대수', need: 'building' },
  { key: 'maintenance', label: '관리비', need: 'building' },
  { key: 'memo', label: '기타 특징', disclose: false }, // 설명 글 끝 필수 항목에는 넣지 않음(대본 참고용)
];

/** 중개사무소 칸. 표시·광고 때 반드시 밝히는 항목(시행령 제17조의2 ①: 명칭·소재지·연락처·등록번호, 개업공인중개사 성명). */
export const OFFICE_FIELDS = [
  { key: 'name', label: '중개사무소', need: '중개사무소 명칭' },
  { key: 'address', label: '소재지', need: '사무소 소재지' },
  { key: 'phone', label: '연락처', need: '사무소 연락처' },
  { key: 'regNo', label: '등록번호', need: '등록번호' },
  { key: 'agent', label: '개업공인중개사', need: '개업공인중개사 성명' },
];

/** 건축물 매물인지(토지가 아니면 건축물 항목도 밝힘). 종류를 아직 안 골랐으면 false. */
export const isBuildingType = (type) => {
  const t = String(type ?? '').trim();
  return !!t && t !== '토지';
};

/**
 * 표시·광고에 밝혀야 하는데 비어 있는 항목 이름들(화면 경고용). 사무소 5개 + 매물 5개 + 건축물이면 7개.
 * 법이 정한 모든 경우를 판단하지는 않습니다 — 빠진 것을 알려 주는 도우미일 뿐, 올리기 전 확인은 사용자가 합니다.
 */
export function missingDisclosure(office, facts) {
  const of = officeOf(office);
  const f = facts && typeof facts === 'object' ? facts : {};
  const out = OFFICE_FIELDS.filter((x) => !of[x.key]).map((x) => x.need);
  const building = isBuildingType(f.propertyType);
  for (const x of FACT_FIELDS) {
    if (x.need === 'all' || (x.need === 'building' && building)) {
      if (!clean(f[x.key])) out.push(x.key === 'location' ? '매물 소재지' : x.key === 'floor' ? '층수' : x.label);
    }
  }
  return out;
}

const ASPECT_WORDS = {
  '9:16': '세로 쇼츠·릴스(9:16)',
  '16:9': '가로 영상(16:9, 유튜브 일반 영상)',
  '1:1': '정사각형(1:1)',
  '4:5': '세로 피드(4:5)',
};

// 단정·과장 표현(부당한 표시·광고 우려) — 프롬프트에서 금지하고, 결과에서도 찾아 알려 줍니다(findBannedWords — 자동으로 지우지는 않음).
export const BANNED_WORDS = ['최고', '최저가', '유일', '무조건', '100%', '확정 수익', '수익 보장', '보장', '역대급', '완벽', '절대', '로또'];

/**
 * 글들에서 과장·단정 표현(BANNED_WORDS)을 찾아 돌려줍니다(겹치지 않게 — '수익 보장'이 있으면 '보장'은 따로 세지 않음).
 * 띄어쓰기만 다른 것('수익보장')도 찾습니다. '최고층'처럼 사실일 수도 있는 말도 잡히므로 화면에서는 "보일 수 있는 말"로만 알립니다.
 */
export function findBannedWords(...texts) {
  const all = texts.flat(Infinity).map((t) => String(t ?? '')).join('\n');
  const flat = all.replace(/\s+/g, '');
  const found = BANNED_WORDS.filter((w) => flat.includes(w.replace(/\s+/g, '')));
  return found.filter((w) => !found.some((o) => o !== w && o.replace(/\s+/g, '').includes(w.replace(/\s+/g, ''))));
}

/** 한 칸 값 → 깔끔한 한 줄(줄바꿈·연속 공백 정리, 너무 길면 자름) */
function clean(v, max = 120) {
  return String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** facts(객체 또는 글) → 프롬프트에 넣을 "항목: 값" 줄들 */
function factLines(facts) {
  if (!facts) return [];
  if (typeof facts === 'string') return clean(facts, 1200) ? [clean(facts, 1200)] : [];
  const known = new Set(FACT_FIELDS.map((f) => f.key));
  const lines = [];
  for (const f of FACT_FIELDS) {
    const v = clean(facts[f.key], f.key === 'memo' ? 600 : 120);
    if (v) lines.push(`${f.label}: ${v}`);
  }
  for (const [k, raw] of Object.entries(facts)) {
    if (known.has(k)) continue;
    const v = clean(raw);
    if (v) lines.push(`${clean(k, 30)}: ${v}`);
  }
  return lines;
}

function officeOf(office) {
  const o = office && typeof office === 'object' ? office : {};
  return {
    name: clean(o.name, 60),
    address: clean(o.address, 120),
    phone: clean(o.phone, 40),
    regNo: clean(o.regNo, 40),
    agent: clean(o.agent ?? o.ceo, 30),
  };
}

/**
 * 매물 대본 프롬프트.
 * @param {{ facts?: object|string, office?: object, photoCount: number, style?: {name?: string, hint?: string}, aspect?: string, tone?: string }} o
 */
export function buildListingPrompt({ facts, office, photoCount, style, aspect = '9:16', tone = '' } = {}) {
  const n = Math.max(1, Math.min(30, Number.parseInt(photoCount, 10) || 1));
  const lines = factLines(facts);
  const of = officeOf(office);
  const contact = [of.name && `중개사무소 ${of.name}`, of.phone && `연락처 ${of.phone}`].filter(Boolean).join(', ');
  const styleName = clean(style?.name, 60);
  const styleHint = clean(style?.hint, 600);
  const toneText = clean(tone, 80);
  const shape = ASPECT_WORDS[aspect] || ASPECT_WORDS['9:16'];

  return `너는 부동산 매물 소개 영상의 대본 작가다.
채널: MR.K 고상철 — 28년간 부동산공법을 가르친 "공법의 신" 강사 채널. 말투는 쉽고 명쾌하고 믿음직하다. 손님에게 확인할 점을 짚어 주는 전문가 톤.
영상 모양: ${shape}
${styleName ? `영상 스타일: ${styleName}${styleHint ? ` — ${styleHint}` : ''}\n` : ''}${toneText ? `말투 요청: ${toneText}\n` : ''}
사진: ${n}장. 사진 번호는 보낸 순서대로 0부터 ${n - 1}까지다(사진 앞에 "사진 0:" 같은 번호가 붙어 있을 수 있다).

사용자가 적은 매물 사실(이것만 사실로 말한다):
${lines.length ? lines.map((l) => `- ${l}`).join('\n') : '- (적은 사실 없음 — 사진에 보이는 것만 말한다)'}
${contact ? `문의처: ${contact}\n` : ''}
반드시 지킬 것(부동산 표시·광고 규정)
- 사진에 실제로 보이는 것과 위에 적힌 사실만 말한다. 가격·면적·층수·준공(사용승인)연도·방 수·관리비·역까지 거리·학군·용도지역 같은 것은 위에 없으면 절대 지어내지 않는다. 숫자는 적힌 그대로 쓴다.
- 과장·단정 표현을 쓰지 않는다: ${BANNED_WORDS.map((w) => `"${w}"`).join(', ')} 같은 말 금지. 투자 수익·시세 상승을 약속하지 않는다.
- 사진에서 확실하지 않은 것(예: 채광, 전망, 새 가전 여부)은 "~로 보입니다"처럼 조심스럽게 말하거나 빼고 말한다.
- 중개보조원 이름·연락처, 없는 매물·조건은 넣지 않는다. 문의처는 위에 적힌 것만 쓴다(없으면 "설명란의 연락처로 문의"처럼 일반적으로).

장면 규칙
- 장면 수는 사진 수와 같은 정확히 ${n}개. 사진마다 한 장면이고, 각 사진을 한 번씩 쓴다. 보기 좋은 순서로 바꿔도 되며 photo 에 그 사진 번호(0~${n - 1})를 적는다.
- 첫 장면은 3초 안에 멈춰 보게 만드는 훅(질문·핵심 장점 한 가지). 마지막 장면은 문의 안내.
- caption: 화면 자막. 공백 포함 ${CAPTION_MIN}~${CAPTION_MAX}자 한국어 한 문장(${CAPTION_MAX}자를 넘기면 화면에서 읽기 어렵다 — 쓰고 나서 글자 수를 세어 넘으면 더 짧은 말로 바꾼다). 가장 중요한 단어 하나만 *별표*로 감쌀 수 있다(없어도 됨, 2개 이상 금지). 예: "남향 거실에 *햇살*이 가득 들어와요"(18자), "올수리라 짐만 옮기면 *바로 입주*"(18자)
- narration: 그 장면에서 읽어 줄 말. 자연스러운 구어체 1~2문장(장면당 약 3~6초 분량). 자막을 그대로 읽지 말고 조금 풀어서 말한다. 별표를 쓰지 않는다.
- 공법 강사답게 손님이 계약 전에 확인하면 좋은 점을 한 장면쯤 짚어도 된다(단, 위에 없는 규제·용도지역을 단정하지 않는다).

올릴 곳별 글(upload) — 중개사무소 정보·필수 표시 항목은 앱이 설명 끝에 따로 붙이므로 쓰지 않는다
- youtubeTitle: 40자 이내, 낚시성 표현 없이 핵심 장점 하나.
- youtubeDescription: 2~4문장 매물 요약.
- instagram: 줄바꿈을 섞은 3~5줄 소개 글(이모지 조금 가능).
- tiktok: 1~2줄 짧은 글.
- threads: 대화하듯 2~3문장.
- facebook: 3~4문장 소개 글.
- hashtags: 5~10개, # 포함, 지역·매물 종류 위주(적힌 사실 범위 안에서).
- title: 영상 위쪽에 떠 있을 제목. 2줄 이내, 줄바꿈은 \\n, 핵심어 하나를 *별표*로.

다른 말 없이 JSON 만 출력한다.`;
}

/** 매물 대본 JSON 스키마(기본형 — llm.js schemaFor 가 서비스별로 바꿔 보냄) */
export const LISTING_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: '영상 위 제목. 2줄 이내, 핵심어 하나를 *별표*로' },
    scenes: {
      type: 'array',
      description: '사진마다 한 장면. 장면 수 = 사진 수',
      minItems: 1,
      items: {
        type: 'object',
        properties: {
          photo: { type: 'integer', minimum: 0, description: '이 장면에 쓸 사진 번호(0부터)' },
          caption: { type: 'string', minLength: CAPTION_MIN, maxLength: CAPTION_MAX, description: '화면 자막 한 문장, *강조* 1개 이내' },
          narration: { type: 'string', description: '읽어 줄 말, 자연스러운 구어체 1~2문장' },
        },
        required: ['photo', 'caption', 'narration'],
        additionalProperties: false,
      },
    },
    upload: {
      type: 'object',
      properties: {
        youtubeTitle: { type: 'string' },
        youtubeDescription: { type: 'string' },
        instagram: { type: 'string' },
        tiktok: { type: 'string' },
        threads: { type: 'string' },
        facebook: { type: 'string' },
        hashtags: { type: 'array', items: { type: 'string' }, maxItems: 10 },
      },
      required: ['youtubeTitle', 'youtubeDescription', 'instagram', 'tiktok', 'threads', 'facebook', 'hashtags'],
      additionalProperties: false,
    },
  },
  required: ['title', 'scenes', 'upload'],
  additionalProperties: false,
};

/**
 * 자막 정리: 별표 강조는 처음 한 쌍만, 별표 뺀 글자 수가 max 를 넘으면 낱말 경계에서 자릅니다.
 * AI 대본(normalizeListingResult)은 max=Infinity 로 불러 자르지 않습니다 — 문장 중간에서 끊긴 자막이 영상에 그대로 들어가지 않게
 * 원문을 두고 길다고 표시만 합니다(③ 목록 빨간 글자 수 + 상태 안내).
 */
export function tidyCaption(text, max = CAPTION_MAX) {
  let s = String(text ?? '').replace(/\s+/g, ' ').trim();
  // 강조 한 쌍만 남기기
  let emph = null; // [시작, 끝) — 별표 뺀 글 기준
  let plain = '';
  let open = -1;
  let used = false;
  for (const ch of s) {
    if (ch === '*') {
      if (used) continue;
      if (open < 0) open = plain.length;
      else { if (plain.length > open) { emph = [open, plain.length]; used = true; } open = -1; }
      continue;
    }
    plain += ch;
  }
  // 별표만 빠진 자리의 겹친 공백·앞뒤 공백 정리(강조 위치도 같이 옮김)
  const lead = plain.length - plain.trimStart().length;
  plain = plain.trim();
  if (emph) emph = [Math.max(0, emph[0] - lead), Math.min(plain.length, emph[1] - lead)];
  if (emph) {
    while (emph[0] < emph[1] && plain[emph[0]] === ' ') emph[0]++;
    while (emph[1] > emph[0] && plain[emph[1] - 1] === ' ') emph[1]--;
    if (emph[0] >= emph[1]) emph = null;
  }
  if (plain.length > max) {
    let cut = plain.lastIndexOf(' ', max);
    if (cut < Math.floor(max * 0.6)) cut = max; // 띄어쓰기가 너무 앞이면 그냥 자름
    plain = plain.slice(0, cut).replace(/[\s,.·、]+$/, '');
    if (emph && emph[1] > plain.length) emph = null;
  }
  if (!emph) return plain;
  return `${plain.slice(0, emph[0])}*${plain.slice(emph[0], emph[1])}*${plain.slice(emph[1])}`;
}

/** 별표 뺀 글자 수 */
export const captionLength = (s) => String(s || '').replace(/\*/g, '').length;

const str = (v, max) => String(v ?? '').replace(/\r\n?/g, '\n').trim().slice(0, max);

/**
 * AI 응답 → 화면에서 바로 쓸 모양. 범위 밖 photo·빈 장면은 버리고, 자막은 길이·강조를 정리합니다.
 * @returns {{ title: string, scenes: {photo: number, caption: string, narration: string}[], narration: string, upload: object }}
 */
export function normalizeListingResult(data, photoCount) {
  let obj = data;
  if (typeof obj === 'string') {
    try { obj = JSON.parse(obj.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); } catch { obj = {}; }
  }
  obj = obj && typeof obj === 'object' ? obj : {};
  const n = Math.max(0, Number.parseInt(photoCount, 10) || 0);
  const scenes = [];
  for (const raw of Array.isArray(obj.scenes) ? obj.scenes : []) {
    if (!raw || typeof raw !== 'object') continue;
    const photo = Number(raw.photo);
    if (!Number.isInteger(photo) || photo < 0 || photo >= n) continue; // 없는 사진 번호 → 엉뚱한 사진에 설명이 붙지 않게 버림
    const narration = str(raw.narration, 400).replace(/\*/g, '').replace(/\s+/g, ' ');
    // 자막은 자르지 않습니다(끝맺지 못한 문장이 영상에 들어가지 않게). 너무 길면 long 표시만 — 화면이 줄여 달라고 알립니다.
    let caption = tidyCaption(str(raw.caption, 200), Infinity);
    if (!caption && narration) caption = tidyCaption(narration, Infinity);
    if (!caption) continue; // 빈 장면
    scenes.push({ photo, caption, narration: narration || caption.replace(/\*/g, ''), long: captionLength(caption) > CAPTION_MAX });
    if (scenes.length >= 60) break;
  }
  if (!scenes.length) throw new Error('AI 응답에 쓸 수 있는 장면이 없습니다. 다시 시도해 보세요.');

  const u = obj.upload && typeof obj.upload === 'object' ? obj.upload : {};
  const seen = new Set();
  const hashtags = [];
  for (const t of Array.isArray(u.hashtags) ? u.hashtags : []) {
    const tag = String(t ?? '').replace(/\s+/g, '').replace(/^#+/, '');
    if (!tag || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    hashtags.push('#' + tag.slice(0, 40));
    if (hashtags.length >= 15) break;
  }
  const upload = {
    youtubeTitle: str(u.youtubeTitle, 100).replace(/\s+/g, ' '),
    youtubeDescription: str(u.youtubeDescription, 2000),
    instagram: str(u.instagram, 2000),
    tiktok: str(u.tiktok, 1000),
    threads: str(u.threads, 500),
    facebook: str(u.facebook, 2000),
    hashtags,
  };
  const title = str(obj.title, 80).replace(/\\n/g, '\n');
  return {
    title,
    scenes,
    narration: scenes.map((s) => s.narration).join('\n'),
    upload,
    // 화면 안내용: 길이를 넘긴 자막 수, 과장·단정으로 보일 수 있는 말(자동으로 고치지 않음)
    longCount: scenes.filter((s) => s.long).length,
    banned: findBannedWords(title, scenes.map((s) => [s.caption, s.narration]), Object.values(upload)),
  };
}

/**
 * 업로드 설명 끝에 붙일 중개대상물 표시·광고 필수 항목 줄들 — 사용자가 적은 것만.
 * 중개사무소(명칭·소재지·연락처·등록번호·개업공인중개사 성명) + 매물(소재지·면적·가격·종류·거래 형태·층수 등).
 * facts 가 글(문자열)이면 항목을 알 수 없으므로 매물 줄은 넣지 않습니다.
 */
export function disclosureLines(office, facts) {
  const lines = [];
  const of = officeOf(office);
  for (const f of OFFICE_FIELDS) if (of[f.key]) lines.push(`${f.label}: ${of[f.key]}`);
  if (facts && typeof facts === 'object') {
    for (const f of FACT_FIELDS) {
      if (f.disclose === false) continue;
      const v = clean(facts[f.key]);
      if (v) lines.push(`${f.key === 'location' ? '매물 소재지' : f.label}: ${v}`);
    }
  }
  return lines;
}
