-- Relax the content_drafts status check to allow 'awaiting_manual' for the
-- Manual provider rollout. Draft rows enter this state during both the
-- canonical-core and typed-content manual flows, and also during manual review.

alter table public.content_drafts
  drop constraint if exists content_drafts_status_check;

alter table public.content_drafts
  add constraint content_drafts_status_check
  check (status in ('draft', 'in_review', 'approved', 'scheduled', 'published', 'failed', 'awaiting_manual'));
