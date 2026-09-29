import { attachmentHeader } from '@/lib/csv'
import { authenticate, handle, HttpError, PRIVATE_HEADERS } from '@/lib/http'
import { createServiceClient } from '@/lib/supabase/server'

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
    // 관리자 확인 후에만 서비스 역할로 본문을 읽는다(본문 컬럼은 authenticated에 권한 없음).
    const { data, error } = await createServiceClient().from('source_files').select('file_name, media_type, content').eq('source_id', sourceId).maybeSingle()
    if (error) throw new HttpError(500, 'storage_error', '파일 조회에 실패했습니다.')
    if (!data) throw new HttpError(404, 'not_found', '파일을 찾을 수 없습니다.')
    const hex = String(data.content).replace(/^\\x/, '')
    const buf = Buffer.from(hex, 'hex')
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
