'use client'

import { Suspense } from 'react'
import { AdminLogin } from '@tn-figueiredo/admin/login'
import { useSearchParams } from 'next/navigation'
import { adminPath } from '@/lib/admin-path'
import * as actions from '@/lib/auth/admin-actions'
import { RateLimitBanner } from './RateLimitBanner'

export const dynamic = 'force-dynamic'

const THEME = {
  bg: 'var(--auth-bg)',
  card: 'var(--auth-card-bg)',
  accent: 'var(--auth-accent)',
  accentHover: 'var(--auth-accent-hover)',
  text: 'var(--auth-text)',
  muted: 'var(--auth-muted)',
  border: 'var(--auth-border)',
} as const

function LoginForm() {
  const params = useSearchParams()
  const errorParam = params.get('error') ?? undefined
  const retry = Number(params.get('retry') ?? 0)
  const isRateLimited = errorParam === 'rate_limited'
  // When rate-limited, don't pass the error down to AdminLogin — the
  // banner handles the messaging and the form's own error panel would be
  // confusing on top of the countdown.
  const authError = isRateLimited ? undefined : errorParam
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
          signInWithPassword: actions.signInWithPassword,
          // Required by external component type; our impl is a no-op
          // rejector (see admin-actions.ts). The CSS above hides the
          // visible button so the user never sees it.
          signInWithGoogle: actions.signInWithGoogle,
        }}
        theme={THEME}
        authError={authError}
        redirectTo={adminPath()}
        logo={
          isRateLimited ? (
            <RateLimitBanner retrySeconds={retry} />
          ) : undefined
        }
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
