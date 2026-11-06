-- 021 bildirim testleri: abonelik RLS'i, abone_ol kuralları, olay üretimi (tekillik), kilitli alma, yetkiler.
-- 20_rls_testleri.sql'den sonra çalışır; kendi kullanıcılarını ve maçlarını kurar, sonunda siler.
--   dddddddd-...-01  bildirim_yonetici (yönetici)   dddddddd-...-02  bildirim_ali   dddddddd-...-03  bildirim_veli
reset role;
select set_config('request.jwt.claim.sub', '', false);
-- service_role (Edge Function) bölümü de sonuç yazabilsin
grant usage on schema test to service_role;
grant select, insert on test.sonuc to service_role;
grant usage on sequence test.sonuc_no_seq to service_role;
grant execute on all functions in schema test to service_role;

insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
  ('dddddddd-0000-4000-8000-000000000001', 'bildirim-yonetici@ornek.test', '{"kullanici_adi":"bildirim_yonetici"}', now()),
  ('dddddddd-0000-4000-8000-000000000002', 'bildirim-ali@ornek.test', '{"kullanici_adi":"bildirim_ali"}', now()),
  ('dddddddd-0000-4000-8000-000000000003', 'bildirim-veli@ornek.test', '{"kullanici_adi":"bildirim_veli"}', now());
update public.profiles set role = 'admin' where id = 'dddddddd-0000-4000-8000-000000000001';

select test.dogru('bildirim (021): push_abonelikleri ve bildirim_olaylari tablolarında RLS açık',
  (select bool_and(rowsecurity) from pg_tables where schemaname = 'public' and tablename in ('push_abonelikleri', 'bildirim_olaylari'))
  and (select count(*) from pg_tables where schemaname = 'public' and tablename in ('push_abonelikleri', 'bildirim_olaylari')) = 2);
select test.dogru('bildirim (021): SECURITY DEFINER fonksiyonlarında search_path sabit',
  (select bool_and(prosecdef and proconfig is not null) from pg_proc
   where pronamespace = 'public'::regnamespace and proname in ('bildirim_abone_ol', 'bildirim_abone_sayisi', 'bildirim_olaylarini_hazirla',
     'bildirim_olaylarini_al', 'bildirim_calistir', 'bildirim_tetikle')));

-- ---------------------------------------------------------------- anon
set role anon;
select test.hata_bekle('bildirim (021): anon abone olamaz',
  $q$select public.bildirim_abone_ol('https://fcm.googleapis.com/fcm/send/anon1', repeat('A', 87), repeat('b', 22), null)$q$);
select test.hata_bekle('bildirim (021): anon abonelikleri okuyamaz', $q$select count(*) from public.push_abonelikleri$q$, 'permission denied');
reset role;

-- ---------------------------------------------------------------- Ali abone olur
select set_config('request.jwt.claim.sub', 'dddddddd-0000-4000-8000-000000000002', false);
set role authenticated;
select public.bildirim_abone_ol('https://fcm.googleapis.com/fcm/send/ali-telefon', repeat('A', 87), repeat('b', 22), null);
select test.esit('bildirim (021): Ali abone olur, tercih varsayılanı dördü de açık',
  (select tercih::text from public.push_abonelikleri where endpoint = 'https://fcm.googleapis.com/fcm/send/ali-telefon'),
  '{"gol": true, "ilk11": true, "mac_gunu": true, "mac_sonu": true}');
select public.bildirim_abone_ol('https://web.push.apple.com/ali-ipad', repeat('C', 87), repeat('d', 22),
  '{"mac_gunu": false, "ilk11": false, "gol": true, "mac_sonu": true}');
select test.esit('bildirim (021): Ali iki cihazını görür (Apple adresi kabul)', (select count(*)::text from public.push_abonelikleri), '2');
select test.esit('bildirim (021): Ali tercihini değiştirir',
  test.satir($q$update public.push_abonelikleri set tercih = '{"mac_gunu": true, "ilk11": false, "gol": true, "mac_sonu": false}' where endpoint = 'https://web.push.apple.com/ali-ipad'$q$)::text, '1');
select test.hata_bekle('bildirim (021): Ali endpoint''i değiştiremez (yalnız tercih sütunu)',
  $q$update public.push_abonelikleri set endpoint = 'https://fcm.googleapis.com/fcm/send/baska' where endpoint = 'https://web.push.apple.com/ali-ipad'$q$, 'permission denied');
select test.hata_bekle('bildirim (021): doğrudan ekleme yok (yalnız bildirim_abone_ol)',
  $q$insert into public.push_abonelikleri (kullanici_id, endpoint, p256dh, auth) values ('dddddddd-0000-4000-8000-000000000002', 'https://fcm.googleapis.com/fcm/send/x', repeat('A', 87), repeat('b', 22))$q$, 'permission denied');
select test.hata_bekle('bildirim (021): bilinmeyen push servisi reddedilir (SSRF yok)',
  $q$select public.bildirim_abone_ol('https://kotu.ornek.test/push', repeat('A', 87), repeat('b', 22), null)$q$, 'kabul edilmedi');
select test.hata_bekle('bildirim (021): http adresi reddedilir',
  $q$select public.bildirim_abone_ol('http://fcm.googleapis.com/fcm/send/x', repeat('A', 87), repeat('b', 22), null)$q$, 'kabul edilmedi');
select test.hata_bekle('bildirim (021): bozuk anahtar reddedilir',
  $q$select public.bildirim_abone_ol('https://fcm.googleapis.com/fcm/send/y', 'kisa', repeat('b', 22), null)$q$, 'kabul edilmedi');
select test.hata_bekle('bildirim (021): bilinmeyen tercih anahtarı reddedilir',
  $q$select public.bildirim_abone_ol('https://fcm.googleapis.com/fcm/send/z', repeat('A', 87), repeat('b', 22), '{"mac_gunu": true, "ilk11": true, "gol": true, "mac_sonu": true, "reklam": true}')$q$, 'kabul edilmedi');
select test.hata_bekle('bildirim (021): tercih değeri boolean olmalı',
  $q$update public.push_abonelikleri set tercih = '{"mac_gunu": "evet", "ilk11": true, "gol": true, "mac_sonu": true}'$q$, 'push_tercih');
select test.hata_bekle('bildirim (021): yönetici olmayan abone sayısını göremez', $q$select * from public.bildirim_abone_sayisi()$q$, 'yalnız yönetici');
select test.hata_bekle('bildirim (021): taraftar olay kaydını okuyamaz', $q$select count(*) from public.bildirim_olaylari$q$, 'permission denied');
select test.hata_bekle('bildirim (021): taraftar olay alamaz (yalnız service_role)', $q$select * from public.bildirim_olaylarini_al(5)$q$, 'permission denied');
select test.hata_bekle('bildirim (021): taraftar Edge Function çağrısını tetikleyemez', $q$select public.bildirim_calistir()$q$, 'permission denied');
reset role;

-- ---------------------------------------------------------------- Veli: başkasının satırı
select set_config('request.jwt.claim.sub', 'dddddddd-0000-4000-8000-000000000003', false);
set role authenticated;
select test.esit('bildirim (021): Veli, Ali''nin aboneliklerini görmez', (select count(*)::text from public.push_abonelikleri), '0');
select test.esit('bildirim (021): Veli, Ali''nin tercihini değiştiremez (0 satır)',
  test.satir($q$update public.push_abonelikleri set tercih = '{"mac_gunu": false, "ilk11": false, "gol": false, "mac_sonu": false}'$q$)::text, '0');
select test.esit('bildirim (021): Veli, Ali''nin aboneliğini silemez (0 satır)', test.satir($q$delete from public.push_abonelikleri$q$)::text, '0');
-- Aynı tarayıcı (Ali'nin telefonu) Veli'nin hesabıyla açıldı: satır Veli'ye geçer
select public.bildirim_abone_ol('https://fcm.googleapis.com/fcm/send/ali-telefon', repeat('E', 87), repeat('f', 22), null);
select test.esit('bildirim (021): aynı tarayıcı başka hesapla abone olunca satır o hesaba geçer', (select count(*)::text from public.push_abonelikleri), '1');
reset role;
select test.esit('bildirim (021): endpoint tekil (aynı tarayıcıya iki satır yok)',
  (select count(*)::text from public.push_abonelikleri where endpoint = 'https://fcm.googleapis.com/fcm/send/ali-telefon'), '1');
-- 10 cihaz sınırı
insert into public.push_abonelikleri (kullanici_id, endpoint, p256dh, auth)
  select 'dddddddd-0000-4000-8000-000000000003', 'https://fcm.googleapis.com/fcm/send/veli-' || i, repeat('A', 87), repeat('b', 22) from generate_series(1, 9) i;
select set_config('request.jwt.claim.sub', 'dddddddd-0000-4000-8000-000000000003', false);
set role authenticated;
select test.hata_bekle('bildirim (021): kişi başı en çok 10 cihaz',
  $q$select public.bildirim_abone_ol('https://fcm.googleapis.com/fcm/send/veli-11', repeat('A', 87), repeat('b', 22), null)$q$, 'En çok 10 cihaz');
select public.bildirim_abone_ol('https://fcm.googleapis.com/fcm/send/veli-1', repeat('A', 87), repeat('b', 22), null);
select test.esit('bildirim (021): var olan cihazın yenilenmesi sınıra takılmaz', (select count(*)::text from public.push_abonelikleri), '10');
select test.esit('bildirim (021): Veli kendi aboneliğini siler',
  test.satir($q$delete from public.push_abonelikleri where endpoint = 'https://fcm.googleapis.com/fcm/send/veli-9'$q$)::text, '1');
reset role;

-- ---------------------------------------------------------------- yönetici sayısı
select set_config('request.jwt.claim.sub', 'dddddddd-0000-4000-8000-000000000001', false);
set role authenticated;
select test.esit('bildirim (021): yönetici abone sayısını görür (abonelik, kişi, gol açık)',
  (select abonelik || '/' || kisi || '/' || gol || '/' || ilk11 from public.bildirim_abone_sayisi()),
  '10/2/10/9');  -- Ali'nin iPad'i (ilk 11 kapalı) + Veli'ye geçen telefon + Veli'nin 8 cihazı
reset role;
select set_config('request.jwt.claim.sub', '', false);

-- ---------------------------------------------------------------- olay üretimi (sahte "şimdi" ile, saatten bağımsız)
-- M1 bugün 19:00 TSİ (maç günü), M2 3 saat sonra (ilk 11), M3 30 dk önce başladı (gol, maç sonu), M4 iki gün önce (eski gol)
insert into public.maclar (id, rakip, tarih, ic_saha, durum) values
  ('12121212-0000-4000-8000-000000000001', 'Bildirim Rakip A', (date_trunc('day', now() at time zone 'Europe/Istanbul') + interval '19 hours') at time zone 'Europe/Istanbul', true, 'planlandi'),
  ('12121212-0000-4000-8000-000000000002', 'Bildirim Rakip B', now() + interval '1 hour', false, 'planlandi'),
  ('12121212-0000-4000-8000-000000000003', 'Bildirim Rakip C', now() - interval '30 minutes', true, 'canli'),
  ('12121212-0000-4000-8000-000000000004', 'Bildirim Rakip D', now() - interval '2 days', true, 'canli'),
  ('12121212-0000-4000-8000-000000000005', 'Bildirim Rakip E', now() + interval '1 hour', true, 'planlandi');
-- sabah 09:30: henüz maç günü bildirimi yok; 10:05: var
select public.bildirim_olaylarini_hazirla((date_trunc('day', now() at time zone 'Europe/Istanbul') + interval '9 hours 30 minutes') at time zone 'Europe/Istanbul');
select test.esit('bildirim (021): 09:30 TSİ''de maç günü olayı yok',
  (select count(*)::text from public.bildirim_olaylari where tur = 'mac_gunu' and mac_id = '12121212-0000-4000-8000-000000000001'), '0');
select public.bildirim_olaylarini_hazirla((date_trunc('day', now() at time zone 'Europe/Istanbul') + interval '10 hours 5 minutes') at time zone 'Europe/Istanbul');
select public.bildirim_olaylarini_hazirla((date_trunc('day', now() at time zone 'Europe/Istanbul') + interval '10 hours 6 minutes') at time zone 'Europe/Istanbul');
select test.esit('bildirim (021): 10:05 TSİ''de maç günü olayı TEK (iki kez hazırlansa da)',
  (select count(*)::text from public.bildirim_olaylari where tur = 'mac_gunu' and mac_id = '12121212-0000-4000-8000-000000000001'), '1');
select test.hata_bekle('bildirim (021): aynı olay anahtarı ikinci kez yazılamaz (unique)',
  $q$insert into public.bildirim_olaylari (olay_anahtari, tur) select olay_anahtari, tur from public.bildirim_olaylari where mac_id = '12121212-0000-4000-8000-000000000001'$q$, 'duplicate|unique|benzersiz');

-- ilk 11 (020 ilk11_aciklandi): dolunca tetikleyiciyle olay; boşken yok; maçtan 4 saat önce dolsa da pencere açılınca
select test.esit('bildirim (021): ilk 11 açıklanmadan olay yok',
  (select count(*)::text from public.bildirim_olaylari where tur = 'ilk11' and mac_id in ('12121212-0000-4000-8000-000000000002', '12121212-0000-4000-8000-000000000005')), '0');
update public.maclar set ilk11_aciklandi = now() where id = '12121212-0000-4000-8000-000000000002';
select test.esit('bildirim (021): ilk11_aciklandi dolunca tetikleyici olayı üretir',
  (select count(*)::text from public.bildirim_olaylari where tur = 'ilk11' and olay_anahtari = 'ilk11:12121212-0000-4000-8000-000000000002'), '1');
update public.maclar set ilk11_aciklandi = now() where id = '12121212-0000-4000-8000-000000000002';
select test.esit('bildirim (021): ilk 11 yeniden kaydedilse de ikinci bildirim yok',
  (select count(*)::text from public.bildirim_olaylari where tur = 'ilk11' and mac_id = '12121212-0000-4000-8000-000000000002'), '1');
update public.maclar set ilk11_aciklandi = now(), tarih = now() + interval '4 hours' where id = '12121212-0000-4000-8000-000000000005';
select test.esit('bildirim (021): maça 3 saatten çok varken ilk 11 bildirimi bekler',
  (select count(*)::text from public.bildirim_olaylari where tur = 'ilk11' and mac_id = '12121212-0000-4000-8000-000000000005'), '0');
select public.bildirim_olaylarini_hazirla(now() + interval '1 hour 5 minutes');
select test.esit('bildirim (021): pencere açılınca (cron) ilk 11 bildirimi üretilir',
  (select count(*)::text from public.bildirim_olaylari where tur = 'ilk11' and mac_id = '12121212-0000-4000-8000-000000000005'), '1');

-- gol: rakip 12'de, biz 59'da (1-1), 90+2'de (2-1); eski maçtaki gol olay üretmez
insert into public.rakip_goller (mac_id, dakika, oyuncu) values ('12121212-0000-4000-8000-000000000003', 12, 'Rakip Forvet');
insert into public.goller (mac_id, oyuncu, dakika) values ('12121212-0000-4000-8000-000000000003', 'Kyziridis', 59);
insert into public.goller (mac_id, oyuncu, dakika, ek_dakika, penalti) values ('12121212-0000-4000-8000-000000000003', 'Bildirim Golcü', 90, 2, true);
insert into public.goller (mac_id, oyuncu, dakika) values ('12121212-0000-4000-8000-000000000004', 'Eski Golcü', 10);
select test.esit('bildirim (021): golde olay (tetikleyiciyle) ve skor o dakikaya kadar (59'' → 1-1)',
  (select (veri ->> 'corum') || '-' || (veri ->> 'rakip_skor') || ' ' || (veri ->> 'oyuncu') || ' ' || (veri ->> 'dakika') from public.bildirim_olaylari b
   join public.goller g on g.id = b.gol_id where b.tur = 'gol' and g.oyuncu = 'Kyziridis' and g.mac_id = '12121212-0000-4000-8000-000000000003'),
  '1-1 Kyziridis 59');
select test.esit('bildirim (021): uzatma dakikalı penaltı golü (90+2 → 2-1)',
  (select (veri ->> 'corum') || '-' || (veri ->> 'rakip_skor') || ' ' || (veri ->> 'ek_dakika') || ' ' || (veri ->> 'penalti') from public.bildirim_olaylari b
   where b.tur = 'gol' and b.veri ->> 'oyuncu' = 'Bildirim Golcü'), '2-1 2 true');
select test.esit('bildirim (021): eski maça girilen gol bildirim üretmez',
  (select count(*)::text from public.bildirim_olaylari where mac_id = '12121212-0000-4000-8000-000000000004'), '0');
select public.bildirim_olaylarini_hazirla();
select test.esit('bildirim (021): gol olayı tekil (yeniden hazırlansa da)',
  (select count(*)::text from public.bildirim_olaylari where tur = 'gol' and mac_id = '12121212-0000-4000-8000-000000000003'), '2');

-- maç sonu
update public.maclar set durum = 'bitti', corum_skor = 2, rakip_skor = 1 where id = '12121212-0000-4000-8000-000000000003';
select test.esit('bildirim (021): maç bitince maç sonu olayı (skorla)',
  (select (veri ->> 'corum') || '-' || (veri ->> 'rakip_skor') from public.bildirim_olaylari where olay_anahtari = 'mac_sonu:12121212-0000-4000-8000-000000000003'), '2-1');
update public.maclar set rakip_skor = 1, corum_skor = 3 where id = '12121212-0000-4000-8000-000000000003';
select public.bildirim_olaylarini_hazirla();
select test.esit('bildirim (021): skor düzeltmesi ikinci maç sonu bildirimi üretmez',
  (select count(*)::text from public.bildirim_olaylari where tur = 'mac_sonu' and mac_id = '12121212-0000-4000-8000-000000000003'), '1');
select test.esit('bildirim (021): test ortamında (pg_net/Vault yok) bildirim_calistir sessizce atlar', public.bildirim_calistir(), 'ayar-yok');

-- ---------------------------------------------------------------- service_role: kilitli alma
set role service_role;
select test.dogru('bildirim (021): service_role bekleyen olayları alır',
  (select count(*) from public.bildirim_olaylarini_al(50)) >= 6);
select test.esit('bildirim (021): alınan olay 10 dk kilitli (ikinci çağrı aynı olayı almaz)',
  (select count(*)::text from public.bildirim_olaylarini_al(50)), '0');
select test.esit('bildirim (021): service_role gönderimi kaydeder',
  test.satir($q$update public.bildirim_olaylari set gonderildi = now(), alici = 3, basarisiz = 0, sonuc = 'gonderildi' where mac_id = '12121212-0000-4000-8000-000000000003'$q$)::text, '3');
select test.dogru('bildirim (021): service_role abonelikleri okur ve 410 alan aboneliği siler',
  test.satir($q$delete from public.push_abonelikleri where endpoint = 'https://fcm.googleapis.com/fcm/send/veli-8'$q$) = 1);
reset role;
select test.esit('bildirim (021): gönderilen olay bir daha alınmaz (kilit süresi geçse de)',
  (select count(*)::text from public.bildirim_olaylari where mac_id = '12121212-0000-4000-8000-000000000003' and gonderildi is null), '0');

-- ---------------------------------------------------------------- 022: Vault'taki gizli ayarlar yalnız service_role
select test.dogru('bildirim (022): bildirim_gizli_ayarlar SECURITY DEFINER, search_path sabit',
  (select prosecdef and proconfig is not null from pg_proc where oid = 'public.bildirim_gizli_ayarlar()'::regprocedure));
set role anon;
select test.hata_bekle('bildirim (022): anon gizli ayarları okuyamaz', $q$select * from public.bildirim_gizli_ayarlar()$q$, 'permission denied');
reset role;
select set_config('request.jwt.claim.sub', 'dddddddd-0000-4000-8000-000000000002', false);
set role authenticated;
select test.hata_bekle('bildirim (022): taraftar gizli ayarları okuyamaz', $q$select * from public.bildirim_gizli_ayarlar()$q$, 'permission denied');
reset role;
select set_config('request.jwt.claim.sub', 'dddddddd-0000-4000-8000-000000000001', false);
set role authenticated;
select test.hata_bekle('bildirim (022): yönetici de gizli ayarları okuyamaz', $q$select * from public.bildirim_gizli_ayarlar()$q$, 'permission denied');
reset role;
select set_config('request.jwt.claim.sub', '', false);
set role service_role;
select test.esit('bildirim (022): service_role çalıştırır; Vault yoksa (test) tek boş satır',
  (select count(*)::text || ' ' || (bildirim_gizli is null)::text from public.bildirim_gizli_ayarlar() group by bildirim_gizli), '1 true');
reset role;

-- ---------------------------------------------------------------- temizlik
delete from public.maclar where id::text like '12121212-0000-4000-8000-%';
select test.esit('bildirim (021): maç silinince olayları da silinir (cascade)',
  (select count(*)::text from public.bildirim_olaylari where mac_id::text like '12121212-0000-4000-8000-%'), '0');
delete from auth.users where id::text like 'dddddddd-0000-4000-8000-%';
delete from public.profiles where id::text like 'dddddddd-0000-4000-8000-%';
select test.esit('bildirim (021): hesap silinince abonelikleri de silinir',
  (select count(*)::text from public.push_abonelikleri where kullanici_id::text like 'dddddddd-0000-4000-8000-%'), '0');
