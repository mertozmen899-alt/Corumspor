// Gol arşivi: Sezon (Temmuz–Haziran, "2026-27") ve Rakip filtreleri (fieldset/legend + yerel radyo düğmeleri; rakip çoksa
// <select>), sonuç sayısı #durum'a duyurulur, seçim adrese yazılır (?sezon=&rakip=&ac=). 018: her maç TEK satır (açılır düğme,
// aria-expanded + aria-controls): "1. Hafta · Galatasaray – Çorum FK 2 – 2"; dokununca altında o maçın golleri dakika sırasıyla
// kompakt satırlar ("59' Alexandros Kyziridis · Asist: Fredy ▶") → gol.html?id= (video orada, dokununca, yalnız gol anı).
// Golsüz maç listelenmez, maç özeti bu sayfada yok (maç sayfasında). Video bu sayfada yüklenmez (YouTube'a istek yok).
import { supabase, hazir, h, $, sayfaBaslat, hataMetni, duyur, cevrimdisiKutusu, evSahibiDeplasman, skorOgesi, skorMetni } from '../ortak.js';
import { sezonAdi } from '../kurallar.js';
import { golAniSatiri, macEtiketi, kartTarihi } from '../gol-kart.js';
import { sonVeri, sonVeriYaz } from '../onbellek.js';

const MAC_SAYFA = 20;       // "Daha fazla maç" her basışta 20 maç daha (satırlar kompakt)
const RAKIP_SECIM_SINIRI = 10; // daha çok rakip varsa radyo yerine <select>
const arsiv = $('#arsiv');
const dugme = $('#daha-fazla');
let maclar = [];
let gosterilenMac = 0;
const secim = { sezon: null, rakip: '', ac: '' };
const oturumS = sayfaBaslat();

const golSirasi = (a, b) => a.dakika - b.dakika || (a.ek_dakika || 0) - (b.ek_dakika || 0);

function suzulmus() {
  return maclar.filter((m) => (!secim.sezon || sezonAdi(m.tarih) === secim.sezon) && (!secim.rakip || m.rakip === secim.rakip));
}

function adresYaz() {
  const u = new URL(location.href);
  if (secim.sezon) u.searchParams.set('sezon', secim.sezon); else u.searchParams.delete('sezon');
  if (secim.rakip) u.searchParams.set('rakip', secim.rakip); else u.searchParams.delete('rakip');
  if (secim.ac) u.searchParams.set('ac', secim.ac); else u.searchParams.delete('ac');
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
  const [ev, dep] = evSahibiDeplasman(mac);
  const acik = secim.ac === mac.id;
  const panel = 'goller-' + mac.id;
  return h('section', { class: 'arsiv-mac', 'data-mac-id': mac.id },
    h('h2', { class: 'mac-ac-baslik' },
      h('button', { type: 'button', class: 'mac-ac', id: 'mac-' + mac.id, 'aria-expanded': String(acik), 'aria-controls': panel },
        h('span', { class: 'mac-ac-metin' },
          h('span', { class: 'mac-ac-satir' }, mac.hafta ? h('span', { class: 'hafta' }, `${mac.hafta}. Hafta · `) : null, ev, ' – ', dep, ' ', skorOgesi(skorMetni(mac) || '–')),
          h('small', { class: 'mac-ac-alt' }, kartTarihi(mac.tarih), ' · ', mac.ic_saha ? 'İç saha' : 'Deplasman', ' · ', `${goller.length} gol`)),
        h('span', { class: 'mac-ac-ok', 'aria-hidden': 'true' }))),
    h('div', { class: 'mac-goller', id: panel, hidden: !acik },
      h('ul', { class: 'gol-ani-listesi', 'aria-label': `${macEtiketi(mac)} golleri` }, goller.map((g) => h('li', { class: 'gol' }, golAniSatiri(g, mac)))),
      h('a', { class: 'mac-baglanti-kucuk', href: 'mac.html?id=' + encodeURIComponent(mac.id) }, 'Maç sayfası', h('span', { 'aria-hidden': 'true' }, ' →'))));
}

function macAc(dugmeEl, acik) {
  dugmeEl.setAttribute('aria-expanded', String(acik));
  document.getElementById(dugmeEl.getAttribute('aria-controls')).hidden = !acik;
  const id = dugmeEl.closest('.arsiv-mac').dataset.macId;
  if (acik) secim.ac = id; else if (secim.ac === id) secim.ac = '';
  adresYaz();
}
arsiv.addEventListener('click', (e) => {
  const b = e.target.closest('button.mac-ac');
  if (b) macAc(b, b.getAttribute('aria-expanded') !== 'true');
});

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
  // Adresteki açık maç (?ac=) ilk sayfada değilse onu da içerene kadar çiz
  if (secim.ac && !liste.some((m) => m.id === secim.ac)) secim.ac = '';
  while (secim.ac && !arsiv.querySelector(`.arsiv-mac[data-mac-id="${CSS.escape(secim.ac)}"]`) && !dugme.hidden) dahaCiz(liste);
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
  duyur(dugme.hidden ? 'Bütün maçlar gösteriliyor.' : 'Daha fazla maç yüklendi.');
  const odak = ilk && ilk.querySelector('button.mac-ac');
  if (odak) odak.focus(); else dugme.focus();
});

async function yukle() {
  const { data, error } = await supabase.from('maclar')
    .select('id, rakip, tarih, ic_saha, corum_skor, rakip_skor, durum, hafta, goller(id, oyuncu, dakika, ek_dakika, penalti, video_url, aciklama, kapak_url, sure_sn, asist, video_baslangic_sn, video_bitis_sn)')
    .order('tarih', { ascending: false }).limit(300);
  // Yalnız golü olan maçlar (en yeni üstte)
  const dolu = (data || []).filter((m) => (m.goller || []).length);
  if (error) {
    const eski = sonVeri('goller');
    if (eski) { maclar = eski.veri.filter((m) => (m.goller || []).length); filtreleriCiz(); listeyiCiz(); arsiv.prepend(cevrimdisiKutusu('Bağlantı yok; son görülen goller gösteriliyor.', () => location.reload(), { sonGuncelleme: eski.zaman })); arsiv.dataset.durum = 'onbellek'; return; }
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
  secim.ac = p.get('ac') || '';
  filtreleriCiz();
  listeyiCiz();
  arsiv.dataset.durum = 'tamam';
}

if (hazir) yukle(); else { arsiv.replaceChildren(); $('#sezonlar').replaceChildren(); $('#rakipler').replaceChildren(); }
await oturumS;
