-- F2-001: Channels, youtube_niche_analyses, and related modifications.
-- A channel is a content project (YouTube, blog, or both) owned by an org.

-- ─── channels ────────────────────────────────────────────────────────────────

create table public.channels (
  id                          uuid primary key default gen_random_uuid(),
  org_id                      uuid not null references public.organizations(id) on delete cascade,
  user_id                     uuid not null references auth.users(id),
  name                        text not null,
  niche                       text,
  niche_tags                  text[],
  market                      text not null default 'br',
  language                    text not null default 'pt-BR',
  channel_type                text not null default 'text',
  is_evergreen                boolean not null default true,

  -- YouTube (optional)
  youtube_url                 text,
  youtube_channel_id          text,

  -- Blog (optional)
  blog_url                    text,
  wordpress_config_id         text references public.wordpress_configs(id),

  -- Voice config
  voice_provider              text default 'openai',
  voice_id                    text,
  voice_speed                 numeric not null default 1.0,
  voice_style                 text default 'narration',

  -- AI config
  model_tier                  text not null default 'standard',
  custom_model_config_json    jsonb,
  tone                        text default 'informative',
  template_id                 text references public.templates(id),

  -- YouTube stats cache
  youtube_subs                integer,
  youtube_monthly_views       bigint,
  estimated_revenue_brl       numeric,

  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index idx_channels_org_id on public.channels(org_id);
create index idx_channels_user_id on public.channels(user_id);

create trigger trg_channels_updated_at
  before update on public.channels
  for each row execute function public.handle_updated_at();

alter table public.channels enable row level security;

-- ─── youtube_niche_analyses (cache) ─────────────────────────────────────────

create table public.youtube_niche_analyses (
  id                          uuid primary key default gen_random_uuid(),
  channel_id                  uuid references public.channels(id) on delete cascade,
  org_id                      uuid not null references public.organizations(id) on delete cascade,
  user_id                     uuid not null references auth.users(id),
  niche                       text not null,
  market                      text not null,
  language                    text not null,

  reference_channels_json     jsonb,
  top_videos_json             jsonb,
  opportunities_json          jsonb,
  saturated_topics_json       jsonb,
  optimal_duration            text,
  optimal_posting_schedule    text,

  analyzed_at                 timestamptz not null default now(),
  expires_at                  timestamptz not null default (now() + interval '7 days'),
  created_at                  timestamptz not null default now()
);

create index idx_youtube_niche_org on public.youtube_niche_analyses(org_id);
create index idx_youtube_niche_channel on public.youtube_niche_analyses(channel_id);

alter table public.youtube_niche_analyses enable row level security;

-- ─── Link projects to channels ──────────────────────────────────────────────

alter table public.projects
  add column channel_id uuid references public.channels(id);

create index idx_projects_channel_id on public.projects(channel_id);

-- ─── Onboarding state on user_profiles ──────────────────────────────────────

alter table public.user_profiles
  add column onboarding_completed boolean not null default false,
  add column onboarding_step text;
