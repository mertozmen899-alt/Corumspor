// Gol ayrıntısı (gol.html?id=): video (kapak + oynat; iframe/video YALNIZ dokununca), "Video: <kaynak>" (hak sahibi),
// golün anlatımı, maç bağlantısı, Paylaş (telefonun menüsü ya da WhatsApp), bu maçın diğer golleri, taraftar yorumları
// (yorumlar.js, gol_id). DOM'da h1 videodan ÖNCE (başlıkla gezen video düğmesini atlamasın); görsel sırada video üstte (CSS order).
import { supabase, hazir, h, $, sayfaBaslat, param, kimlikGecerli, dakikaOgesi, dakikaOkunus, sureMetni, videoFasad, fotoAtfi, cevrimdisiKutusu, paylasDugmesi, altyaziGecerli } from '../ortak.js';
import { golKarti, macEtiketi, kartTarihi } from '../gol-kart.js';

const kok = $('#gol');
const id = param('id');
const oturumS = sayfaBaslat();

function bulunamadi() {
  document.title = 'Gol bulunamadı · Çorumspor Taraftar';
  kok.replaceChildren(h('div', { class: 'kutu' }, h('h1', null, 'Gol bulunamadı'), h('a', { class: 'dugme', href: 'goller.html' }, 'Gol arşivine dön')));
  kok.dataset.durum = 'tamam';
}

async function yukle() {
  if (!kimlikGecerli(id)) return bulunamadi();
  const { data: gol, error } = await supabase.from('goller')
    .select('id, mac_id, oyuncu, dakika, ek_dakika, penalti, video_url, video_kaynak, altyazi_url, aciklama, kapak_url, sure_sn, maclar(id, rakip, tarih, ic_saha, corum_skor, rakip_skor, durum)')
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
  const baslik = `${gol.oyuncu}, ${dakikaOkunus(gol)}${mac ? ', ' + mac.rakip + ' maçı' : ''}`;
  const altyazi = altyaziGecerli(gol.altyazi_url) ? gol.altyazi_url : null;
  const video = videoFasad(gol.video_url, { baslik: 'Gol videosu: ' + baslik, kapak: gol.kapak_url, sure, altyazi });
  const atif = video && gol.kapak_url ? fotoAtfi(gol.kapak_url) : null;
  if (video && atif) video.append(h('p', { class: 'foto-atif' }, atif));
  const mp4 = video && video.dataset.video === 'mp4';
  const kaynak = typeof gol.video_kaynak === 'string' && gol.video_kaynak.trim() ? gol.video_kaynak.trim() : null;
  const paylasMetni = `${gol.oyuncu} ${dakikaOkunus(gol)}${mac ? ' · ' + macEtiketi(mac) : ''} ⚽`;
  kok.replaceChildren(h('article', { class: 'gol-makale', 'aria-labelledby': 'gol-baslik' },
    h('h1', { id: 'gol-baslik', class: 'gol-h1' }, dakikaOgesi(gol), h('span', null, gol.oyuncu), gol.penalti ? h('span', { class: 'rozet' }, 'Penaltı') : null),
    video,
    video ? h('p', { class: 'video-not', id: 'video-not' },
      kaynak ? h('span', { class: 'video-kaynak', id: 'video-kaynak' }, 'Video: ', kaynak, '. ') : null,
      mp4 ? (altyazi ? 'Video dokununca yüklenir; Türkçe altyazılı.' : 'Video dokununca yüklenir. Bu videoda altyazı yok; golün anlatımı aşağıda.')
        : 'Dokununca YouTube oynatıcısı açılır (altyazı yükleyene bağlı); o ana kadar YouTube\'a bağlanılmaz.') : null,
    h('div', { class: 'gol-bas' },
      h('h2', { class: 'gorunmez' }, 'Golün anlatımı'),
      h('p', { id: 'gol-anlatim' }, gol.aciklama || `${gol.oyuncu}, ${dakikaOkunus(gol)}${gol.penalti ? ' penaltıdan' : ''} golü attı.`),
      !video ? h('p', { class: 'soluk' }, 'Bu golün videosu yok.') : null,
      mac ? h('a', { class: 'mac-baglanti', href: 'mac.html?id=' + encodeURIComponent(mac.id) }, h('span', null, macEtiketi(mac), ' · ', kartTarihi(mac.tarih)), h('span', { 'aria-hidden': 'true' }, '→')) : null,
      h('div', { class: 'eylem-satir' }, paylasDugmesi(paylasMetni)))));
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
