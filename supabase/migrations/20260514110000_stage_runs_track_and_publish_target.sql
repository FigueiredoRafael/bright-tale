-- T1.2: Add track_id + publish_target_id to stage_runs.
-- Extends the non-terminal uniqueness index to include both new dimensions
-- using COALESCE with a sentinel UUID for NULLs (enables partial index on
-- nullable columns).

alter table stage_runs
  add column track_id          uuid references tracks(id) on delete cascade,
  add column publish_target_id uuid references publish_targets(id) on delete cascade;

-- ─── Drop old non-terminal unique index ──────────────────────────────────────

drop index if exists one_non_terminal_per_stage;

-- ─── Recreate with track_id + publish_target_id dimensions ──────────────────

create unique index one_non_terminal_per_stage
  on stage_runs(
    project_id,
    stage,
    coalesce(track_id,          '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(publish_target_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where status in ('queued', 'running', 'awaiting_user');

-- ─── Query index for per-Track lookups ───────────────────────────────────────

create index if not exists idx_stage_runs_project_track_stage
  on stage_runs(project_id, track_id, stage);
