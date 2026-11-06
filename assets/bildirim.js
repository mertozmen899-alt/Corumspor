// Web Push istemcisi (Profil › Bildirimler) ve uygulama açıkken gol düdüğü. DOM kurmaz (arayüz assets/sayfa/profil.js'te);
// sayfa açılınca izin İSTEMEZ: Notification.requestPermission yalnız aboneOl()'da, "Bildirimleri aç" düğmesiyle çağrılır.
// Abonelik: tarayıcının push adresi + anahtarları + tercih → rpc('bildirim_abone_ol') (021). Tercih değişimi/kapatma: kendi satırı (RLS).
// Düdük: sw.js gol bildiriminde görünür sekmeye { tur: 'bildirim-gol' } yollar; ortak.js bu modülü tembel yükleyip golDudugu() çağırır.
// Ses WebAudio ile burada sentezlenir (ses dosyası yok, dış istek yok). Web Push bildiriminin sesi işletim sisteminindir, değiştirilemez.
import * as ayar from './ayar.js'; // ad alanı: VAPID_ACIK_ANAHTAR henüz eklenmemişse de modül yüklenir

export const TURLER = [
  ['mac_gunu', 'Maç günü', 'sabah, rakip ve saat'],
  ['ilk11', 'İlk 11', 'kadro açıklanınca'],
  ['gol', 'Gol', 'Çorum FK golü, dakika ve skorla'],
  ['mac_sonu', 'Maç sonu', 'son skor'],
];
export const VARSAYILAN_TERCIH = Object.freeze({ mac_gunu: true, ilk11: true, gol: true, mac_sonu: true });
export const DUDUK_ANAHTARI = 'bildirim-duduk';

export const vapidAnahtari = () => (typeof ayar.VAPID_ACIK_ANAHTAR === 'string' && ayar.VAPID_ACIK_ANAHTAR) || null;

/** iPhone/iPad (iPadOS masaüstü kimliğiyle gelir: MacIntel + dokunmatik). */
export const iosMu = (ua = '', platform = '', dokunma = 0) => /iP(hone|ad|od)/.test(ua) || (platform === 'MacIntel' && dokunma > 1);

/**
 * Bölümün durumu: 'ios-ana-ekran' (iOS'ta yalnız ana ekrandaki uygulama), 'destek-yok', 'kurulmadi' (VAPID anahtarı yok),
 * 'sw-yok' (service worker kayıtlı değil: localhost / test), 'reddedildi' (izin kapalı), 'hazir'.
 */
export function bildirimDurumu({ pushVar, ios, standalone, anahtar, kayitVar, izin }) {
  if (ios && !standalone) return 'ios-ana-ekran';
  if (!pushVar) return 'destek-yok';
  if (!anahtar) return 'kurulmadi';
  if (!kayitVar) return 'sw-yok';
  if (izin === 'denied') return 'reddedildi';
  return 'hazir';
}

/** VAPID açık anahtarı (base64url) → applicationServerKey baytları. */
export function anahtarBaytlari(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64url.length % 4)) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** Tarayıcının durumu ve service worker kaydı. */
export async function ortamDurumu() {
  const n = globalThis.navigator || {};
  const pushVar = 'serviceWorker' in n && 'PushManager' in globalThis && 'Notification' in globalThis;
  let kayit = null;
  if (pushVar) { try { kayit = (await n.serviceWorker.getRegistration()) || null; } catch (e) { kayit = null; } }
  const standalone = (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches) || n.standalone === true;
  const durum = bildirimDurumu({
    pushVar, ios: iosMu(n.userAgent, n.platform, n.maxTouchPoints), standalone, anahtar: vapidAnahtari(), kayitVar: !!kayit,
    izin: pushVar ? Notification.permission : 'default',
  });
  return { durum, kayit };
}

/** Bu tarayıcının aboneliği ve sunucudaki tercihi (satır yoksa tercih null: kapalı sayılır). */
export async function mevcutAbonelik(supabase, kayit) {
  const abonelik = await kayit.pushManager.getSubscription();
  if (!abonelik) return { abonelik: null, tercih: null };
  const { data, error } = await supabase.from('push_abonelikleri').select('tercih').eq('endpoint', abonelik.endpoint).maybeSingle();
  if (error) throw error;
  return { abonelik, tercih: (data && data.tercih) || null };
}

/** İzin ister (düğmeden), abone olur, sunucuya yazar. İzin verilmezse hata.kod = 'izin'. */
export async function aboneOl(supabase, kayit, tercih) {
  const izin = await Notification.requestPermission();
  if (izin !== 'granted') throw Object.assign(new Error('Bildirim izni verilmedi.'), { kod: izin === 'denied' ? 'reddedildi' : 'izin' });
  const secenek = { userVisibleOnly: true, applicationServerKey: anahtarBaytlari(vapidAnahtari()) };
  let abonelik;
  try { abonelik = await kayit.pushManager.subscribe(secenek); } catch (e) {
    // Eski (başka VAPID anahtarlı) abonelik varsa tarayıcı reddeder: bırakıp yeniden dene
    const eski = await kayit.pushManager.getSubscription();
    if (!eski) throw e;
    await eski.unsubscribe();
    abonelik = await kayit.pushManager.subscribe(secenek);
  }
  const j = abonelik.toJSON();
  const { error } = await supabase.rpc('bildirim_abone_ol', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_tercih: tercih });
  if (error) throw error;
  return abonelik;
}

export async function tercihKaydet(supabase, endpoint, tercih) {
  const { error } = await supabase.from('push_abonelikleri').update({ tercih }).eq('endpoint', endpoint);
  if (error) throw error;
}

/** Önce sunucudaki satır silinir (endpoint gerekir), sonra tarayıcı aboneliği bırakılır. */
export async function aboneligiKapat(supabase, kayit) {
  const abonelik = await kayit.pushManager.getSubscription();
  if (!abonelik) return;
  const { error } = await supabase.from('push_abonelikleri').delete().eq('endpoint', abonelik.endpoint);
  if (error) throw error;
  await abonelik.unsubscribe();
}

export function dudukAcik() { try { return localStorage.getItem(DUDUK_ANAHTARI) === '1'; } catch (e) { return false; } }
export function dudukAyarla(acik) { try { if (acik) localStorage.setItem(DUDUK_ANAHTARI, '1'); else localStorage.removeItem(DUDUK_ANAHTARI); } catch (e) { /* gizli sekme */ } }

/**
 * Hakem düdüğü (WebAudio): ~2,9 kHz, hızlı titreşimli (bilyeli düdük), iki kısa + bir uzun. Tarayıcı sesi açtırmazsa (otomatik oynatma
 * kuralı: sayfayla daha önce etkileşim yoksa) sessizce false döner.
 */
export async function dudukCal() {
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return false;
  const ctx = new AC();
  try { if (ctx.state !== 'running') await ctx.resume(); } catch (e) { /* izin yok */ }
  if (ctx.state !== 'running') { ctx.close().catch(() => {}); return false; }
  const t = ctx.currentTime + 0.02, son = t + 1.4;
  const ton = ctx.createOscillator(), titresim = ctx.createOscillator(), derinlik = ctx.createGain(), ses = ctx.createGain();
  ton.frequency.value = 2900;
  titresim.frequency.value = 32;
  derinlik.gain.value = 180;
  titresim.connect(derinlik).connect(ton.frequency);
  ses.gain.setValueAtTime(0, t);
  for (const [bas, sure] of [[0, 0.16], [0.28, 0.16], [0.56, 0.7]]) {
    ses.gain.setTargetAtTime(0.16, t + bas, 0.01);
    ses.gain.setTargetAtTime(0, t + bas + sure, 0.02);
  }
  ton.connect(ses).connect(ctx.destination);
  ton.start(t); titresim.start(t); ton.stop(son); titresim.stop(son);
  ton.onended = () => ctx.close().catch(() => {});
  return true;
}

/** sw.js'ten gol mesajı geldi: seçenek açıksa ve sayfa ekrandaysa düdük. */
export function golDudugu() {
  if (dudukAcik() && document.visibilityState === 'visible') return dudukCal();
  return Promise.resolve(false);
}
