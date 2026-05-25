-- M-009 — Post-sale lifecycle events + health score.

CREATE TABLE IF NOT EXISTS public.user_lifecycle_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
    -- 'welcome_email_sent' | 'wizard_completed' | 'check_in_7d_sent' |
    -- 'churn_warning_sent' | 'nps_sent' | 'nps_responded' |
    -- 'plan_anniversary_1m' | 'plan_anniversary_6m' | 'plan_anniversary_1y'
  fired_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb
);

CREATE INDEX IF NOT EXISTS idx_user_lifecycle_events_user_id
  ON public.user_lifecycle_events (user_id, fired_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_lifecycle_events_event_type
  ON public.user_lifecycle_events (event_type, fired_at DESC);

ALTER TABLE public.user_lifecycle_events ENABLE ROW LEVEL SECURITY;
-- service_role only — admin views via API.

CREATE TABLE IF NOT EXISTS public.user_health_score (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  score integer NOT NULL DEFAULT 0,                  -- 0-100
  factors jsonb,                                      -- breakdown: engagement / nps / tickets
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_health_score_score
  ON public.user_health_score (score);

ALTER TABLE public.user_health_score ENABLE ROW LEVEL SECURITY;
-- service_role + admin reads.
GRANT SELECT ON public.user_health_score TO authenticated;
DROP POLICY IF EXISTS "health_score_managers_only" ON public.user_health_score;
CREATE POLICY "health_score_managers_only"
  ON public.user_health_score FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.managers
    WHERE user_id = auth.uid() AND is_active = true
  ));

CREATE TABLE IF NOT EXISTS public.user_profile_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  preferred_stack text,                              -- e.g. 'youtube_dark_channel'
  preferred_channel text,
  preferred_style text,
  preferred_tone text,
  onboarding_completed_at timestamptz
);

ALTER TABLE public.user_profile_preferences ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.user_profile_preferences TO authenticated;
DROP POLICY IF EXISTS "profile_prefs_own" ON public.user_profile_preferences;
CREATE POLICY "profile_prefs_own"
  ON public.user_profile_preferences FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
