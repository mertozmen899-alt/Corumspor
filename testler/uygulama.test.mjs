// Uygulamanın saf kuralları (assets/kurallar.js), görsel küçültme boyut hesabı (assets/gorsel-kucult.js) ve
// yayın hazırlama (araclar/yayin-hazirla.js) birim testleri. Çalıştırma: node --test testler/uygulama.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Depodaki ayar.js yer tutucu içerir: yayın testleri bilerek taslak derler (gerçek yayında yer tutucu varsa derleme durur)
process.env.YAYIN_TASLAK = '1';
const BURASI = path.dirname(fileURLToPath(import.meta.url));
const KOK = path.resolve(BURASI, '..');
const K = await import(new URL('../assets/kurallar.js', import.meta.url).href);
const ORN = JSON.parse(readFileSync(path.join(BURASI, 'kurallar-ornekleri.json'), 'utf8'));

test('kullanıcı adı: ayrılmış / yanıltıcı adlar (büyük-küçük harf, Türkçe harf, rakam ve ayraç fark etmez)', () => {
  for (const [ad, beklenen] of ORN.kullanici_adi) assert.equal(K.kullaniciAdiAyrilmis(ad), beklenen, ad);
});

test('kullanıcı adı biçimi: 3-24 karakter, harf/rakam/_/. ve ayrılmış olmamalı (Türkçe hata metni)', () => {
  assert.equal(K.kullaniciAdiHatasi('ayse_19'), null);
  assert.match(K.kullaniciAdiHatasi('ab'), /3-24 karakter/);
  assert.match(K.kullaniciAdiHatasi('a b c'), /3-24 karakter/);
  assert.match(K.kullaniciAdiHatasi('<b>can</b>'), /3-24 karakter/);
  assert.match(K.kullaniciAdiHatasi('Yönetim'), /kullanılamaz/);
  assert.match(K.kullaniciAdiHatasi('CorumFK_Resmi'), /kullanılamaz/);
});

test('haber kapağı: yalnız proje deposu (haber-gorselleri) ya da assets/img/', () => {
  for (const [url, beklenen] of ORN.kapak) assert.equal(K.kapakAdresiGecerli(url), beklenen, String(url));
});

test('yorum sınırları sabitleri (SQL 012 ile aynı; SQL karşılaştırması testler/reklam/sql.test.mjs)', () => {
  assert.deepEqual({ ...K.YORUM_SINIRLARI }, { enUzun: 1000, dakikada: 5, gunde: 50, tekrarDakika: 10, duzenlemeDakikada: 10, duzenlemeSuresiDakika: 30 });
  assert.equal(K.yorumMetniAyni('  Haydi   Çorum ', 'haydi çorum'), true);
  assert.equal(K.yorumMetniAyni('Haydi Çorum', 'Haydi Çorum!'), false);
});

// ---------------------------------------------------------------------------- görsel küçültme: saf boyut hesabı
test('görsel küçültme: en-boy oranı korunur, sınır içindeyse büyütülmez', async () => {
  const G = await import(new URL('../assets/gorsel-kucult.js', import.meta.url).href);
  assert.deepEqual(G.hedefBoyut(3200, 2400, { enGenis: 1600, enYuksek: 1600 }), { gen: 1600, yuk: 1200, kucult: true });
  assert.deepEqual(G.hedefBoyut(2400, 3200, { enGenis: 1600, enYuksek: 1600 }), { gen: 1200, yuk: 1600, kucult: true });
  assert.deepEqual(G.hedefBoyut(2400, 1256, { enGenis: 1200, enYuksek: 1200 }), { gen: 1200, yuk: 628, kucult: true });
  assert.deepEqual(G.hedefBoyut(800, 600, { enGenis: 1600, enYuksek: 1600 }), { gen: 800, yuk: 600, kucult: false });
  assert.deepEqual(G.hedefBoyut(1, 1, { enGenis: 1600 }), { gen: 1, yuk: 1, kucult: false });
  assert.equal(G.ENCOK_GIRDI_BAYT, 25 * 1024 * 1024);
});

// ---------------------------------------------------------------------------- yayın: yalnız sitenin dosyaları (araclar/yayin-hazirla.js)
import { mkdtempSync, rmSync, existsSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url);

function hepsi(kok, alt = '') {
  return readdirSync(path.join(kok, alt)).flatMap((d) => {
    const yol = alt ? alt + '/' + d : d;
    return statSync(path.join(kok, yol)).isDirectory() ? hepsi(kok, yol) : [yol];
  });
}

test('yayın: yalnız HTML sayfaları, assets/, _headers, robots.txt, .nojekyll; geliştirici klasörleri yok', () => {
  const Y = require('../araclar/yayin-hazirla.js');
  const hedef = mkdtempSync(path.join(tmpdir(), 'yayin-'));
  try {
    Y.hazirla({ kok: KOK, hedef });
    const dosyalar = hepsi(hedef);
    const sayfalar = readdirSync(KOK).filter((d) => d.endsWith('.html')).sort();
    for (const s of [...sayfalar, '_headers', 'robots.txt', '.nojekyll', 'assets/vendor/supabase-js-2.45.4/supabase.js', 'assets/img/og-1200x630.png', 'assets/stil.css', 'assets/fonts/oswald-700-tr.woff2', 'sw.js']) {
      assert.ok(dosyalar.includes(s), 'yayında olmalı: ' + s);
    }
    for (const yasak of ['testler', 'supabase', 'docs', 'araclar', 'node_modules', '.git', 'yayin']) {
      assert.ok(!dosyalar.some((d) => d === yasak || d.startsWith(yasak + '/')), 'yayında olmamalı: ' + yasak);
    }
    assert.ok(!dosyalar.some((d) => /(^|\/)(README\.md|AGENTS\.md|package(-lock)?\.json|\.gitignore|\.env.*)$/.test(d)), dosyalar.filter((d) => /md$|json$/.test(d)).join(','));
    assert.deepEqual(dosyalar.filter((d) => !d.includes('/')).sort(), [...sayfalar, '.nojekyll', '_headers', 'robots.txt', 'sw.js', 'manifest.webmanifest'].sort());
    // Sayfaların ve CSS'in istediği her yerel dosya yayında (kırık bağlantı yok); JS modüllerinin sabit import'ları da
    const eksik = [];
    for (const d of dosyalar.filter((x) => /\.(html|css|js)$/.test(x))) {
      const metin = readFileSync(path.join(hedef, d), 'utf8');
      const adresler = d.endsWith('.html') ? [...metin.matchAll(/\b(?:src|href|content)="([^"#?]+)/g)].map((m) => m[1])
        : d.endsWith('.css') ? [...metin.matchAll(/url\(\s*['"]?([^'")?#]+)/g)].map((m) => m[1])
          : [...metin.matchAll(/^\s*(?:import|export)\s[^'"]*from\s+'(\.{1,2}\/[^']+)'/gm)].map((m) => m[1]);
      for (let a of adresler) {
        const yenile = /^\d+;\s*url=(.+)$/.exec(a); // <meta http-equiv="refresh" content="0; url=takim.html">
        if (yenile) a = yenile[1];
        if (d.endsWith('.html') && (a === './' || sayfalar.includes(a + '.html'))) continue; // uzantısız sayfa adresi (aşağıda ayrıca denenir)
        if (/^(https?:|data:|mailto:|blob:|#)/.test(a) || !/\.[a-z0-9]+$/i.test(a) || /^[A-Za-zÇ]/.test(a) && !/[./]/.test(a)) continue;
        const tam = path.normalize(path.join(path.dirname(path.join(hedef, d)), a));
        if (!existsSync(tam)) eksik.push(d + ' → ' + a);
      }
    }
    assert.deepEqual(eksik, []);
  } finally { rmSync(hedef, { recursive: true, force: true }); }
});

test('service worker (013): önbelleğe alınan bütün dosyalar var; auth/rpc/POST/YouTube saklanmaz; yönetim dışarıda', () => {
  const sw = readFileSync(path.join(KOK, 'sw.js'), 'utf8');
  const liste = [...sw.matchAll(/'((?:assets\/[^']+)|(?:[a-z]+\.html))'/g)].map((m) => m[1]);
  assert.ok(liste.length >= 20, 'liste kısa: ' + liste.length);
  assert.deepEqual(liste.filter((d) => !existsSync(path.join(KOK, d))), []);
  assert.ok(!liste.includes('yonetim.html'));
  assert.match(sw, /if \(r\.method !== 'GET'\) return;/);
  assert.match(sw, /\(haberler\|maclar\|goller\|oyuncular\|sakatliklar\)\$/, 'yalnız herkese açık tablolar');
  assert.ok(!/rpc\|/.test(sw) && !/youtube/i.test(sw.replace(/\/\/.*$/gm, '')), 'rpc ve YouTube saklanmaz');
  assert.match(sw, /type !== 'opaque'/);
  const ortak = readFileSync(path.join(KOK, 'assets/ortak.js'), 'utf8');
  assert.match(ortak, /\['localhost', '127\.0\.0\.1'\]\.includes\(location\.hostname\) \|\| sahteMod\) return;/, 'testte (localhost / ?sahte=1) kayıt yok');
});

test('yayın (013): SUPABASE_URL doluysa sayfalara preconnect eklenir; yer tutucu adresle eklenmez', () => {
  const Y = require('../araclar/yayin-hazirla.js');
  const html = '<head>\n<meta charset="utf-8">\n<title>x</title></head>';
  assert.match(Y.onBaglanti(html, 'https://abcd.supabase.co'), /<meta charset="utf-8">\n<link rel="preconnect" href="https:\/\/abcd\.supabase\.co" crossorigin>\n<link rel="preconnect" href="https:\/\/abcd\.supabase\.co">/);
  assert.equal(Y.onBaglanti(html, 'https://PROJE-KODUNUZ.supabase.co'), html);
  assert.equal(Y.onBaglanti(html, 'javascript:alert(1)'), html);
});

test('yayın: testler/, supabase/, docs/, araclar/ ya da node_modules dahil edilmeye kalkılırsa durur', () => {
  const Y = require('../araclar/yayin-hazirla.js');
  const hedef = mkdtempSync(path.join(tmpdir(), 'yayin-'));
  try {
    for (const yol of ['testler/sahte-supabase.js', 'supabase/migrations/001_temel_sema.sql', 'docs/DENETIM-2026-11-05.md', 'araclar/yayin-hazirla.js', 'node_modules/x/index.js', 'assets/node_modules/y.js']) {
      assert.throws(() => Y.hazirla({ kok: KOK, hedef, ekstra: [yol] }), /yayına girmemeli/, yol);
    }
    assert.throws(() => Y.hazirla({ kok: KOK, hedef: KOK }), /hedef/);
    // assets/ içine bir geliştirici klasörü bağlanmışsa (sembolik bağ) da durur
    const sahteKok = mkdtempSync(path.join(tmpdir(), 'yayin-kok-'));
    mkdirSync(path.join(sahteKok, 'assets'));
    writeFileSync(path.join(sahteKok, 'index.html'), '<!doctype html>');
    require('node:fs').symlinkSync(path.join(KOK, 'testler'), path.join(sahteKok, 'assets', 'testler'));
    assert.throws(() => Y.hazirla({ kok: sahteKok, hedef }), /bağ|yayına girmemeli/);
    rmSync(sahteKok, { recursive: true, force: true });
  } finally { rmSync(hedef, { recursive: true, force: true }); }
});

test('yayın: SITE_ADRESI verilirse og:image tam adres olur, og:url eklenir; komut satırı çalışır', () => {
  const hedef = mkdtempSync(path.join(tmpdir(), 'yayin-'));
  try {
    const r = spawnSync(process.execPath, [path.join(KOK, 'araclar', 'yayin-hazirla.js'), hedef], { encoding: 'utf8', env: { ...process.env, SITE_ADRESI: 'https://corumspor.pages.dev/' } });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /dosya/);
    const ana = readFileSync(path.join(hedef, 'index.html'), 'utf8');
    assert.ok(ana.includes('<meta property="og:image" content="https://corumspor.pages.dev/assets/img/og-1200x630.png">'), ana.slice(0, 2000));
    assert.ok(ana.includes('<meta property="og:url" content="https://corumspor.pages.dev/">'), 'yayında adresler uzantısız');
    assert.ok(readFileSync(path.join(hedef, 'goller.html'), 'utf8').includes('<meta property="og:url" content="https://corumspor.pages.dev/goller">'));
    const kaynak = readFileSync(path.join(KOK, 'index.html'), 'utf8');
    assert.ok(kaynak.includes('content="assets/img/og-1200x630.png"'), 'depodaki dosya değişmez');
    assert.equal(spawnSync(process.execPath, [path.join(KOK, 'araclar', 'yayin-hazirla.js'), hedef], { encoding: 'utf8', env: { ...process.env, SITE_ADRESI: 'http://kotu adres' } }).status, 1, 'bozuk SITE_ADRESI reddedilir');
  } finally { rmSync(hedef, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------- 2. tur: yayın kopyasında yapılanlar
test('yayın (2. tur): ayar.js yer tutucuysa derleme DURUR (çıkış 1), YAYIN_TASLAK=1 ile taslak çıkar', () => {
  const Y = require('../araclar/yayin-hazirla.js');
  const hedef = mkdtempSync(path.join(tmpdir(), 'yayin-'));
  try {
    assert.throws(() => Y.hazirla({ kok: KOK, hedef, taslak: false }), /yer tutucu.*PROJE-KODUNUZ.*ANON-ANAHTARINIZ.*iletisim@ornek\.com.*YAYIN_TASLAK=1/s);
    const env = { ...process.env }; delete env.YAYIN_TASLAK;
    const r = spawnSync(process.execPath, [path.join(KOK, 'araclar', 'yayin-hazirla.js'), hedef], { encoding: 'utf8', env });
    assert.equal(r.status, 1, 'yer tutucuyla komut satırı çıkış 1');
    assert.match(r.stderr, /YAYIN DURDU: assets\/ayar\.js hâlâ yer tutucu/);
    const r2 = spawnSync(process.execPath, [path.join(KOK, 'araclar', 'yayin-hazirla.js'), hedef], { encoding: 'utf8', env: { ...env, YAYIN_TASLAK: '1' } });
    assert.equal(r2.status, 0, r2.stderr);
    assert.match(r2.stdout, /TASLAK/);
  } finally { rmSync(hedef, { recursive: true, force: true }); }
});

test('yayın (2. tur): gerçek ayarla CSP sayfadan _headers\'a taşınır, tam Supabase adresi; HSTS; preconnect', () => {
  const Y = require('../araclar/yayin-hazirla.js');
  const kok = mkdtempSync(path.join(tmpdir(), 'yayin-kok-'));
  const hedef = mkdtempSync(path.join(tmpdir(), 'yayin-'));
  try {
    mkdirSync(path.join(kok, 'assets'));
    writeFileSync(path.join(kok, 'assets', 'ayar.js'), "export const SUPABASE_URL = 'https://abcdefgh.supabase.co';\nexport const SUPABASE_ANON_KEY = 'eyJhbGciOi.gercek';\nexport const ILETISIM_EPOSTA = 'mert@corumtaraftar.example';\n");
    for (const ad of ['index.html', 'goller.html']) writeFileSync(path.join(kok, ad), readFileSync(path.join(KOK, ad), 'utf8'));
    writeFileSync(path.join(kok, '_headers'), readFileSync(path.join(KOK, '_headers'), 'utf8'));
    Y.hazirla({ kok, hedef, taslak: false });
    const ana = readFileSync(path.join(hedef, 'index.html'), 'utf8');
    const basliklar = readFileSync(path.join(hedef, '_headers'), 'utf8');
    assert.ok(!/http-equiv="Content-Security-Policy"/.test(ana), 'yayında meta CSP yok (önden yükleme tarayıcısı beklemesin)');
    const csp = (/^\/\*\n(?:[ \t]+.*\n)*?[ \t]+Content-Security-Policy: (.*)$/m.exec(basliklar) || [])[1] || '';
    assert.match(csp, /script-src 'self'/);
    assert.match(csp, /img-src 'self' https:\/\/abcdefgh\.supabase\.co data: blob:/);
    assert.match(csp, /connect-src 'self' https:\/\/abcdefgh\.supabase\.co wss:\/\/abcdefgh\.supabase\.co/);
    assert.match(csp, /frame-ancestors 'none'/);
    // Son tur (denetçi 5): media-src her https adresi değil; site + proje deposu. YouTube yalnız frame-src'de
    assert.match(csp, /media-src 'self' https:\/\/abcdefgh\.supabase\.co blob:(;|$)/);
    assert.ok(!/media-src[^;]*https:(\s|;|$)/.test(csp), 'media-src\'te çıplak https: yok: ' + csp);
    assert.ok(!/media-src[^;]*youtube/.test(csp) && /frame-src https:\/\/www\.youtube-nocookie\.com/.test(csp), 'YouTube yalnız frame-src');
    assert.ok(!/\*\.supabase\.co/.test(csp), 'her Supabase projesi değil, yalnız bu proje: ' + csp);
    assert.equal((basliklar.match(/Content-Security-Policy:/g) || []).length, 1, 'tek CSP başlığı');
    assert.match(basliklar, /Strict-Transport-Security: max-age=31536000; includeSubDomains/);
    assert.match(ana, /<link rel="preconnect" href="https:\/\/abcdefgh\.supabase\.co" crossorigin>/);
    // depodaki dosyalar değişmez: kaynakta meta CSP kalır (yerelde çalışır)
    assert.match(readFileSync(path.join(KOK, 'index.html'), 'utf8'), /<meta http-equiv="Content-Security-Policy" content="[^"]*\*\.supabase\.co/);
    assert.match(readFileSync(path.join(KOK, '_headers'), 'utf8'), /Strict-Transport-Security/);
    // _headers yoksa CSP kaybolmaz: meta sayfada kalır
    rmSync(path.join(kok, '_headers'));
    Y.hazirla({ kok, hedef, taslak: false });
    assert.match(readFileSync(path.join(hedef, 'index.html'), 'utf8'), /http-equiv="Content-Security-Policy"/);
  } finally { rmSync(kok, { recursive: true, force: true }); rmSync(hedef, { recursive: true, force: true }); }
});

test('yayın (2. tur): iç bağlantılar uzantısız (Cloudflare 308 yok), JS dizeleri de; sw.js sürümü içerik özeti', () => {
  const Y = require('../araclar/yayin-hazirla.js');
  const h1 = mkdtempSync(path.join(tmpdir(), 'yayin-')), h2 = mkdtempSync(path.join(tmpdir(), 'yayin-'));
  try {
    Y.hazirla({ kok: KOK, hedef: h1 });
    const sayfalar = readdirSync(KOK).filter((d) => d.endsWith('.html'));
    const adlar = sayfalar.map((d) => d.replace(/\.html$/, ''));
    const kalan = [];
    for (const d of hepsi(h1).filter((x) => /\.(html|js)$/.test(x))) {
      const m = readFileSync(path.join(h1, d), 'utf8');
      for (const ad of adlar) {
        const re = d.endsWith('.html') ? new RegExp(`\\shref="${ad}\\.html`) : new RegExp(`['"\`]${ad}\\.html`);
        if (re.test(m)) kalan.push(`${d}: ${ad}.html`);
      }
      if (d.endsWith('.html')) {
        for (const [, a] of m.matchAll(/\shref="([a-z]+|\.\/)(?=["?#])/g)) if (a !== './' && !sayfalar.includes(a + '.html')) kalan.push(`${d}: bilinmeyen sayfa ${a}`);
      }
    }
    assert.deepEqual(kalan, []);
    const ana = readFileSync(path.join(h1, 'index.html'), 'utf8');
    assert.match(ana, /<a href="goller">/);
    assert.match(ana, /class="logo" href="\.\/"/);
    assert.match(readFileSync(path.join(h1, 'maclar.html'), 'utf8'), /content="0; url=takim#fikstur"/);
    assert.match(readFileSync(path.join(h1, 'assets/sayfa/ana.js'), 'utf8'), /'haber\?id='/);
    assert.match(readFileSync(path.join(h1, 'assets/ortak.js'), 'utf8'), /\/giris\(\\\.html\)\?/, 'düzenli ifadeler (giris\\.html) olduğu gibi kalır');
    // kaynak değişmez
    assert.match(readFileSync(path.join(KOK, 'index.html'), 'utf8'), /<a href="goller\.html">/);
    // sw.js: SURUM içerik özeti; aynı içerik aynı sürüm, DOSYALAR yayındaki kabuk (yönetim yok, hepsi var)
    const sw1 = readFileSync(path.join(h1, 'sw.js'), 'utf8');
    const surum = (/const SURUM = '([^']+)';/.exec(sw1) || [])[1];
    assert.match(surum, /^y-[0-9a-f]{12}$/);
    Y.hazirla({ kok: KOK, hedef: h2 });
    assert.equal((/const SURUM = '([^']+)';/.exec(readFileSync(path.join(h2, 'sw.js'), 'utf8')) || [])[1], surum, 'aynı içerik → aynı sürüm');
    const dosyalarSw = JSON.parse((/const DOSYALAR = (\[[^\]]*\]);/.exec(sw1) || [])[1]);
    assert.ok(dosyalarSw.length >= 25 && dosyalarSw.includes('assets/ortak.js') && dosyalarSw.includes('assets/reklam/reklam.js') && dosyalarSw.includes('manifest.webmanifest'), dosyalarSw.join(','));
    assert.deepEqual(dosyalarSw.filter((d) => /yonetim/.test(d) || !existsSync(path.join(h1, d))), []);
    assert.match(sw1, /const SAYFALAR = \['\.\/', '\.\/', 'goller'/);
    assert.equal(Y.swHazirla("const SURUM = 'gelistirme';\nconst DOSYALAR = ['a'];", 'y-1', ['b']), "const SURUM = 'y-1';\nconst DOSYALAR = [\"b\"];");
  } finally { rmSync(h1, { recursive: true, force: true }); rmSync(h2, { recursive: true, force: true }); }
});

test('service worker (son tur): Cloudflare 308 yönlendirmesine dayanıklı, kurulumda no-cache / değişmeyene varsayılan, önceki kabuk bir sürüm daha, sınırlı önbellekler', () => {
  const sw = readFileSync(path.join(KOK, 'sw.js'), 'utf8');
  assert.match(sw, /const SURUM = 'gelistirme';/, 'depoda geliştirme sürümü (yayında özet)');
  assert.ok(!/cache: 'reload'/.test(sw), 'kurulum HTTP önbelleğini baştan atlamaz (performans 3. tur 5)');
  assert.match(sw, /cache: degismez\(adres\) \? 'default' : 'no-cache'/);
  const degismez = new Function(/const degismez = [^\n]+/.exec(sw)[0] + '; return degismez;')();
  for (const d of ['assets/fonts/oswald-700-tr.woff2', 'assets/vendor/supabase-js-2.45.4/supabase.js', 'assets/logo/simge-192.png']) assert.ok(degismez(d), d);
  for (const d of ['assets/ortak.js', 'assets/stil.css', 'assets/sayfa/ana.js', 'index.html', 'goller.html', 'manifest.webmanifest']) assert.ok(!degismez(d), d);
  // Karışık sürüm yok (performans 3. tur 6): önceki kabuk silinmez, etkinleşme anındaki sekmeler önceki kabuktan beslenir
  assert.match(sw, /k !== KABUK && k !== 'kabuk-' \+ onceki/);
  assert.match(sw, /kabukDosyasi\(r, e\.clientId\)/);
  assert.match(sw, /clients\.matchAll\(\{ includeUncontrolled: true, type: 'window' \}\)/);
  assert.match(sw, /y\.redirected/);
  assert.match(sw, /new Response\(await y\.blob\(\)/);
  assert.match(sw, /VERI_EN_COK = \d+/);
  assert.match(sw, /GORSEL_EN_COK = \d+/);
  assert.match(sw, /'\.\/'/, 'kök adres de önbellekte');
  // sayfa anahtarı: .html ve sorgu atılır, index → kök
  const kod = /function sayfaAnahtari[\s\S]*?\n}/.exec(sw)[0];
  const sayfaAnahtari = new Function('self', kod + '; return sayfaAnahtari;')({ location: { href: 'https://site.example/sw.js' } });
  for (const [a, b] of [['goller.html', 'https://site.example/goller'], ['/goller', 'https://site.example/goller'], ['haber.html?id=1', 'https://site.example/haber'],
    ['index.html', 'https://site.example/'], ['./', 'https://site.example/'], ['/', 'https://site.example/']]) assert.equal(sayfaAnahtari(a), b, a);
  const headers = readFileSync(path.join(KOK, '_headers'), 'utf8');
  assert.ok(!/karışık sürüm en çok 5 dk/.test(headers), '_headers yorumu düzeltildi (SWR 7 gün)');
});

test('PWA (2. tur): manifest (standalone, #0B0B0B, 192/512 + maskable PNG), her sayfada manifest + apple-touch-icon', () => {
  const m = JSON.parse(readFileSync(path.join(KOK, 'manifest.webmanifest'), 'utf8'));
  assert.equal(m.display, 'standalone');
  assert.equal(m.theme_color, '#0B0B0B');
  assert.equal(m.lang, 'tr');
  assert.match(m.name, /Çorumspor Taraftar/);
  assert.ok(m.start_url && m.short_name && m.short_name.length <= 12);
  const png = (yol) => { const b = readFileSync(path.join(KOK, yol)); assert.equal(b.toString('latin1', 1, 4), 'PNG', yol); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
  const boy = (ic) => ic.sizes.split('x').map(Number);
  for (const ic of m.icons) assert.deepEqual(png(ic.src), boy(ic), ic.src);
  assert.ok(m.icons.some((i) => i.sizes === '192x192' && /any/.test(i.purpose)));
  assert.ok(m.icons.some((i) => i.sizes === '512x512' && /any/.test(i.purpose)));
  assert.ok(m.icons.some((i) => i.sizes === '512x512' && /maskable/.test(i.purpose)));
  assert.deepEqual(png('assets/logo/apple-touch-icon-180.png'), [180, 180]);
  for (const d of readdirSync(KOK).filter((x) => x.endsWith('.html'))) {
    const h = readFileSync(path.join(KOK, d), 'utf8');
    assert.ok(h.includes('<link rel="manifest" href="manifest.webmanifest">'), d + ': manifest');
    assert.ok(h.includes('<link rel="apple-touch-icon" href="assets/logo/apple-touch-icon-180.png">'), d + ': apple-touch-icon');
    assert.ok(h.includes('<meta name="theme-color" content="#0B0B0B">'), d + ': theme-color');
  }
  assert.match(readFileSync(path.join(KOK, '_headers'), 'utf8'), /\/manifest\.webmanifest\n\s+Content-Type: application\/manifest\+json/);
  assert.ok(require('../araclar/yayin-hazirla.js').yayinListesi(KOK).includes('manifest.webmanifest'));
});

// GEÇİCİ (son tur): gizlilik.html ve kurallar.html bu tur SUNUCU izindeydi; ortak satırlar birleştirmede uygulanır (sonra liste boşalır)
const SUNUCU_SAYFALARI_SON_TUR = []; // son tur birleşti: bütün sayfalar denetlenir

test('bağımsızlık (son tur): her sayfanın og:description\'ı "Çorum FK\'nın resmî uygulaması değildir"; açıklamalar "Çorum FK"; künyede "kaldırma taleplerine en geç 24 saat içinde dönülür"; kalın yazı tipi preload\'u yok', () => {
  for (const d of readdirSync(KOK).filter((x) => x.endsWith('.html'))) {
    const h = readFileSync(path.join(KOK, d), 'utf8');
    assert.match((/<meta property="og:description" content="([^"]*)">/.exec(h) || [])[1] || '', /Çorum FK'nın resmî uygulaması değildir\.$/, d);
    assert.ok(!/content="Çorumspor (taraftarları|golleri|kadrosu)/.test(h), d + ': takımdan "Çorum FK" diye söz edilir');
    if (SUNUCU_SAYFALARI_SON_TUR.includes(d)) continue;
    const alt = (/<footer class="alt">([\s\S]*?)<\/footer>/.exec(h) || [])[1] || '';
    assert.ok(alt.includes('(kaldırma taleplerine en geç 24 saat içinde dönülür)') && !/en kısa sürede dönülür/.test(h), d + ': künyede kaldırma talebi süresi (yalnız kaldırma; başkan 3. tur 1)');
    // Performans 3. tur 1: kalın gövde yazısı preload edilmez (@font-face kalır; font-display: optional): kritik yolda bant genişliği yarışı
    assert.ok(!h.includes('source-sans-3-700-tr.woff2" as="font"'), d + ': kalın gövde yazı tipi önden YÜKLENMEZ');
    assert.equal((h.match(/<link rel="preload" href="assets\/fonts\/[^"]+" as="font"/g) || []).length, 2, d + ': 2 yazı tipi preload (Oswald 700, Source Sans 400)');
    assert.ok(!/fetchpriority="high" src="assets\/vendor/.test(h), d + ': supabase-js fetchpriority=high DEĞİL');
  }
  const tasarim = readFileSync(path.join(KOK, 'docs/TASARIM.md'), 'utf8'), beni = readFileSync(path.join(KOK, 'README.md'), 'utf8');
  assert.ok(tasarim.includes('kaldırma taleplerine en geç 24 saat içinde dönülür') && beni.includes('en geç 24 saat içinde dönülür'), 'TASARIM.md ve README.md künyeyle aynı sözü söyler');
  assert.ok(!/saat sözü verilmez/.test(tasarim), 'TASARIM.md eski "saat sözü verilmez" gerekçesi kalktı');
});

test('varlıklar (2. tur): sahte-supabase.js\'teki her assets/ yolu ve fotoğraf kopyaları gerçekten var (404 yok)', async () => {
  const { FOTO_KAYNAKLARI } = await import(new URL('../assets/foto-kaynaklari.js', import.meta.url).href);
  const sahte = readFileSync(path.join(BURASI, 'sahte-supabase.js'), 'utf8');
  const yollar = new Set([...sahte.matchAll(/['"`](assets\/[^'"`$]+\.[a-z0-9]+)['"`]/g)].map((m) => m[1]));
  const imgSablon = /const IMG = \(ad\) => `assets\/img\/\$\{ad\}-(\d+)\.webp`/.exec(sahte);
  assert.ok(imgSablon, 'IMG() şablonu bulunamadı');
  // IMG('kök') ve haber(n, başlık, özet, gün, 'kök', …) çağrılarındaki fotoğraf kökleri
  const kokler = [...sahte.matchAll(/IMG\('([a-z0-9-]+)'\)/g), ...sahte.matchAll(/\bhaber\(\d+, .*?, (?:'[^']*'|null), \d+, '([a-z0-9-]+)'/g)].map((m) => m[1]);
  assert.ok(kokler.length >= 6, kokler.join(','));
  for (const ad of new Set(kokler)) {
    yollar.add(`assets/img/${ad}-${imgSablon[1]}.webp`);
    const kayit = FOTO_KAYNAKLARI[ad];
    assert.ok(kayit, `${ad}: foto-kaynaklari.js kaydı (atıf) yok`);
    for (const g of kayit.genislikler) yollar.add(`assets/img/${ad}-${g}.webp`);
  }
  assert.ok(yollar.size >= 8, [...yollar].join(','));
  assert.deepEqual([...yollar].filter((y) => !existsSync(path.join(KOK, y))), []);
  // foto-kaynaklari.js'teki her genişliğin dosyası var; assets/img'deki her webp kopyası bir kayda ve genişliğe denk
  const eksik = [], fazla = [];
  for (const [kok, k] of Object.entries(FOTO_KAYNAKLARI)) for (const g of k.genislikler) if (!existsSync(path.join(KOK, 'assets/img', `${kok}-${g}.webp`))) eksik.push(`${kok}-${g}`);
  for (const f of readdirSync(path.join(KOK, 'assets/img')).filter((x) => x.endsWith('.webp'))) {
    const m = /^(.+)-(\d+)\.webp$/.exec(f);
    if (!m || !FOTO_KAYNAKLARI[m[1]] || !FOTO_KAYNAKLARI[m[1]].genislikler.includes(Number(m[2]))) fazla.push(f);
  }
  assert.deepEqual(eksik, []);
  assert.deepEqual(fazla, []);
});
