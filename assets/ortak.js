// Ortak yardımcılar: DOM üretimi (innerHTML yok), tarih, oturum, üst bar, alt menü, duyurular, video kapağı.
import { supabase, sahteMod, ayarEksik } from './istemci.js';
import { TAKIM_ADI, AMBLEM_DOSYASI, SAHIP_ADI, ILETISIM_EPOSTA } from './ayar.js';
import { kapakAdresiGecerli } from './kurallar.js';
import { fotoKaynagi } from './foto-kaynaklari.js';

export { supabase, sahteMod, TAKIM_ADI };
/** Supabase istemcisi var mı (ayar.js dolu ya da test modu). Senkron: sayfalar sorguyu oturumu beklemeden başlatır. */
export const hazir = !!supabase;

const TZ = 'Europe/Istanbul';

// ---------------------------------------------------------------- DOM
// h('a', { href: 'x', class: 'y', onclick: fn }, 'metin', altOge)
// Metinler her zaman textNode olarak eklenir; HTML yorumlanmaz.
export function h(etiket, ozellik, ...cocuklar) {
  const el = document.createElement(etiket);
  for (const [k, v] of Object.entries(ozellik || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'value') el.value = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (typeof v === 'boolean' && k in el) el[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  ekle(el, cocuklar);
  return el;
}

export function ekle(el, cocuklar) {
  for (const c of [cocuklar].flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const $ = (s, kok = document) => kok.querySelector(s);

/** Satır içi SVG simge (süs: aria-hidden). Yollar sabit metindir, kullanıcı verisi değildir. */
export function simge(d, { dolu = false, boyut = 24 } = {}) {
  const ns = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(ns, 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', width: boyut, height: boyut, 'aria-hidden': 'true', focusable: 'false',
    fill: dolu ? 'currentColor' : 'none', stroke: dolu ? 'none' : 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })) s.setAttribute(k, String(v));
  const p = document.createElementNS(ns, 'path'); p.setAttribute('d', d); s.append(p);
  return s;
}
export const OYNAT_YOLU = 'M8 5.5v13l11-6.5z';

// Düz metni paragraflara böler (boş satır = yeni paragraf, tek satır sonu = <br>)
export function paragraflar(metin) {
  const f = document.createDocumentFragment();
  for (const blok of String(metin || '').replace(/\r\n?/g, '\n').split(/\n\s*\n/)) {
    const t = blok.trim();
    if (!t) continue;
    const p = document.createElement('p');
    t.split('\n').forEach((satir, i) => {
      if (i) p.append(document.createElement('br'));
      p.append(document.createTextNode(satir));
    });
    f.append(p);
  }
  return f;
}

/**
 * Görünür mesaj kutusu. Kutunun rolü değişmez (HTML'de bir kez verilir ya da hiç verilmez); ekran okuyucuya duyuru
 * sayfadaki kalıcı #durum / #uyari bölgelerinden gider (duyur / uyar).
 */
export function mesaj(el, metin, tur = 'hata') {
  if (!el) return;
  el.textContent = '';
  if (!metin) { el.hidden = true; return; }
  el.classList.remove('hata', 'basari', 'bilgi');
  el.classList.add('mesaj', tur);
  el.textContent = metin;
  el.hidden = false;
  if (!el.hasAttribute('role')) (tur === 'hata' ? uyar : duyur)(metin);
}

// Kalıcı canlı bölgeler (sayfa yüklenirken boş). Aynı metin art arda gelirse önce boşaltılır, sonra yazılır.
function bolgeYaz(id, metin) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = '';
  clearTimeout(el._z);
  el._z = setTimeout(() => { el.textContent = metin; }, 100);
}
export const duyur = (metin) => bolgeYaz('durum', metin);
export const uyar = (metin) => bolgeYaz('uyari', metin);

// ---------------------------------------------------------------- adres
export function param(ad) {
  return new URLSearchParams(location.search).get(ad);
}

export function kimlikGecerli(id) {
  return typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

// Kapak yalnız projenin deposundan (haber-gorselleri) ya da sitenin assets/img/ klasöründen (SQL ile aynı kural:
// assets/kurallar.js kapakAdresiGecerli). Başka adres hiç istenmez (ziyaretçinin IP'si üçüncü tarafa gitmesin).
export function guvenliGorsel(url) {
  if (typeof url !== 'string' || !url) return null;
  if (kapakAdresiGecerli(url)) return url;
  if (sahteMod && /^data:image\/(png|jpeg|webp|gif);base64,/.test(url)) return url;
  return null;
}

/**
 * Kapak için src + srcset. Adı "-1600.webp" ile biten görselin (sitenin fotoğrafları ve panelin yüklediği kapaklar)
 * -480 ve -800 kopyaları da vardır: tarayıcı ekrana uyanı seçer (performans bütçesi).
 */
export function kapakKaynagi(url, { varsayilan = 800 } = {}) {
  const src = guvenliGorsel(url);
  if (!src) return null;
  const m = /^(.*)-1600\.webp$/.exec(src);
  if (!m) return { src, srcset: null };
  return { src: `${m[1]}-${varsayilan}.webp`, srcset: `${m[1]}-480.webp 480w, ${m[1]}-800.webp 800w, ${m[1]}-1600.webp 1600w` };
}

/** Fotoğraf atfı: yöneticinin yazdığı kapak kaynağı ya da sitenin kendi fotoğraflarının kaydı (assets/foto-kaynaklari.js). */
export function fotoAtfi(url, kapakKaynak) {
  const yazilan = typeof kapakKaynak === 'string' ? kapakKaynak.trim() : '';
  if (yazilan) return /^fotoğraf/i.test(yazilan) ? yazilan : 'Fotoğraf: ' + yazilan;
  const k = fotoKaynagi(url);
  return k ? k.atif : null;
}

// Giriş sonrası dönüş adresi: sadece site içi .html sayfaları (açık yönlendirme yok)
export function guvenliDonus(d) {
  return typeof d === 'string' && /^[a-z]+\.html(\?[\w=&%-]*)?(#[\w-]*)?$/.test(d) ? d : 'index.html';
}

export function girisAdresi(bolum = '') {
  const burasi = location.pathname.split('/').pop() || 'index.html';
  const donus = burasi + location.search + bolum;
  return 'giris.html?donus=' + encodeURIComponent(guvenliDonus(donus));
}

// ---------------------------------------------------------------- tarih (Türkiye saati)
export function tarihYaz(iso, { saat = true, gun = false, kisa = false, yil = true } = {}) {
  const d = new Date(iso);
  if (!iso || isNaN(d)) return '';
  const secenek = { timeZone: TZ, day: 'numeric', month: kisa ? 'short' : 'long' };
  if (yil) secenek.year = 'numeric';
  if (gun) secenek.weekday = kisa ? 'short' : 'long';
  if (saat) { secenek.hour = '2-digit'; secenek.minute = '2-digit'; secenek.hourCycle = 'h23'; }
  return new Intl.DateTimeFormat('tr-TR', secenek).format(d);
}

export function saatYaz(iso) {
  return new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
}

/** Türkiye takvim günü "YYYY-MM-DD". */
export function gunAnahtari(iso) {
  const p = {};
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(iso)).forEach((x) => { p[x.type] = x.value; });
  return `${p.year}-${p.month}-${p.day}`;
}

/** "5 dk önce", "2 saat önce"; 24 saatten eskiyse "4 Kasım". */
export function goreceZaman(iso, simdi = Date.now()) {
  const t = Date.parse(iso);
  if (!iso || isNaN(t)) return '';
  const fark = Math.max(0, simdi - t);
  if (fark < 60e3) return 'Az önce';
  if (fark < 3600e3) return `${Math.floor(fark / 60e3)} dk önce`;
  if (fark < 864e5) return `${Math.floor(fark / 3600e3)} saat önce`;
  return tarihYaz(iso, { saat: false, yil: gunAnahtari(iso).slice(0, 4) !== gunAnahtari(new Date(simdi).toISOString()).slice(0, 4) });
}

// timestamptz -> <input type=datetime-local> değeri (Türkiye saatiyle)
export function yerelGirdi(iso) {
  if (!iso) return '';
  const p = {};
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(iso)).forEach((x) => { p[x.type] = x.value; });
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

// <input type=datetime-local> değeri Türkiye saati kabul edilir (Türkiye 2016'dan beri sabit UTC+3)
export function girdidenIso(deger) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(deger || '')) return null;
  const d = new Date(deger + ':00+03:00');
  return isNaN(d) ? null : d.toISOString();
}

// ---------------------------------------------------------------- maç yardımcıları
export const DURUM_ADI = { planlandi: 'Planlandı', canli: 'Canlı', bitti: 'Bitti' };

export function durumRozeti(durum) {
  return h('span', { class: 'rozet ' + (durum || '') }, DURUM_ADI[durum] || durum || '');
}

export function evSahibiDeplasman(mac) {
  return mac.ic_saha ? [TAKIM_ADI, mac.rakip] : [mac.rakip, TAKIM_ADI];
}

export function skorVar(mac) {
  return mac.durum !== 'planlandi' && mac.corum_skor != null && mac.rakip_skor != null;
}

export function skorMetni(mac) {
  if (!skorVar(mac)) return null;
  return mac.ic_saha ? `${mac.corum_skor} - ${mac.rakip_skor}` : `${mac.rakip_skor} - ${mac.corum_skor}`;
}

/** Biten maçın sonucu: { harf: 'G'|'B'|'M', ad: 'Galibiyet'|… } (renk tek başına anlam taşımaz). */
export function sonucBilgisi(mac) {
  if (mac.durum !== 'bitti' || mac.corum_skor == null || mac.rakip_skor == null) return null;
  if (mac.corum_skor > mac.rakip_skor) return { harf: 'G', ad: 'Galibiyet', sinif: 'g' };
  if (mac.corum_skor < mac.rakip_skor) return { harf: 'M', ad: 'Mağlubiyet', sinif: 'm' };
  return { harf: 'B', ad: 'Beraberlik', sinif: 'b' };
}

export function dakikaMetni(gol) {
  return gol.ek_dakika ? `${gol.dakika}+${gol.ek_dakika}'` : `${gol.dakika}'`;
}
/** Ekran okuyucu için: "23. dakika", "90+2. dakika". */
export function dakikaOkunus(gol) {
  return gol.ek_dakika ? `${gol.dakika}+${gol.ek_dakika}. dakika` : `${gol.dakika}. dakika`;
}
/** Görünür "23'" + gizli "23. dakika" ("kesme işareti" diye okunmasın). */
export function dakikaOgesi(gol, sinif = 'dakika') {
  return h('span', { class: sinif }, h('span', { 'aria-hidden': 'true' }, dakikaMetni(gol)), h('span', { class: 'gorunmez' }, dakikaOkunus(gol)));
}
export function sureMetni(sn) {
  const n = Number(sn);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `${Math.floor(n / 60)}:${String(Math.round(n % 60)).padStart(2, '0')}`;
}

// ---------------------------------------------------------------- video
export function youtubeKimlik(url) {
  let u;
  try { u = new URL(url); } catch (e) { return null; }
  if (u.protocol !== 'https:') return null;
  const host = u.hostname.replace(/^(www\.|m\.)/, '');
  let id = null;
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else {
      const m = u.pathname.match(/^\/(embed|shorts|live)\/([^/?#]+)/);
      if (m) id = m[2];
    }
  }
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

export function mp4Mu(url) {
  return typeof url === 'string' && /^https:\/\/[^\s"'<>]+\.mp4(\?[^\s"'<>]*)?$/i.test(url);
}

/**
 * Video kapağı (facade): sayfa açılınca YouTube'a / video sunucusuna HİÇ istek gitmez. Kapak sitenin kendi görseli
 * (goller.kapak_url) ya da kırmızı-siyah desen. Dokununca nocookie iframe ya da <video controls preload=none> yerleşir
 * ve odak oynatıcıya taşınır. baslik: "Gol videosu: Ali Örnek, 23. dakika, Örnekköy Spor maçı".
 */
export function videoFasad(url, { baslik = 'Gol videosu', kapak = null, sure = null } = {}) {
  const id = youtubeKimlik(url);
  const mp4 = !id && mp4Mu(url) ? url : null;
  if (!id && !mp4) return null;
  const k = kapakKaynagi(kapak, { varsayilan: 800 });
  const kap = h('div', { class: 'video tam-genis', 'data-video': id ? 'youtube' : 'mp4' });
  const dugme = h('button', { type: 'button', class: 'video-baslat', 'aria-describedby': 'video-not' },
    k ? h('img', { src: k.src, srcset: k.srcset, sizes: '(max-width: 760px) 100vw, 720px', alt: '', width: '800', height: '450', decoding: 'async' }) : h('span', { class: 'kapak-yok', 'aria-hidden': 'true' }),
    h('span', { class: 'oynat', 'aria-hidden': 'true' }, simge(OYNAT_YOLU, { dolu: true })),
    h('span', { class: 'yazi', 'aria-hidden': 'true' }, 'Oynat', sure ? ` · ${sure}` : ''),
    h('span', { class: 'gorunmez' }, `Videoyu oynat: ${baslik}${sure ? ', süre ' + sure : ''}`));
  dugme.addEventListener('click', () => {
    let oynatici;
    if (id) {
      oynatici = h('iframe', {
        src: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1&rel=0&cc_load_policy=1&cc_lang_pref=tr&hl=tr`,
        title: baslik + ' (YouTube)', allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen', allowfullscreen: '',
        referrerpolicy: 'strict-origin-when-cross-origin',
      });
    } else {
      oynatici = h('video', { src: mp4, controls: true, preload: 'none', playsinline: '', 'aria-label': baslik, poster: k ? k.src : null });
    }
    dugme.replaceWith(oynatici);
    oynatici.focus();
    if (oynatici.tagName === 'VIDEO') { try { const p = oynatici.play(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* yok say */ } }
  }, { once: true });
  kap.append(dugme);
  return kap;
}

// ---------------------------------------------------------------- hata metinleri
export function hataMetni(e, varsayilan = 'Bir sorun çıktı. Tekrar dene.') {
  const m = String((e && (e.message || e.error_description)) || '');
  if (/Invalid login credentials/i.test(m)) return 'E-posta ya da şifre tutmadı. Tekrar dene ya da şifreni sıfırla.';
  if (/Email not confirmed/i.test(m)) return 'E-posta adresini henüz onaylamadın. Gelen kutuna (ve istenmeyen klasörüne) bak.';
  if (/already registered|already exists/i.test(m)) return 'Bu e-posta adresiyle zaten bir hesap var. Giriş yapmayı dene.';
  if (/Password should be|weak password/i.test(m)) return 'Şifre en az 8 karakter olmalı.';
  if (/haberler_kapak_kaynagi|goller_kapak_kaynagi|oyuncular_foto_kaynagi/.test(m)) return 'Görsel yalnızca sitenin kendi deposundan olabilir: görseli formdaki alandan yeniden yükleyin.';
  if (/yorum_sikayeti_tek/.test(m)) return 'Bu yorumu zaten şikâyet ettin; teşekkürler, bakacağız.';
  if (/[çğıöşüÇĞİÖŞÜ]/.test(m)) return m; // sunucunun Türkçe mesajları (tetikleyiciler)
  if (/row-level security|permission denied/i.test(m) || (e && e.code === '42501')) return 'Bu işlem için yetkin yok.';
  if (/rate limit|too many/i.test(m)) return 'Çok fazla deneme oldu. Biraz bekleyip tekrar dene.';
  if (e && e.code === '23514') return 'Girilen bilgiler kurallara uymuyor (uzunluk ya da biçim).';
  if (e && e.code === '23505') return 'Bu kayıt zaten var.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'İnternet bağlantısında sorun var.';
  return varsayilan;
}

/** "Yüklenemedi" kutusu + "Tekrar dene" (boş sayfa yerine). */
export function cevrimdisiKutusu(metin, yenidenDene, { sonGuncelleme = null } = {}) {
  const dugme = h('button', { type: 'button', class: 'dugme ikincil kucuk' }, 'Tekrar dene');
  const kutu = h('div', { class: 'cevrimdisi', role: 'group', 'aria-label': 'Bağlantı sorunu' },
    h('p', null, h('strong', null, metin)),
    sonGuncelleme ? h('p', { class: 'son-guncelleme' }, `Gösterilen bilgi ${tarihYaz(sonGuncelleme, { yil: false })} itibarıyla.`) : null,
    dugme);
  dugme.addEventListener('click', () => { if (dugme.getAttribute('aria-disabled') === 'true') return; dugme.setAttribute('aria-disabled', 'true'); yenidenDene(); });
  return kutu;
}

// ---------------------------------------------------------------- oturum
let oturumSozu = null;

export function oturumAl() {
  if (!oturumSozu) {
    oturumSozu = (async () => {
      if (!supabase) return { kullanici: null, profil: null, admin: false };
      const { data } = await supabase.auth.getSession();
      const kullanici = (data && data.session && data.session.user) || null;
      let profil = null;
      if (kullanici) {
        // Rol herkese açık değil (012: profiles.role sütun yetkisi kapalı); kişi kendi profilini benim_profilim() ile alır
        const r = await supabase.rpc('benim_profilim');
        profil = (r && Array.isArray(r.data) ? r.data[0] : r && r.data) || null;
      }
      return { kullanici, profil, admin: !!profil && profil.role === 'admin' };
    })();
  }
  return oturumSozu;
}

export async function cikisYap() {
  if (supabase) {
    // Sunucuya ulaşılamazsa supabase-js oturumu silmez: en azından bu tarayıcıdaki oturumu sil
    let sonuc = null;
    try { sonuc = await supabase.auth.signOut(); } catch (e) { sonuc = { error: e }; }
    if (sonuc && sonuc.error) { try { await supabase.auth.signOut({ scope: 'local' }); } catch (e) { /* yok say */ } }
  }
  location.href = 'index.html';
}

// ---------------------------------------------------------------- sekmeler (WAI-ARIA tabs)
// role=tablist içindeki role=tab düğmeleri: seçili sekme tabindex 0, diğerleri -1 (roving tabindex);
// ← → (başa/sona döner), Home, End odağı taşır ve sekmeyi seçer (otomatik etkinleştirme). sec(sekme) seçimi yapar.
export function sekmeKlavyesi(liste, sec) {
  const sekmeler = () => [...liste.querySelectorAll('[role="tab"]')];
  const duzenle = () => sekmeler().forEach((t) => { t.tabIndex = t.getAttribute('aria-selected') === 'true' ? 0 : -1; });
  liste.addEventListener('keydown', (e) => {
    const l = sekmeler();
    const i = l.indexOf(document.activeElement);
    if (i < 0) return;
    const hedef = { ArrowRight: (i + 1) % l.length, ArrowLeft: (i - 1 + l.length) % l.length, Home: 0, End: l.length - 1 }[e.key];
    if (hedef === undefined) return;
    e.preventDefault();
    l[hedef].focus();
    sec(l[hedef]);
    duzenle();
  });
  duzenle();
  return duzenle;
}

// ---------------------------------------------------------------- amblem
// HTML'de varsayılan olarak özgün işaret (assets/logo/amblem-yedek.svg: güneş kursu içinde "ÇT") yüklenir. ayar.js'te
// AMBLEM_DOSYASI verilmişse (kulüpten yazılı izin alındıktan sonra) önce o denenir.
// Sıra: AMBLEM_DOSYASI → amblem-yedek.svg → "ÇT" yazı işareti. Sayfa hiçbir durumda bozulmaz.
const AMBLEM_YEDEK = 'assets/logo/amblem-yedek.svg';
export function amblemKur(kok = document) {
  const istenen = typeof AMBLEM_DOSYASI === 'string' && /^assets\/logo\/[\w.-]+\.(svg|png|webp)$/.test(AMBLEM_DOSYASI) ? AMBLEM_DOSYASI : null;
  kok.querySelectorAll('img[data-amblem]').forEach((img) => {
    const adaylar = [istenen, AMBLEM_YEDEK].filter(Boolean);
    let i = 0;
    const yaziIsareti = () => img.replaceWith(h('span', { class: 'amblem-yazi', 'aria-hidden': 'true' }, 'ÇT'));
    const sonraki = () => { i += 1; if (i < adaylar.length) img.src = adaylar[i]; else yaziIsareti(); };
    img.addEventListener('error', sonraki);
    if (istenen) img.src = adaylar[0];
    else if (img.complete && img.naturalWidth === 0 && img.getAttribute('src')) yaziIsareti();
  });
}

// ---------------------------------------------------------------- künye (ayar.js'ten)
export function kunyeDoldur(kok = document) {
  const eposta = typeof ILETISIM_EPOSTA === 'string' && /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(ILETISIM_EPOSTA) ? ILETISIM_EPOSTA : null;
  kok.querySelectorAll('[data-ayar="SAHIP_ADI"]').forEach((el) => { if (SAHIP_ADI) el.textContent = SAHIP_ADI; });
  kok.querySelectorAll('[data-ayar="ILETISIM_EPOSTA"]').forEach((el) => {
    if (!eposta) return;
    el.textContent = eposta;
    if (el.tagName === 'A') el.href = 'mailto:' + eposta;
  });
}

// ---------------------------------------------------------------- üst bar: geri düğmesi, profil simgesi
function geriKur() {
  const geri = document.querySelector('[data-geri]');
  if (!geri) return;
  geri.addEventListener('click', (e) => {
    // Site içinden gelindiyse tarayıcı geçmişine dön (kaydırma konumu korunur); değilse bağlantının adresine git
    let ayniSite = false;
    try { ayniSite = !!document.referrer && new URL(document.referrer).origin === location.origin && !/giris\.html/.test(document.referrer); } catch (x) { ayniSite = false; }
    if (ayniSite && history.length > 1) { e.preventDefault(); history.back(); }
  });
}

function profilSimgesi(o) {
  const a = document.getElementById('profil-baglanti');
  if (!a || !o.kullanici) return;
  const ad = (o.profil && o.profil.kullanici_adi) || 'Hesabım';
  a.replaceChildren(
    h('span', { class: 'avatar', 'aria-hidden': 'true' }, ad.slice(0, 1).toLocaleUpperCase('tr-TR')),
    h('span', { class: 'gorunmez' }, 'Profil: '),
    h('span', { class: 'gorunmez kullanici' }, ad));
}

// Sanal klavye açılınca (görünür yükseklik %75'in altına düşer) alt menü saklanır: yorum alanını örtmesin (inert: Tab'dan da çıkar)
function klavyeIzle() {
  const nav = document.getElementById('alt-nav');
  if (!nav) return;
  let tamYukseklik = window.innerHeight;
  const guncelle = () => {
    const ae = document.activeElement;
    const metinAlani = !!ae && (ae.tagName === 'TEXTAREA' || (ae.tagName === 'INPUT' && !/^(radio|checkbox|button|submit|file)$/.test(ae.type || '')));
    const vv = window.visualViewport;
    if (!metinAlani) tamYukseklik = Math.max(tamYukseklik, window.innerHeight);
    const kucuk = (vv ? vv.height : window.innerHeight) < tamYukseklik * 0.75 || window.innerHeight <= 560;
    const acik = metinAlani && kucuk;
    nav.classList.toggle('klavye-acik', acik);
    // Yalnız kendi koyduğu inert'i kaldırır (açık bir pencere de menüyü inert yapar: profil çıkış onayı)
    if (acik && !nav.hasAttribute('inert')) { nav.setAttribute('inert', ''); nav._klavyeInert = true; }
    else if (!acik && nav._klavyeInert) { nav.removeAttribute('inert'); nav._klavyeInert = false; }
  };
  if (window.visualViewport) window.visualViewport.addEventListener('resize', guncelle, { passive: true });
  window.addEventListener('resize', guncelle, { passive: true });
  document.addEventListener('focusin', guncelle);
  document.addEventListener('focusout', () => setTimeout(guncelle, 50));
}

// Service worker: yalnız gerçek alan adında (localhost / ?sahte=1 testleri eski önbelleğe takılmasın)
function swKaydet() {
  if (!('serviceWorker' in navigator) || ['localhost', '127.0.0.1'].includes(location.hostname) || sahteMod) return;
  const kaydet = () => navigator.serviceWorker.register('sw.js').catch(() => {});
  if (document.readyState === 'complete') kaydet(); else addEventListener('load', kaydet, { once: true });
}

/**
 * Her sayfanın başında. Senkron kısım hemen çalışır (amblem, künye, geri, alt menü); dönen söz oturum bilgisidir.
 * Sayfalar içerik sorgusunu bu sözü BEKLEMEDEN başlatır (const oturumS = sayfaBaslat(); … await oturumS).
 */
// Yapışkan filtre / sekme çubuğu varsa yüksekliği scroll-padding'e eklenir (--yapiskan-h): klavyeyle odaklanan kart çubuğun altında kalmaz
function yapiskanIzle() {
  const el = document.querySelector('.filtreler, .sekme-yapiskan');
  if (!el || typeof ResizeObserver !== 'function') return;
  const yaz = () => document.documentElement.style.setProperty('--yapiskan-h', (getComputedStyle(el).position === 'sticky' ? Math.ceil(el.getBoundingClientRect().height) : 0) + 'px');
  new ResizeObserver(yaz).observe(el);
  addEventListener('resize', yaz); // kısa ekranda çubuk yapışkan değil (stil.css): pay sıfır
  yaz();
}

export function sayfaBaslat() {
  yapiskanIzle();
  amblemKur();
  kunyeDoldur();
  geriKur();
  klavyeIzle();
  swKaydet();
  if (sahteMod && !document.querySelector('.sahte-serit')) document.body.append(h('div', { class: 'sahte-serit', 'aria-hidden': 'true' }, 'TEST MODU · sahte veri'));
  if (!supabase) {
    const icerik = document.getElementById('icerik');
    const metin = ayarEksik
      ? 'Site henüz yapılandırılmadı: assets/ayar.js dosyasına Supabase adresi ve anahtarı yazılmalı.'
      : 'Sunucuya bağlanılamadı. İnternet bağlantını kontrol edip sayfayı yenile.';
    const serit = icerik && icerik.querySelector('.resmi-degil');
    const kutu = h('p', { class: 'uyari', role: 'alert' }, metin);
    if (serit) serit.after(kutu); else if (icerik) icerik.prepend(kutu);
    return Promise.resolve({ kullanici: null, profil: null, admin: false, hazir: false });
  }
  return oturumAl().then((o) => { profilSimgesi(o); return { ...o, hazir: true }; });
}
