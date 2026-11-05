// Son görülen herkese açık veri (haber başlıkları, sıradaki maç, son goller) tarayıcıda: sayfa önce bunu ANINDA çizer, sonra
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

export function sonVeriYaz(ad, veri) {
  const h = hepsi();
  h[ad] = { zaman: new Date().toISOString(), veri };
  let metin = JSON.stringify(h);
  if (metin.length > EN_COK) metin = JSON.stringify({ [ad]: h[ad] });
  if (metin.length > EN_COK) return;
  try {
    if (ANAHTAR === 'son-veri-v1') localStorage.setItem('son-veri-v1', metin);
    else localStorage.setItem(ANAHTAR, metin);
  } catch (e) { /* depolama kapalı: yok say */ }
}
