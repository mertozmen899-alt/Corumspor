// Görünüm testleri + ekran görüntüleri: her sayfa 390 px ve 1280 px genişlikte, açık ve koyu temada.
// Kullanım: node testler/ekran-testleri.js   (hepsi için: node testler/calistir.js)
// Görüntüler: testler/ekran/<sayfa>-<genişlik>-<acik|koyu>.png (deviceScaleFactor 1, tam sayfa).
// Denenenler: yatay taşma yok, <html lang="tr">, "Resmî Çorum FK uygulaması değildir" şeridi + alt bilgi,
// yazı tipleri sitenin kendisinden (Oswald + Source Sans 3; Google Fonts isteği yok), amblem yedeği yüklü,
// reklam kartı altın zeminli/kesikli kenarlı/etiketli ve videonun ya da yorumların üstüne binmiyor,
// tema düğmesi çalışıyor ve seçim hatırlanıyor, AMBLEM_DOSYASI geri dönüş sırası, konsolda hata yok.
const fs = require('fs'), path = require('path');
const { sunucuAc } = require('./tarayici-testleri');

const EKRAN = path.join(__dirname, 'ekran');
const GORSEL = path.join(__dirname, 'reklam', 'gorseller');
const H1 = '33333333-0000-4000-8000-000000000001';
const M1 = '11111111-0000-4000-8000-000000000001';
const DEPO = 'https://sahte.supabase.co/storage/v1/object/public/reklam-gorselleri/';

async function ekranTestleri() {
  let chromium;
  try { ({ chromium } = require('playwright')); } catch (e) { return { gecen: [], kalan: ['Playwright bulunamadı'] }; }
  fs.mkdirSync(EKRAN, { recursive: true });
  const sunucu = await sunucuAc();
  const ADRES = 'http://127.0.0.1:' + sunucu.address().port;
  const gecen = [], kalan = [];
  const kontrol = (ad, ok, detay) => (ok ? gecen.push('görünüm: ' + ad) : kalan.push(`görünüm: ${ad}` + (detay !== undefined ? ` -> ${String(detay).slice(0, 400)}` : '')));
  const guvenli = async (ad, f) => { try { await f(); } catch (e) { kalan.push(`görünüm: ${ad}: yarıda kaldı -> ${String(e.message || e).split('\n')[0]}`); } };
  const tarayici = await chromium.launch();
  const resim = (ad) => 'data:image/png;base64,' + fs.readFileSync(path.join(GORSEL, ad)).toString('base64');
  const disIstek = [], hatalar = [];

  async function baglam(vp, tema, ekstra = {}) {
    const ctx = await tarayici.newContext({ viewport: vp, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'America/New_York', colorScheme: tema === 'koyu' ? 'dark' : 'light', ...ekstra });
    await ctx.route((url) => !url.href.startsWith(ADRES), (r) => { disIstek.push(r.request().url()); return r.abort(); });
    await ctx.route(/^https:\/\/sahte\.supabase\.co\/storage\/v1\/object\/public\//, async (r) => {
      const yol = decodeURIComponent(new URL(r.request().url()).pathname.replace('/storage/v1/object/public/', ''));
      const p = ctx.pages().find((x) => x.url().startsWith(ADRES));
      const veri = p ? await p.evaluate((k) => localStorage.getItem(k), 'sahte-depo-v1:' + yol).catch(() => null) : null;
      const m = veri && /^data:([^;,]+);base64,(.*)$/.exec(veri);
      return m ? r.fulfill({ status: 200, contentType: m[1], body: Buffer.from(m[2], 'base64') }) : r.fulfill({ status: 404, body: '' });
    });
    ctx.on('page', (p) => { p.setDefaultTimeout(10000); p.on('pageerror', (e) => hatalar.push(p.url() + ': ' + e.message)); p.on('dialog', (d) => d.accept()); });
    const p = await ctx.newPage();
    // Sahte veriye yayında 3 reklam ekle (ana akış, haber sonu, M1 maç sponsoru)
    await p.goto(ADRES + '/index.html?sahte=1');
    await p.waitForSelector('#akis .haber-karti');
    await p.evaluate(({ doner, optik, logo, DEPO, M1 }) => {
      const d = JSON.parse(localStorage.getItem('sahte-db-v1'));
      const s = new Date(Date.now() - 3600e3).toISOString(), b = new Date(Date.now() + 48 * 3600e3).toISOString();
      const r = (id, firma, metin, gorsel, baglanti, alan, mac) => ({ id, firma_adi: firma, kisa_metin: metin, gorsel_url: DEPO + gorsel, baglanti_url: baglanti, alan, mac_id: mac, baslangic: s, bitis: b, durum: 'yayinda', oncelik: 0, yayina_alinma: s, created_at: s, updated_at: s });
      d.reklamlar = [
        r('aaaaaaaa-2222-4000-8000-000000000001', 'Çorum Döner Evi', 'Maç biletini göster, dönerde %20 indirim kazan.', '2026/11/doner.png', 'https://www.corum-doner-ornek.com.tr/kampanya', 'ana_akis', null),
        r('aaaaaaaa-2222-4000-8000-000000000002', 'Hitit Optik', 'Taraftar kartına özel güneş gözlüğünde %15 indirim.', '2026/11/optik.png', 'https://wa.me/905321234567?text=Merhaba', 'haber_sonu', null),
        r('aaaaaaaa-2222-4000-8000-000000000003', 'İskilip Sigorta', 'Bu maçın sponsoru. Kasko teklifi için tıklayın.', '2026/11/logo.png', 'https://www.corum-doner-ornek.com.tr/sigorta', 'mac_sponsoru', M1),
      ];
      localStorage.setItem('sahte-db-v1', JSON.stringify(d));
      localStorage.setItem('sahte-depo-v1:reklam-gorselleri/2026/11/doner.png', doner);
      localStorage.setItem('sahte-depo-v1:reklam-gorselleri/2026/11/optik.png', optik);
      localStorage.setItem('sahte-depo-v1:reklam-gorselleri/2026/11/logo.png', logo);
    }, { doner: resim('doner.png'), optik: resim('optik.png'), logo: resim('logo.png'), DEPO, M1 });
    return { ctx, p };
  }

  const genel = async (p, ad) => {
    const d = await p.evaluate(async () => {
      await document.fonts.ready;
      const serit = document.querySelector('.resmi-degil');
      const amb = document.querySelector('.logo img[data-amblem]');
      const fontlar = [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, '') + ' ' + f.weight);
      return {
        tasma: document.documentElement.scrollWidth - innerWidth,
        lang: document.documentElement.lang,
        serit: serit ? serit.textContent : '', seritGorunur: !!serit && serit.getBoundingClientRect().height > 0,
        alt: document.querySelector('footer').textContent,
        amblem: amb ? { src: amb.getAttribute('src'), w: amb.naturalWidth } : null,
        oswald: document.fonts.check('600 16px Oswald'), source: document.fonts.check('400 16px "Source Sans 3"'),
        yuklu: fontlar,
        baslikFont: getComputedStyle(document.querySelector('.logo-ad')).fontFamily,
        govdeFont: getComputedStyle(document.body).fontFamily,
      };
    });
    kontrol(`${ad}: yatay taşma yok`, d.tasma <= 0, d.tasma + ' px');
    kontrol(`${ad}: <html lang="tr">, "Resmî Çorum FK uygulaması değildir" şeridi ve alt bilgisi`, d.lang === 'tr' && /Resmî Çorum FK uygulaması değildir/.test(d.serit) && d.seritGorunur && /Resmî Çorum FK uygulaması değildir/.test(d.alt), JSON.stringify(d).slice(0, 200));
    kontrol(`${ad}: amblem yedeği yüklü (assets/logo/amblem-yedek.svg)`, d.amblem && d.amblem.src === 'assets/logo/amblem-yedek.svg' && d.amblem.w > 0, JSON.stringify(d.amblem));
    kontrol(`${ad}: Oswald (başlık) ve Source Sans 3 (gövde) siteden yüklendi`, d.yuklu.some((x) => /^Oswald/.test(x)) && d.yuklu.some((x) => /^Source Sans 3/.test(x)) && /^Oswald/.test(d.baslikFont) && /^"?Source Sans 3/.test(d.govdeFont), JSON.stringify(d.yuklu));
  };
  const foto = (p, ad) => p.screenshot({ path: path.join(EKRAN, ad + '.png'), fullPage: true, animations: 'disabled' });
  const kartKontrol = async (p, ad, secici, tema) => {
    const k = await p.locator(secici + ' .reklam-kart').evaluate((e) => {
      const c = getComputedStyle(e), et = e.querySelector('.reklam-etiket'), ec = getComputedStyle(et), b = getComputedStyle(e.querySelector('.reklam-eylem') || e);
      return { zemin: c.backgroundColor, kenar: c.borderTopStyle, etiket: et.textContent, buyuk: ec.textTransform, etiketRenk: ec.color, gorunur: et.getBoundingClientRect().height > 0, font: c.fontFamily, dugme: b.backgroundColor };
    });
    const zemin = tema === 'koyu' ? 'rgb(42, 35, 18)' : 'rgb(255, 246, 219)';
    const etiketRenk = tema === 'koyu' ? 'rgb(240, 207, 115)' : 'rgb(107, 79, 0)';
    kontrol(`${ad}: reklam kartı altın zemin, kesikli kenar, büyük harf görünür etiket, Oswald/kırmızı yok`,
      k.zemin === zemin && k.kenar === 'dashed' && k.buyuk === 'uppercase' && k.gorunur && k.etiketRenk === etiketRenk && /^"?Source Sans 3/.test(k.font) && k.dugme !== 'rgb(204, 0, 0)', JSON.stringify(k));
    return k;
  };

  for (const tema of ['acik', 'koyu']) {
    for (const [gen, vp] of [['390', { width: 390, height: 844 }], ['1280', { width: 1280, height: 860 }]]) {
      await guvenli(`${gen}-${tema}`, async () => {
        const { ctx, p } = await baglam(vp, tema);
        const t = (s) => `${s} (${gen} px, ${tema === 'koyu' ? 'koyu' : 'açık'})`;
        const zemin = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
        kontrol(t('tema cihaz tercihini izliyor'), zemin === (tema === 'koyu' ? 'rgb(11, 11, 11)' : 'rgb(255, 255, 255)'), zemin);

        // ana sayfa (reklam 3. haberden sonra)
        await p.goto(ADRES + '/index.html');
        await p.locator('#akis .reklam-kart').waitFor();
        await p.waitForFunction(() => document.querySelector('#akis .reklam-gorsel')?.naturalWidth > 0);
        await genel(p, t('ana'));
        const k = await kartKontrol(p, t('ana'), '#akis .reklam-yuvasi', tema);
        kontrol(t('ana: etiket metni "Reklam" (CSS ile REKLAM)'), k.etiket === 'Reklam');
        // tam sayfa görüntüde ekran dışındaki async görsel boş çıkmasın: önce göster, sonra başa dön
        await p.locator('#akis .reklam-kart').evaluate((e) => e.scrollIntoView({ block: 'center' }));
        await p.waitForTimeout(300);
        await p.evaluate(() => window.scrollTo(0, 0));
        await foto(p, `ana-${gen}-${tema}`);

        // haber + yorumlar (reklam makale ile yorumlar arasında, örtüşme yok)
        await p.goto(ADRES + '/haber.html?id=' + H1);
        await p.locator('.reklam-yuvasi[data-reklam-alan="haber_sonu"] .reklam-kart').waitFor();
        await p.waitForSelector('#yorum-listesi .yorum');
        await p.waitForFunction(() => document.querySelector('.reklam-yuvasi .reklam-gorsel')?.naturalWidth > 0);
        await genel(p, t('haber'));
        await kartKontrol(p, t('haber'), '.reklam-yuvasi[data-reklam-alan="haber_sonu"]', tema);
        const hb = await p.evaluate(() => { const r = (s) => document.querySelector(s).getBoundingClientRect(); const k = r('.reklam-yuvasi[data-reklam-alan="haber_sonu"] .reklam-kart'), m = r('#makale'), y = r('#yorumlar > *'); return { ust: k.top - m.bottom, alt: y.top - k.bottom }; });
        kontrol(t('haber: reklam kartı makale ile yorumlar arasında, örtüşme yok'), hb.ust >= 0 && hb.alt >= 0, JSON.stringify(hb));
        await foto(p, `haber-${gen}-${tema}`);

        // maç (sponsor skorun altında, gol videosunun üstünde, örtüşme yok)
        await p.goto(ADRES + '/mac.html?id=' + M1);
        await p.locator('.reklam-yuvasi[data-reklam-alan="mac_sponsoru"] .reklam-kart').waitFor();
        await p.waitForSelector('#gol-listesi .gol');
        await p.waitForSelector('#yorum-listesi .yorum');
        await genel(p, t('maç'));
        const mk = await kartKontrol(p, t('maç'), '.reklam-yuvasi[data-reklam-alan="mac_sponsoru"]', tema);
        kontrol(t('maç: etiket "Maçın sponsoru"'), mk.etiket === 'Maçın sponsoru', mk.etiket);
        const mb = await p.evaluate(() => {
          const r = (e) => e.getBoundingClientRect();
          const k = r(document.querySelector('.reklam-yuvasi[data-reklam-alan="mac_sponsoru"] .reklam-kart'));
          const kutular = [...document.querySelectorAll('#mac-basi, .video, #yorumlar > *')].map(r);
          const ortusme = kutular.some((b) => !(b.bottom <= k.top || b.top >= k.bottom || b.right <= k.left || b.left >= k.right));
          return { ortusme, basAlti: k.top - r(document.querySelector('#mac-basi')).bottom, videoUstu: r(document.querySelector('.video')).top - k.bottom };
        });
        kontrol(t('maç: sponsor kartı skorun altında, video ve yorumlarla örtüşmüyor'), !mb.ortusme && mb.basAlti >= 0 && mb.videoUstu >= 0, JSON.stringify(mb));
        await foto(p, `mac-${gen}-${tema}`);

        for (const [ad, url, bekle] of [['maclar', 'maclar.html', '#sonuclar .mac-satiri'], ['goller', 'goller.html', '#arsiv .arsiv-mac'], ['giris', 'giris.html', '#g-eposta']]) {
          await p.goto(ADRES + '/' + url);
          await p.waitForSelector(bekle);
          await genel(p, t(ad));
          await foto(p, `${ad}-${gen}-${tema}`);
        }

        // yönetim (yönetici): haberler sekmesi + reklam paneli (liste, form/önizleme, rapor)
        await p.goto(ADRES + '/giris.html?donus=yonetim.html');
        await p.fill('#g-eposta', 'yonetici@ornek.test');
        await p.fill('#g-sifre', 'sifre1234');
        await Promise.all([p.waitForURL(/yonetim\.html/), p.click('#g-gonder')]);
        await p.waitForSelector('#haber-listesi li');
        await genel(p, t('yönetim'));
        await foto(p, `yonetim-${gen}-${tema}`);
        await p.click('#sekme-reklamlar');
        await p.waitForSelector('#ry-reklamlar tr[data-reklam-id]');
        await genel(p, t('yönetim reklamlar'));
        await foto(p, `yonetim-reklamlar-${gen}-${tema}`);
        await p.locator('#ry-reklamlar tr', { hasText: 'Çorum Döner Evi' }).getByRole('button', { name: 'Düzenle' }).click();
        await p.waitForFunction(() => document.querySelector('#ry-onizleme-telefon .reklam-gorsel')?.naturalWidth > 0);
        await genel(p, t('yönetim reklam önizleme'));
        await foto(p, `yonetim-reklam-onizleme-${gen}-${tema}`);
        await p.click('button[data-sekme="rapor"]');
        await p.waitForSelector('#ry-rapor-sonuc tbody tr');
        const sayi = await p.locator('#ry-rapor-sonuc td.ry-sayi').first().evaluate((e) => [getComputedStyle(e).fontFamily, getComputedStyle(e).fontVariantNumeric]);
        kontrol(t('rapor: sayılar Source Sans 3 tabular-nums'), /^"?Source Sans 3/.test(sayi[0]) && /tabular-nums/.test(sayi[1]), JSON.stringify(sayi));
        await foto(p, `yonetim-rapor-${gen}-${tema}`);
        await ctx.close();
      });
    }
  }

  // tema düğmesi: seçim data-theme'e yazılır, sayfalar arasında hatırlanır
  await guvenli('tema düğmesi', async () => {
    const { ctx, p } = await baglam({ width: 390, height: 844 }, 'acik');
    await p.goto(ADRES + '/index.html');
    await p.waitForSelector('#akis .haber-karti');
    kontrol('tema düğmesi: başta "Koyu temaya geç"', (await p.getAttribute('#tema-dugme', 'aria-label')) === 'Koyu temaya geç');
    await p.click('#tema-dugme');
    const z = await p.evaluate(() => [document.documentElement.dataset.theme, getComputedStyle(document.body).backgroundColor, localStorage.getItem('tema')]);
    kontrol('tema düğmesi: koyu tema açıldı ve hatırlandı', z.join() === 'dark,rgb(11, 11, 11),dark', z.join());
    await p.goto(ADRES + '/maclar.html');
    await p.waitForSelector('#sonuclar .mac-satiri');
    kontrol('tema düğmesi: başka sayfada da koyu (renk sıçraması yok: head içinde uygulanır)', (await p.evaluate(() => document.documentElement.dataset.theme)) === 'dark' && (await p.getAttribute('#tema-dugme', 'aria-pressed')) === 'true');
    await p.click('#tema-dugme');
    kontrol('tema düğmesi: yeniden açık', (await p.evaluate(() => getComputedStyle(document.body).backgroundColor)) === 'rgb(255, 255, 255)');
    await ctx.close();
  });

  // amblem: AMBLEM_DOSYASI → yedek → "ÇFK"
  await guvenli('amblem', async () => {
    const ayar = fs.readFileSync(path.join(__dirname, '..', 'assets', 'ayar.js'), 'utf8').replace('export const AMBLEM_DOSYASI = null;', "export const AMBLEM_DOSYASI = 'assets/logo/amblem.png';");
    const { ctx, p } = await baglam({ width: 390, height: 844 }, 'acik');
    await ctx.route('**/assets/ayar.js', (r) => r.fulfill({ contentType: 'text/javascript', body: ayar }));
    const istenen = [];
    p.on('request', (q) => { if (/assets\/logo\//.test(q.url())) istenen.push(q.url().replace(ADRES + '/', '')); });
    await p.goto(ADRES + '/maclar.html');
    await p.waitForSelector('#sonuclar .mac-satiri');
    await p.waitForFunction(() => { const i = document.querySelector('.logo img[data-amblem]'); return i && /amblem-yedek/.test(i.src) && i.naturalWidth > 0; });
    kontrol('amblem: ayar.js\'te verilen dosya yoksa yedek işarete dönüyor', istenen.includes('assets/logo/amblem.png'), JSON.stringify(istenen));
    await ctx.route('**/assets/logo/amblem-yedek.svg', (r) => r.fulfill({ status: 404, body: '' }));
    await p.goto(ADRES + '/goller.html');
    await p.waitForSelector('.logo .amblem-yazi');
    kontrol('amblem: yedek de yoksa "ÇFK" yazı işareti, sayfa çalışıyor', (await p.textContent('.logo .amblem-yazi')) === 'ÇFK' && (await p.$$('#arsiv .arsiv-mac')).length > 0);
    await ctx.close();
    const d = await baglam({ width: 390, height: 844 }, 'acik');
    const istek = [];
    d.p.on('request', (q) => { if (/assets\/logo\//.test(q.url())) istek.push(q.url().replace(ADRES + '/', '')); });
    await d.p.goto(ADRES + '/goller.html');
    await d.p.waitForSelector('#arsiv .arsiv-mac');
    kontrol('amblem: varsayılan (AMBLEM_DOSYASI null) yalnız yedek istenir, olmayan dosya istenmez', istek.length >= 1 && istek.every((x) => x === 'assets/logo/amblem-yedek.svg'), JSON.stringify(istek));
    await d.ctx.close();
  });

  kontrol('görünüm testlerinde JavaScript hatası yok', !hatalar.length, hatalar.join(' | '));
  const yabanci = disIstek.filter((u) => !/^https:\/\/(cdn\.jsdelivr\.net\/npm\/@supabase|www\.youtube-nocookie\.com|ornek\.test)/.test(u));
  kontrol('dış istek yok (Google Fonts dahil); yalnız supabase-js CDN ve YouTube gömme denenir', !yabanci.length, [...new Set(yabanci)].join(' | '));

  await tarayici.close();
  sunucu.close();
  return { gecen, kalan };
}

module.exports = { ekranTestleri };

if (require.main === module) {
  ekranTestleri().then((s) => {
    console.log(JSON.stringify(s.kalan, null, 2));
    console.log(`Görünüm: ${s.gecen.length} geçti, ${s.kalan.length} kaldı`);
    process.exit(s.kalan.length ? 1 : 0);
  }).catch((e) => { console.error(e); process.exit(1); });
}
