import type { FastifyInstance } from 'fastify'
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

  app.get('/api/personas', async (_req, reply) => {
    const sb = createServiceClient()
    const { data, error } = await sb
      .from('personas')
      .select('*')
      .eq('is_active', true)
      .order('name')
    if (error) throw new ApiError(500, 'PERSONAS_FETCH_ERROR', error.message)
    return reply.send({ data: (data ?? []).map(row => mapPersonaFromDb(row as any)), error: null })
  })

  app.get('/api/personas/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const sb = createServiceClient()
    const { data, error } = await sb.from('personas').select('*').eq('id', id).maybeSingle()
    if (error) throw new ApiError(500, 'PERSONAS_FETCH_ERROR', error.message)
    if (!data) throw new ApiError(404, 'PERSONA_NOT_FOUND', 'Persona not found')
    return reply.send({ data: mapPersonaFromDb(data as any), error: null })
  })

  app.post('/api/personas', async (req, reply) => {
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
        writing_voice_json: body.writingVoiceJson as unknown as any,
        eeat_signals_json: body.eeatSignalsJson as unknown as any,
        soul_json: body.soulJson as unknown as any,
      })
      .select()
      .single()
    if (error) throw new ApiError(500, 'PERSONA_CREATE_ERROR', error.message)
    return reply.status(201).send({ data: mapPersonaFromDb(data as any), error: null })
  })

  app.put('/api/personas/:id', async (req, reply) => {
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
    if (error) throw new ApiError(500, 'PERSONA_UPDATE_ERROR', error.message)
    if (!data) throw new ApiError(404, 'PERSONA_NOT_FOUND', 'Persona not found')
    return reply.send({ data: mapPersonaFromDb(data as any), error: null })
  })

  app.patch('/api/personas/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = togglePersonaSchema.parse(req.body)
    const sb = createServiceClient()
    const { data, error } = await sb
      .from('personas')
      .update({ is_active: body.isActive } as any)
      .eq('id', id)
      .select()
      .single()
    if (error) throw new ApiError(500, 'PERSONA_UPDATE_ERROR', error.message)
    if (!data) throw new ApiError(404, 'PERSONA_NOT_FOUND', 'Persona not found')
    return reply.send({ data: mapPersonaFromDb(data as any), error: null })
  })
}
