import { redirect } from 'next/navigation'
import { createAdminLayout } from '@tn-figueiredo/admin'
import { createClient } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/admin-check'
import { adminPath } from '@/lib/admin-path'
import { ADMIN_LAYOUT_CONFIG } from '@/lib/admin-layout-config'

const AdminLayout = createAdminLayout(ADMIN_LAYOUT_CONFIG)

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(adminPath('/login'))
  if (!(await isAdminUser(supabase, user.id))) {
    redirect(adminPath('/login?error=unauthorized'))
  }
  return <AdminLayout userEmail={user.email!}>{children}</AdminLayout>
}
