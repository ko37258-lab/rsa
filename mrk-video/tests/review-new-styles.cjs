// 새 스타일 10개·자막 모양/등장 검수용 캡처(Playwright). 파일을 고치지 않고 보기만 합니다.
//   node tests/review-new-styles.cjs
// 1) 새 스타일 10개를 8개 시각(훅 등장·훅·전환·장면2 등장·장면2·장면3·사진 없음·엔딩)에 400px 타일로 → tests/out/review-new/engine-<id>.png
// 2) 의심 지점을 1080×1920 실제 크기로 그려 잘라 냄 → tests/out/review-new/ev-*.png
// 3) card 템플릿 프레임 시간(움직임·장식 유무별)
// 4) index.html#shorts 에서 새 스타일 카드 10개를 차례로 눌러 미리보기 캡처 → tests/out/review-new/app-<id>-{a,b}.png
// 정적 서버가 http://127.0.0.1:5173/ 에 떠 있어야 합니다.

const fs = require('fs');
const path = require('path');
const { chromium } = require('/opt/node-tools/node_modules/playwright');

const BASE = process.env.MRK_BASE || 'http://127.0.0.1:5173';
const OUT = path.join(__dirname, 'out', 'review-new');
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const NEW_IDS = ['top5-neon', 'law-update-flash', 'calc-marker', 'ai-tool-glass', 'qna-bubble', 'case-gradient', 'site-tour-tag', 'factcheck-flash', 'quote-wave'];
NEW_IDS.unshift('before-after'); // 21번째부터 새 스타일로 보고 함께 찍습니다(총 10개 + cta-consult 는 기존 시트로 충분)

function savePng(dataUrl, file) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
}

// ── 페이지 안에서 도는 코드 ──────────────────────────
async function pageSetup() {
  const R = await import('/js/shorts-render.js');
  const S = await import('/js/styles.js');
  const M = await import('/js/samples.js');
  const BASEP = {
    aspect: '9:16', template: 'band', font: '900', captionSize: 68, captionStyle: 'outline', captionAnim: 'none', overlay: 'none',
    motion: 'auto', transition: 'fade', titleMode: 'band', textColor: '#ffffff', highlightColor: '#ffd43b', bandColor: '#0b0d14',
    panelColor: '#ffffff', inkColor: '#111111', showProgress: true,
    title: M.SHORTS_CASE.title, channel: 'MR.K 고상철', dateLabel: '2026.10.22',
    ending: { enabled: true, text: '*구독*하고\n땅 공부 같이 해요', sub: 'MR.K 고상철 · 부동산 AI', duration: 2.2 },
    logo: null, scenes: [],
  };
  async function scenesFor(style) {
    const out = [];
    for (const s of style.sample.scenes) out.push({ ...s, img: s.img ? await M.sample(s.img) : null, img2: s.img2 ? await M.sample(s.img2) : null });
    return out;
  }
  async function captionScenes() {
    const [a, b] = await Promise.all(['s01-land-zoning', 's02-landlocked'].map((id) => M.sample(id)));
    return [
      { caption: '땅을 살 때는\n*용도지역*부터 확인하세요', img: a, duration: 3 },
      { caption: '*도로*에 붙지 않은 맹지는\n건축이 어렵습니다', img: null, duration: 3 },
      { caption: '이거 모르고 땅 사면\n*손해*봅니다', img: b, kind: 'hook', duration: 2.4 },
    ];
  }
  async function projectOf(id) {
    const st = S.findStyle(id);
    const scenes = await scenesFor(st);
    const p = S.styleProject({ ...BASEP, scenes, title: st.sample?.title || BASEP.title }, st);
    await R.ensureFonts(p);
    return { st, p, tl: R.buildTimeline(p) };
  }
  function tile(p, tl, t, W) {
    const d = R.dims(p.aspect);
    const H = Math.round((d.H * W) / d.W);
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    let err = null;
    try { R.drawFrame(c.getContext('2d'), p, W, H, t, tl); } catch (e) { err = String(e && e.stack || e); }
    return { c, err };
  }
  function grid(cells, cellW, cellH, cols, title) {
    const gap = 12; const fs = 16; const labelH = 46; const top = 34;
    const rows = Math.ceil(cells.length / cols);
    const sheet = document.createElement('canvas');
    sheet.width = cols * (cellW + gap) + gap;
    sheet.height = top + rows * (cellH + labelH + gap) + gap;
    const g = sheet.getContext('2d');
    g.fillStyle = '#15171c'; g.fillRect(0, 0, sheet.width, sheet.height);
    g.fillStyle = '#fff'; g.font = `700 20px "Pretendard Variable", sans-serif`; g.textBaseline = 'top';
    g.fillText(title, gap, 8);
    cells.forEach((cell, i) => {
      const x = gap + (i % cols) * (cellW + gap);
      const y = top + gap + Math.floor(i / cols) * (cellH + labelH + gap);
      g.drawImage(cell.c, x, y);
      g.fillStyle = cell.err ? '#ff6b6b' : '#8fd3ff'; g.font = `700 ${fs}px "Pretendard Variable", sans-serif`;
      g.fillText(cell.label, x, y + cellH + 6);
      g.fillStyle = '#9aa'; g.font = `500 ${fs - 2}px "Pretendard Variable", sans-serif`;
      g.fillText(cell.sub || '', x, y + cellH + 6 + fs * 1.3);
    });
    return sheet.toDataURL('image/png');
  }
  /** 1080×1920 으로 그려 (x,y,w,h) 비율 영역을 scale 배로 잘라 냅니다 */
  function crop1080(p, tl, t, rect, scale = 1) {
    const { W, H } = R.dims(p.aspect);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    R.drawFrame(c.getContext('2d'), p, W, H, t, tl);
    const x = Math.round(rect.x * W), y = Math.round(rect.y * H), w = Math.round(rect.w * W), h = Math.round(rect.h * H);
    const o = document.createElement('canvas'); o.width = Math.round(w * scale); o.height = Math.round(h * scale);
    const g = o.getContext('2d'); g.imageSmoothingQuality = 'high';
    g.drawImage(c, x, y, w, h, 0, 0, o.width, o.height);
    return o.toDataURL('image/png');
  }
  async function measure(p, frames = 30) {
    await R.ensureFonts(p);
    const { W, H } = R.dims(p.aspect);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    const tl = R.buildTimeline(p);
    for (let k = 0; k < frames; k++) R.drawFrame(ctx, p, W, H, (tl.total * (k + 0.5)) / frames, tl);
    ctx.getImageData(0, 0, 1, 1);
    const t0 = performance.now();
    for (let k = 0; k < frames; k++) R.drawFrame(ctx, p, W, H, (tl.total * (k + 0.5)) / frames, tl);
    ctx.getImageData(0, 0, 1, 1);
    return Math.round(((performance.now() - t0) / frames) * 100) / 100;
  }
  window.rv = { R, S, M, BASEP, scenesFor, captionScenes, projectOf, tile, grid, crop1080, measure };
}

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const report = { engineErrors: [], consoleErrors: [], perf: {}, app: {}, files: [] };
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on('pageerror', (e) => report.consoleErrors.push(`[sheet] pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) report.consoleErrors.push(`[sheet] ${m.text()}`); });
    await page.goto(`${BASE}/tests/style-sheet.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.sheetReady === true, null, { timeout: 20000 });
    await page.evaluate(pageSetup);

    // 1) 새 스타일 10개 × 8시각
    for (const id of NEW_IDS) {
      const r = await page.evaluate(async (id) => {
        const { projectOf, tile, grid } = window.rv;
        const { st, p, tl } = await projectOf(id);
        const segs = tl.segs;
        const s0 = segs[0], s1 = segs[1], s2 = segs[2];
        const noImg = segs.find((s) => s.kind === 'scene' && !s.scene.img) || s2;
        const end = segs[segs.length - 1];
        const hookAnimT = p.titleMode === 'hook' ? 1.6 : 0.5;
        const frames = [
          [hookAnimT, '훅 등장', `t=${hookAnimT}`],
          [s0.end - 0.5, '훅', `t=${(s0.end - 0.5).toFixed(1)}`],
          [s1.start + 0.18, '전환', `t=${(s1.start + 0.18).toFixed(2)} (${p.transition})`],
          [s1.start + 0.7, '장면2 등장', `t=${(s1.start + 0.7).toFixed(1)} (${p.captionAnim})`],
          [(s1.start + s1.end) / 2, '장면2', `t=${((s1.start + s1.end) / 2).toFixed(1)}`],
          [(s2.start + s2.end) / 2, '장면3', `t=${((s2.start + s2.end) / 2).toFixed(1)}`],
          [(noImg.start + noImg.end) / 2, '사진 없음', `t=${((noImg.start + noImg.end) / 2).toFixed(1)}`],
          [end.start + 0.6, '엔딩', `t=${(end.start + 0.6).toFixed(1)}`],
        ];
        const cells = frames.map(([t, label, sub]) => { const { c, err } = tile(p, tl, t, 400); return { c, err, label, sub }; });
        const errs = cells.filter((c) => c.err).map((c) => ({ id, label: c.label, err: c.err }));
        const { W: cw, H: ch } = { W: 400, H: Math.round(400 * 16 / 9) };
        return { dataUrl: grid(cells, cw, ch, 4, `${id} — ${st.name}  [${p.template}/${p.captionAnim}/${p.captionStyle}/${p.overlay}/${p.transition}/${p.titleMode}]`), errs };
      }, id);
      report.engineErrors.push(...r.errs);
      const f = path.join(OUT, `engine-${id}.png`);
      savePng(r.dataUrl, f);
      report.files.push(f);
    }

    // 2) 1080 증거 자르기
    const evid = await page.evaluate(async () => {
      const { R, S, BASEP, captionScenes, projectOf, crop1080 } = window.rv;
      const out = {};
      const cs = await captionScenes();
      const bp = (extra) => { const p = { ...BASEP, scenes: cs, ...extra }; return [p, R.buildTimeline(p)]; };
      await R.ensureFonts(bp({})[0]);
      // bounce: 여러 줄 겹침(band·outline, t=0.9) / 사진 위로 튀어나옴(t=0.6)
      let [p, tl] = bp({ captionAnim: 'bounce' });
      out['ev-bounce-band-outline-t0.9'] = crop1080(p, tl, 0.9, { x: 0, y: 0.62, w: 1, h: 0.3 });
      out['ev-bounce-band-outline-t0.6'] = crop1080(p, tl, 0.6, { x: 0, y: 0.62, w: 1, h: 0.3 });
      [p, tl] = bp({ captionAnim: 'bounce', captionStyle: 'underline', template: 'card' });
      out['ev-bounce-card-underline-t0.6'] = crop1080(p, tl, 0.6, { x: 0, y: 0.5, w: 1, h: 0.3 });
      [p, tl] = bp({ captionAnim: 'bounce', captionStyle: 'tag', template: 'split', panelColor: '#f0fdf4' });
      out['ev-bounce-split-tag-t0.6'] = crop1080(p, tl, 0.6, { x: 0, y: 0.48, w: 1, h: 0.3 });
      // flash + bubble: 깜빡이는 단어 색
      [p, tl] = bp({ captionAnim: 'flash', captionStyle: 'bubble', template: 'split' });
      out['ev-flash-bubble-t0.3'] = crop1080(p, tl, 0.3, { x: 0, y: 0.56, w: 1, h: 0.25 });
      [p, tl] = bp({ captionAnim: 'flash', captionStyle: 'glass', template: 'split' });
      out['ev-flash-glass-split-t0.3'] = crop1080(p, tl, 0.3, { x: 0, y: 0.56, w: 1, h: 0.25 });
      // 새 스타일 의심 지점
      let o = await projectOf('site-tour-tag');
      const s1 = o.tl.segs[1];
      out['ev-site-tour-tag-s2+0.35'] = crop1080(o.p, o.tl, s1.start + 0.35, { x: 0, y: 0.45, w: 1, h: 0.3 });
      out['ev-site-tour-tag-s2+0.55'] = crop1080(o.p, o.tl, s1.start + 0.55, { x: 0, y: 0.45, w: 1, h: 0.3 });
      o = await projectOf('qna-bubble');
      out['ev-qna-bubble-hook-t1.4'] = crop1080(o.p, o.tl, 1.4, { x: 0, y: 0, w: 1, h: 1 }, 0.5);
      o = await projectOf('ai-tool-glass');
      out['ev-ai-tool-glass-s2'] = crop1080(o.p, o.tl, (o.tl.segs[1].start + o.tl.segs[1].end) / 2, { x: 0, y: 0.6, w: 1, h: 0.3 });
      out['ev-ai-tool-glass-s4'] = crop1080(o.p, o.tl, (o.tl.segs[3].start + o.tl.segs[3].end) / 2, { x: 0, y: 0.6, w: 1, h: 0.3 });
      o = await projectOf('law-update-flash');
      out['ev-law-update-hook-t1.6'] = crop1080(o.p, o.tl, 1.6, { x: 0, y: 0.18, w: 1, h: 0.3 });
      out['ev-law-update-s2'] = crop1080(o.p, o.tl, (o.tl.segs[1].start + o.tl.segs[1].end) / 2, { x: 0, y: 0.18, w: 1, h: 0.3 });
      o = await projectOf('top5-neon');
      out['ev-top5-neon-s2'] = crop1080(o.p, o.tl, (o.tl.segs[1].start + o.tl.segs[1].end) / 2, { x: 0, y: 0.6, w: 1, h: 0.3 });
      out['ev-top5-neon-s4'] = crop1080(o.p, o.tl, (o.tl.segs[3].start + o.tl.segs[3].end) / 2, { x: 0, y: 0.6, w: 1, h: 0.3 });
      o = await projectOf('factcheck-flash');
      out['ev-factcheck-s2'] = crop1080(o.p, o.tl, (o.tl.segs[1].start + o.tl.segs[1].end) / 2, { x: 0, y: 0.6, w: 1, h: 0.3 });
      o = await projectOf('calc-marker');
      out['ev-calc-marker-s2'] = crop1080(o.p, o.tl, (o.tl.segs[1].start + o.tl.segs[1].end) / 2, { x: 0, y: 0.2, w: 1, h: 0.5 }, 0.8);
      o = await projectOf('kinetic-type');
      out['ev-kinetic-pop-t3.2'] = crop1080(o.p, o.tl, 3.2, { x: 0, y: 0, w: 1, h: 1 }, 0.4);
      o = await projectOf('case-gradient');
      out['ev-case-gradient-s2'] = crop1080(o.p, o.tl, (o.tl.segs[1].start + o.tl.segs[1].end) / 2, { x: 0, y: 0.6, w: 1, h: 0.3 });
      o = await projectOf('quote-wave');
      out['ev-quote-wave-s4'] = crop1080(o.p, o.tl, (o.tl.segs[3].start + o.tl.segs[3].end) / 2, { x: 0, y: 0, w: 1, h: 1 }, 0.5);
      return out;
    });
    for (const [k, v] of Object.entries(evid)) { const f = path.join(OUT, `${k}.png`); savePng(v, f); report.files.push(f); }

    // 3) card 템플릿 프레임 시간
    report.perf = await page.evaluate(async () => {
      const { S, BASEP, scenesFor, measure } = window.rv;
      const st = S.findStyle('lecture-paper');
      const scenes = await scenesFor(st);
      const base = S.styleProject({ ...BASEP, scenes, title: st.sample.title }, st);
      const r = {};
      r['lecture-paper(card) 그대로'] = await measure(base);
      r['card motion=none'] = await measure({ ...base, motion: 'none' });
      r['card overlay=none'] = await measure({ ...base, overlay: 'none' });
      r['card motion=none overlay=none captionAnim=none'] = await measure({ ...base, motion: 'none', overlay: 'none', captionAnim: 'none' });
      r['같은 장면 band'] = await measure({ ...base, template: 'band' });
      r['같은 장면 split'] = await measure({ ...base, template: 'split' });
      r['같은 장면 full'] = await measure({ ...base, template: 'full' });
      return r;
    });
    await page.close();

    // 4) 앱에서 새 카드 누르기
    const app = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    app.on('pageerror', (e) => report.consoleErrors.push(`[app] pageerror: ${e.message}`));
    app.on('console', (m) => { if (m.type() === 'error' && !/404|ERR_ABORTED/.test(m.text())) report.consoleErrors.push(`[app] ${m.text()}`); });
    await app.goto(`${BASE}/#shorts`, { waitUntil: 'load' });
    await app.waitForFunction(() => document.querySelectorAll('#styleStrip .style-card').length >= 30, null, { timeout: 20000 });
    await app.waitForTimeout(1500);
    report.app.counts = await app.evaluate(() => ({
      cards: document.querySelectorAll('#styleStrip .style-card').length,
      styleCount: document.querySelector('#styleCount')?.textContent,
      batchBtn: document.querySelector('#styleBatchBtn')?.textContent,
      dataStyleCount: [...new Set([...document.querySelectorAll('[data-style-count]')].map((e) => e.textContent))],
      musicOptions: [...document.querySelectorAll('#styleMusic option')].map((o) => `${o.value}:${o.textContent}`),
      title: document.title,
    }));
    report.app.styles = [];
    for (const id of NEW_IDS) {
      const card = app.locator(`#styleStrip .style-card[data-id="${id}"]`);
      await card.scrollIntoViewIfNeeded();
      await card.click();
      // 예시 장면이 바뀌면 제목도 바뀐다
      try { await app.waitForFunction((id) => { const t = document.querySelector('#title')?.value || ''; return t.length > 0 && document.querySelector(`#styleStrip .style-card[data-id="${id}"]`)?.getAttribute('aria-pressed') === 'true'; }, id, { timeout: 5000 }); } catch {}
      await app.waitForTimeout(1200);
      const info = await app.evaluate(() => ({
        title: document.querySelector('#title')?.value, audioInfo: document.querySelector('#audioInfo')?.textContent,
        styleMusic: document.querySelector('#styleMusic')?.value, musicBtnDisabled: document.querySelector('#musicPreview')?.disabled,
        desc: document.querySelector('#styleDesc')?.textContent?.slice(0, 120), timecode: document.querySelector('#timecode')?.textContent,
        captionStyle: document.querySelector('#captionStyle')?.value, captionAnim: document.querySelector('#captionAnim')?.value,
        canvas: (() => { const c = document.querySelector('#previewCanvas'); return `${c.width}x${c.height}`; })(),
      }));
      const fa = path.join(OUT, `app-${id}-a.png`);
      await app.locator('#previewCanvas').screenshot({ path: fa });
      // 45% 지점으로 이동해 한 장 더
      await app.evaluate(() => { const s = document.querySelector('#scrub'); s.value = 450; s.dispatchEvent(new Event('input', { bubbles: true })); });
      await app.waitForTimeout(400);
      const fb = path.join(OUT, `app-${id}-b.png`);
      await app.locator('#previewCanvas').screenshot({ path: fb });
      info.timecodeB = await app.evaluate(() => document.querySelector('#timecode')?.textContent);
      report.app.styles.push({ id, ...info });
      report.files.push(fa, fb);
    }
    // 스타일 띠 끝(새 카드들)
    await app.locator('#styleStrip .style-card[data-id="quote-wave"]').scrollIntoViewIfNeeded();
    await app.waitForTimeout(500);
    const fs1 = path.join(OUT, 'app-strip-tail.png');
    await app.locator('#styleStrip').screenshot({ path: fs1 });
    report.files.push(fs1);
    const fs2 = path.join(OUT, 'app-audio-panel.png');
    await app.locator('section[aria-labelledby="h-audio"]').screenshot({ path: fs2 });
    report.files.push(fs2);
    await app.close();
  } finally {
    await browser.close();
  }
  console.log(JSON.stringify(report, null, 2));
})().catch((e) => { console.error(e); process.exit(2); });
