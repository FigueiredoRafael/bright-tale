-- T1.4: Add channels.default_media_config_json for per-medium wizard defaults.
-- Shape: {
--   blog?:    { targetWords?: number, ... },
--   video?:   { targetDurationMin?: number, videoStyleConfig?: ... },
--   shorts?:  { targetDurationSec?: number },
--   podcast?: { targetDurationMin?: number, defaultPublishTargetIds?: string[] }
-- }
-- Nullable — existing channels default to NULL (wizard uses hardcoded defaults).

alter table public.channels
  add column default_media_config_json jsonb;
