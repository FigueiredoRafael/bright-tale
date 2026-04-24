# Persona System — Plan 3: User Persona Builder

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the user-facing persona creation experience (4 modes, shared form, channel assignment, avatar generation, WordPress author linking) and wire persona attribution into the publish flow.

**Architecture:** New user-facing API endpoints extend the existing `personas.ts` route file and a new `channel-personas.ts` route. A `persona-avatar-generator` entry is seeded into `agent_prompts`. The persona builder UI uses Next.js App Router under `[locale]/(app)/personas/`. WordPress author linking calls WP REST API using integration account credentials from `wordpress_configs`. Publish attribution sets `author` field in `buildWpPostData` using `persona.wpAuthorId`.

**Tech Stack:** Fastify, TypeScript, Zod, Supabase, Next.js App Router, shadcn/ui, Tailwind CSS 4, WP REST API

**Prerequisites:** Plan 1 (Foundation) complete — new DB tables, types, schemas must exist.

---

## Spec reference

`docs/superpowers/specs/2026-04-23-persona-system-redesign.md` — User Experience, Avatar, WordPress Integration, API Routes sections

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Modify | `apps/api/src/routes/personas.ts` | Add: archetypes list, AI extract, avatar generate, WP link endpoints |
| Create | `apps/api/src/routes/channel-personas.ts` | Channel ↔ persona assignment CRUD |
| Modify | `apps/api/src/index.ts` | Register `channelPersonasRoutes` |
| Create | `apps/api/src/lib/ai/avatarPrompt.ts` | Avatar prompt builder (persona + suggestions → image prompt) |
| Modify | `apps/api/src/routes/wordpress.ts` | Export `getWpConfig` helper (reused in persona WP link) |
| Modify | `apps/api/src/lib/personas.ts` | Export `loadAgentPrompt` alias or use existing pattern |
| Create | `apps/api/src/routes/__tests__/channel-personas.test.ts` | Route unit tests |
| Create | `apps/app/src/app/[locale]/(app)/personas/page.tsx` | Persona Manager (list + create button) |
| Create | `apps/app/src/app/[locale]/(app)/personas/new/page.tsx` | Creation mode picker |
| Create | `apps/app/src/app/[locale]/(app)/personas/new/wizard/page.tsx` | Guided wizard flow |
| Create | `apps/app/src/app/[locale]/(app)/personas/new/ai/page.tsx` | AI generation flow |
| Create | `apps/app/src/app/[locale]/(app)/personas/[id]/edit/page.tsx` | Edit existing persona |
| Create | `apps/app/src/components/personas/PersonaForm.tsx` | Shared 7-section form (shared destination for all modes) |
| Create | `apps/app/src/components/personas/AvatarSection.tsx` | Upload vs AI generate section |
| Create | `apps/app/src/components/personas/WpIntegrationSection.tsx` | WordPress author link/create |
| Create | `apps/app/src/components/personas/PersonaCard.tsx` | Card used in manager list |

---

## Task 1: User-facing archetypes endpoint + AI extract endpoint

Add two new endpoints to the existing `personas.ts` route (user-facing, no admin role required).

**Files:**
- Modify: `apps/api/src/routes/personas.ts`

- [ ] **Step 1: Add `GET /archetypes` and `GET /archetypes/:slug`**

In `apps/api/src/routes/personas.ts`, add at the top of the import block:

```typescript
import {
  mapPersonaArchetypePublic,
  type DbPersonaArchetype,
} from '@brighttale/shared/mappers/db'
```

Then add inside `personasRoutes`, before the existing `app.get('/')`:

```typescript
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
```

- [ ] **Step 2: Add `POST /extract` — AI-assisted persona field extraction**

Add after the archetypes routes:

```typescript
  // AI-assisted mode: free text → structured persona fields
  app.post('/extract', async (req, reply) => {
    const body = z.object({ description: z.string().min(10) }).parse(req.body)
    const sb = createServiceClient()

    // Load extraction prompt from agent_prompts
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

    const { generateWithFallback } = await import('../lib/ai/index.js')
    const result = await generateWithFallback(
      'production',
      'standard',
      { agentType: 'production', systemPrompt, userMessage: body.description },
      { provider: undefined, model: undefined, logContext: { userId: req.userId, orgId: undefined, projectId: undefined, channelId: undefined, sessionId: undefined, sessionType: 'persona-extract' } }
    )

    let fields: Record<string, unknown> = {}
    try {
      const text = typeof result === 'string' ? result : (result as any)?.content ?? ''
      fields = JSON.parse(text)
    } catch {
      throw new ApiError(500, 'Failed to parse AI extraction response', 'EXTRACT_PARSE_ERROR')
    }

    return reply.send({ data: fields, error: null })
  })
```

- [ ] **Step 3: Update `POST /` to include new fields**

In the existing `app.post('/')` handler, update the `insert` call to include new fields:

```typescript
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
        archetype_slug: body.archetypeSlug ?? null,      // ← add
        avatar_params_json: body.avatarParamsJson ?? null, // ← add
      })
```

- [ ] **Step 4: Verify typecheck**

```bash
npm run typecheck --workspace=apps/api
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/personas.ts
git commit -m "feat(api): add archetypes list, AI extract endpoint to personas routes"
```

---

## Task 2: Avatar generation endpoint

**Files:**
- Create: `apps/api/src/lib/ai/avatarPrompt.ts`
- Modify: `apps/api/src/routes/personas.ts`

- [ ] **Step 1: Create avatar prompt builder**

Create `apps/api/src/lib/ai/avatarPrompt.ts`:

```typescript
export interface AvatarSuggestions {
  background?: string
  artStyle?: string
  faceMood?: string
  faceAppearance?: string
  noFaceElement?: string
}

/**
 * Builds a refined image generation prompt from persona data + user suggestions.
 * Called server-side; users see only the suggestion fields, not this function.
 */
export function buildAvatarPrompt(params: {
  personaName: string
  primaryDomain: string
  domainLens: string
  channelNiche?: string
  channelTone?: string
  suggestions: AvatarSuggestions
  agentInstruction?: string
}): string {
  const { personaName, primaryDomain, domainLens, channelNiche, channelTone, suggestions, agentInstruction } = params

  const nicheContext = channelNiche
    ? `Niche: ${channelNiche}.`
    : `Domain: ${primaryDomain} — ${domainLens}.`

  const toneHint = channelTone ? ` Visual tone should feel ${channelTone}.` : ''

  const faceDescription = suggestions.noFaceElement
    ? `No human face. Use instead: ${suggestions.noFaceElement}.`
    : [
        suggestions.faceMood ? `Expression: ${suggestions.faceMood}.` : '',
        suggestions.faceAppearance ? `Appearance: ${suggestions.faceAppearance}.` : '',
      ].filter(Boolean).join(' ')

  const styleBlock = [
    suggestions.artStyle ? `Art style: ${suggestions.artStyle}.` : 'Art style: professional illustrated portrait.',
    suggestions.background ? `Background: ${suggestions.background}.` : '',
  ].filter(Boolean).join(' ')

  const base = agentInstruction
    ? `${agentInstruction}\n\nPersona: ${personaName}. ${nicheContext}${toneHint} ${styleBlock} ${faceDescription}`
    : `Professional avatar for ${personaName}, a ${primaryDomain} expert. ${nicheContext}${toneHint} ${styleBlock} ${faceDescription}`

  return base.trim()
}
```

- [ ] **Step 2: Add `POST /:id/avatar/generate` endpoint**

In `apps/api/src/routes/personas.ts`, add at the top:

```typescript
import { buildAvatarPrompt, type AvatarSuggestions } from '../lib/ai/avatarPrompt.js'
import { getImageProvider } from '../lib/ai/imageIndex.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
```

Then add inside `personasRoutes`:

```typescript
  // POST /:id/avatar/generate — generate avatar using image provider
  app.post('/:id/avatar/generate', async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = z.object({
      suggestions: z.object({
        background: z.string().optional(),
        artStyle: z.string().optional(),
        faceMood: z.string().optional(),
        faceAppearance: z.string().optional(),
        noFaceElement: z.string().optional(),
      }).default({}),
      channelId: z.string().uuid().optional(),
    }).parse(req.body)

    const sb = createServiceClient()

    // Load persona
    const { data: personaRow, error: pErr } = await sb
      .from('personas')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (pErr || !personaRow) throw new ApiError(404, 'Persona not found', 'PERSONA_NOT_FOUND')
    const persona = mapPersonaFromDb(personaRow as DbPersona)

    // Optional channel context
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

    // Load avatar agent instruction from agent_prompts (optional)
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

    // Generate image
    const provider = await getImageProvider()
    const [generated] = await provider.generateImages({ prompt, numImages: 1, aspectRatio: '1:1' })

    // Save to public/generated-images/avatars/
    const __dirname = path.dirname(fileURLToPath(import.meta.url))
    const avatarsDir = path.resolve(__dirname, '../../public/generated-images/avatars')
    fs.mkdirSync(avatarsDir, { recursive: true })
    const filename = `${id}-${Date.now()}.${generated.mimeType === 'image/png' ? 'png' : 'jpg'}`
    const filepath = path.join(avatarsDir, filename)
    fs.writeFileSync(filepath, Buffer.from(generated.base64, 'base64'))

    const avatarUrl = `/generated-images/avatars/${filename}`
    const avatarParamsJson = { prompt, suggestions: body.suggestions, channelId: body.channelId }

    return reply.send({ data: { avatarUrl, avatarParamsJson }, error: null })
  })
```

- [ ] **Step 3: Verify typecheck**

```bash
npm run typecheck --workspace=apps/api
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/lib/ai/avatarPrompt.ts apps/api/src/routes/personas.ts
git commit -m "feat(api): avatar generation endpoint + prompt builder"
```

---

## Task 3: WordPress author link/create endpoint

**Files:**
- Modify: `apps/api/src/routes/personas.ts`

- [ ] **Step 1: Add `POST /:id/integrations/wordpress` endpoint**

Add inside `personasRoutes`:

```typescript
  // POST /:id/integrations/wordpress — link or create WP author
  app.post('/:id/integrations/wordpress', async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = z.object({
      action: z.enum(['link', 'create']),
      wpUsername: z.string().optional(),  // required for 'link'
      channelId: z.string().uuid(),       // to get wordpress_config
    }).parse(req.body)

    const sb = createServiceClient()

    // Load persona
    const { data: personaRow } = await sb.from('personas').select('*').eq('id', id).maybeSingle()
    if (!personaRow) throw new ApiError(404, 'Persona not found', 'PERSONA_NOT_FOUND')
    const persona = mapPersonaFromDb(personaRow as DbPersona)

    // Load WP config via channel
    const { data: channel } = await sb
      .from('channels')
      .select('wordpress_config_id')
      .eq('id', body.channelId)
      .maybeSingle()
    if (!channel?.wordpress_config_id) throw new ApiError(400, 'Channel has no WordPress config', 'NO_WP_CONFIG')

    const { decrypt } = await import('../lib/crypto.js')
    const { data: wpConfig } = await sb
      .from('wordpress_configs')
      .select('site_url, username, password')
      .eq('id', channel.wordpress_config_id)
      .maybeSingle()
    if (!wpConfig) throw new ApiError(404, 'WordPress config not found', 'WP_CONFIG_NOT_FOUND')

    const auth = Buffer.from(`${wpConfig.username}:${decrypt(wpConfig.password)}`).toString('base64')
    const wpBase = wpConfig.site_url.replace(/\/$/, '')

    let wpUserId: number

    if (body.action === 'link') {
      if (!body.wpUsername) throw new ApiError(400, 'wpUsername required for link action', 'VALIDATION_ERROR')
      const res = await fetch(`${wpBase}/wp-json/wp/v2/users?search=${encodeURIComponent(body.wpUsername)}`, {
        headers: { Authorization: `Basic ${auth}` },
      })
      if (!res.ok) throw new ApiError(502, 'Failed to search WordPress users', 'WP_FETCH_ERROR')
      const users: Array<{ id: number; slug: string; name: string }> = await res.json()
      if (!users.length) throw new ApiError(404, `No WordPress user found for "${body.wpUsername}"`, 'WP_USER_NOT_FOUND')
      wpUserId = users[0].id
    } else {
      // Create new WP user for this persona
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
          roles: ['author'],
        }),
      })
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new ApiError(502, (errBody as any)?.message ?? 'Failed to create WordPress user', 'WP_CREATE_ERROR')
      }
      const created: { id: number } = await res.json()
      wpUserId = created.id
    }

    // Persist wp_author_id
    const { data: updated, error: upErr } = await sb
      .from('personas')
      .update({ wp_author_id: wpUserId })
      .eq('id', id)
      .select()
      .single()
    if (upErr) throw new ApiError(500, upErr.message, 'PERSONA_UPDATE_ERROR')

    return reply.send({ data: { wpAuthorId: wpUserId, persona: mapPersonaFromDb(updated as DbPersona) }, error: null })
  })
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck --workspace=apps/api
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/personas.ts
git commit -m "feat(api): WordPress author link/create endpoint for personas"
```

---

## Task 4: Channel-personas route

**Files:**
- Create: `apps/api/src/routes/channel-personas.ts`
- Create: `apps/api/src/routes/__tests__/channel-personas.test.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Write failing test**

Create `apps/api/src/routes/__tests__/channel-personas.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'

describe('channel personas route', () => {
  it('exports channelPersonasRoutes function', async () => {
    const mod = await import('../channel-personas.js')
    expect(typeof mod.channelPersonasRoutes).toBe('function')
  })
})
```

- [ ] **Step 2: Run test to verify fail**

```bash
npx vitest run apps/api/src/routes/__tests__/channel-personas.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Create route file**

Create `apps/api/src/routes/channel-personas.ts`:

```typescript
import type { FastifyInstance } from 'fastify'
import { authenticate } from '../middleware/authenticate.js'
import { createServiceClient } from '../lib/supabase/index.js'
import { ApiError } from '../lib/api/errors.js'
import { mapChannelPersonaFromDb, mapPersonaFromDb, type DbChannelPersona, type DbPersona } from '@brighttale/shared/mappers/db'
import { assignChannelPersonaSchema, setPrimaryChannelPersonaSchema } from '@brighttale/shared/schemas/channel-personas'

export async function channelPersonasRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // GET /channels/:channelId/personas — list personas for a channel
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
        persona: mapPersonaFromDb((row as any).personas as DbPersona),
      })),
      error: null,
    })
  })

  // POST /channels/:channelId/personas — assign persona to channel
  app.post('/:channelId/personas', async (req, reply) => {
    const { channelId } = req.params as { channelId: string }
    const body = assignChannelPersonaSchema.parse(req.body)
    const sb = createServiceClient()

    // If setting as primary, clear existing primary first
    if (body.isPrimary) {
      await sb
        .from('channel_personas')
        .update({ is_primary: false })
        .eq('channel_id', channelId)
        .eq('is_primary', true)
    }

    const { data, error } = await sb
      .from('channel_personas')
      .insert({ channel_id: channelId, persona_id: body.personaId, is_primary: body.isPrimary })
      .select()
      .single()
    if (error?.code === '23505') throw new ApiError(409, 'Persona already assigned to this channel', 'CONFLICT')
    if (error) throw new ApiError(500, error.message, 'CHANNEL_PERSONA_ASSIGN_ERROR')
    return reply.status(201).send({ data: mapChannelPersonaFromDb(data as DbChannelPersona), error: null })
  })

  // PATCH /channels/:channelId/personas/:personaId — set is_primary
  app.patch('/:channelId/personas/:personaId', async (req, reply) => {
    const { channelId, personaId } = req.params as { channelId: string; personaId: string }
    const body = setPrimaryChannelPersonaSchema.parse(req.body)
    const sb = createServiceClient()

    if (body.isPrimary) {
      await sb
        .from('channel_personas')
        .update({ is_primary: false })
        .eq('channel_id', channelId)
        .eq('is_primary', true)
    }

    const { data, error } = await sb
      .from('channel_personas')
      .update({ is_primary: body.isPrimary })
      .eq('channel_id', channelId)
      .eq('persona_id', personaId)
      .select()
      .single()
    if (error) throw new ApiError(500, error.message, 'CHANNEL_PERSONA_UPDATE_ERROR')
    if (!data) throw new ApiError(404, 'Channel-persona link not found', 'NOT_FOUND')
    return reply.send({ data: mapChannelPersonaFromDb(data as DbChannelPersona), error: null })
  })

  // DELETE /channels/:channelId/personas/:personaId — remove from channel
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
```

- [ ] **Step 4: Run test to verify pass**

```bash
npx vitest run apps/api/src/routes/__tests__/channel-personas.test.ts
```

Expected: PASS

- [ ] **Step 5: Register in index.ts**

In `apps/api/src/index.ts`, add import after `personasRoutes`:

```typescript
import { channelPersonasRoutes } from "./routes/channel-personas.js";
```

Add registration after `server.register(personasRoutes, ...)`:

```typescript
server.register(channelPersonasRoutes, { prefix: "/channels" });
```

- [ ] **Step 6: Verify typecheck**

```bash
npm run typecheck --workspace=apps/api
```

Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/channel-personas.ts \
        apps/api/src/routes/__tests__/channel-personas.test.ts \
        apps/api/src/index.ts
git commit -m "feat(api): channel-personas CRUD routes + register"
```

---

## Task 5: Seed persona-avatar-generator agent prompt

**Files:**
- Modify: `supabase/seed.sql` (or run directly via Supabase)

- [ ] **Step 1: Insert agent prompt row**

Run in Supabase SQL editor or add to `scripts/generate-seed.ts`:

```sql
INSERT INTO agent_prompts (id, name, slug, stage, instructions, input_schema, output_schema)
VALUES (
  gen_random_uuid(),
  'Persona Avatar Generator',
  'persona-avatar-generator',
  'persona',
  'You are an expert image prompt engineer for persona avatars. Your job is to transform persona identity information into a high-quality, provider-optimized image generation prompt.

Rules:
- Avatar style must feel coherent with the persona niche. A finance analyst looks different from a fitness coach even with the same art style.
- If no face is requested, lean into symbolic/abstract representation of the domain.
- Always produce a single, detailed, comma-separated prompt string ready for direct submission to an image generation API.
- Do not include any explanation or preamble. Output only the prompt string.',
  '{"personaName": "string", "primaryDomain": "string", "domainLens": "string", "suggestions": "object"}',
  '{"prompt": "string"}'
)
ON CONFLICT (slug) DO NOTHING;
```

- [ ] **Step 2: Verify row exists**

```bash
npm run dev:api
```

Then:

```bash
curl -s http://localhost:3001/agents/persona-avatar-generator \
  -H "x-internal-key: $INTERNAL_API_KEY" | jq .data.agent.slug
```

Expected: `"persona-avatar-generator"`

- [ ] **Step 3: Commit**

```bash
git add supabase/seed.sql
git commit -m "feat(db): seed persona-avatar-generator agent prompt"
```

---

## Task 6: WordPress publish attribution

Wire `persona.wpAuthorId` into the existing WP publish flow.

**Files:**
- Modify: `apps/api/src/routes/wordpress.ts`

- [ ] **Step 1: Locate publish handler**

In `apps/api/src/routes/wordpress.ts`, find where `buildWpPostData` is called (search for `buildWpPostData(`). It already accepts `authorId?: number | null`.

Find the section that loads the draft before publishing and add persona loading:

```typescript
// After loading draft, load persona if linked:
const { loadPersonaForDraft } = await import('../lib/personas.js')
const persona = await loadPersonaForDraft(draft as Record<string, unknown>, sb)
```

Then pass `authorId` to `buildWpPostData`:

```typescript
const postData = buildWpPostData({
  title: draft.title,
  content: htmlContent,
  excerpt: excerpt,
  status: publishStatus,
  date: scheduledDate,
  categories: wpCategoryIds,
  tags: wpTagIds,
  featuredMedia: mediaId,
  authorId: persona?.wpAuthorId ?? null,   // ← add
})
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck --workspace=apps/api
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/wordpress.ts
git commit -m "feat(api): wire persona wp_author_id into WordPress publish flow"
```

---

## Task 7: Persona Manager page + PersonaCard component

**Files:**
- Create: `apps/app/src/components/personas/PersonaCard.tsx`
- Create: `apps/app/src/app/[locale]/(app)/personas/page.tsx`

- [ ] **Step 1: Create PersonaCard**

Create `apps/app/src/components/personas/PersonaCard.tsx`:

```tsx
'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Pencil, Globe } from 'lucide-react'

interface PersonaCardProps {
  id: string
  name: string
  avatarUrl: string | null
  bioShort: string
  primaryDomain: string
  isActive: boolean
}

export function PersonaCard({ id, name, avatarUrl, bioShort, primaryDomain, isActive }: PersonaCardProps) {
  const params = useParams()
  const locale = params.locale as string

  return (
    <Card className={`transition-opacity ${!isActive ? 'opacity-50' : ''}`}>
      <CardContent className="flex items-start gap-4 p-4">
        <Avatar className="h-14 w-14 rounded-lg shrink-0">
          <AvatarImage src={avatarUrl ?? undefined} alt={name} />
          <AvatarFallback className="rounded-lg text-lg font-semibold">
            {name.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="font-semibold text-sm truncate">{name}</p>
            {!isActive && <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}
          </div>
          <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{bioShort}</p>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Globe className="h-3 w-3" />
            {primaryDomain}
          </div>
        </div>
        <Button size="sm" variant="ghost" asChild>
          <Link href={`/${locale}/personas/${id}/edit`}>
            <Pencil className="h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Create Persona Manager page**

Create `apps/app/src/app/[locale]/(app)/personas/page.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Loader2, Plus } from 'lucide-react'
import { PersonaCard } from '@/components/personas/PersonaCard'

interface Persona {
  id: string
  name: string
  avatarUrl: string | null
  bioShort: string
  primaryDomain: string
  isActive: boolean
}

export default function PersonasPage() {
  const [personas, setPersonas] = useState<Persona[]>([])
  const [loading, setLoading] = useState(true)
  const params = useParams()
  const locale = params.locale as string

  useEffect(() => {
    fetch('/api/personas')
      .then(r => r.json())
      .then(({ data }) => setPersonas(data ?? []))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Personas</h1>
          <p className="text-sm text-muted-foreground mt-1">Your team of writing personas, assignable to any channel.</p>
        </div>
        <Button asChild>
          <Link href={`/${locale}/personas/new`}>
            <Plus className="h-4 w-4 mr-1" /> New Persona
          </Link>
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : personas.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground">
          No personas yet. Create one to give your content a distinct voice.
        </div>
      ) : (
        <div className="grid gap-3">
          {personas.map(p => <PersonaCard key={p.id} {...p} />)}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/app/src/components/personas/PersonaCard.tsx \
        "apps/app/src/app/[locale]/(app)/personas/page.tsx"
git commit -m "feat(app): persona manager page + PersonaCard component"
```

---

## Task 8: Creation mode picker

**Files:**
- Create: `apps/app/src/app/[locale]/(app)/personas/new/page.tsx`

- [ ] **Step 1: Create mode picker page**

Create `apps/app/src/app/[locale]/(app)/personas/new/page.tsx`:

```tsx
'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { FileText, Wand2, Layers, Sparkles } from 'lucide-react'

const MODES = [
  {
    key: 'blank',
    icon: FileText,
    title: 'Blank Slate',
    description: 'Start from scratch and fill every field manually.',
    href: (locale: string) => `/${locale}/personas/new/blank`,
  },
  {
    key: 'wizard',
    icon: Wand2,
    title: 'Guided Wizard',
    description: 'Answer a few questions step by step. We\'ll build the persona for you.',
    href: (locale: string) => `/${locale}/personas/new/wizard`,
  },
  {
    key: 'archetype',
    icon: Layers,
    title: 'Start from Archetype',
    description: 'Pick a platform-defined type and customize from there.',
    href: (locale: string) => `/${locale}/personas/new/archetype`,
  },
  {
    key: 'ai',
    icon: Sparkles,
    title: 'AI Generation',
    description: 'Describe your persona in plain language. AI extracts the fields.',
    href: (locale: string) => `/${locale}/personas/new/ai`,
  },
]

export default function NewPersonaModePage() {
  const params = useParams()
  const locale = params.locale as string

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Create a Persona</h1>
        <p className="text-sm text-muted-foreground mt-1">Choose how you want to start.</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {MODES.map(mode => (
          <Link key={mode.key} href={mode.href(locale)}>
            <Card className="h-full hover:border-primary/50 hover:shadow-sm transition-all cursor-pointer">
              <CardContent className="p-5 space-y-3">
                <mode.icon className="h-7 w-7 text-primary" />
                <div>
                  <p className="font-semibold text-sm">{mode.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">{mode.description}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add "apps/app/src/app/[locale]/(app)/personas/new/page.tsx"
git commit -m "feat(app): persona creation mode picker"
```

---

## Task 9: Shared PersonaForm component

This is the destination all 4 modes land on. 7 collapsible sections, no JSON exposed.

**Files:**
- Create: `apps/app/src/components/personas/PersonaForm.tsx`

- [ ] **Step 1: Create PersonaForm**

Create `apps/app/src/components/personas/PersonaForm.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ChevronDown, Loader2 } from 'lucide-react'
import { AvatarSection } from './AvatarSection'
import { WpIntegrationSection } from './WpIntegrationSection'

interface PersonaFormValues {
  slug: string
  name: string
  bioShort: string
  bioLong: string
  primaryDomain: string
  domainLens: string
  approvedCategories: string[]
  writingVoiceJson: { writingStyle: string; signaturePhrases: string[]; characteristicOpinions: string[] }
  eeatSignalsJson: { analyticalLens: string; trustSignals: string[]; expertiseClaims: string[] }
  soulJson: {
    values: string[]; lifePhilosophy: string; strongOpinions: string[]
    petPeeves: string[]; humorStyle: string; recurringJokes: string[]
    whatExcites: string[]; innerTensions: string[]; languageGuardrails: string[]
  }
  archetypeSlug?: string | null
  avatarUrl?: string | null
  avatarParamsJson?: Record<string, unknown> | null
}

const EMPTY: PersonaFormValues = {
  slug: '', name: '', bioShort: '', bioLong: '',
  primaryDomain: '', domainLens: '', approvedCategories: [],
  writingVoiceJson: { writingStyle: '', signaturePhrases: [], characteristicOpinions: [] },
  eeatSignalsJson: { analyticalLens: '', trustSignals: [], expertiseClaims: [] },
  soulJson: {
    values: [], lifePhilosophy: '', strongOpinions: [], petPeeves: [],
    humorStyle: '', recurringJokes: [], whatExcites: [], innerTensions: [], languageGuardrails: [],
  },
  archetypeSlug: null, avatarUrl: null, avatarParamsJson: null,
}

function TagInput({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [input, setInput] = useState('')
  function add() {
    const trimmed = input.trim()
    if (trimmed && !value.includes(trimmed)) onChange([...value, trimmed])
    setInput('')
  }
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), add())} placeholder={placeholder} className="h-8 text-sm" />
        <Button size="sm" type="button" variant="outline" onClick={add}>Add</Button>
      </div>
      <div className="flex flex-wrap gap-1">
        {value.map(tag => (
          <span key={tag} className="flex items-center gap-1 px-2 py-0.5 bg-muted rounded text-xs">
            {tag}
            <button type="button" onClick={() => onChange(value.filter(t => t !== tag))} className="hover:text-destructive">×</button>
          </span>
        ))}
      </div>
    </div>
  )
}

function Section({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center justify-between w-full py-3 border-b text-sm font-semibold hover:text-primary transition-colors">
        {title}
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-4 pb-2 space-y-4">
        {children}
      </CollapsibleContent>
    </Collapsible>
  )
}

interface PersonaFormProps {
  initial?: Partial<PersonaFormValues>
  personaId?: string  // undefined = creating new
  archetypeSlug?: string
}

export function PersonaForm({ initial, personaId, archetypeSlug }: PersonaFormProps) {
  const [values, setValues] = useState<PersonaFormValues>({ ...EMPTY, ...initial, archetypeSlug: archetypeSlug ?? initial?.archetypeSlug ?? null })
  const [saving, setSaving] = useState(false)
  const router = useRouter()
  const params = useParams()
  const locale = params.locale as string

  function set<K extends keyof PersonaFormValues>(key: K, val: PersonaFormValues[K]) {
    setValues(prev => ({ ...prev, [key]: val }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const url = personaId ? `/api/personas/${personaId}` : '/api/personas'
      const method = personaId ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      const { data, error } = await res.json()
      if (error) throw new Error(error.message)
      router.push(`/${locale}/personas`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <Section title="Identity" defaultOpen>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Name</Label>
              <Input value={values.name} onChange={e => set('name', e.target.value)} placeholder="Alex Strand" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Slug</Label>
              <Input value={values.slug} onChange={e => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} placeholder="alex-strand" disabled={!!personaId} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Short Bio</Label>
            <Input value={values.bioShort} onChange={e => set('bioShort', e.target.value)} placeholder="1-2 sentence summary" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Long Bio</Label>
            <Textarea value={values.bioLong} onChange={e => set('bioLong', e.target.value)} placeholder="3-5 sentence detailed background" className="min-h-[80px]" />
          </div>
        </div>
      </Section>

      <Section title="Domain & Niche">
        <div className="grid gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Primary Domain</Label>
            <Input value={values.primaryDomain} onChange={e => set('primaryDomain', e.target.value)} placeholder="Personal Finance" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Domain Lens (unique angle)</Label>
            <Input value={values.domainLens} onChange={e => set('domainLens', e.target.value)} placeholder="Data-driven FIRE methodology" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Approved Topic Categories</Label>
            <TagInput value={values.approvedCategories} onChange={v => set('approvedCategories', v)} placeholder="Add category..." />
          </div>
        </div>
      </Section>

      <Section title="Voice">
        <div className="grid gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Writing Style</Label>
            <Input value={values.writingVoiceJson.writingStyle} onChange={e => set('writingVoiceJson', { ...values.writingVoiceJson, writingStyle: e.target.value })} placeholder="Direct, data-driven, no fluff" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Signature Phrases</Label>
            <TagInput value={values.writingVoiceJson.signaturePhrases} onChange={v => set('writingVoiceJson', { ...values.writingVoiceJson, signaturePhrases: v })} placeholder="Add phrase..." />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Characteristic Opinions</Label>
            <TagInput value={values.writingVoiceJson.characteristicOpinions} onChange={v => set('writingVoiceJson', { ...values.writingVoiceJson, characteristicOpinions: v })} placeholder="Add opinion..." />
          </div>
        </div>
      </Section>

      <Section title="Soul">
        <div className="grid gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Core Values</Label>
            <TagInput value={values.soulJson.values} onChange={v => set('soulJson', { ...values.soulJson, values: v })} placeholder="Add value..." />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Life Philosophy</Label>
            <Input value={values.soulJson.lifePhilosophy} onChange={e => set('soulJson', { ...values.soulJson, lifePhilosophy: e.target.value })} placeholder="One guiding belief" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Strong Opinions</Label>
            <TagInput value={values.soulJson.strongOpinions} onChange={v => set('soulJson', { ...values.soulJson, strongOpinions: v })} placeholder="Add opinion..." />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Pet Peeves</Label>
            <TagInput value={values.soulJson.petPeeves} onChange={v => set('soulJson', { ...values.soulJson, petPeeves: v })} placeholder="Add pet peeve..." />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Humor Style</Label>
            <Input value={values.soulJson.humorStyle} onChange={e => set('soulJson', { ...values.soulJson, humorStyle: e.target.value })} placeholder="Dry wit, self-deprecating..." />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">What Excites Them</Label>
            <TagInput value={values.soulJson.whatExcites} onChange={v => set('soulJson', { ...values.soulJson, whatExcites: v })} placeholder="Add topic..." />
          </div>
        </div>
      </Section>

      <Section title="EEAT">
        <div className="grid gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Analytical Lens</Label>
            <Input value={values.eeatSignalsJson.analyticalLens} onChange={e => set('eeatSignalsJson', { ...values.eeatSignalsJson, analyticalLens: e.target.value })} placeholder="How they analyze information" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Trust Signals</Label>
            <TagInput value={values.eeatSignalsJson.trustSignals} onChange={v => set('eeatSignalsJson', { ...values.eeatSignalsJson, trustSignals: v })} placeholder="Add signal..." />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Expertise Claims</Label>
            <TagInput value={values.eeatSignalsJson.expertiseClaims} onChange={v => set('eeatSignalsJson', { ...values.eeatSignalsJson, expertiseClaims: v })} placeholder="Add claim..." />
          </div>
        </div>
      </Section>

      <Section title="Avatar">
        <AvatarSection
          personaId={personaId ?? ''}
          currentUrl={values.avatarUrl ?? null}
          onAccept={(url, params) => {
            set('avatarUrl', url)
            set('avatarParamsJson', params)
          }}
        />
      </Section>

      <Section title="Integrations">
        {personaId ? (
          <WpIntegrationSection personaId={personaId} currentWpAuthorId={null} />
        ) : (
          <p className="text-xs text-muted-foreground">Save the persona first to connect WordPress.</p>
        )}
      </Section>

      <div className="pt-4 flex justify-end">
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          {personaId ? 'Save Changes' : 'Create Persona'}
        </Button>
      </div>
    </form>
  )
}
```

- [ ] **Step 2: Create stub AvatarSection**

Create `apps/app/src/components/personas/AvatarSection.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Loader2, Upload, Sparkles } from 'lucide-react'

interface AvatarSectionProps {
  personaId: string
  currentUrl: string | null
  onAccept: (url: string, params: Record<string, unknown>) => void
}

export function AvatarSection({ personaId, currentUrl, onAccept }: AvatarSectionProps) {
  const [mode, setMode] = useState<'upload' | 'ai'>('upload')
  const [previewUrl, setPreviewUrl] = useState(currentUrl)
  const [generating, setGenerating] = useState(false)
  const [background, setBackground] = useState('')
  const [artStyle, setArtStyle] = useState('')
  const [faceMood, setFaceMood] = useState('')
  const [noFaceElement, setNoFaceElement] = useState('')

  async function handleGenerate() {
    if (!personaId) return
    setGenerating(true)
    try {
      const res = await fetch(`/api/personas/${personaId}/avatar/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggestions: { background, artStyle, faceMood, noFaceElement } }),
      })
      const { data } = await res.json()
      if (data?.avatarUrl) {
        setPreviewUrl(data.avatarUrl)
        onAccept(data.avatarUrl, data.avatarParamsJson)
      }
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Avatar className="h-20 w-20 rounded-xl">
          <AvatarImage src={previewUrl ?? undefined} />
          <AvatarFallback className="rounded-xl text-2xl">?</AvatarFallback>
        </Avatar>
        <div className="flex gap-2">
          <Button size="sm" variant={mode === 'upload' ? 'default' : 'outline'} onClick={() => setMode('upload')}>
            <Upload className="h-3 w-3 mr-1" /> Upload
          </Button>
          <Button size="sm" variant={mode === 'ai' ? 'default' : 'outline'} onClick={() => setMode('ai')}>
            <Sparkles className="h-3 w-3 mr-1" /> AI Generate
          </Button>
        </div>
      </div>

      {mode === 'upload' && (
        <Input type="url" placeholder="Paste image URL or use file upload" onChange={e => { setPreviewUrl(e.target.value); onAccept(e.target.value, {}) }} />
      )}

      {mode === 'ai' && (
        <div className="space-y-3 border rounded-lg p-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Background</Label>
              <Input value={background} onChange={e => setBackground(e.target.value)} placeholder="dark studio, outdoors..." className="h-8" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Art Style</Label>
              <Input value={artStyle} onChange={e => setArtStyle(e.target.value)} placeholder="Illustrated, photorealistic..." className="h-8" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Face Mood (if with face)</Label>
              <Input value={faceMood} onChange={e => setFaceMood(e.target.value)} placeholder="Confident, friendly..." className="h-8" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">No Face Element</Label>
              <Input value={noFaceElement} onChange={e => setNoFaceElement(e.target.value)} placeholder="A hawk, chess piece..." className="h-8" />
            </div>
          </div>
          <Button onClick={handleGenerate} disabled={generating || !personaId} className="w-full" size="sm">
            {generating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
            Generate Avatar
          </Button>
          {!personaId && <p className="text-xs text-muted-foreground text-center">Save persona first to generate avatar.</p>}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Create stub WpIntegrationSection**

Create `apps/app/src/components/personas/WpIntegrationSection.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Link2, UserPlus } from 'lucide-react'

interface WpIntegrationSectionProps {
  personaId: string
  currentWpAuthorId: number | null
  channelId?: string
}

export function WpIntegrationSection({ personaId, currentWpAuthorId, channelId }: WpIntegrationSectionProps) {
  const [mode, setMode] = useState<'link' | 'create'>('link')
  const [wpUsername, setWpUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<number | null>(currentWpAuthorId)

  async function handleSubmit() {
    if (!channelId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/personas/${personaId}/integrations/wordpress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: mode, wpUsername: mode === 'link' ? wpUsername : undefined, channelId }),
      })
      const { data } = await res.json()
      if (data?.wpAuthorId) setResult(data.wpAuthorId)
    } finally {
      setLoading(false)
    }
  }

  if (result) {
    return (
      <div className="flex items-center gap-2 text-sm text-green-600">
        <Link2 className="h-4 w-4" />
        WordPress author linked (ID: {result})
      </div>
    )
  }

  if (!channelId) {
    return <p className="text-xs text-muted-foreground">Assign persona to a channel first to connect WordPress.</p>
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button size="sm" variant={mode === 'link' ? 'default' : 'outline'} onClick={() => setMode('link')}>
          <Link2 className="h-3 w-3 mr-1" /> Link existing
        </Button>
        <Button size="sm" variant={mode === 'create' ? 'default' : 'outline'} onClick={() => setMode('create')}>
          <UserPlus className="h-3 w-3 mr-1" /> Create new
        </Button>
      </div>

      {mode === 'link' && (
        <div className="space-y-1">
          <Label className="text-xs">WordPress Username</Label>
          <Input value={wpUsername} onChange={e => setWpUsername(e.target.value)} placeholder="wp-username" className="h-8" />
        </div>
      )}

      {mode === 'create' && (
        <p className="text-xs text-muted-foreground">A new WordPress author will be created using this persona's name and slug.</p>
      )}

      <Button size="sm" onClick={handleSubmit} disabled={loading || (mode === 'link' && !wpUsername)}>
        {loading && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
        {mode === 'link' ? 'Link Author' : 'Create WP Author'}
      </Button>
    </div>
  )
}
```

- [ ] **Step 4: Verify typecheck**

```bash
npm run typecheck --workspace=apps/app
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/components/personas/PersonaForm.tsx \
        apps/app/src/components/personas/AvatarSection.tsx \
        apps/app/src/components/personas/WpIntegrationSection.tsx
git commit -m "feat(app): PersonaForm, AvatarSection, WpIntegrationSection components"
```

---

## Task 10: Blank slate + Edit pages + AI generation flow

**Files:**
- Create: `apps/app/src/app/[locale]/(app)/personas/new/blank/page.tsx`
- Create: `apps/app/src/app/[locale]/(app)/personas/[id]/edit/page.tsx`
- Create: `apps/app/src/app/[locale]/(app)/personas/new/ai/page.tsx`
- Create: `apps/app/src/app/[locale]/(app)/personas/new/archetype/page.tsx`

- [ ] **Step 1: Blank slate page**

Create `apps/app/src/app/[locale]/(app)/personas/new/blank/page.tsx`:

```tsx
import { PersonaForm } from '@/components/personas/PersonaForm'

export default function NewPersonaBlankPage() {
  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">New Persona</h1>
        <p className="text-sm text-muted-foreground mt-1">Fill in the details to define your persona.</p>
      </div>
      <PersonaForm />
    </div>
  )
}
```

- [ ] **Step 2: Edit page (loads existing persona)**

Create `apps/app/src/app/[locale]/(app)/personas/[id]/edit/page.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { PersonaForm } from '@/components/personas/PersonaForm'

export default function EditPersonaPage() {
  const params = useParams()
  const id = params.id as string
  const [persona, setPersona] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/personas/${id}`)
      .then(r => r.json())
      .then(({ data }) => setPersona(data))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
  if (!persona) return <div className="p-6 text-sm text-muted-foreground">Persona not found.</div>

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Edit Persona</h1>
        <p className="text-sm text-muted-foreground mt-1">{persona.name as string}</p>
      </div>
      <PersonaForm initial={persona as any} personaId={id} />
    </div>
  )
}
```

- [ ] **Step 3: AI generation flow**

Create `apps/app/src/app/[locale]/(app)/personas/new/ai/page.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Sparkles } from 'lucide-react'
import { PersonaForm } from '@/components/personas/PersonaForm'

export default function NewPersonaAiPage() {
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [extracted, setExtracted] = useState<Record<string, unknown> | null>(null)

  async function handleExtract() {
    setLoading(true)
    try {
      const res = await fetch('/api/personas/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description }),
      })
      const { data } = await res.json()
      if (data) setExtracted(data)
    } finally {
      setLoading(false)
    }
  }

  if (extracted) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Review Generated Persona</h1>
          <p className="text-sm text-muted-foreground mt-1">AI extracted these fields. Review and adjust before saving.</p>
        </div>
        <PersonaForm initial={extracted as any} />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Describe Your Persona</h1>
        <p className="text-sm text-muted-foreground mt-1">Write freely. AI will extract the structured fields.</p>
      </div>
      <Textarea
        value={description}
        onChange={e => setDescription(e.target.value)}
        placeholder="A no-nonsense fitness coach who's been competing for 15 years, very direct, hates pseudoscience, speaks in short punchy sentences..."
        className="min-h-[160px]"
      />
      <Button onClick={handleExtract} disabled={loading || description.length < 10} className="w-full">
        {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
        Extract Persona Fields
      </Button>
    </div>
  )
}
```

- [ ] **Step 4: Archetype picker flow**

Create `apps/app/src/app/[locale]/(app)/personas/new/archetype/page.tsx`:

```tsx
'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'
import { PersonaForm } from '@/components/personas/PersonaForm'

interface Archetype {
  id: string
  slug: string
  name: string
  description: string
  defaultFieldsJson: Record<string, unknown>
}

export default function NewPersonaArchetypePage() {
  const [archetypes, setArchetypes] = useState<Archetype[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Archetype | null>(null)

  useEffect(() => {
    fetch('/api/personas/archetypes')
      .then(r => r.json())
      .then(({ data }) => setArchetypes(data ?? []))
      .finally(() => setLoading(false))
  }, [])

  if (selected) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Customize {selected.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">Fields pre-filled from archetype. Adjust to match your persona.</p>
        </div>
        <PersonaForm initial={selected.defaultFieldsJson as any} archetypeSlug={selected.slug} />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Choose an Archetype</h1>
        <p className="text-sm text-muted-foreground mt-1">Pick a starting point and customize from there.</p>
      </div>
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {archetypes.map(a => (
            <Card key={a.id} className="cursor-pointer hover:border-primary/50 transition-all" onClick={() => setSelected(a)}>
              <CardContent className="p-4 space-y-2">
                <p className="font-semibold text-sm">{a.name}</p>
                <p className="text-xs text-muted-foreground">{a.description}</p>
              </CardContent>
            </Card>
          ))}
          {archetypes.length === 0 && (
            <p className="col-span-2 text-sm text-muted-foreground text-center py-8">No archetypes defined yet.</p>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Verify typecheck**

```bash
npm run typecheck --workspace=apps/app
```

Expected: no errors

- [ ] **Step 6: Run dev and manually test all 4 creation flows**

```bash
npm run dev
```

Navigate to `/personas/new` and test each mode:
1. Blank → `/personas/new/blank` → form loads empty
2. Wizard → `/personas/new/wizard` (not yet built — skip)
3. Archetype → `/personas/new/archetype` → shows archetype cards (empty if none seeded yet)
4. AI → `/personas/new/ai` → textarea + extract button

Expected: all pages load without errors

- [ ] **Step 7: Commit**

```bash
git add "apps/app/src/app/[locale]/(app)/personas/new/blank/page.tsx" \
        "apps/app/src/app/[locale]/(app)/personas/[id]/edit/page.tsx" \
        "apps/app/src/app/[locale]/(app)/personas/new/ai/page.tsx" \
        "apps/app/src/app/[locale]/(app)/personas/new/archetype/page.tsx"
git commit -m "feat(app): persona creation pages — blank, edit, AI, archetype flows"
```

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| `GET /personas/archetypes` + `GET /personas/archetypes/:slug` | Task 1 |
| `POST /personas/extract` — AI field extraction | Task 1 |
| `POST /personas/:id/avatar/generate` | Task 2 |
| `POST /personas/:id/integrations/wordpress` | Task 3 |
| Channel-personas CRUD | Task 4 |
| `persona-avatar-generator` agent prompt | Task 5 |
| WP publish attribution via `wpAuthorId` | Task 6 |
| Persona Manager page | Task 7 |
| Creation mode picker (4 modes) | Task 8 |
| PersonaForm — 7 sections, no JSON | Task 9 |
| AvatarSection — upload + AI generate | Task 9 |
| WpIntegrationSection — link + create | Task 9 |
| Blank slate flow | Task 10 |
| Edit existing persona | Task 10 |
| AI generation flow | Task 10 |
| Archetype picker flow | Task 10 |
| Guided wizard | NOT included — added to Out of Scope below |

**Guided wizard out of scope for this plan:** The wizard requires a multi-step form with state management across steps. It is a UI-only feature with no new API dependencies — can be added as a follow-on task without blocking any other work. The `/personas/new/wizard` route returns a 404 until implemented; the mode picker card remains visible but non-functional.

**Placeholder scan:** No TBD/TODO. `WpIntegrationSection` requires `channelId` prop — the edit page currently passes `undefined` because it doesn't know the channel. This is a known UX gap: WP integration is available via channel settings page (Plan 4 follow-on), not just the persona edit page.

**Type consistency:**
- `AvatarSuggestions` in `avatarPrompt.ts` matches the Zod schema fields in the generate endpoint ✅
- `PersonaFormValues` field names match `createPersonaSchema` field names from Plan 1 ✅
- `buildWpPostData({ authorId })` — `authorId` is `number | null`, `persona.wpAuthorId` is `number | null` ✅
- `channelPersonasRoutes` registered at `/channels` prefix — routes become `/channels/:channelId/personas` ✅ (matches spec)
