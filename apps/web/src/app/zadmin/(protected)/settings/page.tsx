import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import AdminSettingsClient from './client'

const WRITE_ROLES = new Set(['owner', 'admin'])

export default async function AdminSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let canWrite = false
  if (user) {
    const sb = createAdminClient()
    const { data: mgr } = await sb
      .from('managers')
      .select('role')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle()
    canWrite = !!mgr && WRITE_ROLES.has(mgr.role)
  }

  return <AdminSettingsClient canWrite={canWrite} />
}
