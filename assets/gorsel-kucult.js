// Görseli YÜKLEMEDEN ÖNCE tarayıcıda küçültür (canvas). Haber kapağı (assets/sayfa/yonetim.js) ve reklam görseli
// (assets/reklam/yonetim-reklamlar.js) bunu kullanır. Sunucudaki kova sınırları (boyut, tür) yine geçerlidir.
// Kural:
//  - GIF olduğu gibi kalır (hareket bozulmasın).
//  - JPEG / PNG her zaman WebP'ye çevrilir (kalite ~0.85): telefon fotoğrafı küçülür, içindeki EXIF/konum bilgisi de silinir.
//    WebP yazamayan tarayıcıda (ör. eski Safari) JPEG'e çevrilir, saydam yerler beyaz olur.
//  - En uzun kenar sınırı aşılıyorsa en-boy oranı korunarak küçültülür. Sınır içindeki WebP dokunulmadan kalır.
//  - Çözülemeyen dosya olduğu gibi döner (sunucu türü ve boyutu yine denetler).

/** Küçültmeye verilebilecek en büyük dosya (bundan büyüğü tarayıcıyı yormasın diye hiç açılmaz). */
export const ENCOK_GIRDI_BAYT = 25 * 1024 * 1024;

/** Saf hesap: sığdırılmış boyut. kucult = küçültme gerekiyor mu. */
export function hedefBoyut(gen, yuk, { enGenis = Infinity, enYuksek = Infinity } = {}) {
  const oran = Math.min(1, enGenis / gen, enYuksek / yuk);
  return { gen: Math.max(1, Math.round(gen * oran)), yuk: Math.max(1, Math.round(yuk * oran)), kucult: oran < 1 };
}

async function coz(dosya) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(dosya, { imageOrientation: 'from-image' }); } catch { /* aşağıdaki yol */ }
  }
  const adres = URL.createObjectURL(dosya);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = adres;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(adres);
  }
}

/**
 * @param {File} dosya
 * @param {{enGenis?: number, enYuksek?: number, kalite?: number}} ops
 * @returns {Promise<File>} küçültülmüş (ya da aynen) dosya
 */
export async function gorselKucult(dosya, { enGenis = Infinity, enYuksek = Infinity, kalite = 0.85 } = {}) {
  if (!dosya || dosya.type === 'image/gif' || !/^image\/(jpeg|png|webp)$/.test(dosya.type)) return dosya;
  let resim;
  try { resim = await coz(dosya); } catch { return dosya; }
  const gen0 = resim.naturalWidth || resim.width, yuk0 = resim.naturalHeight || resim.height;
  const { gen, yuk, kucult } = hedefBoyut(gen0, yuk0, { enGenis, enYuksek });
  if (!kucult && dosya.type === 'image/webp') { if (resim.close) resim.close(); return dosya; }
  const tuval = document.createElement('canvas');
  tuval.width = gen;
  tuval.height = yuk;
  const c = tuval.getContext('2d');
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'high';
  c.drawImage(resim, 0, 0, gen, yuk);
  if (resim.close) resim.close();
  const blobAl = (tur) => new Promise((ok) => tuval.toBlob(ok, tur, kalite));
  let tur = 'image/webp';
  let blob = await blobAl(tur);
  if (!blob || blob.type !== 'image/webp') {
    c.globalCompositeOperation = 'destination-over';
    c.fillStyle = '#FFFFFF';
    c.fillRect(0, 0, gen, yuk);
    tur = 'image/jpeg';
    blob = await blobAl(tur);
  }
  if (!blob) return dosya;
  const ad = String(dosya.name || 'gorsel').replace(/\.[^.]*$/, '') + (tur === 'image/webp' ? '.webp' : '.jpg');
  return new File([blob], ad, { type: tur, lastModified: Date.now() });
}
