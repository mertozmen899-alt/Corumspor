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
