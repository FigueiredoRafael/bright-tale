-- M-012 — Credit donations (admin → user) with optional approval flow.

CREATE TABLE IF NOT EXISTS public.token_donations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  donor_id uuid NOT NULL REFERENCES auth.users(id),
  recipient_org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  recipient_user_id uuid REFERENCES auth.users(id),  -- optional, target a specific user in the org
  amount integer NOT NULL CHECK (amount > 0),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending_approval',   -- pending_approval | approved | denied | executed
  requested_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  denied_by uuid REFERENCES auth.users(id),
  denied_at timestamptz,
  executed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_token_donations_status
  ON public.token_donations (status, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_donations_recipient
  ON public.token_donations (recipient_org_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_donations_donor
  ON public.token_donations (donor_id, requested_at DESC);

ALTER TABLE public.token_donations ENABLE ROW LEVEL SECURITY;
-- Admin UI accesses via service_role; recipients see via /api/notifications.

CREATE TABLE IF NOT EXISTS public.donation_config (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.donation_config (key, value) VALUES
  ('auto_approve_threshold', '1000'::jsonb)  -- ≤1000 tokens auto-executes
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.donation_config ENABLE ROW LEVEL SECURITY;
-- service_role only.

COMMENT ON TABLE public.token_donations IS
  'M-012: admin-to-user token grants. Cost charged to internal BrightTale account. Above threshold requires second admin approval.';
