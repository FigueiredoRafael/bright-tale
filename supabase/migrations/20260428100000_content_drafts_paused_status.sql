-- Add 'paused' to content_drafts.status. Wave 4 abort path writes this status
-- when an Inngest job exits early via JobAborted.
alter table content_drafts
  drop constraint if exists content_drafts_status_check;

alter table content_drafts
  add constraint content_drafts_status_check
  check (status in (
    'draft', 'in_review', 'approved', 'scheduled',
    'published', 'failed', 'awaiting_manual', 'publishing',
    'paused'
  ));
