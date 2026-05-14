-- T1.1: Add tracks and publish_targets tables for multi-track pipeline.
-- tracks — a per-medium production lane below the project.
-- publish_targets — a publisher endpoint scoped to a channel or org.

-- ─── tracks ──────────────────────────────────────────────────────────────────

create table public.tracks (
  id          uuid primary key default gen_random_uuid(),
  project_id  text not null references public.projects(id) on delete cascade,
  medium      text not null check (medium in ('blog', 'video', 'shorts', 'podcast')),
  status      text not null check (status in ('active', 'aborted', 'completed')) default 'active',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_tracks_project_id on public.tracks(project_id);
create index idx_tracks_project_medium on public.tracks(project_id, medium);

-- One active track per medium per project.
create unique index one_active_track_per_medium
  on public.tracks(project_id, medium)
  where status = 'active';

create trigger handle_updated_at before update on public.tracks
  for each row execute function moddatetime(updated_at);

alter table public.tracks enable row level security;

-- Authenticated users may read tracks for their own projects (ownership via channel).
create policy "user reads own project tracks"
  on public.tracks for select
  using (
    project_id in (
      select p.id from public.projects p
      where (
        p.channel_id is not null and
        p.channel_id in (select id from public.channels where user_id = auth.uid())
      )
      or (
        p.channel_id is null and p.research_id is not null and
        p.research_id in (select id from public.research_archives where user_id = auth.uid())
      )
    )
  );

-- ─── publish_targets ─────────────────────────────────────────────────────────

create table public.publish_targets (
  id                       uuid primary key default gen_random_uuid(),
  channel_id               uuid references public.channels(id) on delete cascade,
  org_id                   uuid references public.organizations(id) on delete cascade,
  type                     text not null check (type in ('wordpress', 'youtube', 'spotify', 'apple_podcasts', 'rss')),
  display_name             text not null,
  credentials_encrypted    text,
  config_json              jsonb,
  is_active                boolean not null default true,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  -- XOR: exactly one of channel_id or org_id must be set.
  check ((channel_id is not null) or (org_id is not null))
);

create index idx_publish_targets_channel_id on public.publish_targets(channel_id);
create index idx_publish_targets_org_id on public.publish_targets(org_id);

create trigger handle_updated_at before update on public.publish_targets
  for each row execute function moddatetime(updated_at);

alter table public.publish_targets enable row level security;

-- Channel-scoped publish_targets: owner may read.
create policy "user reads own channel publish_targets"
  on public.publish_targets for select
  using (
    (channel_id is not null and channel_id in (
      select id from public.channels where user_id = auth.uid()
    ))
    or
    (org_id is not null and org_id in (
      select org_id from public.org_memberships where user_id = auth.uid()
    ))
  );
