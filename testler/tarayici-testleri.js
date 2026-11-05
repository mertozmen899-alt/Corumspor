// Tarayıcı testleri (Playwright): siteyi küçük bir yerel sunucuyla açar, sahte Supabase ile dener.
// Kullanım: node testler/tarayici-testleri.js   (ya da hepsi için: node testler/calistir.js)
// İnternete çıkmaz: 127.0.0.1 dışındaki bütün istekler (CDN, YouTube, video) engellenir.
const http = require('http'), fs = require('fs'), path = require('path');

const KOK = path.resolve(__dirname, '..');
const EKRAN = path.join(__dirname, 'ekran');
const TUR = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8' };

const H1 = '33333333-0000-4000-8000-000000000001';
const H2 = '33333333-0000-4000-8000-000000000002';
const H8 = '33333333-0000-4000-8000-000000000008';
const M1 = '11111111-0000-4000-8000-000000000001';
// 1x1 kırmızı PNG (kapak yükleme testi)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64');

// Sahte verideki örnek Narçil reklamının görselleri (reklam-gorselleri/ornek/...) docs/ilk-reklam/'daki gerçek dosyalardır.
// Testlerde sahte depo adresi (https://sahte.supabase.co/storage/...) localStorage'da yoksa bu dosyadan sunulur.
// Örnek reklam görselleri WebP (PNG kopyaları docs/ilk-reklam/'da durur).
const ORNEK_GORSELLER = { 'reklam-gorselleri/ornek/narcil-1200x628.webp': 'narcil-1200x628.webp', 'reklam-gorselleri/ornek/narcil-600x600.webp': 'narcil-600x600.webp',
  'reklam-gorselleri/ornek/narcil-480x251.webp': 'narcil-480x251.webp', 'reklam-gorselleri/ornek/narcil-192x192.webp': 'narcil-192x192.webp' };
function ornekReklamGorseli(yol) {
  const ad = ORNEK_GORSELLER[yol];
  return ad ? fs.readFileSync(path.join(KOK, 'docs', 'ilk-reklam', ad)) : null;
}
/** Depo yolunun dosya türü (örnek görseller ve testlerin sahte depo yanıtı için). */
const gorselTuru = (yol) => TUR[path.extname(String(yol))] || 'application/octet-stream';

function sunucuAc() {
  return new Promise((ok) => {
    const s = http.createServer((q, r) => {
      let yol = decodeURIComponent(q.url.split('?')[0].split('#')[0]);
      if (yol === '/') yol = '/index.html';
      const dosya = path.join(KOK, yol);
      if (!dosya.startsWith(KOK + path.sep) || !fs.existsSync(dosya) || fs.statSync(dosya).isDirectory()) { r.writeHead(404); return r.end('yok'); }
      r.writeHead(200, { 'Content-Type': TUR[path.extname(dosya)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(dosya).pipe(r);
    }).listen(0, '127.0.0.1', () => ok(s));
  });
}

async function tarayiciTestleri() {
  let chromium;
  try { ({ chromium } = require('playwright')); } catch (e) {
    return { gecen: [], kalan: ['Playwright bulunamadı (require("playwright")). Kurulum: npm i -g playwright ya da NODE_PATH ayarlayın'] };
  }
  fs.mkdirSync(EKRAN, { recursive: true });
  const sunucu = await sunucuAc();
  const ADRES = 'http://127.0.0.1:' + sunucu.address().port;
  const gecen = [], kalan = [];
  const kontrol = (ad, ok, detay) => (ok ? gecen.push(ad) : kalan.push(detay !== undefined ? `${ad} -> ${String(detay).slice(0, 300)}` : ad));
  const tarayici = await chromium.launch();

  async function baglam(vp, ekstra = {}) {
    // Saat dilimi bilerek New York: tarihlerin tarayıcıdan bağımsız Türkiye saatiyle yazıldığı denenir
    const ctx = await tarayici.newContext({ viewport: vp, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'America/New_York', ...ekstra });
    await ctx.route((url) => !url.href.startsWith(ADRES), (r) => r.abort());
    // Sahte Supabase deposu (haber kapakları ve reklam görselleri): gerçekteki gibi https://<proje>.supabase.co/storage/... adresinden
    await ctx.route(/^https:\/\/sahte\.supabase\.co\/storage\/v1\/object\/public\//, async (r) => {
      const yol = decodeURIComponent(new URL(r.request().url()).pathname.replace('/storage/v1/object/public/', ''));
      let sayfa = null;
      try { sayfa = r.request().frame().page(); } catch (e) { sayfa = null; }
      const veri = sayfa ? await sayfa.evaluate((k) => localStorage.getItem(k), 'sahte-depo-v1:' + yol).catch(() => null) : null;
      const m = veri && /^data:([^;,]+);base64,(.*)$/.exec(veri);
      if (m) return r.fulfill({ status: 200, contentType: m[1], body: Buffer.from(m[2], 'base64') });
      const ornek = ornekReklamGorseli(yol);
      return ornek ? r.fulfill({ status: 200, contentType: gorselTuru(yol), body: ornek }) : r.fulfill({ status: 404, body: 'yok' });
    });
    // Sahte veri reklamsız başlasın (örnek Narçil reklamı reklam-tarayici-testleri.js'te denenir): boş yuva testleri için
    await ctx.addInitScript(() => { try { if (/\.html$/.test(location.pathname)) localStorage.setItem('sahte_ornek_reklam', 'yok'); } catch (e) {} });
    const p = await ctx.newPage();
    p.setDefaultTimeout(8000);
    const hatalar = [];
    p.on('pageerror', (e) => hatalar.push(e.message));
    p.on('dialog', (d) => d.accept());
    return { ctx, p, hatalar };
  }
  const git = async (p, s) => { await p.goto(ADRES + '/' + s); await p.waitForLoadState('networkidle').catch(() => {}); };
  // Çıkış artık Profil'de ve onay penceresiyle (taraftarın değerlendirmesi: yanlışlıkla çıkış)
  const cikis = async (p) => {
    await git(p, 'profil.html');
    await p.click('#cikis');
    await p.waitForSelector('#cikis-onay[open]');
    await Promise.all([p.waitForURL(/index\.html/), p.click('#cikis-evet')]);
  };
  const AKIS = '#akis[data-durum="tamam"] .haber-satir';
  const metin = async (p, s) => ((await p.textContent(s).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  const tasmaYok = async (p, cihaz, ad) => {
    const [g, e] = await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    kontrol(`${cihaz} ${ad}: yatay taşma yok`, g <= e, `${g}px > ${e}px`);
  };
  const ekran = async (p, ad) => { await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(100); return p.screenshot({ path: path.join(EKRAN, ad + '.png'), fullPage: true }); };

  const cihazlar = [
    ['telefon', { width: 390, height: 844 }, ['ana', 'haber', 'mac', 'goller', 'yonetim']],
    ['masaustu', { width: 1280, height: 860 }, ['ana', 'mac', 'yonetim']],
  ];

  const guvenli = async (ad, f) => { try { await f(); } catch (e) { kalan.push(`${ad}: test yarıda kaldı -> ${String(e.message || e).split('\n')[0]}`); } };

  for (const [cihaz, vp, cekilecek] of cihazlar) await guvenli(cihaz, async () => {
    const { ctx, p, hatalar } = await baglam(vp);
    const c = (ad) => `${cihaz} ${ad}`;
    const foto = async (ad) => { if (cekilecek.includes(ad)) await ekran(p, `${ad}-${cihaz}`); };

    // ------------------------------------------------ ana sayfa
    await git(p, 'index.html?sahte=1');
    await p.waitForSelector(AKIS);
    const kartlar = await p.$$eval('#akis .haber-satir h3', (l) => l.map((x) => x.textContent));
    kontrol(c('ana: ilk sayfada 6 haber'), kartlar.length === 6, kartlar.length);
    kontrol(c('ana: en yeni haber en üstte (manşet hero\'da, akışta tekrar yok)'), kartlar[0] === 'Test haberi 1: Sahada üç puan' && !kartlar.includes('Test haberi 2: Deplasmanda bir puan'), JSON.stringify(kartlar));
    kontrol(c('ana: taslak haber görünmüyor'), !kartlar.some((k) => /Taslak/.test(k)));
    const hero = await p.evaluate(() => ({ etiket: document.querySelector('#hero-etiket').textContent, baslik: document.querySelector('#hero-baslik').textContent, href: document.querySelector('#hero-baslik a')?.getAttribute('href'), atif: document.querySelector('#hero-atif').textContent }));
    kontrol(c('ana (013): hero = manşet işaretli haber (Manşet etiketi, habere bağlantı, fotoğraf atfı)'),
      hero.etiket === 'Manşet' && hero.baslik === 'Test haberi 2: Deplasmanda bir puan' && /haber\.html\?id=33333333-0000-4000-8000-000000000002/.test(hero.href) && /Alienatedplus, CC BY-SA 4\.0/.test(hero.atif), JSON.stringify(hero));
    // 013: reklam yokken akıştaki sponsor yuvası TAMAMEN kaldırılır (boş li, boşluk, "Sponsor" yazısı kalmaz)
    await p.waitForSelector('#akis[data-sponsor-durum="tamam"]');
    const yuva = await p.evaluate(() => {
      const l = document.querySelector('#akis');
      const satirlar = [...l.querySelectorAll(':scope > li > .haber-satir')].map((a) => a.getBoundingClientRect());
      return { yuva: l.querySelectorAll('[data-reklam-alan], .akis-sponsor, .reklam-kart').length, li: l.children.length, haber: satirlar.length, sponsor: /Sponsor/.test(l.textContent),
        aralik: Math.round(satirlar[3].top - satirlar[2].bottom), normal: Math.round(satirlar[1].top - satirlar[0].bottom) };
    });
    kontrol(c('ana (013): reklam yokken akışta yuva hiç kalmadı (modül yüklendi, sessiz kaldı)'), yuva.yuva === 0 && !yuva.sponsor, JSON.stringify(yuva));
    kontrol(c('ana (013): liste öğesi sayısı = haber sayısı; 3. ve 4. haber arası boşluk diğerleriyle aynı'), yuva.li === yuva.haber && yuva.aralik === yuva.normal, JSON.stringify(yuva));
    const sonraki = await metin(p, '#sonraki-mac');
    kontrol(c('ana: sıradaki maç kartı (Deneme FK)'), /Deneme FK/.test(sonraki) && /Çorum FK/.test(sonraki), sonraki);
    kontrol(c('ana: maç saati Türkiye saatiyle (19:00, tarayıcı New York)'), /19:00/.test(sonraki), sonraki);
    kontrol(c('ana: altbilgide "Çorum FK\'nın resmî uygulaması değildir", şeritte "Bağımsız taraftar uygulaması"'), /Çorum FK'nın resmî uygulaması değildir/.test(await metin(p, 'footer')) && (await metin(p, '.resmi-degil')) === 'Bağımsız taraftar uygulaması');
    kontrol(c('ana: oturum yokken üst barda Profil bağlantısı (giriş Profil\'de)'), (await p.getAttribute('#oturum-alani a', 'href')) === 'profil.html' && (await metin(p, '#oturum-alani')) === 'Profil');
    await tasmaYok(p, cihaz, 'ana');
    await foto('ana');
    kontrol(c('ana: "Daha fazla" düğmesi görünüyor'), await p.isVisible('#daha-fazla'));
    await p.focus('#daha-fazla');
    await p.keyboard.press('Enter');
    await p.waitForFunction(() => document.querySelectorAll('#akis .haber-satir').length > 6);
    kontrol(c('ana: "Daha fazla" sonrası 7 haber'), (await p.$$('#akis .haber-satir')).length === 7);
    kontrol(c('ana: son sayfada "Daha fazla" gizlendi'), !(await p.isVisible('#daha-fazla')));
    const odak = await p.evaluate(() => ({ body: document.activeElement === document.body, id: document.activeElement.dataset && document.activeElement.dataset.haberId, durum: document.querySelector('#durum').textContent }));
    kontrol(c('ana (013): "Daha fazla"dan sonra odak body\'ye düşmez, ilk yeni habere gider (B-01)'), !odak.body && odak.id === '33333333-0000-4000-8000-000000000009', JSON.stringify(odak));
    await p.waitForFunction(() => /haber daha yüklendi/.test(document.querySelector('#durum').textContent));
    kontrol(c('ana (013): "1 haber daha yüklendi" #durum bölgesinden duyuruldu'), /1 haber daha yüklendi/.test(await metin(p, '#durum')));
    kontrol(c('ana: sayfalamadan sonra da akışta boş reklam yuvası yok'), (await p.$$('#akis [data-reklam-alan], #akis .akis-sponsor')).length === 0);

    // ------------------------------------------------ haber ayrıntısı
    await git(p, 'haber.html?id=' + H1);
    await p.waitForSelector('#makale h1');
    kontrol(c('haber: başlık'), (await metin(p, '#makale h1')) === 'Test haberi 1: Sahada üç puan');
    const kapak = await p.evaluate(() => { const i = document.querySelector('#makale img.kapak-buyuk'); return i && { src: i.getAttribute('src'), srcset: i.getAttribute('srcset'), atif: document.querySelector('#makale .foto-atif')?.textContent }; });
    kontrol(c('haber: kapak görseli (srcset 480/800/1600) ve fotoğraf atfı'), kapak && kapak.src === 'assets/img/corum-ulu-camii-800.webp' && /corum-ulu-camii-480\.webp 480w/.test(kapak.srcset) && /Acar54, CC BY-SA 4\.0, Wikimedia Commons/.test(kapak.atif), JSON.stringify(kapak));
    const govde = await p.evaluate(() => { const m = document.querySelector('#haber-metni'); return { p: m.querySelectorAll('p').length, br: m.querySelectorAll('br').length, script: m.querySelectorAll('script').length, metin: m.textContent }; });
    kontrol(c('haber: gövde paragraflara bölündü'), govde.p === 3 && govde.br === 1, JSON.stringify(govde));
    kontrol(c('haber: gövdedeki <script> düz metin, çalışmıyor'), govde.script === 0 && /<script>alert/.test(govde.metin), JSON.stringify(govde));
    kontrol(c('haber: tarih Türkçe yazılı'), /\d{4}/.test(await metin(p, '#makale time')), await metin(p, '#makale time'));
    const sira = await p.evaluate(() => {
      const y = document.querySelector('.reklam-yuvasi[data-reklam-alan="haber_sonu"]');
      if (!y) return null;
      const once = y.compareDocumentPosition(document.querySelector('#makale')) & Node.DOCUMENT_POSITION_PRECEDING;
      const sonra = y.compareDocumentPosition(document.querySelector('#yorumlar')) & Node.DOCUMENT_POSITION_FOLLOWING;
      return { once: !!once, sonra: !!sonra, yukseklik: y.getBoundingClientRect().height };
    });
    kontrol(c('haber: haber_sonu yuvası makaleden sonra, yorumlardan önce, boş'), sira && sira.once && sira.sonra && sira.yukseklik === 0, JSON.stringify(sira));
    await p.waitForSelector('#yorum-listesi .yorum');
    const yorumlar = await p.$$eval('#yorum-listesi .yorum .yorum-metni', (l) => l.map((x) => ({ t: x.textContent, b: x.querySelectorAll('b').length })));
    kontrol(c('haber: gizli yorum herkese görünmüyor'), yorumlar.length === 1, JSON.stringify(yorumlar));
    kontrol(c('haber: yorum HTML değil düz metin'), yorumlar[0] && yorumlar[0].t.includes('<b>kalın değil</b>') && yorumlar[0].b === 0, JSON.stringify(yorumlar));
    kontrol(c('haber: yorum başlığı sayıyı gösteriyor'), (await metin(p, '#yorum-baslik')) === 'Yorumlar (1)', await metin(p, '#yorum-baslik'));
    kontrol(c('haber: oturum yokken yorum formu yok, giriş notu var'), !(await p.$('#yorum-formu')) && await p.isVisible('#yorum-giris-notu'));
    await tasmaYok(p, cihaz, 'haber');
    await foto('haber');
    await git(p, 'haber.html?id=' + H8);
    await p.waitForSelector('#haber h1');
    kontrol(c('haber: taslak haber ziyaretçiye "bulunamadı"'), /bulunamadı/.test(await metin(p, '#haber h1')));
    await git(p, 'haber.html?id=bozuk');
    await p.waitForSelector('#haber h1');
    kontrol(c('haber: bozuk kimlik "bulunamadı"'), /bulunamadı/.test(await metin(p, '#haber h1')));

    // ------------------------------------------------ maçlar
    await git(p, 'maclar.html');
    await p.waitForURL(/takim\.html#fikstur/);
    kontrol(c('maçlar (013): eski maclar.html Takım › Fikstür\'e yönlendiriyor'), p.url().endsWith('takim.html#fikstur'));
    await p.waitForSelector('#gelecek[data-durum="tamam"] .fikstur-satir');
    const gelecek = await p.$$eval('#gelecek .fikstur-satir .eslesme', (l) => l.map((x) => x.textContent));
    const sonuclar = await p.$$eval('#sonuclar .fikstur-satir', (l) => l.map((x) => x.textContent));
    kontrol(c('maçlar: fikstür yakından uzağa'), gelecek.length === 2 && /Deneme FK/.test(gelecek[0]) && /Hayal/.test(gelecek[1]), JSON.stringify(gelecek));
    kontrol(c('maçlar: sonuçlar yeniden eskiye'), sonuclar.length === 3 && /Kurgu Gençlik/.test(sonuclar[0]) && /Eski Rakip/.test(sonuclar[2]), JSON.stringify(sonuclar));
    kontrol(c('maçlar: deplasmanda ev sahibi önce yazılır'), /Kurgu Gençlik – Çorum FK/.test(sonuclar[0]) && /1 - 1/.test(sonuclar[0]), sonuclar[0]);
    await tasmaYok(p, cihaz, 'maçlar');

    // ------------------------------------------------ maç ayrıntısı
    await git(p, 'mac.html?id=' + M1);
    await p.waitForSelector('#mac-basi');
    const bas = await metin(p, '#mac-basi');
    kontrol(c('maç: rakip, skor, durum'), /Çorum FK/.test(bas) && /Örnekköy Spor/.test(bas) && (await metin(p, '#skor')) === '2 - 1' && /Bitti/.test(bas), bas);
    kontrol(c('maç: saat Türkiye saatiyle (19:00) ve iç saha'), /19:00/.test(bas) && /İç saha/.test(bas) && /Çorum Şehir Stadyumu/.test(bas), bas);
    const sponsor = await p.evaluate(() => {
      const y = document.querySelector('.reklam-yuvasi[data-reklam-alan="mac_sponsoru"]');
      if (!y) return null;
      const basi = document.querySelector('#mac-basi'), gol = document.querySelector('#mac-golleri'), yor = document.querySelector('#yorumlar');
      return { macId: y.dataset.macId, basidan: !!(basi.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING), golden: !!(y.compareDocumentPosition(gol) & Node.DOCUMENT_POSITION_FOLLOWING), yorumdan: !!(y.compareDocumentPosition(yor) & Node.DOCUMENT_POSITION_FOLLOWING), yukseklik: y.getBoundingClientRect().height };
    });
    kontrol(c('maç: mac_sponsoru yuvası başlık altında, gol ve yorumlardan önce, data-mac-id doğru, boş'),
      sponsor && sponsor.macId === M1 && sponsor.basidan && sponsor.golden && sponsor.yorumdan && sponsor.yukseklik === 0, JSON.stringify(sponsor));
    await p.waitForSelector('#gol-listesi .gol');
    const goller = await p.$$eval('#gol-listesi .gol', (l) => l.map((x) => x.textContent.replace(/\s+/g, ' ')));
    kontrol(c('maç: goller dakika sırasıyla'), goller.length === 2 && /23'/.test(goller[0]) && /Ali Örnek/.test(goller[0]) && /90\+2'/.test(goller[1]) && /Penaltı/.test(goller[1]), JSON.stringify(goller));
    kontrol(c('maç (013): goller gol sayfasına bağlantı; maç sayfasında video (iframe/video) yüklenmez'),
      (await p.getAttribute('#gol-listesi .gol a', 'href')) === 'gol.html?id=22222222-0000-4000-8000-000000000001' && (await p.$$('#gol-listesi iframe, #gol-listesi video')).length === 0);
    await p.waitForSelector('#yorum-listesi .yorum');
    kontrol(c('maç: yorumlar görünüyor'), /Tribünler muhteşemdi/.test(await metin(p, '#yorum-listesi')));
    await tasmaYok(p, cihaz, 'maç');
    await foto('mac');

    // ------------------------------------------------ gol arşivi
    await git(p, 'goller.html');
    await p.waitForSelector('#arsiv[data-durum="tamam"] .arsiv-mac');
    const arsiv = await p.$$eval('#arsiv .arsiv-mac', (l) => l.map((x) => ({ id: x.dataset.macId, gol: x.querySelectorAll('.gol').length })));
    kontrol(c('goller: sadece golü olan maçlar, yeniden eskiye'), arsiv.length === 2 && arsiv[0].id.endsWith('2') && arsiv[1].id === M1 && arsiv[1].gol === 2, JSON.stringify(arsiv));
    const kapaklar = await p.$$eval('#arsiv a.video-kart', (l) => l.map((a) => ({ href: a.getAttribute('href'), img: a.querySelector('img')?.getAttribute('src') })));
    kontrol(c('goller (013): videolu gol kapak kartı (sitenin kendi kapağı) ve gol.html bağlantısı; arşivde oynatıcı yok'),
      kapaklar.length === 2 && kapaklar.every((k) => /^gol\.html\?id=/.test(k.href) && /^assets\/img\//.test(k.img)) && (await p.$$('#arsiv iframe, #arsiv video')).length === 0, JSON.stringify(kapaklar));
    // gol sayfası: dokununca YouTube (nocookie) / mp4 yüklenir
    await git(p, 'gol.html?id=22222222-0000-4000-8000-000000000001');
    await p.waitForSelector('#gol[data-durum="tamam"] .video-baslat');
    kontrol(c('gol (013): sayfa açılınca iframe yok (facade)'), (await p.$$('iframe')).length === 0);
    await p.click('.video-baslat');
    kontrol(c('gol (013): oynat → YouTube videosu nocookie ile gömülü'), /^https:\/\/www\.youtube-nocookie\.com\/embed\/aqz-KE-bpKQ\?/.test(await p.getAttribute('.video iframe', 'src') || ''));
    await git(p, 'gol.html?id=22222222-0000-4000-8000-000000000003');
    await p.waitForSelector('#gol[data-durum="tamam"] .video-baslat');
    await p.click('.video-baslat');
    kontrol(c('gol (013): mp4 video oynatıcı (dokununca, preload none)'), (await p.getAttribute('.video video', 'src')) === 'https://ornek.test/videolar/gol-3.mp4' && (await p.getAttribute('.video video', 'preload')) === 'none');
    await tasmaYok(p, cihaz, 'goller');
    await foto('goller');

    // ------------------------------------------------ yönetim: oturumsuz
    await git(p, 'yonetim.html');
    await p.waitForSelector('#yetki-mesaj:not([hidden])');
    kontrol(c('yönetim: oturumsuz ziyaretçi paneli görmüyor'), !(await p.isVisible('#panel')) && /giriş yapın/.test(await metin(p, '#yetki-mesaj')));

    // ------------------------------------------------ giriş
    await git(p, 'giris.html?donus=' + encodeURIComponent('haber.html?id=' + H2));
    await p.fill('#g-eposta', 'taraftar@ornek.test');
    await p.fill('#g-sifre', 'yanlis-sifre');
    await p.click('#g-gonder');
    await p.waitForFunction(() => document.querySelector('#giris-mesaj').textContent.trim() !== '');
    kontrol(c('giriş: yanlış şifrede Türkçe hata ("sen" diliyle, sıfırlamayı öneriyor)'), (await metin(p, '#giris-mesaj')) === 'E-posta ya da şifre tutmadı. Tekrar dene ya da şifreni sıfırla.', await metin(p, '#giris-mesaj'));
    await p.fill('#g-sifre', 'sifre1234');
    await Promise.all([p.waitForURL(/haber\.html/), p.click('#g-gonder')]);
    await p.waitForSelector('#yorum-formu');
    kontrol(c('giriş: başarılı giriş dönüş sayfasına götürür'), p.url().includes('haber.html?id=' + H2));
    const ustAlan = await metin(p, '#oturum-alani');
    kontrol(c('giriş: üstte (profil simgesinde) kullanıcı adı, "Yönetim" yok'), /ayse_19/.test(ustAlan) && !/Yönetim/.test(ustAlan) && (await metin(p, '#oturum-alani .avatar')) === 'A', ustAlan);

    // ------------------------------------------------ yorum: yaz, düzenle, sil, oran sınırı
    await p.fill('#yorum-metni', 'Testten <i>selam</i>');
    await p.click('#yorum-formu button[type=submit]');
    await p.waitForFunction(() => /Testten/.test(document.querySelector('#yorum-listesi').textContent));
    const benimId = await p.locator('#yorum-listesi .yorum', { hasText: 'Testten' }).getAttribute('data-yorum-id');
    const benim = p.locator(`#yorum-listesi .yorum[data-yorum-id="${benimId}"]`);
    kontrol(c('yorum: taraftar yorum yazabildi (düz metin)'), (await benim.locator('i').count()) === 0 && /<i>selam<\/i>/.test(await benim.locator('.yorum-metni').textContent()));
    await benim.getByRole('button', { name: 'Düzenle' }).click();
    await benim.locator('textarea').fill('Testten düzeltilmiş yorum');
    await benim.getByRole('button', { name: 'Kaydet' }).click();
    await p.waitForFunction(() => /düzeltilmiş/.test(document.querySelector('#yorum-listesi').textContent));
    kontrol(c('yorum: kendi yorumunu düzenledi, "(düzenlendi)" yazıyor'), /\(düzenlendi\)/.test(await p.locator('#yorum-listesi .yorum', { hasText: 'düzeltilmiş' }).textContent()));
    await p.locator('#yorum-listesi .yorum', { hasText: 'düzeltilmiş' }).getByRole('button', { name: 'Sil' }).click();
    await p.waitForFunction(() => !/düzeltilmiş/.test(document.querySelector('#yorum-listesi').textContent));
    kontrol(c('yorum: kendi yorumunu sildi'), !/düzeltilmiş/.test(await metin(p, '#yorum-listesi')));
    for (let i = 1; i <= 6; i++) {
      await p.fill('#yorum-metni', 'Seri yorum ' + i);
      await p.click('#yorum-formu button[type=submit]');
      await p.waitForFunction(() => document.querySelector('#yorum-formu button[type=submit]').getAttribute('aria-disabled') !== 'true');
      await p.waitForTimeout(30);
    }
    const oranMesaj = await metin(p, '#yorum-mesaj');
    kontrol(c('yorum: dakikada 5 yorumdan sonra sunucu mesajı gösteriliyor'), /Çok hızlı yorum/.test(oranMesaj) && (await p.$$('#yorum-listesi .yorum')).length === 5, oranMesaj);

    await git(p, 'mac.html?id=' + M1);
    await p.waitForSelector('#yorum-listesi .yorum');
    const baska = p.locator('#yorum-listesi .yorum', { hasText: 'Tribünler' });
    kontrol(c('yorum: başkasının yorumunda düzenle/sil düğmesi yok, yalnız "Şikâyet et" (013)'),
      (await baska.getByRole('button', { name: /Düzenle|Sil/ }).count()) === 0 && (await baska.getByRole('button', { name: 'Şikâyet et' }).count()) === 1);

    // ------------------------------------------------ yönetim: taraftar engelli
    await git(p, 'yonetim.html');
    await p.waitForSelector('#yetki-mesaj:not([hidden])');
    kontrol(c('yönetim: taraftar engelleniyor'), !(await p.isVisible('#panel')) && /sadece yöneticiler/.test(await metin(p, '#yetki-mesaj')));

    // ------------------------------------------------ yönetici
    await cikis(p);
    await git(p, 'giris.html?donus=yonetim.html');
    await p.fill('#g-eposta', 'yonetici@ornek.test');
    await p.fill('#g-sifre', 'sifre1234');
    await Promise.all([p.waitForURL(/yonetim\.html/), p.click('#g-gonder')]);
    await p.waitForSelector('#panel:not([hidden])');
    kontrol(c('yönetim: yönetici paneli görüyor, üstte yönetici adı'), await p.isVisible('#panel') && /kirmizi_simsek/.test(await metin(p, '#oturum-alani')));
    const sekmeler = await p.$$eval('[role=tab][data-sekme]', (l) => l.map((x) => x.textContent));
    kontrol(c('yönetim (013): 7 sekme (Kadro, Sakatlıklar ve Reklamlar dahil)'), JSON.stringify(sekmeler) === JSON.stringify(['Haberler', 'Maçlar', 'Goller', 'Kadro', 'Sakatlıklar', 'Yorumlar', 'Reklamlar']), JSON.stringify(sekmeler));
    await p.waitForSelector('#haber-listesi li');
    kontrol(c('yönetim: taslak haber listede'), /Taslak test haberi/.test(await metin(p, '#haber-listesi')));

    // haber ekle (kapaklı, yayında)
    await p.fill('#h-baslik', 'Yönetici test haberi ' + cihaz);
    await p.fill('#h-ozet', 'Panelden eklendi.');
    await p.fill('#h-govde', 'Birinci paragraf.\n\nİkinci paragraf.');
    await p.setInputFiles('#h-kapak', { name: 'kapak.png', mimeType: 'image/png', buffer: PNG });
    await p.check('#h-yayinda');
    await p.click('#h-kaydet');
    await p.waitForSelector('#panel-mesaj:not([hidden])');
    kontrol(c('yönetim: haber eklendi mesajı'), (await metin(p, '#panel-mesaj')) === 'Haber eklendi.', await metin(p, '#panel-mesaj'));
    await p.waitForFunction((b) => document.querySelector('#haber-listesi').textContent.includes(b), 'Yönetici test haberi ' + cihaz);
    await foto('yonetim');

    // taslağı yayınla / kaldır
    const taslak = p.locator('#haber-listesi li', { hasText: 'Taslak test haberi' });
    await taslak.getByRole('button', { name: 'Yayınla' }).click();
    await p.waitForFunction(() => /yayınlandı/.test(document.querySelector('#panel-mesaj').textContent));
    await p.locator('#haber-listesi li', { hasText: 'Taslak test haberi' }).getByRole('button', { name: 'Yayından kaldır' }).click();
    await p.waitForFunction(() => /kaldırıldı/.test(document.querySelector('#panel-mesaj').textContent));
    kontrol(c('yönetim: haberi yayınlayıp yayından kaldırdı'), /Taslak/.test(await p.locator('#haber-listesi li', { hasText: 'Taslak test haberi' }).textContent()));

    // maç ekle (Türkiye saati) + gol ekle
    await p.click('#sekme-maclar');
    await p.waitForSelector('#mac-formu');
    await p.fill('#m-rakip', 'Panel Rakibi');
    await p.fill('#m-tarih', '2026-12-01T19:30');
    await p.selectOption('#m-ic-saha', 'false');
    await p.fill('#m-stadyum', 'Panel Stadı');
    await p.selectOption('#m-durum', 'bitti');
    await p.fill('#m-corum-skor', '3');
    await p.fill('#m-rakip-skor', '1');
    await p.click('#m-kaydet');
    await p.waitForFunction(() => /Maç eklendi/.test(document.querySelector('#panel-mesaj').textContent));
    kontrol(c('yönetim: maç eklendi'), /Panel Rakibi 1 - 3 Çorum FK/.test(await metin(p, '#mac-listesi')), await metin(p, '#mac-listesi'));
    await p.click('#sekme-goller');
    await p.waitForFunction(() => [...document.querySelectorAll('#g-mac option')].some((o) => /Panel Rakibi/.test(o.textContent)));
    const macDegeri = await p.$eval('#g-mac', (s) => [...s.options].find((o) => /Panel Rakibi/.test(o.textContent)).value);
    await p.selectOption('#g-mac', macDegeri);
    await p.fill('#g-oyuncu', 'Panel Golcü');
    await p.fill('#g-dakika', '44');
    await p.fill('#g-video', 'javascript:alert(1)');
    await p.click('#g-kaydet');
    await p.waitForFunction(() => /YouTube/.test(document.querySelector('#panel-mesaj').textContent));
    kontrol(c('yönetim: geçersiz video adresi reddedildi'), /Video bağlantısı/.test(await metin(p, '#panel-mesaj')));
    await p.fill('#g-video', 'https://youtu.be/aqz-KE-bpKQ');
    await p.click('#g-kaydet');
    await p.waitForFunction(() => /Gol eklendi/.test(document.querySelector('#panel-mesaj').textContent));
    kontrol(c('yönetim: gol eklendi'), /Panel Golcü/.test(await metin(p, '#gol-listesi')));

    // yorum moderasyonu: Ayşe'nin yorumunu gizle
    await p.click('#sekme-yorumlar');
    await p.waitForSelector('#yorum-moderasyon li');
    const ayse = p.locator('#yorum-moderasyon li', { hasText: 'Harika maçtı!' });
    await ayse.getByRole('button', { name: 'Gizle' }).click();
    await p.waitForFunction(() => /gizlendi/.test(document.querySelector('#panel-mesaj').textContent));
    kontrol(c('yönetim: yorumu gizledi'), /Gizli/.test(await p.locator('#yorum-moderasyon li', { hasText: 'Harika maçtı!' }).textContent()));
    await p.locator('#yorum-moderasyon li', { hasText: 'Seri yorum 1' }).getByRole('button', { name: 'Sil' }).click();
    await p.waitForFunction(() => /Yorum silindi/.test(document.querySelector('#panel-mesaj').textContent));
    kontrol(c('yönetim: başkasının yorumunu sildi'), !/Seri yorum 1\b/.test(await metin(p, '#yorum-moderasyon')));

    // reklamlar sekmesi: gerçek reklam modülü #reklamlar-sekmesi'ne bağlanır
    await p.click('#sekme-reklamlar');
    await p.waitForSelector('#reklamlar-sekmesi #ry-yeni');
    const rs = await p.evaluate(() => { const s = document.querySelector('section#reklamlar-sekmesi[data-modul="reklamlar"]'); return s ? { ry: s.classList.contains('ry'), gorunur: !s.closest('[hidden]'), modulYok: !document.querySelector('#reklam-modul-yok').hidden } : null; });
    kontrol(c('yönetim: Reklamlar sekmesinde reklam modülü bağlandı (#reklamlar-sekmesi)'), rs && rs.ry && rs.gorunur && !rs.modulYok, JSON.stringify(rs));
    await tasmaYok(p, cihaz, 'yönetim');

    // yeni haber ana sayfada, maç saati Türkiye saatiyle, gizlenen yorum ziyaretçiye kapalı
    await git(p, 'index.html');
    await p.waitForSelector(AKIS);
    const ilk = p.locator('#akis .haber-satir').first();
    kontrol(c('ana: yöneticinin eklediği haber en üstte'), (await ilk.locator('h3').textContent()) === 'Yönetici test haberi ' + cihaz);
    // Kapak, gerçekteki gibi projenin deposundan (haber-gorselleri) gelir ve gerçekten açılır (012: başka adres kabul edilmez);
    // 013: panel 1600/800/480 WebP kopyası yükler, akış 480'liği ister
    await ilk.locator('img').scrollIntoViewIfNeeded();
    await p.waitForFunction(() => { const i = document.querySelector('#akis .haber-satir img'); return i && i.complete; }).catch(() => {});
    // srcset'li görselde naturalWidth yoğunluğa bölünür (1×1 test PNG'si 96 px yuvada 0'a yuvarlanır): "açılıyor" decode() ile denenir
    const yuklenen = await ilk.locator('img').evaluate(async (i) => ({ src: i.getAttribute('src'), cur: i.currentSrc, acildi: await i.decode().then(() => true, () => false) }));
    kontrol(c('ana: yüklenen kapak görseli gösteriliyor (proje deposundan, 480 px kopyası, açılıyor)'),
      /^https:\/\/sahte\.supabase\.co\/storage\/v1\/object\/public\/haber-gorselleri\/[0-9a-f-]{36}-480\.webp$/.test(yuklenen.src || '') && yuklenen.cur === yuklenen.src && yuklenen.acildi, JSON.stringify(yuklenen));
    await git(p, 'takim.html#fikstur');
    await p.waitForSelector('#sonuclar .fikstur-satir');
    const panelMaci = await metin(p, '#sonuclar .fikstur-satir');
    kontrol(c('maçlar: panelden eklenen maç Türkiye saatiyle 19:30'), /Panel Rakibi/.test(panelMaci) && /1 - 3/.test(panelMaci) && /19:30/.test(panelMaci), panelMaci);
    await git(p, 'goller.html');
    await p.waitForSelector('#arsiv[data-durum="tamam"] .arsiv-mac');
    kontrol(c('goller: panelden eklenen gol arşivde'), /Panel Golcü/.test(await metin(p, '#arsiv')));
    await cikis(p);
    await git(p, 'haber.html?id=' + H1);
    await p.waitForSelector('#yorum-listesi li');
    kontrol(c('haber: gizlenen yorum ziyaretçiye görünmüyor'), !/Harika maçtı/.test(await metin(p, '#yorum-listesi')) && (await metin(p, '#yorum-baslik')) === 'Yorumlar (0)', await metin(p, '#yorum-listesi'));

    kontrol(c('sayfalarda JavaScript hatası yok'), !hatalar.length, hatalar.join(' | '));
    await ctx.close();
  });

  // ------------------------------------------------ kayıt ol
  await guvenli('kayıt', async () => {
    const { ctx, p, hatalar } = await baglam({ width: 390, height: 844 });
    await git(p, 'giris.html?sahte=1#kayit');
    await p.fill('#k-ad', 'yeni_taraftar');
    await p.fill('#k-eposta', 'yeni@ornek.test');
    await p.fill('#k-sifre', 'kisa');
    await p.click('#k-gonder');
    const ksh = await p.evaluate(() => ({ hata: document.querySelector('#k-sifre-hata').textContent, gecersiz: document.querySelector('#k-sifre').getAttribute('aria-invalid'), odak: document.activeElement.id, bagli: document.querySelector('#k-sifre').getAttribute('aria-describedby') }));
    kontrol('kayıt (013): kısa şifre alanın altında reddedildi (aria-invalid, aria-describedby, odak alanda)', /en az 8/.test(ksh.hata) && ksh.gecersiz === 'true' && ksh.odak === 'k-sifre' && /k-sifre-hata/.test(ksh.bagli), JSON.stringify(ksh));
    await p.fill('#k-sifre', 'uzunsifre123');
    await p.click('#k-gonder');
    await p.waitForSelector('#hosgeldin:not([hidden])');
    kontrol('kayıt (013): "Hoş geldin yeni_taraftar!" karşılaması, odak karşılamada', (await metin(p, '#hosgeldin-baslik')) === 'Hoş geldin yeni_taraftar!' && (await p.evaluate(() => document.activeElement.id)) === 'hosgeldin');
    await Promise.all([p.waitForURL(/index\.html/), p.click('#hosgeldin-devam')]);
    await p.waitForSelector('#oturum-alani .kullanici');
    kontrol('kayıt: yeni hesap açıldı, kullanıcı adı üstte', (await metin(p, '#oturum-alani .kullanici')) === 'yeni_taraftar');
    await git(p, 'yonetim.html');
    await p.waitForSelector('#yetki-mesaj:not([hidden])');
    kontrol('kayıt: yeni hesap taraftar, yönetime giremez', !(await p.isVisible('#panel')));
    kontrol('kayıt sayfalarında JavaScript hatası yok', !hatalar.length, hatalar.join(' | '));
    await ctx.close();
  });

  // ------------------------------------------------ reklam sözleşmesi: sahte reklam modülüyle
  await guvenli('reklam', async () => {
    const { ctx, p, hatalar } = await baglam({ width: 1280, height: 860 });
    await ctx.route('**/assets/reklam/reklam.js', (r) => r.fulfill({ contentType: 'text/javascript', body:
      'export async function reklamYerlestir(el, { alan, macId }) { const d = document.createElement("div"); d.className = "test-reklam"; d.textContent = "REKLAM " + alan + (macId ? " " + macId : ""); d.style.height = "50px"; el.append(d); }' }));
    await ctx.route('**/assets/reklam/yonetim-reklamlar.js', (r) => r.fulfill({ contentType: 'text/javascript', body:
      'export default function kur(el, { supabase }) { el.textContent = "REKLAM YÖNETİMİ " + (typeof supabase.from); }' }));
    await git(p, 'index.html?sahte=1');
    await p.waitForSelector('.reklam-yuvasi .test-reklam');
    kontrol('reklam: modül varsa ana_akis yuvasına reklamYerlestir çağrılıyor', (await metin(p, '.reklam-yuvasi[data-reklam-alan="ana_akis"]')) === 'REKLAM ana_akis');
    const sira = await p.evaluate(() => { const li = document.querySelector('#akis > li.akis-sponsor'); let once = 0; let x = li && li.previousElementSibling; while (x) { if (x.querySelector('.haber-satir')) once++; x = x.previousElementSibling; } return { once, adet: document.querySelectorAll('#akis .reklam-yuvasi[data-reklam-alan="ana_akis"]').length, sira: li && li.firstElementChild.dataset.reklamSira }; });
    kontrol('reklam: akışta sponsor yuvası 3. haberden sonra, ilk sayfada tek (sira 0)', sira.once === 3 && sira.adet === 1 && sira.sira === '0', JSON.stringify(sira));
    kontrol('reklam: dolu yuva yer kaplıyor', (await p.$eval('.reklam-yuvasi', (y) => y.getBoundingClientRect().height)) === 50);
    await git(p, 'haber.html?id=' + H1);
    await p.waitForSelector('.reklam-yuvasi .test-reklam');
    kontrol('reklam: haber_sonu yuvası dolduruldu', (await metin(p, '.reklam-yuvasi[data-reklam-alan="haber_sonu"]')) === 'REKLAM haber_sonu');
    await git(p, 'mac.html?id=' + M1);
    await p.waitForSelector('.reklam-yuvasi .test-reklam');
    kontrol('reklam: mac_sponsoru yuvasına macId geçiyor', (await metin(p, '.reklam-yuvasi[data-reklam-alan="mac_sponsoru"]')) === 'REKLAM mac_sponsoru ' + M1);
    await git(p, 'giris.html');
    await p.fill('#g-eposta', 'yonetici@ornek.test');
    await p.fill('#g-sifre', 'sifre1234');
    await Promise.all([p.waitForURL(/index\.html/), p.click('#g-gonder')]);
    await git(p, 'yonetim.html#reklamlar');
    await p.waitForFunction(() => /REKLAM YÖNETİMİ/.test(document.querySelector('#reklamlar-sekmesi').textContent));
    kontrol('reklam: yönetim modülü #reklamlar-sekmesi içine supabase ile bağlandı', (await metin(p, '#reklamlar-sekmesi')) === 'REKLAM YÖNETİMİ function' && !(await p.isVisible('#reklam-modul-yok')));
    // Hata veren reklam modülü sayfayı bozmamalı
    await ctx.unroute('**/assets/reklam/reklam.js');
    await ctx.route('**/assets/reklam/reklam.js', (r) => r.fulfill({ contentType: 'text/javascript', body: 'export function reklamYerlestir() { throw new Error("bozuk"); }' }));
    const p2 = await ctx.newPage();
    const h2 = []; p2.on('pageerror', (e) => h2.push(e.message));
    await git(p2, 'mac.html?sahte=1&id=' + M1);
    await p2.waitForSelector('#gol-listesi .gol');
    const durum = await p2.$eval('.reklam-yuvasi[data-reklam-alan="mac_sponsoru"]', (y) => [y.dataset.reklamDurum, y.getBoundingClientRect().height]);
    kontrol('reklam: hata veren modülde yuva boş kalıyor, sayfa çalışıyor', durum[0] === 'hata' && durum[1] === 0 && !h2.length, JSON.stringify(durum) + h2.join('|'));
    kontrol('reklam testlerinde JavaScript hatası yok', !hatalar.length, hatalar.join(' | '));
    await ctx.close();
  });

  // ------------------------------------------------ statik: CSP, alt bilgi, meta, Cloudflare başlıkları (dosyalardan)
  await guvenli('statik', async () => {
    // supabase-js sitenin kendisinden (assets/vendor/), jsDelivr'in 2.45.4 UMD dosyasıyla bayt bayt aynı (SRI aynı hash)
    const SUPABASE_JS = 'assets/vendor/supabase-js-2.45.4/supabase.js';
    const SRI = 'sha384-0w2KAL2YHP6wKOkUDzkCDGgVvfmHnj02DHeQ6XcHOgTfFsGyonKOpShMH1x6nk9o';
    const vendorHash = fs.existsSync(path.join(KOK, SUPABASE_JS)) ? 'sha384-' + require('crypto').createHash('sha384').update(fs.readFileSync(path.join(KOK, SUPABASE_JS))).digest('base64') : '(dosya yok)';
    kontrol('statik: supabase-js 2.45.4 sitede (assets/vendor/), hash eski SRI ile aynı (npm paketiyle bayt bayt aynı)', vendorHash === SRI, vendorHash);
    // og:image: özgün 1200×630 PNG (resmî amblem yok)
    const OG = 'assets/img/og-1200x630.png';
    const og = fs.existsSync(path.join(KOK, OG)) ? fs.readFileSync(path.join(KOK, OG)) : null;
    kontrol('statik: og görseli 1200×630 PNG', og && og.toString('ascii', 1, 4) === 'PNG' && og.readUInt32BE(16) === 1200 && og.readUInt32BE(20) === 630, og ? `${og.readUInt32BE(16)}x${og.readUInt32BE(20)}` : '(dosya yok)');
    const robots = fs.existsSync(path.join(KOK, 'robots.txt')) ? fs.readFileSync(path.join(KOK, 'robots.txt'), 'utf8') : '';
    kontrol('statik: robots.txt var (User-agent)', /^User-agent: \*/m.test(robots), robots || '(dosya yok)');
    const sayfalar = fs.readdirSync(KOK).filter((d) => d.endsWith('.html')).sort();
    kontrol('statik: gizlilik.html var (KVKK aydınlatma + tarayıcı depolaması)', sayfalar.includes('gizlilik.html'), sayfalar.join(','));
    const cspler = new Set();
    for (const ad of sayfalar) {
      const s = fs.readFileSync(path.join(KOK, ad), 'utf8');
      const csp = (/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(s) || [])[1] || '';
      cspler.add(csp);
      const yonerge = (k) => (csp.split(';').map((x) => x.trim()).find((x) => x.startsWith(k + ' ')) || '').split(/\s+/).slice(1);
      kontrol(`statik: ${ad} CSP'de 'unsafe-inline' / 'unsafe-eval' yok`, csp && !/unsafe-inline|unsafe-eval/.test(csp), csp);
      kontrol(`statik: ${ad} script-src yalnız 'self' (supabase-js de sitenin kendisinden; jsDelivr yok)`, JSON.stringify(yonerge('script-src')) === JSON.stringify(["'self'"]), yonerge('script-src').join(' '));
      kontrol(`statik: ${ad} hiçbir yerde jsDelivr adresi yok`, !/jsdelivr\.(net|com)/i.test(s), ad);
      const sb = /<script defer src="([^"]+)" integrity="([^"]+)"><\/script>/.exec(s) || [];
      kontrol(`statik: ${ad} supabase-js <script defer> yerel dosyadan, SRI ile`, sb[1] === SUPABASE_JS && sb[2] === SRI, sb[0] || '(etiket yok)');
      kontrol(`statik: ${ad} img-src yalnız 'self' + Supabase deposu + data:/blob: (her https adresi değil)`,
        JSON.stringify(yonerge('img-src')) === JSON.stringify(["'self'", 'https://*.supabase.co', 'data:', 'blob:']), yonerge('img-src').join(' '));
      kontrol(`statik: ${ad} og:image 1200×630 (assets/img/og-1200x630.png) + boyut + alt metin`,
        s.includes(`<meta property="og:image" content="${OG}">`) && s.includes('<meta property="og:image:width" content="1200">') && s.includes('<meta property="og:image:height" content="630">') && /<meta property="og:image:alt" content="[^"]{10,}">/.test(s), ad);
      kontrol(`statik: ${ad} CSP object-src 'none', base-uri, form-action`, yonerge('object-src')[0] === "'none'" && yonerge('base-uri').length && yonerge('form-action').length, csp);
      const alt = (/<footer class="alt">([\s\S]*?)<\/footer>/.exec(s) || [])[1] || '';
      kontrol(`statik: ${ad} alt bilgide "Çorum FK'nın resmî uygulaması değildir" (künye), gizlilik, kurallar ve fotoğraf kaynakları bağlantısı`,
        /Çorum FK'nın resmî uygulaması değildir/.test(alt) && /<a href="gizlilik\.html"/.test(alt) && /<a href="kurallar\.html"/.test(alt) && /<a href="kaynaklar\.html"/.test(alt) && /data-ayar="ILETISIM_EPOSTA"/.test(alt) && /kaldırma/i.test(alt), alt.slice(0, 120));
      kontrol(`statik: ${ad} şerit "Bağımsız taraftar uygulaması", "Biz Anadoluyuz" / "Kırmızı Şimşekler" / "ÇFK" yok`, s.includes('Bağımsız taraftar uygulaması</p>') && !/Biz Anadoluyuz|Kırmızı Şimşekler|ÇFK/.test(s), ad);
      kontrol(`statik: ${ad} viewport-fit=cover, CSP worker-src 'self', alt gezinme (4 bağlantı) main'den sonra`,
        /<meta name="viewport" content="[^"]*viewport-fit=cover/.test(s) && yonerge('worker-src')[0] === "'self'" && (/<nav class="alt-nav" id="alt-nav" aria-label="Ana gezinme">[\s\S]*?<\/nav>/.exec(s) || [''])[0].match(/<a href=/g)?.length === 4 && s.indexOf('</main>') < s.indexOf('class="alt-nav"'), ad);
      const modul = (/<script type="module" src="([^"]+)"><\/script>/.exec(s) || [])[1];
      if (modul) kontrol(`statik: ${ad} sayfa modülü ve ortak modüller modulepreload ile (zincir derinliği ≤ 2)`, s.includes(`<link rel="modulepreload" href="${modul}">`) && s.includes('<link rel="modulepreload" href="assets/ortak.js">') && s.includes('<link rel="modulepreload" href="assets/istemci.js">'), ad);
      kontrol(`statik: ${ad} lang="tr", başlık, açıklama, simge, Open Graph`, /<html lang="tr">/.test(s) && /<title>[^<]+ · Çorumspor Taraftar<\/title>/.test(s) && /<meta name="description" content="[^"]{10,}">/.test(s)
        && /<link rel="icon"/.test(s) && /property="og:title"/.test(s) && /property="og:locale" content="tr_TR"/.test(s), ad);
    }
    kontrol('statik: bütün sayfalarda CSP aynı', cspler.size === 1, [...cspler].join(' || '));
    // UI kodunda da kulüp sloganı / taraftar grubu adı yok
    const ui = ['assets/ortak.js', 'assets/yorumlar.js', ...fs.readdirSync(path.join(KOK, 'assets/sayfa')).map((d) => 'assets/sayfa/' + d)].map((f) => fs.readFileSync(path.join(KOK, f), 'utf8')).join('\n');
    kontrol('statik (013): arayüz kodunda "Biz Anadoluyuz" / "Kırmızı Şimşekler" / "ÇFK" yok', !/Biz Anadoluyuz|Kırmızı Şimşekler|'ÇFK'/.test(ui));
    // Fotoğraf atfı: assets/img'deki her fotoğrafın kaydı (assets/foto-kaynaklari.js) var ve kaynaklar.html'de listeli
    const FK = await import(require('url').pathToFileURL(path.join(KOK, 'assets/foto-kaynaklari.js')).href);
    const fotolar = fs.readdirSync(path.join(KOK, 'assets/img')).filter((d) => /\.(webp|jpe?g|png)$/.test(d) && d !== 'og-1200x630.png');
    const kaynaklar = fs.readFileSync(path.join(KOK, 'kaynaklar.html'), 'utf8');
    const eksik = fotolar.filter((d) => { const k = FK.fotoKaynagi('assets/img/' + d); return !k || !k.yazar || !k.lisans || !/^https:\/\/commons\.wikimedia\.org\//.test(k.kaynak) || !kaynaklar.includes(k.kaynak) || !kaynaklar.includes(k.lisans_url); });
    kontrol(`statik (013): assets/img'deki ${fotolar.length} fotoğrafın hepsinin atfı var (yazar, lisans, kaynak; kaynaklar.html'de)`, fotolar.length >= 20 && !eksik.length, eksik.join(', '));
    kontrol('statik (013): stadyum inşaat fotoğrafı sitede yok (hero olarak kullanılmaz)', !fotolar.some((d) => /insaat/.test(d)));
    const kira = fs.readFileSync(path.join(KOK, 'assets/img/KAYNAKLAR.txt'), 'utf8');
    kontrol('statik (013): assets/img/KAYNAKLAR.txt CC BY-SA türetilmiş eser notu', /(AYNI|aynı) lisansla/.test(kira) && /CC BY-SA/.test(kira));
    // Ana sayfa: ilk başlık h1 (gizli "Sıradaki maç" h2'si h1'den önce gelmesin)
    const anaHtml = fs.readFileSync(path.join(KOK, 'index.html'), 'utf8');
    const ilkBaslik = (/<main[\s\S]*?<(h[1-6])\b/.exec(anaHtml) || [])[1];
    const hero = (/<img class="hero-gorsel"[^>]*>/.exec(anaHtml) || [''])[0];
    kontrol('statik (013): hero görseli HTML\'de (önyükleme tarayıcısı bulur), fetchpriority=high, srcset/sizes, width/height, alt="", tek "high"',
      /fetchpriority="high"/.test(hero) && /srcset="/.test(hero) && /sizes="100vw"/.test(hero) && /width="1280" height="720"/.test(hero) && / alt=""/.test(hero) && (anaHtml.match(/fetchpriority="high"/g) || []).length === 1, hero);
    const heroDosyalari = [...new Set([...anaHtml.matchAll(/assets\/img\/(corum-saat-kulesi[^ "]+\.webp)/g)].map((m) => m[1]))];
    const enBuyuk = Math.max(...heroDosyalari.map((d) => fs.statSync(path.join(KOK, 'assets/img', d)).size));
    kontrol('statik (013): hero kopyalarının her biri ≤ 60 KB WebP', heroDosyalari.length >= 6 && enBuyuk <= 60 * 1024, `${heroDosyalari.length} dosya, en büyük ${enBuyuk} B`);
    kontrol('statik: index.html ana içerikte ilk başlık h1', ilkBaslik === 'h1', ilkBaslik);
    const giris = fs.readFileSync(path.join(KOK, 'giris.html'), 'utf8');
    kontrol('statik: kayıt formunda aydınlatma metnine bağlantı (e-posta toplanırken)', /<form id="kayit-formu"[\s\S]*href="gizlilik\.html"[\s\S]*<\/form>/.test(giris));
    kontrol('statik (013): sekme paneli <form> değil, div (role=tabpanel); "Şifremi unuttum" ve "Göster" düğmesi var',
      !/<form[^>]*role="tabpanel"/.test(giris) && /<div id="giris-paneli" role="tabpanel"/.test(giris) && /Şifremi unuttum/.test(giris) && (giris.match(/class="hayalet sifre-goster"/g) || []).length === 2);
    const bas = fs.existsSync(path.join(KOK, '_headers')) ? fs.readFileSync(path.join(KOK, '_headers'), 'utf8') : '';
    const hepsi = (/^\/\*\n((?:[ \t]+.+\n?)+)/m.exec(bas) || [])[1] || '';
    kontrol('statik: _headers (Cloudflare Pages) frame-ancestors none + X-Frame-Options DENY + nosniff + Referrer-Policy',
      /Content-Security-Policy:.*frame-ancestors 'none'/.test(hepsi) && /X-Frame-Options: DENY/.test(hepsi) && /X-Content-Type-Options: nosniff/.test(hepsi) && /Referrer-Policy: strict-origin-when-cross-origin/.test(hepsi), hepsi || '(dosya yok)');
    // 013 (performans): önbellek kuralları; aynı başlık çakışan iki kurala düşmesin (Cloudflare değerleri virgülle birleştirir)
    const kurallar = [...bas.matchAll(/^(\/\S*)\n((?:[ \t]+.+\n?)+)/gm)].map((m) => ({ yol: m[1], cc: (/Cache-Control: (.+)/.exec(m[2]) || [])[1] })).filter((k) => k.cc);
    const cc = (yol) => kurallar.filter((k) => new RegExp('^' + k.yol.replace(/[.]/g, '\\.').replace(/:\w+/g, '[^/]+').replace(/\*/g, '.*') + '$').test(yol)).map((k) => k.cc);
    const ornekler = { '/assets/fonts/oswald-700-tr.woff2': /immutable/, '/assets/vendor/supabase-js-2.45.4/supabase.js': /immutable/, '/assets/img/corum-ulu-camii-480.webp': /immutable/, '/assets/stil.css': /max-age=300/, '/assets/sayfa/ana.js': /max-age=300/, '/assets/reklam/reklam.js': /max-age=300/, '/sw.js': /no-cache/ };
    const yanlis = Object.entries(ornekler).filter(([y, d]) => { const l = cc(y); return l.length !== 1 || !d.test(l[0]); }).map(([y]) => `${y}: ${JSON.stringify(cc(y))}`);
    kontrol('statik (013): _headers önbellek kuralları (sürümlü dosya immutable, kod 5 dk, sw.js no-cache) her yola TEK kural', !yanlis.length && !cc('/index.html').length, yanlis.join(' | '));
  });

  // ------------------------------------------------ gizlilik sayfası: taslak notu, koddaki depolama anahtarları birebir yazılı
  await guvenli('gizlilik', async () => {
    const { ctx, p, hatalar } = await baglam({ width: 390, height: 844 });
    await git(p, 'gizlilik.html?sahte=1');
    await p.waitForSelector('#profil-baglanti');
    const ayarMetni = fs.readFileSync(path.join(KOK, 'assets/ayar.js'), 'utf8');
    const eposta = (/ILETISIM_EPOSTA = '([^']+)'/.exec(ayarMetni) || [])[1], sahip = (/SAHIP_ADI = '([^']+)'/.exec(ayarMetni) || [])[1];
    await p.waitForFunction((e) => document.querySelector('#gizlilik [data-ayar="ILETISIM_EPOSTA"]').textContent === e, eposta);
    const gz = await p.evaluate(() => ({ metin: document.querySelector('#gizlilik').textContent, taslak: !!document.querySelector('#taslak-notu'), href: document.querySelector('#gizlilik a[data-ayar="ILETISIM_EPOSTA"]').getAttribute('href'),
      sahip: document.querySelector('#gizlilik [data-ayar="SAHIP_ADI"]').textContent, guncelleme: document.querySelector('#son-guncelleme')?.textContent }));
    kontrol('gizlilik (013): "Taslak" kutusu ve köşeli parantezli yer tutucular yok; küçük "Son güncelleme" satırı var',
      !gz.taslak && !/Taslak|hukukçu|avukat/i.test(gz.metin) && !/\[(Ad Soyad|adres|iletişim|Cloudflare|Central|bağlanan|Yurt|KVKK)/.test(gz.metin) && /^Son güncelleme: \d+ \S+ \d{4}$/.test(gz.guncelleme || ''), JSON.stringify({ taslak: gz.taslak, guncelleme: gz.guncelleme }));
    kontrol('gizlilik (013): veri sorumlusu ve iletişim assets/ayar.js\'ten (SAHIP_ADI, ILETISIM_EPOSTA, mailto)', gz.sahip === sahip && gz.href === 'mailto:' + eposta, JSON.stringify(gz).slice(0, 200));
    kontrol('gizlilik (013): "Çorum FK\'nın resmî uygulaması değildir" sayfada', /Çorum FK'nın resmî uygulaması değildir/.test(gz.metin));
    const govde = await metin(p, '#gizlilik');
    const kod = ['assets/tema.js', 'assets/reklam/reklam-mantik.js', 'assets/onbellek.js'].map((f) => fs.readFileSync(path.join(KOK, f), 'utf8')).join('\n');
    const anahtarlar = [/localStorage\.(?:get|set)Item\('([^']+)'/g, /SEKME_ANAHTARI = '([^']+)'/g].flatMap((d) => [...kod.matchAll(d)].map((m) => m[1]));
    kontrol('gizlilik: koddaki tarayıcı depolama anahtarlarının hepsi sayfada (tema, son-veri-v1, reklam-sekme-kimligi) + service worker önbelleği', anahtarlar.length >= 3 && /Cache Storage/.test(govde) && anahtarlar.every((a) => govde.includes(a)), JSON.stringify([...new Set(anahtarlar)]));
    kontrol('gizlilik: Supabase oturumu (localStorage sb-…-auth-token), çerez yok, üçüncü taraflar (jsDelivr, YouTube) yazılı',
      /sb-\[proje\]-auth-token/.test(govde) && /çerez kullanmaz/.test(govde) && /jsDelivr/.test(govde) && /YouTube/.test(govde) && /KVKK 11\. madde/.test(govde), govde.slice(0, 200));
    const alicilar = await p.$$eval('#gizlilik li > strong:first-child', (l) => l.map((e) => e.textContent));
    kontrol('gizlilik (012): jsDelivr artık bilgi giden hizmetler listesinde değil (supabase-js siteden); "sitenin kendisinden" yazıyor',
      !alicilar.some((x) => /jsDelivr/i.test(x)) && /Supabase kütüphanesi \(supabase-js\) ve yazı tipleri sitenin kendisinden sunulur/.test(govde), JSON.stringify(alicilar));
    const dar = await p.$$eval('.gizlilik-tablo td', (l) => l.map((e) => Math.round(e.getBoundingClientRect().width)));
    kontrol('gizlilik: 390 px telefonda tablo hücreleri okunur genişlikte (harf harf kırılmıyor), yatay taşma yok',
      dar.length >= 12 && Math.min(...dar) >= 250 && (await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)), JSON.stringify(dar));
    kontrol('gizlilik: sayfada JavaScript hatası yok', !hatalar.length, hatalar.join(' | '));
    await ctx.close();
  });

  // ------------------------------------------------ ayar yapılmamışsa (sahte mod yok): uyarı
  await guvenli('ayar', async () => {
    const { ctx, p, hatalar } = await baglam({ width: 390, height: 844 });
    await git(p, 'index.html?sahte=0');
    await p.waitForSelector('.uyari');
    kontrol('ayar: ayar.js doldurulmamışsa Türkçe uyarı gösteriliyor', /assets\/ayar\.js/.test(await metin(p, '.uyari')));
    kontrol('ayar: uyarı sayfasında JavaScript hatası yok', !hatalar.length, hatalar.join(' | '));
    // Supabase yoksa (ayar eksik / CDN açılmadı) hiçbir sayfada "yükleniyor…" yazısı takılı kalmamalı
    for (const s of ['haber.html?id=' + H1, 'mac.html?id=' + M1, 'takim.html', 'goller.html', 'gol.html?id=22222222-0000-4000-8000-000000000001', 'profil.html']) {
      await git(p, s);
      await p.waitForSelector('.uyari');
      const takili = await p.$$eval('.yukleniyor, main .iskelet', (l) => l.filter((e) => e.getClientRects().length && !e.closest('[hidden]')).map((e) => e.className));
      kontrol(`ayar: ${s.split('?')[0]} uyarı veriyor, "yükleniyor" yazısı takılı kalmıyor`, !takili.length, takili.join(' | '));
    }
    await ctx.close();
  });

  // ------------------------------------------------ sunucu hata verirse (ağ kesik): "bulunamadı" değil "yüklenemedi"
  await guvenli('sunucu hatası', async () => {
    const { ctx, p, hatalar } = await baglam({ width: 390, height: 844 });
    // Her sorguda ağ hatası dönen istemci (assets/istemci.js yerine); çıkışta signOut ağ hatası verir
    await ctx.route('**/assets/istemci.js', (r) => r.fulfill({ contentType: 'text/javascript', body: `
      const hata = { message: 'Failed to fetch' };
      const zincir = () => new Proxy(function () {}, { get(t, k) { if (k === 'then') return (ok) => ok({ data: null, error: hata }); return () => zincir(); } });
      export const sahteMod = false, ayarEksik = false;
      export const supabase = { from: () => zincir(), rpc: () => Promise.resolve({ data: null, error: hata }), storage: { from: () => zincir() },
        auth: { getSession: async () => ({ data: { session: null } }), signOut: async (o) => { const l = JSON.parse(sessionStorage.getItem('__cikis') || '[]'); l.push((o && o.scope) || 'global'); sessionStorage.setItem('__cikis', JSON.stringify(l)); return { error: o && o.scope === 'local' ? null : hata }; } } };` }));
    await git(p, 'haber.html?id=' + H1);
    await p.waitForSelector('#haber .kutu h1');
    const hm = await metin(p, '#haber');
    kontrol('sunucu hatası: haber sayfası "yüklenemedi" diyor, "bulunamadı" demiyor', /yüklenemedi/.test(hm) && !/bulunamadı/i.test(hm), hm);
    await git(p, 'mac.html?id=' + M1);
    await p.waitForSelector('#mac .kutu h1');
    const mm = await metin(p, '#mac');
    kontrol('sunucu hatası: maç sayfası "yüklenemedi" diyor, "bulunamadı" demiyor', /yüklenemedi/.test(mm) && !/bulunamadı/i.test(mm), mm);
    // Çıkış: sunucuya ulaşılamasa da bu tarayıcıdaki oturum silinir (signOut scope local), sonra ana sayfaya gider
    await Promise.all([p.waitForURL(/index\.html/), p.evaluate(() => import('/assets/ortak.js').then((m) => m.cikisYap()))]);
    const cikis = await p.evaluate(() => JSON.parse(sessionStorage.getItem('__cikis') || 'null'));
    kontrol('çıkış: sunucu hata verse de yerel oturum silinir (signOut local)', Array.isArray(cikis) && cikis.includes('local'), JSON.stringify(cikis));
    kontrol('sunucu hatası sayfalarında JavaScript hatası yok', !hatalar.length, hatalar.join(' | '));
    await ctx.close();
  });

  // ------------------------------------------------ çok veri: en yeni yorumlar ve maçlar kesilmemeli; maç başlığı okunur
  await guvenli('çok veri', async () => {
    const { ctx, p, hatalar } = await baglam({ width: 390, height: 844 });
    await git(p, 'index.html?sahte=1');
    await p.waitForSelector(AKIS);
    await p.evaluate((M1) => {
      const db = JSON.parse(localStorage.getItem('sahte-db-v1'));
      const t0 = Date.now() - 3 * 864e5;
      for (let i = 1; i <= 230; i++) {
        db.yorumlar.push({ id: `55555555-0000-4000-8000-${String(i).padStart(12, '0')}`, kullanici_id: 'bbbbbbbb-0000-4000-8000-000000000001', haber_id: null, mac_id: M1,
          metin: 'Toplu yorum ' + i, gizli: false, created_at: new Date(t0 + i * 60000).toISOString(), duzenlendi: null });
      }
      for (let i = 1; i <= 310; i++) {
        db.maclar.push({ id: `66666666-0000-4000-8000-${String(i).padStart(12, '0')}`, rakip: 'Eski Sezon ' + i, tarih: new Date(Date.UTC(2000, 0, 1) + i * 864e5).toISOString(),
          stadyum: null, ic_saha: true, organizasyon: null, corum_skor: 1, rakip_skor: 0, durum: 'bitti', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      }
      localStorage.setItem('sahte-db-v1', JSON.stringify(db));
    }, M1);
    await git(p, 'mac.html?id=' + M1);
    await p.waitForSelector('#yorum-listesi .yorum');
    const y = await p.$$eval('#yorum-listesi .yorum .yorum-metni', (l) => l.map((x) => x.textContent));
    kontrol('çok yorum: en yeni yorum (231.) listede, eskiden yeniye sıralı', y[y.length - 1] === 'Toplu yorum 230' && y.length <= 200 && y.indexOf('Toplu yorum 229') === y.length - 2, `${y.length} yorum, son: ${y[y.length - 1]}`);
    kontrol('çok yorum: "son 200 yorum" notu görünüyor', /son 200 yorum/i.test(await metin(p, '.yorumlar')), await metin(p, '.yorumlar'));
    kontrol('maç başlığı: ekran okuyucu için takım adları ve skor boşlukla ayrılıyor', (await metin(p, '#mac-basi h1')) === 'Çorum FK 2 - 1 Örnekköy Spor', await metin(p, '#mac-basi h1'));
    await git(p, 'takim.html#fikstur');
    await p.waitForSelector('#sonuclar .fikstur-satir');
    const ilk = await metin(p, '#sonuclar .fikstur-satir');
    const fik = await p.$$eval('#gelecek .fikstur-satir', (l) => l.length);
    kontrol('çok maç (315): en yeni sonuç en üstte, fikstür kaybolmuyor', /Kurgu Gençlik/.test(ilk) && fik === 2, `${ilk} | fikstür ${fik}`);
    kontrol('çok veri sayfalarında JavaScript hatası yok', !hatalar.length, hatalar.join(' | '));
    await ctx.close();
  });

  const girisYap = async (p, eposta, donus = 'index.html') => {
    await git(p, 'giris.html?sahte=1&donus=' + encodeURIComponent(donus));
    await p.fill('#g-eposta', eposta);
    await p.fill('#g-sifre', 'sifre1234');
    await Promise.all([p.waitForURL(new RegExp(donus.split('?')[0].replace('.', '\\.'))), p.click('#g-gonder')]);
  };
  const yorumGonder = async (p, metinDegeri) => {
    await p.fill('#yorum-metni', metinDegeri);
    await p.click('#yorum-formu button[type=submit]');
    await p.waitForFunction(() => document.querySelector('#yorum-formu button[type=submit]').getAttribute('aria-disabled') !== 'true');
    await p.waitForTimeout(30);
    return metin(p, '#yorum-mesaj');
  };

  // ------------------------------------------------ 012: yorum spamı (e-posta onayı, günde 50, aynı metin, düzenleme sınırı)
  await guvenli('yorum spamı', async () => {
    const { ctx, p, hatalar } = await baglam({ width: 390, height: 844 });
    // e-postasını onaylamamış hesap (ör. "Confirm email" açılmadan önce açılmış ya da anonim oturum): form yerine not
    await girisYap(p, 'onaysiz@ornek.test', 'haber.html?id=' + H1);
    await p.waitForSelector('#yorum-onay-notu');
    kontrol('yorum (012): onaysız hesapta form yok, "e-posta adresini onayla" notu var',
      !(await p.$('#yorum-formu')) && /e-posta adresini onayla/.test(await metin(p, '#yorum-onay-notu')), await metin(p, '.yorumlar'));
    const dogrudan = await p.evaluate(async (H1) => {
      const { supabase } = await import('/assets/istemci.js');
      const r = await supabase.from('yorumlar').insert({ haber_id: H1, metin: 'formu atlayan yorum' });
      return r.error && r.error.message;
    }, H1);
    kontrol('yorum (012): onaysız hesap formu atlasa da sunucu (sahte) reddeder, Türkçe', /e-posta adresinizi onaylayın/.test(dogrudan || ''), dogrudan);
    await cikis(p);

    await girisYap(p, 'taraftar@ornek.test', 'haber.html?id=' + H2);
    await p.waitForSelector('#yorum-formu');
    kontrol('yorum (012): ilk yorum gönderildi ("Yorumun tribüne düştü")', /tribüne düştü/.test(await yorumGonder(p, 'Kırmızı Şimşekler sahada!')));
    const tekrar = await yorumGonder(p, '  kırmızı şimşekler   sahada!  ');
    kontrol('yorum (012): aynı metin 10 dakika içinde tekrar gönderilemez, Türkçe mesaj', /Aynı metni 10 dakika/.test(tekrar), tekrar);
    // son 24 saatte 50 yorum (eski tarihli, farklı metinler)
    await p.evaluate(() => {
      const db = JSON.parse(localStorage.getItem('sahte-db-v1'));
      const t0 = Date.now() - 20 * 3600e3;
      for (let i = 1; i <= 49; i++) {
        db.yorumlar.push({ id: `77777777-0000-4000-8000-${String(i).padStart(12, '0')}`, kullanici_id: 'bbbbbbbb-0000-4000-8000-000000000001', haber_id: null, mac_id: '11111111-0000-4000-8000-000000000003',
          metin: 'Eski yorum ' + i, gizli: false, created_at: new Date(t0 + i * 60000).toISOString(), duzenlendi: null });
      }
      localStorage.setItem('sahte-db-v1', JSON.stringify(db));
    });
    const gunluk = await yorumGonder(p, 'Elli birinci yorum');
    kontrol('yorum (012): günde 50 yorumdan sonra Türkçe sınır mesajı', /günde en fazla 50/.test(gunluk), gunluk);
    // düzenleme: 30 dakikadan eski yorumda "Düzenle" yok (sunucu da reddeder); dakikada en fazla 10 düzenleme
    await p.evaluate(() => {
      const db = JSON.parse(localStorage.getItem('sahte-db-v1'));
      db.yorumlar.push({ id: '77777777-1111-4000-8000-000000000001', kullanici_id: 'bbbbbbbb-0000-4000-8000-000000000001', haber_id: '33333333-0000-4000-8000-000000000002', mac_id: null,
        metin: 'Kırk dakika önceki yorum', gizli: false, created_at: new Date(Date.now() - 40 * 60000).toISOString(), duzenlendi: null });
      localStorage.setItem('sahte-db-v1', JSON.stringify(db));
    });
    await git(p, 'haber.html?id=' + H2);
    await p.waitForSelector('#yorum-listesi .yorum');
    const eski = p.locator('#yorum-listesi .yorum', { hasText: 'Kırk dakika önceki yorum' });
    kontrol('yorum (012): 30 dakikadan eski yorumda "Düzenle" yok, "Sil" var',
      (await eski.getByRole('button', { name: 'Düzenle' }).count()) === 0 && (await eski.getByRole('button', { name: 'Sil' }).count()) === 1);
    const geç = await p.evaluate(async () => {
      const { supabase } = await import('/assets/istemci.js');
      const r = await supabase.from('yorumlar').update({ metin: 'geç düzeltme' }).eq('id', '77777777-1111-4000-8000-000000000001');
      return r.error && r.error.message;
    });
    kontrol('yorum (012): 30 dakikadan eski yorum düzenlenemez (sunucu/sahte), Türkçe', /30 dakika/.test(geç || ''), geç);
    const taze = p.locator('#yorum-listesi .yorum', { hasText: 'Kırmızı Şimşekler sahada!' });
    const tazeId = await taze.getAttribute('data-yorum-id');
    const sonuclar = await p.evaluate(async (id) => {
      const { supabase } = await import('/assets/istemci.js');
      const l = [];
      for (let i = 1; i <= 10; i++) { const r = await supabase.from('yorumlar').update({ metin: 'Kırmızı Şimşekler sahada! (' + i + ')' }).eq('id', id); l.push(r.error ? r.error.message : 'tamam'); }
      return l;
    }, tazeId);
    kontrol('yorum (012): dakikada 10 düzenleme kabul edilir', sonuclar.every((x) => x === 'tamam'), JSON.stringify(sonuclar));
    await git(p, 'haber.html?id=' + H2);
    const yeniTaze = p.locator(`#yorum-listesi .yorum[data-yorum-id="${tazeId}"]`);
    await yeniTaze.getByRole('button', { name: 'Düzenle' }).click();
    await yeniTaze.locator('textarea').fill('On birinci düzenleme');
    await yeniTaze.getByRole('button', { name: 'Kaydet' }).click();
    await p.waitForSelector('#yorum-mesaj:not([hidden])');
    const duzMesaj = await metin(p, '#yorum-mesaj');
    kontrol('yorum (012): 11. düzenleme Türkçe mesajla reddedilir (arayüzde görünür)', /dakikada en fazla 10/.test(duzMesaj), duzMesaj);
    kontrol('yorum spamı sayfalarında JavaScript hatası yok', !hatalar.length, hatalar.join(' | '));
    await ctx.close();
  });

  // ------------------------------------------------ 012: kayıt, ayrılmış kullanıcı adı, e-posta onayı mesajı
  await guvenli('kayıt (012)', async () => {
    const { ctx, p, hatalar } = await baglam({ width: 390, height: 844 });
    await git(p, 'giris.html?sahte=1#kayit');
    for (const ad of ['Yönetim', 'CorumFK_Resmi', 'admin', 'kulüp.destek']) {
      await p.fill('#k-ad', ad);
      await p.fill('#k-eposta', 'sinsi@ornek.test');
      await p.fill('#k-sifre', 'uzunsifre123');
      await p.click('#k-gonder');
      await p.waitForFunction(() => document.querySelector('#k-ad-hata').textContent !== '');
      const m = await metin(p, '#k-ad-hata');
      kontrol(`kayıt (012): "${ad}" ayrılmış ad, alanın altında Türkçe hata, hesap açılmadı`, /kullanılamaz/.test(m) && p.url().includes('giris.html') && (await p.getAttribute('#k-ad', 'aria-invalid')) === 'true', m);
    }
    // "Confirm email" açık (önerilen): kayıttan sonra oturum yok, onay e-postası mesajı; onaylamadan giriş Türkçe hata
    await p.evaluate(() => localStorage.setItem('sahte_eposta_onayi', 'gerekli'));
    await p.fill('#k-ad', 'onay_bekleyen');
    await p.fill('#k-eposta', 'onay@ornek.test');
    await p.fill('#k-sifre', 'uzunsifre123');
    await p.click('#k-gonder');
    await p.waitForSelector('#hosgeldin:not([hidden])');
    const km = await metin(p, '#hosgeldin');
    kontrol('kayıt (012/013): "Hoş geldin" + onay e-postası açıklaması, yorum için onay gerektiği yazıyor', /Hoş geldin onay_bekleyen!/.test(km) && /onay bağlantısı gönderdik/.test(km) && /Yorum yazmak için e-posta onayı gerekir/.test(km), km);
    await Promise.all([p.waitForURL(/giris\.html/), p.click('#hosgeldin-devam')]);
    await p.waitForSelector('#g-eposta');
    await p.fill('#g-eposta', 'onay@ornek.test');
    await p.fill('#g-sifre', 'uzunsifre123');
    await p.click('#g-gonder');
    await p.waitForFunction(() => /onaylamadın/.test(document.querySelector('#giris-mesaj').textContent));
    kontrol('giriş (012): onaylanmamış e-postayla giriş Türkçe hata', /henüz onaylamadın/.test(await metin(p, '#giris-mesaj')));
    kontrol('kayıt (012) sayfasında JavaScript hatası yok', !hatalar.length, hatalar.join(' | '));
    await ctx.close();
  });

  // ------------------------------------------------ 012: profillerde rol gizli; rol yalnız benim_profilim() ile
  await guvenli('profil gizliliği', async () => {
    const { ctx, p, hatalar } = await baglam({ width: 1280, height: 860 });
    await git(p, 'index.html?sahte=1');
    await p.waitForSelector(AKIS);
    const anon = await p.evaluate(async () => {
      const { supabase } = await import('/assets/istemci.js');
      const rol = await supabase.from('profiles').select('id, role');
      const yildiz = await supabase.from('profiles').select('*');
      const ad = await supabase.from('profiles').select('id, kullanici_adi, created_at');
      const gomme = await supabase.from('yorumlar').select('id, profiles(kullanici_adi)').limit(1);
      const benim = await supabase.rpc('benim_profilim');
      return { rol: rol.error && rol.error.code, yildiz: yildiz.error && yildiz.error.code, ad: ad.data && ad.data.length, adAlanlar: ad.data && Object.keys(ad.data[0]).sort().join(','),
        gomme: gomme.data && gomme.data[0] && Object.keys(gomme.data[0].profiles || {}).join(','), benim: benim.data };
    });
    kontrol('profil (012): ziyaretçi role sütununu okuyamaz (select role da select * da 42501)', anon.rol === '42501' && anon.yildiz === '42501', JSON.stringify(anon));
    kontrol('profil (012): ziyaretçi yalnız id, kullanici_adi, created_at okur; yorumlarda ad gömülür', anon.ad >= 3 && anon.adAlanlar === 'created_at,id,kullanici_adi' && anon.gomme === 'kullanici_adi', JSON.stringify(anon));
    kontrol('profil (012): oturumsuz benim_profilim() boş', Array.isArray(anon.benim) && anon.benim.length === 0, JSON.stringify(anon.benim));
    await girisYap(p, 'yonetici@ornek.test', 'yonetim.html');
    await p.waitForSelector('#panel:not([hidden])');
    kontrol('profil (012): yönetici rolünü benim_profilim() ile alıyor, panel açılıyor', await p.isVisible('#panel'));
    await git(p, 'profil.html');
    await p.waitForSelector('#profil[data-durum="tamam"]');
    kontrol('profil (013): yöneticiye Profil\'de "Yönetim paneli" bağlantısı', await p.isVisible('#yonetim-baglanti') && (await p.getAttribute('#yonetim-baglanti', 'href')) === 'yonetim.html');
    await git(p, 'yonetim.html');
    await p.waitForSelector('#panel:not([hidden])');
    const yon = await p.evaluate(async () => {
      const { supabase } = await import('/assets/istemci.js');
      const b = await supabase.rpc('benim_profilim').maybeSingle();
      const rol = await supabase.from('profiles').select('role');
      return { benim: b.data, rol: rol.error && rol.error.code };
    });
    kontrol('profil (012): benim_profilim() yalnız kendi satırı (rol admin); yönetici de role sütununu doğrudan okuyamaz', yon.benim && yon.benim.role === 'admin' && yon.rol === '42501', JSON.stringify(yon));
    const ad = await p.evaluate(async () => {
      const { supabase } = await import('/assets/istemci.js');
      const { data: { session } } = await supabase.auth.getSession();
      const r = await supabase.from('profiles').update({ kullanici_adi: 'Resmi_Hesap' }).eq('id', session.user.id);
      return r.error && r.error.message;
    });
    kontrol('profil (012): ayrılmış ada yeniden adlandırma reddedilir (Türkçe)', /kullanılamaz/.test(ad || ''), ad);
    kontrol('profil gizliliği sayfalarında JavaScript hatası yok', !hatalar.length, hatalar.join(' | '));
    await ctx.close();
  });

  // ------------------------------------------------ 012: haber kapağı yalnız proje deposundan; görseller yüklemeden önce küçülür
  await guvenli('görsel küçültme', async () => {
    const { ctx, p, hatalar } = await baglam({ width: 1280, height: 860 });
    await girisYap(p, 'yonetici@ornek.test', 'yonetim.html');
    await p.waitForSelector('#haber-listesi li');
    // Büyük bir fotoğraf (3200×2400, bir bölümü gürültü: PNG > 3 MB, yani küçültülmeden yüklenemezdi)
    const buyuk = async (gen, yuk, gurultu) => Buffer.from(await p.evaluate(([gen, yuk, gurultu]) => {
      const c = document.createElement('canvas'); c.width = gen; c.height = yuk;
      const x = c.getContext('2d');
      const g = x.createLinearGradient(0, 0, gen, yuk); g.addColorStop(0, '#CC0000'); g.addColorStop(1, '#0B0B0B');
      x.fillStyle = g; x.fillRect(0, 0, gen, yuk);
      if (gurultu) { const v = x.createImageData(gurultu[0], gurultu[1]); for (let i = 0; i < v.data.length; i++) v.data[i] = (Math.random() * 256) | 0; x.putImageData(v, 0, 0); }
      return c.toDataURL('image/png').split(',')[1];
    }, [gen, yuk, gurultu]), 'base64');
    const kapak = await buyuk(3200, 2400, [1100, 1000]);
    kontrol('görsel (012): deneme fotoğrafı büyük (PNG > 3 MB, 3200×2400)', kapak.length > 3 * 1024 * 1024, kapak.length);
    await p.fill('#h-baslik', 'Büyük kapaklı haber');
    await p.setInputFiles('#h-kapak', { name: 'telefon-fotografi.png', mimeType: 'image/png', buffer: kapak });
    await p.check('#h-yayinda');
    await p.click('#h-kaydet');
    await p.waitForFunction(() => /Haber eklendi/.test(document.querySelector('#panel-mesaj').textContent), null, { timeout: 15000 });
    const kayit = await p.evaluate(async () => {
      const db = JSON.parse(localStorage.getItem('sahte-db-v1'));
      const h = db.haberler.find((x) => x.baslik === 'Büyük kapaklı haber');
      const yol = h.kapak_url.split('/storage/v1/object/public/')[1];
      const veri = localStorage.getItem('sahte-depo-v1:' + yol) || '';
      const img = new Image(); img.src = veri; await img.decode().catch(() => {});
      return { url: h.kapak_url, tur: (/^data:([^;]+)/.exec(veri) || [])[1], bayt: Math.round((veri.length - veri.indexOf(',') - 1) * 3 / 4), w: img.naturalWidth, h: img.naturalHeight };
    });
    kontrol('görsel (012): haber kapağı yüklemeden önce küçültüldü (uzun kenar 1600 px, en-boy oranı korundu)', kayit.w === 1600 && kayit.h === 1200, JSON.stringify(kayit));
    kontrol('görsel (012): kapak WebP olarak, 3 MB sınırının altında yüklendi', kayit.tur === 'image/webp' && /\.webp$/.test(kayit.url) && kayit.bayt < 3 * 1024 * 1024, JSON.stringify(kayit));
    // Kapak kuralı: başka sitedeki adres kaydedilemez (sahte istemci SQL kısıtının aynası) ve sayfada hiç istenmez
    const dis = await p.evaluate(async () => {
      const { supabase } = await import('/assets/istemci.js');
      const r = await supabase.from('haberler').insert({ baslik: 'Dış kapak denemesi', kapak_url: 'https://baska-site.com/piksel.jpg', yayinda: true });
      return r.error && r.error.message;
    });
    kontrol('kapak (012): başka sitedeki kapak adresi reddedilir (haberler_kapak_kaynagi)', /haberler_kapak_kaynagi/.test(dis || ''), dis);
    await p.evaluate(() => {
      const db = JSON.parse(localStorage.getItem('sahte-db-v1'));
      db.haberler.push({ id: '33333333-0000-4000-8000-0000000000ee', baslik: 'Eski dış kapaklı haber', ozet: null, govde: 'x', kapak_url: 'https://baska-site.com/piksel.jpg', yayinda: true,
        yayin_tarihi: new Date().toISOString(), yazar_id: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      localStorage.setItem('sahte-db-v1', JSON.stringify(db));
    });
    const disIstek = [];
    p.on('request', (r) => { if (/baska-site\.com/.test(r.url())) disIstek.push(r.url()); });
    await git(p, 'index.html');
    await p.waitForSelector(AKIS);
    const eskiKart = p.locator('#akis .haber-satir', { hasText: 'Eski dış kapaklı haber' });
    kontrol('kapak (012): eski kayıttaki dış kapak gösterilmez (istek de gitmez)', (await eskiKart.locator('img').count()) === 0 && !disIstek.length, JSON.stringify(disIstek));
    // Reklam görseli: 2400×1256 → en fazla 1200 px genişlik, WebP
    await git(p, 'yonetim.html#reklamlar');
    await p.waitForSelector('#reklamlar-sekmesi #ry-yeni');
    await p.click('#ry-yeni');
    const reklam = await buyuk(2400, 1256, [600, 600]);
    await p.setInputFiles('#ry-gorsel', { name: 'afis.png', mimeType: 'image/png', buffer: reklam });
    await p.waitForFunction(() => document.querySelector('#ry-gorsel-durum')?.textContent === 'Görsel yüklendi.', null, { timeout: 15000 });
    const rk = await p.evaluate(async () => {
      const url = document.querySelector('#ry-gorsel_url').value;
      const veri = localStorage.getItem('sahte-depo-v1:' + url.split('/storage/v1/object/public/')[1]) || '';
      const img = new Image(); img.src = veri; await img.decode().catch(() => {});
      return { url, tur: (/^data:([^;]+)/.exec(veri) || [])[1], w: img.naturalWidth, h: img.naturalHeight };
    });
    kontrol('görsel (012): reklam görseli yüklemeden önce 1200 px genişliğe küçültüldü, WebP', rk.w === 1200 && rk.h === 628 && rk.tur === 'image/webp' && /\.webp$/.test(rk.url), JSON.stringify(rk));
    kontrol('görsel küçültme sayfalarında JavaScript hatası yok', !hatalar.length, hatalar.join(' | '));
    await ctx.close();
  });

  // ------------------------------------------------ 012: sekmeler WAI-ARIA (ok tuşları, Home/End, roving tabindex), görünür odak, başlık sırası
  await guvenli('erişilebilirlik (012)', async () => {
    const { ctx, p, hatalar } = await baglam({ width: 1280, height: 860 });
    await git(p, 'index.html?sahte=1');
    await p.waitForSelector(AKIS);
    const basliklar = await p.$$eval('main h1, main h2, main h3', (l) => l.map((e) => e.tagName));
    kontrol('ana (012): sayfadaki ilk başlık h1, tek h1', basliklar[0] === 'H1' && basliklar.filter((x) => x === 'H1').length === 1, basliklar.join(','));
    const sekmeDurumu = (kok) => p.evaluate((kok) => [...document.querySelectorAll(kok + ' [role=tab]')].map((t) => ({
      id: t.id, secili: t.getAttribute('aria-selected'), tab: t.tabIndex, panel: t.getAttribute('aria-controls'),
      panelGorunur: !!document.getElementById(t.getAttribute('aria-controls')) && !document.getElementById(t.getAttribute('aria-controls')).hidden,
      panelRol: document.getElementById(t.getAttribute('aria-controls'))?.getAttribute('role'),
      panelEtiket: document.getElementById(t.getAttribute('aria-controls'))?.getAttribute('aria-labelledby'),
    })), kok);
    const odakta = () => p.evaluate(() => document.activeElement && document.activeElement.id);
    const odakHalkasi = () => p.evaluate(() => { const c = getComputedStyle(document.activeElement); return { stil: c.outlineStyle, kalinlik: parseFloat(c.outlineWidth) }; });
    const sekmeDeseni = async (ad, kok, ilk) => {
      const d0 = await sekmeDurumu(kok);
      kontrol(`${ad}: tablist/tab/tabpanel ilişkisi (aria-controls ↔ aria-labelledby), seçili sekme tabindex 0, diğerleri -1`,
        d0.length >= 2 && d0.every((t) => t.panelRol === 'tabpanel' && t.panelEtiket === t.id && t.tab === (t.secili === 'true' ? 0 : -1)) && d0.filter((t) => t.secili === 'true').length === 1
        && (await p.$eval(kok, (t) => t.getAttribute('role') + '|' + !!t.getAttribute('aria-label'))) === 'tablist|true', JSON.stringify(d0));
      await p.focus('#' + ilk);
      await p.keyboard.press('ArrowRight');
      const d1 = await sekmeDurumu(kok);
      kontrol(`${ad}: → sonraki sekmeye geçer, onu seçer ve panelini açar`, (await odakta()) === d0[1].id && d1[1].secili === 'true' && d1[1].tab === 0 && d1[0].tab === -1 && d1[1].panelGorunur && !d1[0].panelGorunur, JSON.stringify(d1));
      const halka = await odakHalkasi();
      kontrol(`${ad}: klavyeyle odaklanan sekmede görünür odak halkası (≥2 px)`, halka.stil !== 'none' && halka.kalinlik >= 2, JSON.stringify(halka));
      await p.keyboard.press('End');
      const son = d0[d0.length - 1].id;
      kontrol(`${ad}: End son sekmeye gider`, (await odakta()) === son && (await sekmeDurumu(kok)).slice(-1)[0].secili === 'true');
      await p.keyboard.press('ArrowRight');
      kontrol(`${ad}: sondan → başa döner`, (await odakta()) === d0[0].id);
      await p.keyboard.press('ArrowLeft');
      kontrol(`${ad}: baştan ← sona döner`, (await odakta()) === son);
      await p.keyboard.press('Home');
      const dh = await sekmeDurumu(kok);
      kontrol(`${ad}: Home ilk sekmeye gider ve seçer`, (await odakta()) === d0[0].id && dh[0].secili === 'true' && dh[0].panelGorunur);
    };
    await git(p, 'giris.html');
    await p.waitForSelector('#sekme-giris');
    await sekmeDeseni('giriş sekmeleri (012)', '#formlar .sekme-dugmeleri', 'sekme-giris');
    await git(p, 'takim.html');
    await p.waitForSelector('#kadro-icerik[data-durum="tamam"]');
    await sekmeDeseni('Takım sekmeleri (013)', '.sekme-iz', 'sekme-kadro');
    await girisYap(p, 'yonetici@ornek.test', 'yonetim.html');
    await p.waitForSelector('#panel:not([hidden])');
    await sekmeDeseni('yönetim sekmeleri (012)', '#panel .yonetim-sekmeler', 'sekme-haberler');
    await p.click('#sekme-reklamlar');
    await p.waitForSelector('#reklamlar-sekmesi #ry-yeni');
    await sekmeDeseni('reklam modülü sekmeleri (012)', '#reklamlar-sekmesi .ry-sekmeler', 'ry-sekme-reklamlar');
    kontrol('erişilebilirlik (012) sayfalarında JavaScript hatası yok', !hatalar.length, hatalar.join(' | '));
    await ctx.close();
  });

  // ------------------------------------------------ 012: performans (ilk kapak hemen, diğerleri tembel; boyut öznitelikleri; WebP reklam)
  await guvenli('performans (012)', async () => {
    const { ctx, p, hatalar } = await baglam({ width: 390, height: 844 });
    await git(p, 'index.html?sahte=1');
    await p.waitForSelector('#akis[data-durum="tamam"] .haber-satir img');
    const resimler = await p.$$eval('#akis .haber-satir img.kucuk-kapak', (l) => l.map((i) => ({ yukleme: i.getAttribute('loading'), oncelik: i.getAttribute('fetchpriority'), w: i.getAttribute('width'), h: i.getAttribute('height'), srcset: i.getAttribute('srcset') })));
    const yuksek = await p.$$eval('img[fetchpriority="high"]', (l) => l.map((i) => i.id));
    kontrol('performans (013): sayfada TEK fetchpriority=high görsel: hero (HTML\'de, LCP)', JSON.stringify(yuksek) === '["hero-gorsel"]', JSON.stringify(yuksek));
    kontrol('performans (012/013): akış küçük kapakları tembel (lazy), öncelik yok, srcset ile 480 px', resimler.length >= 2 && resimler.every((r) => r.yukleme === 'lazy' && !r.oncelik && /-480\.webp 480w/.test(r.srcset || '')), JSON.stringify(resimler));
    kontrol('performans (012/013): küçük kapaklarda width/height (96×72) var: kayma olmaz', resimler.every((r) => r.w === '96' && r.h === '72'), JSON.stringify(resimler));
    await git(p, 'haber.html?id=' + H1);
    await p.waitForSelector('#makale img.kapak-buyuk');
    const hk = await p.$eval('#makale img.kapak-buyuk', (i) => ({ w: i.getAttribute('width'), h: i.getAttribute('height'), o: i.getAttribute('fetchpriority') }));
    kontrol('performans (012): haber sayfası kapağı width/height + fetchpriority=high', Number(hk.w) > 0 && Number(hk.h) > 0 && hk.o === 'high', JSON.stringify(hk));
    for (const ad of ['narcil-1200x628', 'narcil-600x600']) {
      const d = await p.evaluate(async (ad) => {
        const yukle = (s) => new Promise((ok) => { const i = new Image(); i.onload = () => ok({ w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => ok(null); i.src = s; });
        const [w, pn] = await Promise.all([fetch(`docs/ilk-reklam/${ad}.webp`), fetch(`docs/ilk-reklam/${ad}.png`)]);
        return { webp: w.ok && w.headers.get('content-type'), bayt: w.ok ? (await w.arrayBuffer()).byteLength : 0, png: pn.ok ? (await pn.arrayBuffer()).byteLength : 0, boyut: await yukle(`docs/ilk-reklam/${ad}.webp`) };
      }, ad);
      const [gen, yuk] = ad.split('-')[1].split('x').map(Number);
      kontrol(`performans (012): ${ad}.webp var, PNG'den küçük, ölçüsü aynı (PNG kopyası duruyor)`, d.webp === 'image/webp' && d.png > 0 && d.bayt > 0 && d.bayt < d.png && d.boyut && d.boyut.w === gen && d.boyut.h === yuk, JSON.stringify(d));
    }
    kontrol('performans (012) sayfalarında JavaScript hatası yok', !hatalar.length, hatalar.join(' | '));
    await ctx.close();
  });

  await tarayici.close();
  sunucu.close();
  return { gecen, kalan };
}

module.exports = { tarayiciTestleri, sunucuAc, ornekReklamGorseli, gorselTuru };

if (require.main === module) {
  tarayiciTestleri().then((s) => {
    console.log(JSON.stringify(s, null, 2));
    console.log(`Tarayıcı: ${s.gecen.length} geçti, ${s.kalan.length} kaldı`);
    process.exit(s.kalan.length ? 1 : 0);
  }).catch((e) => { console.error(e); process.exit(1); });
}
