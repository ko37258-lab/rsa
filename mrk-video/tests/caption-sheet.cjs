// 자막 모양(captionStyle)·자막 등장(captionAnim) 점검(Playwright).
//   node tests/caption-sheet.cjs
// 1) tests/style-sheet.html 을 열어 모든 captionStyle × 대표 template 3종(band/split/dark) 을 t=1.4s 에,
//    모든 captionAnim 을 t=0.3/0.9/1.8s 에 270px 타일로 → tests/out/caption-sheet.png
// 2) 어려운 자리(훅 배경·사진 없는 장면·card/blur/full·밝은 배경) + 새 등장×모양 섞은 보조 시트 → tests/out/caption-sheet-extra.png
// 3) 모든 captionStyle × captionAnim × template 을 사진·전환·사진 없음·훅·엔딩 시각에 그려 예외 0 확인
// 4) 1080×1920 프레임 평균 시간(모양별·등장별)
// 5) index.html 의 #captionStyle / #captionAnim select 가 엔진 어휘를 모두 갖는지, 콘솔 오류 0
// 정적 서버가 http://127.0.0.1:5173/ 에 떠 있어야 합니다.

const fs = require('fs');
const path = require('path');
const { chromium } = require('/opt/node-tools/node_modules/playwright');

const BASE = process.env.MRK_BASE || 'http://127.0.0.1:5173';
const OUT = path.join(__dirname, 'out');
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const TARGET_MS = 12; // 1080×1920 프레임 평균 목표

// 정적 서버엔 없는 것들: 예시 사진(없으면 그림으로 대체) 과 Vercel 함수 /api/health 의 404, 그리고 이 크로미움이 못 여는 H.264 안내 영상
const EXPECTED_404 = /\/assets\/samples\/[^/]+\.jpg$|\/api\/health$/;
const EXPECTED_FAIL = /\/assets\/video\/[^/]+\.mp4$/;

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
  page.on('requestfailed', (r) => {
    if (EXPECTED_FAIL.test(r.url())) { expected.push(`[${tag}] requestfailed(예상됨, H.264 미지원): ${r.url()}`); return; }
    bucket.push(`[${tag}] requestfailed: ${r.url()} ${r.failure()?.errorText || ''}`);
  });
}

function savePng(dataUrl, file) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
}

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const report = { consoleErrors: [], expected: [], renderErrors: [], sweep: null, perf: null, files: [], select: null };
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    watch(page, report.consoleErrors, 'sheet', report.expected);
    await page.goto(`${BASE}/tests/style-sheet.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.sheetReady === true, null, { timeout: 20000 });
    report.vocab = await page.evaluate(() => ({ captionStyle: window.sheet.VOCAB.captionStyle, captionAnim: window.sheet.VOCAB.captionAnim }));

    // 1) 자막 시트(필수)
    const r1 = await page.evaluate(async () => window.sheet.renderCaptionSheet({ cellW: 270, cols: 12 }));
    report.renderErrors.push(...r1.errors);
    const f1 = path.join(OUT, 'caption-sheet.png');
    savePng(r1.dataUrl, f1);
    report.files.push({ file: f1, cells: r1.cells });

    // 2) 보조 시트
    const r2 = await page.evaluate(async () => window.sheet.renderCaptionExtra({ cellW: 270, cols: 14 }));
    report.renderErrors.push(...r2.errors);
    const f2 = path.join(OUT, 'caption-sheet-extra.png');
    savePng(r2.dataUrl, f2);
    report.files.push({ file: f2, cells: r2.cells });

    // 3) 조합 예외 점검
    report.sweep = await page.evaluate(async () => window.sheet.sweepCaptions());
    report.renderErrors.push(...report.sweep.errors);
    delete report.sweep.errors;

    // 4) 성능
    report.perf = await page.evaluate(async () => window.sheet.measureCaptionPerf(30));
    await page.close();

    // 5) 앱의 select 가 어휘를 모두 갖는지
    const app = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    watch(app, report.consoleErrors, 'app', report.expected);
    await app.goto(`${BASE}/#shorts`, { waitUntil: 'load' });
    await app.waitForTimeout(2500);
    report.select = await app.evaluate(() => ({
      captionStyle: [...document.querySelectorAll('#captionStyle option')].map((o) => o.value),
      captionAnim: [...document.querySelectorAll('#captionAnim option')].map((o) => o.value),
    }));
    await app.close();
  } finally {
    await browser.close();
  }

  const missing = [];
  for (const k of ['captionStyle', 'captionAnim']) {
    for (const v of report.vocab?.[k] || []) if (!report.select?.[k]?.includes(v)) missing.push(`${k}:${v}`);
  }
  report.selectMissing = missing;
  report.perfOk = report.perf ? report.perf.avg <= TARGET_MS : false;
  const ok = report.consoleErrors.length === 0 && report.renderErrors.length === 0 && missing.length === 0 && report.perfOk;
  report.ok = ok;
  console.log(JSON.stringify(report, null, 2));
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
