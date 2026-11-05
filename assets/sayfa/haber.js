// Haber ayrıntısı: başlık, kapak, gövde (düz metin paragraflar), tarih, yorumlar
import { supabase, h, $, sayfaBaslat, param, kimlikGecerli, tarihYaz, guvenliGorsel, paragraflar } from '../ortak.js';
import { yorumlariKur } from '../yorumlar.js';
import { reklamYuvalariniDoldur } from '../reklam-yukle.js';

const kok = $('#haber');
const id = param('id');
const oturum = await sayfaBaslat();

function bulunamadi() {
  document.title = 'Haber bulunamadı · Çorumspor Taraftar';
  kok.replaceChildren(h('div', { class: 'kutu' }, h('h1', null, 'Haber bulunamadı'),
    h('p', null, 'Bu haber kaldırılmış ya da henüz yayınlanmamış olabilir.'), h('a', { class: 'dugme', href: 'index.html' }, 'Haberlere dön')));
  document.querySelector('.reklam-yuvasi[data-reklam-alan="haber_sonu"]')?.remove();
}

// Sunucuya ulaşılamadı (ağ hatası): "bulunamadı" demeyiz, haber aslında var olabilir
function yuklenemedi() {
  kok.replaceChildren(h('div', { class: 'kutu' }, h('h1', null, 'Haber yüklenemedi'),
    h('p', null, 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edip sayfayı yenileyin.'), h('a', { class: 'dugme', href: 'index.html' }, 'Haberlere dön')));
  document.querySelector('.reklam-yuvasi[data-reklam-alan="haber_sonu"]')?.remove();
}

if (!oturum.hazir) {
  kok.replaceChildren(); // sayfaBaslat uyarıyı gösterdi; "yükleniyor" yazısı kalmasın
} else {
  if (!kimlikGecerli(id)) bulunamadi();
  else {
    const { data: haber, error } = await supabase.from('haberler')
      .select('id, baslik, ozet, govde, kapak_url, yayin_tarihi, yayinda, created_at')
      .eq('id', id).maybeSingle();
    if (error) yuklenemedi();
    else if (!haber) bulunamadi();
    else {
      document.title = haber.baslik + ' · Çorumspor Taraftar';
      const kapak = guvenliGorsel(haber.kapak_url);
      kok.replaceChildren(h('article', { class: 'makale', id: 'makale' },
        kapak ? h('img', { class: 'kapak', src: kapak, alt: '', width: '1600', height: '900', fetchpriority: 'high' }) : null,
        h('div', { class: 'ic' },
          !haber.yayinda ? h('p', { class: 'mesaj bilgi' }, 'Bu haber taslak: sadece yöneticiler görebilir.') : null,
          h('h1', null, haber.baslik),
          h('time', { class: 'tarih', datetime: haber.yayin_tarihi || haber.created_at }, tarihYaz(haber.yayin_tarihi || haber.created_at)),
          haber.ozet ? h('p', { class: 'ozet' }, haber.ozet) : null,
          h('div', { class: 'metin', id: 'haber-metni' }, paragraflar(haber.govde)))));
      reklamYuvalariniDoldur();
      if (haber.yayinda) await yorumlariKur($('#yorumlar'), { haberId: haber.id, oturum });
    }
  }
}
