import "server-only";
import { NextResponse, connection, type NextRequest } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { env } from "@/lib/env";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { resolveToken } from "@/lib/auth/tokens";
import { findUser, onboardingNeeds } from "@/lib/auth/users";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what = "리소스") => new ApiError(404, "not_found", `${what}를 찾을 수 없습니다.`);

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function errorJson(err: unknown) {
  if (err instanceof ApiError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message, details: err.details } },
      { status: err.status },
    );
  }
  if (err instanceof z.ZodError) {
    return NextResponse.json(
      { error: { code: "invalid_request", message: "요청 형식이 올바르지 않습니다.", details: z.flattenError(err) } },
      { status: 400 },
    );
  }
  console.error("[api] unexpected error", err);
  return NextResponse.json(
    { error: { code: "internal_error", message: "서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." } },
    { status: 500 },
  );
}

type Handler<C> = (req: NextRequest, ctx: C) => Promise<Response>;

/** 모든 API 라우트 공통 래퍼: 항상 요청 시점에 실행하고, 예외를 일관된 JSON 에러로 변환 */
export function route<C>(fn: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    await connection();
    try {
      return await fn(req, ctx);
    } catch (err) {
      unstable_rethrow(err); // Next.js 내부 제어 흐름 오류는 그대로 전달
      return errorJson(err);
    }
  };
}

const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * 인증: (1) Authorization: Bearer kbd_... 개인 API 토큰, (2) 세션 쿠키.
 * 쿠키 인증 + 상태 변경 요청은 Origin 검사로 CSRF 를 막습니다.
 * 약관 미동의(403 terms_required)·회원 코드 미확인(403 member_required) 사용자는 막습니다 (첫 이용 화면용 요청은 allowUnagreed 로 예외).
 */
export async function requireUser(req: NextRequest, opts: { allowUnagreed?: boolean } = {}) {
  const auth = req.headers.get("authorization");
  let userId: string | null = null;
  if (auth?.toLowerCase().startsWith("bearer ")) {
    userId = await resolveToken(auth.slice(7).trim());
    if (!userId) throw new ApiError(401, "invalid_token", "API 토큰이 유효하지 않습니다.");
  } else {
    const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
    if (session) {
      if (UNSAFE.has(req.method)) assertSameOrigin(req);
      userId = session.uid;
    }
  }
  if (!userId) throw new ApiError(401, "unauthorized", "로그인이 필요합니다.");
  const user = await findUser(userId);
  if (!user) throw new ApiError(401, "unauthorized", "사용자 정보를 찾을 수 없습니다. 다시 로그인해 주세요.");
  if (!opts.allowUnagreed) {
    const needs = onboardingNeeds(user);
    if (needs.terms) throw new ApiError(403, "terms_required", "서비스를 이용하려면 이용약관과 개인정보처리방침에 동의해야 합니다.");
    if (needs.member) throw new ApiError(403, "member_required", "회원 코드를 확인한 회원만 이용할 수 있습니다.");
  }
  return user;
}

function assertSameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return; // 동일 출처 fetch 일부 브라우저는 Origin 생략 → SameSite=Lax 쿠키로 보호
  const allowed = new Set([new URL(env.appUrl).origin, req.nextUrl.origin]);
  if (!allowed.has(origin)) throw new ApiError(403, "forbidden_origin", "허용되지 않은 출처의 요청입니다.");
}

export async function readJson<T extends z.ZodType>(req: NextRequest, schema: T): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiError(400, "invalid_json", "JSON 본문을 읽을 수 없습니다.");
  }
  return schema.parse(body);
}
