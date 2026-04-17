-- affiliate@0.2.0 — Migration 001: Core schema
-- Tables: affiliates, affiliate_clicks, affiliate_referrals
-- Idempotent: safe to run multiple times

CREATE TABLE IF NOT EXISTS public.affiliates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID DEFAULT NULL,
  code VARCHAR(12) NOT NULL UNIQUE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'active', 'paused', 'terminated', 'rejected')),
  tier TEXT NOT NULL DEFAULT 'nano'
    CHECK (tier IN ('nano', 'micro', 'mid', 'macro', 'mega')),
  commission_rate NUMERIC(5,4) NOT NULL DEFAULT 0.15
    CHECK (commission_rate > 0 AND commission_rate <= 1),
  fixed_fee_brl INTEGER DEFAULT NULL CHECK (fixed_fee_brl IS NULL OR fixed_fee_brl >= 0),
  contract_start_date DATE DEFAULT NULL,
  contract_end_date DATE DEFAULT NULL,
  contract_version INTEGER NOT NULL DEFAULT 1,
  contract_acceptance_version INTEGER DEFAULT NULL,
  contract_accepted_at TIMESTAMPTZ DEFAULT NULL,
  contract_accepted_ip TEXT DEFAULT NULL,
  contract_accepted_ua TEXT DEFAULT NULL,
  proposed_tier TEXT DEFAULT NULL
    CHECK (proposed_tier IS NULL OR proposed_tier IN ('nano', 'micro', 'mid', 'macro', 'mega')),
  proposed_commission_rate NUMERIC(5,4) DEFAULT NULL
    CHECK (proposed_commission_rate IS NULL OR (proposed_commission_rate > 0 AND proposed_commission_rate <= 1)),
  proposed_fixed_fee_brl INTEGER DEFAULT NULL,
  proposal_notes TEXT DEFAULT NULL,
  proposal_created_at TIMESTAMPTZ DEFAULT NULL,
  channel_name TEXT DEFAULT NULL,
  channel_url TEXT DEFAULT NULL,
  channel_platform TEXT DEFAULT NULL,
  social_links JSONB DEFAULT '[]',
  subscribers_count INTEGER DEFAULT NULL,
  adjusted_followers INTEGER DEFAULT NULL,
  affiliate_type VARCHAR(10) NOT NULL DEFAULT 'external'
    CHECK (affiliate_type IN ('external', 'internal')),
  known_ip_hashes TEXT[] DEFAULT '{}',
  notes TEXT DEFAULT NULL,
  tax_id TEXT DEFAULT NULL,
  total_clicks INTEGER NOT NULL DEFAULT 0,
  total_referrals INTEGER NOT NULL DEFAULT 0,
  total_conversions INTEGER NOT NULL DEFAULT 0,
  total_earnings_brl INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_affiliates_user_id ON public.affiliates (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_affiliates_code ON public.affiliates (code);
CREATE INDEX IF NOT EXISTS idx_affiliates_status ON public.affiliates (status);
CREATE INDEX IF NOT EXISTS idx_affiliates_status_created ON public.affiliates (status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.affiliate_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  affiliate_code VARCHAR(12) NOT NULL,
  ip_hash TEXT DEFAULT NULL,
  user_agent TEXT DEFAULT NULL,
  landing_url TEXT DEFAULT NULL,
  utm_source TEXT DEFAULT NULL,
  utm_medium TEXT DEFAULT NULL,
  utm_campaign TEXT DEFAULT NULL,
  source_platform VARCHAR(50) DEFAULT NULL,
  device_type VARCHAR(20) DEFAULT NULL,
  converted_at TIMESTAMPTZ DEFAULT NULL,
  converted_user_id UUID DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_affiliate_id ON public.affiliate_clicks (affiliate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_code ON public.affiliate_clicks (affiliate_code, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_created ON public.affiliate_clicks (created_at DESC);

CREATE TABLE IF NOT EXISTS public.affiliate_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID NOT NULL REFERENCES public.affiliates(id) ON DELETE RESTRICT,
  affiliate_code VARCHAR(12) NOT NULL,
  user_id UUID NOT NULL UNIQUE,
  click_id UUID REFERENCES public.affiliate_clicks(id) ON DELETE SET NULL,
  attribution_status TEXT NOT NULL DEFAULT 'active'
    CHECK (attribution_status IN ('active', 'pending_contract', 'expired', 'paused')),
  signup_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  window_end TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '12 months',
  converted_at TIMESTAMPTZ DEFAULT NULL,
  platform TEXT DEFAULT NULL
    CHECK (platform IS NULL OR platform IN ('android', 'ios', 'web')),
  signup_ip_hash TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_affiliate_id ON public.affiliate_referrals (affiliate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_user_id ON public.affiliate_referrals (user_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_attribution ON public.affiliate_referrals (attribution_status, window_end);
