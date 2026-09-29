import { isRealIsoDate } from '@/lib/dates'
import { assertSameOrigin, authenticate, handle, HttpError, json, readJsonBody } from '@/lib/http'
import { getIntegrationSettings } from '@/lib/ops'
import { rpcFail } from '@/lib/report/store'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  return handle(async () => {
    const actor = await authenticate(req, { allowMachine: false })
    if (actor.kind !== 'admin') throw new HttpError(403, 'forbidden', '관리자 권한이 없습니다.')
    return json({ ok: true, settings: await getIntegrationSettings(actor.supabase) })
  })
}

/**
 * PUT /api/integration — 관리자가 Aside 루틴을 실제로 만든 뒤 연결 사실을 기록하거나 해제한다.
 * 이 기록은 표시용이며 사이트가 수집을 실행하거나 예약하지 않는다.
 */
export async function PUT(req: Request) {
  return handle(async () => {
    const actor = await authenticate(req, { allowMachine: false })
    if (actor.kind !== 'admin') throw new HttpError(403, 'forbidden', '관리자 권한이 없습니다.')
    assertSameOrigin(req)
    const body = (await readJsonBody(req)) as Record<string, unknown>
    const connected = body?.asideConnected === true
    const firstRunOn = typeof body?.firstRunOn === 'string' ? body.firstRunOn : null
    const note = typeof body?.note === 'string' ? body.note.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 200) || null : null
    if (connected && (!firstRunOn || !isRealIsoDate(firstRunOn)))
      throw new HttpError(422, 'invalid_first_run', '연결 등록에는 Aside에서 확정한 첫 실행일이 필요합니다.')
    const { error } = await actor.supabase.rpc('blog_set_integration', { p_connected: connected, p_first_run: connected ? firstRunOn : null, p_note: note })
    if (error) rpcFail(error)
    return json({ ok: true, settings: await getIntegrationSettings(actor.supabase) })
  })
}
