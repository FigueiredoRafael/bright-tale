-- supabase/migrations/20260423200001_add_persona_archetypes.sql

CREATE TABLE persona_archetypes (
  id                      uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                    text    UNIQUE NOT NULL,
  name                    text    NOT NULL,
  description             text    NOT NULL DEFAULT '',
  icon                    text    NOT NULL DEFAULT '',
  default_fields_json     jsonb   NOT NULL DEFAULT '{}'::jsonb,
  behavioral_overlay_json jsonb   NOT NULL DEFAULT '{}'::jsonb,
  sort_order              integer NOT NULL DEFAULT 0,
  is_active               boolean NOT NULL DEFAULT true,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE persona_archetypes ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON persona_archetypes
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

CREATE INDEX idx_persona_archetypes_active_order
  ON persona_archetypes (is_active, sort_order)
  WHERE is_active = true;
