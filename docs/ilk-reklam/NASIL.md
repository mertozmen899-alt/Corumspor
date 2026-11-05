# İlk reklam: Narçil Cafe — panelden adım adım

Bu sayfa, sitenin ilk gerçek reklamını (Narçil Cafe) yönetim panelinden eklemek içindir. Bilgisayar bilgisi gerekmez.
Önce Supabase projesi kurulmuş, site yayında ve siz yönetici olmalısınız (README 1-6. adımlar).

## Önce okuyun (3 önemli not)

1. **Web adresi `narcil.net` (c ile).** Firmanın kendi menü sitesi ve tanıtım videosundaki adres `narcil.net`'tir.
   `narçil.net` (ç ile) adresi 5 Kasım 2026'da denendi: **böyle bir alan adı kayıtlı değil**, açılmıyor.
   Bu yüzden reklamın bağlantısı narcil.net'in kahve bölümü: `https://narcil.net/?category=espresso-bazli-kahveler`.
   Firmaya bir kez "siteniz narcil.net, doğru mu?" diye teyit ettirin.
   (Firma ileride `narçil.net`'i alırsa panele `narçil.net` yazmanız yeterli; panel onu kendiliğinden tarayıcının anladığı
   biçime, `https://xn--naril-0ra.net`'e çevirir. Ziyaretçinin tarayıcısı bunu yine `narçil.net` diye gösterir.)
2. **Nargile ve alkol reklamda yok.** Narçil'in menüsünde nargile de var. Tütün ve nargile reklamı yasak
   (4207 sayılı Kanun; bkz. `docs/FIKIRLER.md` 7. bölüm). Bu yüzden görselde ve metinde yalnız kahve, çay, meyve suyu ve
   tatlı geçiyor. Bunu değiştirmeyin; firma "nargile de yazalım" derse kabul etmeyin.
   **Bağlantı neden kahve bölümüne gidiyor:** menü sitesinin ana sayfası nargileyle (tütün) açılıyor ve tütün reklamı yasak
   olduğu için reklamımız ziyaretçiyi doğrudan kahve bölümüne götürüyor. Bağlantıyı `narcil.net`'in ana sayfasına çevirmeyin.
   Şüpheniz varsa bir avukata sorun (bu not hukuki görüş değildir).
3. **İndirim yok.** Karar: maça özel ya da maç günü indirim kampanyası yapılmayacak. Metne indirim, kupon, "%" eklemeyin.

## Hazır dosyalar ve metin (bu klasörde)

| Ne | Dosya / metin |
|---|---|
| Yatay görsel (ana sayfa akışı ve haber sonu) | `narcil-1200x628.webp` (1200×628 piksel, WebP, 23 KB; PNG kopyası `narcil-1200x628.png`, 141 KB) |
| Kare görsel (maçın sponsoru) | `narcil-600x600.webp` (600×600 piksel, WebP, 11 KB; PNG kopyası `narcil-600x600.png`, 80 KB) |
| Görselleri yeniden üretmek (geliştirici) | `narcil-sablon.html` + `node docs/ilk-reklam/olustur.js` (PNG + WebP) |

Panele **WebP** olanı yükleyin (sayfa hafif kalır). PNG seçerseniz panel de yüklemeden önce WebP'ye çevirir; sonuç aynıdır.

**Firma adı** (aynen kopyalayın):

```
Narçil Cafe
```

**Kısa metin** (aynen kopyalayın; 123 harf, sınır 160):

```
Espresso bazlı kahveler, Türk kahvesi, bitki çayları, taze sıkılmış meyve suları ve tatlılar. Menünün tamamı narcil.net'te.
```

**Web adresi** (aynen kopyalayın; kahve bölümü, yukarıdaki 2. nota bakın):

```
narcil.net/?category=espresso-bazli-kahveler
```

Metindeki her şey firmanın kendi menüsünde var (narcil.net'teki bölümler: Espresso bazlı kahveler, Sıcak içecekler / Türk kahvesi,
Bitki çayları, Taze sıkılmış meyve suları, Tatlılar). "En iyi", "en ucuz" gibi kanıtlanamayan söz yok.
Görsel özgündür: yazılar ve fincan çizimi sıfırdan yapıldı; firmanın fotoğrafı, logo dosyası ya da Çorum FK amblemi kullanılmadı.
Renkler (siyah, beyaz, kırmızı kalp) ve "L♥VES YOU" sözü firmanın kendi tanıtım videosundan.
**Yayından önce görseli ve metni firmaya gösterip onay alın.**

## 1. Ana sayfa akışı reklamı

1. Sitede **Giriş yap** ile yönetici hesabınıza girin, üstte **Yönetim**'e basın.
2. **Reklamlar** sekmesini açın, sağ üstteki **+ Yeni reklam**'a basın.
3. **Firma adı**: `Narçil Cafe` yapıştırın.
4. **Kısa metin**: yukarıdaki metni yapıştırın. Altındaki sayaç **123/160** göstermeli.
5. **Görsel**: **Dosya seç** → bu klasördeki `narcil-1200x628.webp`. **"Görsel yüklendi."** yazısını bekleyin.
6. **Reklama tıklayınca ne açılsın?** → **Web sitesi** seçin, kutuya yukarıdaki web adresini yapıştırın
   (`narcil.net/?category=espresso-bazli-kahveler`). Kutudan çıkınca `https://narcil.net/?category=espresso-bazli-kahveler`
   olur (başına `https://` kendiliğinden eklenir).
7. **Nerede görünsün?** → **Ana sayfa akışı**.
8. **Başlangıç** ve **Bitiş** (Türkiye saati): firmayla anlaştığınız tarihler. Öneri (1 ay):
   Başlangıç **6 Kasım 2026 00:00**, Bitiş **6 Aralık 2026 00:00**. Bitiş saatinde reklam kendiliğinden kalkar.
9. **Öncelik**: `10`. (Aynı yerde başka reklam olursa sayısı yüksek olan görünür. İleride bir "büyük maç haftası" reklamına
   daha yüksek sayı verirseniz o hafta o öne geçer, sonra Narçil kendiliğinden geri gelir.)
10. Sağdaki **Önizleme**'ye bakın: masaüstü ve telefon kartında üstte "REKLAM", altında Narçil görseli, "Narçil Cafe",
    metin ve **Ayrıntılar** düğmesi olmalı. Mavi yazı "Yayına alınırsa şu an bu alanda bu reklam gösterilir" demeli
    (başlangıç ileri bir tarihse "… tarihinde görünmeye başlar" der; başka reklam öndeyse onu söyler).
    Önizleme sayım yapmaz, düğmesi bir yere götürmez.
11. **Yayına al**'a basın. Listede **Yayında** ve "Şu an gösteriliyor" yazmalı.
    Başlangıç tarihi henüz gelmediyse rozet **Başlamadı** olur; o gün gelince kendiliğinden yayına girer.
    Kırmızı uyarı çıkarsa yazanı düzeltip yeniden basın.

## 2. Haber sonu reklamı (isteğe bağlı, anlaşmada varsa)

**+ Yeni reklam** ile aynı adımları tekrarlayın. Tek fark: 7. adımda **Haber sonu** seçin. Görsel yine `narcil-1200x628.webp`.

## 3. Maçın sponsoru (isteğe bağlı, anlaşmada varsa)

1. Önce maç **Maçlar** sekmesinde kayıtlı olmalı (listede son 30 gün ve gelecek maçlar çıkar).
2. **+ Yeni reklam** → firma adı ve kısa metin aynı.
3. **Görsel**: `narcil-600x600.webp` (kare; kartta küçük bir kare olarak görünür).
4. Bağlantı yine **Web sitesi** → `narcil.net/?category=espresso-bazli-kahveler`.
5. **Nerede görünsün?** → **Maç sponsoru**, **Maç** listesinden anlaştığınız maçı seçin.
   (Maç seçerseniz kartta **"MAÇIN SPONSORU"**, "Tüm maçlar" bırakırsanız **"SPONSOR"** yazar.)
6. Tarih önerisi: maçtan 3 gün önce 00:00 → maçtan 1 gün sonra 23:59. Öncelik `10`.
7. Önizleme → **Yayına al**.

Sponsorluk yalnız firmanın adı ve tanıtımıdır; maça bağlı indirim ya da teklif yazılmaz.

## 4. Sitede kontrol

1. Telefonunuzdan siteyi açın (yönetici girişi şart değil).
2. **Ana sayfa**: 3. haberden sonra "REKLAM" etiketli Narçil kartı. Karta ya da **Ayrıntılar**'a dokununca narcil.net'in
   **kahve bölümü** (Espresso bazlı kahveler) **yeni sekmede** açılmalı, site yerinde kalmalı.
3. **Bir haber açın**: haber yazısının altında, yorumlardan önce Narçil kartı (haber sonu reklamı verdiyseniz).
4. **Seçtiğiniz maçın sayfası**: skorun altında "MAÇIN SPONSORU" Narçil kartı; başka maçlarda çıkmaz.
5. Bir şey görünmüyorsa: panelde rozet **Yayında** mı, başlangıç tarihi geldi mi, aynı yerde daha yüksek öncelikli başka
   reklam var mı, bakın.

## 5. Raporu okuma ve firmaya gönderme

1. **Yönetim → Reklamlar → Rapor**. Tarih aralığını seçin (ör. 6 Kasım – 5 Aralık 2026), **Göster**'e basın.
2. Her yer için ayrı satır çıkar: "Narçil Cafe · Ana sayfa akışı", "Haber sonu", "Maç sponsoru · (maç)".
   - **Gösterim**: kartın en az yarısı en az 1 saniye ekranda kaldı (aynı sayfa açılışında bir kez). Kişi sayısı değildir.
   - **Tıklama**: kartın bağlantısına dokunma. Aynı sekmede 30 dakika içindeki tekrar sayılmaz.
   - **Tıklama oranı**: tıklama ÷ gösterim, yüzde.
   - Sizin kendi bakışlarınız ve tıklamalarınız da sayılır; rakamı firmaya verirken bunu bilin, kendiniz çok tıklamayın.
   - **Sınıra takılan dakika**: bir reklama dakikada 120'den fazla gösterim ya da 30'dan fazla tıklama gelirse fazlası sayılmaz ve
     o dakika burada sayılır. 0 olmalı; 0'dan büyükse biri sayıyı şişirmeye çalışmış olabilir. Rakamlar her durumda **yaklaşıktır**.
3. **CSV indir (Excel)** ile dosyayı indirin, Excel'de açıp firmaya gönderebilirsiniz.
   Rakamları yuvarlayıp büyütmeyin; "gösterim"i "kişi" diye anlatmayın. Firmaya "yaklaşık gösterim / tıklama" diye verin.

## Süre bitince

Bitiş saatinde reklam kendiliğinden kalkar, rozet **Süresi doldu** olur; sitede boş kutu kalmaz.
Uzatmak için listede **Düzenle** → yeni **Bitiş** → **Kaydet (yayında kalsın)**. Geçici durdurmak için **Duraklat**, geri açmak için **Yayına al**.
