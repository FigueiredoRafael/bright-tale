-- Switch all agent_prompts to OpenAI / gpt-5.4-mini as the recommended provider/model.
-- Also extends ai_provider_configs.models_json so the new model id is in the allowlist
-- that ModelPicker reads from the wizard. Safe to re-run — pure UPDATEs, no inserts.

UPDATE public.ai_provider_configs
   SET models_json = '["gpt-5.4-mini","gpt-4o-mini","gpt-4o","o1-mini"]'::jsonb
 WHERE provider = 'openai';

UPDATE public.agent_prompts
   SET recommended_provider = 'openai',
       recommended_model    = 'gpt-5.4-mini',
       updated_at           = now();
