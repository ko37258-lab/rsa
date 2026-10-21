import { match, HttpError, type Route } from "./router";
import { getDB, saveDB } from "./db";
import { commonRoutes } from "./handlers/common";
import { opsRoutes } from "./handlers/ops";
import { salesRoutes } from "./handlers/sales";
import { leasesRoutes } from "./handlers/leases";
import { billingRoutes } from "./handlers/billing";
import { platformRoutes } from "./handlers/platform";

// 구체적인 경로가 먼저 오도록: 각 영역 → 공통(":kinds" 같은 넓은 패턴) 순서
const routes: Route[] = [...platformRoutes, ...opsRoutes, ...salesRoutes, ...leasesRoutes, ...billingRoutes, ...commonRoutes];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** fetch 대신 쓰는 Mock 진입점. 원본과 같은 경로·같은 JSON 을 돌려준다 */
export async function mockFetch(path: string, method = "GET", body?: unknown): Promise<unknown> {
  await sleep(60 + Math.random() * 120);
  const url = new URL(path, "http://mock.local");
  const found = match(routes, method, url.pathname);
  if (!found) throw new HttpError(404, `${method} ${url.pathname} 은(는) 아직 없는 API`);
  getDB();
  const result = await found.route.handler({
    method,
    path: url.pathname,
    params: found.params,
    query: url.searchParams,
    body: body === undefined ? undefined : JSON.parse(JSON.stringify(body)),
  });
  if (method !== "GET") saveDB();
  // 화면이 Mock DB 를 직접 고치지 못하게 복사해서 넘긴다
  return result === undefined ? null : JSON.parse(JSON.stringify(result));
}

export { HttpError };
