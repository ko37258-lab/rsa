// 따라하기(레시피) 모드의 「AI 로 사진에 맞춰 대본 다듬기」 — 프롬프트·JSON 스키마·결과 정리를 한곳에 둡니다.
// 사례의 장면 수·순서·역할(훅·마무리)·도장·태그는 그대로 두고, 바뀐 사진에 맞춰 자막(caption)과 읽을 문장(narration)만 새로 받습니다.
// 사실·금지어·자막 길이 규칙은 매물 대본(listing-prompt.js)과 같은 문장을 가져다 쓰고, 사례 특성만 덧붙입니다.
// 이 파일은 키·사진을 다루지 않습니다(llm.js 가 보냄). 문구를 고치려면 여기만 고치면 됩니다.

import {
  BANNED_WORDS, CAPTION_MIN, CAPTION_MAX, ASPECT_WORDS, tidyCaption, captionLength, findBannedWords, factLines, officeOf,
} from './listing-prompt.js';

const clean = (v, max = 120) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const KIND_WORD = { hook: '훅', cta: '마무리', answer: '정답·결론' };

/**
 * 다듬기 프롬프트.
 * @param {object} o
 * @param {string} o.caseName         사례 이름
 * @param {string} o.categoryLabel    용도 라벨(매물·브랜드·가맹 …)
 * @param {Array<object>} o.scenes    지금 장면(순서 그대로). { kind, caption, narration, stamp, tag, label, counter, img, sample, extra, photo }
 *                                    photo = 보낸 사진 번호(0부터, 없으면 null). sample = 예시 사진 그대로. extra = 사진이 남아 새로 더한 장면.
 * @param {object|string} [o.facts]   사용자가 적은 매물 사실(매물 상자 ②)
 * @param {object} [o.office]         중개사무소 정보
 * @param {{name?: string, hint?: string}} [o.style]
 * @param {string} [o.aspect]
 * @param {string} [o.brand]          채널·상호 이름
 */
export function buildRecipePrompt({ caseName, categoryLabel, scenes = [], facts, office, style, aspect = '9:16', brand = '' } = {}) {
  const lines = factLines(facts);
  const of = officeOf(office);
  const contact = [of.name && `상호 ${of.name}`, of.phone && `연락처 ${of.phone}`].filter(Boolean).join(', ');
  const styleName = clean(style?.name, 60);
  const styleHint = clean(style?.hint, 600);
  const shape = ASPECT_WORDS[aspect] || ASPECT_WORDS['9:16'];
  const photoCount = scenes.filter((s) => Number.isInteger(s.photo)).length;

  const sceneLines = scenes.map((s, i) => {
    const bits = [];
    if (KIND_WORD[s.kind]) bits.push(`[${KIND_WORD[s.kind]}]`);
    if (Number.isInteger(s.photo)) bits.push(`사진 ${s.photo}${s.extra ? ' · 새로 추가한 사진' : ''}`);
    else if (s.img && s.sample) bits.push('예시 사진 그대로 — 사진을 보내지 않음');
    else if (!s.img) bits.push('글자 장면');
    if (s.stamp) bits.push(`도장 "${clean(s.stamp, 10)}"`);
    if (s.tag) bits.push(`태그 "${clean(s.tag, 12)}"`);
    if (s.label) bits.push(`라벨 "${clean(s.label, 12)}"`);
    if (s.counter) bits.push(`숫자 ${s.counter.from}→${s.counter.to}${s.counter.suffix || ''}`);
    const cap = clean(s.caption, 80);
    const nar = clean(s.narration, 200);
    const text = cap ? `자막 "${cap}"${nar ? ` / 읽을 문장 "${nar}"` : ''}` : '(자막 없음 — 사진을 보고 새로 쓴다)';
    return `- 장면 ${i + 1} ${bits.join(' · ')}: ${text}`;
  });

  return `너는 부동산 광고 쇼츠의 대본 작가다.
채널: ${clean(brand, 60) || 'MR.K 고상철'} — 28년간 부동산공법을 가르친 "공법의 신" 고상철 톤. 말투는 쉽고 명쾌하고 믿음직하다.
이 영상은 광고 사례 「${clean(caseName, 40)}」(${clean(categoryLabel, 20) || '광고'})를 따라 만든 것이다. 사용자가 사례의 예시 사진을 자기 사진으로 바꿨으니, 바뀐 사진에 맞게 글만 다듬는다.
영상 모양: ${shape}
${styleName ? `영상 스타일: ${styleName}${styleHint ? ` — ${styleHint}` : ''}\n` : ''}장면 수: ${scenes.length}개(바꾸지 않는다)

지금 장면(순서 그대로):
${sceneLines.join('\n')}
사진: ${photoCount}장. 번호는 보낸 순서대로 0부터 ${Math.max(0, photoCount - 1)}까지(사진 앞에 "사진 0:" 같은 번호가 붙어 있을 수 있다). 위 "사진 n"이 그 장면의 사진이다.

사용자가 적은 사실(이것만 사실로 말한다):
${lines.length ? lines.map((l) => `- ${l}`).join('\n') : '- (적은 사실 없음 — 사진에 보이는 것만 말한다)'}
${contact ? `문의처: ${contact}\n` : ''}
규칙
- 장면 수·순서·역할(훅·마무리)·도장·태그·라벨·숫자는 그대로 두고 caption(자막)과 narration(읽을 문장)만 바꾼다. 응답의 index 는 위 장면 번호 - 1(0부터).
- 사진이 바뀐 장면은 그 사진에 실제로 보이는 것에 맞게 쓴다. 예시 사진 그대로인 장면은 원래 글을 두거나 사진 묘사만 뺀다. 글자 장면은 원래 글을 다듬기만 한다.
- 자막은 공백 포함 ${CAPTION_MIN}~${CAPTION_MAX}자 한국어 한 문장(사례 자막의 리듬·길이를 따른다). 가장 중요한 단어 하나만 *별표*로 감쌀 수 있다(2개 이상 금지).
- 읽을 문장은 자연스러운 구어체 1~2문장(장면당 약 3~6초 분량). 자막을 그대로 읽지 말고 조금 풀어서 말한다. 별표를 쓰지 않는다.
- 사진에 보이는 것과 위에 적힌 사실만 말한다. 가격·면적·층수·준공(사용승인)연도·방 수·관리비·역까지 거리·학군·용도지역은 위에 없으면 쓰지 않는다. 사례의 숫자도 예시이므로 적힌 사실이 없으면 숫자를 빼고 쓴다.
- 과장·단정 표현을 쓰지 않는다: ${BANNED_WORDS.map((w) => `"${w}"`).join(', ')} 같은 말 금지. 투자 수익·시세 상승을 약속하지 않는다. 후기는 동의받은 익명 후기만.
- 사진에서 확실하지 않은 것(채광·전망·새 가전 여부)은 "~로 보입니다"처럼 조심스럽게 말하거나 빼고 말한다.
- title: 사례 제목에 사실과 어긋나는 숫자가 있을 때만 2줄 이내(줄바꿈은 \\n, 핵심어 하나를 *별표*)로 새로 쓰고, 아니면 빈 글.
- upload.description: 2~4문장 설명. upload.hashtags: 5~10개, # 포함, 지역·종류 위주(적힌 사실 범위 안에서). 중개사무소 정보·필수 표시 항목은 앱이 따로 붙이므로 쓰지 않는다.
다른 말 없이 JSON 만 출력한다.`;
}

/** 다듬기 JSON 스키마(기본형 — llm.js schemaFor 가 서비스별로 바꿔 보냄) */
export const RECIPE_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: '바꿀 필요가 없으면 빈 글. 바꾸면 2줄 이내, 핵심어 하나를 *별표*로' },
    scenes: {
      type: 'array',
      description: '장면마다 하나. 장면 수·순서는 보낸 그대로',
      minItems: 1,
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer', minimum: 0, description: '장면 번호(0부터, 보낸 순서)' },
          caption: { type: 'string', minLength: CAPTION_MIN, maxLength: CAPTION_MAX, description: '화면 자막 한 문장, *강조* 1개 이내' },
          narration: { type: 'string', description: '읽어 줄 말, 자연스러운 구어체 1~2문장' },
        },
        required: ['index', 'caption', 'narration'],
        additionalProperties: false,
      },
    },
    upload: {
      type: 'object',
      properties: {
        description: { type: 'string' },
        hashtags: { type: 'array', items: { type: 'string' }, maxItems: 10 },
      },
      required: ['description', 'hashtags'],
      additionalProperties: false,
    },
  },
  required: ['title', 'scenes', 'upload'],
  additionalProperties: false,
};

const str = (v, max) => String(v ?? '').replace(/\r\n?/g, '\n').trim().slice(0, max);

function parseObj(data) {
  let obj = data;
  if (typeof obj === 'string') {
    try { obj = JSON.parse(obj.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); } catch { obj = {}; }
  }
  return obj && typeof obj === 'object' ? obj : {};
}

function cleanTags(list) {
  const seen = new Set();
  const out = [];
  for (const t of Array.isArray(list) ? list : []) {
    const tag = String(t ?? '').replace(/\s+/g, '').replace(/^#+/, '');
    if (!tag || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    out.push('#' + tag.slice(0, 40));
    if (out.length >= 15) break;
  }
  return out;
}

/**
 * AI 응답 → 적용 목록. index 가 범위 밖이거나 자막이 빈 장면은 버립니다.
 * 자막은 자르지 않고(끝맺지 못한 문장이 영상에 들어가지 않게) 길면 long 표시만 합니다(normalizeListingResult 와 같은 태도).
 * @param {object|string} data   AI 가 준 JSON(또는 글)
 * @param {number} sceneCount    보낸 장면 수
 * @returns {{ changes: Map<number, {caption: string, narration: string, long: boolean}>, title: string, upload: {description: string, hashtags: string[]}, longCount: number, banned: string[] }}
 */
export function normalizeRecipeResult(data, sceneCount) {
  const obj = parseObj(data);
  const n = Math.max(0, Number.parseInt(sceneCount, 10) || 0);
  const changes = new Map();
  for (const raw of Array.isArray(obj.scenes) ? obj.scenes : []) {
    if (!raw || typeof raw !== 'object') continue;
    const i = Number(raw.index);
    if (!Number.isInteger(i) || i < 0 || i >= n) continue; // 없는 장면 번호 → 엉뚱한 장면에 글이 붙지 않게 버림
    const narration = str(raw.narration, 400).replace(/\*/g, '').replace(/\s+/g, ' ');
    let caption = tidyCaption(str(raw.caption, 200), Infinity);
    if (!caption && narration) caption = tidyCaption(narration, Infinity);
    if (!caption) continue;
    changes.set(i, { caption, narration: narration || caption.replace(/\*/g, ''), long: captionLength(caption) > CAPTION_MAX });
  }
  if (!changes.size) throw new Error('AI 응답에 쓸 수 있는 장면이 없습니다. 다시 시도해 보세요.');
  const u = obj.upload && typeof obj.upload === 'object' ? obj.upload : {};
  const upload = { description: str(u.description, 2000), hashtags: cleanTags(u.hashtags) };
  const title = str(obj.title, 80).replace(/\\n/g, '\n');
  const vals = [...changes.values()];
  return {
    changes,
    title,
    upload,
    longCount: vals.filter((c) => c.long).length,
    // 화면 안내용: 과장·단정으로 보일 수 있는 말(자동으로 고치지 않음)
    banned: findBannedWords(title, vals.map((c) => [c.caption, c.narration]), upload.description),
  };
}
