-- BRI-158 (D24c): Drop the legacy `status` column from brainstorm_sessions and
-- research_sessions. stage_runs is now the single source of truth for session
-- status (D24 / principle M15). All writers were removed in BRI-157 and all
-- readers derive status from stage_runs; the transitional column fallbacks were
-- removed in the same change set as this migration.
--
-- The CHECK constraints on `status` are dropped automatically with the column.
ALTER TABLE public.brainstorm_sessions DROP COLUMN IF EXISTS status;
ALTER TABLE public.research_sessions DROP COLUMN IF EXISTS status;
