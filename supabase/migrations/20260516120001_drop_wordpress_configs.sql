-- T6.5b — Drop legacy wordpress_configs table.
-- All reads/writes moved to publish_targets in T6.5a (#138).
-- channels.wordpress_config_id FK and the publish_targets_id forward-pointer
-- column on wordpress_configs must be dropped first to release dependencies,
-- then the table itself is dropped.
--
-- Note: channels.wordpress_config_id was defined in the original
-- 20260412234959_channels.sql migration but was never reflected in the
-- generated database.ts types (the column was superseded before types were
-- regenerated). The drop is safe — no application code reads it.

alter table public.channels drop column if exists wordpress_config_id;
drop table if exists public.wordpress_configs cascade;
