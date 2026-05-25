-- Pipeline orchestration: move stage lifecycle from client xstate to server.
-- See CONTEXT.md, docs/adr/0001-0007, and PRD GitHub issue #8.
--
-- Slice 1 (issue #9): introduces stage_runs + projects.paused + job_events.project_id.
-- Note: projects.mode and projects.autopilot_config_json already exist from prior
-- autopilot work; this migration only adds what's missing. RLS policies for ownership.
-- UNIQUE partial index enforces one non-terminal Stage Run per (project, stage).

-- ─── projects: add Paused column (mode + autopilot_config_json already exist) ─

alter table projects
  add column if not exists paused boolean not null default false;

-- Backfill any NULL mode to 'autopilot' (existing column allows NULL).
update projects set mode = 'autopilot' where mode is null;

-- ─── stage_runs: the orchestration record ──────────────────────────────────

create table if not exists stage_runs (
  id               uuid primary key default gen_random_uuid(),
  project_id       text not null references projects(id) on delete cascade,
  stage            text not null check (stage in (
                       'brainstorm', 'research', 'draft', 'review',
                       'assets', 'preview', 'publish'
                     )),
  status           text not null check (status in (
                       'queued', 'running', 'awaiting_user',
                       'completed', 'failed', 'aborted', 'skipped'
                     )),
  awaiting_reason  text check (awaiting_reason in ('manual_paste', 'manual_advance')),
  payload_ref      jsonb,                -- { kind, id }
  attempt_no       integer not null default 1,
  input_json       jsonb,
  error_message    text,
  started_at       timestamptz,
  finished_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_stage_runs_project_stage on stage_runs(project_id, stage);
create index if not exists idx_stage_runs_status on stage_runs(status);
create index if not exists idx_stage_runs_project_created on stage_runs(project_id, created_at desc);

-- One non-terminal Stage Run per (project, stage). Enforces uniqueness at the
-- DB level even if the orchestrator's app-level check races.
create unique index if not exists one_non_terminal_per_stage
  on stage_runs(project_id, stage)
  where status in ('queued', 'running', 'awaiting_user');

drop trigger if exists handle_updated_at on stage_runs;
create trigger handle_updated_at before update on stage_runs
  for each row execute function moddatetime(updated_at);

alter table stage_runs enable row level security;

-- Authenticated users may SELECT their own project's stage_runs.
-- Ownership resolves via channel ownership (Wave 1 backfill rule from
-- pipeline-autopilot-wizard); falls back to research_archives ownership for
-- legacy projects with channel_id is null.
drop policy if exists "user reads own project stage_runs" on stage_runs;
create policy "user reads own project stage_runs"
  on stage_runs for select
  using (
    project_id in (
      select p.id from projects p
      where (
        p.channel_id is not null and
        p.channel_id in (select id from channels where user_id = auth.uid())
      )
      or (
        p.channel_id is null and p.research_id is not null and
        p.research_id in (select id from research_archives where user_id = auth.uid())
      )
    )
  );

-- service_role bypasses RLS by default (orchestrator + jobs).

-- ─── job_events.project_id (denormalised for Realtime filtering) ──────────

alter table job_events
  add column if not exists project_id text references projects(id) on delete cascade;

-- Backfill project_id from existing session linkage.
-- Each job_event has a session_id; figure out which session table owns it.
update job_events je
   set project_id = rs.project_id
  from research_sessions rs
 where je.session_id = rs.id
   and je.project_id is null;

update job_events je
   set project_id = bs.project_id
  from brainstorm_sessions bs
 where je.session_id = bs.id
   and je.project_id is null;

update job_events je
   set project_id = cd.project_id
  from content_drafts cd
 where je.session_id = cd.id
   and je.project_id is null;

create index if not exists idx_job_events_project_created
  on job_events(project_id, created_at desc);

-- RLS: authenticated users read their own project's events.
drop policy if exists "user reads own project job_events" on job_events;
create policy "user reads own project job_events"
  on job_events for select
  using (
    project_id in (
      select p.id from projects p
      where (
        p.channel_id is not null and
        p.channel_id in (select id from channels where user_id = auth.uid())
      )
      or (
        p.channel_id is null and p.research_id is not null and
        p.research_id in (select id from research_archives where user_id = auth.uid())
      )
    )
  );
