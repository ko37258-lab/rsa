// 사례 화면 「따라하기 사례」 갤러리 점검(Playwright).
//   node tests/gallery-check.cjs
// A  #showcase 갤러리: 카드 수 = CASE_DATA.length, 보이게 스크롤하면 캔버스가 그려짐(검정·빈 캔버스 아님), 400ms 간격 두 번 캡처해 움직이는 캔버스 1~2개,
//    필터 "매물" → 다른 용도 카드 hidden(store 기억), 「대본 보기」 aria-expanded 토글, #caseIdx "/ 3" 그대로, data-case-count 채워짐, 접근성 속성
// A2 움직임 줄이기(emulateMedia reducedMotion): 움직이는 캔버스 0, #followPause aria-pressed="true" → 누르면 1~2개 움직이고 #heroPause 도 같이 바뀜
// K  #case-follow 로 바로 열기(직접 접속·히어로 버튼) → 사례 화면 + 갤러리가 메뉴 아래로 스크롤(모바일은 위 메뉴 줄 아래)
// M  400×800: 문서 가로 스크롤 없음, 갤러리 요소가 화면 밖으로 나가지 않음(필터 칩 줄은 자체 스크롤), 다크 캡처
// 캡처: tests/out/gallery/*.png, 결과 tests/out/gallery/report.json. 콘솔 오류 0(예시 사진·/api/health 404, tutorial.mp4 는 예상된 것으로 거름).
// 정적 서버가 http://127.0.0.1:5173/ 에 떠 있어야 합니다(없으면: cd 프로젝트 && python3 -m http.server 5173).

const fs = require('fs');
const path = require('path');
const { chromium } = require('/opt/node-tools/node_modules/playwright');

const BASE = process.env.MRK_BASE || 'http://127.0.0.1:5173';
const OUT = path.join(__dirname, 'out', 'gallery');
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const EXPECTED_404 = /\/assets\/samples\/[^/]+\.jpg$|\/api\/health$/;
const EXPECTED_FAIL = /\/assets\/video\/[^/]+\.mp4$/;

const report = { ok: false, checks: [], failed: [], consoleErrors: [], expected: [], detail: {}, files: [] };
const checks = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok: !!ok, detail: detail === undefined ? '' : (typeof detail === 'string' ? detail : JSON.stringify(detail)) });
  console.log(`${ok ? 'OK' : 'NG'} ${name}${detail === undefined ? '' : ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail))}`);
};

function watch(page, tag) {
  const pending404 = [];
  page.on('response', (r) => { if (r.status() === 404) pending404.push(r.url()); });
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (/404/.test(m.text())) {
      const url = pending404.shift() || '';
      if (EXPECTED_404.test(url)) { report.expected.push(`[${tag}] 404: ${url}`); return; }
      report.consoleErrors.push(`[${tag}] console.error: ${m.text()} ${url}`);
      return;
    }
    report.consoleErrors.push(`[${tag}] console.error: ${m.text()}`);
  });
  page.on('pageerror', (e) => report.consoleErrors.push(`[${tag}] pageerror: ${e.message}`));
  page.on('requestfailed', (r) => {
    if (EXPECTED_FAIL.test(r.url())) { report.expected.push(`[${tag}] requestfailed(H.264): ${r.url()}`); return; }
    report.consoleErrors.push(`[${tag}] requestfailed: ${r.url()} ${r.failure()?.errorText || ''}`);
  });
}

async function shot(page, name, opts = {}) {
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, ...opts });
  report.files.push(file);
  return file;
}

// ── 페이지 안에서 도는 도우미 ──
/** 갤러리 캔버스마다 픽셀 해시·빈 캔버스 여부(전부 투명이거나 한 색) */
const snapCanvases = () => [...document.querySelectorAll('#followGrid .follow-card')].map((card) => {
  const c = card.querySelector('canvas');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let h = 0; let alpha = 0; let same = true;
  for (let i = 0; i < d.length; i += 16) {
    h = (h * 31 + d[i] + d[i + 1] * 7 + d[i + 2] * 13) >>> 0;
    alpha += d[i + 3];
    if (same && (d[i] !== d[0] || d[i + 1] !== d[1] || d[i + 2] !== d[2])) same = false;
  }
  const r = card.getBoundingClientRect();
  const visible = !card.hidden && r.bottom > 0 && r.top < window.innerHeight;
  return { id: card.dataset.id, hidden: card.hidden, ready: !!card.dataset.ready, hash: h, blank: alpha === 0 || same, visible };
});

/** 400ms 간격으로 세 번 캡처해 한 번이라도 바뀐(=움직이는) 캔버스 id 목록. 정지 프레임은 세 번 다 같고, 움직이는 캔버스는 최소 한 쌍이 다릅니다
 *  (정적인 구간에서는 400ms 사이 프레임이 우연히 같을 수 있어 두 쌍을 봅니다). */
async function movingCanvases(page) {
  const a = await page.evaluate(snapCanvases);
  await page.waitForTimeout(400);
  const b = await page.evaluate(snapCanvases);
  await page.waitForTimeout(400);
  const c = await page.evaluate(snapCanvases);
  return a.filter((x, i) => x.hash !== b[i].hash || b[i].hash !== c[i].hash).map((x) => x.id);
}

async function openShowcase(page, hash = '#showcase') {
  await page.goto(`${BASE}/${hash}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelectorAll('#followGrid .follow-card').length > 0 && document.querySelectorAll('#caseStyleWall canvas').length > 0, null, { timeout: 20000 });
}

/** 카드를 하나씩 보이게 스크롤해 전부 준비(data-ready)시킵니다. */
async function prepareAll(page) {
  const n = await page.evaluate(() => document.querySelectorAll('#followGrid .follow-card').length);
  const result = [];
  for (let i = 0; i < n; i++) {
    await page.evaluate((k) => document.querySelectorAll('#followGrid .follow-card')[k].scrollIntoView({ block: 'center' }), i);
    let ready = true;
    try { await page.waitForFunction((k) => !!document.querySelectorAll('#followGrid .follow-card')[k].dataset.ready, i, { timeout: 10000 }); } catch { ready = false; }
    await page.waitForTimeout(120);
    const s = (await page.evaluate(snapCanvases))[i];
    result.push({ id: s.id, ready, blank: s.blank });
  }
  return result;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: EXE });
  try {
    // ── A: 갤러리 기본 ─────────────────────────────────────
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    watch(page, 'A');
    await openShowcase(page);
    const N = await page.evaluate(() => import('./js/cases-data.js').then((m) => m.CASE_DATA.length));
    const cats = await page.evaluate(() => import('./js/cases-data.js').then((m) => m.CASE_DATA.map((c) => c.category)));
    const basic = await page.evaluate(() => ({
      cards: document.querySelectorAll('#followGrid .follow-card').length,
      caseCount: [...document.querySelectorAll('[data-case-count]')].map((e) => e.textContent),
      caseIdx: document.querySelector('#caseIdx').textContent,
      caseCountText: document.querySelector('.case-count').textContent.replace(/\s+/g, ' ').trim(),
      dots: document.querySelectorAll('#caseDots .dot').length,
      caseLabel: document.querySelector('.case-label').textContent,
      toCases: document.querySelector('#toCases').getAttribute('href') + ' ' + document.querySelector('#toCases').textContent,
      lede: document.querySelector('#view-showcase .lede').textContent,
      h2: document.querySelector('#h-follow').textContent.replace(/\s+/g, ' '),
      chips: [...document.querySelectorAll('#followFilter .chipbtn')].map((b) => ({ cat: b.dataset.cat, text: b.textContent, pressed: b.getAttribute('aria-pressed') })),
      pause: { pressed: document.querySelector('#followPause').getAttribute('aria-pressed'), text: document.querySelector('#followPause').textContent },
      a11y: [...document.querySelectorAll('#followGrid .follow-card')].slice(0, 3).map((card) => ({
        role: card.getAttribute('role'), labelledby: card.getAttribute('aria-labelledby'), hasH3: !!document.getElementById(card.getAttribute('aria-labelledby')),
        canvas: card.querySelector('canvas').getAttribute('role') + '|' + card.querySelector('canvas').getAttribute('aria-label'),
        link: card.querySelector('a.btn').getAttribute('href') + '|' + card.querySelector('a.btn').getAttribute('aria-label'),
        toggle: card.querySelector('button[aria-controls]').getAttribute('aria-expanded') + '|' + !!document.getElementById(card.querySelector('button[aria-controls]').getAttribute('aria-controls')),
        photos: card.querySelector('.fc-photos')?.getAttribute('aria-label') || '(없음)', photoCount: card.querySelectorAll('.fc-photos li').length,
        no: card.querySelector('.fc-no').textContent, cat: card.querySelector('.tag.cat').textContent, ratio: card.querySelectorAll('.tag')[1].textContent,
        style: card.querySelector('.fc-style').textContent,
      })),
      stars: [...document.querySelectorAll('#followGrid h3, #followGrid .fc-desc, #followGrid .fc-style')].filter((e) => e.textContent.includes('*')).length,
    }));
    report.detail.basic = basic;
    check('A 카드 수 = CASE_DATA.length', basic.cards === N, `${basic.cards} / ${N}`);
    check('A data-case-count 채워짐', basic.caseCount.length > 0 && basic.caseCount.every((v) => v === String(N)), basic.caseCount);
    check('A #caseIdx "/ 3" 그대로', basic.caseIdx === '1' && / 3$/.test(basic.caseCountText) && basic.dots === 3, `${basic.caseCountText} · 점 ${basic.dots}`);
    check('A 사례 묶음 라벨 "도구가 하는 일 3가지"', basic.caseLabel === '도구가 하는 일 3가지', basic.caseLabel);
    check('A 히어로 버튼 → #case-follow', basic.toCases === '#case-follow 따라하기 사례 보기', basic.toCases);
    check('A 히어로 lede 끝 문장', /사진만 바꿔 넣으면 그대로 나옵니다\.$/.test(basic.lede.trim()), basic.lede.slice(-40));
    check('A 갤러리 제목(별표 없이 키네틱)', basic.h2.includes('그대로 나오는 광고 사례') && !basic.h2.includes('*'), basic.h2);
    check('A 필터 칩 전체+용도 6 · 개수', basic.chips.length === 7 && basic.chips[0].text === `전체${N}` && basic.chips[0].pressed === 'true' && basic.chips.slice(1).every((c) => c.text.endsWith(String(cats.filter((k) => k === c.cat).length))), basic.chips.map((c) => c.text));
    check('A 카드 접근성(role·aria-labelledby·canvas img·링크 aria-label·대본 토글)', basic.a11y.every((c) => c.role === 'listitem' && c.hasH3 && c.canvas.startsWith('img|사례 「') && c.link.startsWith('#follow=') && c.link.includes('이대로 따라하기') && c.toggle === 'false|true'), basic.a11y[0]);
    check('A 카드 글에 별표 남지 않음', basic.stars === 0, basic.stars);
    check('A 스타일·음악 이름', basic.a11y.every((c) => /^스타일 「.+」 · 음악 「.+」$/.test(c.style)), basic.a11y.map((c) => c.style));
    const wide = await page.evaluate(() => ({ cols: getComputedStyle(document.getElementById('followGrid')).gridTemplateColumns.split(' ').length, wide: [...document.querySelectorAll('#followGrid .follow-card.wide')].map((c) => c.dataset.id), aspects: [...document.querySelectorAll('#followGrid .follow-card.wide .monitor')].map((m) => m.dataset.aspect) }));
    report.detail.wide = wide;
    check('A 1280: 16:9 카드만 두 칸(.wide)', wide.cols >= 3 && wide.aspects.length === wide.wide.length && wide.aspects.every((a) => a === '16:9') && wide.wide.length === cats.length - cats.length + (await page.evaluate(() => import('./js/cases-data.js').then((m) => m.CASE_DATA.filter((c) => c.aspect === '16:9').length))), wide);

    // 보이게 스크롤하면 그려짐
    const prepared = await prepareAll(page);
    report.detail.prepared = prepared;
    check('A 보이게 스크롤한 카드가 모두 그려짐(검정·빈 캔버스 없음)', prepared.every((p) => p.ready && !p.blank), prepared.filter((p) => !p.ready || p.blank).map((p) => p.id).join(',') || '전부');

    // 동시에 움직이는 캔버스 ≤ 2
    await page.evaluate(() => document.getElementById('followGrid').scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(700);
    const moving = await movingCanvases(page);
    report.detail.moving = moving;
    check('A 움직이는 캔버스 1~2개', moving.length >= 1 && moving.length <= 2, moving);
    const vis = await page.evaluate(snapCanvases);
    check('A 움직이는 카드는 보이는 카드', moving.every((id) => vis.find((v) => v.id === id)?.visible), moving);
    await shot(page, 'gallery-1280-top.png');
    // 맨 밑 줄로 스크롤 → 움직이는 카드가 바뀌고 앞 카드는 정지 프레임
    await page.evaluate(() => { const cards = document.querySelectorAll('#followGrid .follow-card'); cards[cards.length - 1].scrollIntoView({ block: 'center' }); });
    await page.waitForTimeout(700);
    const moving2 = await movingCanvases(page);
    report.detail.movingBottom = moving2;
    check('A 아래로 스크롤해도 움직이는 캔버스 1~2개(보이는 것만)', moving2.length >= 1 && moving2.length <= 2 && moving2.every((id) => !moving.includes(id)), { before: moving, after: moving2 });
    await shot(page, 'gallery-1280-bottom.png');

    // 필터 "매물"
    await page.click('#followFilter .chipbtn[data-cat="listing"]');
    await page.waitForTimeout(500);
    const filt = await page.evaluate(() => ({
      pressed: [...document.querySelectorAll('#followFilter .chipbtn')].filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.cat),
      hidden: [...document.querySelectorAll('#followGrid .follow-card')].filter((c) => c.hidden).map((c) => c.dataset.cat),
      shown: [...document.querySelectorAll('#followGrid .follow-card')].filter((c) => !c.hidden).map((c) => c.dataset.cat),
      stored: localStorage.getItem('mrk:followFilter'),
    }));
    report.detail.filter = filt;
    check('A 필터 "매물" → 다른 용도 카드 hidden', filt.pressed.join() === 'listing' && filt.hidden.every((k) => k !== 'listing') && filt.shown.every((k) => k === 'listing') && filt.shown.length === cats.filter((k) => k === 'listing').length, filt);
    check('A 필터 선택 기억(store followFilter)', filt.stored === '"listing"', filt.stored);
    await page.evaluate(() => document.getElementById('followGrid').scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(700);
    const moving3 = await movingCanvases(page);
    check('A 필터 뒤에도 움직이는 캔버스 1~2개(숨긴 카드는 안 그림)', moving3.length >= 1 && moving3.length <= 2 && moving3.every((id) => filt.shown.length && !filt.hidden.includes(id)), moving3);
    await shot(page, 'gallery-1280-filter-listing.png');
    await page.click('#followFilter .chipbtn[data-cat="all"]');
    await page.waitForTimeout(300);
    const allBack = await page.evaluate(() => document.querySelectorAll('#followGrid .follow-card:not([hidden])').length);
    check('A 필터 "전체" 로 복귀', allBack === N, allBack);

    // 대본 보기 토글
    const first = await page.$('#followGrid .follow-card');
    const tog = await first.$('button[aria-controls]');
    await tog.scrollIntoViewIfNeeded();
    await tog.click();
    await page.waitForTimeout(200);
    const open = await page.evaluate(() => {
      const card = document.querySelector('#followGrid .follow-card');
      const btn = card.querySelector('button[aria-controls]');
      const box = document.getElementById(btn.getAttribute('aria-controls'));
      return { expanded: btn.getAttribute('aria-expanded'), hidden: box.hidden, text: btn.textContent, lines: box.querySelectorAll('li').length, first: box.querySelector('li')?.textContent.replace(/\s+/g, ' ').slice(0, 90), ems: box.querySelectorAll('.cap em').length, ending: [...box.querySelectorAll('li b')].pop()?.textContent, hint: box.querySelector('.hint')?.textContent.slice(0, 30) };
    });
    const scenes0 = await page.evaluate(() => import('./js/cases-data.js').then((m) => m.CASE_DATA[0].scenes.length));
    report.detail.script = open;
    check('A 「대본 보기」 펼침(aria-expanded=true · 줄 수 = 장면 + 엔딩 · 강조 em · 엔딩 줄)', open.expanded === 'true' && !open.hidden && open.lines === scenes0 + 1 && open.ems > 0 && open.ending === '엔딩', open);
    await shot(page, 'gallery-1280-script-open.png');
    await tog.click();
    await page.waitForTimeout(200);
    const closed = await page.evaluate(() => { const btn = document.querySelector('#followGrid .follow-card button[aria-controls]'); return { expanded: btn.getAttribute('aria-expanded'), hidden: document.getElementById(btn.getAttribute('aria-controls')).hidden }; });
    check('A 「대본 보기」 닫힘(aria-expanded=false · hidden)', closed.expanded === 'false' && closed.hidden, closed);

    // 16:9·1:1 카드가 있는 줄
    await page.evaluate(() => document.querySelector('#followGrid .follow-card[data-id="ai-cohort-recruit"]')?.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(700);
    await shot(page, 'gallery-1280-wide-row.png');
    // 갤러리 아래 도구 사례 3가지는 그대로 드러나야 한다(.case 의 reveal)
    await page.evaluate(() => document.getElementById('case-shorts').scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(1200);
    const cases = await page.evaluate(() => ({
      isIn: [...document.querySelectorAll('.case')].map((c) => c.classList.contains('is-in')), idx: document.querySelector('#caseIdx').textContent,
      wall: document.querySelectorAll('#caseStyleWall canvas').length, styleCount: document.querySelector('#caseStyleCount').textContent,
      opacity: getComputedStyle(document.querySelector('#case-shorts .case-head')).opacity,
    }));
    report.detail.cases = cases;
    check('A 갤러리 아래 사례 01(도구 소개)이 드러남 · #caseStyleWall 10 · #caseStyleCount', cases.isIn[0] && cases.opacity === '1' && cases.idx === '1' && cases.wall === 10 && Number(cases.styleCount) >= 30, cases);
    await shot(page, 'gallery-1280-after-gallery.png');
    // 전체 캡처(1280) + 히어로 + 갤러리 영역만
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(600);
    await shot(page, 'gallery-1280-hero.png');
    await shot(page, 'gallery-1280-full.png', { fullPage: true });
    const sec = await page.$('#case-follow');
    await sec.screenshot({ path: path.join(OUT, 'gallery-1280-section.png') });
    report.files.push(path.join(OUT, 'gallery-1280-section.png'));
    // 다크
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForTimeout(400);
    await page.evaluate(() => document.getElementById('followGrid').scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(500);
    await shot(page, 'gallery-1280-dark.png');
    await page.close();

    // ── A2: 움직임 줄이기 ─────────────────────────────────
    const ctxR = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const pr = await ctxR.newPage();
    watch(pr, 'A2');
    await pr.emulateMedia({ reducedMotion: 'reduce' });
    await openShowcase(pr);
    const preparedR = await prepareAll(pr);
    check('A2 움직임 줄이기: 카드가 정지 프레임으로 그려짐', preparedR.every((p) => p.ready && !p.blank), preparedR.filter((p) => !p.ready || p.blank).map((p) => p.id).join(',') || '전부');
    await pr.evaluate(() => document.getElementById('followGrid').scrollIntoView({ block: 'start' }));
    await pr.waitForTimeout(700);
    const movingR = await movingCanvases(pr);
    const pausedR = await pr.evaluate(() => ({ follow: document.querySelector('#followPause').getAttribute('aria-pressed'), hero: document.querySelector('#heroPause').getAttribute('aria-pressed'), text: document.querySelector('#followPause').textContent }));
    report.detail.reduced = { movingR, pausedR };
    check('A2 움직임 줄이기: 움직이는 캔버스 0', movingR.length === 0, movingR);
    check('A2 #followPause aria-pressed=true(멈춤 상태) · #heroPause 같음', pausedR.follow === 'true' && pausedR.hero === 'true' && pausedR.text.includes('재생'), pausedR);
    await shot(pr, 'gallery-1280-reduced.png');
    await pr.click('#followPause');
    await pr.waitForTimeout(700);
    const movingR2 = await movingCanvases(pr);
    const pausedR2 = await pr.evaluate(() => ({ follow: document.querySelector('#followPause').getAttribute('aria-pressed'), hero: document.querySelector('#heroPause').getAttribute('aria-pressed') }));
    report.detail.reduced.after = { movingR2, pausedR2 };
    check('A2 「미리보기 재생」 누르면 1~2개 움직임 · 두 버튼 aria-pressed=false', movingR2.length >= 1 && movingR2.length <= 2 && pausedR2.follow === 'false' && pausedR2.hero === 'false', { movingR2, pausedR2 });
    await pr.click('#heroPause');
    await pr.waitForTimeout(500);
    const movingR3 = await movingCanvases(pr);
    const pausedR3 = await pr.evaluate(() => document.querySelector('#followPause').getAttribute('aria-pressed'));
    check('A2 히어로 버튼으로 다시 멈추면 갤러리도 멈춤(공유 상태)', movingR3.length === 0 && pausedR3 === 'true', { movingR3, pausedR3 });
    await ctxR.close();

    // ── K: #case-follow 앵커 ──────────────────────────────
    const pk = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    watch(pk, 'K');
    await openShowcase(pk, '#case-follow');
    // 히어로 제목 움직임(키네틱)이 끝나며 위쪽 높이가 바뀌어도 갤러리 머리가 화면 맨 위에 맞춰져 있어야 한다(showcase.js scrollToFollowIfAsked)
    await pk.waitForTimeout(3200);
    const k1 = await pk.evaluate(() => ({ view: !document.getElementById('view-showcase').hidden, top: Math.round(document.getElementById('case-follow').getBoundingClientRect().top), scrollY: Math.round(window.scrollY), hash: location.hash, anims: document.getAnimations().filter((a) => a.playState === 'running' && Number.isFinite(a.effect?.getTiming?.().iterations)).length }));
    report.detail.k1 = k1;
    check('K 주소 #case-follow 로 바로 열기 → 사례 화면 + 갤러리로 스크롤(제목 움직임이 끝난 뒤에도 맨 위)', k1.view && k1.scrollY > 200 && k1.top >= -2 && k1.top <= 2, k1);
    await shot(pk, 'gallery-1280-anchor-direct.png');
    // 히어로 버튼(hashchange)
    await pk.goto(`${BASE}/#showcase`, { waitUntil: 'load' });
    await pk.waitForFunction(() => document.querySelectorAll('#followGrid .follow-card').length > 0, null, { timeout: 20000 });
    await pk.waitForTimeout(800);
    await pk.click('#toCases');
    await pk.waitForTimeout(1800);
    const k2 = await pk.evaluate(() => ({ view: !document.getElementById('view-showcase').hidden, top: Math.round(document.getElementById('case-follow').getBoundingClientRect().top), scrollY: Math.round(window.scrollY), hash: location.hash }));
    report.detail.k2 = k2;
    check('K 히어로 「따라하기 사례 보기」 → #case-follow 로 스크롤', k2.hash === '#case-follow' && k2.view && k2.scrollY > 200 && k2.top >= -2 && k2.top <= 80, k2);
    await pk.close();

    // ── M: 400×800 모바일 ────────────────────────────────
    const pm = await browser.newPage({ viewport: { width: 400, height: 800 }, deviceScaleFactor: 2 });
    watch(pm, 'M');
    await openShowcase(pm, '#case-follow');
    await pm.waitForTimeout(3200);
    const m1 = await pm.evaluate(() => {
      const side = document.querySelector('.side').getBoundingClientRect();
      const sec = document.getElementById('case-follow').getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      const over = [...document.querySelectorAll('#case-follow *')].filter((e) => !e.closest('.follow-filter') && e.getBoundingClientRect().right > vw + 1).map((e) => e.className || e.tagName).slice(0, 8);
      const filter = document.querySelector('.follow-filter');
      const cols = getComputedStyle(document.getElementById('followGrid')).gridTemplateColumns.split(' ').length;
      return { scrollW: document.documentElement.scrollWidth, vw, sideBottom: Math.round(side.bottom), secTop: Math.round(sec.top), over, filterScroll: filter.scrollWidth > filter.clientWidth, filterRight: Math.round(filter.getBoundingClientRect().right), cols };
    });
    report.detail.mobile = m1;
    check('M 400px 문서 가로 스크롤 없음', m1.scrollW <= m1.vw, `${m1.scrollW} / ${m1.vw}`);
    check('M 400px 갤러리 요소가 화면 밖으로 나가지 않음(칩 줄은 자체 스크롤)', m1.over.length === 0 && m1.filterRight <= m1.vw + 1, m1);
    check('M 400px 카드 2열', m1.cols === 2, m1.cols);
    const wideM = await pm.evaluate(() => [...document.querySelectorAll('#followGrid .follow-card.wide .monitor')].map((m) => m.dataset.aspect).sort());
    const wantM = await pm.evaluate(() => import('./js/cases-data.js').then((m) => m.CASE_DATA.filter((c) => c.aspect !== '9:16').map((c) => c.aspect).sort()));
    check('M 400px 2열: 16:9·1:1 카드가 한 줄(.wide)', JSON.stringify(wideM) === JSON.stringify(wantM), { wideM, wantM });
    check('K 모바일 #case-follow 가 위 메뉴 줄 아래로', m1.secTop >= m1.sideBottom - 1 && m1.secTop <= m1.sideBottom + 40, { secTop: m1.secTop, sideBottom: m1.sideBottom });
    const preparedM = await prepareAll(pm);
    check('M 400px 카드가 모두 그려짐', preparedM.every((p) => p.ready && !p.blank), preparedM.filter((p) => !p.ready || p.blank).map((p) => p.id).join(',') || '전부');
    const m2 = await pm.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth }));
    check('M 400px 전부 그린 뒤에도 가로 스크롤 없음', m2.scrollW <= m2.vw, m2);
    await pm.evaluate(() => document.getElementById('case-follow').scrollIntoView({ block: 'start' }));
    await pm.waitForTimeout(600);
    await shot(pm, 'gallery-400-top.png');
    await pm.evaluate(() => { const b = document.querySelector('#followGrid .follow-card button[aria-controls]'); b.click(); b.scrollIntoView({ block: 'start' }); });
    await pm.waitForTimeout(400);
    await shot(pm, 'gallery-400-script.png');
    await pm.evaluate(() => window.scrollTo(0, 0));
    await pm.waitForTimeout(600);
    await shot(pm, 'gallery-400-hero.png');
    await shot(pm, 'gallery-400-full.png', { fullPage: true });
    await pm.emulateMedia({ colorScheme: 'dark' });
    await pm.waitForTimeout(400);
    await pm.evaluate(() => document.getElementById('case-follow').scrollIntoView({ block: 'start' }));
    await pm.waitForTimeout(500);
    const m3 = await pm.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth, bg: getComputedStyle(document.body).backgroundColor }));
    check('M 400px 다크: 가로 스크롤 없음', m3.scrollW <= m3.vw, m3);
    await shot(pm, 'gallery-400-dark.png');
    await pm.close();
  } catch (e) {
    check('스크립트 오류 없음', false, e.stack || String(e));
  } finally {
    await browser.close();
  }

  check('콘솔 오류 0', report.consoleErrors.length === 0, report.consoleErrors);
  report.checks = checks.map((c) => `${c.ok ? 'OK' : 'NG'} ${c.name}`);
  report.failed = checks.filter((c) => !c.ok);
  report.counts = { total: checks.length, pass: checks.length - report.failed.length, fail: report.failed.length };
  report.ok = report.failed.length === 0;
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`\ngallery-check: ${report.counts.pass}/${report.counts.total} 통과 · 예상된 404 ${report.expected.length}건 · 캡처 ${report.files.length}장 → ${OUT}`);
  process.exit(report.ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
