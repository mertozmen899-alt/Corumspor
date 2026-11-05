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
