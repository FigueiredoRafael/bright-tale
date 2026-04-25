CREATE TABLE public.credit_settings (
  id                  UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  lock_key            TEXT  UNIQUE NOT NULL DEFAULT 'global',
  cost_blog           INT   NOT NULL DEFAULT 200,
  cost_video          INT   NOT NULL DEFAULT 200,
  cost_shorts         INT   NOT NULL DEFAULT 100,
  cost_podcast        INT   NOT NULL DEFAULT 150,
  cost_canonical_core INT   NOT NULL DEFAULT 80,
  cost_review         INT   NOT NULL DEFAULT 20,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.credit_settings
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

ALTER TABLE public.credit_settings ENABLE ROW LEVEL SECURITY;

INSERT INTO public.credit_settings (lock_key) VALUES ('global');
