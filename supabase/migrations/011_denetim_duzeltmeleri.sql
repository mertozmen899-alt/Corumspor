-- =====================================================================
-- Çorum Taraftar: denetim düzeltmeleri (011) — 5 Kasım 2026 denetimi (docs/DENETIM-2026-11-05.md)
-- Sıra: 001 → 002 → 010 → 011. Tekrar çalıştırılabilir; daha önce kurulmuş bir projede de güvenle çalışır.
--
-- 1) haber-gorselleri kovası: listeleme (storage.objects select) artık yalnız yönetici.
--    Kova herkese açık (public) kaldığı için görseller https://<proje>.supabase.co/storage/v1/object/public/haber-gorselleri/...
--    adresinden yine herkese açılır (Supabase public kovada bu adres RLS'e bakmaz). Ama ziyaretçi kovadaki
--    dosyaların LİSTESİNİ alamaz: taslak (yayınlanmamış) haberin kapağı önceden bulunamaz.
--    Aynı kural reklam-gorselleri kovasında 010'da zaten var.
-- 2) TRUNCATE yetkisi: Supabase public şemadaki her tabloya anon/authenticated için TÜM yetkiyi verir.
--    TRUNCATE RLS'e takılmaz; 001 tablolarından da kaldırılır (010 reklam tablolarında zaten kaldırıyor).
-- =====================================================================

do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'storage şeması bulunamadı, depolama adımı atlandı';
    return;
  end if;

  drop policy if exists haber_gorselleri_okuma on storage.objects;            -- eski: herkes listeleyebiliyordu
  drop policy if exists haber_gorselleri_yonetici_listeler on storage.objects;
  create policy haber_gorselleri_yonetici_listeler on storage.objects for select to authenticated
    using (bucket_id = 'haber-gorselleri' and (select public.is_admin()));
end;
$$;

revoke truncate on public.profiles, public.haberler, public.maclar, public.goller, public.yorumlar
  from anon, authenticated;
