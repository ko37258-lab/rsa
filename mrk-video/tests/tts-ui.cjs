// 내레이션 만들기 화면 점검(Playwright). 세 서비스 엔드포인트와 /api/* 를 모의 응답으로 막고 #shorts 에서
//  (a) 서비스 전환 시 목소리 칸(select/글자 칸)·엔진 칸·키 힌트가 바뀌고 Fish 기본 음성 ID 가 채워짐
//  (b) 대본 기본값 = 장면 자막(별표 없음)
//  (c) 각 서비스로 "음성 만들기" → #audioInfo 에 "내레이션 (…)" 과 길이, #fitToNarr 활성, #ttsSave 보임
//  (d) 키는 맨 위 'AI 키' 칸(#aiKeys, js/keys.js)에서 넣음 — 상자 안 키 칸은 없고 키 칸으로 가는 링크·키 상태 칩만 있음.
//      키 없이 누르면 안내 + 키 칸이 펼쳐짐. "이 브라우저에 기억"(#keyRemember) 끄면 localStorage 에 키 없음 · 켜면 있음 · 다시 끄면 없음
//  (e) 모바일 400px 에서 가로 넘침 없음(상자 연 상태)
//  (f) 콘솔 오류 0 (정적 서버에 없는 예시 사진 404 는 예상된 것)
// 결과: tests/out/tts/report.json + 스크린샷. 종료 코드 0/1. 정적 서버가 http://127.0.0.1:5173/ 에 떠 있어야 합니다.
//   LANG=C.UTF-8 node tests/tts-ui.cjs

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { chromium } = require('/opt/node-tools/node_modules/playwright');

const BASE = process.env.MRK_BASE || 'http://127.0.0.1:5173';
const OUT = path.join(__dirname, 'out', 'tts');
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const KEYS = { gemini: 'AIza-test-gemini-key-0001', elevenlabs: 'sk_eleven_test_key_0002', fish: 'fish-test-key-0003' };
const FISH_DEFAULT_VOICE = '440b9066d8d64a988638af6e2820dc4b';

// 정적 서버엔 없는 것들: 예시 사진(없으면 그림으로 대체) 404 는 예상된 것. /api/* 는 이 테스트가 모의 응답으로 막는다.
const EXPECTED_404 = /\/assets\/samples\/[^/]+\.jpg$/;

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

/** ffmpeg 로 0.5초 사인파 mp3 를 만들어 바이트로 돌려줍니다(일레븐랩스·Fish 모의 응답). */
function makeMp3() {
  const file = path.join(OUT, 'mock.mp3');
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.5', '-ar', '44100', '-ac', '1', '-b:a', '64k', file], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg mp3 실패: ${r.stderr}`);
  return fs.readFileSync(file);
}
/** 0.5초 24kHz PCM16 사인파 → base64 (제미나이 모의 응답의 inlineData.data) */
function makePcmB64() {
  const rate = 24000;
  const n = Math.round(rate * 0.5);
  const buf = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 12000), i * 2);
  return buf.toString('base64');
}

/** PCM16(base64)에 WAV(RIFF) 머리를 붙여 base64 로 — 제미나이 3.8 TTS 는 한 번 요청에 audio/wav 를 기본으로 돌려줍니다(speech-generation 문서) */
function wavB64(pcm64, rate = 24000) {
  const pcm = Buffer.from(pcm64, 'base64');
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]).toString('base64');
}
// 제미나이 목소리 모의 형식: 기본 'wav'(실제와 같음), 옛 모델 대비로 한 번만 'l16'(audio/L16 PCM)
let geminiFormat = 'wav';

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, GET, OPTIONS' };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const mp3 = makeMp3();
  const pcmB64 = makePcmB64();
  const browser = await chromium.launch({ executablePath: EXE, args: ['--autoplay-policy=no-user-gesture-required'] });
  const report = { ok: true, problems: [], consoleErrors: [], expected404: [], providers: {}, script: null, runs: {}, remember: {}, mobile: null, calls: { gemini: [], elevenlabs: [], fish: [], health: 0 } };
  const problem = (s) => report.problems.push(s);
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    watch(page, report.consoleErrors, report.expected404);

    // ── 모의 응답 ──
    await page.route('**/api/health', (route) => {
      report.calls.health++;
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ai: false, proxy: true, needsCode: false, youtube: false, tts: true }) });
    });
    await page.route('**/api/tts', (route) => {
      const rq = route.request();
      report.calls.fish.push({ method: rq.method(), headers: rq.headers(), body: rq.postDataJSON() });
      route.fulfill({ status: 200, contentType: 'audio/mpeg', body: mp3 });
    });
    await page.route('https://generativelanguage.googleapis.com/**', (route) => {
      const rq = route.request();
      if (rq.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      report.calls.gemini.push({ url: rq.url(), headers: rq.headers(), body: rq.postDataJSON() });
      return route.fulfill({
        status: 200, contentType: 'application/json', headers: CORS,
        body: JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: geminiFormat === 'l16' ? { mimeType: 'audio/L16;codec=pcm;rate=24000', data: pcmB64 } : { mimeType: 'audio/wav', data: wavB64(pcmB64) } }] } }] }),
      });
    });
    await page.route('https://api.elevenlabs.io/**', (route) => {
      const rq = route.request();
      if (rq.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      report.calls.elevenlabs.push({ url: rq.url(), headers: rq.headers(), body: rq.postDataJSON() });
      return route.fulfill({ status: 200, contentType: 'audio/mpeg', headers: CORS, body: mp3 });
    });

    await page.goto(`${BASE}/#shorts`, { waitUntil: 'load' });
    await page.waitForFunction(
      () => document.querySelectorAll('#styleStrip .style-card').length > 0 && document.querySelectorAll('#sceneList .scene').length > 0,
      null, { timeout: 20000 },
    );
    await page.waitForTimeout(500);
    await page.$eval('#ttsBox', (el) => { el.open = true; });

    const pick = async (id) => {
      await page.selectOption('#ttsProvider', id);
      await page.waitForTimeout(80);
    };
    const snapshot = () => page.evaluate(() => {
      const v = document.querySelector('#ttsVoice');
      const m = document.querySelector('#ttsModel');
      return {
        voiceTag: v?.tagName, voiceType: v?.type || '', voiceValue: v?.value || '', voiceOptions: v?.tagName === 'SELECT' ? v.options.length : 0,
        voicePlaceholder: v?.placeholder || '', voiceLabel: document.querySelector('#l-ttsVoice')?.textContent || '',
        modelHidden: !!document.querySelector('#ttsModelField')?.hidden, modelVisible: !!(document.querySelector('#ttsModelField')?.offsetParent),
        modelOptions: [...(m?.options || [])].map((o) => o.value), modelValue: m?.value || '',
        keyHint: document.querySelector('#ttsKeyHint')?.textContent || '',
        speedHint: document.querySelector('#ttsSpeedHint')?.textContent || '',
        status: document.querySelector('#ttsStatus')?.textContent || '',
      };
    });

    // ── (a) 서비스 전환 ──
    await pick('gemini');
    const g = await snapshot();
    report.providers.gemini = g;
    if (g.voiceTag !== 'SELECT' || g.voiceOptions !== 8) problem(`제미나이 목소리 칸이 select 8개가 아님: ${g.voiceTag} ${g.voiceOptions}`);
    if (!g.modelHidden || g.modelVisible) problem('제미나이에서 엔진 칸이 보임');
    if (!/AI Studio/.test(g.keyHint)) problem(`제미나이 키 힌트: "${g.keyHint}"`);
    if (!/Fish Audio/.test(g.speedHint)) problem('제미나이에서 속도 안내(Fish 에만 적용)가 없음');

    await pick('elevenlabs');
    const e = await snapshot();
    report.providers.elevenlabs = e;
    if (e.voiceTag !== 'INPUT' || e.voiceType !== 'text') problem(`일레븐랩스 목소리 칸이 글자 칸이 아님: ${e.voiceTag}/${e.voiceType}`);
    if (e.voiceLabel !== 'Voice ID') problem(`일레븐랩스 목소리 라벨: "${e.voiceLabel}"`);
    if (!e.modelHidden || e.modelVisible) problem('일레븐랩스에서 엔진 칸이 보임');
    if (!/elevenlabs\.io/.test(e.keyHint)) problem(`일레븐랩스 키 힌트: "${e.keyHint}"`);

    await pick('fish');
    const f = await snapshot();
    report.providers.fish = f;
    if (f.voiceTag !== 'INPUT') problem(`Fish 목소리 칸이 글자 칸이 아님: ${f.voiceTag}`);
    if (f.voiceValue !== FISH_DEFAULT_VOICE) problem(`Fish 기본 음성 ID 가 안 채워짐: "${f.voiceValue}"`);
    if (f.voiceLabel !== '음성 모델 ID') problem(`Fish 목소리 라벨: "${f.voiceLabel}"`);
    if (f.modelHidden || !f.modelVisible) problem('Fish 에서 엔진 칸이 안 보임');
    if (f.modelOptions.join(',') !== 'drama-3,s2.1-pro,s1' || f.modelValue !== 'drama-3') problem(`Fish 엔진 목록/기본값: ${f.modelOptions.join(',')} / ${f.modelValue}`);
    if (!/fish\.audio/.test(f.keyHint)) problem(`Fish 키 힌트: "${f.keyHint}"`);
    if (f.speedHint) problem(`Fish 에서 속도 안내가 남아 있음: "${f.speedHint}"`);
    if (f.status) problem(`서버 tts:true 인데 Fish 상태 칸에 안내가 떠 있음: "${f.status}"`);

    // ── (b) 대본 기본값 = 장면 자막(별표 없음) ──
    const script = await page.evaluate(async () => {
      const { SHORTS_CASE } = await import('/js/samples.js');
      const expect = SHORTS_CASE.scenes.map((s) => String(s.caption || '').replace(/\*/g, '').replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean).join('\n');
      return { value: document.querySelector('#ttsText').value, expect, scenes: document.querySelectorAll('#sceneList .scene').length };
    });
    report.script = { lines: script.value.split('\n').length, scenes: script.scenes, hasStar: /\*/.test(script.value), matches: script.value === script.expect, preview: script.value.slice(0, 80) };
    if (!script.value.trim()) problem('대본 기본값이 비어 있음');
    if (/\*/.test(script.value)) problem('대본 기본값에 별표(*)가 남아 있음');
    if (script.value !== script.expect) problem(`대본 기본값이 장면 자막과 다름:\n  got: ${script.value}\n  exp: ${script.expect}`);
    // "대본 다시 가져오기" — 손으로 고친 뒤 눌러도 되돌아온다
    await page.fill('#ttsText', '임시로 고친 글');
    await page.click('#ttsFromScenes');
    const refilled = await page.$eval('#ttsText', (el) => el.value);
    if (refilled !== script.expect) problem('"대본 다시 가져오기"가 장면 자막으로 되돌리지 않음');

    // ── (d-1) 키 칸은 맨 위로 옮겨짐: 상자 안 키 칸 없음, 링크·상태 칩, 키 없이 누르면 안내 + 키 칸 펼침 ──
    await pick('gemini');
    const moved = await page.evaluate(() => ({
      oldKey: !!document.querySelector('#ttsKey'), oldRemember: !!document.querySelector('#ttsRemember'),
      link: document.querySelector('#ttsBox [data-open-keys]')?.textContent || '', state: document.querySelector('#ttsKeyState')?.textContent || '',
    }));
    report.keyMoved = moved;
    if (moved.oldKey || moved.oldRemember) problem('내레이션 상자 안에 예전 키 칸(#ttsKey/#ttsRemember)이 남아 있음');
    if (!/AI 키 칸/.test(moved.link)) problem(`내레이션 상자에 'AI 키 칸' 링크가 없음: "${moved.link}"`);
    if (!/제미나이 키 없음/.test(moved.state)) problem(`키 없을 때 상태 칩: "${moved.state}"`);
    await page.click('#ttsRun');
    await page.waitForTimeout(400);
    const noKey = await page.evaluate(() => ({
      status: document.querySelector('#ttsStatus').textContent, expanded: document.querySelector('#keyToggle').getAttribute('aria-expanded'),
      focus: document.activeElement?.id || '',
    }));
    report.noKey = noKey;
    if (!/키가 없습니다/.test(noKey.status) || !/AI 키/.test(noKey.status)) problem(`키 없이 음성 만들기 → 안내가 다름: "${noKey.status}"`);
    if (noKey.expanded !== 'true' || noKey.focus !== 'key-gemini') problem(`키 없이 음성 만들기 → 키 칸이 안 펼쳐지거나 제미나이 칸에 커서가 없음: ${JSON.stringify(noKey)}`);
    if (report.calls.gemini.length) problem('키가 없는데 제미나이 요청이 나감');
    // 상자 안 링크도 키 칸을 펼침
    await page.click('#keyToggle'); // 접기
    await page.click('#ttsBox [data-open-keys]');
    await page.waitForTimeout(500);
    if ((await page.$eval('#keyToggle', (el) => el.getAttribute('aria-expanded'))) !== 'true') problem("내레이션 상자의 'AI 키 칸' 링크가 키 칸을 펼치지 않음");
    await page.$eval('#ttsBox', (el) => { el.open = true; });

    // ── (c) 각 서비스로 음성 만들기 — 키는 맨 위 키 칸에 ──
    const PROVIDER_LABEL = { gemini: '제미나이', elevenlabs: '일레븐랩스', fish: 'Fish Audio' };
    const KEY_STATE_LABEL = { gemini: '제미나이', elevenlabs: '일레븐랩스', fish: 'Fish Audio' };
    for (const id of ['gemini', 'elevenlabs', 'fish']) {
      await pick(id);
      // 'AI 키 칸' 바로 가기 링크도 고른 서비스의 칸으로(일레븐랩스를 골랐는데 제미나이 칸으로 가지 않게)
      const linkKey = await page.$eval('.tts-keynote [data-open-keys]', (a) => a.dataset.openKeys);
      if (linkKey !== id) problem(`${id}: 내레이션 상자의 'AI 키 칸' 링크가 ${linkKey} 칸으로 감`);
      await page.fill(`#key-${id}`, KEYS[id]);
      await page.waitForTimeout(60);
      const stt = await page.$eval('#ttsKeyState', (el) => el.textContent);
      if (stt !== `${KEY_STATE_LABEL[id]} 키 ✓`) problem(`${id}: 키를 넣었는데 내레이션 상자 키 상태가 "${stt}"`);
      if (id === 'elevenlabs') await page.fill('#ttsVoice', 'testVoice0001');
      await page.click('#ttsRun');
      const t0 = Date.now();
      await page.waitForFunction(() => {
        const s = document.querySelector('#ttsStatus').textContent.trim();
        return s && !/만드는 중/.test(s);
      }, null, { timeout: 30000 });
      const r = await page.evaluate(() => ({
        status: document.querySelector('#ttsStatus').textContent,
        audioInfo: document.querySelector('#audioInfo').textContent,
        fitEnabled: !document.querySelector('#fitToNarr').disabled,
        saveVisible: !!document.querySelector('#ttsSave').offsetParent,
        runEnabled: !document.querySelector('#ttsRun').disabled,
        narrFile: document.querySelector('#narrFile').value,
      }));
      r.ms = Date.now() - t0;
      report.runs[id] = r;
      const re = new RegExp(`내레이션 \\(${PROVIDER_LABEL[id]}\\) \\(\\d+:\\d\\d(\\.\\d)?\\)`); // formatTime: "00:00.5"
      if (!/^완성/.test(r.status)) problem(`${id}: 상태가 완성이 아님 — "${r.status}"`);
      if (!re.test(r.audioInfo)) problem(`${id}: #audioInfo 에 "내레이션 (${PROVIDER_LABEL[id]}) (길이)" 가 없음 — "${r.audioInfo}"`);
      if (!r.fitEnabled) problem(`${id}: #fitToNarr 가 잠겨 있음`);
      if (!r.saveVisible) problem(`${id}: "파일로 저장" 버튼이 안 보임`);
      if (!r.runEnabled) problem(`${id}: 끝난 뒤 버튼이 풀리지 않음`);
    }
    // 옛 모델 응답(audio/L16 PCM)도 한 번 — 기본 모의는 실제와 같은 audio/wav(RIFF)
    {
      geminiFormat = 'l16';
      await pick('gemini');
      await page.click('#ttsRun');
      await page.waitForFunction(() => { const s = document.querySelector('#ttsStatus').textContent.trim(); return s && !/만드는 중/.test(s); }, null, { timeout: 30000 });
      const st = await page.evaluate(() => ({ status: document.querySelector('#ttsStatus').textContent, audioInfo: document.querySelector('#audioInfo').textContent }));
      report.runs['gemini-l16'] = st;
      if (!/^완성/.test(st.status) || !/내레이션 \(제미나이\)/.test(st.audioInfo)) problem(`gemini(audio/L16 응답): 완성되지 않음 — ${JSON.stringify(st)}`);
      geminiFormat = 'wav';
    }
    // 보낸 요청 확인 — 키가 알맞은 자리에만 갔는지
    const gc = report.calls.gemini[0];
    // 모델 이름은 tts.js PROVIDERS 한 곳에서 읽는다(바뀌어도 이 점검을 고치지 않게)
    const ttsModel = await page.evaluate(async () => (await import('/js/tts.js')).providerOf('gemini').model);
    report.geminiModel = ttsModel;
    if (!gc) problem('제미나이 요청이 안 나감');
    else {
      if (!ttsModel || !gc.url.includes(`/models/${ttsModel}:generateContent`) || gc.url.includes(KEYS.gemini)) problem(`제미나이 URL(모델 ${ttsModel}, 키는 URL 에 실리면 안 됨): ${gc.url}`);
      if (gc.headers['x-goog-api-key'] !== KEYS.gemini) problem('제미나이 x-goog-api-key 헤더가 다름');
      if (gc.body?.generationConfig?.speechConfig?.voiceConfig?.prebuiltVoiceConfig?.voiceName !== 'Kore') problem('제미나이 본문 voiceName 이 Kore 가 아님');
      if (!gc.body?.generationConfig?.responseModalities?.includes('AUDIO')) problem('제미나이 본문 responseModalities 에 AUDIO 없음');
    }
    const ec = report.calls.elevenlabs[0];
    if (!ec) problem('일레븐랩스 요청이 안 나감');
    else {
      if (!ec.url.includes('/v1/text-to-speech/testVoice0001?output_format=mp3_44100_128')) problem(`일레븐랩스 URL: ${ec.url}`);
      if (ec.headers['xi-api-key'] !== KEYS.elevenlabs) problem('일레븐랩스 xi-api-key 헤더가 다름');
      if (ec.body?.model_id !== 'eleven_multilingual_v2') problem('일레븐랩스 model_id 가 다름');
    }
    const fc = report.calls.fish[0];
    if (!fc) problem('Fish 중계 요청(/api/tts)이 안 나감');
    else {
      if (fc.method !== 'POST') problem('Fish 중계가 POST 가 아님');
      if (!('x-access-code' in fc.headers)) problem('Fish 중계에 x-access-code 헤더 없음');
      if (fc.body?.provider !== 'fish' || fc.body?.key !== KEYS.fish || fc.body?.voice !== FISH_DEFAULT_VOICE || fc.body?.model !== 'drama-3') problem(`Fish 중계 본문: ${JSON.stringify({ ...fc.body, text: '…' })}`);
      if (typeof fc.body?.speed !== 'number') problem('Fish 중계 본문에 speed 없음');
    }
    // 다른 서비스로 키가 새지 않았는지
    if (report.calls.gemini.some((c) => JSON.stringify(c).includes(KEYS.elevenlabs) || JSON.stringify(c).includes(KEYS.fish))) problem('제미나이 요청에 다른 서비스 키가 섞임');
    if (report.calls.elevenlabs.some((c) => JSON.stringify(c).includes(KEYS.gemini) || JSON.stringify(c).includes(KEYS.fish))) problem('일레븐랩스 요청에 다른 서비스 키가 섞임');

    // ── (d) 기억 체크(맨 위 키 칸 #keyRemember) ──
    const ls = () => page.evaluate(() => {
      const all = {};
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); all[k] = localStorage.getItem(k); }
      const ss = {};
      for (let i = 0; i < sessionStorage.length; i++) { const k = sessionStorage.key(i); ss[k] = sessionStorage.getItem(k); }
      return { all, ss };
    });
    const hasKey = (all, key) => Object.values(all).some((v) => String(v).includes(key));
    const remember0 = await page.$eval('#keyRemember', (el) => el.checked);
    let { all, ss } = await ls();
    report.remember.off = { checked: remember0, keyInStorage: hasKey(all, KEYS.gemini), keyInSession: hasKey(ss, KEYS.gemini), ttsKeys: all['mrk:ttsKeys'] || null, hasTtsSettings: !!all['mrk:tts'] };
    if (remember0) problem('기억 체크가 기본으로 켜져 있음');
    if (hasKey(all, KEYS.gemini)) problem('기억 체크가 꺼져 있는데 localStorage 에 키가 있음');
    if (!hasKey(ss, KEYS.gemini)) problem('기억 끔: 이 탭(sessionStorage)에 키가 없음');
    if (all['mrk:ttsKeys']) problem("예전 키 저장(store 'ttsKeys')이 다시 생김");
    if (!all['mrk:tts']) problem("설정(store 'tts')이 저장되지 않음");
    if (all['mrk:tts'] && Object.values(KEYS).some((k) => all['mrk:tts'].includes(k))) problem("설정(store 'tts')에 키가 섞임");
    if (all['mrk:shorts'] && /tts/i.test(all['mrk:shorts'])) problem("프로젝트 설정(store 'shorts')에 tts 항목이 들어감");
    await page.check('#keyRemember');
    ({ all, ss } = await ls());
    report.remember.on = { keyInStorage: hasKey(all, KEYS.gemini), keyInSession: hasKey(ss, KEYS.gemini) };
    if (!String(all['mrkv.keys'] || '').includes(KEYS.gemini) || !String(all['mrkv.keys'] || '').includes(KEYS.fish)) problem('기억 체크를 켰는데 localStorage(mrkv.keys)에 키가 없음');
    // 서비스를 바꿔도 각자 키 상태가 맞게 보인다
    await pick('fish');
    const fishState = await page.$eval('#ttsKeyState', (el) => el.textContent);
    if (fishState !== 'Fish Audio 키 ✓') problem(`Fish 로 바꿨는데 키 상태: "${fishState}"`);
    await pick('gemini');
    await page.uncheck('#keyRemember');
    ({ all, ss } = await ls());
    report.remember.offAgain = { keyInStorage: hasKey(all, KEYS.gemini), keyInSession: hasKey(ss, KEYS.gemini) };
    if (hasKey(all, KEYS.gemini)) problem('기억 체크를 껐는데 localStorage 에 키가 남아 있음');
    if (!hasKey(ss, KEYS.gemini)) problem('기억을 끈 뒤 이 탭에서 키가 사라짐(탭 안에는 남아야 함)');

    await page.screenshot({ path: path.join(OUT, 'desktop.png'), fullPage: false });

    // ── (e) 모바일 400px ──
    await page.setViewportSize({ width: 400, height: 800 });
    await page.waitForTimeout(300);
    await page.$eval('#ttsBox', (el) => { el.open = true; el.scrollIntoView(); });
    await page.waitForTimeout(200);
    const mobile = await page.evaluate(() => {
      const de = document.documentElement;
      const box = document.querySelector('#ttsBox').getBoundingClientRect();
      const wide = [...document.querySelectorAll('#ttsBox *')].filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1).map((el) => `${el.tagName.toLowerCase()}#${el.id || ''}.${[...el.classList].join('.')}`);
      return { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth, innerWidth: window.innerWidth, boxRight: Math.round(box.right), wide: wide.slice(0, 8) };
    });
    report.mobile = mobile;
    if (mobile.scrollWidth > mobile.clientWidth) problem(`400px 에서 가로 넘침: scrollWidth ${mobile.scrollWidth} > ${mobile.clientWidth}`);
    if (mobile.boxRight > mobile.innerWidth + 1) problem(`400px 에서 내레이션 상자가 화면 밖으로 나감 (right ${mobile.boxRight})`);
    if (mobile.wide.length) problem(`400px 에서 상자 안 요소가 화면 밖으로 나감: ${mobile.wide.join(', ')}`);
    await page.screenshot({ path: path.join(OUT, 'mobile-400.png'), fullPage: false });

    await page.close();
  } catch (e) {
    problem(`예외: ${e.stack || e.message}`);
  } finally {
    await browser.close();
  }
  // ── (f) 콘솔 오류 ──
  if (report.consoleErrors.length) problem(`콘솔 오류 ${report.consoleErrors.length}건`);
  report.ok = report.problems.length === 0;
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    ok: report.ok, problems: report.problems, consoleErrors: report.consoleErrors, expected404: report.expected404.length,
    runs: Object.fromEntries(Object.entries(report.runs).map(([k, v]) => [k, { status: v.status, audioInfo: v.audioInfo, fit: v.fitEnabled, save: v.saveVisible, ms: v.ms }])),
    remember: report.remember, noKey: report.noKey, geminiModel: report.geminiModel, mobile: report.mobile, calls: { gemini: report.calls.gemini.length, elevenlabs: report.calls.elevenlabs.length, fish: report.calls.fish.length, health: report.calls.health },
  }, null, 2));
  process.exit(report.ok ? 0 : 1);
})();
