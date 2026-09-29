import type { Report } from './types'

/** 업로드 미리보기에 보여줄 요약(원본 JSON 대신 숫자 중심). */
export function summarizeReport(r: Report) {
  if (r.reportType === 'weekly') {
    return {
      type: '주간 보고서',
      period: r.period,
      comparisonPeriod: r.comparisonPeriod,
      observedOn: r.observedOn,
      metrics: r.metrics.map((m) => ({ id: m.id, label: m.label, unit: m.unit, current: m.current, previous: m.previous })),
      counts: {
        channels: r.traffic.channels.length,
        keywords: r.traffic.keywords.length,
        posts: r.content.posts.length,
        daily: r.daily.length,
      },
      channelShareSum: Number(r.traffic.channels.reduce((s, c) => s + c.sharePercent, 0).toFixed(2)),
      rankedViews: r.content.rankedViews,
      blogPageViews: r.content.blogPageViews,
    }
  }
  return {
    type: '최초 종합분석(baseline)',
    periods: r.periods,
    observedOn: r.observedOn,
    metrics: Object.entries(r.analysisData.metrics ?? {}).map(([k, s]) => ({ id: k, current: s.current?.[0] ?? null, previous: s.previous?.[0] ?? null })),
    counts: {
      weeklyChannels: r.analysisData.refs?.['유입분석_주간']?.channels?.length ?? null,
      monthlyChannels: r.analysisData.refs?.['유입분석_월간']?.channels?.length ?? null,
      sourceFiles: r.sourceFiles.length,
    },
  }
}
