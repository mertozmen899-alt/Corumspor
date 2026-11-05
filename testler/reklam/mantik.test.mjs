// Reklam modülü birim testleri: node --test testler/reklam/mantik.test.mjs  (bağımlılık yok)
// Hepsi birlikte: node testler/calistir.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as M from '../../assets/reklam/reklam-mantik.js';

const ORNEK = JSON.parse(readFileSync(new URL('./baglanti-ornekleri.json', import.meta.url), 'utf8'));

test('bağlantı doğrulama: ortak örnek listesi', () => {
  for (const [url, beklenen] of ORNEK.baglanti) assert.equal(M.baglantiGecerli(url), beklenen, url);
  assert.equal(M.baglantiGecerli(null), true);
  assert.equal(M.baglantiGecerli(42), false);
  assert.equal(M.baglantiGecerli('https://a.com/\u0000x'), false);
  assert.equal(M.baglantiGecerli('https://a.com/' + 'x'.repeat(2000)), false);
});

test('telefon -> wa.me (ortak örnek listesi) ve mesaj ekleme', () => {
  for (const [tel, beklenen] of ORNEK.telefon) assert.equal(M.whatsappBaglantisiOlustur(tel), beklenen, tel);
  const b = M.whatsappBaglantisiOlustur('0532 123 45 67', 'Merhaba, menünüzü görebilir miyim?');
  assert.equal(b, 'https://wa.me/905321234567?text=' + encodeURIComponent('Merhaba, menünüzü görebilir miyim?'));
  assert.equal(M.baglantiGecerli(b), true);
  assert.equal(M.whatsappBaglantisiMi(b), true);
  assert.equal(M.whatsappBaglantisiMi('https://narcil.net'), false);
});

test('bağlantı normalleştirme', () => {
  assert.equal(M.baglantiNormallestir('  corumdoner.com.tr/menu '), 'https://corumdoner.com.tr/menu');
  assert.equal(M.baglantiNormallestir('https://çorumdöner.com/menu?a=1'), 'https://xn--orumdner-r0a9m.com/menu?a=1');
  // ilk reklam: Narçil'in sitesi narcil.net (ASCII). "narçil.net" yazılırsa panel punycode'a çevirir; ç'li hâli doğrulamadan geçmez
  assert.equal(M.baglantiNormallestir('narcil.net'), 'https://narcil.net');
  // önerilen bağlantı: menünün kahve bölümü (sorgu dizesi korunur ve geçerlidir)
  assert.equal(M.baglantiNormallestir(' narcil.net/?category=espresso-bazli-kahveler '), 'https://narcil.net/?category=espresso-bazli-kahveler');
  assert.equal(M.baglantiGecerli(M.baglantiNormallestir('narcil.net/?category=espresso-bazli-kahveler')), true);
  assert.equal(M.baglantiNormallestir('narcil.net?category=espresso-bazli-kahveler'), 'https://narcil.net?category=espresso-bazli-kahveler');
  assert.equal(M.baglantiNormallestir('narçil.net'), 'https://xn--naril-0ra.net');
  assert.equal(M.baglantiGecerli('https://narçil.net'), false);
  assert.equal(M.baglantiGecerli(M.baglantiNormallestir('narçil.net')), true);
  assert.equal(M.baglantiNormallestir(''), null);
  assert.equal(M.baglantiNormallestir(null), null);
  assert.equal(M.baglantiNormallestir('http://a.com'), 'http://a.com');
  assert.equal(M.baglantiGecerli(M.baglantiNormallestir('http://a.com')), false);
  assert.equal(M.baglantiNormallestir('whatsapp://send?phone=905321234567'), 'whatsapp://send?phone=905321234567');
  assert.equal(M.baglantiGecerli(M.baglantiNormallestir('https://user:pw@a.com')), false);
});

test('görsel adresi: yalnız projenin Supabase deposu (reklam-gorselleri), yerel/yabancı adres yok', () => {
  for (const [url, beklenen] of ORNEK.gorsel) assert.equal(M.gorselAdresiGecerli(url), beklenen, url);
  assert.equal(M.gorselAdresiGecerli(null), false);
  assert.equal(M.gorselAdresiGecerli(42), false);
});

test('sekme kimliği: sessionStorage\'da kalıcı (aynı sekme), bozuksa yenilenir, depo yoksa/atarsa bellekte üretilir', () => {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const depo = new Map();
  const ss = { getItem: (k) => (depo.has(k) ? depo.get(k) : null), setItem: (k, v) => depo.set(k, String(v)) };
  const a = M.sekmeKimligi(ss);
  assert.match(a, uuid);
  assert.equal(M.sekmeKimligi(ss), a, 'aynı sekmede (aynı sessionStorage) aynı kimlik');
  assert.equal(depo.get(M.SEKME_ANAHTARI), a);
  assert.equal(depo.size, 1, 'yalnız tek bir anahtar yazılır');
  depo.set(M.SEKME_ANAHTARI, '<script>');
  const b = M.sekmeKimligi(ss);
  assert.match(b, uuid);
  assert.notEqual(b, '<script>');
  const atan = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('SecurityError'); } };
  assert.match(M.sekmeKimligi(atan), uuid);
  assert.match(M.sekmeKimligi(null), uuid);
  assert.notEqual(M.sekmeKimligi(null), M.sekmeKimligi(null), 'depo yoksa her çağrı yeni (sayfa yüklemesine bağlı)');
});

test('İstanbul saati: datetime-local gidiş dönüş, Intl ile', () => {
  assert.equal(M.istanbulFarkiDakika('2026-07-01T00:00:00Z'), 180);
  assert.equal(M.istanbulFarkiDakika('2026-01-01T00:00:00Z'), 180);
  assert.equal(M.yerelGiristenIso('2026-11-05T20:30'), '2026-11-05T17:30:00.000Z');
  assert.equal(M.isoYerelGirise('2026-11-05T17:30:00Z'), '2026-11-05T20:30');
  // gece yarısını aşan dönüşüm
  assert.equal(M.isoYerelGirise('2026-10-31T22:15:00Z'), '2026-11-01T01:15');
  assert.equal(M.yerelGiristenIso('2026-11-01T01:15'), '2026-10-31T22:15:00.000Z');
  assert.equal(M.yerelGiristenIso('2026-02-31T10:00'), null);
  assert.equal(M.yerelGiristenIso('bozuk'), null);
  assert.equal(M.isoYerelGirise(null), '');
  for (const iso of ['2026-03-29T00:59:00.000Z', '2026-12-31T21:00:00.000Z', '2027-06-15T09:05:00.000Z']) {
    assert.equal(M.yerelGiristenIso(M.isoYerelGirise(iso)), iso);
  }
  assert.equal(M.istanbulBicimle('2026-11-05T17:30:00Z'), '5 Kasım 2026 20:30');
  assert.equal(M.istanbulGunu(new Date('2026-11-30T21:30:00Z')), '2026-12-01');
});

test('bu ay aralığı İstanbul takvimine göre', () => {
  assert.deepEqual(M.buAyAraligi(new Date('2026-11-05T10:00:00Z')), { baslangic: '2026-11-01', bitis: '2026-11-30' });
  // UTC'de hâlâ 31 Ekim ama İstanbul'da 1 Kasım
  assert.deepEqual(M.buAyAraligi(new Date('2026-10-31T21:30:00Z')), { baslangic: '2026-11-01', bitis: '2026-11-30' });
  assert.deepEqual(M.buAyAraligi(new Date('2028-02-10T10:00:00Z')), { baslangic: '2028-02-01', bitis: '2028-02-29' });
});

const SIMDI = new Date('2026-11-05T12:00:00Z');
const saat = (n) => new Date(SIMDI.getTime() + n * 3600e3).toISOString();
const reklam = (o) => ({
  id: o.id, alan: 'ana_akis', mac_id: null, durum: 'yayinda', oncelik: 0,
  baslangic: saat(-24), bitis: saat(24), yayina_alinma: saat(-1), created_at: saat(-2), ...o,
});

test('durum hesaplama: taslak, yayında, duraklatıldı, süresi doldu, başlamadı', () => {
  assert.equal(M.reklamDurumu(reklam({ durum: 'taslak' }), SIMDI), 'taslak');
  assert.equal(M.reklamDurumu(reklam({}), SIMDI), 'yayinda');
  assert.equal(M.reklamDurumu(reklam({ durum: 'duraklatildi' }), SIMDI), 'duraklatildi');
  assert.equal(M.reklamDurumu(reklam({ bitis: saat(-1) }), SIMDI), 'suresi_doldu');
  assert.equal(M.reklamDurumu(reklam({ durum: 'duraklatildi', bitis: saat(-1) }), SIMDI), 'suresi_doldu');
  assert.equal(M.reklamDurumu(reklam({ baslangic: saat(1) }), SIMDI), 'baslamadi');
  assert.equal(M.durumEtiketi('suresi_doldu'), 'Süresi doldu');
  assert.equal(M.durumEtiketi('baslamadi'), 'Başlamadı');
  // sınır: bitis anında artık sunulmaz, baslangic anında sunulur
  assert.equal(M.reklamSunulabilir(reklam({ bitis: SIMDI.toISOString() }), SIMDI), false);
  assert.equal(M.reklamSunulabilir(reklam({ baslangic: SIMDI.toISOString() }), SIMDI), true);
});

test('seçim: yalnızca sunulabilir olanlar, yüksek öncelik kazanır', () => {
  const liste = [
    reklam({ id: 'a', oncelik: 10 }),
    reklam({ id: 'b', oncelik: 50 }),
    reklam({ id: 'c', oncelik: 99, durum: 'taslak' }),
    reklam({ id: 'd', oncelik: 99, durum: 'duraklatildi' }),
    reklam({ id: 'e', oncelik: 99, bitis: saat(-1) }),
    reklam({ id: 'f', oncelik: 99, baslangic: saat(1) }),
    reklam({ id: 'g', oncelik: 99, alan: 'haber_sonu' }),
  ];
  assert.equal(M.reklamSec(liste, { alan: 'ana_akis' }, SIMDI).id, 'b');
  assert.equal(M.reklamSec(liste, { alan: 'haber_sonu' }, SIMDI).id, 'g');
  assert.equal(M.reklamSec(liste, { alan: 'mac_sponsoru', macId: 'm1' }, SIMDI), null);
  assert.equal(M.reklamSec([], { alan: 'ana_akis' }, SIMDI), null);
});

test('seçim: eşitlikte yeni yayına alınan, sonra yeni oluşturulan kazanır', () => {
  const a = reklam({ id: 'a', oncelik: 5, yayina_alinma: saat(-3), created_at: saat(-1) });
  const b = reklam({ id: 'b', oncelik: 5, yayina_alinma: saat(-2), created_at: saat(-5) });
  assert.equal(M.reklamSec([a, b], { alan: 'ana_akis' }, SIMDI).id, 'b');
  const c = reklam({ id: 'c', oncelik: 5, yayina_alinma: saat(-2), created_at: saat(-4) });
  assert.equal(M.reklamSec([a, b, c], { alan: 'ana_akis' }, SIMDI).id, 'c');
  const d = reklam({ id: 'd', oncelik: 5, yayina_alinma: saat(-2), created_at: saat(-4) });
  assert.equal(M.reklamSec([d, c], { alan: 'ana_akis' }, SIMDI).id, 'c'); // tam eşitlikte id sırası (kararlı)
});

test('seçim: maça özel sponsor genelden önce gelir, başka maçınki gelmez', () => {
  const genel = reklam({ id: 'genel', alan: 'mac_sponsoru', oncelik: 90 });
  const ozel1 = reklam({ id: 'ozel1', alan: 'mac_sponsoru', mac_id: '11', oncelik: 1 });
  const ozel2 = reklam({ id: 'ozel2', alan: 'mac_sponsoru', mac_id: '22', oncelik: 100 });
  const liste = [genel, ozel1, ozel2];
  assert.equal(M.reklamSec(liste, { alan: 'mac_sponsoru', macId: 11 }, SIMDI).id, 'ozel1');
  assert.equal(M.reklamSec(liste, { alan: 'mac_sponsoru', macId: '22' }, SIMDI).id, 'ozel2');
  assert.equal(M.reklamSec(liste, { alan: 'mac_sponsoru', macId: '33' }, SIMDI).id, 'genel');
  assert.equal(M.reklamSec(liste, { alan: 'mac_sponsoru' }, SIMDI).id, 'genel');
  assert.equal(M.reklamSec([ozel1], { alan: 'mac_sponsoru' }, SIMDI), null);
  // özel reklamın süresi dolunca genel devralır
  assert.equal(M.reklamSec([genel, { ...ozel1, bitis: saat(-1) }], { alan: 'mac_sponsoru', macId: '11' }, SIMDI).id, 'genel');
});

test('kart etiketi ve eylem yazısı', () => {
  assert.equal(M.reklamEtiketi({ alan: 'ana_akis' }), 'Reklam');
  assert.equal(M.reklamEtiketi({ alan: 'haber_sonu' }), 'Reklam');
  assert.equal(M.reklamEtiketi({ alan: 'mac_sponsoru', mac_id: null }), 'Sponsor');
  assert.equal(M.reklamEtiketi({ alan: 'mac_sponsoru', mac_id: '7' }), 'Maçın sponsoru');
  assert.equal(M.eylemYazisi('https://wa.me/905321234567'), "WhatsApp'tan yazın");
  assert.equal(M.eylemYazisi('https://a.com'), 'Ayrıntılar');
  assert.equal(M.eylemYazisi(null), '');
});

test('form doğrulama: SQL tetikleyicisiyle aynı kurallar', () => {
  const iyi = { firma_adi: 'Narçil Cafe', kisa_metin: "Espresso bazlı kahveler, Türk kahvesi, bitki çayları, taze sıkılmış meyve suları ve tatlılar. Menünün tamamı narcil.net'te.", gorsel_url: 'https://abc.supabase.co/storage/v1/object/public/reklam-gorselleri/2026/11/x.png', baglanti_url: 'https://narcil.net', alan: 'ana_akis', mac_id: null, baslangic: saat(-1), bitis: saat(5), oncelik: 10 };
  assert.deepEqual(M.reklamDogrula(iyi, { simdi: SIMDI }), {});
  const h = (o, ops) => Object.keys(M.reklamDogrula({ ...iyi, ...o }, { simdi: SIMDI, ...ops }));
  assert.deepEqual(h({ firma_adi: '  ' }), ['firma_adi']);
  assert.deepEqual(h({ firma_adi: 'x'.repeat(81) }), ['firma_adi']);
  assert.deepEqual(h({ kisa_metin: '' }), ['kisa_metin']);
  assert.deepEqual(h({ kisa_metin: 'x'.repeat(161) }), ['kisa_metin']);
  assert.deepEqual(h({ gorsel_url: '' }), ['gorsel_url']);
  assert.deepEqual(h({ gorsel_url: 'https://baska-site.com/piksel.png' }), ['gorsel_url']);
  assert.deepEqual(h({ baglanti_url: 'http://a.com' }), ['baglanti_url']);
  assert.match(M.reklamDogrula({ ...iyi, baglanti_url: 'http://a.com' }).baglanti_url, /https/);
  assert.deepEqual(h({ baglanti_url: 'javascript:alert(1)' }), ['baglanti_url']);
  assert.deepEqual(h({ baglanti_url: null }), []);
  assert.deepEqual(h({ mac_id: '5' }), ['mac_id']);
  assert.deepEqual(h({ alan: 'mac_sponsoru', mac_id: '5' }), []);
  assert.deepEqual(h({ alan: 'yan_menu' }), ['alan']);
  assert.deepEqual(h({ bitis: saat(-1) }), ['bitis']);
  assert.deepEqual(h({ baslangic: saat(-10), bitis: saat(-1) }), []);
  assert.deepEqual(h({ baslangic: saat(-10), bitis: saat(-1) }, { yayinaAliniyor: true }), ['bitis']);
  assert.deepEqual(h({ baslangic: '' }), ['baslangic']);
  assert.deepEqual(h({ oncelik: 101 }), ['oncelik']);
  assert.deepEqual(h({ oncelik: -1 }), ['oncelik']);
  assert.deepEqual(h({ oncelik: 2.5 }), ['oncelik']);
});

test('tıklama oranı ve Türkçe sayı biçimi', () => {
  assert.equal(M.tiklamaOrani(200, 5), 2.5);
  assert.equal(M.tiklamaOrani(3, 1), 33.33);
  assert.equal(M.tiklamaOrani(0, 2), null);
  assert.equal(M.oranBicimle(2.5), '2,50');
  assert.equal(M.oranBicimle(1234.5), '1.234,50');
  assert.equal(M.oranBicimle(null), '');
});

test('CSV: UTF-8 BOM, noktalı virgül, CRLF, Türkçe oran, tırnak ve formül koruması', () => {
  const csv = M.raporCsv([
    { firma_adi: 'Narçil Cafe; Kahve', alan: 'ana_akis', gosterim: 1200, tiklama: 30, tiklama_orani: 2.5, supheli_dakika: 3 },
    { firma_adi: '=HYPERLINK("x")', alan: 'mac_sponsoru', gosterim: 0, tiklama: 0, tiklama_orani: null },
    { firma_adi: 'Şükrü "Usta" Pide', alan: 'haber_sonu', gosterim: '3', tiklama: '1' },
  ]);
  assert.equal(csv.charCodeAt(0), 0xfeff);
  const satirlar = csv.slice(1).split('\r\n');
  assert.equal(satirlar[0], 'Firma;Alan;Gösterim;Tıklama;Tıklama oranı (%);Sınıra takılan dakika');
  assert.equal(satirlar[1], '"Narçil Cafe; Kahve";Ana sayfa akışı;1200;30;2,50;3');
  assert.equal(satirlar[2], `"'=HYPERLINK(""x"")";Maç sponsoru;0;0;;0`);
  assert.equal(satirlar[3], '"Şükrü ""Usta"" Pide";Haber sonu;3;1;33,33;0');
  assert.equal(satirlar[4], '');
  assert.equal(M.raporCsv([]), '﻿Firma;Alan;Gösterim;Tıklama;Tıklama oranı (%);Sınıra takılan dakika\r\n');
});

test('dakika sınırları (012): reklam başına dakikada 120 gösterim / 30 tıklama, ziyaret başına 5 tıklama (SQL ile aynı)', () => {
  assert.equal(M.SINIRLAR.gosterimDakikaSiniri, 120);
  assert.equal(M.SINIRLAR.tiklamaDakikaSiniri, 30);
  assert.equal(M.SINIRLAR.ziyaretTiklamaSiniri, 5);
  assert.ok(Object.isFrozen(M.SINIRLAR));
});

test('sayfa ziyareti kimliği: uuid v4, randomUUID yoksa yedek yol', () => {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  assert.match(M.yeniZiyaretKimligi(), uuid);
  const yedek = M.yeniZiyaretKimligi({ getRandomValues: (b) => globalThis.crypto.getRandomValues(b) });
  assert.match(yedek, uuid);
  assert.notEqual(M.yeniZiyaretKimligi(), M.yeniZiyaretKimligi());
});
