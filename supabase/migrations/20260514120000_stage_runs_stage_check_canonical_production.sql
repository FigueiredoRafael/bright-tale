-- T1.3: Extend stage_runs.stage CHECK to accept canonical and production.
-- Keeps draft for legacy rows (backfill happens later). New stages:
--   canonical  — shared project-level stage (replaces Draft.core phase)
--   production — per-Track stage (replaces Draft.produce phase)
-- Total accepted values: 9 (brainstorm, research, draft, canonical, production,
--                            review, assets, preview, publish)

alter table stage_runs drop constraint if exists stage_runs_stage_check;

alter table stage_runs
  add constraint stage_runs_stage_check
  check (stage in (
    'brainstorm',
    'research',
    'draft',        -- legacy, kept until data backfill migration
    'canonical',    -- new: shared project-level core phase
    'production',   -- new: per-Track produce phase
    'review',
    'assets',
    'preview',
    'publish'
  ));
