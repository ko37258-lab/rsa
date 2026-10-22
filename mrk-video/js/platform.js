// 실행 환경에 맞춰 "파일 저장"과 "AI 호출"을 처리합니다.
//  - 클로드 아티팩트 안: downloads·sample 기능(claude.use)을 사용
//  - 일반 웹 배포(Vercel 등): 브라우저 다운로드 + /api/* 서버 함수 사용

import { store } from './util.js';

export const inArtifact = typeof window.claude?.use === 'function';

// 서버 함수 위치: 단독 배포면 ./api/, ko372.com 안(/mrk-video/)이면 /api/mrk-video/
export const API = /\/mrk-video\//.test(location.pathname) ? '/api/mrk-video/' : 'api/';

const capCache = new Map();
function useCap(name) {
  if (!inArtifact) return Promise.resolve(null);
  if (!capCache.has(name)) capCache.set(name, window.claude.use(name).catch(() => null));
  return capCache.get(name);
}

/** 서버 함수(api/health)가 있는지 한 번만 확인합니다. */
let serverP;
export function serverInfo() {
  if (inArtifact) return Promise.resolve({ ai: false, proxy: false, needsCode: false, youtube: false });
  serverP ??= fetch(API + 'health', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => ({ ai: !!j?.ai, proxy: !!j?.proxy, needsCode: !!j?.needsCode, youtube: !!j?.youtube }))
    .catch(() => ({ ai: false, proxy: false, needsCode: false, youtube: false }));
  return serverP;
}

export function accessCode() { return store.get('accessCode', ''); }
export function setAccessCode(v) { store.set('accessCode', v || ''); }

export const canPickFolder = !inArtifact && typeof window.showDirectoryPicker === 'function';

const SAVE_ERRORS = {
  rejected_extension: '이 형식은 여기서 저장할 수 없습니다.',
  extension_not_enabled: '이 형식은 이 화면에서 저장할 수 없습니다.',
  too_large: '파일이 너무 커서 저장하지 못했습니다. 화질을 낮춰 다시 만들어 보세요.',
  rate_limited: '저장 창이 이미 열려 있습니다. 잠시 뒤 다시 눌러 주세요.',
};

/** 파일 하나 저장. 사용자가 취소하면 false. */
export async function saveBlob(blob, filename) {
  if (inArtifact) {
    const dl = await useCap('downloads');
    if (!dl) throw new Error('이 화면에서는 파일 저장을 쓸 수 없습니다.');
    try {
      await dl.save({ filename, data: blob });
      return true;
    } catch (e) {
      if (e?.code === 'declined') return false;
      throw new Error(SAVE_ERRORS[e?.code] || '파일을 저장하지 못했습니다.');
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}

/**
 * 여러 파일을 한 번에 저장할 곳을 엽니다.
 * kind: 'folder'(내 PC 폴더에 바로 쓰기, 크롬·엣지) | 'zip'(ZIP 하나로 묶어 저장)
 * 반드시 버튼 클릭 직후(다른 await 전에) 호출해야 폴더 선택 창이 뜹니다.
 */
export async function openSink(kind, zipName) {
  if (kind === 'folder' && canPickFolder) {
    const dir = await window.showDirectoryPicker({ mode: 'readwrite', id: 'mrk-out' });
    return {
      label: `폴더 "${dir.name}"`,
      async add(name, blob) {
        const fh = await dir.getFileHandle(name, { create: true });
        const w = await fh.createWritable();
        await w.write(blob);
        await w.close();
      },
      async finish() { return true; },
    };
  }
  if (typeof window.JSZip !== 'function') throw new Error('ZIP 도구를 불러오지 못했습니다. 인터넷 연결을 확인하고 새로고침하세요.');
  const zip = new window.JSZip();
  let count = 0;
  return {
    label: zipName,
    async add(name, blob) { zip.file(name, blob); count++; },
    async finish() {
      if (!count) return false;
      const out = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
      return saveBlob(out, zipName);
    },
  };
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** AI 사용 가능 여부 */
export async function aiAvailable() {
  if (inArtifact) return !!(await useCap('sample'));
  return (await serverInfo()).ai;
}

/**
 * 쇼츠 대본 생성. params = { topic, style, scenes, channel }
 * 아티팩트에서는 보는 사람의 Claude로, 배포 버전에서는 서버(api/ai)로 요청합니다.
 */
export async function generateScript(params) {
  const { buildScriptPrompt, normalizeScriptParams, normalizeScriptResult } = await import('./script-prompt.js');
  const p = normalizeScriptParams(params);
  if (inArtifact) {
    const sample = await useCap('sample');
    if (!sample) throw new Error('이 화면에서는 AI를 쓸 수 없습니다.');
    try {
      const data = await sample.json(buildScriptPrompt(p), { modelTier: 'default' });
      return normalizeScriptResult(data);
    } catch (e) {
      const msg = {
        not_granted: 'AI 사용을 허용하지 않아 대본을 만들지 않았습니다.',
        rate_limited: '요청이 많습니다. 잠시 뒤 다시 눌러 주세요.',
        cancelled: '대본 만들기를 멈췄습니다.',
      }[e?.code];
      throw new Error(msg || 'AI 대본을 만들지 못했습니다. 주제를 조금 바꿔 다시 시도해 보세요.');
    }
  }
  const res = await fetch(API + 'ai', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-access-code': accessCode() },
    body: JSON.stringify(p),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `AI 서버 오류 (${res.status})`);
  return normalizeScriptResult(data);
}

/** 외부 이미지 주소 → Blob. 먼저 직접 받고, 막히면 서버 프록시(api/proxy)로 받습니다. */
export async function fetchImageBlob(url, signal) {
  let directErr;
  try {
    const r = await fetch(url, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer', signal });
    if (r.ok) {
      const b = await r.blob();
      if (b.size > 0 && (b.type.startsWith('image/') || /^$|octet-stream/.test(b.type))) return b;
      directErr = new Error('이미지 파일이 아닙니다.');
    } else {
      directErr = new Error(`응답 ${r.status}`);
    }
  } catch (e) {
    if (e?.name === 'AbortError') throw e;
    directErr = e;
  }
  const info = await serverInfo();
  if (!info.proxy) {
    throw new Error(inArtifact
      ? '이 미리보기 화면에서는 외부 이미지에 접근할 수 없습니다. 인터넷 배포 버전에서 써 주세요.'
      : '사이트가 직접 받기를 막았습니다(CORS). 서버 프록시가 있는 배포 버전에서 다시 시도하세요.');
  }
  const r = await fetch(API + 'proxy?url=' + encodeURIComponent(url), {
    headers: { 'x-access-code': accessCode() },
    signal,
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j.error || directErr?.message || `프록시 응답 ${r.status}`);
  }
  return r.blob();
}

/** 유튜브에서 주제로 조회수 높은 쇼츠를 찾습니다(서버에 YOUTUBE_API_KEY 가 있을 때). 없으면 null. */
export async function findViralShorts(topic, { max = 12 } = {}) {
  const info = await serverInfo();
  if (!info.youtube) return null;
  const yt = API === 'api/' ? 'api/youtube' : '/api/youtube';
  const after = new Date(Date.now() - 365 * 864e5).toISOString();
  const q = new URLSearchParams({ ep: 'search', part: 'snippet', type: 'video', videoDuration: 'short', order: 'viewCount', maxResults: String(max), regionCode: 'KR', relevanceLanguage: 'ko', publishedAfter: after, q: `${topic} #shorts` });
  const sr = await fetch(`${yt}?${q}`, { headers: { 'x-access-code': accessCode() } });
  const sj = await sr.json().catch(() => ({}));
  if (!sr.ok) throw new Error(sj?.error?.message || `유튜브 검색 실패 (${sr.status})`);
  const items = (sj.items || []).filter((it) => it.id?.videoId);
  if (!items.length) return [];
  const ids = items.map((it) => it.id.videoId).join(',');
  const vr = await fetch(`${yt}?${new URLSearchParams({ ep: 'videos', part: 'statistics,snippet', id: ids })}`, { headers: { 'x-access-code': accessCode() } });
  const vj = await vr.json().catch(() => ({}));
  const stats = Object.fromEntries((vj.items || []).map((v) => [v.id, v]));
  return items.map((it) => {
    const v = stats[it.id.videoId];
    return {
      id: it.id.videoId,
      title: it.snippet.title,
      channel: it.snippet.channelTitle,
      thumb: it.snippet.thumbnails?.high?.url || it.snippet.thumbnails?.medium?.url || '',
      views: Number(v?.statistics?.viewCount || 0),
      likes: Number(v?.statistics?.likeCount || 0),
      publishedAt: it.snippet.publishedAt,
      url: `https://www.youtube.com/shorts/${it.id.videoId}`,
      description: v?.snippet?.description || '',
    };
  }).sort((a, b) => b.views - a.views);
}

export const youtubeSearchUrl = (topic) => `https://www.youtube.com/results?search_query=${encodeURIComponent(topic + ' #shorts')}&sp=CAMSAhAB`;
