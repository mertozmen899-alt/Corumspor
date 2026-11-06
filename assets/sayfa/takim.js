// Takım: sekmeler (WAI-ARIA tablist; seçili sekme adreste #kadro | #sakatlik | #fikstur | #puan, geri tuşu çalışır)
//  020 Puan durumu: tam tablo (Çorum FK satırı vurgulu), son güncelleme + kaynak; sekme ilk açılınca yüklenir (açılışta ek istek yok).
//  Kadro: mevkiye göre gruplu oyuncu kartları (fotoğraf yalnız hakkı varsa; yoksa forma numarası); 018: kart → oyuncu.html?id=
//  Sakatlık: yalnız durum (Sakat / Cezalı / Durumu belirsiz / Döndü), kaynağı (bağlantılı) ve kaynak tarihiyle. Tanı / açıklama
//  metni (aciklama) ziyaretçiye HİÇ gösterilmez ve istenmez (KVKK m.6 sağlık verisi; 014'ten beri yalnız yönetici okur).
//  Fikstür: sıradaki maçlar (yakından uzağa) ve sonuçlar (yeniden eskiye), ay başlıklarıyla; sonuç harfle (G/B/M)
//  019: Fikstür'de "Liste | Takvim" seçimi (aria-pressed düğme grubu). Takvim: ay ızgarası (Pazartesi başlar; ay ileri/geri, yalnız
//  maç olan aylar arasında), maç günü düğmedir (iç saha dolu kırmızı "İ", deplasman çerçeveli "D": renk dışında harf). Güne dokununca
//  alttan açılan önizleme (dialog; profil.html çıkış penceresi deseni: arka plan inert, Esc kapatır, odak geri döner): maç, saat,
//  stadyum, "Maç sayfası" ve (oynanmamışsa) "Takvime ekle" (.ics, assets/takvim.js). Oyuncu / maç sayfasından geri dönünce kaydırma
//  yeri, seçili görünüm ve takvim ayı geri gelir (ortak.js konumKoru; çizimden SONRA).
import { supabase, hazir, h, $, sayfaBaslat, tarihYaz, saatYaz, goreceZaman, hataMetni, evSahibiDeplasman, skorMetni, sonucBilgisi, durumRozeti, sekmeKlavyesi, kapakKaynagi, kapakGorseli, fotoAtfi, cevrimdisiKutusu, duyur, konumKoru, SAKATLIK_ETIKETI } from '../ortak.js';
import { sonVeri, sonVeriYaz } from '../onbellek.js';
import { takvimIndir, trGunu, ayIzgarasi } from '../takvim.js';
import { sezonAdi } from '../kurallar.js';
import { puanTablosu, puanKaynakSatiri } from '../mac-gunu.js';

const oturumS = sayfaBaslat();
const gorunum = { ad: 'liste', ay: null }; // ay: 'YYYY-AA'
const konum = konumKoru(() => ({ gorunum: gorunum.ad, ay: gorunum.ay }));
if (konum.durum) Object.assign(gorunum, { ad: konum.durum.gorunum === 'takvim' ? 'takvim' : 'liste', ay: konum.durum.ay || null });
const MEVKILER = [['kaleci', 'Kaleciler'], ['defans', 'Defans'], ['orta_saha', 'Orta saha'], ['forvet', 'Forvet']];
const MEVKI_TEKIL = { kaleci: 'Kaleci', defans: 'Defans', orta_saha: 'Orta saha', forvet: 'Forvet' };
const DURUM_SIRASI = { sakat: 0, cezali: 1, belirsiz: 2, supheli: 2, dondu: 3 };
const KAYNAK_URL = /^https:\/\/[a-z0-9.-]+\.[a-z]{2,63}(\/[^\s"<>]*)?$/i;
const SEKMELER = ['kadro', 'sakatlik', 'fikstur', 'puan'];
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
  if (ad === 'puan' && !puanSozu && hazir) puanSozu = puanYukle();
}

// ------------------------------------------------------------ 020: puan durumu (sekme ilk açılınca)
let puanSozu = null;
async function puanYukle() {
  const kok = $('#puan-icerik');
  const sezon = sezonAdi(new Date().toISOString());
  const { data, error } = await supabase.from('puan_durumu').select('sezon, sira, takim, oynanan, galibiyet, beraberlik, maglubiyet, atilan, yenen, puan, guncellendi, kaynak')
    .eq('sezon', sezon).order('sira', { ascending: true }).limit(40);
  if (error) {
    kok.replaceChildren(cevrimdisiKutusu(hataMetni(error, 'Puan durumu yüklenemedi.'), () => { puanSozu = puanYukle(); }));
    kok.dataset.durum = 'hata';
    return;
  }
  kok.replaceChildren(...(data.length ? [h('p', { class: 'soluk puan-sezon' }, `${sezon} sezonu`), puanTablosu(data, { kimlik: 'puan-tablosu' }), puanKaynakSatiri(data)]
    : [h('p', { class: 'bos' }, 'Puan durumu henüz girilmedi. Lig başlayınca burada.')]));
  kok.dataset.durum = 'tamam';
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
  const k = kapakKaynagi(o.foto_url, { varsayilan: 480, kutu: 180 });
  const atif = k ? fotoAtfi(o.foto_url) : null;
  const durum = sakatlik && sakatlik.durum !== 'dondu' ? sakatlik.durum : null;
  // Mevki başlığı (DEFANS…) zaten grubun adı; fotoğraf yoksa forma no kartın büyük rakamı: meta satırı tekrar etmez (tasarımcı 5)
  // 018: kart oyuncu sayfasına giden TEK bağlantı (bu sezonun maç, dakika, gol, asist ve kart sayıları)
  const ad = [o.ad, o.forma_no != null ? `forma numarası ${o.forma_no}` : null, durum ? SAKATLIK_ETIKETI[durum] || durum : null].filter(Boolean).join(', ');
  // Kartın aria-label'ı içeriği gölgeler: atıf (görünürde tek satır, kısaltılmış) ekran okuyucuya açıklama olarak tam gider
  const atifId = atif ? 'atif-' + o.id : null;
  return h('li', null, h('a', { class: 'oyuncu-kart', href: 'oyuncu.html?id=' + encodeURIComponent(o.id), 'data-oyuncu-id': o.id, 'aria-label': `${ad}: oyuncu sayfası`, 'aria-describedby': atifId },
    durum ? h('span', { class: 'oyuncu-isaret durum-cip ' + durum }, SAKATLIK_ETIKETI[durum] || durum) : null,
    h('div', { class: 'oyuncu-gorsel gunes-motif', 'aria-hidden': k ? null : 'true' },
      k ? kapakGorseli(k, { width: '320', height: '240', loading: 'lazy' }) : h('span', { class: 'no' }, o.forma_no ?? '–')),
    h('div', { class: 'oyuncu-govde' },
      h('span', { class: 'ad' }, o.ad),
      o.forma_no != null ? h('span', { class: k ? 'mevki' : 'gorunmez' }, h('span', { class: 'gorunmez' }, 'Forma numarası '), k ? 'No ' : '', String(o.forma_no)) : null,
      // Özgür lisanslı fotoğrafta (CC BY / BY-SA) atıf her gösterimde zorunlu (assets/foto-kaynaklari.js)
      atif ? h('span', { class: 'kart-atif', id: atifId, title: atif }, atif) : null)));
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
    // Ad ve mevki ekran okuyucuda bitişik okunmasın ("Deniz DefansDefans" değil "Deniz, Defans")
    h('p', { class: 'ad' }, s.oyuncular ? s.oyuncular.ad : 'Oyuncu', s.oyuncular ? h('small', null, h('span', { class: 'gorunmez' }, ', '), MEVKI_TEKIL[s.oyuncular.mevki] || '') : null),
    h('span', { class: 'durum-cip ' + s.durum }, SAKATLIK_ETIKETI[s.durum] || s.durum),
    // İki satır (tasarımcı 3. tur 6): asıl bilgi "Dönüş: 20 Kasım" kalın; altında soluk "Kaynak: … · tarih · Güncellendi …".
    // Tarih parçaları bölünmez (nowrap): "5 / Kasım 2026" diye kırılmaz.
    s.beklenen_donus ? h('p', { class: 'donus' }, 'Dönüş: ', h('time', { datetime: s.beklenen_donus, class: 'parca' }, tarihYaz(s.beklenen_donus + 'T12:00:00Z', { saat: false, yil: false }))) : null,
    h('p', { class: 'kaynak' },
      'Kaynak: ', typeof s.kaynak_url === 'string' && KAYNAK_URL.test(s.kaynak_url)
        ? h('a', { href: s.kaynak_url, rel: 'noopener nofollow', target: '_blank' }, s.kaynak, h('span', { class: 'gorunmez' }, ' (yeni sekmede açılır)')) : s.kaynak,
      s.kaynak_tarihi ? [' ', h('span', { class: 'parca' }, '· ', h('time', { datetime: s.kaynak_tarihi, class: 'kaynak-tarihi' }, tarihYaz(String(s.kaynak_tarihi).slice(0, 10) + 'T12:00:00Z', { saat: false })))] : null,
      ' ', h('span', { class: 'parca' }, '· Güncellendi ', h('time', { datetime: s.guncellendi }, goreceZaman(s.guncellendi))))))));
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
      // Tarih solda kutuda (10 KAS): meta satırı gün adı (+ bitende saat) ile başlar, tarih yalnız ekran okuyucuya (tasarımcı 5)
      h('span', { class: 'bilgi' }, h('time', { datetime: mac.tarih }, gunAdi, skor ? ' ' + saatYaz(mac.tarih) : '', h('span', { class: 'gorunmez' }, ', ' + tarihYaz(mac.tarih, { saat: false }))),
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
  takvimVerisi = data;
  if (gorunum.ad === 'takvim') takvimCiz();
}

// ------------------------------------------------------------ fikstür: takvim görünümü
let takvimVerisi = [];
const AY_ADI = (yil, ay) => new Intl.DateTimeFormat('tr-TR', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(Date.UTC(yil, ay - 1, 15)));
const GUN_ADLARI = [['Pzt', 'Pazartesi'], ['Sal', 'Salı'], ['Çar', 'Çarşamba'], ['Per', 'Perşembe'], ['Cum', 'Cuma'], ['Cmt', 'Cumartesi'], ['Paz', 'Pazar']];
const ayAnahtari = (gun) => gun.slice(0, 7);
const ayKaydir = (a, n) => { const [y, m] = a.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
const ayAdi = (a) => { const [y, m] = a.split('-').map(Number); return AY_ADI(y, m); };
const ayMaclari = (a) => { const n = takvimVerisi.filter((m) => ayAnahtari(trGunu(m.tarih)) === a).length; return n ? `${n} maç` : 'maç yok'; };

function gorunumSec(ad, { odak = false } = {}) {
  gorunum.ad = ad === 'takvim' ? 'takvim' : 'liste';
  for (const d of document.querySelectorAll('#fikstur-gorunum [data-gorunum]')) d.setAttribute('aria-pressed', String(d.dataset.gorunum === gorunum.ad));
  $('#fikstur-liste').hidden = gorunum.ad !== 'liste';
  $('#fikstur-takvim').hidden = gorunum.ad !== 'takvim';
  if (gorunum.ad === 'takvim' && $('#gelecek').dataset.durum === 'tamam') takvimCiz();
  if (odak) duyur(gorunum.ad === 'takvim' ? `Takvim görünümü: ${gorunum.ay ? ayAdi(gorunum.ay) : ''}` : 'Liste görünümü');
}

function takvimCiz() {
  const kok = $('#fikstur-takvim');
  const gunler = new Map();
  for (const m of takvimVerisi) { const g = trGunu(m.tarih); gunler.set(g, [...(gunler.get(g) || []), m]); }
  const aylar = [...new Set([...gunler.keys()].map(ayAnahtari))].sort();
  if (!aylar.length) { kok.replaceChildren(h('p', { class: 'bos' }, 'Takvimde gösterilecek maç yok.')); return; }
  const bugun = trGunu(Date.now());
  // Açılış ayı: sıradaki maçın ayı (yoksa son maçın); geri dönüşte kayıtlı ay
  const siradaki = takvimVerisi.filter((m) => m.durum !== 'bitti').sort((a, b) => Date.parse(a.tarih) - Date.parse(b.tarih))[0];
  if (!gorunum.ay || gorunum.ay < aylar[0] || gorunum.ay > aylar[aylar.length - 1]) gorunum.ay = siradaki ? ayAnahtari(trGunu(siradaki.tarih)) : aylar[aylar.length - 1];
  const [yil, ay] = gorunum.ay.split('-').map(Number);
  const onceki = gorunum.ay > aylar[0] ? ayKaydir(gorunum.ay, -1) : null;
  const sonraki = gorunum.ay < aylar[aylar.length - 1] ? ayKaydir(gorunum.ay, 1) : null;
  const gezDugmesi = (yon, hedef) => {
    const d = h('button', {
      type: 'button', class: 'ikon-dugme takvim-gez', id: 'takvim-' + yon, 'aria-disabled': hedef ? null : 'true',
      'aria-label': (yon === 'onceki' ? 'Önceki ay' : 'Sonraki ay') + (hedef ? ': ' + ayAdi(hedef) : ''),
    }, h('span', { 'aria-hidden': 'true' }, yon === 'onceki' ? '‹' : '›'));
    d.addEventListener('click', () => { if (!hedef) return; gorunum.ay = hedef; takvimCiz(); $('#takvim-' + yon).focus(); duyur(`${ayAdi(hedef)}: ${ayMaclari(hedef)}`); });
    return d;
  };
  const hucreler = ayIzgarasi(yil, ay).map((c) => {
    if (!c.gun) return h('td', { class: 'takvim-bos' });
    const maclar = gunler.get(c.gun) || [];
    const bugunMu = c.gun === bugun;
    if (!maclar.length) return h('td', null, h('span', { class: 'takvim-no', 'aria-current': bugunMu ? 'date' : null }, String(c.no)));
    const m0 = maclar[0];
    const etiket = maclar.map((m) => { const [ev, dep] = evSahibiDeplasman(m); const sk = skorMetni(m); return `${ev} – ${dep}, ${m.ic_saha ? 'iç saha' : 'deplasman'}, ${sk ? 'skor ' + sk : saatYaz(m.tarih)}`; }).join('; ');
    const d = h('button', {
      type: 'button', class: 'takvim-gun ' + (m0.ic_saha ? 'ic' : 'dep') + (m0.durum === 'bitti' ? ' oynandi' : ''), 'data-gun': c.gun, 'aria-current': bugunMu ? 'date' : null,
      'aria-label': `${tarihYaz(m0.tarih, { saat: false, gun: true, yil: false })}: ${etiket}`,
    }, h('span', { class: 'takvim-no', 'aria-hidden': 'true' }, String(c.no)), h('span', { class: 'takvim-isaret', 'aria-hidden': 'true' }, m0.ic_saha ? 'İ' : 'D'));
    d.addEventListener('click', () => onizlemeAc(maclar, d));
    return h('td', null, d);
  });
  const satirlar = [];
  for (let i = 0; i < hucreler.length; i += 7) satirlar.push(h('tr', null, ...hucreler.slice(i, i + 7)));
  kok.replaceChildren(
    h('div', { class: 'takvim-ust' }, gezDugmesi('onceki', onceki), h('h3', { class: 'takvim-ay', id: 'takvim-ay' }, AY_ADI(yil, ay)), gezDugmesi('sonraki', sonraki)),
    h('table', { class: 'takvim-izgara', id: 'takvim-izgara', 'aria-labelledby': 'takvim-ay' },
      h('thead', null, h('tr', null, ...GUN_ADLARI.map(([k, u]) => h('th', { scope: 'col' }, h('abbr', { title: u }, k))))),
      h('tbody', null, ...satirlar)),
    h('p', { class: 'takvim-anahtar' },
      h('span', { class: 'takvim-isaret ic', 'aria-hidden': 'true' }, 'İ'), ' İç saha ',
      h('span', { class: 'takvim-isaret dep', 'aria-hidden': 'true' }, 'D'), ' Deplasman · Maç gününe dokun: ayrıntı ve "Takvime ekle".'));
}

// Alttan açılan önizleme (profil.html çıkış onayı deseni). Pencere body'de: arka plan (main, menü, üst bar, künye) inert olur
let pencere = null;
function onizlemeAc(maclar, kaynak) {
  const arka = [$('#icerik'), $('#alt-nav'), document.querySelector('header.ust'), document.querySelector('footer.alt')];
  if (!pencere) {
    pencere = h('dialog', { class: 'sayfa-alt', id: 'takvim-onizleme', 'aria-labelledby': 'onizleme-gun' });
    pencere.addEventListener('click', (e) => { if (e.target === pencere) pencere.close(); }); // arka plana dokununca
    pencere.addEventListener('close', () => { arka.forEach((e) => e && e.removeAttribute('inert')); if (pencere.kaynak && pencere.kaynak.isConnected) pencere.kaynak.focus(); });
    document.body.append(pencere);
  }
  pencere.kaynak = kaynak;
  const kapat = h('button', { type: 'button', class: 'dugme ikincil onizleme-kapat', id: 'onizleme-kapat' }, 'Kapat');
  kapat.addEventListener('click', () => pencere.close());
  pencere.replaceChildren(h('div', { class: 'ic' },
    h('h2', { id: 'onizleme-gun', class: 'onizleme-gun' }, tarihYaz(maclar[0].tarih, { saat: false, gun: true })),
    ...maclar.map((m) => {
      const [ev, dep] = evSahibiDeplasman(m);
      const sk = skorMetni(m), sonuc = sonucBilgisi(m);
      const ekle = m.durum !== 'bitti' ? h('button', { type: 'button', class: 'dugme ikincil takvime-ekle' }, 'Takvime ekle') : null;
      if (ekle) ekle.addEventListener('click', () => { takvimIndir(m, new URL('mac.html?id=' + encodeURIComponent(m.id), location.href).href); duyur('Takvim dosyası indirildi. Açınca takvimine eklenir.'); });
      return h('section', { class: 'onizleme-mac', 'aria-label': `${ev} – ${dep}` },
        h('p', { class: 'onizleme-eslesme' }, ev, ' – ', dep, sk ? [' ', h('span', { class: 'skor-blok' }, sk)] : null,
          sonuc ? [' ', h('span', { class: 'sonuc-rozet ' + sonuc.sinif }, h('span', { 'aria-hidden': 'true' }, sonuc.harf), h('span', { class: 'gorunmez' }, sonuc.ad))] : null),
        h('p', { class: 'onizleme-bilgi' }, h('time', { datetime: m.tarih }, saatYaz(m.tarih)), ' (TSİ)', m.stadyum ? ' · ' + m.stadyum : ''),
        h('p', { class: 'onizleme-bilgi soluk' }, [m.organizasyon, m.ic_saha ? 'İç saha' : 'Deplasman'].filter(Boolean).join(' · ')),
        h('div', { class: 'dugme-satir' }, h('a', { class: 'dugme', href: 'mac.html?id=' + encodeURIComponent(m.id), 'data-mac-id': m.id }, 'Maç sayfası'), ekle));
    }),
    kapat));
  if (typeof pencere.showModal === 'function') {
    pencere.showModal();
    arka.forEach((e) => e && e.setAttribute('inert', ''));
    pencere.querySelector('.dugme').focus();
  } else location.href = 'mac.html?id=' + encodeURIComponent(maclar[0].id);
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

$('#fikstur-gorunum').addEventListener('click', (e) => { const d = e.target.closest('[data-gorunum]'); if (d) gorunumSec(d.dataset.gorunum, { odak: true }); });
gorunumSec(gorunum.ad);
if (hazir) yukle().then(() => konum.geriYukle()); else { $('#kadro-icerik').replaceChildren(); $('#sakatlik-icerik').replaceChildren(); $('#gelecek').replaceChildren(); }
await oturumS;
