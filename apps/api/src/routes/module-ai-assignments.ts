import type { FastifyInstance } from 'fastify'
import { authenticate } from '../middleware/authenticate.js'
import { createServiceClient } from '../lib/supabase/index.js'
import { ApiError } from '../lib/api/errors.js'
import { mapModuleAiAssignmentFromDb } from '@brighttale/shared/mappers/db'
import { upsertModuleAiAssignmentSchema, MODULE_SLUGS } from '@brighttale/shared/schemas/module-ai-assignments'

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

export async function moduleAiAssignmentsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // GET /api/ai-providers/module-assignments — list all assignments
  app.get('/', async (req, reply) => {
    const sb = createServiceClient()
    const { data, error } = await sb
      .from('module_ai_assignments')
      .select('*')
      .order('module_slug')
    if (error) throw new ApiError(500, error.message, 'MODULE_ASSIGNMENTS_FETCH_ERROR')
    return reply.send({ data: (data ?? []).map(r => mapModuleAiAssignmentFromDb(r as any)), error: null })
  })

  // PUT /api/ai-providers/module-assignments — upsert an assignment
  app.put('/', async (req, reply) => {
    const sb = createServiceClient()
    const denied = await assertAdmin(req, reply, sb)
    if (denied) return

    const parse = upsertModuleAiAssignmentSchema.safeParse(req.body)
    if (!parse.success) {
      return reply.status(400).send({ data: null, error: { code: 'VALIDATION_ERROR', message: parse.error.message } })
    }

    const { moduleSlug, provider, model } = parse.data
    const { data, error } = await sb
      .from('module_ai_assignments')
      .upsert({ module_slug: moduleSlug, provider, model } as any, { onConflict: 'module_slug' })
      .select('*')
      .single()

    if (error) throw new ApiError(500, error.message, 'MODULE_ASSIGNMENT_UPSERT_ERROR')
    return reply.send({ data: mapModuleAiAssignmentFromDb(data as any), error: null })
  })

  // DELETE /api/ai-providers/module-assignments/:moduleSlug — remove override (revert to global)
  app.delete('/:moduleSlug', async (req, reply) => {
    const sb = createServiceClient()
    const denied = await assertAdmin(req, reply, sb)
    if (denied) return

    const { moduleSlug } = req.params as { moduleSlug: string }
    if (!MODULE_SLUGS.includes(moduleSlug as any)) {
      return reply.status(400).send({ data: null, error: { code: 'INVALID_MODULE', message: 'Unknown module slug' } })
    }

    const { error } = await sb
      .from('module_ai_assignments')
      .delete()
      .eq('module_slug', moduleSlug as any)

    if (error) throw new ApiError(500, error.message, 'MODULE_ASSIGNMENT_DELETE_ERROR')
    return reply.send({ data: { deleted: true }, error: null })
  })
}
