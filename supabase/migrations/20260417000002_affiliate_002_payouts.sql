-- affiliate@0.2.0 — Migration 002: Commissions and payouts

CREATE TABLE IF NOT EXISTS public.affiliate_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID NOT NULL REFERENCES public.affiliates(id) ON DELETE RESTRICT,
  affiliate_code VARCHAR(12) NOT NULL,
  user_id UUID DEFAULT NULL,
  referral_id UUID NOT NULL REFERENCES public.affiliate_referrals(id) ON DELETE RESTRICT,
  payout_id UUID DEFAULT NULL,
  payment_amount INTEGER NOT NULL CHECK (payment_amount > 0),
  stripe_fee INTEGER NOT NULL DEFAULT 0 CHECK (stripe_fee >= 0),
  net_amount INTEGER NOT NULL CHECK (net_amount >= 0),
  commission_rate NUMERIC(5,4) NOT NULL CHECK (commission_rate > 0 AND commission_rate <= 1),
  commission_brl INTEGER NOT NULL CHECK (commission_brl >= 0),
  fixed_fee_brl INTEGER DEFAULT NULL,
  total_brl INTEGER NOT NULL CHECK (total_brl >= 0),
  payment_type TEXT NOT NULL CHECK (payment_type IN ('monthly', 'annual')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_commissions_affiliate_id ON public.affiliate_commissions (affiliate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_affiliate_commissions_status ON public.affiliate_commissions (affiliate_id, status);

CREATE TABLE IF NOT EXISTS public.affiliate_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID NOT NULL REFERENCES public.affiliates(id) ON DELETE RESTRICT,
  affiliate_code VARCHAR(12) NOT NULL,
  total_brl INTEGER NOT NULL CHECK (total_brl > 0),
  commission_ids TEXT[] NOT NULL DEFAULT '{}',
  pix_key_id UUID DEFAULT NULL,
  pix_key_value TEXT DEFAULT NULL,
  pix_key_type TEXT DEFAULT NULL
    CHECK (pix_key_type IS NULL OR pix_key_type IN ('cpf', 'cnpj', 'email', 'phone', 'random')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'processing', 'completed', 'failed')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ DEFAULT NULL,
  completed_at TIMESTAMPTZ DEFAULT NULL,
  admin_notes TEXT DEFAULT NULL,
  payment_reference TEXT DEFAULT NULL,
  tax_id TEXT DEFAULT NULL,
  tax_id_type TEXT DEFAULT NULL
    CHECK (tax_id_type IS NULL OR tax_id_type IN ('cpf', 'cnpj'))
);

CREATE INDEX IF NOT EXISTS idx_affiliate_payouts_affiliate_id ON public.affiliate_payouts (affiliate_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_affiliate_payouts_status ON public.affiliate_payouts (status) WHERE status IN ('pending', 'approved');
