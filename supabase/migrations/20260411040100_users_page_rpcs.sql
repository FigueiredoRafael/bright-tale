-- RPC: users_page_kpis — aggregate counts for KPI cards
create or replace function public.users_page_kpis()
returns json language sql stable security definer
set search_path = '' as $$
  with effective as (
    select *,
      case when is_premium and (premium_expires_at is null or premium_expires_at >= now())
           then true else false end as ipe
    from public.user_profiles
  )
  select json_build_object(
    'total_users',    count(*),
    'active_users',   count(*) filter (where is_active),
    'inactive_users', count(*) filter (where not is_active),
    'premium_count',  count(*) filter (where ipe and is_active),
    'admin_count',    (select count(*) from public.user_roles where role = 'admin'),
    'free_count',     count(*) filter (where not ipe and is_active),
    'new_today',      count(*) filter (where created_at >= current_date),
    'new_this_week',  count(*) filter (where created_at >= date_trunc('week', current_date)),
    'new_this_month', count(*) filter (where created_at >= date_trunc('month', current_date))
  ) from effective;
$$;

-- RPC: users_page_growth — daily signup counts in a date range
create or replace function public.users_page_growth(p_from timestamptz, p_to timestamptz)
returns json language sql stable security definer
set search_path = '' as $$
  select coalesce(json_agg(row_to_json(t) order by t.date), '[]'::json)
  from (
    select
      d::date as date,
      count(up.id) filter (where up.id is not null) as signups,
      count(up.id) filter (where up.is_premium and up.premium_started_at::date = d::date) as premium_signups
    from generate_series(p_from::date, p_to::date, '1 day') d
    left join public.user_profiles up on up.created_at::date = d::date
    group by d
  ) t;
$$;

-- RPC: users_page_sparklines — 30-day data arrays for sparkline charts
create or replace function public.users_page_sparklines()
returns json language sql stable security definer
set search_path = '' as $$
  with days as (
    select d::date as day
    from generate_series(current_date - 29, current_date, '1 day') d
  ),
  daily as (
    select
      d.day,
      (select count(*) from public.user_profiles where created_at::date <= d.day) as cumulative_total,
      count(up.id) filter (where up.id is not null) as signups,
      (select count(*) from public.user_profiles
       where is_premium
         and (premium_expires_at is null or premium_expires_at >= d.day + '1 day'::interval)
         and premium_started_at <= d.day + '1 day'::interval
      ) as premium_count
    from days d
    left join public.user_profiles up on up.created_at::date = d.day
    group by d.day
  )
  select json_build_object(
    'total',   (select json_agg(cumulative_total order by day) from daily),
    'premium', (select json_agg(premium_count order by day) from daily),
    'signups', (select json_agg(signups order by day) from daily)
  );
$$;
