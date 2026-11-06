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
