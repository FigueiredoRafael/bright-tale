-- F2-007: Channel references + reference content tables
-- Up to N references per channel (limit by plan).
-- Stores analyzed content from reference channels.

create table public.channel_references (
  id              uuid primary key default gen_random_uuid(),
  channel_id      uuid not null references public.channels(id) on delete cascade,
  org_id          uuid not null references public.organizations(id) on delete cascade,

  url             text not null,
  platform        text not null default 'youtube',   -- 'youtube', 'blog', 'tiktok'
  name            text,
  external_id     text,                              -- YouTube channel ID, etc.

  -- Cached stats
  subscribers     integer,
  monthly_views   bigint,
  video_count     integer,

  -- Analysis results
  patterns_json   jsonb,                             -- title patterns, posting frequency, engagement
  analyzed_at     timestamptz,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_channel_references_channel on public.channel_references(channel_id);
create index idx_channel_references_org on public.channel_references(org_id);

create trigger trg_channel_references_updated_at
  before update on public.channel_references
  for each row execute function public.handle_updated_at();

alter table public.channel_references enable row level security;

-- ─── reference_content ──────────────────────────────────────────────────────
-- Top videos/posts from a reference channel, with engagement metrics.

create table public.reference_content (
  id                uuid primary key default gen_random_uuid(),
  reference_id      uuid not null references public.channel_references(id) on delete cascade,

  external_id       text not null,                   -- YouTube video ID
  title             text not null,
  url               text,
  published_at      timestamptz,

  -- Metrics
  view_count        bigint,
  like_count        integer,
  comment_count     integer,
  duration_seconds  integer,
  engagement_rate   numeric,

  -- Content
  description       text,
  tags              text[],
  transcript        text,                            -- from Whisper (top 3-5 videos)

  created_at        timestamptz not null default now()
);

create index idx_reference_content_ref on public.reference_content(reference_id);

alter table public.reference_content enable row level security;
