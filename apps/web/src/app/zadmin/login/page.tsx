'use client'

import { Suspense } from 'react'
import { AdminLogin } from '@tn-figueiredo/admin/login'
import { useRouter, useSearchParams } from 'next/navigation'
import { adminPath } from '@/lib/admin-path'
import * as actions from '@/lib/auth/admin-actions'
import { RateLimitBanner } from './RateLimitBanner'

export const dynamic = 'force-dynamic'

const THEME = {
  bg: '#0a0e1a',
  card: '#121826',
  accent: '#22d3ee',
  accentHover: '#06b6d4',
  text: '#e6edf7',
  muted: '#8b98b0',
  border: '#263146',
} as const

function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const errorParam = params.get('error') ?? undefined
  const isRateLimited = errorParam === 'rate_limited'
  const authError = isRateLimited ? undefined : errorParam

  async function handleSignIn(input: { email: string; password: string }) {
    const result = await actions.signInWithPassword(input)
    if (!result.ok && result.error === 'rate_limited' && 'retryAfter' in result) {
      const resetAt = Date.now() + (result.retryAfter as number) * 1000
      localStorage.setItem('adminRateLimitResetAt', String(resetAt))
      router.push(adminPath('/login?error=rate_limited'))
      return result
    }
    return result
  }

  return (
    <>
      {/*
        SEC-007: hide Google sign-in button + its "or" divider rendered by
        the external AdminLogin component. We can't remove it via prop
        (the component renders it unconditionally) so we suppress at CSS
        layer. The Server Action wrapper rejects the click anyway, but
        hiding removes the misleading UI.
      */}
      <style>{`
        /* Google button — identified by its #EA4335 G-logo path */
        button:has(svg path[fill="#EA4335"]) { display: none !important; }
        /* "or" divider that sits between OAuth and the email form */
        button:has(svg path[fill="#EA4335"]) + div[aria-hidden="true"] { display: none !important; }
      `}</style>
      {/*
        SEC-007: Google OAuth intentionally NOT wired on admin login.
        Supabase OAuth auto-creates an auth.users row for any Google
        account that reaches the callback, which:
          • clutters the user pool with non-admin strangers,
          • creates an email-enumeration side channel, and
          • turns into instant privilege escalation the day someone
            adds a domain-based role auto-assign.
        Admin provisioning is manual via SQL INSERT into user_roles
        (documented in docs/security/ADMIN-PROVISIONING.md).
      */}
      <AdminLogin
        actions={{
          signInWithPassword: handleSignIn,
          // Required by external component type; our impl is a no-op
          // rejector (see admin-actions.ts). The CSS above hides the
          // visible button so the user never sees it.
          signInWithGoogle: actions.signInWithGoogle,
        }}
        theme={THEME}
        authError={authError}
        redirectTo={adminPath()}
        logo={isRateLimited ? <RateLimitBanner /> : undefined}
      />
    </>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
