import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { HttpError } from './http'
import type { CollectionRun, IntegrationSettings } from './status'

export async function listRuns(db: SupabaseClient, limit = 50): Promise<CollectionRun[]> {
  const { data, error } = await db
    .from('collection_runs')
    .select('run_id, expected_period_start, expected_period_end, status, report_id, error_code, safe_message, started_at, finished_at')
    .eq('blog_id', 'ko372')
    .order('started_at', { ascending: false })
    .limit(limit)
  if (error) throw new HttpError(500, 'storage_error', '수집 이력 조회에 실패했습니다.')
  return (data ?? []) as CollectionRun[]
}

export async function getIntegrationSettings(db: SupabaseClient): Promise<IntegrationSettings | null> {
  const { data, error } = await db
    .from('integration_settings')
    .select('aside_connected, first_run_on, connected_at, note, updated_at')
    .eq('blog_id', 'ko372')
    .maybeSingle()
  if (error) throw new HttpError(500, 'storage_error', '연결 설정 조회에 실패했습니다.')
  return (data as IntegrationSettings | null) ?? null
}

export interface SourceFileMeta {
  source_id: string
  file_name: string
  media_type: string
  byte_size: number
  sha256: string
  uploaded_at: string
}

export async function listSourceFiles(db: SupabaseClient): Promise<SourceFileMeta[]> {
  const { data, error } = await db
    .from('source_files')
    .select('source_id, file_name, media_type, byte_size, sha256, uploaded_at')
    .order('file_name', { ascending: true })
  if (error) throw new HttpError(500, 'storage_error', '원자료 목록 조회에 실패했습니다.')
  return (data ?? []) as SourceFileMeta[]
}

/** 실패 사유 메시지 정제: 제어문자·URL·토큰 흔적 제거, 길이 제한. */
export function sanitizeSafeMessage(v: unknown): string | null {
  if (typeof v !== 'string') return null
  let s = v.replace(/[\u0000-\u001f\u007f]/g, ' ')
  s = s.replace(/https?:\/\/\S+/gi, '[링크 생략]')
  s = s.replace(/(bearer|token|cookie|authorization|authcode|password)\S*/gi, '[민감정보 생략]')
  s = s.replace(/<[^>]*>/g, '').trim().slice(0, 300)
  return s || null
}

export const ERROR_CODE = /^[a-z0-9_]{1,64}$/
