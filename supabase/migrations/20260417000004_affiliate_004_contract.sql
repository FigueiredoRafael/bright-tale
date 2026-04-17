-- affiliate@0.2.0 — Migration 004: Contract history, social links, fraud tables

CREATE TABLE IF NOT EXISTS public.affiliate_contract_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN (
    'approved', 'paused', 'terminated', 'contract_renewed',
    'proposal_created', 'proposal_accepted', 'proposal_rejected', 'proposal_cancelled'
  )),
  old_tier TEXT DEFAULT NULL,
  new_tier TEXT DEFAULT NULL,
  old_commission_rate NUMERIC(5,4) DEFAULT NULL,
  new_commission_rate NUMERIC(5,4) DEFAULT NULL,
  old_fixed_fee_brl   INTEGER      DEFAULT NULL,
  new_fixed_fee_brl   INTEGER      DEFAULT NULL,
  old_status TEXT DEFAULT NULL,
  new_status TEXT DEFAULT NULL,
  performed_by UUID DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  contract_version INTEGER DEFAULT NULL,
  accepted_ip TEXT DEFAULT NULL,
  accepted_ua TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contract_history_affiliate ON public.affiliate_contract_history (affiliate_id);

CREATE TABLE IF NOT EXISTS public.affiliate_fraud_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  referral_id UUID DEFAULT NULL REFERENCES public.affiliate_referrals(id) ON DELETE SET NULL,
  flag_type       TEXT         NOT NULL
    CHECK (flag_type IN ('ip_cluster', 'email_similarity', 'self_referral', 'velocity', 'device_fingerprint', 'manual', 'other')),
  severity TEXT NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  details JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'investigating', 'confirmed_fraud', 'false_positive', 'resolved')),
  admin_notes TEXT DEFAULT NULL,
  resolved_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fraud_flags_affiliate ON public.affiliate_fraud_flags (affiliate_id);
CREATE INDEX IF NOT EXISTS idx_fraud_flags_open ON public.affiliate_fraud_flags (status, created_at DESC) WHERE status IN ('open', 'investigating');

CREATE TABLE IF NOT EXISTS public.affiliate_risk_scores (
  affiliate_id UUID PRIMARY KEY REFERENCES public.affiliates(id) ON DELETE CASCADE,
  score INTEGER NOT NULL DEFAULT 0 CHECK (score >= 0 AND score <= 100),
  flag_count INTEGER NOT NULL DEFAULT 0 CHECK (flag_count >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_risk_scores_high ON public.affiliate_risk_scores (score DESC) WHERE score >= 20;
