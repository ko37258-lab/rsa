// 유튜브 검색 프록시 — "빵터진 영상 찾기". API 키(YOUTUBE_API_KEY)는 서버에만 있습니다.
// 읽기 전용 endpoint(search·videos)만 허용하고, 같은 요청은 10분 동안 엣지 캐시해 일일 한도를 아낍니다.
import { checkCode } from './_common.mjs';
const ALLOWED = new Set(['search', 'videos']);

export default async function handler(req, res) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return res.status(503).json({ error: { message: '서버에 YOUTUBE_API_KEY가 없습니다.' } });
  if (!checkCode(req, res)) return;
  const q = req.query || {};
  const ep = String(q.ep || '');
  if (!ALLOWED.has(ep)) return res.status(400).json({ error: { message: '허용되지 않은 요청입니다.' } });
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (k !== 'ep' && k !== 'key' && v != null) params.append(k, String(v));
  params.append('key', key);
  try {
    const r = await fetch(`https://www.googleapis.com/youtube/v3/${ep}?${params}`, { signal: AbortSignal.timeout(15_000) });
    const text = await r.text();
    res.setHeader('cache-control', 'public, s-maxage=600, stale-while-revalidate=1200');
    res.setHeader('content-type', 'application/json; charset=utf-8');
    return res.status(r.status).send(text);
  } catch {
    return res.status(502).json({ error: { message: '유튜브에 연결하지 못했습니다.' } });
  }
}
