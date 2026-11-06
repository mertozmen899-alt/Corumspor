// Son görülen herkese açık veri (haber başlıkları, maçlar, gol arşivindeki son maçlar, son açılan 3 haber ve 5 gol) tarayıcıda: sayfa önce bunu ANINDA çizer, sonra
// ağdan tazeler. İnternet yokken ya da stadyumda yavaşken ekran boş kalmaz ("son güncelleme" ile). Kişisel veri YOK.
// Tek anahtar: localStorage 'son-veri-v1' (gizlilik.html tablosunda). En çok ~30 KB; sığmazsa eski kayıt silinir.
import { sahteMod } from './istemci.js';

const ANAHTAR = sahteMod ? 'son-veri-v1-sahte' : 'son-veri-v1'; // test modu gerçek veriyle karışmasın
const EN_COK = 30 * 1024;

function hepsi() {
  try { return JSON.parse(localStorage.getItem('son-veri-v1' === ANAHTAR ? 'son-veri-v1' : ANAHTAR) || '{}') || {}; } catch (e) { return {}; }
}

/** { zaman, veri } ya da null. */
export function sonVeri(ad) {
  const k = hepsi()[ad];
  return k && k.zaman && k.veri !== undefined ? k : null;
}

/** ops.yerAc: false ise sınır aşılınca öbür kayıtlar SİLİNMEZ, bu kayıt yazılmaz (haber/gol ayrıntısı ana sayfanın kaydını
 *  yerinden etmesin). */
export function sonVeriYaz(ad, veri, { yerAc = true } = {}) {
  const h = hepsi();
  h[ad] = { zaman: new Date().toISOString(), veri };
  let metin = JSON.stringify(h);
  if (metin.length > EN_COK) { if (!yerAc) return; metin = JSON.stringify({ [ad]: h[ad] }); }
  if (metin.length > EN_COK) return;
  try {
    if (ANAHTAR === 'son-veri-v1') localStorage.setItem('son-veri-v1', metin);
    else localStorage.setItem(ANAHTAR, metin);
  } catch (e) { /* depolama kapalı: yok say */ }
}

/** Ayrıntı sayfaları (haber, gol) için son açılan N kayıt: { id → kayıt } listesi, en yeni başta. */
export function sonKayit(ad, id) {
  const v = sonVeri(ad);
  return v && Array.isArray(v.veri) ? (v.veri.find((x) => x && x.id === id) || null) : null;
}
export function sonKayitYaz(ad, kayit, enCok = 3) {
  const v = sonVeri(ad);
  const eski = v && Array.isArray(v.veri) ? v.veri.filter((x) => x && x.id !== kayit.id) : [];
  sonVeriYaz(ad, [kayit, ...eski].slice(0, enCok), { yerAc: false });
}
