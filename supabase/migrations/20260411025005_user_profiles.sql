-- Migration A: user_profiles table
-- Linked to auth.users — stores display name and avatar for each registered user.
-- handle_updated_at() already defined in 00000000000000_initial_schema.sql.

create table public.user_profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name  text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_user_profiles_updated_at
  before update on public.user_profiles
  for each row execute function public.handle_updated_at();

alter table public.user_profiles enable row level security;
