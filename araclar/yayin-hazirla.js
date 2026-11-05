// Yayına çıkacak dosyaları hazırlar: yalnız sitenin herkese açık dosyaları yayin/ klasörüne kopyalanır.
// Cloudflare Pages: Build command  node araclar/yayin-hazirla.js   ·   Build output directory  yayin   (README 5. bölüm)
// Kopyalanan: kökteki *.html sayfaları, assets/ (tamamı), _headers, robots.txt, .nojekyll, sw.js (ve varsa favicon.ico / favicon.svg).
// assets/ayar.js'teki SUPABASE_URL doluysa sayfalara <link rel="preconnect"> eklenir (depodaki dosyalar değişmez).
// Kopyalanmayan: testler/, supabase/, docs/, araclar/, node_modules/, .git, README/AGENTS ve diğer her şey.
// Bunlardan biri (ya da sembolik bağ) listeye girerse komut DURUR ve çıkış kodu 1 olur: yayın yapılmaz.
// İsteğe bağlı: SITE_ADRESI=https://alan-adiniz (Cloudflare Pages → Settings → Environment variables) verilirse
// sayfalardaki og:image tam adrese çevrilir ve og:url eklenir (paylaşım önizlemeleri tam adres ister). Depodaki dosyalar değişmez.
const fs = require('fs');
const path = require('path');

const KOK_DOSYALARI = ['_headers', 'robots.txt', '.nojekyll', 'favicon.ico', 'favicon.svg', 'sw.js'];
const KLASORLER = ['assets'];
const YASAK = ['testler', 'supabase', 'docs', 'araclar', 'node_modules', 'yayin', '.git'];

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

/** Paylaşım için og:image'ı tam adrese çevirir, og:url ekler. */
function ogTamAdres(html, siteAdresi, sayfa) {
  const kok = siteAdresi.replace(/\/+$/, '');
  let s = html.replace(/(<meta property="og:image" content=")(?!https?:)([^"]+)(">)/, (m, a, yol, b) => a + kok + '/' + yol.replace(/^\/+/, '') + b);
  if (!/property="og:url"/.test(s)) s = s.replace(/(<meta property="og:image" content="[^"]*">\n?)/, (m) => m + (m.endsWith('\n') ? '' : '\n') + `<meta property="og:url" content="${kok}/${sayfa}">\n`);
  return s;
}

/**
 * Supabase kökenine önceden bağlan (performans: modüller çalışmadan bağlantı açılsın). Adres TEK ayar dosyasından
 * (assets/ayar.js) okunur; yer tutucu ya da https olmayan adreste dokunulmaz. REST/RPC CORS ister (crossorigin), Storage
 * görselleri ayrı bağlantı havuzunu kullanır (crossorigin'siz ikinci satır).
 */
function onBaglanti(html, supabaseUrl) {
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(String(supabaseUrl || '')) || /preconnect/.test(html)) return html;
  return html.replace(/(<meta charset="utf-8">\n)/, `$1<link rel="preconnect" href="${supabaseUrl}" crossorigin>\n<link rel="preconnect" href="${supabaseUrl}">\n`);
}

function ayardanSupabase(kok) {
  try { return (/export const SUPABASE_URL = '([^']+)'/.exec(fs.readFileSync(path.join(kok, 'assets', 'ayar.js'), 'utf8')) || [])[1] || null; } catch (e) { return null; }
}

/**
 * @param {{kok?: string, hedef?: string, ekstra?: string[], siteAdresi?: string|null}} ops
 * @returns {string[]} kopyalanan göreli yollar
 */
function hazirla({ kok = path.resolve(__dirname, '..'), hedef = path.join(kok, 'yayin'), ekstra = [], siteAdresi = null } = {}) {
  kok = path.resolve(kok);
  hedef = path.resolve(hedef);
  if (hedef === kok || kok.startsWith(hedef + path.sep) || path.relative(kok, hedef).split(path.sep)[0] in { assets: 1 }) {
    throw new Error('Yayın hedefi proje klasörünün kendisi, üstü ya da assets/ olamaz: ' + hedef);
  }
  if (siteAdresi != null && !/^https:\/\/[a-z0-9.-]+(:\d+)?\/?$/i.test(siteAdresi)) {
    throw new Error('SITE_ADRESI https://alan-adi biçiminde olmalı: ' + siteAdresi);
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
  for (const yol of liste) {
    const kaynak = path.join(kok, yol), varis = path.join(hedef, yol);
    fs.mkdirSync(path.dirname(varis), { recursive: true });
    if (/^[^/]+\.html$/.test(yol)) {
      let html = onBaglanti(fs.readFileSync(kaynak, 'utf8'), supabaseUrl);
      if (siteAdresi) html = ogTamAdres(html, siteAdresi, yol);
      fs.writeFileSync(varis, html);
    } else fs.copyFileSync(kaynak, varis);
  }
  return liste;
}

module.exports = { hazirla, yayinListesi, onBaglanti, YASAK };

if (require.main === module) {
  try {
    const hedef = process.argv[2] ? path.resolve(process.argv[2]) : undefined;
    const siteAdresi = process.env.SITE_ADRESI ? process.env.SITE_ADRESI.trim() : null;
    const liste = hazirla({ hedef, siteAdresi });
    const bayt = liste.reduce((t, y) => t + fs.statSync(path.join(path.resolve(__dirname, '..'), y)).size, 0);
    console.log(`Yayın hazır: ${liste.length} dosya, ${(bayt / 1024).toFixed(0)} KB → ${hedef || 'yayin/'}` + (siteAdresi ? ` (og:image ${siteAdresi})` : ''));
  } catch (e) {
    console.error('YAYIN DURDU: ' + e.message);
    process.exit(1);
  }
}
