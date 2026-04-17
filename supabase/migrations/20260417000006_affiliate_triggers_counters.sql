-- updated_at triggers (CLAUDE.md convention; package adds columns but no triggers)
-- Tables with updated_at columns: affiliates, affiliate_pix_keys,
-- affiliate_content_submissions, affiliate_risk_scores
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.affiliates
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.affiliate_pix_keys
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.affiliate_content_submissions
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.affiliate_risk_scores
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

-- Atomic counter functions (race-safe; columns verified against 001_schema.sql)
-- Column names: total_clicks, total_referrals, total_conversions, total_earnings_brl
CREATE OR REPLACE FUNCTION public.increment_affiliate_clicks(aff_id uuid)
  RETURNS void
  LANGUAGE sql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_catalog
AS $$
  UPDATE public.affiliates SET total_clicks = total_clicks + 1 WHERE id = aff_id;
$$;

CREATE OR REPLACE FUNCTION public.increment_affiliate_referrals(aff_id uuid)
  RETURNS void
  LANGUAGE sql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_catalog
AS $$
  UPDATE public.affiliates SET total_referrals = total_referrals + 1 WHERE id = aff_id;
$$;

CREATE OR REPLACE FUNCTION public.increment_affiliate_conversions(aff_id uuid, earnings_brl integer)
  RETURNS void
  LANGUAGE sql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_catalog
AS $$
  UPDATE public.affiliates
  SET total_conversions = total_conversions + 1,
      total_earnings_brl = total_earnings_brl + earnings_brl
  WHERE id = aff_id;
$$;

REVOKE ALL ON FUNCTION public.increment_affiliate_clicks(uuid)        FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_affiliate_referrals(uuid)     FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_affiliate_conversions(uuid, integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.increment_affiliate_clicks(uuid)        TO service_role;
GRANT  EXECUTE ON FUNCTION public.increment_affiliate_referrals(uuid)     TO service_role;
GRANT  EXECUTE ON FUNCTION public.increment_affiliate_conversions(uuid, integer) TO service_role;
