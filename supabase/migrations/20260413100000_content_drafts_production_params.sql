-- F2-047 — Per-draft production parameters (target length etc).
-- Persisted so "Refazer" can vary length without losing the prior choice.
-- Shape (loose; agent ignores keys it doesn't understand):
--   { target_word_count?: number, target_duration_minutes?: number, ... }

alter table public.content_drafts
  add column production_params jsonb;
