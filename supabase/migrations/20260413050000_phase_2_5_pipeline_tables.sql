-- Phase 2.5 pipeline tables (F2-015).
-- Unifies brainstorm runs → ideas → research → content drafts → assets.
-- Legacy blog_drafts/video_drafts/research_archives are kept until F6-009.

-- ─── brainstorm_sessions ────────────────────────────────────────────
create table public.brainstorm_sessions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  channel_id uuid references public.channels(id) on delete set null,
  input_mode text not null check (input_mode in ('blind', 'fine_tuned', 'reference_guided')),
  input_json jsonb not null default '{}'::jsonb,
  model_tier text not null default 'standard',
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed')),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_brainstorm_sessions_org on public.brainstorm_sessions(org_id);
create index idx_brainstorm_sessions_channel on public.brainstorm_sessions(channel_id);
create index idx_brainstorm_sessions_user on public.brainstorm_sessions(user_id);
alter table public.brainstorm_sessions enable row level security;
create trigger trg_brainstorm_sessions_updated_at
  before update on public.brainstorm_sessions
  for each row execute function public.handle_updated_at();

-- Link existing idea_archives rows back to the brainstorm that produced them.
alter table public.idea_archives
  add column brainstorm_session_id uuid references public.brainstorm_sessions(id) on delete set null;
create index idx_idea_archives_brainstorm on public.idea_archives(brainstorm_session_id);

-- ─── research_sessions ──────────────────────────────────────────────
create table public.research_sessions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  channel_id uuid references public.channels(id) on delete set null,
  idea_id text references public.idea_archives(id) on delete set null,
  level text not null check (level in ('surface', 'medium', 'deep')),
  focus_tags text[] not null default array[]::text[],
  input_json jsonb not null default '{}'::jsonb,
  cards_json jsonb,
  approved_cards_json jsonb,
  model_tier text not null default 'standard',
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'reviewed', 'failed')),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_research_sessions_org on public.research_sessions(org_id);
create index idx_research_sessions_channel on public.research_sessions(channel_id);
create index idx_research_sessions_idea on public.research_sessions(idea_id);
alter table public.research_sessions enable row level security;
create trigger trg_research_sessions_updated_at
  before update on public.research_sessions
  for each row execute function public.handle_updated_at();

-- ─── content_drafts ─────────────────────────────────────────────────
create table public.content_drafts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  channel_id uuid references public.channels(id) on delete set null,
  idea_id text references public.idea_archives(id) on delete set null,
  research_session_id uuid references public.research_sessions(id) on delete set null,
  type text not null check (type in ('blog', 'video', 'shorts', 'podcast')),
  title text,
  canonical_core_json jsonb,
  draft_json jsonb,
  review_feedback_json jsonb,
  status text not null default 'draft' check (status in ('draft', 'in_review', 'approved', 'scheduled', 'published', 'failed')),
  scheduled_at timestamptz,
  published_at timestamptz,
  published_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_content_drafts_org on public.content_drafts(org_id);
create index idx_content_drafts_channel on public.content_drafts(channel_id);
create index idx_content_drafts_idea on public.content_drafts(idea_id);
create index idx_content_drafts_type_status on public.content_drafts(type, status);
alter table public.content_drafts enable row level security;
create trigger trg_content_drafts_updated_at
  before update on public.content_drafts
  for each row execute function public.handle_updated_at();

-- ─── content_assets ─────────────────────────────────────────────────
create table public.content_assets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  draft_id uuid not null references public.content_drafts(id) on delete cascade,
  type text not null check (type in ('image', 'thumbnail', 'audio', 'video_clip')),
  url text not null,
  provider text,
  meta_json jsonb not null default '{}'::jsonb,
  credits_used integer not null default 0,
  position integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_content_assets_draft on public.content_assets(draft_id);
create index idx_content_assets_type on public.content_assets(type);
alter table public.content_assets enable row level security;
create trigger trg_content_assets_updated_at
  before update on public.content_assets
  for each row execute function public.handle_updated_at();
