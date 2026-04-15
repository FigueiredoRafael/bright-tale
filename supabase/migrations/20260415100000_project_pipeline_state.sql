-- Add pipeline orchestrator state to projects table.
-- Stores PipelineState JSON: mode, currentStage, stageResults, autoConfig.

ALTER TABLE public.projects
  ADD COLUMN pipeline_state_json jsonb DEFAULT '{}';
