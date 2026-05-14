-- M-014 — Custom coupons (only credit_grant; Stripe coupons handle discount/trial).

CREATE TABLE IF NOT EXISTS public.custom_coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  kind text NOT NULL DEFAULT 'credit_grant',    -- only credit_grant for now
  credits_amount integer NOT NULL,
  max_uses_total integer,                        -- NULL = unlimited
  max_uses_per_user integer NOT NULL DEFAULT 1,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  allowed_plan_ids text[],                       -- if non-NULL, only redeemable on these plans
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_custom_coupons_code
  ON public.custom_coupons (code) WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS public.coupon_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES public.custom_coupons(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (coupon_id, user_id, redeemed_at)
);

CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_coupon_id
  ON public.coupon_redemptions (coupon_id, redeemed_at DESC);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_user_id
  ON public.coupon_redemptions (user_id, redeemed_at DESC);

ALTER TABLE public.custom_coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;

-- service_role only for both. Users redeem via /api/coupons/redeem (backend
-- validates limits + creates row).
