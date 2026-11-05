// =====================================================================
// Site ayarları: TEK yapılandırma dosyası.
// Supabase panelinde: Project Settings -> API (Data API) bölümünden
//   "Project URL"  -> SUPABASE_URL
//   "anon public" (publishable) anahtar -> SUPABASE_ANON_KEY
// Bu anahtar tarayıcıda görünür; bu normaldir, veriyi RLS kuralları korur.
// "service_role" (secret) anahtarını ASLA buraya ya da başka bir dosyaya yazmayın.
// =====================================================================
export const SUPABASE_URL = 'https://PROJE-KODUNUZ.supabase.co';
export const SUPABASE_ANON_KEY = 'ANON-ANAHTARINIZ';

export const SITE_ADI = 'Çorumspor Taraftar';
export const TAKIM_ADI = 'Çorum FK';

// Üst bardaki amblem. null = özgün yedek işaret (assets/logo/amblem-yedek.svg).
// Kulübün resmî amblemini YALNIZCA kulüpten yazılı izin aldıktan sonra assets/logo/ klasörüne koyup
// burada adını yazın, ör. 'assets/logo/amblem.svg' ya da 'assets/logo/amblem.png' (bkz. assets/logo/README.txt).
// Dosya açılamazsa site önce yedek işarete (özgün "ÇT" işareti), o da olmazsa "ÇT" yazısına döner.
export const AMBLEM_DOSYASI = null;

// Künye ve iletişim (alt bilgi, gizlilik.html, kurallar.html). YAYINDAN ÖNCE kendi bilginizle değiştirin.
// Kulüp, oyuncular ve taraftarlar kaldırma taleplerini bu adrese yazar (README "Künye").
export const SAHIP_ADI = 'Mert (uygulama sahibi)';
export const ILETISIM_EPOSTA = 'iletisim@ornek.com';
