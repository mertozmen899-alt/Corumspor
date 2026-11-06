# AGENTS.md — Çorumspor Taraftar (corumspor)

Çorum FK taraftarları için bağımsız, mobil öncelikli taraftar web uygulaması + yerel sponsor modülü. Tasarım: `docs/TASARIM.md` (013 mobil tasarım).
Bu dosya bu depoda çalışan yapay zekâ ajanları ve geliştiriciler içindir. Sahip için kurulum: `README.md`.

## Yığın
- Düz HTML + vanilla JS **ES modülleri** + CSS. **Derleme adımı yok**, statik dosya olarak yayınlanır (Cloudflare Pages önerilir).
- Supabase: Postgres + RLS + Auth (e-posta/şifre) + Storage.
- `supabase-js` **sitenin kendisinden** (KVKK: CDN'e istek yok), sabit sürüm + SRI: `assets/vendor/supabase-js-2.45.4/supabase.js` (npm `@supabase/supabase-js@2.45.4` paketindeki `dist/umd/supabase.js` ile bayt bayt aynı; yanında `591.supabase.js` parçası ve `LICENSE.txt`). Her HTML'de `<script defer src="assets/vendor/supabase-js-2.45.4/supabase.js" integrity="sha384-…">`. Sürüm değişirse: npm tarball'ından al, integrity'yi yenile (`openssl dgst -sha384 -binary dosya | openssl base64 -A`), klasör adını ve testteki SRI'yi güncelle.
- Tek ayar dosyası: `assets/ayar.js` (SUPABASE_URL, SUPABASE_ANON_KEY, SITE_ADI, TAKIM_ADI, AMBLEM_DOSYASI, SAHIP_ADI, ILETISIM_EPOSTA; son ikisi künye ve gizlilik sayfasında `data-ayar` ile yazılır).
- Tek supabase istemcisi: `assets/istemci.js` (`import { supabase } from './istemci.js'`). Reklam modülü de bunu kullanır.
- Migration'lar: `supabase/migrations/NNN_ad.sql`, sırayla: `001_temel_sema` → `002_depolama` → `010_reklamlar` → `011_denetim_duzeltmeleri` → `012_denetim_2` → `013_tasarim`. Örnek veri: `supabase/seed.sql`. Uygulanmış dosyalar (001/002/010/011/012/013) yeniden yazılmaz: değişiklik = yeni migration. 013 yeniden çalıştırılabilir; testler 010/012'yi yeniden uygular, bu yüzden 013 onların fonksiyonlarının dönüş tipini değiştirmez (yalnız `aktif_reklam`'ı drop/create eder ve 012'den sonra uygulanır).
- Saf kurallar (JS = SQL aynası): `assets/kurallar.js` (kullanıcı adı ayrılmış mı, haber kapağı adresi, yorum sınırları, `sezonAdi` Temmuz–Haziran, `SAKATLIK_DURUMLARI`, `sakatlikHatalari`) ↔ `012_denetim_2.sql` + `013_tasarim.sql`; ortak örnekler `testler/kurallar-ornekleri.json`. Reklam kuralları: `assets/reklam/reklam-mantik.js` ↔ `010`/`012`.
- Görsel yükleme: `assets/gorsel-kucult.js` (yüklemeden önce canvas ile küçült + WebP). Haber/gol kapağı ve oyuncu fotoğrafı: `<uuid>-1600/-800/-480.webp` üç kopya (`kapakKaynagi()` `-1600.webp`'den srcset kurar; sitenin kendi `assets/img/` fotoğraflarında kopya genişlikleri `foto-kaynaklari.js` `genislikler`'den: olmayan dosya istenmez). `kapakKaynagi(url, { kutu })` `sizes`'ı etkin DPR ≤ 2 ile hesaplar; depodaki kapaklar `crossorigin="anonymous"`; `<img>`'i `kapakGorseli()` kurar (kırık görselde yer tutucu). Reklam: 1200 kutu + `-k.webp` küçük kopya (480 / kare 192).
- Yayın: `node araclar/yayin-hazirla.js` → `yayin/` (yalnız HTML + `assets/` + `_headers` + `robots.txt` + `.nojekyll` + `sw.js` + `manifest.webmanifest`; geliştirici klasörü girerse durur; `ayar.js`'te yer tutucu kaldıysa **çıkış 1** (bilerek taslak: `YAYIN_TASLAK=1`; testler bunu kullanır); gerçek SUPABASE_URL varsa sayfalara `preconnect` ekler: kaynak HTML'de yok, tek ayar kuralı). Yalnız `yayin/` kopyasında: meta CSP `_headers`'a taşınır ve `*.supabase.co` proje adresine daraltılır, iç bağlantılar uzantısız olur (`goller.html` → `goller`, `index.html` → `./`; Cloudflare 308'i yok), `sw.js`'te `SURUM` içerik özeti ve `DOSYALAR` bütün kabuk. Paylaşım görseli: `node araclar/og-olustur.js` → `assets/img/og-1200x630.png`. Ana ekran simgeleri: `node araclar/simge-olustur.js` → `assets/logo/simge-*.png`, `apple-touch-icon-180.png`.
- Yazı tipleri sitede: **3 dosya** `assets/fonts/oswald-700-tr.woff2`, `source-sans-3-400-tr.woff2`, `source-sans-3-700-tr.woff2` (latin + Türkçe alt küme, toplam ~37 KB, SIL OFL). `@font-face` `stil.css` başında, `font-display: optional` + metrik eşlenmiş yedek yüzler (`Oswald Yedek`, `Source Sans Yedek`). Üçü de `<link rel=preload>` (en çok 3 dosya / 60 KB; test denetler). Dış font isteği yok. "→" alt kümede yok (sistem yazı tipine düşer).
- Service worker `sw.js` (kök): kabuk + son herkese açık veri; auth, rpc, POST, yönetim ve YouTube asla önbelleğe alınmaz; opak yanıt saklanmaz; localhost ve `?sahte=1`'de kaydedilmez (`ortak.js swKaydet`). Sürüm `SURUM`: depoda `'gelistirme'` (sayfa ağdan), yayında içerik özeti (sayfa + JS aynı sürümün önbelleğinden: atomik). Kurulum `cache: 'reload'`; sayfa anahtarı uzantısız/sorgusuz (Cloudflare 308'e dayanıklı; test 308 yapan sunucuyla çevrimdışı dener); veri 40, görsel 60 kayıtla sınırlı.
- PWA: kökte `manifest.webmanifest` (standalone, `#0B0B0B`, 192/512 + maskable); her sayfada `<link rel="manifest">` + `apple-touch-icon` (yeni sayfa = ikisi de).
- Son görülen veri: `assets/onbellek.js` (`sonVeri` / `sonVeriYaz`, localStorage `son-veri-v1`, ≤30 KB): ana sayfa ve gol arşivi önce bunu anında çizer (`data-durum="onbellek"`), sonra ağdan tazeler.
- Sayfa HTML'leri elle düzenlenir; ortak parçalar (üst bar, alt menü, künye, CSP, manifest, 3 font preload, `fetchpriority="high"` supabase-js, modulepreload listesi) her sayfada aynı olmalı: modül içe aktarması değişirse o sayfanın `<link rel="modulepreload">` listesini de güncelleyin (performans testi denetler).

## Klasör haritası
```
index.html        ana sayfa: hero (MAÇ GÜNÜ / maçtan sonraki 36 saat MAÇ SONU skoru / manşet / en yeni haber) → "Sıradaki:" şeridi → Son dakika akışı (sayfalı, sponsor kartları) →
                  "Gol arşivinden" şeridi → Sıradaki maç kartı → "Kim yok?" kutusu
goller.html       gol arşivi: Sezon (Temmuz–Haziran, "2026-27") ve Rakip filtreleri (fieldset/legend + radyo, ?sezon=&rakip=)
gol.html?id=      gol: video facade (dokununca youtube-nocookie / mp4 preload=none), bilgi, WhatsApp paylaş, yorumlar (gol_id)
takim.html        Takım: sekmeler #kadro | #sakatlik | #fikstur (paneller id="panel-<ad>": adres parçası öğeye denk gelmez)
profil.html       misafir: giriş/kayıt; üye: yorumlarım, (yönetici) Yönetim paneli bağlantısı, onaylı çıkış (dialog); tema radyoları
haber.html?id=    haber ayrıntısı (geri düğmesi) + haber_sonu reklamı + yorumlar
mac.html?id=      maç ayrıntısı (geri düğmesi) + mac_sponsoru ("Maçın sponsoru" + "Uygulama sponsoru · Çorum FK'nın sponsoru değildir") + goller + yorumlar
maclar.html       eski adres: takim.html#fikstur'a yönlendirir (meta refresh)
giris.html        giriş / kayıt (satır içi alan hataları, şifre göster, Şifremi unuttum, kayıttan sonra hoş geldin)
sifre.html        yeni şifre (resetPasswordForEmail bağlantısı buraya döner; updateUser)
kurallar.html     topluluk kuralları; kaynaklar.html fotoğraf kaynakları; cevrimdisi.html service worker yedeği
yonetim.html      yönetim paneli (Haberler, Maçlar, Goller, Kadro, Sakatlıklar, Yorumlar, Reklamlar)
gizlilik.html     gizlilik / KVKK aydınlatma metni (veri sorumlusu ayar.js'ten; "Son güncelleme"; avukat hatırlatması yalnız README'de)
sw.js             service worker (yukarı bakın)
_headers          Cloudflare Pages başlıkları + önbellek kuralları (bir yola tek Cache-Control; test denetler)
robots.txt        herkese açık; noindex sayfalar Disallow EDİLMEZ (noindex görülsün diye)
araclar/          yayin-hazirla.js (Cloudflare yapı komutu), og-olustur.js + og/og-sablon.html (paylaşım görseli); yayına çıkmaz
assets/
  ayar.js           Supabase adresi + anon anahtar + AMBLEM_DOSYASI + SAHIP_ADI + ILETISIM_EPOSTA (TEK ayar dosyası)
  istemci.js        tek supabase istemcisi (+ localhost'ta ?sahte=1 test modu)
  ortak.js          h(), simge(), tarih (Europe/Istanbul), oturum, sayfaBaslat() (amblem, künye, geri, alt menü klavye gizleme,
                    yapışkan çubuk scroll-padding, SW), duyur()/uyar() (kalıcı #durum / #uyari), videoFasad(), kapakKaynagi(),
                    fotoAtfi(), cevrimdisiKutusu(), hata metinleri ("sen" dili)
  tema.js           tema: head'de defer'siz; Profil'deki input[name=tema] radyolarını bağlar (data-theme + localStorage 'tema')
  onbellek.js       son görülen herkese açık veri (localStorage son-veri-v1)
  gol-kart.js       golKarti() (16:9 kapak a.video-kart ya da a.gol-satir → gol.html?id=), macEtiketi()
  foto-kaynaklari.js paketli fotoğrafların yazar/lisans/kaynak listesi (atıf yazısı ve kaynaklar.html bundan)
  yorumlar.js       yorum bileşeni (haber_id | mac_id | gol_id; şikâyet; men notu); sayfalar tembel import eder
  reklam-yukle.js   reklam yuvası yükleyici: reklamOnYukle(alan), reklamYuvalariniDoldur(kok)
  sayfa/*.js        her sayfanın modülü (ana, goller, gol, takim, profil, haber, mac, giris, sifre, metin, yonetim)
  reklam/           REKLAM MODÜLÜ: reklam.js (ziyaretçi kartı), reklam-mantik.js (saf mantık, SQL'in aynası),
                    reklam.css (boş; kart stilleri stil.css 17. bölümde), yonetim-reklamlar.js (panel), yonetim-reklamlar.css
  stil.css          TÜM tasarım belirteçleri (açık + koyu), @font-face ve bileşen stilleri (reklam kartı dahil)
  yonetim.css       yalnız yönetim paneli
  fonts/            3 woff2 + OFL lisansları
  logo/             amblem-yedek.svg (özgün "ÇT" işareti) + README.txt (resmî amblem yalnız yazılı izinle)
  img/              hero ve örnek kapak fotoğrafları (-480/-800/-1600 WebP; Saat Kulesi dikey 480/828/1080, yatay 828/1280/1600),
                    KAYNAKLAR.txt (lisanslar, CC BY-SA türev kuralı), og görseli
supabase/migrations/001_temel_sema.sql   tablolar, is_admin(), tetikleyiciler, RLS
supabase/migrations/002_depolama.sql     haber-gorselleri kovası
supabase/migrations/010_reklamlar.sql    reklamlar, reklam_olaylari, aktif_reklam/reklam_olay_kaydet/reklam_raporu, reklam-gorselleri kovası
supabase/migrations/011_denetim_duzeltmeleri.sql  haber-gorselleri listesi yalnız yönetici, TRUNCATE yetkisi kaldırıldı (docs/DENETIM-2026-11-05.md)
supabase/migrations/012_denetim_2.sql   reklam dakika sınırı + reklam_sinir_dakikalari + reklam_raporu.supheli_dakika; yorum: eposta_onayli(),
                                        günde 50, aynı metin 10 dk, düzenleme 30 dk / dakikada 10 (yorum_duzenlemeleri); profiles.role sütun
                                        yetkisi kapalı + benim_profilim(); kullanici_adi_ayrilmis(); haber_kapak_gecerli() + haberler_kapak_kaynagi
supabase/migrations/013_tasarim.sql     haberler.manset/kapak_kaynak, goller.kapak_url/sure_sn, yorumlar.gol_id (tek hedef), profiles.engelli +
                                        engelli_mi()/engelli_kullanicilar(), yorum_sikayetleri, oyuncular, sakatliklar (kaynak zorunlu),
                                        reklam: dugme_metni/telefon/gorsel_metni/gorsel_kucuk_url/sektor_onayi, aktif_reklamlar(p_alan, p_adet)
                                        (farklı firmalar), reklam_olay_kaydet yöneticiyi saymaz ('yonetici'), daha fazla ayrılmış ad
supabase/seed.sql                        uydurma örnek veri (manşet, gol kapağı, 8 oyuncu, 3 sakatlık: 1 taslak)
docs/REKLAM.md      reklam modülü kuralları ve kararları (modülün ENTEGRASYON.md'si, entegre hâli)
docs/TASARIM.md     tasarım rehberi (belirteçler, bileşenler, ekranlar, 013), docs/kontrast.py (013 çiftleri dahil; test çalıştırır)
docs/ekran/         onizleme-ana-360/430.png, onizleme-goller-360/430.png (görünüm testi her çalışmada yeniler)
docs/FIKIRLER.md    reklam/sponsorluk için sonraki fikirler (öneri belgesi; D "indirim kuponu" Mert kararıyla çıkarıldı)
docs/ilk-reklam/    ilk reklam veren Narçil Cafe (varsayılan: bağlantı yok): NASIL.md, narcil-1200x628/600x600 (+480x251/192x192) webp+png, şablon + olustur.js
testler/
  calistir.js                 TEK giriş: bütün testler (9 grup)
  tasarim-testleri.js         tasarım/erişilebilirlik (T-xx): yer işaretleri, alt menü, klavye/odak örtme, 44 px, %200 yazı, filtreler,
                              facade, yorumlar, profil penceresi, Takım, sponsor sıklığı/tekrar/boş/geç yerleşme, şifre, men, çevrimdışı,
                              kontrast (TASARIM_SADECE="bölüm" ile tek bölüm)
  performans-testleri.js      kısmalı (Yavaş 4G / Hızlı 3G + 4× CPU) LCP/CLS, istek sayısı, modulepreload, YouTube'suz açılış,
                              yazı tipleri (çizerek Türkçe harf), hero, mp4 preload, SW kapalı, _headers çakışması
  uygulama.test.mjs           uygulama birim (node:test): kurallar.js, görsel küçültme hesabı, yayın hazırlama
  kurallar-ornekleri.json     kullanıcı adı / kapak örnekleri: JS ve SQL aynı sonucu vermeli (SQL karşılaştırması reklam/sql.test.mjs'te)
  sql-testleri.js             migration'lar (hepsi) + seed + RLS testleri (Postgres ya da PGlite)
  sql/00_supabase_taklit.sql  test için auth/storage/rol taklidi (SADECE Supabase'in sağladıkları)
  sql/10_yardimcilar.sql, sql/20_rls_testleri.sql
  tarayici-testleri.js        uygulama sayfaları (Playwright) + reklam sözleşmesi (sahte reklam modülüyle)
  reklam-tarayici-testleri.js reklam: tam uygulamada uçtan uca + bileşen sağlamlığı + CSP/404 denetimi
  ekran-testleri.js           görünüm: 390/1280 px × açık/koyu + 360×740 / 430×932 (ana, goller) + 390 yeni ekranlar; ekran görüntüleri
  reklam/mantik.test.mjs      reklam saf mantığı (node:test)
  reklam/sql.test.mjs         reklam SQL (node:test, gerçek 001+002+010+011+012 şeması, kurulu Postgres gerekir) + uygulama kuralları SQL=JS
  reklam/baglanti-ornekleri.json  bağlantı/telefon/görsel örnekleri: JS ve SQL aynı sonucu vermeli
  reklam/gorseller/           test reklam görselleri
  sahte-supabase.js           sahte supabase-js (uygulama + reklam tabloları, RPC'ler, depo; localStorage'da; örnek reklam: Narçil Cafe);
                              012 kurallarını da taklit eder (assets/kurallar.js); onaysız hesap: onaysiz@ornek.test;
                              test kolu localStorage 'sahte_eposta_onayi' = 'gerekli' ("Confirm email" açık gibi),
                              'sahte_reklam_gecikme' (ms; akış reklam sorgusunu geciktirir), 013 tabloları/RPC'leri, şifre sıfırlama
                              (sifre.html?sahte=1#sahte_kurtarma=<e-posta> kurtarma oturumu açar)
  ekran/                      ekran görüntüleri
  package.json                sadece PGlite (isteğe bağlı)
```

## Testleri çalıştırma
```
node testler/calistir.js              # hepsi; çıkış kodu 0 = hepsi geçti
node --test testler/uygulama.test.mjs # kurallar, görsel küçültme, yayın hazırlama
node testler/sql-testleri.js          # sadece veritabanı
node testler/tarayici-testleri.js     # sadece uygulama sayfaları
node testler/reklam-tarayici-testleri.js
node testler/ekran-testleri.js
node testler/tasarim-testleri.js
node testler/performans-testleri.js
node --test testler/reklam/mantik.test.mjs
node --test testler/reklam/sql.test.mjs
```
- **SQL**: kurulu Postgres bulunursa (`PG_BIN`, `pg_config --bindir`, `/usr/lib/postgresql/*/bin`) geçici bir küme açar, siler. Root ise `runuser -u postgres`. Uygulama SQL testleri Postgres yoksa PGlite'a düşer (`npm install --prefix testler`); **reklam SQL testleri psql ister** (PGlite yok). Gerçek Supabase projesine asla bağlanmaz.
- **Tarayıcı**: `require('playwright')` gerekir (kurulu Chromium; `playwright install` çalıştırmayın). Küçük bir Node sunucusu sayfaları `?sahte=1` ile açar; 127.0.0.1 dışındaki her istek engellenir ya da taklit edilir (firma sayfaları, `https://sahte.supabase.co/storage/...` reklam görselleri). Tarayıcı saat dilimi bilerek `America/New_York`.
- **404 yok:** tarayıcı ve görünüm testleri aynı kökenden 404 dönen her isteği hata sayar; `uygulama.test.mjs` `sahte-supabase.js`'teki her `assets/` yolunu ve fotoğraf kopyasını denetler.
- Sahte istemcide test kolu: `localStorage.sahte_saat_kayma` (ms) reklam tarafının sunucu saatini ileri alır.
- Sahte veri örnek reklamla başlar (Narçil Cafe: ana_akis, haber_sonu, M1 maçında "Maçın sponsoru"; görselleri testlerde `docs/ilk-reklam/`'dan sunulur). Boş durumla başlaması gereken testler veri kurulmadan `localStorage.sahte_ornek_reklam = 'yok'` yazar (`tarayici-testleri.js`, reklam uçtan uca akışı).
- **İndirim yok:** maça özel / maç günü indirim ya da kupon kampanyası yapılmaz (Mert kararı, 5 Kasım 2026). Örnek veri, test ve belgelerde indirim/kupon metni kullanmayın.
- Yeni özellik = yeni test. RLS değişikliği = `testler/sql/20_rls_testleri.sql` ya da `testler/reklam/sql.test.mjs`'e test.

## Kurallar
1. **Arayüz Türkçe.** Bütün metinler, hata mesajları, tetikleyici mesajları Türkçe. `<html lang="tr">` her sayfada zorunlu (büyük harfte i → İ).
2. **Her tabloda RLS.** Yeni tablo = `enable row level security` + politikalar + test. Yönetici kontrolü **sadece** `public.is_admin()` ile (SECURITY DEFINER, STABLE, `search_path = ''`). İstemcideki rol kontrolü sadece kolaylıktır.
3. **Kullanıcı rolünü kendisi değiştiremez** (`profil_koruma`); kayıtta metadata'daki rol yok sayılır. İlk yönetici SQL Editor'den atanır.
4. **Satır içi sır yok.** Depoda sadece anon (public) anahtar olabilir, o da sadece `assets/ayar.js`'te. `service_role` hiçbir dosyaya yazılmaz.
5. **HTML enjeksiyonu yok.** Kullanıcı/veritabanı içeriği `innerHTML` ile basılmaz; `h()` / `textContent`. Görsel `guvenliGorsel()`, video `videoFasad()` (dokunmadan iframe yok).
6. **Tarih/saat Türkiye saati** (`Europe/Istanbul`, `Intl`). Panelde datetime-local girdisi Türkiye saati sayılır.
7. **Bağımsızdır:** her sayfada `main`'in ilk öğesi `.resmi-degil` şeridi "Bağımsız taraftar uygulaması"; "Çorum FK'nın resmî uygulaması değildir" cümlesi sayfa içinde YALNIZ alt bilgi künyesinde ve `gizlilik.html`'de (başka yerde tekrarlanmaz). İki istisna (paylaşım önizlemesini yalnız gören kişi için, başkan 2. tur): her sayfanın `og:description`'ı bu cümleyle biter ve paylaşım görseli (`assets/img/og-1200x630.png`) rozetinde yazar (test denetler). Takımdan "Çorum FK" diye söz edilir (açıklamalar dahil); "Çorumspor" yalnız uygulama adında. Uygulama adı "Çorumspor Taraftar", işaret özgün "ÇT" (kulüp kısaltması "ÇFK" kullanılmaz); "Resmî", "Arca", "Biz Anadoluyuz", "Kırmızı Şimşekler", kulüp sponsor logoları, çift başlı kartal KULLANILMAZ. Taraftara dönük metinler sıcak "sen" diliyle. Resmî amblem yalnız kulübün yazılı izniyle (`assets/logo/README.txt`).
8. **CSP** her HTML'de `<meta http-equiv="Content-Security-Policy">` (kaynakta; yayında `yayin-hazirla.js` meta'yı çıkarıp `_headers`'a başlık olarak, tam Supabase adresiyle yazar). Yeni dış kaynak gerekiyorsa bütün HTML'lerde güncelleyin. Yazı tipi/görsel/betik için dış alan adı eklemeyin (fontlar yerel). Satır içi `<script>` ve satır içi stil yok: `script-src 'self'` (supabase-js de yerel), `style-src 'self'` ('unsafe-inline' yok), `img-src 'self' https://*.supabase.co data: blob:` (YouTube küçük resmi kullanılmıyor; videolar `frame-src` ile gömülür). CSP bütün sayfalarda aynı; `frame-ancestors` meta'da çalışmadığı için `_headers`'ta. Yeni sayfa = aynı CSP + alt bilgide `gizlilik.html` bağlantısı (test denetler). Tarayıcıda yeni bir şey saklarsanız `gizlilik.html` tablosuna ekleyin.
9. Bağımlılık yok, derleme yok. CDN betiği eklenecekse sabit sürüm + SRI.
10. **Tasarım tek yerde:** renk/yazı tipi/ölçü `assets/stil.css` başındaki `:root` belirteçleri (açık + koyu; koyu tema hem `prefers-color-scheme` hem `[data-theme=dark]`). Sabit renk yazmayın; yeni renk çifti = `docs/kontrast.py`'ye satır (AA 4.5:1 metin, 3:1 arayüz; tasarım testi çalıştırır) + `docs/TASARIM.md`. Listeler iskeletle açılır, aynı yükseklikte yer tutar (CLS < 0,05); hata/çevrimdışı durumunda `cevrimdisiKutusu` ("Tekrar dene"), boş sayfa yok. Sonsuz animasyon yok (canlı rozeti sabit). Dokunma hedefi ≥ 44 px. Canlı bölge yalnız kalıcı `#durum` / `#uyari` (listelerde `aria-live` yok). Sayılar (skor, dakika, rapor) Source Sans 3 `tabular-nums`; başlık/menü/düğme Oswald.
11. HTML'de tek stil dosyası `stil.css` (yönetimde ek olarak `yonetim.css` ve reklam paneli CSS'i). `tema.js` head'de defer'siz. Alt menü: `nav.alt-nav#alt-nav[aria-label="Ana gezinme"]`, 4 bağlantı (Ana Sayfa · Gol Arşivi · Takım · Profil); kök sayfada `aria-current="page"`, detay sayfasında ait olduğu bölümde `aria-current="true"`; DOM sırası main → nav → footer.

## Veritabanı sözleşmesi (reklam modülü buna dayanır, ADLARI DEĞİŞTİRMEYİN)
- `public.profiles(id uuid PK → auth.users, kullanici_adi, role ∈ {'taraftar','admin'}, created_at, engelli)`; `role='admin'` yönetici demektir. `engelli` (013) yalnız yönetici değiştirir (kendisi için değil); engelli hesap yorum yazamaz.
  012: anon/authenticated yalnız `id, kullanici_adi, created_at` sütunlarını okur (`select role` / `select *` → permission denied).
  İstemci kendi rolünü `rpc('benim_profilim')` ile alır (`assets/ortak.js` `oturumAl`); yönetici kontrolü yine yalnız `is_admin()`.
  Gömmelerde `profiles(kullanici_adi)` yazın, `profiles(*)` değil.
- `public.is_admin()` → boolean (anon/authenticated çalıştırabilir).
- `public.maclar(id uuid PK, rakip text, tarih timestamptz, ...)`; `reklamlar.mac_id → maclar(id) on delete cascade`.
- `haberler`, `goller`, `yorumlar` uygulamanındır (bkz. `001_temel_sema.sql`).
- Reklam modülü: `reklamlar`, `reklam_olaylari`, `reklam_sinir_dakikalari` (012; hepsi yalnız yönetici okur; ziyaretçi sadece RPC ile),
  `aktif_reklam(p_alan, p_mac_id)`, `aktif_reklamlar(p_alan, p_adet)` (013: akış için farklı firmalar; mac_sponsoru'nda boş), `reklam_olay_kaydet(p_reklam_id, p_tur, p_sayfa_ziyaret_id, p_alan, p_mac_id, p_sekme_id)`,
  `reklam_raporu(p_baslangic_tarih, p_bitis_tarih)` (yalnız yönetici; 012'den beri son sütun `supheli_dakika`), kova `reklam-gorselleri` (2 MB, jpeg/png/webp). 013: yöneticinin olayı kaydedilmez (`reklam_olay_kaydet` 'yonetici' döner); istemci de yöneticide sayım başlatmaz (`data-sayim="yonetici"`).

## Reklam yuvaları sözleşmesi
Yuvalar boştur; kendi dolgusu, kenarlığı, min-height'ı yoktur. Reklam yoksa hiç yer kaplamaz (modül yuvayı `hidden` yapar); akışta boş sponsor `li`'si DOM'dan **silinir** (`#akis[data-sponsor-durum="tamam"]`). `data-reklam-sira` N. sıradaki FARKLI firmayı ister; akış yuvasında `gecGelirseAtla`: yuva açıldıktan 150 ms sonra gelen kart, yuva görünür alanda/üstünde ya da odak yuvanın altındaysa eklenmez.

| Sayfa | Yer | Öğe |
|---|---|---|
| `index.html` | akışta 3. haberden sonra, sonra her 8 haberde bir (en çok 3); `ana.js` kurar | `<li class="akis-sponsor"><div class="reklam-yuvasi" data-reklam-alan="ana_akis" data-reklam-sira="N"></div></li>` |
| `haber.html` | haber gövdesinden sonra, yorumlardan önce | `<div class="reklam-yuvasi" data-reklam-alan="haber_sonu"></div>` |
| `mac.html` | maç başlığı/skorun altında, gol ve yorumlardan önce | `<div class="reklam-yuvasi" data-reklam-alan="mac_sponsoru" data-mac-id="<uuid>"></div>` |
| `yonetim.html` | "Reklamlar" sekmesi | `<section id="reklamlar-sekmesi" data-modul="reklamlar"></section>` |

- `assets/reklam-yukle.js` → `reklamYuvalariniDoldur(kok)`: `import('./reklam/reklam.js')`, sonra `reklamIstemciAyarla(supabase)` (paylaşılan istemci) ve her yuva için `await reklamYerlestir(el, { alan, macId })`. Modül yüklenemezse/hata verirse sessizce geçer (`data-reklam-durum` = `modul-yok` / `hata` / `tamam`; hata veren yuva boşaltılır). Sayfalar yuvayı DOM'a koyduktan sonra bunu çağırır.
- Reklam modülünün istemci bulma sırası: `ops.istemci` → `reklamIstemciAyarla` → `import('../istemci.js').supabase`. İkinci istemci açılmaz; `?sahte=1` modu kendiliğinden sahte istemciye gider.
- Panel: `yonetim.js` sekme ilk açıldığında `assets/reklam/yonetim-reklamlar.js` yükler, `default` / `kur` / `mount` arar ve `(el, { supabase, oturum })` çağırır (modül `kur` dışa aktarır). Yoksa "Reklam modülü henüz eklenmedi." notu. Sonra `document`'ta `reklamlar-sekmesi-hazir` olayı.
- Kart etiketleri (DOM metni, kartın ilk öğesi `p.reklam-etiket` > `.reklam-etiket-metin`; nokta `aria-hidden`): ana_akis "Sponsor", haber_sonu "Reklam", maça özel sponsor "Maçın sponsoru" (+ `.reklam-alt-etiket` MAC_SPONSORU_NOTU), genel sponsor "Sponsor" (CSS büyük harf). Kartın yalnız düğmesi bağlantıdır; adı "Sponsor: <firma> – <düğme> (yeni sekmede açılır)". Görsel `alt` = `gorsel_metni` (yoksa boş).
- Kart her zaman normal akışta (position static, z-index yok, açılır pencere yok): videonun ya da yorumların üstüne binemez.
- Gösterim: kartın ≥%50'si ≥1 sn görünürse, sayfa ziyareti başına reklam başına 1. Tıklama: yeni sekme, `rel="sponsored noopener"`, kayıt beklemeden; aynı **sekmede** (sessionStorage `reklam-sekme-kimligi`, rastgele, yalnız tıklama için) aynı reklama 30 dk içinde tekrar sayılmaz; sayfa ziyareti başına en fazla 5 tıklama.
- Reklam görseli yalnız `https://<proje>.supabase.co/storage/v1/object/public/reklam-gorselleri/...` (JS `gorselAdresiGecerli` = SQL `reklam_gorsel_gecerli`). Bağlantı: https, wa.me, whatsapp://send (JS `baglantiGecerli` = SQL `reklam_baglanti_gecerli`). İkisini birlikte değiştirin, örnekleri `testler/reklam/baglanti-ornekleri.json`'a ekleyin.
- Sınırlar (firma 80, metin 160, öncelik 0-100, 5 tıklama, 30 dk; 012: reklam başına dakikada 120 gösterim / 30 tıklama) hem `reklam-mantik.js` `SINIRLAR`'da hem SQL'de (test karşılaştırır).
- Ayrıntı ve kararlar: `docs/REKLAM.md`.

## Bilinen sınırlar / sonraki işler
- Kullanıcı adını değiştirme ve hesabı silme arayüzü yok (RLS izin veriyor).
- axe-core bu ortamda kurulu değil: erişilebilirlik testleri (tasarim-testleri.js) kuralları tek tek ölçer; otomatik axe taraması (T-01) yok.
- Yasaklı sektör onayı istemcide zorunlu; sunucu yalnız `sektor_onayi`'nı saklar (yayına alma kontrolü panelde).
- Kapak görseli olmayan YouTube golünde kapak olarak gri yer tutucu çıkar (i.ytimg.com bilerek kullanılmaz).
- Gol videosu dosya yükleme yok; sadece YouTube ya da https .mp4 adresi.
- Canlı maçta skor anlık güncellenmez (Supabase Realtime eklenebilir).
- Yüklenip kullanılmayan reklam görselleri depoda kalır (temizlik işi yok).
- Sahte modda (`?sahte=1`) elle açılan tarayıcıda reklam görselleri (örnek Narçil reklamı dahil) görünmez (adresleri `sahte.supabase.co`; yalnız testte sunulur).
- Kötü niyetli biri her istekte yeni ziyaret kimliği üreterek gösterim şişirebilir (IP tutulmadığı için). 012: reklam başına dakikada 120 gösterim / 30 tıklama sınırı ve rapordaki "Sınıra takılan dakika" bunu sınırlar ve görünür kılar, tam önlemez (sayılar yaklaşık; `docs/REKLAM.md`). Daha sıkısı için IP saklamayan bir Edge Function hız sınırı eklenebilir (`docs/FIKIRLER.md` bölüm 4).
- `assets/istemci.js` sahte modda `../testler/sahte-supabase.js`'i yükler; `testler/` yayına çıkmadığı için bu yalnız yerelde (localhost) çalışır.
