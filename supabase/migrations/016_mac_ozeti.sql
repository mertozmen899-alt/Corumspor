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
