// Web Push (021/022) için VAPID anahtar çifti ve Edge Function gizli başlığı üretir:
//   node araclar/vapid-olustur.js         açıklamalı çıktı (ayar.js satırı + SQL)
//   node araclar/vapid-olustur.js --sql   yalnız çalıştırılmaya hazır SQL (ayar.js satırı başında yorum olarak)
// HİÇBİR DOSYAYA YAZMAZ: açık anahtarı assets/ayar.js'e sizin yapıştırmanız, SQL'i Supabase SQL Editor'de çalıştırmanız için ekrana basar.
// SQL beş Vault sırrını yazar (varsa günceller): bildirim_vapid_public, bildirim_vapid_private, bildirim_vapid_subject, bildirim_gizli (022
// Edge Function okur) ve bildirim_url (021 veritabanı pg_net ile bu adresi çağırır; bildirim_gizli'yi başlık olarak gönderir).
// Çıktıyı bir yere kaydetmeyin; kaybolursa yeniden üretin (o zaman ayar.js'teki açık anahtar da değişir ve herkes bildirimleri yeniden açmalıdır).
// Biçim: web-push ile aynı (P-256; açık anahtar 65 bayt sıkıştırılmamış nokta, özel anahtar 32 bayt; ikisi de base64url).
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function vapidUret() {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  return { acik: ecdh.getPublicKey().toString('base64url'), ozel: ecdh.getPrivateKey().toString('base64url') };
}

function ayarDegeri(re, yedek) {
  try {
    const m = re.exec(fs.readFileSync(path.join(__dirname, '..', 'assets', 'ayar.js'), 'utf8'));
    return m ? m[1] : yedek;
  } catch (e) { return yedek; }
}

const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";

/** Vault'a yazan SQL: her sır için önce update (varsa), sonra create (yoksa). Yeniden çalıştırılabilir. */
function sqlUret({ acik, ozel, gizli, adres, konu }) {
  const sirlar = [
    ['bildirim_vapid_public', acik], ['bildirim_vapid_private', ozel], ['bildirim_vapid_subject', konu],
    ['bildirim_gizli', gizli], ['bildirim_url', adres],
  ];
  return [
    `-- ayar.js için: export const VAPID_ACIK_ANAHTAR = '${acik}';`,
    ...sirlar.flatMap(([ad, deger]) => [
      `select vault.update_secret(id, ${q(deger)}) from vault.secrets where name = ${q(ad)};`,
      `select vault.create_secret(${q(deger)}, ${q(ad)}) where not exists (select 1 from vault.secrets where name = ${q(ad)});`,
    ]),
  ].join('\n');
}

module.exports = { vapidUret, sqlUret };

if (require.main === module) {
  const { acik, ozel } = vapidUret();
  const sql = sqlUret({
    acik, ozel,
    gizli: crypto.randomBytes(32).toString('base64url'),
    adres: ayarDegeri(/SUPABASE_URL\s*=\s*'(https:\/\/[a-z0-9]+\.supabase\.co)'/, 'https://PROJE-KODUNUZ.supabase.co') + '/functions/v1/bildirim-gonder',
    konu: 'mailto:' + ayarDegeri(/ILETISIM_EPOSTA\s*=\s*'([^'\s]+@[^'\s]+)'/, 'ILETISIM-EPOSTANIZ@ornek.com'),
  });
  if (process.argv.includes('--sql')) {
    console.log(sql);
  } else {
    console.log(`
1) assets/ayar.js (açık anahtar; herkese görünür, normaldir):
export const VAPID_ACIK_ANAHTAR = '${acik}';

2) Supabase SQL Editor'de çalıştırın (Vault; özel anahtar ve gizli başlık YALNIZ burada):
${sql}

Bu çıktıyı dosyaya kaydetmeyin, sohbete/e-postaya yapıştırmayın. Kaybolursa betiği yeniden çalıştırıp 1-2'yi tekrarlayın.
`);
  }
}
