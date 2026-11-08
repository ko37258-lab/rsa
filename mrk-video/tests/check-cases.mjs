// 따라하기 사례·광고 스타일 데이터 점검(브라우저 없이 node 로).
//   node tests/check-cases.mjs
// 점검 항목
//  사례(js/cases-data.js): id 고유·형식, category·aspect·platforms 값, style id 존재, music id 존재, img/img2 가 SAMPLES 에 있음,
//    slot 번호(같은 사진 = 같은 번호, 1부터 빈틈 없이), 장면 6~8(첫 hook·끝 cta), 총 길이 21~30초, 자막 ≤ CAPTION_MAX(32)자·*강조* 정확히 1쌍·2줄 이내,
//    읽을 문장 ≤70자·별표 없음, 제목·엔딩 강조 1·엔딩 ≥2.5초·cta 있음, 금지어(listing-prompt findBannedWords + '확실'), tag ≤7자·stamp ≤6자,
//    장식이 요구하는 장면 필드(price·date·ribbon → tag, pin·comment → label, counter → counter, vs → img2, stamp → scene.stamp), 해시태그 6~8개, 설명 2~3문장,
//    extraScene 틀, 매물 사례의 표시·광고 메모와 {office} 엔딩, cases.js 변환(caseSlots·caseToProject·caseScript·caseUpload)이 돌아가는지.
//  스타일(js/styles-data.js): id 고유, VISUAL 값이 어휘 계약 안에 있는지(template·captionAnim·captionStyle·overlay·transition·motion·titleMode·photoIn·photoFit·deco·titleAnim·extras·fx),
//    색 hex, ad/adFor 형식, template×captionAnim×overlay 조합 고유, music id, 샘플 자막 ≤35자·강조 1, 샘플 img 가 SAMPLES 에 있음, 장식이 요구하는 샘플 필드.
// 모두 통과하면 종료 코드 0, 문제가 있으면 목록을 찍고 1.

import { CASE_DATA, CASE_CATEGORIES } from '../js/cases-data.js';
import { STYLE_DATA } from '../js/styles-data.js';
import { MOODS } from '../js/music.js';
import { findBannedWords, captionLength, CAPTION_MAX } from '../js/listing-prompt.js';
import { SAMPLES } from '../js/samples.js';
import { caseSlots, caseToProject, caseScript, caseUpload, caseUploadInfo, caseSeconds, casePhotoCount } from '../js/cases.js';

// ── 어휘 계약(엔진 js/shorts-render.js 와 맞춘 이름·값) ──
const VOCAB = {
  aspect: ['9:16', '1:1', '16:9'],
  template: ['band', 'blur', 'full', 'split', 'card', 'dark'],
  captionAnim: ['none', 'words', 'karaoke', 'type', 'pop', 'bounce', 'scale', 'slide', 'wave', 'flash'],
  captionStyle: ['outline', 'box', 'plain', 'pill', 'neon', 'shadow3d', 'marker', 'glass', 'tag', 'underline', 'gradient', 'bubble'],
  overlay: ['none', 'news', 'warning', 'steps', 'number', 'check', 'pin', 'price', 'quote', 'quiz', 'ticker', 'date', 'comment', 'vs', 'counter', 'dots', 'lower3', 'stamp', 'ribbon'],
  transition: ['fade', 'slide', 'zoom', 'none', 'wipe', 'flash', 'push'],
  motion: ['auto', 'in', 'out', 'none'],
  titleMode: ['band', 'hook', 'none'],
  font: ['700', '800', '900'],
  photoIn: ['none', 'push', 'reveal', 'pop', 'iris'],
  photoFit: ['cover', 'smart'],
  deco: ['sweep', 'bars', 'bokeh', 'frame'],
  titleAnim: ['none', 'rise', 'mask', 'stamp'],
  fx: ['none', 'ad'],
};
VOCAB.extras = VOCAB.overlay.filter((o) => o !== 'none');
const COLOR_KEYS = ['bandColor', 'panelColor', 'textColor', 'inkColor', 'highlightColor'];
const VISUAL_KEYS = new Set([...Object.keys(VOCAB).filter((k) => k !== 'extras'), 'extras', ...COLOR_KEYS, 'captionSize', 'showProgress']);
const AD_FOR = ['listing', 'brand', 'course', 'consult', 'proof', 'event'];
const PLATFORMS = new Set(['youtube', 'instagram', 'tiktok', 'facebook', 'threads']);
const CATS = new Set(CASE_CATEGORIES.map((k) => k.id));
const EXTRA_BANNED = ['확실'];
// 장식 → 요구하는 장면 필드. all=모든 장면, some=한 장면 이상, hook=첫 장면
const NEEDS = {
  price: { field: 'tag', where: 'all' }, date: { field: 'tag', where: 'all' }, ribbon: { field: 'tag', where: 'all' },
  pin: { field: 'label', where: 'all' }, comment: { field: 'label', where: 'some' },
  counter: { field: 'counter', where: 'some' }, vs: { field: 'img2', where: 'hook' }, stamp: { field: 'stamp', where: 'some' },
};

const styleIds = new Set(STYLE_DATA.map((s) => s.id));
const moodIds = new Set(MOODS.map((m) => m.id));
const sampleIds = new Set(Object.keys(SAMPLES));
const emph = (s) => (String(s ?? '').match(/\*[^*\n]+\*/g) || []).length;
const strayStar = (s) => (String(s ?? '').match(/\*/g) || []).length % 2 === 1;
const len = (s) => [...String(s ?? '')].length;
const isHex = (c) => /^#[0-9a-f]{6}$/i.test(String(c));

const problems = [];
const notes = []; // 문제는 아니지만 알아 둘 것(광고용 아닌 원래 스타일의 샘플 등)
const P = (scope, msg) => problems.push(`[${scope}] ${msg}`);

/** 스타일의 장식 목록(주 장식 + extras) → 요구 필드 검사 */
function checkDecorFields(scope, visual, scenes) {
  const decors = [visual.overlay, ...(Array.isArray(visual.extras) ? visual.extras : [])].filter((d) => d && d !== 'none');
  for (const d of decors) {
    const need = NEEDS[d];
    if (!need) continue;
    const has = (s) => (need.field === 'counter' ? s.counter && typeof s.counter === 'object' : !!s[need.field]);
    if (need.where === 'all') scenes.forEach((s, i) => { if (!has(s)) P(scope, `장면${i + 1}: 장식 ${d} 가 읽는 ${need.field} 없음`); });
    if (need.where === 'some' && !scenes.some(has)) P(scope, `장식 ${d} 가 읽는 ${need.field} 가 있는 장면이 없음`);
    if (need.where === 'hook' && !(scenes[0] && has(scenes[0]))) P(scope, `첫 장면에 장식 ${d} 가 읽는 ${need.field} 없음`);
  }
}

// ── 스타일 점검 ──
const combos = new Map();
const seenStyle = new Set();
for (const st of STYLE_DATA) {
  const S = `style ${st.id}`;
  if (seenStyle.has(st.id)) P(S, 'id 중복'); seenStyle.add(st.id);
  if (!/^[a-z0-9-]+$/.test(st.id)) P(S, 'id 형식(영문 소문자-하이픈)');
  const v = st.visual || {};
  for (const k of Object.keys(v)) if (!VISUAL_KEYS.has(k)) P(S, `visual 에 모르는 키 ${k}`);
  for (const [k, allowed] of Object.entries(VOCAB)) {
    if (v[k] === undefined) continue;
    if (k === 'deco' || k === 'extras') {
      if (!Array.isArray(v[k])) { P(S, `${k} 는 배열이어야 함`); continue; }
      for (const x of v[k]) if (!allowed.includes(x)) P(S, `${k} 값 '${x}' 는 어휘 밖(${allowed.join('/')})`);
      if (k === 'extras' && v.extras.includes(v.overlay)) P(S, `extras 에 주 장식 ${v.overlay} 이 겹침`);
    } else if (!allowed.includes(v[k])) P(S, `${k} 값 '${v[k]}' 는 어휘 밖(${allowed.join('/')})`);
  }
  for (const k of COLOR_KEYS) if (!isHex(v[k])) P(S, `${k} 가 hex 색이 아님: ${v[k]}`);
  if (!(v.captionSize >= 40 && v.captionSize <= 110)) P(S, `captionSize ${v.captionSize}`);
  if (typeof v.showProgress !== 'boolean') P(S, 'showProgress 가 bool 아님');
  if (!moodIds.has(st.music)) P(S, `music '${st.music}' 이 MOODS 에 없음`);
  if (st.ad !== undefined) {
    if (st.ad !== true) P(S, 'ad 는 true 만');
    if (!Array.isArray(st.adFor) || !st.adFor.length || st.adFor.some((x) => !AD_FOR.includes(x))) P(S, `adFor 형식/값: ${JSON.stringify(st.adFor)}`);
  } else if (st.adFor) P(S, 'adFor 가 있는데 ad 가 없음');
  const key = `${v.template}/${v.captionAnim}/${v.overlay}`;
  if (combos.has(key)) P(S, `template×captionAnim×overlay 조합 ${key} 이 ${combos.get(key)} 과 겹침`);
  combos.set(key, st.id);
  const scenes = st.sample?.scenes || [];
  if (!scenes.length) P(S, '샘플 장면 없음');
  if (emph(st.sample?.title) !== 1) P(S, `샘플 제목 강조 ${emph(st.sample?.title)}개`);
  scenes.forEach((s, i) => {
    const L = captionLength(s.caption);
    if (L > 35) P(S, `샘플 장면${i + 1} 자막 ${L}자 > 35`);
    if (emph(s.caption) !== 1 || strayStar(s.caption)) P(S, `샘플 장면${i + 1} 자막 강조 ${emph(s.caption)}개: ${s.caption}`);
    if (s.img && !sampleIds.has(s.img)) P(S, `샘플 장면${i + 1} img ${s.img} 가 SAMPLES 에 없음`);
    if (s.img2 && !sampleIds.has(s.img2)) P(S, `샘플 장면${i + 1} img2 ${s.img2} 가 SAMPLES 에 없음`);
    if (s.tag && len(s.tag) > 7) P(S, `샘플 장면${i + 1} tag '${s.tag}' 7자 초과`);
    if (s.stamp && len(s.stamp) > 6) P(S, `샘플 장면${i + 1} stamp '${s.stamp}' 6자 초과`);
  });
  if (scenes.length && scenes[0].kind !== 'hook') P(S, '샘플 첫 장면이 hook 아님');
  // 장식 필드·금지어는 광고용 추천(ad) 스타일만 본다 — 원래 20개의 샘플은 손대지 않는 데이터라(경고형의 '절대', 오해vs진실형의 '무조건'·한 장짜리 vs 훅) 구조만 점검하고 메모로 남긴다
  const banned = findBannedWords(st.sample?.title, scenes.map((s) => [s.caption, s.tag, s.stamp, s.label]));
  if (st.ad) {
    checkDecorFields(S, v, scenes);
    if (banned.length) P(S, `샘플에 금지어: ${banned.join(', ')}`);
  } else if (banned.length) notes.push(`[style ${st.id}] 광고용 아님 — 샘플에 과장어로 보일 수 있는 말(${banned.join(', ')}), 원래 데이터 그대로 둠`);
}
const usedMoods = new Set(STYLE_DATA.map((s) => s.music));
for (const m of moodIds) if (!usedMoods.has(m)) P('styles', `분위기 ${m} 을 쓰는 스타일이 없음`);
const adStyles = STYLE_DATA.filter((s) => s.ad);
for (const u of AD_FOR) if (!adStyles.some((s) => s.adFor.includes(u))) P('styles', `용도 ${u} 에 광고용 추천 스타일이 없음`);

// ── 사례 점검 ──
const rows = [];
const caseIds = new Set();
const fakeImages = Object.fromEntries([...sampleIds].map((id) => [id, { fake: id, naturalWidth: 1200, naturalHeight: 800 }]));
for (const c of CASE_DATA) {
  const S = `case ${c.id}`;
  if (caseIds.has(c.id)) P(S, 'id 중복'); caseIds.add(c.id);
  if (!/^[a-z0-9-]+$/.test(c.id)) P(S, 'id 형식');
  if (!c.name || len(c.name) > 14) P(S, `name '${c.name}' 14자 초과/없음`);
  if (!c.purpose) P(S, 'purpose 없음');
  if (!c.inputLine) P(S, 'inputLine(넣는 것 한 줄) 없음');
  if (!CATS.has(c.category)) P(S, `category '${c.category}' 는 CASE_CATEGORIES 밖`);
  if (!VOCAB.aspect.includes(c.aspect)) P(S, `aspect ${c.aspect}`);
  if (!Array.isArray(c.platforms) || c.platforms.some((p) => !PLATFORMS.has(p))) P(S, `platforms ${JSON.stringify(c.platforms)}`);
  const style = STYLE_DATA.find((s) => s.id === c.style);
  if (!style) { P(S, `style '${c.style}' 이 styles-data 에 없음`); continue; }
  if (!moodIds.has(c.music)) P(S, `music '${c.music}' 이 MOODS 에 없음`);
  if (String(c.title).split('\n').length > 2) P(S, 'title 3줄 이상');
  if (emph(c.title) !== 1) P(S, `title 강조 ${emph(c.title)}개`);
  const e = c.ending || {};
  if (emph(e.text) !== 1) P(S, `ending.text 강조 ${emph(e.text)}개`);
  if (!(e.duration >= 2.5)) P(S, 'ending.duration < 2.5');
  if (!e.cta) P(S, 'ending.cta 비어 있음');
  if (e.sub === undefined) P(S, 'ending.sub 없음');
  const scenes = c.scenes || [];
  const n = scenes.length;
  if (n < 6 || n > 8) P(S, `장면 ${n}개(6~8 이어야 함)`);
  if (scenes[0]?.kind !== 'hook') P(S, '첫 장면이 hook 아님');
  if (scenes[n - 1]?.kind !== 'cta') P(S, '마지막 장면이 cta 아님');
  if (scenes.slice(1, -1).some((s) => s.kind === 'cta' || s.kind === 'hook')) P(S, '가운데에 hook/cta 장면');
  // slot 번호: 같은 사진 = 같은 번호, 다른 사진 = 다른 번호, 1부터 빈틈 없이
  const slotById = new Map();
  const idBySlot = new Map();
  const bind = (i, no, id, what) => {
    if (no == null) { P(S, `장면${i + 1} ${what} 에 slot 번호 없음`); return; }
    if (slotById.has(id) && slotById.get(id) !== no) P(S, `장면${i + 1} ${what} ${id} 의 slot ${no} 가 앞의 ${slotById.get(id)} 와 다름`);
    if (idBySlot.has(no) && idBySlot.get(no) !== id) P(S, `장면${i + 1} slot ${no} 가 다른 사진(${idBySlot.get(no)} / ${id})에 겹침`);
    slotById.set(id, no); idBySlot.set(no, id);
  };
  scenes.forEach((s, i) => {
    const L = captionLength(s.caption);
    if (L > CAPTION_MAX) P(S, `장면${i + 1} 자막 ${L}자 > ${CAPTION_MAX}: ${s.caption}`);
    if (emph(s.caption) !== 1 || strayStar(s.caption)) P(S, `장면${i + 1} 자막 강조 ${emph(s.caption)}개: ${s.caption}`);
    if (String(s.caption).split('\n').length > 2) P(S, `장면${i + 1} 자막 3줄`);
    if (!s.narration) P(S, `장면${i + 1} 읽을 문장 없음`);
    if (len(s.narration) > 70) P(S, `장면${i + 1} 읽을 문장 ${len(s.narration)}자 > 70`);
    if (String(s.narration).includes('*')) P(S, `장면${i + 1} 읽을 문장에 별표`);
    if (!['hook', 'normal', 'answer', 'cta'].includes(s.kind)) P(S, `장면${i + 1} kind '${s.kind}'`);
    if (!(Number(s.duration) >= 0.5)) P(S, `장면${i + 1} duration`);
    if (s.img && !sampleIds.has(s.img)) P(S, `장면${i + 1} img ${s.img} 가 SAMPLES 에 없음`);
    if (s.img2 && !sampleIds.has(s.img2)) P(S, `장면${i + 1} img2 ${s.img2} 가 SAMPLES 에 없음`);
    if (!!s.img !== (s.slot != null)) P(S, `장면${i + 1} slot/img 불일치(img ${s.img}, slot ${s.slot})`);
    if (s.img) { bind(i, s.slot, s.img, 'img'); if (!s.hint) P(S, `장면${i + 1} hint(어떤 사진) 없음`); }
    if (s.img2) bind(i, s.slot2, s.img2, 'img2');
    if (s.tag && len(s.tag) > 7) P(S, `장면${i + 1} tag '${s.tag}' 7자 초과`);
    if (s.stamp && len(s.stamp) > 6) P(S, `장면${i + 1} stamp '${s.stamp}' 6자 초과`);
    if (s.counter && (typeof s.counter.from !== 'number' || typeof s.counter.to !== 'number')) P(S, `장면${i + 1} counter 형식`);
    if (c.style === 'quote-wave' && L > 20) P(S, `장면${i + 1} quote-wave 자막 20자 초과`);
  });
  const nos = [...idBySlot.keys()].sort((a, b) => a - b);
  nos.forEach((no, i) => { if (no !== i + 1) P(S, `slot 번호가 1부터 빈틈 없이 이어지지 않음: ${nos.join(',')}`); });
  const total = caseSeconds(c);
  if (total < 21 || total > 30) P(S, `총 길이 ${total}초(21~30 이어야 함)`);
  checkDecorFields(S, style.visual, scenes);
  if (!(c.upload?.hashtags?.length >= 6 && c.upload.hashtags.length <= 8)) P(S, `hashtags ${c.upload?.hashtags?.length}개(6~8)`);
  if ((c.upload?.hashtags || []).some((h) => !h.startsWith('#') || /\s/.test(h))) P(S, 'hashtag 형식');
  const sentences = String(c.upload?.desc || '').split(/(?<=[.!?])\s+/).filter(Boolean).length;
  if (sentences < 2 || sentences > 3) P(S, `upload.desc 문장 ${sentences}개(2~3)`);
  if (!c.extraScene || emph(c.extraScene.caption) !== 1 || !c.extraScene.caption.includes('{n}')) P(S, 'extraScene 틀(*{n}번째* …) 아님');
  if (c.category === 'listing') {
    if (!/표시·광고 필수 항목/.test(c.notes || '')) P(S, '매물 notes 에 표시·광고 문구 없음');
    if (e.sub !== '{office}') P(S, '매물 ending.sub 가 {office} 아님');
  }
  const allText = [c.name, c.purpose, c.title, e.text, e.sub, e.cta, c.upload?.desc, c.upload?.hashtags, c.extraScene?.caption, c.extraScene?.narration,
    scenes.map((s) => [s.caption, s.narration, s.tag, s.label, s.stamp, s.hint, s.labelA, s.labelB])];
  const banned = findBannedWords(allText);
  const flat = JSON.stringify(allText);
  for (const w of EXTRA_BANNED) if (flat.includes(w)) banned.push(w);
  if (banned.length) P(S, `금지어: ${banned.join(', ')}`);

  // cases.js 변환이 돌아가는지(사진은 가짜 객체로 — DOM 불필요)
  try {
    const slots = caseSlots(c);
    if (slots.length !== casePhotoCount(c)) P(S, 'caseSlots/casePhotoCount 불일치');
    for (const sl of slots) if (!sl.hint) P(S, `자리 ${sl.no} hint 없음`);
    const office = { name: '○○공인중개사사무소', phone: '010-0000-0000' };
    const p = await caseToProject(c, { images: fakeImages, office });
    if (p.aspect !== c.aspect) P(S, 'caseToProject aspect 가 사례 비율 아님');
    if (p.template !== style.visual.template || p.overlay !== style.visual.overlay) P(S, 'caseToProject 에 스타일 visual 이 입혀지지 않음');
    if (p.scenes.length !== n) P(S, 'caseToProject 장면 수 다름');
    if (p.scenes.some((s) => s.sample)) P(S, 'images 맵에 다 있는데 sample:true 인 장면이 있음');
    if (p.ending.cta !== e.cta || p.ending.sub !== `${office.name} ${office.phone}`) P(S, `caseToProject 엔딩: cta '${p.ending.cta}', sub '${p.ending.sub}'`);
    if (p.channel !== office.name || p.brand?.name !== office.name) P(S, 'caseToProject 채널/brand 에 상호가 안 들어감');
    if (p.styleMusic !== c.music || p.musicMood !== c.music) P(S, 'caseToProject 음악 필드');
    p.scenes.forEach((s, i) => {
      const src = scenes[i];
      for (const k of ['tag', 'label', 'labelA', 'labelB', 'stamp', 'vsLabel']) if (src[k] && s[k] !== src[k]) P(S, `장면${i + 1} ${k} 가 변환에서 빠짐`);
      if (src.counter && JSON.stringify(s.counter) !== JSON.stringify(src.counter)) P(S, `장면${i + 1} counter 가 변환에서 빠짐`);
      if (src.img2 && !s.img2) P(S, `장면${i + 1} img2 가 변환에서 빠짐`);
      if (s.narration !== (src.narration || '')) P(S, `장면${i + 1} narration 변환`);
    });
    const p2 = await caseToProject(c, { images: fakeImages });
    const expectSub = String(e.sub).replace('{office}', 'MR.K 고상철');
    if (p2.ending.sub !== expectSub) P(S, `사무소 없을 때 엔딩 부제 '${p2.ending.sub}' ≠ '${expectSub}'`);
    const script = caseScript(c);
    if (script.length !== n + 1 || script[n].label !== '엔딩') P(S, 'caseScript 줄 수/엔딩');
    const up = caseUpload(c, office);
    if (!up.text.includes(c.upload.desc)) P(S, 'caseUpload 에 설명이 없음');
    if (c.category === 'listing' && !up.disclosure.some((l) => l.includes(office.name))) P(S, '매물 caseUpload 에 표시·광고 줄이 없음');
    if (c.category !== 'listing' && up.disclosure.length) P(S, '매물 아닌 사례에 표시·광고 줄이 붙음');
    const info = caseUploadInfo(c, office);
    if (info.source !== (c.category === 'listing' ? 'listing' : 'recipe')) P(S, 'caseUploadInfo source');
  } catch (err) { P(S, `cases.js 변환 예외: ${err.message}`); }

  rows.push({ id: c.id, cat: c.category, style: c.style, aspect: c.aspect, music: c.music, scenes: n, photos: casePhotoCount(c), total, overlay: style.visual.overlay, extras: (style.visual.extras || []).join('+') || '-', ad: style.ad ? 'o' : '-' });
}

// ── 출력 ──
console.log(`스타일 ${STYLE_DATA.length}개(광고용 추천 ${adStyles.length}) · 사례 ${CASE_DATA.length}개 · 사례가 쓰는 스타일 ${new Set(CASE_DATA.map((c) => c.style)).size}종`);
console.table(rows);
const dist = (arr, key) => Object.entries(arr.reduce((m, x) => ((m[x[key]] = (m[x[key]] || 0) + 1), m), {})).map(([k, v]) => `${k}×${v}`).join(' ');
console.log('사례 음악 분포:', dist(CASE_DATA, 'music'));
console.log('사례 용도 분포:', dist(CASE_DATA, 'category'));
console.log('새 스타일 조합:', STYLE_DATA.slice(30).map((s) => `${s.id}=${s.visual.template}/${s.visual.captionAnim}/${s.visual.overlay}`).join(', '));
console.log(`CAPTION_MAX = ${CAPTION_MAX}`);
if (notes.length) console.log('메모:\n' + notes.join('\n'));
if (problems.length) {
  console.log(`문제 ${problems.length}건:\n` + problems.join('\n'));
  process.exit(1);
}
console.log('문제 없음');
