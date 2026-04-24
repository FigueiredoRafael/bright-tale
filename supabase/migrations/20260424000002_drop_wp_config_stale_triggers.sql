-- Drop triggers that reference org_id / user_id columns which were removed
-- in migration 20260424000001_wordpress_configs_channel_scope.sql
drop trigger if exists trg_wordpress_configs_org_id on public.wordpress_configs;
drop trigger if exists trg_wordpress_configs_user_id on public.wordpress_configs;
