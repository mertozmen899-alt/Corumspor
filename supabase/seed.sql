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
insert into public.goller (id, mac_id, oyuncu, dakika, ek_dakika, penalti, video_url, aciklama) values
  ('22222222-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001',
   'Ali Örnek', 23, null, false, 'https://www.youtube.com/watch?v=aqz-KE-bpKQ', 'Ceza sahası dışından sert vuruş (örnek).'),
  ('22222222-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001',
   'Mehmet Deneme', 90, 2, true, null, 'Uzatmada penaltı (örnek).'),
  ('22222222-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000002',
   'Ali Örnek', 67, null, false,
   'https://download.blender.org/peach/bigbuckbunny_movies/BigBuckBunny_320x180.mp4', 'Kafa golü (örnek).')
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
