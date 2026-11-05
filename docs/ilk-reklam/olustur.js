// Narçil reklam görsellerini şablondan üretir: node docs/ilk-reklam/olustur.js
// Girdi: docs/ilk-reklam/narcil-sablon.html  Çıktı: narcil-1200x628.png, narcil-600x600.png ve WebP kopyaları
// (narcil-1200x628.webp, narcil-600x600.webp; kalite 0.85; panele yüklenecek olanlar bunlar) aynı klasörde.
// Var olan PNG'lerden yalnız WebP üretmek için: node docs/ilk-reklam/olustur.js --yalniz-webp
// Playwright gerekir (require('playwright'), kurulu Chromium). Yazı tipi: bilgisayarda kurulu Inter.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const GORSELLER = [['#yatay', 'narcil-1200x628'], ['#kare', 'narcil-600x600']];

(async () => {
  const klasor = __dirname;
  const yalnizWebp = process.argv.includes('--yalniz-webp');
  const tarayici = await chromium.launch();
  const sayfa = await tarayici.newPage({ viewport: { width: 1300, height: 1400 }, deviceScaleFactor: 1 });
  if (!yalnizWebp) {
    await sayfa.goto('file://' + path.join(klasor, 'narcil-sablon.html'));
    await sayfa.evaluate(() => document.fonts.ready);
    for (const [secici, ad] of GORSELLER) {
      await sayfa.locator(secici).screenshot({ path: path.join(klasor, ad + '.png'), animations: 'disabled' });
      console.log('yazıldı: ' + path.join(klasor, ad + '.png'));
    }
  }
  // PNG → WebP (Chromium'un kendi kodlayıcısıyla; ölçü aynı kalır)
  await sayfa.goto('about:blank');
  for (const [, ad] of GORSELLER) {
    const png = fs.readFileSync(path.join(klasor, ad + '.png')).toString('base64');
    const webp = await sayfa.evaluate(async (png) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + png;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      return c.toDataURL('image/webp', 0.85).split(',')[1];
    }, png);
    fs.writeFileSync(path.join(klasor, ad + '.webp'), Buffer.from(webp, 'base64'));
    console.log('yazıldı: ' + path.join(klasor, ad + '.webp'));
  }
  await tarayici.close();
})().catch((e) => { console.error(e); process.exit(1); });
