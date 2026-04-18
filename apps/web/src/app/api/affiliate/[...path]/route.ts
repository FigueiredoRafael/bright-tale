import { createAffiliateApiHandler } from '@tn-figueiredo/affiliate-portal/router'
import { portalConfig } from '@/lib/affiliate-portal-config'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const handler = createAffiliateApiHandler({
  config: portalConfig,
  createClient: createClient as unknown as () => Promise<any>,
  createAdminClient: createAdminClient as unknown as () => any,
})

export { handler as GET, handler as POST, handler as PUT, handler as DELETE, handler as PATCH }
