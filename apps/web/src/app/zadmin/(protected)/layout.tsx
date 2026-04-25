import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminUser } from '@/lib/admin-check'
import { adminPath } from '@/lib/admin-path'
import { AdminShell } from './admin-shell'

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(adminPath('/login'))
  const adminClient = createAdminClient()
  if (!(await isAdminUser(adminClient, user.id))) {
    redirect(adminPath('/login?error=unauthorized'))
  }
  return <AdminShell userEmail={user.email!}>{children}</AdminShell>
}
