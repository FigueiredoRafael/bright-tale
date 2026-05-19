-- T5 #204: extend awaiting_reason CHECK constraint to the full PRD #185 superset.
-- Adds 'max_iterations' (review-loop budget exhaustion, distinct from manual_review)
-- and 'user_paused' (pause endpoint stamps the active stage).
-- 'manual_abort' is intentionally NOT added: abort is terminal-only and never routes
-- through awaiting_user (see markAborted / abortProject / bulkAbort in stage-run-writer.ts).

alter table stage_runs drop constraint if exists stage_runs_awaiting_reason_check;

alter table stage_runs
  add constraint stage_runs_awaiting_reason_check
  check (awaiting_reason in (
    'manual_paste',
    'manual_advance',
    'manual_review',
    'provider_quota_exhausted',
    'max_iterations',
    'user_paused'
  ));
