# Çorumspor Taraftar — Tasarım Rehberi

Bu rehber, gayriresmî Çorum FK taraftar uygulamasının kulübe yakışır ama kulübün resmî uygulamasıyla karıştırılmayacak bir görünüme sahip olması için hazırlandı. Araştırma tarihi: 5 Kasım 2026.

Bu klasördeki dosyalar:

| Dosya | Ne işe yarar |
|---|---|
| `tasarim.css` | Renk, yazı tipi ve ölçü değişkenleri (açık + koyu tema) ve bileşenlerin temel stilleri. Uygulamaya doğrudan eklenebilir. |
| `amblem-yedek.svg` | Özgün yedek işaret: kalkan içinde "ÇFK" ve şimşek. Kulübün amblemi **değildir**. |
| `ornek.html` | Paleti ve bileşenleri gösteren örnek sayfa. |
| `ornek-390.png`, `ornek-1280.png` | Örnek sayfanın açık tema ekran görüntüleri (390 px ve 1280 px genişlik). |
| `ornek-390-koyu.png`, `ornek-1280-koyu.png` | Aynı sayfanın koyu tema görüntüleri. |
| `kontrast.py` | Kontrast oranlarını hesaplayan küçük betik (`python3 kontrast.py`). |

---

## 1. Araştırma bulguları

### 1.1 Kulüp kimliği

| Bilgi | Değer | Kaynak |
|---|---|---|
| Ticari unvan | Çorum Futbol Kulübü A.Ş. | Kulübün künye sayfası [1] |
| Kullanılan ad | "Arca Çorum FK" / "Arca ÇorumFK" (Arca isim sponsoru) | [1], [2] |
| Lakap | **Kırmızı Şimşekler**. Bir taraftar grubunun da adı. | Wikipedia [3], haberler [10] |
| Kuruluş | Kulübe göre **2018**; amblemde de "2018" yazıyor. Wikipedia kökeni **1997** olarak veriyor: Çorum Belediyespor kuruldu, 2018'de adı Yeni Çorumspor, 2019'da Çorum FK oldu. | [1], [3] |
| Renkler | **Kırmızı #CC0000, Siyah #0B0B0B**. Kulübün kendi künyesinde bu değerler açıkça yazıyor. 2014'e kadar mavi-beyaz kullanılmış. | [1], [3] |
| Stadyum | **Çorum Şehir Stadyumu**, 15.000 seyirci, tribünlerin tamamı kapalı. | Kulübün stadyum sayfası [4], StadiumDB [11] |
| Lig (2026-27) | **Trendyol Süper Lig**. Kulübün ilk Süper Lig sezonu. 24 Mayıs 2026'da 1. Lig play-off finalinde Esenler Erokspor'u 2-0 yendi. | [3], NTV [12] |
| Başkan / Teknik direktör | Savaş Balçık / Burak Yılmaz | [1] |
| Sloganlar | **"Biz Anadoluyuz"** (#BizAnadoluyuz; sitenin altında ve 2026-27 forma tanıtımında), "Hedef Avrupa!" (tarihçe sayfası), "Kırmızı-siyahın kalbi" (stadyum sayfası) | [2], [4], [5], [6] |

Belirsiz noktalar:
- Resmî sitenin fikstür bölümünde ev maçları için hâlâ "Dr. Turhan Kılıçcıoğlu Stadyumu" yazıyor. Bu, kulübün eski stadının adı ve büyük olasılıkla bir veri sağlayıcısından gelen eski bir kayıt. Kulübün kendi stadyum sayfası "Çorum Şehir Stadyumu" diyor. Arayüz metinlerinde **Çorum Şehir Stadyumu** kullanılmalı.
- Açılış yılı kaynaklara göre değişiyor: kulüp sayfası 2022, StadiumDB 20.09.2020 diyor.
- Taraftar tezahüratlarının sözlerini güvenilir bir kaynaktan doğrulayamadım. Tezahürat sözleri telifli olabileceği için uygulamaya alıntılanmamalı.
- "Çorumspor" adı aynı zamanda şehrin eski ve ayrı kulübünün adı (Çorum FK 2019'da bu kulübü devraldı). Uygulama adı olarak "Çorumspor Taraftar" kullanılabilir. Metinlerde güncel takımdan "Çorum FK" diye söz etmek en açık yol.

### 1.2 Formalar (2026-27, Joma)

- **İç saha:** Klasik kırmızı-siyah dikey çubuklu forma. Footy Headlines'a göre üzerinde bir "Hitit Güneşi" ayrıntısı var ve tanıtımın teması "BİZ ANADOLUYUZ" [6].
- Kulüp mağazasında 2026/27 için dört Joma forma listeleniyor: **Çubuklu, Kırmızı, Beyaz, Turuncu** [7]. Hangisinin deplasman, hangisinin üçüncü ya da kaleci forması olduğunu resmî bir kaynakta doğrulayamadım. En olası eşleşme: beyaz deplasman, kırmızı üçüncü forma. Mağazanın kulübün resmî mağazası olup olmadığı da sayfada açıkça yazmıyor.
- Uygulamada kırmızı-siyah çubuk deseni yalnızca dekoratif bir zemin olarak kullanılabilir (örnek sayfadaki manşet görseli böyle yapıldı). Forma grafiklerini kopyalamayın.

### 1.3 Amblem

- **Görünümü:** Yuvarlak bir rozet. Siyah dış halkada beyaz harflerle "ÇORUM FUTBOL KULÜBÜ" ve "2018" yazıyor. Kenarlarda ince kırmızı çizgiler var. Ortadaki beyaz dairede kırmızı bir **çift başlı kartal** bulunuyor (Alacahöyük ve Hitit kabartmalarındaki kartaldan esinlenmiş). SVG dosyasında kırmızı #C91F25, siyah #030406.
- **Resmî dosya:** `https://corumfk.com.tr/demo/corumfk/crest.svg`. Kulüp sitesinin schema.org "Organization logo" kaydında bu adres yazıyor [2]. Wikipedia kaynak olarak `https://corumfk.com.tr/kulup/kurumsal` gösteriyor.
- **Lisans durumu:**
  - İngilizce Wikipedia, `File:Çorum F.K._crest.svg`: **özgür olmayan (non-free) logo**, ABD "fair use" gerekçesiyle yalnızca maddede kullanılıyor. Sayfada "protected by copyright" ve "Certain commercial use of this image may also be trademark infringement" yazıyor [8].
  - Türkçe Vikipedi, `Dosya:Çorum FK.png`: **"adil kullanım" logo**. Sayfada "Bu logo bir organizasyon, öğe veya olaya ait olup Telif hakkı bulunmaktadır." yazıyor [9].
  - Wikimedia Commons'ta amblem **yok**. Commons'ta yalnızca serbest lisanslı forma çizimleri ve fotoğraflar var.
  - TÜRKPATENT'te marka tescili olup olmadığını kontrol edemedim. Yayından önce TÜRKPATENT marka araştırmasında "Çorum FK" ve amblem için arama yapılması önerilir.
- **Bu projede amblem indirilmedi ve gömülmedi.** Amblem dosyası için yalnızca bir yuva var (bkz. Bölüm 6).

### 1.4 Kulübün dijital varlığı

| Kanal | Adres |
|---|---|
| Resmî site | https://corumfk.com.tr (dikkat: `corumfk.com` satılık, park edilmiş bir alan adı) |
| Instagram | https://www.instagram.com/corumfk/ |
| X | https://x.com/corumfk |
| YouTube | https://www.youtube.com/@corumfkofficial |
| Facebook | https://www.facebook.com/corumfkofficial |
| Mobil uygulama | App Store ve Google Play'de resmî bir kulüp uygulaması **bulunamadı**. Sitede de uygulama bağlantısı yok. |

**Resmî sitenin görünümü** (2026 Kasım; site kodu ve 390 px ekran görüntüsü incelendi):
- **Düzen:** Simsiyah başlık çubuğu, solda büyük yuvarlak amblem (başlığın altına taşıyor), sağda arama ve menü simgeleri. Altında tam genişlikte fotoğraflı manşet slaytı var. Ardından maç takvimi kartları (yatay kaydırmalı; "Bitti", "Sıradaki", "Yaklaşan"), filtreli haber ızgarası, puan durumu, medya ve sponsor logoları geliyor.
- **Tipografi:** Başlıklarda **Barlow Condensed** (kalın, BÜYÜK HARF), gövdede **Inter**, küçük üst etiketlerde **IBM Plex Mono** (BÜYÜK HARF, geniş harf aralığı, önünde kırmızı çizgi; örneğin "— FİKSTÜR").
- **Renk:** CSS değişkenleri `--color-primary:#c00`, `--color-brand-dark:#ab0000`, `--color-secondary/ink:#0a0a0c`, `--color-accent:#c9a227` (altın), `--color-muted:#f6f6f7`. Sayfa zemini beyaz, kartlar beyaz, köşeler çoğunlukla 4–8 px.
- **Görseller:** Antrenman ve maç fotoğrafları, üzerlerinde koyu degrade ve kırmızı kare kategori etiketi ("KULÜP", "MAÇ RAPORU").
- **Üslup:** Gururlu ve kurumsal, "biz" dili ("Deplasmanda farklı galibiz", "Hazırlıklarımız başladı"), yerel kimlik vurgusu (#BizAnadoluyuz).
- Sosyal medya hesaplarının içeriği giriş duvarı nedeniyle incelenemedi. Bu bölüm siteye dayanıyor.

**Uygulamamızı resmî siteden ayırmak için:**
1. Farklı yazı tipi çifti (Oswald + Source Sans 3; resmî site Barlow Condensed + Inter kullanıyor).
2. Farklı ad: "Çorumspor Taraftar". "Arca ÇorumFK" ya da "Resmî" ifadesi kullanılmamalı. Sponsor adı (Arca) ve kulüp sponsorlarının logoları kullanılmamalı.
3. Sıcak kırık beyaz kart zemini (#F6F4F0) ve daha yuvarlak köşeler (16 px).
4. Her sayfada görünen **"Resmî Çorum FK uygulaması değildir."** şeridi ve alt bilgide aynı ifade.
5. Varsayılan işaret olarak yuvarlak amblem yerine kalkan biçimli özgün monogram.
6. Haberlerde "biz" yerine taraftar sesi: "Çorum FK deplasmanda üç puanı aldı".

### 1.5 Şehir motifleri (nötr süs öğeleri)

| Motif | Kullanım önerisi | Dikkat |
|---|---|---|
| **Hatti/Hitit güneş kursu** (Alacahöyük, MÖ 3. binyıl tunç eser) | Soyut, özgün bir çizim: iç içe halkalar ve ışınlar. `tasarim.css` içindeki `.gunes-motif` sınıfı bu şekilde hazırlandı. | Antik eserin kendisi telifsiz bir kültür mirası. Ancak modern yorumları (ör. Ankara Sıhhiye'deki anıt, belediye logoları) ve kulübün forma grafiği kopyalanmamalı. Ankara ile Çorum arasında bu sembolün kime ait olduğu konusunda bir tartışma var [13]. |
| **Leblebi** | Sıcak krem tonları (kart zemini #F6F4F0), boş durum çizimleri, "leblebi molası" gibi samimi metinler. | "Çorum Leblebisi" coğrafi işaret olarak tescilli olabilir. Kelimeyi kullanmak sorun değil, coğrafi işaret amblemini kullanmayın. |
| **Şimşek** (Kırmızı Şimşekler) | Simgeler, yükleme animasyonu, yedek monogram. | Genel bir şekil, sorun yok. |
| **Kırmızı-siyah çubuklar** | Manşet ve boş görsel zeminleri. | Renk ve çubuk deseni tek başına marka sayılmaz, ama forma tasarımının birebir kopyası olmamalı. |
| **Çift başlı kartal** | **Kullanmayın.** | Amblemin ana figürü; kullanılırsa amblemle karıştırılır. |

---

## 2. Renk paleti

Temel renkler kulübün kendi yayımladığı değerler: **#CC0000** ve **#0B0B0B** [1]. Altın **#C9A227** resmî sitenin vurgu rengi [2]. Diğer tonlar bu rehberde türetildi.

### Açık tema

| Değişken | Hex | Kullanım |
|---|---|---|
| `--kulup-kirmizi` | #CC0000 | Birincil buton, kategori etiketi, başlık altı çizgisi, "sıradaki maç" çerçevesi |
| `--kulup-siyah` | #0B0B0B | Başlık çubuğu, alt bilgi, gol dakikası rozeti |
| `--kulup-altin` | #C9A227 | Küçük vurgular (ör. "Özel" etiketi, monogramdaki şimşek). Yalnızca zemin olarak ve üzerinde siyah yazıyla. |
| `--zemin` | #FFFFFF | Sayfa zemini |
| `--yuzey` | #F6F4F0 | Kart zemini (leblebi kreması) |
| `--yuzey-2` | #ECE8E1 | İkincil yüzey, avatar, "resmî değildir" şeridi |
| `--kenar` / `--kenar-guclu` | #D9D4CB / #858077 | Kart kenarı (dekoratif) / form alanı kenarı (≥3:1) |
| `--metin` | #141414 | Gövde metni |
| `--metin-soluk` | #5C5A57 | Tarih, meta bilgi, ikincil metin |
| `--vurgu` | #CC0000 | Kırmızı metin ve bağlantı |
| `--vurgu-guclu` | #A80000 | Üzerine gelince, küçük kırmızı metin |
| `--altin-metin` | #7A5C00 | Altın tonlu metin (açık zeminde #C9A227 okunmuyor: 2.3:1) |
| `--reklam-zemin` / `--reklam-metin` | #FFF6DB / #6B4F00 | Reklam ve sponsor kartı |
| `--galibiyet` / `--beraberlik` / `--maglubiyet` | #1E7D3A / #5F6368 / #CC0000 | G / B / M rozetleri (beyaz yazı) |

### Koyu tema

Kulüp renkleri aynı kalıyor, yüzeyler ve metin değişiyor. **Önemli:** #CC0000 koyu zeminde metin olarak yalnızca 3.3:1 veriyor. Bu yüzden koyu temada kırmızı metin ve bağlantılar **#FF6B66** ile yazılıyor. Butonun zemini yine #CC0000 ve üzerinde beyaz yazı var (5.89:1).

| Değişken | Hex |
|---|---|
| `--zemin` / `--yuzey` / `--yuzey-2` | #0B0B0B / #161618 / #202024 |
| `--metin` / `--metin-soluk` | #F3F1EC / #A9A6A0 |
| `--vurgu` / `--vurgu-guclu` | #FF6B66 / #FF8A85 |
| `--altin-metin` | #E3BE55 |
| `--reklam-zemin` / `--reklam-metin` | #2A2312 / #F0CF73 |
| `--galibiyet` / `--beraberlik` | #4CC074 / #A9A6A0 (siyah yazı) |
| `--kenar` / `--kenar-guclu` | #34343A / #74747E |

Tema seçimi: varsayılan olarak `prefers-color-scheme` izlenir. Kullanıcı seçimi için `<html data-theme="light">` ya da `<html data-theme="dark">` kullanılır.

### Kontrast oranları (WCAG 2.1)

Oranlar `kontrast.py` ile WCAG göreli parlaklık formülünden hesaplandı, tahmin edilmedi. Gövde metni için eşik **AA 4.5:1**. Buton kenarı, odak halkası ve form alanı gibi arayüz parçaları için eşik **3:1**. Tablodaki tüm metin çiftleri AA eşiğini geçiyor.

| Tema | Kullanım | Ön plan | Arka plan | Oran | Eşik | Sonuç |
|---|---|---|---|---|---|---|
| Açık | gövde metni | `metin` #141414 | `bg` #FFFFFF | 18.42:1 | 4.5 | ✅ |
| Açık | ikincil metin | `soluk` #5C5A57 | `bg` #FFFFFF | 6.87:1 | 4.5 | ✅ |
| Açık | kırmızı metin / bağlantı | `kirmizi` #CC0000 | `bg` #FFFFFF | 5.89:1 | 4.5 | ✅ |
| Açık | koyu kırmızı metin | `kirmiziKoyu` #A80000 | `bg` #FFFFFF | 7.88:1 | 4.5 | ✅ |
| Açık | altın vurgulu metin | `altinMetin` #7A5C00 | `bg` #FFFFFF | 6.25:1 | 4.5 | ✅ |
| Açık | gövde metni | `metin` #141414 | `yuzey` #F6F4F0 | 16.77:1 | 4.5 | ✅ |
| Açık | ikincil metin | `soluk` #5C5A57 | `yuzey` #F6F4F0 | 6.26:1 | 4.5 | ✅ |
| Açık | kırmızı metin / bağlantı | `kirmizi` #CC0000 | `yuzey` #F6F4F0 | 5.36:1 | 4.5 | ✅ |
| Açık | koyu kırmızı metin | `kirmiziKoyu` #A80000 | `yuzey` #F6F4F0 | 7.17:1 | 4.5 | ✅ |
| Açık | altın vurgulu metin | `altinMetin` #7A5C00 | `yuzey` #F6F4F0 | 5.69:1 | 4.5 | ✅ |
| Açık | gövde metni | `metin` #141414 | `yuzey2` #ECE8E1 | 15.09:1 | 4.5 | ✅ |
| Açık | ikincil metin | `soluk` #5C5A57 | `yuzey2` #ECE8E1 | 5.63:1 | 4.5 | ✅ |
| Açık | kırmızı metin / bağlantı | `kirmizi` #CC0000 | `yuzey2` #ECE8E1 | 4.82:1 | 4.5 | ✅ |
| Açık | koyu kırmızı metin | `kirmiziKoyu` #A80000 | `yuzey2` #ECE8E1 | 6.45:1 | 4.5 | ✅ |
| Açık | altın vurgulu metin | `altinMetin` #7A5C00 | `yuzey2` #ECE8E1 | 5.12:1 | 4.5 | ✅ |
| Açık | buton: beyaz / kırmızı | `beyaz` #FFFFFF | `kirmizi` #CC0000 | 5.89:1 | 4.5 | ✅ |
| Açık | buton hover: beyaz / koyu kırmızı | `beyaz` #FFFFFF | `kirmiziKoyu` #A80000 | 7.88:1 | 4.5 | ✅ |
| Açık | başlık çubuğu: beyaz / siyah | `beyaz` #FFFFFF | `siyah` #0B0B0B | 19.68:1 | 4.5 | ✅ |
| Açık | altın etiket: siyah / altın | `siyah` #0B0B0B | `altin` #C9A227 | 8.14:1 | 4.5 | ✅ |
| Açık | Reklam etiketi | `reklamMetin` #6B4F00 | `reklamZemin` #FFF6DB | 7.09:1 | 4.5 | ✅ |
| Açık | G rozeti: beyaz / yeşil | `beyaz` #FFFFFF | `galibiyet` #1E7D3A | 5.19:1 | 4.5 | ✅ |
| Açık | B rozeti: beyaz / gri | `beyaz` #FFFFFF | `beraber` #5F6368 | 6.05:1 | 4.5 | ✅ |
| Açık | kırmızı / siyah (yalnız dekor) | `kirmizi` #CC0000 | `siyah` #0B0B0B | 3.34:1 | 3.0 | ✅ |
| Açık | kenarlık (dekor, eşik yok) | `kenar` #D9D4CB | `bg` #FFFFFF | 1.48:1 | 1.0 | ✅ |
| Koyu | gövde metni | `metin` #F3F1EC | `bg` #0B0B0B | 17.44:1 | 4.5 | ✅ |
| Koyu | ikincil metin | `soluk` #A9A6A0 | `bg` #0B0B0B | 8.11:1 | 4.5 | ✅ |
| Koyu | kırmızı metin / bağlantı | `kirmiziMetin` #FF6B66 | `bg` #0B0B0B | 7.07:1 | 4.5 | ✅ |
| Koyu | altın vurgulu metin | `altinMetin` #E3BE55 | `bg` #0B0B0B | 11.02:1 | 4.5 | ✅ |
| Koyu | gövde metni | `metin` #F3F1EC | `yuzey` #161618 | 16.01:1 | 4.5 | ✅ |
| Koyu | ikincil metin | `soluk` #A9A6A0 | `yuzey` #161618 | 7.44:1 | 4.5 | ✅ |
| Koyu | kırmızı metin / bağlantı | `kirmiziMetin` #FF6B66 | `yuzey` #161618 | 6.49:1 | 4.5 | ✅ |
| Koyu | altın vurgulu metin | `altinMetin` #E3BE55 | `yuzey` #161618 | 10.12:1 | 4.5 | ✅ |
| Koyu | gövde metni | `metin` #F3F1EC | `yuzey2` #202024 | 14.38:1 | 4.5 | ✅ |
| Koyu | ikincil metin | `soluk` #A9A6A0 | `yuzey2` #202024 | 6.69:1 | 4.5 | ✅ |
| Koyu | kırmızı metin / bağlantı | `kirmiziMetin` #FF6B66 | `yuzey2` #202024 | 5.83:1 | 4.5 | ✅ |
| Koyu | altın vurgulu metin | `altinMetin` #E3BE55 | `yuzey2` #202024 | 9.09:1 | 4.5 | ✅ |
| Koyu | buton: beyaz / kırmızı | `beyaz` #FFFFFF | `kirmizi` #CC0000 | 5.89:1 | 4.5 | ✅ |
| Koyu | buton zemini / sayfa (UI ≥3) | `kirmizi` #CC0000 | `bg` #0B0B0B | 3.34:1 | 3.0 | ✅ |
| Koyu | altın etiket: siyah / altın | `siyah` #0B0B0B | `altin` #C9A227 | 8.14:1 | 4.5 | ✅ |
| Koyu | Reklam etiketi | `reklamMetin` #F0CF73 | `reklamZemin` #2A2312 | 10.30:1 | 4.5 | ✅ |
| Koyu | G rozeti: siyah / yeşil | `siyah` #0B0B0B | `galibiyet` #4CC074 | 8.53:1 | 4.5 | ✅ |
| Koyu | B rozeti: siyah / gri | `siyah` #0B0B0B | `beraber` #A9A6A0 | 8.11:1 | 4.5 | ✅ |

Ek kontroller (bileşen bazında):

| Tema | Kullanım | Ön plan | Arka plan | Oran |
|---|---|---|---|---|
| Açık | kategori etiketi | #A80000 | #FBEAEA | 6.78:1 |
| Koyu | kategori etiketi | #FF8A85 | #3A1213 | 7.23:1 |
| Her iki | manşet: beyaz / degrade (en kötü: beyaz foto, %75 siyah) | #FFFFFF | #484848 | 9.15:1 |
| Her iki | manşet meta #D6D3CD / degrade en kötü | #D6D3CD | #484848 | 6.12:1 |
| Her iki | menü & alt bilgi #C9C6C0 / siyah | #C9C6C0 | #0B0B0B | 11.55:1 |
| Her iki | gol dakikası: beyaz / siyah | #FFFFFF | #0B0B0B | 19.68:1 |
| Her iki | video süresi: beyaz / %78 siyah (beyaz kare üstü) | #FFFFFF | #4A4A4A | 8.86:1 |
| Açık | reklam butonu: beyaz / metin rengi | #FFFFFF | #141414 | 18.42:1 |
| Koyu | reklam butonu: #0B0B0B / #F3F1EC | #0B0B0B | #F3F1EC | 17.44:1 |
| Koyu | reklam ikincil metin (soluk / reklam zemini) | #A9A6A0 | #2A2312 | 6.42:1 |
| Açık | reklam ikincil metin (soluk / reklam zemini) | #5C5A57 | #FFF6DB | 6.37:1 |
| Açık | Reklam etiketi / kart zemini | #6B4F00 | #FFF6DB | 7.09:1 |
| Her iki | kırmızı alt çizgi / siyah başlık (UI ≥3) | #CC0000 | #0B0B0B | 3.34:1 |
| Açık | form alanı kenarı / beyaz (UI ≥3) | #858077 | #FFFFFF | 3.92:1 |
| Açık | form alanı kenarı / yüzey (UI ≥3) | #858077 | #F6F4F0 | 3.57:1 |
| Koyu | form alanı kenarı / zemin (UI ≥3) | #74747E | #0B0B0B | 4.26:1 |
| Koyu | form alanı kenarı / yüzey (UI ≥3) | #74747E | #161618 | 3.91:1 |
| Açık | odak halkası / beyaz (UI ≥3) | #0B57D0 | #FFFFFF | 6.39:1 |
| Koyu | odak halkası / siyah (UI ≥3) | #8AB4F8 | #0B0B0B | 9.34:1 |

---

## 3. Tipografi

| Rol | Yazı tipi | Ağırlıklar | Neden |
|---|---|---|---|
| Başlık, skor, menü, buton | **Oswald** (Google Fonts, SIL OFL) | 500, 600, 700 | Güçlü, dar ve sporcu görünümlü. Resmî sitedeki Barlow Condensed'den farklı. |
| Gövde, form, reklam metni | **Source Sans 3** (Google Fonts, SIL OFL) | 400, 600, 700, 400 italik | Küçük boyutta çok okunaklı. Rakamları varsayılan olarak eşit genişlikte, bu da tablo ve saatler için uygun. |

**Türkçe karakter kontrolü:** Google Fonts'un `latin` ve `latin-ext` dosyaları indirildi ve karakter tabloları fontTools ile tarandı. Her iki yazı tipinde de **ç ğ ı İ ö ş ü Ç Ğ I Ö Ş Ü â î û ₺** karakterlerinin tamamı var. İkisinde de dile özgü biçimler (`locl`) tanımlı. Ekran görüntülerinde "İĞÜŞÖÇ", "HAFTANIN GOLLERİ" ve "TRİBÜN" doğru görünüyor. (Karşılaştırma: Saira Condensed'de ₺ işareti yok.)

**Kurallar:**
- `<html lang="tr">` **zorunlu**. Bu olmadan `text-transform: uppercase`, "i" harfini "İ" yerine "I" yapar ("GOLLERI" gibi).
- Oswald'ın rakamları orantılı genişlikte. Skor gibi tek rakamlarda sorun olmuyor. Puan tablosu ve sayaçlar için Source Sans 3 kullanın (`body` içinde `tabular-nums` açık).
- Gövde metni 16 px, satır yüksekliği 1.5. Başlıklar BÜYÜK HARF (h1, h2), h3 normal yazımla.
- **KVKK notu:** `tasarim.css` yazı tiplerini Google Fonts CDN'den yüklüyor. Bu, ziyaretçinin IP adresini Google'a gönderir. Yayında woff2 dosyalarını sunucunuzda barındırmanız önerilir (ör. `@fontsource/oswald`, `@fontsource/source-sans-3`; `latin` ve `latin-ext` alt kümeleri gerekli). Bunu yaparsanız `@import` satırını kendi `@font-face` tanımlarınızla değiştirin.

---

## 4. Bileşen rehberi

Tüm sınıflar `tasarim.css` içinde tanımlı. Örnekleri `ornek.html` dosyasında görebilirsiniz.

**Başlık çubuğu (`.ust-bar`)**
- Her iki temada siyah (#0B0B0B, koyu temada #000) ve altında 4 px kırmızı çizgi.
- Solda amblem yuvası (40×48) ve uygulama adı (Oswald, büyük harf), altında küçük bir alt başlık. Sağda 44×44 tema düğmesi.
- Altında yatay kaydırılan menü (`.ust-nav`). Etkin sekme beyaz yazıyla ve kırmızı alt çizgiyle gösterilir (`aria-current="page"`).
- Hemen altında `.resmi-degil` şeridi bulunur. **Bu şerit kaldırılmamalı.**

**Haber kartı (`.kart.haber-kart`)**
- 16:9 görsel. Sol altta dolu kırmızı kategori etiketi (`.etiket--dolu`).
- Başlık Oswald 600 / 18 px, altında soluk renkli tarih.
- Kartın üzerine gelince başlık kırmızıya döner.
- Manşet varyantı (`.haber-kart--manset`): mobilde 4:5, masaüstünde 21:9 görsel. Yazı, görselin üstünde siyah degradenin içinde. En kötü durumda bile (beyaz fotoğraf) beyaz yazının kontrastı 9.15:1.

**Maç kartı (`.mac-kart`)**
- Üstte durum ("Bitti", `.durum--canli` ile yanıp sönen "Canlı" ya da kırmızı "Sıradaki" etiketi) ve hafta/lig bilgisi.
- Ortada üç sütun: ev sahibi, skor (Oswald 700 / 36 px) ya da başlama saati, deplasman.
- Takımlar **arma yerine baş harf rozetiyle** gösterilir (`.takim-rozet`; bizim takım için `--biz`). Diğer kulüplerin armaları da onların markasıdır.
- Altta tarih, saat ve stadyum. Sıradaki maç 2 px kırmızı çerçeveyle vurgulanır.
- Ekran okuyucu için skora `aria-label="Skor 1 - 3"` verilir.

**Gol kartı (`.gol-kart`)**
- 16:9 video alanı. Sol üstte siyah dakika rozeti ("37'"), ortada 64 px kırmızı ve beyaz kenarlı oynat düğmesi (`aria-label` ile), sağ altta video süresi.
- Altında oyuncu adı (Oswald, büyük harf) ve gol detayı.
- Videoları kulübün ya da yayıncının kendi gömme kodu (YouTube vb.) ile gösterin. Maç görüntülerinin hakları yayıncıdadır, dosyayı kopyalayıp barındırmayın.

**Yorumlar (`.yorumlar`, `.yorum`, `.yorum-form`)**
- 40 px baş harf avatarı, kalın ad, soluk zaman bilgisi, metin ve "Beğen / Yanıtla" hayalet butonları.
- Form: etiketli textarea, kenarı 3:1 üzeri. "Gönder" birincil, "Vazgeç" ikincil buton.
- Uzun kelimeler `overflow-wrap: anywhere` ile satıra sığdırılır.

**Butonlar (`.btn`)**
- En az 44 px yükseklik, Oswald 600, büyük harf.
- `--birincil`: kırmızı zemin, beyaz yazı; üzerine gelince #A80000.
- `--ikincil`: metin renginde 2 px çerçeve; üzerine gelince renkler yer değiştirir.
- `--hayalet`: kırmızı yazı; üzerine gelince açık kırmızı zemin.
- Odak durumu: mavi odak halkası (#0B57D0 / #8AB4F8). Kırmızıdan ayırt edilebilmesi için bilerek mavi seçildi.

**Reklam / Sponsor kartı (`.reklam-kart`)**
- Editoryal içerikten açıkça ayrılır: açık sarı zemin (koyu temada koyu kahve), **kesikli altın kenar** ve sol üstte her zaman görünen **"● REKLAM"** ya da **"● SPONSOR"** etiketi (Source Sans 3, 12 px, kalın, büyük harf, geniş aralık). Etiket kontrastı 7.09:1 (açık) ve 10.30:1 (koyu).
- Reklam kartında Oswald ve kulüp kırmızısı kullanılmaz; buton nötr siyah/beyazdır. Böylece reklam kulüp içeriği gibi görünmez.
- "Sponsor" etiketi uygulamanın sponsoru içindir. Metinde kulübün sponsoru olmadığı belirtilmelidir. Kulübün sponsorlarının logolarını izinsiz kullanmayın.

**Diğer:** `.etiket` (açık kırmızı zeminli kategori), `.etiket--altin`, `.form-rozet--g/b/m`, `.ust-etiket` (kırmızı çizgili bölüm etiketi), `.gunes-motif` (soyut güneş kursu süsü), `.alt-bilgi`.

---

## 5. Hukuki not

Çorum FK'nın adı, amblemi ve forma tasarımları kulübün fikrî mülkiyetidir. Amblem hem telif hakkıyla korunan bir eser hem de ticari işaret niteliğindedir. Wikipedia bile amblemi "özgür olmayan logo" ve "adil kullanım" gerekçesiyle, yalnızca tanıtım amacıyla kullanıyor. Bu uygulama reklam ve sponsor kartları içerdiği için ticari bir kullanım sayılabilir. Bu nedenle **resmî amblemi uygulamaya koymadan önce kulüpten yazılı izin alınması önerilir** (iletişim: kulübün resmî sitesindeki iletişim bilgileri, info@corumfk.com.tr, +90 364 213 19 19). İzin gelene kadar özgün yedek monogram kullanılmalı. Uygulamanın adında "resmî" kelimesi geçmemeli ve kulübün sponsor logoları kullanılmamalı. **"Resmî Çorum FK uygulaması değildir"** ifadesi her sayfada ve uygulama mağazası açıklamasında görünür kalmalı. Bu not hukuki danışmanlık değildir. Yayından önce bir avukata ve TÜRKPATENT kayıtlarına danışılması önerilir.

---

## 6. Logo planı

**Yuva:** Uygulama klasöründe `assets/logo/` oluşturun. Klasöre şunları koyun:
- `amblem-yedek.svg`: bu klasördeki özgün monogram (her zaman bulunsun).
- `amblem.svg` ya da `amblem.png`: **yalnızca kulüpten izin alındıktan sonra** sahibin ekleyeceği resmî dosya. PNG kullanılacaksa en az 256×256 boyutunda ve şeffaf zeminli olsun.

**Otomatik geri dönüş sırası:** `amblem.svg` → `amblem.png` → `amblem-yedek.svg` → yazı işareti ("ÇFK" kırmızı rozet). Dosya yoksa sayfa bozulmaz:

```html
<span class="amblem"><img data-amblem alt="" width="40" height="48"></span>
```

```js
(function () {
  var adaylar = ['assets/logo/amblem.svg', 'assets/logo/amblem.png', 'assets/logo/amblem-yedek.svg'];
  document.querySelectorAll('img[data-amblem]').forEach(function (img) {
    var i = 0;
    img.addEventListener('error', function () {
      i++;
      if (i < adaylar.length) { img.src = adaylar[i]; return; }
      var yazi = document.createElement('span');          // son çare: yazı işareti
      yazi.className = 'takim-rozet takim-rozet--biz';
      yazi.textContent = 'ÇFK';
      img.replaceWith(yazi);
    });
    img.src = adaylar[0];
  });
})();
```

- `alt=""` kullanılıyor çünkü uygulama adı amblemin hemen yanında yazıyla bulunuyor. Amblem tek başına gösteriliyorsa `alt="Çorum FK amblemi"` (resmî dosya) ya da `alt="Çorumspor Taraftar"` (yedek) yazın.
- 404 hatalarının konsolda görünmesini istemiyorsanız, derleme sırasında bir `assets/logo/manifest.json` dosyasına hangi dosyanın bulunduğunu yazıp yalnızca onu yükleyebilirsiniz.
- Favicon için de yedek monogram kullanılabilir: `<link rel="icon" href="assets/logo/amblem-yedek.svg" type="image/svg+xml">`.
- **Yedek monogram hakkında:** Kalkan biçiminde. Üst kısım kırmızı ve üzerinde beyaz "ÇFK" harfleri (Oswald Bold harf çizgileri yola dönüştürüldü, yani yazı tipi yüklenmese de aynı görünür). Altta beyaz bir çizgi, siyah bir bant ve altın bir şimşek var. Kulübün yuvarlak rozetinden, çift başlı kartalından, "ÇORUM FUTBOL KULÜBÜ" yazısından ve "2018" tarihinden hiçbirini içermez. Bilerek farklı tutuldu.

---

## 7. Kaynaklar

1. Kulüp künyesi, "Kulübümüz": https://corumfk.com.tr/arca-corum-fk ("Renkler Kırmızı #CC0000 Siyah #0B0B0B", kuruluş 2018, ticari unvan, stat)
2. Resmî site ana sayfa ve CSS değişkenleri: https://corumfk.com.tr/ (amblem adresi `/demo/corumfk/crest.svg`, yazı tipleri Barlow Condensed / Inter / IBM Plex Mono, #BizAnadoluyuz)
3. Wikipedia, Çorum F.K.: https://en.wikipedia.org/wiki/%C3%87orum_F.K. ve Türkçe Vikipedi: https://tr.wikipedia.org/wiki/%C3%87orum_FK
4. Kulübün stadyum sayfası: https://corumfk.com.tr/stadyumumuz
5. Kulübün tarihçe sayfası: https://corumfk.com.tr/tarihce
6. Footy Headlines, Çorum FK 26-27 iç saha forması: https://www.footyheadlines.com/0966610448/corum-fk-26-27-home-kit-released.html
7. Çorum Store, 2026/27 formalar: https://corumstore.com/magaza/
8. Wikipedia dosya sayfası (non-free logo): https://en.wikipedia.org/wiki/File:%C3%87orum_F.K._crest.svg
9. Türkçe Vikipedi dosya sayfası (adil kullanım): https://tr.wikipedia.org/wiki/Dosya:%C3%87orum_FK.png
10. Kırmızı Şimşekler taraftar grubu haberi: https://www.haberler.com/muhsin-dere-corum-ve-taraftarlarimiz-sampiyonlugu-15593138-haberi/
11. StadiumDB, Çorum Şehir Stadyumu: https://stadiumdb.com/stadiums/tur/corum_sehir_stadyumu
12. NTV, Süper Lig'e yükselen son takım: https://www.ntv.com.tr/sporskor/super-lige-yukselen-son-takim-belli-oldu-1725734
13. Hitit güneş kursu tartışması: https://www.haberler.com/hitit-gunes-kursu-tartismasinda-corum-milletvekili-9695574-haberi/ ve https://en.wikipedia.org/wiki/Hittite_Sun_Course_Monument
14. Yazı tipleri: https://fonts.google.com/specimen/Oswald, https://fonts.google.com/specimen/Source+Sans+3 (SIL Open Font License)

---

## 8. Uygulamaya aktarım (entegrasyon notu, 5 Kasım 2026)

Rehber `assets/stil.css` içine aktarıldı (sınıf adları uygulamanınki kaldı; belirteçler ve görünüm bu rehberden). Farklar:

- **Yazı tipleri siteden:** `assets/fonts/` altında Oswald 500/600/700 ve Source Sans 3 400/600/700/400 italik, `latin` + `latin-ext`
  woff2 dosyaları (npm `@fontsource/oswald` 5.3.0, `@fontsource/source-sans-3` 5.3.1; SIL OFL, lisanslar aynı klasörde).
  `tasarim.css`'teki Google Fonts `@import` satırı **kullanılmadı** (KVKK + CSP). `font-display: swap`.
- **Skor, dakika, rapor sayıları:** Source Sans 3 `tabular-nums` (rehberdeki Oswald skor yerine; eşit genişlikli rakam).
- **Amblem:** HTML varsayılan olarak doğrudan `assets/logo/amblem-yedek.svg` yükler (olmayan dosya istenmez, konsolda 404 yok).
  Resmî amblem izinle eklenirse `assets/ayar.js` → `AMBLEM_DOSYASI` yazılır; sıra: o dosya → yedek → "ÇFK" yazı işareti.
- **Tema düğmesi:** üst barda (telefonda menü satırının sonunda). Seçim `<html data-theme>` ve tarayıcıda `localStorage 'tema'`.
- **Güneş kursu motifi:** "sıradaki maç" kartında ve maç başlığında, %10 saydamlıkta.
- **Reklam kartı:** modülün kartı (assets/reklam/reklam.css) bu rehberdeki altın kartla eşlendi (`stil.css` sonu).

Uygulamada eklenen renk çiftleri (aynı formülle hesaplandı; hepsi eşiği geçiyor):

| Tema | Kullanım | Ön plan | Arka plan | Oran | Eşik |
|---|---|---|---|---|---|
| Açık | başarı mesajı | #1E7D3A | #E9F5EC | 4.63:1 | 4.5 |
| Açık | panel "yayında" yazısı / kart | #1E7D3A | #F6F4F0 | 4.72:1 | 4.5 |
| Koyu | başarı mesajı | #4CC074 | #10261A | 6.92:1 | 4.5 |
| Koyu | panel "yayında" / kart | #4CC074 | #161618 | 7.83:1 | 4.5 |
| Açık | panel mavi bilgi / kart | #0B57D0 | #F6F4F0 | 5.81:1 | 4.5 |
| Koyu | panel mavi bilgi / kart | #8AB4F8 | #161618 | 8.57:1 | 4.5 |
| Her iki | sıradaki maç üst satır / koyu degrade | #C9C6C0 | #2B0A10 | 10.68:1 | 4.5 |
| Her iki | maç meta / koyu degrade | #E4E1DB | #2B0A10 | 13.95:1 | 4.5 |
| Her iki | "Çorum FK" adı (kırmızı) / degrade | #FF6B66 | #2B0A10 | 6.54:1 | 4.5 |
| Koyu | seçili sekme / zemin | #FF8A85 | #0B0B0B | 8.65:1 | 4.5 |
| Koyu | hata / tehlike metni / kart | #FF8A85 | #161618 | 7.94:1 | 4.5 |
| Açık | reklam metni / reklam zemini | #141414 | #FFF6DB | 17.07:1 | 4.5 |
| Koyu | reklam metni / reklam zemini | #F3F1EC | #2A2312 | 13.81:1 | 4.5 |
| Her iki | logo alt yazısı / menü (koyu temada #000 bar) | #C9C6C0 | #000000 | 12.32:1 | 4.5 |
| Her iki | boş kapak yazısı / koyu kırmızı çubuk | #FFFFFF | #A80000 | 7.88:1 | 4.5 |
| Her iki | test modu şeridi | #111111 | #FDE047 | 14.32:1 | 4.5 |

`kontrast.py` aynı klasörde; rehberdeki tablo `python3 docs/kontrast.py` ile yeniden üretilir (0 başarısız).
