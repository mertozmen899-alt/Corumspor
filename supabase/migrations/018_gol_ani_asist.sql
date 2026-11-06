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
