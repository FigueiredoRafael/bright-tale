-- F1-008: Credit usage tracking table
-- Records every credit debit for auditability and per-member/category reporting.

create table public.credit_usage (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  user_id     uuid not null references auth.users(id),

  action      text not null,              -- e.g. 'brainstorm', 'research', 'production', 'review', 'image_gen', 'voice_gen', 'video_gen'
  category    text not null,              -- 'text', 'voice', 'image', 'video'
  cost        integer not null,           -- credits debited
  source      text not null default 'plan', -- 'plan' or 'addon' (addon credits used first)

  metadata_json jsonb,                    -- optional context (project_id, stage_id, etc.)

  created_at  timestamptz not null default now()
);

create index idx_credit_usage_org_id on public.credit_usage(org_id);
create index idx_credit_usage_user_id on public.credit_usage(user_id);
create index idx_credit_usage_org_created on public.credit_usage(org_id, created_at desc);
create index idx_credit_usage_org_category on public.credit_usage(org_id, category);

alter table public.credit_usage enable row level security;
