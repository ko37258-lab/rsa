// 매물 사진으로 쇼츠 만들기 흐름 점검(Playwright) — #shorts 화면에서 처음부터 끝까지 실제로 눌러 봅니다.
//  외부 AI·대시보드는 진짜 키가 없으므로 page.route 모의 응답으로 막습니다(형식은 각 서비스 공식 문서 기준).
//  (A) 맨 위 AI 키 칸: 칩(키 없음 안내 → 제미나이 ✓), 기억 끔(sessionStorage)·켬(localStorage)·다시 끔, 보이기 토글, 지우기, 잘못된 글자
//  (B) ① 테스트용 JPEG 3장(빨강·초록·파랑) 넣기 → 장면 3, 예시 장면 비움, 미리보기에 사진, 썸네일 순서 바꾸기
//  (C) ② 매물·중개사무소 정보 입력(사무소는 store 'office' 에 기억)
//  (D) ③ 제미나이 모의 응답(LISTING_SCHEMA JSON)으로 대본 → 장면 순서 photo 번호대로, 자막·읽을 문장·종류·제목·업로드 글·필수 표시 줄
//      클로드·GPT 모의 응답으로도 한 번씩(요청 헤더·모델·스키마·사진 수 확인)
//  (E) ④ 제미나이 목소리 모의 PCM → audio.narr, 장면 길이 = 읽을 문장 글자 수 비율
//      내 목소리 녹음(가짜 마이크) → 내레이션, 장면 길이 다시 맞춤
//  (F) ⑤ 영상 만들기(장면 0.5초·720p) → 결과 영상
//  (G) ⑥ 업무 대시보드로 보내기: 새 창(대시보드 주소)을 가짜 페이지로 가로채 'mrk-outbox-ready' → 받은 메시지 기록 → 'mrk-outbox-ok'
//      payload·texts 키·글자 수 한도·영상 크기·필수 표시 줄 확인
//  (H) 16:9 로 바꿔 대본 → 목소리 → 영상 한 번 더 + '세로(9:16) 권장' 경고
//  (I) 프로젝트 저장(.json 에 매물 정보·읽을 문장, 키는 없음) → 다시 열기
//  (J) 접근성(단계 제목·라벨·aria-live·aria-pressed), 400px 가로 넘침 없음 + 다크 캡처, 콘솔 오류 0
// 결과: tests/out/listing/report.json + 스크린샷. 종료 코드 0/1. 정적 서버가 http://127.0.0.1:5173/ 에 떠 있어야 합니다.
//   LANG=C.UTF-8 node tests/listing-flow.cjs

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { chromium } = require('/opt/node-tools/node_modules/playwright');

const BASE = process.env.MRK_BASE || 'http://127.0.0.1:5173';
const OUT = path.join(__dirname, 'out', 'listing');
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const DASH = 'https://dashboard-nine-drab-95.vercel.app';
const KEYS = { gemini: 'AIzaSyTEST-listing-gemini-0001', claude: 'sk-ant-api03-TEST-listing-0002', openai: 'sk-proj-TEST-listing-openai-0003' };
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, GET, OPTIONS' };
const EXPECTED_404 = /\/assets\/samples\/[^/]+\.jpg$|favicon/;
const HANGUL = /[가-힣]/;
const FACTS = {
  lsType: '아파트', lsDeal: '매매', lsPrice: '5억 2천', lsArea: '전용 84㎡', lsLoc: '수원시 영통구 이의동', lsFloor: '12층/20층', lsMemo: '남향, 올수리',
  // 건축물 필수 항목(시행령 제17조의2 ② 6호) — 아파트라 보이는 칸
  lsApproval: '2005.03.15', lsDir: '남향(거실 기준)', lsRooms: '방 3 / 욕실 2', lsMoveIn: '즉시', lsParking: '세대당 1.2대', lsMaint: '월 25만 원(난방 별도)',
};
const OFFICE = { lsOfName: '미스터홈즈공인중개사사무소', lsOfAgent: '고상철', lsOfReg: '41117-2026-00001', lsOfAddr: '수원시 영통구 광교로 1', lsOfPhone: '031-000-0000' };

/** 모의 대본(LISTING_SCHEMA 모양). tag 로 서비스마다 자막을 조금씩 다르게 해서 어떤 응답이 들어갔는지 구분합니다. */
function listingJSON(tag, order = [2, 0, 1]) {
  const caps = [`${tag} 문 열자마자 *남향* 햇살 가득`, `${tag} 올수리라 바로 입주하기 좋아요`, `${tag} 자세한 조건은 *문의*로 확인`];
  const nars = [
    '현관문을 열면 남향 거실로 햇살이 가득 들어오는 집입니다.',
    '주방과 욕실까지 수리가 되어 있어 바로 입주하기 좋아 보입니다. 짐만 옮기면 되겠네요.',
    '가격과 입주 조건은 설명란 연락처로 편하게 문의해 주세요.',
  ];
  return {
    title: `수원 이의동 *남향* 아파트\\n${tag}`,
    scenes: order.map((photo, i) => ({ photo, caption: caps[i], narration: nars[i] })),
    upload: {
      youtubeTitle: `${tag} 수원 이의동 남향 올수리 아파트`,
      youtubeDescription: '수원 영통구 이의동 남향 아파트입니다. 올수리가 되어 있어 바로 입주하기 좋습니다. '.repeat(4).trim(),
      instagram: '수원 이의동 남향 아파트 🏠\n올수리 완료\n바로 입주 가능해 보여요',
      tiktok: '남향 햇살 가득한 수원 이의동 아파트',
      threads: '이의동에서 남향 아파트 찾으셨다면 한번 보세요. 올수리라 깔끔합니다. '.repeat(10).trim(),
      facebook: '수원 영통구 이의동 아파트 매물 소개입니다. 남향에 올수리 완료.',
      hashtags: ['#수원아파트', '#이의동', '#남향', '수원부동산'],
    },
  };
}

/** 24kHz PCM16 사인파(sec 초) → base64 */
function pcmB64(sec) {
  const rate = 24000;
  const n = Math.round(rate * sec);
  const buf = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 330 * i) / rate) * 11000), i * 2);
  return buf.toString('base64');
}
const TTS_SEC = 3;
/** PCM16 에 WAV(RIFF) 머리를 붙임 — 제미나이 3.8 TTS 는 한 번 요청에 audio/wav 를 기본으로 돌려줍니다(speech-generation 문서) */
function wavB64(sec) {
  const pcm = Buffer.from(pcmB64(sec), 'base64');
  const rate = 24000;
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]).toString('base64');
}
// 제미나이 목소리 모의 형식: 기본은 실제와 같은 'wav', (H) 16:9 흐름 한 번만 옛 모델 대비 'l16'(audio/L16 PCM)
let ttsFormat = 'wav';

/** 단색 테스트 JPEG(1600×1200) — 미리보기 가운데 색으로 어느 사진이 보이는지 확인합니다. */
function makeJpeg(file, color) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `color=c=${color}:s=1600x1200`, '-frames:v', '1', '-q:v', '3', file], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg jpeg 실패: ${r.stderr}`);
}
function makeMp3(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1.5', '-ar', '44100', '-ac', '1', '-b:a', '64k', file], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg mp3 실패: ${r.stderr}`);
  return fs.readFileSync(file);
}

// 대시보드 흉내 페이지: 열리면 opener 에 'mrk-outbox-ready', 'mrk-outbox-post' 를 받으면 기록하고 'mrk-outbox-ok'
const FAKE_DASH = `<!doctype html><html lang="ko"><meta charset="utf-8"><title>가짜 대시보드</title><body>대시보드
<script>
window.__got = [];
window.addEventListener('message', (e) => {
  const d = e.data || {};
  window.__got.push({ origin: e.origin, type: d.type, keys: Object.keys(d), payload: d.payload, images: Array.isArray(d.images) ? d.images.length : -1,
    videoIsBlob: d.video instanceof Blob, videoSize: d.video ? d.video.size : -1, videoType: d.video ? d.video.type : '', videoName: d.videoName });
  if (d.type === 'mrk-outbox-post') e.source.postMessage({ type: 'mrk-outbox-ok' }, e.origin);
});
if (window.opener) window.opener.postMessage({ type: 'mrk-outbox-ready' }, '*');
</script></body></html>`;
// 거절하는 대시보드(로그인 안 됨 흉내)와 아무 말 없는 대시보드(창을 닫아 버림 흉내)
const FAKE_DASH_FAIL = `<!doctype html><html lang="ko"><meta charset="utf-8"><title>거절</title><body><script>
window.addEventListener('message', (e) => { if (e.data && e.data.type === 'mrk-outbox-post') e.source.postMessage({ type: 'mrk-outbox-fail', error: '대시보드에 로그인해 주세요.' }, e.origin); });
window.opener && window.opener.postMessage({ type: 'mrk-outbox-ready' }, '*');
</script></body></html>`;
const FAKE_DASH_SILENT = '<!doctype html><html lang="ko"><meta charset="utf-8"><title>조용</title><body>조용</body></html>';
let dashMode = 'ok';

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const checks = [];
  const report = { ok: true, checks: [], failed: [], consoleErrors: [], expected404: [], calls: { gemini: [], geminiTts: [], claude: [], openai: [], fish: 0 }, info: {} };
  const check = (name, ok, detail) => {
    checks.push({ name, ok: !!ok, detail: detail === undefined ? '' : (typeof detail === 'string' ? detail : JSON.stringify(detail)) });
    console.log(`${ok ? 'OK ' : 'NG '} ${name}${!ok && detail !== undefined ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
  };
  const photos = [['photo-1.jpg', '0xd94a3a'], ['photo-2.jpg', '0x3aa65a'], ['photo-3.jpg', '0x3a6ad9']].map(([n, c]) => { const f = path.join(OUT, n); makeJpeg(f, c); return f; });
  const mp3 = makeMp3(path.join(OUT, 'mock.mp3'));

  const browser = await chromium.launch({ executablePath: EXE, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  let llmTag = { gemini: 'G1', claude: 'C1', openai: 'O1' };
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    await ctx.grantPermissions(['microphone', 'clipboard-read', 'clipboard-write'], { origin: BASE });

    // ── 모의 응답 ──
    await ctx.route('**/api/health', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ai: false, proxy: true, needsCode: false, youtube: false, tts: true, gate: true, member: '관리자', owner: true }) }));
    await ctx.route('**/api/tts', (r) => { report.calls.fish++; report.info.fishCall = r.request().postDataJSON(); r.fulfill({ status: 200, contentType: 'audio/mpeg', body: mp3 }); });
    await ctx.route('https://generativelanguage.googleapis.com/**', (route) => {
      const rq = route.request();
      if (rq.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      const body = rq.postDataJSON();
      const call = { url: rq.url(), headers: rq.headers(), body };
      if (/tts/.test(rq.url())) {
        report.calls.geminiTts.push(call);
        const inlineData = ttsFormat === 'l16' ? { mimeType: 'audio/L16;codec=pcm;rate=24000', data: pcmB64(TTS_SEC) } : { mimeType: 'audio/wav', data: wavB64(TTS_SEC) };
        return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ candidates: [{ content: { parts: [{ inlineData }] }, finishReason: 'STOP' }] }) });
      }
      report.calls.gemini.push(call);
      const json = listingJSON(llmTag.gemini);
      return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify(json) }] }, finishReason: 'STOP' }] }) });
    });
    await ctx.route('https://api.anthropic.com/**', (route) => {
      const rq = route.request();
      if (rq.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      report.calls.claude.push({ url: rq.url(), headers: rq.headers(), body: rq.postDataJSON() });
      const json = listingJSON(llmTag.claude, [1, 2, 0]);
      return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text: JSON.stringify(json) }], stop_reason: 'end_turn' }) });
    });
    await ctx.route('https://api.openai.com/**', (route) => {
      const rq = route.request();
      if (rq.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      report.calls.openai.push({ url: rq.url(), headers: rq.headers(), body: rq.postDataJSON() });
      const json = listingJSON(llmTag.openai, [0, 1, 2]);
      return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ id: 'resp_test', object: 'response', status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify(json) }] }] }) });
    });
    await ctx.route('https://api.elevenlabs.io/**', (route) => {
      const rq = route.request();
      if (rq.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      report.calls.eleven = (report.calls.eleven || 0) + 1;
      report.info.elevenCall = { url: rq.url(), key: rq.headers()['xi-api-key'] === 'sk_listing_eleven_0004', text: rq.postDataJSON()?.text };
      return route.fulfill({ status: 200, contentType: 'audio/mpeg', headers: CORS, body: mp3 });
    });
    await ctx.route(`${DASH}/**`, (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: dashMode === 'fail' ? FAKE_DASH_FAIL : dashMode === 'silent' ? FAKE_DASH_SILENT : FAKE_DASH }));

    const page = await ctx.newPage();
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

    await page.goto(`${BASE}/#shorts`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.querySelectorAll('#sceneList .scene').length > 0 && document.querySelectorAll('#styleStrip .style-card').length > 0, null, { timeout: 20000 });
    await page.waitForTimeout(600);

    const storage = () => page.evaluate(() => ({
      ls: Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])),
      ss: Object.fromEntries(Object.keys(sessionStorage).map((k) => [k, sessionStorage.getItem(k)])),
    }));
    const has = (obj, s) => Object.values(obj).some((v) => String(v).includes(s));
    const chips = () => page.$eval('#keyChips', (el) => el.textContent);

    // ═══ (A) 키 칸 ═══
    {
      const first = await page.evaluate(() => ({
        chips: document.querySelector('#keyChips').textContent,
        expanded: document.querySelector('#keyToggle').getAttribute('aria-expanded'),
        bodyHidden: document.querySelector('#keyBody').hidden,
        firstPanel: document.querySelector('#view-shorts .view-head').nextElementSibling?.id,
        rows: [...document.querySelectorAll('.key-row')].map((r) => r.dataset.key),
        primary: document.querySelector('.key-primary').textContent.includes('무료로 시작'),
        inputs: [...document.querySelectorAll('.key-row input')].map((i) => ({ type: i.type, ac: i.autocomplete, label: i.labels?.length || 0 })),
      }));
      report.info.keybar = first;
      check('키 칸이 숏폼 제목 바로 아래 첫 패널', first.firstPanel === 'aiKeys', first.firstPanel);
      check('키 없음 → 칩이 "AI 키를 넣으면 대본을 자동으로 씁니다"', /AI 키를 넣으면 대본을 자동으로 씁니다/.test(first.chips), first.chips);
      check('키 칸 처음엔 접힘(aria-expanded=false)', first.expanded === 'false' && first.bodyHidden);
      check('키 칸 5개 순서: 제미나이(맨 위·크게) → 클로드·GPT → 일레븐랩스·Fish', first.rows.join(',') === 'gemini,claude,openai,elevenlabs,fish' && first.primary, first.rows);
      check('키 입력 칸 password·autocomplete off·label 연결', first.inputs.every((i) => i.type === 'password' && i.ac === 'off' && i.label >= 1), first.inputs);
      await page.click('#keyToggle');
      check('"키 넣기" → 펼침(aria-expanded=true)', await page.evaluate(() => document.querySelector('#keyToggle').getAttribute('aria-expanded') === 'true' && !document.querySelector('#keyBody').hidden));
      check('"이 브라우저에 기억" 기본 끔', !(await page.$eval('#keyRemember', (el) => el.checked)));
      await page.fill('#key-gemini', KEYS.gemini);
      await page.waitForTimeout(100);
      let c = await chips();
      check('제미나이 키 넣으면 칩 "제미나이 ✓"', /제미나이 ✓/.test(c) && /클로드 미입력/.test(c) && /Fish Audio 미입력/.test(c), c);
      let st = await storage();
      check('기억 끔: sessionStorage 에만 키, localStorage 에는 없음', has(st.ss, KEYS.gemini) && !has(st.ls, KEYS.gemini));
      await page.check('#keyRemember');
      st = await storage();
      check('기억 켬: localStorage mrkv.keys 에 키, sessionStorage 에서는 빠짐', String(st.ls['mrkv.keys'] || '').includes(KEYS.gemini) && !has(st.ss, KEYS.gemini));
      await page.uncheck('#keyRemember');
      st = await storage();
      check('기억 다시 끔: localStorage 에서 지움(탭 안에만 남음)', !has(st.ls, KEYS.gemini) && has(st.ss, KEYS.gemini));
      // 보이기 토글
      const showBtn = '.key-row[data-key="gemini"] button:has-text("보이기")';
      await page.click(showBtn);
      const shown = await page.evaluate(() => ({ type: document.querySelector('#key-gemini').type, pressed: document.querySelector('.key-row[data-key="gemini"] button[aria-pressed]').getAttribute('aria-pressed') }));
      await page.click('.key-row[data-key="gemini"] button[aria-pressed]');
      const hidden = await page.evaluate(() => ({ type: document.querySelector('#key-gemini').type, pressed: document.querySelector('.key-row[data-key="gemini"] button[aria-pressed]').getAttribute('aria-pressed') }));
      check('보이기 토글: text·aria-pressed=true → 다시 password·false', shown.type === 'text' && shown.pressed === 'true' && hidden.type === 'password' && hidden.pressed === 'false', { shown, hidden });
      // 지우기
      await page.fill('#key-claude', KEYS.claude);
      await page.waitForTimeout(80);
      const cOn = await chips();
      await page.click('.key-row[data-key="claude"] button:has-text("지우기")');
      const cOff = await chips();
      const claudeLeft = await page.evaluate(async () => (await import('/js/keys.js')).getKey('claude'));
      check('지우기: 클로드 ✓ → 클로드 미입력, 키 비움', /클로드 ✓/.test(cOn) && /클로드 미입력/.test(cOff) && claudeLeft === '' && (await page.$eval('#key-claude', (el) => el.value)) === '', { cOn, cOff });
      // 잘못된 글자
      await page.fill('#key-openai', 'bad key 한글');
      await page.press('#key-openai', 'Tab');
      const bad = await page.evaluate(async () => ({ msg: document.querySelector('#key-openai-st').textContent, key: (await import('/js/keys.js')).getKey('openai') }));
      check('잘못된 글자 키 → 한국어 안내, 저장 안 함', HANGUL.test(bad.msg) && /허용되지 않는 글자/.test(bad.msg) && bad.key === '' && !bad.msg.includes('bad key'), bad);
      await page.fill('#key-openai', '');
      // 클로드·GPT 키(나중 단계에서 씀)
      await page.fill('#key-claude', KEYS.claude);
      await page.fill('#key-openai', KEYS.openai);
      await page.waitForTimeout(80);
      c = await chips();
      check('세 키 넣은 뒤 칩: 제미나이·클로드·GPT ✓', /제미나이 ✓/.test(c) && /클로드 ✓/.test(c) && /GPT ✓/.test(c), c);
      await page.screenshot({ path: path.join(OUT, '01-keybar.png') });
      await page.click('#keyToggle'); // 접기
    }

    // ═══ (B) ① 사진 ═══
    const centerColor = () => page.evaluate(() => {
      const c = document.querySelector('#previewCanvas');
      const d = c.getContext('2d').getImageData(Math.round(c.width / 2), Math.round(c.height * 0.5), 1, 1).data;
      return [d[0], d[1], d[2]];
    });
    const dominant = ([r, g, b]) => (r > g + 40 && r > b + 40 ? 'red' : g > r + 40 && g > b + 40 ? 'green' : b > r + 40 && b > g + 40 ? 'blue' : 'other');
    let ids0;
    {
      await page.setInputFiles('#lsFiles', photos);
      await page.waitForFunction(() => document.querySelectorAll('#lsThumbs li').length === 3, null, { timeout: 10000 });
      await page.waitForTimeout(300);
      const b = await page.evaluate(() => ({
        scenes: document.querySelectorAll('#sceneList .scene').length,
        thumbs: document.querySelectorAll('#lsThumbs li').length,
        ids: [...document.querySelectorAll('#lsThumbs li')].map((li) => li.dataset.id),
        sceneIds: [...document.querySelectorAll('#sceneList .scene')].map((li) => li.dataset.id),
        samples: [...document.querySelectorAll('#sceneList .tag')].filter((t) => t.textContent === '예시').length,
        step1: document.querySelector('#lsProgress li[data-step="1"]').dataset.state,
        step3: document.querySelector('#lsProgress li[data-step="3"]').dataset.state,
        current: document.querySelector('#lsProgress [aria-current="step"]')?.dataset.step,
      }));
      ids0 = b.ids;
      report.info.photos = b;
      check('사진 3장 → 장면 3개(예시 장면 비움)', b.scenes === 3 && b.thumbs === 3 && b.samples === 0, b);
      check('썸네일 순서 = 장면 순서', b.ids.join() === b.sceneIds.join());
      check('진행 표시: ① 끝 → ③ 차례(aria-current=step)', b.step1 === 'done' && b.step3 === 'current' && b.current === '3', b);
      const col = await centerColor();
      check('① 후 미리보기에 첫 사진(빨강)이 보임', dominant(col) === 'red', col);
      // 순서 바꾸기: 1번 → 뒤로, 다시 앞으로
      await page.click('#lsThumbs li:nth-child(1) button[data-act="next"]');
      const moved = await page.$$eval('#lsThumbs li', (els) => els.map((li) => li.dataset.id));
      const sceneMoved = await page.$$eval('#sceneList .scene', (els) => els.map((li) => li.dataset.id));
      await page.click('#lsThumbs li:nth-child(2) button[data-act="prev"]');
      const back = await page.$$eval('#lsThumbs li', (els) => els.map((li) => li.dataset.id));
      check('썸네일 → 로 순서 바꾸면 장면 순서도 바뀜, ← 로 되돌림', moved.join() === [ids0[1], ids0[0], ids0[2]].join() && sceneMoved.join() === moved.join() && back.join() === ids0.join(), { moved, back });
      await page.screenshot({ path: path.join(OUT, '02-photos.png') });
    }

    // ═══ (C) ② 정보 ═══
    {
      await page.click('#lsInfo > summary');
      for (const [id, v] of Object.entries(FACTS)) {
        if (id === 'lsType' || id === 'lsDeal') await page.selectOption(`#${id}`, v); else await page.fill(`#${id}`, v);
        if (id === 'lsType') check('종류 아파트 → 건축물 필수 항목 칸이 보임', !(await page.$eval('#lsBld', (el) => el.hidden)));
      }
      for (const [id, v] of Object.entries(OFFICE)) await page.fill(`#${id}`, v);
      await page.waitForTimeout(400);
      const st = await storage();
      const office = JSON.parse(st.ls['mrk:office'] || '{}');
      check('중개사무소 정보는 store "office" 에 기억', office.name === OFFICE.lsOfName && office.regNo === OFFICE.lsOfReg && office.phone === OFFICE.lsOfPhone, office);
      check('② 정보 넣으면 진행 표시 ② 끝', (await page.$eval('#lsProgress li[data-step="2"]', (el) => el.dataset.state)) === 'done');
      const aiOpts = await page.$$eval('#lsAi option', (os) => os.map((o) => ({ v: o.value, d: o.disabled, t: o.textContent })));
      check('쓸 AI: 키 있는 것만 고를 수 있음(세 키 모두 있음)', aiOpts.every((o) => !o.d) && /자동/.test(aiOpts[0].t), aiOpts);
    }

    // ═══ (D) ③ 제미나이 대본 ═══
    const waitGen = () => page.waitForFunction(() => {
      const b = document.querySelector('#lsGen');
      return !b.disabled && document.querySelector('#lsGenStatus').classList.contains('ok') || document.querySelector('#lsGenStatus').classList.contains('bad');
    }, null, { timeout: 20000 });
    const sceneState = () => page.evaluate(() => {
      const lines = [...document.querySelectorAll('#lsScript li')];
      return {
        ids: [...document.querySelectorAll('#sceneList .scene')].map((li) => li.dataset.id),
        captions: [...document.querySelectorAll('#sceneList .scene textarea')].map((t) => t.value),
        kinds: [...document.querySelectorAll('#sceneList .scene select')].map((s) => s.value),
        durations: [...document.querySelectorAll('#sceneList .scene input[type=number]')].map((i) => Number(i.value)),
        lines: lines.length,
        lineCaps: lines.map((li) => li.querySelector('input').value),
        lineNars: lines.map((li) => li.querySelector('textarea').value),
        title: document.querySelector('#title').value,
        upload: document.querySelector('#uploadText').textContent,
        uploadVisible: !document.querySelector('#uploadInfo').hidden,
        status: document.querySelector('#lsGenStatus').textContent,
        ttsText: document.querySelector('#ttsText').value,
      };
    });
    {
      await page.click('#lsGen');
      const busy = await page.evaluate(() => ({ disabled: document.querySelector('#lsGen').disabled, cancel: !document.querySelector('#lsGenCancel').hidden }));
      await waitGen();
      const s = await sceneState();
      report.info.geminiScript = s;
      check('진행 중 버튼 잠금·멈춤 버튼 보임', busy.disabled && busy.cancel, busy);
      check('제미나이 대본 → 완료 안내(한국어)', /장면 3개 대본을 만들었습니다/.test(s.status), s.status);
      const gc = report.calls.gemini[0];
      check('제미나이 요청 1번', report.calls.gemini.length === 1, report.calls.gemini.length);
      if (gc) {
        const parts = gc.body?.contents?.[0]?.parts || [];
        const imgs = parts.filter((p) => p.inline_data);
        const labels = parts.filter((p) => /^사진 \d+:$/.test(p.text || '')).map((p) => p.text);
        const promptText = parts.map((p) => p.text || '').join('\n');
        const gconf = gc.body?.generationConfig || {};
        check('제미나이: 모델 주소(gemini-3.8-flash)·키는 헤더로만', /\/v1beta\/models\/gemini-3\.8-flash:generateContent$/.test(gc.url) && gc.headers['x-goog-api-key'] === KEYS.gemini && !gc.url.includes(KEYS.gemini), gc.url);
        check('제미나이: 사진 3장(inline_data jpeg)·번호 라벨 사진 0~2', imgs.length === 3 && imgs.every((p) => p.inline_data.mime_type === 'image/jpeg' && p.inline_data.data.length > 1000) && labels.join() === '사진 0:,사진 1:,사진 2:', { imgs: imgs.length, labels });
        check('제미나이: JSON 스키마 응답 설정', !!(gconf.responseFormat?.text?.schema || gconf.responseJsonSchema), Object.keys(gconf));
        check('프롬프트에 적은 사실·사무소 연락처, 키는 없음', promptText.includes('5억 2천') && promptText.includes('수원시 영통구 이의동') && promptText.includes(OFFICE.lsOfPhone) && !JSON.stringify(gc.body).includes(KEYS.gemini), promptText.slice(0, 120));
        // 사진은 1024px 로 줄여 보냄
        const dim = await page.evaluate(async (b64) => { const im = new Image(); im.src = `data:image/jpeg;base64,${b64}`; await im.decode(); return [im.naturalWidth, im.naturalHeight]; }, imgs[0]?.inline_data?.data || '');
        check('보낸 사진 긴 변 1024px', Math.max(...dim) === 1024, dim);
      }
      check('장면 순서 = photo 번호 순서 [2,0,1]', s.ids.join() === [ids0[2], ids0[0], ids0[1]].join(), { got: s.ids, ids0 });
      check('장면 자막 = 대본 자막(*강조* 유지)', s.captions[0] === 'G1 문 열자마자 *남향* 햇살 가득' && s.captions[2].startsWith('G1 자세한 조건은'), s.captions);
      check('장면 종류: 첫 장면 훅·마지막 문의 안내(cta)', s.kinds.join() === 'hook,normal,cta', s.kinds);
      check('③ 결과 목록: 장면별 자막·읽을 문장 3줄', s.lines === 3 && s.lineNars[0].startsWith('현관문을 열면') && s.lineCaps[1].startsWith('G1 올수리'), { lines: s.lines, nar: s.lineNars[0] });
      check('제목 반영(줄바꿈)', s.title === '수원 이의동 *남향* 아파트\nG1', s.title);
      check('내레이션 대본 칸 = 읽을 문장(자막 아님)', s.ttsText.split('\n')[0] === '현관문을 열면 남향 거실로 햇살이 가득 들어오는 집입니다.', s.ttsText.slice(0, 60));
      const up = s.upload;
      check('업로드 글: 유튜브 제목·설명·해시태그', s.uploadVisible && up.startsWith('G1 수원 이의동 남향 올수리 아파트') && up.includes('#수원아파트') && up.includes('#수원부동산'), up.slice(0, 80));
      const disc = ['중개사무소: 미스터홈즈공인중개사사무소', '소재지: 수원시 영통구 광교로 1', '연락처: 031-000-0000', '등록번호: 41117-2026-00001', '개업공인중개사: 고상철', '매물 소재지: 수원시 영통구 이의동', '면적: 전용 84㎡', '가격: 5억 2천', '매물 종류: 아파트', '거래 형태: 매매', '층수(해당 층/총 층): 12층/20층',
        '사용승인일: 2005.03.15', '방향: 남향(거실 기준)', '방·욕실 수: 방 3 / 욕실 2', '입주 가능일: 즉시', '주차 대수: 세대당 1.2대', '관리비: 월 25만 원(난방 별도)'];
      const missing = disc.filter((l) => !up.includes(l));
      check('업로드 설명 끝에 필수 표시 항목(사무소 5·매물 5·건축물 7) 줄', !missing.length, missing);
      check('업로드 글: 설명 → 필수 표시 → 해시태그 순서', up.indexOf('바로 입주하기 좋습니다') < up.indexOf('중개사무소:') && up.indexOf('중개사무소:') < up.indexOf('#수원아파트'));
      check('업로드 글: 인스타·틱톡·쓰레드·페이스북 칸', ['── 인스타그램 릴스 ──', '── 틱톡 ──', '── 쓰레드 ──', '── 페이스북 ──'].every((h) => up.includes(h)));
      check('특징 한 줄(memo)은 필수 표시 줄에 넣지 않음', !up.includes('기타 특징:'));
      const col = await centerColor();
      check('③ 후 미리보기 첫 장면 = photo 2(파랑)', dominant(col) === 'blue', col);
      // ③ 목록에서 자막을 고치면 장면 목록도 따라옴
      await page.fill('#lsScript li:nth-child(2) input', 'G1 올수리라 바로 입주 가능해요');
      const synced = await page.$eval('#sceneList .scene:nth-child(2) textarea', (t) => t.value);
      check('③ 목록에서 고친 자막 → 장면 목록·project 반영', synced === 'G1 올수리라 바로 입주 가능해요', synced);
      await page.screenshot({ path: path.join(OUT, '03-script.png') });
    }

    // ═══ (D2) 클로드·GPT ═══
    for (const id of ['claude', 'openai']) {
      await page.selectOption('#lsAi', id);
      const prevIds = (await sceneState()).ids; // AI 에 보내는 사진 번호 = 지금 장면 순서
      await page.click('#lsGen');
      await waitGen();
      const s = await sceneState();
      const order = id === 'claude' ? [1, 2, 0] : [0, 1, 2];
      check(`${id}: 장면 순서 = 응답 photo 번호 [${order}] (지금 순서 기준)`, s.ids.join() === order.map((i) => prevIds[i]).join(), { prev: prevIds, got: s.ids });
      const call = report.calls[id][0];
      const tag = id === 'claude' ? 'C1' : 'O1';
      check(`${id}: 대본 반영(자막 ${tag})`, s.captions.every((c) => c.startsWith(tag)) && new RegExp(id === 'claude' ? '클로드로' : 'GPT로').test(s.status), { caps: s.captions, status: s.status });
      if (id === 'claude' && call) {
        const imgs = (call.body?.messages?.[0]?.content || []).filter((c) => c.type === 'image');
        check('클로드: 헤더 x-api-key·anthropic-version 2023-06-01·브라우저 직접 허용', call.headers['x-api-key'] === KEYS.claude && call.headers['anthropic-version'] === '2023-06-01' && call.headers['anthropic-dangerous-direct-browser-access'] === 'true');
        check('클로드: 모델 claude-opus-5-5·output_config.format json_schema·사진 3장', call.body?.model === 'claude-opus-5-5' && call.body?.output_config?.format?.type === 'json_schema' && imgs.length === 3 && imgs.every((c) => c.source?.type === 'base64'), { model: call.body?.model, imgs: imgs.length });
      }
      if (id === 'openai' && call) {
        const content = call.body?.input?.[0]?.content || [];
        const imgs = content.filter((c) => c.type === 'input_image');
        check('GPT: Responses API·Bearer 키·모델 gpt-6.1-sol', /\/v1\/responses$/.test(call.url) && call.headers.authorization === `Bearer ${KEYS.openai}` && call.body?.model === 'gpt-6.1-sol', call.url);
        check('GPT: text.format json_schema(strict)·사진 3장(data URL)', call.body?.text?.format?.type === 'json_schema' && call.body?.text?.format?.strict === true && imgs.length === 3 && imgs.every((c) => String(c.image_url).startsWith('data:image/jpeg;base64,')), { imgs: imgs.length });
      }
    }
    // 다시 제미나이(자동)로 — 이후 단계는 제미나이 대본 기준
    await page.selectOption('#lsAi', 'auto');
    llmTag.gemini = 'G2';
    await page.click('#lsGen');
    await waitGen();
    check('자동 → 제미나이로 다시 만들기', (await sceneState()).captions.every((c) => c.startsWith('G2')) && report.calls.gemini.length === 2);

    // ═══ (E) ④ 목소리 — 제미나이 ═══
    const durRatioOk = (durs, nars, total) => {
      const w = nars.map((n) => Math.max(8, n.length));
      const sum = w.reduce((a, b) => a + b, 0);
      return durs.every((d, i) => Math.abs(d - Math.max(0.8, (total * w[i]) / sum)) <= 0.11);
    };
    {
      const tabs = await page.$$eval('#listingBox [role="tab"]', (ts) => ts.map((t) => ({ id: t.id, sel: t.getAttribute('aria-selected'), text: t.textContent.trim() })));
      check('목소리 탭 4개: 제미나이(기본·무료 한도)·내 목소리 녹음·일레븐랩스·Fish Audio', tabs.length === 4 && tabs[0].sel === 'true' && /무료 한도/.test(tabs[0].text) && /녹음/.test(tabs[1].text) && /일레븐랩스/.test(tabs[2].text) && /Fish/.test(tabs[3].text), tabs);
      await page.selectOption('#lsGemVoice', 'Puck');
      await page.click('#lsGemRun');
      await page.waitForFunction(() => /완성|못|없|키/.test(document.querySelector('#lsVoiceStatus').textContent) && !document.querySelector('#lsGemRun').disabled, null, { timeout: 20000 });
      const v = await page.evaluate(() => ({
        status: document.querySelector('#lsVoiceStatus').textContent,
        audioInfo: document.querySelector('#audioInfo').textContent,
        durations: [...document.querySelectorAll('#sceneList .scene input[type=number]')].map((i) => Number(i.value)),
        nars: [...document.querySelectorAll('#lsScript li textarea')].map((t) => t.value),
        step4: document.querySelector('#lsProgress li[data-step="4"]').dataset.state,
        ttsVoice: document.querySelector('#ttsVoice').value,
      }));
      report.info.geminiVoice = v;
      const tc = report.calls.geminiTts[0];
      check('제미나이 목소리 → 완성·내레이션 (제미나이)', /^완성/.test(v.status) && /내레이션 \(제미나이\) \(00:03/.test(v.audioInfo), { status: v.status, audioInfo: v.audioInfo });
      check('제미나이 TTS 요청: tts 모델·목소리 Puck·읽을 문장 3줄', !!tc && /tts:generateContent$/.test(tc.url) && tc.headers['x-goog-api-key'] === KEYS.gemini && tc.body?.generationConfig?.speechConfig?.voiceConfig?.prebuiltVoiceConfig?.voiceName === 'Puck' && tc.body?.contents?.[0]?.parts?.[0]?.text === v.nars.join('\n'), tc && { url: tc.url, voice: tc.body?.generationConfig?.speechConfig?.voiceConfig?.prebuiltVoiceConfig?.voiceName });
      check('장면 길이 = 읽을 문장 글자 수 비율(3초+0.4)', durRatioOk(v.durations, v.nars, TTS_SEC + 0.4), { durations: v.durations, lens: v.nars.map((n) => n.length) });
      check('④ 목소리 고른 값이 소리 패널 내레이션 설정과 같음(Puck)', v.ttsVoice === 'Puck', v.ttsVoice);
      check('진행 표시 ④ 끝', v.step4 === 'done');
    }

    // ═══ (E1) 일레븐랩스·Fish Audio 탭(키는 앱과 같은 keys.js 로 넣음) ═══
    {
      await page.evaluate(async () => { const k = await import('/js/keys.js'); k.setKey('elevenlabs', 'sk_listing_eleven_0004'); k.setKey('fish', 'fish-listing-key-0005'); });
      await page.click('#lsTab-elevenlabs');
      await page.fill('#lsElVoice', 'voiceListing01');
      await page.click('#lsElRun');
      await page.waitForFunction(() => /^완성|못|없/.test(document.querySelector('#lsVoiceStatus').textContent) && !document.querySelector('#lsElRun').disabled, null, { timeout: 20000 });
      const el = await page.evaluate(() => ({ status: document.querySelector('#lsVoiceStatus').textContent, audio: document.querySelector('#audioInfo').textContent }));
      const ec = report.info.elevenCall || {};
      check('일레븐랩스 탭: Voice ID·키·읽을 문장으로 → 내레이션 (일레븐랩스)', /^완성/.test(el.status) && /내레이션 \(일레븐랩스\)/.test(el.audio) && /\/v1\/text-to-speech\/voiceListing01\?/.test(ec.url || '') && ec.key && /^현관문을 열면/.test(ec.text || ''), { el, ec });
      await page.click('#lsTab-fish');
      const fishVoice = await page.$eval('#lsFishVoice', (i) => i.value);
      await page.click('#lsFishRun');
      await page.waitForFunction(() => /^완성|못|없/.test(document.querySelector('#lsVoiceStatus').textContent) && !document.querySelector('#lsFishRun').disabled, null, { timeout: 20000 });
      const fs2 = await page.evaluate(() => ({ status: document.querySelector('#lsVoiceStatus').textContent, audio: document.querySelector('#audioInfo').textContent }));
      const fc = report.info.fishCall || {};
      check('Fish Audio 탭: 기본 「밝은 고상철」·drama-3·키 → 내레이션 (Fish Audio)', /^완성/.test(fs2.status) && /내레이션 \(Fish Audio\)/.test(fs2.audio) && fishVoice === '440b9066d8d64a988638af6e2820dc4b' && fc.voice === fishVoice && fc.model === 'drama-3' && fc.key === 'fish-listing-key-0005' && fc.provider === 'fish', { fs2, fc: { ...fc, text: undefined, key: fc.key ? '(있음)' : '' } });
      await page.click('#lsTab-gemini');
    }

    // ═══ (E2) 내 목소리 녹음(가짜 마이크) ═══
    {
      await page.click('#lsTab-record');
      const reader = await page.evaluate(() => ({ lines: document.querySelectorAll('#lsReader p').length, text: document.querySelector('#lsReader').textContent, font: parseFloat(getComputedStyle(document.querySelector('#lsReader')).fontSize), pane: !document.querySelector('#lsPane-record').hidden }));
      check('녹음 탭: 읽기 화면에 대본 3줄을 크게(≥19px)', reader.pane && reader.lines === 3 && reader.text.includes('현관문을 열면') && reader.font >= 19, reader);
      // '크게 보기'가 화면을 꽉 채우고(조상 상자의 남은 애니메이션 transform·filter 와 상관없이) 작게 보기·멈춤 버튼이 화면 안에 있는지
      {
        await page.$eval('#lsRecFull', (b) => b.scrollIntoView({ block: 'center' }));
        const y0 = await page.evaluate(() => scrollY);
        await page.click('#lsRecFull');
        await page.waitForTimeout(250);
        const f = await page.evaluate(() => {
          const r = document.querySelector('#lsPane-record').getBoundingClientRect();
          const on = (id) => { const b = document.querySelector(id).getBoundingClientRect(); return b.width > 0 && b.top >= 0 && b.bottom <= innerHeight && b.left >= 0 && b.right <= innerWidth; };
          const lb = getComputedStyle(document.querySelector('#listingBox'));
          return { rect: [r.left, r.top, r.width, r.height].map(Math.round), vw: innerWidth, vh: innerHeight, full: on('#lsRecFull'), stop: on('#lsRecStop'), start: on('#lsRecStart'), boxTransform: lb.transform, boxFilter: lb.filter };
        });
        check("'크게 보기' = 화면 전체(0,0,폭,높이)·작게 보기·멈춤·녹음 버튼이 화면 안", f.rect.join() === [0, 0, f.vw, f.vh].join() && f.full && f.stop && f.start, f);
        check('들어올 때 애니메이션이 끝난 뒤 매물 상자에 transform·filter 가 남지 않음', f.boxTransform === 'none' && (f.boxFilter === 'none' || f.boxFilter === ''), f);
        await page.click('#lsRecFull');
        await page.waitForTimeout(250);
        const back = await page.evaluate(() => ({ y: scrollY, inBox: !!document.querySelector('#listingBox #lsPane-record'), cls: document.documentElement.className }));
        check("'작게 보기' → 제자리로·스크롤 위치 그대로·페이지 스크롤 잠금 풀림", back.inBox && Math.abs(back.y - y0) <= 2 && !/ls-reading/.test(back.cls), { y0, back });
      }
      await page.click('#lsRecStart');
      await page.waitForFunction(() => document.querySelector('#lsRecStart').getAttribute('aria-pressed') === 'true', null, { timeout: 8000 });
      let maxLevel = 0;
      for (let i = 0; i < 12; i++) {
        await page.waitForTimeout(200);
        const lv = await page.$eval('#lsRecMeter', (el) => Number((/scaleX\(([\d.]+)\)/.exec(el.style.transform) || [])[1] || 0));
        maxLevel = Math.max(maxLevel, lv);
      }
      const during = await page.evaluate(() => ({ pressed: document.querySelector('#lsRecStart').getAttribute('aria-pressed'), stop: !document.querySelector('#lsRecStop').disabled, time: document.querySelector('#lsRecTime').textContent }));
      check('녹음 중: aria-pressed=true·멈춤 버튼 켜짐·시간 흐름', during.pressed === 'true' && during.stop && during.time !== '00:00.0', during);
      check('녹음 중 소리 크기 막대가 움직임', maxLevel > 0, maxLevel);
      await page.click('#lsRecStop');
      await page.waitForFunction(() => /녹음 .*초|못|다시/.test(document.querySelector('#lsVoiceStatus').textContent) && document.querySelector('#lsRecStart').getAttribute('aria-pressed') === 'false' && !/다듬는 중/.test(document.querySelector('#lsVoiceStatus').textContent), null, { timeout: 15000 });
      const r = await page.evaluate(() => ({
        status: document.querySelector('#lsVoiceStatus').textContent,
        audioInfo: document.querySelector('#audioInfo').textContent,
        play: !document.querySelector('#lsRecPlay').disabled,
        durations: [...document.querySelectorAll('#sceneList .scene input[type=number]')].map((i) => Number(i.value)),
        nars: [...document.querySelectorAll('#lsScript li textarea')].map((t) => t.value),
        save: !document.querySelector('#ttsSave').hidden,
      }));
      report.info.record = r;
      const narSec = Number((/내레이션 \(내 목소리\) \((\d+):(\d+(?:\.\d)?)\)/.exec(r.audioInfo) || []).slice(1).reduce((a, x, i) => (i === 0 ? Number(x) * 60 : a + Number(x)), 0));
      check('녹음 → 내레이션 (내 목소리)·듣기 켜짐·파일로 저장 켜짐', /내레이션 \(내 목소리\)/.test(r.audioInfo) && r.play && r.save && /앞뒤 무음/.test(r.status), { status: r.status, audioInfo: r.audioInfo });
      check('녹음 후 장면 길이 다시 맞춤(읽을 문장 비율)', narSec > 0.3 && durRatioOk(r.durations, r.nars, narSec + 0.4), { narSec, durations: r.durations });
      await page.screenshot({ path: path.join(OUT, '04-record.png') });
      // 녹음한 뒤 읽을 문장을 고치면 목소리는 '예전 대본' → ④가 다시 차례, 되돌리면 다시 끝
      {
        const nar0 = await page.$eval('#lsScript li textarea', (t) => t.value);
        await page.fill('#lsScript li textarea', `${nar0} 한 문장 더.`);
        await page.waitForTimeout(150);
        const st = await page.evaluate(() => ({ step4: document.querySelector('#lsProgress li[data-step="4"]').dataset.state, voice: document.querySelector('#lsVoiceStatus').textContent, bad: document.querySelector('#lsVoiceStatus').classList.contains('bad') }));
        check('목소리를 만든 뒤 읽을 문장을 고치면 ④ 미완료·"대본이 바뀌었습니다" 안내', st.step4 === 'current' && st.bad && /대본이 바뀌었습니다/.test(st.voice), st);
        await page.fill('#lsScript li textarea', nar0);
        await page.waitForTimeout(150);
        check('읽을 문장을 되돌리면 ④ 다시 끝', (await page.$eval('#lsProgress li[data-step="4"]', (el) => el.dataset.state)) === 'done');
      }
      await page.click('#lsTab-gemini');
    }

    // ═══ (F) ⑤ 영상(장면 0.5초·720p) ═══
    const shortenAndExport = async () => {
      await page.evaluate(() => {
        document.querySelectorAll('#sceneList input[type=number]').forEach((i) => { i.value = '0.5'; i.dispatchEvent(new Event('input')); });
        const e = document.querySelector('#endingDur'); e.value = '1'; e.dispatchEvent(new Event('input'));
        const q = document.querySelector('#quality'); q.value = '720'; q.dispatchEvent(new Event('input'));
      });
      await page.click('#lsExport');
      await page.waitForFunction(() => /완성:|못했습니다|멈췄/.test(document.querySelector('#lsExportStatus').textContent) && !/만들기 멈춤/.test(document.querySelector('#lsExport').textContent), null, { timeout: 40000 });
      return page.evaluate(async () => {
        const v = document.querySelector('#resultVideo');
        const size = v.src ? (await (await fetch(v.src)).blob()).size : 0;
        return { status: document.querySelector('#lsExportStatus').textContent, main: document.querySelector('#exportStatus').textContent, size, resultVisible: !document.querySelector('#exportResult').hidden, save: !document.querySelector('#lsSave').disabled, send: !document.querySelector('#lsSend').disabled, warn: !document.querySelector('#lsSendWarn').hidden, step5: document.querySelector('#lsProgress li[data-step="5"]').dataset.state };
      });
    };
    let videoSize = 0;
    {
      const e = await shortenAndExport();
      report.info.export916 = e;
      videoSize = e.size;
      check('⑤ 영상 만들기 → 완성 720×1280·결과 영상', /^완성: (MP4|WEBM) · 720×1280/.test(e.status) && e.resultVisible && e.size > 1000, e);
      check('⑥ 영상 저장·대시보드 보내기 버튼 켜짐(ko372.com 게이트), 9:16 이라 경고 없음', e.save && e.send && !e.warn && e.step5 === 'done', e);
    }

    // ═══ (G) ⑥ 대시보드로 보내기 ═══
    {
      // 업로드 글 복사: 다 채웠으면 '필수 표시 항목 포함'
      await page.click('#lsCopy');
      await page.waitForFunction(() => /복사/.test(document.querySelector('#lsSendStatus').textContent), null, { timeout: 5000 }).catch(() => {});
      const cp = await page.evaluate(() => ({ t: document.querySelector('#lsSendStatus').textContent, ok: document.querySelector('#lsSendStatus').classList.contains('ok') }));
      const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
      check('업로드 글 복사(다 채움) → "필수 표시 항목 포함"·복사한 글에 등록번호·관리비 줄', cp.ok && /필수 표시 항목 포함/.test(cp.t) && clip.includes('등록번호: 41117-2026-00001') && clip.includes('관리비: 월 25만 원(난방 별도)'), { cp, clip: clip.slice(0, 80) });
      // 등록번호를 비우면: 복사는 빠진 항목을 알리고, 보내기는 한 번 알린 뒤 '그래도 보내기'
      await page.fill('#lsOfReg', '');
      await page.click('#lsCopy');
      await page.waitForTimeout(300);
      const cp2 = await page.evaluate(() => ({ t: document.querySelector('#lsSendStatus').textContent, bad: document.querySelector('#lsSendStatus').classList.contains('bad') }));
      check('등록번호 비우고 복사 → "빠진 표시 항목: 등록번호"', cp2.bad && /빠진 표시 항목: 등록번호/.test(cp2.t), cp2);
      const pagesBefore = ctx.pages().length;
      await page.click('#lsSend');
      await page.waitForTimeout(500);
      const w1 = await page.evaluate(() => ({ t: document.querySelector('#lsSendStatus').textContent, bad: document.querySelector('#lsSendStatus').classList.contains('bad'), btn: document.querySelector('#lsSend').textContent }));
      check('빠진 표시 항목이 있으면 보내기 첫 번째 누름은 창을 열지 않고 알림·"그래도 보내기"', ctx.pages().length === pagesBefore && w1.bad && /등록번호/.test(w1.t) && /그래도 보내기/.test(w1.btn), w1);
      await page.fill('#lsOfReg', OFFICE.lsOfReg);
      await page.waitForTimeout(100);
      check('항목을 채우면 버튼 글자가 원래대로', /업무 대시보드로 보내기/.test(await page.$eval('#lsSend', (b) => b.textContent)));
      const [popup] = await Promise.all([page.waitForEvent('popup', { timeout: 10000 }), page.click('#lsSend')]);
      await page.waitForFunction(() => /담았습니다|못|없|막혔|닫혔/.test(document.querySelector('#lsSendStatus').textContent), null, { timeout: 15000 });
      const got = await popup.evaluate(() => window.__got);
      const status = await page.$eval('#lsSendStatus', (el) => el.textContent);
      const m = (got || []).find((g) => g.type === 'mrk-outbox-post');
      report.info.dashboard = { status, url: popup.url(), got: (got || []).map((g) => ({ ...g, payload: g.payload && { ...g.payload, texts: Object.fromEntries(Object.entries(g.payload.texts || {}).map(([k, v]) => [k, `${String(v).length}자`])) } })) };
      check('대시보드 새 창: 주소 #mrkpost', popup.url() === `${DASH}/#mrkpost`, popup.url());
      check('대시보드가 mrk-outbox-post 한 번 받음 → ok → 상태 "담았습니다"', !!m && got.filter((g) => g.type === 'mrk-outbox-post').length === 1 && /담았습니다/.test(status), status);
      if (m) {
        const p = m.payload || {};
        check('메시지 필드 순서·이름 = social-make.js (type, payload, images, video, videoName)', m.keys.join() === 'type,payload,images,video,videoName', m.keys);
        check('payload: from "MR.K 영상만들기"·kind video·필드 순서', p.from === 'MR.K 영상만들기' && p.kind === 'video' && Object.keys(p).join() === 'from,kind,title,desc,tags,texts', Object.keys(p));
        check('texts 키 = youtube, clip, blog, insta, threads, tiktok', Object.keys(p.texts || {}).join() === 'youtube,clip,blog,insta,threads,tiktok', Object.keys(p.texts || {}));
        check('영상 Blob 크기 = 만든 영상 크기', m.videoIsBlob && m.videoSize === videoSize && m.videoSize > 1000, { got: m.videoSize, made: videoSize });
        check('videoName = 제목.mp4/webm', /\.(mp4|webm)$/.test(m.videoName || '') && /수원 이의동/.test(m.videoName), m.videoName);
        check('글자 수 한도: desc·clip ≤ 300, threads ≤ 500', p.desc.length <= 300 && p.texts.clip.length <= 300 && p.texts.threads.length <= 500, { desc: p.desc.length, clip: p.texts.clip.length, threads: p.texts.threads.length });
        check('필수 표시 줄이 잘리지 않고 desc·clip·threads·youtube·insta·tiktok 끝에', ['desc', 'clip', 'threads'].map((k) => (k === 'desc' ? p.desc : p.texts[k])).concat([p.texts.youtube, p.texts.insta, p.texts.tiktok]).every((t) => t.includes('등록번호: 41117-2026-00001') && t.includes('층수(해당 층/총 층): 12층/20층') && t.trimEnd().endsWith('관리비: 월 25만 원(난방 별도)')));
        check('tags 는 # 없는 낱말', Array.isArray(p.tags) && p.tags.length >= 3 && p.tags.every((t) => !t.startsWith('#')) && p.tags.includes('수원아파트'), p.tags);
        check('blog = 장면 자막 + 설명', p.texts.blog.startsWith('G2 문 열자마자 남향 햇살 가득') && p.texts.blog.includes('바로 입주하기 좋습니다'), p.texts.blog.slice(0, 60));
        check('title = 유튜브 제목', p.title === 'G2 수원 이의동 남향 올수리 아파트', p.title);
        check('보낸 메시지에 AI 키 없음', !JSON.stringify(m).includes(KEYS.gemini) && !JSON.stringify(m).includes(KEYS.claude) && !JSON.stringify(m).includes(KEYS.openai));
      }
      check('진행 표시 ⑥ 끝', (await page.$eval('#lsProgress li[data-step="6"]', (el) => el.dataset.state)) === 'done');
      await page.screenshot({ path: path.join(OUT, '05-sent.png') });
      await popup.close();
      // 대시보드가 거절하면 한국어 안내
      dashMode = 'fail';
      const [p2] = await Promise.all([page.waitForEvent('popup', { timeout: 10000 }), page.click('#lsSend')]);
      await page.waitForFunction(() => document.querySelector('#lsSendStatus').classList.contains('bad'), null, { timeout: 15000 });
      const failMsg = await page.$eval('#lsSendStatus', (el) => el.textContent);
      check('대시보드 거절(mrk-outbox-fail) → 한국어 안내·버튼 다시 켜짐', /받지 못했습니다/.test(failMsg) && /로그인/.test(failMsg) && !(await page.$eval('#lsSend', (b) => b.disabled)), failMsg);
      await p2.close();
      // 대시보드 창을 닫아 버리면 3분을 기다리지 않고 알려 줌
      dashMode = 'silent';
      const [p3] = await Promise.all([page.waitForEvent('popup', { timeout: 10000 }), page.click('#lsSend')]);
      await page.waitForTimeout(500);
      await p3.close();
      await page.waitForFunction(() => /닫혔습니다/.test(document.querySelector('#lsSendStatus').textContent), null, { timeout: 6000 }).catch(() => {});
      const closedMsg = await page.$eval('#lsSendStatus', (el) => el.textContent);
      check('대시보드 창을 닫으면 바로 "창이 닫혔습니다" 안내', /창이 닫혔습니다/.test(closedMsg), closedMsg);
      dashMode = 'ok';
    }

    // ═══ (H) 16:9 로 같은 흐름 한 번 더 ═══
    {
      await page.selectOption('#lsAspect', '16:9');
      await page.waitForTimeout(200);
      const a = await page.evaluate(() => ({ warn: !document.querySelector('#lsAspectWarn').hidden, warnText: document.querySelector('#lsAspectWarn').textContent, aspect: document.querySelector('#aspect').value, w: document.querySelector('#previewCanvas').width, h: document.querySelector('#previewCanvas').height }));
      check('16:9 고르면 세부 조절 화면 비율·미리보기도 가로', a.aspect === '16:9' && a.w > a.h, a);
      check('16:9 경고 문구: 릴스·틱톡은 세로(9:16) 권장', a.warn && /인스타 릴스·틱톡은 세로\(9:16\)를 권장/.test(a.warnText), a.warnText);
      llmTag.gemini = 'W1';
      const before = report.calls.gemini.length;
      await page.click('#lsGen');
      await waitGen();
      const s = await sceneState();
      check('16:9: 대본 다시 만들기(제미나이)', s.captions.every((c) => c.startsWith('W1')) && report.calls.gemini.length === before + 1, s.captions);
      const lastPrompt = (report.calls.gemini.at(-1)?.body?.contents?.[0]?.parts || []).map((p) => p.text || '').join('\n');
      check('16:9: 프롬프트에 가로 영상(16:9) 안내', /가로 영상\(16:9/.test(lastPrompt));
      const ttsBefore = report.calls.geminiTts.length;
      ttsFormat = 'l16'; // 옛 모델(audio/L16 PCM) 응답도 한 번 확인
      await page.click('#lsGemRun');
      await page.waitForFunction(() => /^완성|못|없/.test(document.querySelector('#lsVoiceStatus').textContent) && !document.querySelector('#lsGemRun').disabled, null, { timeout: 20000 });
      const vs = await page.$eval('#lsVoiceStatus', (el) => el.textContent);
      check('16:9: 목소리 다시 만들기(옛 audio/L16 형식 응답)', /^완성/.test(vs) && report.calls.geminiTts.length === ttsBefore + 1, vs);
      ttsFormat = 'wav';
      const e = await shortenAndExport();
      report.info.export169 = e;
      check('16:9: 영상 완성 1280×720', /^완성: (MP4|WEBM) · 1280×720/.test(e.status) && e.size > 1000, e.status);
      const w = await page.evaluate(() => ({ warn: !document.querySelector('#lsSendWarn').hidden, text: document.querySelector('#lsSendWarn').textContent, send: document.querySelector('#lsSendStatus').textContent, step6: document.querySelector('#lsProgress li[data-step="6"]').dataset.state }));
      check('16:9 영상: 보내기 전에 "세로(9:16) 권장" 경고가 보임', w.warn && /인스타 릴스·틱톡은 세로\(9:16\)를 권장/.test(w.text), w);
      check('새 영상을 만들면 ⑥ "담았습니다" 안내·완료 표시가 지워짐', !/담았습니다/.test(w.send) && w.step6 === 'current', w);
      await page.screenshot({ path: path.join(OUT, '06-wide.png') });
      await page.selectOption('#lsAspect', '9:16');
    }

    // ═══ (I) 프로젝트 저장 → 다시 열기 ═══
    {
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.click('#projSaveBtn')]);
      const file = path.join(OUT, 'project.json');
      await dl.saveAs(file);
      const raw = fs.readFileSync(file, 'utf8');
      const data = JSON.parse(raw);
      check('프로젝트 .json: 매물 정보·중개사무소', data.listing?.facts?.price === '5억 2천' && data.listing?.office?.regNo === OFFICE.lsOfReg, data.listing);
      check('프로젝트 .json: 장면 narration', (data.scenes || []).length === 3 && data.scenes.every((s) => typeof s.narration === 'string' && s.narration.length > 5));
      check('프로젝트 .json 어디에도 AI 키 없음', !raw.includes(KEYS.gemini) && !raw.includes(KEYS.claude) && !raw.includes(KEYS.openai) && !/mrkv|apiKey|"keys"/.test(raw));
      // 정보 칸을 비운 뒤 다시 열면 돌아오는지
      await page.fill('#lsPrice', '');
      await page.setInputFiles('#projFile', file);
      await page.waitForFunction(() => document.querySelector('#lsPrice').value === '5억 2천', null, { timeout: 10000 }).catch(() => {});
      const back = await page.evaluate(() => ({ price: document.querySelector('#lsPrice').value, lines: document.querySelectorAll('#lsScript li').length, nar: document.querySelector('#lsScript li textarea')?.value || '' }));
      check('프로젝트 다시 열기: 매물 정보·읽을 문장 복원', back.price === '5억 2천' && back.lines === 3 && back.nar.startsWith('현관문을 열면'), back);
      const cleared = await page.evaluate(() => ({
        audio: document.querySelector('#audioInfo').textContent, result: !document.querySelector('#exportResult').hidden, send: !document.querySelector('#lsSend').disabled,
        save: !document.querySelector('#lsSave').disabled, steps: [...document.querySelectorAll('#lsProgress li')].map((l) => l.dataset.state).join(','),
      }));
      check('프로젝트를 열면 앞 내레이션·결과 영상을 버림(④⑤ 미완료·보내기 꺼짐)', !/내레이션/.test(cleared.audio) && !cleared.result && !cleared.send && !cleared.save && /done,(done|skip),done,current,todo,todo/.test(cleared.steps), cleared);
    }

    // ═══ (J) 접근성 ═══
    {
      const a = await page.evaluate(() => {
        const box = document.querySelector('#listingBox');
        const steps = [...box.querySelectorAll('.ls-step')];
        const fields = [...box.querySelectorAll('input:not([type=file]), select, textarea')].filter((el) => el.offsetParent || el.closest('details'));
        const unlabeled = fields.filter((el) => !(el.labels?.length || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby'))).map((el) => el.id || el.tagName);
        const keyFields = [...document.querySelectorAll('#aiKeys input')].filter((el) => !(el.labels?.length || el.getAttribute('aria-label'))).map((el) => el.id);
        return {
          headings: steps.map((s) => !!s.querySelector('h3') && s.getAttribute('aria-labelledby') === s.querySelector('h3').id),
          unlabeled, keyFields,
          live: ['lsGenStatus', 'lsVoiceStatus', 'lsExportStatus', 'lsSendStatus'].map((id) => document.getElementById(id).getAttribute('aria-live')),
          recPressed: document.querySelector('#lsRecStart').hasAttribute('aria-pressed'),
          tablist: !!box.querySelector('[role=tablist]') && [...box.querySelectorAll('[role=tab]')].every((t) => document.getElementById(t.getAttribute('aria-controls'))?.getAttribute('role') === 'tabpanel'),
        };
      });
      check('단계 제목 heading(h3)·aria-labelledby', a.headings.length === 6 && a.headings.every(Boolean), a.headings);
      check('매물 상자·키 칸 입력에 모두 label', !a.unlabeled.length && !a.keyFields.length, { unlabeled: a.unlabeled, keyFields: a.keyFields });
      check('상태 칸 aria-live=polite', a.live.every((v) => v === 'polite'), a.live);
      check('녹음 버튼 aria-pressed·탭 role 연결', a.recPressed && a.tablist);
      // 탭 키보드 이동
      await page.focus('#lsTab-gemini');
      await page.keyboard.press('ArrowRight');
      const kb = await page.evaluate(() => ({ sel: document.querySelector('#lsTab-record').getAttribute('aria-selected'), focus: document.activeElement?.id }));
      check('탭: → 키로 다음 탭 선택·초점', kb.sel === 'true' && kb.focus === 'lsTab-record', kb);
      await page.click('#lsTab-gemini');
    }

    // ═══ (J2) 400px·다크 ═══
    {
      await page.setViewportSize({ width: 400, height: 860 });
      await page.waitForTimeout(300);
      await page.evaluate(() => { document.querySelector('#keyToggle').getAttribute('aria-expanded') === 'false' && document.querySelector('#keyToggle').click(); document.querySelector('#lsInfo').open = true; });
      await page.waitForTimeout(300);
      const m = await page.evaluate(() => ({
        sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
        wide: [...document.querySelectorAll('#aiKeys *, #listingBox *')].filter((el) => el.offsetParent && el.getBoundingClientRect().right > innerWidth + 1).map((el) => `${el.tagName.toLowerCase()}#${el.id}.${el.className}`).slice(0, 8),
      }));
      report.info.mobile = m;
      check('400px: 가로 넘침 없음(키 칸·매물 상자 펼친 상태)', m.sw <= m.cw && !m.wide.length, m);
      await page.$eval('#aiKeys', (el) => el.scrollIntoView());
      await page.screenshot({ path: path.join(OUT, '07-mobile-keys.png') });
      await page.$eval('#listingBox', (el) => el.scrollIntoView());
      await page.screenshot({ path: path.join(OUT, '08-mobile-listing.png'), fullPage: false });
      await page.$eval('#listingBox .ls-step[data-step="4"]', (el) => el.scrollIntoView());
      await page.screenshot({ path: path.join(OUT, '09-mobile-voice.png'), fullPage: false });
    }
    await page.close();

    // 다크 모드(새 탭 — 키는 기억 끔이라 새 컨텍스트에는 없음)
    {
      const dctx = await browser.newContext({ viewport: { width: 400, height: 860 }, colorScheme: 'dark' });
      await dctx.route('**/api/health', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ai: false, proxy: true, tts: true, gate: true }) }));
      const dp = await dctx.newPage();
      dp.on('pageerror', (e) => report.consoleErrors.push(`dark pageerror: ${e.message}`));
      await dp.goto(`${BASE}/#shorts`, { waitUntil: 'load' });
      await dp.waitForFunction(() => document.querySelectorAll('#sceneList .scene').length > 0, null, { timeout: 20000 });
      await dp.waitForTimeout(500);
      const d = await dp.evaluate(() => ({
        bg: getComputedStyle(document.querySelector('#listingBox')).backgroundColor,
        chips: document.querySelector('#keyChips').textContent,
        sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
      }));
      report.info.dark = d;
      check('다크: 매물 상자 어두운 바탕·새 탭에는 키 없음(기억 끔)', d.bg === 'rgb(22, 27, 38)' && /AI 키를 넣으면/.test(d.chips) && d.sw <= d.cw, d);
      await dp.click('#keyToggle');
      await dp.$eval('#aiKeys', (el) => el.scrollIntoView());
      await dp.screenshot({ path: path.join(OUT, '10-dark-keys.png') });
      await dp.$eval('#listingBox', (el) => el.scrollIntoView());
      await dp.screenshot({ path: path.join(OUT, '11-dark-listing.png') });
      // 사용 안내 화면의 'AI 키 칸에 키 넣기' 링크 → 숏폼 화면으로 옮겨 키 칸을 펼치고 제미나이 칸에 커서
      await dp.goto(`${BASE}/#guide`, { waitUntil: 'load' });
      await dp.waitForTimeout(1200);
      await dp.click('.guide-keys a[data-open-keys]');
      await dp.waitForFunction(() => document.activeElement?.id === 'key-gemini', null, { timeout: 6000 }).catch(() => {});
      const g = await dp.evaluate(() => ({ hash: location.hash, shorts: !document.querySelector('#view-shorts').hidden, guide: !document.querySelector('#view-guide').hidden, expanded: document.querySelector('#keyToggle').getAttribute('aria-expanded'), focus: document.activeElement?.id }));
      check('사용 안내의 키 링크 → 숏폼 화면·키 칸 펼침·제미나이 칸 커서', g.hash === '#shorts' && g.shorts && !g.guide && g.expanded === 'true' && g.focus === 'key-gemini', g);
      await dctx.close();
    }
    await ctx.close();
  } catch (e) {
    check('점검 실행 중 예외 없음', false, e.stack || e.message);
  } finally {
    await browser.close();
  }
  check('콘솔 오류 0', report.consoleErrors.length === 0, report.consoleErrors);
  report.checks = checks.map((c) => `${c.ok ? 'OK' : 'NG'} ${c.name}`);
  report.failed = checks.filter((c) => !c.ok);
  report.ok = !report.failed.length;
  const pass = checks.length - report.failed.length;
  report.counts = { total: checks.length, pass, fail: report.failed.length };
  report.calls = { gemini: report.calls.gemini.length, geminiTts: report.calls.geminiTts.length, claude: report.calls.claude.length, openai: report.calls.openai.length, eleven: report.calls.eleven || 0, fish: report.calls.fish };
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`\nlisting-flow: ${pass}/${checks.length} 통과 · 요청 ${JSON.stringify(report.calls)} · 예상된 404 ${report.expected404.length}건`);
  process.exit(report.ok ? 0 : 1);
})();
