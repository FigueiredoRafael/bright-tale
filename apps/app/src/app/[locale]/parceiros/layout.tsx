import { AffiliatePortalLayout } from '@tn-figueiredo/affiliate-portal/server'
import { createPortalLayoutData } from '@tn-figueiredo/affiliate-portal/data'
import { AffiliateSignOutButton } from '@tn-figueiredo/affiliate-portal/client'
import { portalConfig } from '@/config/affiliate-portal'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { signOutAction } from './actions'

// Wrap to satisfy MinimalSupabaseClient interface (structural compatibility at runtime)
// biome-ignore lint/suspicious/noExplicitAny: Supabase generics don't overlap with MinimalSupabaseClient
const createPortalClient = createClient as unknown as () => Promise<any>
// biome-ignore lint/suspicious/noExplicitAny: Supabase generics don't overlap with MinimalSupabaseClient
const createPortalAdminClient = createAdminClient as unknown as () => any

export default async function ParceirosLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const layoutData = await createPortalLayoutData({
    createAdminClient: createPortalAdminClient,
    createClient: createPortalClient,
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
