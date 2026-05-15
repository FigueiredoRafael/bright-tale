-- V2-006.3: Add use_credit_reservations feature flag to pipeline_settings
--
-- When true, jobs use the reserve/commit/release lifecycle instead of
-- the legacy checkCredits + debitCredits path.
-- Default is false (existing behavior preserved).

ALTER TABLE pipeline_settings
  ADD COLUMN IF NOT EXISTS use_credit_reservations BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN pipeline_settings.use_credit_reservations IS
  'Feature flag: when true, background jobs use credit reservations (reserve→commit/release) instead of legacy debitCredits.';
