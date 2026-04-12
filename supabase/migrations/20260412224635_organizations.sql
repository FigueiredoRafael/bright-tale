-- F1-002: Organizations, org_memberships, and org_invites tables
-- Foundation for multi-tenancy: all content belongs to an org, not a user.

-- ─── organizations ───────────────────────────────────────────────────────────

create table public.organizations (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null,
  slug                   text unique not null,
  logo_url               text,

  -- Billing (Stripe — wired in Phase 3)
  stripe_customer_id     text unique,
  stripe_subscription_id text,
  plan                   text not null default 'free',
  billing_cycle          text default 'monthly',
  plan_started_at        timestamptz,
  plan_expires_at        timestamptz,

  -- Credits
  credits_total          integer not null default 1000,
  credits_used           integer not null default 0,
  credits_reset_at       timestamptz,
  credits_addon          integer not null default 0,

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create trigger trg_organizations_updated_at
  before update on public.organizations
  for each row execute function public.handle_updated_at();

alter table public.organizations enable row level security;

-- ─── org_memberships ─────────────────────────────────────────────────────────

create table public.org_memberships (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  user_id           uuid not null references auth.users(id) on delete cascade,
  role              text not null default 'member',

  -- Optional per-member credit limit
  credit_limit      integer,
  credits_used_cycle integer not null default 0,

  invited_by        uuid references auth.users(id),
  invited_at        timestamptz,
  accepted_at       timestamptz,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique(org_id, user_id)
);

create index idx_org_memberships_user_id on public.org_memberships(user_id);
create index idx_org_memberships_org_id on public.org_memberships(org_id);

create trigger trg_org_memberships_updated_at
  before update on public.org_memberships
  for each row execute function public.handle_updated_at();

alter table public.org_memberships enable row level security;

-- ─── org_invites ─────────────────────────────────────────────────────────────

create table public.org_invites (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  email       text not null,
  role        text not null default 'member',
  invited_by  uuid not null references auth.users(id),

  token       text unique not null,
  status      text not null default 'pending',
  expires_at  timestamptz not null,
  accepted_at timestamptz,

  created_at  timestamptz not null default now()
);

create index idx_org_invites_token on public.org_invites(token);
create index idx_org_invites_org_id on public.org_invites(org_id);
create index idx_org_invites_email on public.org_invites(email);

alter table public.org_invites enable row level security;

-- ─── Auto-create personal org on signup ──────────────────────────────────────
-- When a new user_profiles row is inserted (from onPostSignUp hook), create
-- a personal organization and make the user its owner.

create or replace function public.create_personal_org()
returns trigger language plpgsql security definer as $$
declare
  new_org_id uuid;
  user_email text;
  org_slug text;
begin
  -- Get the user's email for the org name
  select email into user_email from auth.users where id = new.id;

  -- Generate a unique slug from the user id (first 8 chars)
  org_slug := 'personal-' || replace(new.id::text, '-', '');

  -- Create the org
  insert into public.organizations (name, slug, plan)
  values (
    coalesce(split_part(user_email, '@', 1), 'My Organization'),
    org_slug,
    'free'
  )
  returning id into new_org_id;

  -- Make the user the owner
  insert into public.org_memberships (org_id, user_id, role, accepted_at)
  values (new_org_id, new.id, 'owner', now());

  return new;
end;
$$;

create trigger trg_user_profiles_create_org
  after insert on public.user_profiles
  for each row execute function public.create_personal_org();
