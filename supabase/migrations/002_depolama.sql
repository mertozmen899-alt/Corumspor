-- =====================================================================
-- Çorum Taraftar: depolama (002)
-- Haber kapak görselleri için herkese açık "haber-gorselleri" kovası.
-- Okuma herkese açık, yükleme/değiştirme/silme sadece yönetici.
-- storage şeması olmayan düz bir Postgres'te (yerel test) sessizce atlanır.
-- =====================================================================

do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'storage şeması bulunamadı, depolama adımı atlandı';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('haber-gorselleri', 'haber-gorselleri', true, 3145728,
          array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
  on conflict (id) do update
    set public = excluded.public,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                 and policyname = 'haber_gorselleri_okuma') then
    execute $p$
      create policy haber_gorselleri_okuma on storage.objects
        for select using (bucket_id = 'haber-gorselleri')
    $p$;
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                 and policyname = 'haber_gorselleri_ekleme') then
    execute $p$
      create policy haber_gorselleri_ekleme on storage.objects
        for insert to authenticated
        with check (bucket_id = 'haber-gorselleri' and (select public.is_admin()))
    $p$;
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                 and policyname = 'haber_gorselleri_guncelleme') then
    execute $p$
      create policy haber_gorselleri_guncelleme on storage.objects
        for update to authenticated
        using (bucket_id = 'haber-gorselleri' and (select public.is_admin()))
        with check (bucket_id = 'haber-gorselleri' and (select public.is_admin()))
    $p$;
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                 and policyname = 'haber_gorselleri_silme') then
    execute $p$
      create policy haber_gorselleri_silme on storage.objects
        for delete to authenticated
        using (bucket_id = 'haber-gorselleri' and (select public.is_admin()))
    $p$;
  end if;
end;
$$;
