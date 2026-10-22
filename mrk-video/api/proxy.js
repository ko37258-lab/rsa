// 이미지 프록시 — 브라우저가 직접 못 받는(CORS로 막힌) 상품 이미지를 서버가 대신 받아 전달합니다.
// 안전장치: http(s)만, 내부망 주소 차단(리다이렉트마다 다시 검사), 이미지 형식만, 20MB 제한, 15초 시간 제한.
import { lookup } from 'node:dns/promises';
import net from 'node:net';
import { checkCode } from './_common.mjs';

const MAX_BYTES = 20 * 1024 * 1024;
const MAX_REDIRECTS = 4;

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function isPrivateV4(ip) {
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19))
  );
}
export function isPrivateIp(ip) {
  if (net.isIPv4(ip)) return isPrivateV4(ip);
  const v = ip.toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
  if (mapped) return isPrivateV4(mapped[1]);
  return v === '::' || v === '::1' || v.startsWith('fc') || v.startsWith('fd') || /^fe[89ab]/.test(v);
}

async function assertPublic(rawUrl) {
  let u;
  try { u = new URL(rawUrl); } catch { throw new HttpError(400, '이미지 주소 형식이 올바르지 않습니다.'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new HttpError(400, 'http·https 주소만 받을 수 있습니다.');
  if (u.username || u.password) throw new HttpError(400, '계정 정보가 들어간 주소는 받을 수 없습니다.');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  let addrs;
  try { addrs = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true }); } catch { throw new HttpError(502, '주소의 서버를 찾을 수 없습니다.'); }
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new HttpError(400, '내부망 주소는 받을 수 없습니다.');
  return u;
}

async function readLimited(body) {
  const chunks = [];
  let size = 0;
  for await (const chunk of body) {
    size += chunk.length;
    if (size > MAX_BYTES) throw new HttpError(413, '이미지가 20MB보다 큽니다.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') throw new HttpError(405, 'GET 요청만 받습니다.');
    if (!checkCode(req, res)) return;
    let target = String(req.query?.url || '');
    if (!target) throw new HttpError(400, 'url 값이 없습니다.');
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const u = await assertPublic(target);
      const r = await fetch(u, {
        redirect: 'manual',
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; MRK-Video/1.0; +image-downloader)', accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8' },
        signal: AbortSignal.timeout(15_000),
      });
      const loc = r.headers.get('location');
      if (r.status >= 300 && r.status < 400 && loc) { target = new URL(loc, u).href; continue; }
      if (!r.ok) throw new HttpError(502, `원본 서버가 ${r.status} 응답을 보냈습니다.`);
      const type = (r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!type.startsWith('image/')) throw new HttpError(415, '이미지 파일이 아닙니다.');
      if (Number(r.headers.get('content-length') || 0) > MAX_BYTES) throw new HttpError(413, '이미지가 20MB보다 큽니다.');
      const buf = await readLimited(r.body);
      res.setHeader('content-type', type);
      res.setHeader('cache-control', 'private, max-age=3600');
      return res.status(200).send(buf);
    }
    throw new HttpError(508, '리다이렉트가 너무 많습니다.');
  } catch (e) {
    const status = e instanceof HttpError ? e.status : e?.name === 'TimeoutError' ? 504 : 502;
    const message = e instanceof HttpError ? e.message : status === 504 ? '원본 서버 응답이 너무 느립니다.' : '이미지를 받지 못했습니다.';
    res.setHeader('cache-control', 'no-store');
    return res.status(status).json({ error: message });
  }
}
