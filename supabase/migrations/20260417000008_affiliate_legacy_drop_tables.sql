-- affiliate@2D — drop legacy tables. Destructive.
-- Apply only after rehearsal audit (scripts/rehearsal-audit-legacy-cutover.sql)
-- is clean and every non-empty row maps to a documented E# edge case.
--
-- Prod rollback = Supabase snapshot restore. Dev rollback = Appendix A of
-- docs/superpowers/specs/2026-04-17-affiliate-2d-legacy-cutover-design.md.

BEGIN;

DROP TABLE IF EXISTS public.affiliate_referrals_legacy CASCADE;
DROP TABLE IF EXISTS public.affiliate_programs        CASCADE;

COMMIT;
