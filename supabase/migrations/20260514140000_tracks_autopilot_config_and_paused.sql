-- T1.5: Add autopilot_config_json + paused to tracks.
-- autopilot_config_json — nullable partial override of project-level autopilot config.
--   Shape mirrors AutopilotConfig (per-stage maxIterations, minScore, etc.).
-- paused — orchestrator checks this before dispatching any stage_run for this Track.
--   Existing tracks default to false (not paused).

alter table public.tracks
  add column autopilot_config_json jsonb,
  add column paused               boolean not null default false;
