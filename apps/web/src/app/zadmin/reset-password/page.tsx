'use client'

import { AdminResetPassword } from '@tn-figueiredo/admin/login'
import { useAdminPaths } from '@/lib/use-admin-paths'
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

export default function ResetPasswordPage() {
  const { adminPath } = useAdminPaths();
  return (
    <AdminResetPassword
      actions={{ resetPassword: actions.resetPassword }}
      theme={THEME}
      redirectAfterReset={adminPath('/login?reset=ok')}
    />
  )
}
