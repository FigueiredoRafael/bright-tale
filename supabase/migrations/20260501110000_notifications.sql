-- M-005 — Notification system (Supabase Realtime + email + bell).

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,                    -- 'plan_low' | 'donation_received' | 'job_done' | 'announcement' | etc.
  title text NOT NULL,
  body text,
  action_url text,                       -- click target
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  sent_via_email boolean NOT NULL DEFAULT false,
  sent_via_push boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '90 days')
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id_unread
  ON public.notifications (user_id, created_at DESC)
  WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_expires_at
  ON public.notifications (expires_at);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

GRANT SELECT, UPDATE ON public.notifications TO authenticated;

DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
CREATE POLICY "notifications_select_own"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

-- User can only update is_read / read_at on their own notifications.
DROP POLICY IF EXISTS "notifications_update_own_read" ON public.notifications;
CREATE POLICY "notifications_update_own_read"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Per-user preferences (which categories + channels they want).
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL,                -- 'plan' | 'donations' | 'jobs' | 'announcements' | etc.
  email_enabled boolean NOT NULL DEFAULT true,
  push_enabled boolean NOT NULL DEFAULT true,
  PRIMARY KEY (user_id, category)
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_preferences TO authenticated;

DROP POLICY IF EXISTS "notification_preferences_own" ON public.notification_preferences;
CREATE POLICY "notification_preferences_own"
  ON public.notification_preferences FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Cleanup cron deletes notifications past expires_at; run hourly.
COMMENT ON TABLE public.notifications IS
  'M-005: per-user notifications. Cron deletes expired rows hourly. RLS: own only.';
COMMENT ON TABLE public.notification_preferences IS
  'M-005: opt-in/out per category and channel. Mandatory categories (security, payment_failed) ignore preferences.';
