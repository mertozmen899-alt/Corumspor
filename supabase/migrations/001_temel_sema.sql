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
