# AGENTS.md — Çorumspor Taraftar (corumspor)

Çorum FK için gayriresmî, mobil öncelikli taraftar web uygulaması + yerel reklam/sponsorluk modülü.
Bu dosya bu depoda çalışan yapay zekâ ajanları ve geliştiriciler içindir. Sahip için kurulum: `README.md`.

## Yığın
- Düz HTML + vanilla JS **ES modülleri** + CSS. **Derleme adımı yok**, statik dosya olarak yayınlanır (Cloudflare Pages önerilir).
- Supabase: Postgres + RLS + Auth (e-posta/şifre) + Storage.
- `supabase-js` CDN'den, **sabit sürüm + SRI**: `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js` (her HTML'de `<script defer ... integrity=...>`). Sürüm değişirse integrity hash'i de değişmeli (`openssl dgst -sha384 -binary dosya | openssl base64 -A`).
- Tek ayar dosyası: `assets/ayar.js` (SUPABASE_URL, SUPABASE_ANON_KEY, SITE_ADI, TAKIM_ADI, AMBLEM_DOSYASI).
- Tek supabase istemcisi: `assets/istemci.js` (`import { supabase } from './istemci.js'`). Reklam modülü de bunu kullanır.
- Migration'lar: `supabase/migrations/NNN_ad.sql`, sırayla: `001_temel_sema` → `002_depolama` → `010_reklamlar`. Örnek veri: `supabase/seed.sql`.
- Yazı tipleri sitede (`assets/fonts/`, Oswald + Source Sans 3, latin + latin-ext woff2, SIL OFL). Dış font isteği yok.

## Klasör haritası
```
index.html        ana sayfa: sıradaki maç + haber akışı ("Daha fazla"), 3. haberden sonra ana_akis reklamı
haber.html?id=    haber ayrıntısı + haber_sonu reklamı + yorumlar
maclar.html       fikstür ve sonuçlar
mac.html?id=      maç ayrıntısı + mac_sponsoru reklamı + goller + yorumlar
goller.html       gol arşivi (YouTube nocookie gömme / mp4)
giris.html        giriş / kayıt
yonetim.html      yönetim paneli (Haberler, Maçlar, Goller, Yorumlar, Reklamlar)
assets/
  ayar.js           Supabase adresi + anon anahtar + AMBLEM_DOSYASI (TEK ayar dosyası)
  istemci.js        tek supabase istemcisi (+ localhost'ta ?sahte=1 test modu)
  ortak.js          h() DOM üretici, tarih (Europe/Istanbul), oturum, üst menü, amblem, video, hata metinleri
  tema.js           açık/koyu tema düğmesi (head'de, defer'siz; data-theme + localStorage 'tema')
  yorumlar.js       yorum bileşeni
  reklam-yukle.js   reklam yuvası yükleyici: reklam/reklam.js'i yükler, reklamIstemciAyarla(supabase), yuvaları doldurur
  sayfa/*.js        her sayfanın modülü
  reklam/           REKLAM MODÜLÜ: reklam.js (ziyaretçi kartı), reklam-mantik.js (saf mantık, SQL'in aynası),
                    reklam.css, yonetim-reklamlar.js (panel; export kur / reklamYonetimiBaslat), yonetim-reklamlar.css
  stil.css          TÜM tasarım belirteçleri (açık + koyu) ve bileşen stilleri; reklam modülü renkleri de buradan
  fonts/            woff2 + fontlar.css + OFL lisansları
  logo/             amblem-yedek.svg (özgün yedek işaret) + README.txt (resmî amblem yalnız yazılı izinle)
  img/              örnek kapak görselleri
supabase/migrations/001_temel_sema.sql   tablolar, is_admin(), tetikleyiciler, RLS
supabase/migrations/002_depolama.sql     haber-gorselleri kovası
supabase/migrations/010_reklamlar.sql    reklamlar, reklam_olaylari, aktif_reklam/reklam_olay_kaydet/reklam_raporu, reklam-gorselleri kovası
supabase/seed.sql                        uydurma örnek veri
docs/REKLAM.md      reklam modülü kuralları ve kararları (modülün ENTEGRASYON.md'si, entegre hâli)
docs/TASARIM.md     tasarım rehberi (+ 8. bölüm: uygulamaya aktarım), docs/kontrast.py
docs/FIKIRLER.md    reklam/sponsorluk için sonraki fikirler (öneri belgesi)
testler/
  calistir.js                 TEK giriş: bütün testler (6 grup)
  sql-testleri.js             migration'lar (hepsi) + seed + RLS testleri (Postgres ya da PGlite)
  sql/00_supabase_taklit.sql  test için auth/storage/rol taklidi (SADECE Supabase'in sağladıkları)
  sql/10_yardimcilar.sql, sql/20_rls_testleri.sql
  tarayici-testleri.js        uygulama sayfaları (Playwright) + reklam sözleşmesi (sahte reklam modülüyle)
  reklam-tarayici-testleri.js reklam: tam uygulamada uçtan uca + bileşen sağlamlığı + CSP/404 denetimi
  ekran-testleri.js           görünüm: 390/1280 px × açık/koyu, ekran görüntüleri
  reklam/mantik.test.mjs      reklam saf mantığı (node:test)
  reklam/sql.test.mjs         reklam SQL (node:test, gerçek 001+002+010 şeması, kurulu Postgres gerekir)
  reklam/baglanti-ornekleri.json  bağlantı/telefon/görsel örnekleri: JS ve SQL aynı sonucu vermeli
  reklam/gorseller/           test reklam görselleri
  sahte-supabase.js           sahte supabase-js (uygulama + reklam tabloları, RPC'ler, depo; localStorage'da)
  ekran/                      ekran görüntüleri
  package.json                sadece PGlite (isteğe bağlı)
```

## Testleri çalıştırma
```
node testler/calistir.js              # hepsi; çıkış kodu 0 = hepsi geçti
node testler/sql-testleri.js          # sadece veritabanı
node testler/tarayici-testleri.js     # sadece uygulama sayfaları
node testler/reklam-tarayici-testleri.js
node testler/ekran-testleri.js
node --test testler/reklam/mantik.test.mjs
node --test testler/reklam/sql.test.mjs
```
- **SQL**: kurulu Postgres bulunursa (`PG_BIN`, `pg_config --bindir`, `/usr/lib/postgresql/*/bin`) geçici bir küme açar, siler. Root ise `runuser -u postgres`. Uygulama SQL testleri Postgres yoksa PGlite'a düşer (`npm install --prefix testler`); **reklam SQL testleri psql ister** (PGlite yok). Gerçek Supabase projesine asla bağlanmaz.
- **Tarayıcı**: `require('playwright')` gerekir (kurulu Chromium; `playwright install` çalıştırmayın). Küçük bir Node sunucusu sayfaları `?sahte=1` ile açar; 127.0.0.1 dışındaki her istek engellenir ya da taklit edilir (firma sayfaları, `https://sahte.supabase.co/storage/...` reklam görselleri). Tarayıcı saat dilimi bilerek `America/New_York`.
- Sahte istemcide test kolu: `localStorage.sahte_saat_kayma` (ms) reklam tarafının sunucu saatini ileri alır.
- Yeni özellik = yeni test. RLS değişikliği = `testler/sql/20_rls_testleri.sql` ya da `testler/reklam/sql.test.mjs`'e test.

## Kurallar
1. **Arayüz Türkçe.** Bütün metinler, hata mesajları, tetikleyici mesajları Türkçe. `<html lang="tr">` her sayfada zorunlu (büyük harfte i → İ).
2. **Her tabloda RLS.** Yeni tablo = `enable row level security` + politikalar + test. Yönetici kontrolü **sadece** `public.is_admin()` ile (SECURITY DEFINER, STABLE, `search_path = ''`). İstemcideki rol kontrolü sadece kolaylıktır.
3. **Kullanıcı rolünü kendisi değiştiremez** (`profil_koruma`); kayıtta metadata'daki rol yok sayılır. İlk yönetici SQL Editor'den atanır.
4. **Satır içi sır yok.** Depoda sadece anon (public) anahtar olabilir, o da sadece `assets/ayar.js`'te. `service_role` hiçbir dosyaya yazılmaz.
5. **HTML enjeksiyonu yok.** Kullanıcı/veritabanı içeriği `innerHTML` ile basılmaz; `h()` / `textContent`. Görsel `guvenliGorsel()`, video `videoOgesi()`.
6. **Tarih/saat Türkiye saati** (`Europe/Istanbul`, `Intl`). Panelde datetime-local girdisi Türkiye saati sayılır.
7. **Resmî değildir:** her sayfada `.resmi-degil` şeridi ve alt bilgide "Resmî Çorum FK uygulaması değildir". Uygulama adı "Çorumspor Taraftar"; "Resmî", "Arca", kulüp sponsor logoları, çift başlı kartal KULLANILMAZ. Resmî amblem yalnız kulübün yazılı izniyle (`assets/logo/README.txt`).
8. **CSP** her HTML'de `<meta http-equiv="Content-Security-Policy">`. Yeni dış kaynak gerekiyorsa bütün HTML'lerde güncelleyin. Yazı tipi/görsel/betik için dış alan adı eklemeyin (fontlar yerel). Satır içi `<script>` yok (`script-src` 'unsafe-inline' içermez).
9. Bağımlılık yok, derleme yok. CDN betiği eklenecekse sabit sürüm + SRI.
10. **Tasarım tek yerde:** renk/yazı tipi/ölçü `assets/stil.css` başındaki `:root` belirteçleri (açık + koyu). Sabit renk yazmayın; yeni renk çifti = kontrast hesabı (`docs/kontrast.py`, AA 4.5:1 metin, 3:1 arayüz) + `docs/TASARIM.md` 8. bölüme satır. Sayılar (skor, dakika, rapor) Source Sans 3 `tabular-nums`; başlık/menü/düğme Oswald.
11. HTML'de CSS sırası: `fonts/fontlar.css` → (reklam CSS'leri) → `stil.css` (son). `tema.js` head'de defer'siz.

## Veritabanı sözleşmesi (reklam modülü buna dayanır, ADLARI DEĞİŞTİRMEYİN)
- `public.profiles(id uuid PK → auth.users, kullanici_adi, role ∈ {'taraftar','admin'}, created_at)`; `role='admin'` yönetici demektir.
- `public.is_admin()` → boolean (anon/authenticated çalıştırabilir).
- `public.maclar(id uuid PK, rakip text, tarih timestamptz, ...)`; `reklamlar.mac_id → maclar(id) on delete cascade`.
- `haberler`, `goller`, `yorumlar` uygulamanındır (bkz. `001_temel_sema.sql`).
- Reklam modülü: `reklamlar`, `reklam_olaylari` (ikisi de yalnız yönetici okur/yazar; ziyaretçi sadece RPC ile),
  `aktif_reklam(p_alan, p_mac_id)`, `reklam_olay_kaydet(p_reklam_id, p_tur, p_sayfa_ziyaret_id, p_alan, p_mac_id, p_sekme_id)`,
  `reklam_raporu(p_baslangic_tarih, p_bitis_tarih)` (yalnız yönetici), kova `reklam-gorselleri` (2 MB, jpeg/png/webp).

## Reklam yuvaları sözleşmesi
Yuvalar boştur; kendi dolgusu, kenarlığı, min-height'ı yoktur. Reklam yoksa hiç yer kaplamaz (modül yuvayı `hidden` yapar).

| Sayfa | Yer | Öğe |
|---|---|---|
| `index.html` | haber akışında 3. haberden sonra, bir kez | `<div class="reklam-yuvasi" data-reklam-alan="ana_akis"></div>` |
| `haber.html` | haber gövdesinden sonra, yorumlardan önce | `<div class="reklam-yuvasi" data-reklam-alan="haber_sonu"></div>` |
| `mac.html` | maç başlığı/skorun altında, gol ve yorumlardan önce | `<div class="reklam-yuvasi" data-reklam-alan="mac_sponsoru" data-mac-id="<uuid>"></div>` |
| `yonetim.html` | "Reklamlar" sekmesi | `<section id="reklamlar-sekmesi" data-modul="reklamlar"></section>` |

- `assets/reklam-yukle.js` → `reklamYuvalariniDoldur(kok)`: `import('./reklam/reklam.js')`, sonra `reklamIstemciAyarla(supabase)` (paylaşılan istemci) ve her yuva için `await reklamYerlestir(el, { alan, macId })`. Modül yüklenemezse/hata verirse sessizce geçer (`data-reklam-durum` = `modul-yok` / `hata` / `tamam`; hata veren yuva boşaltılır). Sayfalar yuvayı DOM'a koyduktan sonra bunu çağırır.
- Reklam modülünün istemci bulma sırası: `ops.istemci` → `reklamIstemciAyarla` → `import('../istemci.js').supabase`. İkinci istemci açılmaz; `?sahte=1` modu kendiliğinden sahte istemciye gider.
- Panel: `yonetim.js` sekme ilk açıldığında `assets/reklam/yonetim-reklamlar.js` yükler, `default` / `kur` / `mount` arar ve `(el, { supabase, oturum })` çağırır (modül `kur` dışa aktarır). Yoksa "Reklam modülü henüz eklenmedi." notu. Sonra `document`'ta `reklamlar-sekmesi-hazir` olayı.
- Kart etiketleri: ana_akis/haber_sonu "Reklam", maça özel sponsor "Maçın sponsoru", genel sponsor "Sponsor" (CSS büyük harf).
- Kart her zaman normal akışta (position static, z-index yok, açılır pencere yok): videonun ya da yorumların üstüne binemez.
- Gösterim: kartın ≥%50'si ≥1 sn görünürse, sayfa ziyareti başına reklam başına 1. Tıklama: yeni sekme, `rel="sponsored noopener"`, kayıt beklemeden; aynı **sekmede** (sessionStorage `reklam-sekme-kimligi`, rastgele, yalnız tıklama için) aynı reklama 30 dk içinde tekrar sayılmaz; sayfa ziyareti başına en fazla 5 tıklama.
- Reklam görseli yalnız `https://<proje>.supabase.co/storage/v1/object/public/reklam-gorselleri/...` (JS `gorselAdresiGecerli` = SQL `reklam_gorsel_gecerli`). Bağlantı: https, wa.me, whatsapp://send (JS `baglantiGecerli` = SQL `reklam_baglanti_gecerli`). İkisini birlikte değiştirin, örnekleri `testler/reklam/baglanti-ornekleri.json`'a ekleyin.
- Sınırlar (firma 80, metin 160, öncelik 0-100, 5 tıklama, 30 dk) hem `reklam-mantik.js` `SINIRLAR`'da hem SQL'de.
- Ayrıntı ve kararlar: `docs/REKLAM.md`.

## Bilinen sınırlar / sonraki işler
- Şifre sıfırlama sayfası yok. Kullanıcı adını değiştirme arayüzü yok (RLS izin veriyor).
- Gol videosu dosya yükleme yok; sadece YouTube ya da https .mp4 adresi.
- Canlı maçta skor anlık güncellenmez (Supabase Realtime eklenebilir).
- Yüklenip kullanılmayan reklam görselleri depoda kalır (temizlik işi yok).
- Sahte modda (`?sahte=1`) elle açılan tarayıcıda reklam görselleri görünmez (adresleri `sahte.supabase.co`; yalnız testte sunulur).
- Kötü niyetli biri her istekte yeni ziyaret kimliği üreterek gösterim şişirebilir (IP tutulmadığı için); gerekirse IP saklamayan bir Edge Function hız sınırı eklenebilir (`docs/FIKIRLER.md` bölüm 4).
