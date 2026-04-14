-- Pipeline review loop, entity linking, and asset role semantics.
-- Additive only — no breaking changes to existing data.

-- ─── 1. content_drafts: review fields + project link + WP tracking ──────────
ALTER TABLE public.content_drafts
  ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN wordpress_post_id integer,
  ADD COLUMN review_score integer CHECK (review_score >= 0 AND review_score <= 100),
  ADD COLUMN review_verdict text CHECK (review_verdict IN ('pending','approved','revision_required','rejected')) DEFAULT 'pending',
  ADD COLUMN iteration_count integer NOT NULL DEFAULT 0,
  ADD COLUMN approved_at timestamptz,
  ADD COLUMN production_settings_json jsonb;

CREATE INDEX idx_content_drafts_project ON public.content_drafts(project_id);
CREATE INDEX idx_content_drafts_verdict ON public.content_drafts(review_verdict);

-- ─── 2. Extend content_drafts type to include engagement ────────────────────
ALTER TABLE public.content_drafts DROP CONSTRAINT IF EXISTS content_drafts_type_check;
ALTER TABLE public.content_drafts ADD CONSTRAINT content_drafts_type_check
  CHECK (type IN ('blog', 'video', 'shorts', 'podcast', 'engagement'));

-- ─── 3. content_assets: role semantics + WebP + source tracking ─────────────
ALTER TABLE public.content_assets
  ADD COLUMN role text,
  ADD COLUMN alt_text text,
  ADD COLUMN webp_url text,
  ADD COLUMN source_type text CHECK (source_type IN ('ai_generated','manual_upload','unsplash')) DEFAULT 'ai_generated';

-- ─── 4. research_sessions: pivot tracking ───────────────────────────────────
ALTER TABLE public.research_sessions
  ADD COLUMN refined_angle_json jsonb,
  ADD COLUMN pivot_applied boolean DEFAULT false;

-- ─── 5. review_iterations: audit log for review rounds ──────────────────────
CREATE TABLE public.review_iterations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id uuid NOT NULL REFERENCES public.content_drafts(id) ON DELETE CASCADE,
  iteration integer NOT NULL,
  score integer,
  verdict text,
  feedback_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_review_iterations_draft ON public.review_iterations(draft_id);
ALTER TABLE public.review_iterations ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_review_iterations_updated_at
  BEFORE UPDATE ON public.review_iterations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
