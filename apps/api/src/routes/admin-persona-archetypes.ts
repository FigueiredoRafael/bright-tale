import type { FastifyInstance } from 'fastify'
import { authenticate } from '../middleware/authenticate.js'
import { createServiceClient } from '../lib/supabase/index.js'
import { ApiError } from '../lib/api/errors.js'
import {
  mapPersonaArchetypeAdmin,
  mapPersonaArchetypeToDb,
  type DbPersonaArchetype,
} from '@brighttale/shared/mappers/db'
import {
  createArchetypeSchema,
  updateArchetypeSchema,
  toggleArchetypeSchema,
} from '@brighttale/shared/schemas/persona-archetypes'

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

export async function adminPersonaArchetypesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // GET / — list all archetypes (admin: includes behavioral_overlay_json)
  app.get('/', async (req, reply) => {
    const sb = createServiceClient()
    const denied = await assertAdmin(req, reply, sb)
    if (denied) return
    const { data, error } = await sb
      .from('persona_archetypes')
      .select('*')
      .order('sort_order')
    if (error) throw new ApiError(500, error.message, 'ARCHETYPES_FETCH_ERROR')
    return reply.send({ data: (data ?? []).map(r => mapPersonaArchetypeAdmin(r as DbPersonaArchetype)), error: null })
  })

  // GET /:id — get one archetype (admin: includes overlay)
  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const sb = createServiceClient()
    const denied = await assertAdmin(req, reply, sb)
    if (denied) return
    const { data, error } = await sb.from('persona_archetypes').select('*').eq('id', id).maybeSingle()
    if (error) throw new ApiError(500, error.message, 'ARCHETYPE_FETCH_ERROR')
    if (!data) throw new ApiError(404, 'Archetype not found', 'ARCHETYPE_NOT_FOUND')
    return reply.send({ data: mapPersonaArchetypeAdmin(data as DbPersonaArchetype), error: null })
  })

  // POST / — create archetype (admin only)
  app.post('/', async (req, reply) => {
    const sb = createServiceClient()
    const denied = await assertAdmin(req, reply, sb)
    if (denied) return
    const body = createArchetypeSchema.parse(req.body)
    const dbInput = mapPersonaArchetypeToDb({
      name: body.name,
      description: body.description,
      icon: body.icon,
      defaultFieldsJson: body.defaultFieldsJson,
      behavioralOverlayJson: body.behavioralOverlayJson,
      sortOrder: body.sortOrder,
      isActive: body.isActive,
    })
    const { data, error } = await sb
      .from('persona_archetypes')
      .insert({ ...dbInput, slug: body.slug } as Omit<DbPersonaArchetype, 'id' | 'created_at' | 'updated_at'>)
      .select()
      .single()
    if (error) throw new ApiError(500, error.message, 'ARCHETYPE_CREATE_ERROR')
    return reply.status(201).send({ data: mapPersonaArchetypeAdmin(data as DbPersonaArchetype), error: null })
  })

  // PUT /:id — full update, slug immutable (admin only)
  app.put('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const sb = createServiceClient()
    const denied = await assertAdmin(req, reply, sb)
    if (denied) return
    const body = updateArchetypeSchema.parse(req.body)
    const dbInput = mapPersonaArchetypeToDb(body as any)
    const { data, error } = await sb
      .from('persona_archetypes')
      .update(dbInput)
      .eq('id', id)
      .select()
      .single()
    if (error) throw new ApiError(500, error.message, 'ARCHETYPE_UPDATE_ERROR')
    if (!data) throw new ApiError(404, 'Archetype not found', 'ARCHETYPE_NOT_FOUND')
    return reply.send({ data: mapPersonaArchetypeAdmin(data as DbPersonaArchetype), error: null })
  })

  // PATCH /:id — toggle is_active (admin only)
  app.patch('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const sb = createServiceClient()
    const denied = await assertAdmin(req, reply, sb)
    if (denied) return
    const body = toggleArchetypeSchema.parse(req.body)
    const { data, error } = await sb
      .from('persona_archetypes')
      .update({ is_active: body.isActive })
      .eq('id', id)
      .select()
      .single()
    if (error) throw new ApiError(500, error.message, 'ARCHETYPE_UPDATE_ERROR')
    if (!data) throw new ApiError(404, 'Archetype not found', 'ARCHETYPE_NOT_FOUND')
    return reply.send({ data: mapPersonaArchetypeAdmin(data as DbPersonaArchetype), error: null })
  })

  // DELETE /:id (admin only)
  app.delete('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const sb = createServiceClient()
    const denied = await assertAdmin(req, reply, sb)
    if (denied) return
    const { error } = await sb.from('persona_archetypes').delete().eq('id', id)
    if (error) throw new ApiError(500, error.message, 'ARCHETYPE_DELETE_ERROR')
    return reply.status(204).send()
  })
}
