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
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'yonetici@ornek.test', '{"kullanici_adi":"yonetici"}'),
  ('bbbbbbbb-0000-4000-8000-000000000001', 'ayse@ornek.test', '{"kullanici_adi":"ayse_19","role":"admin"}'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'burak@ornek.test', '{"kullanici_adi":"AYSE_19"}'),
  ('bbbbbbbb-0000-4000-8000-000000000003', 'can@ornek.test', '{"kullanici_adi":"<b>can</b>"}');

select test.esit('kayıt: her kullanıcıya profil açılır', (select count(*) from public.profiles)::text, '4');
select test.esit('kayıt: metadata içindeki role=admin yok sayılır',
  (select role from public.profiles where id = 'bbbbbbbb-0000-4000-8000-000000000001'), 'taraftar');
select test.esit('kayıt: aynı kullanıcı adı (büyük/küçük harf) sonek alır',
  (select kullanici_adi from public.profiles where id = 'bbbbbbbb-0000-4000-8000-000000000002'), 'AYSE_19_1');
select test.esit('kayıt: kullanıcı adındaki HTML karakterleri temizlenir',
  (select kullanici_adi from public.profiles where id = 'bbbbbbbb-0000-4000-8000-000000000003'), 'bcanb');

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
select test.esit('anon: depodaki görseli okuyabilir', (select count(*) from storage.objects where bucket_id = 'haber-gorselleri')::text, '1');
reset role;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-000000000001', false);
set role authenticated;
select test.esit('sahibi gizlenen kendi yorumunu görür', (select count(*) from public.yorumlar where metin like 'Harika%')::text, '1');
reset role;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-000000000002', false);
set role authenticated;
select test.esit('başka taraftar gizli yorumu göremez', (select count(*) from public.yorumlar where gizli)::text, '0');
reset role;

-- ---------------------------------------------------------------- hesap silme
select set_config('request.jwt.claim.sub', '', false);
delete from auth.users where id = 'bbbbbbbb-0000-4000-8000-000000000003';
select test.esit('hesap silinince profil gider', (select count(*) from public.profiles where id = 'bbbbbbbb-0000-4000-8000-000000000003')::text, '0');
select test.esit('hesap silinince yorumları gider', (select count(*) from public.yorumlar where kullanici_id = 'bbbbbbbb-0000-4000-8000-000000000003')::text, '0');
