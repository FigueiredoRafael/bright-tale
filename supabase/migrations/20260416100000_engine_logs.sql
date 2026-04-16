-- Engine Logs: full-payload logging of LLM engine calls
CREATE TABLE public.engine_logs (
  id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  org_id          text,
  user_id         text NOT NULL,
  project_id      text,
  channel_id      text,
  session_id      text,
  session_type    text NOT NULL,
  stage           text NOT NULL,
  provider        text NOT NULL,
  model           text NOT NULL,
  input_json      jsonb NOT NULL,
  output_json     jsonb,
  duration_ms     integer NOT NULL DEFAULT 0,
  input_tokens    integer,
  output_tokens   integer,
  error           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.engine_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_engine_logs_created_at ON public.engine_logs (created_at DESC);
CREATE INDEX idx_engine_logs_project_id ON public.engine_logs (project_id);
CREATE INDEX idx_engine_logs_session_id ON public.engine_logs (session_id);
CREATE INDEX idx_engine_logs_stage ON public.engine_logs (stage);
CREATE INDEX idx_engine_logs_user_id ON public.engine_logs (user_id);
CREATE INDEX idx_engine_logs_channel_id ON public.engine_logs (channel_id);
