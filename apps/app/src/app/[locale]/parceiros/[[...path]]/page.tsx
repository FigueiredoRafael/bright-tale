import { createPortalPageHandler } from '@tn-figueiredo/affiliate-portal/router'
import { portalConfig } from '@/config/affiliate-portal'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Metadata } from 'next'

type Props = { params: Promise<{ path?: string[] }> }

// Wrap to satisfy MinimalSupabaseClient interface (structural compatibility at runtime)
// biome-ignore lint/suspicious/noExplicitAny: Supabase generics don't overlap with MinimalSupabaseClient
const createPortalClient = createClient as unknown as () => Promise<any>
// biome-ignore lint/suspicious/noExplicitAny: Supabase generics don't overlap with MinimalSupabaseClient
const createPortalAdminClient = createAdminClient as unknown as () => any

const handler = createPortalPageHandler({
  createClient: createPortalClient,
  createAdminClient: createPortalAdminClient,
  config: portalConfig,
})

export async function generateMetadata(props: Props): Promise<Metadata> {
  return handler.metadata(props)
}

export default async function ParceirosPage(props: Props) {
  return handler.page(props)
}
