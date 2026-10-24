// 내 목소리 녹음 — 마이크로 대본을 직접 읽어 내레이션으로 씁니다.
//  - 소리는 이 브라우저 안에서만 다룹니다(서버로 보내지 않음, 저장소에도 남기지 않음).
//  - 녹음 형식은 브라우저가 되는 것 순서: audio/webm;codecs=opus → audio/mp4(아이폰 사파리) → 브라우저 기본.
//  - 녹음이 끝나면 decodeAudio → trimSilence(앞뒤 무음 자르기) → audioBufferToWavBlob 순서로 다듬어 내레이션 자리에 넣습니다.
//
// 쓰는 법
//   if (!canRecord()) …                       // 버튼 숨기기·안내
//   const rec = await startRecording({ onLevel: (v) => meter.style.width = v * 100 + '%' });
//   const { blob, mime, duration } = await rec.stop();   // 또는 rec.cancel()
//   const buf = await trimSilence(await decodeAudio(blob));
//   const wav = audioBufferToWavBlob(buf);

/** 녹음 형식 후보(앞에서부터 되는 것을 씁니다). 빈 문자열 = 브라우저 기본 */
export const RECORD_TYPES = ['audio/webm;codecs=opus', 'audio/mp4', ''];
/** 한 번에 녹음할 수 있는 최대 길이(초). 넘으면 저절로 멈추고 stop() 이 그때까지의 녹음을 돌려줍니다. */
export const MAX_SECONDS = 600;

/** 이 브라우저에서 녹음할 수 있는지(마이크 기능·MediaRecorder·https). 권한까지는 눌러 봐야 압니다. */
export function canRecord() {
  try {
    if (window.isSecureContext === false) return false; // http 주소에서는 마이크가 막힘
    if (!navigator.mediaDevices?.getUserMedia || typeof window.MediaRecorder !== 'function') return false;
    // 페이지가 다른 페이지 안에 들어가 마이크가 막혀 있으면(크롬 계열만 알 수 있음) 녹음 불가
    const fp = document.featurePolicy || document.permissionsPolicy;
    if (fp?.allowsFeature && !fp.allowsFeature('microphone')) return false;
    return true;
  } catch {
    return false;
  }
}

/** 되는 녹음 형식 하나를 고릅니다(없으면 ''). */
export function pickRecordType() {
  for (const t of RECORD_TYPES) {
    if (!t) return '';
    try { if (window.MediaRecorder?.isTypeSupported?.(t)) return t; } catch { /* 다음 후보 */ }
  }
  return '';
}

/** getUserMedia 오류를 쉬운 한국어로. code: denied·nodevice·busy·other */
function micError(e) {
  const n = String(e?.name || '');
  const make = (code, text) => Object.assign(new Error(text), { code });
  if (n === 'NotAllowedError' || n === 'PermissionDeniedError' || n === 'SecurityError') {
    return make('denied', '마이크 사용이 막혀 있습니다. 주소창 옆 자물쇠(또는 사이트 설정) → 마이크 → 허용으로 바꾼 뒤 다시 눌러 주세요.');
  }
  if (n === 'NotFoundError' || n === 'DevicesNotFoundError' || n === 'OverconstrainedError') {
    return make('nodevice', '마이크를 찾지 못했습니다. 마이크(이어폰 마이크도 됩니다)를 연결했는지 확인해 주세요.');
  }
  if (n === 'NotReadableError' || n === 'TrackStartError' || n === 'AbortError') {
    return make('busy', '마이크를 열지 못했습니다. 다른 프로그램(줌·카카오톡 통화 등)이 마이크를 쓰고 있으면 끄고 다시 해 주세요.');
  }
  return make('other', '마이크를 켜지 못했습니다. 브라우저를 새로고침한 뒤 다시 해 주세요.');
}

const stopTracks = (stream) => { try { stream.getTracks().forEach((t) => t.stop()); } catch { /* 이미 멈춤 */ } };

/**
 * 소리 크기를 50ms 마다 onLevel(0~1, { rms, peak }) 으로 알려 줍니다. 계기판이 없어도 녹음은 계속됩니다.
 * 분석기는 소리 0 짜리 볼륨을 거쳐 스피커에 이어 둡니다(사파리는 끝까지 이어져야 분석함, 소리는 안 남).
 */
function startMeter(stream, onLevel) {
  if (typeof onLevel !== 'function') return { stop() {} };
  let ctx = null;
  let timer = 0;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser();
    an.fftSize = 1024;
    const mute = ctx.createGain();
    mute.gain.value = 0;
    src.connect(an);
    an.connect(mute);
    mute.connect(ctx.destination);
    ctx.resume?.().catch?.(() => {});
    const buf = new Float32Array(an.fftSize);
    timer = setInterval(() => {
      an.getFloatTimeDomainData(buf);
      let sum = 0;
      let peak = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = buf[i];
        sum += v * v;
        const a = v < 0 ? -v : v;
        if (a > peak) peak = a;
      }
      const rms = Math.sqrt(sum / buf.length);
      try { onLevel(Math.min(1, rms * 4), { rms, peak }); } catch { /* 화면 표시 문제는 무시 */ }
    }, 50);
  } catch { /* 계기판 없이 녹음만 */ }
  return {
    stop() {
      clearInterval(timer);
      try { ctx?.close?.().catch?.(() => {}); } catch { /* 이미 닫힘 */ }
    },
  };
}

/**
 * 녹음을 시작합니다. 마이크 권한을 물어보고, 거부·마이크 없음은 한국어 Error(code: denied·nodevice·busy·other)를 던집니다.
 * @param {{ onLevel?: (level: number, info: { rms: number, peak: number }) => void, maxSeconds?: number }} [o]
 * @returns {Promise<{ mime: string, readonly state: string, readonly elapsed: number, stop(): Promise<{ blob: Blob, mime: string, duration: number }>, cancel(): void }>}
 */
export async function startRecording({ onLevel, maxSeconds = MAX_SECONDS } = {}) {
  if (!canRecord()) {
    const why = window.isSecureContext === false ? ' https 주소에서 열어 주세요.' : ' 크롬·엣지·사파리 최신 버전에서 해 주세요.';
    throw Object.assign(new Error('이 브라우저에서는 녹음이 안 됩니다.' + why), { code: 'unsupported' });
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  } catch (e) {
    throw micError(e);
  }
  if (!stream.getAudioTracks().length) { stopTracks(stream); throw micError({ name: 'NotFoundError' }); }

  const want = pickRecordType();
  let rec;
  try {
    rec = want ? new MediaRecorder(stream, { mimeType: want }) : new MediaRecorder(stream);
  } catch {
    try { rec = new MediaRecorder(stream); } catch {
      stopTracks(stream);
      throw Object.assign(new Error('이 브라우저에서는 녹음을 시작하지 못했습니다. 크롬·엣지·사파리 최신 버전에서 해 주세요.'), { code: 'unsupported' });
    }
  }

  const chunks = [];
  let t0 = 0;
  let t1 = 0;
  let timer = 0;
  let cancelled = false;
  let resolveDone;
  let rejectDone;
  const done = new Promise((res, rej) => { resolveDone = res; rejectDone = rej; });
  done.catch(() => {}); // 아무도 기다리지 않을 때(취소 등) 처리 안 된 오류로 남지 않게
  const meter = startMeter(stream, onLevel);
  const cleanup = () => { clearTimeout(timer); meter.stop(); stopTracks(stream); };
  const finish = () => { if (rec.state !== 'inactive') { t1 = t1 || performance.now(); try { rec.stop(); } catch { cleanup(); } } };

  rec.ondataavailable = (ev) => { if (ev.data && ev.data.size) chunks.push(ev.data); };
  rec.onstop = () => {
    t1 = t1 || performance.now();
    cleanup();
    if (cancelled) return;
    const type = rec.mimeType || want || chunks[0]?.type || 'audio/webm';
    const blob = new Blob(chunks, { type });
    if (!blob.size) { rejectDone(Object.assign(new Error('녹음된 소리가 없습니다. 마이크를 확인하고 다시 녹음해 주세요.'), { code: 'empty' })); return; }
    resolveDone({ blob, mime: type, duration: Math.max(0, (t1 - t0) / 1000) });
  };
  rec.onerror = () => {
    cleanup();
    rejectDone(Object.assign(new Error('녹음 중에 문제가 생겼습니다. 다시 녹음해 주세요.'), { code: 'other' }));
  };
  // 녹음 중 마이크가 빠지면 거기까지 녹음한 것으로 멈춘다
  stream.getAudioTracks().forEach((t) => t.addEventListener('ended', finish));

  try {
    rec.start(250); // 0.25초마다 조각을 받아 둔다(멈출 때 끝부분이 잘리지 않게)
  } catch {
    cleanup();
    throw Object.assign(new Error('녹음을 시작하지 못했습니다. 페이지를 새로고침한 뒤 다시 해 주세요.'), { code: 'other' });
  }
  t0 = performance.now();
  if (maxSeconds > 0) timer = setTimeout(finish, maxSeconds * 1000);

  return {
    mime: rec.mimeType || want,
    /** 'recording' | 'inactive' */
    get state() { return rec.state; },
    /** 지금까지 녹음한 초 */
    get elapsed() { return t0 ? ((t1 || performance.now()) - t0) / 1000 : 0; },
    /** 녹음을 멈추고 결과를 돌려줍니다. 이미 멈춘(최대 길이 도달·마이크 빠짐) 뒤에 불러도 같은 결과를 줍니다. */
    stop() { finish(); return done; },
    /** 녹음을 버립니다(마이크도 끕니다). */
    cancel() {
      if (cancelled) return;
      cancelled = true;
      if (rec.state !== 'inactive') { try { rec.stop(); } catch { cleanup(); } } else cleanup();
      rejectDone(Object.assign(new Error('녹음을 취소했습니다.'), { name: 'AbortError', code: 'cancelled' }));
    },
  };
}

/** 녹음(또는 소리 파일) Blob 을 AudioBuffer 로 풉니다. */
export async function decodeAudio(blob) {
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = new AC();
  try {
    const ab = await blob.arrayBuffer();
    return await new Promise((resolve, reject) => {
      // 옛 사파리는 Promise 를 돌려주지 않고 콜백만 부르므로 둘 다 받는다
      const p = ctx.decodeAudioData(ab, resolve, reject);
      p?.then?.(resolve, reject);
    });
  } catch {
    throw new Error('녹음한 소리를 읽지 못했습니다. 다시 녹음해 주세요.');
  } finally {
    try { ctx.close?.().catch?.(() => {}); } catch { /* 이미 닫힘 */ }
  }
}

/** 새 AudioBuffer 를 만듭니다(옛 브라우저는 OfflineAudioContext 로). */
function makeBuffer(numberOfChannels, length, sampleRate) {
  try {
    return new AudioBuffer({ numberOfChannels, length, sampleRate });
  } catch {
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    return new OAC(numberOfChannels, length, sampleRate).createBuffer(numberOfChannels, length, sampleRate);
  }
}

/**
 * 앞뒤 무음을 잘라 냅니다. 20ms 창마다 소리 크기(RMS)를 재서 threshold 이상인 첫 창과 마지막 창을 찾고,
 * 그 앞뒤로 pad 초씩 여유를 남깁니다. 잘린 끝은 5ms 동안 서서히 켜고 꺼서 '딱' 소리가 나지 않게 합니다.
 * 전부 조용하거나 자를 게 없으면 받은 버퍼를 그대로 돌려줍니다.
 * @param {AudioBuffer} buffer
 * @param {{ threshold?: number, pad?: number }} [o]
 * @returns {Promise<AudioBuffer>}
 */
export async function trimSilence(buffer, { threshold = 0.02, pad = 0.15 } = {}) {
  if (!buffer || !buffer.length) return buffer;
  const sr = buffer.sampleRate;
  const n = buffer.length;
  const chs = buffer.numberOfChannels;
  const data = [];
  for (let c = 0; c < chs; c++) data.push(buffer.getChannelData(c));
  const win = Math.max(1, Math.round(sr * 0.02));
  const loud = (start) => {
    const end = Math.min(n, start + win);
    let sum = 0;
    for (let i = start; i < end; i++) {
      let m = 0;
      for (let c = 0; c < chs; c++) { const a = Math.abs(data[c][i]); if (a > m) m = a; }
      sum += m * m;
    }
    return Math.sqrt(sum / (end - start)) >= threshold;
  };
  let first = -1;
  for (let s = 0; s < n; s += win) if (loud(s)) { first = s; break; }
  if (first < 0) return buffer; // 전부 조용함 — 지우지 않고 그대로
  let last = Math.min(n, first + win);
  for (let s = Math.floor((n - 1) / win) * win; s > first; s -= win) if (loud(s)) { last = Math.min(n, s + win); break; }
  const p = Math.round(sr * Math.max(0, Number(pad) || 0));
  const a = Math.max(0, first - p);
  const b = Math.min(n, last + p);
  if (a === 0 && b === n) return buffer;

  const out = makeBuffer(chs, b - a, sr);
  const fade = Math.min(Math.round(sr * 0.005), Math.floor((b - a) / 2));
  for (let c = 0; c < chs; c++) {
    const d = out.getChannelData(c);
    d.set(data[c].subarray(a, b));
    if (a > 0) for (let i = 0; i < fade; i++) d[i] *= i / fade;
    if (b < n) for (let i = 0; i < fade; i++) d[d.length - 1 - i] *= i / fade;
  }
  return out;
}

/** AudioBuffer 를 16비트 PCM WAV 파일(Blob, audio/wav)로 만듭니다. 채널은 그대로 둡니다. */
export function audioBufferToWavBlob(buffer) {
  const chs = buffer.numberOfChannels;
  const n = buffer.length;
  const sr = buffer.sampleRate;
  const dataLen = n * chs * 2;
  const ab = new ArrayBuffer(44 + dataLen);
  const v = new DataView(ab);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF');
  v.setUint32(4, 36 + dataLen, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true); // fmt 덩어리 길이
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, chs, true);
  v.setUint32(24, sr, true);
  v.setUint32(28, sr * chs * 2, true); // 초당 바이트
  v.setUint16(32, chs * 2, true); // 한 샘플 묶음 바이트
  v.setUint16(34, 16, true); // 비트
  str(36, 'data');
  v.setUint32(40, dataLen, true);
  const data = [];
  for (let c = 0; c < chs; c++) data.push(buffer.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < chs; c++) {
      let s = data[c][i];
      s = s < -1 ? -1 : s > 1 ? 1 : s || 0;
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return new Blob([ab], { type: 'audio/wav' });
}
