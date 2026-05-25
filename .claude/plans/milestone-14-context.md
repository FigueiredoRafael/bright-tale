# Milestone 14 — E2E Full Pipeline · AwaitingReason Reconciliation

**GitHub Milestone:** https://github.com/FigueiredoRafael/bright-tale/milestone/14
**Parent PRD:** #185
**Goal:** Bring orchestrator `awaiting_reason` values in line with PRD #185 e2e assertions; audit M4 edge specs for production-fidelity drift.
**Integration branch:** `integration/multi-track-pipeline`

## Why this exists

M4 (PRs #201/#202/#203) landed 25 edge tests under `apps/app/e2e/new-project/pipeline-edge-cases.spec.ts`. During M4 we discovered the orchestrator's `AwaitingReason` is a closed set of 3 values (`manual_paste | manual_advance | manual_review`) but PRD #185 specs assumed at least 7 values. Tests were either adapted to current code or assert on fixture-only DOM that real orchestrator cannot reproduce. M5 closes that gap.

## Cards

| # | Title | State | Status |
|---|---|---|---|
| 204 | Expand AwaitingReason union to match PRD #185 e2e assertions | open | not started |
| 205 | Audit pipeline-edge-cases.spec.ts for production-fidelity drift | open | not started (blocked by 204) |

## Execution order

1. **#204** — expand union + wire orchestrator branches + tests
2. **#205** — audit + reshape/skip RED tests against the now-final union

Cannot parallelize — #205 baselines on #204's final value set.

## Target AwaitingReason superset

```ts
export type AwaitingReason =
  | 'manual_paste'
  | 'manual_advance'
  | 'manual_review'
  | 'provider_quota_exhausted'   // provider 429 catches → stage halts
  | 'max_iterations'             // review-loop hits autopilotConfig.review.maxIterations
  | 'user_paused'                // POST /api/projects/:id/pause stamps active stage
  | 'manual_abort';              // ONLY if abort routes through awaiting (decision pending)
```

## Per-card phase tracking

### #204
- [ ] Analysis
- [ ] Plan (user approved)
- [ ] Implementation
- [ ] QA (typecheck + test:api)
- [ ] PR opened
- [ ] Merged into integration branch

### #205
- [ ] Analysis
- [ ] Plan (user approved)
- [ ] Implementation
- [ ] QA (playwright pipeline-edge-cases × 3 runs)
- [ ] PR opened
- [ ] Merged into integration branch

## Completion criteria

- Both cards closed
- Milestone 14 closed in tracker
- `npm run typecheck` + `npm run test:api` + `npx playwright test new-project/pipeline-edge-cases` all green on integration branch
