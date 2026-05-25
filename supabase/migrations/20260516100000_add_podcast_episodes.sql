-- T6.4: Add podcast_episodes table.
-- Owned by the RSS feed generator (T6.4). Consumed by Spotify (T6.2) and
-- Apple Podcasts (T6.3) drivers — neither should need schema changes; they
-- write rows here and the generic feed reader picks them up.

create table public.podcast_episodes (
  id                uuid primary key default gen_random_uuid(),
  publish_target_id uuid not null references public.publish_targets(id) on delete cascade,
  channel_id        uuid not null references public.channels(id) on delete cascade,
  stage_run_id      uuid references public.stage_runs(id) on delete set null,
  title             text not null,
  description       text not null,
  audio_url         text not null,
  duration_sec      integer,
  guid              text not null,
  published_at      timestamptz not null default now(),
  itunes_explicit   boolean not null default false,
  itunes_image_url  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Primary query pattern: list episodes for a channel ordered by newest first.
create index idx_podcast_episodes_channel_id on public.podcast_episodes(channel_id);
create index idx_podcast_episodes_channel_published
  on public.podcast_episodes(channel_id, published_at desc);

-- Each guid must be unique within a publish_target (same feed).
create unique index ux_podcast_episodes_guid_per_target
  on public.podcast_episodes(publish_target_id, guid);

create trigger handle_updated_at before update on public.podcast_episodes
  for each row execute function moddatetime(updated_at);

alter table public.podcast_episodes enable row level security;

-- Deny-all by default; only service_role (bypass RLS) may read/write.
-- This matches the repository convention for all tables.
create policy "deny all"
  on public.podcast_episodes
  as restrictive
  for all
  using (false);
