-- F2-036 — Progress events for async generation jobs.
-- Each row is one step transition in a job (brainstorm/research/production).
-- Streamed to the frontend via SSE so the user sees a live progress modal.

create table public.job_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  session_type text not null, -- 'brainstorm' | 'research' | 'production'
  stage text not null,        -- 'queued' | 'loading_prompt' | 'calling_provider' | 'parsing_output' | 'saving' | 'completed' | 'failed'
  message text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index job_events_session_idx on public.job_events (session_id, created_at);

alter table public.job_events enable row level security;
-- No policies → only service_role can read/write (matches project convention).
