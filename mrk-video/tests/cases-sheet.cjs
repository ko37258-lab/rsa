// 따라하기 사례 렌더 점검(Playwright) — 실제 drawFrame 으로 사례마다 4시각을 그려 시트로 만들고, 모든 장면 시각을 돌려 예외 0 을 확인합니다.
//   node tests/cases-sheet.cjs
// 1) tests/style-sheet.html 을 열고(글꼴·<base>), 페이지 안에서 js/cases.js 의 caseToProject 로 사례 → 프로젝트(그 사례의 비율·스타일·상호)를 만들어
//    훅 0.3초 · 첫 보통 장면 1.4초(previewTime) · 전환 중 · 엔딩 0.8초 = 4타일/사례 → tests/out/cases-sheet.png (한 줄 = 사례 하나)
//    눈으로 보기 쉽게 4~5개씩 나눈 조각도 tests/out/cases-sheet-1.png … 로 함께 저장합니다.
// 2) 사례마다 모든 구간(장면·엔딩)의 시작·등장 중·중간·끝 시각과 전환 시각을 작은 캔버스에 그려 예외를 모읍니다(0 이어야 함).
// 3) 페이지·콘솔 오류 0 확인(예시 사진 404 는 정적 서버에서 예상되는 것으로 셈).
// 정적 서버가 http://127.0.0.1:5173/ 에 떠 있어야 합니다(없으면: cd 프로젝트 && python3 -m http.server 5173).

const fs = require('fs');
const path = require('path');
const { chromium } = require('/opt/node-tools/node_modules/playwright');

const BASE = process.env.MRK_BASE || 'http://127.0.0.1:5173';
const OUT = path.join(__dirname, 'out');
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const EXPECTED_404 = /\/assets\/samples\/[^/]+\.jpg$|\/api\/health$/;

function savePng(dataUrl, file) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
}

// ── 페이지 안에서 도는 코드 ──────────────────────────
async function pageRender({ cellW, groupSize }) {
  const R = await import('./js/shorts-render.js');
  const C = await import('./js/cases.js');
  const errors = [];
  const cells = [];
  const fitDims = (aspect) => { const d = R.dims(aspect); const s = cellW / d.W; return { W: Math.round(d.W * s), H: Math.round(d.H * s) }; };
  // 매물·행사 사례는 상호·연락처가 있는 중개사무소로(로워서드·엔딩 부제에 보이게), 그 밖은 사례 자체의 채널·부제로
  const officeFor = (c) => (c.category === 'listing' || c.category === 'event' ? { name: '○○공인중개사사무소', phone: '010-0000-0000' } : {});
  const projects = [];
  for (const c of C.CASE_DATA) {
    let p;
    try { p = await C.caseToProject(c, { office: officeFor(c) }); }
    catch (e) { errors.push({ id: c.id, step: 'caseToProject', message: String(e && e.stack || e) }); continue; }
    await R.ensureFonts(p);
    const tl = R.buildTimeline(p);
    projects.push({ c, p, tl });
    const segs = tl.segs.filter((s) => s.kind === 'scene');
    const ending = tl.segs.find((s) => s.kind === 'ending');
    const times = [
      [0.3, '훅 0.3s'],
      [R.previewTime(tl), '첫 보통 장면 +1.4s'],
      [segs[1] ? segs[1].start + 0.1 : 0.5, '전환 중'],
      [ending ? ending.start + 0.8 : tl.total - 0.5, '엔딩 +0.8s'],
    ];
    for (const [t, lab] of times) {
      const cv = document.createElement('canvas');
      const { W, H } = fitDims(p.aspect);
      cv.width = W; cv.height = H;
      try { R.drawFrame(cv.getContext('2d'), p, W, H, t, tl); }
      catch (e) { errors.push({ id: c.id, t, message: String(e && e.stack || e) }); }
      cells.push({ cv, id: `${c.id} · ${lab} (t=${t.toFixed(2)})`, label: `${c.name} · ${c.style} · ${c.aspect}`, sub: `${p.template}/${p.captionAnim}/${p.captionStyle}/${p.overlay}${p.extras?.length ? '+' + p.extras.join('+') : ''} · ${c.music}` });
    }
  }
  // 격자(한 줄 = 사례 하나, 4타일). 비율이 달라도 타일 높이는 가장 큰 것(9:16)에 맞추고 세로 가운데에 둡니다.
  const cols = 4, gap = 14, fsz = 16, labelH = Math.round(fsz * 4.2);
  const cellH = Math.max(...cells.map((x) => x.cv.height));
  function compose(list) {
    const rows = Math.ceil(list.length / cols);
    const sheet = document.createElement('canvas');
    sheet.width = cols * (cellW + gap) + gap;
    sheet.height = rows * (cellH + labelH + gap) + gap;
    const g = sheet.getContext('2d');
    g.fillStyle = '#15171c'; g.fillRect(0, 0, sheet.width, sheet.height);
    const fit = (text, maxW) => { let s = String(text); while (s.length > 2 && g.measureText(s).width > maxW) s = s.slice(0, -2) + '…'; return s; };
    list.forEach((cell, i) => {
      const x = gap + (i % cols) * (cellW + gap);
      const y = gap + Math.floor(i / cols) * (cellH + labelH + gap);
      g.fillStyle = '#000'; g.fillRect(x, y, cellW, cellH);
      g.drawImage(cell.cv, x, y + Math.round((cellH - cell.cv.height) / 2));
      g.textBaseline = 'top';
      g.fillStyle = '#8fd3ff'; g.font = `700 ${fsz}px "Pretendard Variable", sans-serif`; g.fillText(fit(cell.id, cellW), x, y + cellH + 6);
      g.fillStyle = '#eee'; g.fillText(fit(cell.label, cellW), x, y + cellH + 6 + fsz * 1.3);
      g.fillStyle = '#9aa'; g.font = `500 ${Math.round(fsz * 0.85)}px "Pretendard Variable", sans-serif`; g.fillText(fit(cell.sub, cellW), x, y + cellH + 6 + fsz * 2.6);
    });
    return sheet;
  }
  const full = compose(cells);
  const groups = [];
  for (let i = 0; i < cells.length; i += groupSize * cols) groups.push(compose(cells.slice(i, i + groupSize * cols)).toDataURL('image/png'));

  // 2) 전체 장면 시각 훑기 — 구간마다 시작·등장 중·중간·끝 + 다음 구간으로 넘어가는 전환 시각
  const sweep = { frames: 0, errors: [] };
  const small = document.createElement('canvas');
  for (const { c, p, tl } of projects) {
    const { W, H } = fitDims(p.aspect);
    small.width = W; small.height = H;
    const ctx = small.getContext('2d');
    const ts = [0, 0.05];
    for (const seg of tl.segs) {
      const d = seg.end - seg.start;
      ts.push(seg.start + 0.02, seg.start + 0.15, seg.start + 0.45, seg.start + Math.min(1.4, d / 2), seg.start + d / 2, seg.end - 0.05, seg.end + 0.08, seg.end + 0.25);
    }
    ts.push(tl.total - 0.01);
    for (const t of ts) {
      if (t < 0 || t > tl.total) continue;
      sweep.frames++;
      try { R.drawFrame(ctx, p, W, H, t, tl); }
      catch (e) { sweep.errors.push({ id: c.id, t, message: String(e && e.stack || e) }); }
    }
  }
  return {
    dataUrl: full.toDataURL('image/png'), groups, errors, cells: cells.length, w: full.width, h: full.height, sweep,
    cases: projects.map(({ c, p, tl }) => ({ id: c.id, style: c.style, aspect: c.aspect, scenes: p.scenes.length, total: Math.round(tl.total * 10) / 10, overlay: p.overlay, extras: p.extras || [] })),
    engineHasLower3: !!R.OVERLAYS.lower3, engineOverlays: Object.keys(R.OVERLAYS),
  };
}

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const report = { consoleErrors: [], expected404: [], renderErrors: [], sweep: null, files: [] };
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const pending404 = [];
    page.on('response', (r) => { if (r.status() === 404) pending404.push(r.url()); });
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      if (/404/.test(m.text())) {
        const url = pending404.shift() || '';
        if (EXPECTED_404.test(url)) { report.expected404.push(url); return; }
        report.consoleErrors.push(`console.error: ${m.text()} ${url}`);
        return;
      }
      report.consoleErrors.push(`console.error: ${m.text()}`);
    });
    page.on('pageerror', (e) => report.consoleErrors.push(`pageerror: ${e.message}`));
    await page.goto(`${BASE}/tests/style-sheet.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.sheetReady === true, null, { timeout: 20000 });
    const r = await page.evaluate(pageRender, { cellW: 300, groupSize: 5 });
    report.renderErrors.push(...r.errors);
    report.sweep = { frames: r.sweep.frames, errors: r.sweep.errors.length };
    report.renderErrors.push(...r.sweep.errors);
    const full = path.join(OUT, 'cases-sheet.png');
    savePng(r.dataUrl, full);
    report.files.push({ file: full, cells: r.cells, size: `${r.w}x${r.h}` });
    r.groups.forEach((g, i) => { const f = path.join(OUT, `cases-sheet-${i + 1}.png`); savePng(g, f); report.files.push({ file: f }); });
    report.cases = r.cases;
    report.engine = { hasLower3: r.engineHasLower3, overlays: r.engineOverlays };
    await page.close();
  } finally {
    await browser.close();
  }
  report.ok = report.consoleErrors.length === 0 && report.renderErrors.length === 0;
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
