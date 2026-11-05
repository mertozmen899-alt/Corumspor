// Haber ayrıntısı: kapak (atfıyla), başlık, gövde (düz metin paragraflar), tarih, haber sonu reklamı, yorumlar.
// Yorum bileşeni tembel yüklenir (ilk çizimi beklemesin). Sorgu oturumu beklemez.
import { supabase, hazir, h, $, sayfaBaslat, param, kimlikGecerli, tarihYaz, kapakKaynagi, fotoAtfi, paragraflar, cevrimdisiKutusu } from '../ortak.js';
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

async function yukle() {
  if (!kimlikGecerli(id)) return bulunamadi();
  const { data: haber, error } = await supabase.from('haberler')
    .select('id, baslik, ozet, govde, kapak_url, kapak_kaynak, yayin_tarihi, yayinda, created_at')
    .eq('id', id).maybeSingle();
  if (error) return yuklenemedi();
  if (!haber) return bulunamadi();
  document.title = haber.baslik + ' · Çorumspor Taraftar';
  const k = kapakKaynagi(haber.kapak_url, { varsayilan: 800 });
  const atif = k ? fotoAtfi(haber.kapak_url, haber.kapak_kaynak) : null;
  kok.replaceChildren(h('article', { class: 'makale', id: 'makale' },
    k ? h('div', { class: 'kapak-cerceve' },
      h('img', { class: 'kapak-buyuk', src: k.src, srcset: k.srcset, sizes: '(max-width: 760px) 100vw, 720px', alt: '', width: '1600', height: '900', fetchpriority: 'high' }),
      atif ? h('p', { class: 'foto-atif' }, atif) : null) : null,
    !haber.yayinda ? h('p', { class: 'mesaj bilgi' }, 'Bu haber taslak: sadece yöneticiler görebilir.') : null,
    h('h1', null, haber.baslik),
    h('time', { class: 'tarih', datetime: haber.yayin_tarihi || haber.created_at }, tarihYaz(haber.yayin_tarihi || haber.created_at)),
    haber.ozet ? h('p', { class: 'ozet' }, haber.ozet) : null,
    h('div', { class: 'metin', id: 'haber-metni' }, paragraflar(haber.govde))));
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
