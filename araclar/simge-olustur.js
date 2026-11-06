// Ana ekran simgelerini (PWA, manifest.webmanifest) özgün "ÇT" işaretinden üretir: node araclar/simge-olustur.js
// Girdi: assets/logo/amblem-yedek.svg (kulüp amblemi DEĞİL). Çıktılar assets/logo/:
//   simge-192.png, simge-512.png        ("any": şeffaf zemin üzerinde yuvarlak işaret)
//   simge-maskable-512.png              ("maskable": tam dolu #0B0B0B zemin, işaret güvenli alanın (%80) içinde)
//   apple-touch-icon-180.png            (iOS ana ekranı: şeffaflık yok, siyah zemin)
//   rozet-96.png                        (021 bildirim rozeti: şeffaf zemin üzerinde yalnız beyaz "ÇT" + şimşek; Android yalnız saydamlığı kullanır)
// Playwright gerekir (require('playwright'), kurulu Chromium; `playwright install` gerekmez). Dış istek yok.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const KOK = path.resolve(__dirname, '..');
const SVG = fs.readFileSync(path.join(KOK, 'assets', 'logo', 'amblem-yedek.svg'), 'utf8');
// Rozet: işaretin halkasız, tek renk (beyaz) hâli; harf ve şimşek yolları amblem-yedek.svg ile aynı
const ROZET = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="33 52 132 108">
  <path d="M93 71 A32 32 0 1 0 93 125" fill="none" stroke="#fff" stroke-width="15"/>
  <path d="M77 133 L73 142 Q83 142 82 148 Q81 154 72 153" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="101" y="64" width="54" height="15" fill="#fff"/><rect x="120.5" y="64" width="15" height="67" fill="#fff"/>
  <path d="M152 90 L142 108 H150 L145 124 L161 102 H153 L158 90 Z" fill="#fff"/></svg>`;
const SIMGELER = [
  { ad: 'simge-192.png', boy: 192, zemin: null, oran: 1 },
  { ad: 'simge-512.png', boy: 512, zemin: null, oran: 1 },
  { ad: 'simge-maskable-512.png', boy: 512, zemin: '#0B0B0B', oran: 0.72 },
  { ad: 'apple-touch-icon-180.png', boy: 180, zemin: '#0B0B0B', oran: 0.86 },
  { ad: 'rozet-96.png', boy: 96, zemin: null, oran: 0.9, svg: ROZET },
];
// `node araclar/simge-olustur.js rozet-96.png` yalnız adı verilenleri üretir
const SECILEN = process.argv.slice(2);

(async () => {
  const tarayici = await chromium.launch();
  const sayfa = await tarayici.newPage({ viewport: { width: 600, height: 600 }, deviceScaleFactor: 1 });
  await sayfa.route(() => true, (r) => r.abort());
  for (const s of SIMGELER.filter((x) => !SECILEN.length || SECILEN.includes(x.ad))) {
    const ic = Math.round(s.boy * s.oran);
    const veri = 'data:image/svg+xml;base64,' + Buffer.from(s.svg || SVG).toString('base64');
    await sayfa.setContent(`<!doctype html><html><body style="margin:0;background:transparent">
      <div id="s" style="width:${s.boy}px;height:${s.boy}px;display:grid;place-items:center;background:${s.zemin || 'transparent'}">
      <img src="${veri}" width="${ic}" height="${ic}" alt=""></div></body></html>`);
    await sayfa.evaluate(() => Promise.all([...document.images].map((i) => i.decode())));
    await sayfa.locator('#s').screenshot({ path: path.join(KOK, 'assets', 'logo', s.ad), omitBackground: !s.zemin });
    console.log('yazıldı: assets/logo/' + s.ad);
  }
  await tarayici.close();
})().catch((e) => { console.error(e); process.exit(1); });
