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
/** Uygulama sahibinin adı (ayar.js SAHIP_ADI); 3 harften kısaysa yok. SQL'de ayrilmis_adlar tablosundadır. */
export const SAHIP_ANAHTARLARI = Object.freeze([sahipAnahtari(SAHIP_ADI)].filter((k) => /^[a-z]{3,40}$/.test(k)));

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
