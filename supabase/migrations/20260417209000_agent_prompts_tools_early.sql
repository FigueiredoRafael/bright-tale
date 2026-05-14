-- Adds tools_json before refresh_agent_prompts seed runs locally.
-- Added nullable here because the seed inserts explicit NULLs for some rows;
-- 20260417211000 coerces those NULLs to '[]' afterward.
ALTER TABLE agent_prompts
  ADD COLUMN IF NOT EXISTS tools_json JSONB DEFAULT '[]'::jsonb;
