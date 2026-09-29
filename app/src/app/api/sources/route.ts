import { createHash } from 'node:crypto'
import { assertSameOrigin, authenticate, handle, HttpError, json, readBodyLimited } from '@/lib/http'
import { listSourceFiles } from '@/lib/ops'
import { consumeRateLimit } from '@/lib/ratelimit'
import { rpcFail } from '@/lib/report/store'
import { sniffSourceType } from '@/lib/sources'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  return handle(async () => {
    const actor = await authenticate(req, { allowMachine: false })
    if (actor.kind !== 'admin') throw new HttpError(403, 'forbidden', '관리자 권한이 없습니다.')
    return json({ ok: true, sources: await listSourceFiles(actor.supabase) })
  })
}

/** POST /api/sources — 원자료 파일 등록(관리자). 본문은 파일 바이트, 파일명은 X-File-Name(URL 인코딩). */
export async function POST(req: Request) {
  return handle(async () => {
    const actor = await authenticate(req, { allowMachine: false })
    if (actor.kind !== 'admin') throw new HttpError(403, 'forbidden', '관리자 권한이 없습니다.')
    assertSameOrigin(req)
    await consumeRateLimit('upload', actor.user.id, 100, 3600)
    let name: string
    try {
      name = decodeURIComponent(req.headers.get('x-file-name') ?? '').normalize('NFC').trim()
    } catch {
      throw new HttpError(400, 'invalid_file_name', '파일 이름이 올바르지 않습니다.')
    }
    if (!name || name.length > 200 || /[/\\\u0000-\u001f]/.test(name)) throw new HttpError(400, 'invalid_file_name', '파일 이름이 올바르지 않습니다.')
    const bytes = await readBodyLimited(req)
    if (!bytes.length) throw new HttpError(422, 'empty_file', '빈 파일입니다.')
    const mediaType = sniffSourceType(name, bytes)
    if (!mediaType) throw new HttpError(415, 'unsupported_file', 'XLSX 또는 UTF-8 CSV 파일만 등록할 수 있습니다.')
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    const { data, error } = await actor.supabase.rpc('blog_add_source', {
      p_file_name: name,
      p_media_type: mediaType,
      p_sha256: sha256,
      p_content_b64: Buffer.from(bytes).toString('base64'),
    })
    if (error) rpcFail(error)
    const out = data as { result: 'created' | 'unchanged'; source_id: string }
    return json({ ok: true, result: out.result, sourceId: out.source_id }, out.result === 'created' ? 201 : 200)
  })
}
