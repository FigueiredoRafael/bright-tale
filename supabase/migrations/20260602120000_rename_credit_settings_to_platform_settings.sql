-- D55 (BRI-26): unify pipeline business-defaults under platform_settings.
-- RENAME preserves data, the seeded singleton row, the UNIQUE(lock_key) constraint,
-- RLS, and the handle_updated_at trigger automatically.
ALTER TABLE public.credit_settings RENAME TO platform_settings;

-- §4 contract: blocks 2 (review defaults), 3 (stagnation), 4 (stage timeout).
-- Dormant until wave-1 consumers (D11/D72/D74/D58) wire them. Existing row backfilled with defaults.
ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS review_approve_score         INT NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS review_reject_threshold      INT NOT NULL DEFAULT 40,
  ADD COLUMN IF NOT EXISTS review_max_iterations        INT NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS review_stagnation_window     INT NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS review_stagnation_min_delta  INT NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS stage_finish_timeout_seconds INT NOT NULL DEFAULT 300;
