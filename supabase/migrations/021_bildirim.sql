-- =====================================================================
-- Çorum Taraftar: maç günü Web Push bildirimleri (021)
-- Sıra: … → 019 → 020 → 021. Tekrar çalıştırılabilir (if not exists / create or replace / drop if exists).
-- Başka migration'ın fonksiyonuna DOKUNMAZ; goller / maclar'a yalnız AFTER tetikleyicisi ekler. 020'ye bağlı (maclar.ilk11_aciklandi).
--
--  1) push_abonelikleri     Tarayıcının push adresi (endpoint) + anahtarları (p256dh, auth) + tercih {mac_gunu, ilk11, gol, mac_sonu}.
--                           Yalnız giriş yapmış kullanıcı abone olur. Kişi yalnız kendi satırlarını görür, tercihini değiştirir, siler
--                           (RLS). Ekleme yalnız bildirim_abone_ol() ile: aynı tarayıcı başka hesapla açılırsa satır yeni hesaba geçer,
--                           kişi başı en çok 10 cihaz, endpoint yalnız bilinen push servislerinde (SSRF yok).
--  2) bildirim_olaylari     Gönderim kaydı / giden kutusu. olay_anahtari UNIQUE: aynı olay iki kez üretilmez, iki kez gönderilmez.
--                           Yalnız service_role (Edge Function) okur/yazar; anon/authenticated hiçbir yetki yok.
--  3) bildirim_olaylarini_hazirla(p_simdi)  Durumdan olay üretir (idempotent, on conflict do nothing):
--        mac_gunu  maç günü 10:00 TSİ'den başlama saatine kadar (planlandı)
--        ilk11     maclar.ilk11_aciklandi dolunca (020; yönetici "İlk 11 açıklandı"), maçtan 3 saat önce → 15 dk sonra arası
--        gol       Çorum FK golü (goller), gol son 20 dakikada girildiyse ve maç şu an oynanıyorsa (başlamadan 30 dk önce → 4 saat sonra)
--        mac_sonu  maç bitti olarak işaretlendiyse (son 3 saatte, maç son 6 saatte başladıysa)
--  4) Tetikleme: pg_cron her dakika bildirim_calistir() (sabah bildirimi zamana bağlı: cron şart) + goller eklenince ve
--     maclar.durum / ilk11_aciklandi değişince AFTER tetikleyicisi aynı fonksiyonu çağırır (gol ~1-2 sn'de gider, dakikayı beklemez).
--     bildirim_calistir(): bekleyen olay varsa pg_net ile Edge Function'ı (bildirim-gonder) çağırır. Adres ve gizli başlık
--     Supabase Vault'ta (bildirim_url, bildirim_gizli). pg_net / Vault / pg_cron yoksa (düz Postgres, test) sessizce atlar.
--     pg_net isteği işlem bittikten (commit) sonra gönderilir; yönetici işlemi geri alırsa istek de gitmez.
--  5) VAPID anahtarları da Vault'ta (022: bildirim_vapid_*, Edge Function bildirim_gizli_ayarlar() ile okur). service_role anahtarı hiçbir dosyada yok
--     (Edge Function'a Supabase kendisi verir).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Abonelikler
-- ---------------------------------------------------------------------
create table if not exists public.push_abonelikleri (
  id uuid primary key default gen_random_uuid(),
  kullanici_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  tercih jsonb not null default '{"mac_gunu": true, "ilk11": true, "gol": true, "mac_sonu": true}'::jsonb,
  created_at timestamptz not null default now(),
  son_gonderim timestamptz
);
create index if not exists push_abonelikleri_kullanici on public.push_abonelikleri (kullanici_id);

alter table public.push_abonelikleri drop constraint if exists push_endpoint;
-- Yalnız tarayıcıların push servisleri (Chrome/Edge/Samsung/Opera: FCM, Firefox: Mozilla, Safari/iOS: Apple, eski Edge: WNS)
alter table public.push_abonelikleri add constraint push_endpoint check (
  char_length(endpoint) <= 1000
  and endpoint ~ '^https://(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)/[^[:space:]]+$');
alter table public.push_abonelikleri drop constraint if exists push_anahtarlar;
-- p256dh: 65 baytlık P-256 açık anahtarı (base64url 87 karakter), auth: 16 bayt (22 karakter); dolgulu yazımlara pay
alter table public.push_abonelikleri add constraint push_anahtarlar check (
  p256dh ~ '^[A-Za-z0-9_-]{80,100}={0,2}$' and auth ~ '^[A-Za-z0-9_-]{16,32}={0,2}$');
alter table public.push_abonelikleri drop constraint if exists push_tercih;
alter table public.push_abonelikleri add constraint push_tercih check (
  jsonb_typeof(tercih) = 'object'
  and tercih - array['mac_gunu', 'ilk11', 'gol', 'mac_sonu'] = '{}'::jsonb
  and jsonb_typeof(tercih -> 'mac_gunu') = 'boolean' and jsonb_typeof(tercih -> 'ilk11') = 'boolean'
  and jsonb_typeof(tercih -> 'gol') = 'boolean' and jsonb_typeof(tercih -> 'mac_sonu') = 'boolean');
comment on table public.push_abonelikleri is 'Web Push abonelikleri (021). Kişi yalnız kendi satırını görür/siler, yalnız tercihini değiştirir; ekleme bildirim_abone_ol() ile.';

alter table public.push_abonelikleri enable row level security;
revoke all on public.push_abonelikleri from anon, authenticated;
grant select, delete on public.push_abonelikleri to authenticated;
grant update (tercih) on public.push_abonelikleri to authenticated;
drop policy if exists push_okuma on public.push_abonelikleri;
create policy push_okuma on public.push_abonelikleri for select to authenticated using (kullanici_id = (select auth.uid()));
drop policy if exists push_guncelleme on public.push_abonelikleri;
create policy push_guncelleme on public.push_abonelikleri for update to authenticated
  using (kullanici_id = (select auth.uid())) with check (kullanici_id = (select auth.uid()));
drop policy if exists push_silme on public.push_abonelikleri;
create policy push_silme on public.push_abonelikleri for delete to authenticated using (kullanici_id = (select auth.uid()));

-- Abone ol / tercihi yenile. Aynı tarayıcı (endpoint) başka hesapla açılmışsa satır bu hesaba geçer (endpoint tahmin edilemez,
-- tarayıcının kendisine aittir). Kişi başı en çok 10 cihaz.
create or replace function public.bildirim_abone_ol(p_endpoint text, p_p256dh text, p_auth text, p_tercih jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Bildirimleri açmak için giriş yap.' using errcode = '42501';
  end if;
  if (select count(*) from public.push_abonelikleri a where a.kullanici_id = v_uid and a.endpoint <> p_endpoint) >= 10 then
    raise exception 'En çok 10 cihazda bildirim açabilirsin. Kullanmadığın bir cihazda bildirimleri kapat.' using errcode = '22023';
  end if;
  insert into public.push_abonelikleri as a (kullanici_id, endpoint, p256dh, auth, tercih)
  values (v_uid, p_endpoint, p_p256dh, p_auth, coalesce(p_tercih, '{"mac_gunu": true, "ilk11": true, "gol": true, "mac_sonu": true}'::jsonb))
  on conflict (endpoint) do update
    set kullanici_id = excluded.kullanici_id, p256dh = excluded.p256dh, auth = excluded.auth, tercih = excluded.tercih;
exception when check_violation then
  raise exception 'Bu tarayıcının bildirim adresi kabul edilmedi.' using errcode = '22023';
end;
$$;
revoke execute on function public.bildirim_abone_ol(text, text, text, jsonb) from public, anon;
grant execute on function public.bildirim_abone_ol(text, text, text, jsonb) to authenticated;

-- Yönetici: kaç abonelik / kişi, tür başına kaç kişi açık
create or replace function public.bildirim_abone_sayisi()
returns table (abonelik bigint, kisi bigint, mac_gunu bigint, ilk11 bigint, gol bigint, mac_sonu bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Bu bilgiyi yalnız yöneticiler görebilir.' using errcode = '42501';
  end if;
  return query
    select count(*), count(distinct a.kullanici_id),
      count(*) filter (where a.tercih ->> 'mac_gunu' = 'true'), count(*) filter (where a.tercih ->> 'ilk11' = 'true'),
      count(*) filter (where a.tercih ->> 'gol' = 'true'), count(*) filter (where a.tercih ->> 'mac_sonu' = 'true')
    from public.push_abonelikleri a;
end;
$$;
revoke execute on function public.bildirim_abone_sayisi() from public, anon;
grant execute on function public.bildirim_abone_sayisi() to authenticated;

-- ---------------------------------------------------------------------
-- 2) Olaylar (gönderim kaydı)
-- ---------------------------------------------------------------------
create table if not exists public.bildirim_olaylari (
  id bigint generated always as identity primary key,
  olay_anahtari text not null unique,       -- 'gol:<gol id>', 'mac_gunu:<maç id>:<gün>', 'ilk11:<maç id>', 'mac_sonu:<maç id>'
  tur text not null,
  mac_id uuid references public.maclar (id) on delete cascade,
  gol_id uuid references public.goller (id) on delete set null,
  veri jsonb not null default '{}'::jsonb,  -- metin için: rakip, ic_saha, tarih, oyuncu, dakika, ek_dakika, penalti, corum, rakip_skor
  created_at timestamptz not null default now(),
  alindi timestamptz,                       -- Edge Function aldı (10 dk kilit; düşerse yeniden alınır)
  gonderildi timestamptz,
  alici integer,
  basarisiz integer,
  sonuc text                                -- 'gonderildi' | 'bayat' | 'alici-yok'
);
alter table public.bildirim_olaylari drop constraint if exists bildirim_tur;
alter table public.bildirim_olaylari add constraint bildirim_tur check (tur in ('mac_gunu', 'ilk11', 'gol', 'mac_sonu'));
create index if not exists bildirim_olaylari_bekleyen on public.bildirim_olaylari (id) where gonderildi is null;
comment on table public.bildirim_olaylari is 'Bildirim olayları ve gönderim kaydı (021). olay_anahtari tekil: aynı olay iki kez gönderilmez. Yalnız service_role.';
alter table public.bildirim_olaylari enable row level security;
revoke all on public.bildirim_olaylari from anon, authenticated;

create or replace function public.bildirim_olaylarini_hazirla(p_simdi timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer := 0;
  k integer;
  v_gun date := (p_simdi at time zone 'Europe/Istanbul')::date;
begin
  -- maç günü sabahı (10:00 TSİ'den başlama saatine kadar)
  insert into public.bildirim_olaylari (olay_anahtari, tur, mac_id, veri)
  select 'mac_gunu:' || m.id || ':' || v_gun, 'mac_gunu', m.id, jsonb_build_object('rakip', m.rakip, 'ic_saha', m.ic_saha, 'tarih', m.tarih)
  from public.maclar m
  where m.durum = 'planlandi' and m.tarih > p_simdi
    and (m.tarih at time zone 'Europe/Istanbul')::date = v_gun
    and (p_simdi at time zone 'Europe/Istanbul')::time >= time '10:00'
  on conflict (olay_anahtari) do nothing;
  get diagnostics k = row_count; n := n + k;

  -- ilk 11 açıklandı (020: yönetici maclar.ilk11_aciklandi'yi doldurdu)
  insert into public.bildirim_olaylari (olay_anahtari, tur, mac_id, veri)
  select 'ilk11:' || m.id, 'ilk11', m.id, jsonb_build_object('rakip', m.rakip, 'ic_saha', m.ic_saha, 'tarih', m.tarih)
  from public.maclar m
  where m.durum <> 'bitti' and m.ilk11_aciklandi is not null
    and m.tarih between p_simdi - interval '15 minutes' and p_simdi + interval '3 hours'
  on conflict (olay_anahtari) do nothing;
  get diagnostics k = row_count; n := n + k;

  -- Çorum FK golü: skor o golün dakikasına kadarki goller (rakip golleri dahil)
  insert into public.bildirim_olaylari (olay_anahtari, tur, mac_id, gol_id, veri)
  select 'gol:' || g.id, 'gol', m.id, g.id, jsonb_build_object(
      'rakip', m.rakip, 'ic_saha', m.ic_saha, 'tarih', m.tarih,
      'oyuncu', g.oyuncu, 'dakika', g.dakika, 'ek_dakika', g.ek_dakika, 'penalti', g.penalti,
      'corum', (select count(*) from public.goller g2 where g2.mac_id = m.id
                and (g2.dakika * 100 + coalesce(g2.ek_dakika, 0), g2.created_at, g2.id) <= (g.dakika * 100 + coalesce(g.ek_dakika, 0), g.created_at, g.id)),
      'rakip_skor', (select count(*) from public.rakip_goller r where r.mac_id = m.id
                and r.dakika * 100 + coalesce(r.ek_dakika, 0) <= g.dakika * 100 + coalesce(g.ek_dakika, 0)))
  from public.goller g
  join public.maclar m on m.id = g.mac_id
  where g.created_at > p_simdi - interval '20 minutes'
    and m.tarih between p_simdi - interval '4 hours' and p_simdi + interval '30 minutes'
  on conflict (olay_anahtari) do nothing;
  get diagnostics k = row_count; n := n + k;

  -- maç sonu
  insert into public.bildirim_olaylari (olay_anahtari, tur, mac_id, veri)
  select 'mac_sonu:' || m.id, 'mac_sonu', m.id, jsonb_build_object('rakip', m.rakip, 'ic_saha', m.ic_saha, 'tarih', m.tarih,
      'corum', m.corum_skor, 'rakip_skor', m.rakip_skor)
  from public.maclar m
  where m.durum = 'bitti' and m.corum_skor is not null and m.rakip_skor is not null
    and m.tarih between p_simdi - interval '6 hours' and p_simdi
    and m.updated_at > p_simdi - interval '3 hours'
  on conflict (olay_anahtari) do nothing;
  get diagnostics k = row_count; n := n + k;

  delete from public.bildirim_olaylari where created_at < p_simdi - interval '90 days';
  return n;
end;
$$;
revoke execute on function public.bildirim_olaylarini_hazirla(timestamptz) from public, anon, authenticated;
grant execute on function public.bildirim_olaylarini_hazirla(timestamptz) to service_role;

-- Edge Function: bekleyen olayları alır (kilitler). İki çağrı aynı anda gelirse (tetikleyici + cron) aynı olayı ikisi birden almaz.
create or replace function public.bildirim_olaylarini_al(p_adet integer default 20)
returns setof public.bildirim_olaylari
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.bildirim_olaylarini_hazirla();
  return query
    update public.bildirim_olaylari o set alindi = now()
    where o.id in (
      select b.id from public.bildirim_olaylari b
      where b.gonderildi is null and (b.alindi is null or b.alindi < now() - interval '10 minutes')
      order by b.id
      limit greatest(1, least(coalesce(p_adet, 20), 50))
      for update skip locked)
    returning o.*;
end;
$$;
revoke execute on function public.bildirim_olaylarini_al(integer) from public, anon, authenticated;
grant execute on function public.bildirim_olaylarini_al(integer) to service_role;

-- Olay üret; bekleyen varsa Edge Function'ı pg_net ile çağır. Dönüş: 'bos' | 'ayar-yok' | 'cagrildi'.
create or replace function public.bildirim_calistir()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_gizli text;
begin
  perform public.bildirim_olaylarini_hazirla();
  if not exists (select 1 from public.bildirim_olaylari b
                 where b.gonderildi is null and (b.alindi is null or b.alindi < now() - interval '10 minutes')) then
    return 'bos';
  end if;
  if to_regnamespace('net') is null or to_regclass('vault.decrypted_secrets') is null then
    return 'ayar-yok';
  end if;
  select s.decrypted_secret into v_url from vault.decrypted_secrets s where s.name = 'bildirim_url';
  select s.decrypted_secret into v_gizli from vault.decrypted_secrets s where s.name = 'bildirim_gizli';
  if v_url is null or v_gizli is null then
    return 'ayar-yok';
  end if;
  perform net.http_post(
    url := v_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-bildirim-anahtari', v_gizli),
    timeout_milliseconds := 20000);
  return 'cagrildi';
end;
$$;
revoke execute on function public.bildirim_calistir() from public, anon, authenticated;
grant execute on function public.bildirim_calistir() to service_role;

-- Tetikleyici: yönetici golü / maç sonucunu / "ilk 11 açıklandı"yı girince hemen. Hata yöneticinin kaydını ASLA engellemez.
create or replace function public.bildirim_tetikle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform public.bildirim_calistir();
  exception when others then
    raise warning '021: bildirim tetiklenemedi (%)', sqlerrm;
  end;
  return null;
end;
$$;
revoke execute on function public.bildirim_tetikle() from public, anon, authenticated;

drop trigger if exists bildirim_gol on public.goller;
create trigger bildirim_gol after insert on public.goller
  for each statement execute function public.bildirim_tetikle();
drop trigger if exists bildirim_mac on public.maclar;
create trigger bildirim_mac after update of durum, ilk11_aciklandi on public.maclar
  for each statement execute function public.bildirim_tetikle();

-- pg_cron varsa her dakika (sabah bildirimi, ilk 11'in zaman penceresi ve kaçan tetikleme için). Yoksa (düz Postgres, test) atlanır.
-- README "Bildirimler": Database → Extensions → pg_cron ve pg_net açılır, sonra bu dosya (ya da yalnız bu blok) yeniden çalıştırılır.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      execute $c$select cron.schedule('bildirim-calistir', '* * * * *', 'select public.bildirim_calistir()')$c$;
    exception when others then
      raise notice '021: pg_cron işi kurulamadı (%); bildirimler yalnız tetikleyiciyle gider, sabah bildirimi gitmez.', sqlerrm;
    end;
  else
    raise notice '021: pg_cron yok; bildirim-calistir zamanlanmadı (README "Bildirimler").';
  end if;
end;
$$;
