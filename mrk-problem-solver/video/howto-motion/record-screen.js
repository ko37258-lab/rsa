// 사용법 영상용 화면 녹화 — 실제 배포 사이트를 조작하고, LLM 응답만 정확한 예시 데이터로 대체한다.
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = process.argv[2];
const SITE = 'https://mrk-problem-solver.vercel.app';
const VW = 1778, VH = 688, ZOOM = 1.4; // 화면 전체를 1.4배로 확대해 선명하게 녹화

const MOCK = { questions: [{
  no: 1, stem: '건축법령상 신고 대상 공작물에 관한 설명으로 옳지 않은 것은?',
  qtype: '옳지 않은 것 고르기', answer: 3, answer_text: '옹벽은 높이 2미터를 넘어야 신고 대상이다.',
  choices: [
    { num: 1, text: '높이 6미터를 넘는 굴뚝은 신고 대상 공작물이다.', verdict: '옳음', explanation: '건축법 시행령 제118조 제1항 제1호에 따라 높이 6미터를 넘는 굴뚝은 신고 대상이다.', basis: [{ type: '법령', title: '건축법 시행령 제118조 제1항 제1호', quote: '1. 높이 6미터를 넘는 굴뚝', verified: true }] },
    { num: 2, text: '높이 4미터를 넘는 광고탑은 신고 대상 공작물이다.', verdict: '옳음', explanation: '같은 항 제3호에 따라 높이 4미터를 넘는 광고탑은 신고 대상이다.', basis: [{ type: '법령', title: '건축법 시행령 제118조 제1항 제3호', quote: '3. 높이 4미터를 넘는 장식탑, 기념탑, 첨탑, 광고탑, 광고판, 그 밖에 이와 비슷한 것', verified: true }] },
    { num: 3, text: '높이 1미터를 넘는 옹벽은 신고 대상 공작물이다.', verdict: '옳지 않음', explanation: '옹벽 또는 담장은 높이 2미터를 넘는 것이 신고 대상이다. 1미터를 넘는 옹벽이 모두 신고 대상인 것은 아니다.', basis: [{ type: '법령', title: '건축법 시행령 제118조 제1항 제5호', quote: '5. 높이 2미터를 넘는 옹벽 또는 담장', verified: true }, { type: '법령', title: '건축법 제83조 제1항', quote: '대지를 조성하기 위한 옹벽, 굴뚝, 광고탑, 고가수조(高架水槽), 지하 대피호, 그 밖에 이와 유사한 것으로서 대통령령으로 정하는 공작물을 축조하려는 자는 대통령령으로 정하는 바에 따라 특별자치시장ㆍ특별자치도지사 또는 시장ㆍ군수ㆍ구청장에게 신고하여야 한다.', verified: true }] },
    { num: 4, text: '높이 8미터를 넘는 고가수조는 신고 대상 공작물이다.', verdict: '옳음', explanation: '같은 항 제4호에 따라 높이 8미터를 넘는 고가수조는 신고 대상이다.', basis: [{ type: '법령', title: '건축법 시행령 제118조 제1항 제4호', quote: '4. 높이 8미터를 넘는 고가수조나 그 밖에 이와 비슷한 것', verified: true }] },
    { num: 5, text: '바닥면적 30제곱미터를 넘는 지하대피호는 신고 대상 공작물이다.', verdict: '옳음', explanation: '같은 항 제6호에 따라 바닥면적 30제곱미터를 넘는 지하대피호는 신고 대상이다.', basis: [{ type: '법령', title: '건축법 시행령 제118조 제1항 제6호', quote: '6. 바닥면적 30제곱미터를 넘는 지하대피호', verified: true }] },
  ], topic: '건축법 > 옹벽 등의 공작물', difficulty: '중', tip: '옹벽·담장 2m, 장식탑·광고탑 4m, 굴뚝 6m, 고가수조 8m, 지하대피호 30㎡ — 숫자로 묶어 외우자.'
}], overall_note: '' };

const QTEXT = `1. 건축법령상 신고 대상 공작물에 관한 설명으로 옳지 않은 것은?
① 높이 6미터를 넘는 굴뚝은 신고 대상 공작물이다.
② 높이 4미터를 넘는 광고탑은 신고 대상 공작물이다.
③ 높이 1미터를 넘는 옹벽은 신고 대상 공작물이다.
④ 높이 8미터를 넘는 고가수조는 신고 대상 공작물이다.
⑤ 바닥면적 30제곱미터를 넘는 지하대피호는 신고 대상 공작물이다.`;

(async () => {
  const browser = await chromium.launch();
  // 사진 첨부 장면용: 교재 페이지처럼 보이는 문제 이미지
  const ip = await browser.newPage({ viewport: { width: 900, height: 560 }, deviceScaleFactor: 1.5 });
  await ip.setContent(`<html><body style="margin:0;background:#fbfaf6;font-family:'Noto Serif CJK KR','Noto Sans CJK KR',serif;padding:40px 48px;color:#222"><div style="font-size:14px;color:#888;border-bottom:1px solid #ccc;padding-bottom:8px;margin-bottom:22px">제3과목 부동산공법 · 건축법</div><div style="font-size:21px;line-height:1.9;white-space:pre-line">${QTEXT}</div></body></html>`);
  await ip.screenshot({ path: OUT + '/problem.png' }); await ip.close();

  const ctx = await browser.newContext({ viewport: { width: VW, height: VH },
    recordVideo: { dir: OUT, size: { width: VW, height: VH } },
    permissions: ['clipboard-read', 'clipboard-write'] });
  await ctx.addInitScript(z => document.addEventListener('DOMContentLoaded', () => { document.documentElement.style.zoom = z; }), String(ZOOM));
  const page = await ctx.newPage();
  const T0 = Date.now(); const marks = []; const clicks = [];
  const mark = (name) => marks.push({ name, t: (Date.now() - T0) / 1000 });
  const sleep = (ms) => page.waitForTimeout(ms);
  async function clickEl(sel, label) {
    const el = page.locator(sel).first();
    await el.scrollIntoViewIfNeeded();
    const b = await el.boundingBox();
    clicks.push({ t: (Date.now() - T0) / 1000, label, x: b.x / VW, y: b.y / VH, w: b.width / VW, h: b.height / VH });
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
    await sleep(250); await el.click();
  }
  const smoothScroll = (y, ms) => page.evaluate(([y, ms]) => new Promise(r => { const y0 = scrollY, t0 = performance.now(); const f = t => { const k = Math.min(1, (t - t0) / ms); scrollTo(0, y0 + (y - y0) * (1 - Math.pow(1 - k, 3))); k < 1 ? requestAnimationFrame(f) : r(); }; requestAnimationFrame(f); }), [y, ms]);

  // A: 메인 페이지 (검은 화면 0.8초 → 영상 동기 기준점)
  await page.goto(SITE + '/', { waitUntil: 'load' });
  await page.evaluate(() => { const d = document.createElement('div'); d.id = 'sync'; d.style.cssText = 'position:fixed;inset:0;background:#000;z-index:9999'; document.body.appendChild(d); });
  await sleep(800); await page.evaluate(() => document.getElementById('sync').remove());
  mark('A'); await sleep(6500);

  // B: API 키 등록
  await page.goto(SITE + '/app.html', { waitUntil: 'load' });
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload({ waitUntil: 'load' }); await sleep(300);
  mark('B');
  await smoothScroll(462, 600); await sleep(300);
  await clickEl('#keyState', 'API 키 설정');
  await sleep(500);
  await page.locator('#key-claude').click();
  await page.keyboard.type('sk-ant-api03-mrk-demo-key', { delay: 35 });
  await sleep(300);
  await clickEl('.modal .btn-primary', '저장');
  await sleep(1300);

  // C: 문제 넣기 (텍스트 붙여넣기 → 사진 첨부)
  mark('C');
  await page.locator('#qtext').click();
  for (let i = 1; i <= QTEXT.length; i += 9) { await page.evaluate(t => { const q = document.getElementById('qtext'); q.value = t; q.scrollTop = q.scrollHeight; }, QTEXT.slice(0, i)); await sleep(16); }
  await page.evaluate(t => document.getElementById('qtext').value = t, QTEXT);
  await sleep(1300);
  await clickEl('.tab[data-tab="file"]', '사진 · PDF · 한글');
  await sleep(700);
  await page.setInputFiles('#filePick', OUT + '/problem.png');
  await sleep(500);
  await smoothScroll(await page.evaluate(() => scrollY + 238), 700);
  await sleep(2200);

  // D: 해설 받기 → 레이더 (LLM만 예시 응답으로 대체, 법령 도구는 실제 /api 호출)
  await page.evaluate((mock) => {
    window.runClaude = async ({ onLog }) => {
      const plan = [
        ['search_law', { query: '건축법 시행령' }],
        ['search_article', { law_name: '건축법 시행령', keyword: '옹벽 2미터' }],
        ['get_delegated_articles', { law_name: '건축법', article: '83' }],
        ['get_law_article', { law_name: '건축법 시행령', article: '118' }],
        ['get_annex', { law_name: '건축법 시행령' }],
        ['search_interpretation', { query: '옹벽 공작물 축조신고' }],
        ['search_precedent', { query: '공작물 축조신고 옹벽' }],
      ];
      for (const [n, a] of plan) { onLog(`→ ${toolLabel(n, a)}`); execTool(n, a); await new Promise(r => setTimeout(r, 1050)); }
      setStage('write'); await new Promise(r => setTimeout(r, 1300));
      return { text: JSON.stringify(mock), usage: { inTok: 18400, outTok: 2100 } };
    };
  }, MOCK);
  mark('D');
  await clickEl('#solveBtn', '해설 받기');
  await page.waitForSelector('#resultCard', { state: 'visible', timeout: 30000 });
  // E: 결과
  mark('E');
  await sleep(900);
  const rc = await page.evaluate(() => document.getElementById('resultCard').getBoundingClientRect().top + scrollY);
  await smoothScroll(rc + 532, 2600); await sleep(900);

  // F: 문제로 저장 → 클릭 복사
  mark('F');
  await clickEl('#saveProbBtn', '문제로 저장');
  await sleep(1400);
  const pb = await page.evaluate(() => document.getElementById('probWrap').getBoundingClientRect().top + scrollY);
  await smoothScroll(pb - 14, 700); await sleep(500);
  await smoothScroll(pb + 168, 1800); await sleep(400);
  await clickEl('#probBox', '클릭 → 전체 복사');
  await sleep(2600);

  // G: 클로징 — 메인 페이지
  mark('G');
  await page.goto(SITE + '/', { waitUntil: 'load' });
  await sleep(7000);
  mark('END');

  const vpath = await page.video().path();
  await ctx.close(); await browser.close();
  fs.renameSync(vpath, OUT + '/screen.webm');
  fs.writeFileSync(OUT + '/timeline.json', JSON.stringify({ marks, clicks, VW, VH }, null, 1));
  console.log(JSON.stringify(marks)); console.log('clicks', clicks.length);
})();
