// Çorumspor Taraftar — bildirim-gonder (Supabase Edge Function, Deno). Web Push (VAPID + aes128gcm, npm:web-push).
// Çağıran: veritabanı (021 bildirim_calistir(): pg_cron her dakika + goller/maclar/mac_oyunculari tetikleyicisi, pg_net ile POST).
// Yetki: yalnız "x-bildirim-anahtari" başlığı Vault'taki bildirim_gizli ile aynıysa (021 bildirim_calistir() aynı sırrı gönderir).
// Dağıtım: index.ts + mantik.js, verify_jwt = false (JWT yerine gizli başlık; README "Bildirimler").
// Gizli ayarlar (022): Vault'tan rpc('bildirim_gizli_ayarlar') (bildirim_vapid_public / _private / _subject, bildirim_gizli), 5 dk
// bellekte. Eski kurulumun Edge Function secret'ları (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, BILDIRIM_GIZLI) varsa önce gelir.
// Değerler günlüğe yazılmaz. SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY'i Supabase kendisi verir (hiçbir dosyaya yazılmaz).
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { ayarOkuyucu, bayatMi, bildirimIcerigi, tercihUygun } from './mantik.js';

type Abone = { id: string; endpoint: string; p256dh: string; auth: string; tercih: Record<string, boolean> };
type Olay = { id: number; tur: string; mac_id: string; gol_id: string | null; veri: Record<string, unknown>; created_at: string };

const ortam = (ad: string) => Deno.env.get(ad) ?? '';
const db = createClient(ortam('SUPABASE_URL'), ortam('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const ayarlar = ayarOkuyucu(ortam);
const json = (veri: unknown, status = 200) => new Response(JSON.stringify(veri), { status, headers: { 'Content-Type': 'application/json' } });

/** Sabit süreli karşılaştırma (gizli başlık zamanlamayla tahmin edilemesin). */
function esit(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let fark = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) fark |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return fark === 0;
}

// shortcut: abonelerin hepsi belleğe alınır (taraftar uygulaması için birkaç bin satır); on binleri geçerse türe göre süzerek sayfala.
async function aboneler(): Promise<Abone[]> {
  const hepsi: Abone[] = [];
  for (let bas = 0; ; bas += 1000) {
    const { data, error } = await db.from('push_abonelikleri').select('id, endpoint, p256dh, auth, tercih').order('id').range(bas, bas + 999);
    if (error) throw error;
    hepsi.push(...(data as Abone[]));
    if (data.length < 1000) return hepsi;
  }
}

async function paralel<T>(liste: T[], adet: number, is: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(adet, liste.length) }, async () => { while (i < liste.length) await is(liste[i++]); }));
}

async function parcaParca(idler: string[], is: (parca: string[]) => PromiseLike<{ error: { message: string } | null }>) {
  for (let i = 0; i < idler.length; i += 200) {
    const { error } = await is(idler.slice(i, i + 200));
    if (error) console.error('abonelik güncellenemedi', error.message);
  }
}

Deno.serve(async (istek) => {
  if (istek.method !== 'POST') return json({ hata: 'Yalnız POST' }, 405);
  let a: Record<string, string | null>;
  try { a = await ayarlar(); } catch (e) { console.error('gizli ayarlar okunamadı:', (e as Error).message); return json({ hata: 'Ayarlar okunamadı' }, 500); }
  if (!a.bildirim_gizli || !esit(istek.headers.get('x-bildirim-anahtari') ?? '', a.bildirim_gizli)) return json({ hata: 'Yetkisiz' }, 401);
  if (!a.vapid_public || !a.vapid_private || !a.vapid_subject) return json({ hata: 'VAPID ayarları eksik (Vault, 022)' }, 500);
  webpush.setVapidDetails(a.vapid_subject, a.vapid_public, a.vapid_private);

  const { data: olaylar, error } = await db.rpc('bildirim_olaylarini_al', { p_adet: 20 });
  if (error) return json({ hata: error.message }, 500);
  if (!olaylar?.length) return json({ olay: 0 });

  const liste = await aboneler();
  const gitti = new Set<string>();      // 404/410: tarayıcı aboneliği bitti → silinir
  const ulasti = new Set<string>();
  const ozet: unknown[] = [];
  for (const olay of olaylar as Olay[]) {
    const kayit = (alan: Record<string, unknown>) => db.from('bildirim_olaylari').update({ gonderildi: new Date().toISOString(), ...alan }).eq('id', olay.id);
    if (bayatMi(olay)) { await kayit({ alici: 0, basarisiz: 0, sonuc: 'bayat' }); ozet.push({ id: olay.id, sonuc: 'bayat' }); continue; }
    const ic = bildirimIcerigi(olay);
    const yuk = JSON.stringify({ baslik: ic.baslik, govde: ic.govde, url: ic.url, etiket: ic.etiket, tur: ic.tur });
    const hedef = liste.filter((a) => !gitti.has(a.id) && tercihUygun(a.tercih, olay.tur));
    let alici = 0, basarisiz = 0;
    await paralel(hedef, 20, async (a) => {
      try {
        await webpush.sendNotification({ endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } }, yuk,
          { TTL: ic.ttl, urgency: ic.aciliyet as 'normal' | 'high', timeout: 10000 });
        alici++; ulasti.add(a.id);
      } catch (e) {
        basarisiz++;
        const kod = (e as { statusCode?: number }).statusCode;
        if (kod === 404 || kod === 410) gitti.add(a.id);
        else console.error('bildirim gönderilemedi', olay.id, kod ?? String(e));
      }
    });
    const { error: ke } = await kayit({ alici, basarisiz, sonuc: hedef.length ? 'gonderildi' : 'alici-yok' });
    if (ke) console.error('gönderim kaydedilemedi', olay.id, ke.message);
    ozet.push({ id: olay.id, tur: olay.tur, alici, basarisiz });
  }
  await parcaParca([...gitti], (p) => db.from('push_abonelikleri').delete().in('id', p));
  await parcaParca([...ulasti].filter((id) => !gitti.has(id)), (p) => db.from('push_abonelikleri').update({ son_gonderim: new Date().toISOString() }).in('id', p));
  return json({ olay: olaylar.length, silinen: gitti.size, ozet });
});
