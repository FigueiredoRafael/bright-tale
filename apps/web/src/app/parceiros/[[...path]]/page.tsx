import { createPortalPageHandler } from '@tn-figueiredo/affiliate-portal/router'
import { portalConfig } from '@/lib/affiliate-portal-config'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Metadata } from 'next'

type Props = { params: Promise<{ path?: string[] }> }

const handler = createPortalPageHandler({
  createClient: createClient as unknown as () => Promise<any>,
  createAdminClient: createAdminClient as unknown as () => any,
  config: portalConfig,
})

export default handler.page
export async function generateMetadata(props: Props): Promise<Metadata> {
  return handler.metadata(props)
}
