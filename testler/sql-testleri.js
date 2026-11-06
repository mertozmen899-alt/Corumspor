// Veritabanı testleri: migration'lar + seed + RLS testleri gerçek bir Postgres'te.
// Kullanım: node testler/sql-testleri.js
// Motor seçimi:
//   1) Kurulu Postgres (initdb/pg_ctl/psql). PG_BIN ile klasör verilebilir.
//      Geçici bir küme açar, testten sonra siler; gerçek bir veritabanına dokunmaz.
//   2) Yoksa @electric-sql/pglite (WASM Postgres): `npm install --prefix testler` ile kurulur.
// Sonuç: { motor, gecen: [...], kalan: [...] } döndürür; doğrudan çalıştırılırsa yazdırır.
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync, spawnSync } = require('child_process');

const KOK = path.resolve(__dirname, '..');
function dosyalar() {
  const goc = path.join(KOK, 'supabase', 'migrations');
  return [
    path.join(__dirname, 'sql', '00_supabase_taklit.sql'),
    ...fs.readdirSync(goc).filter((d) => d.endsWith('.sql')).sort().map((d) => path.join(goc, d)),
    path.join(KOK, 'supabase', 'seed.sql'),
    path.join(__dirname, 'sql', '10_yardimcilar.sql'),
    path.join(__dirname, 'sql', '20_rls_testleri.sql'),
    path.join(__dirname, 'sql', '30_bildirim_testleri.sql'),
  ];
}

function pgKlasoru() {
  const adaylar = [];
  if (process.env.PG_BIN) adaylar.push(process.env.PG_BIN);
  try { adaylar.push(execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim()); } catch (e) {}
  for (const k of ['/usr/lib/postgresql', '/usr/local/pgsql']) {
    try { fs.readdirSync(k).sort().reverse().forEach((s) => adaylar.push(path.join(k, s, 'bin'))); } catch (e) {}
  }
  adaylar.push('/usr/local/bin', '/usr/bin', '/opt/homebrew/bin');
  return adaylar.find((k) => fs.existsSync(path.join(k, 'initdb')) && fs.existsSync(path.join(k, 'pg_ctl')) && fs.existsSync(path.join(k, 'psql'))) || null;
}

function sonucuAyristir(satirlar) {
  const gecen = [], kalan = [];
  for (const s of satirlar.split('\n').filter(Boolean)) {
    const [ad, gecti, ...detay] = s.split('\t');
    (gecti === 't' || gecti === 'true') ? gecen.push(ad) : kalan.push(ad + ' -> ' + detay.join(' '));
  }
  return { gecen, kalan };
}

function gercekPostgres(bin) {
  const gecici = fs.mkdtempSync(path.join(os.tmpdir(), 'corum-pg-'));
  const veri = path.join(gecici, 'veri'), soket = path.join(gecici, 'soket');
  fs.mkdirSync(soket, { mode: 0o777 }); fs.chmodSync(soket, 0o777); fs.chmodSync(gecici, 0o755);
  const kok = typeof process.getuid === 'function' && process.getuid() === 0;
  // initdb root ile çalışmaz: root isek postgres kullanıcısına geç
  const calistir = (komut, argv) => {
    const tam = kok ? ['runuser', ['-u', 'postgres', '--', path.join(bin, komut), ...argv]] : [path.join(bin, komut), argv];
    const r = spawnSync(tam[0], tam[1], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(komut + ' başarısız: ' + (r.stderr || r.stdout || r.error));
    return r.stdout;
  };
  if (kok) execFileSync('chown', ['-R', 'postgres', gecici]);
  const port = String(20000 + Math.floor(Math.random() * 20000));
  try {
    calistir('initdb', ['-D', veri, '-U', 'postgres', '--auth=trust', '-E', 'UTF8', '--locale=C']);
    calistir('pg_ctl', ['-D', veri, '-l', path.join(gecici, 'gunluk.txt'), '-w', '-o', `-k ${soket} -p ${port} -c listen_addresses=''`, 'start']);
    const psql = (argv) => {
      const r = spawnSync(path.join(bin, 'psql'), ['-h', soket, '-p', port, '-U', 'postgres', '-d', 'postgres', '-X', '-q', '-v', 'ON_ERROR_STOP=1', ...argv], { encoding: 'utf8' });
      if (r.status !== 0) throw new Error((r.stderr || r.stdout).trim());
      return r.stdout;
    };
    for (const d of dosyalar()) {
      try { psql(['-f', d]); } catch (e) { throw new Error(path.relative(KOK, d) + ' çalıştırılamadı: ' + e.message); }
    }
    const surum = psql(['-At', '-c', 'show server_version']).trim();
    const cikti = psql(['-At', '-F', '\t', '-c', "select ad, gecti, replace(coalesce(detay, ''), E'\\n', ' ') from test.sonuc order by no"]);
    return { motor: 'PostgreSQL ' + surum, ...sonucuAyristir(cikti) };
  } finally {
    try { calistir('pg_ctl', ['-D', veri, '-m', 'immediate', 'stop']); } catch (e) {}
    fs.rmSync(gecici, { recursive: true, force: true });
  }
}

async function pglite() {
  let modul;
  // Windows'ta "E:\…" yolu import()'a dosya adresi (file://) olarak verilmeli
  try { modul = await import(require('url').pathToFileURL(require.resolve('@electric-sql/pglite', { paths: [__dirname, KOK] })).href); }
  catch (e) { return null; }
  // 010 "create extension pgcrypto" ister: PGlite'ın kendi eklentisi (paket sürümünde varsa)
  let extensions;
  try {
    const kok = path.dirname(require.resolve('@electric-sql/pglite', { paths: [__dirname, KOK] }));
    extensions = { pgcrypto: (await import(require('url').pathToFileURL(path.join(kok, 'contrib', 'pgcrypto.js')).href)).pgcrypto };
  } catch (e) { extensions = undefined; }
  const db = new modul.PGlite(extensions ? { extensions } : undefined);
  for (const d of dosyalar()) {
    try { await db.exec(fs.readFileSync(d, 'utf8')); }
    catch (e) { throw new Error(path.relative(KOK, d) + ' çalıştırılamadı: ' + e.message); }
  }
  const surum = (await db.query('show server_version')).rows[0].server_version;
  const r = await db.query('select ad, gecti, coalesce(detay, \'\') as detay from test.sonuc order by no');
  await db.close();
  const gecen = [], kalan = [];
  for (const s of r.rows) (s.gecti ? gecen.push(s.ad) : kalan.push(s.ad + ' -> ' + s.detay));
  return { motor: 'PGlite (Postgres ' + surum + ')', gecen, kalan };
}

/** seed.sql'deki her assets/… yolu gerçekten var mı (014: seed'de olmayan gol-kapak-ornek.svg vardı; denetçi 9/11). */
function seedYollari() {
  const seed = fs.readFileSync(path.join(KOK, 'supabase', 'seed.sql'), 'utf8');
  const yollar = [...new Set([...seed.matchAll(/'(assets\/[^'\s]+)'/g)].map((m) => m[1]))];
  const yok = yollar.filter((y) => !fs.existsSync(path.join(KOK, y)));
  return yok.length || !yollar.length
    ? { gecen: [], kalan: [`seed (014): seed.sql'deki assets/ yolları var -> yok: ${yok.join(', ') || '(hiç yol bulunamadı)'}`] }
    : { gecen: [`seed (014): seed.sql'deki ${yollar.length} assets/ yolunun hepsi var`], kalan: [] };
}

async function sqlTestleri() {
  const zorla = process.env.SQL_MOTOR; // 'postgres' | 'pglite'
  const bin = zorla === 'pglite' ? null : pgKlasoru();
  const ekle = (s) => { const y = seedYollari(); return { ...s, gecen: [...s.gecen, ...y.gecen], kalan: [...s.kalan, ...y.kalan] }; };
  if (bin) return ekle(gercekPostgres(bin));
  const p = await pglite();
  if (p) return ekle(p);
  return { motor: 'yok', gecen: [], kalan: ['Postgres bulunamadı: Postgres kurun ya da `npm install --prefix testler` ile PGlite kurun'] };
}

module.exports = { sqlTestleri };

if (require.main === module) {
  sqlTestleri().then((s) => {
    console.log(JSON.stringify(s, null, 2));
    console.log(`SQL: ${s.gecen.length} geçti, ${s.kalan.length} kaldı (${s.motor})`);
    process.exit(s.kalan.length ? 1 : 0);
  }).catch((e) => { console.error(e.message); process.exit(1); });
}
