-- Add sent_by column to track admin-initiated notifications.
-- sent_by references auth.users.id (same as managers.user_id).
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS sent_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_sent_by ON public.notifications(sent_by) WHERE sent_by IS NOT NULL;
