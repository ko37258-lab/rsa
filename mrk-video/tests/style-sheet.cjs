// 렌더 엔진 점검(Playwright).
//   node tests/style-sheet.cjs
// 1) tests/style-sheet.html 을 열어 STYLES 격자 시트(타일 270px, 한 줄 5개, 스타일마다 2프레임) → tests/out/style-sheet.png
// 2) 어휘 점검용 스타일 20개 시트 → tests/out/vocab-sheet.png
// 3) 모든 template×overlay×captionAnim×transition 조합을 한 번씩 그려 예외 0 확인
// 4) 1080×1920 프레임 평균 시간 측정
// 5) index.html#shorts 를 열어 콘솔 에러 없음 확인
// 정적 서버가 http://127.0.0.1:5173/ 에 떠 있어야 합니다.

const fs = require('fs');
const path = require('path');
const { chromium } = require('/opt/node-tools/node_modules/playwright');

const BASE = process.env.MRK_BASE || 'http://127.0.0.1:5173';
const OUT = path.join(__dirname, 'out');
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

// 정적 서버엔 없는 것들: 예시 사진 탐색(없으면 그림으로 대체하도록 설계됨)과 Vercel 함수 /api/health 의 404 는 예상된 것
const EXPECTED_404 = /\/assets\/samples\/[^/]+\.jpg$|\/api\/health$/;

function watch(page, bucket, tag, expected) {
  const pending404 = [];
  page.on('response', (r) => { if (r.status() === 404) pending404.push(r.url()); });
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (/404/.test(m.text())) {
      const url = pending404.shift() || '';
      if (EXPECTED_404.test(url)) { expected.push(`[${tag}] 404(예상됨): ${url}`); return; }
      bucket.push(`[${tag}] console.error: ${m.text()} ${url}`);
      return;
    }
    bucket.push(`[${tag}] console.error: ${m.text()}`);
  });
  page.on('pageerror', (e) => bucket.push(`[${tag}] pageerror: ${e.message}`));
  page.on('requestfailed', (r) => bucket.push(`[${tag}] requestfailed: ${r.url()} ${r.failure()?.errorText || ''}`));
}

function savePng(dataUrl, file) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
}

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const report = { consoleErrors: [], expected404: [], renderErrors: [], sweep: null, perf: null, files: [] };
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    watch(page, report.consoleErrors, 'sheet', report.expected404);
    await page.goto(`${BASE}/tests/style-sheet.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.sheetReady === true, null, { timeout: 20000 });

    // 1) STYLES 시트: 타일 폭 270px, 한 줄 5개(스타일마다 2프레임), 타일 아래 id·이름
    const r1 = await page.evaluate(async () => window.sheet.renderSheet(window.sheet.STYLES, { cellW: 270, cellH: 480, cols: 5 }));
    report.renderErrors.push(...r1.errors);
    const f1 = path.join(OUT, 'style-sheet.png');
    savePng(r1.dataUrl, f1);
    report.files.push({ file: f1, cells: r1.cells });

    // 2) 어휘 점검 스타일 20개 시트
    const r2 = await page.evaluate(async () => window.sheet.renderSheet(window.sheet.vocabStyles(), { cellW: 540, cellH: 960, cols: 8 }));
    report.renderErrors.push(...r2.errors);
    const f2 = path.join(OUT, 'vocab-sheet.png');
    savePng(r2.dataUrl, f2);
    report.files.push({ file: f2, cells: r2.cells });

    // 3) 모든 조합 예외 점검
    report.sweep = await page.evaluate(async () => window.sheet.sweepAll());
    report.renderErrors.push(...report.sweep.errors);
    delete report.sweep.errors;

    // 4) 성능(1080×1920): STYLES + 어휘 스타일
    report.perf = await page.evaluate(async () => {
      const list = [...window.sheet.STYLES, ...window.sheet.vocabStyles().filter((s) => s.visual.aspect === '9:16')];
      return window.sheet.measurePerf(list, 30);
    });
    await page.close();

    // 5) 기존 앱
    const app = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    watch(app, report.consoleErrors, 'app', report.expected404);
    await app.goto(`${BASE}/#shorts`, { waitUntil: 'load' });
    await app.waitForTimeout(2500);
    report.appTitle = await app.title();
    report.appFontOptions = await app.evaluate(() => [...document.querySelectorAll('#font option')].map((o) => o.value));
    await app.close();
  } finally {
    await browser.close();
  }

  const ok = report.consoleErrors.length === 0 && report.renderErrors.length === 0;
  report.ok = ok;
  console.log(JSON.stringify(report, null, 2));
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
