# Wave 4.1 — PreviewEngine Refactor (off bridge)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `PreviewEngine` from the legacy prop interface (`channelId`, `context`, `onComplete`, `onBack`) to the XState actor-based pattern used by Brainstorm/Research/Draft/Review/Assets. Engine reads pipeline state via `usePipelineActor()` + `useSelector()` and dispatches typed events directly to the machine.

**Architecture:** PreviewEngine becomes a thin view layer. It accepts no pipeline-state props — only the optional `mode` flag (preview has no `generate | import` toggle, but the prop signature must match the orchestrator's render contract for parity with other engines, so we keep it as a degenerate optional). Upstream stage data is read from machine context via selectors. The engine fires `PREVIEW_COMPLETE` and `NAVIGATE` events directly. The orchestrator stops constructing legacy props for preview.

**Tech Stack:** XState v5, @xstate/react v5, Vitest 4 + @testing-library/react, React 19.

**Parent plan:** [`2026-04-24-pipeline-xstate-refactor.md`](./2026-04-24-pipeline-xstate-refactor.md)
**Design spec:** [`../specs/2026-04-24-pipeline-xstate-refactor-design.md`](../specs/2026-04-24-pipeline-xstate-refactor-design.md)
**Depends on:** Wave 4 (StandaloneEngineHost + first five engines refactored)
**Branch:** `feat/pipeline-orchestrator-refactor`

---

## Pre-flight

- [ ] Wave 4 commits all landed (`7175149` — AssetsEngine off bridge)
- [ ] Bridge in `apps/app/src/components/pipeline/PipelineOrchestrator.tsx:311-318` still wraps preview + publish only
- [ ] `npm run test:app` and `npm run typecheck` green on this branch
- [ ] Working tree clean (or only contains files orthogonal to this wave)

---

## Pre-commit hook

Pre-commit hook (typecheck + lint-staged) is operational. Do **not** pass `--no-verify`. If the hook fails, fix the underlying issue before recommitting.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `apps/app/src/components/engines/__tests__/PreviewEngine.test.tsx` | Engine unit test mounted with a real actor | Create |
| `apps/app/src/components/engines/PreviewEngine.tsx` | Engine view; reads actor + dispatches events | Modify (props + body rewrite) |
| `apps/app/src/components/pipeline/PipelineOrchestrator.tsx` | Bridge narrowed to publish-only | Modify (line 311-318 bridge generic, line 331-339 case) |

The standalone draft-detail page (`apps/app/src/app/[locale]/(app)/channels/[id]/drafts/[draftId]/page.tsx`) **does not currently render PreviewEngine**, so no standalone-host wrapping is required in this wave (verify in Task 5).

---

## Tasks

### Task 1: Write Failing Test for PreviewEngine

**Files:**
- Create: `apps/app/src/components/engines/__tests__/PreviewEngine.test.tsx`

The test mounts `PreviewEngine` inside a `<PipelineActorProvider>` whose actor has stage results pre-seeded for brainstorm, research, draft, and assets — putting the machine at the `preview.idle` state. It stubs the two fetch endpoints PreviewEngine calls (`/api/content-drafts/:id` and `/api/assets?content_id=:id`) and asserts that clicking "Approve & Publish" dispatches `PREVIEW_COMPLETE` to the actor with the right `PreviewResult` shape.

- [ ] **Step 1: Create the test file**

```typescript
// apps/app/src/components/engines/__tests__/PreviewEngine.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createActor } from 'xstate'
import React from 'react'
import { pipelineMachine } from '@/lib/pipeline/machine'
import { PipelineActorProvider } from '@/providers/PipelineActorProvider'
import { PreviewEngine } from '../PreviewEngine'
import { DEFAULT_PIPELINE_SETTINGS, DEFAULT_CREDIT_SETTINGS } from '../types'

vi.mock('@/hooks/use-analytics', () => ({
  useAnalytics: () => ({ track: vi.fn() }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))

const STUB_DRAFT = {
  id: 'draft-1',
  title: 'Stub Draft',
  draft_json: {
    blog: {
      full_draft: '## Section A\n\nBody A.\n\n## Section B\n\nBody B.',
      outline: [{ h2: 'Section A' }, { h2: 'Section B' }],
    },
  },
  review_feedback_json: {
    publication_plan: {
      blog: {
        categories: ['cat-1'],
        tags: ['tag-1'],
        final_seo: { title: 'SEO Title', slug: 'seo-slug', meta_description: 'SEO desc' },
      },
    },
  },
}

const STUB_ASSETS = [
  { id: 'asset-feat', source_url: 'https://x/f.jpg', webp_url: null, alt_text: 'feat alt', role: 'featured_image' },
  { id: 'asset-1',    source_url: 'https://x/1.jpg', webp_url: null, alt_text: 's1 alt',   role: 'body_section_1' },
  { id: 'asset-2',    source_url: 'https://x/2.jpg', webp_url: null, alt_text: 's2 alt',   role: 'body_section_2' },
]

function mountAtPreviewStage() {
  const actor = createActor(pipelineMachine, {
    input: {
      projectId: 'proj-1',
      channelId: 'ch-1',
      projectTitle: 'T',
      pipelineSettings: DEFAULT_PIPELINE_SETTINGS,
      creditSettings: DEFAULT_CREDIT_SETTINGS,
      initialStageResults: {
        brainstorm: { ideaId: 'idea-1', ideaTitle: 'Idea T', ideaVerdict: 'viable', ideaCoreTension: 'tension', completedAt: new Date().toISOString() },
        research:   { researchSessionId: 'rs-1', approvedCardsCount: 3, researchLevel: 'medium', completedAt: new Date().toISOString() },
        draft:      { draftId: 'draft-1', draftTitle: 'Stub Draft', draftContent: '', completedAt: new Date().toISOString() },
        review:     { score: 92, verdict: 'approved', feedbackJson: STUB_DRAFT.review_feedback_json, iterationCount: 1, completedAt: new Date().toISOString() },
        assets:     { assetIds: ['asset-feat', 'asset-1', 'asset-2'], featuredImageUrl: 'https://x/f.jpg', completedAt: new Date().toISOString() },
      },
    },
  }).start()

  const utils = render(
    <PipelineActorProvider value={actor}>
      <PreviewEngine />
    </PipelineActorProvider>,
  )
  return { actor, ...utils }
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes('/api/content-drafts/draft-1')) {
        return { ok: true, json: async () => ({ data: STUB_DRAFT, error: null }) } as Response
      }
      if (String(url).includes('/api/assets?content_id=draft-1')) {
        return { ok: true, json: async () => ({ data: { assets: STUB_ASSETS }, error: null }) } as Response
      }
      return { ok: true, json: async () => ({ data: null, error: null }) } as Response
    }),
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('PreviewEngine', () => {
  it('reads draftId from actor and loads draft + assets without legacy props', async () => {
    mountAtPreviewStage()
    // Loader visible first, then the approve button after fetches resolve.
    await screen.findByRole('button', { name: /approve.*publish/i })
  })

  it('dispatches PREVIEW_COMPLETE with PreviewResult shape on approve', async () => {
    const user = userEvent.setup()
    const { actor } = mountAtPreviewStage()
    const approveBtn = await screen.findByRole('button', { name: /approve.*publish/i })

    await user.click(approveBtn)

    // XState v5 `assign` actions are synchronous; `await user.click(...)` already
    // flushes React updates + microtasks, so the snapshot is settled here. Match
    // the BrainstormEngine.test.tsx convention — no `waitFor` wrapper.
    const preview = actor.getSnapshot().context.stageResults.preview
    expect(preview).toBeDefined()
    expect(preview!.imageMap).toMatchObject({
      featured_image: 'asset-feat',
      body_section_1: 'asset-1',
      body_section_2: 'asset-2',
    })
    expect(preview!.categories).toEqual(['cat-1'])
    expect(preview!.tags).toEqual(['tag-1'])
    expect(preview!.seoOverrides).toEqual({ title: 'SEO Title', slug: 'seo-slug', metaDescription: 'SEO desc' })
  })

  it('dispatches NAVIGATE to assets when Back is clicked', async () => {
    const user = userEvent.setup()
    const { actor } = mountAtPreviewStage()
    await screen.findByRole('button', { name: /approve.*publish/i })

    const backBtn = screen.getByRole('button', { name: /^back$/i })
    await user.click(backBtn)

    // NAVIGATE to 'assets' rewinds the machine synchronously.
    expect(actor.getSnapshot().value).toMatchObject({ assets: expect.anything() })
  })
})
```

- [ ] **Step 2: Run — confirm failure**

```bash
npx vitest run apps/app/src/components/engines/__tests__/PreviewEngine.test.tsx
```

Expected: tests fail because `PreviewEngine` still requires `channelId`, `context`, `draftId`, `onComplete` props. TypeScript will report missing-required-prop errors and the test will not mount.

---

### Task 2: Refactor PreviewEngine to read from actor + dispatch events

**Files:**
- Modify: `apps/app/src/components/engines/PreviewEngine.tsx`

The engine signature collapses to no required props. It pulls `draftId`, `channelId`, `projectId`, plus brainstorm/research/draft/assets stage results from the actor via selectors. It rebuilds the `trackerContext` object locally for `usePipelineTracker` (same fields, sourced from selectors). `onComplete` becomes `actor.send({ type: 'PREVIEW_COMPLETE', result })`, and `onBack` becomes a local `navigate(stage)` helper that dispatches `NAVIGATE`.

- [ ] **Step 1: Replace the imports and component body**

Replace lines 1-24 (imports + types) with:

```typescript
'use client';

import { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Loader2, ArrowRight, Eye, X, Plus, ImageIcon, AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useSelector } from '@xstate/react';
import { usePipelineActor } from '@/hooks/usePipelineActor';
import { usePipelineTracker } from '@/hooks/use-pipeline-tracker';
import { ContextBanner } from './ContextBanner';
import { markdownToHtml } from '@/lib/utils';
import type { PipelineContext, PipelineStage, PreviewResult } from './types';
```

(Removed: `StageResult` import — no longer used; `PipelineEngineProps`-style imports — none.)

- [ ] **Step 2: Replace the props interface and component opening**

Find lines 28-34 (the `PreviewEngineProps` interface) and lines 242-248 (component signature). Replace both with:

```typescript
/* PreviewEngine reads everything from the pipeline actor — no pipeline-state props.
 * The component is rendered by PipelineOrchestrator only; standalone usage would
 * require <StandaloneEngineHost stage="preview"> like ReviewEngine/AssetsEngine. */
export function PreviewEngine() {
  const actor = usePipelineActor();
  const channelId = useSelector(actor, (s) => s.context.channelId);
  const projectId = useSelector(actor, (s) => s.context.projectId);
  const brainstormResult = useSelector(actor, (s) => s.context.stageResults.brainstorm);
  const researchResult  = useSelector(actor, (s) => s.context.stageResults.research);
  const draftResult     = useSelector(actor, (s) => s.context.stageResults.draft);
  const reviewResult    = useSelector(actor, (s) => s.context.stageResults.review);
  const assetsResult    = useSelector(actor, (s) => s.context.stageResults.assets);
  const draftId = draftResult?.draftId ?? '';

  const trackerContext: PipelineContext = {
    channelId,
    projectId,
    ideaId: brainstormResult?.ideaId,
    ideaTitle: brainstormResult?.ideaTitle,
    ideaVerdict: brainstormResult?.ideaVerdict,
    ideaCoreTension: brainstormResult?.ideaCoreTension,
    brainstormSessionId: brainstormResult?.brainstormSessionId,
    researchSessionId: researchResult?.researchSessionId,
    researchLevel: researchResult?.researchLevel,
    researchPrimaryKeyword: researchResult?.primaryKeyword,
    researchSecondaryKeywords: researchResult?.secondaryKeywords,
    researchSearchIntent: researchResult?.searchIntent,
    draftId,
    draftTitle: draftResult?.draftTitle,
    personaId: draftResult?.personaId,
    personaName: draftResult?.personaName,
    personaSlug: draftResult?.personaSlug,
    personaWpAuthorId: draftResult?.personaWpAuthorId,
    reviewScore: reviewResult?.score,
    reviewVerdict: reviewResult?.verdict,
    assetIds: assetsResult?.assetIds,
    featuredImageUrl: assetsResult?.featuredImageUrl,
  };

  function navigate(toStage?: PipelineStage) {
    actor.send({ type: 'NAVIGATE', toStage: toStage ?? 'assets' });
  }

  // Fetch state
  const [busy, setBusy] = useState(true);
  const [draft, setDraft] = useState<DraftData | null>(null);
  const [assets, setAssets] = useState<ContentAsset[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const tracker = usePipelineTracker('preview', trackerContext);
```

- [ ] **Step 3: Replace `onComplete` call site**

In `handleApprove` (currently around line 437-468), replace `onComplete(result);` (line 467) with:

```typescript
    actor.send({ type: 'PREVIEW_COMPLETE', result });
```

- [ ] **Step 4: Replace `<ContextBanner>` props (3 occurrences)**

Find every `<ContextBanner stage="preview" context={context} onBack={onBack} />` (3 sites: error path, loading path, render path). Replace each with:

```tsx
<ContextBanner stage="preview" context={trackerContext} onBack={navigate} />
```

- [ ] **Step 5: Replace the Back button onClick**

Around the action-button block (currently line 696):

```tsx
<Button variant="outline" onClick={() => onBack?.('assets')} size="sm">
  Back
</Button>
```

becomes:

```tsx
<Button variant="outline" onClick={() => navigate('assets')} size="sm">
  Back
</Button>
```

- [ ] **Step 6: Run — confirm pass**

```bash
npx vitest run apps/app/src/components/engines/__tests__/PreviewEngine.test.tsx
```

Expected: 3 tests pass. If any selector returns `undefined` because `mountAtPreviewStage` did not seed that stage result, fix the seed in the test (the engine only reads optional fields).

- [ ] **Step 7: Type-check the engine in isolation**

```bash
npm run typecheck --workspace @brighttale/app
```

Expected: zero errors. If TypeScript flags an unused import (`StageResult`, `PipelineStage` if it ended up unused, etc.), remove it.

---

### Task 3: Update PipelineOrchestrator to drop the bridge for preview

**Files:**
- Modify: `apps/app/src/components/pipeline/PipelineOrchestrator.tsx`

Narrow the `LegacyStage` type to just `'publish'`. Drop the `PREVIEW_COMPLETE` callback and the `bridge('preview')` spread from the preview case. Keep `buildLegacyContext` and the `bridge` helper alive for publish — Wave 4.2 deletes them.

- [ ] **Step 1: Narrow the LegacyStage type**

Open `apps/app/src/components/pipeline/PipelineOrchestrator.tsx`. Find:

```typescript
type LegacyStage = 'preview' | 'publish'
```

(currently around line 311) and change it to:

```typescript
type LegacyStage = 'publish'
```

- [ ] **Step 2: Update the TODO comment**

Replace the comment block at lines 304-310 with:

```typescript
    // TODO(pipeline-refactor-v2): PublishEngine still consumes the legacy
    // channelId/context/onComplete prop surface. The `buildLegacyContext`
    // helper and `bridge<LegacyStage>` function below exist solely for it.
    // Wave 4.2 deletes this block + helper + simplifies publish to
    // `<PublishEngine draft={draftData} />`.
```

- [ ] **Step 3: Simplify the preview case statement**

Find the preview case (currently lines 331-339):

```tsx
      case 'preview':
        return (
          <PreviewEngine
            draftId={ctx.stageResults.draft?.draftId || ''}
            {...(bridge('preview') as any)}
            onComplete={(r: any) => actorRef.send({ type: 'PREVIEW_COMPLETE', result: r })}
            onBack={() => handleNavigate('assets')}
          />
        )
```

Replace with:

```tsx
      case 'preview':
        return <PreviewEngine />
```

- [ ] **Step 4: Type-check + run orchestrator behavior tests**

```bash
npm run typecheck --workspace @brighttale/app
npx vitest run apps/app/src/components/pipeline/__tests__/PipelineOrchestrator.behavior.test.tsx
```

Expected: typecheck clean; orchestrator behavior tests pass. If a behavior test asserted `actorRef.send({ type: 'PREVIEW_COMPLETE' ... })` from the orchestrator's onComplete callback, update the assertion to expect the engine itself dispatched it (or remove if no longer applicable).

---

### Task 4: Run the Full App Test Suite + Final Type Sweep

**Files:**
- Run: `npm run test:app`, `npm run typecheck`, `npm run lint`

- [ ] **Step 1: Run app tests**

```bash
npm run test:app
```

Expected: all pipeline + engine tests green. Pre-existing unrelated failures (per `project_preexisting_test_failures.md` memory) are acceptable but log them so Wave 5's parity check can compare.

- [ ] **Step 2: Run typecheck across all workspaces**

```bash
npm run typecheck
```

Expected: zero errors.

- [ ] **Step 3: Run lint**

```bash
npm run lint
```

Expected: zero errors. Warnings allowed if matching baseline; new warnings added by this wave must be fixed.

---

### Task 5: Verify Standalone Pages Are Unaffected + Commit

**Files:**
- Verify: `apps/app/src/app/[locale]/(app)/channels/[id]/drafts/[draftId]/page.tsx`

- [ ] **Step 1: Confirm draftId page does not render PreviewEngine**

```bash
grep -n "PreviewEngine" apps/app/src/app/[locale]/\(app\)/channels/[id]/drafts/[draftId]/page.tsx
```

Expected: no matches. (PublishEngine matches are expected — Wave 4.2 handles them.)

If a match appears, the page renders PreviewEngine standalone and must wrap it in `<StandaloneEngineHost stage="preview">` (mirror of how ReviewEngine and AssetsEngine are wrapped on lines 274-292 / 297-319). Add the wrapping in this task — do **not** ship without it, or that route will throw `usePipelineActor must be used inside <PipelineActorProvider>`.

- [ ] **Step 2: Stage and commit**

```bash
git add apps/app/src/components/engines/__tests__/PreviewEngine.test.tsx \
        apps/app/src/components/engines/PreviewEngine.tsx \
        apps/app/src/components/pipeline/PipelineOrchestrator.tsx
git commit -m "refactor(engines): PreviewEngine reads from pipeline actor; orchestrator bridge narrowed to publish"
```

The pre-commit hook (typecheck + lint-staged) must pass without `--no-verify`. If it fails, fix the underlying issue and create a NEW commit.

---

## Wave-specific guardrails

### State reads — selector source of truth

Every field PreviewEngine reads from `trackerContext` must come from a `useSelector(actor, ...)` call against the machine context, **not** from a prop. The `trackerContext` object is rebuilt locally for `usePipelineTracker` only — it is not a re-implementation of the legacy bridge.

### `composedHtml` stays transient

`composedHtml` is included in `PreviewResult` because the type already requires it (existing contract). It is large client-side state. Do not add a new selector for it — it is computed inside the engine and shipped through the `PREVIEW_COMPLETE` event. The machine stores it in `stageResults.preview` per the existing `saveStageResult('preview')` action.

### Tracker context completeness

`PreviewEngine`'s tracker fields must mirror what AssetsEngine builds (it is the immediate upstream stage). If AssetsEngine adds a tracker field later, PreviewEngine should pick it up via the same selector pattern.

### Orchestrator bridge must keep working for publish

Do not delete `buildLegacyContext` or the `bridge` helper in this wave. Publish still consumes both. Wave 4.2 deletes them.

### `(as any)` removal

Strip the two `as any` casts in the preview case (`...(bridge('preview') as any)` and `(r: any) =>`) by deleting the call sites entirely. Do **not** carry them forward.

---

## Exit criteria

### Code health
- [ ] `npm run test:app` passes (or matches pre-existing baseline failure list)
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] No `--no-verify` in any commit on this branch

### Architecture
- [ ] `PreviewEngine` props: zero pipeline-state props (no `channelId`, no `context`, no `onComplete`, no `onBack`, no `draftId`)
- [ ] PreviewEngine reads `draftId` from `s.context.stageResults.draft?.draftId`
- [ ] PreviewEngine reads `assetIds` + `featuredImageUrl` from `s.context.stageResults.assets`
- [ ] PreviewEngine dispatches `PREVIEW_COMPLETE` directly (orchestrator no longer wraps it)
- [ ] PreviewEngine dispatches `NAVIGATE` for back navigation (no `onBack` prop)
- [ ] Orchestrator `LegacyStage` type narrowed to `'publish'`
- [ ] Orchestrator preview case is one line: `return <PreviewEngine />`

### Tests
- [ ] `PreviewEngine.test.tsx` exists with three test cases (loads, approves, navigates back)
- [ ] All three cases pass

---

## Risks

| Risk | Mitigation |
|---|---|
| Tracker context loses fields after refactor → analytics regression | Build the local `trackerContext` to mirror what AssetsEngine builds; cross-reference the two engines side-by-side during code review. |
| Approve fires `PREVIEW_COMPLETE` but machine context shape mismatch crashes the assign | The `saveStageResult('preview')` action already accepts `PreviewResult`. The shape did not change in this wave. Test asserts the result is stored. |
| `onBack` removal breaks "back to assets" flow | The dedicated test case (`dispatches NAVIGATE to assets when Back is clicked`) catches this. |
| PreviewEngine standalone usage exists somewhere we missed | Task 5 grep across the standalone draft-detail page. If a match appears, wrap in `StandaloneEngineHost` before commit. |
| Orchestrator behavior tests reference old `PREVIEW_COMPLETE` callback | Task 3 step 4 runs them; expected fixture update if any test asserted the orchestrator's onComplete wrapper. |

---

## Out of Scope (handled in Wave 4.2)

- PublishEngine refactor
- Deletion of `buildLegacyContext` and `bridge` helper
- Standalone draft-detail page wrapping for `<PublishEngine>`
- FORMAT_COSTS dedup, provider wiring, docs sync — all stay in Wave 5
