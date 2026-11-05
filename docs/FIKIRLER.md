# Çorumspor Taraftar Uygulaması: Reklam ve Sponsorluk İçin Yeni Fikirler

Hazırlayan: Claude, Mert için
Tarih: 5 Kasım 2026
Durum: Öneri belgesi. Temel reklam sistemi ayrıca kuruluyor; bu belge onun **üstüne** eklenecekleri anlatıyor. Temel sistemi değiştirmiyoruz.

---

## 0. Bir bakışta (5 dakikada okuyun)

**Neden şimdi?** Çorum FK 2026-27'de tarihinde ilk kez Süper Lig'de oynuyor ([GZT](https://www.gzt.com/spor/corumspor-super-lig-fiksturu-2026-2027-corumspor-maclari-hangi-hafta-buyuk-maclar-ne-zaman-4239878)). Taraftar ilgisi hiç bu kadar yüksek olmadı. Fenerbahçe maçı (11. hafta) Çorum'da oynanacak. Yerel esnafa "şehrin konuştuğu yerde görünün" demenin en kolay olduğu dönem bu.

**Asıl sorun:** Temel sistemde her alanda aynı anda **tek reklam** gösteriliyor (öncelik kazanır). Bu taraftar için iyi, çünkü uygulama reklam çöplüğüne dönmüyor. Ama satılabilecek yer az. Daha çok firmaya satmanın üç yolu var: (1) zamanı akıllıca bölmek, (2) taraftarı rahatsız etmeyen yeni alanlar açmak, (3) firmaya reklamın **işe yaradığını göstermek**, ki yenilesin.

**Önerilen 7 fikir (önem sırasıyla):**

| # | Fikir | Mert'e ne kazandırır | Zorluk |
|---|---|---|---|
| A | **Sponsor Paketleri + Doluluk Takvimi + Bitiş Hatırlatması** | Neyin boş olduğunu görür, hazır paketle satar, yenilemeyi kaçırmaz | Orta |
| B | **Aylık Firma Raporu (WhatsApp özeti + firmaya özel link + PDF)** | Firma sonucu görür, yeniler | Küçük |
| C | **Büyük Maç Haftası Paketi** | Fenerbahçe gibi maçlarda tek firmaya tüm alanları pahalıya satar | Küçük |
| D | **Taraftar Fırsatları: maç günü / gol / galibiyet indirim kuponu** | Esnaf "kaç müşteri geldi"yi sayabilir; en ikna edici ürün | Orta |
| E | **Gol Sponsoru** | Gol arşivinde yeni, değerli bir alan | Küçük |
| F | **"Bizi Destekleyenler" vitrini + QR çıkartma** | Sınırsız yer: küçük esnafa ucuz paket satılır | Küçük-Orta |
| G | **Sponsorlu "Maçın Oyuncusu" anketi** | Her maçtan sonra yeni bir sponsor alanı, taraftar uygulamaya geri gelir | Orta |

**Bunlardan önce yapılması gereken temel iş:** dürüst sayım (sahte tıklama, bot ve Mert'in kendi bakışları sayılmaz) ve kişisel veri tutmadan sayım (KVKK). Rapor güvenilir olmazsa hiçbir paket satılmaz. Ayrıntısı bölüm 4'te.

**Önerilen sıra:**
1. Hemen (mümkünse Fenerbahçe maçından önce): Firma kartı, Büyük Maç Haftası sihirbazı (C), dürüst sayım, Aylık Rapor (B).
2. Sonra: Paketler + Doluluk Takvimi (A), Vitrin + QR (F).
3. Sonra: Fırsatlar (D) ve Gol Sponsoru (E). İkisi birlikte "gol atınca indirim" gibi güçlü bir ürün oluşturur.
4. Sonra: Maçın Oyuncusu anketi (G).

Belgenin sonunda **firmalara gönderilecek hazır teklif yazısı** (bölüm 6) ve **yasal yapılır / yapılmaz listesi** (bölüm 7) var.

---

## 1. Başlangıç noktası: temel sistem ne yapıyor?

Kısaca hatırlatma (başka bir çalışan bunu kuruyor, değiştirmiyoruz):

- Admin panelinde **Reklamlar** bölümü: firma adı, görsel, kısa metin, isteğe bağlı link (web sitesi veya WhatsApp), yerleşim, başlangıç/bitiş (Türkiye saati), durum (taslak / yayında / durduruldu), öncelik. Masaüstü ve mobil önizleme.
- Üç alan: ana sayfa haber akışında bir kart, haber sonunda bir alan, maç detayında "Maçın sponsoru" (belirli bir maça bağlanabilir).
- Hepsinde "Reklam" / "Sponsor" yazısı. Açılır pencere yok. Videoların ve yorumların üstüne binmez. Reklam yoksa boş kutu görünmez.
- Aynı alanda en yüksek öncelik kazanır. Eşitse en yeni kazanır.
- Rapor: görüntülenme (ekranda gerçekten görünen, aynı sayfa ziyaretinde bir kez sayılan), tıklama, tıklama oranı, tarih aralığı, CSV indirme.

Bu belgedeki her fikir bu yapının üstüne kurulu. Yeni alan açan fikirler (gol, anket, fırsat, vitrin) temel sistemdeki **yerleşim** listesine yeni bir seçenek ekleyerek çalışır. Böylece Mert her şeyi aynı Reklamlar ekranından yönetir.

---

## 2. Birinci tur: geniş fikir listesi (24 fikir)

Önce elemeden, aklımıza gelen her şeyi yazdık.

1. **Sponsor paketleri (Bronz / Gümüş / Altın):** Esnafa "şu fiyata şunlar" diye anlatılabilecek hazır paketler. Admin panelde paket seçince ilgili reklamlar hazır gelir.
2. **Doluluk takvimi:** Hangi alan hangi hafta ve hangi maçta dolu, hangisi boş, tek ekranda. "Satılabilir" boşluklar renkli görünür.
3. **Anlaşma bitiş hatırlatması:** Reklamın bitmesine 7 gün kala admin panelde uyarı ve hazır yenileme mesajı.
4. **Aylık firma raporu:** WhatsApp'a yapıştırılacak kısa özet, firmaya özel salt okunur rapor linki ve yazdırılabilir PDF.
5. **Gol sponsoru:** Gol arşivi ve maçtaki gol listesi "X sunar".
6. **Taraftar fırsatları (indirim kuponu):** Maç günü, gol sonrası veya galibiyet sonrası geçerli esnaf indirimleri. Kasada gösterilen canlı kupon.
7. **Sponsorlu "Maçın Oyuncusu" anketi:** Maç bitince taraftar oylar, sonuç kartında sponsor görünür.
8. **"Bizi Destekleyenler" vitrin sayfası:** Tüm destekçi esnafın listesi, adres, WhatsApp, yol tarifi.
9. **QR kodlar:** Esnafın camına "Taraftar Dostu İşletme" çıkartması, stat çevresinde afiş. Kaç kez okutulduğu sayılır.
10. **Büyük maç / derbi haftası paketi:** Fenerbahçe gibi maçların haftasında tüm alanlar tek firmaya, yüksek fiyata.
11. **"İlk 11 açıklandı" kartı sponsoru:** Kadro haberine küçük sponsor şeridi.
12. **Canlı skor / dakika dakika sponsoru:** Maç anlatımının üstünde sponsor.
13. **Deplasman otobüsü / taraftar etkinliği sponsoru:** Deplasman organizasyonları, izleme partileri için sponsor.
14. **Maç günü rehberi:** Stada ulaşım, otopark, maç öncesi nerede yenir. Listede sponsor işletmeler öne çıkar.
15. **Skor tahmin oyunu (ödülsüz) sponsorlu:** Maç öncesi tahmin, sezon boyu puan tablosu.
16. **Sponsorlu çekiliş / ödüllü yarışma:** "Tahmin et, forma kazan."
17. **Sponsorlu bildirim (push):** "Maç başlıyor, X kebap sunar."
18. **Video öncesi reklam:** Gol videosundan önce birkaç saniyelik reklam.
19. **Yorumların arasına reklam.**
20. **Firmanın kendi reklamını yüklediği panel:** Esnaf kendi giriş yapar, görsel yükler.
21. **Alan paylaşımı (rotasyon):** Aynı alanda 2-3 reklamın sırayla gösterilmesi.
22. **Sezon sonu "Teşekkürler" duvarı:** Sezon özeti sayfasında tüm sponsorlar.
23. **Haftalık sponsorlu bülten (e-posta / WhatsApp):** Haftanın özeti, içinde sponsor.
24. **Temel güvence: dürüst ve KVKK uyumlu sayım.** Sahte tıklama koruması, bot filtresi, Mert'in kendi bakışlarının sayılmaması, kişisel veri tutmadan sayım. (Aslında bir "fikir" değil, satışın ön koşulu.)

Bahis, kripto, "fan token" ortaklıkları ya hiç düşünülmedi ya da yasal nedenlerle baştan dışarıda bırakıldı (bkz. bölüm 7).

---

## 3. İkinci tur: eleştirel değerlendirme

**Ölçüler:**
- **Satış değeri:** Mert'in daha çok firmaya, daha iyi fiyata satmasına ne kadar yardım eder?
- **Taraftar değeri:** Taraftar bunu sever mi, en azından rahatsız olmaz mı?
- **Zorluk:** K = küçük (birkaç gün), O = orta (1-2 hafta), B = büyük (3 hafta ve üstü). Kaba tahmindir.
- **Risk:** Hukuki, itibar ya da teknik risk.

| # | Fikir | Satış | Taraftar | Zorluk | Risk | Karar |
|---|---|---|---|---|---|---|
| 1 | Sponsor paketleri | Yüksek | Nötr | K | Düşük | **Geliştir (A)** |
| 2 | Doluluk takvimi | Yüksek | Nötr | O | Düşük | **Geliştir (A'ya katıldı)** |
| 3 | Bitiş hatırlatması | Yüksek | Nötr | K | Düşük | **Geliştir (A'ya katıldı)** |
| 4 | Aylık firma raporu | Yüksek | Nötr | K | Düşük | **Geliştir (B)** |
| 5 | Gol sponsoru | Yüksek | Orta | K | Düşük | **Geliştir (E)** |
| 6 | Taraftar fırsatları / kupon | Çok yüksek | Yüksek | O | Orta (indirim kuralları) | **Geliştir (D)** |
| 7 | Maçın Oyuncusu anketi | Orta | Yüksek | O | Düşük (ödülsüz olursa) | **Geliştir (G)** |
| 8 | Bizi Destekleyenler vitrini | Yüksek | Orta | K | Düşük | **Geliştir (F)** |
| 9 | QR kodlar | Orta | Orta | K | Düşük (afiş izni) | **Geliştir (F'ye katıldı)** |
| 10 | Büyük maç haftası paketi | Çok yüksek | Nötr | K | Orta (mevcut reklamlarla çakışma) | **Geliştir (C)** |
| 11 | İlk 11 kartı sponsoru | Orta | Nötr | K | Düşük | Sonra. Kadro haberi düzenli giriliyorsa kolay bir ek alan. |
| 12 | Canlı skor sponsoru | Düşük | Düşük | K | Düşük | **Ele.** "Maçın sponsoru" zaten aynı ekranda; aynı şeyi iki kez satmak olur. |
| 13 | Deplasman otobüsü / etkinlik sponsoru | Orta | Yüksek | B | Yüksek (organizasyon sorumluluğu, kaza, para toplama) | Sonra. Organizasyonu taraftar grupları yapıyorsa, sadece "duyuru + sponsor" kartı olarak düşünülebilir. |
| 14 | Maç günü rehberi | Orta | Yüksek | O | Düşük | Sonra. Vitrinin (F) "maçtan önce" filtresi olarak başlatılabilir. |
| 15 | Skor tahmin oyunu | Orta | Yüksek | O | Orta (bahis çağrışımı) | Sonra. Ödülsüz ve "bahis" kelimesi hiç geçmeden yapılabilir. Önce anket denensin. |
| 16 | Sponsorlu çekiliş / ödül | Yüksek | Yüksek | O | **Yüksek** (Milli Piyango izni) | **Ele.** İzinsiz çekiliş soruşturma konusu oluyor (bkz. bölüm 7). |
| 17 | Sponsorlu bildirim | Orta | **Olumsuz** | K | Yüksek (ticari ileti kuralları, uygulama silinir) | **Ele.** Bildirimler sadece maç ve haber için kalmalı. |
| 18 | Video öncesi reklam | Orta | **Olumsuz** | O | Orta | **Ele.** Temel kurala aykırı (videoların üstüne reklam binmez). |
| 19 | Yorumlar arasında reklam | Düşük | **Olumsuz** | K | Orta | **Ele.** Temel kurala aykırı. |
| 20 | Firmanın kendi paneli | Düşük | Nötr | B | Yüksek (yanlış veya yasak içerik, onay yükü) | **Ele.** Mert yüz yüze satıyor ve kontrol onda kalmalı. Yerine firmaya salt okunur rapor linki (B). |
| 21 | Alan paylaşımı (rotasyon) | Yüksek | Nötr | O | Orta (rapor ve fiyat karışır) | Sonra. Önce zamanı takvimle bölelim (A). Takvim dolarsa açılır. |
| 22 | Sezon sonu teşekkür duvarı | Orta | Orta | K | Düşük | Sonra (Mayıs 2027). Vitrinin (F) sezon sonu görünümü olarak 1 günlük iş. |
| 23 | Sponsorlu bülten | Orta | Düşük | O | Yüksek (İYS kaydı ve onay şart) | **Ele** (şimdilik). |
| 24 | Dürüst ve KVKK uyumlu sayım | Dolaylı ama şart | Yüksek (gizlilik) | K-O | Düşük | **Zorunlu temel** (bölüm 4) |

**Sonuç:** 7 fikir geliştirilecek (A-G). 1 zorunlu temel iş var. 7 fikir sonraya kaldı, 7 fikir elendi.

**Elerken kullandığımız kural:** Taraftarı rahatsız eden, temel kuralları ("pop-up yok, video ve yorumun üstüne yok") delen ya da Mert'i hukuki riske sokan her şey elendi. Kalanlar arasında en çok "esnafa somut sonuç gösteren" fikirler öne alındı. Yerel esnaf soyut "görüntülenme" sayısından çok "kaç müşteri geldi" sorusunu umursar.

**Benzer örnekler (bunlar zaten Türkiye'de çalışıyor):**
- Ankaragücü'nün uygulamasında esnaf uygulama içinden paket alıyor; taraftar uygulamayı dükkanda gösterince indirim alıyor ([CNN Türk](https://www.cnnturk.com/spor/futbol/ankaragucunun-mobil-uygulamasi-cikti-725566)).
- Samsunspor FC uygulamasında taraftar uygulamadan QR kod üretip anlaşmalı restoran ve kafelerde indirim kullanıyor ([App Store](https://apps.apple.com/tr/app/samsunspor-fc/id6746769048?l=tr)).
- Trabzonspor taraftar grubu VİRA, bir deplasman maçı öncesi 20'ye yakın işletmeyle %50'ye varan "dostluk indirimi" kampanyası yaptı ([DHA](https://www.dha.com.tr/foto-galeri/egeden-karadenize-vefa-koprusu-misafir-taraftara-dostluk-indirimi-2863909)).
- Şekerbank ile Sivasspor, taraftar harcamalarının kulübe destek olduğu bir POS modeli kurdu ([CNBC-e](https://www.cnbce.com/haberler/sekerbank-ve-sivasspordan-isbirligi-taraftar-pos-ile-harcamalar-kulube-destek-olacak-h39111)).

Kısacası esnaf indirimi ve uygulama birleşimi Türk taraftarına tanıdık geliyor. Fikir D bu yüzden en güçlü öneri.

---

## 4. Zorunlu temel: dürüst ve KVKK uyumlu sayım

Bu iş satılmaz ama bütün satışlar buna dayanır. Bir esnaf "1.000 tıklama dedin ama bir tane müşteri gelmedi" derse güven biter.

**Taraftar ne görür?** Hiçbir şey. Arka planda çalışır.

**Ne yapılmalı (temel sistemi yapan çalışana iletilecek liste):**
1. **Mert'in kendi bakışları sayılmaz.** Admin girişi yapmış kişinin görüntülemesi ve tıklaması, ayrıca önizleme ekranı sayılmaz.
2. **Görüntülenmenin tanımı yazılı olsun:** Reklamın en az yarısı ekranda, en az 1 saniye kalırsa sayılır. Bu, reklam sektöründe kullanılan yaygın ölçüdür. Raporda da bu tanım küçük harflerle yazsın ki firma neyi aldığını bilsin.
3. **Tekrarlanan tıklama sayılmaz:** Aynı cihazdan aynı reklama 30 dakika içinde gelen ikinci tıklama sayılmaz.
4. **Botlar sayılmaz:** Arama motoru robotları ve otomatik programlar ayıklanır.
5. **Ani sıçrama uyarısı:** Bir reklamın tıklaması bir saatte normalin 5 katına çıkarsa Mert'e admin panelde uyarı düşer. Bunun nedeni bir rakibin ya da bir şakacının arka arkaya tıklaması olabilir.
6. **Kişisel veri tutulmaz:**
   - IP adresi, isim, telefon kaydedilmez.
   - Görüntülenme tekrarını önlemek için sadece o sayfa ziyaretine ait, geçici ve rastgele bir numara kullanılır. Bu numara cihazda saklanmaz.
   - Tıklama tekrarı, oylama ve kupon için cihazı tanımak gerekir. Bunun için rastgele, isimsiz bir cihaz numarası kullanılır, sunucuda da sadece şifrelenmiş (karıştırılmış) hali tutulur. Bu numara sadece bu özelliğin çalışması için kullanılır, başka bir yerle paylaşılmaz, reklam hedeflemek için kullanılmaz.
   - Firmalara sadece **toplam sayılar** gider. Hiçbir taraftar bilgisi firmaya verilmez.
7. **Gizlilik metni (aydınlatma metni) güncellensin:** "Reklam alanlarının kaç kez görüldüğünü isimsiz olarak sayıyoruz" gibi bir cümle eklensin. Google Analytics gibi dış analiz araçları kullanılıyorsa, KVKK'nın çerez rehberine göre önceden ve ayrı ayrı onay alınmalı. Önceden işaretli kutu ve "kabul etmeden giremezsin" duvarı olmamalı ([KVKK Çerez Rehberi](https://kvkk.gov.tr/Icerik/7353/Cerez-Uygulamalari-Hakkinda-Rehber), [2025 güncellemesi özeti](https://www.erdem-erdem.av.tr/bilgi-bankasi/kisisel-verileri-koruma-kurumu-cerez-uygulamalari-hakkinda-rehberi-guncelledi), [hukuk yorumu](https://hukukcularevi.com/cerez-politikasi-ve-cerez-onayi-kvkk/)). Kendi sunucumuzda, isimsiz ve kişiyi tanımayan sayım için onay gerekmeyebilir, ama bu konuda görüşler farklı. Bir avukata bir kez sorulması iyi olur.
8. **"Resmi değildir" ibaresi:** Uygulamanın alt kısmında ve vitrinde "Bu uygulama taraftarlar tarafından hazırlanmıştır, Çorum FK'nın resmi uygulaması değildir" yazsın. Kulübün kendi resmi sponsorları var ([Halk TV](https://halktv.com.tr/spor/corum-fknin-yeni-sponsorlari-belli-oldu-961510h)). Bizim sponsorlarımız "Çorum FK resmi sponsoru" gibi görünmemeli (bkz. bölüm 7).

**Gereken veri (yüksek seviye):** Mevcut olay kayıtlarına (görüntülenme ve tıklama) iki alan eklenir: "sayıldı / sayılmadı" ve "neden sayılmadı" (admin, bot, tekrar). Böylece Mert isterse "elenen tıklamalar" sayısını da görür. Bu bilgi esnafa dürüstlüğü göstermek için iyi bir kanıttır.

---

## 5. Seçilen 7 fikrin ayrıntılı tarifi

Her fikir aynı düzende anlatıldı: **taraftar ne görür, Mert admin panelde ne yapar, hangi veriler gerekir, temel sisteme nasıl oturur, nelere dikkat edilmeli, esnafa ne söylenir.**

### Ön koşul: "Firma Kartı" (bütün fikirlerin ortak parçası)

Temel sistemde firma adı her reklamda düz yazı olarak giriliyor. Paket, rapor ve vitrin için her firmanın **tek bir kartı** olmalı.

- **Admin panelde:** Yeni bölüm **Firmalar**. Alanlar: firma adı, yetkili kişi, telefon, WhatsApp, adres, mahalle, sektör (yeme-içme, oto, eğitim, mobilya, düğün-organizasyon, spor salonu, diğer), logo, kısa tanıtım yazısı, harita linki, çalışma saatleri, iç notlar (sadece Mert görür).
- **Reklam formunda:** "Firma" alanı listeden seçilir. Firma adı otomatik dolar. Eski reklamlar bozulmaz, firma seçimi isteğe bağlıdır.
- **Veri:** Yeni bir **firmalar** tablosu. Reklamlar tablosuna isteğe bağlı bir "firma" bağlantısı eklenir.
- **Zorluk:** Küçük.

---

### A. Sponsor Paketleri + Doluluk Takvimi + Bitiş Hatırlatması

**Amacı:** Mert'in elinde "ne satabilirim, kime ne sattım, kimin süresi bitiyor" sorularının cevabı tek ekranda olsun. Esnafla konuşurken "Gümüş paket şunları içerir" diyebilsin.

**Taraftar ne görür?** Yeni bir şey görmez. Paket, satış ve planlama aracıdır.

**Mert admin panelde ne yapar?**

1. **Anlaşmalar** ekranı: "Yeni anlaşma" der, firmayı seçer, paketi seçer (Bronz / Gümüş / Altın / Büyük Maç / Özel), başlangıç tarihini girer.
   - Sistem paketin içindeki reklamları **taslak olarak** kendisi hazırlar. Örneğin Gümüş seçilince bir "Maçın sponsoru", bir "haber sonu" ve bir vitrin kaydı açılır.
   - Mert sadece görseli ve metni yükler, önizler, "Yayına al" der.
   - Anlaşılan tutarı, ödeme durumunu ("ödendi / bekliyor / kısmen") ve notları sadece kendi kaydı için yazar. **Uygulamada para alınmaz.** Bu alanlar kimseye görünmez.
2. **Doluluk Takvimi** ekranı: Satırlarda alanlar (Haber akışı, Haber sonu, Maçın sponsoru, Gol sponsoru, Anket sponsoru), sütunlarda haftalar ve maçlar.
   - Dolu kutuda firma adı yazar.
   - Boş kutu yeşil görünür: **"BOŞ, satılabilir"**.
   - İç saha maçları ve "büyük maç" olarak işaretlenmiş maçlar belirgin renktedir.
   - Boş kutuya dokunulunca "Bu alana anlaşma ekle" kısayolu açılır.
   - Mert esnafa giderken telefonda bu ekranı açıp "Şu iki hafta boş, Fenerbahçe maçı dolu" diyebilir.
3. **Bitiş hatırlatması:** Admin ana sayfasında "Süresi yaklaşanlar" kutusu bulunur. Örnek: "Kebapçı X'in reklamı 5 gün sonra bitiyor."
   - Yanında **"WhatsApp'ta yenileme teklifi gönder"** düğmesi vardır. Telefonun WhatsApp'ı, hazır yazılmış bir mesaj ve firmanın rapor linkiyle açılır (bkz. B). Mert göndermeden önce mesajı değiştirebilir.
   - Bu mesaj, Mert'in zaten görüştüğü firmaya giden kişisel bir mesajdır. Toplu gönderim yapılmaz.

**Önerilen paket içerikleri** (fiyatları Mert belirler; aşağıdaki oranlar sadece başlangıç önerisi):

| Paket | İçerik (1 aylık) | Kime uygun | Fiyat oranı önerisi |
|---|---|---|---|
| **Bronz: "Destekçi"** | Vitrinde yer (F), ayda 1 fırsat kuponu (D), aylık rapor (B) | Küçük esnaf, ilk kez deneyecekler | 1x |
| **Gümüş: "Maç Ortağı"** | Bronz + 1 iç saha maçında "Maçın sponsoru" + 1 hafta haber sonu alanı + 1 maç anket sponsorluğu (G) | Orta büyüklükte restoran, oto servis, kurs | ~3x |
| **Altın: "Ana Destekçi"** | Gümüş + 2 hafta haber akışı kartı + 1 ay gol sponsorluğu (E) + vitrinde en üstte büyük kart + QR çıkartma ve afiş (F) | Şehrin bilinen markaları | ~6x |
| **Büyük Maç Haftası** | Seçilen büyük maçın haftasında tüm alanlar tek firmada (C) | Görünmek isteyen her firma | Altın'ın yarısı ile tamamı arası, maça göre |
| **Sezonluk** | Herhangi bir paket, sezon sonuna kadar | Sadık destekçiler | Aylık toplamdan %15-20 indirim |

Bronz paketin "haber akışı" içermemesi bilinçli bir seçim: Bronz, sınırsız sayıda satılabilen alanlardan (vitrin, kupon) oluşur. Böylece 30 esnafa birden Bronz satılabilir, kıt alanlar (haber akışı, maç sponsoru) üst paketlere kalır.

**Gereken veri:**
- **anlaşmalar** tablosu: firma, paket türü, başlangıç, bitiş, tutar (iç kayıt), ödeme durumu, notlar.
- **paket şablonları:** Her paketin hangi alanlardan, kaç gün ya da kaç maç içerdiği. Mert ileride paketleri kendisi düzenleyebilsin.
- Reklamlar tablosuna isteğe bağlı "anlaşma" bağlantısı.
- Doluluk takvimi yeni veri istemez. Mevcut reklamların tarihlerinden ve maç listesinden hesaplanır.

**Temel sisteme nasıl oturur?** Paket sadece "birden çok reklamı birlikte oluşturan" bir kısayoldur. Reklamın gösterilme kuralı (öncelik ve tarih) hiç değişmez.

**Dikkat:**
- Takvim, aynı alanda aynı tarihte iki **yayında** reklam varsa sarı uyarı göstermeli: "Bu hafta haber akışında 2 reklam var, sadece yüksek öncelikli görünecek." Böylece Mert farkında olmadan iki firmaya aynı yeri satmaz.
- Doluluk takviminin "maç" sütunları fikstürden gelir. Maç tarihleri değişirse (erteleme) bağlı "Maçın sponsoru" reklamı da maçla birlikte kaymalı ya da Mert'e uyarı düşmeli.

**Esnafa söylenecek cümle:**
> "Üç paketim var, en küçüğü bir öğle yemeği müşterisi parasına. Ay sonunda size kaç kişinin reklamınızı gördüğünü ve kaçının tıkladığını gösteren raporu kendim gönderiyorum."

---

### B. Aylık Firma Raporu (WhatsApp özeti + firmaya özel link + PDF)

**Amacı:** Firma, reklamın işe yaradığını kendi gözüyle görsün ve yenilesin. Temel sistemdeki reklam raporu zaten var; bu fikir onu **firmanın anlayacağı dile** çeviriyor.

**Taraftar ne görür?** Hiçbir şey.

**Firma ne görür?**
- Mert'in WhatsApp'tan gönderdiği kısa bir özet ve bir link.
- Link, giriş gerektirmeyen, sadece o firmanın verilerini gösteren bir sayfaya açılır. Sayfada şunlar bulunur:
  - Firmanın logosu, dönem (örn. "1-31 Ekim 2026").
  - Her reklamın küçük resmi ve hangi alanda çıktığı ("Ana sayfa", "Fenerbahçe maçı sayfası").
  - Büyük rakamlar: **Görüntülenme**, **Tıklama**, **Tıklama oranı**. Fırsat kuponu varsa **"Kuponu açan"** ve **"Kasada kullanılan"** (D). Anket varsa **oy sayısı** (G). Gol sponsorluğu varsa **sponsorluk döneminde atılan gol sayısı** (E).
  - Basit bir günlük grafik. Maç günleri işaretli olur, böylece firma "maç günü zirve yapıyor" diye görür.
  - Küçük bir not: "Görüntülenme: reklamınızın en az yarısının ekranda en az 1 saniye göründüğü sayı. Aynı sayfa ziyaretinde bir kez sayılır. Kişi sayısı değildir."
  - **"PDF olarak indir / yazdır"** düğmesi.

**Mert admin panelde ne yapar?**
1. Firma kartında **"Rapor linki oluştur"** der. Link süresi seçilir (örneğin 3 ay); istendiğinde iptal edilebilir.
2. **"WhatsApp özeti kopyala"** düğmesine basar. Hazır metin panoya kopyalanır, Mert WhatsApp'a yapıştırır.

**Hazır WhatsApp özeti örneği:**
```
Merhaba Ahmet Bey,
[Firma Adı] reklamınızın Ekim 2026 özeti:
- Görüntülenme: 12.430 (reklamınızın ekranda göründüğü sayı)
- Tıklama: 214 (sitenize veya WhatsApp'ınıza gelen)
- Tıklama oranı: %1,7
- Maç günü kuponunuz kasada 38 kez kullanıldı
Ayrıntılı rapor: [link]
Kasım ayı için yeriniz hazır. Devam edelim mi?
Mert
```

**Gereken veri:**
- **rapor linkleri** tablosu: firma, gizli anahtar (tahmin edilemeyen uzun kod), oluşturulma, son geçerlilik, iptal edildi mi.
- Diğer bütün rakamlar temel sistemdeki sayımlardan gelir. Yeni sayım gerekmez.

**Temel sisteme nasıl oturur?** Temel raporun firmaya göre süzülmüş, sadeleştirilmiş, salt okunur hali. CSV indirme Mert'e kalır, firmaya gösterilmez.

**Dikkat:**
- "Görüntülenme"yi asla "kişi" diye yazmayın. Dürüst rakam uzun vadede daha çok satar.
- Link sadece o firmanın verisini göstermeli. Başka firmaların rakamları ve fiyatları asla görünmemeli.

**Esnafa söylenecek cümle:**
> "Afiş asarsınız, kaç kişi baktı bilemezsiniz. Burada her ay rakamı WhatsApp'ınıza gelir."

---

### C. Büyük Maç Haftası Paketi

**Amacı:** Fenerbahçe, Galatasaray, Beşiktaş, Trabzonspor maçları ve derbi niteliğindeki maçlar uygulamanın en çok açıldığı günlerdir. Bu haftaları tek firmaya, normal fiyatın üstünde satmak.

**Zamanlama:** Fenerbahçe maçı 11. haftada Çorum'da oynanacak; Galatasaray (1. hafta), Beşiktaş (3. hafta) ve Trabzonspor (14. hafta) maçları ise ilk yarıda deplasmanda ([GZT](https://www.gzt.com/spor/corumspor-super-lig-fiksturu-2026-2027-corumspor-maclari-hangi-hafta-buyuk-maclar-ne-zaman-4239878)). Fikstür genellikle ikinci yarıda tersine döndüğü için bu üç takımın Çorum'a geleceği maçlar ikinci yarıdadır. Kesin haftaları fikstürden kontrol edin. **Bu fikir hızlı yapılabildiği için Fenerbahçe maçına yetiştirilmeye çalışılmalı.**

**Taraftar ne görür?** O hafta haber akışı kartı, haber sonu alanı, maç sayfasındaki "Maçın sponsoru", gol sponsoru ve anket sponsoru aynı firmadır. Görsel bütünlük olur, örneğin "Fenerbahçe haftası [Firma] ile". Reklam sayısı artmaz, sadece aynı yerlerde aynı firma görünür. Taraftar için hiçbir şey kötüleşmez.

**Mert admin panelde ne yapar?**
1. Maç listesinde maçı **"Büyük maç"** olarak işaretler. Doluluk takviminde bu maç öne çıkar.
2. **"Büyük Maç Paketi oluştur"** sihirbazını açar:
   - Firmayı seçer.
   - Pencereyi seçer: varsayılan olarak maçtan 3 gün önce 00:00'dan maçtan 1 gün sonra 23:59'a kadar (Türkiye saati).
   - Tek bir görsel ve metin yükler (isterse alan başına farklı görsel).
   - Sihirbaz her alan için birer reklam oluşturur. Bu reklamların önceliği o alandaki en yüksek öncelikten bir fazla olur; böylece pencere boyunca kazanırlar. Pencere bitince eski reklamlar kendiliğinden geri gelir.
3. **Çakışma kontrolü:** Sihirbaz "Bu tarihlerde haber akışında Mobilyacı Y'nin reklamı var" der ve iki seçenek sunar:
   - (a) "Mobilyacı Y'nin bitiş tarihini 5 gün uzat" (kaybettiği günleri telafi eder),
   - (b) "Yine de devam et".
   Bu, Mert'in daha önce sattığı firmayı mağdur etmemesi için önemlidir.

**Gereken veri:**
- Maçlar tablosuna **"büyük maç"** işareti.
- Reklamlara isteğe bağlı **"paket grubu"** bağlantısı, böylece büyük maç reklamları tek kayıt gibi görünür ve raporlanır.
- Gösterim kuralında **hiçbir değişiklik yoktur**. Mevcut "öncelik kazanır" kuralı kullanılır.

**Temel sisteme nasıl oturur?** Tamamen mevcut öncelik ve tarih kurallarıyla çalışır. Sihirbaz sadece Mert'in elle yapacağı 4-5 işlemi tek seferde yapar.

**Dikkat:** Altın veya Gümüş paket satarken "büyük maç haftaları hariçtir, onlar ayrıca satılır" cümlesini sözleşmeye ve teklif yazısına koyun.

**Esnafa söylenecek cümle:**
> "Fenerbahçe Çorum'a geliyor. O hafta bütün Çorum bu uygulamaya bakacak, ve o hafta uygulamada sadece sizin adınız olacak."

---

### D. Taraftar Fırsatları: maç günü / gol / galibiyet indirim kuponu

**Amacı:** Esnafın en çok istediği şey dükkana gelen müşteridir. Kupon bunu **sayılabilir** yapar. Taraftar da gerçek bir fayda görür ("uygulamayı açınca indirim çıkıyor"). Türkiye'de Samsunspor ve Ankaragücü uygulamaları benzer bir model kullanıyor (bölüm 3).

**Taraftar ne görür?**
1. Menüde **"Fırsatlar"** bölümü bulunur. Esnafın aktif indirimleri liste halinde görünür: logo, "Maç günü tüm dürümlerde %15", geçerlilik ("Bugün 23:59'a kadar"), mahalle.
2. Ana sayfa haber akışındaki tek reklam kartı bir fırsatı da gösterebilir. Kart üzerinde "Sponsor" yazısı ve "Fırsatı gör" düğmesi olur. Yeni bir kart açılmaz, mevcut tek kart kullanılır.
3. Taraftar **"Kuponu göster"** der. Tam ekran kupon açılır:
   - Firma adı, indirim, kısa koşullar ("Masa başına 1 kupon, paket serviste geçmez").
   - Kupon kodu (örn. `CORUM15`).
   - **Canlı saat ve hareket eden takım renkleri.** Kasiyer bunun ekran görüntüsü değil, o an açılmış gerçek kupon olduğunu anlar.
   - **"Kasada kullan"** düğmesi.
4. "Kasada kullan"a basılınca **4 haneli işletme şifresi** sorulur. Şifreyi sadece işletme bilir. Kasiyer taraftarın telefonuna şifreyi yazar, kupon "Kullanıldı" olur ve sayılır. Aynı telefondan aynı kupon (Mert'in seçtiği kurala göre) günde 1 kez ya da toplam 1 kez kullanılabilir.
   - İşletme şifre girmekle uğraşmak istemezse kod yine de geçerlidir. O zaman sayım sadece "kuponu açan" olarak kalır.

**Kuponun ne zaman geçerli olacağı (Mert seçer):**
- **Tarih aralığında her gün.**
- **Sadece maç günleri** (Çorum FK'nın maç oynadığı gün, Türkiye saatiyle 00:00-23:59).
- **Galibiyetten sonra 24 saat.** Maç sonucu girilince kendiliğinden açılır. Örnek: "Kazandık! Yarın akşama kadar lahmacunlar %20 indirimli."
- **Çorum FK gol atınca 24 saat.** Gol sponsoruyla (E) birleşince güçlü bir ürün olur: "Her Çorum golünde [Firma]'da indirim."
- **Sadece iç saha maç günleri.** Stada gelen taraftar için, statta veya çevresindeki esnafa uygun.

**Mert admin panelde ne yapar?**
1. **Fırsatlar** ekranında "Yeni fırsat" der. Firma, başlık, açıklama, **koşullar (zorunlu alan)**, kod, işletme şifresi, geçerlilik türü, başlangıç-bitiş tarihi ve kullanım sınırı girilir.
2. Kaydetmeden önce bir hatırlatma kutusu işaretlenir: "Firmadan indirimin gerçek olduğunu, indirim öncesi fiyatın son 10 günün en düşük fiyatı olduğunu teyit ettim." (bkz. bölüm 7)
3. Raporda her fırsat için şunlar görünür: **görüntülenme, kuponu açan, kasada kullanılan**. Bu rakamlar aylık rapora (B) da girer.

**Gereken veri:**
- **fırsatlar** tablosu: firma, başlık, açıklama, koşullar, kod, işletme şifresi (şifrelenmiş saklanır), geçerlilik türü, başlangıç, bitiş, kullanım sınırı, durum.
- **fırsat olayları** tablosu: fırsat, olay türü (görüntülendi / kupon açıldı / kullanıldı), isimsiz cihaz numarası (şifrelenmiş), zaman.
- Maç sonucu ve gol bilgisi zaten uygulamada var (gol arşivi ve maç detayı). Tetikleyiciler buradan beslenir.

**Temel sisteme nasıl oturur?**
- Temel sistemdeki reklam linki seçeneklerine ("web sitesi", "WhatsApp") üçüncü bir seçenek eklenir: **"Uygulama içi fırsat"**. Böylece mevcut reklam kartları fırsata yönlendirebilir.
- Fırsatlar bölümü ayrı bir sayfadır. Haberlerin, videoların ve yorumların içine girmez.
- Para hiçbir şekilde uygulamadan geçmez. İndirimi esnaf kasada uygular.

**Dikkat:**
- Fırsat sayfasının üstünde net bir uyarı bulunsun: "Fırsatlar işletmeler tarafından sunulur. Koşullardan ve indirimden işletme sorumludur."
- Esnafa aynı anda en fazla 1-2 aktif fırsat izni verin, yoksa liste değersizleşir.
- **Ödül, çekiliş, "ilk 10 kişiye bedava" gibi şans unsuru taşıyan kampanyalar yapmayın.** Bunlar çekiliş sayılabilir ve izin gerektirir (bölüm 7). Herkese açık, şartları belli bir indirim güvenlidir.

**Esnafa söylenecek cümle:**
> "Reklamı görüp dükkanınıza gelen her taraftar kupon gösterir. Kasada sizin şifrenizle onaylanır, ay sonunda kaç müşteri getirdiğimizi tek tek sayarız."

---

### E. Gol Sponsoru

**Amacı:** Gol arşivi uygulamanın en çok tekrar açılan bölümlerinden biri. Burada şu an reklam alanı yok. Bu fikir yeni ve değerli bir alan açıyor ama taraftarı rahatsız etmiyor.

**Taraftar ne görür?**
- **Gol arşivi sayfasının başında** ince bir şerit: "Gol Arşivi, [Firma] katkılarıyla". Yanında logo ve "Sponsor" yazısı.
- **Her Çorum FK golünün kartında** videonun **altında** (asla üstünde değil) küçük bir etiket: "Sponsor: [Firma]".
- **Maç detayındaki gol listesinde** (dakika ve atan oyuncu) küçük logo.
- Rakip takımın gollerinde sponsor görünmez, çünkü hiçbir esnaf rakibin golüyle anılmak istemez.
- Fırsat bağlıysa (D) etiket şöyle olur: "Bu golün şerefine [Firma]'da 24 saat %10 indirim, fırsatı gör".

**Mert admin panelde ne yapar?** Normal reklam oluşturur gibi yeni reklam açar ve yerleşim olarak **"Gol sponsoru"** seçer. Başlangıç-bitiş tarihi girer. İsterse belirli bir maça bağlar (sadece o maçın gollerinde görünür). Öncelik kuralı aynıdır.

**Görünme kuralı (karar verdik):**
- Sponsor, **yayında olduğu süre boyunca** arşivdeki **tüm** Çorum FK gollerinde görünür.
- Sponsorluk bitince logo da kalkar. Eski goller önceki sponsorun adını sonsuza dek taşımaz; aksi halde yeni sponsor için alan kalmaz ve bitmiş sponsor bedavaya görünmüş olur.
- Raporda "sponsorluk döneminde atılan gol sayısı" ayrıca gösterilir. Bu, esnafın sohbetinde iyi bir konu olur ("Benim ayımda 7 gol attık").

**Gereken veri:**
- Temel sistemin yerleşim listesine **"Gol sponsoru"** eklenir.
- Görüntülenme sayımı, temel sistemdekiyle aynı şekilde gol arşivi sayfası ve gol kartları için yapılır.
- Yeni tablo gerekmez. Gol kayıtları zaten var.

**Temel sisteme nasıl oturur?** Sadece yeni bir yerleşim. Seçim (öncelik, tarih) ve raporlama aynı.

**Dikkat:** Gol videolarının üstüne, önüne veya içine hiçbir şey konmaz. Etiket video oynatıcısının dışında kalır. Gol videolarının yayın hakları ayrı bir konudur; uygulama zaten gol arşivi gösteriyorsa sponsorluk mevcut durumu değiştirmez.

**Esnafa söylenecek cümle:**
> "Çorum her gol attığında taraftar o golü tekrar tekrar izliyor. O ay o gollerin altında sizin adınız yazacak."

---

### F. "Bizi Destekleyenler" vitrini + QR çıkartma

**Amacı:** Haber akışı ve maç sponsoru gibi alanlar kıt. Vitrin ise **sınırsız**. Her destekçi esnafa kalıcı bir yer verir ve küçük esnafa ucuz Bronz paket satmayı mümkün kılar. QR çıkartma ise esnafın kendi dükkanında, uygulamanın da sokakta görünmesini sağlar.

**Taraftar ne görür?**
1. Menüde **"Bizi Destekleyenler"** sayfası. Başlıkta "Bu uygulamayı ayakta tutan Çorumlu işletmeler" yazar.
2. Firmalar pakete göre gruplanır. **Altın** üstte büyük kartlarla, **Gümüş** orta boyda, **Bronz** sade liste halinde.
3. Her kartta logo, firma adı, sektör, mahalle, kısa tanıtım ve düğmeler bulunur: **Ara**, **WhatsApp**, **Yol tarifi** (harita uygulamasını açar) ve aktif fırsat varsa **Fırsat**.
4. Üstte filtreler: sektör ("Yeme-içme", "Oto", ...) ve **"Maç öncesi"** (stada yakın, maç günü açık yerler). Bu filtre, sonraya bırakılan "Maç günü rehberi" fikrinin ilk adımıdır.
5. Sayfanın altında "Siz de destekçi olmak ister misiniz? Mert'e yazın" düğmesi bulunur. Bu, Mert'e yeni müşteri getirir.

**QR çıkartma:**
- Mert her destekçi firma için tek tıkla basılabilir bir **"Taraftar Dostu İşletme, Çorumspor Taraftar Uygulaması destekçisi"** çıkartması (A5 ya da kare) indirir. Çıkartmada firmanın adı ve bir QR kod bulunur.
- QR okutulunca uygulamanın içinde **o firmanın vitrin kartı** açılır. Uygulama yüklü değilse web sayfası açılır, oradan uygulamaya yönlendirilir.
- Mert ayrıca stat çevresi veya taraftar dernekleri için genel QR afişleri de üretebilir. Örnekler: "Stat, Kapı 3 afişi", "Taraftar derneği panosu". Her birinin ayrı adı ve sayacı olur.

**Mert admin panelde ne yapar?**
- Firma kartında "Vitrinde göster" seçilir. Seviye, anlaşmadaki paketten otomatik gelir ama elle değiştirilebilir.
- **QR Kodlar** ekranında "Yeni QR" denir: ad (örn. "Kebapçı X cam çıkartması"), hedef (firma vitrini / fırsat / ana sayfa). Sistem kısa bir link ve QR resmi üretir, basılabilir çıktı verir.
- Her QR'ın kaç kez okutulduğu görülür ve aylık rapora (B) eklenir.

**Gereken veri:**
- Firmalar tablosuna: vitrinde göster (evet/hayır), vitrin seviyesi, vitrin sırası, harita linki, çalışma saatleri, "maç öncesi uygun" işareti.
- **QR kodları** tablosu: kısa kod, ad, hedef türü, hedef, oluşturulma.
- **QR okutmaları** tablosu: QR, zaman. Kişisel veri tutulmaz, sadece sayı.

**Temel sisteme nasıl oturur?** Vitrin kartları reklam alanlarıyla yarışmaz, ayrı bir sayfadır. Vitrin kartı tıklamaları da temel sistemdeki gibi sayılır.

**Dikkat:**
- Stat içine veya kulüp alanlarına afiş asmak için kulübün ve stat yönetiminin iznini alın.
- Çıkartmada Çorum FK logosunu izinsiz kullanmayın. Takım renkleri ve "Çorumspor taraftarları" ifadesi yeterli (bölüm 7).
- Vitrindeki firma bilgilerini yılda bir kez kontrol edin. Kapanmış bir dükkanın vitrinde durması uygulamanın itibarını zedeler; anlaşması biten firma vitrinden kendiliğinden düşmeli.

**Esnafa söylenecek cümle:**
> "En küçük pakette bile uygulamada kalıcı bir sayfanız, camınızda 'Taraftar Dostu İşletme' çıkartmanız olur. Taraftar sizi bulmak için tek tıklar."

---

### G. Sponsorlu "Maçın Oyuncusu" anketi

**Amacı:** Taraftarı maçtan sonra da uygulamada tutmak ve her maç için yeni bir sponsor alanı açmak. Taraftarın en sevdiği şeylerden biri fikrini söylemek.

**Taraftar ne görür?**
1. **Maç bitince** maç detayında bir kart açılır: **"Maçın Oyuncusu kim? [Firma] sunar"**. Kartta sponsorun logosu ve "Sponsor" yazısı bulunur.
2. Maçta oynayan oyuncular listelenir. Mert listeyi admin panelden 5-8 adayla sınırlayabilir.
3. Taraftar bir oyuncuya dokunur. Oyu kaydedilir ve anlık yüzdeleri görür.
4. Anket **24 saat sonra** kapanır. Maç detayında kalıcı bir sonuç kartı kalır: **"Maçın Oyuncusu: [Oyuncu] (%42), [Firma] sunar"**.
5. (İkinci adım, isteğe bağlı) **"Paylaş"** düğmesi, sonucu WhatsApp durumu veya Instagram hikayesi için hazır bir resim olarak verir. Resmin köşesinde sponsor logosu bulunur. Böylece sponsor uygulamanın dışına da taşınır.

**Mert admin panelde ne yapar?**
1. Normal reklam oluşturur gibi yerleşim olarak **"Anket sponsoru"** seçer ve maçı bağlar. Tüm maçlar için bir sezon sponsoru da seçilebilir.
2. Maç sonucunu girince anket kendiliğinden açılır. Mert isterse "Şimdi aç" / "Şimdi kapat" düğmeleriyle elle de yönetir.
3. Adayları seçer ya da maç kadrosundan hazır gelen listeyi onaylar.
4. Raporda oy sayısı ve anket kartının görüntülenmesi görünür.

**Kurallar:**
- **Ödül yok.** "Oy ver, forma kazan" yapılmaz. Bu, izin gerektiren bir çekilişe dönüşebilir (bölüm 7).
- **Her taraftar bir oy.** Uygulamada giriş sistemi varsa (yorumlar için) hesap başına bir oy, yoksa cihaz başına bir oy (isimsiz cihaz numarasıyla, bölüm 4).
- **Sponsor oyuncuyla eşleştirilmez.** "Maçın oyuncusu [Firma]'nın tercihi" gibi bir ifade kullanılmaz. Sponsor sadece anketi "sunar". Oyuncunun kendi reklam yüzü gibi gösterilmesi oyuncunun izni olmadan yapılmamalı.
- Oyuncu fotoğrafı yalnızca uygulama zaten fotoğraf kullanıyorsa ve kullanma hakkı varsa gösterilir. Aksi halde isim ve forma numarası yeterli.

**Gereken veri:**
- **anketler** tablosu: maç, açılış, kapanış, durum, sponsor reklamı.
- **anket adayları** tablosu: anket, oyuncu adı, forma numarası.
- **oylar** tablosu: anket, aday, isimsiz cihaz numarası (şifrelenmiş) veya kullanıcı, zaman. Aynı anket için aynı cihazdan ikinci oy reddedilir.
- Temel sistemin yerleşim listesine **"Anket sponsoru"** eklenir.

**Temel sisteme nasıl oturur?** Anket kartı maç detayında "Maçın sponsoru" alanının **altında**, yorumların **üstünde ama ayrı bir kutuda** durur. Yorumları kapatmaz, onların arasına girmez. Anket sponsoru yoksa anket yine çalışır, sadece "sunar" satırı görünmez; boş kutu olmaz.

**Esnafa söylenecek cümle:**
> "Her maçtan sonra binlerce taraftar 'Maçın oyuncusu kim?' diye oy veriyor. Anketin başında da sonuç kartında da sizin adınız olacak."

---

## 6. Hazır sponsor teklif şablonu (firmalara gönderilecek)

Aşağıdaki metni köşeli parantezleri doldurarak WhatsApp'tan, e-postayla veya çıktı alarak verebilirsiniz. **Önce firmayla telefonda veya yüz yüze konuşun, "teklifi göndereyim mi?" diye sorun, sonra gönderin.** Habersiz toplu mesaj atmayın (bölüm 7).

---

> **ÇORUMSPOR TARAFTAR UYGULAMASI: YEREL DESTEKÇİ TEKLİFİ**
>
> Sayın [Yetkili Adı], [Firma Adı]
>
> Çorum FK bu sezon tarihinde ilk kez Süper Lig'de. Taraftarımız maç haberlerini, golleri ve maç sonuçlarını takip etmek için uygulamamızı kullanıyor. Son 30 günde uygulamamız **[X] kez açıldı**, **[Y] farklı cihazdan** ziyaret edildi. Maç günlerinde bu sayı **[Z] katına** çıkıyor.
>
> Uygulamamız taraftarlar tarafından hazırlanmıştır, Çorum FK'nın resmi uygulaması değildir. Reklamlarımız taraftarı rahatsız etmeyecek şekilde gösterilir: açılır pencere yok, videoların üstüne binen reklam yok. Bu yüzden reklamınız "kapatılmak istenen" değil, "görülen" bir reklam olur.
>
> **Paketlerimiz (1 aylık):**
>
> | Paket | Neler var | Fiyat |
> |---|---|---|
> | **Bronz: Destekçi** | "Bizi Destekleyenler" sayfasında firma kartınız (adres, WhatsApp, yol tarifi) · Ayda 1 taraftar indirim kuponu · Aylık rapor | [___] TL |
> | **Gümüş: Maç Ortağı** | Bronz'daki her şey · 1 iç saha maçında "Maçın Sponsoru" · 1 hafta haber sonu reklamı · 1 maç "Maçın Oyuncusu" anket sponsorluğu | [___] TL |
> | **Altın: Ana Destekçi** | Gümüş'teki her şey · 2 hafta ana sayfa reklamı · 1 ay "Gol Sponsoru" (tüm gol kartlarında adınız) · Destekçiler sayfasında en üstte büyük kart · "Taraftar Dostu İşletme" cam çıkartması ve QR afiş | [___] TL |
> | **Büyük Maç Haftası** | [Maç adı] haftasında uygulamadaki tüm reklam alanları sadece sizin | [___] TL |
>
> Sezon sonuna kadar anlaşmalarda **%[__] indirim** uygulanır. Büyük maç haftaları ayrıca satılır, aylık paketlere dahil değildir.
>
> **Size ne gelir?**
> - Her ay WhatsApp'ınıza: reklamınızın kaç kez görüntülendiği, kaç kişinin tıklayıp sitenize veya WhatsApp'ınıza geldiği ve kuponunuzun kasada kaç kez kullanıldığı.
> - Size özel, istediğiniz zaman bakabileceğiniz bir rapor sayfası.
>
> **Nasıl çalışır?**
> 1. Logonuzu, bir görsel ve kısa bir yazı gönderiyorsunuz (isterseniz birlikte hazırlarız).
> 2. Yayından önce telefon ve bilgisayar görünümünü size gösteriyorum, onayınızı alıyorum.
> 3. Anlaştığımız tarihte yayına giriyor, bitiş tarihinde kendiliğinden kalkıyor.
>
> **Kurallarımız:** Tüm reklamlarda "Reklam" veya "Sponsor" ibaresi bulunur. Bahis, alkollü içki, tütün ve elektronik sigara, fal ve medyum reklamları kabul edilmez. Reklam içeriğindeki bilgilerin (fiyat, indirim, kampanya koşulları) doğruluğundan reklam veren firma sorumludur.
>
> **Ödeme:** Uygulama üzerinden ödeme alınmaz. Ödeme [havale / elden] yapılır, [fatura / makbuz] verilir.
>
> İletişim: Mert, [telefon], [e-posta]
>
> Çorum'un takımını birlikte destekleyelim.

---

**Kısa WhatsApp versiyonu (ilk temas sonrası):**
```
Merhaba [Ad] Bey, az önce konuştuğumuz Çorumspor taraftar uygulaması için kısa bilgi:
- Son 30 günde [X] açılış, maç günleri [Z] kat artıyor.
- Bronz [__] TL, Gümüş [__] TL, Altın [__] TL (aylık).
- Her ay kaç kişinin reklamınızı gördüğünü ve tıkladığını size raporluyorum.
- [Maç adı] haftası henüz boş, isterseniz size ayırayım.
Ayrıntılı teklifi ekte gönderiyorum. Mert
```

**Şablonu doldururken:**
- [X], [Y], [Z] rakamlarını uygulamanın gerçek istatistiklerinden alın. Asla yuvarlayıp şişirmeyin. Yanıltıcı rakam vermek de "doğru ve dürüst olmayan reklam" sayılabilir.
- "Farklı cihaz" sayısını sadece sistem bunu gerçekten ölçüyorsa yazın, ölçmüyorsa o kısmı silin.

---

## 7. Yasal yapılır / yapılmaz listesi (spor taraftar uygulaması, Türkiye)

> **Önemli:** Bu liste genel bilgi içindir, hukuki görüş değildir. Kaynakların bir kısmı hukuk bürosu yazıları ve haberlerdir. İlk büyük anlaşmadan önce bir avukata ve muhasebeciye bir kez gösterilmesini öneririz.

### Yapın

1. **Her reklamda "Reklam" veya "Sponsor" yazsın, firma adı açıkça görünsün.** Reklamın haberle karışmaması gerekir. Reklam olduğu anlaşılmayan tanıtım (örtülü reklam) yasaktır ([Paraşüt](https://www.parasut.com/blog/sosyal-medya-reklamciligi-ve-ortulu-reklamlar-nedir), [Reklam Kurulu kılavuzu](https://iabtr.org/wp-content/uploads/2024/06/Sosyal-Medya-Etkileyicileri-Tarafindan-Yapilan-Ticari-Reklam-ve-Haksiz-Ticari-Uygulamalar-Hakkinda-Kilavuz1062021101250.pdf)). 1 Temmuz 2026 tarihli ve 33297 sayılı Resmî Gazete'de yayımlanan, 1 Ağustos 2026'da yürürlüğe giren değişiklik, tanıtım içeriklerinde "Reklam", "Tanıtım" gibi açık ibareleri ve reklam verenin belirtilmesini zorunlu hale getirdi ([Erdem & Erdem](https://www.erdem-erdem.av.tr/bilgi-bankasi/ticari-reklam-ve-haksiz-ticari-uygulamalar-yonetmeliginde-kapsamli-degisiklikler-yapildi), [GZT](https://www.gzt.com/gundem/sosyal-medyada-reklam-yazmak-zorunlu-mu-4245635)). Değişiklik ağırlıkla sosyal medya etkileyicilerini hedefliyor, ama aynı mantık bizim uygulamamız için de en güvenli yoldur.
2. **Firma için haber yazarsanız** (örn. "X restoranı taraftarlara özel menü çıkardı"), başına "Reklam" veya "Tanıtım" yazın. Parayla yazılan haber, reklam etiketi olmadan yayımlanamaz.
3. **İndirim kampanyalarında gerçek indirim.** 1 Ağustos 2026'dan itibaren mallarda indirim öncesi fiyat, son 10 günün en düşük fiyatıdır; çabuk bozulan mallarda ve hizmetlerde indirimden hemen önceki fiyattır ([Erdem & Erdem](https://www.erdem-erdem.av.tr/bilgi-bankasi/ticari-reklam-ve-haksiz-ticari-uygulamalar-yonetmeliginde-kapsamli-degisiklikler-yapildi)). Kupon koşullarını açık yazın, firmadan teyit alın.
4. **Reklamlar doğru ve dürüst olmalı** ([Yönetmelik, Resmî Gazete 10.01.2015](https://resmigazete.gov.tr/eskiler/2015/01/20150110-5.htm)). "Çorum'un en iyisi" gibi kanıtlanamayan iddialardan kaçının ya da firmadan kanıt isteyin. Şikayet olursa Reklam Kurulu inceler ([Ticaret Bakanlığı](https://ticaret.gov.tr/tuketici/ticari-reklamlar/reklam-kuruluna-nasil-basvurulur)).
5. **Firmayla yazılı anlaşma yapın** (bir sayfalık yeterli): tarih, alanlar, tutar, "reklam içeriğinden firma sorumludur" maddesi, "büyük maç haftaları hariçtir" maddesi, iptal ve iade koşulu.
6. **Gizlilik metnini güncelleyin.** Kişisel veri tutmadan sayın (bölüm 4). Analitik veya reklam çerezi kullanıyorsanız önceden ve ayrı ayrı onay alın; önceden işaretli kutu kullanmayın ([KVKK Çerez Rehberi](https://kvkk.gov.tr/Icerik/7353/Cerez-Uygulamalari-Hakkinda-Rehber)).
7. **"Resmi değildir" yazın.** Çorum FK logosunu, "resmi sponsor" ifadesini ve kulüp markasını izinsiz kullanmayın. Firma görsellerinde de kullanılmasın. Kulübün kendi sponsorları var ([Halk TV](https://halktv.com.tr/spor/corum-fknin-yeni-sponsorlari-belli-oldu-961510h)) ve marka kullanımı kulübün iznine bağlıdır. (Genel bilgi; şüphede kulüple konuşun.)
8. **Vergi ve fatura.** Reklam geliri vergiye tabi bir gelirdir. Nasıl fatura keseceğinizi (şahıs şirketi vb.) bir muhasebeciye danışın. Esnaf da büyük ihtimalle fatura isteyecektir.
9. **Statta veya kulüp alanında afiş/QR için** kulüp ve stat yönetiminden izin alın.

### Yapmayın

1. **Hiçbir bahis reklamı almayın, yasal görünen siteler, "tahmin" siteleri ve bayiler dahil.** Yasa dışı spor bahsine teşvik ve reklam, 7258 sayılı Kanun'un 5. maddesine göre hapis cezası gerektiren bir suçtur ([Or Hukuk](https://or.av.tr/yasa-disi-bahis-kacak-bahis-suc-ve-cezalari-7258-sayili-kanun-uygulamasi/), [Hukukçular Evi: bahis sponsorluğu](https://hukukcularevi.com/yasa-disi-bahis-sitesi-sponsorlugu-kulup-sirket-7258-5-reklam-tck-55-282-masak-7405-5-4-savunma/)). Futbol yayınlarındaki bahis reklamları için büyük yayıncılar hakkında iddianame hazırlandı ([NTV](https://www.ntv.com.tr/turkiye/acun-ilicali-ve-sadettin-sarana-yasa-disi-bahis-iddianamesi,fMbTIl7RY0GstFq8dcR5-g)). 2026 değişikliği yasa dışı bahis ve kumar reklam yasağını genişletti ([Erdem & Erdem](https://www.erdem-erdem.av.tr/bilgi-bankasi/ticari-reklam-ve-haksiz-ticari-uygulamalar-yonetmeliginde-kapsamli-degisiklikler-yapildi)). "Bonus", "oran", "kupon" çağrışımı yapan hiçbir görsel kabul etmeyin. Bizim "kupon"umuz indirim kuponudur, maç tahminiyle asla birleştirmeyin.
2. **Alkollü içki reklamı ve alkol firması sponsorluğu almayın.** Haziran 2026'da kabul edildiği bildirilen düzenlemeyle alkollü içki üreticilerinin, ithalatçılarının ve pazarlayıcılarının etkinliklere marka, logo veya unvanlarıyla destek vermesi yasaklandı ([Yeni Şafak](https://www.yenisafak.com/gundem/alkol-ureticilerine-sponsorluk-yasagi-4832066), [NTV](https://www.ntv.com.tr/turkiye/alkol-reklami-yasagi-genisliyor-kaymakamlara-denetim-yetkisi-veriliyor-1715757)). Alkol satan bir restoran reklam vermek isterse görselde ve metinde içki olmasın. Şüphe varsa kabul etmeyin.
3. **Tütün, sigara, elektronik sigara, ısıtılmış tütün ve nargile reklamı almayın.** 4207 sayılı Kanun bunların reklam ve tanıtımını yasaklıyor; elektronik sigara ve ısıtılmış tütün de 2018'de kapsama alındı ([Lexpera: 4207](https://www.lexpera.com.tr/mevzuat/kanunlar/tutun-urunlerinin-zararlarinin-onlenmesi-ve-kontrolu-hakkinda-kanun-4207), [Hukukçular Evi](https://hukukcularevi.com/elektronik-sigara-ve-isitilmis-tutun-urunleri-ithalat-yasagi-satis-ve-yaptirim/)).
4. **Fal, medyum, astroloji reklamı almayın** (2026 değişikliğiyle yasak genişledi).
5. **İzinsiz çekiliş veya ödüllü yarışma yapmayın.** Sosyal platformlardaki çekilişler genel olarak Milli Piyango İdaresi izni gerektiriyor; izinsiz çekiliş yapan fenomenler hakkında soruşturma açıldı ([Lexpera: MPİ Yönetmeliği](https://www.lexpera.com.tr/mevzuat/yonetmelikler/milli-piyango-idaresi-genel-mudurlugu-karsiligi-nakit-olmayan-piyangolar-ve-cekilisler-hakkinda), [Ensonhaber](https://www.ensonhaber.com/gundem/milli-piyangodan-izinsiz-cekilis-yapan-16-fenomene-sorusturma), [Hukuki Haber](https://www.hukukihaber.net/sosyal-medyada-yapilan-cekilisler-yasal-midir-belirli-bir-yaptirimi-mevcut-mudur/amp)). Anket ve kuponlar ödülsüz ve şanssız kalsın.
6. **Taraftarlara toplu reklam mesajı (SMS, e-posta, WhatsApp) atmayın.** Ticari elektronik ileti için İleti Yönetim Sistemi (İYS) kaydı ve alıcının onayı gerekir; esnafa (tacirlere) gönderilen iletilerde önceden onay şartı yoksa da kayıt yükümlülükleri sürer ([Hukukçular Evi: İYS](https://hukukcularevi.com/ticari-elektronik-ileti-iys-izin-6563-reklam/), [Lexpera: Yönetmelik](https://www.lexpera.com.tr/mevzuat/yonetmelikler/ticari-iletisim-ve-ticari-elektronik-iletiler-hakkinda-yonetmelik)). Esnafa teklifi tek tek, konuştuktan sonra gönderin.
7. **Meslek kuralları reklamı kısıtlayan meslekleri sıradan reklam gibi almayın:** doktor, diş hekimi, eczane, avukat gibi. Bu mesleklerin kendi meslek kuralları reklamı sınırlar. Ya hiç almayın ya da sadece isim ve adres gibi bilgi niteliğinde bir vitrin kaydı yapın ve önce kendilerine sorun. (Genel bilgi.)
8. **Sağlık iddiası taşıyan reklam almayın** ("zayıflatır", "tedavi eder" gibi). Takviye gıdanın normal beslenmenin yerini tuttuğu izlenimi veren reklam 2026'da yasaklandı.
9. **Çocukları hedefleyen kişiselleştirilmiş reklam yapmayın.** 2026 değişikliği çocuklara kişisel veriye dayalı hedefli reklamı yasakladı. Bizim sistem zaten kimseyi hedeflemiyor; böyle kalsın.
10. **Siyasi parti veya aday reklamı almayın.** Taraftarı böler ve seçim dönemlerinde ayrı kurallara tabidir. (Öneri.)
11. **Rakamları şişirmeyin.** Görüntülenmeyi "kişi" diye satmayın. Yanıltıcı rakam hem dürüst reklam kuralına aykırıdır hem de güveni bitirir.
12. **Reklamı videoların, yorumların, skorun üstüne koymayın, açılır pencere kullanmayın.** Bu yasal bir zorunluluk değil, bizim temel kuralımız; uygulamanın değeri buna bağlı.

---

## 8. Sonraya bırakılan fikirler (ne zaman açılmalı?)

| Fikir | Ne zaman düşünülmeli |
|---|---|
| İlk 11 kartı sponsoru | Kadro haberi her maç düzenli giriliyorsa, takvim dolmaya başlayınca |
| Maç günü rehberi | Vitrinde 15'ten fazla yeme-içme işletmesi olunca, "Maç öncesi" filtresinin büyütülmüş hali olarak |
| Skor tahmin oyunu (ödülsüz) | Anket başarılı olursa, sezonun ikinci yarısında |
| Alan paylaşımı (rotasyon) | Doluluk takviminde haber akışı 2 ay üst üste tamamen dolarsa |
| Sezon sonu teşekkür duvarı | Mayıs 2027, son iç saha maçından önce |
| Deplasman / etkinlik sponsoru | Bir taraftar grubu organizasyonu üstlenirse, sadece "duyuru + sponsor" kartı olarak |

---

## 9. Kaynaklar

**Çorum FK ve bağlam**
- [GZT: Çorumspor Süper Lig fikstürü 2026-2027](https://www.gzt.com/spor/corumspor-super-lig-fiksturu-2026-2027-corumspor-maclari-hangi-hafta-buyuk-maclar-ne-zaman-4239878)
- [Halk TV: Çorum FK'nın yeni sponsorları belli oldu](https://halktv.com.tr/spor/corum-fknin-yeni-sponsorlari-belli-oldu-961510h)

**Benzer uygulamalar**
- [CNN Türk: Ankaragücü'nün mobil uygulaması çıktı](https://www.cnnturk.com/spor/futbol/ankaragucunun-mobil-uygulamasi-cikti-725566)
- [App Store: Samsunspor FC](https://apps.apple.com/tr/app/samsunspor-fc/id6746769048?l=tr)
- [DHA: Misafir taraftara dostluk indirimi](https://www.dha.com.tr/foto-galeri/egeden-karadenize-vefa-koprusu-misafir-taraftara-dostluk-indirimi-2863909)
- [CNBC-e: Şekerbank ve Sivasspor Taraftar POS](https://www.cnbce.com/haberler/sekerbank-ve-sivasspordan-isbirligi-taraftar-pos-ile-harcamalar-kulube-destek-olacak-h39111)

**Ticari reklam**
- [Resmî Gazete 10.01.2015: Ticari Reklam ve Haksız Ticari Uygulamalar Yönetmeliği](https://resmigazete.gov.tr/eskiler/2015/01/20150110-5.htm)
- [Erdem & Erdem: Yönetmelikte kapsamlı değişiklikler (RG 01.07.2026/33297)](https://www.erdem-erdem.av.tr/bilgi-bankasi/ticari-reklam-ve-haksiz-ticari-uygulamalar-yonetmeliginde-kapsamli-degisiklikler-yapildi)
- [GZT: "Reklam" ibaresinin zorunluluğu](https://www.gzt.com/gundem/sosyal-medyada-reklam-yazmak-zorunlu-mu-4245635)
- [Reklam Kurulu: Sosyal medya etkileyicileri kılavuzu (IAB TR kopyası)](https://iabtr.org/wp-content/uploads/2024/06/Sosyal-Medya-Etkileyicileri-Tarafindan-Yapilan-Ticari-Reklam-ve-Haksiz-Ticari-Uygulamalar-Hakkinda-Kilavuz1062021101250.pdf)
- [Paraşüt: Sosyal medya reklamcılığı ve örtülü reklam](https://www.parasut.com/blog/sosyal-medya-reklamciligi-ve-ortulu-reklamlar-nedir)
- [Ticaret Bakanlığı: Reklam Kurulu'na nasıl başvurulur](https://ticaret.gov.tr/tuketici/ticari-reklamlar/reklam-kuruluna-nasil-basvurulur)

**Bahis, alkol, tütün**
- [Or Hukuk: 7258 sayılı Kanun suç ve cezaları](https://or.av.tr/yasa-disi-bahis-kacak-bahis-suc-ve-cezalari-7258-sayili-kanun-uygulamasi/)
- [Hukukçular Evi: Yasa dışı bahis sitesi sponsorluğu](https://hukukcularevi.com/yasa-disi-bahis-sitesi-sponsorlugu-kulup-sirket-7258-5-reklam-tck-55-282-masak-7405-5-4-savunma/)
- [NTV: Yasa dışı bahis iddianamesi (yayın platformları)](https://www.ntv.com.tr/turkiye/acun-ilicali-ve-sadettin-sarana-yasa-disi-bahis-iddianamesi,fMbTIl7RY0GstFq8dcR5-g)
- [Yeni Şafak: Alkol üreticilerine sponsorluk yasağı (13.06.2026)](https://www.yenisafak.com/gundem/alkol-ureticilerine-sponsorluk-yasagi-4832066)
- [NTV: Alkol reklamı yasağı genişliyor](https://www.ntv.com.tr/turkiye/alkol-reklami-yasagi-genisliyor-kaymakamlara-denetim-yetkisi-veriliyor-1715757)
- [Hürriyet: Alkol yasağı ile ilgili sorulara cevaplar (2011, eski kurallar)](https://www.hurriyet.com.tr/ekonomi/alkol-yasagi-ile-ilgili-sorulara-cevaplar-16746525)
- [Lexpera: 4207 sayılı Kanun](https://www.lexpera.com.tr/mevzuat/kanunlar/tutun-urunlerinin-zararlarinin-onlenmesi-ve-kontrolu-hakkinda-kanun-4207)
- [Hukukçular Evi: Elektronik sigara ve ısıtılmış tütün](https://hukukcularevi.com/elektronik-sigara-ve-isitilmis-tutun-urunleri-ithalat-yasagi-satis-ve-yaptirim/)

**Kişisel veri, çekiliş, ticari ileti**
- [KVKK: Çerez Uygulamaları Hakkında Rehber](https://kvkk.gov.tr/Icerik/7353/Cerez-Uygulamalari-Hakkinda-Rehber)
- [Erdem & Erdem: KVKK çerez rehberi güncellemesi](https://www.erdem-erdem.av.tr/bilgi-bankasi/kisisel-verileri-koruma-kurumu-cerez-uygulamalari-hakkinda-rehberi-guncelledi)
- [Hukukçular Evi: Çerez politikası ve onayı](https://hukukcularevi.com/cerez-politikasi-ve-cerez-onayi-kvkk/)
- [Lexpera: MPİ Karşılığı Nakit Olmayan Piyangolar ve Çekilişler Yönetmeliği](https://www.lexpera.com.tr/mevzuat/yonetmelikler/milli-piyango-idaresi-genel-mudurlugu-karsiligi-nakit-olmayan-piyangolar-ve-cekilisler-hakkinda)
- [Ensonhaber: İzinsiz çekiliş yapan 16 fenomene soruşturma](https://www.ensonhaber.com/gundem/milli-piyangodan-izinsiz-cekilis-yapan-16-fenomene-sorusturma)
- [Hukuki Haber: Sosyal medyada çekilişler yasal mı?](https://www.hukukihaber.net/sosyal-medyada-yapilan-cekilisler-yasal-midir-belirli-bir-yaptirimi-mevcut-mudur/amp)
- [Hukukçular Evi: İYS ve 6563 sayılı Kanun](https://hukukcularevi.com/ticari-elektronik-ileti-iys-izin-6563-reklam/)
- [Lexpera: Ticari İletişim ve Ticari Elektronik İletiler Hakkında Yönetmelik](https://www.lexpera.com.tr/mevzuat/yonetmelikler/ticari-iletisim-ve-ticari-elektronik-iletiler-hakkinda-yonetmelik)

**Kaynaklar hakkında not:** Resmî metinlerin tamamı bu çalışmada tek tek okunamadı. 2026 değişiklikleri hukuk bürosu özetlerinden ve haberlerden aktarıldı. Ceza miktarları ve madde numaraları için mevzuat.gov.tr'deki güncel metne bakılmalı.
