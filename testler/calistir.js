// Bütün testler tek komutla: node testler/calistir.js
//  1) Veritabanı: migration'lar (001 → 002 → 010 → 011 → 012 → 013 → 014 → 015) + seed + RLS testleri (gerçek Postgres ya da PGlite)
//  2) Tarayıcı: Playwright ile uygulama sayfaları, sahte Supabase (ekran görüntüleri testler/ekran/)
//  3) Reklam mantığı: node:test birim testleri (testler/reklam/mantik.test.mjs)
//  4) Reklam SQL: gerçek uygulama şeması üzerinde RLS/RPC testleri (testler/reklam/sql.test.mjs, kurulu Postgres gerekir)
//  5) Reklam tarayıcı: tam uygulamada uçtan uca reklam akışı + bileşen sağlamlığı (testler/reklam-tarayici-testleri.js)
//  6) Görünüm: her sayfa 390/1280 px, açık/koyu tema; taşma, yazı tipi, şerit, reklam kartı, tema, amblem + ekran görüntüleri
//  7) Uygulama birim: kurallar (kullanıcı adı, kapak, yorum sınırları), görsel küçültme hesabı, yayın hazırlama (testler/uygulama.test.mjs)
//  8) Tasarım/erişilebilirlik (013): yer işaretleri, alt menü, klavye/odak örtme, 44 px, %200 yazı, filtreler, facade, yorumlar,
//     profil penceresi, Takım, sponsor sıklığı/tekrar/boş durum/geç yerleşme, şifre sıfırlama, men, çevrimdışı (testler/tasarim-testleri.js)
//  9) Performans (013): kısmalı LCP/CLS, istek sayısı, modulepreload, YouTube'suz açılış, yazı tipleri, hero, _headers (testler/performans-testleri.js)
// Çıkış kodu: hepsi geçerse 0, bir tane bile kalırsa 1.
// Tek tek: node testler/sql-testleri.js | node testler/tarayici-testleri.js | node testler/reklam-tarayici-testleri.js
//          node testler/ekran-testleri.js | node testler/tasarim-testleri.js | node testler/performans-testleri.js
//          node --test testler/reklam/mantik.test.mjs | node --test testler/reklam/sql.test.mjs | node --test testler/uygulama.test.mjs
const path = require('path');
const { spawn } = require('child_process');
const { sqlTestleri } = require('./sql-testleri');
const { tarayiciTestleri } = require('./tarayici-testleri');
const { reklamTarayiciTestleri } = require('./reklam-tarayici-testleri');
const { ekranTestleri } = require('./ekran-testleri');
const { tasarimTestleri } = require('./tasarim-testleri');
const { performansTestleri } = require('./performans-testleri');

/** node --test dosyasını TAP çıktısıyla çalıştırır; { gecen, kalan } döndürür. */
function nodeTest(dosya) {
  return new Promise((coz) => {
    const p = spawn(process.execPath, ['--test', '--test-reporter=tap', path.join(__dirname, dosya)], { cwd: path.resolve(__dirname, '..') });
    let cikti = '', hata = '';
    p.stdout.on('data', (d) => { cikti += d; });
    p.stderr.on('data', (d) => { hata += d; });
    p.on('close', (kod) => {
      const gecen = [], kalan = [];
      // Yalnız en üst düzey testler (girintisiz "ok N - ad" / "not ok N - ad")
      for (const s of cikti.split('\n')) {
        const m = /^(not ok|ok) \d+ - (.*?)(?: # (SKIP|TODO).*)?$/.exec(s);
        if (!m) continue;
        if (m[1] === 'ok' && !m[3]) gecen.push(m[2]); else kalan.push(m[2] + (m[3] ? ' (' + m[3] + ')' : ''));
      }
      if (kod !== 0 && !kalan.length) kalan.push(`${dosya} çalışmadı (çıkış ${kod}): ${(hata || cikti).trim().split('\n').slice(-3).join(' ')}`);
      coz({ gecen, kalan });
    });
  });
}

(async () => {
  const bas = Date.now();
  const kosu = async (f, ad) => { try { return await f(); } catch (e) { return { motor: 'hata', gecen: [], kalan: [ad + ' çalışmadı: ' + (e.stack || e)] }; } };
  const sql = await kosu(sqlTestleri, 'SQL testleri');
  const tarayici = await kosu(tarayiciTestleri, 'Tarayıcı testleri');
  const mantik = await kosu(() => nodeTest('reklam/mantik.test.mjs'), 'Reklam mantık testleri');
  const reklamSql = await kosu(() => nodeTest('reklam/sql.test.mjs'), 'Reklam SQL testleri');
  const reklamTarayici = await kosu(reklamTarayiciTestleri, 'Reklam tarayıcı testleri');
  const gorunum = await kosu(ekranTestleri, 'Görünüm testleri');
  const uygulama = await kosu(() => nodeTest('uygulama.test.mjs'), 'Uygulama birim testleri');
  const tasarim = await kosu(tasarimTestleri, 'Tasarım testleri');
  const performans = await kosu(performansTestleri, 'Performans testleri');
  const gruplar = [
    ['SQL', sql, `(${sql.motor})`],
    ['Tarayıcı', tarayici, '(Playwright/Chromium)'],
    ['Reklam mantık', mantik, '(node:test)'],
    ['Reklam SQL', reklamSql, '(node:test, 001+002+010+011+012+013+014+015 şeması)'],
    ['Reklam tarayıcı', reklamTarayici, '(Playwright/Chromium, tam uygulama ?sahte=1)'],
    ['Görünüm', gorunum, '(360/390/430/1280 px × açık/koyu, testler/ekran/)'],
    ['Uygulama birim', uygulama, '(node:test: kurallar, görsel küçültme, yayın)'],
    ['Tasarım/erişim', tasarim, '(Playwright: T-xx erişilebilirlik ölçütleri, 013 ekranları)'],
    ['Performans', performans, `(kısmalı: ${(performans.olcumler || []).length} LCP/CLS ölçümü)`],
  ];
  const kalan = gruplar.flatMap(([ad, s]) => s.kalan.map((k) => ad + ': ' + k));
  if (kalan.length) { console.log('KALAN TESTLER:'); kalan.forEach((k) => console.log('  ✗ ' + k)); }
  for (const [ad, s, not] of gruplar) console.log(`${(ad + ' ').padEnd(16)}: ${s.gecen.length} geçti, ${s.kalan.length} kaldı ${not}`);
  if (performans.olcumler && performans.olcumler.length) { console.log('Performans ölçümleri:'); performans.olcumler.forEach((o) => console.log('  ' + o)); }
  const toplam = gruplar.reduce((t, [, s]) => t + s.gecen.length, 0);
  console.log(`${'TOPLAM'.padEnd(16)}: ${toplam} geçti, ${kalan.length} kaldı · ${((Date.now() - bas) / 1000).toFixed(1)} sn`);
  process.exit(kalan.length ? 1 : 0);
})();
