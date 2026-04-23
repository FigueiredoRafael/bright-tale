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

#### `personas` — add column

- `archetype_slug TEXT NULL` — records which archetype was used at creation. Used at runtime to fetch `behavioral_overlay_json`.

All existing JSONB columns (`writing_voice_json`, `soul_json`, `eeat_signals_json`) preserved as-is.

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

Five collapsible sections. No JSON exposed anywhere.

| Section | Fields |
|---|---|
| **Identity** | Name, avatar upload, short bio, long bio |
| **Domain & Niche** | Primary domain, domain lens, approved topic categories (tag input) |
| **Voice** | Writing style (tone picker), signature phrases (tag input), characteristic opinions (tag input) |
| **Soul** | Core values, life philosophy, strong opinions, pet peeves, humor style, what excites them, inner tensions |
| **EEAT** | Analytical lens, trust signals (tag input), expertise claims (tag input) |
| **Integrations** | WordPress author link (see below) |

On save: POST/PUT `/api/personas`. `archetype_slug` recorded if archetype was used.

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

`compose()` assembles layers into a `PersonaContext` object consumed by both agents. Layer ordering: guardrails applied first (highest authority), archetype overlay second, user persona data last.

Agents (Canonical Core, Blog Post) receive only the final `PersonaContext` — no awareness of layering.

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

`/api/personas/archetypes/:slug` returns only: `name`, `description`, `icon`, `default_fields_json`. `behavioral_overlay_json` is never sent to the client under any route.

---

## Security Notes

- `behavioral_overlay_json` and `persona_guardrails.rule_text` are server-side only — excluded from all user-facing serializers
- Admin routes require an additional admin role check beyond `X-Internal-Key`. Exact mechanism (env-based flag, admin user list, or role column) is a separate implementation decision — not specified in this spec
- When creating a new WP user for a persona via `POST /wp/v2/users`, the returned `wp_user_id` is stored as `personas.wp_author_id`. The generated WP password does NOT need to be stored — publishing is always done via the integration account credentials, not the persona's own credentials

---

## Out of Scope (this spec)

- Per-channel guardrail overrides
- Persona versioning / history
- Ghost / Substack integrations (extensibility point exists)
- Persona analytics (which persona performs best per channel)
