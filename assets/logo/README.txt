AMBLEM (LOGO) KLASÖRÜ
=====================

Bu klasörde şimdilik yalnızca "amblem-yedek.svg" var. Bu, uygulama için çizilmiş
ÖZGÜN bir işarettir (kırmızı-siyah yuvarlak içinde "ÇT" = Çorumspor Taraftar ve altın şimşek).
Çorum FK'nın resmî amblemi DEĞİLDİR; kulübün kısaltması "ÇFK" de kullanılmaz.
Sitenin üst kısmında varsayılan olarak bu yedek işaret görünür.

Kulübün resmî amblemini kullanmak isterseniz:

1. ÖNCE kulüpten YAZILI İZİN alın. Amblem telif hakkıyla ve marka olarak korunur;
   sitede reklam olduğu için kullanım ticari sayılabilir. (Ayrıntı: docs/TASARIM.md,
   "Hukuki not". İletişim: kulübün resmî sitesindeki iletişim bilgileri.)
   İzin yoksa bu klasöre resmî amblemi KOYMAYIN.

2. İzin aldıktan sonra dosyayı bu klasöre koyun:
     - amblem.svg   (tercih edilen)  ya da
     - amblem.png   (en az 256x256 piksel, şeffaf zeminli)

3. assets/ayar.js dosyasını açın ve şu satırı değiştirin:
     export const AMBLEM_DOSYASI = null;
   yerine (dosyanızın adına göre):
     export const AMBLEM_DOSYASI = 'assets/logo/amblem.svg';
   ya da
     export const AMBLEM_DOSYASI = 'assets/logo/amblem.png';

4. Siteyi yeniden yayınlayın. Dosya bulunamazsa site bozulmaz: önce yedek işarete,
   o da yoksa "ÇT" yazısına döner.

"amblem-yedek.svg" dosyasını silmeyin; her zaman yedek olarak kullanılır
(tarayıcı sekmesindeki küçük simge de odur).
