-- Add email, premium, and active columns to user_profiles.
-- pg_trgm enables accelerated ilike '%term%' searches.

create extension if not exists pg_trgm;

alter table public.user_profiles
  add column email              text unique,
  add column is_premium         boolean not null default false,
  add column premium_plan       text check (premium_plan in ('monthly', 'yearly')),
  add column premium_started_at timestamptz,
  add column premium_expires_at timestamptz,
  add column is_active          boolean not null default true;

-- Premium fields must be all-or-nothing
alter table public.user_profiles
  add constraint chk_premium_consistency
  check (
    (is_premium = false and premium_plan is null and premium_started_at is null and premium_expires_at is null)
    or
    (is_premium = true and premium_plan is not null and premium_started_at is not null)
  );

-- Indexes for filters and sort
create index idx_user_profiles_email       on public.user_profiles (email);
create index idx_user_profiles_premium     on public.user_profiles (is_premium) where is_premium = true;
create index idx_user_profiles_active      on public.user_profiles (is_active) where is_active = false;
create index idx_user_profiles_created_at  on public.user_profiles (created_at desc);

-- Trigram indexes for partial name/email search
create index idx_user_profiles_name_trgm
  on public.user_profiles using gin (
    (coalesce(first_name, '') || ' ' || coalesce(last_name, '')) gin_trgm_ops
  );
create index idx_user_profiles_email_trgm
  on public.user_profiles using gin (email gin_trgm_ops);

-- Backfill email from auth.users for existing rows
update public.user_profiles p
set email = a.email
from auth.users a
where p.id = a.id and p.email is null;

-- Delete orphaned user_profiles with no auth.users match (can't have email)
delete from public.user_profiles
where email is null
  and not exists (select 1 from auth.users a where a.id = public.user_profiles.id);

-- After backfill + cleanup, enforce NOT NULL
alter table public.user_profiles alter column email set not null;
