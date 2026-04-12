-- F1-007: Supabase Storage buckets + RLS policies
-- Buckets: images, audio, video, thumbnails, exports
-- Path convention: {bucket}/{org_id}/{project_id}/{filename}

-- ─── Create buckets ─────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values
  ('images', 'images', false),
  ('audio', 'audio', false),
  ('video', 'video', false),
  ('thumbnails', 'thumbnails', true),   -- public for CDN
  ('exports', 'exports', false);

-- ─── RLS policies ───────────────────────────────────────────────────────────
-- Org members can read/write files within their org's folder.
-- Path must start with the org_id.

-- SELECT (read/download)
create policy "org_members_can_read_own_files"
  on storage.objects for select
  using (
    bucket_id in ('images', 'audio', 'video', 'thumbnails', 'exports')
    and (storage.foldername(name))[1] in (
      select org_id::text from public.org_memberships
      where user_id = auth.uid()
    )
  );

-- INSERT (upload)
create policy "org_members_can_upload_files"
  on storage.objects for insert
  with check (
    bucket_id in ('images', 'audio', 'video', 'thumbnails', 'exports')
    and (storage.foldername(name))[1] in (
      select org_id::text from public.org_memberships
      where user_id = auth.uid()
      and role in ('owner', 'admin', 'member')
    )
  );

-- UPDATE (overwrite)
create policy "org_members_can_update_files"
  on storage.objects for update
  using (
    bucket_id in ('images', 'audio', 'video', 'thumbnails', 'exports')
    and (storage.foldername(name))[1] in (
      select org_id::text from public.org_memberships
      where user_id = auth.uid()
      and role in ('owner', 'admin', 'member')
    )
  );

-- DELETE
create policy "org_admins_can_delete_files"
  on storage.objects for delete
  using (
    bucket_id in ('images', 'audio', 'video', 'thumbnails', 'exports')
    and (storage.foldername(name))[1] in (
      select org_id::text from public.org_memberships
      where user_id = auth.uid()
      and role in ('owner', 'admin')
    )
  );

-- Thumbnails bucket is public (read without auth)
create policy "public_can_read_thumbnails"
  on storage.objects for select
  using (bucket_id = 'thumbnails');
