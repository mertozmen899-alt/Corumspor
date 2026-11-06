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
