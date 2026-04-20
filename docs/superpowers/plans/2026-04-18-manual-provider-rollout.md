# Manual Provider — Rollout to Research, Draft, Review

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replicate the Brainstorm Manual-provider pattern to Research, Draft, and Review. Remove the `ManualModePanel` tab/panel from each engine — Manual becomes a `provider` choice in the model picker that short-circuits the LLM call, emits the full prompt to Axiom, persists the session as `awaiting_manual`, and waits for the user to paste output JSON into a reusable modal.

**Reference implementation:** `docs/superpowers/plans/2026-04-17-manual-provider-brainstorm.md` + spec `docs/superpowers/specs/2026-04-17-manual-provider-design.md`. Patterns below are deltas against that baseline.

**Scope:**

| Stage   | In scope | Table            | Status extension                                   | Output shape              |
|---------|----------|------------------|----------------------------------------------------|---------------------------|
| Research | YES     | `research_sessions` | add `'awaiting_manual'` to existing check          | `{ cards: [...] }`        |
| Draft — canonical core | YES | `content_drafts` | add `'awaiting_manual'` to existing check | `{ canonical_core: {...} }` |
| Draft — typed content  | YES | `content_drafts` | (reuse `awaiting_manual`)                  | `{ draft_json: {...} }`   |
| Review  | YES     | `content_drafts` | (reuse `awaiting_manual`) — stored via `review_feedback_json` | `{ score, verdict, feedback }` |

**Out of scope (separate design):**
- Assets — image generation; external tools produce binaries, not JSON. Needs a different upload/paste-URL flow.
- Publish — no content generation; destination push is an action, not a prompt.
- Deleting `ManualModePanel.tsx` itself — do it only after all four engines stop importing it (end of this plan).

**Tech Stack:** same as brainstorm plan — Fastify + Zod + Supabase service-role client; React 19 / shadcn; Vitest.

---

## Shared prerequisites

These touch files used by every track — do them once, up front.

### Prereq A: DB — extend status checks

**Files:**
- Create: `supabase/migrations/20260418100000_research_sessions_awaiting_manual.sql`
- Create: `supabase/migrations/20260418100100_content_drafts_awaiting_manual.sql`

- [ ] **Step 1: `research_sessions` migration**

```sql
alter table public.research_sessions
  drop constraint if exists research_sessions_status_check;

alter table public.research_sessions
  add constraint research_sessions_status_check
  check (status in ('pending', 'running', 'completed', 'reviewed', 'failed', 'awaiting_manual'));
```

- [ ] **Step 2: `content_drafts` migration**

```sql
alter table public.content_drafts
  drop constraint if exists content_drafts_status_check;

alter table public.content_drafts
  add constraint content_drafts_status_check
  check (status in ('draft', 'in_review', 'approved', 'scheduled', 'published', 'failed', 'awaiting_manual'));
```

- [ ] **Step 3: Apply**

```bash
npm run db:push:dev
```

- [ ] **Step 4: Verify**

```bash
psql "$SUPABASE_DB_URL" -c "\d+ research_sessions" | grep status
psql "$SUPABASE_DB_URL" -c "\d+ content_drafts" | grep status
```
Expected: both checks include `awaiting_manual`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260418100000_*.sql supabase/migrations/20260418100100_*.sql
git commit -m "feat(db): allow awaiting_manual on research_sessions + content_drafts"
```

### Prereq B: Regenerate types + mappers

- [ ] **Step 1**

```bash
npm run db:types
```

- [ ] **Step 2**

Confirm `packages/shared/src/types/database.ts` picks up the widened status union. No schema mapper change needed (status is a scalar). Commit if the file diffed.

```bash
git diff packages/shared/src/types/database.ts
git add packages/shared/src/types/database.ts 2>/dev/null
git commit -m "chore(types): regenerate database types for awaiting_manual" || echo "(no type drift)"
```

---

## Track 1 — Research

Research is the closest analog to Brainstorm: `POST /sessions` kicks off generation, worker persists `cards_json`. Manual flow skips the worker and expects pasted cards.

**Files:**
- Modify: `apps/api/src/routes/research-sessions.ts`
- Modify: `apps/app/src/components/engines/ResearchEngine.tsx`
- Create: `apps/api/src/routes/__tests__/research-manual.test.ts`

### Task 1.1: Widen request schema

- [ ] **Step 1** — Edit `apps/api/src/routes/research-sessions.ts:79`

```ts
provider: z.enum(['gemini', 'openai', 'anthropic', 'ollama', 'manual']).optional(),
```

- [ ] **Step 2** — `npm run -w @brighttale/api typecheck` (must be clean).

- [ ] **Step 3** — Commit: `feat(research): accept manual provider in session schema`.

### Task 1.2: Failing test — POST /sessions with provider=manual

- [ ] **Step 1** — Create `apps/api/src/routes/__tests__/research-manual.test.ts` mirroring `brainstorm-manual.test.ts`. Mock supabase (`research_sessions`, `research_cards` equivalents), axiom, inngest, promptLoader.

Key assertions for the first test:
- `res.statusCode === 202`
- `body.data.status === 'awaiting_manual'`
- `insertedSessions[0].status === 'awaiting_manual'`
- `inngest.send` NOT called
- Axiom event `action === 'manual.awaiting'`, `metadata.prompt` non-empty string, `metadata.stage === 'research'`

- [ ] **Step 2** — Run it, confirm FAIL.
- [ ] **Step 3** — Commit the failing test: `test(research): add failing manual provider test`.

### Task 1.3: Implement the manual branch

- [ ] **Step 1** — In `research-sessions.ts` `POST /sessions` handler (~line 168), insert a `if (body.provider === 'manual') { ... }` branch **before** the regular insert. Load `research` system prompt via `loadAgentPrompt('research')`, build the user message using the same research prompt builder already used by the Inngest worker (search for `buildResearchMessage` or equivalent — if named differently, reuse that function directly; do not duplicate prompt-construction logic).

Combine prompts the way brainstorm does:
```ts
const combinedPrompt = systemPrompt ? `${systemPrompt}\n\n${userMessage}` : userMessage;
```

Emit Axiom with `action: 'manual.awaiting'`, `stage: 'research'`, `metadata.prompt: combinedPrompt`. Persist session with `status: 'awaiting_manual'`. Return 202 with `{ sessionId, status: 'awaiting_manual' }`.

- [ ] **Step 2** — Test passes. Other research tests still pass.
- [ ] **Step 3** — Commit: `feat(research): manual provider short-circuits POST /sessions`.

### Task 1.4: Failing test — POST /sessions/:id/manual-output

- [ ] **Step 1** — Append `describe` in `research-manual.test.ts`. Pasted payload shape:

```ts
const pastedOutput = {
  cards: [
    { card_id: 'RC-001', title: '...', summary: '...', source_url: '...' },
    // ...
  ],
};
```

Assertions:
- `200` on awaiting_manual session with valid cards
- session flipped to `completed`, `cards_json` populated from `body.output`
- Axiom event `action === 'manual.completed'`, `status === 'success'`
- `409` when session is not `awaiting_manual`
- `400` when no cards found

- [ ] **Step 2** — Run, confirm failures (endpoint doesn't exist).
- [ ] **Step 3** — Commit.

### Task 1.5: Implement `POST /sessions/:id/manual-output`

- [ ] **Step 1** — Add handler near other `/sessions/:id/*` routes in `research-sessions.ts`. Mirror brainstorm pattern:
  - Validate body with `z.object({ output: z.unknown() })`
  - Fetch session, check ownership, `status === 'awaiting_manual'`
  - Extract cards (use the same normalizer already used by the AI worker — do not invent a new one; `grep` for `normalizeResearch` or `parseResearch`)
  - Update `research_sessions.cards_json` + `status = 'completed'`
  - Emit `logAiUsage({ action: 'manual.completed', metadata: { sessionId, stage: 'research', output } })`
  - Return `{ data: { cards }, error: null }`

- [ ] **Step 2** — All 4 tests pass. Full suite still passes.
- [ ] **Step 3** — Commit: `feat(research): POST /sessions/:id/manual-output`.

### Task 1.6: Also support /cancel for awaiting_manual

- [ ] **Step 1** — In `research-sessions.ts`, find the cancel handler. Relax the status check:

```ts
if (session.status !== 'running' && session.status !== 'awaiting_manual') {
  return reply.send({ data: { status: session.status }, error: null });
}
```

Matches the change already made for brainstorm in commit `fc8f0a0` / `003e566`.

- [ ] **Step 2** — Commit: `fix(research): cancel endpoint accepts awaiting_manual`.

### Task 1.7: UI — remove ManualModePanel + wire Manual provider

**File:** `apps/app/src/components/engines/ResearchEngine.tsx`

This mirrors BrainstormEngine refactor in commit `b835bba` + `003e566`.

- [ ] **Step 1: Remove `ManualModePanel` imports + render**

```diff
- import { ManualModePanel } from '@/components/ai/ManualModePanel';
- import { useManualMode } from '@/hooks/use-manual-mode';
```

Remove the `TabsContent` that renders `<ManualModePanel>`, the surrounding tab toggle, and any `handleManualImport` function. If collapsing leaves a single tab, drop the `<Tabs>` wrapper too.

- [ ] **Step 2: Add `manual` to provider options**

```tsx
const RESEARCH_PROVIDERS: ProviderId[] = ['gemini', 'openai', 'anthropic', 'ollama', 'manual'];
// ...
<ModelPicker providers={RESEARCH_PROVIDERS} ... />
```

(`ModelPicker` already includes `manual` in `MODELS_BY_PROVIDER` from the Brainstorm rollout — no change needed there.)

- [ ] **Step 3: Add modal state + imports**

```tsx
import { ManualOutputDialog } from './ManualOutputDialog';

const [manualSessionId, setManualSessionId] = useState<string | null>(null);
```

- [ ] **Step 4: Branch the generate handler**

Where the engine POSTs to `/api/research/sessions`, add:

```tsx
if (json.data?.status === 'awaiting_manual') {
  setManualSessionId(json.data.sessionId);
  return;
}
```

- [ ] **Step 5: Implement `handleManualOutputSubmit` + `handleManualAbandon`**

```tsx
async function handleManualOutputSubmit(parsed: unknown) {
  if (!manualSessionId) return;
  const res = await fetch(`/api/research/sessions/${manualSessionId}/manual-output`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ output: parsed }),
  });
  const json = await res.json();
  if (json.error) {
    toast.error(json.error.message ?? 'Failed to submit output');
    return;
  }
  const cards = (json.data?.cards ?? []) as ResearchCard[];
  setCards(cards);
  setSessionId(manualSessionId);
  setManualSessionId(null);
  onStageProgress?.({ researchSessionId: manualSessionId });
  toast.success(`${cards.length} research cards saved`);
}

async function handleManualAbandon() {
  if (!manualSessionId) return;
  try {
    await fetch(`/api/research/sessions/${manualSessionId}/cancel`, { method: 'POST' });
  } catch { /* best-effort */ }
  setManualSessionId(null);
  setSessionId(null);
  setCards([]);
  onStageProgress?.({ researchSessionId: undefined });
  toast.success('Manual session abandoned');
}
```

- [ ] **Step 6: Hydrate on reload**

In the session-hydration `useEffect`, add before idea/card loading:

```tsx
if (sess.status === 'awaiting_manual') {
  setManualSessionId(sess.id);
  return;
}
```

- [ ] **Step 7: Render the modal**

```tsx
<ManualOutputDialog
  open={!!manualSessionId}
  onOpenChange={(open) => { if (!open) setManualSessionId(null); }}
  onSubmit={handleManualOutputSubmit}
  onAbandon={handleManualAbandon}
  title="Paste research output"
  description="Retrieve the prompt from Axiom, run it in an external AI, then paste the full BC_RESEARCH_OUTPUT JSON below."
  submitLabel="Save cards"
/>
```

- [ ] **Step 8: Wire `onStageProgress`**

In `PipelineOrchestrator.tsx`, pass `onStageProgress={handleStageProgress}` to `<ResearchEngine />` (the handler already exists from the Brainstorm rollout).

- [ ] **Step 9: Smoke test**

```bash
npm run dev
```

1. Open a project already past Brainstorm, reach Research stage.
2. Pick Manual provider, click Generate.
3. Modal opens; Axiom logs `manual.awaiting` with `stage: 'research'`, `metadata.prompt` non-empty.
4. Paste `{"cards":[{"card_id":"RC-001","title":"Test","summary":"...","source_url":"https://example.com"}]}`.
5. Cards render; `manual.completed` event appears in Axiom.
6. Reload → cards persist (pipeline state saved via `onStageProgress`).
7. Abandon flow: trigger Manual again, click Cancel → session marked failed, state cleared.

- [ ] **Step 10: Commit**

```bash
git add apps/app/src/components/engines/ResearchEngine.tsx apps/app/src/components/pipeline/PipelineOrchestrator.tsx
git commit -m "feat(research-ui): manual provider via picker; remove AI/Manual tab"
```

---

## Track 2 — Draft (canonical core + typed content)

Draft has **two** LLM calls: first builds a `canonical_core_json`, then expands into `draft_json` per content type (blog/video/podcast/shorts). Both need a manual branch.

The draft stage uses `content_drafts`. Unlike brainstorm/research, there is no separate "session" — the draft row itself is the long-lived artifact. We reuse `status='awaiting_manual'` as the in-progress marker, but we need a `phase` discriminator on the manual endpoint so the backend knows whether the pasted output is canonical-core or typed content.

**Files:**
- Modify: `apps/api/src/routes/content-drafts.ts`
- Modify: `apps/app/src/components/engines/DraftEngine.tsx`
- Create: `apps/api/src/routes/__tests__/content-drafts-manual.test.ts`

### Task 2.1: Widen schema

- [ ] **Step 1** — In `content-drafts.ts:54` change provider enum to include `'manual'`.

- [ ] **Step 2** — For each LLM-facing schema in the file (there are multiple: core generation at line ~409, per-type generation at line ~584, review at line ~742), add `provider: 'manual'` acceptance.

- [ ] **Step 3** — Commit: `feat(drafts): accept manual provider in schemas`.

### Task 2.2: Manual branch for canonical-core generation

Endpoint: `POST /content-drafts/:id/generate` (core) — see `content-drafts.ts:409`.

- [ ] **Step 1: Failing test** — `apps/api/src/routes/__tests__/content-drafts-manual.test.ts`. Assert that when `provider: 'manual'`:
  - response 202, `status === 'awaiting_manual'`, draft row `status` flipped to `'awaiting_manual'`
  - Axiom `manual.awaiting`, `metadata.stage === 'draft.core'`, `metadata.prompt` non-empty
  - no Inngest call

- [ ] **Step 2: Implement the branch** — Same pattern: load prompt, build user message (reuse existing builder — search for `buildCanonicalCoreMessage` / `buildCorePrompt`), emit Axiom, update draft row. Return 202.

- [ ] **Step 3: Commit**

### Task 2.3: Manual branch for typed-content generation

Endpoint: `POST /content-drafts/:id/{blog|video|shorts|podcast}` — see `content-drafts.ts:584`.

- [ ] **Step 1: Failing test** — assertions like 2.2 but `metadata.stage === 'draft.<type>'`.

- [ ] **Step 2: Implement** — same pattern.

- [ ] **Step 3: Commit**

### Task 2.4: `POST /content-drafts/:id/manual-output`

Single endpoint that accepts both phases. Body:

```ts
const manualOutputSchema = z.object({
  phase: z.enum(['core', 'blog', 'video', 'shorts', 'podcast']),
  output: z.unknown(),
});
```

- [ ] **Step 1: Failing tests** — 4 tests:
  - `phase: 'core'` → persists `canonical_core_json`, status `draft` (ready for type expansion)
  - `phase: 'blog'` (etc.) → persists `draft_json`, status `draft` (ready for review)
  - 409 when draft not in `awaiting_manual`
  - 400 when output missing required fields for the phase

- [ ] **Step 2: Implement** — single handler, switch on `phase`. Reuse the same JSON parsers used by the AI worker to normalize the pasted output (do not duplicate).

- [ ] **Step 3: Commit**

### Task 2.5: UI — DraftEngine

Mirror Track 1.7, but note DraftEngine renders `ManualModePanel` twice (line 772 for core, line 1009 for typed content). Both must be removed.

- [ ] **Step 1: Remove ManualModePanel + handleManualImport** everywhere.
- [ ] **Step 2: Add Manual to provider picker** in both core + type sections.
- [ ] **Step 3: Modal + handlers** — two separate calls to `manual-output` with different `phase`. One `manualState` can discriminate: `{ draftId, phase: 'core' | 'blog' | ... }`.
- [ ] **Step 4: Hydrate on reload** — if draft row `status === 'awaiting_manual'`, figure out phase from which fields are populated (e.g., no `canonical_core_json` → phase=core; has core but no `draft_json` → phase=type).
- [ ] **Step 5: Modal render + `onStageProgress`** — `{ draftId: draft.id }`.
- [ ] **Step 6: Smoke test** — full flow: pick Manual, core → paste core → pick Manual, type → paste content → confirm saved.
- [ ] **Step 7: Commit**

---

## Track 3 — Review

Review is the simplest LLM call: given a draft, return `{ score, verdict, feedback }`. Stored in `content_drafts.review_feedback_json`.

Endpoint: `POST /content-drafts/:id/review` — see `content-drafts.ts:742`.

**Files:**
- Modify: `apps/api/src/routes/content-drafts.ts`
- Modify: `apps/app/src/components/engines/ReviewEngine.tsx`
- Create: `apps/api/src/routes/__tests__/review-manual.test.ts`

### Task 3.1: Manual branch on review endpoint

- [ ] **Step 1: Failing test**
  - `provider: 'manual'` → 202, draft `status='awaiting_manual'`, Axiom `manual.awaiting` with `stage: 'review'`

- [ ] **Step 2: Implement** — same synchronous branch.

- [ ] **Step 3: Commit**

### Task 3.2: `POST /content-drafts/:id/manual-review-output`

> Naming: distinct from Track 2's `manual-output` to avoid `phase` overloading for review, which is small enough to warrant its own endpoint.

- [ ] **Step 1: Failing tests**
  - 200 on awaiting_manual → persists `review_feedback_json`, status `in_review` or `approved` based on score threshold (match the AI path's behavior)
  - 409 / 400 edge cases

- [ ] **Step 2: Implement**

- [ ] **Step 3: Commit**

### Task 3.3: UI — ReviewEngine

Mirror Track 1.7.

- [ ] **Step 1: Remove ManualModePanel** (two occurrences: line 374 + line 511 — figure out which one is used in current flow; one may be dead code).
- [ ] **Step 2: Manual provider picker** — ReviewEngine uses the same `ModelPicker`; add `'manual'`.
- [ ] **Step 3: Modal + handlers** — on submit POST `/api/content-drafts/:id/manual-review-output`.
- [ ] **Step 4: Hydrate on reload** — if draft `status='awaiting_manual'` AND review was the one triggering, reopen review modal. Use a marker in `review_feedback_json` or compare with Track 2's phase detection logic.
- [ ] **Step 5: Smoke test**
- [ ] **Step 6: Commit**

---

## Final wrap-up

### Task 4.1: Delete `ManualModePanel.tsx`

- [ ] **Step 1** — Confirm no engine imports it anymore:

```bash
grep -rn "ManualModePanel\|useManualMode" apps/app/src
```
Expected: zero matches (or only the component file itself and the hook file).

- [ ] **Step 2** — Delete:

```bash
rm apps/app/src/components/ai/ManualModePanel.tsx
rm apps/app/src/hooks/use-manual-mode.ts  # only if no other consumers
```

- [ ] **Step 3** — Full typecheck + build:

```bash
npm run typecheck
npm run build
```

- [ ] **Step 4** — Commit: `refactor: remove legacy ManualModePanel; manual is a provider now`.

### Task 4.2: Docs

- [ ] **Step 1** — Update the feature pages that described the old AI/Manual tab. Point each one to the Brainstorm Manual-provider doc added in `2026-04-17-manual-provider-brainstorm.md` Task 13 (if that doc does not yet exist, write a single shared page at `docs/specs/manual-provider.md` covering all four stages and link from each feature page).

- [ ] **Step 2** — Commit.

### Task 4.3: Final verification

- [ ] **Step 1** — `npm run test` — all green.
- [ ] **Step 2** — E2E smoke across all four stages on a fresh project:
  1. Brainstorm with Manual → ideas.
  2. Research with Manual → cards.
  3. Draft core with Manual → canonical core.
  4. Draft type (blog) with Manual → draft_json.
  5. Review with Manual → score/verdict.
  6. Full reload between each — state persists.
- [ ] **Step 3** — Push: `git push -u origin feat/manual-provider-rollout`.
- [ ] **Step 4** — Open PR against `staging`.

---

## Notes for executors

- **Do not duplicate prompt-building code.** Every stage already has a function that builds the user message for the AI worker. Import it; do not write a second copy for the manual branch.
- **Combined prompt format.** Axiom receives one field `metadata.prompt = systemPrompt + "\n\n" + userMessage`. This matches the Brainstorm pattern (commit `a795ea4`) — operator copies one block into ChatGPT.
- **Idempotency.** `manual-output` endpoints must be safe to retry. Guard with `status === 'awaiting_manual'` before writing; return 409 otherwise.
- **`onStageProgress`.** Every engine's manual submit must call `onStageProgress?.({ <stageId>SessionId: id })` so `PipelineOrchestrator` persists the id. Without it, reload wipes the state — see commit `003e566` for the Brainstorm fix.
- **Cancel semantics.** Every `/cancel` endpoint must accept both `running` and `awaiting_manual` statuses. The modal's Cancel button calls `/cancel` and clears local state.
- **Legacy fallback on import-mode pages.** The standalone `/channels/:id/research` etc. pages use the same engines. Because the engines are unchanged except for provider options, those pages inherit the new Manual flow for free — but they don't have a `PipelineOrchestrator`, so `onStageProgress` is undefined. That's fine: `onStageProgress?.(...)` is a no-op when absent.
