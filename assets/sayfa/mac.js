// Maç ayrıntısı: başlık/skor (planlıda "4 gün kaldı" / "Bugün maç var!" rozeti; ortada dev "VS" yerine başlama saati kutusu), Paylaş,
// "Maçın sponsoru" yuvası (alt satırı: Çorum FK'nın sponsoru değildir; sekmelerin ÜSTÜNDE: başlığın altında, gollerden ve yorumlardan önce),
// sekmeler Özet · Olaylar · Yorumlar (Takım sayfasındaki tablist deseni; adres #ozet | #olaylar | #yorumlar, geri tuşu çalışır):
//  Özet: maç notu (bilet / yayın / kapı saati: maclar.mac_notu; yalnız maç bitmeden, altında "resmî duyuruya bak"), maç özeti videosu,
//        goller (gol sayfasına bağlantılı kartlar; video burada YÜKLENMEZ)
//  Olaylar: iki taraflı çizelge (yalnız Çorum FK: gol, değişiklik, kırmızı kart; iç sahada solda, deplasmanda sağda; rakip verisi yok),
//           kartlar, İlk 11 ve oyuna girenler (mac_oyunculari; oyuncu sayfası varsa bağlantı). İlk açılışta yüklenir (açılışta istek yok).
//  Yorumlar: yorum bileşeni, sekme ilk açılınca tembel yüklenir.
// Aşağı kaydırınca üstte küçük skor çubuğu (sabit; yer kaplamaz, ekran okuyucuda yok: aynı bilgi h1'de).
import { supabase, hazir, h, $, sayfaBaslat, param, kimlikGecerli, tarihYaz, saatYaz, evSahibiDeplasman, skorMetni, macRozeti, sonucBilgisi, cevrimdisiKutusu, paylasDugmesi, videoFasad, sekmeKlavyesi, hataMetni, dakikaMetni, dakikaOkunus, simge, TAKIM_ADI } from '../ortak.js';
import { reklamYuvalariniDoldur } from '../reklam-yukle.js';
import { golKarti } from '../gol-kart.js';
import { macOlaylari, oyuncuAnahtari } from '../kurallar.js';

const kok = $('#mac');
const id = param('id');
const oturumS = sayfaBaslat();
const SEKMELER = ['ozet', 'olaylar', 'yorumlar'];
const MEVKI_SIRASI = { kaleci: 0, defans: 1, orta_saha: 2, forvet: 3 };
const TOP_YOLU = 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 5 4 3-1.5 5h-5L8 10z';
const OK_YUKARI = 'M12 19V5m-6 6 6-6 6 6';
const OK_ASAGI = 'M12 5v14m6-6-6 6-6-6';

function sekmeleriKaldir() {
  $('#mac-sekmeler').hidden = true;
  for (const s of SEKMELER) $('#panel-' + s).hidden = true;
}

function bulunamadi() {
  document.title = 'Maç bulunamadı · Çorumspor Taraftar';
  kok.replaceChildren(h('div', { class: 'kutu' }, h('h1', null, 'Maç bulunamadı'), h('a', { class: 'dugme', href: 'takim.html#fikstur' }, 'Fikstüre dön')));
  kok.dataset.durum = 'tamam';
  sekmeleriKaldir();
}

function yuklenemedi() {
  kok.replaceChildren(h('div', { class: 'kutu' }, h('h1', null, 'Maç yüklenemedi'),
    cevrimdisiKutusu('Sunucuya ulaşılamadı. İnternet bağlantını kontrol edip tekrar dene.', () => location.reload()),
    h('a', { class: 'dugme ikincil', href: 'takim.html#fikstur' }, 'Fikstüre dön')));
  kok.dataset.durum = 'hata';
  sekmeleriKaldir();
}

// ------------------------------------------------------------ sekmeler
const acilinca = {}; // sekme ilk açılınca bir kez çalışır (olaylar sorgusu, yorum bileşeni)
let tabindex = () => {};
function sekmeAc(ad, { adres = true } = {}) {
  if (!SEKMELER.includes(ad)) ad = 'ozet';
  for (const s of SEKMELER) {
    $('#sekme-' + s).setAttribute('aria-selected', String(s === ad));
    $('#panel-' + s).hidden = s !== ad;
  }
  tabindex();
  if (adres && location.hash !== '#' + ad) history.pushState(null, '', '#' + ad);
  ilkAcilis(ad);
}
function ilkAcilis(ad) { const f = acilinca[ad]; if (f) { delete acilinca[ad]; f(); } }
const sekmeAdi = (t) => t.getAttribute('aria-controls').replace(/^panel-/, '');
const tablist = $('#mac-sekmeler');
tablist.addEventListener('click', (e) => { const t = e.target.closest('[role="tab"]'); if (t) sekmeAc(sekmeAdi(t)); });
tabindex = sekmeKlavyesi(tablist, (t) => sekmeAc(sekmeAdi(t)));
window.addEventListener('popstate', () => sekmeAc(location.hash.slice(1), { adres: false }));
window.addEventListener('hashchange', () => sekmeAc(location.hash.slice(1), { adres: false }));
sekmeAc(location.hash.slice(1), { adres: false }); // veri gelmeden doğru panel (sonradan panel değişip kayma olmaz)

// ------------------------------------------------------------ yapışkan skor çubuğu
function skorCubugu(ev, dep, orta) {
  const cubuk = $('#skor-cubugu');
  cubuk.firstElementChild.replaceChildren(h('span', { class: 'takim' }, ev), h('span', { class: 'skor' }, orta), h('span', { class: 'takim' }, dep));
  const bas = $('#mac-basi');
  if (!bas || typeof IntersectionObserver !== 'function') return;
  // Büyük başlık üst barın altına girince (görünümden çıkınca) çubuk belirir
  const ust = document.querySelector('header.ust');
  const pay = ust ? Math.ceil(ust.getBoundingClientRect().height) : 0;
  new IntersectionObserver(([e]) => {
    cubuk.classList.toggle('acik', !e.isIntersecting && e.boundingClientRect.top < (e.rootBounds ? e.rootBounds.top : pay));
  }, { rootMargin: `-${pay}px 0px 0px 0px` }).observe(bas);
}

// ------------------------------------------------------------ olaylar
function olayOgesi(o) {
  const dk = o.tur === 'gol' ? { metin: dakikaMetni(o.gol), okunus: dakikaOkunus(o.gol) } : { metin: `${o.dakika}'`, okunus: `${o.dakika}. dakika` };
  const isaret = (sinif, d) => h('span', { class: 'olay-isaret ' + sinif, 'aria-hidden': 'true' }, d ? simge(d) : null);
  let icerik;
  if (o.tur === 'gol') {
    const g = o.gol;
    const alt = [g.asist ? `Asist: ${g.asist}` : null, g.penalti ? 'Penaltı' : null].filter(Boolean).join(' · ');
    icerik = [isaret('gol', TOP_YOLU), h('a', { href: 'gol.html?id=' + encodeURIComponent(g.id), 'data-gol-id': g.id },
      h('span', { class: 'olay-tur' }, 'Gol'), h('b', null, g.oyuncu), alt ? h('small', null, alt) : null)];
  } else if (o.tur === 'kirmizi') {
    icerik = [isaret('kart kirmizi'), h('span', null, h('span', { class: 'olay-tur' }, 'Kırmızı kart'), h('b', null, o.oyuncu))];
  } else {
    icerik = [isaret(o.giren ? 'giren' : 'cikan', o.giren ? OK_YUKARI : OK_ASAGI), h('span', null, h('span', { class: 'olay-tur' }, 'Değişiklik'),
      o.giren ? h('b', null, h('span', { class: 'gorunmez' }, 'Giren: '), o.giren) : null,
      o.cikan ? h('small', null, 'Çıkan: ', o.cikan) : null)];
  }
  return h('li', { class: 'olay olay-' + o.tur },
    h('span', { class: 'dk' }, h('span', { 'aria-hidden': 'true' }, dk.metin), h('span', { class: 'gorunmez' }, dk.okunus + ': ')),
    h('span', { class: 'olay-icerik' }, ...icerik));
}

function kadroListesi(baslikId, baslik, satirlar, oyuncular, dk) {
  if (!satirlar.length) return null;
  const sira = (s) => { const o = oyuncular.get(oyuncuAnahtari(s.oyuncu)); return o ? [MEVKI_SIRASI[o.mevki] ?? 9, o.sira ?? 99] : [10, 0]; };
  const l = [...satirlar].sort((a, b) => { const x = sira(a), y = sira(b); return x[0] - y[0] || x[1] - y[1] || a.oyuncu.localeCompare(b.oyuncu, 'tr'); });
  return h('section', { 'aria-labelledby': baslikId }, h('h3', { id: baslikId }, baslik),
    h('ul', { class: 'mac-kadro' }, l.map((s) => {
      const o = oyuncular.get(oyuncuAnahtari(s.oyuncu));
      const ic = [h('span', { class: 'no', 'aria-hidden': o && o.forma_no != null ? null : 'true' }, o && o.forma_no != null ? [h('span', { class: 'gorunmez' }, 'Forma '), String(o.forma_no)] : ''),
        h('span', null, s.oyuncu), dk(s) ? h('span', { class: 'dk-not' }, dk(s)) : null];
      return h('li', null, o ? h('a', { href: 'oyuncu.html?id=' + encodeURIComponent(o.id), 'data-oyuncu-id': o.id }, ...ic) : h('span', { class: 'oyuncu-ad' }, ...ic));
    })));
}

async function olaylariYukle(mac, goller) {
  const yer = $('#olaylar');
  yer.replaceChildren(h('div', { class: 'arsiv-iskelet', 'aria-hidden': 'true' }, h('span', { class: 'iskelet iskelet-mac' }), h('span', { class: 'iskelet iskelet-mac' })));
  const [ka, oy] = await Promise.all([
    supabase.from('mac_oyunculari').select('oyuncu, ilk11, giris_dk, cikis_dk, sari, kirmizi').eq('mac_id', mac.id).limit(60),
    supabase.from('oyuncular').select('id, ad, forma_no, mevki, sira').eq('aktif', true).limit(80),
  ]);
  if (ka.error) {
    yer.replaceChildren(cevrimdisiKutusu(hataMetni(ka.error, 'Maç olayları yüklenemedi.'), () => olaylariYukle(mac, goller)));
    yer.dataset.durum = 'hata';
    return;
  }
  const kadro = ka.data || [];
  const oyuncular = new Map((oy.data || []).map((o) => [oyuncuAnahtari(o.ad), o]));
  const { olaylar, kartlar } = macOlaylari(goller, kadro);
  if (!olaylar.length && !kadro.length) {
    yer.replaceChildren(h('p', { class: 'bos', id: 'olaylar-bos' }, mac.durum === 'bitti'
      ? 'Bu maçın olayları henüz girilmedi. Goller ve değişiklikler eklenince burada.'
      : 'Maç oynanınca goller, değişiklikler ve kartlar burada.'));
    yer.dataset.durum = 'tamam';
    return;
  }
  const taraf = mac.ic_saha ? 'sol' : 'sag';
  yer.replaceChildren(h('div', { class: 'olay-icerigi' },
    h('h2', { class: 'gorunmez', id: 'olay-baslik' }, `${TAKIM_ADI} maç olayları`),
    olaylar.length ? h('ol', { class: 'olay-cizelge', id: 'olay-cizelge', 'data-taraf': taraf, 'aria-labelledby': 'olay-baslik' }, olaylar.map(olayOgesi)) : null,
    h('p', { class: 'olay-not' }, `Yalnız ${TAKIM_ADI} olayları (${mac.ic_saha ? 'iç saha: solda' : 'deplasman: sağda'}); rakibin olay verisi yok. Kaynak: maç olayları.`),
    kartlar.length ? [h('h3', { class: 'olay-alt-baslik', id: 'kart-baslik' }, 'Kartlar'),
      h('ul', { class: 'kart-listesi', 'aria-labelledby': 'kart-baslik' }, kartlar.map((k) => h('li', null,
        h('span', { class: 'olay-isaret kart ' + (k.kirmizi ? 'kirmizi' : 'sari'), 'aria-hidden': 'true' }),
        h('span', null, k.kirmizi ? 'Kırmızı kart' : k.sari > 1 ? `${k.sari} sarı kart` : 'Sarı kart', ': ', h('b', null, k.oyuncu))))),
      h('p', { class: 'olay-not' }, 'Sarı kartların dakikası kaynakta yok.')] : null,
    h('div', { class: 'mac-kadrolari' },
      kadroListesi('ilk11-baslik', 'İlk 11', kadro.filter((s) => s.ilk11), oyuncular, (s) => (s.cikis_dk != null ? `${s.cikis_dk}' çıktı` : null)),
      kadroListesi('yedek-baslik', 'Yedekler (oyuna girenler)', kadro.filter((s) => !s.ilk11 && s.giris_dk != null), oyuncular, (s) => `${s.giris_dk}' girdi`))));
  yer.dataset.durum = 'tamam';
}

// ------------------------------------------------------------ yükleme
async function yukle() {
  if (!kimlikGecerli(id)) return bulunamadi();
  const [macS, golS] = await Promise.all([
    supabase.from('maclar').select('*').eq('id', id).maybeSingle(),
    supabase.from('goller').select('id, oyuncu, dakika, ek_dakika, penalti, video_url, aciklama, kapak_url, sure_sn, asist, video_baslangic_sn, video_bitis_sn').eq('mac_id', id).order('dakika', { ascending: true }),
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
  kok.replaceChildren(h('header', { class: 'mac-basi gunes-motif', id: 'mac-basi' },
    h('div', { class: 'ust-satir' }, macRozeti(mac), mac.organizasyon ? h('span', null, mac.organizasyon + (mac.hafta ? ` · ${mac.hafta}. Hafta` : '')) : mac.hafta ? h('span', null, `${mac.hafta}. Hafta`) : null, sonuc ? h('span', { class: 'sonuc-rozet ' + sonuc.sinif, title: sonuc.ad }, h('span', { 'aria-hidden': 'true' }, sonuc.harf), h('span', { class: 'gorunmez' }, sonuc.ad)) : null),
    h('h1', { class: 'takimlar' },
      h('span', { class: 'takim-ad' + (ev === TAKIM_ADI ? ' biz' : '') }, ev), ' ',
      orta, ' ',
      h('span', { class: 'takim-ad' + (dep === TAKIM_ADI ? ' biz' : '') }, dep)),
    h('div', { class: 'meta' },
      h('time', { datetime: mac.tarih, id: 'mac-tarihi' }, tarihYaz(mac.tarih, { gun: true }), ' (TSİ)'),
      mac.stadyum ? h('span', null, mac.stadyum) : null,
      h('span', null, mac.ic_saha ? 'İç saha maçı' : 'Deplasman maçı'))),
  h('div', { class: 'eylem-satir' }, paylasDugmesi(paylasMetni)));
  kok.dataset.durum = 'tamam';
  skorCubugu(ev, dep, skor || (mac.durum === 'canli' ? '–' : saatYaz(mac.tarih)));
  if (not) {
    $('#ozet-not').replaceChildren(h('aside', { class: 'mac-notu', id: 'mac-notu', 'aria-label': 'Maç notu' }, h('p', null, h('strong', null, 'Maç notu: '), not),
      // Not bağımsız uygulamanın özetidir, kulübün açıklaması değil (başkan 3. tur 5)
      h('p', { class: 'mac-notu-kaynak', id: 'mac-notu-kaynak' }, 'Kesin bilgi için kulübün resmî duyurusuna bak.')));
  }

  // Maç sponsoru reklam yuvası: başlığın altında, sekmelerin (gollerin ve yorumların) üstünde
  const yuva = h('div', { class: 'reklam-yuvasi', 'data-reklam-alan': 'mac_sponsoru', 'data-mac-id': mac.id });
  $('#mac-sponsoru').replaceWith(yuva);
  // Yorumlar, yukarıdaki reklam yuvası yerleşince (en çok 1,5 sn) kurulur: geç gelen kart yorumları aşağı itmesin (CLS)
  const reklamYerlesti = Promise.race([reklamYuvalariniDoldur().catch(() => {}), new Promise((r) => setTimeout(r, 1500))]);

  // 016: maç özeti (iframe/video YALNIZ dokununca; kaynak "Video: …"). Gol arşivinden #ozet ile gelinirse oraya kayar.
  const ozet = mac.ozet_video_url ? videoFasad(mac.ozet_video_url, { baslik: `${ev} - ${dep} maç özeti`, tur: 'Maç özeti videosu' }) : null;
  if (ozet) {
    $('#ozet-video').replaceChildren(ozet);
    const kaynak = typeof mac.ozet_video_kaynak === 'string' && mac.ozet_video_kaynak.trim();
    $('#ozet-kaynak').replaceChildren(...(kaynak ? [h('span', { class: 'video-kaynak' }, 'Video: ', kaynak, '.')] : []));
    $('#ozet').hidden = false;
    // sponsor kartı yerleştikten sonra kaydır (geç gelen kart özeti aşağı itmesin)
    if (location.hash === '#ozet') reklamYerlesti.then(() => $('#ozet').scrollIntoView({ block: 'start' }));
  }

  const goller = golS.data || [];
  if (goller.length) {
    goller.sort((a, b) => a.dakika - b.dakika || (a.ek_dakika || 0) - (b.ek_dakika || 0));
    // Başlık maçı zaten söylüyor: kartta maç satırı tekrar edilmez (tasarımcı 3. tur 2)
    $('#gol-listesi').replaceChildren(...goller.map((g) => h('li', { class: 'gol' }, golKarti(g, mac, { macSatiri: false }))));
    $('#mac-golleri').hidden = false;
  }
  if (!not && !ozet && !goller.length) {
    $('#ozet-bos').textContent = mac.durum === 'bitti' ? 'Bu maçın özeti ve golleri henüz eklenmedi.' : 'Maç oynanınca goller ve özet burada. Olaylar ve yorumlar sekmelerine de bak.';
    $('#ozet-bos').hidden = false;
  }

  acilinca.olaylar = () => olaylariYukle(mac, goller);
  acilinca.yorumlar = async () => {
    const [{ yorumlariKur }, oturum] = await Promise.all([import('../yorumlar.js'), oturumS, reklamYerlesti]);
    await yorumlariKur($('#yorumlar'), { macId: mac.id, oturum });
  };
  ilkAcilis(SEKMELER.find((s) => !$('#panel-' + s).hidden));
}

if (!hazir) { kok.replaceChildren(); sekmeleriKaldir(); }
else yukle();
await oturumS;
