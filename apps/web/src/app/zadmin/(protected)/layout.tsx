import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/admin-check'
import { adminPath } from '@/lib/admin-path'
import { AdminShell } from './admin-shell'

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(adminPath('/login'))
  if (!(await isAdminUser(supabase, user.id))) {
    redirect(adminPath('/login?error=unauthorized'))
  }
  return <AdminShell userEmail={user.email!}>{children}</AdminShell>
}
