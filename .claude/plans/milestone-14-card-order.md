# Milestone 14 — Card Order

## Order

1. **#204 — Expand AwaitingReason union**
   - Touches: `apps/api/src/lib/pipeline/stage-run-writer.ts`, `mirror-from-legacy.ts`, `review-loop.ts`, AI error mapping, pause endpoint
   - Tests: `apps/api/src/lib/pipeline/__tests__/`
   - Unblocks #205

2. **#205 — Audit pipeline-edge-cases.spec.ts**
   - Touches: `apps/app/e2e/new-project/pipeline-edge-cases.spec.ts`
   - 25 tests classified GREEN/YELLOW/RED
   - Requires #204's final union to baseline against

## Parallelization

None. Hard sequential dependency.

## Risk notes

- **#204 abort decision** — likely drop `manual_abort` from union if abort is one-shot terminal. Decide during analysis by reading current abort route.
- **#204 migration risk** — `stage_runs.awaiting_reason` may be plain TEXT (app-layer validated). Verify before drafting migration.
- **#205 fixture drift** — `mockPipelineEdge` factory may emit reasons the real orchestrator never writes. Each RED test needs reshape or explicit `test.skip` with comment.
