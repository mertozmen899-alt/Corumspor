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
// Resmî Çorum FK amblemi sahibin kararıyla (6 Kasım 2026, riski sahip üstlendi) kullanılıyor; kaynak: assets/logo/README.txt.
// Kaldırmak için null yazın. Dosya açılamazsa site önce yedek işarete (özgün "ÇT" işareti), o da olmazsa "ÇT" yazısına döner.
export const AMBLEM_DOSYASI = 'assets/logo/corum-fk-amblem.svg';

// Künye ve iletişim (alt bilgi, gizlilik.html, kurallar.html). YAYINDAN ÖNCE kendi bilginizle değiştirin.
// Kulüp, oyuncular ve taraftarlar kaldırma taleplerini bu adrese yazar (README "Künye").
export const SAHIP_ADI = 'Mert Özmen';
export const ILETISIM_EPOSTA = 'mertozmen899@gmail.com';

// Web Push bildirimleri (021/022, README "Bildirimler"): `node araclar/vapid-olustur.js --sql` çıktısındaki AÇIK anahtar.
// null = Profil › Bildirimler "henüz kurulmadı" der. Özel anahtar BURAYA DEĞİL, yalnız Supabase Vault'a (bildirim_vapid_private).
export const VAPID_ACIK_ANAHTAR = 'BBEn6zQ0OWVyY0e_7GNbCSyCM_sdnRr7JJS801mF22CvwolY15f2KvreptGEfRx50DEgT_xUCxVbe00M4fKyztI';
