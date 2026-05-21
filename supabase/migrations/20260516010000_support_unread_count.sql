-- Unread message counter for admin-side badge.
-- user_unread_count: messages from 'user' role that admin hasn't seen yet.
ALTER TABLE public.support_threads
  ADD COLUMN IF NOT EXISTS user_unread_count integer NOT NULL DEFAULT 0;

-- Trigger: increment user_unread_count whenever user sends a message.
CREATE OR REPLACE FUNCTION public.increment_user_unread_on_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.role = 'user' THEN
    UPDATE public.support_threads
      SET user_unread_count = user_unread_count + 1
    WHERE id = NEW.thread_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_support_message_increment_unread
  AFTER INSERT ON public.support_messages
  FOR EACH ROW EXECUTE FUNCTION public.increment_user_unread_on_message();
