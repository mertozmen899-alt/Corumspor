// Ortak yardımcılar: DOM üretimi (innerHTML yok), tarih, oturum, üst bar, alt menü, duyurular, video kapağı.
import { supabase, sahteMod, ayarEksik } from './istemci.js';
import { TAKIM_ADI, AMBLEM_DOSYASI, SAHIP_ADI, ILETISIM_EPOSTA } from './ayar.js';
import { kapakAdresiGecerli, SAKATLIK_DURUMLARI, profilFotoGecerli } from './kurallar.js';
import { fotoKaynagi, FOTO_KAYNAKLARI } from './foto-kaynaklari.js';

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

/** Görselin ekranda kaplayacağı CSS genişliği (px) → sizes. Etkin piksel oranı 2 ile sınırlanır (performans incelemesi §2):
 *  DPR 3 telefonda 360 px kutu 1080 değil 720 piksellik kopyayı ister (800w; -1600 değil). Göz farkı yok, bayt 3-4 kat az. */
export function boyutlar(kutu) {
  const dpr = (typeof devicePixelRatio === 'number' && devicePixelRatio > 0) ? devicePixelRatio : 1;
  return Math.max(1, Math.round((kutu * Math.min(dpr, 2)) / dpr)) + 'px';
}
/** Ekran genişliğine göre kutu: tam genişlikte görsel (en çok içerik genişliği 720 px). */
export const tamGenislik = (enCok = 720) => Math.min(typeof innerWidth === 'number' && innerWidth > 0 ? innerWidth : enCok, enCok);

/**
 * Kapak için src + srcset (+ sizes, crossorigin). Panelin yüklediği kapakların adı "-1600.webp" ile biter, -480 ve -800 kopyaları
 * da vardır. Sitenin kendi fotoğraflarında (assets/img/) kopya genişlikleri assets/foto-kaynaklari.js "genislikler"den gelir
 * (ör. Saat Kulesi yatay 828/1280/1600): olmayan dosya istenmez (404 yok). kutu verilirse sizes etkin DPR ≤ 2 ile hesaplanır.
 * Depodaki (Supabase) kapaklar crossorigin="anonymous" ile istenir: yanıt opak olmaz, service worker çevrimdışı için saklayabilir.
 */
export function kapakKaynagi(url, { varsayilan = 800, kutu = null } = {}) {
  const src = guvenliGorsel(url);
  if (!src) return null;
  const crossorigin = /^https:\/\//.test(src) ? 'anonymous' : null;
  const sizes = kutu ? boyutlar(kutu) : null;
  const yerel = /^assets\/img\/([a-z0-9-]+?)-(\d+)\.webp$/.exec(src);
  const kayit = yerel && FOTO_KAYNAKLARI[yerel[1]];
  let kok = null, genislikler = null;
  if (kayit && Array.isArray(kayit.genislikler)) { kok = 'assets/img/' + yerel[1]; genislikler = kayit.genislikler; }
  else {
    const m = /^(.*)-1600\.webp$/.exec(src);
    if (m) { kok = m[1]; genislikler = [480, 800, 1600]; }
  }
  if (!kok) return { src, srcset: null, sizes: null, crossorigin };
  const secilen = genislikler.reduce((a, b) => (Math.abs(b - varsayilan) < Math.abs(a - varsayilan) ? b : a));
  return { src: `${kok}-${secilen}.webp`, srcset: genislikler.map((g) => `${kok}-${g}.webp ${g}w`).join(', '), sizes, crossorigin };
}

/**
 * kapakKaynagi() sonucundan <img>: crossorigin, sizes ve srcset src'den ÖNCE yazılır (tarayıcı ilk seçimde doğru kopyayı ister),
 * kırık görselde yer tutucuya döner. ops: { sinif, alt, width, height, loading, fetchpriority }.
 */
export function kapakGorseli(k, { sinif = null, alt = '', width = null, height = null, loading = null, fetchpriority = null, sizes = null } = {}) {
  return gorselYedek(h('img', { crossorigin: k.crossorigin, class: sinif, alt, width, height, loading, fetchpriority, decoding: 'async',
    sizes: k.sizes || sizes, srcset: k.srcset, src: k.src }));
}

/**
 * Kırık görsel (silinmiş dosya, ağ hatası) boş ya da kırık simgeli bir kutu bırakmaz: yerine aynı sınıflı desenli yer tutucu
 * (span.kapak-yok) konur; kutu en-boy oranını korur (kayma yok).
 */
export function gorselYedek(img, sinif = '') {
  img.addEventListener('error', () => {
    if (!img.isConnected) return;
    img.replaceWith(h('span', { class: ((sinif || img.className || '') + ' kapak-yok').trim(), 'aria-hidden': 'true', 'data-gorsel-hata': '' }));
  }, { once: true });
  return img;
}

/**
 * Profil fotoğrafı (017) ya da baş harf. Fotoğraf yalnız kişinin kendi depo klasöründen (kurallar.js profilFotoGecerli);
 * açılmazsa (silinmiş dosya, ağ hatası) baş harfe döner. Yorumlarda alt="" (ad yanında yazılı); profil sayfası anlamlı alt verir.
 */
export function avatarOgesi(ad, fotoUrl, kullaniciId, { boyut = 36, alt = '' } = {}) {
  const harf = () => h('span', { class: 'avatar', 'aria-hidden': 'true' }, String(ad || '?').slice(0, 1).toLocaleUpperCase('tr-TR'));
  if (!fotoUrl || !profilFotoGecerli(fotoUrl, kullaniciId)) return harf();
  const img = h('img', { class: 'avatar', crossorigin: 'anonymous', alt, width: boyut, height: boyut, loading: 'lazy', decoding: 'async', src: fotoUrl });
  img.addEventListener('error', () => img.replaceWith(harf()), { once: true });
  return img;
}

/** Fotoğraf atfı: yöneticinin yazdığı kapak kaynağı ya da sitenin kendi fotoğraflarının kaydı (assets/foto-kaynaklari.js). */
export function fotoAtfi(url, kapakKaynak) {
  const yazilan = typeof kapakKaynak === 'string' ? kapakKaynak.trim() : '';
  if (yazilan) return /^fotoğraf/i.test(yazilan) ? yazilan : 'Fotoğraf: ' + yazilan;
  const k = fotoKaynagi(url);
  return k ? k.atif : null;
}

// Giriş sonrası dönüş adresi: sadece site içi .html sayfaları (açık yönlendirme yok)
// Yayında (Cloudflare Pages) adresler uzantısızdır (/goller, araclar/yayin-hazirla.js): ikisi de kabul edilir
export function guvenliDonus(d) {
  return typeof d === 'string' && /^[a-z]+(\.html)?(\?[\w=&%-]*)?(#[\w-]*)?$/.test(d) ? d : 'index.html';
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

/** Planlanmış maçın taraftar dilinde rozeti: "Bugün maç var!", "Yarın maç var", "4 gün kaldı" (Türkiye takvim günüyle). */
export function macGunuMetni(iso, simdi = Date.now()) {
  if (!iso || isNaN(Date.parse(iso))) return null;
  const gun = (x) => Date.parse(gunAnahtari(x) + 'T00:00:00Z');
  const fark = Math.round((gun(iso) - gun(new Date(simdi).toISOString())) / 864e5);
  if (fark === 0) return Date.parse(iso) > simdi ? 'Bugün maç var!' : null; // başladı ama sonuç girilmedi: "Sonuç bekleniyor"
  if (fark === 1) return 'Yarın maç var';
  if (fark > 1) return `${fark} gün kaldı`;
  return null; // tarihi geçmiş ama sonucu girilmemiş
}
/** Maç sayfası durum rozeti: planlıda geri sayım (resmî "PLANLANDI" yerine), canlı/bitti olduğu gibi. */
export function macRozeti(mac, simdi = Date.now()) {
  if (mac.durum === 'planlandi') {
    const m = macGunuMetni(mac.tarih, simdi);
    return h('span', { class: 'rozet planlandi' + (m === 'Bugün maç var!' ? ' bugun' : '') }, m || 'Sonuç bekleniyor');
  }
  return durumRozeti(mac.durum);
}

export function evSahibiDeplasman(mac) {
  return mac.ic_saha ? [TAKIM_ADI, mac.rakip] : [mac.rakip, TAKIM_ADI];
}

export function skorVar(mac) {
  return mac.durum !== 'planlandi' && mac.corum_skor != null && mac.rakip_skor != null;
}

/** Tek skor biçimi (her yerde aynı): rakamlar arasında kısa çizgi (en dash), iki yanında bölünmez ince boşluk: "2 – 1". */
export const SKOR_AYRAC = '\u202F\u2013\u202F';
export function skorYaz(ev, dep) { return `${ev}${SKOR_AYRAC}${dep}`; }
export function skorMetni(mac) {
  if (!skorVar(mac)) return null;
  return mac.ic_saha ? skorYaz(mac.corum_skor, mac.rakip_skor) : skorYaz(mac.rakip_skor, mac.corum_skor);
}
/** Skor (ya da ayraç) TEK parça: span.skor-blok { white-space: nowrap }. Tarayıcı en dash'ten sonra satırı kırabiliyordu
 *  ("3 –" bir satırda, "0 DENEME FK" altta; Unicode LB12a, taraftar 3. tur 1). */
export function skorOgesi(metin) { return h('span', { class: 'skor-blok' }, metin); }
/** "Çorum FK 2 – 1 Örnekköy Spor" düğüm dizisi: skor bölünmez parça (metin hâli: gol-kart.js macEtiketi). */
export function eslesmeOgeleri(mac) {
  const [ev, dep] = evSahibiDeplasman(mac);
  return [ev, ' ', skorOgesi(skorMetni(mac) || '–'), ' ', dep];
}

/** Biten maçın sonucu: { harf: 'G'|'B'|'M', ad: 'Galibiyet'|… } (renk tek başına anlam taşımaz). */
export function sonucBilgisi(mac) {
  if (mac.durum !== 'bitti' || mac.corum_skor == null || mac.rakip_skor == null) return null;
  if (mac.corum_skor > mac.rakip_skor) return { harf: 'G', ad: 'Galibiyet', sinif: 'g' };
  if (mac.corum_skor < mac.rakip_skor) return { harf: 'M', ad: 'Mağlubiyet', sinif: 'm' };
  return { harf: 'B', ad: 'Beraberlik', sinif: 'b' };
}

/** Sakatlık durumunun ziyaretçiye görünen adı: "belirsiz"/"supheli" → "Durumu belirsiz" (söylenti gibi okunmasın; başkan 7). */
export const SAKATLIK_ETIKETI = Object.freeze({ ...SAKATLIK_DURUMLARI, belirsiz: 'Durumu belirsiz', supheli: 'Durumu belirsiz' });

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
/** Altyazı dosyası yalnız projenin kendi deposundan (.vtt): https://<proje>.supabase.co/storage/v1/object/public/…vtt */
export function altyaziGecerli(url) {
  return typeof url === 'string' && /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/[\w\-./%]+\.vtt$/i.test(url) && !/\.\./.test(url);
}

/** ops.baslik: "Ali Örnek, 23. dakika, Örnekköy Spor maçı" (düğme adı "Videoyu oynat: <baslik>"; tekrar yok, erişilebilirlik 3. tur 2);
 *  ops.tur: oynatıcının adındaki ön ek ("Gol videosu: …"); ops.oncelik: kapak görseli LCP ise 'high' (performans 3. tur 2). */
/** 018: ops.baslangic / ops.bitis (sn): YouTube gömmesi yalnız bu aralığı oynatır (gol anı; start/end yalnız verilirse). */
/** 019: ops.tekrar ('Golü tekrar izle'): YouTube'da aralık varken oynatma başlayınca videonun ALTINA kendi düğmemiz gelir. YouTube'un
 *  kendi tekrar düğmesi videoyu 0:00'dan başlatır; bizimki iframe'i aynı start/end ile yeniden kurar (IFrame API / dış betik yok). */
const TEKRAR_YOLU = 'M3 12a9 9 0 1 0 2.6-6.4M3 4v5h5';
export function videoFasad(url, { baslik = 'Gol', tur = 'Gol videosu', kapak = null, sure = null, altyazi = null, oncelik = null, baslangic = null, bitis = null, tekrar = null } = {}) {
  const id = youtubeKimlik(url);
  const mp4 = !id && mp4Mu(url) ? url : null;
  if (!id && !mp4) return null;
  const k = kapakKaynagi(kapak, { varsayilan: 800, kutu: tamGenislik() });
  const kap = h('div', { class: 'video tam-genis', 'data-video': id ? 'youtube' : 'mp4' });
  const dugme = h('button', { type: 'button', class: 'video-baslat', 'aria-describedby': 'video-not' },
    k ? kapakGorseli(k, { width: '800', height: '450', fetchpriority: oncelik }) : h('span', { class: 'kapak-yok', 'aria-hidden': 'true' }),
    h('span', { class: 'oynat', 'aria-hidden': 'true' }, simge(OYNAT_YOLU, { dolu: true })),
    h('span', { class: 'yazi', 'aria-hidden': 'true' }, 'Oynat', sure ? ` · ${sure}` : ''),
    // Odak halkası kapak görselinin ÜSTÜNDE çizilir (düğmenin kendi outline'ı görselin altında kalıyordu; 2.4.7)
    h('span', { class: 'odak-halka', 'aria-hidden': 'true' }),
    h('span', { class: 'gorunmez' }, `Videoyu oynat: ${baslik}${sure ? ` (${sure})` : ''}`));
  const ad = tur ? `${tur}: ${baslik}` : baslik;
  dugme.addEventListener('click', () => {
    // Kapağın fotoğraf künyesi oynayan videoya ait değil: oynatma başlayınca gizlenir (taraftar 3. tur 4)
    kap.querySelectorAll('.foto-atif').forEach((x) => { x.hidden = true; });
    let oynatici;
    if (id) {
      const sn = (x) => (Number.isInteger(x) && x >= 0 ? x : null);
      const aralik = (sn(baslangic) != null ? `&start=${baslangic}` : '') + (sn(bitis) != null ? `&end=${bitis}` : '');
      const kur = () => h('iframe', {
        src: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1&rel=0&cc_load_policy=1&cc_lang_pref=tr&hl=tr${aralik}`,
        title: ad + ' (YouTube)', allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen', allowfullscreen: '',
        referrerpolicy: 'strict-origin-when-cross-origin',
      });
      oynatici = kur();
      if (tekrar && sn(baslangic) != null && !kap.nextElementSibling?.classList.contains('tekrar-izle')) {
        const t = h('button', { type: 'button', class: 'dugme ikincil tekrar-izle', id: 'video-tekrar' }, simge(TEKRAR_YOLU, { boyut: 20 }), tekrar);
        // Odak düğmede kalır (art arda tekrar edilebilir); yeniden başladığı #durum'dan duyurulur
        t.addEventListener('click', () => { const f = kap.querySelector('iframe'); if (f) f.replaceWith(kur()); duyur(`${tekrar}: video golün başından oynatılıyor.`); });
        kap.after(t);
      }
    } else {
      const vtt = altyaziGecerli(altyazi) ? altyazi : null;
      // Altyazı (1.2.2): kendi depomuzdaki .vtt; başka kökenden <track> için CORS gerekir (crossorigin)
      oynatici = h('video', { src: mp4, controls: true, preload: 'none', playsinline: '', 'aria-label': ad, poster: k ? k.src : null, crossorigin: vtt ? 'anonymous' : null },
        vtt ? h('track', { kind: 'captions', srclang: 'tr', label: 'Türkçe', src: vtt, default: '' }) : null);
    }
    dugme.replaceWith(oynatici);
    oynatici.focus();
    if (oynatici.tagName === 'VIDEO') { try { const p = oynatici.play(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* yok say */ } }
  }, { once: true });
  kap.append(dugme);
  return kap;
}

// ---------------------------------------------------------------- paylaş
const WA_YOLU = 'M20 11.5a8.5 8.5 0 0 1-12.6 7.4L3 20l1.2-4.2A8.5 8.5 0 1 1 20 11.5z';
const PAYLAS_YOLU = 'M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 3v12M7 8l5-5 5 5';
/**
 * "Paylaş" düğmesi (haber, maç, gol). Telefonun paylaşım menüsü varsa (navigator.share) o açılır; yoksa ya da iptal edilmeden
 * hata verirse WhatsApp (wa.me). Bağlantının kendisi her zaman wa.me adresidir: JavaScript'siz de çalışır.
 * metin: paylaşılacak kısa yazı (adres ayrıca eklenir).
 */
export function paylasDugmesi(metin, adres = location.href.split('#')[0], { baslik = document.title } = {}) {
  const yerel = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const a = h('a', { class: 'paylas', href: 'https://wa.me/?text=' + encodeURIComponent(`${metin} ${adres}`), target: '_blank', rel: 'noopener', 'data-paylas': yerel ? 'yerel' : 'whatsapp' },
    simge(yerel ? PAYLAS_YOLU : WA_YOLU), h('span', null, yerel ? 'Paylaş' : "WhatsApp'ta paylaş"), yerel ? null : h('span', { class: 'gorunmez' }, ' (yeni sekmede açılır)'));
  if (yerel) {
    a.addEventListener('click', async (e) => {
      e.preventDefault();
      try { await navigator.share({ title: baslik, text: metin, url: adres }); }
      catch (x) { if (x && x.name !== 'AbortError') window.open(a.href, '_blank', 'noopener'); }
    });
  }
  return a;
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

// ---------------------------------------------------------------- 020: hareket yardımcıları, listelerde beğeni sayısı
export const hareketAzalt = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Rakamın kayarak değişmesi (tahmin sayacı, beğeni sayısı; stil.css .kay-yukari / .kay-asagi). Hareket azaltmada yalnız metin değişir. */
export function rakamDegistir(el, metin, yon = 'yukari') {
  el.textContent = metin;
  if (hareketAzalt()) return;
  el.classList.remove('kay-yukari', 'kay-asagi');
  void el.offsetWidth; // aynı sınıfla animasyonu yeniden başlat
  el.classList.add(yon === 'asagi' ? 'kay-asagi' : 'kay-yukari');
}
/**
 * Haber akışı / gol arşivi satırlarına beğeni sayısı ("♥ 3"; 0 ise yazılmaz). Liste başına TEK istek (begeni_sayilari RPC, ≤ 100 kimlik).
 * tur 'haber' → [data-haber-id], 'gol' → [data-gol-id]; sayı satırdaki [data-begeni-yer] içine (yoksa satırın sonuna) eklenir.
 * Bir kez işlenen satır yeniden sayılmaz (data-begeni). Hata olursa sessizce geçer (sayı süs bilgisi).
 */
export async function begeniSayilariniYaz(kok, tur) {
  const nitelik = tur === 'haber' ? 'data-haber-id' : 'data-gol-id';
  const ogeler = kok ? [...kok.querySelectorAll(`[${nitelik}]:not([data-begeni])`)] : [];
  if (!ogeler.length || !supabase) return;
  ogeler.forEach((el) => el.setAttribute('data-begeni', ''));
  let r;
  try { r = await supabase.rpc('begeni_sayilari', { p_tur: tur, p_idler: [...new Set(ogeler.map((el) => el.getAttribute(nitelik)))].slice(0, 100) }); } catch (e) { return; }
  if (!r || r.error || !Array.isArray(r.data)) return;
  const say = new Map(r.data.map((x) => [x.hedef_id, x]));
  for (const el of ogeler) {
    const x = say.get(el.getAttribute(nitelik));
    if (!x || !(x.sayi > 0)) continue;
    (el.querySelector('[data-begeni-yer]') || el).append(h('span', { class: 'begeni-mini' + (x.benim ? ' benim' : '') },
      h('span', { 'aria-hidden': 'true' }, '♥ ' + x.sayi), h('span', { class: 'gorunmez' }, `, ${x.sayi} beğeni`)));
    if (el.hasAttribute('aria-label')) el.setAttribute('aria-label', `${el.getAttribute('aria-label')}, ${x.sayi} beğeni`);
  }
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
    try { ayniSite = !!document.referrer && new URL(document.referrer).origin === location.origin && !/\/giris(\.html)?(\?|#|$)/.test(document.referrer); } catch (x) { ayniSite = false; }
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
// 019: sayfa önceki sürümün kabuğundan açıldıysa (atomik sürüm: sayfa + JS aynı sürümden) ve bu sırada yeni sürüm kurulup etkinleştiyse
// (controllerchange) altta kısa, görünür "Yeni sürüm hazır" + "Yenile" notu çıkar; duyuru #durum'dan. Otomatik yeniden yükleme YOK
// (okuduğu yer / yazdığı yorum kaybolmasın). Bundan sonraki her gezinme zaten yeni sürümü alır. Ana ekrandan açılan uygulama gezinmeden
// uzun süre açık kalabildiği için öne gelince (en çok 30 dakikada bir) güncelleme de denetlenir.
const SW_DENETIM_ARALIGI = 30 * 60e3;
function yeniSurumNotu() {
  if (document.getElementById('surum-notu')) return;
  const not = h('div', { class: 'surum-notu', id: 'surum-notu' },
    h('p', null, 'Yeni sürüm hazır'),
    h('button', { type: 'button', class: 'dugme', id: 'surum-yenile' }, 'Yenile'),
    h('button', { type: 'button', class: 'ikon-dugme surum-kapat', 'aria-label': 'Notu kapat (sonraki açılışta yeni sürüm gelir)' }, simge('M6 6l12 12M18 6 6 18', { boyut: 20 })));
  not.querySelector('#surum-yenile').addEventListener('click', () => location.reload());
  not.querySelector('.surum-kapat').addEventListener('click', () => not.remove());
  document.body.append(not);
  duyur('Uygulamanın yeni sürümü hazır. Görmek için ekranın altındaki Yenile düğmesine dokun.');
}
function swKaydet() {
  if (!('serviceWorker' in navigator)) return;
  const sw = navigator.serviceWorker;
  // 021: gol bildirimi geldi ve sayfa ekranda (sw.js push): Profil'de "düdük sesi" açıksa kısa düdük (bildirim.js yalnız o an yüklenir)
  sw.addEventListener('message', (e) => { if (e.data && e.data.tur === 'bildirim-gol') import('./bildirim.js').then((m) => m.golDudugu()).catch(() => {}); });
  if (sw.controller) sw.addEventListener('controllerchange', yeniSurumNotu, { once: true });
  if (['localhost', '127.0.0.1'].includes(location.hostname) || sahteMod) return;
  const kaydet = () => sw.register('sw.js').then((k) => {
    let son = Date.now();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && Date.now() - son > SW_DENETIM_ARALIGI) { son = Date.now(); k.update().catch(() => {}); }
    });
  }).catch(() => {});
  if (document.readyState === 'complete') kaydet(); else addEventListener('load', kaydet, { once: true });
}

/**
 * 019: liste sayfasına (Takım › Kadro / Fikstür, ana sayfa akışı) geri dönünce kaydırma yeri. Veri ağdan geldiği için tarayıcının
 * kendi geri yüklemesi sayfa henüz kısayken çalışıp kayboluyordu (Forvetler'den oyuncuya girip dönünce Kaleciler). Ayrılırken konum
 * ve sayfanın ek durumu (ör. yüklenen haber sayfası) sessionStorage'a yazılır; geri/ileri ile gelinince sayfa veriyi çizdikten SONRA
 * `geriYukle()` çağırır (çizimden önce kaydırma yok, kayma yok). Kullanıcı bu arada kendisi kaydırdıysa dokunulmaz.
 * anahtar: adres yolu + sorgu; parça (#kadro / #fikstur) ayrıca saklanır ve aynı değilse geri yüklenmez.
 */
export function konumKoru(durumAl = () => null) {
  const anahtar = 'konum:' + location.pathname + location.search;
  const nav = typeof performance !== 'undefined' && performance.getEntriesByType ? performance.getEntriesByType('navigation')[0] : null;
  let kayit = null;
  try { kayit = nav && nav.type === 'back_forward' ? JSON.parse(sessionStorage.getItem(anahtar) || 'null') : null; } catch (e) { kayit = null; }
  let elle = false;
  const dur = () => { elle = true; };
  for (const t of ['wheel', 'touchstart', 'keydown']) addEventListener(t, dur, { once: true, passive: true });
  addEventListener('pagehide', () => {
    try { sessionStorage.setItem(anahtar, JSON.stringify({ y: Math.round(scrollY), parca: location.hash, durum: durumAl() })); } catch (e) { /* gizli mod: yok say */ }
  });
  return {
    durum: kayit && kayit.parca === location.hash ? kayit.durum : null,
    geriYukle() {
      if (!kayit || elle || kayit.parca !== location.hash || !(kayit.y > 0)) return false;
      const y = kayit.y;
      kayit = null;
      scrollTo({ top: y, behavior: 'instant' });
      return true;
    },
  };
}

/**
 * Her sayfanın başında. Senkron kısım hemen çalışır (amblem, künye, geri, alt menü); dönen söz oturum bilgisidir.
 * Sayfalar içerik sorgusunu bu sözü BEKLEMEDEN başlatır (const oturumS = sayfaBaslat(); … await oturumS).
 */
// Yapışkan filtre / sekme çubuğu varsa yüksekliği scroll-padding'e eklenir (--yapiskan-h): klavyeyle odaklanan kart çubuğun altında kalmaz
// TOPLAM sabit alan (üst bar + alt menü + bu çubuk) ekranın %25'inden fazlaysa (büyük yazı tipi, %200) çubuk yapışmaz
// (.yapiskan-degil): sabit alan ekranın üçte birini yemesin (1.4.10; erişilebilirlik 3. tur 3). Yapışkan değilken de boyu aynı: karar
// konuma göre değişip titremez.
export const SABIT_ALAN_ORANI = 0.25;
function yapiskanIzle() {
  const el = document.querySelector('.filtreler, .sekme-yapiskan, .skor-cubugu');
  if (!el || typeof ResizeObserver !== 'function') return;
  const ust = document.querySelector('header.ust'), nav = document.getElementById('alt-nav');
  const boyu = (e) => (e && getComputedStyle(e).position !== 'static' ? Math.ceil(e.getBoundingClientRect().height) : 0);
  const yaz = () => {
    const boy = Math.ceil(el.getBoundingClientRect().height);
    el.classList.toggle('yapiskan-degil', boyu(ust) + boyu(nav) + boy > innerHeight * SABIT_ALAN_ORANI);
    // Maç skor çubuğu sabit (fixed): yapışmadığında görünmez ama boyu aynı kalır (karar titremez)
    const kaplar = getComputedStyle(el).position !== 'static' && !el.classList.contains('yapiskan-degil');
    document.documentElement.style.setProperty('--yapiskan-h', (kaplar ? boy : 0) + 'px');
  };
  const ro = new ResizeObserver(yaz);
  for (const e of [el, ust, nav]) if (e) ro.observe(e);
  addEventListener('resize', yaz); // kısa ekranda çubuk yapışkan değil (stil.css): pay sıfır
  yaz();
}

// Büyük yazı tipi (tarayıcı/sistem yazı boyu ≥ 150 %): satır kırpma (line-clamp) kalkar, uzun adlar sarar (1.4.4; erişilebilirlik 3. tur 5)
function yaziBoyuIzle() {
  const kok = document.documentElement;
  const yaz = () => kok.classList.toggle('buyuk-yazi', parseFloat(getComputedStyle(kok).fontSize) >= 24);
  yaz();
  addEventListener('resize', yaz);
  if (typeof ResizeObserver === 'function') {
    // Yazı boyu değişince "M" ölçüsündeki gizli öğenin boyu değişir (yeniden yükleme gerekmez)
    const olcu = h('span', { 'aria-hidden': 'true', class: 'yazi-olcu' }, 'M');
    document.body.append(olcu);
    new ResizeObserver(yaz).observe(olcu);
  }
}

// Üst bar ve alt menünün GERÇEK yüksekliği (büyük yazı tipinde 56/64 px'ten uzun): scroll-padding, künye alt boşluğu ve yapışkan
// çubukların top değeri bunu kullanır (--ust-gercek / --alt-menu-gercek; stil.css'te px belirteçleri yalnız yedek)
function cubukIzle() {
  if (typeof ResizeObserver !== 'function') return;
  const kok = document.documentElement.style;
  for (const [secici, ad] of [['header.ust', '--ust-gercek'], ['#alt-nav', '--alt-menu-gercek']]) {
    const el = document.querySelector(secici);
    if (!el) continue;
    const yaz = () => kok.setProperty(ad, Math.ceil(el.getBoundingClientRect().height) + 'px');
    new ResizeObserver(yaz).observe(el);
    yaz();
  }
}

// Üst bar aşağı kaydırınca gizlenir, yukarı kaydırınca gelir (html.ust-gizli; stil.css 29. bölüm, translate: kayma yok).
// Sayfa başında (bar boyu kadar) hep görünür; odak üst bardaysa gizlenmez; üst bar yapışkan değilse (kısa ekran) hiç gizlenmez.
// Hareket azaltmada da gizlenir ama animasyonsuz: kazanılan alan büyük yazı / yakınlaştırma kullananlara en çok yarar,
// hareket yalnız anlık bir değişimdir (kayan animasyon yok).
export const UST_ESIK = 8;
function ustBarIzle() {
  const ust = document.querySelector('header.ust');
  if (!ust) return;
  const kok = document.documentElement;
  let son = scrollY, bekliyor = false;
  const guncelle = () => {
    bekliyor = false;
    const y = Math.max(0, scrollY), fark = y - son;
    if (y > ust.offsetHeight && Math.abs(fark) < UST_ESIK) return;
    const gizle = y > ust.offsetHeight && fark > 0 && !ust.contains(document.activeElement) && getComputedStyle(ust).position === 'sticky';
    kok.classList.toggle('ust-gizli', gizle);
    son = y;
  };
  addEventListener('scroll', () => { if (!bekliyor) { bekliyor = true; requestAnimationFrame(guncelle); } }, { passive: true });
  ust.addEventListener('focusin', () => kok.classList.remove('ust-gizli'));
}

// Alt menü: açık sekmeye (aria-current="page") yeniden dokununca sayfa yeniden yüklenmez; en başa kayar (hareket azaltmada anında),
// odak ana içeriğe gider. Ayrıntı sayfasındaki bölüm bağlantısı (aria-current="true") normal bağlantıdır: bölümün köküne gider.
function altMenuIzle() {
  const nav = document.getElementById('alt-nav');
  if (!nav) return;
  nav.addEventListener('click', (e) => {
    const a = e.target.closest('a[aria-current="page"]');
    if (!a || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    const azalt = matchMedia('(prefers-reduced-motion: reduce)').matches;
    scrollTo({ top: 0, behavior: azalt ? 'instant' : 'smooth' });
    const main = document.getElementById('icerik');
    if (main) main.focus({ preventScroll: true });
  });
}

export function sayfaBaslat() {
  yaziBoyuIzle();
  cubukIzle();
  yapiskanIzle();
  ustBarIzle();
  altMenuIzle();
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
