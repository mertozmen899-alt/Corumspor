// Ana sayfa: hero (maç günü → maçtan sonraki 36 saat "Maç sonu" skoru → manşet / en yeni haber) → tek satırlık "Sıradaki:" şeridi →
// Son dakika akışı (sayfalı, sponsor kartları, sonunda görünür "Hepsi bu kadar") → Gol arşivinden şeridi → Sıradaki maç kartı +
// "Kim yok?" kutusu. Önce son görülen veri (onbellek.js) anında çizilir, sonra ağdan tazelenir. Bağlantı yoksa iskelet kalmaz.
// Sorgular oturumu BEKLEMEZ (performans bütçesi). Sponsor kartı: 3. haberden sonra, sonra en sık 8 haberde bir, aynı firma iki
// kez yok, reklam yoksa yuva tamamen kaldırılır; geç gelen kart okunan yerin üstüne eklenmez (reklam.js gecGelirseAtla).
import {
  supabase, hazir, h, $, sayfaBaslat, tarihYaz, saatYaz, goreceZaman, gunAnahtari, kapakKaynagi, fotoAtfi, hataMetni, duyur,
  evSahibiDeplasman, durumRozeti, cevrimdisiKutusu, skorMetni, skorOgesi, sonucBilgisi, SAKATLIK_ETIKETI, TAKIM_ADI,
} from '../ortak.js';
import { reklamYuvalariniDoldur, reklamOnYukle } from '../reklam-yukle.js';
import { sonVeri, sonVeriYaz } from '../onbellek.js';
import { golKarti } from '../gol-kart.js';

const SAYFA_BOYU = 6;
const SPONSOR_ILK = 3;      // ilk sponsor kartı 3. haberden sonra
const SPONSOR_ARALIK = 8;   // sonra en sık 8 haberde bir
const SPONSOR_EN_COK = 3;
const HERO_VARSAYILAN = /^assets\/img\/corum-saat-kulesi-gece-(yatay|dikey)-\d+\.webp$/;
const HABER_SUTUNLARI = 'id, baslik, ozet, kapak_url, kapak_kaynak, kapak_alt, yayin_tarihi, manset';
const MAC_SUTUNLARI = 'id, rakip, tarih, stadyum, ic_saha, organizasyon, corum_skor, rakip_skor, durum';
const MAC_SURESI = 2 * 3600e3;          // başlama → bitiş (yaklaşık; uzatmalar dahil)
const MAC_SONU_SURESI = 36 * 3600e3;    // maç bittikten sonra hero'da skor bu kadar kalır (ertesi sabah "3–0 aldık")
const HERO_GEC = 2500;                  // manşet kapağı açılıştan bu kadar ms sonra hâlâ çözülmediyse varsayılan fotoğraf kalır

const akis = $('#akis');
const dugme = $('#daha-fazla');
let heroHaberId = null;
let sonraki = 0;          // akışta sıradaki (süzülmemiş) konum
let gosterilen = 0;       // akışta gösterilen haber sayısı
let sponsorSira = 0;
let yukleniyor = false;

const oturumS = sayfaBaslat();

// ------------------------------------------------------------ hero
// Etiket yüklenirken iskelettir (MANŞET / MAÇ GÜNÜ / MAÇ SONU henüz belli değil; tasarımcı 3. tur 7)
function etiketYaz(metin) {
  const e = $('#hero-etiket');
  e.classList.remove('iskelet', 'hero-etiket-iskelet');
  e.removeAttribute('aria-hidden');
  e.textContent = metin;
}

let heroKapak = null; // şu an gösterilen / çözülmekte olan kapak adresi (önbellek + ağ iki kez çağırır: tek indirme)

/**
 * Manşetin kendi kapağı: varsayılan fotoğrafın (Saat Kulesi) yerine ancak tamamen ÇÖZÜLDÜKTEN sonra, tek seferde geçilir
 * (yarım çizilen ikinci görsel / çift değişim görünmez; performans 3. tur 4). Varsayılan fotoğraf zaten ekrandaysa ve kapak
 * açılıştan HERO_GEC ms sonra hâlâ hazır değilse bu ziyarette varsayılan kalır (kapak HTTP önbelleğinde: sonraki açılışta
 * son görülen veriyle hemen çizilir).
 */
function heroKapakDegistir(kapak, h0) {
  if (heroKapak === kapak.src) return;
  heroKapak = kapak.src;
  const yeni = new Image();
  if (kapak.crossorigin) yeni.crossOrigin = kapak.crossorigin;
  yeni.sizes = kapak.sizes || '100vw';
  if (kapak.srcset) yeni.srcset = kapak.srcset;
  yeni.src = kapak.src;
  const coz = typeof yeni.decode === 'function' ? yeni.decode() : new Promise((tamam, red) => { yeni.onload = tamam; yeni.onerror = red; });
  coz.then(() => {
    if (heroKapak !== kapak.src) return;
    const img = $('#hero-gorsel');
    const varsayilanEkranda = img.complete && img.naturalWidth > 0;
    if (varsayilanEkranda && performance.now() > HERO_GEC) { $('#hero').dataset.kapak = 'varsayilan'; return; }
    img.closest('picture').querySelectorAll('source').forEach((x) => x.remove());
    if (kapak.crossorigin) img.crossOrigin = kapak.crossorigin; else img.removeAttribute('crossorigin');
    img.alt = h0.kapakAlt || '';
    img.sizes = yeni.sizes;
    if (kapak.srcset) img.srcset = kapak.srcset; else img.removeAttribute('srcset');
    img.src = yeni.currentSrc || kapak.src; // çözülmüş kopya: aynı adres önbellekten, anında
    const atif = fotoAtfi(h0.kapak, h0.kapakKaynak);
    $('#hero-atif').hidden = !atif;
    if (atif) $('#hero-atif').textContent = atif;
    $('#hero').dataset.kapak = 'haber';
  }).catch(() => { if (heroKapak === kapak.src) $('#hero').dataset.kapak = 'varsayilan'; }); // kapak açılmadı: varsayılan fotoğraf kalır
}

function heroCiz(h0) {
  const baslik = $('#hero-baslik'), alt = $('#hero-alt');
  if (!h0) { etiketYaz('Gündem'); baslik.replaceChildren(h('a', { href: 'takim.html' }, 'Kırmızı-siyah gündem')); alt.textContent = 'Haberler yakında burada.'; return; }
  etiketYaz(h0.etiket);
  $('#hero').dataset.tur = h0.tur;
  baslik.replaceChildren(h('a', { href: h0.href, 'data-hero': h0.tur }, h0.baslik));
  alt.replaceChildren(...h0.alt);
  // Haberin kendi kapağı varsa (panelden yüklenen, hakkı olan fotoğraf) hero görseli o olur; atfı altında.
  // Etkin DPR ≤ 2 (sizes): DPR 3 telefonda -1600 (268 KB) değil -800 (~65 KB) iner (performans §4)
  const kapak = h0.kapak && !HERO_VARSAYILAN.test(h0.kapak) ? kapakKaynagi(h0.kapak, { varsayilan: 800, kutu: innerWidth }) : null;
  if (kapak) heroKapakDegistir(kapak, h0);
}

function haberHero(haber) {
  return {
    tur: 'haber', etiket: haber.manset ? 'Manşet' : 'Son haber', baslik: haber.baslik, href: 'haber.html?id=' + encodeURIComponent(haber.id),
    alt: [h('time', { datetime: haber.yayin_tarihi }, goreceZaman(haber.yayin_tarihi)), ' · Habere git →'],
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
    alt: [sonuc ? sonuc.ad + ' · ' : '', h('time', { datetime: mac.tarih }, goreceZaman(mac.tarih)), ' · Golleri izle →'], kapak: null, id: null,
  };
}

/** Maç bittikten sonra (başlama + ~2 saat) 36 saat içinde mi? */
const macSonuMu = (mac, simdi = Date.now()) => !!mac && mac.durum === 'bitti' && skorMetni(mac) && simdi - Date.parse(mac.tarih) <= MAC_SURESI + MAC_SONU_SURESI && simdi >= Date.parse(mac.tarih);

function macGunuHero(mac) {
  const [ev, dep] = evSahibiDeplasman(mac);
  return {
    tur: 'mac', etiket: mac.durum === 'canli' ? 'Maç başladı' : 'Maç günü', baslik: `${ev} – ${dep}`, href: 'mac.html?id=' + encodeURIComponent(mac.id),
    alt: ['Bugün ', h('time', { datetime: mac.tarih }, saatYaz(mac.tarih)), mac.stadyum ? ' · ' + mac.stadyum : '', ' · Maç bilgisi →'], kapak: null, id: null,
  };
}

// ------------------------------------------------------------ haber akışı
function haberSatiri(haber) {
  const k = kapakKaynagi(haber.kapak_url, { varsayilan: 480 });
  return h('li', null, h('a', { class: 'haber-satir', href: 'haber.html?id=' + encodeURIComponent(haber.id), 'data-haber-id': haber.id },
    h('span', null,
      h('span', { class: 'ust-meta' }, haber.manset ? h('span', { class: 'kategori' }, 'Manşet · ') : null, h('time', { datetime: haber.yayin_tarihi }, goreceZaman(haber.yayin_tarihi))),
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

async function sponsorlariDoldur() {
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

async function dahaFazla() {
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
  const ilk = haberleriEkle(s.parca);
  dugme.hidden = !s.dahaVar;
  $('#akis-son').hidden = s.dahaVar; // düğme sessizce kaybolmaz: görünür 'Hepsi bu kadar' satırı
  sponsorlariDoldur();
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

const basHarf = (ad) => ad.replace(/^(\S)\S*\s+(\S).*$/u, '$1$2').slice(0, 2).toLocaleUpperCase('tr-TR');
// Bizim takımda baş harf rozeti YOK ("ÇF" kulüp kısaltmasına çok yakın; kural 7): uygulamanın özgün "ÇT" işareti
function takimOgesi(ad) {
  const biz = ad === TAKIM_ADI;
  return h('span', { class: 'takim' + (biz ? ' biz' : '') },
    biz ? h('span', { class: 'harf isaret', 'aria-hidden': 'true' }, h('img', { src: 'assets/logo/amblem-yedek.svg', alt: '', width: '30', height: '36', decoding: 'async' }))
      : h('span', { class: 'harf', 'aria-hidden': 'true' }, basHarf(ad)),
    h('span', null, ad));
}

/** Hero'nun hemen altındaki tek satır: "Sıradaki: Çorum FK – Deneme FK · Salı 19:00 · 4 gün 17 saat kaldı" (yoksa fikstür bağlantısı). */
function seritCiz(mac) {
  const kutu = $('#siradaki-serit');
  if (!mac) { kutu.replaceChildren(h('a', { class: 'serit-baglanti', href: 'takim.html#fikstur' }, h('span', { class: 'serit-etiket' }, 'Fikstür'), h('span', { class: 'serit-metin' }, 'Maçlar ve sonuçlar'), h('span', { class: 'git', 'aria-hidden': 'true' }, '→'))); return; }
  const [ev, dep] = evSahibiDeplasman(mac);
  const yakin = Date.parse(mac.tarih) - Date.now() < 6 * 864e5;
  const gun = gunAnahtari(mac.tarih) === gunAnahtari(new Date().toISOString()) ? 'Bugün'
    : yakin ? new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', weekday: 'long' }).format(new Date(mac.tarih)) : tarihYaz(mac.tarih, { saat: false, yil: false });
  // Bölünmez parçalar (takım adları, gün + saat, geri sayım); ayraç "·" parçanın BAŞINDA: satır sonunda asılı nokta kalmaz
  // (taraftar 3. tur 5). Parçalar arasında yalnız normal boşluk kırılır.
  kutu.replaceChildren(h('a', { class: 'serit-baglanti', href: 'mac.html?id=' + encodeURIComponent(mac.id), id: 'siradaki-serit-baglanti' },
    h('span', { class: 'serit-etiket' }, 'Sıradaki'),
    h('span', { class: 'serit-metin' },
      h('b', null, h('span', { class: 'serit-parca' }, ev, ' –'), ' ', h('span', { class: 'serit-parca' }, dep)), ' ',
      h('span', { class: 'serit-parca' }, '· ', gun, ' ', h('time', { datetime: mac.tarih }, saatYaz(mac.tarih))),
      mac.durum === 'canli' ? [' ', h('span', { class: 'serit-parca' }, '· ', durumRozeti('canli'))] : [' ', kalanOgesi(mac.tarih)]),
    h('span', { class: 'git', 'aria-hidden': 'true' }, '→')));
}

function macKarti(mac) {
  const kutu = $('#sonraki-mac');
  if (!mac) { kutu.replaceChildren(h('p', { class: 'mesaj bilgi' }, 'Şimdilik planlanmış maç yok. Fikstür açıklanınca burada.')); return; }
  const [ev, dep] = evSahibiDeplasman(mac);
  const tarih = tarihYaz(mac.tarih, { saat: false, gun: true, yil: false });
  const kalan = mac.durum === 'canli' ? null : kalanSure(mac.tarih);
  kutu.replaceChildren(h('a', { class: 'sonraki-mac', href: 'mac.html?id=' + encodeURIComponent(mac.id), id: 'sonraki-mac-karti',
    'aria-label': `Sıradaki maç: ${ev} – ${dep}, ${tarih} ${saatYaz(mac.tarih)}${mac.stadyum ? ', ' + mac.stadyum : ''}${kalan ? ', ' + kalan : ''}` },
    h('div', { class: 'ust-satir' }, mac.organizasyon || 'Maç', kalan ? [' ', h('span', { class: 'serit-parca' }, '· ', kalan)] : ''),
    h('div', { class: 'takimlar' },
      takimOgesi(ev),
      h('span', { class: 'saat-kutu' }, mac.durum === 'canli' ? durumRozeti('canli') : h('time', { datetime: mac.tarih }, saatYaz(mac.tarih))),
      takimOgesi(dep)),
    h('p', { class: 'tarih-satir' }, tarih),
    mac.stadyum ? h('p', { class: 'stadyum' }, mac.stadyum) : null,
    h('div', { class: 'alt-satir' }, h('span', null, mac.ic_saha ? 'İç saha' : 'Deplasman'), h('span', { class: 'git' }, 'Maç bilgisi →'))));
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
  if (d.mac !== undefined) { macKarti(d.mac); seritCiz(d.serit !== undefined ? d.serit : d.mac); }
  return v.zaman;
}

async function yukle() {
  const onbellekZamani = akis.dataset.durum === 'onbellek' ? sonVeri('ana').zaman : null;
  const [manset, sonMac, biten, goller, kimYok] = await Promise.all([
    supabase.from('haberler').select(HABER_SUTUNLARI).eq('yayinda', true).eq('manset', true).order('yayin_tarihi', { ascending: false }).limit(1),
    supabase.from('maclar').select(MAC_SUTUNLARI)
      .in('durum', ['planlandi', 'canli']).gte('tarih', new Date(Date.now() - 6 * 3600e3).toISOString()).order('tarih', { ascending: true }).limit(2),
    supabase.from('maclar').select(MAC_SUTUNLARI)
      .eq('durum', 'bitti').gte('tarih', new Date(Date.now() - MAC_SURESI - MAC_SONU_SURESI).toISOString()).order('tarih', { ascending: false }).limit(1),
    supabase.from('goller').select('id, oyuncu, dakika, ek_dakika, penalti, video_url, aciklama, kapak_url, sure_sn, created_at, maclar(id, rakip, tarih, ic_saha, corum_skor, rakip_skor, durum)')
      .order('created_at', { ascending: false }).limit(6),
    supabase.from('sakatliklar').select('id, durum, guncellendi, oyuncular(ad)').eq('yayinda', true).order('guncellendi', { ascending: false }).limit(6),
  ]);
  const mac = sonMac.error ? undefined : (sonMac.data[0] || null);
  const macGunu = mac && (mac.durum === 'canli' || gunAnahtari(mac.tarih) === gunAnahtari(new Date().toISOString())) ? mac : null;
  const macSonu = !macGunu && !biten.error && macSonuMu(biten.data[0]) ? biten.data[0] : null;
  // Şerit: hero zaten sıradaki maçı gösteriyorsa (maç günü) ondan sonrakini
  const serit = sonMac.error ? undefined : macGunu ? (sonMac.data[1] || null) : mac;
  const macHero = macGunu || macSonu;
  let heroHaber = manset.error ? null : manset.data[0] || null;
  heroHaberId = macHero ? null : heroHaber ? heroHaber.id : null;
  sonraki = 0; gosterilen = 0; sponsorSira = 0;
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
    return;
  }
  $('#akis-durum').replaceChildren();
  bolumleriAc();
  heroCiz(macGunu ? macGunuHero(macGunu) : macSonu ? macSonuHero(macSonu) : heroHaber ? haberHero(heroHaber) : null);
  sonraki = s.tuketilen;
  akis.replaceChildren();
  if (!s.parca.length) akis.append(h('li', null, h('p', { class: 'bos' }, 'Henüz haber yok. İlk haber yakında!')));
  haberleriEkle(s.parca);
  akis.dataset.durum = 'tamam';
  dugme.hidden = !s.dahaVar;
  sponsorlariDoldur();
  if (!goller.error) golleriCiz(goller.data);
  else if (!$('#son-goller .video-kart, #son-goller .gol-satir')) $('#son-goller').replaceChildren(h('li', null, cevrimdisiKutusu('Goller yüklenemedi.', () => location.reload())));
  if (mac !== undefined) { macKarti(mac); seritCiz(serit); }
  else if ($('#sonraki-mac .iskelet')) { $('#sonraki-mac').replaceChildren(cevrimdisiKutusu('Maç bilgisi yüklenemedi.', () => location.reload())); seritCiz(null); }
  if (!kimYok.error) kimYokCiz(kimYok.data);
  sonVeriYaz('ana', {
    hero: macGunu ? { tur: 'mac', mac: macGunu } : macSonu ? { tur: 'macsonu', mac: macSonu } : heroHaber ? { tur: 'haber', haber: heroHaber } : null,
    haberler: s.parca.slice(0, SAYFA_BOYU), goller: goller.error ? [] : goller.data, mac: mac === undefined ? null : mac, serit: serit === undefined ? null : serit,
  });
}

// Bağlantı yok ve önbellek yok: iskelet SONSUZA KADAR kalmaz. Hero "Bağlantı yok", gol şeridi ve maç bölümü gizlenir
// (tek "Tekrar dene" akışın başında), şerit fikstür bağlantısına döner.
function iskeletleriKaldir() {
  if ($('#hero-baslik .iskelet')) { etiketYaz('Bağlantı yok'); $('#hero-baslik').replaceChildren('İnternet gitti, maç gitmedi'); $('#hero').dataset.tur = 'hata'; }
  if ($('#son-goller .iskelet')) $('#goller-bolumu').hidden = true;
  if ($('#sonraki-mac .iskelet')) $('#sonraki-bolumu').hidden = true;
  if ($('#siradaki-serit .iskelet')) seritCiz(null);
}
function bolumleriAc() { $('#goller-bolumu').hidden = false; $('#sonraki-bolumu').hidden = false; }

if (hazir) {
  onbellektenCiz();
  reklamOnYukle('ana_akis'); // sponsor sorgusu haber sorgusuyla paralel başlasın: kart akışla birlikte gelsin
  dugme.addEventListener('click', dahaFazla);
  yukle().catch((e) => { $('#akis-durum').replaceChildren(cevrimdisiKutusu(hataMetni(e, 'Haberler yüklenemedi.'), () => location.reload())); if (akis.dataset.durum !== 'onbellek') { akis.replaceChildren(); iskeletleriKaldir(); } });
  window.addEventListener('online', () => { if (akis.dataset.durum !== 'tamam') yukle(); });
} else {
  akis.replaceChildren(); $('#son-goller').replaceChildren(); $('#sonraki-mac').replaceChildren(); $('#siradaki-serit').replaceChildren();
  etiketYaz('Gündem'); $('#hero-baslik').replaceChildren('Çorumspor Taraftar');
}
await oturumS;
