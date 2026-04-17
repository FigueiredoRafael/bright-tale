-- Add sections_json to agent_prompts for structured prompt editing.
-- Backward compatible: NULL means the agent uses raw instructions.

ALTER TABLE public.agent_prompts
  ADD COLUMN IF NOT EXISTS sections_json JSONB DEFAULT NULL;

COMMENT ON COLUMN public.agent_prompts.sections_json IS
  'Structured prompt sections. When present, the admin editor assembles instructions from this. NULL = legacy raw instructions.';
