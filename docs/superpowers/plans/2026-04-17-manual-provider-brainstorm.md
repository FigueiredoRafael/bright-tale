# Manual Provider — Brainstorm Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a `manual` AI provider in the Brainstorm engine that, instead of calling an LLM, emits the full prompt payload to Axiom and waits for the user to paste a BC_BRAINSTORM_OUTPUT JSON into a modal. Replaces the current "AI / Manual (ChatGPT/Gemini)" tab toggle in `ManualModePanel`.

**Architecture:**
- API: new branch in `POST /api/brainstorm/sessions` for `provider: 'manual'` — synchronously loads the system prompt + builds `buildBrainstormMessage`, persists session with `status='awaiting_manual'`, emits `logAiUsage({ action: 'manual.awaiting', metadata: { prompt, input, ... } })`, returns early (no Inngest).
- API: new endpoint `POST /api/brainstorm/sessions/:id/manual-output` accepts pasted JSON, runs the same idea-extraction logic already used by the Inngest worker (`normalizeIdeas` in `routes/brainstorm.ts`), persists ideas with `brainstorm_session_id`, flips session to `completed`, emits `logAiUsage({ action: 'manual.completed' })`.
- UI: `manual` becomes a provider option in `BrainstormEngine`'s model picker. On a `awaiting_manual` response, the engine opens a modal with a single textarea. Submit calls the new endpoint. The AI/Manual tab toggle in `ManualModePanel` is deleted; `BrainstormEngine` stops rendering the "Manual" tab entirely.

**Tech Stack:**
- API: Fastify + Zod + Supabase service-role client (`@brighttale/api`)
- Frontend: React 19 + Next.js 16 + shadcn/ui (`Dialog`, `Textarea`)
- Tests: Vitest (unit for router + axiom shape; integration for routes)

**Reference:** `docs/superpowers/specs/2026-04-17-manual-provider-design.md`

---

## File map

**Modify:**
- `apps/api/src/lib/axiom.ts` — widen `AiUsageEvent.status` union with `'awaiting_manual'`.
- `apps/api/src/routes/brainstorm.ts`:
  - Extend `brainstormBodySchema.provider` enum with `'manual'`.
  - Add `manual` branch in `POST /sessions` handler.
  - Add `POST /sessions/:id/manual-output` handler.
- `apps/app/src/components/engines/BrainstormEngine.tsx`:
  - Add `manual` option to provider select.
  - On `awaiting_manual` response, open new modal.
  - Remove AI/Manual tabs + `handleManualImport`.
  - On session hydration, if status=`awaiting_manual`, reopen modal.

**Create:**
- `supabase/migrations/20260417230000_manual_provider_seed.sql` — documentation row in `ai_provider_configs`.
- `apps/app/src/components/engines/ManualOutputDialog.tsx` — the paste-output modal (kept small, co-located with Brainstorm; future engines can import).
- `apps/api/src/routes/__tests__/brainstorm-manual.test.ts` — integration tests for both endpoints.

**Delete (after Task 8):**
- `apps/app/src/components/ai/ManualModePanel.tsx` — only if no other engine still imports it. If Research/Draft/Review still use it, keep the file and just stop rendering in Brainstorm. The scope of this plan is Brainstorm only.

---

## Task 1: Widen `AiUsageEvent.status` union

**Files:**
- Modify: `apps/api/src/lib/axiom.ts` (interface `AiUsageEvent`, lines ~52-64)

- [ ] **Step 1: Edit the type**

Change:
```ts
status: 'success' | 'error';
```
to:
```ts
status: 'success' | 'error' | 'awaiting_manual';
```

- [ ] **Step 2: Typecheck**

Run from repo root:
```bash
npm run -w @brighttale/api typecheck
```
Expected: clean. (Widening a union can never break existing call sites.)

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/lib/axiom.ts
git commit -m "feat(axiom): add awaiting_manual status for manual provider"
```

---

## Task 2: Accept `provider: 'manual'` in the brainstorm request schema

**Files:**
- Modify: `apps/api/src/routes/brainstorm.ts` (`brainstormBodySchema`, line ~78)

- [ ] **Step 1: Extend the enum**

Change:
```ts
provider: z.enum(['gemini', 'openai', 'anthropic', 'ollama']).optional(),
```
to:
```ts
provider: z.enum(['gemini', 'openai', 'anthropic', 'ollama', 'manual']).optional(),
```

- [ ] **Step 2: Typecheck**

```bash
npm run -w @brighttale/api typecheck
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/brainstorm.ts
git commit -m "feat(brainstorm): accept manual provider in request schema"
```

---

## Task 3: Migration — seed `manual` row in `ai_provider_configs`

**Files:**
- Create: `supabase/migrations/20260417230000_manual_provider_seed.sql`

This row is documentation-only (the router hardcodes the `manual` branch). Placing it here makes the provider inventory complete for admin UIs that list `ai_provider_configs`.

- [ ] **Step 1: Write the migration**

```sql
-- Seed the Manual provider so it appears alongside gemini/openai/anthropic/ollama
-- in any admin UI that lists ai_provider_configs. The row has no real secret;
-- the router does not read this table yet — see
-- docs/superpowers/specs/2026-04-17-manual-provider-design.md.

insert into public.ai_provider_configs (provider, api_key, is_active, config_json)
values ('manual', '__manual__', true, '{"description":"Human-in-the-loop provider — emits prompt to Axiom, waits for pasted output"}')
on conflict do nothing;
```

- [ ] **Step 2: Apply to local DB**

```bash
npm run db:push:dev
```
Expected: migration applied successfully.

- [ ] **Step 3: Verify the row**

```bash
psql "$SUPABASE_DB_URL" -c "select provider, is_active from ai_provider_configs where provider='manual';"
```
Expected: one row returned, `is_active=t`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260417230000_manual_provider_seed.sql
git commit -m "feat(db): seed manual provider row in ai_provider_configs"
```

---

## Task 4: Integration test — `POST /sessions` with `provider: 'manual'`

**Files:**
- Create: `apps/api/src/routes/__tests__/brainstorm-manual.test.ts`

Tests the behavior we are about to add in Task 5. Starts as a failing test so the implementation step is unambiguous.

- [ ] **Step 1: Write the failing test**

```ts
/**
 * Integration tests for the manual Brainstorm provider.
 *
 * These exercise POST /sessions with provider='manual' and the new
 * POST /sessions/:id/manual-output endpoint. Supabase calls are mocked; the
 * goal is route shape + Axiom emission + Inngest-skip verification.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

// ── Mocks ───────────────────────────────────────────────────────────────────

const inngestSend = vi.fn(async () => undefined);
vi.mock('../../jobs/client.js', () => ({
  inngest: { send: (...args: unknown[]) => inngestSend(...args) },
}));

const axiomCalls: Array<Record<string, unknown>> = [];
vi.mock('../../lib/axiom.js', () => ({
  logAiUsage: (e: Record<string, unknown>) => { axiomCalls.push(e); },
}));

const emitJobEventMock = vi.fn(async () => undefined);
vi.mock('../../jobs/emitter.js', () => ({
  emitJobEvent: (...args: unknown[]) => emitJobEventMock(...args),
}));

vi.mock('../../lib/ai/promptLoader.js', () => ({
  loadAgentPrompt: async () => 'You are the BrightCurios brainstorm agent...',
}));

// Supabase mock: minimal chainable stub.
const insertedSessions: Record<string, unknown>[] = [];
const insertedIdeas: Record<string, unknown>[] = [];
let nextSession: Record<string, unknown> = { id: 'session-1', status: 'awaiting_manual' };
let orgRow: Record<string, unknown> | null = { org_id: 'org-1' };

vi.mock('../../lib/supabase/index.js', () => ({
  createServiceClient: () => ({
    from(table: string) {
      if (table === 'org_memberships') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  single: async () => ({ data: orgRow, error: null }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'brainstorm_sessions') {
        return {
          insert: (row: Record<string, unknown>) => {
            insertedSessions.push(row);
            return {
              select: () => ({ single: async () => ({ data: nextSession, error: null }) }),
            };
          },
          update: (row: Record<string, unknown>) => ({
            eq: async () => ({ data: null, error: null }),
          }),
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: nextSession, error: null }) }),
          }),
        };
      }
      if (table === 'idea_archives') {
        return {
          upsert: async (rows: Record<string, unknown>[]) => {
            insertedIdeas.push(...rows);
            return { error: null };
          },
          select: () => ({ count: 0 }),
        };
      }
      if (table === 'channels') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
      }
      return {} as never;
    },
  }),
}));

vi.mock('../../lib/credits.js', () => ({
  checkCredits: async () => ({ ok: true }),
  debitCredits: async () => ({ ok: true }),
}));

// Fake authenticate middleware — sets userId so handlers proceed.
vi.mock('../../middleware/authenticate.js', () => ({
  authenticate: async (req: { userId: string }) => { req.userId = 'user-1'; },
}));

// ── Setup ───────────────────────────────────────────────────────────────────

let app: FastifyInstance;

beforeEach(async () => {
  axiomCalls.length = 0;
  insertedSessions.length = 0;
  insertedIdeas.length = 0;
  inngestSend.mockClear();
  emitJobEventMock.mockClear();

  const { brainstormRoutes } = await import('../brainstorm.js');
  app = Fastify();
  await app.register(brainstormRoutes, { prefix: '/api/brainstorm' });
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('POST /api/brainstorm/sessions — provider=manual', () => {
  it('creates a session with status=awaiting_manual, emits Axiom, skips Inngest', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/brainstorm/sessions',
      headers: { 'x-internal-key': 'test', 'x-user-id': 'user-1' },
      payload: {
        inputMode: 'blind',
        topic: 'espresso extraction',
        ideasRequested: 3,
        provider: 'manual',
      },
    });

    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.data.status).toBe('awaiting_manual');
    expect(body.data.sessionId).toBe('session-1');

    // Session row persisted with awaiting_manual status
    expect(insertedSessions[0].status).toBe('awaiting_manual');

    // Inngest NOT called (manual is synchronous)
    expect(inngestSend).not.toHaveBeenCalled();

    // Axiom received the manual.awaiting event with full prompt metadata
    const axiomEvent = axiomCalls.find((e) => e.action === 'manual.awaiting');
    expect(axiomEvent).toBeDefined();
    expect(axiomEvent!.provider).toBe('manual');
    expect(axiomEvent!.model).toBe('manual');
    expect(axiomEvent!.status).toBe('awaiting_manual');
    const metadata = axiomEvent!.metadata as Record<string, unknown>;
    expect(metadata.sessionId).toBe('session-1');
    expect(typeof metadata.prompt).toBe('string');
    expect((metadata.prompt as string).length).toBeGreaterThan(0);
    expect(typeof metadata.systemPrompt).toBe('string');
    expect(metadata.input).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test, confirm it fails**

```bash
npm run -w @brighttale/api test -- brainstorm-manual
```
Expected: FAIL — the `POST /sessions` handler currently always calls `inngest.send` and never emits `manual.awaiting`.

- [ ] **Step 3: Commit the failing test**

```bash
git add apps/api/src/routes/__tests__/brainstorm-manual.test.ts
git commit -m "test(brainstorm): add failing manual provider tests"
```

---

## Task 5: Implement `provider='manual'` branch in `POST /sessions`

**Files:**
- Modify: `apps/api/src/routes/brainstorm.ts` (`POST /sessions` handler, around line 202)

The manual branch is synchronous: load prompt, build user message, emit Axiom, persist session with `status='awaiting_manual'`, return. No credit debit (no LLM cost); no Inngest.

- [ ] **Step 1: Replace the handler body**

Locate the `POST /sessions` handler (currently lines 202-274). The current flow is:
1. parse body → 2. getOrgId → 3. checkCredits → 4. build inputJson → 5. insert session (status=running) → 6. emit queued event → 7. inngest.send → 8. return 202.

Insert a `if (body.provider === 'manual') { ... }` branch AFTER step 4 (inputJson is built) and BEFORE step 5. The branch replaces steps 5-7 with manual-specific logic and returns early. Concretely, add this block right before the existing `const { data: session, error: insertErr } = await (` insert call:

```ts
      if (body.provider === 'manual') {
        // Build the prompt synchronously so we can emit it to Axiom and persist
        // the session in awaiting_manual state.
        const systemPrompt = (await loadAgentPrompt('brainstorm')) ?? '';
        const channelContext = body.channelId
          ? await (async () => {
              const { data } = await sb
                .from('channels')
                .select('name, niche, language, tone, presentation_style')
                .eq('id', body.channelId as string)
                .maybeSingle();
              return data;
            })()
          : null;
        const userMessage = buildBrainstormMessage({
          topic: body.topic,
          ideasRequested: body.ideasRequested,
          fineTuning: body.fineTuning,
          referenceUrl: body.referenceUrl,
          channel: channelContext as BrainstormInput['channel'],
        });

        const { data: manualSession, error: manualInsertErr } = await (
          sb.from('brainstorm_sessions') as unknown as {
            insert: (row: Record<string, unknown>) => {
              select: () => { single: () => Promise<{ data: { id: string } | null; error: unknown }> };
            };
          }
        )
          .insert({
            org_id: orgId,
            user_id: request.userId,
            channel_id: body.channelId ?? null,
            project_id: body.projectId ?? null,
            input_mode: body.inputMode,
            input_json: inputJson,
            model_tier: body.modelTier,
            status: 'awaiting_manual',
          })
          .select()
          .single();
        if (manualInsertErr || !manualSession) {
          throw manualInsertErr ?? new ApiError(500, 'Failed to create session', 'DB_ERROR');
        }

        logAiUsage({
          userId: request.userId,
          orgId,
          action: 'manual.awaiting',
          provider: 'manual',
          model: 'manual',
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          durationMs: 0,
          status: 'awaiting_manual',
          metadata: {
            sessionId: manualSession.id,
            stage: 'brainstorm',
            channelId: body.channelId ?? null,
            prompt: userMessage,
            systemPrompt,
            input: inputJson,
          },
        });

        return reply.status(202).send({
          data: { sessionId: manualSession.id, status: 'awaiting_manual' },
          error: null,
        });
      }
```

Add this import at the top of the file (it is not yet imported):

```ts
import { logAiUsage } from '../lib/axiom.js';
```

- [ ] **Step 2: Run the test, confirm it passes**

```bash
npm run -w @brighttale/api test -- brainstorm-manual
```
Expected: PASS — the `POST /sessions — provider=manual` test now green.

- [ ] **Step 3: Confirm other brainstorm tests still pass**

```bash
npm run -w @brighttale/api test -- brainstorm
```
Expected: all brainstorm-related tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/brainstorm.ts
git commit -m "feat(brainstorm): manual provider short-circuits POST /sessions"
```

---

## Task 6: Integration test — `POST /sessions/:id/manual-output`

**Files:**
- Modify: `apps/api/src/routes/__tests__/brainstorm-manual.test.ts`

- [ ] **Step 1: Add the failing test**

Append this `describe` block at the end of the file:

```ts
describe('POST /api/brainstorm/sessions/:id/manual-output', () => {
  it('persists ideas, flips status to completed, emits Axiom manual.completed', async () => {
    nextSession = { id: 'session-1', status: 'awaiting_manual', channel_id: null, org_id: 'org-1', user_id: 'user-1' };

    const pastedOutput = {
      recommendation: { pick: 'BC-IDEA-001', rationale: 'strong hook' },
      ideas: [
        {
          idea_id: 'BC-IDEA-001',
          title: 'Morning routines that compound',
          core_tension: 'discipline vs spontaneity',
          target_audience: 'early-career professionals',
          verdict: 'viable',
        },
        {
          title: 'The science of deep work',
          verdict: 'experimental',
        },
      ],
    };

    const res = await app.inject({
      method: 'POST',
      url: '/api/brainstorm/sessions/session-1/manual-output',
      headers: { 'x-internal-key': 'test', 'x-user-id': 'user-1' },
      payload: { output: pastedOutput },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.ideas).toHaveLength(2);

    expect(insertedIdeas).toHaveLength(2);
    expect(insertedIdeas[0].brainstorm_session_id).toBe('session-1');
    expect(insertedIdeas[0].title).toBe('Morning routines that compound');
    expect(insertedIdeas[1].title).toBe('The science of deep work');

    const completedEvent = axiomCalls.find((e) => e.action === 'manual.completed');
    expect(completedEvent).toBeDefined();
    expect(completedEvent!.status).toBe('success');
  });

  it('returns 409 when the session is already completed', async () => {
    nextSession = { id: 'session-1', status: 'completed', channel_id: null, org_id: 'org-1', user_id: 'user-1' };

    const res = await app.inject({
      method: 'POST',
      url: '/api/brainstorm/sessions/session-1/manual-output',
      headers: { 'x-internal-key': 'test', 'x-user-id': 'user-1' },
      payload: { output: { ideas: [{ title: 'x' }] } },
    });

    expect(res.statusCode).toBe(409);
  });

  it('returns 400 when no ideas found in the pasted output', async () => {
    nextSession = { id: 'session-1', status: 'awaiting_manual', channel_id: null, org_id: 'org-1', user_id: 'user-1' };

    const res = await app.inject({
      method: 'POST',
      url: '/api/brainstorm/sessions/session-1/manual-output',
      headers: { 'x-internal-key': 'test', 'x-user-id': 'user-1' },
      payload: { output: { random: 'blob' } },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error?.message).toMatch(/no ideas/i);
  });
});
```

- [ ] **Step 2: Run the tests, confirm they fail**

```bash
npm run -w @brighttale/api test -- brainstorm-manual
```
Expected: 3 failing tests (the endpoint doesn't exist yet, so all three 404).

- [ ] **Step 3: Commit the failing tests**

```bash
git add apps/api/src/routes/__tests__/brainstorm-manual.test.ts
git commit -m "test(brainstorm): add failing manual-output endpoint tests"
```

---

## Task 7: Implement `POST /sessions/:id/manual-output`

**Files:**
- Modify: `apps/api/src/routes/brainstorm.ts` (add new handler alongside the existing `/sessions/:id/*` routes)

- [ ] **Step 1: Add the handler**

Add this handler inside `brainstormRoutes`, placed alphabetically near the other `/sessions/:id/...` handlers (e.g., right after `POST /sessions/:id/cancel`):

```ts
  /**
   * POST /sessions/:id/manual-output — Submit the output produced externally
   * for a session in `awaiting_manual` status. Persists the ideas, flips the
   * session to `completed`, and emits a `manual.completed` Axiom event.
   */
  fastify.post('/sessions/:id/manual-output', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      if (!request.userId) throw new ApiError(401, 'Not authenticated', 'UNAUTHORIZED');
      const { id } = request.params as { id: string };
      const body = z.object({ output: z.unknown() }).parse(request.body);
      const sb = createServiceClient();

      const { data: session, error: fetchErr } = await sb
        .from('brainstorm_sessions')
        .select('id, status, channel_id, project_id, org_id, user_id')
        .eq('id', id)
        .maybeSingle();
      if (fetchErr) throw fetchErr;
      if (!session) throw new ApiError(404, 'Session not found', 'NOT_FOUND');
      const row = session as Record<string, unknown>;
      if (row.user_id !== request.userId) throw new ApiError(403, 'Forbidden', 'FORBIDDEN');
      if (row.status !== 'awaiting_manual') {
        throw new ApiError(409, `Session is not awaiting manual output (status=${row.status})`, 'CONFLICT');
      }

      const rawIdeas = normalizeIdeas(body.output);
      if (rawIdeas.length === 0) {
        throw new ApiError(400, 'No ideas found in pasted output', 'INVALID_OUTPUT');
      }

      const { count } = await sb.from('idea_archives').select('*', { count: 'exact', head: true });
      const startNum = (count ?? 0) + 1;

      const ideaRows = rawIdeas.map((idea, i) => ({
        idea_id: idea.idea_id ?? `BC-IDEA-${String(startNum + i).padStart(3, '0')}`,
        title: idea.title ?? `Untitled ${i + 1}`,
        core_tension: idea.core_tension ?? '',
        target_audience: idea.target_audience ?? '',
        verdict: idea.verdict === 'viable' || idea.verdict === 'weak' || idea.verdict === 'experimental'
          ? idea.verdict
          : 'experimental',
        discovery_data: JSON.stringify({
          angle: idea.angle,
          search_intent: idea.search_intent,
          primary_keyword: idea.primary_keyword,
          scroll_stopper: idea.scroll_stopper,
          curiosity_gap: idea.curiosity_gap,
          monetization: idea.monetization,
          repurpose_potential: idea.repurpose_potential,
          repurposing: idea.repurposing,
          risk_flags: idea.risk_flags,
          verdict_rationale: idea.verdict_rationale,
        }),
        source_type: 'manual',
        channel_id: row.channel_id ?? null,
        project_id: row.project_id ?? null,
        brainstorm_session_id: id,
        user_id: row.user_id,
        org_id: row.org_id,
      }));

      const { error: insErr } = await (sb.from('idea_archives') as unknown as {
        upsert: (rows: Record<string, unknown>[], opts?: unknown) => Promise<{ error: unknown }>;
      }).upsert(ideaRows, { onConflict: 'idea_id', ignoreDuplicates: true });
      if (insErr) throw insErr;

      // Recommendation (optional, matches the AI flow shape).
      let recommendation: { pick?: string; rationale?: string } | null = null;
      if (body.output && typeof body.output === 'object' && 'recommendation' in (body.output as Record<string, unknown>)) {
        recommendation = (body.output as Record<string, unknown>).recommendation as { pick?: string; rationale?: string } | null;
      }

      await (sb.from('brainstorm_sessions') as unknown as {
        update: (row: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<unknown> };
      })
        .update({
          status: 'completed',
          output_json: body.output,
          ...(recommendation ? { recommendation_json: recommendation } : {}),
        })
        .eq('id', id);

      logAiUsage({
        userId: request.userId,
        orgId: (row.org_id as string) ?? null,
        action: 'manual.completed',
        provider: 'manual',
        model: 'manual',
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        durationMs: 0,
        status: 'success',
        metadata: {
          sessionId: id,
          stage: 'brainstorm',
          output: body.output,
          ideaCount: ideaRows.length,
        },
      });

      return reply.send({ data: { ideas: ideaRows, recommendation }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });
```

- [ ] **Step 2: Run the tests, confirm all three pass**

```bash
npm run -w @brighttale/api test -- brainstorm-manual
```
Expected: 4/4 tests PASS (the 1 from Task 4 + 3 from Task 6).

- [ ] **Step 3: Confirm the wider test suite still passes**

```bash
npm run -w @brighttale/api test
```
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/brainstorm.ts
git commit -m "feat(brainstorm): POST /sessions/:id/manual-output endpoint"
```

---

## Task 8: Frontend modal component — `ManualOutputDialog`

**Files:**
- Create: `apps/app/src/components/engines/ManualOutputDialog.tsx`

Kept as a small, self-contained component so Research/Draft/Review can import it later without touching Brainstorm.

- [ ] **Step 1: Write the component**

```tsx
'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (parsed: unknown) => Promise<void>;
  title?: string;
  description?: string;
  submitLabel?: string;
  loading?: boolean;
}

export function ManualOutputDialog({
  open,
  onOpenChange,
  onSubmit,
  title = 'Paste manual output',
  description = 'Retrieve the prompt from Axiom, run it in your AI tool of choice, then paste the JSON output below.',
  submitLabel = 'Submit',
  loading = false,
}: Props) {
  const [raw, setRaw] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      toast.error('Invalid JSON. Paste the full BC_BRAINSTORM_OUTPUT object.');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(parsed);
      setRaw('');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder='{"ideas": [ ... ]}'
          rows={14}
          className="font-mono text-xs"
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting || loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!raw.trim() || submitting || loading}>
            {submitting || loading ? 'Submitting…' : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run -w @brighttale/app typecheck
```
Expected: clean. (Imports `Dialog`, `Textarea`, `Button` from shadcn/ui — these already exist in `@/components/ui/*`; if either doesn't, run `npx shadcn add dialog textarea button` from `apps/app`.)

- [ ] **Step 3: Commit**

```bash
git add apps/app/src/components/engines/ManualOutputDialog.tsx
git commit -m "feat(engines): ManualOutputDialog reusable paste-output modal"
```

---

## Task 9: Add `manual` to BrainstormEngine provider picker

**Files:**
- Modify: `apps/app/src/components/engines/BrainstormEngine.tsx` (the provider/model `<Select>` — search for existing `openai`/`anthropic`/`gemini` options)

- [ ] **Step 1: Locate the provider picker**

Run:
```bash
grep -n "SelectItem value=\"gemini\"\|SelectItem value=\"openai\"\|SelectItem value=\"anthropic\"\|SelectItem value=\"ollama\"" apps/app/src/components/engines/BrainstormEngine.tsx
```
Expected: a list of existing `SelectItem` lines. Take note of the nearest context (section name, surrounding JSX).

- [ ] **Step 2: Add a `manual` option**

Immediately below the last existing `<SelectItem>` in the provider select, add:

```tsx
<SelectItem value="manual">Manual (paste output)</SelectItem>
```

- [ ] **Step 3: Typecheck**

```bash
npm run -w @brighttale/app typecheck
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/app/src/components/engines/BrainstormEngine.tsx
git commit -m "feat(brainstorm-ui): expose manual provider in picker"
```

---

## Task 10: Handle `awaiting_manual` response — open the modal

**Files:**
- Modify: `apps/app/src/components/engines/BrainstormEngine.tsx`

- [ ] **Step 1: Import the modal and add state**

Add to the import block at the top:
```tsx
import { ManualOutputDialog } from './ManualOutputDialog';
```

Inside the component (near other `useState` calls), add:
```tsx
const [manualSessionId, setManualSessionId] = useState<string | null>(null);
```

- [ ] **Step 2: Branch the Generate submit handler on `awaiting_manual`**

Find where the engine posts to `/api/brainstorm/sessions` (look for `fetch('/api/brainstorm/sessions'` with method `'POST'`). In the response-handling block, after parsing the response body, branch:

```tsx
if (json.data?.status === 'awaiting_manual') {
  setManualSessionId(json.data.sessionId);
  // Do NOT set activeGenerationId — no SSE stream exists for manual sessions.
  return;
}
```

This branch short-circuits the AI path. The rest of the AI handler (SSE subscribe, progress float) stays unchanged.

- [ ] **Step 3: Add the submit handler + render the modal**

Near other handlers add:
```tsx
async function handleManualOutputSubmit(parsed: unknown) {
  if (!manualSessionId) return;
  const res = await fetch(`/api/brainstorm/sessions/${manualSessionId}/manual-output`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ output: parsed }),
  });
  const json = await res.json();
  if (json.error) {
    toast.error(json.error.message ?? 'Failed to submit output');
    return;
  }
  const newIdeas = (json.data?.ideas ?? []) as Idea[];
  setIdeas(newIdeas);
  setSessionId(manualSessionId);
  setManualSessionId(null);
  toast.success(`${newIdeas.length} ideas saved`);
  tracker.trackAction('completed', { source: 'manual', ideaCount: newIdeas.length });
}
```

At the end of the JSX tree (next to `<GenerationProgressFloat />`), add:
```tsx
<ManualOutputDialog
  open={!!manualSessionId}
  onOpenChange={(open) => { if (!open) setManualSessionId(null); }}
  onSubmit={handleManualOutputSubmit}
  title="Paste brainstorm output"
  description="Retrieve the prompt from Axiom, run it in an external AI, then paste the full BC_BRAINSTORM_OUTPUT JSON below."
  submitLabel="Save ideas"
/>
```

- [ ] **Step 4: Manual smoke test**

Start the dev stack:
```bash
npm run dev
```
Visit a channel's Brainstorm page, select **Manual (paste output)** in the provider dropdown, submit with a topic, confirm:
1. Spinner / AI progress does NOT appear.
2. Modal opens.
3. In Axiom dev dataset, a `manual.awaiting` event is logged with `metadata.prompt` set.
4. Paste a minimal valid `BC_BRAINSTORM_OUTPUT` (`{"ideas":[{"title":"Test idea","verdict":"viable"}]}`), click Save.
5. Modal closes; one idea card renders.
6. A `manual.completed` event appears in Axiom.

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/components/engines/BrainstormEngine.tsx
git commit -m "feat(brainstorm-ui): modal for manual provider output paste"
```

---

## Task 11: Remove the AI/Manual tabs from BrainstormEngine

**Files:**
- Modify: `apps/app/src/components/engines/BrainstormEngine.tsx`

The `ManualModePanel` render + its wrapping `TabsContent` + `handleManualImport` are now redundant. Other engines (Research/Draft/Review) still use `ManualModePanel` — do not delete the file.

- [ ] **Step 1: Delete the Manual tab**

Find the `TabsContent` that renders `<ManualModePanel ... onImport={handleManualImport} ... />` (around line 880). Delete the entire `TabsContent` block. Also remove the corresponding `TabsTrigger` for the Manual tab.

If removing the trigger leaves only one remaining trigger, collapse the `Tabs` wrapper too — but only if there is exactly one tab left. Otherwise keep the `Tabs` intact (it may host other modes like AI/Ollama).

- [ ] **Step 2: Delete `handleManualImport` and the `ManualModePanel` import**

Remove:
```ts
import { ManualModePanel } from '@/components/ai/ManualModePanel';
```

Remove the entire `handleManualImport` function (currently ~lines 462-573).

- [ ] **Step 3: Typecheck + build**

```bash
npm run -w @brighttale/app typecheck
npm run -w @brighttale/app build
```
Expected: clean.

- [ ] **Step 4: Manual smoke test (regression)**

Visit the Brainstorm page:
1. The "AI Generation / Manual (ChatGPT/Gemini)" tab toggle is gone.
2. AI generation still works (select Gemini/OpenAI/Anthropic, generate, see cards).
3. Manual provider still works (from Task 10's smoke test).

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/components/engines/BrainstormEngine.tsx
git commit -m "refactor(brainstorm-ui): remove AI/Manual tab toggle; manual is a provider now"
```

---

## Task 12: Resume an `awaiting_manual` session on page load

**Files:**
- Modify: `apps/app/src/components/engines/BrainstormEngine.tsx` (the `useEffect` that hydrates from `sessionId` / running sessions)

When a user cancels the modal without submitting, the session stays `awaiting_manual`. If they navigate back or reload, the modal should reopen.

- [ ] **Step 1: Locate the session hydration effect**

Find the `useEffect` around line 215-260 that fetches `/api/brainstorm/sessions/${ctxSessionId}` and sets initial ideas. Note how it populates `ideas`, `sessionId`, etc.

- [ ] **Step 2: Detect `awaiting_manual` and open the modal**

Inside that effect, after the response is parsed (`const sess = json.data.session`), add:

```tsx
if (sess.status === 'awaiting_manual') {
  setManualSessionId(sess.id);
  return; // Don't load ideas for an incomplete session
}
```

Place it immediately after the session is available but before existing idea-loading logic.

- [ ] **Step 3: Manual smoke test**

1. Select Manual provider, click Generate, close the modal with Cancel.
2. Reload the page (or navigate away + back).
3. Modal reopens automatically with an empty textarea.
4. Submit a valid output → ideas load as normal.

- [ ] **Step 4: Commit**

```bash
git add apps/app/src/components/engines/BrainstormEngine.tsx
git commit -m "feat(brainstorm-ui): resume awaiting_manual session by reopening modal"
```

---

## Task 13: Docs update — `docs-config.yaml` routing check

**Files:**
- Modify: likely `docs-site/` or `docs/` pages that describe the Brainstorm flow. Check `.claude/docs-config.yaml` for the routing table.

- [ ] **Step 1: Identify docs to update**

```bash
grep -n "BrainstormEngine\|manual mode\|ManualModePanel" docs/**/*.md apps/docs-site/**/*.mdx 2>/dev/null | head -20
```

If a page describes the BrainstormEngine manual mode, update it to describe the new Manual provider flow (pick Manual in model picker, paste output in modal, prompt fetched from Axiom).

- [ ] **Step 2: Write or update the doc**

Add a short section to whichever Brainstorm feature page exists:

```md
### Manual provider

Selecting **Manual** as the model emits the full prompt payload to Axiom instead of calling an LLM. The engine persists the session in `awaiting_manual` status and opens a modal asking you to paste the JSON output produced externally.

- Retrieve the prompt from the Axiom dataset (look for events where `action = 'manual.awaiting'` and `metadata.sessionId` matches your session).
- Run the prompt in the AI tool of your choice.
- Paste the raw `BC_BRAINSTORM_OUTPUT` JSON into the modal's textarea.
- On submit, the engine persists the ideas and advances like any AI-generated session.

If you dismiss the modal without submitting, the session stays in `awaiting_manual`. Reloading the page reopens the modal.
```

If no existing page describes Brainstorm manual mode, skip this step and note "missing docs" in the task completion report.

- [ ] **Step 3: Commit**

```bash
git add docs apps/docs-site 2>/dev/null
git commit -m "docs(brainstorm): describe Manual provider flow" || echo "(no docs changes)"
```

---

## Final verification

- [ ] **Step 1: Full test suite**

```bash
npm run typecheck
npm run test
```
Expected: all green.

- [ ] **Step 2: End-to-end manual smoke**

`npm run dev` → Brainstorm page → select Manual → generate → check Axiom → paste minimal output → confirm ideas saved and session completed.

- [ ] **Step 3: Push the branch**

```bash
git push
```

- [ ] **Step 4: Review out-of-scope follow-ups**

Open tickets (or TODO notes) for:
- Replicate the Manual provider pattern to Research, Draft, Review engines.
- Delete `apps/app/src/components/ai/ManualModePanel.tsx` once all engines stop using it.
- Wire `ai_provider_configs` into the runtime router (separate refactor).
