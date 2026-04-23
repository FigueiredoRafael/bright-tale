-- supabase/migrations/20260423000000_add_personas.sql
CREATE TABLE public.personas (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                  text UNIQUE NOT NULL,
  name                  text NOT NULL,
  avatar_url            text,
  bio_short             text NOT NULL,
  bio_long              text NOT NULL,
  primary_domain        text NOT NULL,
  domain_lens           text NOT NULL,
  approved_categories   text[] NOT NULL,
  writing_voice_json    jsonb NOT NULL,
  eeat_signals_json     jsonb NOT NULL,
  soul_json             jsonb NOT NULL,
  wp_author_id          integer,
  is_active             boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.personas ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON public.personas
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
