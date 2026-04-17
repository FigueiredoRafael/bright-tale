-- affiliate@2D — legacy data migration
-- Idempotent: safe to run multiple times. NOT-EXISTS guards on every INSERT.
-- Assumes package migrations 20260417000001..000006 have applied.
--
-- Spec: docs/superpowers/specs/2026-04-17-affiliate-2d-legacy-cutover-design.md §3
-- Rollback (DEV ONLY): Appendix A of the above spec. Prod rollback = snapshot restore.

BEGIN;

-- 1. Copy affiliate_programs → affiliates
INSERT INTO public.affiliates (
    user_id, code, name, email, status, tier, commission_rate, affiliate_type,
    total_referrals, total_clicks, total_conversions, total_earnings_brl,
    contract_version, created_at, updated_at
)
SELECT
    ap.user_id,
    ap.code,
    COALESCE(au.raw_user_meta_data->>'full_name', 'Legacy Affiliate'),
    COALESCE(au.email, ap.code || '@legacy.invalid'),
    'active',
    'nano',
    ap.commission_pct / 100.0,
    'internal',
    ap.total_referrals,
    0, 0, 0,
    1,
    ap.created_at,
    ap.created_at
FROM public.affiliate_programs ap
LEFT JOIN auth.users au ON au.id = ap.user_id
WHERE NOT EXISTS (
    SELECT 1 FROM public.affiliates a
    WHERE a.user_id = ap.user_id OR a.code = ap.code
);

-- 2. Copy affiliate_referrals_legacy → affiliate_referrals
--    Resolve referred_org_id → user via org_memberships earliest member.
--    DISTINCT ON deduplicates within the source batch first (handles E3 — same user referred
--    by two programs in source data). NOT EXISTS then skips users already in destination.
WITH resolved AS (
    SELECT DISTINCT ON (resolved_user_id)
        a.id                                                             AS affiliate_id,
        a.code                                                           AS affiliate_code,
        (SELECT user_id FROM public.org_memberships
          WHERE org_id = arl.referred_org_id
          ORDER BY created_at ASC LIMIT 1)                              AS resolved_user_id,
        CASE arl.status WHEN 'refunded' THEN 'expired' ELSE 'active' END AS attribution_status,
        arl.first_touch_at,
        arl.conversion_at,
        arl.created_at
    FROM public.affiliate_referrals_legacy arl
    JOIN public.affiliate_programs ap ON ap.id = arl.affiliate_program_id
    JOIN public.affiliates a ON a.user_id = ap.user_id AND a.code = ap.code
    WHERE (SELECT user_id FROM public.org_memberships
            WHERE org_id = arl.referred_org_id
            ORDER BY created_at ASC LIMIT 1) IS NOT NULL
    ORDER BY resolved_user_id, arl.first_touch_at ASC, arl.id ASC
)
INSERT INTO public.affiliate_referrals (
    affiliate_id, affiliate_code, user_id, click_id, attribution_status,
    signup_date, window_end, converted_at, platform, signup_ip_hash, created_at
)
SELECT
    r.affiliate_id,
    r.affiliate_code,
    r.resolved_user_id,
    NULL,
    r.attribution_status,
    r.first_touch_at,
    r.first_touch_at + INTERVAL '12 months',
    r.conversion_at,
    NULL,
    NULL,
    r.created_at
FROM resolved r
WHERE NOT EXISTS (
    SELECT 1 FROM public.affiliate_referrals ar
    WHERE ar.user_id = r.resolved_user_id
);

-- 3. Derive affiliate_commissions from approved/paid/refunded legacy referrals
INSERT INTO public.affiliate_commissions (
    affiliate_id, affiliate_code, user_id, referral_id, payout_id,
    payment_amount, stripe_fee, net_amount, commission_rate, commission_brl,
    fixed_fee_brl, total_brl, payment_type, status, created_at
)
SELECT
    ar.affiliate_id,
    ar.affiliate_code,
    ar.user_id,
    ar.id,
    NULL,
    arl.subscription_amount_cents,
    0,
    arl.subscription_amount_cents,
    a.commission_rate,
    COALESCE(arl.commission_cents, ROUND(arl.subscription_amount_cents * a.commission_rate)::INTEGER),
    NULL,
    COALESCE(arl.commission_cents, ROUND(arl.subscription_amount_cents * a.commission_rate)::INTEGER),
    'monthly',
    CASE arl.status
      WHEN 'paid'     THEN 'paid'
      WHEN 'refunded' THEN 'cancelled'
      ELSE 'pending'
    END,
    COALESCE(arl.conversion_at, arl.first_touch_at)
FROM public.affiliate_referrals_legacy arl
JOIN public.affiliate_programs ap ON ap.id = arl.affiliate_program_id
JOIN public.affiliates a   ON a.user_id = ap.user_id AND a.code = ap.code
JOIN public.affiliate_referrals ar
  ON ar.affiliate_id = a.id
 AND ar.user_id = (SELECT user_id FROM public.org_memberships
                     WHERE org_id = arl.referred_org_id
                     ORDER BY created_at ASC LIMIT 1)
WHERE arl.subscription_amount_cents IS NOT NULL
  AND arl.subscription_amount_cents > 0
  AND arl.status IN ('approved', 'paid', 'refunded')
  AND NOT EXISTS (
      SELECT 1 FROM public.affiliate_commissions ac
      WHERE ac.referral_id = ar.id
  );

-- 4. Rebuild total_earnings_brl from derived commissions
UPDATE public.affiliates a
SET total_earnings_brl = COALESCE(sums.s, 0)
FROM (
    SELECT affiliate_id, SUM(total_brl) AS s
    FROM public.affiliate_commissions
    GROUP BY affiliate_id
) sums
WHERE sums.affiliate_id = a.id;

COMMIT;
