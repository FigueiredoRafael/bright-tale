'use server'

import {
  signInWithPassword as _signInWithPassword,
  signInWithGoogle as _signInWithGoogle,
  forgotPassword as _forgotPassword,
  resetPassword as _resetPassword,
  signOutAction as _signOut,
} from '@tn-figueiredo/auth-nextjs/actions'
import {
  gateAdminLogin,
  gateForgotPassword,
  finishWithUniformDelay,
} from './admin-login-gate'

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
    // Return shape matches ActionResult from @tn-figueiredo/admin/login:
    // { ok: false, error: string } — component renders `error` in the
    // inline error panel. Keep the string uniform so rate-limit and
    // bad-creds look identical to the user.
    return {
      ok: false as const,
      error: 'Credenciais inválidas',
    }
  }

  try {
    const result = await _signInWithPassword(input)
    await finishWithUniformDelay(startedAt)
    return result
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
    return await _signOut()
  } catch {
    return { ok: true as const }
  }
}
