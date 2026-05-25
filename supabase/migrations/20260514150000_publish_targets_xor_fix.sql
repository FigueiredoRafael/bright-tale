-- Fix: publish_targets XOR between channel_id and org_id.
-- The original T1.1 migration used OR, which permits both columns being set
-- (and incidentally also permits neither, since `not null` was never enforced).
-- Replace with a named XOR check so exactly one of (channel_id, org_id) is set.

alter table public.publish_targets
  drop constraint publish_targets_check;

alter table public.publish_targets
  add constraint publish_targets_channel_xor_org
  check ((channel_id is not null) <> (org_id is not null));
