import { NextResponse } from 'next/server'
import { readEnv } from '@/lib/env'
import { assertSameOrigin, clientIp, HttpError, readBodyLimited } from '@/lib/http'
import { consumeRateLimit } from '@/lib/ratelimit'
import { createSessionClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function back(req: Request, params: Record<string, string>) {
  const env = readEnv()
  const base = env.ok ? env.env.appOrigin : new URL(req.url).origin
  const url = new URL('/login', base)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = NextResponse.redirect(url, 303)
  res.headers.set('Cache-Control', 'private, no-store')
  return res
}

function safeNext(v: FormDataEntryValue | null): string {
  const s = typeof v === 'string' ? v : ''
  return /^\/(?![/\\])[A-Za-z0-9/_\-?=&.%]*$/.test(s) && !s.startsWith('/login') ? s : '/dashboard'
}

export async function POST(req: Request) {
  const env = readEnv()
  if (!env.ok) return back(req, { error: 'config' })
  try {
    assertSameOrigin(req)
    const raw = new TextDecoder().decode(await readBodyLimited(req, 8 * 1024))
    const form = new URLSearchParams(raw)
    const email = (form.get('email') ?? '').trim().toLowerCase()
    const password = form.get('password') ?? ''
    const next = safeNext(form.get('next'))
    if (!email || !password || email.length > 254 || password.length > 256) return back(req, { error: 'invalid' })

    await consumeRateLimit('login_ip', clientIp(req), 20, 600)
    await consumeRateLimit('login_email', email, 8, 900)

    const supabase = await createSessionClient()
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error || !data.user) return back(req, { error: 'invalid' })

    const { data: member } = await supabase.from('report_admins').select('user_id').eq('user_id', data.user.id).maybeSingle()
    if (!member) {
      await supabase.auth.signOut({ scope: 'local' })
      return back(req, { error: 'forbidden' })
    }
    const res = NextResponse.redirect(new URL(next, env.env.appOrigin), 303)
    res.headers.set('Cache-Control', 'private, no-store')
    return res
  } catch (e) {
    if (e instanceof HttpError) {
      if (e.status === 429) return back(req, { error: 'rate' })
      if (e.status === 403) return back(req, { error: 'origin' })
    }
    console.error('[login] failed', e instanceof Error ? e.name : typeof e)
    return back(req, { error: 'unavailable' })
  }
}
