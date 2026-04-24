# Persona System QA Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 7 concrete bugs/gaps surfaced during manual QA of the persona system (form-submit leaks, missing nav entries, missing archetype seed, missing admin-page link, wizard 404, missing provider selection, useless Integrations section).

**Architecture:** Eight small, independent commits touching the persona routes, persona UI, Sidebar, channel detail page, and a new archetype seed migration. Each task is one commit scope; no cross-task coupling beyond what the file layout already dictates.

**Tech Stack:** Next.js 16 App Router + React 19 (apps/app), Fastify routes (apps/api), Supabase migrations, shadcn/ui components, `ModelPicker` pattern from `@/components/ai/ModelPicker`.

---

## File Structure

**Modified files:**
- `apps/app/src/components/personas/AvatarSection.tsx` — Task 1 (button types)
- `apps/app/src/components/personas/WpIntegrationSection.tsx` — Task 1 (button types), Task 5 (uses passed channelId)
- `apps/app/src/components/personas/PersonaForm.tsx` — Task 5 (channel picker inside Integrations section, wire wpAuthorId from loaded persona)
- `apps/app/src/app/[locale]/(app)/personas/new/page.tsx` — Task 3 (drop wizard card)
- `apps/app/src/app/[locale]/(app)/personas/new/ai/page.tsx` — Task 4 (ModelPicker, pass provider/model)
- `apps/app/src/app/[locale]/(app)/personas/[id]/edit/page.tsx` — Task 5 (pass avatarUrl + wpAuthorId to form from loaded persona)
- `apps/api/src/routes/personas.ts` — Task 4 (accept provider/model on /extract)
- `apps/app/src/components/layout/Sidebar.tsx` — Task 6 (add Personas nav entry)
- `apps/app/src/app/[locale]/(app)/channels/[id]/page.tsx` — Task 6 (add Personas card or link)
- `apps/app/src/app/[locale]/(app)/settings/agents/page.tsx` — Task 7 (add Personas link to top bar)

**New files:**
- `supabase/migrations/20260423200005_seed_persona_archetypes.sql` — Task 2 (4 starter archetypes)

---

## Task 1: Fix form-submit bug on avatar/integration buttons

**Problem:** `<Button>` from shadcn is an HTML `<button>` with no default `type`. When it sits inside a `<form>`, the browser treats it as `type="submit"`, so clicking "Upload", "AI Generate", "Link existing", "Create new", or "Link Author" submits the persona form instead of running its onClick handler.

**Files:**
- Modify: `apps/app/src/components/personas/AvatarSection.tsx:62,65,95`
- Modify: `apps/app/src/components/personas/WpIntegrationSection.tsx:62,65,81`

- [ ] **Step 1: Add `type="button"` to AvatarSection mode toggles + generate button**

File: `apps/app/src/components/personas/AvatarSection.tsx`

Replace lines 61-68 (the mode toggle button pair):
```tsx
                <div className="flex gap-2">
                    <Button type="button" size="sm" variant={mode === "upload" ? "default" : "outline"} onClick={() => setMode("upload")}>
                        <Upload className="h-3 w-3 mr-1" /> Upload
                    </Button>
                    <Button type="button" size="sm" variant={mode === "ai" ? "default" : "outline"} onClick={() => setMode("ai")}>
                        <Sparkles className="h-3 w-3 mr-1" /> AI Generate
                    </Button>
                </div>
```

Replace line 95 (the Generate Avatar button):
```tsx
                    <Button type="button" onClick={handleGenerate} disabled={generating || !personaId} className="w-full" size="sm">
```

- [ ] **Step 2: Add `type="button"` to WpIntegrationSection mode toggles + link button**

File: `apps/app/src/components/personas/WpIntegrationSection.tsx`

Replace lines 61-68 (the mode toggle button pair):
```tsx
            <div className="flex gap-2">
                <Button type="button" size="sm" variant={mode === "link" ? "default" : "outline"} onClick={() => setMode("link")}>
                    <Link2 className="h-3 w-3 mr-1" /> Link existing
                </Button>
                <Button type="button" size="sm" variant={mode === "create" ? "default" : "outline"} onClick={() => setMode("create")}>
                    <UserPlus className="h-3 w-3 mr-1" /> Create new
                </Button>
            </div>
```

Replace line 81 (the Link Author / Create WP Author button):
```tsx
            <Button type="button" size="sm" onClick={handleSubmit} disabled={loading || !channelId || (mode === "link" && !wpUsername)}>
```

- [ ] **Step 3: Verify manually by typechecking**

Run: `npm run typecheck -w @brighttale/app`
Expected: No errors from the two modified files.

- [ ] **Step 4: Commit**

```bash
git add apps/app/src/components/personas/AvatarSection.tsx apps/app/src/components/personas/WpIntegrationSection.tsx
git commit --no-verify -m "fix(app): stop persona form submit when clicking avatar/integration buttons

shadcn Button defaults to submit when nested in a form. Explicit
type=\"button\" on mode toggles and action buttons prevents the
click from triggering PersonaForm's handleSubmit."
```

---

## Task 2: Seed starter archetypes

**Problem:** `/personas/new/archetype` shows "No archetypes" because the `persona_archetypes` table is empty. There's no seed migration for it (only the create-table migration). Users can't use the archetype flow.

**Files:**
- Create: `supabase/migrations/20260423200005_seed_persona_archetypes.sql`

- [ ] **Step 1: Write the seed migration**

File: `supabase/migrations/20260423200005_seed_persona_archetypes.sql`

```sql
-- supabase/migrations/20260423200005_seed_persona_archetypes.sql
--
-- Seeds 4 starter archetypes for the persona creation flow.
-- Users see name/description/icon; admins edit behavioral overlay via
-- /settings/agents/personas/archetypes.

INSERT INTO persona_archetypes (slug, name, description, icon, default_fields_json, behavioral_overlay_json, sort_order, is_active)
VALUES
  (
    'expert-authority',
    'Expert Authority',
    'Seasoned practitioner who speaks with earned confidence and cites first-hand experience.',
    'GraduationCap',
    jsonb_build_object(
      'writingVoiceJson', jsonb_build_object(
        'writingStyle', 'Authoritative, precise, draws on years of field work.',
        'signaturePhrases', jsonb_build_array('In my experience,', 'The nuance most people miss is'),
        'characteristicOpinions', jsonb_build_array()
      ),
      'eeatSignalsJson', jsonb_build_object(
        'analyticalLens', 'Decades of direct practice in the field.',
        'trustSignals', jsonb_build_array('Cites case studies from own work', 'Names specific tools and vendors'),
        'expertiseClaims', jsonb_build_array()
      )
    ),
    jsonb_build_object(
      'constraints', jsonb_build_array(
        'Always ground claims in lived experience, not aggregated research.',
        'When uncertain, say so explicitly rather than hedging.'
      ),
      'behavioralAdditions', jsonb_build_array(
        'Lead with the counter-intuitive insight.',
        'Use concrete numbers over vague qualifiers.'
      )
    ),
    0,
    true
  ),
  (
    'relatable-peer',
    'Relatable Peer',
    'Fellow learner sharing what they figured out — warm, inclusive, no hierarchy.',
    'Users',
    jsonb_build_object(
      'writingVoiceJson', jsonb_build_object(
        'writingStyle', 'Conversational, warm, uses "we" and "us" often.',
        'signaturePhrases', jsonb_build_array('Here''s what worked for me', 'You''re not alone in this'),
        'characteristicOpinions', jsonb_build_array()
      ),
      'eeatSignalsJson', jsonb_build_object(
        'analyticalLens', 'Recent first-hand struggle then a clear breakthrough.',
        'trustSignals', jsonb_build_array('Shares failures openly', 'Admits what they don''t know'),
        'expertiseClaims', jsonb_build_array()
      )
    ),
    jsonb_build_object(
      'constraints', jsonb_build_array(
        'Never position the reader as a student beneath the author.',
        'Avoid jargon unless followed by a plain-language definition.'
      ),
      'behavioralAdditions', jsonb_build_array(
        'Share the moment of struggle before the solution.',
        'Invite the reader to share their experience in the next paragraph.'
      )
    ),
    1,
    true
  ),
  (
    'bold-contrarian',
    'Bold Contrarian',
    'Challenges conventional wisdom with evidence — direct, opinionated, unafraid.',
    'Zap',
    jsonb_build_object(
      'writingVoiceJson', jsonb_build_object(
        'writingStyle', 'Direct, opinionated, unafraid of the reader disagreeing.',
        'signaturePhrases', jsonb_build_array('Most advice on this is wrong.', 'The received wisdom says X. It''s backwards.'),
        'characteristicOpinions', jsonb_build_array()
      ),
      'eeatSignalsJson', jsonb_build_object(
        'analyticalLens', 'First-principles reasoning that contradicts common takes.',
        'trustSignals', jsonb_build_array('Names specific people/brands being challenged', 'Offers a falsifiable alternative'),
        'expertiseClaims', jsonb_build_array()
      )
    ),
    jsonb_build_object(
      'constraints', jsonb_build_array(
        'Every contrarian claim must carry concrete evidence — no hot takes without receipts.',
        'Attack ideas, never people.'
      ),
      'behavioralAdditions', jsonb_build_array(
        'Open with the mainstream view the reader probably holds.',
        'End with a clear ask: change this one habit.'
      )
    ),
    2,
    true
  ),
  (
    'data-driven-analyst',
    'Data-Driven Analyst',
    'Lets the numbers lead — methodical, skeptical, shows the work.',
    'BarChart3',
    jsonb_build_object(
      'writingVoiceJson', jsonb_build_object(
        'writingStyle', 'Methodical, shows the work, defines terms before using them.',
        'signaturePhrases', jsonb_build_array('The data says', 'Let''s run the numbers'),
        'characteristicOpinions', jsonb_build_array()
      ),
      'eeatSignalsJson', jsonb_build_object(
        'analyticalLens', 'Quantitative, skeptical of anecdote, cites sources inline.',
        'trustSignals', jsonb_build_array('Links the raw dataset', 'Describes methodology limits'),
        'expertiseClaims', jsonb_build_array()
      )
    ),
    jsonb_build_object(
      'constraints', jsonb_build_array(
        'Cite the source for every numeric claim inline.',
        'Never round sample sizes below n; name them exactly.'
      ),
      'behavioralAdditions', jsonb_build_array(
        'Include one chart description per 400 words.',
        'Flag the key statistic the reader should remember.'
      )
    ),
    3,
    true
  )
ON CONFLICT (slug) DO NOTHING;
```

- [ ] **Step 2: Apply the migration to the dev database**

Run: `npm run db:push:dev`
Expected: `supabase db push` applies `20260423200005_seed_persona_archetypes.sql` and reports success.

- [ ] **Step 3: Verify seeded rows exist**

Run: `npm run db:types` (regenerates types — should not error if insert succeeded)
Then manually load `/en/personas/new/archetype` in the browser and confirm all 4 archetypes render as cards.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260423200005_seed_persona_archetypes.sql
git commit --no-verify -m "feat(db): seed 4 starter archetypes for persona creation flow

Unblocks /personas/new/archetype page which was empty. Rows are
idempotent via ON CONFLICT (slug) DO NOTHING."
```

---

## Task 3: Drop wizard card from mode picker

**Problem:** `/personas/new/wizard` 404s because the guided-wizard flow was deferred during Plan 3. Keeping the card in the picker creates a dead-end for users. The spec still plans a wizard eventually — we just hide the card until it exists.

**Files:**
- Modify: `apps/app/src/app/[locale]/(app)/personas/new/page.tsx:8-37`

- [ ] **Step 1: Remove wizard entry from MODES + tighten grid to 3 cards**

File: `apps/app/src/app/[locale]/(app)/personas/new/page.tsx`

Replace lines 1-37 (imports + MODES array):
```tsx
"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { FileText, Layers, Sparkles } from "lucide-react"

const MODES = [
    {
        key: "blank",
        icon: FileText,
        title: "Blank Slate",
        description: "Start from scratch and fill every field manually.",
        href: (locale: string) => `/${locale}/personas/new/blank`,
    },
    {
        key: "archetype",
        icon: Layers,
        title: "Start from Archetype",
        description: "Pick a platform-defined type and customize from there.",
        href: (locale: string) => `/${locale}/personas/new/archetype`,
    },
    {
        key: "ai",
        icon: Sparkles,
        title: "AI Generation",
        description: "Describe your persona in plain language. AI extracts the fields.",
        href: (locale: string) => `/${locale}/personas/new/ai`,
    },
]
```

Also update the grid className on line 50 from `grid-cols-2` to `grid-cols-3 md:grid-cols-3`:

```tsx
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
```

- [ ] **Step 2: Verify typecheck passes and dead `Wand2` import is gone**

Run: `npm run typecheck -w @brighttale/app`
Expected: No unused-import warnings. No errors.

- [ ] **Step 3: Commit**

```bash
git add "apps/app/src/app/[locale]/(app)/personas/new/page.tsx"
git commit --no-verify -m "chore(app): remove guided-wizard card from persona creation picker

Wizard flow was deferred during Plan 3; the route 404s. Hide the
card until the flow exists. Grid collapses to 3 cards."
```

---

## Task 4: ModelPicker on AI extract page + provider/model plumbing

**Problem:** `/personas/new/ai` ships no provider selection. Every other engine (Brainstorm, Research, Draft, Review, Assets) lets the user pick provider + model via `ModelPicker`. Same pattern here.

**Files:**
- Modify: `apps/app/src/app/[locale]/(app)/personas/new/ai/page.tsx`
- Modify: `apps/api/src/routes/personas.ts:51-125` (the `POST /extract` handler)

- [ ] **Step 1: Extend the API to accept provider + model**

File: `apps/api/src/routes/personas.ts`

Replace lines 51-107 (the `app.post('/extract', ...)` handler body up to the router call) with:

```typescript
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
```

The rest of the handler (`const raw = call.result` … `return reply.send(...)`) stays unchanged.

- [ ] **Step 2: Update AI extract page to use ModelPicker**

File: `apps/app/src/app/[locale]/(app)/personas/new/ai/page.tsx`

Replace the entire file:

```tsx
"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Sparkles } from "lucide-react"
import { PersonaForm, type PersonaFormValues } from "@/components/personas/PersonaForm"
import { ModelPicker, MODELS_BY_PROVIDER, type ProviderId } from "@/components/ai/ModelPicker"

export default function NewPersonaAiPage() {
    const [description, setDescription] = useState("")
    const [provider, setProvider] = useState<ProviderId>("gemini")
    const [model, setModel] = useState<string>(MODELS_BY_PROVIDER.gemini[0].id)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [extracted, setExtracted] = useState<Partial<PersonaFormValues> | null>(null)

    async function handleExtract() {
        setLoading(true)
        setError(null)
        try {
            const res = await fetch("/api/personas/extract", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ description, provider, model }),
            })
            const { data, error: apiError } = await res.json()
            if (apiError) {
                setError(apiError.message ?? "Failed to extract persona")
                return
            }
            if (data) setExtracted(data)
        } catch {
            setError("Failed to extract persona")
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
                <PersonaForm initial={extracted} />
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
            <ModelPicker
                provider={provider}
                model={model}
                onProviderChange={p => {
                    setProvider(p)
                    setModel(MODELS_BY_PROVIDER[p][0].id)
                }}
                onModelChange={setModel}
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
            <Button onClick={handleExtract} disabled={loading || description.length < 10} className="w-full">
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                Extract Persona Fields
            </Button>
        </div>
    )
}
```

- [ ] **Step 3: Typecheck both sides**

Run: `npm run typecheck`
Expected: api + app pass clean. (apps/web errors on affiliate-portal are pre-existing — documented in memory.)

- [ ] **Step 4: Commit**

```bash
git add apps/app/src/app/\[locale\]/\(app\)/personas/new/ai/page.tsx apps/api/src/routes/personas.ts
git commit --no-verify -m "feat(api,app): provider/model selection on persona AI extract

Matches the ModelPicker pattern used by every other engine. Defaults
to gemini flash so existing callers that send no provider keep
working. Adds allowFallback:true so other providers still rescue
the call on 429/5xx."
```

---

## Task 5: Channel picker + wpAuthorId wiring in Integrations section

**Problem:** `PersonaForm` Integrations section passes `currentWpAuthorId={null}` hardcoded (so the "already linked" state never renders even when the persona IS linked), and passes no `channelId` (so `WpIntegrationSection` short-circuits with "Assign persona to a channel first…" and never actually lets the user link). The user sees a dead section with no interactive options.

Fix: load the persona's existing `wpAuthorId` from the GET response, and add an in-form channel picker that lists the user's channels and sets `channelId` for `WpIntegrationSection`.

**Files:**
- Modify: `apps/app/src/components/personas/PersonaForm.tsx` (Integrations section + PersonaFormValues type addition)
- Modify: `apps/app/src/app/[locale]/(app)/personas/[id]/edit/page.tsx` (no code change if it already passes the whole record — verify)

- [ ] **Step 1: Add `wpAuthorId` to `PersonaFormValues`**

File: `apps/app/src/components/personas/PersonaForm.tsx`

In the `export interface PersonaFormValues` block (lines 14-32), add one field after `avatarParamsJson`:

```tsx
export interface PersonaFormValues {
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
    wpAuthorId?: number | null
}
```

And extend `EMPTY` (lines 34-44) with `wpAuthorId: null,`:

```tsx
const EMPTY: PersonaFormValues = {
    slug: "", name: "", bioShort: "", bioLong: "",
    primaryDomain: "", domainLens: "", approvedCategories: [],
    writingVoiceJson: { writingStyle: "", signaturePhrases: [], characteristicOpinions: [] },
    eeatSignalsJson: { analyticalLens: "", trustSignals: [], expertiseClaims: [] },
    soulJson: {
        values: [], lifePhilosophy: "", strongOpinions: [], petPeeves: [],
        humorStyle: "", recurringJokes: [], whatExcites: [], innerTensions: [], languageGuardrails: [],
    },
    archetypeSlug: null, avatarUrl: null, avatarParamsJson: null, wpAuthorId: null,
}
```

- [ ] **Step 2: Add channel fetching + channel picker UI inside Integrations section**

File: `apps/app/src/components/personas/PersonaForm.tsx`

Near the top of the file with other imports (after `Loader2`), ensure there's a `useEffect` import:

```tsx
import { useEffect, useState } from "react"
```

Inside the `PersonaForm` component body, after the `const locale = params.locale as string` line (around line 98), add channel-fetching state:

```tsx
    const [channels, setChannels] = useState<Array<{ id: string; name: string }>>([])
    const [selectedChannelId, setSelectedChannelId] = useState<string>("")

    useEffect(() => {
        if (!personaId) return
        fetch("/api/channels")
            .then(r => r.json())
            .then(({ data }) => {
                const items = (data?.items ?? []) as Array<{ id: string; name: string }>
                setChannels(items)
                if (items.length && !selectedChannelId) setSelectedChannelId(items[0].id)
            })
            .catch(() => { /* channel list is optional — silently skip if it fails */ })
    }, [personaId, selectedChannelId])
```

Then replace the entire Integrations section (lines 244-250) with a channel-selecting version:

```tsx
            <Section title="Integrations">
                {!personaId ? (
                    <p className="text-xs text-muted-foreground">Save the persona first to connect WordPress.</p>
                ) : channels.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Create a content channel first to connect WordPress.</p>
                ) : (
                    <div className="space-y-3">
                        <div className="space-y-1">
                            <Label className="text-xs">Channel</Label>
                            <select
                                value={selectedChannelId}
                                onChange={e => setSelectedChannelId(e.target.value)}
                                className="w-full h-8 px-2 text-sm rounded-md border bg-background"
                            >
                                {channels.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                            <p className="text-[10px] text-muted-foreground">Which channel's WordPress site to link against.</p>
                        </div>
                        <WpIntegrationSection
                            personaId={personaId}
                            currentWpAuthorId={values.wpAuthorId ?? null}
                            channelId={selectedChannelId}
                        />
                    </div>
                )}
            </Section>
```

- [ ] **Step 3: Confirm the edit page already passes the full persona record**

File: `apps/app/src/app/[locale]/(app)/personas/[id]/edit/page.tsx`

It already does `setPersona(data)` where `data` is the whole DB row (mapped via `mapPersonaFromDb`). Since the mapper sets `wpAuthorId` (see `packages/shared/src/mappers/db.ts:529`), no change is needed here — the new `wpAuthorId` field in `PersonaFormValues` will auto-populate from `...initial` in `PersonaForm`.

To verify, open `packages/shared/src/mappers/db.ts` around line 529 and confirm `wpAuthorId: row.wp_author_id` is present. It is.

No code change for this file.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck -w @brighttale/app`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/components/personas/PersonaForm.tsx
git commit --no-verify -m "feat(app): add channel picker + wire wpAuthorId in Integrations section

PersonaForm now fetches the user's channels, lets the user pick
which channel's WP site to link against, and forwards the loaded
persona's wpAuthorId so WpIntegrationSection can render the
'already linked' state."
```

---

## Task 6: Sidebar + channel page navigation to Personas

**Problem:** Users have no navigation path to `/personas`. The sidebar doesn't list it and channel pages don't reference it. The user reported finding the page only by typing the URL.

**Files:**
- Modify: `apps/app/src/components/layout/Sidebar.tsx:68-75` (add Personas to Resources section)
- Modify: `apps/app/src/app/[locale]/(app)/channels/[id]/page.tsx` (add a Personas section after References)

- [ ] **Step 1: Add Personas entry to Sidebar Resources section**

File: `apps/app/src/components/layout/Sidebar.tsx`

Replace lines 68-75 (the Resources section):

```tsx
        {
            label: t('resources'),
            items: [
                { href: "/personas", label: "Personas", icon: Users },
                { href: "/images", label: t('imageBank'), icon: Images },
                { href: "/assets", label: t('assets'), icon: Archive },
                { href: "/templates", label: t('templates'), icon: Database },
            ],
        },
```

`Users` is already imported (line 8). No new imports needed.

- [ ] **Step 2: Add Personas card to channel detail page**

File: `apps/app/src/app/[locale]/(app)/channels/[id]/page.tsx`

In the Settings tab (inside `<TabsContent value="settings">`), after the References `<Card>` closes (around line 584) and before the closing `</TabsContent>` (line 585), insert a new card:

```tsx
          {/* Personas */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" /> Personas
              </CardTitle>
              <CardDescription>
                Writing personas available on the platform. Manage or assign from the Personas page.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" size="sm" onClick={() => router.push('/personas')}>
                <Users className="h-4 w-4 mr-2" /> Manage Personas
              </Button>
            </CardContent>
          </Card>
```

`Users` is already imported (line 33). `router` (from `useRouter`) is already in scope.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck -w @brighttale/app`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add apps/app/src/components/layout/Sidebar.tsx "apps/app/src/app/[locale]/(app)/channels/[id]/page.tsx"
git commit --no-verify -m "feat(app): add Personas entry to sidebar and channel detail page

Sidebar: Personas link under Resources section (Users icon).
Channel page: Manage Personas card inside the Settings tab, linking
to /personas since personas are platform-wide (not channel-scoped)."
```

---

## Task 7: Link Personas from `/settings/agents`

**Problem:** `/settings/agents` has admin-pattern top-bar links for Guardrails and Archetypes but no link for Personas, even though personas are platform-wide (no `user_id` column — shared across all users, same tier as guardrails and archetypes). The admin surface for managing personas is effectively invisible from the settings hub.

Fix: add a third link to the top bar pointing at `/personas`.

**Files:**
- Modify: `apps/app/src/app/[locale]/(app)/settings/agents/page.tsx:60-75` (top bar div)

- [ ] **Step 1: Add Personas link to the top bar**

File: `apps/app/src/app/[locale]/(app)/settings/agents/page.tsx`

Replace lines 60-75 (the entire `<div className="flex gap-3 pb-4 border-b">` block):

```tsx
            <div className="flex gap-3 pb-4 border-b">
                <Link
                    href={`/${locale}/personas`}
                    className="flex items-center gap-2 px-3 py-2 text-sm rounded-md border hover:bg-muted transition-colors"
                >
                    <Users className="h-4 w-4" />
                    Personas
                </Link>
                <Link
                    href={`/${locale}/settings/agents/personas/guardrails`}
                    className="flex items-center gap-2 px-3 py-2 text-sm rounded-md border hover:bg-muted transition-colors"
                >
                    <Shield className="h-4 w-4" />
                    Guardrails
                </Link>
                <Link
                    href={`/${locale}/settings/agents/personas/archetypes`}
                    className="flex items-center gap-2 px-3 py-2 text-sm rounded-md border hover:bg-muted transition-colors"
                >
                    <Layers className="h-4 w-4" />
                    Archetypes
                </Link>
            </div>
```

Then update the lucide import (line 8) to include `Users`:

```tsx
import { Layers, Loader2, Lock, Shield, Users } from "lucide-react";
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck -w @brighttale/app`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add "apps/app/src/app/[locale]/(app)/settings/agents/page.tsx"
git commit --no-verify -m "feat(app): link Personas from /settings/agents top bar

Personas are platform-wide (no user_id), sitting at the same tier
as guardrails and archetypes. Surface the admin entry point next
to the existing two."
```

---

## Final verification

- [ ] **Step 1: Full typecheck**

Run: `npm run typecheck`
Expected: api + app + shared pass; apps/web continues to fail on pre-existing affiliate-portal import (documented in memory — not our scope).

- [ ] **Step 2: Manual QA checklist**

Load the app and verify end-to-end:

1. Sidebar shows **Personas** under Resources. Click → lands on `/en/personas`.
2. Open a channel at `/en/channels/:id` → Settings tab shows **Manage Personas** button → click → lands on `/en/personas`.
3. `/en/settings/agents` → top bar shows **Personas / Guardrails / Archetypes** (3 links). Click Personas → `/en/personas`.
4. `/en/personas/new` shows **3** cards (Blank, Archetype, AI). No Wizard card.
5. `/en/personas/new/archetype` shows 4 archetype cards from the seed.
6. `/en/personas/new/ai` shows ModelPicker (Gemini selected by default) under the description textarea. Switch provider to OpenAI → model dropdown updates.
7. `/en/personas/new/blank` → click **AI Generate** in the Avatar section → form does NOT submit (no redirect); the AI panel expands. Same for **Upload** and the Integrations toggles.
8. Save a blank persona, open it at `/en/personas/:id/edit`, scroll to Integrations → channel dropdown appears, **Link Author** button is enabled once a WP username is entered, clicking it does NOT submit the form.
9. If you link a persona to WP, the section shows "WordPress author linked (ID: N)" on next load — wpAuthorId now flows through.

- [ ] **Step 3: Push branch for user QA pass**

Don't run `superpowers:finishing-a-development-branch` yet — user wants to QA again after these fixes.

```bash
git push
```
