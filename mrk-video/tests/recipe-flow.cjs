// 따라하기(레시피) 흐름 점검(Playwright) — 사례를 고르면 숏폼 화면에 그대로 실리고, 사진만 넣으면 자리 순서대로 들어가는지 실제로 눌러 봅니다.
//  외부 AI 는 진짜 키가 없으므로 page.route 모의 응답(RECIPE_SCHEMA 모양)으로 막습니다. 사진은 ffmpeg 로 만든 단색 JPEG.
//  (B) #follow=<id> 로 들어오기(갤러리의 「이대로 따라하기」 링크가 있으면 그 링크로) → 주소 #shorts, 레시피 바·장면·제목·엔딩·비율·음악·스타일·초점
//  (C) 레시피 바 「사진 넣기」 2장 → 자리 1·2 만 바뀜(같은 사진을 쓰는 장면도), 자막·태그·도장·길이 그대로, 미리보기 픽셀, 남은 예시
//  (C2) 「남은 자리 채우기」 → 돌려 채움, 예시 0.  (N) 「사례 그만」 → 바 숨김·장면 그대로 → 다시 따라하기(사진 있음) → 묻는 상태 → 취소 → 불러오기
//  (D) 자리보다 사진이 많을 때 → 마지막 마무리 앞에 추가 장면(extraScene 틀·'추가한 사진'), 슬롯 띠에 +  (E) 매물 상자 ① 로 1장 + ② 상호·연락처 → 채널·엔딩 부제·brand, 엔딩 문구는 사례 그대로
//  (F) 장면 순서를 바꾼 뒤 넣으면 바뀐 순서의 첫 빈 자리로, ✕ 로 지우면 자리 수가 줆  (G) AI 다듬기 — 키 없음 → 키 칸 펼침  (G2) 제미나이 모의 응답 → 자막·읽을 문장만 바뀜, 과장어 경고, 제목 교체
//  (G3) 다듬는 중 「멈춤」 → 잠금 해제  (H) 다른 스타일 → 장면 유지 → 「사례 스타일로 되돌리기」  (I) 예시가 남은 채 「영상 만들기」·「전부 만들기」 → 한 번 더 누르기, 광고용 추천 필터
//  (J) 프로젝트 저장(.json 의 recipe·slot·stamp·brand·ending.cta·모션 어휘, 키 없음) → 열기(바 복원)  (L) 16:9 사례 → 비율 경고·안내  (M) 400px 가로 넘침 없음·다크 캡처
//  (O) 접근성(role·aria)  (K) 주소로 바로 접속: #follow=<id>, 모르는 id, #case-follow  (I2) 첫 화면 예시(사례 모드 아님)는 관문 없이 바로 만들기  콘솔 오류 0
// 결과: tests/out/recipe/report.json + 스크린샷. 종료 코드 0/1. 정적 서버가 http://127.0.0.1:5173/ 에 떠 있어야 합니다.
//   LANG=C.UTF-8 node tests/recipe-flow.cjs
// 새 어휘(photoIn·deco·extras·fx·titleAnim·brand·ending.cta·stamp)는 엔진이 같이 바뀌는 중이라 그리기 결과는 보지 않고, 프로젝트·.json·select 에 오가는지만 봅니다.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { chromium } = require('/opt/node-tools/node_modules/playwright');

const BASE = process.env.MRK_BASE || 'http://127.0.0.1:5173';
const OUT = path.join(__dirname, 'out', 'recipe');
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const KEYS = { gemini: 'AIzaSyTEST-recipe-gemini-0001' };
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, GET, OPTIONS' };
const EXPECTED_404 = /\/assets\/samples\/[^/]+\.jpg$|favicon/;
const CASE_A = 'apt-sale-tour'; // 자리 5(외관·거실·주방·안방·욕실), 장면 7(6번 장면이 자리 1 을 같이 씀), 마지막 cta
const CASE_B = 'fc-franchise-ask'; // 자리 6, 장면 7
const CASE_WIDE = 'ai-cohort-recruit'; // 16:9
const OFFICE = { name: '미스터홈즈공인중개사사무소', phone: '031-000-0000' };

/** 모의 다듬기 응답(RECIPE_SCHEMA 모양). 장면 수를 모르므로 10개를 보내고 앱이 범위 밖을 버리게 둡니다. 2번 장면에 과장어(최고). */
function recipeJSON(tag) {
  const scenes = [];
  for (let i = 0; i < 10; i++) {
    scenes.push({
      index: i,
      caption: i === 1 ? `${tag} 최고의 *햇살* 거실입니다` : `${tag} 다듬은 자막 ${i + 1} *포인트* 확인`,
      narration: `${tag} 다듬은 읽을 문장 ${i + 1}번입니다. 사진에 보이는 것만 말합니다.`,
    });
  }
  return { title: `${tag} 새로 쓴 *제목*\\n두 줄`, scenes, upload: { description: `${tag} 다듬은 업로드 설명입니다. 두 문장입니다.`, hashtags: ['#아파트', '#매매', '남향'] } };
}

/** 단색 테스트 JPEG(1600×1200) */
function makeJpeg(file, color) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `color=c=${color}:s=1600x1200`, '-frames:v', '1', '-q:v', '3', file], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg jpeg 실패: ${r.stderr}`);
  return file;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const checks = [];
  const report = { ok: true, checks: [], failed: [], consoleErrors: [], expected404: [], calls: { gemini: [] }, info: {} };
  const check = (name, ok, detail) => {
    checks.push({ name, ok: !!ok, detail: detail === undefined ? '' : (typeof detail === 'string' ? detail : JSON.stringify(detail)) });
    console.log(`${ok ? 'OK ' : 'NG '} ${name}${!ok && detail !== undefined ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
  };
  const colors = ['0xd94a3a', '0x3aa65a', '0x3a6ad9', '0xd9a53a', '0x8e3ad9', '0x3ad9c8', '0xd93a9a', '0x7a7a7a'];
  const photos = colors.map((c, i) => makeJpeg(path.join(OUT, `photo-${i + 1}.jpg`), c));
  let geminiDelay = 0;
  let geminiTag = 'R1';

  const browser = await chromium.launch({ executablePath: EXE, args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    const routeAll = async (c) => {
      await c.route('**/api/health', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ai: false, proxy: true, needsCode: false, youtube: false, tts: true, gate: true, member: '관리자', owner: true }) }));
      await c.route('https://generativelanguage.googleapis.com/**', async (route) => {
        const rq = route.request();
        if (rq.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
        const body = rq.postDataJSON();
        report.calls.gemini.push({ url: rq.url(), body });
        if (geminiDelay) await new Promise((r) => setTimeout(r, geminiDelay));
        const json = recipeJSON(geminiTag);
        return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify(json) }] }, finishReason: 'STOP' }] }) });
      });
    };
    await routeAll(ctx);
    const wireErrors = (page, label = '') => {
      const pending404 = [];
      page.on('response', (r) => { if (r.status() === 404) pending404.push(r.url()); });
      page.on('console', (m) => {
        if (m.type() !== 'error') return;
        if (/404/.test(m.text())) {
          const url = pending404.shift() || '';
          if (EXPECTED_404.test(url)) { report.expected404.push(url); return; }
          report.consoleErrors.push(`${label}console.error: ${m.text()} ${url}`);
          return;
        }
        report.consoleErrors.push(`${label}console.error: ${m.text()}`);
      });
      page.on('pageerror', (e) => report.consoleErrors.push(`${label}pageerror: ${e.message}`));
    };
    const page = await ctx.newPage();
    wireErrors(page);

    await page.goto(`${BASE}/#showcase`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.querySelectorAll('#styleStrip .style-card').length > 0 && document.querySelectorAll('#sceneList .scene').length > 0, null, { timeout: 20000 });
    await page.waitForTimeout(800);

    // ── 도우미 ──
    const caseOf = (id) => page.evaluate(async (cid) => {
      const { findCase } = await import('/js/cases-data.js');
      const c = findCase(cid);
      return c ? { id: c.id, name: c.name, title: c.title, ending: c.ending, aspect: c.aspect, style: c.style, music: c.music, category: c.category, scenes: c.scenes.map((s) => ({ slot: s.slot ?? null, img: !!s.img, caption: s.caption, narration: s.narration || '', kind: s.kind || 'normal', tag: s.tag || '', stamp: s.stamp || '', duration: s.duration, hint: s.hint || '' })), extraScene: c.extraScene } : null;
    }, id);
    const barState = () => page.evaluate(() => ({
      hash: location.hash,
      shorts: !document.querySelector('#view-shorts').hidden,
      barHidden: document.querySelector('#recipeBar').hidden,
      asking: !document.querySelector('#recipeAsk').hidden,
      head: document.querySelector('#h-recipe').textContent,
      cat: document.querySelector('#recipeCat').textContent,
      aspectChip: document.querySelector('#recipeAspect').textContent,
      progress: document.querySelector('#recipeProgress').textContent,
      progressOn: document.querySelector('#recipeProgress').classList.contains('on'),
      hint: document.querySelector('#recipeHint').textContent,
      status: document.querySelector('#recipeStatus').textContent,
      slots: [...document.querySelectorAll('#recipeSlots li')].map((li) => ({ sample: li.classList.contains('sample'), extra: li.classList.contains('extra'), no: li.querySelector('b').textContent, hint: li.querySelector('span').textContent, label: li.querySelector('button').getAttribute('aria-label') })),
      fill: !document.querySelector('#recipeFill').hidden, trim: !document.querySelector('#recipeTrim').hidden, restyle: !document.querySelector('#recipeRestyle').hidden,
      refineDisabled: document.querySelector('#recipeRefine').disabled, refineText: document.querySelector('#recipeRefine').textContent, stopVisible: !document.querySelector('#recipeRefineStop').hidden,
      focus: document.activeElement?.id,
    }));
    const sceneState = () => page.evaluate(() => [...document.querySelectorAll('#sceneList .scene')].map((li) => ({
      id: li.dataset.id,
      caption: li.querySelector('textarea').value,
      duration: Number(li.querySelector('input[type=number]').value),
      kind: li.querySelector('select').value,
      tag: li.querySelector('input[placeholder^="태그"]').value,
      stamp: li.querySelector('.scene-stamp').value,
      src: li.querySelector('.scene-thumb img')?.src || '',
      sample: li.querySelector('.scene-thumb').classList.contains('sample'),
      tags: [...li.querySelectorAll('.tag')].map((t) => t.textContent),
      meta: li.querySelector('.scene-meta').textContent,
    })));
    const controls = () => page.evaluate(() => ({
      title: document.querySelector('#title').value, channel: document.querySelector('#channel').value,
      endingText: document.querySelector('#endingText').value, endingSub: document.querySelector('#endingSub').value, endingCta: document.querySelector('#endingCta').value, endingOn: document.querySelector('#endingOn').checked,
      aspect: document.querySelector('#aspect').value, styleMusic: document.querySelector('#styleMusic').value,
      style: document.querySelector('#styleStrip .style-card[aria-pressed="true"]')?.dataset.id || '',
      brandName: document.querySelector('#brandName').value, brandPhone: document.querySelector('#brandPhone').value,
      photoIn: document.querySelector('#photoIn').value, photoFit: document.querySelector('#photoFit').value, titleAnim: document.querySelector('#titleAnim').value, deco: document.querySelector('#deco').value,
      extras: [...document.querySelectorAll('#extrasField input[data-extra]')].filter((i) => i.checked).map((i) => i.dataset.extra), fx: document.querySelector('#fx').checked,
      scriptText: document.querySelector('#scriptText').value,
    }));
    /** #follow=<id> 로 들어가 묻는 상태면 「불러오기」까지. 바가 그 사례 이름으로 바뀔 때까지 기다립니다. */
    const follow = async (id, { viaLink = false } = {}) => {
      const c = await caseOf(id);
      if (viaLink) {
        const link = await page.$(`a[href="#follow=${id}"]`);
        if (link) { await link.scrollIntoViewIfNeeded(); await link.click(); } else await page.evaluate((h) => { location.hash = h; }, `#follow=${id}`);
      } else await page.evaluate((h) => { location.hash = h; }, `#follow=${id}`);
      await page.waitForFunction((name) => !document.querySelector('#recipeBar').hidden && document.querySelector('#h-recipe').textContent === name, c.name, { timeout: 15000 });
      await page.waitForTimeout(150);
      const asked = await page.evaluate(() => !document.querySelector('#recipeAsk').hidden);
      if (asked) {
        await page.click('#recipeAskLoad');
        await page.waitForFunction(() => document.querySelector('#recipeAsk').hidden && /^사진 0\//.test(document.querySelector('#recipeProgress').textContent), null, { timeout: 15000 });
      }
      await page.waitForTimeout(300);
      return c;
    };
    const dominant = ([r, g, b]) => (r > g + 40 && r > b + 40 ? 'red' : g > r + 40 && g > b + 40 ? 'green' : b > r + 40 && b > g + 40 ? 'blue' : 'other');
    /** 미리보기를 t초로 옮긴 뒤 캔버스 곳곳(가로 5×세로 7)의 색 이름 묶음 */
    const previewColorsAt = (t) => page.evaluate((tt) => {
      const total = Number(document.querySelector('#timecode').textContent.split('/')[1].trim().split(':').reduce((a, v) => a * 60 + Number(v), 0));
      const s = document.querySelector('#scrub');
      s.value = String(Math.round((tt / total) * 1000));
      s.dispatchEvent(new Event('input'));
      const c = document.querySelector('#previewCanvas');
      const g = c.getContext('2d');
      const out = [];
      for (let y = 1; y <= 7; y++) for (let x = 1; x <= 5; x++) {
        const d = g.getImageData(Math.round((c.width * x) / 6), Math.round((c.height * y) / 8), 1, 1).data;
        out.push([d[0], d[1], d[2]]);
      }
      return out;
    }, t);
    const setFiles = (sel, files) => page.setInputFiles(sel, files);
    const waitProgress = (re) => page.waitForFunction((src) => new RegExp(src).test(document.querySelector('#recipeProgress').textContent), re.source, { timeout: 15000 });

    // ═══ (B) 이대로 따라하기 ═══
    let cA;
    {
      cA = await follow(CASE_A, { viaLink: true });
      const b = await barState();
      const sc = await sceneState();
      const ct = await controls();
      report.info.follow = { b, ct, scenes: sc.length };
      check('B: 주소가 #shorts 로 바뀌고 숏폼 화면·레시피 바가 보임', b.hash === '#shorts' && b.shorts && !b.barHidden && !b.asking, { hash: b.hash, shorts: b.shorts, barHidden: b.barHidden });
      check('B: 바 머리 = 사례 이름·용도·비율 칩·진행 0/5', b.head === cA.name && b.cat === '매물' && b.aspectChip === '9:16 쇼츠' && b.progress === '사진 0/5 바꿈', { head: b.head, cat: b.cat, aspect: b.aspectChip, progress: b.progress });
      check('B: 장면 수 = 사례 장면 수, 사진 장면은 모두 예시(썸네일 .sample + 자리 태그)', sc.length === cA.scenes.length && sc.filter((s) => s.sample).length === cA.scenes.filter((s) => s.img).length && sc.filter((s) => s.tags.some((t) => /^자리 \d/.test(t))).length === cA.scenes.filter((s) => s.img).length, { scenes: sc.length, samples: sc.filter((s) => s.sample).length });
      check('B: 자막·읽을 문장·종류·태그·도장·길이가 사례 데이터 그대로(도장 칸에 "남향")', sc.every((s, i) => s.caption === cA.scenes[i].caption && s.kind === cA.scenes[i].kind && s.tag === cA.scenes[i].tag && s.stamp === cA.scenes[i].stamp && s.duration === cA.scenes[i].duration) && sc[0].stamp === '남향' && ct.scriptText.split('\n').length === cA.scenes.length, sc.map((s) => [s.caption, s.tag, s.stamp]));
      check('B: 제목·엔딩(문구·부제·버튼)·비율·음악·스타일 = 사례 데이터', ct.title === cA.title && ct.endingText === cA.ending.text && ct.endingSub === 'MR.K 고상철' && ct.endingCta === cA.ending.cta && ct.endingOn && ct.aspect === cA.aspect && ct.styleMusic === cA.music && ct.style === cA.style, ct);
      check('B: 광고 스타일의 모션 어휘가 세부 조절 칸에 보임(photoIn push·extras stamp+lower3·fx)', ct.photoIn === 'push' && ct.photoFit === 'smart' && ct.extras.includes('lower3') && ct.extras.includes('stamp') && ct.fx === true, { photoIn: ct.photoIn, photoFit: ct.photoFit, extras: ct.extras, fx: ct.fx });
      check('B: 초점이 레시피 바 제목(#h-recipe), 상태 줄에 "불러왔습니다"', b.focus === 'h-recipe' && /불러왔습니다/.test(b.status), { focus: b.focus, status: b.status });
      check('B: 슬롯 띠 5칸, 모두 예시, 라벨 = 사진 제안(외관…)', b.slots.length === 5 && b.slots.every((s) => s.sample) && b.slots.map((s) => s.hint).join() === '외관,거실,주방,안방,욕실' && /자리 1 \(예시 사진 · 외관\)/.test(b.slots[0].label), b.slots);
      check('B: 전환·장식 select 에 새 값(flash·push / lower3·stamp·ribbon)이 있음', await page.evaluate(() => ['flash', 'push'].every((v) => [...document.querySelectorAll('#transition option')].some((o) => o.value === v)) && ['lower3', 'stamp', 'ribbon'].every((v) => [...document.querySelectorAll('#overlay option')].some((o) => o.value === v))));
      await page.screenshot({ path: path.join(OUT, '01-follow.png') });
    }

    // ═══ (C) 레시피 바 「사진 넣기」 2장 ═══
    let before;
    {
      before = await sceneState();
      await setFiles('#recipeFiles', photos.slice(0, 2));
      await waitProgress(/^사진 2\/5 바꿈$/);
      await page.waitForTimeout(300);
      const b = await barState();
      const sc = await sceneState();
      report.info.photos2 = { b, srcs: sc.map((s) => s.src.slice(0, 5)) };
      check('C: 진행 칩 "사진 2/5 바꿈", 슬롯 1·2 채움·3~5 예시, 「남은 자리 채우기」 보임', b.progress === '사진 2/5 바꿈' && !b.progressOn && b.slots.map((s) => s.sample).join() === 'false,false,true,true,true' && b.fill && b.trim, b);
      check('C: 장면 1·2 썸네일이 내 사진(blob:), 자리 1 을 같이 쓰는 6번 장면도 같은 사진', sc[0].src.startsWith('blob:') && sc[1].src.startsWith('blob:') && sc[5].src === sc[0].src && sc[1].src !== sc[0].src, { s0: sc[0].src.slice(0, 10), s5: sc[5].src.slice(0, 10) });
      check('C: 자막·태그·도장·길이·종류는 그대로', sc.every((s, i) => s.caption === before[i].caption && s.tag === before[i].tag && s.stamp === before[i].stamp && s.duration === before[i].duration && s.kind === before[i].kind && s.id === before[i].id));
      check('C: 남은 예시 3장(장면 3·4·5), 바뀐 장면은 "예시" 태그 없음', sc.filter((s) => s.sample).map((s) => s.id).join() === [before[2].id, before[3].id, before[4].id].join() && !sc[0].tags.some((t) => /예시/.test(t)), sc.map((s) => s.sample));
      check('C: 안내 줄에 남은 자리(주방·안방·욕실)와 「남은 자리 채우기」 안내', /사진 2\/5 바꿈/.test(b.hint) && /주방·안방·욕실/.test(b.hint) && /남은 자리 채우기/.test(b.hint), b.hint);
      const cols = await previewColorsAt(2.8 + 1.6); // 2번 장면(거실, 초록) 가운데쯤
      const names = cols.map(dominant);
      check('C: 미리보기 2번 장면 시각에 초록 사진이 보임', names.includes('green'), names.join(','));
      check('C: 「AI 로 사진에 맞춰 대본 다듬기」 켜짐', !b.refineDisabled);
      await page.screenshot({ path: path.join(OUT, '02-photos.png') });
    }

    // ═══ (C2) 남은 자리 채우기 ═══
    {
      await page.click('#recipeFill');
      await waitProgress(/^사진 5\/5 바꿈 ✓$/);
      await page.waitForTimeout(200);
      const b = await barState();
      const sc = await sceneState();
      check('C2: "사진 5/5 바꿈 ✓"(.on), 장면 3·4·5 가 빨강·초록·빨강 순으로 돌려 채워짐, 예시 0', b.progressOn && sc[2].src === sc[0].src && sc[3].src === sc[1].src && sc[4].src === sc[0].src && sc.filter((s) => s.sample).length === 0 && !sc.some((s) => s.tags.some((t) => /예시/.test(t))) && !b.fill && !b.trim, { progress: b.progress, samples: sc.filter((s) => s.sample).length });
      check('C2: 안내 줄이 "이제 AI 다듬기 또는 ④ 목소리 → ⑤ 영상" 으로', /사진 5\/5 바꿈/.test(b.hint) && /AI 로 사진에 맞춰 대본 다듬기/.test(b.hint), b.hint);
    }

    // ═══ (N) 사례 그만 → 다시 따라하기(묻기) → 취소 → 불러오기 ═══
    {
      const ids0 = (await sceneState()).map((s) => s.id);
      await page.click('#recipeStop');
      await page.waitForTimeout(300);
      const b1 = await barState();
      const sc1 = await sceneState();
      check('N: 「사례 그만」 → 바 숨김, 장면 그대로(자리 태그 유지), 초점은 장면 사진 추가 칸', b1.barHidden && sc1.map((s) => s.id).join() === ids0.join() && sc1[0].tags.includes('자리 1') && b1.focus === 'sceneFiles', { hidden: b1.barHidden, focus: b1.focus });
      // 사진이 있는 상태에서 다시 따라하기 → 묻는 상태
      await page.evaluate((h) => { location.hash = h; }, `#follow=${CASE_A}`);
      await page.waitForFunction(() => !document.querySelector('#recipeBar').hidden && !document.querySelector('#recipeAsk').hidden, null, { timeout: 10000 });
      const ask = await page.evaluate(() => ({
        text: document.querySelector('#recipeAskText').textContent, focus: document.activeElement?.id, hash: location.hash,
        group: document.querySelector('#recipeAsk [role="group"]')?.getAttribute('aria-label'),
        slotsHidden: document.querySelector('#recipeSlots').hidden, actionsHidden: document.querySelector('#recipeActions').hidden,
      }));
      check('N: 사용자 사진이 있으면 바 안에서 "불러올까요?" 로 묻고(확인창 없음) 초점은 「불러오기」, 슬롯·버튼은 숨김', /불러올까요\?/.test(ask.text) && /장면 7개/.test(ask.text) && ask.focus === 'recipeAskLoad' && ask.group === '사례 불러오기 확인' && ask.slotsHidden && ask.actionsHidden && ask.hash === '#shorts', ask);
      await page.click('#recipeAskCancel');
      await page.waitForTimeout(200);
      const b2 = await barState();
      const sc2 = await sceneState();
      check('N: 「취소」 → 장면 그대로·바 숨김', b2.barHidden && sc2.map((s) => s.id).join() === ids0.join());
      await page.evaluate((h) => { location.hash = h; }, `#follow=${CASE_A}`);
      await page.waitForFunction(() => !document.querySelector('#recipeAsk').hidden, null, { timeout: 10000 });
      await page.click('#recipeAskLoad');
      await waitProgress(/^사진 0\/5 바꿈$/);
      await page.waitForTimeout(300);
      const sc3 = await sceneState();
      check('N: 「불러오기」 → 사례 장면으로 교체(새 id·모두 예시)', sc3.length === cA.scenes.length && sc3.every((s) => !ids0.includes(s.id)) && sc3.filter((s) => s.sample).length === 6, { n: sc3.length });
    }

    // ═══ (D) 자리보다 사진이 많을 때 ═══
    {
      const cB = await follow(CASE_B);
      const n0 = (await sceneState()).length;
      await setFiles('#recipeFiles', photos.slice(0, 8));
      await waitProgress(/^사진 6\/6 바꿈 ✓ · 장면 2개 추가$/);
      await page.waitForTimeout(300);
      const b = await barState();
      const sc = await sceneState();
      const ex1 = String(cB.extraScene.caption).replaceAll('{n}', '7');
      const ex2 = String(cB.extraScene.caption).replaceAll('{n}', '8');
      report.info.extra = { b, captions: sc.map((s) => s.caption) };
      check('D: 장면 7 + 추가 2 = 9, 추가 장면은 마지막 마무리(cta) 앞', sc.length === n0 + 2 && sc[8].kind === 'cta' && sc[6].kind === 'normal' && sc[7].kind === 'normal', { n: sc.length, kinds: sc.map((s) => s.kind) });
      check('D: 추가 장면 자막 = extraScene 틀({n} → 장면 번호), 사진 제안 "추가한 사진", 자리 7·8', sc[6].caption === ex1 && sc[7].caption === ex2 && /추가한 사진/.test(sc[6].meta) && sc[6].tags.includes('자리 7') && sc[7].tags.includes('자리 8'), { c6: sc[6].caption, c7: sc[7].caption, ex1 });
      check('D: 슬롯 띠 8칸(6 + 추가 2, .extra), 모두 채움, 안내에 "장면 2개를 더 만들었습니다"', b.slots.length === 8 && b.slots.filter((s) => s.extra).length === 2 && b.slots.every((s) => !s.sample) && /장면 2개를 더 만들었습니다/.test(b.hint), { slots: b.slots.length, hint: b.hint });
      check('D: 추가 장면 사진은 7·8번째 사진(남은 순서대로)', sc[6].src.startsWith('blob:') && sc[7].src.startsWith('blob:') && sc[6].src !== sc[7].src && !sc.slice(0, 6).some((s) => s.src === sc[6].src));
      await page.screenshot({ path: path.join(OUT, '03-extra.png') });
    }

    // ═══ (E) 매물 상자 ① 로 1장 + ② 상호·연락처 ═══
    {
      await follow(CASE_A);
      await setFiles('#lsFiles', photos.slice(0, 1));
      await waitProgress(/^사진 1\/5 바꿈$/);
      await page.waitForTimeout(300);
      const sc = await sceneState();
      check('E: 매물 상자 ① 사진 1장 → 같은 자리 규칙(장면 추가 없음, 자리 1 = 장면 1·6)', sc.length === cA.scenes.length && sc[0].src.startsWith('blob:') && sc[5].src === sc[0].src && sc[1].sample, { n: sc.length });
      const ct0 = await controls();
      check('E: ① 로 넣어도 따라하기 중에는 사례 제목(훅 문구)·엔딩 문구 그대로', ct0.title === cA.title && ct0.endingText === cA.ending.text, { title: ct0.title, endingText: ct0.endingText });
      await page.click('#lsInfo > summary');
      await page.fill('#lsOfName', OFFICE.name);
      await page.fill('#lsOfPhone', OFFICE.phone);
      await page.waitForTimeout(500);
      const ct = await controls();
      const office = await page.evaluate(() => JSON.parse(localStorage.getItem('mrk:office') || '{}'));
      report.info.office = { ct, office };
      check('E: ② 상호·연락처 → 채널 = 상호, 엔딩 부제 = "상호 전화", 엔딩 문구는 사례 그대로(keepText)', ct.channel === OFFICE.name && ct.endingSub === `${OFFICE.name} ${OFFICE.phone}` && ct.endingText === cA.ending.text, { channel: ct.channel, sub: ct.endingSub, text: ct.endingText });
      check('E: brand(상호·연락처 칸) 도 함께, store "office" 에 기억', ct.brandName === OFFICE.name && ct.brandPhone === OFFICE.phone && office.name === OFFICE.name, { brandName: ct.brandName, brandPhone: ct.brandPhone, office });
      await page.screenshot({ path: path.join(OUT, '04-listing.png') });
    }

    // ═══ (F) 순서 바꾼 뒤 넣기 · ✕ ═══
    {
      const sc0 = await sceneState();
      await page.click('#sceneList .scene:nth-child(2) .scene-tools button[title="아래로"]'); // 거실(자리 2)을 주방(자리 3) 아래로
      await page.waitForTimeout(200);
      const sc1 = await sceneState();
      const b1 = await barState();
      check('F: 장면 ↓ → 슬롯 띠도 장면 순서(외관·주방·거실·안방·욕실)', sc1[1].id === sc0[2].id && b1.slots.map((s) => s.hint).join() === '외관,주방,거실,안방,욕실', b1.slots.map((s) => s.hint));
      await setFiles('#recipeFiles', photos.slice(1, 2));
      await waitProgress(/^사진 2\/5 바꿈$/);
      await page.waitForTimeout(200);
      const sc2 = await sceneState();
      check('F: 1장 넣으면 바뀐 순서의 첫 빈 자리(주방, 자리 3)로', sc2[1].src.startsWith('blob:') && sc2[1].id === sc0[2].id && sc2[2].sample && sc2[2].id === sc0[1].id, { s1: sc2[1].src.slice(0, 5), s2sample: sc2[2].sample });
      await page.click('#sceneList .scene:nth-child(5) .scene-tools button[title="지우기"]'); // 욕실(자리 5, 예시) 빼기
      await page.waitForTimeout(200);
      const b2 = await barState();
      const sc3 = await sceneState();
      check('F: 예시 자리 장면 ✕ → "사진 2/4 바꿈", 슬롯 4칸', b2.progress === '사진 2/4 바꿈' && b2.slots.length === 4 && sc3.length === cA.scenes.length - 1, { progress: b2.progress, slots: b2.slots.length });
    }

    // ═══ (G) AI 다듬기 — 키 없음 ═══
    {
      await page.click('#recipeRefine');
      await page.waitForFunction(() => document.activeElement?.id === 'key-gemini', null, { timeout: 6000 }).catch(() => {});
      const g = await page.evaluate(() => ({ expanded: document.querySelector('#keyToggle').getAttribute('aria-expanded'), focus: document.activeElement?.id, status: document.querySelector('#recipeStatus').textContent, bad: document.querySelector('#recipeStatus').classList.contains('bad') }));
      check('G: 키 없음 → 키 칸 펼침·제미나이 칸에 커서·상태 문구', g.expanded === 'true' && g.focus === 'key-gemini' && /AI 키가 없습니다/.test(g.status) && g.bad, g);
    }

    // ═══ (G2) 제미나이 모의 응답으로 다듬기 ═══
    {
      await page.fill('#key-gemini', KEYS.gemini);
      await page.waitForTimeout(120);
      await page.click('#keyToggle');
      await page.fill('#title', cA.title); // 사례 제목 그대로일 때만 제목이 바뀌는지 보려고 되돌림
      await page.waitForTimeout(100);
      const before2 = await sceneState();
      const changedN = before2.filter((s) => s.src.startsWith('blob:')).length;
      await page.click('#recipeRefine');
      await page.waitForFunction(() => !document.querySelector('#recipeRefine').disabled && !/다듬는 중/.test(document.querySelector('#recipeRefine').textContent) && (document.querySelector('#recipeStatus').classList.contains('ok') || document.querySelector('#recipeStatus').classList.contains('bad')), null, { timeout: 20000 });
      await page.waitForTimeout(300);
      const call = report.calls.gemini[report.calls.gemini.length - 1];
      const parts = call?.body?.contents?.[0]?.parts || [];
      const inline = parts.filter((p) => p.inline_data).length; // 제미나이 REST 는 snake_case
      const text = parts.filter((p) => typeof p.text === 'string').map((p) => p.text).join('\n');
      const after = await sceneState();
      const ct = await controls();
      const b = await barState();
      report.info.refine = { inline, changedN, status: b.status, title: ct.title };
      check('G2: 요청의 사진 수 = 바뀐 사진 장면 수(예시 장면은 보내지 않음), 응답 스키마(index·caption·narration)', inline === changedN && changedN === 3 && /장면 수: 6개/.test(text) && /예시 사진 그대로/.test(text) && JSON.stringify(call.body.generationConfig || call.body).includes('narration'), { inline, changedN });
      check('G2: 자막·읽을 문장만 바뀜(장면 수·순서·종류·태그·도장·사진 동일)', after.length === before2.length && after.every((s, i) => s.id === before2[i].id && s.kind === before2[i].kind && s.tag === before2[i].tag && s.stamp === before2[i].stamp && s.src === before2[i].src && s.caption !== before2[i].caption && /다듬은 자막|햇살/.test(s.caption)), after.map((s) => s.caption));
      const lines = await page.evaluate(() => ({ hidden: document.querySelector('#lsScript').hidden, n: document.querySelectorAll('#lsScript li').length, nar: document.querySelector('#lsScript li textarea')?.value || '' }));
      check('G2: 매물 상자 ③ 대본 목록에 읽을 문장이 보임, 대본 칸(#scriptText)도 새 자막', !lines.hidden && lines.n === after.length && /다듬은 읽을 문장/.test(lines.nar) && ct.scriptText.split('\n')[0] === after[0].caption, lines);
      check('G2: 상태에 "다듬었습니다" + 과장 표현 경고(최고)', /다듬었습니다/.test(b.status) && /과장 표현으로 보일 수 있는 말: 최고/.test(b.status), b.status);
      check('G2: 사례 제목 그대로였으므로 제목 교체, 업로드 글 갱신', ct.title === 'R1 새로 쓴 *제목*\n두 줄' && (await page.evaluate(() => document.querySelector('#uploadText').textContent)).includes('다듬은 업로드 설명'), { title: ct.title });
      await page.screenshot({ path: path.join(OUT, '05-refine.png') });
    }

    // ═══ (G3) 다듬는 중 멈춤 ═══
    {
      geminiDelay = 4000;
      geminiTag = 'R2';
      await page.click('#recipeRefine');
      await page.waitForFunction(() => !document.querySelector('#recipeRefineStop').hidden && /다듬는 중/.test(document.querySelector('#recipeRefine').textContent), null, { timeout: 6000 });
      const mid = await page.evaluate(() => ({ busy: document.querySelector('#recipeRefine').getAttribute('aria-busy'), filesDisabled: document.querySelector('#recipeFiles').disabled, slotDisabled: document.querySelector('#recipeSlots button')?.disabled }));
      // 잠긴 동안 장면 ✕ 를 눌러도 지워지지 않아야 함
      const n0 = (await sceneState()).length;
      await page.click('#sceneList .scene:last-child .scene-tools button[title="지우기"]');
      await page.waitForTimeout(200);
      const nLocked = (await sceneState()).length;
      await page.click('#recipeRefineStop');
      await page.waitForFunction(() => /멈췄습니다/.test(document.querySelector('#recipeStatus').textContent), null, { timeout: 8000 });
      geminiDelay = 0;
      const b = await barState();
      await page.click('#addTextScene');
      await page.waitForTimeout(150);
      const nAfter = (await sceneState()).length;
      await page.click('#sceneList .scene:last-child .scene-tools button[title="지우기"]');
      await page.waitForTimeout(150);
      const nBack = (await sceneState()).length;
      check('G3: 다듬는 중엔 aria-busy·사진 넣기·슬롯 버튼 잠김, 장면 ✕ 도 막힘 → 「멈춤」 → "멈췄습니다", 잠금 해제(장면 추가·✕ 됨)', mid.busy === 'true' && mid.filesDisabled && mid.slotDisabled && nLocked === n0 && !b.stopVisible && !b.refineDisabled && nAfter === n0 + 1 && nBack === n0, { mid, nLocked, n0, nAfter, nBack, status: b.status });
    }

    // ═══ (H) 다른 스타일 → 장면 유지 → 사례 스타일로 되돌리기 ═══
    {
      const ids0 = (await sceneState()).map((s) => s.id);
      const other = await page.evaluate((cur) => [...document.querySelectorAll('#styleStrip .style-card')].map((c) => c.dataset.id).find((id) => id !== cur), cA.style);
      await page.click(`#styleStrip .style-card[data-id="${other}"]`);
      await page.waitForTimeout(500);
      const b1 = await barState();
      const sc1 = await sceneState();
      const ct1 = await controls();
      check('H: 다른 스타일 카드 → 장면 id 그대로(스타일 예시로 바뀌지 않음), 「사례 스타일로 되돌리기」 보임, 안내 한 줄', sc1.map((s) => s.id).join() === ids0.join() && ct1.style === other && b1.restyle && /스타일을 「/.test(b1.hint), { style: ct1.style, restyle: b1.restyle });
      await page.click('#recipeRestyle');
      await page.waitForTimeout(400);
      const b2 = await barState();
      const ct2 = await controls();
      check('H: 되돌리기 → 사례 스타일 aria-pressed·비율 = 사례 비율, 버튼 숨김', ct2.style === cA.style && ct2.aspect === cA.aspect && !b2.restyle && (await sceneState()).map((s) => s.id).join() === ids0.join(), { style: ct2.style, aspect: ct2.aspect });
      await page.screenshot({ path: path.join(OUT, '06-restyle.png') });
    }

    // ═══ (I) 예시가 남은 채 영상 만들기·전부 만들기 — 한 번 더 누르기 ═══
    {
      await page.evaluate(() => {
        document.querySelectorAll('#sceneList input[type=number]').forEach((i) => { i.value = '0.5'; i.dispatchEvent(new Event('input')); });
        const e = document.querySelector('#endingDur'); e.value = '1'; e.dispatchEvent(new Event('input'));
        const q = document.querySelector('#quality'); q.value = '720'; q.dispatchEvent(new Event('input'));
      });
      const left = (await sceneState()).filter((s) => s.sample).length;
      await page.click('#exportBtn');
      await page.waitForTimeout(400);
      const first = await page.evaluate(() => ({ status: document.querySelector('#exportStatus').textContent, btn: document.querySelector('#exportBtn').textContent, result: !document.querySelector('#exportResult').hidden, ls: document.querySelector('#lsExportStatus').textContent }));
      check(`I: 예시 ${left}장 남은 채 첫 클릭 → "예시 사진 ${left}장이 아직…" 알림만(자리 번호 포함), 영상 안 만듦`, new RegExp(`예시 사진 ${left}장이 아직`).test(first.status) && /자리 \d/.test(first.status) && !/만들기 멈춤/.test(first.btn) && !first.result, first);
      await page.click('#exportBtn');
      await page.waitForFunction(() => /완성:|못했습니다|멈췄/.test(document.querySelector('#exportStatus').textContent) && !/만들기 멈춤/.test(document.querySelector('#exportBtn').textContent), null, { timeout: 60000 });
      const second = await page.evaluate(async () => {
        const v = document.querySelector('#resultVideo');
        const size = v.src ? (await (await fetch(v.src)).blob()).size : 0;
        return { status: document.querySelector('#exportStatus').textContent, result: !document.querySelector('#exportResult').hidden, size };
      });
      check('I: 두 번째 클릭 → 녹화 진행 → 결과 영상(720×1280)', /^완성: (MP4|WEBM) · 720×1280/.test(second.status) && second.result && second.size > 1000, second);
      // 광고용 추천 필터 + 전부 만들기 관문
      await page.click('#styleFilter .chipbtn[data-filter="ad"]');
      await page.waitForTimeout(200);
      const adInfo = await page.evaluate(async () => {
        const { STYLES } = await import('/js/styles.js');
        const ad = STYLES.filter((s) => s.ad);
        const cards = [...document.querySelectorAll('#styleStrip .style-card')];
        return {
          adCount: ad.length, adNames: ad.map((s) => s.name), total: STYLES.length,
          visible: cards.filter((c) => !c.hidden).map((c) => c.dataset.id), hiddenN: cards.filter((c) => c.hidden).length,
          badges: cards.filter((c) => c.querySelector('.ad-badge')).map((c) => c.dataset.id),
          pressed: [...document.querySelectorAll('#styleFilter .chipbtn')].map((b) => `${b.dataset.filter}:${b.getAttribute('aria-pressed')}`).join(','),
          btn: document.querySelector('#styleBatchBtn').textContent, stored: localStorage.getItem('mrk:styleFilter'),
        };
      });
      report.info.adFilter = adInfo;
      check('I: 「광고용 추천」 칩 → ad 스타일만 보임(나머지 hidden), 배지 = ad 스타일, store styleFilter, 버튼 "광고용 추천 N가지 만들기"', adInfo.visible.length === adInfo.adCount && adInfo.hiddenN === adInfo.total - adInfo.adCount && adInfo.badges.length === adInfo.adCount && adInfo.pressed === 'all:false,ad:true' && adInfo.btn === `광고용 추천 ${adInfo.adCount}가지 만들기` && adInfo.stored === '"ad"', { visible: adInfo.visible.length, adCount: adInfo.adCount, btn: adInfo.btn, pressed: adInfo.pressed });
      await page.click('#styleBatchBtn');
      await page.waitForTimeout(400);
      const gate = await page.evaluate(() => ({ status: document.querySelector('#batchStatus').textContent, btn: document.querySelector('#styleBatchBtn').textContent }));
      check('I: 「광고용 추천 N가지 만들기」 첫 클릭 → 같은 관문(예시 사진 알림), 시작 안 함', /예시 사진/.test(gate.status) && gate.btn !== '멈춤', gate);
      await page.click('#styleBatchBtn');
      await page.waitForFunction(() => document.querySelectorAll('#batchList .result-item').length >= 1, null, { timeout: 90000 });
      await page.click('#batchStop');
      await page.waitForFunction(() => document.querySelector('#styleBatchBtn').textContent !== '멈춤', null, { timeout: 60000 });
      const batch = await page.evaluate(() => ({ names: [...document.querySelectorAll('#batchList .result-item b')].map((b) => b.textContent), status: document.querySelector('#batchStatus').textContent, btn: document.querySelector('#styleBatchBtn').textContent }));
      report.info.batch = batch;
      check('I: 전부 만들기(필터 상태) → 첫 결과 뒤 멈춤 → 결과는 광고용 추천 스타일만, 버튼 글 복구', batch.names.length >= 1 && batch.names.every((n) => adInfo.adNames.includes(n)) && batch.btn === `광고용 추천 ${adInfo.adCount}가지 만들기`, batch);
      await page.click('#styleFilter .chipbtn[data-filter="all"]');
      await page.waitForTimeout(200);
      const back = await page.evaluate(() => ({ hiddenN: [...document.querySelectorAll('#styleStrip .style-card')].filter((c) => c.hidden).length, btn: document.querySelector('#styleBatchBtn').textContent }));
      check('I: 「전체」 칩 → 모두 보임, 버튼 "N가지 전부 만들기"', back.hiddenN === 0 && back.btn === `${adInfo.total}가지 전부 만들기`, back);
      await page.screenshot({ path: path.join(OUT, '07-export.png') });
    }

    // ═══ (J) 프로젝트 저장 → 열기 ═══
    {
      // 새 어휘 조절이 프로젝트에 들어가는지: 추가 장식 리본 켬, 사진 위 장식 빛 스윕, 엔딩 버튼 문구
      await page.check('#extras-ribbon');
      await page.selectOption('#deco', 'sweep');
      await page.fill('#endingCta', '전화 문의');
      await page.waitForTimeout(150);
      const b0 = await barState();
      const sc0 = await sceneState();
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.click('#projSaveBtn')]);
      const file = path.join(OUT, 'project.json');
      await dl.saveAs(file);
      const raw = fs.readFileSync(file, 'utf8');
      const data = JSON.parse(raw);
      report.info.project = { version: data.version, recipe: data.recipe, settingsKeys: Object.keys(data.settings || {}), scene0: { ...data.scenes?.[0], image: undefined, image2: undefined } };
      check('J: .json version 3, recipe.id·slots[].filled·targets', data.version === 3 && data.recipe?.id === CASE_A && Array.isArray(data.recipe.slots) && data.recipe.slots.some((s) => s.filled) && data.recipe.slots.some((s) => !s.filled) && data.recipe.slots.every((s) => s.targets.every((t) => Number.isInteger(t.sceneIndex) && ['img', 'img2'].includes(t.key))), data.recipe);
      check('J: 장면에 slot·stamp·narration(1번 장면 slot 1·도장 남향)', data.scenes[0].slot === 1 && data.scenes[0].stamp === '남향' && typeof data.scenes[0].narration === 'string' && 'slot2' in data.scenes[0] && 'labelA' in data.scenes[0] && 'vsLabel' in data.scenes[0], data.scenes[0]);
      const st = data.settings || {};
      check('J: 설정에 brand·ending.cta·모션 어휘(photoIn·photoFit·deco·titleAnim·extras·fx)', st.brand?.name === OFFICE.name && st.brand?.phone === OFFICE.phone && st.ending?.cta === '전화 문의' && st.photoIn === 'push' && st.photoFit === 'smart' && Array.isArray(st.deco) && st.deco[0] === 'sweep' && Array.isArray(st.extras) && st.extras.includes('ribbon') && st.extras.includes('lower3') && st.fx === 'ad' && typeof st.titleAnim === 'string', { brand: st.brand, cta: st.ending?.cta, photoIn: st.photoIn, deco: st.deco, extras: st.extras, fx: st.fx });
      check('J: .json 어디에도 AI 키 없음', !raw.includes(KEYS.gemini) && !/mrkv|apiKey|"keys"/.test(raw));
      // 상태를 바꾼 뒤(사례 그만 + 상호 비움) 다시 열면 돌아오는지
      await page.click('#recipeStop');
      await page.fill('#brandName', '');
      await page.waitForTimeout(150);
      await page.setInputFiles('#projFile', file);
      await page.waitForFunction((name) => !document.querySelector('#recipeBar').hidden && document.querySelector('#h-recipe').textContent === name, cA.name, { timeout: 15000 });
      await page.waitForTimeout(400);
      const b1 = await barState();
      const sc1 = await sceneState();
      const ct1 = await controls();
      check('J: 다시 열기 → 바 복원·진행 칩 같음·슬롯 같음·예시 태그 같음', b1.progress === b0.progress && b1.slots.map((s) => `${s.no}${s.sample}`).join() === b0.slots.map((s) => `${s.no}${s.sample}`).join() && sc1.filter((s) => s.sample).length === sc0.filter((s) => s.sample).length && sc1[0].stamp === '남향' && sc1[0].tags.includes('자리 1'), { before: b0.progress, after: b1.progress });
      check('J: 다시 열기 → brand·엔딩 버튼·추가 장식 리본·빛 스윕 복원', ct1.brandName === OFFICE.name && ct1.endingCta === '전화 문의' && ct1.extras.includes('ribbon') && ct1.deco === 'sweep', { brandName: ct1.brandName, cta: ct1.endingCta, extras: ct1.extras, deco: ct1.deco });
      // 옛 파일(version 2, recipe 없음)도 그대로 열림 → 레시피 모드는 조용히 끝남
      const old = { ...data, version: 2, recipe: undefined, scenes: data.scenes.map(({ slot, slot2, hint2, stamp, labelA, labelB, vsLabel, ...rest }) => rest) };
      delete old.recipe;
      const oldFile = path.join(OUT, 'project-v2.json');
      fs.writeFileSync(oldFile, JSON.stringify(old));
      await page.setInputFiles('#projFile', oldFile);
      await page.waitForFunction(() => document.querySelector('#recipeBar').hidden, null, { timeout: 15000 });
      await page.waitForTimeout(300);
      const sc2 = await sceneState();
      check('J: 옛 형식(version 2) 파일도 열림 — 장면 수 같고 레시피 바는 숨김', sc2.length === sc0.length && sc2[0].caption === sc0[0].caption, { n: sc2.length });
    }

    // ═══ (L) 16:9 사례 ═══
    {
      const cW = await follow(CASE_WIDE);
      const b = await barState();
      const ct = await controls();
      const warn = await page.evaluate(() => ({ aspectWarn: !document.querySelector('#lsAspectWarn').hidden, lsAspect: document.querySelector('#lsAspect').value }));
      check('L: 16:9 사례 → 비율 칩 "16:9 유튜브", 안내에 "가로(16:9)", #aspect 16:9, 매물 상자 비율 경고 보임', b.aspectChip === '16:9 유튜브' && /가로\(16:9\)/.test(b.hint) && ct.aspect === '16:9' && warn.aspectWarn && warn.lsAspect === '16:9' && cW.aspect === '16:9', { chip: b.aspectChip, aspect: ct.aspect, warn });
      await page.screenshot({ path: path.join(OUT, '08-wide.png') });
    }

    // ═══ (O) 접근성 ═══
    {
      const a = await page.evaluate(() => ({
        region: document.querySelector('#recipeBar').getAttribute('role'), labelled: document.querySelector('#recipeBar').getAttribute('aria-labelledby'),
        progressRole: document.querySelector('#recipeProgress').getAttribute('role'), progressLive: document.querySelector('#recipeProgress').getAttribute('aria-live'),
        statusLive: document.querySelector('#recipeStatus').getAttribute('aria-live'),
        slotLabel: document.querySelector('#recipeSlots button')?.getAttribute('aria-label') || '',
        slotsLabel: document.querySelector('#recipeSlots').getAttribute('aria-label'),
        filesLabel: document.querySelector('label[for="recipeFiles"]')?.textContent,
        chips: [...document.querySelectorAll('#styleFilter .chipbtn')].every((b) => ['true', 'false'].includes(b.getAttribute('aria-pressed'))),
        filterGroup: document.querySelector('#styleFilter').getAttribute('aria-label'),
        canvasLabel: document.querySelector('#previewCanvas').getAttribute('aria-label'),
        galleryCanvas: document.querySelector('#followGrid canvas')?.getAttribute('role') ?? 'n/a',
        stampLabel: document.querySelector('#sceneList .scene-stamp')?.getAttribute('aria-label') || '',
        thumbLabel: document.querySelector('#sceneList .scene-thumb.sample')?.getAttribute('aria-label') || '',
      }));
      report.info.a11y = a;
      check('O: 레시피 바 role=region·aria-labelledby, 진행 칩 role=status, 상태 줄 aria-live', a.region === 'region' && a.labelled === 'h-recipe' && a.progressRole === 'status' && a.progressLive === 'polite' && a.statusLive === 'polite', a);
      check('O: 슬롯 버튼 aria-label "자리 1 (…)", 띠 aria-label, 필터 칩 aria-pressed·group label, 도장 칸·예시 썸네일 라벨', /^자리 1 \(/.test(a.slotLabel) && /사진 자리/.test(a.slotsLabel) && a.chips && /스타일 보기 범위/.test(a.filterGroup) && /도장 글/.test(a.stampLabel) && /예시 사진 — 내 사진으로 바꾸기/.test(a.thumbLabel) && !!a.canvasLabel, a);
      check('O: 사례 화면 갤러리 캔버스 role=img(갤러리가 있을 때)', a.galleryCanvas === 'n/a' || a.galleryCanvas === 'img', a.galleryCanvas);
    }

    // ═══ (M) 400px ═══
    {
      await follow(CASE_A);
      await setFiles('#recipeFiles', photos.slice(0, 2));
      await waitProgress(/^사진 2\/5 바꿈$/);
      await page.setViewportSize({ width: 400, height: 800 });
      await page.waitForTimeout(400);
      const m = await page.evaluate(() => ({
        sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
        // 슬롯 띠·스타일 띠는 일부러 안에서만 가로 스크롤하므로 그 안의 요소는 뺀다(문서 scrollWidth 가 400 이하면 바깥으로 새지 않은 것)
        wide: [...document.querySelectorAll('#recipeBar *, .style-panel *')].filter((el) => el.offsetParent && !el.closest('.recipe-slots, .style-strip') && el.getBoundingClientRect().right > innerWidth + 1).map((el) => `${el.tagName.toLowerCase()}#${el.id}.${el.className}`).slice(0, 8),
        slotsOverflow: getComputedStyle(document.querySelector('#recipeSlots')).overflowX, slotsScroll: document.querySelector('#recipeSlots').scrollWidth > document.querySelector('#recipeSlots').clientWidth,
        btnH: Math.min(...[...document.querySelectorAll('#recipeActions .btn')].filter((b) => b.offsetParent).map((b) => b.getBoundingClientRect().height)),
      }));
      report.info.mobile = m;
      check('M: 400px 가로 넘침 없음(레시피 바 열린 상태), 슬롯 띠는 바 안에서만 가로 스크롤, 버튼 높이 ≥ 36px', m.sw <= m.cw && !m.wide.length && m.slotsOverflow === 'auto' && m.slotsScroll && m.btnH >= 36, m);
      await page.$eval('#recipeBar', (el) => el.scrollIntoView());
      await page.screenshot({ path: path.join(OUT, '09-mobile.png') });
      await page.$eval('#styleFilter', (el) => el.scrollIntoView());
      await page.screenshot({ path: path.join(OUT, '10-mobile-styles.png') });
    }
    await page.close();

    // ═══ (K) 주소로 바로 접속 ═══
    {
      const p2 = await ctx.newPage();
      wireErrors(p2, 'K ');
      await p2.goto(`${BASE}/#follow=${CASE_B}`, { waitUntil: 'load' });
      await p2.waitForFunction(() => !document.querySelector('#recipeBar').hidden, null, { timeout: 20000 });
      await p2.waitForTimeout(400);
      const k1 = await p2.evaluate(() => ({ hash: location.hash, shorts: !document.querySelector('#view-shorts').hidden, head: document.querySelector('#h-recipe').textContent, focus: document.activeElement?.id }));
      check('K: #follow=<id> 로 바로 접속 → 숏폼 화면·레시피 로드·주소 #shorts', k1.hash === '#shorts' && k1.shorts && k1.head === '미스터홈즈 가맹 문의' && k1.focus === 'h-recipe', k1);
      await p2.evaluate(() => { location.hash = '#follow=nope'; });
      await p2.waitForFunction(() => !document.querySelector('#toast').hidden && /그런 사례가 없습니다/.test(document.querySelector('#toast').textContent), null, { timeout: 6000 }).catch(() => {});
      const k2 = await p2.evaluate(() => ({ hash: location.hash, shorts: !document.querySelector('#view-shorts').hidden, toast: document.querySelector('#toast').textContent, head: document.querySelector('#h-recipe').textContent }));
      check('K: 모르는 id → 토스트 "그런 사례가 없습니다…", 숏폼 화면·먼저 실은 사례는 그대로', /그런 사례가 없습니다/.test(k2.toast) && k2.shorts && k2.hash === '#shorts' && k2.head === '미스터홈즈 가맹 문의', k2);
      const hasGallery = await p2.evaluate(() => !!document.getElementById('case-follow'));
      if (hasGallery) {
        await p2.evaluate(() => { location.hash = '#case-follow'; });
        await p2.waitForFunction(() => !document.querySelector('#view-showcase').hidden, null, { timeout: 10000 });
        await p2.waitForTimeout(1200);
        const k3 = await p2.evaluate(() => ({ top: document.getElementById('case-follow').getBoundingClientRect().top, showcase: !document.querySelector('#view-showcase').hidden }));
        check('K: #case-follow → 사례 화면, 갤러리로 스크롤(제목이 메뉴 아래 화면 안에)', k3.showcase && k3.top >= -2 && k3.top < 400, k3);
      } else check('K: #case-follow 갤러리(사례 화면 담당)가 아직 없어 스크롤 검사는 건너뜀', true);
      await p2.close();
    }

    // ═══ (I2) 첫 화면 예시(사례 모드 아님) → 관문 없이 바로 ═══
    {
      const c3 = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      await routeAll(c3);
      const p3 = await c3.newPage();
      wireErrors(p3, 'I2 ');
      await p3.goto(`${BASE}/#shorts`, { waitUntil: 'load' });
      await p3.waitForFunction(() => document.querySelectorAll('#sceneList .scene').length > 0 && document.querySelectorAll('#styleStrip .style-card').length > 0, null, { timeout: 20000 });
      await p3.waitForTimeout(500);
      const pre = await p3.evaluate(() => ({ samples: document.querySelectorAll('#sceneList .scene-thumb.sample').length, bar: document.querySelector('#recipeBar').hidden, tags: [...document.querySelectorAll('#sceneList .tag')].map((t) => t.textContent) }));
      check('I2: 첫 화면 예시 장면(사례 모드 아님) — 레시피 바 숨김, 예시 썸네일 표시', pre.bar && pre.samples === 4 && pre.tags.some((t) => /예시/.test(t)) && !pre.tags.some((t) => /^자리/.test(t)), pre);
      await p3.evaluate(() => {
        document.querySelectorAll('#sceneList input[type=number]').forEach((i) => { i.value = '0.5'; i.dispatchEvent(new Event('input')); });
        const e = document.querySelector('#endingDur'); e.value = '1'; e.dispatchEvent(new Event('input'));
        const q = document.querySelector('#quality'); q.value = '720'; q.dispatchEvent(new Event('input'));
      });
      await p3.click('#exportBtn');
      await p3.waitForTimeout(300);
      const mid = await p3.evaluate(() => ({ status: document.querySelector('#exportStatus').textContent, btn: document.querySelector('#exportBtn').textContent }));
      await p3.waitForFunction(() => /완성:|못했습니다|멈췄/.test(document.querySelector('#exportStatus').textContent), null, { timeout: 60000 });
      const done = await p3.evaluate(() => document.querySelector('#exportStatus').textContent);
      check('I2: 순수 예시(사례 모드 아님)는 관문 없이 첫 클릭에 바로 만들어짐', !/예시 사진/.test(mid.status) && mid.btn === '만들기 멈춤' && /^완성:/.test(done), { mid, done });
      // 매물 상자 ① 로 사진을 넣으면 예시 장면은 비워짐(기존 규칙 유지)
      await p3.setInputFiles('#lsFiles', photos.slice(0, 1));
      await p3.waitForFunction(() => document.querySelectorAll('#lsThumbs li').length === 1, null, { timeout: 10000 });
      const after = await p3.evaluate(() => ({ scenes: document.querySelectorAll('#sceneList .scene').length, samples: document.querySelectorAll('#sceneList .scene-thumb.sample').length }));
      check('I2: 사례 모드가 아닐 때 사진을 넣으면 예시 장면은 비워짐(기존 규칙)', after.scenes === 1 && after.samples === 0, after);
      await c3.close();
    }

    // ═══ (M2) 다크 400px ═══
    {
      const dctx = await browser.newContext({ viewport: { width: 400, height: 800 }, colorScheme: 'dark' });
      await routeAll(dctx);
      const dp = await dctx.newPage();
      wireErrors(dp, 'dark ');
      await dp.goto(`${BASE}/#follow=${CASE_A}`, { waitUntil: 'load' });
      await dp.waitForFunction(() => !document.querySelector('#recipeBar').hidden, null, { timeout: 20000 });
      await dp.waitForTimeout(600);
      const d = await dp.evaluate(() => ({ bg: getComputedStyle(document.querySelector('#recipeBar')).backgroundColor, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, badge: getComputedStyle(document.querySelector('.recipe-badge')).backgroundColor }));
      report.info.dark = d;
      check('M2: 다크 400px — 레시피 바 어두운 바탕(토큰), 가로 넘침 없음', d.bg === 'rgb(22, 27, 38)' && d.sw <= d.cw, d);
      await dp.$eval('#recipeBar', (el) => el.scrollIntoView());
      await dp.screenshot({ path: path.join(OUT, '11-dark-mobile.png') });
      await dctx.close();
    }
    await ctx.close();
  } catch (e) {
    check('점검 실행 중 예외 없음', false, e.stack || e.message);
  } finally {
    await browser.close();
  }
  check('콘솔 오류 0', report.consoleErrors.length === 0, report.consoleErrors);
  report.checks = checks.map((c) => `${c.ok ? 'OK' : 'NG'} ${c.name}`);
  report.failed = checks.filter((c) => !c.ok);
  report.ok = !report.failed.length;
  const pass = checks.length - report.failed.length;
  report.counts = { total: checks.length, pass, fail: report.failed.length };
  report.calls = { gemini: report.calls.gemini.length };
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`\nrecipe-flow: ${pass}/${checks.length} 통과 · 제미나이 요청 ${report.calls.gemini}건 · 예상된 404 ${report.expected404.length}건`);
  process.exit(report.ok ? 0 : 1);
})();
