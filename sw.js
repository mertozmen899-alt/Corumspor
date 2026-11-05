// Çorumspor Taraftar — en küçük service worker (performans incelemesi §5.9). Workbox yok.
// Amaç: stadyumda bağlantı kopunca daha önce açılmış sayfalar ve son herkese açık veri açılsın.
// Kayıt: assets/ortak.js swKaydet() — YALNIZ gerçek alan adında (localhost ve ?sahte=1 testlerinde kayıt YOK).
// ASLA saklanmaz: /auth/v1, /rest/v1/rpc (reklam sayımı dahil), POST/PATCH/DELETE, realtime, YouTube, yönetim sayfası,
// kullanıcıya özel yanıtlar (Authorization anon anahtar değilse), opak (no-cors) yanıtlar.
const SURUM = 'v1-2026-11-05';
const KABUK = 'kabuk-' + SURUM;
const VERI = 'veri-v1';
const GORSEL = 'gorsel-v1';
const GORSEL_EN_COK = 60;
const SAYFALAR = ['index.html', 'goller.html', 'takim.html', 'profil.html', 'haber.html', 'mac.html', 'gol.html', 'kurallar.html', 'gizlilik.html', 'kaynaklar.html', 'cevrimdisi.html'];
const DOSYALAR = ['assets/stil.css', 'assets/tema.js', 'assets/ortak.js', 'assets/istemci.js', 'assets/ayar.js', 'assets/kurallar.js', 'assets/foto-kaynaklari.js',
  'assets/onbellek.js', 'assets/gol-kart.js', 'assets/reklam-yukle.js', 'assets/yorumlar.js', 'assets/sayfa/ana.js', 'assets/sayfa/goller.js', 'assets/sayfa/gol.js',
  'assets/sayfa/takim.js', 'assets/sayfa/profil.js', 'assets/sayfa/haber.js', 'assets/sayfa/mac.js', 'assets/sayfa/metin.js',
  'assets/vendor/supabase-js-2.45.4/supabase.js', 'assets/fonts/oswald-700-tr.woff2', 'assets/fonts/source-sans-3-400-tr.woff2',
  'assets/fonts/source-sans-3-700-tr.woff2', 'assets/logo/amblem-yedek.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(KABUK).then((c) => c.addAll([...SAYFALAR, ...DOSYALAR])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((l) => Promise.all(l.filter((k) => k.startsWith('kabuk-') && k !== KABUK).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const zamanAsimi = (ms, p) => Promise.race([p, new Promise((_, red) => setTimeout(() => red(new Error('zaman aşımı')), ms))]);
const saklanabilir = (y) => y && y.ok && y.type !== 'opaque' && y.type !== 'opaqueredirect';

async function agOnce(istek, ad, ms, yedek) {
  const c = await caches.open(ad);
  try {
    const y = await zamanAsimi(ms, fetch(istek));
    if (saklanabilir(y)) c.put(istek, y.clone());
    return y;
  } catch (e) {
    return (await c.match(istek, { ignoreSearch: istek.mode === 'navigate' })) || (yedek && (await caches.match(yedek))) || Response.error();
  }
}

async function gorselOnce(istek) {
  const c = await caches.open(GORSEL);
  const m = await c.match(istek);
  if (m) return m;
  const y = await fetch(istek);
  if (saklanabilir(y)) {
    c.put(istek, y.clone());
    c.keys().then((l) => { if (l.length > GORSEL_EN_COK) l.slice(0, l.length - GORSEL_EN_COK).forEach((k) => c.delete(k)); });
  }
  return y;
}

self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin === location.origin) {
    if (/\/yonetim\.html$/.test(u.pathname) || /\/assets\/(sayfa\/yonetim|reklam\/yonetim)/.test(u.pathname)) return;
    if (r.mode === 'navigate') return e.respondWith(agOnce(r, KABUK, 3000, 'cevrimdisi.html'));
    if (u.pathname.includes('/assets/img/')) return e.respondWith(gorselOnce(r));
    if (u.pathname.includes('/assets/')) {
      // stale-while-revalidate: önce önbellek, arkada tazele
      return e.respondWith(caches.open(KABUK).then(async (c) => {
        const m = await c.match(r);
        const ag = fetch(r).then((y) => { if (saklanabilir(y)) c.put(r, y.clone()); return y; }).catch(() => m);
        return m || ag;
      }));
    }
    return;
  }
  // Supabase: yalnız herkese açık okuma tabloları, yalnız anon anahtarla (kullanıcıya özel yanıt saklanmaz)
  if (/\.supabase\.co$/.test(u.hostname)) {
    if (/^\/rest\/v1\/(haberler|maclar|goller|oyuncular|sakatliklar)$/.test(u.pathname) && anonimMi(r)) return e.respondWith(agOnce(r, VERI, 4000));
    if (u.pathname.startsWith('/storage/v1/object/public/haber-gorselleri/')) return e.respondWith(gorselOnce(r).catch(() => Response.error()));
  }
  // YouTube, auth, rpc, reklam görselleri ve diğer her şey: dokunma (doğrudan ağ)
});

// apikey ile Authorization aynıysa istek anonimdir (giriş yapmış kişinin yanıtı, örn. taslak haber, saklanmaz)
function anonimMi(r) {
  const anahtar = r.headers.get('apikey') || '';
  const yetki = r.headers.get('authorization') || '';
  return !!anahtar && yetki === 'Bearer ' + anahtar;
}
