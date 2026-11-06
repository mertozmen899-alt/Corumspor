// Haber ayrıntısı: kapak (atfıyla; 16:9, başlık ilk ekranda), başlık, tarih, varsa "Düzeltme" kutusu, gövde (düz metin
// paragraflar), "Kaynak: …" satırı, Paylaş, haber sonu reklamı, yorumlar. Kapak alt metni = haberler.kapak_alt (yoksa boş: süs).
// Yorum bileşeni tembel yüklenir (ilk çizimi beklemesin). Sorgu oturumu beklemez.
// Önce son görülen kayıt (onbellek.js: bu haber daha önce açıldıysa tamamı, yoksa ana sayfa listesindeki başlık + kapak) ANINDA çizilir
// (data-durum="onbellek"; kapak görseli ağ sorgusunu beklemeden iner: performans 3. tur 2), sonra ağdan tazelenir; kapak <img>'i
// aynı adresse yeniden kurulmaz (titreme yok).
import { supabase, hazir, h, $, sayfaBaslat, param, kimlikGecerli, tarihYaz, saatYaz, kapakKaynagi, kapakGorseli, tamGenislik, fotoAtfi, paragraflar, cevrimdisiKutusu, paylasDugmesi } from '../ortak.js';
import { reklamYuvalariniDoldur } from '../reklam-yukle.js';
import { sonVeri, sonKayit, sonKayitYaz } from '../onbellek.js';
import { begeniDugmesi } from '../begeni.js';

const kok = $('#haber');
const id = param('id');
const oturumS = sayfaBaslat();
// 020: beğeni düğmesi bir kez kurulur (önbellek + ağ çizimi aynı düğmeyi taşır; sayı tek istekle)
let begeni = null;
const begeniAl = () => (begeni = begeni || begeniDugmesi('haber', id, oturumS));
const yuvaKaldir = () => document.querySelector('.reklam-yuvasi[data-reklam-alan="haber_sonu"]')?.remove();

function bulunamadi() {
  document.title = 'Haber bulunamadı · Çorumspor Taraftar';
  kok.replaceChildren(h('div', { class: 'kutu' }, h('h1', null, 'Haber bulunamadı'),
    h('p', null, 'Bu haber kaldırılmış ya da henüz yayınlanmamış olabilir.'), h('a', { class: 'dugme', href: 'index.html' }, 'Haberlere dön')));
  kok.dataset.durum = 'tamam';
  yuvaKaldir();
}

// Sunucuya ulaşılamadı (ağ hatası): "bulunamadı" demeyiz, haber aslında var olabilir
function yuklenemedi() {
  if (kok.dataset.durum === 'onbellek') {
    // Son görülen hâli ekranda: üstüne "bağlantı yok" kutusu (boş sayfa yerine)
    $('#makale').prepend(cevrimdisiKutusu('Bağlantı yok; bu haberin son görülen hâli gösteriliyor.', () => location.reload()));
    yuvaKaldir();
    return;
  }
  kok.replaceChildren(h('div', { class: 'kutu' }, h('h1', null, 'Haber yüklenemedi'),
    cevrimdisiKutusu('Sunucuya ulaşılamadı. İnternet bağlantını kontrol edip tekrar dene.', () => location.reload()),
    h('a', { class: 'dugme ikincil', href: 'index.html' }, 'Haberlere dön')));
  kok.dataset.durum = 'hata';
  yuvaKaldir();
}

const KAYNAK_URL = /^https:\/\/[a-z0-9.-]+\.[a-z]{2,63}(\/[^\s"<>]*)?$/i;
const metinMi = (x) => typeof x === 'string' && x.trim().length > 0;

/** "Kaynak: X" (kaynak_url https ise bağlantı, yeni sekmede; nofollow: kaynağa "oy" vermiyoruz). */
function kaynakSatiri(haber) {
  if (!metinMi(haber.kaynak)) return null;
  const url = typeof haber.kaynak_url === 'string' && KAYNAK_URL.test(haber.kaynak_url) ? haber.kaynak_url : null;
  return h('p', { class: 'haber-kaynak', id: 'haber-kaynak' }, 'Kaynak: ',
    url ? h('a', { href: url, target: '_blank', rel: 'noopener nofollow' }, haber.kaynak.trim(), h('span', { class: 'gorunmez' }, ' (yeni sekmede açılır)')) : haber.kaynak.trim());
}

/** "Düzeltme (5 Kasım 2026, 14:20): …" (tarih sunucunun yazdığı duzeltme_tarihi; yoksa yalnız "Düzeltme:"; başkan 3. tur 3). */
function duzeltmeKutusu(haber) {
  if (!metinMi(haber.duzeltme_notu)) return null;
  const t = haber.duzeltme_tarihi && !isNaN(Date.parse(haber.duzeltme_tarihi)) ? haber.duzeltme_tarihi : null;
  return h('aside', { class: 'duzeltme', id: 'haber-duzeltme', 'aria-label': 'Düzeltme' },
    h('p', null, h('strong', null, 'Düzeltme', t ? [' (', h('time', { datetime: t }, `${tarihYaz(t, { saat: false })}, ${saatYaz(t)}`), ')'] : null, ': '), haber.duzeltme_notu.trim()));
}

const GOVDE_SAKLA = 2000; // daha uzun gövde önbelleğe yazılmaz (30 KB sınırı): o haber önbellekten başlık + kapakla çizilir

/** Haberi çizer. kismi: gövdesi olmayan önbellek kaydı (ana sayfa listesinden): gövde yerine iskelet, kaynak/paylaş yok. */
function haberCiz(haber, { kismi = false } = {}) {
  document.title = haber.baslik + ' · Çorumspor Taraftar';
  const k = kapakKaynagi(haber.kapak_url, { varsayilan: 800, kutu: tamGenislik() });
  const atif = k ? fotoAtfi(haber.kapak_url, haber.kapak_kaynak) : null;
  const alt = metinMi(haber.kapak_alt) ? haber.kapak_alt.trim() : '';
  let kapak = k ? kapakGorseli(k, { sinif: 'kapak-buyuk', alt, width: '1600', height: '900', fetchpriority: 'high' }) : null;
  // Önbellekten çizilmiş aynı kapak varsa o <img> kullanılır (yeniden indirme / çözme titremesi yok)
  const onceki = kok.querySelector('#makale img.kapak-buyuk');
  if (kapak && onceki && onceki.getAttribute('src') === kapak.getAttribute('src')) { onceki.alt = alt; kapak = onceki; }
  const govde = typeof haber.govde === 'string' ? haber.govde : null;
  kok.replaceChildren(h('article', { class: 'makale', id: 'makale' },
    kapak ? h('div', { class: 'kapak-cerceve' }, kapak, atif ? h('p', { class: 'foto-atif' }, atif) : null) : null,
    haber.yayinda === false ? h('p', { class: 'mesaj bilgi' }, 'Bu haber taslak: sadece yöneticiler görebilir.') : null,
    h('h1', null, haber.baslik),
    h('time', { class: 'tarih', datetime: haber.yayin_tarihi || haber.created_at }, tarihYaz(haber.yayin_tarihi || haber.created_at)),
    duzeltmeKutusu(haber),
    haber.ozet ? h('p', { class: 'ozet' }, haber.ozet) : null,
    govde != null && !kismi ? h('div', { class: 'metin', id: 'haber-metni' }, paragraflar(govde))
      : h('div', { class: 'metin', id: 'haber-metni', 'aria-hidden': 'true' }, h('span', { class: 'iskelet iskelet-satir uzun' }), h('span', { class: 'iskelet iskelet-satir uzun' }), h('span', { class: 'iskelet iskelet-satir kisa' })),
    kismi ? null : kaynakSatiri(haber),
    !kismi && haber.yayinda ? [h('div', { class: 'eylem-satir' }, begeniAl().dugme, paylasDugmesi(haber.baslik)), begeniAl().not] : null));
}

/** Son görülen kayıt: bu haber daha önce açıldıysa (gövdesi kısaltılmış olabilir), yoksa ana sayfa listesindeki satırı. */
function onbellektenCiz() {
  const tam = sonKayit('haber', id);
  if (tam) { haberCiz(tam, { kismi: !!tam.kisaltildi }); kok.dataset.durum = 'onbellek'; return true; }
  const ana = sonVeri('ana');
  const d = (ana && ana.veri) || {};
  const liste = [...(Array.isArray(d.haberler) ? d.haberler : []), d.hero && d.hero.haber].filter(Boolean);
  const satir = liste.find((x) => x.id === id);
  if (!satir) return false;
  haberCiz({ ...satir, yayinda: true }, { kismi: true });
  kok.dataset.durum = 'onbellek';
  return true;
}

async function yukle() {
  if (!kimlikGecerli(id)) return bulunamadi();
  onbellektenCiz();
  const { data: haber, error } = await supabase.from('haberler')
    .select('id, baslik, ozet, govde, kapak_url, kapak_kaynak, kapak_alt, kaynak, kaynak_url, duzeltme_notu, duzeltme_tarihi, yayin_tarihi, yayinda, created_at')
    .eq('id', id).maybeSingle();
  if (error) return yuklenemedi();
  if (!haber) return bulunamadi();
  haberCiz(haber);
  kok.dataset.durum = 'tamam';
  // Yalnız yayındaki haber saklanır (taslak yöneticiye özeldir); gövde kısaltılırsa önbellekten kısmi çizilir
  if (haber.yayinda) {
    const kisa = typeof haber.govde === 'string' && haber.govde.length > GOVDE_SAKLA;
    sonKayitYaz('haber', { ...haber, govde: kisa ? null : haber.govde, kisaltildi: kisa || undefined }, 3);
  }
  // Yorumlar, yukarıdaki reklam yuvası yerleşince (en çok 1,5 sn) kurulur: geç gelen kart yorumları aşağı itmesin (CLS)
  const reklamYerlesti = Promise.race([reklamYuvalariniDoldur().catch(() => {}), new Promise((r) => setTimeout(r, 1500))]);
  if (haber.yayinda) {
    const [{ yorumlariKur }, oturum] = await Promise.all([import('../yorumlar.js'), oturumS, reklamYerlesti]);
    await yorumlariKur($('#yorumlar'), { haberId: haber.id, oturum });
  }
}

if (!hazir) { kok.replaceChildren(); yuvaKaldir(); }
else yukle();
await oturumS;
