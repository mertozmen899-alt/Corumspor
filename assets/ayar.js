// =====================================================================
// Site ayarları: TEK yapılandırma dosyası.
// Supabase panelinde: Project Settings -> API (Data API) bölümünden
//   "Project URL"  -> SUPABASE_URL
//   "anon public" (publishable) anahtar -> SUPABASE_ANON_KEY
// Bu anahtar tarayıcıda görünür; bu normaldir, veriyi RLS kuralları korur.
// "service_role" (secret) anahtarını ASLA buraya ya da başka bir dosyaya yazmayın.
// =====================================================================
export const SUPABASE_URL = 'https://ejcbncheueetbkxskbbb.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqY2JuY2hldWVldGJreHNrYmJiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM5NDE1MzQsImV4cCI6MjEwOTUxNzUzNH0.L-19q7YQ94mLyMVIsd0ONtYYTWHFYJfNqZSio9-mceA';

export const SITE_ADI = 'Çorumspor Taraftar';
export const TAKIM_ADI = 'Çorum FK';

// Üst bardaki amblem. null = özgün yedek işaret (assets/logo/amblem-yedek.svg).
// Kulübün resmî amblemini YALNIZCA kulüpten yazılı izin aldıktan sonra assets/logo/ klasörüne koyup
// burada adını yazın, ör. 'assets/logo/amblem.svg' ya da 'assets/logo/amblem.png' (bkz. assets/logo/README.txt).
// Dosya açılamazsa site önce yedek işarete (özgün "ÇT" işareti), o da olmazsa "ÇT" yazısına döner.
export const AMBLEM_DOSYASI = null;

// Künye ve iletişim (alt bilgi, gizlilik.html, kurallar.html). YAYINDAN ÖNCE kendi bilginizle değiştirin.
// Kulüp, oyuncular ve taraftarlar kaldırma taleplerini bu adrese yazar (README "Künye").
export const SAHIP_ADI = 'Mert Özmen';
export const ILETISIM_EPOSTA = 'mertozmen899@gmail.com';
