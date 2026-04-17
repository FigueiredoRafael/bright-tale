-- affiliate@0.2.0 — Migration 005: Optional Supabase FKs (auth.users)
-- Run ONLY on Supabase. Safe to skip elsewhere.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'affiliates_user_id_fkey' AND table_name = 'affiliates'
  ) THEN
    ALTER TABLE public.affiliates ADD CONSTRAINT affiliates_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'affiliate_referrals_user_id_fkey' AND table_name = 'affiliate_referrals'
  ) THEN
    ALTER TABLE public.affiliate_referrals ADD CONSTRAINT affiliate_referrals_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE public.affiliates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_pix_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_content_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_contract_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_fraud_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_risk_scores ENABLE ROW LEVEL SECURITY;

-- Service role bypass policies (API server uses service_role key — full access)
DO $$ BEGIN
  CREATE POLICY "service_role_all" ON public.affiliates
    TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "service_role_all" ON public.affiliate_clicks
    TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "service_role_all" ON public.affiliate_referrals
    TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "service_role_all" ON public.affiliate_commissions
    TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "service_role_all" ON public.affiliate_payouts
    TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "service_role_all" ON public.affiliate_pix_keys
    TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "service_role_all" ON public.affiliate_content_submissions
    TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "service_role_all" ON public.affiliate_contract_history
    TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "service_role_all" ON public.affiliate_fraud_flags
    TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "service_role_all" ON public.affiliate_risk_scores
    TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
