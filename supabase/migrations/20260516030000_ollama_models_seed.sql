-- Seed default Ollama models (commonly pulled locally).
-- api_key and is_active are left untouched.
UPDATE public.ai_provider_configs
SET models_json = '["gemma4:e4b","llama3.1:8b","qwen2.5:7b","mistral-nemo:12b","tinyllama:latest"]'
WHERE provider = 'ollama'
  AND (models_json = '[]'::jsonb OR models_json IS NULL);
