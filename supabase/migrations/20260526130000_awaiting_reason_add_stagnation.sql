-- PRD #240 Module 5: extend awaiting_reason CHECK constraint to include
-- 'stagnation' — emitted by pipeline-review-dispatch when three consecutive
-- review iterations show no score progress (max-min ≤ 2) AND overlapping
-- critical issues (Jaccard ≥ 0.7). Distinct from 'max_iterations' so
-- telemetry can measure converged-vs-gave-up-early rates separately.
--
-- Pattern mirrors 20260519100000_awaiting_reason_full_union.sql.

ALTER TABLE stage_runs DROP CONSTRAINT IF EXISTS stage_runs_awaiting_reason_check;

ALTER TABLE stage_runs
  ADD CONSTRAINT stage_runs_awaiting_reason_check
  CHECK (awaiting_reason IN (
    'manual_paste',
    'manual_advance',
    'manual_review',
    'provider_quota_exhausted',
    'max_iterations',
    'user_paused',
    'stagnation'
  ));
