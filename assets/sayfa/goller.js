// Gol arşivi: golü olan maçlar (yeniden eskiye), her maçta goller dakika sırasıyla, videolar gömülü
import { supabase, h, $, mesaj, sayfaBaslat, tarihYaz, hataMetni, evSahibiDeplasman, skorMetni, dakikaMetni, videoOgesi } from '../ortak.js';

const SAYFA_BOYU = 8;
let sayfa = 0;

function golKarti(gol, mac) {
  return h('article', { class: 'gol', 'data-gol-id': gol.id },
    h('div', { class: 'gol-ust' },
      h('span', { class: 'dakika' }, dakikaMetni(gol)),
      h('span', { class: 'oyuncu' }, gol.oyuncu),
      gol.penalti ? h('span', { class: 'rozet' }, 'Penaltı') : null),
    gol.aciklama ? h('p', { class: 'aciklama' }, gol.aciklama) : null,
    videoOgesi(gol.video_url, `${gol.oyuncu} golü, ${mac.rakip} maçı`));
}

async function yukle() {
  const arsiv = $('#arsiv');
  const dugme = $('#daha-fazla');
  dugme.disabled = true;
  const bas = sayfa * SAYFA_BOYU;
  const { data, error } = await supabase.from('maclar')
    .select('id, rakip, tarih, ic_saha, corum_skor, rakip_skor, durum, goller!inner(id, oyuncu, dakika, ek_dakika, penalti, video_url, aciklama)')
    .order('tarih', { ascending: false })
    .range(bas, bas + SAYFA_BOYU);
  dugme.disabled = false;
  if (sayfa === 0) arsiv.replaceChildren();
  if (error) { mesaj($('#gol-mesaj'), hataMetni(error, 'Goller yüklenemedi.')); return; }
  const parca = data.slice(0, SAYFA_BOYU);
  if (!parca.length && sayfa === 0) arsiv.append(h('p', { class: 'bos' }, 'Henüz gol eklenmedi.'));
  for (const mac of parca) {
    const [ev, dep] = evSahibiDeplasman(mac);
    const skor = skorMetni(mac);
    const goller = [...mac.goller].sort((a, b) => a.dakika - b.dakika || (a.ek_dakika || 0) - (b.ek_dakika || 0));
    arsiv.append(h('section', { class: 'arsiv-mac', 'data-mac-id': mac.id },
      h('h2', null, h('a', { href: 'mac.html?id=' + encodeURIComponent(mac.id) }, `${ev} ${skor || '-'} ${dep}`)),
      h('p', { class: 'tarih' }, tarihYaz(mac.tarih, { saat: false })),
      h('div', { class: 'gol-listesi izgara' }, goller.map((g) => golKarti(g, mac)))));
  }
  dugme.hidden = data.length <= SAYFA_BOYU;
  sayfa += 1;
}

const oturum = await sayfaBaslat();
if (oturum.hazir) {
  $('#daha-fazla').addEventListener('click', yukle);
  await yukle();
} else {
  $('#arsiv').replaceChildren();
}
