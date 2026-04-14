-- F2-049 — Per-call token usage events.
-- Each row = one AI call. Aggregates drive the usage dashboard + inform
-- subscription pricing decisions.

create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  channel_id uuid references public.channels(id) on delete set null,

  stage text not null,            -- 'brainstorm' | 'research' | 'production' | 'review' | 'content-core'
  sub_stage text,                 -- e.g. 'canonical-core', 'produce', null
  session_id uuid,                -- brainstorm_session / research_session / content_draft id (loose FK)
  session_type text,              -- 'brainstorm' | 'research' | 'production'

  provider text not null,         -- 'anthropic' | 'openai' | 'gemini' | 'ollama'
  model text not null,

  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd numeric(10, 6) not null default 0,

  created_at timestamptz not null default now()
);

create index usage_events_org_created_idx on public.usage_events (org_id, created_at desc);
create index usage_events_user_created_idx on public.usage_events (user_id, created_at desc);
create index usage_events_session_idx on public.usage_events (session_id);

alter table public.usage_events enable row level security;
-- Service role only (matches other analytical tables).
