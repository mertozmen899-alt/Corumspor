// 021 bildirimleri: metin üretimi ve seçim (Edge Function'ın saf mantığı), istemci durum/anahtar yardımcıları, sw.js push ve
// notificationclick davranışı (vm içinde sahte service worker ortamıyla), VAPID betiği ve dosya bağları.
// Çalıştırma: node --test testler/bildirim.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const oku = (y) => readFileSync(path.join(KOK, y), 'utf8');
const M = await import(new URL('../supabase/functions/bildirim-gonder/mantik.js', import.meta.url).href);
const B = await import(new URL('../assets/bildirim.js', import.meta.url).href);
const { vapidUret, sqlUret } = createRequire(import.meta.url)('../araclar/vapid-olustur.js');

const MAC = '12121212-0000-4000-8000-000000000003';
const tarih = '2026-11-06T16:00:00Z'; // 19:00 TSİ
const olay = (tur, veri = {}, ek = {}) => ({ id: 1, tur, mac_id: MAC, gol_id: null, created_at: '2026-11-06T16:59:00Z',
  veri: { rakip: 'Sakaryaspor', ic_saha: true, tarih, ...veri }, ...ek });

test('metin: maç günü "Bugün maç var: Çorum FK – X, 19:00" (deplasmanda ev sahibi önce)', () => {
  const ic = M.bildirimIcerigi(olay('mac_gunu'), Date.parse('2026-11-06T07:05:00Z'));
  assert.equal(ic.baslik, 'Bugün maç var');
  assert.equal(ic.govde, 'Çorum FK – Sakaryaspor, 19:00');
  assert.equal(ic.url, 'mac.html?id=' + MAC);
  assert.equal(M.bildirimIcerigi(olay('mac_gunu', { ic_saha: false })).govde, 'Sakaryaspor – Çorum FK, 19:00');
  assert.ok(ic.ttl > 8 * 3600 && ic.ttl <= 9 * 3600, 'TTL başlama saatine kadar: ' + ic.ttl);
});

test('metin: ilk 11 açıklandı', () => {
  const ic = M.bildirimIcerigi(olay('ilk11'), Date.parse('2026-11-06T15:00:00Z'));
  assert.equal(ic.baslik, 'İlk 11 açıklandı');
  assert.match(ic.govde, /^Çorum FK – Sakaryaspor \(19:00\): ilk 11 belli oldu/);
  assert.equal(ic.aciliyet, 'high');
});

test('metin: gol "GOL! 59\' Kyziridis" + "Çorum FK 1-0 X"; uzatma, penaltı, deplasman; gol sayfasına gider', () => {
  const ic = M.bildirimIcerigi(olay('gol', { oyuncu: 'Kyziridis', dakika: 59, ek_dakika: null, penalti: false, corum: 1, rakip_skor: 0 }, { gol_id: 'g-1' }));
  assert.equal(ic.baslik, "GOL! 59' Kyziridis");
  assert.equal(ic.govde, 'Çorum FK 1-0 Sakaryaspor');
  assert.equal(ic.url, 'gol.html?id=g-1');
  const ek = M.bildirimIcerigi(olay('gol', { oyuncu: 'Ali', dakika: 90, ek_dakika: 2, penalti: true, corum: 2, rakip_skor: 1, ic_saha: false }, { gol_id: 'g-2' }));
  assert.equal(ek.baslik, "GOL! 90+2' Ali (penaltı)");
  assert.equal(ek.govde, 'Sakaryaspor 1-2 Çorum FK');
});

test('metin: maç sonu skoru; aynı maçın bütün bildirimleri tek etiket (birikmez)', () => {
  const ic = M.bildirimIcerigi(olay('mac_sonu', { corum: 2, rakip_skor: 1 }));
  assert.equal(ic.baslik, 'Maç bitti');
  assert.equal(ic.govde, 'Çorum FK 2-1 Sakaryaspor');
  const etiketler = new Set(['mac_gunu', 'ilk11', 'mac_sonu'].map((t) => M.bildirimIcerigi(olay(t, { corum: 0, rakip_skor: 0 })).etiket));
  etiketler.add(M.bildirimIcerigi(olay('gol', { oyuncu: 'X', dakika: 1, corum: 1, rakip_skor: 0 }, { gol_id: 'g' })).etiket);
  assert.deepEqual([...etiketler], ['mac-' + MAC]);
  assert.throws(() => M.bildirimIcerigi(olay('reklam')), /Bilinmeyen/);
});

test('tercih süzme: yalnız açıkça true olan tür, bilinmeyen tür hiç', () => {
  const t = { mac_gunu: true, ilk11: false, gol: true, mac_sonu: true };
  assert.equal(M.tercihUygun(t, 'gol'), true);
  assert.equal(M.tercihUygun(t, 'ilk11'), false);
  assert.equal(M.tercihUygun({ gol: 'true' }, 'gol'), false);
  assert.equal(M.tercihUygun(null, 'gol'), false);
  assert.equal(M.tercihUygun({ reklam: true }, 'reklam'), false);
  const aboneler = [{ id: 1, tercih: t }, { id: 2, tercih: { ...t, gol: false } }, { id: 3, tercih: B.VARSAYILAN_TERCIH }];
  assert.deepEqual(aboneler.filter((a) => M.tercihUygun(a.tercih, 'gol')).map((a) => a.id), [1, 3]);
});

test('bayat olay gönderilmez: gol 20 dk, maç günü başlama saatinde, ilk 11 başlamadan 15 dk sonra, maç sonu 3 saat', () => {
  const g = olay('gol', {}, { created_at: '2026-11-06T17:00:00Z' });
  assert.equal(M.bayatMi(g, Date.parse('2026-11-06T17:19:00Z')), false);
  assert.equal(M.bayatMi(g, Date.parse('2026-11-06T17:21:00Z')), true);
  assert.equal(M.bayatMi(olay('mac_gunu'), Date.parse('2026-11-06T15:59:00Z')), false);
  assert.equal(M.bayatMi(olay('mac_gunu'), Date.parse('2026-11-06T16:00:00Z')), true);
  assert.equal(M.bayatMi(olay('ilk11'), Date.parse('2026-11-06T16:14:00Z')), false);
  assert.equal(M.bayatMi(olay('ilk11'), Date.parse('2026-11-06T16:16:00Z')), true);
  assert.equal(M.bayatMi(olay('mac_sonu'), Date.parse('2026-11-06T19:58:00Z')), false);
  assert.equal(M.bayatMi(olay('mac_sonu'), Date.parse('2026-11-06T20:00:00Z')), true);
});

test('olay anahtarı ve türler: JS türleri = SQL kısıtı, anahtar UNIQUE ve her olay türünde tekil biçimde (SQL testi tekilliği dener)', () => {
  const sql = oku('supabase/migrations/021_bildirim.sql');
  const kisit = /check \(tur in \(([^)]*)\)\)/.exec(sql)[1].match(/'([a-z0-9_]+)'/g).map((s) => s.slice(1, -1));
  assert.deepEqual(kisit, M.TURLER);
  assert.deepEqual(B.TURLER.map(([a]) => a), M.TURLER);
  assert.deepEqual(Object.keys(B.VARSAYILAN_TERCIH), M.TURLER);
  assert.match(sql, /olay_anahtari text not null unique/);
  for (const anahtar of ["'mac_gunu:' || m.id || ':' || v_gun", "'ilk11:' || m.id", "'gol:' || g.id", "'mac_sonu:' || m.id"]) assert.ok(sql.includes(anahtar), anahtar);
  assert.equal((sql.match(/on conflict \(olay_anahtari\) do nothing/g) || []).length, 4);
  assert.ok(existsSync(path.join(KOK, 'testler/sql/30_bildirim_testleri.sql')));
  assert.match(oku('testler/sql-testleri.js'), /30_bildirim_testleri\.sql/);
});

test('istemci: bölüm durumu (iOS ana ekran, destek, anahtar, service worker, izin)', () => {
  const d = (o) => B.bildirimDurumu({ pushVar: true, ios: false, standalone: false, anahtar: 'x', kayitVar: true, izin: 'default', ...o });
  assert.equal(d({}), 'hazir');
  assert.equal(d({ ios: true, pushVar: false }), 'ios-ana-ekran');
  assert.equal(d({ ios: true, standalone: true }), 'hazir');
  assert.equal(d({ pushVar: false }), 'destek-yok');
  assert.equal(d({ anahtar: null }), 'kurulmadi');
  assert.equal(d({ kayitVar: false }), 'sw-yok');
  assert.equal(d({ izin: 'denied' }), 'reddedildi');
  assert.equal(B.iosMu('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)'), true);
  assert.equal(B.iosMu('Mozilla/5.0 (Macintosh)', 'MacIntel', 5), true);
  assert.equal(B.iosMu('Mozilla/5.0 (Linux; Android 14)', 'Linux armv8l', 5), false);
  // Canlı kurulumdan beri ayar.js'te gerçek AÇIK anahtar var (65 bayt, base64url 87 karakter); özel anahtar yalnız Vault'ta.
  const anahtar = B.vapidAnahtari();
  assert.ok(anahtar === null || /^[A-Za-z0-9_-]{87}$/.test(anahtar), 'ayar.js VAPID_ACIK_ANAHTAR null ya da 87 karakter base64url');
});

test('VAPID betiği: 65 baytlık açık / 32 baytlık özel anahtar (base64url); istemci baytlara çevirir; betik dosya yazmaz', () => {
  const { acik, ozel } = vapidUret();
  assert.match(acik, /^[A-Za-z0-9_-]{87}$/);
  assert.match(ozel, /^[A-Za-z0-9_-]{43}$/);
  const b = B.anahtarBaytlari(acik);
  assert.equal(b.length, 65);
  assert.equal(b[0], 4, 'sıkıştırılmamış P-256 noktası');
  assert.deepEqual([...b], [...Buffer.from(acik, 'base64url')]);
  const cikti = execFileSync(process.execPath, [path.join(KOK, 'araclar/vapid-olustur.js')], { encoding: 'utf8' });
  assert.match(cikti, /export const VAPID_ACIK_ANAHTAR = '[A-Za-z0-9_-]{87}';/);
  assert.match(cikti, /vault\.create_secret\('https:\/\/[a-z0-9]+\.supabase\.co\/functions\/v1\/bildirim-gonder', 'bildirim_url'\)/);
  assert.doesNotMatch(cikti, /supabase secrets set/, '022: secret adımı yok');
  assert.doesNotMatch(oku('araclar/vapid-olustur.js'), /writeFile|appendFile|createWriteStream/);
});

test('vapid-olustur --sql: yalnız SQL; 5 Vault sırrı (varsa update, yoksa create); ayar.js satırı yorum; gizli 32 rastgele bayt', () => {
  const calistir = () => execFileSync(process.execPath, [path.join(KOK, 'araclar/vapid-olustur.js'), '--sql'], { encoding: 'utf8' });
  const deger = (cikti, ad) => new RegExp(`^select vault\\.create_secret\\('([^']+)', '${ad}'\\) where not exists \\(select 1 from vault\\.secrets where name = '${ad}'\\);$`, 'm').exec(cikti)?.[1];
  const cikti = calistir();
  const satirlar = cikti.trim().split('\n');
  assert.match(satirlar[0], /^-- ayar\.js için: export const VAPID_ACIK_ANAHTAR = '[A-Za-z0-9_-]{87}';$/);
  assert.equal(satirlar.length, 11, 'yorum + 5 × (update, create)');
  for (const s of satirlar.slice(1)) assert.match(s, /^select vault\.(update|create)_secret\(/);
  for (const ad of ['bildirim_vapid_public', 'bildirim_vapid_private', 'bildirim_vapid_subject', 'bildirim_gizli', 'bildirim_url']) {
    const d = deger(cikti, ad);
    assert.ok(d, ad + ' create');
    assert.ok(cikti.includes(`select vault.update_secret(id, '${d}') from vault.secrets where name = '${ad}';`), ad + ' update');
  }
  assert.equal(deger(cikti, 'bildirim_vapid_public'), /VAPID_ACIK_ANAHTAR = '([^']+)'/.exec(satirlar[0])[1]);
  assert.match(deger(cikti, 'bildirim_vapid_private'), /^[A-Za-z0-9_-]{43}$/);
  assert.match(deger(cikti, 'bildirim_vapid_subject'), /^mailto:\S+@\S+$/);
  assert.match(deger(cikti, 'bildirim_gizli'), /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(deger(cikti, 'bildirim_gizli'), deger(calistir(), 'bildirim_gizli'), 'her çalıştırmada yeni gizli');
  assert.equal(deger(cikti, 'bildirim_url'), 'https://ejcbncheueetbkxskbbb.supabase.co/functions/v1/bildirim-gonder');
  // Sır adları 021 (bildirim_url, bildirim_gizli) ve 022 ile aynı; tırnak kaçışı
  const g021 = oku('supabase/migrations/021_bildirim.sql'), g022 = oku('supabase/migrations/022_bildirim_vault.sql');
  for (const ad of ['bildirim_url', 'bildirim_gizli']) assert.ok(g021.includes(`s.name = '${ad}'`), '021 ' + ad);
  for (const ad of ['bildirim_vapid_public', 'bildirim_vapid_private', 'bildirim_vapid_subject', 'bildirim_gizli']) assert.ok(g022.includes(`'${ad}'`), '022 ' + ad);
  assert.match(sqlUret({ acik: 'a', ozel: "o'z", gizli: 'g', adres: 'u', konu: 'k' }), /create_secret\('o''z', 'bildirim_vapid_private'\)/);
});

test('Edge Function ayarları (022): ortam tamsa RPC yok; eksikse service_role ile rpc/bildirim_gizli_ayarlar; 5 dk bellekte; eksik saklanmaz; hata değersiz', async () => {
  const istekler = [];
  let satir = { vapid_public: 'ACIK', vapid_private: 'OZEL', vapid_subject: 'mailto:a@b.c', bildirim_gizli: 'GIZLI' };
  let durum = 200;
  const sahteFetch = async (url, o) => { istekler.push({ url, ...o }); return { ok: durum === 200, status: durum, json: async () => [satir] }; };
  const env = (o) => (ad) => ({ SUPABASE_URL: 'https://p.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'SR', ...o })[ad] ?? '';

  // 1) Ortamda dördü de var: RPC çağrılmaz (geriye uyum)
  const tam = M.ayarOkuyucu(env({ VAPID_PUBLIC_KEY: 'e1', VAPID_PRIVATE_KEY: 'e2', VAPID_SUBJECT: 'mailto:e@e.e', BILDIRIM_GIZLI: 'e4' }), sahteFetch);
  assert.deepEqual(await tam(0), { vapid_public: 'e1', vapid_private: 'e2', vapid_subject: 'mailto:e@e.e', bildirim_gizli: 'e4' });
  assert.equal(istekler.length, 0);

  // 2) Ortam yok: Vault RPC'si service_role anahtarıyla, POST; 5 dk bellekte
  const oku2 = M.ayarOkuyucu(env({}), sahteFetch);
  assert.deepEqual(await oku2(1000), satir);
  assert.equal(istekler.length, 1);
  assert.equal(istekler[0].url, 'https://p.supabase.co/rest/v1/rpc/bildirim_gizli_ayarlar');
  assert.equal(istekler[0].method, 'POST');
  assert.equal(istekler[0].headers.apikey, 'SR');
  assert.equal(istekler[0].headers.Authorization, 'Bearer SR');
  await oku2(1000 + 4 * 60 * 1000);
  assert.equal(istekler.length, 1);
  satir = { ...satir, bildirim_gizli: 'YENI' };
  assert.equal((await oku2(1000 + 5 * 60 * 1000)).bildirim_gizli, 'YENI');
  assert.equal(istekler.length, 2);

  // 3) Ortamdaki tek değer Vault'unkinin önüne geçer
  assert.equal((await M.ayarOkuyucu(env({ BILDIRIM_GIZLI: 'ESKI' }), sahteFetch)(0)).bildirim_gizli, 'ESKI');

  // 4) Vault'ta sır yoksa (kurulum bitmedi) boş döner ve SAKLANMAZ: sırlar yazılınca hemen çalışır
  istekler.length = 0;
  satir = { vapid_public: null, vapid_private: null, vapid_subject: null, bildirim_gizli: null };
  const oku4 = M.ayarOkuyucu(env({}), sahteFetch);
  assert.equal((await oku4(0)).bildirim_gizli, null);
  satir = { vapid_public: 'A', vapid_private: 'B', vapid_subject: 'mailto:x@y.z', bildirim_gizli: 'C' };
  assert.equal((await oku4(1)).bildirim_gizli, 'C');
  assert.equal(istekler.length, 2);

  // 5) RPC hatası: atar, mesajda anahtar yok; service_role yoksa atar
  durum = 401;
  await assert.rejects(M.ayarOkuyucu(env({}), sahteFetch)(0), (e) => /HTTP 401/.test(e.message) && !/SR/.test(e.message));
  await assert.rejects(M.ayarOkuyucu(env({ SUPABASE_SERVICE_ROLE_KEY: '' }), sahteFetch)(0), /SUPABASE_SERVICE_ROLE_KEY yok/);

  // index.ts başlığı bu değerle doğrular; VAPID/gizli için doğrudan Deno.env yok; ayar nesnesi günlüğe yazılmaz
  const ts = oku('supabase/functions/bildirim-gonder/index.ts');
  assert.match(ts, /esit\(istek\.headers\.get\('x-bildirim-anahtari'\) \?\? '', a\.bildirim_gizli\)/);
  assert.match(ts, /const ayarlar = ayarOkuyucu\(ortam\)/);
  assert.doesNotMatch(ts, /ortam\('(VAPID|BILDIRIM)/);
  assert.doesNotMatch(ts, /console\.\w+\([^;]*\ba\b[,)]/);
});

/** sw.js'i sahte service worker ortamında çalıştırır; olay dinleyicilerini ve çağrıları döndürür. */
function swOrtami({ istemciler = [] } = {}) {
  const dinleyici = {}, gosterilen = [], acilan = [], mesajlar = [];
  const self = {
    location: { href: 'https://corumtaraftar.netlify.app/sw.js', origin: 'https://corumtaraftar.netlify.app' },
    registration: { scope: 'https://corumtaraftar.netlify.app/', showNotification: async (b, o) => { gosterilen.push([b, o]); } },
    clients: {
      matchAll: async () => istemciler.map((c) => ({ ...c, postMessage: (m) => mesajlar.push([c.url, m]), focus: async () => { acilan.push(['odak', c.url]); } })),
      openWindow: async (u) => { acilan.push(['ac', u]); },
      claim: async () => {},
    },
    addEventListener: (t, f) => { dinleyici[t] = f; },
    skipWaiting: async () => {},
  };
  self.self = self;
  const ctx = vm.createContext({ self, location: self.location, URL, Response, Request, Promise, setTimeout, caches: {}, fetch: async () => { throw new Error('ağ yok'); } });
  vm.runInContext(oku('sw.js'), ctx, { filename: 'sw.js' });
  const tetikle = async (tur, e) => { let s; dinleyici[tur]({ ...e, waitUntil: (p) => { s = p; } }); await s; };
  return { dinleyici, gosterilen, acilan, mesajlar, tetikle };
}

test('sw.js push: başlık/gövde/simge/rozet/etiket, adres site içi; gol yalnız ekrandaki sekmeye düdük mesajı', async () => {
  const sw = swOrtami({ istemciler: [{ url: 'https://corumtaraftar.netlify.app/', visibilityState: 'visible' }, { url: 'https://corumtaraftar.netlify.app/takim', visibilityState: 'hidden' }] });
  const yuk = { baslik: "GOL! 59' Kyziridis", govde: 'Çorum FK 1-0 Sakaryaspor', url: 'gol.html?id=g-1', etiket: 'mac-' + MAC, tur: 'gol' };
  await sw.tetikle('push', { data: { json: () => yuk } });
  const [baslik, o] = sw.gosterilen[0];
  assert.equal(baslik, yuk.baslik);
  assert.equal(o.body, yuk.govde);
  assert.equal(o.icon, 'assets/logo/simge-192.png');
  assert.equal(o.badge, 'assets/logo/rozet-96.png');
  assert.equal(o.tag, 'mac-' + MAC);
  assert.equal(o.renotify, true);
  assert.equal(o.data.url, 'https://corumtaraftar.netlify.app/gol.html?id=g-1');
  assert.equal(JSON.stringify(sw.mesajlar), JSON.stringify([['https://corumtaraftar.netlify.app/', { tur: 'bildirim-gol' }]]));
  for (const f of ['assets/logo/simge-192.png', 'assets/logo/rozet-96.png']) assert.ok(existsSync(path.join(KOK, f)), f);

  // Başka kökenli adres ve bozuk yük: ana sayfa, varsayılan başlık; gol değilse mesaj yok
  const sw2 = swOrtami();
  await sw2.tetikle('push', { data: { json: () => ({ baslik: 'Maç bitti', url: 'https://kotu.ornek.test/x', tur: 'mac_sonu' }) } });
  assert.equal(sw2.gosterilen[0][1].data.url, 'https://corumtaraftar.netlify.app/');
  await sw2.tetikle('push', { data: { json: () => { throw new Error('bozuk'); } } });
  assert.equal(sw2.gosterilen[1][0], 'Çorumspor Taraftar');
  assert.equal(sw2.gosterilen[1][1].tag, undefined);
  assert.deepEqual(sw2.mesajlar, []);
});

test('sw.js notificationclick: ilgili sayfa açık değilse TAM o sayfayı açar; açıksa (uzantısız adresle de) öne getirir', async () => {
  const tikla = (url) => ({ notification: { close() {}, data: { url } } });
  const sw = swOrtami({ istemciler: [{ url: 'https://corumtaraftar.netlify.app/' }] });
  await sw.tetikle('notificationclick', tikla('https://corumtaraftar.netlify.app/gol.html?id=g-1'));
  assert.deepEqual(sw.acilan, [['ac', 'https://corumtaraftar.netlify.app/gol.html?id=g-1']]);

  const sw2 = swOrtami({ istemciler: [{ url: 'https://corumtaraftar.netlify.app/gol?id=g-2' }, { url: 'https://corumtaraftar.netlify.app/gol?id=g-1' }] });
  await sw2.tetikle('notificationclick', tikla('https://corumtaraftar.netlify.app/gol.html?id=g-1'));
  assert.deepEqual(sw2.acilan, [['odak', 'https://corumtaraftar.netlify.app/gol?id=g-1']]);

  const sw3 = swOrtami();
  await sw3.tetikle('notificationclick', tikla('javascript:alert(1)'));
  assert.deepEqual(sw3.acilan, [['ac', 'https://corumtaraftar.netlify.app/']]);
});

test('bağlar: Profil bildirim.js\'i içe aktarır ve modulepreload eder; sw.js kabuğunda; Edge Function yalnız var olan yardımcıları kullanır', () => {
  assert.match(oku('assets/sayfa/profil.js'), /from '\.\.\/bildirim\.js'/);
  assert.match(oku('profil.html'), /<link rel="modulepreload" href="assets\/bildirim\.js">/);
  assert.match(oku('sw.js'), /'assets\/bildirim\.js'/);
  assert.match(oku('assets/ortak.js'), /import\('\.\/bildirim\.js'\)\.then\(\(m\) => m\.golDudugu\(\)\)/);
  const ts = oku('supabase/functions/bildirim-gonder/index.ts');
  const kullanilan = /import \{([^}]+)\} from '\.\/mantik\.js'/.exec(ts)[1].split(',').map((s) => s.trim());
  for (const ad of kullanilan) assert.equal(typeof M[ad], 'function', ad);
  assert.match(ts, /x-bildirim-anahtari/);
  assert.doesNotMatch(ts, /eyJ[A-Za-z0-9_-]{20,}/, 'dosyada anahtar yok');
  // İzin hiçbir zaman sayfa açılınca istenmez: requestPermission yalnız aboneOl içinde
  const b = oku('assets/bildirim.js');
  assert.equal((b.match(/requestPermission\(\)/g) || []).length, 1);
  assert.match(b, /export async function aboneOl[\s\S]*?requestPermission/);
});
