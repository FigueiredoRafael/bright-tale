import { createAdminClient } from '@/lib/supabase/admin'
import { ProvidersClient } from './client'

export const dynamic = 'force-dynamic'

export default async function ProvidersPage() {
  const sb = createAdminClient()
  const { data, error } = await sb
    .from('ai_provider_configs')
    .select('id, provider, api_key, is_active, models_json, updated_at')
    .order('provider')

  if (error) throw new Error(error.message)

  const INTERNAL = new Set(['__placeholder__', '__manual__'])

  const providers = (data ?? []).map((row: any) => ({
    id:         row.id as string,
    provider:   row.provider as string,
    isActive:   row.is_active as boolean,
    hasApiKey:  !!row.api_key && !INTERNAL.has(row.api_key as string),
    modelsJson: (row.models_json ?? []) as string[],
    updatedAt:  row.updated_at as string,
  }))

  return <ProvidersClient initialProviders={providers} />
}
