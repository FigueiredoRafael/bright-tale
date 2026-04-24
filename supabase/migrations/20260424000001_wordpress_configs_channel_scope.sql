-- supabase/migrations/20260424000001_wordpress_configs_channel_scope.sql
--
-- Migrate wordpress_configs from org/user-scoped to channel-scoped.
-- Inverts the relationship: channels.wordpress_config_id → wordpress_configs.channel_id (1:1).
-- Removes redundant user_id and org_id columns.
-- Date: 2026-04-24

-- 1. Drop orphan rows (no channel references them; confirmed empty or OK to drop).
delete from public.wordpress_configs;

-- 2. Remove the channel → config FK (relationship is inverting).
alter table public.channels drop column if exists wordpress_config_id;

-- 3. Add channel_id on wordpress_configs, enforce 1:1.
alter table public.wordpress_configs
  add column channel_id uuid not null
    references public.channels(id) on delete cascade;

create unique index wordpress_configs_channel_id_unique
  on public.wordpress_configs(channel_id);

-- 4. Drop user_id / org_id — redundant once channel_id is required.
alter table public.wordpress_configs drop column if exists user_id;
alter table public.wordpress_configs drop column if exists org_id;
