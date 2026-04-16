'use client'

import { Suspense } from 'react'
import { AdminLogin } from '@tn-figueiredo/admin/login'
import { useSearchParams } from 'next/navigation'
import { adminPath } from '@/lib/admin-path'
import * as actions from '@/lib/auth/admin-actions'

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
  const authError = useSearchParams().get('error') ?? undefined
  return (
    <AdminLogin
      actions={{
        signInWithPassword: actions.signInWithPassword,
        signInWithGoogle: actions.signInWithGoogle,
      }}
      theme={THEME}
      authError={authError}
      redirectTo={adminPath()}
    />
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
