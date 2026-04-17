-- scripts/rehearsal-audit-legacy-cutover.sql
-- Run between supabase/migrations/20260417000007 and …000008 during prod rehearsal.
-- Each query's output should be explainable by an E# edge case from spec §8.
-- See docs/superpowers/specs/2026-04-17-affiliate-2d-legacy-cutover-design.md §7.2D.R.

-- 1. Counts (high-level reconciliation)
SELECT 'affiliate_programs' AS src, COUNT(*) FROM public.affiliate_programs
UNION ALL SELECT 'affiliates (migrated)', COUNT(*) FROM public.affiliates
  WHERE affiliate_type = 'internal' AND tier = 'nano' AND status = 'active' AND total_clicks = 0
UNION ALL SELECT 'affiliate_referrals_legacy', COUNT(*) FROM public.affiliate_referrals_legacy
UNION ALL SELECT 'affiliate_referrals (all)', COUNT(*) FROM public.affiliate_referrals
UNION ALL SELECT 'affiliate_commissions (all)', COUNT(*) FROM public.affiliate_commissions;

-- 1b. Pre-migration assertion — catch any NULL first_touch_at (E14)
SELECT 'E14 null first_touch_at' AS check, COUNT(*)
FROM public.affiliate_referrals_legacy WHERE first_touch_at IS NULL;

-- 2. Skipped affiliate_programs (E1 code-collision / E4 user-already-affiliated)
SELECT ap.id, ap.user_id, ap.code, 'skipped' AS reason
FROM public.affiliate_programs ap
WHERE NOT EXISTS (SELECT 1 FROM public.affiliates a WHERE a.user_id = ap.user_id AND a.code = ap.code);

-- 3. Dropped referrals (E3 dedupe / E7 zero-member-org)
SELECT arl.id, arl.affiliate_program_id, arl.referred_org_id,
       (SELECT user_id FROM public.org_memberships
         WHERE org_id = arl.referred_org_id
         ORDER BY created_at ASC LIMIT 1) AS resolved_user
FROM public.affiliate_referrals_legacy arl
WHERE NOT EXISTS (
    SELECT 1 FROM public.affiliate_referrals ar
    WHERE ar.user_id = (SELECT user_id FROM public.org_memberships
                          WHERE org_id = arl.referred_org_id
                          ORDER BY created_at ASC LIMIT 1)
);

-- 4. Commission-amount sanity check (R13) — legacy commission_cents vs derived
SELECT arl.id,
       arl.commission_cents AS legacy,
       ROUND(arl.subscription_amount_cents * (ap.commission_pct / 100.0))::INT AS derived,
       arl.commission_cents - ROUND(arl.subscription_amount_cents * (ap.commission_pct / 100.0))::INT AS diff
FROM public.affiliate_referrals_legacy arl
JOIN public.affiliate_programs ap ON ap.id = arl.affiliate_program_id
WHERE arl.commission_cents IS NOT NULL
  AND arl.subscription_amount_cents IS NOT NULL
  AND arl.commission_cents <> ROUND(arl.subscription_amount_cents * (ap.commission_pct / 100.0))::INT;

-- 5. Placeholder name/email surface (E5)
SELECT id, code, name, email FROM public.affiliates
WHERE email LIKE '%@legacy.invalid' OR name = 'Legacy Affiliate';

-- 6. Counter rebuild sanity (E10)
SELECT a.id, a.code, a.total_earnings_brl,
       COALESCE((SELECT SUM(total_brl) FROM public.affiliate_commissions WHERE affiliate_id = a.id), 0) AS sum_from_commissions
FROM public.affiliates a
WHERE a.affiliate_type = 'internal'
  AND a.total_earnings_brl <> COALESCE((SELECT SUM(total_brl) FROM public.affiliate_commissions WHERE affiliate_id = a.id), 0);
