import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { HttpError } from '../http'
import { decideWrite } from './decide'
import { contentHash, etagFor } from './hash'
import type { BaselineReport, Channel, Metric, Report, RevisionMeta, StoredReport, StoredReportMeta, WeeklyReport } from './types'
import { reportKeys } from './validate'

const META_COLUMNS = 'report_id, report_type, observed_on, period_start, period_end, content_hash, save_source, created_at, updated_at'

interface Row {
  report_id: string
  report_type: 'weekly' | 'baseline'
  observed_on: string
  period_start: string | null
  period_end: string | null
  content_hash: string
  save_source: 'admin_upload' | 'ingest_api'
  created_at: string
  updated_at: string
  payload?: Report
}

function toMeta(r: Row): StoredReportMeta {
  return {
    reportId: r.report_id,
    reportType: r.report_type,
    observedOn: r.observed_on,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    contentHash: r.content_hash,
    saveSource: r.save_source,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

function dbFail(): never {
  throw new HttpError(500, 'storage_error', '데이터베이스 조회에 실패했습니다.')
}

export const REPORT_ID_PATTERN = /^ko372_[A-Za-z0-9_-]{1,80}$/

export interface WeeklyListItem extends StoredReportMeta {
  pageViews: number | null
  channelCount: number | null
  revisionCount: number
}

export async function listWeekly(db: SupabaseClient, opts: { year?: number } = {}): Promise<WeeklyListItem[]> {
  let q = db
    .from('blog_reports')
    .select(`${META_COLUMNS}, metrics:payload->metrics, channels:payload->traffic->channels`)
    .eq('blog_id', 'ko372')
    .eq('report_type', 'weekly')
    .order('period_end', { ascending: false })
  if (opts.year) q = q.gte('period_end', `${opts.year}-01-01`).lte('period_end', `${opts.year}-12-31`)
  const { data, error } = await q
  if (error) dbFail()
  const rows = (data ?? []) as unknown as (Row & { metrics: Metric[] | null; channels: Channel[] | null })[]
  const counts = await revisionCounts(db, rows.map((r) => r.report_id))
  return rows.map((r) => ({
    ...toMeta(r),
    pageViews: r.metrics?.find((m) => m.id === 'pageViews')?.current ?? null,
    channelCount: Array.isArray(r.channels) ? r.channels.length : null,
    revisionCount: counts.get(r.report_id) ?? 0,
  }))
}

/** 누적 추이용: 모든 주간 보고서의 지표만 가져온다(기간 순). */
export async function weeklyMetricsSeries(db: SupabaseClient) {
  const { data, error } = await db
    .from('blog_reports')
    .select('report_id, period_start, period_end, observed_on, metrics:payload->metrics')
    .eq('blog_id', 'ko372')
    .eq('report_type', 'weekly')
    .order('period_start', { ascending: true })
  if (error) dbFail()
  return (data ?? []) as unknown as { report_id: string; period_start: string; period_end: string; observed_on: string; metrics: Metric[] }[]
}

export async function yearsWithReports(db: SupabaseClient): Promise<number[]> {
  const { data, error } = await db.from('blog_reports').select('period_end').eq('report_type', 'weekly')
  if (error) dbFail()
  return [...new Set((data ?? []).map((r) => Number(String(r.period_end).slice(0, 4))))].sort((a, b) => b - a)
}

async function revisionCounts(db: SupabaseClient, ids: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  if (!ids.length) return map
  const { data, error } = await db.from('report_revisions').select('report_id').in('report_id', ids)
  if (error) dbFail()
  for (const r of data ?? []) map.set(r.report_id, (map.get(r.report_id) ?? 0) + 1)
  return map
}

export async function getReport(db: SupabaseClient, reportId: string): Promise<StoredReport | null> {
  if (!REPORT_ID_PATTERN.test(reportId)) return null
  const { data, error } = await db.from('blog_reports').select(`${META_COLUMNS}, payload`).eq('report_id', reportId).maybeSingle()
  if (error) dbFail()
  if (!data) return null
  const r = data as Row
  return { ...toMeta(r), payload: r.payload as Report }
}

export async function latestWeekly(db: SupabaseClient): Promise<StoredReport<WeeklyReport> | null> {
  const { data, error } = await db
    .from('blog_reports')
    .select(`${META_COLUMNS}, payload`)
    .eq('blog_id', 'ko372')
    .eq('report_type', 'weekly')
    .order('period_end', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) dbFail()
  if (!data) return null
  const r = data as Row
  return { ...toMeta(r), payload: r.payload as WeeklyReport }
}

export async function latestBaseline(db: SupabaseClient): Promise<StoredReport<BaselineReport> | null> {
  const { data, error } = await db
    .from('blog_reports')
    .select(`${META_COLUMNS}, payload`)
    .eq('blog_id', 'ko372')
    .eq('report_type', 'baseline')
    .order('observed_on', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) dbFail()
  if (!data) return null
  const r = data as Row
  return { ...toMeta(r), payload: r.payload as BaselineReport }
}

export async function listBaselines(db: SupabaseClient): Promise<StoredReportMeta[]> {
  const { data, error } = await db.from('blog_reports').select(META_COLUMNS).eq('report_type', 'baseline').order('observed_on', { ascending: false })
  if (error) dbFail()
  return ((data ?? []) as Row[]).map(toMeta)
}

/** 이전/다음 주간 보고서 ID */
export async function neighbours(db: SupabaseClient, periodStart: string) {
  const [prev, next] = await Promise.all([
    db.from('blog_reports').select('report_id').eq('report_type', 'weekly').lt('period_start', periodStart).order('period_start', { ascending: false }).limit(1).maybeSingle(),
    db.from('blog_reports').select('report_id').eq('report_type', 'weekly').gt('period_start', periodStart).order('period_start', { ascending: true }).limit(1).maybeSingle(),
  ])
  if (prev.error || next.error) dbFail()
  return { prev: (prev.data?.report_id as string | undefined) ?? null, next: (next.data?.report_id as string | undefined) ?? null }
}

export async function listRevisions(db: SupabaseClient, reportId: string): Promise<RevisionMeta[]> {
  const { data, error } = await db
    .from('report_revisions')
    .select('revision_id, report_id, content_hash, save_source, saved_at')
    .eq('report_id', reportId)
    .order('revision_id', { ascending: false })
  if (error) dbFail()
  return (data ?? []).map((r) => ({
    revisionId: Number(r.revision_id),
    reportId: r.report_id,
    contentHash: r.content_hash,
    saveSource: r.save_source,
    savedAt: r.saved_at,
  }))
}

export async function getRevision(db: SupabaseClient, reportId: string, revisionId: number) {
  const { data, error } = await db
    .from('report_revisions')
    .select('revision_id, content_hash, save_source, saved_at, payload')
    .eq('report_id', reportId)
    .eq('revision_id', revisionId)
    .maybeSingle()
  if (error) dbFail()
  return data as { revision_id: number; content_hash: string; save_source: string; saved_at: string; payload: Report } | null
}

export interface SaveOutcome {
  status: number
  body: {
    ok: true
    result: 'created' | 'updated' | 'unchanged'
    reportId: string
    savedAt: string
    contentHash: string
    previousHash?: string
    reportPath: string
  }
  etag: string
}

export function reportPath(r: { reportId: string; reportType: string }) {
  return r.reportType === 'baseline' ? `/baseline?reportId=${encodeURIComponent(r.reportId)}` : `/reports/${encodeURIComponent(r.reportId)}`
}

/**
 * 검증을 통과한 보고서를 저장한다(서비스 역할 클라이언트 사용).
 * - 동일 해시: unchanged, 리비전 추가 없음
 * - 신규: If-None-Match: * 필요
 * - 교체: If-Match(최신 ETag) + 이전 해시 조건의 원자적 UPDATE. 경쟁 쓰기 중 한 건만 성공.
 * 리비전은 DB 트리거가 기록한다.
 */
export async function saveReport(
  service: SupabaseClient,
  report: Report,
  opts: { ifMatch: string | null; ifMatchRaw: string | null; ifNoneMatchStar: boolean; machine: boolean; correction: boolean; userId: string | null },
): Promise<SaveOutcome> {
  const hash = contentHash(report)
  const keys = reportKeys(report)
  const source = opts.machine ? 'ingest_api' : 'admin_upload'
  const path = reportPath(report)

  const { data: existing, error } = await service
    .from('blog_reports')
    .select('content_hash, updated_at, report_type')
    .eq('report_id', report.reportId)
    .maybeSingle()
  if (error) dbFail()

  const decision = decideWrite({
    existingHash: existing?.content_hash ?? null,
    newHash: hash,
    ifMatch: opts.ifMatch,
    ifMatchRaw: opts.ifMatchRaw,
    ifNoneMatchStar: opts.ifNoneMatchStar,
    machine: opts.machine,
    correction: opts.correction,
  })

  const ok = (status: number, result: SaveOutcome['body']['result'], savedAt: string, extra: Partial<SaveOutcome['body']> = {}): SaveOutcome => ({
    status,
    etag: etagFor(hash),
    body: { ok: true, result, reportId: report.reportId, savedAt, contentHash: hash, reportPath: path, ...extra },
  })

  switch (decision.action) {
    case 'reject':
      throw Object.assign(new HttpError(decision.status, decision.code, decision.message), {
        currentEtag: existing ? etagFor(existing.content_hash) : null,
      })
    case 'unchanged':
      return ok(200, 'unchanged', existing!.updated_at)
    case 'insert': {
      const { data, error: insErr } = await service
        .from('blog_reports')
        .insert({ ...keys, payload: report, content_hash: hash, saved_by: opts.userId, save_source: source })
        .select('updated_at')
        .single()
      if (insErr) {
        if (insErr.code === '23505') {
          // 동시에 같은 ID가 먼저 저장됨: 같은 내용이면 unchanged, 아니면 충돌
          const { data: now } = await service.from('blog_reports').select('content_hash, updated_at').eq('report_id', report.reportId).maybeSingle()
          if (now?.content_hash === hash) return ok(200, 'unchanged', now.updated_at)
          throw new HttpError(412, 'already_exists', '같은 ID의 다른 보고서가 방금 저장되었습니다. 다시 확인하세요.')
        }
        if (insErr.code === '23514') throw new HttpError(422, 'db_constraint', '데이터베이스 제약조건 검증에 실패했습니다.')
        dbFail()
      }
      return ok(201, 'created', data!.updated_at)
    }
    case 'update': {
      const { data, error: upErr } = await service
        .from('blog_reports')
        .update({ payload: report, content_hash: hash, observed_on: keys.observed_on, saved_by: opts.userId, save_source: source })
        .eq('report_id', report.reportId)
        .eq('content_hash', decision.expectedHash)
        .select('updated_at')
      if (upErr) {
        if (upErr.code === '23514') throw new HttpError(422, 'db_constraint', '데이터베이스 제약조건 검증에 실패했습니다.')
        dbFail()
      }
      if (!data || data.length !== 1) throw new HttpError(412, 'etag_mismatch', '그 사이 보고서가 변경되었습니다. 최신 내용을 다시 불러와 확인하세요.')
      return ok(200, 'updated', data[0].updated_at, { previousHash: decision.expectedHash })
    }
  }
}
