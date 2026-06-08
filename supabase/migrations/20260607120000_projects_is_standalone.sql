-- BRI-159: Add is_standalone flag to projects so ephemeral projects
-- (auto-created for standalone brainstorm/research sessions) are hidden
-- from the main project listing.
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS is_standalone boolean NOT NULL DEFAULT false;

-- Partial index to keep the "hide standalone" list filter cheap.
CREATE INDEX IF NOT EXISTS idx_projects_not_standalone
  ON public.projects (user_id) WHERE is_standalone = false;
