-- M-015 — Finance dashboard materialized view.
--
-- Aggregates revenue (from Stripe webhooks via M-001 'payments' table — TBD)
-- vs cost of operation (from credit_usage × pricing-projections cost table)
-- per day, per plan, per country, per affiliate.
--
-- NOTE: this migration is intentionally minimal — the full MV is built once
-- M-001 lands the `payments` and `subscriptions` tables. For now we create
-- the schema scaffolding so M-015 UI can wire to it.

-- Daily aggregates per cut. Refreshed hourly.
-- Columns nullable on purpose: incremental population as M-001 ships.
CREATE TABLE IF NOT EXISTS public.finance_daily (
  date date NOT NULL,
  plan_id text,
  country text,
  affiliate_id uuid,
  revenue_usd_cents bigint NOT NULL DEFAULT 0,
  cost_usd_cents bigint NOT NULL DEFAULT 0,
  refunds_usd_cents bigint NOT NULL DEFAULT 0,
  active_users integer NOT NULL DEFAULT 0,
  new_users integer NOT NULL DEFAULT 0,
  churned_users integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (date, plan_id, country, affiliate_id)
);

CREATE INDEX IF NOT EXISTS idx_finance_daily_date
  ON public.finance_daily (date DESC);

-- Per-provider AI cost (for the pizza chart).
CREATE TABLE IF NOT EXISTS public.finance_provider_daily (
  date date NOT NULL,
  provider text NOT NULL,                       -- 'openai' | 'anthropic' | 'gemini' | 'elevenlabs' | etc.
  cost_usd_cents bigint NOT NULL DEFAULT 0,
  tokens_in bigint NOT NULL DEFAULT 0,
  tokens_out bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (date, provider)
);

CREATE INDEX IF NOT EXISTS idx_finance_provider_daily_date
  ON public.finance_provider_daily (date DESC);

ALTER TABLE public.finance_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_provider_daily ENABLE ROW LEVEL SECURITY;

-- service_role + 'billing' role + 'owner' read.
GRANT SELECT ON public.finance_daily TO authenticated;
GRANT SELECT ON public.finance_provider_daily TO authenticated;

DROP POLICY IF EXISTS "finance_daily_managers" ON public.finance_daily;
CREATE POLICY "finance_daily_managers"
  ON public.finance_daily FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.managers
    WHERE user_id = auth.uid() AND is_active = true
      AND role IN ('owner','billing')
  ));

DROP POLICY IF EXISTS "finance_provider_daily_managers" ON public.finance_provider_daily;
CREATE POLICY "finance_provider_daily_managers"
  ON public.finance_provider_daily FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.managers
    WHERE user_id = auth.uid() AND is_active = true
      AND role IN ('owner','billing')
  ));

-- Add 'billing' to managers role enum check if not already present.
-- (Existing role check constraint may need update — handled in a follow-up
-- if the enum is strict.)

COMMENT ON TABLE public.finance_daily IS
  'M-015: per-day revenue × cost × margin aggregates. Refreshed hourly by cron.';
COMMENT ON TABLE public.finance_provider_daily IS
  'M-015: AI provider cost split (pizza chart). Populated from credit_usage joined with cost catalog.';
