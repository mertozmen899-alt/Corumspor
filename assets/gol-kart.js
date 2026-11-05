// Gol kartları (ana sayfa şeridi, gol arşivi, maç ve gol sayfası): her gol TEK bağlantı → gol.html?id=
// Videolu gol: 16:9 kapak (sitenin kendi görseli; YouTube küçük resmi İSTENMEZ), oynat simgesi, dakika ve süre rozeti.
// Videosuz gol: kompakt satır. Bağlantının adı: oyuncu, "23. dakika", rakip maçı, süre (ekran okuyucu sırası).
import { h, simge, OYNAT_YOLU, dakikaMetni, dakikaOkunus, sureMetni, kapakKaynagi, tarihYaz, evSahibiDeplasman, skorMetni, youtubeKimlik, mp4Mu } from './ortak.js';

export const videoVar = (gol) => !!gol.video_url && (!!youtubeKimlik(gol.video_url) || mp4Mu(gol.video_url));

export function macEtiketi(mac) {
  if (!mac) return '';
  const [ev, dep] = evSahibiDeplasman(mac);
  const skor = skorMetni(mac);
  return `${ev} ${skor ? skor.replace(' - ', '–') : '–'} ${dep}`;
}

export function golKarti(gol, mac, { ilk = false } = {}) {
  const href = 'gol.html?id=' + encodeURIComponent(gol.id);
  const sure = sureMetni(gol.sure_sn);
  const rakip = mac ? mac.rakip : '';
  if (!videoVar(gol)) {
    return h('a', { class: 'gol-satir', href, 'data-gol-id': gol.id },
      h('span', { class: 'dakika', 'aria-hidden': 'true' }, dakikaMetni(gol)),
      h('span', null, h('span', { class: 'oyuncu' }, gol.oyuncu), h('span', { class: 'gorunmez' }, `, ${dakikaOkunus(gol)}${rakip ? ', ' + rakip + ' maçı' : ''}, video yok`)),
      gol.penalti ? h('span', { class: 'rozet' }, 'Penaltı') : h('span', { 'aria-hidden': 'true', class: 'soluk' }, '›'));
  }
  const k = kapakKaynagi(gol.kapak_url, { varsayilan: 480 });
  return h('a', { class: 'video-kart', href, 'data-gol-id': gol.id },
    h('span', { class: 'kapak' },
      k ? h('img', { src: k.src, srcset: k.srcset, sizes: '(max-width: 599px) 80vw, 320px', alt: '', width: '480', height: '270', loading: ilk ? 'eager' : 'lazy', decoding: 'async' })
        : h('span', { class: 'kapak-yok', 'aria-hidden': 'true' }),
      h('span', { class: 'dakika-rozet', 'aria-hidden': 'true' }, dakikaMetni(gol)),
      h('span', { class: 'oynat', 'aria-hidden': 'true' }, simge(OYNAT_YOLU, { dolu: true })),
      sure ? h('span', { class: 'sure-rozet', 'aria-hidden': 'true' }, sure) : null),
    h('span', { class: 'baslik' }, gol.oyuncu, gol.penalti ? ' · Penaltı' : gol.aciklama ? ' · ' + gol.aciklama.replace(/\.$/, '') : ''),
    h('span', { class: 'meta' }, macEtiketi(mac), mac ? ' · ' + tarihYaz(mac.tarih, { saat: false, kisa: true, yil: false }) : ''),
    h('span', { class: 'gorunmez' }, `, ${dakikaOkunus(gol)}${rakip ? ', ' + rakip + ' maçı' : ''}${sure ? ', video ' + sure : ', video'}`));
}
