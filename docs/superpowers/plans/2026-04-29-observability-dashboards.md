# Implementation Plan — Observability Dashboards

```
Status:        draft (not approved)
Created:       2026-04-29
Author:        Claude (Opus 4.7)
Branch:        follow-on — do NOT merge onto feat/pipeline-autopilot-wizard-impl
Depends-on:    Wave 7 + Wave 8 of pipeline-autopilot-wizard (abort path, overview mode)
               must land before Tier 3 panels for abort-rate and mode adoption are
               meaningful.
```

## Goal

Instrument and surface four tiers of operational, cost, product, and security signals
across the bright-tale AI content pipeline. Code changes emit structured events to
Axiom, PostHog (server-side via `trackEvent`), and Sentry. Dashboard panels are
assembled in each tool's UI — this plan specifies what the code emits and what each
panel should show.

## Rollout Sequence

- **Phase A — Tier 1 + Tier 4 silent (post-Wave 8 merge, ~1 sprint):** Axiom
  pipeline-run wrapper events, WP publish events, Inngest job-level telemetry,
  security violation logging. Tier 4 events emit from day one but alerts are kept
  in "observe" mode for one week before paging.
- **Phase B — Tier 2 (post-Wave 8 + usage_events validation, ~1 sprint):** Verify
  `usage_events` has complete stage coverage, add WP queue-depth metric, add
  per-user aggregated credit view. Build Axiom cost dashboards.
- **Phase C — Tier 3 (after Wave 9 cleanup ships, ~1 sprint):** Add PostHog
  product events from wizard UI + pipeline machine. Build PostHog dashboard for
  funnel, drop-off, review convergence, time-to-publish.

## Inventory of Existing Emissions

### Axiom (server-side structured logs)

- `type: 'request'` — every non-silent API route: `method`, `path`, `statusCode`,
  `durationMs`, `userId`, `requestId`. Emitted in `onResponse` hook in
  `apps/api/src/index.ts`.
- `type: 'ai_usage'` — fired from `logAiUsage()` in `apps/api/src/routes/brainstorm.ts`,
  `research-sessions.ts`, `assets.ts`, `content-drafts.ts` (review, revise, asset-alt).
  Fields: `userId`, `orgId`, `action`, `provider`, `model`, `inputTokens`,
  `outputTokens`, `totalTokens`, `cost?`, `durationMs`, `status`, `error?`,
  `metadata`.
- `type: 'blog_metrics_refresh'` — one debug event in `wordpress.ts`, not
  production-grade.

### usage_events table (Supabase)

Stage token+cost records for brainstorm, research, production (canonical-core +
produce), assets. Written by `logUsage()`. **Gap:** review stage calls
`logAiUsage` but not `logUsage` — no rows in `usage_events` for review.

### PostHog (client-side)

- `$pageview` — automatic SPA pageview capture in `posthog-provider.tsx`.
- **No custom product events** are emitted anywhere in `apps/app/src/`.
  `trackEvent()` in `apps/api/src/lib/posthog.ts` is declared but never called.

### Sentry

- `apps/app`: error boundary (`global-error.tsx`), request errors, router
  transitions, one manual `captureEvent` in channels page.
- `apps/api`: `setupFastifyErrorHandler` in `index.ts`, Sentry tracing for Inngest
  routes. No explicit `captureException` in routes.

### Inngest job events (job_events table, consumed via SSE)

`emitJobEvent()` — `sessionType`, `stage`
(`queued`|`loading_prompt`|`calling_provider`|`parsing_output`|`saving`|`completed`|`failed`|`aborted`),
`message`, `metadata`. Used in `brainstorm-generate`, `research-generate`,
`production-generate`, `production-produce`, `content-drafts.ts` (review inline).

## Architecture Notes

- **Axiom dataset:** `brighttale-api` (already configured via `AXIOM_DATASET`).
- **PostHog server:** `trackEvent(eventName, userId, properties)` in
  `apps/api/src/lib/posthog.ts` — wired but never called from routes/jobs. Events
  fired server-side use distinct event names from client pageviews so no de-dup
  required.
- **PostHog client:** `posthog.capture()` available in any `'use client'` component
  via `usePostHog()` from `posthog-js/react`.
- **Sentry:** `apps/app` has `sentry.server.config.ts` with `enableLogs: true` and
  `sendDefaultPii: true`. `apps/api` flows errors via `setupFastifyErrorHandler`.
- **PII risk:** `logAiUsage.metadata.prompt` in `assets.ts:285` already logs raw
  image prompt. Any new emission with prompt text, draft content, or user-typed
  topic strings must redact or omit those fields.

## File Structure

### Files to Modify

- `apps/api/src/lib/axiom.ts` — add `logPipelineRun`, `logWpPublish`,
  `logWpQueueDepth`; extend `RequestEvent` with `orgId`; optionally mirror
  `logUsage` calls into Axiom.
- `apps/api/src/lib/ai/pricing.ts` — add `estimateImageCostUsd(provider, quality, count)`.
- `apps/api/src/lib/ai/usage-log.ts` — optional `ingest()` mirror so
  `type: 'usage_event'` lands in Axiom.
- `apps/api/src/middleware/authenticate.ts` — `ingest()` on key mismatch.
- `apps/api/src/lib/projects/ownership.ts` — `ingest()` on FORBIDDEN throw.
- `apps/api/src/lib/crypto.ts` — wrap decrypt failure with `ingest()`.
- `apps/api/src/routes/project-setup.ts` — `logPipelineRun` + `trackEvent` calls.
- `apps/api/src/routes/wordpress.ts` — `logWpPublish` + `logWpQueueDepth` +
  `trackEvent` calls.
- `apps/api/src/routes/content-drafts.ts` — `logUsage` calls in review paths;
  `trackEvent('review.iteration_completed')`.
- `apps/api/src/jobs/{brainstorm,research,production-generate,production-produce}.ts` —
  `logPipelineRun` stage events + `trackEvent('pipeline.stage_aborted')` in
  abort catch.
- `apps/app/src/components/pipeline/PipelineWizard.tsx` — `usePostHog()` +
  `capture()` calls.

### Files to Create

None — all changes are additive.

---

## Tier 1 — Operational Health

### Code Changes

#### 1. `apps/api/src/lib/axiom.ts` — new helpers

```typescript
interface PipelineRunEvent {
  type: 'pipeline_run';
  projectId: string;
  orgId: string;
  userId: string;
  event: 'started' | 'stage_completed' | 'finished' | 'aborted' | 'failed';
  stage?: 'brainstorm' | 'research' | 'production' | 'review' | 'assets' | 'publish';
  mode?: 'step_by_step' | 'supervised' | 'overview';
  durationMs?: number;
  abortedAtStage?: string;
}

interface WpPublishEvent {
  type: 'wp_publish';
  orgId: string;
  userId: string;
  draftId?: string;
  projectId?: string;
  destinationId?: string;
  status: 'success' | 'failed';
  durationMs: number;
  error?: string;
}
```

Export `logPipelineRun(event)` and `logWpPublish(event)`.

#### 2. `apps/api/src/routes/project-setup.ts` — emit `pipeline_run started`

After successful `projects.update`:

```typescript
logPipelineRun({
  type: 'pipeline_run',
  projectId,
  orgId,
  userId,
  event: 'started',
  mode: body.mode,
});
```

`orgId` resolved from project's channel; add a channel lookup if not already
present.

#### 3. Inngest jobs — emit `stage_completed` / `aborted` / `failed`

In `apps/api/src/jobs/{brainstorm,research,production}-generate.ts` and
`production-produce.ts`, at job start (before first `step.run`) and on each
terminal path:
- success → `logPipelineRun({ event: 'stage_completed', stage, durationMs })`
- `JobAborted` → `logPipelineRun({ event: 'aborted', abortedAtStage: stage })`
- other error → `logPipelineRun({ event: 'failed', stage })`

These go to Axiom; `emitJobEvent` continues to write to `job_events` for SSE.
Different sinks, no duplication.

#### 4. `apps/api/src/routes/wordpress.ts` — emit `wp_publish`

In `POST /publish` and `POST /publish-draft/stream`, on success and error paths,
call `logWpPublish(...)`. Streaming route emits per-step; add `logWpPublish` at
the final `done` / error step.

**PII risk:** do NOT include post title, content, or slug. Only IDs, status,
duration.

#### 5. `apps/api/src/middleware/authenticate.ts` — emit `security.key_mismatch`

In the 401 branch (line 39), before reply:

```typescript
ingest({
  type: 'security_violation',
  violation: 'key_mismatch',
  path: request.url,
  method: request.method,
  ip: request.ip,
  _time: new Date().toISOString(),
});
```

Do NOT log the supplied key value.

#### 6. `apps/api/src/lib/projects/ownership.ts` — emit `security.ownership_rejected`

On `throw new ApiError(403, 'Forbidden', 'FORBIDDEN')`:

```typescript
ingest({
  type: 'security_violation',
  violation: 'ownership_rejected',
  projectId,
  userId,
});
```

#### 7. `apps/api/src/lib/crypto.ts` — emit `security.decrypt_failed`

Wrap `createDecipheriv` / `decipher.final()` block:

```typescript
try {
  // existing decrypt logic
} catch (err) {
  ingest({
    type: 'security_violation',
    violation: 'decrypt_failed',
    table: opts.aad?.split(':')[0] ?? 'unknown',
  });
  throw err;
}
```

Do NOT log ciphertext, key, or AAD.

#### 8. `apps/api/src/index.ts` — add `orgId` to `logRequest`

Extend `RequestEvent` in `axiom.ts`:

```typescript
orgId?: string;
```

In the `onResponse` hook pass `request.headers['x-org-id']` if the app proxy
injects it, or leave null until org context is threaded through middleware.
Optional for Tier 1; required for Tier 2 cost aggregation per org.

### Dashboard Build Steps (Axiom)

| Panel | Query |
|-------|-------|
| Pipeline runs (live + 24h) | `type = 'pipeline_run'` WHERE `event IN ('started','finished','aborted','failed')`. Count by `event`, time chart over 24h. |
| API error rate by route | `type = 'request'` WHERE `statusCode >= 400`. Group by `path`, `statusCode`. Line chart hourly. |
| Inngest job latency + failures | `type = 'pipeline_run'` WHERE `event IN ('stage_completed','failed')`. `AVG(durationMs)` by `stage`. Stacked bar for failures. |
| AI provider error/latency | `type = 'ai_usage'` WHERE `status = 'error'`. Group by `provider`, `model`. P50/P95 `durationMs`. |
| WP publish queue depth | `type = 'wp_publish'` `COUNT()` per hour. Failures vs success stacked. |

### Sentry Alert Rules

- `type:error level:fatal` on `apps/app` project — pages oncall immediately.
- Error rate > 5% on `/api/projects` routes in 5-minute window.

### Acceptance Criteria

- `logPipelineRun` events appear in Axiom within 30s of a project setup call in
  staging.
- `type = 'request'` panel shows 48h of data split by `statusCode` range
  (2xx/4xx/5xx).
- `type = 'security_violation'` panel fires within 5s of sending a bad
  `X-Internal-Key`.
- WP publish panel shows success/fail split for the last 7 days.

---

## Tier 4 — Security (alert-driven)

Tier 4 uses the `type: 'security_violation'` events added in Tier 1. They emit
from day one. Dashboards run in observe-only mode for one week before alerts go
live.

### Code Changes

All four Tier-4 signals map to existing Tier 1 changes:

- `key_mismatch` — `authenticate.ts` (item 5 above)
- `ownership_rejected` — `ownership.ts` (item 6 above)
- `decrypt_failed` — `crypto.ts` (item 7 above)
- `service_role_query_per_user` — architectural, not per-call. Supabase
  dashboard already shows service_role query volume. Document the URL in
  runbook; no code change.

### Dashboard Build Steps (Axiom)

| Panel | Query | Alert |
|-------|-------|-------|
| Key mismatch attempts | `violation = 'key_mismatch'`. Count by `path`, `ip`. | Spike > 10 in 5 min. |
| assertProjectOwner rejections | `violation = 'ownership_rejected'`. Group by `userId`. | Single user > 20 per hour. |
| AES-GCM decrypt failures | `violation = 'decrypt_failed'`. | Any occurrence triggers P1. |

### Acceptance Criteria

- Wrong `INTERNAL_API_KEY` produces an Axiom event within 30s.
- Cross-tenant project request produces `ownership_rejected` event.
- Deliberate corrupt ciphertext in test env produces `decrypt_failed` event.
- All three panels buildable from existing Axiom dataset before any alert rules
  are active.

---

## Tier 2 — Cost & Resource

**Blocker:** Requires `logRequest` to carry `orgId` (Tier 1 item 8) and
`usage_events` to be complete for all stages. Validate that `review` stage writes
to `usage_events` — currently it calls `logAiUsage` (Axiom) but does NOT call
`logUsage` (usage_events). Gap fix below.

### Code Changes

#### 1. `apps/api/src/routes/content-drafts.ts` — add `logUsage` to review path

After `logAiUsage(...)` calls at lines ~731, ~1074, ~1256, ~1429, ~1849, ~1986,
add a corresponding `logUsage(...)` call to write to `usage_events`. Makes
`usage_events` the single source of truth for token cost aggregation.

#### 2. `apps/api/src/lib/axiom.ts` — `logWpQueueDepth` helper

```typescript
interface WpQueueDepthEvent {
  type: 'wp_queue_depth';
  pending: number;
  failed: number;
  sampledAt: string;
}
export function logWpQueueDepth(event: Omit<WpQueueDepthEvent, 'type'>): void
```

#### 3. `apps/api/src/routes/wordpress.ts` — emit queue depth on publish

Before returning, `COUNT()` `content_drafts` WHERE `status IN ('publishing','awaiting_manual')`
and emit `logWpQueueDepth`. Cheap count query, not a scan.

#### 4. `apps/api/src/routes/image-generation.ts` (or `assets.ts`) — populate `cost_usd`

`logAiUsage` calls in `assets.ts` set `cost: undefined` for image generation. Add
cost estimation: DALL-E 3 standard ≈ $0.04/image, HD ≈ $0.08/image, Gemini Imagen
≈ $0.02/image. Add `estimateImageCostUsd(provider, quality, count)` alongside
`estimateCostUsd` in `apps/api/src/lib/ai/pricing.ts`.

### Dashboard Build Steps (Axiom)

| Panel | Notes |
|-------|-------|
| Token spend by stage × provider | Mirror `logUsage` to Axiom via `ingest({ type: 'usage_event', ... })` so dashboards don't query Supabase. Group by `stage`, `provider`. |
| Per-user credit consumption | `type = 'usage_event'` GROUP BY `userId` (aggregate only). Use `orgId` for org-level view. |
| Image generation cost | `type = 'ai_usage' AND action LIKE 'image%'` GROUP BY `provider`, date. |
| WP publish queue depth | `type = 'wp_queue_depth'`, `pending` field over time. |

**PII risk:** `usage_event` must NOT include prompt text, draft content, or
channel name. Only IDs, stage, provider, model, token counts, cost.

**Cardinality note:** do NOT use `userId` as a tag dimension in Axiom if user
base exceeds ~1000 — use it for filtering, not for panel grouping.

### Acceptance Criteria

- `usage_events` has rows for all 6 stages: brainstorm, research,
  production/canonical-core, production/produce, review, assets. Verify by
  querying Supabase directly after a full pipeline run.
- Axiom `type = 'usage_event'` panel shows 7 days of token spend split by
  `stage` × `provider`.
- Image generation cost panel shows per-image cost and daily total.
- WP queue depth panel shows current pending count updated within 60s of a
  publish call.

---

## Tier 3 — Product (PostHog native)

### Blockers

1. Wave 7 (overview mode UI) must ship so `mode = 'overview'` appears in event
   data.
2. Wave 8 (abort path) must ship so `pipeline.aborted` events are meaningful.
3. `PipelineWizard.tsx`, `MiniWizardSheet.tsx`, `PipelineOverview.tsx` must
   exist before client-side capture calls can be added.

### Code Changes

#### 1. `apps/app/src/components/pipeline/PipelineWizard.tsx` — PostHog UI events

Using `usePostHog()`:

- On wizard section mount: `posthog.capture('wizard.section_viewed', { section: 'mode_select' | 'stage_config' | 'review_config' | 'template_select' })`.
- On wizard section unmount without advancing: `posthog.capture('wizard.section_abandoned', { section })`.
- On `SETUP_COMPLETE` dispatch: `posthog.capture('wizard.setup_completed', { mode, templateId: templateId ?? null, hasCustomConfig: autopilotConfig !== null })`.

**PII risk:** do NOT capture `autopilotConfig` contents (may include channel
persona text). Only `mode` and whether a template was used.

#### 2. `apps/api/src/routes/project-setup.ts` — server-side `wizard.setup_completed`

In success path of `POST /:id/setup`:

```typescript
trackEvent('wizard.setup_completed', userId, {
  mode: body.mode,
  templateUsed: body.templateId != null,
  startStage,
});
```

Authoritative server-side record (client event can be blocked by adblockers).

#### 3. `apps/api/src/routes/content-drafts.ts` — `review.iteration_completed`

After writing to `review_iterations` (line ~1651):

```typescript
trackEvent('review.iteration_completed', userId, {
  draftId: id,
  iteration: iterationCount,
  score: reviewScore,
  verdict: newVerdict,
  draftType,
});
```

Do NOT include `feedback_json` (may contain AI critique referencing user content).

#### 4. `apps/api/src/routes/wordpress.ts` — `project.published`

In success path of `POST /publish-draft/stream` final `done` step:

```typescript
trackEvent('project.published', userId, {
  draftType,
  timeToPublishMs: Date.now() - projectCreatedAt,
  provider: body.destinationId ? 'wordpress' : 'manual',
});
```

`projectCreatedAt` loaded from DB; add to existing project select.

#### 5. `apps/api/src/routes/project-setup.ts` — `template.applied`

When `body.templateId` is non-null:

```typescript
trackEvent('template.applied', userId, { templateId: body.templateId, mode: body.mode });
```

#### 6. `pipeline.aborted` — server + jobs

`PATCH /:id/abort` success path:

```typescript
trackEvent('pipeline.aborted', userId, {
  projectId,
  abortedAt: new Date().toISOString(),
});
```

In each Inngest job catch block for `JobAborted`, call:

```typescript
trackEvent('pipeline.stage_aborted', userId, { stage, projectId });
```

Requires passing `userId` into job data (already present in event data).

### PostHog Dashboard Build Steps

| Panel | Query |
|-------|-------|
| Mode adoption funnel | Funnel `wizard.section_viewed (mode_select)` → `wizard.setup_completed`. Bar by `mode`. |
| Wizard drop-off per section | `wizard.section_abandoned` GROUP BY `section`. Compare to `wizard.section_viewed` per section. |
| Template reuse rate | `template.applied` count / `wizard.setup_completed` count over time. |
| Review-loop convergence | `review.iteration_completed` GROUP BY `iteration`. Distribution of `score` per iteration. |
| Time-to-publish | `project.published.timeToPublishMs`. P50/P95 trend. |
| Abort rate by stage | `pipeline.stage_aborted` GROUP BY `stage`. Compare to `pipeline_run started`. |

**Volume note:** `review.iteration_completed` fires on every AI review call —
high volume at scale. Set sampling if volume crosses 10k/day.

### Acceptance Criteria

- PostHog shows `wizard.setup_completed` within 5s of project setup in staging
  (server-side, ad-block-resistant).
- `review.iteration_completed` appears for each review run with `score` and
  `iteration`.
- `project.published` appears with `timeToPublishMs > 0` after WP publish.
- Funnel panel shows `section_viewed > setup_completed` count drop.

---

## New Emissions Count

Total new events / log fields not currently in code: **15**

1. `type: 'pipeline_run'` Axiom (started/stage_completed/finished/aborted/failed)
2. `type: 'wp_publish'` Axiom
3. `type: 'wp_queue_depth'` Axiom
4. `type: 'security_violation' violation: 'key_mismatch'` Axiom
5. `type: 'security_violation' violation: 'ownership_rejected'` Axiom
6. `type: 'security_violation' violation: 'decrypt_failed'` Axiom
7. `type: 'usage_event'` Axiom mirror of `usage_events` rows
8. `orgId` field on `type: 'request'`
9. PostHog `wizard.section_viewed` (client)
10. PostHog `wizard.section_abandoned` (client)
11. PostHog `wizard.setup_completed` (server)
12. PostHog `review.iteration_completed` (server)
13. PostHog `project.published` with `timeToPublishMs` (server)
14. PostHog `template.applied` (server)
15. PostHog `pipeline.stage_aborted` (server, from job abort catch)

---

## Risks & Watchpoints

1. **PII in logs.** `assets.ts` image generation already logs `prompt`. New
   pipeline-run events must NOT include project title, idea title, or any
   user-typed content. Field-by-field review on every new `ingest()` payload.
2. **Cardinality explosion.** Do NOT use `userId` as a high-cardinality Axiom
   field for panel grouping. Filtering is fine. Org-level aggregation is safe
   (hundreds of orgs, not millions of users).
3. **PostHog event volume.** `review.iteration_completed` and
   `pipeline.stage_aborted` fire on every AI call. 1000 runs/day × 3 avg
   iterations = 3000 events/day — fine. Add sampling above 50k/day.
4. **`sendDefaultPii: true` in Sentry.** `apps/app/sentry.server.config.ts`
   sends PII. Ensure no new `captureException` includes draft content or
   prompt strings as extra context.
5. **Inngest native dashboards.** Inngest Cloud has a built-in dashboard
   (function run history, latency P, failure rate). For Tier 1 Inngest panels,
   check if Inngest's native covers the need before duplicating in Axiom.
6. **`orgId` gap.** `logRequest` has no `orgId`. Resolving org from user requires
   a DB lookup in the hot `onResponse` path. Use lazy "emit without orgId" for
   Tier 1; add to request context only if Tier 2 dashboard requires it.
7. **Wave 7/8 blocker for Tier 3.** `PipelineWizard.tsx` ships on
   `feat/pipeline-autopilot-wizard-impl`. All client-side capture calls in
   that component must wait until the branch merges.
