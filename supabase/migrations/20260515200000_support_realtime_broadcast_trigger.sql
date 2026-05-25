-- Switch support chat from postgres_changes (walrus-dependent, fragile) to
-- Realtime Broadcast via realtime.send(). The trigger fires after every INSERT
-- on support_messages and pushes the row to the channel that both the user
-- widget and admin drawer are already subscribed to. No walrus, no RLS check,
-- no realtime.subscription table needed.

CREATE OR REPLACE FUNCTION public.broadcast_support_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM realtime.send(
    jsonb_build_object(
      'id',         NEW.id,
      'thread_id',  NEW.thread_id,
      'role',       NEW.role,
      'content',    NEW.content,
      'created_at', NEW.created_at
    ),
    'new_message',
    'support-thread-' || NEW.thread_id::text,
    false  -- public: any subscriber on the channel receives it
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_support_message_broadcast
  AFTER INSERT ON public.support_messages
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_support_message();
