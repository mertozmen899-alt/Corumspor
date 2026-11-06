// Gol arşivi: Sezon (Temmuz–Haziran, "2026-27") ve Rakip filtreleri (fieldset/legend + yerel radyo düğmeleri; rakip çoksa
// <select>), sonuç sayısı #durum'a duyurulur, seçim adrese yazılır (?sezon=&rakip=). Goller maç maç gruplanır; her gol
// gol.html?id= sayfasına giden TEK bağlantı. Video bu sayfada yüklenmez (YouTube'a istek yok). 016: grup başlığında
// "N. Hafta"; maçın özet videosu varsa "Özeti izle ▶" (mac.html?id=…#ozet), golsüz ama özetli maç da listelenir.
import { supabase, hazir, h, $, sayfaBaslat, hataMetni, duyur, cevrimdisiKutusu, eslesmeOgeleri } from '../ortak.js';
import { sezonAdi } from '../kurallar.js';
import { golKarti, macEtiketi, kartTarihi } from '../gol-kart.js';
import { sonVeri, sonVeriYaz } from '../onbellek.js';

const MAC_SAYFA = 8;        // "Daha fazla gol" her basışta 8 maç daha
const RAKIP_SECIM_SINIRI = 10; // daha çok rakip varsa radyo yerine <select>
const arsiv = $('#arsiv');
const dugme = $('#daha-fazla');
let maclar = [];
let gosterilenMac = 0;
const secim = { sezon: null, rakip: '' };
const oturumS = sayfaBaslat();

const golSirasi = (a, b) => a.dakika - b.dakika || (a.ek_dakika || 0) - (b.ek_dakika || 0);

function suzulmus() {
  return maclar.filter((m) => (!secim.sezon || sezonAdi(m.tarih) === secim.sezon) && (!secim.rakip || m.rakip === secim.rakip));
}

function adresYaz() {
  const u = new URL(location.href);
  if (secim.sezon) u.searchParams.set('sezon', secim.sezon); else u.searchParams.delete('sezon');
  if (secim.rakip) u.searchParams.set('rakip', secim.rakip); else u.searchParams.delete('rakip');
  history.replaceState(null, '', u.pathname.split('/').pop() + u.search);
}

function radyo(ad, deger, etiket, secili, sinifEk = '') {
  const id = `${ad}-${deger || 'hepsi'}`.replace(/[^\wçğıöşüÇĞİÖŞÜ-]/g, '-');
  return [h('input', { type: 'radio', name: ad, id, value: deger, checked: secili, class: sinifEk }), h('label', { for: id }, etiket)];
}

function filtreleriCiz() {
  const sezonlar = [...new Set(maclar.map((m) => sezonAdi(m.tarih)))].sort().reverse();
  if (!secim.sezon || !sezonlar.includes(secim.sezon)) secim.sezon = sezonlar[0] || null;
  $('#sezonlar').replaceChildren(...sezonlar.slice(0, 4).flatMap((s) => radyo('sezon', s, s, s === secim.sezon)));
  // Tek sezon: seçilecek bir şey yok; iz (hap içinde hap) yerine düz etiket görünümü (tasarımcı 11)
  $('#sezonlar').classList.toggle('tek', sezonlar.length === 1);
  if (sezonlar.length > 4) {
    // 4'ten fazla sezon: eskiler için seçim kutusu
    const sec = h('select', { id: 'sezon-eski', 'aria-label': 'Daha eski sezonlar' }, h('option', { value: '' }, 'Eski sezon…'), ...sezonlar.slice(4).map((s) => h('option', { value: s, selected: s === secim.sezon }, s)));
    $('#sezonlar').after(sec);
  }
  const rakipler = [...new Set(maclar.filter((m) => sezonAdi(m.tarih) === secim.sezon).map((m) => m.rakip))].sort((a, b) => a.localeCompare(b, 'tr'));
  if (secim.rakip && !rakipler.includes(secim.rakip)) secim.rakip = '';
  const kutu = $('#rakipler');
  if (rakipler.length > RAKIP_SECIM_SINIRI) {
    kutu.replaceChildren(h('label', { class: 'gorunmez', for: 'rakip-sec' }, 'Rakip'),
      h('select', { id: 'rakip-sec', name: 'rakip' }, h('option', { value: '' }, 'Tüm rakipler'), ...rakipler.map((r) => h('option', { value: r, selected: r === secim.rakip }, r))));
  } else {
    kutu.replaceChildren(...radyo('rakip', '', 'Tüm rakipler', !secim.rakip), ...rakipler.flatMap((r) => radyo('rakip', r, r, r === secim.rakip)));
  }
}

function golSayisi(liste) { return liste.reduce((t, m) => t + m.goller.length, 0); }

function ozetYaz(liste, duyurulsun) {
  const n = golSayisi(liste);
  const metin = n ? `${secim.sezon || 'Bütün sezonlar'}${secim.rakip ? ' · ' + secim.rakip : ''} · ${n} gol` : 'Bu filtrede gol yok.';
  $('#sonuc-sayisi').textContent = metin;
  if (duyurulsun) duyur(n ? `${secim.sezon}${secim.rakip ? ', ' + secim.rakip : ''}: ${n} gol.` : 'Bu filtrelerle gol bulunamadı.');
}

function macGrubu(mac) {
  const goller = [...mac.goller].sort(golSirasi);
  const adres = 'mac.html?id=' + encodeURIComponent(mac.id);
  // 016: maçın özet videosu varsa grup bağlantısı doğrudan özete gider (maç sayfasında dokununca yüklenir)
  const ozet = !!mac.ozet_video_url;
  return h('section', { class: 'arsiv-mac', 'data-mac-id': mac.id, 'aria-labelledby': 'mac-' + mac.id },
    h('div', { class: 'grup-baslik' },
      h('span', { class: 'grup-ust' }, mac.hafta ? `${mac.hafta}. Hafta · ` : '', kartTarihi(mac.tarih), ' · ', mac.ic_saha ? 'İç saha' : 'Deplasman'),
      h('h2', { id: 'mac-' + mac.id }, eslesmeOgeleri(mac)),
      ozet ? h('a', { href: adres + '#ozet', 'aria-label': `Maç özetini izle: ${macEtiketi(mac)}` }, 'Özeti izle ▶')
        : h('a', { href: adres, 'aria-label': `Maç ayrıntısı: ${macEtiketi(mac)}` }, 'Maç →')),
    // Grup başlığı maçı zaten söylüyor: kartta maç satırı tekrar edilmez (tasarımcı 5)
    goller.length ? h('ul', { class: 'gol-listesi' }, goller.map((g, i) => h('li', { class: 'gol' }, golKarti(g, mac, { ilk: gosterilenMac === 0 && i === 0, macSatiri: false, kutu: Math.min(innerWidth, 720) - 32 }))))
      : h('p', { class: 'soluk' }, 'Bu maçta golümüz yok; özeti izleyebilirsin.'));
}

function listeyiCiz({ duyurulsun = false } = {}) {
  const liste = suzulmus();
  gosterilenMac = 0;
  arsiv.replaceChildren();
  if (!liste.length) {
    const temizle = h('button', { type: 'button', class: 'dugme ikincil' }, 'Filtreleri temizle');
    temizle.addEventListener('click', () => { secim.rakip = ''; filtreleriCiz(); listeyiCiz({ duyurulsun: true }); adresYaz(); temizle.blur(); });
    arsiv.append(h('div', { class: 'filtre-bos' }, h('p', { class: 'bos' }, maclar.length ? 'Bu filtrede gol yok.' : 'Gol arşivi yakında dolacak.'), maclar.length ? temizle : null));
  }
  dahaCiz(liste);
  ozetYaz(liste, duyurulsun);
}

function dahaCiz(liste = suzulmus()) {
  const parca = liste.slice(gosterilenMac, gosterilenMac + MAC_SAYFA);
  const ilk = parca.length ? macGrubu(parca[0]) : null;
  parca.forEach((m, i) => { arsiv.append(i === 0 ? ilk : macGrubu(m)); gosterilenMac += 1; });
  dugme.hidden = gosterilenMac >= liste.length;
  return ilk;
}

function degisti(e) {
  const t = e.target;
  if (t.name === 'sezon' || t.id === 'sezon-eski') { if (!t.value) return; secim.sezon = t.value; secim.rakip = ''; filtreleriCiz(); }
  else if (t.name === 'rakip') secim.rakip = t.value;
  // Liste hemen süzülür, odak seçilen radyoda kalır, sayfa kaymaz (3.2.2); sonuç #durum'a duyurulur
  const y = window.scrollY;
  listeyiCiz({ duyurulsun: true });
  adresYaz();
  window.scrollTo(0, y);
  const yeniden = t.id && document.getElementById(t.id);
  if (yeniden && document.activeElement !== yeniden) yeniden.focus({ preventScroll: true });
}
for (const f of [$('#sezon-formu'), $('#filtreler')]) { f.addEventListener('change', degisti); f.addEventListener('submit', (e) => e.preventDefault()); }

dugme.addEventListener('click', () => {
  const ilk = dahaCiz();
  duyur(dugme.hidden ? 'Bütün goller gösteriliyor.' : 'Daha fazla gol yüklendi.');
  const odak = ilk && ilk.querySelector('a.video-kart, a.gol-satir');
  if (odak) odak.focus(); else dugme.focus();
});

async function yukle() {
  const { data, error } = await supabase.from('maclar')
    .select('id, rakip, tarih, ic_saha, corum_skor, rakip_skor, durum, hafta, ozet_video_url, goller(id, oyuncu, dakika, ek_dakika, penalti, video_url, aciklama, kapak_url, sure_sn)')
    .order('tarih', { ascending: false }).limit(300);
  // Golü ya da özet videosu olan maçlar (golsüz maçın özeti de izlenebilsin; oynanmamış maç listelenmez)
  const dolu = (data || []).filter((m) => (m.goller || []).length || m.ozet_video_url);
  if (error) {
    const eski = sonVeri('goller');
    if (eski) { maclar = eski.veri; filtreleriCiz(); listeyiCiz(); arsiv.prepend(cevrimdisiKutusu('Bağlantı yok; son görülen goller gösteriliyor.', () => location.reload(), { sonGuncelleme: eski.zaman })); arsiv.dataset.durum = 'onbellek'; return; }
    arsiv.replaceChildren(cevrimdisiKutusu(hataMetni(error, 'Goller yüklenemedi.'), () => { arsiv.replaceChildren(); yukle(); }));
    // Filtre iskeletleri sonsuza kadar kalmaz: veri yokken filtre de yok (tasarımcı 4)
    $('#sezon-formu').hidden = true; $('#filtreler').hidden = true;
    arsiv.dataset.durum = 'hata';
    return;
  }
  maclar = dolu;
  $('#sezon-formu').hidden = false; $('#filtreler').hidden = false;
  sonVeriYaz('goller', dolu.slice(0, 12));
  const p = new URLSearchParams(location.search);
  secim.sezon = p.get('sezon');
  secim.rakip = p.get('rakip') || '';
  filtreleriCiz();
  listeyiCiz();
  arsiv.dataset.durum = 'tamam';
}

if (hazir) yukle(); else { arsiv.replaceChildren(); $('#sezonlar').replaceChildren(); $('#rakipler').replaceChildren(); }
await oturumS;
