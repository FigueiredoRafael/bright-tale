-- V2-006.7: Flip use_credit_reservations default to true
--
-- All background jobs now always use the reserve/commit/release lifecycle.
-- The legacy checkCredits + debitCredits path is removed from withReservation.
--
-- This migration:
--   1. Changes the column default so new rows start with the flag enabled.
--   2. Mass-flips existing rows to true (orgs that never opted out are enrolled
--      — there are no opt-outs because this is the first rollout migration).

ALTER TABLE pipeline_settings
  ALTER COLUMN use_credit_reservations SET DEFAULT true;

UPDATE public.pipeline_settings
  SET use_credit_reservations = true
  WHERE use_credit_reservations = false;

COMMENT ON COLUMN pipeline_settings.use_credit_reservations IS
  'V2-006: when true (now always true), background jobs use the credit reservation lifecycle (reserve→commit/release). The legacy debitCredits path has been deleted as of V2-006.7.';
