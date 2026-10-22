// 스타일 음악 연결 점검(Playwright + ffprobe/ffmpeg).
//   node tests/music-wire.cjs
// index.html#shorts 를 열어
//  (a) #styleMusic 옵션 12개(자동·끄기 + 분위기 10개), #audioInfo 에 "스타일 음악" 문구
//  (b) 미리듣기 버튼 #musicPreview 의 aria-pressed 토글(▶ → ■ → ▶), 미리보기 ▶ 재생 시 미리듣기 자동 정지
//  (c) 장면 0.6초·엔딩 1초·720p 로 "영상 만들기" → 결과 blob 을 받아 ffprobe 로 오디오 스트림 확인 + volumedetect(무음 아님)
//  (d) "전부 만들기" 첫 결과 1개 나온 뒤 멈춤 → 결과에 오디오 스트림 있음
//  (e) 콘솔 오류 0(정적 서버에 없는 예시 사진·/api/health 404 는 예상된 것)
// 결과 파일: tests/out/music/wire-single.<ext>, wire-batch.<ext>, wire-report.json. 종료 코드 0/1.
// 정적 서버가 http://127.0.0.1:5173/ 에 떠 있어야 합니다.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { chromium } = require('/opt/node-tools/node_modules/playwright');

const BASE = process.env.MRK_BASE || 'http://127.0.0.1:5173';
const OUT = path.join(__dirname, 'out', 'music');
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const MOOD_IDS = ['upbeat', 'news', 'calm', 'lofi', 'corporate', 'drama', 'quiz', 'warning', 'epic', 'playful'];

// 정적 서버엔 없는 것들: 예시 사진(없으면 그림으로 대체)과 Vercel 함수 /api/* 의 404 는 예상된 것
const EXPECTED_404 = /\/assets\/samples\/[^/]+\.jpg$|\/api\/[a-z]+$/;

function watch(page, bucket, expected) {
  const pending404 = [];
  page.on('response', (r) => { if (r.status() === 404) pending404.push(r.url()); });
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (/404/.test(m.text())) {
      const url = pending404.shift() || '';
      if (EXPECTED_404.test(url)) { expected.push(url); return; }
      bucket.push(`console.error: ${m.text()} ${url}`);
      return;
    }
    bucket.push(`console.error: ${m.text()}`);
  });
  page.on('pageerror', (e) => bucket.push(`pageerror: ${e.message}`));
}

function run(cmd, args) {
  const r = spawnSync(cmd, ['-hide_banner', ...args], { encoding: 'utf8' });
  return (r.stdout || '') + (r.stderr || '');
}
/** ffprobe 로 스트림 목록 */
function probe(file) {
  const txt = run('ffprobe', ['-v', 'error', '-show_entries', 'stream=index,codec_type,codec_name,sample_rate,channels,width,height', '-show_entries', 'format=duration,format_name', '-of', 'json', file]);
  try { return JSON.parse(txt); } catch { return { raw: txt }; }
}
/** ffmpeg volumedetect — 오디오 트랙의 평균·최대 볼륨(dB) */
function volume(file) {
  const txt = run('ffmpeg', ['-nostats', '-i', file, '-vn', '-af', 'volumedetect', '-f', 'null', '-']);
  return {
    mean: Number((/mean_volume:\s*(-?[\d.]+|inf)/.exec(txt) || [])[1]),
    max: Number((/max_volume:\s*(-?[\d.]+|inf)/.exec(txt) || [])[1]),
  };
}
/** 소리 지문(5밴드 평균 dB) — 두 결과의 음악이 다른지 보는 참고값 */
function bands(file) {
  return [[20, 150], [150, 500], [500, 2000], [2000, 6000], [6000, 16000]].map(([lo, hi]) => {
    const txt = run('ffmpeg', ['-nostats', '-i', file, '-vn', '-af', `highpass=f=${lo},lowpass=f=${hi},volumedetect`, '-f', 'null', '-']);
    return Number((/mean_volume:\s*(-?[\d.]+|inf)/.exec(txt) || [])[1]);
  });
}
const fmt = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : String(v));

/** #resultVideo 의 blob 을 받아 파일로 저장하고 ffprobe/ffmpeg 측정값을 돌려줍니다. */
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
  const fp = audio ? bands(file) : null;
  return {
    file, type: r.type, sizeMB: data.length / 1048576, md5: crypto.createHash('md5').update(data).digest('hex'),
    status: r.status, duration: Number(info.format?.duration),
    video: video ? `${video.codec_name} ${video.width}x${video.height}` : null,
    audio: audio ? `${audio.codec_name} ${audio.sample_rate}Hz ${audio.channels}ch` : null,
    hasAudio: !!audio, mean: vol.mean, max: vol.max, bands: fp,
  };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: EXE, args: ['--autoplay-policy=no-user-gesture-required'] });
  const report = { ok: true, problems: [], consoleErrors: [], expected404: [], options: null, preview: null, single: null, batch: null, timings: {} };
  const problem = (s) => report.problems.push(s);
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    watch(page, report.consoleErrors, report.expected404);
    await page.goto(`${BASE}/#shorts`, { waitUntil: 'load' });
    await page.waitForFunction(
      () => document.querySelectorAll('#styleStrip .style-card').length > 0 && document.querySelectorAll('#sceneList .scene').length > 0,
      null, { timeout: 20000 },
    );
    await page.waitForTimeout(600);

    // (a) 옵션 12개 + 안내 문구
    const opts = await page.$$eval('#styleMusic option', (els) => els.map((o) => ({ value: o.value, label: o.textContent })));
    const info0 = await page.$eval('#audioInfo', (el) => el.textContent);
    const selected = await page.$eval('#styleMusic', (el) => el.value);
    report.options = { count: opts.length, values: opts.map((o) => o.value), selected, audioInfo: info0 };
    if (opts.length !== 12) problem(`#styleMusic 옵션 ${opts.length}개 (12개여야 함)`);
    if (opts[0]?.value !== 'auto' || opts[1]?.value !== 'off') problem('첫 두 옵션이 auto·off 가 아님');
    MOOD_IDS.forEach((id) => { if (!opts.some((o) => o.value === id)) problem(`옵션에 분위기 '${id}' 없음`); });
    if (selected !== 'auto') problem(`기본 선택이 '${selected}' (auto 여야 함)`);
    if (!/스타일 음악: .+\(자동\)/.test(info0)) problem(`#audioInfo 문구가 "스타일 음악: … (자동)" 꼴이 아님: "${info0}"`);

    // 분위기를 직접 고르면 문구가 바뀌고, 스타일을 누르면(자동일 때) 그 스타일의 분위기로 바뀐다
    await page.selectOption('#styleMusic', 'quiz');
    await page.$eval('#styleMusic', (el) => el.dispatchEvent(new Event('input', { bubbles: true })));
    const infoQuiz = await page.$eval('#audioInfo', (el) => el.textContent);
    if (!/퀴즈 쇼/.test(infoQuiz) || /자동/.test(infoQuiz)) problem(`분위기를 '퀴즈 쇼'로 골랐는데 문구가 "${infoQuiz}"`);
    await page.selectOption('#styleMusic', 'off');
    await page.$eval('#styleMusic', (el) => el.dispatchEvent(new Event('input', { bubbles: true })));
    const offDisabled = await page.$eval('#musicPreview', (el) => el.disabled);
    const infoOff = await page.$eval('#audioInfo', (el) => el.textContent);
    if (!offDisabled) problem('끄기일 때 미리듣기 버튼이 잠기지 않음');
    if (!/꺼|무음/.test(infoOff)) problem(`끄기일 때 문구가 "${infoOff}"`);
    await page.selectOption('#styleMusic', 'auto');
    await page.$eval('#styleMusic', (el) => el.dispatchEvent(new Event('input', { bubbles: true })));
    // 스타일 카드 2번째를 눌러 자동 문구가 그 스타일의 분위기를 따라가는지(스타일 데이터에 music 이 없으면 '깔끔 기업')
    const styleInfo = await page.evaluate(async () => {
      const m = await import('/js/styles.js');
      const cards = document.querySelectorAll('#styleStrip .style-card');
      const st = m.STYLES[1];
      cards[1].click();
      await new Promise((r) => setTimeout(r, 150));
      return { id: st.id, music: st.music || null, info: document.querySelector('#audioInfo').textContent };
    });
    report.options.afterStyle = styleInfo;
    const expectMood = styleInfo.music || 'corporate';
    const expectName = (await page.evaluate(async (id) => (await import('/js/music.js')).MOODS.find((m) => m.id === id)?.name, expectMood)) || '';
    if (!styleInfo.info.includes(expectName)) problem(`스타일 '${styleInfo.id}'(music=${styleInfo.music}) 적용 뒤 문구가 "${styleInfo.info}" (기대: ${expectName})`);

    // (b) 미리듣기 토글
    const pressed = async () => page.$eval('#musicPreview', (el) => ({ pressed: el.getAttribute('aria-pressed'), text: el.textContent, disabled: el.disabled }));
    const p0 = await pressed();
    await page.click('#musicPreview');
    const p1 = await pressed();
    await page.waitForTimeout(2500); // 루프 렌더가 끝나 소리가 나기 시작할 시간
    const p1b = await pressed();
    await page.click('#musicPreview');
    const p2 = await pressed();
    // 미리보기 ▶ 를 누르면 미리듣기는 자동으로 멈춘다
    await page.click('#musicPreview');
    const p3 = await pressed();
    await page.click('#playBtn');
    await page.waitForFunction(() => document.querySelector('#playBtn').textContent === '❚❚', null, { timeout: 15000 });
    const p4 = await pressed();
    const playLabel = await page.$eval('#playBtn', (el) => el.getAttribute('aria-label'));
    await page.waitForTimeout(400);
    await page.click('#playBtn'); // 멈춤
    const playText = await page.$eval('#playBtn', (el) => el.textContent);
    report.preview = { before: p0, afterClick: p1, afterRender: p1b, afterSecondClick: p2, againOn: p3, afterPlay: p4, playLabel, playTextAfterStop: playText };
    if (p0.pressed !== 'false' || p0.text !== '▶') problem(`미리듣기 시작 상태가 ${JSON.stringify(p0)}`);
    if (p1.pressed !== 'true' || p1.text !== '■') problem(`미리듣기 켠 뒤 상태가 ${JSON.stringify(p1)}`);
    if (p1b.pressed !== 'true') problem('렌더 뒤 미리듣기가 저절로 꺼짐(렌더 실패?)');
    if (p2.pressed !== 'false' || p2.text !== '▶') problem(`미리듣기 끈 뒤 상태가 ${JSON.stringify(p2)}`);
    if (p3.pressed !== 'true') problem('미리듣기를 다시 켤 수 없음');
    if (p4.pressed !== 'false') problem('미리보기 재생을 시작했는데 미리듣기가 멈추지 않음');
    if (playLabel !== '일시정지') problem(`재생 중 ▶ 버튼 라벨이 '${playLabel}'`);
    if (playText !== '▶') problem(`멈춘 뒤 ▶ 버튼 글자가 '${playText}'`);

    // (c) 장면 0.6초 · 엔딩 1초 · 720p → 영상 만들기
    const setup = await page.evaluate(() => {
      const fire = (el) => el.dispatchEvent(new Event('input', { bubbles: true }));
      for (const inp of document.querySelectorAll('#sceneList input[type="number"]')) { inp.value = '0.6'; fire(inp); }
      const ed = document.querySelector('#endingDur'); ed.value = '1'; fire(ed);
      const on = document.querySelector('#endingOn'); if (!on.checked) { on.checked = true; fire(on); }
      const q = document.querySelector('#quality'); q.value = '720'; fire(q);
      return { scenes: document.querySelectorAll('#sceneList .scene').length, summary: document.querySelector('#sceneSummary').textContent, timecode: document.querySelector('#timecode').textContent };
    });
    report.single = { setup };
    let t0 = Date.now();
    await page.click('#exportBtn');
    await page.waitForFunction(() => /^완성/.test(document.querySelector('#exportStatus').textContent) || /만들지 못했습니다|멈췄습니다/.test(document.querySelector('#exportStatus').textContent), null, { timeout: 90000 });
    report.timings.singleMs = Date.now() - t0;
    const singleStatus = await page.$eval('#exportStatus', (el) => el.textContent);
    if (!/^완성/.test(singleStatus)) problem(`영상 만들기 실패: ${singleStatus}`);
    else {
      const r = await grabResult(page, 'wire-single');
      Object.assign(report.single, r);
      if (!r.hasAudio) problem(`한 편 결과(${path.basename(r.file)})에 오디오 스트림이 없음`);
      if (!r.video) problem('한 편 결과에 비디오 스트림이 없음');
      if (r.hasAudio && !(r.mean > -50)) problem(`한 편 결과 오디오가 거의 무음(mean ${fmt(r.mean)} dB)`);
      if (r.video && !/x1280$/.test(r.video)) problem(`720p 로 만들었는데 크기가 ${r.video}`);
    }

    // (d) 전부 만들기 → 첫 결과 1개 나오면 멈춤 → 결과(첫 영상)에 오디오
    t0 = Date.now();
    const batchLabel = await page.$eval('#styleBatchBtn', (el) => el.textContent);
    await page.click('#styleBatchBtn');
    await page.waitForFunction(() => document.querySelectorAll('#batchList .result-item').length >= 1, null, { timeout: 90000 });
    const firstMs = Date.now() - t0;
    const firstName = await page.$eval('#batchList .result-item b', (el) => el.textContent);
    await page.click('#batchStop');
    await page.waitForFunction((label) => document.querySelector('#styleBatchBtn').textContent === label, batchLabel, { timeout: 30000 });
    report.timings.batchFirstMs = firstMs;
    report.timings.batchStopMs = Date.now() - t0 - firstMs;
    const batchStatus = await page.$eval('#batchStatus', (el) => el.textContent);
    const batchCount = await page.$$eval('#batchList .result-item', (els) => els.length);
    const firstMusic = await page.evaluate(async () => { const m = await import('/js/styles.js'); return { id: m.STYLES[0].id, music: m.STYLES[0].music || null, count: m.STYLES.length }; });
    const rb = await grabResult(page, 'wire-batch');
    report.batch = { label: batchLabel, status: batchStatus, results: batchCount, firstName, firstStyle: firstMusic, ...rb };
    if (!rb.hasAudio) problem(`전부 만들기 첫 결과(${path.basename(rb.file)})에 오디오 스트림이 없음`);
    if (rb.hasAudio && !(rb.mean > -50)) problem(`전부 만들기 첫 결과 오디오가 거의 무음(mean ${fmt(rb.mean)} dB)`);
    if (batchCount < 1) problem('전부 만들기 결과가 0개');
    if (!batchLabel.endsWith('가지 전부 만들기')) problem(`일괄 버튼 글자 '${batchLabel}'`);
    // 한 편(현재 스타일: STYLES[1])과 첫 일괄 결과(STYLES[0])의 음악이 다른 분위기면 지문도 달라야 한다(참고값)
    if (report.single.bands && rb.bands) {
      report.batch.bandDistFromSingle = report.single.bands.reduce((s, v, i) => s + Math.abs(v - rb.bands[i]), 0);
    }

    // 자막·업로드용 글 회귀: SRT 가 장면 수만큼 나오고 업로드용 글이 비지 않음
    report.regress = await page.evaluate(async () => {
      const r = await import('/js/shorts-render.js');
      const u = await import('/js/util.js');
      const scenes = document.querySelectorAll('#sceneList .scene').length;
      const uploadPanel = document.querySelector('#uploadPanel');
      return { scenes, srtOk: typeof r.buildSrt === 'function' && typeof u.srtTime === 'function', uploadPanelShown: !uploadPanel.hidden, plats: document.querySelectorAll('#plats .plat').length };
    });
    if (!report.regress.uploadPanelShown || report.regress.plats < 5) problem('결과 뒤 바로 올리기 패널이 열리지 않음');

    await page.close();
  } catch (e) {
    problem(`스크립트 오류: ${e.stack || e.message}`);
  } finally {
    await browser.close();
  }

  // (e) 콘솔 오류 0
  if (report.consoleErrors.length) problem(`콘솔 오류 ${report.consoleErrors.length}개`);
  report.ok = report.problems.length === 0;
  fs.writeFileSync(path.join(OUT, 'wire-report.json'), JSON.stringify(report, null, 2));

  // 표 출력
  const line = (k, v) => console.log(`  ${k.padEnd(22)} ${v}`);
  console.log('\n[스타일 음악 연결 점검]');
  line('옵션', `${report.options?.count}개 — ${report.options?.values.join(', ')}`);
  line('첫 문구', report.options?.audioInfo);
  line('스타일 뒤 문구', report.options?.afterStyle ? `${report.options.afterStyle.id}(music=${report.options.afterStyle.music}) → ${report.options.afterStyle.info}` : '-');
  line('미리듣기', report.preview ? `${report.preview.before.text}/${report.preview.before.pressed} → ${report.preview.afterClick.text}/${report.preview.afterClick.pressed} → ${report.preview.afterSecondClick.text}/${report.preview.afterSecondClick.pressed}; 재생 시작 시 ${report.preview.afterPlay.pressed}` : '-');
  if (report.single?.file) {
    line('한 편', `${path.basename(report.single.file)} ${report.single.type} ${fmt(report.single.sizeMB, 2)}MB · ${report.single.video} · 오디오 ${report.single.audio || '없음'} · mean ${fmt(report.single.mean)} dB max ${fmt(report.single.max)} dB · 길이 ${fmt(report.single.duration, 2)}s · ${report.timings.singleMs}ms`);
    line('  설정', `${report.single.setup.scenes}장면 · ${report.single.setup.summary} · ${report.single.setup.timecode}`);
  }
  if (report.batch?.file) {
    line('전부 만들기', `${report.batch.label} · 첫 결과 "${report.batch.firstName}"(${report.batch.firstStyle.id}, music=${report.batch.firstStyle.music}) ${report.timings.batchFirstMs}ms · 멈춤까지 ${report.timings.batchStopMs}ms · ${report.batch.results}개`);
    line('  결과', `${path.basename(report.batch.file)} ${report.batch.type} ${fmt(report.batch.sizeMB, 2)}MB · ${report.batch.video} · 오디오 ${report.batch.audio || '없음'} · mean ${fmt(report.batch.mean)} dB max ${fmt(report.batch.max)} dB · 한 편과 지문 거리 ${fmt(report.batch.bandDistFromSingle)} dB`);
  }
  line('콘솔 오류', `${report.consoleErrors.length}개 (예상된 404 ${report.expected404.length}개)`);
  report.consoleErrors.forEach((e) => console.log('   ', e));
  if (report.problems.length) { console.log('\n문제:'); report.problems.forEach((p) => console.log('  -', p)); }
  console.log(report.ok ? '\n결과: 통과' : '\n결과: 실패');
  process.exit(report.ok ? 0 : 1);
})();
