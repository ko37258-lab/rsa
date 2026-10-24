// 가로(16:9)·정사각(1:1) 화면 점검(Playwright).
//   node tests/aspect-sheet.cjs
// 30가지 스타일은 모두 세로(9:16)로 만들어졌으므로, 같은 스타일을 가로·정사각으로 바꿔도 보기 좋은지 확인합니다.
// 1) 30개 스타일 × 2시각(훅 다음 첫 보통 장면 · 마지막 장면) — 16:9 → tests/out/aspect-169.png, 1:1 → tests/out/aspect-11.png
// 2) 보조 시트(훅 장면 · 사진 없는 글자 장면 · 엔딩, 16:9 와 1:1) → tests/out/aspect-extra.png
// 3) 30개 스타일의 모든 장면 시각 + 모든 template×overlay×captionAnim×transition 조합을 16:9·1:1 로 그려 예외 0 확인
// 4) 1920×1080 (그리고 1080×1080) 프레임 평균 시간
// tests/style-sheet.html 페이지를 열어 글꼴(@font-face)을 쓰고, 그리기 모듈은 그 페이지 안에서 직접 import 합니다.
// 정적 서버가 http://127.0.0.1:5173/ 에 떠 있어야 합니다.

const fs = require('fs');
const path = require('path');
const { chromium } = require('/opt/node-tools/node_modules/playwright');

const BASE_URL = process.env.MRK_BASE || 'http://127.0.0.1:5173';
const OUT = path.join(__dirname, 'out');
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
// 정적 서버엔 없는 예시 사진(그림으로 대체됨)과 /api/health 의 404 는 예상된 것(style-sheet.cjs 와 같음)
const EXPECTED_404 = /\/assets\/samples\/[^/]+\.jpg$|\/api\/health$/;

function savePng(dataUrl, file) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
}

// ── 페이지 안에서 돌아가는 코드(문자열로 넘겨 window.aspect 에 붙입니다) ──
const PAGE_CODE = String.raw`
(async () => {
  const R = await import('./js/shorts-render.js');
  const S = await import('./js/styles.js');
  const { sample, SHORTS_CASE } = await import('./js/samples.js');

  const BASE = {
    aspect: '9:16', template: 'band', font: '900', captionSize: 68, captionStyle: 'outline', captionAnim: 'none', overlay: 'none',
    motion: 'auto', transition: 'fade', titleMode: 'band', textColor: '#ffffff', highlightColor: '#ffd43b', bandColor: '#0b0d14',
    panelColor: '#ffffff', inkColor: '#111111', showProgress: true,
    title: SHORTS_CASE.title, channel: 'MR.K 고상철', dateLabel: '2026.10.22',
    ending: { enabled: true, text: '*구독*하고\n땅 공부 같이 해요', sub: 'MR.K 고상철 · 부동산 AI', duration: 2.2 },
    logo: null, scenes: [],
  };

  async function styleScenes(st) {
    const out = [];
    for (const s of st.sample?.scenes || []) out.push({ ...s, img: s.img ? await sample(s.img) : null, img2: s.img2 ? await sample(s.img2) : null });
    return out;
  }
  /** 스타일을 입힌 뒤 화면 비율만 바꿉니다(스타일 데이터는 모두 9:16) */
  async function projectFor(st, aspect) {
    const p = S.styleProject({ ...BASE, scenes: await styleScenes(st), title: st.sample?.title || BASE.title }, st);
    p.aspect = aspect;
    await R.ensureFonts(p);
    return p;
  }
  /** 장면 seg 안의 "다 보이는" 시각: 전환이 끝나고 자막 등장(앞 60%)이 거의 끝난 때 */
  const settled = (seg) => seg.start + (seg.end - seg.start) * 0.66;
  function mainTimes(tl) {
    const scenes = tl.segs.filter((s) => s.kind === 'scene');
    const first = scenes.find((s) => s.scene.kind !== 'hook') || scenes[0];
    const last = scenes[scenes.length - 1];
    return [['보통', settled(first), first], ['마지막', settled(last), last]];
  }
  function extraTimes(tl) {
    const scenes = tl.segs.filter((s) => s.kind === 'scene');
    const out = [];
    const hook = scenes.find((s) => s.scene.kind === 'hook');
    if (hook) out.push(['훅', Math.max(1.7, settled(hook)), hook]);
    const noImg = scenes.find((s) => !s.scene.img && s !== scenes[scenes.length - 1]) || scenes.find((s) => !s.scene.img);
    if (noImg) out.push(['글자', settled(noImg), noImg]);
    const end = tl.segs.find((s) => s.kind === 'ending');
    if (end) out.push(['엔딩', end.end - 0.3, end]);
    return out;
  }

  function cellCanvas(p, t, tl, cellW, errors, id) {
    const d = R.dims(p.aspect);
    const W = cellW;
    const H = Math.round((d.H * cellW) / d.W);
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    try { R.drawFrame(c.getContext('2d'), p, W, H, t, tl); }
    catch (e) { errors.push({ id, t, message: String((e && e.stack) || e) }); }
    return c;
  }

  /** 타일 [{canvas, id, label, sub}] → 격자 캔버스(타일 아래 글자 3줄) */
  function grid(cells, cellW, cellH, cols) {
    const R2 = Math.ceil(cells.length / cols);
    const fs = Math.max(12, Math.min(20, Math.round(cellW / 22)));
    const labelH = Math.round(fs * 4.2);
    const gap = 14;
    const sheet = document.createElement('canvas');
    sheet.width = cols * (cellW + gap) + gap;
    sheet.height = R2 * (cellH + labelH + gap) + gap;
    const g = sheet.getContext('2d');
    g.fillStyle = '#15171c';
    g.fillRect(0, 0, sheet.width, sheet.height);
    const fit = (text, maxW) => { let s = String(text); while (s.length > 2 && g.measureText(s).width > maxW) s = s.slice(0, -2) + '…'; return s; };
    cells.forEach((cell, i) => {
      const x = gap + (i % cols) * (cellW + gap);
      const y = gap + Math.floor(i / cols) * (cellH + labelH + gap);
      g.fillStyle = '#000';
      g.fillRect(x, y, cellW, cellH);
      g.drawImage(cell.canvas, x, y);
      g.textBaseline = 'top';
      g.font = '700 ' + fs + 'px "Pretendard Variable", sans-serif';
      g.fillStyle = '#8fd3ff';
      g.fillText(fit(cell.id, cellW), x, y + cellH + 6);
      g.fillStyle = '#eee';
      g.fillText(fit(cell.label, cellW), x, y + cellH + 6 + fs * 1.3);
      g.font = '500 ' + Math.round(fs * 0.85) + 'px "Pretendard Variable", sans-serif';
      g.fillStyle = '#9aa';
      g.fillText(fit(cell.sub || '', cellW), x, y + cellH + 6 + fs * 2.6);
    });
    return sheet;
  }

  const sub = (p) => p.template + '/' + p.overlay + '/' + p.captionStyle + '/' + p.captionAnim + '/' + p.titleMode;

  /** 30개 스타일 × 2시각 시트 */
  async function renderAspect(aspect, { cellW, cols }) {
    const errors = [];
    const cells = [];
    for (const st of S.STYLES) {
      const p = await projectFor(st, aspect);
      const tl = R.buildTimeline(p);
      for (const [name, t, seg] of mainTimes(tl)) {
        const id = st.id + ' · ' + name + ' t=' + t.toFixed(1);
        cells.push({ canvas: cellCanvas(p, t, tl, cellW, errors, id), id, label: st.name + (seg.scene && !seg.scene.img ? ' (사진 없음)' : ''), sub: sub(p) });
      }
    }
    const cellH = cells[0].canvas.height;
    const sheet = grid(cells, cellW, cellH, cols);
    return { dataUrl: sheet.toDataURL('image/png'), errors, cells: cells.length };
  }

  /** 보조 시트: 훅 · 사진 없는 장면 · 엔딩 (16:9, 1:1 한 줄씩 번갈아) */
  async function renderExtra({ cellW = 400 } = {}) {
    const errors = [];
    const cells = [];
    for (const st of S.STYLES) {
      for (const aspect of ['16:9', '1:1']) {
        const p = await projectFor(st, aspect);
        const tl = R.buildTimeline(p);
        for (const [name, t] of extraTimes(tl)) {
          const id = st.id + ' · ' + aspect + ' ' + name + ' t=' + t.toFixed(1);
          const w = aspect === '1:1' ? Math.round(cellW * 9 / 16) : cellW;
          const c = cellCanvas(p, t, tl, w, errors, id);
          // 정사각 타일은 16:9 타일과 높이를 맞춰 같은 격자에 넣습니다
          const box = document.createElement('canvas');
          box.width = cellW; box.height = Math.round(cellW * 9 / 16);
          box.getContext('2d').drawImage(c, Math.round((cellW - c.width) / 2), 0);
          cells.push({ canvas: box, id, label: st.name, sub: sub(p) });
        }
      }
    }
    const sheet = grid(cells, cellW, Math.round(cellW * 9 / 16), 6);
    return { dataUrl: sheet.toDataURL('image/png'), errors, cells: cells.length };
  }

  /** 예외 점검: 30개 스타일의 모든 장면(시작·가운데·끝) + 어휘 조합 전체를 가로·정사각으로 */
  async function sweep() {
    const errors = [];
    let frames = 0;
    const c = document.createElement('canvas');
    for (const aspect of ['16:9', '1:1']) {
      const small = aspect === '16:9' ? { W: 480, H: 270 } : { W: 360, H: 360 };
      for (const st of S.STYLES) {
        const p = await projectFor(st, aspect);
        const tl = R.buildTimeline(p);
        c.width = small.W; c.height = small.H;
        const ctx = c.getContext('2d');
        for (const sg of tl.segs) for (const t of [sg.start + 0.05, sg.start + 0.3, (sg.start + sg.end) / 2, sg.end - 0.05]) {
          try { R.drawFrame(ctx, p, small.W, small.H, t, tl); frames++; }
          catch (e) { errors.push({ style: st.id, aspect, t, message: String((e && e.stack) || e) }); }
        }
      }
      const [a, b, cc, d] = await Promise.all(['s01-land-zoning', 's02-landlocked', 's03-permit-site', 's05-apartment'].map((id) => sample(id)));
      const rich = [
        { caption: '이거 모르고 땅 사면\n*손해*봅니다', img: a, kind: 'hook', duration: 2.4, tag: '2026', label: '경기 양평' },
        { caption: '*용도지역*부터 확인하세요', img: b, img2: cc, duration: 3, tag: '3.2억', label: '맹지', counter: { from: 0, to: 1200, suffix: '만원' } },
        { caption: '세 가지만 지켜도\n*토지투자* 실패가 줄어듭니다', img: null, duration: 3.2, tag: '2027', counter: { from: 10, to: 87, suffix: '%' } },
        { caption: '정답은 *도로*입니다', img: d, kind: 'answer', duration: 2.6, tag: '정답' },
        { caption: '궁금한 땅은\n*MR.K*에게 물어보세요', img: a, kind: 'cta', duration: 2.6 },
      ];
      let n = 0;
      c.width = small.W; c.height = small.H;
      const ctx = c.getContext('2d');
      for (const template of ['band', 'blur', 'full', 'split', 'card', 'dark']) for (const overlay of Object.keys(R.OVERLAYS)) for (const captionAnim of R.CAPTION_ANIMS) for (const transition of ['fade', 'slide', 'zoom', 'none', 'wipe']) {
        const p = {
          ...BASE, aspect, scenes: rich, template, overlay, captionAnim, transition,
          titleMode: ['band', 'hook', 'none'][n % 3], captionStyle: R.CAPTION_STYLES[n % R.CAPTION_STYLES.length], bandColor: n % 2 ? '#e9e7e2' : '#0b0d14',
        };
        n++;
        const tl = R.buildTimeline(p);
        for (const t of [0.6, 2.5, 3.9, 5.3, 8.0, tl.total - 0.1]) {
          try { R.drawFrame(ctx, p, small.W, small.H, t, tl); frames++; }
          catch (e) { errors.push({ aspect, template, overlay, captionAnim, transition, t, message: String((e && e.stack) || e) }); }
        }
      }
    }
    return { frames, errors };
  }

  /** 실제 크기(1080 화질) 프레임 평균 시간. 캐시를 한 번 데운 뒤 잽니다(style-sheet.cjs 의 measurePerf 와 같은 방식) */
  async function perf(aspect, frames = 30) {
    const c = document.createElement('canvas');
    const results = [];
    for (const st of S.STYLES) {
      const p = await projectFor(st, aspect);
      const { W, H } = R.dims(aspect);
      c.width = W; c.height = H;
      const ctx = c.getContext('2d');
      const tl = R.buildTimeline(p);
      const at = (k) => (tl.total * (k + 0.5)) / frames;
      for (let k = 0; k < frames; k++) R.drawFrame(ctx, p, W, H, at(k), tl);
      ctx.getImageData(0, 0, 1, 1);
      const t0 = performance.now();
      for (let k = 0; k < frames; k++) R.drawFrame(ctx, p, W, H, at(k), tl);
      ctx.getImageData(0, 0, 1, 1);
      results.push({ style: st.id, ms: Math.round(((performance.now() - t0) / frames) * 100) / 100 });
    }
    const avg = results.reduce((s, r) => s + r.ms, 0) / results.length;
    const { W, H } = R.dims(aspect);
    return { size: W + 'x' + H, avg: Math.round(avg * 100) / 100, max: Math.max(...results.map((r) => r.ms)), slowest: [...results].sort((a, b) => b.ms - a.ms).slice(0, 3) };
  }

  window.aspect = { renderAspect, renderExtra, sweep, perf, count: S.STYLES.length };
  window.aspectReady = true;
})().catch((e) => { window.aspectError = String((e && e.stack) || e); });
`;

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const report = { styles: 0, consoleErrors: [], expected404: [], renderErrors: [], sweepFrames: 0, perf: [], files: [] };
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const pending404 = [];
    page.on('response', (r) => { if (r.status() === 404) pending404.push(r.url()); });
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      if (/404/.test(m.text())) {
        const url = pending404.shift() || '';
        if (EXPECTED_404.test(url)) { report.expected404.push(url); return; }
      }
      report.consoleErrors.push(m.text());
    });
    page.on('pageerror', (e) => report.consoleErrors.push(`pageerror: ${e.message}`));
    await page.goto(`${BASE_URL}/tests/style-sheet.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.sheetReady === true, null, { timeout: 20000 });
    await page.addScriptTag({ content: PAGE_CODE });
    await page.waitForFunction(() => window.aspectReady === true || window.aspectError, null, { timeout: 20000 });
    const err = await page.evaluate(() => window.aspectError || null);
    if (err) throw new Error(err);
    report.styles = await page.evaluate(() => window.aspect.count);

    // 1) 30개 스타일 × 2시각
    for (const [aspect, file, opts] of [['16:9', 'aspect-169.png', { cellW: 480, cols: 6 }], ['1:1', 'aspect-11.png', { cellW: 360, cols: 8 }]]) {
      const r = await page.evaluate(async ([a, o]) => window.aspect.renderAspect(a, o), [aspect, opts]);
      report.renderErrors.push(...r.errors);
      const f = path.join(OUT, file);
      savePng(r.dataUrl, f);
      report.files.push({ file: f, cells: r.cells });
    }
    // 2) 보조 시트
    const rx = await page.evaluate(async () => window.aspect.renderExtra({ cellW: 400 }));
    report.renderErrors.push(...rx.errors);
    const fx = path.join(OUT, 'aspect-extra.png');
    savePng(rx.dataUrl, fx);
    report.files.push({ file: fx, cells: rx.cells });

    // 3) 예외 점검
    const sw = await page.evaluate(async () => window.aspect.sweep());
    report.sweepFrames = sw.frames;
    report.renderErrors.push(...sw.errors);

    // 4) 프레임 시간
    report.perf.push(await page.evaluate(async () => window.aspect.perf('16:9')));
    report.perf.push(await page.evaluate(async () => window.aspect.perf('1:1')));
    await page.close();
  } finally {
    await browser.close();
  }
  report.renderErrorCount = report.renderErrors.length;
  report.renderErrors = report.renderErrors.slice(0, 20);
  report.expected404 = [...new Set(report.expected404)];
  report.ok = report.consoleErrors.length === 0 && report.renderErrors.length === 0;
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
