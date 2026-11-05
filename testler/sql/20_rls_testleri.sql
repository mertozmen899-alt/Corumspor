-- RLS, tetikleyici ve kısıt testleri. Migration'lar ve seed.sql'den sonra çalışır.
-- Kullanıcılar:
--   aaaaaaaa-...-01  yonetici (ilk yönetici SQL ile atanır)
--   bbbbbbbb-...-01  ayse_19 (taraftar; kayıtta sinsi "role":"admin" gönderir)
--   bbbbbbbb-...-02  burak   (taraftar; aynı kullanıcı adını dener)
--   bbbbbbbb-...-03  can     (taraftar; oran sınırı testi)

-- ---------------------------------------------------------------- seed
select test.esit('seed: 4 haber (3 yayında + 1 taslak)', (select count(*) from public.haberler)::text, '4');
select test.esit('seed: 4 maç', (select count(*) from public.maclar)::text, '4');
select test.esit('seed: 3 gol', (select count(*) from public.goller)::text, '3');
select test.esit('seed: haber_gorselleri kovası herkese açık', (select public::text from storage.buckets where id = 'haber-gorselleri'), 'true');
select test.esit('RLS: public şemadaki her tabloda açık',
  (select count(*) from pg_tables where schemaname = 'public' and not rowsecurity)::text, '0');
select test.dogru('is_admin(): SECURITY DEFINER, STABLE ve search_path sabit',
  (select prosecdef and provolatile = 's' and proconfig is not null from pg_proc where oid = 'public.is_admin()'::regprocedure));

-- ---------------------------------------------------------------- kayıt (auth.users tetikleyicisi)
-- e-posta onaylı hesaplar (Supabase "Confirm email" açık: onay bağlantısına tıklanmış)
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'yonetici@ornek.test', '{"kullanici_adi":"yonetici"}', now()),
  ('bbbbbbbb-0000-4000-8000-000000000001', 'ayse@ornek.test', '{"kullanici_adi":"ayse_19","role":"admin"}', now()),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'burak@ornek.test', '{"kullanici_adi":"AYSE_19"}', now()),
  ('bbbbbbbb-0000-4000-8000-000000000003', 'can@ornek.test', '{"kullanici_adi":"<b>can</b>"}', now());

select test.esit('kayıt: her kullanıcıya profil açılır', (select count(*) from public.profiles)::text, '4');
select test.esit('kayıt: metadata içindeki role=admin yok sayılır',
  (select role from public.profiles where id = 'bbbbbbbb-0000-4000-8000-000000000001'), 'taraftar');
select test.esit('kayıt: aynı kullanıcı adı (büyük/küçük harf) sonek alır',
  (select kullanici_adi from public.profiles where id = 'bbbbbbbb-0000-4000-8000-000000000002'), 'AYSE_19_1');
select test.esit('kayıt: kullanıcı adındaki HTML karakterleri temizlenir',
  (select kullanici_adi from public.profiles where id = 'bbbbbbbb-0000-4000-8000-000000000003'), 'bcanb');
-- 012: ayrılmış / yanıltıcı adlar (yönetici, resmî, kulüp…) kayıtta kabul edilmez: "taraftar…" adına düşer
select test.dogru('kayıt (012): ayrılmış ad "yonetici" kullanılmaz, taraftar… adı verilir',
  (select kullanici_adi ~ '^taraftar[0-9a-f]{6}$' from public.profiles where id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  (select kullanici_adi from public.profiles where id = 'aaaaaaaa-0000-4000-8000-000000000001'));

-- README'deki ilk yönetici komutu (SQL Editor = postgres rolü)
update public.profiles set role = 'admin'
  where id = (select id from auth.users where email = 'yonetici@ornek.test');
select test.esit('ilk yönetici README komutuyla atanır',
  (select role from public.profiles where id = 'aaaaaaaa-0000-4000-8000-000000000001'), 'admin');

-- ---------------------------------------------------------------- anon
select set_config('request.jwt.claim.sub', '', false);
set role anon;
select test.esit('anon: sadece yayındaki haberleri görür', (select count(*) from public.haberler)::text, '3');
select test.esit('anon: taslak haber görünmez',
  (select count(*) from public.haberler where id = '33333333-0000-4000-8000-000000000004')::text, '0');
select test.esit('anon: bütün maçları görür', (select count(*) from public.maclar)::text, '4');
select test.esit('anon: golleri görür', (select count(*) from public.goller)::text, '3');
select test.dogru('anon: is_admin() false', not public.is_admin());
select test.hata_bekle('anon: haber ekleyemez',
  $q$insert into public.haberler (baslik, govde, yayinda) values ('Anon haberi', 'x', true)$q$, 'row-level security');
select test.esit('anon: haber güncelleyemez (0 satır)', test.satir($q$update public.haberler set baslik = 'ele geçirildi'$q$)::text, '0');
select test.esit('anon: maç silemez (0 satır)', test.satir($q$delete from public.maclar$q$)::text, '0');
select test.hata_bekle('anon: yorum yazamaz',
  $q$insert into public.yorumlar (haber_id, metin, kullanici_id) values ('33333333-0000-4000-8000-000000000001', 'merhaba', 'bbbbbbbb-0000-4000-8000-000000000001')$q$);
select test.esit('anon: rol değiştiremez (0 satır)', test.satir($q$update public.profiles set role = 'admin'$q$)::text, '0');
select test.hata_bekle('anon: depoya görsel yükleyemez',
  $q$insert into storage.objects (bucket_id, name) values ('haber-gorselleri', 'anon.png')$q$, 'row-level security');
reset role;

-- ---------------------------------------------------------------- taraftar: ayse_19
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-000000000001', false);
set role authenticated;
select test.dogru('taraftar: is_admin() false', not public.is_admin());
select test.hata_bekle('taraftar: kendi rolünü admin yapamaz',
  $q$update public.profiles set role = 'admin' where id = 'bbbbbbbb-0000-4000-8000-000000000001'$q$, 'Rol değiştirme');
select test.esit('taraftar: başkasının profilini değiştiremez (0 satır)',
  test.satir($q$update public.profiles set kullanici_adi = 'degisti' where id = 'bbbbbbbb-0000-4000-8000-000000000002'$q$)::text, '0');
select test.esit('taraftar: kendi kullanıcı adını değiştirebilir',
  test.satir($q$update public.profiles set kullanici_adi = 'ayse_yeni' where id = 'bbbbbbbb-0000-4000-8000-000000000001'$q$)::text, '1');
select test.hata_bekle('taraftar: haber yazamaz',
  $q$insert into public.haberler (baslik, govde, yayinda) values ('Taraftar haberi', 'x', true)$q$, 'row-level security');
select test.esit('taraftar: haber güncelleyemez (0 satır)', test.satir($q$update public.haberler set yayinda = false$q$)::text, '0');
select test.esit('taraftar: haber silemez (0 satır)', test.satir($q$delete from public.haberler$q$)::text, '0');
select test.esit('taraftar: taslak haberi göremez', (select count(*) from public.haberler)::text, '3');
select test.hata_bekle('taraftar: maç ekleyemez',
  $q$insert into public.maclar (rakip, tarih) values ('Sahte Rakip', now())$q$, 'row-level security');
select test.esit('taraftar: skor değiştiremez (0 satır)', test.satir($q$update public.maclar set corum_skor = 9$q$)::text, '0');
select test.hata_bekle('taraftar: gol ekleyemez',
  $q$insert into public.goller (mac_id, oyuncu, dakika) values ('11111111-0000-4000-8000-000000000001', 'Sahte', 10)$q$, 'row-level security');
select test.esit('taraftar: gol silemez (0 satır)', test.satir($q$delete from public.goller$q$)::text, '0');
select test.hata_bekle('taraftar: depoya görsel yükleyemez',
  $q$insert into storage.objects (bucket_id, name) values ('haber-gorselleri', 'taraftar.png')$q$, 'row-level security');

-- yorumlar
select test.esit('taraftar: habere yorum yazabilir',
  test.satir($q$insert into public.yorumlar (haber_id, metin) values ('33333333-0000-4000-8000-000000000001', 'Harika maçtı!')$q$)::text, '1');
select test.esit('taraftar: maça yorum yazabilir',
  test.satir($q$insert into public.yorumlar (mac_id, metin) values ('11111111-0000-4000-8000-000000000003', 'Hadi Çorum!')$q$)::text, '1');
select test.hata_bekle('yorum: sadece boşluk reddedilir',
  $q$insert into public.yorumlar (mac_id, metin) values ('11111111-0000-4000-8000-000000000003', '   ')$q$, 'check');
select test.hata_bekle('yorum: 1001 karakter reddedilir',
  $q$insert into public.yorumlar (mac_id, metin) values ('11111111-0000-4000-8000-000000000003', repeat('a', 1001))$q$, 'check');
select test.esit('yorum: 1000 karakter kabul edilir',
  test.satir($q$insert into public.yorumlar (mac_id, metin) values ('11111111-0000-4000-8000-000000000003', repeat('b', 1000))$q$)::text, '1');
select test.hata_bekle('yorum: hem habere hem maça bağlanamaz',
  $q$insert into public.yorumlar (haber_id, mac_id, metin) values ('33333333-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'iki hedef')$q$, 'yorum_tek_hedef');
select test.hata_bekle('yorum: taslak habere yazılamaz',
  $q$insert into public.yorumlar (haber_id, metin) values ('33333333-0000-4000-8000-000000000004', 'gizli habere yorum')$q$, 'row-level security');
-- Başkası adına, gizli ve geçmiş tarihli yorum denemesi: sunucu sahibi/tarihi/gizliyi düzeltir
select test.satir($q$insert into public.yorumlar (haber_id, metin, kullanici_id, gizli, created_at)
  values ('33333333-0000-4000-8000-000000000002', 'sahte sahip', 'bbbbbbbb-0000-4000-8000-000000000002', true, now() - interval '1 day')$q$);
select test.dogru('yorum: başkası adına yazılamaz (sahip oturumdaki kullanıcı olur)',
  exists (select 1 from public.yorumlar where metin = 'sahte sahip' and kullanici_id = 'bbbbbbbb-0000-4000-8000-000000000001'));
select test.dogru('yorum: gizli bayrağı ve geçmiş tarih yok sayılır',
  exists (select 1 from public.yorumlar where metin = 'sahte sahip' and not gizli and created_at > now() - interval '1 minute'));
select test.esit('taraftar: kendi yorumunu düzenleyebilir',
  test.satir($q$update public.yorumlar set metin = 'Harika maçtı! (düzeltme)' where metin = 'Harika maçtı!'$q$)::text, '1');
select test.dogru('yorum: düzenlenince "duzenlendi" dolar',
  (select duzenlendi is not null from public.yorumlar where metin = 'Harika maçtı! (düzeltme)'));
select test.hata_bekle('taraftar: kendi yorumunun gizli bayrağını değiştiremez',
  $q$update public.yorumlar set gizli = true where metin like 'Harika%'$q$, 'sadece metni');
select test.hata_bekle('taraftar: yorumu başka habere taşıyamaz',
  $q$update public.yorumlar set haber_id = '33333333-0000-4000-8000-000000000003' where metin like 'Harika%'$q$, 'sadece metni');
reset role;

-- ---------------------------------------------------------------- taraftar: burak
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-000000000002', false);
set role authenticated;
select test.esit('taraftar: başkasının yorumunu düzenleyemez (0 satır)',
  test.satir($q$update public.yorumlar set metin = 'ele geçirildi' where kullanici_id = 'bbbbbbbb-0000-4000-8000-000000000001'$q$)::text, '0');
select test.esit('taraftar: başkasının yorumunu silemez (0 satır)',
  test.satir($q$delete from public.yorumlar where kullanici_id = 'bbbbbbbb-0000-4000-8000-000000000001'$q$)::text, '0');
select test.esit('taraftar: kendi yorumunu yazar',
  test.satir($q$insert into public.yorumlar (haber_id, metin) values ('33333333-0000-4000-8000-000000000001', 'Burak burada')$q$)::text, '1');
select test.esit('taraftar: kendi yorumunu silebilir',
  test.satir($q$delete from public.yorumlar where metin = 'Burak burada'$q$)::text, '1');
select test.satir($q$insert into public.yorumlar (haber_id, metin) values ('33333333-0000-4000-8000-000000000001', 'Burak kalıcı')$q$);
reset role;
select test.esit('Ayşe''nin yorumları başkası tarafından değişmedi',
  (select count(*) from public.yorumlar where kullanici_id = 'bbbbbbbb-0000-4000-8000-000000000001' and metin <> 'ele geçirildi')::text, '4');

-- ---------------------------------------------------------------- oran sınırı: can
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-000000000003', false);
set role authenticated;
select test.satir($q$insert into public.yorumlar (mac_id, metin) values ('11111111-0000-4000-8000-000000000001', 'yorum 1')$q$);
select test.satir($q$insert into public.yorumlar (mac_id, metin) values ('11111111-0000-4000-8000-000000000001', 'yorum 2')$q$);
select test.satir($q$insert into public.yorumlar (mac_id, metin) values ('11111111-0000-4000-8000-000000000001', 'yorum 3')$q$);
select test.satir($q$insert into public.yorumlar (mac_id, metin) values ('11111111-0000-4000-8000-000000000001', 'yorum 4')$q$);
select test.satir($q$insert into public.yorumlar (mac_id, metin) values ('11111111-0000-4000-8000-000000000001', 'yorum 5')$q$);
select test.esit('oran sınırı: dakikada 5 yorum kabul edilir',
  (select count(*) from public.yorumlar where kullanici_id = 'bbbbbbbb-0000-4000-8000-000000000003')::text, '5');
select test.hata_bekle('oran sınırı: 6. yorum reddedilir',
  $q$insert into public.yorumlar (mac_id, metin) values ('11111111-0000-4000-8000-000000000001', 'yorum 6')$q$, 'Çok hızlı yorum');
select test.hata_bekle('oran sınırı: geçmiş created_at göndererek atlatılamaz',
  $q$insert into public.yorumlar (mac_id, metin, created_at) values ('11111111-0000-4000-8000-000000000001', 'yorum 7', now() - interval '1 hour')$q$, 'Çok hızlı yorum');
reset role;

-- ---------------------------------------------------------------- yönetici
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);
set role authenticated;
select test.dogru('yönetici: is_admin() true', public.is_admin());
select test.esit('yönetici: taslak dahil bütün haberleri görür', (select count(*) from public.haberler)::text, '4');
select test.esit('yönetici: haber ekleyebilir',
  test.satir($q$insert into public.haberler (id, baslik, govde, yayinda) values ('33333333-0000-4000-8000-000000000009', 'Yönetici haberi', 'Gövde', false)$q$)::text, '1');
select test.dogru('haber: taslağın yayın tarihi boş',
  (select yayin_tarihi is null from public.haberler where id = '33333333-0000-4000-8000-000000000009'));
select test.esit('yönetici: haberi yayınlayabilir',
  test.satir($q$update public.haberler set yayinda = true where id = '33333333-0000-4000-8000-000000000009'$q$)::text, '1');
select test.dogru('haber: yayınlanınca yayın tarihi atanır',
  (select yayin_tarihi is not null from public.haberler where id = '33333333-0000-4000-8000-000000000009'));
select test.esit('yönetici: haberi yayından kaldırabilir',
  test.satir($q$update public.haberler set yayinda = false where id = '33333333-0000-4000-8000-000000000009'$q$)::text, '1');
select test.hata_bekle('haber: javascript: kapak adresi reddedilir',
  $q$update public.haberler set kapak_url = 'javascript:alert(1)' where id = '33333333-0000-4000-8000-000000000009'$q$, 'check');
select test.esit('yönetici: maç ekleyebilir',
  test.satir($q$insert into public.maclar (id, rakip, tarih, stadyum) values ('11111111-0000-4000-8000-000000000009', 'Test Rakibi', '2026-12-01T16:30:00Z', 'Test Stadı')$q$)::text, '1');
select test.hata_bekle('maç: geçersiz durum reddedilir',
  $q$insert into public.maclar (rakip, tarih, durum) values ('Geçersiz', now(), 'ertelendi')$q$, 'check');
select test.hata_bekle('maç: "bitti" durumunda skor zorunlu',
  $q$update public.maclar set durum = 'bitti' where id = '11111111-0000-4000-8000-000000000009'$q$, 'bitti_skorlu');
select test.esit('yönetici: skoru ve durumu güncelleyebilir',
  test.satir($q$update public.maclar set durum = 'bitti', corum_skor = 3, rakip_skor = 0 where id = '11111111-0000-4000-8000-000000000009'$q$)::text, '1');
select test.esit('yönetici: gol ekleyebilir',
  test.satir($q$insert into public.goller (id, mac_id, oyuncu, dakika, video_url) values ('22222222-0000-4000-8000-000000000009', '11111111-0000-4000-8000-000000000009', 'Test Golcü', 12, 'https://youtu.be/aqz-KE-bpKQ')$q$)::text, '1');
select test.hata_bekle('gol: javascript: video adresi reddedilir',
  $q$insert into public.goller (mac_id, oyuncu, dakika, video_url) values ('11111111-0000-4000-8000-000000000009', 'X Y', 5, 'javascript:alert(1)')$q$, 'check');
select test.hata_bekle('gol: dakika 0 reddedilir',
  $q$insert into public.goller (mac_id, oyuncu, dakika) values ('11111111-0000-4000-8000-000000000009', 'X Y', 0)$q$, 'check');
select test.esit('yönetici: gol düzenleyebilir',
  test.satir($q$update public.goller set dakika = 13 where id = '22222222-0000-4000-8000-000000000009'$q$)::text, '1');
select test.esit('yönetici: gol silebilir',
  test.satir($q$delete from public.goller where id = '22222222-0000-4000-8000-000000000009'$q$)::text, '1');
select test.esit('yönetici: maç silebilir',
  test.satir($q$delete from public.maclar where id = '11111111-0000-4000-8000-000000000009'$q$)::text, '1');
select test.esit('yönetici: yorumu gizleyebilir',
  test.satir($q$update public.yorumlar set gizli = true where metin like 'Harika%'$q$)::text, '1');
select test.esit('yönetici: başkasının yorumunu silebilir',
  test.satir($q$delete from public.yorumlar where metin = 'sahte sahip'$q$)::text, '1');
select test.dogru('yönetici: gizli yorumları görür', exists (select 1 from public.yorumlar where gizli));
select test.hata_bekle('yönetici: kendi rolünü değiştiremez',
  $q$update public.profiles set role = 'taraftar' where id = 'aaaaaaaa-0000-4000-8000-000000000001'$q$, 'Rol değiştirme');
select test.esit('yönetici: başka kullanıcıyı yönetici yapabilir',
  test.satir($q$update public.profiles set role = 'admin' where id = 'bbbbbbbb-0000-4000-8000-000000000003'$q$)::text, '1');
select test.esit('yönetici: başka kullanıcının yöneticiliğini alabilir',
  test.satir($q$update public.profiles set role = 'taraftar' where id = 'bbbbbbbb-0000-4000-8000-000000000003'$q$)::text, '1');
select test.esit('yönetici: depoya görsel yükleyebilir',
  test.satir($q$insert into storage.objects (bucket_id, name) values ('haber-gorselleri', 'kapak.png')$q$)::text, '1');
select test.esit('yönetici: haberi silebilir',
  test.satir($q$delete from public.haberler where id = '33333333-0000-4000-8000-000000000009'$q$)::text, '1');
select test.esit('yönetici: haberi geçici olarak yayından kaldırır',
  test.satir($q$update public.haberler set yayinda = false where id = '33333333-0000-4000-8000-000000000001'$q$)::text, '1');
reset role;

-- ---------------------------------------------------------------- gizlilik sonrası görünürlük
select set_config('request.jwt.claim.sub', '', false);
set role anon;
select test.esit('anon: yayından kalkan haberin yorumları görünmez',
  (select count(*) from public.yorumlar where haber_id = '33333333-0000-4000-8000-000000000001')::text, '0');
reset role;
update public.haberler set yayinda = true where id = '33333333-0000-4000-8000-000000000001';
set role anon;
select test.esit('anon: yeniden yayınlanan haberin yorumu görünür',
  (select count(*) from public.yorumlar where haber_id = '33333333-0000-4000-8000-000000000001')::text, '1');
select test.esit('anon: gizlenen yorum görünmez', (select count(*) from public.yorumlar where metin like 'Harika%')::text, '0');
select test.esit('anon: gizli olmayan yorumlar görünür', (select count(*) from public.yorumlar where not gizli)::text, '8');
select test.esit('anon: gizli yorum sayısı 0', (select count(*) from public.yorumlar where gizli)::text, '0');
-- Görsel herkese açık adresten okunur (public kova, RLS'siz); ama kovanın LİSTESİ ziyaretçiye kapalı (taslak haberin kapağı bulunamasın)
select test.esit('anon: haber görselleri kovasını listeleyemez (011)', (select count(*) from storage.objects where bucket_id = 'haber-gorselleri')::text, '0');
select test.dogru('depo: haber-gorselleri kovası herkese açık adresle okunur (public)', (select public from storage.buckets where id = 'haber-gorselleri'));
reset role;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-000000000001', false);
set role authenticated;
select test.esit('sahibi gizlenen kendi yorumunu görür', (select count(*) from public.yorumlar where metin like 'Harika%')::text, '1');
reset role;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-000000000002', false);
set role authenticated;
select test.esit('başka taraftar gizli yorumu göremez', (select count(*) from public.yorumlar where gizli)::text, '0');
select test.esit('taraftar: haber görselleri kovasını listeleyemez (011)', (select count(*) from storage.objects where bucket_id = 'haber-gorselleri')::text, '0');
reset role;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);
set role authenticated;
select test.esit('yönetici: haber görselleri kovasını listeler (kapak silme/değiştirme için)', (select count(*) from storage.objects where bucket_id = 'haber-gorselleri')::text, '1');
reset role;

-- ================================================================ 012: denetim düzeltmeleri, 2. tur
-- Kullanıcılar: dilek (-04) e-postasını ONAYLAMAMIŞ; emre (-05) onaylı (günlük sınır, tekrar, düzenleme testleri)
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
  ('bbbbbbbb-0000-4000-8000-000000000004', 'dilek@ornek.test', '{"kullanici_adi":"dilek"}', null),
  ('bbbbbbbb-0000-4000-8000-000000000005', 'emre@ornek.test', '{"kullanici_adi":"emre"}', now()),
  ('bbbbbbbb-0000-4000-8000-000000000006', 'sinsi1@ornek.test', '{"kullanici_adi":"Yönetim"}', now()),
  ('bbbbbbbb-0000-4000-8000-000000000007', 'sinsi2@ornek.test', '{"kullanici_adi":"CorumFK_Resmi"}', now()),
  ('bbbbbbbb-0000-4000-8000-000000000008', 'sinsi3@ornek.test', '{"kullanici_adi":"MODERATÖR"}', now()),
  ('bbbbbbbb-0000-4000-8000-000000000009', 'sinsi4@ornek.test', '{"kullanici_adi":"kulüp.destek"}', now());
select test.esit('kayıt (012): "Yönetim" (büyük harf, Türkçe harf) ayrılmış: taraftar… adı',
  (select left(kullanici_adi, 8) from public.profiles where id = 'bbbbbbbb-0000-4000-8000-000000000006'), 'taraftar');
select test.esit('kayıt (012): "CorumFK_Resmi" ayrılmış: taraftar… adı',
  (select left(kullanici_adi, 8) from public.profiles where id = 'bbbbbbbb-0000-4000-8000-000000000007'), 'taraftar');
select test.esit('kayıt (012): "MODERATÖR" ayrılmış: taraftar… adı',
  (select left(kullanici_adi, 8) from public.profiles where id = 'bbbbbbbb-0000-4000-8000-000000000008'), 'taraftar');
select test.esit('kayıt (012): "kulüp.destek" ayrılmış: taraftar… adı',
  (select left(kullanici_adi, 8) from public.profiles where id = 'bbbbbbbb-0000-4000-8000-000000000009'), 'taraftar');
select test.esit('kayıt (012): sıradan ad ("emre") olduğu gibi kalır',
  (select kullanici_adi from public.profiles where id = 'bbbbbbbb-0000-4000-8000-000000000005'), 'emre');
select test.dogru('kullanıcı adı (012): ayrılmış adlar büyük/küçük harf ve Türkçe harf fark etmeden yakalanır',
  public.kullanici_adi_ayrilmis('yonetici') and public.kullanici_adi_ayrilmis('YÖNETİCİ') and public.kullanici_adi_ayrilmis('Yönetim_1')
  and public.kullanici_adi_ayrilmis('admin') and public.kullanici_adi_ayrilmis('ADMİN') and public.kullanici_adi_ayrilmis('moderator')
  and public.kullanici_adi_ayrilmis('corumfk') and public.kullanici_adi_ayrilmis('Çorum.FK') and public.kullanici_adi_ayrilmis('ÇORUM_FK_resmi')
  and public.kullanici_adi_ayrilmis('resmi') and public.kullanici_adi_ayrilmis('resmî') and public.kullanici_adi_ayrilmis('kulup')
  and public.kullanici_adi_ayrilmis('Kulüp') and public.kullanici_adi_ayrilmis('destek') and public.kullanici_adi_ayrilmis('DESTEK.2'));
select test.dogru('kullanıcı adı (012): sıradan adlar ayrılmış sayılmaz',
  not (public.kullanici_adi_ayrilmis('ayse_19') or public.kullanici_adi_ayrilmis('emre') or public.kullanici_adi_ayrilmis('kirmizi_simsek')
       or public.kullanici_adi_ayrilmis('destekci_ali') or public.kullanici_adi_ayrilmis('corumlu')));

-- ---------------------------------------------------------------- profiller: role sütunu herkese kapalı (012)
select set_config('request.jwt.claim.sub', '', false);
set role anon;
select test.esit('anon (012): profillerde id, kullanici_adi, created_at okunur',
  (select count(*) from (select id, kullanici_adi, created_at from public.profiles) p)::text, (select count(*) from public.profiles)::text);
select test.hata_bekle('anon (012): role sütununu okuyamaz', $q$select role from public.profiles$q$, 'permission denied');
select test.hata_bekle('anon (012): select * ile de role okunamaz', $q$select * from public.profiles$q$, 'permission denied');
select test.hata_bekle('anon (012): role sütununa göre süzerek yöneticiyi bulamaz', $q$select id from public.profiles where role = 'admin'$q$, 'permission denied');
select test.esit('anon (012): benim_profilim() boş', (select count(*) from public.benim_profilim())::text, '0');
reset role;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-000000000002', false);
set role authenticated;
select test.hata_bekle('taraftar (012): role sütununu okuyamaz', $q$select role from public.profiles$q$, 'permission denied');
select test.esit('taraftar (012): benim_profilim() kendi rolünü verir', (select role from public.benim_profilim()), 'taraftar');
select test.esit('taraftar (012): benim_profilim() yalnız kendi satırı', (select count(*)::text || '|' || min(id::text) from public.benim_profilim()), '1|bbbbbbbb-0000-4000-8000-000000000002');
select test.hata_bekle('taraftar (012): kendini "Yönetim" yapamaz (ayrılmış ad)',
  $q$update public.profiles set kullanici_adi = 'Yönetim' where id = 'bbbbbbbb-0000-4000-8000-000000000002'$q$, 'kullanılamaz');
select test.hata_bekle('taraftar (012): kendini "CorumFK_Resmi" yapamaz',
  $q$update public.profiles set kullanici_adi = 'CorumFK_Resmi' where id = 'bbbbbbbb-0000-4000-8000-000000000002'$q$, 'kullanılamaz');
select test.hata_bekle('taraftar (012): kendini "ADMİN" yapamaz',
  $q$update public.profiles set kullanici_adi = 'ADMİN' where id = 'bbbbbbbb-0000-4000-8000-000000000002'$q$, 'kullanılamaz');
select test.esit('taraftar (012): sıradan bir adla yeniden adlandırabilir',
  test.satir($q$update public.profiles set kullanici_adi = 'burak_cfk' where id = 'bbbbbbbb-0000-4000-8000-000000000002'$q$)::text, '1');
select test.esit('taraftar (012): yorumlarda kullanıcı adı okunabilir (gömme kullanici_adi)',
  (select count(*) from public.yorumlar y join public.profiles p on p.id = y.kullanici_id where p.kullanici_adi is not null)::text,
  (select count(*) from public.yorumlar)::text);
reset role;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);
set role authenticated;
select test.esit('yönetici (012): benim_profilim() rolü admin', (select role from public.benim_profilim()), 'admin');
select test.hata_bekle('yönetici (012): o da role sütununu doğrudan okuyamaz (yalnız benim_profilim / is_admin)', $q$select role from public.profiles$q$, 'permission denied');
select test.esit('yönetici (012): başka kullanıcıyı yine yönetici yapabilir (rolü yazmak serbest, okumak değil)',
  test.satir($q$update public.profiles set role = 'admin' where id = 'bbbbbbbb-0000-4000-8000-000000000005'$q$)::text, '1');
select test.esit('yönetici (012): ve geri alabilir',
  test.satir($q$update public.profiles set role = 'taraftar' where id = 'bbbbbbbb-0000-4000-8000-000000000005'$q$)::text, '1');
reset role;
select test.dogru('benim_profilim() ve eposta_onayli(): SECURITY DEFINER, search_path sabit',
  (select bool_and(prosecdef and proconfig is not null) from pg_proc where oid in ('public.benim_profilim()'::regprocedure, 'public.eposta_onayli()'::regprocedure)));

-- ---------------------------------------------------------------- yorum: e-posta onayı zorunlu (012)
select test.dogru('yorum_ekleme politikası (012) e-posta onayını şart koşuyor',
  (select with_check ~ 'eposta_onayli' from pg_policies where schemaname = 'public' and tablename = 'yorumlar' and policyname = 'yorum_ekleme'));
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-000000000004', false);
set role authenticated;
select test.dogru('onaysız hesap (012): eposta_onayli() false', not public.eposta_onayli());
select test.hata_bekle('onaysız hesap (012): yorum yazamaz, Türkçe mesaj',
  $q$insert into public.yorumlar (mac_id, metin) values ('11111111-0000-4000-8000-000000000003', 'onaysız yorum')$q$, 'e-posta adresinizi onaylayın');
reset role;
update auth.users set email_confirmed_at = now() where id = 'bbbbbbbb-0000-4000-8000-000000000004';
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-000000000004', false);
set role authenticated;
select test.esit('onaylanan hesap (012): yorum yazabilir',
  test.satir($q$insert into public.yorumlar (mac_id, metin) values ('11111111-0000-4000-8000-000000000003', 'onaydan sonra yorum')$q$)::text, '1');
reset role;

-- ---------------------------------------------------------------- yorum: aynı metin 10 dk, günde 50 (012)
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-000000000005', false);
set role authenticated;
select test.esit('emre (012): ilk yorum',
  test.satir($q$insert into public.yorumlar (mac_id, metin) values ('11111111-0000-4000-8000-000000000003', 'Haydi Çorum, bu maç bizim!')$q$)::text, '1');
select test.hata_bekle('yorum (012): aynı metin 10 dakika içinde tekrar gönderilemez (başka hedefe de)',
  $q$insert into public.yorumlar (haber_id, metin) values ('33333333-0000-4000-8000-000000000002', 'Haydi Çorum, bu maç bizim!')$q$, 'Aynı metni 10 dakika');
select test.hata_bekle('yorum (012): boşluk/büyük harf farkı tekrarı gizlemez',
  $q$insert into public.yorumlar (mac_id, metin) values ('11111111-0000-4000-8000-000000000003', '  haydi Çorum,   BU maç bizim!  ')$q$, 'Aynı metni 10 dakika');
reset role;
update public.yorumlar set created_at = now() - interval '11 minutes' where kullanici_id = 'bbbbbbbb-0000-4000-8000-000000000005';
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-000000000005', false);
set role authenticated;
select test.esit('yorum (012): 10 dakika sonra aynı metin yazılabilir',
  test.satir($q$insert into public.yorumlar (mac_id, metin) values ('11111111-0000-4000-8000-000000000003', 'Haydi Çorum, bu maç bizim!')$q$)::text, '1');
reset role;
-- son 24 saatte 48 yorum daha (eski tarihli, SQL Editor'den) = 50
insert into public.yorumlar (kullanici_id, mac_id, metin, created_at)
  select 'bbbbbbbb-0000-4000-8000-000000000005', '11111111-0000-4000-8000-000000000003', 'eski yorum ' || i, now() - interval '20 hours' + i * interval '1 minute'
  from generate_series(1, 48) i;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-000000000005', false);
set role authenticated;
select test.hata_bekle('yorum (012): son 24 saatte 50 yorumdan sonra 51. reddedilir',
  $q$insert into public.yorumlar (mac_id, metin) values ('11111111-0000-4000-8000-000000000003', 'elli birinci')$q$, 'günde en fazla 50');
reset role;
update public.yorumlar set created_at = now() - interval '25 hours' where kullanici_id = 'bbbbbbbb-0000-4000-8000-000000000005' and metin like 'eski yorum %';
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-000000000005', false);
set role authenticated;
select test.esit('yorum (012): 24 saat dolunca yeniden yazılabilir',
  test.satir($q$insert into public.yorumlar (mac_id, metin) values ('11111111-0000-4000-8000-000000000003', 'ertesi gün')$q$)::text, '1');

-- ---------------------------------------------------------------- yorum: düzenleme sınırı (012)
select test.esit('düzenleme (012): yeni yorum düzenlenebilir',
  test.satir($q$update public.yorumlar set metin = 'ertesi gün (1)' where metin = 'ertesi gün'$q$)::text, '1');
select test.satir($q$update public.yorumlar set metin = 'ertesi gün (2)' where metin like 'ertesi gün (%'$q$);
select test.satir($q$update public.yorumlar set metin = 'ertesi gün (3)' where metin like 'ertesi gün (%'$q$);
select test.satir($q$update public.yorumlar set metin = 'ertesi gün (4)' where metin like 'ertesi gün (%'$q$);
select test.satir($q$update public.yorumlar set metin = 'ertesi gün (5)' where metin like 'ertesi gün (%'$q$);
select test.satir($q$update public.yorumlar set metin = 'ertesi gün (6)' where metin like 'ertesi gün (%'$q$);
select test.satir($q$update public.yorumlar set metin = 'ertesi gün (7)' where metin like 'ertesi gün (%'$q$);
select test.satir($q$update public.yorumlar set metin = 'ertesi gün (8)' where metin like 'ertesi gün (%'$q$);
select test.satir($q$update public.yorumlar set metin = 'ertesi gün (9)' where metin like 'ertesi gün (%'$q$);
select test.esit('düzenleme (012): dakikada 10 düzenleme kabul edilir',
  test.satir($q$update public.yorumlar set metin = 'ertesi gün (10)' where metin like 'ertesi gün (%'$q$)::text, '1');
select test.hata_bekle('düzenleme (012): dakikada 11. düzenleme reddedilir',
  $q$update public.yorumlar set metin = 'ertesi gün (11)' where metin like 'ertesi gün (%'$q$, 'dakikada en fazla 10');
select test.esit('düzenleme (012): metni değişmeyen güncelleme sayılmaz/engellenmez',
  test.satir($q$update public.yorumlar set metin = metin where metin = 'ertesi gün (10)'$q$)::text, '1');
select test.hata_bekle('düzenleme (012): düzenleme kayıtları kullanıcıya kapalı', $q$select count(*) from public.yorum_duzenlemeleri$q$, 'permission denied');
reset role;
update public.yorumlar set created_at = now() - interval '31 minutes' where metin = 'ertesi gün (10)';
delete from public.yorum_duzenlemeleri; -- dakika sınırı sıfırlansın: yalnız 30 dk kuralı denensin
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-000000000005', false);
set role authenticated;
select test.hata_bekle('düzenleme (012): yazıldıktan 30 dakika sonra düzenlenemez',
  $q$update public.yorumlar set metin = 'çok geç düzeltme' where metin = 'ertesi gün (10)'$q$, '30 dakika');
select test.esit('düzenleme (012): eski yorumunu yine silebilir',
  test.satir($q$delete from public.yorumlar where metin = 'ertesi gün (10)'$q$)::text, '1');
reset role;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);
set role authenticated;
select test.esit('yönetici (012): eski yorumu düzenleme ve sınırlardan muaf',
  test.satir($q$update public.yorumlar set metin = 'yönetici düzeltmesi' where metin = 'eski yorum 1'$q$)::text, '1');
reset role;

-- ---------------------------------------------------------------- haber kapağı yalnız proje deposundan (012)
select test.esit('kapak (012): seed haberlerinin kapakları kurala uyuyor',
  (select count(*) from public.haberler where not public.haber_kapak_gecerli(kapak_url))::text, '0');
select test.dogru('kapak (012): kural doğrulanmış (VALID) kısıt',
  (select convalidated from pg_constraint where conname = 'haberler_kapak_kaynagi'));
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);
set role authenticated;
select test.hata_bekle('kapak (012): başka sitedeki görsel reddedilir',
  $q$insert into public.haberler (baslik, kapak_url) values ('Dış kapaklı haber', 'https://baska-site.com/kapak.jpg')$q$, 'haberler_kapak_kaynagi');
select test.hata_bekle('kapak (012): reklam kovasındaki görsel haber kapağı olamaz',
  $q$insert into public.haberler (baslik, kapak_url) values ('Yanlış kova', 'https://abcd.supabase.co/storage/v1/object/public/reklam-gorselleri/x.png')$q$, 'haberler_kapak_kaynagi');
select test.hata_bekle('kapak (012): ".." ile kovadan çıkılamaz',
  $q$insert into public.haberler (baslik, kapak_url) values ('Kaçak', 'https://abcd.supabase.co/storage/v1/object/public/haber-gorselleri/../reklam-gorselleri/x.png')$q$, 'haberler_kapak_kaynagi');
select test.hata_bekle('kapak (012): http (https değil) reddedilir',
  $q$insert into public.haberler (baslik, kapak_url) values ('Http', 'http://abcd.supabase.co/storage/v1/object/public/haber-gorselleri/x.png')$q$, 'check');
select test.hata_bekle('kapak (012): assets/ dışında site içi yol reddedilir',
  $q$insert into public.haberler (baslik, kapak_url) values ('Yol', 'assets/vendor/x.svg')$q$, 'haberler_kapak_kaynagi');
select test.esit('kapak (012): proje deposundaki kapak kabul edilir',
  test.satir($q$insert into public.haberler (baslik, kapak_url) values ('Depo kapaklı', 'https://abcd.supabase.co/storage/v1/object/public/haber-gorselleri/2f1c9a0e-1b2c-4d5e-8f90-123456789abc.webp')$q$)::text, '1');
select test.esit('kapak (012): sitenin örnek görseli (assets/img/) kabul edilir',
  test.satir($q$insert into public.haberler (baslik, kapak_url) values ('Örnek kapaklı', 'assets/img/ornek-kapak-2.svg')$q$)::text, '1');
select test.esit('kapak (012): kapaksız haber kabul edilir',
  test.satir($q$insert into public.haberler (baslik) values ('Kapaksız')$q$)::text, '1');
select test.hata_bekle('kapak (012): güncellemede de denetlenir',
  $q$update public.haberler set kapak_url = 'https://i.imgur.com/x.png' where baslik = 'Kapaksız'$q$, 'haberler_kapak_kaynagi');
delete from public.haberler where baslik in ('Depo kapaklı', 'Örnek kapaklı', 'Kapaksız');
reset role;
select test.dogru('yetki (012): yeni tablolarda RLS açık, anon/authenticated yazamaz',
  (select bool_and(relrowsecurity) from pg_class where oid in ('public.yorum_duzenlemeleri'::regclass, 'public.reklam_sinir_dakikalari'::regclass))
  and not has_table_privilege('authenticated', 'public.yorum_duzenlemeleri', 'INSERT')
  and not has_table_privilege('anon', 'public.reklam_sinir_dakikalari', 'INSERT'));

-- ---------------------------------------------------------------- hesap silme
select set_config('request.jwt.claim.sub', '', false);
delete from auth.users where id = 'bbbbbbbb-0000-4000-8000-000000000003';
-- TRUNCATE RLS'e takılmaz: Supabase'in varsayılan geniş yetkilerinden kaldırılmış olmalı (011; reklam tabloları 010)
select test.dogru('yetki: anon/authenticated hiçbir public tabloyu TRUNCATE edemez',
  not exists (select 1 from pg_tables t, (values ('anon'), ('authenticated')) r(rol)
              where t.schemaname = 'public' and has_table_privilege(r.rol, format('%I.%I', t.schemaname, t.tablename), 'TRUNCATE')));
select test.esit('hesap silinince profil gider', (select count(*) from public.profiles where id = 'bbbbbbbb-0000-4000-8000-000000000003')::text, '0');
select test.esit('hesap silinince yorumları gider', (select count(*) from public.yorumlar where kullanici_id = 'bbbbbbbb-0000-4000-8000-000000000003')::text, '0');

-- ================================================================ 013: tasarım (manşet, Takım, gol yorumu, şikâyet, yasak)
select set_config('request.jwt.claim.sub', '', false);
select test.esit('seed (013): bir manşet haberi', (select count(*) from public.haberler where manset)::text, '1');
select test.esit('seed (013): 8 oyuncu, 3 sakatlık (1 taslak)', (select count(*) from public.oyuncular)::text || '/' || (select count(*) from public.sakatliklar)::text, '8/3');
select test.dogru('RLS (013): yeni tablolarda RLS açık',
  (select bool_and(relrowsecurity) from pg_class where oid in ('public.oyuncular'::regclass, 'public.sakatliklar'::regclass, 'public.yorum_sikayetleri'::regclass)));
select test.dogru('engelli_mi(), engelli_kullanicilar(): SECURITY DEFINER, search_path sabit',
  (select bool_and(prosecdef and proconfig is not null) from pg_proc where oid in ('public.engelli_mi()'::regprocedure, 'public.engelli_kullanicilar()'::regprocedure)));
set role anon;
select test.esit('anon (013): kadroyu görür', (select count(*) from public.oyuncular)::text, '8');
select test.esit('anon (013): yalnız yayındaki sakatlıkları görür', (select count(*) from public.sakatliklar)::text, '2');
select test.esit('anon (013): her sakatlığın kaynağı var', (select count(*) from public.sakatliklar where btrim(kaynak) = '')::text, '0');
select test.hata_bekle('anon (013): oyuncu ekleyemez', $q$insert into public.oyuncular (ad, mevki) values ('Sahte', 'forvet')$q$, 'row-level security');
select test.esit('anon (013): sakatlık değiştiremez (0 satır)', test.satir($q$update public.sakatliklar set yayinda = true$q$)::text, '0');
select test.esit('anon (013): şikâyetleri göremez', (select count(*) from public.yorum_sikayetleri)::text, '0');
select test.hata_bekle('anon (013): şikâyet edemez',
  $q$insert into public.yorum_sikayetleri (yorum_id) select id from public.yorumlar limit 1$q$);
select test.esit('anon (013): engelli sütunu okunamaz', (select count(*) from information_schema.column_privileges
  where table_schema = 'public' and table_name = 'profiles' and column_name = 'engelli' and grantee = 'anon' and privilege_type = 'SELECT')::text, '0');
select test.dogru('anon (013): engelli_mi() false', not public.engelli_mi());
select test.hata_bekle('anon (013): engelli listesi yalnız yönetici', $q$select * from public.engelli_kullanicilar()$q$, 'permission denied|yalnızca yöneticiler');
reset role;

-- taraftar burak: gol yorumu, tek hedef, şikâyet
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-000000000002', false);
set role authenticated;
select test.esit('taraftar (013): gole yorum yazabilir',
  test.satir($q$insert into public.yorumlar (gol_id, metin) values ('22222222-0000-4000-8000-000000000001', 'Ne gol ama!')$q$)::text, '1');
select test.hata_bekle('taraftar (013): yorum hem gole hem habere olamaz (tek hedef)',
  $q$insert into public.yorumlar (gol_id, haber_id, metin) values ('22222222-0000-4000-8000-000000000001', '33333333-0000-4000-8000-000000000001', 'iki')$q$, 'yorum_tek_hedef');
select test.hata_bekle('taraftar (013): yorumun golünü değiştiremez',
  $q$update public.yorumlar set gol_id = '22222222-0000-4000-8000-000000000003' where metin = 'Ne gol ama!'$q$, 'sadece metni');
select test.hata_bekle('taraftar (013): kadroyu değiştiremez',
  $q$insert into public.sakatliklar (oyuncu_id, durum, kaynak) values ('55555555-0000-4000-8000-000000000001', 'sakat', 'söylenti')$q$, 'row-level security');
select test.hata_bekle('taraftar (013): kendi yorumunu şikâyet edemez',
  $q$insert into public.yorum_sikayetleri (yorum_id) select id from public.yorumlar where metin = 'Ne gol ama!'$q$, 'Kendi yorumunu');
reset role;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);
set role authenticated;
select test.esit('yönetici (013): bir yorum yazdı (şikâyet edilecek)',
  test.satir($q$insert into public.yorumlar (gol_id, metin) values ('22222222-0000-4000-8000-000000000001', 'Yöneticiden not')$q$)::text, '1');
reset role;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-000000000002', false);
set role authenticated;
select test.esit('taraftar (013): başkasının yorumunu şikâyet eder',
  test.satir($q$insert into public.yorum_sikayetleri (yorum_id, neden, sikayet_eden) select id, 'hakaret', 'aaaaaaaa-0000-4000-8000-000000000001' from public.yorumlar where metin = 'Yöneticiden not'$q$)::text, '1');
select test.hata_bekle('taraftar (013): aynı yorumu ikinci kez şikâyet edemez',
  $q$insert into public.yorum_sikayetleri (yorum_id) select id from public.yorumlar where metin = 'Yöneticiden not'$q$, 'yorum_sikayeti_tek');
select test.esit('taraftar (013): şikâyetleri (kendi şikâyetini de) okuyamaz', (select count(*) from public.yorum_sikayetleri)::text, '0');
select test.hata_bekle('taraftar (013): kendini engelleyemez/kaldıramaz',
  $q$update public.profiles set engelli = true where id = 'bbbbbbbb-0000-4000-8000-000000000002'$q$, 'yalnız yönetici');
select test.hata_bekle('taraftar (013): ayrılmış ad "Baskan_Savas" reddedilir',
  $q$update public.profiles set kullanici_adi = 'Baskan_Savas' where id = 'bbbbbbbb-0000-4000-8000-000000000002'$q$, 'kullanılamaz');
reset role;
select test.esit('şikâyet (013): şikâyet eden sunucuda oturumdaki kişi (gönderilen yok sayılır)',
  (select sikayet_eden::text from public.yorum_sikayetleri), 'bbbbbbbb-0000-4000-8000-000000000002');

-- yönetici: şikâyetleri okur, kullanıcıyı engeller; engellenen yorum yazamaz
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);
set role authenticated;
select test.esit('yönetici (013): şikâyetleri okur', (select count(*) from public.yorum_sikayetleri)::text, '1');
select test.esit('yönetici (013): taslak sakatlığı da görür', (select count(*) from public.sakatliklar)::text, '3');
select test.esit('yönetici (013): sakatlık ekler (kaynakla)',
  test.satir($q$insert into public.sakatliklar (oyuncu_id, durum, aciklama, kaynak, kaynak_url, yayinda) values ('55555555-0000-4000-8000-000000000005', 'dondu', 'Takımla çalıştı.', 'Kulüp açıklaması', 'https://corumfk.com.tr/haber', true)$q$)::text, '1');
select test.hata_bekle('yönetici (013): kaynaksız sakatlık reddedilir',
  $q$insert into public.sakatliklar (oyuncu_id, durum) values ('55555555-0000-4000-8000-000000000005', 'sakat')$q$, 'kaynak');
select test.hata_bekle('yönetici (013): kaynak bağlantısı https olmalı',
  $q$insert into public.sakatliklar (oyuncu_id, durum, kaynak, kaynak_url) values ('55555555-0000-4000-8000-000000000005', 'sakat', 'Kulüp', 'http://ornek.com')$q$, 'check');
select test.hata_bekle('yönetici (013): açıklama en çok 200 karakter',
  $q$insert into public.sakatliklar (oyuncu_id, durum, kaynak, aciklama) values ('55555555-0000-4000-8000-000000000005', 'sakat', 'Kulüp', repeat('x', 201))$q$, 'check');
select test.hata_bekle('yönetici (013): oyuncu fotoğrafı başka siteden olamaz',
  $q$insert into public.oyuncular (ad, mevki, foto_url) values ('Dış Foto', 'forvet', 'https://baska-site.com/a.jpg')$q$, 'oyuncular_foto_kaynagi');
select test.hata_bekle('yönetici (013): gol kapağı başka siteden olamaz',
  $q$update public.goller set kapak_url = 'https://i.ytimg.com/vi/x/hqdefault.jpg' where id = '22222222-0000-4000-8000-000000000002'$q$, 'goller_kapak_kaynagi');
select test.esit('yönetici (013): haberi manşet yapar',
  test.satir($q$update public.haberler set manset = true where id = '33333333-0000-4000-8000-000000000001'$q$)::text, '1');
select test.esit('yönetici (013): taraftarı yorumdan men eder',
  test.satir($q$update public.profiles set engelli = true where id = 'bbbbbbbb-0000-4000-8000-000000000002'$q$)::text, '1');
select test.esit('yönetici (013): engelli listesi', (select string_agg(x::text, ',') from public.engelli_kullanicilar() x), 'bbbbbbbb-0000-4000-8000-000000000002');
reset role;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-000000000002', false);
set role authenticated;
select test.dogru('engellenen (013): engelli_mi() true', public.engelli_mi());
select test.hata_bekle('engellenen (013): yorum yazamaz (Türkçe mesaj)',
  $q$insert into public.yorumlar (gol_id, metin) values ('22222222-0000-4000-8000-000000000001', 'tekrar yazıyorum')$q$, 'yorum yazmaya kapatıldı');
select test.hata_bekle('engellenen (013): kendi yasağını kaldıramaz',
  $q$update public.profiles set engelli = false where id = 'bbbbbbbb-0000-4000-8000-000000000002'$q$, 'yalnız yönetici');
reset role;
update public.profiles set engelli = false where id = 'bbbbbbbb-0000-4000-8000-000000000002';
update public.haberler set manset = false where id = '33333333-0000-4000-8000-000000000001';
