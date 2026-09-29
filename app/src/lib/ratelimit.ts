import 'server-only'
import { createHash } from 'node:crypto'
import { HttpError } from './http'
import { createServiceClient } from './supabase/server'

/**
 * DB(Postgres) 카운터 기반 고정 창 요청 제한. 여러 서버 인스턴스가 같은 DB를 공유하므로
 * 프로세스 메모리 방식과 달리 수평 확장 환경에서도 동작한다.
 * 식별자(IP·이메일)는 SHA-256 해시만 저장한다.
 */
export async function consumeRateLimit(scope: 'login_ip' | 'login_email' | 'ingest' | 'upload', key: string, limit: number, windowSeconds: number) {
  const bucket = `${scope}:${createHash('sha256').update(key.toLowerCase(), 'utf8').digest('hex')}`
  const { data, error } = await createServiceClient().rpc('consume_rate_limit', {
    p_bucket: bucket,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  })
  if (error) {
    // 제한 저장소 장애 시에는 안전하게 거부한다(fail-closed).
    console.error('[ratelimit] unavailable')
    throw new HttpError(503, 'rate_limit_unavailable', '잠시 후 다시 시도해 주세요.')
  }
  if (data !== true) throw new HttpError(429, 'rate_limited', '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.')
}
