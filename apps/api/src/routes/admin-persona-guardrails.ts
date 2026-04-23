import type { FastifyInstance } from 'fastify'
import { authenticate } from '../middleware/authenticate.js'
import { createServiceClient } from '../lib/supabase/index.js'
import { ApiError } from '../lib/api/errors.js'
import {
  mapPersonaGuardrailFromDb,
  mapPersonaGuardrailToDb,
  type DbPersonaGuardrail,
} from '@brighttale/shared/mappers/db'
import {
  createGuardrailSchema,
  updateGuardrailSchema,
  toggleGuardrailSchema,
} from '@brighttale/shared/schemas/persona-guardrails'

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

export async function adminPersonaGuardrailsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // GET / — list all guardrails (all categories, all active states)
  app.get('/', async (req, reply) => {
    const sb = createServiceClient()
    const { data, error } = await sb
      .from('persona_guardrails')
      .select('*')
      .order('category')
      .order('sort_order')
    if (error) throw new ApiError(500, error.message, 'GUARDRAILS_FETCH_ERROR')
    return reply.send({ data: (data ?? []).map(r => mapPersonaGuardrailFromDb(r as DbPersonaGuardrail)), error: null })
  })

  // POST / — create guardrail (admin only)
  app.post('/', async (req, reply) => {
    const sb = createServiceClient()
    const denied = await assertAdmin(req, reply, sb)
    if (denied) return
    const body = createGuardrailSchema.parse(req.body)
    const dbInput = mapPersonaGuardrailToDb({ ...body })
    const { data, error } = await sb
      .from('persona_guardrails')
      .insert(dbInput as Omit<DbPersonaGuardrail, 'id' | 'created_at' | 'updated_at'>)
      .select()
      .single()
    if (error) throw new ApiError(500, error.message, 'GUARDRAIL_CREATE_ERROR')
    return reply.status(201).send({ data: mapPersonaGuardrailFromDb(data as DbPersonaGuardrail), error: null })
  })

  // PUT /:id — full update (admin only)
  app.put('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const sb = createServiceClient()
    const denied = await assertAdmin(req, reply, sb)
    if (denied) return
    const body = updateGuardrailSchema.parse(req.body)
    const { data, error } = await sb
      .from('persona_guardrails')
      .update(mapPersonaGuardrailToDb(body))
      .eq('id', id)
      .select()
      .single()
    if (error) throw new ApiError(500, error.message, 'GUARDRAIL_UPDATE_ERROR')
    if (!data) throw new ApiError(404, 'Guardrail not found', 'GUARDRAIL_NOT_FOUND')
    return reply.send({ data: mapPersonaGuardrailFromDb(data as DbPersonaGuardrail), error: null })
  })

  // PATCH /:id — toggle is_active (admin only)
  app.patch('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const sb = createServiceClient()
    const denied = await assertAdmin(req, reply, sb)
    if (denied) return
    const body = toggleGuardrailSchema.parse(req.body)
    const { data, error } = await sb
      .from('persona_guardrails')
      .update({ is_active: body.isActive })
      .eq('id', id)
      .select()
      .single()
    if (error) throw new ApiError(500, error.message, 'GUARDRAIL_UPDATE_ERROR')
    if (!data) throw new ApiError(404, 'Guardrail not found', 'GUARDRAIL_NOT_FOUND')
    return reply.send({ data: mapPersonaGuardrailFromDb(data as DbPersonaGuardrail), error: null })
  })

  // DELETE /:id (admin only)
  app.delete('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const sb = createServiceClient()
    const denied = await assertAdmin(req, reply, sb)
    if (denied) return
    const { error } = await sb.from('persona_guardrails').delete().eq('id', id)
    if (error) throw new ApiError(500, error.message, 'GUARDRAIL_DELETE_ERROR')
    return reply.status(204).send()
  })
}
