// Ana sayfa: sıradaki maç kartı + haber akışı (en yeni önce, "Daha fazla" ile sayfalı)
import { supabase, h, $, mesaj, sayfaBaslat, tarihYaz, guvenliGorsel, hataMetni, evSahibiDeplasman, skorMetni, durumRozeti, TAKIM_ADI } from '../ortak.js';
import { reklamYuvalariniDoldur } from '../reklam-yukle.js';

const SAYFA_BOYU = 6;
let sayfa = 0;
let gosterilen = 0;
let reklamKondu = false;

function haberKarti(haber) {
  const kapak = guvenliGorsel(haber.kapak_url);
  return h('a', { class: 'haber-karti', href: 'haber.html?id=' + encodeURIComponent(haber.id), 'data-haber-id': haber.id },
    kapak ? h('img', { class: 'kapak', src: kapak, alt: '', loading: 'lazy', decoding: 'async' }) : h('div', { class: 'kapak-yok', 'aria-hidden': 'true' }, 'ÇORUM'),
    h('div', { class: 'govde' },
      h('time', { class: 'tarih', datetime: haber.yayin_tarihi }, tarihYaz(haber.yayin_tarihi, { saat: false })),
      h('h3', null, haber.baslik),
      haber.ozet ? h('p', null, haber.ozet) : null));
}

async function haberleriYukle() {
  const akis = $('#akis');
  const dugme = $('#daha-fazla');
  dugme.disabled = true;
  const bas = sayfa * SAYFA_BOYU;
  // Bir fazlasını iste: varsa "Daha fazla" düğmesi görünür
  const { data, error } = await supabase.from('haberler')
    .select('id, baslik, ozet, kapak_url, yayin_tarihi')
    .eq('yayinda', true)
    .order('yayin_tarihi', { ascending: false })
    .order('id', { ascending: false })
    .range(bas, bas + SAYFA_BOYU);
  dugme.disabled = false;
  if (error) { mesaj($('#akis-mesaj'), hataMetni(error, 'Haberler yüklenemedi.')); return; }
  const parca = data.slice(0, SAYFA_BOYU);
  if (!parca.length && sayfa === 0) akis.append(h('p', { class: 'bos' }, 'Henüz haber yok.'));
  for (const haber of parca) {
    akis.append(haberKarti(haber));
    gosterilen += 1;
    if (gosterilen === 3 && !reklamKondu) {
      // Reklam yuvası: 3. haberden sonra, sadece bir kez. Reklam yoksa yer kaplamaz.
      akis.append(h('div', { class: 'reklam-yuvasi', 'data-reklam-alan': 'ana_akis' }));
      reklamKondu = true;
    }
  }
  dugme.hidden = data.length <= SAYFA_BOYU;
  sayfa += 1;
  reklamYuvalariniDoldur(akis);
}

async function sonrakiMac() {
  const kutu = $('#sonraki-mac');
  const { data, error } = await supabase.from('maclar')
    .select('id, rakip, tarih, stadyum, ic_saha, organizasyon, corum_skor, rakip_skor, durum')
    .in('durum', ['planlandi', 'canli'])
    .gte('tarih', new Date(Date.now() - 6 * 3600e3).toISOString())
    .order('tarih', { ascending: true })
    .limit(1);
  if (error) { kutu.replaceChildren(h('p', { class: 'mesaj hata' }, 'Maç bilgisi yüklenemedi.')); return; }
  const mac = data[0];
  if (!mac) { kutu.replaceChildren(h('p', { class: 'mesaj bilgi' }, 'Planlanmış maç yok.')); return; }
  const [ev, dep] = evSahibiDeplasman(mac);
  const skor = skorMetni(mac);
  kutu.replaceChildren(h('a', { class: 'sonraki-mac', href: 'mac.html?id=' + encodeURIComponent(mac.id), id: 'sonraki-mac-karti' },
    h('div', { class: 'ust-satir' },
      h('span', null, mac.durum === 'canli' ? 'Şu an oynanıyor' : 'Sıradaki maç', mac.organizasyon ? ' · ' + mac.organizasyon : ''),
      durumRozeti(mac.durum)),
    h('div', { class: 'takimlar' },
      h('span', { class: 'takim' + (ev === TAKIM_ADI ? ' biz' : '') }, ev),
      h('span', { class: 'orta' }, skor || 'vs'),
      h('span', { class: 'takim' + (dep === TAKIM_ADI ? ' biz' : '') }, dep)),
    h('div', { class: 'alt-satir' },
      h('time', { datetime: mac.tarih }, tarihYaz(mac.tarih, { gun: true })),
      mac.stadyum ? ' · ' + mac.stadyum : '')));
}

const oturum = await sayfaBaslat();
if (oturum.hazir) {
  $('#daha-fazla').addEventListener('click', haberleriYukle);
  await Promise.all([sonrakiMac(), haberleriYukle()]);
} else {
  $('#sonraki-mac').replaceChildren();
}
