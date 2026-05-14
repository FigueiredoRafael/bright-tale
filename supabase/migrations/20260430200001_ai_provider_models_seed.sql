-- Seed default models per provider. Safe to re-run — only updates models_json,
-- leaving api_key and is_active untouched on conflict.
INSERT INTO public.ai_provider_configs (provider, api_key, is_active, models_json)
VALUES
  ('gemini',    '__placeholder__', false, '["gemini-2.5-flash","gemini-2.5-pro","gemini-2.0-flash"]'),
  ('openai',    '__placeholder__', false, '["gpt-4o-mini","gpt-4o","o1-mini"]'),
  ('anthropic', '__placeholder__', false, '["claude-haiku-4-5-20251001","claude-sonnet-4-6","claude-opus-4-7"]'),
  ('ollama',    '__placeholder__', false, '[]'),
  ('manual',    '__manual__',      true,  '[]')
ON CONFLICT (provider) DO UPDATE
  SET models_json = EXCLUDED.models_json;
