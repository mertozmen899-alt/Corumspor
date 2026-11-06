// Çorumspor Taraftar — küçük service worker (performans incelemesi §5.9, 2. tur §3 ve §8). Workbox yok.
// Amaç: stadyumda bağlantı kopunca daha önce açılmış sayfalar ve son herkese açık veri açılsın.
// Kayıt: assets/ortak.js swKaydet() — YALNIZ gerçek alan adında (localhost ve ?sahte=1 testlerinde kayıt YOK).
// ASLA saklanmaz: /auth/v1, /rest/v1/rpc (reklam sayımı dahil), POST/PATCH/DELETE, realtime, YouTube, yönetim sayfası,
// kullanıcıya özel yanıtlar (Authorization anon anahtar değilse), opak (no-cors) yanıtlar.
//
// SÜRÜM: yayında araclar/yayin-hazirla.js SURUM'u yayin/ içeriğinin özetiyle (hash) yazar ve DOSYALAR listesini yayındaki bütün
// kabuk dosyalarıyla doldurur: her dağıtım yeni bir kabuk önbelleğidir; sayfa (HTML) ve JS/CSS AYNI sürümden gelir (atomik:
// yeni HTML + eski JS karışmaz). Depodaki 'gelistirme' sürümünde (derlemesiz) sayfalar ağdan, dosyalar arkada tazelenerek gelir.
// Cloudflare Pages /x.html'i 308 ile /x'e yönlendirir: yönlendirilmiş yanıt navigasyona verilemez, bu yüzden kurulumda gövdeden
// yeni yanıt kurulur ve sayfa anahtarı uzantısız, sorgusuz tutulur (/goller.html, /goller, /goller?x=1 → tek kayıt).
const SURUM = 'gelistirme';
const GELISTIRME = SURUM === 'gelistirme';
const KABUK = 'kabuk-' + SURUM;
const VERI = 'veri-v1';
const VERI_EN_COK = 40;
const GORSEL = 'gorsel-v1';
const GORSEL_EN_COK = 60;
const SAYFALAR = ['./', 'index.html', 'goller.html', 'takim.html', 'profil.html', 'haber.html', 'mac.html', 'gol.html', 'giris.html', 'sifre.html',
  'kurallar.html', 'gizlilik.html', 'kaynaklar.html', 'maclar.html', 'cevrimdisi.html'];
const DOSYALAR = ['assets/stil.css', 'assets/tema.js', 'assets/ortak.js', 'assets/istemci.js', 'assets/ayar.js', 'assets/kurallar.js', 'assets/foto-kaynaklari.js',
  'assets/onbellek.js', 'assets/gol-kart.js', 'assets/reklam-yukle.js', 'assets/yorumlar.js', 'assets/sayfa/ana.js', 'assets/sayfa/goller.js', 'assets/sayfa/gol.js',
  'assets/sayfa/takim.js', 'assets/sayfa/profil.js', 'assets/sayfa/haber.js', 'assets/sayfa/mac.js', 'assets/sayfa/metin.js', 'assets/sayfa/giris.js', 'assets/sayfa/sifre.js',
  'assets/reklam/reklam.js', 'assets/reklam/reklam-mantik.js',
  'assets/vendor/supabase-js-2.45.4/supabase.js', 'assets/fonts/oswald-700-tr.woff2', 'assets/fonts/source-sans-3-400-tr.woff2',
  'assets/fonts/source-sans-3-700-tr.woff2', 'assets/logo/amblem-yedek.svg', 'manifest.webmanifest', 'assets/logo/simge-192.png'];

/** Sayfa önbellek anahtarı: .html ve sorgu atılır, /index → / (Cloudflare'in güzel adresleriyle aynı kayıt). */
function sayfaAnahtari(adres) {
  const u = new URL(adres, self.location.href);
  let yol = u.pathname.replace(/\.html$/, '');
  if (/(^|\/)index$/.test(yol)) yol = yol.slice(0, -'index'.length);
  return u.origin + yol;
}

/** Yönlendirilmiş (redirected) yanıt navigasyona verilemez: aynı gövde ve başlıklarla yeni yanıt. */
async function temizYanit(y) {
  if (!y.redirected) return y;
  return new Response(await y.blob(), { status: y.status, statusText: y.statusText, headers: y.headers });
}

async function getir(adres) {
  // cache: 'reload' → HTTP önbelleği atlanır (max-age=300 + stale-while-revalidate yüzünden eski dosya yeni sürüme girmesin)
  const y = await fetch(new Request(adres, { cache: 'reload' }));
  if (!y.ok) throw new Error(`${adres}: ${y.status}`);
  return y;
}

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(KABUK);
    await Promise.all(SAYFALAR.map(async (s) => c.put(sayfaAnahtari(s), await temizYanit(await getir(s)))));
    await Promise.all(DOSYALAR.map(async (d) => c.put(new URL(d, self.location.href).href, await temizYanit(await getir(d)))));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((l) => Promise.all(l.filter((k) => k.startsWith('kabuk-') && k !== KABUK).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const zamanAsimi = (ms, p) => Promise.race([p, new Promise((_, red) => setTimeout(() => red(new Error('zaman aşımı')), ms))]);
const saklanabilir = (y) => y && y.ok && y.type !== 'opaque' && y.type !== 'opaqueredirect';
async function sinirla(c, enCok) {
  const l = await c.keys();
  await Promise.all(l.slice(0, Math.max(0, l.length - enCok)).map((k) => c.delete(k)));
}

async function sayfa(istek) {
  const c = await caches.open(KABUK);
  const anahtar = sayfaAnahtari(istek.url);
  if (!GELISTIRME) {
    const m = await c.match(anahtar);
    if (m) return m; // bu sürümün kabuğu (JS/CSS'i de bu sürümden)
  }
  try {
    const y = await zamanAsimi(3000, fetch(istek));
    if (GELISTIRME && saklanabilir(y)) c.put(anahtar, await temizYanit(y.clone()));
    return y;
  } catch (e) {
    return (await c.match(anahtar)) || (await c.match(sayfaAnahtari('cevrimdisi.html'))) || Response.error();
  }
}

async function kabukDosyasi(istek) {
  const c = await caches.open(KABUK);
  const m = await c.match(istek, { ignoreSearch: true });
  if (m && !GELISTIRME) return m; // cache-first: dosyalar sürümle birlikte yenilenir
  const ag = fetch(istek, GELISTIRME ? undefined : { cache: 'no-cache' }).then((y) => { if (saklanabilir(y)) c.put(istek, y.clone()); return y; });
  if (m) { ag.catch(() => {}); return m; } // geliştirme: önce önbellek, arkada tazele
  return ag.catch(() => Response.error());
}

async function agOnce(istek, ad, ms, enCok) {
  const c = await caches.open(ad);
  try {
    const y = await zamanAsimi(ms, fetch(istek));
    if (saklanabilir(y)) { await c.put(istek, y.clone()); sinirla(c, enCok); }
    return y;
  } catch (e) {
    return (await c.match(istek)) || Response.error();
  }
}

async function gorselOnce(istek) {
  const c = await caches.open(GORSEL);
  const m = await c.match(istek);
  if (m) return m;
  const y = await fetch(istek);
  if (saklanabilir(y)) { await c.put(istek, y.clone()); sinirla(c, GORSEL_EN_COK); }
  return y;
}

self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin === location.origin) {
    if (/\/yonetim(\.html)?$/.test(u.pathname) || /\/assets\/(sayfa\/yonetim|reklam\/yonetim)/.test(u.pathname)) return;
    if (r.mode === 'navigate') return e.respondWith(sayfa(r));
    if (u.pathname.includes('/assets/img/')) return e.respondWith(gorselOnce(r));
    if (u.pathname.includes('/assets/') || u.pathname.endsWith('/manifest.webmanifest')) return e.respondWith(kabukDosyasi(r));
    return;
  }
  // Supabase: yalnız herkese açık okuma tabloları, yalnız anon anahtarla (kullanıcıya özel yanıt saklanmaz)
  if (/\.supabase\.co$/.test(u.hostname)) {
    if (/^\/rest\/v1\/(haberler|maclar|goller|oyuncular|sakatliklar)$/.test(u.pathname) && anonimMi(r)) return e.respondWith(agOnce(r, VERI, 4000, VERI_EN_COK));
    // Kapaklar crossorigin="anonymous" ile istenir (CORS yanıtı: saklanabilir; opak olsaydı saklanmazdı)
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
