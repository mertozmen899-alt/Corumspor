# Çorumspor Taraftar

Çorum FK taraftarları için **gayriresmî** bir web uygulaması: haberler, fikstür ve sonuçlar, gol arşivi (videolu),
haber ve maçlara yorum, yerel işletmeler için **reklam / sponsorluk** alanları ve bir yönetim paneli.
Telefonda rahat kullanılacak şekilde tasarlandı; açık ve koyu tema var.

> **Resmî Çorum FK uygulaması değildir.** Bu cümle her sayfanın üstünde ve altında yazar; kaldırmayın.
> Kulübün amblemi izin alınmadan kullanılmaz (bkz. 9. bölüm).

Site düz dosyalardan oluşur (HTML, CSS, JavaScript); derleme gerekmez. Veriler, giriş ve görseller **Supabase**'te durur.
Yazı tipleri sitenin kendisinden yüklenir (Google'a istek gitmez).

İçindekiler: 1. Supabase projesi · 2. Veritabanı (migration'lar) · 3. Giriş ayarları · 4. `ayar.js` · 5. Yayınlama (Cloudflare Pages) ·
6. İlk yönetici · 7. Yönetim paneli · 8. Panelden ilk reklamı ekleme (İlk reklam: Narçil Cafe) · 9. Amblem (logo) · 10. Gizlilik (KVKK) · 11. Testler · 12. Belgeler

---

## 1. Supabase projesini açın

1. <https://supabase.com> adresinde hesap açın, **New project** deyin.
2. Proje adı: `corumspor`. Bölge: **Central EU (Frankfurt)** (Türkiye'ye yakın). Veritabanı şifresini bir yere not edin.
3. Proje hazır olunca (1-2 dakika) devam edin.

## 2. Veritabanını kurun (migration'lar) — SIRAYLA: 001 → 002 → 010 → 011 → 012

Beş dosya var ve **bu sırayla, her biri bir kez** çalıştırılır:

| Sıra | Dosya | Ne kurar |
|---|---|---|
| 1 | `supabase/migrations/001_temel_sema.sql` | Haberler, maçlar, goller, yorumlar, kullanıcı profilleri, yönetici kuralı |
| 2 | `supabase/migrations/002_depolama.sql` | Haber görselleri deposu |
| 3 | `supabase/migrations/010_reklamlar.sql` | Reklamlar, gösterim/tıklama sayımı, rapor, reklam görselleri deposu |
| 4 | `supabase/migrations/011_denetim_duzeltmeleri.sql` | Güvenlik düzeltmeleri (5 Kasım 2026 denetimi): haber görselleri listesi yalnız yöneticiye, TRUNCATE yetkisi kaldırılır |
| 5 | `supabase/migrations/012_denetim_2.sql` | Denetim 2. tur: reklam sayımına dakika sınırı + "sınıra takılan dakika" raporu; yorumda e-posta onayı, günde 50 yorum, aynı yorumu tekrar yazma ve düzenleme sınırı; kullanıcıların rolü herkese kapalı; "yonetici", "resmi", "kulüp" gibi yanıltıcı kullanıcı adları yasak; haber kapağı yalnız sitenin deposundan |

**En kolayı: SQL Editor**

1. Supabase panelinde soldan **SQL Editor** → **New query**.
2. `001_temel_sema.sql` dosyasını açın, içeriğin tamamını kopyalayıp yapıştırın, **Run** deyin. "Success" görmelisiniz.
3. Yeni bir sorgu açıp aynısını `002_depolama.sql` için, sonra `010_reklamlar.sql`, `011_denetim_duzeltmeleri.sql` ve en son
   `012_denetim_2.sql` için yapın.
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
4. İsterseniz örnek veri için `supabase/seed.sql` dosyasını da çalıştırın (uydurma 4 maç, 3 gol, 4 haber; sonra panelden silebilirsiniz).

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
  **Redirect URLs** bölümüne `https://corumspor.pages.dev/giris.html` ekleyin (e-posta onay bağlantısı buraya döner).
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
```

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
(yönetim panelinde tıklama hırsızlığına karşı) ve birkaç güvenlik başlığı eklenir. Silmeyin.

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

3. Siteden çıkıp tekrar girin. Üstte **Yönetim** düğmesi çıkar.

Başka birini yönetici yapmak için aynı komutu onun e-postasıyla çalıştırın. Kimse kendi rolünü siteden değiştiremez.

## 7. Yönetim paneli (`yonetim.html`)

- **Haberler**: yeni haber, düzenleme, kapak görseli yükleme, yayınla / yayından kaldır, sil. Haber metni düz yazıdır; paragrafları boş satırla ayırın.
  Kapak fotoğrafı yüklenmeden önce tarayıcıda en uzun kenarı 1600 piksel olacak şekilde küçültülür ve WebP yapılır (telefon fotoğrafı
  birkaç yüz KB'a iner, fotoğraftaki konum bilgisi silinir). Kapak yalnız bu yolla, sitenin deposundan olabilir; başka siteden adres kabul edilmez.
- **Maçlar**: rakip, tarih-saat (**Türkiye saati**), stadyum, iç saha/deplasman, skor, durum (Planlandı / Canlı / Bitti).
- **Goller**: maça gol ekleme (oyuncu, dakika, uzatma, penaltı, video bağlantısı). Video için YouTube bağlantısı ya da `https://...mp4` adresi.
- **Yorumlar**: son yorumlar; gizle/göster ya da sil. Gizlenen yorumu sadece yazan kişi ve yöneticiler görür.
- **Reklamlar**: reklam ekleme, önizleme, yayına alma/duraklatma ve **Rapor** (gösterim, tıklama, CSV). Aşağıdaki bölüme bakın.

Yorum kuralları (sunucuda): yorum 1-1000 karakter; yazmak için e-posta onayı; bir hesap dakikada en fazla 5, günde (son 24 saat)
en fazla 50 yorum; aynı yorum 10 dakika içinde tekrar gönderilemez; yorum yalnız yazıldıktan sonraki 30 dakika içinde ve dakikada
en fazla 10 kez düzenlenebilir (yöneticiler bu sınırlardan muaf). Kullanıcı adında "yönetici", "admin", "resmi", "kulüp", "Çorum FK",
"destek" gibi yanıltıcı adlar kullanılamaz. Ziyaretçiler kimin yönetici olduğunu göremez (rol herkese kapalı).

## 8. Panelden ilk reklamı ekleme

Reklamlar üç yerde çıkar: **ana sayfada 3. haberden sonra**, **haberin sonunda (yorumlardan önce)** ve **maç sayfasında
skorun altında (maç sponsoru)**. Her reklamın üstünde "REKLAM" ya da "SPONSOR" yazar; reklam yoksa o yerde boşluk kalmaz.

1. **Yönetim → Reklamlar** sekmesini açın, **+ Yeni reklam**'a basın.
2. **Firma adı** ve **Kısa metin** yazın (metin en fazla 160 harf; altındaki sayaç gösterir).
3. **Görsel**: "Dosya seç" ile resmi seçin (JPG, PNG ya da WEBP, en fazla 2 MB). Yatay, yaklaşık 1200×628 piksel olsun
   (maç sponsoru için kare logo). "Görsel yüklendi." yazısını bekleyin. Görsel yalnızca böyle yüklenir; başka siteden adres yapıştırılamaz.
4. **Reklama tıklayınca ne açılsın?**
   - *Web sitesi*: firmanın adresi (ör. `firma.com.tr`; başına `https://` kendiliğinden eklenir).
   - *WhatsApp*: firmanın numarası (ör. `0532 123 45 67`), isterseniz hazır mesaj.
   - *Bağlantı yok*: kart sadece görünür.
5. **Nerede görünsün?** Ana sayfa akışı, Haber sonu ya da Maç sponsoru. Maç sponsorunda **Maç** listesinden maçı seçin
   ya da "Tüm maçlar" bırakın (o zaman özel sponsoru olmayan her maçta çıkar).
6. **Başlangıç** ve **Bitiş** (Türkiye saati). Bitiş saatinde reklam kendiliğinden kalkar.
7. **Öncelik**: aynı yerde birden fazla reklam varsa sayısı yüksek olan gösterilir. Tek reklamınız varsa 0 kalabilir.
8. Sağdaki **Önizleme**'de reklamın bilgisayarda ve telefonda nasıl görüneceğine bakın. Önizleme sayım yapmaz.
9. **Yayına al**'a basın (ya da sonra yayınlamak için **Taslak kaydet**). Kırmızı uyarı çıkarsa yazanı düzeltip tekrar basın.
10. Listede rozetler: **Yayında** ("Şu an gösteriliyor"), **Taslak**, **Duraklatıldı**, **Başlamadı**, **Süresi doldu**.
    Geçici durdurmak için **Duraklat**, geri açmak için **Yayına al**.
11. **Rapor** sekmesinde tarih aralığı seçip **Göster**'e basın: gösterim, tıklama, tıklama oranı ve **sınıra takılan dakika**.
    **CSV indir (Excel)** ile dosyayı Excel'de açıp reklam verene gönderebilirsiniz. Rakamlar **yaklaşıktır**: bir reklama dakikada
    120'den fazla gösterim ya da 30'dan fazla tıklama sayılmaz; "sınıra takılan dakika" 0'dan büyükse biri sayıyı şişirmeye çalışmış olabilir.

Sayım kuralları: reklamın yarısı en az 1 saniye ekranda kalınca **1 gösterim** sayılır (aynı sayfa açılışında bir kez).
Aynı tarayıcı sekmesinde aynı reklama 30 dakika içindeki tekrar tıklama sayılmaz. Ayrıntı: `docs/REKLAM.md`.
Yeni satış fikirleri (paketler, büyük maç haftası, gol sponsoru…): `docs/FIKIRLER.md`.

**Kural:** Reklamlar dışarıdaki işletmelerden gelir; **maça özel / maç günü indirim kampanyası yapılmaz** (metne indirim ya da kupon
yazmayın). Bir işletme bir maça "Maçın sponsoru" olabilir, ama indirim teklifi olmadan.

### İlk reklam: Narçil Cafe

İlk gerçek reklam veren **Narçil Cafe** (web: `https://narcil.net`). Reklamın bağlantısı menünün **kahve bölümü**:
`https://narcil.net/?category=espresso-bazli-kahveler` — menü sitesinin başında nargile (tütün) var ve tütün reklamı yasak
(4207 sayılı Kanun), bu yüzden ana sayfaya değil kahve bölümüne bağlanır. Hazır görseller (1200×628 ve 600×600), panele yapıştırılacak
metin, önerilen tarih/öncelik, sitede kontrol ve raporu okuma adım adım: **[`docs/ilk-reklam/NASIL.md`](docs/ilk-reklam/NASIL.md)**.
Not: `narçil.net` (ç ile) alan adı kayıtlı değil; firmanın sitesi `narcil.net`. Test modunda (`?sahte=1`) örnek reklam da Narçil'dir.

## 9. Amblem (logo)

Üstte varsayılan olarak uygulamaya özel çizilmiş **yedek işaret** (kalkan içinde "ÇFK") görünür; kulübün amblemi değildir.
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
- **Gizlilik ve KVKK aydınlatma metni:** `gizlilik.html` (her sayfanın alt bilgisinden ve kayıt formundan bağlantı var). Şu an
  **taslaktır**: ne saklandığı koddan çıkarılarak yazıldı; köşeli parantezli yerleri (veri sorumlusu adı, adres, iletişim e-postası,
  hukuki sebepler, yurt dışı aktarım) doldurup **yayından önce bir avukata okutun**. Siteye yeni bir şey saklayan özellik eklenirse
  bu sayfa da güncellenmeli (test, koddaki tarayıcı depolama anahtarlarının sayfada yazılı olduğunu denetler).

## 11. Testler (geliştiriciler için)

```
node testler/calistir.js
```

Tek komut her şeyi dener: veritabanı kuralları (gerçek Postgres ya da PGlite), sayfalar (Playwright, sahte veriyle), reklam modülünün
birim/SQL/tarayıcı testleri (tam uygulamada uçtan uca), 390/1280 px açık/koyu tema görünüm testleri ve uygulama birim testleri
(kullanıcı adı/kapak kuralları, görsel küçültme, yayın hazırlama). Gerçek Supabase projesine
dokunmaz, internete çıkmaz. Ekran görüntüleri: `testler/ekran/`. Ayrıntı: `AGENTS.md`.

## 12. Belgeler

- `AGENTS.md` — geliştirici / yapay zekâ ajanı kuralları, klasör haritası, testler, reklam sözleşmesi
- `docs/REKLAM.md` — reklam modülünün ayrıntılı kuralları ve kararları
- `docs/TASARIM.md` — tasarım rehberi (renkler, yazı tipleri, kontrast, hukuki not, logo planı)
- `docs/FIKIRLER.md` — reklam/sponsorluk için sonraki fikirler
- `docs/ilk-reklam/NASIL.md` — ilk reklamı (Narçil Cafe) panelden ekleme; görseller ve şablon aynı klasörde
- `docs/DENETIM-2026-11-05.md` — bağımsız denetim raporu (puan, bulgular, sahibin karar vermesi gereken açık işler)
- `araclar/yayin-hazirla.js` — yayına yalnız sitenin dosyalarını hazırlar (Cloudflare Pages yapı komutu); `araclar/og-olustur.js` — paylaşım görseli (`assets/img/og-1200x630.png`)
