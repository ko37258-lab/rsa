// contracts/report.schema.json v1.0.0 과 1:1로 대응하는 타입.

export type ISODate = string

export interface Period {
  start: ISODate
  end: ISODate
}

export type MetricId =
  | 'pageViews'
  | 'uniqueVisitors'
  | 'visits'
  | 'retentionRate'
  | 'averageDuration'
  | 'neighborAdditions'

export type MetricUnit = 'count' | 'people' | 'percent' | 'seconds'

export interface Metric {
  id: MetricId
  label: string
  unit: MetricUnit
  current: number
  previous: number | null
  change: number | null
  changePercent: number | null
  notes: string
}

export interface DailyRow {
  date: ISODate
  pageViews: number
  uniqueVisitors: number
  visits: number
}

export interface Channel {
  name: string
  sharePercent: number
  count: number | null
}

export interface Keyword {
  keyword: string
  sharePercent: number
}

export interface Post {
  rank: number
  title: string
  pageViews: number
  publishedOn: ISODate | null
  postUrl: string | null
}

export interface Topic {
  name: string
  pageViews: number
  rankedPostCount: number
}

export interface WeeklyReport {
  schemaVersion: '1.0.0'
  reportType: 'weekly'
  reportId: string
  blogId: 'ko372'
  blogName: string
  timezone: 'Asia/Seoul'
  observedOn: ISODate
  status: 'complete'
  period: Period
  comparisonPeriod: Period
  metrics: Metric[]
  daily: DailyRow[]
  traffic: {
    period: Period
    coverage: string
    denominator: string
    channels: Channel[]
    keywords: Keyword[]
    keywordCoverage: string
    comparisonChannels: Channel[] | null
    comparisonUnavailableReason: string | null
  }
  content: {
    period: Period
    coverage: string
    rankedViews: number
    blogPageViews: number
    unreconciledViews: number | null
    posts: Post[]
    topics: Topic[]
    topicMethod: string
  }
  audience: {
    period: Period
    deviceBasis: string
    devices: { device: string; pageViews: number; sharePercent: number }[]
    demographicBasis: string
    demographicSampleViews: number
    genders: { gender: string; pageViews: number; sharePercent: number }[]
    ages: { ageBand: string; maleViews: number; femaleViews: number }[]
  }
  insights: { kind: 'observation' | 'recommendation'; text: string; evidence: string[] }[]
  limitations: string[]
  sources: { label: string; url: string }[]
}

// baseline 의 analysisData 는 스키마상 additionalProperties 허용이므로 필요한 부분만 좁혀 쓴다.
export type DailySeriesRow = [ISODate, ...(number | null)[]]

export interface BaselineMetricSeries {
  current: number[]
  previous: number[]
  days: number[]
  daily: DailySeriesRow[]
}

export interface BaselineTrafficRef {
  channels: [string, number][]
  keywords: [string, number][]
  details: [string, string, number][]
  searchPct: number
  naverBlogPct: number
  total: number
}

export interface BaselineReport {
  schemaVersion: '1.0.0'
  reportType: 'baseline'
  reportId: string
  blogId: 'ko372'
  blogName: string
  timezone: 'Asia/Seoul'
  observedOn: ISODate
  status: 'complete'
  periods: {
    current30Days: Period
    previous30Days: Period
    weekly: Period
    previousWeek: Period
    monthlyTraffic: Period
  }
  publicProfile: Record<string, unknown>
  intradaySnapshot: Record<string, unknown>
  analysisData: {
    metrics: Record<string, BaselineMetricSeries>
    refs: Record<string, BaselineTrafficRef>
    week: Record<string, number>
    rank: (string | null)[][]
    demo: (string | null)[][]
    device: (string | null)[][]
    topics: Record<string, { views: number; posts: number }>
    [key: string]: unknown
  }
  sourceFiles: string[]
  limitations: string[]
}

export type Report = WeeklyReport | BaselineReport

export interface StoredReportMeta {
  reportId: string
  reportType: 'weekly' | 'baseline'
  observedOn: ISODate
  periodStart: ISODate | null
  periodEnd: ISODate | null
  contentHash: string
  saveSource: 'admin_upload' | 'ingest_api'
  createdAt: string
  updatedAt: string
}

export interface StoredReport<T extends Report = Report> extends StoredReportMeta {
  payload: T
}

export interface RevisionMeta {
  revisionId: number
  reportId: string
  contentHash: string
  saveSource: string
  savedAt: string
}
