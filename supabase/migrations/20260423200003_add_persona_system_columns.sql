-- supabase/migrations/20260423200003_add_persona_system_columns.sql

ALTER TABLE personas
  ADD COLUMN archetype_slug      text   NULL,
  ADD COLUMN avatar_params_json  jsonb  NULL;
