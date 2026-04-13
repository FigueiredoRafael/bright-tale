-- Scope ideas to channels so Create Content can show channel-specific ideas.
-- Nullable: legacy ideas predate channels.

alter table public.idea_archives
  add column channel_id uuid references public.channels(id) on delete set null;

create index idx_idea_archives_channel_id on public.idea_archives(channel_id);
