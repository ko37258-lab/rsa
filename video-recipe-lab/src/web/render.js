// 웹판 렌더 — ffmpeg 대신 브라우저의 캔버스 + WebCodecs 로 MP4 를 만든다. 서버 비용이 들지 않는다.
// 서버판(render.js)과 같은 연출: 켄번스 확대·축소, 키워드 띄우기, 자막 굽기, 썸네일.
import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import { splitLines } from '../../server/pipeline/subtitles.js';

export const W = 1280;
export const H = 720;
const FPS = 30;
const FONT = '"Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",sans-serif';
export const VISUAL_LABEL = { ai_image: 'AI 그림', stock: '스톡 영상', chart: '그래프', motion: '모션그래픽' };
const PALETTE = {
  ai_image: ['#1d1d1f', '#0b3d7a'],
  stock: ['#1c1c1e', '#3a4a5c'],
  chart: ['#1d1d1f', '#24456b'],
  motion: ['#1d1d1f', '#0058b0'],
};

const canvas2d = () => {
  const c = new OffscreenCanvas(W, H);
  return { c, g: c.getContext('2d') };
};

function fitFont(g, text, size, maxWidth, weight = 800) {
  let s = Math.round(size);
  g.font = `${weight} ${s}px ${FONT}`;
  while (s > 18 && g.measureText(text).width > maxWidth) {
    s -= 2;
    g.font = `${weight} ${s}px ${FONT}`;
  }
  return s;
}

function strokeText(g, text, x, y, fill, stroke, lw) {
  g.lineJoin = 'round';
  g.lineWidth = lw;
  g.strokeStyle = stroke;
  g.strokeText(text, x, y);
  g.fillStyle = fill;
  g.fillText(text, x, y);
}

const fillGradient = (g, [c0, c1]) => {
  const grad = g.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, c0);
  grad.addColorStop(1, c1);
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
};

/** 키 없이 쓰는 대체 카드: 장면 유형별 그라데이션 + 키워드 */
export async function placeholderCard({ text, visualType }) {
  const { c, g } = canvas2d();
  fillGradient(g, PALETTE[visualType] || PALETTE.ai_image);
  if (visualType === 'chart') {
    g.fillStyle = 'rgba(108,180,255,.28)';
    [0.18, 0.32, 0.55, 0.8].forEach((r, i) => {
      const bh = H * 0.5 * r;
      g.fillRect(W * (0.12 + i * 0.2), H * 0.86 - bh, W * 0.11, bh);
    });
  }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  // 모션그래픽·그래프 장면은 렌더 단계에서 키워드를 띄우므로 여기선 그리지 않는다
  if (text && visualType !== 'motion' && visualType !== 'chart') {
    fitFont(g, text, H / 9, W * 0.86);
    strokeText(g, text, W / 2, H / 2, '#fff', '#000', 10);
  }
  if (visualType) {
    g.textAlign = 'left';
    g.font = `700 ${Math.round(H / 30)}px ${FONT}`;
    g.fillStyle = '#6cb4ff';
    g.fillText(`[대체 이미지] ${VISUAL_LABEL[visualType] || ''}`, W * 0.09, H * 0.09);
  }
  return c.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
}

const coverRect = (bmp, zoom = 1) => {
  const s = Math.max(W / bmp.width, H / bmp.height) * zoom;
  const w = bmp.width * s;
  const h = bmp.height * s;
  return [(W - w) / 2, (H - h) / 2, w, h];
};

/** 썸네일: 배경 + 아래쪽 어둡게 + 두 줄 큰 글씨(흰색 / 강조색) */
export async function composeThumbnail({ background, line1, line2 }) {
  const { c, g } = canvas2d();
  if (background) {
    const bmp = await createImageBitmap(background);
    g.drawImage(bmp, ...coverRect(bmp));
    bmp.close();
  } else {
    fillGradient(g, PALETTE.ai_image);
  }
  g.fillStyle = 'rgba(0,0,0,.55)';
  g.fillRect(0, H * 0.42, W, H * 0.58);
  g.textAlign = 'center';
  g.textBaseline = 'top';
  if (line1) {
    fitFont(g, line1, 86, W * 0.92);
    strokeText(g, line1, W / 2, H * 0.47, '#fff', '#000', 14);
  }
  if (line2) {
    fitFont(g, line2, 128, W * 0.92);
    strokeText(g, line2, W / 2, H * 0.64, '#ffe600', '#000', 18);
  }
  return c.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
}

/** 자막 줄을 시간표로 — 서버판 buildSrt 와 같은 계산 */
function buildCues(timeline) {
  const cues = [];
  for (const sc of timeline) {
    const lines = splitLines(sc.narration);
    const total = lines.reduce((a, l) => a + l.length, 0) || 1;
    let t = sc.start;
    for (const l of lines) {
      const d = (sc.duration * l.length) / total;
      cues.push({ start: t, end: t + d - 0.05, text: l });
      t += d;
    }
  }
  return cues;
}

export const browserSupported = () => typeof VideoEncoder === 'function' && typeof AudioEncoder === 'function' && typeof OffscreenCanvas === 'function';

async function pickVideoCodec() {
  const base = { width: W, height: H, bitrate: 3_500_000, framerate: FPS };
  for (const [codec, mux] of [['avc1.640028', 'avc'], ['avc1.4D4028', 'avc'], ['avc1.42E028', 'avc'], ['vp09.00.31.08', 'vp9']]) {
    const config = { ...base, codec, ...(mux === 'avc' ? { avc: { format: 'avc' } } : {}) };
    if ((await VideoEncoder.isConfigSupported(config)).supported) return { config, mux };
  }
  throw new Error('이 브라우저는 영상 만들기를 지원하지 않습니다. PC의 크롬이나 엣지 최신 버전으로 열어 주세요.');
}

async function pickAudioCodec() {
  for (const [codec, mux, sampleRate] of [['mp4a.40.2', 'aac', 44100], ['mp4a.40.2', 'aac', 48000], ['opus', 'opus', 48000]]) {
    const config = { codec, numberOfChannels: 2, sampleRate, bitrate: 160_000 };
    if ((await AudioEncoder.isConfigSupported(config)).supported) return { config, mux };
  }
  throw new Error('이 브라우저는 소리 넣기를 지원하지 않습니다. PC의 크롬이나 엣지 최신 버전으로 열어 주세요.');
}

/** 장면별 소리를 하나로 잇는다. 소리 없는 장면은 그 길이만큼 비운다 */
function mixAudio(timeline, voices, total, sampleRate) {
  const off = new OfflineAudioContext(2, Math.ceil(total * sampleRate) + 1, sampleRate);
  timeline.forEach((sc, i) => {
    if (!voices[i]) return;
    const src = off.createBufferSource();
    src.buffer = voices[i];
    src.connect(off.destination);
    src.start(sc.start);
  });
  return off.startRendering();
}

async function encodeAudio(muxer, config, buffer) {
  let failure = null;
  const encoder = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: (e) => {
      failure = e;
    },
  });
  encoder.configure(config);
  const step = 4096;
  const l = buffer.getChannelData(0);
  const r = buffer.getChannelData(1);
  for (let i = 0; i < buffer.length; i += step) {
    if (failure) throw failure;
    const n = Math.min(step, buffer.length - i);
    const data = new Float32Array(n * 2);
    data.set(l.subarray(i, i + n), 0);
    data.set(r.subarray(i, i + n), n);
    const a = new AudioData({ format: 'f32-planar', sampleRate: config.sampleRate, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((i / config.sampleRate) * 1e6), data });
    encoder.encode(a);
    a.close();
    if (encoder.encodeQueueSize > 20) await new Promise((res) => setTimeout(res, 0));
  }
  await encoder.flush();
  if (failure) throw failure;
  encoder.close();
}

function drawFrame(g, t, sc, sceneT, bmp, cues) {
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, H);
  const p = sc.duration > 0 ? Math.min(1, sceneT / sc.duration) : 0;
  const zoom = sc.index % 2 === 0 ? 1 + 0.1 * p : 1.1 - 0.1 * p; // 짝수 장면 확대, 홀수 장면 축소
  g.drawImage(bmp, ...coverRect(bmp, zoom));
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (sc.onScreenText && (sc.visualType === 'motion' || sc.visualType === 'chart')) {
    g.globalAlpha = Math.min(1, sceneT / 0.5);
    fitFont(g, sc.onScreenText, H / 9, W * 0.88);
    strokeText(g, sc.onScreenText, W / 2, sc.visualType === 'motion' ? H * 0.44 : H * 0.16, '#ffd23f', '#000', 12);
    g.globalAlpha = 1;
  }
  const cue = cues.find((c) => t >= c.start && t < c.end);
  if (cue) {
    fitFont(g, cue.text, 42, W * 0.9, 700);
    g.textBaseline = 'alphabetic';
    strokeText(g, cue.text, W / 2, H - 44, '#fff', '#000', 8);
  }
}

/**
 * @param timeline [{index,start,duration,narration,visualType,onScreenText}]
 * @param images   장면별 그림 Blob
 * @param voices   장면별 AudioBuffer(무음이면 null)
 * @returns {{blob: Blob, audioCodec: string}} MP4
 */
export async function renderVideo({ timeline, images, voices, total, onProgress }) {
  const video = await pickVideoCodec();
  const audio = await pickAudioCodec();
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    fastStart: 'in-memory',
    video: { codec: video.mux, width: W, height: H },
    audio: { codec: audio.mux, numberOfChannels: 2, sampleRate: audio.config.sampleRate },
    firstTimestampBehavior: 'offset',
  });

  let failure = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      failure = e;
    },
  });
  encoder.configure(video.config);

  const { c, g } = canvas2d();
  const cues = buildCues(timeline);
  const frames = Math.ceil(total * FPS);
  let sceneIdx = 0;
  let bmp = await createImageBitmap(images[0]);
  for (let f = 0; f < frames; f++) {
    if (failure) throw failure;
    const t = f / FPS;
    while (sceneIdx < timeline.length - 1 && t >= timeline[sceneIdx + 1].start) {
      sceneIdx++;
      bmp.close();
      bmp = await createImageBitmap(images[sceneIdx]);
    }
    const sc = timeline[sceneIdx];
    drawFrame(g, t, sc, t - sc.start, bmp, cues);
    const vf = new VideoFrame(c, { timestamp: Math.round(t * 1e6), duration: Math.round(1e6 / FPS) });
    encoder.encode(vf, { keyFrame: f % (FPS * 2) === 0 });
    vf.close();
    if (encoder.encodeQueueSize > 8) await new Promise((res) => setTimeout(res, 0));
    if (f % 15 === 0) {
      onProgress?.(f / frames);
      await new Promise((res) => setTimeout(res, 0)); // 화면이 멈추지 않게 숨 쉴 틈을 준다
    }
  }
  bmp.close();
  await encoder.flush();
  if (failure) throw failure;
  encoder.close();

  const mixed = await mixAudio(timeline, voices, total, audio.config.sampleRate);
  await encodeAudio(muxer, audio.config, mixed);
  muxer.finalize();
  return { blob: new Blob([target.buffer], { type: 'video/mp4' }), audioCodec: audio.mux };
}
