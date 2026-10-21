import { mockFetch, HttpError } from "@/mock";

/**
 * API 클라이언트. VITE_API_BASE 가 비어 있으면 브라우저 안의 Mock API 를,
 * 값이 있으면 그 주소의 실제 백엔드(홈즈 PMS 호환 /api)를 부른다.
 */
const BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, "") ?? "";
export const API_MODE: "mock" | "live" = BASE ? "live" : "mock";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface ApiInit {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
}

export async function api<T>(path: string, init: ApiInit = {}): Promise<T> {
  const method = init.method ?? "GET";
  if (API_MODE === "mock") {
    try {
      return (await mockFetch(path, method, init.body)) as T;
    } catch (e) {
      if (e instanceof HttpError) throw new ApiError(e.status, e.message);
      throw e;
    }
  }
  const res = await fetch(BASE + path, {
    method,
    credentials: "include",
    headers: init.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (res.status === 401) {
    window.location.href = `${BASE}/api/auth/login?next=/`;
    throw new ApiError(401, "로그인이 필요하다");
  }
  const data = res.headers.get("content-type")?.includes("json") ? await res.json() : null;
  if (!res.ok) throw new ApiError(res.status, (data && (data.message || data.detail)) || `요청 실패 (${res.status})`);
  return data as T;
}
