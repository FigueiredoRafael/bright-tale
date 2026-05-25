-- T7.1: Add per-track and per-publisher cost attribution to credit_usage.
-- Adds nullable FKs to tracks and publish_targets so downstream cards (T7.2+)
-- can associate each credit debit with the exact track/publisher involved.

alter table public.credit_usage
  add column track_id uuid references public.tracks(id) on delete set null,
  add column publish_target_id uuid references public.publish_targets(id) on delete set null;

create index idx_credit_usage_track_id on public.credit_usage(track_id);
create index idx_credit_usage_publish_target_id on public.credit_usage(publish_target_id);
