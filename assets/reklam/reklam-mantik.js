// Çorumspor reklam modülü: saf mantık (DOM yok, ağ yok). Tarayıcıda ve Node'da aynı dosya çalışır.
// Buradaki kurallar veritabanındaki kuralların AYNASIDIR (supabase/migrations/010_reklamlar.sql).
// Birini değiştirirseniz ötekini de değiştirin; testler/baglanti-ornekleri.json iki tarafta da denenir.

export const SAAT_DILIMI = 'Europe/Istanbul';

export const ALANLAR = Object.freeze({
  ana_akis: 'Ana sayfa akışı',
  haber_sonu: 'Haber sonu',
  mac_sponsoru: 'Maç sponsoru',
});

export const DURUMLAR = Object.freeze({
  taslak: 'Taslak',
  yayinda: 'Yayında',
  duraklatildi: 'Duraklatıldı',
  suresi_doldu: 'Süresi doldu',
  baslamadi: 'Başlamadı',
});

export const SINIRLAR = Object.freeze({
  firmaAdiEnUzun: 80,
  kisaMetinEnUzun: 160,
  baglantiEnUzun: 2000,
  oncelikEnAz: 0,
  oncelikEnCok: 100,
  gorselEnBuyukBayt: 2 * 1024 * 1024,
  gorselTurleri: ['image/jpeg', 'image/png', 'image/webp'],
});

// ---------------------------------------------------------------------------
// Bağlantı kuralları (SQL'deki public.reklam_baglanti_gecerli ile birebir aynı desenler)
// ---------------------------------------------------------------------------
const HTTPS_DESENI = /^https:\/\/([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}(:[0-9]{1,5})?([/?#][^<>"'`\\{}|^]*)?$/i;
const WA_ME_DESENI = /^https:\/\/wa\.me\/[0-9]{8,15}\/?(\?text=[^<>"'`\\{}|^&]*)?$/i;
const WA_ME_ON_EK = /^https:\/\/wa\.me([/?#:]|$)/i;
const WA_UYGULAMA_DESENI = /^whatsapp:\/\/send\?phone=[0-9]{8,15}(&text=[^<>"'`\\{}|^&]*)?$/i;
const KONTROL_KARAKTERI = /[\u0000- \u007f-\u009f]/;
// Reklam görseli YALNIZ projenin kendi Supabase Storage kovasından (reklam-gorselleri) gelir: başka bir alan adındaki
// görsel, ziyaretçinin IP'sini üçüncü bir tarafa sızdırabilir (izleme pikseli) ve sonradan değiştirilebilir.
// SQL'deki public.reklam_gorsel_gecerli ile AYNI desen. Supabase'e kendi alan adınızı bağladıysanız ikisini birlikte güncelleyin.
const DEPO_GORSELI = /^https:\/\/[a-z0-9][a-z0-9-]{0,62}\.supabase\.co\/storage\/v1\/object\/public\/reklam-gorselleri\/[A-Za-z0-9._~\/-]+$/i;

/** Reklam bağlantısı geçerli mi? Boş (null/'') geçerlidir: bağlantı isteğe bağlı. */
export function baglantiGecerli(url) {
  if (url == null || url === '') return true;
  if (typeof url !== 'string') return false;
  if (url.length > SINIRLAR.baglantiEnUzun || KONTROL_KARAKTERI.test(url)) return false;
  if (WA_UYGULAMA_DESENI.test(url)) return true;
  if (WA_ME_ON_EK.test(url)) return WA_ME_DESENI.test(url);
  return HTTPS_DESENI.test(url);
}

/** Görsel adresi: yalnız https://<proje>.supabase.co/storage/v1/object/public/reklam-gorselleri/... ('..' yok). */
export function gorselAdresiGecerli(url) {
  if (typeof url !== 'string' || url === '' || url.length > SINIRLAR.baglantiEnUzun || KONTROL_KARAKTERI.test(url)) return false;
  return DEPO_GORSELI.test(url) && !url.includes('..');
}

export function whatsappBaglantisiMi(url) {
  return typeof url === 'string' && (WA_UYGULAMA_DESENI.test(url) || WA_ME_DESENI.test(url));
}

/**
 * Yöneticinin yazdığı adresi düzeltir: boşlukları atar, şema yoksa https:// ekler,
 * Türkçe karakterli alan adını (çorum.com) punycode'a çevirir. http:// olduğu gibi kalır (sonra reddedilir).
 */
export function baglantiNormallestir(girdi) {
  if (girdi == null) return null;
  let s = String(girdi).trim();
  if (s === '') return null;
  if (/^whatsapp:/i.test(s)) return s;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = 'https://' + s.replace(/^\/+/, '');
  if (/^https:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      if (u.username || u.password) return s; // kullanıcı adı/şifre içeren adres: dokunma, reddedilecek
      const yol = s.slice(s.indexOf('//') + 2).replace(/^[^/?#]*/, '');
      s = 'https://' + u.host + yol;
    } catch { /* geçersiz: doğrulama reddeder */ }
  }
  return s;
}

/**
 * Türkiye telefon numarasını uluslararası rakamlara çevirir: "0532 123 45 67" -> "905321234567".
 * Cep (5xx) ve sabit hat (2xx/3xx/4xx, ör. Çorum 0364) kabul edilir. Geçersizse null.
 */
export function telefonuUluslararasiYap(telefon) {
  if (telefon == null) return null;
  let r = String(telefon).replace(/[\s().\-]/g, '');
  if (!/^\+?[0-9]+$/.test(r)) return null;
  r = r.replace(/^\+/, '');
  if (r.startsWith('0090')) r = r.slice(4);
  else if (r.startsWith('90') && r.length === 12) r = r.slice(2);
  else if (r.startsWith('0') && r.length === 11) r = r.slice(1);
  if (!/^[2-5][0-9]{9}$/.test(r)) return null;
  return '90' + r;
}

/** Türkiye numarasından wa.me bağlantısı. İsteğe bağlı hazır mesaj (?text=). Geçersiz numarada null. */
export function whatsappBaglantisiOlustur(telefon, mesaj) {
  const no = telefonuUluslararasiYap(telefon);
  if (!no) return null;
  const m = mesaj == null ? '' : String(mesaj).trim();
  return 'https://wa.me/' + no + (m ? '?text=' + encodeURIComponent(m) : '');
}

// ---------------------------------------------------------------------------
// İstanbul saati (Türkiye bugün yıl boyu UTC+3; yine de sabit kayma YAZMIYORUZ, Intl kullanıyoruz)
// ---------------------------------------------------------------------------
const PARCA_BICIMI = new Intl.DateTimeFormat('en-US', {
  timeZone: SAAT_DILIMI, hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
});

function tarihe(d) {
  const t = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(t.getTime())) throw new RangeError('Geçersiz tarih: ' + d);
  return t;
}

/** Bir anın İstanbul'daki takvim/saat parçaları. */
export function istanbulParcalari(an) {
  const p = {};
  for (const { type, value } of PARCA_BICIMI.formatToParts(tarihe(an))) p[type] = value;
  return { yil: +p.year, ay: +p.month, gun: +p.day, saat: +p.hour, dakika: +p.minute, saniye: +p.second };
}

const iki = (n) => String(n).padStart(2, '0');

/** İstanbul'un o andaki UTC farkı (dakika). Türkiye için 180. */
export function istanbulFarkiDakika(an) {
  const t = tarihe(an);
  const p = istanbulParcalari(t);
  const yerelUtc = Date.UTC(p.yil, p.ay - 1, p.gun, p.saat, p.dakika, p.saniye);
  return Math.round((yerelUtc - Math.floor(t.getTime() / 1000) * 1000) / 60000);
}

/** ISO/Date -> <input type="datetime-local"> değeri ("2026-11-05T20:30"), İstanbul saatiyle. */
export function isoYerelGirise(an) {
  if (an == null || an === '') return '';
  const p = istanbulParcalari(an);
  return `${p.yil}-${iki(p.ay)}-${iki(p.gun)}T${iki(p.saat)}:${iki(p.dakika)}`;
}

/** "2026-11-05T20:30" (İstanbul duvar saati) -> UTC ISO metni. Geçersizse null. */
export function yerelGiristenIso(deger) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(deger || '').trim());
  if (!m) return null;
  const [, y, a, g, s, d, sn] = m.map(Number);
  if (a < 1 || a > 12 || g < 1 || g > 31 || s > 23 || d > 59) return null;
  const duvar = Date.UTC(y, a - 1, g, s, d, sn || 0);
  // Saat dilimi farkını iki kez dene (yaz saati olan bir dilime geçilirse de doğru kalsın)
  let tahmin = duvar - istanbulFarkiDakika(duvar) * 60000;
  tahmin = duvar - istanbulFarkiDakika(tahmin) * 60000;
  const kontrol = istanbulParcalari(tahmin);
  if (kontrol.gun !== g || kontrol.ay !== a) return null; // 31 Şubat gibi
  return new Date(tahmin).toISOString();
}

const GOSTERIM_BICIMI = new Intl.DateTimeFormat('tr-TR', {
  timeZone: SAAT_DILIMI, day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
/** Yöneticiye gösterilecek tarih: "5 Kasım 2026 20:30" (İstanbul). */
export function istanbulBicimle(an) {
  if (an == null || an === '') return '';
  return GOSTERIM_BICIMI.format(tarihe(an));
}

/** İstanbul'da bugünün tarihi "YYYY-MM-DD". */
export function istanbulGunu(an = new Date()) {
  const p = istanbulParcalari(an);
  return `${p.yil}-${iki(p.ay)}-${iki(p.gun)}`;
}

/** Rapor için varsayılan aralık: İstanbul'a göre bu ayın ilk ve son günü. */
export function buAyAraligi(an = new Date()) {
  const p = istanbulParcalari(an);
  const sonGun = new Date(Date.UTC(p.yil, p.ay, 0)).getUTCDate();
  return { baslangic: `${p.yil}-${iki(p.ay)}-01`, bitis: `${p.yil}-${iki(p.ay)}-${iki(sonGun)}` };
}

// ---------------------------------------------------------------------------
// Durum ve seçim (SQL: aktif_reklam ile aynı kural)
// ---------------------------------------------------------------------------
const ms = (x) => (x instanceof Date ? x.getTime() : new Date(x).getTime());

/** Şu an gösterilebilir mi: yayında VE baslangic <= şimdi < bitis. */
export function reklamSunulabilir(r, simdi = new Date()) {
  const s = ms(simdi);
  return !!r && r.durum === 'yayinda' && ms(r.baslangic) <= s && s < ms(r.bitis);
}

/** Panelde gösterilecek durum: taslak | duraklatildi | suresi_doldu | baslamadi | yayinda */
export function reklamDurumu(r, simdi = new Date()) {
  if (r.durum === 'taslak') return 'taslak';
  const s = ms(simdi);
  if (ms(r.bitis) <= s) return 'suresi_doldu';
  if (r.durum === 'duraklatildi') return 'duraklatildi';
  if (ms(r.baslangic) > s) return 'baslamadi';
  return 'yayinda';
}

export function durumEtiketi(kod) { return DURUMLAR[kod] || kod; }

/**
 * Bir yerleşim için hangi reklam gösterilir? (SQL aktif_reklam'ın aynası)
 * 1) Şu an sunulabilir ve alanı tutan reklamlar,
 * 2) maç sponsorunda: bu maça özel reklam, genel (mac_id boş) reklamdan önce gelir; başka maçın reklamı hiç gelmez,
 * 3) yüksek öncelik, 4) yeni yayina_alinma, 5) yeni created_at, 6) id (kararlı sıra).
 */
export function reklamSec(reklamlar, { alan, macId = null } = {}, simdi = new Date()) {
  const mac = macId == null || macId === '' ? null : String(macId);
  const adaylar = (reklamlar || []).filter((r) => {
    if (!reklamSunulabilir(r, simdi) || r.alan !== alan) return false;
    if (alan !== 'mac_sponsoru') return true;
    return r.mac_id == null || (mac !== null && String(r.mac_id) === mac);
  });
  const ozel = (r) => (alan === 'mac_sponsoru' && r.mac_id != null && mac !== null && String(r.mac_id) === mac ? 1 : 0);
  const zaman = (x) => (x == null ? -Infinity : ms(x));
  adaylar.sort((a, b) =>
    ozel(b) - ozel(a) ||
    (b.oncelik ?? 0) - (a.oncelik ?? 0) ||
    zaman(b.yayina_alinma) - zaman(a.yayina_alinma) ||
    zaman(b.created_at) - zaman(a.created_at) ||
    String(a.id).localeCompare(String(b.id)));
  return adaylar[0] || null;
}

/** Kartın üstündeki etiket. */
export function reklamEtiketi(r) {
  if (r && r.alan === 'mac_sponsoru') return r.mac_id != null && r.mac_id !== '' ? 'Maçın sponsoru' : 'Sponsor';
  return 'Reklam';
}

/** Bağlantı düğmesinin yazısı. */
export function eylemYazisi(url) {
  if (!url) return '';
  return whatsappBaglantisiMi(url) ? "WhatsApp'tan yazın" : 'Ayrıntılar';
}

// ---------------------------------------------------------------------------
// Form doğrulama (SQL tetikleyicisi reklamlar_dogrula ile aynı kurallar). Hata yoksa boş nesne.
// ---------------------------------------------------------------------------
export function reklamDogrula(r, { simdi = new Date(), yayinaAliniyor = false } = {}) {
  const h = {};
  const firma = (r.firma_adi || '').trim();
  const metin = (r.kisa_metin || '').trim();
  if (!firma) h.firma_adi = 'Firma adı boş olamaz.';
  else if (firma.length > SINIRLAR.firmaAdiEnUzun) h.firma_adi = `Firma adı en fazla ${SINIRLAR.firmaAdiEnUzun} karakter olabilir.`;
  if (!metin) h.kisa_metin = 'Kısa metin boş olamaz.';
  else if (metin.length > SINIRLAR.kisaMetinEnUzun) h.kisa_metin = `Kısa metin en fazla ${SINIRLAR.kisaMetinEnUzun} karakter olabilir.`;
  if (!r.gorsel_url) h.gorsel_url = 'Bir görsel yükleyin.';
  else if (!gorselAdresiGecerli(r.gorsel_url)) h.gorsel_url = 'Görseli "Dosya seç" ile yükleyin (yalnızca sitenin kendi deposundaki görseller kabul edilir).';
  if (r.baglanti_url && !baglantiGecerli(r.baglanti_url)) {
    h.baglanti_url = /^http:\/\//i.test(r.baglanti_url)
      ? 'Güvenli adres girin: http:// yerine https:// olmalı.'
      : 'Bağlantı geçersiz. Yalnızca https:// adresleri ya da WhatsApp bağlantısı kabul edilir.';
  }
  if (!ALANLAR[r.alan]) h.alan = 'Reklam alanını seçin.';
  if (r.mac_id != null && r.mac_id !== '' && r.alan !== 'mac_sponsoru') h.mac_id = 'Maç yalnızca "Maç sponsoru" alanında seçilebilir.';
  const b = r.baslangic ? ms(r.baslangic) : NaN;
  const e = r.bitis ? ms(r.bitis) : NaN;
  if (Number.isNaN(b)) h.baslangic = 'Başlangıç tarihini girin.';
  if (Number.isNaN(e)) h.bitis = 'Bitiş tarihini girin.';
  else if (!Number.isNaN(b) && e <= b) h.bitis = 'Bitiş, başlangıçtan sonra olmalı.';
  else if (yayinaAliniyor && e <= ms(simdi)) h.bitis = 'Bitiş tarihi geçmiş bir reklam yayına alınamaz.';
  const o = Number(r.oncelik);
  if (!Number.isInteger(o) || o < SINIRLAR.oncelikEnAz || o > SINIRLAR.oncelikEnCok) h.oncelik = `Öncelik ${SINIRLAR.oncelikEnAz} ile ${SINIRLAR.oncelikEnCok} arasında tam sayı olmalı.`;
  return h;
}

// ---------------------------------------------------------------------------
// Rapor ve CSV (Türkçe Excel: UTF-8 BOM, noktalı virgül, ondalık virgül)
// ---------------------------------------------------------------------------
const ORAN_BICIMI = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Tıklama oranı yüzdesi (2 basamak) ya da gösterim yoksa null. */
export function tiklamaOrani(gosterim, tiklama) {
  const g = Number(gosterim) || 0;
  if (g <= 0) return null;
  return Math.round(((Number(tiklama) || 0) * 10000) / g) / 100;
}

/** Oranı Türkçe yazar: 2.5 -> "2,50". null -> "". */
export function oranBicimle(oran) {
  if (oran == null || oran === '' || Number.isNaN(Number(oran))) return '';
  return ORAN_BICIMI.format(Number(oran));
}

function csvHucre(v, metinMi) {
  let s = v == null ? '' : String(v);
  // Excel formül enjeksiyonuna karşı: metin hücresi = + - @ ile başlıyorsa önüne ' koy
  if (metinMi && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/** reklam_raporu satırlarından Excel'de düzgün açılan CSV metni (BOM dahil). */
export function raporCsv(satirlar) {
  const basliklar = ['Firma', 'Alan', 'Gösterim', 'Tıklama', 'Tıklama oranı (%)'];
  const satir = [basliklar.map((b) => csvHucre(b, true)).join(';')];
  for (const s of satirlar || []) {
    const oran = s.tiklama_orani != null ? Number(s.tiklama_orani) : tiklamaOrani(s.gosterim, s.tiklama);
    satir.push([
      csvHucre(s.firma_adi, true),
      csvHucre(ALANLAR[s.alan] || s.alan, true),
      csvHucre(Number(s.gosterim) || 0, false),
      csvHucre(Number(s.tiklama) || 0, false),
      csvHucre(oranBicimle(oran), false),
    ].join(';'));
  }
  return '﻿' + satir.join('\r\n') + '\r\n';
}

/**
 * Sekme kimliği: SADECE tıklama tekrarını (aynı reklama 30 dk içinde tekrar tıklama) sayfalar arasında yakalamak için.
 * Rastgele bir uuid; kişisel veri değildir, kimseyle eşleştirilemez. sessionStorage'da durur: yalnız bu sekmeye aittir,
 * sekme kapanınca tarayıcı siler (localStorage/çerez YOK). sessionStorage kapalıysa (gizli mod, engelli depolama)
 * bellekte tutulur, yani sayfa yüklemesiyle sınırlı kalır. Gösterimler bu kimliği KULLANMAZ (sayfa ziyareti başına).
 */
export const SEKME_ANAHTARI = 'reklam-sekme-kimligi';
const KIMLIK_DESENI = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function sekmeKimligi(depo, c = globalThis.crypto) {
  let d = depo;
  try { if (d === undefined) d = globalThis.sessionStorage; } catch { d = null; }
  try {
    const eski = d && d.getItem(SEKME_ANAHTARI);
    if (eski && KIMLIK_DESENI.test(eski)) return eski;
    const yeni = yeniZiyaretKimligi(c);
    if (d) d.setItem(SEKME_ANAHTARI, yeni);
    return yeni;
  } catch {
    return yeniZiyaretKimligi(c);
  }
}

/** Sayfa ziyareti kimliği (her sayfa yüklemesinde yeni; bellekte tutulur). */
export function yeniZiyaretKimligi(c = globalThis.crypto) {
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
