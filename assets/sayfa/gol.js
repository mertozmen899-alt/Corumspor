// Gol ayrıntısı (gol.html?id=): video (kapak + oynat; iframe/video YALNIZ dokununca), golün anlatımı, maç bağlantısı,
// WhatsApp'ta paylaş, bu maçın diğer golleri, taraftar yorumları (yorumlar.js, gol_id).
import { supabase, hazir, h, $, sayfaBaslat, param, kimlikGecerli, tarihYaz, dakikaOgesi, dakikaOkunus, sureMetni, videoFasad, fotoAtfi, cevrimdisiKutusu, simge } from '../ortak.js';
import { golKarti, macEtiketi } from '../gol-kart.js';

const kok = $('#gol');
const id = param('id');
const oturumS = sayfaBaslat();
const WA_YOLU = 'M20 11.5a8.5 8.5 0 0 1-12.6 7.4L3 20l1.2-4.2A8.5 8.5 0 1 1 20 11.5z';

function bulunamadi() {
  document.title = 'Gol bulunamadı · Çorumspor Taraftar';
  kok.replaceChildren(h('div', { class: 'kutu' }, h('h1', null, 'Gol bulunamadı'), h('a', { class: 'dugme', href: 'goller.html' }, 'Gol arşivine dön')));
  kok.dataset.durum = 'tamam';
}

async function yukle() {
  if (!kimlikGecerli(id)) return bulunamadi();
  const { data: gol, error } = await supabase.from('goller')
    .select('id, mac_id, oyuncu, dakika, ek_dakika, penalti, video_url, aciklama, kapak_url, sure_sn, maclar(id, rakip, tarih, ic_saha, corum_skor, rakip_skor, durum)')
    .eq('id', id).maybeSingle();
  if (error) {
    kok.replaceChildren(cevrimdisiKutusu('Gol yüklenemedi. İnternet bağlantını kontrol et.', () => location.reload()));
    kok.dataset.durum = 'hata';
    return;
  }
  if (!gol) return bulunamadi();
  const mac = gol.maclar;
  const sure = sureMetni(gol.sure_sn);
  document.title = `${gol.oyuncu} golü · Çorumspor Taraftar`;
  const baslik = `Gol videosu: ${gol.oyuncu}, ${dakikaOkunus(gol)}${mac ? ', ' + mac.rakip + ' maçı' : ''}`;
  const video = videoFasad(gol.video_url, { baslik, kapak: gol.kapak_url, sure });
  const atif = video && gol.kapak_url ? fotoAtfi(gol.kapak_url) : null;
  if (video && atif) video.append(h('p', { class: 'foto-atif' }, atif));
  const paylasMetni = `${gol.oyuncu} ${dakikaOkunus(gol)}${mac ? ' · ' + macEtiketi(mac) : ''} ⚽ ${location.href.split('#')[0]}`;
  kok.replaceChildren(h('article', { 'aria-labelledby': 'gol-baslik' },
    video,
    video ? h('p', { class: 'video-not', id: 'video-not' }, gol.video_url.includes('.mp4')
      ? 'Video dokununca yüklenir. Bu videoda altyazı yok; golün anlatımı aşağıda.'
      : 'Dokununca YouTube oynatıcısı açılır (altyazı yükleyene bağlı); o ana kadar YouTube\'a bağlanılmaz.') : null,
    h('div', { class: 'gol-bas' },
      h('h1', { id: 'gol-baslik' }, dakikaOgesi(gol), h('span', null, gol.oyuncu), gol.penalti ? h('span', { class: 'rozet' }, 'Penaltı') : null),
      h('h2', { class: 'gorunmez' }, 'Golün anlatımı'),
      h('p', { id: 'gol-anlatim' }, gol.aciklama || `${gol.oyuncu}, ${dakikaOkunus(gol)}${gol.penalti ? ' penaltıdan' : ''} golü attı.`),
      !video ? h('p', { class: 'soluk' }, 'Bu golün videosu yok.') : null,
      mac ? h('a', { class: 'mac-baglanti', href: 'mac.html?id=' + encodeURIComponent(mac.id) }, h('span', null, macEtiketi(mac), ' · ', tarihYaz(mac.tarih, { saat: false, kisa: true })), h('span', { 'aria-hidden': 'true' }, '→')) : null,
      h('div', { class: 'eylem-satir' },
        h('a', { class: 'paylas', href: 'https://wa.me/?text=' + encodeURIComponent(paylasMetni), target: '_blank', rel: 'noopener' },
          simge(WA_YOLU), h('span', null, "WhatsApp'ta paylaş"), h('span', { class: 'gorunmez' }, ' (yeni sekmede açılır)'))))));
  kok.dataset.durum = 'tamam';

  if (mac) {
    supabase.from('goller').select('id, oyuncu, dakika, ek_dakika, penalti, video_url, aciklama, kapak_url, sure_sn').eq('mac_id', mac.id).then(({ data }) => {
      const digerleri = (data || []).filter((g) => g.id !== gol.id).sort((a, b) => a.dakika - b.dakika);
      if (!digerleri.length) return;
      $('#diger-goller').replaceChildren(...digerleri.map((g) => h('li', null, golKarti(g, mac))));
      $('#diger-goller-bolumu').hidden = false;
    });
  }
  const [{ yorumlariKur }, oturum] = await Promise.all([import('../yorumlar.js'), oturumS]);
  await yorumlariKur($('#yorumlar'), { golId: gol.id, oturum });
}

if (!hazir) kok.replaceChildren(); else yukle();
await oturumS;
