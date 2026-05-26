-- PRD #240 Module 7: add per-iteration cost columns to review_iterations.
-- Denormalized at write time because credit_usage doesn't carry per-iteration
-- tags and retroactive join by session_id=draftId returns sum across all
-- iterations (not per-pass). Writing at upsert time is one row update vs.
-- retroactive backfill of credit_usage tagging.
--
-- produce_cost_cents: set by the producer dispatcher (pipeline-production-dispatch
--   or revision path) when it emits the draft snapshot that becomes this iteration.
-- review_cost_cents:  set by the review dispatcher at the same upsert where
--   it writes score/feedback.
-- Both nullable: legacy rows before this migration have no cost data.

ALTER TABLE review_iterations
  ADD COLUMN IF NOT EXISTS produce_cost_cents      int  null,
  ADD COLUMN IF NOT EXISTS review_cost_cents       int  null,
  ADD COLUMN IF NOT EXISTS last_revision_strategy  text null;

COMMENT ON COLUMN review_iterations.produce_cost_cents IS
  'Cost in cents of the producer LLM call that generated the draft for this iteration. Null for legacy rows.';

COMMENT ON COLUMN review_iterations.review_cost_cents IS
  'Cost in cents of the reviewer LLM call that scored this iteration. Null for legacy rows.';

COMMENT ON COLUMN review_iterations.last_revision_strategy IS
  'Short summary of what the producer attempted to fix between the prior iteration and this one. Populated from the priorAttempts array the producer received. Null when the producer had no prior context or for legacy rows.';
