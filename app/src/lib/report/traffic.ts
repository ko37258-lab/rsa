// 유입경로 분류: 네이버 블로그 경유(네이버 블로그_PC/모바일), 검색 경유('검색' 포함 경로 + Google), 그 외.
// 분류 합계는 원 비중을 그대로 더한 값이며 정규화하지 않는다.

export type ChannelGroup = 'naverBlog' | 'search' | 'other'

export const GROUP_LABEL: Record<ChannelGroup, string> = {
  naverBlog: '네이버 블로그 경유',
  search: '검색 경유',
  other: '그 외 경로(메인·SNS·외부 등)',
}

export function classifyChannel(name: string): ChannelGroup {
  if (name.includes('검색') || /^google$/i.test(name.trim())) return 'search'
  if (name.startsWith('네이버 블로그_')) return 'naverBlog'
  return 'other'
}

export function groupShares(channels: { name: string; sharePercent: number }[]) {
  const sums: Record<ChannelGroup, number> = { naverBlog: 0, search: 0, other: 0 }
  for (const c of channels) sums[classifyChannel(c.name)] += c.sharePercent
  const round = (v: number) => Number(v.toFixed(2))
  return {
    naverBlog: round(sums.naverBlog),
    search: round(sums.search),
    other: round(sums.other),
    total: round(sums.naverBlog + sums.search + sums.other),
  }
}

export function findChannelShare(channels: { name: string; sharePercent: number }[], pattern: RegExp): number | null {
  const hit = channels.filter((c) => pattern.test(c.name))
  return hit.length ? Number(hit.reduce((s, c) => s + c.sharePercent, 0).toFixed(2)) : null
}
