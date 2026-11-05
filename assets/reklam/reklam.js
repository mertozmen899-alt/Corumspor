// Çorumspor reklam bileşeni (ES modülü, derleme gerekmez). Uygulamada yeri: assets/reklam/reklam.js
//
//   const { reklamYerlestir } = await import('./reklam/reklam.js');
//   reklamYerlestir(el, { alan: 'haber_sonu' });                     // el: .reklam-yuvasi[data-reklam-alan]
//   reklamYerlestir(el, { alan: 'mac_sponsoru', macId: mac.id });
//   reklamYuvalariniDoldur(document);                                // sayfadaki tüm .reklam-yuvasi öğeleri
//   akisaReklamEkle(document.querySelector('#haber-listesi'), 3);    // 3. haberden sonra
//
// Supabase istemcisi şu sırayla bulunur: ops.istemci → reklamIstemciAyarla(sb) → uygulamanın paylaşılan istemcisi
// (assets/istemci.js'in dışa aktardığı `supabase`; ?sahte=1 test modunda sahte istemci). Burada YENİ istemci açılmaz.
//
// Kurallar: reklam yoksa kapsayıcı boş ve gizli kalır (boş kutu yok). Açılır pencere, kaplama, sabit konum yok.
// Gösterim: kartın en az %50'si en az 1 sn görünür kalınca, sayfa ziyareti başına reklam başına bir kez.
// Tıklama: bağlantı normal açılır (yeni sekme), kayıt arka planda gider, gezinmeyi bekletmez.
// Tıklama tekrarı (30 dk) sekme kimliğiyle bakılır: aynı sekmede başka sayfaya geçilse de aynı reklama tekrar tıklama sayılmaz.

import { baglantiGecerli, eylemYazisi, reklamEtiketi, sekmeKimligi, yeniZiyaretKimligi } from './reklam-mantik.js';

/** Bu sayfa yüklemesinin ziyaret kimliği. Sadece bellekte (localStorage/çerez YOK), sayfa yenilenince değişir. */
export const SAYFA_ZIYARET_ID = yeniZiyaretKimligi();
/** Bu sekmenin rastgele kimliği (sessionStorage; sekme kapanınca silinir). SADECE tıklama tekrarı için gönderilir. */
export const SEKME_ID = sekmeKimligi();

const GORUNURLUK_ORANI = 0.5;
const GORUNURLUK_SURESI_MS = 1000;

let varsayilanIstemci = null;
const sayilanGosterimler = new Set(); // reklam id'leri (bu sayfa ziyaretinde)

/** Tüm yerleşimlerin kullanacağı supabase-js istemcisini ayarlar. */
export function reklamIstemciAyarla(istemci) { varsayilanIstemci = istemci; }

const istemciMi = (x) => !!x && typeof x.rpc === 'function';
let paylasilanSozu = null;
async function istemciBul(ops) {
  if (istemciMi(ops.istemci)) return ops.istemci;
  if (istemciMi(varsayilanIstemci)) return varsayilanIstemci;
  // Uygulamanın tek istemcisi. Aynı adres = aynı modül örneği: ikinci bir istemci oluşmaz, ayar.js yeniden çalışmaz.
  if (!paylasilanSozu) paylasilanSozu = import('../istemci.js').then((m) => m.supabase).catch(() => null);
  const x = await paylasilanSozu;
  return istemciMi(x) ? x : null;
}

function el(etiket, sinif, metin) {
  const e = document.createElement(etiket);
  if (sinif) e.className = sinif;
  if (metin != null) e.textContent = metin;
  return e;
}

/**
 * Reklam kartının HTML öğesini oluşturur (yönetim önizlemesi de bunu kullanır).
 * Veriler textContent ile yazılır (HTML enjeksiyonu yok); bağlantı geçersizse bağlantısız kart çıkar.
 * @param {object} reklam aktif_reklam satırı (firma_adi, gorsel_url, kisa_metin, baglanti_url, alan, mac_id)
 * @param {{onizleme?: boolean}} ops onizleme: tıklama gezinmez, hiçbir sayım yapılmaz
 */
export function reklamKartiOlustur(reklam, { onizleme = false } = {}) {
  const etiket = reklamEtiketi(reklam);
  const kart = el('aside', `reklam-kart reklam-kart--${reklam.alan}`);
  kart.setAttribute('aria-label', `${etiket}: ${reklam.firma_adi}`);
  kart.dataset.reklamId = reklam.id || '';
  if (onizleme) kart.dataset.onizleme = '1';

  kart.append(el('span', 'reklam-etiket', etiket));

  const url = reklam.baglanti_url && baglantiGecerli(reklam.baglanti_url) ? reklam.baglanti_url : null;
  const govde = url ? el('a', 'reklam-govde reklam-baglanti') : el('div', 'reklam-govde');
  if (url) {
    govde.href = url;
    govde.target = '_blank';
    govde.rel = 'sponsored noopener';
    if (onizleme) govde.addEventListener('click', (e) => e.preventDefault());
  }

  const resimKutu = el('div', 'reklam-gorsel-kutu');
  if (reklam.gorsel_url) {
    const img = el('img', 'reklam-gorsel');
    img.src = reklam.gorsel_url;
    img.alt = `${reklam.firma_adi} reklam görseli`;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.width = reklam.alan === 'mac_sponsoru' ? 160 : 1200;
    img.height = reklam.alan === 'mac_sponsoru' ? 160 : 628;
    resimKutu.append(img);
  }

  const yazi = el('div', 'reklam-yazi');
  yazi.append(el('strong', 'reklam-firma', reklam.firma_adi), el('p', 'reklam-metin', reklam.kisa_metin));
  if (url) yazi.append(el('span', 'reklam-eylem', eylemYazisi(url)));

  govde.append(resimKutu, yazi);
  kart.append(govde);
  return kart;
}

function kapsayiciyiBosalt(kapsayici) {
  // Her boşaltma yeni bir "tur" açar: süren eski reklamYerlestir istekleri dönünce kart eklemez (yeniden çizim / SPA geçişi)
  kapsayici._reklamTur = (kapsayici._reklamTur || 0) + 1;
  if (kapsayici._reklamTemizle) { kapsayici._reklamTemizle(); kapsayici._reklamTemizle = null; }
  kapsayici.replaceChildren();
  kapsayici.hidden = true;
  kapsayici.classList.add('reklam-yuva');
  kapsayici.classList.remove('reklam-yuva--dolu');
}

function olayGonder(istemci, reklam, tur, alan, macId) {
  // Beklemeyiz (await yok): kayıt gezinmeyi ya da sayfayı bekletmez; hata sessizce yutulur.
  try {
    const p = istemci.rpc('reklam_olay_kaydet', {
      p_reklam_id: reklam.id, p_tur: tur, p_sayfa_ziyaret_id: SAYFA_ZIYARET_ID,
      p_alan: alan, p_mac_id: macId,
      p_sekme_id: tur === 'tiklama' ? SEKME_ID : null, // gösterimde gönderilmez
    });
    if (p && typeof p.then === 'function') p.then(() => {}, () => {});
  } catch { /* yok say */ }
}

function gosterimiIzle(kart, sayGosterim) {
  if (typeof IntersectionObserver === 'undefined') return () => {};
  let zamanlayici = null;
  let gorunur = false;
  const durdur = () => { clearTimeout(zamanlayici); zamanlayici = null; };
  const baslat = () => {
    if (zamanlayici || !gorunur || document.visibilityState === 'hidden') return;
    zamanlayici = setTimeout(() => { zamanlayici = null; if (gorunur && document.visibilityState !== 'hidden') { sayGosterim(); temizle(); } }, GORUNURLUK_SURESI_MS);
  };
  const gozcu = new IntersectionObserver((girdiler) => {
    if (!kart.isConnected) { temizle(); return; } // yuva DOM'dan söküldü (sayfa yeniden çizildi): gözlemciyi bırak
    for (const g of girdiler) {
      gorunur = g.isIntersecting && g.intersectionRatio >= GORUNURLUK_ORANI;
      if (gorunur) baslat(); else durdur();
    }
  }, { threshold: [0, GORUNURLUK_ORANI, 1] });
  const sekme = () => (document.visibilityState === 'hidden' ? durdur() : baslat());
  document.addEventListener('visibilitychange', sekme);
  gozcu.observe(kart);
  function temizle() { durdur(); gozcu.disconnect(); document.removeEventListener('visibilitychange', sekme); }
  return temizle;
}

/**
 * Bir yerleşime o an yayındaki reklamı koyar. Reklam yoksa kapsayıcı boş ve gizli kalır.
 * @param {HTMLElement} kapsayici
 * @param {{alan: 'ana_akis'|'haber_sonu'|'mac_sponsoru', macId?: string|number|null, istemci?: object, onizleme?: boolean}} ops
 * @returns {Promise<object|null>} gösterilen reklam ya da null
 */
export async function reklamYerlestir(kapsayici, ops = {}) {
  const { alan, macId = null, onizleme = false } = ops;
  if (!kapsayici) return null;
  kapsayiciyiBosalt(kapsayici);
  const tur = kapsayici._reklamTur;
  const istemci = await istemciBul(ops);
  if (!istemci || !alan || kapsayici._reklamTur !== tur) return null;
  const mac = macId == null || macId === '' ? null : String(macId);

  let reklam = null;
  try {
    const { data, error } = await istemci.rpc('aktif_reklam', { p_alan: alan, p_mac_id: mac });
    if (error) return null;
    reklam = Array.isArray(data) ? data[0] : data;
  } catch { return null; }
  if (!reklam || !reklam.id || kapsayici._reklamTur !== tur) return null; // bu arada yeniden çağrıldı ya da kaldırıldı

  const kart = reklamKartiOlustur(reklam, { onizleme });
  kapsayici.append(kart);
  kapsayici.hidden = false;
  kapsayici.classList.add('reklam-yuva--dolu');
  if (onizleme) return reklam;

  const temizleyiciler = [];
  if (!sayilanGosterimler.has(reklam.id)) {
    temizleyiciler.push(gosterimiIzle(kart, () => {
      if (sayilanGosterimler.has(reklam.id)) return;
      sayilanGosterimler.add(reklam.id);
      olayGonder(istemci, reklam, 'gosterim', alan, mac);
    }));
  }
  const baglanti = kart.querySelector('a.reklam-baglanti');
  if (baglanti) {
    const tikla = (e) => { if (e.type === 'auxclick' && e.button !== 1) return; olayGonder(istemci, reklam, 'tiklama', alan, mac); };
    baglanti.addEventListener('click', tikla);
    baglanti.addEventListener('auxclick', tikla);
    temizleyiciler.push(() => { baglanti.removeEventListener('click', tikla); baglanti.removeEventListener('auxclick', tikla); });
  }
  kapsayici._reklamTemizle = () => temizleyiciler.forEach((f) => f());
  return reklam;
}

/**
 * Sayfadaki (ya da verilen kök içindeki) tüm .reklam-yuvasi[data-reklam-alan] öğelerini doldurur.
 * data-mac-id varsa maç sponsoru için kullanılır. Döner: Promise<gösterilen reklamlar dizisi>.
 */
export function reklamYuvalariniDoldur(kok = document, ops = {}) {
  const yuvalar = [...kok.querySelectorAll('.reklam-yuvasi[data-reklam-alan]')];
  return Promise.all(yuvalar.map((y) => reklamYerlestir(y, { ...ops, alan: y.dataset.reklamAlan, macId: y.dataset.macId || null })));
}

/** Yerleşimi kaldırır (SPA'da sayfa değişirken). */
export function reklamKaldir(kapsayici) { if (kapsayici) kapsayiciyiBosalt(kapsayici); }

/**
 * Haber akışında N. öğeden sonra bir reklam yuvası açar ve doldurur.
 * Liste N'den kısaysa hiçbir şey eklenmez. Döner: yuva öğesi (ya da null).
 */
export function akisaReklamEkle(liste, n = 3, ops = {}) {
  if (!liste) return null;
  const onceki = liste.querySelector(':scope > [data-akis-yuvasi]');
  if (onceki) { kapsayiciyiBosalt(onceki); onceki.remove(); } // gözlemci/dinleyici ve süren istek de bırakılır
  if (liste.children.length < n) return null;
  const yuva = document.createElement(liste.tagName === 'UL' || liste.tagName === 'OL' ? 'li' : 'div');
  yuva.dataset.akisYuvasi = '1';
  liste.children[n - 1].after(yuva);
  reklamYerlestir(yuva, { alan: 'ana_akis', ...ops });
  return yuva;
}
