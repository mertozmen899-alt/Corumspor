// Uygulamanın saf kuralları (DOM yok, ağ yok). Tarayıcıda, sahte istemcide (testler/sahte-supabase.js) ve Node'da aynı dosya.
// Buradaki kurallar veritabanındakilerin AYNASIDIR (supabase/migrations/012_denetim_2.sql + 013_tasarim.sql + 014_inceleme_2.sql + 015_son_tur.sql). Birini değiştirirseniz ötekini de
// değiştirin; testler/kurallar-ornekleri.json iki tarafta da denenir (testler/uygulama.test.mjs, testler/reklam/sql.test.mjs).
// Asıl koruma sunucudadır; buradaki denetimler kullanıcıya erken ve Türkçe uyarı vermek içindir.
// 015: uygulama sahibinin adı (ayar.js SAHIP_ADI) kullanıcı adı olarak ayrılmıştır (SQL: ayrilmis_adlar tablosu, README "Künye").
import { SAHIP_ADI } from './ayar.js';

// Yorum sınırları (SQL: yorum_ekleme_kontrol, yorum_duzenleme_hakki, yorum_guncelleme_kontrol)
export const YORUM_SINIRLARI = Object.freeze({
  enUzun: 1000,               // karakter
  dakikada: 5,                // bir dakikada en fazla 5 yorum
  gunde: 50,                  // son 24 saatte en fazla 50 yorum (hesap başına)
  tekrarDakika: 10,           // aynı metin 10 dakika içinde tekrar yazılamaz
  duzenlemeDakikada: 10,      // dakikada en fazla 10 düzenleme
  duzenlemeSuresiDakika: 30,  // yorum yalnız yazıldıktan sonraki 30 dakika içinde düzenlenebilir (yönetici muaf)
});

// Şikâyet sınırları (SQL: sikayet_hakki, sikayet_otomatik_gizle; 015)
export const SIKAYET_SINIRLARI = Object.freeze({
  saatte: 10,                 // bir hesap saatte en fazla 10 şikâyet
  gunde: 30,                  // son 24 saatte en fazla 30 şikâyet
  otomatikGizlemeEsigi: 3,    // farklı 3 hesaptan şikâyet → yorum kendiliğinden gizlenir (yönetici yorumu hariç)
  hesapYasiSaat: 24,          // yalnız şikâyet anında en az 24 saatlik hesapların şikâyeti sayılır
});

/** Aynı metin mi (baştaki/sondaki boşluk, art arda boşluk ve büyük/küçük harf yok sayılır; SQL ile aynı). */
export function yorumMetniAyni(a, b) {
  const n = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  return n(a) === n(b);
}

// ---------------------------------------------------------------------------
// Ortak metin katlama (SQL: metin_katla, 014). Yerel ayardan bağımsız: harfler açıkça çevrilir.
// Türkçe küçük harf + İ/I/ı/i → i, Ç → c, Ğ → g, Ö → o, Ş → s, Ü → u, Â/Î/Û → a/i/u. Başka harflere dokunmaz.
// ---------------------------------------------------------------------------
const KATLA_KAYNAK = 'ABCDEFGHIJKLMNOPQRSTUVWXYZÇĞİÖŞÜÂÎÛçğıöşüâîû';
const KATLA_HEDEF = 'abcdefghijklmnopqrstuvwxyzcgiosuaiucgiosuaiu';
const KATLA = new Map([...KATLA_KAYNAK].map((c, i) => [c, KATLA_HEDEF[i]]));
const cevir = (s, kaynak, hedef) => [...s].map((c) => { const i = kaynak.indexOf(c); return i < 0 ? c : hedef[i]; }).join('');
export function metinKatla(s) { return [...String(s ?? '')].map((c) => KATLA.get(c) ?? c).join(''); }

// ---------------------------------------------------------------------------
// Kullanıcı adı (SQL: kullanici_adi_ayrilmis, yeni_kullanici, profil_koruma)
// ---------------------------------------------------------------------------
export const KULLANICI_ADI_DESENI = /^[A-Za-z0-9_.çğıöşüÇĞİÖŞÜ]{3,24}$/;
// İçinde geçmesi yeten kökler ve tam eşleşmesi gerekenler (SQL'deki listeyle AYNI)
// 013: baskan, corumspor (kök), teknikdirektor, kaptan, antrenor; 014: kirmizisimsek (taraftar grubu lakabı) ve rakam benzerleri
// 015: cfk (ÇFK, C_F_K: kulüp kısaltması)
const AYRILMIS_KOK = /(admin|yonetici|yonetim|moderator|resmi|corumfk|corumspor|kulup|yetkili|baskan|teknikdirektor|kirmizisimsek|cfk)/;
const AYRILMIS_TAM = ['destek', 'mod', 'sistem', 'corumsportaraftar', 'support', 'official', 'root', 'kaptan', 'antrenor'];

/** Ek ayrılmış adın anahtarı (SQL: ayrilmis_ad_anahtari): parantez içi atılır, katlanır, yalnız harf. "Mert (uygulama sahibi)" → "mert". */
export function sahipAnahtari(ad) { return metinKatla(String(ad ?? '').replace(/\([^)]*\)/g, '')).replace(/[^a-z]/g, ''); }
/** Uygulama sahibinin adı (ayar.js SAHIP_ADI) ve ilk adı ("Mert Özmen" → mertozmen, mert); 3 harften kısaysa yok.
 *  SQL'de ikisi de ayrilmis_adlar tablosundadır (README 2. bölüm, 015 adımı). */
export const SAHIP_ANAHTARLARI = Object.freeze([...new Set([sahipAnahtari(SAHIP_ADI), sahipAnahtari(String(SAHIP_ADI ?? '').trim().split(/\s+/)[0])])]
  .filter((k) => /^[a-z]{3,40}$/.test(k)));

/** Yanıltıcı / ayrılmış ad mı (yönetici, admin, resmî, kulüp, Çorum FK, destek…)? Harf büyüklüğü, Türkçe harf, _ ve . fark etmez;
 *  rakam/simge benzerleri de yakalanır. Denenen biçimler (SQL kullanici_adi_ayrilmis ile AYNI, 015):
 *  taban = katlanmış ad ve sondaki rakam/_/. atılmış hâli; her tabanda 8 → at | ate | b, sonra (a) 0→o 1→i 3→e 4→a 5→s 7→t @→a,
 *  (b) aynısı ama 1→l, (d) rakamlar silinmiş; hepsine ayrıca l→i ve rn→m. Kök listede geçerse ya da tam liste / ek adlar
 *  (uygulama sahibi) birebir tutarsa ayrılmıştır. */
export function kullaniciAdiAyrilmis(ad, ekAnahtarlar = SAHIP_ANAHTARLARI) {
  const v = metinKatla(ad);
  const harf = (x) => x.replace(/[^a-z]/g, '');
  let adaylar = [];
  for (const taban of [v, v.replace(/[0-9_.]+$/, '')]) {
    for (const e of ['at', 'ate', 'b']) {
      const x = taban.split('8').join(e);
      adaylar.push(harf(cevir(x, '013457@', 'oieasta')), harf(cevir(x, '013457@', 'oleasta')));
    }
    adaylar.push(harf(taban));
  }
  adaylar = adaylar.concat(adaylar.map((x) => cevir(x, 'l', 'i')));
  adaylar = adaylar.concat(adaylar.map((x) => x.split('rn').join('m')));
  return adaylar.some((x) => AYRILMIS_KOK.test(x) || AYRILMIS_TAM.includes(x) || (ekAnahtarlar || []).includes(x));
}
/** Kullanıcı adı en fazla 7 günde bir değiştirilebilir (SQL: profil_koruma, profiles.ad_degisti; 015). */
export const AD_DEGISTIRME_GUN = 7;

/** Kayıt formu için: geçerliyse null, değilse Türkçe hata metni. */
export function kullaniciAdiHatasi(ad) {
  if (!KULLANICI_ADI_DESENI.test(String(ad ?? ''))) return 'Kullanıcı adı 3-24 karakter olmalı; sadece harf, rakam, alt çizgi ve nokta.';
  if (kullaniciAdiAyrilmis(ad)) return 'Bu kullanıcı adı kullanılamaz: yönetici, resmî hesap ya da kulüp gibi görünen adlar ayrılmıştır. Başka bir ad seçin.';
  return null;
}

// ---------------------------------------------------------------------------
// Haber kapağı (SQL: haber_kapak_gecerli + haberler_kapak_kaynagi kısıtı)
// Yalnız projenin kendi deposu (haber-gorselleri kovası) ya da sitenin assets/img/ klasörü (örnek görseller).
// Başka sitedeki görsel ziyaretçinin IP adresini o siteye götürür (izleme pikseli) ve sonradan değiştirilebilir.
// Supabase'e kendi alan adınızı bağladıysanız SQL ile birlikte güncelleyin.
// ---------------------------------------------------------------------------
const KAPAK_YEREL = /^assets\/img\/[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)*\.(svg|png|jpe?g|webp)$/;
const KAPAK_DEPO = /^https:\/\/[a-z0-9][a-z0-9-]{0,62}\.supabase\.co\/storage\/v1\/object\/public\/haber-gorselleri\/[A-Za-z0-9._~/-]+$/i;
const KONTROL_KARAKTERI = /[\u0001- \u007f-\u009f]/;

/** Haber kapak adresi geçerli mi? null (kapak yok) geçerlidir. */
export function kapakAdresiGecerli(url) {
  if (url === null || url === undefined) return true;
  if (typeof url !== 'string' || url.length > 2000 || KONTROL_KARAKTERI.test(url) || url.includes('..')) return false;
  return KAPAK_YEREL.test(url) || KAPAK_DEPO.test(url);
}

// ---------------------------------------------------------------------------
// Profil fotoğrafı (SQL: profil_foto_gecerli, 017). YALNIZ projenin profil-fotograflari kovasında kişinin kendi klasörü
// (<kullanıcı id>/<ad>.webp|jpg|jpeg|png). null (fotoğraf yok) geçerlidir; id yoksa adres geçersizdir.
// ---------------------------------------------------------------------------
export const PROFIL_FOTO_KOVASI = 'profil-fotograflari';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function profilFotoGecerli(url, id) {
  if (url === null || url === undefined) return true;
  if (typeof url !== 'string' || typeof id !== 'string' || !UUID.test(id)) return false;
  if (url.length > 500 || url.includes('..') || KONTROL_KARAKTERI.test(url)) return false;
  return new RegExp(`^https://[a-z0-9][a-z0-9-]{0,62}\\.supabase\\.co/storage/v1/object/public/${PROFIL_FOTO_KOVASI}/${id.toLowerCase()}/[A-Za-z0-9_-]+\\.(webp|jpe?g|png)$`, 'i').test(url);
}

// ---------------------------------------------------------------------------
// Gol arşivi sezonu (013): futbol sezonu Temmuz-Haziran. Maç tarihi Türkiye saatine göre: Temmuz 2026 – Haziran 2027 = "2026-27".
// ---------------------------------------------------------------------------
export function sezonAdi(iso) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return null;
  const p = {};
  for (const x of new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit' }).formatToParts(d)) p[x.type] = x.value;
  const yil = Number(p.year), ay = Number(p.month);
  const bas = ay >= 7 ? yil : yil - 1;
  return `${bas}-${String((bas + 1) % 100).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Sakatlık kaydı (SQL: sakatliklar kısıtları, 013). Kaynak ZORUNLU: yalnız kulübün açıkladığı bilgi (KVKK m.6, sağlık verisi).
// ---------------------------------------------------------------------------
// 014: 'belirsiz' (eski adıyla "Şüpheli") sitede "Durumu belirsiz"; Sakat ve Durumu belirsiz kaydında kaynak BAĞLANTISI da zorunlu;
// aciklama yalnız yöneticinin iç notu (ziyaretçi okuyamaz; tanı yazılmaz).
export const SAKATLIK_DURUMLARI = Object.freeze({ sakat: 'Sakat', cezali: 'Cezalı', belirsiz: 'Durumu belirsiz', dondu: 'Döndü' });
export const SAKATLIK_BAGLANTI_ZORUNLU = Object.freeze(['sakat', 'belirsiz']);
const KAYNAK_URL = /^https:\/\/[a-z0-9.-]+\.[a-z]{2,63}(\/[^\s"<>]*)?$/i;
/** Kaynak bağlantısı (haber ve sakatlık; SQL: haberler_kaynak_url, sakatliklar.kaynak_url). Boş geçerlidir. */
export function kaynakBaglantisiGecerli(url) { return url == null || url === '' || (KAYNAK_URL.test(url) && url.length <= 500); }
/** Hata yoksa boş nesne; varsa alan → Türkçe mesaj. */
export function sakatlikHatalari(s) {
  const h = {};
  if (!s.oyuncu_id) h.oyuncu_id = 'Oyuncuyu seçin.';
  if (!SAKATLIK_DURUMLARI[s.durum]) h.durum = 'Durumu seçin.';
  const k = String(s.kaynak ?? '').trim();
  if (k.length < 3 || k.length > 120) h.kaynak = 'Kaynak zorunlu (3-120 karakter): ör. "Kulüp açıklaması". Söylenti girilmez.';
  if (s.aciklama && String(s.aciklama).length > 200) h.aciklama = 'Açıklama en fazla 200 karakter olabilir.';
  if (s.kaynak_url && !kaynakBaglantisiGecerli(s.kaynak_url)) h.kaynak_url = 'Kaynak bağlantısı https:// ile başlamalı.';
  else if (!s.kaynak_url && SAKATLIK_BAGLANTI_ZORUNLU.includes(s.durum)) h.kaynak_url = 'Sakat ve Durumu belirsiz kaydında kaynak bağlantısı zorunlu (kulübün açıklamasının adresi).';
  if (s.kaynak_tarihi && !/^\d{4}-\d{2}-\d{2}$/.test(s.kaynak_tarihi)) h.kaynak_tarihi = 'Kaynak tarihini seçin.';
  return h;
}

// ---------------------------------------------------------------------------
// Haber kaynağı ve düzeltme (SQL: haberler_kaynak, haberler_kaynak_url, haberler_duzeltme_notu, haberler_kapak_alt; 014)
// ---------------------------------------------------------------------------
// 015: kaynak_gerekli (kadro / transfer / sakatlık / bilet haberi) işaretliyse kaynak zorunlu (SQL: haber_kaynak_kontrol + haberler_kaynak_gerekli)
export function haberHatalari(x) {
  const h = {};
  const k = String(x.kaynak ?? '').trim();
  if (k && (k.length < 2 || k.length > 120)) h.kaynak = 'Kaynak 2-120 karakter olmalı (ör. "Kulüp açıklaması").';
  else if (!k && x.kaynak_gerekli) h.kaynak = 'Kadro, transfer, sakatlık ya da bilet haberinde kaynak zorunlu (ör. "Kulüp açıklaması").';
  if (x.kaynak_url && !kaynakBaglantisiGecerli(x.kaynak_url)) h.kaynak_url = 'Kaynak bağlantısı https:// ile başlamalı.';
  const d = String(x.duzeltme_notu ?? '').trim();
  if (d && (d.length < 3 || d.length > 500)) h.duzeltme_notu = 'Düzeltme notu 3-500 karakter olmalı.';
  if (x.kapak_alt && String(x.kapak_alt).length > 200) h.kapak_alt = 'Kapak açıklaması en fazla 200 karakter olabilir.';
  return h;
}

// ---------------------------------------------------------------------------
// Gol videosu (SQL: gol_video_gecerli, gol_altyazi_gecerli; 014). YouTube ya da sitenin deposundaki .mp4 (gol-videolari);
// altyazı yalnız aynı kovada .vtt. Başka sitedeki dosya ziyaretçinin IP'sini oraya götürür ve hak sahibi belirsizdir.
// ---------------------------------------------------------------------------
const YOUTUBE = /^https:\/\/(www\.|m\.)?(youtube\.com|youtube-nocookie\.com|youtu\.be)\/[^\s"<>]+$/;
const DEPO_MP4 = /^https:\/\/[a-z0-9][a-z0-9-]{0,62}\.supabase\.co\/storage\/v1\/object\/public\/gol-videolari\/[A-Za-z0-9._~/-]+\.mp4$/i;
const DEPO_VTT = /^https:\/\/[a-z0-9][a-z0-9-]{0,62}\.supabase\.co\/storage\/v1\/object\/public\/gol-videolari\/[A-Za-z0-9._~/-]+\.vtt$/i;
const guvenliAdres = (u) => typeof u === 'string' && u.length <= 2000 && !KONTROL_KARAKTERI.test(u) && !u.includes('..');
export function golVideoGecerli(url) { return url == null || (guvenliAdres(url) && (YOUTUBE.test(url) || DEPO_MP4.test(url))); }
export function altyaziAdresiGecerli(url) { return url == null || (guvenliAdres(url) && DEPO_VTT.test(url)); }
export const GOL_VIDEO_KOVASI = 'gol-videolari';

// ---------------------------------------------------------------------------
// Yorum moderasyonu (SQL: yorum_katla, yorum_onay_gerekli; 014). Yöneticinin kelime listesindeki bir kelimeyle BAŞLAYAN
// sözcük varsa yorum onay bekler. Karşılaştırma: katla + rakam/simge benzerleri (0→o 1→i 3→e 4→a 5→s 7→t @→a $→s), harf dışı → boşluk.
// ---------------------------------------------------------------------------
export function yorumKatla(s) { return cevir(metinKatla(s), '013457@$', 'oieastas').replace(/[^a-z]+/g, ' ').trim(); }
/** 015 (SQL: yorum_sikistir): harf ve boşluk dışı karakterler ARA BIRAKMADAN atılır, tek harfli sözcük dizileri birleşir:
 *  "s.a.l.a.k" → "salak", "s a l a k" → "salak". 4+ harfli liste kelimeleri bu kopyada da (sözcük başında) aranır. */
export function yorumSikistir(s) {
  return cevir(metinKatla(s), '013457@$', 'oieastas').replace(/[^a-z\s]+/g, '').replace(/\s+/g, ' ').trim()
    .replace(/(?<![a-z])([a-z]) (?=[a-z](?![a-z]))/g, '$1');
}
/** Listeye girecek kelimenin saklanan biçimi (SQL tetikleyicisi yorum_kelimeleri_katla); geçersizse null. */
export function kelimeBicimi(k) { const v = yorumKatla(k).replace(/ /g, ''); return /^[a-z]{3,40}$/.test(v) ? v : null; }
export function kelimeEslesir(metin, liste) {
  const v = ' ' + yorumKatla(metin);
  const s = ' ' + yorumSikistir(metin);
  return (liste || []).some((k) => { const b = kelimeBicimi(k); return !!b && (v.includes(' ' + b) || (b.length >= 4 && s.includes(' ' + b))); });
}
/** Maçın ön onay penceresi: maçtan 2 saat önce → 24 saat sonra (SQL ile aynı). */
export const ON_ONAY = Object.freeze({ onceSaat: 2, sonraSaat: 24 });
export function onOnayPenceresinde(macTarihi, simdi = Date.now()) {
  const t = Date.parse(macTarihi);
  return !Number.isNaN(t) && simdi >= t - ON_ONAY.onceSaat * 3600e3 && simdi < t + ON_ONAY.sonraSaat * 3600e3;
}

// ---------------------------------------------------------------------------
// 018: gol anı, asist ve oyuncu istatistikleri (SQL: goller_asist, goller_video_aralik, mac_oyunculari)
// ---------------------------------------------------------------------------
export const VIDEO_ARALIK_SINIRI = 21600; // sn (6 saat)
/** Panel gol formu: asist ve video aralığı hataları (Türkçe). bas/bit: sayı ya da null. */
export function golAniHatalari({ asist = null, video_url = null, video_baslangic_sn: bas = null, video_bitis_sn: bit = null } = {}) {
  const h = [];
  const a = typeof asist === 'string' ? asist.trim() : '';
  if (a && (a.length < 2 || a.length > 80)) h.push('Asist yapan oyuncunun adı 2-80 karakter olmalı.');
  if ((bas == null) !== (bit == null)) h.push('Video başlangıç ve bitiş saniyesini birlikte yaz (ya da ikisini de boş bırak).');
  else if (bas != null) {
    const gecerli = (x) => Number.isInteger(x) && x >= 0 && x <= VIDEO_ARALIK_SINIRI;
    if (!gecerli(bas) || !gecerli(bit)) h.push(`Video saniyeleri 0-${VIDEO_ARALIK_SINIRI} arasında tam sayı olmalı.`);
    else if (bit <= bas) h.push('Video bitişi başlangıçtan sonra olmalı.');
    if (!video_url || !YOUTUBE.test(video_url)) h.push('Video aralığı yalnız YouTube videosunda kullanılır.');
  }
  return h;
}
/** Oyuncu adı eşleştirme anahtarı: Türkçe harf (metinKatla), aksan (ć, é, ú…), büyük/küçük harf ve boşluk farkı yok sayılır. */
export function oyuncuAnahtari(ad) {
  return metinKatla(String(ad ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC')).toLowerCase().replace(/\s+/g, ' ').trim();
}
export const MAC_SURESI = 90; // uzatmalar sayılmaz
/** Maç kadrosu satırından oynanan dakika: ilk 11 → çıkış (yoksa 90); yedek → çıkış (yoksa 90) − giriş; girmeyen yedek → 0. */
export function oynamaDakikasi({ ilk11 = false, giris_dk = null, cikis_dk = null } = {}) {
  const bas = ilk11 ? 0 : giris_dk;
  if (bas == null) return 0;
  return Math.max(0, Math.min(cikis_dk ?? MAC_SURESI, MAC_SURESI) - Math.min(bas, MAC_SURESI));
}
/** Satır maça çıkmış mı (ilk 11 ya da oyuna girmiş). */
export const macaCikti = (s) => !!(s && (s.ilk11 || s.giris_dk != null));
/** Oyuncunun sezon özeti. kadro: mac_oyunculari satırları, goller: { oyuncu, asist } satırları (hepsi aynı sezondan). */
export function oyuncuOzeti(ad, kadro = [], goller = []) {
  const k = oyuncuAnahtari(ad);
  const benim = kadro.filter((s) => oyuncuAnahtari(s.oyuncu) === k && macaCikti(s));
  const gol = goller.filter((g) => oyuncuAnahtari(g.oyuncu) === k).length;
  const asist = goller.filter((g) => g.asist && oyuncuAnahtari(g.asist) === k).length;
  return {
    mac: benim.length, ilk11: benim.filter((s) => s.ilk11).length, dakika: benim.reduce((t, s) => t + oynamaDakikasi(s), 0),
    gol, asist, katki: gol + asist, sari: benim.reduce((t, s) => t + (s.sari || 0), 0), kirmizi: benim.filter((s) => s.kirmizi).length,
  };
}
/**
 * Maç sayfası olay çizelgesi. goller: Çorum FK golleri ({ dakika, ek_dakika, ... }), kadro: o maçın mac_oyunculari satırları,
 * rakipGoller: 019 rakip_goller satırları ({ dakika, ek_dakika, oyuncu, penalti, kendi_kalesine }). Her olayda taraf: 'biz' | 'rakip'.
 * Dakika sırasıyla: gol, kırmızı kart (dakikası = çıkış dakikası, 018), oyuncu değişikliği (aynı dakikada çıkan ↔ giren eşlenir;
 * eşi yoksa tek başına). Rakibin kart / değişiklik verisi yok (yalnız golleri). Sarı kartın dakikası kaynakta yok: ayrı "kartlar".
 */
export function macOlaylari(goller = [], kadro = [], rakipGoller = []) {
  const olaylar = goller.map((g) => ({ tur: 'gol', taraf: 'biz', dakika: g.dakika, ek: g.ek_dakika || 0, gol: g }));
  for (const g of rakipGoller) olaylar.push({ tur: 'rakip_gol', taraf: 'rakip', dakika: g.dakika, ek: g.ek_dakika || 0, gol: g });
  const girenler = new Map(), cikanlar = new Map();
  const ekle = (m, dk, ad) => m.set(dk, [...(m.get(dk) || []), ad]);
  for (const s of kadro) {
    if (s.giris_dk != null) ekle(girenler, s.giris_dk, s.oyuncu);
    if (s.cikis_dk == null || !macaCikti(s)) continue;
    if (s.kirmizi) olaylar.push({ tur: 'kirmizi', taraf: 'biz', dakika: s.cikis_dk, ek: 0, oyuncu: s.oyuncu });
    else ekle(cikanlar, s.cikis_dk, s.oyuncu);
  }
  const ada = (a, b) => a.localeCompare(b, 'tr');
  for (const dk of new Set([...girenler.keys(), ...cikanlar.keys()])) {
    const g = (girenler.get(dk) || []).sort(ada), c = (cikanlar.get(dk) || []).sort(ada);
    for (let i = 0; i < Math.max(g.length, c.length); i++) olaylar.push({ tur: 'degisiklik', taraf: 'biz', dakika: dk, ek: 0, giren: g[i] || null, cikan: c[i] || null });
  }
  const SIRA = { gol: 0, rakip_gol: 0, kirmizi: 1, degisiklik: 2 };
  olaylar.sort((a, b) => a.dakika - b.dakika || a.ek - b.ek || SIRA[a.tur] - SIRA[b.tur]);
  const kartlar = kadro.filter((s) => s.sari > 0 || (s.kirmizi && s.cikis_dk == null))
    .map((s) => ({ oyuncu: s.oyuncu, sari: s.sari || 0, kirmizi: !!s.kirmizi && s.cikis_dk == null })).sort((a, b) => ada(a.oyuncu, b.oyuncu));
  return { olaylar, kartlar };
}

// ---------------------------------------------------------------------------
// 019: piyasa değeri (SQL: oyuncular_piyasa_degeri, oyuncu_piyasa_kontrol) ve rakip golleri (rakip_goller)
// ---------------------------------------------------------------------------
export const PIYASA_DEGERI_SINIRI = 500000000; // €
/** Oyuncu sayfasındaki biçim (tr-TR, Transfermarkt'la aynı birimler): 3000000 → "3,00 Mn €", 800000 → "800 Bin €". Değer yoksa null. */
export function piyasaDegeriMetni(eur) {
  if (!Number.isInteger(eur) || eur < 0) return null;
  const sayi = (n, k) => n.toLocaleString('tr-TR', { minimumFractionDigits: k, maximumFractionDigits: k });
  if (eur >= 1e6) return `${sayi(eur / 1e6, 2)} Mn €`;
  if (eur >= 1e3) return `${sayi(Math.round(eur / 1e3), 0)} Bin €`;
  return `${sayi(eur, 0)} €`;
}
/** Panel kadro formu: piyasa değeri hataları (Türkçe). eur: tam sayı ya da null; tarih 'YYYY-AA-GG' ya da null. */
export function piyasaDegeriHatalari({ piyasa_degeri_eur: eur = null, piyasa_degeri_tarih: tarih = null, piyasa_degeri_kaynak: kaynak = null } = {}) {
  const h = [];
  const k = typeof kaynak === 'string' ? kaynak.trim() : '';
  if (eur != null && !(Number.isInteger(eur) && eur >= 0 && eur <= PIYASA_DEGERI_SINIRI)) h.push('Piyasa değeri 0 ile 500 milyon € arasında tam sayı olmalı.');
  if (k && (k.length < 2 || k.length > 80)) h.push('Kaynak 2-80 karakter olmalı.');
  if (eur != null && (!tarih || !k)) h.push('Piyasa değeri girildiyse tarihini ve kaynağını da yaz.');
  return h;
}
/** Panel rakip golü formu (SQL: rakip_goller_dakika, rakip_goller_oyuncu, rakip_goller_tur). */
export function rakipGolHatalari({ dakika = null, ek_dakika: ek = null, oyuncu = '', penalti = false, kendi_kalesine: kk = false } = {}) {
  const h = [];
  const ad = String(oyuncu ?? '').trim();
  if (!(Number.isInteger(dakika) && dakika >= 1 && dakika <= 130)) h.push('Dakika 1-130 arasında olmalı.');
  if (ek != null && !(Number.isInteger(ek) && ek >= 1 && ek <= 20)) h.push('Uzatma dakikası 1-20 arasında olmalı.');
  if (ad.length < 2 || ad.length > 80) h.push('Golü atanın adı 2-80 karakter olmalı.');
  if (penalti && kk) h.push('Gol hem penaltı hem kendi kalesine olamaz.');
  return h;
}

// ---------------------------------------------------------------------------
// 020: maç günü (SQL: 020_mac_gunu.sql). Form, rakiple bu sezon, diziliş, tahmin / oy pencereleri, puan durumu.
// ---------------------------------------------------------------------------
/** Lig maçı mı: organizasyon boşsa lig sayılır; kupa / hazırlık / özel / dostluk maçı değil. */
export function ligMaciMi(mac) {
  return !/kupa|hazirlik|ozel|dostluk/.test(metinKatla(String((mac && mac.organizasyon) || '')).toLowerCase());
}
/** Biten maçın sonucu harfi (Çorum FK'ya göre): 'G' | 'B' | 'M' ya da null. */
export function sonucHarfi(m) {
  if (!m || m.durum !== 'bitti' || !Number.isInteger(m.corum_skor) || !Number.isInteger(m.rakip_skor)) return null;
  return m.corum_skor > m.rakip_skor ? 'G' : m.corum_skor < m.rakip_skor ? 'M' : 'B';
}
/** Son n lig maçının sonucu, ESKİDEN YENİYE (formun sağı en son maç). maclar: herhangi sırada; yalnız biten lig maçları sayılır. */
export function formDizisi(maclar = [], n = 5) {
  return maclar.filter((m) => sonucHarfi(m) && ligMaciMi(m)).sort((a, b) => Date.parse(b.tarih) - Date.parse(a.tarih))
    .slice(0, n).reverse().map((m) => ({ harf: sonucHarfi(m), mac: m }));
}
/** Bu sezon aynı rakiple oynanmış (biten) maçlar, eskiden yeniye. haricId: maçın kendisi listeye girmez. */
export function rakipleSezon(maclar = [], rakip, sezon, haricId = null) {
  const k = oyuncuAnahtari(rakip);
  return maclar.filter((m) => m.id !== haricId && sonucHarfi(m) && oyuncuAnahtari(m.rakip) === k && sezonAdi(m.tarih) === sezon)
    .sort((a, b) => Date.parse(a.tarih) - Date.parse(b.tarih));
}

export const DIZILIS_DESENI = /^\d(-\d){2,4}$/;
/** Panel / SQL mac_gunu_kontrol aynası: '4-2-3-1' gibi (3-5 sayı), toplam 10 (kaleci hariç). Hata metni ya da null. */
export function dizilisHatasi(d) {
  if (d == null || d === '') return null;
  const s = String(d).replace(/\s+/g, '');
  if (!DIZILIS_DESENI.test(s)) return 'Dizilişi "4-2-3-1" gibi yazın (3-5 sayı, aralarında tire).';
  return s.split('-').reduce((t, x) => t + Number(x), 0) === 10 ? null : 'Dizilişteki sayıların toplamı 10 olmalı (kaleci hariç).';
}
/**
 * Sahadaki satırlar: [[kaleci], [defans…], …, [forvet…]] (geriden öne, her satır soldan sağa). Yalnız diziliş geçerliyse ve ilk 11'in
 * 11 oyuncusunun her birinin 1-11 arasında FARKLI dizilis_sira'sı varsa; yoksa null (sayfa düz listeyi gösterir).
 */
export function dizilisSatirlari(dizilis, kadro = []) {
  if (!dizilis || dizilisHatasi(dizilis)) return null;
  const ilk = kadro.filter((s) => s.ilk11);
  const sira = new Map(ilk.map((s) => [s.dizilis_sira, s]));
  if (ilk.length !== 11 || sira.size !== 11 || ![...sira.keys()].every((x) => Number.isInteger(x) && x >= 1 && x <= 11)) return null;
  const satirlar = [[sira.get(1)]];
  let n = 2;
  for (const adet of String(dizilis).replace(/\s+/g, '').split('-').map(Number)) {
    satirlar.push(Array.from({ length: adet }, (_, i) => sira.get(n + i)));
    n += adet;
  }
  return satirlar;
}

export const TAHMIN_SINIRI = 20; // SQL skor_tahminleri_skor
/** Tahmine açık mı (SQL tahmin_acik): planlanmış ve başlama saati gelmemiş. */
export function tahminAcik(mac, simdi = Date.now()) {
  return !!mac && mac.durum === 'planlandi' && Date.parse(mac.tarih) > simdi;
}
export const OY_PENCERESI = Object.freeze({ bitisSaat: 2, sureSaat: 48 }); // SQL oy_penceresi_acik: tarih + 50 saat
/** Maçın oyuncusu oylaması: 'once' (maç bitmedi), 'acik', 'kapandi'. */
export function oyDurumu(mac, simdi = Date.now()) {
  if (!mac || mac.durum !== 'bitti') return 'once';
  return simdi <= Date.parse(mac.tarih) + (OY_PENCERESI.bitisSaat + OY_PENCERESI.sureSaat) * 3600e3 ? 'acik' : 'kapandi';
}
/** Oylamanın kapanış anı (ISO). */
export function oyKapanisi(mac) {
  return new Date(Date.parse(mac.tarih) + (OY_PENCERESI.bitisSaat + OY_PENCERESI.sureSaat) * 3600e3).toISOString();
}

/** Puan tablosunda Çorum FK satırı mı ("Çorum FK", "ÇORUM FUTBOL KULÜBÜ", "Corum FK"…). */
export function bizMiyiz(takim) { return /\bcorum\b/.test(metinKatla(String(takim || '')).toLowerCase()); }
/** Mini tablo: Çorum FK'nın çevresindeki n satır (başta/sonda kayar). Çorum FK yoksa ilk n satır. satirlar sira'ya göre sıralı olmalı. */
export function puanCevresi(satirlar = [], n = 5) {
  const i = satirlar.findIndex((s) => bizMiyiz(s.takim));
  if (i < 0) return satirlar.slice(0, n);
  const bas = Math.max(0, Math.min(i - Math.floor(n / 2), satirlar.length - n));
  return satirlar.slice(bas, bas + n);
}
/**
 * Panel: yapıştırılan puan tablosu. Her satır: sıra, takım adı, sonra sayılar O G B M A Y [AV] P (sekme, ; | ya da boşlukla;
 * "19:7" gibi atılan:yenen de olur). Döner: { satirlar: [{ sira, takim, oynanan, galibiyet, beraberlik, maglubiyet, atilan, yenen, puan }], hatalar: [] }.
 */
export function puanTablosuAyristir(metin) {
  const satirlar = [], hatalar = [];
  String(metin || '').split(/\r?\n/).forEach((ham, i) => {
    const satir = ham.trim();
    if (!satir) return;
    const parca = satir.replace(/(\d+)\s*:\s*(\d+)/g, '$1 $2').split(/[\t;|]+|\s+/).filter(Boolean);
    const sayilar = [];
    while (parca.length && /^[+-]?\d+$/.test(parca[parca.length - 1])) sayilar.unshift(Number(parca.pop()));
    const sira = /^\d+\.?$/.test(parca[0] || '') ? Number(parca.shift().replace('.', '')) : satirlar.length + 1;
    const takim = parca.join(' ').trim();
    if (sayilar.length === 8) sayilar.splice(6, 1); // averaj atılır (A − Y'den hesaplanır)
    if (sayilar.length !== 7 || takim.length < 2) { hatalar.push(`${i + 1}. satır okunamadı: "${satir.slice(0, 60)}"`); return; }
    const [oynanan, galibiyet, beraberlik, maglubiyet, atilan, yenen, puan] = sayilar;
    if (galibiyet + beraberlik + maglubiyet !== oynanan) { hatalar.push(`${takim}: oynanan (${oynanan}) ≠ G + B + M.`); return; }
    satirlar.push({ sira, takim, oynanan, galibiyet, beraberlik, maglubiyet, atilan, yenen, puan });
  });
  return { satirlar, hatalar };
}

/**
 * 022: sayarak gelen sayılar (ortak.js belirmeIzle). Metindeki her tam sayıyı x (0..1) oranına indirir, gerisini (ayraç, %, boşluk)
 * aynen bırakır: '3 – 1', 0.5 → '2 – 1' (yuvarlanır); x ≥ 1 metnin kendisi. Görünen kare içindir; ekran okuyucu gerçek metni okur.
 */
export function sayarakMetin(metin, x) {
  const s = String(metin ?? '');
  if (!(x < 1)) return s;
  const o = Math.max(0, x);
  return s.replace(/\d+/g, (n) => String(Math.round(Number(n) * o)));
}
/** Sayarak gelmeye uygun mu: yalnız rakam ve ayraçlar ('2 – 1', '17', '%45'), en az bir sıfırdan büyük sayı; harfli metin ('5 g 15 sa', '3,00 Mn €') değil. */
export const sayilabilir = (metin) => /^[\d\s –—%+.-]+$/.test(String(metin ?? '').trim()) && /[1-9]/.test(String(metin));
