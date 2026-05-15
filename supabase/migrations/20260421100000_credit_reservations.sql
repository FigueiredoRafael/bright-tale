-- V2-006: Credit reservations system with holds/reserves pattern
-- Adds credit_reservations table and credits_reserved column for fixing race conditions
-- in credit checking and debiting. Includes functions for holding, committing, and releasing credits.

-- ─── Add credits_reserved column to organizations ───────────────────────────────

alter table public.organizations
  add column credits_reserved integer not null default 0;

create index idx_organizations_credits_reserved on public.organizations (credits_reserved) where credits_reserved > 0;

-- ─── credit_reservations table ───────────────────────────────────────────────────

create table public.credit_reservations (
  id                uuid primary key default gen_random_uuid(),
  token             uuid unique not null default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  user_id           uuid not null references auth.users(id) on delete cascade,

  amount            bigint not null,
  actual_amount     bigint,

  status            text not null default 'held'
    check (status in ('held', 'committed', 'released', 'expired')),

  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null default (now() + interval '15 minutes'),
  committed_at      timestamptz,
  updated_at        timestamptz not null default now()
);

create index idx_credit_reservations_org_status on public.credit_reservations(org_id, status);
create index idx_credit_reservations_expires_held on public.credit_reservations(expires_at) where status = 'held';
create index idx_credit_reservations_token on public.credit_reservations(token);

create trigger handle_credit_reservations_updated_at
  before update on public.credit_reservations
  for each row execute function public.handle_updated_at();

alter table public.credit_reservations enable row level security;

-- ─── Function: expire_stale_reservations ─────────────────────────────────────────

create or replace function public.expire_stale_reservations()
returns integer
language plpgsql
security definer
as $$
declare
  v_expired_count integer := 0;
  v_reservation_id uuid;
  v_org_id uuid;
  v_amount bigint;
  v_cursor refcursor;
begin
  -- Find all stale held reservations and process them
  open v_cursor for
    select id, org_id, amount
    from public.credit_reservations
    where status = 'held' and expires_at < now()
    for update skip locked;

  loop
    fetch v_cursor into v_reservation_id, v_org_id, v_amount;
    exit when not found;

    update public.credit_reservations
    set status = 'expired'
    where id = v_reservation_id;

    update public.organizations
    set credits_reserved = greatest(0, credits_reserved - v_amount)
    where id = v_org_id;

    v_expired_count := v_expired_count + 1;
  end loop;

  close v_cursor;
  return v_expired_count;
exception when others then
  -- Log the error and return 0
  return 0;
end;
$$;

-- ─── Function: reserve_credits ──────────────────────────────────────────────────

create or replace function public.reserve_credits(
  p_org_id uuid,
  p_user_id uuid,
  p_amount bigint
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_org organizations%rowtype;
  v_available bigint;
  v_token uuid;
begin
  -- Lock the org row for update
  select * into v_org from public.organizations where id = p_org_id for update;

  if v_org is null then
    return jsonb_build_object('token', null::text, 'error_code', 'ORG_NOT_FOUND');
  end if;

  -- If org is VIP, bypass credit check
  if v_org.is_vip then
    v_token := gen_random_uuid();
    insert into public.credit_reservations (id, token, org_id, user_id, amount, status)
    values (gen_random_uuid(), v_token, p_org_id, p_user_id, p_amount, 'held');
    return jsonb_build_object('token', v_token::text, 'error_code', null);
  end if;

  -- Calculate available credits
  v_available := (v_org.credits_total - v_org.credits_used - v_org.credits_reserved) + v_org.credits_addon;

  -- Check if sufficient credits available
  if v_available < p_amount then
    return jsonb_build_object('token', null::text, 'error_code', 'INSUFFICIENT_CREDITS');
  end if;

  -- Create reservation and increment credits_reserved
  v_token := gen_random_uuid();
  insert into public.credit_reservations (id, token, org_id, user_id, amount, status)
  values (gen_random_uuid(), v_token, p_org_id, p_user_id, p_amount, 'held');

  update public.organizations
  set credits_reserved = credits_reserved + p_amount
  where id = p_org_id;

  return jsonb_build_object('token', v_token::text, 'error_code', null);
exception when others then
  return jsonb_build_object('token', null::text, 'error_code', 'INTERNAL_ERROR');
end;
$$;

-- ─── Function: commit_reservation ───────────────────────────────────────────────

create or replace function public.commit_reservation(
  p_token uuid,
  p_actual_cost bigint
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_reservation credit_reservations%rowtype;
  v_org organizations%rowtype;
  v_addon_debit bigint := 0;
  v_plan_debit bigint := 0;
  v_source text;
begin
  -- Lock the reservation for update
  select * into v_reservation
  from public.credit_reservations
  where token = p_token and status = 'held'
  for update;

  if v_reservation is null then
    return jsonb_build_object('success', false, 'error_code', 'RESERVATION_NOT_FOUND');
  end if;

  -- Lock the org for update
  select * into v_org
  from public.organizations
  where id = v_reservation.org_id
  for update;

  if v_org is null then
    return jsonb_build_object('success', false, 'error_code', 'ORG_NOT_FOUND');
  end if;

  -- Addon-first accounting: debit addon first, then plan
  if v_org.credits_addon > 0 then
    if v_org.credits_addon >= p_actual_cost then
      v_addon_debit := p_actual_cost;
      v_plan_debit := 0;
      v_source := 'addon';
    else
      v_addon_debit := v_org.credits_addon;
      v_plan_debit := p_actual_cost - v_addon_debit;
      v_source := 'mixed';
    end if;
  else
    v_plan_debit := p_actual_cost;
    v_source := 'plan';
  end if;

  -- Update organization: debit from both sources, decrement credits_reserved
  update public.organizations
  set
    credits_used = credits_used + v_plan_debit,
    credits_addon = credits_addon - v_addon_debit,
    credits_reserved = greatest(0, credits_reserved - v_reservation.amount)
  where id = v_reservation.org_id;

  -- Update reservation: mark as committed
  update public.credit_reservations
  set
    status = 'committed',
    actual_amount = p_actual_cost,
    committed_at = now()
  where token = p_token;

  -- Insert credit usage record
  insert into public.credit_usage (org_id, user_id, action, category, cost, source)
  values (v_reservation.org_id, v_reservation.user_id, 'content_generation', 'text', p_actual_cost, v_source);

  return jsonb_build_object('success', true, 'source', v_source);
exception when others then
  return jsonb_build_object('success', false, 'error_code', 'INTERNAL_ERROR');
end;
$$;

-- ─── Function: release_reservation ──────────────────────────────────────────────

create or replace function public.release_reservation(p_token uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_reservation credit_reservations%rowtype;
begin
  -- Lock the reservation for update
  select * into v_reservation
  from public.credit_reservations
  where token = p_token and status = 'held'
  for update;

  if v_reservation is null then
    return jsonb_build_object('success', false, 'error_code', 'RESERVATION_NOT_FOUND');
  end if;

  -- Update reservation status to released
  update public.credit_reservations
  set status = 'released'
  where token = p_token;

  -- Decrement credits_reserved on the org
  update public.organizations
  set credits_reserved = greatest(0, credits_reserved - v_reservation.amount)
  where id = v_reservation.org_id;

  return jsonb_build_object('success', true);
exception when others then
  return jsonb_build_object('success', false, 'error_code', 'INTERNAL_ERROR');
end;
$$;
