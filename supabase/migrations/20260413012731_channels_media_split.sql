-- Split channel_type into two dimensions:
--   media_types[]   — multi-select: which content formats this channel produces
--                     values: 'blog' | 'video' | 'shorts' | 'podcast'
--   video_style     — only relevant when 'video' is in media_types
--                     values: 'face' | 'dark' | 'hybrid'
-- channel_type stays as legacy column (read-only) for backward compat.

alter table public.channels
  add column media_types text[] not null default array['blog']::text[],
  add column video_style text;

-- Backfill from legacy channel_type
-- text   → media_types = ['blog'],              video_style = null
-- face   → media_types = ['video'],             video_style = 'face'
-- dark   → media_types = ['video'],             video_style = 'dark'
-- hybrid → media_types = ['blog', 'video'],     video_style = 'hybrid'

update public.channels set
  media_types = array['blog']::text[],
  video_style = null
where channel_type = 'text';

update public.channels set
  media_types = array['video']::text[],
  video_style = 'face'
where channel_type = 'face';

update public.channels set
  media_types = array['video']::text[],
  video_style = 'dark'
where channel_type = 'dark';

update public.channels set
  media_types = array['blog', 'video']::text[],
  video_style = 'hybrid'
where channel_type = 'hybrid';

-- Index for filtering channels by active media
create index idx_channels_media_types on public.channels using gin(media_types);
