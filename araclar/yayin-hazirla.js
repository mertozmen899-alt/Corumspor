// Yayına çıkacak dosyaları hazırlar: yalnız sitenin herkese açık dosyaları yayin/ klasörüne kopyalanır.
// Cloudflare Pages: Build command  node araclar/yayin-hazirla.js   ·   Build output directory  yayin   (README 5. bölüm)
// Kopyalanan: kökteki *.html sayfaları, assets/ (tamamı), _headers, robots.txt, .nojekyll, sw.js, manifest.webmanifest (ve varsa favicon).
// Kopyalanmayan: testler/, supabase/, docs/, araclar/, node_modules/, .git, README/AGENTS ve diğer her şey.
// Bunlardan biri (ya da sembolik bağ) listeye girerse komut DURUR ve çıkış kodu 1 olur: yayın yapılmaz.
//
// YALNIZ yayin/ kopyasında yapılanlar (depodaki dosyalar değişmez; yerelde python -m http.server ile olduğu gibi çalışır):
//  1. ayar.js'te yer tutucu (PROJE-KODUNUZ, ANON-ANAHTARINIZ, iletisim@ornek.com) kaldıysa DURUR (çıkış 1): çalışmayan site ve sahte
//     künye yayına çıkmasın. Bilerek taslak yayın için: YAYIN_TASLAK=1 (testler bunu kullanır).
//  2. Gerçek SUPABASE_URL varsa sayfalara <link rel="preconnect"> eklenir (kaynak HTML'de yok, tek ayar kuralı).
//  3. CSP: her sayfadaki <meta http-equiv="Content-Security-Policy"> çıkarılır, _headers'ın /* kuralına başlık olarak yazılır
//     (meta CSP Chrome'un önden yükleme tarayıcısını bekletir) ve *.supabase.co yerine projenin TAM adresi konur.
//  4. İç bağlantılar uzantısız olur (goller.html → goller, index.html → ./): Cloudflare Pages .html adreslerini 308 ile
//     yönlendirir; her tıklamada fazladan bir gidiş-dönüş ödenmesin. HTML'ler ve assets/**/*.js, sw.js.
//  5. sw.js: SURUM = yayın içeriğinin özeti (her dağıtım yeni kabuk önbelleği), DOSYALAR = yayındaki bütün kabuk dosyaları.
// İsteğe bağlı: SITE_ADRESI=https://alan-adiniz (Cloudflare Pages → Settings → Environment variables) verilirse
// sayfalardaki og:image tam adrese çevrilir ve og:url eklenir (paylaşım önizlemeleri tam adres ister).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const KOK_DOSYALARI = ['_headers', 'robots.txt', '.nojekyll', 'favicon.ico', 'favicon.svg', 'sw.js', 'manifest.webmanifest'];
const KLASORLER = ['assets'];
const YASAK = ['testler', 'supabase', 'docs', 'araclar', 'node_modules', 'yayin', '.git'];
const YER_TUTUCULAR = [/PROJE-KODUNUZ/, /ANON-ANAHTARINIZ/, /iletisim@ornek\.com/];

/** Göreli yol yasaklı bir klasörde mi (en üstte ya da herhangi bir düzeyde node_modules/.git)? */
function yasakli(yol) {
  const parca = yol.split('/');
  return YASAK.includes(parca[0]) || parca.some((p) => p === 'node_modules' || p === '.git');
}

/** Klasördeki dosyalar (göreli, "/" ile). Sembolik bağ görülürse durur: bağ yayına geliştirici dosyası sokabilir. */
function dosyalar(kok, alt) {
  const sonuc = [];
  for (const d of fs.readdirSync(path.join(kok, alt), { withFileTypes: true })) {
    const yol = alt + '/' + d.name;
    if (d.isSymbolicLink()) throw new Error(`Sembolik bağ yayına girmemeli: ${yol}`);
    if (d.name === '.DS_Store' || d.name === 'Thumbs.db') continue;
    if (d.isDirectory()) sonuc.push(...dosyalar(kok, yol));
    else if (d.isFile()) sonuc.push(yol);
  }
  return sonuc;
}

/** Yayına girecek dosyaların listesi (göreli yollar). */
function yayinListesi(kok) {
  const sayfalar = fs.readdirSync(kok).filter((d) => d.endsWith('.html') && fs.lstatSync(path.join(kok, d)).isFile());
  const kokteki = KOK_DOSYALARI.filter((d) => fs.existsSync(path.join(kok, d)));
  return [...sayfalar.sort(), ...kokteki, ...KLASORLER.filter((k) => fs.existsSync(path.join(kok, k))).flatMap((k) => dosyalar(kok, k))];
}

/** Sayfanın yayındaki adresi: index.html → ./ , goller.html → goller */
const guzelAdres = (sayfa) => (sayfa === 'index.html' ? './' : sayfa.replace(/\.html$/, ''));

/** Paylaşım için og:image'ı tam adrese çevirir, og:url ekler. */
function ogTamAdres(html, siteAdresi, sayfa) {
  const kok = siteAdresi.replace(/\/+$/, '');
  const adres = sayfa === 'index.html' ? kok + '/' : `${kok}/${guzelAdres(sayfa)}`;
  let s = html.replace(/(<meta property="og:image" content=")(?!https?:)([^"]+)(">)/, (m, a, yol, b) => a + kok + '/' + yol.replace(/^\/+/, '') + b);
  if (!/property="og:url"/.test(s)) s = s.replace(/(<meta property="og:image" content="[^"]*">\n?)/, (m) => m + (m.endsWith('\n') ? '' : '\n') + `<meta property="og:url" content="${adres}">\n`);
  return s;
}

const gecerliSupabase = (u) => /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(String(u || ''));

/**
 * Supabase kökenine önceden bağlan (performans: modüller çalışmadan bağlantı açılsın). Adres TEK ayar dosyasından
 * (assets/ayar.js) okunur; yer tutucu ya da https olmayan adreste dokunulmaz. REST/RPC ve kapak görselleri CORS ister
 * (crossorigin), reklam görselleri crossorigin'siz ikinci bağlantı havuzunu kullanır.
 */
function onBaglanti(html, supabaseUrl) {
  if (!gecerliSupabase(supabaseUrl) || /preconnect/.test(html)) return html;
  return html.replace(/(<meta charset="utf-8">\n)/, `$1<link rel="preconnect" href="${supabaseUrl}" crossorigin>\n<link rel="preconnect" href="${supabaseUrl}">\n`);
}

function ayarMetni(kok) {
  try { return fs.readFileSync(path.join(kok, 'assets', 'ayar.js'), 'utf8'); } catch (e) { return ''; }
}
function ayardanSupabase(kok) {
  return (/export const SUPABASE_URL = '([^']+)'/.exec(ayarMetni(kok)) || [])[1] || null;
}
/** ayar.js'te kalan yer tutucular (boşsa yayına hazır). */
function yerTutucular(kok) {
  const m = ayarMetni(kok);
  return YER_TUTUCULAR.filter((re) => re.test(m)).map((re) => re.source.replace(/\\/g, ''));
}

const META_CSP = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">\n?/;

/** CSP metnini projenin tam Supabase adresine daraltır (yoksa olduğu gibi). */
// media-src da daraltılır (denetçi 3. tur 5): gol videoları yalnız projenin kendi deposundan (.mp4, gol-videolari kovası; 014) ya da
// sitenin kendisinden gelir; "her https adresi" gerekmez. YouTube yalnız frame-src'de (iframe), medya kaynağı değildir.
function cspDaralt(csp, supabaseUrl) {
  if (!gecerliSupabase(supabaseUrl)) return csp;
  const host = new URL(supabaseUrl).host;
  return csp.replace(/https:\/\/\*\.supabase\.co/g, 'https://' + host).replace(/wss:\/\/\*\.supabase\.co/g, 'wss://' + host)
    .replace(/(^|;\s*)media-src [^;]*/, (m, bas) => `${bas}media-src 'self' https://${host} blob:`);
}

/** _headers'taki /* kuralının CSP satırını tam CSP ile değiştirir (frame-ancestors meta'da çalışmaz: eklenir). */
function headersCsp(metin, csp) {
  const tam = /frame-ancestors/.test(csp) ? csp : csp + "; frame-ancestors 'none'";
  const re = /^(\/\*\n(?:[ \t]+.*\n)*?[ \t]+Content-Security-Policy:).*$/m;
  if (!re.test(metin)) throw new Error('_headers: /* kuralında Content-Security-Policy satırı yok');
  return metin.replace(re, (m, bas) => `${bas} ${tam}`);
}

/** İç sayfa bağlantılarını uzantısız yapar (yalnız tanınan sayfa adları; dış adreslere ve düzenli ifadelere dokunmaz). */
function uzantisizBaglantilar(metin, sayfalar, tur) {
  const adlar = sayfalar.map((s) => s.replace(/\.html$/, '')).filter((a) => /^[a-z]+$/.test(a));
  if (!adlar.length) return metin;
  const grup = `(${adlar.join('|')})\\.html`;
  const cevir = (ad) => (ad === 'index' ? './' : ad);
  if (tur === 'html') {
    return metin
      .replace(new RegExp(`(\\shref=")${grup}(?=["?#])`, 'g'), (m, a, ad) => a + cevir(ad))
      .replace(new RegExp(`(content="\\d+;\\s*url=)${grup}`, 'g'), (m, a, ad) => a + cevir(ad));
  }
  // JS: yalnız dize başındaki sayfa adı ('goller.html…, "goller.html…, `goller.html…)
  return metin.replace(new RegExp(`(['"\`])${grup}(?=['"\`?#])`, 'g'), (m, a, ad) => a + cevir(ad));
}

/** sw.js: SURUM ← içerik özeti, DOSYALAR ← yayındaki kabuk dosyaları. */
function swHazirla(sw, surum, kabuk) {
  if (!/const SURUM = '[^']*';/.test(sw) || !/const DOSYALAR = \[[\s\S]*?\];/.test(sw)) throw new Error('sw.js: SURUM ya da DOSYALAR satırı bulunamadı');
  return sw.replace(/const SURUM = '[^']*';/, `const SURUM = '${surum}';`)
    .replace(/const DOSYALAR = \[[\s\S]*?\];/, () => `const DOSYALAR = ${JSON.stringify(kabuk)};`);
}

/** Service worker'ın kurulumda indireceği kabuk: kod, stil, yazı tipleri, supabase-js, işaret (yönetim ve görseller hariç). */
function kabukDosyalari(liste) {
  return liste.filter((y) => (/^assets\/.*\.(js|css|woff2)$/.test(y) || /^assets\/logo\/(amblem-yedek\.svg|simge-192\.png)$/.test(y) || y === 'manifest.webmanifest')
    && !/(^|\/)yonetim[^/]*$/.test(y) && !/\/(gorsel-kucult\.js|reklam\.css)$/.test(y)).sort();
}

/**
 * @param {{kok?: string, hedef?: string, ekstra?: string[], siteAdresi?: string|null, taslak?: boolean}} ops
 * @returns {string[]} kopyalanan göreli yollar
 */
function hazirla({ kok = path.resolve(__dirname, '..'), hedef = path.join(kok, 'yayin'), ekstra = [], siteAdresi = null, taslak = process.env.YAYIN_TASLAK === '1' } = {}) {
  kok = path.resolve(kok);
  hedef = path.resolve(hedef);
  if (hedef === kok || kok.startsWith(hedef + path.sep) || path.relative(kok, hedef).split(path.sep)[0] in { assets: 1 }) {
    throw new Error('Yayın hedefi proje klasörünün kendisi, üstü ya da assets/ olamaz: ' + hedef);
  }
  if (siteAdresi != null && !/^https:\/\/[a-z0-9.-]+(:\d+)?\/?$/i.test(siteAdresi)) {
    throw new Error('SITE_ADRESI https://alan-adi biçiminde olmalı: ' + siteAdresi);
  }
  const eksikAyar = yerTutucular(kok);
  if (eksikAyar.length && !taslak) {
    throw new Error(`assets/ayar.js hâlâ yer tutucu içeriyor (${eksikAyar.join(', ')}): gerçek Supabase adresi, anon anahtar ve iletişim e-postasını yazın. `
      + 'Bilerek taslak yayın için YAYIN_TASLAK=1.');
  }
  const liste = [...yayinListesi(kok), ...ekstra.map((e) => e.replace(/\\/g, '/').replace(/^\.\//, ''))];
  const kotu = liste.filter(yasakli);
  if (kotu.length) throw new Error('Bu dosyalar yayına girmemeli (geliştirici dosyaları): ' + kotu.join(', '));
  for (const yol of liste) {
    const gercek = fs.realpathSync(path.join(kok, yol));
    const goreli = path.relative(kok, gercek).split(path.sep).join('/');
    if (goreli.startsWith('..') || yasakli(goreli)) throw new Error(`Bu dosya yayına girmemeli (bağ ${goreli}'e gidiyor): ${yol}`);
  }
  fs.rmSync(hedef, { recursive: true, force: true });
  const supabaseUrl = ayardanSupabase(kok);
  const sayfalar = liste.filter((y) => /^[^/]+\.html$/.test(y));
  // Bütün sayfalarda CSP aynı olmalı (kural 8): biri farklıysa yayın durur (tek başlık hepsine uygulanır)
  const csplar = new Set(sayfalar.map((y) => (META_CSP.exec(fs.readFileSync(path.join(kok, y), 'utf8')) || [])[1]).filter(Boolean));
  if (csplar.size > 1) throw new Error('Sayfaların CSP satırları farklı; hepsinde aynı olmalı (AGENTS kural 8).');
  // _headers yoksa meta CSP sayfada kalır (CSP hiçbir zaman kaybolmaz)
  const csp = csplar.size && liste.includes('_headers') ? cspDaralt([...csplar][0], supabaseUrl) : null;
  const yazilan = new Map(); // göreli yol → içerik (Buffer ya da metin): özet için
  for (const yol of liste) {
    const kaynak = path.join(kok, yol);
    let veri;
    if (/^[^/]+\.html$/.test(yol)) {
      let html = onBaglanti(fs.readFileSync(kaynak, 'utf8'), supabaseUrl);
      if (csp) html = html.replace(META_CSP, '');
      html = uzantisizBaglantilar(html, sayfalar, 'html');
      if (siteAdresi) html = ogTamAdres(html, siteAdresi, yol);
      veri = html;
    } else if (/\.js$/.test(yol) && (yol.startsWith('assets/') || yol === 'sw.js')) {
      veri = uzantisizBaglantilar(fs.readFileSync(kaynak, 'utf8'), sayfalar, 'js');
    } else if (yol === '_headers' && csp) {
      veri = headersCsp(fs.readFileSync(kaynak, 'utf8'), csp);
    } else veri = fs.readFileSync(kaynak);
    yazilan.set(yol, veri);
  }
  if (yazilan.has('sw.js')) {
    const ozet = crypto.createHash('sha256');
    for (const [yol, veri] of [...yazilan].filter(([y]) => y !== 'sw.js').sort(([a], [b]) => (a < b ? -1 : 1))) { ozet.update(yol + '\0'); ozet.update(veri); }
    yazilan.set('sw.js', swHazirla(yazilan.get('sw.js'), 'y-' + ozet.digest('hex').slice(0, 12), kabukDosyalari(liste)));
  }
  for (const [yol, veri] of yazilan) {
    const varis = path.join(hedef, yol);
    fs.mkdirSync(path.dirname(varis), { recursive: true });
    fs.writeFileSync(varis, veri);
  }
  return liste;
}

module.exports = { hazirla, yayinListesi, onBaglanti, cspDaralt, headersCsp, uzantisizBaglantilar, swHazirla, kabukDosyalari, yerTutucular, YASAK };

if (require.main === module) {
  try {
    const hedef = process.argv[2] ? path.resolve(process.argv[2]) : undefined;
    const siteAdresi = process.env.SITE_ADRESI ? process.env.SITE_ADRESI.trim() : null;
    const liste = hazirla({ hedef, siteAdresi });
    const bayt = liste.reduce((t, y) => t + fs.statSync(path.join(path.resolve(__dirname, '..'), y)).size, 0);
    const taslak = yerTutucular(path.resolve(__dirname, '..')).length ? ' (TASLAK: ayar.js yer tutucu, YAYIN_TASLAK=1)' : '';
    console.log(`Yayın hazır: ${liste.length} dosya, ${(bayt / 1024).toFixed(0)} KB → ${hedef || 'yayin/'}` + (siteAdresi ? ` (og:image ${siteAdresi})` : '') + taslak);
  } catch (e) {
    console.error('YAYIN DURDU: ' + e.message);
    process.exit(1);
  }
}
