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
  assert.equal(M.reklamEtiketi({ alan: 'ana_akis' }), 'Sponsor'); // 013: akış kartı SPONSOR
  assert.equal(M.reklamEtiketi({ alan: 'haber_sonu' }), 'Reklam');
  assert.equal(M.reklamEtiketi({ alan: 'mac_sponsoru', mac_id: null }), 'Sponsor');
  assert.equal(M.reklamEtiketi({ alan: 'mac_sponsoru', mac_id: '7' }), 'Maçın sponsoru');
  assert.equal(M.eylemYazisi('https://wa.me/905321234567'), "WhatsApp'tan yazın");
  assert.equal(M.eylemYazisi('https://a.com'), 'Ayrıntılar');
  assert.equal(M.eylemYazisi(null), '');
  assert.equal(M.MAC_SPONSORU_NOTU, "Uygulama sponsoru · Çorum FK'nın sponsoru değildir");
});

test('013: "Ara" telefonu, düğme yazısı, görsel metni, sınır aşımı uyarısı, yasaklı sektör listesi', () => {
  assert.equal(M.telefonKaydi('0364 213 19 19'), '+903642131919');
  assert.equal(M.telefonKaydi('0532 123 45 67'), '+905321234567');
  assert.equal(M.telefonKaydi('123'), null);
  assert.equal(M.telAdresi('+903642131919'), 'tel:+903642131919');
  assert.equal(M.telAdresi('tel:+90364'), null);
  assert.equal(M.telAdresi('javascript:alert(1)'), null);
  const iyi = { firma_adi: 'A', kisa_metin: 'B', gorsel_url: 'https://abc.supabase.co/storage/v1/object/public/reklam-gorselleri/x.png', alan: 'ana_akis', baslangic: saat(-1), bitis: saat(5), oncelik: 0 };
  const h = (o) => M.reklamDogrula({ ...iyi, ...o }, { simdi: SIMDI });
  assert.deepEqual(h({ dugme_metni: 'Menüyü gör', telefon: '+903642131919', gorsel_metni: 'Kahve fincanı' }), {});
  assert.deepEqual(Object.keys(h({ dugme_metni: 'x' })), ['dugme_metni']);
  assert.deepEqual(Object.keys(h({ dugme_metni: 'x'.repeat(25) })), ['dugme_metni']);
  assert.deepEqual(Object.keys(h({ telefon: 'gecersiz' })), ['telefon']);
  assert.deepEqual(Object.keys(h({ gorsel_metni: 'x'.repeat(201) })), ['gorsel_metni']);
  assert.deepEqual(Object.keys(h({ gorsel_kucuk_url: 'https://baska.com/x.png' })), ['gorsel_url']);
  assert.match(h({ kisa_metin: 'x'.repeat(174) }).kisa_metin, /14 karakter fazla/);
  assert.deepEqual(M.YASAKLI_SEKTORLER.map(([k]) => k), ['bahis', 'alkol', 'tutun', 'kulup']);
  assert.ok(M.YASAKLI_SEKTORLER.every(([, t]) => t.length > 10) && /nargile/.test(M.YASAKLI_SEKTORLER[2][1]) && /sponsor/.test(M.YASAKLI_SEKTORLER[3][1]));
});

test('form doğrulama: SQL tetikleyicisiyle aynı kurallar', () => {
  const iyi = { firma_adi: 'Narçil Cafe', kisa_metin: "Espresso bazlı kahveler, Türk kahvesi, bitki çayları, taze meyve suları ve tatlılar. Çorum'da sizi bekliyoruz.", gorsel_url: 'https://abc.supabase.co/storage/v1/object/public/reklam-gorselleri/2026/11/x.png', baglanti_url: 'https://narcil.net', alan: 'ana_akis', mac_id: null, baslangic: saat(-1), bitis: saat(5), oncelik: 10 };
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
  assert.equal(M.tiklamaOrani(1, 2), 100, '015: oran %100\'ü aşmaz (pay = tıklanan farklı sayfa açılışı)');
  assert.equal(M.oranBicimle(2.5), '2,50');
  assert.equal(M.oranBicimle(1234.5), '1.234,50');
  assert.equal(M.oranBicimle(null), '');
});

test('CSV: UTF-8 BOM, noktalı virgül, CRLF, Türkçe oran, tırnak ve formül koruması', () => {
  // 013: Maç ve Dönem; 014: yayın başlangıç/bitiş/gün, sayfa açılışı, görünürlük, günlük ortalama, tıklama eylemleri,
  // "Şüpheli trafik (sayılmadı, dk)" yalnız bir satırda bile 0'dan büyükse
  const csv = M.raporCsv([
    { firma_adi: 'Narçil Cafe; Kahve', alan: 'ana_akis', gosterim: 1200, tiklama: 30, tiklama_orani: 2.5, supheli_dakika: 3, yerlesim: 1600, gorunurluk_orani: 75,
      tiklama_web: 20, tiklama_whatsapp: 6, tiklama_ara: 4, yayin_baslangic: '2026-11-06T09:00:00Z', yayin_bitis: '2026-11-13T21:00:00Z',
      donem_baslangic: '2026-11-06', donem_bitis: '2026-11-14', yayin_gun: 9, gunluk_ortalama_gosterim: 133.3, tiklayan_ziyaret: 28, devam_ediyor: true },
    { firma_adi: '=HYPERLINK("x")', alan: 'mac_sponsoru', mac_id: 'm1', gosterim: 0, tiklama: 0, tiklama_orani: null },
    { firma_adi: 'Şükrü "Usta" Pide', alan: 'haber_sonu', gosterim: '3', tiklama: '1' },
    { firma_adi: 'Genel', alan: 'mac_sponsoru', mac_id: null, gosterim: 1, tiklama: 0 },
  ], { donem: '2026-11-01 – 2026-11-30', macAdi: (id) => (id === 'm1' ? '22 Ekim 2026 19:00 · Çorum FK – Örnekköy Spor' : '') });
  assert.equal(csv.charCodeAt(0), 0xfeff);
  const satirlar = csv.slice(1).split('\r\n');
  // 015: tek tarih biçimi (GG.AA.YYYY [SS:DD]), "(devam ediyor)", tıklama yapılan sayfa açılışı sütunu
  assert.equal(satirlar[0], 'Firma;Alan;Maç;Dönem;Yayın başlangıç;Yayın bitiş;Yayın günü;Sayfa açılışı;Gösterim;Görünürlük oranı (%);Günlük ortalama gösterim;Tıklama;Web tıklaması;WhatsApp tıklaması;Arama;Tıklama yapılan sayfa açılışı;Tıklama oranı (%);Şüpheli trafik (sayılmadı, dk)');
  assert.equal(satirlar[1], '"Narçil Cafe; Kahve";Ana sayfa akışı;;06.11.2026 – 14.11.2026 (devam ediyor);06.11.2026 12:00;14.11.2026 00:00;9;1600;1200;75,00;133,3;30;20;6;4;28;2,50;3');
  assert.equal(satirlar[2], `"'=HYPERLINK(""x"")";Maç sponsoru;22 Ekim 2026 19:00 · Çorum FK – Örnekköy Spor;01.11.2026 – 30.11.2026;;;;0;0;;;0;0;0;0;0;;0`);
  assert.equal(satirlar[3], '"Şükrü ""Usta"" Pide";Haber sonu;;01.11.2026 – 30.11.2026;;;;0;3;;;1;0;0;0;1;33,33;0');
  assert.equal(satirlar[4], 'Genel;Maç sponsoru;Tüm maçlar;01.11.2026 – 30.11.2026;;;;0;1;;;0;0;0;0;0;0,00;0');
  assert.equal(satirlar[5], '');
  assert.ok(!/\d{4}-\d{2}-\d{2}|Kasım 2026/.test(csv.replace('22 Ekim 2026 19:00 · Çorum FK – Örnekköy Spor', '')), 'CSV\'de ISO ya da uzun Türkçe tarih kalmadı');
  // hiçbir satırda şüpheli trafik yoksa sütun hiç yok (reklam verene giden dosyada teknik sütun kalmaz)
  assert.equal(M.raporCsv([]), '\ufeffFirma;Alan;Maç;Dönem;Yayın başlangıç;Yayın bitiş;Yayın günü;Sayfa açılışı;Gösterim;Görünürlük oranı (%);Günlük ortalama gösterim;Tıklama;Web tıklaması;WhatsApp tıklaması;Arama;Tıklama yapılan sayfa açılışı;Tıklama oranı (%)\r\n');
  assert.ok(!/Şüpheli/.test(M.raporCsv([{ firma_adi: 'A', alan: 'ana_akis', gosterim: 1, tiklama: 0, supheli_dakika: 0 }])));
});

test('013/014: firma süzgeci ortak firma anahtarıyla (Türkçe küçük harf, ı/i, boşluk farkı yok)', () => {
  const l = [{ firma_adi: 'Narçil Cafe', alan: 'ana_akis' }, { firma_adi: 'Hitit Optik', alan: 'haber_sonu' }, { firma_adi: ' NARÇIL  cafe ', alan: 'mac_sponsoru' }];
  assert.deepEqual(M.firmaSuz(l, 'Narçil Cafe').map((x) => x.alan), ['ana_akis', 'mac_sponsoru']);
  assert.deepEqual(M.firmaSuz(l, 'Hitit Optik').map((x) => x.firma_adi), ['Hitit Optik']);
  assert.equal(M.firmaSuz(l, '').length, 3);
  const csv = M.raporCsv(M.firmaSuz(l, 'Hitit Optik'));
  assert.ok(csv.includes('Hitit Optik') && !/Narçil/i.test(csv));
  for (const [girdi, beklenen] of ORNEK.firma_anahtari) assert.equal(M.firmaAnahtari(girdi), beklenen, girdi);
});

test('dakika sınırları (015): reklam başına dakikada 120 gösterim / 20 tıklama / 240 yerleşim, sekme başına saatte 20 gösterim / 10 tıklama, ziyaret başına 5 tıklama (SQL ile aynı)', () => {
  assert.equal(M.SINIRLAR.gosterimDakikaSiniri, 120);
  assert.equal(M.SINIRLAR.tiklamaDakikaSiniri, 20);
  assert.equal(M.SINIRLAR.yerlesimDakikaSiniri, 240);
  assert.equal(M.SINIRLAR.hamSatirAlarmi, 20000);
  assert.equal(M.SINIRLAR.bakimGecikmeGun, 2);
  assert.equal(M.SINIRLAR.ziyaretTiklamaSiniri, 5);
  assert.equal(M.SINIRLAR.sekmeSaatGosterimSiniri, 20);
  assert.equal(M.SINIRLAR.sekmeSaatTiklamaSiniri, 10);
  assert.equal(M.SINIRLAR.akisYuvaSayisi, 3);
  assert.ok(Object.isFrozen(M.SINIRLAR));
  assert.deepEqual(M.ALAN_METIN_ONERISI, { ana_akis: 110, mac_sponsoru: 110, haber_sonu: 160 });
});

test('014: akışta N. sponsor (aktif_reklamlar aynası) ve "bu alan dolu" uyarısı', () => {
  const r = (id, firma, oncelik, o = {}) => ({ id, firma_adi: firma, alan: 'ana_akis', durum: 'yayinda', oncelik, baslangic: saat(-10), bitis: saat(100), yayina_alinma: saat(-10), created_at: saat(-10), ...o });
  const l = [r('a', 'Kale Oto', 20), r('b', 'Narçil Cafe', 10), r('c', 'NARÇIL CAFE', 5), r('d', 'Hitit Optik', 3), r('e', 'Dördüncü', 1), r('f', 'Taslak', 99, { durum: 'taslak' })];
  assert.deepEqual(M.akisReklamlari(l, 3, SIMDI).map((x) => x.id), ['a', 'b', 'd']);
  assert.deepEqual(M.gosterimSirasi(l, l[1], SIMDI), { sira: 2 });
  assert.equal(M.gosterimSirasi(l, l[2], SIMDI), null, 'aynı firmanın ikinci reklamı akışta yok');
  assert.equal(M.gosterimSirasi(l, l[4], SIMDI), null, '4. firma akışta yok (3 yuva)');
  // yeni reklam: 0 öncelikle hiç görünmez (akış 3 firmayla dolu), 4 öncelikle görünür; başka firma bitince görünür
  const yeni = { id: 'y', firma_adi: 'Yeni Firma', alan: 'ana_akis', oncelik: 0, baslangic: saat(0), bitis: saat(48) };
  const d = M.alanDolulugu(l, yeni, SIMDI);
  assert.equal(d.gorunur, false);
  assert.deepEqual(d.onde.map((x) => `${x.firma_adi}:${x.oncelik}`), ['Kale Oto:20', 'Narçil Cafe:10', 'Hitit Optik:3']);
  assert.equal(M.alanDolulugu(l, { ...yeni, oncelik: 4 }, SIMDI).gorunur, true);
  const biten = l.map((x) => (x.id === 'd' ? { ...x, bitis: saat(24) } : x));
  assert.equal(M.alanDolulugu(l, { ...yeni, oncelik: 2 }, SIMDI).gorunur, false);
  assert.equal(M.alanDolulugu(biten, { ...yeni, oncelik: 2 }, SIMDI).gorunur, true, 'Hitit bitince yer açılır (Dördüncü 1 öncelikte, yeni 2)');
  // tek yuvalı alan: haber sonunda yüksek öncelikli varsa düşük olan hiç görünmez
  const hs = [{ ...r('h', 'Büyük', 50), alan: 'haber_sonu' }];
  const hd = M.alanDolulugu(hs, { ...yeni, alan: 'haber_sonu', oncelik: 10 }, SIMDI);
  assert.deepEqual([hd.gorunur, hd.onde.map((x) => x.firma_adi).join()], [false, 'Büyük']);
  assert.equal(M.alanDolulugu(hs, { ...yeni, alan: 'haber_sonu', oncelik: 50 }, SIMDI).gorunur, true, 'eşit öncelikte yeni yayına alınan kazanır');
  // maç sponsoru: maça özel olan genel sponsoru geçer
  const ms = [{ ...r('g', 'Genel', 90), alan: 'mac_sponsoru', mac_id: null }];
  assert.equal(M.alanDolulugu(ms, { ...yeni, alan: 'mac_sponsoru', mac_id: 'm1', oncelik: 0 }, SIMDI).gorunur, true);
  assert.equal(M.alanDolulugu(ms, { ...yeni, alan: 'mac_sponsoru', mac_id: null, oncelik: 0 }, SIMDI).gorunur, false);
});

test('014: bağlantısız reklamda metinde adres uyarısı, tıklama eylemi, en yoğun gün', () => {
  assert.equal(M.metindeAdresVar("Menünün tamamı narcil.net'te."), true);
  assert.equal(M.metindeAdresVar('www.ornek.com.tr adresinde'), true);
  assert.equal(M.metindeAdresVar('https://a.co'), true);
  assert.equal(M.metindeAdresVar("Espresso bazlı kahveler, Türk kahvesi. Çorum'da sizi bekliyoruz."), false);
  assert.equal(M.metindeAdresVar('Saat 19.30, 2.el araçlar'), false);
  assert.equal(M.tiklamaEylemi('tel:+903642131919'), 'ara');
  assert.equal(M.tiklamaEylemi('https://wa.me/905321234567?text=x'), 'whatsapp');
  assert.equal(M.tiklamaEylemi('whatsapp://send?phone=905321234567'), 'whatsapp');
  assert.equal(M.tiklamaEylemi('https://kaleoto.com.tr/stok'), 'web');
  assert.equal(M.tiklamaEylemi('javascript:alert(1)'), null);
  assert.deepEqual(M.enYogunGun([{ gun: '2026-11-08', gosterim: 40 }, { gun: '2026-11-09', gosterim: 30 }, { gun: '2026-11-09', gosterim: 25 }]), { gun: '2026-11-09', gosterim: 55, mac: false });
  assert.equal(M.enYogunGun([]), null);
  // 015: eşitlikte maç günü öne geçer (sırası ne olursa olsun)
  assert.equal(M.enYogunGun([{ gun: '2026-11-06', gosterim: 2 }, { gun: '2026-11-11', gosterim: 2, mac_gunu: true }]).gun, '2026-11-11');
  assert.equal(M.enYogunGun([{ gun: '2026-11-11', gosterim: 2, mac_gunu: true }, { gun: '2026-11-06', gosterim: 2 }]).gun, '2026-11-11');
  assert.equal(M.enYogunGun([{ gun: '2026-11-06', gosterim: 3 }, { gun: '2026-11-11', gosterim: 2, mac_gunu: true }]).gun, '2026-11-06');
  assert.equal(M.enYogunGun([{ gun: '2026-11-07', gosterim: 2 }, { gun: '2026-11-06', gosterim: 2 }]).gun, '2026-11-06', 'maç günü yoksa en erken gün');
});

test('015: rapor dönemi bugünü aşmaz, "(devam ediyor)"; ay ortası raporu', () => {
  const simdi = new Date('2026-11-06T09:00:00Z'); // 6 Kasım 12:00 TSİ
  const ay = (r) => M.raporDonemi('2026-11-01', '2026-11-30', { durum: 'yayinda', ...r }, simdi);
  // ay boyu yayın, rapor 6 Kasım'da: 1–6 Kasım (6 gün, devam ediyor), 25 gün değil
  assert.deepEqual(ay({ baslangic: '2026-10-20T00:00:00Z', bitis: '2026-12-20T00:00:00Z' }), { donem_baslangic: '2026-11-01', donem_bitis: '2026-11-06', yayin_gun: 6, devam_ediyor: true });
  // bugün başlayan: 1 gün
  assert.deepEqual(ay({ baslangic: '2026-11-06T00:47:00Z', bitis: '2026-12-06T20:59:00Z' }), { donem_baslangic: '2026-11-06', donem_bitis: '2026-11-06', yayin_gun: 1, devam_ediyor: true });
  // bitmiş yayın: devam etmiyor
  assert.deepEqual(ay({ baslangic: '2026-11-01T00:00:00Z', bitis: '2026-11-04T21:00:00Z' }), { donem_baslangic: '2026-11-01', donem_bitis: '2026-11-04', yayin_gun: 4, devam_ediyor: false });
  // ileride başlayacak: dönem yok
  assert.deepEqual(ay({ baslangic: '2026-11-10T00:00:00Z', bitis: '2026-11-20T00:00:00Z' }), { donem_baslangic: null, donem_bitis: null, yayin_gun: 0, devam_ediyor: false });
  // duraklatılmış: dönem bugünde kesilir ama "devam ediyor" yazmaz
  assert.equal(ay({ durum: 'duraklatildi', baslangic: '2026-10-20T00:00:00Z', bitis: '2026-12-20T00:00:00Z' }).devam_ediyor, false);
  assert.equal(M.donemMetni({ donem_baslangic: '2026-11-01', donem_bitis: '2026-11-06', devam_ediyor: true }), '01.11.2026 – 06.11.2026 (devam ediyor)');
  assert.equal(M.donemMetni({ donem_baslangic: null }), '');
  assert.equal(M.gunNoktali('2026-11-06'), '06.11.2026');
  assert.equal(M.anNoktali('2026-11-06T00:47:00Z'), '06.11.2026 03:47');
});

test('015: "1 hafta" / "1 ay" bitişi o günün 23:59\'u (TSİ); ay sonu taşmaz', () => {
  assert.equal(M.sureBitisi('2026-11-06T00:47:00Z', { gun: 7 }), '2026-11-13T23:59');
  assert.equal(M.sureBitisi('2026-11-06T00:47:00Z', { ay: 1 }), '2026-12-06T23:59');
  assert.equal(M.sureBitisi('2026-11-05T22:30:00Z', { ay: 1 }), '2026-12-06T23:59', 'TSİ günü (6 Kasım 01:30) esas');
  assert.equal(M.sureBitisi('2027-01-31T09:00:00Z', { ay: 1 }), '2027-02-28T23:59');
  assert.equal(M.sureBitisi('2026-12-28T09:00:00Z', { gun: 7 }), '2027-01-04T23:59');
});

test('015: akış yuvası notu (1. yuva ilk sayfada; 2./3. yalnız "Daha fazla haber" açılınca)', () => {
  assert.equal(M.akisYuvaNotu(1), 'Akışta 1. sponsor: ilk sayfada');
  assert.equal(M.akisYuvaNotu(2), 'Akışta 2. sponsor: yalnız "Daha fazla haber" açılınca');
  assert.equal(M.akisYuvaNotu(3), 'Akışta 3. sponsor: yalnız "Daha fazla haber" açılınca');
});

test('sayfa ziyareti kimliği: uuid v4, randomUUID yoksa yedek yol', () => {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  assert.match(M.yeniZiyaretKimligi(), uuid);
  const yedek = M.yeniZiyaretKimligi({ getRandomValues: (b) => globalThis.crypto.getRandomValues(b) });
  assert.match(yedek, uuid);
  assert.notEqual(M.yeniZiyaretKimligi(), M.yeniZiyaretKimligi());
});

test('015: haber sonu görseli sizes (kutu genişliği, etkin DPR ≤ 2): 360 px telefonda 480 kopyası yeter', () => {
  assert.equal(M.haberSonuBoyutu(360, 1), '302px');
  assert.equal(M.haberSonuBoyutu(360, 2), '302px');
  assert.equal(M.haberSonuBoyutu(360, 3), '201px', 'DPR 3: 201 × 3 = 604 px → 480w (yoğunluk 2,39) ile 1200w (5,97) arasında 480 seçilir');
  assert.equal(M.haberSonuBoyutu(430, 3), '248px');
  assert.equal(M.haberSonuBoyutu(1280, 1), '291px', 'geniş ekranda görsel kartın %44\'ü');
  assert.equal(M.haberSonuBoyutu(undefined, undefined), '302px');
});
