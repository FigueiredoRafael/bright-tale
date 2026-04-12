-- F1-006: Add org_id to all content tables for multi-tenancy.
-- Nullable for now — dev uses db:reset so no backfill needed.
-- NOT NULL constraint added after org assignment logic is wired.

-- ─── Defense-in-depth trigger function ───────────────────────────────────────
-- If API somehow omits org_id, fall back to user's primary org.
create or replace function public.set_org_id()
returns trigger language plpgsql security definer as $$
begin
  if new.org_id is null and new.user_id is not null then
    select org_id into new.org_id
    from public.org_memberships
    where user_id = new.user_id
    order by created_at asc
    limit 1;
  end if;
  return new;
end;
$$;

-- ─── research_archives ──────────────────────────────────────────────────────
alter table public.research_archives
  add column org_id uuid references public.organizations(id);
create index idx_research_archives_org_id on public.research_archives(org_id);
create trigger trg_research_archives_org_id
  before insert on public.research_archives
  for each row execute function public.set_org_id();

-- ─── projects ───────────────────────────────────────────────────────────────
alter table public.projects
  add column org_id uuid references public.organizations(id);
create index idx_projects_org_id on public.projects(org_id);
create index idx_projects_org_status on public.projects(org_id, status);
create trigger trg_projects_org_id
  before insert on public.projects
  for each row execute function public.set_org_id();

-- ─── idea_archives ──────────────────────────────────────────────────────────
alter table public.idea_archives
  add column org_id uuid references public.organizations(id);
create index idx_idea_archives_org_id on public.idea_archives(org_id);
create trigger trg_idea_archives_org_id
  before insert on public.idea_archives
  for each row execute function public.set_org_id();

-- ─── templates ──────────────────────────────────────────────────────────────
alter table public.templates
  add column org_id uuid references public.organizations(id);
create index idx_templates_org_id on public.templates(org_id);
create trigger trg_templates_org_id
  before insert on public.templates
  for each row execute function public.set_org_id();

-- ─── wordpress_configs ──────────────────────────────────────────────────────
alter table public.wordpress_configs
  add column org_id uuid references public.organizations(id);
create index idx_wordpress_configs_org_id on public.wordpress_configs(org_id);
create trigger trg_wordpress_configs_org_id
  before insert on public.wordpress_configs
  for each row execute function public.set_org_id();

-- ─── ai_provider_configs ────────────────────────────────────────────────────
alter table public.ai_provider_configs
  add column org_id uuid references public.organizations(id);
create index idx_ai_provider_configs_org_id on public.ai_provider_configs(org_id);
create trigger trg_ai_provider_configs_org_id
  before insert on public.ai_provider_configs
  for each row execute function public.set_org_id();

-- ─── image_generator_configs ────────────────────────────────────────────────
alter table public.image_generator_configs
  add column org_id uuid references public.organizations(id);
create index idx_image_generator_configs_org_id on public.image_generator_configs(org_id);
create trigger trg_image_generator_configs_org_id
  before insert on public.image_generator_configs
  for each row execute function public.set_org_id();

-- ─── blog_drafts ────────────────────────────────────────────────────────────
alter table public.blog_drafts
  add column org_id uuid references public.organizations(id);
create index idx_blog_drafts_org_id on public.blog_drafts(org_id);
create index idx_blog_drafts_org_status on public.blog_drafts(org_id, status);
create trigger trg_blog_drafts_org_id
  before insert on public.blog_drafts
  for each row execute function public.set_org_id();

-- ─── video_drafts ───────────────────────────────────────────────────────────
alter table public.video_drafts
  add column org_id uuid references public.organizations(id);
create index idx_video_drafts_org_id on public.video_drafts(org_id);
create index idx_video_drafts_org_status on public.video_drafts(org_id, status);
create trigger trg_video_drafts_org_id
  before insert on public.video_drafts
  for each row execute function public.set_org_id();

-- ─── shorts_drafts ──────────────────────────────────────────────────────────
alter table public.shorts_drafts
  add column org_id uuid references public.organizations(id);
create index idx_shorts_drafts_org_id on public.shorts_drafts(org_id);
create trigger trg_shorts_drafts_org_id
  before insert on public.shorts_drafts
  for each row execute function public.set_org_id();

-- ─── podcast_drafts ─────────────────────────────────────────────────────────
alter table public.podcast_drafts
  add column org_id uuid references public.organizations(id);
create index idx_podcast_drafts_org_id on public.podcast_drafts(org_id);
create trigger trg_podcast_drafts_org_id
  before insert on public.podcast_drafts
  for each row execute function public.set_org_id();

-- ─── assets ─────────────────────────────────────────────────────────────────
alter table public.assets
  add column org_id uuid references public.organizations(id);
create index idx_assets_org_id on public.assets(org_id);
create trigger trg_assets_org_id
  before insert on public.assets
  for each row execute function public.set_org_id();

-- ─── canonical_core ─────────────────────────────────────────────────────────
alter table public.canonical_core
  add column org_id uuid references public.organizations(id);
create index idx_canonical_core_org_id on public.canonical_core(org_id);
create trigger trg_canonical_core_org_id
  before insert on public.canonical_core
  for each row execute function public.set_org_id();

-- ─── agent_prompts (nullable — system prompts have no org) ──────────────────
alter table public.agent_prompts
  add column org_id uuid references public.organizations(id);
create index idx_agent_prompts_org_id on public.agent_prompts(org_id);
