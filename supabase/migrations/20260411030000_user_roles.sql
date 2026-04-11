-- Migration: user_roles table
-- Maps auth.users to roles ('admin', 'user').
-- Admin check: SELECT role FROM user_roles WHERE user_id = $1 AND role = 'admin'

create table public.user_roles (
  id         bigserial primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('admin', 'user')),
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

alter table public.user_roles enable row level security;

-- Authenticated users can read their own role entry.
-- Only service_role writes this table (RLS deny-all for mutations).
create policy "users can read own role"
  on public.user_roles for select
  to authenticated
  using (user_id = auth.uid());
