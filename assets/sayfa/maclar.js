// Fikstür (planlandı/canlı, yakından uzağa) ve sonuçlar (bitti, yeniden eskiye)
import { supabase, h, $, mesaj, sayfaBaslat, tarihYaz, saatYaz, hataMetni, evSahibiDeplasman, skorMetni, durumRozeti } from '../ortak.js';

function sonucSinifi(mac) {
  if (mac.durum !== 'bitti') return '';
  if (mac.corum_skor > mac.rakip_skor) return 'sonuc-g';
  if (mac.corum_skor < mac.rakip_skor) return 'sonuc-m';
  return '';
}

function macSatiri(mac) {
  const [ev, dep] = evSahibiDeplasman(mac);
  const skor = skorMetni(mac);
  return h('a', { class: 'mac-satiri', href: 'mac.html?id=' + encodeURIComponent(mac.id), 'data-mac-id': mac.id },
    h('span', { class: 'eslesme' }, ev, ' – ', dep),
    h('span', { class: 'skor ' + sonucSinifi(mac) }, skor || saatYaz(mac.tarih)),
    h('span', { class: 'bilgi' },
      durumRozeti(mac.durum),
      h('time', { datetime: mac.tarih }, tarihYaz(mac.tarih, { gun: true, kisa: true })),
      h('span', null, mac.ic_saha ? 'İç saha' : 'Deplasman'),
      mac.organizasyon ? h('span', null, mac.organizasyon) : null));
}

const oturum = await sayfaBaslat();
if (oturum.hazir) {
  const { data, error } = await supabase.from('maclar')
    .select('id, rakip, tarih, stadyum, ic_saha, organizasyon, corum_skor, rakip_skor, durum')
    .order('tarih', { ascending: true })
    .limit(300);
  if (error) {
    mesaj($('#mac-mesaj'), hataMetni(error, 'Maçlar yüklenemedi.'));
    $('#gelecek').replaceChildren();
  } else {
    const gelecek = data.filter((m) => m.durum !== 'bitti');
    const biten = data.filter((m) => m.durum === 'bitti').reverse();
    $('#gelecek').replaceChildren(...(gelecek.length ? gelecek.map(macSatiri) : [h('p', { class: 'bos' }, 'Planlanmış maç yok.')]));
    $('#sonuclar').replaceChildren(...(biten.length ? biten.map(macSatiri) : [h('p', { class: 'bos' }, 'Henüz oynanmış maç yok.')]));
  }
}
