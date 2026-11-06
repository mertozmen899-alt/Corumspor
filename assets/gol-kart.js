// Gol kartları (ana sayfa şeridi, gol arşivi, maç ve gol sayfası): her gol TEK bağlantı → gol.html?id=
// Videolu gol: 16:9 kapak (sitenin kendi görseli; YouTube küçük resmi İSTENMEZ), oynat simgesi, dakika ve süre rozeti.
// Videosuz gol: kompakt satır. Bağlantının adı TEK cümle (aria-label): "Ali Örnek, 67. dakika · Kurgu Gençlik 1 – 1 Çorum FK,
// 29 Ekim · Kafa golü · video 0:38" (rakip bir kez, başıboş virgül yok). Tarih her yerde aynı biçim: "29 Ekim".
import { h, simge, OYNAT_YOLU, dakikaMetni, dakikaOkunus, sureMetni, kapakKaynagi, kapakGorseli, tarihYaz, evSahibiDeplasman, skorMetni, eslesmeOgeleri, youtubeKimlik, mp4Mu } from './ortak.js';

/** 018: gol anının süresi (sn): YouTube aralığı varsa onun uzunluğu, yoksa sure_sn. */
export const golSuresi = (gol) => (Number.isInteger(gol.video_baslangic_sn) && Number.isInteger(gol.video_bitis_sn) && gol.video_bitis_sn > gol.video_baslangic_sn
  ? gol.video_bitis_sn - gol.video_baslangic_sn : gol.sure_sn);
const asistMetni = (gol) => (typeof gol.asist === 'string' && gol.asist.trim() ? 'Asist: ' + gol.asist.trim() : null);

export const videoVar = (gol) => !!gol.video_url && (!!youtubeKimlik(gol.video_url) || mp4Mu(gol.video_url));

export function macEtiketi(mac) {
  if (!mac) return '';
  const [ev, dep] = evSahibiDeplasman(mac);
  const skor = skorMetni(mac);
  return `${ev} ${skor || '–'} ${dep}`;
}

/** Kartlarda tek tarih biçimi: "29 Ekim" (yıl yok). */
export const kartTarihi = (iso) => tarihYaz(iso, { saat: false, yil: false });

function golAdi(gol, mac, { video, sure }) {
  const tur = gol.penalti ? 'Penaltı' : gol.aciklama ? gol.aciklama.replace(/\.$/, '') : null;
  return [`${gol.oyuncu}, ${dakikaOkunus(gol)}`, asistMetni(gol), mac ? `${macEtiketi(mac)}, ${kartTarihi(mac.tarih)}` : null, tur, video ? (sure ? `video ${sure}` : 'video') : 'video yok']
    .filter(Boolean).join(' · ');
}

/**
 * ops.ilk: ilk ekrandaki kart (eager + fetchpriority=high: gol arşivinde LCP görseli; performans 3. tur 2). ops.macSatiri: false ise maç satırı yazılmaz (gol arşivinde grup başlığı zaten maçı
 * söylüyor: tekrar yok). ops.kutu: kartın CSS genişliği (sizes; varsayılan şeritteki kart genişliği).
 */
export function golKarti(gol, mac, { ilk = false, macSatiri = true, kutu = null } = {}) {
  const href = 'gol.html?id=' + encodeURIComponent(gol.id);
  const sure = sureMetni(golSuresi(gol));
  if (!videoVar(gol)) {
    return h('a', { class: 'gol-satir', href, 'data-gol-id': gol.id, 'aria-label': golAdi(gol, mac, { video: false }) },
      h('span', { class: 'dakika', 'aria-hidden': 'true' }, dakikaMetni(gol)),
      h('span', null, h('span', { class: 'oyuncu' }, gol.oyuncu), asistMetni(gol) ? h('span', { class: 'asist' }, ' · ', asistMetni(gol)) : null),
      gol.penalti ? h('span', { class: 'rozet' }, 'Penaltı') : h('span', { 'aria-hidden': 'true', class: 'soluk' }, '›'));
  }
  const genislik = kutu || Math.min((typeof innerWidth === 'number' ? innerWidth : 400) * 0.8, 320);
  const k = kapakKaynagi(gol.kapak_url, { varsayilan: 480, kutu: genislik });
  return h('a', { class: 'video-kart', href, 'data-gol-id': gol.id, 'aria-label': golAdi(gol, mac, { video: true, sure }) },
    h('span', { class: 'kapak' },
      k ? kapakGorseli(k, { width: '480', height: '270', loading: ilk ? 'eager' : 'lazy', fetchpriority: ilk ? 'high' : null })
        : h('span', { class: 'kapak-yok', 'aria-hidden': 'true' }),
      h('span', { class: 'dakika-rozet', 'aria-hidden': 'true' }, dakikaMetni(gol)),
      h('span', { class: 'oynat', 'aria-hidden': 'true' }, simge(OYNAT_YOLU, { dolu: true })),
      sure ? h('span', { class: 'sure-rozet', 'aria-hidden': 'true' }, sure) : null),
    h('span', { class: 'baslik' }, gol.oyuncu, gol.penalti ? ' · Penaltı' : gol.aciklama ? ' · ' + gol.aciklama.replace(/\.$/, '') : ''),
    asistMetni(gol) ? h('span', { class: 'asist-satir' }, asistMetni(gol)) : null,
    macSatiri && mac ? h('span', { class: 'meta' }, eslesmeOgeleri(mac), ' · ', kartTarihi(mac.tarih)) : null);
}

/**
 * 018: gol arşivinde açılan maçın kompakt gol satırı: "59' Alexandros Kyziridis · Asist: Fredy ▶" → gol.html?id= (video orada,
 * dokununca, yalnız gol anı). Bağlantının adı golKarti ile aynı tek cümle (maç bilgisi dahil).
 */
export function golAniSatiri(gol, mac) {
  const video = videoVar(gol);
  const sure = sureMetni(golSuresi(gol));
  return h('a', { class: 'gol-satir gol-ani', href: 'gol.html?id=' + encodeURIComponent(gol.id), 'data-gol-id': gol.id, 'aria-label': golAdi(gol, mac, { video, sure }) },
    h('span', { class: 'dakika', 'aria-hidden': 'true' }, dakikaMetni(gol)),
    h('span', null, h('span', { class: 'oyuncu' }, gol.oyuncu), gol.penalti ? h('span', { class: 'soluk' }, ' (P)') : null,
      asistMetni(gol) ? h('span', { class: 'asist' }, ' · ', asistMetni(gol)) : null),
    h('span', { class: video ? 'oynat-isaret' : 'soluk', 'aria-hidden': 'true' }, video ? '▶' : '›'));
}
