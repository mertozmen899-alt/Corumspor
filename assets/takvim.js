// 019: "Takvime ekle" (.ics) ve ay takvimi yardımcıları. Saf: DOM'a / ağa dokunmaz (indirme yalnız takvimIndir çağrılınca, tarayıcıda).
// .ics tarayıcıda üretilir (Blob): dış istek yok, kişisel veri yok, hiçbir şey saklanmaz. Saat: maclar.tarih zaman dilimli
// (timestamptz) olduğu için doğrudan UTC'ye çevrilir (DTSTART:...Z); takvim uygulaması kendi saat dilimine göre gösterir
// (Türkiye'de 16:00 maç = 13:00Z). Etkinlik 2 saat. Satırlar CRLF, 75 bayttan uzun satır RFC 5545'e göre katlanır.
import { TAKIM_ADI } from './ayar.js';

export const MAC_ETKINLIK_SURESI = 2 * 3600e3;
const TZ = 'Europe/Istanbul';

/** 2026-11-08T13:00:00Z → 20261108T130000Z */
export function icsZaman(t) {
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) throw new Error('Geçersiz tarih');
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}
/** RFC 5545 metin kaçışı: \ ; , ve satır sonu. */
export function icsKacis(s) {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}
/** 75 bayttan uzun satırı katlar (devam satırı tek boşlukla başlar); çok baytlı harf (ç, ş, –) ortasından bölünmez. */
export function icsKatla(satir) {
  const kod = new TextEncoder();
  const parca = [];
  let simdiki = '', bayt = 0, sinir = 75;
  for (const c of satir) {
    const n = kod.encode(c).length;
    if (bayt + n > sinir) { parca.push(simdiki); simdiki = ' '; bayt = 1; sinir = 75; }
    simdiki += c; bayt += n;
  }
  parca.push(simdiki);
  return parca.join('\r\n');
}

/**
 * Maçın .ics metni. mac: { id, rakip, tarih, stadyum, ic_saha, organizasyon }, adres: maç sayfasının tam adresi.
 * simdi: DTSTAMP (test için). Başlık "Çorum FK – Rakip".
 */
export function macIcs(mac, adres, simdi = Date.now()) {
  const bas = Date.parse(mac.tarih);
  const aciklama = [mac.organizasyon, mac.ic_saha ? 'İç saha maçı' : 'Deplasman maçı', adres ? `Maç sayfası: ${adres}` : null,
    'Saat değişebilir: kesin bilgi için kulübün resmî duyurusuna bak.'].filter(Boolean).join('\n');
  const satirlar = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Corumspor Taraftar//Mac takvimi//TR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:mac-${mac.id}@corumspor-taraftar`,
    `DTSTAMP:${icsZaman(simdi)}`,
    `DTSTART:${icsZaman(bas)}`,
    `DTEND:${icsZaman(bas + MAC_ETKINLIK_SURESI)}`,
    `SUMMARY:${icsKacis(`${TAKIM_ADI} – ${mac.rakip}`)}`,
    mac.stadyum ? `LOCATION:${icsKacis(mac.stadyum)}` : null,
    `DESCRIPTION:${icsKacis(aciklama)}`,
    adres ? `URL:${adres}` : null,
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean);
  return satirlar.map(icsKatla).join('\r\n') + '\r\n';
}

/** Dosya adı: corum-fk-fenerbahce-2026-11-08.ics (Türkiye günü, yalnız ASCII). */
export function icsDosyaAdi(mac) {
  const harf = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' };
  const ad = (s) => String(s).toLocaleLowerCase('tr-TR').replace(/[çğıöşü]/g, (c) => harf[c]).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const gun = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(mac.tarih));
  return `${ad(TAKIM_ADI)}-${ad(mac.rakip)}-${gun}.ics`;
}

/** Tarayıcıda indirir (Blob + geçici bağlantı). Ağ isteği yok. */
export function takvimIndir(mac, adres) {
  const url = URL.createObjectURL(new Blob([macIcs(mac, adres)], { type: 'text/calendar;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = icsDosyaAdi(mac);
  a.hidden = true;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60e3);
}

/** Maçın Türkiye takvimindeki günü: 'YYYY-AA-GG'. */
export function trGunu(t) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
}
/**
 * Ay ızgarası (Pazartesi başlar): [{ gun: 'YYYY-AA-GG' | null, no }...] 7'nin katı hücre. yil, ay: 1-12.
 */
export function ayIzgarasi(yil, ay) {
  const ilk = new Date(Date.UTC(yil, ay - 1, 1));
  const gunSayisi = new Date(Date.UTC(yil, ay, 0)).getUTCDate();
  const bosluk = (ilk.getUTCDay() + 6) % 7; // Pazartesi = 0
  const hucre = Array.from({ length: bosluk }, () => ({ gun: null, no: null }));
  for (let g = 1; g <= gunSayisi; g++) hucre.push({ gun: `${yil}-${String(ay).padStart(2, '0')}-${String(g).padStart(2, '0')}`, no: g });
  while (hucre.length % 7) hucre.push({ gun: null, no: null });
  return hucre;
}
