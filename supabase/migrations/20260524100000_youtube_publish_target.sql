-- S8: YouTube OAuth scaffolding
--
-- 1. Add unique constraint on (channel_id, type) so the OAuth callback can
--    upsert a single youtube publish_target per channel without duplicates.
-- 2. The 'youtube' value already exists in the type check constraint
--    (added in 20260514100000_add_tracks_and_publish_targets.sql).
--    credentials_encrypted already exists for token storage.

-- Unique index so ON CONFLICT (channel_id, type) works in the callback upsert.
-- Partial: only when channel_id is not null (org-scoped targets excluded).
create unique index if not exists idx_publish_targets_channel_type
  on public.publish_targets (channel_id, type)
  where channel_id is not null;
