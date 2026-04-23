import type { FastifyInstance } from 'fastify'
import type { DbPersona, DbPersonaArchetype } from '@brighttale/shared/mappers/db'
import type { Json } from '@brighttale/shared/types/database'
import { z } from 'zod'
import { authenticate } from '../middleware/authenticate.js'
import { createServiceClient } from '../lib/supabase/index.js'
import { ApiError } from '../lib/api/errors.js'
import { mapPersonaFromDb, mapPersonaToDb, mapPersonaArchetypePublic } from '@brighttale/shared/mappers/db'
import {
  createPersonaSchema,
  updatePersonaSchema,
  togglePersonaSchema,
} from '@brighttale/shared/schemas/personas'
import { buildAvatarPrompt, type AvatarSuggestions } from '../lib/ai/avatarPrompt.js'
import { getImageProvider } from '../lib/ai/imageIndex.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

export async function personasRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // Public archetype list — behavioral_overlay_json excluded
  app.get('/archetypes', async (_req, reply) => {
    const sb = createServiceClient()
    const { data, error } = await sb
      .from('persona_archetypes')
      .select('id, slug, name, description, icon, default_fields_json, sort_order, is_active, created_at, updated_at')
      .eq('is_active', true)
      .order('sort_order')
    if (error) throw new ApiError(500, error.message, 'ARCHETYPES_FETCH_ERROR')
    return reply.send({ data: (data ?? []).map(r => mapPersonaArchetypePublic(r as DbPersonaArchetype)), error: null })
  })

  // Public archetype by slug — behavioral_overlay_json excluded
  app.get('/archetypes/:slug', async (req, reply) => {
    const { slug } = req.params as { slug: string }
    const sb = createServiceClient()
    const { data, error } = await sb
      .from('persona_archetypes')
      .select('id, slug, name, description, icon, default_fields_json, sort_order, is_active, created_at, updated_at')
      .eq('slug', slug)
      .eq('is_active', true)
      .maybeSingle()
    if (error) throw new ApiError(500, error.message, 'ARCHETYPE_FETCH_ERROR')
    if (!data) throw new ApiError(404, 'Archetype not found', 'ARCHETYPE_NOT_FOUND')
    return reply.send({ data: mapPersonaArchetypePublic(data as DbPersonaArchetype), error: null })
  })

  // AI-assisted mode: free text → structured persona fields
  app.post('/extract', async (req, reply) => {
    const body = z.object({ description: z.string().min(10) }).parse(req.body)
    const sb = createServiceClient()

    const { data: promptRow } = await sb
      .from('agent_prompts')
      .select('instructions')
      .eq('slug', 'persona-extractor')
      .maybeSingle()

    const systemPrompt = promptRow?.instructions ?? `You are a persona field extractor. Given a free-text persona description, extract and return a JSON object with these fields:
{
  "name": "string",
  "bioShort": "string (1-2 sentences)",
  "bioLong": "string (3-5 sentences)",
  "primaryDomain": "string",
  "domainLens": "string (unique analytical perspective)",
  "approvedCategories": ["string"],
  "writingVoiceJson": {
    "writingStyle": "string",
    "signaturePhrases": ["string"],
    "characteristicOpinions": ["string"]
  },
  "eeatSignalsJson": {
    "analyticalLens": "string",
    "trustSignals": ["string"],
    "expertiseClaims": ["string"]
  },
  "soulJson": {
    "values": ["string"],
    "lifePhilosophy": "string",
    "strongOpinions": ["string"],
    "petPeeves": ["string"],
    "humorStyle": "string",
    "recurringJokes": [],
    "whatExcites": ["string"],
    "innerTensions": [],
    "languageGuardrails": []
  }
}
Return ONLY valid JSON, no explanation.`

    const { generateWithFallback } = await import('../lib/ai/router.js')
    const call = await generateWithFallback(
      'brainstorm',
      'standard',
      { agentType: 'brainstorm', systemPrompt, userMessage: body.description },
      {
        logContext: {
          userId: req.userId ?? '',
          orgId: undefined,
          channelId: undefined,
          sessionId: undefined,
          sessionType: 'persona-extract',
        },
      },
    )

    const raw = call.result
    const text = (typeof raw === 'string' ? raw : (raw as { content?: string })?.content ?? '').trim()
    if (!text) {
      throw new ApiError(500, 'AI extraction returned empty response', 'EXTRACT_EMPTY_RESPONSE')
    }
    let fields: unknown
    try {
      fields = JSON.parse(text)
    } catch {
      throw new ApiError(500, 'Failed to parse AI extraction response', 'EXTRACT_PARSE_ERROR')
    }
    if (typeof fields !== 'object' || fields === null || Array.isArray(fields)) {
      throw new ApiError(500, 'AI extraction returned unexpected shape', 'EXTRACT_INVALID_SHAPE')
    }

    return reply.send({ data: fields as Record<string, unknown>, error: null })
  })

  // POST /:id/avatar/generate — generate avatar using image provider
  app.post('/:id/avatar/generate', async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = z
      .object({
        suggestions: z
          .object({
            background: z.string().optional(),
            artStyle: z.string().optional(),
            faceMood: z.string().optional(),
            faceAppearance: z.string().optional(),
            noFaceElement: z.string().optional(),
          })
          .default({}),
        channelId: z.string().uuid().optional(),
      })
      .parse(req.body)

    const sb = createServiceClient()

    const { data: personaRow, error: pErr } = await sb
      .from('personas')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (pErr || !personaRow) throw new ApiError(404, 'Persona not found', 'PERSONA_NOT_FOUND')
    const persona = mapPersonaFromDb(personaRow as DbPersona)

    let channelNiche: string | undefined
    let channelTone: string | undefined
    if (body.channelId) {
      const { data: ch } = await sb
        .from('channels')
        .select('niche, tone')
        .eq('id', body.channelId)
        .maybeSingle()
      channelNiche = ch?.niche ?? undefined
      channelTone = ch?.tone ?? undefined
    }

    const { data: agentRow } = await sb
      .from('agent_prompts')
      .select('instructions')
      .eq('slug', 'persona-avatar-generator')
      .maybeSingle()

    const prompt = buildAvatarPrompt({
      personaName: persona.name,
      primaryDomain: persona.primaryDomain,
      domainLens: persona.domainLens,
      channelNiche,
      channelTone,
      suggestions: body.suggestions as AvatarSuggestions,
      agentInstruction: agentRow?.instructions ?? undefined,
    })

    const provider = await getImageProvider()
    const [generated] = await provider.generateImages({ prompt, numImages: 1, aspectRatio: '1:1' })
    if (!generated) throw new ApiError(500, 'Image provider returned no result', 'IMAGE_PROVIDER_EMPTY')

    const __modDirname = path.dirname(fileURLToPath(import.meta.url))
    const avatarsDir = path.resolve(__modDirname, '../../public/generated-images/avatars')
    fs.mkdirSync(avatarsDir, { recursive: true })
    const filename = `${id}-${Date.now()}.${generated.mimeType === 'image/png' ? 'png' : 'jpg'}`
    const filepath = path.join(avatarsDir, filename)
    fs.writeFileSync(filepath, Buffer.from(generated.base64, 'base64'))

    const avatarUrl = `/generated-images/avatars/${filename}`
    const avatarParamsJson = { prompt, suggestions: body.suggestions, channelId: body.channelId }

    return reply.send({ data: { avatarUrl, avatarParamsJson }, error: null })
  })

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
        archetype_slug: body.archetypeSlug ?? null,
        avatar_params_json: (body.avatarParamsJson ?? null) as unknown as Json,
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
      .update(dbInput)
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
