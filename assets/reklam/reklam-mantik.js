// Çorumspor reklam modülü: saf mantık (DOM yok, ağ yok). Tarayıcıda ve Node'da aynı dosya çalışır.
// Buradaki kurallar veritabanındaki kuralların AYNASIDIR (supabase/migrations/010_reklamlar.sql, 012, 013, 014_inceleme_2.sql, 015_son_tur.sql).
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
  // Sayım (SQL reklam_olay_kaydet ile aynı; 015_son_tur.sql, test karşılaştırır):
  ziyaretTiklamaSiniri: 5,      // bir sayfa ziyaretinde en fazla 5 tıklama (bütün reklamlar)
  gosterimDakikaSiniri: 120,    // bir reklama dakikada en fazla 120 gösterim (bütün ziyaretçiler; maç günü zirvesi eksik sayılmasın); fazlası sayılmaz
  tiklamaDakikaSiniri: 20,      // bir reklama dakikada en fazla 20 tıklama (bütün ziyaretçiler); fazlası sayılmaz
  yerlesimDakikaSiniri: 240,    // bir reklama dakikada en fazla 240 yerleşim (kartın konduğu sayfa açılışı)
  hamSatirAlarmi: 20000,        // 015: bir reklamın bir günde bundan fazla ham satırı (olay + yerleşim) panelde alarm (reklam_ham_satir_alarmi)
  bakimGecikmeGun: 2,           // 015: son gece bakımı (reklam_gunluk_toplanan) bundan eskiyse panel uyarır (pg_cron çalışmıyor olabilir)
  sekmeSaatGosterimSiniri: 20,  // bir sekmede bir reklama saatte en fazla 20 gösterim
  sekmeSaatTiklamaSiniri: 10,   // bir sekmede saatte en fazla 10 tıklama (bütün reklamlar)
  akisYuvaSayisi: 3,            // akışta en fazla 3 farklı firma (ana.js 3 yuva açar; sunucu yalnız bunlara olay yazar)
  // 013_tasarim.sql:
  dugmeMetniEnAz: 2, dugmeMetniEnUzun: 24, // isteğe bağlı düğme yazısı (boşsa "Ayrıntılar")
  gorselMetniEnUzun: 200,       // görseldeki yazı / alt metin
  kisaMetinOnerilen: 110,       // akış ve maç kartında önerilen üst sınır (telefonda ~3 satır; sınır 160)
});

/** Alana göre önerilen kısa metin uzunluğu (panel uyarır, kaydı engellemez). Haber sonu kartı geniş: sınırın tamamı. */
export const ALAN_METIN_ONERISI = Object.freeze({ ana_akis: 110, mac_sponsoru: 110, haber_sonu: 160 });

/** Yayına almadan önce yöneticinin onaylaması gereken yasaklı sektörler (başkan ve reklamveren değerlendirmesi; docs/REKLAM.md). */
export const YASAKLI_SEKTORLER = Object.freeze([
  ['bahis', 'Bahis, şans oyunu, "tahmin" sitesi, kripto / fan token değil'],
  ['alkol', 'Alkollü içki değil; menüsünün öne çıkan kısmı alkol olan işletme değil'],
  ['tutun', 'Tütün, nargile, e-sigara değil; açılış sayfasında (menüde) de yok'],
  ['kulup', "Çorum FK'nın sponsorlarıyla çakışan marka değil (inşaat, savunma/havacılık, iklimlendirme: kulübün yazılı onayı olmadan alınmaz); kulüp adı/arması/oyuncu kullanılmıyor"],
]);

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

// ---------------------------------------------------------------------------
// Firma anahtarı (SQL: public.firma_anahtari / reklamlar.firma_anahtar, 014): akış, rapor ve CSV aynı firmayı aynı sayar.
// Türkçe duyarlı küçük harf + katlama (İ/I/ı/i → i, Ç → c …), baş/son boşluk yok, art arda boşluk tek. Yerel ayardan bağımsız.
// ---------------------------------------------------------------------------
const KATLA_KAYNAK = 'ABCDEFGHIJKLMNOPQRSTUVWXYZÇĞİÖŞÜÂÎÛçğıöşüâîû';
const KATLA_HEDEF = 'abcdefghijklmnopqrstuvwxyzcgiosuaiucgiosuaiu';
export function firmaAnahtari(ad) {
  return [...String(ad ?? '')].map((c) => { const i = KATLA_KAYNAK.indexOf(c); return i < 0 ? c : KATLA_HEDEF[i]; }).join('')
    .replace(/[ \t\n\r\f\v]+/g, ' ').trim();
}

/** Akışta gösterilen reklamlar (SQL aktif_reklamlar'ın aynası): her firmadan en iyisi, aynı sırayla, en fazla adet. */
export function akisReklamlari(reklamlar, adet = SINIRLAR.akisYuvaSayisi, simdi = new Date(), alan = 'ana_akis') {
  const goruldu = new Set();
  const sonuc = [];
  let kalan = (reklamlar || []).filter((r) => reklamSunulabilir(r, simdi) && r.alan === alan);
  while (kalan.length && sonuc.length < adet) {
    const r = reklamSec(kalan, { alan }, simdi);
    kalan = kalan.filter((x) => x.id !== r.id);
    const f = firmaAnahtari(r.firma_adi);
    if (goruldu.has(f)) continue;
    goruldu.add(f);
    sonuc.push(r);
  }
  return sonuc;
}

/** 015 (reklamveren 4): akış yuvasının ne kadar görüldüğü. Ana sayfa ilk anda 6 haber açar (assets/sayfa/ana.js SAYFA_BOYU);
 *  1. yuva 3. haberden sonra (ilk sayfada), 2. ve 3. yuva 11. ve 19. haberden sonra (yalnız "Daha fazla haber" açılınca). */
export function akisYuvaNotu(sira) {
  return sira === 1 ? 'Akışta 1. sponsor: ilk sayfada' : `Akışta ${sira}. sponsor: yalnız "Daha fazla haber" açılınca`;
}

/** Bu reklam şu an yuvasında gösteriliyor mu? (SQL reklam_su_an_gosterilen) Akışta: { sira: 1..3 }; öteki alanlarda { sira: 1 } ya da null. */
export function gosterimSirasi(reklamlar, r, simdi = new Date()) {
  if (!r || !reklamSunulabilir(r, simdi)) return null;
  if (r.alan === 'ana_akis') {
    const i = akisReklamlari(reklamlar, SINIRLAR.akisYuvaSayisi, simdi).findIndex((x) => x.id === r.id);
    return i < 0 ? null : { sira: i + 1 };
  }
  const k = reklamSec(reklamlar, { alan: r.alan, macId: r.mac_id }, simdi);
  return k && k.id === r.id ? { sira: 1 } : null;
}

/**
 * Yeni / düzenlenen reklam yayın süresi boyunca HİÇ görünür mü? (KARARLAR: dönüşüm yok; kazanan en yüksek öncelik, sonra en yeni.)
 * Aday yayına alınmış sayılır (en yeni). Süredeki her değişim anında (başlangıç, ötekilerin başlama/bitişi) denenir.
 * Döner: { gorunur: true } ya da { gorunur: false, onde: [{ firma_adi, oncelik }] } (yuvayı dolduran, en yüksek öncelikliler).
 */
export function alanDolulugu(reklamlar, aday, simdi = new Date()) {
  const b = Math.max(ms(aday.baslangic), ms(simdi)), e = ms(aday.bitis);
  if (!(e > b)) return { gorunur: false, onde: [] };
  const digerleri = (reklamlar || []).filter((x) => x.id !== aday.id && x.durum === 'yayinda' && x.alan === aday.alan);
  const anlar = new Set([b]);
  for (const x of digerleri) for (const t of [ms(x.baslangic), ms(x.bitis)]) if (t > b && t < e) anlar.add(t);
  // Yayında olan reklam düzenleniyorsa yayına alınma anı korunur (sunucu da korur); değilse en yeni sayılır
  const yayinda = aday.durum === 'yayinda' && aday.yayina_alinma;
  const yeni = { ...aday, durum: 'yayinda', yayina_alinma: yayinda ? aday.yayina_alinma : new Date(Math.max(ms(simdi), Date.now()) + 1000).toISOString() };
  let onde = [];
  for (const t of [...anlar].sort((x, y) => x - y)) {
    const an = new Date(t);
    const hepsi = [...digerleri, yeni];
    if (gosterimSirasi(hepsi, yeni, an)) return { gorunur: true };
    const kazananlar = aday.alan === 'ana_akis' ? akisReklamlari(hepsi, SINIRLAR.akisYuvaSayisi, an) : [reklamSec(hepsi, { alan: aday.alan, macId: aday.mac_id }, an)].filter(Boolean);
    if (!onde.length) onde = kazananlar.map((x) => ({ firma_adi: x.firma_adi, oncelik: x.oncelik ?? 0 }));
  }
  return { gorunur: false, onde };
}

/** Metinde web adresi / alan adı var mı (bağlantısız reklamda metinde ve görselde de adres yazılmaz; başkan 2)? */
const ADRES_DESENI = /(https?:\/\/|www\.|\b[a-z0-9çğıöşü-]+\.(com|net|org|info|biz|app|io|co|me|shop|online|site|store|cafe|tr|com\.tr|net\.tr|org\.tr)\b)/i;
export function metindeAdresVar(metin) { return ADRES_DESENI.test(String(metin ?? '')); }

/** Tıklanan düğmenin eylemi (SQL reklam_olaylari.eylem): tel: → 'ara', WhatsApp → 'whatsapp', öteki https → 'web'. */
export function tiklamaEylemi(href) {
  if (typeof href !== 'string' || !href) return null;
  if (/^tel:/i.test(href)) return 'ara';
  if (whatsappBaglantisiMi(href)) return 'whatsapp';
  return /^https:\/\//i.test(href) ? 'web' : null;
}

/** Kartın üstündeki etiket. Akış: "Sponsor" (gerçek metin, ilk öğe); haber sonu: "Reklam"; maç: "Maçın sponsoru" / "Sponsor". */
export function reklamEtiketi(r) {
  if (r && r.alan === 'mac_sponsoru') return r.mac_id != null && r.mac_id !== '' ? 'Maçın sponsoru' : 'Sponsor';
  if (r && r.alan === 'ana_akis') return 'Sponsor';
  return 'Reklam';
}

/** Maç alanındaki sponsor kartının alt satırı: kulübün sponsoruyla karışmasın (başkanın değerlendirmesi). */
export const MAC_SPONSORU_NOTU = "Uygulama sponsoru · Çorum FK'nın sponsoru değildir";

/** "+905321234567" → "tel:+905321234567" (yalnız SQL'deki biçim). */
export function telAdresi(telefon) {
  return typeof telefon === 'string' && /^\+90[2-5][0-9]{9}$/.test(telefon) ? 'tel:' + telefon : null;
}
/** Panel girdisi "0364 213 19 19" → "+903642131919" ya da null. */
export function telefonKaydi(girdi) {
  const no = telefonuUluslararasiYap(girdi);
  return no ? '+' + no : null;
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
  else if (metin.length > SINIRLAR.kisaMetinEnUzun) h.kisa_metin = `Kısa metin en fazla ${SINIRLAR.kisaMetinEnUzun} karakter olabilir (${metin.length - SINIRLAR.kisaMetinEnUzun} karakter fazla).`;
  const dm = (r.dugme_metni || '').trim();
  if (dm && (dm.length < SINIRLAR.dugmeMetniEnAz || dm.length > SINIRLAR.dugmeMetniEnUzun)) h.dugme_metni = `Düğme yazısı ${SINIRLAR.dugmeMetniEnAz}-${SINIRLAR.dugmeMetniEnUzun} karakter olmalı (boş bırakılırsa "Ayrıntılar").`;
  if (r.telefon != null && r.telefon !== '' && !telAdresi(r.telefon)) h.telefon = 'Telefon numarası geçersiz. Örnek: 0364 213 19 19';
  if (r.gorsel_metni && String(r.gorsel_metni).length > SINIRLAR.gorselMetniEnUzun) h.gorsel_metni = `Görseldeki yazı en fazla ${SINIRLAR.gorselMetniEnUzun} karakter olabilir.`;
  if (r.gorsel_kucuk_url && !gorselAdresiGecerli(r.gorsel_kucuk_url)) h.gorsel_url = 'Görseli "Dosya seç" ile yeniden yükleyin.';
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

/** Tıklama oranı yüzdesi (2 basamak) ya da gösterim yoksa null. 015: pay = tıklama yapılan FARKLI sayfa açılışı (tiklayan_ziyaret;
 *  bir kişi aynı kartta birden çok düğmeye basabilir), oran %100'ü aşmaz (SQL reklam_raporu ile aynı). */
export function tiklamaOrani(gosterim, tiklayan) {
  const g = Number(gosterim) || 0;
  if (g <= 0) return null;
  return Math.round((Math.min(Number(tiklayan) || 0, g) * 10000) / g) / 100;
}

/**
 * 015 (performans 7): haber sonu görselinin sizes değeri. Kart içerik sütununda (en çok 720 px) yaklaşık 58 px dolgu/kenar payıyla
 * çizilir; kart 560 px'ten genişse görsel %44'tür (stil.css @container). Etkin piksel oranı 2 ile sınırlanır (ortak.js boyutlar() gibi):
 * 360 px telefonda ~302 px kutu, DPR 3'te de 480 kopyası seçilir (1200 değil).
 */
export function haberSonuBoyutu(ekranGenisligi, dpr = 1) {
  const g = Number(ekranGenisligi) > 0 ? Number(ekranGenisligi) : 360;
  const kart = Math.max(120, Math.min(g, 720) - 58);
  const kutu = kart >= 560 ? Math.round(kart * 0.44) : kart;
  const d = Number(dpr) > 0 ? Number(dpr) : 1;
  return Math.max(1, Math.round((kutu * Math.min(d, 2)) / d)) + 'px';
}

/** "YYYY-MM-DD" → "GG.AA.YYYY" (015: CSV'de TEK tarih biçimi; Excel tr-TR tarih olarak okur). */
export function gunNoktali(gun) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(gun ?? ''));
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
}
/** An → "GG.AA.YYYY SS:DD" (İstanbul). */
export function anNoktali(an) {
  if (an == null || an === '') return '';
  const p = istanbulParcalari(an);
  return `${iki(p.gun)}.${iki(p.ay)}.${p.yil} ${iki(p.saat)}:${iki(p.dakika)}`;
}

/**
 * 015 (reklamveren 2): rapor dönemi = istenen aralığın reklamın yayınıyla kesişen günleri, BUGÜNÜ (TSİ) aşmaz (SQL reklam_raporu aynası).
 * Döner { donem_baslangic, donem_bitis, yayin_gun, devam_ediyor } (kesişme yoksa dönem null, gün 0).
 * devam_ediyor: reklam yayında, bitmedi ve dönem bugünde kesildi ("(devam ediyor)").
 */
export function raporDonemi(istenenBas, istenenBit, r, simdi = new Date()) {
  const bugun = istanbulGunu(simdi);
  const db = [istenenBas, istanbulGunu(r.baslangic)].sort().pop();
  const ds = [istenenBit, istanbulGunu(new Date(ms(r.bitis) - 1)), bugun].sort()[0];
  if (!(ds >= db)) return { donem_baslangic: null, donem_bitis: null, yayin_gun: 0, devam_ediyor: false };
  const gun = Math.round((Date.parse(ds + 'T00:00:00Z') - Date.parse(db + 'T00:00:00Z')) / 864e5) + 1;
  return { donem_baslangic: db, donem_bitis: ds, yayin_gun: gun, devam_ediyor: ds === bugun && r.durum === 'yayinda' && ms(r.bitis) > ms(simdi) };
}

/** Dönemi yazar: "6 Kasım 2026 – 18 Kasım 2026 (devam ediyor)" (bicim: gün yazma işlevi). */
export function donemMetni(s, bicim = gunNoktali) {
  if (!s || !s.donem_baslangic || !s.donem_bitis) return '';
  return `${bicim(s.donem_baslangic)} – ${bicim(s.donem_bitis)}${s.devam_ediyor ? ' (devam ediyor)' : ''}`;
}

/**
 * 015 (reklamveren 5): "1 hafta" / "1 ay" düğmesinin bitişi: başlangıç gününden 7 gün / 1 ay sonraki günün 23:59'u (TSİ).
 * Döner <input type="datetime-local"> değeri. Ay sonunda taşmaz (31 Ocak + 1 ay = 28/29 Şubat).
 */
export function sureBitisi(baslangic, { gun = 0, ay = 0 } = {}) {
  const p = istanbulParcalari(baslangic);
  const hedefAy = new Date(Date.UTC(p.yil, p.ay - 1 + ay, 1));
  const ayinSonGunu = new Date(Date.UTC(hedefAy.getUTCFullYear(), hedefAy.getUTCMonth() + 1, 0)).getUTCDate();
  const t = new Date(Date.UTC(hedefAy.getUTCFullYear(), hedefAy.getUTCMonth(), Math.min(p.gun, ayinSonGunu) + gun));
  return `${t.toISOString().slice(0, 10)}T23:59`;
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

/** Rapor satırlarını tek firmaya süzer (014: ortak firma anahtarı; SQL'deki reklamlar.firma_anahtar ile aynı). */
export function firmaSuz(satirlar, firma) {
  if (!firma) return [...(satirlar || [])];
  const k = firmaAnahtari(firma);
  return (satirlar || []).filter((s) => (s.firma_anahtar || firmaAnahtari(s.firma_adi)) === k);
}

const tarihYaz = (an) => anNoktali(an);
const sayiBicimi = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 });

/** reklam_raporu satırlarından Excel'de düzgün açılan CSV metni (BOM dahil). Reklam verene giden dosya TEK firmalık olmalı
 *  (firmaSuz); panel de CSV'yi yalnız bir firma seçiliyken indirir.
 *  ops.donem: istenen aralık "2026-11-01 – 2026-11-30"; satırda reklamın yayınla KESİŞEN dönemi yazılır (donem_baslangic/bitis varsa).
 *  ops.macAdi: mac_id → "22 Ekim 2026 19:00 · Çorum FK – Örnekköy Spor" (maç sponsoru satırları için)
 *  014: yayın başlangıç / bitiş / gün, sayfa açılışı (yerleşim), görünürlük oranı, günlük ortalama, tıklama eylemleri (web / WhatsApp / ara).
 *  "Şüpheli trafik (sayılmadı, dk)": reklamın sınıra takıldığı dakika sayısı; dosyadaki her satırda 0 ise sütun hiç yazılmaz. */
export function raporCsv(satirlar, { donem = '', macAdi = () => '' } = {}) {
  const liste = satirlar || [];
  const supheliVar = liste.some((s) => Number(s.supheli_dakika) > 0);
  // 015: tek tarih biçimi (GG.AA.YYYY, saatli alanlarda GG.AA.YYYY SS:DD); ISO verilen yedek dönem de çevrilir
  const yedekDonem = String(donem || '').replace(/(\d{4})-(\d{2})-(\d{2})/g, '$3.$2.$1');
  const basliklar = ['Firma', 'Alan', 'Maç', 'Dönem', 'Yayın başlangıç', 'Yayın bitiş', 'Yayın günü', 'Sayfa açılışı', 'Gösterim', 'Görünürlük oranı (%)',
    'Günlük ortalama gösterim', 'Tıklama', 'Web tıklaması', 'WhatsApp tıklaması', 'Arama', 'Tıklama yapılan sayfa açılışı', 'Tıklama oranı (%)'];
  if (supheliVar) basliklar.push('Şüpheli trafik (sayılmadı, dk)');
  const satir = [basliklar.map((b) => csvHucre(b, true)).join(';')];
  for (const s of liste) {
    const tiklayan = s.tiklayan_ziyaret != null ? Number(s.tiklayan_ziyaret) : Number(s.tiklama) || 0;
    const oran = s.tiklama_orani != null ? Number(s.tiklama_orani) : tiklamaOrani(s.gosterim, tiklayan);
    const d = donemMetni(s) || yedekDonem;
    const hucreler = [
      csvHucre(s.firma_adi, true),
      csvHucre(ALANLAR[s.alan] || s.alan, true),
      csvHucre(s.alan === 'mac_sponsoru' ? (s.mac_id ? macAdi(s.mac_id) || '' : 'Tüm maçlar') : '', true),
      csvHucre(d, true),
      csvHucre(tarihYaz(s.yayin_baslangic), true),
      csvHucre(tarihYaz(s.yayin_bitis), true),
      csvHucre(s.yayin_gun != null ? Number(s.yayin_gun) : '', false),
      csvHucre(Number(s.yerlesim) || 0, false),
      csvHucre(Number(s.gosterim) || 0, false),
      csvHucre(oranBicimle(s.gorunurluk_orani), false),
      csvHucre(s.gunluk_ortalama_gosterim != null ? sayiBicimi.format(Number(s.gunluk_ortalama_gosterim)) : '', false),
      csvHucre(Number(s.tiklama) || 0, false),
      csvHucre(Number(s.tiklama_web) || 0, false),
      csvHucre(Number(s.tiklama_whatsapp) || 0, false),
      csvHucre(Number(s.tiklama_ara) || 0, false),
      csvHucre(tiklayan, false),
      csvHucre(oranBicimle(oran), false),
    ];
    if (supheliVar) hucreler.push(csvHucre(Number(s.supheli_dakika) || 0, false));
    satir.push(hucreler.join(';'));
  }
  return '\ufeff' + satir.join('\r\n') + '\r\n';
}

/** Günlük rapor satırlarından (reklam_gunluk_raporu) en yoğun gün: { gun, gosterim, mac } ya da null.
 *  015: eşitlikte maç günü öne geçer (sonra en erken gün). */
export function enYogunGun(gunluk) {
  const t = new Map();
  for (const g of gunluk || []) {
    const x = t.get(g.gun) || { gun: g.gun, gosterim: 0, mac: false };
    x.gosterim += Number(g.gosterim) || 0; x.mac = x.mac || !!g.mac_gunu;
    t.set(g.gun, x);
  }
  let en = null;
  for (const x of [...t.values()].sort((a, b) => a.gun.localeCompare(b.gun))) {
    if (x.gosterim > 0 && (!en || x.gosterim > en.gosterim || (x.gosterim === en.gosterim && x.mac && !en.mac))) en = x;
  }
  return en;
}

/**
 * Sekme kimliği: tıklama tekrarını (aynı reklama 30 dk içinde tekrar tıklama) sayfalar arasında yakalamak için.
 * Rastgele bir uuid; kişisel veri değildir, kimseyle eşleştirilemez. sessionStorage'da durur: yalnız bu sekmeye aittir,
 * sekme kapanınca tarayıcı siler (localStorage/çerez YOK). sessionStorage kapalıysa (gizli mod, engelli depolama)
 * bellekte tutulur, yani sayfa yüklemesiyle sınırlı kalır. 014'ten beri gösterimle de gönderilir: sunucu yalnız sekme başına
 * saatlik sınır için en çok 2 saat sayaçta tutar (gösterim kaydına yazılmaz; tekillik sayfa ziyareti başına).
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
