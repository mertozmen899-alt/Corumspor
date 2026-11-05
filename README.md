# Çorumspor Taraftar

Çorum FK taraftarları için **gayriresmî** bir web uygulaması: haberler, fikstür ve sonuçlar, gol arşivi (videolu),
haber ve maçlara yorum, yerel işletmeler için **reklam / sponsorluk** alanları ve bir yönetim paneli.
Telefonda rahat kullanılacak şekilde tasarlandı; açık ve koyu tema var.

> **Resmî Çorum FK uygulaması değildir.** Bu cümle her sayfanın üstünde ve altında yazar; kaldırmayın.
> Kulübün amblemi izin alınmadan kullanılmaz (bkz. 9. bölüm).

Site düz dosyalardan oluşur (HTML, CSS, JavaScript); derleme gerekmez. Veriler, giriş ve görseller **Supabase**'te durur.
Yazı tipleri sitenin kendisinden yüklenir (Google'a istek gitmez).

İçindekiler: 1. Supabase projesi · 2. Veritabanı (migration'lar) · 3. Giriş ayarları · 4. `ayar.js` · 5. Yayınlama (Cloudflare Pages) ·
6. İlk yönetici · 7. Yönetim paneli · 8. Panelden ilk reklamı ekleme · 9. Amblem (logo) · 10. Gizlilik (KVKK) · 11. Testler · 12. Belgeler

---

## 1. Supabase projesini açın

1. <https://supabase.com> adresinde hesap açın, **New project** deyin.
2. Proje adı: `corumspor`. Bölge: **Central EU (Frankfurt)** (Türkiye'ye yakın). Veritabanı şifresini bir yere not edin.
3. Proje hazır olunca (1-2 dakika) devam edin.

## 2. Veritabanını kurun (migration'lar) — SIRAYLA: 001 → 002 → 010

Üç dosya var ve **bu sırayla, her biri bir kez** çalıştırılır:

| Sıra | Dosya | Ne kurar |
|---|---|---|
| 1 | `supabase/migrations/001_temel_sema.sql` | Haberler, maçlar, goller, yorumlar, kullanıcı profilleri, yönetici kuralı |
| 2 | `supabase/migrations/002_depolama.sql` | Haber görselleri deposu |
| 3 | `supabase/migrations/010_reklamlar.sql` | Reklamlar, gösterim/tıklama sayımı, rapor, reklam görselleri deposu |

**En kolayı: SQL Editor**

1. Supabase panelinde soldan **SQL Editor** → **New query**.
2. `001_temel_sema.sql` dosyasını açın, içeriğin tamamını kopyalayıp yapıştırın, **Run** deyin. "Success" görmelisiniz.
3. Yeni bir sorgu açıp aynısını `002_depolama.sql` için, sonra `010_reklamlar.sql` için yapın.
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
- **Sign In / Providers → Email**: açık kalsın. "Confirm email" açık kalması önerilir (sahte hesapları azaltır).
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
3. Framework preset: **None**. Build command: **boş bırakın**. Build output directory: `/` . **Save and Deploy**.
4. Adres `https://corumspor.pages.dev` gibi olur. Bu adresi 3. adımdaki Site URL / Redirect URLs'e yazın.
5. Her GitHub güncellemesinde site kendiliğinden yeniden yayınlanır.

Kendi alan adınızı bağlamak için Cloudflare Pages → projeniz → **Custom domains**.

Notlar:
- GitHub Pages de çalışır ama GitHub'ın kuralları ticari siteleri (reklam satışı) kısıtlar.
- Supabase'i kendi alan adınızla kullanıyorsanız (`*.supabase.co` dışında): her HTML dosyasının başındaki
  `Content-Security-Policy` satırında `connect-src` kısmına o adresi ekleyin **ve** reklam görseli kuralını
  (`assets/reklam/reklam-mantik.js` ile `010_reklamlar.sql`'deki `reklam_gorsel_gecerli`) o adrese göre güncelleyin.

## 6. İlk yöneticiyi atayın

1. Sitede **Giriş yap → Kayıt ol** ile kendinize normal bir hesap açın (e-posta onayını tamamlayın).
2. Supabase **SQL Editor**'de şunu kendi e-postanızla çalıştırın:

```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'sizin@epostaniz.com');
```

3. Siteden çıkıp tekrar girin. Üstte **Yönetim** düğmesi çıkar.

Başka birini yönetici yapmak için aynı komutu onun e-postasıyla çalıştırın. Kimse kendi rolünü siteden değiştiremez.

## 7. Yönetim paneli (`yonetim.html`)

- **Haberler**: yeni haber, düzenleme, kapak görseli yükleme (en fazla 3 MB), yayınla / yayından kaldır, sil. Haber metni düz yazıdır; paragrafları boş satırla ayırın.
- **Maçlar**: rakip, tarih-saat (**Türkiye saati**), stadyum, iç saha/deplasman, skor, durum (Planlandı / Canlı / Bitti).
- **Goller**: maça gol ekleme (oyuncu, dakika, uzatma, penaltı, video bağlantısı). Video için YouTube bağlantısı ya da `https://...mp4` adresi.
- **Yorumlar**: son yorumlar; gizle/göster ya da sil. Gizlenen yorumu sadece yazan kişi ve yöneticiler görür.
- **Reklamlar**: reklam ekleme, önizleme, yayına alma/duraklatma ve **Rapor** (gösterim, tıklama, CSV). Aşağıdaki bölüme bakın.

Kurallar: yorum 1-1000 karakter, bir kullanıcı dakikada en fazla 5 yorum yazabilir.

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
11. **Rapor** sekmesinde tarih aralığı seçip **Göster**'e basın: gösterim, tıklama ve tıklama oranı. **CSV indir (Excel)** ile
    dosyayı Excel'de açıp reklam verene gönderebilirsiniz.

Sayım kuralları: reklamın yarısı en az 1 saniye ekranda kalınca **1 gösterim** sayılır (aynı sayfa açılışında bir kez).
Aynı tarayıcı sekmesinde aynı reklama 30 dakika içindeki tekrar tıklama sayılmaz. Ayrıntı: `docs/REKLAM.md`.
Yeni satış fikirleri (paketler, büyük maç haftası, gol sponsoru…): `docs/FIKIRLER.md`.

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

## 11. Testler (geliştiriciler için)

```
node testler/calistir.js
```

Tek komut her şeyi dener: veritabanı kuralları (gerçek Postgres ya da PGlite), sayfalar (Playwright, sahte veriyle), reklam modülünün
birim/SQL/tarayıcı testleri (tam uygulamada uçtan uca) ve 390/1280 px açık/koyu tema görünüm testleri. Gerçek Supabase projesine
dokunmaz, internete çıkmaz. Ekran görüntüleri: `testler/ekran/`. Ayrıntı: `AGENTS.md`.

## 12. Belgeler

- `AGENTS.md` — geliştirici / yapay zekâ ajanı kuralları, klasör haritası, testler, reklam sözleşmesi
- `docs/REKLAM.md` — reklam modülünün ayrıntılı kuralları ve kararları
- `docs/TASARIM.md` — tasarım rehberi (renkler, yazı tipleri, kontrast, hukuki not, logo planı)
- `docs/FIKIRLER.md` — reklam/sponsorluk için sonraki fikirler
