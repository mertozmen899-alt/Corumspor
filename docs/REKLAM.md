# Reklam / sponsorluk modülü

> Bu belge modülün kendi entegrasyon notudur (`ENTEGRASYON.md`), uygulamaya **entegre edilmiş** hâline göre güncellendi.
> Entegrasyonda değişen her şey aşağıda **(entegrasyon)** diye işaretli. Uygulamanın genel kuralları: `AGENTS.md`.

Çorumspor taraftar uygulaması için yerel reklam modülü. Supabase (Postgres + RLS) ve düz JavaScript (derleme yok).
Üç yerleşim var: **ana sayfa akışı**, **haber sonu**, **maç sponsoru**.

> Uygulamanın her sayfasında üstteki şeritte ve alt bilgide **"Resmî Çorum FK uygulaması değildir."** yazar.

## 0. 013 mobil tasarımla gelen değişiklikler (5 Kasım 2026)

- **Etiket:** ana sayfa akışında kartın ilk öğesi gerçek metin **"Sponsor"** (`p.reklam-etiket` > `span.nokta[aria-hidden]` +
  `.reklam-etiket-metin`; CSS `content` ile metin yok). Haber sonu "Reklam", maça özel "Maçın sponsoru" + alt satır
  `MAC_SPONSORU_NOTU` = "Uygulama sponsoru · Çorum FK'nın sponsoru değildir", genel maç sponsoru "Sponsor".
- **Erişilebilir ad:** kartın tamamı bağlantı değil; yalnız düğme (`a.reklam-eylem.reklam-baglanti`). Adı
  "Sponsor: <firma> – <düğme yazısı> (yeni sekmede açılır)" (WhatsApp'ta "(WhatsApp açılır)"); isteğe bağlı ikinci düğme `a.reklam-ara`
  (`tel:`). Görsel `alt` = panelde girilen **görseldeki yazı** (`gorsel_metni`), yoksa `alt=""`.
- **Akış:** `aktif_reklamlar(p_alan, p_adet)` FARKLI firmaları (adı `lower(btrim)` ile) öncelik sırasıyla döndürür; `ana.js` ilk
  yuvayı 3. haberden sonra, sonrakileri 8 haberde bir açar (en çok 3; `data-reklam-sira`); o sırada firma yoksa yuva **silinir**.
  Geç gelen kart (yuva açıldıktan 150 ms sonra), yuva görünür alanda ya da üstündeyse veya odak yuvanın altındaysa eklenmez.
  `reklamOnYukle('ana_akis')` sorguyu haber sorgusuyla paralel başlatır. `aktif_reklamlar` yoksa (eski veritabanı) `aktif_reklam`'a düşer.
- **Yönetici sayılmaz:** `reklam_olay_kaydet` yönetici çağırırsa doğrulamadan sonra kaydetmeden `'yonetici'` döner; istemci de
  `is_admin()` doğruysa sayımı hiç başlatmaz (`data-sayim="yonetici"`). Panel raporunda "Yöneticilerin bakışları sayılmaz".
- **Rapor:** **Firma** seçimi (`#ry-rapor-firma`); CSV yalnız bir firma seçiliyken iner (`reklam-raporu_<firma>_<aralık>.csv`),
  sütunlar `Firma;Alan;Maç;Dönem;Gösterim;Tıklama;Tıklama oranı (%);Sınıra takılan dakika` (genel maç sponsorunda Maç = "Tüm maçlar").
  Telefonda toplam satırı hücre başlıklarıyla etiketli (`data-baslik`).
- **Form:** metin 160'ı aşınca sessizce kesilmez: sayaç "N/160 · X karakter fazla" (kırmızı) ve kaydetmez; 120 altı önerilir.
  Yeni alanlar: düğme yazısı (2-24, boşsa "Ayrıntılar"), "Ara" telefonu (`+90…` saklanır), görseldeki yazı (≤ 200), küçük görsel
  (`gorsel_kucuk_url`, panel `-k.webp` üretir: yatay 480, kare 192). **Yasaklı sektör kontrolü** (bahis, alkol, tütün/nargile, kulüp
  adı/amblemi) işaretlenmeden "Yayına al" çalışmaz (`sektor_onayi` saklanır; kontrol panelde). WhatsApp sonucu 390 px'te taşmaz.
- **CSS:** kart stilleri artık `assets/stil.css` 17. bölümde; `assets/reklam/reklam.css` boş bir yer tutucudur (eski bağlantılar kırılmasın).
  Akış kartı kompakt (solda 112 px görsel, ≤ 200 px yükseklik).
- **Örnek reklam (Narçil Cafe):** varsayılan **bağlantı yok** (menü sitesinde nargile görünüyor; `docs/ilk-reklam/NASIL.md`).

## 1. Dosyalar

| Dosya | Ne işe yarar | Uygulamaya kopyalanır mı |
|---|---|---|
| `supabase/migrations/010_reklamlar.sql` | Tablolar, RLS, doğrulama tetikleyicisi, RPC'ler, depo (bucket) | Evet → `supabase/migrations/` |
| `assets/reklam/reklam.js` | Ziyaretçi bileşeni: `reklamYerlestir`, `reklamYuvalariniDoldur`, `akisaReklamEkle` | Evet → `assets/reklam/` |
| `assets/reklam/reklam-mantik.js` | Saf mantık: seçim kuralı, durum, İstanbul saati, bağlantı/WhatsApp, CSV | Evet |
| `assets/reklam/reklam.css` | (013'ten beri boş; kart stili `assets/stil.css` 17. bölüm) | Evet |
| `assets/reklam/yonetim-reklamlar.js` | Yönetim paneli: `kur(el, { supabase })` (entegrasyon) ve `reklamYonetimiBaslat(bolum, supabase)` | Evet |
| `assets/reklam/yonetim-reklamlar.css` | Panel stili | Evet |
| `yonetim-reklamlar.html`, `ornek-*.html`, `ornek/`, modülün kendi sahte istemcisi ve sunucusu | Modülün tek başına denendiği örnekler | **Hayır** (entegrasyon: gerçek uygulama sayfaları kullanılıyor) |

`assets/reklam/` içindeki dosyalar birbirine göreli yolla bağlıdır.
**(entegrasyon)** Testlerin yeri: `testler/reklam/mantik.test.mjs`, `testler/reklam/sql.test.mjs`,
`testler/reklam/baglanti-ornekleri.json`, `testler/reklam/gorseller/`, `testler/reklam-tarayici-testleri.js`.
Modülün sahte istemcisi uygulamanınkiyle birleştirildi: `testler/sahte-supabase.js`.

## 2. Migration'ı uygulama

Sıra: **001_temel_sema.sql → 002_depolama.sql → 010_reklamlar.sql** (README, 2. adım).
Önkoşul: uygulamanın **001 temel migration**'ı (`public.profiles`, `public.is_admin()`, `public.maclar`).
Bu dosya `is_admin()`'i ve `profiles`'ı **tanımlamaz, değiştirmez, silmez**; 001 yoksa açık bir hatayla durur.

```bash
# Supabase CLI ile (proje klasöründen)
npx supabase db push
# ya da Supabase panelinde SQL Editor'e 010_reklamlar.sql içeriğini yapıştırıp çalıştırın
```

Dosya tekrar çalıştırılabilir. Oluşanlar:

- `reklamlar` tablosu, `reklam_olaylari` tablosu (ikisinde de RLS açık)
- `aktif_reklam(p_alan, p_mac_id)`: ziyaretçinin TEK okuma kapısı (SECURITY DEFINER, sadece şu an yayında olan 1 reklam)
- `reklam_olay_kaydet(p_reklam_id, p_tur, p_sayfa_ziyaret_id, p_alan, p_mac_id, p_sekme_id)`: TEK yazma kapısı (**entegrasyon:** `p_sekme_id` eklendi, bkz. 6. bölüm)
- `reklam_raporu(p_baslangic_tarih, p_bitis_tarih)`: sadece yönetici (012'den beri son sütun `supheli_dakika`)
- `reklam_baglanti_gecerli(url)`, `reklam_gorsel_gecerli(url)`, `whatsapp_baglantisi(telefon)`, `reklam_mac_uuid(metin)` yardımcıları
- `reklam-gorselleri` deposu (herkese açık kova: görsel public URL ile okunur; listeleme, yükleme, silme yalnız yönetici; en fazla 2 MB, jpeg/png/webp)

Not: Dosyada `revoke truncate ... from anon, authenticated` ve `revoke execute ... from public, anon` satırları var
(TRUNCATE RLS'e takılmaz). Supabase MCP bağlayıcısı `revoke` içeren migration'ı reddederse dosyayı CLI ya da SQL Editor ile uygulayın.

## 3. Yerleşimleri bağlama

**(entegrasyon) Uygulamada nasıl bağlı:** `index.html`, `haber.html`, `mac.html` sayfalarında yalnız `assets/stil.css` yüklenir
(kart stilleri onun içinde, 013). Sayfa modülleri yuvayı
DOM'a koyup `assets/reklam-yukle.js` → `reklamYuvalariniDoldur()` çağırır; yükleyici `reklam.js`'i yükler,
**`reklamIstemciAyarla(supabase)`** ile uygulamanın TEK istemcisini (`assets/istemci.js`) verir ve her yuva için
`reklamYerlestir(el, { alan, macId })` çağırır. Reklam hata verirse yuva boşaltılır, sayfa bozulmaz.

Supabase istemcisi şu sırayla bulunur: `reklamYerlestir(el, { istemci })` → `reklamIstemciAyarla(sb)` →
**(entegrasyon)** uygulamanın paylaşılan istemcisi `assets/istemci.js` (`supabase`; `?sahte=1` test modunda sahte istemci).
Eski "ayar.js'ten istemci ara / `window.reklamIstemci`" yolu kaldırıldı: ikinci istemci oluşmaz.

Yuva öğeleri: `<div class="reklam-yuvasi" data-reklam-alan="..." data-mac-id="..."></div>` (iç boşluk/kenarlık yok).
Reklam yoksa yuva **boş ve gizli** kalır (`hidden`), sayfada boş kutu oluşmaz.

**Ana sayfa akışı (N. haberden sonra):**

```js
const { reklamIstemciAyarla, akisaReklamEkle } = await import('./reklam/reklam.js');
reklamIstemciAyarla(supabase);
akisaReklamEkle(document.querySelector('#haber-listesi'), 3);   // 3. haberden sonra yuva açar ve doldurur
```

Liste `<ul>/<ol>` ise yuva `<li>` olur. Liste yeniden çizilirse aynı çağrıyı tekrar yapın (eski yuvayı kaldırır).

**Haber sonu:**

```html
<article>…</article>
<div class="reklam-yuvasi" data-reklam-alan="haber_sonu"></div>
<section class="yorumlar">…</section>
```
```js
const { reklamYerlestir } = await import('./reklam/reklam.js');
reklamYerlestir(document.querySelector('.reklam-yuvasi[data-reklam-alan="haber_sonu"]'), { alan: 'haber_sonu' });
```

**Maç detayı (skor ve videonun altında):**

```html
<div class="reklam-yuvasi" data-reklam-alan="mac_sponsoru" data-mac-id="<maç uuid>"></div>
```
```js
reklamYerlestir(el, { alan: 'mac_sponsoru', macId: el.dataset.macId });
// ya da sayfadaki tüm yuvalar için: reklamYuvalariniDoldur(document)
```

Önce bu maça özel sponsor, yoksa genel ("Tüm maçlar") sponsor gelir. Etiket: maça özelse "Maçın sponsoru", genelse "Sponsor"; ana sayfa akışında "Sponsor", haber sonunda "Reklam" (013).

Tek sayfa uygulamada sayfa değişirken `reklamKaldir(el)` çağırabilirsiniz (gözlemci ve dinleyiciler temizlenir).

**Davranış:** Kart her zaman normal akıştadır (position/z-index/sticky yok, açılır pencere yok); videonun ya da yorumların üstüne çıkamaz.
Gösterim, kartın en az %50'si en az 1 saniye ekranda kalınca (sekme görünürken) sayılır; aynı sayfa açılışında bir reklam bir kez.
Tıklamada bağlantı yeni sekmede açılır (`rel="sponsored noopener"`), kayıt arka planda gider ve gezinmeyi bekletmez.
Sayfa ziyareti kimliği `crypto.randomUUID()` ile her sayfa yüklemesinde üretilir ve sadece bellekte tutulur (localStorage/çerez yok).
**(entegrasyon)** Ayrıca yalnız tıklama tekrarı için rastgele bir **sekme kimliği** `sessionStorage`'da (`reklam-sekme-kimligi`) durur; bkz. 6. bölüm.

Renkleri temaya bağlamak için `--reklam-zemin`, `--reklam-yazi`, `--reklam-vurgu` vb. değişkenleri ezin;
koyu tema `prefers-color-scheme` ile ya da `<html data-theme="dark">` / `data-tema="koyu"` ile açılır. Kart üstü/altı boşluk: `--reklam-bosluk` (16px).
**(entegrasyon)** Bu eşleme `assets/stil.css` 17. bölümündedir: kart tasarım rehberindeki
(docs/TASARIM.md) altın reklam kartıdır (açık sarı / koyu kahve zemin, kesikli altın kenar, her zaman görünen
"● REKLAM" / "● SPONSOR" / "● MAÇIN SPONSORU" etiketi, nötr siyah-beyaz düğme; kulüp kırmızısı ve Oswald kullanılmaz).

## 4. Yönetim paneli

`yonetim.html` içinde (`stil.css`'ten sonra; 013):

```html
<link rel="stylesheet" href="assets/stil.css">
<link rel="stylesheet" href="assets/reklam/yonetim-reklamlar.css">
<section id="reklamlar-sekmesi" data-modul="reklamlar"></section>
```
**(entegrasyon)** Uygulamanın paneli (`assets/sayfa/yonetim.js`) "Reklamlar" sekmesi ilk açıldığında modülü yükler ve
sözleşmedeki `kur(el, { supabase, oturum })` girişini çağırır. Modüle bu yüzden küçük bir `kur` dışa aktarımı eklendi;
o da `reklamYonetimiBaslat(el, supabase)` çağırır. Doğrudan kullanım için:

```js
import { supabase } from './istemci.js';
const { reklamYonetimiBaslat } = await import('./reklam/yonetim-reklamlar.js');
reklamYonetimiBaslat(document.getElementById('reklamlar-sekmesi'), supabase);
```

Panel kendi içinde oturumu ve `is_admin()`'i de kontrol eder (oturum yoksa küçük bir giriş formu, yönetici değilse "Yetkiniz yok").
Asıl koruma veritabanındadır: panel atlatılsa bile RLS yönetici olmayanın yazmasına izin vermez.

## 5. Uyarlama

- **Yönetici kuralı:** tek yer `public.is_admin()` (001 migration). RLS politikaları, rapor ve depo politikaları hep onu çağırır.
  Kural değişecekse sadece o fonksiyonu değiştirin.
- **Maç tablosu:** `reklamlar.mac_id uuid references public.maclar(id) on delete cascade` (maç silinirse ona özel sponsorluk da silinir; genel sponsora dönüşmez).
  Paneldeki maç listesi `assets/reklam/yonetim-reklamlar.js` başındaki `MAC_AYARI` ile ayarlanır (tablo, sütunlar, tarih sütunu, kaç gün öncesinden, seçenek yazısı).
- **Depo adı:** `DEPO_KOVASI` (aynı dosya) ve migration'daki `reklam-gorselleri`.
- **Sınırlar:** firma adı 80, kısa metin 160 karakter, öncelik 0-100, ziyaret başına 5 tıklama, aynı reklama 30 dk içindeki tekrar tıklama sayılmaz.
  Sayılar hem `reklam-mantik.js` (`SINIRLAR`) hem SQL'de (tetikleyici ve `reklam_olay_kaydet` sabitleri) var; ikisini birlikte değiştirin.

## 6. Kararlar (bilerek yapılanlar)

- **İndirim yok (Mert kararı, 5 Kasım 2026):** reklamlar dışarıdaki işletmelerden gelir; maça özel / maç günü indirim ya da
  kupon kampanyası yapılmaz. "Maçın sponsoru" yerleşimi kalır (indirim teklifi olmadan). Örnek veride, testlerde ve belgelerde indirim metni yok.
- **Seçim kuralı:** yayında ve `baslangic <= şimdi < bitis` (bitiş anında kalkar) → maç sponsorunda maça özel olan önce →
  yüksek `oncelik` → yeni `yayina_alinma` → yeni `created_at` → `id`. Süre dolumu için zamanlanmış iş yok; seçim her istekte `now()` ile süzer.
- **`yayina_alinma`** istemciden alınmaz; durum her `yayinda` olduğunda sunucu yazar. Duraklatıp yeniden yayına almak sırayı tazeler.
- **Geçmiş bitişli reklam yayına alınamaz** (yayındaki bir reklamın tarihi sonradan geçmişe çekilebilir; o zaman kendiliğinden kalkar).
- **(entegrasyon) Sekmeler arası tıklama tekrarı:** sayfa ziyareti kimliği yalnız bellekte olduğu için 30 dk kuralı eskiden yalnız
  aynı sayfa yüklemesinde işliyordu. Karar (sahibin ekibi): sekmeye özel, rastgele, kişisel olmayan bir kimlik `sessionStorage`'da
  tutulur (`reklam-sekme-kimligi`; erişim try/catch içinde, açılamazsa bellekte üretilir) ve **yalnız tıklamada** `p_sekme_id` olarak
  gönderilir. `reklam_olay_kaydet` aynı sekmede aynı reklama 30 dk içindeki tıklamayı (sayfa değişse de) `tekrar` sayar.
  Gösterimler sayfa ziyareti başına kalır; sekme kimliği gösterimde gönderilmez ve saklanmaz. Ziyaret başına 5 tıklama sınırı da
  sayfa ziyaretine göredir. `reklam_olaylari.sekme_id` sütunu yalnız tıklama satırlarında dolar.
- **Tıklama tekrarı:** görev tanımındaki `unique (reklam_id, tur, sayfa_ziyaret_id)` gösterim için kısmi tekil indeks olarak duruyor
  (`where tur = 'gosterim'`). Tıklamada sonradan istenen "aynı ziyarette aynı reklama 30 dk içinde tekrar tıklama sayılmaz" kuralı
  tam tekil kısıtla çelişeceği için tıklama tekrarı `reklam_olay_kaydet` içinde süreyle bakılıyor (danışma kilidiyle sıraya sokuluyor).
- **Sonuç kodları:** `reklam_olay_kaydet` `kaydedildi`, `tekrar` ya da `sinir` döner; reklam yayında değilse, alan/maç tutmuyorsa ya da tür geçersizse hata verir.
- **(012) Dakika sınırı — sayılar YAKLAŞIKTIR:** sayım herkese açık bir RPC'dir ve kişisel veri (IP, kullanıcı, tarayıcı) tutulmadığı
  için, biri her istekte yeni rastgele ziyaret kimliği üreterek gösterim/tıklama gönderirse bu gerçek ziyaretçiden **ayırt edilemez**.
  `012_denetim_2.sql` bunu sınırlar ama tamamen önleyemez: **bir reklama dakikada en fazla 120 gösterim ve 30 tıklama** sayılır
  (bütün ziyaretçiler toplamı; sabitler `reklam_olay_kaydet`'in başında ve `reklam-mantik.js` `SINIRLAR.gosterimDakikaSiniri` /
  `tiklamaDakikaSiniri`'de, test ikisini karşılaştırır). Fazlası `sinir` döner ve **saklanmaz**; o dakika kişisel veri içermeyen
  `reklam_sinir_dakikalari` tablosuna (reklam, dakika, tür, reddedilen sayı; yalnız yönetici okur) yazılır. `reklam_raporu` bunu
  **`supheli_dakika`** (aralıkta sınıra takılan dakika sayısı) olarak verir; panel raporunda ve CSV'de **"Sınıra takılan dakika"** sütunu.
  0'dan büyükse o aralıkta sayı bilerek şişirilmeye çalışılmış olabilir. Sınırın altında kalan sahte trafik (ör. dakikada 100 sahte
  gösterim) yine sayılır: **reklam verene rakamları "yaklaşık" diye verin**, büyük anlaşmalarda rakamı tek başına fiyat esası yapmayın.
  Sitenin gerçek trafiği bu sınırların çok altındadır (bir reklam dakikada 120 kez gerçekten görünmez); trafik büyürse sabitleri iki tarafta birlikte artırın.
  Not: `010_reklamlar.sql` sonradan yeniden çalıştırılırsa bu iki fonksiyon 010'daki hâline döner; ardından `012`'yi de çalıştırın.
- **Rapor:** tarih aralığı Türkiye takvim günüdür, iki gün de dahil. Aralıkta olayı olan ya da yayın tarihi aralıkla kesişen (taslak olmayan) her reklam listelenir.
  `tiklama_orani` yüzde, 2 basamak; gösterim yoksa boş. Rapor yalnız yöneticiye açık (service_role da `is_admin()` false döndüğü için çağıramaz).
- **CSV:** UTF-8 BOM, `;` ayraç, CRLF, oran `2,50` biçiminde (Türkçe Excel sayı olarak okur), başlık `Tıklama oranı (%)`, son sütun `Sınıra takılan dakika` (012).
  `sep=;` satırı bilerek yok (Excel o satırı görünce BOM'u yok sayıp Türkçe harfleri bozuyor). `=`, `+`, `-`, `@` ile başlayan metin hücrelerine `'` eklenir (formül enjeksiyonu).
- **Bağlantılar:** sadece `https://` (alan adı + uzantı; IP, localhost, kullanıcı:şifre@ yok), `https://wa.me/<8-15 rakam>[?text=…]`,
  `whatsapp://send?phone=<rakam>[&text=…]`. Türkçe karakterli alan adı panelde punycode'a çevrilir (ör. `narçil.net` → `https://xn--naril-0ra.net`); ç'li hâli doğrudan yazılırsa JS de SQL de reddeder. Aynı desenler JS ve SQL'de;
  `testler/reklam/baglanti-ornekleri.json` iki tarafta da denenir.
- **WhatsApp numarası:** Türkiye cep (5xx) ve sabit hat (2xx-4xx, ör. Çorum 0364) kabul edilir; `0532…`, `+90…`, `0090…`, `90…` biçimleri `905…`'e çevrilir.
- **(entegrasyon) Görsel adresi:** yalnız projenin kendi deposu:
  `https://<proje>.supabase.co/storage/v1/object/public/reklam-gorselleri/<yol>` (yolda `..` yok, sorgu dizesi yok).
  Başka bir alan adındaki görsel ziyaretçinin IP'sini üçüncü tarafa sızdırabilir (izleme pikseli) ve sonradan değiştirilebilirdi.
  Eski `http://localhost` / `http://127.0.0.1` geliştirme izni üretim migration'ından **kaldırıldı**; testler depo adresleri kullanır.
  Kural hem `reklam-mantik.js` (`gorselAdresiGecerli`) hem SQL'de (`reklam_gorsel_gecerli`) aynı; örnekler
  `testler/reklam/baglanti-ornekleri.json` → `gorsel`. Supabase'e kendi alan adınızı bağlarsanız iki deseni birlikte güncelleyin.
  Görsel seçilir seçilmez depoya yüklenir; form kaydedilmeden vazgeçilirse görsel depoda kalır (temizlik ayrı iş).
- **Önizleme** gerçek kart işaretlemesini `reklamKartiOlustur(reklam, { onizleme: true })` ile çizer: gözlemci yok, RPC yok, bağlantı gezinmez.
  Kart genişliği kapsayıcıya göre (container query) değiştiği için 600 px ve 360 px çerçeveler gerçek masaüstü/telefon düzenini gösterir.
- **Tarih:** veritabanında `timestamptz`; panel `datetime-local` alanlarını İstanbul saati olarak okur/yazar (`Intl`, `timeZone: 'Europe/Istanbul'`; sabit +3 yok).
  Tarayıcının kendi saat dilimi önemsizdir (tarayıcı testi bilerek New York saat diliminde çalışır).
- **KVKK:** olay tablosunda kullanıcı kimliği, IP, tarayıcı bilgisi yok; sadece rastgele sayfa ziyareti kimliği, alan, maç ve zaman
  (tıklamada ayrıca rastgele sekme kimliği: kişisel veri değildir, kimseyle eşleştirilemez, tarayıcı sekme kapanınca siler,
  çerez/localStorage kullanılmaz).
  Bunun bedeli: kötü niyetli biri her istekte yeni ziyaret kimliği üreterek gösterim şişirebilir. 012'den beri reklam başına dakika
  sınırı bunu sınırlar ve raporda görünür kılar (yukarıda "Dakika sınırı"); tam önlem değildir. Daha sıkı gerekirse IP'yi saklamadan
  bellek içi hız sınırı yapan bir Edge Function öne konabilir (bu modülde yok).
- **(012) Görsel küçültme:** panel seçilen görseli yüklemeden önce tarayıcıda 1200×1200 kutuya sığdırır (en-boy oranı korunur) ve
  WebP yapar (kalite 0.85; WebP yazamayan tarayıcıda JPEG). Kova sınırı (2 MB, jpeg/png/webp) sunucuda aynen geçerli. Kod: `assets/gorsel-kucult.js`.

## 7. Testler

**(entegrasyon)** Hepsi uygulamanın tek komutunda: `node testler/calistir.js`. Tek tek:

```bash
node --test testler/reklam/mantik.test.mjs   # birim (bağımlılık yok)
node --test testler/reklam/sql.test.mjs      # gerçek PostgreSQL; GERÇEK uygulama şeması: 00_supabase_taklit + 001 + 002 + 010 + 011 + 012
node testler/reklam-tarayici-testleri.js     # tam uygulama ?sahte=1: yönetim → yayın → yerleşimler → sayım → rapor/CSV → süre bitimi
node testler/ekran-testleri.js               # görünüm: 390/1280 px, açık/koyu; ekran görüntüleri testler/ekran/
```

SQL testi artık modülün kendi `profiles`/`is_admin()`/`maclar` taklidini KULLANMAZ: uygulamanın SQL testleriyle aynı
Supabase taklidi (`testler/sql/00_supabase_taklit.sql`: roller, auth, storage) ve gerçek 001 + 002 + 010 uygulanır.
Sahte istemcide (`testler/sahte-supabase.js`) `reklamlar`, `reklam_olaylari`, RPC'ler (`is_admin`, `aktif_reklam`,
`reklam_olay_kaydet`, `reklam_raporu`) ve `reklam-gorselleri` kovası var; `localStorage` `sahte_saat_kayma` (ms) reklam
tarafının saatini ileri alır. Sahte veri yayında bir **örnek reklamla** başlar: ilk reklam veren Narçil Cafe (ana_akis, haber_sonu
ve M1 maçında "Maçın sponsoru"; görseller `docs/ilk-reklam/`). Boş durumla başlaması gereken testler veri ilk kurulmadan
`localStorage.sahte_ornek_reklam = 'yok'` yazar. Reklam görselleri sahte modda `https://sahte.supabase.co/storage/...` adresiyle döner;
tarayıcı testi bu adresi sahte depodan sunar (elle `?sahte=1` ile açılan bir tarayıcıda bu görseller görünmez).

## 8. Panelden ilk reklamı ekleme (yönetici için)

İlk gerçek reklam (Narçil Cafe) için hazır görsel, metin ve adımlar: `docs/ilk-reklam/NASIL.md`.

1. Yönetim sayfasında **Reklamlar** sekmesini açın, sağ üstteki **+ Yeni reklam** düğmesine basın.
2. **Firma adı** ve **Kısa metin** yazın (metin en fazla 160 harf; altındaki sayaç gösterir).
3. **Görsel**: "Dosya seç" ile reklam resmini seçin. Yatay, yaklaşık 1200×628 piksel olsun (maç sponsoru için kare logo). "Görsel yüklendi." yazısını bekleyin.
4. **Reklama tıklayınca ne açılsın?**
   - *Web sitesi*: firmanın adresini yazın (ör. `firma.com.tr`; başına `https://` kendiliğinden eklenir).
   - *WhatsApp*: firmanın numarasını yazın (ör. `0532 123 45 67`). İsterseniz hazır mesaj ekleyin. Altta oluşan bağlantıyı görürsünüz.
   - *Bağlantı yok*: kart sadece görünür, tıklanmaz.
5. **Nerede görünsün?** Ana sayfa akışı, Haber sonu ya da Maç sponsoru. Maç sponsorunda **Maç** listesinden maçı seçin
   ya da "Tüm maçlar" bırakın (o zaman özel sponsoru olmayan her maçta çıkar).
6. **Başlangıç** ve **Bitiş** tarihini girin (Türkiye saati). Bitiş saatinde reklam kendiliğinden kalkar.
7. **Öncelik**: aynı yerde birden fazla reklam varsa sayısı yüksek olan gösterilir. Tek reklamınız varsa 0 kalabilir.
8. Sağdaki **Önizleme**'de reklamın bilgisayarda ve telefonda nasıl görüneceğine bakın. Mavi yazı, yayına alınırsa hemen mi
   görüneceğini yoksa başka bir reklamın mı önde olduğunu söyler. Önizleme sayım yapmaz.
9. Hazırsa **Yayına al**'a basın; sonra yayınlamak için saklamak istiyorsanız **Taslak kaydet**'e basın. Kırmızı uyarı çıkarsa yazanı düzeltin, tekrar basın.
10. Listede rozetler: **Yayında** (ve "Şu an gösteriliyor"), **Taslak**, **Duraklatıldı**, **Başlamadı** (başlangıç saati gelmedi), **Süresi doldu**.
    Reklamı geçici durdurmak için **Duraklat**, geri açmak için **Yayına al**.
11. **Rapor** sekmesinde tarih aralığı ve **Firma** seçip **Göster**'e basın (varsayılan: bu ay). Gösterim, tıklama ve tıklama oranını görürsünüz;
    **CSV indir (Excel)** yalnız bir firma seçiliyken açılır; dosyayı Excel'de açabilir, reklam verene gönderebilirsiniz. Yöneticilerin bakışları sayılmaz.
