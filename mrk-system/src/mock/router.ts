/**
 * 아주 작은 경로 라우터. 원본 PMS 와 같은 "/api/..." 경로를 브라우저 안에서 처리한다.
 * 패턴 예: "GET /api/leases/:id/ledger"
 */
export interface Req {
  method: string;
  path: string;
  params: Record<string, string>;
  query: URLSearchParams;
  body: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export type Handler = (req: Req) => unknown;

export interface Route {
  method: string;
  pattern: string;
  handler: Handler;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** 404 를 던지는 찾기 도우미 */
export function must<T>(v: T | undefined | null, what = "대상"): T {
  if (v === undefined || v === null) throw new HttpError(404, `${what}을(를) 찾지 못했다`);
  return v;
}

export function route(spec: string, handler: Handler): Route {
  const [method, pattern] = spec.split(" ");
  return { method, pattern, handler };
}

export function match(routes: Route[], method: string, path: string): { route: Route; params: Record<string, string> } | null {
  const segs = path.split("/").filter(Boolean);
  for (const r of routes) {
    if (r.method !== method) continue;
    const ps = r.pattern.split("/").filter(Boolean);
    if (ps.length !== segs.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < ps.length; i++) {
      if (ps[i].startsWith(":")) params[ps[i].slice(1)] = decodeURIComponent(segs[i]);
      else if (ps[i] !== segs[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return { route: r, params };
  }
  return null;
}
