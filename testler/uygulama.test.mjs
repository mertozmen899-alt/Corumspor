// Uygulamanın saf kuralları (assets/kurallar.js), görsel küçültme boyut hesabı (assets/gorsel-kucult.js) ve
// yayın hazırlama (araclar/yayin-hazirla.js) birim testleri. Çalıştırma: node --test testler/uygulama.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
    for (const s of [...sayfalar, '_headers', 'robots.txt', '.nojekyll', 'assets/vendor/supabase-js-2.45.4/supabase.js', 'assets/img/og-1200x630.png', 'assets/stil.css', 'assets/fonts/fontlar.css']) {
      assert.ok(dosyalar.includes(s), 'yayında olmalı: ' + s);
    }
    for (const yasak of ['testler', 'supabase', 'docs', 'araclar', 'node_modules', '.git', 'yayin']) {
      assert.ok(!dosyalar.some((d) => d === yasak || d.startsWith(yasak + '/')), 'yayında olmamalı: ' + yasak);
    }
    assert.ok(!dosyalar.some((d) => /(^|\/)(README\.md|AGENTS\.md|package(-lock)?\.json|\.gitignore|\.env.*)$/.test(d)), dosyalar.filter((d) => /md$|json$/.test(d)).join(','));
    assert.deepEqual(dosyalar.filter((d) => !d.includes('/')).sort(), [...sayfalar, '.nojekyll', '_headers', 'robots.txt'].sort());
    // Sayfaların ve CSS'in istediği her yerel dosya yayında (kırık bağlantı yok); JS modüllerinin sabit import'ları da
    const eksik = [];
    for (const d of dosyalar.filter((x) => /\.(html|css|js)$/.test(x))) {
      const metin = readFileSync(path.join(hedef, d), 'utf8');
      const adresler = d.endsWith('.html') ? [...metin.matchAll(/\b(?:src|href|content)="([^"#?]+)/g)].map((m) => m[1])
        : d.endsWith('.css') ? [...metin.matchAll(/url\(\s*['"]?([^'")?#]+)/g)].map((m) => m[1])
          : [...metin.matchAll(/^\s*(?:import|export)\s[^'"]*from\s+'(\.{1,2}\/[^']+)'/gm)].map((m) => m[1]);
      for (const a of adresler) {
        if (/^(https?:|data:|mailto:|blob:|#)/.test(a) || !/\.[a-z0-9]+$/i.test(a) || /^[A-Za-zÇ]/.test(a) && !/[./]/.test(a)) continue;
        const tam = path.normalize(path.join(path.dirname(path.join(hedef, d)), a));
        if (!existsSync(tam)) eksik.push(d + ' → ' + a);
      }
    }
    assert.deepEqual(eksik, []);
  } finally { rmSync(hedef, { recursive: true, force: true }); }
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
    assert.ok(ana.includes('<meta property="og:url" content="https://corumspor.pages.dev/index.html">'));
    const kaynak = readFileSync(path.join(KOK, 'index.html'), 'utf8');
    assert.ok(kaynak.includes('content="assets/img/og-1200x630.png"'), 'depodaki dosya değişmez');
    assert.equal(spawnSync(process.execPath, [path.join(KOK, 'araclar', 'yayin-hazirla.js'), hedef], { encoding: 'utf8', env: { ...process.env, SITE_ADRESI: 'http://kotu adres' } }).status, 1, 'bozuk SITE_ADRESI reddedilir');
  } finally { rmSync(hedef, { recursive: true, force: true }); }
});
