CREATE TABLE public.pipeline_settings (
  id                        UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  lock_key                  TEXT    UNIQUE NOT NULL DEFAULT 'global',
  review_reject_threshold   INT     NOT NULL DEFAULT 40,
  review_approve_score      INT     NOT NULL DEFAULT 90,
  review_max_iterations     INT     NOT NULL DEFAULT 5,
  default_providers_json    JSONB   NOT NULL DEFAULT '{"brainstorm":"gemini","research":"gemini","draft":"gemini","review":"gemini"}',
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.pipeline_settings
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

ALTER TABLE public.pipeline_settings ENABLE ROW LEVEL SECURITY;

INSERT INTO public.pipeline_settings (lock_key) VALUES ('global');
