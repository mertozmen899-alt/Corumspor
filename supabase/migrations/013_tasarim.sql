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
