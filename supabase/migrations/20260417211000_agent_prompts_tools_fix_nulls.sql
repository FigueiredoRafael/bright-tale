-- Coerce any NULLs inserted by refresh_agent_prompts seed to empty array.
-- NOT NULL is enforced on remote by 20260430100000; locally we keep it nullable
-- because seed.sql also inserts explicit NULLs for tools_json.
UPDATE agent_prompts SET tools_json = '[]'::jsonb WHERE tools_json IS NULL;
ALTER TABLE agent_prompts ALTER COLUMN tools_json SET DEFAULT '[]'::jsonb;
