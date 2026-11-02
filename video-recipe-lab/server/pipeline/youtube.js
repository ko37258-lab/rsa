// ① "잘된 영상 주소 넣기" — 유튜브 메타데이터 + 자막(대본) 가져오기
import { YoutubeTranscript } from 'youtube-transcript';

export function parseVideoId(url) {
  if (!url) return null;
  const s = url.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1, 12);
    if (u.searchParams.get('v')) return u.searchParams.get('v').slice(0, 11);
    const m = u.pathname.match(/\/(shorts|embed|live)\/([\w-]{11})/);
    if (m) return m[2];
  } catch {
    /* not a URL */
  }
  return null;
}

// oEmbed 는 키 없이 제목·채널·썸네일을 준다
export async function fetchMeta(videoId) {
  const watch = `https://www.youtube.com/watch?v=${videoId}`;
  try {
    const r = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(watch)}&format=json`);
    if (!r.ok) throw new Error(`oEmbed ${r.status}`);
    const j = await r.json();
    return {
      videoId,
      url: watch,
      title: j.title,
      author: j.author_name,
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    };
  } catch (e) {
    return { videoId, url: watch, title: null, author: null, thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`, metaError: String(e.message || e) };
  }
}

// 자막 스크래핑은 유튜브 정책 변경에 자주 깨진다 → 실패하면 사용자가 대본을 붙여넣게 한다
export async function fetchTranscript(videoId) {
  for (const lang of ['ko', undefined]) {
    try {
      const items = await YoutubeTranscript.fetchTranscript(videoId, lang ? { lang } : undefined);
      if (items?.length) {
        const text = items.map((i) => decodeEntities(i.text)).join(' ').replace(/\s+/g, ' ').trim();
        return { text, segments: items.length, lang: lang || 'auto' };
      }
    } catch {
      /* try next */
    }
  }
  return null;
}

function decodeEntities(s) {
  return s
    .replace(/&amp;#39;|&#39;/g, "'")
    .replace(/&amp;quot;|&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}
