// Gol ayrıntısı (gol.html?id=): video (kapak + oynat; iframe/video YALNIZ dokununca), "Video: <kaynak>" (hak sahibi),
// golün anlatımı, maç bağlantısı, Paylaş (telefonun menüsü ya da WhatsApp), bu maçın diğer golleri, taraftar yorumları
// (yorumlar.js, gol_id). DOM'da h1 videodan ÖNCE (başlıkla gezen video düğmesini atlamasın); görsel sırada video üstte (CSS order).
// Önce son görülen kayıt (onbellek.js: bu gol daha önce açıldıysa, yoksa ana sayfa / gol arşivi listesindeki satırı) ANINDA çizilir
// (data-durum="onbellek"; video kapağı ağ sorgusunu beklemeden iner, fetchpriority=high: performans 3. tur 2), sonra ağdan tazelenir.
import { supabase, hazir, h, $, sayfaBaslat, param, kimlikGecerli, dakikaOgesi, dakikaOkunus, sureMetni, videoFasad, fotoAtfi, cevrimdisiKutusu, paylasDugmesi, altyaziGecerli, eslesmeOgeleri } from '../ortak.js';
import { golKarti, macEtiketi, kartTarihi } from '../gol-kart.js';
import { sonVeri, sonKayit, sonKayitYaz } from '../onbellek.js';

const kok = $('#gol');
const id = param('id');
const oturumS = sayfaBaslat();
const GOL_SUTUNLARI = 'id, mac_id, oyuncu, dakika, ek_dakika, penalti, video_url, video_kaynak, altyazi_url, aciklama, kapak_url, sure_sn, maclar(id, rakip, tarih, ic_saha, corum_skor, rakip_skor, durum)';

function bulunamadi() {
  document.title = 'Gol bulunamadı · Çorumspor Taraftar';
  kok.replaceChildren(h('div', { class: 'kutu' }, h('h1', null, 'Gol bulunamadı'), h('a', { class: 'dugme', href: 'goller.html' }, 'Gol arşivine dön')));
  kok.dataset.durum = 'tamam';
}

/** Golü çizer. kismi: listeden gelen önbellek satırı (video kaynağı / altyazı bilinmiyor): video notu ağ yanıtını bekler. */
function golCiz(gol, { kismi = false } = {}) {
  const mac = gol.maclar || null;
  const sure = sureMetni(gol.sure_sn);
  document.title = `${gol.oyuncu} golü · Çorumspor Taraftar`;
  const baslik = `${gol.oyuncu}, ${dakikaOkunus(gol)}${mac ? ', ' + mac.rakip + ' maçı' : ''}`;
  const altyazi = altyaziGecerli(gol.altyazi_url) ? gol.altyazi_url : null;
  let video = videoFasad(gol.video_url, { baslik, kapak: gol.kapak_url, sure, altyazi, oncelik: 'high' });
  const atif = video && gol.kapak_url ? fotoAtfi(gol.kapak_url) : null;
  if (video && atif) video.append(h('p', { class: 'foto-atif' }, atif));
  // Önbellekten çizilmiş video kutusu: oynatıcı açıldıysa olduğu gibi kalır; açılmadıysa aynı kapak <img>'i taşınır (titreme yok)
  const onceki = kok.querySelector('.gol-makale > .video');
  if (video && onceki && onceki.dataset.video === video.dataset.video) {
    if (!onceki.querySelector('.video-baslat')) video = onceki;
    else {
      const eskiImg = onceki.querySelector('.video-baslat img'), yeniImg = video.querySelector('.video-baslat img');
      if (eskiImg && yeniImg && eskiImg.getAttribute('src') === yeniImg.getAttribute('src')) yeniImg.replaceWith(eskiImg);
    }
  }
  const mp4 = video && video.dataset.video === 'mp4';
  const kaynak = typeof gol.video_kaynak === 'string' && gol.video_kaynak.trim() ? gol.video_kaynak.trim() : null;
  const paylasMetni = `${gol.oyuncu} ${dakikaOkunus(gol)}${mac ? ' · ' + macEtiketi(mac) : ''} ⚽`;
  kok.replaceChildren(h('article', { class: 'gol-makale', 'aria-labelledby': 'gol-baslik' },
    h('h1', { id: 'gol-baslik', class: 'gol-h1' }, dakikaOgesi(gol), h('span', null, gol.oyuncu), gol.penalti ? h('span', { class: 'rozet' }, 'Penaltı') : null),
    video,
    video ? h('p', { class: 'video-not', id: 'video-not' },
      kaynak ? h('span', { class: 'video-kaynak', id: 'video-kaynak' }, 'Video: ', kaynak, '. ') : null,
      kismi ? '\u00a0'
        : mp4 ? (altyazi ? 'Video dokununca yüklenir; Türkçe altyazılı.' : 'Video dokununca yüklenir. Bu videoda altyazı yok; golün anlatımı aşağıda.')
          : 'Dokununca YouTube oynatıcısı açılır (altyazı yükleyene bağlı); o ana kadar YouTube\'a bağlanılmaz.') : null,
    h('div', { class: 'gol-bas' },
      h('h2', { class: 'gorunmez' }, 'Golün anlatımı'),
      h('p', { id: 'gol-anlatim' }, gol.aciklama || `${gol.oyuncu}, ${dakikaOkunus(gol)}${gol.penalti ? ' penaltıdan' : ''} golü attı.`),
      !video ? h('p', { class: 'soluk' }, 'Bu golün videosu yok.') : null,
      mac ? h('a', { class: 'mac-baglanti', href: 'mac.html?id=' + encodeURIComponent(mac.id) }, h('span', null, eslesmeOgeleri(mac), ' · ', kartTarihi(mac.tarih)), h('span', { 'aria-hidden': 'true' }, '→')) : null,
      kismi ? null : h('div', { class: 'eylem-satir' }, paylasDugmesi(paylasMetni)))));
}

/** Son görülen kayıt: bu gol daha önce açıldıysa, yoksa ana sayfa şeridi ya da gol arşivi listesindeki satır. */
function onbellektenCiz() {
  const tam = sonKayit('gol', id);
  if (tam) { golCiz(tam); kok.dataset.durum = 'onbellek'; return; }
  const ana = sonVeri('ana'), arsiv = sonVeri('goller');
  const adaylar = [
    ...((ana && ana.veri && Array.isArray(ana.veri.goller)) ? ana.veri.goller : []),
    ...((arsiv && Array.isArray(arsiv.veri)) ? arsiv.veri.flatMap((m) => (m.goller || []).map((g) => ({ ...g, maclar: { ...m, goller: undefined } }))) : []),
  ];
  const satir = adaylar.find((g) => g && g.id === id);
  if (!satir) return;
  golCiz(satir, { kismi: true });
  kok.dataset.durum = 'onbellek';
}

async function yukle() {
  if (!kimlikGecerli(id)) return bulunamadi();
  onbellektenCiz();
  const { data: gol, error } = await supabase.from('goller').select(GOL_SUTUNLARI).eq('id', id).maybeSingle();
  if (error) {
    if (kok.dataset.durum === 'onbellek') { kok.prepend(cevrimdisiKutusu('Bağlantı yok; bu golün son görülen hâli gösteriliyor.', () => location.reload())); return; }
    kok.replaceChildren(cevrimdisiKutusu('Gol yüklenemedi. İnternet bağlantını kontrol et.', () => location.reload()));
    kok.dataset.durum = 'hata';
    return;
  }
  if (!gol) return bulunamadi();
  golCiz(gol);
  kok.dataset.durum = 'tamam';
  sonKayitYaz('gol', gol, 5);
  const mac = gol.maclar;

  if (mac) {
    supabase.from('goller').select('id, oyuncu, dakika, ek_dakika, penalti, video_url, aciklama, kapak_url, sure_sn').eq('mac_id', mac.id).then(({ data }) => {
      const digerleri = (data || []).filter((g) => g.id !== gol.id).sort((a, b) => a.dakika - b.dakika);
      if (!digerleri.length) return;
      // Bölüm başlığı "Bu maçın diğer golleri": kartta maç satırı tekrar edilmez (tasarımcı 3. tur 2)
      $('#diger-goller').replaceChildren(...digerleri.map((g) => h('li', null, golKarti(g, mac, { macSatiri: false }))));
      $('#diger-goller-bolumu').hidden = false;
    });
  }
  const [{ yorumlariKur }, oturum] = await Promise.all([import('../yorumlar.js'), oturumS]);
  await yorumlariKur($('#yorumlar'), { golId: gol.id, oturum });
}

if (!hazir) kok.replaceChildren(); else yukle();
await oturumS;
