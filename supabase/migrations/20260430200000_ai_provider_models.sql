-- Add models_json to ai_provider_configs so each provider carries its own
-- list of available model names. Used by the admin CRUD page and read by
-- the agent editor and autopilot wizard instead of hardcoded lists.
ALTER TABLE public.ai_provider_configs
  ADD COLUMN IF NOT EXISTS models_json jsonb NOT NULL DEFAULT '[]';

-- Enforce one row per provider so the seed can use ON CONFLICT (provider).
ALTER TABLE public.ai_provider_configs
  DROP CONSTRAINT IF EXISTS ai_provider_configs_provider_unique;
ALTER TABLE public.ai_provider_configs
  ADD CONSTRAINT ai_provider_configs_provider_unique UNIQUE (provider);
