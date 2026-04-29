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

type SupabaseClient = ReturnType<typeof createServiceClient>

function avatarsDir(): string {
  const __d = path.dirname(fileURLToPath(import.meta.url))
  return path.resolve(__d, '../../public/generated-images/avatars')
}

// ── Shared WP helpers ─────────────────────────────────────────────────────────

async function getWpCreds(sb: SupabaseClient, personaId: string): Promise<{ auth: string; wpBase: string } | { error: string }> {
  const { data: cp, error: cpErr } = await sb
    .from('channel_personas')
    .select('channel_id')
    .eq('persona_id', personaId)
    .limit(1)
    .maybeSingle()
  if (cpErr) return { error: `channel_personas query failed: ${cpErr.message}` }
  if (!cp?.channel_id) return { error: `persona ${personaId} has no channel_personas row` }

  const { decrypt } = await import('../lib/crypto.js')
  const { data: cfg, error: cfgErr } = await sb
    .from('wordpress_configs')
    .select('site_url, username, password')
    .eq('channel_id', cp.channel_id)
    .maybeSingle()
  if (cfgErr) return { error: `wordpress_configs query failed: ${cfgErr.message}` }
  if (!cfg) return { error: `channel ${cp.channel_id} has no wordpress_configs row` }

  const auth = Buffer.from(`${cfg.username}:${decrypt(cfg.password)}`).toString('base64')
  const wpBase = cfg.site_url.replace(/\/$/, '')
  return { auth, wpBase }
}

// Uploads the local avatar file to WP media library and sets it as the user's
// profile picture. Tries both WP User Avatar and Simple Local Avatar meta keys.
// Returns null on success, an error string on any failure.
async function pushAvatarToWp(
  wpBase: string,
  auth: string,
  wpUserId: number,
  avatarUrl: string,
  personaSlug: string,
): Promise<string | null> {
  const relPath = avatarUrl.replace(/^\/generated-images\/avatars\//, '')
  const filepath = path.join(avatarsDir(), relPath)

  if (!fs.existsSync(filepath)) return `Avatar file not found on disk: ${filepath}`

  const imageBuffer = fs.readFileSync(filepath)
  const ext = path.extname(relPath).slice(1).toLowerCase()
  const mimeByExt: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  }
  const mime = mimeByExt[ext] ?? 'image/jpeg'

  const mediaRes = await fetch(`${wpBase}/wp-json/wp/v2/media`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Disposition': `attachment; filename="${personaSlug}-avatar.${ext}"`,
      'Content-Type': mime,
    },
    body: imageBuffer,
    signal: AbortSignal.timeout(30000),
  })
  if (!mediaRes.ok) {
    const eb = await mediaRes.json().catch(() => ({})) as { message?: string }
    return `WP media upload failed (${mediaRes.status}): ${eb.message ?? 'unknown'}`
  }

  const media = (await mediaRes.json()) as { id: number; source_url: string }

  const metaRes = await fetch(`${wpBase}/wp-json/wp/v2/users/${wpUserId}`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      meta: {
        wp_user_avatar: media.id,   // integer — required by WP User Avatar plugin
        simple_local_avatar: { full: media.source_url, '96': media.source_url },
      },
    }),
    signal: AbortSignal.timeout(10000),
  })
  if (!metaRes.ok) {
    const eb = await metaRes.json().catch(() => ({})) as { message?: string }
    return `WP user meta update failed (${metaRes.status}): ${eb.message ?? 'unknown'}`
  }

  return null
}

// ── Route handlers ────────────────────────────────────────────────────────────

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
    const body = z
      .object({
        description: z.string().min(10),
        provider: z.enum(['gemini', 'openai', 'anthropic', 'ollama']).optional(),
        model: z.string().optional(),
      })
      .parse(req.body)
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
        provider: body.provider,
        model: body.model,
        allowFallback: true,
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

  // POST /:id/avatar/upload — save a base64-encoded image as the persona avatar
  app.post('/:id/avatar/upload', async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = z
      .object({
        dataUrl: z.string().regex(/^data:image\/(png|jpeg|jpg|webp|gif);base64,/),
      })
      .parse(req.body)

    const commaIdx = body.dataUrl.indexOf(',')
    const meta = body.dataUrl.slice(0, commaIdx)
    const b64 = body.dataUrl.slice(commaIdx + 1)
    const mime = meta.match(/data:(image\/[\w+]+);base64/)?.[1] ?? 'image/jpeg'
    const extByMime: Record<string, string> = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/webp': 'webp',
      'image/gif': 'gif',
    }
    const ext = extByMime[mime] ?? 'jpg'

    const rawBuffer = Buffer.from(b64, 'base64')
    const { convertToWebP } = await import('../lib/image/webp.js')
    const webpBuffer = await convertToWebP(rawBuffer, 80)
    const finalBuffer = webpBuffer ?? rawBuffer
    const finalExt = webpBuffer ? 'webp' : ext

    const dir = avatarsDir()
    fs.mkdirSync(dir, { recursive: true })
    const filename = `${id}-${Date.now()}.${finalExt}`
    fs.writeFileSync(path.join(dir, filename), finalBuffer)

    const avatarUrl = `/generated-images/avatars/${filename}`
    const sb = createServiceClient()

    // Load persona to check for existing WP author link
    const { data: personaRow } = await sb
      .from('personas')
      .select('id, slug, wp_author_id')
      .eq('id', id)
      .maybeSingle()

    await sb
      .from('personas')
      .update({ avatar_url: avatarUrl, avatar_params_json: {} as unknown as Json })
      .eq('id', id)

    // Best-effort: push avatar to WP if the persona already has a linked author
    let avatarSynced = false
    let avatarSyncError: string | undefined
    const wpAuthorId = (personaRow as { wp_author_id?: number | null } | null)?.wp_author_id
    const personaSlug = (personaRow as { slug?: string } | null)?.slug ?? id
    if (wpAuthorId) {
      try {
        const creds = await getWpCreds(sb, id)
        if ('error' in creds) {
          avatarSyncError = creds.error
        } else {
          const err = await pushAvatarToWp(creds.wpBase, creds.auth, wpAuthorId, avatarUrl, personaSlug)
          if (err) avatarSyncError = err
          else avatarSynced = true
        }
      } catch (e) {
        avatarSyncError = e instanceof Error ? e.message : String(e)
      }
      if (avatarSyncError) {
        req.log.warn({ avatarSyncError, personaId: id }, 'wp avatar sync failed (non-fatal)')
      }
    }

    return reply.send({ data: { avatarUrl, avatarParamsJson: {}, avatarSynced, avatarSyncError }, error: null })
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

    const dir = avatarsDir()
    fs.mkdirSync(dir, { recursive: true })
    const extByMime: Record<string, string> = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/webp': 'webp',
      'image/gif': 'gif',
    }
    const ext = extByMime[generated.mimeType] ?? 'jpg'
    const filename = `${id}-${Date.now()}.${ext}`
    fs.writeFileSync(path.join(dir, filename), Buffer.from(generated.base64, 'base64'))

    const avatarUrl = `/generated-images/avatars/${filename}`
    const avatarParamsJson = { prompt, suggestions: body.suggestions, channelId: body.channelId }

    await sb
      .from('personas')
      .update({ avatar_url: avatarUrl, avatar_params_json: avatarParamsJson as unknown as Json })
      .eq('id', id)

    // Best-effort: push new avatar to WP if the persona already has a linked author
    let avatarSynced = false
    let avatarSyncError: string | undefined
    if (persona.wpAuthorId) {
      try {
        const creds = await getWpCreds(sb, id)
        if ('error' in creds) {
          avatarSyncError = creds.error
        } else {
          const err = await pushAvatarToWp(creds.wpBase, creds.auth, persona.wpAuthorId, avatarUrl, persona.slug)
          if (err) avatarSyncError = err
          else avatarSynced = true
        }
      } catch (e) {
        avatarSyncError = e instanceof Error ? e.message : String(e)
      }
      if (avatarSyncError) {
        req.log.warn({ avatarSyncError, personaId: id }, 'wp avatar sync failed (non-fatal)')
      }
    }

    return reply.send({ data: { avatarUrl, avatarParamsJson, avatarSynced, avatarSyncError }, error: null })
  })

  // POST /:id/integrations/wordpress — link or create WP author
  app.post('/:id/integrations/wordpress', async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = z
      .object({
        action: z.enum(['link', 'create']),
        wpUsername: z.string().optional(),
        channelId: z.string().uuid(),
      })
      .parse(req.body)

    const sb = createServiceClient()

    const { data: personaRow } = await sb.from('personas').select('*').eq('id', id).maybeSingle()
    if (!personaRow) throw new ApiError(404, 'Persona not found', 'PERSONA_NOT_FOUND')
    const persona = mapPersonaFromDb(personaRow as DbPersona)

    // Verify channel belongs to requester's org
    const { data: orgMembership } = await sb
      .from('org_memberships')
      .select('org_id')
      .eq('user_id', req.userId!)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (!orgMembership) throw new ApiError(403, 'No organization found', 'UNAUTHORIZED')

    const { data: channelCheck } = await sb
      .from('channels')
      .select('id')
      .eq('id', body.channelId)
      .eq('org_id', orgMembership.org_id)
      .maybeSingle()
    if (!channelCheck) throw new ApiError(404, 'Channel not found', 'CHANNEL_NOT_FOUND')

    const { decrypt } = await import('../lib/crypto.js')
    const { data: wpConfig } = await sb
      .from('wordpress_configs')
      .select('site_url, username, password')
      .eq('channel_id', body.channelId)
      .maybeSingle()
    if (!wpConfig) throw new ApiError(400, 'Channel has no WordPress config', 'NO_WP_CONFIG')

    const auth = Buffer.from(`${wpConfig.username}:${decrypt(wpConfig.password)}`).toString('base64')
    const wpBase = wpConfig.site_url.replace(/\/$/, '')

    let wpUserId: number

    if (body.action === 'link') {
      if (!body.wpUsername) throw new ApiError(400, 'wpUsername required for link action', 'VALIDATION_ERROR')
      const res = await fetch(`${wpBase}/wp-json/wp/v2/users?search=${encodeURIComponent(body.wpUsername)}`, {
        headers: { Authorization: `Basic ${auth}` },
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) throw new ApiError(502, 'Failed to search WordPress users', 'WP_FETCH_ERROR')
      const users = (await res.json()) as Array<{ id: number; slug: string; name: string }>
      if (!users.length) throw new ApiError(404, `No WordPress user found for "${body.wpUsername}"`, 'WP_USER_NOT_FOUND')
      wpUserId = users[0].id
    } else {
      const wpUsername = persona.slug
      const wpEmail = `${persona.slug}@persona.brighttale.io`
      const wpPassword = crypto.randomUUID()
      const res = await fetch(`${wpBase}/wp-json/wp/v2/users`, {
        method: 'POST',
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: wpUsername,
          email: wpEmail,
          password: wpPassword,
          name: persona.name,
          description: persona.bioShort || persona.bioLong || '',
          roles: ['author'],
        }),
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new ApiError(502, (errBody as { message?: string })?.message ?? 'Failed to create WordPress user', 'WP_CREATE_ERROR')
      }
      const created = (await res.json()) as { id: number }
      wpUserId = created.id
    }

    // Best-effort: push avatar to WP media and set as profile picture
    let avatarSynced = false
    let avatarSyncError: string | undefined
    if (persona.avatarUrl) {
      try {
        const err = await pushAvatarToWp(wpBase, auth, wpUserId, persona.avatarUrl, persona.slug)
        if (err) avatarSyncError = err
        else avatarSynced = true
      } catch (e) {
        avatarSyncError = e instanceof Error ? e.message : String(e)
      }
      if (avatarSyncError) {
        req.log.warn({ avatarSyncError, personaId: id, wpUserId }, 'wp avatar sync failed (non-fatal)')
      }
    }

    const { data: updated, error: upErr } = await sb
      .from('personas')
      .update({ wp_author_id: wpUserId })
      .eq('id', id)
      .select()
      .single()
    if (upErr) throw new ApiError(500, upErr.message, 'PERSONA_UPDATE_ERROR')

    // Ensure persona ↔ channel association exists so future WP syncs (PUT /:id) can resolve creds
    const { error: cpErr } = await sb
      .from('channel_personas')
      .upsert({ channel_id: body.channelId, persona_id: id }, { onConflict: 'channel_id,persona_id' })
    if (cpErr) {
      req.log.warn({ cpErr, personaId: id, channelId: body.channelId }, 'channel_personas upsert failed')
    }

    return reply.send({ data: { wpAuthorId: wpUserId, persona: mapPersonaFromDb(updated as DbPersona), avatarSynced, avatarSyncError }, error: null })
  })

  // DELETE /:id/integrations/wordpress — unlink WP author from persona
  app.delete('/:id/integrations/wordpress', async (req, reply) => {
    const { id } = req.params as { id: string }
    const sb = createServiceClient()
    const { data, error } = await sb
      .from('personas')
      .update({ wp_author_id: null })
      .eq('id', id)
      .select()
      .single()
    if (error) throw new ApiError(500, error.message, 'PERSONA_UPDATE_ERROR')
    return reply.send({ data: { persona: mapPersonaFromDb(data as DbPersona) }, error: null })
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

    const persona = mapPersonaFromDb(data as DbPersona)

    // Best-effort: sync updated profile fields to WordPress
    if (!persona.wpAuthorId) {
      return reply.send({ data: persona, error: null })
    }

    let wpSynced = false
    let wpSyncError: string | undefined
    try {
      const creds = await getWpCreds(sb, id)
      if ('error' in creds) {
        wpSyncError = creds.error
      } else {
        const updateRes = await fetch(`${creds.wpBase}/wp-json/wp/v2/users/${persona.wpAuthorId}`, {
          method: 'POST',
          headers: { Authorization: `Basic ${creds.auth}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: persona.name,
            description: persona.bioShort || persona.bioLong || '',
          }),
          signal: AbortSignal.timeout(10000),
        })
        if (!updateRes.ok) {
          const eb = await updateRes.json().catch(() => ({})) as { message?: string }
          wpSyncError = `WP user update failed (${updateRes.status}): ${eb.message ?? 'unknown'}`
        } else if (body.avatarUrl !== undefined && persona.avatarUrl) {
          // Avatar changed in this update — push it to WP too
          const avatarErr = await pushAvatarToWp(creds.wpBase, creds.auth, persona.wpAuthorId, persona.avatarUrl, persona.slug)
          if (avatarErr) wpSyncError = avatarErr
          else wpSynced = true
        } else {
          wpSynced = true
        }
      }
    } catch (e) {
      wpSyncError = e instanceof Error ? e.message : String(e)
    }
    if (wpSyncError) {
      req.log.warn({ wpSyncError, personaId: id }, 'wp sync failed (non-fatal)')
    }

    return reply.send({ data: { ...persona, wpSync: { synced: wpSynced, error: wpSyncError } }, error: null })
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
