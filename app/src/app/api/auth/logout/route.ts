import { NextResponse } from 'next/server'
import { readEnv } from '@/lib/env'
import { assertSameOrigin, HttpError } from '@/lib/http'
import { createSessionClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const env = readEnv()
  if (!env.ok) return NextResponse.redirect(new URL('/setup', req.url), 303)
  try {
    assertSameOrigin(req)
  } catch (e) {
    if (e instanceof HttpError) return e.toResponse()
    throw e
  }
  const supabase = await createSessionClient()
  await supabase.auth.signOut({ scope: 'local' })
  const res = NextResponse.redirect(new URL('/login?reason=signed_out', env.env.appOrigin), 303)
  res.headers.set('Cache-Control', 'private, no-store')
  return res
}
