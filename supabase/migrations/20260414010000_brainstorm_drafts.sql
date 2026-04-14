-- F2-037 — Brainstorm draft mode.
-- Ideias recém-geradas ficam em brainstorm_drafts (staging) até o usuário
-- marcar quais quer salvar. Apenas as selecionadas vão pra idea_archives.
-- Drafts expiram após 24h — limpeza via job scheduled.

create table public.brainstorm_drafts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.brainstorm_sessions(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  channel_id uuid references public.channels(id) on delete set null,

  -- Payload da ideia (mesmo shape dos rows de idea_archives mas sem idea_id ainda)
  title text not null,
  core_tension text,
  target_audience text,
  verdict text check (verdict in ('viable', 'weak', 'experimental')),
  discovery_data text,          -- JSON stringified: angle/monetization/repurposing
  position integer not null default 0,  -- ordem original do agente

  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

create index brainstorm_drafts_session_idx on public.brainstorm_drafts (session_id);
create index brainstorm_drafts_user_expires_idx on public.brainstorm_drafts (user_id, expires_at);

alter table public.brainstorm_drafts enable row level security;
-- Service role only (matches project convention).

comment on table public.brainstorm_drafts is 'Staging table for generated ideas before the user selects which to keep. Rows move to idea_archives on save and are cleaned up after 24h otherwise.';
