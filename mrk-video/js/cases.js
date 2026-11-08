// 따라하기 사례(레시피) 변환 모듈 — js/cases-data.js 의 사례 하나를 그릴 수 있는 프로젝트·대본·업로드 글로 바꿉니다.
// 사례 화면의 갤러리(살아 있는 미리보기)와 숏폼 화면의 레시피 모드가 **같은 함수**를 import 해서 쓰므로,
// "이대로 따라하기" 결과와 갤러리 미리보기가 어긋나지 않습니다. 이 파일은 DOM 을 직접 만지지 않습니다
// (예시 사진을 받을 때만 samples.js 의 sample() 을 부르고, images 맵으로 사진을 다 넘기면 node 에서도 돌아갑니다 — tests/check-cases.mjs).
//
// ── API ─────────────────────────────────────────────────────────────────
// CASE_DATA, CASE_CATEGORIES, findCase(id)      cases-data.js 를 그대로 다시 내보냄
// categoryOf(c) → { id, label }                  사례의 용도(없는 id 면 { id, label: id })
// casesByCategory(id) → 사례 배열                 'all' 이면 전부
// caseSlots(c) → [{ no, hint, img, targets: [{ sceneIndex, key: 'img'|'img2' }] }]
//     사진 자리 목록(번호 순). 같은 예시 사진 id(또는 같은 slot 번호)를 쓰는 장면은 한 자리 — 사용자 사진 한 장이 그 장면들에 모두 들어갑니다.
//     비포애프터처럼 img2 가 있는 장면은 img 자리와 img2 자리가 따로(key 로 구분).
// casePhotoCount(c) → 자리 수,  caseSeconds(c) → 총 길이(장면 합 + 엔딩, 초)
// caseToProject(c, { images, office, defaults, newScene }) → Promise<project>
//     사례 → 프로젝트 객체. 스타일 visual 을 입힌 뒤(styles.js styleProject) 사례 비율·제목·채널·brand·엔딩(cta 포함)·장면·음악을 채웁니다.
//     images: { [예시 사진 id]: HTMLImageElement } — 있으면 그 사진을 쓰고(sample:false), 없으면 samples.js 의 sample(id) 로 예시 사진(sample:true).
//     office:  { name, phone, address, regNo, agent } — 상호가 있으면 채널·brand·엔딩 부제('{office}' 자리표시)에 들어갑니다. 없으면 사례 channel → 'MR.K 고상철'.
//     defaults: 프로젝트 기본값(shorts.js 의 DEFAULTS 등). BASE_VISUAL 위에 덮고 그 위에 스타일을 입힙니다.
//     newScene: (img, caption, extra) => scene — shorts.js 의 api.newScene 을 넘기면 그쪽 id 규칙을 따릅니다. 없으면 자체 간이 장면.
//     장면에는 narration·kind·duration·hint·slot(·slot2)·sample 과 장식 필드(tag·label·labelA·labelB·vsLabel·stamp·counter·img2)가 그대로 들어갑니다.
//     돌려주는 프로젝트의 음악은 styleMusic(shorts.js 가 읽는 이름)과 musicMood(같은 값, 설명용) 두 이름으로 들어 있습니다.
// caseScript(c) → [{ index, label, kind, slot, hint, caption, narration, meta: [...], duration, text }]
//     "대본 보기"용 줄 목록. 마지막 줄은 엔딩(label '엔딩'). text 는 한 줄로 합친 글(복사용).
// caseScriptText(c) → 대본 전체를 글 한 덩이로
// caseUpload(c, office) → { title, description, hashtags, disclosure: [...], text }
//     업로드 글. 매물 사례(category 'listing')는 listing-prompt.js 의 disclosureLines(office) 표시·광고 필수 항목이 뒤에 붙습니다(적은 사무소 항목만).
// caseUploadInfo(c, office) → { source: 'listing'|'recipe', title, description, hashtags, platforms: {}, disclosure }
//     shorts.js 의 api.setUploadInfo() 에 바로 넣는 모양.
// fillOffice(text, office, fallback) → '{office}' '{name}' '{phone}' 자리표시 치환
// endingFor(c, office) → { enabled, text, sub, cta, duration }
// BASE_VISUAL, DEFAULT_CHANNEL                   갤러리·시트가 쓰는 기본 시각값과 기본 채널 이름
// ────────────────────────────────────────────────────────────────────────

import { CASE_DATA, CASE_CATEGORIES, findCase } from './cases-data.js';
import { SAMPLES, sample } from './samples.js';
import { findStyle, styleProject } from './styles.js';
import { disclosureLines } from './listing-prompt.js';

export { CASE_DATA, CASE_CATEGORIES, findCase };

/** 스타일을 입히기 전의 기본 시각값(showcase.js baseProject 와 같은 값) */
export const BASE_VISUAL = {
  aspect: '9:16', template: 'band', font: '900', captionSize: 68, captionStyle: 'outline', captionAnim: 'none', overlay: 'none',
  motion: 'auto', transition: 'fade', titleMode: 'band', textColor: '#ffffff', highlightColor: '#ffd43b', bandColor: '#0b0d14',
  panelColor: '#ffffff', inkColor: '#111111', showProgress: true,
};

export const DEFAULT_CHANNEL = 'MR.K 고상철';

/** 장면에서 장식·설명 필드를 그대로 옮길 때 쓰는 키 목록(없는 것은 넣지 않음) */
const SCENE_COPY_KEYS = ['tag', 'label', 'labelA', 'labelB', 'vsLabel', 'stamp'];

const clean = (v) => String(v ?? '').trim();

export function categoryOf(c) {
  const id = c?.category || '';
  return CASE_CATEGORIES.find((k) => k.id === id) || { id, label: id };
}

export function casesByCategory(id = 'all') {
  return id === 'all' || !id ? [...CASE_DATA] : CASE_DATA.filter((c) => c.category === id);
}

/** '{office}'(상호 + 연락처) '{name}' '{phone}' 자리표시를 사무소 정보로 바꿉니다. 비어 있으면 fallback(채널 이름). */
export function fillOffice(text, office = {}, fallback = DEFAULT_CHANNEL) {
  const name = clean(office?.name);
  const phone = clean(office?.phone);
  const line = [name, phone].filter(Boolean).join(' ') || fallback;
  return String(text ?? '')
    .replaceAll('{office}', line)
    .replaceAll('{name}', name || fallback)
    .replaceAll('{phone}', phone);
}

/** 사례의 엔딩 → 프로젝트 ending. 상호가 있으면 부제는 "상호 전화"(매물 상자 applyOfficeBrand 와 같은 규칙), 없으면 자리표시 치환. */
export function endingFor(c, office = {}, fallback = DEFAULT_CHANNEL) {
  const e = c.ending || {};
  const name = clean(office?.name);
  const sub = name ? [name, clean(office.phone)].filter(Boolean).join(' ') : fillOffice(e.sub, office, fallback);
  return { enabled: true, text: e.text || '', sub, cta: e.cta || '', duration: Number(e.duration) > 0 ? Number(e.duration) : 2.8 };
}

/** 사례 채널 이름: 상호 → 사례 channel → 기본값 */
export function channelFor(c, office = {}, defaults = {}) {
  return clean(office?.name) || clean(c.channel) || clean(defaults.channel) || DEFAULT_CHANNEL;
}

/**
 * 사진 자리 목록. slot 번호가 있으면 그 번호로, 없으면 "처음 나온 예시 사진 id 순서"로 번호를 매깁니다.
 * 같은 번호(= 같은 사진)를 쓰는 장면들은 targets 에 함께 들어가 사용자 사진 한 장을 공유합니다.
 */
export function caseSlots(c) {
  const byNo = new Map();
  const noById = new Map();
  let next = 1;
  const numberFor = (explicit, imgId) => {
    if (explicit != null) { if (imgId && !noById.has(imgId)) noById.set(imgId, explicit); return explicit; }
    if (imgId && noById.has(imgId)) return noById.get(imgId);
    const n = next++;
    if (imgId) noById.set(imgId, n);
    return n;
  };
  (c.scenes || []).forEach((sc, sceneIndex) => {
    if (sc.img) {
      const no = numberFor(sc.slot ?? null, sc.img);
      next = Math.max(next, no + 1);
      const slot = byNo.get(no) || { no, hint: sc.hint || SAMPLES[sc.img]?.caption || '', img: sc.img, targets: [] };
      slot.targets.push({ sceneIndex, key: 'img' });
      byNo.set(no, slot);
    }
    if (sc.img2) {
      const no = numberFor(sc.slot2 ?? null, sc.img2);
      next = Math.max(next, no + 1);
      const slot = byNo.get(no) || { no, hint: sc.hint2 || SAMPLES[sc.img2]?.caption || '후', img: sc.img2, targets: [] };
      slot.targets.push({ sceneIndex, key: 'img2' });
      byNo.set(no, slot);
    }
  });
  return [...byNo.values()].sort((a, b) => a.no - b.no);
}

export const casePhotoCount = (c) => caseSlots(c).length;

export const caseSeconds = (c) => {
  const scenes = (c.scenes || []).reduce((a, s) => a + (Number(s.duration) || 3), 0);
  return Math.round((scenes + (Number(c.ending?.duration) || 0)) * 10) / 10;
};

let plainId = 0;
/** 간이 장면(shorts.js 의 newScene 을 넘기지 않았을 때 — 갤러리 미리보기·시트용) */
function plainScene(img, caption, extra = {}) {
  plainId += 1;
  return { id: `case-${plainId}`, img, caption, duration: 3, kind: 'normal', ...extra };
}

/** 사례 장면 하나 → 프로젝트 장면. 사진은 images 맵 → 없으면 예시 사진(sample:true). */
async function buildScene(sc, { images, newScene }) {
  const own = sc.img ? images[sc.img] || null : null;
  const own2 = sc.img2 ? images[sc.img2] || null : null;
  const img = sc.img ? own || await sample(sc.img) : null;
  const img2 = sc.img2 ? own2 || await sample(sc.img2) : null;
  const isSample = (!!sc.img && !own) || (!!sc.img2 && !own2);
  const extra = {
    narration: sc.narration || '',
    duration: Number(sc.duration) > 0 ? Number(sc.duration) : 3,
    kind: sc.kind || 'normal',
    hint: sc.hint || (sc.img && SAMPLES[sc.img]?.caption) || '',
    slot: sc.slot ?? null,
    sample: isSample,
  };
  if (sc.slot2 != null) extra.slot2 = sc.slot2;
  if (sc.hint2) extra.hint2 = sc.hint2;
  if (img2) extra.img2 = img2;
  if (sc.counter && typeof sc.counter === 'object') extra.counter = { ...sc.counter };
  for (const k of SCENE_COPY_KEYS) if (sc[k] != null && sc[k] !== '') extra[k] = sc[k];
  return newScene(img, sc.caption || '', extra);
}

/**
 * 사례 → 프로젝트 객체. 순서: 기본값 → 스타일 visual → 사례 비율·제목·채널·brand·엔딩 → 장면 → 음악.
 * 갤러리는 그 결과를 drawFrame 에 바로 넘기고, 레시피 모드는 같은 결과를 project 에 복사합니다.
 */
export async function caseToProject(c, { images = {}, office = {}, defaults = {}, newScene = plainScene } = {}) {
  if (!c) throw new Error('사례 데이터가 없습니다.');
  const style = findStyle(c.style);
  if (!style) throw new Error(`사례 「${c.name || c.id}」의 스타일 '${c.style}' 이 styles-data.js 에 없습니다.`);
  const channel = channelFor(c, office, defaults);
  const base = {
    ...BASE_VISUAL,
    ...defaults,
    title: c.title || '',
    channel,
    brand: { name: clean(office?.name), phone: clean(office?.phone), sub: clean(office?.sub) },
    ending: endingFor(c, office, channel),
    logo: defaults.logo ?? null,
    scenes: [],
  };
  const p = styleProject(base, style); // 복사 뒤 visual 입힘(장면·소리 등은 그대로)
  if (c.visual && typeof c.visual === 'object') Object.assign(p, c.visual); // 사례가 스타일 위에 덮는 시각값(되도록 비워 둠)
  p.aspect = c.aspect || p.aspect;
  p.style = c.style;
  p.styleMusic = c.music || 'auto'; // shorts.js 가 읽는 이름('auto' = 스타일 추천 분위기)
  p.musicMood = c.music || ''; // 같은 값 — 사례 설명·시트용
  p.caseId = c.id;
  const scenes = [];
  for (const sc of c.scenes || []) scenes.push(await buildScene(sc, { images, newScene }));
  p.scenes = scenes;
  return p;
}

const KIND_LABEL = { hook: '훅', normal: '본문', answer: '답', cta: '마무리' };

/** "대본 보기"용 줄 목록. meta 에는 도장·태그·라벨·숫자·길이가 들어갑니다. */
export function caseScript(c) {
  const slots = caseSlots(c);
  const slotOf = (sceneIndex, key) => slots.find((s) => s.targets.some((t) => t.sceneIndex === sceneIndex && t.key === key));
  const lines = (c.scenes || []).map((sc, i) => {
    const kind = sc.kind || 'normal';
    const s1 = slotOf(i, 'img');
    const s2 = slotOf(i, 'img2');
    const slotText = s1 ? (s2 ? `자리 ${s1.no}·${s2.no}` : `자리 ${s1.no}`) : '글자 장면';
    const hint = s1 ? (s2 ? `${s1.hint} / ${s2.hint}` : s1.hint) : '';
    const meta = [];
    if (sc.stamp) meta.push(`도장 ${sc.stamp}`);
    if (sc.tag) meta.push(`태그 ${sc.tag}`);
    if (sc.label) meta.push(`라벨 ${sc.label}`);
    if (sc.labelA || sc.labelB) meta.push(`좌우 ${sc.labelA || ''}/${sc.labelB || ''}`);
    if (sc.counter) meta.push(`숫자 ${sc.counter.from}→${sc.counter.to}${sc.counter.suffix || ''}`);
    meta.push(`${sc.duration}초`);
    const label = `장면 ${i + 1} · ${KIND_LABEL[kind] || kind}`;
    const text = `${label} (${slotText}${hint ? ` · ${hint}` : ''}) ${sc.caption.replace(/\n/g, ' ')}` + (sc.narration ? ` / 읽기: ${sc.narration}` : '') + (meta.length ? ` [${meta.join(' · ')}]` : '');
    return { index: i, label, kind, slot: s1 ? s1.no : null, slot2: s2 ? s2.no : null, hint, caption: sc.caption, narration: sc.narration || '', meta, duration: sc.duration, text };
  });
  const e = c.ending || {};
  const meta = [];
  if (e.cta) meta.push(`버튼 「${e.cta}」`);
  meta.push(`${e.duration ?? 2.8}초`);
  lines.push({
    index: lines.length, label: '엔딩', kind: 'ending', slot: null, slot2: null, hint: '', caption: e.text || '', narration: '', meta, duration: e.duration ?? 2.8,
    text: `엔딩 ${String(e.text || '').replace(/\n/g, ' ')}${e.sub ? ` — ${e.sub}` : ''} [${meta.join(' · ')}]`,
  });
  return lines;
}

export const caseScriptText = (c) => caseScript(c).map((l) => l.text).join('\n');

const plainTitle = (t) => String(t ?? '').replace(/\*/g, '').replace(/\n/g, ' ').trim();

/** 업로드 글(설명 + 해시태그 + 매물이면 표시·광고 필수 항목). text 가 바로 붙여 넣을 글입니다. */
export function caseUpload(c, office = {}) {
  const listing = c.category === 'listing';
  const description = c.upload?.desc || '';
  const hashtags = [...(c.upload?.hashtags || [])];
  const disclosure = listing ? disclosureLines(office || {}, {}) : [];
  const parts = [plainTitle(c.title), description, hashtags.join(' ')];
  if (disclosure.length) parts.push(disclosure.join('\n'));
  return { title: plainTitle(c.title), description, hashtags, disclosure, text: parts.filter(Boolean).join('\n\n') };
}

/** shorts.js api.setUploadInfo() 모양. 매물 사례는 source 'listing' 으로 매물 글 규칙(표시 항목 경고)을 탑니다. */
export function caseUploadInfo(c, office = {}) {
  const u = caseUpload(c, office);
  const listing = c.category === 'listing';
  return { source: listing ? 'listing' : 'recipe', title: u.title, description: u.description, hashtags: u.hashtags, platforms: {}, disclosure: listing ? u.disclosure : undefined };
}

/** 사례 화면 "넣는 것" 한 줄(데이터에 없으면 자리·장면·길이로 만듦) */
export function caseInputLine(c) {
  return c.inputLine || `사진 ${casePhotoCount(c)}장 · 장면 ${(c.scenes || []).length}개 · 약 ${Math.round(caseSeconds(c))}초`;
}
