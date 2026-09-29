import { attachmentHeader } from '@/lib/csv'
import { authenticate, handle, HttpError, PRIVATE_HEADERS } from '@/lib/http'
import { rpcFail } from '@/lib/report/store'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ sourceId: string }> }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** GET /api/sources/{sourceId} — 관리자 세션 전용 원자료 다운로드 */
export async function GET(req: Request, ctx: Ctx) {
  return handle(async () => {
    const { sourceId } = await ctx.params
    const actor = await authenticate(req, { allowMachine: false })
    if (actor.kind !== 'admin') throw new HttpError(403, 'forbidden', '관리자 권한이 없습니다.')
    if (!UUID.test(sourceId)) throw new HttpError(404, 'not_found', '파일을 찾을 수 없습니다.')
    // DB 함수가 관리자 여부를 다시 확인한 뒤에만 파일 본문을 돌려준다.
    const { data: raw, error } = await actor.supabase.rpc('blog_get_source', { p_source_id: sourceId })
    if (error) rpcFail(error)
    const data = raw as { file_name: string; media_type: string; content_b64: string } | null
    if (!data) throw new HttpError(404, 'not_found', '파일을 찾을 수 없습니다.')
    const buf = Buffer.from(data.content_b64, 'base64')
    return new Response(buf, {
      headers: {
        ...PRIVATE_HEADERS,
        'Content-Type': data.media_type === 'text/csv' ? 'text/csv; charset=utf-8' : data.media_type,
        'Content-Disposition': attachmentHeader(data.file_name),
        'Content-Length': String(buf.length),
      },
    })
  })
}
