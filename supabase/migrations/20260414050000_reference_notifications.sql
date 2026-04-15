-- F5-005: Reference notifications
-- Weekly cron detects trending videos from references → creates notifications

CREATE TABLE reference_notifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  channel_id    uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  reference_id  uuid NOT NULL REFERENCES channel_references(id) ON DELETE CASCADE,
  content_id    uuid REFERENCES reference_content(id) ON DELETE SET NULL,
  type          text NOT NULL DEFAULT 'trending_video',
  title         text NOT NULL,
  body          text,
  metadata_json jsonb DEFAULT '{}',
  read_at       timestamptz,
  dismissed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ref_notif_channel ON reference_notifications(channel_id, created_at DESC);
CREATE INDEX idx_ref_notif_org ON reference_notifications(org_id, read_at);

ALTER TABLE reference_notifications ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON reference_notifications
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at);
