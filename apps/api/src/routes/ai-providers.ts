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
      .select('id, provider, api_key, is_active, models_json, updated_at')
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
      .select('id, provider, api_key, is_active, models_json, updated_at')
      .single()

    if (error) throw new ApiError(500, error.message, 'AI_PROVIDERS_UPDATE_ERROR')
    if (!data) throw new ApiError(404, 'Provider not found', 'AI_PROVIDER_NOT_FOUND')

    return reply.send({ data: maskRow(data as unknown as Record<string, unknown>), error: null })
  })

  // ── POST /api/ai-providers/:id/sync-models ─────────────────────────────
  // Fetches the live model list from the provider API and returns it.
  // Does NOT auto-save — the admin reviews and saves via PATCH.
  app.post('/:id/sync-models', async (req, reply) => {
    const sb = createServiceClient()
    const denied = await assertAdmin(req, reply, sb)
    if (denied) return

    const { id } = req.params as { id: string }
    const { data: row, error } = await sb
      .from('ai_provider_configs')
      .select('id, provider, api_key')
      .eq('id', id)
      .single()

    if (error || !row) throw new ApiError(404, 'Provider not found', 'AI_PROVIDER_NOT_FOUND')

    const { provider, api_key } = row as { provider: string; api_key: string | null }

    if (!api_key || INTERNAL_KEYS.has(api_key)) {
      throw new ApiError(400, 'No API key configured for this provider', 'NO_API_KEY')
    }

    let key: string
    try {
      key = decrypt(api_key, { aad: aad(id) })
    } catch {
      throw new ApiError(500, 'Failed to decrypt API key', 'DECRYPT_ERROR')
    }

    let models: string[] = []

    if (provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${key}` },
      })
      if (!res.ok) throw new ApiError(502, `OpenAI returned ${res.status}`, 'UPSTREAM_ERROR')
      const json = await res.json() as { data: { id: string }[] }
      models = json.data
        .map(m => m.id)
        .filter(id => /^(gpt|o1|o3|o4|chatgpt)/.test(id) && !/instruct|embed|dall|tts|whisper|realtime|search|audio/.test(id))
        .sort()

    } else if (provider === 'anthropic') {
      const res = await fetch('https://api.anthropic.com/v1/models', {
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      })
      if (!res.ok) throw new ApiError(502, `Anthropic returned ${res.status}`, 'UPSTREAM_ERROR')
      const json = await res.json() as { data: { id: string; display_name: string }[] }
      models = json.data.map(m => m.id).sort()

    } else if (provider === 'gemini') {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}&pageSize=100`)
      if (!res.ok) throw new ApiError(502, `Gemini returned ${res.status}`, 'UPSTREAM_ERROR')
      const json = await res.json() as { models: { name: string; supportedGenerationMethods?: string[] }[] }
      models = (json.models ?? [])
        .filter(m => (m.supportedGenerationMethods ?? []).includes('generateContent') && !/embed|aqa/.test(m.name))
        .map(m => m.name.replace(/^models\//, ''))
        .sort()

    } else {
      throw new ApiError(400, `Sync not supported for provider: ${provider}`, 'SYNC_NOT_SUPPORTED')
    }

    return reply.send({ data: { models }, error: null })
  })
}
