// 020: maç günü bileşenleri: form rozetleri, "Bu sezon <rakip> ile", maç öncesi paketi, ilk 11 sahası, skor tahmini (+ dağılım),
// maçın oyuncusu oylaması, puan tablosu. Hepsi h() ile (innerHTML yok). Hareketler stil.css 33. bölümde: tek seferlik, kısa
// (≤ 400 ms; sırayla belirmede toplam ≤ 600 ms), yalnız transform / opacity; prefers-reduced-motion: reduce'da kapalı (anında son hâl).
// Sırayla belirme: kapsayıcıya .sirayla, her öğeye --i (CSSOM; satır içi stil özniteliği değil). Sayılar: sayarakYaz (görününce
// 0'dan sayar; ekran okuyucu gerçek değeri gizli metinden okur). Canlı bölge yalnız #durum / #uyari (duyur / uyar).
import { supabase, h, $, simge, duyur, hataMetni, evSahibiDeplasman, skorYaz, skorMetni, tarihYaz, girisAdresi, mesaj, hareketAzalt, rakamDegistir, TAKIM_ADI, SAKATLIK_ETIKETI } from './ortak.js';
import { formDizisi, rakipleSezon, sezonAdi, sonucHarfi, dizilisSatirlari, tahminAcik, oyDurumu, oyKapanisi, bizMiyiz, puanCevresi, oyuncuAnahtari, macaCikti, TAHMIN_SINIRI } from './kurallar.js';

const SONUC_ADI = { G: 'Galibiyet', B: 'Beraberlik', M: 'Mağlubiyet' };
const MEVKI = { kaleci: 'Kaleci', defans: 'Defans', orta_saha: 'Orta saha', forvet: 'Forvet' };
const MEVKI_SIRASI = { kaleci: 0, defans: 1, orta_saha: 2, forvet: 3 };
const TAC_YOLU = 'M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z';
const SAYI_SURESI = 400; // ms (sayarak artan sayılar)

/**
 * Bölümün hareketleri (sırayla belirme, çubuk dolması, sahaya yerleşme) bölüm görünür alana girince başlasın: o ana kadar
 * animation-play-state: paused (.hareket-bekle; ilk kare = başlangıç hâli). IntersectionObserver yoksa ya da hareket azaltmada hemen.
 */
export function gorununceOynat(el) {
  if (!el || hareketAzalt() || typeof IntersectionObserver !== 'function') return el;
  el.classList.add('hareket-bekle');
  const io = new IntersectionObserver(([g]) => { if (g.isIntersecting) { io.disconnect(); el.classList.remove('hareket-bekle'); } }, { threshold: 0.15 });
  io.observe(el);
  return el;
}

/** Kapsayıcının çocukları sırayla belirsin (CSS .sirayla > * { animation-delay: --i × --sira-adim }). */
export function sirayla(kap) {
  [...kap.children].forEach((c, i) => c.style.setProperty('--i', String(i)));
  kap.classList.add('sirayla');
  return kap;
}

/**
 * Sayıyı görününce 0'dan hedefe sayarak yazar (≤ 400 ms, yavaşlayarak). Hareket azaltmada ya da IntersectionObserver yoksa anında.
 * Görünen rakam aria-hidden; ekran okuyucu gerçek değeri yanındaki gizli metinden okur (0 okunmaz).
 */
export function sayiOgesi(hedef, { sonek = '', okunus = null } = {}) {
  const gorunen = h('span', { class: 'sayi-gorunen', 'aria-hidden': 'true' }, `${hedef}${sonek}`);
  const kap = h('span', { class: 'sayi' }, gorunen, h('span', { class: 'gorunmez' }, okunus ?? `${hedef}${sonek}`));
  if (hareketAzalt() || typeof IntersectionObserver !== 'function' || typeof requestAnimationFrame !== 'function' || !(hedef > 0)) return kap;
  gorunen.textContent = `0${sonek}`;
  const io = new IntersectionObserver(([g]) => {
    if (!g.isIntersecting) return;
    io.disconnect();
    const bas = performance.now();
    const adim = (t) => {
      const x = Math.max(0, Math.min(1, (t - bas) / SAYI_SURESI));
      gorunen.textContent = `${Math.round(hedef * (1 - (1 - x) ** 3))}${sonek}`;
      if (x < 1) requestAnimationFrame(adim);
    };
    requestAnimationFrame(adim);
  });
  io.observe(kap);
  return kap;
}

/** Yatay oran çubuğu (0-100): dolgu scaleX ile (yerleşim değişmez); görününce soldan dolar (CSS doldur, reduce'da anında). */
export function cubuk(yuzde, { vurgu = false } = {}) {
  const d = h('span', { class: 'cubuk-dolgu' + (vurgu ? ' vurgu' : '') });
  d.style.setProperty('--oran', String(Math.max(0, Math.min(100, yuzde)) / 100));
  return h('span', { class: 'cubuk', 'aria-hidden': 'true' }, d);
}

const tahminSkoru = (mac, t) => (mac.ic_saha ? skorYaz(t.corum, t.rakip) : skorYaz(t.rakip, t.corum));

// ------------------------------------------------------------ form rehberi
/** Son 5 lig maçı G/B/M rozetleri (eskiden yeniye; sırayla belirir). maclar: biten maçlar (herhangi sırada). Yoksa null. */
export function formSeridi(maclar, { baslik = 'Son 5 lig maçı', kimlik = 'form' } = {}) {
  const f = formDizisi(maclar);
  if (!f.length) return null;
  return gorununceOynat(h('div', { class: 'form-serit', id: kimlik },
    h('span', { class: 'form-baslik', id: kimlik + '-baslik' }, baslik),
    sirayla(h('ol', { class: 'form-rozetler', 'aria-labelledby': kimlik + '-baslik' }, f.map(({ harf, mac }) => {
      const [ev, dep] = evSahibiDeplasman(mac);
      const metin = `${ev} ${skorMetni(mac)} ${dep}`;
      // Rozet bağlantı değil (28 px: dokunma hedefi olamaz); maçlar fikstürde ve maç sayfalarında
      return h('li', null, h('span', { class: 'sonuc-rozet form-rozet ' + harf.toLowerCase(), title: metin },
        h('span', { 'aria-hidden': 'true' }, harf), h('span', { class: 'gorunmez' }, `${SONUC_ADI[harf]}: ${metin}, ${tarihYaz(mac.tarih, { saat: false })}`)));
    })))));
}

/** "Bu sezon Deneme FK ile: 2 – 1 G (iç saha) · 0 – 0 B (deplasman)". Bu sezon oynanmadıysa null. */
export function rakipleSatiri(maclar, mac) {
  const l = rakipleSezon(maclar, mac.rakip, sezonAdi(mac.tarih), mac.id);
  if (!l.length) return null;
  return h('p', { class: 'rakiple', id: 'rakiple' }, h('strong', null, `Bu sezon ${mac.rakip} ile: `),
    l.map((m, i) => {
      const harf = sonucHarfi(m);
      return [i ? ' · ' : '', h('a', { href: 'mac.html?id=' + encodeURIComponent(m.id) },
        h('span', { class: 'skor-blok' }, skorMetni(m)), ' ',
        h('span', { class: 'sonuc-rozet kucuk ' + harf.toLowerCase() }, h('span', { 'aria-hidden': 'true' }, harf), h('span', { class: 'gorunmez' }, SONUC_ADI[harf])),
        ` (${m.ic_saha ? 'iç saha' : 'deplasman'})`)];
    }));
}

// ------------------------------------------------------------ maç öncesi paketi
/** Hakem, yayın, stadyum, "Kim yok?" (yayındaki sakatlıklar), maçla ilgili son haberler, kaynak. Hiçbiri yoksa null. */
export function macOncesiPaketi(mac, { sakatliklar = [], haberler = [] } = {}) {
  const bilgi = [['Hakem', mac.hakem], ['Yayın', mac.yayin_kanali], ['Stadyum', mac.stadyum]].filter(([, v]) => typeof v === 'string' && v.trim());
  const eksik = sakatliklar.filter((s) => s.durum !== 'dondu' && s.oyuncular && s.oyuncular.ad);
  if (!bilgi.length && !eksik.length && !haberler.length) return null;
  const kaynak = typeof mac.on_bilgi_kaynak === 'string' && mac.on_bilgi_kaynak.trim();
  return gorununceOynat(h('section', { class: 'paket', id: 'mac-paketi', 'aria-labelledby': 'paket-baslik' },
    h('div', { class: 'bolum-baslik' }, h('h2', { id: 'paket-baslik' }, 'Maç öncesi')),
    bilgi.length ? sirayla(h('dl', { class: 'paket-bilgi' }, bilgi.map(([ad, v]) => h('div', null, h('dt', null, ad), h('dd', null, v.trim()))))) : null,
    eksik.length ? h('div', { class: 'paket-blok' },
      h('h3', { id: 'paket-kim-yok' }, 'Kim yok?'),
      h('ul', { class: 'paket-eksik', 'aria-labelledby': 'paket-kim-yok' }, eksik.slice(0, 6).map((s) => h('li', null, h('span', null, s.oyuncular.ad),
        h('span', { class: 'durum-cip ' + s.durum }, SAKATLIK_ETIKETI[s.durum] || s.durum)))),
      h('a', { class: 'paket-git', href: 'takim.html#sakatlik' }, 'Kaynaklı sakatlık bilgisi', h('span', { 'aria-hidden': 'true' }, ' →'))) : null,
    haberler.length ? h('div', { class: 'paket-blok' },
      h('h3', { id: 'paket-haber' }, 'Maça dair son haberler'),
      h('ul', { class: 'paket-haberler', 'aria-labelledby': 'paket-haber' }, haberler.map((x) => h('li', null,
        h('a', { href: 'haber.html?id=' + encodeURIComponent(x.id), 'data-haber-id': x.id }, x.baslik),
        h('time', { datetime: x.yayin_tarihi }, tarihYaz(x.yayin_tarihi, { saat: false, yil: false })))))) : null,
    kaynak ? h('p', { class: 'paket-kaynak', id: 'paket-kaynak' }, 'Kaynak: ', kaynak, '. Kesin bilgi için kulübün resmî duyurusuna bak.') : null));
}

// ------------------------------------------------------------ ilk 11 sahası
const soyad = (ad) => String(ad).trim().split(/\s+/).pop();
/**
 * Yeşil saha: dizilişin satırları (önde forvet, arkada kaleci), rozet = forma no + soyad, oyuncu sayfasına bağlantı. Rozetler
 * kaleciden forvete sırayla sahaya yerleşir (CSS sahaya-gir). Diziliş / sıra eksikse null (sayfa Olaylar'daki listeyi kullanır).
 */
export function dizilisSahasi(mac, kadro = [], oyuncular = []) {
  const satirlar = dizilisSatirlari(mac.dizilis, kadro);
  if (!satirlar) return null;
  const bul = new Map(oyuncular.map((o) => [oyuncuAnahtari(o.ad), o]));
  let i = 0;
  const rozet = (s) => {
    const o = bul.get(oyuncuAnahtari(s.oyuncu));
    const no = s.forma_no ?? (o && o.forma_no) ?? null;
    const ic = [h('span', { class: 'saha-no', 'aria-hidden': 'true' }, no != null ? String(no) : '–'), h('span', { class: 'saha-ad', 'aria-hidden': 'true' }, soyad(s.oyuncu)),
      h('span', { class: 'gorunmez' }, s.oyuncu, no != null ? `, forma ${no}` : '')];
    const el = o ? h('a', { class: 'saha-oyuncu', href: 'oyuncu.html?id=' + encodeURIComponent(o.id), 'data-oyuncu-id': o.id }, ...ic) : h('span', { class: 'saha-oyuncu' }, ...ic);
    el.style.setProperty('--i', String(i++));
    return h('li', null, el);
  };
  const ad = (k) => (k === 0 ? 'Kaleci' : k === 1 ? 'Defans' : k === satirlar.length - 1 ? 'Forvet' : 'Orta saha');
  return gorununceOynat(h('section', { class: 'dizilis', id: 'dizilis', 'aria-labelledby': 'dizilis-baslik' },
    h('div', { class: 'bolum-baslik' }, h('h2', { id: 'dizilis-baslik' }, 'İlk 11'),
      h('span', { class: 'dizilis-ad', 'aria-label': `Diziliş ${mac.dizilis}` }, mac.dizilis)),
    mac.ilk11_aciklandi ? h('p', { class: 'ilk11-not' }, h('span', { class: 'rozet ilk11-rozet' }, 'İlk 11 açıklandı'), ' ',
      h('time', { datetime: mac.ilk11_aciklandi }, tarihYaz(mac.ilk11_aciklandi, { yil: false }))) : null,
    h('div', { class: 'saha' },
      h('span', { class: 'saha-cizgi', 'aria-hidden': 'true' }),
      h('ol', { class: 'saha-satirlar sahaya', 'aria-label': `${TAKIM_ADI} ilk 11, ${mac.dizilis}: kaleciden forvete` },
        satirlar.map((s, k) => h('li', { class: 'saha-satir' }, h('span', { class: 'gorunmez' }, ad(k) + ': '), h('ul', null, s.map(rozet)))))),
    h('p', { class: 'soluk saha-not' }, 'Oyuncuya dokun: sezon istatistikleri. Yedekler ve değişiklikler Olaylar sekmesinde.')));
}

// ------------------------------------------------------------ skor tahmini
/**
 * Maç öncesi tahmin kutusu: iki büyük sayaç (ev sahibi solda), +/− düğmeleri, kaydet (tekrar değiştirilebilir). Misafire "Tahmin için
 * giriş yap". benim: kişinin kayıtlı tahmini ({ corum, rakip }) ya da null. Maç başlayınca kilitlenir (sunucu da kilitler).
 */
export function tahminKutusu(mac, { oturum = null, benim = null } = {}) {
  const deger = { corum: benim ? benim.corum : 1, rakip: benim ? benim.rakip : 1 };
  let kayitli = benim ? { ...benim } : null;
  const kisi = oturum && oturum.kullanici;
  const taraflar = mac.ic_saha ? [['corum', TAKIM_ADI], ['rakip', mac.rakip]] : [['rakip', mac.rakip], ['corum', TAKIM_ADI]];
  const not = h('p', { class: 'tahmin-durum', id: 'tahmin-durum' });
  const hata = h('p', { id: 'tahmin-hata', hidden: true });
  const kaydet = kisi ? h('button', { type: 'button', class: 'dugme tahmin-kaydet', id: 'tahmin-kaydet' }, benim ? 'Tahminimi güncelle' : 'Tahminimi kaydet')
    : h('a', { class: 'dugme ikincil', id: 'tahmin-giris', href: girisAdresi('#ozet') }, 'Tahmin için giriş yap');
  const durumYaz = () => {
    not.replaceChildren(...(kayitli ? ['Kayıtlı tahminin: ', h('strong', { class: 'skor-blok' }, tahminSkoru(mac, kayitli)), '. Maç başlayana kadar değiştirebilirsin.']
      : [kisi ? 'Henüz tahmin yapmadın.' : 'Giriş yapınca tahminin kaydolur.']));
  };
  const sayac = ([alan, takim]) => {
    const sayi = h('span', { class: 'sayac-deger', id: `tahmin-${alan}`, 'aria-hidden': 'true' }, String(deger[alan]));
    const okunus = h('span', { class: 'gorunmez', id: `tahmin-${alan}-okunus` }, `${takim}: ${deger[alan]}`);
    const dugme = (fark, etiket) => {
      const d = h('button', { type: 'button', class: 'sayac-dugme', 'aria-label': `${takim} golünü ${fark > 0 ? 'artır' : 'azalt'}`, 'aria-describedby': `tahmin-${alan}-okunus` }, etiket);
      d.addEventListener('click', () => {
        const yeni = Math.max(0, Math.min(TAHMIN_SINIRI, deger[alan] + fark));
        if (yeni === deger[alan]) return;
        deger[alan] = yeni;
        rakamDegistir(sayi, String(yeni), fark > 0 ? 'yukari' : 'asagi');
        okunus.textContent = `${takim}: ${yeni}`;
        duyur(`${takim}: ${yeni}`);
        if (kaydet.tagName === 'BUTTON') kaydet.removeAttribute('aria-disabled');
      });
      return d;
    };
    return h('div', { class: 'sayac', role: 'group', 'aria-label': `${takim} golü` },
      h('span', { class: 'sayac-takim' + (alan === 'corum' ? ' biz' : '') }, takim),
      h('div', { class: 'sayac-ic' }, dugme(-1, '−'), h('span', { class: 'sayac-pencere' }, sayi), dugme(1, '+')), okunus);
  };
  if (kaydet.tagName === 'BUTTON') {
    kaydet.addEventListener('click', async () => {
      if (kaydet.getAttribute('aria-disabled') === 'true') return;
      if (!tahminAcik(mac)) { mesaj(hata, 'Maç başladı: tahminler kilitlendi.'); return; }
      kaydet.setAttribute('aria-disabled', 'true');
      const sorgu = kayitli ? supabase.from('skor_tahminleri').update({ corum: deger.corum, rakip: deger.rakip }).eq('mac_id', mac.id).eq('kullanici_id', kisi.id)
        : supabase.from('skor_tahminleri').insert({ mac_id: mac.id, corum: deger.corum, rakip: deger.rakip });
      const { error } = await sorgu;
      if (error) { kaydet.removeAttribute('aria-disabled'); mesaj(hata, hataMetni(error, 'Tahmin kaydedilemedi.')); return; }
      mesaj(hata, '');
      kayitli = { ...deger };
      kaydet.textContent = 'Tahminimi güncelle';
      kaydet.classList.remove('onaylandi'); void kaydet.offsetWidth; kaydet.classList.add('onaylandi');
      durumYaz();
      duyur(`Tahminin kaydedildi: ${tahminSkoru(mac, kayitli)}.`);
    });
  }
  durumYaz();
  return h('section', { class: 'tahmin', id: 'tahmin', 'aria-labelledby': 'tahmin-baslik' },
    h('div', { class: 'bolum-baslik' }, h('h2', { id: 'tahmin-baslik' }, 'Skor tahminin')),
    h('p', { class: 'tahmin-aciklama' }, 'Sence maç kaç kaç biter? Maç başlayınca tahminler kilitlenir; sonra taraftarların tahmini burada. Eğlencesine: ödül, puan yok.'),
    h('div', { class: 'tahmin-sayaclar' }, sayac(taraflar[0]), h('span', { class: 'tahmin-ayrac', 'aria-hidden': 'true' }, '–'), sayac(taraflar[1])),
    h('div', { class: 'tahmin-alt' }, kaydet, not, hata));
}

/** Maç başladıktan sonra: "Taraftarların tahmini" (G/B/M çubukları, en çok 3 skor) + "Senin tahminin: 2 – 1 ✓/✗". Veri yoksa null. */
export function tahminDagilimi(mac, ozet, benim = null) {
  if (!ozet && !benim) return null;
  const kazanir = (ad) => `${ad} kazanır`;
  const satir = (etiket, yuzde, vurgu, sinif = '') => h('li', { class: 'oran-satir ' + sinif },
    h('span', { class: 'oran-etiket' }, etiket), cubuk(yuzde, { vurgu }), sayiOgesi(yuzde, { sonek: '%' }));
  let senin = null;
  if (benim) {
    const tam = mac.durum === 'bitti' && benim.corum === mac.corum_skor && benim.rakip === mac.rakip_skor;
    const sonuc = mac.durum === 'bitti' && Math.sign(benim.corum - benim.rakip) === Math.sign(mac.corum_skor - mac.rakip_skor);
    senin = h('p', { class: 'senin-tahmin', id: 'senin-tahmin' }, 'Senin tahminin: ', h('strong', { class: 'skor-blok' }, tahminSkoru(mac, benim)),
      mac.durum === 'bitti' ? [' ', h('span', { class: 'isabet ' + (tam || sonuc ? 'evet' : 'hayir') },
        h('span', { 'aria-hidden': 'true' }, tam || sonuc ? '✓' : '✗'), ' ', tam ? 'Tam isabet!' : sonuc ? 'Sonucu bildin' : 'Bu sefer olmadı')] : null);
  }
  return gorununceOynat(h('section', { class: 'tahmin-sonuc', id: 'tahmin-sonuc', 'aria-labelledby': 'tahmin-sonuc-baslik' },
    h('div', { class: 'bolum-baslik' }, h('h2', { id: 'tahmin-sonuc-baslik' }, 'Taraftarların tahmini')),
    ozet ? [
      h('p', { class: 'soluk tahmin-toplam' }, `${ozet.toplam} taraftar tahmin yaptı · tahminler maç başlayınca kilitlendi.`),
      sirayla(h('ul', { class: 'oranlar', 'aria-label': 'Sonuç tahmini' },
        satir(kazanir(TAKIM_ADI), ozet.galibiyet, true, 'biz'), satir('Berabere', ozet.beraberlik, false), satir(kazanir(mac.rakip), ozet.maglubiyet, false))),
      (ozet.skorlar || []).length ? [h('h3', { class: 'tahmin-alt-baslik', id: 'tahmin-skorlar' }, 'En çok tahmin edilen skorlar'),
        sirayla(h('ol', { class: 'oranlar skorlar', 'aria-labelledby': 'tahmin-skorlar' }, ozet.skorlar.map((s, i) => satir(h('span', { class: 'skor-blok' }, tahminSkoru(mac, s)), s.yuzde, i === 0))))] : null,
    ] : h('p', { class: 'soluk' }, 'Bu maç için yeterli tahmin yok.'),
    senin));
}

// ------------------------------------------------------------ maçın oyuncusu
function oyuncuBilgisi(s, bul) {
  const o = bul.get(oyuncuAnahtari(s.oyuncu));
  return { ad: s.oyuncu, no: s.forma_no ?? (o && o.forma_no) ?? null, mevki: (o && o.mevki) || null, id: o ? o.id : null };
}

/**
 * Maç bitince: o maçta oynayan Çorum FK oyuncularının kart ızgarası (forma no büyük, mevkiye göre renkli kenar). Kart seçilince öne
 * çıkar, "Oyu ver" düğmesi açılır; oy verince (ya da pencere kapanınca) sonuç: yüzde çubukları dolar, kazanan kartı taç rozetiyle ve
 * tek seferlik parıltıyla vurgulanır. benimOy: kişinin oyu ({ oyuncu }) ya da null; sonuclar: mac_oyuncusu_sonuclari satırları.
 */
export function oylamaBolumu(mac, kadro = [], oyuncular = [], { oturum = null, benimOy = null, sonuclar = [] } = {}) {
  const durum = oyDurumu(mac);
  if (durum === 'once') return null;
  const bul = new Map(oyuncular.map((o) => [oyuncuAnahtari(o.ad), o]));
  const adaylar = kadro.filter(macaCikti).map((s) => ({ ...oyuncuBilgisi(s, bul), ilk11: s.ilk11, sira: s.dizilis_sira ?? 99 }))
    .sort((a, b) => Number(b.ilk11) - Number(a.ilk11) || (MEVKI_SIRASI[a.mevki] ?? 9) - (MEVKI_SIRASI[b.mevki] ?? 9) || a.sira - b.sira || (a.no ?? 99) - (b.no ?? 99));
  if (!adaylar.length && !sonuclar.length) return null;
  const kapanis = oyKapanisi(mac);
  const bas = h('div', { class: 'bolum-baslik' }, h('h2', { id: 'oylama-baslik', tabindex: '-1' }, 'Maçın oyuncusu'));
  const alt = h('p', { class: 'soluk oylama-alt', id: 'oylama-alt' });
  const govde = h('div', { class: 'oylama-govde' });
  const kok = h('section', { class: 'oylama', id: 'oylama', 'aria-labelledby': 'oylama-baslik' }, bas, alt, govde);
  const kisi = oturum && oturum.kullanici;

  function sonucCiz(liste, benim, { ilk = false } = {}) {
    const acik = oyDurumu(mac) === 'acik';
    const toplam = liste.length ? liste[0].toplam : 0;
    alt.textContent = acik ? `${toplam} oy · oylama ${tarihYaz(kapanis, { gun: true, yil: false })} kapanır. Tek oy, değiştirilemez.` : `Oylama kapandı · ${toplam} oy.`;
    if (!liste.length) { govde.replaceChildren(h('p', { class: 'bos' }, 'Bu maçta oy kullanılmadı.')); return; }
    const enCok = liste[0].oy;
    govde.replaceChildren(gorununceOynat(sirayla(h('ol', { class: 'oy-sonuc', id: 'oy-sonuc', 'aria-label': 'Oy sonuçları' }, liste.map((r) => {
      const o = oyuncuBilgisi(kadro.find((s) => s.oyuncu === r.oyuncu) || { oyuncu: r.oyuncu }, bul);
      const kazanan = r.oy === enCok;
      return h('li', { class: 'oy-satir' + (kazanan ? ' kazanan' : '') + (o.mevki ? ' mevki-' + o.mevki : ''), 'data-oyuncu': r.oyuncu },
        h('span', { class: 'oy-no', 'aria-hidden': 'true' }, o.no != null ? String(o.no) : '–'),
        h('span', { class: 'oy-satir-ic' },
          h('span', { class: 'oy-satir-ust' },
            o.id ? h('a', { class: 'oy-ad', href: 'oyuncu.html?id=' + encodeURIComponent(o.id) }, r.oyuncu) : h('span', { class: 'oy-ad' }, r.oyuncu),
            kazanan ? h('span', { class: 'tac-rozet' }, simge(TAC_YOLU, { dolu: true, boyut: 14 }), acik ? 'Şimdilik önde' : 'Maçın oyuncusu') : null,
            benim && benim.oyuncu === r.oyuncu ? h('span', { class: 'senin-oy' }, h('span', { 'aria-hidden': 'true' }, '✓ '), 'Senin oyun') : null),
          cubuk(r.yuzde, { vurgu: kazanan })),
        sayiOgesi(r.yuzde, { sonek: '%', okunus: `yüzde ${r.yuzde}, ${r.oy} oy` }));
    })))));
    if (!ilk) { $('#oylama-baslik').focus({ preventScroll: false }); duyur(`Oyun kaydedildi. ${acik ? 'Şimdilik önde' : 'Maçın oyuncusu'}: ${liste.filter((r) => r.oy === enCok).map((r) => r.oyuncu).join(', ')}.`); }
  }

  if (durum === 'kapandi' || benimOy) { sonucCiz(sonuclar, benimOy, { ilk: true }); return kok; }

  // Oylama açık, kişi oy vermedi: kart ızgarası (tek seçim: aria-pressed), altında onay düğmesi (yer baştan ayrılı: kayma yok)
  alt.textContent = `Oylama ${tarihYaz(kapanis, { gun: true, yil: false })} kapanır. Tek oy, değiştirilemez; sonuç oy verince görünür.`;
  let secili = null;
  const onay = kisi ? h('button', { type: 'button', class: 'dugme oy-onay', id: 'oy-onay', 'aria-disabled': 'true' }, 'Önce bir oyuncu seç')
    : h('a', { class: 'dugme ikincil oy-onay', id: 'oy-giris', href: girisAdresi('#ozet') }, 'Oy vermek için giriş yap');
  const bilgi = h('p', { class: 'oy-bilgi', id: 'oy-bilgi' });
  const izgara = gorununceOynat(sirayla(h('ul', { class: 'oy-izgara', id: 'oy-izgara', 'aria-label': 'Oyuncular' }, adaylar.map((a) => {
    const kart = h('button', { type: 'button', class: 'oy-kart' + (a.mevki ? ' mevki-' + a.mevki : ''), 'aria-pressed': 'false', 'data-oyuncu': a.ad },
      h('span', { class: 'oy-no', 'aria-hidden': 'true' }, a.no != null ? String(a.no) : '–'),
      h('span', { class: 'oy-ad' }, a.ad),
      h('span', { class: 'oy-mevki' }, a.mevki ? MEVKI[a.mevki] : a.ilk11 ? 'İlk 11' : 'Oyuna girdi'),
      a.no != null ? h('span', { class: 'gorunmez' }, `, forma ${a.no}`) : null);
    kart.addEventListener('click', () => {
      izgara.querySelectorAll('.oy-kart[aria-pressed="true"]').forEach((k) => k.setAttribute('aria-pressed', 'false'));
      kart.setAttribute('aria-pressed', 'true');
      secili = a.ad;
      if (onay.tagName === 'BUTTON') { onay.removeAttribute('aria-disabled'); onay.textContent = `Oyu ver: ${a.ad}`; }
      duyur(`${a.ad} seçildi.${onay.tagName === 'BUTTON' ? ' Onaylamak için Oyu ver düğmesine dokun.' : ''}`);
    });
    return h('li', null, kart);
  }))));
  if (onay.tagName === 'BUTTON') {
    onay.addEventListener('click', async () => {
      if (onay.getAttribute('aria-disabled') === 'true' || !secili) return;
      onay.setAttribute('aria-disabled', 'true');
      const { error } = await supabase.from('mac_oyuncusu_oylari').insert({ mac_id: mac.id, oyuncu: secili });
      if (error && !/zaten verdin/.test(error.message || '')) {
        onay.removeAttribute('aria-disabled');
        mesaj(bilgi, hataMetni(error, 'Oy kaydedilemedi.'));
        return;
      }
      const r = await supabase.rpc('mac_oyuncusu_sonuclari', { p_mac_id: mac.id });
      sonucCiz(r.error ? [] : r.data || [], { oyuncu: secili });
    });
  }
  govde.replaceChildren(izgara, h('div', { class: 'oy-alt' }, onay, bilgi));
  return kok;
}

// ------------------------------------------------------------ puan tablosu
const KISALTMA = [['oynanan', 'O', 'Oynanan'], ['galibiyet', 'G', 'Galibiyet'], ['beraberlik', 'B', 'Beraberlik'], ['maglubiyet', 'M', 'Mağlubiyet'],
  ['atilan', 'A', 'Atılan gol'], ['yenen', 'Y', 'Yenen gol'], ['averaj', 'AV', 'Averaj'], ['puan', 'P', 'Puan']];
const averaj = (s) => { const n = s.atilan - s.yenen; return n > 0 ? '+' + n : String(n); };
/**
 * Puan tablosu. mini: Çorum FK'nın çevresindeki 5 satır, yalnız O / AV / P. Çorum FK satırı vurgulu (renk + kalın + sol çizgi + gizli
 * "Çorum FK" notu gerekmez: ad zaten yazılı). Satırlar sırayla belirir. Dar ekranda tablo kendi kutusunda yatay kayar (sayfa kaymaz).
 */
export function puanTablosu(satirlar, { mini = false, kimlik = 'puan-tablosu' } = {}) {
  const l = mini ? puanCevresi(satirlar) : satirlar;
  const sutunlar = mini ? KISALTMA.filter(([k]) => ['oynanan', 'averaj', 'puan'].includes(k)) : KISALTMA;
  const tablo = h('table', { class: 'puan-tablo' + (mini ? ' mini' : ''), id: kimlik },
    h('caption', { class: 'gorunmez' }, mini ? `Puan durumu: ${TAKIM_ADI} ve çevresi` : 'Puan durumu'),
    h('thead', null, h('tr', null, h('th', { scope: 'col', class: 'sira' }, h('abbr', { title: 'Sıra' }, '#')), h('th', { scope: 'col', class: 'pt-takim' }, 'Takım'),
      sutunlar.map(([alan, k, ad]) => h('th', { scope: 'col', class: 'k-' + alan }, h('abbr', { title: ad }, k))))),
    sirayla(h('tbody', null, l.map((s) => h('tr', { class: bizMiyiz(s.takim) ? 'biz' : null, 'aria-current': bizMiyiz(s.takim) ? 'true' : null },
      h('td', { class: 'sira' }, String(s.sira)), h('th', { scope: 'row', class: 'pt-takim' }, s.takim),
      sutunlar.map(([k]) => h('td', { class: 'k-' + k + (k === 'puan' ? ' puan' : '') }, k === 'averaj' ? averaj(s) : String(s[k]))))))));
  return gorununceOynat(h('div', { class: 'tablo-kaydir', role: 'region', tabindex: '0', 'aria-label': mini ? 'Puan durumu (kısa)' : 'Puan durumu tablosu' }, tablo));
}

/** "Son güncelleme: 5 Kasım 2026 · Kaynak: TFF" satırı (en yeni guncellendi). */
export function puanKaynakSatiri(satirlar) {
  const son = satirlar.reduce((a, s) => (!a || Date.parse(s.guncellendi) > Date.parse(a) ? s.guncellendi : a), null);
  const kaynaklar = [...new Set(satirlar.map((s) => s.kaynak).filter(Boolean))];
  return h('p', { class: 'soluk puan-kaynak', id: 'puan-kaynak' }, son ? ['Son güncelleme: ', h('time', { datetime: son }, tarihYaz(son, { saat: false }))] : null,
    kaynaklar.length ? [son ? ' · ' : '', 'Kaynak: ', kaynaklar.join(', ')] : null, '. Resmî tablo için ligin sitesine bak.');
}
