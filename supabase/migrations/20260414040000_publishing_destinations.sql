-- F5-007 — publishing_destinations: destinos externos configurados pelo user
-- (WordPress já existe via wordpress_configs, YouTube via oauth tokens,
-- custom endpoints pra webhooks genéricos).

create table public.publishing_destinations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,

  kind text not null check (kind in ('wordpress', 'youtube', 'custom_webhook')),
  label text not null,                 -- display name: "Meu blog principal"
  enabled boolean not null default true,

  -- Generic config blob (cada kind tem seu schema)
  -- wordpress: { siteUrl, username } (password criptografada noutra coluna)
  -- youtube:   { channelId, channelTitle, refresh_token_encrypted }
  -- custom_webhook: { url, secret_encrypted, events[] }
  config jsonb not null default '{}',

  -- Last publish stats (pra UI de dashboard)
  last_published_at timestamptz,
  last_error text,
  publish_count integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index publishing_dest_org_idx on public.publishing_destinations (org_id);
create index publishing_dest_kind_idx on public.publishing_destinations (org_id, kind);

create trigger trg_publishing_dest_updated_at
  before update on public.publishing_destinations
  for each row execute function public.handle_updated_at();

alter table public.publishing_destinations enable row level security;

-- F5-008 — affiliate system base tables
create table public.affiliate_programs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  code text unique not null,           -- short code: "RAFA2026"
  commission_pct numeric(5,2) not null default 20,  -- 20% default
  payout_method text,                  -- "pix" | "paypal" | "wire"
  payout_details jsonb,                -- encrypted

  total_referrals integer not null default 0,
  total_revenue_cents integer not null default 0,
  total_paid_cents integer not null default 0,

  created_at timestamptz not null default now()
);

create table public.affiliate_referrals (
  id uuid primary key default gen_random_uuid(),
  affiliate_program_id uuid not null references public.affiliate_programs(id) on delete cascade,
  referred_org_id uuid not null references public.organizations(id) on delete cascade,

  first_touch_at timestamptz not null default now(),
  conversion_at timestamptz,
  subscription_amount_cents integer,
  commission_cents integer,
  status text not null default 'pending' check (status in ('pending', 'approved', 'paid', 'refunded')),

  created_at timestamptz not null default now()
);

create index affiliate_programs_user_idx on public.affiliate_programs (user_id);
create index affiliate_referrals_program_idx on public.affiliate_referrals (affiliate_program_id);

alter table public.affiliate_programs enable row level security;
alter table public.affiliate_referrals enable row level security;
