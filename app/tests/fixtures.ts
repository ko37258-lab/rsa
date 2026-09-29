// 테스트 전용 합성 보고서(실제 블로그 수치 아님). 비공개 원자료 없이도 검증 로직을 테스트하기 위한 최소 형태.
export function syntheticWeekly(start = '2026-09-07', end = '2026-09-13', compStart = '2026-08-31', compEnd = '2026-09-06') {
  const days = (s: string, n: number, pv: number) =>
    Array.from({ length: n }, (_, i) => ({ date: new Date(Date.parse(`${s}T00:00:00Z`) + i * 86400000).toISOString().slice(0, 10), pageViews: pv, uniqueVisitors: 5, visits: 6 }))
  return {
    schemaVersion: '1.0.0',
    reportId: `ko372_${start}_${end}`,
    blogId: 'ko372',
    blogName: '테스트 블로그',
    timezone: 'Asia/Seoul',
    observedOn: '2026-09-15',
    status: 'complete',
    reportType: 'weekly',
    period: { start, end },
    comparisonPeriod: { start: compStart, end: compEnd },
    metrics: [
      { id: 'pageViews', label: '조회수', unit: 'count', current: 70, previous: 35, change: 35, changePercent: 100, notes: '' },
      { id: 'uniqueVisitors', label: '순방문자수', unit: 'people', current: 20, previous: 10, change: 10, changePercent: 100, notes: '' },
      { id: 'visits', label: '방문 횟수', unit: 'count', current: 42, previous: 42, change: 0, changePercent: 0, notes: '' },
      { id: 'retentionRate', label: '재방문율', unit: 'percent', current: 10, previous: 5, change: 5, changePercent: 100, notes: '' },
      { id: 'averageDuration', label: '평균 사용 시간', unit: 'seconds', current: 100, previous: 120, change: -20, changePercent: -16.67, notes: '' },
      { id: 'neighborAdditions', label: '이웃 추가수', unit: 'count', current: 1, previous: 0, change: 1, changePercent: null, notes: '' },
    ],
    daily: [...days(compStart, 7, 5), ...days(start, 7, 10)],
    traffic: {
      period: { start, end },
      coverage: 'test',
      denominator: 'test',
      channels: [
        { name: '네이버 블로그_PC', sharePercent: 50.01, count: null },
        { name: '네이버 통합검색_모바일', sharePercent: 30, count: null },
        { name: 'Google', sharePercent: 10, count: null },
        { name: '=cmd|calc', sharePercent: 10, count: null },
      ],
      keywords: [{ keyword: '+테스트', sharePercent: 1 }],
      keywordCoverage: 'test',
      comparisonChannels: null,
      comparisonUnavailableReason: '테스트',
    },
    content: {
      period: { start, end },
      coverage: 'test',
      rankedViews: 30,
      blogPageViews: 70,
      unreconciledViews: 40,
      posts: [
        { rank: 1, title: '<script>alert(1)</script>', pageViews: 20, publishedOn: '2026-09-01', postUrl: null },
        { rank: 2, title: '@SUM(1)', pageViews: 10, publishedOn: null, postUrl: 'https://blog.naver.com/ko372/1' },
      ],
      topics: [{ name: '기타', pageViews: 30, rankedPostCount: 2 }],
      topicMethod: 'test',
    },
    audience: {
      period: { start, end },
      deviceBasis: '조회수',
      devices: [
        { device: 'mobile', pageViews: 50, sharePercent: 71.43 },
        { device: 'pc', pageViews: 20, sharePercent: 28.57 },
      ],
      demographicBasis: 'test',
      demographicSampleViews: 10,
      genders: [
        { gender: 'male', pageViews: 4, sharePercent: 40 },
        { gender: 'female', pageViews: 6, sharePercent: 60 },
      ],
      ages: [{ ageBand: '45-49', maleViews: 4, femaleViews: 6 }],
    },
    insights: [{ kind: 'observation', text: '테스트', evidence: [] }],
    limitations: ['테스트 전용 합성 데이터'],
    sources: [{ label: '공개 블로그', url: 'https://blog.naver.com/ko372' }],
  }
}
