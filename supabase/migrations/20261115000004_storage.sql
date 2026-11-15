-- =============================================================================
-- Gather — Storage buckets for avatars and group photos.
-- Files live under "<owner-or-group-id>/<file>". Only the owner (or a group admin)
-- can write; images are publicly readable by URL (paths contain unguessable UUIDs).
-- Skipped automatically when the storage schema is absent (e.g. plain Postgres tests).
-- =============================================================================
do $outer$
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then
    raise notice 'storage schema not present — skipping storage setup';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
         ('group-photos', 'group-photos', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do nothing;

  execute $p$create policy "avatars: owner writes" on storage.objects for insert to authenticated
    with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  execute $p$create policy "avatars: owner updates" on storage.objects for update to authenticated
    using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  execute $p$create policy "avatars: owner deletes" on storage.objects for delete to authenticated
    using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)$p$;

  execute $p$create policy "group photos: admins write" on storage.objects for insert to authenticated
    with check (bucket_id = 'group-photos' and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_group_admin(((storage.foldername(name))[1])::uuid)))$p$;
  execute $p$create policy "group photos: admins delete" on storage.objects for delete to authenticated
    using (bucket_id = 'group-photos' and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_group_admin(((storage.foldername(name))[1])::uuid)))$p$;
end
$outer$;
