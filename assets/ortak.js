// Ortak yardımcılar: DOM üretimi (innerHTML yok), tarih, oturum, üst menü.
import { supabase, sahteMod, ayarEksik } from './istemci.js';
import { TAKIM_ADI, AMBLEM_DOSYASI } from './ayar.js';

export { supabase, sahteMod, TAKIM_ADI };

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

export function mesaj(el, metin, tur = 'hata') {
  if (!el) return;
  el.replaceChildren();
  if (!metin) { el.hidden = true; return; }
  el.className = 'mesaj ' + tur;
  el.setAttribute('role', tur === 'hata' ? 'alert' : 'status');
  el.textContent = metin;
  el.hidden = false;
}

// ---------------------------------------------------------------- adres
export function param(ad) {
  return new URLSearchParams(location.search).get(ad);
}

export function kimlikGecerli(id) {
  return typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

// Görsel adresi sadece https:// ya da site içi assets/ olabilir
export function guvenliGorsel(url) {
  if (typeof url !== 'string') return null;
  if (/^https:\/\/[^\s"'<>]+$/.test(url) || /^assets\/[\w./-]+$/.test(url)) return url;
  if (sahteMod && /^data:image\/(png|jpeg|webp|gif);base64,/.test(url)) return url;
  return null;
}

// Giriş sonrası dönüş adresi: sadece site içi .html sayfaları (açık yönlendirme yok)
export function guvenliDonus(d) {
  return typeof d === 'string' && /^[a-z]+\.html(\?[\w=&%-]*)?(#[\w-]*)?$/.test(d) ? d : 'index.html';
}

export function girisAdresi() {
  const burasi = location.pathname.split('/').pop() || 'index.html';
  const donus = burasi + location.search;
  return 'giris.html?donus=' + encodeURIComponent(guvenliDonus(donus));
}

// ---------------------------------------------------------------- tarih (Türkiye saati)
export function tarihYaz(iso, { saat = true, gun = false, kisa = false } = {}) {
  const d = new Date(iso);
  if (!iso || isNaN(d)) return '';
  const secenek = { timeZone: TZ, day: 'numeric', month: kisa ? 'short' : 'long', year: 'numeric' };
  if (gun) secenek.weekday = kisa ? 'short' : 'long';
  if (saat) { secenek.hour = '2-digit'; secenek.minute = '2-digit'; secenek.hourCycle = 'h23'; }
  return new Intl.DateTimeFormat('tr-TR', secenek).format(d);
}

export function saatYaz(iso) {
  return new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
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

export function dakikaMetni(gol) {
  return gol.ek_dakika ? `${gol.dakika}+${gol.ek_dakika}'` : `${gol.dakika}'`;
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

export function videoOgesi(url, baslik = 'Gol videosu') {
  if (!url) return null;
  const id = youtubeKimlik(url);
  if (id) {
    return h('div', { class: 'video' }, h('iframe', {
      src: `https://www.youtube-nocookie.com/embed/${id}`,
      title: baslik,
      loading: 'lazy',
      allow: 'accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen',
      allowfullscreen: '',
      referrerpolicy: 'strict-origin-when-cross-origin',
    }));
  }
  if (mp4Mu(url)) {
    return h('div', { class: 'video' }, h('video', { src: url, controls: true, preload: 'metadata', playsinline: '', 'aria-label': baslik }));
  }
  return null;
}

// ---------------------------------------------------------------- hata metinleri
export function hataMetni(e, varsayilan = 'Bir sorun oluştu. Lütfen tekrar deneyin.') {
  const m = String((e && (e.message || e.error_description)) || '');
  if (/Invalid login credentials/i.test(m)) return 'E-posta ya da şifre hatalı.';
  if (/Email not confirmed/i.test(m)) return 'E-posta adresinizi henüz onaylamadınız. Gelen kutunuzu kontrol edin.';
  if (/already registered|already exists/i.test(m)) return 'Bu e-posta adresiyle zaten bir hesap var.';
  if (/Password should be|weak password/i.test(m)) return 'Şifre en az 8 karakter olmalı.';
  if (/[çğıöşüÇĞİÖŞÜ]/.test(m)) return m; // sunucunun Türkçe mesajları (tetikleyiciler)
  if (/row-level security|permission denied/i.test(m) || (e && e.code === '42501')) return 'Bu işlem için yetkiniz yok.';
  if (/rate limit|too many/i.test(m)) return 'Çok fazla deneme yapıldı. Biraz bekleyip tekrar deneyin.';
  if (e && e.code === '23514') return 'Girilen bilgiler kurallara uymuyor (uzunluk ya da biçim).';
  if (e && e.code === '23505') return 'Bu kayıt zaten var.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'İnternet bağlantısında sorun var.';
  return varsayilan;
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
        const r = await supabase.from('profiles').select('id, kullanici_adi, role').eq('id', kullanici.id).maybeSingle();
        profil = r.data || null;
      }
      return { kullanici, profil, admin: !!profil && profil.role === 'admin' };
    })();
  }
  return oturumSozu;
}

export async function cikisYap() {
  if (supabase) await supabase.auth.signOut();
  location.href = 'index.html';
}

// ---------------------------------------------------------------- amblem
// HTML'de varsayılan olarak özgün yedek işaret (assets/logo/amblem-yedek.svg) yüklenir: olmayan dosya istenmez,
// konsolda 404 olmaz. ayar.js'te AMBLEM_DOSYASI verilmişse (kulüpten izin alındıktan sonra) önce o denenir.
// Sıra: AMBLEM_DOSYASI → amblem-yedek.svg → "ÇFK" yazı işareti. Sayfa hiçbir durumda bozulmaz.
const AMBLEM_YEDEK = 'assets/logo/amblem-yedek.svg';
export function amblemKur(kok = document) {
  const istenen = typeof AMBLEM_DOSYASI === 'string' && /^assets\/logo\/[\w.-]+\.(svg|png|webp)$/.test(AMBLEM_DOSYASI) ? AMBLEM_DOSYASI : null;
  kok.querySelectorAll('img[data-amblem]').forEach((img) => {
    const adaylar = [istenen, AMBLEM_YEDEK].filter(Boolean);
    let i = 0;
    const yaziIsareti = () => img.replaceWith(h('span', { class: 'amblem-yazi', 'aria-hidden': 'true' }, 'ÇFK'));
    const sonraki = () => { i += 1; if (i < adaylar.length) img.src = adaylar[i]; else yaziIsareti(); };
    img.addEventListener('error', sonraki);
    if (istenen) img.src = adaylar[0];
    else if (img.complete && img.naturalWidth === 0 && img.getAttribute('src')) yaziIsareti(); // yedek de açılamadıysa
  });
}

// Her sayfanın başında: amblemi kurar, oturum alanını doldurur, ayar/test uyarılarını gösterir.
export async function sayfaBaslat() {
  amblemKur();
  const icerik = document.getElementById('icerik');
  if (sahteMod) document.body.prepend(h('div', { class: 'sahte-serit' }, 'TEST MODU · sahte veri'));
  if (!supabase) {
    const metin = ayarEksik
      ? 'Site henüz yapılandırılmadı: assets/ayar.js dosyasına Supabase adresi ve anahtarı yazılmalı.'
      : 'Sunucuya bağlanılamadı. İnternet bağlantınızı kontrol edip sayfayı yenileyin.';
    if (icerik) icerik.prepend(h('p', { class: 'uyari', role: 'alert' }, metin));
    return { kullanici: null, profil: null, admin: false, hazir: false };
  }
  const o = await oturumAl();
  const alan = document.getElementById('oturum-alani');
  if (alan) {
    alan.replaceChildren(...(o.kullanici
      ? [
          o.admin ? h('a', { href: 'yonetim.html', class: 'dugme kucuk', id: 'yonetim-baglanti' }, 'Yönetim') : null,
          h('span', { class: 'kullanici', title: 'Giriş yapan kullanıcı' }, (o.profil && o.profil.kullanici_adi) || 'Hesabım'),
          h('button', { type: 'button', class: 'dugme-metin', onclick: cikisYap }, 'Çıkış'),
        ].filter(Boolean)
      : [h('a', { href: girisAdresi(), class: 'dugme kucuk' }, 'Giriş yap')]));
  }
  return { ...o, hazir: true };
}
