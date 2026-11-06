-- =====================================================================
-- Çorum Taraftar: ÖRNEK (UYDURMA) VERİ
-- Buradaki rakipler, oyuncular ve haberler tamamen hayal ürünüdür.
-- Gerçek yayına geçmeden önce yönetim panelinden silebilirsiniz.
-- Migration'lardan SONRA bir kez çalıştırın (tekrar çalıştırmak çoğaltmaz).
-- =====================================================================

-- Maçlar: tarihler bugüne göre hesaplanır (Türkiye saati)
insert into public.maclar (id, rakip, tarih, stadyum, ic_saha, organizasyon, corum_skor, rakip_skor, durum) values
  ('11111111-0000-4000-8000-000000000001', 'Örnekköy Spor',
   (date_trunc('day', now() at time zone 'Europe/Istanbul') - interval '14 days' + interval '19 hours') at time zone 'Europe/Istanbul',
   'Çorum Şehir Stadyumu', true, 'Lig (örnek)', 2, 1, 'bitti'),
  ('11111111-0000-4000-8000-000000000002', 'Kurgu Gençlik',
   (date_trunc('day', now() at time zone 'Europe/Istanbul') - interval '7 days' + interval '16 hours') at time zone 'Europe/Istanbul',
   'Kurgu Arena', false, 'Lig (örnek)', 1, 1, 'bitti'),
  ('11111111-0000-4000-8000-000000000003', 'Deneme FK',
   (date_trunc('day', now() at time zone 'Europe/Istanbul') + interval '5 days' + interval '19 hours') at time zone 'Europe/Istanbul',
   'Çorum Şehir Stadyumu', true, 'Lig (örnek)', null, null, 'planlandi'),
  ('11111111-0000-4000-8000-000000000004', 'Hayal Belediyespor',
   (date_trunc('day', now() at time zone 'Europe/Istanbul') + interval '12 days' + interval '14 hours 30 minutes') at time zone 'Europe/Istanbul',
   'Hayal İlçe Stadı', false, 'Kupa (örnek)', null, null, 'planlandi')
on conflict (id) do nothing;

-- Goller (sadece Çorum golleri). Videolar: açık lisanslı "Big Buck Bunny" örnekleri.
-- 014: videolu golde video kaynağı zorunlu; .mp4 yalnız sitenin deposundan (gol-videolari kovası, panelden yüklenir)
insert into public.goller (id, mac_id, oyuncu, dakika, ek_dakika, penalti, video_url, video_kaynak, aciklama) values
  ('22222222-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001',
   'Ali Örnek', 23, null, false, 'https://www.youtube.com/watch?v=aqz-KE-bpKQ', 'Blender Foundation, CC BY 3.0 (örnek video)',
   'Ceza sahası dışından sert vuruş (örnek).'),
  ('22222222-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001',
   'Mehmet Deneme', 90, 2, true, null, null, 'Uzatmada penaltı (örnek).'),
  ('22222222-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000002',
   'Ali Örnek', 67, null, false, null, null, 'Kafa golü (örnek).')
on conflict (id) do nothing;

-- Haberler: 3 yayında, 1 taslak (taslak herkese görünmez)
insert into public.haberler (id, baslik, ozet, govde, kapak_url, yayinda, yayin_tarihi) values
  ('33333333-0000-4000-8000-000000000001',
   'Örnek haber: Kırmızı-siyahlılar sahasında kazandı',
   'Örnekköy Spor karşısında 2-1''lik galibiyet (uydurma haber).',
   E'Bu bir örnek haberdir; içerik tamamen uydurmadır.\n\nTakım ilk yarıyı 1-0 önde kapattı. İkinci yarıda rakip beraberliği yakalasa da uzatmada gelen penaltı golüyle üç puan Çorum''da kaldı.\n\nTribünler maç boyunca takımı yalnız bırakmadı.',
   'assets/img/ornek-kapak-1.svg', true, now() - interval '13 days'),
  ('33333333-0000-4000-8000-000000000002',
   'Örnek haber: Deplasmanda bir puan',
   'Kurgu Gençlik deplasmanından 1-1 beraberlikle dönüldü (uydurma haber).',
   E'Bu bir örnek haberdir.\n\nZorlu deplasmanda takım geriye düştükten sonra Ali Örnek''in kafa golüyle beraberliği yakaladı.',
   'assets/img/ornek-kapak-2.svg', true, now() - interval '6 days'),
  ('33333333-0000-4000-8000-000000000003',
   'Örnek haber: Deneme FK maçı biletleri satışta',
   'Haftaya oynanacak iç saha maçının biletleri satışa çıktı (uydurma haber).',
   E'Bu bir örnek haberdir.\n\nBilet fiyatları ve satış noktaları kulübün resmî kanallarından takip edilmelidir. Bu uygulama resmî değildir.',
   null, true, now() - interval '1 day'),
  ('33333333-0000-4000-8000-000000000004',
   'Taslak: henüz yayınlanmamış örnek haber',
   null,
   'Bu taslak sadece yöneticilere görünür.',
   null, false, null)
on conflict (id) do nothing;

-- 013: manşet (ana sayfanın açılış görseli), gol kapakları ve süreleri
update public.haberler set manset = true where id = '33333333-0000-4000-8000-000000000003' and not manset;
-- (kapaklar sitede gerçekten bulunan örnek görseller; sql-testleri.js seed'deki her assets/ yolunun var olduğunu denetler)
update public.goller set kapak_url = 'assets/img/ornek-kapak-1.svg', sure_sn = 42
  where id = '22222222-0000-4000-8000-000000000001' and kapak_url is null;
update public.goller set kapak_url = 'assets/img/ornek-kapak-2.svg', sure_sn = 38
  where id = '22222222-0000-4000-8000-000000000003' and kapak_url is null;

-- 013: kadro (uydurma oyuncular; gerçek kadro kulübün açıkladığı listeden panelle girilir, fotoğraf yalnız izinle)
insert into public.oyuncular (id, ad, forma_no, mevki, sira) values
  ('55555555-0000-4000-8000-000000000001', 'Kemal Kaleci', 1, 'kaleci', 1),
  ('55555555-0000-4000-8000-000000000002', 'Yedek Eldiven', 12, 'kaleci', 2),
  ('55555555-0000-4000-8000-000000000003', 'Deniz Defans', 4, 'defans', 1),
  ('55555555-0000-4000-8000-000000000004', 'Barış Bek', 2, 'defans', 2),
  ('55555555-0000-4000-8000-000000000005', 'Orhan Ortasaha', 8, 'orta_saha', 1),
  ('55555555-0000-4000-8000-000000000006', 'Mehmet Deneme', 10, 'orta_saha', 2),
  ('55555555-0000-4000-8000-000000000007', 'Ali Örnek', 9, 'forvet', 1),
  ('55555555-0000-4000-8000-000000000008', 'Fikret Forvet', 11, 'forvet', 2)
on conflict (id) do nothing;

-- 013: sakatlık güncellemeleri. YALNIZ kulübün resmî açıklamasındaki bilgi, kaynak zorunlu (KVKK m.6: sağlık verisi)
-- 014: Sakat / Durumu belirsiz kaydında kaynak bağlantısı zorunlu; aciklama yalnız yöneticinin iç notu (sitede görünmez, tanı yazılmaz)
insert into public.sakatliklar (id, oyuncu_id, durum, aciklama, kaynak, kaynak_url, kaynak_tarihi, beklenen_donus, yayinda) values
  ('66666666-0000-4000-8000-000000000001', '55555555-0000-4000-8000-000000000003', 'sakat',
   'İç not: kulüp açıklaması 1. paragraf (örnek).', 'Kulüp açıklaması (örnek)', 'https://ornek.test/aciklama/1',
   (now() at time zone 'Europe/Istanbul')::date - 1, (now() at time zone 'Europe/Istanbul')::date + 14, true),
  ('66666666-0000-4000-8000-000000000002', '55555555-0000-4000-8000-000000000008', 'cezali',
   'İç not: sarı kart cezası (örnek).', 'TFF disiplin kurulu (örnek)', null, (now() at time zone 'Europe/Istanbul')::date - 2, null, true),
  ('66666666-0000-4000-8000-000000000003', '55555555-0000-4000-8000-000000000004', 'belirsiz',
   'Taslak: yayınlanmadı, ziyaretçi görmez (örnek).', 'Kulüp açıklaması (örnek)', 'https://ornek.test/aciklama/3', null, null, false)
on conflict (id) do nothing;

-- 014: haber kaynağı, maç notu (bilet / yayın / kapı saati)
update public.haberler set kaynak = 'Kulüp açıklaması (örnek)', kaynak_url = 'https://ornek.test/biletler'
  where id = '33333333-0000-4000-8000-000000000003' and kaynak is null;
-- 015: bilet haberi "kadro / transfer / sakatlık / bilet haberi" (kaynak zorunlu)
update public.haberler set kaynak_gerekli = true where id = '33333333-0000-4000-8000-000000000003' and not kaynak_gerekli;
-- 015: uygulama sahibinin adı kullanıcı adı olarak alınamaz (assets/ayar.js SAHIP_ADI ile aynı yazın; parantez içi atılır)
insert into public.ayrilmis_adlar (ad) values ('Mert (uygulama sahibi)') on conflict (anahtar) do nothing;
update public.maclar set mac_notu = 'Biletler kulübün resmî satış noktalarında. Kapılar maçtan 2 saat önce açılır (örnek).'
  where id = '11111111-0000-4000-8000-000000000003' and mac_notu is null;

-- =====================================================================
-- İLK YÖNETİCİYİ ATAMAK
-- 1) Sitede giris.html sayfasından kendinize normal bir hesap açın.
-- 2) Supabase panelinde SQL Editor'ü açın ve aşağıdaki satırı kendi
--    e-posta adresinizle çalıştırın:
--
--   update public.profiles set role = 'admin'
--   where id = (select id from auth.users where email = 'sizin@epostaniz.com');
--
-- 3) Siteden çıkış yapıp tekrar girin; üst menüde "Yönetim" görünür.
-- =====================================================================
