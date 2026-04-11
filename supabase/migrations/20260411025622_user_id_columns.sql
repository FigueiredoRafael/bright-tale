-- Migration B: add user_id to 13 content tables.
-- Nullable — dev uses db:reset so no backfill needed.
-- NOT NULL constraint added in SP2 after first routes are migrated.

-- ─── set_user_id trigger function ─────────────────────────────────────────────
-- Defense-in-depth: if API somehow omits user_id, fallback to auth.uid().
create or replace function public.set_user_id()
returns trigger language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is null then
    new.user_id = auth.uid();
  end if;
  return new;
end;
$$;

-- ─── research_archives ────────────────────────────────────────────────────────
alter table public.research_archives
  add column user_id uuid references auth.users(id);
create index idx_research_archives_user_id on public.research_archives(user_id);
create trigger trg_research_archives_user_id
  before insert on public.research_archives
  for each row execute function public.set_user_id();

-- ─── projects ─────────────────────────────────────────────────────────────────
alter table public.projects
  add column user_id uuid references auth.users(id);
create index idx_projects_user_id     on public.projects(user_id);
create index idx_projects_user_status on public.projects(user_id, status);
create trigger trg_projects_user_id
  before insert on public.projects
  for each row execute function public.set_user_id();

-- ─── idea_archives ────────────────────────────────────────────────────────────
alter table public.idea_archives
  add column user_id uuid references auth.users(id);
create index idx_idea_archives_user_id on public.idea_archives(user_id);
create trigger trg_idea_archives_user_id
  before insert on public.idea_archives
  for each row execute function public.set_user_id();

-- ─── templates ────────────────────────────────────────────────────────────────
alter table public.templates
  add column user_id uuid references auth.users(id);
create index idx_templates_user_id on public.templates(user_id);
create trigger trg_templates_user_id
  before insert on public.templates
  for each row execute function public.set_user_id();

-- ─── wordpress_configs ────────────────────────────────────────────────────────
alter table public.wordpress_configs
  add column user_id uuid references auth.users(id);
create index idx_wordpress_configs_user_id on public.wordpress_configs(user_id);
create trigger trg_wordpress_configs_user_id
  before insert on public.wordpress_configs
  for each row execute function public.set_user_id();

-- ─── ai_provider_configs ──────────────────────────────────────────────────────
alter table public.ai_provider_configs
  add column user_id uuid references auth.users(id);
create index idx_ai_provider_configs_user_id on public.ai_provider_configs(user_id);
create trigger trg_ai_provider_configs_user_id
  before insert on public.ai_provider_configs
  for each row execute function public.set_user_id();

-- ─── image_generator_configs ──────────────────────────────────────────────────
alter table public.image_generator_configs
  add column user_id uuid references auth.users(id);
create index idx_image_generator_configs_user_id on public.image_generator_configs(user_id);
create trigger trg_image_generator_configs_user_id
  before insert on public.image_generator_configs
  for each row execute function public.set_user_id();

-- ─── blog_drafts ──────────────────────────────────────────────────────────────
alter table public.blog_drafts
  add column user_id uuid references auth.users(id);
create index idx_blog_drafts_user_id     on public.blog_drafts(user_id);
create index idx_blog_drafts_user_status on public.blog_drafts(user_id, status);
create trigger trg_blog_drafts_user_id
  before insert on public.blog_drafts
  for each row execute function public.set_user_id();

-- ─── video_drafts ─────────────────────────────────────────────────────────────
alter table public.video_drafts
  add column user_id uuid references auth.users(id);
create index idx_video_drafts_user_id     on public.video_drafts(user_id);
create index idx_video_drafts_user_status on public.video_drafts(user_id, status);
create trigger trg_video_drafts_user_id
  before insert on public.video_drafts
  for each row execute function public.set_user_id();

-- ─── shorts_drafts ────────────────────────────────────────────────────────────
alter table public.shorts_drafts
  add column user_id uuid references auth.users(id);
create index idx_shorts_drafts_user_id on public.shorts_drafts(user_id);
create trigger trg_shorts_drafts_user_id
  before insert on public.shorts_drafts
  for each row execute function public.set_user_id();

-- ─── podcast_drafts ───────────────────────────────────────────────────────────
alter table public.podcast_drafts
  add column user_id uuid references auth.users(id);
create index idx_podcast_drafts_user_id on public.podcast_drafts(user_id);
create trigger trg_podcast_drafts_user_id
  before insert on public.podcast_drafts
  for each row execute function public.set_user_id();

-- ─── assets ───────────────────────────────────────────────────────────────────
alter table public.assets
  add column user_id uuid references auth.users(id);
create index idx_assets_user_id on public.assets(user_id);
create trigger trg_assets_user_id
  before insert on public.assets
  for each row execute function public.set_user_id();

-- ─── canonical_core ───────────────────────────────────────────────────────────
alter table public.canonical_core
  add column user_id uuid references auth.users(id);
create index idx_canonical_core_user_id on public.canonical_core(user_id);
create trigger trg_canonical_core_user_id
  before insert on public.canonical_core
  for each row execute function public.set_user_id();
