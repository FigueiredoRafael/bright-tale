-- Realtime broadcast for notifications via realtime.send().
-- postgres_changes cannot be used because the table has deny-all RLS
-- (no authenticated SELECT policy). The trigger fires server-side
-- (SECURITY DEFINER) and pushes the new row to a per-user broadcast
-- channel so the Bell component receives it without polling.

CREATE OR REPLACE FUNCTION public.broadcast_notification()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM realtime.send(
    jsonb_build_object(
      'id',         NEW.id,
      'type',       NEW.type,
      'title',      NEW.title,
      'body',       NEW.body,
      'action_url', NEW.action_url,
      'is_read',    NEW.is_read,
      'created_at', NEW.created_at
    ),
    'new_notification',
    'notifications-user-' || NEW.user_id::text,
    false
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_notification_broadcast
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_notification();
