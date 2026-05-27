-- Dedupe + enforce uniqueness on review_iterations (draft_id, iteration).
-- Without this, retrying a review (sync /review route then async dispatcher,
-- or two autopilot resumes) produced two rows for the same iteration number,
-- making the history picker show duplicates and the orchestrator pick the
-- wrong "best" row.

-- 1. Dedupe: keep the row with the highest (score, created_at) per pair.
DELETE FROM public.review_iterations a
USING public.review_iterations b
WHERE a.draft_id = b.draft_id
  AND a.iteration = b.iteration
  AND (
    COALESCE(a.score, -1) < COALESCE(b.score, -1)
    OR (
      COALESCE(a.score, -1) = COALESCE(b.score, -1)
      AND a.created_at < b.created_at
    )
  );

-- 2. Enforce uniqueness so future writes upsert instead of duplicating.
ALTER TABLE public.review_iterations
  ADD CONSTRAINT review_iterations_draft_iteration_key UNIQUE (draft_id, iteration);
