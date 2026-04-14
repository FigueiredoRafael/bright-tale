-- Link all pipeline session tables to projects.
-- projects.id is TEXT (not uuid), matching initial_schema.

-- ─── brainstorm_sessions ────────────────────────────────────────
ALTER TABLE public.brainstorm_sessions
  ADD COLUMN project_id text REFERENCES public.projects(id) ON DELETE SET NULL;
CREATE INDEX idx_brainstorm_sessions_project ON public.brainstorm_sessions(project_id);

-- ─── research_sessions ──────────────────────────────────────────
ALTER TABLE public.research_sessions
  ADD COLUMN project_id text REFERENCES public.projects(id) ON DELETE SET NULL;
CREATE INDEX idx_research_sessions_project ON public.research_sessions(project_id);

-- ─── idea_archives ──────────────────────────────────────────────
ALTER TABLE public.idea_archives
  ADD COLUMN project_id text REFERENCES public.projects(id) ON DELETE SET NULL;
CREATE INDEX idx_idea_archives_project ON public.idea_archives(project_id);
