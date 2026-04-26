-- M-013 — Custom plans (owner full discount, admin 30% temp).

CREATE TABLE IF NOT EXISTS public.custom_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  parent_plan_id text,                          -- Stripe price id of cloned base, or NULL if from-scratch
  monthly_tokens integer NOT NULL,
  monthly_price_usd_cents integer NOT NULL,
  billing_cycle text NOT NULL DEFAULT 'month',  -- month | year
  discount_pct numeric(5,2),                    -- for clones; NULL if from-scratch
  valid_until timestamptz,                      -- NULL = no expiry
  stripe_price_id text,                         -- created via Stripe API on first assign
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_custom_plans_active
  ON public.custom_plans (created_at DESC) WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS public.user_plan_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  custom_plan_id uuid NOT NULL REFERENCES public.custom_plans(id) ON DELETE CASCADE,
  assigned_by uuid NOT NULL REFERENCES auth.users(id),
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_plan_overrides_user_id
  ON public.user_plan_overrides (user_id, valid_from DESC);

CREATE TABLE IF NOT EXISTS public.org_plan_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  custom_plan_id uuid NOT NULL REFERENCES public.custom_plans(id) ON DELETE CASCADE,
  assigned_by uuid NOT NULL REFERENCES auth.users(id),
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_plan_overrides_org_id
  ON public.org_plan_overrides (org_id, valid_from DESC);

ALTER TABLE public.custom_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_plan_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_plan_overrides ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.custom_plans TO authenticated;
GRANT SELECT ON public.user_plan_overrides TO authenticated;
GRANT SELECT ON public.org_plan_overrides TO authenticated;

-- User can read plans they're assigned to (lookup at checkout).
DROP POLICY IF EXISTS "user_plan_overrides_own" ON public.user_plan_overrides;
CREATE POLICY "user_plan_overrides_own"
  ON public.user_plan_overrides FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "custom_plans_via_override" ON public.custom_plans;
CREATE POLICY "custom_plans_via_override"
  ON public.custom_plans FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.user_plan_overrides WHERE custom_plan_id = id AND user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.org_plan_overrides o
      JOIN public.org_memberships om ON om.org_id = o.org_id
      WHERE o.custom_plan_id = id AND om.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.managers
      WHERE user_id = auth.uid() AND is_active = true
    )
  );
