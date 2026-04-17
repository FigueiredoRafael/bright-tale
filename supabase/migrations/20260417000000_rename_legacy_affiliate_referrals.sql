ALTER TABLE public.affiliate_referrals RENAME TO affiliate_referrals_legacy;
COMMENT ON TABLE public.affiliate_referrals_legacy IS
  'Legacy schema renamed in Phase 2A.1; replaced by package affiliate_referrals. To drop in 2D.';
