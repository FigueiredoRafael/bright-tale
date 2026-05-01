import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../middleware/authenticate.js'
import { createServiceClient } from '../lib/supabase/index.js'
import { encrypt, decrypt, aadFor } from '../lib/crypto.js'
import { ApiError } from '../lib/api/errors.js'

const PLACEHOLDER = '__placeholder__'
const MANUAL_KEY = '__manual__'
const INTERNAL_KEYS = new Set([PLACEHOLDER, MANUAL_KEY])

const patchSchema = z.object({
  isActive:   z.boolean().optional(),
  apiKey:     z.string().min(1).optional(),
  modelsJson: z.array(z.string()).optional(),
})

function aad(id: string) {
  return aadFor('ai_provider_configs', 'api_key', id, 'admin')
}

function maskRow(row: Record<string, unknown>) {
  const key = row.api_key as string | null
  return {
    id:          row.id,
    provider:    row.provider,
    isActive:    row.is_active,
    hasApiKey:   !!key && !INTERNAL_KEYS.has(key),
    modelsJson:  (row.models_json ?? []) as string[],
    updatedAt:   row.updated_at,
  }
}

async function assertAdmin(req: any, reply: any, sb: ReturnType<typeof createServiceClient>) {
  if (!req.userId) {
    return reply.status(401).send({ data: null, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } })
  }
  const { data: role } = await sb
    .from('user_roles')
    .select('role')
    .eq('user_id', req.userId)
    .eq('role', 'admin')
    .maybeSingle()
  if (!role) {
    return reply.status(403).send({ data: null, error: { code: 'FORBIDDEN', message: 'Admin role required' } })
  }
  return null
}

export async function aiProvidersRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // ── GET /api/ai-providers ──────────────────────────────────────────────
  app.get('/', async (req, reply) => {
    const sb = createServiceClient()
    const { data, error } = await sb
      .from('ai_provider_configs')
      .select('id, provider, api_key, is_active, updated_at')
      .order('provider')
    if (error) throw new ApiError(500, error.message, 'AI_PROVIDERS_FETCH_ERROR')
    // models_json not yet in generated types — cast through unknown until db:types reruns
    return reply.send({ data: (data ?? []).map(r => maskRow(r as unknown as Record<string, unknown>)), error: null })
  })

  // ── PATCH /api/ai-providers/:id ────────────────────────────────────────
  app.patch('/:id', async (req, reply) => {
    const sb = createServiceClient()
    const denied = await assertAdmin(req, reply, sb)
    if (denied) return

    const { id } = req.params as { id: string }
    const body = patchSchema.safeParse(req.body)
    if (!body.success) {
      return reply.status(400).send({ data: null, error: { code: 'VALIDATION_ERROR', message: body.error.message } })
    }

    const { isActive, apiKey, modelsJson } = body.data
    const update: Record<string, unknown> = {}

    if (isActive !== undefined) update.is_active = isActive

    if (apiKey !== undefined) {
      update.api_key = encrypt(apiKey, { aad: aad(id) })
    }

    if (modelsJson !== undefined) update.models_json = modelsJson

    if (Object.keys(update).length === 0) {
      return reply.status(400).send({ data: null, error: { code: 'NO_FIELDS', message: 'Nothing to update' } })
    }

    const { data, error } = await sb
      .from('ai_provider_configs')
      .update(update as any)
      .eq('id', id)
      .select('id, provider, api_key, is_active, updated_at')
      .single()

    if (error) throw new ApiError(500, error.message, 'AI_PROVIDERS_UPDATE_ERROR')
    if (!data) throw new ApiError(404, 'Provider not found', 'AI_PROVIDER_NOT_FOUND')

    return reply.send({ data: maskRow(data as unknown as Record<string, unknown>), error: null })
  })
}
