import { AffiliatePortalLanding } from '@tn-figueiredo/affiliate-portal/server'
import { portalConfig } from '@/config/affiliate-portal'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function ParceirosRootPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) redirect(portalConfig.routes.dashboard)

  return <AffiliatePortalLanding config={portalConfig} />
}
