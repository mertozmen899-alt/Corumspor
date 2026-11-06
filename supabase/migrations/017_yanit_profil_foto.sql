-- =====================================================================
-- Çorum Taraftar: yorumlara yanıt ve profil fotoğrafı (017)
-- Sıra: 001 → … → 016 → 017. Tekrar çalıştırılabilir (if not exists / create or replace / drop if exists).
-- 014/015'in "sürüm" işaretli yorum ve profil fonksiyonlarına DOKUNMAZ: yeni kurallar ayrı tetikleyicilerde.
--
--  1) yorumlar.ust_yorum_id   tek seviyeli yanıt: yanıtın yanıtı ana yoruma bağlanır; hedef (haber/maç/gol) ana yorumdan
--                             kopyalanır; yanıt verilen yorum yanıt verenin GÖREBİLDİĞİ bir yorum olmalı (RLS);
--                             ana yorum silinince yanıtları da silinir. Sonradan başka yoruma taşınamaz.
--  2) profiles.foto_url       profil fotoğrafı: YALNIZ projenin profil-fotograflari kovasında, kişinin kendi klasöründe
--                             (<kullanıcı id>/…). Herkes okur (yorumlarda görünür). Kişi kendisi koyar/kaldırır (e-posta onaylı,
--                             yasaklı değil); yönetici başkasının fotoğrafını yalnız KALDIRABİLİR (uygunsuz fotoğraf).
--  3) profil-fotograflari     herkese açık kova (300 KB, webp/jpeg/png); yükleme/değiştirme/silme yalnız kendi klasörüne,
--                             yönetici her dosyayı silebilir; listeleme yalnız kendi klasörü ve yönetici.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Yanıt
-- ---------------------------------------------------------------------
alter table public.yorumlar add column if not exists ust_yorum_id uuid references public.yorumlar (id) on delete cascade;
create index if not exists yorumlar_ust on public.yorumlar (ust_yorum_id, created_at) where ust_yorum_id is not null;
comment on column public.yorumlar.ust_yorum_id is 'Yanıt verilen ana yorum (tek seviye). Hedef (haber/maç/gol) ana yorumdan kopyalanır.';

-- Çağıranın yetkisiyle çalışır: ana yorum yorumlar RLS'inden geçmeli (gizli / onay bekleyen başkasının yorumuna yanıt yok)
create or replace function public.yorum_yanit_kontrol()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_ust uuid;
  v_haber uuid;
  v_mac uuid;
  v_gol uuid;
begin
  if tg_op = 'UPDATE' then
    if new.ust_yorum_id is distinct from old.ust_yorum_id and current_user in ('anon', 'authenticated') then
      raise exception 'Yanıtın bağlı olduğu yorum değiştirilemez.' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.ust_yorum_id is null then
    return new;
  end if;
  select y.ust_yorum_id, y.haber_id, y.mac_id, y.gol_id into v_ust, v_haber, v_mac, v_gol
    from public.yorumlar y where y.id = new.ust_yorum_id;
  if not found then
    raise exception 'Yanıt verdiğin yorum bulunamadı (silinmiş ya da gizlenmiş olabilir).' using errcode = '22023', hint = 'ust_yorum';
  end if;
  if v_ust is not null then
    new.ust_yorum_id := v_ust; -- yanıtın yanıtı: ana yoruma bağlanır (tek seviye)
  end if;
  new.haber_id := v_haber;
  new.mac_id := v_mac;
  new.gol_id := v_gol;
  return new;
end;
$$;
drop trigger if exists yorum_yanit_kontrol on public.yorumlar;
create trigger yorum_yanit_kontrol before insert or update on public.yorumlar
  for each row execute function public.yorum_yanit_kontrol();

-- ---------------------------------------------------------------------
-- 2) Profil fotoğrafı
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists foto_url text;
comment on column public.profiles.foto_url is 'Profil fotoğrafı: yalnız profil-fotograflari kovasında kişinin kendi klasörü. Herkes okur (yorumlarda).';

-- assets/kurallar.js profilFotoGecerli ile AYNI kural
create or replace function public.profil_foto_gecerli(p_url text, p_id uuid)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_url is null or (
    p_id is not null and length(p_url) <= 500 and strpos(p_url, '..') = 0 and p_url !~ '[\x01-\x20\x7f-\x9f]'
    and p_url ~* ('^https://[a-z0-9][a-z0-9-]{0,62}\.supabase\.co/storage/v1/object/public/profil-fotograflari/'
                  || p_id::text || '/[A-Za-z0-9_-]+\.(webp|jpe?g|png)$'))
$$;

alter table public.profiles drop constraint if exists profiles_foto;
alter table public.profiles add constraint profiles_foto check (public.profil_foto_gecerli(foto_url, id));

-- Kişi kendi fotoğrafını koyar (onaylı e-posta, yasaklı değil); yönetici başkasınınkini yalnız kaldırır
create or replace function public.profil_foto_kontrol()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') and new.foto_url is distinct from old.foto_url and new.foto_url is not null then
    if new.id is distinct from auth.uid() then
      raise exception 'Başkasının profil fotoğrafını değiştiremezsin (yönetici yalnız kaldırabilir).' using errcode = '42501';
    end if;
    if not public.eposta_onayli() then
      raise exception 'Profil fotoğrafı için e-posta adresini onayla.' using errcode = '42501', hint = 'eposta_onayi';
    end if;
    if public.engelli_mi() then
      raise exception 'Hesabın topluluk kuralları nedeniyle kapatıldı; profil fotoğrafı ekleyemezsin.' using errcode = '42501', hint = 'engelli';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists profil_foto_kontrol on public.profiles;
create trigger profil_foto_kontrol before update on public.profiles
  for each row execute function public.profil_foto_kontrol();

-- Sütun yetkisi (012'den beri profiles sütun sütun açılır): foto_url herkese okunur
grant select (foto_url) on public.profiles to anon, authenticated;

-- ---------------------------------------------------------------------
-- 3) Depo: profil-fotograflari
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'storage şeması yok, profil-fotograflari deposu atlandı';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('profil-fotograflari', 'profil-fotograflari', true, 307200, array['image/webp', 'image/jpeg', 'image/png'])
  on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
                                 allowed_mime_types = excluded.allowed_mime_types;
  drop policy if exists "profil fotografi listeleme" on storage.objects;
  drop policy if exists "profil fotografi yukleme" on storage.objects;
  drop policy if exists "profil fotografi guncelleme" on storage.objects;
  drop policy if exists "profil fotografi silme" on storage.objects;
  create policy "profil fotografi listeleme" on storage.objects for select to authenticated
    using (bucket_id = 'profil-fotograflari' and (split_part(name, '/', 1) = (select auth.uid())::text or (select public.is_admin())));
  create policy "profil fotografi yukleme" on storage.objects for insert to authenticated
    with check (bucket_id = 'profil-fotograflari' and split_part(name, '/', 1) = (select auth.uid())::text
                and (select public.eposta_onayli()) and not (select public.engelli_mi()));
  create policy "profil fotografi guncelleme" on storage.objects for update to authenticated
    using (bucket_id = 'profil-fotograflari' and split_part(name, '/', 1) = (select auth.uid())::text)
    with check (bucket_id = 'profil-fotograflari' and split_part(name, '/', 1) = (select auth.uid())::text
                and (select public.eposta_onayli()) and not (select public.engelli_mi()));
  create policy "profil fotografi silme" on storage.objects for delete to authenticated
    using (bucket_id = 'profil-fotograflari' and (split_part(name, '/', 1) = (select auth.uid())::text or (select public.is_admin())));
end $$;
