-- M-005: Add updated_at to notifications + idempotent guards.
-- The notifications table itself was created in 20260501110000_notifications.sql.
-- This migration only adds what was missing: updated_at column and its trigger.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE OR REPLACE TRIGGER handle_updated_at
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

CREATE INDEX IF NOT EXISTS notifications_user_id_created_at_idx
  ON public.notifications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_user_id_is_read_idx
  ON public.notifications(user_id, is_read);
