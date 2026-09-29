// 교체 미리보기용: 핵심 필드의 이전/새 값 비교.
import type { Report } from './types'

export interface FieldChange {
  field: string
  before: string
  after: string
}

function summary(r: Report): Record<string, string> {
  const out: Record<string, string> = { observedOn: r.observedOn, blogName: r.blogName }
  if (r.reportType === 'weekly') {
    out['period'] = `${r.period.start}~${r.period.end}`
    out['comparisonPeriod'] = `${r.comparisonPeriod.start}~${r.comparisonPeriod.end}`
    for (const m of r.metrics) {
      out[`metrics.${m.id}.current`] = String(m.current)
      out[`metrics.${m.id}.previous`] = String(m.previous)
    }
    out['traffic.channels(개수)'] = String(r.traffic.channels.length)
    out['traffic.channels(합계%)'] = r.traffic.channels.reduce((s, c) => s + c.sharePercent, 0).toFixed(2)
    out['traffic.keywords(개수)'] = String(r.traffic.keywords.length)
    out['content.posts(개수)'] = String(r.content.posts.length)
    out['content.rankedViews'] = String(r.content.rankedViews)
    out['content.blogPageViews'] = String(r.content.blogPageViews)
    out['audience.demographicSampleViews'] = String(r.audience.demographicSampleViews)
    out['daily(일수)'] = String(r.daily.length)
    out['insights(개수)'] = String(r.insights.length)
    out['limitations(개수)'] = String(r.limitations.length)
  } else {
    for (const [k, p] of Object.entries(r.periods)) out[`periods.${k}`] = `${p.start}~${p.end}`
    for (const [k, s] of Object.entries(r.analysisData.metrics ?? {})) {
      out[`metrics.${k}.current`] = String(s.current?.[0])
      out[`metrics.${k}.previous`] = String(s.previous?.[0])
    }
    for (const [k, ref] of Object.entries(r.analysisData.refs ?? {})) out[`refs.${k}.channels(개수)`] = String(ref.channels?.length)
    out['sourceFiles(개수)'] = String(r.sourceFiles.length)
    out['limitations(개수)'] = String(r.limitations.length)
  }
  return out
}

export function diffKeyFields(before: Report, after: Report): FieldChange[] {
  const a = summary(before)
  const b = summary(after)
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])]
  return keys
    .filter((k) => a[k] !== b[k])
    .map((k) => ({ field: k, before: a[k] ?? '(없음)', after: b[k] ?? '(없음)' }))
}

/** 핵심 필드 외 변경 여부(설명 문구 등)는 경로 목록으로만 알린다. */
export function changedTopLevelSections(before: Report, after: Report): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  const changed: string[] = []
  for (const k of keys) {
    if (JSON.stringify((before as unknown as Record<string, unknown>)[k]) !== JSON.stringify((after as unknown as Record<string, unknown>)[k])) changed.push(k)
  }
  return changed
}
