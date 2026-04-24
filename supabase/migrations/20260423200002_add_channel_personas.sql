-- supabase/migrations/20260423200002_add_channel_personas.sql

CREATE TABLE channel_personas (
  channel_id  uuid    NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  persona_id  uuid    NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
  is_primary  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_id, persona_id)
);

ALTER TABLE channel_personas ENABLE ROW LEVEL SECURITY;

-- Fast lookup: all personas for a channel
CREATE INDEX idx_channel_personas_channel
  ON channel_personas (channel_id);

-- Fast lookup: all channels a persona belongs to
CREATE INDEX idx_channel_personas_persona
  ON channel_personas (persona_id);

-- Enforce only one primary per channel at DB level
CREATE UNIQUE INDEX idx_channel_personas_one_primary
  ON channel_personas (channel_id)
  WHERE is_primary = true;
