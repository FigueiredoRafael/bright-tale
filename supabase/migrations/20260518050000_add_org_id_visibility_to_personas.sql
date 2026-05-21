-- Add org ownership and visibility to personas
-- Personas were previously unscoped (global by default).
-- Now each persona belongs to an org and has an explicit visibility.
-- See docs/adr/0001-persona-visibility-and-fork-model.md

ALTER TABLE personas
  ADD COLUMN org_id    uuid  NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ADD COLUMN visibility text NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private', 'global'));

-- Backfill: assign all existing personas to the first org alphabetically by created_at
-- (best-effort for existing data — adjust manually if needed)
UPDATE personas
SET org_id = (
  SELECT id FROM organizations ORDER BY created_at LIMIT 1
)
WHERE org_id IS NULL;

-- Now enforce NOT NULL after backfill
ALTER TABLE personas
  ALTER COLUMN org_id SET NOT NULL;

-- Fast lookup: all personas for an org
CREATE INDEX idx_personas_org_id ON personas (org_id);

-- Fast lookup: all global personas
CREATE INDEX idx_personas_visibility ON personas (visibility) WHERE visibility = 'global';
