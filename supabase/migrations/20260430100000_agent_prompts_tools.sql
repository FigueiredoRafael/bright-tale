-- Add tools_json to agent_prompts so admins can enable/disable tools per agent.
-- Stored as a JSONB array of tool name strings, e.g. ["search_web"].
ALTER TABLE agent_prompts
  ADD COLUMN IF NOT EXISTS tools_json JSONB NOT NULL DEFAULT '[]'::jsonb;
