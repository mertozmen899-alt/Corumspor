// Paylaşım görselini (og:image) şablondan üretir: node araclar/og-olustur.js
// Girdi: araclar/og/og-sablon.html  Çıktı: assets/img/og-1200x630.png (1200×630, sayfaların <meta property="og:image">'ı).
// Playwright gerekir (require('playwright'), kurulu Chromium; `playwright install` gerekmez). Dış istek yok.
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const kok = path.resolve(__dirname, '..');
  const cikti = path.join(kok, 'assets', 'img', 'og-1200x630.png');
  const tarayici = await chromium.launch();
  const sayfa = await tarayici.newPage({ viewport: { width: 1240, height: 680 }, deviceScaleFactor: 1 });
  await sayfa.route((u) => !u.href.startsWith('file://'), (r) => r.abort());
  await sayfa.goto('file://' + path.join(__dirname, 'og', 'og-sablon.html'));
  await sayfa.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map((i) => i.decode())); });
  const eksik = await sayfa.evaluate(() => [...document.images].filter((i) => !i.naturalWidth).map((i) => i.src));
  if (eksik.length) throw new Error('görsel açılmadı: ' + eksik.join(', '));
  await sayfa.locator('#og').screenshot({ path: cikti, animations: 'disabled' });
  console.log('yazıldı: ' + cikti);
  await tarayici.close();
})().catch((e) => { console.error(e); process.exit(1); });
