// Performans testleri (013, performans incelemesi): ?sahte=1 modunda, Chrome DevTools ağ/işlemci kısmasıyla.
// Kullanım: node testler/performans-testleri.js   (ya da hepsi için: node testler/calistir.js)
// Ölçülenler: LCP (Yavaş 4G ≤ 2,5 sn, Hızlı 3G ≤ 4 sn), CLS < 0,05 (yükleme + sponsor + aşağı kaydırma dahil), istek sayısı,
// modül derinliği (her statik içe aktarma modulepreload'da), YouTube'a dokunmadan önce SIFIR istek (i.ytimg.com dahil),
// yazı tipleri (≤ 3 dosya, ≤ 60 KB, Türkçe harflerin hepsi alt kümede: çizerek denenir), hero ≤ 60 KB ve srcset,
// mp4 preload="none", service worker test modunda kapalı, _headers'ta aynı başlık iki kuralda yok.
// Yerel sunucu metin dosyalarını gzip'le sıkıştırır (Cloudflare gibi); sahte Supabase istemcisi test dosyasıdır, yayına çıkmaz.
const http = require('http'), fs = require('fs'), path = require('path'), zlib = require('zlib');
const { ornekReklamGorseli, gorselTuru } = require('./tarayici-testleri');

const KOK = path.resolve(__dirname, '..');
const TUR = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json' };
const G1 = '22222222-0000-4000-8000-000000000001';
const G3 = '22222222-0000-4000-8000-000000000003';
const H1 = '33333333-0000-4000-8000-000000000001';
const M1 = '11111111-0000-4000-8000-000000000001';
// Lighthouse'un mobil profilleriyle aynı (DevTools "Slow 4G" / "Fast 3G" + 4× işlemci)
const PROFILLER = {
  'Yavaş 4G': { latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8, cpu: 4, lcp: 2500 },
  'Hızlı 3G': { latency: 562.5, downloadThroughput: (1.44 * 1024 * 1024) / 8, uploadThroughput: (675 * 1024) / 8, cpu: 4, lcp: 4000 },
};

/**
 * Yerel test sunucusu. ops.kok: sunulacak klasör (varsayılan depo; yayin/ çıktısı da olabilir).
 * ops.cf: Cloudflare Pages "güzel adres" taklidi: /x.html → 308 /x, /index.html → 308 /, /x → x.html (performans 2. tur §3).
 * s.kapat(true): bundan sonraki her bağlantı kesilir (çevrimdışı taklidi; service worker önbelleği denenir).
 */
function sunucuAc({ kok = KOK, cf = false } = {}) {
  return new Promise((ok) => {
    let kesik = false;
    const s = http.createServer((q, r) => {
      if (kesik) return q.socket.destroy();
      const [yolKismi, sorgu = ''] = q.url.split('#')[0].split('?');
      let yol = decodeURIComponent(yolKismi);
      if (cf) {
        if (/\.html$/.test(yol)) {
          const hedef = yol === '/index.html' || yol.endsWith('/index.html') ? yol.slice(0, -'index.html'.length) : yol.slice(0, -5);
          r.writeHead(308, { Location: hedef + (sorgu ? '?' + sorgu : ''), 'Cache-Control': 'no-store' });
          return r.end();
        }
        if (!path.extname(yol) && yol !== '/') yol += '.html';
      }
      if (yol === '/') yol = '/index.html';
      const dosya = path.join(kok, yol);
      if (!dosya.startsWith(kok + path.sep) || !fs.existsSync(dosya) || fs.statSync(dosya).isDirectory()) { r.writeHead(404); return r.end('yok'); }
      const tur = TUR[path.extname(dosya)] || 'application/octet-stream';
      let govde = fs.readFileSync(dosya);
      // Yayında Supabase istemcisi (assets/vendor, defer) modüllerle PARALEL iner. Testte onun yerine geçen sahte istemci
      // istemci.js'ten dinamik içe aktarılır (+2 gidiş-dönüş, yayında olmayan bir gecikme): yayındaki ağ şeklini taklit etmek
      // için yalnız bu test sunucusu sahte istemciyi ve bağımlılığını modulepreload ile önceden ister.
      if (/\.html$/.test(dosya) && /[?&]sahte=1/.test(q.url)) {
        govde = Buffer.from(govde.toString('utf8').replace('<script type="module"', '<link rel="modulepreload" href="testler/sahte-supabase.js">\n<link rel="modulepreload" href="assets/reklam/reklam-mantik.js">\n<script type="module"'));
      }
      const sikistir = /text|javascript|json|svg/.test(tur) && /gzip/.test(q.headers['accept-encoding'] || '');
      const veri = sikistir ? zlib.gzipSync(govde) : govde;
      r.writeHead(200, { 'Content-Type': tur, 'Cache-Control': 'no-store', ...(sikistir ? { 'Content-Encoding': 'gzip' } : {}), 'Content-Length': veri.length });
      r.end(veri);
    }).listen(0, '127.0.0.1', () => ok(s));
    s.kapat = (v) => { kesik = v; if (v && s.closeAllConnections) s.closeAllConnections(); };
  });
}

/** Basit Cloudflare _headers eşleştirici: "*" her şey (eğik çizgi dahil), ":ad" tek bölüm. */
function headersKurallari(metin) {
  const kurallar = [];
  let simdiki = null;
  for (const satir of metin.split('\n')) {
    if (!satir.trim() || satir.trim().startsWith('#')) continue;
    if (!/^\s/.test(satir)) { simdiki = { yol: satir.trim(), basliklar: [] }; kurallar.push(simdiki); continue; }
    const m = /^\s+([^:]+):\s*(.*)$/.exec(satir);
    if (m && simdiki) simdiki.basliklar.push(m[1].trim().toLowerCase());
  }
  return kurallar.map((k) => ({ ...k, re: new RegExp('^' + k.yol.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/:[a-z]+/gi, '[^/]+') + '$') }));
}

async function performansTestleri() {
  let chromium;
  try { ({ chromium } = require('playwright')); } catch (e) { return { gecen: [], kalan: ['Playwright bulunamadı (require("playwright"))'] }; }
  const gecen = [], kalan = [];
  const kontrol = (ad, ok, detay) => (ok ? gecen.push(ad) : kalan.push(detay !== undefined ? `${ad} -> ${String(detay).slice(0, 300)}` : ad));
  async function guvenli(ad, f) { try { await f(); } catch (e) { kalan.push(`${ad}: yarıda kaldı -> ${String(e.message || e).split('\n')[0]}`); } }
  const sunucu = await sunucuAc();
  const ADRES = 'http://127.0.0.1:' + sunucu.address().port;
  const tarayici = await chromium.launch();
  const hatalar = [];

  async function baglam(vp = { width: 390, height: 844 }, profil = null, dpr = 1) {
    const ctx = await tarayici.newContext({ viewport: vp, deviceScaleFactor: dpr, locale: 'tr-TR', timezoneId: 'Europe/Istanbul', hasTouch: true, isMobile: true });
    const istekler = [];
    // Dış adreslere çıkılmaz; YouTube/ytimg istekleri SAYILIR (engellenmeden önce kaydedilir)
    await ctx.route((url) => !url.href.startsWith(ADRES), (r) => { istekler.push(r.request().url()); return r.abort(); });
    // Sahte Supabase deposu (Narçil örnek reklam görselleri; yayında proje deposu: dış adres sayılmaz)
    await ctx.route(/^https:\/\/sahte\.supabase\.co\/storage\/v1\/object\/public\//, (r) => {
      const yol = decodeURIComponent(new URL(r.request().url()).pathname.replace('/storage/v1/object/public/', ''));
      const ornek = ornekReklamGorseli(yol);
      return ornek ? r.fulfill({ status: 200, contentType: gorselTuru(yol), headers: { 'Access-Control-Allow-Origin': '*' }, body: ornek }) : r.fulfill({ status: 404, body: 'yok' });
    });
    await ctx.addInitScript(() => {
      try { if (!sessionStorage.getItem('__kuruldu')) { sessionStorage.setItem('__kuruldu', '1'); } } catch (e) {}
      window.__cls = 0; window.__kaymalar = []; window.__lcp = 0; window.__lcpOge = '';
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) { window.__cls += e.value; window.__kaymalar.push({ v: Math.round(e.value * 1000) / 1000, t: Math.round(e.startTime), kaynak: (e.sources || []).map((s) => (s.node && (s.node.id || s.node.className || s.node.nodeName)) || '?').join(',') }); } }).observe({ type: 'layout-shift', buffered: true });
      new PerformanceObserver((l) => { const e = l.getEntries().pop(); if (e) { window.__lcp = e.startTime; window.__lcpOge = e.element ? (e.element.id || e.element.className || e.element.tagName) : (e.url || ''); } }).observe({ type: 'largest-contentful-paint', buffered: true });
    });
    const p = await ctx.newPage();
    p.setDefaultTimeout(20000);
    p.on('pageerror', (e) => hatalar.push(e.message));
    p.on('request', (r) => { if (r.url().startsWith(ADRES)) istekler.push(r.url()); });
    if (profil) {
      const cdp = await ctx.newCDPSession(p);
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: profil.latency, downloadThroughput: profil.downloadThroughput, uploadThroughput: profil.uploadThroughput });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: profil.cpu });
    }
    return { ctx, p, istekler };
  }
  const adres = (s) => { const [yol, parca = ''] = s.split('#'); return ADRES + '/' + yol + (yol.includes('?') ? '&' : '?') + 'sahte=1' + (parca ? '#' + parca : ''); };
  /** Sayfanın sonuna kadar adım adım kaydırır (tembel görseller, geç gelen kartlar) ve başa döner. */
  const kaydir = (p) => p.evaluate(async () => {
    document.documentElement.style.scrollBehavior = 'auto';
    for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight * 0.7) { window.scrollTo(0, y); await new Promise((c) => setTimeout(c, 120)); }
    window.scrollTo(0, 0);
    await new Promise((c) => setTimeout(c, 150));
  });

  const SAYFALAR = [
    ['index.html', '#akis[data-sponsor-durum="tamam"]'],
    ['goller.html', '#arsiv[data-durum="tamam"]'],
    [`gol.html?id=${G1}`, '#gol[data-durum="tamam"]'],
    ['takim.html', '#kadro-icerik[data-durum="tamam"]'],
    [`haber.html?id=${H1}`, '#haber[data-durum="tamam"]'],
    ['profil.html', '#profil[data-durum="tamam"]'],
    ['oyuncu.html?id=55555555-0000-4000-8000-000000000007', '#oyuncu[data-durum="tamam"]'], // 018
  ];

  // ------------------------------------------------------------------ LCP ve CLS (kısmalı)
  const olcumler = [];
  for (const [profilAdi, profil] of Object.entries(PROFILLER)) {
    const sayfalar = profilAdi === 'Yavaş 4G' ? SAYFALAR : SAYFALAR.slice(0, 2);
    for (const [url, bekle] of sayfalar) {
      const ad = `${url.split('?')[0]} (${profilAdi})`;
      await guvenli(ad, async () => {
        const { ctx, p } = await baglam({ width: 390, height: 844 }, profil);
        await p.goto(adres(url), { waitUntil: 'load' });
        await p.waitForSelector(bekle, { state: 'attached' });
        await p.waitForTimeout(600);
        const lcp = await p.evaluate(() => ({ t: Math.round(window.__lcp), oge: window.__lcpOge }));
        await kaydir(p);
        await p.waitForTimeout(400);
        const cls = await p.evaluate(() => ({ cls: Math.round(window.__cls * 1000) / 1000, kaymalar: window.__kaymalar }));
        olcumler.push(`${ad}: LCP ${lcp.t} ms (${lcp.oge}), CLS ${cls.cls}`);
        kontrol(`${ad}: LCP ≤ ${profil.lcp / 1000} sn`, lcp.t > 0 && lcp.t <= profil.lcp, `${lcp.t} ms (${lcp.oge})`);
        kontrol(`${ad}: CLS < 0,05 (yükleme, sponsor kartı ve sonuna kadar kaydırma dahil)`, cls.cls < 0.05, JSON.stringify(cls));
        if (url === 'index.html') kontrol(`${ad}: LCP öğesi hero görseli ya da başlığı (statik HTML'de, öncelikli)`, /hero/.test(lcp.oge), lcp.oge);
        await ctx.close();
      });
    }
  }

  // ------------------------------------------------------------------ 2. tur: DPR 3 telefon (etkin DPR ≤ 2: -1600 kopya inmez)
  for (const [url, bekle] of SAYFALAR.slice(0, 5)) {
    const profil = PROFILLER['Yavaş 4G'];
    const ad = `${url.split('?')[0]} (Yavaş 4G, 360×780 DPR 3)`;
    await guvenli(ad, async () => {
      const { ctx, p } = await baglam({ width: 360, height: 780 }, profil, 3);
      await p.goto(adres(url), { waitUntil: 'load' });
      await p.waitForSelector(bekle, { state: 'attached' });
      await p.waitForTimeout(600);
      const lcp = await p.evaluate(() => ({ t: Math.round(window.__lcp), oge: window.__lcpOge }));
      const buyuk = await p.evaluate(() => performance.getEntriesByType('resource').map((r) => r.name).filter((u) => /-1600\.webp$/.test(u)).map((u) => u.split('/').pop()));
      await kaydir(p);
      await p.waitForTimeout(300);
      const cls = await p.evaluate(() => Math.round(window.__cls * 1000) / 1000);
      olcumler.push(`${ad}: LCP ${lcp.t} ms (${lcp.oge}), CLS ${cls}`);
      kontrol(`${ad}: LCP ≤ 2,5 sn`, lcp.t > 0 && lcp.t <= profil.lcp, `${lcp.t} ms (${lcp.oge})`);
      kontrol(`${ad}: CLS < 0,05`, cls < 0.05, cls);
      kontrol(`${ad}: hiçbir içerik görseli -1600 kopyası inmedi (sizes etkin DPR ≤ 2)`, !buyuk.length, buyuk.join(' '));
      await ctx.close();
    });
  }

  // ------------------------------------------------------------------ istekler, modül derinliği, YouTube
  await guvenli('istekler', async () => {
    const { ctx, p, istekler } = await baglam();
    for (const [url, bekle, butce] of [['index.html', '#akis[data-sponsor-durum="tamam"]', 40], ['goller.html', '#arsiv[data-durum="tamam"]', 36], [`gol.html?id=${G1}`, '#gol[data-durum="tamam"]', 36], ['takim.html', '#kadro-icerik[data-durum="tamam"]', 30], [`mac.html?id=${M1}`, '#mac[data-durum="tamam"]', 36]]) {
      const ad = url.split('?')[0];
      istekler.length = 0;
      await p.goto(adres(url), { waitUntil: 'load' });
      await p.waitForSelector(bekle, { state: 'attached' });
      await p.waitForLoadState('networkidle');
      const d = await p.evaluate(() => {
        const on = new Set([...document.querySelectorAll('link[rel=modulepreload]')].map((l) => new URL(l.href).pathname));
        const giris = [...document.querySelectorAll('script[type=module]')].map((s) => new URL(s.src).pathname);
        const moduller = performance.getEntriesByType('resource').filter((r) => /\.js$/.test(new URL(r.name).pathname) && r.initiatorType !== 'script').map((r) => ({ yol: new URL(r.name).pathname, bas: Math.round(r.startTime) }));
        return { on: [...on], giris, moduller };
      });
      const yerel = istekler.filter((u) => u.startsWith(ADRES));
      const dis = istekler.filter((u) => !u.startsWith(ADRES));
      kontrol(`${ad}: istek sayısı ≤ ${butce} (sahte istemci dahil)`, yerel.length <= butce, `${yerel.length}: ${yerel.map((u) => u.replace(ADRES, '')).join(' ')}`);
      kontrol(`${ad}: YouTube / i.ytimg.com / dış adrese istek yok (dokunmadan önce)`, !dis.length, dis.join(' '));
      // Statik içe aktarılan her modül modulepreload'da: zincir derinliği en çok 2 (HTML → hepsi paralel)
      const dinamik = /\/(testler\/sahte-supabase|assets\/yorumlar|assets\/reklam\/reklam|assets\/reklam\/reklam-mantik)\.js$/;
      const eksik = d.moduller.filter((m) => !dinamik.test(m.yol) && !d.on.includes(m.yol) && !d.giris.includes(m.yol)).map((m) => m.yol);
      kontrol(`${ad}: açılışta yüklenen her modül modulepreload'da (derinlik ≤ 2)`, d.on.length >= 3 && !eksik.length, eksik.join(' '));
    }
    await ctx.close();
  });

  // ------------------------------------------------------------------ video: facade, mp4 preload
  await guvenli('video', async () => {
    const { ctx, p, istekler } = await baglam();
    istekler.length = 0;
    await p.goto(adres(`gol.html?id=${G1}`));
    await p.waitForSelector('#gol[data-durum="tamam"] .video-baslat');
    await p.waitForLoadState('networkidle');
    kontrol('gol (YouTube): dokunmadan önce youtube / ytimg isteği SIFIR, iframe yok', !istekler.some((u) => /youtube|ytimg|googlevideo/.test(u)) && !(await p.$('iframe')));
    const kapak = await p.$eval('.video-baslat img', (i) => i.currentSrc || i.src).catch(() => '');
    kontrol('gol: kapak kendi görselimiz (assets/img ya da depo), i.ytimg.com değil', /\/assets\/img\/|supabase/.test(kapak) && !/ytimg/.test(kapak), kapak);
    await p.click('.video-baslat');
    await p.waitForSelector('iframe');
    kontrol('gol: dokununca yalnız youtube-nocookie.com yerleştirmesi istenir', istekler.some((u) => /^https:\/\/www\.youtube-nocookie\.com\/embed\//.test(u)) && !istekler.some((u) => /ytimg|doubleclick|google-analytics/.test(u)), istekler.filter((u) => !u.startsWith(ADRES)).join(' '));
    istekler.length = 0;
    await p.goto(adres(`gol.html?id=${G3}`));
    await p.waitForSelector('#gol[data-durum="tamam"] .video-baslat');
    await p.waitForLoadState('networkidle');
    kontrol('gol (mp4): dokunmadan önce video dosyası istenmez, <video> yok', !istekler.some((u) => /\.mp4/.test(u)) && !(await p.$('video')));
    await p.click('.video-baslat');
    await p.waitForSelector('video');
    const v = await p.$eval('video', (x) => ({ preload: x.getAttribute('preload'), odak: document.activeElement === x, kontrol: x.controls }));
    kontrol('gol (mp4): dokununca <video preload="none" controls>, odak videoda', v.preload === 'none' && v.odak && v.kontrol, JSON.stringify(v));
    await ctx.close();
  });

  // ------------------------------------------------------------------ yazı tipleri
  await guvenli('yazı tipleri', async () => {
    const dosyalar = fs.readdirSync(path.join(KOK, 'assets', 'fonts')).filter((f) => /\.woff2$/.test(f));
    const toplam = dosyalar.reduce((t, f) => t + fs.statSync(path.join(KOK, 'assets', 'fonts', f)).size, 0);
    kontrol('yazı tipleri: en çok 3 woff2 dosyası, toplam ≤ 60 KB', dosyalar.length <= 3 && toplam <= 60 * 1024, `${dosyalar.length} dosya, ${(toplam / 1024).toFixed(1)} KB`);
    const css = fs.readFileSync(path.join(KOK, 'assets', 'stil.css'), 'utf8');
    kontrol('yazı tipleri: font-display: optional (geç gelen yazı tipi kayma yapmaz) ve boyut ayarlı yedek yüzler', (css.match(/font-display: optional;/g) || []).length === 3 && /size-adjust/.test(css) && /ascent-override/.test(css));
    const { ctx, p, istekler } = await baglam();
    await p.goto(adres('index.html'));
    await p.waitForSelector('#akis[data-durum="tamam"]');
    await p.waitForLoadState('networkidle');
    const fontIstek = istekler.filter((u) => /\.woff2/.test(u));
    kontrol('yazı tipleri: sayfa en çok 3 yazı tipi dosyası ister', new Set(fontIstek).size <= 3 && new Set(fontIstek).size >= 2, fontIstek.join(' '));
    // Çizerek: her Türkçe harf alt kümede mi? Her dosya FontFace ile ayrı bir aile adıyla yüklenir (font-display: optional
    // sayfada geç gelen yüzü hiç kullanmayabilir; burada dosyanın kendisi denenir). Eksik harf yedeğe düşer: iki farklı
    // yedekle (monospace / serif) genişlik değişir. Ayrıca "Ğ" ile "G" farklı genişlikte değilse bile farklı çizilmeli.
    const sonuc = await p.evaluate(async (dosyalar) => {
      const harfler = 'ÇçĞğİıÖöŞşÜüÂâÎîÛû';
      const c = document.createElement('canvas').getContext('2d');
      const out = [];
      for (const [i, dosya] of dosyalar.entries()) {
        const aile = 'Deneme' + i;
        const yuz = new FontFace(aile, `url(assets/fonts/${dosya})`);
        let yuklendi = true;
        try { await yuz.load(); document.fonts.add(yuz); } catch (e) { yuklendi = false; }
        const eksik = [];
        for (const harf of harfler) {
          c.font = `40px ${aile}, monospace`; const a = c.measureText(harf).width;
          c.font = `40px ${aile}, serif`; const b = c.measureText(harf).width;
          if (Math.abs(a - b) > 0.01) eksik.push(harf);
        }
        out.push({ aile: dosya, yuklendi, eksik: eksik.join('') });
      }
      return out;
    }, fs.readdirSync(path.join(KOK, 'assets', 'fonts')).filter((f) => /\.woff2$/.test(f)));
    for (const s of sonuc) kontrol(`yazı tipi ${s.aile}: Türkçe harflerin hepsi (Ç Ğ İ ı Ö Ş Ü, şapkalılar) alt kümede (çizerek)`, s.yuklendi && !s.eksik, JSON.stringify(s));
    await ctx.close();
  });

  // ------------------------------------------------------------------ hero, service worker, _headers
  await guvenli('hero ve önbellek', async () => {
    const img = path.join(KOK, 'assets', 'img');
    // 016: varsayılan hero özgün tribün çizimi (tek vektör dosya: her ekran boyunda aynı, srcset gerekmez)
    const heroBayt = fs.statSync(path.join(img, 'tribun-kirmizi-siyah.svg')).size;
    kontrol('hero (016): tribün SVG ≤ 60 KB', heroBayt <= 60 * 1024, heroBayt + ' B');
    const { ctx, p, istekler } = await baglam();
    await p.goto(adres('index.html'));
    await p.waitForSelector('#akis[data-durum="tamam"]');
    const h = await p.$eval('#hero-gorsel', (i) => ({ cur: i.currentSrc, w: i.getAttribute('width'), hh: i.getAttribute('height'), oncelik: i.getAttribute('fetchpriority') }));
    kontrol('hero (016): tribün çizimi, width/height ve fetchpriority=high', /tribun-kirmizi-siyah\.svg$/.test(h.cur) && h.w && h.hh && h.oncelik === 'high', JSON.stringify(h));
    kontrol('hero (016): tek hero görseli indirildi', istekler.filter((u) => /tribun-kirmizi-siyah\.svg/.test(u)).length === 1, istekler.filter((u) => /\/img\//.test(u)).join(' '));
    const sw = await p.evaluate(async () => ('serviceWorker' in navigator ? (await navigator.serviceWorker.getRegistrations()).length : 0));
    kontrol('service worker test modunda (localhost / ?sahte=1) kayıtlı değil', sw === 0, sw);
    await ctx.close();
    const kurallar = headersKurallari(fs.readFileSync(path.join(KOK, '_headers'), 'utf8'));
    const ornekler = ['/index.html', '/assets/stil.css', '/assets/ortak.js', '/assets/sayfa/ana.js', '/assets/reklam/reklam.js', '/assets/fonts/oswald-700-tr.woff2', '/assets/img/corum-ulu-camii-480.webp', '/assets/logo/amblem-yedek.svg', '/assets/vendor/supabase-js-2.45.4/supabase.js', '/sw.js'];
    const cakisma = [];
    for (const yol of ornekler) {
      const uyan = kurallar.filter((k) => k.re.test(yol));
      const sayac = {};
      for (const k of uyan) for (const b of k.basliklar) sayac[b] = (sayac[b] || 0) + 1;
      for (const [b, n] of Object.entries(sayac)) if (n > 1) cakisma.push(`${yol}: ${b} ×${n}`);
    }
    kontrol('_headers: hiçbir yola aynı başlık iki kuraldan gelmiyor (Cloudflare virgülle birleştirir)', !cakisma.length, cakisma.join(' | '));
    const cc = (yol) => kurallar.filter((k) => k.re.test(yol) && k.basliklar.includes('cache-control')).map((k) => k.yol);
    kontrol('_headers: yazı tipi/görsel/vendor uzun süreli, kod 5 dk, sw.js no-cache', cc('/assets/fonts/x.woff2').length === 1 && cc('/assets/stil.css').join() === '/assets/:dosya' && cc('/sw.js').join() === '/sw.js' && cc('/index.html').length === 0);
  });

  // ------------------------------------------------------------------ 2. tur: service worker Cloudflare'in 308 yönlendirmeleri arkasında
  // Cloudflare Pages /x.html'i /x'e 308 ile yönlendirir; önbelleğe yönlendirilmiş yanıt girerse çevrimdışı hiçbir sayfa açılmıyordu.
  // Hem yayin/ çıktısı (uzantısız bağlantılar, içerik özetli sürüm) hem depo (geliştirme sürümü) bu sunucuyla denenir.
  const { hazirla } = require('../araclar/yayin-hazirla.js');
  const os = require('os');
  const yayinKok = fs.mkdtempSync(path.join(os.tmpdir(), 'yayin-sw-'));
  hazirla({ kok: KOK, hedef: yayinKok, taslak: true });
  for (const [etiket, kok] of [['yayin/ çıktısı', yayinKok], ['depo (geliştirme sürümü)', KOK]]) {
    await guvenli(`service worker ${etiket}`, async () => {
      const cf = await sunucuAc({ kok, cf: true });
      const A = 'http://127.0.0.1:' + cf.address().port;
      const ctx = await tarayici.newContext({ viewport: { width: 390, height: 844 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
      await ctx.route((u) => !u.href.startsWith(A), (r) => r.abort());
      const p = await ctx.newPage();
      p.setDefaultTimeout(15000);
      const yon = [];
      p.on('response', (r) => { if (r.status() === 308) yon.push(new URL(r.url()).pathname); });
      // ayar.js yer tutucu: sayfa "yapılandırılmadı" uyarısı verir ama kabuğu tam (SW için yeterli). localhost'ta swKaydet kaydetmez: elle
      await p.goto(A + '/index.html');
      const sw = await p.evaluate(async () => { const k = await navigator.serviceWorker.register('sw.js'); await navigator.serviceWorker.ready; return !!k.active; });
      await p.reload();
      await p.waitForFunction(() => !!navigator.serviceWorker.controller);
      if (etiket.startsWith('yayin')) {
        const html = await p.content();
        kontrol(`SW ${etiket}: yayında iç bağlantılar uzantısız (Cloudflare'de 308 gidiş-dönüşü yok)`, /href="goller"/.test(html) && !/href="goller\.html"/.test(html), (html.match(/href="[a-z]+(\.html)?"/g) || []).slice(0, 6).join(' '));
        const surum = await p.evaluate(async () => (await caches.keys()).filter((k) => k.startsWith('kabuk-')));
        kontrol(`SW ${etiket}: kabuk önbelleği içerik özetli sürüm (kabuk-y-…)`, surum.length === 1 && /^kabuk-y-[0-9a-f]{12}$/.test(surum[0]), surum.join(','));
      }
      const anahtarlar = await p.evaluate(async () => { const out = []; for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) out.push(new URL(r.url).pathname); return out; });
      kontrol(`SW ${etiket}: kök (/) ve sayfalar uzantısız anahtarla önbellekte`, ['/', '/goller', '/takim', '/haber', '/cevrimdisi'].every((y) => anahtarlar.includes(y)), anahtarlar.filter((y) => !y.startsWith('/assets')).join(' '));
      cf.kapat(true); // ağ yok
      const sonuc = [];
      for (const u of ['/', '/index.html', '/goller.html', '/goller', '/takim.html', `/haber.html?id=${H1}`, '/kurallar']) {
        let d;
        try {
          await p.goto(A + u, { waitUntil: 'load' });
          d = await p.evaluate(() => ({ baslik: document.title, serit: !!document.querySelector('.resmi-degil'), stil: getComputedStyle(document.body).backgroundColor !== 'rgba(0, 0, 0, 0)' }));
        } catch (e) { d = { hata: String(e.message || e).split('\n')[0] }; }
        sonuc.push([u, d]);
      }
      kontrol(`SW ${etiket}: Cloudflare 308 arkasında çevrimdışı her sayfa açılır (/, .html'li ve uzantısız adres, sorgulu haber), stil de önbellekten`, sw && sonuc.every(([, d]) => d.serit && d.stil && / · Çorumspor Taraftar$/.test(d.baslik) && !/İnternet yok/.test(d.baslik)), JSON.stringify(sonuc));
      let yedek;
      try { await p.goto(A + '/olmayan-sayfa', { waitUntil: 'load' }); yedek = await p.title(); } catch (e) { yedek = 'HATA ' + e.message.split('\n')[0]; }
      const cevrimdisiBaslik = (/<title>([^<]+)<\/title>/.exec(fs.readFileSync(path.join(KOK, 'cevrimdisi.html'), 'utf8')) || [])[1];
      kontrol(`SW ${etiket}: açılmamış sayfa çevrimdışı yedeğine (cevrimdisi.html) düşer`, yedek === cevrimdisiBaslik, `${yedek} / ${cevrimdisiBaslik}`);
      void yon;
      await ctx.close();
      cf.kapat(false);
      cf.close();
    });
  }
  // Son tur (performans 3. tur 6): güncellemede açık eski sekme karışık sürüm görmez. Yeni dağıtım (yeni SURUM, değişmiş ortak.js)
  // etkinleşince eski sekmenin sonradan istediği dosya ÖNCEKİ kabuktan gelir; yeni gezinme yeni sürümü alır; en çok 2 kabuk kalır.
  await guvenli('service worker güncelleme (karışık sürüm yok)', async () => {
    const cf = await sunucuAc({ kok: yayinKok, cf: true });
    const A = 'http://127.0.0.1:' + cf.address().port;
    const ctx = await tarayici.newContext({ viewport: { width: 390, height: 844 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    await ctx.route((u) => !u.href.startsWith(A), (r) => r.abort());
    const p = await ctx.newPage();
    p.setDefaultTimeout(20000);
    await p.goto(A + '/');
    await p.evaluate(async () => { await navigator.serviceWorker.register('sw.js'); await navigator.serviceWorker.ready; });
    await p.reload();
    await p.waitForFunction(() => !!navigator.serviceWorker.controller);
    const swYol = path.join(yayinKok, 'sw.js'), ortakYol = path.join(yayinKok, 'assets', 'ortak.js');
    const eskiSurum = (/const SURUM = '([^']+)';/.exec(fs.readFileSync(swYol, 'utf8')) || [])[1];
    fs.writeFileSync(ortakYol, fs.readFileSync(ortakYol, 'utf8') + '\n// yeni-surum-isareti\n');
    fs.writeFileSync(swYol, fs.readFileSync(swYol, 'utf8').replace(`const SURUM = '${eskiSurum}';`, "const SURUM = 'y-ikincisurum0';"));
    const degisti = await p.evaluate(() => new Promise((tamam) => {
      navigator.serviceWorker.addEventListener('controllerchange', () => tamam(true), { once: true });
      navigator.serviceWorker.getRegistration().then((k) => k.update());
      setTimeout(() => tamam(false), 15000);
    }));
    // 019: eski sekmede kısa, görünür "Yeni sürüm hazır" + "Yenile" (otomatik yeniden yükleme yok; duyuru #durum'dan)
    const not = await p.waitForSelector('#surum-notu', { timeout: 5000 }).then(() => p.evaluate(() => ({
      metin: document.querySelector('#surum-notu p').textContent, dugme: document.querySelector('#surum-yenile').textContent,
      gorunur: document.querySelector('#surum-notu').getBoundingClientRect().height > 0, durum: document.querySelector('#durum').textContent, adres: location.href,
    }))).catch(() => null);
    kontrol('SW güncelleme (019): yeni sürüm etkinleşince açık sekmede görünür "Yeni sürüm hazır" + "Yenile"; sayfa kendiliğinden yenilenmez, #durum duyurur',
      !!not && not.metin === 'Yeni sürüm hazır' && not.dugme === 'Yenile' && not.gorunur && /yeni sürümü hazır/.test(not.durum) && not.adres === A + '/', JSON.stringify(not));
    const eskiSekme = await p.evaluate(async () => (await (await fetch('assets/ortak.js')).text()).includes('yeni-surum-isareti'));
    const p2 = await ctx.newPage();
    await p2.goto(A + '/goller');
    const yeniSekme = await p2.evaluate(async () => (await (await fetch('assets/ortak.js')).text()).includes('yeni-surum-isareti'));
    const kabuklar = await p2.evaluate(async () => (await caches.keys()).filter((k) => k.startsWith('kabuk-')).sort());
    kontrol('SW güncelleme (son tur): yeni sürüm etkinleşince açık eski sekme dosyaları ÖNCEKİ kabuktan alır (karışık sürüm yok), yeni sekme yeni sürümü; en çok 2 kabuk',
      degisti && !eskiSekme && yeniSekme && kabuklar.length === 2 && kabuklar.includes('kabuk-y-ikincisurum0') && kabuklar.includes('kabuk-' + eskiSurum), JSON.stringify({ degisti, eskiSekme, yeniSekme, kabuklar }));
    await ctx.close();
    cf.kapat(false);
    cf.close();
  });
  fs.rmSync(yayinKok, { recursive: true, force: true });

  kontrol('performans testlerinde JavaScript hatası yok', !hatalar.length, [...new Set(hatalar)].join(' | '));
  await tarayici.close();
  sunucu.close();
  return { gecen, kalan, olcumler };
}

module.exports = { performansTestleri };

if (require.main === module) {
  performansTestleri().then((s) => {
    console.log(s.olcumler.join('\n'));
    console.log(JSON.stringify(s.kalan, null, 2));
    console.log(`Performans: ${s.gecen.length} geçti, ${s.kalan.length} kaldı`);
    process.exit(s.kalan.length ? 1 : 0);
  }).catch((e) => { console.error(e); process.exit(1); });
}
