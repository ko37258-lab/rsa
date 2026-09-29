import { attachmentHeader, toCsv } from '@/lib/csv'
import { authenticate, handle, HttpError, PRIVATE_HEADERS } from '@/lib/http'
import { getReport, getRevision } from '@/lib/report/store'
import type { Report } from '@/lib/report/types'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ reportId: string }> }

/** GET /api/reports/{id}/export?kind=channels|keywords|posts|daily[&revision=N] — 관리자 세션 전용 CSV */
export async function GET(req: Request, ctx: Ctx) {
  return handle(async () => {
    const { reportId } = await ctx.params
    const actor = await authenticate(req, { allowMachine: false })
    if (actor.kind !== 'admin') throw new HttpError(403, 'forbidden', '관리자 권한이 없습니다.')
    const url = new URL(req.url)
    const kind = url.searchParams.get('kind') ?? 'channels'
    const rev = url.searchParams.get('revision')

    let payload: Report | null = null
    if (rev) {
      if (!/^\d{1,18}$/.test(rev)) throw new HttpError(400, 'invalid_revision', '리비전 번호가 올바르지 않습니다.')
      payload = (await getRevision(actor.supabase, reportId, Number(rev)))?.payload ?? null
    } else payload = (await getReport(actor.supabase, reportId))?.payload ?? null
    if (!payload) throw new HttpError(404, 'not_found', '보고서를 찾을 수 없습니다.')
    if (payload.reportType !== 'weekly') throw new HttpError(400, 'unsupported', '주간 보고서만 CSV로 내보낼 수 있습니다.')

    const period = `${payload.period.start}~${payload.period.end}`
    let csv: string
    switch (kind) {
      case 'channels':
        csv = toCsv(['기간', '유입경로', '비중(%)', '유입 건수'], payload.traffic.channels.map((c) => [period, c.name, c.sharePercent, c.count]))
        break
      case 'keywords':
        csv = toCsv(['기간', '검색어', '유입 비중(%)'], payload.traffic.keywords.map((k) => [period, k.keyword, k.sharePercent]))
        break
      case 'posts':
        csv = toCsv(['기간', '순위', '게시물', '조회수', '작성일', 'URL'], payload.content.posts.map((p) => [period, p.rank, p.title, p.pageViews, p.publishedOn, p.postUrl]))
        break
      case 'daily':
        csv = toCsv(['날짜', '조회수', '순방문자수(일별)', '방문 횟수'], payload.daily.map((d) => [d.date, d.pageViews, d.uniqueVisitors, d.visits]))
        break
      default:
        throw new HttpError(400, 'invalid_kind', 'kind는 channels, keywords, posts, daily 중 하나여야 합니다.')
    }
    return new Response(csv, {
      headers: {
        ...PRIVATE_HEADERS,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': attachmentHeader(`${payload.reportId}_${kind}${rev ? `_rev${rev}` : ''}.csv`),
      },
    })
  })
}
