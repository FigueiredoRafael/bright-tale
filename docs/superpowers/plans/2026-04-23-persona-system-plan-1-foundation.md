# Persona System — Plan 1: Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the database schema, TypeScript types, and runtime composition layer that all subsequent persona system plans depend on.

**Architecture:** Four DB migrations create `persona_guardrails`, `persona_archetypes`, `channel_personas` tables and extend `personas` with two new columns. A new async wrapper `buildLayeredPersonaContext()` in `apps/api/src/lib/personas.ts` fetches guardrails + archetype overlays and compiles them into a `constraints: string[]` injected alongside existing `PersonaContext` / `PersonaVoice` in the production job — no breaking changes to existing interfaces.

**Tech Stack:** Supabase PostgreSQL (SQL migrations), TypeScript, Zod, Vitest

---

## Spec reference

`docs/superpowers/specs/2026-04-23-persona-system-redesign.md`

**Correction vs spec:** `channels` table has a `niche` column (confirmed in `apps/api/src/jobs/production-generate.ts:96`). Spec incorrectly stated it did not. Plan uses `channels.niche` correctly.

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Modify | `packages/shared/src/mappers/db.ts` | Add `persona_id` to `DbContentDraft` + `DomainContentDraft` + mapper; extend `DbPersona`; add new table mappers |
| Modify | `packages/shared/src/types/agents.ts` | Add `archetypeSlug` + `avatarParamsJson` to `Persona` interface |
| Modify | `packages/shared/src/schemas/personas.ts` | Add optional `archetypeSlug` + `avatarParamsJson` to create/update schemas; relax JSONB field requirements for blank-slate creation |
| Create | `packages/shared/src/schemas/persona-guardrails.ts` | Zod schemas for guardrail CRUD |
| Create | `packages/shared/src/schemas/persona-archetypes.ts` | Zod schemas for archetype CRUD |
| Create | `packages/shared/src/schemas/channel-personas.ts` | Zod schemas for channel-persona assignment |
| Create | `supabase/migrations/20260423200000_add_persona_guardrails.sql` | `persona_guardrails` table |
| Create | `supabase/migrations/20260423200001_add_persona_archetypes.sql` | `persona_archetypes` table |
| Create | `supabase/migrations/20260423200002_add_channel_personas.sql` | `channel_personas` junction table |
| Create | `supabase/migrations/20260423200003_add_persona_system_columns.sql` | `archetype_slug` + `avatar_params_json` on `personas` |
| Modify | `packages/shared/src/types/database.ts` | Regenerated — do not edit manually |
| Modify | `apps/api/src/lib/personas.ts` | Add `fetchActiveGuardrails`, `fetchArchetypeOverlay`, `compileConstraints`, `buildLayeredPersonaContext` |
| Modify | `apps/api/src/jobs/production-generate.ts` | Wire `buildLayeredPersonaContext`, inject `constraints` into system prompts |
| Create | `apps/api/src/lib/__tests__/personas-layered.test.ts` | Unit tests for new pure functions |

---

## Task 1: Fix DbContentDraft — add persona_id

The `persona_id` column was added to `content_drafts` in migration `20260423000100` but the TypeScript type was never updated. `loadPersonaForDraft()` reads `draft.persona_id` as `Record<string, unknown>` — it works at runtime but is untyped. Fix the type first so all downstream work is type-safe.

**Files:**
- Modify: `packages/shared/src/mappers/db.ts:313-394`

- [ ] **Step 1: Add `persona_id` to `DbContentDraft`**

In `packages/shared/src/mappers/db.ts`, find `export type DbContentDraft = {` (line 313). Add the field after `project_id`:

```typescript
export type DbContentDraft = {
  id: string;
  org_id: string;
  user_id: string;
  channel_id: string | null;
  idea_id: string | null;
  research_session_id: string | null;
  project_id: string | null;
  persona_id: string | null;    // ← add this line
  type: string;
  title: string | null;
  // ... rest unchanged
```

- [ ] **Step 2: Add `personaId` to `DomainContentDraft`**

Find `export type DomainContentDraft = {` (line 340). Add after `projectId`:

```typescript
  projectId: string | null;
  personaId: string | null;    // ← add this line
  type: string;
```

- [ ] **Step 3: Update `mapContentDraftFromDb`**

Find `export function mapContentDraftFromDb` (line 367). Add after `projectId`:

```typescript
    projectId: row.project_id,
    personaId: row.persona_id,    // ← add this line
    type: row.type,
```

- [ ] **Step 4: Verify typecheck passes**

```bash
npm run typecheck --workspace=packages/shared
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/mappers/db.ts
git commit -m "fix(types): add persona_id to DbContentDraft and DomainContentDraft"
```

---

## Task 2: Extend Persona interface with new fields

Add `archetypeSlug` and `avatarParamsJson` to the `Persona` interface and its DB mapper. These fields are added by later migrations; making them optional (`| null`) avoids breakage on existing rows.

**Files:**
- Modify: `packages/shared/src/types/agents.ts:767-784`
- Modify: `packages/shared/src/mappers/db.ts:491-547`

- [ ] **Step 1: Add fields to `Persona` interface**

In `packages/shared/src/types/agents.ts`, find `export interface Persona {` (line 767). Add two fields after `wpAuthorId`:

```typescript
export interface Persona {
  id: string
  slug: string
  name: string
  avatarUrl: string | null
  bioShort: string
  bioLong: string
  primaryDomain: string
  domainLens: string
  approvedCategories: string[]
  writingVoiceJson: PersonaWritingVoice
  eeatSignalsJson: PersonaEeatSignals
  soulJson: PersonaSoul
  wpAuthorId: number | null
  archetypeSlug: string | null    // ← add
  avatarParamsJson: Record<string, unknown> | null    // ← add
  isActive: boolean
  createdAt: string
  updatedAt: string
}
```

- [ ] **Step 2: Add fields to `DbPersona`**

In `packages/shared/src/mappers/db.ts`, find `export interface DbPersona {` (line 491). Add after `wp_author_id`:

```typescript
  wp_author_id: number | null;
  archetype_slug: string | null;    // ← add
  avatar_params_json: Record<string, unknown> | null;    // ← add
  is_active: boolean;
```

- [ ] **Step 3: Update `mapPersonaFromDb`**

In `mapPersonaFromDb` (line 510), add after `wpAuthorId`:

```typescript
    wpAuthorId: row.wp_author_id,
    archetypeSlug: row.archetype_slug,    // ← add
    avatarParamsJson: row.avatar_params_json,    // ← add
    isActive: row.is_active,
```

- [ ] **Step 4: Update `mapPersonaToDb`**

In `mapPersonaToDb` (line 531), add after the `wpAuthorId` block:

```typescript
  if (input.wpAuthorId !== undefined) out.wp_author_id = input.wpAuthorId;
  if (input.archetypeSlug !== undefined) out.archetype_slug = input.archetypeSlug;    // ← add
  if (input.avatarParamsJson !== undefined) out.avatar_params_json = input.avatarParamsJson;    // ← add
  if (input.isActive !== undefined) out.is_active = input.isActive;
```

- [ ] **Step 5: Verify typecheck**

```bash
npm run typecheck --workspace=packages/shared
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/types/agents.ts packages/shared/src/mappers/db.ts
git commit -m "feat(types): add archetypeSlug and avatarParamsJson to Persona interface and mapper"
```

---

## Task 3: Migration — persona_guardrails table

**Files:**
- Create: `supabase/migrations/20260423200000_add_persona_guardrails.sql`

- [ ] **Step 1: Create migration file**

```sql
-- supabase/migrations/20260423200000_add_persona_guardrails.sql

CREATE TABLE persona_guardrails (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  category    text    NOT NULL CHECK (category IN (
                'content_boundaries',
                'tone_constraints',
                'factual_rules',
                'behavioral_rules'
              )),
  label       text    NOT NULL,
  rule_text   text    NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE persona_guardrails ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON persona_guardrails
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

CREATE INDEX idx_persona_guardrails_active_order
  ON persona_guardrails (is_active, sort_order)
  WHERE is_active = true;
```

- [ ] **Step 2: Apply migration**

```bash
npm run db:push:dev
```

Expected: migration applied, no errors

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260423200000_add_persona_guardrails.sql
git commit -m "feat(db): add persona_guardrails table"
```

---

## Task 4: Migration — persona_archetypes table

**Files:**
- Create: `supabase/migrations/20260423200001_add_persona_archetypes.sql`

- [ ] **Step 1: Create migration file**

```sql
-- supabase/migrations/20260423200001_add_persona_archetypes.sql

CREATE TABLE persona_archetypes (
  id                      uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                    text    UNIQUE NOT NULL,
  name                    text    NOT NULL,
  description             text    NOT NULL DEFAULT '',
  icon                    text    NOT NULL DEFAULT '',
  default_fields_json     jsonb   NOT NULL DEFAULT '{}'::jsonb,
  behavioral_overlay_json jsonb   NOT NULL DEFAULT '{}'::jsonb,
  sort_order              integer NOT NULL DEFAULT 0,
  is_active               boolean NOT NULL DEFAULT true,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE persona_archetypes ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON persona_archetypes
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

CREATE INDEX idx_persona_archetypes_active_order
  ON persona_archetypes (is_active, sort_order)
  WHERE is_active = true;
```

- [ ] **Step 2: Apply migration**

```bash
npm run db:push:dev
```

Expected: migration applied, no errors

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260423200001_add_persona_archetypes.sql
git commit -m "feat(db): add persona_archetypes table"
```

---

## Task 5: Migration — channel_personas junction table

**Files:**
- Create: `supabase/migrations/20260423200002_add_channel_personas.sql`

- [ ] **Step 1: Create migration file**

```sql
-- supabase/migrations/20260423200002_add_channel_personas.sql

CREATE TABLE channel_personas (
  channel_id  uuid    NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  persona_id  uuid    NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
  is_primary  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_id, persona_id)
);

ALTER TABLE channel_personas ENABLE ROW LEVEL SECURITY;

-- Fast lookup: all personas for a channel
CREATE INDEX idx_channel_personas_channel
  ON channel_personas (channel_id);

-- Fast lookup: all channels a persona belongs to
CREATE INDEX idx_channel_personas_persona
  ON channel_personas (persona_id);

-- Enforce only one primary per channel at DB level
CREATE UNIQUE INDEX idx_channel_personas_one_primary
  ON channel_personas (channel_id)
  WHERE is_primary = true;
```

- [ ] **Step 2: Apply migration**

```bash
npm run db:push:dev
```

Expected: migration applied, no errors

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260423200002_add_channel_personas.sql
git commit -m "feat(db): add channel_personas M:M junction table"
```

---

## Task 6: Migration — extend personas with new columns

**Files:**
- Create: `supabase/migrations/20260423200003_add_persona_system_columns.sql`

- [ ] **Step 1: Create migration file**

```sql
-- supabase/migrations/20260423200003_add_persona_system_columns.sql

ALTER TABLE personas
  ADD COLUMN archetype_slug      text   NULL,
  ADD COLUMN avatar_params_json  jsonb  NULL;
```

- [ ] **Step 2: Apply migration**

```bash
npm run db:push:dev
```

Expected: migration applied, no errors

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260423200003_add_persona_system_columns.sql
git commit -m "feat(db): add archetype_slug and avatar_params_json columns to personas"
```

---

## Task 7: Regenerate DB types

**Files:**
- Modify: `packages/shared/src/types/database.ts` (auto-generated)

- [ ] **Step 1: Regenerate**

```bash
npm run db:types
```

Expected: `packages/shared/src/types/database.ts` updated with new tables and columns

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/types/database.ts
git commit -m "chore(types): regenerate database types after persona system migrations"
```

---

## Task 8: Add mappers for new tables

Add `DbPersonaGuardrail`, `DbPersonaArchetype`, `DbChannelPersona` interfaces and their mappers. Two archetype mapper variants: one for admin (includes `behavioralOverlayJson`) and one for public responses (excludes it).

**Files:**
- Modify: `packages/shared/src/mappers/db.ts` (append to end of file)

- [ ] **Step 1: Add guardrail mapper**

Append to `packages/shared/src/mappers/db.ts`:

```typescript
// ─── PersonaGuardrail ─────────────────────────────────────────────────────────

export type GuardrailCategory =
  | 'content_boundaries'
  | 'tone_constraints'
  | 'factual_rules'
  | 'behavioral_rules'

export interface DbPersonaGuardrail {
  id: string;
  category: GuardrailCategory;
  label: string;
  rule_text: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface DomainPersonaGuardrail {
  id: string;
  category: GuardrailCategory;
  label: string;
  ruleText: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export function mapPersonaGuardrailFromDb(row: DbPersonaGuardrail): DomainPersonaGuardrail {
  return {
    id: row.id,
    category: row.category,
    label: row.label,
    ruleText: row.rule_text,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapPersonaGuardrailToDb(input: Partial<DomainPersonaGuardrail>): Partial<DbPersonaGuardrail> {
  const out: Partial<DbPersonaGuardrail> = {};
  if (input.category !== undefined) out.category = input.category;
  if (input.label !== undefined) out.label = input.label;
  if (input.ruleText !== undefined) out.rule_text = input.ruleText;
  if (input.isActive !== undefined) out.is_active = input.isActive;
  if (input.sortOrder !== undefined) out.sort_order = input.sortOrder;
  return out;
}
```

- [ ] **Step 2: Add archetype mapper**

Continue appending:

```typescript
// ─── PersonaArchetype ─────────────────────────────────────────────────────────

export interface ArchetypeOverlay {
  constraints: string[];
  behavioralAdditions: string[];
}

export interface DbPersonaArchetype {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  default_fields_json: Record<string, unknown>;
  behavioral_overlay_json: Record<string, unknown>;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Public variant — behavioral_overlay_json excluded
export interface DomainPersonaArchetypePublic {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  defaultFieldsJson: Record<string, unknown>;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// Admin variant — includes overlay
export interface DomainPersonaArchetypeAdmin extends DomainPersonaArchetypePublic {
  behavioralOverlayJson: ArchetypeOverlay;
}

export function mapPersonaArchetypePublic(row: DbPersonaArchetype): DomainPersonaArchetypePublic {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    icon: row.icon,
    defaultFieldsJson: row.default_fields_json,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapPersonaArchetypeAdmin(row: DbPersonaArchetype): DomainPersonaArchetypeAdmin {
  const overlay = row.behavioral_overlay_json as { constraints?: string[]; behavioralAdditions?: string[] } | null;
  return {
    ...mapPersonaArchetypePublic(row),
    behavioralOverlayJson: {
      constraints: overlay?.constraints ?? [],
      behavioralAdditions: overlay?.behavioralAdditions ?? [],
    },
  };
}

export function mapPersonaArchetypeToDb(
  input: Partial<DomainPersonaArchetypeAdmin>
): Partial<DbPersonaArchetype> {
  const out: Partial<DbPersonaArchetype> = {};
  if (input.name !== undefined) out.name = input.name;
  if (input.description !== undefined) out.description = input.description;
  if (input.icon !== undefined) out.icon = input.icon;
  if (input.defaultFieldsJson !== undefined) out.default_fields_json = input.defaultFieldsJson;
  if (input.behavioralOverlayJson !== undefined) out.behavioral_overlay_json = input.behavioralOverlayJson;
  if (input.sortOrder !== undefined) out.sort_order = input.sortOrder;
  if (input.isActive !== undefined) out.is_active = input.isActive;
  return out;
}
```

- [ ] **Step 3: Add channel_personas mapper**

Continue appending:

```typescript
// ─── ChannelPersona ───────────────────────────────────────────────────────────

export interface DbChannelPersona {
  channel_id: string;
  persona_id: string;
  is_primary: boolean;
  created_at: string;
}

export interface DomainChannelPersona {
  channelId: string;
  personaId: string;
  isPrimary: boolean;
  createdAt: string;
}

export function mapChannelPersonaFromDb(row: DbChannelPersona): DomainChannelPersona {
  return {
    channelId: row.channel_id,
    personaId: row.persona_id,
    isPrimary: row.is_primary,
    createdAt: row.created_at,
  };
}
```

- [ ] **Step 4: Verify typecheck**

```bash
npm run typecheck --workspace=packages/shared
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/mappers/db.ts
git commit -m "feat(types): add mappers for persona_guardrails, persona_archetypes, channel_personas"
```

---

## Task 9: Add Zod schemas for new tables + update personas schema

**Files:**
- Create: `packages/shared/src/schemas/persona-guardrails.ts`
- Create: `packages/shared/src/schemas/persona-archetypes.ts`
- Create: `packages/shared/src/schemas/channel-personas.ts`
- Modify: `packages/shared/src/schemas/personas.ts`

- [ ] **Step 1: Create persona-guardrails schema**

```typescript
// packages/shared/src/schemas/persona-guardrails.ts
import { z } from 'zod'

export const guardrailCategorySchema = z.enum([
  'content_boundaries',
  'tone_constraints',
  'factual_rules',
  'behavioral_rules',
])

export const createGuardrailSchema = z.object({
  category: guardrailCategorySchema,
  label: z.string().min(1),
  ruleText: z.string().min(1),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
})
export type CreateGuardrailInput = z.infer<typeof createGuardrailSchema>

export const updateGuardrailSchema = createGuardrailSchema.partial()
export type UpdateGuardrailInput = z.infer<typeof updateGuardrailSchema>

export const toggleGuardrailSchema = z.object({ isActive: z.boolean() })
export type ToggleGuardrailInput = z.infer<typeof toggleGuardrailSchema>
```

- [ ] **Step 2: Create persona-archetypes schema**

```typescript
// packages/shared/src/schemas/persona-archetypes.ts
import { z } from 'zod'

const archetypeOverlaySchema = z.object({
  constraints: z.array(z.string()).default([]),
  behavioralAdditions: z.array(z.string()).default([]),
})

export const createArchetypeSchema = z.object({
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/, 'slug must be lowercase with hyphens'),
  name: z.string().min(1),
  description: z.string().default(''),
  icon: z.string().default(''),
  defaultFieldsJson: z.record(z.unknown()).default({}),
  behavioralOverlayJson: archetypeOverlaySchema.default({ constraints: [], behavioralAdditions: [] }),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
})
export type CreateArchetypeInput = z.infer<typeof createArchetypeSchema>

export const updateArchetypeSchema = createArchetypeSchema.partial().omit({ slug: true })
export type UpdateArchetypeInput = z.infer<typeof updateArchetypeSchema>

export const toggleArchetypeSchema = z.object({ isActive: z.boolean() })
export type ToggleArchetypeInput = z.infer<typeof toggleArchetypeSchema>
```

- [ ] **Step 3: Create channel-personas schema**

```typescript
// packages/shared/src/schemas/channel-personas.ts
import { z } from 'zod'

export const assignChannelPersonaSchema = z.object({
  personaId: z.string().uuid(),
  isPrimary: z.boolean().default(false),
})
export type AssignChannelPersonaInput = z.infer<typeof assignChannelPersonaSchema>

export const setPrimaryChannelPersonaSchema = z.object({ isPrimary: z.boolean() })
export type SetPrimaryChannelPersonaInput = z.infer<typeof setPrimaryChannelPersonaSchema>
```

- [ ] **Step 4: Update personas schema — add optional new fields and relax JSONB for blank-slate**

Replace `packages/shared/src/schemas/personas.ts` with:

```typescript
import { z } from 'zod'

const writingVoiceSchema = z.object({
  writingStyle: z.string().default(''),
  signaturePhrases: z.array(z.string()).default([]),
  characteristicOpinions: z.array(z.string()).default([]),
})

const eeatSignalsSchema = z.object({
  analyticalLens: z.string().default(''),
  trustSignals: z.array(z.string()).default([]),
  expertiseClaims: z.array(z.string()).default([]),
})

const soulSchema = z.object({
  values: z.array(z.string()).default([]),
  lifePhilosophy: z.string().default(''),
  strongOpinions: z.array(z.string()).default([]),
  petPeeves: z.array(z.string()).default([]),
  humorStyle: z.string().default(''),
  recurringJokes: z.array(z.string()).default([]),
  whatExcites: z.array(z.string()).default([]),
  innerTensions: z.array(z.string()).default([]),
  languageGuardrails: z.array(z.string()).default([]),
})

export const createPersonaSchema = z.object({
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/, 'slug must be lowercase with hyphens'),
  name: z.string().min(1),
  avatarUrl: z.string().url().nullable().optional(),
  bioShort: z.string().default(''),
  bioLong: z.string().default(''),
  primaryDomain: z.string().default(''),
  domainLens: z.string().default(''),
  approvedCategories: z.array(z.string()).default([]),
  writingVoiceJson: writingVoiceSchema.default({}),
  eeatSignalsJson: eeatSignalsSchema.default({}),
  soulJson: soulSchema.default({}),
  archetypeSlug: z.string().nullable().optional(),
  avatarParamsJson: z.record(z.unknown()).nullable().optional(),
})
export type CreatePersonaInput = z.infer<typeof createPersonaSchema>

export const updatePersonaSchema = createPersonaSchema.partial().omit({ slug: true })
export type UpdatePersonaInput = z.infer<typeof updatePersonaSchema>

export const togglePersonaSchema = z.object({ isActive: z.boolean() })
export type TogglePersonaInput = z.infer<typeof togglePersonaSchema>
```

- [ ] **Step 5: Verify typecheck**

```bash
npm run typecheck --workspace=packages/shared
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/schemas/persona-guardrails.ts \
        packages/shared/src/schemas/persona-archetypes.ts \
        packages/shared/src/schemas/channel-personas.ts \
        packages/shared/src/schemas/personas.ts
git commit -m "feat(schemas): add Zod schemas for guardrails, archetypes, channel-personas; update persona schema for blank-slate support"
```

---

## Task 10: TDD — compileConstraints + pure fetcher helpers

Write and test the new pure and async functions that power the composition layer.

**Files:**
- Create: `apps/api/src/lib/__tests__/personas-layered.test.ts`
- Modify: `apps/api/src/lib/personas.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/lib/__tests__/personas-layered.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { compileConstraints } from '../personas'

describe('compileConstraints', () => {
  it('returns guardrail rules when no overlay', () => {
    const result = compileConstraints(['rule A', 'rule B'], null)
    expect(result).toEqual(['rule A', 'rule B'])
  })

  it('appends overlay constraints after guardrail rules', () => {
    const overlay = { constraints: ['overlay C'], behavioralAdditions: ['addition D'] }
    const result = compileConstraints(['rule A'], overlay)
    expect(result).toEqual(['rule A', 'overlay C', 'addition D'])
  })

  it('returns empty array when no guardrails and no overlay', () => {
    const result = compileConstraints([], null)
    expect(result).toEqual([])
  })

  it('handles overlay with empty arrays', () => {
    const overlay = { constraints: [], behavioralAdditions: [] }
    const result = compileConstraints(['rule A'], overlay)
    expect(result).toEqual(['rule A'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run apps/api/src/lib/__tests__/personas-layered.test.ts
```

Expected: FAIL — `compileConstraints` is not exported from `../personas`

- [ ] **Step 3: Implement the new functions in personas.ts**

Append to `apps/api/src/lib/personas.ts`:

```typescript
import type { ArchetypeOverlay } from '@brighttale/shared/mappers/db'

/**
 * Fetch all active guardrail rule strings ordered by sort_order.
 * Returns empty array if table is empty or all rules are inactive.
 */
export async function fetchActiveGuardrails(sb: SupabaseClient): Promise<string[]> {
  const { data } = await sb
    .from('persona_guardrails')
    .select('rule_text')
    .eq('is_active', true)
    .order('sort_order')
  return (data ?? []).map((r: { rule_text: string }) => r.rule_text)
}

/**
 * Fetch the behavioral overlay for a given archetype slug.
 * Returns null if archetype not found or not active.
 */
export async function fetchArchetypeOverlay(
  slug: string,
  sb: SupabaseClient,
): Promise<ArchetypeOverlay | null> {
  const { data } = await sb
    .from('persona_archetypes')
    .select('behavioral_overlay_json')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle()
  if (!data) return null
  const raw = data.behavioral_overlay_json as { constraints?: string[]; behavioralAdditions?: string[] } | null
  return {
    constraints: raw?.constraints ?? [],
    behavioralAdditions: raw?.behavioralAdditions ?? [],
  }
}

/**
 * Compile guardrail rules + archetype overlay into a flat constraint list.
 * Pure function — no DB access. Order: guardrails → overlay constraints → overlay additions.
 */
export function compileConstraints(
  guardrailRules: string[],
  overlay: ArchetypeOverlay | null,
): string[] {
  return [
    ...guardrailRules,
    ...(overlay?.constraints ?? []),
    ...(overlay?.behavioralAdditions ?? []),
  ]
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run apps/api/src/lib/__tests__/personas-layered.test.ts
```

Expected: PASS — 4 tests pass

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/personas.ts \
        apps/api/src/lib/__tests__/personas-layered.test.ts
git commit -m "feat(api): add fetchActiveGuardrails, fetchArchetypeOverlay, compileConstraints"
```

---

## Task 11: TDD — buildLayeredPersonaContext

**Files:**
- Modify: `apps/api/src/lib/__tests__/personas-layered.test.ts`
- Modify: `apps/api/src/lib/personas.ts`

- [ ] **Step 1: Add tests for buildLayeredPersonaContext**

Append to `apps/api/src/lib/__tests__/personas-layered.test.ts`:

```typescript
import { vi } from 'vitest'
import { buildLayeredPersonaContext } from '../personas'
import type { Persona } from '@brighttale/shared/types/agents'

const basePersona: Persona = {
  id: 'p1',
  slug: 'test-persona',
  name: 'Test Persona',
  avatarUrl: null,
  bioShort: 'Short bio',
  bioLong: 'Long bio',
  primaryDomain: 'Tech',
  domainLens: 'Analytical',
  approvedCategories: ['tech', 'ai'],
  writingVoiceJson: {
    writingStyle: 'Direct',
    signaturePhrases: ['phrase one'],
    characteristicOpinions: ['opinion one'],
  },
  eeatSignalsJson: {
    analyticalLens: 'Data-driven',
    trustSignals: ['signal one'],
    expertiseClaims: ['claim one'],
  },
  soulJson: {
    values: ['honesty'],
    lifePhilosophy: 'Keep it simple',
    strongOpinions: ['opinion A'],
    petPeeves: ['fluff'],
    humorStyle: 'Dry',
    recurringJokes: [],
    whatExcites: ['new tech'],
    innerTensions: [],
    languageGuardrails: ['no jargon'],
  },
  wpAuthorId: null,
  archetypeSlug: null,
  avatarParamsJson: null,
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

function makeMockSb(guardrailRules: string[], overlayData: unknown) {
  return {
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: overlayData })),
          })),
          order: vi.fn(async () => ({
            data: guardrailRules.map(r => ({ rule_text: r })),
          })),
        })),
        order: vi.fn(async () => ({
          data: guardrailRules.map(r => ({ rule_text: r })),
        })),
      })),
    })),
  } as unknown
}

describe('buildLayeredPersonaContext', () => {
  it('returns context, voice, and empty constraints when no guardrails and no archetype', async () => {
    const sb = makeMockSb([], null)
    const result = await buildLayeredPersonaContext(basePersona, sb as any)
    expect(result.context.name).toBe('Test Persona')
    expect(result.voice.bioShort).toBe('Short bio')
    expect(result.constraints).toEqual([])
  })

  it('includes guardrail rules in constraints', async () => {
    const sb = makeMockSb(['no profanity', 'cite sources'], null)
    const result = await buildLayeredPersonaContext(basePersona, sb as any)
    expect(result.constraints).toContain('no profanity')
    expect(result.constraints).toContain('cite sources')
  })

  it('does not fetch overlay when persona has no archetypeSlug', async () => {
    const sb = makeMockSb([], null)
    const fromSpy = vi.spyOn(sb as any, 'from')
    await buildLayeredPersonaContext(basePersona, sb as any)
    // persona_archetypes should NOT be queried when archetypeSlug is null
    const archetypeCalls = (fromSpy.mock.calls as string[][]).filter(([t]) => t === 'persona_archetypes')
    expect(archetypeCalls).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run apps/api/src/lib/__tests__/personas-layered.test.ts
```

Expected: FAIL — `buildLayeredPersonaContext` is not exported

- [ ] **Step 3: Implement buildLayeredPersonaContext**

Append to `apps/api/src/lib/personas.ts`:

```typescript
/**
 * Layered composition wrapper.
 * Fetches guardrails (Layer 1) and archetype overlay (Layer 2) from DB,
 * then builds persona context and voice (Layer 3) using existing pure functions.
 * Returns all three for injection into agent prompts.
 */
export async function buildLayeredPersonaContext(
  persona: Persona,
  sb: SupabaseClient,
): Promise<{ context: PersonaContext; voice: PersonaVoice; constraints: string[] }> {
  const [guardrailRules, overlay] = await Promise.all([
    fetchActiveGuardrails(sb),
    persona.archetypeSlug ? fetchArchetypeOverlay(persona.archetypeSlug, sb) : Promise.resolve(null),
  ])

  const context = buildPersonaContext(persona)
  const voice = buildPersonaVoice(persona)
  const constraints = compileConstraints(guardrailRules, overlay)

  return { context, voice, constraints }
}
```

- [ ] **Step 4: Run all persona tests**

```bash
npx vitest run apps/api/src/lib/__tests__/personas-layered.test.ts
```

Expected: PASS — all tests pass

- [ ] **Step 5: Run full test suite to check no regressions**

```bash
npm run test:api
```

Expected: all existing tests pass

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/lib/personas.ts \
        apps/api/src/lib/__tests__/personas-layered.test.ts
git commit -m "feat(api): implement buildLayeredPersonaContext — 3-layer composition pipeline"
```

---

## Task 12: Wire buildLayeredPersonaContext into production-generate.ts

Replace the two separate `buildPersonaContext` / `buildPersonaVoice` calls in the production job with a single `buildLayeredPersonaContext` call. Inject `constraints` into the system prompts of both agent calls.

**Files:**
- Modify: `apps/api/src/jobs/production-generate.ts`

- [ ] **Step 1: Add import**

At the top of `apps/api/src/jobs/production-generate.ts`, update the persona import line:

```typescript
// Before:
import { loadPersonaForDraft, buildPersonaContext, buildPersonaVoice } from '@/lib/personas'

// After:
import {
  loadPersonaForDraft,
  buildPersonaContext,
  buildPersonaVoice,
  buildLayeredPersonaContext,
} from '@/lib/personas'
```

- [ ] **Step 2: Add a helper to format constraints as a prompt block**

After the imports, add:

```typescript
function formatConstraintsBlock(constraints: string[]): string {
  if (constraints.length === 0) return ''
  const lines = constraints.map(c => `- ${c}`).join('\n')
  return `## Content Constraints\nThe following rules are non-negotiable and override all other instructions:\n${lines}\n\n`
}
```

- [ ] **Step 3: Add load-persona-constraints step after load-persona**

Find the `load-persona` step (around line 78). After its closing `)) as ...` line, add a new step:

```typescript
      const layeredPersona = (await step.run('load-persona-constraints', async () => {
        if (!persona) return null
        return buildLayeredPersonaContext(persona, sb)
      })) as Awaited<ReturnType<typeof buildLayeredPersonaContext>> | null
```

- [ ] **Step 4: Update generate-core step to inject constraints**

Find the `generate-core` step (around line 116). Update the `generateWithFallback` call to prepend constraints to the system prompt:

```typescript
        const call = await generateWithFallback(
          'production',
          modelTier,
          {
            agentType: 'production',
            systemPrompt: layeredPersona?.constraints.length
              ? `${formatConstraintsBlock(layeredPersona.constraints)}${coreSystemPrompt ?? ''}`
              : coreSystemPrompt ?? '',
            userMessage,
          },
```

Also update `personaContext` in `buildCanonicalCoreMessage`:

```typescript
          personaContext: layeredPersona?.context ?? null,
```

- [ ] **Step 5: Update produce step to inject constraints**

Find the produce `generateWithFallback` call (around line 202). Apply the same system prompt pattern and update persona reference:

```typescript
        const call = await generateWithFallback(
          'production',
          modelTier,
          {
            agentType: 'production',
            systemPrompt: layeredPersona?.constraints.length
              ? `${formatConstraintsBlock(layeredPersona.constraints)}${produceSystemPrompt ?? ''}`
              : produceSystemPrompt ?? '',
            userMessage,
          },
```

And in `buildProduceMessage`:

```typescript
          persona: layeredPersona?.voice ?? null,
```

- [ ] **Step 6: Verify typecheck**

```bash
npm run typecheck --workspace=apps/api
```

Expected: no errors

- [ ] **Step 7: Run full test suite**

```bash
npm run test:api
```

Expected: all tests pass

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/jobs/production-generate.ts
git commit -m "feat(api): wire buildLayeredPersonaContext into production job — constraints injected into system prompts"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| `persona_guardrails` table | Task 3 |
| `persona_archetypes` table | Task 4 |
| `channel_personas` junction table | Task 5 |
| `archetype_slug` + `avatar_params_json` on personas | Task 6 |
| `DbContentDraft` persona_id fix | Task 1 |
| `Persona` interface extended | Task 2 |
| Mappers for new tables | Task 8 |
| Zod schemas for new tables | Task 9 |
| `fetchActiveGuardrails` | Task 10 |
| `fetchArchetypeOverlay` | Task 10 |
| `compileConstraints` | Task 10 |
| `buildLayeredPersonaContext` | Task 11 |
| Wire into production job | Task 12 |
| JSONB default values for blank-slate | Task 9 Step 4 |
| Non-breaking: existing PersonaContext/PersonaVoice unchanged | Task 11 |
| `behavioral_overlay_json` never in public mapper | Task 8 Step 2 |

**No gaps found.**

**Placeholder scan:** No TBD/TODO found. All steps include exact code.

**Type consistency check:**
- `ArchetypeOverlay` defined in Task 8, imported in Task 10 ✅
- `buildLayeredPersonaContext` return type `{ context: PersonaContext; voice: PersonaVoice; constraints: string[] }` consistent across Task 11 and Task 12 ✅
- `formatConstraintsBlock(constraints: string[])` matches `constraints: string[]` from `buildLayeredPersonaContext` ✅
- `layeredPersona?.context` / `layeredPersona?.voice` match field names in return type ✅
