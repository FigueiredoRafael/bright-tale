-- M-000 Foundations: currency_rates cache.
-- Source of truth: Stripe webhooks already give us USD amounts. This table
-- caches USD→{BRL,EUR,...} rates for UI presentation only. Refreshed daily
-- by a cron route (apps/api/src/routes/internal/currency-refresh.ts).

CREATE TABLE IF NOT EXISTS public.currency_rates (
  currency text PRIMARY KEY,            -- 'BRL', 'EUR', etc. ('USD' is implicit = 1.0)
  rate_to_usd numeric(12, 6) NOT NULL,  -- multiply USD amount by this to get target
  fetched_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'unknown' -- e.g. 'awesomeapi', 'manual'
);

ALTER TABLE public.currency_rates ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read (we use the rate to render prices in the UI).
GRANT SELECT ON public.currency_rates TO authenticated, anon;

CREATE POLICY "currency_rates_read_all"
  ON public.currency_rates
  FOR SELECT
  USING (true);

-- Writes are service_role only (bypasses RLS); no policy for INSERT/UPDATE.

-- Seed with sane defaults so the UI doesn't crash on a fresh DB.
-- These get overwritten on first cron run.
INSERT INTO public.currency_rates (currency, rate_to_usd, source) VALUES
  ('BRL', 5.50, 'seed'),
  ('EUR', 0.92, 'seed')
ON CONFLICT (currency) DO NOTHING;

COMMENT ON TABLE public.currency_rates IS
  'Cached FX rates USD→{currency}. Refreshed daily. UI-only.';
