# Persona System — Plan 2: Admin Layer

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build admin-only API routes for managing persona guardrails and archetypes, plus the admin UI pages under Settings → Agents → Personas.

**Architecture:** Two new Fastify route files (`admin-persona-guardrails.ts`, `admin-persona-archetypes.ts`) registered under `/agents/personas/*`. Admin role is verified inline using the existing `user_roles` table pattern from `apps/api/src/routes/agents.ts:81-92`. Admin UI lives in `apps/app/src/app/[locale]/(app)/settings/agents/personas/` with two sub-pages. No new middleware needed.

**Tech Stack:** Fastify, TypeScript, Zod, Supabase, Next.js App Router, shadcn/ui, Tailwind CSS 4

**Prerequisite:** Plan 1 (Foundation) must be complete — schemas and mappers for `persona_guardrails` and `persona_archetypes` must exist.

---

## Spec reference

`docs/superpowers/specs/2026-04-23-persona-system-redesign.md` — Admin Experience section

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Create | `apps/api/src/routes/admin-persona-guardrails.ts` | Admin CRUD for `persona_guardrails` |
| Create | `apps/api/src/routes/admin-persona-archetypes.ts` | Admin CRUD for `persona_archetypes` |
| Modify | `apps/api/src/index.ts` | Register two new admin route plugins |
| Create | `apps/api/src/routes/__tests__/admin-persona-guardrails.test.ts` | Route unit tests |
| Create | `apps/api/src/routes/__tests__/admin-persona-archetypes.test.ts` | Route unit tests |
| Create | `apps/app/src/app/[locale]/(app)/settings/agents/personas/guardrails/page.tsx` | Guardrails editor UI |
| Create | `apps/app/src/app/[locale]/(app)/settings/agents/personas/archetypes/page.tsx` | Archetypes manager UI |
| Create | `apps/app/src/components/admin/GuardrailsEditor.tsx` | Guardrails table + inline edit component |
| Create | `apps/app/src/components/admin/ArchetypesManager.tsx` | Archetypes card grid + edit component |

---

## Admin role check pattern

Used in every mutating handler. Copy this exact block — do not invent a new pattern:

```typescript
if (!request.userId) {
  return reply.status(401).send({ data: null, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } })
}
const sb = createServiceClient()
const { data: role } = await sb
  .from('user_roles')
  .select('role')
  .eq('user_id', request.userId)
  .eq('role', 'admin')
  .maybeSingle()
if (!role) {
  return reply.status(403).send({ data: null, error: { code: 'FORBIDDEN', message: 'Admin role required' } })
}
```

---

## Task 1: Admin route — persona guardrails CRUD

**Files:**
- Create: `apps/api/src/routes/admin-persona-guardrails.ts`
- Create: `apps/api/src/routes/__tests__/admin-persona-guardrails.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/api/src/routes/__tests__/admin-persona-guardrails.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'

describe('admin persona guardrails route', () => {
  it('exports adminPersonaGuardrailsRoutes function', async () => {
    const mod = await import('../admin-persona-guardrails.js')
    expect(typeof mod.adminPersonaGuardrailsRoutes).toBe('function')
  })
})
```

- [ ] **Step 2: Run test to verify fail**

```bash
npx vitest run apps/api/src/routes/__tests__/admin-persona-guardrails.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Create the route file**

Create `apps/api/src/routes/admin-persona-guardrails.ts`:

```typescript
import type { FastifyInstance } from 'fastify'
import { authenticate } from '../middleware/authenticate.js'
import { createServiceClient } from '../lib/supabase/index.js'
import { ApiError } from '../lib/api/errors.js'
import {
  mapPersonaGuardrailFromDb,
  mapPersonaGuardrailToDb,
  type DbPersonaGuardrail,
} from '@brighttale/shared/mappers/db'
import {
  createGuardrailSchema,
  updateGuardrailSchema,
  toggleGuardrailSchema,
} from '@brighttale/shared/schemas/persona-guardrails'

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

export async function adminPersonaGuardrailsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // GET / — list all guardrails (all categories, all active states)
  app.get('/', async (req, reply) => {
    const sb = createServiceClient()
    const { data, error } = await sb
      .from('persona_guardrails')
      .select('*')
      .order('category')
      .order('sort_order')
    if (error) throw new ApiError(500, error.message, 'GUARDRAILS_FETCH_ERROR')
    return reply.send({ data: (data ?? []).map(r => mapPersonaGuardrailFromDb(r as DbPersonaGuardrail)), error: null })
  })

  // POST / — create guardrail (admin only)
  app.post('/', async (req, reply) => {
    const sb = createServiceClient()
    const denied = await assertAdmin(req, reply, sb)
    if (denied) return
    const body = createGuardrailSchema.parse(req.body)
    const { data, error } = await sb
      .from('persona_guardrails')
      .insert(mapPersonaGuardrailToDb({ ...body }))
      .select()
      .single()
    if (error) throw new ApiError(500, error.message, 'GUARDRAIL_CREATE_ERROR')
    return reply.status(201).send({ data: mapPersonaGuardrailFromDb(data as DbPersonaGuardrail), error: null })
  })

  // PUT /:id — full update (admin only)
  app.put('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const sb = createServiceClient()
    const denied = await assertAdmin(req, reply, sb)
    if (denied) return
    const body = updateGuardrailSchema.parse(req.body)
    const { data, error } = await sb
      .from('persona_guardrails')
      .update(mapPersonaGuardrailToDb(body))
      .eq('id', id)
      .select()
      .single()
    if (error) throw new ApiError(500, error.message, 'GUARDRAIL_UPDATE_ERROR')
    if (!data) throw new ApiError(404, 'Guardrail not found', 'GUARDRAIL_NOT_FOUND')
    return reply.send({ data: mapPersonaGuardrailFromDb(data as DbPersonaGuardrail), error: null })
  })

  // PATCH /:id — toggle is_active (admin only)
  app.patch('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const sb = createServiceClient()
    const denied = await assertAdmin(req, reply, sb)
    if (denied) return
    const body = toggleGuardrailSchema.parse(req.body)
    const { data, error } = await sb
      .from('persona_guardrails')
      .update({ is_active: body.isActive })
      .eq('id', id)
      .select()
      .single()
    if (error) throw new ApiError(500, error.message, 'GUARDRAIL_UPDATE_ERROR')
    if (!data) throw new ApiError(404, 'Guardrail not found', 'GUARDRAIL_NOT_FOUND')
    return reply.send({ data: mapPersonaGuardrailFromDb(data as DbPersonaGuardrail), error: null })
  })

  // DELETE /:id (admin only)
  app.delete('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const sb = createServiceClient()
    const denied = await assertAdmin(req, reply, sb)
    if (denied) return
    const { error } = await sb.from('persona_guardrails').delete().eq('id', id)
    if (error) throw new ApiError(500, error.message, 'GUARDRAIL_DELETE_ERROR')
    return reply.status(204).send()
  })
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
npx vitest run apps/api/src/routes/__tests__/admin-persona-guardrails.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/admin-persona-guardrails.ts \
        apps/api/src/routes/__tests__/admin-persona-guardrails.test.ts
git commit -m "feat(api): admin CRUD routes for persona guardrails"
```

---

## Task 2: Admin route — persona archetypes CRUD

**Files:**
- Create: `apps/api/src/routes/admin-persona-archetypes.ts`
- Create: `apps/api/src/routes/__tests__/admin-persona-archetypes.test.ts`

- [ ] **Step 1: Write failing test**

Create `apps/api/src/routes/__tests__/admin-persona-archetypes.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'

describe('admin persona archetypes route', () => {
  it('exports adminPersonaArchetypesRoutes function', async () => {
    const mod = await import('../admin-persona-archetypes.js')
    expect(typeof mod.adminPersonaArchetypesRoutes).toBe('function')
  })
})
```

- [ ] **Step 2: Run test to verify fail**

```bash
npx vitest run apps/api/src/routes/__tests__/admin-persona-archetypes.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Create the route file**

Create `apps/api/src/routes/admin-persona-archetypes.ts`:

```typescript
import type { FastifyInstance } from 'fastify'
import { authenticate } from '../middleware/authenticate.js'
import { createServiceClient } from '../lib/supabase/index.js'
import { ApiError } from '../lib/api/errors.js'
import {
  mapPersonaArchetypeAdmin,
  mapPersonaArchetypePublic,
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
      .insert({ ...dbInput, slug: body.slug })
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
```

- [ ] **Step 4: Run test to verify pass**

```bash
npx vitest run apps/api/src/routes/__tests__/admin-persona-archetypes.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/admin-persona-archetypes.ts \
        apps/api/src/routes/__tests__/admin-persona-archetypes.test.ts
git commit -m "feat(api): admin CRUD routes for persona archetypes"
```

---

## Task 3: Register admin routes in index.ts

**Files:**
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Add imports**

In `apps/api/src/index.ts`, after the `personasRoutes` import line (line 56), add:

```typescript
import { adminPersonaGuardrailsRoutes } from "./routes/admin-persona-guardrails.js";
import { adminPersonaArchetypesRoutes } from "./routes/admin-persona-archetypes.js";
```

- [ ] **Step 2: Register routes**

After `server.register(personasRoutes, { prefix: "/personas" })` (line 198), add:

```typescript
server.register(adminPersonaGuardrailsRoutes, { prefix: "/agents/personas/guardrails" });
server.register(adminPersonaArchetypesRoutes, { prefix: "/agents/personas/archetypes" });
```

- [ ] **Step 3: Verify typecheck**

```bash
npm run typecheck --workspace=apps/api
```

Expected: no errors

- [ ] **Step 4: Start API and smoke-test**

```bash
npm run dev:api
```

In a second terminal:

```bash
curl -s http://localhost:3001/agents/personas/guardrails \
  -H "x-internal-key: $INTERNAL_API_KEY" | jq .
```

Expected: `{ "data": [], "error": null }`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/index.ts
git commit -m "feat(api): register admin persona guardrails and archetypes routes"
```

---

## Task 4: Admin UI — Guardrails Editor page

**Files:**
- Create: `apps/app/src/components/admin/GuardrailsEditor.tsx`
- Create: `apps/app/src/app/[locale]/(app)/settings/agents/personas/guardrails/page.tsx`

- [ ] **Step 1: Create GuardrailsEditor component**

Create `apps/app/src/components/admin/GuardrailsEditor.tsx`:

```tsx
'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, Plus, Trash2 } from 'lucide-react'

type Category = 'content_boundaries' | 'tone_constraints' | 'factual_rules' | 'behavioral_rules'

interface Guardrail {
  id: string
  category: Category
  label: string
  ruleText: string
  isActive: boolean
  sortOrder: number
}

const CATEGORIES: Category[] = ['content_boundaries', 'tone_constraints', 'factual_rules', 'behavioral_rules']
const CATEGORY_LABELS: Record<Category, string> = {
  content_boundaries: 'Content Boundaries',
  tone_constraints: 'Tone Constraints',
  factual_rules: 'Factual Rules',
  behavioral_rules: 'Behavioral Rules',
}

export function GuardrailsEditor() {
  const [guardrails, setGuardrails] = useState<Guardrail[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Category>('content_boundaries')
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/agents/personas/guardrails')
      .then(r => r.json())
      .then(({ data }) => setGuardrails(data ?? []))
      .finally(() => setLoading(false))
  }, [])

  async function handleToggle(id: string, isActive: boolean) {
    setSaving(id)
    await fetch(`/api/agents/personas/guardrails/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive }),
    })
    setGuardrails(prev => prev.map(g => g.id === id ? { ...g, isActive } : g))
    setSaving(null)
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this guardrail?')) return
    await fetch(`/api/agents/personas/guardrails/${id}`, { method: 'DELETE' })
    setGuardrails(prev => prev.filter(g => g.id !== id))
  }

  async function handleAdd() {
    const res = await fetch('/api/agents/personas/guardrails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: activeTab,
        label: 'New rule',
        ruleText: '',
        isActive: true,
        sortOrder: guardrails.filter(g => g.category === activeTab).length,
      }),
    })
    const { data } = await res.json()
    if (data) setGuardrails(prev => [...prev, data])
  }

  async function handleSave(g: Guardrail) {
    setSaving(g.id)
    await fetch(`/api/agents/personas/guardrails/${g.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: g.category, label: g.label, ruleText: g.ruleText, isActive: g.isActive, sortOrder: g.sortOrder }),
    })
    setSaving(null)
  }

  const filtered = guardrails.filter(g => g.category === activeTab)

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>

  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b pb-2">
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveTab(cat)}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${activeTab === cat ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
          >
            {CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {filtered.map(g => (
          <div key={g.id} className="border rounded-lg p-4 space-y-3 bg-card">
            <div className="flex items-center gap-3">
              <Switch
                checked={g.isActive}
                onCheckedChange={v => handleToggle(g.id, v)}
                disabled={saving === g.id}
              />
              <Input
                value={g.label}
                onChange={e => setGuardrails(prev => prev.map(r => r.id === g.id ? { ...r, label: e.target.value } : r))}
                placeholder="Rule label"
                className="flex-1 h-8 text-sm font-medium"
              />
              <Button size="sm" variant="ghost" onClick={() => handleDelete(g.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
            <Textarea
              value={g.ruleText}
              onChange={e => setGuardrails(prev => prev.map(r => r.id === g.id ? { ...r, ruleText: e.target.value } : r))}
              placeholder="Rule text injected into agent prompt..."
              className="text-sm font-mono min-h-[80px]"
            />
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={() => handleSave(g)} disabled={saving === g.id}>
                {saving === g.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                Save
              </Button>
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">No rules in this category yet.</p>
        )}
      </div>

      <Button size="sm" variant="outline" onClick={handleAdd} className="w-full">
        <Plus className="h-4 w-4 mr-1" /> Add Rule
      </Button>
    </div>
  )
}
```

- [ ] **Step 2: Create guardrails page**

Create `apps/app/src/app/[locale]/(app)/settings/agents/personas/guardrails/page.tsx`:

```tsx
import { GuardrailsEditor } from '@/components/admin/GuardrailsEditor'

export default function PersonaGuardrailsPage() {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Persona Guardrails</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Global behavioral constraints applied silently to all personas. Users never see these rules.
        </p>
      </div>
      <GuardrailsEditor />
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/app/src/components/admin/GuardrailsEditor.tsx \
        "apps/app/src/app/[locale]/(app)/settings/agents/personas/guardrails/page.tsx"
git commit -m "feat(app): admin guardrails editor UI"
```

---

## Task 5: Admin UI — Archetypes Manager page

**Files:**
- Create: `apps/app/src/components/admin/ArchetypesManager.tsx`
- Create: `apps/app/src/app/[locale]/(app)/settings/agents/personas/archetypes/page.tsx`

- [ ] **Step 1: Create ArchetypesManager component**

Create `apps/app/src/components/admin/ArchetypesManager.tsx`:

```tsx
'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, Plus, ChevronDown, ChevronUp, Eye } from 'lucide-react'

interface ArchetypeOverlay {
  constraints: string[]
  behavioralAdditions: string[]
}

interface Archetype {
  id: string
  slug: string
  name: string
  description: string
  icon: string
  defaultFieldsJson: Record<string, unknown>
  behavioralOverlayJson: ArchetypeOverlay
  sortOrder: number
  isActive: boolean
}

export function ArchetypesManager() {
  const [archetypes, setArchetypes] = useState<Archetype[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/agents/personas/archetypes')
      .then(r => r.json())
      .then(({ data }) => setArchetypes(data ?? []))
      .finally(() => setLoading(false))
  }, [])

  async function handleToggle(id: string, isActive: boolean) {
    await fetch(`/api/agents/personas/archetypes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive }),
    })
    setArchetypes(prev => prev.map(a => a.id === id ? { ...a, isActive } : a))
  }

  async function handleSave(a: Archetype) {
    setSaving(a.id)
    await fetch(`/api/agents/personas/archetypes/${a.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: a.name,
        description: a.description,
        icon: a.icon,
        behavioralOverlayJson: a.behavioralOverlayJson,
        sortOrder: a.sortOrder,
        isActive: a.isActive,
      }),
    })
    setSaving(null)
  }

  async function handleCreate() {
    const slug = `archetype-${Date.now()}`
    const res = await fetch('/api/agents/personas/archetypes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug,
        name: 'New Archetype',
        description: '',
        icon: '',
        defaultFieldsJson: {},
        behavioralOverlayJson: { constraints: [], behavioralAdditions: [] },
        sortOrder: archetypes.length,
        isActive: false,
      }),
    })
    const { data } = await res.json()
    if (data) {
      setArchetypes(prev => [...prev, data])
      setExpanded(data.id)
    }
  }

  function updateOverlayField(id: string, field: keyof ArchetypeOverlay, value: string) {
    const lines = value.split('\n').filter(Boolean)
    setArchetypes(prev => prev.map(a =>
      a.id === id
        ? { ...a, behavioralOverlayJson: { ...a.behavioralOverlayJson, [field]: lines } }
        : a
    ))
  }

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>

  return (
    <div className="space-y-4">
      {archetypes.map(a => (
        <Card key={a.id} className={a.isActive ? '' : 'opacity-60'}>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-3">
              <Switch checked={a.isActive} onCheckedChange={v => handleToggle(a.id, v)} />
              <Input
                value={a.name}
                onChange={e => setArchetypes(prev => prev.map(r => r.id === a.id ? { ...r, name: e.target.value } : r))}
                className="h-8 font-semibold flex-1"
              />
              <Badge variant="outline" className="font-mono text-xs">{a.slug}</Badge>
              <button onClick={() => setExpanded(expanded === a.id ? null : a.id)}>
                {expanded === a.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            </div>
          </CardHeader>

          {expanded === a.id && (
            <CardContent className="space-y-4 pt-0">
              <Input
                value={a.description}
                onChange={e => setArchetypes(prev => prev.map(r => r.id === a.id ? { ...r, description: e.target.value } : r))}
                placeholder="Description shown to users on archetype picker"
              />

              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                  Hidden overlay — not visible to users
                </p>
                <div className="space-y-2 border rounded-md p-3 bg-muted/30">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Constraints (one per line)</p>
                    <Textarea
                      value={a.behavioralOverlayJson.constraints.join('\n')}
                      onChange={e => updateOverlayField(a.id, 'constraints', e.target.value)}
                      placeholder="Always cite sources&#10;Never use first-person..."
                      className="font-mono text-xs min-h-[80px]"
                    />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Behavioral additions (one per line)</p>
                    <Textarea
                      value={a.behavioralOverlayJson.behavioralAdditions.join('\n')}
                      onChange={e => updateOverlayField(a.id, 'behavioralAdditions', e.target.value)}
                      placeholder="Lead with data&#10;Prefer concrete examples..."
                      className="font-mono text-xs min-h-[80px]"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <Button size="sm" onClick={() => handleSave(a)} disabled={saving === a.id}>
                  {saving === a.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                  Save
                </Button>
              </div>
            </CardContent>
          )}
        </Card>
      ))}

      {archetypes.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">No archetypes yet.</p>
      )}

      <Button variant="outline" onClick={handleCreate} className="w-full">
        <Plus className="h-4 w-4 mr-1" /> New Archetype
      </Button>
    </div>
  )
}
```

- [ ] **Step 2: Create archetypes page**

Create `apps/app/src/app/[locale]/(app)/settings/agents/personas/archetypes/page.tsx`:

```tsx
import { ArchetypesManager } from '@/components/admin/ArchetypesManager'

export default function PersonaArchetypesPage() {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Persona Archetypes</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Platform-defined starting points for persona creation. Default fields are shown to users; behavioral overlays are hidden.
        </p>
      </div>
      <ArchetypesManager />
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/app/src/components/admin/ArchetypesManager.tsx \
        "apps/app/src/app/[locale]/(app)/settings/agents/personas/archetypes/page.tsx"
git commit -m "feat(app): admin archetypes manager UI"
```

---

## Task 6: Add personas nav link to agents settings page

Extend the existing agents settings page to show Personas as a subsection in the sidebar.

**Files:**
- Modify: `apps/app/src/app/[locale]/(app)/settings/agents/page.tsx`

- [ ] **Step 1: Add Personas section link**

In `apps/app/src/app/[locale]/(app)/settings/agents/page.tsx`, add at the top of the returned JSX, before the agents list:

```tsx
import Link from 'next/link'
import { Shield, Layers } from 'lucide-react'

// Add after the <h1>/<p> block, before the grid:
<div className="flex gap-3 pb-4 border-b">
  <Link
    href={`/${params.locale}/settings/agents/personas/guardrails`}
    className="flex items-center gap-2 px-3 py-2 text-sm rounded-md border hover:bg-muted transition-colors"
  >
    <Shield className="h-4 w-4" />
    Guardrails
  </Link>
  <Link
    href={`/${params.locale}/settings/agents/personas/archetypes`}
    className="flex items-center gap-2 px-3 py-2 text-sm rounded-md border hover:bg-muted transition-colors"
  >
    <Layers className="h-4 w-4" />
    Archetypes
  </Link>
</div>
```

Note: the page uses `params.locale` — if the page component doesn't receive `params`, use `useParams()` or hardcode as `/settings/agents/personas/guardrails` (the rewrite handles locale).

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck --workspace=apps/app
```

Expected: no errors

- [ ] **Step 3: Start app and verify pages load**

```bash
npm run dev
```

Navigate to `/settings/agents` — should see Guardrails and Archetypes links. Click each — pages should load without error.

- [ ] **Step 4: Commit**

```bash
git add "apps/app/src/app/[locale]/(app)/settings/agents/page.tsx"
git commit -m "feat(app): add Personas subsection links to agents settings page"
```

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| Guardrails editor — category tabs, inline edit, toggle, delete | Task 4 |
| Archetypes manager — card editor, hidden overlay textarea | Task 5 |
| Admin routes under `/agents/personas/` | Task 3 |
| Admin role check (user_roles table) | Tasks 1, 2 |
| `behavioral_overlay_json` never in public response | Task 2 (GET uses `mapPersonaArchetypeAdmin` — but only admin can hit these routes) |
| Personas subsection under Agents nav | Task 6 |

**Placeholder scan:** No TBD/TODO. All fetch calls use actual endpoints. All component logic is complete.

**Type consistency:**
- `Archetype.behavioralOverlayJson: ArchetypeOverlay` matches `DomainPersonaArchetypeAdmin.behavioralOverlayJson: ArchetypeOverlay` from Plan 1 ✅
- `Guardrail.ruleText` matches `DomainPersonaGuardrail.ruleText` from Plan 1 ✅
- Route prefixes in Task 3 match URLs used in component fetch calls in Tasks 4, 5 ✅
