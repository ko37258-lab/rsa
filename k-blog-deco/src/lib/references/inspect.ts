import "server-only";
import dns from "node:dns/promises";
import net from "node:net";
import { ApiError } from "@/lib/api/http";

/**
 * 레퍼런스 URL 분석 — 서버가 대신 페이지를 받아 색·폰트·메뉴·제목·대표 이미지를 뽑습니다.
 * SSRF 방지: http(s)/기본 포트만, 사설·루프백·링크로컬 IP 차단, 리다이렉트마다 재검증, 크기·시간 제한.
 */
const MAX_HTML = 1_500_000;
const MAX_IMG = 3_000_000;
const UA = "Mozilla/5.0 (compatible; KBlogDecoBot/1.0; +reference-inspector)";

function ipv4Private(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) return ipv4Private(ip);
  const v = ip.toLowerCase();
  if (v === "::" || v === "::1") return true;
  if (v.startsWith("::ffff:")) return ipv4Private(v.slice(7));
  return v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb");
}

async function assertPublicUrl(raw: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new ApiError(400, "invalid_url", "올바른 URL 이 아닙니다.");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new ApiError(400, "invalid_url", "http/https 주소만 분석할 수 있습니다.");
  if (u.port && u.port !== "80" && u.port !== "443") throw new ApiError(400, "invalid_url", "기본 포트(80/443) 주소만 분석할 수 있습니다.");
  if (u.username || u.password) throw new ApiError(400, "invalid_url", "계정 정보가 포함된 URL 은 사용할 수 없습니다.");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new ApiError(400, "invalid_url", "내부 주소는 분석할 수 없습니다.");
  }
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true }).catch(() => []);
  if (!addrs.length) throw new ApiError(400, "dns_failed", "주소를 찾을 수 없습니다.");
  if (addrs.some((a) => isPrivateAddress(a.address))) throw new ApiError(400, "invalid_url", "내부 네트워크 주소는 분석할 수 없습니다.");
  return u;
}

async function safeFetch(raw: string, maxBytes: number, accept: string) {
  let url = raw;
  for (let hop = 0; hop < 5; hop++) {
    const u = await assertPublicUrl(url);
    const res = await fetch(u, {
      redirect: "manual",
      signal: AbortSignal.timeout(9000),
      headers: { "User-Agent": UA, Accept: accept, "Accept-Language": "ko-KR,ko;q=0.9" },
      cache: "no-store",
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location")!, u).toString();
      continue;
    }
    if (!res.ok || !res.body) throw new ApiError(502, "fetch_failed", `페이지를 불러오지 못했습니다 (HTTP ${res.status}).`);
    const len = Number(res.headers.get("content-length") || 0);
    if (len > maxBytes) throw new ApiError(413, "too_large", "파일이 너무 큽니다.");
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        break;
      }
      chunks.push(value);
    }
    const buf = new Uint8Array(total > maxBytes ? chunks.reduce((s, c) => s + c.byteLength, 0) : total);
    let off = 0;
    for (const c of chunks) {
      buf.set(c, off);
      off += c.byteLength;
    }
    return { finalUrl: u.toString(), contentType: res.headers.get("content-type") || "", bytes: buf };
  }
  throw new ApiError(502, "too_many_redirects", "리다이렉트가 너무 많습니다.");
}

const decodeEntities = (s: string) =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));

const stripTags = (s: string) => decodeEntities(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

function meta(html: string, key: string): string {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${key}["'][^>]*>`, "i");
  const tag = html.match(re)?.[0];
  return tag ? decodeEntities(tag.match(/content=["']([^"']*)["']/i)?.[1] ?? "").trim() : "";
}

function toHex(c: string): string | null {
  c = c.toLowerCase();
  if (c.startsWith("#")) {
    const h = c.slice(1);
    if (h.length === 3) return "#" + h.split("").map((x) => x + x).join("").toUpperCase();
    if (h.length === 6) return "#" + h.toUpperCase();
    return null;
  }
  const m = c.match(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/);
  if (!m) return null;
  return "#" + [m[1], m[2], m[3]].map((n) => Math.min(255, Number(n)).toString(16).padStart(2, "0")).join("").toUpperCase();
}

export type Inspected = {
  title: string;
  description: string;
  colors: string[];
  fonts: string[];
  headings: string[];
  navLabels: string[];
};

export function extractFromHtml(html: string, baseUrl: string) {
  const css = [
    ...Array.from(html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi), (m) => m[1]),
    ...Array.from(html.matchAll(/style=["']([^"']+)["']/gi), (m) => m[1]),
  ].join("\n");

  const colorCount = new Map<string, number>();
  for (const m of css.matchAll(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b|rgba?\([^)]+\)/gi)) {
    const hex = toHex(m[0]);
    if (hex) colorCount.set(hex, (colorCount.get(hex) ?? 0) + 1);
  }
  const themeColor = toHex(meta(html, "theme-color"));
  const colors = [
    ...(themeColor ? [themeColor] : []),
    ...[...colorCount.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c),
  ].filter((c, i, arr) => arr.indexOf(c) === i).slice(0, 12);

  const fonts = [
    ...new Set(
      Array.from(css.matchAll(/font-family\s*:\s*([^;}{]+)/gi), (m) => m[1].split(",")[0].replace(/["']/g, "").trim()).filter(
        (f) => f && !/^(inherit|initial|sans-serif|serif|monospace|-apple-system|system-ui)$/i.test(f),
      ),
    ),
  ].slice(0, 8);

  const headings = Array.from(html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi), (m) => stripTags(m[1]))
    .filter((t) => t && t.length <= 120)
    .slice(0, 10);

  const navHtml = Array.from(html.matchAll(/<(nav|header)[^>]*>([\s\S]*?)<\/\1>/gi), (m) => m[2]).join("\n");
  const navLabels = [
    ...new Set(Array.from(navHtml.matchAll(/<a[^>]*>([\s\S]*?)<\/a>/gi), (m) => stripTags(m[1])).filter((t) => t && t.length <= 30)),
  ].slice(0, 15);

  const titleTag = stripTags(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  const inspected: Inspected = {
    title: (meta(html, "og:title") || titleTag).slice(0, 200),
    description: (meta(html, "og:description") || meta(html, "description")).slice(0, 400),
    colors,
    fonts,
    headings,
    navLabels,
  };

  const imageUrls: string[] = [];
  const og = meta(html, "og:image");
  if (og) imageUrls.push(og);
  // 네이버 블로그 스킨/타이틀 등 CSS 배경 이미지
  for (const m of css.matchAll(/url\(\s*["']?(https?:\/\/[^"')\s]+)["']?\s*\)/gi)) {
    if (/\.(png|jpe?g|webp|gif)(\?|$)/i.test(m[1]) || /pstatic\.net/.test(m[1])) imageUrls.push(m[1]);
  }
  const resolved = [...new Set(imageUrls.map((u) => { try { return new URL(u, baseUrl).toString(); } catch { return ""; } }).filter(Boolean))];
  return { inspected, imageUrls: resolved.slice(0, 3) };
}

/** blog.naver.com/{id} 는 프레임 페이지라 실제 내용이 있는 PostList 주소로 바꿉니다. */
function naverBlogTarget(raw: string): string {
  try {
    const u = new URL(raw);
    const m = u.pathname.match(/^\/([A-Za-z0-9_-]{3,40})\/?$/);
    if ((u.hostname === "blog.naver.com" || u.hostname === "m.blog.naver.com") && m) {
      return `https://blog.naver.com/PostList.naver?blogId=${m[1]}`;
    }
  } catch {}
  return raw;
}

export async function inspectUrl(raw: string) {
  const target = naverBlogTarget(raw.trim());
  const page = await safeFetch(target, MAX_HTML, "text/html,application/xhtml+xml");
  if (!/html|xml|text\/plain/.test(page.contentType) && page.contentType) {
    throw new ApiError(400, "not_html", "웹페이지(HTML) 주소가 아닙니다. 이미지라면 '이미지 업로드'를 이용해 주세요.");
  }
  const html = new TextDecoder("utf-8").decode(page.bytes);
  return { ...extractFromHtml(html, page.finalUrl), finalUrl: page.finalUrl };
}

export async function fetchImage(url: string) {
  const r = await safeFetch(url, MAX_IMG, "image/*");
  return r.bytes;
}
