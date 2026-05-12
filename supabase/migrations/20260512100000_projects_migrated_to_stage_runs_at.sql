-- Slice 13 (#21) — backfill marker column for the one-shot pipeline_state_json → stage_runs migration.
-- See scripts/backfill-stage-runs.ts. Idempotency hinges on `migrated_to_stage_runs_at IS NULL`.

alter table projects
  add column if not exists migrated_to_stage_runs_at timestamptz;

create index if not exists idx_projects_migrated_to_stage_runs_at
  on projects(migrated_to_stage_runs_at)
  where migrated_to_stage_runs_at is null;
