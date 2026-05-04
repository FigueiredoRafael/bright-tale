import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { encrypt, aadFor } from '@/lib/crypto'

const patchSchema = z.object({
  isActive:   z.boolean().optional(),
  apiKey:     z.string().min(1).optional(),
  modelsJson: z.array(z.string()).optional(),
})

const INTERNAL = new Set(['__placeholder__', '__manual__'])
const MANAGER_ROLES = new Set(['owner', 'admin', 'support', 'billing', 'readonly'])

function maskRow(row: Record<string, unknown>) {
  const key = row.api_key as string | null
  return {
    id:         row.id,
    provider:   row.provider,
    isActive:   row.is_active,
    hasApiKey:  !!key && !INTERNAL.has(key),
    modelsJson: (row.models_json ?? []) as string[],
    updatedAt:  row.updated_at,
  }
}

function fail(status: number, code: string, message: string) {
  return NextResponse.json({ data: null, error: { code, message } }, { status })
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail(401, 'UNAUTHORIZED', 'Not authenticated')

  const sb = createAdminClient()
  const { data: mgr } = await sb
    .from('managers')
    .select('role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (!mgr || !MANAGER_ROLES.has(mgr.role)) {
    return fail(403, 'FORBIDDEN', 'Manager access required')
  }

  const parsed = patchSchema.safeParse(await request.json())
  if (!parsed.success) {
    return fail(400, 'VALIDATION_ERROR', parsed.error.message)
  }

  const { id } = await context.params
  const { isActive, apiKey, modelsJson } = parsed.data
  const update: Record<string, unknown> = {}

  if (isActive !== undefined) update.is_active = isActive
  if (apiKey !== undefined) {
    update.api_key = encrypt(apiKey, { aad: aadFor('ai_provider_configs', 'api_key', id, 'admin') })
  }
  if (modelsJson !== undefined) update.models_json = modelsJson

  if (Object.keys(update).length === 0) {
    return fail(400, 'NO_FIELDS', 'Nothing to update')
  }

  const { data, error } = await sb
    .from('ai_provider_configs')
    .update(update as never)
    .eq('id', id)
    .select('id, provider, api_key, is_active, models_json, updated_at')
    .single()

  if (error) return fail(500, 'UPDATE_ERROR', error.message)
  if (!data) return fail(404, 'NOT_FOUND', 'Provider not found')

  return NextResponse.json({ data: maskRow(data as unknown as Record<string, unknown>), error: null })
}
