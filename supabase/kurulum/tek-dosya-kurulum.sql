-- Çorumspor Taraftar: TEK DOSYA KURULUM (yeni, boş Supabase projesi için)
-- Supabase → SQL Editor → New query → bu dosyanın TAMAMINI yapıştırın → Run.
-- İçerik: supabase/migrations/001…015 sırayla (araclar/kurulum-dosyasi-olustur.sh ile üretilir; elle düzenlemeyin).
-- Zaten kurulu bir veritabanında migration'ları README 2. bölümdeki gibi tek tek çalıştırın.

-- Gece bakımı için pg_cron (014 her gece 00:17 TSİ işini kurar). Açılamazsa kurulum yine sürer; Database → Extensions'tan açın.
do $$ begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'pg_cron açılamadı (%): Database → Extensions → pg_cron, sonra 014 ve 015''i yeniden çalıştırın.', sqlerrm;
end $$;


-- ===================== 001_temel_sema.sql =====================
-- =====================================================================
-- Çorum Taraftar: temel şema (001)
-- Tablolar: profiles, haberler, maclar, goller, yorumlar
-- Her tabloda RLS açık. Yönetici kontrolü tek yerde: public.is_admin().
-- Supabase SQL Editor'de olduğu gibi çalıştırılabilir (tek sefer).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Ortak yardımcı: updated_at alanını güncelle
-- ---------------------------------------------------------------------
create or replace function public.guncellendi()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- profiles: her auth.users kaydı için bir profil (tetikleyiciyle açılır)
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  kullanici_adi text not null unique
    check (kullanici_adi ~ '^[A-Za-z0-9_.çğıöşüÇĞİÖŞÜ]{3,30}$'),
  role text not null default 'taraftar'
    check (role in ('taraftar', 'admin')),
  created_at timestamptz not null default now()
);

comment on table public.profiles is 'Kullanıcı profilleri. role=admin yönetici demektir (reklam modülü de buna dayanır).';

create unique index profiles_kullanici_adi_kucuk on public.profiles (lower(kullanici_adi));

-- Tek yönetici kontrolü. Bütün yönetici politikaları bunu kullanır.
-- SECURITY DEFINER: profiles RLS'ine takılmadan rolü okur.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

comment on function public.is_admin() is 'Oturumdaki kullanıcı yönetici mi (profiles.role = admin).';

-- Yeni kayıt olan kullanıcıya profil aç. Rol HER ZAMAN taraftar başlar;
-- kullanıcının gönderdiği metadata içindeki rol bilgisi yok sayılır.
create or replace function public.yeni_kullanici()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  temel text;
  aday text;
  sira int := 0;
begin
  temel := coalesce(btrim(new.raw_user_meta_data ->> 'kullanici_adi'), '');
  temel := regexp_replace(temel, '[^A-Za-z0-9_.çğıöşüÇĞİÖŞÜ]', '', 'g');
  temel := left(temel, 24);
  if char_length(temel) < 3 then
    temel := 'taraftar' || left(replace(new.id::text, '-', ''), 6);
  end if;
  aday := temel;
  while exists (select 1 from public.profiles where lower(kullanici_adi) = lower(aday)) loop
    sira := sira + 1;
    aday := temel || '_' || sira;
  end loop;
  insert into public.profiles (id, kullanici_adi, role) values (new.id, aday, 'taraftar');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.yeni_kullanici();

-- Kullanıcılar kendi rolünü asla değiştiremez. Yönetici başkasının rolünü
-- değiştirebilir. SQL Editor (postgres) / service_role bu kontrole takılmaz:
-- ilk yönetici böyle atanır.
create or replace function public.profil_koruma()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if new.id is distinct from old.id then
      raise exception 'Profil kimliği değiştirilemez.' using errcode = '42501';
    end if;
    if new.role is distinct from old.role
       and (new.id = auth.uid() or not public.is_admin()) then
      raise exception 'Rol değiştirme yetkiniz yok.' using errcode = '42501';
    end if;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

create trigger profil_koruma
  before update on public.profiles
  for each row execute function public.profil_koruma();

alter table public.profiles enable row level security;

create policy profil_okuma on public.profiles
  for select using (true);

create policy profil_guncelleme on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()))
  with check (id = (select auth.uid()) or (select public.is_admin()));
-- insert/delete politikası yok: profil tetikleyiciyle açılır, auth.users silinince gider.

-- ---------------------------------------------------------------------
-- haberler
-- ---------------------------------------------------------------------
create table public.haberler (
  id uuid primary key default gen_random_uuid(),
  baslik text not null check (char_length(btrim(baslik)) between 3 and 200),
  ozet text check (ozet is null or char_length(ozet) <= 500),
  govde text not null default '' check (char_length(govde) <= 20000),
  kapak_url text check (kapak_url is null or kapak_url ~ '^(https://|assets/)[^[:space:]"<>]*$'),
  yayinda boolean not null default false,
  yayin_tarihi timestamptz,
  yazar_id uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index haberler_akis on public.haberler (yayinda, yayin_tarihi desc);

-- İlk yayında yayın tarihi atanır; yayından kaldırıp yeniden yayınlamak tarihi değiştirmez.
create or replace function public.haber_yayin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.yayinda and new.yayin_tarihi is null then
    new.yayin_tarihi := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger haber_yayin
  before insert or update on public.haberler
  for each row execute function public.haber_yayin();

alter table public.haberler enable row level security;

create policy haber_okuma on public.haberler
  for select using (yayinda or (select public.is_admin()));
create policy haber_ekleme on public.haberler
  for insert to authenticated with check ((select public.is_admin()));
create policy haber_guncelleme on public.haberler
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy haber_silme on public.haberler
  for delete to authenticated using ((select public.is_admin()));

-- ---------------------------------------------------------------------
-- maclar (reklam modülü id, rakip, tarih alanlarına dayanır)
-- ---------------------------------------------------------------------
create table public.maclar (
  id uuid primary key default gen_random_uuid(),
  rakip text not null check (char_length(btrim(rakip)) between 2 and 80),
  tarih timestamptz not null,
  stadyum text check (stadyum is null or char_length(stadyum) <= 120),
  ic_saha boolean not null default true,
  organizasyon text check (organizasyon is null or char_length(organizasyon) <= 80),
  corum_skor smallint check (corum_skor between 0 and 99),
  rakip_skor smallint check (rakip_skor between 0 and 99),
  durum text not null default 'planlandi' check (durum in ('planlandi', 'canli', 'bitti')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bitti_skorlu check (durum <> 'bitti' or (corum_skor is not null and rakip_skor is not null))
);

create index maclar_tarih on public.maclar (tarih);

create trigger maclar_guncellendi
  before update on public.maclar
  for each row execute function public.guncellendi();

alter table public.maclar enable row level security;

create policy mac_okuma on public.maclar for select using (true);
create policy mac_ekleme on public.maclar
  for insert to authenticated with check ((select public.is_admin()));
create policy mac_guncelleme on public.maclar
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy mac_silme on public.maclar
  for delete to authenticated using ((select public.is_admin()));

-- ---------------------------------------------------------------------
-- goller (sadece Çorum golleri)
-- ---------------------------------------------------------------------
create table public.goller (
  id uuid primary key default gen_random_uuid(),
  mac_id uuid not null references public.maclar (id) on delete cascade,
  oyuncu text not null check (char_length(btrim(oyuncu)) between 2 and 80),
  dakika smallint not null check (dakika between 1 and 130),
  ek_dakika smallint check (ek_dakika between 1 and 20),
  penalti boolean not null default false,
  video_url text check (
    video_url is null
    or video_url ~ '^https://(www\.|m\.)?(youtube\.com|youtube-nocookie\.com|youtu\.be)/[^[:space:]"<>]+$'
    or video_url ~* '^https://[^[:space:]"<>]+\.mp4(\?[^[:space:]"<>]*)?$'
  ),
  aciklama text check (aciklama is null or char_length(aciklama) <= 300),
  created_at timestamptz not null default now()
);

create index goller_mac on public.goller (mac_id, dakika);

alter table public.goller enable row level security;

create policy gol_okuma on public.goller for select using (true);
create policy gol_ekleme on public.goller
  for insert to authenticated with check ((select public.is_admin()));
create policy gol_guncelleme on public.goller
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy gol_silme on public.goller
  for delete to authenticated using ((select public.is_admin()));

-- ---------------------------------------------------------------------
-- yorumlar (habere ya da maça; ikisinden tam biri)
-- ---------------------------------------------------------------------
create table public.yorumlar (
  id uuid primary key default gen_random_uuid(),
  kullanici_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  haber_id uuid references public.haberler (id) on delete cascade,
  mac_id uuid references public.maclar (id) on delete cascade,
  metin text not null check (char_length(btrim(metin)) >= 1 and char_length(metin) <= 1000),
  gizli boolean not null default false,
  created_at timestamptz not null default now(),
  duzenlendi timestamptz,
  constraint yorum_tek_hedef check (num_nonnulls(haber_id, mac_id) = 1)
);

create index yorumlar_haber on public.yorumlar (haber_id, created_at);
create index yorumlar_mac on public.yorumlar (mac_id, created_at);
create index yorumlar_kullanici on public.yorumlar (kullanici_id, created_at desc);

-- Ekleme: sahibi zorla oturumdaki kullanıcı yapılır, tarih sunucuda atanır,
-- yönetici olmayan gizli yorum ekleyemez, dakikada en fazla 5 yorum.
create or replace function public.yorum_ekleme_kontrol()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  son_dakika int;
begin
  if current_user in ('anon', 'authenticated') then
    if auth.uid() is null then
      raise exception 'Yorum yazmak için giriş yapın.' using errcode = '42501';
    end if;
    new.kullanici_id := auth.uid();
    new.created_at := now();
    new.duzenlendi := null;
    if not public.is_admin() then
      new.gizli := false;
      -- Aynı kullanıcının eşzamanlı eklemeleri sırayla sayılsın
      perform pg_advisory_xact_lock(hashtext('yorum:' || new.kullanici_id::text));
      select count(*) into son_dakika
        from public.yorumlar
        where kullanici_id = new.kullanici_id
          and created_at > now() - interval '1 minute';
      if son_dakika >= 5 then
        raise exception 'Çok hızlı yorum yazıyorsunuz. Lütfen bir dakika sonra tekrar deneyin.'
          using errcode = 'P0001', hint = 'oran_siniri';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger yorum_ekleme_kontrol
  before insert on public.yorumlar
  for each row execute function public.yorum_ekleme_kontrol();

-- Güncelleme: yönetici olmayan sadece metni değiştirebilir (gizli bayrağı, sahip, hedef değişmez).
create or replace function public.yorum_guncelleme_kontrol()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') and not public.is_admin() then
    if new.kullanici_id is distinct from old.kullanici_id
       or new.haber_id is distinct from old.haber_id
       or new.mac_id is distinct from old.mac_id
       or new.gizli is distinct from old.gizli
       or new.created_at is distinct from old.created_at then
      raise exception 'Yorumda sadece metni değiştirebilirsiniz.' using errcode = '42501';
    end if;
  end if;
  if current_user in ('anon', 'authenticated') then
    new.duzenlendi := case when new.metin is distinct from old.metin then now() else old.duzenlendi end;
  end if;
  return new;
end;
$$;

create trigger yorum_guncelleme_kontrol
  before update on public.yorumlar
  for each row execute function public.yorum_guncelleme_kontrol();

alter table public.yorumlar enable row level security;

-- Herkes: gizli olmayan ve yayındaki habere/maça ait yorumlar.
-- Sahibi kendi yorumunu (gizlense de) görür; yönetici hepsini görür.
create policy yorum_okuma on public.yorumlar
  for select using (
    (not gizli and (haber_id is null or exists (
      select 1 from public.haberler h where h.id = yorumlar.haber_id and h.yayinda)))
    or kullanici_id = (select auth.uid())
    or (select public.is_admin())
  );

create policy yorum_ekleme on public.yorumlar
  for insert to authenticated
  with check (
    kullanici_id = (select auth.uid())
    and (not gizli or (select public.is_admin()))
    and (haber_id is null or exists (
      select 1 from public.haberler h where h.id = yorumlar.haber_id and h.yayinda))
  );

create policy yorum_guncelleme on public.yorumlar
  for update to authenticated
  using (kullanici_id = (select auth.uid()) or (select public.is_admin()))
  with check (kullanici_id = (select auth.uid()) or (select public.is_admin()));

create policy yorum_silme on public.yorumlar
  for delete to authenticated
  using (kullanici_id = (select auth.uid()) or (select public.is_admin()));

-- ---------------------------------------------------------------------
-- Yetkiler (Supabase bunları zaten verir; düz Postgres'te de çalışsın diye açıkça)
-- Asıl koruma yukarıdaki RLS politikalarıdır.
-- ---------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select on public.profiles, public.haberler, public.maclar, public.goller, public.yorumlar
  to anon, authenticated;
grant update on public.profiles to authenticated;
grant insert, update, delete on public.haberler, public.maclar, public.goller, public.yorumlar
  to authenticated;
grant execute on function public.is_admin() to anon, authenticated;


-- ===================== 002_depolama.sql =====================
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


-- ===================== 010_reklamlar.sql =====================
-- Çorumspor yerel reklam / sponsorluk modülü
-- Tablolar: reklamlar, reklam_olaylari  ·  RPC: aktif_reklam, reklam_olay_kaydet, reklam_raporu
-- Depo: reklam-gorselleri (herkes okur, yalnız yönetici yazar)
--
-- Güvenlik özeti
--  * İki tabloda da RLS açık. Ziyaretçi (anon) tabloları HİÇ okuyamaz/yazamaz.
--  * Ziyaretçi reklamı yalnızca aktif_reklam() ile alır (SECURITY DEFINER; sadece şu an yayında olanı döndürür).
--  * Olaylar yalnızca reklam_olay_kaydet() ile yazılır (reklam o an yayında mı bakar, tekrarı ve tıklama sınırını uygular).
--  * Yönetici kontrolü TEK fonksiyonda: public.is_admin() (001'de tanımlı; burada yeniden tanımlanmaz).
--  * Kişisel veri yok (KVKK): olaylarda kullanıcı kimliği, IP, tarayıcı bilgisi tutulmaz; sadece rastgele sayfa ziyareti kimliği.
--
-- Bu dosya tekrar çalıştırılabilir (create ... if not exists / create or replace).
-- Sıra: 001_temel_sema.sql → 002_depolama.sql → 010_reklamlar.sql
-- Önkoşul: 001 temel migration (public.profiles, public.is_admin(), public.maclar).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tipler
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.reklam_alani as enum ('ana_akis', 'haber_sonu', 'mac_sponsoru');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.reklam_durumu as enum ('taslak', 'yayinda', 'duraklatildi');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.reklam_olay_turu as enum ('gosterim', 'tiklama');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Yönetici kontrolü: 001 temel migration'daki public.is_admin() kullanılır (profiles.role = 'admin').
-- Bu dosya is_admin()'i ve profiles'ı TANIMLAMAZ, değiştirmez, silmez. Kural değişecekse sadece is_admin() değişir.
-- Yoksa durup açık hata verelim (yanlış sırayla uygulanırsa sessizce herkese kapalı kalmasın):
-- ---------------------------------------------------------------------------
do $$ begin
  if to_regprocedure('public.is_admin()') is null then
    raise exception '010_reklamlar: önce 001 temel migration uygulanmalı (public.is_admin() bulunamadı)';
  end if;
  if to_regclass('public.maclar') is null then
    raise exception '010_reklamlar: önce 001 temel migration uygulanmalı (public.maclar bulunamadı)';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Bağlantı doğrulama (reklam-mantik.js ile AYNI desenler)
-- Kabul: https://... (alan adı + TLD), https://wa.me/<rakam>, whatsapp://send?phone=<rakam>
-- Red: http://, javascript:, data:, kullanıcı:şifre@, IP adresi, boşluk/kontrol karakteri
-- ---------------------------------------------------------------------------
create or replace function public.reklam_baglanti_gecerli(p_url text)
returns boolean language sql immutable set search_path = ''
as $$
  select case
    when p_url is null or p_url = '' then true
    when length(p_url) > 2000 or p_url ~ '[\x01-\x20\x7f-\x9f]' then false
    when p_url ~* '^whatsapp://send\?phone=[0-9]{8,15}(&text=[^<>"''`\\{}|^&]*)?$' then true
    when p_url ~* '^https://wa\.me([/?#:]|$)' then p_url ~* '^https://wa\.me/[0-9]{8,15}/?(\?text=[^<>"''`\\{}|^&]*)?$'
    else p_url ~* '^https://([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}(:[0-9]{1,5})?([/?#][^<>"''`\\{}|^]*)?$'
  end
$$;

-- Reklam görseli YALNIZ projenin kendi Supabase Storage kovasından (reklam-gorselleri) gelebilir.
-- Başka alan adındaki görsel ziyaretçinin IP'sini üçüncü tarafa sızdırabilir (izleme pikseli) ve sonradan değiştirilebilir.
-- reklam-mantik.js gorselAdresiGecerli ile AYNI desen. Supabase'e kendi alan adınızı bağladıysanız ikisini birlikte güncelleyin.
create or replace function public.reklam_gorsel_gecerli(p_url text)
returns boolean language sql immutable set search_path = ''
as $$
  select p_url is not null and p_url <> '' and length(p_url) <= 2000 and p_url !~ '[\x01-\x20\x7f-\x9f]'
     and strpos(p_url, '..') = 0
     and p_url ~* '^https://[a-z0-9][a-z0-9-]{0,62}\.supabase\.co/storage/v1/object/public/reklam-gorselleri/[A-Za-z0-9._~/-]+$'
$$;

-- İstemciden gelen maç kimliği metni (data-mac-id) -> uuid; boş ya da bozuksa null (hata fırlatmaz)
create or replace function public.reklam_mac_uuid(p text)
returns uuid language sql immutable set search_path = ''
as $$
  select case when btrim(coalesce(p, '')) ~* '^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$'
              then btrim(p)::uuid end
$$;

-- Türkiye telefonundan wa.me bağlantısı (reklam-mantik.js whatsappBaglantisiOlustur ile aynı kural; mesaj SQL'de yok)
create or replace function public.whatsapp_baglantisi(p_telefon text)
returns text language plpgsql immutable set search_path = ''
as $$
declare r text := regexp_replace(coalesce(p_telefon, ''), '[[:space:]().-]', '', 'g');
begin
  if r !~ '^\+?[0-9]+$' then return null; end if;
  r := ltrim(r, '+');
  if r like '0090%' then r := substr(r, 5);
  elsif r like '90%' and length(r) = 12 then r := substr(r, 3);
  elsif r like '0%' and length(r) = 11 then r := substr(r, 2);
  end if;
  if r !~ '^[2-5][0-9]{9}$' then return null; end if;
  return 'https://wa.me/90' || r;
end $$;

-- ---------------------------------------------------------------------------
-- reklamlar
-- mac_id -> public.maclar(id). Maç silinirse ona özel sponsorluk da silinir (genel sponsora dönüşmesin).
-- ---------------------------------------------------------------------------
create table if not exists public.reklamlar (
  id             uuid primary key default gen_random_uuid(),
  firma_adi      text not null,
  gorsel_url     text not null,
  kisa_metin     text not null,
  baglanti_url   text,
  alan           public.reklam_alani not null,
  mac_id         uuid references public.maclar (id) on delete cascade,
  baslangic      timestamptz not null,
  bitis          timestamptz not null,
  durum          public.reklam_durumu not null default 'taslak',
  oncelik        integer not null default 0,
  yayina_alinma  timestamptz,
  olusturan      uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint reklamlar_tarih_sirasi check (bitis > baslangic),
  constraint reklamlar_mac_sadece_sponsor check (mac_id is null or alan = 'mac_sponsoru'),
  constraint reklamlar_oncelik_araligi check (oncelik between 0 and 100),
  constraint reklamlar_baglanti check (public.reklam_baglanti_gecerli(baglanti_url))
);

comment on table public.reklamlar is 'Yerel reklam ve sponsorluklar. Ziyaretçi yalnızca aktif_reklam() ile okur.';
comment on column public.reklamlar.mac_id is 'Sadece mac_sponsoru: boşsa tüm maçlar, doluysa yalnız o maç (maça özel olan genelden önce gelir).';
comment on column public.reklamlar.yayina_alinma is 'Durum her yayinda olduğunda tetikleyici şimdiki zamanı yazar; eşit öncelikte yenisi kazanır.';

create index if not exists reklamlar_secim_idx on public.reklamlar (alan, durum, bitis) where durum = 'yayinda';

create or replace function public.reklamlar_dogrula()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  -- Boşlukları temizle; boş bağlantı = bağlantı yok
  new.firma_adi := btrim(coalesce(new.firma_adi, ''));
  new.kisa_metin := btrim(coalesce(new.kisa_metin, ''));
  new.gorsel_url := btrim(coalesce(new.gorsel_url, ''));
  new.baglanti_url := nullif(btrim(coalesce(new.baglanti_url, '')), '');

  if new.firma_adi = '' then raise exception 'Firma adı boş olamaz.' using errcode = '22023'; end if;
  if length(new.firma_adi) > 80 then raise exception 'Firma adı en fazla 80 karakter olabilir.' using errcode = '22023'; end if;
  if new.kisa_metin = '' then raise exception 'Kısa metin boş olamaz.' using errcode = '22023'; end if;
  if length(new.kisa_metin) > 160 then raise exception 'Kısa metin en fazla 160 karakter olabilir.' using errcode = '22023'; end if;
  if not public.reklam_gorsel_gecerli(new.gorsel_url) then
    raise exception 'Görseli "Dosya seç" ile yükleyin (yalnızca sitenin kendi deposundaki görseller kabul edilir).' using errcode = '22023';
  end if;
  if not public.reklam_baglanti_gecerli(new.baglanti_url) then
    raise exception 'Bağlantı geçersiz. Yalnızca https:// adresleri ya da WhatsApp bağlantısı kabul edilir.' using errcode = '22023';
  end if;
  if new.baslangic is null or new.bitis is null then
    raise exception 'Başlangıç ve bitiş tarihi gerekli.' using errcode = '22023';
  end if;
  if new.bitis <= new.baslangic then
    raise exception 'Bitiş, başlangıçtan sonra olmalı.' using errcode = '22023';
  end if;
  if new.oncelik is null or new.oncelik < 0 or new.oncelik > 100 then
    raise exception 'Öncelik 0 ile 100 arasında tam sayı olmalı.' using errcode = '22023';
  end if;
  if new.mac_id is not null and new.alan <> 'mac_sponsoru' then
    raise exception 'Maç yalnızca "Maç sponsoru" alanında seçilebilir.' using errcode = '22023';
  end if;
  if new.mac_id is not null and not exists (select 1 from public.maclar m where m.id = new.mac_id) then
    raise exception 'Seçilen maç bulunamadı.' using errcode = '22023';
  end if;

  -- Yayına alınma zamanı istemciden gelmez: durum yayinda olduğu an sunucu yazar
  if tg_op = 'INSERT' then
    new.yayina_alinma := case when new.durum = 'yayinda' then now() else null end;
    new.olusturan := auth.uid();
    new.created_at := now();
  else
    new.id := old.id;
    new.created_at := old.created_at;
    new.olusturan := old.olusturan;
    new.yayina_alinma := case when new.durum = 'yayinda' and old.durum is distinct from 'yayinda' then now() else old.yayina_alinma end;
  end if;
  if new.durum = 'yayinda' and (tg_op = 'INSERT' or old.durum is distinct from 'yayinda') and new.bitis <= now() then
    raise exception 'Bitiş tarihi geçmiş bir reklam yayına alınamaz.' using errcode = '22023';
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists reklamlar_dogrula on public.reklamlar;
create trigger reklamlar_dogrula before insert or update on public.reklamlar
  for each row execute function public.reklamlar_dogrula();

alter table public.reklamlar enable row level security;

drop policy if exists "yonetici reklamlari okur" on public.reklamlar;
drop policy if exists "yonetici reklam ekler" on public.reklamlar;
drop policy if exists "yonetici reklam gunceller" on public.reklamlar;
drop policy if exists "yonetici reklam siler" on public.reklamlar;
create policy "yonetici reklamlari okur" on public.reklamlar for select to authenticated using ((select public.is_admin()));
create policy "yonetici reklam ekler" on public.reklamlar for insert to authenticated with check ((select public.is_admin()));
create policy "yonetici reklam gunceller" on public.reklamlar for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "yonetici reklam siler" on public.reklamlar for delete to authenticated using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- reklam_olaylari (gösterim / tıklama). Kişisel veri YOK.
-- Gösterim: (reklam_id, tur, sayfa_ziyaret_id) tekil, yani bir sayfa ziyaretinde bir reklam en fazla 1 gösterim.
-- Tıklama: aynı SEKMEDE (sekme_id) aynı reklama 30 dakika içindeki tekrar tıklama sayılmaz (sayfa değişse de);
--   sekme_id gelmezse sayfa ziyareti kimliğine bakılır. Sayfa ziyareti başına en fazla 5 tıklama.
-- sekme_id: tarayıcının sessionStorage'ında duran rastgele uuid (sekme kapanınca silinir); yalnız tıklama satırlarında
--   ve yalnız bu tekrar kuralı için tutulur. Kullanıcıya, cihaza ya da IP'ye bağlanamaz.
-- (Tekil indeks bu yüzden yalnız gösterim satırlarında; tıklama tekrarı reklam_olay_kaydet içinde süreyle bakılır.)
-- ---------------------------------------------------------------------------
create table if not exists public.reklam_olaylari (
  id                bigint generated always as identity primary key,
  reklam_id         uuid not null references public.reklamlar (id) on delete cascade,
  tur               public.reklam_olay_turu not null,
  sayfa_ziyaret_id  uuid not null,
  alan              public.reklam_alani not null,
  mac_id            uuid,
  created_at        timestamptz not null default now(),
  sekme_id          uuid
);
alter table public.reklam_olaylari add column if not exists sekme_id uuid; -- eski kurulumlar için
comment on column public.reklam_olaylari.sekme_id is 'Sadece tıklamada: sekmeye özel rastgele kimlik (sessionStorage). Yalnız 30 dk tekrar tıklama kuralı için; kişisel veri değil.';
create unique index if not exists reklam_olaylari_gosterim_tekil
  on public.reklam_olaylari (reklam_id, tur, sayfa_ziyaret_id) where tur = 'gosterim';
create index if not exists reklam_olaylari_rapor_idx on public.reklam_olaylari (created_at, reklam_id);
create index if not exists reklam_olaylari_ziyaret_idx on public.reklam_olaylari (sayfa_ziyaret_id, tur);
create index if not exists reklam_olaylari_sekme_idx on public.reklam_olaylari (sekme_id, reklam_id, created_at) where tur = 'tiklama';

alter table public.reklam_olaylari enable row level security;
drop policy if exists "yonetici olaylari okur" on public.reklam_olaylari;
create policy "yonetici olaylari okur" on public.reklam_olaylari for select to authenticated using ((select public.is_admin()));
-- Ekleme/güncelleme/silme politikası YOK: olaylar sadece reklam_olay_kaydet() ile yazılır.

-- TRUNCATE RLS'e takılmaz; Supabase varsayılan yetkilerinden kaldırıyoruz
revoke truncate on public.reklamlar, public.reklam_olaylari from anon, authenticated;

-- ---------------------------------------------------------------------------
-- aktif_reklam(alan, mac_id): en fazla 1 reklam
-- ---------------------------------------------------------------------------
drop function if exists public.aktif_reklam(text, text);
create function public.aktif_reklam(p_alan text, p_mac_id text default null)
returns table (
  id uuid, firma_adi text, gorsel_url text, kisa_metin text, baglanti_url text,
  alan text, mac_id uuid
)
language sql stable security definer set search_path = ''
as $$
  select r.id, r.firma_adi, r.gorsel_url, r.kisa_metin, r.baglanti_url, r.alan::text, r.mac_id
  from public.reklamlar r
  where r.durum = 'yayinda'
    and r.baslangic <= now() and now() < r.bitis
    and r.alan::text = p_alan
    and (r.alan <> 'mac_sponsoru' or r.mac_id is null or r.mac_id = public.reklam_mac_uuid(p_mac_id))
  order by (r.mac_id is not null and r.mac_id = public.reklam_mac_uuid(p_mac_id)) desc,
           r.oncelik desc,
           r.yayina_alinma desc nulls last,
           r.created_at desc,
           r.id
  limit 1
$$;
revoke execute on function public.aktif_reklam(text, text) from public;
grant execute on function public.aktif_reklam(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- reklam_olay_kaydet: tek yazma kapısı
-- p_sekme_id: yalnız tıklamada anlamlı (sekmeye özel rastgele kimlik); boşsa tekrar kuralı sayfa ziyaretine bakar.
-- Döner: 'kaydedildi' | 'tekrar' (gösterim bu ziyarette zaten sayıldı ya da aynı reklama 30 dk içinde bu sekmede tekrar tıklandı)
--        | 'sinir' (bu ziyarette tıklama sınırı doldu)
-- Hata: tür/alan geçersizse ya da reklam şu an yayında değilse
-- ---------------------------------------------------------------------------
drop function if exists public.reklam_olay_kaydet(uuid, text, uuid, text, text);
drop function if exists public.reklam_olay_kaydet(uuid, text, uuid, text, text, uuid);
create function public.reklam_olay_kaydet(
  p_reklam_id uuid, p_tur text, p_sayfa_ziyaret_id uuid, p_alan text, p_mac_id text default null,
  p_sekme_id uuid default null
)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  c_tiklama_siniri constant int := 5;                        -- bir sayfa ziyaretinde en fazla 5 tıklama (tüm reklamlar toplamı)
  c_tiklama_tekrar constant interval := interval '30 minutes'; -- aynı sekmede aynı reklama bu süre içindeki tekrar tıklama sayılmaz
  v_r public.reklamlar%rowtype;
  v_mac uuid := public.reklam_mac_uuid(p_mac_id);
  v_sayi int;
begin
  if p_reklam_id is null or p_sayfa_ziyaret_id is null then
    raise exception 'Eksik bilgi.' using errcode = '22023';
  end if;
  if p_tur is null or p_tur not in ('gosterim', 'tiklama') then
    raise exception 'Geçersiz olay türü.' using errcode = '22023';
  end if;

  select * into v_r from public.reklamlar where id = p_reklam_id;
  if not found
     or v_r.durum <> 'yayinda'
     or not (v_r.baslangic <= now() and now() < v_r.bitis) then
    raise exception 'Reklam şu an yayında değil.' using errcode = '22023';
  end if;
  if v_r.alan::text is distinct from p_alan then
    raise exception 'Reklam bu alanda gösterilmiyor.' using errcode = '22023';
  end if;
  if v_r.alan = 'mac_sponsoru' then
    if v_r.mac_id is not null and v_r.mac_id is distinct from v_mac then
      raise exception 'Reklam bu maçta gösterilmiyor.' using errcode = '22023';
    end if;
  else
    v_mac := null;
  end if;

  if p_tur = 'tiklama' then
    -- Aynı sekme / aynı ziyaret kimliğiyle eşzamanlı çağrılar sırayla işlensin (kilit sırası hep: sekme, sonra ziyaret)
    if p_sekme_id is not null then
      perform pg_advisory_xact_lock(hashtextextended('reklam-sekme:' || p_sekme_id::text, 0));
    end if;
    perform pg_advisory_xact_lock(hashtextextended(p_sayfa_ziyaret_id::text, 0));
    select count(*) into v_sayi from public.reklam_olaylari
      where sayfa_ziyaret_id = p_sayfa_ziyaret_id and tur = 'tiklama';
    if exists (select 1 from public.reklam_olaylari e
               where e.tur = 'tiklama' and e.reklam_id = p_reklam_id
                 and e.created_at > now() - c_tiklama_tekrar
                 and (e.sayfa_ziyaret_id = p_sayfa_ziyaret_id
                      or (p_sekme_id is not null and e.sekme_id = p_sekme_id))) then
      return 'tekrar';
    end if;
    if v_sayi >= c_tiklama_siniri then return 'sinir'; end if;
    insert into public.reklam_olaylari (reklam_id, tur, sayfa_ziyaret_id, alan, mac_id, sekme_id)
    values (p_reklam_id, 'tiklama', p_sayfa_ziyaret_id, v_r.alan, v_mac, p_sekme_id);
    return 'kaydedildi';
  end if;

  insert into public.reklam_olaylari (reklam_id, tur, sayfa_ziyaret_id, alan, mac_id)
  values (p_reklam_id, 'gosterim', p_sayfa_ziyaret_id, v_r.alan, v_mac)
  on conflict (reklam_id, tur, sayfa_ziyaret_id) where tur = 'gosterim' do nothing;
  if not found then return 'tekrar'; end if;
  return 'kaydedildi';
end $$;
revoke execute on function public.reklam_olay_kaydet(uuid, text, uuid, text, text, uuid) from public;
grant execute on function public.reklam_olay_kaydet(uuid, text, uuid, text, text, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- reklam_raporu(baslangic, bitis): yalnız yönetici. Tarihler Türkiye takvim günü (her iki gün dahil).
-- tiklama_orani yüzde (2 basamak); gösterim yoksa null.
-- Aralıkta olayı olan ya da yayın tarihleri aralıkla kesişen her reklam listelenir.
-- ---------------------------------------------------------------------------
drop function if exists public.reklam_raporu(date, date);
create function public.reklam_raporu(p_baslangic_tarih date, p_bitis_tarih date)
returns table (
  reklam_id uuid, firma_adi text, alan text, mac_id uuid,
  gosterim bigint, tiklama bigint, tiklama_orani numeric
)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_bas timestamptz;
  v_son timestamptz;
begin
  if not public.is_admin() then
    raise exception 'Bu raporu yalnızca yöneticiler görebilir.' using errcode = '42501';
  end if;
  if p_baslangic_tarih is null or p_bitis_tarih is null or p_bitis_tarih < p_baslangic_tarih then
    raise exception 'Tarih aralığı geçersiz.' using errcode = '22023';
  end if;
  v_bas := p_baslangic_tarih::timestamp at time zone 'Europe/Istanbul';
  v_son := (p_bitis_tarih + 1)::timestamp at time zone 'Europe/Istanbul';

  return query
  with o as (
    select e.reklam_id,
           count(*) filter (where e.tur = 'gosterim') as g,
           count(*) filter (where e.tur = 'tiklama')  as t
    from public.reklam_olaylari e
    where e.created_at >= v_bas and e.created_at < v_son
    group by e.reklam_id
  )
  select r.id, r.firma_adi, r.alan::text, r.mac_id,
         coalesce(o.g, 0)::bigint, coalesce(o.t, 0)::bigint,
         case when coalesce(o.g, 0) > 0 then round(100.0 * coalesce(o.t, 0) / o.g, 2) end
  from public.reklamlar r
  left join o on o.reklam_id = r.id
  where o.reklam_id is not null or (r.durum <> 'taslak' and r.baslangic < v_son and r.bitis > v_bas)
  order by coalesce(o.g, 0) desc, r.firma_adi;
end $$;
revoke execute on function public.reklam_raporu(date, date) from public, anon;
grant execute on function public.reklam_raporu(date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Depo: reklam-gorselleri (yalnızca Supabase'de storage şeması varsa)
-- Herkese açık okuma (public bucket: dosya public URL ile RLS'siz okunur), listeleme/yükleme/değiştirme/silme yalnız yönetici.
-- Listeleme (storage.objects select) herkese açık OLMAMALI: yoksa ziyaretçi taslak kampanyanın görselini önceden bulur.
-- En fazla 2 MB, jpeg/png/webp.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'storage şeması yok, reklam-gorselleri deposu atlandı';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('reklam-gorselleri', 'reklam-gorselleri', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
                                 allowed_mime_types = excluded.allowed_mime_types;

  drop policy if exists "reklam gorselleri herkese acik" on storage.objects;  -- eski sürüm: herkes listeleyebiliyordu
  drop policy if exists "reklam gorselleri yonetici listeler" on storage.objects;
  drop policy if exists "reklam gorseli yonetici yukler" on storage.objects;
  drop policy if exists "reklam gorseli yonetici gunceller" on storage.objects;
  drop policy if exists "reklam gorseli yonetici siler" on storage.objects;
  create policy "reklam gorselleri yonetici listeler" on storage.objects for select to authenticated
    using (bucket_id = 'reklam-gorselleri' and (select public.is_admin()));
  create policy "reklam gorseli yonetici yukler" on storage.objects for insert to authenticated
    with check (bucket_id = 'reklam-gorselleri' and (select public.is_admin()));
  create policy "reklam gorseli yonetici gunceller" on storage.objects for update to authenticated
    using (bucket_id = 'reklam-gorselleri' and (select public.is_admin()))
    with check (bucket_id = 'reklam-gorselleri' and (select public.is_admin()));
  create policy "reklam gorseli yonetici siler" on storage.objects for delete to authenticated
    using (bucket_id = 'reklam-gorselleri' and (select public.is_admin()));
end $$;


-- ===================== 011_denetim_duzeltmeleri.sql =====================
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


-- ===================== 012_denetim_2.sql =====================
-- =====================================================================
-- Çorum Taraftar: denetim düzeltmeleri, 2. tur (012) — docs/DENETIM-2026-11-05.md "Düzeltme turu 2"
-- Sıra: 001 → 002 → 010 → 011 → 012. Tekrar çalıştırılabilir; daha önce kurulmuş bir projede de güvenle çalışır.
-- DİKKAT: 010_reklamlar.sql'i sonradan YENİDEN çalıştırırsanız reklam_olay_kaydet ve reklam_raporu 010'daki hâline
-- döner (dakika sınırı kalkar); öyle bir durumda bu dosyayı da hemen ardından yeniden çalıştırın.
--
-- 1) Reklam sayımı şişirme: reklam başına dakikada en fazla 120 gösterim / 30 tıklama (bütün ziyaretçiler toplamı).
--    Fazlası 'sinir' döner ve SAYILMAZ; o dakika reklam_sinir_dakikalari'na yazılır (kişisel veri yok) ve
--    reklam_raporu'nda "supheli_dakika" (sınıra takılan dakika sayısı) olarak görünür.
-- 2) Yorum spamı: yorum yazmak için e-posta onayı (auth.users.email_confirmed_at), hesap başına son 24 saatte en fazla
--    50 yorum, aynı metin 10 dakika içinde tekrar yazılamaz; düzenleme dakikada en fazla 10 ve yalnız yazıldıktan sonraki
--    30 dakika içinde (yönetici muaf).
-- 3) Profiller: ziyaretçi ve üyeler yalnız id, kullanici_adi, created_at okur (role sütunu kapalı); kişi kendi rolünü
--    benim_profilim() ile öğrenir. Yanıltıcı / ayrılmış kullanıcı adları (yönetici, admin, resmî, kulüp, Çorum FK…)
--    kayıtta "taraftar…" adına düşer, yeniden adlandırmada reddedilir.
-- 4) Haber kapağı yalnız projenin kendi deposundan (haber-gorselleri) ya da sitenin assets/img/ klasöründen.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Reklam: dakika sınırı + sınıra takılan dakikalar
-- ---------------------------------------------------------------------
create table if not exists public.reklam_sinir_dakikalari (
  reklam_id   uuid not null references public.reklamlar (id) on delete cascade,
  dakika      timestamptz not null,             -- dakikanın başı (date_trunc('minute', now()))
  tur         public.reklam_olay_turu not null,
  reddedilen  integer not null default 1 check (reddedilen > 0), -- o dakikada sınıra takılıp SAYILMAYAN olay sayısı
  primary key (reklam_id, dakika, tur)
);
comment on table public.reklam_sinir_dakikalari is 'Reklamın dakika sınırına (120 gösterim / 30 tıklama) takıldığı dakikalar. Kişisel veri yok: yalnız reklam, dakika, tür, reddedilen sayı.';
create index if not exists reklam_sinir_dakikalari_dakika on public.reklam_sinir_dakikalari (dakika);

alter table public.reklam_sinir_dakikalari enable row level security;
drop policy if exists "yonetici sinir dakikalarini okur" on public.reklam_sinir_dakikalari;
create policy "yonetici sinir dakikalarini okur" on public.reklam_sinir_dakikalari
  for select to authenticated using ((select public.is_admin()));
-- Yazma politikası YOK: yalnız reklam_olay_kaydet() (SECURITY DEFINER) yazar
revoke insert, update, delete, truncate on public.reklam_sinir_dakikalari from anon, authenticated;

-- reklam_olay_kaydet: 010'daki kurallar aynen + reklam başına dakika sınırı.
-- Döner: 'kaydedildi' | 'tekrar' | 'sinir' (bu ziyarette 5 tıklama doldu YA DA reklamın dakika sınırı doldu)
create or replace function public.reklam_olay_kaydet(
  p_reklam_id uuid, p_tur text, p_sayfa_ziyaret_id uuid, p_alan text, p_mac_id text default null,
  p_sekme_id uuid default null
)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  c_tiklama_siniri constant int := 5;                          -- bir sayfa ziyaretinde en fazla 5 tıklama (tüm reklamlar toplamı)
  c_tiklama_tekrar constant interval := interval '30 minutes'; -- aynı sekmede aynı reklama bu süre içindeki tekrar tıklama sayılmaz
  c_gosterim_dakika_siniri constant int := 120;                -- bir reklama dakikada en fazla 120 gösterim (bütün ziyaretçiler)
  c_tiklama_dakika_siniri constant int := 30;                  -- bir reklama dakikada en fazla 30 tıklama (bütün ziyaretçiler)
  v_r public.reklamlar%rowtype;
  v_mac uuid := public.reklam_mac_uuid(p_mac_id);
  v_sayi int;
  v_dakika timestamptz := date_trunc('minute', now());
begin
  if p_reklam_id is null or p_sayfa_ziyaret_id is null then
    raise exception 'Eksik bilgi.' using errcode = '22023';
  end if;
  if p_tur is null or p_tur not in ('gosterim', 'tiklama') then
    raise exception 'Geçersiz olay türü.' using errcode = '22023';
  end if;

  select * into v_r from public.reklamlar where id = p_reklam_id;
  if not found
     or v_r.durum <> 'yayinda'
     or not (v_r.baslangic <= now() and now() < v_r.bitis) then
    raise exception 'Reklam şu an yayında değil.' using errcode = '22023';
  end if;
  if v_r.alan::text is distinct from p_alan then
    raise exception 'Reklam bu alanda gösterilmiyor.' using errcode = '22023';
  end if;
  if v_r.alan = 'mac_sponsoru' then
    if v_r.mac_id is not null and v_r.mac_id is distinct from v_mac then
      raise exception 'Reklam bu maçta gösterilmiyor.' using errcode = '22023';
    end if;
  else
    v_mac := null;
  end if;

  if p_tur = 'tiklama' then
    -- Aynı sekme / aynı ziyaret kimliğiyle eşzamanlı çağrılar sırayla işlensin (kilit sırası hep: sekme, ziyaret, reklam)
    if p_sekme_id is not null then
      perform pg_advisory_xact_lock(hashtextextended('reklam-sekme:' || p_sekme_id::text, 0));
    end if;
    perform pg_advisory_xact_lock(hashtextextended(p_sayfa_ziyaret_id::text, 0));
    select count(*) into v_sayi from public.reklam_olaylari
      where sayfa_ziyaret_id = p_sayfa_ziyaret_id and tur = 'tiklama';
    if exists (select 1 from public.reklam_olaylari e
               where e.tur = 'tiklama' and e.reklam_id = p_reklam_id
                 and e.created_at > now() - c_tiklama_tekrar
                 and (e.sayfa_ziyaret_id = p_sayfa_ziyaret_id
                      or (p_sekme_id is not null and e.sekme_id = p_sekme_id))) then
      return 'tekrar';
    end if;
    if v_sayi >= c_tiklama_siniri then return 'sinir'; end if;
  elsif exists (select 1 from public.reklam_olaylari e
                where e.reklam_id = p_reklam_id and e.tur = 'gosterim' and e.sayfa_ziyaret_id = p_sayfa_ziyaret_id) then
    return 'tekrar';
  end if;

  -- Reklam başına dakika sınırı: aynı reklamın aynı türdeki olayları sırayla sayılsın
  perform pg_advisory_xact_lock(hashtextextended('reklam-dakika:' || p_reklam_id::text || ':' || p_tur, 0));
  select count(*) into v_sayi from public.reklam_olaylari e
    where e.created_at >= v_dakika and e.reklam_id = p_reklam_id and e.tur = p_tur::public.reklam_olay_turu;
  if v_sayi >= (case when p_tur = 'tiklama' then c_tiklama_dakika_siniri else c_gosterim_dakika_siniri end) then
    insert into public.reklam_sinir_dakikalari as d (reklam_id, dakika, tur)
    values (p_reklam_id, v_dakika, p_tur::public.reklam_olay_turu)
    on conflict (reklam_id, dakika, tur) do update set reddedilen = d.reddedilen + 1;
    return 'sinir';
  end if;

  if p_tur = 'tiklama' then
    insert into public.reklam_olaylari (reklam_id, tur, sayfa_ziyaret_id, alan, mac_id, sekme_id)
    values (p_reklam_id, 'tiklama', p_sayfa_ziyaret_id, v_r.alan, v_mac, p_sekme_id);
    return 'kaydedildi';
  end if;

  insert into public.reklam_olaylari (reklam_id, tur, sayfa_ziyaret_id, alan, mac_id)
  values (p_reklam_id, 'gosterim', p_sayfa_ziyaret_id, v_r.alan, v_mac)
  on conflict (reklam_id, tur, sayfa_ziyaret_id) where tur = 'gosterim' do nothing;
  if not found then return 'tekrar'; end if;
  return 'kaydedildi';
end $$;
revoke execute on function public.reklam_olay_kaydet(uuid, text, uuid, text, text, uuid) from public;
grant execute on function public.reklam_olay_kaydet(uuid, text, uuid, text, text, uuid) to anon, authenticated;

-- reklam_raporu: 010'daki sütunlar + supheli_dakika (aralıkta reklamın dakika sınırına takıldığı dakika sayısı).
-- 0'dan büyükse o aralıkta biri sayıyı şişirmeye çalışmış olabilir; fazlası zaten sayılmadı.
drop function if exists public.reklam_raporu(date, date);
create function public.reklam_raporu(p_baslangic_tarih date, p_bitis_tarih date)
returns table (
  reklam_id uuid, firma_adi text, alan text, mac_id uuid,
  gosterim bigint, tiklama bigint, tiklama_orani numeric, supheli_dakika bigint
)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_bas timestamptz;
  v_son timestamptz;
begin
  if not public.is_admin() then
    raise exception 'Bu raporu yalnızca yöneticiler görebilir.' using errcode = '42501';
  end if;
  if p_baslangic_tarih is null or p_bitis_tarih is null or p_bitis_tarih < p_baslangic_tarih then
    raise exception 'Tarih aralığı geçersiz.' using errcode = '22023';
  end if;
  v_bas := p_baslangic_tarih::timestamp at time zone 'Europe/Istanbul';
  v_son := (p_bitis_tarih + 1)::timestamp at time zone 'Europe/Istanbul';

  return query
  with o as (
    select e.reklam_id,
           count(*) filter (where e.tur = 'gosterim') as g,
           count(*) filter (where e.tur = 'tiklama')  as t
    from public.reklam_olaylari e
    where e.created_at >= v_bas and e.created_at < v_son
    group by e.reklam_id
  ), s as (
    select d.reklam_id, count(distinct d.dakika) as m
    from public.reklam_sinir_dakikalari d
    where d.dakika >= v_bas and d.dakika < v_son
    group by d.reklam_id
  )
  select r.id, r.firma_adi, r.alan::text, r.mac_id,
         coalesce(o.g, 0)::bigint, coalesce(o.t, 0)::bigint,
         case when coalesce(o.g, 0) > 0 then round(100.0 * coalesce(o.t, 0) / o.g, 2) end,
         coalesce(s.m, 0)::bigint
  from public.reklamlar r
  left join o on o.reklam_id = r.id
  left join s on s.reklam_id = r.id
  where o.reklam_id is not null or s.reklam_id is not null
     or (r.durum <> 'taslak' and r.baslangic < v_son and r.bitis > v_bas)
  order by coalesce(o.g, 0) desc, r.firma_adi;
end $$;
revoke execute on function public.reklam_raporu(date, date) from public, anon;
grant execute on function public.reklam_raporu(date, date) to authenticated;

-- ---------------------------------------------------------------------
-- 2) Yorum spamı
-- ---------------------------------------------------------------------
-- Oturumdaki kullanıcının e-postası onaylı mı (Supabase Auth: auth.users.email_confirmed_at).
-- Anonim girişler (e-postasız) ve onaysız hesaplar false. Supabase'de "Confirm email" AÇIK olmalı
-- (kapalıysa Supabase kayıtta e-postayı kendiliğinden onaylı sayar; README 3. bölüm).
create or replace function public.eposta_onayli()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null);
$$;
revoke execute on function public.eposta_onayli() from public;
grant execute on function public.eposta_onayli() to anon, authenticated;

drop policy if exists yorum_ekleme on public.yorumlar;
create policy yorum_ekleme on public.yorumlar
  for insert to authenticated
  with check (
    kullanici_id = (select auth.uid())
    and (select public.eposta_onayli())
    and (not gizli or (select public.is_admin()))
    and (haber_id is null or exists (
      select 1 from public.haberler h where h.id = yorumlar.haber_id and h.yayinda))
  );

-- Ekleme tetikleyicisi (001'dekinin yerine): sahibi/tarih sunucuda, e-posta onayı, dakikada 5, günde 50, 10 dk tekrar yok.
-- Politika (yukarıda) ayrıca onayı şart koşar; buradaki kontrol Türkçe mesaj içindir (tetikleyici politikadan önce çalışır).
create or replace function public.yorum_ekleme_kontrol()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  c_dakika_siniri constant int := 5;                            -- bir dakikada en fazla 5 yorum
  c_gun_siniri constant int := 50;                              -- son 24 saatte en fazla 50 yorum (hesap başına)
  c_tekrar_suresi constant interval := interval '10 minutes';   -- aynı metin bu süre içinde tekrar yazılamaz
  son_dakika int;
  son_gun int;
begin
  if current_user in ('anon', 'authenticated') then
    if auth.uid() is null then
      raise exception 'Yorum yazmak için giriş yapın.' using errcode = '42501';
    end if;
    new.kullanici_id := auth.uid();
    new.created_at := now();
    new.duzenlendi := null;
    if not public.eposta_onayli() then
      raise exception 'Yorum yazmak için e-posta adresinizi onaylayın: hesap açarken gelen e-postadaki bağlantıya tıklayın.'
        using errcode = '42501', hint = 'eposta_onayi';
    end if;
    if not public.is_admin() then
      new.gizli := false;
      -- Aynı kullanıcının eşzamanlı eklemeleri sırayla sayılsın
      perform pg_advisory_xact_lock(hashtext('yorum:' || new.kullanici_id::text));
      select count(*) filter (where y.created_at > now() - interval '1 minute'), count(*)
        into son_dakika, son_gun
        from public.yorumlar y
        where y.kullanici_id = new.kullanici_id
          and y.created_at > now() - interval '1 day';
      if son_dakika >= c_dakika_siniri then
        raise exception 'Çok hızlı yorum yazıyorsunuz. Lütfen bir dakika sonra tekrar deneyin.'
          using errcode = 'P0001', hint = 'oran_siniri';
      end if;
      if son_gun >= c_gun_siniri then
        raise exception 'Bir hesap günde en fazla 50 yorum yazabilir. Lütfen yarın tekrar deneyin.'
          using errcode = 'P0001', hint = 'gun_siniri';
      end if;
      if exists (select 1 from public.yorumlar y
                 where y.kullanici_id = new.kullanici_id
                   and y.created_at > now() - c_tekrar_suresi
                   and lower(regexp_replace(btrim(y.metin), '\s+', ' ', 'g'))
                       = lower(regexp_replace(btrim(new.metin), '\s+', ' ', 'g'))) then
        raise exception 'Bu yorumu az önce gönderdiniz. Aynı metni 10 dakika içinde tekrar gönderemezsiniz.'
          using errcode = 'P0001', hint = 'ayni_yorum';
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- Düzenleme sayacı: kim, ne zaman düzenledi (yalnız dakika sınırı için; 1 saatten eskisi silinir).
create table if not exists public.yorum_duzenlemeleri (
  kullanici_id uuid not null references public.profiles (id) on delete cascade,
  zaman timestamptz not null default now()
);
comment on table public.yorum_duzenlemeleri is 'Yorum düzenleme zamanları: yalnız "dakikada en fazla 10 düzenleme" kuralı için; 1 saatten eskisi silinir. Kimse okuyamaz.';
create index if not exists yorum_duzenlemeleri_kullanici on public.yorum_duzenlemeleri (kullanici_id, zaman);
alter table public.yorum_duzenlemeleri enable row level security;
-- Politika YOK: yalnız yorum_duzenleme_hakki() (SECURITY DEFINER) okur/yazar
revoke all on public.yorum_duzenlemeleri from anon, authenticated;

-- Oturumdaki kullanıcı bir düzenleme daha yapabilir mi? Yapabiliyorsa sayar, yapamıyorsa hata verir.
-- Doğrudan çağrılırsa yalnız kişinin KENDİ hakkını harcar (kimlik auth.uid()'den gelir, parametre yok).
create or replace function public.yorum_duzenleme_hakki()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c_dakika_siniri constant int := 10;   -- dakikada en fazla 10 düzenleme (hesap başına)
  v_uid uuid := auth.uid();
  v_sayi int;
begin
  if v_uid is null then
    raise exception 'Yorum düzenlemek için giriş yapın.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('yorum-duzenleme:' || v_uid::text));
  delete from public.yorum_duzenlemeleri where kullanici_id = v_uid and zaman < now() - interval '1 hour';
  select count(*) into v_sayi from public.yorum_duzenlemeleri
    where kullanici_id = v_uid and zaman > now() - interval '1 minute';
  if v_sayi >= c_dakika_siniri then
    raise exception 'Çok sık düzenleme yapıyorsunuz (dakikada en fazla 10). Lütfen biraz bekleyin.'
      using errcode = 'P0001', hint = 'duzenleme_siniri';
  end if;
  insert into public.yorum_duzenlemeleri (kullanici_id) values (v_uid);
end;
$$;
revoke execute on function public.yorum_duzenleme_hakki() from public, anon;
grant execute on function public.yorum_duzenleme_hakki() to authenticated;

-- Güncelleme tetikleyicisi (001'dekinin yerine): yönetici olmayan sadece metni değiştirebilir;
-- metin yalnız yazıldıktan sonraki 30 dakika içinde ve dakikada en fazla 10 kez değişebilir. Yönetici muaf.
create or replace function public.yorum_guncelleme_kontrol()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  c_duzenleme_suresi constant interval := interval '30 minutes';
begin
  if current_user in ('anon', 'authenticated') and not public.is_admin() then
    if new.kullanici_id is distinct from old.kullanici_id
       or new.haber_id is distinct from old.haber_id
       or new.mac_id is distinct from old.mac_id
       or new.gizli is distinct from old.gizli
       or new.created_at is distinct from old.created_at then
      raise exception 'Yorumda sadece metni değiştirebilirsiniz.' using errcode = '42501';
    end if;
    if new.metin is distinct from old.metin then
      if old.created_at < now() - c_duzenleme_suresi then
        raise exception 'Yorumlar yalnız yazıldıktan sonraki 30 dakika içinde düzenlenebilir.'
          using errcode = 'P0001', hint = 'duzenleme_suresi';
      end if;
      perform public.yorum_duzenleme_hakki();
    end if;
  end if;
  if current_user in ('anon', 'authenticated') then
    new.duzenlendi := case when new.metin is distinct from old.metin then now() else old.duzenlendi end;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 3) Profiller: role sütunu herkese kapalı, ayrılmış kullanıcı adları
-- ---------------------------------------------------------------------
-- Sütun yetkisi: ziyaretçi ve üyeler yalnız id, kullanici_adi, created_at okur. select * ya da role → "permission denied".
-- Rolü yazmak (yalnız yöneticinin başkası için yapabildiği, profil_koruma) yetki olarak açık kalır; okumak kapalı.
-- Yönetici kontrolü yine yalnız public.is_admin() (SECURITY DEFINER) ile.
revoke select on public.profiles from anon, authenticated;
grant select (id, kullanici_adi, created_at) on public.profiles to anon, authenticated;

-- Oturumdaki kullanıcının kendi profili (rol dahil). Başkasınınkini vermez; anonimde boş.
create or replace function public.benim_profilim()
returns table (id uuid, kullanici_adi text, role text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.kullanici_adi, p.role from public.profiles p where p.id = auth.uid();
$$;
revoke execute on function public.benim_profilim() from public;
grant execute on function public.benim_profilim() to anon, authenticated;

-- Yanıltıcı / ayrılmış kullanıcı adları. Büyük/küçük harf ve Türkçe harf fark etmez; rakam, "_" ve "." yok sayılır.
-- assets/kurallar.js kullaniciAdiAyrilmis ile AYNI liste (ortak örnekler: testler/kurallar-ornekleri.json).
-- İçinde geçmesi yeten kökler: admin, yonetici, yonetim, moderator, resmi, corumfk, kulup, yetkili
-- Tam eşleşmesi gerekenler: destek, mod, sistem, corumspor, corumsportaraftar, support, official, root
create or replace function public.kullanici_adi_ayrilmis(p_ad text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := lower(translate(coalesce(p_ad, ''), 'ÇĞİIÖŞÜÂÎÛçğıöşüâîû', 'cgiiosuaiucgiosuaiu'));
begin
  v := regexp_replace(v, '[^a-z]', '', 'g');
  return v ~ '(admin|yonetici|yonetim|moderator|resmi|corumfk|kulup|yetkili)'
      or v in ('destek', 'mod', 'sistem', 'corumspor', 'corumsportaraftar', 'support', 'official', 'root');
end;
$$;

-- Kayıt tetikleyicisi (001'dekinin yerine): ayrılmış ad istenirse (ya da ad çok kısaysa) "taraftar" + kimlikten 6 hane;
-- aynı ad varsa _1, _2 … soneki. Rol her zaman taraftar (metadata'daki rol yok sayılır).
create or replace function public.yeni_kullanici()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  temel text;
  aday text;
  sira int := 0;
begin
  temel := coalesce(btrim(new.raw_user_meta_data ->> 'kullanici_adi'), '');
  temel := regexp_replace(temel, '[^A-Za-z0-9_.çğıöşüÇĞİÖŞÜ]', '', 'g');
  temel := left(temel, 24);
  if char_length(temel) < 3 or public.kullanici_adi_ayrilmis(temel) then
    temel := 'taraftar' || left(replace(new.id::text, '-', ''), 6);
  end if;
  aday := temel;
  while exists (select 1 from public.profiles where lower(kullanici_adi) = lower(aday)) loop
    sira := sira + 1;
    aday := temel || '_' || sira;
  end loop;
  insert into public.profiles (id, kullanici_adi, role) values (new.id, aday, 'taraftar');
  return new;
end;
$$;

-- Profil koruma (001'dekinin yerine): kendi rolünü değiştiremez + ayrılmış ada geçilemez (SQL Editor muaf).
create or replace function public.profil_koruma()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if new.id is distinct from old.id then
      raise exception 'Profil kimliği değiştirilemez.' using errcode = '42501';
    end if;
    if new.role is distinct from old.role
       and (new.id = auth.uid() or not public.is_admin()) then
      raise exception 'Rol değiştirme yetkiniz yok.' using errcode = '42501';
    end if;
    if new.kullanici_adi is distinct from old.kullanici_adi and public.kullanici_adi_ayrilmis(new.kullanici_adi) then
      raise exception 'Bu kullanıcı adı kullanılamaz: yönetici, resmî hesap ya da kulüp gibi görünen adlar ayrılmıştır.'
        using errcode = '22023';
    end if;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 4) Haber kapağı: yalnız projenin deposu (haber-gorselleri) ya da sitenin assets/img/ klasörü
-- ---------------------------------------------------------------------
-- Başka sitedeki kapak, ziyaretçinin IP adresini o siteye götürür (izleme pikseli) ve sonradan değiştirilebilir.
-- assets/kurallar.js kapakAdresiGecerli ile AYNI kural. Supabase'e kendi alan adınızı bağladıysanız ikisini birlikte güncelleyin.
create or replace function public.haber_kapak_gecerli(p_url text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_url is null or (
    length(p_url) <= 2000 and strpos(p_url, '..') = 0 and p_url !~ '[\x01-\x20\x7f-\x9f]'
    and (p_url ~ '^assets/img/[A-Za-z0-9_-]+(/[A-Za-z0-9_-]+)*\.(svg|png|jpe?g|webp)$'
         or p_url ~* '^https://[a-z0-9][a-z0-9-]{0,62}\.supabase\.co/storage/v1/object/public/haber-gorselleri/[A-Za-z0-9._~/-]+$'))
$$;

alter table public.haberler drop constraint if exists haberler_kapak_kaynagi;
-- NOT VALID: eski kayıtlarda dış kapak varsa migration durmaz (yeni yazılan ve değiştirilen her satır denetlenir);
-- hiç yoksa hemen doğrulanır.
alter table public.haberler add constraint haberler_kapak_kaynagi check (public.haber_kapak_gecerli(kapak_url)) not valid;
do $$
begin
  if exists (select 1 from public.haberler where not public.haber_kapak_gecerli(kapak_url)) then
    raise notice '012: bazı haberlerin kapağı başka siteden. Bu haberleri düzenlerken kapağı panelden yeniden yükleyin (README 2. bölüm).';
  else
    alter table public.haberler validate constraint haberler_kapak_kaynagi;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Yeni tablolarda TRUNCATE da yok (Supabase varsayılan yetkileri)
-- ---------------------------------------------------------------------
revoke truncate on public.reklam_sinir_dakikalari, public.yorum_duzenlemeleri from anon, authenticated;


-- ===================== 013_tasarim.sql =====================
-- =====================================================================
-- Çorum Taraftar: mobil yeniden tasarım (013) — docs/TASARIM.md 9. bölüm
-- Sıra: 001 → 002 → 010 → 011 → 012 → 013. Tekrar çalıştırılabilir (if not exists / create or replace / drop if exists).
-- DİKKAT: 010 ya da 012'yi sonradan YENİDEN çalıştırırsanız aktif_reklam, reklam_olay_kaydet, yorum_ekleme_kontrol,
-- profil_koruma ve kullanici_adi_ayrilmis onların hâline döner; ardından bu dosyayı da yeniden çalıştırın.
--
--  1) haberler.manset            ana sayfanın büyük açılış görselindeki (hero) haber; haberler.kapak_kaynak fotoğraf atfı
--  2) goller.kapak_url / sure_sn video kapağı (yalnız sitenin deposu ya da assets/img/) ve süre
--  3) yorumlar.gol_id            gol sayfasına yorum (haber, maç ya da golden TAM BİRİ)
--  4) profiles.engelli           yöneticinin koyduğu yorum yasağı (politikayla); kişi kendi durumunu engelli_mi() ile görür
--  5) yorum_sikayetleri          "Şikâyet et": kişi başına yorum başına bir kez; yalnız yönetici okur
--  6) oyuncular, sakatliklar     Takım ekranı. Sakatlık = sağlık verisi (KVKK m.6): yalnız kulübün açıkladığı bilgi,
--                                kaynak ZORUNLU; ziyaretçi yalnız yayinda olanı görür
--  7) reklamlar                  düğme yazısı, "Ara" (tel:), görseldeki yazı (alt metin), küçük görsel (srcset),
--                                yasaklı sektör onayı; aktif_reklam yeni sütunlarla; aktif_reklamlar (akışta farklı firmalar);
--                                reklam_olay_kaydet yöneticinin gösterim/tıklamasını SAYMAZ ('yonetici' döner)
--  8) Ayrılmış kullanıcı adlarına başkan, Çorumspor, teknik direktör, kaptan eklendi (assets/kurallar.js ile AYNI)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Manşet
-- ---------------------------------------------------------------------
alter table public.haberler add column if not exists manset boolean not null default false;
comment on column public.haberler.manset is 'Ana sayfanın açılış görselinde (hero) gösterilir: en yeni yayındaki manşet; yoksa en yeni haber.';
alter table public.haberler add column if not exists kapak_kaynak text;
alter table public.haberler drop constraint if exists haberler_kapak_kaynak_uzunluk;
alter table public.haberler add constraint haberler_kapak_kaynak_uzunluk check (kapak_kaynak is null or char_length(kapak_kaynak) <= 160);
comment on column public.haberler.kapak_kaynak is 'Kapak fotoğrafının sahibi / kaynağı ve lisansı (ör. "Fotoğraf: Ad Soyad, CC BY 4.0"); kapağın altında gösterilir. Yalnız hakkı olan fotoğraf yüklenir.';
create index if not exists haberler_manset on public.haberler (manset, yayin_tarihi desc) where yayinda and manset;

-- ---------------------------------------------------------------------
-- 2) Gol kapağı ve süresi
-- ---------------------------------------------------------------------
alter table public.goller add column if not exists kapak_url text;
alter table public.goller add column if not exists sure_sn smallint;
alter table public.goller drop constraint if exists goller_kapak_kaynagi;
alter table public.goller add constraint goller_kapak_kaynagi check (public.haber_kapak_gecerli(kapak_url));
alter table public.goller drop constraint if exists goller_sure_araligi;
alter table public.goller add constraint goller_sure_araligi check (sure_sn is null or sure_sn between 1 and 3600);
comment on column public.goller.kapak_url is 'Video kapağı: yalnız haber-gorselleri kovası ya da assets/img/ (haber_kapak_gecerli). YouTube küçük resmi KULLANILMAZ (i.ytimg.com isteği yok).';

-- ---------------------------------------------------------------------
-- 3) Gol yorumları
-- ---------------------------------------------------------------------
alter table public.yorumlar add column if not exists gol_id uuid references public.goller (id) on delete cascade;
alter table public.yorumlar drop constraint if exists yorum_tek_hedef;
alter table public.yorumlar add constraint yorum_tek_hedef check (num_nonnulls(haber_id, mac_id, gol_id) = 1);
create index if not exists yorumlar_gol on public.yorumlar (gol_id, created_at);

-- ---------------------------------------------------------------------
-- 4) Yorum yasağı (profiles.engelli)
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists engelli boolean not null default false;
comment on column public.profiles.engelli is 'Yönetici yorum yasağı koydu. Herkese kapalı sütun (012 sütun yetkileri); kişi kendisininkini engelli_mi() ile görür.';

-- Oturumdaki kişi yorum yazmaktan men edildi mi?
create or replace function public.engelli_mi()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.engelli from public.profiles p where p.id = auth.uid()), false);
$$;
revoke execute on function public.engelli_mi() from public;
grant execute on function public.engelli_mi() to anon, authenticated;

-- Yönetici için: yasaklı hesapların kimlikleri (moderasyon listesinde "Yasaklı" rozeti)
create or replace function public.engelli_kullanicilar()
returns setof uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Bu listeyi yalnızca yöneticiler görebilir.' using errcode = '42501';
  end if;
  return query select p.id from public.profiles p where p.engelli;
end;
$$;
revoke execute on function public.engelli_kullanicilar() from public, anon;
grant execute on function public.engelli_kullanicilar() to authenticated;

-- Profil koruma (012'dekinin yerine): + engelli bayrağını yalnız yönetici, başkası için değiştirir
create or replace function public.profil_koruma()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if new.id is distinct from old.id then
      raise exception 'Profil kimliği değiştirilemez.' using errcode = '42501';
    end if;
    if new.role is distinct from old.role
       and (new.id = auth.uid() or not public.is_admin()) then
      raise exception 'Rol değiştirme yetkiniz yok.' using errcode = '42501';
    end if;
    if new.engelli is distinct from old.engelli
       and (new.id = auth.uid() or not public.is_admin()) then
      raise exception 'Yorum yasağını yalnız yönetici değiştirebilir.' using errcode = '42501';
    end if;
    if new.kullanici_adi is distinct from old.kullanici_adi and public.kullanici_adi_ayrilmis(new.kullanici_adi) then
      raise exception 'Bu kullanıcı adı kullanılamaz: yönetici, resmî hesap ya da kulüp gibi görünen adlar ayrılmıştır.'
        using errcode = '22023';
    end if;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

-- Yorum ekleme politikası (012'dekinin yerine): + yasaklı hesap yazamaz
drop policy if exists yorum_ekleme on public.yorumlar;
create policy yorum_ekleme on public.yorumlar
  for insert to authenticated
  with check (
    kullanici_id = (select auth.uid())
    and (select public.eposta_onayli())
    and not (select public.engelli_mi())
    and (not gizli or (select public.is_admin()))
    and (haber_id is null or exists (
      select 1 from public.haberler h where h.id = yorumlar.haber_id and h.yayinda))
  );

-- Ekleme tetikleyicisi (012'dekinin yerine, sabitler aynı): + yasaklı hesaba Türkçe mesaj
create or replace function public.yorum_ekleme_kontrol()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  c_dakika_siniri constant int := 5;                            -- bir dakikada en fazla 5 yorum
  c_gun_siniri constant int := 50;                              -- son 24 saatte en fazla 50 yorum (hesap başına)
  c_tekrar_suresi constant interval := interval '10 minutes';   -- aynı metin bu süre içinde tekrar yazılamaz
  son_dakika int;
  son_gun int;
begin
  if current_user in ('anon', 'authenticated') then
    if auth.uid() is null then
      raise exception 'Yorum yazmak için giriş yapın.' using errcode = '42501';
    end if;
    new.kullanici_id := auth.uid();
    new.created_at := now();
    new.duzenlendi := null;
    if not public.eposta_onayli() then
      raise exception 'Yorum yazmak için e-posta adresinizi onaylayın: hesap açarken gelen e-postadaki bağlantıya tıklayın.'
        using errcode = '42501', hint = 'eposta_onayi';
    end if;
    if public.engelli_mi() then
      raise exception 'Hesabın yorum yazmaya kapatıldı (topluluk kuralları). İtiraz için sitedeki iletişim adresine yaz.'
        using errcode = '42501', hint = 'engelli';
    end if;
    if not public.is_admin() then
      new.gizli := false;
      perform pg_advisory_xact_lock(hashtext('yorum:' || new.kullanici_id::text));
      select count(*) filter (where y.created_at > now() - interval '1 minute'), count(*)
        into son_dakika, son_gun
        from public.yorumlar y
        where y.kullanici_id = new.kullanici_id
          and y.created_at > now() - interval '1 day';
      if son_dakika >= c_dakika_siniri then
        raise exception 'Çok hızlı yorum yazıyorsunuz. Lütfen bir dakika sonra tekrar deneyin.'
          using errcode = 'P0001', hint = 'oran_siniri';
      end if;
      if son_gun >= c_gun_siniri then
        raise exception 'Bir hesap günde en fazla 50 yorum yazabilir. Lütfen yarın tekrar deneyin.'
          using errcode = 'P0001', hint = 'gun_siniri';
      end if;
      if exists (select 1 from public.yorumlar y
                 where y.kullanici_id = new.kullanici_id
                   and y.created_at > now() - c_tekrar_suresi
                   and lower(regexp_replace(btrim(y.metin), '\s+', ' ', 'g'))
                       = lower(regexp_replace(btrim(new.metin), '\s+', ' ', 'g'))) then
        raise exception 'Bu yorumu az önce gönderdiniz. Aynı metni 10 dakika içinde tekrar gönderemezsiniz.'
          using errcode = 'P0001', hint = 'ayni_yorum';
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- Güncelleme tetikleyicisi (012'dekinin yerine, sabit aynı): + gol_id de değiştirilemez
create or replace function public.yorum_guncelleme_kontrol()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  c_duzenleme_suresi constant interval := interval '30 minutes';
begin
  if current_user in ('anon', 'authenticated') and not public.is_admin() then
    if new.kullanici_id is distinct from old.kullanici_id
       or new.haber_id is distinct from old.haber_id
       or new.mac_id is distinct from old.mac_id
       or new.gol_id is distinct from old.gol_id
       or new.gizli is distinct from old.gizli
       or new.created_at is distinct from old.created_at then
      raise exception 'Yorumda sadece metni değiştirebilirsiniz.' using errcode = '42501';
    end if;
    if new.metin is distinct from old.metin then
      if old.created_at < now() - c_duzenleme_suresi then
        raise exception 'Yorumlar yalnız yazıldıktan sonraki 30 dakika içinde düzenlenebilir.'
          using errcode = 'P0001', hint = 'duzenleme_suresi';
      end if;
      perform public.yorum_duzenleme_hakki();
    end if;
  end if;
  if current_user in ('anon', 'authenticated') then
    new.duzenlendi := case when new.metin is distinct from old.metin then now() else old.duzenlendi end;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 5) Yorum şikâyetleri
-- ---------------------------------------------------------------------
create table if not exists public.yorum_sikayetleri (
  id uuid primary key default gen_random_uuid(),
  yorum_id uuid not null references public.yorumlar (id) on delete cascade,
  sikayet_eden uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  neden text not null default 'diger' check (neden in ('hakaret', 'nefret', 'hedef_gosterme', 'spam', 'kisisel_veri', 'diger')),
  created_at timestamptz not null default now(),
  constraint yorum_sikayeti_tek unique (yorum_id, sikayet_eden)
);
comment on table public.yorum_sikayetleri is 'Taraftarın "Şikâyet et" kaydı: kişi başına yorum başına bir. Yalnız yönetici okur (şikâyet edenin kimliği yorumu yazana gösterilmez).';
create index if not exists yorum_sikayetleri_yorum on public.yorum_sikayetleri (yorum_id);

create or replace function public.sikayet_kontrol()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_sahip uuid;
begin
  if current_user in ('anon', 'authenticated') then
    if auth.uid() is null then
      raise exception 'Şikâyet için giriş yap.' using errcode = '42501';
    end if;
    new.sikayet_eden := auth.uid();
    new.created_at := now();
    -- Kişinin görebildiği yorum olmalı (tetikleyici çağıranın yetkisiyle çalışır: yorumlar RLS'i uygulanır)
    select y.kullanici_id into v_sahip from public.yorumlar y where y.id = new.yorum_id;
    if not found then
      raise exception 'Yorum bulunamadı.' using errcode = '22023';
    end if;
    if v_sahip = auth.uid() then
      raise exception 'Kendi yorumunu şikâyet edemezsin; istersen silebilirsin.' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists sikayet_kontrol on public.yorum_sikayetleri;
create trigger sikayet_kontrol before insert on public.yorum_sikayetleri
  for each row execute function public.sikayet_kontrol();

alter table public.yorum_sikayetleri enable row level security;
drop policy if exists sikayet_ekleme on public.yorum_sikayetleri;
create policy sikayet_ekleme on public.yorum_sikayetleri for insert to authenticated
  with check (sikayet_eden = (select auth.uid()) and (select public.eposta_onayli()));
drop policy if exists sikayet_okuma on public.yorum_sikayetleri;
create policy sikayet_okuma on public.yorum_sikayetleri for select to authenticated using ((select public.is_admin()));
drop policy if exists sikayet_silme on public.yorum_sikayetleri;
create policy sikayet_silme on public.yorum_sikayetleri for delete to authenticated using ((select public.is_admin()));
-- güncelleme politikası yok

-- ---------------------------------------------------------------------
-- 6) Takım: oyuncular ve sakatlık güncellemeleri
-- ---------------------------------------------------------------------
create table if not exists public.oyuncular (
  id uuid primary key default gen_random_uuid(),
  ad text not null check (char_length(btrim(ad)) between 2 and 80),
  forma_no smallint check (forma_no between 1 and 99),
  mevki text not null check (mevki in ('kaleci', 'defans', 'orta_saha', 'forvet')),
  foto_url text constraint oyuncular_foto_kaynagi check (public.haber_kapak_gecerli(foto_url)),
  aktif boolean not null default true,
  sira integer not null default 0 check (sira between 0 and 999),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.oyuncular is 'Kadro. Fotoğraf yalnız hakkı varsa (kulübün verdiği basın görseli + izin) ve yalnız sitenin deposundan.';
create index if not exists oyuncular_kadro on public.oyuncular (mevki, sira, forma_no);
drop trigger if exists oyuncular_guncellendi on public.oyuncular;
create trigger oyuncular_guncellendi before update on public.oyuncular
  for each row execute function public.guncellendi();

alter table public.oyuncular enable row level security;
drop policy if exists oyuncu_okuma on public.oyuncular;
create policy oyuncu_okuma on public.oyuncular for select using (aktif or (select public.is_admin()));
drop policy if exists oyuncu_ekleme on public.oyuncular;
create policy oyuncu_ekleme on public.oyuncular for insert to authenticated with check ((select public.is_admin()));
drop policy if exists oyuncu_guncelleme on public.oyuncular;
create policy oyuncu_guncelleme on public.oyuncular for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists oyuncu_silme on public.oyuncular;
create policy oyuncu_silme on public.oyuncular for delete to authenticated using ((select public.is_admin()));

create table if not exists public.sakatliklar (
  id uuid primary key default gen_random_uuid(),
  oyuncu_id uuid not null references public.oyuncular (id) on delete cascade,
  durum text not null check (durum in ('sakat', 'cezali', 'belirsiz', 'dondu')),
  aciklama text check (aciklama is null or char_length(aciklama) <= 200),
  kaynak text not null check (char_length(btrim(kaynak)) between 3 and 120),
  kaynak_url text check (kaynak_url is null or (kaynak_url ~* '^https://[a-z0-9.-]+\.[a-z]{2,63}(/[^[:space:]"<>]*)?$' and length(kaynak_url) <= 500)),
  beklenen_donus date,
  guncellendi timestamptz not null default now(),
  yayinda boolean not null default false,
  created_at timestamptz not null default now()
);
comment on table public.sakatliklar is 'Sakatlık / ceza güncellemeleri. Sağlık verisi (KVKK m.6): YALNIZ kulübün resmî açıklamasındaki bilgi, kaynak zorunlu, söylenti yok. Ziyaretçi yalnız yayinda=true olanı görür.';
create index if not exists sakatliklar_liste on public.sakatliklar (yayinda, guncellendi desc);

create or replace function public.sakatlik_guncellendi()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.kaynak := btrim(new.kaynak);
  new.guncellendi := now();
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  return new;
end;
$$;
drop trigger if exists sakatlik_guncellendi on public.sakatliklar;
create trigger sakatlik_guncellendi before insert or update on public.sakatliklar
  for each row execute function public.sakatlik_guncellendi();

alter table public.sakatliklar enable row level security;
drop policy if exists sakatlik_okuma on public.sakatliklar;
create policy sakatlik_okuma on public.sakatliklar for select using (yayinda or (select public.is_admin()));
drop policy if exists sakatlik_ekleme on public.sakatliklar;
create policy sakatlik_ekleme on public.sakatliklar for insert to authenticated with check ((select public.is_admin()));
drop policy if exists sakatlik_guncelleme on public.sakatliklar;
create policy sakatlik_guncelleme on public.sakatliklar for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists sakatlik_silme on public.sakatliklar;
create policy sakatlik_silme on public.sakatliklar for delete to authenticated using ((select public.is_admin()));

-- ---------------------------------------------------------------------
-- 7) Reklamlar
-- ---------------------------------------------------------------------
alter table public.reklamlar add column if not exists dugme_metni text;
alter table public.reklamlar add column if not exists telefon text;
alter table public.reklamlar add column if not exists gorsel_metni text;
alter table public.reklamlar add column if not exists gorsel_kucuk_url text;
alter table public.reklamlar add column if not exists sektor_onayi boolean not null default false;
comment on column public.reklamlar.dugme_metni is 'Düğme yazısı (boşsa "Ayrıntılar" / WhatsApp için "WhatsApp''tan yaz"). En fazla 24 karakter.';
comment on column public.reklamlar.telefon is 'İsteğe bağlı ikinci düğme "Ara" (tel:). Biçim +90XXXXXXXXXX.';
comment on column public.reklamlar.gorsel_metni is 'Görseldeki yazı / görsel açıklaması: ekran okuyucu için alt metin. Boşsa görsel süs sayılır (alt="").';
comment on column public.reklamlar.gorsel_kucuk_url is 'Aynı görselin küçük kopyası (yatay 480 px / kare 192 px): kart srcset ile bunu seçer.';
comment on column public.reklamlar.sektor_onayi is 'Yönetici yayına almadan önce yasaklı sektör listesini (bahis, alkol, tütün/nargile, kulüp sponsorlarıyla çakışan marka; açılış sayfası dahil) kontrol ettiğini onayladı.';
alter table public.reklamlar drop constraint if exists reklamlar_dugme_metni;
alter table public.reklamlar add constraint reklamlar_dugme_metni check (dugme_metni is null or char_length(btrim(dugme_metni)) between 2 and 24);
alter table public.reklamlar drop constraint if exists reklamlar_telefon;
alter table public.reklamlar add constraint reklamlar_telefon check (telefon is null or telefon ~ '^\+90[2-5][0-9]{9}$');
alter table public.reklamlar drop constraint if exists reklamlar_gorsel_metni;
alter table public.reklamlar add constraint reklamlar_gorsel_metni check (gorsel_metni is null or char_length(gorsel_metni) <= 200);
alter table public.reklamlar drop constraint if exists reklamlar_gorsel_kucuk;
alter table public.reklamlar add constraint reklamlar_gorsel_kucuk check (gorsel_kucuk_url is null or public.reklam_gorsel_gecerli(gorsel_kucuk_url));

-- aktif_reklam: 010'daki seçim kuralı aynen + yeni görüntü sütunları
drop function if exists public.aktif_reklam(text, text);
create function public.aktif_reklam(p_alan text, p_mac_id text default null)
returns table (
  id uuid, firma_adi text, gorsel_url text, kisa_metin text, baglanti_url text,
  alan text, mac_id uuid, dugme_metni text, telefon text, gorsel_metni text, gorsel_kucuk_url text
)
language sql stable security definer set search_path = ''
as $$
  select r.id, r.firma_adi, r.gorsel_url, r.kisa_metin, r.baglanti_url, r.alan::text, r.mac_id,
         r.dugme_metni, r.telefon, r.gorsel_metni, r.gorsel_kucuk_url
  from public.reklamlar r
  where r.durum = 'yayinda'
    and r.baslangic <= now() and now() < r.bitis
    and r.alan::text = p_alan
    and (r.alan <> 'mac_sponsoru' or r.mac_id is null or r.mac_id = public.reklam_mac_uuid(p_mac_id))
  order by (r.mac_id is not null and r.mac_id = public.reklam_mac_uuid(p_mac_id)) desc,
           r.oncelik desc,
           r.yayina_alinma desc nulls last,
           r.created_at desc,
           r.id
  limit 1
$$;
revoke execute on function public.aktif_reklam(text, text) from public;
grant execute on function public.aktif_reklam(text, text) to anon, authenticated;

-- aktif_reklamlar: akışta birden çok sponsor kartı için, AYNI FİRMA BİR KEZ (firma adı büyük/küçük harf ve boşluk
-- farkı gözetmeden), aktif_reklam ile aynı sırayla en fazla p_adet (1-5) reklam. Akışta 3. haberden sonra 1., sonra
-- en sık 8 haberde bir sıradaki gelir; farklı firma yoksa ikinci yuva hiç açılmaz.
drop function if exists public.aktif_reklamlar(text, integer);
create function public.aktif_reklamlar(p_alan text, p_adet integer default 3)
returns table (
  id uuid, firma_adi text, gorsel_url text, kisa_metin text, baglanti_url text,
  alan text, mac_id uuid, dugme_metni text, telefon text, gorsel_metni text, gorsel_kucuk_url text
)
language sql stable security definer set search_path = ''
as $$
  with aday as (
    select r.*, row_number() over (partition by lower(btrim(r.firma_adi))
                                   order by r.oncelik desc, r.yayina_alinma desc nulls last, r.created_at desc, r.id) as sira
    from public.reklamlar r
    where r.durum = 'yayinda'
      and r.baslangic <= now() and now() < r.bitis
      and r.alan::text = p_alan
      and r.alan <> 'mac_sponsoru'
  )
  select a.id, a.firma_adi, a.gorsel_url, a.kisa_metin, a.baglanti_url, a.alan::text, a.mac_id,
         a.dugme_metni, a.telefon, a.gorsel_metni, a.gorsel_kucuk_url
  from aday a
  where a.sira = 1
  order by a.oncelik desc, a.yayina_alinma desc nulls last, a.created_at desc, a.id
  limit greatest(1, least(coalesce(p_adet, 3), 5))
$$;
revoke execute on function public.aktif_reklamlar(text, integer) from public;
grant execute on function public.aktif_reklamlar(text, integer) to anon, authenticated;

-- reklam_olay_kaydet: 012'deki kurallar aynen + yöneticinin bakışları sayılmaz ('yonetici' döner, hiçbir şey yazılmaz).
-- Döner: 'kaydedildi' | 'tekrar' | 'sinir' | 'yonetici'
create or replace function public.reklam_olay_kaydet(
  p_reklam_id uuid, p_tur text, p_sayfa_ziyaret_id uuid, p_alan text, p_mac_id text default null,
  p_sekme_id uuid default null
)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  c_tiklama_siniri constant int := 5;                          -- bir sayfa ziyaretinde en fazla 5 tıklama (tüm reklamlar toplamı)
  c_tiklama_tekrar constant interval := interval '30 minutes'; -- aynı sekmede aynı reklama bu süre içindeki tekrar tıklama sayılmaz
  c_gosterim_dakika_siniri constant int := 120;                -- bir reklama dakikada en fazla 120 gösterim (bütün ziyaretçiler)
  c_tiklama_dakika_siniri constant int := 30;                  -- bir reklama dakikada en fazla 30 tıklama (bütün ziyaretçiler)
  v_r public.reklamlar%rowtype;
  v_mac uuid := public.reklam_mac_uuid(p_mac_id);
  v_sayi int;
  v_dakika timestamptz := date_trunc('minute', now());
begin
  if p_reklam_id is null or p_sayfa_ziyaret_id is null then
    raise exception 'Eksik bilgi.' using errcode = '22023';
  end if;
  if p_tur is null or p_tur not in ('gosterim', 'tiklama') then
    raise exception 'Geçersiz olay türü.' using errcode = '22023';
  end if;

  select * into v_r from public.reklamlar where id = p_reklam_id;
  if not found
     or v_r.durum <> 'yayinda'
     or not (v_r.baslangic <= now() and now() < v_r.bitis) then
    raise exception 'Reklam şu an yayında değil.' using errcode = '22023';
  end if;
  if v_r.alan::text is distinct from p_alan then
    raise exception 'Reklam bu alanda gösterilmiyor.' using errcode = '22023';
  end if;
  if v_r.alan = 'mac_sponsoru' then
    if v_r.mac_id is not null and v_r.mac_id is distinct from v_mac then
      raise exception 'Reklam bu maçta gösterilmiyor.' using errcode = '22023';
    end if;
  else
    v_mac := null;
  end if;

  -- 013: yönetici (önizleme, kontrol, her gün akışa bakan Mert) sayılmaz: rapor yalnız ziyaretçiyi gösterir
  if public.is_admin() then
    return 'yonetici';
  end if;

  if p_tur = 'tiklama' then
    if p_sekme_id is not null then
      perform pg_advisory_xact_lock(hashtextextended('reklam-sekme:' || p_sekme_id::text, 0));
    end if;
    perform pg_advisory_xact_lock(hashtextextended(p_sayfa_ziyaret_id::text, 0));
    select count(*) into v_sayi from public.reklam_olaylari
      where sayfa_ziyaret_id = p_sayfa_ziyaret_id and tur = 'tiklama';
    if exists (select 1 from public.reklam_olaylari e
               where e.tur = 'tiklama' and e.reklam_id = p_reklam_id
                 and e.created_at > now() - c_tiklama_tekrar
                 and (e.sayfa_ziyaret_id = p_sayfa_ziyaret_id
                      or (p_sekme_id is not null and e.sekme_id = p_sekme_id))) then
      return 'tekrar';
    end if;
    if v_sayi >= c_tiklama_siniri then return 'sinir'; end if;
  elsif exists (select 1 from public.reklam_olaylari e
                where e.reklam_id = p_reklam_id and e.tur = 'gosterim' and e.sayfa_ziyaret_id = p_sayfa_ziyaret_id) then
    return 'tekrar';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('reklam-dakika:' || p_reklam_id::text || ':' || p_tur, 0));
  select count(*) into v_sayi from public.reklam_olaylari e
    where e.created_at >= v_dakika and e.reklam_id = p_reklam_id and e.tur = p_tur::public.reklam_olay_turu;
  if v_sayi >= (case when p_tur = 'tiklama' then c_tiklama_dakika_siniri else c_gosterim_dakika_siniri end) then
    insert into public.reklam_sinir_dakikalari as d (reklam_id, dakika, tur)
    values (p_reklam_id, v_dakika, p_tur::public.reklam_olay_turu)
    on conflict (reklam_id, dakika, tur) do update set reddedilen = d.reddedilen + 1;
    return 'sinir';
  end if;

  if p_tur = 'tiklama' then
    insert into public.reklam_olaylari (reklam_id, tur, sayfa_ziyaret_id, alan, mac_id, sekme_id)
    values (p_reklam_id, 'tiklama', p_sayfa_ziyaret_id, v_r.alan, v_mac, p_sekme_id);
    return 'kaydedildi';
  end if;

  insert into public.reklam_olaylari (reklam_id, tur, sayfa_ziyaret_id, alan, mac_id)
  values (p_reklam_id, 'gosterim', p_sayfa_ziyaret_id, v_r.alan, v_mac)
  on conflict (reklam_id, tur, sayfa_ziyaret_id) where tur = 'gosterim' do nothing;
  if not found then return 'tekrar'; end if;
  return 'kaydedildi';
end $$;
revoke execute on function public.reklam_olay_kaydet(uuid, text, uuid, text, text, uuid) from public;
grant execute on function public.reklam_olay_kaydet(uuid, text, uuid, text, text, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 8) Ayrılmış kullanıcı adları (012'deki listeye ek). assets/kurallar.js kullaniciAdiAyrilmis ile AYNI liste.
-- İçinde geçmesi yeten kökler: admin, yonetici, yonetim, moderator, resmi, corumfk, corumspor, kulup, yetkili, baskan, teknikdirektor
-- Tam eşleşmesi gerekenler: destek, mod, sistem, corumsportaraftar, support, official, root, kaptan, antrenor
-- ---------------------------------------------------------------------
create or replace function public.kullanici_adi_ayrilmis(p_ad text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := lower(translate(coalesce(p_ad, ''), 'ÇĞİIÖŞÜÂÎÛçğıöşüâîû', 'cgiiosuaiucgiosuaiu'));
begin
  v := regexp_replace(v, '[^a-z]', '', 'g');
  return v ~ '(admin|yonetici|yonetim|moderator|resmi|corumfk|corumspor|kulup|yetkili|baskan|teknikdirektor)'
      or v in ('destek', 'mod', 'sistem', 'corumsportaraftar', 'support', 'official', 'root', 'kaptan', 'antrenor');
end;
$$;

-- ---------------------------------------------------------------------
-- Yetkiler (Supabase bunları zaten verir; düz Postgres'te de çalışsın diye açıkça). Asıl koruma RLS.
-- ---------------------------------------------------------------------
grant select on public.oyuncular, public.sakatliklar to anon, authenticated;
grant insert, update, delete on public.oyuncular, public.sakatliklar to authenticated;
grant insert, select, delete on public.yorum_sikayetleri to authenticated;
revoke truncate on public.oyuncular, public.sakatliklar, public.yorum_sikayetleri from anon, authenticated;
revoke update on public.yorum_sikayetleri from anon, authenticated;


-- ===================== 014_inceleme_2.sql =====================
-- =====================================================================
-- Çorum Taraftar: 2. tur inceleme düzeltmeleri (014) — sunucu tarafı
-- Sıra: 001 → 002 → 010 → 011 → 012 → 013 → 014. Tekrar çalıştırılabilir (if not exists / create or replace / drop if exists).
-- DİKKAT: 010, 012 ya da 013'ü sonradan YENİDEN çalıştırırsanız aşağıdaki fonksiyonlar onların hâline döner
-- (reklam_olay_kaydet, reklam_raporu, aktif_reklamlar, kullanici_adi_ayrilmis, yorum_guncelleme_kontrol, sikayet_kontrol);
-- ardından bu dosyayı da yeniden çalıştırın. Hangi sürümün kurulu olduğunu testler denetler (her gövdede "sürüm 014" işareti).
--
--  1) Ortak metin katlama: metin_katla() (Türkçe küçük harf + ı/i, ç/c … aynı) = assets/kurallar.js metinKatla;
--     reklamlar.firma_anahtar (firma adı anahtarı: katlanmış, boşluklar tek) akış, rapor ve CSV aynı firmayı aynı sayar
--  2) Yasaklı sektör onayı SUNUCUDA: sektor_onayi olmadan 'yayinda' olamaz; firma, bağlantı, telefon, görsel ya da metin
--     değişirse onay sıfırlanır (yeniden onay = sektor_onay_zamani'nı değiştirerek, panel yapar)
--  3) Reklam sayımı sertleşti (IP tutulmadan): reklam başına dakikada 30 gösterim / 6 tıklama; sekme başına saatlik sınır;
--     yalnız o an o alanda GÖSTERİLEN reklama olay; tıklama eylemi (web / whatsapp / ara), tekrar kuralı reklam + eylem;
--     "yerlesim" (kartın sayfaya konduğu sayfa açılışı) = görünürlük oranının paydası; sınıra takılan her olay supheli_dakika'da
--  4) Günlük toplam (reklam_gunluk: TSİ günü × reklam × alan × tür × eylem) + 90 günden eski ham olayların silinmesi
--     (reklam_bakim, pg_cron varsa her gece); raporlar toplanmış günleri toplamdan, bugünü ve toplanmamış günleri ham olaydan okur.
--     reklam_raporu: + firma_anahtar, eylem kırılımı, yerleşim/görünürlük, yayın başlangıç/bitiş/gün, dönem (yayınla kesişen kısım);
--     reklam_gunluk_raporu: gün gün (maç günü işaretli)
--  5) Yorum: yasaklı hesap yorumunu DÜZENLEYEMEZ ve ŞİKÂYET EDEMEZ; moderasyon: farklı 3 hesaptan şikâyet alan yorum kendiliğinden
--     gizlenir; yöneticinin kelime listesine takılan yorum ve maç başına "ön onay" penceresindeki (maçtan 2 saat önce → 24 saat
--     sonra) yorum 'onay bekliyor' durumuna düşer (yalnız yazan ve yönetici görür)
--  6) Ayrılmış kullanıcı adları: rakam/simge benzerleri (0→o, 1→i/l, 3→e, 4→a, 5→s, 7→t, @→a) + "kirmizisimsek"
--  7) Haber: kaynak, kaynak_url, duzeltme_notu (+ duzeltme_tarihi), kapak_alt. Gol: video_kaynak (videolu golde zorunlu),
--     .mp4 yalnız sitenin deposundan (gol-videolari kovası), altyazi_url (.vtt, aynı kova). Maç: mac_notu, on_onay.
--  8) Sakatlık: Sakat / Durumu belirsiz kaydında kaynak bağlantısı zorunlu, kaynak_tarihi; serbest açıklama (aciklama) yalnız
--     yöneticiye açık (ziyaretçi ve üyeler sütunu okuyamaz; yönetici sakatliklar_yonetim() ile okur)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Ortak metin katlama ve firma anahtarı (assets/kurallar.js metinKatla / assets/reklam/reklam-mantik.js firmaAnahtari ile AYNI)
-- ---------------------------------------------------------------------
-- Veritabanının yerel ayarından bağımsız: lower() kullanılmaz (C yerelinde Ç, İ küçülmez), harfler açıkça çevrilir.
create or replace function public.metin_katla(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select translate(coalesce(p, ''),
    'ABCDEFGHIJKLMNOPQRSTUVWXYZÇĞİÖŞÜÂÎÛçğıöşüâîû',
    'abcdefghijklmnopqrstuvwxyzcgiosuaiucgiosuaiu')
$$;
comment on function public.metin_katla(text) is 'Türkçe duyarlı küçük harf + katlama: İ/I/ı/i → i, Ç → c, Ğ → g, Ö → o, Ş → s, Ü → u, Â/Î/Û → a/i/u. JS: assets/kurallar.js metinKatla.';

create or replace function public.firma_anahtari(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(regexp_replace(public.metin_katla(p), '[ \t\n\r\f\v]+', ' ', 'g'))
$$;
comment on function public.firma_anahtari(text) is 'Firma adının ortak anahtarı (akış, rapor, CSV): katlanmış, baş/son boşluk yok, art arda boşluk tek. JS: reklam-mantik.js firmaAnahtari.';

alter table public.reklamlar add column if not exists firma_anahtar text generated always as (public.firma_anahtari(firma_adi)) stored;
create index if not exists reklamlar_firma_anahtar on public.reklamlar (firma_anahtar);

-- ---------------------------------------------------------------------
-- 2) Yasaklı sektör onayı sunucuda
-- ---------------------------------------------------------------------
alter table public.reklamlar add column if not exists sektor_onay_zamani timestamptz;
comment on column public.reklamlar.sektor_onay_zamani is 'Yasaklı sektör listesinin onaylandığı an (sunucu yazar). İçerik değişince onay sıfırlanır; panel yeniden onayda bu alanı değiştirir.';

create or replace function public.reklamlar_sektor()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_icerik_degisti boolean;
  v_yeniden_onay boolean;
begin
  -- sürüm 014
  if tg_op = 'INSERT' then
    new.sektor_onay_zamani := case when new.sektor_onayi then now() end;
  else
    -- (NEW.firma_anahtar burada henüz hesaplanmamıştır: üretilen sütun tetikleyiciden sonra yazılır)
    v_icerik_degisti := public.firma_anahtari(new.firma_adi) is distinct from public.firma_anahtari(old.firma_adi)
      or new.baglanti_url is distinct from old.baglanti_url
      or new.telefon is distinct from old.telefon
      or new.gorsel_url is distinct from old.gorsel_url
      or new.gorsel_kucuk_url is distinct from old.gorsel_kucuk_url
      or new.kisa_metin is distinct from old.kisa_metin;
    v_yeniden_onay := new.sektor_onayi
      and (not old.sektor_onayi or new.sektor_onay_zamani is distinct from old.sektor_onay_zamani);
    if v_yeniden_onay then
      new.sektor_onay_zamani := now();
    elsif v_icerik_degisti then
      new.sektor_onayi := false;
    end if;
    if not new.sektor_onayi then new.sektor_onay_zamani := null; end if;
    if new.sektor_onayi and not v_yeniden_onay then new.sektor_onay_zamani := old.sektor_onay_zamani; end if;
  end if;
  if new.durum = 'yayinda' and not new.sektor_onayi then
    raise exception 'Yayına almadan önce yasaklı sektör listesini onaylayın (firma, bağlantı, telefon, görsel ya da metin değiştiyse yeniden).'
      using errcode = '22023', hint = 'sektor_onayi';
  end if;
  return new;
end;
$$;
-- reklamlar_dogrula'dan SONRA çalışsın (tetikleyiciler ada göre sırayla: reklamlar_dogrula < reklamlar_sektor)
drop trigger if exists reklamlar_sektor on public.reklamlar;
create trigger reklamlar_sektor before insert or update on public.reklamlar
  for each row execute function public.reklamlar_sektor();

-- Kısıt da (Türkçe mesaj tetikleyiciden gelir). Eski kayıtlarda onaysız yayındaki reklam varsa NOT VALID kalır (yeni yazımlar denetlenir).
alter table public.reklamlar drop constraint if exists reklamlar_yayin_sektor;
alter table public.reklamlar add constraint reklamlar_yayin_sektor check (durum <> 'yayinda' or sektor_onayi) not valid;
do $$
begin
  if exists (select 1 from public.reklamlar where durum = 'yayinda' and not sektor_onayi) then
    raise notice '014: yasaklı sektör onayı olmadan yayında reklam var; panelden "Düzenle" ile onaylayın (kısıt yeni yazımlarda geçerli).';
  else
    alter table public.reklamlar validate constraint reklamlar_yayin_sektor;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 3) Reklam olayları: eylem, yerleşim, sekme sayaçları
-- ---------------------------------------------------------------------
alter table public.reklam_olaylari add column if not exists eylem text;
alter table public.reklam_olaylari drop constraint if exists reklam_olaylari_eylem;
alter table public.reklam_olaylari add constraint reklam_olaylari_eylem
  check (eylem is null or (tur = 'tiklama' and eylem in ('web', 'whatsapp', 'ara')));
comment on column public.reklam_olaylari.eylem is 'Yalnız tıklamada: hangi düğme (web sitesi, WhatsApp, "Ara"). Eski kayıtlarda boş.';

-- Yerleşim: reklam kartı sayfaya kondu (görünse de görünmese de), sayfa ziyareti başına reklam başına bir.
-- Görünürlük oranı = gösterim ÷ yerleşim. Kişisel veri yok (rastgele sayfa ziyareti kimliği).
create table if not exists public.reklam_yerlesimleri (
  id                bigint generated always as identity primary key,
  reklam_id         uuid not null references public.reklamlar (id) on delete cascade,
  sayfa_ziyaret_id  uuid not null,
  alan              public.reklam_alani not null,
  mac_id            uuid,
  created_at        timestamptz not null default now(),
  constraint reklam_yerlesimleri_tekil unique (reklam_id, sayfa_ziyaret_id)
);
comment on table public.reklam_yerlesimleri is 'Reklam kartının sayfaya konduğu sayfa açılışları (görünürlük oranının paydası). Kişisel veri yok. 90 gün sonra günlük toplama katlanıp silinir.';
create index if not exists reklam_yerlesimleri_zaman on public.reklam_yerlesimleri (created_at, reklam_id);
alter table public.reklam_yerlesimleri enable row level security;
drop policy if exists "yonetici yerlesimleri okur" on public.reklam_yerlesimleri;
create policy "yonetici yerlesimleri okur" on public.reklam_yerlesimleri for select to authenticated using ((select public.is_admin()));
revoke insert, update, delete, truncate on public.reklam_yerlesimleri from anon, authenticated;

-- Sekme sayaçları: sekme başına saatlik sınır için. Satırlar 2 saatten sonra silinir; olaylara bağlanmaz.
create table if not exists public.reklam_sekme_sayaclari (
  sekme_id   uuid not null,
  reklam_id  uuid not null references public.reklamlar (id) on delete cascade,
  tur        public.reklam_olay_turu not null,
  saat       timestamptz not null,   -- saatin başı
  sayi       integer not null default 1 check (sayi > 0),
  primary key (sekme_id, reklam_id, tur, saat)
);
comment on table public.reklam_sekme_sayaclari is 'Sekme başına saatlik gösterim/tıklama sayısı (yalnız sınır için; en çok 2 saat tutulur). Kimse okuyamaz.';
create index if not exists reklam_sekme_sayaclari_saat on public.reklam_sekme_sayaclari (saat);
alter table public.reklam_sekme_sayaclari enable row level security;
revoke all on public.reklam_sekme_sayaclari from anon, authenticated;

-- aktif_reklamlar (013'ün yerine, dönüş tipi aynı): aynı firma = aynı firma_anahtar
create or replace function public.aktif_reklamlar(p_alan text, p_adet integer default 3)
returns table (
  id uuid, firma_adi text, gorsel_url text, kisa_metin text, baglanti_url text,
  alan text, mac_id uuid, dugme_metni text, telefon text, gorsel_metni text, gorsel_kucuk_url text
)
language sql stable security definer set search_path = ''
as $$
  -- sürüm 014: firma_anahtar ile
  with aday as (
    select r.*, row_number() over (partition by r.firma_anahtar
                                   order by r.oncelik desc, r.yayina_alinma desc nulls last, r.created_at desc, r.id) as sira
    from public.reklamlar r
    where r.durum = 'yayinda'
      and r.baslangic <= now() and now() < r.bitis
      and r.alan::text = p_alan
      and r.alan <> 'mac_sponsoru'
  )
  select a.id, a.firma_adi, a.gorsel_url, a.kisa_metin, a.baglanti_url, a.alan::text, a.mac_id,
         a.dugme_metni, a.telefon, a.gorsel_metni, a.gorsel_kucuk_url
  from aday a
  where a.sira = 1
  order by a.oncelik desc, a.yayina_alinma desc nulls last, a.created_at desc, a.id
  limit greatest(1, least(coalesce(p_adet, 3), 5))
$$;
revoke execute on function public.aktif_reklamlar(text, integer) from public;
grant execute on function public.aktif_reklamlar(text, integer) to anon, authenticated;

-- Reklam şu an bu alanda GÖSTERİLİYOR mu (sırada bekleyen reklama olay yazılmaz)?
-- ana_akis: akıştaki en fazla 3 farklı firma (aktif_reklamlar(…, 3)); öteki alanlar: aktif_reklam kazananı.
create or replace function public.reklam_su_an_gosterilen(p_reklam_id uuid, p_alan text, p_mac_id text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select case when p_alan = 'ana_akis'
    then exists (select 1 from public.aktif_reklamlar(p_alan, 3) a where a.id = p_reklam_id)
    else exists (select 1 from public.aktif_reklam(p_alan, p_mac_id) a where a.id = p_reklam_id)
  end
$$;
revoke execute on function public.reklam_su_an_gosterilen(uuid, text, text) from public, anon, authenticated;

-- reklam_olay_kaydet (013'ün yerine): tek yazma kapısı.
-- p_tur: 'gosterim' | 'tiklama' | 'yerlesim'; p_eylem (yalnız tıklama): 'web' | 'whatsapp' | 'ara'
-- p_sekme_id: sekmeye özel rastgele kimlik (sessionStorage); gelmezse sayfa ziyareti kimliği kullanılır.
-- Döner: 'kaydedildi' | 'tekrar' | 'sinir' | 'yonetici'. Hata: reklam yayında değil / bu alanda gösterilmiyor / bilgi eksik.
drop function if exists public.reklam_olay_kaydet(uuid, text, uuid, text, text, uuid);
create or replace function public.reklam_olay_kaydet(
  p_reklam_id uuid, p_tur text, p_sayfa_ziyaret_id uuid, p_alan text, p_mac_id text default null,
  p_sekme_id uuid default null, p_eylem text default null
)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  -- sürüm 014 (reklam-mantik.js SINIRLAR ile aynı; test karşılaştırır)
  c_tiklama_siniri constant int := 5;                          -- bir sayfa ziyaretinde en fazla 5 tıklama (tüm reklamlar toplamı)
  c_tiklama_tekrar constant interval := interval '30 minutes'; -- aynı sekmede aynı reklamın aynı düğmesine bu sürede tekrar tıklama sayılmaz
  c_gosterim_dakika_siniri constant int := 30;                 -- bir reklama dakikada en fazla 30 gösterim (bütün ziyaretçiler)
  c_tiklama_dakika_siniri constant int := 6;                   -- bir reklama dakikada en fazla 6 tıklama (bütün ziyaretçiler)
  c_yerlesim_dakika_siniri constant int := 60;                 -- bir reklama dakikada en fazla 60 yerleşim (sayfa açılışı)
  c_sekme_saat_gosterim constant int := 20;                    -- bir sekmede bir reklama saatte en fazla 20 gösterim
  c_sekme_saat_tiklama constant int := 10;                     -- bir sekmede saatte en fazla 10 tıklama (tüm reklamlar)
  v_r public.reklamlar%rowtype;
  v_mac uuid := public.reklam_mac_uuid(p_mac_id);
  v_sekme uuid := coalesce(p_sekme_id, p_sayfa_ziyaret_id);
  v_sayi int;
  v_dakika timestamptz := date_trunc('minute', now());
  v_saat timestamptz := date_trunc('hour', now());
  v_eylem text := nullif(btrim(coalesce(p_eylem, '')), '');
begin
  if p_reklam_id is null or p_sayfa_ziyaret_id is null then
    raise exception 'Eksik bilgi.' using errcode = '22023';
  end if;
  if p_tur is null or p_tur not in ('gosterim', 'tiklama', 'yerlesim') then
    raise exception 'Geçersiz olay türü.' using errcode = '22023';
  end if;
  if p_tur <> 'tiklama' then
    v_eylem := null;
  elsif v_eylem is not null and v_eylem not in ('web', 'whatsapp', 'ara') then
    raise exception 'Geçersiz tıklama eylemi.' using errcode = '22023';
  end if;

  select * into v_r from public.reklamlar where id = p_reklam_id;
  if not found
     or v_r.durum <> 'yayinda'
     or not (v_r.baslangic <= now() and now() < v_r.bitis) then
    raise exception 'Reklam şu an yayında değil.' using errcode = '22023';
  end if;
  if v_r.alan::text is distinct from p_alan then
    raise exception 'Reklam bu alanda gösterilmiyor.' using errcode = '22023';
  end if;
  if v_r.alan = 'mac_sponsoru' then
    if v_r.mac_id is not null and v_r.mac_id is distinct from v_mac then
      raise exception 'Reklam bu maçta gösterilmiyor.' using errcode = '22023';
    end if;
  else
    v_mac := null;
  end if;
  -- Sırada bekleyen (o an kazanmayan) reklama olay yazılmaz
  if not public.reklam_su_an_gosterilen(p_reklam_id, p_alan, p_mac_id) then
    raise exception 'Reklam şu an bu alanda gösterilmiyor (sırada bekliyor).' using errcode = '22023';
  end if;

  -- 013: yönetici (önizleme, kontrol) sayılmaz
  if public.is_admin() then
    return 'yonetici';
  end if;

  -- Yerleşim (görünürlük oranının paydası): sayfa ziyareti başına bir, reklam başına dakika sınırı (fazlası sayılmaz)
  if p_tur = 'yerlesim' then
    if exists (select 1 from public.reklam_yerlesimleri y where y.reklam_id = p_reklam_id and y.sayfa_ziyaret_id = p_sayfa_ziyaret_id) then
      return 'tekrar';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('reklam-dakika:' || p_reklam_id::text || ':yerlesim', 0));
    select count(*) into v_sayi from public.reklam_yerlesimleri y where y.created_at >= v_dakika and y.reklam_id = p_reklam_id;
    if v_sayi >= c_yerlesim_dakika_siniri then return 'sinir'; end if;
    insert into public.reklam_yerlesimleri (reklam_id, sayfa_ziyaret_id, alan, mac_id)
    values (p_reklam_id, p_sayfa_ziyaret_id, v_r.alan, v_mac)
    on conflict (reklam_id, sayfa_ziyaret_id) do nothing;
    if not found then return 'tekrar'; end if;
    return 'kaydedildi';
  end if;

  if p_tur = 'tiklama' then
    -- kilit sırası hep: sekme, ziyaret, reklam
    perform pg_advisory_xact_lock(hashtextextended('reklam-sekme:' || v_sekme::text, 0));
    perform pg_advisory_xact_lock(hashtextextended(p_sayfa_ziyaret_id::text, 0));
    if exists (select 1 from public.reklam_olaylari e
               where e.tur = 'tiklama' and e.reklam_id = p_reklam_id
                 and e.eylem is not distinct from v_eylem
                 and e.created_at > now() - c_tiklama_tekrar
                 and (e.sayfa_ziyaret_id = p_sayfa_ziyaret_id
                      or (p_sekme_id is not null and e.sekme_id = p_sekme_id))) then
      return 'tekrar';
    end if;
    select count(*) into v_sayi from public.reklam_olaylari
      where sayfa_ziyaret_id = p_sayfa_ziyaret_id and tur = 'tiklama';
    if v_sayi >= c_tiklama_siniri then return 'sinir'; end if;
    select coalesce(sum(s.sayi), 0) into v_sayi from public.reklam_sekme_sayaclari s
      where s.sekme_id = v_sekme and s.tur = 'tiklama' and s.saat = v_saat;
    if v_sayi >= c_sekme_saat_tiklama then
      insert into public.reklam_sinir_dakikalari as d (reklam_id, dakika, tur) values (p_reklam_id, v_dakika, 'tiklama')
      on conflict (reklam_id, dakika, tur) do update set reddedilen = d.reddedilen + 1;
      return 'sinir';
    end if;
  else
    if exists (select 1 from public.reklam_olaylari e
               where e.reklam_id = p_reklam_id and e.tur = 'gosterim' and e.sayfa_ziyaret_id = p_sayfa_ziyaret_id) then
      return 'tekrar';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('reklam-sekme:' || v_sekme::text, 0));
    select coalesce(sum(s.sayi), 0) into v_sayi from public.reklam_sekme_sayaclari s
      where s.sekme_id = v_sekme and s.reklam_id = p_reklam_id and s.tur = 'gosterim' and s.saat = v_saat;
    if v_sayi >= c_sekme_saat_gosterim then
      insert into public.reklam_sinir_dakikalari as d (reklam_id, dakika, tur) values (p_reklam_id, v_dakika, 'gosterim')
      on conflict (reklam_id, dakika, tur) do update set reddedilen = d.reddedilen + 1;
      return 'sinir';
    end if;
  end if;

  -- Reklam başına dakika sınırı (bütün ziyaretçiler): fazlası sayılmaz, o dakika işaretlenir
  perform pg_advisory_xact_lock(hashtextextended('reklam-dakika:' || p_reklam_id::text || ':' || p_tur, 0));
  select count(*) into v_sayi from public.reklam_olaylari e
    where e.created_at >= v_dakika and e.reklam_id = p_reklam_id and e.tur = p_tur::public.reklam_olay_turu;
  if v_sayi >= (case when p_tur = 'tiklama' then c_tiklama_dakika_siniri else c_gosterim_dakika_siniri end) then
    insert into public.reklam_sinir_dakikalari as d (reklam_id, dakika, tur)
    values (p_reklam_id, v_dakika, p_tur::public.reklam_olay_turu)
    on conflict (reklam_id, dakika, tur) do update set reddedilen = d.reddedilen + 1;
    return 'sinir';
  end if;

  if p_tur = 'tiklama' then
    insert into public.reklam_olaylari (reklam_id, tur, sayfa_ziyaret_id, alan, mac_id, sekme_id, eylem)
    values (p_reklam_id, 'tiklama', p_sayfa_ziyaret_id, v_r.alan, v_mac, p_sekme_id, v_eylem);
  else
    insert into public.reklam_olaylari (reklam_id, tur, sayfa_ziyaret_id, alan, mac_id)
    values (p_reklam_id, 'gosterim', p_sayfa_ziyaret_id, v_r.alan, v_mac)
    on conflict (reklam_id, tur, sayfa_ziyaret_id) where tur = 'gosterim' do nothing;
    if not found then return 'tekrar'; end if;
  end if;

  -- Sekme sayacı (+ bu sekmenin 2 saatten eski sayaçlarını sil)
  delete from public.reklam_sekme_sayaclari where sekme_id = v_sekme and saat < v_saat - interval '2 hours';
  insert into public.reklam_sekme_sayaclari as s (sekme_id, reklam_id, tur, saat)
  values (v_sekme, p_reklam_id, p_tur::public.reklam_olay_turu, v_saat)
  on conflict (sekme_id, reklam_id, tur, saat) do update set sayi = s.sayi + 1;
  return 'kaydedildi';
end $$;
revoke execute on function public.reklam_olay_kaydet(uuid, text, uuid, text, text, uuid, text) from public;
grant execute on function public.reklam_olay_kaydet(uuid, text, uuid, text, text, uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 4) Günlük toplam + saklama süresi
-- ---------------------------------------------------------------------
create table if not exists public.reklam_gunluk (
  gun        date not null,                 -- Türkiye takvim günü
  reklam_id  uuid not null references public.reklamlar (id) on delete cascade,
  alan       public.reklam_alani not null,
  tur        text not null check (tur in ('gosterim', 'tiklama', 'yerlesim')),
  eylem      text not null default '' check (eylem in ('', 'web', 'whatsapp', 'ara')), -- '' = gösterim/yerleşim ya da eylemsiz eski tıklama
  sayi       bigint not null check (sayi >= 0),
  primary key (gun, reklam_id, alan, tur, eylem)
);
comment on table public.reklam_gunluk is 'Günlük toplam: TSİ günü × reklam × alan × tür × eylem. Ham olaylar 90 gün sonra silinir; rapor eski günleri buradan okur.';
create table if not exists public.reklam_gunluk_toplanan (
  gun       date primary key,
  toplandi  timestamptz not null default now()
);
comment on table public.reklam_gunluk_toplanan is 'Toplamı alınmış TSİ günleri (bu günlerde rapor reklam_gunluk''ten okur).';
alter table public.reklam_gunluk enable row level security;
alter table public.reklam_gunluk_toplanan enable row level security;
drop policy if exists "yonetici gunluk okur" on public.reklam_gunluk;
create policy "yonetici gunluk okur" on public.reklam_gunluk for select to authenticated using ((select public.is_admin()));
drop policy if exists "yonetici toplanan okur" on public.reklam_gunluk_toplanan;
create policy "yonetici toplanan okur" on public.reklam_gunluk_toplanan for select to authenticated using ((select public.is_admin()));
revoke insert, update, delete, truncate on public.reklam_gunluk, public.reklam_gunluk_toplanan from anon, authenticated;

-- Bir TSİ gününün toplamını (yeniden) yazar. Bugün ve gelecek toplanmaz.
create or replace function public.reklam_gunluk_topla(p_gun date)
returns bigint
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_bas timestamptz := p_gun::timestamp at time zone 'Europe/Istanbul';
  v_son timestamptz := (p_gun + 1)::timestamp at time zone 'Europe/Istanbul';
  v_sayi bigint;
begin
  if p_gun is null or p_gun >= (now() at time zone 'Europe/Istanbul')::date then
    return 0;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('reklam-gunluk:' || p_gun::text, 0));
  delete from public.reklam_gunluk where gun = p_gun;
  insert into public.reklam_gunluk (gun, reklam_id, alan, tur, eylem, sayi)
  select p_gun, e.reklam_id, e.alan, e.tur::text, coalesce(e.eylem, ''), count(*)
  from public.reklam_olaylari e
  where e.created_at >= v_bas and e.created_at < v_son
  group by e.reklam_id, e.alan, e.tur, coalesce(e.eylem, '')
  union all
  select p_gun, y.reklam_id, y.alan, 'yerlesim', '', count(*)
  from public.reklam_yerlesimleri y
  where y.created_at >= v_bas and y.created_at < v_son
  group by y.reklam_id, y.alan;
  get diagnostics v_sayi = row_count;
  insert into public.reklam_gunluk_toplanan (gun) values (p_gun)
  on conflict (gun) do update set toplandi = now();
  return v_sayi;
end $$;
revoke execute on function public.reklam_gunluk_topla(date) from public, anon, authenticated;

-- Gece bakımı: toplanmamış (dünden eski) günleri topla, toplanmış günlerin 90 günden eski ham olaylarını sil,
-- 1 günden eski tıklamalardaki sekme kimliğini boşalt, sekme sayaçlarını ve 400 günden eski sınır kayıtlarını sil.
create or replace function public.reklam_bakim(p_saklama_gun integer default 90)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_bugun date := (now() at time zone 'Europe/Istanbul')::date;
  v_gun date;
  v_toplanan int := 0;
  v_silinen bigint;
  v_silinen_y bigint;
  v_sinir timestamptz;
begin
  -- sürüm 014
  if p_saklama_gun is null or p_saklama_gun < 7 then
    raise exception 'Saklama süresi en az 7 gün olmalı.' using errcode = '22023';
  end if;
  for v_gun in
    select distinct d from (
      select (e.created_at at time zone 'Europe/Istanbul')::date as d from public.reklam_olaylari e
      union select (y.created_at at time zone 'Europe/Istanbul')::date from public.reklam_yerlesimleri y
    ) x
    where d < v_bugun and not exists (select 1 from public.reklam_gunluk_toplanan t where t.gun = x.d)
    order by d
  loop
    perform public.reklam_gunluk_topla(v_gun);
    v_toplanan := v_toplanan + 1;
  end loop;
  v_sinir := (v_bugun - p_saklama_gun)::timestamp at time zone 'Europe/Istanbul';
  delete from public.reklam_olaylari e
    where e.created_at < v_sinir
      and exists (select 1 from public.reklam_gunluk_toplanan t where t.gun = (e.created_at at time zone 'Europe/Istanbul')::date);
  get diagnostics v_silinen = row_count;
  delete from public.reklam_yerlesimleri y
    where y.created_at < v_sinir
      and exists (select 1 from public.reklam_gunluk_toplanan t where t.gun = (y.created_at at time zone 'Europe/Istanbul')::date);
  get diagnostics v_silinen_y = row_count;
  update public.reklam_olaylari set sekme_id = null where sekme_id is not null and created_at < now() - interval '1 day';
  delete from public.reklam_sekme_sayaclari where saat < now() - interval '2 hours';
  delete from public.reklam_sinir_dakikalari where dakika < now() - interval '400 days';
  return format('toplanan gün: %s, silinen olay: %s, silinen yerleşim: %s', v_toplanan, v_silinen, v_silinen_y);
end $$;
revoke execute on function public.reklam_bakim(integer) from public, anon, authenticated;

-- pg_cron varsa her gece 00:17 TSİ (21:17 UTC) bakım; yoksa (düz Postgres, test) atlanır. README: Database → Extensions → pg_cron.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      execute $c$select cron.schedule('reklam-bakim', '17 21 * * *', 'select public.reklam_bakim()')$c$;
    exception when others then
      raise notice '014: pg_cron işi kurulamadı (%); reklam_bakim() elle çalıştırılabilir.', sqlerrm;
    end;
  else
    raise notice '014: pg_cron yok; reklam_bakim() zamanlanmadı (rapor yine doğru: toplanmamış günler ham olaydan okunur).';
  end if;
end;
$$;

-- Rapor verisi: toplanmış günler reklam_gunluk'ten, öteki günler (bugün dahil) ham olaydan. İç fonksiyon (yalnız raporlar çağırır).
create or replace function public.reklam_rapor_verisi(p_bas date, p_bit date)
returns table (gun date, reklam_id uuid, tur text, eylem text, sayi bigint)
language sql stable security definer set search_path = ''
as $$
  with t as (select gun from public.reklam_gunluk_toplanan where gun between p_bas and p_bit),
  ham as (
    select (e.created_at at time zone 'Europe/Istanbul')::date as gun, e.reklam_id, e.tur::text as tur, coalesce(e.eylem, '') as eylem
    from public.reklam_olaylari e
    where e.created_at >= p_bas::timestamp at time zone 'Europe/Istanbul'
      and e.created_at < (p_bit + 1)::timestamp at time zone 'Europe/Istanbul'
    union all
    select (y.created_at at time zone 'Europe/Istanbul')::date, y.reklam_id, 'yerlesim', ''
    from public.reklam_yerlesimleri y
    where y.created_at >= p_bas::timestamp at time zone 'Europe/Istanbul'
      and y.created_at < (p_bit + 1)::timestamp at time zone 'Europe/Istanbul'
  )
  select g.gun, g.reklam_id, g.tur, g.eylem, sum(g.sayi)::bigint
  from public.reklam_gunluk g
  where g.gun in (select gun from t)
  group by g.gun, g.reklam_id, g.tur, g.eylem
  union all
  select h.gun, h.reklam_id, h.tur, h.eylem, count(*)::bigint
  from ham h
  where h.gun not in (select gun from t)
  group by h.gun, h.reklam_id, h.tur, h.eylem
$$;
revoke execute on function public.reklam_rapor_verisi(date, date) from public, anon, authenticated;

-- reklam_raporu (012'nin yerine; ilk 8 sütun aynı sırada): + firma anahtarı, eylem kırılımı, yerleşim ve görünürlük oranı,
-- yayın başlangıç/bitiş, dönem (istenen aralığın yayınla kesişen kısmı, TSİ günü), yayın günü, günlük ortalama gösterim.
drop function if exists public.reklam_raporu(date, date);
create function public.reklam_raporu(p_baslangic_tarih date, p_bitis_tarih date)
returns table (
  reklam_id uuid, firma_adi text, alan text, mac_id uuid,
  gosterim bigint, tiklama bigint, tiklama_orani numeric, supheli_dakika bigint,
  firma_anahtar text, tiklama_web bigint, tiklama_whatsapp bigint, tiklama_ara bigint,
  yerlesim bigint, gorunurluk_orani numeric,
  yayin_baslangic timestamptz, yayin_bitis timestamptz, donem_baslangic date, donem_bitis date,
  yayin_gun integer, gunluk_ortalama_gosterim numeric
)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_bas timestamptz;
  v_son timestamptz;
begin
  -- sürüm 014
  if not public.is_admin() then
    raise exception 'Bu raporu yalnızca yöneticiler görebilir.' using errcode = '42501';
  end if;
  if p_baslangic_tarih is null or p_bitis_tarih is null or p_bitis_tarih < p_baslangic_tarih then
    raise exception 'Tarih aralığı geçersiz.' using errcode = '22023';
  end if;
  v_bas := p_baslangic_tarih::timestamp at time zone 'Europe/Istanbul';
  v_son := (p_bitis_tarih + 1)::timestamp at time zone 'Europe/Istanbul';

  return query
  with v as (select * from public.reklam_rapor_verisi(p_baslangic_tarih, p_bitis_tarih)),
  o as (
    select v.reklam_id,
           sum(v.sayi) filter (where v.tur = 'gosterim') as g,
           sum(v.sayi) filter (where v.tur = 'tiklama') as t,
           sum(v.sayi) filter (where v.tur = 'tiklama' and v.eylem = 'web') as tw,
           sum(v.sayi) filter (where v.tur = 'tiklama' and v.eylem = 'whatsapp') as twa,
           sum(v.sayi) filter (where v.tur = 'tiklama' and v.eylem = 'ara') as ta,
           sum(v.sayi) filter (where v.tur = 'yerlesim') as y
    from v group by v.reklam_id
  ), s as (
    select d.reklam_id, count(distinct d.dakika) as m
    from public.reklam_sinir_dakikalari d
    where d.dakika >= v_bas and d.dakika < v_son
    group by d.reklam_id
  ), r as (
    select x.*,
           greatest(p_baslangic_tarih, (x.baslangic at time zone 'Europe/Istanbul')::date) as db,
           least(p_bitis_tarih, ((x.bitis - interval '1 microsecond') at time zone 'Europe/Istanbul')::date) as ds
    from public.reklamlar x
  )
  select r.id, r.firma_adi, r.alan::text, r.mac_id,
         coalesce(o.g, 0)::bigint, coalesce(o.t, 0)::bigint,
         case when coalesce(o.g, 0) > 0 then round(100.0 * coalesce(o.t, 0) / o.g, 2) end,
         coalesce(s.m, 0)::bigint,
         r.firma_anahtar,
         coalesce(o.tw, 0)::bigint, coalesce(o.twa, 0)::bigint, coalesce(o.ta, 0)::bigint,
         coalesce(o.y, 0)::bigint,
         case when coalesce(o.y, 0) > 0 then round(100.0 * least(coalesce(o.g, 0), o.y) / o.y, 2) end,
         r.baslangic, r.bitis,
         case when r.ds >= r.db then r.db end, case when r.ds >= r.db then r.ds end,
         greatest(0, r.ds - r.db + 1)::integer,
         case when r.ds >= r.db then round(coalesce(o.g, 0)::numeric / (r.ds - r.db + 1), 1) end
  from r
  left join o on o.reklam_id = r.id
  left join s on s.reklam_id = r.id
  where o.reklam_id is not null or s.reklam_id is not null
     or (r.durum <> 'taslak' and r.baslangic < v_son and r.bitis > v_bas)
  order by coalesce(o.g, 0) desc, r.firma_adi;
end $$;
revoke execute on function public.reklam_raporu(date, date) from public, anon;
grant execute on function public.reklam_raporu(date, date) to authenticated;

-- Gün gün rapor (Türkiye günü; o gün maç varsa mac_gunu). Yalnız yönetici. Yalnız verisi olan günler.
drop function if exists public.reklam_gunluk_raporu(date, date);
create function public.reklam_gunluk_raporu(p_baslangic_tarih date, p_bitis_tarih date)
returns table (
  gun date, reklam_id uuid, firma_adi text, firma_anahtar text, alan text, mac_gunu boolean,
  gosterim bigint, tiklama bigint, tiklama_web bigint, tiklama_whatsapp bigint, tiklama_ara bigint, yerlesim bigint
)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  -- sürüm 014
  if not public.is_admin() then
    raise exception 'Bu raporu yalnızca yöneticiler görebilir.' using errcode = '42501';
  end if;
  if p_baslangic_tarih is null or p_bitis_tarih is null or p_bitis_tarih < p_baslangic_tarih or p_bitis_tarih - p_baslangic_tarih > 400 then
    raise exception 'Tarih aralığı geçersiz.' using errcode = '22023';
  end if;
  return query
  select v.gun, v.reklam_id, r.firma_adi, r.firma_anahtar, r.alan::text,
         exists (select 1 from public.maclar m where (m.tarih at time zone 'Europe/Istanbul')::date = v.gun),
         coalesce(sum(v.sayi) filter (where v.tur = 'gosterim'), 0)::bigint,
         coalesce(sum(v.sayi) filter (where v.tur = 'tiklama'), 0)::bigint,
         coalesce(sum(v.sayi) filter (where v.tur = 'tiklama' and v.eylem = 'web'), 0)::bigint,
         coalesce(sum(v.sayi) filter (where v.tur = 'tiklama' and v.eylem = 'whatsapp'), 0)::bigint,
         coalesce(sum(v.sayi) filter (where v.tur = 'tiklama' and v.eylem = 'ara'), 0)::bigint,
         coalesce(sum(v.sayi) filter (where v.tur = 'yerlesim'), 0)::bigint
  from public.reklam_rapor_verisi(p_baslangic_tarih, p_bitis_tarih) v
  join public.reklamlar r on r.id = v.reklam_id
  group by v.gun, v.reklam_id, r.firma_adi, r.firma_anahtar, r.alan
  order by v.gun, r.firma_adi, r.alan;
end $$;
revoke execute on function public.reklam_gunluk_raporu(date, date) from public, anon;
grant execute on function public.reklam_gunluk_raporu(date, date) to authenticated;

-- ---------------------------------------------------------------------
-- 5) Yorum: yasaklı hesap, moderasyon
-- ---------------------------------------------------------------------
alter table public.yorumlar add column if not exists onay_bekliyor boolean not null default false;
alter table public.yorumlar add column if not exists gizleme_nedeni text;
alter table public.yorumlar add column if not exists moderasyon_zamani timestamptz;
alter table public.yorumlar drop constraint if exists yorumlar_gizleme_nedeni;
alter table public.yorumlar add constraint yorumlar_gizleme_nedeni check (gizleme_nedeni is null or gizleme_nedeni in ('yonetici', 'sikayet'));
comment on column public.yorumlar.onay_bekliyor is 'Yönetici onayı bekliyor (kelime listesi ya da maçın ön onay penceresi). Yalnız yazan ve yönetici görür.';
comment on column public.yorumlar.gizleme_nedeni is 'gizli=true ise neden: yonetici (elle) | sikayet (farklı 3 hesaptan şikâyet, kendiliğinden).';
comment on column public.yorumlar.moderasyon_zamani is 'Yöneticinin yorumu son onayladığı/gizlediği/açtığı an. Kendiliğinden gizleme yalnız bundan sonraki şikâyetleri sayar.';
create index if not exists yorumlar_onay_kuyrugu on public.yorumlar (created_at desc) where onay_bekliyor or gizleme_nedeni = 'sikayet';

alter table public.maclar add column if not exists on_onay boolean not null default false;
comment on column public.maclar.on_onay is 'Ön onay modu: maçtan 2 saat önce → 24 saat sonra bu maça ve gollerine yazılan yorumlar yönetici onayından sonra görünür.';

-- Yöneticinin kısa kelime listesi: yorumda bu kelimeyle BAŞLAYAN bir sözcük varsa yorum onay bekler. Kelimeler katlanmış saklanır.
create table if not exists public.yorum_kelimeleri (
  kelime      text primary key check (kelime ~ '^[a-z]{3,40}$'),
  created_at  timestamptz not null default now()
);
comment on table public.yorum_kelimeleri is 'Moderasyon kelime listesi (yalnız yönetici okur/yazar). Katlanmış biçimde (yorum_katla): küçük harf, Türkçe harf ve rakam benzerleri yok.';

-- Yorum metni karşılaştırma biçimi: katla + rakam/simge benzerleri (0→o 1→i 3→e 4→a 5→s 7→t @→a $→s), harf dışı → boşluk.
-- JS: assets/kurallar.js yorumKatla / kelimeEslesir.
create or replace function public.yorum_katla(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(regexp_replace(translate(public.metin_katla(p), '013457@$', 'oieastas'), '[^a-z]+', ' ', 'g'))
$$;

create or replace function public.yorum_kelimeleri_katla()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.kelime := replace(public.yorum_katla(new.kelime), ' ', '');
  new.created_at := now();
  return new;
end;
$$;
drop trigger if exists yorum_kelimeleri_katla on public.yorum_kelimeleri;
create trigger yorum_kelimeleri_katla before insert or update on public.yorum_kelimeleri
  for each row execute function public.yorum_kelimeleri_katla();
alter table public.yorum_kelimeleri enable row level security;
drop policy if exists kelime_okuma on public.yorum_kelimeleri;
create policy kelime_okuma on public.yorum_kelimeleri for select to authenticated using ((select public.is_admin()));
drop policy if exists kelime_ekleme on public.yorum_kelimeleri;
create policy kelime_ekleme on public.yorum_kelimeleri for insert to authenticated with check ((select public.is_admin()));
drop policy if exists kelime_silme on public.yorum_kelimeleri;
create policy kelime_silme on public.yorum_kelimeleri for delete to authenticated using ((select public.is_admin()));
revoke all on public.yorum_kelimeleri from anon;
revoke update, truncate on public.yorum_kelimeleri from authenticated;
grant select, insert, delete on public.yorum_kelimeleri to authenticated;

-- Bu yorum onay beklemeli mi? (kelime listesi ya da maçın ön onay penceresi). İç fonksiyon: listeyi kimse sorgulayamasın.
create or replace function public.yorum_onay_gerekli(p_metin text, p_mac_id uuid, p_gol_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
      select 1 from public.yorum_kelimeleri k
      where position(' ' || k.kelime in ' ' || public.yorum_katla(p_metin)) > 0)
    or exists (
      select 1 from public.maclar m
      where m.on_onay
        and m.id = coalesce(p_mac_id, (select g.mac_id from public.goller g where g.id = p_gol_id))
        and now() >= m.tarih - interval '2 hours' and now() < m.tarih + interval '24 hours')
$$;
revoke execute on function public.yorum_onay_gerekli(text, uuid, uuid) from public, anon, authenticated;

-- Moderasyon tetikleyicisi (yorum_ekleme_kontrol ve yorum_guncelleme_kontrol'den SONRA çalışır: ad sırası).
-- SQL Editor / seed (oturum yok) dokunulmaz. Yönetici: onay/gizleme zamanını ve nedenini yazar. Taraftar: onay gerekliyse bekletir.
create or replace function public.yorum_moderasyon()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- sürüm 014
  if auth.uid() is null then
    return new;
  end if;
  if public.is_admin() then
    if tg_op = 'INSERT' then
      new.onay_bekliyor := false;
      new.gizleme_nedeni := case when new.gizli then 'yonetici' end;
    elsif new.gizli is distinct from old.gizli or new.onay_bekliyor is distinct from old.onay_bekliyor then
      new.moderasyon_zamani := now();
      new.gizleme_nedeni := case when not new.gizli then null
                                 when old.gizli then old.gizleme_nedeni
                                 else 'yonetici' end;
    end if;
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.gizleme_nedeni := null;
    new.moderasyon_zamani := null;
    new.onay_bekliyor := public.yorum_onay_gerekli(new.metin, new.mac_id, new.gol_id);
  elsif new.metin is distinct from old.metin and not old.onay_bekliyor then
    new.onay_bekliyor := public.yorum_onay_gerekli(new.metin, new.mac_id, new.gol_id);
  end if;
  return new;
end;
$$;
drop trigger if exists yorum_moderasyon on public.yorumlar;
create trigger yorum_moderasyon before insert or update on public.yorumlar
  for each row execute function public.yorum_moderasyon();

-- Güncelleme tetikleyicisi (013'ün yerine): + yasaklı hesap yorumunu düzenleyemez; moderasyon alanlarına dokunamaz
create or replace function public.yorum_guncelleme_kontrol()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  c_duzenleme_suresi constant interval := interval '30 minutes';
begin
  -- sürüm 014
  if current_user in ('anon', 'authenticated') and not public.is_admin() then
    if new.kullanici_id is distinct from old.kullanici_id
       or new.haber_id is distinct from old.haber_id
       or new.mac_id is distinct from old.mac_id
       or new.gol_id is distinct from old.gol_id
       or new.gizli is distinct from old.gizli
       or new.onay_bekliyor is distinct from old.onay_bekliyor
       or new.gizleme_nedeni is distinct from old.gizleme_nedeni
       or new.moderasyon_zamani is distinct from old.moderasyon_zamani
       or new.created_at is distinct from old.created_at then
      raise exception 'Yorumda sadece metni değiştirebilirsiniz.' using errcode = '42501';
    end if;
    if new.metin is distinct from old.metin then
      if public.engelli_mi() then
        raise exception 'Hesabın yorum yazmaya kapatıldı (topluluk kuralları); yorumlarını düzenleyemezsin. İtiraz için sitedeki iletişim adresine yaz.'
          using errcode = '42501', hint = 'engelli';
      end if;
      if old.created_at < now() - c_duzenleme_suresi then
        raise exception 'Yorumlar yalnız yazıldıktan sonraki 30 dakika içinde düzenlenebilir.'
          using errcode = 'P0001', hint = 'duzenleme_suresi';
      end if;
      perform public.yorum_duzenleme_hakki();
    end if;
  end if;
  if current_user in ('anon', 'authenticated') then
    new.duzenlendi := case when new.metin is distinct from old.metin then now() else old.duzenlendi end;
  end if;
  return new;
end;
$$;

-- Okuma politikası (001'in yerine): onay bekleyen yorum da yalnız yazana ve yöneticiye görünür
drop policy if exists yorum_okuma on public.yorumlar;
create policy yorum_okuma on public.yorumlar
  for select using (
    (not gizli and not onay_bekliyor and (haber_id is null or exists (
      select 1 from public.haberler h where h.id = yorumlar.haber_id and h.yayinda)))
    or kullanici_id = (select auth.uid())
    or (select public.is_admin())
  );

-- Şikâyet: yasaklı hesap şikâyet edemez (politika + Türkçe mesaj)
drop policy if exists sikayet_ekleme on public.yorum_sikayetleri;
create policy sikayet_ekleme on public.yorum_sikayetleri for insert to authenticated
  with check (sikayet_eden = (select auth.uid()) and (select public.eposta_onayli()) and not (select public.engelli_mi()));

create or replace function public.sikayet_kontrol()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_sahip uuid;
begin
  -- sürüm 014
  if current_user in ('anon', 'authenticated') then
    if auth.uid() is null then
      raise exception 'Şikâyet için giriş yap.' using errcode = '42501';
    end if;
    if public.engelli_mi() then
      raise exception 'Hesabın topluluk kuralları nedeniyle kapatıldı; şikâyet gönderemezsin.' using errcode = '42501', hint = 'engelli';
    end if;
    new.sikayet_eden := auth.uid();
    new.created_at := now();
    select y.kullanici_id into v_sahip from public.yorumlar y where y.id = new.yorum_id;
    if not found then
      raise exception 'Yorum bulunamadı.' using errcode = '22023';
    end if;
    if v_sahip = auth.uid() then
      raise exception 'Kendi yorumunu şikâyet edemezsin; istersen silebilirsin.' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

-- Farklı 3 hesaptan (yöneticinin son kararından sonra) şikâyet alan yorum kendiliğinden gizlenir; yönetici geri açabilir.
create or replace function public.sikayet_otomatik_gizle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_esik constant int := 3;
  v_gizli boolean;
  v_zaman timestamptz;
  v_sayi int;
begin
  -- sürüm 014
  select y.gizli, y.moderasyon_zamani into v_gizli, v_zaman from public.yorumlar y where y.id = new.yorum_id for update;
  if not found or v_gizli then return null; end if;
  select count(distinct s.sikayet_eden) into v_sayi from public.yorum_sikayetleri s
    where s.yorum_id = new.yorum_id and (v_zaman is null or s.created_at > v_zaman);
  if v_sayi >= c_esik then
    update public.yorumlar set gizli = true, gizleme_nedeni = 'sikayet' where id = new.yorum_id;
  end if;
  return null;
end;
$$;
drop trigger if exists sikayet_otomatik_gizle on public.yorum_sikayetleri;
create trigger sikayet_otomatik_gizle after insert on public.yorum_sikayetleri
  for each row execute function public.sikayet_otomatik_gizle();

-- ---------------------------------------------------------------------
-- 6) Ayrılmış kullanıcı adları (013'ün yerine): rakam/simge benzerleri ve "kirmizisimsek". assets/kurallar.js ile AYNI.
-- Üç biçim denenir: (a) 0→o 1→i 3→e 4→a 5→s 7→t @→a; (b) aynısı ama 1→l; (c) (a)'da l→i ("Resml" → "resmi").
-- ---------------------------------------------------------------------
create or replace function public.kullanici_adi_ayrilmis(p_ad text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  -- sürüm 014
  v text := public.metin_katla(p_ad);
  a text;
  b text;
  c text;
  k constant text := '(admin|yonetici|yonetim|moderator|resmi|corumfk|corumspor|kulup|yetkili|baskan|teknikdirektor|kirmizisimsek)';
  t constant text[] := array['destek', 'mod', 'sistem', 'corumsportaraftar', 'support', 'official', 'root', 'kaptan', 'antrenor'];
begin
  a := regexp_replace(translate(v, '013457@', 'oieasta'), '[^a-z]', '', 'g');
  b := regexp_replace(translate(v, '013457@', 'oleasta'), '[^a-z]', '', 'g');
  c := translate(a, 'l', 'i');
  return a ~ k or b ~ k or c ~ k or a = any (t) or b = any (t) or c = any (t);
end;
$$;

-- ---------------------------------------------------------------------
-- 7) Haber, gol, maç alanları
-- ---------------------------------------------------------------------
alter table public.haberler add column if not exists kaynak text;
alter table public.haberler add column if not exists kaynak_url text;
alter table public.haberler add column if not exists duzeltme_notu text;
alter table public.haberler add column if not exists duzeltme_tarihi timestamptz;
alter table public.haberler add column if not exists kapak_alt text;
alter table public.haberler drop constraint if exists haberler_kaynak;
alter table public.haberler add constraint haberler_kaynak check (kaynak is null or char_length(btrim(kaynak)) between 2 and 120);
alter table public.haberler drop constraint if exists haberler_kaynak_url;
alter table public.haberler add constraint haberler_kaynak_url check (kaynak_url is null or (kaynak_url ~* '^https://[a-z0-9.-]+\.[a-z]{2,63}(/[^[:space:]"<>]*)?$' and length(kaynak_url) <= 500));
alter table public.haberler drop constraint if exists haberler_duzeltme_notu;
alter table public.haberler add constraint haberler_duzeltme_notu check (duzeltme_notu is null or char_length(btrim(duzeltme_notu)) between 3 and 500);
alter table public.haberler drop constraint if exists haberler_kapak_alt;
alter table public.haberler add constraint haberler_kapak_alt check (kapak_alt is null or char_length(kapak_alt) <= 200);
comment on column public.haberler.kaynak is 'Haberin kaynağı (ör. "Kulüp açıklaması", "TFF"). Kadro, transfer ve bilet haberinde yazılmalı. Haberin sonunda "Kaynak: …".';
comment on column public.haberler.kaynak_url is 'Kaynağın bağlantısı (yalnız https).';
comment on column public.haberler.duzeltme_notu is 'Düzeltme notu: haberin başında "Düzeltme" kutusunda gösterilir. duzeltme_tarihi sunucuda yazılır.';
comment on column public.haberler.kapak_alt is 'Kapak fotoğrafının alt metni (fotoğraf bilgi taşıyorsa: skor tabelası, oyuncu…). Boşsa süs sayılır.';

create or replace function public.haber_duzeltme()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.kaynak := nullif(btrim(coalesce(new.kaynak, '')), '');
  new.kaynak_url := nullif(btrim(coalesce(new.kaynak_url, '')), '');
  new.duzeltme_notu := nullif(btrim(coalesce(new.duzeltme_notu, '')), '');
  new.kapak_alt := nullif(btrim(coalesce(new.kapak_alt, '')), '');
  if tg_op = 'INSERT' then
    new.duzeltme_tarihi := case when new.duzeltme_notu is not null then now() end;
  elsif new.duzeltme_notu is distinct from old.duzeltme_notu then
    new.duzeltme_tarihi := case when new.duzeltme_notu is not null then now() end;
  else
    new.duzeltme_tarihi := old.duzeltme_tarihi;
  end if;
  return new;
end;
$$;
drop trigger if exists haber_duzeltme on public.haberler;
create trigger haber_duzeltme before insert or update on public.haberler
  for each row execute function public.haber_duzeltme();

-- Gol videosu: YouTube ya da sitenin kendi deposundaki .mp4 (gol-videolari kovası). Altyazı: aynı kovada .vtt.
-- assets/kurallar.js golVideoGecerli / altyaziAdresiGecerli ile AYNI.
create or replace function public.gol_video_gecerli(p_url text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_url is null or (
    length(p_url) <= 2000 and strpos(p_url, '..') = 0 and p_url !~ '[\x01-\x20\x7f-\x9f]'
    and (p_url ~ '^https://(www\.|m\.)?(youtube\.com|youtube-nocookie\.com|youtu\.be)/[^[:space:]"<>]+$'
         or p_url ~* '^https://[a-z0-9][a-z0-9-]{0,62}\.supabase\.co/storage/v1/object/public/gol-videolari/[A-Za-z0-9._~/-]+\.mp4$'))
$$;
create or replace function public.gol_altyazi_gecerli(p_url text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_url is null or (
    length(p_url) <= 2000 and strpos(p_url, '..') = 0 and p_url !~ '[\x01-\x20\x7f-\x9f]'
    and p_url ~* '^https://[a-z0-9][a-z0-9-]{0,62}\.supabase\.co/storage/v1/object/public/gol-videolari/[A-Za-z0-9._~/-]+\.vtt$')
$$;

alter table public.goller add column if not exists video_kaynak text;
alter table public.goller add column if not exists altyazi_url text;
alter table public.goller drop constraint if exists goller_video_kaynak;
alter table public.goller add constraint goller_video_kaynak check (video_kaynak is null or char_length(btrim(video_kaynak)) between 3 and 120);
alter table public.goller drop constraint if exists goller_altyazi;
alter table public.goller add constraint goller_altyazi check (public.gol_altyazi_gecerli(altyazi_url));
comment on column public.goller.video_kaynak is 'Videonun hak sahibi / kaynağı (ör. "Çorum FK resmî YouTube kanalı"). Videolu golde zorunlu; videonun altında "Video: …".';
comment on column public.goller.altyazi_url is 'mp4 videonun Türkçe altyazısı (.vtt), yalnız sitenin deposundan (gol-videolari kovası).';
alter table public.goller drop constraint if exists goller_video_deposu;
alter table public.goller add constraint goller_video_deposu check (public.gol_video_gecerli(video_url)) not valid;
do $$
begin
  if exists (select 1 from public.goller where not public.gol_video_gecerli(video_url)) then
    raise notice '014: bazı gollerin .mp4 videosu başka siteden; panelden dosyayı yükleyin ya da YouTube bağlantısı verin (yeni yazımlar denetlenir).';
  else
    alter table public.goller validate constraint goller_video_deposu;
  end if;
end;
$$;

create or replace function public.gol_video_kontrol()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.video_kaynak := nullif(btrim(coalesce(new.video_kaynak, '')), '');
  if new.video_url is not null and new.video_kaynak is null
     and (tg_op = 'INSERT' or new.video_url is distinct from old.video_url or old.video_kaynak is not null) then
    raise exception 'Videonun kaynağını yazın (ör. "Çorum FK resmî YouTube kanalı").' using errcode = '22023', hint = 'video_kaynak';
  end if;
  if new.altyazi_url is not null and (new.video_url is null or new.video_url !~* '\.mp4$') then
    raise exception 'Altyazı yalnız siteye yüklenen .mp4 videoya eklenir (YouTube altyazısı YouTube''da açılır).' using errcode = '22023', hint = 'altyazi_url';
  end if;
  return new;
end;
$$;
drop trigger if exists gol_video_kontrol on public.goller;
create trigger gol_video_kontrol before insert or update on public.goller
  for each row execute function public.gol_video_kontrol();

alter table public.maclar add column if not exists mac_notu text;
alter table public.maclar drop constraint if exists maclar_mac_notu;
alter table public.maclar add constraint maclar_mac_notu check (mac_notu is null or char_length(btrim(mac_notu)) between 2 and 280);
comment on column public.maclar.mac_notu is 'Maç sayfasında küçük bilgi kutusu: bilet, yayın, kapı saati (en fazla 280 karakter).';

-- Depo: gol-videolari (mp4 + Türkçe altyazı .vtt). Herkes okur (public kova), listeleme/yükleme/silme yalnız yönetici. 50 MB.
do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'storage şeması yok, gol-videolari deposu atlandı';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('gol-videolari', 'gol-videolari', true, 52428800, array['video/mp4', 'text/vtt'])
  on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
                                 allowed_mime_types = excluded.allowed_mime_types;
  drop policy if exists "gol videolari yonetici listeler" on storage.objects;
  drop policy if exists "gol videosu yonetici yukler" on storage.objects;
  drop policy if exists "gol videosu yonetici gunceller" on storage.objects;
  drop policy if exists "gol videosu yonetici siler" on storage.objects;
  create policy "gol videolari yonetici listeler" on storage.objects for select to authenticated
    using (bucket_id = 'gol-videolari' and (select public.is_admin()));
  create policy "gol videosu yonetici yukler" on storage.objects for insert to authenticated
    with check (bucket_id = 'gol-videolari' and (select public.is_admin()));
  create policy "gol videosu yonetici gunceller" on storage.objects for update to authenticated
    using (bucket_id = 'gol-videolari' and (select public.is_admin()))
    with check (bucket_id = 'gol-videolari' and (select public.is_admin()));
  create policy "gol videosu yonetici siler" on storage.objects for delete to authenticated
    using (bucket_id = 'gol-videolari' and (select public.is_admin()));
end $$;

-- ---------------------------------------------------------------------
-- 8) Sakatlık: kaynak bağlantısı (Sakat / Durumu belirsiz), kaynak tarihi, açıklama yalnız yöneticiye
-- ---------------------------------------------------------------------
alter table public.sakatliklar add column if not exists kaynak_tarihi date;
comment on column public.sakatliklar.kaynak_tarihi is 'Kaynağın (kulüp açıklaması vb.) tarihi. Sayfada "Kaynak: X · tarih".';
comment on column public.sakatliklar.aciklama is 'YALNIZ YÖNETİCİ (014): iç not. Ziyaretçi ve üyeler okuyamaz (sütun yetkisi); sitede gösterilmez. Tanı/sağlık ayrıntısı yazılmaz.';
alter table public.sakatliklar drop constraint if exists sakatliklar_kaynak_url_zorunlu;
alter table public.sakatliklar add constraint sakatliklar_kaynak_url_zorunlu
  check (durum not in ('sakat', 'belirsiz') or kaynak_url is not null) not valid;
do $$
begin
  if exists (select 1 from public.sakatliklar where durum in ('sakat', 'belirsiz') and kaynak_url is null) then
    raise notice '014: bağlantısız Sakat / Durumu belirsiz kaydı var; panelden kaynak bağlantısını ekleyin (yeni yazımlar denetlenir).';
  else
    alter table public.sakatliklar validate constraint sakatliklar_kaynak_url_zorunlu;
  end if;
end;
$$;
alter table public.sakatliklar drop constraint if exists sakatliklar_kaynak_tarihi;
alter table public.sakatliklar add constraint sakatliklar_kaynak_tarihi check (kaynak_tarihi is null or kaynak_tarihi >= date '2000-01-01');

-- Sütun yetkisi: aciklama hariç (013 yeniden çalışırsa tablo yetkisi geri gelir; bu dosya ardından yeniden kapatır)
revoke select on public.sakatliklar from anon, authenticated;
grant select (id, oyuncu_id, durum, kaynak, kaynak_url, kaynak_tarihi, beklenen_donus, guncellendi, yayinda, created_at)
  on public.sakatliklar to anon, authenticated;

-- Yönetici: bütün kayıtlar (açıklama dahil)
create or replace function public.sakatliklar_yonetim()
returns table (
  id uuid, oyuncu_id uuid, oyuncu_ad text, durum text, aciklama text, kaynak text, kaynak_url text, kaynak_tarihi date,
  beklenen_donus date, guncellendi timestamptz, yayinda boolean, created_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Bu listeyi yalnızca yöneticiler görebilir.' using errcode = '42501';
  end if;
  return query
  select s.id, s.oyuncu_id, o.ad, s.durum, s.aciklama, s.kaynak, s.kaynak_url, s.kaynak_tarihi,
         s.beklenen_donus, s.guncellendi, s.yayinda, s.created_at
  from public.sakatliklar s join public.oyuncular o on o.id = s.oyuncu_id
  order by s.guncellendi desc
  limit 500;
end;
$$;
revoke execute on function public.sakatliklar_yonetim() from public, anon;
grant execute on function public.sakatliklar_yonetim() to authenticated;

-- ---------------------------------------------------------------------
-- Yetkiler (Supabase bunları zaten verir; düz Postgres'te de çalışsın diye açıkça). Asıl koruma RLS.
-- ---------------------------------------------------------------------
grant select on public.reklam_yerlesimleri, public.reklam_gunluk, public.reklam_gunluk_toplanan to authenticated;
revoke select on public.reklam_yerlesimleri, public.reklam_gunluk, public.reklam_gunluk_toplanan from anon;
revoke truncate on public.yorum_kelimeleri, public.reklam_yerlesimleri, public.reklam_sekme_sayaclari,
  public.reklam_gunluk, public.reklam_gunluk_toplanan from anon, authenticated;


-- ===================== 015_son_tur.sql =====================
-- =====================================================================
-- Çorum Taraftar: son tur (3. inceleme) düzeltmeleri (015) — sunucu tarafı
-- Sıra: 001 → 002 → 010 → 011 → 012 → 013 → 014 → 015. Tekrar çalıştırılabilir (if not exists / create or replace / drop if exists).
-- DİKKAT: 010-014'ü sonradan YENİDEN çalıştırırsanız aşağıdaki fonksiyonlar onların hâline döner; ardından bu dosyayı da
-- yeniden çalıştırın. Yeniden tanımlanan her gövdede "sürüm 015" işareti var (testler en son sürümün kurulu olduğunu denetler).
--
--  1) Reklam sayımı: reklam başına dakikada 120 gösterim / 20 tıklama / 240 yerleşim (maç günü zirvesi eksik sayılmasın);
--     sekme başına saatlik sınırlar AYNI. Ham satır alarmı: reklam_ham_satir_alarmi() (yalnız yönetici; panelde görünür).
--  2) Rapor: tıklama oranı = tıklama yapılan FARKLI sayfa açılışı ÷ gösterim (%100'ü aşmaz; reklam_gunluk'te tur 'tiklayan');
--     toplam tıklama ve eylem dağılımı ayrı sütunlarda kalır. Dönem ve yayın günü BUGÜNÜ (TSİ) aşmaz; devam_ediyor işareti.
--     reklam_gunluk_topla, ham olayları silinmiş (toplanmış) bir gün için hiçbir şey yapmaz (elle yeniden çalıştırma geçmişi silmez).
--  3) Şikâyet: kişi başına saatte 10 / günde 30 şikâyet; kendiliğinden gizlemede yalnız en az 24 saatlik hesapların şikâyeti sayılır;
--     yönetici yorumu kendiliğinden gizlenmez.
--  4) Yasaklı sektör onayı görseldeki yazı (gorsel_metni) ve düğme yazısı (dugme_metni) değişince de sıfırlanır.
--  5) Ayrılmış kullanıcı adları: rn→m, 8→at/ate/b, "cfk" (ÇFK, C_F_K), sondaki rakamlar atılarak ve rakamlar silinerek de denenir
--     (tam eşleşme listesi dahil); ayrilmis_adlar tablosu (uygulama sahibinin adı, assets/ayar.js SAHIP_ADI). Ad değiştirme 7 günde bir.
--  6) Yorum kelime listesi: 4+ harfli kelimeler harf dışı karakterleri atılmış kopyada da aranır ("s.a.l.a.k", "s a l a k").
--  7) Haber: kaynak_gerekli (kadro / transfer / sakatlık / bilet haberi) işaretliyse kaynak zorunlu.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Yasaklı sektör onayı: görsel yazısı ve düğme yazısı da içerik sayılır
-- ---------------------------------------------------------------------
create or replace function public.reklamlar_sektor()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_icerik_degisti boolean;
  v_yeniden_onay boolean;
begin
  -- sürüm 015 (014 + gorsel_metni, dugme_metni)
  if tg_op = 'INSERT' then
    new.sektor_onay_zamani := case when new.sektor_onayi then now() end;
  else
    v_icerik_degisti := public.firma_anahtari(new.firma_adi) is distinct from public.firma_anahtari(old.firma_adi)
      or new.baglanti_url is distinct from old.baglanti_url
      or new.telefon is distinct from old.telefon
      or new.gorsel_url is distinct from old.gorsel_url
      or new.gorsel_kucuk_url is distinct from old.gorsel_kucuk_url
      or new.kisa_metin is distinct from old.kisa_metin
      or new.gorsel_metni is distinct from old.gorsel_metni
      or new.dugme_metni is distinct from old.dugme_metni;
    v_yeniden_onay := new.sektor_onayi
      and (not old.sektor_onayi or new.sektor_onay_zamani is distinct from old.sektor_onay_zamani);
    if v_yeniden_onay then
      new.sektor_onay_zamani := now();
    elsif v_icerik_degisti then
      new.sektor_onayi := false;
    end if;
    if not new.sektor_onayi then new.sektor_onay_zamani := null; end if;
    if new.sektor_onayi and not v_yeniden_onay then new.sektor_onay_zamani := old.sektor_onay_zamani; end if;
  end if;
  if new.durum = 'yayinda' and not new.sektor_onayi then
    raise exception 'Yayına almadan önce yasaklı sektör listesini onaylayın (firma, bağlantı, telefon, görsel, görsel yazısı, düğme yazısı ya da metin değiştiyse yeniden).'
      using errcode = '22023', hint = 'sektor_onayi';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 2) Reklam sayımı: dakika sınırları 120 / 20 / 240 (sekme sınırları aynı)
-- ---------------------------------------------------------------------
create or replace function public.reklam_olay_kaydet(
  p_reklam_id uuid, p_tur text, p_sayfa_ziyaret_id uuid, p_alan text, p_mac_id text default null,
  p_sekme_id uuid default null, p_eylem text default null
)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  -- sürüm 015 (reklam-mantik.js SINIRLAR ile aynı; test karşılaştırır)
  c_tiklama_siniri constant int := 5;                          -- bir sayfa ziyaretinde en fazla 5 tıklama (tüm reklamlar toplamı)
  c_tiklama_tekrar constant interval := interval '30 minutes'; -- aynı sekmede aynı reklamın aynı düğmesine bu sürede tekrar tıklama sayılmaz
  c_gosterim_dakika_siniri constant int := 120;                -- bir reklama dakikada en fazla 120 gösterim (bütün ziyaretçiler; maç günü zirvesi)
  c_tiklama_dakika_siniri constant int := 20;                  -- bir reklama dakikada en fazla 20 tıklama (bütün ziyaretçiler)
  c_yerlesim_dakika_siniri constant int := 240;                -- bir reklama dakikada en fazla 240 yerleşim (sayfa açılışı)
  c_sekme_saat_gosterim constant int := 20;                    -- bir sekmede bir reklama saatte en fazla 20 gösterim
  c_sekme_saat_tiklama constant int := 10;                     -- bir sekmede saatte en fazla 10 tıklama (tüm reklamlar)
  v_r public.reklamlar%rowtype;
  v_mac uuid := public.reklam_mac_uuid(p_mac_id);
  v_sekme uuid := coalesce(p_sekme_id, p_sayfa_ziyaret_id);
  v_sayi int;
  v_dakika timestamptz := date_trunc('minute', now());
  v_saat timestamptz := date_trunc('hour', now());
  v_eylem text := nullif(btrim(coalesce(p_eylem, '')), '');
begin
  if p_reklam_id is null or p_sayfa_ziyaret_id is null then
    raise exception 'Eksik bilgi.' using errcode = '22023';
  end if;
  if p_tur is null or p_tur not in ('gosterim', 'tiklama', 'yerlesim') then
    raise exception 'Geçersiz olay türü.' using errcode = '22023';
  end if;
  if p_tur <> 'tiklama' then
    v_eylem := null;
  elsif v_eylem is not null and v_eylem not in ('web', 'whatsapp', 'ara') then
    raise exception 'Geçersiz tıklama eylemi.' using errcode = '22023';
  end if;

  select * into v_r from public.reklamlar where id = p_reklam_id;
  if not found
     or v_r.durum <> 'yayinda'
     or not (v_r.baslangic <= now() and now() < v_r.bitis) then
    raise exception 'Reklam şu an yayında değil.' using errcode = '22023';
  end if;
  if v_r.alan::text is distinct from p_alan then
    raise exception 'Reklam bu alanda gösterilmiyor.' using errcode = '22023';
  end if;
  if v_r.alan = 'mac_sponsoru' then
    if v_r.mac_id is not null and v_r.mac_id is distinct from v_mac then
      raise exception 'Reklam bu maçta gösterilmiyor.' using errcode = '22023';
    end if;
  else
    v_mac := null;
  end if;
  if not public.reklam_su_an_gosterilen(p_reklam_id, p_alan, p_mac_id) then
    raise exception 'Reklam şu an bu alanda gösterilmiyor (sırada bekliyor).' using errcode = '22023';
  end if;

  if public.is_admin() then
    return 'yonetici';
  end if;

  if p_tur = 'yerlesim' then
    if exists (select 1 from public.reklam_yerlesimleri y where y.reklam_id = p_reklam_id and y.sayfa_ziyaret_id = p_sayfa_ziyaret_id) then
      return 'tekrar';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('reklam-dakika:' || p_reklam_id::text || ':yerlesim', 0));
    select count(*) into v_sayi from public.reklam_yerlesimleri y where y.created_at >= v_dakika and y.reklam_id = p_reklam_id;
    if v_sayi >= c_yerlesim_dakika_siniri then return 'sinir'; end if;
    insert into public.reklam_yerlesimleri (reklam_id, sayfa_ziyaret_id, alan, mac_id)
    values (p_reklam_id, p_sayfa_ziyaret_id, v_r.alan, v_mac)
    on conflict (reklam_id, sayfa_ziyaret_id) do nothing;
    if not found then return 'tekrar'; end if;
    return 'kaydedildi';
  end if;

  if p_tur = 'tiklama' then
    perform pg_advisory_xact_lock(hashtextextended('reklam-sekme:' || v_sekme::text, 0));
    perform pg_advisory_xact_lock(hashtextextended(p_sayfa_ziyaret_id::text, 0));
    if exists (select 1 from public.reklam_olaylari e
               where e.tur = 'tiklama' and e.reklam_id = p_reklam_id
                 and e.eylem is not distinct from v_eylem
                 and e.created_at > now() - c_tiklama_tekrar
                 and (e.sayfa_ziyaret_id = p_sayfa_ziyaret_id
                      or (p_sekme_id is not null and e.sekme_id = p_sekme_id))) then
      return 'tekrar';
    end if;
    select count(*) into v_sayi from public.reklam_olaylari
      where sayfa_ziyaret_id = p_sayfa_ziyaret_id and tur = 'tiklama';
    if v_sayi >= c_tiklama_siniri then return 'sinir'; end if;
    select coalesce(sum(s.sayi), 0) into v_sayi from public.reklam_sekme_sayaclari s
      where s.sekme_id = v_sekme and s.tur = 'tiklama' and s.saat = v_saat;
    if v_sayi >= c_sekme_saat_tiklama then
      insert into public.reklam_sinir_dakikalari as d (reklam_id, dakika, tur) values (p_reklam_id, v_dakika, 'tiklama')
      on conflict (reklam_id, dakika, tur) do update set reddedilen = d.reddedilen + 1;
      return 'sinir';
    end if;
  else
    if exists (select 1 from public.reklam_olaylari e
               where e.reklam_id = p_reklam_id and e.tur = 'gosterim' and e.sayfa_ziyaret_id = p_sayfa_ziyaret_id) then
      return 'tekrar';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('reklam-sekme:' || v_sekme::text, 0));
    select coalesce(sum(s.sayi), 0) into v_sayi from public.reklam_sekme_sayaclari s
      where s.sekme_id = v_sekme and s.reklam_id = p_reklam_id and s.tur = 'gosterim' and s.saat = v_saat;
    if v_sayi >= c_sekme_saat_gosterim then
      insert into public.reklam_sinir_dakikalari as d (reklam_id, dakika, tur) values (p_reklam_id, v_dakika, 'gosterim')
      on conflict (reklam_id, dakika, tur) do update set reddedilen = d.reddedilen + 1;
      return 'sinir';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('reklam-dakika:' || p_reklam_id::text || ':' || p_tur, 0));
  select count(*) into v_sayi from public.reklam_olaylari e
    where e.created_at >= v_dakika and e.reklam_id = p_reklam_id and e.tur = p_tur::public.reklam_olay_turu;
  if v_sayi >= (case when p_tur = 'tiklama' then c_tiklama_dakika_siniri else c_gosterim_dakika_siniri end) then
    insert into public.reklam_sinir_dakikalari as d (reklam_id, dakika, tur)
    values (p_reklam_id, v_dakika, p_tur::public.reklam_olay_turu)
    on conflict (reklam_id, dakika, tur) do update set reddedilen = d.reddedilen + 1;
    return 'sinir';
  end if;

  if p_tur = 'tiklama' then
    insert into public.reklam_olaylari (reklam_id, tur, sayfa_ziyaret_id, alan, mac_id, sekme_id, eylem)
    values (p_reklam_id, 'tiklama', p_sayfa_ziyaret_id, v_r.alan, v_mac, p_sekme_id, v_eylem);
  else
    insert into public.reklam_olaylari (reklam_id, tur, sayfa_ziyaret_id, alan, mac_id)
    values (p_reklam_id, 'gosterim', p_sayfa_ziyaret_id, v_r.alan, v_mac)
    on conflict (reklam_id, tur, sayfa_ziyaret_id) where tur = 'gosterim' do nothing;
    if not found then return 'tekrar'; end if;
  end if;

  delete from public.reklam_sekme_sayaclari where sekme_id = v_sekme and saat < v_saat - interval '2 hours';
  insert into public.reklam_sekme_sayaclari as s (sekme_id, reklam_id, tur, saat)
  values (v_sekme, p_reklam_id, p_tur::public.reklam_olay_turu, v_saat)
  on conflict (sekme_id, reklam_id, tur, saat) do update set sayi = s.sayi + 1;
  return 'kaydedildi';
end $$;
revoke execute on function public.reklam_olay_kaydet(uuid, text, uuid, text, text, uuid, text) from public;
grant execute on function public.reklam_olay_kaydet(uuid, text, uuid, text, text, uuid, text) to anon, authenticated;

-- Ham satır alarmı: son N günde (TSİ) bir reklamın ham olay + yerleşim satırı günde eşiği aşarsa listelenir (yalnız yönetici).
-- Olağan bir günde reklam başına birkaç bin satır beklenir; eşiği aşan gün otomatik trafik (ya da çok büyük bir maç) demektir.
create or replace function public.reklam_ham_satir_alarmi(p_gun_sayisi integer default 7)
returns table (gun date, reklam_id uuid, firma_adi text, ham_satir bigint, esik integer)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  -- sürüm 015 (reklam-mantik.js SINIRLAR.hamSatirAlarmi ile aynı; test karşılaştırır)
  c_ham_satir_esigi constant int := 20000;
  v_bas timestamptz;
begin
  if not public.is_admin() then
    raise exception 'Bu listeyi yalnızca yöneticiler görebilir.' using errcode = '42501';
  end if;
  v_bas := (((now() at time zone 'Europe/Istanbul')::date) - greatest(1, least(coalesce(p_gun_sayisi, 7), 90)) + 1)::timestamp at time zone 'Europe/Istanbul';
  return query
  with x as (
    select (o.created_at at time zone 'Europe/Istanbul')::date as g, o.reklam_id as rid from public.reklam_olaylari o where o.created_at >= v_bas
    union all
    select (y.created_at at time zone 'Europe/Istanbul')::date, y.reklam_id from public.reklam_yerlesimleri y where y.created_at >= v_bas
  )
  select x.g, x.rid, r.firma_adi, count(*)::bigint, c_ham_satir_esigi
  from x join public.reklamlar r on r.id = x.rid
  group by x.g, x.rid, r.firma_adi
  having count(*) > c_ham_satir_esigi
  order by x.g desc, count(*) desc;
end $$;
revoke execute on function public.reklam_ham_satir_alarmi(integer) from public, anon;
grant execute on function public.reklam_ham_satir_alarmi(integer) to authenticated;

-- ---------------------------------------------------------------------
-- 3) Günlük toplam: 'tiklayan' (tıklama yapılan farklı sayfa açılışı) + silinmiş günü koruma
-- ---------------------------------------------------------------------
alter table public.reklam_gunluk drop constraint if exists reklam_gunluk_tur_check;
alter table public.reklam_gunluk drop constraint if exists reklam_gunluk_tur;
alter table public.reklam_gunluk add constraint reklam_gunluk_tur check (tur in ('gosterim', 'tiklama', 'yerlesim', 'tiklayan'));
comment on column public.reklam_gunluk.tur is 'gosterim | tiklama | yerlesim | tiklayan (015: o gün en az bir tıklama yapılan farklı sayfa açılışı; tıklama oranının payı).';

create or replace function public.reklam_gunluk_topla(p_gun date)
returns bigint
language plpgsql volatile security definer set search_path = ''
as $$
declare
  -- sürüm 015
  v_bas timestamptz := p_gun::timestamp at time zone 'Europe/Istanbul';
  v_son timestamptz := (p_gun + 1)::timestamp at time zone 'Europe/Istanbul';
  v_sayi bigint;
begin
  if p_gun is null or p_gun >= (now() at time zone 'Europe/Istanbul')::date then
    return 0;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('reklam-gunluk:' || p_gun::text, 0));
  -- Toplanmış ve ham olayları silinmiş gün: toplam tek kaynaktır, dokunulmaz (elle yeniden çalıştırma geçmişi sıfırlamasın)
  if exists (select 1 from public.reklam_gunluk_toplanan t where t.gun = p_gun)
     and not exists (select 1 from public.reklam_olaylari e where e.created_at >= v_bas and e.created_at < v_son)
     and not exists (select 1 from public.reklam_yerlesimleri y where y.created_at >= v_bas and y.created_at < v_son) then
    return 0;
  end if;
  delete from public.reklam_gunluk where gun = p_gun;
  insert into public.reklam_gunluk (gun, reklam_id, alan, tur, eylem, sayi)
  select p_gun, e.reklam_id, e.alan, e.tur::text, coalesce(e.eylem, ''), count(*)
  from public.reklam_olaylari e
  where e.created_at >= v_bas and e.created_at < v_son
  group by e.reklam_id, e.alan, e.tur, coalesce(e.eylem, '')
  union all
  select p_gun, e.reklam_id, e.alan, 'tiklayan', '', count(distinct e.sayfa_ziyaret_id)
  from public.reklam_olaylari e
  where e.created_at >= v_bas and e.created_at < v_son and e.tur = 'tiklama'
  group by e.reklam_id, e.alan
  union all
  select p_gun, y.reklam_id, y.alan, 'yerlesim', '', count(*)
  from public.reklam_yerlesimleri y
  where y.created_at >= v_bas and y.created_at < v_son
  group by y.reklam_id, y.alan;
  get diagnostics v_sayi = row_count;
  insert into public.reklam_gunluk_toplanan (gun) values (p_gun)
  on conflict (gun) do update set toplandi = now();
  return v_sayi;
end $$;
revoke execute on function public.reklam_gunluk_topla(date) from public, anon, authenticated;

-- 014'te toplanmış günlere 'tiklayan' ekle (toplanma zamanına dokunmadan): ham olay varsa ondan, yoksa üst sınır olarak tıklama sayısı
insert into public.reklam_gunluk (gun, reklam_id, alan, tur, eylem, sayi)
select t.gun, e.reklam_id, e.alan, 'tiklayan', '', count(distinct e.sayfa_ziyaret_id)
from public.reklam_gunluk_toplanan t
join public.reklam_olaylari e
  on e.tur = 'tiklama'
 and e.created_at >= t.gun::timestamp at time zone 'Europe/Istanbul'
 and e.created_at < (t.gun + 1)::timestamp at time zone 'Europe/Istanbul'
group by t.gun, e.reklam_id, e.alan
on conflict (gun, reklam_id, alan, tur, eylem) do nothing;
insert into public.reklam_gunluk (gun, reklam_id, alan, tur, eylem, sayi)
select g.gun, g.reklam_id, g.alan, 'tiklayan', '', sum(g.sayi)
from public.reklam_gunluk g
where g.tur = 'tiklama'
group by g.gun, g.reklam_id, g.alan
on conflict (gun, reklam_id, alan, tur, eylem) do nothing;

-- Rapor verisi (014'ün yerine): + 'tiklayan'
create or replace function public.reklam_rapor_verisi(p_bas date, p_bit date)
returns table (gun date, reklam_id uuid, tur text, eylem text, sayi bigint)
language sql stable security definer set search_path = ''
as $$
  -- sürüm 015
  with t as (select gun from public.reklam_gunluk_toplanan where gun between p_bas and p_bit),
  o as (
    select (e.created_at at time zone 'Europe/Istanbul')::date as gun, e.reklam_id, e.tur::text as tur, coalesce(e.eylem, '') as eylem, e.sayfa_ziyaret_id
    from public.reklam_olaylari e
    where e.created_at >= p_bas::timestamp at time zone 'Europe/Istanbul'
      and e.created_at < (p_bit + 1)::timestamp at time zone 'Europe/Istanbul'
  ),
  y as (
    select (x.created_at at time zone 'Europe/Istanbul')::date as gun, x.reklam_id
    from public.reklam_yerlesimleri x
    where x.created_at >= p_bas::timestamp at time zone 'Europe/Istanbul'
      and x.created_at < (p_bit + 1)::timestamp at time zone 'Europe/Istanbul'
  )
  select g.gun, g.reklam_id, g.tur, g.eylem, sum(g.sayi)::bigint
  from public.reklam_gunluk g
  where g.gun in (select gun from t)
  group by g.gun, g.reklam_id, g.tur, g.eylem
  union all
  select o.gun, o.reklam_id, o.tur, o.eylem, count(*)::bigint
  from o where o.gun not in (select gun from t)
  group by o.gun, o.reklam_id, o.tur, o.eylem
  union all
  select o.gun, o.reklam_id, 'tiklayan', '', count(distinct o.sayfa_ziyaret_id)::bigint
  from o where o.tur = 'tiklama' and o.gun not in (select gun from t)
  group by o.gun, o.reklam_id
  union all
  select y.gun, y.reklam_id, 'yerlesim', '', count(*)::bigint
  from y where y.gun not in (select gun from t)
  group by y.gun, y.reklam_id
$$;
revoke execute on function public.reklam_rapor_verisi(date, date) from public, anon, authenticated;

-- reklam_raporu (014'ün yerine; ilk 20 sütun aynı sırada): tıklama oranı = tıklanan farklı sayfa açılışı ÷ gösterim (≤ %100),
-- dönem ve yayın günü bugünü (TSİ) aşmaz; + tiklayan_ziyaret, devam_ediyor (reklam yayında ve dönem bugünde bitiyor)
drop function if exists public.reklam_raporu(date, date);
create function public.reklam_raporu(p_baslangic_tarih date, p_bitis_tarih date)
returns table (
  reklam_id uuid, firma_adi text, alan text, mac_id uuid,
  gosterim bigint, tiklama bigint, tiklama_orani numeric, supheli_dakika bigint,
  firma_anahtar text, tiklama_web bigint, tiklama_whatsapp bigint, tiklama_ara bigint,
  yerlesim bigint, gorunurluk_orani numeric,
  yayin_baslangic timestamptz, yayin_bitis timestamptz, donem_baslangic date, donem_bitis date,
  yayin_gun integer, gunluk_ortalama_gosterim numeric,
  tiklayan_ziyaret bigint, devam_ediyor boolean
)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_bas timestamptz;
  v_son timestamptz;
  v_bugun date := (now() at time zone 'Europe/Istanbul')::date;
begin
  -- sürüm 015
  if not public.is_admin() then
    raise exception 'Bu raporu yalnızca yöneticiler görebilir.' using errcode = '42501';
  end if;
  if p_baslangic_tarih is null or p_bitis_tarih is null or p_bitis_tarih < p_baslangic_tarih then
    raise exception 'Tarih aralığı geçersiz.' using errcode = '22023';
  end if;
  v_bas := p_baslangic_tarih::timestamp at time zone 'Europe/Istanbul';
  v_son := (p_bitis_tarih + 1)::timestamp at time zone 'Europe/Istanbul';

  return query
  with v as (select * from public.reklam_rapor_verisi(p_baslangic_tarih, p_bitis_tarih)),
  o as (
    select v.reklam_id,
           sum(v.sayi) filter (where v.tur = 'gosterim') as g,
           sum(v.sayi) filter (where v.tur = 'tiklama') as t,
           sum(v.sayi) filter (where v.tur = 'tiklayan') as tz,
           sum(v.sayi) filter (where v.tur = 'tiklama' and v.eylem = 'web') as tw,
           sum(v.sayi) filter (where v.tur = 'tiklama' and v.eylem = 'whatsapp') as twa,
           sum(v.sayi) filter (where v.tur = 'tiklama' and v.eylem = 'ara') as ta,
           sum(v.sayi) filter (where v.tur = 'yerlesim') as y
    from v group by v.reklam_id
  ), s as (
    select d.reklam_id, count(distinct d.dakika) as m
    from public.reklam_sinir_dakikalari d
    where d.dakika >= v_bas and d.dakika < v_son
    group by d.reklam_id
  ), r as (
    select x.*,
           greatest(p_baslangic_tarih, (x.baslangic at time zone 'Europe/Istanbul')::date) as db,
           least(p_bitis_tarih, ((x.bitis - interval '1 microsecond') at time zone 'Europe/Istanbul')::date, v_bugun) as ds
    from public.reklamlar x
  )
  select r.id, r.firma_adi, r.alan::text, r.mac_id,
         coalesce(o.g, 0)::bigint, coalesce(o.t, 0)::bigint,
         case when coalesce(o.g, 0) > 0 then round(100.0 * least(coalesce(o.tz, 0), o.g) / o.g, 2) end,
         coalesce(s.m, 0)::bigint,
         r.firma_anahtar,
         coalesce(o.tw, 0)::bigint, coalesce(o.twa, 0)::bigint, coalesce(o.ta, 0)::bigint,
         coalesce(o.y, 0)::bigint,
         case when coalesce(o.y, 0) > 0 then round(100.0 * least(coalesce(o.g, 0), o.y) / o.y, 2) end,
         r.baslangic, r.bitis,
         case when r.ds >= r.db then r.db end, case when r.ds >= r.db then r.ds end,
         greatest(0, r.ds - r.db + 1)::integer,
         case when r.ds >= r.db then round(coalesce(o.g, 0)::numeric / (r.ds - r.db + 1), 1) end,
         coalesce(o.tz, 0)::bigint,
         (r.ds >= r.db and r.ds = v_bugun and r.durum = 'yayinda' and r.bitis > now())
  from r
  left join o on o.reklam_id = r.id
  left join s on s.reklam_id = r.id
  where o.reklam_id is not null or s.reklam_id is not null
     or (r.durum <> 'taslak' and r.baslangic < v_son and r.bitis > v_bas)
  order by coalesce(o.g, 0) desc, r.firma_adi;
end $$;
revoke execute on function public.reklam_raporu(date, date) from public, anon;
grant execute on function public.reklam_raporu(date, date) to authenticated;

-- ---------------------------------------------------------------------
-- 4) Şikâyet: kişi başına sınır, hesap yaşı, yönetici yorumu
-- ---------------------------------------------------------------------
create index if not exists yorum_sikayetleri_eden_zaman on public.yorum_sikayetleri (sikayet_eden, created_at);

-- Şikâyet hakkı: saatte 10, günde 30 (SECURITY DEFINER: şikâyet tablosunu yalnız yönetici okur). Tetikleyiciden çağrılır.
create or replace function public.sikayet_hakki()
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  -- sürüm 015 (assets/kurallar.js SIKAYET_SINIRLARI ile aynı; test karşılaştırır)
  c_saat_siniri constant int := 10;
  c_gun_siniri constant int := 30;
  v_uid uuid := auth.uid();
  v_sayi int;
begin
  if v_uid is null then return; end if;
  perform pg_advisory_xact_lock(hashtextextended('sikayet:' || v_uid::text, 0));
  select count(*) into v_sayi from public.yorum_sikayetleri s where s.sikayet_eden = v_uid and s.created_at > now() - interval '1 hour';
  if v_sayi >= c_saat_siniri then
    raise exception 'Bir saatte en fazla 10 şikâyet gönderebilirsin. Biraz sonra yeniden dene.' using errcode = 'P0001', hint = 'sikayet_siniri';
  end if;
  select count(*) into v_sayi from public.yorum_sikayetleri s where s.sikayet_eden = v_uid and s.created_at > now() - interval '24 hours';
  if v_sayi >= c_gun_siniri then
    raise exception 'Bir günde en fazla 30 şikâyet gönderebilirsin. Yarın yeniden dene.' using errcode = 'P0001', hint = 'sikayet_siniri';
  end if;
end $$;
revoke execute on function public.sikayet_hakki() from public, anon;
grant execute on function public.sikayet_hakki() to authenticated;

create or replace function public.sikayet_kontrol()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_sahip uuid;
begin
  -- sürüm 015 (014 + kişi başına saatte 10 / günde 30)
  if current_user in ('anon', 'authenticated') then
    if auth.uid() is null then
      raise exception 'Şikâyet için giriş yap.' using errcode = '42501';
    end if;
    if public.engelli_mi() then
      raise exception 'Hesabın topluluk kuralları nedeniyle kapatıldı; şikâyet gönderemezsin.' using errcode = '42501', hint = 'engelli';
    end if;
    new.sikayet_eden := auth.uid();
    new.created_at := now();
    select y.kullanici_id into v_sahip from public.yorumlar y where y.id = new.yorum_id;
    if not found then
      raise exception 'Yorum bulunamadı.' using errcode = '22023';
    end if;
    if v_sahip = auth.uid() then
      raise exception 'Kendi yorumunu şikâyet edemezsin; istersen silebilirsin.' using errcode = '22023';
    end if;
    perform public.sikayet_hakki();
  end if;
  return new;
end;
$$;

-- Farklı 3 hesaptan şikâyet → kendiliğinden gizli. 015: yalnız şikâyet anında en az 24 saatlik hesaplar sayılır;
-- yönetici yorumu kendiliğinden gizlenmez (yönetici kuyrukta görür).
create or replace function public.sikayet_otomatik_gizle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_esik constant int := 3;
  c_hesap_yasi constant interval := interval '24 hours';
  v_gizli boolean;
  v_zaman timestamptz;
  v_sahip uuid;
  v_sayi int;
begin
  -- sürüm 015
  select y.gizli, y.moderasyon_zamani, y.kullanici_id into v_gizli, v_zaman, v_sahip from public.yorumlar y where y.id = new.yorum_id for update;
  if not found or v_gizli then return null; end if;
  if exists (select 1 from public.profiles p where p.id = v_sahip and p.role = 'admin') then return null; end if;
  select count(distinct s.sikayet_eden) into v_sayi
    from public.yorum_sikayetleri s
    join public.profiles p on p.id = s.sikayet_eden
    where s.yorum_id = new.yorum_id
      and (v_zaman is null or s.created_at > v_zaman)
      and p.created_at <= s.created_at - c_hesap_yasi;
  if v_sayi >= c_esik then
    update public.yorumlar set gizli = true, gizleme_nedeni = 'sikayet' where id = new.yorum_id;
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------
-- 5) Ayrılmış kullanıcı adları + ad değiştirme 7 günde bir
-- ---------------------------------------------------------------------
-- Uygulama sahibinin (ve istenirse başka kişilerin) adı: README "Künye" adımında SAHIP_ADI (assets/ayar.js) buraya eklenir.
create table if not exists public.ayrilmis_adlar (
  anahtar     text primary key check (anahtar ~ '^[a-z]{3,40}$'),
  ad          text not null,
  created_at  timestamptz not null default now()
);
comment on table public.ayrilmis_adlar is 'Ek ayrılmış adlar (uygulama sahibinin adı: assets/ayar.js SAHIP_ADI). anahtar = parantez içi atılmış, katlanmış, yalnız harf. JS: kurallar.js sahipAnahtari.';
create or replace function public.ayrilmis_ad_anahtari(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(public.metin_katla(regexp_replace(coalesce(p, ''), '\([^)]*\)', '', 'g')), '[^a-z]', '', 'g')
$$;
create or replace function public.ayrilmis_adlar_katla()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.anahtar := public.ayrilmis_ad_anahtari(new.ad);
  return new;
end;
$$;
drop trigger if exists ayrilmis_adlar_katla on public.ayrilmis_adlar;
create trigger ayrilmis_adlar_katla before insert or update on public.ayrilmis_adlar
  for each row execute function public.ayrilmis_adlar_katla();
alter table public.ayrilmis_adlar enable row level security;
drop policy if exists ayrilmis_okuma on public.ayrilmis_adlar;
create policy ayrilmis_okuma on public.ayrilmis_adlar for select to authenticated using ((select public.is_admin()));
drop policy if exists ayrilmis_ekleme on public.ayrilmis_adlar;
create policy ayrilmis_ekleme on public.ayrilmis_adlar for insert to authenticated with check ((select public.is_admin()));
drop policy if exists ayrilmis_silme on public.ayrilmis_adlar;
create policy ayrilmis_silme on public.ayrilmis_adlar for delete to authenticated using ((select public.is_admin()));
revoke all on public.ayrilmis_adlar from anon;
revoke update, truncate on public.ayrilmis_adlar from authenticated;

-- Denenen biçimler (assets/kurallar.js kullaniciAdiAyrilmis ile AYNI):
--   taban: katlanmış ad ve sondaki rakam/_/. atılmış hâli; her tabanda 8 → at | ate | b, sonra
--   (a) 0→o 1→i 3→e 4→a 5→s 7→t @→a; (b) aynısı ama 1→l; (d) rakamlar silinmiş; harf dışı atılır;
--   hepsine ayrıca l→i ve rn→m. Kök listesi içinde geçerse, tam liste ya da ayrilmis_adlar birebir tutarsa ayrılmıştır.
create or replace function public.kullanici_adi_ayrilmis(p_ad text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  -- sürüm 015
  v text := public.metin_katla(p_ad);
  k constant text := '(admin|yonetici|yonetim|moderator|resmi|corumfk|corumspor|kulup|yetkili|baskan|teknikdirektor|kirmizisimsek|cfk)';
  t constant text[] := array['destek', 'mod', 'sistem', 'corumsportaraftar', 'support', 'official', 'root', 'kaptan', 'antrenor'];
  tabanlar text[];
  taban text;
  e text;
  x text;
  adaylar text[] := '{}';
begin
  tabanlar := array[v, regexp_replace(v, '[0-9_.]+$', '')];
  foreach taban in array tabanlar loop
    foreach e in array array['at', 'ate', 'b'] loop
      x := replace(taban, '8', e);
      adaylar := adaylar || regexp_replace(translate(x, '013457@', 'oieasta'), '[^a-z]', '', 'g')
                         || regexp_replace(translate(x, '013457@', 'oleasta'), '[^a-z]', '', 'g');
    end loop;
    adaylar := adaylar || regexp_replace(taban, '[^a-z]', '', 'g');
  end loop;
  adaylar := adaylar || array(select translate(a, 'l', 'i') from unnest(adaylar) a);
  adaylar := adaylar || array(select replace(a, 'rn', 'm') from unnest(adaylar) a);
  return exists (select 1 from unnest(adaylar) a where a ~ k or a = any (t))
      or exists (select 1 from public.ayrilmis_adlar r where r.anahtar = any (adaylar));
end;
$$;
revoke execute on function public.kullanici_adi_ayrilmis(text) from public;
grant execute on function public.kullanici_adi_ayrilmis(text) to anon, authenticated;

alter table public.profiles add column if not exists ad_degisti timestamptz;
comment on column public.profiles.ad_degisti is 'Kullanıcı adının son değiştirildiği an (015: 7 günde bir). Sunucu yazar; ziyaretçi ve üyeler okuyamaz (sütun yetkisi yok).';

-- profil_koruma (013'ün yerine): + ad değiştirme 7 günde bir (yönetici muaf), ad_degisti'yi kişi kendisi değiştiremez
create or replace function public.profil_koruma()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  c_ad_degistirme_araligi constant interval := interval '7 days';
begin
  -- sürüm 015
  if current_user in ('anon', 'authenticated') then
    if new.id is distinct from old.id then
      raise exception 'Profil kimliği değiştirilemez.' using errcode = '42501';
    end if;
    if new.role is distinct from old.role
       and (new.id = auth.uid() or not public.is_admin()) then
      raise exception 'Rol değiştirme yetkiniz yok.' using errcode = '42501';
    end if;
    if new.engelli is distinct from old.engelli
       and (new.id = auth.uid() or not public.is_admin()) then
      raise exception 'Yorum yasağını yalnız yönetici değiştirebilir.' using errcode = '42501';
    end if;
    if new.kullanici_adi is distinct from old.kullanici_adi then
      if public.kullanici_adi_ayrilmis(new.kullanici_adi) then
        raise exception 'Bu kullanıcı adı kullanılamaz: yönetici, resmî hesap ya da kulüp gibi görünen adlar ayrılmıştır.'
          using errcode = '22023';
      end if;
      if not public.is_admin() and old.ad_degisti is not null and old.ad_degisti > now() - c_ad_degistirme_araligi then
        raise exception 'Kullanıcı adını 7 günde bir değiştirebilirsin.' using errcode = 'P0001', hint = 'ad_degisti';
      end if;
      new.ad_degisti := now();
    else
      new.ad_degisti := old.ad_degisti;
    end if;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 6) Yorum kelime listesi: harf dışı karakterleri atılmış kopya (4+ harfli kelimeler)
-- ---------------------------------------------------------------------
-- "s.a.l.a.k" → "salak", "s a l a k" → "salak" (tek harfli sözcük dizileri birleşir); "kalasalak" yine eşleşmez (sözcük başı).
-- JS: assets/kurallar.js yorumSikistir.
create or replace function public.yorum_sikistir(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(
           btrim(regexp_replace(
             regexp_replace(translate(public.metin_katla(p), '013457@$', 'oieastas'), '[^a-z[:space:]]+', '', 'g'),
             '[[:space:]]+', ' ', 'g')),
           '\m([a-z]) (?=[a-z]\M)', '\1', 'g')
$$;

create or replace function public.yorum_onay_gerekli(p_metin text, p_mac_id uuid, p_gol_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  -- sürüm 015
  select exists (
      select 1 from public.yorum_kelimeleri k
      where position(' ' || k.kelime in ' ' || public.yorum_katla(p_metin)) > 0
         or (char_length(k.kelime) >= 4 and position(' ' || k.kelime in ' ' || public.yorum_sikistir(p_metin)) > 0))
    or exists (
      select 1 from public.maclar m
      where m.on_onay
        and m.id = coalesce(p_mac_id, (select g.mac_id from public.goller g where g.id = p_gol_id))
        and now() >= m.tarih - interval '2 hours' and now() < m.tarih + interval '24 hours')
$$;
revoke execute on function public.yorum_onay_gerekli(text, uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 7) Haber: kaynak_gerekli (kadro / transfer / sakatlık / bilet haberi)
-- ---------------------------------------------------------------------
alter table public.haberler add column if not exists kaynak_gerekli boolean not null default false;
comment on column public.haberler.kaynak_gerekli is 'Kadro / transfer / sakatlık / bilet haberi: işaretliyse kaynak zorunlu (015).';

create or replace function public.haber_kaynak_kontrol()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- haber_duzeltme'den SONRA çalışır (ad sırası): boş kaynak orada null'a çevrilmiştir
  if new.kaynak_gerekli and new.kaynak is null then
    raise exception 'Kadro, transfer, sakatlık ya da bilet haberinde kaynak zorunlu (ör. "Kulüp açıklaması").' using errcode = '22023', hint = 'kaynak';
  end if;
  return new;
end;
$$;
drop trigger if exists haber_kaynak_kontrol on public.haberler;
create trigger haber_kaynak_kontrol before insert or update on public.haberler
  for each row execute function public.haber_kaynak_kontrol();
alter table public.haberler drop constraint if exists haberler_kaynak_gerekli;
alter table public.haberler add constraint haberler_kaynak_gerekli check (not kaynak_gerekli or kaynak is not null);

-- ---------------------------------------------------------------------
-- Yetkiler (Supabase bunları zaten verir; düz Postgres'te de çalışsın diye açıkça). Asıl koruma RLS.
-- ---------------------------------------------------------------------
grant select, insert, delete on public.ayrilmis_adlar to authenticated;
revoke truncate on public.ayrilmis_adlar from anon, authenticated;


-- ===================== 016_mac_ozeti.sql =====================
-- =====================================================================
-- Çorum Taraftar: maç özeti videosu ve hafta numarası (016)
-- Sıra: 001 → … → 015 → 016. Tekrar çalıştırılabilir (if not exists / drop if exists).
--
--  maclar.hafta              ligin kaçıncı haftası (gol arşivinde "1. Hafta · Galatasaray (D) 2-2"); kupa/hazırlık maçında boş
--  maclar.ozet_video_url     maçın özet videosu: gol videosuyla AYNI kural (gol_video_gecerli: YouTube ya da sitenin kendi
--                            gol-videolari kovasındaki .mp4). Golsüz maçın özeti de izlenebilsin diye maça bağlı.
--  maclar.ozet_video_kaynak  videonun hak sahibi / kaynağı (ör. "beIN SPORTS Türkiye YouTube kanalı"); videolu maçta zorunlu
-- Okuma: maclar zaten herkese açık (mac_okuma), yazma yalnız yönetici (001); yeni politika gerekmez.
-- =====================================================================

alter table public.maclar add column if not exists hafta smallint;
alter table public.maclar add column if not exists ozet_video_url text;
alter table public.maclar add column if not exists ozet_video_kaynak text;

alter table public.maclar drop constraint if exists maclar_hafta;
alter table public.maclar add constraint maclar_hafta check (hafta is null or hafta between 1 and 60);
alter table public.maclar drop constraint if exists maclar_ozet_video;
alter table public.maclar add constraint maclar_ozet_video check (public.gol_video_gecerli(ozet_video_url));
alter table public.maclar drop constraint if exists maclar_ozet_kaynak;
alter table public.maclar add constraint maclar_ozet_kaynak check (
  (ozet_video_kaynak is null or char_length(btrim(ozet_video_kaynak)) between 3 and 120)
  and (ozet_video_url is null or ozet_video_kaynak is not null));

comment on column public.maclar.hafta is 'Ligin kaçıncı haftası (1-60). Kupa ve hazırlık maçında boş.';
comment on column public.maclar.ozet_video_url is 'Maç özeti videosu: YouTube ya da gol-videolari kovasındaki .mp4 (gol_video_gecerli). Maç sayfasında dokununca yüklenir.';
comment on column public.maclar.ozet_video_kaynak is 'Özet videonun hak sahibi / kaynağı (ör. "beIN SPORTS Türkiye YouTube kanalı"); videolu maçta zorunlu.';

-- Boş metinleri null yap (panel boş alan gönderir); kaynak yazılmadıysa Türkçe mesaj
create or replace function public.mac_ozet_kontrol()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.ozet_video_url := nullif(btrim(coalesce(new.ozet_video_url, '')), '');
  new.ozet_video_kaynak := nullif(btrim(coalesce(new.ozet_video_kaynak, '')), '');
  if new.ozet_video_url is not null and new.ozet_video_kaynak is null then
    raise exception 'Özet videonun kaynağını yazın (ör. "beIN SPORTS Türkiye YouTube kanalı").' using errcode = '22023', hint = 'ozet_video_kaynak';
  end if;
  return new;
end;
$$;
drop trigger if exists mac_ozet_kontrol on public.maclar;
create trigger mac_ozet_kontrol before insert or update on public.maclar
  for each row execute function public.mac_ozet_kontrol();


-- ===================== 017_yanit_profil_foto.sql =====================
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


-- ===================== 018_gol_ani_asist.sql =====================
-- =====================================================================
-- Çorum Taraftar: gol anı, asist ve maç kadrosu (018)
-- Sıra: 001 → … → 017 → 018. Tekrar çalıştırılabilir (if not exists / create or replace / drop if exists).
-- 014/015/016/017'nin "sürüm" işaretli fonksiyonlarına DOKUNMAZ: yeni kurallar kısıt ve ayrı tetikleyicilerde.
--
--  1) goller.asist                 asist yapan oyuncunun adı (oyuncular.ad ile aynı yazılır; oyuncu sayfası adla eşler)
--  2) goller.video_baslangic_sn    gol anı: YouTube videosunun yalnız bu aralığı oynatılır (embed start/end). İkisi birlikte,
--     goller.video_bitis_sn        bitiş > başlangıç, 0-21600 sn; yalnız YouTube videoda (kendi .mp4'ümüz zaten yalnız golü içerir).
--  3) mac_oyunculari               maç kadrosu ve olaylar: ilk 11, giriş/çıkış dakikası, sarı/kırmızı kart. Oyuncu sayfasındaki
--                                  Maç / İlk 11 / Dakika / Sarı / Kırmızı bundan hesaplanır (kurallar.js oynamaDakikasi; uzatma = 90).
--                                  Herkes okur, yalnız yönetici yazar.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1-2) Gol: asist ve video aralığı
-- ---------------------------------------------------------------------
alter table public.goller add column if not exists asist text;
alter table public.goller add column if not exists video_baslangic_sn smallint;
alter table public.goller add column if not exists video_bitis_sn smallint;

alter table public.goller drop constraint if exists goller_asist;
alter table public.goller add constraint goller_asist check (asist is null or char_length(btrim(asist)) between 2 and 80);
alter table public.goller drop constraint if exists goller_video_aralik;
alter table public.goller add constraint goller_video_aralik check (
  (video_baslangic_sn is null) = (video_bitis_sn is null)
  and (video_baslangic_sn is null or (
    video_baslangic_sn between 0 and 21600 and video_bitis_sn between 0 and 21600 and video_bitis_sn > video_baslangic_sn
    and video_url ~ '^https://(www\.|m\.)?(youtube\.com|youtube-nocookie\.com|youtu\.be)/')));

comment on column public.goller.asist is 'Asist yapan oyuncu (oyuncular.ad ile aynı yazılır). Boş: asist yok / bilinmiyor.';
comment on column public.goller.video_baslangic_sn is 'Gol anı başlangıcı (sn): YouTube gömmesinde start. Bitişle birlikte; yalnız YouTube.';
comment on column public.goller.video_bitis_sn is 'Gol anı bitişi (sn): YouTube gömmesinde end. Başlangıçtan büyük.';

-- Boş asist null olur; aralık hataları Türkçe mesajla (kısıt yine son savunma)
create or replace function public.gol_ani_kontrol()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.asist := nullif(btrim(coalesce(new.asist, '')), '');
  if (new.video_baslangic_sn is null) <> (new.video_bitis_sn is null) then
    raise exception 'Video başlangıç ve bitiş saniyesini birlikte yazın (ya da ikisini de boş bırakın).' using errcode = '22023', hint = 'video_baslangic_sn';
  end if;
  if new.video_baslangic_sn is not null then
    if new.video_bitis_sn <= new.video_baslangic_sn then
      raise exception 'Video bitişi başlangıçtan sonra olmalı.' using errcode = '22023', hint = 'video_bitis_sn';
    end if;
    if new.video_url is null or new.video_url !~ '^https://(www\.|m\.)?(youtube\.com|youtube-nocookie\.com|youtu\.be)/' then
      raise exception 'Video aralığı yalnız YouTube videosunda kullanılır.' using errcode = '22023', hint = 'video_baslangic_sn';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists gol_ani_kontrol on public.goller;
create trigger gol_ani_kontrol before insert or update on public.goller
  for each row execute function public.gol_ani_kontrol();

-- ---------------------------------------------------------------------
-- 3) Maç kadrosu
-- ---------------------------------------------------------------------
create table if not exists public.mac_oyunculari (
  mac_id uuid not null references public.maclar (id) on delete cascade,
  oyuncu text not null,
  ilk11 boolean not null default false,
  giris_dk smallint,
  cikis_dk smallint,
  sari smallint not null default 0,
  kirmizi boolean not null default false,
  primary key (mac_id, oyuncu)
);
alter table public.mac_oyunculari drop constraint if exists mac_oyunculari_oyuncu;
alter table public.mac_oyunculari add constraint mac_oyunculari_oyuncu check (char_length(btrim(oyuncu)) between 2 and 80);
alter table public.mac_oyunculari drop constraint if exists mac_oyunculari_dakika;
alter table public.mac_oyunculari add constraint mac_oyunculari_dakika check (
  (giris_dk is null or giris_dk between 0 and 130) and (cikis_dk is null or cikis_dk between 0 and 130)
  and (not ilk11 or giris_dk is null)
  and (giris_dk is null or cikis_dk is null or cikis_dk >= giris_dk));
alter table public.mac_oyunculari drop constraint if exists mac_oyunculari_kart;
alter table public.mac_oyunculari add constraint mac_oyunculari_kart check (sari between 0 and 2);
create index if not exists mac_oyunculari_oyuncu_idx on public.mac_oyunculari (oyuncu);
comment on table public.mac_oyunculari is 'Maç kadrosu (yalnız Çorum FK oyuncuları): ilk 11, giriş/çıkış dakikası, kartlar. Kırmızıda çıkış = kırmızı dakikası; uzatma 90 sayılır.';

create or replace function public.mac_oyuncusu_kontrol()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.oyuncu := regexp_replace(btrim(new.oyuncu), '\s+', ' ', 'g');
  if new.ilk11 and new.giris_dk is not null then
    raise exception 'İlk 11''deki oyuncunun giriş dakikası olmaz.' using errcode = '22023', hint = 'giris_dk';
  end if;
  if new.giris_dk is not null and new.cikis_dk is not null and new.cikis_dk < new.giris_dk then
    raise exception 'Çıkış dakikası giriş dakikasından önce olamaz.' using errcode = '22023', hint = 'cikis_dk';
  end if;
  return new;
end;
$$;
drop trigger if exists mac_oyuncusu_kontrol on public.mac_oyunculari;
create trigger mac_oyuncusu_kontrol before insert or update on public.mac_oyunculari
  for each row execute function public.mac_oyuncusu_kontrol();

alter table public.mac_oyunculari enable row level security;
drop policy if exists mac_oyuncusu_okuma on public.mac_oyunculari;
create policy mac_oyuncusu_okuma on public.mac_oyunculari for select using (true);
drop policy if exists mac_oyuncusu_ekleme on public.mac_oyunculari;
create policy mac_oyuncusu_ekleme on public.mac_oyunculari for insert to authenticated with check ((select public.is_admin()));
drop policy if exists mac_oyuncusu_guncelleme on public.mac_oyunculari;
create policy mac_oyuncusu_guncelleme on public.mac_oyunculari for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists mac_oyuncusu_silme on public.mac_oyunculari;
create policy mac_oyuncusu_silme on public.mac_oyunculari for delete to authenticated using ((select public.is_admin()));

grant select on public.mac_oyunculari to anon, authenticated;
grant insert, update, delete on public.mac_oyunculari to authenticated;
revoke truncate on public.mac_oyunculari from anon, authenticated;


-- ===================== 019_piyasa_rakip_gol.sql =====================
-- =====================================================================
-- Çorum Taraftar: piyasa değeri ve rakip golleri (019)
-- Sıra: 001 → … → 018 → 019. Tekrar çalıştırılabilir (if not exists / create or replace / drop if exists).
-- 014-018'in "sürüm" işaretli fonksiyonlarına DOKUNMAZ: yeni kurallar kısıtta ve ayrı tetikleyicide.
--
--  1) oyuncular.piyasa_degeri_eur      Tahmini piyasa değeri (EUR, tam sayı; 0-500 milyon). Değer varsa tarih ve kaynak zorunlu
--     oyuncular.piyasa_degeri_tarih    (oyuncu sayfasında "Transfermarkt'a göre, 6 Kasım 2026"). Herkes okur (oyuncular'ın mevcut
--     oyuncular.piyasa_degeri_kaynak   okuma politikası ve sütun yetkisi), yalnız yönetici yazar (mevcut yazma politikaları).
--                                      Otomatik çekme YOK: yönetici panelden (ya da tek seferlik veri SQL'iyle) girer.
--  2) rakip_goller                     Rakibin golleri (maç sayfasındaki Olaylar çizelgesi skorla tutsun diye). Kendi kalesine:
--                                      rakibe yazılan gol, oyuncu = kendi kalesine atan (Çorum FK oyuncusu). Herkes okur, yalnız
--                                      yönetici yazar, TRUNCATE yok.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Piyasa değeri
-- ---------------------------------------------------------------------
alter table public.oyuncular add column if not exists piyasa_degeri_eur integer;
alter table public.oyuncular add column if not exists piyasa_degeri_tarih date;
alter table public.oyuncular add column if not exists piyasa_degeri_kaynak text;

alter table public.oyuncular drop constraint if exists oyuncular_piyasa_degeri;
alter table public.oyuncular add constraint oyuncular_piyasa_degeri check (
  (piyasa_degeri_eur is null or piyasa_degeri_eur between 0 and 500000000)
  and (piyasa_degeri_kaynak is null or char_length(btrim(piyasa_degeri_kaynak)) between 2 and 80)
  and (piyasa_degeri_eur is null or (piyasa_degeri_tarih is not null and piyasa_degeri_kaynak is not null)));

comment on column public.oyuncular.piyasa_degeri_eur is 'Tahmini piyasa değeri (EUR). Boş: gösterilmez. Değer varsa tarih ve kaynak zorunlu.';
comment on column public.oyuncular.piyasa_degeri_tarih is 'Değerin geçerli olduğu / okunduğu gün (oyuncu sayfasında kaynak satırı).';
comment on column public.oyuncular.piyasa_degeri_kaynak is 'Değerin kaynağı (2-80 karakter), ör. Transfermarkt.';

-- Boş kaynak null olur; eksik alanlar Türkçe mesajla (kısıt yine son savunma)
create or replace function public.oyuncu_piyasa_kontrol()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.piyasa_degeri_kaynak := nullif(btrim(coalesce(new.piyasa_degeri_kaynak, '')), '');
  if new.piyasa_degeri_eur is not null then
    if new.piyasa_degeri_eur < 0 or new.piyasa_degeri_eur > 500000000 then
      raise exception 'Piyasa değeri 0 ile 500 milyon € arasında olmalı.' using errcode = '22023', hint = 'piyasa_degeri_eur';
    end if;
    if new.piyasa_degeri_tarih is null or new.piyasa_degeri_kaynak is null then
      raise exception 'Piyasa değeri girildiyse tarihini ve kaynağını da yazın.' using errcode = '22023', hint = 'piyasa_degeri_kaynak';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists oyuncu_piyasa_kontrol on public.oyuncular;
create trigger oyuncu_piyasa_kontrol before insert or update on public.oyuncular
  for each row execute function public.oyuncu_piyasa_kontrol();

-- ---------------------------------------------------------------------
-- 2) Rakip golleri
-- ---------------------------------------------------------------------
create table if not exists public.rakip_goller (
  id uuid primary key default gen_random_uuid(),
  mac_id uuid not null references public.maclar (id) on delete cascade,
  dakika smallint not null,
  ek_dakika smallint,
  oyuncu text not null,
  penalti boolean not null default false,
  kendi_kalesine boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.rakip_goller drop constraint if exists rakip_goller_dakika;
alter table public.rakip_goller add constraint rakip_goller_dakika check (dakika between 1 and 130 and (ek_dakika is null or ek_dakika between 1 and 20));
alter table public.rakip_goller drop constraint if exists rakip_goller_oyuncu;
alter table public.rakip_goller add constraint rakip_goller_oyuncu check (char_length(btrim(oyuncu)) between 2 and 80);
alter table public.rakip_goller drop constraint if exists rakip_goller_tur;
alter table public.rakip_goller add constraint rakip_goller_tur check (not (penalti and kendi_kalesine));
create index if not exists rakip_goller_mac_idx on public.rakip_goller (mac_id, dakika);
comment on table public.rakip_goller is 'Rakibin golleri (maç olayları çizelgesi). Kendi kalesine: rakibe yazılan gol, oyuncu = atan Çorum FK oyuncusu.';

create or replace function public.rakip_gol_kontrol()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.oyuncu := regexp_replace(btrim(new.oyuncu), '\s+', ' ', 'g');
  if new.penalti and new.kendi_kalesine then
    raise exception 'Gol hem penaltı hem kendi kalesine olamaz.' using errcode = '22023', hint = 'penalti';
  end if;
  return new;
end;
$$;
drop trigger if exists rakip_gol_kontrol on public.rakip_goller;
create trigger rakip_gol_kontrol before insert or update on public.rakip_goller
  for each row execute function public.rakip_gol_kontrol();

alter table public.rakip_goller enable row level security;
drop policy if exists rakip_gol_okuma on public.rakip_goller;
create policy rakip_gol_okuma on public.rakip_goller for select using (true);
drop policy if exists rakip_gol_ekleme on public.rakip_goller;
create policy rakip_gol_ekleme on public.rakip_goller for insert to authenticated with check ((select public.is_admin()));
drop policy if exists rakip_gol_guncelleme on public.rakip_goller;
create policy rakip_gol_guncelleme on public.rakip_goller for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists rakip_gol_silme on public.rakip_goller;
create policy rakip_gol_silme on public.rakip_goller for delete to authenticated using ((select public.is_admin()));

grant select on public.rakip_goller to anon, authenticated;
grant insert, update, delete on public.rakip_goller to authenticated;
revoke truncate on public.rakip_goller from anon, authenticated;


-- ===================== 020_mac_gunu.sql =====================
-- =====================================================================
-- Çorum Taraftar: maç günü (020)
-- Sıra: 001 → … → 019 → 020. Tekrar çalıştırılabilir (if not exists / create or replace / drop if exists).
-- 014-019'un "sürüm" işaretli fonksiyonlarına DOKUNMAZ: yeni kurallar kısıtta ve ayrı tetikleyicilerde.
--
--  1) maclar.hakem, yayin_kanali, dizilis ("4-2-3-1"; toplam 10), ilk11_aciklandi, on_bilgi_kaynak   maç öncesi paketi, ilk 11
--  2) mac_oyunculari.dizilis_sira (ilk 11'de 1-11, kaleci 1; maçta tek), forma_no (1-99)            sahada yerleştirme
--  3) skor_tahminleri     taraftar skor tahmini: maç başlamadan yazılır/değiştirilir; giriş + e-posta onayı + yasaklı değil.
--                         Herkes yalnız KENDİ tahminini görür; maç başlayınca dağılım tahmin_ozeti() ile (kişisel tahmin açılmaz).
--                         Ödül, puan, sıralama YOK (bahis değil).
--  4) mac_oyuncusu_oylari maçın oyuncusu: maç bitince (durum = 'bitti') açılır, bitişten (tarih + 2 saat) 48 saat sonra kapanır;
--                         tek oy, değiştirilemez; oyuncu o maçta oynamış olmalı (mac_oyunculari). Sonuç mac_oyuncusu_sonuclari().
--  5) begeniler           haber / gol beğenisi: ekle / geri al; herkes sayıyı görür (begeni_sayilari), kimin beğendiğini değil.
--                         Dakikada en çok 30 beğeni (begeni_hizlari; yalnız tetikleyici yazar).
--  6) puan_durumu         lig tablosu (sezon "2026-27"): herkes okur, yalnız yönetici yazar.
-- Yeni her tabloda RLS + politikalar + TRUNCATE yok.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Maç öncesi bilgisi ve diziliş
-- ---------------------------------------------------------------------
alter table public.maclar add column if not exists hakem text;
alter table public.maclar add column if not exists yayin_kanali text;
alter table public.maclar add column if not exists dizilis text;
alter table public.maclar add column if not exists ilk11_aciklandi timestamptz;
alter table public.maclar add column if not exists on_bilgi_kaynak text;

alter table public.maclar drop constraint if exists maclar_mac_gunu;
alter table public.maclar add constraint maclar_mac_gunu check (
  (hakem is null or char_length(btrim(hakem)) between 2 and 80)
  and (yayin_kanali is null or char_length(btrim(yayin_kanali)) between 2 and 80)
  and (dizilis is null or dizilis ~ '^\d(-\d){2,4}$')
  and (on_bilgi_kaynak is null or char_length(btrim(on_bilgi_kaynak)) between 2 and 120));

comment on column public.maclar.hakem is 'Maçın hakemi (maç öncesi paketi; 2-80 karakter).';
comment on column public.maclar.yayin_kanali is 'Yayın kanalı (ör. beIN SPORTS 2; 2-80 karakter).';
comment on column public.maclar.dizilis is 'Çorum FK dizilişi, kaleci hariç: "4-2-3-1" (sayıların toplamı 10).';
comment on column public.maclar.ilk11_aciklandi is 'İlk 11 açıklandığı an (maç sayfasında "İlk 11 açıklandı" rozeti). Boş: açıklanmadı.';
comment on column public.maclar.on_bilgi_kaynak is 'Maç öncesi bilginin (hakem, yayın, ilk 11) kaynağı (2-120 karakter).';

create or replace function public.mac_gunu_kontrol()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  toplam int;
begin
  new.hakem := nullif(regexp_replace(btrim(coalesce(new.hakem, '')), '\s+', ' ', 'g'), '');
  new.yayin_kanali := nullif(regexp_replace(btrim(coalesce(new.yayin_kanali, '')), '\s+', ' ', 'g'), '');
  new.on_bilgi_kaynak := nullif(btrim(coalesce(new.on_bilgi_kaynak, '')), '');
  new.dizilis := nullif(regexp_replace(coalesce(new.dizilis, ''), '\s+', '', 'g'), '');
  if new.dizilis is not null then
    if new.dizilis !~ '^\d(-\d){2,4}$' then
      raise exception 'Dizilişi "4-2-3-1" gibi yazın (3-5 sayı, aralarında tire).' using errcode = '22023', hint = 'dizilis';
    end if;
    select sum(x::int) into toplam from regexp_split_to_table(new.dizilis, '-') as x;
    if toplam <> 10 then
      raise exception 'Dizilişteki sayıların toplamı 10 olmalı (kaleci hariç).' using errcode = '22023', hint = 'dizilis';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists mac_gunu_kontrol on public.maclar;
create trigger mac_gunu_kontrol before insert or update on public.maclar
  for each row execute function public.mac_gunu_kontrol();

-- ---------------------------------------------------------------------
-- 2) Maç kadrosu: sahadaki yer ve forma numarası
-- ---------------------------------------------------------------------
alter table public.mac_oyunculari add column if not exists dizilis_sira smallint;
alter table public.mac_oyunculari add column if not exists forma_no smallint;
alter table public.mac_oyunculari drop constraint if exists mac_oyunculari_dizilis;
alter table public.mac_oyunculari add constraint mac_oyunculari_dizilis check (
  (dizilis_sira is null or (dizilis_sira between 1 and 11 and ilk11))
  and (forma_no is null or forma_no between 1 and 99));
create unique index if not exists mac_oyunculari_dizilis_tek on public.mac_oyunculari (mac_id, dizilis_sira) where dizilis_sira is not null;
comment on column public.mac_oyunculari.dizilis_sira is 'İlk 11''de sahadaki sıra: 1 kaleci, sonra dizilişin satırları geriden öne, soldan sağa. Maçta tek.';
comment on column public.mac_oyunculari.forma_no is 'O maçtaki forma numarası (1-99). Boş: kadrodaki numara kullanılır.';

-- Türkçe mesaj (kısıt ve tekil dizin yine son savunma). 018'in mac_oyuncusu_kontrol'üne dokunmaz: ayrı tetikleyici.
create or replace function public.mac_oyuncusu_dizilis_kontrol()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.dizilis_sira is not null then
    if not new.ilk11 or new.dizilis_sira not between 1 and 11 then
      raise exception 'Diziliş sırası yalnız ilk 11''deki oyuncuya verilir (1-11; kaleci 1).' using errcode = '22023', hint = 'dizilis_sira';
    end if;
    if exists (select 1 from public.mac_oyunculari m where m.mac_id = new.mac_id and m.dizilis_sira = new.dizilis_sira
               and (tg_op = 'INSERT' or m.oyuncu <> old.oyuncu)) then
      raise exception 'Bu maçta % numaralı yerde başka bir oyuncu var.', new.dizilis_sira using errcode = '23505', hint = 'dizilis_sira';
    end if;
  end if;
  if new.forma_no is not null and new.forma_no not between 1 and 99 then
    raise exception 'Forma numarası 1-99 arasında olmalı.' using errcode = '22023', hint = 'forma_no';
  end if;
  return new;
end;
$$;
drop trigger if exists mac_oyuncusu_dizilis_kontrol on public.mac_oyunculari;
create trigger mac_oyuncusu_dizilis_kontrol before insert or update on public.mac_oyunculari
  for each row execute function public.mac_oyuncusu_dizilis_kontrol();

-- ---------------------------------------------------------------------
-- Ortak: taraftar etkileşimi için hesap şartı (giriş + e-posta onayı + yasaklı değil), Türkçe mesajla
-- ---------------------------------------------------------------------
create or replace function public.etkilesim_hesap_kontrol(p_ne text)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception '% için giriş yap.', p_ne using errcode = '42501', hint = 'giris';
  end if;
  if not public.eposta_onayli() then
    raise exception '% için e-posta adresini onayla: hesap açarken gelen e-postadaki bağlantıya tıkla.', p_ne using errcode = '42501', hint = 'eposta_onayi';
  end if;
  if public.engelli_mi() then
    raise exception 'Hesabın topluluk kuralları nedeniyle kapatıldı; bu işlemi yapamazsın.' using errcode = '42501', hint = 'engelli';
  end if;
end;
$$;
revoke execute on function public.etkilesim_hesap_kontrol(text) from public, anon;
grant execute on function public.etkilesim_hesap_kontrol(text) to authenticated;

-- ---------------------------------------------------------------------
-- 3) Skor tahmini
-- ---------------------------------------------------------------------
create table if not exists public.skor_tahminleri (
  mac_id uuid not null references public.maclar (id) on delete cascade,
  kullanici_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  corum smallint not null,
  rakip smallint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (mac_id, kullanici_id)
);
alter table public.skor_tahminleri drop constraint if exists skor_tahminleri_skor;
alter table public.skor_tahminleri add constraint skor_tahminleri_skor check (corum between 0 and 20 and rakip between 0 and 20);
comment on table public.skor_tahminleri is 'Taraftar skor tahmini (eğlence; ödül/puan/sıralama yok). Kişi yalnız kendisininkini görür; dağılım maç başlayınca tahmin_ozeti().';

/** Maç tahmine açık mı: planlanmış ve başlama saati gelmemiş. */
create or replace function public.tahmin_acik(p_mac_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.maclar m where m.id = p_mac_id and m.durum = 'planlandi' and m.tarih > now());
$$;
grant execute on function public.tahmin_acik(uuid) to anon, authenticated;

create or replace function public.skor_tahmini_kontrol()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform public.etkilesim_hesap_kontrol('Tahmin');
  if tg_op = 'INSERT' then
    new.kullanici_id := auth.uid();
    new.created_at := now();
  else
    new.kullanici_id := old.kullanici_id;
    new.mac_id := old.mac_id;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  if not public.tahmin_acik(new.mac_id) then
    raise exception 'Maç başladı (ya da oynandı): tahminler kilitlendi.' using errcode = 'P0001', hint = 'tahmin_kilit';
  end if;
  if new.corum not between 0 and 20 or new.rakip not between 0 and 20 then
    raise exception 'Skor 0 ile 20 arasında olmalı.' using errcode = '22023', hint = 'skor';
  end if;
  return new;
end;
$$;
drop trigger if exists skor_tahmini_kontrol on public.skor_tahminleri;
create trigger skor_tahmini_kontrol before insert or update on public.skor_tahminleri
  for each row execute function public.skor_tahmini_kontrol();

alter table public.skor_tahminleri enable row level security;
drop policy if exists tahmin_okuma on public.skor_tahminleri;
create policy tahmin_okuma on public.skor_tahminleri for select to authenticated using (kullanici_id = (select auth.uid()));
drop policy if exists tahmin_ekleme on public.skor_tahminleri;
create policy tahmin_ekleme on public.skor_tahminleri for insert to authenticated with check (
  kullanici_id = (select auth.uid()) and (select public.eposta_onayli()) and not (select public.engelli_mi()) and public.tahmin_acik(mac_id));
drop policy if exists tahmin_guncelleme on public.skor_tahminleri;
create policy tahmin_guncelleme on public.skor_tahminleri for update to authenticated
  using (kullanici_id = (select auth.uid()))
  with check (kullanici_id = (select auth.uid()) and (select public.eposta_onayli()) and not (select public.engelli_mi()) and public.tahmin_acik(mac_id));
revoke all on public.skor_tahminleri from anon;
revoke delete, truncate, references, trigger on public.skor_tahminleri from authenticated;
grant select, insert, update on public.skor_tahminleri to authenticated;

-- Dağılım: yalnız maç başladıktan sonra (önce satır yok). Kimin ne dediği dönmez: toplam, G/B/M yüzdesi, en çok 3 skor.
create or replace function public.tahmin_ozeti(p_mac_id uuid)
returns table (toplam int, galibiyet int, beraberlik int, maglubiyet int, skorlar jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  with t as (
    select s.corum, s.rakip from public.skor_tahminleri s
    where s.mac_id = p_mac_id and not public.tahmin_acik(p_mac_id) and exists (select 1 from public.maclar m where m.id = p_mac_id)
  ), n as (select count(*)::int as toplam from t)
  select n.toplam,
    round(100.0 * count(*) filter (where t.corum > t.rakip) / n.toplam)::int,
    round(100.0 * count(*) filter (where t.corum = t.rakip) / n.toplam)::int,
    round(100.0 * count(*) filter (where t.corum < t.rakip) / n.toplam)::int,
    (select coalesce(jsonb_agg(jsonb_build_object('corum', k.corum, 'rakip', k.rakip, 'yuzde', k.yuzde) order by k.sayi desc, k.corum desc, k.rakip), '[]'::jsonb)
       from (select t2.corum, t2.rakip, count(*) as sayi, round(100.0 * count(*) / n.toplam)::int as yuzde
             from t t2 group by t2.corum, t2.rakip order by count(*) desc, t2.corum desc, t2.rakip limit 3) k)
  from n left join t on true
  where n.toplam > 0
  group by n.toplam;
$$;
revoke execute on function public.tahmin_ozeti(uuid) from public;
grant execute on function public.tahmin_ozeti(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 4) Maçın oyuncusu oyu
-- ---------------------------------------------------------------------
create table if not exists public.mac_oyuncusu_oylari (
  mac_id uuid not null references public.maclar (id) on delete cascade,
  kullanici_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  oyuncu text not null,
  created_at timestamptz not null default now(),
  primary key (mac_id, kullanici_id)
);
alter table public.mac_oyuncusu_oylari drop constraint if exists mac_oyuncusu_oylari_oyuncu;
alter table public.mac_oyuncusu_oylari add constraint mac_oyuncusu_oylari_oyuncu check (char_length(btrim(oyuncu)) between 2 and 80);
create index if not exists mac_oyuncusu_oylari_sonuc_idx on public.mac_oyuncusu_oylari (mac_id, oyuncu);
comment on table public.mac_oyuncusu_oylari is 'Maçın oyuncusu oyu: kişi başına maç başına tek oy, değiştirilemez. Pencere: maç bitince → tarih + 50 saat (bitiş tarih + 2 saat, sonra 48 saat).';

/** Oy penceresi: maç bitti ve başlama + 50 saat geçmedi (bitiş = başlama + 2 saat, sonra 48 saat; kurallar.js OY_PENCERESI). */
create or replace function public.oy_penceresi_acik(p_mac_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.maclar m where m.id = p_mac_id and m.durum = 'bitti' and now() <= m.tarih + interval '50 hours');
$$;
grant execute on function public.oy_penceresi_acik(uuid) to anon, authenticated;

/** O maçta oynadı mı (ilk 11 ya da oyuna girdi). */
create or replace function public.macta_oynadi(p_mac_id uuid, p_oyuncu text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.mac_oyunculari k where k.mac_id = p_mac_id and k.oyuncu = p_oyuncu and (k.ilk11 or k.giris_dk is not null));
$$;
grant execute on function public.macta_oynadi(uuid, text) to anon, authenticated;

create or replace function public.mac_oyuncusu_oyu_kontrol()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'Oy değiştirilemez.' using errcode = '42501', hint = 'oy_tek';
  end if;
  perform public.etkilesim_hesap_kontrol('Oy vermek');
  new.kullanici_id := auth.uid();
  new.created_at := now();
  new.oyuncu := regexp_replace(btrim(coalesce(new.oyuncu, '')), '\s+', ' ', 'g');
  if not public.oy_penceresi_acik(new.mac_id) then
    raise exception 'Bu maçın oylaması açık değil (maç bitince açılır, 48 saat sürer).' using errcode = 'P0001', hint = 'oy_penceresi';
  end if;
  if not public.macta_oynadi(new.mac_id, new.oyuncu) then
    raise exception 'Yalnız bu maçta oynayan bir Çorum FK oyuncusuna oy verebilirsin.' using errcode = '22023', hint = 'oyuncu';
  end if;
  if exists (select 1 from public.mac_oyuncusu_oylari o where o.mac_id = new.mac_id and o.kullanici_id = new.kullanici_id) then
    raise exception 'Bu maç için oyunu zaten verdin.' using errcode = '23505', hint = 'oy_tek';
  end if;
  return new;
end;
$$;
drop trigger if exists mac_oyuncusu_oyu_kontrol on public.mac_oyuncusu_oylari;
create trigger mac_oyuncusu_oyu_kontrol before insert or update on public.mac_oyuncusu_oylari
  for each row execute function public.mac_oyuncusu_oyu_kontrol();

alter table public.mac_oyuncusu_oylari enable row level security;
drop policy if exists oy_okuma on public.mac_oyuncusu_oylari;
create policy oy_okuma on public.mac_oyuncusu_oylari for select to authenticated using (kullanici_id = (select auth.uid()));
drop policy if exists oy_ekleme on public.mac_oyuncusu_oylari;
create policy oy_ekleme on public.mac_oyuncusu_oylari for insert to authenticated with check (
  kullanici_id = (select auth.uid()) and (select public.eposta_onayli()) and not (select public.engelli_mi())
  and public.oy_penceresi_acik(mac_id) and public.macta_oynadi(mac_id, oyuncu));
revoke all on public.mac_oyuncusu_oylari from anon;
revoke update, delete, truncate, references, trigger on public.mac_oyuncusu_oylari from authenticated;
grant select, insert on public.mac_oyuncusu_oylari to authenticated;

-- Sonuç: oyuncu başına oy ve yüzde (herkes; istemci oy verdikten sonra ya da pencere kapanınca gösterir). Kimin oyu olduğu dönmez.
create or replace function public.mac_oyuncusu_sonuclari(p_mac_id uuid)
returns table (oyuncu text, oy int, yuzde int, toplam int)
language sql
stable
security definer
set search_path = ''
as $$
  with o as (select v.oyuncu from public.mac_oyuncusu_oylari v where v.mac_id = p_mac_id),
       n as (select count(*)::int as toplam from o)
  select o.oyuncu, count(*)::int, round(100.0 * count(*) / n.toplam)::int, n.toplam
  from o, n group by o.oyuncu, n.toplam order by count(*) desc, o.oyuncu;
$$;
revoke execute on function public.mac_oyuncusu_sonuclari(uuid) from public;
grant execute on function public.mac_oyuncusu_sonuclari(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 5) Beğeni
-- ---------------------------------------------------------------------
create table if not exists public.begeniler (
  hedef_tur text not null,
  hedef_id uuid not null,
  kullanici_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (hedef_tur, hedef_id, kullanici_id)
);
alter table public.begeniler drop constraint if exists begeniler_hedef_tur;
alter table public.begeniler add constraint begeniler_hedef_tur check (hedef_tur in ('haber', 'gol'));
create index if not exists begeniler_kullanici_idx on public.begeniler (kullanici_id, created_at);
comment on table public.begeniler is 'Haber / gol beğenisi. Kişi yalnız kendi beğenisini görür; sayılar begeni_sayilari() ile.';

-- Hız sınırı sayacı (dakikalık pencere). Yalnız SECURITY DEFINER tetikleyici yazar; kimse okuyamaz.
create table if not exists public.begeni_hizlari (
  kullanici_id uuid primary key references auth.users (id) on delete cascade,
  pencere timestamptz not null default now(),
  sayi int not null default 0
);
alter table public.begeni_hizlari enable row level security;
revoke all on public.begeni_hizlari from anon, authenticated;

create or replace function public.begeni_kontrol()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
  perform public.etkilesim_hesap_kontrol('Beğenmek');
  new.kullanici_id := auth.uid();
  new.created_at := now();
  if new.hedef_tur = 'haber' and not exists (select 1 from public.haberler x where x.id = new.hedef_id and x.yayinda) then
    raise exception 'Haber bulunamadı.' using errcode = '22023', hint = 'hedef';
  end if;
  if new.hedef_tur = 'gol' and not exists (select 1 from public.goller x where x.id = new.hedef_id) then
    raise exception 'Gol bulunamadı.' using errcode = '22023', hint = 'hedef';
  end if;
  -- Dakikada en çok 30 beğeni (geri alıp yeniden beğenmek de sayılır)
  insert into public.begeni_hizlari as b (kullanici_id, pencere, sayi) values (new.kullanici_id, now(), 1)
  on conflict (kullanici_id) do update set
    pencere = case when b.pencere < now() - interval '1 minute' then now() else b.pencere end,
    sayi = case when b.pencere < now() - interval '1 minute' then 1 else b.sayi + 1 end
  returning sayi into n;
  if n > 30 then
    raise exception 'Çok hızlı beğeniyorsun: dakikada en çok 30. Biraz bekleyip yeniden dene.' using errcode = 'P0001', hint = 'begeni_siniri';
  end if;
  return new;
end;
$$;
drop trigger if exists begeni_kontrol on public.begeniler;
create trigger begeni_kontrol before insert on public.begeniler
  for each row execute function public.begeni_kontrol();

alter table public.begeniler enable row level security;
drop policy if exists begeni_okuma on public.begeniler;
create policy begeni_okuma on public.begeniler for select to authenticated using (kullanici_id = (select auth.uid()));
drop policy if exists begeni_ekleme on public.begeniler;
create policy begeni_ekleme on public.begeniler for insert to authenticated with check (
  kullanici_id = (select auth.uid()) and (select public.eposta_onayli()) and not (select public.engelli_mi()));
drop policy if exists begeni_silme on public.begeniler;
create policy begeni_silme on public.begeniler for delete to authenticated using (kullanici_id = (select auth.uid()));
revoke all on public.begeniler from anon;
revoke update, truncate, references, trigger on public.begeniler from authenticated;
grant select, insert, delete on public.begeniler to authenticated;

-- Haber / gol silinince beğenileri de gider (çok biçimli hedef: yabancı anahtar yok)
create or replace function public.begeni_hedef_silindi()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.begeniler b where b.hedef_tur = tg_argv[0] and b.hedef_id = old.id;
  return old;
end;
$$;
drop trigger if exists begeni_hedef_silindi on public.haberler;
create trigger begeni_hedef_silindi after delete on public.haberler for each row execute function public.begeni_hedef_silindi('haber');
drop trigger if exists begeni_hedef_silindi on public.goller;
create trigger begeni_hedef_silindi after delete on public.goller for each row execute function public.begeni_hedef_silindi('gol');

-- Toplu sayım (liste başına tek istek): en çok 100 kimlik. benim: oturumdaki kişi beğenmiş mi.
create or replace function public.begeni_sayilari(p_tur text, p_idler uuid[])
returns table (hedef_id uuid, sayi int, benim boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, count(b.kullanici_id)::int, coalesce(bool_or(b.kullanici_id = auth.uid()), false)
  from (select distinct x from unnest((coalesce(p_idler, '{}'::uuid[]))[1:100]) as x) as i(id)
  left join public.begeniler b on b.hedef_tur = p_tur and b.hedef_id = i.id
  where p_tur in ('haber', 'gol')
    and (p_tur <> 'haber' or exists (select 1 from public.haberler x where x.id = i.id and (x.yayinda or public.is_admin())))
  group by i.id;
$$;
revoke execute on function public.begeni_sayilari(text, uuid[]) from public;
grant execute on function public.begeni_sayilari(text, uuid[]) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 6) Puan durumu
-- ---------------------------------------------------------------------
create table if not exists public.puan_durumu (
  sezon text not null,
  sira smallint not null,
  takim text not null,
  oynanan smallint not null default 0,
  galibiyet smallint not null default 0,
  beraberlik smallint not null default 0,
  maglubiyet smallint not null default 0,
  atilan smallint not null default 0,
  yenen smallint not null default 0,
  puan smallint not null default 0,
  guncellendi timestamptz not null default now(),
  kaynak text,
  primary key (sezon, takim)
);
alter table public.puan_durumu drop constraint if exists puan_durumu_alanlar;
alter table public.puan_durumu add constraint puan_durumu_alanlar check (
  sezon ~ '^\d{4}-\d{2}$' and sira between 1 and 40 and char_length(btrim(takim)) between 2 and 80
  and (kaynak is null or char_length(btrim(kaynak)) between 2 and 120));
alter table public.puan_durumu drop constraint if exists puan_durumu_sayilar;
alter table public.puan_durumu add constraint puan_durumu_sayilar check (
  oynanan between 0 and 60 and galibiyet >= 0 and beraberlik >= 0 and maglubiyet >= 0
  and galibiyet + beraberlik + maglubiyet = oynanan
  and atilan between 0 and 300 and yenen between 0 and 300 and puan between -50 and 200);
create index if not exists puan_durumu_sira_idx on public.puan_durumu (sezon, sira);
comment on table public.puan_durumu is 'Lig puan tablosu (sezon "2026-27"). Yönetici kaynağından girer (otomatik çekme yok); herkes okur.';

create or replace function public.puan_satiri_kontrol()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.takim := regexp_replace(btrim(coalesce(new.takim, '')), '\s+', ' ', 'g');
  new.kaynak := nullif(btrim(coalesce(new.kaynak, '')), '');
  if new.galibiyet + new.beraberlik + new.maglubiyet <> new.oynanan then
    raise exception '%: oynanan maç sayısı galibiyet + beraberlik + mağlubiyet olmalı.', new.takim using errcode = '22023', hint = 'oynanan';
  end if;
  return new;
end;
$$;
drop trigger if exists puan_satiri_kontrol on public.puan_durumu;
create trigger puan_satiri_kontrol before insert or update on public.puan_durumu
  for each row execute function public.puan_satiri_kontrol();

alter table public.puan_durumu enable row level security;
drop policy if exists puan_okuma on public.puan_durumu;
create policy puan_okuma on public.puan_durumu for select using (true);
drop policy if exists puan_ekleme on public.puan_durumu;
create policy puan_ekleme on public.puan_durumu for insert to authenticated with check ((select public.is_admin()));
drop policy if exists puan_guncelleme on public.puan_durumu;
create policy puan_guncelleme on public.puan_durumu for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists puan_silme on public.puan_durumu;
create policy puan_silme on public.puan_durumu for delete to authenticated using ((select public.is_admin()));
grant select on public.puan_durumu to anon, authenticated;
grant insert, update, delete on public.puan_durumu to authenticated;
revoke truncate on public.puan_durumu from anon, authenticated;


-- ===================== 021_bildirim.sql =====================
-- =====================================================================
-- Çorum Taraftar: maç günü Web Push bildirimleri (021)
-- Sıra: … → 019 → 020 → 021. Tekrar çalıştırılabilir (if not exists / create or replace / drop if exists).
-- Başka migration'ın fonksiyonuna DOKUNMAZ; goller / maclar'a yalnız AFTER tetikleyicisi ekler. 020'ye bağlı (maclar.ilk11_aciklandi).
--
--  1) push_abonelikleri     Tarayıcının push adresi (endpoint) + anahtarları (p256dh, auth) + tercih {mac_gunu, ilk11, gol, mac_sonu}.
--                           Yalnız giriş yapmış kullanıcı abone olur. Kişi yalnız kendi satırlarını görür, tercihini değiştirir, siler
--                           (RLS). Ekleme yalnız bildirim_abone_ol() ile: aynı tarayıcı başka hesapla açılırsa satır yeni hesaba geçer,
--                           kişi başı en çok 10 cihaz, endpoint yalnız bilinen push servislerinde (SSRF yok).
--  2) bildirim_olaylari     Gönderim kaydı / giden kutusu. olay_anahtari UNIQUE: aynı olay iki kez üretilmez, iki kez gönderilmez.
--                           Yalnız service_role (Edge Function) okur/yazar; anon/authenticated hiçbir yetki yok.
--  3) bildirim_olaylarini_hazirla(p_simdi)  Durumdan olay üretir (idempotent, on conflict do nothing):
--        mac_gunu  maç günü 10:00 TSİ'den başlama saatine kadar (planlandı)
--        ilk11     maclar.ilk11_aciklandi dolunca (020; yönetici "İlk 11 açıklandı"), maçtan 3 saat önce → 15 dk sonra arası
--        gol       Çorum FK golü (goller), gol son 20 dakikada girildiyse ve maç şu an oynanıyorsa (başlamadan 30 dk önce → 4 saat sonra)
--        mac_sonu  maç bitti olarak işaretlendiyse (son 3 saatte, maç son 6 saatte başladıysa)
--  4) Tetikleme: pg_cron her dakika bildirim_calistir() (sabah bildirimi zamana bağlı: cron şart) + goller eklenince ve
--     maclar.durum / ilk11_aciklandi değişince AFTER tetikleyicisi aynı fonksiyonu çağırır (gol ~1-2 sn'de gider, dakikayı beklemez).
--     bildirim_calistir(): bekleyen olay varsa pg_net ile Edge Function'ı (bildirim-gonder) çağırır. Adres ve gizli başlık
--     Supabase Vault'ta (bildirim_url, bildirim_gizli). pg_net / Vault / pg_cron yoksa (düz Postgres, test) sessizce atlar.
--     pg_net isteği işlem bittikten (commit) sonra gönderilir; yönetici işlemi geri alırsa istek de gitmez.
--  5) VAPID anahtarları da Vault'ta (022: bildirim_vapid_*, Edge Function bildirim_gizli_ayarlar() ile okur). service_role anahtarı hiçbir dosyada yok
--     (Edge Function'a Supabase kendisi verir).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Abonelikler
-- ---------------------------------------------------------------------
create table if not exists public.push_abonelikleri (
  id uuid primary key default gen_random_uuid(),
  kullanici_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  tercih jsonb not null default '{"mac_gunu": true, "ilk11": true, "gol": true, "mac_sonu": true}'::jsonb,
  created_at timestamptz not null default now(),
  son_gonderim timestamptz
);
create index if not exists push_abonelikleri_kullanici on public.push_abonelikleri (kullanici_id);

alter table public.push_abonelikleri drop constraint if exists push_endpoint;
-- Yalnız tarayıcıların push servisleri (Chrome/Edge/Samsung/Opera: FCM, Firefox: Mozilla, Safari/iOS: Apple, eski Edge: WNS)
alter table public.push_abonelikleri add constraint push_endpoint check (
  char_length(endpoint) <= 1000
  and endpoint ~ '^https://(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)/[^[:space:]]+$');
alter table public.push_abonelikleri drop constraint if exists push_anahtarlar;
-- p256dh: 65 baytlık P-256 açık anahtarı (base64url 87 karakter), auth: 16 bayt (22 karakter); dolgulu yazımlara pay
alter table public.push_abonelikleri add constraint push_anahtarlar check (
  p256dh ~ '^[A-Za-z0-9_-]{80,100}={0,2}$' and auth ~ '^[A-Za-z0-9_-]{16,32}={0,2}$');
alter table public.push_abonelikleri drop constraint if exists push_tercih;
alter table public.push_abonelikleri add constraint push_tercih check (
  jsonb_typeof(tercih) = 'object'
  and tercih - array['mac_gunu', 'ilk11', 'gol', 'mac_sonu'] = '{}'::jsonb
  and jsonb_typeof(tercih -> 'mac_gunu') = 'boolean' and jsonb_typeof(tercih -> 'ilk11') = 'boolean'
  and jsonb_typeof(tercih -> 'gol') = 'boolean' and jsonb_typeof(tercih -> 'mac_sonu') = 'boolean');
comment on table public.push_abonelikleri is 'Web Push abonelikleri (021). Kişi yalnız kendi satırını görür/siler, yalnız tercihini değiştirir; ekleme bildirim_abone_ol() ile.';

alter table public.push_abonelikleri enable row level security;
revoke all on public.push_abonelikleri from anon, authenticated;
grant select, delete on public.push_abonelikleri to authenticated;
grant update (tercih) on public.push_abonelikleri to authenticated;
drop policy if exists push_okuma on public.push_abonelikleri;
create policy push_okuma on public.push_abonelikleri for select to authenticated using (kullanici_id = (select auth.uid()));
drop policy if exists push_guncelleme on public.push_abonelikleri;
create policy push_guncelleme on public.push_abonelikleri for update to authenticated
  using (kullanici_id = (select auth.uid())) with check (kullanici_id = (select auth.uid()));
drop policy if exists push_silme on public.push_abonelikleri;
create policy push_silme on public.push_abonelikleri for delete to authenticated using (kullanici_id = (select auth.uid()));

-- Abone ol / tercihi yenile. Aynı tarayıcı (endpoint) başka hesapla açılmışsa satır bu hesaba geçer (endpoint tahmin edilemez,
-- tarayıcının kendisine aittir). Kişi başı en çok 10 cihaz.
create or replace function public.bildirim_abone_ol(p_endpoint text, p_p256dh text, p_auth text, p_tercih jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Bildirimleri açmak için giriş yap.' using errcode = '42501';
  end if;
  if (select count(*) from public.push_abonelikleri a where a.kullanici_id = v_uid and a.endpoint <> p_endpoint) >= 10 then
    raise exception 'En çok 10 cihazda bildirim açabilirsin. Kullanmadığın bir cihazda bildirimleri kapat.' using errcode = '22023';
  end if;
  insert into public.push_abonelikleri as a (kullanici_id, endpoint, p256dh, auth, tercih)
  values (v_uid, p_endpoint, p_p256dh, p_auth, coalesce(p_tercih, '{"mac_gunu": true, "ilk11": true, "gol": true, "mac_sonu": true}'::jsonb))
  on conflict (endpoint) do update
    set kullanici_id = excluded.kullanici_id, p256dh = excluded.p256dh, auth = excluded.auth, tercih = excluded.tercih;
exception when check_violation then
  raise exception 'Bu tarayıcının bildirim adresi kabul edilmedi.' using errcode = '22023';
end;
$$;
revoke execute on function public.bildirim_abone_ol(text, text, text, jsonb) from public, anon;
grant execute on function public.bildirim_abone_ol(text, text, text, jsonb) to authenticated;

-- Yönetici: kaç abonelik / kişi, tür başına kaç kişi açık
create or replace function public.bildirim_abone_sayisi()
returns table (abonelik bigint, kisi bigint, mac_gunu bigint, ilk11 bigint, gol bigint, mac_sonu bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Bu bilgiyi yalnız yöneticiler görebilir.' using errcode = '42501';
  end if;
  return query
    select count(*), count(distinct a.kullanici_id),
      count(*) filter (where a.tercih ->> 'mac_gunu' = 'true'), count(*) filter (where a.tercih ->> 'ilk11' = 'true'),
      count(*) filter (where a.tercih ->> 'gol' = 'true'), count(*) filter (where a.tercih ->> 'mac_sonu' = 'true')
    from public.push_abonelikleri a;
end;
$$;
revoke execute on function public.bildirim_abone_sayisi() from public, anon;
grant execute on function public.bildirim_abone_sayisi() to authenticated;

-- ---------------------------------------------------------------------
-- 2) Olaylar (gönderim kaydı)
-- ---------------------------------------------------------------------
create table if not exists public.bildirim_olaylari (
  id bigint generated always as identity primary key,
  olay_anahtari text not null unique,       -- 'gol:<gol id>', 'mac_gunu:<maç id>:<gün>', 'ilk11:<maç id>', 'mac_sonu:<maç id>'
  tur text not null,
  mac_id uuid references public.maclar (id) on delete cascade,
  gol_id uuid references public.goller (id) on delete set null,
  veri jsonb not null default '{}'::jsonb,  -- metin için: rakip, ic_saha, tarih, oyuncu, dakika, ek_dakika, penalti, corum, rakip_skor
  created_at timestamptz not null default now(),
  alindi timestamptz,                       -- Edge Function aldı (10 dk kilit; düşerse yeniden alınır)
  gonderildi timestamptz,
  alici integer,
  basarisiz integer,
  sonuc text                                -- 'gonderildi' | 'bayat' | 'alici-yok'
);
alter table public.bildirim_olaylari drop constraint if exists bildirim_tur;
alter table public.bildirim_olaylari add constraint bildirim_tur check (tur in ('mac_gunu', 'ilk11', 'gol', 'mac_sonu'));
create index if not exists bildirim_olaylari_bekleyen on public.bildirim_olaylari (id) where gonderildi is null;
comment on table public.bildirim_olaylari is 'Bildirim olayları ve gönderim kaydı (021). olay_anahtari tekil: aynı olay iki kez gönderilmez. Yalnız service_role.';
alter table public.bildirim_olaylari enable row level security;
revoke all on public.bildirim_olaylari from anon, authenticated;

create or replace function public.bildirim_olaylarini_hazirla(p_simdi timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer := 0;
  k integer;
  v_gun date := (p_simdi at time zone 'Europe/Istanbul')::date;
begin
  -- maç günü sabahı (10:00 TSİ'den başlama saatine kadar)
  insert into public.bildirim_olaylari (olay_anahtari, tur, mac_id, veri)
  select 'mac_gunu:' || m.id || ':' || v_gun, 'mac_gunu', m.id, jsonb_build_object('rakip', m.rakip, 'ic_saha', m.ic_saha, 'tarih', m.tarih)
  from public.maclar m
  where m.durum = 'planlandi' and m.tarih > p_simdi
    and (m.tarih at time zone 'Europe/Istanbul')::date = v_gun
    and (p_simdi at time zone 'Europe/Istanbul')::time >= time '10:00'
  on conflict (olay_anahtari) do nothing;
  get diagnostics k = row_count; n := n + k;

  -- ilk 11 açıklandı (020: yönetici maclar.ilk11_aciklandi'yi doldurdu)
  insert into public.bildirim_olaylari (olay_anahtari, tur, mac_id, veri)
  select 'ilk11:' || m.id, 'ilk11', m.id, jsonb_build_object('rakip', m.rakip, 'ic_saha', m.ic_saha, 'tarih', m.tarih)
  from public.maclar m
  where m.durum <> 'bitti' and m.ilk11_aciklandi is not null
    and m.tarih between p_simdi - interval '15 minutes' and p_simdi + interval '3 hours'
  on conflict (olay_anahtari) do nothing;
  get diagnostics k = row_count; n := n + k;

  -- Çorum FK golü: skor o golün dakikasına kadarki goller (rakip golleri dahil)
  insert into public.bildirim_olaylari (olay_anahtari, tur, mac_id, gol_id, veri)
  select 'gol:' || g.id, 'gol', m.id, g.id, jsonb_build_object(
      'rakip', m.rakip, 'ic_saha', m.ic_saha, 'tarih', m.tarih,
      'oyuncu', g.oyuncu, 'dakika', g.dakika, 'ek_dakika', g.ek_dakika, 'penalti', g.penalti,
      'corum', (select count(*) from public.goller g2 where g2.mac_id = m.id
                and (g2.dakika * 100 + coalesce(g2.ek_dakika, 0), g2.created_at, g2.id) <= (g.dakika * 100 + coalesce(g.ek_dakika, 0), g.created_at, g.id)),
      'rakip_skor', (select count(*) from public.rakip_goller r where r.mac_id = m.id
                and r.dakika * 100 + coalesce(r.ek_dakika, 0) <= g.dakika * 100 + coalesce(g.ek_dakika, 0)))
  from public.goller g
  join public.maclar m on m.id = g.mac_id
  where g.created_at > p_simdi - interval '20 minutes'
    and m.tarih between p_simdi - interval '4 hours' and p_simdi + interval '30 minutes'
  on conflict (olay_anahtari) do nothing;
  get diagnostics k = row_count; n := n + k;

  -- maç sonu
  insert into public.bildirim_olaylari (olay_anahtari, tur, mac_id, veri)
  select 'mac_sonu:' || m.id, 'mac_sonu', m.id, jsonb_build_object('rakip', m.rakip, 'ic_saha', m.ic_saha, 'tarih', m.tarih,
      'corum', m.corum_skor, 'rakip_skor', m.rakip_skor)
  from public.maclar m
  where m.durum = 'bitti' and m.corum_skor is not null and m.rakip_skor is not null
    and m.tarih between p_simdi - interval '6 hours' and p_simdi
    and m.updated_at > p_simdi - interval '3 hours'
  on conflict (olay_anahtari) do nothing;
  get diagnostics k = row_count; n := n + k;

  delete from public.bildirim_olaylari where created_at < p_simdi - interval '90 days';
  return n;
end;
$$;
revoke execute on function public.bildirim_olaylarini_hazirla(timestamptz) from public, anon, authenticated;
grant execute on function public.bildirim_olaylarini_hazirla(timestamptz) to service_role;

-- Edge Function: bekleyen olayları alır (kilitler). İki çağrı aynı anda gelirse (tetikleyici + cron) aynı olayı ikisi birden almaz.
create or replace function public.bildirim_olaylarini_al(p_adet integer default 20)
returns setof public.bildirim_olaylari
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.bildirim_olaylarini_hazirla();
  return query
    update public.bildirim_olaylari o set alindi = now()
    where o.id in (
      select b.id from public.bildirim_olaylari b
      where b.gonderildi is null and (b.alindi is null or b.alindi < now() - interval '10 minutes')
      order by b.id
      limit greatest(1, least(coalesce(p_adet, 20), 50))
      for update skip locked)
    returning o.*;
end;
$$;
revoke execute on function public.bildirim_olaylarini_al(integer) from public, anon, authenticated;
grant execute on function public.bildirim_olaylarini_al(integer) to service_role;

-- Olay üret; bekleyen varsa Edge Function'ı pg_net ile çağır. Dönüş: 'bos' | 'ayar-yok' | 'cagrildi'.
create or replace function public.bildirim_calistir()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_gizli text;
begin
  perform public.bildirim_olaylarini_hazirla();
  if not exists (select 1 from public.bildirim_olaylari b
                 where b.gonderildi is null and (b.alindi is null or b.alindi < now() - interval '10 minutes')) then
    return 'bos';
  end if;
  if to_regnamespace('net') is null or to_regclass('vault.decrypted_secrets') is null then
    return 'ayar-yok';
  end if;
  select s.decrypted_secret into v_url from vault.decrypted_secrets s where s.name = 'bildirim_url';
  select s.decrypted_secret into v_gizli from vault.decrypted_secrets s where s.name = 'bildirim_gizli';
  if v_url is null or v_gizli is null then
    return 'ayar-yok';
  end if;
  perform net.http_post(
    url := v_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-bildirim-anahtari', v_gizli),
    timeout_milliseconds := 20000);
  return 'cagrildi';
end;
$$;
revoke execute on function public.bildirim_calistir() from public, anon, authenticated;
grant execute on function public.bildirim_calistir() to service_role;

-- Tetikleyici: yönetici golü / maç sonucunu / "ilk 11 açıklandı"yı girince hemen. Hata yöneticinin kaydını ASLA engellemez.
create or replace function public.bildirim_tetikle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform public.bildirim_calistir();
  exception when others then
    raise warning '021: bildirim tetiklenemedi (%)', sqlerrm;
  end;
  return null;
end;
$$;
revoke execute on function public.bildirim_tetikle() from public, anon, authenticated;

drop trigger if exists bildirim_gol on public.goller;
create trigger bildirim_gol after insert on public.goller
  for each statement execute function public.bildirim_tetikle();
drop trigger if exists bildirim_mac on public.maclar;
create trigger bildirim_mac after update of durum, ilk11_aciklandi on public.maclar
  for each statement execute function public.bildirim_tetikle();

-- pg_cron varsa her dakika (sabah bildirimi, ilk 11'in zaman penceresi ve kaçan tetikleme için). Yoksa (düz Postgres, test) atlanır.
-- README "Bildirimler": Database → Extensions → pg_cron ve pg_net açılır, sonra bu dosya (ya da yalnız bu blok) yeniden çalıştırılır.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      execute $c$select cron.schedule('bildirim-calistir', '* * * * *', 'select public.bildirim_calistir()')$c$;
    exception when others then
      raise notice '021: pg_cron işi kurulamadı (%); bildirimler yalnız tetikleyiciyle gider, sabah bildirimi gitmez.', sqlerrm;
    end;
  else
    raise notice '021: pg_cron yok; bildirim-calistir zamanlanmadı (README "Bildirimler").';
  end if;
end;
$$;


-- ===================== 022_bildirim_vault.sql =====================
-- =====================================================================
-- Çorum Taraftar: bildirim gizli ayarları Supabase Vault'ta (022)
-- Sıra: … → 020 → 021 → 022. Tekrar çalıştırılabilir (create or replace). Başka migration'ın nesnesine dokunmaz.
--
-- Edge Function (bildirim-gonder) VAPID anahtarlarını ve gizli başlığı Edge Function secret'ı yerine Vault'tan okur:
--   bildirim_vapid_public   VAPID açık anahtarı (ayar.js VAPID_ACIK_ANAHTAR ile aynı)
--   bildirim_vapid_private  VAPID özel anahtarı
--   bildirim_vapid_subject  mailto:<iletişim e-postası>
--   bildirim_gizli          x-bildirim-anahtari başlığı (021 bildirim_calistir() de aynı sırrı gönderir)
--   (bildirim_url 021'indir: veritabanının pg_net ile çağırdığı Edge Function adresi)
-- Sırlar `node araclar/vapid-olustur.js --sql` çıktısıyla yazılır (README "Bildirimler").
-- bildirim_gizli_ayarlar() yalnız service_role çalıştırır (Edge Function, Supabase'in kendi verdiği anahtarla).
-- Vault yoksa (düz Postgres, test) fonksiyon kurulur ama boş satır döner.
-- =====================================================================

create or replace function public.bildirim_gizli_ayarlar()
returns table (vapid_public text, vapid_private text, vapid_subject text, bildirim_gizli text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if to_regclass('vault.decrypted_secrets') is null then
    return query select null::text, null::text, null::text, null::text;
    return;
  end if;
  return query
    select
      max(s.decrypted_secret) filter (where s.name = 'bildirim_vapid_public'),
      max(s.decrypted_secret) filter (where s.name = 'bildirim_vapid_private'),
      max(s.decrypted_secret) filter (where s.name = 'bildirim_vapid_subject'),
      max(s.decrypted_secret) filter (where s.name = 'bildirim_gizli')
    from vault.decrypted_secrets s
    where s.name in ('bildirim_vapid_public', 'bildirim_vapid_private', 'bildirim_vapid_subject', 'bildirim_gizli');
end;
$$;
revoke all on function public.bildirim_gizli_ayarlar() from public, anon, authenticated;
grant execute on function public.bildirim_gizli_ayarlar() to service_role;
comment on function public.bildirim_gizli_ayarlar() is 'Bildirim VAPID anahtarları + gizli başlık (Vault, 022). Yalnız service_role (bildirim-gonder Edge Function).';
