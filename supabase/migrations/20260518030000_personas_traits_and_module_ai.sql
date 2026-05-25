-- Add traits_json to personas for radar chart visualization
ALTER TABLE public.personas
  ADD COLUMN IF NOT EXISTS traits_json jsonb NOT NULL DEFAULT '{
    "voz": 5,
    "expertise": 5,
    "autoridade": 5,
    "engajamento": 5,
    "personalidade": 5,
    "originalidade": 5
  }'::jsonb;

-- Module-level AI provider assignments
-- Maps a module slug (e.g. "persona_wizard", "onboarding_wizard") to a
-- specific provider + model, allowing admins to configure which AI handles
-- each product module independently of the global tier routing.
CREATE TABLE public.module_ai_assignments (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  module_slug text        UNIQUE NOT NULL,
  provider    text        NOT NULL,
  model       text        NOT NULL,
  org_id      uuid        REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.module_ai_assignments ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON public.module_ai_assignments
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

CREATE INDEX idx_module_ai_assignments_org ON public.module_ai_assignments(org_id);

-- Seed default module assignments (persona_wizard uses global active provider by default)
-- Admins can override via the providers settings UI.
