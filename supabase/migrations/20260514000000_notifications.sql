-- M-005: User-scoped notifications table for billing events and system alerts.
CREATE TABLE notifications (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type          TEXT        NOT NULL DEFAULT 'info',
  title         TEXT        NOT NULL,
  body          TEXT,
  action_url    TEXT,
  is_read       BOOLEAN     NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX notifications_user_id_created_at_idx ON notifications(user_id, created_at DESC);
CREATE INDEX notifications_user_id_is_read_idx ON notifications(user_id, is_read);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON notifications
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
