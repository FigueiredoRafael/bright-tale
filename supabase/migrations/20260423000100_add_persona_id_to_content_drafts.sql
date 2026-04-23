-- supabase/migrations/20260423000100_add_persona_id_to_content_drafts.sql
ALTER TABLE public.content_drafts
  ADD COLUMN persona_id uuid REFERENCES public.personas(id) ON DELETE SET NULL;
