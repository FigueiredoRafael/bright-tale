import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { adminPath } from '@/lib/admin-path'
import { AdminShell } from './admin-shell'

const MANAGER_ROLES = new Set(['owner', 'admin', 'support', 'billing', 'readonly'])

async function isManager(userId: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/managers?select=role&user_id=eq.${userId}&is_active=eq.true&limit=1`,
      {
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
        },
        cache: 'no-store',
      },
    )
    if (!res.ok) return false
    const rows: { role: string }[] = await res.json()
    return rows.length > 0 && MANAGER_ROLES.has(rows[0].role)
  } catch {
    return false
  }
}

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(adminPath('/login'))
  if (!(await isManager(user.id))) {
    redirect(adminPath('/login?error=unauthorized'))
  }
  return <AdminShell userEmail={user.email!}>{children}</AdminShell>
}
