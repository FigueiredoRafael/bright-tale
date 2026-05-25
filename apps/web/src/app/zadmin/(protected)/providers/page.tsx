import { createAdminClient } from '@/lib/supabase/admin'
import { ProvidersClient } from './client'

export const dynamic = 'force-dynamic'

export default async function ProvidersPage() {
  const sb = createAdminClient()

  const [{ data, error }, { data: assignData }] = await Promise.all([
    sb.from('ai_provider_configs').select('id, provider, api_key, is_active, models_json, updated_at').order('provider'),
    sb.from('module_ai_assignments').select('module_slug, provider, model').order('module_slug'),
  ])

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

  const assignments = Object.fromEntries(
    (assignData ?? []).map((r: any) => [r.module_slug as string, { provider: r.provider as string, model: r.model as string }])
  )

  return <ProvidersClient initialProviders={providers} initialAssignments={assignments} />
}
