# Issue #205 — pipeline-edge-cases.spec.ts audit

**Branch (to create on resume):** `feat/t5.205-edge-cases-audit` off `integration/multi-track-pipeline`

**Blocked-by status:** PR #206 (issue #204) is open as of session close. #205 can start on top of `feat/t5.204-awaiting-reason-union` if #206 hasn't merged yet — the new AwaitingReason values it depends on are already on that branch.

## Spec under audit

`apps/app/e2e/new-project/pipeline-edge-cases.spec.ts` (999 lines, 25 describe blocks, 1 test each = 25 tests).

## Reference: AwaitingReason union after #204

`apps/api/src/lib/pipeline/stage-run-writer.ts`:
- `manual_paste`, `manual_advance`, `manual_review` (pre-existing)
- `provider_quota_exhausted`, `max_iterations`, `user_paused` (new in #204)
- `manual_abort` deliberately excluded — abort writes `status='aborted'` directly via `markAborted`/`abortProject`, never parks in `awaiting_user`

Emit sites (verified):
- `provider_quota_exhausted` → `pipeline-review-dispatch.ts` catch, `pipeline-assets-dispatch.ts` catch, `{brainstorm,research,production}-generate.ts` catch (all via `isQuotaExhausted` helper in `apps/api/src/lib/ai/router.ts`)
- `max_iterations` → `pipeline-review-dispatch.ts:231` budget exhaustion
- `user_paused` → `apps/api/src/routes/projects.ts` PUT+PATCH via `stampUserPausedOnActiveStage` on `false→true` pause toggle
- `manual_paste` → `pipeline-assets-dispatch.ts:87` (`mode === 'manual_upload'`)

## Classification table

| # | Describe | Mode | Class | Action |
|---|---|---|---|---|
| 1 | EC-R1 low-score-retry | step-by-step | GREEN | none |
| 2 | EC-R1 low-score-retry | supervised | GREEN | none |
| 3 | EC-R1 low-score-retry | overview | GREEN | none |
| 4 | EC-R2 max-iterations | step-by-step | RED | reshape → `data-reason="max_iterations"`; update fixture |
| 5 | EC-R2 max-iterations | supervised | RED | reshape → `data-reason="max_iterations"`; update fixture |
| 6 | EC-R3 hard-fail | step-by-step | GREEN | none |
| 7 | EC-R3 hard-fail | supervised | GREEN | none |
| 8 | EC-R3 hard-fail | overview | GREEN | none |
| 9 | EC-F1 provider-quota | step-by-step | GREEN | none |
| 10 | EC-F1 provider-quota | supervised | GREEN | none |
| 11 | EC-F1 provider-quota | overview | GREEN | none |
| 12 | EC-F2 manual-paste | step-by-step | YELLOW | comment → `pipeline-assets-dispatch.ts:87` |
| 13 | EC-F2 manual-paste | supervised | YELLOW | same |
| 14 | EC-F2 manual-paste | overview | YELLOW | same |
| 15 | EC-F3 stage-failure-retry | step-by-step | YELLOW | trace retry-CTA endpoint, comment with route file:line |
| 16 | EC-F3 stage-failure-retry | supervised | YELLOW | same |
| 17 | EC-F3 stage-failure-retry | overview | YELLOW | same |
| 18 | EC-F4 malformed-json | step-by-step | RED | reshape → `data-status="failed"` (production retries-then-`markFailed`, never `manual_paste`) |
| 19 | EC-F4 malformed-json | supervised | RED | same |
| 20 | EC-F4 malformed-json | overview | RED | same |
| 21 | EC-I1 manual-pause-resume | supervised | YELLOW | extend assertion → `data-reason="user_paused"`; comment → `projects.ts` (stampUserPausedOnActiveStage) |
| 22 | EC-I1 manual-pause-resume | overview | YELLOW | same |
| 23 | EC-I2 manual-abort | step-by-step | YELLOW | comment → `stage-run-writer.ts` `abortProject` (production path, not PATCH `status:aborted`) |
| 24 | EC-I2 manual-abort | supervised | YELLOW | same |
| 25 | EC-I2 manual-abort | overview | YELLOW | same |

Totals: GREEN 9 / YELLOW 11 / RED 5

## Implementation order (resume tomorrow)

1. **Fixture edit** — `apps/app/e2e/helpers/mockPipelineEdge.ts:213` — change emitted `manual_review` → `max_iterations` for the `maxIterations` edge case.
2. **RED reshapes (5 tests):**
   - EC-R2 ×2: spec assertions `data-reason="manual_review"` → `data-reason="max_iterations"`
   - EC-F4 ×3: reshape to assert `data-status="failed"` + retain malformed-json error text in assertion; remove `data-reason="manual_paste"` expectation
3. **YELLOW comments + extensions (11 tests):**
   - EC-F2 ×3: inline comment per test
   - EC-F3 ×3: trace retry CTA endpoint first (`restart-stage-btn` → which route?), then inline comment
   - EC-I1 ×2: extend assertion + inline comment
   - EC-I2 ×3: inline comment
4. **Verify**
   - `npx playwright test new-project/pipeline-edge-cases` ×3 consecutive runs (zero flake)
   - `npm run typecheck`
5. **PR** — title `feat(e2e): audit pipeline-edge-cases for production-fidelity drift (#205)`, base `integration/multi-track-pipeline`, body must include the audit table above (acceptance criterion).
6. **Finish-issue workflow** — merge PR → close #205 → close milestone 14 (last issue).

## Open question to confirm tomorrow

EC-F3 retry CTA: which API route does `restart-stage-btn` POST to? Grep for the data-testid in `apps/app/src/` and trace to a route. Needed before adding the YELLOW comment.

## Inline comment template

```ts
// emitted by apps/api/src/<file>.ts:<line> — see #185 reason taxonomy
```
