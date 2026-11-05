// Maç ayrıntısı: başlık/skor, maç sponsoru reklam yuvası, goller, yorumlar
import { supabase, h, $, sayfaBaslat, param, kimlikGecerli, tarihYaz, evSahibiDeplasman, skorMetni, durumRozeti, dakikaMetni, videoOgesi, TAKIM_ADI } from '../ortak.js';
import { yorumlariKur } from '../yorumlar.js';
import { reklamYuvalariniDoldur } from '../reklam-yukle.js';

const kok = $('#mac');
const id = param('id');
const oturum = await sayfaBaslat();

function golOgesi(gol, baslik) {
  return h('article', { class: 'gol', 'data-gol-id': gol.id },
    h('div', { class: 'gol-ust' },
      h('span', { class: 'dakika' }, dakikaMetni(gol)),
      h('span', { class: 'oyuncu' }, gol.oyuncu),
      gol.penalti ? h('span', { class: 'rozet' }, 'Penaltı') : null),
    gol.aciklama ? h('p', { class: 'aciklama' }, gol.aciklama) : null,
    videoOgesi(gol.video_url, baslik || `${gol.oyuncu} golü`));
}

function bulunamadi() {
  document.title = 'Maç bulunamadı · Çorumspor Taraftar';
  kok.replaceChildren(h('div', { class: 'kutu' }, h('h1', null, 'Maç bulunamadı'),
    h('a', { class: 'dugme', href: 'maclar.html' }, 'Maçlara dön')));
}

if (oturum.hazir) {
  if (!kimlikGecerli(id)) bulunamadi();
  else {
    const { data: mac, error } = await supabase.from('maclar').select('*').eq('id', id).maybeSingle();
    if (error || !mac) bulunamadi();
    else {
      const [ev, dep] = evSahibiDeplasman(mac);
      document.title = `${ev} - ${dep} · Çorumspor Taraftar`;
      const skor = skorMetni(mac);
      kok.replaceChildren(h('header', { class: 'mac-basi', id: 'mac-basi' },
        h('div', { class: 'ust-satir' }, durumRozeti(mac.durum), mac.organizasyon ? h('span', null, mac.organizasyon) : null),
        h('h1', { class: 'takimlar' },
          h('span', { class: 'takim' + (ev === TAKIM_ADI ? ' biz' : '') }, ev),
          h('span', { class: 'orta', id: 'skor' }, skor || 'vs'),
          h('span', { class: 'takim' + (dep === TAKIM_ADI ? ' biz' : '') }, dep)),
        h('div', { class: 'meta' },
          h('time', { datetime: mac.tarih, id: 'mac-tarihi' }, tarihYaz(mac.tarih, { gun: true }), ' (TSİ)'),
          mac.stadyum ? h('span', null, mac.stadyum) : null,
          h('span', null, mac.ic_saha ? 'İç saha maçı' : 'Deplasman maçı'))));

      // Maç sponsoru reklam yuvası: başlığın altında, gollerden ve yorumlardan önce
      const yuva = h('div', { class: 'reklam-yuvasi', 'data-reklam-alan': 'mac_sponsoru', 'data-mac-id': mac.id });
      $('#mac-sponsoru').replaceWith(yuva);
      reklamYuvalariniDoldur();

      const { data: goller } = await supabase.from('goller')
        .select('id, oyuncu, dakika, ek_dakika, penalti, video_url, aciklama')
        .eq('mac_id', mac.id).order('dakika', { ascending: true });
      if (goller && goller.length) {
        goller.sort((a, b) => a.dakika - b.dakika || (a.ek_dakika || 0) - (b.ek_dakika || 0));
        $('#gol-listesi').replaceChildren(...goller.map((g) => golOgesi(g)));
        $('#mac-golleri').hidden = false;
      }
      await yorumlariKur($('#yorumlar'), { macId: mac.id, oturum });
    }
  }
}
