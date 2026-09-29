import { authenticate, handle, HttpError, json } from '@/lib/http'
import { listBaselines, listWeekly } from '@/lib/report/store'

export const dynamic = 'force-dynamic'

/** GET /api/reports?type=weekly|baseline&year=2026 — 관리자 세션 전용 */
export async function GET(req: Request) {
  return handle(async () => {
    const actor = await authenticate(req, { allowMachine: false })
    if (actor.kind !== 'admin') throw new HttpError(403, 'forbidden', '관리자 권한이 없습니다.')
    const url = new URL(req.url)
    const type = url.searchParams.get('type') ?? 'weekly'
    if (type === 'baseline') return json({ ok: true, reports: await listBaselines(actor.supabase) })
    if (type !== 'weekly') throw new HttpError(400, 'invalid_type', 'type은 weekly 또는 baseline이어야 합니다.')
    const yearParam = url.searchParams.get('year')
    const year = yearParam && /^\d{4}$/.test(yearParam) ? Number(yearParam) : undefined
    return json({ ok: true, reports: await listWeekly(actor.supabase, { year }) })
  })
}
