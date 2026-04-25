# Wave 4.2 — PublishEngine Refactor (off bridge) + Bridge Deletion

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `PublishEngine` to the actor-based pattern (matching Wave 4.1 PreviewEngine work), then delete the legacy `bridge()` helper and `buildLegacyContext()` from `PipelineOrchestrator`. Wrap the standalone draft-detail page's `<PublishEngine>` in `<StandaloneEngineHost>` so it has a `PipelineActorProvider` to read from. End state: orchestrator drops to ~250 lines, every engine reads from the actor, bridge fully gone.

**Architecture:** PublishEngine becomes a thin view layer that reads `draftId`, `channelId`, `previewResult` (image map, alt texts, categories, tags, SEO overrides, publish date), `assetsResult` (asset IDs, featured image URL), and the persona's WP author ID from machine context via selectors. It dispatches `PUBLISH_COMPLETE` and `NAVIGATE` directly. The orchestrator's preview/publish case statements both become one-liners.

**Tech Stack:** XState v5, @xstate/react v5, Vitest 4 + @testing-library/react, React 19.

**Parent plan:** [`2026-04-24-pipeline-xstate-refactor.md`](./2026-04-24-pipeline-xstate-refactor.md)
**Design spec:** [`../specs/2026-04-24-pipeline-xstate-refactor-design.md`](../specs/2026-04-24-pipeline-xstate-refactor-design.md)
**Depends on:** Wave 4.1 (PreviewEngine off bridge; bridge LegacyStage type narrowed to `'publish'`)
**Branch:** `feat/pipeline-orchestrator-refactor`

---

## Pre-flight

- [ ] Wave 4.1 commits landed (PreviewEngine off bridge)
- [ ] Bridge in `apps/app/src/components/pipeline/PipelineOrchestrator.tsx` still wraps publish only (`LegacyStage = 'publish'`)
- [ ] `npm run test:app` and `npm run typecheck` green
- [ ] Working tree clean

---

## Pre-commit hook

Pre-commit hook (typecheck + lint-staged) is operational. Do **not** pass `--no-verify`. If the hook fails, fix the underlying issue and recommit.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `apps/app/src/components/engines/__tests__/PublishEngine.test.tsx` | Engine unit test mounted with a real actor | Create |
| `apps/app/src/components/engines/PublishEngine.tsx` | View; reads actor + dispatches events | Modify (props + body rewrite) |
| `apps/app/src/components/pipeline/PipelineOrchestrator.tsx` | Bridge fully deleted; orchestrator ~250 lines | Modify (remove `bridge`, `buildLegacyContext`, `LegacyStage`, simplify publish case) |
| `apps/app/src/app/[locale]/(app)/channels/[id]/drafts/[draftId]/page.tsx` | Wraps standalone `<PublishEngine>` in `<StandaloneEngineHost>` | Modify (lines 322-336) |

---

## Tasks

### Task 1: Write Failing Test for PublishEngine

**Files:**
- Create: `apps/app/src/components/engines/__tests__/PublishEngine.test.tsx`

The test mounts `PublishEngine` inside `<PipelineActorProvider>` whose actor sits at `publish.idle` with brainstorm/research/draft/review/assets/preview stage results pre-seeded. It stubs `PublishProgress` (the streaming child) and asserts that selecting "publish now" dispatches `PUBLISH_COMPLETE` to the actor with the right `PublishResult` shape, and that the publish body sent to the streaming child contains the preview-stage data (imageMap, altTexts, categories, tags, seoOverrides) plus the persona author ID from the draft stage.

- [ ] **Step 1: Create the test file**

```typescript
// apps/app/src/components/engines/__tests__/PublishEngine.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createActor } from 'xstate'
import React from 'react'
import { pipelineMachine } from '@/lib/pipeline/machine'
import { PipelineActorProvider } from '@/providers/PipelineActorProvider'
import { PublishEngine } from '../PublishEngine'
import { DEFAULT_PIPELINE_SETTINGS, DEFAULT_CREDIT_SETTINGS } from '../types'

vi.mock('@/hooks/use-analytics', () => ({
  useAnalytics: () => ({ track: vi.fn() }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))

// Capture the publish body and expose a helper to fire onComplete.
const capturedBodies: Record<string, unknown>[] = []
let lastOnComplete: ((r: { wordpressPostId: number; publishedUrl: string }) => void) | null = null

vi.mock('@/components/publish/PublishProgress', () => ({
  PublishProgress: ({ publishBody, onComplete }: {
    publishBody: Record<string, unknown>
    onComplete: (r: { wordpressPostId: number; publishedUrl: string }) => void
  }) => {
    capturedBodies.push(publishBody)
    lastOnComplete = onComplete
    return <div data-testid="publish-progress" />
  },
}))

vi.mock('@/components/preview/PublishPanel', () => ({
  PublishPanel: ({ onPublish, draftStatus, hasAssets, previewData }: {
    onPublish: (params: { mode: string; scheduledDate?: string }) => void
    draftStatus: string
    hasAssets: boolean
    previewData: unknown
  }) => (
    <div>
      <span data-testid="draft-status">{draftStatus}</span>
      <span data-testid="has-assets">{String(hasAssets)}</span>
      <span data-testid="has-preview-data">{String(Boolean(previewData))}</span>
      <button onClick={() => onPublish({ mode: 'publish' })}>Publish Now</button>
    </div>
  ),
}))

const STUB_DRAFT = {
  id: 'draft-1',
  title: 'Stub Draft',
  status: 'reviewed',
  wordpress_post_id: null,
  published_url: null,
}

function mountAtPublishStage(opts: { withPreviewResult?: boolean } = { withPreviewResult: true }) {
  capturedBodies.length = 0
  lastOnComplete = null

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
        draft:      { draftId: 'draft-1', draftTitle: 'Stub Draft', draftContent: '', personaWpAuthorId: 42, completedAt: new Date().toISOString() },
        review:     { score: 92, verdict: 'approved', feedbackJson: {}, iterationCount: 1, completedAt: new Date().toISOString() },
        assets:     { assetIds: ['a-1', 'a-2'], featuredImageUrl: 'https://x/f.jpg', completedAt: new Date().toISOString() },
        preview:    opts.withPreviewResult ? {
          imageMap: { featured_image: 'a-1', body_section_1: 'a-2' },
          altTexts: { 'a-1': 'feat alt', 'a-2': 's1 alt' },
          categories: ['cat-1'],
          tags: ['tag-1'],
          seoOverrides: { title: 'SEO T', slug: 'seo-slug', metaDescription: 'desc' },
          suggestedPublishDate: '2026-05-01T10:00',
          composedHtml: '<p>x</p>',
          completedAt: new Date().toISOString(),
        } : undefined,
      },
    },
  }).start()

  const utils = render(
    <PipelineActorProvider value={actor}>
      <PublishEngine draft={STUB_DRAFT} />
    </PipelineActorProvider>,
  )
  return { actor, ...utils }
}

beforeEach(() => {
  capturedBodies.length = 0
  lastOnComplete = null
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('PublishEngine', () => {
  it('reads draftStatus + hasAssets from actor and surfaces preview data to the panel', () => {
    mountAtPublishStage()
    expect(screen.getByTestId('draft-status').textContent).toBe('reviewed')
    expect(screen.getByTestId('has-assets').textContent).toBe('true')
    expect(screen.getByTestId('has-preview-data').textContent).toBe('true')
  })

  it('publish body contains preview-stage overrides and persona author ID', async () => {
    const user = userEvent.setup()
    mountAtPublishStage()

    await user.click(screen.getByRole('button', { name: /publish now/i }))

    await waitFor(() => expect(capturedBodies.length).toBe(1))
    const body = capturedBodies[0]!
    expect(body.draftId).toBe('draft-1')
    expect(body.channelId).toBe('ch-1')
    expect(body.imageMap).toMatchObject({ featured_image: 'a-1' })
    expect(body.altTexts).toMatchObject({ 'a-1': 'feat alt' })
    expect(body.categories).toEqual(['cat-1'])
    expect(body.tags).toEqual(['tag-1'])
    expect(body.seoOverrides).toEqual({ title: 'SEO T', slug: 'seo-slug', metaDescription: 'desc' })
    expect(body.authorId).toBe(42)
  })

  it('dispatches PUBLISH_COMPLETE when stream completes', async () => {
    const user = userEvent.setup()
    const { actor } = mountAtPublishStage()

    await user.click(screen.getByRole('button', { name: /publish now/i }))
    await waitFor(() => expect(lastOnComplete).not.toBeNull())
    lastOnComplete!({ wordpressPostId: 999, publishedUrl: 'https://wp/example' })

    await waitFor(() => {
      const publish = actor.getSnapshot().context.stageResults.publish
      expect(publish).toBeDefined()
      expect(publish!.wordpressPostId).toBe(999)
      expect(publish!.publishedUrl).toBe('https://wp/example')
    })
  })

  it('hasAssets is false when assetIds is empty', () => {
    const actor = createActor(pipelineMachine, {
      input: {
        projectId: 'p',
        channelId: 'c',
        projectTitle: 'T',
        pipelineSettings: DEFAULT_PIPELINE_SETTINGS,
        creditSettings: DEFAULT_CREDIT_SETTINGS,
        initialStageResults: {
          draft:  { draftId: 'd', draftTitle: 't', draftContent: '', completedAt: new Date().toISOString() },
          assets: { assetIds: [], completedAt: new Date().toISOString() },
        },
      },
    }).start()
    render(
      <PipelineActorProvider value={actor}>
        <PublishEngine draft={STUB_DRAFT} />
      </PipelineActorProvider>,
    )
    expect(screen.getByTestId('has-assets').textContent).toBe('false')
  })
})
```

- [ ] **Step 2: Run — confirm failure**

```bash
npx vitest run apps/app/src/components/engines/__tests__/PublishEngine.test.tsx
```

Expected: tests fail because `PublishEngine` still requires `channelId`, `context`, `draftId`, `assetCount`, `onComplete` props. Either TS rejects the JSX or the hook order asserts.

---

### Task 2: Refactor PublishEngine to read from actor

**Files:**
- Modify: `apps/app/src/components/engines/PublishEngine.tsx`

The engine signature collapses to `{ draft }`. It pulls `channelId`, `draftId`, `previewResult`, `assetsResult`, `personaWpAuthorId` from the actor. The publish body construction uses `previewResult.imageMap` etc. instead of `context.previewImageMap`. `onComplete` becomes `actor.send({ type: 'PUBLISH_COMPLETE', result })`. `onBack` becomes `navigate('preview')`.

- [ ] **Step 1: Replace the file body**

Open `apps/app/src/components/engines/PublishEngine.tsx` and replace the entire file with:

```typescript
'use client';

import { useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { useSelector } from '@xstate/react';
import { usePipelineActor } from '@/hooks/usePipelineActor';
import { usePipelineTracker } from '@/hooks/use-pipeline-tracker';
import { PublishPanel } from '@/components/preview/PublishPanel';
import { PublishProgress } from '@/components/publish/PublishProgress';
import { ContextBanner } from './ContextBanner';
import type { PipelineContext, PipelineStage, PublishResult } from './types';

interface PublishEngineProps {
  draft: {
    id: string;
    title: string | null;
    status: string;
    wordpress_post_id: number | null;
    published_url: string | null;
  };
}

export function PublishEngine({ draft }: PublishEngineProps) {
  const actor = usePipelineActor();
  const channelId = useSelector(actor, (s) => s.context.channelId);
  const projectId = useSelector(actor, (s) => s.context.projectId);
  const brainstormResult = useSelector(actor, (s) => s.context.stageResults.brainstorm);
  const researchResult  = useSelector(actor, (s) => s.context.stageResults.research);
  const draftResult     = useSelector(actor, (s) => s.context.stageResults.draft);
  const reviewResult    = useSelector(actor, (s) => s.context.stageResults.review);
  const assetsResult    = useSelector(actor, (s) => s.context.stageResults.assets);
  const previewResult   = useSelector(actor, (s) => s.context.stageResults.preview);
  const draftId = draftResult?.draftId ?? draft.id;

  const trackerContext: PipelineContext = {
    channelId,
    projectId,
    ideaId: brainstormResult?.ideaId,
    ideaTitle: brainstormResult?.ideaTitle,
    ideaVerdict: brainstormResult?.ideaVerdict,
    researchSessionId: researchResult?.researchSessionId,
    draftId,
    draftTitle: draftResult?.draftTitle,
    personaId: draftResult?.personaId,
    personaName: draftResult?.personaName,
    personaSlug: draftResult?.personaSlug,
    personaWpAuthorId: draftResult?.personaWpAuthorId,
    reviewScore: reviewResult?.score,
    assetIds: assetsResult?.assetIds,
    featuredImageUrl: assetsResult?.featuredImageUrl,
    previewImageMap: previewResult?.imageMap,
    previewAltTexts: previewResult?.altTexts,
    previewCategories: previewResult?.categories,
    previewTags: previewResult?.tags,
    previewSeoOverrides: previewResult?.seoOverrides,
    previewPublishDate: previewResult?.suggestedPublishDate,
  };

  function navigate(toStage?: PipelineStage) {
    actor.send({ type: 'NAVIGATE', toStage: toStage ?? 'preview' });
  }

  const [publishing, setPublishing] = useState(false);
  const [publishBody, setPublishBody] = useState<Record<string, unknown> | null>(null);
  const modeRef = useRef<string | null>(null);
  const tracker = usePipelineTracker('publish', trackerContext);

  const assetCount = assetsResult?.assetIds?.length ?? 0;

  function handlePublish(params: { mode: string; scheduledDate?: string }) {
    if (publishing) return;

    modeRef.current = params.mode;
    tracker.trackStarted({ draftId, mode: params.mode });

    const body: Record<string, unknown> = {
      draftId,
      channelId,
      mode: params.mode,
      scheduledDate: params.scheduledDate,
      idempotencyToken: crypto.randomUUID(),
    };

    if (previewResult?.imageMap)        body.imageMap     = previewResult.imageMap;
    if (previewResult?.altTexts)        body.altTexts     = previewResult.altTexts;
    if (previewResult?.categories)      body.categories   = previewResult.categories;
    if (previewResult?.tags)            body.tags         = previewResult.tags;
    if (previewResult?.seoOverrides)    body.seoOverrides = previewResult.seoOverrides;
    if (draftResult?.personaWpAuthorId != null) body.authorId = draftResult.personaWpAuthorId;

    setPublishBody(body);
    setPublishing(true);
  }

  const handleStreamComplete = useCallback(
    (result: { wordpressPostId: number; publishedUrl: string }) => {
      toast.success('Published successfully!');
      const publishResult: PublishResult = {
        wordpressPostId: result.wordpressPostId,
        publishedUrl: result.publishedUrl,
      };
      tracker.trackCompleted({
        draftId,
        wordpressPostId: result.wordpressPostId,
        publishedUrl: result.publishedUrl,
        mode: modeRef.current ?? 'unknown',
      });
      actor.send({ type: 'PUBLISH_COMPLETE', result: publishResult });
    },
    [draftId, tracker, actor],
  );

  const handleStreamError = useCallback(
    (message: string) => {
      toast.error(message);
      tracker.trackFailed(message);
      setPublishing(false);
      setPublishBody(null);
    },
    [tracker],
  );

  return (
    <div className="space-y-6">
      <ContextBanner stage="publish" context={trackerContext} onBack={navigate} />

      {publishing && publishBody ? (
        <PublishProgress
          publishBody={publishBody}
          onComplete={handleStreamComplete}
          onError={handleStreamError}
        />
      ) : (
        <div>
          <PublishPanel
            draftId={draftId}
            channelId={channelId}
            draftStatus={draft.status}
            hasAssets={assetCount > 0}
            wordpressPostId={draft.wordpress_post_id}
            publishedUrl={draft.published_url}
            onPublish={handlePublish}
            isPublishing={publishing}
            previewData={previewResult?.seoOverrides ? {
              categories: previewResult.categories ?? [],
              tags: previewResult.tags ?? [],
              seo: previewResult.seoOverrides,
              featuredImageUrl: assetsResult?.featuredImageUrl,
              imageCount: assetsResult?.assetIds?.length ?? 0,
              suggestedDate: previewResult.suggestedPublishDate,
            } : undefined}
          />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run — confirm pass**

```bash
npx vitest run apps/app/src/components/engines/__tests__/PublishEngine.test.tsx
```

Expected: 4 tests pass.

- [ ] **Step 3: Type-check the engine in isolation**

```bash
npm run typecheck --workspace @brighttale/app
```

Expected: zero errors.

---

### Task 3: Delete the Bridge from PipelineOrchestrator

**Files:**
- Modify: `apps/app/src/components/pipeline/PipelineOrchestrator.tsx`

Remove `LegacyStage`, `legacyContext`, `bridge`, and `buildLegacyContext`. Simplify the publish case to `<PublishEngine draft={draftData} />`. The orchestrator drops to ~250 lines.

- [ ] **Step 1: Delete the bridge block**

In `apps/app/src/components/pipeline/PipelineOrchestrator.tsx`, find the block (currently around lines 304-318):

```typescript
    // TODO(pipeline-refactor-v2): PublishEngine still consumes the legacy
    // channelId/context/onComplete prop surface. The `buildLegacyContext`
    // helper and `bridge<LegacyStage>` function below exist solely for it.
    // Wave 4.2 deletes this block + helper + simplifies publish to
    // `<PublishEngine draft={draftData} />`.
    type LegacyStage = 'publish'
    const legacyContext = buildLegacyContext(ctx)
    const bridge = <S extends LegacyStage>(stage: S) => ({
      channelId,
      context: legacyContext,
      onStageProgress: (partial: Record<string, unknown>) =>
        actorRef.send({ type: 'STAGE_PROGRESS', stage, partial }),
    })
```

Delete the entire block.

- [ ] **Step 2: Simplify the publish case**

Find the publish case (currently around lines 340-349):

```tsx
      case 'publish':
        return (
          <PublishEngine
            draftId={ctx.stageResults.draft?.draftId || ''}
            draft={draftData as any}
            {...(bridge('publish') as any)}
            onComplete={(r: any) => actorRef.send({ type: 'PUBLISH_COMPLETE', result: r })}
            onBack={() => handleNavigate('preview')}
          />
        )
```

Replace with:

```tsx
      case 'publish':
        return <PublishEngine draft={draftData as PublishEngineDraft} />
```

Add a type alias at the top of the file (just below the existing imports), or define inline:

```typescript
type PublishEngineDraft = {
  id: string;
  title: string | null;
  status: string;
  wordpress_post_id: number | null;
  published_url: string | null;
}
```

If `draftData` already has a different shape (look near where it is computed), narrow it via a small adapter rather than `as any`. Goal: zero `as any` casts in the orchestrator's render switch.

- [ ] **Step 3: Delete `buildLegacyContext`**

Find the `buildLegacyContext` function (currently around lines 355-368):

```typescript
  function buildLegacyContext(c: typeof ctx): Record<string, unknown> {
    return {
      projectId: c.projectId,
      channelId: c.channelId,
      ideaId: c.stageResults.brainstorm?.ideaId,
      ideaTitle: c.stageResults.brainstorm?.ideaTitle,
      researchSessionId: c.stageResults.research?.researchSessionId,
      researchLevel: c.stageResults.research?.researchLevel,
      draftId: c.stageResults.draft?.draftId,
      draftTitle: c.stageResults.draft?.draftTitle,
      creditSettings: c.creditSettings,
      pipelineSettings: c.pipelineSettings,
    }
  }
```

Delete it. Run `npm run typecheck --workspace @brighttale/app` after deletion to confirm no other call site exists.

- [ ] **Step 4: Confirm orchestrator size**

```bash
wc -l apps/app/src/components/pipeline/PipelineOrchestrator.tsx
```

Expected: ≤260 lines (target ~250). If significantly larger, look for residual imports (`PublishEngine`, `PreviewEngine`) or dead helpers.

- [ ] **Step 5: Run orchestrator behavior tests**

```bash
npx vitest run apps/app/src/components/pipeline/__tests__/PipelineOrchestrator.behavior.test.tsx
```

Expected: pass. Update any test that asserted the orchestrator dispatched `PUBLISH_COMPLETE` from its onComplete wrapper — the engine now does this directly.

---

### Task 4: Wrap Standalone draftId Page's PublishEngine in StandaloneEngineHost

**Files:**
- Modify: `apps/app/src/app/[locale]/(app)/channels/[id]/drafts/[draftId]/page.tsx`

The standalone draft-detail page renders `<PublishEngine>` directly, outside the orchestrator. Without a `PipelineActorProvider` wrapping it, `usePipelineActor()` will throw. Mirror how ReviewEngine and AssetsEngine are wrapped (lines 274-292 / 297-319).

- [ ] **Step 1: Update the publish tab JSX**

Find the publish-tab block (currently around lines 322-336):

```tsx
        {/* Publish Tab */}
        <TabsContent value="publish">
          <PublishEngine
            channelId={channelId}
            context={{
              draftId,
              draftTitle: draft.title ?? undefined,
              reviewScore: draft.review_score ?? undefined,
            }}
            draftId={draftId}
            draft={draft}
            assetCount={assets.length}
            onComplete={() => void fetchDraft()}
          />
        </TabsContent>
```

Replace with:

```tsx
        {/* Publish Tab */}
        <TabsContent value="publish">
          <StandaloneEngineHost
            stage="publish"
            channelId={channelId}
            projectId={projectId}
            initialStageResults={{
              draft: {
                draftId,
                draftTitle: draft.title ?? '',
                draftContent: '',
                completedAt: new Date(0).toISOString(),
              },
              review: {
                score: draft.review_score ?? 0,
                verdict: draft.review_verdict ?? '',
                feedbackJson: draft.review_feedback_json ?? {},
                iterationCount: 0,
                completedAt: new Date(0).toISOString(),
              },
              assets: {
                assetIds: assets.map((a) => a.id),
                featuredImageUrl: assets.find((a) => a.role === 'featured_image')?.source_url ?? undefined,
                completedAt: new Date(0).toISOString(),
              },
            }}
            onStageComplete={() => void fetchDraft()}
          >
            <PublishEngine draft={draft} />
          </StandaloneEngineHost>
        </TabsContent>
```

If `StandaloneEngineHost` is not yet imported in this file, add the import next to the existing engine imports (verify against the existing ReviewEngine/AssetsEngine wrappers). Verify `assets` typing — the existing `assets.length` reference proves the symbol exists.

**Note on preview stage results in standalone:** the standalone page does not run the preview stage. `previewResult` will be `undefined` in the engine, which is fine — the engine handles that case (no preview overrides go into the publish body, no `previewData` passes to the panel).

- [ ] **Step 2: Run app tests**

```bash
npm run test:app
```

Expected: pass.

- [ ] **Step 3: Browser smoke (manual, optional)**

Navigate to `/en/channels/<id>/drafts/<draftId>` and click the Publish tab. Confirm the panel renders and "Publish Now" still produces a publish stream. (Skippable if all unit tests are green and the wave 5 smoke checklist will cover it.)

---

### Task 5: Run the Full App + API Test Suites + Final Type Sweep

**Files:**
- Run: `npm run test`, `npm run typecheck`, `npm run lint`, `npm run build`

- [ ] **Step 1: Run all workspace tests**

```bash
npm run test
```

Expected: pass. Pre-existing baseline failures (per `project_preexisting_test_failures.md`) acceptable but log them.

- [ ] **Step 2: Type-check + lint + build**

```bash
npm run typecheck
npm run lint
npm run build
```

Expected: zero errors at each stage.

---

### Task 6: Commit

- [ ] **Step 1: Stage and commit**

```bash
git add apps/app/src/components/engines/__tests__/PublishEngine.test.tsx \
        apps/app/src/components/engines/PublishEngine.tsx \
        apps/app/src/components/pipeline/PipelineOrchestrator.tsx \
        apps/app/src/app/
git commit -m "refactor(engines): PublishEngine reads actor; orchestrator bridge fully deleted"
```

The pre-commit hook must pass without `--no-verify`.

---

## Wave-specific guardrails

### Bridge deletion is the success criterion

After Task 3 the orchestrator must contain zero references to `bridge`, `LegacyStage`, `buildLegacyContext`, `legacyContext`. Grep to verify:

```bash
grep -nE 'bridge|LegacyStage|buildLegacyContext|legacyContext' apps/app/src/components/pipeline/PipelineOrchestrator.tsx
```

Expected: no matches.

### Engine orientation

`PublishEngine` accepts only `draft` (the WordPress-flavored draft object — id, title, status, wp_post_id, published_url). All pipeline state (`channelId`, `draftId`, `previewResult`, etc.) comes from the actor. Do not introduce new prop surface.

### Persona author ID source

`personaWpAuthorId` was previously read from `context.personaWpAuthorId`, which was hand-fed by the bridge from `c.stageResults.draft?.personaWpAuthorId`. After refactor, read it directly from `draftResult?.personaWpAuthorId`. Same source, one fewer hop.

### `previewData` surface to PublishPanel

The legacy engine populated `previewData` from `context.previewSeoOverrides`. The new engine populates it from `previewResult?.seoOverrides`. The conditional must remain — `PublishPanel` treats `undefined` and a populated `previewData` differently.

### Standalone draftId page initialStageResults

The standalone page seeds `draft`, `review`, and `assets` stage results into the standalone host. It does **not** seed `preview` because the user has not gone through the preview stage in this flow. PublishEngine's `previewResult` will be `undefined` and the engine must handle that — the existing logic skips the preview keys in the publish body when undefined, which is correct.

### `PublishProgress` and `PublishPanel` are mocked in tests

The test mocks both children to keep the test focused on the engine contract (selector reads + dispatched events). Do not reach for an integration-level mock of the streaming endpoint — the bridge between engine and `PublishProgress` is a single `publishBody` prop, which the mock captures.

---

## Exit criteria

### Code health
- [ ] `npm run test` passes (or matches pre-existing baseline failure list)
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` passes
- [ ] No `--no-verify` in any commit on this branch

### Architecture
- [ ] PublishEngine props: only `draft` (zero pipeline-state props)
- [ ] PublishEngine reads `channelId`, `draftId`, `previewResult`, `assetsResult`, `personaWpAuthorId` from actor selectors
- [ ] PublishEngine dispatches `PUBLISH_COMPLETE` directly
- [ ] PublishEngine dispatches `NAVIGATE` for back navigation
- [ ] Orchestrator: `bridge`, `LegacyStage`, `buildLegacyContext`, `legacyContext` all deleted
- [ ] Orchestrator publish case is one line: `return <PublishEngine draft={draftData} />`
- [ ] Orchestrator file ≤260 lines (target ~250)
- [ ] Standalone `drafts/[draftId]/page.tsx` wraps `<PublishEngine>` in `<StandaloneEngineHost>`

### Tests
- [ ] `PublishEngine.test.tsx` exists with four test cases (renders panel, body shape, completion event, empty-assets)
- [ ] All cases pass
- [ ] Orchestrator behavior tests still pass (any preview/publish-callback assertions updated)

### Parent plan exit criteria now reachable
- [ ] Wave 5's "bridge helper deleted" item literally true
- [ ] Wave 5's "orchestrator ~250 lines" item literally true

---

## Risks

| Risk | Mitigation |
|---|---|
| `previewResult` undefined in standalone causes `previewData` to be undefined and PublishPanel renders without preview chrome | Test case `hasAssets is false when assetIds is empty` verifies behavior with missing stage results; manual browser smoke on the standalone page after Task 4. |
| `personaWpAuthorId` regression — wrong source field | Test case `publish body contains preview-stage overrides and persona author ID` asserts `body.authorId === 42` with the persona seeded into the draft stage. |
| Standalone draftId page lacks `assets` stage seed → engine treats `hasAssets=false` and panel disables publish | Task 4 step 1 explicitly seeds the assets stage from the page's existing `assets` array. |
| Orchestrator behavior tests assert PUBLISH_COMPLETE dispatch from the orchestrator's onComplete wrapper | Task 3 step 5 runs them; expected assertion update — engine now dispatches it. |
| `as any` casts leak forward | Task 3 step 2 introduces `PublishEngineDraft` type alias instead of `as any`. Grep `(as any)` in the orchestrator after Task 3 — expected zero matches. |

---

## After Wave 4.2

Wave 5 (FORMAT_COSTS dedup, provider wiring, docs sync, final acceptance) becomes runnable with literal exit criteria — bridge gone, orchestrator ~250 lines, all six browser-smoke items achievable.
