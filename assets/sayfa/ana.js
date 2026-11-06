// Ana sayfa: hero (maç günü → maçtan sonraki 36 saat "Maç sonu" skoru → manşet / en yeni haber) → tek satırlık "Sıradaki:" şeridi →
// Son dakika akışı (sayfalı, sponsor kartları, sonunda görünür "Hepsi bu kadar") → Gol arşivinden şeridi → Sıradaki maç kartı +
// "Kim yok?" kutusu. Önce son görülen veri (onbellek.js) anında çizilir, sonra ağdan tazelenir. Bağlantı yoksa iskelet kalmaz.
// Sorgular oturumu BEKLEMEZ (performans bütçesi). Sponsor kartı: 3. haberden sonra, sonra en sık 8 haberde bir, aynı firma iki
// kez yok, reklam yoksa yuva tamamen kaldırılır; geç gelen kart okunan yerin üstüne eklenmez (reklam.js gecGelirseAtla).
// 019: hero'nun altındaki tek satırlık "Sıradaki:" şeridi ve aşağıdaki büyük "Sıradaki maç" kartı yerine TEK ikili kart
// (#mac-ikili): solda son biten maçın skoru, sağda sıradaki maçın günü/saati + geri sayım (ikisi de maç sayfasına). Aynı maç iki
// yerde tekrar etmesin diye: hero maç sonunu gösteriyorsa solda "Önceki maç", maç gününü gösteriyorsa sağda "Sonraki". Stadyum ve
// lig maç sayfasında. Son 24 saatte yayınlanan haberde "Yeni" rozeti (yazı; yalnız renge dayanmaz). Haberden geri dönünce yüklenen
// sayfa sayısı ve kaydırma yeri geri gelir (ortak.js konumKoru; çizimden sonra).
// 020: ikili kartın altında son 5 lig maçının G/B/M rozetleri (sırayla belirir) + "Bu sezon <rakip> ile" (sıradaki rakip); maç günü hero'sunda
// "Skor tahminin?" çağrısı (başlama saatine kadar), maç sonu hero'sunda / son maç kartında "Maçın oyuncusunu seç" (oylama açıkken,
// maçtan sonraki ~48 saat); akış satırlarında beğeni sayısı (tek toplu istek); gol şeridinin altında mini puan durumu (Çorum FK ±2 sıra).
import {
  supabase, hazir, h, $, sayfaBaslat, tarihYaz, saatYaz, goreceZaman, gunAnahtari, kapakKaynagi, hataMetni, duyur,
  evSahibiDeplasman, durumRozeti, cevrimdisiKutusu, skorMetni, skorOgesi, sonucBilgisi, konumKoru, SAKATLIK_ETIKETI, begeniSayilariniYaz,
} from '../ortak.js';
import { formSeridi, rakipleSatiri, puanTablosu, puanKaynakSatiri } from '../mac-gunu.js';
import { tahminAcik, oyDurumu, sezonAdi } from '../kurallar.js';
import { reklamYuvalariniDoldur, reklamOnYukle } from '../reklam-yukle.js';
import { sonVeri, sonVeriYaz } from '../onbellek.js';
import { golKarti } from '../gol-kart.js';

const SAYFA_BOYU = 6;
const SPONSOR_ILK = 3;      // ilk sponsor kartı 3. haberden sonra
const SPONSOR_ARALIK = 8;   // sonra en sık 8 haberde bir
const SPONSOR_EN_COK = 3;
// Hero zemini SABİT (020, sahibin kararı): kırmızı-siyah zemin (hero-zemin-genis / -dikey.svg, <picture>) + resmî amblem (ayar.js
// AMBLEM_DOSYASI). Hiçbir haberin kapağı hero'ya geçmez. Stadyum fotoğrafı bulununca yalnız index.html'deki <picture> değişir.
const HABER_SUTUNLARI = 'id, baslik, ozet, kapak_url, kapak_kaynak, kapak_alt, yayin_tarihi, manset';
const MAC_SUTUNLARI = 'id, rakip, tarih, stadyum, ic_saha, organizasyon, corum_skor, rakip_skor, durum';
const MAC_SURESI = 2 * 3600e3;          // başlama → bitiş (yaklaşık; uzatmalar dahil)
const MAC_SONU_SURESI = 36 * 3600e3;    // maç bittikten sonra hero'da skor bu kadar kalır (ertesi sabah "3–0 aldık")

const akis = $('#akis');
const dugme = $('#daha-fazla');
let heroHaberId = null;
let sonraki = 0;          // akışta sıradaki (süzülmemiş) konum
let gosterilen = 0;       // akışta gösterilen haber sayısı
let sponsorSira = 0;
let yukleniyor = false;
let ekSayfa = 0;          // "Daha fazla haber" ile yüklenen sayfa sayısı (geri dönüşte yeniden yüklenir)
let sonSponsor = Promise.resolve();
const YENI_SURESI = 24 * 3600e3;
const yeniMi = (iso, simdi = Date.now()) => { const t = Date.parse(iso); return !Number.isNaN(t) && simdi - t >= 0 && simdi - t < YENI_SURESI; };
const yeniRozeti = () => h('span', { class: 'yeni-rozet' }, 'Yeni');

const oturumS = sayfaBaslat();
const konum = konumKoru(() => ({ ekSayfa }));

// ------------------------------------------------------------ hero
// Etiket yüklenirken iskelettir (MANŞET / MAÇ GÜNÜ / MAÇ SONU henüz belli değil; tasarımcı 3. tur 7)
function etiketYaz(metin) {
  const e = $('#hero-etiket');
  e.classList.remove('iskelet', 'hero-etiket-iskelet');
  e.removeAttribute('aria-hidden');
  e.textContent = metin;
}

function heroCiz(h0) {
  const baslik = $('#hero-baslik'), alt = $('#hero-alt');
  $('#hero').classList.add('hero-geldi'); // 020: tek seferlik giriş hareketi (stil.css 10. bölüm; sınıf kalır, yeniden oynamaz)
  if (!h0) { etiketYaz('Gündem'); baslik.replaceChildren(h('a', { href: 'takim.html' }, 'Kırmızı-siyah gündem')); alt.textContent = 'Haberler yakında burada.'; return; }
  etiketYaz(h0.etiket);
  $('#hero').dataset.tur = h0.tur;
  baslik.replaceChildren(h('a', { href: h0.href, 'data-hero': h0.tur }, h0.baslik));
  alt.replaceChildren(...h0.alt);
  // 020 (sahibin kararı): hero zemini her zaman sabit (stadyum fotoğrafı gelene kadar kırmızı-siyah zemin + amblem); manşetin /
  // haberin kapağı hero'ya GEÇMEZ (kapaklar akış satırlarında ve haber sayfasında kalır)
}

function haberHero(haber) {
  return {
    tur: 'haber', etiket: haber.manset ? 'Manşet' : 'Son haber', baslik: haber.baslik, href: 'haber.html?id=' + encodeURIComponent(haber.id),
    alt: [...(yeniMi(haber.yayin_tarihi) ? [yeniRozeti(), ' '] : []), h('time', { datetime: haber.yayin_tarihi }, goreceZaman(haber.yayin_tarihi)), ' · Habere git →'],
    kapak: haber.kapak_url, kapakKaynak: haber.kapak_kaynak, kapakAlt: haber.kapak_alt, id: haber.id,
  };
}

/** Maçtan sonraki 36 saat: "MAÇ SONU · ÇORUM FK 3 – 0 DENEME FK" + sonuç sözcüğü, maç sayfasına (golleri izle). */
function macSonuHero(mac) {
  const [ev, dep] = evSahibiDeplasman(mac);
  const sonuc = sonucBilgisi(mac);
  return {
    // Skor tek parça (nowrap): "3 –" / "0 DENEME FK" diye bölünmez (taraftar 3. tur 1)
    tur: 'macsonu', etiket: 'Maç sonu', baslik: [ev, ' ', skorOgesi(skorMetni(mac)), ' ', dep], href: 'mac.html?id=' + encodeURIComponent(mac.id),
    alt: [sonuc ? sonuc.ad + ' · ' : '', h('time', { datetime: mac.tarih }, goreceZaman(mac.tarih)), ' · Golleri izle →',
      ...(oyDurumu(mac) === 'acik' ? [' ', cagri(mac, 'Maçın oyuncusunu seç')] : [])], kapak: null, id: null,
  };
}

/** Maç bittikten sonra (başlama + ~2 saat) 36 saat içinde mi? */
const macSonuMu = (mac, simdi = Date.now()) => !!mac && mac.durum === 'bitti' && skorMetni(mac) && simdi - Date.parse(mac.tarih) <= MAC_SURESI + MAC_SONU_SURESI && simdi >= Date.parse(mac.tarih);

/** 020: hero'daki küçük çağrı (maç sayfasının Özet sekmesine: tahmin kutusu / oylama). */
const cagri = (mac, metin) => h('a', { class: 'cagri-cip', href: 'mac.html?id=' + encodeURIComponent(mac.id) + '#ozet' }, metin, h('span', { 'aria-hidden': 'true' }, ' →'));

function macGunuHero(mac) {
  const [ev, dep] = evSahibiDeplasman(mac);
  return {
    tur: 'mac', etiket: mac.durum === 'canli' ? 'Maç başladı' : 'Maç günü', baslik: `${ev} – ${dep}`, href: 'mac.html?id=' + encodeURIComponent(mac.id),
    alt: ['Bugün ', h('time', { datetime: mac.tarih }, saatYaz(mac.tarih)), mac.stadyum ? ' · ' + mac.stadyum : '', ' · Maç bilgisi →',
      ...(tahminAcik(mac) ? [' ', cagri(mac, 'Skor tahminin?')] : [])], kapak: null, id: null,
  };
}

// ------------------------------------------------------------ haber akışı
function haberSatiri(haber) {
  const k = kapakKaynagi(haber.kapak_url, { varsayilan: 480 });
  return h('li', null, h('a', { class: 'haber-satir', href: 'haber.html?id=' + encodeURIComponent(haber.id), 'data-haber-id': haber.id },
    h('span', null,
      h('span', { class: 'ust-meta', 'data-begeni-yer': '' }, yeniMi(haber.yayin_tarihi) ? [yeniRozeti(), ' '] : null, haber.manset ? h('span', { class: 'kategori' }, 'Manşet · ') : null, h('time', { datetime: haber.yayin_tarihi }, goreceZaman(haber.yayin_tarihi))),
      h('h3', null, haber.baslik)),
    k ? h('img', { class: 'kucuk-kapak', src: k.src, srcset: k.srcset, sizes: '96px', alt: '', width: '96', height: '72', loading: 'lazy', decoding: 'async' })
      : h('span', { class: 'kucuk-kapak kapak-yok', 'aria-hidden': 'true' })));
}

function sponsorYuvasi() {
  const li = h('li', { class: 'akis-sponsor' }, h('div', { class: 'reklam-yuvasi', 'data-reklam-alan': 'ana_akis', 'data-reklam-sira': String(sponsorSira) }));
  sponsorSira += 1;
  return li;
}

/** Haberleri akışa ekler; sponsor yuvalarını kurala göre araya koyar. Döner: eklenen ilk haber bağlantısı. */
function haberleriEkle(liste, { sponsor = true } = {}) {
  let ilk = null;
  for (const haber of liste) {
    const li = haberSatiri(haber);
    akis.append(li);
    ilk = ilk || li.querySelector('a');
    gosterilen += 1;
    const sira = gosterilen === SPONSOR_ILK || (gosterilen > SPONSOR_ILK && (gosterilen - SPONSOR_ILK) % SPONSOR_ARALIK === 0);
    if (sponsor && sira && sponsorSira < SPONSOR_EN_COK) akis.append(sponsorYuvasi());
  }
  return ilk;
}

function sponsorlariDoldur() { sonSponsor = sponsorDoldur(); return sonSponsor; }
async function sponsorDoldur() {
  await reklamYuvalariniDoldur(akis);
  // Reklam yoksa (ya da modül/RPC hata verdiyse) yuva TAMAMEN kaldırılır: boş li, boşluk, "Sponsor" yazısı kalmaz
  akis.querySelectorAll('li.akis-sponsor').forEach((li) => { const y = li.querySelector('.reklam-yuvasi'); if (!y || !y.children.length || y.hidden) li.remove(); });
  akis.dataset.sponsorDurum = 'tamam';
}

async function haberSayfasi() {
  // Bir fazlası + hero haberi için bir tane daha iste: "Daha fazla" gerekip gerekmediği ve hero'nun akıştan düşülmesi
  const { data, error } = await supabase.from('haberler').select(HABER_SUTUNLARI)
    .eq('yayinda', true).order('yayin_tarihi', { ascending: false }).order('id', { ascending: false })
    .range(sonraki, sonraki + SAYFA_BOYU + 1);
  if (error) return { error };
  const parca = [];
  let tuketilen = 0;
  for (const haber of data) {
    if (parca.length === SAYFA_BOYU) break;
    tuketilen += 1;
    if (haber.id !== heroHaberId) parca.push(haber);
  }
  const kalan = data.slice(tuketilen).filter((x) => x.id !== heroHaberId).length;
  return { parca, tuketilen, dahaVar: kalan > 0 };
}

/** sessiz: geri dönüşte önceki sayfaları yeniden yüklerken (duyuru ve odak taşıma yok). */
async function dahaFazla({ sessiz = false } = {}) {
  if (yukleniyor) return;
  yukleniyor = true;
  dugme.setAttribute('aria-disabled', 'true');
  akis.setAttribute('aria-busy', 'true');
  const s = await haberSayfasi();
  akis.removeAttribute('aria-busy');
  dugme.removeAttribute('aria-disabled');
  yukleniyor = false;
  if (s.error) { duyur(hataMetni(s.error, 'Haberler yüklenemedi.')); $('#akis-durum').replaceChildren(cevrimdisiKutusu('Haberler yüklenemedi.', () => { $('#akis-durum').replaceChildren(); dahaFazla(); })); return; }
  sonraki += s.tuketilen;
  ekSayfa += 1;
  const ilk = haberleriEkle(s.parca);
  begeniSayilariniYaz(akis, 'haber');
  dugme.hidden = !s.dahaVar;
  $('#akis-son').hidden = s.dahaVar; // düğme sessizce kaybolmaz: görünür 'Hepsi bu kadar' satırı
  sponsorlariDoldur();
  if (sessiz) return s.dahaVar;
  duyur(s.parca.length ? `${s.parca.length} haber daha yüklendi.${s.dahaVar ? '' : ' Hepsi bu kadar.'}` : 'Başka haber yok.');
  // Odak body'ye düşmesin: ilk yeni habere (düğme kaldıysa da yeni içerik okunabilsin diye)
  if (ilk) ilk.focus(); else dugme.focus();
}

// ------------------------------------------------------------ gol şeridi
function golleriCiz(goller) {
  const ul = $('#son-goller');
  if (!goller.length) { ul.replaceChildren(h('li', null, h('p', { class: 'bos' }, 'Gol arşivi yakında dolacak.'))); return; }
  // Şerit ilk ekranın altında: kapaklar tembel (hero ile bant genişliği paylaşmasın; performans §6)
  ul.replaceChildren(...goller.map((g) => h('li', null, golKarti(g, g.maclar))));
}

// ------------------------------------------------------------ sıradaki maç + kim yok
function kalanSure(iso) {
  const fark = Date.parse(iso) - Date.now();
  if (fark <= 0) return null;
  const gun = Math.floor(fark / 864e5), saat = Math.floor((fark % 864e5) / 3600e3);
  if (gun >= 1) return `${gun} gün ${saat} saat kaldı`;
  return saat >= 1 ? `${saat} saat kaldı` : 'Az kaldı';
}
/** Şeritte kısa, bölünmez geri sayım: görünen "5 g 15 sa", ekran okuyucuya "5 gün 15 saat kaldı" (tasarımcı 3. tur 5). */
function kalanOgesi(iso) {
  const uzun = kalanSure(iso);
  if (!uzun) return null;
  const fark = Date.parse(iso) - Date.now();
  const gun = Math.floor(fark / 864e5), saat = Math.floor((fark % 864e5) / 3600e3);
  const kisa = gun >= 1 ? `${gun} g ${saat} sa` : saat >= 1 ? `${saat} sa kaldı` : 'Az kaldı';
  return h('span', { class: 'serit-parca serit-kalan' }, h('span', { 'aria-hidden': 'true' }, '· ', kisa), h('span', { class: 'gorunmez' }, ', ' + uzun));
}

/** "Bugün" / "Pazar" (6 gün içinde) / "29 Kasım". */
function gunMetni(iso) {
  if (gunAnahtari(iso) === gunAnahtari(new Date().toISOString())) return 'Bugün';
  return Date.parse(iso) - Date.now() < 6 * 864e5
    ? new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', weekday: 'long' }).format(new Date(iso)) : tarihYaz(iso, { saat: false, yil: false });
}

/**
 * Hero'nun altındaki ikili kart: solda son biten maç (skor + G/B/M), sağda sıradaki maç (gün, saat, geri sayım). İkisi de maç
 * sayfasına giden ayrı bağlantı. Yükseklik iskeletle aynı (CLS yok). Geri sayım açılışta bir kez hesaplanır (sonsuz animasyon /
 * saniye sayacı yok). son / siradaki: maç satırı ya da null; undefined: o yarının verisi gelmedi (iskelet kalır).
 */
function ikiliCiz(son, siradaki, { sonEtiket = 'Son maç', sirEtiket = 'Sıradaki', form } = {}) {
  const kutu = $('#mac-ikili');
  const yari = (etiket, ...ic) => h('span', { class: 'ikili-ic' }, h('span', { class: 'ikili-etiket' }, etiket), ...ic);
  let sol;
  if (son) {
    const [ev, dep] = evSahibiDeplasman(son);
    const sonuc = sonucBilgisi(son);
    sol = h('a', { class: 'ikili-kart son', href: 'mac.html?id=' + encodeURIComponent(son.id), id: 'ikili-son', 'data-mac-id': son.id },
      yari(sonEtiket,
        h('span', { class: 'ikili-eslesme' }, ev, ' – ', dep),
        h('span', { class: 'ikili-buyuk' }, h('span', { class: 'gorunmez' }, 'Skor: '), skorOgesi(skorMetni(son) || '–'),
          sonuc ? h('span', { class: 'sonuc-rozet ' + sonuc.sinif }, h('span', { 'aria-hidden': 'true' }, sonuc.harf), h('span', { class: 'gorunmez' }, ', ' + sonuc.ad)) : null),
        h('span', { class: 'ikili-meta' }, h('time', { datetime: son.tarih }, tarihYaz(son.tarih, { saat: false, yil: false })), ' · ', son.ic_saha ? 'İç saha' : 'Deplasman'),
        oyDurumu(son) === 'acik' ? h('span', { class: 'cagri-cip kucuk' }, 'Maçın oyuncusunu seç') : null));
  } else if (son === null) {
    sol = h('a', { class: 'ikili-kart son bos', href: 'takim.html#fikstur', id: 'ikili-son' }, yari(sonEtiket, h('span', { class: 'ikili-eslesme' }, 'Henüz oynanmış maç yok'), h('span', { class: 'ikili-meta' }, 'Fikstür →')));
  } else sol = h('span', { class: 'ikili-kart iskelet-kart', 'aria-hidden': 'true' }, h('span', { class: 'iskelet iskelet-satir kisa' }), h('span', { class: 'iskelet iskelet-satir uzun' }), h('span', { class: 'iskelet iskelet-satir kisa' }));
  let sag;
  if (siradaki) {
    const [ev, dep] = evSahibiDeplasman(siradaki);
    const kalan = siradaki.durum === 'canli' ? null : kalanSure(siradaki.tarih);
    sag = h('a', { class: 'ikili-kart siradaki', href: 'mac.html?id=' + encodeURIComponent(siradaki.id), id: 'ikili-siradaki', 'data-mac-id': siradaki.id },
      yari(sirEtiket,
        h('span', { class: 'ikili-eslesme' }, ev, ' – ', dep),
        h('span', { class: 'ikili-buyuk' }, siradaki.durum === 'canli' ? durumRozeti('canli')
          : [h('span', { class: 'ikili-gun' }, gunMetni(siradaki.tarih)), ' ', h('time', { datetime: siradaki.tarih }, saatYaz(siradaki.tarih))]),
        h('span', { class: 'ikili-meta' }, siradaki.ic_saha ? 'İç saha' : 'Deplasman', kalan ? [' ', kalanOgesi(siradaki.tarih)] : null)));
  } else if (siradaki === null) {
    sag = h('a', { class: 'ikili-kart siradaki bos', href: 'takim.html#fikstur', id: 'ikili-siradaki' }, yari(sirEtiket, h('span', { class: 'ikili-eslesme' }, 'Planlanmış maç yok'), h('span', { class: 'ikili-meta' }, 'Fikstür →')));
  } else sag = h('span', { class: 'ikili-kart iskelet-kart', 'aria-hidden': 'true' }, h('span', { class: 'iskelet iskelet-satir kisa' }), h('span', { class: 'iskelet iskelet-satir uzun' }), h('span', { class: 'iskelet iskelet-satir kisa' }));
  // 020: son 5 lig maçı (eskiden yeniye) + sıradaki rakiple bu sezon. form: biten maçlar; undefined: veri gelmedi (iskelet kalır)
  const formOge = Array.isArray(form) ? h('div', { class: 'ikili-form' }, formSeridi(form, { baslik: 'Form', kimlik: 'ana-form' }) || h('span', { class: 'soluk' }, 'Form: bu sezon henüz lig maçı yok.'),
    siradaki ? rakipleSatiri(form, siradaki) : null)
    : form === null ? null : h('span', { class: 'ikili-form iskelet-kart', 'aria-hidden': 'true' }, h('span', { class: 'iskelet iskelet-satir kisa' }));
  kutu.replaceChildren(...[sol, sag, formOge].filter(Boolean));
}

/** 020: mini puan durumu (Çorum FK ve çevresindeki 5 satır) + son güncelleme / kaynak. Tablo yoksa bölüm gizli kalır. */
function puanCiz(satirlar) {
  if (!Array.isArray(satirlar) || !satirlar.length) return;
  $('#ana-puan').replaceChildren(puanTablosu(satirlar, { mini: true, kimlik: 'ana-puan-tablosu' }), puanKaynakSatiri(satirlar));
  $('#puan-bolumu').hidden = false;
}

function kimYokCiz(liste) {
  const kutu = $('#kim-yok');
  const eksik = (liste || []).filter((s) => s.durum !== 'dondu' && s.oyuncular);
  if (!eksik.length) { kutu.replaceChildren(); return; }
  kutu.replaceChildren(h('a', { class: 'kim-yok', href: 'takim.html#sakatlik' },
    h('h3', null, 'Kim yok?'),
    h('ul', null, eksik.slice(0, 3).map((s) => h('li', null, h('span', null, s.oyuncular.ad), h('span', { class: 'durum-cip ' + s.durum }, SAKATLIK_ETIKETI[s.durum] || s.durum)))),
    h('span', { class: 'git' }, 'Kaynaklı sakatlık bilgisi →')));
}

// ------------------------------------------------------------ yükleme
function onbellektenCiz() {
  const v = sonVeri('ana');
  if (!v) return false;
  const d = v.veri || {};
  if (d.hero) heroCiz(d.hero.tur === 'mac' ? macGunuHero(d.hero.mac) : d.hero.tur === 'macsonu' ? macSonuHero(d.hero.mac) : haberHero(d.hero.haber));
  if (Array.isArray(d.haberler) && d.haberler.length) {
    akis.replaceChildren();
    d.haberler.forEach((x) => akis.append(haberSatiri(x)));
    akis.dataset.durum = 'onbellek';
  }
  if (Array.isArray(d.goller)) golleriCiz(d.goller);
  if (d.ikili) ikiliCiz(d.ikili.son ?? null, d.ikili.siradaki ?? null, d.ikili);
  return v.zaman;
}

async function yukle() {
  const onbellekZamani = akis.dataset.durum === 'onbellek' ? sonVeri('ana').zaman : null;
  const [manset, sonMac, biten, goller, kimYok, puan] = await Promise.all([
    supabase.from('haberler').select(HABER_SUTUNLARI).eq('yayinda', true).eq('manset', true).order('yayin_tarihi', { ascending: false }).limit(1),
    supabase.from('maclar').select(MAC_SUTUNLARI)
      .in('durum', ['planlandi', 'canli']).gte('tarih', new Date(Date.now() - 6 * 3600e3).toISOString()).order('tarih', { ascending: true }).limit(2),
    // Son iki biten maç: ilki hero'da (maç sonu) gösteriliyorsa ikili kartın solu bir öncekidir
    // 020: son 10 (form rehberi + sıradaki rakiple bu sezon da buradan; ek istek yok)
    supabase.from('maclar').select(MAC_SUTUNLARI).eq('durum', 'bitti').order('tarih', { ascending: false }).limit(10),
    supabase.from('goller').select('id, oyuncu, dakika, ek_dakika, penalti, video_url, aciklama, kapak_url, sure_sn, asist, video_baslangic_sn, video_bitis_sn, created_at, maclar(id, rakip, tarih, ic_saha, corum_skor, rakip_skor, durum)')
      .order('created_at', { ascending: false }).limit(6),
    supabase.from('sakatliklar').select('id, durum, guncellendi, oyuncular(ad)').eq('yayinda', true).order('guncellendi', { ascending: false }).limit(6),
    supabase.from('puan_durumu').select('sezon, sira, takim, oynanan, galibiyet, beraberlik, maglubiyet, atilan, yenen, puan, guncellendi, kaynak')
      .eq('sezon', sezonAdi(new Date().toISOString())).order('sira', { ascending: true }).limit(40),
  ]);
  const mac = sonMac.error ? undefined : (sonMac.data[0] || null);
  const macGunu = mac && (mac.durum === 'canli' || gunAnahtari(mac.tarih) === gunAnahtari(new Date().toISOString())) ? mac : null;
  const macSonu = !macGunu && !biten.error && macSonuMu(biten.data[0]) ? biten.data[0] : null;
  // İkili kart: hero zaten bir maçı gösteriyorsa (maç günü / maç sonu) aynı maç kartta tekrar etmez: bir sonraki / bir önceki
  const ikili = {
    siradaki: sonMac.error ? undefined : macGunu ? (sonMac.data[1] || null) : mac,
    son: biten.error ? undefined : macSonu ? (biten.data[1] || null) : (biten.data[0] || null),
    sirEtiket: macGunu ? 'Sonraki' : 'Sıradaki',
    sonEtiket: macSonu ? 'Önceki maç' : 'Son maç',
    form: biten.error ? undefined : biten.data,
  };
  const macHero = macGunu || macSonu;
  let heroHaber = manset.error ? null : manset.data[0] || null;
  heroHaberId = macHero ? null : heroHaber ? heroHaber.id : null;
  sonraki = 0; gosterilen = 0; sponsorSira = 0; ekSayfa = 0;
  // Manşet yoksa en yeni haber hero olur: önce akışın ilk sayfası, sonra hero seçilir ve akıştan düşülür
  let s;
  if (!macHero && !heroHaber && !manset.error) {
    s = await haberSayfasi();
    if (!s.error && s.parca.length) { heroHaber = s.parca[0]; heroHaberId = heroHaber.id; sonraki = 0; s = await haberSayfasi(); }
  } else s = await haberSayfasi();

  if (s.error || manset.error) {
    akis.dataset.durum = onbellekZamani ? 'onbellek' : 'hata';
    const e = s.error || manset.error;
    if (!onbellekZamani) akis.replaceChildren();
    $('#akis-durum').replaceChildren(cevrimdisiKutusu(onbellekZamani ? 'Bağlantı yok; son görülen haberler gösteriliyor.' : hataMetni(e, 'Haberler yüklenemedi.'),
      () => { $('#akis-durum').replaceChildren(); yukle(); }, { sonGuncelleme: onbellekZamani }));
    if (!onbellekZamani) iskeletleriKaldir();
    dugme.hidden = true;
    return false;
  }
  $('#akis-durum').replaceChildren();
  bolumleriAc();
  heroCiz(macGunu ? macGunuHero(macGunu) : macSonu ? macSonuHero(macSonu) : heroHaber ? haberHero(heroHaber) : null);
  sonraki = s.tuketilen;
  akis.replaceChildren();
  if (!s.parca.length) akis.append(h('li', null, h('p', { class: 'bos' }, 'Henüz haber yok. İlk haber yakında!')));
  haberleriEkle(s.parca);
  begeniSayilariniYaz(akis, 'haber');
  akis.dataset.durum = 'tamam';
  dugme.hidden = !s.dahaVar;
  sponsorlariDoldur();
  if (!goller.error) golleriCiz(goller.data);
  else if (!$('#son-goller .video-kart, #son-goller .gol-satir')) $('#son-goller').replaceChildren(h('li', null, cevrimdisiKutusu('Goller yüklenemedi.', () => location.reload())));
  // Bir yarının sorgusu hata verdiyse o yarı fikstür bağlantısına döner (iskelet kalmaz)
  ikiliCiz(ikili.son === undefined ? null : ikili.son, ikili.siradaki === undefined ? null : ikili.siradaki, ikili);
  if (!kimYok.error) kimYokCiz(kimYok.data);
  if (!puan.error) puanCiz(puan.data);
  sonVeriYaz('ana', {
    hero: macGunu ? { tur: 'mac', mac: macGunu } : macSonu ? { tur: 'macsonu', mac: macSonu } : heroHaber ? { tur: 'haber', haber: heroHaber } : null,
    haberler: s.parca.slice(0, SAYFA_BOYU), goller: goller.error ? [] : goller.data,
    ikili: { ...ikili, son: ikili.son ?? null, siradaki: ikili.siradaki ?? null },
  });
  return s.dahaVar;
}

// Haberden geri dönüş: önce yüklenmiş "Daha fazla" sayfaları sessizce yeniden yüklenir, sponsor kartları yerleşir (en çok 1,5 sn),
// sonra kaydırma yeri geri gelir (veri gelmeden kaydırma yok)
async function geriDonus(dahaVar) {
  const hedef = Math.min(Number(konum.durum && konum.durum.ekSayfa) || 0, 5);
  for (let i = 0; dahaVar && i < hedef; i++) dahaVar = await dahaFazla({ sessiz: true });
  await Promise.race([sonSponsor.catch(() => {}), new Promise((r) => setTimeout(r, 1500))]);
  konum.geriYukle();
}

// Bağlantı yok ve önbellek yok: iskelet SONSUZA KADAR kalmaz. Hero "Bağlantı yok", gol şeridi gizlenir (tek "Tekrar dene" akışın
// başında), ikili kart fikstür bağlantılarına döner.
function iskeletleriKaldir() {
  if ($('#hero-baslik .iskelet')) { etiketYaz('Bağlantı yok'); $('#hero-baslik').replaceChildren('İnternet gitti, maç gitmedi'); $('#hero').dataset.tur = 'hata'; }
  if ($('#son-goller .iskelet')) $('#goller-bolumu').hidden = true;
  if ($('#mac-ikili .iskelet')) ikiliCiz(null, null, { form: null });
}
function bolumleriAc() { $('#goller-bolumu').hidden = false; }

if (hazir) {
  onbellektenCiz();
  reklamOnYukle('ana_akis'); // sponsor sorgusu haber sorgusuyla paralel başlasın: kart akışla birlikte gelsin
  dugme.addEventListener('click', () => dahaFazla());
  yukle().then((dahaVar) => { if (dahaVar !== false) return geriDonus(dahaVar); })
    .catch((e) => { $('#akis-durum').replaceChildren(cevrimdisiKutusu(hataMetni(e, 'Haberler yüklenemedi.'), () => location.reload())); if (akis.dataset.durum !== 'onbellek') { akis.replaceChildren(); iskeletleriKaldir(); } });
  window.addEventListener('online', () => { if (akis.dataset.durum !== 'tamam') yukle(); });
} else {
  akis.replaceChildren(); $('#son-goller').replaceChildren(); $('#mac-ikili').replaceChildren();
  etiketYaz('Gündem'); $('#hero-baslik').replaceChildren('Çorumspor Taraftar');
}
await oturumS;
