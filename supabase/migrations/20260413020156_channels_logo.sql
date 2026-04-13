-- Add logo_url to channels for visual identification between multiple channels.
-- Stored in storage.buckets.thumbnails (public CDN bucket).

alter table public.channels
  add column logo_url text;
