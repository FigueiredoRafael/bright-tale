-- M-002 + M-003 — extra usage (pay-as-you-go opt-in com cap) + signup bonus.
--
-- Existing system uses organizations.credits_total/used/addon. This migration
-- adds extra-usage capacity opt-in (with hard cap) + free tier signup bonus.
--
-- Behaviour:
--   1. debitCredits prefers addon → bonus → plan → extra (if enabled, within cap)
--   2. extra_used_usd_cents accumulates and bills next invoice cycle (M-001)
--   3. extra_cap_usd_cents is the user's hard ceiling — past it: INSUFFICIENT_TOKENS

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS extra_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS extra_cap_usd_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extra_used_usd_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS signup_bonus_credits integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS signup_bonus_expires_at timestamptz;

-- Single-row "config" for pricing knobs without code change.
CREATE TABLE IF NOT EXISTS public.pricing_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  extra_block_credits integer NOT NULL DEFAULT 1000,
  extra_block_price_usd_cents integer NOT NULL DEFAULT 500,  -- $5/1000 tokens
  free_tier_monthly_credits integer NOT NULL DEFAULT 500,
  free_tier_signup_bonus_credits integer NOT NULL DEFAULT 2000,
  free_tier_bonus_validity_days integer NOT NULL DEFAULT 7,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

INSERT INTO public.pricing_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.pricing_config ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.pricing_config TO authenticated, anon;
DROP POLICY IF EXISTS "pricing_config_read_all" ON public.pricing_config;
CREATE POLICY "pricing_config_read_all" ON public.pricing_config FOR SELECT USING (true);

-- Trigger: apply free tier signup bonus on org INSERT.
CREATE OR REPLACE FUNCTION public.apply_signup_bonus()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cfg public.pricing_config;
BEGIN
  SELECT * INTO cfg FROM public.pricing_config WHERE id = true LIMIT 1;
  IF cfg IS NULL THEN RETURN NEW; END IF;

  IF NEW.credits_total = 0 OR NEW.credits_total = cfg.free_tier_monthly_credits THEN
    NEW.credits_total := cfg.free_tier_monthly_credits;
    NEW.signup_bonus_credits := cfg.free_tier_signup_bonus_credits;
    NEW.signup_bonus_expires_at := now() + (cfg.free_tier_bonus_validity_days || ' days')::interval;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS apply_signup_bonus_trigger ON public.organizations;
CREATE TRIGGER apply_signup_bonus_trigger
  BEFORE INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.apply_signup_bonus();

CREATE INDEX IF NOT EXISTS idx_organizations_signup_bonus_expires_at
  ON public.organizations (signup_bonus_expires_at)
  WHERE signup_bonus_credits > 0;

COMMENT ON COLUMN public.organizations.extra_enabled IS
  'M-002: opt-in pay-as-you-go. When true and plan exhausted, debits go to extra_used_usd_cents (until cap).';
COMMENT ON COLUMN public.organizations.signup_bonus_credits IS
  'M-003: one-time bonus tokens (option C: 500/mo + 2000 bonus week 1).';
