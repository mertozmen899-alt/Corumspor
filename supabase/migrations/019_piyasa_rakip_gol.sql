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
