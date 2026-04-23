import type { FastifyInstance } from 'fastify'
import type { DbPersona } from '@brighttale/shared/mappers/db'
import type { Json } from '@brighttale/shared/types/database'
import { authenticate } from '../middleware/authenticate.js'
import { createServiceClient } from '../lib/supabase/index.js'
import { ApiError } from '../lib/api/errors.js'
import { mapPersonaFromDb, mapPersonaToDb } from '@brighttale/shared/mappers/db'
import {
  createPersonaSchema,
  updatePersonaSchema,
  togglePersonaSchema,
} from '@brighttale/shared/schemas/personas'

export async function personasRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get('/', async (_req, reply) => {
    const sb = createServiceClient()
    const { data, error } = await sb
      .from('personas')
      .select('*')
      .eq('is_active', true)
      .order('name')
    if (error) throw new ApiError(500, error.message, 'PERSONAS_FETCH_ERROR')
    return reply.send({ data: (data ?? []).map(row => mapPersonaFromDb(row as DbPersona)), error: null })
  })

  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const sb = createServiceClient()
    const { data, error } = await sb.from('personas').select('*').eq('id', id).maybeSingle()
    if (error) throw new ApiError(500, error.message, 'PERSONAS_FETCH_ERROR')
    if (!data) throw new ApiError(404, 'Persona not found', 'PERSONA_NOT_FOUND')
    return reply.send({ data: mapPersonaFromDb(data as DbPersona), error: null })
  })

  app.post('/', async (req, reply) => {
    const body = createPersonaSchema.parse(req.body)
    const sb = createServiceClient()
    const { data, error } = await sb
      .from('personas')
      .insert({
        slug: body.slug,
        name: body.name,
        avatar_url: body.avatarUrl ?? null,
        bio_short: body.bioShort,
        bio_long: body.bioLong,
        primary_domain: body.primaryDomain,
        domain_lens: body.domainLens,
        approved_categories: body.approvedCategories,
        writing_voice_json: body.writingVoiceJson as unknown as Json,
        eeat_signals_json: body.eeatSignalsJson as unknown as Json,
        soul_json: body.soulJson as unknown as Json,
      })
      .select()
      .single()
    if (error) throw new ApiError(500, error.message, 'PERSONA_CREATE_ERROR')
    return reply.status(201).send({ data: mapPersonaFromDb(data as DbPersona), error: null })
  })

  app.put('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = updatePersonaSchema.parse(req.body)
    const sb = createServiceClient()
    const dbInput = mapPersonaToDb(body)
    const { data, error } = await sb
      .from('personas')
      .update(dbInput as any)
      .eq('id', id)
      .select()
      .single()
    if (error) throw new ApiError(500, error.message, 'PERSONA_UPDATE_ERROR')
    if (!data) throw new ApiError(404, 'Persona not found', 'PERSONA_NOT_FOUND')
    return reply.send({ data: mapPersonaFromDb(data as DbPersona), error: null })
  })

  app.patch('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = togglePersonaSchema.parse(req.body)
    const sb = createServiceClient()
    const { data, error } = await sb
      .from('personas')
      .update({ is_active: body.isActive })
      .eq('id', id)
      .select()
      .single()
    if (error) throw new ApiError(500, error.message, 'PERSONA_UPDATE_ERROR')
    if (!data) throw new ApiError(404, 'Persona not found', 'PERSONA_NOT_FOUND')
    return reply.send({ data: mapPersonaFromDb(data as DbPersona), error: null })
  })
}
