# Çorumspor Taraftar

Çorum FK taraftarları için **bağımsız** bir web uygulaması: manşet ve son dakika haberleri, gol arşivi (sezon ve rakibe göre,
videolu), takım (kadro, kaynaklı sakatlık bilgisi, fikstür), haber / maç / gole yorum, yerel işletmeler için **sponsor** alanları
ve bir yönetim paneli. Telefon için tasarlandı (alt menü: Ana Sayfa · Gol Arşivi · Takım · Profil); açık ve koyu tema var.
Tasarım kuralları: `docs/TASARIM.md`; ekran görüntüleri: `docs/ekran/onizleme-*.png`.

> Her sayfanın başında **"Bağımsız taraftar uygulaması"** şeridi, altındaki künyede **"Çorum FK'nın resmî uygulaması değildir"**
> cümlesi yazar (gizlilik sayfasında da); kaldırmayın. Künyede sahibin adı ve iletişim / kaldırma talebi adresi durur
> (`assets/ayar.js`: `SAHIP_ADI`, `ILETISIM_EPOSTA`). Kulübün amblemi izin alınmadan kullanılmaz (bkz. 9. bölüm).

Site düz dosyalardan oluşur (HTML, CSS, JavaScript); derleme gerekmez. Veriler, giriş ve görseller **Supabase**'te durur.
Yazı tipleri sitenin kendisinden yüklenir (Google'a istek gitmez).

İçindekiler: 1. Supabase projesi · 2. Veritabanı (migration'lar) · 3. Giriş ayarları · 4. `ayar.js` · 5. Yayınlama (Cloudflare Pages) ·
6. İlk yönetici · 7. Yönetim paneli (Kadro, Sakatlıklar, şikâyetler) · 8. Panelden ilk reklamı ekleme (İlk reklam: Narçil Cafe) · 9. Amblem (logo) · 10. Gizlilik (KVKK) · 11. Testler · 12. Belgeler

---

## 1. Supabase projesini açın

1. <https://supabase.com> adresinde hesap açın, **New project** deyin.
2. Proje adı: `corumspor`. Bölge: **Central EU (Frankfurt)** (Türkiye'ye yakın). Veritabanı şifresini bir yere not edin.
3. Proje hazır olunca (1-2 dakika) devam edin.

## 2. Veritabanını kurun (migration'lar) — SIRAYLA: 001 → 002 → 010 → 011 → 012 → 013

Altı dosya var ve **bu sırayla, her biri bir kez** çalıştırılır:

| Sıra | Dosya | Ne kurar |
|---|---|---|
| 1 | `supabase/migrations/001_temel_sema.sql` | Haberler, maçlar, goller, yorumlar, kullanıcı profilleri, yönetici kuralı |
| 2 | `supabase/migrations/002_depolama.sql` | Haber görselleri deposu |
| 3 | `supabase/migrations/010_reklamlar.sql` | Reklamlar, gösterim/tıklama sayımı, rapor, reklam görselleri deposu |
| 4 | `supabase/migrations/011_denetim_duzeltmeleri.sql` | Güvenlik düzeltmeleri (5 Kasım 2026 denetimi): haber görselleri listesi yalnız yöneticiye, TRUNCATE yetkisi kaldırılır |
| 5 | `supabase/migrations/012_denetim_2.sql` | Denetim 2. tur: reklam sayımına dakika sınırı + "sınıra takılan dakika" raporu; yorumda e-posta onayı, günde 50 yorum, aynı yorumu tekrar yazma ve düzenleme sınırı; kullanıcıların rolü herkese kapalı; "yonetici", "resmi", "kulüp" gibi yanıltıcı kullanıcı adları yasak; haber kapağı yalnız sitenin deposundan |
| 6 | `supabase/migrations/013_tasarim.sql` | Mobil tasarım: kadro (`oyuncular`) ve kaynaklı sakatlık (`sakatliklar`) tabloları, haberde **manşet** ve kapak fotoğrafı kaynağı, gole kapak görseli ve süre, **gole yorum**, yorum **şikâyeti** (`yorum_sikayetleri`) ve **yorumdan men** (`profiles.engelli`), reklamda düğme yazısı / "Ara" telefonu / görseldeki yazı / küçük görsel / yasaklı sektör onayı, akışta farklı firmalar (`aktif_reklamlar`), **yöneticinin bakışları sayılmaz**, daha fazla ayrılmış kullanıcı adı (başkan, kaptan, Çorumspor…) |

**En kolayı: SQL Editor**

1. Supabase panelinde soldan **SQL Editor** → **New query**.
2. `001_temel_sema.sql` dosyasını açın, içeriğin tamamını kopyalayıp yapıştırın, **Run** deyin. "Success" görmelisiniz.
3. Yeni bir sorgu açıp aynısını `002_depolama.sql` için, sonra `010_reklamlar.sql`, `011_denetim_duzeltmeleri.sql` ve en son
   `012_denetim_2.sql`, en son `013_tasarim.sql` için yapın.
   **Canlı veritabanınızda 001-011 zaten kuruluysa** yalnız `012_denetim_2.sql`'i **011'den sonra** bir kez çalıştırın.
   (011'i henüz çalıştırmadıysanız önce 011, sonra 012.) `010`'u ileride yeniden çalıştırırsanız ardından `012`'yi de yeniden
   çalıştırın (yoksa reklam sayımındaki dakika sınırı kalkar).
   012'den sonra iki kontrol (SQL Editor'de; sonuç boş olmalı):
   ```sql
   -- Başka siteden kapak kullanan eski haberler (bunları panelde düzenlerken kapağı yeniden yükleyin):
   select id, baslik, kapak_url from public.haberler where not public.haber_kapak_gecerli(kapak_url);
   -- Yanıltıcı kullanıcı adları (yönetici, resmi, kulüp…): kişiye yazıp adını değiştirmesini isteyin ya da SQL Editor'den değiştirin
   select id, kullanici_adi from public.profiles where public.kullanici_adi_ayrilmis(kullanici_adi);
   ```
   (`010`, `001` yoksa "önce 001 temel migration uygulanmalı" diye durur; sırayı karıştırırsanız böyle anlarsınız.)
   **013:** canlı veritabanında 001-012 kuruluysa yalnız `013_tasarim.sql`'i **012'den sonra** bir kez çalıştırın (yeniden
   çalıştırmak zararsızdır). `010` ya da `012`'yi ileride yeniden çalıştırırsanız ardından `013`'ü de yeniden çalıştırın
   (yoksa "yöneticinin bakışı sayılmaz" kuralı ve yeni reklam alanları eski hâline döner).
4. İsterseniz örnek veri için `supabase/seed.sql` dosyasını da çalıştırın (uydurma maçlar, goller, haberler, 8 oyuncu ve 3 sakatlık
   kaydı; sonra panelden silebilirsiniz). **Gerçek kadro ve sakatlık bilgisi yalnız kulübün resmî açıklamasından girilir.**

**Alternatif: Supabase CLI** (bilgisayarınızda Node.js varsa, proje klasöründe):

```
npx supabase login
npx supabase link --project-ref PROJE-KODUNUZ
npx supabase db push
```

`db push` dosyaları numara sırasıyla uygular. `PROJE-KODUNUZ`, panel adresindeki `https://supabase.com/dashboard/project/XXXX`
kısmındaki `XXXX`'tir. Örnek veri (`seed.sql`) için yine SQL Editor'ü kullanın.

## 3. Giriş (Auth) ayarları

Supabase panelinde **Authentication**:

- **URL Configuration** → **Site URL**: sitenizin adresi (ör. `https://corumspor.pages.dev`).
  **Redirect URLs** bölümüne `https://corumspor.pages.dev/giris.html` (e-posta onay bağlantısı) ve
  `https://corumspor.pages.dev/sifre.html` (**Şifremi unuttum** e-postasındaki bağlantı; yeni şifre bu sayfada yazılır) ekleyin.
- **Sign In / Providers → Email**: açık kalsın. **"Confirm email" mutlaka AÇIK olsun.** Yorum yazmak için e-posta onayı gerekir
  (`012`); "Confirm email" kapalıysa Supabase her yeni hesabı kendiliğinden onaylı sayar ve bu koruma işe yaramaz.
  **Anonymous sign-ins** kapalı kalsın (açılırsa da anonim hesaplar yorum yazamaz).
- Şifre için en az 8 karakter seçebilirsiniz (site de 8 karakter ister).

Not: Supabase'in ücretsiz e-posta gönderimi saatte birkaç e-postayla sınırlıdır. Çok kayıt beklerseniz
**Authentication → Emails → SMTP Settings**'ten kendi e-posta hizmetinizi bağlayın.

## 4. `assets/ayar.js` dosyasını doldurun

Supabase panelinde **Project Settings → API** (ya da **Data API**):

- **Project URL** → `SUPABASE_URL`
- **anon public** (ya da "publishable") anahtar → `SUPABASE_ANON_KEY`

```js
export const SUPABASE_URL = 'https://abcdxyz.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOi...';
export const AMBLEM_DOSYASI = null;   // bkz. 9. bölüm; izin yoksa null kalsın
export const SAHIP_ADI = 'Adınız Soyadınız';            // künye ve gizlilik sayfasında "veri sorumlusu"
export const ILETISIM_EPOSTA = 'iletisim@alanadiniz.com'; // künye: iletişim ve kaldırma talepleri
```

`SAHIP_ADI` ve `ILETISIM_EPOSTA` her sayfanın alt bilgisindeki künyede ve `gizlilik.html`'de kendiliğinden yazılır
("Bir haber, fotoğraf ya da yorumun kaldırılmasını isteyen bu adrese yazar; 24 saat içinde dönülür"). Yayından önce doldurun.

Bu anahtarın sitede görünmesi normaldir; veriyi veritabanındaki kurallar (RLS) korur.
**`service_role` (secret) anahtarını asla bu dosyaya ya da depoya koymayın.**

Ayar yapılmadan site açılırsa sayfada "Site henüz yapılandırılmadı" uyarısı görünür.

## 5. Siteyi yayınlayın: Cloudflare Pages (önerilen)

Sitede reklam/sponsorluk satılacağı için **Cloudflare Pages** önerilir (ücretsiz ve ticari kullanıma uygun).

1. Bu depoyu GitHub'a `corumspor` adıyla yükleyin.
2. <https://dash.cloudflare.com> → **Workers & Pages** → **Create** → **Pages** → **Connect to Git** → `corumspor` deposunu seçin.
3. Framework preset: **None**. Build command: **`node araclar/yayin-hazirla.js`**. Build output directory: **`yayin`**. **Save and Deploy**.
   Bu komut yalnız sitenin dosyalarını (HTML sayfaları, `assets/`, `_headers`, `robots.txt`, `.nojekyll`) `yayin/` klasörüne kopyalar;
   `testler/`, `supabase/`, `docs/`, `araclar/` yayına çıkmaz (biri karışırsa komut durur ve yayın yapılmaz).
   İsterseniz **Settings → Environment variables**'a `SITE_ADRESI` = `https://corumspor.pages.dev` (kendi adresiniz) ekleyin:
   paylaşım önizlemesindeki görsel (og:image) tam adresle yazılır.
4. Adres `https://corumspor.pages.dev` gibi olur. Bu adresi 3. adımdaki Site URL / Redirect URLs'e yazın.
5. Her GitHub güncellemesinde site kendiliğinden yeniden yayınlanır.

Kendi alan adınızı bağlamak için Cloudflare Pages → projeniz → **Custom domains**.

Kök klasördeki `_headers` dosyasını Cloudflare Pages kendiliğinden okur: site başka bir sitenin çerçevesine (iframe) konamaz
(yönetim panelinde tıklama hırsızlığına karşı), birkaç güvenlik başlığı ve **önbellek kuralları** eklenir (yazı tipi, görsel ve
vendor bir yıl; kod 5 dakika + arka planda yenileme; `sw.js` her açılışta doğrulanır). Bir yola iki kural uyarsa Cloudflare aynı
başlığı birleştirir; yeni kural eklerken klasörleri çakıştırmayın (test denetler). Silmeyin.

Yapı komutu (`yayin-hazirla.js`) iki şeyi de yapar: `assets/ayar.js`'te gerçek bir Supabase adresi varsa her sayfaya o adres için
`preconnect` ekler (ilk veri isteği daha hızlı başlar) ve `sw.js`'i (service worker) yayına koyar. Service worker sitenin kabuğunu
ve son görülen herkese açık veriyi saklar: stadyumda internet giderse son haberler / goller yine açılır. Giriş, yorum, reklam
sayımı ve YouTube **hiç** önbelleğe alınmaz. Sürümü yapı komutu kendisi yazar (yayın içeriğinin özeti): elle değiştirmeyin.
Yapı komutu `assets/ayar.js`'te yer tutucu (PROJE-KODUNUZ, ANON-ANAHTARINIZ, iletisim@ornek.com) görürse **durur**; bilerek taslak
yayın için Cloudflare'de `YAYIN_TASLAK=1` ortam değişkeni verin. Yayın kopyasında CSP `_headers`'a başlık olarak (proje adresinize
daraltılmış) yazılır, iç bağlantılar uzantısız olur (`/goller`).

Notlar:
- GitHub Pages de çalışır ama GitHub'ın kuralları ticari siteleri (reklam satışı) kısıtlar.
- Supabase'i kendi alan adınızla kullanıyorsanız (`*.supabase.co` dışında): her HTML dosyasının başındaki
  `Content-Security-Policy` satırında `connect-src` ve `img-src` kısımlarına o adresi ekleyin **ve** görsel kurallarını
  (reklam: `assets/reklam/reklam-mantik.js` + `reklam_gorsel_gecerli`; haber kapağı: `assets/kurallar.js` + `haber_kapak_gecerli`)
  o adrese göre güncelleyin (yeni bir migration ile).

## 6. İlk yöneticiyi atayın

1. Sitede **Giriş yap → Kayıt ol** ile kendinize normal bir hesap açın (e-posta onayını tamamlayın). Kullanıcı adı sıradan bir ad
   olsun ("yonetici", "admin", "resmi" gibi adlar zaten kabul edilmez).
2. Supabase **SQL Editor**'de şunu kendi e-postanızla çalıştırın:

```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'sizin@epostaniz.com');
```

3. Siteden çıkıp tekrar girin. **Profil** sayfasında **Yönetim paneli** bağlantısı çıkar.

Başka birini yönetici yapmak için aynı komutu onun e-postasıyla çalıştırın. Kimse kendi rolünü siteden değiştiremez.

## 7. Yönetim paneli (`yonetim.html`)

Sekmeler: **Haberler · Maçlar · Goller · Kadro · Sakatlıklar · Yorumlar · Reklamlar**.

- **Haberler**: yeni haber, düzenleme, kapak görseli yükleme, yayınla / yayından kaldır, sil. Haber metni düz yazıdır; paragrafları boş satırla ayırın.
  **Manşet** kutusu işaretli en yeni haber ana sayfanın en üstündeki büyük görselde çıkar (yoksa en yeni haber; maç günü "MAÇ GÜNÜ").
  Kapak fotoğrafı yüklenmeden önce tarayıcıda küçültülür ve 1600 / 800 / 480 piksel genişlikte üç WebP kopyası yüklenir (telefon
  küçüğünü indirir; fotoğraftaki konum bilgisi silinir). Kapak yalnız bu yolla, sitenin deposundan olabilir; başka siteden adres
  kabul edilmez. **Fotoğraf sahibi / kaynak** alanı kapağın altında yazar (ör. "Fotoğraf: Ali Yılmaz"). **Yalnız hakkına sahip
  olduğunuz fotoğrafları yükleyin** (kendi çektiğiniz, izinli ya da açık lisanslı; lisans istiyorsa yazarını yazın).
- **Maçlar**: rakip, tarih-saat (**Türkiye saati**), stadyum, iç saha/deplasman, skor, durum (Planlandı / Canlı / Bitti). Canlı skor yoktur.
- **Goller**: maça gol ekleme (oyuncu, dakika, uzatma, penaltı, video bağlantısı, **kapak görseli**, süre, anlatım). Video için
  YouTube bağlantısı ya da `https://...mp4` adresi. **Yalnızca hak sahibinin resmî YouTube videolarını kullanın.** Kapak görseli
  sitenin kendi görselidir: ziyaretçi dokunana kadar YouTube'a hiç istek gitmez. Her golün kendi sayfası (`gol.html`), paylaşımı
  ve yorumları vardır.
- **Kadro**: oyuncu adı, forma numarası, mevki, (izinli) fotoğraf, aktif/pasif.
- **Sakatlıklar**: oyuncu, durum (Sakat / Cezalı / Şüpheli / Döndü), kısa not, **zorunlu kaynak** (ör. "Kulüp açıklaması") ve
  bağlantısı, yayında/taslak. **KVKK: yalnız kulübün resmî olarak açıkladığı bilgi girilir**; sağlık bilgisi hassas kişisel veridir,
  söylenti, tribün dedikodusu ya da teşhis ayrıntısı yazılmaz. Güncelleme zamanı kendiliğinden yazılır.
- **Yorumlar**: son yorumlar; gizle/göster ya da sil; **Şikâyet edilenler** süzgeci ve her yorumda şikâyet sayısı. Kuralları tekrar
  tekrar çiğneyen hesaba **Yorumdan men et** (o hesap yorum yazamaz; **Yasağı kaldır** ile geri açılır). Topluluk kuralları: `kurallar.html`.
  Gizlenen yorumu sadece yazan kişi ve yöneticiler görür.
- **Reklamlar**: reklam ekleme, önizleme, yayına alma/duraklatma ve **Rapor** (firma seçerek gösterim, tıklama, CSV). Aşağıdaki bölüme bakın.

Yorum kuralları (sunucuda): yorum 1-1000 karakter; yazmak için e-posta onayı; bir hesap dakikada en fazla 5, günde (son 24 saat)
en fazla 50 yorum; aynı yorum 10 dakika içinde tekrar gönderilemez; yorum yalnız yazıldıktan sonraki 30 dakika içinde ve dakikada
en fazla 10 kez düzenlenebilir (yöneticiler bu sınırlardan muaf). Kullanıcı adında "yönetici", "admin", "resmi", "kulüp", "Çorum FK",
"Çorumspor", "başkan", "teknik direktör", "kaptan", "destek" gibi yanıltıcı adlar kullanılamaz. Ziyaretçiler kimin yönetici olduğunu
göremez (rol herkese kapalı). Onaylı her üye başkasının yorumunu bir kez **şikâyet edebilir** (neden seçerek); men edilen hesap yorum yazamaz.

## 8. Panelden ilk reklamı ekleme

Reklamlar üç yerde çıkar: **ana sayfa akışında** (ilk kart 3. haberden sonra, sonra en sık 8 haberde bir, en çok 3 kart; her kart
**farklı bir firma**), **haberin sonunda (yorumlardan önce)** ve **maç sayfasında skorun altında ("Maçın sponsoru"; altında
"Uygulama sponsoru · Çorum FK'nın sponsoru değildir")**. Kartın en üstünde gerçek yazıyla "SPONSOR" (haber sonunda "REKLAM") yazar.
Kartın yalnız **düğmesi** bağlantıdır. Reklam yoksa o yer tamamen kalkar (boşluk kalmaz); okuduğunuz yerin üstüne sonradan kart
eklenip yazıyı kaydırmaz.

1. **Yönetim → Reklamlar** sekmesini açın, **+ Yeni reklam**'a basın.
2. **Firma adı** ve **Kısa metin** yazın (metin en fazla 160 harf; sayaç gösterir, aşınca "… karakter fazla" der ve kaydettirmez; 120'nin altı önerilir).
3. **Görsel**: "Dosya seç" ile resmi seçin (JPG, PNG ya da WEBP, en fazla 2 MB). Yatay, yaklaşık 1200×628 piksel olsun
   (maç sponsoru için kare logo). "Görsel yüklendi." yazısını bekleyin. Görsel yalnızca böyle yüklenir; başka siteden adres yapıştırılamaz.
   Panel telefon kartı için küçük kopyayı da yükler. Görselde yazı varsa **Görseldeki yazı** kutusuna aynısını yazın (ekran okuyucu için).
4. **Düğmeye dokununca ne açılsın?**
   - *Web sitesi*: firmanın adresi (ör. `firma.com.tr`; başına `https://` kendiliğinden eklenir).
   - *WhatsApp*: firmanın numarası (ör. `0532 123 45 67`), isterseniz hazır mesaj.
   - *Bağlantı yok*: kart sadece görünür.
   **Düğme yazısı** isteğe bağlıdır (boşsa "Ayrıntılar"). **"Ara" düğmesi için telefon** doldurulursa ikinci düğme telefonu arar.
5. **Nerede görünsün?** Ana sayfa akışı, Haber sonu ya da Maç sponsoru. Maç sponsorunda **Maç** listesinden maçı seçin
   ya da "Tüm maçlar" bırakın (o zaman özel sponsoru olmayan her maçta çıkar).
6. **Başlangıç** ve **Bitiş** (Türkiye saati). Bitiş saatinde reklam kendiliğinden kalkar.
7. **Öncelik**: aynı yerde birden fazla reklam varsa sayısı yüksek olan gösterilir. Tek reklamınız varsa 0 kalabilir.
8. Sağdaki **Önizleme**'de reklamın bilgisayarda ve telefonda nasıl görüneceğine bakın. Önizleme sayım yapmaz.
9. **Yasaklı sektör kontrolü** kutularını işaretleyin (bahis / şans oyunu, alkol, tütün / nargile, kulüp adı ya da amblemi yok):
   işaretlenmeden **Yayına al** çalışmaz. **Yayına al**'a basın (ya da sonra yayınlamak için **Taslak kaydet**). Kırmızı uyarı
   çıkarsa yazanı düzeltip tekrar basın.
10. Listede rozetler: **Yayında** ("Şu an gösteriliyor"), **Taslak**, **Duraklatıldı**, **Başlamadı**, **Süresi doldu**.
    Geçici durdurmak için **Duraklat**, geri açmak için **Yayına al**.
11. **Rapor** sekmesinde tarih aralığı ve **Firma** seçip **Göster**'e basın: gösterim, tıklama, tıklama oranı ve **sınıra takılan dakika**.
    **CSV indir (Excel)** yalnız bir firma seçiliyken açılır (dosyada başka firmanın rakamı olmaz; maç adı ve dönem de yazar);
    Excel'de açıp reklam verene gönderebilirsiniz. **Yöneticilerin bakışları ve tıklamaları sayılmaz.** Rakamlar **yaklaşıktır**: bir reklama dakikada
    120'den fazla gösterim ya da 30'dan fazla tıklama sayılmaz; "sınıra takılan dakika" 0'dan büyükse biri sayıyı şişirmeye çalışmış olabilir.

Sayım kuralları: reklamın yarısı en az 1 saniye ekranda kalınca **1 gösterim** sayılır (aynı sayfa açılışında bir kez).
Aynı tarayıcı sekmesinde aynı reklama 30 dakika içindeki tekrar tıklama sayılmaz. Ayrıntı: `docs/REKLAM.md`.
Yeni satış fikirleri (paketler, büyük maç haftası, gol sponsoru…): `docs/FIKIRLER.md`.

**Kural:** Reklamlar dışarıdaki işletmelerden gelir; **maça özel / maç günü indirim kampanyası yapılmaz** (metne indirim ya da kupon
yazmayın). Bir işletme bir maça "Maçın sponsoru" olabilir, ama indirim teklifi olmadan.

### İlk reklam: Narçil Cafe

İlk gerçek reklam veren **Narçil Cafe** (web: `https://narcil.net`). Reklamın varsayılanı **Bağlantı yok**: menü sitesinin her
sayfasında üst menüde nargile (tütün) görünüyor ve tütün reklamı yasak (4207 sayılı Kanun); firma nargilesiz bir sayfa ya da
WhatsApp numarası verirse panelden eklenir. Hazır görseller (1200×628 ve 600×600 + küçük kopyalar), panele yapıştırılacak metin,
önerilen tarih/öncelik, sitede kontrol ve raporu okuma adım adım: **[`docs/ilk-reklam/NASIL.md`](docs/ilk-reklam/NASIL.md)**.
Not: `narçil.net` (ç ile) alan adı kayıtlı değil; firmanın sitesi `narcil.net`. Test modunda (`?sahte=1`) örnek reklam da Narçil'dir.

## 9. Amblem (logo)

Üstte varsayılan olarak uygulamaya özel çizilmiş **"ÇT" işareti** (Çorumspor Taraftar; kırmızı-siyah yuvarlak, altın şimşek) görünür;
kulübün amblemi değildir, kulübün kısaltmasını ("ÇFK") da kullanmaz.
Kulübün resmî amblemini kullanmak isterseniz **önce kulüpten yazılı izin alın** (amblem telif ve marka korumasındadır;
sitede reklam olduğu için kullanım ticari sayılabilir). İzin geldikten sonra adımlar `assets/logo/README.txt` dosyasında:
dosyayı `assets/logo/` klasörüne koyun ve `assets/ayar.js` içinde `AMBLEM_DOSYASI` satırını doldurun.

## 10. Gizlilik (KVKK)

- Reklam sayımında kişisel veri tutulmaz: kullanıcı kimliği, IP, tarayıcı bilgisi yok. Yalnız rastgele bir sayfa açılışı kimliği,
  reklamın yeri, maç ve zaman saklanır. Tıklamada ayrıca **rastgele bir sekme kimliği** gönderilir: sadece "aynı sekmede 30 dakikada
  tekrar tıklama sayılmasın" kuralı içindir, kimseyle eşleştirilemez ve sekme kapanınca tarayıcı siler (çerez kullanılmaz).
- Reklam görselleri yalnızca sitenin kendi deposundan gelir; ziyaretçinin bilgisi başka bir firmanın sunucusuna gitmez.
- Yazı tipleri sitenin kendisinden yüklenir (Google Fonts yok). Tema seçimi yalnız ziyaretçinin tarayıcısında hatırlanır.
- Yorum yazanların e-posta adresi sitede görünmez; yalnız kullanıcı adı görünür.
- Supabase kütüphanesi (supabase-js 2.45.4) sitenin kendisinden sunulur (`assets/vendor/`, npm paketiyle bayt bayt aynı, SRI ile):
  jsDelivr'e istek gitmez. Haber kapakları ve reklam görselleri yalnız sitenin deposundan gelir (CSP `img-src` başka adrese izin vermez).
  Gol videoları **YouTube**'dan (youtube-nocookie) gelir: YouTube ziyaretçinin IP adresini görür. Gizlilik sayfasında yazılıdır.
- Tarayıcıda yalnız şunlar durur: oturum (Supabase), tema seçimi, son görülen herkese açık veri (`son-veri-v1`: haber başlıkları,
  goller, sıradaki maç; ≤ 30 KB, çevrimdışı açılış için) ve service worker önbelleği (sitenin dosyaları + herkese açık veri).
- Sakatlık bilgisi sağlık verisidir: yalnız kulübün resmî açıklaması, kaynağıyla girilir (7. bölüm).
- Paketlenen fotoğraflar (Saat Kulesi vb.) Wikimedia Commons'tan, açık lisanslı; her birinin altında "Fotoğraf: yazar, lisans,
  Wikimedia Commons" yazar ve **Fotoğraf kaynakları** sayfası (`kaynaklar.html`, alt bilgiden bağlantı) hepsini listeler.
  CC BY-SA fotoğrafların kırpılmış/küçültülmüş kopyaları da AYNI lisansla paylaşılır: `assets/img/KAYNAKLAR.txt`.
  Yeni bir fotoğraf eklerseniz atfını `assets/foto-kaynaklari.js` ve `assets/img/KAYNAKLAR.txt`'e de ekleyin; test her paketli
  fotoğrafın atfı olduğunu denetler. Stadyumun inşaat hâli fotoğrafı açılış görseli olarak kullanılmaz.
- **Gizlilik ve KVKK aydınlatma metni:** `gizlilik.html` (her sayfanın alt bilgisinden ve kayıt formundan bağlantı var). Veri
  sorumlusu ve iletişim adresi `assets/ayar.js`'ten (`SAHIP_ADI`, `ILETISIM_EPOSTA`) gelir; sayfada "Son güncelleme" tarihi yazar.
  **Hatırlatma (yalnız burada, sayfada değil): yayından önce metni bir avukata okutun** (hukuki sebepler, yurt dışı aktarım,
  sakatlık bilgisinin dayanağı). Siteye yeni bir şey saklayan özellik eklenirse bu sayfa da güncellenmeli (test, koddaki tarayıcı
  depolama anahtarlarının sayfada yazılı olduğunu denetler).

## 11. Testler (geliştiriciler için)

```
node testler/calistir.js
```

Tek komut her şeyi dener (9 grup): veritabanı kuralları (gerçek Postgres ya da PGlite; 013 dahil), sayfalar (Playwright, sahte
veriyle), reklam modülünün birim/SQL/tarayıcı testleri (tam uygulamada uçtan uca), 360/390/430/1280 px açık/koyu görünüm testleri,
uygulama birim testleri, **tasarım/erişilebilirlik** (alt menü, klavye ve odak, 44 px hedefler, %200 yazı, filtreler, video, yorumlar,
sponsor sıklığı ve boş durum, şifre sıfırlama, çevrimdışı) ve **performans** (Yavaş 4G / Hızlı 3G kısmasıyla LCP ve CLS, istek
sayısı, yazı tipleri, YouTube'suz açılış). Gerçek Supabase projesine dokunmaz, internete çıkmaz. Ekran görüntüleri: `testler/ekran/`
(ve `docs/ekran/onizleme-*.png`). Ayrıntı: `AGENTS.md`.

## 12. Belgeler

- `AGENTS.md` — geliştirici / yapay zekâ ajanı kuralları, klasör haritası, testler, reklam sözleşmesi
- `docs/REKLAM.md` — reklam modülünün ayrıntılı kuralları ve kararları
- `docs/TASARIM.md` — tasarım rehberi (belirteçler, bileşenler, ekranlar, kontrast, hukuki not, logo); `docs/kontrast.py` — kontrast tablosu
- `docs/ekran/` — tasarımın ekran görüntüleri (360 ve 430 px, ana sayfa ve gol arşivi)
- `docs/FIKIRLER.md` — reklam/sponsorluk için sonraki fikirler
- `docs/ilk-reklam/NASIL.md` — ilk reklamı (Narçil Cafe) panelden ekleme; görseller ve şablon aynı klasörde
- `docs/DENETIM-2026-11-05.md` — bağımsız denetim raporu (puan, bulgular, sahibin karar vermesi gereken açık işler)
- `araclar/yayin-hazirla.js` — yayına yalnız sitenin dosyalarını hazırlar (Cloudflare Pages yapı komutu); `araclar/og-olustur.js` — paylaşım görseli (`assets/img/og-1200x630.png`)
