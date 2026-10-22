// 영상 내보내기 — 프로젝트(장면·설정)와 소리를 받아 MP4/WEBM Blob 을 만듭니다.
// 기본 경로: 캔버스 captureStream + MediaRecorder (실시간 녹화, 영상 길이만큼 걸림).
// shorts.js(화면)와 스타일 일괄 내보내기가 같은 함수를 씁니다.

import { formatTime } from './util.js';
import { dims, buildTimeline, drawFrame, ensureFonts } from './shorts-render.js';

/** 이 브라우저가 쓸 수 있는 녹화 형식 */
export function pickMime(withAudio) {
  if (typeof MediaRecorder === 'undefined') return null;
  const list = withAudio
    ? ['video/mp4;codecs=avc1.640033,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    : ['video/mp4;codecs=avc1.640033', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  return list.find((m) => MediaRecorder.isTypeSupported(m)) || null;
}

export function canExport() {
  return !!pickMime(false) && !!HTMLCanvasElement.prototype.captureStream;
}

/**
 * 영상 한 편을 만듭니다.
 * @param {object} o
 * @param {object} o.project  장면·설정 (shorts-render 의 p)
 * @param {string} o.quality  '1080' | '720'
 * @param {(dest: AudioNode|null, offset: number, total: number) => () => void} [o.startAudio]  소리를 dest 로 보내고 멈춤 함수를 돌려주는 함수(없으면 무음)
 * @param {AudioContext} [o.audioCtx]
 * @param {(info: {t:number,total:number,text:string}) => void} [o.onProgress]
 * @param {AbortSignal} [o.signal]
 * @returns {Promise<{blob: Blob, ext: string, W: number, H: number, duration: number}>}
 */
export async function exportProject({ project, quality = '1080', startAudio = null, audioCtx = null, onProgress = () => {}, signal } = {}) {
  const withAudio = !!(startAudio && audioCtx);
  const mime = pickMime(withAudio);
  if (!mime || !HTMLCanvasElement.prototype.captureStream) {
    throw new Error('이 브라우저는 영상 녹화를 지원하지 않습니다. 크롬이나 엣지 최신 버전을 써 주세요.');
  }
  await ensureFonts(project);
  const { W, H } = dims(project.aspect, quality);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const timeline = buildTimeline(project);
  if (!timeline.total) throw new Error('장면이 없습니다.');
  drawFrame(ctx, project, W, H, 0, timeline);

  const stream = canvas.captureStream(30);
  let stopAudio = () => {};
  if (withAudio) {
    const dest = audioCtx.createMediaStreamDestination();
    dest.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr));
    stopAudio = startAudio(dest, 0, timeline.total) || (() => {});
  }
  const rec = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: quality === '720' ? 5_000_000 : 10_000_000,
    audioBitsPerSecond: 160_000,
  });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
  const stopped = new Promise((r) => { rec.onstop = r; });
  rec.start(250);
  const t0 = performance.now() + 50;
  let cancelled = false;
  const onAbort = () => { cancelled = true; };
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    await new Promise((resolve) => {
      const tick = () => {
        const t = (performance.now() - t0) / 1000;
        if (cancelled || t >= timeline.total) {
          drawFrame(ctx, project, W, H, timeline.total, timeline);
          resolve();
          return;
        }
        drawFrame(ctx, project, W, H, Math.max(0, t), timeline);
        onProgress({ t: Math.max(0, t), total: timeline.total, text: `녹화 중 ${formatTime(Math.max(0, t))} / ${formatTime(timeline.total)}` });
        if (document.hidden) setTimeout(tick, 1000 / 30);
        else requestAnimationFrame(tick);
      };
      tick();
    });
    await new Promise((r) => setTimeout(r, 200));
    rec.stop();
    stopAudio();
    await stopped;
    stream.getTracks().forEach((tr) => tr.stop());
    if (cancelled) throw new DOMException('내보내기를 멈췄습니다.', 'AbortError');
    const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
    return { blob: new Blob(chunks, { type: mime.split(';')[0] }), ext, W, H, duration: timeline.total };
  } finally {
    stopAudio();
    signal?.removeEventListener('abort', onAbort);
  }
}

/**
 * 같은 장면을 여러 스타일로 차례로 내보냅니다.
 * @param {object} o
 * @param {object} o.project  기본 프로젝트
 * @param {Array<{id:string,name:string,apply:(p:object)=>object}>} o.styles  스타일 목록(apply 는 복제된 프로젝트에 시각 설정을 입혀 돌려줌)
 * @param {(info:{index:number,count:number,style:object,t:number,total:number,text:string})=>void} [o.onProgress]
 * @param {AbortSignal} [o.signal]
 * @returns {Promise<Array<{style:object, blob:Blob, ext:string}>>}
 */
export async function exportStyles({ project, styles, quality = '1080', startAudio = null, audioCtx = null, onProgress = () => {}, signal } = {}) {
  const out = [];
  for (let i = 0; i < styles.length; i++) {
    if (signal?.aborted) break;
    const style = styles[i];
    const p = style.apply(structuredClone({ ...project, scenes: project.scenes.map((s) => ({ ...s })) , logo: null }));
    p.logo = project.logo;
    // 장면의 이미지 객체는 structuredClone 이 못 복사하므로 다시 잇는다.
    p.scenes.forEach((s, k) => { s.img = project.scenes[k]?.img || null; });
    const r = await exportProject({
      project: p, quality, startAudio, audioCtx, signal,
      onProgress: (info) => onProgress({ index: i, count: styles.length, style, ...info, text: `${i + 1}/${styles.length} ${style.name} — ${info.text}` }),
    });
    out.push({ style, ...r });
  }
  return out;
}
