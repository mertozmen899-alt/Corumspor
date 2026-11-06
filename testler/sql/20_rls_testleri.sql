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
  test.satir($q$insert into public.goller (id, mac_id, oyuncu, dakika, video_url, video_kaynak) values ('22222222-0000-4000-8000-000000000009', '11111111-0000-4000-8000-000000000009', 'Test Golcü', 12, 'https://youtu.be/aqz-KE-bpKQ', 'Kulübün resmî YouTube kanalı')$q$)::text, '1');
select test.hata_bekle('gol: javascript: video adresi reddedilir',
  $q$insert into public.goller (mac_id, oyuncu, dakika, video_url, video_kaynak) values ('11111111-0000-4000-8000-000000000009', 'X Y', 5, 'javascript:alert(1)', 'Kaynak')$q$, 'check');
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
  not (public.kullanici_adi_ayrilmis('ayse_19') or public.kullanici_adi_ayrilmis('emre') or public.kullanici_adi_ayrilmis('tribun_editor')
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
  test.satir($q$update public.profiles set kullanici_adi = 'burak_19' where id = 'bbbbbbbb-0000-4000-8000-000000000002'$q$)::text, '1');
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
  $q$insert into public.sakatliklar (oyuncu_id, durum, kaynak, aciklama) values ('55555555-0000-4000-8000-000000000005', 'cezali', 'Kulüp', repeat('x', 201))$q$, 'check');
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

-- ================================================================ 014: 2. tur inceleme (sunucu)
select set_config('request.jwt.claim.sub', '', false);
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
  ('bbbbbbbb-0000-4000-8000-0000000000c1', 'deniz@ornek.test', '{"kullanici_adi":"deniz"}', now()),
  ('bbbbbbbb-0000-4000-8000-0000000000c2', 'ece@ornek.test', '{"kullanici_adi":"ece"}', now()),
  ('bbbbbbbb-0000-4000-8000-0000000000c3', 'fatma@ornek.test', '{"kullanici_adi":"fatma"}', now()),
  ('bbbbbbbb-0000-4000-8000-0000000000c4', 'gul@ornek.test', '{"kullanici_adi":"Adm1n"}', now());
-- 015: kendiliğinden gizlemede yalnız en az 24 saatlik hesapların şikâyeti sayılır; bu testteki hesaplar 2 gün önce açılmış gibi
update public.profiles set created_at = now() - interval '2 days'
  where id in ('bbbbbbbb-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-0000000000c1',
               'bbbbbbbb-0000-4000-8000-0000000000c2', 'bbbbbbbb-0000-4000-8000-0000000000c3');
select test.dogru('kayıt (014): rakamlı benzer ad "Adm1n" kullanılmaz, taraftar… adı verilir',
  (select kullanici_adi ~ '^taraftar[0-9a-f]{6}' from public.profiles where id = 'bbbbbbbb-0000-4000-8000-0000000000c4'));
select test.dogru('ayrılmış ad (014): rakam/simge benzerleri ve "kirmizisimsek" ayrılmış',
  public.kullanici_adi_ayrilmis('Y0netici') and public.kullanici_adi_ayrilmis('Adm1n') and public.kullanici_adi_ayrilmis('C0rumFK_Resml')
  and public.kullanici_adi_ayrilmis('Bask4n_Resm1') and public.kullanici_adi_ayrilmis('kirmizi_simsek') and public.kullanici_adi_ayrilmis('KIRMIZI.SIMSEK_19')
  and public.kullanici_adi_ayrilmis('m0d') and public.kullanici_adi_ayrilmis('r00t') and public.kullanici_adi_ayrilmis('ku1up') and public.kullanici_adi_ayrilmis('5istem'));
select test.dogru('ayrılmış ad (014): sıradan adlar yine serbest',
  not (public.kullanici_adi_ayrilmis('ayse_19') or public.kullanici_adi_ayrilmis('tribun_editor') or public.kullanici_adi_ayrilmis('kral_10')
       or public.kullanici_adi_ayrilmis('taraftar1a2b3c') or public.kullanici_adi_ayrilmis('baskentli') or public.kullanici_adi_ayrilmis('Çorumlu_Mert')));

-- yasaklı hesap: yorumunu düzenleyemez, şikâyet edemez (denetçi 3)
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);
set role authenticated;
select test.esit('yönetici (014): burak yorumdan men edildi', test.satir($q$update public.profiles set engelli = true where id = 'bbbbbbbb-0000-4000-8000-000000000002'$q$)::text, '1');
reset role;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-000000000002', false);
set role authenticated;
select test.hata_bekle('engellenen (014): kendi yorumunu düzenleyemez',
  $q$update public.yorumlar set metin = 'hakaret eklenmiş metin' where metin = 'Ne gol ama!'$q$, 'düzenleyemezsin');
select test.hata_bekle('engellenen (014): şikâyet edemez',
  $q$insert into public.yorum_sikayetleri (yorum_id) select id from public.yorumlar where metin = 'Tribünler muhteşemdi.' or haber_id is not null limit 1$q$, 'şikâyet gönderemezsin|row-level security');
select test.esit('engellenen (014): kendi yorumunu silebilir',
  test.satir($q$delete from public.yorumlar where metin = 'Ne gol ama!'$q$)::text, '1');
reset role;
update public.profiles set engelli = false where id = 'bbbbbbbb-0000-4000-8000-000000000002';

-- moderasyon: farklı 3 hesaptan şikâyet → kendiliğinden gizlenir (başkan 4)
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-0000000000c1', false);
set role authenticated;
select test.esit('moderasyon (014): deniz habere yorum yazar',
  test.satir($q$insert into public.yorumlar (haber_id, metin) values ('33333333-0000-4000-8000-000000000001', 'Tartışmalı bir yorum')$q$)::text, '1');
reset role;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-000000000002', false);
set role authenticated;
select test.esit('moderasyon (014): 1. şikâyet', test.satir($q$insert into public.yorum_sikayetleri (yorum_id, neden) select id, 'hakaret' from public.yorumlar where metin = 'Tartışmalı bir yorum'$q$)::text, '1');
reset role;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-000000000001', false);
set role authenticated;
select test.esit('moderasyon (014): 2. şikâyet', test.satir($q$insert into public.yorum_sikayetleri (yorum_id, neden) select id, 'spam' from public.yorumlar where metin = 'Tartışmalı bir yorum'$q$)::text, '1');
reset role;
select test.esit('moderasyon (014): 2 şikâyette yorum hâlâ görünür', (select gizli::text from public.yorumlar where metin = 'Tartışmalı bir yorum'), 'false');
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-0000000000c2', false);
set role authenticated;
select test.esit('moderasyon (014): 3. şikâyet (farklı hesap)', test.satir($q$insert into public.yorum_sikayetleri (yorum_id, neden) select id, 'hakaret' from public.yorumlar where metin = 'Tartışmalı bir yorum'$q$)::text, '1');
select test.esit('moderasyon (014): 3 farklı hesaptan şikâyet alan yorum başkasına görünmez', (select count(*) from public.yorumlar where metin = 'Tartışmalı bir yorum')::text, '0');
reset role;
select test.esit('moderasyon (014): kendiliğinden gizlendi, nedeni "sikayet"',
  (select gizli::text || ':' || gizleme_nedeni from public.yorumlar where metin = 'Tartışmalı bir yorum'), 'true:sikayet');
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-0000000000c1', false);
set role authenticated;
select test.esit('moderasyon (014): yazan kendi gizlenen yorumunu görür', (select count(*) from public.yorumlar where metin = 'Tartışmalı bir yorum')::text, '1');
select test.hata_bekle('moderasyon (014): yazan gizlemeyi kaldıramaz', $q$update public.yorumlar set gizli = false where metin = 'Tartışmalı bir yorum'$q$, 'sadece metni');
reset role;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);
set role authenticated;
select test.esit('moderasyon (014): yönetici geri açar', test.satir($q$update public.yorumlar set gizli = false where metin = 'Tartışmalı bir yorum'$q$)::text, '1');
reset role;
select test.dogru('moderasyon (014): geri açınca moderasyon zamanı yazılır, neden boşalır',
  (select not gizli and gizleme_nedeni is null and moderasyon_zamani is not null from public.yorumlar where metin = 'Tartışmalı bir yorum'));
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-0000000000c3', false);
set role authenticated;
select test.esit('moderasyon (014): yönetici kararından sonra tek yeni şikâyet gizlemez',
  test.satir($q$insert into public.yorum_sikayetleri (yorum_id) select id from public.yorumlar where metin = 'Tartışmalı bir yorum'$q$)::text, '1');
select test.esit('moderasyon (014): yönetici kararından sonra tek yeni şikâyet gizlemez (sonuç)', (select count(*) from public.yorumlar where metin = 'Tartışmalı bir yorum')::text, '1');
reset role;

-- moderasyon: kelime listesi → onay bekler
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);
set role authenticated;
select test.esit('kelime listesi (014): yönetici kelime ekler', test.satir($q$insert into public.yorum_kelimeleri (kelime) values ('SALAK')$q$)::text, '1');
select test.esit('kelime listesi (014): kelime katlanmış saklanır', (select string_agg(kelime, ',') from public.yorum_kelimeleri), 'salak');
select test.hata_bekle('kelime listesi (014): 3 harften kısa kelime eklenemez', $q$insert into public.yorum_kelimeleri (kelime) values ('am')$q$, 'check');
reset role;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-0000000000c2', false);
set role authenticated;
select test.esit('kelime listesi (014): taraftar listeyi okuyamaz', (select count(*) from public.yorum_kelimeleri)::text, '0');
select test.hata_bekle('kelime listesi (014): taraftar kelime ekleyemez', $q$insert into public.yorum_kelimeleri (kelime) values ('masum')$q$, 'row-level security');
select test.hata_bekle('kelime listesi (014): taraftar onay fonksiyonunu çağıramaz (liste sorgulanamaz)',
  $q$select public.yorum_onay_gerekli('salak', null, null)$q$, 'permission denied');
select test.esit('kelime listesi (014): listedeki kelimeyle başlayan sözcük (rakam benzeriyle) onay bekler', test.satir($q$insert into public.yorumlar (mac_id, metin) values ('11111111-0000-4000-8000-000000000001', 'Bu ne SAL4KÇA pozisyon')$q$)::text, '1');
select test.esit('kelime listesi (014): listedeki kelimeyle başlayan sözcük (rakam benzeriyle) onay bekler (sonuç)', (select onay_bekliyor::text from public.yorumlar where metin = 'Bu ne SAL4KÇA pozisyon'), 'true');
select test.esit('kelime listesi (014): temiz yorum hemen yayında', test.satir($q$insert into public.yorumlar (mac_id, metin) values ('11111111-0000-4000-8000-000000000001', 'Harika bir galibiyet')$q$)::text, '1');
select test.esit('kelime listesi (014): temiz yorum hemen yayında (sonuç)', (select onay_bekliyor::text from public.yorumlar where metin = 'Harika bir galibiyet'), 'false');
select test.hata_bekle('moderasyon (014): taraftar kendi yorumunu onaylayamaz', $q$update public.yorumlar set onay_bekliyor = false where metin = 'Bu ne SAL4KÇA pozisyon'$q$, 'sadece metni');
select test.esit('moderasyon (014): düzenlemede listedeki kelime eklenirse onay bekler', test.satir($q$update public.yorumlar set metin = 'Harika bir galibiyet, rakip salaktı' where metin = 'Harika bir galibiyet'$q$)::text, '1');
select test.esit('moderasyon (014): düzenlemede listedeki kelime eklenirse onay bekler (sonuç)', (select onay_bekliyor::text from public.yorumlar where metin like 'Harika bir galibiyet,%'), 'true');
reset role;
select set_config('request.jwt.claim.sub', '', false);
set role anon;
select test.esit('moderasyon (014): onay bekleyen yorum ziyaretçiye görünmez',
  (select count(*) from public.yorumlar where metin in ('Bu ne SAL4KÇA pozisyon', 'Harika bir galibiyet, rakip salaktı'))::text, '0');
reset role;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);
set role authenticated;
select test.esit('moderasyon (014): yönetici onay kuyruğunu görür ve onaylar',
  (select count(*) from public.yorumlar where onay_bekliyor)::text || ':' ||
  test.satir($q$update public.yorumlar set onay_bekliyor = false where metin = 'Bu ne SAL4KÇA pozisyon'$q$)::text, '2:1');
select test.esit('moderasyon (014): yönetici yorumu da kelimeye takılmaz', test.satir($q$insert into public.yorumlar (mac_id, metin) values ('11111111-0000-4000-8000-000000000001', 'Yönetici: salak sözü yasak')$q$)::text, '1');
select test.esit('moderasyon (014): yönetici yorumu da kelimeye takılmaz (sonuç)', (select onay_bekliyor::text from public.yorumlar where metin = 'Yönetici: salak sözü yasak'), 'false');
reset role;
select set_config('request.jwt.claim.sub', '', false);
set role anon;
select test.esit('moderasyon (014): onaylanan yorum herkese görünür', (select count(*) from public.yorumlar where metin = 'Bu ne SAL4KÇA pozisyon')::text, '1');
reset role;

-- moderasyon: maç başına ön onay penceresi (maçtan 2 saat önce → 24 saat sonra)
insert into public.maclar (id, rakip, tarih, on_onay) values ('11111111-0000-4000-8000-0000000000aa', 'Ön Onay FK', now() + interval '1 hour', true);
insert into public.goller (id, mac_id, oyuncu, dakika) values ('22222222-0000-4000-8000-0000000000aa', '11111111-0000-4000-8000-0000000000aa', 'Ali Örnek', 10);
insert into public.maclar (id, rakip, tarih, on_onay) values ('11111111-0000-4000-8000-0000000000ab', 'Uzak Maç FK', now() + interval '3 day', true);
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-0000000000c3', false);
set role authenticated;
select test.esit('ön onay (014): pencere içindeki maça yorum onay bekler', test.satir($q$insert into public.yorumlar (mac_id, metin) values ('11111111-0000-4000-8000-0000000000aa', 'Haydi Çorum!')$q$)::text, '1');
select test.esit('ön onay (014): pencere içindeki maça yorum onay bekler (sonuç)', (select onay_bekliyor::text from public.yorumlar where metin = 'Haydi Çorum!'), 'true');
select test.esit('ön onay (014): o maçın golüne yorum da onay bekler', test.satir($q$insert into public.yorumlar (gol_id, metin) values ('22222222-0000-4000-8000-0000000000aa', 'Gol gol gol!')$q$)::text, '1');
select test.esit('ön onay (014): o maçın golüne yorum da onay bekler (sonuç)', (select onay_bekliyor::text from public.yorumlar where metin = 'Gol gol gol!'), 'true');
select test.esit('ön onay (014): pencere dışındaki maça yorum hemen yayında', test.satir($q$insert into public.yorumlar (mac_id, metin) values ('11111111-0000-4000-8000-0000000000ab', 'Üç gün kaldı')$q$)::text, '1');
select test.esit('ön onay (014): pencere dışındaki maça yorum hemen yayında (sonuç)', (select onay_bekliyor::text from public.yorumlar where metin = 'Üç gün kaldı'), 'false');
select test.esit('ön onay (014): yazan kendi bekleyen yorumunu görür', (select count(*) from public.yorumlar where metin in ('Haydi Çorum!', 'Gol gol gol!'))::text, '2');
select test.esit('ön onay (014): taraftar maçın ön onay ayarını değiştiremez (0 satır)',
  test.satir($q$update public.maclar set on_onay = false where id = '11111111-0000-4000-8000-0000000000aa'$q$)::text, '0');
reset role;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-0000000000c2', false);
set role authenticated;
select test.esit('ön onay (014): başka taraftar bekleyen yorumu görmez', (select count(*) from public.yorumlar where metin in ('Haydi Çorum!', 'Gol gol gol!'))::text, '0');
select test.esit('ön onay (014): bekleyen yorum şikâyet edilemez (görünmez, 0 satır)',
  test.satir($q$insert into public.yorum_sikayetleri (yorum_id) select id from public.yorumlar where kullanici_id = 'bbbbbbbb-0000-4000-8000-0000000000c3' and onay_bekliyor limit 1$q$)::text, '0');
reset role;
delete from public.maclar where id in ('11111111-0000-4000-8000-0000000000aa', '11111111-0000-4000-8000-0000000000ab');
delete from public.yorum_kelimeleri;

-- yasaklı sektör onayı sunucuda (denetçi 2)
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);
set role authenticated;
select test.hata_bekle('sektör (014): onaysız reklam yayına alınamaz (API ile de)',
  $q$insert into public.reklamlar (firma_adi, gorsel_url, kisa_metin, alan, baslangic, bitis, durum, sektor_onayi) values ('Bahis X', 'https://abcd.supabase.co/storage/v1/object/public/reklam-gorselleri/x.webp', 'Kupon', 'ana_akis', now() - interval '1 day', now() + interval '1 day', 'yayinda', false)$q$, 'yasaklı sektör');
select test.esit('sektör (014): onaylı reklam yayına alınır, onay zamanı sunucuda yazılır', test.satir($q$insert into public.reklamlar (id, firma_adi, gorsel_url, kisa_metin, alan, baslangic, bitis, durum, sektor_onayi, sektor_onay_zamani) values ('77777777-0000-4000-8000-000000000001', 'Kale Oto', 'https://abcd.supabase.co/storage/v1/object/public/reklam-gorselleri/x.webp', 'Ekspertizli araçlar', 'ana_akis', now() - interval '1 day', now() + interval '1 day', 'yayinda', true, '2000-01-01')$q$)::text, '1');
select test.esit('sektör (014): onaylı reklam yayına alınır, onay zamanı sunucuda yazılır (sonuç)', (select (sektor_onay_zamani > now() - interval '1 minute')::text from public.reklamlar where id = '77777777-0000-4000-8000-000000000001'), 'true');
select test.esit('sektör (014): öncelik değişince onay kalır', test.satir($q$update public.reklamlar set oncelik = 5 where id = '77777777-0000-4000-8000-000000000001'$q$)::text, '1');
select test.esit('sektör (014): öncelik değişince onay kalır (sonuç)', (select sektor_onayi::text from public.reklamlar where id = '77777777-0000-4000-8000-000000000001'), 'true');
select test.hata_bekle('sektör (014): yayındaki reklamın bağlantısı değişince yeniden onay istenir',
  $q$update public.reklamlar set baglanti_url = 'https://bahis-ornek.com' where id = '77777777-0000-4000-8000-000000000001'$q$, 'yeniden');
select test.hata_bekle('sektör (014): metin değişince de', $q$update public.reklamlar set kisa_metin = 'Yeni metin' where id = '77777777-0000-4000-8000-000000000001'$q$, 'yasaklı sektör');
select test.hata_bekle('sektör (014): görsel değişince de', $q$update public.reklamlar set gorsel_url = 'https://abcd.supabase.co/storage/v1/object/public/reklam-gorselleri/y.webp' where id = '77777777-0000-4000-8000-000000000001'$q$, 'yasaklı sektör');
select test.hata_bekle('sektör (014): firma değişince de', $q$update public.reklamlar set firma_adi = 'Başka Firma' where id = '77777777-0000-4000-8000-000000000001'$q$, 'yasaklı sektör');
select test.esit('sektör (014): duraklatarak değiştirilirse onay sıfırlanır', test.satir($q$update public.reklamlar set kisa_metin = 'Yeni metin', durum = 'duraklatildi' where id = '77777777-0000-4000-8000-000000000001'$q$)::text, '1');
select test.esit('sektör (014): duraklatarak değiştirilirse onay sıfırlanır (sonuç)', (select sektor_onayi::text || ':' || coalesce(sektor_onay_zamani::text, 'yok') from public.reklamlar where id = '77777777-0000-4000-8000-000000000001'), 'false:yok');
select test.hata_bekle('sektör (014): onay sıfırken yeniden yayına alınamaz', $q$update public.reklamlar set durum = 'yayinda' where id = '77777777-0000-4000-8000-000000000001'$q$, 'yasaklı sektör');
select test.esit('sektör (014): yeniden onaylayınca yayına alınır', test.satir($q$update public.reklamlar set durum = 'yayinda', sektor_onayi = true where id = '77777777-0000-4000-8000-000000000001'$q$)::text, '1');
select test.esit('sektör (014): içerikle birlikte açıkça yeniden onay (onay zamanı değişir) kabul edilir',
  test.satir($q$update public.reklamlar set kisa_metin = 'Takas ve kredi', sektor_onay_zamani = now() - interval '5 day' where id = '77777777-0000-4000-8000-000000000001'$q$)::text, '1');
select test.esit('sektör (014): yeniden onaylayınca yayına alınır (sonuç)', (select sektor_onayi::text || ':' || (sektor_onay_zamani > now() - interval '1 minute')::text from public.reklamlar where id = '77777777-0000-4000-8000-000000000001'), 'true:true');
select test.esit('firma anahtarı (014): Türkçe küçük harf, ı/i ve boşluk farkı yok',
  public.firma_anahtari('  NARÇIL   Cafe ') || '|' || public.firma_anahtari('Narçil cafe') || '|' || public.firma_anahtari(E'narcil\tCAFE'), 'narcil cafe|narcil cafe|narcil cafe');
delete from public.reklamlar where id = '77777777-0000-4000-8000-000000000001';

-- haber: kaynak, düzeltme, kapak alt metni (başkan 3)
select test.hata_bekle('haber (014): kaynak bağlantısı yalnız https',
  $q$insert into public.haberler (baslik, kaynak, kaynak_url) values ('Transfer', 'Kulüp', 'http://ornek.com/x')$q$, 'haberler_kaynak_url');
select test.hata_bekle('haber (014): düzeltme notu en çok 500 karakter',
  $q$insert into public.haberler (baslik, duzeltme_notu) values ('Uzun düzeltme', repeat('x', 501))$q$, 'haberler_duzeltme_notu');
select test.esit('haber (014): kaynak ve düzeltme notu; düzeltme tarihi sunucuda', test.satir($q$insert into public.haberler (id, baslik, kaynak, kaynak_url, duzeltme_notu, kapak_alt, yayinda) values ('33333333-0000-4000-8000-0000000000aa', 'Kadro açıklandı', ' Kulüp açıklaması ', 'https://corumfk.com.tr/kadro', 'Forvetin adı düzeltildi.', 'Skor tabelası: 2-1', true)$q$)::text, '1');
select test.esit('haber (014): kaynak ve düzeltme notu; düzeltme tarihi sunucuda (sonuç)', (select kaynak || ':' || (duzeltme_tarihi is not null)::text from public.haberler where id = '33333333-0000-4000-8000-0000000000aa'), 'Kulüp açıklaması:true');
reset role;
create temp table duzeltme_once as select duzeltme_tarihi as t from public.haberler where id = '33333333-0000-4000-8000-0000000000aa';
select pg_sleep(0.01);
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);
set role authenticated;
select test.esit('haber (014): başka alan değişince düzeltme tarihi aynı kalır', test.satir($q$update public.haberler set ozet = 'Özet' where id = '33333333-0000-4000-8000-0000000000aa'$q$)::text, '1');
reset role;
select test.dogru('haber (014): başka alan değişince düzeltme tarihi aynı kalır (sonuç)',
  (select h.duzeltme_tarihi = d.t from public.haberler h, duzeltme_once d where h.id = '33333333-0000-4000-8000-0000000000aa'));
select test.esit('haber (014): düzeltme notu değişince tarih yenilenir',
  test.satir($q$update public.haberler set duzeltme_notu = 'İkinci düzeltme.' where id = '33333333-0000-4000-8000-0000000000aa'$q$)::text, '1');
select test.dogru('haber (014): düzeltme notu değişince tarih yenilenir (sonuç)',
  (select h.duzeltme_tarihi > d.t from public.haberler h, duzeltme_once d where h.id = '33333333-0000-4000-8000-0000000000aa'));
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);
set role authenticated;
delete from public.haberler where id = '33333333-0000-4000-8000-0000000000aa';

-- gol: video kaynağı, mp4 yalnız depodan, altyazı (başkan 6, erişilebilirlik 4)
select test.hata_bekle('gol (014): videolu golde video kaynağı zorunlu',
  $q$insert into public.goller (mac_id, oyuncu, dakika, video_url) values ('11111111-0000-4000-8000-000000000001', 'Ali Örnek', 50, 'https://www.youtube.com/watch?v=aqz-KE-bpKQ')$q$, 'kaynağını');
select test.hata_bekle('gol (014): başka sitedeki .mp4 reddedilir',
  $q$insert into public.goller (mac_id, oyuncu, dakika, video_url, video_kaynak) values ('11111111-0000-4000-8000-000000000001', 'Ali Örnek', 51, 'https://baska-site.com/gol.mp4', 'Bilinmiyor')$q$, 'goller_video_deposu');
select test.esit('gol (014): sitenin deposundaki .mp4 + Türkçe altyazı (.vtt) kabul edilir',
  test.satir($q$insert into public.goller (mac_id, oyuncu, dakika, video_url, video_kaynak, altyazi_url) values ('11111111-0000-4000-8000-000000000001', 'Ali Örnek', 52, 'https://abcd.supabase.co/storage/v1/object/public/gol-videolari/2026/gol.mp4', 'Kulübün kendi çekimi', 'https://abcd.supabase.co/storage/v1/object/public/gol-videolari/2026/gol.vtt')$q$)::text, '1');
select test.hata_bekle('gol (014): altyazı başka siteden olamaz',
  $q$insert into public.goller (mac_id, oyuncu, dakika, video_url, video_kaynak, altyazi_url) values ('11111111-0000-4000-8000-000000000001', 'Ali Örnek', 53, 'https://abcd.supabase.co/storage/v1/object/public/gol-videolari/g.mp4', 'Kulüp', 'https://baska-site.com/a.vtt')$q$, 'goller_altyazi');
select test.hata_bekle('gol (014): YouTube videosuna altyazı dosyası eklenmez',
  $q$insert into public.goller (mac_id, oyuncu, dakika, video_url, video_kaynak, altyazi_url) values ('11111111-0000-4000-8000-000000000001', 'Ali Örnek', 54, 'https://youtu.be/aqz-KE-bpKQ', 'Kulüp', 'https://abcd.supabase.co/storage/v1/object/public/gol-videolari/a.vtt')$q$, 'Altyazı yalnız');
delete from public.goller where dakika in (52);
select test.hata_bekle('maç (014): maç notu en çok 280 karakter',
  $q$update public.maclar set mac_notu = repeat('x', 281) where id = '11111111-0000-4000-8000-000000000003'$q$, 'maclar_mac_notu');
reset role;
select test.esit('seed (014): maç notu ve haber kaynağı', (select count(*) from public.maclar where mac_notu is not null)::text || '/' || (select count(*) from public.haberler where kaynak is not null)::text, '1/1');
select test.dogru('depo (014): gol-videolari kovası herkese açık, mp4 + vtt, 50 MB',
  (select public and file_size_limit = 52428800 and allowed_mime_types = array['video/mp4', 'text/vtt'] from storage.buckets where id = 'gol-videolari'));

-- sakatlık: kaynak bağlantısı, kaynak tarihi, açıklama yalnız yöneticiye (denetçi 14, başkan 7)
select set_config('request.jwt.claim.sub', '', false);
set role anon;
select test.hata_bekle('sakatlık (014): ziyaretçi açıklama sütununu okuyamaz', $q$select aciklama from public.sakatliklar$q$, 'permission denied');
select test.hata_bekle('sakatlık (014): ziyaretçi select * ile de okuyamaz', $q$select * from public.sakatliklar$q$, 'permission denied');
select test.dogru('sakatlık (014): ziyaretçi herkese açık sütunları okur (yalnız yayındakiler)',
  (select count(*) from (select id, oyuncu_id, durum, kaynak, kaynak_url, kaynak_tarihi, beklenen_donus, guncellendi from public.sakatliklar where yayinda) x)
  = (select count(*) from public.sakatliklar) and (select count(*) from public.sakatliklar) >= 2);
select test.hata_bekle('sakatlık (014): ziyaretçi yönetici listesini çağıramaz', $q$select * from public.sakatliklar_yonetim()$q$, 'permission denied');
reset role;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-000000000001', false);
set role authenticated;
select test.hata_bekle('sakatlık (014): üye de açıklamayı okuyamaz', $q$select aciklama from public.sakatliklar$q$, 'permission denied');
select test.hata_bekle('sakatlık (014): üye yönetici listesini alamaz', $q$select * from public.sakatliklar_yonetim()$q$, 'yalnızca yöneticiler');
reset role;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);
set role authenticated;
select test.dogru('sakatlık (014): yönetici açıklamayı sakatliklar_yonetim() ile okur',
  (select count(*) >= 3 and bool_or(aciklama is not null) and bool_and(oyuncu_ad is not null) from public.sakatliklar_yonetim()));
select test.hata_bekle('sakatlık (014): Sakat kaydında kaynak bağlantısı zorunlu',
  $q$insert into public.sakatliklar (oyuncu_id, durum, kaynak) values ('55555555-0000-4000-8000-000000000005', 'sakat', 'Kulüp açıklaması')$q$, 'sakatliklar_kaynak_url_zorunlu');
select test.hata_bekle('sakatlık (014): Durumu belirsiz kaydında da',
  $q$insert into public.sakatliklar (oyuncu_id, durum, kaynak) values ('55555555-0000-4000-8000-000000000005', 'belirsiz', 'Kulüp açıklaması')$q$, 'sakatliklar_kaynak_url_zorunlu');
select test.esit('sakatlık (014): Cezalı kaydı bağlantısız da olur; kaynak tarihi yazılır',
  test.satir($q$insert into public.sakatliklar (oyuncu_id, durum, kaynak, kaynak_tarihi) values ('55555555-0000-4000-8000-000000000005', 'cezali', 'TFF', current_date)$q$)::text, '1');
reset role;
delete from public.sakatliklar where kaynak = 'TFF' and durum = 'cezali';

-- son sürüm denetimi (denetçi 10): yeniden tanımlanan fonksiyonların en yenisi kurulu
select test.dogru('son sürüm (014/015): 014 ve 015 gövdeleri kurulu (aktif_reklamlar, yorum_guncelleme_kontrol)',
  (select bool_and(pg_get_functiondef(p.oid) ~ 'sürüm 014') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('aktif_reklamlar', 'yorum_guncelleme_kontrol'))
  and (select bool_and(pg_get_functiondef(p.oid) ~ 'sürüm 015') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('reklam_olay_kaydet', 'reklam_raporu', 'kullanici_adi_ayrilmis', 'sikayet_kontrol', 'sikayet_otomatik_gizle',
     'reklamlar_sektor', 'reklam_gunluk_topla', 'reklam_rapor_verisi', 'profil_koruma', 'yorum_onay_gerekli'))
  and (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'reklam_olay_kaydet') = 1);
select test.dogru('son sürüm (013): profil_koruma engelli korumalı, yorum_ekleme_kontrol engelli_mi() çağırıyor, yeni_kullanici ayrılmış adı denetliyor',
  pg_get_functiondef('public.profil_koruma()'::regprocedure) ~ 'engelli'
  and pg_get_functiondef('public.yorum_ekleme_kontrol()'::regprocedure) ~ 'engelli_mi'
  and pg_get_functiondef('public.yeni_kullanici()'::regprocedure) ~ 'kullanici_adi_ayrilmis');
select test.dogru('yetki (014): yeni tablolarda RLS açık, anon/authenticated yazamaz; iç fonksiyonlar herkese kapalı',
  (select bool_and(relrowsecurity) from pg_class where oid in ('public.yorum_kelimeleri'::regclass, 'public.reklam_yerlesimleri'::regclass, 'public.reklam_sekme_sayaclari'::regclass, 'public.reklam_gunluk'::regclass, 'public.reklam_gunluk_toplanan'::regclass))
  and not has_table_privilege('anon', 'public.reklam_gunluk', 'SELECT')
  and not has_table_privilege('authenticated', 'public.reklam_sekme_sayaclari', 'SELECT')
  and not has_table_privilege('authenticated', 'public.reklam_yerlesimleri', 'INSERT')
  and not has_function_privilege('anon', 'public.reklam_bakim(integer)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.reklam_gunluk_topla(date)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.reklam_rapor_verisi(date, date)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.yorum_onay_gerekli(text, uuid, uuid)', 'EXECUTE'));

-- ================================================================ 015: son tur (sunucu)
reset role;
select set_config('request.jwt.claim.sub', '', false);
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
  ('bbbbbbbb-0000-4000-8000-0000000000d1', 'eski1@ornek.test', '{"kullanici_adi":"eski_bir"}', now()),
  ('bbbbbbbb-0000-4000-8000-0000000000d2', 'eski2@ornek.test', '{"kullanici_adi":"eski_iki"}', now()),
  ('bbbbbbbb-0000-4000-8000-0000000000d3', 'eski3@ornek.test', '{"kullanici_adi":"eski_uc"}', now()),
  ('bbbbbbbb-0000-4000-8000-0000000000e1', 'yeni1@ornek.test', '{"kullanici_adi":"yeni_bir"}', now()),
  ('bbbbbbbb-0000-4000-8000-0000000000e2', 'yeni2@ornek.test', '{"kullanici_adi":"yeni_iki"}', now()),
  ('bbbbbbbb-0000-4000-8000-0000000000e3', 'yeni3@ornek.test', '{"kullanici_adi":"yeni_uc"}', now()),
  ('bbbbbbbb-0000-4000-8000-0000000000f1', 'hakan@ornek.test', '{"kullanici_adi":"hakan"}', now()),
  ('bbbbbbbb-0000-4000-8000-0000000000f2', 'mert@ornek.test', '{"kullanici_adi":"Mert"}', now());
update public.profiles set created_at = now() - interval '3 days'
  where id in ('bbbbbbbb-0000-4000-8000-0000000000d1', 'bbbbbbbb-0000-4000-8000-0000000000d2', 'bbbbbbbb-0000-4000-8000-0000000000d3', 'bbbbbbbb-0000-4000-8000-0000000000f1');
insert into public.yorumlar (haber_id, metin, kullanici_id) values
  ('33333333-0000-4000-8000-000000000001', '015 yorum: yeni hesaplar şikâyet eder', 'bbbbbbbb-0000-4000-8000-0000000000c1'),
  ('33333333-0000-4000-8000-000000000001', '015 yorum: yönetici duyurusu', 'aaaaaaaa-0000-4000-8000-000000000001');
insert into public.yorumlar (haber_id, metin, kullanici_id)
  select '33333333-0000-4000-8000-000000000001', '015 toplu yorum ' || i, 'bbbbbbbb-0000-4000-8000-0000000000c1' from generate_series(1, 31) i;

-- uygulama sahibinin adı ayrılmış (seed: SAHIP_ADI "Mert (uygulama sahibi)" → "mert")
select test.esit('ayrılmış ad (015): seed uygulama sahibinin adını ayrilmis_adlar''a ekler (parantez içi atılır)', (select string_agg(anahtar, ',') from public.ayrilmis_adlar), 'mert');
select test.dogru('kayıt (015): uygulama sahibinin adı ("Mert") kayıtta kullanılmaz, taraftar… adı verilir',
  (select kullanici_adi ~ '^taraftar[0-9a-f]{6}' from public.profiles where id = 'bbbbbbbb-0000-4000-8000-0000000000f2'));
select test.dogru('ayrılmış ad (015): rn→m, 8→at, cfk, sondaki rakam, silinen rakam, sahip adı',
  public.kullanici_adi_ayrilmis('Adrnin') and public.kullanici_adi_ayrilmis('Moder8or') and public.kullanici_adi_ayrilmis('ÇFK_Haber')
  and public.kullanici_adi_ayrilmis('C_F_K') and public.kullanici_adi_ayrilmis('Sistem0') and public.kullanici_adi_ayrilmis('Kapta1n')
  and public.kullanici_adi_ayrilmis('M3rt_1') and public.kullanici_adi_ayrilmis('rn3rt'));
select test.dogru('ayrılmış ad (015): sıradan adlar yine serbest',
  not (public.kullanici_adi_ayrilmis('Çorumlu_Mert') or public.kullanici_adi_ayrilmis('turna_10') or public.kullanici_adi_ayrilmis('kral_10') or public.kullanici_adi_ayrilmis('hakan')));
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-0000000000c2', false);
set role authenticated;
select test.hata_bekle('ayrılmış ad (015): taraftar listeyi okuyamaz/ekleyemez', $q$insert into public.ayrilmis_adlar (ad) values ('ece')$q$, 'row-level security');
select test.esit('ayrılmış ad (015): taraftar listeyi göremez', (select count(*) from public.ayrilmis_adlar)::text, '0');
reset role;

-- ad değiştirme 7 günde bir (denetçi 5)
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-0000000000c3', false);
set role authenticated;
select test.esit('ad değiştirme (015): ilk değiştirme serbest', test.satir($q$update public.profiles set kullanici_adi = 'fatma_2' where id = 'bbbbbbbb-0000-4000-8000-0000000000c3'$q$)::text, '1');
select test.hata_bekle('ad değiştirme (015): 7 gün dolmadan ikinci kez değiştirilemez',
  $q$update public.profiles set kullanici_adi = 'fatma_3' where id = 'bbbbbbbb-0000-4000-8000-0000000000c3'$q$, '7 günde bir');
select test.hata_bekle('ad değiştirme (015): değiştirme zamanını kendisi geri alamaz (sütunu okuyamaz)', $q$select ad_degisti from public.profiles$q$, 'permission denied');
select test.esit('ad değiştirme (015): başka alanı güncellemek zamanı sıfırlamaz', test.satir($q$update public.profiles set ad_degisti = null where id = 'bbbbbbbb-0000-4000-8000-0000000000c3'$q$)::text, '1');
select test.hata_bekle('ad değiştirme (015): zamanı boşaltma denemesinden sonra da değiştirilemez',
  $q$update public.profiles set kullanici_adi = 'fatma_3' where id = 'bbbbbbbb-0000-4000-8000-0000000000c3'$q$, '7 günde bir');
reset role;
update public.profiles set ad_degisti = now() - interval '8 days' where id = 'bbbbbbbb-0000-4000-8000-0000000000c3';
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-0000000000c3', false);
set role authenticated;
select test.esit('ad değiştirme (015): 7 gün sonra yeniden değiştirilebilir', test.satir($q$update public.profiles set kullanici_adi = 'fatma_3' where id = 'bbbbbbbb-0000-4000-8000-0000000000c3'$q$)::text, '1');
reset role;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);
set role authenticated;
select test.esit('ad değiştirme (015): yönetici (kural dışı ad için) hemen yeniden adlandırabilir', test.satir($q$update public.profiles set kullanici_adi = 'fatma_4' where id = 'bbbbbbbb-0000-4000-8000-0000000000c3'$q$)::text, '1');
reset role;

-- şikâyet: yeni hesaplar sayılmaz, yönetici yorumu gizlenmez (denetçi 2)
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-0000000000e1', false); set role authenticated;
select test.esit('şikâyet (015): yeni hesap 1 şikâyet eder', test.satir($q$insert into public.yorum_sikayetleri (yorum_id) select id from public.yorumlar where metin = '015 yorum: yeni hesaplar şikâyet eder'$q$)::text, '1');
reset role; select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-0000000000e2', false); set role authenticated;
select test.esit('şikâyet (015): yeni hesap 2 şikâyet eder', test.satir($q$insert into public.yorum_sikayetleri (yorum_id) select id from public.yorumlar where metin = '015 yorum: yeni hesaplar şikâyet eder'$q$)::text, '1');
reset role; select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-0000000000e3', false); set role authenticated;
select test.esit('şikâyet (015): yeni hesap 3 şikâyet eder', test.satir($q$insert into public.yorum_sikayetleri (yorum_id) select id from public.yorumlar where metin = '015 yorum: yeni hesaplar şikâyet eder'$q$)::text, '1');
reset role;
select test.esit('şikâyet (015): 24 saatten yeni 3 hesabın şikâyeti yorumu kendiliğinden gizlemez', (select gizli::text from public.yorumlar where metin = '015 yorum: yeni hesaplar şikâyet eder'), 'false');
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-0000000000d1', false); set role authenticated;
select test.esit('şikâyet (015): eski hesap da şikâyet eder (1 eski + 3 yeni)', test.satir($q$insert into public.yorum_sikayetleri (yorum_id) select id from public.yorumlar where metin = '015 yorum: yeni hesaplar şikâyet eder'$q$)::text, '1');
reset role;
select test.esit('şikâyet (015): 1 eski + 3 yeni hesap da gizlemez', (select gizli::text from public.yorumlar where metin = '015 yorum: yeni hesaplar şikâyet eder'), 'false');
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-0000000000d2', false); set role authenticated;
select test.satir($q$insert into public.yorum_sikayetleri (yorum_id) select id from public.yorumlar where metin = '015 yorum: yeni hesaplar şikâyet eder'$q$);
reset role; select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-0000000000d3', false); set role authenticated;
select test.satir($q$insert into public.yorum_sikayetleri (yorum_id) select id from public.yorumlar where metin = '015 yorum: yeni hesaplar şikâyet eder'$q$);
reset role;
select test.esit('şikâyet (015): 3 eski (24 saatten eski) hesabın şikâyeti gizler', (select gizli::text || ':' || gizleme_nedeni from public.yorumlar where metin = '015 yorum: yeni hesaplar şikâyet eder'), 'true:sikayet');
do $$
declare u uuid;
begin
  foreach u in array array['bbbbbbbb-0000-4000-8000-0000000000d1', 'bbbbbbbb-0000-4000-8000-0000000000d2', 'bbbbbbbb-0000-4000-8000-0000000000d3']::uuid[] loop
    perform set_config('request.jwt.claim.sub', u::text, true);
    set local role authenticated;
    insert into public.yorum_sikayetleri (yorum_id) select id from public.yorumlar where metin = '015 yorum: yönetici duyurusu';
    reset role;
  end loop;
end $$;
select test.esit('şikâyet (015): yönetici yorumu 3 eski hesabın şikâyetiyle de kendiliğinden gizlenmez',
  (select gizli::text || ':' || (select count(*) from public.yorum_sikayetleri s where s.yorum_id = y.id)::text from public.yorumlar y where metin = '015 yorum: yönetici duyurusu'), 'false:3');

-- şikâyet hızı: saatte 10, günde 30
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-0000000000f1', false); set role authenticated;
select test.esit('şikâyet hızı (015): bir saatte 10 şikâyet', test.satir($q$insert into public.yorum_sikayetleri (yorum_id) select id from public.yorumlar where metin like '015 toplu yorum %' order by metin limit 10$q$)::text, '10');
select test.hata_bekle('şikâyet hızı (015): 11. şikâyet reddedilir (saatte 10)',
  $q$insert into public.yorum_sikayetleri (yorum_id) select y.id from public.yorumlar y where y.metin like '015 toplu yorum %' and not exists (select 1 from public.yorum_sikayetleri s where s.yorum_id = y.id) limit 1$q$, 'saatte en fazla 10');
reset role;
update public.yorum_sikayetleri set created_at = created_at - interval '2 hours' where sikayet_eden = 'bbbbbbbb-0000-4000-8000-0000000000f1';
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-0000000000f1', false); set role authenticated;
select test.esit('şikâyet hızı (015): bir saat sonra 10 şikâyet daha', test.satir($q$insert into public.yorum_sikayetleri (yorum_id) select id from public.yorumlar where metin like '015 toplu yorum %' order by metin offset 10 limit 10$q$)::text, '10');
reset role;
update public.yorum_sikayetleri set created_at = created_at - interval '2 hours' where sikayet_eden = 'bbbbbbbb-0000-4000-8000-0000000000f1';
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-0000000000f1', false); set role authenticated;
select test.esit('şikâyet hızı (015): 24 saatte 30 şikâyete kadar', test.satir($q$insert into public.yorum_sikayetleri (yorum_id) select id from public.yorumlar where metin like '015 toplu yorum %' order by metin offset 20 limit 10$q$)::text, '10');
reset role;
update public.yorum_sikayetleri set created_at = created_at - interval '2 hours' where sikayet_eden = 'bbbbbbbb-0000-4000-8000-0000000000f1';
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-0000000000f1', false); set role authenticated;
select test.hata_bekle('şikâyet hızı (015): 31. şikâyet reddedilir (günde 30)',
  $q$insert into public.yorum_sikayetleri (yorum_id) select id from public.yorumlar where metin like '015 toplu yorum %' order by metin offset 30 limit 1$q$, 'günde en fazla 30');
reset role;
select test.esit('şikâyet hızı (015): başka hesabın şikâyeti bu sınırı etkilemez',
  (select count(*) from public.yorum_sikayetleri where sikayet_eden = 'bbbbbbbb-0000-4000-8000-0000000000f1')::text, '30');

-- kelime listesi: harf dışı karakterleri atılmış kopya (denetçi 10)
insert into public.yorum_kelimeleri (kelime) values ('salak');
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-0000000000d1', false); set role authenticated;
select test.satir($q$insert into public.yorumlar (mac_id, metin) values ('11111111-0000-4000-8000-000000000001', 'Hakem s.a.l.a.k')$q$);
select test.satir($q$insert into public.yorumlar (mac_id, metin) values ('11111111-0000-4000-8000-000000000001', 'kalasalak bir gün')$q$);
select test.esit('kelime listesi (015): "s.a.l.a.k" de onay bekler', (select onay_bekliyor::text from public.yorumlar where metin = 'Hakem s.a.l.a.k'), 'true');
select test.esit('kelime listesi (015): "kalasalak" gibi sözcük içi eşleşme yine yok', (select onay_bekliyor::text from public.yorumlar where metin = 'kalasalak bir gün'), 'false');
reset role;
delete from public.yorum_kelimeleri;

-- yasaklı sektör: görsel yazısı ve düğme yazısı da (denetçi 4)
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);
set role authenticated;
select test.esit('sektör (015): onaylı reklam', test.satir($q$insert into public.reklamlar (id, firma_adi, gorsel_url, kisa_metin, alan, baslangic, bitis, durum, sektor_onayi) values ('77777777-0000-4000-8000-000000000002', 'Kale Oto', 'https://abcd.supabase.co/storage/v1/object/public/reklam-gorselleri/x.webp', 'Ekspertizli araçlar', 'ana_akis', now() - interval '1 day', now() + interval '1 day', 'yayinda', true)$q$)::text, '1');
select test.hata_bekle('sektör (015): yayındaki reklamın görsel yazısı değişince yeniden onay istenir',
  $q$update public.reklamlar set gorsel_metni = 'Bahis oyna kazan' where id = '77777777-0000-4000-8000-000000000002'$q$, 'yasaklı sektör');
select test.hata_bekle('sektör (015): düğme yazısı değişince de',
  $q$update public.reklamlar set dugme_metni = 'Bahis oyna' where id = '77777777-0000-4000-8000-000000000002'$q$, 'yasaklı sektör');
select test.esit('sektör (015): duraklatarak değiştirilirse onay sıfırlanır', test.satir($q$update public.reklamlar set dugme_metni = 'Araçları gör', durum = 'duraklatildi' where id = '77777777-0000-4000-8000-000000000002'$q$)::text, '1');
select test.esit('sektör (015): duraklatarak değiştirilirse onay sıfırlanır (sonuç)', (select sektor_onayi::text from public.reklamlar where id = '77777777-0000-4000-8000-000000000002'), 'false');
delete from public.reklamlar where id = '77777777-0000-4000-8000-000000000002';

-- haber: kadro / transfer / sakatlık / bilet haberinde kaynak zorunlu (başkan 2)
select test.hata_bekle('haber (015): "kaynak gerekli" haberde kaynak boşsa kaydedilmez',
  $q$insert into public.haberler (baslik, kaynak_gerekli, kaynak) values ('Transfer: yeni forvet', true, '  ')$q$, 'kaynak zorunlu');
select test.esit('haber (015): kaynakla kaydedilir', test.satir($q$insert into public.haberler (id, baslik, kaynak_gerekli, kaynak) values ('33333333-0000-4000-8000-0000000000ab', 'Transfer: yeni forvet', true, 'Kulüp açıklaması')$q$)::text, '1');
select test.hata_bekle('haber (015): sonradan kaynak silinemez', $q$update public.haberler set kaynak = null where id = '33333333-0000-4000-8000-0000000000ab'$q$, 'kaynak zorunlu');
delete from public.haberler where id = '33333333-0000-4000-8000-0000000000ab';
reset role;
select test.esit('seed (015): bilet haberi "kaynak gerekli" ve kaynaklı', (select kaynak_gerekli::text || ':' || (kaynak is not null and kaynak_url is not null)::text from public.haberler where id = '33333333-0000-4000-8000-000000000003'), 'true:true');
select test.dogru('yetki (015): yeni tablo RLS açık; ham satır alarmı ve şikâyet hakkı ziyaretçiye kapalı',
  (select relrowsecurity from pg_class where oid = 'public.ayrilmis_adlar'::regclass)
  and not has_function_privilege('anon', 'public.reklam_ham_satir_alarmi(integer)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.sikayet_hakki()', 'EXECUTE')
  and not has_table_privilege('anon', 'public.ayrilmis_adlar', 'SELECT'));

-- ================================================================ 016: maç özeti videosu ve hafta
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);
set role authenticated;
select test.hata_bekle('maç özeti (016): videolu maçta kaynak zorunlu',
  $q$update public.maclar set ozet_video_url = 'https://www.youtube.com/watch?v=abcdefghijk' where id = '11111111-0000-4000-8000-000000000001'$q$, 'kaynağını yazın');
select test.hata_bekle('maç özeti (016): başka sitedeki .mp4 kabul edilmez',
  $q$update public.maclar set ozet_video_url = 'https://ornek.test/ozet.mp4', ozet_video_kaynak = 'Örnek' where id = '11111111-0000-4000-8000-000000000001'$q$, 'maclar_ozet_video');
select test.hata_bekle('maç özeti (016): hafta 1-60', $q$update public.maclar set hafta = 0 where id = '11111111-0000-4000-8000-000000000001'$q$, 'maclar_hafta');
select test.esit('maç özeti (016): yönetici YouTube özeti, kaynağı ve haftayı yazar',
  test.satir($q$update public.maclar set hafta = 3, ozet_video_url = ' https://www.youtube.com/watch?v=abcdefghijk ', ozet_video_kaynak = 'beIN SPORTS Türkiye YouTube kanalı' where id = '11111111-0000-4000-8000-000000000001'$q$)::text, '1');
reset role;
set role anon;
select test.esit('maç özeti (016): ziyaretçi özeti ve haftayı okur (boşluklar temizlenmiş)',
  (select hafta || '|' || ozet_video_url from public.maclar where id = '11111111-0000-4000-8000-000000000001'), '3|https://www.youtube.com/watch?v=abcdefghijk');
select test.esit('maç özeti (016): ziyaretçi özeti değiştiremez (0 satır)',
  test.satir($q$update public.maclar set ozet_video_url = null, ozet_video_kaynak = null where id = '11111111-0000-4000-8000-000000000001'$q$)::text, '0');
reset role;
update public.maclar set hafta = null, ozet_video_url = null, ozet_video_kaynak = null where id = '11111111-0000-4000-8000-000000000001';

-- ================================================================ 017: yorumlara yanıt ve profil fotoğrafı
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
  ('bbbbbbbb-0000-4000-8000-000000017a01', 'yanit1@ornek.test', '{"kullanici_adi":"yanitci_bir"}', now()),
  ('bbbbbbbb-0000-4000-8000-000000017a02', 'yanit2@ornek.test', '{"kullanici_adi":"yanitci_iki"}', now());
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-000000017a01', false);
set role authenticated;
select test.esit('yanıt (017): ana yorum', test.satir($q$insert into public.yorumlar (id, mac_id, metin) values ('44444444-0000-4000-8000-0000000000a1', '11111111-0000-4000-8000-000000000003', '017 ana yorum')$q$)::text, '1');
reset role;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-000000017a02', false);
set role authenticated;
select test.esit('yanıt (017): başka taraftar yanıt verir (hedef istemciden gelmese de ana yorumdan kopyalanır)',
  test.satir($q$insert into public.yorumlar (id, mac_id, ust_yorum_id, metin) values ('44444444-0000-4000-8000-0000000000a2', '11111111-0000-4000-8000-000000000001', '44444444-0000-4000-8000-0000000000a1', '017 yanıt')$q$)::text, '1');
select test.esit('yanıt (017): yanıtın hedefi ana yorumunki', (select mac_id::text from public.yorumlar where id = '44444444-0000-4000-8000-0000000000a2'), '11111111-0000-4000-8000-000000000003');
select test.esit('yanıt (017): yanıtın yanıtı ana yoruma bağlanır (tek seviye)',
  test.satir($q$insert into public.yorumlar (id, mac_id, ust_yorum_id, metin) values ('44444444-0000-4000-8000-0000000000a3', '11111111-0000-4000-8000-000000000003', '44444444-0000-4000-8000-0000000000a2', '017 yanıta yanıt')$q$)::text, '1');
select test.esit('yanıt (017): tek seviye (sonuç)', (select ust_yorum_id::text from public.yorumlar where id = '44444444-0000-4000-8000-0000000000a3'), '44444444-0000-4000-8000-0000000000a1');
select test.hata_bekle('yanıt (017): olmayan yoruma yanıt verilemez',
  $q$insert into public.yorumlar (mac_id, ust_yorum_id, metin) values ('11111111-0000-4000-8000-000000000003', '44444444-0000-4000-8000-0000000000ff', '017 boşa yanıt')$q$, 'bulunamadı');
select test.hata_bekle('yanıt (017): yanıt başka yoruma taşınamaz',
  $q$update public.yorumlar set ust_yorum_id = null where id = '44444444-0000-4000-8000-0000000000a2'$q$, 'değiştirilemez');
reset role;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-000000017a01', false);
set role authenticated;
select test.esit('yanıt (017): ana yorum silinince yanıtları da gider', test.satir($q$delete from public.yorumlar where id = '44444444-0000-4000-8000-0000000000a1'$q$)::text, '1');
reset role;
select test.esit('yanıt (017): yanıtlar silindi (sonuç)', (select count(*) from public.yorumlar where id in ('44444444-0000-4000-8000-0000000000a2', '44444444-0000-4000-8000-0000000000a3'))::text, '0');

-- profil fotoğrafı
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-000000017a01', false);
set role authenticated;
select test.esit('foto (017): kendi klasörüne yükler', test.satir($q$insert into storage.objects (bucket_id, name) values ('profil-fotograflari', 'bbbbbbbb-0000-4000-8000-000000017a01/a1.webp')$q$)::text, '1');
select test.hata_bekle('foto (017): başkasının klasörüne yükleyemez',
  $q$insert into storage.objects (bucket_id, name) values ('profil-fotograflari', 'bbbbbbbb-0000-4000-8000-000000017a02/a1.webp')$q$, 'row-level security');
select test.esit('foto (017): kendi profiline kendi klasöründeki fotoğrafı koyar',
  test.satir($q$update public.profiles set foto_url = 'https://abcd.supabase.co/storage/v1/object/public/profil-fotograflari/bbbbbbbb-0000-4000-8000-000000017a01/a1.webp' where id = 'bbbbbbbb-0000-4000-8000-000000017a01'$q$)::text, '1');
select test.hata_bekle('foto (017): başkasının klasöründeki dosyayı kendi fotoğrafı yapamaz',
  $q$update public.profiles set foto_url = 'https://abcd.supabase.co/storage/v1/object/public/profil-fotograflari/bbbbbbbb-0000-4000-8000-000000017a02/a1.webp' where id = 'bbbbbbbb-0000-4000-8000-000000017a01'$q$, 'profiles_foto');
select test.hata_bekle('foto (017): başka siteden fotoğraf olmaz',
  $q$update public.profiles set foto_url = 'https://ornek.test/ben.jpg' where id = 'bbbbbbbb-0000-4000-8000-000000017a01'$q$, 'profiles_foto');
reset role;
set role anon;
select test.esit('foto (017): ziyaretçi fotoğraf adresini okur (yorumlarda görünür)',
  (select (foto_url like '%/profil-fotograflari/bbbbbbbb-0000-4000-8000-000000017a01/a1.webp')::text from public.profiles where id = 'bbbbbbbb-0000-4000-8000-000000017a01'), 'true');
reset role;
update public.profiles set engelli = true where id = 'bbbbbbbb-0000-4000-8000-000000017a02';
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-000000017a02', false);
set role authenticated;
select test.hata_bekle('foto (017): yasaklı hesap fotoğraf yükleyemez',
  $q$insert into storage.objects (bucket_id, name) values ('profil-fotograflari', 'bbbbbbbb-0000-4000-8000-000000017a02/b.webp')$q$, 'row-level security');
reset role;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);
set role authenticated;
select test.esit('foto (017): yönetici uygunsuz fotoğrafı kaldırır',
  test.satir($q$update public.profiles set foto_url = null where id = 'bbbbbbbb-0000-4000-8000-000000017a01'$q$)::text, '1');
select test.hata_bekle('foto (017): yönetici başkasına fotoğraf koyamaz',
  $q$update public.profiles set foto_url = 'https://abcd.supabase.co/storage/v1/object/public/profil-fotograflari/bbbbbbbb-0000-4000-8000-000000017a01/a1.webp' where id = 'bbbbbbbb-0000-4000-8000-000000017a01'$q$, 'yalnız kaldırabilir');
select test.esit('foto (017): yönetici dosyayı da siler', test.satir($q$delete from storage.objects where bucket_id = 'profil-fotograflari' and name = 'bbbbbbbb-0000-4000-8000-000000017a01/a1.webp'$q$)::text, '1');
reset role;

-- ================================================================ 018: gol anı, asist ve maç kadrosu
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);
set role authenticated;
select test.esit('gol anı (018): yönetici asist ve YouTube aralığı yazar (boşluklar temizlenir)',
  test.satir($q$update public.goller set asist = ' Veli Örnek ', video_baslangic_sn = 12, video_bitis_sn = 30 where id = '22222222-0000-4000-8000-000000000001'$q$)::text, '1');
select test.hata_bekle('gol anı (018): bitiş başlangıçtan sonra olmalı',
  $q$update public.goller set video_baslangic_sn = 30, video_bitis_sn = 30 where id = '22222222-0000-4000-8000-000000000001'$q$, 'başlangıçtan sonra');
select test.hata_bekle('gol anı (018): başlangıç ve bitiş birlikte',
  $q$update public.goller set video_baslangic_sn = 5, video_bitis_sn = null where id = '22222222-0000-4000-8000-000000000001'$q$, 'birlikte');
select test.hata_bekle('gol anı (018): 21600 sn sınırı',
  $q$update public.goller set video_baslangic_sn = 10, video_bitis_sn = 30000 where id = '22222222-0000-4000-8000-000000000001'$q$, 'goller_video_aralik');
select test.hata_bekle('gol anı (018): videosuz golde aralık olmaz (yalnız YouTube)',
  $q$update public.goller set video_baslangic_sn = 1, video_bitis_sn = 9 where id = '22222222-0000-4000-8000-000000000002'$q$, 'yalnız YouTube');
select test.hata_bekle('gol anı (018): asist 2-80 karakter',
  $q$update public.goller set asist = 'A' where id = '22222222-0000-4000-8000-000000000002'$q$, 'goller_asist');
select test.esit('kadro (018): yönetici maç kadrosu yazar',
  test.satir($q$insert into public.mac_oyunculari (mac_id, oyuncu, ilk11, cikis_dk, sari) values ('11111111-0000-4000-8000-000000000001', '  Ali   Örnek ', true, 70, 1), ('11111111-0000-4000-8000-000000000001', 'Veli Örnek', false, null, 0)$q$)::text, '2');
select test.esit('kadro (018): yedek girişi güncellenir',
  test.satir($q$update public.mac_oyunculari set giris_dk = 70 where mac_id = '11111111-0000-4000-8000-000000000001' and oyuncu = 'Veli Örnek'$q$)::text, '1');
select test.hata_bekle('kadro (018): ilk 11''de giriş dakikası olmaz',
  $q$insert into public.mac_oyunculari (mac_id, oyuncu, ilk11, giris_dk) values ('11111111-0000-4000-8000-000000000001', 'Can Örnek', true, 10)$q$, 'giriş dakikası olmaz');
select test.hata_bekle('kadro (018): çıkış girişten önce olamaz',
  $q$insert into public.mac_oyunculari (mac_id, oyuncu, giris_dk, cikis_dk) values ('11111111-0000-4000-8000-000000000001', 'Can Örnek', 60, 50)$q$, 'önce olamaz');
select test.hata_bekle('kadro (018): en çok 2 sarı',
  $q$insert into public.mac_oyunculari (mac_id, oyuncu, ilk11, sari) values ('11111111-0000-4000-8000-000000000001', 'Can Örnek', true, 3)$q$, 'mac_oyunculari_kart');
select test.hata_bekle('kadro (018): aynı maçta aynı oyuncu iki kez olmaz',
  $q$insert into public.mac_oyunculari (mac_id, oyuncu, ilk11) values ('11111111-0000-4000-8000-000000000001', 'Ali Örnek', true)$q$, 'duplicate');
reset role;
set role anon;
select test.esit('gol anı (018): ziyaretçi asist ve aralığı okur',
  (select asist || '|' || video_baslangic_sn || '-' || video_bitis_sn from public.goller where id = '22222222-0000-4000-8000-000000000001'), 'Veli Örnek|12-30');
select test.esit('kadro (018): ziyaretçi maç kadrosunu okur (ad boşlukları temizlenmiş)',
  (select string_agg(oyuncu || ':' || coalesce(giris_dk::text, '-') || ':' || coalesce(cikis_dk::text, '-'), ',' order by oyuncu) from public.mac_oyunculari where mac_id = '11111111-0000-4000-8000-000000000001'), 'Ali Örnek:-:70,Veli Örnek:70:-');
select test.hata_bekle('kadro (018): ziyaretçi kadro yazamaz',
  $q$insert into public.mac_oyunculari (mac_id, oyuncu, ilk11) values ('11111111-0000-4000-8000-000000000001', 'Sahte Oyuncu', true)$q$, 'permission denied|row-level security');
reset role;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-000000017a01', false);
set role authenticated;
select test.hata_bekle('kadro (018): taraftar kadro yazamaz (RLS)',
  $q$insert into public.mac_oyunculari (mac_id, oyuncu, ilk11) values ('11111111-0000-4000-8000-000000000001', 'Sahte Oyuncu', true)$q$, 'row-level security');
select test.esit('kadro (018): taraftar kartı değiştiremez (0 satır)',
  test.satir($q$update public.mac_oyunculari set sari = 0 where mac_id = '11111111-0000-4000-8000-000000000001'$q$)::text, '0');
select test.esit('gol anı (018): taraftar asisti değiştiremez (0 satır)',
  test.satir($q$update public.goller set asist = null where id = '22222222-0000-4000-8000-000000000001'$q$)::text, '0');
reset role;
select test.esit('kadro (018): TRUNCATE yetkisi yok',
  (not has_table_privilege('anon', 'public.mac_oyunculari', 'TRUNCATE') and not has_table_privilege('authenticated', 'public.mac_oyunculari', 'TRUNCATE'))::text, 'true');
update public.goller set asist = null, video_baslangic_sn = null, video_bitis_sn = null where id = '22222222-0000-4000-8000-000000000001';
delete from public.mac_oyunculari;
