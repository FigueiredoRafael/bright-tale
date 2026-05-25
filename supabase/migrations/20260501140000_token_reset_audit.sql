-- M-011 — Reset usage audit + delegable role permissions.

CREATE TABLE IF NOT EXISTS public.token_reset_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  target_user_id uuid REFERENCES auth.users(id),    -- NULL = whole org reset
  reset_by uuid NOT NULL REFERENCES auth.users(id),
  reset_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL,                              -- mandatory
  prev_credits_used integer NOT NULL,
  prev_credits_addon integer NOT NULL,
  bulk_filter jsonb                                  -- if part of bulk reset (org id list, plan id, etc.)
);

CREATE INDEX IF NOT EXISTS idx_token_reset_audit_target_org_id
  ON public.token_reset_audit (target_org_id, reset_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_reset_audit_reset_by
  ON public.token_reset_audit (reset_by, reset_at DESC);

ALTER TABLE public.token_reset_audit ENABLE ROW LEVEL SECURITY;
-- service_role only (admin UI accesses via API).

-- Generic role permissions table (delegable via UI).
-- Lets owner give 'support' role permission to do specific things.
CREATE TABLE IF NOT EXISTS public.role_permissions (
  role text NOT NULL,
  permission text NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  granted_by uuid REFERENCES auth.users(id),
  PRIMARY KEY (role, permission)
);

-- Defaults: owner + admin can reset; support cannot (until delegated).
INSERT INTO public.role_permissions (role, permission) VALUES
  ('owner', 'tokens.reset'),
  ('admin', 'tokens.reset'),
  ('owner', 'donations.create'),
  ('admin', 'donations.create'),
  ('owner', 'donations.approve'),
  ('admin', 'donations.approve'),
  ('owner', 'plans.create_custom'),
  ('owner', 'plans.discount_100'),
  ('admin', 'plans.discount_30')
ON CONFLICT (role, permission) DO NOTHING;

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.role_permissions TO authenticated;
DROP POLICY IF EXISTS "role_permissions_read_all" ON public.role_permissions;
CREATE POLICY "role_permissions_read_all" ON public.role_permissions FOR SELECT USING (true);

COMMENT ON TABLE public.role_permissions IS
  'M-011: capability-based access. owner can grant/revoke (e.g. tokens.reset to support).';
