# Pipeline Axiom Logging

**Date:** 2026-04-17
**Status:** approved

## Goal

Full observability and product analytics across the content pipeline. Track every user action, AI generation input/output, and failure — client-side via Axiom events, server-side via `logAiUsage()`.

## Decisions

- **Approach:** Centralized `usePipelineTracker` hook (client) + `logAiUsage()` wired in AI router (server)
- **Naming:** Dot-namespaced — `pipeline.{stage}.{action}`
- **Payload size:** Full inputs and outputs in every event (no summaries)
- **Server logging:** Wire `logAiUsage()` into `generateWithFallback()` in `router.ts` — one integration point covers all providers and jobs

## Architecture

### Client-side: `usePipelineTracker` hook

**File:** `apps/app/src/hooks/use-pipeline-tracker.ts`

```typescript
function usePipelineTracker(stage: PipelineStage, context: PipelineContext)
```

Wraps `useAnalytics().track()`. Returns:

| Method | Event name | Purpose |
|--------|-----------|---------|
| `trackStarted(input)` | `pipeline.{stage}.started` | User clicks Generate/Research/Produce |
| `trackCompleted(output)` | `pipeline.{stage}.completed` | Engine calls onComplete |
| `trackFailed(error)` | `pipeline.{stage}.failed` | Generation fails |
| `trackAction(action, data)` | `pipeline.{stage}.{action}` | Any user action |

Every event auto-includes from context:

```typescript
{
  projectId, channelId, draftId,
  stage,
  // + caller-supplied data
}
```

### Server-side: `logAiUsage()` in AI router

**File:** `apps/api/src/lib/ai/router.ts` — inside `generateWithFallback()`

On success:

```typescript
logAiUsage({
  userId, orgId,
  action: logContext.stage,       // 'brainstorm', 'research', 'production', 'review'
  provider: providerName,
  model: modelId,
  inputTokens, outputTokens, totalTokens, cost,
  durationMs,
  status: 'success',
  error: null,
  metadata: {
    sessionId, draftId, projectId,
    prompt: userMessage,           // full input
    response: result.text,         // full output
  },
});
```

On failure: same shape with `status: 'error'`, `error: err.message`, no response.

## Event Catalog

### Brainstorm

| Event | Payload |
|-------|---------|
| `pipeline.brainstorm.started` | `{ topic, mode, provider, model, fineTuning?, referenceUrl? }` |
| `pipeline.brainstorm.completed` | `{ sessionId, ideaCount, ideas }` |
| `pipeline.brainstorm.failed` | `{ error, provider, model }` |
| `pipeline.brainstorm.idea.selected` | `{ ideaId, ideaTitle, verdict, coreTension }` |
| `pipeline.brainstorm.imported` | `{ ideaCount, source: 'manual'\|'library' }` |
| `pipeline.brainstorm.regenerated` | `{ sessionId, previousIdeaCount }` |

### Research

| Event | Payload |
|-------|---------|
| `pipeline.research.started` | `{ topic, level, focusTags, provider, model }` |
| `pipeline.research.completed` | `{ sessionId, cardCount, approvedCount, level }` |
| `pipeline.research.failed` | `{ error, provider, model }` |
| `pipeline.research.cards.approved` | `{ sessionId, approvedCount, totalCount, approvedIndexes }` |
| `pipeline.research.imported` | `{ cardCount, source: 'manual' }` |
| `pipeline.research.regenerated` | `{ sessionId, previousCardCount }` |

### Draft

| Event | Payload |
|-------|---------|
| `pipeline.draft.started` | `{ draftId, phase: 'core'\|'produce', provider, model, format?, targetLength? }` |
| `pipeline.draft.completed` | `{ draftId, draftTitle, wordCount, format }` |
| `pipeline.draft.failed` | `{ error, phase, provider, model }` |
| `pipeline.draft.core.generated` | `{ draftId, canonicalCoreJson }` |
| `pipeline.draft.content.produced` | `{ draftId, format, wordCount, draftJson }` |
| `pipeline.draft.imported` | `{ phase: 'core'\|'produce', source: 'manual' }` |

### Review

| Event | Payload |
|-------|---------|
| `pipeline.review.started` | `{ draftId, iterationCount }` |
| `pipeline.review.completed` | `{ draftId, score, verdict, iterationCount, feedbackJson }` |
| `pipeline.review.failed` | `{ error, draftId }` |

### Assets

| Event | Payload |
|-------|---------|
| `pipeline.assets.started` | `{ draftId, mode: 'generate'\|'upload' }` |
| `pipeline.assets.completed` | `{ draftId, assetCount, assetIds, featuredImageUrl }` |
| `pipeline.assets.failed` | `{ error, draftId }` |
| `pipeline.assets.uploaded` | `{ draftId, role, mimeType, source: 'file'\|'url' }` |

### Preview

| Event | Payload |
|-------|---------|
| `pipeline.preview.completed` | `{ draftId, imageMap, categories, tags, seoOverrides }` |

### Publish

| Event | Payload |
|-------|---------|
| `pipeline.publish.started` | `{ draftId, mode: 'draft'\|'publish'\|'schedule', configId }` |
| `pipeline.publish.completed` | `{ draftId, wordpressPostId, publishedUrl, mode }` |
| `pipeline.publish.failed` | `{ error, draftId, mode }` |

### Pipeline Navigation (PipelineOrchestrator)

| Event | Payload |
|-------|---------|
| `pipeline.stage.navigated` | `{ from, to, hasDownstreamResults }` |
| `pipeline.stage.redone` | `{ stage, discardedStages }` |
| `pipeline.mode.changed` | `{ from, to: 'auto'\|'step-by-step' }` |

## Files to create/modify

### New files
- `apps/app/src/hooks/use-pipeline-tracker.ts` — the hook

### Modified files
- `apps/api/src/lib/ai/router.ts` — wire `logAiUsage()` into `generateWithFallback()`
- `apps/app/src/components/engines/BrainstormEngine.tsx` — add tracking calls
- `apps/app/src/components/engines/ResearchEngine.tsx` — add tracking calls
- `apps/app/src/components/engines/DraftEngine.tsx` — add tracking calls
- `apps/app/src/components/engines/ReviewEngine.tsx` — add tracking calls
- `apps/app/src/components/engines/AssetsEngine.tsx` — add tracking calls
- `apps/app/src/components/engines/PreviewEngine.tsx` — add tracking calls
- `apps/app/src/components/engines/PublishEngine.tsx` — add tracking calls
- `apps/app/src/components/pipeline/PipelineOrchestrator.tsx` — navigation/mode events

## Testing

No new test files. Validate by running the pipeline end-to-end in dev and checking events in the Axiom dashboard. Verify:
1. Client events appear with correct dot-namespaced names
2. Full input/output payloads present
3. Auto-injected context (projectId, channelId, userId) correct
4. Server-side `ai_usage` events have token counts and full prompt/response
