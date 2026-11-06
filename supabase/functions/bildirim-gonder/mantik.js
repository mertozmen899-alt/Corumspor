// Bildirim metni ve seçim kuralları (saf JS: Edge Function (Deno) ve testler/bildirim.test.mjs (Node) aynı dosyayı kullanır).
// Olay satırı: supabase/migrations/021_bildirim.sql bildirim_olaylari { id, tur, mac_id, gol_id, veri, created_at }.

export const TAKIM = 'Çorum FK';
export const TURLER = ['mac_gunu', 'ilk11', 'gol', 'mac_sonu'];
const DK = 60 * 1000;

/** Abonenin tercihi bu türü açık mı (yalnız açıkça true). */
export const tercihUygun = (tercih, tur) => !!tercih && TURLER.includes(tur) && tercih[tur] === true;

const saat = (iso) => new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
const eslesme = (v) => (v.ic_saha === false ? `${v.rakip} – ${TAKIM}` : `${TAKIM} – ${v.rakip}`);
/** "Çorum FK 1-0 X" (deplasmanda ev sahibi önce: "X 0-1 Çorum FK"). */
export const skorMetni = (v) => (v.ic_saha === false
  ? `${v.rakip} ${v.rakip_skor}-${v.corum} ${TAKIM}`
  : `${TAKIM} ${v.corum}-${v.rakip_skor} ${v.rakip}`);
export const dakikaMetni = (dakika, ek) => (ek ? `${dakika}+${ek}'` : `${dakika}'`);

/**
 * Olaydan bildirim: { baslik, govde, url, etiket, tur, ttl (sn), aciliyet }.
 * etiket maç başına tek: aynı maçın bildirimleri bildirim merkezinde birikmez, yenisi eskisinin yerine geçer (sw.js renotify ile yine öter).
 */
export function bildirimIcerigi(olay, simdi = Date.now()) {
  const v = olay.veri || {};
  const etiket = 'mac-' + olay.mac_id;
  const macUrl = 'mac.html?id=' + olay.mac_id;
  const basaKadar = (ek) => Math.max(60, Math.round((new Date(v.tarih).getTime() + ek - simdi) / 1000));
  switch (olay.tur) {
    case 'mac_gunu':
      return { baslik: 'Bugün maç var', govde: `${eslesme(v)}, ${saat(v.tarih)}`, url: macUrl, etiket, tur: olay.tur, ttl: basaKadar(0), aciliyet: 'normal' };
    case 'ilk11':
      return { baslik: 'İlk 11 açıklandı', govde: `${eslesme(v)} (${saat(v.tarih)}): ilk 11 belli oldu. Görmek için dokun.`, url: macUrl, etiket, tur: olay.tur, ttl: basaKadar(15 * DK), aciliyet: 'high' };
    case 'gol':
      return {
        baslik: `GOL! ${dakikaMetni(v.dakika, v.ek_dakika)} ${v.oyuncu}${v.penalti ? ' (penaltı)' : ''}`,
        govde: skorMetni(v),
        url: 'gol.html?id=' + olay.gol_id, etiket, tur: olay.tur, ttl: 15 * 60, aciliyet: 'high',
      };
    case 'mac_sonu':
      return { baslik: 'Maç bitti', govde: skorMetni(v), url: macUrl, etiket, tur: olay.tur, ttl: 3 * 60 * 60, aciliyet: 'normal' };
    default:
      throw new Error('Bilinmeyen bildirim türü: ' + olay.tur);
  }
}

/** Geç kalan olay gönderilmez (ör. Edge Function bir süre çalışmadıysa 2 saat sonra "GOL!" gitmesin). */
export function bayatMi(olay, simdi = Date.now()) {
  const v = olay.veri || {};
  const olusma = new Date(olay.created_at).getTime();
  const bas = new Date(v.tarih).getTime();
  switch (olay.tur) {
    case 'mac_gunu': return simdi >= bas;
    case 'ilk11': return simdi > bas + 15 * DK;
    case 'gol': return simdi - olusma > 20 * DK;
    case 'mac_sonu': return simdi - olusma > 3 * 60 * DK;
    default: return true;
  }
}

const AYAR_ALANLARI = [['vapid_public', 'VAPID_PUBLIC_KEY'], ['vapid_private', 'VAPID_PRIVATE_KEY'], ['vapid_subject', 'VAPID_SUBJECT'], ['bildirim_gizli', 'BILDIRIM_GIZLI']];

/**
 * Gizli ayar okuyucu (022): { vapid_public, vapid_private, vapid_subject, bildirim_gizli }.
 * Önce ortam değişkeni (eski kurulum: Edge Function secret'ı); eksik varsa Vault'tan, service_role ile
 * rpc('bildirim_gizli_ayarlar'). Tamamı bulunursa `sureMs` bellekte tutulur; eksikse saklanmaz (kurulum biter bitmez çalışsın).
 * Hata metinlerinde değer yok (günlüğe yalnız durum kodu düşer).
 */
export function ayarOkuyucu(ortam, getir = fetch, sureMs = 5 * 60 * 1000) {
  let bellek = null, zaman = 0;
  return async (simdi = Date.now()) => {
    if (bellek && simdi - zaman < sureMs) return bellek;
    const sonuc = Object.fromEntries(AYAR_ALANLARI.map(([a, e]) => [a, ortam(e) || null]));
    if (AYAR_ALANLARI.some(([a]) => !sonuc[a])) {
      const url = ortam('SUPABASE_URL'), anahtar = ortam('SUPABASE_SERVICE_ROLE_KEY');
      if (!url || !anahtar) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY yok');
      const yanit = await getir(url + '/rest/v1/rpc/bildirim_gizli_ayarlar', {
        method: 'POST', body: '{}',
        headers: { 'Content-Type': 'application/json', apikey: anahtar, Authorization: 'Bearer ' + anahtar },
      });
      if (!yanit.ok) throw new Error('bildirim_gizli_ayarlar okunamadı (HTTP ' + yanit.status + ')');
      const satir = (await yanit.json())?.[0] ?? {};
      for (const [a] of AYAR_ALANLARI) sonuc[a] ||= satir[a] || null;
    }
    if (AYAR_ALANLARI.every(([a]) => sonuc[a])) { bellek = sonuc; zaman = simdi; }
    return sonuc;
  };
}
