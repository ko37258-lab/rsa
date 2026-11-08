// 따라하기(레시피) 모드 — 사례 화면에서 고른 광고 사례를 숏폼 화면에 그대로 싣고, 사진을 넣으면 자리 순서대로 바꿔 넣습니다.
//  - 들어오기: main.js 가 주소 #follow=<사례 id> 를 보고 followCase(id) 를 부릅니다. 사용자의 사진·글이 있으면 바 안에서 먼저 묻습니다(확인창 없음).
//  - 싣기(loadCase): js/cases.js 의 caseToProject 로 사례 → 프로젝트를 만들어(갤러리 미리보기와 같은 함수) 스타일·비율·장면·제목·채널·brand·엔딩·음악·업로드 글을 넣습니다.
//    사진 자리 장면은 예시 사진(scene.sample=true)으로 들어오고, 자리 목록(recipe.slots)은 이 모듈이 듭니다(장면 데이터 구조는 늘리지 않음).
//  - 사진 넣기: shorts.js 의 addImageFiles 가 레시피 모드면 사진을 placeImages 로 넘겨 줍니다(api.registerPhotoSink). 지우지 않고 빈 자리에 장면 순서대로 img 만 바꾸고,
//    자막·읽을 문장·kind·tag·stamp·label·counter·길이는 그대로 둡니다. 사진이 남으면 extraScene 틀로 마지막 마무리(cta) 앞에 장면을 더 만들고, 모자라면 예시 자리를 남겨 알립니다.
//  - AI 다듬기(refine): 바뀐 사진만 보내 같은 장면 수·순서로 자막·읽을 문장만 새로 받습니다(js/recipe-prompt.js). 키는 keys.js, 호출은 llm.js.
//  - 저장/열기: shorts.js 가 snapshot()/restore() 로 프로젝트 .json 의 recipe 항목을 주고받습니다(장면 번호 → 새 장면 id 로 다시 묶음).
// 이 모듈은 shorts.js 를 import 하지 않고 initRecipe(api) 로 받은 손잡이만 씁니다(listing.js 와 같은 방식). 상태는 모듈 변수에만 두고 store 에 남기지 않습니다.

import { $, toast } from './util.js';
import { findCase, caseToProject, caseSlots, caseUploadInfo, categoryOf } from './cases.js';
import { plainText } from './shorts-render.js';
import { pickProvider, llmProviderOf, generateJSON, imageToBase64 } from './llm.js';
import { MAX_AI_PHOTOS } from './listing.js';
import { CAPTION_MAX } from './listing-prompt.js';
import { buildRecipePrompt, RECIPE_SCHEMA, normalizeRecipeResult } from './recipe-prompt.js';
import { inArtifact } from './platform.js';

let api = null;
/** 지금 따라하는 사례. { id, name, styleId, aspect, category, extra(추가 장면 틀), slots: [{ no, hint, filled, extra, targets: [{ sceneId, key:'img'|'img2' }] }] } */
let recipe = null;
let ask = null; // 묻는 상태 { c } — 사용자의 장면이 있을 때 "불러올까요?" 를 바 안에서 먼저 묻는 중
let job = null; // AI 다듬기 진행 { abort }
let loading = false; // loadCase 가 장면·설정을 차례로 바꾸는 동안 바를 다시 그리지 않음
let styleNote = ''; // 스타일을 사례와 다르게 바꿨을 때의 안내 한 줄
let pendingFollow = null; // initRecipe 전에 followCase 가 불렸을 때 기억해 두는 { id, opts }

const ASPECT_LABEL = { '9:16': '9:16 쇼츠', '16:9': '16:9 유튜브', '1:1': '1:1 정사각' };

// ── 자리(슬롯) 계산 ───────────────────────────────────
const scenesNow = () => api.project.scenes;
const sceneMap = () => new Map(scenesNow().map((s) => [s.id, s]));
const indexMap = () => new Map(scenesNow().map((s, i) => [s.id, i]));

/** 아직 화면에 남아 있는 장면을 하나라도 가리키는 자리만(✕ 로 지운 장면의 자리는 빠짐) */
function liveSlots() {
  if (!recipe) return [];
  const byId = sceneMap();
  return recipe.slots.filter((sl) => sl.targets.some((t) => byId.has(t.sceneId)));
}

/** 자리의 장면 순서(여러 장면이 공유하면 가장 앞 장면) */
function slotOrder(sl, idx) {
  let best = Infinity;
  for (const t of sl.targets) { const i = idx.get(t.sceneId); if (i != null && i < best) best = i; }
  return best;
}

/** 지금 장면 순서로 정렬한 살아 있는 자리 */
function orderedSlots() {
  const idx = indexMap();
  return liveSlots().sort((a, b) => slotOrder(a, idx) - slotOrder(b, idx) || a.no - b.no);
}

/** 자리의 첫 장면과 칸(img/img2) */
function slotTarget(sl) {
  const byId = sceneMap();
  const idx = indexMap();
  const live = sl.targets.filter((t) => byId.has(t.sceneId)).sort((a, b) => idx.get(a.sceneId) - idx.get(b.sceneId));
  const t = live[0];
  return t ? { scene: byId.get(t.sceneId), key: t.key } : null;
}

/** 자리에 사진을 넣습니다(공유하는 장면 모두). 예시 표시(sample)는 그 장면의 자리가 모두 찼을 때 내립니다. */
function fillSlot(sl, img) {
  const byId = sceneMap();
  for (const t of sl.targets) { const s = byId.get(t.sceneId); if (s) s[t.key] = img; }
  sl.filled = true;
  refreshSampleFlags();
}

/** 장면의 '예시' 표시 = 그 장면을 가리키는 자리 가운데 아직 안 채운 것이 있음 */
function refreshSampleFlags() {
  if (!recipe) return;
  const open = new Set();
  const any = new Set();
  for (const sl of recipe.slots) {
    for (const t of sl.targets) { any.add(t.sceneId); if (!sl.filled) open.add(t.sceneId); }
  }
  for (const s of scenesNow()) if (any.has(s.id)) s.sample = open.has(s.id);
}

/** 바뀐 사진 수·전체 자리 수(추가 장면 자리는 따로) */
function progress() {
  const live = liveSlots();
  const main = live.filter((sl) => !sl.extra);
  return { total: main.length, filled: main.filter((sl) => sl.filled).length, open: main.filter((sl) => !sl.filled), extra: live.filter((sl) => sl.extra).length };
}

/** 추가 장면 틀의 '{n}' 자리표시 → 장면 번호 */
const fillN = (text, n) => String(text || '').replaceAll('{n}', String(n));

// ── 사진 바꿔 넣기(shorts.js addImageFiles 가 레시피 모드일 때 이쪽으로 넘김) ──
/**
 * 사진들을 빈 자리에 "지금 장면 순서"로 넣고, 남으면 추가 장면을 만듭니다. 자막·읽을 문장·kind·tag·stamp·label·counter·길이는 건드리지 않습니다.
 * @param {HTMLImageElement[]} imgs
 * @returns {{ placed: number, added: number }}
 */
export function placeImages(imgs) {
  if (!recipe) return { placed: 0, added: 0 };
  const queue = [...imgs];
  let placed = 0;
  let added = 0;
  for (const sl of orderedSlots()) {
    if (sl.filled) continue;
    const img = queue.shift();
    if (!img) break;
    fillSlot(sl, img);
    placed++;
  }
  // 남은 사진 → 추가 장면(마지막 마무리 장면 앞, 없으면 맨 뒤). 자막은 사례의 extraScene 틀('{n}' = 장면 번호)
  for (const img of queue) {
    const arr = scenesNow();
    const cta = arr.findLastIndex((x) => x.kind === 'cta');
    const at = cta >= 0 ? cta : arr.length;
    const no = Math.max(0, ...recipe.slots.map((sl) => sl.no)) + 1;
    const ex = recipe.extra || {};
    const s = api.newScene(img, fillN(ex.caption, at + 1), {
      narration: fillN(ex.narration, at + 1), kind: 'normal', slot: no, duration: Number(ex.duration) > 0 ? Number(ex.duration) : 3, hint: '추가한 사진', sample: false,
    });
    arr.splice(at, 0, s);
    recipe.slots.push({ no, hint: '추가', filled: true, extra: true, targets: [{ sceneId: s.id, key: 'img' }] });
    placed++;
    added++;
  }
  return { placed, added };
}

/** 장면 목록 썸네일·슬롯 버튼으로 한 장만 바꾼 뒤(shorts.js 가 부름): 그 자리를 '채움'으로 — 같은 사진을 쓰는 다른 장면에도 함께 넣습니다. */
function onSceneImage(scene, key = 'img') {
  if (!recipe) { scene.sample = false; return; }
  const sl = recipe.slots.find((x) => x.targets.some((t) => t.sceneId === scene.id && t.key === key));
  if (!sl) { scene.sample = false; return; }
  fillSlot(sl, scene[key]);
}

/** 「남은 자리 채우기」 — 내 사진들을 자리 번호 순서로 돌려 남은 자리에 넣습니다(예시 사진이 영상에 남지 않게 한 번 누르기). */
function fillRemaining() {
  if (!recipe || api.structureLocked()) return;
  const mine = orderedSlots().filter((sl) => sl.filled).map((sl) => { const t = slotTarget(sl); return t ? t.scene[t.key] : null; }).filter(Boolean);
  if (!mine.length) return toast('먼저 사진을 한 장 이상 넣어 주세요.');
  const open = orderedSlots().filter((sl) => !sl.filled);
  if (!open.length) return;
  open.forEach((sl, i) => fillSlot(sl, mine[i % mine.length]));
  api.changed(true);
  toast(`남은 자리 ${open.length}개를 내 사진 ${mine.length}장으로 돌려 채웠습니다.`);
  announce(`남은 자리 ${open.length}개를 내 사진으로 채웠습니다. 사진 ${progress().filled}/${progress().total} 바꿈.`);
}

/** 「남은 장면 빼기」 — 자리가 모두 비어 있는 장면(마무리 cta 제외)을 지웁니다. */
function trimEmpty() {
  if (!recipe || api.structureLocked()) return;
  const filledIds = new Set();
  const openIds = new Set();
  for (const sl of recipe.slots) for (const t of sl.targets) (sl.filled ? filledIds : openIds).add(t.sceneId);
  const drop = (s) => openIds.has(s.id) && !filledIds.has(s.id) && s.kind !== 'cta';
  const n = scenesNow().filter(drop).length;
  if (!n) return toast('뺄 장면이 없습니다.');
  api.project.scenes = scenesNow().filter((s) => !drop(s));
  api.changed(true);
  toast(`예시 사진만 남아 있던 장면 ${n}개를 뺐습니다.`);
  announce(`장면 ${n}개를 뺐습니다. 이제 장면 ${scenesNow().length}개입니다.`);
}

// ── 들어오기 ─────────────────────────────────────────
/**
 * 사례를 따라하기 시작합니다(main.js 가 #follow=<id> 해시를 보고 부름). 모르는 id 면 토스트만.
 * 사용자의 사진·글이 있는 장면이 있으면 바 안에서 먼저 묻습니다.
 * @param {string} id  cases-data.js 의 사례 id
 * @param {{ from?: string }} [opts]
 * @returns {boolean} 사례를 찾았으면 true
 */
export function followCase(id, opts = {}) {
  const c = findCase(id);
  if (!c) { toast('그런 사례가 없습니다. 사례 화면에서 다시 골라 주세요.'); return false; }
  if (!api) { pendingFollow = { id, opts }; return true; }
  if (api.busy) { toast('영상이나 목소리를 만드는 중입니다. 끝난 뒤 사례를 다시 골라 주세요.'); return true; }
  if (api.structureLocked()) return true;
  const userContent = scenesNow().some((s) => !s.sample && (s.img || plainText(s.caption).trim()));
  if (!userContent) loadCase(c).catch((e) => { console.error('recipe', e); toast(e?.message || '사례를 불러오지 못했습니다.'); });
  else showAsk(c);
  return true;
}

function showAsk(c) {
  ask = { c };
  renderBar();
  const n = scenesNow().length;
  const media = !!(api.audio.narr || api.resultBlob);
  $('#recipeAskText').textContent = `사례 「${c.name}」를 불러올까요? 지금 있는 장면 ${n}개와 제목·엔딩이 사례 것으로 바뀝니다.${media ? ' 만든 목소리·영상도 지웁니다.' : ''}`;
  $('#recipeAskLoad').focus({ preventScroll: false });
}

/**
 * 사례를 프로젝트에 싣습니다. 순서가 중요합니다: 스타일(visual 을 덮음) → 비율 → 장면 → 제목·채널·brand·엔딩 → 음악 → 업로드 글.
 * 사례 → 프로젝트 변환은 cases.js 의 caseToProject 하나로(갤러리 미리보기와 같은 결과).
 */
async function loadCase(c) {
  // 바의 「불러오기」는 묻는 사이 영상·목소리 만들기가 시작됐을 수 있음 — 만드는 중에 장면·소리를 지우지 않게
  if (api.busy) { toast('영상이나 목소리를 만드는 중입니다. 끝난 뒤 다시 눌러 주세요.'); return; }
  const office = api.officeInfo();
  const built = await caseToProject(c, { office, defaults: { channel: api.defaults.channel }, newScene: api.newScene });
  if (api.structureLocked()) return; // 기다리는 사이 AI 대본이 시작됐으면 넣지 않음
  loading = true;
  try {
    const hadMedia = api.resetMedia();
    api.applyStyle(c.style, { keepScenes: true, quiet: true });
    if (c.visual && typeof c.visual === 'object') for (const k of Object.keys(c.visual)) if (k in built) api.project[k] = built[k]; // 사례가 스타일 위에 덮는 시각값
    api.setAspect(built.aspect);
    api.setScenes(built.scenes);
    api.setTitle(built.title);
    api.setChannel(built.channel);
    api.setBrand(built.brand);
    api.setEnding(built.ending);
    api.noteBrand({ channel: built.channel, ending: { text: built.ending.text, sub: built.ending.sub }, keepText: true });
    api.setStyleMusic(built.styleMusic || 'auto');
    api.setUploadInfo(caseUploadInfo(c, office));
    const slots = caseSlots(c).map((sl) => ({
      no: sl.no, hint: sl.hint, filled: false, extra: false,
      targets: sl.targets.map((t) => ({ sceneId: built.scenes[t.sceneIndex]?.id, key: t.key })).filter((t) => t.sceneId),
    }));
    recipe = { id: c.id, name: c.name, styleId: c.style, aspect: built.aspect, category: c.category, extra: c.extraScene || null, slots };
    ask = null;
    styleNote = '';
    api.registerPhotoSink(placeImages);
    if (hadMedia) toast('전에 만든 목소리·영상은 새 장면에 맞지 않아 지웠습니다.', 4500);
  } finally {
    loading = false;
  }
  renderBar();
  const names = orderedSlots().map((sl) => sl.hint).filter(Boolean);
  announce(`사례 「${c.name}」를 불러왔습니다. 사진 ${recipe.slots.length}장을 넣으면 그 자리에 들어갑니다${names.length ? `(${names.join(' → ')})` : ''}.`);
  api.seek(0.6);
  $('#h-recipe')?.focus({ preventScroll: false });
}

/** 「사례 그만」 — 레시피 모드만 끝냅니다. 장면·예시 표시·자리 번호는 그대로 둡니다(남은 예시 사진이 있으면 내보내기 경고는 계속). */
export function stop({ quiet = false } = {}) {
  const had = !!recipe;
  job?.abort.abort(); // AI 다듬기 중에 끝내면 다듬기도 멈춤(끝난 사례에 늦은 결과가 붙지 않게)
  recipe = null;
  ask = null;
  styleNote = '';
  api?.registerPhotoSink(null);
  renderBar();
  if (!quiet && had) toast('사례 모드를 끝냈습니다. 장면은 그대로 두었습니다. 이제 사진을 넣으면 뒤에 장면으로 추가됩니다.', 4500);
}

// ── 저장/열기(shorts.js saveProject·openProject 가 부름) ──
/** 프로젝트 .json 에 넣을 레시피 상태(장면은 번호로 가리킴). 레시피 모드가 아니면 null. */
export function snapshot() {
  if (!recipe) return null;
  const idx = indexMap();
  return {
    id: recipe.id, styleId: recipe.styleId, aspect: recipe.aspect,
    slots: recipe.slots.map((sl) => ({
      no: sl.no, hint: sl.hint, filled: !!sl.filled, extra: !!sl.extra,
      targets: sl.targets.map((t) => ({ sceneIndex: idx.get(t.sceneId), key: t.key })).filter((t) => t.sceneIndex != null),
    })).filter((sl) => sl.targets.length),
  };
}

/** .json 의 recipe 항목 → 지금 장면(id 새로 생김)에 다시 묶습니다. 사례 id 를 모르면(지워진 옛 사례) 레시피 없이 엽니다. */
export function restore(saved, scenes) {
  const c = saved && typeof saved === 'object' ? findCase(saved.id) : null;
  if (!c) { if (recipe || ask) stop({ quiet: true }); return false; }
  const list = Array.isArray(scenes) ? scenes : scenesNow();
  const slots = (Array.isArray(saved.slots) ? saved.slots : []).map((sl) => ({
    no: Number(sl.no) || 0, hint: String(sl.hint || ''), filled: !!sl.filled, extra: !!sl.extra,
    targets: (Array.isArray(sl.targets) ? sl.targets : []).map((t) => ({ sceneId: list[Number(t.sceneIndex)]?.id, key: t.key === 'img2' ? 'img2' : 'img' })).filter((t) => t.sceneId),
  })).filter((sl) => sl.targets.length).sort((a, b) => a.no - b.no);
  recipe = {
    id: c.id, name: c.name, styleId: c.style, aspect: ['9:16', '16:9', '1:1'].includes(saved.aspect) ? saved.aspect : c.aspect,
    category: c.category, extra: c.extraScene || null, slots,
  };
  ask = null;
  styleNote = '';
  api.registerPhotoSink(placeImages);
  refreshSampleFlags();
  renderBar();
  const p = progress();
  announce(`프로젝트의 사례 「${c.name}」를 다시 열었습니다. 사진 ${p.filled}/${p.total} 바꿈.`);
  return true;
}

// ── AI 로 사진에 맞춰 대본 다듬기 ─────────────────────
function say(text, kind = '') {
  const el = $('#recipeStatus');
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('bad', kind === 'bad');
  el.classList.toggle('ok', kind === 'ok');
}
/** 상태 줄에 알리기(aria-live polite). 다듬기 상태와 같은 칸을 씁니다. */
export function announce(text) { say(text); }

async function refine() {
  if (job) { job.abort.abort(); return; }
  if (!recipe) return;
  if (inArtifact) return say('Claude 미리보기에서는 쓸 수 없습니다. ko372.com 에서 써 주세요.', 'bad');
  if (api.busy) return say('영상이나 목소리를 만드는 중입니다. 끝난 뒤 눌러 주세요.', 'bad');
  if (api.structureLocked()) return;
  const changedScenes = scenesNow().filter((s) => s.img && !s.sample);
  if (!changedScenes.length) return say('먼저 사진을 한 장 이상 넣어 주세요.', 'bad');
  const provider = pickProvider();
  if (!provider) {
    say('AI 키가 없습니다. 맨 위 AI 키 칸에 제미나이 키(무료)를 넣어 주세요.', 'bad');
    api.openKeyBar({ focus: 'gemini' });
    return;
  }
  const P = llmProviderOf(provider);
  const used = changedScenes.slice(0, MAX_AI_PHOTOS);
  const usedImgs = used.map((s) => s.img);
  const start = [...scenesNow()];
  const { category, name: caseName, slots: slotsAtStart } = recipe; // 기다리는 사이 「사례 그만」으로 recipe 가 비어도 쓸 수 있게
  const token = api.projectToken;
  const abort = new AbortController();
  job = { abort };
  api.lockStructure('AI 가 대본을 다듬는 중에는 장면·사진을 바꿀 수 없습니다. 끝나거나 「멈춤」을 누른 뒤 해 주세요.');
  renderBar();
  try {
    say(`사진 ${used.length}장을 1024px 로 줄이는 중…`);
    const images = [];
    for (const s of used) {
      const { mime, base64 } = await imageToBase64(s.img, { max: 1024, quality: 0.85 });
      images.push({ mime, base64 });
      if (abort.signal.aborted) throw Object.assign(new Error('멈춤'), { name: 'AbortError' });
    }
    const photoOf = new Map(used.map((s, i) => [s.id, i]));
    const extraIds = new Set(slotsAtStart.filter((sl) => sl.extra).flatMap((sl) => sl.targets.map((t) => t.sceneId)));
    const st = api.currentStyle();
    const info = api.listingInfo() || {};
    const office = api.officeInfo();
    const prompt = buildRecipePrompt({
      caseName,
      categoryLabel: categoryOf({ category }).label,
      scenes: start.map((s) => ({
        kind: s.kind, caption: s.caption, narration: s.narration || '', stamp: s.stamp, tag: s.tag, label: s.label, counter: s.counter,
        img: !!s.img, sample: !!s.sample, extra: extraIds.has(s.id), photo: photoOf.has(s.id) ? photoOf.get(s.id) : null,
      })),
      facts: info.facts, office,
      style: st ? { name: st.name, hint: api.styleHintOf(st) } : undefined,
      aspect: api.project.aspect,
      brand: api.project.brand?.name || api.project.channel,
    });
    say(`${P.name}가 사진 ${used.length}장을 보고 자막·읽을 문장을 다듬는 중… (보통 10~60초)`);
    const data = await generateJSON({ provider, prompt, schema: RECIPE_SCHEMA, images, signal: abort.signal });
    if (abort.signal.aborted) throw Object.assign(new Error('멈춤'), { name: 'AbortError' });
    const r = normalizeRecipeResult(data, start.length);
    // 잠금으로 막았어도 남는 경합에 대비: 장면 묶음·순서·보낸 사진이 그대로인지
    const now = scenesNow();
    if (token !== api.projectToken || now.length !== start.length || start.some((s, i) => now[i] !== s) || used.some((s, i) => s.img !== usedImgs[i])) {
      throw new Error('대본을 다듬는 동안 장면이나 사진이 바뀌어 적용하지 않았습니다. 다시 눌러 주세요.');
    }
    const hadVoice = !!api.audio.narr;
    for (const [i, ch] of r.changes) { now[i].caption = ch.caption; now[i].narration = ch.narration; }
    if (r.title && api.isSampleTitle(api.project.title)) api.setTitle(r.title); // 아직 사례 제목 그대로일 때만
    const u = api.uploadInfo || { source: category === 'listing' ? 'listing' : 'recipe', platforms: {} };
    api.setUploadInfo({
      ...u,
      title: plainText(api.project.title).replace(/\n/g, ' ').trim(),
      description: r.upload.description || u.description || '',
      hashtags: r.upload.hashtags.length ? r.upload.hashtags : (u.hashtags || []),
    });
    api.setScenes([...now]); // 대본 칸·#scriptText 도 새 글로
    const warn = [];
    if (r.longCount) warn.push(`자막이 긴 장면 ${r.longCount}개 — ${CAPTION_MAX}자 이내로 줄여 주세요.`);
    if (r.banned?.length) warn.push(`과장 표현으로 보일 수 있는 말: ${r.banned.join('·')} — 표시·광고 규정에 걸리지 않게 고쳐 주세요.`);
    if (hadVoice) warn.push('지금 목소리는 예전 대본으로 만든 것이라 ④에서 다시 만들어 주세요.');
    say(`${P.name}가 사진 ${used.length}장을 보고 장면 ${r.changes.size}개의 자막·읽을 문장을 다듬었습니다. 장면 수·순서·도장·태그는 그대로입니다. 숫자는 올리기 전에 꼭 확인하세요.${warn.length ? ` ${warn.join(' ')}` : ''}`, warn.length ? 'bad' : 'ok');
  } catch (e) {
    if (e?.name === 'AbortError') say('대본 다듬기를 멈췄습니다.');
    else {
      say(e?.message || '대본을 다듬지 못했습니다. 다시 시도해 보세요.', 'bad');
      if (/키가 (맞지 않|없)|키도 확인/.test(e?.message || '')) api.openKeyBar({ focus: provider });
    }
  } finally {
    job = null;
    api.unlockStructure();
    renderBar();
  }
}

// ── 바 그리기 ────────────────────────────────────────
function hintText() {
  const p = progress();
  const names = orderedSlots().filter((sl) => !sl.extra).map((sl) => sl.hint).filter(Boolean);
  let text;
  if (!p.total) text = '이 사례는 사진 자리가 없는 글자 장면 영상입니다. 자막·대본·스타일·음악·엔딩이 그대로 들어왔고, 사진을 넣으면 마무리 장면 앞에 장면이 추가됩니다.';
  else if (!p.filled) text = `사진 자리가 ${p.total}개 있습니다(${names.join(' → ')}). 내 사진을 넣으면 순서대로 들어가고, 자막·대본·스타일·음악·엔딩은 그대로입니다.`;
  else if (p.open.length) {
    const left = p.open.map((sl) => sl.hint).filter(Boolean).join('·');
    text = `사진 ${p.filled}/${p.total} 바꿈 — 예시 사진 ${p.open.length}장${left ? `(${left})` : ''}이 아직 남아 있습니다. ${p.open.length}장 더 넣거나, 내 사진으로 남은 자리를 채우려면 「남은 자리 채우기」를 누르세요.`;
  } else text = `사진 ${p.filled}/${p.total} 바꿈 — 이제 「AI 로 사진에 맞춰 대본 다듬기」를 누르거나, 위 매물 상자 ④ 목소리 → ⑤ 영상 만들기로 가세요.`;
  if (p.extra) text += ` 사진이 자리보다 ${p.extra}장 많아 마지막 문의 장면 앞에 장면 ${p.extra}개를 더 만들었습니다. 그 장면 자막은 「AI 로 사진에 맞춰 대본 다듬기」가 다듬어 줍니다(직접 적어도 됩니다).`;
  if (recipe.aspect === '16:9') text += ' 이 사례는 가로(16:9) 유튜브용입니다. 릴스·틱톡용이면 세로(9:16) 사례를 고르세요.';
  if (styleNote) text += ` ${styleNote}`;
  return text;
}

function renderSlots() {
  const list = $('#recipeSlots');
  list.textContent = '';
  for (const sl of orderedSlots()) {
    const t = slotTarget(sl);
    if (!t) continue;
    const img = t.scene[t.key];
    const li = document.createElement('li');
    li.classList.toggle('sample', !sl.filled);
    if (sl.extra) li.classList.add('extra');
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', `자리 ${sl.no} (${sl.filled ? '내 사진' : '예시 사진'} · ${sl.hint || (sl.extra ? '추가' : '사진')}) — ${sl.filled ? '다른 사진으로 바꾸기' : '내 사진으로 바꾸기'}`);
    b.title = sl.filled ? '다른 사진으로 바꾸기' : '내 사진으로 바꾸기';
    b.disabled = !!job;
    if (img) {
      const im = document.createElement('img');
      im.src = img.src;
      im.alt = '';
      b.append(im);
    }
    const no = document.createElement('b');
    no.textContent = String(sl.no);
    const hint = document.createElement('span');
    hint.textContent = sl.hint || (sl.extra ? '추가' : '');
    b.append(no, hint);
    b.addEventListener('click', () => api.pickReplacement(t.scene, t.key));
    li.append(b);
    list.append(li);
  }
}

/** 바 전체를 지금 상태대로 다시 그립니다(레시피도 묻는 상태도 아니면 숨김). */
export function renderBar() {
  const bar = $('#recipeBar');
  if (!bar || loading) return;
  if (!recipe && !ask) { bar.hidden = true; return; }
  bar.hidden = false;
  const asking = !!ask;
  const c = asking ? ask.c : null;
  bar.classList.toggle('asking', asking);
  $('#h-recipe').textContent = asking ? c.name : recipe.name;
  const cat = categoryOf({ category: asking ? c.category : recipe.category });
  $('#recipeCat').textContent = cat.label || '';
  $('#recipeAspect').textContent = ASPECT_LABEL[asking ? c.aspect : recipe.aspect] || '';
  $('#recipeAsk').hidden = !asking;
  for (const id of ['recipeSlots', 'recipeHint', 'recipeActions', 'recipeProgress']) { const el = document.getElementById(id); if (el) el.hidden = asking; }
  $('#recipeStop').hidden = asking;
  if (asking) return;

  const p = progress();
  const chip = $('#recipeProgress');
  const done = p.total > 0 && p.filled === p.total;
  chip.textContent = `사진 ${p.filled}/${p.total} 바꿈${done ? ' ✓' : ''}${p.extra ? ` · 장면 ${p.extra}개 추가` : ''}`;
  chip.className = `kchip${done ? ' on' : ''}`;
  renderSlots();
  $('#recipeHint').textContent = hintText();
  const changedCount = scenesNow().filter((s) => s.img && !s.sample).length;
  const refineBtn = $('#recipeRefine');
  refineBtn.disabled = !job && !changedCount;
  refineBtn.textContent = job ? 'AI 가 대본을 다듬는 중…' : 'AI 로 사진에 맞춰 대본 다듬기';
  refineBtn.setAttribute('aria-busy', String(!!job));
  $('#recipeRefineStop').hidden = !job;
  $('#recipeFill').hidden = !!job || !(p.filled > 0 && p.open.length > 0);
  const filledIds = new Set(recipe.slots.filter((sl) => sl.filled).flatMap((sl) => sl.targets.map((t) => t.sceneId)));
  const emptyScene = scenesNow().some((s) => s.sample && !filledIds.has(s.id) && s.kind !== 'cta');
  $('#recipeTrim').hidden = !!job || !(p.filled > 0 && p.open.length > 0 && emptyScene); // 사진을 하나라도 넣은 뒤에만(처음부터 장면을 빼는 길로 이끌지 않게)
  $('#recipeRestyle').hidden = api.project.style === recipe.styleId && api.project.aspect === recipe.aspect;
  $('#recipeFiles').disabled = !!job;
}

// ── 시작 ─────────────────────────────────────────────
/**
 * 레시피 바를 연결합니다. shorts.js 가 initListing(api) 다음에 부릅니다.
 * @param {object} shortsApi  shorts.js 의 api(project·audio·newScene·setScenes·applyStyle·registerPhotoSink…)
 */
export function initRecipe(shortsApi) {
  if (api || !$('#recipeBar')) return;
  api = shortsApi;
  api.registerRecipeHooks({
    replaced: onSceneImage,
    snapshot,
    restore,
    linesApplied() { if (recipe) announce('직접 넣은 대본으로 자막이 바뀌었습니다(사례 읽을 문장은 비웠습니다).'); },
    styled(st) {
      if (!recipe || loading) return;
      styleNote = st && st.id !== recipe.styleId ? `스타일을 「${st.name}」로 바꿨습니다. 사례 그대로 돌아가려면 「사례 스타일로 되돌리기」.` : '';
      renderBar();
    },
  });
  $('#recipeFiles').addEventListener('change', (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (files.length) api.addImageFiles(files);
  });
  $('#recipeRefine').addEventListener('click', refine);
  $('#recipeRefineStop').addEventListener('click', () => job?.abort.abort());
  $('#recipeFill').addEventListener('click', fillRemaining);
  $('#recipeTrim').addEventListener('click', trimEmpty);
  $('#recipeRestyle').addEventListener('click', () => {
    if (!recipe) return;
    api.applyStyle(recipe.styleId, { keepScenes: true });
    api.setAspect(recipe.aspect);
    styleNote = '';
    renderBar();
    announce('사례 스타일로 되돌렸습니다.');
  });
  $('#recipeStop').addEventListener('click', () => {
    stop();
    $('#sceneDrop input')?.focus({ preventScroll: true });
  });
  $('#recipeAskLoad').addEventListener('click', () => {
    if (!ask) return;
    const c = ask.c;
    loadCase(c).catch((e) => { console.error('recipe', e); toast(e?.message || '사례를 불러오지 못했습니다.'); });
  });
  $('#recipeAskSave').addEventListener('click', () => api.saveProject());
  $('#recipeAskCancel').addEventListener('click', () => { ask = null; renderBar(); toast('사례를 불러오지 않았습니다. 장면은 그대로입니다.'); });
  // 장면·설정이 바뀔 때마다 바도 따라갑니다(순서·✕·사진 바꾸기). 장면을 모두 지우면 레시피도 끝냅니다.
  api.onChange(() => {
    if (!recipe || loading) return;
    if (!scenesNow().length) { stop({ quiet: true }); toast('장면을 모두 지워 사례 모드를 끝냈습니다.'); return; }
    renderBar();
  });
  renderBar();
  if (pendingFollow) { const { id, opts } = pendingFollow; pendingFollow = null; followCase(id, opts); }
}
