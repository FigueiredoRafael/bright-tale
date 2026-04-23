import type { FastifyInstance } from 'fastify'
import { authenticate } from '../middleware/authenticate.js'
import { createServiceClient } from '../lib/supabase/index.js'
import { ApiError } from '../lib/api/errors.js'
import {
  mapChannelPersonaFromDb,
  mapPersonaFromDb,
  type DbChannelPersona,
  type DbPersona,
} from '@brighttale/shared/mappers/db'
import {
  assignChannelPersonaSchema,
  setPrimaryChannelPersonaSchema,
} from '@brighttale/shared/schemas/channel-personas'

export async function channelPersonasRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // GET /:channelId/personas — list personas for a channel
  app.get('/:channelId/personas', async (req, reply) => {
    const { channelId } = req.params as { channelId: string }
    const sb = createServiceClient()
    const { data, error } = await sb
      .from('channel_personas')
      .select('*, personas(*)')
      .eq('channel_id', channelId)
      .order('is_primary', { ascending: false })
    if (error) throw new ApiError(500, error.message, 'CHANNEL_PERSONAS_FETCH_ERROR')
    return reply.send({
      data: (data ?? []).map(row => ({
        ...mapChannelPersonaFromDb(row as DbChannelPersona),
        persona: mapPersonaFromDb((row as { personas: DbPersona }).personas),
      })),
      error: null,
    })
  })

  // POST /:channelId/personas — assign persona to channel
  app.post('/:channelId/personas', async (req, reply) => {
    const { channelId } = req.params as { channelId: string }
    const body = assignChannelPersonaSchema.parse(req.body)
    const sb = createServiceClient()

    if (body.isPrimary) {
      const { error: clearErr } = await sb
        .from('channel_personas')
        .update({ is_primary: false })
        .eq('channel_id', channelId)
        .eq('is_primary', true)
      if (clearErr) throw new ApiError(500, clearErr.message, 'CHANNEL_PERSONA_CLEAR_PRIMARY_ERROR')
    }

    const { data, error } = await sb
      .from('channel_personas')
      .insert({ channel_id: channelId, persona_id: body.personaId, is_primary: body.isPrimary })
      .select()
      .single()
    if (error?.code === '23505') throw new ApiError(409, 'Persona already assigned to this channel', 'CHANNEL_PERSONA_DUPLICATE')
    if (error) throw new ApiError(500, error.message, 'CHANNEL_PERSONA_ASSIGN_ERROR')
    return reply.status(201).send({ data: mapChannelPersonaFromDb(data as DbChannelPersona), error: null })
  })

  // PATCH /:channelId/personas/:personaId — set is_primary
  app.patch('/:channelId/personas/:personaId', async (req, reply) => {
    const { channelId, personaId } = req.params as { channelId: string; personaId: string }
    const body = setPrimaryChannelPersonaSchema.parse(req.body)
    const sb = createServiceClient()

    if (body.isPrimary) {
      const { error: clearErr } = await sb
        .from('channel_personas')
        .update({ is_primary: false })
        .eq('channel_id', channelId)
        .eq('is_primary', true)
      if (clearErr) throw new ApiError(500, clearErr.message, 'CHANNEL_PERSONA_CLEAR_PRIMARY_ERROR')
    }

    const { data, error } = await sb
      .from('channel_personas')
      .update({ is_primary: body.isPrimary })
      .eq('channel_id', channelId)
      .eq('persona_id', personaId)
      .select()
      .single()
    if (error) throw new ApiError(500, error.message, 'CHANNEL_PERSONA_UPDATE_ERROR')
    if (!data) throw new ApiError(404, 'Channel-persona link not found', 'CHANNEL_PERSONA_NOT_FOUND')
    return reply.send({ data: mapChannelPersonaFromDb(data as DbChannelPersona), error: null })
  })

  // DELETE /:channelId/personas/:personaId — remove from channel
  app.delete('/:channelId/personas/:personaId', async (req, reply) => {
    const { channelId, personaId } = req.params as { channelId: string; personaId: string }
    const sb = createServiceClient()
    const { error } = await sb
      .from('channel_personas')
      .delete()
      .eq('channel_id', channelId)
      .eq('persona_id', personaId)
    if (error) throw new ApiError(500, error.message, 'CHANNEL_PERSONA_REMOVE_ERROR')
    return reply.status(204).send()
  })
}
