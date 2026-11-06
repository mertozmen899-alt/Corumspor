// Maç ayrıntısı: başlık/skor (planlıda "4 gün kaldı" / "Bugün maç var!" rozeti), maç notu (bilet / yayın / kapı saati:
// maclar.mac_notu), Paylaş, "Maçın sponsoru" yuvası (alt satırı: Çorum FK'nın sponsoru değildir), goller (gol sayfasına
// bağlantılı kartlar; video burada YÜKLENMEZ), yorumlar (tembel yüklenir).
import { supabase, hazir, h, $, sayfaBaslat, param, kimlikGecerli, tarihYaz, saatYaz, evSahibiDeplasman, skorMetni, macRozeti, sonucBilgisi, cevrimdisiKutusu, paylasDugmesi, TAKIM_ADI } from '../ortak.js';
import { reklamYuvalariniDoldur } from '../reklam-yukle.js';
import { golKarti } from '../gol-kart.js';

const kok = $('#mac');
const id = param('id');
const oturumS = sayfaBaslat();

function bulunamadi() {
  document.title = 'Maç bulunamadı · Çorumspor Taraftar';
  kok.replaceChildren(h('div', { class: 'kutu' }, h('h1', null, 'Maç bulunamadı'), h('a', { class: 'dugme', href: 'takim.html#fikstur' }, 'Fikstüre dön')));
  kok.dataset.durum = 'tamam';
}

function yuklenemedi() {
  kok.replaceChildren(h('div', { class: 'kutu' }, h('h1', null, 'Maç yüklenemedi'),
    cevrimdisiKutusu('Sunucuya ulaşılamadı. İnternet bağlantını kontrol edip tekrar dene.', () => location.reload()),
    h('a', { class: 'dugme ikincil', href: 'takim.html#fikstur' }, 'Fikstüre dön')));
  kok.dataset.durum = 'hata';
}

async function yukle() {
  if (!kimlikGecerli(id)) return bulunamadi();
  const [macS, golS] = await Promise.all([
    supabase.from('maclar').select('*').eq('id', id).maybeSingle(),
    supabase.from('goller').select('id, oyuncu, dakika, ek_dakika, penalti, video_url, aciklama, kapak_url, sure_sn').eq('mac_id', id).order('dakika', { ascending: true }),
  ]);
  const { data: mac, error } = macS;
  if (error) return yuklenemedi();
  if (!mac) return bulunamadi();
  const [ev, dep] = evSahibiDeplasman(mac);
  document.title = `${ev} - ${dep} · Çorumspor Taraftar`;
  const skor = skorMetni(mac);
  const sonuc = sonucBilgisi(mac);
  const paylasMetni = skor ? `${ev} ${skor} ${dep}${mac.durum === 'bitti' ? ' (maç sonu)' : ''}`
    : `${ev} – ${dep} · ${tarihYaz(mac.tarih, { saat: false, gun: true, yil: false })} ${saatYaz(mac.tarih)}${mac.stadyum ? ' · ' + mac.stadyum : ''}`;
  const not = typeof mac.mac_notu === 'string' && mac.mac_notu.trim() ? mac.mac_notu.trim() : null;
  kok.replaceChildren(...[h('header', { class: 'mac-basi gunes-motif', id: 'mac-basi' },
    h('div', { class: 'ust-satir' }, macRozeti(mac), mac.organizasyon ? h('span', null, mac.organizasyon) : null, sonuc ? h('span', { class: 'sonuc-rozet ' + sonuc.sinif, title: sonuc.ad }, h('span', { 'aria-hidden': 'true' }, sonuc.harf), h('span', { class: 'gorunmez' }, sonuc.ad)) : null),
    h('h1', { class: 'takimlar' },
      h('span', { class: 'takim-ad' + (ev === TAKIM_ADI ? ' biz' : '') }, ev), ' ',
      h('span', { class: 'orta', id: 'skor' }, skor || 'vs'), ' ',
      h('span', { class: 'takim-ad' + (dep === TAKIM_ADI ? ' biz' : '') }, dep)),
    h('div', { class: 'meta' },
      h('time', { datetime: mac.tarih, id: 'mac-tarihi' }, tarihYaz(mac.tarih, { gun: true }), ' (TSİ)'),
      mac.stadyum ? h('span', null, mac.stadyum) : null,
      h('span', null, mac.ic_saha ? 'İç saha maçı' : 'Deplasman maçı'))),
    not ? h('aside', { class: 'mac-notu', id: 'mac-notu', 'aria-label': 'Maç notu' }, h('p', null, h('strong', null, 'Maç notu: '), not)) : null,
    h('div', { class: 'eylem-satir' }, paylasDugmesi(paylasMetni))].filter(Boolean));
  kok.dataset.durum = 'tamam';

  // Maç sponsoru reklam yuvası: başlığın altında, gollerden ve yorumlardan önce
  const yuva = h('div', { class: 'reklam-yuvasi', 'data-reklam-alan': 'mac_sponsoru', 'data-mac-id': mac.id });
  $('#mac-sponsoru').replaceWith(yuva);
  reklamYuvalariniDoldur();

  const goller = golS.data || [];
  if (goller.length) {
    goller.sort((a, b) => a.dakika - b.dakika || (a.ek_dakika || 0) - (b.ek_dakika || 0));
    $('#gol-listesi').replaceChildren(...goller.map((g) => h('li', { class: 'gol' }, golKarti(g, mac))));
    $('#mac-golleri').hidden = false;
  }
  const [{ yorumlariKur }, oturum] = await Promise.all([import('../yorumlar.js'), oturumS]);
  await yorumlariKur($('#yorumlar'), { macId: mac.id, oturum });
}

if (!hazir) kok.replaceChildren();
else yukle();
await oturumS;
