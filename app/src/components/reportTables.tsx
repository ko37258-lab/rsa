'use client'

// 서버에서 받은 순수 데이터만 props로 받는 표 모음(함수 props를 서버→클라이언트로 넘기지 않기 위해).
import { DataTable } from './tables'
import { count, num, percent } from '@/lib/format'
import { classifyChannel, GROUP_LABEL } from '@/lib/report/traffic'
import type { Channel, Keyword, Post } from '@/lib/report/types'

function ShareBar({ value, max }: { value: number; max: number }) {
  return (
    <span className="bar-cell">
      <i style={{ width: `${Math.max(2, (value / (max || 1)) * 100)}px` }} aria-hidden="true" />
      {percent(value)}
    </span>
  )
}

export function ChannelsTable({ channels, downloadHref, caption }: { channels: Channel[]; downloadHref?: string; caption: string }) {
  const max = Math.max(...channels.map((c) => c.sharePercent), 1)
  const rows = channels.map((c, i) => ({ ...c, order: i + 1 }))
  return (
    <DataTable
      caption={caption}
      rows={rows}
      rowKey={(r) => `${r.order}-${r.name}`}
      searchLabel="유입경로 검색"
      collapsedRows={25}
      downloadHref={downloadHref}
      columns={[
        { key: 'o', header: '#', numeric: true, render: (r) => r.order, text: () => '' },
        { key: 'n', header: '유입경로', render: (r) => r.name, text: (r) => r.name },
        { key: 'g', header: '분류', render: (r) => GROUP_LABEL[classifyChannel(r.name)].replace(/\(.*\)/, ''), text: (r) => GROUP_LABEL[classifyChannel(r.name)] },
        { key: 's', header: '비중', render: (r) => <ShareBar value={r.sharePercent} max={max} />, text: () => '' },
        { key: 'c', header: '유입 건수', numeric: true, render: (r) => (r.count === null ? '미제공' : count(r.count, '건')), text: () => '' },
      ]}
    />
  )
}

export function KeywordsTable({ keywords, downloadHref }: { keywords: Keyword[]; downloadHref?: string }) {
  const rows = keywords.map((k, i) => ({ ...k, order: i + 1 }))
  return (
    <DataTable
      caption="실제 유입 검색어"
      rows={rows}
      rowKey={(r) => `${r.order}-${r.keyword}`}
      searchLabel="검색어 검색"
      collapsedRows={10}
      downloadHref={downloadHref}
      emptyText="수집된 검색어가 없습니다."
      columns={[
        { key: 'o', header: '#', numeric: true, render: (r) => r.order, text: () => '' },
        { key: 'k', header: '검색어', render: (r) => r.keyword, text: (r) => r.keyword },
        { key: 's', header: '유입 비중', numeric: true, render: (r) => percent(r.sharePercent), text: () => '' },
      ]}
    />
  )
}

export function PostsTable({ posts, downloadHref, collapsedRows = 10 }: { posts: Post[]; downloadHref?: string; collapsedRows?: number }) {
  return (
    <DataTable
      caption="조회된 게시물"
      rows={posts}
      rowKey={(r, i) => `${r.rank}-${i}`}
      searchLabel="게시물 제목 검색"
      collapsedRows={collapsedRows}
      downloadHref={downloadHref}
      columns={[
        { key: 'r', header: '순위', numeric: true, render: (r) => r.rank, text: () => '' },
        {
          key: 't',
          header: '게시물',
          render: (r) =>
            r.postUrl && /^https?:\/\//i.test(r.postUrl) ? (
              <a href={r.postUrl} target="_blank" rel="noopener noreferrer nofollow">
                {r.title}
              </a>
            ) : (
              r.title
            ),
          text: (r) => r.title,
        },
        { key: 'v', header: '조회수', numeric: true, render: (r) => count(r.pageViews), text: () => '' },
        { key: 'd', header: '작성일', render: (r) => r.publishedOn ?? '확인 불가', text: (r) => r.publishedOn ?? '' },
      ]}
    />
  )
}

export function DetailsTable({ rows }: { rows: [string, string, number][] }) {
  const data = rows.map(([channel, url, share], i) => ({ channel, url, share, i }))
  return (
    <DataTable
      caption="상세 유입 URL"
      rows={data}
      rowKey={(r) => String(r.i)}
      searchLabel="경로·URL 검색"
      collapsedRows={10}
      columns={[
        { key: 'c', header: '유입경로', render: (r) => r.channel, text: (r) => r.channel },
        // 원자료 URL은 텍스트로만 표시한다(쿼리 제거본, 링크 실행 안 함).
        { key: 'u', header: '상세 URL(쿼리 제거)', render: (r) => <span className="mono">{r.url}</span>, text: (r) => r.url },
        { key: 's', header: '비중', numeric: true, render: (r) => percent(r.share), text: () => '' },
      ]}
    />
  )
}

export function RankTable({ rows }: { rows: (string | null)[][] }) {
  const data = rows.map((r, i) => ({ rank: r[0] ?? '', title: r[1] ?? '', views: Number(r[2]), date: r[3] ?? '', i }))
  return (
    <DataTable
      caption="조회수 순위(원자료)"
      rows={data}
      rowKey={(r) => String(r.i)}
      searchLabel="게시물 제목 검색"
      collapsedRows={10}
      columns={[
        { key: 'r', header: '순위', numeric: true, render: (r) => r.rank, text: () => '' },
        { key: 't', header: '게시물', render: (r) => r.title, text: (r) => r.title },
        { key: 'v', header: '조회수', numeric: true, render: (r) => (Number.isFinite(r.views) ? count(r.views) : '확인 불가'), text: () => '' },
        { key: 'd', header: '작성일', render: (r) => r.date || '확인 불가', text: (r) => r.date },
      ]}
    />
  )
}

export function numText(v: number) {
  return num(v)
}
