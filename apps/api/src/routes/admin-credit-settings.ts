import type { FastifyInstance } from 'fastify'
import { authenticate } from '../middleware/authenticate.js'
import { createServiceClient } from '../lib/supabase/index.js'
import { ApiError } from '../lib/api/errors.js'
import { updateCreditSettingsSchema } from '@brighttale/shared/schemas/pipeline-settings'

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
  cost_blog: 200,
  cost_video: 200,
  cost_shorts: 100,
  cost_podcast: 150,
  cost_canonical_core: 80,
  cost_review: 20,
}

function mapRow(row: Record<string, unknown>) {
  return {
    costBlog: row.cost_blog ?? DEFAULTS.cost_blog,
    costVideo: row.cost_video ?? DEFAULTS.cost_video,
    costShorts: row.cost_shorts ?? DEFAULTS.cost_shorts,
    costPodcast: row.cost_podcast ?? DEFAULTS.cost_podcast,
    costCanonicalCore: row.cost_canonical_core ?? DEFAULTS.cost_canonical_core,
    costReview: row.cost_review ?? DEFAULTS.cost_review,
  }
}

export async function adminCreditSettingsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get('/', async (req, reply) => {
    const sb = createServiceClient()
    const { data, error } = await sb
      .from('credit_settings')
      .select('*')
      .maybeSingle()
    if (error) throw new ApiError(500, error.message, 'CREDIT_SETTINGS_FETCH_ERROR')
    return reply.send({ data: mapRow((data ?? {}) as Record<string, unknown>), error: null })
  })

  app.patch('/', async (req, reply) => {
    const sb = createServiceClient()
    const denied = await assertAdmin(req, reply, sb)
    if (denied) return

    const body = updateCreditSettingsSchema.parse(req.body)

    const update: Record<string, unknown> = {}
    if (body.costBlog !== undefined) update.cost_blog = body.costBlog
    if (body.costVideo !== undefined) update.cost_video = body.costVideo
    if (body.costShorts !== undefined) update.cost_shorts = body.costShorts
    if (body.costPodcast !== undefined) update.cost_podcast = body.costPodcast
    if (body.costCanonicalCore !== undefined) update.cost_canonical_core = body.costCanonicalCore
    if (body.costReview !== undefined) update.cost_review = body.costReview

    const { data, error } = await sb
      .from('credit_settings')
      .update(update as any)
      .eq('lock_key', 'global')
      .select()
      .single()

    if (error) throw new ApiError(500, error.message, 'CREDIT_SETTINGS_UPDATE_ERROR')
    if (!data) throw new ApiError(404, 'Credit settings not found', 'CREDIT_SETTINGS_NOT_FOUND')

    return reply.send({ data: mapRow(data as Record<string, unknown>), error: null })
  })
}
