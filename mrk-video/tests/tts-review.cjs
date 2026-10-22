// 내레이션 만들기 검수 스크립트(Playwright). tts-ui.cjs 가 보는 성공 경로 외에
//  실패 경로(401/402/429/연결 실패/빈 응답)·아티팩트 모드·exporting/batch 중 차단·프로젝트 .json 에 키 유출·
//  장면 자막 수정 뒤 대본 동기화·새로고침 복원·fitToNarr·파일 저장·모바일 400px(긴 상태 글)·콘솔 오류를 봅니다.
// 결과: tests/out/tts-review/report.json. 정적 서버 http://127.0.0.1:5173/ 필요.
//   LANG=C.UTF-8 node tests/tts-review.cjs

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { chromium } = require('/opt/node-tools/node_modules/playwright');

const BASE = process.env.MRK_BASE || 'http://127.0.0.1:5173';
const OUT = path.join(__dirname, 'out', 'tts-review');
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const KEYS = { gemini: 'AIza-REVIEW-gemini-key-9001', elevenlabs: 'sk_eleven_REVIEW_key_9002', fish: 'fish-REVIEW-key-9003' };
const EXPECTED_404 = /\/assets\/samples\/[^/]+\.jpg$/;
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, GET, OPTIONS' };

function makeMp3(seconds, name) {
  const file = path.join(OUT, name);
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `sine=frequency=440:duration=${seconds}`, '-ar', '44100', '-ac', '1', '-b:a', '64k', file], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg: ${r.stderr}`);
  return fs.readFileSync(file);
}
function makePcmB64(seconds = 0.5) {
  const rate = 24000; const n = Math.round(rate * seconds); const buf = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 12000), i * 2);
  return buf.toString('base64');
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const want = (k) => !process.env.SECTIONS || process.env.SECTIONS.includes(k);

const report = { problems: [], notes: [], console: {}, sections: {} };
const problem = (s) => report.problems.push(s);
const note = (s) => report.notes.push(s);

function watch(page, name) {
  const bucket = []; const pending404 = [];
  report.console[name] = bucket;
  page.on('response', (r) => { if (r.status() === 404) pending404.push(r.url()); });
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (/404/.test(m.text())) { const url = pending404.shift() || ''; if (EXPECTED_404.test(url)) return; bucket.push(`console.error: ${m.text()} ${url}`); return; }
    bucket.push(`console.error: ${m.text()}`);
  });
  page.on('pageerror', (e) => bucket.push(`pageerror: ${e.message}`));
}

/** 모의 응답을 바꿔 가며 쓸 수 있는 라우트. mock.* 를 시나리오마다 바꿉니다. */
function makeMock(mp3, pcmB64) {
  const mock = {
    calls: { gemini: [], elevenlabs: [], fish: [], health: 0 },
    health: { ai: false, proxy: true, needsCode: false, youtube: false, tts: true },
    gemini: (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: pcmB64 } }] } }] }) }),
    elevenlabs: (route) => route.fulfill({ status: 200, contentType: 'audio/mpeg', headers: CORS, body: mp3 }),
    fish: (route) => route.fulfill({ status: 200, contentType: 'audio/mpeg', body: mp3 }),
    healthRoute: true,
  };
  mock.install = async (page) => {
    if (mock.healthRoute) await page.route('**/api/health', (route) => { mock.calls.health++; route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mock.health) }); });
    await page.route('**/api/tts', (route) => { const rq = route.request(); mock.calls.fish.push({ method: rq.method(), headers: rq.headers(), body: rq.postDataJSON() }); return mock.fish(route); });
    await page.route('https://generativelanguage.googleapis.com/**', (route) => {
      const rq = route.request(); if (rq.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      mock.calls.gemini.push({ url: rq.url(), headers: rq.headers(), body: rq.postDataJSON() }); return mock.gemini(route);
    });
    await page.route('https://api.elevenlabs.io/**', (route) => {
      const rq = route.request(); if (rq.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      mock.calls.elevenlabs.push({ url: rq.url(), headers: rq.headers(), body: rq.postDataJSON() }); return mock.elevenlabs(route);
    });
  };
  return mock;
}

async function openApp(page) {
  await page.goto(`${BASE}/#shorts`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelectorAll('#styleStrip .style-card').length > 0 && document.querySelectorAll('#sceneList .scene').length > 0, null, { timeout: 20000 });
  await page.waitForTimeout(400);
  await page.$eval('#ttsBox', (el) => { el.open = true; });
}
const pick = async (page, id) => { await page.selectOption('#ttsProvider', id); await page.waitForTimeout(60); };
const ui = (page) => page.evaluate(() => ({
  status: document.querySelector('#ttsStatus').textContent,
  audioInfo: document.querySelector('#audioInfo').textContent,
  fitEnabled: !document.querySelector('#fitToNarr').disabled,
  saveVisible: !!document.querySelector('#ttsSave').offsetParent,
  runEnabled: !document.querySelector('#ttsRun').disabled,
  toast: document.querySelector('#toast')?.hidden ? '' : document.querySelector('#toast')?.textContent,
}));
/** 음성 만들기 눌러서 끝날 때까지. 돌려주는 값은 ui() */
async function run(page, { timeout = 15000 } = {}) {
  await page.$eval('#ttsStatus', (el) => { el.textContent = ''; });
  await page.click('#ttsRun');
  await page.waitForFunction(() => { const s = document.querySelector('#ttsStatus').textContent.trim(); return s && !/만드는 중/.test(s); }, null, { timeout });
  return ui(page);
}
const ls = (page) => page.evaluate(() => { const all = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); all[k] = localStorage.getItem(k); } return all; });

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const mp3 = makeMp3(0.5, 'mock-0.5s.mp3');
  const mp3Long = makeMp3(12, 'mock-12s.mp3');
  const pcmB64 = makePcmB64();
  const browser = await chromium.launch({ executablePath: EXE, args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    // ═══════════ A. 실패 경로 ═══════════
    if (want('A')) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      watch(page, 'A-failures');
      const mock = makeMock(mp3, pcmB64);
      await mock.install(page);
      await openApp(page);
      const sec = report.sections.failures = {};
      const expect = async (label, provider, expectRe, setup) => {
        await pick(page, provider);
        await page.fill('#ttsKey', KEYS[provider]);
        if (provider === 'elevenlabs') await page.fill('#ttsVoice', 'voiceREVIEW01');
        setup();
        let r;
        try { r = await run(page); } catch (e) { r = { status: `(시간 초과) ${e.message}`, runEnabled: await page.$eval('#ttsRun', (b) => !b.disabled) }; }
        sec[label] = { status: r.status, runEnabled: r.runEnabled, saveVisible: r.saveVisible };
        if (!expectRe.test(r.status)) problem(`[실패 경로] ${label}: 안내가 기대와 다름 — "${r.status}" (기대 ${expectRe})`);
        if (!r.runEnabled) problem(`[실패 경로] ${label}: 버튼이 풀리지 않음`);
        if (/[A-Za-z]{12,}/.test(r.status) && !/Voice ID|API|ID|Fish Audio|AI Studio|Profile|Keys/.test(r.status.replace(/Voice ID|API|ID|Fish Audio|AI Studio|Profile|Keys/g, ''))) note(`${label}: 영어가 섞인 안내 — "${r.status}"`);
        return r;
      };
      const json = (status, body, headers = CORS) => (route) => route.fulfill({ status, contentType: 'application/json', headers, body: JSON.stringify(body) });

      await expect('gemini-400-badkey', 'gemini', /제미나이 API 키가 맞지 않습니다/, () => { mock.gemini = json(400, { error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT' } }); });
      await expect('gemini-403', 'gemini', /막았습니다/, () => { mock.gemini = json(403, { error: { code: 403, message: 'Generative Language API has not been used in project 123 before or it is disabled.', status: 'PERMISSION_DENIED' } }); });
      await expect('gemini-429', 'gemini', /한도/, () => { mock.gemini = json(429, { error: { code: 429, message: 'Resource has been exhausted', status: 'RESOURCE_EXHAUSTED' } }); });
      await expect('gemini-500-text', 'gemini', /제미나이 오류 \(500\)/, () => { mock.gemini = (route) => route.fulfill({ status: 500, contentType: 'text/html', headers: CORS, body: '<h1>Server Error</h1>' }); });
      await expect('gemini-200-noaudio', 'gemini', /음성을 돌려주지 않았습니다/, () => { mock.gemini = json(200, { candidates: [{ finishReason: 'SAFETY', content: { parts: [{ text: '' }] } }] }); });
      await expect('gemini-network', 'gemini', /연결하지 못했습니다/, () => { mock.gemini = (route) => route.abort('failed'); });
      // 제미나이 키가 URL 쿼리에 실리는지(헤더 x-goog-api-key 가 아닌)
      const gurl = mock.calls.gemini[0]?.url || '';
      sec.geminiKeyInUrl = gurl.includes(`key=${KEYS.gemini}`);
      sec.geminiUrl = gurl.replace(KEYS.gemini, '<KEY>');

      await expect('eleven-401-badkey', 'elevenlabs', /키가 맞지 않습니다/, () => { mock.elevenlabs = json(401, { detail: { status: 'invalid_api_key', message: 'Invalid API key' } }); });
      await expect('eleven-401-quota', 'elevenlabs', /한도/, () => { mock.elevenlabs = json(401, { detail: { status: 'quota_exceeded', message: 'This request exceeds your quota of 10000. You have 12 credits remaining, while 300 credits are required for this request.' } }); });
      await expect('eleven-401-unusual', 'elevenlabs', /./, () => { mock.elevenlabs = json(401, { detail: { status: 'detected_unusual_activity', message: 'Unusual activity detected. Free Tier usage disabled.' } }); });
      await expect('eleven-402', 'elevenlabs', /크레딧/, () => { mock.elevenlabs = json(402, { detail: { status: 'payment_required', message: 'Payment required' } }); });
      await expect('eleven-404-voice', 'elevenlabs', /Voice ID/, () => { mock.elevenlabs = json(404, { detail: { status: 'voice_not_found', message: 'A voice with voice_id voiceREVIEW01 was not found.' } }); });
      await expect('eleven-429', 'elevenlabs', /요청이 많습니다/, () => { mock.elevenlabs = json(429, { detail: { status: 'too_many_concurrent_requests', message: 'x' } }); });
      await expect('eleven-network', 'elevenlabs', /연결하지 못했습니다/, () => { mock.elevenlabs = (route) => route.abort('failed'); });
      await expect('eleven-200-empty', 'elevenlabs', /빈 음성/, () => { mock.elevenlabs = (route) => route.fulfill({ status: 200, contentType: 'audio/mpeg', headers: CORS, body: Buffer.alloc(0) }); });

      await expect('fish-401-code', 'fish', /접속 코드/, () => { mock.fish = json(401, { error: '접속 코드가 맞지 않습니다. 사용 안내 화면에서 접속 코드를 입력하세요.' }, {}); });
      await expect('fish-401-key', 'fish', /키가 맞지 않습니다/, () => { mock.fish = json(401, { error: 'Fish Audio API 키가 맞지 않습니다. fish.audio → API Keys 에서 다시 확인하세요.' }, {}); });
      await expect('fish-402', 'fish', /크레딧/, () => { mock.fish = json(402, { error: 'Fish Audio 크레딧이 부족합니다. fish.audio 에서 충전하세요.' }, {}); });
      await expect('fish-503', 'fish', /접속 코드를 설정/, () => { mock.fish = json(503, { error: '서버에 접속 코드를 설정해야 Fish Audio 중계를 쓸 수 있습니다.' }, {}); });
      await expect('fish-500-html', 'fish', /음성 서버 오류 \(500\)/, () => { mock.fish = (route) => route.fulfill({ status: 500, contentType: 'text/html', body: 'FUNCTION_INVOCATION_TIMEOUT' }); });
      await expect('fish-network', 'fish', /./, () => { mock.fish = (route) => route.abort('failed'); });

      // 대본 3,000자 초과(프로그램으로 넣은 값은 maxlength 를 넘을 수 있음)
      mock.gemini = (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: pcmB64 } }] } }] }) });
      await pick(page, 'gemini');
      await page.fill('#ttsKey', KEYS.gemini);
      const before = mock.calls.gemini.length;
      await page.$eval('#ttsText', (el) => { el.value = '가'.repeat(3500); el.dispatchEvent(new Event('input', { bubbles: true })); });
      const long = await run(page);
      sec.tooLong = { status: long.status, called: mock.calls.gemini.length - before };
      if (!/너무 깁니다/.test(long.status)) problem(`[3000자 초과] 안내 없음: "${long.status}"`);
      if (mock.calls.gemini.length !== before) problem('[3000자 초과] 요청이 나감');
      await page.click('#ttsFromScenes');

      // 빈 키·빈 음성 ID 검사(요청 없이 안내)
      await pick(page, 'elevenlabs');
      await page.fill('#ttsKey', '');
      let v = await run(page); sec.noKey = v.status;
      if (!/API 키를 넣어 주세요/.test(v.status)) problem(`[빈 키] "${v.status}"`);
      await page.fill('#ttsKey', KEYS.elevenlabs);
      await page.fill('#ttsVoice', '');
      v = await run(page); sec.noVoice = v.status;
      if (!/Voice ID를 넣어 주세요/.test(v.status)) problem(`[빈 Voice ID] "${v.status}"`);

      // 응답이 오래 걸릴 때(6초) — 그동안 버튼 잠김·끝나면 풀림. 클라이언트 쪽 시간 제한이 있는지 본다.
      await pick(page, 'gemini');
      await page.fill('#ttsKey', KEYS.gemini);
      mock.gemini = async (route) => { await sleep(6000); return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: pcmB64 } }] } }] }) }); };
      await page.$eval('#ttsStatus', (el) => { el.textContent = ''; });
      await page.click('#ttsRun');
      await page.waitForTimeout(3000);
      const mid = await ui(page);
      // 그 사이에 서비스·키를 바꿔 본다(만드는 중 화면 조작)
      await pick(page, 'fish');
      await page.waitForFunction(() => /완성|오류|못했|않/.test(document.querySelector('#ttsStatus').textContent), null, { timeout: 10000 });
      const after = await ui(page);
      sec.slow = { mid: { status: mid.status, runEnabled: mid.runEnabled }, after: { status: after.status, audioInfo: after.audioInfo, provider: await page.$eval('#ttsProvider', (s) => s.value) } };
      if (mid.runEnabled || !/만드는 중/.test(mid.status)) problem(`[느린 응답] 만드는 중 버튼/상태 이상: ${JSON.stringify(mid)}`);
      if (!after.runEnabled) problem('[느린 응답] 끝나도 버튼이 안 풀림');

      await page.screenshot({ path: path.join(OUT, 'A-failures.png') });
      await page.close();
    }

    // ═══════════ B. 성공 경로 깊이: 12초 내레이션 → fitToNarr · 파일 저장 · 재생 · 지우기 ═══════════
    if (want('B')) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      watch(page, 'B-success');
      const mock = makeMock(mp3Long, pcmB64);
      await mock.install(page);
      await openApp(page);
      const sec = report.sections.success = {};
      await pick(page, 'elevenlabs');
      await page.fill('#ttsKey', KEYS.elevenlabs);
      await page.fill('#ttsVoice', 'voiceREVIEW01');
      const r = await run(page, { timeout: 30000 });
      sec.run = r;
      if (!/^완성 — 00:12/.test(r.status)) problem(`[성공] 12초 내레이션 상태: "${r.status}"`);
      const durBefore = await page.evaluate(() => [...document.querySelectorAll('#sceneList .scene input[type=number]')].map((i) => Number(i.value)));
      await page.click('#fitToNarr');
      await page.waitForTimeout(300);
      const durAfter = await page.evaluate(() => [...document.querySelectorAll('#sceneList .scene input[type=number]')].map((i) => Number(i.value)));
      const sum = durAfter.reduce((a, b) => a + b, 0);
      sec.fit = { before: durBefore, after: durAfter, sum: Math.round(sum * 10) / 10, summary: await page.$eval('#sceneSummary', (e) => e.textContent) };
      if (Math.abs(sum - 12.4) > 0.5) problem(`[fitToNarr] 장면 길이 합 ${sum.toFixed(1)}초 ≠ 내레이션 12.0+0.4초`);
      // 파일로 저장 → 다운로드 이름·크기
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), page.click('#ttsSave')]);
      const dlPath = await dl.path();
      sec.save = { filename: dl.suggestedFilename(), bytes: fs.statSync(dlPath).size, mp3Bytes: mp3Long.length };
      if (dl.suggestedFilename() !== '내레이션.mp3') problem(`[파일 저장] 이름 "${dl.suggestedFilename()}"`);
      if (fs.statSync(dlPath).size !== mp3Long.length) problem('[파일 저장] 받은 파일 크기가 응답과 다름');
      // 제미나이 → .wav 이름
      await pick(page, 'gemini');
      await page.fill('#ttsKey', KEYS.gemini);
      await run(page);
      const [dl2] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), page.click('#ttsSave')]);
      sec.saveWav = { filename: dl2.suggestedFilename(), bytes: fs.statSync(await dl2.path()).size };
      if (dl2.suggestedFilename() !== '내레이션.wav') problem(`[파일 저장] 제미나이 이름 "${dl2.suggestedFilename()}"`);
      const wavHead = fs.readFileSync(await dl2.path()).subarray(0, 12).toString('latin1');
      if (!/^RIFF.{4}WAVE$/s.test(wavHead)) problem(`[제미나이 WAV] 머리글 이상: ${JSON.stringify(wavHead)}`);
      // 재생(내레이션 포함) — 오류 없이 시작·정지
      await page.click('#playBtn');
      await page.waitForTimeout(1200);
      sec.playBtn = await page.$eval('#playBtn', (b) => b.textContent.trim());
      await page.click('#playBtn');
      // 소리 지우기 → 내레이션 빠짐, 저장 버튼은?
      await page.click('#clearAudio');
      sec.afterClear = await ui(page);
      if (/내레이션/.test(sec.afterClear.audioInfo)) problem('[소리 지우기] 내레이션이 남아 있음');
      // 파일로 넣은 내레이션 뒤 음성 만들기 → 이름 교체, narrFile 비움
      await page.setInputFiles('#narrFile', { name: '내 목소리.mp3', mimeType: 'audio/mpeg', buffer: mp3 });
      await page.waitForFunction(() => /내 목소리/.test(document.querySelector('#audioInfo').textContent), null, { timeout: 5000 });
      await run(page);
      sec.afterFile = await ui(page);
      sec.afterFile.narrFile = await page.$eval('#narrFile', (i) => i.value);
      if (/내 목소리/.test(sec.afterFile.audioInfo) || sec.afterFile.narrFile) problem('[파일 뒤 생성] 파일 내레이션이 남음');
      await page.close();
    }

    // ═══════════ C. exporting / batch 중 차단 ═══════════
    if (want('C')) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      watch(page, 'C-block');
      const mock = makeMock(mp3, pcmB64);
      await mock.install(page);
      await openApp(page);
      const sec = report.sections.block = {};
      await pick(page, 'gemini');
      await page.fill('#ttsKey', KEYS.gemini);
      await page.$eval('#ttsStatus', (el) => { el.textContent = ''; });
      await page.click('#exportBtn');
      await page.waitForTimeout(150);
      await page.click('#ttsRun');
      await page.waitForTimeout(150);
      const u1 = await ui(page);
      sec.exporting = { toast: u1.toast, status: u1.status, runEnabled: u1.runEnabled, geminiCalls: mock.calls.gemini.length, exportBtn: await page.$eval('#exportBtn', (b) => b.textContent) };
      if (!/영상을 만드는 중/.test(u1.toast || '')) problem(`[exporting 차단] 안내 토스트 없음: "${u1.toast}" / status "${u1.status}"`);
      if (mock.calls.gemini.length) problem('[exporting 차단] 내보내기 중인데 요청이 나감');
      await page.click('#exportBtn'); // 멈춤
      await page.waitForFunction(() => /멈췄습니다|완성|못했습니다/.test(document.querySelector('#exportStatus').textContent), null, { timeout: 60000 });
      sec.exporting.exportStatusAfter = await page.$eval('#exportStatus', (e) => e.textContent);
      await page.waitForTimeout(800);
      // 전부 만들기(batch)
      await page.$eval('#toast', (el) => { el.hidden = true; el.textContent = ''; });
      await page.click('#styleBatchBtn');
      await page.waitForTimeout(150);
      await page.click('#ttsRun');
      await page.waitForTimeout(150);
      const u2 = await ui(page);
      sec.batch = { toast: u2.toast, geminiCalls: mock.calls.gemini.length, batchBtn: await page.$eval('#styleBatchBtn', (b) => b.textContent) };
      if (!/영상을 만드는 중/.test(u2.toast || '')) problem(`[batch 차단] 안내 토스트 없음: "${u2.toast}"`);
      if (mock.calls.gemini.length) problem('[batch 차단] 전부 만들기 중인데 요청이 나감');
      await page.click('#batchStop');
      await page.waitForFunction(() => !/멈춤/.test(document.querySelector('#styleBatchBtn').textContent), null, { timeout: 90000 });
      await page.waitForTimeout(500);
      // 반대 방향: 음성 만드는 중(느린 응답)에 내보내기를 누르면? (차단되는지, 내레이션이 영상에 들어가는지)
      mock.gemini = async (route) => { await sleep(2500); return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: pcmB64 } }] } }] }) }); };
      await page.$eval('#ttsStatus', (el) => { el.textContent = ''; });
      await page.click('#ttsRun');
      await page.waitForTimeout(200);
      await page.click('#exportBtn');
      await page.waitForTimeout(300);
      sec.exportDuringTts = { exportBtn: await page.$eval('#exportBtn', (b) => b.textContent), exportStatus: await page.$eval('#exportStatus', (e) => e.textContent), toast: (await ui(page)).toast };
      await page.waitForFunction(() => /완성 —/.test(document.querySelector('#ttsStatus').textContent), null, { timeout: 10000 });
      if (/멈춤/.test(sec.exportDuringTts.exportBtn)) { await page.click('#exportBtn'); await page.waitForFunction(() => /멈췄습니다|완성|못했습니다/.test(document.querySelector('#exportStatus').textContent), null, { timeout: 60000 }); }
      await page.close();
    }

    // ═══════════ D. 대본 동기화 · 프로젝트 저장 .json · 새로고침 복원 ═══════════
    if (want('D')) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      watch(page, 'D-sync-save');
      const mock = makeMock(mp3, pcmB64);
      await mock.install(page);
      await openApp(page);
      const sec = report.sections.sync = {};
      const text0 = await page.$eval('#ttsText', (t) => t.value);
      // 장면 자막을 고친다(비구조 변경 changed(false))
      await page.fill('#sceneList .scene textarea >> nth=0', '검수용으로 *바꾼* 첫 자막');
      await page.waitForTimeout(400);
      const text1 = await page.$eval('#ttsText', (t) => t.value);
      sec.afterCaptionEdit = { changed: text1 !== text0, firstLine: text1.split('\n')[0], expectedFirstLine: '검수용으로 바꾼 첫 자막' };
      if (!/검수용으로 바꾼 첫 자막/.test(text1)) problem(`[대본 동기화] 장면 자막을 고쳤는데 대본 칸이 옛 자막 그대로: "${text1.split('\n')[0]}"`);
      // 구조 변경(장면 추가) 뒤에는 따라오는가
      await page.click('#addTextScene'); // 예시 장면은 모두 빠지고 새 장면 하나만 남는다
      await page.waitForTimeout(300);
      await page.fill('#sceneList .scene textarea >> nth=0', '진짜 장면 *자막* 하나');
      await page.waitForTimeout(300);
      const text1b = await page.$eval('#ttsText', (t) => t.value);
      sec.afterCaptionEdit2 = { firstLine: text1b.split('\n')[0] };
      await page.click('#addTextScene');
      await page.waitForTimeout(300);
      const text2 = await page.$eval('#ttsText', (t) => t.value);
      sec.afterStructural = { firstLine: text2.split('\n')[0], lines: text2.split('\n').length };
      if (!/진짜 장면 자막 하나/.test(text2)) problem('[대본 동기화] 장면을 추가해도 고친 자막이 대본에 안 옴');
      // 사용자가 대본을 고친 뒤 → 장면 추가 → 덮어쓰지 않음 → "다시 가져오기" 로 복원
      await page.fill('#ttsText', '내가 직접 쓴 대본');
      await page.click('#addTextScene');
      await page.waitForTimeout(300);
      const text3 = await page.$eval('#ttsText', (t) => t.value);
      sec.userEditKept = text3 === '내가 직접 쓴 대본';
      if (!sec.userEditKept) problem('[대본 동기화] 사용자가 고친 대본이 장면 추가로 덮어써짐');
      await page.click('#ttsFromScenes');
      const text4 = await page.$eval('#ttsText', (t) => t.value);
      sec.refetched = text4.split('\n').length;
      if (text4 === '내가 직접 쓴 대본') problem('[대본 다시 가져오기] 복원 안 됨');
      // 프로젝트 열기 뒤(openProject → changed(true)) 사용자가 고친 대본이 남아 있는지
      await page.fill('#ttsText', '프로젝트 바꾸기 전 대본');
      // 키 기억 켜고 저장 → .json 에 키·tts 설정이 들어가는지
      await pick(page, 'fish');
      await page.fill('#ttsKey', KEYS.fish);
      await page.check('#ttsRemember');
      await pick(page, 'gemini');
      await page.fill('#ttsKey', KEYS.gemini);
      await page.check('#ttsRemember');
      await page.fill('#title', '검수 프로젝트').catch(() => {});
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click('#projSaveBtn')]);
      const json = fs.readFileSync(await dl.path(), 'utf8');
      const data = JSON.parse(json);
      sec.projectJson = { filename: dl.suggestedFilename(), bytes: json.length, topKeys: Object.keys(data), settingsKeys: Object.keys(data.settings || {}), hasAnyKey: Object.values(KEYS).some((k) => json.includes(k)), hasTts: /"tts/i.test(json) };
      if (sec.projectJson.hasAnyKey) problem('[프로젝트 .json] API 키가 들어감');
      if (sec.projectJson.hasTts) problem('[프로젝트 .json] tts 설정이 들어감');
      const all = await ls(page);
      sec.localStorage = { keys: Object.keys(all), shortsHasTts: /tts/i.test(all['mrk:shorts'] || ''), ttsKeys: all['mrk:ttsKeys'], tts: all['mrk:tts'] };
      if (sec.localStorage.shortsHasTts) problem("[store 'shorts'] tts 항목이 들어감");
      if (/REVIEW/.test(all['mrk:tts'] || '') || /REVIEW/.test(all['mrk:shorts'] || '')) problem("[store] 키가 'tts'/'shorts' 설정에 섞임");
      // 그 .json 을 다시 열기 → 대본 칸(사용자 수정본)이 남는지
      await page.setInputFiles('#projFile', { name: 'p.json', mimeType: 'application/json', buffer: Buffer.from(json) });
      await page.waitForFunction(() => /프로젝트를 열었습니다/.test(document.querySelector('#toast')?.textContent || ''), null, { timeout: 10000 });
      sec.afterOpenProject = { ttsText: (await page.$eval('#ttsText', (t) => t.value)).slice(0, 40) };
      // 새로고침 복원: 서비스·엔진·속도·목소리·기억한 키
      await pick(page, 'gemini');
      await page.selectOption('#ttsVoice', 'Fenrir');
      await pick(page, 'fish');
      await page.selectOption('#ttsModel', 's1');
      await page.$eval('#ttsSpeed', (el) => { el.value = '1.2'; el.dispatchEvent(new Event('input', { bubbles: true })); });
      await page.fill('#ttsVoice', 'abcdef0123456789abcdef0123456789');
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => document.querySelectorAll('#sceneList .scene').length > 0, null, { timeout: 20000 });
      await page.waitForTimeout(300);
      await page.$eval('#ttsBox', (el) => { el.open = true; });
      const restored = await page.evaluate(() => ({ provider: document.querySelector('#ttsProvider').value, model: document.querySelector('#ttsModel').value, speed: document.querySelector('#ttsSpeed').value, speedOut: document.querySelector('#ttsSpeedOut').textContent, voice: document.querySelector('#ttsVoice').value, key: document.querySelector('#ttsKey').value, remember: document.querySelector('#ttsRemember').checked, status: document.querySelector('#ttsStatus').textContent }));
      await pick(page, 'gemini');
      restored.geminiVoice = await page.$eval('#ttsVoice', (s) => s.value);
      restored.geminiKey = await page.$eval('#ttsKey', (i) => i.value);
      sec.restored = restored;
      if (restored.provider !== 'fish' || restored.model !== 's1' || restored.speed !== '1.2' || restored.voice !== 'abcdef0123456789abcdef0123456789') problem(`[새로고침] Fish 설정 복원 안 됨: ${JSON.stringify(restored)}`);
      if (restored.key !== KEYS.fish || !restored.remember) problem('[새로고침] 기억한 Fish 키가 안 돌아옴');
      if (restored.geminiVoice !== 'Fenrir' || restored.geminiKey !== KEYS.gemini) problem('[새로고침] 제미나이 목소리/키 복원 안 됨');
      await page.close();
    }

    // ═══════════ E. 아티팩트 모드(window.claude.use 흉내) ═══════════
    if (want('E')) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      watch(page, 'E-artifact');
      await page.addInitScript(() => { window.claude = { use: () => Promise.reject(new Error('no cap')) }; });
      const mock = makeMock(mp3, pcmB64);
      await mock.install(page);
      await openApp(page);
      const sec = report.sections.artifact = {};
      sec.initialStatus = await page.$eval('#ttsStatus', (e) => e.textContent);
      sec.runEnabled = await page.$eval('#ttsRun', (b) => !b.disabled);
      if (!/Claude 미리보기/.test(sec.initialStatus)) problem(`[아티팩트] 처음 안내 없음: "${sec.initialStatus}"`);
      // 키 없이 누르면?
      await page.fill('#ttsKey', '');
      let r = await run(page);
      sec.clickNoKey = r.status;
      // 키 넣고 누르면?
      await page.fill('#ttsKey', KEYS.gemini);
      r = await run(page);
      sec.clickWithKey = r.status;
      sec.externalCalls = { gemini: mock.calls.gemini.length, elevenlabs: mock.calls.elevenlabs.length, fish: mock.calls.fish.length, health: mock.calls.health };
      if (!/Claude 미리보기/.test(r.status)) problem(`[아티팩트] 키 넣고 눌렀을 때 안내: "${r.status}"`);
      if (mock.calls.gemini.length) problem('[아티팩트] 외부 요청이 나감');
      await pick(page, 'fish');
      sec.fishStatus = await page.$eval('#ttsStatus', (e) => e.textContent);
      await page.close();
    }

    // ═══════════ F. 서버 없는 환경(health 404) 에서 Fish ═══════════
    if (want('F')) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      watch(page, 'F-noserver');
      const mock = makeMock(mp3, pcmB64);
      mock.healthRoute = false; // 정적 서버의 진짜 404
      await mock.install(page);
      await openApp(page);
      const sec = report.sections.noServer = {};
      await pick(page, 'fish');
      await page.waitForTimeout(500);
      sec.fishStatus = await page.$eval('#ttsStatus', (e) => e.textContent);
      if (!/ko372\.com/.test(sec.fishStatus)) problem(`[서버 없음] Fish 안내 없음: "${sec.fishStatus}"`);
      await page.fill('#ttsKey', KEYS.fish);
      const r = await run(page);
      sec.runStatus = r.status; sec.fishCalls = mock.calls.fish.length;
      if (!/ko372\.com/.test(r.status)) problem(`[서버 없음] 음성 만들기 안내: "${r.status}"`);
      if (mock.calls.fish.length) problem('[서버 없음] /api/tts 요청이 나감');
      // 제미나이로 바꾸면 안내가 지워지는가
      await pick(page, 'gemini');
      sec.geminiStatus = await page.$eval('#ttsStatus', (e) => e.textContent);
      if (sec.geminiStatus) problem(`[서버 없음] 제미나이로 바꿨는데 Fish 안내가 남음: "${sec.geminiStatus}"`);
      await page.close();
    }

    // ═══════════ G. 모바일 400px — 긴 상태 글·긴 음성 ID·다크 ═══════════
    if (want('G')) {
      const page = await browser.newPage({ viewport: { width: 400, height: 800 } });
      watch(page, 'G-mobile');
      const mock = makeMock(mp3, pcmB64);
      mock.elevenlabs = (route) => route.fulfill({ status: 401, contentType: 'application/json', headers: CORS, body: JSON.stringify({ detail: { status: 'quota_exceeded', message: 'This request exceeds your quota of 10000. You have 12 credits remaining, while 300 credits are required for this request.' } }) });
      await mock.install(page);
      await openApp(page);
      const sec = report.sections.mobile = {};
      await pick(page, 'elevenlabs');
      await page.fill('#ttsKey', KEYS.elevenlabs);
      await page.fill('#ttsVoice', 'a_very_long_voice_identifier_that_keeps_going_0123456789_0123456789');
      await run(page);
      await page.$eval('#ttsBox', (el) => el.scrollIntoView());
      await page.waitForTimeout(200);
      const measure = () => page.evaluate(() => {
        const de = document.documentElement;
        const wide = [...document.querySelectorAll('#ttsBox, #ttsBox *')].filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1).map((el) => `${el.tagName.toLowerCase()}#${el.id || ''}.${[...el.classList].join('.')} right=${Math.round(el.getBoundingClientRect().right)}`);
        return { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth, wide: wide.slice(0, 8), status: document.querySelector('#ttsStatus').textContent };
      });
      sec.light = await measure();
      if (sec.light.scrollWidth > sec.light.clientWidth || sec.light.wide.length) problem(`[모바일 400] 넘침: ${JSON.stringify(sec.light)}`);
      await page.screenshot({ path: path.join(OUT, 'mobile-400-error.png'), fullPage: false });
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.waitForTimeout(200);
      sec.dark = await measure();
      if (sec.dark.scrollWidth > sec.dark.clientWidth || sec.dark.wide.length) problem(`[모바일 400 다크] 넘침: ${JSON.stringify(sec.dark)}`);
      await page.screenshot({ path: path.join(OUT, 'mobile-400-dark.png'), fullPage: false });
      // 상자 닫힌 상태 요약 줄·열린 상태 전체 높이
      sec.boxHeight = await page.$eval('#ttsBox', (el) => Math.round(el.getBoundingClientRect().height));
      await page.close();
    }
  } catch (e) {
    problem(`예외: ${e.stack || e.message}`);
  } finally {
    await browser.close();
  }
  for (const [k, v] of Object.entries(report.console)) if (v.length) problem(`[콘솔 ${k}] ${v.length}건: ${v.slice(0, 3).join(' | ')}`);
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.problems.length ? 1 : 0);
})();
