-- Wave 3 of yt-pipeline-v2 (G7): link shorts_drafts back to the video draft
-- they were derived from. Nullable + ON DELETE SET NULL so legacy shorts
-- created from canonical core (without a source video) keep working, and
-- deleting the source video doesn't cascade-destroy its derivative shorts.
alter table public.shorts_drafts
  add column if not exists source_content_draft_id uuid
    references public.content_drafts(id) on delete set null;

create index if not exists idx_shorts_drafts_source_content_draft_id
  on public.shorts_drafts(source_content_draft_id);
