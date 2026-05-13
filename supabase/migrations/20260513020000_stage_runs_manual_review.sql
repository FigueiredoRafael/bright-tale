-- Add `manual_review` to the allowed awaiting_reason values.
-- Used by pipeline-review-dispatch when the review iteration cap is hit
-- (the Stage Run parks awaiting a human decision: approve / re-run / abandon).
alter table stage_runs drop constraint if exists stage_runs_awaiting_reason_check;
alter table stage_runs
  add constraint stage_runs_awaiting_reason_check
  check (awaiting_reason in ('manual_paste', 'manual_advance', 'manual_review'));
