# Review Loop Stagnation — Execution Plan

**Status:** draft
**Date:** 2026-05-26
**Owner:** Hector
**Context:** Project `8c4b8965-df33-4484-a742-29b7b4865ff2` (video track) ran 6 review iterations with score frozen at 60. Diagnosis surfaced 4 structural problems in the review loop that cost credits without producing convergence.

---

## Problem Summary

| # | Symptom | Root cause | Evidence |
|---|---|---|---|
| 1 | Same critical issue ("missing citations") flagged iter 1-5 | Producer retries with paraphrase, can't structurally fix because video script format has no inline citation slot | `review_iterations.feedback_json.video_review.issues.critical` |
| 2 | Score stuck at exactly 60 every iteration | Video has no rubric. Tier-based fallback maps `needs_revision → 60`. Only `excellent` tier crosses approval threshold (90). | `getRubricForType('video') → null` in `computeRubricScore.ts:9` |
| 3 | Iter 6 surfaced schema mismatches (`production.video.chapter_count` missing) | Producer emits `script.chapters[]` (array); reviewer expects `chapter_count` (number). Producer also adds `editor_script`, `thumbnail_ideas`, `lower_thirds` not in reviewer contract. | `agents/agent-4-review.md:118` vs `packages/shared/src/types/agents.ts:366` |
| 4 | Loop ran to maxIterations every time | `hardFailThreshold=50`, `autoApproveThreshold=90`, score=60 stuck → neither gate triggered. Stagnation detection absent. | `autopilot-config-resolver.ts:41` |

Combined effect: the review loop is **non-converging by construction** for any non-blog medium. Each cycle costs producer + reviewer credits with no real progress signal.

---

## Goals

- Video (and other non-blog mediums) must be able to **reach `approved`** without escaping into manual override.
- Loop must **detect stagnation** and hard-fail instead of burning credits at maxIterations.
- Producer and reviewer must agree on the **output contract** for video — no required-field-missing flags for fields the producer can't emit.

## Non-goals

- Re-architecting the producer agent. We assume agent prompts are roughly correct; the gaps are in **scoring**, **contract alignment**, and **loop control**.
- Adding rubrics for shorts/podcast in this slice. Same pattern applies — handle in a follow-up once video rubric is validated.
- Backfilling old projects. Existing stuck projects use manual override.

---

## Execution Plan

Four fixes, ordered by leverage. Each is independently shippable. Recommended order: **2 → 1 → 3 → 4** (schema align before rubric so the rubric criteria can reference real fields).

### Fix 1 — Add video rubric

**Why:** Without a rubric, score is a coarse 4-bucket tier mapped to {95, 82, 60, 20}. No way for the loop to detect "got better but still not 90" or for the producer to know which specific criterion to attack next.

**Where:**
- New file: `apps/api/src/lib/ai/scoring/criteria/video.ts`
- Update: `apps/api/src/lib/ai/scoring/computeRubricScore.ts:getRubricForType` → return `VIDEO_CRITERIA` for `type==='video'`.
- Update reviewer prompt to emit `rubric_evaluation.<criterion>.pass + evidence` per criterion for video (mirror blog format).

**Criteria (initial proposal — refine with one of your published videos as reference):**

| key | weight | passWhen |
|---|---|---|
| `core_tension_alignment` | 15 | Script delivers the canonical thesis without dilution. |
| `hook_strength` | 10 | First 25s create curiosity gap with concrete stakes. |
| `evidence_citations` | 15 | Every statistic in the script has source attribution in `video_description` sources block. |
| `chapter_pacing` | 10 | No chapter exceeds 90s without a beat shift. |
| `cta_clarity` | 5 | Subscribe CTA + comment prompt are present and on-brand. |
| `affiliate_integration` | 5 | If affiliate moment present, trigger context is non-promotional. |
| `script_voice_consistency` | 10 | Voice matches selected persona's signature phrases. |
| `visual_brief_completeness` | 10 | Each chapter has b-roll suggestions; thumbnail has visual concept + text overlay. |
| `metadata_completeness` | 10 | `video_title.primary`, `video_description`, `pinned_comment`, `lower_thirds`, `estimated_duration` all present and non-empty. |
| `schema_compliance` | 10 | All required fields in `VideoOutput` interface present (drives Fix 3 alignment). |

Total: 100 max. 90 = approved.

**Acceptance:**
- Re-running review on the current draft (which the reviewer scored "needs_revision") produces a numeric score that varies between iterations, not 60-or-null.
- Test: `apps/api/src/lib/ai/scoring/__tests__/computeRubricScore.test.ts` — `getRubricForType('video')` returns array of 10 criteria summing to 100.

**Estimate:** 1 day (writing criteria + reviewer prompt update + test).

---

### Fix 2 — Align producer ↔ reviewer video contract

**Why:** Iter 6 flagged `production.video.chapter_count` as a missing required field, but `VideoOutput` doesn't define it. Same for `thumbnail.visual_style` vs the producer's `thumbnail.visual_concept`. Producer adds `editor_script`, `lower_thirds`, `thumbnail_ideas` — reviewer treats them as non-contract noise.

**Where:**
- `packages/shared/src/types/agents.ts:366` — `VideoOutput` interface.
- `agents/agent-4-review.md:118` — Expected schema block.
- `agents/agent-3-produce.md` — Producer output schema (if there).

**Decision needed (per field):** for each field name that diverges, pick one of:
- (a) Producer adopts reviewer's name → emit `chapter_count` derived from `script.chapters.length`. Cheap, no semantic change.
- (b) Reviewer adopts producer's structure → reviewer reads `script.chapters.length` instead of `chapter_count`. More accurate, larger reviewer-prompt edit.

**Recommended:** (a) for derivable fields (`chapter_count`, `visual_style`); (b) for `editor_script`, `lower_thirds`, `thumbnail_ideas` — these are real producer features and the reviewer should learn to evaluate them, not flag them as schema noise.

**Tasks:**
1. Diff `agent-4-review.md` expected schema against `VideoOutput` — make exhaustive list of mismatches.
2. For each, decide (a) or (b) and apply.
3. Add validation test that walks every field name in `agent-4-review.md` video block and asserts it exists in `VideoOutput` (or has a documented derivation).

**Acceptance:**
- Re-running review on the same draft no longer flags any `production.video.* required field is missing` critical.
- New schema-conformance test fails if producer or reviewer adds a field without the other side learning it.

**Estimate:** 0.5 day.

---

### Fix 3 — Stagnation detection (early exit)

**Why:** Loop currently runs to `maxIterations` (default 5) even when every iteration returns the same score and same critical issue. That's 5× producer + 5× reviewer credits for zero convergence.

**Where:**
- `apps/api/src/jobs/pipeline-review-dispatch.ts` — after `reviewScore` derivation, before `markCompleted`/`markAwaitingUser`.
- New helper: `apps/api/src/lib/ai/scoring/detectStagnation.ts`.

**Logic:**

```ts
function isStagnant(history: ReviewIteration[]): boolean {
  if (history.length < 3) return false;
  const last3 = history.slice(-3);
  // Same score (±2) AND same top critical issue title (Jaccard >=0.7) → stuck.
  const scoreFlat = last3.every(it =>
    Math.abs((it.score ?? 0) - (last3[0].score ?? 0)) <= 2
  );
  const sameTopCritical = jaccardSimilarity(
    extractCriticalIssueTitles(last3[0]),
    extractCriticalIssueTitles(last3[last3.length - 1]),
  ) >= 0.7;
  return scoreFlat && sameTopCritical;
}
```

On detection:
- Mark Stage Run `awaiting_user` with `awaiting_reason='stagnation'` (new enum value).
- Surface in UI: "Review hasn't improved in 3 iterations. Edit manually or pick a different idea." (already 2 of the 4 buttons we render in the manual-override panel.)
- Don't hard-fail — user might still pick "use this" on the best iteration.

**Schema:**
- `awaiting_reason` enum already exists. Add `'stagnation'` value.
- `review_iterations` already has all needed data; no new column.

**Acceptance:**
- Project with 3 consecutive 60-score `needs_revision` iterations parks at `awaiting_user(stagnation)` instead of continuing to iter 4-5.
- Stagnation banner appears in `FocusPanel` with same actions as `awaiting_user(max_iterations)`.
- Test: dispatcher integration test with fixture of 3 identical-score iterations asserts park.

**Estimate:** 1 day.

---

### Fix 4 — Per-iteration credit + reasoning visibility (UX)

**Why:** Shipping #1-3 still leaves the user in the dark if a loop legitimately needs 5 tries. Iteration history picker now shows feedback details (just shipped) but not **per-iteration cost** or **what the producer tried to fix**. Without that the user can't decide whether to keep iterating or abandon.

**Where:**
- `apps/api/src/routes/content-drafts.ts:/:id/iterations` GET handler — include `produceCostCents` and `reviewCostCents` per iteration (already in `credit_ledger` keyed by iteration).
- `apps/app/src/components/engines/ReviewIterationsPicker.tsx` — render cost row per iteration when expanded; show "Producer attempted: <last revision strategy>" pulled from `priorAttempts` it received.

**Acceptance:**
- Expanded iteration row shows: cost in cents, score delta vs prior iteration, top critical issue, "Producer fix attempt: <summary>".
- Sum of per-iteration costs equals project's review-loop total in `credit_ledger`.

**Estimate:** 0.5 day.

---

## Rollout Order & Gates

1. **Fix 2 (schema align)** — ship behind no flag. Pure contract fix. Existing drafts re-review cleanly.
2. **Fix 1 (video rubric)** — ship behind `ENABLE_VIDEO_RUBRIC` env flag. Switch on after one published video reviews green end-to-end.
3. **Fix 3 (stagnation detection)** — ship behind `ENABLE_REVIEW_STAGNATION_PARK` flag. Default off in prod for 7d while we collect telemetry on false-positive park rate (target <5%).
4. **Fix 4 (per-iter cost UX)** — ship behind no flag. Pure read-side surface.

Flags removed after 2 weeks of stable behavior.

## Out of Scope

- Rubrics for shorts/podcast — file `review-loop-stagnation-fixes-followup.md` once Fix 1 lands.
- Producer retry budget caps per project tier — separate concern (cost control, not loop convergence).
- Reviewer model selection auto-tuning — Sonnet vs Opus per iteration. Future.

## Open Questions

1. Should `Fix 3` stagnation park be ENV-configurable per project tier? Free tier might want park-after-2 instead of park-after-3 to limit credit burn.
2. Producer credit on stagnation park: refund last iteration's producer cost (they did the work but loop bailed)? Current default is no refund.
3. For Fix 2 option (a) — derive `chapter_count` at mapper layer or at producer-emission layer? Mapper keeps producer prompt simple; emission keeps reviewer-side reads simple.

## Validation

End-to-end test scenario (post all four fixes):
1. Create video project, run autopilot.
2. Expect either: approved within 3 iterations OR `awaiting_user(stagnation)` parked at iteration 3.
3. Never reach iteration 5 unless `enable_review_stagnation_park=false`.
4. UI shows numeric score that varies per iteration (Fix 1) + per-iter cost (Fix 4).
