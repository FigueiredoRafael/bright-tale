-- Add recommendation_json to brainstorm_sessions
-- Stores the AI's recommended idea pick + rationale from BrainstormOutput.recommendation
ALTER TABLE public.brainstorm_sessions
  ADD COLUMN recommendation_json jsonb;
