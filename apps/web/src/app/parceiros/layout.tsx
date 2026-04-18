import { AffiliatePortalLayout } from '@tn-figueiredo/affiliate-portal/server'
import { createPortalLayoutData } from '@tn-figueiredo/affiliate-portal/data'
import { AffiliateSignOutButton } from '@tn-figueiredo/affiliate-portal/client'
import { portalConfig } from '@/lib/affiliate-portal-config'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { signOutAction } from './actions'

export default async function ParceirosLayout({ children }: { children: React.ReactNode }) {
  const layoutData = await createPortalLayoutData({
    createAdminClient: createAdminClient as unknown as () => any,
    createClient: createClient as unknown as () => Promise<any>,
    killSwitchIds: portalConfig.killSwitchIds,
  })

  return (
    <AffiliatePortalLayout
      {...layoutData}
      config={portalConfig}
      signOutButton={<AffiliateSignOutButton onSignOut={signOutAction} />}
    >
      {children}
    </AffiliatePortalLayout>
  )
}
