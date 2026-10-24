// 목소리 점검(Playwright) — js/recorder.js(내 목소리 녹음)·js/tts.js(제미나이 무료 우선·긴 대본 이어 붙이기)
//  (a) 가짜 마이크(--use-fake-device-for-media-stream)로 2초 녹음 → blob·mime·duration·onLevel 호출 확인, 풀어서(decode) 길이 확인
//      취소(cancel)·최대 길이 자동 멈춤·녹음 불가 브라우저(canRecord false) 확인
//  (b) 마이크 거부(--deny-permission-prompts) → 한국어 오류(code denied) / 마이크 없음 → 한국어 오류(code nodevice)
//  (c) trimSilence: 합성한 [무음 1.0초 + 톤 0.5초 + 무음 0.8초] → 0.15초 여유 남기고 0.8초로 줄어듦, 전부 무음이면 그대로
//      audioBufferToWavBlob: WAV 머리·길이 확인, 다시 풀어도 길이 같음
//  (d) 제미나이 모의 응답(PCM base64)으로 긴 대본 3조각 → WAV 하나, 길이 = 조각 합 + 쉼 0.25초 × 2, 쉼 자리는 무음
//      3.8 모델 기본 형식(audio/wav)으로 와도 똑같이 이어 붙임
//  (e) key 를 안 넘기면 keys.js getKey 의 키를 씀(제미나이·일레븐랩스), 넘기면 넘긴 키를 씀, 둘 다 없으면 'AI 키' 안내
//  (f) 오류: 키 틀림(응답에 키가 섞여도 문구에 안 넣음)·하루 무료 한도(→ 다른 무료 모델로 바꿔 봄)·1분 한도(기다렸다 다시)·
//      모델 없음(404 → 다른 모델)·연결 실패 — 모두 한국어
//  (g) PROVIDERS 순서·제미나이 무료 안내·목소리 8개
// 결과: tests/out/voice/report.json. 종료 코드 0/1. 정적 서버가 http://127.0.0.1:5173/ 에 떠 있어야 합니다.
//   LANG=C.UTF-8 node tests/voice-check.cjs

const fs = require('fs');
const path = require('path');
const { chromium } = require('/opt/node-tools/node_modules/playwright');

const BASE = process.env.MRK_BASE || 'http://127.0.0.1:5173';
const OUT = path.join(__dirname, 'out', 'voice');
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const TEST_PAGE = `${BASE}/tests/__voice-check.html`; // 같은 출처의 빈 페이지(모듈만 불러 씀)
const KEYS_JS = path.join(__dirname, '..', 'js', 'keys.js');
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, GET, OPTIONS' };
const KEY_STORED = 'AIzaStoredGeminiKey000001';
const KEY_ARG = 'AIzaPassedGeminiKey000002';
const KEY_ELEVEN = 'sk_storedElevenKey0000003';
const RATE = 24000;

/** 정해진 길이(초)의 24kHz PCM16 사인파 바이트 */
function pcm(sec, freq) {
  const n = Math.round(RATE * sec);
  const buf = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * freq * (i + 0.5)) / RATE) * 12000), i * 2);
  return buf;
}
/** PCM16 에 WAV 머리를 붙임(3.8 모델 기본 응답 흉내) */
function wav(pcmBuf) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcmBuf.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * 2, 28);
  h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcmBuf.length, 40);
  return Buffer.concat([h, pcmBuf]);
}
const CHUNK_SEC = [0.6, 0.8, 1.0]; // 조각마다 다른 길이로 돌려줘서 '길이 합'을 확인

const blankPage = (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><html lang="ko"><meta charset="utf-8"><title>목소리 점검</title><body></body></html>' });

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const report = { ok: true, problems: [], consoleErrors: [], keysMode: null, record: {}, deny: {}, trim: {}, gemini: {}, keys: {}, errors: {}, providers: null, calls: { gemini: [], elevenlabs: [] } };
  const problem = (s) => report.problems.push(s);
  const browsers = [];
  try {
    // ── 브라우저 A: 가짜 마이크 허용 ──
    const A = await chromium.launch({ executablePath: EXE, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
    browsers.push(A);
    const page = await A.newPage();
    // 오류 경우를 일부러 만든 모의 응답(400·404·429·연결 거부)은 브라우저가 'Failed to load resource' 로 찍으므로 따로 센다
    report.expectedNetErrors = [];
    const EXPECTED_NET = /^Failed to load resource: (the server responded with a status of (400|404|429) |net::ERR_CONNECTION_REFUSED)/;
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      if (EXPECTED_NET.test(m.text())) report.expectedNetErrors.push(m.text());
      else report.consoleErrors.push(m.text());
    });
    page.on('pageerror', (e) => report.consoleErrors.push(`pageerror: ${e.message}`));
    await page.route(TEST_PAGE, blankPage);

    // keys.js 가 있으면 실제 것을 쓰고, 아직 없으면 같은 이름의 모의 모듈을 이 테스트 안에서만 돌려준다
    report.keysMode = fs.existsSync(KEYS_JS) ? 'real' : 'mock';
    if (report.keysMode === 'mock') {
      await page.route('**/js/keys.js', (route) => route.fulfill({
        status: 200, contentType: 'text/javascript; charset=utf-8',
        body: `const m = (window.__mockKeys ||= {});
export const KEY_PROVIDERS = [];
export function getKey(id) { return typeof m[id] === 'string' ? m[id] : ''; }
export function setKey(id, v) { v = String(v ?? '').trim(); if (v) m[id] = v; else delete m[id]; }
export function clearKeys() { for (const k of Object.keys(m)) delete m[k]; }
export function rememberKeys() { return false; }
export function setRemember() {}
export function onKeysChange() { return () => {}; }
export function firstWithKey(order = ['gemini','claude','openai']) { for (const id of order) if (getKey(id)) return id; return null; }`,
      }));
    }

    // ── 제미나이 모의 응답 — mode 로 경우를 바꾼다 ──
    let mode = 'pcm';
    let callNo = 0;
    await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
      const rq = route.request();
      if (rq.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      const body = rq.postDataJSON();
      const model = (/models\/([^:]+):generateContent/.exec(rq.url()) || [])[1] || '';
      const idx = callNo++;
      report.calls.gemini.push({ mode, model, url: rq.url(), key: rq.headers()['x-goog-api-key'], text: body?.contents?.[0]?.parts?.[0]?.text || '', voice: body?.generationConfig?.speechConfig?.voiceConfig?.prebuiltVoiceConfig?.voiceName, modalities: body?.generationConfig?.responseModalities });
      const ok = (buf, mimeType) => route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType, data: buf.toString('base64') } }] }, finishReason: 'STOP' }] }) });
      const fail = (status, error) => route.fulfill({ status, contentType: 'application/json', headers: CORS, body: JSON.stringify({ error }) });
      const sec = CHUNK_SEC[idx % 3];
      switch (mode) {
        case 'pcm': return ok(pcm(sec, 300 + 100 * (idx % 3)), 'audio/L16;codec=pcm;rate=24000');
        case 'wav': return ok(wav(pcm(sec, 300 + 100 * (idx % 3))), 'audio/wav');
        case 'key-invalid':
          return fail(400, { code: 400, message: `API key not valid. Please pass a valid API key. (${rq.headers()['x-goog-api-key']})`, status: 'INVALID_ARGUMENT', details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'API_KEY_INVALID', domain: 'googleapis.com' }] });
        case 'daily-then-alt':
          if (model === 'gemini-3.8-flash-tts') return fail(429, { code: 429, message: 'You exceeded your current quota.', status: 'RESOURCE_EXHAUSTED', details: [{ '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaMetric: 'generativelanguage.googleapis.com/generate_content_free_tier_requests', quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier', quotaValue: '15' }] }, { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '50s' }] });
          return ok(pcm(0.5, 440), 'audio/L16;codec=pcm;rate=24000');
        case 'daily-all':
          return fail(429, { code: 429, message: 'You exceeded your current quota.', status: 'RESOURCE_EXHAUSTED', details: [{ '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] }] });
        case 'minute-once':
          if (idx === 0) return fail(429, { code: 429, message: 'You exceeded your current quota.', status: 'RESOURCE_EXHAUSTED', details: [{ '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier' }] }, { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '1s' }] });
          return ok(pcm(0.5, 440), 'audio/L16;codec=pcm;rate=24000');
        case 'model-404':
          if (model === 'gemini-3.8-flash-tts') return fail(404, { code: 404, message: `models/${model} is not found for API version v1beta, or is not supported for generateContent.`, status: 'NOT_FOUND' });
          return ok(pcm(0.5, 440), 'audio/L16;codec=pcm;rate=24000');
        case 'network': return route.abort('connectionrefused');
        default: return fail(500, { code: 500, message: 'unknown mode' });
      }
    });
    await page.route('https://api.elevenlabs.io/**', (route) => {
      const rq = route.request();
      if (rq.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      report.calls.elevenlabs.push({ url: rq.url(), key: rq.headers()['xi-api-key'] });
      return route.fulfill({ status: 200, contentType: 'audio/mpeg', headers: CORS, body: Buffer.from([0xff, 0xfb, 0x90, 0x00, 1, 2, 3, 4]) });
    });

    await page.goto(TEST_PAGE, { waitUntil: 'load' });

    // ── (a) 녹음 2초 ──
    report.record = await page.evaluate(async () => {
      const R = await import('/js/recorder.js');
      const out = { canRecord: R.canRecord(), pickType: R.pickRecordType() };
      const levels = [];
      const rec = await R.startRecording({ onLevel: (v, info) => levels.push([v, info?.rms ?? -1]) });
      out.startMime = rec.mime;
      out.stateDuring = rec.state;
      await new Promise((r) => setTimeout(r, 2000));
      out.elapsedBeforeStop = rec.elapsed;
      const res = await rec.stop();
      out.stateAfter = rec.state;
      out.blobSize = res.blob.size;
      out.blobType = res.blob.type;
      out.mime = res.mime;
      out.duration = res.duration;
      out.levelCalls = levels.length;
      out.levelMax = Math.max(0, ...levels.map((l) => l[0]));
      out.levelInRange = levels.every((l) => l[0] >= 0 && l[0] <= 1);
      try { const buf = await R.decodeAudio(res.blob); out.decoded = buf.duration; } catch (e) { out.decodeError = e.message; }
      // 같은 결과를 한 번 더 stop() 해도 같은 것
      const again = await rec.stop();
      out.stopTwiceSame = again.blob === res.blob;
      // 취소
      const r2 = await R.startRecording({});
      await new Promise((r) => setTimeout(r, 300));
      r2.cancel();
      try { await r2.stop(); out.cancel = 'resolved(틀림)'; } catch (e) { out.cancel = { code: e.code, name: e.name, message: e.message }; }
      out.cancelState = r2.state;
      // 최대 길이 자동 멈춤
      const r3 = await R.startRecording({ maxSeconds: 1 });
      await new Promise((r) => setTimeout(r, 1500));
      out.autoStopState = r3.state;
      const res3 = await r3.stop();
      out.autoStopDuration = res3.duration;
      // 녹음 불가 브라우저 흉내
      const MR = window.MediaRecorder;
      window.MediaRecorder = undefined;
      out.canRecordWithout = R.canRecord();
      try { await R.startRecording({}); out.unsupported = '시작됨(틀림)'; } catch (e) { out.unsupported = { code: e.code, message: e.message }; }
      window.MediaRecorder = MR;
      return out;
    });
    const rc = report.record;
    if (!rc.canRecord) problem('가짜 마이크가 있는데 canRecord() 가 false');
    if (rc.pickType !== 'audio/webm;codecs=opus') problem(`크로미움 녹음 형식이 webm/opus 가 아님: "${rc.pickType}"`);
    if (rc.stateDuring !== 'recording' || rc.stateAfter !== 'inactive') problem(`녹음 상태 이상: ${rc.stateDuring} → ${rc.stateAfter}`);
    if (!(rc.blobSize > 1000)) problem(`녹음 blob 이 너무 작음: ${rc.blobSize}`);
    if (!/^audio\/webm/.test(rc.mime) || !/^audio\/webm/.test(rc.blobType)) problem(`녹음 mime: ${rc.mime} / ${rc.blobType}`);
    if (!(rc.duration > 1.8 && rc.duration < 2.8)) problem(`녹음 duration 이 2초 근처가 아님: ${rc.duration}`);
    if (!(rc.levelCalls >= 20)) problem(`onLevel 호출이 적음: ${rc.levelCalls}`);
    if (!(rc.levelMax > 0.01) || !rc.levelInRange) problem(`onLevel 값 이상: max ${rc.levelMax}, 범위 ${rc.levelInRange}`);
    if (!(rc.decoded > 1.5 && rc.decoded < 2.8)) problem(`녹음을 풀었을 때 길이 이상: ${rc.decoded} ${rc.decodeError || ''}`);
    if (!rc.stopTwiceSame) problem('stop() 을 두 번 부르면 다른 결과가 나옴');
    if (rc.cancel?.code !== 'cancelled' || rc.cancelState !== 'inactive') problem(`취소 결과 이상: ${JSON.stringify(rc.cancel)} / ${rc.cancelState}`);
    if (rc.autoStopState !== 'inactive' || !(rc.autoStopDuration > 0.8 && rc.autoStopDuration < 1.4)) problem(`최대 길이 자동 멈춤 이상: ${rc.autoStopState} ${rc.autoStopDuration}`);
    if (rc.canRecordWithout !== false || rc.unsupported?.code !== 'unsupported' || !/녹음이 안 됩니다/.test(rc.unsupported?.message || '')) problem(`녹음 불가 브라우저 처리 이상: ${JSON.stringify(rc.unsupported)}`);

    // ── (c) trimSilence · audioBufferToWavBlob ──
    report.trim = await page.evaluate(async () => {
      const R = await import('/js/recorder.js');
      const sr = 48000;
      const make = (parts, chs = 1) => {
        const len = parts.reduce((s, p) => s + Math.round(p.sec * sr), 0);
        const b = new AudioBuffer({ numberOfChannels: chs, length: len, sampleRate: sr });
        for (let c = 0; c < chs; c++) {
          const d = b.getChannelData(c);
          let o = 0;
          let seed = 7 + c;
          for (const p of parts) {
            const n = Math.round(p.sec * sr);
            for (let i = 0; i < n; i++) {
              seed = (seed * 16807) % 2147483647;
              const noise = ((seed / 2147483647) * 2 - 1) * 0.002; // 아주 작은 잡음(무음 자리)
              d[o + i] = p.tone ? Math.sin((2 * Math.PI * 440 * i) / sr) * 0.5 : noise;
            }
            o += n;
          }
        }
        return b;
      };
      const out = {};
      const src = make([{ sec: 1.0 }, { sec: 0.5, tone: true }, { sec: 0.8 }]);
      const t = await R.trimSilence(src);
      out.before = src.duration;
      out.after = t.duration;
      out.sampleRate = t.sampleRate;
      // 톤이 시작하는 자리(0.15초 여유 뒤)와 앞쪽이 조용한지
      const d = t.getChannelData(0);
      const firstLoud = d.findIndex((v) => Math.abs(v) > 0.1);
      out.toneStartsAt = firstLoud / sr;
      out.headQuiet = Math.max(...Array.from(d.subarray(0, Math.round(0.14 * sr)), Math.abs));
      out.tailQuiet = Math.max(...Array.from(d.subarray(d.length - Math.round(0.14 * sr)), Math.abs));
      out.edgeFade = [Math.abs(d[0]), Math.abs(d[d.length - 1])];
      // pad 0
      const t0 = await R.trimSilence(src, { pad: 0 });
      out.pad0 = t0.duration;
      // 2채널(오른쪽만 소리) — 어느 채널이든 소리가 있으면 남김
      const st = make([{ sec: 0.4 }, { sec: 0.3, tone: true }, { sec: 0.4 }], 2);
      st.getChannelData(0).fill(0);
      const ts = await R.trimSilence(st);
      out.stereo = { chs: ts.numberOfChannels, dur: ts.duration };
      // 전부 무음 → 그대로
      const silent = make([{ sec: 1.0 }]);
      out.silentSame = (await R.trimSilence(silent)) === silent;
      // 자를 게 없음(처음부터 끝까지 소리) → 그대로
      const full = make([{ sec: 0.5, tone: true }]);
      out.fullSame = (await R.trimSilence(full)) === full;
      // WAV 만들기 → 다시 풀기
      const w = R.audioBufferToWavBlob(t);
      const head = new Uint8Array(await w.slice(0, 44).arrayBuffer());
      const dv = new DataView(head.buffer);
      out.wav = {
        type: w.type, size: w.size, expectSize: 44 + t.length * t.numberOfChannels * 2,
        riff: String.fromCharCode(...head.slice(0, 4)), wave: String.fromCharCode(...head.slice(8, 12)),
        rate: dv.getUint32(24, true), chs: dv.getUint16(22, true), bits: dv.getUint16(34, true), dataLen: dv.getUint32(40, true),
      };
      const back = await R.decodeAudio(w);
      out.wav.decoded = back.duration;
      const ws = R.audioBufferToWavBlob(ts);
      out.wav.stereoSize = ws.size;
      out.wav.stereoExpect = 44 + ts.length * 2 * 2;
      return out;
    });
    const tr = report.trim;
    if (Math.abs(tr.after - 0.8) > 0.03) problem(`trimSilence 결과 길이가 0.8초가 아님: ${tr.after} (원래 ${tr.before})`);
    if (Math.abs(tr.toneStartsAt - 0.15) > 0.03) problem(`trimSilence 후 톤 시작이 0.15초 근처가 아님: ${tr.toneStartsAt}`);
    if (tr.headQuiet > 0.01 || tr.tailQuiet > 0.01) problem(`trimSilence 앞뒤 여유 자리가 조용하지 않음: ${tr.headQuiet} / ${tr.tailQuiet}`);
    if (tr.edgeFade[0] > 0.001 || tr.edgeFade[1] > 0.001) problem(`잘린 끝이 0 으로 줄지 않음(딱 소리 우려): ${tr.edgeFade}`);
    if (Math.abs(tr.pad0 - 0.5) > 0.03) problem(`pad 0 일 때 길이가 0.5초가 아님: ${tr.pad0}`);
    if (tr.stereo.chs !== 2 || Math.abs(tr.stereo.dur - 0.6) > 0.03) problem(`2채널 trimSilence 이상: ${JSON.stringify(tr.stereo)}`);
    if (!tr.silentSame) problem('전부 무음인 버퍼를 trimSilence 가 바꿈(그대로 둬야 함)');
    if (!tr.fullSame) problem('자를 게 없는 버퍼를 trimSilence 가 새로 만듦');
    if (tr.wav.type !== 'audio/wav' || tr.wav.size !== tr.wav.expectSize || tr.wav.riff !== 'RIFF' || tr.wav.wave !== 'WAVE' || tr.wav.rate !== 48000 || tr.wav.chs !== 1 || tr.wav.bits !== 16 || tr.wav.dataLen !== tr.wav.expectSize - 44) problem(`audioBufferToWavBlob 머리/크기 이상: ${JSON.stringify(tr.wav)}`);
    if (Math.abs(tr.wav.decoded - tr.after) > 0.01) problem(`WAV 를 다시 풀었더니 길이가 다름: ${tr.wav.decoded} vs ${tr.after}`);
    if (tr.wav.stereoSize !== tr.wav.stereoExpect) problem(`2채널 WAV 크기 이상: ${tr.wav.stereoSize} vs ${tr.wav.stereoExpect}`);

    // ── (g) PROVIDERS ──
    report.providers = await page.evaluate(async () => {
      const T = await import('/js/tts.js');
      const g = T.providerOf('gemini');
      return { order: T.PROVIDERS.map((p) => p.id), gFree: g.free, gNote: g.freeNote || '', gHint: g.keyHint, gVoices: g.voices.length, gModel: g.model, gAlt: g.altModel, gHasModels: !!g.models, keyIds: T.PROVIDERS.map((p) => p.keyId), chunk: T.GEMINI_CHUNK_CHARS, gap: T.GAP_SEC };
    });
    const pv = report.providers;
    if (pv.order.join(',') !== 'gemini,elevenlabs,fish') problem(`PROVIDERS 순서: ${pv.order}`);
    if (!pv.gFree || !/무료 한도 안에서/.test(pv.gNote) || !/AI Studio/.test(pv.gHint)) problem(`제미나이 무료 안내 없음: ${JSON.stringify(pv)}`);
    if (pv.gVoices !== 8) problem(`제미나이 목소리 수: ${pv.gVoices}`);
    if (pv.gHasModels) problem('제미나이에 models 가 생기면 화면에 엔진 칸이 보임');
    if (pv.keyIds.join(',') !== 'gemini,elevenlabs,fish') problem(`keyId 가 keys.js id 와 다름: ${pv.keyIds}`);

    // ── (d) 제미나이 긴 대본 3조각 ──
    // 문장 하나 약 50자 × 55개 ≈ 2,700자(대본 한도 3,000자 안) → 1,000자씩 묶으면 3조각
    const sentences = Array.from({ length: 55 }, (_, i) => `${i + 1}번째 문장입니다. 이 매물은 3.5억 원대이고 남향 거실이 넓어서 햇빛이 잘 듭니다${i % 2 ? '!' : '.'}`);
    const longText = sentences.map((s, i) => (i % 5 === 4 ? s + '\n' : s + ' ')).join('').trim();
    report.longTextLength = longText.length;
    if (longText.length <= 2000 || longText.length > 3000) problem(`시험용 긴 대본 길이가 2,000~3,000자가 아님: ${longText.length}`);
    const runLong = (m) => page.evaluate(async ({ text, KEY_STORED }) => {
      const K = await import('/js/keys.js');
      const T = await import('/js/tts.js');
      K.clearKeys();
      K.setKey('gemini', KEY_STORED);
      const prog = [];
      const chunks = T.splitScript(text);
      const t0 = performance.now();
      const res = await T.synthesize({ provider: 'gemini', voice: 'Kore', text, onProgress: (p) => prog.push(p) });
      const ms = performance.now() - t0;
      const ab = new Uint8Array(await res.blob.arrayBuffer());
      const dv = new DataView(ab.buffer);
      const rate = dv.getUint32(24, true);
      const dataLen = dv.getUint32(40, true);
      const samples = new Int16Array(ab.buffer.slice(44));
      const ctx = new AudioContext();
      const buf = await ctx.decodeAudioData(ab.buffer.slice(0));
      ctx.close();
      return {
        mime: res.mime, type: res.blob.type, model: res.model, chunksOut: res.chunks, ms,
        split: chunks.map((c) => c.length), splitJoined: chunks.join(' ').replace(/\s+/g, ' ') === text.replace(/\s+/g, ' '),
        splitKeepsNumber: chunks.every((c) => !/3\. 5억/.test(c)),
        riff: String.fromCharCode(...ab.slice(0, 4)), rate, chs: dv.getUint16(22, true), dataLen, size: ab.length,
        samples: Array.from(samples), decoded: buf.duration, prog,
      };
    }, { text: longText, KEY_STORED });

    for (const m of ['pcm', 'wav']) {
      mode = m; callNo = 0;
      const before = report.calls.gemini.length;
      const r = await runLong(m);
      const calls = report.calls.gemini.slice(before);
      const sampleList = r.samples; delete r.samples;
      const n = CHUNK_SEC.map((s) => Math.round(RATE * s));
      const gap = Math.round(RATE * 0.25);
      const expectSamples = n[0] + n[1] + n[2] + gap * 2;
      // 쉼 자리(조각1 끝 ~ 조각2 시작, 조각2 끝 ~ 조각3 시작)는 0, 그 앞은 소리
      const gap1 = sampleList.slice(n[0], n[0] + gap);
      const gap2 = sampleList.slice(n[0] + gap + n[1], n[0] + gap + n[1] + gap);
      const before1 = sampleList.slice(n[0] - 200, n[0]);
      const after1 = sampleList.slice(n[0] + gap, n[0] + gap + 200);
      r.check = {
        calls: calls.length, expectSamples, gotSamples: sampleList.length,
        gapsSilent: gap1.every((v) => v === 0) && gap2.every((v) => v === 0),
        aroundGapLoud: before1.some((v) => Math.abs(v) > 1000) && after1.some((v) => Math.abs(v) > 1000),
        expectSec: CHUNK_SEC.reduce((s, x) => s + x, 0) + 0.5,
        callTexts: calls.map((c) => c.text.length), sameKey: calls.every((c) => c.key === KEY_STORED),
        keyNotInUrl: calls.every((c) => !c.url.includes(KEY_STORED)), models: [...new Set(calls.map((c) => c.model))],
        voice: [...new Set(calls.map((c) => c.voice))], audio: calls.every((c) => (c.modalities || []).includes('AUDIO')),
      };
      report.gemini[m] = r;
      const c = r.check;
      if (r.split.length !== 3) problem(`[${m}] 긴 대본이 3조각으로 안 나뉨: ${r.split}`);
      if (r.split.some((x) => x > 1000)) problem(`[${m}] 조각이 1000자를 넘음: ${r.split}`);
      if (!r.splitJoined) problem(`[${m}] 조각을 이으면 원래 대본과 다름(글자가 빠지거나 바뀜)`);
      if (!r.splitKeepsNumber) problem(`[${m}] "3.5억" 의 점에서 문장을 잘랐음`);
      if (c.calls !== 3) problem(`[${m}] 제미나이 요청이 3번이 아님: ${c.calls}`);
      if (r.mime !== 'audio/wav' || r.type !== 'audio/wav' || r.riff !== 'RIFF') problem(`[${m}] 결과가 WAV 하나가 아님: ${r.mime} ${r.type} ${r.riff}`);
      if (r.chunksOut !== 3) problem(`[${m}] 결과 chunks 가 3 이 아님: ${r.chunksOut}`);
      if (r.rate !== RATE || r.chs !== 1) problem(`[${m}] WAV 형식: ${r.rate}Hz ${r.chs}ch`);
      if (c.gotSamples !== c.expectSamples || r.dataLen !== c.expectSamples * 2) problem(`[${m}] 길이 합이 맞지 않음: ${c.gotSamples} vs ${c.expectSamples}`);
      if (Math.abs(r.decoded - c.expectSec) > 0.01) problem(`[${m}] 풀어 본 길이 ${r.decoded}초 ≠ 조각 합+쉼 ${c.expectSec}초`);
      if (!c.gapsSilent) problem(`[${m}] 조각 사이 0.25초 쉼 자리가 무음이 아님`);
      if (!c.aroundGapLoud) problem(`[${m}] 쉼 앞뒤에 소리가 없음(이어 붙인 자리 어긋남)`);
      if (!c.sameKey || !c.keyNotInUrl) problem(`[${m}] 키가 헤더로만 가지 않음`);
      if (c.models.join() !== 'gemini-3.8-flash-tts') problem(`[${m}] 모델: ${c.models}`);
      if (c.voice.join() !== 'Kore' || !c.audio) problem(`[${m}] 본문 voiceName/AUDIO 이상: ${c.voice} ${c.audio}`);
      const last = r.prog[r.prog.length - 1];
      if (!r.prog.length || last?.done !== 3 || last?.total !== 3) problem(`[${m}] onProgress 이상: ${JSON.stringify(r.prog)}`);
    }

    // ── (e) key 를 안 넘기면 getKey ──
    mode = 'pcm'; callNo = 0;
    const kb = report.calls.gemini.length;
    const eb = report.calls.elevenlabs.length;
    report.keys = await page.evaluate(async ({ KEY_STORED, KEY_ARG, KEY_ELEVEN }) => {
      const K = await import('/js/keys.js');
      const T = await import('/js/tts.js');
      const out = {};
      K.clearKeys();
      K.setKey('gemini', KEY_STORED);
      K.setKey('elevenlabs', KEY_ELEVEN);
      out.stored = (await T.synthesize({ provider: 'gemini', key: '', voice: 'Puck', text: '짧은 대본입니다.' })).mime;
      out.passed = (await T.synthesize({ provider: 'gemini', key: KEY_ARG, voice: 'Puck', text: '짧은 대본입니다.' })).mime;
      out.eleven = (await T.synthesize({ provider: 'elevenlabs', voice: 'voice0001', text: '짧은 대본입니다.' })).mime;
      out.emptyVoice = (await T.synthesize({ provider: 'gemini', voice: '', text: '목소리를 안 고르면 첫 목소리.' })).mime;
      K.clearKeys();
      try { await T.synthesize({ provider: 'gemini', text: '키가 없을 때' }); out.noKey = '성공(틀림)'; } catch (e) { out.noKey = e.message; }
      return out;
    }, { KEY_STORED, KEY_ARG, KEY_ELEVEN });
    const kc = report.calls.gemini.slice(kb);
    const ec = report.calls.elevenlabs.slice(eb);
    report.keys.sent = { gemini: kc.map((c) => c.key), voices: kc.map((c) => c.voice), eleven: ec.map((c) => c.key) };
    if (kc[0]?.key !== KEY_STORED) problem(`key 를 비우면 getKey('gemini') 를 써야 함: ${kc[0]?.key}`);
    if (kc[1]?.key !== KEY_ARG) problem(`넘긴 key 가 우선이어야 함: ${kc[1]?.key}`);
    if (ec[0]?.key !== KEY_ELEVEN) problem(`일레븐랩스도 getKey('elevenlabs') 를 써야 함: ${ec[0]?.key}`);
    if (kc[2]?.voice !== 'Kore') problem(`목소리를 비우면 첫 목소리(Kore): ${kc[2]?.voice}`);
    if (!/AI 키/.test(report.keys.noKey) || !/제미나이/.test(report.keys.noKey)) problem(`키가 없을 때 안내: "${report.keys.noKey}"`);

    // ── (f) 오류 ──
    const tryOne = (text = '오류를 확인하는 짧은 대본입니다.') => page.evaluate(async ({ text, KEY_STORED }) => {
      const K = await import('/js/keys.js');
      const T = await import('/js/tts.js');
      K.clearKeys();
      K.setKey('gemini', KEY_STORED);
      const prog = [];
      const t0 = performance.now();
      try {
        const r = await T.synthesize({ provider: 'gemini', voice: 'Kore', text, onProgress: (p) => prog.push(p) });
        return { ok: true, model: r.model, mime: r.mime, ms: performance.now() - t0, prog };
      } catch (e) { return { ok: false, message: e.message, code: e.code, ms: performance.now() - t0, prog }; }
    }, { text, KEY_STORED });
    const hasHangul = (s) => /[가-힣]/.test(s || '');
    for (const m of ['key-invalid', 'daily-then-alt', 'daily-all', 'minute-once', 'model-404', 'network']) {
      mode = m; callNo = 0;
      const before = report.calls.gemini.length;
      const r = await tryOne();
      r.calls = report.calls.gemini.slice(before).map((c) => c.model);
      report.errors[m] = r;
      const leaked = JSON.stringify(r).includes(KEY_STORED);
      if (leaked) problem(`[${m}] 오류/결과에 키가 섞임`);
      if (!r.ok && !hasHangul(r.message)) problem(`[${m}] 오류가 한국어가 아님: ${r.message}`);
    }
    const E = report.errors;
    if (E['key-invalid'].ok || !/키가 맞지 않습니다/.test(E['key-invalid'].message)) problem(`키 틀림 안내: ${E['key-invalid'].message}`);
    if (!E['daily-then-alt'].ok || E['daily-then-alt'].model !== 'gemini-3.8-flash-lite-tts' || E['daily-then-alt'].calls.join() !== 'gemini-3.8-flash-tts,gemini-3.8-flash-lite-tts') problem(`하루 한도 → 다른 무료 모델 전환 이상: ${JSON.stringify(E['daily-then-alt'])}`);
    if (E['daily-all'].ok || !/무료 한도/.test(E['daily-all'].message) || E['daily-all'].code !== 'daily') problem(`하루 무료 한도 안내: ${JSON.stringify(E['daily-all'])}`);
    if (!E['minute-once'].ok || E['minute-once'].calls.length !== 2 || !(E['minute-once'].ms >= 900) || !E['minute-once'].prog.some((p) => p.wait === 1)) problem(`1분 한도 → 기다렸다 다시 이상: ${JSON.stringify(E['minute-once'])}`);
    if (!E['model-404'].ok || E['model-404'].model !== 'gemini-3.8-flash-lite-tts') problem(`모델 없음(404) → 다른 모델 이상: ${JSON.stringify(E['model-404'])}`);
    if (E.network.ok || !/연결하지 못했습니다/.test(E.network.message)) problem(`연결 실패 안내: ${E.network.message}`);
    // 중간 조각에서 하루 한도 → 목소리가 섞이지 않게 바꾸지 않고 오류
    mode = 'pcm'; callNo = 0;
    await page.unroute('https://generativelanguage.googleapis.com/**').catch(() => {});
    let mid = 0;
    await page.route('https://generativelanguage.googleapis.com/**', (route) => {
      const rq = route.request();
      if (rq.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      const model = (/models\/([^:]+):generateContent/.exec(rq.url()) || [])[1] || '';
      report.calls.gemini.push({ mode: 'mid-daily', model });
      if (mid++ === 0) return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: pcm(0.3, 440).toString('base64') } }] } }] }) });
      return route.fulfill({ status: 429, contentType: 'application/json', headers: CORS, body: JSON.stringify({ error: { code: 429, message: 'quota', status: 'RESOURCE_EXHAUSTED', details: [{ '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] }] } }) });
    });
    const midR = await tryOne(longText);
    midR.calls = report.calls.gemini.filter((c) => c.mode === 'mid-daily').map((c) => c.model);
    report.errors['mid-daily'] = midR;
    if (midR.ok || midR.code !== 'daily' || midR.calls.join() !== 'gemini-3.8-flash-tts,gemini-3.8-flash-tts') problem(`중간 조각 하루 한도 처리 이상(모델을 바꾸면 안 됨): ${JSON.stringify(midR)}`);

    await page.close();

    // ── (b) 마이크 거부 · 마이크 없음 ──
    const tryMic = async (args) => {
      const b = await chromium.launch({ executablePath: EXE, args });
      browsers.push(b);
      const p = await b.newPage();
      await p.route(TEST_PAGE, blankPage);
      await p.goto(TEST_PAGE);
      return p.evaluate(async () => {
        const R = await import('/js/recorder.js');
        try { const r = await R.startRecording({}); r.cancel(); return { ok: true }; } catch (e) { return { ok: false, code: e.code, message: e.message }; }
      });
    };
    report.deny.denied = await tryMic(['--use-fake-device-for-media-stream', '--deny-permission-prompts']);
    report.deny.noDevice = await tryMic(['--use-fake-ui-for-media-stream']);
    const dn = report.deny;
    if (dn.denied.ok || dn.denied.code !== 'denied' || !/마이크 사용이 막혀 있습니다/.test(dn.denied.message)) problem(`마이크 거부 안내: ${JSON.stringify(dn.denied)}`);
    if (dn.noDevice.ok || dn.noDevice.code !== 'nodevice' || !/마이크를 찾지 못했습니다/.test(dn.noDevice.message)) problem(`마이크 없음 안내: ${JSON.stringify(dn.noDevice)}`);
  } catch (e) {
    problem(`예외: ${e.stack || e.message}`);
  } finally {
    for (const b of browsers) await b.close().catch(() => {});
  }
  if (report.consoleErrors.length) problem(`콘솔 오류 ${report.consoleErrors.length}건`);
  report.ok = report.problems.length === 0;
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  const g = (m) => report.gemini[m] && { split: report.gemini[m].split, calls: report.gemini[m].check?.calls, sec: report.gemini[m].decoded, expect: report.gemini[m].check?.expectSec, gaps: report.gemini[m].check?.gapsSilent };
  console.log(JSON.stringify({
    ok: report.ok, problems: report.problems, keysMode: report.keysMode,
    record: { mime: report.record.mime, size: report.record.blobSize, duration: report.record.duration, decoded: report.record.decoded, levelCalls: report.record.levelCalls, levelMax: report.record.levelMax },
    deny: report.deny, trim: { before: report.trim.before, after: report.trim.after, toneAt: report.trim.toneStartsAt },
    gemini: { pcm: g('pcm'), wav: g('wav') },
    errors: Object.fromEntries(Object.entries(report.errors).map(([k, v]) => [k, v.ok ? `ok ${v.model}` : v.message])),
    keys: report.keys.sent, consoleErrors: report.consoleErrors,
  }, null, 2));
  process.exit(report.ok ? 0 : 1);
})();
