-- Relax the research_sessions status check to allow 'awaiting_manual',
-- used by the Manual provider rollout. The row sits in awaiting_manual while
-- the user copies the prompt from Axiom and pastes the output back via
-- POST /research/sessions/:id/manual-output.

alter table public.research_sessions
  drop constraint if exists research_sessions_status_check;

alter table public.research_sessions
  add constraint research_sessions_status_check
  check (status in ('pending', 'running', 'completed', 'reviewed', 'failed', 'awaiting_manual'));
