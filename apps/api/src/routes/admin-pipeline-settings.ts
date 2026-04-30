import type { FastifyInstance } from 'fastify'
import { authenticate } from '../middleware/authenticate.js'
import { createServiceClient } from '../lib/supabase/index.js'
import { ApiError } from '../lib/api/errors.js'
import { updatePipelineSettingsSchema } from '@brighttale/shared/schemas/pipeline-settings'

async function assertAdmin(request: any, reply: any, sb: ReturnType<typeof createServiceClient>) {
  if (!request.userId) {
    return reply.status(401).send({ data: null, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } })
  }
  const { data: role } = await sb
    .from('user_roles')
    .select('role')
    .eq('user_id', request.userId)
    .eq('role', 'admin')
    .maybeSingle()
  if (!role) {
    return reply.status(403).send({ data: null, error: { code: 'FORBIDDEN', message: 'Admin role required' } })
  }
  return null
}

const DEFAULTS = {
  review_reject_threshold: 40,
  review_approve_score: 90,
  review_max_iterations: 5,
  default_providers_json: { brainstorm: 'gemini', research: 'gemini', canonicalCore: 'gemini', draft: 'gemini', review: 'gemini', assets: 'gemini' },
  default_models_json: {} as Record<string, string>,
}

function mapRow(row: Record<string, unknown>) {
  return {
    reviewRejectThreshold: row.review_reject_threshold ?? DEFAULTS.review_reject_threshold,
    reviewApproveScore: row.review_approve_score ?? DEFAULTS.review_approve_score,
    reviewMaxIterations: row.review_max_iterations ?? DEFAULTS.review_max_iterations,
    defaultProviders: row.default_providers_json ?? DEFAULTS.default_providers_json,
    defaultModels: (row.default_models_json ?? DEFAULTS.default_models_json) as Record<string, string>,
  }
}

export async function adminPipelineSettingsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get('/', async (req, reply) => {
    const sb = createServiceClient()
    const { data, error } = await sb
      .from('pipeline_settings')
      .select('*')
      .maybeSingle()
    if (error) throw new ApiError(500, error.message, 'PIPELINE_SETTINGS_FETCH_ERROR')
    return reply.send({ data: mapRow((data ?? {}) as Record<string, unknown>), error: null })
  })

  app.patch('/', async (req, reply) => {
    const sb = createServiceClient()
    const denied = await assertAdmin(req, reply, sb)
    if (denied) return

    const body = updatePipelineSettingsSchema.parse(req.body)

    const update: Record<string, unknown> = {}
    if (body.reviewRejectThreshold !== undefined) update.review_reject_threshold = body.reviewRejectThreshold
    if (body.reviewApproveScore !== undefined) update.review_approve_score = body.reviewApproveScore
    if (body.reviewMaxIterations !== undefined) update.review_max_iterations = body.reviewMaxIterations
    if (body.defaultProviders !== undefined) update.default_providers_json = body.defaultProviders
    if (body.defaultModels !== undefined) update.default_models_json = body.defaultModels

    const { data, error } = await sb
      .from('pipeline_settings')
      .update(update as any)
      .eq('lock_key', 'global')
      .select()
      .single()

    if (error) throw new ApiError(500, error.message, 'PIPELINE_SETTINGS_UPDATE_ERROR')
    if (!data) throw new ApiError(404, 'Pipeline settings not found', 'PIPELINE_SETTINGS_NOT_FOUND')

    return reply.send({ data: mapRow(data as Record<string, unknown>), error: null })
  })
}
