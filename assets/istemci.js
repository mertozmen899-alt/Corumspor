// Supabase istemcisi. Bütün sayfalar (ve reklam modülü) bu tek istemciyi kullanır:
//   import { supabase } from '../istemci.js';
// supabase-js, sayfadaki <script> etiketiyle CDN'den (sabit sürüm + SRI) yüklenir.
// Test modu: SADECE localhost/127.0.0.1'de ?sahte=1 ile açılır; gerçek sunucu yerine
// testler/sahte-supabase.js kullanılır (sekme kapanana kadar sürer, ?sahte=0 kapatır).
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './ayar.js';

const YEREL = ['localhost', '127.0.0.1'].includes(location.hostname);

function sahteMi() {
  if (!YEREL) return false;
  try {
    const p = new URLSearchParams(location.search).get('sahte');
    if (p === '1') sessionStorage.setItem('sahte', '1');
    if (p === '0') sessionStorage.removeItem('sahte');
    return sessionStorage.getItem('sahte') === '1';
  } catch (e) {
    return new URLSearchParams(location.search).get('sahte') === '1';
  }
}

export const sahteMod = sahteMi();
export const ayarEksik = !sahteMod && /PROJE-KODUNUZ|ANON-ANAHTARINIZ/.test(SUPABASE_URL + SUPABASE_ANON_KEY);

let olustur = null;
if (sahteMod) {
  ({ createClient: olustur } = await import('../testler/sahte-supabase.js'));
} else if (window.supabase && typeof window.supabase.createClient === 'function') {
  olustur = window.supabase.createClient;
}

export const supabase = olustur && !ayarEksik
  ? olustur(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;
