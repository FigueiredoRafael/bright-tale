-- M-007 — Auto-refund audit + anti-fraud config.

CREATE TABLE IF NOT EXISTS public.refund_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  payment_id text,                          -- Stripe payment_intent or charge id
  amount_usd_cents integer NOT NULL,
  decision text NOT NULL,                   -- approved | denied | pending_review
  rule_matched text,                        -- which rule triggered (e.g. 'within_7d_no_use')
  used_pct numeric(5,2),                    -- % of plan tokens consumed at refund time
  fraud_score integer NOT NULL DEFAULT 0,   -- 0-100; higher = riskier
  fraud_signals jsonb,                      -- which traps fired
  ip text,
  payment_fingerprint text,                 -- Stripe payment_method.fingerprint for trap matching
  device_fingerprint text,                  -- optional, requires anti-fraud lib
  decided_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid REFERENCES auth.users(id) -- NULL = auto
);

CREATE INDEX IF NOT EXISTS idx_refund_audit_user_id
  ON public.refund_audit (user_id, decided_at DESC);
CREATE INDEX IF NOT EXISTS idx_refund_audit_payment_fingerprint
  ON public.refund_audit (payment_fingerprint) WHERE payment_fingerprint IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_refund_audit_ip
  ON public.refund_audit (ip, decided_at DESC) WHERE ip IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_refund_audit_fraud_score
  ON public.refund_audit (fraud_score DESC) WHERE fraud_score >= 50;

ALTER TABLE public.refund_audit ENABLE ROW LEVEL SECURITY;
-- service_role only (no GRANT to authenticated). Admin UI uses service_role via API.

-- Configurable thresholds (can tweak without code change).
CREATE TABLE IF NOT EXISTS public.refund_config (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.refund_config (key, value) VALUES
  ('window_no_use_days', '7'::jsonb),
  ('window_some_use_hours', '24'::jsonb),
  ('max_used_pct_for_24h_window', '10'::jsonb),     -- 10%
  ('auto_approve_max_amount_usd_cents', '5000'::jsonb), -- $50 cap
  ('trap_email_lifetime_max', '1'::jsonb),
  ('trap_ip_30d_max', '2'::jsonb),
  ('trap_payment_fingerprint_lifetime_max', '1'::jsonb),
  ('trap_account_age_min_hours', '24'::jsonb),
  ('trap_velocity_per_hour', '10'::jsonb)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.refund_config ENABLE ROW LEVEL SECURITY;
-- service_role only.
