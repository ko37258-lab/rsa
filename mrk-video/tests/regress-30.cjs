// 스타일 30개·자막 모양/등장·스타일 음악 기능 회귀 점검(Playwright + ffprobe).
//   node tests/regress-30.cjs
// (1) #shorts 스타일 카드 30개 — 클릭마다 aria-pressed·설명·내보내기 버튼 라벨·세부 조절 select 값·예시 장면 갱신, 미리보기 시트
// (2) #captionStyle / #captionAnim 옵션마다 미리보기 캔버스 픽셀이 바뀌는지(ImageData 해시·차이 비율)
// (3) #styleMusic select(12개)·미리듣기 토글·#audioInfo 문구·스타일 전환 시 분위기 갈아타기
// (4) 장면 0.6초·엔딩 1초·720p 로 "영상 만들기" → ffprobe 오디오 트랙
// (5) "N가지 전부 만들기" 첫 결과 뒤 멈춤 → 결과 목록·ZIP 버튼(실제 ZIP 내용)·오디오
// (6) 프로젝트 저장(.json) → 열기 뒤 styleMusic·스타일 복원
// (7) 사례 화면 style-wall·칩 숫자·사용 안내 문구(남은 "20가지" 없음)
// (8) 모바일 400px 소리 패널 가로 넘침
// (9) 콘솔 오류 0
// 결과: tests/out/review/regress-*.png, regress-report.json. 정적 서버가 http://127.0.0.1:5173/ 에 떠 있어야 합니다.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { chromium } = require('/opt/node-tools/node_modules/playwright');

const BASE = process.env.MRK_BASE || 'http://127.0.0.1:5173';
const OUT = path.join(__dirname, 'out', 'review');
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const EXPECTED_404 = /\/assets\/samples\/[^/]+\.jpg$|\/api\/[a-z]+$/;
const EXPECTED_FAIL = /\/assets\/video\/[^/]+\.mp4$/;

const report = { ok: true, problems: [], notes: [], consoleErrors: [], expected: [], styles: null, caption: null, music: null, single: null, batch: null, project: null, showcase: null, mobile: null, timings: {} };
const problem = (s) => report.problems.push(s);
const note = (s) => report.notes.push(s);

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

function run(cmd, args) {
  const r = spawnSync(cmd, ['-hide_banner', ...args], { encoding: 'utf8' });
  return (r.stdout || '') + (r.stderr || '');
}
function probe(file) {
  const txt = run('ffprobe', ['-v', 'error', '-show_entries', 'stream=index,codec_type,codec_name,sample_rate,channels,width,height', '-show_entries', 'format=duration,format_name', '-of', 'json', file]);
  try { return JSON.parse(txt); } catch { return { raw: txt }; }
}
function volume(file) {
  const txt = run('ffmpeg', ['-nostats', '-i', file, '-vn', '-af', 'volumedetect', '-f', 'null', '-']);
  return { mean: Number((/mean_volume:\s*(-?[\d.]+|inf)/.exec(txt) || [])[1]), max: Number((/max_volume:\s*(-?[\d.]+|inf)/.exec(txt) || [])[1]) };
}
const fmt = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : String(v));

async function grabResult(page, name) {
  const r = await page.evaluate(async () => {
    const v = document.querySelector('#resultVideo');
    const res = await fetch(v.src);
    const blob = await res.blob();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return { type: blob.type, size: blob.size, b64: btoa(bin), status: document.querySelector('#exportStatus').textContent };
  });
  const ext = r.type.includes('mp4') ? 'mp4' : 'webm';
  const file = path.join(OUT, `${name}.${ext}`);
  const data = Buffer.from(r.b64, 'base64');
  fs.writeFileSync(file, data);
  const info = probe(file);
  const streams = info.streams || [];
  const audio = streams.find((s) => s.codec_type === 'audio') || null;
  const video = streams.find((s) => s.codec_type === 'video') || null;
  const vol = audio ? volume(file) : { mean: NaN, max: NaN };
  return {
    file, type: r.type, sizeMB: data.length / 1048576, md5: crypto.createHash('md5').update(data).digest('hex'), status: r.status,
    duration: Number(info.format?.duration), video: video ? `${video.codec_name} ${video.width}x${video.height}` : null,
    audio: audio ? `${audio.codec_name} ${audio.sample_rate}Hz ${audio.channels}ch` : null, hasAudio: !!audio, mean: vol.mean, max: vol.max,
  };
}

/** 페이지 안 도우미: 캔버스 해시·스냅샷·차이 비율·시트 */
const HELPERS = `
window.__h = (c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let h = 2166136261; for (let i = 0; i < d.length; i += 4) { h ^= d[i]; h = Math.imul(h, 16777619); h ^= d[i+1]; h = Math.imul(h, 16777619); h ^= d[i+2]; h = Math.imul(h, 16777619); } return (h >>> 0).toString(16).padStart(8, '0'); };
window.__snaps = {};
window.__snap = (name) => { const c = document.querySelector('#previewCanvas'); window.__snaps[name] = c.getContext('2d').getImageData(0, 0, c.width, c.height); return window.__h(c); };
window.__diff = (a, b) => { const A = window.__snaps[a].data, B = window.__snaps[b].data; let n = 0; for (let i = 0; i < A.length; i += 4) { if (Math.abs(A[i]-B[i]) + Math.abs(A[i+1]-B[i+1]) + Math.abs(A[i+2]-B[i+2]) > 24) n++; } return n / (A.length / 4); };
window.__sheet = (cols, rows, w, h) => { const c = document.createElement('canvas'); c.width = cols * w; c.height = rows * (h + 22); c.getContext('2d').fillStyle = '#fff'; c.getContext('2d').fillRect(0,0,c.width,c.height); window.__sheetC = c; window.__sheetI = 0; window.__sheetDim = { cols, w, h }; };
window.__sheetAdd = (label) => { const { cols, w, h } = window.__sheetDim; const i = window.__sheetI++; const x = (i % cols) * w, y = Math.floor(i / cols) * (h + 22); const ctx = window.__sheetC.getContext('2d'); const src = document.querySelector('#previewCanvas'); ctx.drawImage(src, x, y, w, h); ctx.fillStyle = '#111'; ctx.font = '11px sans-serif'; ctx.fillText(label, x + 4, y + h + 15); };
window.__sheetUrl = () => window.__sheetC.toDataURL('image/png');
window.__fire = (sel) => { const el = document.querySelector(sel); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
window.__tc = () => { const [a, b] = document.querySelector('#timecode').textContent.split('/').map((s) => s.trim()); const p = (s) => { const [m, r] = s.split(':'); return Number(m) * 60 + Number(r); }; return { t: p(a), total: p(b) }; };
`;

async function setSelect(page, sel, value) {
  if (!sel.startsWith('#')) sel = `#${sel}`;
  await page.selectOption(sel, value);
  await page.evaluate((s) => window.__fire(s), sel);
}
/** 스크럽바로 t 초 근처로 이동(seek). 실제 시각을 돌려줌 */
async function seekTo(page, t) {
  return page.evaluate((t) => {
    const { total } = window.__tc();
    const sc = document.querySelector('#scrub');
    sc.value = String(Math.round((t / total) * 1000));
    sc.dispatchEvent(new Event('input', { bubbles: true }));
    return window.__tc().t;
  }, t);
}
const savePng = (dataUrl, file) => fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: EXE, args: ['--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true, ignoreHTTPSErrors: true });
  try {
    const page = await context.newPage();
    watch(page, 'shorts');
    await page.goto(`${BASE}/#shorts`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.querySelectorAll('#styleStrip .style-card').length > 0 && document.querySelectorAll('#sceneList .scene').length > 0, null, { timeout: 20000 });
    await page.waitForTimeout(800);
    await page.evaluate(HELPERS);
    const hasJSZip = await page.evaluate(() => typeof window.JSZip === 'function');
    if (!hasJSZip) note('JSZip(cdnjs) 이 이 환경에서 로드되지 않음 — ZIP 검사는 환경 제한');

    // ── (1) 스타일 카드 30개 ─────────────────────────────
    let t0 = Date.now();
    const meta = await page.evaluate(async () => {
      const m = await import('/js/styles.js');
      const r = await import('/js/shorts-render.js');
      return {
        styles: m.STYLES.map((s) => ({ id: s.id, name: s.name, music: s.music || null, visual: s.visual, scenes: s.sample?.scenes?.length || 0, title: s.sample?.title || '', ref: s.ref, platforms: s.platforms })),
        CAPTION_STYLES: r.CAPTION_STYLES, CAPTION_ANIMS: r.CAPTION_ANIMS, FONTS: r.FONTS.map((f) => f.id),
      };
    });
    const moods = await page.evaluate(async () => (await import('/js/music.js')).MOODS.map((m) => ({ id: m.id, name: m.name })));
    const moodName = (id) => moods.find((m) => m.id === id)?.name || '';
    const S = meta.styles;
    const cards = await page.$$eval('#styleStrip .style-card', (els) => els.map((e) => ({ id: e.dataset.id, no: e.querySelector('.no')?.textContent, name: e.querySelector('b')?.textContent, pressed: e.getAttribute('aria-pressed') })));
    const counts = await page.evaluate(() => ({
      styleCount: document.querySelector('#styleCount').textContent, batchBtn: document.querySelector('#styleBatchBtn').textContent,
      placeholders: [...document.querySelectorAll('[data-style-count]')].map((e) => e.textContent), exportBtn: document.querySelector('#exportBtn').textContent,
      captionStyleOpts: [...document.querySelectorAll('#captionStyle option')].map((o) => o.value), captionAnimOpts: [...document.querySelectorAll('#captionAnim option')].map((o) => o.value),
      templateOpts: [...document.querySelectorAll('#template option')].map((o) => o.value), overlayOpts: [...document.querySelectorAll('#overlay option')].map((o) => o.value),
      transitionOpts: [...document.querySelectorAll('#transition option')].map((o) => o.value),
    }));
    report.styles = { count: S.length, cards: cards.length, counts, perStyle: [] };
    if (S.length !== 30) problem(`STYLES 가 ${S.length}개 (30개여야 함)`);
    if (cards.length !== S.length) problem(`스타일 카드 ${cards.length}개 ≠ STYLES ${S.length}개`);
    if (counts.styleCount !== `${S.length}가지`) problem(`#styleCount 가 "${counts.styleCount}"`);
    if (counts.batchBtn !== `${S.length}가지 전부 만들기`) problem(`전부 만들기 버튼이 "${counts.batchBtn}"`);
    if (counts.placeholders.some((v) => v !== String(S.length))) problem(`data-style-count 자리표시 중 ${S.length} 이 아닌 것: ${counts.placeholders.join(',')}`);
    // select 어휘 ↔ 엔진 어휘
    const sameSet = (a, b) => a.length === b.length && a.every((v) => b.includes(v));
    if (!sameSet(counts.captionStyleOpts, meta.CAPTION_STYLES)) problem(`#captionStyle 옵션(${counts.captionStyleOpts.join(',')}) ≠ CAPTION_STYLES(${meta.CAPTION_STYLES.join(',')})`);
    if (!sameSet(counts.captionAnimOpts, meta.CAPTION_ANIMS)) problem(`#captionAnim 옵션(${counts.captionAnimOpts.join(',')}) ≠ CAPTION_ANIMS(${meta.CAPTION_ANIMS.join(',')})`);
    // 스타일 visual 값이 select 에 다 있는지(없으면 syncControls 가 기본값으로 되돌려 스타일이 깨진다)
    const optSets = { captionStyle: counts.captionStyleOpts, captionAnim: counts.captionAnimOpts, template: counts.templateOpts, overlay: counts.overlayOpts, transition: counts.transitionOpts, font: meta.FONTS };
    for (const st of S) for (const [k, opts] of Object.entries(optSets)) if (st.visual[k] !== undefined && !opts.includes(String(st.visual[k]))) problem(`스타일 ${st.id} 의 ${k}='${st.visual[k]}' 가 select 목록에 없음`);

    await page.evaluate(() => window.__sheet(6, 5, 180, 320));
    const SELS = ['aspect', 'template', 'captionAnim', 'captionStyle', 'overlay', 'transition', 'motion', 'titleMode', 'font'];
    for (let i = 0; i < S.length; i++) {
      const st = S[i];
      const errBefore = report.consoleErrors.length;
      await page.click(`#styleStrip .style-card[data-id="${st.id}"]`);
      let settled = true;
      try {
        await page.waitForFunction(({ n, title }) => document.querySelectorAll('#sceneList .scene').length === n && (!title || document.querySelector('#title').value === title), { n: st.scenes, title: st.title }, { timeout: 6000 });
      } catch { settled = false; }
      await page.waitForTimeout(80);
      const t = await seekTo(page, 1.6);
      await page.evaluate((label) => window.__sheetAdd(label), `${String(i + 1).padStart(2, '0')} ${st.id}`);
      const row = await page.evaluate(({ sels }) => {
        const pressed = [...document.querySelectorAll('#styleStrip .style-card[aria-pressed="true"]')].map((e) => e.dataset.id);
        const desc = document.querySelector('#styleDesc');
        const vals = {};
        for (const s of sels) vals[s] = document.getElementById(s).value;
        vals.captionSize = document.getElementById('captionSize').value;
        for (const c of ['textColor', 'highlightColor', 'bandColor', 'panelColor', 'inkColor']) vals[c] = document.getElementById(c).value;
        vals.showProgress = document.getElementById('showProgress').checked;
        return {
          pressed, desc: desc.textContent, descLink: desc.querySelector('a')?.href || '', exportBtn: document.querySelector('#exportBtn').textContent,
          audioInfo: document.querySelector('#audioInfo').textContent, scenes: document.querySelectorAll('#sceneList .scene').length, title: document.querySelector('#title').value,
          vals, summary: document.querySelector('#sceneSummary').textContent, toast: document.querySelector('#toast')?.textContent,
        };
      }, { sels: SELS });
      const issues = [];
      if (row.pressed.length !== 1 || row.pressed[0] !== st.id) issues.push(`aria-pressed=${JSON.stringify(row.pressed)}`);
      if (!row.desc.includes(st.name)) issues.push('설명에 이름 없음');
      if (st.ref?.format && !row.desc.includes(st.ref.format)) issues.push('설명에 형식 이름 없음');
      if (!row.desc.includes('잘 맞는 곳')) issues.push('설명에 플랫폼 없음');
      if (!/youtube\.com/.test(row.descLink)) issues.push(`설명 링크 ${row.descLink}`);
      const expLabel = `"${st.name.split(' — ')[0]}" 스타일로 영상 만들기`;
      if (row.exportBtn !== expLabel) issues.push(`내보내기 버튼 "${row.exportBtn}" (기대 ${expLabel})`);
      if (!settled) issues.push(`예시 장면 ${row.scenes}개/제목 "${row.title.slice(0, 12)}" 가 스타일 예시(${st.scenes}개)로 바뀌지 않음`);
      for (const k of SELS) if (st.visual[k] !== undefined && String(st.visual[k]) !== row.vals[k]) issues.push(`${k}: select=${row.vals[k]} ≠ 스타일 ${st.visual[k]}`);
      if (st.visual.captionSize !== undefined && String(st.visual.captionSize) !== row.vals.captionSize) issues.push(`captionSize ${row.vals.captionSize} ≠ ${st.visual.captionSize}`);
      for (const c of ['textColor', 'highlightColor', 'bandColor', 'panelColor', 'inkColor']) if (st.visual[c] && st.visual[c].toLowerCase() !== row.vals[c].toLowerCase()) issues.push(`${c} ${row.vals[c]} ≠ ${st.visual[c]}`);
      if (st.visual.showProgress !== undefined && st.visual.showProgress !== row.vals.showProgress) issues.push('showProgress 어긋남');
      const expMood = moodName(st.music || 'corporate');
      if (!row.audioInfo.includes(expMood) || !row.audioInfo.includes('(자동)')) issues.push(`#audioInfo "${row.audioInfo}" (기대: ${expMood} (자동))`);
      const errs = report.consoleErrors.slice(errBefore);
      if (errs.length) issues.push(`콘솔 오류 ${errs.length}: ${errs[0]}`);
      report.styles.perStyle.push({ id: st.id, name: st.name, t, scenes: row.scenes, exportBtn: row.exportBtn, audioInfo: row.audioInfo, issues });
      if (issues.length) problem(`스타일 ${String(i + 1).padStart(2, '0')} ${st.id}: ${issues.join(' / ')}`);
    }
    savePng(await page.evaluate(() => window.__sheetUrl()), path.join(OUT, 'regress-styles-sheet.png'));
    await page.screenshot({ path: path.join(OUT, 'regress-shorts-after-styles.png'), fullPage: false });
    report.timings.stylesMs = Date.now() - t0;

    // ── (2) 자막 모양·등장 → 미리보기 픽셀 ───────────────────
    t0 = Date.now();
    // 기준: 첫 스타일로 돌린 뒤 세부 조절을 손으로 band/outline/none 으로 맞춤. 장면 2(사진 있음) 1.0초 지점
    await page.click(`#styleStrip .style-card[data-id="${S[0].id}"]`);
    await page.waitForFunction(({ n }) => document.querySelectorAll('#sceneList .scene').length === n, { n: S[0].scenes }, { timeout: 6000 }).catch(() => {});
    // 장면 2 시작 시각: 장면 2 자막칸에 초점 → seek(start+0.6)
    const seg2 = await page.evaluate(() => { const ta = document.querySelectorAll('#sceneList textarea')[1]; ta.focus(); const { t } = window.__tc(); ta.blur(); return t - 0.6; });
    report.caption = { seg2Start: seg2, styles: {}, anims: {}, stylesDark: {}, stylesSplit: {} };
    const setBase = async (template) => {
      await setSelect(page, 'template', template);
      await setSelect(page, 'overlay', 'none');
      await setSelect(page, 'titleMode', 'band');
      await setSelect(page, 'captionAnim', 'none');
      await setSelect(page, 'transition', 'none');
      await setSelect(page, 'motion', 'none');
    };
    const sheetCols = 12;
    await page.evaluate(() => window.__sheet(12, 6, 150, 266));
    for (const [template, bucket] of [['band', 'styles'], ['split', 'stylesSplit'], ['dark', 'stylesDark']]) {
      await setBase(template);
      const hashes = {};
      for (const cs of meta.CAPTION_STYLES) {
        await setSelect(page, 'captionStyle', cs);
        await seekTo(page, seg2 + 1.0);
        hashes[cs] = await page.evaluate((k) => window.__snap(k), `${template}:${cs}`);
        await page.evaluate((label) => window.__sheetAdd(label), `${template} ${cs}`);
      }
      const diffs = {};
      for (const cs of meta.CAPTION_STYLES) diffs[cs] = await page.evaluate(([a, b]) => window.__diff(a, b), [`${template}:plain`, `${template}:${cs}`]);
      report.caption[bucket] = { hashes, diffVsPlain: diffs };
      const seen = new Map();
      for (const [cs, h] of Object.entries(hashes)) { if (seen.has(h)) problem(`[${template}] 자막 모양 '${cs}' 와 '${seen.get(h)}' 의 미리보기 픽셀이 같음`); seen.set(h, cs); }
      for (const cs of meta.CAPTION_STYLES) if (cs !== 'plain' && diffs[cs] < 0.0005) problem(`[${template}] 자막 모양 '${cs}' 가 plain 과 거의 같음(차이 ${(diffs[cs] * 100).toFixed(3)}%)`);
    }
    // 등장: band/outline, 장면 2 시작 +0.15 / +0.6 / +1.2 / +2.6(끝 직전)
    await setBase('band');
    await setSelect(page, 'captionStyle', 'outline');
    const offsets = [0.15, 0.6, 1.2, 2.6];
    for (const an of meta.CAPTION_ANIMS) {
      await setSelect(page, 'captionAnim', an);
      const hs = [];
      for (const off of offsets) {
        await seekTo(page, seg2 + off);
        hs.push(await page.evaluate((k) => window.__snap(k), `anim:${an}:${off}`));
        await page.evaluate((label) => window.__sheetAdd(label), `${an} +${off}`);
      }
      report.caption.anims[an] = { hashes: hs };
    }
    // 각 등장이 none 과 어느 시각에서든 다른지, 그리고 시간이 흐르면 바뀌는지(none 제외)
    for (const an of meta.CAPTION_ANIMS) {
      if (an === 'none') continue;
      const d = [];
      for (const off of offsets) d.push(await page.evaluate(([a, b]) => window.__diff(a, b), [`anim:none:${off}`, `anim:${an}:${off}`]));
      report.caption.anims[an].diffVsNone = d;
      if (Math.max(...d) < 0.0005) problem(`자막 등장 '${an}' 이 어느 시각에서도 '한 번에' 와 같음`);
      const hs = report.caption.anims[an].hashes;
      if (new Set(hs).size === 1) problem(`자막 등장 '${an}' 이 시간이 흘러도 바뀌지 않음`);
    }
    // 등장 사이 구분(+0.6 시점)
    {
      const at = {};
      for (const an of meta.CAPTION_ANIMS) at[an] = report.caption.anims[an].hashes[1];
      const seen = new Map();
      for (const [an, h] of Object.entries(at)) { if (an !== 'none' && seen.has(h) && seen.get(h) !== 'none') note(`+0.6초 시점에 등장 '${an}' 과 '${seen.get(h)}' 프레임이 같음(참고)`); seen.set(h, an); }
    }
    savePng(await page.evaluate(() => window.__sheetUrl()), path.join(OUT, 'regress-caption-sheet.png'));
    report.timings.captionMs = Date.now() - t0;

    // ── (3) 스타일 음악 ──────────────────────────────────
    t0 = Date.now();
    const opts = await page.$$eval('#styleMusic option', (els) => els.map((o) => ({ value: o.value, label: o.textContent })));
    report.music = { options: opts, steps: [] };
    if (opts.length !== 12 || opts[0].value !== 'auto' || opts[1].value !== 'off') problem(`#styleMusic 옵션 ${opts.length}개: ${opts.map((o) => o.value).join(',')}`);
    for (const m of moods) if (!opts.some((o) => o.value === m.id && o.label === m.name)) problem(`#styleMusic 에 '${m.id}/${m.name}' 없음`);
    const musicState = () => page.evaluate(() => ({ sel: document.querySelector('#styleMusic').value, info: document.querySelector('#audioInfo').textContent, btn: { text: document.querySelector('#musicPreview').textContent, pressed: document.querySelector('#musicPreview').getAttribute('aria-pressed'), disabled: document.querySelector('#musicPreview').disabled, label: document.querySelector('#musicPreview').getAttribute('aria-label') } }));
    await setSelect(page, 'styleMusic', 'quiz');
    let ms = await musicState(); report.music.steps.push({ step: 'quiz', ...ms });
    if (!ms.info.includes('퀴즈 쇼') || ms.info.includes('자동')) problem(`분위기 quiz 선택 뒤 문구 "${ms.info}"`);
    await setSelect(page, 'styleMusic', 'off');
    ms = await musicState(); report.music.steps.push({ step: 'off', ...ms });
    if (!ms.btn.disabled) problem('끄기인데 미리듣기 버튼이 잠기지 않음');
    if (!/꺼|무음/.test(ms.info)) problem(`끄기 문구 "${ms.info}"`);
    await setSelect(page, 'styleMusic', 'auto');
    ms = await musicState(); report.music.steps.push({ step: 'auto', ...ms });
    if (ms.btn.disabled) problem('자동으로 되돌렸는데 미리듣기 버튼이 잠겨 있음');
    // 미리듣기 토글 + 스타일 전환으로 분위기 갈아타기
    await page.click('#musicPreview');
    ms = await musicState(); report.music.steps.push({ step: 'preview on', ...ms });
    if (ms.btn.pressed !== 'true' || ms.btn.text !== '■') problem(`미리듣기 켠 뒤 ${JSON.stringify(ms.btn)}`);
    await page.waitForTimeout(2500);
    ms = await musicState(); report.music.steps.push({ step: 'preview after render', ...ms });
    if (ms.btn.pressed !== 'true') problem('미리듣기가 렌더 뒤 저절로 꺼짐');
    // 다른 분위기의 스타일로 전환 → 버튼은 켜진 채 라벨이 새 분위기
    const cur = S[0];
    const other = S.find((s) => (s.music || 'corporate') !== (cur.music || 'corporate'));
    await page.click(`#styleStrip .style-card[data-id="${other.id}"]`);
    await page.waitForTimeout(300);
    ms = await musicState(); report.music.steps.push({ step: `style→${other.id}(${other.music})`, ...ms });
    if (ms.btn.pressed !== 'true') problem('미리듣기 중 스타일을 바꾸자 미리듣기가 꺼짐');
    if (!ms.btn.label.includes(moodName(other.music || 'corporate'))) problem(`미리듣기 라벨 "${ms.btn.label}" 에 새 분위기 ${moodName(other.music)} 없음`);
    if (!ms.info.includes(moodName(other.music || 'corporate'))) problem(`스타일 전환 뒤 #audioInfo "${ms.info}"`);
    // 소리 크기 바꾸기(미리듣기 중) → 오류 없음
    await page.evaluate(() => { const r = document.querySelector('#bgmVolume'); r.value = '0.6'; r.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.waitForTimeout(2500);
    ms = await musicState(); report.music.steps.push({ step: 'volume 0.6 while preview', ...ms });
    // 재생 ▶ → 미리듣기 자동 정지
    await page.click('#playBtn');
    await page.waitForFunction(() => document.querySelector('#playBtn').textContent === '❚❚', null, { timeout: 20000 });
    ms = await musicState(); report.music.steps.push({ step: 'play', ...ms });
    if (ms.btn.pressed !== 'false') problem('미리보기 재생을 시작했는데 미리듣기가 멈추지 않음');
    await page.waitForTimeout(500);
    await page.click('#playBtn');
    // 끄기 상태에서 미리듣기 클릭 → 토스트, 켜지지 않음
    await setSelect(page, 'styleMusic', 'off');
    await page.evaluate(() => document.querySelector('#musicPreview').click());
    ms = await musicState(); report.music.steps.push({ step: 'off + click preview', ...ms });
    if (ms.btn.pressed !== 'false') problem('끄기 상태에서 미리듣기가 켜짐');
    await setSelect(page, 'styleMusic', 'auto');
    await page.evaluate(() => { const r = document.querySelector('#bgmVolume'); r.value = '0.35'; r.dispatchEvent(new Event('input', { bubbles: true })); });
    report.timings.musicMs = Date.now() - t0;

    // ── (4) 영상 만들기(0.6초·720p) ──────────────────────
    t0 = Date.now();
    await page.click(`#styleStrip .style-card[data-id="${S[S.length - 1].id}"]`); // 새로 추가된 마지막 스타일로
    await page.waitForFunction(({ n }) => document.querySelectorAll('#sceneList .scene').length === n, { n: S[S.length - 1].scenes }, { timeout: 6000 }).catch(() => {});
    const setup = await page.evaluate(() => {
      const fire = (el) => el.dispatchEvent(new Event('input', { bubbles: true }));
      for (const inp of document.querySelectorAll('#sceneList input[type="number"]')) { inp.value = '0.6'; fire(inp); }
      const ed = document.querySelector('#endingDur'); ed.value = '1'; fire(ed);
      const on = document.querySelector('#endingOn'); if (!on.checked) { on.checked = true; fire(on); }
      const q = document.querySelector('#quality'); q.value = '720'; fire(q);
      return { scenes: document.querySelectorAll('#sceneList .scene').length, summary: document.querySelector('#sceneSummary').textContent, timecode: document.querySelector('#timecode').textContent, style: document.querySelector('#styleStrip .style-card[aria-pressed="true"]')?.dataset.id };
    });
    await page.click('#exportBtn');
    const midLabel = await page.$eval('#exportBtn', (el) => el.textContent);
    await page.waitForFunction(() => /^완성|만들지 못했습니다|멈췄습니다/.test(document.querySelector('#exportStatus').textContent), null, { timeout: 120000 });
    report.timings.singleMs = Date.now() - t0;
    const singleStatus = await page.$eval('#exportStatus', (el) => el.textContent);
    report.single = { setup, midLabel, status: singleStatus };
    if (midLabel !== '만들기 멈춤') problem(`녹화 중 버튼 글자 "${midLabel}"`);
    if (!/^완성/.test(singleStatus)) problem(`영상 만들기 실패: ${singleStatus}`);
    else {
      const r = await grabResult(page, 'regress-single');
      Object.assign(report.single, r);
      if (!r.hasAudio) problem('한 편 결과에 오디오 스트림 없음');
      if (r.hasAudio && !(r.mean > -50)) problem(`한 편 결과 오디오가 거의 무음(mean ${fmt(r.mean)} dB)`);
      if (!/x1280$/.test(r.video || '')) problem(`720p 인데 ${r.video}`);
      const after = await page.evaluate(() => ({ btn: document.querySelector('#exportBtn').textContent, upload: !document.querySelector('#uploadPanel').hidden, plats: document.querySelectorAll('#plats .plat').length, result: !document.querySelector('#exportResult').hidden }));
      report.single.after = after;
      if (!after.result || !after.upload || after.plats < 5) problem(`완성 뒤 결과/바로 올리기 패널 상태 ${JSON.stringify(after)}`);
      if (!after.btn.endsWith('스타일로 영상 만들기')) problem(`완성 뒤 버튼 글자 "${after.btn}"`);
    }
    await page.screenshot({ path: path.join(OUT, 'regress-single-done.png') });

    // ── (5) 전부 만들기 → 첫 결과 뒤 멈춤 ─────────────────
    t0 = Date.now();
    const batchLabel = await page.$eval('#styleBatchBtn', (el) => el.textContent);
    await page.click('#styleBatchBtn');
    await page.waitForTimeout(300);
    const batchMid = await page.evaluate(() => ({ btn: document.querySelector('#styleBatchBtn').textContent, exportDisabled: document.querySelector('#exportBtn').disabled, status: document.querySelector('#batchStatus').textContent, panelHead: document.querySelector('#batchPanel h2').textContent }));
    await page.waitForFunction(() => document.querySelectorAll('#batchList .result-item').length >= 1, null, { timeout: 120000 });
    const firstMs = Date.now() - t0;
    await page.click('#batchStop');
    await page.waitForFunction((label) => document.querySelector('#styleBatchBtn').textContent === label, batchLabel, { timeout: 60000 });
    const batchEnd = await page.evaluate(() => ({
      status: document.querySelector('#batchStatus').textContent, items: [...document.querySelectorAll('#batchList .result-item')].map((e) => ({ name: e.querySelector('b').textContent, meta: e.querySelector('.meta').textContent, buttons: [...e.querySelectorAll('button')].map((b) => b.textContent) })),
      zipDisabled: document.querySelector('#batchZip').disabled, exportDisabled: document.querySelector('#exportBtn').disabled, hint: document.querySelector('#batchHint').textContent,
    }));
    const rb = await grabResult(page, 'regress-batch-first');
    report.batch = { label: batchLabel, mid: batchMid, firstMs, end: batchEnd, first: rb };
    report.timings.batchMs = Date.now() - t0;
    if (batchMid.btn !== '멈춤') problem(`전부 만들기 중 버튼 글자 "${batchMid.btn}"`);
    if (!batchMid.exportDisabled) problem('전부 만들기 중 한 편 버튼이 잠기지 않음');
    if (!batchMid.status.startsWith(`${S.length}가지`)) problem(`전부 만들기 상태 문구 "${batchMid.status}"`);
    if (!batchMid.panelHead.includes(`${S.length}가지`)) problem(`일괄 패널 제목 "${batchMid.panelHead}"`);
    if (batchEnd.items.length < 1) problem('전부 만들기 결과 0개');
    if (batchEnd.zipDisabled) problem('멈춘 뒤 ZIP 버튼이 잠겨 있음');
    if (batchEnd.exportDisabled) problem('멈춘 뒤 한 편 버튼이 잠겨 있음');
    if (!rb.hasAudio) problem('전부 만들기 첫 결과에 오디오 스트림 없음');
    if (rb.hasAudio && !(rb.mean > -50)) problem(`전부 만들기 첫 결과 오디오 거의 무음(${fmt(rb.mean)} dB)`);
    if (batchEnd.items[0] && batchEnd.items[0].name !== S[0].name) problem(`첫 결과 이름 "${batchEnd.items[0].name}" ≠ "${S[0].name}"`);
    // ZIP 저장: 다운로드를 받아 내용 확인
    if (hasJSZip) {
      try {
        const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#batchZip')]);
        const zipPath = path.join(OUT, 'regress-batch.zip');
        await dl.saveAs(zipPath);
        const listing = spawnSync('unzip', ['-l', zipPath], { encoding: 'utf8' }).stdout;
        report.batch.zip = { file: zipPath, suggested: dl.suggestedFilename(), listing };
        if (!/01-.*\.(mp4|webm)/.test(listing) || !/업로드용-글\.txt/.test(listing) || !/자막\.srt/.test(listing)) problem(`ZIP 내용이 기대와 다름:\n${listing}`);
        const hint = await page.$eval('#batchHint', (el) => el.textContent);
        report.batch.zipHint = hint;
        if (!/저장했습니다/.test(hint)) problem(`ZIP 저장 뒤 문구 "${hint}"`);
      } catch (e) { problem(`ZIP 저장 실패: ${e.message}`); }
    }
    await page.screenshot({ path: path.join(OUT, 'regress-batch-done.png') });

    // ── (6) 프로젝트 저장 → 열기 → styleMusic 복원 ─────────
    t0 = Date.now();
    const pickStyle = S[7];
    await page.click(`#styleStrip .style-card[data-id="${pickStyle.id}"]`);
    await page.waitForFunction(({ n }) => document.querySelectorAll('#sceneList .scene').length === n, { n: pickStyle.scenes }, { timeout: 6000 }).catch(() => {});
    await setSelect(page, 'styleMusic', 'drama');
    await setSelect(page, 'captionStyle', 'neon');
    await setSelect(page, 'captionAnim', 'wave');
    const before = await page.evaluate(() => ({ scenes: document.querySelectorAll('#sceneList .scene').length, title: document.querySelector('#title').value, info: document.querySelector('#audioInfo').textContent }));
    const [dlp] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#projSaveBtn')]);
    const projPath = path.join(OUT, 'regress-project.json');
    await dlp.saveAs(projPath);
    const saved = JSON.parse(fs.readFileSync(projPath, 'utf8'));
    report.project = { file: projPath, suggested: dlp.suggestedFilename(), settings: { style: saved.settings?.style, styleMusic: saved.settings?.styleMusic, captionStyle: saved.settings?.captionStyle, captionAnim: saved.settings?.captionAnim }, scenes: saved.scenes?.length, before };
    if (saved.settings?.styleMusic !== 'drama') problem(`저장된 settings.styleMusic = ${saved.settings?.styleMusic}`);
    if (saved.settings?.style !== pickStyle.id) problem(`저장된 settings.style = ${saved.settings?.style}`);
    if (saved.settings?.captionStyle !== 'neon' || saved.settings?.captionAnim !== 'wave') problem(`저장된 자막 설정 ${saved.settings?.captionStyle}/${saved.settings?.captionAnim}`);
    // 상태를 흐트러 놓고 다시 열기
    await setSelect(page, 'styleMusic', 'off');
    await page.click(`#styleStrip .style-card[data-id="${S[2].id}"]`);
    await page.waitForTimeout(600);
    await page.setInputFiles('#projFile', projPath);
    await page.waitForFunction(() => /프로젝트를 열었습니다|열지 못했습니다|아닙니다/.test(document.querySelector('#toast')?.textContent || ''), null, { timeout: 15000 });
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => ({
      toast: document.querySelector('#toast').textContent, styleMusic: document.querySelector('#styleMusic').value, info: document.querySelector('#audioInfo').textContent,
      pressed: [...document.querySelectorAll('#styleStrip .style-card[aria-pressed="true"]')].map((e) => e.dataset.id), exportBtn: document.querySelector('#exportBtn').textContent,
      captionStyle: document.querySelector('#captionStyle').value, captionAnim: document.querySelector('#captionAnim').value, scenes: document.querySelectorAll('#sceneList .scene').length,
      title: document.querySelector('#title').value, previewDisabled: document.querySelector('#musicPreview').disabled,
    }));
    report.project.after = after;
    if (after.styleMusic !== 'drama') problem(`프로젝트 열기 뒤 #styleMusic = ${after.styleMusic}`);
    if (!after.info.includes('긴장 드라마')) problem(`프로젝트 열기 뒤 #audioInfo "${after.info}"`);
    if (after.pressed.join() !== pickStyle.id) problem(`프로젝트 열기 뒤 선택 스타일 ${JSON.stringify(after.pressed)} (기대 ${pickStyle.id})`);
    if (!after.exportBtn.includes(pickStyle.name.split(' — ')[0])) problem(`프로젝트 열기 뒤 내보내기 버튼 "${after.exportBtn}"`);
    if (after.captionStyle !== 'neon' || after.captionAnim !== 'wave') problem(`프로젝트 열기 뒤 자막 설정 ${after.captionStyle}/${after.captionAnim}`);
    if (after.scenes !== before.scenes) problem(`프로젝트 열기 뒤 장면 ${after.scenes}개 (저장 때 ${before.scenes}개)`);
    if (after.previewDisabled) problem('프로젝트 열기 뒤 미리듣기 버튼이 잠겨 있음');
    report.timings.projectMs = Date.now() - t0;
    await page.close();

    // ── (7) 사례 화면·사용 안내 ───────────────────────────
    const p2 = await context.newPage();
    watch(p2, 'showcase');
    await p2.goto(`${BASE}/`, { waitUntil: 'load' });
    await p2.waitForFunction(() => document.querySelectorAll('#caseStyleWall canvas').length > 0, null, { timeout: 20000 });
    await p2.waitForTimeout(2500); // countUp 끝
    const sc = await p2.evaluate(() => {
      const wall = [...document.querySelectorAll('#caseStyleWall canvas')];
      const blank = wall.filter((c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let s = 0; for (let i = 0; i < d.length; i += 40) s += d[i + 3]; return s === 0; }).length;
      return {
        wall: wall.length, wallTitles: wall.map((c) => c.title), blank, caseStyleCount: document.querySelector('#caseStyleCount').textContent,
        placeholders: [...document.querySelectorAll('[data-style-count]')].map((e) => e.textContent),
        caseTitle: document.querySelector('#case-styles h2').textContent.replace(/\s+/g, ' '),
        heroLede: document.querySelector('#view-showcase .lede').textContent,
        stale: (document.body.innerText.match(/\b20\s*가지|20배|스무 가지/g) || []),
      };
    });
    report.showcase = sc;
    if (sc.wall !== Math.min(10, S.length)) problem(`style-wall 캔버스 ${sc.wall}개 (기대 ${Math.min(10, S.length)})`);
    if (sc.blank) problem(`style-wall 빈 캔버스 ${sc.blank}개`);
    if (sc.caseStyleCount !== String(S.length)) problem(`사례 칩 숫자 "${sc.caseStyleCount}" (기대 ${S.length})`);
    if (sc.placeholders.some((v) => v !== String(S.length))) problem(`사례 화면 자리표시 ${sc.placeholders.join(',')}`);
    if (!sc.caseTitle.includes(`${S.length}가지 스타일`)) problem(`사례 02 제목 "${sc.caseTitle}"`);
    if (sc.stale.length) problem(`사례 화면에 남은 옛 숫자: ${sc.stale.join(', ')}`);
    await p2.screenshot({ path: path.join(OUT, 'regress-showcase-top.png') });
    await p2.evaluate(() => document.getElementById('case-styles')?.scrollIntoView());
    await p2.waitForTimeout(800);
    await p2.screenshot({ path: path.join(OUT, 'regress-showcase-case2.png') });
    // 사용 안내
    await p2.evaluate(() => { location.hash = '#guide'; });
    await p2.waitForTimeout(1200);
    const guide = await p2.evaluate(() => {
      const v = document.getElementById('view-guide') || document.querySelector('.view[data-view="guide"]');
      const txt = v ? v.innerText : '';
      return { hidden: v?.hidden, has30: (txt.match(/30가지/g) || []).length, has30x: /30배/.test(txt), stale: (txt.match(/\b20\s*가지|20배/g) || []), sample: txt.split('\n').filter((l) => /가지/.test(l)).slice(0, 6) };
    });
    report.showcase.guide = guide;
    if (guide.hidden) problem('사용 안내 화면이 열리지 않음');
    if (guide.has30 < 3 || !guide.has30x) problem(`사용 안내 문구에 30가지/30배가 ${guide.has30}/${guide.has30x}`);
    if (guide.stale.length) problem(`사용 안내에 남은 옛 숫자: ${guide.stale.join(', ')}`);
    await p2.screenshot({ path: path.join(OUT, 'regress-guide.png'), fullPage: true });
    await p2.close();

    // ── (8) 모바일 400px ─────────────────────────────────
    const m = await browser.newContext({ viewport: { width: 400, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true });
    const p3 = await m.newPage();
    watch(p3, 'mobile');
    await p3.goto(`${BASE}/#shorts`, { waitUntil: 'load' });
    await p3.waitForFunction(() => document.querySelectorAll('#styleStrip .style-card').length > 0, null, { timeout: 20000 });
    await p3.waitForTimeout(1200);
    const mob = await p3.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const panel = document.querySelector('section[aria-labelledby="h-audio"]');
      const pr = panel.getBoundingClientRect();
      const over = [];
      for (const el of panel.querySelectorAll('*')) {
        const r = el.getBoundingClientRect();
        if (r.width && r.right > vw + 0.5) over.push({ tag: el.tagName.toLowerCase(), id: el.id, cls: el.className?.toString().slice(0, 40), right: Math.round(r.right), w: Math.round(r.width) });
      }
      const docOver = [];
      for (const el of document.querySelectorAll('#view-shorts *')) {
        const r = el.getBoundingClientRect();
        if (r.width && r.right > vw + 0.5 && !el.closest('.style-strip, .nav, .thumbs, .table-wrap')) docOver.push({ tag: el.tagName.toLowerCase(), id: el.id, cls: el.className?.toString().slice(0, 40), right: Math.round(r.right) });
      }
      return { vw, scrollW: document.documentElement.scrollWidth, bodyScrollW: document.body.scrollWidth, panel: { left: Math.round(pr.left), right: Math.round(pr.right), scrollW: panel.scrollWidth, clientW: panel.clientWidth }, over: over.slice(0, 10), docOver: docOver.slice(0, 10), musicRow: (() => { const r = document.querySelector('.music-field .row').getBoundingClientRect(); const s = document.querySelector('#styleMusic').getBoundingClientRect(); const b = document.querySelector('#musicPreview').getBoundingClientRect(); return { row: [Math.round(r.left), Math.round(r.right)], select: [Math.round(s.left), Math.round(s.right)], btn: [Math.round(b.left), Math.round(b.right)] }; })() };
    });
    report.mobile = mob;
    if (mob.scrollW > mob.vw) problem(`모바일 400px 에서 문서 가로 스크롤(scrollWidth ${mob.scrollW} > ${mob.vw})`);
    if (mob.panel.right > mob.vw || mob.panel.scrollW > mob.panel.clientW) problem(`소리 패널이 화면을 넘침 ${JSON.stringify(mob.panel)}`);
    if (mob.over.length) problem(`소리 패널 안에서 화면 밖으로 나간 요소: ${JSON.stringify(mob.over)}`);
    if (mob.docOver.length) problem(`숏폼 화면에서 화면 밖으로 나간 요소: ${JSON.stringify(mob.docOver)}`);
    const panelEl = await p3.$('section[aria-labelledby="h-audio"]');
    await panelEl.scrollIntoViewIfNeeded();
    await p3.waitForTimeout(300);
    await panelEl.screenshot({ path: path.join(OUT, 'regress-mobile-audio-panel.png') });
    await p3.screenshot({ path: path.join(OUT, 'regress-mobile-shorts.png'), fullPage: true });
    // 사례 화면도 400px 가로 넘침 확인
    await p3.evaluate(() => { location.hash = '#showcase'; });
    await p3.waitForTimeout(1500);
    const mobShow = await p3.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth }));
    report.mobile.showcase = mobShow;
    if (mobShow.scrollW > mobShow.vw) problem(`모바일 사례 화면 가로 스크롤(${mobShow.scrollW} > ${mobShow.vw})`);
    await p3.close();
    await m.close();
  } catch (e) {
    problem(`스크립트 오류: ${e.stack || e.message}`);
  } finally {
    await browser.close();
  }

  if (report.consoleErrors.length) problem(`콘솔 오류 ${report.consoleErrors.length}개`);
  report.ok = report.problems.length === 0;
  fs.writeFileSync(path.join(OUT, 'regress-report.json'), JSON.stringify(report, null, 2));
  const line = (k, v) => console.log(`  ${k.padEnd(18)} ${v}`);
  console.log('\n[스타일 30·자막·음악 기능 회귀 점검]');
  line('스타일', `${report.styles?.count}개 · 카드 ${report.styles?.cards} · 문제 있는 스타일 ${report.styles?.perStyle.filter((s) => s.issues.length).length}개 · ${report.timings.stylesMs}ms`);
  if (report.caption) {
    const d = report.caption.styles?.diffVsPlain || {};
    line('자막 모양(band)', Object.entries(d).map(([k, v]) => `${k} ${(v * 100).toFixed(1)}%`).join(', '));
    line('자막 등장', Object.entries(report.caption.anims).map(([k, v]) => `${k} ${(v.diffVsNone || []).map((x) => (x * 100).toFixed(1)).join('/')}%`).join(' · '));
  }
  line('음악 옵션', `${report.music?.options.length}개`);
  if (report.single?.file) line('한 편', `${path.basename(report.single.file)} ${report.single.video} · 오디오 ${report.single.audio || '없음'} mean ${fmt(report.single.mean)}dB · ${fmt(report.single.duration, 2)}s · ${report.timings.singleMs}ms`);
  if (report.batch) line('전부 만들기', `첫 결과 ${report.batch.firstMs}ms · ${report.batch.end.items.length}개 · ZIP잠김 ${report.batch.end.zipDisabled} · 오디오 ${report.batch.first.audio || '없음'} · zip ${report.batch.zip ? 'ok' : '-'}`);
  if (report.project) line('프로젝트', `저장 styleMusic=${report.project.settings.styleMusic} → 열기 뒤 ${report.project.after?.styleMusic} / ${report.project.after?.pressed}`);
  if (report.showcase) line('사례', `wall ${report.showcase.wall} · 칩 ${report.showcase.caseStyleCount} · 안내 30가지 ${report.showcase.guide?.has30}회`);
  if (report.mobile) line('모바일', `scrollW ${report.mobile.scrollW}/${report.mobile.vw} · 패널 ${JSON.stringify(report.mobile.panel)} · 음악 줄 ${JSON.stringify(report.mobile.musicRow)}`);
  line('콘솔 오류', `${report.consoleErrors.length}개 (예상된 것 ${report.expected.length}개)`);
  report.consoleErrors.forEach((e) => console.log('   ', e));
  report.notes.forEach((n) => console.log('  참고:', n));
  if (report.problems.length) { console.log('\n문제:'); report.problems.forEach((p) => console.log('  -', p)); }
  console.log(report.ok ? '\n결과: 통과' : '\n결과: 실패');
  process.exit(report.ok ? 0 : 1);
})();
