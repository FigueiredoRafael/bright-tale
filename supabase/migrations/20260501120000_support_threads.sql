-- M-006 + M-008 — Support chatbot threads + messages + escalation queue.

CREATE TABLE IF NOT EXISTS public.support_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'open',          -- open | in_progress | waiting_user | resolved | closed
  priority text,                                -- P0 | P1 | P2 | P3 | NULL (set on escalation)
  tags text[] NOT NULL DEFAULT ARRAY[]::text[], -- e.g. ['fraud_risk','refund','cancellation']
  subject text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  escalated_at timestamptz,
  sla_due_at timestamptz,                       -- M-008: when SLA expires
  breach_at timestamptz,                        -- M-008: filled when SLA was breached
  assignee_id uuid REFERENCES auth.users(id),   -- NULL = unclaimed
  resolved_at timestamptz,
  closed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_support_threads_status_priority
  ON public.support_threads (status, priority, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_threads_user_id
  ON public.support_threads (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_threads_assignee_id
  ON public.support_threads (assignee_id) WHERE assignee_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.support_threads(id) ON DELETE CASCADE,
  role text NOT NULL,                            -- user | assistant | tool | human_agent
  content text NOT NULL,
  tool_calls jsonb,                              -- bot tool invocations
  agent_user_id uuid REFERENCES auth.users(id),  -- if role=human_agent
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_messages_thread_id
  ON public.support_messages (thread_id, created_at);

-- RLS: user sees own threads; managers see all (subject to managers RLS).
ALTER TABLE public.support_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.support_threads TO authenticated;
GRANT SELECT, INSERT ON public.support_messages TO authenticated;

DROP POLICY IF EXISTS "support_threads_user_own" ON public.support_threads;
CREATE POLICY "support_threads_user_own"
  ON public.support_threads FOR SELECT
  USING (auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM public.managers
    WHERE user_id = auth.uid() AND is_active = true
      AND role IN ('owner','admin','support')
  ));

DROP POLICY IF EXISTS "support_threads_user_insert" ON public.support_threads;
CREATE POLICY "support_threads_user_insert"
  ON public.support_threads FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "support_messages_thread_member" ON public.support_messages;
CREATE POLICY "support_messages_thread_member"
  ON public.support_messages FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.support_threads t
    WHERE t.id = thread_id AND (
      t.user_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.managers
        WHERE user_id = auth.uid() AND is_active = true
          AND role IN ('owner','admin','support')
      )
    )
  ));

DROP POLICY IF EXISTS "support_messages_thread_insert" ON public.support_messages;
CREATE POLICY "support_messages_thread_insert"
  ON public.support_messages FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.support_threads t
    WHERE t.id = thread_id AND t.user_id = auth.uid()
  ));

-- M-008: SLA defaults configurable via key-value table.
CREATE TABLE IF NOT EXISTS public.support_config (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.support_config (key, value) VALUES
  ('sla_p0_minutes', '15'::jsonb),
  ('sla_p1_hours', '2'::jsonb),
  ('sla_p2_hours', '8'::jsonb),
  ('sla_p3_hours', '24'::jsonb),
  ('reopen_window_days', '14'::jsonb),
  ('bot_max_attempts_before_escalate', '7'::jsonb)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.support_config ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.support_config TO authenticated;
DROP POLICY IF EXISTS "support_config_read_all" ON public.support_config;
CREATE POLICY "support_config_read_all" ON public.support_config FOR SELECT USING (true);
