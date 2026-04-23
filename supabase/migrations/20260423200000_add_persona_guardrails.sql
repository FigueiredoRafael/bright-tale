-- supabase/migrations/20260423200000_add_persona_guardrails.sql

CREATE TABLE persona_guardrails (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  category    text    NOT NULL CHECK (category IN (
                'content_boundaries',
                'tone_constraints',
                'factual_rules',
                'behavioral_rules'
              )),
  label       text    NOT NULL,
  rule_text   text    NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE persona_guardrails ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON persona_guardrails
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

CREATE INDEX idx_persona_guardrails_active_order
  ON persona_guardrails (is_active, sort_order)
  WHERE is_active = true;
