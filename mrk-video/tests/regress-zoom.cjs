// 특정 스타일·자막 모양을 미리보기 크기(540×960)로 캡처해 눈으로 확인하는 보조 스크립트.
//   node tests/regress-zoom.cjs
// 결과: tests/out/review/zoom-*.png
const fs = require('fs');
const path = require('path');
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const BASE = process.env.MRK_BASE || 'http://127.0.0.1:5173';
const OUT = path.join(__dirname, 'out', 'review');
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const CASES = process.env.ZOOM_SET === '2' ? [
  { style: 'factcheck-flash', times: [6.5, 9.8] },
  { style: 'check-blue', times: [5.0, 8.6, 12.0] },
  { style: 'before-after', times: [1.0, 4.2, 7.5] },
  { style: 'number-counter', times: [1.0, 2.2, 4.5, 7.0] },
  { style: 'top3-badge', times: [1.6, 3.5, 6.0] },
  { style: 'lecture-paper', times: [3.35, 3.6, 3.9], set: { captionAnim: 'bounce', titleMode: 'band' }, label: 'bounce' },
  { style: 'lecture-paper', times: [3.2, 3.5], set: { captionAnim: 'words', titleMode: 'band' }, label: 'words' },
] : [
  { style: 'factcheck-flash', times: [0.3, 0.9, 1.6, 2.4, 3.4] },
  { style: 'top5-neon', times: [1.6, 2.6, 4.2] },
  { style: 'quiz-mint', times: [1.6, 2.6, 4.0] },
  { style: 'number-counter', times: [1.6, 2.8] },
  { style: 'lecture-paper', times: [4.2], set: { captionStyle: 'neon' }, label: 'band-neon' },
  { style: 'lecture-paper', times: [4.2], set: { captionStyle: 'neon', template: 'dark' }, label: 'dark-neon' },
  { style: 'lecture-paper', times: [4.2], set: { captionStyle: 'outline', template: 'split', overlay: 'none', titleMode: 'band' }, label: 'split-outline' },
  { style: 'lecture-paper', times: [4.2], set: { captionStyle: 'plain', template: 'split', overlay: 'none', titleMode: 'band' }, label: 'split-plain' },
  { style: 'lecture-paper', times: [4.2], set: { captionStyle: 'outline', template: 'card' }, label: 'card-outline' },
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: EXE });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load/.test(m.text())) errors.push(m.text()); });
  await page.goto(`${BASE}/#shorts`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelectorAll('#styleStrip .style-card').length > 0 && document.querySelectorAll('#sceneList .scene').length > 0, null, { timeout: 20000 });
  await page.waitForTimeout(800);
  const meta = await page.evaluate(async () => { const m = await import('/js/styles.js'); return Object.fromEntries(m.STYLES.map((s) => [s.id, { scenes: s.sample?.scenes?.length || 0, title: s.sample?.title || '' }])); });
  for (const c of CASES) {
    await page.click(`#styleStrip .style-card[data-id="${c.style}"]`);
    await page.waitForFunction(({ n }) => document.querySelectorAll('#sceneList .scene').length === n, { n: meta[c.style].scenes }, { timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(100);
    if (c.set) for (const [k, v] of Object.entries(c.set)) { await page.selectOption(`#${k}`, v); await page.$eval(`#${k}`, (el) => el.dispatchEvent(new Event('input', { bubbles: true }))); }
    for (const t of c.times) {
      const real = await page.evaluate((t) => {
        const [, b] = document.querySelector('#timecode').textContent.split('/').map((s) => s.trim());
        const [m, r] = b.split(':'); const total = Number(m) * 60 + Number(r);
        const sc = document.querySelector('#scrub'); sc.value = String(Math.round((t / total) * 1000)); sc.dispatchEvent(new Event('input', { bubbles: true }));
        return document.querySelector('#timecode').textContent;
      }, t);
      const url = await page.$eval('#previewCanvas', (c) => c.toDataURL('image/png'));
      const name = `zoom-${c.label || c.style}-t${t}.png`;
      fs.writeFileSync(path.join(OUT, name), Buffer.from(url.split(',')[1], 'base64'));
      console.log(name, real);
    }
  }
  await browser.close();
  if (errors.length) { console.log('errors:', errors); process.exit(1); }
})();
