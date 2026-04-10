-- ============================================================
-- BrightTale initial schema
-- Ported from Prisma schema — all tables snake_case, RLS enabled
-- ============================================================

-- Extensions
create extension if not exists moddatetime schema extensions;

-- Shared updated_at trigger function
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─── agent_prompts ────────────────────────────────────────────
create table public.agent_prompts (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  slug text not null unique,
  stage text not null,
  instructions text not null,
  input_schema text,
  output_schema text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_agent_prompts_slug on public.agent_prompts (slug);
create index idx_agent_prompts_stage on public.agent_prompts (stage);
alter table public.agent_prompts enable row level security;
create trigger trg_agent_prompts_updated_at
  before update on public.agent_prompts
  for each row execute function public.handle_updated_at();

-- ─── research_archives ────────────────────────────────────────
create table public.research_archives (
  id text primary key default gen_random_uuid()::text,
  title text not null,
  theme text not null,
  research_content text not null,
  projects_count integer not null default 0,
  winners_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.research_archives enable row level security;
create trigger trg_research_archives_updated_at
  before update on public.research_archives
  for each row execute function public.handle_updated_at();

-- ─── research_sources ─────────────────────────────────────────
create table public.research_sources (
  id text primary key default gen_random_uuid()::text,
  research_id text not null references public.research_archives(id) on delete cascade,
  url text not null,
  title text not null,
  author text,
  date timestamptz,
  created_at timestamptz not null default now()
);
create index idx_research_sources_research_id on public.research_sources (research_id);
alter table public.research_sources enable row level security;

-- ─── projects ─────────────────────────────────────────────────
create table public.projects (
  id text primary key default gen_random_uuid()::text,
  title text not null,
  research_id text references public.research_archives(id),
  current_stage text not null,
  completed_stages text[] not null default '{}',
  auto_advance boolean not null default true,
  status text not null,
  winner boolean not null default false,
  video_style_config text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_projects_research_id on public.projects (research_id);
create index idx_projects_status on public.projects (status);
create index idx_projects_current_stage on public.projects (current_stage);
alter table public.projects enable row level security;
create trigger trg_projects_updated_at
  before update on public.projects
  for each row execute function public.handle_updated_at();

-- ─── stages ───────────────────────────────────────────────────
create table public.stages (
  id text primary key default gen_random_uuid()::text,
  project_id text not null references public.projects(id) on delete cascade,
  stage_type text not null,
  yaml_artifact text not null,
  version integer not null default 1,
  created_at timestamptz not null default now()
);
create index idx_stages_project_id_stage_type on public.stages (project_id, stage_type);
alter table public.stages enable row level security;

-- ─── revisions ────────────────────────────────────────────────
create table public.revisions (
  id text primary key default gen_random_uuid()::text,
  stage_id text not null references public.stages(id) on delete cascade,
  yaml_artifact text not null,
  version integer not null,
  created_at timestamptz not null default now(),
  created_by text,
  change_notes text
);
create index idx_revisions_stage_id on public.revisions (stage_id);
alter table public.revisions enable row level security;

-- ─── templates (self-referential) ─────────────────────────────
create table public.templates (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  type text not null,
  config_json text not null,
  parent_template_id text references public.templates(id) deferrable initially deferred,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_templates_type on public.templates (type);
alter table public.templates enable row level security;
create trigger trg_templates_updated_at
  before update on public.templates
  for each row execute function public.handle_updated_at();

-- ─── idea_archives ────────────────────────────────────────────
create table public.idea_archives (
  id text primary key default gen_random_uuid()::text,
  idea_id text not null unique,
  title text not null,
  core_tension text not null,
  target_audience text not null,
  verdict text not null,
  discovery_data text not null,
  source_type text not null default 'brainstorm',
  source_project_id text,
  tags text[] not null default '{}',
  is_public boolean not null default true,
  usage_count integer not null default 0,
  markdown_content text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_idea_archives_verdict on public.idea_archives (verdict);
create index idx_idea_archives_source_type on public.idea_archives (source_type);
create index idx_idea_archives_is_public on public.idea_archives (is_public);
alter table public.idea_archives enable row level security;
create trigger trg_idea_archives_updated_at
  before update on public.idea_archives
  for each row execute function public.handle_updated_at();

-- ─── wordpress_configs ────────────────────────────────────────
create table public.wordpress_configs (
  id text primary key default gen_random_uuid()::text,
  site_url text not null,
  username text not null,
  password text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.wordpress_configs enable row level security;
create trigger trg_wordpress_configs_updated_at
  before update on public.wordpress_configs
  for each row execute function public.handle_updated_at();

-- ─── ai_provider_configs ──────────────────────────────────────
create table public.ai_provider_configs (
  id text primary key default gen_random_uuid()::text,
  provider text not null,
  api_key text not null,
  is_active boolean not null default false,
  config_json text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_ai_provider_configs_provider on public.ai_provider_configs (provider);
create index idx_ai_provider_configs_is_active on public.ai_provider_configs (is_active);
alter table public.ai_provider_configs enable row level security;
create trigger trg_ai_provider_configs_updated_at
  before update on public.ai_provider_configs
  for each row execute function public.handle_updated_at();

-- ─── image_generator_configs ──────────────────────────────────
create table public.image_generator_configs (
  id text primary key default gen_random_uuid()::text,
  provider text not null,
  api_key text not null,
  model text not null,
  is_active boolean not null default false,
  config_json text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_image_generator_configs_is_active on public.image_generator_configs (is_active);
alter table public.image_generator_configs enable row level security;
create trigger trg_image_generator_configs_updated_at
  before update on public.image_generator_configs
  for each row execute function public.handle_updated_at();

-- ─── assets ───────────────────────────────────────────────────
create table public.assets (
  id text primary key default gen_random_uuid()::text,
  project_id text,
  asset_type text not null,
  source text not null,
  source_url text,
  local_path text,
  prompt text,
  role text,
  content_type text,
  content_id text,
  alt_text text,
  wordpress_id integer,
  wordpress_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_assets_project_id on public.assets (project_id);
create index idx_assets_source on public.assets (source);
create index idx_assets_content_type on public.assets (content_type);
create index idx_assets_content_id on public.assets (content_id);
alter table public.assets enable row level security;
create trigger trg_assets_updated_at
  before update on public.assets
  for each row execute function public.handle_updated_at();

-- ─── idempotency_keys ─────────────────────────────────────────
create table public.idempotency_keys (
  id text primary key default gen_random_uuid()::text,
  token text not null unique,
  purpose text,
  request_hash text,
  response jsonb,
  consumed boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);
create index idx_idempotency_keys_token on public.idempotency_keys (token);
create index idx_idempotency_keys_created_at on public.idempotency_keys (created_at);
alter table public.idempotency_keys enable row level security;

-- ─── canonical_core ───────────────────────────────────────────
create table public.canonical_core (
  id text primary key default gen_random_uuid()::text,
  idea_id text not null,
  project_id text,
  thesis text not null,
  argument_chain_json text not null,
  emotional_arc_json text not null,
  key_stats_json text not null,
  key_quotes_json text,
  affiliate_moment_json text,
  cta_subscribe text,
  cta_comment_prompt text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_canonical_core_idea_id on public.canonical_core (idea_id);
create index idx_canonical_core_project_id on public.canonical_core (project_id);
alter table public.canonical_core enable row level security;
create trigger trg_canonical_core_updated_at
  before update on public.canonical_core
  for each row execute function public.handle_updated_at();

-- ─── blog_drafts ──────────────────────────────────────────────
create table public.blog_drafts (
  id text primary key default gen_random_uuid()::text,
  title text not null,
  slug text not null,
  meta_description text not null,
  full_draft text not null,
  outline_json text,
  primary_keyword text,
  secondary_keywords text[] not null default '{}',
  affiliate_placement text,
  affiliate_copy text,
  affiliate_link text,
  affiliate_rationale text,
  internal_links_json text,
  word_count integer not null default 0,
  status text not null default 'draft',
  project_id text,
  idea_id text,
  wordpress_post_id integer,
  wordpress_url text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_blog_drafts_status on public.blog_drafts (status);
create index idx_blog_drafts_project_id on public.blog_drafts (project_id);
create index idx_blog_drafts_idea_id on public.blog_drafts (idea_id);
create index idx_blog_drafts_slug on public.blog_drafts (slug);
alter table public.blog_drafts enable row level security;
create trigger trg_blog_drafts_updated_at
  before update on public.blog_drafts
  for each row execute function public.handle_updated_at();

-- ─── video_drafts ─────────────────────────────────────────────
create table public.video_drafts (
  id text primary key default gen_random_uuid()::text,
  title text not null,
  title_options text[] not null default '{}',
  thumbnail_json text,
  script_json text,
  total_duration_estimate text,
  word_count integer not null default 0,
  status text not null default 'draft',
  project_id text,
  idea_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_video_drafts_status on public.video_drafts (status);
create index idx_video_drafts_project_id on public.video_drafts (project_id);
create index idx_video_drafts_idea_id on public.video_drafts (idea_id);
alter table public.video_drafts enable row level security;
create trigger trg_video_drafts_updated_at
  before update on public.video_drafts
  for each row execute function public.handle_updated_at();

-- ─── shorts_drafts ────────────────────────────────────────────
create table public.shorts_drafts (
  id text primary key default gen_random_uuid()::text,
  shorts_json text not null,
  short_count integer not null default 3,
  total_duration text,
  status text not null default 'draft',
  project_id text,
  idea_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_shorts_drafts_status on public.shorts_drafts (status);
create index idx_shorts_drafts_project_id on public.shorts_drafts (project_id);
create index idx_shorts_drafts_idea_id on public.shorts_drafts (idea_id);
alter table public.shorts_drafts enable row level security;
create trigger trg_shorts_drafts_updated_at
  before update on public.shorts_drafts
  for each row execute function public.handle_updated_at();

-- ─── podcast_drafts ───────────────────────────────────────────
create table public.podcast_drafts (
  id text primary key default gen_random_uuid()::text,
  episode_title text not null,
  episode_description text not null,
  intro_hook text not null,
  talking_points_json text not null,
  personal_angle text not null,
  guest_questions text[] not null default '{}',
  outro text not null,
  duration_estimate text,
  word_count integer not null default 0,
  status text not null default 'draft',
  project_id text,
  idea_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_podcast_drafts_status on public.podcast_drafts (status);
create index idx_podcast_drafts_project_id on public.podcast_drafts (project_id);
create index idx_podcast_drafts_idea_id on public.podcast_drafts (idea_id);
alter table public.podcast_drafts enable row level security;
create trigger trg_podcast_drafts_updated_at
  before update on public.podcast_drafts
  for each row execute function public.handle_updated_at();
