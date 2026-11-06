# İlk reklam: Narçil Cafe — panelden adım adım

Bu sayfa, sitenin ilk gerçek reklamını (Narçil Cafe) yönetim panelinden eklemek içindir. Bilgisayar bilgisi gerekmez.
Önce Supabase projesi kurulmuş, site yayında ve siz yönetici olmalısınız (README 1-6. adımlar).

## Önce okuyun (3 önemli not)

1. **Bağlantı YOK (varsayılan).** Reklam bir yere götürmez: kartta firma adı, görsel ve metin görünür, düğme çıkmaz.
   Neden: firmanın menü sitesi `narcil.net`'in **her sayfasında** üst menüde nargile görünüyor (kahve bölümü dahil). Tütün ve
   nargile reklamı yasak (4207 sayılı Kanun; bkz. `docs/FIKIRLER.md` 7. bölüm); ziyaretçiyi nargile gösteren bir sayfaya
   götürmek de bu riski taşır (başkanın değerlendirmesi, 5 Kasım 2026). Panelde **Bağlantı yok** seçin.
   Firma nargilesiz bir sayfa (ör. yalnız kahve menüsü) ya da WhatsApp numarası verirse panelden **Düzenle** ile eklersiniz:
   *Web sitesi* ya da *WhatsApp*; telefonla aranmak isterlerse **"Ara" düğmesi** alanına sabit hat / cep numarasını yazın.
   (Web adresi `narcil.net`, c ile; `narçil.net` alan adı kayıtlı değil. Firma ileride onu alırsa panel `narçil.net`'i
   kendiliğinden `https://xn--naril-0ra.net` biçimine çevirir.)
2. **Nargile ve alkol reklamda yok.** Görselde ve metinde yalnız kahve, çay, meyve suyu ve tatlı geçiyor. Bunu değiştirmeyin;
   firma "nargile de yazalım" derse kabul etmeyin. Panelde **Yayına al**'dan önce "yasaklı sektör" kutularını işaretlemeniz
   istenir (bahis, alkol, tütün/nargile, kulüp adı/amblemi yok): işaretlemeden reklam yayına çıkmaz.
   Şüpheniz varsa bir avukata sorun (bu not hukuki görüş değildir).
3. **İndirim yok.** Karar: maça özel ya da maç günü indirim kampanyası yapılmayacak. Metne indirim, kupon, "%" eklemeyin.

## Hazır dosyalar ve metin (bu klasörde)

| Ne | Dosya / metin |
|---|---|
| Yatay görsel (ana sayfa akışı ve haber sonu) | `narcil-1200x628.webp` (1200×628 piksel, WebP, 25 KB; PNG kopyası `narcil-1200x628.png`, 142 KB) |
| Kare görsel (maçın sponsoru) | `narcil-600x600.webp` (600×600 piksel, WebP, 11 KB; PNG kopyası `narcil-600x600.png`, 79 KB) |
| Küçük kopyalar (telefondaki kart; panel yüklerken kendisi üretir) | `narcil-480x251.webp`, `narcil-192x192.webp` |
| Görselleri yeniden üretmek (geliştirici) | `narcil-sablon.html` + `node docs/ilk-reklam/olustur.js` (PNG + WebP + küçük kopyalar) |

Panele **WebP** olanı yükleyin (sayfa hafif kalır). PNG seçerseniz panel de yüklemeden önce WebP'ye çevirir; sonuç aynıdır.
Panel, kartın telefonda kullandığı küçük kopyayı da (480 ya da 192 piksel) kendisi yükler.

**Firma adı** (aynen kopyalayın):

```
Narçil Cafe
```

**Kısa metin** (aynen kopyalayın; 110 harf, sınır 160; akışta ve maçta 110 önerilir):

```
Espresso bazlı kahveler, Türk kahvesi, bitki çayları, taze meyve suları ve tatlılar. Çorum'da sizi bekliyoruz.
```

Bağlantı olmadığı için metinde, görseldeki yazıda ve görselde **web adresi yok** (`narcil.net` yazılmaz: ziyaretçiyi yine o siteye
yönlendirirdi; panel de bağlantısız reklamın metninde adres görürse uyarır).

**Görseldeki yazı** (görme engelli ziyaretçiler için, aynen kopyalayın; İngilizce "Loves you" sloganı Türkçesiyle):

```
Narçil Cafe logosu ve kalpli "seni seviyor" sloganı; görseldeki yazı: espresso bazlı kahveler, Türk kahvesi, bitki çayları, taze sıkılmış meyve suları, tatlılar; Çorum'da sizi bekliyoruz
```

Metindeki her şey firmanın kendi menüsünde var (narcil.net'teki bölümler: Espresso bazlı kahveler, Sıcak içecekler / Türk kahvesi,
Bitki çayları, Taze sıkılmış meyve suları, Tatlılar). "En iyi", "en ucuz" gibi kanıtlanamayan söz yok.
Görsel özgündür: yazılar ve fincan çizimi sıfırdan yapıldı; firmanın fotoğrafı, logo dosyası ya da Çorum FK amblemi kullanılmadı.
Renkler (siyah, beyaz, kırmızı kalp) ve "L♥VES YOU" sözü firmanın kendi tanıtım videosundan. Görselin alt satırı:
"Çorum'da sizi bekliyoruz." (014: önceki görseldeki `narcil.net` satırı kaldırıldı; görseller `olustur.js` ile yeniden üretildi).
**Yayından önce görseli ve metni firmaya gösterip onay alın.**

## 1. Ana sayfa akışı reklamı

1. Sitede **Profil → Giriş yap** ile yönetici hesabınıza girin, **Profil → Yönetim paneli**'ne basın.
2. **Reklamlar** sekmesini açın, sağ üstteki **+ Yeni reklam**'a basın.
3. **Firma adı**: `Narçil Cafe` yapıştırın.
4. **Kısa metin**: yukarıdaki metni yapıştırın. Altındaki sayaç **110/160** göstermeli (160'ı geçerse sayaç kırmızı
   "… karakter fazla" der; metin kesilmez, kısaltmanız istenir).
5. **Görsel**: **Dosya seç** → bu klasördeki `narcil-1200x628.webp`. **"Görsel yüklendi."** yazısını bekleyin.
   **Görseldeki yazı** kutusuna yukarıdaki metni yapıştırın.
6. **Düğmeye dokununca ne açılsın?** → **Bağlantı yok** (yukarıdaki 1. not). Düğme yazısı ve "Ara" alanı boş kalır.
7. **Nerede görünsün?** → **Ana sayfa akışı**.
8. **Başlangıç** ve **Bitiş** (Türkiye saati): firmayla anlaştığınız tarihler. Öneri (1 ay):
   Başlangıç **6 Kasım 2026 00:00**, Bitiş **6 Aralık 2026 00:00**. Bitiş saatinde reklam kendiliğinden kalkar.
9. **Öncelik**: `10`. (Aynı yerde başka reklam olursa sayısı yüksek olan önce görünür. Akışta her kart FARKLI bir firmadır:
   ilk kart 3. haberden sonra, sonra en sık 8 haberde bir; aynı firma akışta iki kez çıkmaz.)
10. **Yasaklı sektör kontrolü** kutularını okuyup işaretleyin.
11. Sağdaki **Önizleme**'ye bakın: kartın en üstünde "SPONSOR", solda Narçil görseli, "Narçil Cafe" ve metin olmalı;
    düğme yok. Mavi yazı "Yayına alınırsa şu an bu alanda bu reklam gösterilir" demeli
    (başlangıç ileri bir tarihse "… tarihinde görünmeye başlar" der; başka reklam öndeyse onu söyler). Önizleme sayım yapmaz.
12. **Yayına al**'a basın. Listede **Yayında** ve "Şu an gösteriliyor" yazmalı.
    Başlangıç tarihi henüz gelmediyse rozet **Başlamadı** olur; o gün gelince kendiliğinden yayına girer.
    Kırmızı uyarı çıkarsa yazanı düzeltip yeniden basın.

## 2. Haber sonu reklamı (isteğe bağlı, anlaşmada varsa)

**+ Yeni reklam** ile aynı adımları tekrarlayın. Tek fark: 7. adımda **Haber sonu** seçin. Görsel yine `narcil-1200x628.webp`.
Haber sonunda kartın etiketi "REKLAM"dır.

## 3. Maçın sponsoru (isteğe bağlı, anlaşmada varsa)

1. Önce maç **Maçlar** sekmesinde kayıtlı olmalı (listede son 30 gün ve gelecek maçlar çıkar).
2. **+ Yeni reklam** → firma adı, kısa metin ve görseldeki yazı aynı.
3. **Görsel**: `narcil-600x600.webp` (kare; kartta küçük bir kare olarak görünür).
4. Bağlantı yine **Bağlantı yok**.
5. **Nerede görünsün?** → **Maç sponsoru**, **Maç** listesinden anlaştığınız maçı seçin.
   (Maç seçerseniz kartta **"MAÇIN SPONSORU"**, "Tüm maçlar" bırakırsanız **"SPONSOR"** yazar. Altında her zaman
   "Uygulama sponsoru · Çorum FK'nın sponsoru değildir" satırı görünür.)
6. Tarih önerisi: maçtan 3 gün önce 00:00 → maçtan 1 gün sonra 23:59. Öncelik `10`.
7. Önizleme → **Yayına al**.

Sponsorluk yalnız firmanın adı ve tanıtımıdır; maça bağlı indirim ya da teklif yazılmaz.

## 4. Sitede kontrol

1. Telefonunuzdan siteyi **yönetici olarak girmeden** açın (yöneticinin bakışları sayılmaz; kontrolü misafir olarak yapın).
2. **Ana sayfa**: 3. haberden sonra "SPONSOR" etiketli Narçil kartı. Karta dokununca bir şey açılmamalı (bağlantı yok).
3. **Bir haber açın**: haber yazısının altında, yorumlardan önce Narçil kartı (haber sonu reklamı verdiyseniz).
4. **Seçtiğiniz maçın sayfası**: skorun altında "MAÇIN SPONSORU" Narçil kartı; başka maçlarda çıkmaz.
5. Bir şey görünmüyorsa: panelde rozet **Yayında** mı, başlangıç tarihi geldi mi, aynı yerde daha yüksek öncelikli başka
   reklam var mı, bakın.

## 5. Raporu okuma ve firmaya gönderme

1. **Yönetim → Reklamlar → Rapor**. Tarih aralığını seçin (ör. 6 Kasım – 5 Aralık 2026), **Firma** listesinden
   **Narçil Cafe**'yi seçin, **Göster**'e basın.
2. Her yer için ayrı satır çıkar: "Narçil Cafe · Ana sayfa akışı", "Haber sonu", "Maç sponsoru · (maç)".
   - **Gösterim**: kartın en az yarısı en az 1 saniye ekranda kaldı (aynı sayfa açılışında bir kez). Kişi sayısı değildir.
   - **Tıklama**: kartın düğmesine dokunma (bağlantı yoksa 0'dır). Aynı sekmede 30 dakika içindeki tekrar sayılmaz.
   - **Tıklama oranı**: tıklama ÷ gösterim, yüzde.
   - **Yöneticilerin bakışları ve tıklamaları sayılmaz** (sunucu da saymaz).
   - **Sınıra takılan dakika**: bir reklama dakikada 120'den fazla gösterim ya da 30'dan fazla tıklama gelirse fazlası sayılmaz ve
     o dakika burada sayılır. 0 olmalı; 0'dan büyükse biri sayıyı şişirmeye çalışmış olabilir. Rakamlar her durumda **yaklaşıktır**.
3. **CSV indir (Excel)** ile dosyayı indirin (yalnız bir firma seçiliyken açılır: dosyada başka firmanın rakamı olmaz;
   dosyada maç adı ve dönem de yazar), Excel'de açıp firmaya gönderebilirsiniz.
   Rakamları yuvarlayıp büyütmeyin; "gösterim"i "kişi" diye anlatmayın. Firmaya "yaklaşık gösterim / tıklama" diye verin.

## Süre bitince

Bitiş saatinde reklam kendiliğinden kalkar, rozet **Süresi doldu** olur; sitede boş kutu kalmaz.
Uzatmak için listede **Düzenle** → yeni **Bitiş** → **Kaydet (yayında kalsın)**. Geçici durdurmak için **Duraklat**, geri açmak için **Yayına al**.
