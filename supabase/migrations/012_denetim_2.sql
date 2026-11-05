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
