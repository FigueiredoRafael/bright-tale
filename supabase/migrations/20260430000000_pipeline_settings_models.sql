-- Add default_models_json to pipeline_settings.
-- Stores { stage: model_id } admin-configured model per stage.
-- Default: empty — router.ts ROUTE_TABLE applies when unset.
ALTER TABLE pipeline_settings
  ADD COLUMN IF NOT EXISTS default_models_json JSONB NOT NULL DEFAULT '{}'::jsonb;
