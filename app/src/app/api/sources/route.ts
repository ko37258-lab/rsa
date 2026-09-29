import { createHash } from 'node:crypto'
import { assertSameOrigin, authenticate, handle, HttpError, json, readBodyLimited } from '@/lib/http'
import { listSourceFiles } from '@/lib/ops'
import { consumeRateLimit } from '@/lib/ratelimit'
import { createServiceClient } from '@/lib/supabase/server'
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
    const db = createServiceClient()
    const { data: dup } = await db.from('source_files').select('source_id').eq('sha256', sha256).maybeSingle()
    if (dup) return json({ ok: true, result: 'unchanged', sourceId: dup.source_id })
    const { data, error } = await db
      .from('source_files')
      .insert({ file_name: name, media_type: mediaType, byte_size: bytes.length, sha256, content: `\\x${Buffer.from(bytes).toString('hex')}`, uploaded_by: actor.user.id })
      .select('source_id')
      .single()
    if (error) throw new HttpError(500, 'storage_error', '원자료 저장에 실패했습니다.')
    return json({ ok: true, result: 'created', sourceId: data.source_id }, 201)
  })
}
