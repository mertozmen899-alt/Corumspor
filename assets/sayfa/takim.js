// Takım: sekmeler (WAI-ARIA tablist; seçili sekme adreste #kadro | #sakatlik | #fikstur, geri tuşu çalışır)
//  Kadro: mevkiye göre gruplu oyuncu kartları (fotoğraf yalnız hakkı varsa; yoksa forma numarası)
//  Sakatlık: yalnız kulübün açıkladığı bilgi, kaynağı ve güncelleme zamanıyla (KVKK m.6: sağlık verisi)
//  Fikstür: sıradaki maçlar (yakından uzağa) ve sonuçlar (yeniden eskiye), ay başlıklarıyla; sonuç harfle (G/B/M)
import { supabase, hazir, h, $, sayfaBaslat, tarihYaz, saatYaz, goreceZaman, hataMetni, evSahibiDeplasman, skorMetni, sonucBilgisi, durumRozeti, sekmeKlavyesi, kapakKaynagi, cevrimdisiKutusu } from '../ortak.js';
import { SAKATLIK_DURUMLARI } from '../kurallar.js';
import { sonVeri, sonVeriYaz } from '../onbellek.js';

const oturumS = sayfaBaslat();
const MEVKILER = [['kaleci', 'Kaleciler'], ['defans', 'Defans'], ['orta_saha', 'Orta saha'], ['forvet', 'Forvet']];
const MEVKI_TEKIL = { kaleci: 'Kaleci', defans: 'Defans', orta_saha: 'Orta saha', forvet: 'Forvet' };
const DURUM_SIRASI = { sakat: 0, cezali: 1, belirsiz: 2, dondu: 3 };
const SEKMELER = ['kadro', 'sakatlik', 'fikstur'];
const tablist = document.querySelector('[role="tablist"]');

// ------------------------------------------------------------ sekmeler
let tabindex = () => {};
function sekmeAc(ad, { adres = true } = {}) {
  if (!SEKMELER.includes(ad)) ad = 'kadro';
  for (const s of SEKMELER) {
    $('#sekme-' + s).setAttribute('aria-selected', String(s === ad));
    $('#panel-' + s).hidden = s !== ad;
  }
  tabindex();
  if (adres && location.hash !== '#' + ad) history.pushState(null, '', '#' + ad);
}
// Panel kimlikleri "panel-<ad>", adres parçası "#<ad>": parça bir öğeye denk gelmez, tarayıcı açılışta panele kaydırmaz / odak vermez
const sekmeAdi = (t) => t.getAttribute('aria-controls').replace(/^panel-/, '');
tablist.addEventListener('click', (e) => { const t = e.target.closest('[role="tab"]'); if (t) sekmeAc(sekmeAdi(t)); });
tabindex = sekmeKlavyesi(tablist, (t) => sekmeAc(sekmeAdi(t)));
window.addEventListener('popstate', () => sekmeAc(location.hash.slice(1), { adres: false }));
window.addEventListener('hashchange', () => sekmeAc(location.hash.slice(1), { adres: false }));
sekmeAc(location.hash.slice(1), { adres: false });

// ------------------------------------------------------------ kadro
function oyuncuKarti(o, sakatlik) {
  const k = kapakKaynagi(o.foto_url, { varsayilan: 480 });
  const durum = sakatlik && sakatlik.durum !== 'dondu' ? sakatlik.durum : null;
  return h('li', null, h('div', { class: 'oyuncu-kart', 'data-oyuncu-id': o.id },
    durum ? h('span', { class: 'oyuncu-isaret durum-cip ' + durum }, SAKATLIK_DURUMLARI[durum]) : null,
    h('div', { class: 'oyuncu-gorsel gunes-motif', 'aria-hidden': k ? null : 'true' },
      k ? h('img', { src: k.src, srcset: k.srcset, sizes: '160px', alt: '', width: '320', height: '240', loading: 'lazy', decoding: 'async' }) : h('span', { class: 'no' }, o.forma_no ?? '–')),
    h('div', { class: 'oyuncu-govde' },
      h('span', { class: 'ad' }, o.ad),
      h('span', { class: 'mevki' }, o.forma_no != null ? h('span', null, h('span', { class: 'gorunmez' }, 'Forma numarası '), String(o.forma_no), ' · ') : null, MEVKI_TEKIL[o.mevki]))));
}

function kadroCiz(oyuncular, sakatliklar) {
  const kok = $('#kadro-icerik');
  if (!oyuncular.length) { kok.replaceChildren(h('p', { class: 'bos' }, 'Kadro yakında: kulüp açıklayınca burada.')); return; }
  const durumu = new Map(sakatliklar.map((s) => [s.oyuncu_id, s]));
  kok.replaceChildren(...MEVKILER.flatMap(([m, ad]) => {
    const l = oyuncular.filter((o) => o.mevki === m).sort((a, b) => a.sira - b.sira || (a.forma_no ?? 99) - (b.forma_no ?? 99));
    if (!l.length) return [];
    return [h('h3', { class: 'mevki-baslik', id: 'mevki-' + m }, ad), h('ul', { class: 'kadro-izgara', 'aria-labelledby': 'mevki-' + m }, l.map((o) => oyuncuKarti(o, durumu.get(o.id))))];
  }));
}

// ------------------------------------------------------------ sakatlık
function sakatlikCiz(liste) {
  const kok = $('#sakatlik-icerik');
  const iki = Date.now() - 14 * 864e5;
  const l = liste.filter((s) => s.durum !== 'dondu' || Date.parse(s.guncellendi) > iki)
    .sort((a, b) => DURUM_SIRASI[a.durum] - DURUM_SIRASI[b.durum] || Date.parse(b.guncellendi) - Date.parse(a.guncellendi));
  const sayi = l.filter((s) => s.durum !== 'dondu').length;
  $('#sekme-sakatlik').textContent = sayi ? `Sakatlık (${sayi})` : 'Sakatlık';
  if (!l.length) { kok.replaceChildren(h('p', { class: 'bos' }, 'Şu an sakat ya da cezalı oyuncu yok. ⚡')); return; }
  kok.replaceChildren(h('ul', { class: 'sakatlik-listesi' }, l.map((s) => h('li', { class: 'sakatlik', 'data-sakatlik-id': s.id },
    h('p', { class: 'ad' }, s.oyuncular ? s.oyuncular.ad : 'Oyuncu', s.oyuncular ? h('small', null, MEVKI_TEKIL[s.oyuncular.mevki] || '') : null),
    h('span', { class: 'durum-cip ' + s.durum }, SAKATLIK_DURUMLARI[s.durum]),
    s.aciklama ? h('p', { class: 'aciklama' }, s.aciklama) : null,
    h('p', { class: 'kaynak' },
      s.beklenen_donus ? `Tahmini dönüş: ${tarihYaz(s.beklenen_donus + 'T12:00:00Z', { saat: false, yil: false })} · ` : '',
      'Kaynak: ', s.kaynak_url ? h('a', { href: s.kaynak_url, rel: 'noopener', target: '_blank' }, s.kaynak, h('span', { class: 'gorunmez' }, ' (yeni sekmede açılır)')) : s.kaynak,
      ' · Güncellendi ', h('time', { datetime: s.guncellendi }, goreceZaman(s.guncellendi)))))));
}

// ------------------------------------------------------------ fikstür
function ayGrupla(liste) {
  const gruplar = [];
  for (const m of liste) {
    const ay = tarihYaz(m.tarih, { saat: false }).replace(/^\d+\s/, '');
    const son = gruplar[gruplar.length - 1];
    if (son && son.ay === ay) son.maclar.push(m); else gruplar.push({ ay, maclar: [m] });
  }
  return gruplar;
}

function macSatiri(mac, { siradaki = false } = {}) {
  const [ev, dep] = evSahibiDeplasman(mac);
  const skor = skorMetni(mac);
  const sonuc = sonucBilgisi(mac);
  const gun = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric' }).format(new Date(mac.tarih));
  const ay = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', month: 'short' }).format(new Date(mac.tarih)).replace('.', '');
  const gunAdi = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', weekday: 'short' }).format(new Date(mac.tarih));
  // Bağlantı adında saat BİR kez (planlıda sağda, bitende bilgi satırında); sonuç sözcükle
  return h('li', null, h('a', { class: 'fikstur-satir' + (siradaki ? ' siradaki' : ''), href: 'mac.html?id=' + encodeURIComponent(mac.id), 'data-mac-id': mac.id },
    h('span', { class: 'gun', 'aria-hidden': 'true' }, h('b', null, gun), h('span', null, ay)),
    h('span', null,
      siradaki ? h('span', { class: 'siradaki-etiket' }, 'Sıradaki') : null,
      h('span', { class: 'eslesme' }, ev, ' – ', dep),
      h('span', { class: 'bilgi' }, h('time', { datetime: mac.tarih }, tarihYaz(mac.tarih, { saat: !skor ? false : true, gun: true, kisa: true })),
        ' · ', mac.ic_saha ? 'İç saha' : 'Deplasman', mac.organizasyon ? ' · ' + mac.organizasyon : '', mac.durum === 'canli' ? ' · ' : null, mac.durum === 'canli' ? durumRozeti('canli') : null)),
    h('span', { class: 'sag' },
      skor ? [h('span', { class: 'skor' }, h('span', { class: 'gorunmez' }, 'Skor: '), skor)] : h('span', { class: 'saat' }, saatYaz(mac.tarih), h('span', { class: 'gorunmez' }, ' (TSİ)')),
      sonuc ? h('span', { class: 'sonuc-rozet ' + sonuc.sinif }, h('span', { 'aria-hidden': 'true' }, sonuc.harf), h('span', { class: 'gorunmez' }, ', ' + sonuc.ad)) : null)));
}

function fiksturCiz(data) {
  const gelecek = data.filter((m) => m.durum !== 'bitti').reverse();
  const biten = data.filter((m) => m.durum === 'bitti');
  const grupCiz = (liste, ops) => ayGrupla(liste).flatMap((g, gi) => [h('h4', { class: 'ay-baslik' }, g.ay), h('ol', { class: 'fikstur-listesi' }, g.maclar.map((m, i) => macSatiri(m, { siradaki: ops && gi === 0 && i === 0 })))]);
  $('#gelecek').replaceChildren(...(gelecek.length ? grupCiz(gelecek, true) : [h('p', { class: 'bos' }, 'Planlanmış maç yok.')]));
  $('#sonuclar').replaceChildren(...(biten.length ? grupCiz(biten) : [h('p', { class: 'bos' }, 'Henüz oynanmış maç yok.')]));
  $('#gelecek').dataset.durum = 'tamam';
}

// ------------------------------------------------------------ yükleme
async function yukle() {
  const [oy, sa, ma] = await Promise.all([
    supabase.from('oyuncular').select('id, ad, forma_no, mevki, foto_url, sira').eq('aktif', true).order('sira', { ascending: true }).limit(80),
    supabase.from('sakatliklar').select('id, oyuncu_id, durum, kaynak, kaynak_url, kaynak_tarihi, beklenen_donus, guncellendi, oyuncular(ad, mevki)').eq('yayinda', true).order('guncellendi', { ascending: false }).limit(60),
    supabase.from('maclar').select('id, rakip, tarih, stadyum, ic_saha, organizasyon, corum_skor, rakip_skor, durum').order('tarih', { ascending: false }).limit(300),
  ]);
  const eski = sonVeri('takim');
  const yedek = eski && eski.veri || {};
  const hata = (kok, e) => kok.replaceChildren(cevrimdisiKutusu(hataMetni(e, 'Yüklenemedi.'), () => location.reload(), { sonGuncelleme: eski && eski.zaman }));
  const sakat = sa.error ? (yedek.sakatliklar || null) : sa.data;
  if (!oy.error || yedek.oyuncular) kadroCiz(oy.error ? yedek.oyuncular : oy.data, sakat || []); else hata($('#kadro-icerik'), oy.error);
  $('#kadro-icerik').dataset.durum = oy.error ? 'hata' : 'tamam';
  if (sakat) sakatlikCiz(sakat); else hata($('#sakatlik-icerik'), sa.error);
  $('#sakatlik-icerik').dataset.durum = sa.error ? 'hata' : 'tamam';
  if (!ma.error || yedek.maclar) fiksturCiz(ma.error ? yedek.maclar : ma.data);
  else { $('#gelecek').replaceChildren(); $('#sonuclar').replaceChildren(); $('#mac-mesaj').replaceChildren(cevrimdisiKutusu(hataMetni(ma.error, 'Maçlar yüklenemedi.'), () => location.reload())); $('#gelecek').dataset.durum = 'hata'; }
  if (!oy.error && !sa.error && !ma.error) sonVeriYaz('takim', { oyuncular: oy.data, sakatliklar: sa.data, maclar: ma.data.slice(0, 40) });
}

if (hazir) yukle(); else { $('#kadro-icerik').replaceChildren(); $('#sakatlik-icerik').replaceChildren(); $('#gelecek').replaceChildren(); }
await oturumS;
