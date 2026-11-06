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
    baslangic: "now() - interval '1 day'", bitis: "now() + interval '1 day'", durum: 'yayinda', oncelik: 0, sektor_onayi: true, ...o,
  };
  const ifade = (k, v) => (['baslangic', 'bitis'].includes(k) && typeof v === 'string' && /now\(\)/.test(v) ? v : lit(v));
  const sutunlar = Object.keys(r);
  return q(`insert into public.reklamlar (${sutunlar.join(',')}) values (${sutunlar.map((k) => ifade(k, r[k])).join(',')}) returning id`, ops);
}
const aktif = (alan, mac = null, ops = anon) => q(`select coalesce((select firma_adi from public.aktif_reklam(${lit(alan)}, ${lit(mac)})), '-')`, ops);
const olay = (id, tur, ziyaret, alan = 'ana_akis', mac = null, ops = anon, sekme = null, eylem = null) =>
  q(`select public.reklam_olay_kaydet(${lit(id)}, ${lit(tur)}, ${lit(ziyaret)}, ${lit(alan)}, ${lit(mac)}, ${lit(sekme)}, ${lit(eylem)})`, ops);
const GORSEL = 'https://abc.supabase.co/storage/v1/object/public/reklam-gorselleri/2026/11/x.png';
let ISADMIN_TANIMI = ''; // 001'deki asıl is_admin() (bir testte değiştirilip geri yüklenir)
const temizle = () => q('delete from public.reklam_olaylari; delete from public.reklam_yerlesimleri; delete from public.reklam_sekme_sayaclari; delete from public.reklam_gunluk; delete from public.reklam_gunluk_toplanan; delete from public.reklamlar;');
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

test('gerçek 001 şeması: profiles/is_admin/maclar uygulamanınki, taklit değil; migration sırası 001 → 002 → 010 → 011 → 012 → 013 → 014 → 015', () => {
  assert.deepEqual(MIGRATIONLAR.map((d) => path.basename(d)), ['001_temel_sema.sql', '002_depolama.sql', '010_reklamlar.sql', '011_denetim_duzeltmeleri.sql', '012_denetim_2.sql', '013_tasarim.sql', '014_inceleme_2.sql', '015_son_tur.sql', '016_mac_ozeti.sql', '017_yanit_profil_foto.sql', '018_gol_ani_asist.sql']);
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
    assert.match(hata(`insert into public.reklamlar (firma_adi, gorsel_url, kisa_metin, alan, baslangic, bitis, durum, sektor_onayi)
      values ('Sahte', ${lit(GORSEL)}, 'x', 'ana_akis', now(), now() + interval '1 day', 'yayinda', true)`, ops), /row-level security/);
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
  q(`update public.reklamlar set durum = 'yayinda', kisa_metin = 'güncel', sektor_onayi = true where id = ${lit(id)}`, admin);
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
    'id,reklam_id,tur,sayfa_ziyaret_id,alan,mac_id,created_at,sekme_id,eylem');
});

test('tıklama: aynı reklama aynı ziyarette 30 dk içinde tekrar tıklama sayılmaz, ziyaret başına en fazla 5 tıklama', () => {
  temizle();
  // 014: yalnız o an GÖSTERİLEN reklama olay yazılır: akışta 3 farklı firma + haber sonu + iki maçın sponsoru = 6 gösterilen reklam
  const idler = [
    reklamEkle({ firma_adi: 'F1', oncelik: 3 }), reklamEkle({ firma_adi: 'F2', oncelik: 2 }), reklamEkle({ firma_adi: 'F3', oncelik: 1 }),
    reklamEkle({ firma_adi: 'F4', alan: 'haber_sonu' }),
    reklamEkle({ firma_adi: 'F5', alan: 'mac_sponsoru', mac_id: MAC1 }), reklamEkle({ firma_adi: 'F6', alan: 'mac_sponsoru', mac_id: MAC2 }),
  ];
  const yer = [['ana_akis', null], ['ana_akis', null], ['ana_akis', null], ['haber_sonu', null], ['mac_sponsoru', MAC1], ['mac_sponsoru', MAC2]];
  const tik = (i, z) => olay(idler[i], 'tiklama', z, yer[i][0], yer[i][1]);
  const z = uuid();
  assert.equal(tik(0, z), 'kaydedildi');
  assert.equal(tik(0, z), 'tekrar');
  // 29 dakika önce tıklanmış gibi yap: hâlâ tekrar
  q(`update public.reklam_olaylari set created_at = now() - interval '29 minutes' where sayfa_ziyaret_id = ${lit(z)}`);
  assert.equal(tik(0, z), 'tekrar');
  // 31 dakika geçti: yeni tıklama sayılır
  q(`update public.reklam_olaylari set created_at = now() - interval '31 minutes' where sayfa_ziyaret_id = ${lit(z)}`);
  assert.equal(tik(0, z), 'kaydedildi');
  assert.equal(q(`select count(*) from public.reklam_olaylari where sayfa_ziyaret_id = ${lit(z)} and reklam_id = ${lit(idler[0])}`), '2');
  // başka ziyaret aynı reklamı hemen sayabilir
  assert.equal(tik(0, uuid()), 'kaydedildi');
  // ziyaret başına sınır: z'de 2 tıklama var, 3 farklı reklam daha = 5, altıncı reddedilir
  for (const i of [1, 2, 3]) assert.equal(tik(i, z), 'kaydedildi');
  assert.equal(tik(4, z), 'sinir');
  assert.equal(tik(5, z), 'sinir');
  assert.equal(q(`select count(*) from public.reklam_olaylari where sayfa_ziyaret_id = ${lit(z)} and tur = 'tiklama'`), '5');
  assert.equal(tik(5, uuid()), 'kaydedildi');
  // gösterim tıklama sınırına takılmaz
  assert.equal(olay(idler[5], 'gosterim', z, 'mac_sponsoru', MAC2), 'kaydedildi');
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
  // 014: sırada bekleyen (gösterilmeyen) reklama olay yazılmaz: haber sonunda kaybeden, akışta 4. firma
  const hs1 = reklamEkle({ firma_adi: 'HS Büyük', alan: 'haber_sonu', oncelik: 9 });
  const hs2 = reklamEkle({ firma_adi: 'HS Küçük', alan: 'haber_sonu', oncelik: 1 });
  assert.equal(olay(hs1, 'gosterim', uuid(), 'haber_sonu'), 'kaydedildi');
  assert.match(hata(`select public.reklam_olay_kaydet(${lit(hs2)}, 'gosterim', gen_random_uuid(), 'haber_sonu', null)`, anon), /sırada bekliyor/);
  for (const [f, o] of [['A2', 8], ['A3', 7]]) reklamEkle({ firma_adi: f, oncelik: o });
  const dorduncu = reklamEkle({ firma_adi: 'A4 Sırada', oncelik: 0 });
  q(`update public.reklamlar set oncelik = 9 where id = ${lit(canli)}`, admin);
  assert.match(hata(`select public.reklam_olay_kaydet(${lit(dorduncu)}, 'tiklama', gen_random_uuid(), 'ana_akis', null, null, 'web')`, anon), /sırada bekliyor/);
  q(`delete from public.reklamlar where id in (${lit(hs1)}, ${lit(hs2)}, ${lit(dorduncu)}) or firma_adi in ('A2', 'A3')`, admin);
  q('delete from public.reklam_olaylari');
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

test('dakika sınırı (015): bir reklama dakikada en fazla 120 gösterim; fazlası "sinir", saklanmaz, dakika işaretlenir', () => {
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

test('dakika sınırı (015): bir reklama dakikada en fazla 20 tıklama; ziyaret başına 5 kuralı da sürer', () => {
  temizle();
  q('delete from public.reklam_sinir_dakikalari');
  const id = reklamEkle({ firma_adi: 'Tıklanan' });
  const sonuc = q(`select count(*) filter (where s = 'kaydedildi') || '/' || count(*) filter (where s = 'sinir')
    from (select public.reklam_olay_kaydet(${lit(id)}, 'tiklama', gen_random_uuid(), 'ana_akis', null, gen_random_uuid()) s from generate_series(1, 24)) x`, anon);
  assert.equal(sonuc, '20/4');
  assert.equal(q(`select count(*) from public.reklam_olaylari where reklam_id = ${lit(id)} and tur = 'tiklama'`), '20');
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
  q(`select public.reklam_olay_kaydet(${lit(a)}, 'tiklama', gen_random_uuid(), 'ana_akis', null) from generate_series(1, 21)`, anon);
  assert.equal(olay(b, 'gosterim', uuid(), 'haber_sonu'), 'kaydedildi');
  // aynı dakikada gösterim + tıklama sınırı = 1 dakika; önceki günden bir dakika daha (aralık dışı kalmalı)
  q(`insert into public.reklam_sinir_dakikalari (reklam_id, dakika, tur, reddedilen) values (${lit(a)}, date_trunc('minute', now()) - interval '3 day', 'gosterim', 9)`);
  const gun = istanbulBugun();
  const rapor = q(`select firma_adi || ';' || gosterim || ';' || tiklama || ';' || supheli_dakika from public.reklam_raporu(${lit(gun)}, ${lit(gun)})`, admin).split('\n');
  assert.ok(rapor.includes('Saldırıya Uğrayan;120;20;1'), rapor.join(' / '));
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
  const govde = q("select prosrc from pg_proc where oid = 'public.reklam_olay_kaydet(uuid, text, uuid, text, text, uuid, text)'::regprocedure");
  const sabit = (ad) => Number((new RegExp(ad + ' constant int := (\\d+)').exec(govde) || [])[1]);
  assert.equal(sabit('c_gosterim_dakika_siniri'), RM.SINIRLAR.gosterimDakikaSiniri);
  assert.equal(sabit('c_tiklama_dakika_siniri'), RM.SINIRLAR.tiklamaDakikaSiniri);
  assert.equal(sabit('c_tiklama_siniri'), RM.SINIRLAR.ziyaretTiklamaSiniri);
  assert.equal(sabit('c_yerlesim_dakika_siniri'), RM.SINIRLAR.yerlesimDakikaSiniri);
  assert.equal(sabit('c_sekme_saat_gosterim'), RM.SINIRLAR.sekmeSaatGosterimSiniri);
  assert.equal(sabit('c_sekme_saat_tiklama'), RM.SINIRLAR.sekmeSaatTiklamaSiniri);
  // 015: ham satır alarmı eşiği
  const alarm = q("select prosrc from pg_proc where oid = 'public.reklam_ham_satir_alarmi(integer)'::regprocedure");
  assert.equal(Number((/c_ham_satir_esigi constant int := (\d+)/.exec(alarm) || [])[1]), RM.SINIRLAR.hamSatirAlarmi);
  assert.match(q("select prosrc from pg_proc where oid = 'public.reklam_su_an_gosterilen(uuid, text, text)'::regprocedure"), new RegExp(`aktif_reklamlar\\(p_alan, ${RM.SINIRLAR.akisYuvaSayisi}\\)`));
});

// ---------------------------------------------------------------------------- 012: uygulama kuralları (kullanıcı adı, kapak) SQL = JS
test('uygulama kuralları SQL ile JS (assets/kurallar.js) aynı sonucu verir (ortak örnekler)', async () => {
  const K = await import(new URL('../../assets/kurallar.js', import.meta.url).href);
  const AYAR = await import(new URL('../../assets/ayar.js', import.meta.url).href);
  const ORN = JSON.parse(readFileSync(path.join(KOK, 'testler', 'kurallar-ornekleri.json'), 'utf8'));
  // 015: uygulama sahibinin adı (README "Künye": SAHIP_ADI ayrilmis_adlar'a eklenir); anahtarı SQL = JS
  q(`delete from public.ayrilmis_adlar; insert into public.ayrilmis_adlar (ad) values (${lit(AYAR.SAHIP_ADI)})`);
  assert.deepEqual(q('select anahtar from public.ayrilmis_adlar').split('\n'), [...K.SAHIP_ANAHTARLARI]);
  assert.equal(q(`select public.ayrilmis_ad_anahtari(${lit('  İsmail (sahip) Çağrı ')})`), K.sahipAnahtari('  İsmail (sahip) Çağrı '));
  for (const [ad, ayrilmis] of ORN.kullanici_adi) {
    assert.equal(q(`select public.kullanici_adi_ayrilmis(${lit(ad)})`), ayrilmis ? 't' : 'f', 'SQL: ' + ad);
    assert.equal(K.kullaniciAdiAyrilmis(ad), ayrilmis, 'JS: ' + ad);
  }
  for (const [url, gecerli] of ORN.kapak) {
    assert.equal(q(`select public.haber_kapak_gecerli(${lit(url)})`), gecerli ? 't' : 'f', 'SQL: ' + url);
    assert.equal(K.kapakAdresiGecerli(url), gecerli, 'JS: ' + url);
  }
  // 014: gol videosu / altyazı adresi, metin katlama, yorum kelime listesi
  for (const [url, gecerli] of ORN.gol_video) {
    assert.equal(q(`select public.gol_video_gecerli(${lit(url)})`), gecerli ? 't' : 'f', 'SQL: ' + url);
    assert.equal(K.golVideoGecerli(url), gecerli, 'JS: ' + url);
  }
  for (const [url, gecerli] of ORN.altyazi) {
    assert.equal(q(`select public.gol_altyazi_gecerli(${lit(url)})`), gecerli ? 't' : 'f', 'SQL: ' + url);
    assert.equal(K.altyaziAdresiGecerli(url), gecerli, 'JS: ' + url);
  }
  for (const [girdi, beklenen] of ORN.metin_katla) {
    assert.equal(q(`select public.metin_katla(${lit(girdi)})`), beklenen, 'SQL: ' + girdi);
    assert.equal(K.metinKatla(girdi), beklenen, 'JS: ' + girdi);
  }
  for (const [metin, liste, bekler] of ORN.yorum_kelime) {
    q('delete from public.yorum_kelimeleri');
    for (const k of liste) q(`insert into public.yorum_kelimeleri (kelime) values (${lit(k)})`);
    assert.equal(q(`select public.yorum_onay_gerekli(${lit(metin)}, null, null)`), bekler ? 't' : 'f', 'SQL: ' + metin);
    assert.equal(K.kelimeEslesir(metin, liste), bekler, 'JS: ' + metin);
    assert.equal(q(`select public.yorum_katla(${lit(metin)})`), K.yorumKatla(metin), 'katla: ' + metin);
    assert.equal(q(`select public.yorum_sikistir(${lit(metin)})`), K.yorumSikistir(metin), 'sıkıştır: ' + metin);
  }
  q('delete from public.yorum_kelimeleri; delete from public.ayrilmis_adlar;');
  // 015: şikâyet sınırları SQL = JS
  const sik = q("select prosrc from pg_proc where oid = 'public.sikayet_hakki()'::regprocedure");
  const gizle = q("select prosrc from pg_proc where oid = 'public.sikayet_otomatik_gizle()'::regprocedure");
  assert.equal(Number((/c_saat_siniri constant int := (\d+)/.exec(sik) || [])[1]), K.SIKAYET_SINIRLARI.saatte);
  assert.equal(Number((/c_gun_siniri constant int := (\d+)/.exec(sik) || [])[1]), K.SIKAYET_SINIRLARI.gunde);
  assert.equal(Number((/c_esik constant int := (\d+)/.exec(gizle) || [])[1]), K.SIKAYET_SINIRLARI.otomatikGizlemeEsigi);
  assert.equal(Number((/c_hesap_yasi constant interval := interval '(\d+) hours'/.exec(gizle) || [])[1]), K.SIKAYET_SINIRLARI.hesapYasiSaat);
  assert.match(q("select prosrc from pg_proc where oid = 'public.profil_koruma()'::regprocedure"), new RegExp(`interval '${K.AD_DEGISTIRME_GUN} days'`));
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
  const govde = q("select prosrc from pg_proc where oid = 'public.reklam_olay_kaydet(uuid, text, uuid, text, text, uuid, text)'::regprocedure");
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
  // 014: telefon/görsel değişince yasaklı sektör onayı yeniden istenir (sektor_onay_zamani değişince = yeniden onay)
  q(`update public.reklamlar set dugme_metni = 'Menüyü gör', telefon = '+903642131919', gorsel_metni = 'Kahve', gorsel_kucuk_url = ${lit(GORSEL.replace('.png', '-k.webp'))}, sektor_onayi = true, sektor_onay_zamani = '2000-01-01' where id = ${lit(id)}`, admin);
  assert.equal(q(`select dugme_metni || '|' || telefon from public.aktif_reklam('ana_akis')`, anon), 'Menüyü gör|+903642131919');
  assert.match(hata(`update public.reklamlar set dugme_metni = 'x', sektor_onay_zamani = '2001-01-01' where id = ${lit(id)}`, admin), /reklamlar_dugme_metni/);
  assert.match(hata(`update public.reklamlar set telefon = 'tel:123', sektor_onay_zamani = '2001-01-01' where id = ${lit(id)}`, admin), /reklamlar_telefon/);
  assert.match(hata(`update public.reklamlar set gorsel_metni = repeat('x', 201), sektor_onay_zamani = '2001-01-01' where id = ${lit(id)}`, admin), /reklamlar_gorsel_metni/);
  assert.match(hata(`update public.reklamlar set gorsel_kucuk_url = 'https://baska.com/x.png', sektor_onay_zamani = '2001-01-01' where id = ${lit(id)}`, admin), /reklamlar_gorsel_kucuk/);
});

// ---------------------------------------------------------------------------- 014: 2. tur inceleme
test('014: tıklama eylemi (web / whatsapp / ara) ayrı sayılır; tekrar kuralı reklam + eylem bazında', () => {
  temizle();
  const id = reklamEkle({ firma_adi: 'Kale Oto' });
  const [z, sekme] = [uuid(), uuid()];
  assert.equal(olay(id, 'tiklama', z, 'ana_akis', null, anon, sekme, 'whatsapp'), 'kaydedildi');
  assert.equal(olay(id, 'tiklama', z, 'ana_akis', null, anon, sekme, 'ara'), 'kaydedildi', 'WhatsApp\'tan sonra "Ara" da sayılır');
  assert.equal(olay(id, 'tiklama', uuid(), 'ana_akis', null, anon, sekme, 'whatsapp'), 'tekrar', 'aynı sekmede aynı düğme 30 dk içinde sayılmaz');
  assert.equal(olay(id, 'tiklama', z, 'ana_akis', null, anon, sekme, 'web'), 'kaydedildi');
  assert.equal(q(`select string_agg(eylem, ',' order by eylem) from public.reklam_olaylari where reklam_id = ${lit(id)}`), 'ara,web,whatsapp');
  assert.match(hata(`select public.reklam_olay_kaydet(${lit(id)}, 'tiklama', gen_random_uuid(), 'ana_akis', null, null, 'sms')`, anon), /eylemi/);
  // gösterimde eylem yok sayılır
  assert.equal(olay(id, 'gosterim', z, 'ana_akis', null, anon, sekme, 'web'), 'kaydedildi');
  assert.equal(q(`select count(*) from public.reklam_olaylari where reklam_id = ${lit(id)} and tur = 'gosterim' and eylem is null`), '1');
  const gun = istanbulBugun();
  assert.equal(q(`select tiklama || ';' || tiklama_web || ';' || tiklama_whatsapp || ';' || tiklama_ara from public.reklam_raporu(${lit(gun)}, ${lit(gun)})`, admin), '3;1;1;1');
});

test('014: sekme başına saatlik sınır (gösterim reklam başına 20, tıklama toplam 10); fazlası şüpheli dakika', () => {
  temizle();
  q('delete from public.reklam_sinir_dakikalari');
  const sekme = uuid();
  const a = reklamEkle({ firma_adi: 'A', oncelik: 3 });
  const sonuc = q(`select string_agg(s, ',') from (select s, count(*) from (select public.reklam_olay_kaydet(${lit(a)}, 'gosterim', gen_random_uuid(), 'ana_akis', null, ${lit(sekme)}) s
    from generate_series(1, 22)) x group by s order by s) y(s0, n) cross join lateral (select s0 || '=' || n) z(s)`, anon);
  assert.equal(sonuc, 'kaydedildi=20,sinir=2');
  assert.equal(q(`select tur || ':' || reddedilen from public.reklam_sinir_dakikalari where reklam_id = ${lit(a)}`), 'gosterim:2');
  assert.equal(olay(a, 'gosterim', uuid(), 'ana_akis', null, anon, uuid()), 'kaydedildi', 'başka sekme sayılır');
  // tıklama: 4 gösterilen reklam × 3 düğme = 12 farklı tıklama, aynı sekmeden; 10'dan sonrası sınır
  const b = reklamEkle({ firma_adi: 'B', oncelik: 2 });
  const c = reklamEkle({ firma_adi: 'C', oncelik: 1 });
  const h = reklamEkle({ firma_adi: 'H', alan: 'haber_sonu' });
  const s2 = uuid();
  const sonuclar = [];
  for (const [id, alan] of [[a, 'ana_akis'], [b, 'ana_akis'], [c, 'ana_akis'], [h, 'haber_sonu']]) {
    for (const e of ['web', 'whatsapp', 'ara']) sonuclar.push(olay(id, 'tiklama', uuid(), alan, null, anon, s2, e));
  }
  assert.equal(sonuclar.filter((x) => x === 'kaydedildi').length, 10, sonuclar.join(','));
  assert.equal(sonuclar.filter((x) => x === 'sinir').length, 2);
  assert.equal(q("select count(*) from public.reklam_sinir_dakikalari where tur = 'tiklama'"), '1');
  // sekme sayaçları olaylara bağlanmaz ve kimse okuyamaz
  assert.match(hata('select * from public.reklam_sekme_sayaclari', anon), /permission denied/);
  assert.match(hata('select * from public.reklam_sekme_sayaclari', admin), /permission denied/);
  assert.equal(q(`select count(*) from public.reklam_olaylari where tur = 'gosterim' and sekme_id is not null`), '0', 'gösterimde sekme kimliği saklanmaz');
});

test('014: yerleşim (görünürlük paydası): sayfa ziyareti başına bir; rapor görünürlük oranı; yönetici sayılmaz', () => {
  temizle();
  const id = reklamEkle({ firma_adi: 'Görünen' });
  const [z1, z2, z3] = [uuid(), uuid(), uuid()];
  for (const z of [z1, z2, z3]) assert.equal(olay(id, 'yerlesim', z), 'kaydedildi');
  assert.equal(olay(id, 'yerlesim', z1), 'tekrar');
  assert.equal(olay(id, 'yerlesim', uuid(), 'ana_akis', null, admin), 'yonetici');
  assert.equal(olay(id, 'gosterim', z1), 'kaydedildi');
  assert.equal(olay(id, 'gosterim', z2), 'kaydedildi');
  const gun = istanbulBugun();
  assert.equal(q(`select yerlesim || ';' || gosterim || ';' || gorunurluk_orani from public.reklam_raporu(${lit(gun)}, ${lit(gun)})`, admin), '3;2;66.67');
  assert.match(hata('select count(*) from public.reklam_yerlesimleri', anon), /permission denied/);
  assert.equal(q('select count(*) from public.reklam_yerlesimleri', uye), '0');
  assert.match(hata(`insert into public.reklam_yerlesimleri (reklam_id, sayfa_ziyaret_id, alan) values (${lit(id)}, gen_random_uuid(), 'ana_akis')`, anon), /permission denied|row-level/);
  assert.equal(q("select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns where table_schema='public' and table_name='reklam_yerlesimleri'"),
    'id,reklam_id,sayfa_ziyaret_id,alan,mac_id,created_at', 'kişisel veri sütunu yok');
});

test('014: günlük toplam + 90 gün saklama: bakım eski günleri toplar ve ham olayı siler, rapor çift saymaz', () => {
  temizle();
  q('delete from public.reklam_sinir_dakikalari');
  const id = reklamEkle({ firma_adi: 'Eski Müşteri', baslangic: "now() - interval '200 day'", bitis: "now() + interval '1 day'" });
  // 100 gün önce (TSİ öğlen) 4 gösterim + 1 web tıklaması, 2 gün önce 3 gösterim + 2 yerleşim, bugün 1 gösterim
  q(`insert into public.reklam_olaylari (reklam_id, tur, sayfa_ziyaret_id, alan, created_at, eylem)
       select ${lit(id)}::uuid, 'gosterim'::public.reklam_olay_turu, gen_random_uuid(), 'ana_akis'::public.reklam_alani, ((now() at time zone 'Europe/Istanbul')::date - 100 + time '12:00') at time zone 'Europe/Istanbul', null::text from generate_series(1, 4)
       union all select ${lit(id)}::uuid, 'tiklama'::public.reklam_olay_turu, gen_random_uuid(), 'ana_akis', ((now() at time zone 'Europe/Istanbul')::date - 100 + time '12:05') at time zone 'Europe/Istanbul', 'web'
       union all select ${lit(id)}::uuid, 'gosterim'::public.reklam_olay_turu, gen_random_uuid(), 'ana_akis'::public.reklam_alani, ((now() at time zone 'Europe/Istanbul')::date - 2 + time '12:00') at time zone 'Europe/Istanbul', null from generate_series(1, 3);
     insert into public.reklam_olaylari (reklam_id, tur, sayfa_ziyaret_id, alan, created_at, sekme_id)
       values (${lit(id)}, 'tiklama', gen_random_uuid(), 'ana_akis', now() - interval '2 day', gen_random_uuid());
     insert into public.reklam_yerlesimleri (reklam_id, sayfa_ziyaret_id, alan, created_at)
       select ${lit(id)}::uuid, gen_random_uuid(), 'ana_akis', ((now() at time zone 'Europe/Istanbul')::date - 2 + time '12:00') at time zone 'Europe/Istanbul' from generate_series(1, 2);`);
  assert.equal(olay(id, 'gosterim', uuid()), 'kaydedildi');
  const gun = istanbulBugun();
  const rapor = (gunOnce, son = gunOnce) => q(`select gosterim || ';' || tiklama || ';' || tiklama_web || ';' || yerlesim from public.reklam_raporu((${lit(gun)}::date - ${gunOnce}), (${lit(gun)}::date - ${son}))`, admin);
  const once = [rapor(100), rapor(2), rapor(0), rapor(120, 0)];
  assert.deepEqual(once, ['4;1;1;0', '3;1;0;2', '1;0;0;0', '8;2;1;2']);
  // bakım yalnız sahibine (postgres / pg_cron): ziyaretçi ve yönetici çağıramaz
  assert.match(hata('select public.reklam_bakim()', anon), /permission denied/);
  assert.match(hata('select public.reklam_bakim()', admin), /permission denied/);
  assert.match(hata('select public.reklam_bakim(3)'), /en az 7 gün/);
  assert.match(q('select public.reklam_bakim()'), /toplanan gün: 2, silinen olay: 5, silinen yerleşim: 0/);
  assert.equal(q(`select count(*) from public.reklam_olaylari where reklam_id = ${lit(id)}`), '5', '100 günlük ham olaylar silindi, son günler duruyor');
  assert.equal(q(`select count(*) from public.reklam_olaylari where sekme_id is not null`), '0', '1 günden eski tıklamada sekme kimliği boşaltıldı');
  assert.deepEqual([rapor(100), rapor(2), rapor(0), rapor(120, 0)], once, 'rapor toplamdan okur, çift saymaz');
  assert.equal(q(`select tur || ':' || eylem || ':' || sayi from public.reklam_gunluk where gun = ${lit(gun)}::date - 100 order by tur`), 'gosterim::4\ntiklama:web:1\ntiklayan::1');
  // ikinci bakım: toplanacak yeni gün yok, aynı sonuç
  assert.match(q('select public.reklam_bakim()'), /toplanan gün: 0, silinen olay: 0/);
  assert.equal(rapor(120, 0), '8;2;1;2');
  assert.match(hata('select count(*) from public.reklam_gunluk', anon), /permission denied/);
  assert.equal(q('select count(*) from public.reklam_gunluk', uye), '0');
  assert.notEqual(q('select count(*) from public.reklam_gunluk', admin), '0');
});

test('014: günlük rapor (TSİ günü, maç günü işaretli) ve rapor dönemi yayınla kesişen kısım', () => {
  temizle();
  const gun = istanbulBugun();
  const id = reklamEkle({ firma_adi: 'Haftalık' });
  q(`update public.reklamlar set baslangic = (${lit(gun)}::date - 3)::timestamp at time zone 'Europe/Istanbul', bitis = (${lit(gun)}::date + 4)::timestamp at time zone 'Europe/Istanbul' where id = ${lit(id)}`, admin);
  const mac = q(`insert into public.maclar (rakip, tarih) values ('Gün Testi', ((${lit(gun)}::date - 1) + time '19:00') at time zone 'Europe/Istanbul') returning id`);
  q(`insert into public.reklam_olaylari (reklam_id, tur, sayfa_ziyaret_id, alan, created_at)
       select ${lit(id)}::uuid, 'gosterim'::public.reklam_olay_turu, gen_random_uuid(), 'ana_akis'::public.reklam_alani, ((${lit(gun)}::date - 1) + time '20:00') at time zone 'Europe/Istanbul' from generate_series(1, 5)
       union all select ${lit(id)}::uuid, 'gosterim'::public.reklam_olay_turu, gen_random_uuid(), 'ana_akis'::public.reklam_alani, ((${lit(gun)}::date - 2) + time '23:30') at time zone 'Europe/Istanbul' from generate_series(1, 2)`);
  const satir = q(`select gun || ';' || mac_gunu || ';' || gosterim from public.reklam_gunluk_raporu((${lit(gun)}::date - 30), ${lit(gun)})`, admin).split('\n');
  assert.deepEqual(satir.map((s) => s.split(';').slice(1).join(';')), ['false;2', 'true;5']);
  // dönem: istenen ay yerine yayınla kesişen günler, BUGÜNÜ aşmaz (015); yayın günü ve günlük ortalama
  const r = q(`select donem_baslangic || ';' || donem_bitis || ';' || yayin_gun || ';' || gunluk_ortalama_gosterim || ';' || devam_ediyor from public.reklam_raporu((${lit(gun)}::date - 30), (${lit(gun)}::date + 30))`, admin);
  const [db, ds, g, ort, devam] = r.split(';');
  assert.equal(q(`select (${lit(db)}::date = ${lit(gun)}::date - 3)::text || (${lit(ds)}::date = ${lit(gun)}::date)::text`), 'truetrue', r);
  assert.equal(g, '4');
  assert.equal(ort, '1.8');
  assert.equal(devam, 'true');
  assert.match(hata(`select * from public.reklam_gunluk_raporu(current_date, current_date)`, uye), /yalnızca yöneticiler/);
  assert.match(hata(`select * from public.reklam_gunluk_raporu(current_date, current_date)`, anon), /permission denied/);
  q(`delete from public.maclar where id = ${lit(mac)}`);
});

test('014: ortak firma anahtarı: SQL = JS, akışta "NARÇIL CAFE" ve "Narçil Cafe" tek firma, rapor aynı anahtarı verir', async () => {
  const RM = await import(new URL('../../assets/reklam/reklam-mantik.js', import.meta.url).href);
  for (const [girdi, beklenen] of ORNEK.firma_anahtari) {
    assert.equal(q(`select public.firma_anahtari(${lit(girdi)})`), beklenen, 'SQL: ' + girdi);
    assert.equal(RM.firmaAnahtari(girdi), beklenen, 'JS: ' + girdi);
  }
  temizle();
  reklamEkle({ firma_adi: 'Narçil Cafe', oncelik: 5 });
  reklamEkle({ firma_adi: 'NARÇIL CAFE', oncelik: 4, alan: 'haber_sonu' });
  reklamEkle({ firma_adi: 'NARÇIL  cafe', oncelik: 3 });
  assert.equal(q(`select count(*) from public.aktif_reklamlar('ana_akis', 5)`, anon), '1');
  const gun = istanbulBugun();
  assert.equal(q(`select count(distinct firma_anahtar) from public.reklam_raporu(${lit(gun)}, ${lit(gun)})`, admin), '1');
});

test('014: yasaklı sektör onayı sunucuda: onaysız yayın yok, içerik değişince onay sıfırlanır', () => {
  temizle();
  assert.match(hata(`insert into public.reklamlar (firma_adi, gorsel_url, kisa_metin, alan, baslangic, bitis, durum, sektor_onayi)
    values ('Bahis X', ${lit(GORSEL)}, 'x', 'ana_akis', now(), now() + interval '1 day', 'yayinda', false)`, admin), /yasaklı sektör/);
  const id = reklamEkle({ firma_adi: 'Onaylı' });
  assert.match(hata(`update public.reklamlar set baglanti_url = 'https://baska.com' where id = ${lit(id)}`, admin), /yeniden/);
  q(`update public.reklamlar set baglanti_url = 'https://baska.com', sektor_onay_zamani = now() - interval '1 hour' where id = ${lit(id)}`, admin);
  assert.equal(q(`select sektor_onayi from public.reklamlar where id = ${lit(id)}`), 't');
  assert.match(q("select pg_get_constraintdef(oid) from pg_constraint where conname = 'reklamlar_yayin_sektor'"), /sektor_onayi/);
});

test('014/015: 010-014 yeniden çalıştırılıp 015 ardından çalışınca son sürüm kurulu kalır (tek reklam_olay_kaydet)', () => {
  reklamMigrationYenidenUygula();
  assert.equal(q("select count(*) from pg_proc where proname = 'reklam_olay_kaydet' and pronamespace = 'public'::regnamespace"), '1');
  for (const ad of ['aktif_reklamlar', 'yorum_guncelleme_kontrol']) {
    assert.match(q(`select pg_get_functiondef(p.oid) from pg_proc p where p.proname = ${lit(ad)} and p.pronamespace = 'public'::regnamespace`), /sürüm 014/, ad);
  }
  for (const ad of ['reklam_olay_kaydet', 'reklam_raporu', 'kullanici_adi_ayrilmis', 'sikayet_kontrol', 'sikayet_otomatik_gizle', 'reklamlar_sektor', 'reklam_gunluk_topla', 'reklam_rapor_verisi', 'profil_koruma', 'yorum_onay_gerekli']) {
    assert.match(q(`select pg_get_functiondef(p.oid) from pg_proc p where p.proname = ${lit(ad)} and p.pronamespace = 'public'::regnamespace`), /sürüm 015/, ad);
  }
  assert.match(hata('select * from public.sakatliklar', anon), /permission denied/, 'aciklama sütun yetkisi yeniden kapandı');
});

// ---------------------------------------------------------------------------- 015: son tur
test('015: tıklama oranı = tıklama yapılan farklı sayfa açılışı ÷ gösterim (%100\'ü aşmaz); toplam tıklama ve eylemler ayrı', () => {
  temizle();
  const id = reklamEkle({ firma_adi: 'Kale Oto', alan: 'mac_sponsoru' });
  const [z, sekme] = [uuid(), uuid()];
  // 1 gösterimde WhatsApp + Ara = 2 tıklama: eskiden %200
  assert.equal(olay(id, 'gosterim', z, 'mac_sponsoru', MAC1), 'kaydedildi');
  assert.equal(olay(id, 'tiklama', z, 'mac_sponsoru', MAC1, anon, sekme, 'whatsapp'), 'kaydedildi');
  assert.equal(olay(id, 'tiklama', z, 'mac_sponsoru', MAC1, anon, sekme, 'ara'), 'kaydedildi');
  const gun = istanbulBugun();
  const satir = () => q(`select gosterim || ';' || tiklama || ';' || tiklayan_ziyaret || ';' || tiklama_whatsapp || ';' || tiklama_ara || ';' || tiklama_orani from public.reklam_raporu(${lit(gun)}, ${lit(gun)})`, admin);
  assert.equal(satir(), '1;2;1;1;1;100.00');
  // gösterimsiz tıklama (kart 1 sn dolmadan dokunuldu): oran yine %100'de kalır
  assert.equal(olay(id, 'tiklama', uuid(), 'mac_sponsoru', MAC1, anon, uuid(), 'web'), 'kaydedildi');
  assert.equal(satir(), '1;3;2;1;1;100.00');
  // ikinci gösterim: 2 tıklanan sayfa açılışı / 2 gösterim
  assert.equal(olay(id, 'gosterim', uuid(), 'mac_sponsoru', MAC1), 'kaydedildi');
  assert.equal(olay(id, 'gosterim', uuid(), 'mac_sponsoru', MAC1), 'kaydedildi');
  assert.equal(satir(), '3;3;2;1;1;66.67');
});

test('015: ay ortası raporu: dönem ve yayın günü bugünde biter, "devam ediyor"; bitmiş yayında yok', () => {
  temizle();
  const gun = istanbulBugun();
  const ay = reklamEkle({ firma_adi: 'Aylık' });
  q(`update public.reklamlar set baslangic = (${lit(gun)}::date - 5)::timestamp at time zone 'Europe/Istanbul', bitis = (${lit(gun)}::date + 25)::timestamp at time zone 'Europe/Istanbul' where id = ${lit(ay)}`, admin);
  const biten = reklamEkle({ firma_adi: 'Biten', alan: 'haber_sonu', baslangic: "now() - interval '10 day'", bitis: "now() - interval '2 day'", durum: 'taslak' });
  q(`update public.reklamlar set durum = 'duraklatildi' where id = ${lit(biten)}`, admin);
  q(`insert into public.reklam_olaylari (reklam_id, tur, sayfa_ziyaret_id, alan, created_at) select ${lit(ay)}, 'gosterim', gen_random_uuid(), 'ana_akis', now() - interval '1 hour' from generate_series(1, 12)`);
  const r = (firma) => q(`select donem_baslangic || ';' || donem_bitis || ';' || yayin_gun || ';' || coalesce(gunluk_ortalama_gosterim::text, '-') || ';' || devam_ediyor
    from public.reklam_raporu((${lit(gun)}::date - 20), (${lit(gun)}::date + 30)) where firma_adi = ${lit(firma)}`, admin);
  const [db, ds, g, ort, devam] = r('Aylık').split(';');
  assert.equal(q(`select (${lit(db)}::date = ${lit(gun)}::date - 5)::text || (${lit(ds)}::date = ${lit(gun)}::date)::text`), 'truetrue');
  assert.deepEqual([g, ort, devam], ['6', '2.0', 'true'], 'ayın kalanı (25 gün) sayılmaz: 12 gösterim / 6 gün');
  const b = r('Biten').split(';');
  assert.deepEqual(b.slice(2), [b[2], '0.0', 'false']);
  assert.equal(q(`select (${lit(b[1])}::date < ${lit(gun)}::date)::text`), 'true', 'bitmiş yayın kendi bitişinde kesilir');
});

test('015: reklam_gunluk_topla ham olayı silinmiş (toplanmış) bir günü değiştirmez; tiklayan günlük toplamda da tutulur', () => {
  temizle();
  q('delete from public.reklam_sinir_dakikalari');
  const id = reklamEkle({ firma_adi: 'Arşiv', baslangic: "now() - interval '200 day'", bitis: "now() + interval '1 day'" });
  const eski = `((now() at time zone 'Europe/Istanbul')::date - 100 + time '12:00') at time zone 'Europe/Istanbul'`;
  q(`insert into public.reklam_olaylari (reklam_id, tur, sayfa_ziyaret_id, alan, created_at, eylem)
       select ${lit(id)}::uuid, 'gosterim'::public.reklam_olay_turu, gen_random_uuid(), 'ana_akis'::public.reklam_alani, ${eski}, null::text from generate_series(1, 4)
       union all select ${lit(id)}::uuid, 'tiklama', 'aaaaaaaa-0000-4000-8000-000000000001', 'ana_akis', ${eski}, 'web'
       union all select ${lit(id)}::uuid, 'tiklama', 'aaaaaaaa-0000-4000-8000-000000000001', 'ana_akis', ${eski}, 'ara'`);
  const gun = istanbulBugun();
  const rapor = () => q(`select gosterim || ';' || tiklama || ';' || tiklayan_ziyaret || ';' || tiklama_orani from public.reklam_raporu((${lit(gun)}::date - 100), (${lit(gun)}::date - 100))`, admin);
  assert.equal(rapor(), '4;2;1;25.00');
  assert.match(q('select public.reklam_bakim()'), /toplanan gün: 1, silinen olay: 6/);
  assert.equal(rapor(), '4;2;1;25.00', 'toplamdan okunur, oran aynı');
  // elle yeniden toplama (SQL Editor): ham olay yok → toplam korunur
  assert.equal(q(`select public.reklam_gunluk_topla((${lit(gun)}::date - 100))`), '0');
  assert.equal(rapor(), '4;2;1;25.00', 'geçmiş sıfırlanmadı');
  assert.equal(q(`select count(*) from public.reklam_gunluk where gun = ${lit(gun)}::date - 100`), '4');
  // toplanmamış ya da ham olayı duran gün yine (yeniden) toplanır
  q(`insert into public.reklam_olaylari (reklam_id, tur, sayfa_ziyaret_id, alan, created_at) values (${lit(id)}, 'gosterim', gen_random_uuid(), 'ana_akis', ((now() at time zone 'Europe/Istanbul')::date - 3 + time '12:00') at time zone 'Europe/Istanbul')`);
  assert.equal(q(`select public.reklam_gunluk_topla((${lit(gun)}::date - 3))`), '1');
  assert.equal(q(`select public.reklam_gunluk_topla((${lit(gun)}::date - 3))`), '1', 'ham olay duruyorsa yeniden toplama aynı sonucu verir');
});

test('015: ham satır alarmı: reklam başına günde eşiği aşan ham satır yöneticiye listelenir', async () => {
  const RM = await import(new URL('../../assets/reklam/reklam-mantik.js', import.meta.url).href);
  temizle();
  const a = reklamEkle({ firma_adi: 'Şişen' });
  const b = reklamEkle({ firma_adi: 'Olağan', alan: 'haber_sonu' });
  const esik = RM.SINIRLAR.hamSatirAlarmi;
  q(`insert into public.reklam_olaylari (reklam_id, tur, sayfa_ziyaret_id, alan, created_at)
       select ${lit(a)}, 'gosterim', gen_random_uuid(), 'ana_akis', now() - interval '1 minute' from generate_series(1, ${Math.floor(esik / 2) + 1});
     insert into public.reklam_yerlesimleri (reklam_id, sayfa_ziyaret_id, alan, created_at)
       select ${lit(a)}, gen_random_uuid(), 'ana_akis', now() - interval '1 minute' from generate_series(1, ${Math.floor(esik / 2) + 1});
     insert into public.reklam_olaylari (reklam_id, tur, sayfa_ziyaret_id, alan, created_at)
       select ${lit(b)}, 'gosterim', gen_random_uuid(), 'haber_sonu', now() - interval '1 minute' from generate_series(1, 50);`);
  assert.equal(q('select firma_adi || \':\' || ham_satir || \':\' || esik from public.reklam_ham_satir_alarmi(7)', admin), `Şişen:${2 * (Math.floor(esik / 2) + 1)}:${esik}`);
  assert.match(hata('select * from public.reklam_ham_satir_alarmi(7)', uye), /yalnızca yöneticiler/);
  assert.match(hata('select * from public.reklam_ham_satir_alarmi(7)', anon), /permission denied/);
  temizle();
  assert.equal(q('select count(*) from public.reklam_ham_satir_alarmi(7)', admin), '0');
});

test('015: yasaklı sektör onayı görsel yazısı ve düğme yazısı değişince de sıfırlanır', () => {
  temizle();
  const id = reklamEkle({ firma_adi: 'Onaylı' });
  assert.match(hata(`update public.reklamlar set gorsel_metni = 'Bahis oyna kazan' where id = ${lit(id)}`, admin), /yasaklı sektör/);
  assert.match(hata(`update public.reklamlar set dugme_metni = 'Bahis oyna' where id = ${lit(id)}`, admin), /yasaklı sektör/);
  q(`update public.reklamlar set dugme_metni = 'Araçları gör', sektor_onay_zamani = now() - interval '1 hour' where id = ${lit(id)}`, admin);
  assert.equal(q(`select sektor_onayi || ':' || dugme_metni from public.reklamlar where id = ${lit(id)}`), 'true:Araçları gör');
});
