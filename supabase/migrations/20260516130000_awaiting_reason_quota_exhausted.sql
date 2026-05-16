-- T9.F153: extend awaiting_reason CHECK constraint to include provider_quota_exhausted
-- Drops the existing check (if any) and re-creates it with the new variant.

alter table stage_runs drop constraint if exists stage_runs_awaiting_reason_check;

alter table stage_runs
  add constraint stage_runs_awaiting_reason_check
  check (awaiting_reason in ('manual_paste', 'manual_advance', 'manual_review', 'provider_quota_exhausted'));
