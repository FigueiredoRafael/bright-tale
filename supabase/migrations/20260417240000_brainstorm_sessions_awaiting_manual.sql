-- Allow 'awaiting_manual' status on brainstorm_sessions for the Manual provider
-- (see docs/superpowers/specs/2026-04-17-manual-provider-design.md).

ALTER TABLE public.brainstorm_sessions
  DROP CONSTRAINT IF EXISTS brainstorm_sessions_status_check;

ALTER TABLE public.brainstorm_sessions
  ADD CONSTRAINT brainstorm_sessions_status_check
  CHECK (status IN ('pending', 'running', 'completed', 'failed', 'awaiting_manual'));
