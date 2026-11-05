// SADECE TEST: supabase-js yerine geçen sahte istemci (ES modülü).
// assets/istemci.js bunu localhost'ta ?sahte=1 ile yükler. Gerçek sunucuya istek atmaz.
// Veri tarayıcının localStorage'ında durur (her yeni tarayıcı bağlamı temiz başlar).
// Sunucudaki RLS kurallarının KABA bir benzerini uygular ki arayüz akışları denenebilsin;
// asıl güvenlik testleri testler/sql/20_rls_testleri.sql içindedir.
// Hazır hesaplar (şifre hepsinde: sifre1234):
//   yonetici@ornek.test (admin, kirmizi_simsek), taraftar@ornek.test (ayse_19), burak@ornek.test (burak),
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

const gunOnce = (n, saatUtc = 9) => { const d = new Date(Date.now() - n * 864e5); d.setUTCHours(saatUtc, 0, 0, 0); return d.toISOString(); };

// İlk gerçek reklam veren: Narçil Cafe (https://narcil.net). Metin, bağlantı ve görseller docs/ilk-reklam/NASIL.md ile aynı.
// Bağlantı menünün kahve bölümüne gider: menü sitesi nargileyle (tütün) açılıyor, tütün reklamı yasak (4207 sayılı Kanun).
// İndirim/kupon yok (Mert kararı, 5 Kasım 2026: maça özel indirim yapılmayacak).
export const ORNEK_REKLAM = Object.freeze({
  firma_adi: 'Narçil Cafe',
  kisa_metin: "Espresso bazlı kahveler, Türk kahvesi, bitki çayları, taze sıkılmış meyve suları ve tatlılar. Menünün tamamı narcil.net'te.",
  baglanti_url: 'https://narcil.net/?category=espresso-bazli-kahveler',
  yatay: 'ornek/narcil-1200x628.webp',
  kare: 'ornek/narcil-600x600.webp',
});
const ORNEK_REKLAM_KAPALI = 'sahte_ornek_reklam';
const R = (n) => `aaaaaaaa-2222-4000-8000-00000000000${n}`;

function ornekReklamlar() {
  try { if (localStorage.getItem(ORNEK_REKLAM_KAPALI) === 'yok') return []; } catch (e) {}
  const bas = gunOnce(7), bit = new Date(Date.now() + 60 * 864e5).toISOString();
  const depo = (yol) => `${SAHTE_PROJE}/storage/v1/object/public/reklam-gorselleri/${yol}`;
  const r = (n, alan, mac_id, gorsel) => ({
    id: R(n), firma_adi: ORNEK_REKLAM.firma_adi, kisa_metin: ORNEK_REKLAM.kisa_metin, gorsel_url: depo(gorsel),
    baglanti_url: ORNEK_REKLAM.baglanti_url, alan, mac_id, baslangic: bas, bitis: bit, durum: 'yayinda', oncelik: 10,
    yayina_alinma: bas, created_at: bas, updated_at: bas, olusturan: U.admin,
  });
  return [
    r(1, 'ana_akis', null, ORNEK_REKLAM.yatay),
    r(2, 'haber_sonu', null, ORNEK_REKLAM.yatay),
    r(3, 'mac_sponsoru', M(1), ORNEK_REKLAM.kare),
  ];
}

function baslangicVerisi() {
  const haber = (n, baslik, ozet, gun, kapak, yayinda = true) => ({
    id: H(n), baslik, ozet, kapak_url: kapak, yayinda, yayin_tarihi: yayinda ? gunOnce(gun) : null,
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
      { id: U.admin, kullanici_adi: 'kirmizi_simsek', role: 'admin', created_at: gunOnce(30) },
      { id: U.ayse, kullanici_adi: 'ayse_19', role: 'taraftar', created_at: gunOnce(20) },
      { id: U.burak, kullanici_adi: 'burak', role: 'taraftar', created_at: gunOnce(10) },
      { id: U.dilek, kullanici_adi: 'dilek', role: 'taraftar', created_at: gunOnce(2) },
    ],
    haberler: [
      haber(1, 'Test haberi 1: Sahada üç puan', 'Örnekköy Spor karşısında 2-1 galibiyet.', 1, 'assets/img/ornek-kapak-1.svg'),
      haber(2, 'Test haberi 2: Deplasmanda bir puan', 'Kurgu Gençlik ile 1-1.', 2, 'assets/img/ornek-kapak-2.svg'),
      haber(3, 'Test haberi 3: Biletler satışta', 'Deneme FK maçının biletleri.', 3, null),
      haber(4, 'Test haberi 4: Antrenman notları', 'Hazırlıklar sürüyor.', 4, null),
      haber(5, 'Test haberi 5: Altyapıdan haberler', null, 5, 'assets/img/ornek-kapak-1.svg'),
      haber(6, 'Test haberi 6: Tribün koreografisi', 'Taraftar grupları hazırlanıyor.', 6, null),
      haber(7, 'Test haberi 7: Sezon öncesi', 'Eski bir haber.', 7, null),
      haber(8, 'Taslak test haberi', 'Bunu sadece yönetici görür.', 0, null, false),
    ],
    maclar: [
      { id: M(1), rakip: 'Örnekköy Spor', tarih: gunOnce(14, 16), stadyum: 'Çorum Şehir Stadyumu', ic_saha: true, organizasyon: 'Lig (örnek)', corum_skor: 2, rakip_skor: 1, durum: 'bitti' },
      { id: M(2), rakip: 'Kurgu Gençlik', tarih: gunOnce(7, 13), stadyum: 'Kurgu Arena', ic_saha: false, organizasyon: 'Lig (örnek)', corum_skor: 1, rakip_skor: 1, durum: 'bitti' },
      { id: M(3), rakip: 'Deneme FK', tarih: gunOnce(-5, 16), stadyum: 'Çorum Şehir Stadyumu', ic_saha: true, organizasyon: 'Lig (örnek)', corum_skor: null, rakip_skor: null, durum: 'planlandi' },
      { id: M(4), rakip: 'Hayal Belediyespor', tarih: gunOnce(-12, 11), stadyum: 'Hayal İlçe Stadı', ic_saha: false, organizasyon: 'Kupa (örnek)', corum_skor: null, rakip_skor: null, durum: 'planlandi' },
      { id: M(5), rakip: 'Eski Rakip', tarih: gunOnce(21, 16), stadyum: 'Eski Stat', ic_saha: false, organizasyon: 'Lig (örnek)', corum_skor: 0, rakip_skor: 2, durum: 'bitti' },
    ].map((m) => ({ ...m, created_at: gunOnce(40), updated_at: gunOnce(40) })),
    goller: [
      { id: G(1), mac_id: M(1), oyuncu: 'Ali Örnek', dakika: 23, ek_dakika: null, penalti: false, video_url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ', aciklama: 'Ceza sahası dışından sert vuruş.', created_at: gunOnce(14) },
      { id: G(2), mac_id: M(1), oyuncu: 'Mehmet Deneme', dakika: 90, ek_dakika: 2, penalti: true, video_url: null, aciklama: null, created_at: gunOnce(14) },
      { id: G(3), mac_id: M(2), oyuncu: 'Ali Örnek', dakika: 67, ek_dakika: null, penalti: false, video_url: 'https://ornek.test/videolar/gol-3.mp4', aciklama: 'Kafa golü.', created_at: gunOnce(7) },
    ],
    yorumlar: [
      { id: Y(1), kullanici_id: U.ayse, haber_id: H(1), mac_id: null, metin: 'Harika maçtı! <b>kalın değil</b>', gizli: false, created_at: gunOnce(1, 10), duzenlendi: null },
      { id: Y(2), kullanici_id: U.burak, haber_id: H(1), mac_id: null, metin: 'Bu yorum gizlendi (kural dışı).', gizli: true, created_at: gunOnce(1, 11), duzenlendi: null },
      { id: Y(3), kullanici_id: U.burak, haber_id: null, mac_id: M(1), metin: 'Tribünler muhteşemdi.', gizli: false, created_at: gunOnce(13, 20), duzenlendi: null },
    ],
    depo: {},
    reklamlar: ornekReklamlar(),
    reklam_olaylari: [],
    reklam_sinir_dakikalari: [],
    yorum_duzenlemeleri: [],
  };
}

// ------------------------------------------------------------------ depolama
function dbOku() {
  try {
    const s = localStorage.getItem(DB_ANAHTAR);
    if (s) {
      const db = JSON.parse(s);
      for (const k of ['reklamlar', 'reklam_olaylari', 'reklam_sinir_dakikalari', 'yorum_duzenlemeleri']) db[k] = db[k] || [];
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
  yorumlar: { profiles: ['kullanici_id', 'tek'], haberler: ['haber_id', 'tek'], maclar: ['mac_id', 'tek'] },
  goller: { maclar: ['mac_id', 'tek'] },
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
    if (tablo === 'reklamlar' || tablo === 'reklam_olaylari') return ctx.admin; // RLS: yalnız yönetici okur
    if (tablo === 'yorumlar') {
      const haberAcik = !r.haber_id || (db.haberler.find((x) => x.id === r.haber_id) || {}).yayinda;
      return (!r.gizli && haberAcik) || r.kullanici_id === ctx.uid || ctx.admin;
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
    this.secim = '*'; // gömme zaten yapıldı
    return { satirlar: s };
  }

  _insert(db, ctx) {
    const eklenen = [];
    for (const ham of this.veri) {
      const r = { id: uuid(), created_at: simdi(), ...ham };
      if (['haberler', 'maclar', 'goller'].includes(this.t)) {
        if (!ctx.admin) throw rlsHatasi(this.t);
        if (this.t === 'haberler') {
          Object.assign(r, { ozet: r.ozet ?? null, kapak_url: r.kapak_url ?? null, govde: r.govde ?? '', yayinda: !!r.yayinda, yazar_id: ctx.uid, updated_at: simdi() });
          r.yayin_tarihi = r.yayinda ? simdi() : null;
          if (!K.kapakAdresiGecerli(r.kapak_url)) throw kapakHatasi();
        }
        if (this.t === 'maclar') Object.assign(r, { durum: r.durum || 'planlandi', ic_saha: r.ic_saha !== false, updated_at: simdi() });
        if (this.t === 'goller') Object.assign(r, { penalti: !!r.penalti });
      } else if (this.t === 'yorumlar') {
        if (!ctx.uid) throw { code: '42501', message: 'Yorum yazmak için giriş yapın.' };
        // 012: tetikleyici sırası: e-posta onayı, dakikada 5, günde 50, aynı metin 10 dk (sonra kısıtlar ve RLS)
        if (!ctx.onayli) throw { code: '42501', message: 'Yorum yazmak için e-posta adresinizi onaylayın: hesap açarken gelen e-postadaki bağlantıya tıklayın.', hint: 'eposta_onayi' };
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
        Object.assign(r, { haber_id: r.haber_id ?? null, mac_id: r.mac_id ?? null, gizli: !!r.gizli });
      } else if (this.t === 'reklamlar') {
        if (!ctx.admin) throw rlsHatasi(this.t);
        const an = reklamSimdi().toISOString();
        Object.assign(r, { durum: 'taslak', oncelik: 0, baglanti_url: null, mac_id: null, ...ham });
        reklamDogrula(db, r, null);
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
        for (const k of ['kullanici_id', 'haber_id', 'mac_id', 'gizli', 'created_at']) {
          if (k in v && v[k] !== r[k]) throw { code: '42501', message: 'Yorumda sadece metni değiştirebilirsiniz.' };
        }
      }
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
      if (this.t === 'profiles' && 'kullanici_adi' in v && v.kullanici_adi !== r.kullanici_adi && K.kullaniciAdiAyrilmis(v.kullanici_adi)) throw { code: '22023', message: 'Bu kullanıcı adı kullanılamaz: yönetici, resmî hesap ya da kulüp gibi görünen adlar ayrılmıştır.' };
      if (this.t === 'haberler' && !K.kapakAdresiGecerli('kapak_url' in v ? v.kapak_url : r.kapak_url)) throw kapakHatasi();
      if (this.t === 'reklamlar') {
        const ara = { ...r, ...v, id: r.id, created_at: r.created_at, olusturan: r.olusturan };
        reklamDogrula(db, ara, r);
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
      db.goller = db.goller.filter((g) => !silinen.has(g.mac_id)); db.yorumlar = db.yorumlar.filter((y) => !silinen.has(y.mac_id));
      const reklamlar = new Set(db.reklamlar.filter((x) => silinen.has(x.mac_id)).map((x) => x.id)); // maça özel sponsorluk da gider
      db.reklamlar = db.reklamlar.filter((x) => !reklamlar.has(x.id));
      db.reklam_olaylari = db.reklam_olaylari.filter((o) => !reklamlar.has(o.reklam_id));
    }
    if (this.t === 'reklamlar') db.reklam_olaylari = db.reklam_olaylari.filter((o) => !silinen.has(o.reklam_id));
    dbYaz(db);
    return { satirlar: hedefler };
  }

  yazabilir(ctx, r) {
    if (['haberler', 'maclar', 'goller', 'reklamlar'].includes(this.t)) return ctx.admin;
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
const kapakHatasi = () => ({ code: '23514', message: 'new row for relation "haberler" violates check constraint "haberler_kapak_kaynagi"' });

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

function rpcCalistir(db, ctx, ad, p) {
  const simdi = reklamSimdi();
  if (ad === 'is_admin') return { data: ctx.admin, error: null };
  if (ad === 'eposta_onayli') return { data: ctx.onayli, error: null };
  if (ad === 'benim_profilim') { // 012: kişinin kendi profili (rol dahil); başkasınınki yok
    const pr = ctx.uid ? db.profiles.find((x) => x.id === ctx.uid) : null;
    return { data: pr ? [{ id: pr.id, kullanici_adi: pr.kullanici_adi, role: pr.role }] : [], error: null };
  }
  if (ad === 'aktif_reklam') {
    const r = RM.reklamSec(db.reklamlar, { alan: p.p_alan, macId: p.p_mac_id }, simdi);
    if (!r) return { data: [], error: null };
    return { data: [{ id: r.id, firma_adi: r.firma_adi, gorsel_url: r.gorsel_url, kisa_metin: r.kisa_metin, baglanti_url: r.baglanti_url, alan: r.alan, mac_id: r.mac_id }], error: null };
  }
  if (ad === 'reklam_olay_kaydet') {
    if (!p.p_reklam_id || !p.p_sayfa_ziyaret_id) throw gecersiz('Eksik bilgi.');
    if (p.p_tur !== 'gosterim' && p.p_tur !== 'tiklama') throw gecersiz('Geçersiz olay türü.');
    const rk = db.reklamlar.find((x) => x.id === p.p_reklam_id);
    if (!rk || !RM.reklamSunulabilir(rk, simdi)) throw gecersiz('Reklam şu an yayında değil.');
    if (rk.alan !== p.p_alan) throw gecersiz('Reklam bu alanda gösterilmiyor.');
    let mac = p.p_mac_id == null || p.p_mac_id === '' ? null : String(p.p_mac_id);
    if (rk.alan === 'mac_sponsoru') { if (rk.mac_id != null && rk.mac_id !== mac) throw gecersiz('Reklam bu maçta gösterilmiyor.'); } else mac = null;
    const olaylar = db.reklam_olaylari;
    const sekme = p.p_tur === 'tiklama' && p.p_sekme_id ? String(p.p_sekme_id) : null;
    if (p.p_tur === 'gosterim') {
      if (olaylar.some((o) => o.tur === 'gosterim' && o.reklam_id === rk.id && o.sayfa_ziyaret_id === p.p_sayfa_ziyaret_id)) return { data: 'tekrar', error: null };
    } else {
      const esik = simdi.getTime() - 30 * 60000;
      if (olaylar.some((o) => o.tur === 'tiklama' && o.reklam_id === rk.id && Date.parse(o.created_at) > esik
        && (o.sayfa_ziyaret_id === p.p_sayfa_ziyaret_id || (sekme && o.sekme_id === sekme)))) return { data: 'tekrar', error: null };
      if (olaylar.filter((o) => o.tur === 'tiklama' && o.sayfa_ziyaret_id === p.p_sayfa_ziyaret_id).length >= RM.SINIRLAR.ziyaretTiklamaSiniri) return { data: 'sinir', error: null };
    }
    // 012: reklam başına dakika sınırı (bütün ziyaretçiler): fazlası sayılmaz, o dakika işaretlenir
    const dakika = new Date(Math.floor(simdi.getTime() / 60000) * 60000).toISOString();
    const dakikaSiniri = p.p_tur === 'tiklama' ? RM.SINIRLAR.tiklamaDakikaSiniri : RM.SINIRLAR.gosterimDakikaSiniri;
    if (olaylar.filter((o) => o.reklam_id === rk.id && o.tur === p.p_tur && o.created_at >= dakika).length >= dakikaSiniri) {
      const isaret = db.reklam_sinir_dakikalari.find((x) => x.reklam_id === rk.id && x.dakika === dakika && x.tur === p.p_tur);
      if (isaret) isaret.reddedilen += 1; else db.reklam_sinir_dakikalari.push({ reklam_id: rk.id, dakika, tur: p.p_tur, reddedilen: 1 });
      dbYaz(db);
      return { data: 'sinir', error: null };
    }
    olaylar.push({ id: olaylar.length + 1, reklam_id: rk.id, tur: p.p_tur, sayfa_ziyaret_id: p.p_sayfa_ziyaret_id, alan: rk.alan, mac_id: mac, created_at: simdi.toISOString(), sekme_id: sekme });
    dbYaz(db);
    return { data: 'kaydedildi', error: null };
  }
  if (ad === 'reklam_raporu') {
    if (!ctx.admin) throw { code: '42501', message: 'Bu raporu yalnızca yöneticiler görebilir.' };
    const b = p.p_baslangic_tarih, e = p.p_bitis_tarih;
    if (!b || !e || e < b) throw gecersiz('Tarih aralığı geçersiz.');
    const basAn = RM.yerelGiristenIso(b + 'T00:00');
    const sonGun = new Date(Date.parse(e + 'T00:00:00Z') + 864e5).toISOString().slice(0, 10);
    const sonAn = RM.yerelGiristenIso(sonGun + 'T00:00');
    const satirlar = db.reklamlar.map((r) => {
      const ol = db.reklam_olaylari.filter((o) => o.reklam_id === r.id && o.created_at >= basAn && o.created_at < sonAn);
      const g = ol.filter((o) => o.tur === 'gosterim').length, t = ol.length - g;
      const supheli = new Set(db.reklam_sinir_dakikalari.filter((x) => x.reklam_id === r.id && x.dakika >= basAn && x.dakika < sonAn).map((x) => x.dakika)).size;
      const kesisir = r.durum !== 'taslak' && r.baslangic < sonAn && r.bitis > basAn;
      if (!ol.length && !supheli && !kesisir) return null;
      return { reklam_id: r.id, firma_adi: r.firma_adi, alan: r.alan, mac_id: r.mac_id, gosterim: g, tiklama: t, tiklama_orani: RM.tiklamaOrani(g, t), supheli_dakika: supheli };
    }).filter(Boolean);
    satirlar.sort((x, y) => y.gosterim - x.gosterim || x.firma_adi.localeCompare(y.firma_adi, 'tr'));
    return { data: satirlar, error: null };
  }
  return { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.' + ad } };
}

export function createClient() {
  const dinleyiciler = [];
  const haberVer = (olay, oturum) => dinleyiciler.forEach((f) => { try { f(olay, oturum); } catch (e) {} });

  const istemci = {
    baglam(db) {
      const o = oturumOku();
      const uid = o && o.user ? o.user.id : null;
      const p = uid ? db.profiles.find((x) => x.id === uid) : null;
      const k = uid ? db.kullanicilar.find((x) => x.id === uid) : null;
      return { uid, admin: !!p && p.role === 'admin', onayli: !!(k && k.email_confirmed_at) };
    },
    from(tablo) { return new Sorgu(istemci, tablo); },
    rpc(ad, p = {}) {
      const soz = (async () => {
        await bekle();
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
              : kova === 'haber-gorselleri' ? { turler: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'], bayt: 3 * 1024 * 1024 } : null;
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
