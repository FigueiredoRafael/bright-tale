-- F3-012 — Plano VIP (invite-only). Admin-set flag, não paga via Stripe.
-- VIPs recebem créditos ilimitados lógicos (enforced no code, checkCredits
-- short-circuita quando is_vip=true).

alter table public.organizations
  add column is_vip boolean not null default false,
  add column vip_note text;  -- razão/relacionamento (optional, admin-only)

create index organizations_vip_idx on public.organizations (is_vip) where is_vip = true;

comment on column public.organizations.is_vip is 'F3-012 — invite-only VIP plan. Set by admin. Bypasses credit check.';
