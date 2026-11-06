// Haber ayrıntısı: kapak (atfıyla; 16:9, başlık ilk ekranda), başlık, tarih, varsa "Düzeltme" kutusu, gövde (düz metin
// paragraflar), "Kaynak: …" satırı, Paylaş, haber sonu reklamı, yorumlar. Kapak alt metni = haberler.kapak_alt (yoksa boş: süs).
// Yorum bileşeni tembel yüklenir (ilk çizimi beklemesin). Sorgu oturumu beklemez.
import { supabase, hazir, h, $, sayfaBaslat, param, kimlikGecerli, tarihYaz, kapakKaynagi, kapakGorseli, tamGenislik, fotoAtfi, paragraflar, cevrimdisiKutusu, paylasDugmesi } from '../ortak.js';
import { reklamYuvalariniDoldur } from '../reklam-yukle.js';

const kok = $('#haber');
const id = param('id');
const oturumS = sayfaBaslat();
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

async function yukle() {
  if (!kimlikGecerli(id)) return bulunamadi();
  const { data: haber, error } = await supabase.from('haberler')
    .select('id, baslik, ozet, govde, kapak_url, kapak_kaynak, kapak_alt, kaynak, kaynak_url, duzeltme_notu, yayin_tarihi, yayinda, created_at')
    .eq('id', id).maybeSingle();
  if (error) return yuklenemedi();
  if (!haber) return bulunamadi();
  document.title = haber.baslik + ' · Çorumspor Taraftar';
  const k = kapakKaynagi(haber.kapak_url, { varsayilan: 800, kutu: tamGenislik() });
  const atif = k ? fotoAtfi(haber.kapak_url, haber.kapak_kaynak) : null;
  const alt = metinMi(haber.kapak_alt) ? haber.kapak_alt.trim() : '';
  kok.replaceChildren(h('article', { class: 'makale', id: 'makale' },
    k ? h('div', { class: 'kapak-cerceve' },
      kapakGorseli(k, { sinif: 'kapak-buyuk', alt, width: '1600', height: '900', fetchpriority: 'high' }),
      atif ? h('p', { class: 'foto-atif' }, atif) : null) : null,
    !haber.yayinda ? h('p', { class: 'mesaj bilgi' }, 'Bu haber taslak: sadece yöneticiler görebilir.') : null,
    h('h1', null, haber.baslik),
    h('time', { class: 'tarih', datetime: haber.yayin_tarihi || haber.created_at }, tarihYaz(haber.yayin_tarihi || haber.created_at)),
    metinMi(haber.duzeltme_notu) ? h('aside', { class: 'duzeltme', id: 'haber-duzeltme', 'aria-label': 'Düzeltme' },
      h('p', null, h('strong', null, 'Düzeltme: '), haber.duzeltme_notu.trim())) : null,
    haber.ozet ? h('p', { class: 'ozet' }, haber.ozet) : null,
    h('div', { class: 'metin', id: 'haber-metni' }, paragraflar(haber.govde)),
    kaynakSatiri(haber),
    haber.yayinda ? h('div', { class: 'eylem-satir' }, paylasDugmesi(haber.baslik)) : null));
  kok.dataset.durum = 'tamam';
  reklamYuvalariniDoldur();
  if (haber.yayinda) {
    const [{ yorumlariKur }, oturum] = await Promise.all([import('../yorumlar.js'), oturumS]);
    await yorumlariKur($('#yorumlar'), { haberId: haber.id, oturum });
  }
}

if (!hazir) { kok.replaceChildren(); yuvaKaldir(); }
else yukle();
await oturumS;
