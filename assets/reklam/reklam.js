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
// Yalnız kartın düğmesi bağlantıdır; yöneticinin bakışları sayılmaz (istemcide is_admin, sunucuda reklam_olay_kaydet).
// Gösterim: kartın en az %50'si en az 1 sn görünür kalınca, sayfa ziyareti başına reklam başına bir kez. Görünür alan,
// yapışkan üst çubuk ve sabit alt menünün altında kalan kısım DEĞİLDİR (014: IntersectionObserver rootMargin, ortulenKenarlar).
// Yerleşim (014): kart sayfaya konunca bir kez ("sayfa açılışı"): görünürlük oranının paydası.
// Tıklama: bağlantı normal açılır (yeni sekme), kayıt arka planda gider, gezinmeyi bekletmez. Hangi düğme (web / whatsapp / ara)
// ayrı kaydedilir; tekrar kuralı (30 dk) sekme kimliğiyle ve düğme bazında bakılır.
// Sekme kimliği (sessionStorage, rastgele) 014'ten beri gösterimde de gönderilir: sunucu yalnız sekme başına saatlik sınır için
// en çok 2 saat bir sayaçta tutar, olaya yazmaz.

import { baglantiGecerli, eylemYazisi, gorselAdresiGecerli, MAC_SPONSORU_NOTU, reklamEtiketi, sekmeKimligi, SINIRLAR, telAdresi, tiklamaEylemi, whatsappBaglantisiMi, yeniZiyaretKimligi } from './reklam-mantik.js';

/** Bu sayfa yüklemesinin ziyaret kimliği. Sadece bellekte (localStorage/çerez YOK), sayfa yenilenince değişir. */
export const SAYFA_ZIYARET_ID = yeniZiyaretKimligi();
/** Bu sekmenin rastgele kimliği (sessionStorage; sekme kapanınca silinir). Tıklama tekrarı ve sekme başına sınır için gönderilir. */
export const SEKME_ID = sekmeKimligi();

const GORUNURLUK_ORANI = 0.5;
const GORUNURLUK_SURESI_MS = 1000;

let varsayilanIstemci = null;
const sayilanGosterimler = new Set(); // reklam id'leri (bu sayfa ziyaretinde)
const yerlesimler = new Set();        // yerleşimi gönderilen reklam id'leri (bu sayfa ziyaretinde)

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
 * Erişilebilirlik: etiket ("Sponsor"/"Reklam"/"Maçın sponsoru") kartın İLK öğesi ve gerçek metin (süs nokta aria-hidden);
 * kart haber sonunda ve maçta aside; akışta (liste öğesinin içinde) aside DEĞİL, div role="group" (014: tamamlayıcı yer işareti
 * en üst düzeyde olmalı); adı "Etiket: Firma"; YALNIZ düğme(ler) bağlantıdır (kartın tamamı değil: kaydırırken yanlış dokunuş açmaz);
 * bağlantı adı "Sponsor: Firma – Ayrıntılar (yeni sekmede açılır)"; görsel alt'ı = görseldeki yazı (yoksa süs, alt="").
 * @param {object} reklam aktif_reklam satırı
 * @param {{onizleme?: boolean}} ops onizleme: tıklama gezinmez, hiçbir sayım yapılmaz
 */
export function reklamKartiOlustur(reklam, { onizleme = false } = {}) {
  const etiket = reklamEtiketi(reklam);
  const akista = reklam.alan === 'ana_akis';
  const kart = el(akista ? 'div' : 'aside', `reklam-kart reklam-kart--${reklam.alan}`);
  if (akista) kart.setAttribute('role', 'group');
  kart.setAttribute('aria-label', `${etiket}: ${reklam.firma_adi}`);
  kart.dataset.reklamId = reklam.id || '';
  if (onizleme) kart.dataset.onizleme = '1';

  const et = el('p', 'reklam-etiket');
  const nokta = el('span', 'nokta', '●');
  nokta.setAttribute('aria-hidden', 'true');
  et.append(nokta, el('span', 'reklam-etiket-metin', etiket));
  kart.append(et);
  // Maç alanında not, başlıkla AYNI boyda ve AYNI renkte (başkan 1; stil.css .reklam-alt-etiket = .reklam-etiket rengi)
  if (reklam.alan === 'mac_sponsoru') kart.append(el('p', 'reklam-alt-etiket', MAC_SPONSORU_NOTU));

  const url = reklam.baglanti_url && baglantiGecerli(reklam.baglanti_url) ? reklam.baglanti_url : null;
  const tel = telAdresi(reklam.telefon);
  const govde = el('div', 'reklam-govde');

  const resimKutu = el('div', 'reklam-gorsel-kutu');
  if (reklam.gorsel_url) {
    const img = el('img', 'reklam-gorsel');
    const kare = reklam.alan === 'mac_sponsoru';
    img.src = reklam.gorsel_url;
    if (reklam.gorsel_kucuk_url && gorselAdresiGecerli(reklam.gorsel_kucuk_url)) {
      // Yuvasına göre boy: akışta ~144 px, maçta 64 px, haber sonunda tam genişlik
      img.srcset = `${reklam.gorsel_kucuk_url} ${kare ? 192 : 480}w, ${reklam.gorsel_url} ${kare ? 600 : 1200}w`;
      img.sizes = kare ? '64px' : reklam.alan === 'ana_akis' ? '144px' : '(max-width: 600px) 100vw, 44vw';
    }
    img.alt = (reklam.gorsel_metni || '').trim();
    img.loading = 'lazy';
    img.decoding = 'async';
    img.width = kare ? 160 : 1200;
    img.height = kare ? 160 : 628;
    // Görsel açılmazsa kutu tamamen kalkar (boş gri kutu ya da kırık görsel yazısı kalmaz), metin tam genişliğe yayılır
    img.addEventListener('error', () => resimKutu.remove(), { once: true });
    resimKutu.append(img);
    govde.append(resimKutu);
  }

  const yazi = el('div', 'reklam-yazi');
  yazi.append(el('strong', 'reklam-firma', reklam.firma_adi), el('p', 'reklam-metin', reklam.kisa_metin));
  const eylemler = el('div', 'reklam-eylemler');
  const dugme = (href, metin, ek, sinif, yeniSekme) => {
    const a = el('a', 'reklam-eylem ' + sinif);
    a.href = href;
    if (yeniSekme) { a.target = '_blank'; a.rel = 'sponsored noopener'; } else a.rel = 'sponsored';
    a.append(el('span', 'gorunmez', `${etiket}: ${reklam.firma_adi} – `), metin, el('span', 'gorunmez', ek));
    if (onizleme) a.addEventListener('click', (e) => e.preventDefault());
    return a;
  };
  if (url) {
    const wa = whatsappBaglantisiMi(url);
    const metin = (reklam.dugme_metni || '').trim() || eylemYazisi(url);
    eylemler.append(dugme(url, metin, wa ? ' (WhatsApp açılır)' : ' (yeni sekmede açılır)', 'reklam-baglanti', true));
  }
  if (tel) eylemler.append(dugme(tel, 'Ara', ' (telefonla arar)', 'reklam-ara', false));
  if (eylemler.children.length) yazi.append(eylemler);
  govde.append(yazi);
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

function olayGonder(istemci, reklam, tur, alan, macId, eylem = null) {
  // Beklemeyiz (await yok): kayıt gezinmeyi ya da sayfayı bekletmez; hata sessizce yutulur.
  try {
    const p = istemci.rpc('reklam_olay_kaydet', {
      p_reklam_id: reklam.id, p_tur: tur, p_sayfa_ziyaret_id: SAYFA_ZIYARET_ID,
      p_alan: alan, p_mac_id: macId,
      p_sekme_id: SEKME_ID, // 014: sekme başına saatlik sınır (gösterimde olaya yazılmaz)
      p_eylem: tur === 'tiklama' ? eylem : null,
    });
    if (p && typeof p.then === 'function') p.then(() => {}, () => {});
  } catch { /* yok say */ }
}

/**
 * Görünür alanı örten yapışkan üst çubuk ve sabit alt menü (px). Önce sayfanın ölçtüğü CSS değişkenleri (--ust-gercek,
 * --alt-menu-gercek; %200 yazıda gerçek boy), yoksa .ust ve .alt-nav öğelerinin o anki boyu (yalnız yapışkan/sabitse ve ekrandaysa).
 */
export function ortulenKenarlar(belge = document) {
  const kok = belge.documentElement;
  const degisken = (ad) => { const v = parseFloat(getComputedStyle(kok).getPropertyValue(ad)); return Number.isFinite(v) && v >= 0 ? v : null; };
  const yukseklik = (secici, konumlar) => {
    const e = belge.querySelector(secici);
    if (!e || e.hidden) return 0;
    const st = getComputedStyle(e);
    if (!konumlar.includes(st.position) || st.display === 'none' || st.visibility === 'hidden') return 0;
    const r = e.getBoundingClientRect();
    if (r.height <= 0 || r.bottom <= 0 || r.top >= window.innerHeight) return 0;
    return r.height;
  };
  const ust = degisken('--ust-gercek') ?? yukseklik('.ust', ['sticky', 'fixed']);
  const alt = degisken('--alt-menu-gercek') ?? yukseklik('.alt-nav', ['fixed', 'sticky']);
  // Görünür alanın yarısından fazlası örtülü sayılmasın (çok küçük ekran / büyük yazı)
  const sinir = window.innerHeight * 0.5;
  return { ust: Math.min(Math.round(ust), sinir), alt: Math.min(Math.round(alt), sinir) };
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
  }, (() => { const k = ortulenKenarlar(); return { threshold: [0, GORUNURLUK_ORANI, 1], rootMargin: `-${k.ust}px 0px -${k.alt}px 0px` }; })());
  const sekme = () => (document.visibilityState === 'hidden' ? durdur() : baslat());
  document.addEventListener('visibilitychange', sekme);
  gozcu.observe(kart);
  function temizle() { durdur(); gozcu.disconnect(); document.removeEventListener('visibilitychange', sekme); }
  return temizle;
}

// Yönetici (önizleme, kontrol amaçlı bakışlar) hiçbir gösterim/tıklama SAYDIRMAZ: sunucu da saymaz ('yonetici' döner, 013).
const yoneticiSozleri = new WeakMap();
function yoneticiMi(istemci) {
  if (!yoneticiSozleri.has(istemci)) {
    yoneticiSozleri.set(istemci, Promise.resolve().then(() => istemci.rpc('is_admin')).then((r) => !!(r && r.data === true)).catch(() => false));
  }
  return yoneticiSozleri.get(istemci);
}

// Akış: farklı firmalardan en fazla 3 reklam tek sorguda (aktif_reklamlar); sayfa ziyareti boyunca bir kez istenir.
// Sunucu yalnız bu 3'e olay yazar (014: sırada bekleyen reklam sayılmaz).
const akisSozleri = new Map();
function akisReklamlari(istemci, alan) {
  const anahtar = alan;
  if (!akisSozleri.has(anahtar)) {
    akisSozleri.set(anahtar, (async () => {
      try {
        const { data, error } = await istemci.rpc('aktif_reklamlar', { p_alan: alan, p_adet: SINIRLAR.akisYuvaSayisi });
        if (!error && Array.isArray(data)) return data;
      } catch { /* aşağıda tek reklama düş */ }
      try {
        const { data, error } = await istemci.rpc('aktif_reklam', { p_alan: alan, p_mac_id: null });
        if (error) return [];
        return Array.isArray(data) ? data : data ? [data] : [];
      } catch { return []; }
    })());
  }
  return akisSozleri.get(anahtar);
}

/** Akış reklamlarının sorgusunu (haber sorgusuyla paralel) önceden başlatır. */
export async function reklamOnYukle(alan = 'ana_akis', ops = {}) {
  const istemci = await istemciBul(ops);
  if (istemci) { akisReklamlari(istemci, alan); yoneticiMi(istemci); }
}

/**
 * Bir yerleşime o an yayındaki reklamı koyar. Reklam yoksa kapsayıcı boş ve gizli kalır.
 * @param {HTMLElement} kapsayici
 * @param {{alan: 'ana_akis'|'haber_sonu'|'mac_sponsoru', macId?: string|number|null, istemci?: object, onizleme?: boolean,
 *          sira?: number|null, gecGelirseAtla?: boolean}} ops
 *   sira: akışta kaçıncı sponsor (0 = ilk). Her sıra FARKLI bir firmadır; o sırada firma yoksa yuva boş kalır.
 *   gecGelirseAtla: kart, yuva açıldıktan 150 ms sonra geldiyse ve yuva o an görünür alanda ya da üstündeyse EKLENMEZ
 *   (okunan yer kaymasın; odak kartın altındaki bir öğedeyken de).
 * @returns {Promise<object|null>} gösterilen reklam ya da null
 */
export async function reklamYerlestir(kapsayici, ops = {}) {
  const { alan, macId = null, onizleme = false, sira = null, gecGelirseAtla = false } = ops;
  if (!kapsayici) return null;
  const acilis = kapsayici._acilis || performance.now();
  kapsayiciyiBosalt(kapsayici);
  const tur = kapsayici._reklamTur;
  const istemci = await istemciBul(ops);
  if (!istemci || !alan || kapsayici._reklamTur !== tur) return null;
  const mac = macId == null || macId === '' ? null : String(macId);

  let reklam = null;
  if (sira != null && alan !== 'mac_sponsoru') {
    const liste = await akisReklamlari(istemci, alan);
    reklam = liste[Number(sira) || 0] || null;
  } else {
    try {
      const { data, error } = await istemci.rpc('aktif_reklam', { p_alan: alan, p_mac_id: mac });
      if (error) return null;
      reklam = Array.isArray(data) ? data[0] : data;
    } catch { return null; }
  }
  if (!reklam || !reklam.id || kapsayici._reklamTur !== tur) return null; // bu arada yeniden çağrıldı ya da kaldırıldı
  if (gecGelirseAtla && !onizleme && performance.now() - acilis > 150 && kapsayici.isConnected) {
    const ust = kapsayici.getBoundingClientRect().top;
    const odak = document.activeElement;
    const odakAltta = odak && odak !== document.body && !!(kapsayici.compareDocumentPosition(odak) & Node.DOCUMENT_POSITION_FOLLOWING);
    if (ust < window.innerHeight || (odakAltta && ust < window.innerHeight * 2)) return null;
  }

  const kart = reklamKartiOlustur(reklam, { onizleme });
  kapsayici.append(kart);
  kapsayici.hidden = false;
  kapsayici.classList.add('reklam-yuva--dolu');
  if (onizleme) return reklam;
  if (await yoneticiMi(istemci)) { kart.dataset.sayim = 'yonetici'; return reklam; }
  if (kapsayici._reklamTur !== tur) return reklam;

  const temizleyiciler = [];
  // 014: yerleşim (kart sayfada; görünürlük oranının paydası), sayfa ziyareti başına reklam başına bir
  if (!yerlesimler.has(reklam.id)) { yerlesimler.add(reklam.id); olayGonder(istemci, reklam, 'yerlesim', alan, mac); }
  if (!sayilanGosterimler.has(reklam.id)) {
    temizleyiciler.push(gosterimiIzle(kart, () => {
      if (sayilanGosterimler.has(reklam.id)) return;
      sayilanGosterimler.add(reklam.id);
      olayGonder(istemci, reklam, 'gosterim', alan, mac);
    }));
  }
  for (const baglanti of kart.querySelectorAll('a.reklam-eylem')) {
    const eylem = tiklamaEylemi(baglanti.getAttribute('href'));
    const tikla = (e) => { if (e.type === 'auxclick' && e.button !== 1) return; olayGonder(istemci, reklam, 'tiklama', alan, mac, eylem); };
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
  return Promise.all(yuvalar.map((y) => reklamYerlestir(y, { ...ops, alan: y.dataset.reklamAlan, macId: y.dataset.macId || null, sira: y.dataset.reklamSira != null ? Number(y.dataset.reklamSira) : null })));
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
