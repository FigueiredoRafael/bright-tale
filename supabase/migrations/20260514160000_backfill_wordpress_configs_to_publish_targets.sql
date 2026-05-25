-- T2.8 — Backfill wordpress_configs → publish_targets.
-- Idempotent: a forward-pointer (wordpress_configs.publish_targets_id) gates
-- the INSERT so re-running the migration is a no-op.

-- Forward pointer for cutover safety + idempotency gate.
alter table public.wordpress_configs
  add column if not exists publish_targets_id uuid
  references public.publish_targets(id) on delete set null;

create index if not exists idx_wordpress_configs_publish_targets_id
  on public.wordpress_configs (publish_targets_id);

-- Backfill: each wordpress_configs row → one publish_targets row.
-- display_name falls back to channel name when site_url is somehow blank.
-- config_json carries the non-secret surface for the dispatcher.
with inserted as (
  insert into public.publish_targets
    (channel_id, type, display_name, credentials_encrypted, config_json, is_active)
  select
    wc.channel_id,
    'wordpress',
    coalesce(nullif(wc.site_url, ''), ch.name),
    wc.password,
    jsonb_build_object(
      'siteUrl', wc.site_url,
      'username', wc.username
    ),
    true
  from public.wordpress_configs wc
  join public.channels ch on ch.id = wc.channel_id
  where wc.publish_targets_id is null
  returning id, channel_id
)
update public.wordpress_configs wc
   set publish_targets_id = inserted.id
  from inserted
 where inserted.channel_id = wc.channel_id
   and wc.publish_targets_id is null;
