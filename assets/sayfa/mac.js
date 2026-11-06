// Maç ayrıntısı: başlık/skor (planlıda "4 gün kaldı" / "Bugün maç var!" rozeti; ortada dev "VS" yerine başlama saati kutusu),
// maç notu (bilet / yayın / kapı saati: maclar.mac_notu; yalnız maç bitmeden, altında "resmî duyuruya bak" satırı), Paylaş, "Maçın sponsoru" yuvası (alt satırı: Çorum FK'nın sponsoru değildir), goller (gol sayfasına
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
  // Maç notu maç öncesi bilgisidir (bilet, kapı saati): biten maçta gösterilmez (taraftar 3. tur 2)
  const not = mac.durum !== 'bitti' && typeof mac.mac_notu === 'string' && mac.mac_notu.trim() ? mac.mac_notu.trim() : null;
  // Oynanmamış maç: ortada başlama saati (ana sayfa kartı ve fikstürle aynı kutu; tasarımcı 3. tur 4)
  const orta = skor ? h('span', { class: 'orta', id: 'skor' }, skor)
    : mac.durum === 'canli' ? h('span', { class: 'orta', id: 'skor' }, '–')
      : h('span', { class: 'orta saat-kutu mac-saat', id: 'skor' }, h('time', { datetime: mac.tarih }, saatYaz(mac.tarih)), h('span', { class: 'gorunmez' }, ' (TSİ) başlama saati'));
  kok.replaceChildren(...[h('header', { class: 'mac-basi gunes-motif', id: 'mac-basi' },
    h('div', { class: 'ust-satir' }, macRozeti(mac), mac.organizasyon ? h('span', null, mac.organizasyon) : null, sonuc ? h('span', { class: 'sonuc-rozet ' + sonuc.sinif, title: sonuc.ad }, h('span', { 'aria-hidden': 'true' }, sonuc.harf), h('span', { class: 'gorunmez' }, sonuc.ad)) : null),
    h('h1', { class: 'takimlar' },
      h('span', { class: 'takim-ad' + (ev === TAKIM_ADI ? ' biz' : '') }, ev), ' ',
      orta, ' ',
      h('span', { class: 'takim-ad' + (dep === TAKIM_ADI ? ' biz' : '') }, dep)),
    h('div', { class: 'meta' },
      h('time', { datetime: mac.tarih, id: 'mac-tarihi' }, tarihYaz(mac.tarih, { gun: true }), ' (TSİ)'),
      mac.stadyum ? h('span', null, mac.stadyum) : null,
      h('span', null, mac.ic_saha ? 'İç saha maçı' : 'Deplasman maçı'))),
    not ? h('aside', { class: 'mac-notu', id: 'mac-notu', 'aria-label': 'Maç notu' }, h('p', null, h('strong', null, 'Maç notu: '), not),
      // Not bağımsız uygulamanın özetidir, kulübün açıklaması değil (başkan 3. tur 5)
      h('p', { class: 'mac-notu-kaynak', id: 'mac-notu-kaynak' }, 'Kesin bilgi için kulübün resmî duyurusuna bak.')) : null,
    h('div', { class: 'eylem-satir' }, paylasDugmesi(paylasMetni))].filter(Boolean));
  kok.dataset.durum = 'tamam';

  // Maç sponsoru reklam yuvası: başlığın altında, gollerden ve yorumlardan önce
  const yuva = h('div', { class: 'reklam-yuvasi', 'data-reklam-alan': 'mac_sponsoru', 'data-mac-id': mac.id });
  $('#mac-sponsoru').replaceWith(yuva);
  // Yorumlar, yukarıdaki reklam yuvası yerleşince (en çok 1,5 sn) kurulur: geç gelen kart yorumları aşağı itmesin (CLS)
  const reklamYerlesti = Promise.race([reklamYuvalariniDoldur().catch(() => {}), new Promise((r) => setTimeout(r, 1500))]);

  const goller = golS.data || [];
  if (goller.length) {
    goller.sort((a, b) => a.dakika - b.dakika || (a.ek_dakika || 0) - (b.ek_dakika || 0));
    // Başlık maçı zaten söylüyor: kartta maç satırı tekrar edilmez (tasarımcı 3. tur 2)
    $('#gol-listesi').replaceChildren(...goller.map((g) => h('li', { class: 'gol' }, golKarti(g, mac, { macSatiri: false }))));
    $('#mac-golleri').hidden = false;
  }
  const [{ yorumlariKur }, oturum] = await Promise.all([import('../yorumlar.js'), oturumS, reklamYerlesti]);
  await yorumlariKur($('#yorumlar'), { macId: mac.id, oturum });
}

if (!hazir) kok.replaceChildren();
else yukle();
await oturumS;
