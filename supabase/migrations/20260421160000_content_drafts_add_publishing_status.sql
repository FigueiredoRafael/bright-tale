-- Add 'publishing' to content_drafts status check constraint.
-- The publish flow uses 'publishing' as a transient lock status during WordPress publish.
alter table content_drafts
  drop constraint if exists content_drafts_status_check;

alter table content_drafts
  add constraint content_drafts_status_check
  check (status in ('draft', 'in_review', 'approved', 'scheduled', 'published', 'failed', 'awaiting_manual', 'publishing'));
