-- review_iterations.draft_json — snapshot the content_drafts.draft_json that
-- a given review pass evaluated. Without this the picker UI can show scores
-- and feedback per iteration, but the user can't recover the actual content
-- of older drafts when production was re-run between reviews and the live
-- draft_json has moved on.
--
-- Nullable so legacy rows (pre-snapshot writes) keep functioning.

ALTER TABLE review_iterations
  ADD COLUMN IF NOT EXISTS draft_json jsonb;

COMMENT ON COLUMN review_iterations.draft_json IS
  'Snapshot of content_drafts.draft_json at the moment this review iteration was scored. Lets the picker UI promote the highest-scoring (draft, review) pair when no pass clears autoApproveThreshold. Nullable for legacy rows.';

-- Drop the broken updated_at trigger inherited from migration 20260414000000.
-- It calls handle_updated_at() on a table that has no updated_at column, so any
-- UPDATE against the row (e.g. backfill, future column writes) errors with
-- "record new has no field updated_at". INSERT-only callers never hit it,
-- which is why the bug stayed dormant until snapshot backfill exercised it.
DROP TRIGGER IF EXISTS trg_review_iterations_updated_at ON review_iterations;
