-- Add missing columns to support_threads and enable Realtime.

ALTER TABLE public.support_threads
  ADD COLUMN IF NOT EXISTS escalation_summary text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE TRIGGER handle_support_threads_updated_at
  BEFORE UPDATE ON public.support_threads
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

-- Enable Realtime so users can subscribe to their own messages.
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_threads;

-- Required so Realtime can deliver full row data for column filtering.
ALTER TABLE public.support_messages REPLICA IDENTITY FULL;
ALTER TABLE public.support_threads REPLICA IDENTITY FULL;
