// SADECE TEST: supabase-js yerine geçen sahte istemci (ES modülü).
// assets/istemci.js bunu localhost'ta ?sahte=1 ile yükler. Gerçek sunucuya istek atmaz.
// Veri tarayıcının localStorage'ında durur (her yeni tarayıcı bağlamı temiz başlar).
// Sunucudaki RLS kurallarının KABA bir benzerini uygular ki arayüz akışları denenebilsin;
// asıl güvenlik testleri testler/sql/20_rls_testleri.sql içindedir.
// Hazır hesaplar (şifre hepsinde: sifre1234):
//   yonetici@ornek.test (admin, tribun_editor), taraftar@ornek.test (ayse_19), burak@ornek.test (burak),
//   onaysiz@ornek.test (dilek; e-postası ONAYLANMAMIŞ oturum: ör. "Confirm email" açılmadan önce açılmış hesap ya da anonim giriş)
// 012_denetim_2.sql de taklit edilir: yorumda e-posta onayı / günde 50 / aynı metin 10 dk / düzenleme 30 dk ve dakikada 10,
// profillerde role sütunu okunamaz (select role ya da * → 42501; rol benim_profilim() ile), ayrılmış kullanıcı adları,
// haber kapağı yalnız depo/assets/img, reklam başına dakika sınırı + reklam_raporu.supheli_dakika. Kurallar assets/kurallar.js'ten.
// Test kolu: localStorage 'sahte_eposta_onayi' = 'gerekli' ise Supabase'deki "Confirm email" açıkmış gibi davranır
// (kayıtta oturum açılmaz, onaysız e-postayla giriş "Email not confirmed"); yoksa kayıtta e-posta kendiliğinden onaylı sayılır.
// Reklam modülü (supabase/migrations/010_reklamlar.sql) da burada taklit edilir: reklamlar / reklam_olaylari tabloları
// (yalnız yönetici), RPC'ler is_admin, aktif_reklam, reklam_olay_kaydet, reklam_raporu ve reklam-gorselleri kovası.
// Kurallar reklam modülünün kendi saf mantığından gelir (assets/reklam/reklam-mantik.js), SQL'in aynasıdır.
// Test kolu: localStorage 'sahte_saat_kayma' (ms) reklam tarafının "sunucu saatini" ileri alır (süre bitimi denemesi).
// Örnek reklam: ilk reklam veren Narçil Cafe (docs/ilk-reklam/) yayında başlar: ana_akis, haber_sonu ve M1 maçında
// "Maçın sponsoru". Görselleri depo adresinde (reklam-gorselleri/ornek/...); tarayıcı testleri docs/ilk-reklam/'dan sunar.
// Test kolu: veri ilk kurulmadan önce localStorage 'sahte_ornek_reklam' = 'yok' ise reklamsız başlar (boş durum testleri).
// Test kolu: localStorage 'sahte_reklam_gecikme' (ms) aktif_reklam / aktif_reklamlar yanıtını geciktirir.
// 014 (supabase/migrations/014_inceleme_2.sql) da taklit edilir: haber kaynağı/düzeltme/kapak alt metni, gol video kaynağı ve
// altyazısı (.mp4/.vtt yalnız gol-videolari kovası), maç notu ve ön onay modu, sakatlıkta kaynak bağlantısı/tarihi ve YALNIZ
// yöneticiye açık aciklama (başkası select'te isterse 42501; yönetici sakatliklar_yonetim() ile), yorum moderasyonu
// (onay_bekliyor: kelime listesi yorum_kelimeleri + maçın ön onay penceresi; farklı 3 hesaptan şikâyet → kendiliğinden gizli;
// yasaklı hesap düzenleyemez/şikâyet edemez), reklamda firma_anahtar, sunucuda yasaklı sektör onayı, tıklama eylemi,
// yerleşim, sekme başına saatlik sınır, yalnız gösterilen reklama olay, reklam_raporu'nun yeni sütunları ve reklam_gunluk_raporu.
// 015 (015_son_tur.sql): reklam başına dakikada 120 gösterim / 20 tıklama / 240 yerleşim (SINIRLAR), tıklama oranı = tıklanan farklı
// sayfa açılışı ÷ gösterim (tiklayan_ziyaret), dönem bugünü aşmaz + devam_ediyor (RM.raporDonemi), reklam_ham_satir_alarmi,
// reklam_gunluk_toplanan (boş: sahte modda gece bakımı yok), şikâyet: saatte 10 / günde 30, yalnız 24 saatlik hesaplar sayılır,
// yönetici yorumu gizlenmez; görsel/düğme yazısı değişince sektör onayı sıfırlanır; haberler.kaynak_gerekli; ad değiştirme 7 günde bir.

import * as RM from '../assets/reklam/reklam-mantik.js';
import * as K from '../assets/kurallar.js';

const DB_ANAHTAR = 'sahte-db-v1';
const OTURUM_ANAHTAR = 'sahte-oturum-v1';
const DEPO_ANAHTAR = 'sahte-depo-v1:'; // yüklenen dosyalar (data: URL) ayrı anahtarlarda: her sorguda büyük JSON ayrıştırılmasın
const SAAT_KAYMA = 'sahte_saat_kayma';
const EPOSTA_ONAYI = 'sahte_eposta_onayi'; // 'gerekli' = Supabase "Confirm email" açık
const SAHTE_PROJE = 'https://sahte.supabase.co'; // reklam görselleri bu "depo" adresinden sunulur (testte yönlendirilir)

/** Reklam tarafının sunucu saati (test kolu: sahte_saat_kayma). */
function reklamSimdi() {
  let k = 0;
  try { k = Number(localStorage.getItem(SAAT_KAYMA) || 0) || 0; } catch (e) {}
  return new Date(Date.now() + k);
}
if (typeof window !== 'undefined') window.__reklamSimdi = reklamSimdi; // yönetim paneli rozetleri aynı saati kullansın

const U = {
  admin: 'aaaaaaaa-0000-4000-8000-000000000001',
  ayse: 'bbbbbbbb-0000-4000-8000-000000000001',
  burak: 'bbbbbbbb-0000-4000-8000-000000000002',
  dilek: 'bbbbbbbb-0000-4000-8000-000000000004',
};
const M = (n) => `11111111-0000-4000-8000-00000000000${n}`;
const G = (n) => `22222222-0000-4000-8000-00000000000${n}`;
const H = (n) => `33333333-0000-4000-8000-00000000000${n}`;
const Y = (n) => `44444444-0000-4000-8000-00000000000${n}`;
const O = (n) => `55555555-0000-4000-8000-00000000000${n}`;
const S = (n) => `66666666-0000-4000-8000-00000000000${n}`;
const IMG = (ad) => `assets/img/${ad}-1600.webp`;
const ATIF = { // assets/foto-kaynaklari.js'teki atıflar (haber kapağı kaynağı alanı)
  'corum-ulu-camii': 'Fotoğraf: Acar54, CC BY-SA 4.0, Wikimedia Commons',
  'hattusa-aslanli-kapi': 'Fotoğraf: Bernard Gagnon, CC BY-SA 3.0, Wikimedia Commons',
  'corum-belediye-binasi': 'Fotoğraf: HALUK COMERTEL, CC BY 3.0, Wikimedia Commons',
};

const gunOnce = (n, saatUtc = 9) => { const d = new Date(Date.now() - n * 864e5); d.setUTCHours(saatUtc, 0, 0, 0); return d.toISOString(); };

// İlk gerçek reklam veren: Narçil Cafe. Metin ve görseller docs/ilk-reklam/NASIL.md ile aynı.
// 014 (KARARLAR): bağlantısız reklamın metninde, alt metninde ve görselinde web adresi YOK; son cümle "Çorum'da sizi bekliyoruz.";
// alt metinde İngilizce slogan yerine Türkçesi.
// BAĞLANTI YOK ("Bağlantı yok"): narcil.net'in her sayfasında üst menüde nargile görünüyor (tütün reklamı yasak, 4207 sayılı
// Kanun; başkanın değerlendirmesi). Firma nargilesiz bir sayfa ya da WhatsApp numarası verirse panelden eklenir.
// İndirim/kupon yok (Mert kararı, 5 Kasım 2026: maça özel indirim yapılmayacak).
export const ORNEK_REKLAM = Object.freeze({
  firma_adi: 'Narçil Cafe',
  kisa_metin: "Espresso bazlı kahveler, Türk kahvesi, bitki çayları, taze meyve suları ve tatlılar. Çorum'da sizi bekliyoruz.",
  baglanti_url: null,
  gorsel_metni: 'Narçil Cafe logosu ve kalpli "seni seviyor" sloganı; görseldeki yazı: espresso bazlı kahveler, Türk kahvesi, bitki çayları, taze sıkılmış meyve suları, tatlılar; Çorum\'da sizi bekliyoruz',
  yatay: 'ornek/narcil-1200x628.webp',
  yatay_kucuk: 'ornek/narcil-480x251.webp',
  kare: 'ornek/narcil-600x600.webp',
  kare_kucuk: 'ornek/narcil-192x192.webp',
});
const ORNEK_REKLAM_KAPALI = 'sahte_ornek_reklam';
const R = (n) => `aaaaaaaa-2222-4000-8000-00000000000${n}`;

function ornekReklamlar() {
  try { if (localStorage.getItem(ORNEK_REKLAM_KAPALI) === 'yok') return []; } catch (e) {}
  const bas = gunOnce(7), bit = new Date(Date.now() + 60 * 864e5).toISOString();
  const depo = (yol) => `${SAHTE_PROJE}/storage/v1/object/public/reklam-gorselleri/${yol}`;
  const r = (n, alan, mac_id, gorsel, kucuk) => ({
    id: R(n), firma_adi: ORNEK_REKLAM.firma_adi, kisa_metin: ORNEK_REKLAM.kisa_metin, gorsel_url: depo(gorsel), gorsel_kucuk_url: depo(kucuk),
    gorsel_metni: ORNEK_REKLAM.gorsel_metni, dugme_metni: null, telefon: null, sektor_onayi: true, sektor_onay_zamani: bas, firma_anahtar: RM.firmaAnahtari(ORNEK_REKLAM.firma_adi),
    baglanti_url: ORNEK_REKLAM.baglanti_url, alan, mac_id, baslangic: bas, bitis: bit, durum: 'yayinda', oncelik: 10,
    yayina_alinma: bas, created_at: bas, updated_at: bas, olusturan: U.admin,
  });
  return [
    r(1, 'ana_akis', null, ORNEK_REKLAM.yatay, ORNEK_REKLAM.yatay_kucuk),
    r(2, 'haber_sonu', null, ORNEK_REKLAM.yatay, ORNEK_REKLAM.yatay_kucuk),
    r(3, 'mac_sponsoru', M(1), ORNEK_REKLAM.kare, ORNEK_REKLAM.kare_kucuk),
  ];
}

function baslangicVerisi() {
  const haber = (n, baslik, ozet, gun, kapak, yayinda = true, manset = false) => ({
    id: H(n), baslik, ozet, kapak_url: kapak ? IMG(kapak) : null, kapak_kaynak: kapak && ATIF[kapak] ? ATIF[kapak] : null, manset, yayinda, yayin_tarihi: yayinda ? gunOnce(gun) : null,
    kaynak: null, kaynak_url: null, duzeltme_notu: null, duzeltme_tarihi: null, kapak_alt: null, kaynak_gerekli: false, // 014, 015
    govde: `Bu bir test haberidir (${n}). İçerik uydurmadır.\n\nİkinci paragraf: taraftarlar tribünleri doldurdu.\nAynı paragrafta yeni satır.\n\n<script>alert("xss")</script> etiketi düz metin olarak görünmeli.`,
    yazar_id: U.admin, created_at: gunOnce(gun + 1), updated_at: gunOnce(gun),
  });
  return {
    kullanicilar: [
      { id: U.admin, email: 'yonetici@ornek.test', sifre: 'sifre1234', email_confirmed_at: gunOnce(30) },
      { id: U.ayse, email: 'taraftar@ornek.test', sifre: 'sifre1234', email_confirmed_at: gunOnce(20) },
      { id: U.burak, email: 'burak@ornek.test', sifre: 'sifre1234', email_confirmed_at: gunOnce(10) },
      { id: U.dilek, email: 'onaysiz@ornek.test', sifre: 'sifre1234', email_confirmed_at: null },
    ],
    profiles: [
      // Yönetici adı da sıradan bir ad (012: "yonetici", "admin" gibi adlar ayrılmıştır)
      { id: U.admin, kullanici_adi: 'tribun_editor', role: 'admin', created_at: gunOnce(30) },
      { id: U.ayse, kullanici_adi: 'ayse_19', role: 'taraftar', created_at: gunOnce(20) },
      { id: U.burak, kullanici_adi: 'burak', role: 'taraftar', created_at: gunOnce(10) },
      { id: U.dilek, kullanici_adi: 'dilek', role: 'taraftar', created_at: gunOnce(2) },
    ].map((p) => ({ engelli: false, ...p })),
    haberler: [
      haber(1, 'Test haberi 1: Sahada üç puan', 'Örnekköy Spor karşısında 2-1 galibiyet.', 1, 'corum-ulu-camii'),
      // 013: manşet (ana sayfanın açılış görseli). Kapağı sitenin varsayılan hero fotoğrafı (Saat Kulesi)
      haber(2, 'Test haberi 2: Deplasmanda bir puan', 'Kurgu Gençlik ile 1-1.', 2, 'corum-saat-kulesi-gece-yatay', true, true),
      { ...haber(3, 'Test haberi 3: Biletler satışta', 'Deneme FK maçının biletleri.', 3, null), kaynak: 'Kulüp açıklaması', kaynak_url: 'https://ornek.test/biletler', kaynak_gerekli: true }, // 014: kaynaklı haber; 015: bilet haberi (kaynak zorunlu)
      haber(4, 'Test haberi 4: Antrenman notları', 'Hazırlıklar sürüyor.', 4, null),
      haber(5, 'Test haberi 5: Altyapıdan haberler', null, 5, 'hattusa-aslanli-kapi'),
      haber(6, 'Test haberi 6: Tribün koreografisi', 'Taraftar grupları hazırlanıyor.', 6, null),
      haber(7, 'Test haberi 7: Sezon öncesi', 'Eski bir haber.', 7, null),
      haber(8, 'Taslak test haberi', 'Bunu sadece yönetici görür.', 0, null, false),
      haber(9, 'Test haberi 8: Belediye ile stat görüşmesi', 'Şehir yönetimiyle ulaşım planı konuşuldu.', 8, 'corum-belediye-binasi'),
    ],
    maclar: [
      { id: M(1), rakip: 'Örnekköy Spor', tarih: gunOnce(14, 16), stadyum: 'Çorum Şehir Stadyumu', ic_saha: true, organizasyon: 'Lig (örnek)', corum_skor: 2, rakip_skor: 1, durum: 'bitti' },
      { id: M(2), rakip: 'Kurgu Gençlik', tarih: gunOnce(7, 13), stadyum: 'Kurgu Arena', ic_saha: false, organizasyon: 'Lig (örnek)', corum_skor: 1, rakip_skor: 1, durum: 'bitti' },
      { id: M(3), rakip: 'Deneme FK', tarih: gunOnce(-5, 16), stadyum: 'Çorum Şehir Stadyumu', ic_saha: true, organizasyon: 'Lig (örnek)', corum_skor: null, rakip_skor: null, durum: 'planlandi',
        mac_notu: 'Biletler kulübün resmî satış noktalarında. Kapılar maçtan 2 saat önce açılır (örnek).' },
      { id: M(4), rakip: 'Hayal Belediyespor', tarih: gunOnce(-12, 11), stadyum: 'Hayal İlçe Stadı', ic_saha: false, organizasyon: 'Kupa (örnek)', corum_skor: null, rakip_skor: null, durum: 'planlandi' },
      { id: M(5), rakip: 'Eski Rakip', tarih: gunOnce(21, 16), stadyum: 'Eski Stat', ic_saha: false, organizasyon: 'Lig (örnek)', corum_skor: 0, rakip_skor: 2, durum: 'bitti' },
    ].map((m) => ({ mac_notu: null, on_onay: false, ...m, created_at: gunOnce(40), updated_at: gunOnce(40) })),
    goller: [
      { id: G(1), mac_id: M(1), oyuncu: 'Ali Örnek', dakika: 23, ek_dakika: null, penalti: false, video_url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ', video_kaynak: 'Blender Foundation, CC BY 3.0 (örnek video)', altyazi_url: null, aciklama: 'Ceza sahası dışından sert vuruş.', kapak_url: IMG('siklik-kapilari-tabiat-parki'), sure_sn: 42, created_at: gunOnce(14) },
      { id: G(2), mac_id: M(1), oyuncu: 'Mehmet Deneme', dakika: 90, ek_dakika: 2, penalti: true, video_url: null, video_kaynak: null, altyazi_url: null, aciklama: null, kapak_url: null, sure_sn: null, created_at: gunOnce(14) },
      { id: G(3), mac_id: M(2), oyuncu: 'Ali Örnek', dakika: 67, ek_dakika: null, penalti: false, video_url: 'https://ornek.test/videolar/gol-3.mp4', video_kaynak: 'Örnek video (test)', altyazi_url: null, aciklama: 'Kafa golü.', kapak_url: IMG('corum-sehir-ici-gun-batimi'), sure_sn: 38, created_at: gunOnce(7) },
    ],
    yorumlar: [
      { id: Y(1), kullanici_id: U.ayse, haber_id: H(1), mac_id: null, metin: 'Harika maçtı! <b>kalın değil</b>', gizli: false, onay_bekliyor: false, gizleme_nedeni: null, moderasyon_zamani: null, created_at: gunOnce(1, 10), duzenlendi: null },
      { id: Y(2), kullanici_id: U.burak, haber_id: H(1), mac_id: null, metin: 'Bu yorum gizlendi (kural dışı).', gizli: true, onay_bekliyor: false, gizleme_nedeni: 'yonetici', moderasyon_zamani: null, created_at: gunOnce(1, 11), duzenlendi: null },
      { id: Y(3), kullanici_id: U.burak, haber_id: null, mac_id: M(1), metin: 'Tribünler muhteşemdi.', gizli: false, onay_bekliyor: false, gizleme_nedeni: null, moderasyon_zamani: null, created_at: gunOnce(13, 20), duzenlendi: null },
    ],
    // 013: kadro ve sakatlıklar (uydurma; sakatlık bilgisi yalnız kulüp açıklamasından, kaynaklı)
    oyuncular: [
      ['Kemal Kaleci', 1, 'kaleci', 1], ['Yedek Eldiven', 12, 'kaleci', 2], ['Deniz Defans', 4, 'defans', 1], ['Barış Bek', 2, 'defans', 2],
      ['Orhan Ortasaha', 8, 'orta_saha', 1], ['Mehmet Deneme', 10, 'orta_saha', 2], ['Ali Örnek', 9, 'forvet', 1], ['Fikret Forvet', 11, 'forvet', 2],
    ].map(([ad, forma_no, mevki, sira], i) => ({ id: O(i + 1), ad, forma_no, mevki, sira, foto_url: null, aktif: true, created_at: gunOnce(30), updated_at: gunOnce(30) })),
    sakatliklar: [
      { id: S(1), oyuncu_id: O(3), durum: 'sakat', aciklama: 'İç not: kulüp açıklaması 1. paragraf.', kaynak: 'Kulüp açıklaması', kaynak_url: 'https://ornek.test/aciklama/1', kaynak_tarihi: gunOnce(1).slice(0, 10), beklenen_donus: new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10), guncellendi: new Date(Date.now() - 5 * 3600e3).toISOString(), yayinda: true, created_at: gunOnce(3) },
      { id: S(2), oyuncu_id: O(8), durum: 'cezali', aciklama: 'İç not: sarı kart cezası.', kaynak: 'TFF disiplin kurulu', kaynak_url: null, kaynak_tarihi: gunOnce(2).slice(0, 10), beklenen_donus: null, guncellendi: gunOnce(1), yayinda: true, created_at: gunOnce(1) },
      { id: S(3), oyuncu_id: O(4), durum: 'belirsiz', aciklama: 'Taslak: yayında değil.', kaynak: 'Kulüp açıklaması', kaynak_url: 'https://ornek.test/aciklama/3', kaynak_tarihi: null, beklenen_donus: null, guncellendi: gunOnce(1), yayinda: false, created_at: gunOnce(1) },
    ],
    yorum_sikayetleri: [],
    yorum_kelimeleri: [], // 014: moderasyon kelime listesi (yalnız yönetici)
    depo: {},
    reklamlar: ornekReklamlar(),
    reklam_olaylari: [],
    reklam_sinir_dakikalari: [],
    reklam_yerlesimleri: [], // 014
    reklam_sekme_sayaclari: [], // 014
    reklam_gunluk_toplanan: [], // 015: gece bakımının topladığı günler (sahte modda bakım yok)
    yorum_duzenlemeleri: [],
  };
}

// ------------------------------------------------------------------ depolama
function dbOku() {
  try {
    const s = localStorage.getItem(DB_ANAHTAR);
    if (s) {
      const db = JSON.parse(s);
      for (const k of ['reklamlar', 'reklam_olaylari', 'reklam_sinir_dakikalari', 'yorum_duzenlemeleri', 'oyuncular', 'sakatliklar', 'yorum_sikayetleri', 'yorum_kelimeleri', 'reklam_yerlesimleri', 'reklam_sekme_sayaclari', 'reklam_gunluk_toplanan']) db[k] = db[k] || [];
      return db;
    }
  } catch (e) {}
  const v = baslangicVerisi();
  dbYaz(v);
  return v;
}
function dbYaz(db) { try { localStorage.setItem(DB_ANAHTAR, JSON.stringify(db)); } catch (e) {} }
function onayGerekli() { try { return localStorage.getItem(EPOSTA_ONAYI) === 'gerekli'; } catch (e) { return false; } }
function oturumOku() { try { return JSON.parse(localStorage.getItem(OTURUM_ANAHTAR) || 'null'); } catch (e) { return null; } }
function oturumYaz(o) { try { o ? localStorage.setItem(OTURUM_ANAHTAR, JSON.stringify(o)) : localStorage.removeItem(OTURUM_ANAHTAR); } catch (e) {} }

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => ((Math.random() * 16) | 0).toString(16)));
const simdi = () => new Date().toISOString();
const rlsHatasi = (t) => ({ code: '42501', message: `new row violates row-level security policy for table "${t}"`, details: null, hint: null });
const bekle = () => new Promise((r) => setTimeout(r, 5));

// ------------------------------------------------------------------ ilişkiler (PostgREST gömme)
const ILISKI = {
  yorumlar: { profiles: ['kullanici_id', 'tek'], haberler: ['haber_id', 'tek'], maclar: ['mac_id', 'tek'], goller: ['gol_id', 'tek'] },
  goller: { maclar: ['mac_id', 'tek'], yorumlar: ['gol_id', 'cok'] },
  sakatliklar: { oyuncular: ['oyuncu_id', 'tek'] },
  yorum_sikayetleri: { yorumlar: ['yorum_id', 'tek'] },
  maclar: { goller: ['mac_id', 'cok'], yorumlar: ['mac_id', 'cok'] },
  haberler: { profiles: ['yazar_id', 'tek'], yorumlar: ['haber_id', 'cok'] },
};

function secimAyristir(secim) {
  const parcalar = []; let derinlik = 0; let cur = '';
  for (const ch of String(secim || '*')) {
    if (ch === '(') derinlik++;
    if (ch === ')') derinlik--;
    if (ch === ',' && derinlik === 0) { parcalar.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) parcalar.push(cur.trim());
  const gommeler = [];
  for (const p of parcalar) {
    const m = p.match(/^(?:(\w+):)?(\w+)(!inner)?\(([\s\S]*)\)$/);
    if (m) gommeler.push({ ad: m[1] || m[2], tablo: m[2], ic: !!m[3], secim: m[4] });
  }
  return gommeler;
}

// 012: profiles'ta sütun yetkisi (GRANT select (id, kullanici_adi, created_at)): role ya da * istenirse "permission denied"
const PROFIL_SUTUNLARI = ['id', 'kullanici_adi', 'created_at'];
function profilSutunlari(secim) {
  const ust = []; let d = 0; let cur = '';
  for (const ch of String(secim || '*')) {
    if (ch === '(') d++;
    if (ch === ')') d--;
    if (ch === ',' && d === 0) { ust.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) ust.push(cur.trim());
  const sutunlar = ust.filter((x) => !x.includes('('));
  if (!sutunlar.length || sutunlar.some((x) => !PROFIL_SUTUNLARI.includes(x))) throw { code: '42501', message: 'permission denied for table profiles', details: null, hint: null };
  return sutunlar;
}
const sutunSec = (r, sutunlar) => Object.fromEntries(sutunlar.map((k) => [k, r[k]]));
// 014: sakatliklar.aciklama yalnız yöneticiye (sütun yetkisi): başkası select'te aciklama ya da * isterse "permission denied"
function sakatlikSutunDenetle(secim, ctx) {
  if (ctx.admin) return;
  const ust = []; let d = 0; let cur = '';
  for (const ch of String(secim || '*')) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && d === 0) { ust.push(cur.trim()); cur = ''; } else cur += ch; }
  if (cur.trim()) ust.push(cur.trim());
  if (ust.some((x) => x === '*' || x === 'aciklama')) throw { code: '42501', message: 'permission denied for table sakatliklar', details: null, hint: null };
}

function karsilastir(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' || typeof b === 'boolean') return Number(a) - Number(b);
  const da = Date.parse(a), dbb = Date.parse(b);
  if (typeof a === 'string' && typeof b === 'string' && /^\d{4}-\d\d-\d\d/.test(a) && /^\d{4}-\d\d-\d\d/.test(b) && !isNaN(da) && !isNaN(dbb)) return da - dbb;
  return String(a).localeCompare(String(b));
}

class Sorgu {
  constructor(istemci, tablo) {
    this.c = istemci; this.t = tablo; this.islem = 'select'; this.secim = '*';
    this.filtreler = []; this.siralar = []; this.bas = null; this.son = null; this.limitN = null;
    this.tekMod = null; this.donus = false; this.veri = null;
  }
  select(s = '*') { if (this.islem === 'select') this.secim = s; else { this.donus = true; this.secim = s; } return this; }
  insert(v) { this.islem = 'insert'; this.veri = Array.isArray(v) ? v : [v]; return this; }
  update(v) { this.islem = 'update'; this.veri = v; return this; }
  delete() { this.islem = 'delete'; return this; }
  eq(k, v) { this.filtreler.push((r) => r[k] === v); return this; }
  neq(k, v) { this.filtreler.push((r) => r[k] !== v); return this; }
  in(k, l) { this.filtreler.push((r) => l.includes(r[k])); return this; }
  is(k, v) { this.filtreler.push((r) => (v === null ? r[k] == null : r[k] === v)); return this; }
  gte(k, v) { this.filtreler.push((r) => r[k] != null && karsilastir(r[k], v) >= 0); return this; }
  gt(k, v) { this.filtreler.push((r) => r[k] != null && karsilastir(r[k], v) > 0); return this; }
  lte(k, v) { this.filtreler.push((r) => r[k] != null && karsilastir(r[k], v) <= 0); return this; }
  lt(k, v) { this.filtreler.push((r) => r[k] != null && karsilastir(r[k], v) < 0); return this; }
  order(k, o = {}) { if (!o.referencedTable && !o.foreignTable) this.siralar.push([k, o.ascending !== false]); return this; }
  range(a, b) { this.bas = a; this.son = b; return this; }
  limit(n) { this.limitN = n; return this; }
  single() { this.tekMod = 'tek'; return this; }
  maybeSingle() { this.tekMod = 'belki'; return this; }
  then(ok, hata) { return this.calistir().then(ok, hata); }

  async calistir() {
    await bekle();
    const db = dbOku();
    const ctx = this.c.baglam(db);
    let sonuc;
    try { sonuc = this['_' + this.islem](db, ctx); } catch (e) { return { data: null, error: e.code ? e : { message: String(e.message || e) } }; }
    if (sonuc.error) return sonuc;
    let satirlar = sonuc.satirlar;
    if (this.islem !== 'select' && !this.donus) return { data: null, error: null, status: 201 };
    satirlar = this.gom(db, ctx, satirlar);
    if (this.tekMod) {
      if (satirlar.length === 1) return { data: satirlar[0], error: null };
      if (!satirlar.length && this.tekMod === 'belki') return { data: null, error: null };
      return { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } };
    }
    return { data: satirlar, error: null };
  }

  gorunur(db, ctx, tablo, r) {
    if (tablo === 'haberler') return r.yayinda || ctx.admin;
    if (tablo === 'reklamlar' || tablo === 'reklam_olaylari' || tablo === 'yorum_sikayetleri' || tablo === 'yorum_kelimeleri' || tablo === 'reklam_gunluk_toplanan') return ctx.admin; // RLS: yalnız yönetici okur
    if (tablo === 'oyuncular') return r.aktif || ctx.admin;        // 013
    if (tablo === 'sakatliklar') return r.yayinda || ctx.admin;    // 013: ziyaretçi yalnız yayındakini görür
    if (tablo === 'yorumlar') {
      const haberAcik = !r.haber_id || (db.haberler.find((x) => x.id === r.haber_id) || {}).yayinda;
      return (!r.gizli && !r.onay_bekliyor && haberAcik) || r.kullanici_id === ctx.uid || ctx.admin; // 014: onay bekleyen de gizli
    }
    return true;
  }

  gom(db, ctx, satirlar) {
    const gommeler = secimAyristir(this.secim);
    let liste = satirlar.map((r) => ({ ...r }));
    for (const g of gommeler) {
      const iliski = (ILISKI[this.t] || {})[g.tablo];
      if (!iliski) continue;
      const [alan, tur] = iliski;
      for (const r of liste) {
        if (tur === 'tek') {
          const hedef = db[g.tablo].find((x) => x.id === r[alan] && this.gorunur(db, ctx, g.tablo, x));
          r[g.ad] = hedef ? (g.tablo === 'profiles' ? sutunSec(hedef, profilSutunlari(g.secim)) : { ...hedef }) : null;
        } else {
          r[g.ad] = db[g.tablo].filter((x) => x[alan] === r.id && this.gorunur(db, ctx, g.tablo, x)).map((x) => ({ ...x }));
        }
      }
      if (g.ic) liste = liste.filter((r) => (Array.isArray(r[g.ad]) ? r[g.ad].length : r[g.ad]));
    }
    return liste;
  }

  sec(db, ctx) {
    return db[this.t].filter((r) => this.gorunur(db, ctx, this.t, r)).filter((r) => this.filtreler.every((f) => f(r)));
  }

  _select(db, ctx) {
    // gömme (özellikle !inner) sıralama ve sayfalamadan önce uygulanır
    let s = this.gom(db, ctx, this.sec(db, ctx));
    for (const [k, artan] of [...this.siralar].reverse()) {
      s.sort((a, b) => {
        if (a[k] == null && b[k] == null) return 0;
        if (a[k] == null) return artan ? 1 : -1;
        if (b[k] == null) return artan ? -1 : 1;
        return artan ? karsilastir(a[k], b[k]) : karsilastir(b[k], a[k]);
      });
    }
    if (this.bas != null) s = s.slice(this.bas, this.son + 1);
    if (this.limitN != null) s = s.slice(0, this.limitN);
    if (this.t === 'profiles') { const sutunlar = profilSutunlari(this.secim); s = s.map((r) => sutunSec(r, sutunlar)); }
    if (this.t === 'sakatliklar') sakatlikSutunDenetle(this.secim, ctx);
    this.secim = '*'; // gömme zaten yapıldı
    return { satirlar: s };
  }

  _insert(db, ctx) {
    const eklenen = [];
    for (const ham of this.veri) {
      const r = { id: uuid(), created_at: simdi(), ...ham };
      if (['haberler', 'maclar', 'goller', 'oyuncular', 'sakatliklar', 'yorum_kelimeleri'].includes(this.t)) {
        if (!ctx.admin) throw rlsHatasi(this.t);
        if (this.t === 'yorum_kelimeleri') { // 014: katlanmış biçimde, 3-40 harf
          const k = K.kelimeBicimi(r.kelime);
          if (!k) throw { code: '23514', message: 'new row for relation "yorum_kelimeleri" violates check constraint "yorum_kelimeleri_kelime_check"' };
          if (db.yorum_kelimeleri.some((x) => x.kelime === k)) throw { code: '23505', message: 'duplicate key value violates unique constraint "yorum_kelimeleri_pkey"' };
          const satir = { id: k, kelime: k, created_at: simdi() }; db.yorum_kelimeleri.push(satir); eklenen.push(satir); continue; // id: silme için (gerçekte birincil anahtar kelime)
        }
        if (this.t === 'oyuncular') { Object.assign(r, { aktif: r.aktif !== false, sira: r.sira ?? 0, foto_url: r.foto_url ?? null, forma_no: r.forma_no ?? null, updated_at: simdi() }); if (!K.kapakAdresiGecerli(r.foto_url)) throw { code: '23514', message: 'new row for relation "oyuncular" violates check constraint "oyuncular_foto_kaynagi"' }; }
        if (this.t === 'sakatliklar') { sakatlikDogrula(r); Object.assign(r, { yayinda: !!r.yayinda, guncellendi: simdi(), aciklama: r.aciklama ?? null, kaynak_url: r.kaynak_url ?? null, kaynak_tarihi: r.kaynak_tarihi ?? null, beklenen_donus: r.beklenen_donus ?? null }); }
        if (this.t === 'haberler') {
          Object.assign(r, { ozet: r.ozet ?? null, kapak_url: r.kapak_url ?? null, govde: r.govde ?? '', yayinda: !!r.yayinda, yazar_id: ctx.uid, updated_at: simdi() });
          r.yayin_tarihi = r.yayinda ? simdi() : null;
          if (!K.kapakAdresiGecerli(r.kapak_url)) throw kapakHatasi();
        }
        if (this.t === 'maclar') { Object.assign(r, { durum: r.durum || 'planlandi', ic_saha: r.ic_saha !== false, mac_notu: r.mac_notu ?? null, on_onay: !!r.on_onay, updated_at: simdi() }); macDogrula(r); }
        if (this.t === 'goller') { Object.assign(r, { penalti: !!r.penalti, kapak_url: r.kapak_url ?? null, sure_sn: r.sure_sn ?? null, video_url: r.video_url ?? null, video_kaynak: r.video_kaynak ?? null, altyazi_url: r.altyazi_url ?? null }); if (!K.kapakAdresiGecerli(r.kapak_url)) throw { code: '23514', message: 'new row for relation "goller" violates check constraint "goller_kapak_kaynagi"' }; golDogrula(r, null); }
        if (this.t === 'haberler') { Object.assign(r, { manset: !!r.manset, kapak_kaynak: r.kapak_kaynak ?? null }); haberDogrula(r, null); }
      } else if (this.t === 'yorumlar') {
        if (!ctx.uid) throw { code: '42501', message: 'Yorum yazmak için giriş yapın.' };
        // 012: tetikleyici sırası: e-posta onayı, dakikada 5, günde 50, aynı metin 10 dk (sonra kısıtlar ve RLS)
        if (!ctx.onayli) throw { code: '42501', message: 'Yorum yazmak için e-posta adresinizi onaylayın: hesap açarken gelen e-postadaki bağlantıya tıklayın.', hint: 'eposta_onayi' };
        if (ctx.engelli) throw { code: '42501', message: 'Hesabın yorum yazmaya kapatıldı (topluluk kuralları). İtiraz için sitedeki iletişim adresine yaz.', hint: 'engelli' }; // 013
        const metin = String(r.metin || '');
        if (!ctx.admin) {
          const benim = db.yorumlar.filter((x) => x.kullanici_id === ctx.uid);
          const son = (ms) => benim.filter((x) => Date.now() - Date.parse(x.created_at) < ms);
          if (son(60000).length >= K.YORUM_SINIRLARI.dakikada) throw { code: 'P0001', message: 'Çok hızlı yorum yazıyorsunuz. Lütfen bir dakika sonra tekrar deneyin.', hint: 'oran_siniri' };
          if (son(864e5).length >= K.YORUM_SINIRLARI.gunde) throw { code: 'P0001', message: 'Bir hesap günde en fazla 50 yorum yazabilir. Lütfen yarın tekrar deneyin.', hint: 'gun_siniri' };
          if (son(K.YORUM_SINIRLARI.tekrarDakika * 60000).some((x) => K.yorumMetniAyni(x.metin, metin))) throw { code: 'P0001', message: 'Bu yorumu az önce gönderdiniz. Aynı metni 10 dakika içinde tekrar gönderemezsiniz.', hint: 'ayni_yorum' };
        }
        if (!metin.trim() || metin.length > 1000) throw { code: '23514', message: 'new row for relation "yorumlar" violates check constraint "yorumlar_metin_check"' };
        if (r.haber_id && !(db.haberler.find((x) => x.id === r.haber_id) || {}).yayinda) throw rlsHatasi('yorumlar');
        r.kullanici_id = ctx.uid; r.created_at = simdi(); r.duzenlendi = null;
        if (!ctx.admin) r.gizli = false;
        Object.assign(r, { haber_id: r.haber_id ?? null, mac_id: r.mac_id ?? null, gol_id: r.gol_id ?? null, gizli: !!r.gizli });
        // 014: moderasyon (yorum_moderasyon tetikleyicisi): taraftarın yorumu kelime listesine ya da maçın ön onay penceresine takılırsa bekler
        Object.assign(r, { onay_bekliyor: !ctx.admin && onayGerekliMi(db, r), gizleme_nedeni: ctx.admin && r.gizli ? 'yonetici' : null, moderasyon_zamani: null });
        if ([r.haber_id, r.mac_id, r.gol_id].filter((x) => x != null).length !== 1) throw { code: '23514', message: 'new row for relation "yorumlar" violates check constraint "yorum_tek_hedef"' };
      } else if (this.t === 'yorum_sikayetleri') {
        // 013: kişi başına yorum başına bir şikâyet; kendi yorumu şikâyet edilemez; şikâyet eden sunucuda atanır
        if (!ctx.uid) throw { code: '42501', message: 'Şikâyet için giriş yap.' };
        if (ctx.engelli) throw { code: '42501', message: 'Hesabın topluluk kuralları nedeniyle kapatıldı; şikâyet gönderemezsin.', hint: 'engelli' }; // 014
        if (!ctx.onayli) throw rlsHatasi(this.t);
        const y = db.yorumlar.find((x) => x.id === r.yorum_id && this.gorunur(db, ctx, 'yorumlar', x));
        if (!y) throw gecersiz('Yorum bulunamadı.');
        if (y.kullanici_id === ctx.uid) throw gecersiz('Kendi yorumunu şikâyet edemezsin; istersen silebilirsin.');
        r.sikayet_eden = ctx.uid; r.created_at = simdi(); r.neden = r.neden || 'diger';
        if (!['hakaret', 'nefret', 'hedef_gosterme', 'spam', 'kisisel_veri', 'diger'].includes(r.neden)) throw { code: '23514', message: 'check constraint yorum_sikayetleri_neden_check' };
        // 015: kişi başına saatte 10 / günde 30 şikâyet (sikayet_hakki)
        const benimki = db.yorum_sikayetleri.filter((x) => x.sikayet_eden === ctx.uid);
        if (benimki.filter((x) => Date.now() - Date.parse(x.created_at) < 3600e3).length >= K.SIKAYET_SINIRLARI.saatte) throw { code: 'P0001', message: 'Bir saatte en fazla 10 şikâyet gönderebilirsin. Biraz sonra yeniden dene.', hint: 'sikayet_siniri' };
        if (benimki.filter((x) => Date.now() - Date.parse(x.created_at) < 864e5).length >= K.SIKAYET_SINIRLARI.gunde) throw { code: 'P0001', message: 'Bir günde en fazla 30 şikâyet gönderebilirsin. Yarın yeniden dene.', hint: 'sikayet_siniri' };
        if (db.yorum_sikayetleri.some((x) => x.yorum_id === r.yorum_id && x.sikayet_eden === ctx.uid)) throw { code: '23505', message: 'duplicate key value violates unique constraint "yorum_sikayeti_tek"' };
        // 014: farklı 3 hesaptan (yöneticinin son kararından sonra) şikâyet → yorum kendiliğinden gizlenir
        // 015: yalnız şikâyet anında en az 24 saatlik hesaplar sayılır; yönetici yorumu kendiliğinden gizlenmez
        const eskiHesap = (uid, an) => { const pr = db.profiles.find((x) => x.id === uid); return !!pr && Date.parse(pr.created_at) <= Date.parse(an) - K.SIKAYET_SINIRLARI.hesapYasiSaat * 3600e3; };
        const sonra = [...db.yorum_sikayetleri, r].filter((x) => x.yorum_id === r.yorum_id && (!y.moderasyon_zamani || x.created_at > y.moderasyon_zamani) && eskiHesap(x.sikayet_eden, x.created_at));
        const yazanYonetici = (db.profiles.find((x) => x.id === y.kullanici_id) || {}).role === 'admin';
        if (!y.gizli && !yazanYonetici && new Set(sonra.map((x) => x.sikayet_eden)).size >= K.SIKAYET_SINIRLARI.otomatikGizlemeEsigi) Object.assign(y, { gizli: true, gizleme_nedeni: 'sikayet' });
      } else if (this.t === 'reklamlar') {
        if (!ctx.admin) throw rlsHatasi(this.t);
        const an = reklamSimdi().toISOString();
        Object.assign(r, { durum: 'taslak', oncelik: 0, baglanti_url: null, mac_id: null, dugme_metni: null, telefon: null, gorsel_metni: null, gorsel_kucuk_url: null, sektor_onayi: false, ...ham });
        reklamDogrula(db, r, null);
        sektorDogrula(r, null);
        Object.assign(r, { id: uuid(), created_at: an, updated_at: an, olusturan: ctx.uid, yayina_alinma: r.durum === 'yayinda' ? an : null });
      } else {
        throw rlsHatasi(this.t);
      }
      db[this.t].push(r);
      eklenen.push(r);
    }
    dbYaz(db);
    return { satirlar: eklenen };
  }

  _update(db, ctx) {
    const hedefler = this.sec(db, ctx).filter((r) => this.yazabilir(ctx, r));
    for (const r of hedefler) {
      const v = { ...this.veri };
      if (this.t === 'yorumlar' && !ctx.admin) {
        for (const k of ['kullanici_id', 'haber_id', 'mac_id', 'gol_id', 'gizli', 'onay_bekliyor', 'gizleme_nedeni', 'moderasyon_zamani', 'created_at']) {
          if (k in v && v[k] !== r[k]) throw { code: '42501', message: 'Yorumda sadece metni değiştirebilirsiniz.' };
        }
        // 014: yasaklı hesap yorumunu düzenleyemez
        if ('metin' in v && v.metin !== r.metin && ctx.engelli) throw { code: '42501', message: 'Hesabın yorum yazmaya kapatıldı (topluluk kuralları); yorumlarını düzenleyemezsin. İtiraz için sitedeki iletişim adresine yaz.', hint: 'engelli' };
      }
      if (this.t === 'yorumlar' && ctx.admin && (('gizli' in v && v.gizli !== r.gizli) || ('onay_bekliyor' in v && v.onay_bekliyor !== r.onay_bekliyor))) {
        const gizli = 'gizli' in v ? !!v.gizli : r.gizli;
        Object.assign(v, { moderasyon_zamani: simdi(), gizleme_nedeni: !gizli ? null : r.gizli ? r.gizleme_nedeni : 'yonetici' });
      }
      if (this.t === 'yorumlar' && !ctx.admin && 'metin' in v && v.metin !== r.metin && !r.onay_bekliyor) v.onay_bekliyor = onayGerekliMi(db, { ...r, ...v });
      if (this.t === 'yorumlar' && 'metin' in v && v.metin !== r.metin) {
        // 012: yönetici olmayan yalnız 30 dakika içinde ve dakikada en fazla 10 kez düzenler
        if (!ctx.admin) {
          if (Date.now() - Date.parse(r.created_at) > K.YORUM_SINIRLARI.duzenlemeSuresiDakika * 60000) throw { code: 'P0001', message: 'Yorumlar yalnız yazıldıktan sonraki 30 dakika içinde düzenlenebilir.', hint: 'duzenleme_suresi' };
          const son = db.yorum_duzenlemeleri.filter((x) => x.kullanici_id === ctx.uid && Date.now() - Date.parse(x.zaman) < 60000).length;
          if (son >= K.YORUM_SINIRLARI.duzenlemeDakikada) throw { code: 'P0001', message: 'Çok sık düzenleme yapıyorsunuz (dakikada en fazla 10). Lütfen biraz bekleyin.', hint: 'duzenleme_siniri' };
          db.yorum_duzenlemeleri = db.yorum_duzenlemeleri.filter((x) => Date.now() - Date.parse(x.zaman) < 3600e3);
          db.yorum_duzenlemeleri.push({ kullanici_id: ctx.uid, zaman: simdi() });
        }
        v.duzenlendi = simdi();
      }
      if (this.t === 'yorumlar' && 'metin' in v && (!String(v.metin).trim() || String(v.metin).length > 1000)) throw { code: '23514', message: 'check constraint' };
      if (this.t === 'profiles' && 'role' in v && v.role !== r.role && (r.id === ctx.uid || !ctx.admin)) throw { code: '42501', message: 'Rol değiştirme yetkiniz yok.' };
      if (this.t === 'profiles' && 'engelli' in v && v.engelli !== r.engelli && (r.id === ctx.uid || !ctx.admin)) throw { code: '42501', message: 'Yorum yasağını yalnız yönetici değiştirebilir.' };
      if (this.t === 'sakatliklar') { sakatlikDogrula({ ...r, ...v }); v.guncellendi = simdi(); }
      if (this.t === 'goller' && 'kapak_url' in v && !K.kapakAdresiGecerli(v.kapak_url)) throw { code: '23514', message: 'new row for relation "goller" violates check constraint "goller_kapak_kaynagi"' };
      if (this.t === 'goller') golDogrula({ ...r, ...v }, r);
      if (this.t === 'haberler') { const ara = { ...r, ...v }; haberDogrula(ara, r); Object.assign(v, { kaynak: ara.kaynak, kaynak_url: ara.kaynak_url, duzeltme_notu: ara.duzeltme_notu, duzeltme_tarihi: ara.duzeltme_tarihi, kapak_alt: ara.kapak_alt, kaynak_gerekli: ara.kaynak_gerekli }); }
      if (this.t === 'maclar') macDogrula({ ...r, ...v });
      if (this.t === 'oyuncular' && 'foto_url' in v && !K.kapakAdresiGecerli(v.foto_url)) throw { code: '23514', message: 'new row for relation "oyuncular" violates check constraint "oyuncular_foto_kaynagi"' };
      if (this.t === 'profiles' && 'kullanici_adi' in v && v.kullanici_adi !== r.kullanici_adi && K.kullaniciAdiAyrilmis(v.kullanici_adi)) throw { code: '22023', message: 'Bu kullanıcı adı kullanılamaz: yönetici, resmî hesap ya da kulüp gibi görünen adlar ayrılmıştır.' };
      if (this.t === 'profiles') { // 015: ad değiştirme 7 günde bir (yönetici muaf); ad_degisti'yi kişi yazamaz
        const degisti = 'kullanici_adi' in v && v.kullanici_adi !== r.kullanici_adi;
        if (degisti && !ctx.admin && r.ad_degisti && Date.now() - Date.parse(r.ad_degisti) < K.AD_DEGISTIRME_GUN * 864e5) throw { code: 'P0001', message: 'Kullanıcı adını 7 günde bir değiştirebilirsin.', hint: 'ad_degisti' };
        v.ad_degisti = degisti ? simdi() : r.ad_degisti ?? null;
      }
      if (this.t === 'haberler' && !K.kapakAdresiGecerli('kapak_url' in v ? v.kapak_url : r.kapak_url)) throw kapakHatasi();
      if (this.t === 'reklamlar') {
        const ara = { ...r, ...v, id: r.id, created_at: r.created_at, olusturan: r.olusturan };
        reklamDogrula(db, ara, r);
        sektorDogrula(ara, r);
        const an = reklamSimdi().toISOString();
        ara.yayina_alinma = ara.durum === 'yayinda' && r.durum !== 'yayinda' ? an : r.yayina_alinma;
        ara.updated_at = an;
        Object.assign(r, ara);
        continue;
      }
      Object.assign(r, v);
      if (this.t === 'haberler' && r.yayinda && !r.yayin_tarihi) r.yayin_tarihi = simdi();
      if ('updated_at' in r) r.updated_at = simdi();
    }
    dbYaz(db);
    return { satirlar: hedefler };
  }

  _delete(db, ctx) {
    const hedefler = this.sec(db, ctx).filter((r) => this.yazabilir(ctx, r));
    const silinen = new Set(hedefler.map((r) => r.id));
    db[this.t] = db[this.t].filter((r) => !silinen.has(r.id));
    // basamaklı silme
    if (this.t === 'haberler') db.yorumlar = db.yorumlar.filter((y) => !silinen.has(y.haber_id));
    if (this.t === 'maclar') {
      const golIdleri = new Set(db.goller.filter((g) => silinen.has(g.mac_id)).map((g) => g.id));
      db.goller = db.goller.filter((g) => !silinen.has(g.mac_id)); db.yorumlar = db.yorumlar.filter((y) => !silinen.has(y.mac_id) && !golIdleri.has(y.gol_id));
      const reklamlar = new Set(db.reklamlar.filter((x) => silinen.has(x.mac_id)).map((x) => x.id)); // maça özel sponsorluk da gider
      db.reklamlar = db.reklamlar.filter((x) => !reklamlar.has(x.id));
      db.reklam_olaylari = db.reklam_olaylari.filter((o) => !reklamlar.has(o.reklam_id));
    }
    if (this.t === 'reklamlar') db.reklam_olaylari = db.reklam_olaylari.filter((o) => !silinen.has(o.reklam_id));
    if (this.t === 'yorumlar') db.yorum_sikayetleri = db.yorum_sikayetleri.filter((x) => !silinen.has(x.yorum_id));
    if (this.t === 'oyuncular') db.sakatliklar = db.sakatliklar.filter((x) => !silinen.has(x.oyuncu_id));
    if (this.t === 'goller') db.yorumlar = db.yorumlar.filter((y) => !silinen.has(y.gol_id));
    dbYaz(db);
    return { satirlar: hedefler };
  }

  yazabilir(ctx, r) {
    if (['haberler', 'maclar', 'goller', 'reklamlar', 'oyuncular', 'sakatliklar', 'yorum_sikayetleri', 'yorum_kelimeleri'].includes(this.t)) return ctx.admin;
    if (this.t === 'yorumlar') return !!ctx.uid && (r.kullanici_id === ctx.uid || ctx.admin);
    if (this.t === 'profiles') return !!ctx.uid && (r.id === ctx.uid || ctx.admin);
    return false;
  }
}

function kullaniciAdi(db, istek, id) {
  let temel = String(istek || '').trim().replace(/[^A-Za-z0-9_.çğıöşüÇĞİÖŞÜ]/g, '').slice(0, 24);
  if (temel.length < 3 || K.kullaniciAdiAyrilmis(temel)) temel = 'taraftar' + id.replace(/-/g, '').slice(0, 6); // 012: ayrılmış ad
  let aday = temel; let i = 0;
  while (db.profiles.some((p) => p.kullanici_adi.toLowerCase() === aday.toLowerCase())) aday = `${temel}_${++i}`;
  return aday;
}

// ------------------------------------------------------------------ reklam modülü (010_reklamlar.sql taklidi)
const gecersiz = (mesaj) => ({ code: '22023', message: mesaj });
/** 013 sakatliklar kısıtlarının aynası (kaynak ZORUNLU). */
function sakatlikDogrula(r) {
  const h = K.sakatlikHatalari(r);
  if (h.kaynak) throw { code: '23502', message: 'null value in column "kaynak" of relation "sakatliklar" violates not-null constraint' };
  if (Object.keys(h).length) throw { code: '23514', message: 'new row for relation "sakatliklar" violates check constraint' };
}
const kapakHatasi = () => ({ code: '23514', message: 'new row for relation "haberler" violates check constraint "haberler_kapak_kaynagi"' });
const kisitHatasi = (tablo, ad) => ({ code: '23514', message: `new row for relation "${tablo}" violates check constraint "${ad}"` });

/** 014 haberler: kaynak, kaynak_url (https), duzeltme_notu (+ duzeltme_tarihi sunucuda), kapak_alt. */
function haberDogrula(r, eski) {
  for (const k of ['kaynak', 'kaynak_url', 'duzeltme_notu', 'kapak_alt']) r[k] = r[k] == null || String(r[k]).trim() === '' ? null : String(r[k]).trim();
  r.kaynak_gerekli = !!r.kaynak_gerekli;
  if (r.kaynak_gerekli && !r.kaynak) throw gecersiz('Kadro, transfer, sakatlık ya da bilet haberinde kaynak zorunlu (ör. "Kulüp açıklaması").'); // 015 haber_kaynak_kontrol
  const h = K.haberHatalari(r);
  if (h.kaynak) throw kisitHatasi('haberler', 'haberler_kaynak');
  if (h.kaynak_url) throw kisitHatasi('haberler', 'haberler_kaynak_url');
  if (h.duzeltme_notu) throw kisitHatasi('haberler', 'haberler_duzeltme_notu');
  if (h.kapak_alt) throw kisitHatasi('haberler', 'haberler_kapak_alt');
  r.duzeltme_tarihi = !eski || r.duzeltme_notu !== eski.duzeltme_notu ? (r.duzeltme_notu ? simdi() : null) : eski.duzeltme_tarihi ?? null;
}
/** 014 goller: video YouTube ya da depodaki .mp4; videolu golde kaynak zorunlu; altyazı yalnız depodaki .mp4'e, depodan .vtt. */
function golDogrula(r, eski) {
  r.video_kaynak = r.video_kaynak == null || String(r.video_kaynak).trim() === '' ? null : String(r.video_kaynak).trim();
  const videoDegisti = !eski || r.video_url !== eski.video_url;
  if (videoDegisti && !K.golVideoGecerli(r.video_url)) throw kisitHatasi('goller', 'goller_video_deposu');
  if (r.video_url && !r.video_kaynak && (videoDegisti || (eski && eski.video_kaynak))) throw gecersiz('Videonun kaynağını yazın (ör. "Çorum FK resmî YouTube kanalı").');
  if (r.video_kaynak && (r.video_kaynak.length < 3 || r.video_kaynak.length > 120)) throw kisitHatasi('goller', 'goller_video_kaynak');
  if (!K.altyaziAdresiGecerli(r.altyazi_url ?? null)) throw kisitHatasi('goller', 'goller_altyazi');
  if (r.altyazi_url && !/\.mp4$/i.test(r.video_url || '')) throw gecersiz("Altyazı yalnız siteye yüklenen .mp4 videoya eklenir (YouTube altyazısı YouTube'da açılır).");
}
function macDogrula(r) {
  if (r.mac_notu != null && (String(r.mac_notu).trim().length < 2 || String(r.mac_notu).trim().length > 280)) throw kisitHatasi('maclar', 'maclar_mac_notu');
}
/** 014 yorum_onay_gerekli: kelime listesi ya da maçın (gol yorumunda golün maçının) ön onay penceresi. */
function onayGerekliMi(db, y) {
  if (K.kelimeEslesir(y.metin, (db.yorum_kelimeleri || []).map((x) => x.kelime))) return true;
  const macId = y.mac_id || (y.gol_id ? (db.goller.find((g) => g.id === y.gol_id) || {}).mac_id : null);
  const m = macId && db.maclar.find((x) => x.id === macId);
  return !!(m && m.on_onay && K.onOnayPenceresinde(m.tarih));
}
/** 014 reklamlar_sektor tetikleyicisi: onaysız yayın yok; içerik değişince onay sıfırlanır (yeniden onay = sektor_onay_zamani değişir). */
function sektorDogrula(r, eski) {
  const an = reklamSimdi().toISOString();
  r.firma_anahtar = RM.firmaAnahtari(r.firma_adi);
  if (!eski) r.sektor_onay_zamani = r.sektor_onayi ? an : null;
  else {
    const icerik = ['baglanti_url', 'telefon', 'gorsel_url', 'gorsel_kucuk_url', 'kisa_metin', 'gorsel_metni', 'dugme_metni'].some((k) => (r[k] ?? null) !== (eski[k] ?? null)) || r.firma_anahtar !== RM.firmaAnahtari(eski.firma_adi);
    const yeniden = !!r.sektor_onayi && (!eski.sektor_onayi || (r.sektor_onay_zamani ?? null) !== (eski.sektor_onay_zamani ?? null));
    if (yeniden) r.sektor_onay_zamani = an;
    else if (icerik) r.sektor_onayi = false;
    if (!r.sektor_onayi) r.sektor_onay_zamani = null;
    else if (!yeniden) r.sektor_onay_zamani = eski.sektor_onay_zamani ?? null;
  }
  if (r.durum === 'yayinda' && !r.sektor_onayi) throw gecersiz('Yayına almadan önce yasaklı sektör listesini onaylayın (firma, bağlantı, telefon, görsel, görsel yazısı, düğme yazısı ya da metin değiştiyse yeniden).');
}

/** reklamlar_dogrula tetikleyicisinin aynası: hata varsa ilkini fırlatır, satırı yerinde düzeltir. */
function reklamDogrula(db, r, eski) {
  for (const k of ['firma_adi', 'kisa_metin', 'gorsel_url']) r[k] = String(r[k] ?? '').trim();
  r.baglanti_url = r.baglanti_url && String(r.baglanti_url).trim() ? String(r.baglanti_url).trim() : null;
  if (r.mac_id === '') r.mac_id = null;
  const yayinaAliniyor = r.durum === 'yayinda' && (!eski || eski.durum !== 'yayinda');
  const hatalar = RM.reklamDogrula(r, { simdi: reklamSimdi(), yayinaAliniyor });
  const ilk = Object.values(hatalar)[0];
  if (ilk) throw gecersiz(ilk);
  if (!['taslak', 'yayinda', 'duraklatildi'].includes(r.durum)) throw gecersiz('invalid input value for enum reklam_durumu');
  if (r.mac_id != null && !db.maclar.some((m) => m.id === r.mac_id)) throw gecersiz('Seçilen maç bulunamadı.');
}

const reklamSatiri = (r) => ({ id: r.id, firma_adi: r.firma_adi, gorsel_url: r.gorsel_url, kisa_metin: r.kisa_metin, baglanti_url: r.baglanti_url, alan: r.alan, mac_id: r.mac_id,
  dugme_metni: r.dugme_metni ?? null, telefon: r.telefon ?? null, gorsel_metni: r.gorsel_metni ?? null, gorsel_kucuk_url: r.gorsel_kucuk_url ?? null });

function rpcCalistir(db, ctx, ad, p) {
  const simdi = reklamSimdi();
  if (ad === 'is_admin') return { data: ctx.admin, error: null };
  if (ad === 'eposta_onayli') return { data: ctx.onayli, error: null };
  if (ad === 'engelli_mi') return { data: !!ctx.engelli, error: null }; // 013
  if (ad === 'engelli_kullanicilar') {
    if (!ctx.admin) throw { code: '42501', message: 'Bu listeyi yalnızca yöneticiler görebilir.' };
    return { data: db.profiles.filter((p) => p.engelli).map((p) => p.id), error: null };
  }
  if (ad === 'benim_profilim') { // 012: kişinin kendi profili (rol dahil); başkasınınki yok
    const pr = ctx.uid ? db.profiles.find((x) => x.id === ctx.uid) : null;
    return { data: pr ? [{ id: pr.id, kullanici_adi: pr.kullanici_adi, role: pr.role }] : [], error: null };
  }
  if (ad === 'aktif_reklam') {
    const r = RM.reklamSec(db.reklamlar, { alan: p.p_alan, macId: p.p_mac_id }, simdi);
    if (!r) return { data: [], error: null };
    return { data: [reklamSatiri(r)], error: null };
  }
  if (ad === 'aktif_reklamlar') { // 013/014: akışta farklı firmalar (firma_anahtar), en fazla 5
    if (p.p_alan === 'mac_sponsoru') return { data: [], error: null };
    return { data: RM.akisReklamlari(db.reklamlar, Math.max(1, Math.min(Number(p.p_adet) || 3, 5)), simdi, p.p_alan).map(reklamSatiri), error: null };
  }
  if (ad === 'sakatliklar_yonetim') { // 014: yalnız yönetici; açıklama dahil
    if (!ctx.admin) throw { code: '42501', message: 'Bu listeyi yalnızca yöneticiler görebilir.' };
    const l = db.sakatliklar.map((x) => ({ ...x, oyuncu_ad: (db.oyuncular.find((o) => o.id === x.oyuncu_id) || {}).ad || null }));
    l.sort((a, b) => Date.parse(b.guncellendi) - Date.parse(a.guncellendi));
    return { data: l, error: null };
  }
  if (ad === 'reklam_olay_kaydet') { // 014_inceleme_2.sql taklidi
    if (!p.p_reklam_id || !p.p_sayfa_ziyaret_id) throw gecersiz('Eksik bilgi.');
    if (!['gosterim', 'tiklama', 'yerlesim'].includes(p.p_tur)) throw gecersiz('Geçersiz olay türü.');
    const eylem = p.p_tur === 'tiklama' && p.p_eylem ? String(p.p_eylem) : null;
    if (eylem && !['web', 'whatsapp', 'ara'].includes(eylem)) throw gecersiz('Geçersiz tıklama eylemi.');
    const rk = db.reklamlar.find((x) => x.id === p.p_reklam_id);
    if (!rk || !RM.reklamSunulabilir(rk, simdi)) throw gecersiz('Reklam şu an yayında değil.');
    if (rk.alan !== p.p_alan) throw gecersiz('Reklam bu alanda gösterilmiyor.');
    let mac = p.p_mac_id == null || p.p_mac_id === '' ? null : String(p.p_mac_id);
    if (rk.alan === 'mac_sponsoru') { if (rk.mac_id != null && rk.mac_id !== mac) throw gecersiz('Reklam bu maçta gösterilmiyor.'); } else mac = null;
    // 014: yalnız o an gösterilen reklam (akışta ilk 3 farklı firma, öteki alanlarda kazanan)
    const gosterilen = rk.alan === 'ana_akis' ? RM.akisReklamlari(db.reklamlar, RM.SINIRLAR.akisYuvaSayisi, simdi).some((x) => x.id === rk.id)
      : (RM.reklamSec(db.reklamlar, { alan: rk.alan, macId: mac }, simdi) || {}).id === rk.id;
    if (!gosterilen) throw gecersiz('Reklam şu an bu alanda gösterilmiyor (sırada bekliyor).');
    if (ctx.admin) return { data: 'yonetici', error: null }; // 013: yöneticinin bakışı sayılmaz
    const dakika = new Date(Math.floor(simdi.getTime() / 60000) * 60000).toISOString();
    const saat = new Date(Math.floor(simdi.getTime() / 3600e3) * 3600e3).toISOString();
    const sekmeAnahtar = p.p_sekme_id ? String(p.p_sekme_id) : String(p.p_sayfa_ziyaret_id);
    const isaretle = () => {
      const isaret = db.reklam_sinir_dakikalari.find((x) => x.reklam_id === rk.id && x.dakika === dakika && x.tur === (p.p_tur === 'tiklama' ? 'tiklama' : 'gosterim'));
      if (isaret) isaret.reddedilen += 1; else db.reklam_sinir_dakikalari.push({ reklam_id: rk.id, dakika, tur: p.p_tur === 'tiklama' ? 'tiklama' : 'gosterim', reddedilen: 1 });
      dbYaz(db);
      return { data: 'sinir', error: null };
    };
    if (p.p_tur === 'yerlesim') {
      if (db.reklam_yerlesimleri.some((y) => y.reklam_id === rk.id && y.sayfa_ziyaret_id === p.p_sayfa_ziyaret_id)) return { data: 'tekrar', error: null };
      if (db.reklam_yerlesimleri.filter((y) => y.reklam_id === rk.id && y.created_at >= dakika).length >= RM.SINIRLAR.yerlesimDakikaSiniri) return { data: 'sinir', error: null };
      db.reklam_yerlesimleri.push({ id: db.reklam_yerlesimleri.length + 1, reklam_id: rk.id, sayfa_ziyaret_id: p.p_sayfa_ziyaret_id, alan: rk.alan, mac_id: mac, created_at: simdi.toISOString() });
      dbYaz(db);
      return { data: 'kaydedildi', error: null };
    }
    const olaylar = db.reklam_olaylari;
    const sekme = p.p_tur === 'tiklama' && p.p_sekme_id ? String(p.p_sekme_id) : null;
    const sayac = (f) => db.reklam_sekme_sayaclari.filter((x) => x.sekme_id === sekmeAnahtar && x.saat === saat && f(x)).reduce((t, x) => t + x.sayi, 0);
    if (p.p_tur === 'gosterim') {
      if (olaylar.some((o) => o.tur === 'gosterim' && o.reklam_id === rk.id && o.sayfa_ziyaret_id === p.p_sayfa_ziyaret_id)) return { data: 'tekrar', error: null };
      if (sayac((x) => x.reklam_id === rk.id && x.tur === 'gosterim') >= RM.SINIRLAR.sekmeSaatGosterimSiniri) return isaretle();
    } else {
      const esik = simdi.getTime() - 30 * 60000;
      if (olaylar.some((o) => o.tur === 'tiklama' && o.reklam_id === rk.id && (o.eylem ?? null) === eylem && Date.parse(o.created_at) > esik
        && (o.sayfa_ziyaret_id === p.p_sayfa_ziyaret_id || (sekme && o.sekme_id === sekme)))) return { data: 'tekrar', error: null };
      if (olaylar.filter((o) => o.tur === 'tiklama' && o.sayfa_ziyaret_id === p.p_sayfa_ziyaret_id).length >= RM.SINIRLAR.ziyaretTiklamaSiniri) return { data: 'sinir', error: null };
      if (sayac((x) => x.tur === 'tiklama') >= RM.SINIRLAR.sekmeSaatTiklamaSiniri) return isaretle();
    }
    // reklam başına dakika sınırı (bütün ziyaretçiler): fazlası sayılmaz, o dakika işaretlenir
    const dakikaSiniri = p.p_tur === 'tiklama' ? RM.SINIRLAR.tiklamaDakikaSiniri : RM.SINIRLAR.gosterimDakikaSiniri;
    if (olaylar.filter((o) => o.reklam_id === rk.id && o.tur === p.p_tur && o.created_at >= dakika).length >= dakikaSiniri) return isaretle();
    olaylar.push({ id: olaylar.length + 1, reklam_id: rk.id, tur: p.p_tur, sayfa_ziyaret_id: p.p_sayfa_ziyaret_id, alan: rk.alan, mac_id: mac, created_at: simdi.toISOString(), sekme_id: sekme, eylem });
    db.reklam_sekme_sayaclari = db.reklam_sekme_sayaclari.filter((x) => x.sekme_id !== sekmeAnahtar || Date.parse(x.saat) >= Date.parse(saat) - 2 * 3600e3);
    const sy = db.reklam_sekme_sayaclari.find((x) => x.sekme_id === sekmeAnahtar && x.reklam_id === rk.id && x.tur === p.p_tur && x.saat === saat);
    if (sy) sy.sayi += 1; else db.reklam_sekme_sayaclari.push({ sekme_id: sekmeAnahtar, reklam_id: rk.id, tur: p.p_tur, saat, sayi: 1 });
    dbYaz(db);
    return { data: 'kaydedildi', error: null };
  }
  if (ad === 'reklam_raporu' || ad === 'reklam_gunluk_raporu') {
    if (!ctx.admin) throw { code: '42501', message: 'Bu raporu yalnızca yöneticiler görebilir.' };
    const b = p.p_baslangic_tarih, e = p.p_bitis_tarih;
    if (!b || !e || e < b) throw gecersiz('Tarih aralığı geçersiz.');
    const basAn = RM.yerelGiristenIso(b + 'T00:00');
    const sonGun = new Date(Date.parse(e + 'T00:00:00Z') + 864e5).toISOString().slice(0, 10);
    const sonAn = RM.yerelGiristenIso(sonGun + 'T00:00');
    const icinde = (x) => x.created_at >= basAn && x.created_at < sonAn;
    const tumOlay = [...db.reklam_olaylari.filter(icinde), ...db.reklam_yerlesimleri.filter(icinde).map((y) => ({ ...y, tur: 'yerlesim' }))];
    const say = (l) => {
      const g = l.filter((o) => o.tur === 'gosterim').length, t = l.filter((o) => o.tur === 'tiklama');
      // 015: tıklama yapılan farklı sayfa açılışı (günlük toplamdaki gibi gün başına farklı ziyaret)
      const tiklayan = new Set(t.map((o) => RM.istanbulGunu(o.created_at) + '|' + o.sayfa_ziyaret_id)).size;
      return { gosterim: g, tiklama: t.length, tiklayan_ziyaret: tiklayan, tiklama_web: t.filter((o) => o.eylem === 'web').length, tiklama_whatsapp: t.filter((o) => o.eylem === 'whatsapp').length,
        tiklama_ara: t.filter((o) => o.eylem === 'ara').length, yerlesim: l.filter((o) => o.tur === 'yerlesim').length };
    };
    if (ad === 'reklam_gunluk_raporu') {
      const gruplar = new Map();
      for (const o of tumOlay) { const k = RM.istanbulGunu(o.created_at) + '|' + o.reklam_id; if (!gruplar.has(k)) gruplar.set(k, []); gruplar.get(k).push(o); }
      const satirlar = [...gruplar].map(([k, l]) => {
        const [gun, id] = k.split('|'); const rk = db.reklamlar.find((x) => x.id === id);
        if (!rk) return null;
        return { gun, reklam_id: id, firma_adi: rk.firma_adi, firma_anahtar: RM.firmaAnahtari(rk.firma_adi), alan: rk.alan, mac_gunu: db.maclar.some((m) => RM.istanbulGunu(m.tarih) === gun), ...say(l) };
      }).filter(Boolean);
      satirlar.sort((x, y) => x.gun.localeCompare(y.gun) || x.firma_adi.localeCompare(y.firma_adi, 'tr'));
      return { data: satirlar, error: null };
    }
    const satirlar = db.reklamlar.map((r) => {
      const ol = tumOlay.filter((o) => o.reklam_id === r.id);
      const c = say(ol);
      const supheli = new Set(db.reklam_sinir_dakikalari.filter((x) => x.reklam_id === r.id && x.dakika >= basAn && x.dakika < sonAn).map((x) => x.dakika)).size;
      const kesisir = r.durum !== 'taslak' && r.baslangic < sonAn && r.bitis > basAn;
      if (!ol.length && !supheli && !kesisir) return null;
      // 015: dönem ve yayın günü bugünü (TSİ) aşmaz; devam_ediyor (SQL reklam_raporu ile aynı: RM.raporDonemi)
      const dn = RM.raporDonemi(b, e, r, simdi);
      const gun = dn.yayin_gun;
      return { reklam_id: r.id, firma_adi: r.firma_adi, alan: r.alan, mac_id: r.mac_id, gosterim: c.gosterim, tiklama: c.tiklama, tiklama_orani: RM.tiklamaOrani(c.gosterim, c.tiklayan_ziyaret), supheli_dakika: supheli,
        firma_anahtar: RM.firmaAnahtari(r.firma_adi), tiklama_web: c.tiklama_web, tiklama_whatsapp: c.tiklama_whatsapp, tiklama_ara: c.tiklama_ara, yerlesim: c.yerlesim,
        gorunurluk_orani: c.yerlesim > 0 ? Math.round((Math.min(c.gosterim, c.yerlesim) * 10000) / c.yerlesim) / 100 : null,
        yayin_baslangic: r.baslangic, yayin_bitis: r.bitis, donem_baslangic: dn.donem_baslangic, donem_bitis: dn.donem_bitis, yayin_gun: gun,
        gunluk_ortalama_gosterim: gun ? Math.round((c.gosterim * 10) / gun) / 10 : null, tiklayan_ziyaret: c.tiklayan_ziyaret, devam_ediyor: dn.devam_ediyor };
    }).filter(Boolean);
    satirlar.sort((x, y) => y.gosterim - x.gosterim || x.firma_adi.localeCompare(y.firma_adi, 'tr'));
    return { data: satirlar, error: null };
  }
  if (ad === 'reklam_ham_satir_alarmi') { // 015: yalnız yönetici; son N günde reklam başına günde eşiği aşan ham satır
    if (!ctx.admin) throw { code: '42501', message: 'Bu listeyi yalnızca yöneticiler görebilir.' };
    const gunSayisi = Math.max(1, Math.min(Number(p.p_gun_sayisi) || 7, 90));
    const sinir = RM.istanbulGunu(new Date(simdi.getTime() - (gunSayisi - 1) * 864e5));
    const say = new Map();
    for (const o of [...db.reklam_olaylari, ...db.reklam_yerlesimleri]) {
      const g = RM.istanbulGunu(o.created_at);
      if (g < sinir) continue;
      const k = g + '|' + o.reklam_id; say.set(k, (say.get(k) || 0) + 1);
    }
    const l = [...say].filter(([, n]) => n > RM.SINIRLAR.hamSatirAlarmi).map(([k, n]) => {
      const [gun, id] = k.split('|');
      return { gun, reklam_id: id, firma_adi: (db.reklamlar.find((x) => x.id === id) || {}).firma_adi || '', ham_satir: n, esik: RM.SINIRLAR.hamSatirAlarmi };
    });
    l.sort((a, b2) => b2.gun.localeCompare(a.gun) || b2.ham_satir - a.ham_satir);
    return { data: l, error: null };
  }
  return { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.' + ad } };
}

function kurtarmaOturumu() {
  try {
    const m = /sahte_kurtarma=([^&]+)/.exec(location.hash || '');
    if (!m) return;
    const email = decodeURIComponent(m[1]).toLowerCase();
    const db = dbOku();
    const k = db.kullanicilar.find((x) => x.email === email);
    if (k) oturumYaz({ access_token: 'sahte-' + k.id, token_type: 'bearer', user: { id: k.id, email: k.email, email_confirmed_at: k.email_confirmed_at || null } });
    history.replaceState(null, '', location.pathname + location.search);
  } catch (e) { /* yok say */ }
}

export function createClient() {
  if (typeof location !== 'undefined') kurtarmaOturumu();
  const dinleyiciler = [];
  const haberVer = (olay, oturum) => dinleyiciler.forEach((f) => { try { f(olay, oturum); } catch (e) {} });

  const istemci = {
    baglam(db) {
      const o = oturumOku();
      const uid = o && o.user ? o.user.id : null;
      const p = uid ? db.profiles.find((x) => x.id === uid) : null;
      const k = uid ? db.kullanicilar.find((x) => x.id === uid) : null;
      return { uid, admin: !!p && p.role === 'admin', onayli: !!(k && k.email_confirmed_at), engelli: !!p && !!p.engelli };
    },
    from(tablo) { return new Sorgu(istemci, tablo); },
    rpc(ad, p = {}) {
      const soz = (async () => {
        await bekle();
        // Test kolu: localStorage 'sahte_reklam_gecikme' (ms) akış reklam sorgusunu geciktirir (geç yerleşme / kayma denemesi)
        if (/^aktif_reklam/.test(ad)) { let g = 0; try { g = Number(localStorage.getItem('sahte_reklam_gecikme') || 0) || 0; } catch (e) {} if (g) await new Promise((c) => setTimeout(c, g)); }
        const db = dbOku();
        try { return rpcCalistir(db, istemci.baglam(db), ad, p || {}); } catch (e) { return { data: null, error: e.code ? e : { message: String(e.message || e) } }; }
      })();
      // supabase-js gibi .single() / .maybeSingle() (tablo döndüren RPC'ler için)
      const tek = (belki) => soz.then((r) => {
        if (r.error || !Array.isArray(r.data)) return r;
        if (r.data.length === 1) return { data: r.data[0], error: null };
        if (!r.data.length && belki) return { data: null, error: null };
        return { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } };
      });
      soz.single = () => tek(false);
      soz.maybeSingle = () => tek(true);
      return soz;
    },
    auth: {
      async getSession() { await bekle(); return { data: { session: oturumOku() }, error: null }; },
      async getUser() { await bekle(); const o = oturumOku(); return { data: { user: o ? o.user : null }, error: null }; },
      async signInWithPassword({ email, password }) {
        await bekle();
        const db = dbOku();
        const k = db.kullanicilar.find((x) => x.email === String(email).toLowerCase());
        if (!k || k.sifre !== password) return { data: { user: null, session: null }, error: { message: 'Invalid login credentials', status: 400 } };
        if (!k.email_confirmed_at && onayGerekli()) return { data: { user: null, session: null }, error: { message: 'Email not confirmed', status: 400 } };
        const oturum = { access_token: 'sahte-' + k.id, token_type: 'bearer', user: { id: k.id, email: k.email, email_confirmed_at: k.email_confirmed_at || null } };
        oturumYaz(oturum); haberVer('SIGNED_IN', oturum);
        return { data: { user: oturum.user, session: oturum }, error: null };
      },
      async signUp({ email, password, options = {} }) {
        await bekle();
        const db = dbOku();
        email = String(email).toLowerCase();
        if (db.kullanicilar.some((x) => x.email === email)) return { data: { user: null, session: null }, error: { message: 'User already registered', status: 422 } };
        if (String(password).length < 6) return { data: { user: null, session: null }, error: { message: 'Password should be at least 6 characters.', status: 422 } };
        const id = uuid();
        // "Confirm email" kapalıysa Supabase e-postayı kayıtta onaylı sayar ve oturum açar; açıksa onay bağlantısını bekler
        const onayli = onayGerekli() ? null : simdi();
        db.kullanicilar.push({ id, email, sifre: password, email_confirmed_at: onayli });
        // Rol her zaman taraftar: metadata içindeki rol yok sayılır (sunucudaki tetikleyici gibi)
        db.profiles.push({ id, kullanici_adi: kullaniciAdi(db, options.data && options.data.kullanici_adi, id), role: 'taraftar', created_at: simdi() });
        dbYaz(db);
        if (!onayli) return { data: { user: { id, email, email_confirmed_at: null }, session: null }, error: null };
        const oturum = { access_token: 'sahte-' + id, token_type: 'bearer', user: { id, email, email_confirmed_at: onayli } };
        oturumYaz(oturum); haberVer('SIGNED_IN', oturum);
        return { data: { user: oturum.user, session: oturum }, error: null };
      },
      async signOut() { await bekle(); oturumYaz(null); haberVer('SIGNED_OUT', null); return { error: null }; },
      // Şifre sıfırlama: gerçekte e-posta gider; burada test kolu localStorage 'sahte_sifre_sifirlama' = { email, redirectTo }.
      // sifre.html?sahte=1#sahte_kurtarma=<e-posta> adresi, Supabase'in e-postadaki bağlantısı gibi kurtarma oturumu açar.
      async resetPasswordForEmail(email, ops = {}) {
        await bekle();
        try { localStorage.setItem('sahte_sifre_sifirlama', JSON.stringify({ email: String(email).toLowerCase(), redirectTo: ops.redirectTo || null })); } catch (e) {}
        return { data: {}, error: null };
      },
      async updateUser(degisiklik = {}) {
        await bekle();
        const o = oturumOku();
        if (!o) return { data: { user: null }, error: { message: 'Auth session missing!', status: 401 } };
        const db = dbOku();
        const k = db.kullanicilar.find((x) => x.id === o.user.id);
        if (degisiklik.password != null) {
          if (String(degisiklik.password).length < 6) return { data: { user: null }, error: { message: 'Password should be at least 6 characters.', status: 422 } };
          k.sifre = String(degisiklik.password);
        }
        dbYaz(db);
        return { data: { user: o.user }, error: null };
      },
      onAuthStateChange(f) { dinleyiciler.push(f); return { data: { subscription: { unsubscribe() { const i = dinleyiciler.indexOf(f); if (i >= 0) dinleyiciler.splice(i, 1); } } } }; },
    },
    storage: {
      from(kova) {
        return {
          async upload(yol, dosya, ops = {}) {
            await bekle();
            const db = dbOku();
            if (!istemci.baglam(db).admin) return { data: null, error: { message: 'new row violates row-level security policy', statusCode: '403' } };
            const tur = ops.contentType || dosya.type;
            // kova sınırları: reklam-gorselleri 2 MB jpeg/png/webp (010), haber-gorselleri 3 MB jpeg/png/webp/gif (002)
            const sinir = kova === 'reklam-gorselleri' ? { turler: RM.SINIRLAR.gorselTurleri, bayt: RM.SINIRLAR.gorselEnBuyukBayt }
              : kova === 'haber-gorselleri' ? { turler: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'], bayt: 3 * 1024 * 1024 }
                : kova === 'gol-videolari' ? { turler: ['video/mp4', 'text/vtt'], bayt: 50 * 1024 * 1024 } : null; // 014
            if (sinir) {
              if (!sinir.turler.includes(tur)) return { data: null, error: { message: 'mime type ' + tur + ' is not supported', statusCode: '415' } };
              if (dosya.size > sinir.bayt) return { data: null, error: { message: 'The object exceeded the maximum allowed size', statusCode: '413' } };
            }
            const veri = await new Promise((ok, red) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = red; fr.readAsDataURL(dosya); });
            try { localStorage.setItem(DEPO_ANAHTAR + kova + '/' + yol, veri); } catch (e) { return { data: null, error: { message: 'Sahte depo dolu: ' + e.message } }; }
            return { data: { path: yol, fullPath: kova + '/' + yol }, error: null };
          },
          getPublicUrl(yol) {
            // Gerçek Supabase gibi depo adresi (haber kapağı ve reklam görseli doğrulaması yalnız bu adresi kabul eder);
            // tarayıcı testleri bu adresi sahte depodan (localStorage) sunar.
            return { data: { publicUrl: `${SAHTE_PROJE}/storage/v1/object/public/${kova}/${yol}` } };
          },
          async remove(yollar) {
            await bekle();
            const db = dbOku();
            if (!istemci.baglam(db).admin) return { data: [], error: null };
            yollar.forEach((y) => { try { localStorage.removeItem(DEPO_ANAHTAR + kova + '/' + y); } catch (e) {} });
            return { data: yollar.map((name) => ({ name })), error: null };
          },
        };
      },
    },
  };
  return istemci;
}
