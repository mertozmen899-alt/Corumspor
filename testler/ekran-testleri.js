// Görünüm testleri + ekran görüntüleri: her sayfa 390 px ve 1280 px genişlikte, açık ve koyu temada.
// Kullanım: node testler/ekran-testleri.js   (hepsi için: node testler/calistir.js)
// Görüntüler: testler/ekran/<sayfa>-<genişlik>-<acik|koyu>.png (deviceScaleFactor 1, tam sayfa).
// Denenenler: yatay taşma yok, <html lang="tr">, "Resmî Çorum FK uygulaması değildir" şeridi + alt bilgi,
// yazı tipleri sitenin kendisinden (Oswald + Source Sans 3; Google Fonts isteği yok), amblem yedeği yüklü,
// reklam kartı altın zeminli/kesikli kenarlı/etiketli ve videonun ya da yorumların üstüne binmiyor,
// tema düğmesi çalışıyor ve seçim hatırlanıyor, AMBLEM_DOSYASI geri dönüş sırası, konsolda hata yok.
const fs = require('fs'), path = require('path');
const { sunucuAc, ornekReklamGorseli, gorselTuru } = require('./tarayici-testleri');

const EKRAN = path.join(__dirname, 'ekran');
const H1 = '33333333-0000-4000-8000-000000000001';
const M1 = '11111111-0000-4000-8000-000000000001';
const NARCIL_ANA_AKIS = 'aaaaaaaa-2222-4000-8000-000000000001'; // sahte-supabase.js örnek reklamı

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
  const disIstek = [], hatalar = [];
  // 2. tur (denetçi 11): aynı kökenden 404 = test hatası. Yalnız amblem geri dönüş denemesinin kasıtlı eksik dosyaları hariç.
  const yok404 = new Set();
  const KASITLI_404 = /^\/assets\/logo\/(amblem\.png|amblem-yedek\.svg)$/;

  async function baglam(vp, tema, ekstra = {}) {
    const ctx = await tarayici.newContext({ viewport: vp, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'America/New_York', colorScheme: tema === 'koyu' ? 'dark' : 'light', ...ekstra });
    await ctx.route((url) => !url.href.startsWith(ADRES), (r) => { disIstek.push(r.request().url()); return r.abort(); });
    await ctx.route(/^https:\/\/sahte\.supabase\.co\/storage\/v1\/object\/public\//, async (r) => {
      const yol = decodeURIComponent(new URL(r.request().url()).pathname.replace('/storage/v1/object/public/', ''));
      const p = ctx.pages().find((x) => x.url().startsWith(ADRES));
      const veri = p ? await p.evaluate((k) => localStorage.getItem(k), 'sahte-depo-v1:' + yol).catch(() => null) : null;
      const m = veri && /^data:([^;,]+);base64,(.*)$/.exec(veri);
      const cors = { 'Access-Control-Allow-Origin': '*' }; // kapaklar crossorigin="anonymous" (gerçek depo gibi)
      if (m) return r.fulfill({ status: 200, contentType: m[1], headers: cors, body: Buffer.from(m[2], 'base64') });
      const ornek = ornekReklamGorseli(yol);
      return ornek ? r.fulfill({ status: 200, contentType: gorselTuru(yol), headers: cors, body: ornek }) : r.fulfill({ status: 404, body: '' });
    });
    ctx.on('page', (p) => { p.on('response', (r) => { const y = r.url().startsWith(ADRES) && r.url().replace(ADRES, '').split('?')[0]; if (r.status() === 404 && y && !KASITLI_404.test(y)) yok404.add(y); });
      p.setDefaultTimeout(10000); p.on('pageerror', (e) => hatalar.push(p.url() + ': ' + e.message)); p.on('dialog', (d) => d.accept()); });
    const p = await ctx.newPage();
    // Sahte verinin örnek reklamı: ilk reklam veren Narçil Cafe yayında (ana akış, haber sonu, M1 maçında "Maçın sponsoru").
    // Görselleri docs/ilk-reklam/'dan sunulur (yukarıdaki depo taklidi).
    await p.goto(ADRES + '/index.html?sahte=1');
    await p.waitForSelector('#akis[data-durum="tamam"] .haber-satir');
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
    kontrol(`${ad}: <html lang="tr">, "Bağımsız taraftar uygulaması" şeridi, alt bilgide "Çorum FK'nın resmî uygulaması değildir"`, d.lang === 'tr' && d.serit === 'Bağımsız taraftar uygulaması' && d.seritGorunur && /Çorum FK'nın resmî uygulaması değildir/.test(d.alt), JSON.stringify(d).slice(0, 200));
    kontrol(`${ad}: amblem yedeği yüklü (assets/logo/amblem-yedek.svg)`, d.amblem && d.amblem.src === 'assets/logo/amblem-yedek.svg' && d.amblem.w > 0, JSON.stringify(d.amblem));
    kontrol(`${ad}: Oswald (başlık) ve Source Sans 3 (gövde) siteden yüklendi`, d.yuklu.some((x) => /^Oswald/.test(x)) && d.yuklu.some((x) => /^Source Sans 3/.test(x)) && /^Oswald/.test(d.baslikFont) && /^"?Source Sans 3/.test(d.govdeFont), JSON.stringify(d.yuklu));
  };
  // Tam sayfa görüntüde sabit alt menü ilk ekranın altında asılı kalmasın: sayfanın sonuna (kaydırılmış hâli gibi) yerleştirilir.
  // (CSSOM ile; CSP satır içi stile izin vermez ama JS'in öğe stilini değiştirmesi serbesttir.)
  const foto = async (p, ad, { kopya = null } = {}) => {
    await p.evaluate(() => { const n = document.querySelector('.alt-nav'); if (n && getComputedStyle(n).position === 'fixed') { n.style.position = 'absolute'; n.style.bottom = 'auto'; n.style.top = (document.documentElement.scrollHeight - n.offsetHeight) + 'px'; } });
    await p.screenshot({ path: path.join(EKRAN, ad + '.png'), fullPage: true, animations: 'disabled' });
    if (kopya) fs.copyFileSync(path.join(EKRAN, ad + '.png'), path.join(__dirname, '..', 'docs', 'ekran', kopya + '.png'));
    await p.evaluate(() => { const n = document.querySelector('.alt-nav'); if (n) n.removeAttribute('style'); });
  };
  const kartKontrol = async (p, ad, secici, tema) => {
    const k = await p.locator(secici + ' .reklam-kart').evaluate((e) => {
      const c = getComputedStyle(e), et = e.querySelector('.reklam-etiket'), ec = getComputedStyle(et), b = getComputedStyle(e.querySelector('.reklam-eylem') || e);
      return { zemin: c.backgroundColor, kenar: c.borderTopStyle, etiket: e.querySelector('.reklam-etiket-metin').textContent, buyuk: ec.textTransform, etiketRenk: ec.color, gorunur: et.getBoundingClientRect().height > 0, font: c.fontFamily, dugme: b.backgroundColor };
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
        await p.locator('#akis .reklam-kart').evaluate((e) => e.scrollIntoView({ block: 'center' }));
        await p.waitForFunction(() => document.querySelector('#akis .reklam-gorsel')?.naturalWidth > 0);
        await genel(p, t('ana'));
        const k = await kartKontrol(p, t('ana'), '#akis .reklam-yuvasi', tema);
        kontrol(t('ana (013): etiket metni "Sponsor" (CSS ile SPONSOR)'), k.etiket === 'Sponsor');
        kontrol(t('ana: örnek reklam Narçil Cafe (ilk reklam veren)'), (await p.textContent('#akis .reklam-firma')) === 'Narçil Cafe');
        const rg = await p.locator('#akis .reklam-gorsel').evaluate((i) => ({ src: i.getAttribute('src'), cur: i.currentSrc, w: i.naturalWidth, gen: i.getAttribute('width'), yuk: i.getAttribute('height') }));
        kontrol(t('ana (012/013): reklam görseli WebP, yuvaya göre küçük kopyası (srcset) açılıyor, width/height var'), /\.webp$/.test(rg.src) && /narcil-480x251\.webp$/.test(rg.cur) && rg.w > 0 && rg.gen === '1200' && rg.yuk === '628', JSON.stringify(rg));
        const yuk = await p.locator('#akis .reklam-kart').evaluate((e) => Math.round(e.getBoundingClientRect().height));
        kontrol(t('ana (013): akıştaki sponsor kartı kompakt (≤ 200 px; haber satırının en çok ~2 katı)'), yuk <= 200, yuk);
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
          const kutular = [...document.querySelectorAll('#mac-basi, #mac-golleri, #yorumlar > *')].map(r);
          const ortusme = kutular.some((b) => !(b.bottom <= k.top || b.top >= k.bottom || b.right <= k.left || b.left >= k.right));
          return { ortusme, basAlti: k.top - r(document.querySelector('#mac-basi')).bottom, videoUstu: r(document.querySelector('#mac-golleri')).top - k.bottom };
        });
        kontrol(t('maç: sponsor kartı skorun altında, goller ve yorumlarla örtüşmüyor'), !mb.ortusme && mb.basAlti >= 0 && mb.videoUstu >= 0, JSON.stringify(mb));
        await foto(p, `mac-${gen}-${tema}`);

        for (const [ad, url, bekle] of [['takim', 'takim.html#fikstur', '#sonuclar .fikstur-satir'], ['goller', 'goller.html', '#arsiv[data-durum="tamam"] .arsiv-mac'], ['gol', 'gol.html?id=22222222-0000-4000-8000-000000000001', '#gol[data-durum="tamam"] .video-baslat'],
          ['profil', 'profil.html', '#profil[data-durum="tamam"]'], ['giris', 'giris.html', '#g-eposta'], ['gizlilik', 'gizlilik.html', '#son-guncelleme'], ['kurallar', 'kurallar.html', '#kurallar'], ['kaynaklar', 'kaynaklar.html', '#kaynak-listesi']]) {
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
        await p.locator(`#ry-reklamlar tr[data-reklam-id="${NARCIL_ANA_AKIS}"]`).getByRole('button', { name: 'Düzenle' }).click();
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

  // tema (013): Profil › Görünüm'de radyo grubu "Cihaz ayarı / Açık / Koyu"; seçim data-theme'e yazılır, sayfalar arasında hatırlanır
  await guvenli('tema seçimi', async () => {
    const { ctx, p } = await baglam({ width: 390, height: 844 }, 'acik');
    await p.goto(ADRES + '/profil.html');
    await p.waitForSelector('#profil[data-durum="tamam"]');
    const grup = p.getByRole('group', { name: 'Tema' });
    kontrol('tema (013): "Tema" adlı grup, 3 radyo; başta "Cihaz ayarı" seçili', (await grup.getByRole('radio').count()) === 3 && await p.isChecked('#tema-sistem'));
    await p.click('label[for="tema-koyu"]'); // radyo görsel olarak gizli hap; kullanıcı etikete dokunur
    const z = await p.evaluate(() => [document.documentElement.dataset.theme, getComputedStyle(document.body).backgroundColor, localStorage.getItem('tema'), document.activeElement.id]);
    kontrol('tema (013): "Koyu" seçilince koyu tema açıldı, hatırlandı, odak radyoda', z.join() === 'dark,rgb(11, 11, 11),dark,tema-koyu', z.join());
    await p.goto(ADRES + '/takim.html');
    await p.waitForSelector('#kadro-icerik[data-durum="tamam"]');
    kontrol('tema: başka sayfada da koyu (renk sıçraması yok: head içinde uygulanır)', (await p.evaluate(() => document.documentElement.dataset.theme)) === 'dark');
    await p.goto(ADRES + '/profil.html');
    await p.waitForSelector('#profil[data-durum="tamam"]');
    kontrol('tema: Profil açılınca kayıtlı seçim işaretli', await p.isChecked('#tema-koyu'));
    await p.click('label[for="tema-sistem"]');
    kontrol('tema (013): "Cihaz ayarı" seçimi siler, cihaz tercihine (açık) döner', (await p.evaluate(() => [document.documentElement.hasAttribute('data-theme'), localStorage.getItem('tema'), getComputedStyle(document.body).backgroundColor].join())) === 'false,,rgb(255, 255, 255)');
    await ctx.close();
  });

  // amblem: AMBLEM_DOSYASI → yedek → "ÇT"
  await guvenli('amblem', async () => {
    const ayar = fs.readFileSync(path.join(__dirname, '..', 'assets', 'ayar.js'), 'utf8').replace('export const AMBLEM_DOSYASI = null;', "export const AMBLEM_DOSYASI = 'assets/logo/amblem.png';");
    const { ctx, p } = await baglam({ width: 390, height: 844 }, 'acik');
    await ctx.route('**/assets/ayar.js', (r) => r.fulfill({ contentType: 'text/javascript', body: ayar }));
    const istenen = [];
    p.on('request', (q) => { if (/assets\/logo\//.test(q.url())) istenen.push(q.url().replace(ADRES + '/', '')); });
    await p.goto(ADRES + '/takim.html#fikstur');
    await p.waitForSelector('#sonuclar .fikstur-satir');
    await p.waitForFunction(() => { const i = document.querySelector('.logo img[data-amblem]'); return i && /amblem-yedek/.test(i.src) && i.naturalWidth > 0; });
    kontrol('amblem: ayar.js\'te verilen dosya yoksa yedek işarete dönüyor', istenen.includes('assets/logo/amblem.png'), JSON.stringify(istenen));
    await ctx.route('**/assets/logo/amblem-yedek.svg', (r) => r.fulfill({ status: 404, body: '' }));
    await p.goto(ADRES + '/goller.html');
    await p.waitForSelector('.logo .amblem-yazi');
    await p.waitForSelector('#arsiv[data-durum="tamam"] .arsiv-mac');
    kontrol('amblem (013): yedek de yoksa "ÇT" yazı işareti (kulüp kısaltması "ÇFK" değil), sayfa çalışıyor', (await p.textContent('.logo .amblem-yazi')) === 'ÇT' && (await p.$$('#arsiv .arsiv-mac')).length > 0);
    await ctx.close();
    const d = await baglam({ width: 390, height: 844 }, 'acik');
    const istek = [];
    d.p.on('request', (q) => { if (/assets\/logo\//.test(q.url())) istek.push(q.url().replace(ADRES + '/', '')); });
    await d.p.goto(ADRES + '/goller.html');
    await d.p.waitForSelector('#arsiv .arsiv-mac');
    kontrol('amblem: varsayılan (AMBLEM_DOSYASI null) yalnız yedek istenir, olmayan dosya istenmez', istek.length >= 1 && istek.every((x) => x === 'assets/logo/amblem-yedek.svg'), JSON.stringify(istek));
    await d.ctx.close();
  });

  // 013: dar (360×740) ve geniş (430×932) telefon, açık ve koyu: ana sayfa ve gol arşivi (docs/ekran/onizleme-*.png kopyaları);
  // gol, takım, profil 390'da. Her görüntüde: taşma yok, alt menü içeriği örtmüyor (son öğe ve alt bilgi bağlantıları menünün üstünde)
  for (const [gen, vp] of [['360', { width: 360, height: 740 }], ['430', { width: 430, height: 932 }]]) {
    for (const tema of ['acik', 'koyu']) {
      await guvenli(`telefon ${gen}-${tema}`, async () => {
        const { ctx, p } = await baglam(vp, tema);
        const t = (x) => `${x} (${gen} px, ${tema === 'koyu' ? 'koyu' : 'açık'})`;
        for (const [ad, url, bekle] of [['ana', 'index.html', '#akis[data-sponsor-durum="tamam"]'], ['goller', 'goller.html', '#arsiv[data-durum="tamam"] .arsiv-mac']]) {
          await p.goto(ADRES + '/' + url);
          await p.waitForSelector(bekle);
          await p.evaluate(async () => { for (const i of document.images) { i.loading = 'eager'; } await Promise.all([...document.images].map((i) => (i.complete ? 0 : new Promise((c) => { i.onload = i.onerror = c; })))); });
          await genel(p, t(ad));
          const alt = await p.evaluate(async () => {
            window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
            await new Promise((c) => setTimeout(c, 150));
            const nav = document.querySelector('.alt-nav').getBoundingClientRect();
            const son = [...document.querySelectorAll('footer.alt a')].pop().getBoundingClientRect();
            const sonIcerik = [...document.querySelectorAll('main section, main .arsiv-mac, main .daha-fazla')].filter((e) => e.getBoundingClientRect().height).pop().getBoundingClientRect();
            window.scrollTo({ top: 0, behavior: 'instant' });
            return { navUst: Math.round(nav.top), sonAlt: Math.round(son.bottom), icerikAlt: Math.round(sonIcerik.bottom) };
          });
          kontrol(t(`${ad} (013): sayfa sonunda alt menü son içeriği ve alt bilgi bağlantılarını örtmüyor`), alt.sonAlt <= alt.navUst && alt.icerikAlt <= alt.navUst, JSON.stringify(alt));
          await foto(p, `${ad}-${gen}-${tema}`, { kopya: tema === 'acik' ? `onizleme-${ad}-${gen}` : null });
        }
        await ctx.close();
      });
    }
  }
  await guvenli('telefon 390 yeni ekranlar', async () => {
    const { ctx, p } = await baglam({ width: 390, height: 844 }, 'acik');
    for (const [ad, url, bekle] of [['gol', 'gol.html?id=22222222-0000-4000-8000-000000000001', '#yorumlar .yorumlar'], ['takim', 'takim.html', '#kadro-icerik[data-durum="tamam"]'],
      ['takim-sakatlik', 'takim.html#sakatlik', '#sakatlik-icerik[data-durum="tamam"]'], ['takim-fikstur', 'takim.html#fikstur', '#gelecek[data-durum="tamam"]'], ['profil', 'profil.html', '#profil[data-durum="tamam"]']]) {
      await p.goto(ADRES + '/' + url);
      await p.waitForSelector(bekle);
      await p.evaluate(async () => { for (const i of document.images) i.loading = 'eager'; await Promise.all([...document.images].map((i) => (i.complete ? 0 : new Promise((c) => { i.onload = i.onerror = c; })))); });
      await genel(p, `${ad} (390, yeni ekran)`);
      await foto(p, `${ad}-390-yeni`);
    }
    await ctx.close();
  });

  kontrol('görünüm testlerinde JavaScript hatası yok', !hatalar.length, hatalar.join(' | '));
  kontrol('görünüm testlerinde aynı kökenden 404 yok (kırık kapak / eksik dosya)', !yok404.size, [...yok404].join(' | '));
  const yabanci = disIstek.filter((u) => !/^https:\/\/(www\.youtube-nocookie\.com|ornek\.test)/.test(u));
  kontrol('dış istek yok (Google Fonts, jsDelivr dahil; supabase-js sitenin kendisinden); yalnız YouTube gömme ve örnek mp4 denenir', !yabanci.length, [...new Set(yabanci)].join(' | '));
  kontrol('dış istek: jsDelivr\'e hiç istek gitmedi', !disIstek.some((u) => /jsdelivr/i.test(u)), [...new Set(disIstek)].join(' | '));

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
