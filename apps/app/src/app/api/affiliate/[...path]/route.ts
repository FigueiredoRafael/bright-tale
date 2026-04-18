import { createAffiliateApiHandler } from '@tn-figueiredo/affiliate-portal/router'
import { portalConfig } from '@/config/affiliate-portal'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Wrap to satisfy MinimalSupabaseClient interface (structural compatibility at runtime)
// biome-ignore lint/suspicious/noExplicitAny: Supabase generics don't overlap with MinimalSupabaseClient
const createPortalClient = createClient as unknown as () => Promise<any>
// biome-ignore lint/suspicious/noExplicitAny: Supabase generics don't overlap with MinimalSupabaseClient
const createPortalAdminClient = createAdminClient as unknown as () => any

const handler = createAffiliateApiHandler({
  createClient: createPortalClient,
  createAdminClient: createPortalAdminClient,
  config: portalConfig,
})

export const { GET, POST, PUT, DELETE } = handler
