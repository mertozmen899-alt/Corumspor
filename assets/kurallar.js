// Uygulamanın saf kuralları (DOM yok, ağ yok). Tarayıcıda, sahte istemcide (testler/sahte-supabase.js) ve Node'da aynı dosya.
// Buradaki kurallar veritabanındakilerin AYNASIDIR (supabase/migrations/012_denetim_2.sql). Birini değiştirirseniz ötekini de
// değiştirin; testler/kurallar-ornekleri.json iki tarafta da denenir (testler/uygulama.test.mjs, testler/reklam/sql.test.mjs).
// Asıl koruma sunucudadır; buradaki denetimler kullanıcıya erken ve Türkçe uyarı vermek içindir.

// Yorum sınırları (SQL: yorum_ekleme_kontrol, yorum_duzenleme_hakki, yorum_guncelleme_kontrol)
export const YORUM_SINIRLARI = Object.freeze({
  enUzun: 1000,               // karakter
  dakikada: 5,                // bir dakikada en fazla 5 yorum
  gunde: 50,                  // son 24 saatte en fazla 50 yorum (hesap başına)
  tekrarDakika: 10,           // aynı metin 10 dakika içinde tekrar yazılamaz
  duzenlemeDakikada: 10,      // dakikada en fazla 10 düzenleme
  duzenlemeSuresiDakika: 30,  // yorum yalnız yazıldıktan sonraki 30 dakika içinde düzenlenebilir (yönetici muaf)
});

/** Aynı metin mi (baştaki/sondaki boşluk, art arda boşluk ve büyük/küçük harf yok sayılır; SQL ile aynı). */
export function yorumMetniAyni(a, b) {
  const n = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  return n(a) === n(b);
}

// ---------------------------------------------------------------------------
// Kullanıcı adı (SQL: kullanici_adi_ayrilmis, yeni_kullanici, profil_koruma)
// ---------------------------------------------------------------------------
export const KULLANICI_ADI_DESENI = /^[A-Za-z0-9_.çğıöşüÇĞİÖŞÜ]{3,24}$/;
const TR_HARF = { Ç: 'c', Ğ: 'g', İ: 'i', I: 'i', Ö: 'o', Ş: 's', Ü: 'u', Â: 'a', Î: 'i', Û: 'u', ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
// İçinde geçmesi yeten kökler ve tam eşleşmesi gerekenler (SQL'deki listeyle AYNI)
const AYRILMIS_KOK = /(admin|yonetici|yonetim|moderator|resmi|corumfk|kulup|yetkili)/;
const AYRILMIS_TAM = ['destek', 'mod', 'sistem', 'corumspor', 'corumsportaraftar', 'support', 'official', 'root'];

/** Yanıltıcı / ayrılmış ad mı (yönetici, admin, resmî, kulüp, Çorum FK, destek…)? Harf büyüklüğü, Türkçe harf, rakam, _ ve . fark etmez. */
export function kullaniciAdiAyrilmis(ad) {
  const v = String(ad ?? '').replace(/[ÇĞİIÖŞÜÂÎÛçğıöşüâîû]/g, (c) => TR_HARF[c]).toLowerCase().replace(/[^a-z]/g, '');
  return AYRILMIS_KOK.test(v) || AYRILMIS_TAM.includes(v);
}

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
