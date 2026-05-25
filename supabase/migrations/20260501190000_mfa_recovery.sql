-- M-016 — MFA recovery codes + lost-phone unlock requests.

CREATE TABLE IF NOT EXISTS public.mfa_recovery_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,                  -- Argon2id hash of plain code
  used_at timestamptz,
  generated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mfa_recovery_codes_user_id
  ON public.mfa_recovery_codes (user_id) WHERE used_at IS NULL;

ALTER TABLE public.mfa_recovery_codes ENABLE ROW LEVEL SECURITY;
-- service_role only — verified server-side at login.

-- Lost-phone unlock workflow: admin A asks, admin B approves with their MFA.
CREATE TABLE IF NOT EXISTS public.mfa_unlock_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',   -- pending | approved | denied | executed
  reason text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  denied_by uuid REFERENCES auth.users(id),
  denied_at timestamptz,
  executed_at timestamptz                   -- when factor was unenrolled by service-role API
);

CREATE INDEX IF NOT EXISTS idx_mfa_unlock_requests_pending
  ON public.mfa_unlock_requests (status, requested_at DESC) WHERE status = 'pending';

ALTER TABLE public.mfa_unlock_requests ENABLE ROW LEVEL SECURITY;
-- Managers see all (subject to managers RLS).
GRANT SELECT, INSERT, UPDATE ON public.mfa_unlock_requests TO authenticated;

DROP POLICY IF EXISTS "mfa_unlock_managers_only" ON public.mfa_unlock_requests;
CREATE POLICY "mfa_unlock_managers_only"
  ON public.mfa_unlock_requests FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.managers
    WHERE user_id = auth.uid() AND is_active = true
      AND role IN ('owner','admin')
  ));

DROP POLICY IF EXISTS "mfa_unlock_requester_insert" ON public.mfa_unlock_requests;
CREATE POLICY "mfa_unlock_requester_insert"
  ON public.mfa_unlock_requests FOR INSERT
  WITH CHECK (auth.uid() = requester_id);

COMMENT ON TABLE public.mfa_recovery_codes IS
  'M-016: 10 one-shot codes per user, Argon2id-hashed. Used at login when phone is lost.';
COMMENT ON TABLE public.mfa_unlock_requests IS
  'M-016: requester_id asks for MFA unenroll; another admin approves with their own MFA.';
