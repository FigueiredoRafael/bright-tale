'use server'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import {
  signInWithGoogle as _signInWithGoogle,
  forgotPassword as _forgotPassword,
  resetPassword as _resetPassword,
} from '@tn-figueiredo/auth-nextjs/actions'
import {
  gateAdminLogin,
  gateForgotPassword,
  finishWithUniformDelay,
} from './admin-login-gate'

// Must match the prefix used in server.ts and middleware.ts.
const ADMIN_COOKIE_PREFIX = 'sb-admin'

async function createAdminAnonClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: { name: ADMIN_COOKIE_PREFIX },
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          )
        },
      },
    },
  )
}

function requireAppUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL
  if (!url) {
    throw new Error('NEXT_PUBLIC_APP_URL is not configured (see spec §3 env inventory)')
  }
  return url
}

const RESET_PATH = '/admin/reset-password'

export async function signInWithPassword(input: { email: string; password: string }) {
  const startedAt = Date.now()

  // SEC-002 rate-limit gate.
  const gate = await gateAdminLogin({ email: input.email })
  if (!gate.allowed) {
    await finishWithUniformDelay(startedAt)
    return {
      ok: false as const,
      error: 'rate_limited' as const,
      retryAfter: gate.retryAfter ?? 900,
    }
  }

  try {
    const supabase = await createAdminAnonClient()
    const { error } = await supabase.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    })
    await finishWithUniformDelay(startedAt)
    if (error) {
      if (/invalid login credentials/i.test(error.message) ||
          /email not confirmed/i.test(error.message)) {
        return { ok: false as const, error: 'Email ou senha incorretos.' }
      }
      return { ok: false as const, error: 'Erro ao entrar. Tente novamente.' }
    }
    return { ok: true as const }
  } catch (e) {
    await finishWithUniformDelay(startedAt)
    throw e
  }
}

// SEC-007: Google OAuth removed from the admin surface on purpose.
// The Server Action stays exported as a no-op that rejects so older
// clients/tests break loudly instead of silently creating accounts.
export async function signInWithGoogle(_input: { redirectTo?: string }) {
  return {
    ok: false as const,
    error:
      'Entrar com Google não está disponível para o painel admin. Use e-mail + senha.',
  }
}
// Keep the underlying import to avoid churn in the package; it's unused now.
void _signInWithGoogle

export async function forgotPassword(input: { email: string }) {
  const startedAt = Date.now()

  // Rate-limit gate. Tighter budget than login:
  //   • 3 per email / 15 min — prevents using forgot-password as an
  //     email-bombing weapon against a victim.
  //   • 10 per IP / 15 min — stops a single attacker from iterating.
  // When gate blocks, we STILL return uniform success so an attacker
  // cannot distinguish "rate limited" from "email sent" or "email
  // doesn't exist".
  const gate = await gateForgotPassword({ email: input.email })
  if (!gate.allowed) {
    await finishWithUniformDelay(startedAt)
    // Return shape matches ActionResult: { ok, userId?, error? }.
    // Success branch returns nothing else — component shows its own
    // "check your email" confirmation UI.
    return { ok: true as const }
  }

  try {
    // Supabase's own endpoint rate-limits further (default ~1 email/60s
    // per identity) and the sending/template side is config'd in the
    // Supabase dashboard. We never touch the SMTP credentials.
    await _forgotPassword({
      email: input.email,
      appUrl: requireAppUrl(),
      resetPath: RESET_PATH,
    })
  } catch (e) {
    // Intentionally swallow the underlying error instead of leaking
    // Supabase's "user not found" / "invalid email" / "rate limited" —
    // all three would let an attacker enumerate. Log server-side so we
    // can debug if deliverability drops.
    console.error('[admin-actions] forgotPassword suppressed error:', (e as Error).message)
  }
  await finishWithUniformDelay(startedAt)
  return { ok: true as const }
}

export async function resetPassword(input: { password: string }) {
  return _resetPassword(input)
}

export async function signOut() {
  try {
    const supabase = await createAdminAnonClient()
    await supabase.auth.signOut()

    // Also clear any default-prefixed Supabase cookies that may have been
    // written before the 'sb-admin' isolation was introduced. Without this,
    // a stale sb-{projectRef}-auth-token lingers and leaks into the user app.
    const cookieStore = await cookies()
    const allCookies = cookieStore.getAll()
    for (const c of allCookies) {
      if (/^sb-.+-auth-token/.test(c.name) && !c.name.startsWith('sb-admin')) {
        cookieStore.set(c.name, '', { maxAge: 0, path: '/' })
      }
    }

    return { ok: true as const }
  } catch {
    return { ok: true as const }
  }
}
