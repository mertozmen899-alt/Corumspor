// Oyuncu sayfası (oyuncu.html?id=<oyuncular.id>; 018): ad, forma no, mevki; bu sezonun (kurallar.js sezonAdi, Temmuz–Haziran)
// Maç, İlk 11, Dakika (mac_oyunculari: maç olayları, uzatma = 90), Gol, Asist, Gole katkı (goller.oyuncu / goller.asist),
// Sarı, Kırmızı ve gollerinin / asistlerinin listesi (→ gol.html). Eşleştirme adla: kurallar.js oyuncuAnahtari (Türkçe harf,
// aksan, büyük/küçük harf ve boşluk farkı yok sayılır). Pas, şut, piyasa değeri GÖSTERİLMEZ (lisanslı veri; kaynağımız yok).
import { supabase, hazir, h, $, sayfaBaslat, param, kimlikGecerli, cevrimdisiKutusu, hataMetni, dakikaMetni, dakikaOkunus, tarihYaz, evSahibiDeplasman, skorMetni, skorOgesi } from '../ortak.js';
import { sezonAdi, oyuncuAnahtari, oyuncuOzeti } from '../kurallar.js';

const kok = $('#oyuncu');
const id = param('id');
const oturumS = sayfaBaslat();
const MEVKI = { kaleci: 'Kaleci', defans: 'Defans', orta_saha: 'Orta saha', forvet: 'Forvet' };
const MAC_SUTUNLARI = 'id, rakip, tarih, ic_saha, corum_skor, rakip_skor, durum, hafta';

function bulunamadi() {
  document.title = 'Oyuncu bulunamadı · Çorumspor Taraftar';
  kok.replaceChildren(h('div', { class: 'kutu' }, h('h1', null, 'Oyuncu bulunamadı'), h('a', { class: 'dugme', href: 'takim.html#kadro' }, 'Kadroya dön')));
  kok.dataset.durum = 'tamam';
}

const macMetni = (m) => { const [ev, dep] = evSahibiDeplasman(m); return [m.hafta ? `${m.hafta}. Hafta · ` : '', ev, ' – ', dep, ' ', skorOgesi(skorMetni(m) || '–')]; };
const macOkunus = (m) => { const [ev, dep] = evSahibiDeplasman(m); return `${m.hafta ? m.hafta + '. Hafta · ' : ''}${ev} ${skorMetni(m) || '–'} ${dep}, ${tarihYaz(m.tarih, { saat: false, yil: false })}`; };

/** Gol / asist satırı: "59' · 1. Hafta · Galatasaray – Çorum FK 2 – 2" → gol.html?id= (tek bağlantı). */
function golSatiri(g, asistMi) {
  const m = g.maclar;
  return h('li', null, h('a', { class: 'gol-satir gol-ani', href: 'gol.html?id=' + encodeURIComponent(g.id), 'data-gol-id': g.id,
    'aria-label': `${asistMi ? `Asist: ${g.oyuncu} golü` : 'Gol'}, ${dakikaOkunus(g)} · ${macOkunus(m)}` },
    h('span', { class: 'dakika', 'aria-hidden': 'true' }, dakikaMetni(g)),
    h('span', null, asistMi ? h('span', { class: 'oyuncu' }, g.oyuncu, ' golü · ') : null, h('span', { class: 'asist' }, ...macMetni(m))),
    h('span', { class: 'soluk', 'aria-hidden': 'true' }, '›')));
}

function ciz(o, sezon, kadro, goller) {
  const ad = o.ad;
  document.title = `${ad} · Çorumspor Taraftar`;
  const k = oyuncuAnahtari(ad);
  const ozet = oyuncuOzeti(ad, kadro, goller);
  const sira = (a, b) => Date.parse(b.maclar.tarih) - Date.parse(a.maclar.tarih) || a.dakika - b.dakika;
  const gollerim = goller.filter((g) => oyuncuAnahtari(g.oyuncu) === k).sort(sira);
  const asistlerim = goller.filter((g) => g.asist && oyuncuAnahtari(g.asist) === k).sort(sira);
  const veriYok = !ozet.mac && !ozet.katki;
  const kutu = (deger, etiket, vurgu = false) => h('li', { class: vurgu ? 'vurgu' : null }, h('span', { class: 'sayi' }, String(deger)), h('span', { class: 'etiket' }, etiket));
  kok.replaceChildren(
    h('div', { class: 'oyuncu-bas' },
      h('span', { class: 'no', 'aria-hidden': 'true' }, o.forma_no ?? '–'),
      h('div', null, h('h1', { id: 'oyuncu-ad' }, ad),
        h('p', { class: 'mevki' }, [MEVKI[o.mevki], o.forma_no != null ? `${o.forma_no} numara` : null].filter(Boolean).join(' · ')))),
    h('section', { class: 'oyuncu-bolum', 'aria-labelledby': 'sezon-baslik' },
      h('h2', { id: 'sezon-baslik' }, `${sezon} sezonu`),
      veriYok ? h('p', { class: 'bos', id: 'oyuncu-bos' }, 'Bu sezon henüz maç verisi yok. İlk maçından sonra sayılar burada.')
        : h('ul', { class: 'istatistik-izgara', id: 'istatistikler' },
          kutu(ozet.mac, 'Maç'), kutu(ozet.ilk11, 'İlk 11'), kutu(ozet.dakika, 'Dakika'), kutu(ozet.gol, 'Gol', true),
          kutu(ozet.asist, 'Asist', true), kutu(ozet.katki, 'Gole katkı', true), kutu(ozet.sari, 'Sarı kart'), kutu(ozet.kirmizi, 'Kırmızı kart')),
      veriYok ? null : h('p', { class: 'istatistik-not' }, 'Kaynak: maç olayları (kulübün maç sayfaları). Dakikalar maç olaylarından hesaplanır, uzatmalar sayılmaz.')),
    h('section', { class: 'oyuncu-bolum', 'aria-labelledby': 'katki-baslik' },
      h('h2', { id: 'katki-baslik' }, 'Golleri ve asistleri'),
      gollerim.length || asistlerim.length ? [
        gollerim.length ? [h('h3', { class: 'grup-baslik-k', id: 'goller-baslik' }, `Goller (${gollerim.length})`), h('ul', { class: 'gol-ani-listesi', id: 'oyuncu-goller', 'aria-labelledby': 'goller-baslik' }, gollerim.map((g) => golSatiri(g, false)))] : null,
        asistlerim.length ? [h('h3', { class: 'grup-baslik-k', id: 'asistler-baslik' }, `Asistler (${asistlerim.length})`), h('ul', { class: 'gol-ani-listesi', id: 'oyuncu-asistler', 'aria-labelledby': 'asistler-baslik' }, asistlerim.map((g) => golSatiri(g, true)))] : null,
      ] : h('p', { class: 'bos', id: 'katki-bos' }, 'Bu sezon henüz gol katkısı yok. İlk golü geldiğinde burada!')));
}

async function yukle() {
  if (!kimlikGecerli(id)) return bulunamadi();
  const [oy, go, ka] = await Promise.all([
    supabase.from('oyuncular').select('id, ad, forma_no, mevki').eq('id', id).maybeSingle(),
    supabase.from('goller').select(`id, oyuncu, asist, dakika, ek_dakika, penalti, maclar(${MAC_SUTUNLARI})`).limit(3000),
    supabase.from('mac_oyunculari').select('mac_id, oyuncu, ilk11, giris_dk, cikis_dk, sari, kirmizi, maclar(tarih)').limit(5000),
  ]);
  const hata = oy.error || go.error || ka.error;
  if (hata) {
    kok.replaceChildren(cevrimdisiKutusu(hataMetni(hata, 'Oyuncu yüklenemedi. İnternet bağlantını kontrol et.'), () => location.reload()));
    kok.dataset.durum = 'hata';
    return;
  }
  if (!oy.data) return bulunamadi();
  const sezon = sezonAdi(new Date().toISOString());
  const buSezon = (r) => r.maclar && sezonAdi(r.maclar.tarih) === sezon;
  ciz(oy.data, sezon, (ka.data || []).filter(buSezon), (go.data || []).filter(buSezon));
  kok.dataset.durum = 'tamam';
}

if (!hazir) kok.replaceChildren(); else yukle();
await oturumS;
