import 'server-only'
import { createHash, timingSafeEqual } from 'node:crypto'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { getAdminContext } from './auth'
import { readEnv } from './env'

export const MAX_BODY_BYTES = 2 * 1024 * 1024
export const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' }

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...PRIVATE_HEADERS, ...headers },
  })
}

export function problem(status: number, code: string, message: string, extra: Record<string, unknown> = {}): Response {
  return json({ ok: false, error: code, message, ...extra }, status)
}

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message)
  }
  toResponse() {
    return problem(this.status, this.code, this.message)
  }
}

/** 세션(쿠키) 기반 쓰기 요청의 CSRF 방어: Origin이 APP_ORIGIN과 정확히 같아야 한다. */
export function assertSameOrigin(req: Request): void {
  const env = readEnv()
  if (!env.ok) throw new HttpError(503, 'not_configured', '서버 설정이 완료되지 않았습니다.')
  const origin = req.headers.get('origin')
  if (origin) {
    if (origin !== env.env.appOrigin) throw new HttpError(403, 'bad_origin', '허용되지 않은 출처의 요청입니다.')
    return
  }
  // Origin이 없는 구형 요청은 Fetch Metadata로만 허용한다.
  if (req.headers.get('sec-fetch-site') !== 'same-origin') throw new HttpError(403, 'bad_origin', '허용되지 않은 출처의 요청입니다.')
}

/** 본문을 최대 크기까지만 읽는다. 초과 시 413. */
export async function readBodyLimited(req: Request, max = MAX_BODY_BYTES): Promise<Uint8Array> {
  const declared = Number(req.headers.get('content-length') ?? '0')
  if (declared > max) throw new HttpError(413, 'payload_too_large', `요청 본문은 ${max / 1024 / 1024}MB 이하여야 합니다.`)
  if (!req.body) return new Uint8Array()
  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > max) {
      await reader.cancel().catch(() => {})
      throw new HttpError(413, 'payload_too_large', `요청 본문은 ${max / 1024 / 1024}MB 이하여야 합니다.`)
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let off = 0
  for (const c of chunks) {
    out.set(c, off)
    off += c.byteLength
  }
  return out
}

/** JSON 본문: Content-Type 확인 → 크기 제한 → UTF-8 → 파싱. 확장자는 신뢰하지 않는다. */
export async function readJsonBody(req: Request): Promise<unknown> {
  const type = (req.headers.get('content-type') ?? '').toLowerCase()
  if (!type.startsWith('application/json')) throw new HttpError(415, 'unsupported_media_type', 'Content-Type은 application/json이어야 합니다.')
  const bytes = await readBodyLimited(req)
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new HttpError(400, 'invalid_encoding', 'UTF-8 JSON이 아닙니다.')
  }
  try {
    return JSON.parse(text.replace(/^﻿/, ''))
  } catch {
    throw new HttpError(400, 'invalid_json', 'JSON 파싱에 실패했습니다.')
  }
}

function sha256(v: string): Buffer {
  return createHash('sha256').update(v, 'utf8').digest()
}

/** Authorization: Bearer <token> 검증. 해시 후 일정 시간 비교. 실패 사유는 구분하지 않는다. */
export function verifyIngestToken(req: Request): boolean {
  const env = readEnv()
  if (!env.ok || !env.env.ingestToken) return false
  const header = req.headers.get('authorization') ?? ''
  const m = /^Bearer ([A-Za-z0-9._~+/=-]{16,512})$/.exec(header)
  if (!m) return false
  return timingSafeEqual(sha256(m[1]), sha256(env.env.ingestToken))
}

export function ingestEnabled(): boolean {
  const env = readEnv()
  return env.ok && !!env.env.ingestToken
}

export type Actor =
  | { kind: 'admin'; user: User; supabase: SupabaseClient }
  | { kind: 'machine'; token: string }

/**
 * 관리자 세션 또는(허용된 경우) 수집 토큰으로 요청자를 확인한다.
 * Authorization 헤더가 있으면 토큰 경로로만 판단하고 쿠키는 보지 않는다.
 */
export async function authenticate(req: Request, opts: { allowMachine: boolean }): Promise<Actor> {
  if (req.headers.has('authorization')) {
    if (!opts.allowMachine) throw new HttpError(401, 'unauthorized', '인증이 필요합니다.')
    if (!ingestEnabled()) throw new HttpError(503, 'ingest_disabled', '수집 API가 설정되지 않았습니다.')
    if (!verifyIngestToken(req)) throw new HttpError(401, 'unauthorized', '인증이 필요합니다.')
    return { kind: 'machine', token: (req.headers.get('authorization') ?? '').slice(7) }
  }
  const ctx = await getAdminContext()
  if (ctx.kind === 'config') throw new HttpError(503, 'not_configured', '서버 설정이 완료되지 않았습니다.')
  if (ctx.kind === 'anon') throw new HttpError(401, 'unauthorized', '로그인이 필요합니다.')
  if (ctx.kind === 'forbidden') throw new HttpError(403, 'forbidden', '관리자 권한이 없습니다.')
  return { kind: 'admin', user: ctx.user, supabase: ctx.supabase }
}

export function clientIp(req: Request): string {
  // 배포 플랫폼의 프록시가 설정한 첫 번째 주소. 직접 노출된 서버라면 위조 가능하므로 README 참고.
  const fwd = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return fwd || req.headers.get('x-real-ip') || 'unknown'
}

/** 라우트 핸들러 공통 래퍼: HttpError는 그대로, 그 외는 상세 없이 500. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof HttpError) return e.toResponse()
    // 요청 헤더·본문·비밀값은 로그에 남기지 않는다.
    console.error('[api] unexpected error', e instanceof Error ? e.name : typeof e)
    return problem(500, 'internal_error', '저장 또는 조회 중 오류가 발생했습니다.')
  }
}
