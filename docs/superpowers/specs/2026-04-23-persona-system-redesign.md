# Persona System Redesign
**Date:** 2026-04-23  
**Status:** Approved  
**Branch:** feat/persona-eeat-layer

---

## Problem

Current personas (Cole Merritt, Alex Strand, Casey Park) are hardcoded to a finance/founder niche. The agent pipeline is niche-agnostic except for persona injection. There is no way for users to create personas for their own niche, no admin UI for guardrails, and no separation between platform-controlled behavioral rules and user-controlled personality data.

---

## Goals

- Users can create unlimited niche-agnostic personas via 4 creation modes
- Platform guardrails (behavioral constraints) are hidden from users — admin-only
- Personas are workspace-level, assignable to multiple channels (M:M)
- Each persona can be linked to a WordPress author for attributed publishing
- Admin manages guardrails and archetypes under `/admin/agents/personas/`
- Persona injection applies to Canonical Core and Blog Post agents (extensible)

---

## Architecture — Approach C: Layered Composition Pipeline

### Three-Layer Runtime Composition

```
Layer 1: persona_guardrails     ← admin-controlled, global, applies to all personas
Layer 2: archetype overlay      ← admin-controlled, per-archetype behavioral rules
Layer 3: user persona data      ← user-controlled, personality/voice/soul/eeat
              ↓
        buildPersonaContext()
              ↓
   Canonical Core agent  +  Blog Post agent
```

Each layer is fetched and tested independently. Agents consume only the final `PersonaContext` — unaware of layering internals.

---

## Data Model

### New Tables

#### `persona_guardrails` (admin-only)

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| category | text | `content_boundaries`, `tone_constraints`, `factual_rules`, `behavioral_rules` |
| label | text | Human-readable label for admin UI |
| rule_text | text | Injected into prompt — never exposed to users |
| is_active | boolean | DEFAULT true |
| sort_order | integer | Controls injection order |
| created_at / updated_at | timestamptz | |

RLS enabled. Admin-only access via service_role.

---

#### `persona_archetypes` (admin-only)

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| slug | text | UNIQUE — e.g. `the-analyst`, `the-practitioner` |
| name | text | Display name shown to users |
| description | text | Shown on archetype picker card |
| icon | text | UI icon identifier |
| default_fields_json | jsonb | Pre-fills all persona form fields — sent to client |
| behavioral_overlay_json | jsonb | Hidden behavioral instructions — server-side only, never sent to client |
| sort_order | integer | |
| is_active | boolean | DEFAULT true |
| created_at / updated_at | timestamptz | |

RLS enabled. `behavioral_overlay_json` never returned by user-facing routes.

---

#### `channel_personas` (junction — M:M)

| Column | Type | Notes |
|---|---|---|
| channel_id | uuid | FK → channels |
| persona_id | uuid | FK → personas |
| is_primary | boolean | Default persona for this channel |
| created_at | timestamptz | |

PK = `(channel_id, persona_id)`

---

### Modified Tables

#### `personas` — new columns

- `archetype_slug TEXT NULL` — logical reference to `persona_archetypes.slug`. Used at runtime to fetch `behavioral_overlay_json`. Not a hard FK — slug is UNIQUE on archetypes, deletion handled gracefully (overlay simply omitted if slug no longer exists).
- `avatar_params_json JSONB NULL` — stores last avatar generation params (provider, suggestions, resolved prompt) for one-click regeneration.

Existing columns preserved as-is: `writing_voice_json`, `soul_json`, `eeat_signals_json`, `avatar_url`, `wp_author_id`.

---

## Admin Experience

**Navigation:** `/admin/agents/personas/`

### Guardrails Editor — `/admin/agents/personas/guardrails`

Table UI. Rows grouped by category tabs: `Content Boundaries | Tone Constraints | Factual Rules | Behavioral Rules`.

Admin actions per row: create, edit rule_text inline, toggle is_active, reorder, delete.

Rules apply globally to all personas. Users have no visibility into this page.

---

### Archetypes Manager — `/admin/agents/personas/archetypes`

Card-based editor. Each card = one archetype.

Admin actions:
- Create archetype (name, slug, description, icon, sort order)
- Edit default fields (structured form — not raw JSON)
- Edit behavioral overlay (textarea, labeled "Hidden overlay — not visible to users")
- Toggle is_active
- Preview what user sees on the archetype picker

Behavioral overlay is the only location in the system where hidden per-archetype prompt instructions are authored outside of code.

---

### Agent Config Pages

In `/admin/agents/canonical-core/` and `/admin/agents/blog-post/`: a read-only section showing "Persona injection: ON — pulls from active channel persona via composition pipeline."

---

## User Experience

### Persona Manager

Workspace-level. Shows all user's personas as cards: name, avatar, short bio, assigned channels, active/inactive.

Actions: Create new, Edit, Assign to channel, Deactivate.

---

### Creation Mode Picker

Four starting points, all converging on the same persona form:

| Mode | Entry Point | What happens |
|---|---|---|
| **Blank Slate** | Empty form | User fills all fields manually |
| **Guided Wizard** | Step-by-step screens | Answers map to fields → pre-filled form |
| **Archetype** | Pick from platform archetypes | `default_fields_json` pre-fills form → user customizes |
| **AI Generation** | Free-text textarea | POST `/api/personas/extract` → AI returns field values → pre-filled form |

Wizard steps: name/role → domain/niche → tone → values → opinions → credibility signals → review form.

---

### Persona Form (shared destination)

Seven collapsible sections. No JSON exposed anywhere.

| Section | Fields |
|---|---|
| **Identity** | Name, short bio, long bio |
| **Domain & Niche** | Primary domain, domain lens, approved topic categories (tag input) |
| **Voice** | Writing style (tone picker), signature phrases (tag input), characteristic opinions (tag input) |
| **Soul** | Core values, life philosophy, strong opinions, pet peeves, humor style, what excites them, inner tensions |
| **EEAT** | Analytical lens, trust signals (tag input), expertise claims (tag input) |
| **Avatar** | Upload or AI-generate (see Avatar Section below) |
| **Integrations** | WordPress author link (see WordPress Integration below) |

On save: POST/PUT `/api/personas`. `archetype_slug` recorded if archetype was used.

---

### Avatar Section

Two modes:

**Upload** — direct file upload, stored as `personas.avatar_url`. Same as current flow.

**AI Generate** — mirrors the Assets Engine pattern:

1. **Provider picker** — same provider list as Assets Engine (DALL-E, Stable Diffusion, Midjourney, etc.)
2. **Optional suggestion fields** (all optional — system fills gaps from persona + channel context):

| Field | Input Type | Notes |
|---|---|---|
| Background | Text input or preset chips | e.g. "dark studio", "outdoor nature", "abstract gradient" |
| Art style | Selector | Photorealistic, Illustrated, Abstract, Pixel art, 3D render, etc. |
| Face: mood | Selector (if face) | Serious, Confident, Friendly, Mysterious, etc. |
| Face: appearance | Free text (if face) | Physical description notes |
| No face | Free text (if non-personification) | e.g. "a hawk", "chess piece", "geometric shapes representing data" |

3. **Prompt assembly** (server-side, hidden from user):

```
Avatar Agent instruction (agent_prompts)
  + persona fields (name, domain, voice tone, soul values)
  + channel niche (pulled from channel context at generation time)
  + user suggestions (background, art style, face/no-face)
        ↓
  Refined image generation prompt → provider API → avatar image
```

4. **Result:** User sees generated image, can regenerate with different suggestions or accept. On accept, stored as `personas.avatar_url`. Intermediate generations are ephemeral — not stored until user accepts.

**Channel context for avatar generation:** When generating, the system uses the channel the user is currently working in to inject niche context. If the persona is not yet assigned to any channel, niche context is derived from persona's own `primary_domain` field.

Last generation params stored in `personas.avatar_params_json` to allow one-click regeneration later.

---

### Avatar Agent

A dedicated entry in `agent_prompts` table: `persona-avatar-generator`.

Responsible for translating persona identity + channel niche + user suggestions into a high-quality, provider-optimized image generation prompt. Follows the same hidden instruction pattern as other agents — users never see the prompt template, only the suggestion fields and the result.

Key constraint baked into the agent instruction: avatar style must feel coherent with the channel niche (a finance persona avatar looks different from a fitness persona avatar even with the same art style selected).

---

### WordPress Integration (end of persona form)

**Integrations section** — extensible for future CRMs (Ghost, Substack, etc.):

Two options:
- **Link existing WP user** — user enters WP username → system calls `GET /wp/v2/users?search=username` → confirms match → stores `wp_author_id`
- **Create WP user** — system calls `POST /wp/v2/users` with persona name + generated credentials → stores returned user ID as `wp_author_id`

Uses integration account credentials (already in `wordpress_configs`). Integration account must have Administrator or Editor role in WordPress.

At publish time: `PublishEngine` reads `draft.persona_id` → fetches `persona.wp_author_id` → sets `author: wp_author_id` in WP REST API call.

---

### Channel Assignment

In channel settings. Persona picker shows all user's personas. Multiple personas assignable per channel. One marked as primary (default for new drafts). Writes to `channel_personas`.

---

## Runtime Composition

```typescript
async function buildPersonaContext(personaId: string): Promise<PersonaContext> {
  // Layer 3 — user persona data
  const persona = await fetchPersona(personaId)

  // Layer 2 — archetype behavioral overlay (null if no archetype)
  const overlay = persona.archetype_slug
    ? await fetchArchetypeOverlay(persona.archetype_slug)
    : null

  // Layer 1 — global guardrails
  const guardrails = await fetchActiveGuardrails()

  return compose(guardrails, overlay, persona)
}
```

`compose()` assembles layers into a `PersonaContext` object consumed by both agents.

**Merge strategy:**
- Guardrails (Layer 1) become non-negotiable prompt constraints — prepended as system-level rules, cannot be softened by user persona data
- Archetype overlay (Layer 2) adds persona-type-specific behavioral instructions — appended after guardrails, before user data
- User persona data (Layer 3) fills voice, soul, domain, and EEAT slots — the "personality" the AI expresses within the constraints set by Layers 1 and 2

**`PersonaContext` shape (consumed by agents):**
```typescript
interface PersonaContext {
  identity: { name: string; domain: string; domainLens: string }
  voice: { writingStyle: string; signaturePhrases: string[]; characteristicOpinions: string[] }
  soul: { values: string[]; philosophy: string; strongOpinions: string[]; petPeeves: string[]; humorStyle: string }
  eeat: { analyticalLens: string; trustSignals: string[]; expertiseClaims: string[] }
  constraints: string[]   // compiled from guardrails + archetype overlay — never user-visible
}
```

Agents (Canonical Core, Blog Post) receive only the final `PersonaContext` — no awareness of layering.

---

### Persona Assignment in Draft Pipeline

`content_drafts.persona_id` already exists. Assignment logic:

1. **Auto-assign:** When a draft is created, it inherits the channel's primary persona (`channel_personas.is_primary = true`)
2. **Override:** User can switch persona per draft from the draft settings panel — updates `content_drafts.persona_id`
3. **Fallback:** If no persona is assigned to the channel, draft proceeds without persona injection (agents use base behavior). A warning is shown in the pipeline UI prompting persona setup.

---

## API Routes

### User-Facing (new)

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/personas/extract` | AI mode — text → field values |
| GET | `/api/personas/archetypes` | Active archetypes for mode picker |
| GET | `/api/personas/archetypes/:slug` | Archetype default fields (no overlay) |
| GET | `/api/channels/:id/personas` | Personas assigned to channel |
| POST | `/api/channels/:id/personas` | Assign persona to channel |
| DELETE | `/api/channels/:id/personas/:personaId` | Remove persona from channel |
| PATCH | `/api/channels/:id/personas/:personaId` | Set is_primary |
| POST | `/api/personas/:id/integrations/wordpress` | Link or create WP author |
| POST | `/api/personas/:id/avatar/generate` | Generate avatar — takes provider + suggestions, returns image URL |

### User-Facing (modified)

| Method | Route | Change |
|---|---|---|
| POST | `/api/personas` | Add `archetype_slug` to schema |
| PUT | `/api/personas/:id` | Add `archetype_slug` to schema |

### Admin-Only (new, under agents namespace)

| Method | Route | Purpose |
|---|---|---|
| GET/POST | `/api/admin/agents/personas/guardrails` | List / create guardrails |
| PUT/PATCH/DELETE | `/api/admin/agents/personas/guardrails/:id` | Update / toggle / delete |
| GET/POST | `/api/admin/agents/personas/archetypes` | List / create archetypes |
| PUT/PATCH/DELETE | `/api/admin/agents/personas/archetypes/:id` | Update / toggle / delete |

Admin routes guarded by admin role check on top of existing `X-Internal-Key` middleware.

`/api/personas/archetypes/:slug` returns only: `name`, `description`, `icon`, `default_fields_json`. `behavioral_overlay_json` is server-side only.

---

## Security Notes

- `behavioral_overlay_json` and `persona_guardrails.rule_text` are server-side only — excluded from all user-facing serializers
- Admin routes require an additional admin role check beyond `X-Internal-Key`. Exact mechanism (env-based flag, admin user list, or role column) is a separate implementation decision — not specified in this spec
- When creating a new WP user for a persona via `POST /wp/v2/users`, the returned `wp_user_id` is stored as `personas.wp_author_id`. The generated WP password does NOT need to be stored — publishing is always done via the integration account credentials, not the persona's own credentials

---

## Migration — Existing Personas

The 3 hardcoded personas (Cole Merritt, Alex Strand, Casey Park) are niche-specific and seeded via `scripts/agents/personas.ts`. On migration:

- They remain in the DB as-is — no deletion
- They are marked with a reserved `archetype_slug` (e.g. `legacy-finance`) so the composition pipeline handles them correctly
- They serve as reference examples in the admin archetype manager
- New users starting fresh do not see them unless explicitly assigned to a channel

The `personas.ts` seed script is superseded by admin-managed archetypes for all future persona creation.

---

## Out of Scope (this spec)

- Per-channel guardrail overrides
- Persona versioning / history
- Ghost / Substack integrations (extensibility point exists)
- Persona analytics (which persona performs best per channel)
