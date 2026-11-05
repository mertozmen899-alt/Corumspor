// Reklam modülü veritabanı testleri: GERÇEK uygulama şeması üzerinde (taklit yok).
// Sıra: testler/sql/00_supabase_taklit.sql (yalnız Supabase'in sağladıkları: roller, auth, storage)
//       → supabase/migrations/001_temel_sema.sql → 002_depolama.sql → 010_reklamlar.sql → 011_denetim_duzeltmeleri.sql (klasördeki sırayla hepsi)
// RLS ve RPC'ler rol değiştirerek denenir.
// Çalıştırma: node --test testler/reklam/sql.test.mjs   (hepsi: node testler/calistir.js)
// Postgres seçimi: REKLAM_PG_URL verilirse oraya bağlanır (boş bir veritabanı olmalı!),
// yoksa kurulu postgres ikili dosyalarıyla geçici bir küme açar (root ise 'postgres' kullanıcısıyla) ve sonunda siler.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, existsSync, readdirSync, chownSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BURASI = path.dirname(fileURLToPath(import.meta.url));
const KOK = path.resolve(BURASI, '..', '..');
const GOC = path.join(KOK, 'supabase', 'migrations');
const MIGRATIONLAR = readdirSync(GOC).filter((d) => d.endsWith('.sql')).sort().map((d) => path.join(GOC, d));
const MIGRATION = path.join(GOC, '010_reklamlar.sql');
const TAKLIT = path.join(KOK, 'testler', 'sql', '00_supabase_taklit.sql'); // uygulamanın SQL testleriyle aynı Supabase taklidi
const ORNEK = JSON.parse(readFileSync(path.join(BURASI, 'baglanti-ornekleri.json'), 'utf8'));

let baglanti = [];       // psql bağlantı argümanları
let kume = null;         // { dizin, bin, root }

function pgBin() {
  if (process.env.PG_BIN) return process.env.PG_BIN;
  try { return execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim(); } catch { /* yok */ }
  const kok = '/usr/lib/postgresql';
  if (existsSync(kok)) {
    const s = readdirSync(kok).sort((a, b) => Number(b) - Number(a))[0];
    if (s) return path.join(kok, s, 'bin');
  }
  throw new Error('PostgreSQL bulunamadı: PG_BIN ya da REKLAM_PG_URL verin');
}

function pgCalistir(komut, argumanlar) {
  const tam = path.join(kume.bin, komut);
  const r = kume.root
    ? spawnSync('runuser', ['-u', 'postgres', '--', tam, ...argumanlar], { encoding: 'utf8' })
    : spawnSync(tam, argumanlar, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${komut} başarısız: ${r.stderr || r.stdout}`);
  return r.stdout;
}

const lit = (v) => (v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`);

/** SQL'i verilen rolle (anon/authenticated/postgres) tek işlemde çalıştırır; çıktıyı döndürür ya da hata fırlatır. */
function q(sql, { rol = 'postgres', uid = null } = {}) {
  const govde = [
    '\\set ON_ERROR_STOP 1',
    'begin;',
    rol === 'postgres' ? '' : `set local role ${rol};`,
    `set local request.jwt.claim.sub = ${lit(uid || '')};`,
    sql.trim().replace(/;?\s*$/, ';'),
    'commit;',
  ].join('\n');
  const r = spawnSync('psql', [...baglanti, '-X', '-q', '-A', '-t', '-F', '|'], { input: govde, encoding: 'utf8' });
  if (r.status !== 0) {
    const e = new Error((r.stderr || '').replace(/^psql:<stdin>:\d+: /gm, '').trim() || 'psql hatası');
    e.psql = r;
    throw e;
  }
  return r.stdout.trim();
}
const hata = (sql, ops) => {
  try { q(sql, ops); } catch (e) { return e.message; }
  return null;
};
const dosyaUygula = (dosya) => {
  const r = spawnSync('psql', [...baglanti, '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-f', dosya], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${path.basename(dosya)}: ${r.stderr}`);
  return r.stderr; // notice'lar
};
/** 010'u yeniden uygular, ardından sıradaki migration'ları da (012, 010'daki reklam_olay_kaydet/reklam_raporu'nun yerine geçer). */
const reklamMigrationYenidenUygula = () => {
  const notlar = dosyaUygula(MIGRATION);
  for (const d of MIGRATIONLAR.filter((x) => path.basename(x) > path.basename(MIGRATION))) dosyaUygula(d);
  return notlar;
};

// Kimlikler
const ADMIN = '00000000-0000-4000-8000-00000000000a';
const UYE = '00000000-0000-4000-8000-00000000000b';
const anon = { rol: 'anon' };
const uye = { rol: 'authenticated', uid: UYE };
const admin = { rol: 'authenticated', uid: ADMIN };
let MAC1, MAC2;

/** Yönetici olarak reklam ekler, id döndürür. */
function reklamEkle(o = {}, ops = admin) {
  const r = {
    firma_adi: 'Test Firma', gorsel_url: 'https://x.supabase.co/storage/v1/object/public/reklam-gorselleri/a.png',
    kisa_metin: 'Kısa metin', baglanti_url: 'https://narcil.net', alan: 'ana_akis', mac_id: null,
    baslangic: "now() - interval '1 day'", bitis: "now() + interval '1 day'", durum: 'yayinda', oncelik: 0, ...o,
  };
  const ifade = (k, v) => (['baslangic', 'bitis'].includes(k) && typeof v === 'string' && /now\(\)/.test(v) ? v : lit(v));
  const sutunlar = Object.keys(r);
  return q(`insert into public.reklamlar (${sutunlar.join(',')}) values (${sutunlar.map((k) => ifade(k, r[k])).join(',')}) returning id`, ops);
}
const aktif = (alan, mac = null, ops = anon) => q(`select coalesce((select firma_adi from public.aktif_reklam(${lit(alan)}, ${lit(mac)})), '-')`, ops);
const olay = (id, tur, ziyaret, alan = 'ana_akis', mac = null, ops = anon, sekme = null) =>
  q(`select public.reklam_olay_kaydet(${lit(id)}, ${lit(tur)}, ${lit(ziyaret)}, ${lit(alan)}, ${lit(mac)}, ${lit(sekme)})`, ops);
const GORSEL = 'https://abc.supabase.co/storage/v1/object/public/reklam-gorselleri/2026/11/x.png';
let ISADMIN_TANIMI = ''; // 001'deki asıl is_admin() (bir testte değiştirilip geri yüklenir)
const temizle = () => q('delete from public.reklam_olaylari; delete from public.reklamlar;');
const uuid = () => crypto.randomUUID();

before(() => {
  if (process.env.REKLAM_PG_URL) {
    baglanti = [process.env.REKLAM_PG_URL];
  } else {
    const root = process.getuid && process.getuid() === 0;
    const dizin = mkdtempSync(path.join(tmpdir(), 'reklam-pg-'));
    kume = { dizin, bin: pgBin(), root };
    if (root) {
      const pg = execFileSync('id', ['-u', 'postgres'], { encoding: 'utf8' }).trim();
      const gr = execFileSync('id', ['-g', 'postgres'], { encoding: 'utf8' }).trim();
      chownSync(dizin, Number(pg), Number(gr));
    }
    const port = String(20000 + Math.floor(Math.random() * 20000));
    pgCalistir('initdb', ['-D', path.join(dizin, 'veri'), '-A', 'trust', '-U', 'postgres', '-E', 'UTF8', '--no-locale']);
    pgCalistir('pg_ctl', ['-D', path.join(dizin, 'veri'), '-l', path.join(dizin, 'gunluk.txt'), '-w',
      '-o', `-k ${dizin} -p ${port} -c listen_addresses='' -c timezone=UTC`, 'start']);
    baglanti = ['-h', dizin, '-p', port, '-U', 'postgres', '-d', 'postgres'];
  }
  dosyaUygula(TAKLIT);
  for (const d of MIGRATIONLAR) dosyaUygula(d);
  // Kayıt tetikleyicisi (001) profilleri açar; ilk yönetici README'deki gibi SQL ile atanır
  q(`insert into auth.users (id, email, raw_user_meta_data) values
       (${lit(ADMIN)}, 'yonetici@ornek.test', '{"kullanici_adi":"yonetici"}'),
       (${lit(UYE)}, 'uye@ornek.test', '{"kullanici_adi":"uye_1","role":"admin"}');
     update public.profiles set role = 'admin' where id = ${lit(ADMIN)};`);
  ISADMIN_TANIMI = q("select pg_get_functiondef('public.is_admin()'::regprocedure)");
  [MAC1, MAC2] = q(`insert into public.maclar (rakip, tarih) values ('Sakaryaspor', now() + interval '2 day'), ('Bandırmaspor', now() + interval '9 day') returning id`).split('\n');
});

after(() => {
  if (!kume) return;
  try { pgCalistir('pg_ctl', ['-D', path.join(kume.dizin, 'veri'), '-m', 'immediate', '-w', 'stop']); } catch { /* zaten kapalı */ }
  rmSync(kume.dizin, { recursive: true, force: true });
});

test('gerçek 001 şeması: profiles/is_admin/maclar uygulamanınki, taklit değil; migration sırası 001 → 002 → 010 → 011 → 012 → 013', () => {
  assert.deepEqual(MIGRATIONLAR.map((d) => path.basename(d)), ['001_temel_sema.sql', '002_depolama.sql', '010_reklamlar.sql', '011_denetim_duzeltmeleri.sql', '012_denetim_2.sql', '013_tasarim.sql']);
  assert.equal(q("select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name in ('kullanici_adi', 'role')"), '2');
  assert.equal(q("select data_type from information_schema.columns where table_schema = 'public' and table_name = 'maclar' and column_name = 'id'"), 'uuid');
  assert.equal(q(`select role from public.profiles where id = ${lit(UYE)}`), 'taraftar', 'kayıtta metadata rolü yok sayılır');
  assert.equal(q("select prosecdef from pg_proc where oid = 'public.is_admin()'::regprocedure"), 't');
  assert.equal(q("select count(*) from storage.buckets where id in ('haber-gorselleri', 'reklam-gorselleri')"), '2');
});

test('migration ikinci kez de hatasız uygulanır (tekrar çalıştırılabilir)', () => {
  reklamMigrationYenidenUygula();
  assert.equal(q("select count(*) from pg_policies where tablename in ('reklamlar','reklam_olaylari')"), '5');
  assert.equal(q("select relrowsecurity from pg_class where oid = 'public.reklamlar'::regclass"), 't');
  assert.equal(q("select relrowsecurity from pg_class where oid = 'public.reklam_olaylari'::regclass"), 't');
});

test('SECURITY DEFINER fonksiyonların search_path ayarı sabit', () => {
  const satir = q(`select p.proname || '=' || coalesce(array_to_string(p.proconfig, ','), 'YOK') from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef order by 1`);
  for (const s of satir.split('\n')) assert.match(s, /search_path=""/, s);
  assert.ok(satir.includes('aktif_reklam=') && satir.includes('reklam_olay_kaydet=') && satir.includes('reklam_raporu='));
});

test('bağlantı doğrulama SQL ile JS aynı sonucu verir (ortak örnekler)', () => {
  for (const [url, beklenen] of ORNEK.baglanti) {
    assert.equal(q(`select public.reklam_baglanti_gecerli(${lit(url)})`), beklenen ? 't' : 'f', url);
  }
  for (const [tel, beklenen] of ORNEK.telefon) {
    assert.equal(q(`select coalesce(public.whatsapp_baglantisi(${lit(tel)}), '-')`), beklenen ?? '-', tel);
  }
  for (const [url, beklenen] of ORNEK.gorsel) {
    assert.equal(q(`select public.reklam_gorsel_gecerli(${lit(url)})`), beklenen ? 't' : 'f', url);
  }
});

test('ziyaretçi taslak/duraklatılmış/süresi dolmuş/başlamamış reklamı göremez, tabloyu hiç okuyamaz', () => {
  temizle();
  reklamEkle({ firma_adi: 'Taslak', alan: 'ana_akis', durum: 'taslak', oncelik: 100 });
  const dur = reklamEkle({ firma_adi: 'Duran', alan: 'ana_akis', oncelik: 100 });
  q(`update public.reklamlar set durum = 'duraklatildi' where id = ${lit(dur)}`, admin);
  reklamEkle({ firma_adi: 'Bitmiş', alan: 'haber_sonu' });
  q("update public.reklamlar set baslangic = now() - interval '3 day', bitis = now() - interval '1 hour' where firma_adi = 'Bitmiş'", admin);
  assert.equal(q("select durum from public.reklamlar where firma_adi = 'Bitmiş'"), 'yayinda');
  reklamEkle({ firma_adi: 'Gelecek', alan: 'mac_sponsoru', baslangic: "now() + interval '1 hour'", bitis: "now() + interval '2 day'" });
  assert.equal(aktif('ana_akis'), '-');
  assert.equal(aktif('haber_sonu'), '-');
  assert.equal(aktif('mac_sponsoru'), '-');
  assert.equal(aktif('ana_akis', null, uye), '-');
  reklamEkle({ firma_adi: 'Canlı', alan: 'ana_akis', oncelik: 1 });
  assert.equal(aktif('ana_akis'), 'Canlı');
  // Tablonun kendisi: anon ve sıradan üye 0 satır görür
  assert.equal(q('select count(*) from public.reklamlar', anon), '0');
  assert.equal(q('select count(*) from public.reklamlar', uye), '0');
  assert.equal(q('select count(*) from public.reklam_olaylari', anon), '0');
  // aktif_reklam iç alanları (olusturan, durum) vermez
  const cikti = q(`select row_to_json(a)::text from public.aktif_reklam('ana_akis') a`, anon);
  // 013: + düğme yazısı, "Ara" telefonu, görseldeki yazı (alt), küçük görsel; iç alanlar (olusturan, durum, sektor_onayi) yine yok
  assert.deepEqual(Object.keys(JSON.parse(cikti)).sort(), ['alan', 'baglanti_url', 'dugme_metni', 'firma_adi', 'gorsel_kucuk_url', 'gorsel_metni', 'gorsel_url', 'id', 'kisa_metin', 'mac_id', 'telefon']);
  assert.equal(aktif('yanlis_alan'), '-');
});

test('ziyaretçi ve sıradan üye reklam ekleyemez, değiştiremez, silemez', () => {
  temizle();
  const id = reklamEkle({ firma_adi: 'Korunan' });
  for (const ops of [anon, uye]) {
    assert.match(hata(`insert into public.reklamlar (firma_adi, gorsel_url, kisa_metin, alan, baslangic, bitis, durum)
      values ('Sahte', ${lit(GORSEL)}, 'x', 'ana_akis', now(), now() + interval '1 day', 'yayinda')`, ops), /row-level security/);
    q(`update public.reklamlar set firma_adi = 'Ele geçirildi', oncelik = 100 where id = ${lit(id)}`, ops);
    q(`delete from public.reklamlar where id = ${lit(id)}`, ops);
    assert.match(hata('truncate public.reklamlar cascade', ops), /permission denied/);
    assert.match(hata(`insert into public.reklam_olaylari (reklam_id, tur, sayfa_ziyaret_id, alan) values (${lit(id)}, 'tiklama', gen_random_uuid(), 'ana_akis')`, ops), /row-level security/);
  }
  assert.equal(q(`select firma_adi || '/' || oncelik from public.reklamlar where id = ${lit(id)}`), 'Korunan/0');
  assert.equal(q('select count(*) from public.reklam_olaylari'), '0');
  assert.equal(q('select public.is_admin()', anon), 'f');
  assert.equal(q('select public.is_admin()', uye), 'f');
  assert.equal(q('select public.is_admin()', admin), 't');
});

test('yönetici olmayan rapor okuyamaz', () => {
  assert.match(hata("select * from public.reklam_raporu('2026-11-01', '2026-11-30')", uye), /yalnızca yöneticiler/);
  assert.match(hata("select * from public.reklam_raporu('2026-11-01', '2026-11-30')", anon), /permission denied/);
  assert.equal(q("select count(*) from public.reklam_olaylari", uye), '0');
});

test('yönetici ekler, okur, günceller, siler; olusturan ve yayina_alinma sunucuda yazılır', () => {
  temizle();
  const id = q(`insert into public.reklamlar (firma_adi, gorsel_url, kisa_metin, alan, baslangic, bitis, durum, yayina_alinma, olusturan)
    values ('Yeni', ${lit(GORSEL)}, 'metin', 'ana_akis', now(), now() + interval '1 day', 'taslak', '2000-01-01', ${lit(UYE)}) returning id`, admin);
  assert.equal(q(`select coalesce(yayina_alinma::text, 'bos') || '|' || olusturan from public.reklamlar where id = ${lit(id)}`, admin), `bos|${ADMIN}`);
  assert.equal(q('select count(*) from public.reklamlar', admin), '1');
  q(`update public.reklamlar set durum = 'yayinda', kisa_metin = 'güncel' where id = ${lit(id)}`, admin);
  const ilk = q(`select yayina_alinma from public.reklamlar where id = ${lit(id)}`, admin);
  assert.notEqual(ilk, '');
  // yayındayken başka alan değişince yayina_alinma korunur, istemcinin yazdığı değer yok sayılır
  q(`update public.reklamlar set oncelik = 3, yayina_alinma = '2000-01-01' where id = ${lit(id)}`, admin);
  assert.equal(q(`select yayina_alinma from public.reklamlar where id = ${lit(id)}`, admin), ilk);
  // duraklat + yeniden yayına al: yayina_alinma yenilenir
  q(`update public.reklamlar set durum = 'duraklatildi' where id = ${lit(id)}`, admin);
  q(`update public.reklamlar set durum = 'yayinda' where id = ${lit(id)}`, admin);
  assert.equal(q(`select yayina_alinma > ${lit(ilk)}::timestamptz from public.reklamlar where id = ${lit(id)}`, admin), 't');
  assert.equal(q(`delete from public.reklamlar where id = ${lit(id)} returning 'silindi'`, admin), 'silindi');
  assert.equal(q('select count(*) from public.reklamlar'), '0');
});

test('aktif_reklam: yüksek öncelik kazanır, eşitlikte en son yayına alınan', () => {
  temizle();
  reklamEkle({ firma_adi: 'Düşük', oncelik: 10 });
  reklamEkle({ firma_adi: 'Yüksek', oncelik: 50 });
  assert.equal(aktif('ana_akis'), 'Yüksek');
  const a = reklamEkle({ firma_adi: 'A', alan: 'haber_sonu', oncelik: 20 });
  reklamEkle({ firma_adi: 'B', alan: 'haber_sonu', oncelik: 20 }); // ayrı işlem: daha yeni yayina_alinma
  assert.equal(aktif('haber_sonu'), 'B');
  q(`update public.reklamlar set durum = 'duraklatildi' where id = ${lit(a)}`, admin);
  q(`update public.reklamlar set durum = 'yayinda' where id = ${lit(a)}`, admin);
  assert.equal(aktif('haber_sonu'), 'A');
  // yayina_alinma da eşitse created_at: daha yeni oluşturulan kazanır
  q(`alter table public.reklamlar disable trigger reklamlar_dogrula;
     update public.reklamlar set yayina_alinma = '2026-01-01T00:00:00Z', created_at = case when firma_adi = 'A' then now() else now() - interval '1 day' end where alan = 'haber_sonu';
     alter table public.reklamlar enable trigger reklamlar_dogrula;`);
  assert.equal(aktif('haber_sonu'), 'A');
});

test('aktif_reklam: maça özel sponsor genelden önce, başka maçınki görünmez', () => {
  temizle();
  reklamEkle({ firma_adi: 'Genel Sponsor', alan: 'mac_sponsoru', oncelik: 90 });
  reklamEkle({ firma_adi: 'Maç 1 Sponsoru', alan: 'mac_sponsoru', mac_id: MAC1, oncelik: 1 });
  assert.equal(aktif('mac_sponsoru', MAC1), 'Maç 1 Sponsoru');
  assert.equal(aktif('mac_sponsoru', MAC2), 'Genel Sponsor');
  assert.equal(aktif('mac_sponsoru', null), 'Genel Sponsor');
  assert.equal(aktif('mac_sponsoru', ''), 'Genel Sponsor');
  // maça özel reklamlar arasında öncelik
  reklamEkle({ firma_adi: 'Maç 1 Büyük', alan: 'mac_sponsoru', mac_id: MAC1, oncelik: 5 });
  assert.equal(aktif('mac_sponsoru', MAC1), 'Maç 1 Büyük');
  q("delete from public.reklamlar where firma_adi = 'Genel Sponsor'", admin);
  assert.equal(aktif('mac_sponsoru', MAC2), '-');
});

test('süre dolunca reklam kendiliğinden kaybolur (bitis geçmişe alınınca)', () => {
  temizle();
  const id = reklamEkle({ firma_adi: 'Bu Hafta', oncelik: 50 });
  reklamEkle({ firma_adi: 'Yedek', oncelik: 1 });
  assert.equal(aktif('ana_akis'), 'Bu Hafta');
  q(`update public.reklamlar set baslangic = now() - interval '8 day', bitis = now() - interval '1 minute' where id = ${lit(id)}`, admin);
  assert.equal(aktif('ana_akis'), 'Yedek');
  q("update public.reklamlar set baslangic = now() - interval '8 day', bitis = now() - interval '1 second' where firma_adi = 'Yedek'", admin);
  assert.equal(aktif('ana_akis'), '-');
});

test('gösterim aynı sayfa ziyaretinde bir kez sayılır', () => {
  temizle();
  const id = reklamEkle({ firma_adi: 'Sayılan' });
  const z1 = uuid();
  assert.equal(olay(id, 'gosterim', z1), 'kaydedildi');
  assert.equal(olay(id, 'gosterim', z1), 'tekrar');
  assert.equal(olay(id, 'gosterim', z1, 'ana_akis', null, uye), 'tekrar');
  assert.equal(olay(id, 'gosterim', uuid()), 'kaydedildi');
  assert.equal(q(`select count(*) from public.reklam_olaylari where reklam_id = ${lit(id)} and tur = 'gosterim'`), '2');
  // olay tablosunda kişisel veri sütunu yok
  assert.equal(q("select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns where table_schema='public' and table_name='reklam_olaylari'"),
    'id,reklam_id,tur,sayfa_ziyaret_id,alan,mac_id,created_at,sekme_id');
});

test('tıklama: aynı reklama aynı ziyarette 30 dk içinde tekrar tıklama sayılmaz, ziyaret başına en fazla 5 tıklama', () => {
  temizle();
  const idler = [1, 2, 3, 4, 5, 6].map((n) => reklamEkle({ firma_adi: 'F' + n, oncelik: n }));
  const z = uuid();
  assert.equal(olay(idler[0], 'tiklama', z), 'kaydedildi');
  assert.equal(olay(idler[0], 'tiklama', z), 'tekrar');
  // 29 dakika önce tıklanmış gibi yap: hâlâ tekrar
  q(`update public.reklam_olaylari set created_at = now() - interval '29 minutes' where sayfa_ziyaret_id = ${lit(z)}`);
  assert.equal(olay(idler[0], 'tiklama', z), 'tekrar');
  // 31 dakika geçti: yeni tıklama sayılır
  q(`update public.reklam_olaylari set created_at = now() - interval '31 minutes' where sayfa_ziyaret_id = ${lit(z)}`);
  assert.equal(olay(idler[0], 'tiklama', z), 'kaydedildi');
  assert.equal(q(`select count(*) from public.reklam_olaylari where sayfa_ziyaret_id = ${lit(z)} and reklam_id = ${lit(idler[0])}`), '2');
  // başka ziyaret aynı reklamı hemen sayabilir
  assert.equal(olay(idler[0], 'tiklama', uuid()), 'kaydedildi');
  // ziyaret başına sınır: z'de 2 tıklama var, 3 farklı reklam daha = 5, altıncı reddedilir
  for (const id of idler.slice(1, 4)) assert.equal(olay(id, 'tiklama', z), 'kaydedildi');
  assert.equal(olay(idler[4], 'tiklama', z), 'sinir');
  assert.equal(olay(idler[5], 'tiklama', z), 'sinir');
  assert.equal(q(`select count(*) from public.reklam_olaylari where sayfa_ziyaret_id = ${lit(z)} and tur = 'tiklama'`), '5');
  assert.equal(olay(idler[5], 'tiklama', uuid()), 'kaydedildi');
  // gösterim tıklama sınırına takılmaz
  assert.equal(olay(idler[5], 'gosterim', z), 'kaydedildi');
});

test('tıklama tekrarı sekme kimliğiyle: aynı sekmede başka sayfada 30 dk içinde sayılmaz; gösterim sekmeye bakmaz', () => {
  temizle();
  const id = reklamEkle({ firma_adi: 'Sekme' });
  const diger = reklamEkle({ firma_adi: 'Diğer', alan: 'haber_sonu' });
  const sekme = uuid();
  const [z1, z2, z3] = [uuid(), uuid(), uuid()];
  assert.equal(olay(id, 'tiklama', z1, 'ana_akis', null, anon, sekme), 'kaydedildi');
  // aynı sekme, başka sayfa (yeni sayfa ziyareti): tekrar
  assert.equal(olay(id, 'tiklama', z2, 'ana_akis', null, anon, sekme), 'tekrar');
  // aynı sekmede BAŞKA reklam sayılır
  assert.equal(olay(diger, 'tiklama', z2, 'haber_sonu', null, anon, sekme), 'kaydedildi');
  // başka sekme (ya da sekme kimliği yok): sayılır
  assert.equal(olay(id, 'tiklama', z3, 'ana_akis', null, anon, uuid()), 'kaydedildi');
  assert.equal(olay(id, 'tiklama', uuid(), 'ana_akis', null, anon, null), 'kaydedildi');
  // 31 dakika sonra aynı sekmede yeniden sayılır
  q(`update public.reklam_olaylari set created_at = now() - interval '31 minutes' where sekme_id = ${lit(sekme)}`);
  assert.equal(olay(id, 'tiklama', uuid(), 'ana_akis', null, anon, sekme), 'kaydedildi');
  assert.equal(q(`select count(*) from public.reklam_olaylari where sekme_id = ${lit(sekme)} and reklam_id = ${lit(id)}`), '2');
  // gösterim: sayfa ziyareti başına; sekme kimliği gelse de saklanmaz, yeni sayfada yeniden sayılır
  assert.equal(olay(id, 'gosterim', z1, 'ana_akis', null, anon, sekme), 'kaydedildi');
  assert.equal(olay(id, 'gosterim', z2, 'ana_akis', null, anon, sekme), 'kaydedildi');
  assert.equal(q(`select count(*) from public.reklam_olaylari where tur = 'gosterim' and sekme_id is not null`), '0');
  // sekme kimliği bozuk uuid ise hata (istemci her zaman uuid gönderir)
  assert.match(hata(`select public.reklam_olay_kaydet(${lit(id)}, 'tiklama', gen_random_uuid(), 'ana_akis', null, 'bozuk')`, anon), /uuid/);
  // ziyaretçi sekme kimliklerini okuyamaz
  assert.equal(q('select count(*) from public.reklam_olaylari where sekme_id is not null', anon), '0');
});

test('eşzamanlı aynı gösterim çağrıları tek satır yazar', async () => {
  temizle();
  const id = reklamEkle({ firma_adi: 'Yarış' });
  const z = uuid();
  const { spawn } = await import('node:child_process');
  const bir = () => new Promise((coz) => {
    const p = spawn('psql', [...baglanti, '-X', '-q', '-A', '-t', '-c',
      `set role anon; select public.reklam_olay_kaydet(${lit(id)}, 'gosterim', ${lit(z)}, 'ana_akis', null)`]);
    let o = ''; p.stdout.on('data', (d) => { o += d; }); p.on('close', () => coz(o.trim()));
  });
  const sonuclar = await Promise.all(Array.from({ length: 8 }, bir));
  assert.equal(sonuclar.filter((s) => s === 'kaydedildi').length, 1, sonuclar.join(','));
  assert.equal(sonuclar.filter((s) => s === 'tekrar').length, 7);
  assert.equal(q(`select count(*) from public.reklam_olaylari where sayfa_ziyaret_id = ${lit(z)}`), '1');
});

test('yayında olmayan reklam için olay reddedilir; alan/maç tutmazsa reddedilir', () => {
  temizle();
  const taslak = reklamEkle({ firma_adi: 'T', durum: 'taslak' });
  const duran = reklamEkle({ firma_adi: 'D' });
  q(`update public.reklamlar set durum = 'duraklatildi' where id = ${lit(duran)}`, admin);
  const gelecek = reklamEkle({ firma_adi: 'G', baslangic: "now() + interval '1 hour'" });
  const biten = reklamEkle({ firma_adi: 'B' });
  q(`update public.reklamlar set baslangic = now() - interval '2 day', bitis = now() - interval '1 minute' where id = ${lit(biten)}`, admin);
  for (const id of [taslak, duran, gelecek, biten, uuid()]) {
    assert.match(hata(`select public.reklam_olay_kaydet(${lit(id)}, 'gosterim', gen_random_uuid(), 'ana_akis', null)`, anon), /yayında değil/);
  }
  const canli = reklamEkle({ firma_adi: 'C' });
  assert.match(hata(`select public.reklam_olay_kaydet(${lit(canli)}, 'gosterim', gen_random_uuid(), 'haber_sonu', null)`, anon), /bu alanda/);
  assert.match(hata(`select public.reklam_olay_kaydet(${lit(canli)}, 'begeni', gen_random_uuid(), 'ana_akis', null)`, anon), /olay türü/);
  assert.match(hata(`select public.reklam_olay_kaydet(${lit(canli)}, 'gosterim', null, 'ana_akis', null)`, anon), /Eksik/);
  const mac = reklamEkle({ firma_adi: 'M', alan: 'mac_sponsoru', mac_id: MAC1 });
  assert.match(hata(`select public.reklam_olay_kaydet(${lit(mac)}, 'gosterim', gen_random_uuid(), 'mac_sponsoru', ${lit(MAC2)})`, anon), /bu maçta/);
  assert.equal(olay(mac, 'gosterim', uuid(), 'mac_sponsoru', MAC1), 'kaydedildi');
  const genel = reklamEkle({ firma_adi: 'Genel', alan: 'mac_sponsoru' });
  assert.equal(olay(genel, 'gosterim', uuid(), 'mac_sponsoru', MAC2), 'kaydedildi');
  assert.equal(q(`select mac_id from public.reklam_olaylari where reklam_id = ${lit(genel)}`), MAC2);
  assert.equal(q('select count(*) from public.reklam_olaylari'), '2');
});

test('doğrulama tetikleyicisi bozuk bağlantı, tarih, alan, öncelik ve boş alanları reddeder', () => {
  temizle();
  const red = (o, desen) => {
    let mesaj = null;
    try { reklamEkle(o); } catch (e) { mesaj = e.message; }
    assert.ok(mesaj, 'reddedilmeliydi: ' + JSON.stringify(o));
    assert.match(mesaj, desen, JSON.stringify(o));
  };
  red({ baglanti_url: 'http://corumdoner.com.tr' }, /Bağlantı geçersiz/);
  red({ baglanti_url: 'javascript:alert(1)' }, /Bağlantı geçersiz/);
  red({ baglanti_url: 'https://wa.me/abc' }, /Bağlantı geçersiz/);
  red({ baglanti_url: 'data:text/html,x' }, /Bağlantı geçersiz/);
  red({ baslangic: "now() + interval '1 day'", bitis: "now() - interval '1 day'" }, /Bitiş, başlangıçtan sonra/);
  red({ baslangic: "now() + interval '1 day'", bitis: "now() + interval '1 day'" }, /Bitiş, başlangıçtan sonra/);
  red({ alan: 'ana_akis', mac_id: MAC1 }, /Maç yalnızca/);
  red({ alan: 'mac_sponsoru', mac_id: '00000000-0000-4000-8000-000000000999' }, /maç bulunamadı/);
  red({ oncelik: 101 }, /Öncelik/);
  red({ oncelik: -1 }, /Öncelik/);
  red({ firma_adi: '   ' }, /Firma adı boş/);
  red({ firma_adi: 'x'.repeat(81) }, /Firma adı en fazla/);
  red({ kisa_metin: '' }, /Kısa metin boş/);
  red({ kisa_metin: 'x'.repeat(161) }, /Kısa metin en fazla/);
  red({ gorsel_url: 'http://ornek.com/x.png' }, /deposundaki görseller/);
  red({ gorsel_url: 'https://baska-site.com/piksel.png' }, /deposundaki görseller/);
  red({ gorsel_url: 'http://127.0.0.1:54321/storage/v1/object/public/reklam-gorselleri/x.png' }, /deposundaki görseller/);
  red({ gorsel_url: '' }, /deposundaki görseller/);
  red({ baslangic: "now() - interval '3 day'", bitis: "now() - interval '1 day'", durum: 'yayinda' }, /geçmiş bir reklam yayına alınamaz/);
  // geçerli olanlar kabul edilir; boş bağlantı null'a çevrilir
  const id = reklamEkle({ baglanti_url: '  ', firma_adi: '  Boşluklu  ' });
  assert.equal(q(`select coalesce(baglanti_url, 'NULL') || '|' || firma_adi from public.reklamlar where id = ${lit(id)}`), 'NULL|Boşluklu');
  reklamEkle({ baglanti_url: 'https://wa.me/905321234567?text=Merhaba' });
  reklamEkle({ baglanti_url: 'whatsapp://send?phone=905321234567' });
  reklamEkle({ baslangic: "now() - interval '3 day'", bitis: "now() - interval '1 day'", durum: 'taslak' });
  // güncellemede de çalışır
  assert.match(hata(`update public.reklamlar set baglanti_url = 'http://kotu.com' where id = ${lit(id)}`, admin), /Bağlantı geçersiz/);
});

test('ilk reklam (Narçil Cafe): metin, bağlantı ve görsel tetikleyiciden geçer; ç harfli adres punycode olmadan reddedilir', () => {
  temizle();
  const metin = "Espresso bazlı kahveler, Türk kahvesi, bitki çayları, taze sıkılmış meyve suları ve tatlılar. Menünün tamamı narcil.net'te.";
  const id = reklamEkle({ firma_adi: 'Narçil Cafe', kisa_metin: metin, baglanti_url: 'https://narcil.net/?category=espresso-bazli-kahveler', gorsel_url: 'https://abc.supabase.co/storage/v1/object/public/reklam-gorselleri/2026/11/narcil-1200x628.png', oncelik: 10 });
  assert.equal(q(`select firma_adi || '|' || length(kisa_metin) || '|' || baglanti_url from public.reklamlar where id = ${lit(id)}`), 'Narçil Cafe|123|https://narcil.net/?category=espresso-bazli-kahveler');
  assert.equal(aktif('ana_akis'), 'Narçil Cafe');
  // Panel Türkçe harfli alan adını punycode'a çevirir; ç'li hâli doğrudan yazılırsa SQL de reddeder (JS ile aynı)
  assert.equal(q("select public.reklam_baglanti_gecerli('https://narçil.net')"), 'f');
  assert.equal(q("select public.reklam_baglanti_gecerli('https://xn--naril-0ra.net')"), 't');
  assert.match(hata(`update public.reklamlar set baglanti_url = 'https://narçil.net' where id = ${lit(id)}`, admin), /Bağlantı geçersiz/);
});

test('rapor: Türkiye takvim günü, gösterim/tıklama/oran', () => {
  temizle();
  const a = reklamEkle({ firma_adi: 'Narçil Cafe', baslangic: "now() - interval '30 day'", bitis: "now() + interval '30 day'" });
  const b = reklamEkle({ firma_adi: 'Hitit Optik', alan: 'haber_sonu' });
  reklamEkle({ firma_adi: 'Taslak Firma', durum: 'taslak' });
  // olayları doğrudan (süper kullanıcı) belirli anlara yaz: 31 Ekim 21:30 UTC = 1 Kasım 00:30 İstanbul
  q(`insert into public.reklam_olaylari (reklam_id, tur, sayfa_ziyaret_id, alan, created_at)
     select ${lit(a)}, 'gosterim', gen_random_uuid(), 'ana_akis', '2026-10-31T21:30:00Z' from generate_series(1, 3);
     insert into public.reklam_olaylari (reklam_id, tur, sayfa_ziyaret_id, alan, created_at)
     select ${lit(a)}, 'gosterim', gen_random_uuid(), 'ana_akis', '2026-10-31T20:59:59Z' from generate_series(1, 2);
     insert into public.reklam_olaylari (reklam_id, tur, sayfa_ziyaret_id, alan, created_at)
     values (${lit(a)}, 'tiklama', gen_random_uuid(), 'ana_akis', '2026-11-30T20:59:00Z'),
            (${lit(a)}, 'tiklama', gen_random_uuid(), 'ana_akis', '2026-11-30T21:00:00Z');`);
  const rapor = (bas, son) => q(`select firma_adi || ';' || alan || ';' || gosterim || ';' || tiklama || ';' || coalesce(tiklama_orani::text, '-')
    from public.reklam_raporu(${lit(bas)}, ${lit(son)})`, admin).split('\n').filter(Boolean);
  const kasim = rapor('2026-11-01', '2026-11-30');
  assert.equal(kasim[0], 'Narçil Cafe;ana_akis;3;1;33.33');
  assert.ok(kasim.includes('Hitit Optik;haber_sonu;0;0;-'), kasim.join(' / '));
  assert.ok(!kasim.some((s) => s.startsWith('Taslak Firma')));
  assert.deepEqual(rapor('2026-10-31', '2026-10-31').filter((s) => s.startsWith('Narçil')), ['Narçil Cafe;ana_akis;2;0;0.00']);
  assert.deepEqual(rapor('2026-12-01', '2026-12-01').filter((s) => s.startsWith('Narçil')), ['Narçil Cafe;ana_akis;0;1;-']);
  assert.match(hata("select * from public.reklam_raporu('2026-11-30', '2026-11-01')", admin), /Tarih aralığı/);
  void b;
});

test('depo: reklam-gorselleri herkese açık, yalnız yönetici yükler/siler', () => {
  assert.equal(q("select public::int || '|' || file_size_limit || '|' || array_to_string(allowed_mime_types, ',') from storage.buckets where id = 'reklam-gorselleri'"),
    '1|2097152|image/jpeg,image/png,image/webp');
  const ekle = (ops, ad) => hata(`insert into storage.objects (bucket_id, name) values ('reklam-gorselleri', ${lit(ad)})`, ops);
  assert.match(ekle(anon, 'anon.png'), /row-level security/);
  assert.match(ekle(uye, 'uye.png'), /row-level security/);
  assert.equal(ekle(admin, 'admin.png'), null);
  // Herkese açık kova: dosya public URL ile (RLS'siz) okunur. Listeleme (select) ise yalnız yönetici:
  // yoksa ziyaretçi depoyu listeleyip henüz yayınlanmamış (taslak) kampanyanın görselini görür.
  assert.equal(q("select count(*) from storage.objects where bucket_id = 'reklam-gorselleri'", anon), '0');
  assert.equal(q("select count(*) from storage.objects where bucket_id = 'reklam-gorselleri'", uye), '0');
  assert.equal(q("select count(*) from storage.objects where bucket_id = 'reklam-gorselleri'", admin), '1');
  q("delete from storage.objects where name = 'admin.png'", uye);
  assert.equal(q("select count(*) from storage.objects where name = 'admin.png'"), '1');
  q("delete from storage.objects where name = 'admin.png'", admin);
  assert.equal(q("select count(*) from storage.objects where name = 'admin.png'"), '0');
});

test('is_admin değiştirilebilir tek nokta: migration onu yeniden tanımlamaz, ne tanımlıysa o kullanılır', () => {
  q(`create or replace function public.is_admin() returns boolean language sql stable as $$ select auth.uid() = ${lit(UYE)}::uuid $$`);
  reklamMigrationYenidenUygula();
  assert.equal(q('select public.is_admin()', uye), 't');
  assert.equal(q('select count(*) >= 0 from public.reklam_raporu(current_date, current_date)', uye), 't');
  assert.equal(q('select count(*) from public.reklamlar', uye) !== '', true);
  // 001'deki asıl tanıma geri döndür
  q(ISADMIN_TANIMI);
  assert.equal(q("select prosecdef from pg_proc where oid = 'public.is_admin()'::regprocedure"), 't');
  assert.match(hata('select * from public.reklam_raporu(current_date, current_date)', uye), /yalnızca yöneticiler/);
});

test('001 temel migration yoksa migration açık bir hatayla durur', () => {
  spawnSync('psql', [...baglanti, '-X', '-q', '-c', 'drop database if exists bos_vt'], { encoding: 'utf8' });
  spawnSync('psql', [...baglanti, '-X', '-q', '-c', 'create database bos_vt'], { encoding: 'utf8' });
  const bosBaglanti = baglanti.slice();
  const i = bosBaglanti.indexOf('-d');
  if (i >= 0) bosBaglanti[i + 1] = 'bos_vt';
  else bosBaglanti.push('-d', 'bos_vt');
  const r = spawnSync('psql', [...bosBaglanti, '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-f', MIGRATION], { encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /önce 001 temel migration uygulanmalı/);
  spawnSync('psql', [...baglanti, '-X', '-q', '-c', 'drop database bos_vt'], { encoding: 'utf8' });
});

test('maç silinince ona özel sponsorluk da silinir, genel sponsor kalır', () => {
  temizle();
  const mac = q("insert into public.maclar (rakip, tarih) values ('Silinecek', now()) returning id");
  reklamEkle({ firma_adi: 'Özel', alan: 'mac_sponsoru', mac_id: mac });
  reklamEkle({ firma_adi: 'Genel', alan: 'mac_sponsoru' });
  assert.equal(aktif('mac_sponsoru', mac), 'Özel');
  q(`delete from public.maclar where id = ${lit(mac)}`);
  assert.equal(aktif('mac_sponsoru', mac), 'Genel');
  assert.equal(q("select count(*) from public.reklamlar where firma_adi = 'Özel'"), '0');
  // bozuk maç kimliği hata fırlatmaz, genel sponsor gelir
  assert.equal(aktif('mac_sponsoru', 'bozuk-kimlik'), 'Genel');
});

// ---------------------------------------------------------------------------- 012: dakika sınırı (sayı şişirmeye karşı)
const istanbulBugun = () => q("select (now() at time zone 'Europe/Istanbul')::date");

test('dakika sınırı (012): bir reklama dakikada en fazla 120 gösterim; fazlası "sinir", saklanmaz, dakika işaretlenir', () => {
  temizle();
  q('delete from public.reklam_sinir_dakikalari');
  const id = reklamEkle({ firma_adi: 'Şişirilen' });
  const diger = reklamEkle({ firma_adi: 'Komşu', alan: 'haber_sonu' });
  // Tek işlemde 125 farklı "ziyaret" (her istekte yeni rastgele kimlik: IP tutulmadığı için ayırt edilemeyen saldırı)
  const sonuc = q(`select string_agg(s, ',') from (select s, count(*) from (select public.reklam_olay_kaydet(${lit(id)}, 'gosterim', gen_random_uuid(), 'ana_akis', null) s
    from generate_series(1, 125)) x group by s order by s) y(s0, n) cross join lateral (select s0 || '=' || n) z(s)`, anon);
  assert.equal(sonuc, 'kaydedildi=120,sinir=5');
  assert.equal(q(`select count(*) from public.reklam_olaylari where reklam_id = ${lit(id)}`), '120', 'fazlası saklanmaz');
  assert.equal(q(`select tur || ':' || reddedilen from public.reklam_sinir_dakikalari where reklam_id = ${lit(id)}`), 'gosterim:5');
  // Başka reklamın sınırı ayrı sayılır
  assert.equal(olay(diger, 'gosterim', uuid(), 'haber_sonu'), 'kaydedildi');
  // Sınırdayken bile aynı ziyaretin tekrarı "tekrar" (sınır sayısını artırmaz)
  const z = q(`select sayfa_ziyaret_id from public.reklam_olaylari where reklam_id = ${lit(id)} limit 1`);
  assert.equal(olay(id, 'gosterim', z), 'tekrar');
  assert.equal(q(`select reddedilen from public.reklam_sinir_dakikalari where reklam_id = ${lit(id)}`), '5');
  // Bir sonraki dakika: yeniden sayılır (olayları 2 dk geriye al)
  q(`update public.reklam_olaylari set created_at = now() - interval '2 minutes' where reklam_id = ${lit(id)}`);
  assert.equal(olay(id, 'gosterim', uuid()), 'kaydedildi');
});

test('dakika sınırı (012): bir reklama dakikada en fazla 30 tıklama; ziyaret başına 5 kuralı da sürer', () => {
  temizle();
  q('delete from public.reklam_sinir_dakikalari');
  const id = reklamEkle({ firma_adi: 'Tıklanan' });
  const sonuc = q(`select count(*) filter (where s = 'kaydedildi') || '/' || count(*) filter (where s = 'sinir')
    from (select public.reklam_olay_kaydet(${lit(id)}, 'tiklama', gen_random_uuid(), 'ana_akis', null, gen_random_uuid()) s from generate_series(1, 34)) x`, anon);
  assert.equal(sonuc, '30/4');
  assert.equal(q(`select count(*) from public.reklam_olaylari where reklam_id = ${lit(id)} and tur = 'tiklama'`), '30');
  assert.equal(q(`select tur || ':' || reddedilen from public.reklam_sinir_dakikalari where reklam_id = ${lit(id)}`), 'tiklama:4');
  // gösterim sınırı tıklamadan ayrı
  assert.equal(olay(id, 'gosterim', uuid()), 'kaydedildi');
});

test('rapor (012): "supheli_dakika" = aralıkta sınıra takılan dakika sayısı; yönetici dışına kapalı, kişisel veri yok', () => {
  temizle();
  q('delete from public.reklam_sinir_dakikalari');
  const a = reklamEkle({ firma_adi: 'Saldırıya Uğrayan' });
  const b = reklamEkle({ firma_adi: 'Sakin', alan: 'haber_sonu' });
  q(`select public.reklam_olay_kaydet(${lit(a)}, 'gosterim', gen_random_uuid(), 'ana_akis', null) from generate_series(1, 122)`, anon);
  q(`select public.reklam_olay_kaydet(${lit(a)}, 'tiklama', gen_random_uuid(), 'ana_akis', null) from generate_series(1, 31)`, anon);
  assert.equal(olay(b, 'gosterim', uuid(), 'haber_sonu'), 'kaydedildi');
  // aynı dakikada gösterim + tıklama sınırı = 1 dakika; önceki günden bir dakika daha (aralık dışı kalmalı)
  q(`insert into public.reklam_sinir_dakikalari (reklam_id, dakika, tur, reddedilen) values (${lit(a)}, date_trunc('minute', now()) - interval '3 day', 'gosterim', 9)`);
  const gun = istanbulBugun();
  const rapor = q(`select firma_adi || ';' || gosterim || ';' || tiklama || ';' || supheli_dakika from public.reklam_raporu(${lit(gun)}, ${lit(gun)})`, admin).split('\n');
  assert.ok(rapor.includes('Saldırıya Uğrayan;120;30;1'), rapor.join(' / '));
  assert.ok(rapor.includes('Sakin;1;0;0'), rapor.join(' / '));
  const genis = q(`select supheli_dakika from public.reklam_raporu((${lit(gun)}::date - 5), ${lit(gun)}) where firma_adi = 'Saldırıya Uğrayan'`, admin);
  assert.equal(genis, '2', 'beş günlük aralıkta iki ayrı dakika');
  assert.equal(q("select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns where table_schema='public' and table_name='reklam_sinir_dakikalari'"),
    'reklam_id,dakika,tur,reddedilen', 'kişisel veri sütunu yok');
  assert.equal(q('select count(*) from public.reklam_sinir_dakikalari', anon), '0');
  assert.equal(q('select count(*) from public.reklam_sinir_dakikalari', uye), '0');
  assert.notEqual(q('select count(*) from public.reklam_sinir_dakikalari', admin), '0');
  assert.match(hata(`insert into public.reklam_sinir_dakikalari (reklam_id, dakika, tur) values (${lit(a)}, now(), 'gosterim')`, anon), /permission denied/);
  assert.match(hata('delete from public.reklam_sinir_dakikalari', uye), /permission denied/);
});

test('dakika sınırları SQL ile JS (reklam-mantik.js SINIRLAR) aynı', async () => {
  const RM = await import(new URL('../../assets/reklam/reklam-mantik.js', import.meta.url).href);
  const govde = q("select prosrc from pg_proc where oid = 'public.reklam_olay_kaydet(uuid, text, uuid, text, text, uuid)'::regprocedure");
  const sabit = (ad) => Number((new RegExp(ad + ' constant int := (\\d+)').exec(govde) || [])[1]);
  assert.equal(sabit('c_gosterim_dakika_siniri'), RM.SINIRLAR.gosterimDakikaSiniri);
  assert.equal(sabit('c_tiklama_dakika_siniri'), RM.SINIRLAR.tiklamaDakikaSiniri);
  assert.equal(sabit('c_tiklama_siniri'), RM.SINIRLAR.ziyaretTiklamaSiniri);
});

// ---------------------------------------------------------------------------- 012: uygulama kuralları (kullanıcı adı, kapak) SQL = JS
test('uygulama kuralları SQL ile JS (assets/kurallar.js) aynı sonucu verir (ortak örnekler)', async () => {
  const K = await import(new URL('../../assets/kurallar.js', import.meta.url).href);
  const ORN = JSON.parse(readFileSync(path.join(KOK, 'testler', 'kurallar-ornekleri.json'), 'utf8'));
  for (const [ad, ayrilmis] of ORN.kullanici_adi) {
    assert.equal(q(`select public.kullanici_adi_ayrilmis(${lit(ad)})`), ayrilmis ? 't' : 'f', 'SQL: ' + ad);
    assert.equal(K.kullaniciAdiAyrilmis(ad), ayrilmis, 'JS: ' + ad);
  }
  for (const [url, gecerli] of ORN.kapak) {
    assert.equal(q(`select public.haber_kapak_gecerli(${lit(url)})`), gecerli ? 't' : 'f', 'SQL: ' + url);
    assert.equal(K.kapakAdresiGecerli(url), gecerli, 'JS: ' + url);
  }
  // yorum sınırları: SQL tetikleyicilerindeki sabitler = YORUM_SINIRLARI
  const ekle = q("select prosrc from pg_proc where oid = 'public.yorum_ekleme_kontrol()'::regprocedure");
  const duz = q("select prosrc from pg_proc where oid = 'public.yorum_duzenleme_hakki()'::regprocedure");
  const gun = q("select prosrc from pg_proc where oid = 'public.yorum_guncelleme_kontrol()'::regprocedure");
  const sabit = (g, ad) => Number((new RegExp(ad + " constant (?:int|interval) := (?:interval ')?(\\d+)").exec(g) || [])[1]);
  assert.equal(sabit(ekle, 'c_dakika_siniri'), K.YORUM_SINIRLARI.dakikada);
  assert.equal(sabit(ekle, 'c_gun_siniri'), K.YORUM_SINIRLARI.gunde);
  assert.equal(sabit(ekle, 'c_tekrar_suresi'), K.YORUM_SINIRLARI.tekrarDakika);
  assert.equal(sabit(duz, 'c_dakika_siniri'), K.YORUM_SINIRLARI.duzenlemeDakikada);
  assert.equal(sabit(gun, 'c_duzenleme_suresi'), K.YORUM_SINIRLARI.duzenlemeSuresiDakika);
});

// ---------------------------------------------------------------------------- 013: yönetici sayılmaz, akışta farklı firmalar
test('013: yöneticinin gösterim/tıklaması sayılmaz (reklam_olay_kaydet "yonetici" döner, olay yazılmaz)', () => {
  temizle();
  const id = reklamEkle({ firma_adi: 'Sayım Firma' });
  const z = uuid();
  assert.equal(olay(id, 'gosterim', z, 'ana_akis', null, admin), 'yonetici');
  assert.equal(olay(id, 'tiklama', z, 'ana_akis', null, admin, uuid()), 'yonetici');
  assert.equal(q(`select count(*) from public.reklam_olaylari where reklam_id = ${lit(id)}`), '0');
  assert.equal(olay(id, 'gosterim', z, 'ana_akis', null, anon), 'kaydedildi');
  assert.equal(olay(id, 'gosterim', uuid(), 'ana_akis', null, uye), 'kaydedildi');
  assert.equal(q(`select count(*) from public.reklam_olaylari where reklam_id = ${lit(id)}`), '2');
  // geçersiz istek yönetici için de hata (önce doğrulama)
  assert.match(hata(`select public.reklam_olay_kaydet(${lit(id)}, 'gosterim', gen_random_uuid(), 'haber_sonu', null)`, admin), /bu alanda/);
  const govde = q("select prosrc from pg_proc where oid = 'public.reklam_olay_kaydet(uuid, text, uuid, text, text, uuid)'::regprocedure");
  assert.match(govde, /if public\.is_admin\(\) then\s+return 'yonetici';/);
});

test('013: aktif_reklamlar akışta aynı firmayı bir kez verir (farklı firma yoksa ikinci yuva boş kalır)', () => {
  temizle();
  reklamEkle({ firma_adi: 'Narçil Cafe', oncelik: 50 });
  reklamEkle({ firma_adi: 'narçil cafe ', oncelik: 40 });
  assert.equal(q(`select string_agg(firma_adi, ',') from public.aktif_reklamlar('ana_akis', 5)`, anon), 'Narçil Cafe');
  reklamEkle({ firma_adi: 'Hitit Optik', oncelik: 10 });
  reklamEkle({ firma_adi: 'Taslak Firma', durum: 'taslak', oncelik: 99 });
  assert.equal(q(`select string_agg(firma_adi, ',') from public.aktif_reklamlar('ana_akis', 5)`, anon), 'Narçil Cafe,Hitit Optik');
  assert.equal(q(`select count(*) from public.aktif_reklamlar('ana_akis', 1)`, anon), '1');
  assert.equal(q(`select count(*) from public.aktif_reklamlar('mac_sponsoru', 5)`, anon), '0');
  assert.equal(q("select prosecdef from pg_proc where oid = 'public.aktif_reklamlar(text, integer)'::regprocedure"), 't');
});

test('013: reklam yeni alanları (düğme yazısı 2-24, "Ara" +90…, görsel metni ≤200, küçük görsel depodan) SQL kısıtları', () => {
  temizle();
  const id = reklamEkle({ firma_adi: 'Alanlı' });
  q(`update public.reklamlar set dugme_metni = 'Menüyü gör', telefon = '+903642131919', gorsel_metni = 'Kahve', gorsel_kucuk_url = ${lit(GORSEL.replace('.png', '-k.webp'))}, sektor_onayi = true where id = ${lit(id)}`, admin);
  assert.equal(q(`select dugme_metni || '|' || telefon from public.aktif_reklam('ana_akis')`, anon), 'Menüyü gör|+903642131919');
  assert.match(hata(`update public.reklamlar set dugme_metni = 'x' where id = ${lit(id)}`, admin), /reklamlar_dugme_metni/);
  assert.match(hata(`update public.reklamlar set telefon = 'tel:123' where id = ${lit(id)}`, admin), /reklamlar_telefon/);
  assert.match(hata(`update public.reklamlar set gorsel_metni = repeat('x', 201) where id = ${lit(id)}`, admin), /reklamlar_gorsel_metni/);
  assert.match(hata(`update public.reklamlar set gorsel_kucuk_url = 'https://baska.com/x.png' where id = ${lit(id)}`, admin), /reklamlar_gorsel_kucuk/);
});
