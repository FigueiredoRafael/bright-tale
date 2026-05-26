---
title: Review Loop Stagnation Fixes
status: ready-for-agent
date: 2026-05-26
owner: Hector
source_spec: docs/specs/review-loop-stagnation-fixes.md
---

# Review Loop Stagnation Fixes — PRD

## Problem Statement

When a creator runs autopilot on a non-blog medium (video, shorts, podcast), the review loop frequently burns the entire iteration budget (5 passes) without ever crossing the auto-approve threshold. The user observes the same score (60) and the same critical issue ("missing citations", "production.video.chapter_count missing") flagged iteration after iteration. Each pass spends producer + reviewer credits with no visible progress. Eventually the loop parks at `awaiting_user(max_iterations)`, the creator has no signal on which iteration was actually best, no idea how much each pass cost, and no idea what the producer tried to change between passes. From the creator's perspective the autopilot loop is "spinning credits for nothing" on every video project.

Reference incident: project `8c4b8965-df33-4484-a742-29b7b4865ff2` (video track) — 6 iterations, score frozen at 60 every time, identical critical issue every iteration.

## Solution

Make the review loop converge — or fail fast — for every medium, and surface enough per-iteration evidence that the creator can decide what to do when it doesn't.

Four shipped fixes:

1. **Wire up the video rubric.** A 10-criterion rubric already exists in code (`apps/api/src/lib/ai/scoring/criteria/video.ts`) but is unused. Wire it through `getRubricForType` so video drafts get a deterministic Σ(pass × weight) score instead of the legacy tier→60 fallback. Update the reviewer prompt to emit `rubric_evaluation` for video.

2. **Reconcile the producer ↔ reviewer video contract.** Today the reviewer flags `production.video.chapter_count` and `thumbnail.visual_style` as "missing required fields", but the producer never emits them under those names. Producer-side fields like `editor_script`, `lower_thirds`, `thumbnail_ideas` are treated as schema noise. Reconcile both sides plus add a conformance test so future drift fails CI instead of the review loop.

3. **Stagnation detection.** When the last three iterations have the same score (±2) and overlapping top critical issues (Jaccard ≥ 0.7), park the Stage Run at `awaiting_user(stagnation)` instead of grinding to `max_iterations`. Surface the park in the existing manual-override UI panel.

4. **Per-iteration cost + producer-attempt visibility.** Show cost in cents and the producer's last revision strategy on every row of `ReviewIterationsPicker` so the creator can compare passes and decide whether to keep iterating, promote a prior iteration, or abandon.

## User Stories

1. As a video creator running autopilot, I want my video drafts to receive a numeric review score that varies between iterations, so that I can tell whether the loop is making progress or stuck.
2. As a video creator, I want each review pass on a video draft to be evaluated against the same 10-criterion rubric the blog already uses, so that scoring is deterministic and comparable across iterations.
3. As a video creator, I want the reviewer to stop flagging "production.video.chapter_count missing" when the producer never emits that field name, so that the review loop doesn't spin on a schema mismatch I can't fix.
4. As a video creator, I want producer-side outputs like `editor_script`, `lower_thirds`, and `thumbnail_ideas` to be evaluated by the reviewer instead of ignored as noise, so that the work the producer actually did counts toward the score.
5. As a creator on any medium, I want the review loop to stop early when three consecutive iterations don't improve, so that credits aren't spent on iterations that will return the same result.
6. As a creator whose autopilot just parked on stagnation, I want a clear banner that explains why — "Review hasn't improved in 3 iterations" — so that I know the loop didn't crash, it gave up.
7. As a creator whose autopilot parked on stagnation, I want the same manual-override actions I get on `max_iterations` parks (promote an iteration / edit manually / pick a different idea), so that I can resolve the project without learning a new UI.
8. As a creator inspecting `ReviewIterationsPicker`, I want to see the cost in cents (producer + reviewer) of every iteration, so that I can weigh whether running another pass is worth the credit spend.
9. As a creator inspecting iteration N, I want to see a short summary of what the producer attempted to fix between iteration N-1 and N (pulled from `priorAttempts`), so that I can tell whether the loop is actually trying new strategies or repeating itself.
10. As a creator inspecting an expanded iteration row, I want to see the score delta vs the prior iteration alongside the top critical issue, so that I can identify the best-scoring pass quickly when deciding which to promote.
11. As a developer on this codebase, I want a schema-conformance test that fails when `agent-4-review.md`'s expected video schema diverges from `VideoOutput`, so that future field renames don't silently break the review loop.
12. As a developer, I want a unit-testable pure `detectStagnation` helper that operates on an array of `ReviewIteration` rows, so that I can verify the stagnation rules (flat-score window, Jaccard threshold, insufficient-history short-circuit) in isolation from the dispatcher.
13. As an operator monitoring the autopilot, I want `awaiting_user(stagnation)` to be a distinct enum value from `awaiting_user(max_iterations)`, so that I can measure how often the loop converged vs. gave up early when reviewing telemetry.
14. As a creator, I want my video projects to be able to reach `approved` end-to-end on autopilot — not require manual override — provided the producer actually emits a draft that satisfies the rubric.
15. As a developer rolling out these changes, I want stagnation detection behind an env flag so that I can observe false-positive-park rates before defaulting it on.

## Implementation Decisions

### Modules

**1. Rubric wiring (Fix 1)**
- Add a `'video' → VIDEO_CRITERIA` branch to `getRubricForType` in `computeRubricScore.ts`. Same shape as the existing `'blog' → BLOG_CRITERIA` branch.
- `VIDEO_CRITERIA` already exists and is finalized — no rubric authoring work needed in this PRD slice.

**2. Review prompt — video rubric mode**
- Extend `buildReviewMessage` to inject the video rubric block into the reviewer prompt when `type === 'video'`, in the same shape it already injects for blog. The reviewer must emit `video_review.rubric_evaluation.<criterion_key> = { pass: boolean, evidence: string }` for all 10 criteria.
- Existing `extractRubricEvaluation` already handles the `<type>_review.rubric_evaluation` nesting — no changes there.

**3. Producer ↔ reviewer contract reconciliation (Fix 2)**
- Decision per field (per spec recommendation):
  - `chapter_count` — producer adopts. Emit at producer-emission time as `script.chapters.length`. Cheap, no schema rename.
  - `thumbnail.visual_style` vs `thumbnail.visual_concept` — alias. Reviewer's expected name is `visual_style`; producer emits both during a transition window, then drops `visual_concept` once reviewer stops referencing it.
  - `editor_script`, `lower_thirds`, `thumbnail_ideas` — reviewer adopts. Reviewer schema and rubric criteria learn to evaluate them; no schema flagging.
- `VideoOutput` interface in `packages/shared/src/types/agents.ts` is the single source of truth — agent-4-review.md schema block must match every required field.

**4. Stagnation detector (deep module)**
- New file: `apps/api/src/lib/ai/scoring/detectStagnation.ts`
- Pure function: `detectStagnation(iterations: ReviewIteration[]): { stagnant: boolean; reason?: 'flat_score' | 'repeated_critical' | 'both' }`.
- Internal helpers `extractCriticalIssueTitles(iteration)` and `jaccardSimilarity(setA, setB)` are exported for unit testing.
- Rules (from spec, encoded precisely):
  - History length < 3 → `{ stagnant: false }`
  - Last 3 iterations: max-min score ≤ 2 → flat-score signal
  - Jaccard of critical-issue title sets between iteration N-2 and N ≥ 0.7 → repeated-critical signal
  - Both signals required for `stagnant: true`. Reason field reports which signals tripped.
- Zero I/O. No DB calls. Consumes the same `ReviewIteration` shape already returned by the dispatcher's upsert.

**5. `awaiting_reason` enum + writer union**
- Migration `YYYYMMDDHHMMSS_awaiting_reason_add_stagnation.sql`: drop + recreate `stage_runs_awaiting_reason_check` with `'stagnation'` added.
- `AwaitingReason` TypeScript union in `apps/api/src/lib/pipeline/stage-run-writer.ts` grows by one member.
- No new column on `stage_runs`. No new column on `review_iterations`.

**6. Dispatcher integration**
- In `pipeline-review-dispatch.ts`, after writing the current iteration to `review_iterations` and before the `iterationCount >= maxIterations` branch:
  - Load the last 3 `review_iterations` rows for this draft (ordered by iteration ASC).
  - Call `detectStagnation`.
  - If stagnant AND the `ENABLE_REVIEW_STAGNATION_PARK` env flag is on: bypass the loop-continue branch and `markAwaitingUser({ awaitingReason: 'stagnation' })`.
  - The `runOutcome` type union grows by `{ status: 'awaiting_user'; awaitingReason: 'stagnation' }`.
- Stagnation takes precedence over `max_iterations` when both would trigger (a flat 5-iteration loop should park as `stagnation`, not `max_iterations`).

**7. Cost denormalization on `review_iterations`**
- Migration adds two columns: `produce_cost_cents int null`, `review_cost_cents int null`.
- Dispatcher writes `review_cost_cents` at the same `review_iterations` upsert where it already writes score/feedback. Producer dispatcher (`pipeline-production-dispatch.ts` and revision path) writes `produce_cost_cents` when it emits the draft snapshot that becomes this iteration.
- Why denormalize: `credit_usage` doesn't currently carry a per-iteration tag and joining by `session_id=draftId` returns the sum across all iterations. Denormalization at write time is one row update vs. retroactive backfill of `credit_usage` tagging.

**8. `GET /:id/iterations` response shape**
- Add `produceCostCents`, `reviewCostCents`, `lastRevisionStrategy` to each entry in the `iterations` array.
- `lastRevisionStrategy` comes from the `priorAttempts` array the producer received when it ran — capture it on the iteration row at producer-write time so the iterations endpoint doesn't need to walk producer payloads.
- Response envelope unchanged: still `{ data: { iterations: [...] }, error: null }`.

**9. `ReviewIterationsPicker` UI**
- Add a cost row inside each expanded iteration card: "Producer $X.XX · Reviewer $Y.YY · Total $Z.ZZ".
- Add a one-line "Producer fix attempt: …" pulled from the new `lastRevisionStrategy` field.
- Add a score delta vs. prior iteration next to the score number (+5, −3, no change).
- No new component. No new route.

### Rollout

- **Fix 2 (schema reconciliation)** — ship behind no flag. Pure contract fix.
- **Fix 1 (video rubric wiring)** — ship behind `ENABLE_VIDEO_RUBRIC` env flag. Default off in prod until one end-to-end video review lands green.
- **Fix 3 (stagnation park)** — ship behind `ENABLE_REVIEW_STAGNATION_PARK` env flag. Default off in prod for 7 days while observing false-positive rate (target < 5%).
- **Fix 4 (cost + revision visibility)** — ship behind no flag. Pure read-side surface.

Flags removed after two weeks of stable behavior.

### Stagnation detector signature (from prototype-style sketch)

```ts
interface ReviewIteration {
  iteration: number;
  score: number | null;
  feedbackJson: Record<string, unknown> | null;
}

type StagnationReason = 'flat_score' | 'repeated_critical' | 'both';

function detectStagnation(
  iterations: ReviewIteration[],
): { stagnant: boolean; reason?: StagnationReason };
```

Inlined here because the precise rule (which signals must trip, and that both must trip for `stagnant: true`) is the load-bearing decision the dispatcher depends on.

## Testing Decisions

A good test for this PRD asserts **external behavior the creator or downstream system observes** — score values, park reasons, response payload fields, UI render output. It does not assert internal sequencing of writes, the order of `step.run` calls inside the dispatcher, or the shape of intermediate Supabase query results.

Three test surfaces:

**1. `detectStagnation` unit tests** (new file: `apps/api/src/lib/ai/scoring/__tests__/detectStagnation.test.ts`)
- < 3 iterations → not stagnant.
- 3 iterations, scores [60, 60, 60], same critical issue → stagnant with reason `both`.
- 3 iterations, scores [60, 62, 60], same critical issue → stagnant (within ±2 tolerance).
- 3 iterations, scores [60, 70, 80] → not stagnant (score improving).
- 3 iterations, scores [60, 60, 60] but disjoint critical issues → not stagnant.
- 5 iterations, last 3 flat → stagnant (only last 3 considered).
- Prior art: `apps/api/src/lib/ai/scoring/__tests__/computeRubricScore.test.ts` is the closest pattern — pure-function tests on a deterministic scorer with fixture inputs.

**2. Dispatcher integration test for stagnation park** (extend `apps/api/src/jobs/__tests__/pipeline-review-dispatch.test.ts`)
- Fixture: a draft with 2 prior `review_iterations` at score 60 with identical critical issue. Run the dispatcher with a third reviewer response that returns score 60 + same critical issue.
- Assert: Stage Run is marked `awaiting_user` with `awaiting_reason='stagnation'`, NOT `max_iterations`.
- Assert: `review_iterations` has the third row upserted.
- Counter-fixture: same setup but third response returns score 90 → assert `markCompleted` runs and `awaiting_reason` is null.
- Prior art: the existing `pipeline-review-dispatch.test.ts` already exercises the dispatcher with mocked Supabase + mocked `generateWithFallback`. Reuse those mock helpers.

**3. Video schema conformance test** (new file: `packages/shared/src/types/__tests__/video-schema-conformance.test.ts`)
- Parses `agents/agent-4-review.md` expected-schema block.
- Asserts every field name under `production.video` exists on the `VideoOutput` interface (or is documented as a derived field with a one-line comment in the type).
- Fails CI if a future edit to either side introduces a new mismatch.
- Prior art: none exact. Closest is the existing Zod schema round-trip tests in `packages/shared/src/schemas/__tests__/`.

Out of testing scope (covered manually before flag flip):
- End-to-end autopilot run on a real video project.
- False-positive park-rate measurement (operator/telemetry, not unit test).

## Out of Scope

- Authoring rubrics for `shorts` and `podcast`. Same pattern applies — file a follow-up once video lands green.
- Producer retry-budget caps per project tier — separate concern (cost control, not loop convergence).
- Reviewer model selection auto-tuning (Sonnet vs Opus per iteration).
- Backfilling old stuck projects. Existing parked projects continue using the manual-override panel; this PRD only affects new runs.
- Refunding producer credits on stagnation park.
- ENV-configurable stagnation thresholds per project tier (free vs paid). Spec open question — defer until the default-3 rule has telemetry.
- Renaming the `draft` slot in `autopilotConfigSchema` to `production` to match the post-T1.6 Stage taxonomy.

## Further Notes

- Spec source: `docs/specs/review-loop-stagnation-fixes.md`. PRD diverges from the spec on one point: Fix 1 is **wiring** the existing `VIDEO_CRITERIA`, not authoring it — the spec implies authoring is needed. Confirm by reading `apps/api/src/lib/ai/scoring/criteria/video.ts` before estimating.
- `awaiting_reason` enum extension follows the same migration pattern as `20260516130000_awaiting_reason_quota_exhausted.sql` and `20260519100000_awaiting_reason_full_union.sql`. Reuse the drop-and-recreate-check-constraint shape.
- `review_iterations` table already exists with columns `(draft_id, iteration, score, verdict, feedback_json, draft_json, created_at)` and a uniqueness constraint on `(draft_id, iteration)` per `20260526122000_review_iterations_unique.sql`. The two cost columns are additive.
- The recommended ship order from the spec is 2 → 1 → 3 → 4. Schema alignment first so the rubric can reference real field names, rubric second, stagnation third (depends on a real numeric score varying across iterations to be meaningful), cost UX last.
- Per-project tier knobs for stagnation (e.g. free tier parks after 2 instead of 3) and the producer-refund question are tracked as open questions in the source spec — both deferred to follow-ups.
