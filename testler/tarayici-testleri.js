// Tarayıcı testleri (Playwright): siteyi küçük bir yerel sunucuyla açar, sahte Supabase ile dener.
// Kullanım: node testler/tarayici-testleri.js   (ya da hepsi için: node testler/calistir.js)
// İnternete çıkmaz: 127.0.0.1 dışındaki bütün istekler (CDN, YouTube, video) engellenir.
const http = require('http'), fs = require('fs'), path = require('path');

const KOK = path.resolve(__dirname, '..');
const EKRAN = path.join(__dirname, 'ekran');
const TUR = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

const H1 = '33333333-0000-4000-8000-000000000001';
const H2 = '33333333-0000-4000-8000-000000000002';
const H8 = '33333333-0000-4000-8000-000000000008';
const M1 = '11111111-0000-4000-8000-000000000001';
// 1x1 kırmızı PNG (kapak yükleme testi)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64');

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
    const p = await ctx.newPage();
    p.setDefaultTimeout(8000);
    const hatalar = [];
    p.on('pageerror', (e) => hatalar.push(e.message));
    p.on('dialog', (d) => d.accept());
    return { ctx, p, hatalar };
  }
  const git = async (p, s) => { await p.goto(ADRES + '/' + s); await p.waitForLoadState('networkidle').catch(() => {}); };
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
    await p.waitForSelector('#akis .haber-karti');
    const kartlar = await p.$$eval('#akis .haber-karti h3', (l) => l.map((x) => x.textContent));
    kontrol(c('ana: ilk sayfada 6 haber'), kartlar.length === 6, kartlar.length);
    kontrol(c('ana: en yeni haber en üstte'), kartlar[0] === 'Test haberi 1: Sahada üç puan', kartlar[0]);
    kontrol(c('ana: taslak haber görünmüyor'), !kartlar.some((k) => /Taslak/.test(k)));
    const yuva = await p.evaluate(() => {
      const l = document.querySelectorAll('#akis .reklam-yuvasi[data-reklam-alan="ana_akis"]');
      const y = l[0];
      if (!y) return { adet: 0 };
      let once = 0; let x = y.previousElementSibling;
      while (x) { if (x.classList.contains('haber-karti')) once++; x = x.previousElementSibling; }
      const st = getComputedStyle(y);
      return { adet: l.length, once, yukseklik: y.getBoundingClientRect().height, cocuk: y.childNodes.length, durum: y.dataset.reklamDurum, dolgu: st.paddingTop + st.borderTopWidth };
    });
    kontrol(c('ana: tek bir ana_akis reklam yuvası var'), yuva.adet === 1, JSON.stringify(yuva));
    kontrol(c('ana: reklam yuvası 3. haberden sonra'), yuva.once === 3, JSON.stringify(yuva));
    kontrol(c('ana: yayında reklam yokken yuva boş ve yüksekliği 0'), yuva.yukseklik === 0 && yuva.cocuk === 0, JSON.stringify(yuva));
    kontrol(c('ana: reklam modülü yüklendi, reklam yok diye sessiz kaldı'), yuva.durum === 'tamam', yuva.durum);
    const sonraki = await metin(p, '#sonraki-mac');
    kontrol(c('ana: sıradaki maç kartı (Deneme FK)'), /Deneme FK/.test(sonraki) && /Çorum FK/.test(sonraki), sonraki);
    kontrol(c('ana: maç saati Türkiye saatiyle (19:00, tarayıcı New York)'), /19:00/.test(sonraki), sonraki);
    kontrol(c('ana: altbilgide "Resmî Çorum FK uygulaması değildir"'), /Resmî Çorum FK uygulaması değildir/.test(await metin(p, 'footer')));
    kontrol(c('ana: oturum yokken "Giriş yap" görünüyor'), /Giriş yap/.test(await metin(p, '#oturum-alani')));
    await tasmaYok(p, cihaz, 'ana');
    await foto('ana');
    kontrol(c('ana: "Daha fazla" düğmesi görünüyor'), await p.isVisible('#daha-fazla'));
    await p.click('#daha-fazla');
    await p.waitForFunction(() => document.querySelectorAll('#akis .haber-karti').length > 6);
    kontrol(c('ana: "Daha fazla" sonrası 7 haber'), (await p.$$('#akis .haber-karti')).length === 7);
    kontrol(c('ana: son sayfada "Daha fazla" gizlendi'), !(await p.isVisible('#daha-fazla')));
    kontrol(c('ana: sayfalamadan sonra da tek reklam yuvası'), (await p.$$('.reklam-yuvasi[data-reklam-alan="ana_akis"]')).length === 1);

    // ------------------------------------------------ haber ayrıntısı
    await git(p, 'haber.html?id=' + H1);
    await p.waitForSelector('#makale h1');
    kontrol(c('haber: başlık'), (await metin(p, '#makale h1')) === 'Test haberi 1: Sahada üç puan');
    kontrol(c('haber: kapak görseli'), (await p.getAttribute('#makale img.kapak', 'src')) === 'assets/img/ornek-kapak-1.svg');
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
    await p.waitForSelector('#gelecek .mac-satiri');
    const gelecek = await p.$$eval('#gelecek .mac-satiri .eslesme', (l) => l.map((x) => x.textContent));
    const sonuclar = await p.$$eval('#sonuclar .mac-satiri', (l) => l.map((x) => x.textContent));
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
    kontrol(c('maç: YouTube videosu nocookie ile gömülü'), (await p.getAttribute('#gol-listesi iframe', 'src')) === 'https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ');
    await p.waitForSelector('#yorum-listesi .yorum');
    kontrol(c('maç: yorumlar görünüyor'), /Tribünler muhteşemdi/.test(await metin(p, '#yorum-listesi')));
    await tasmaYok(p, cihaz, 'maç');
    await foto('mac');

    // ------------------------------------------------ gol arşivi
    await git(p, 'goller.html');
    await p.waitForSelector('#arsiv .arsiv-mac');
    const arsiv = await p.$$eval('#arsiv .arsiv-mac', (l) => l.map((x) => ({ id: x.dataset.macId, gol: x.querySelectorAll('.gol').length })));
    kontrol(c('goller: sadece golü olan maçlar, yeniden eskiye'), arsiv.length === 2 && arsiv[0].id.endsWith('2') && arsiv[1].id === M1 && arsiv[1].gol === 2, JSON.stringify(arsiv));
    kontrol(c('goller: YouTube gömme (youtube-nocookie)'), /^https:\/\/www\.youtube-nocookie\.com\/embed\/aqz-KE-bpKQ$/.test(await p.getAttribute('#arsiv iframe', 'src') || ''));
    kontrol(c('goller: mp4 video oynatıcı'), (await p.getAttribute('#arsiv video', 'src')) === 'https://ornek.test/videolar/gol-3.mp4');
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
    await p.waitForSelector('#giris-mesaj:not([hidden])');
    kontrol(c('giriş: yanlış şifrede Türkçe hata'), (await metin(p, '#giris-mesaj')) === 'E-posta ya da şifre hatalı.', await metin(p, '#giris-mesaj'));
    await p.fill('#g-sifre', 'sifre1234');
    await Promise.all([p.waitForURL(/haber\.html/), p.click('#g-gonder')]);
    await p.waitForSelector('#yorum-formu');
    kontrol(c('giriş: başarılı giriş dönüş sayfasına götürür'), p.url().includes('haber.html?id=' + H2));
    const ustAlan = await metin(p, '#oturum-alani');
    kontrol(c('giriş: üstte kullanıcı adı, "Yönetim" yok'), /ayse_19/.test(ustAlan) && !/Yönetim/.test(ustAlan), ustAlan);

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
      await p.waitForFunction(() => !document.querySelector('#yorum-formu button[type=submit]').disabled);
      await p.waitForTimeout(30);
    }
    const oranMesaj = await metin(p, '#yorum-mesaj');
    kontrol(c('yorum: dakikada 5 yorumdan sonra sunucu mesajı gösteriliyor'), /Çok hızlı yorum/.test(oranMesaj) && (await p.$$('#yorum-listesi .yorum')).length === 5, oranMesaj);

    await git(p, 'mac.html?id=' + M1);
    await p.waitForSelector('#yorum-listesi .yorum');
    kontrol(c('yorum: başkasının yorumunda düzenle/sil düğmesi yok'), (await p.locator('#yorum-listesi .yorum', { hasText: 'Tribünler' }).locator('button').count()) === 0);

    // ------------------------------------------------ yönetim: taraftar engelli
    await git(p, 'yonetim.html');
    await p.waitForSelector('#yetki-mesaj:not([hidden])');
    kontrol(c('yönetim: taraftar engelleniyor'), !(await p.isVisible('#panel')) && /sadece yöneticiler/.test(await metin(p, '#yetki-mesaj')));

    // ------------------------------------------------ yönetici
    await p.click('#oturum-alani button');
    await p.waitForURL(/index\.html/);
    await git(p, 'giris.html?donus=yonetim.html');
    await p.fill('#g-eposta', 'yonetici@ornek.test');
    await p.fill('#g-sifre', 'sifre1234');
    await Promise.all([p.waitForURL(/yonetim\.html/), p.click('#g-gonder')]);
    await p.waitForSelector('#panel:not([hidden])');
    kontrol(c('yönetim: yönetici paneli görüyor, menüde "Yönetim"'), await p.isVisible('#yonetim-baglanti'));
    const sekmeler = await p.$$eval('[role=tab][data-sekme]', (l) => l.map((x) => x.textContent));
    kontrol(c('yönetim: 5 sekme (Reklamlar dahil)'), JSON.stringify(sekmeler) === JSON.stringify(['Haberler', 'Maçlar', 'Goller', 'Yorumlar', 'Reklamlar']), JSON.stringify(sekmeler));
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
    await p.waitForSelector('#akis .haber-karti');
    const ilk = p.locator('#akis .haber-karti').first();
    kontrol(c('ana: yöneticinin eklediği haber en üstte'), (await ilk.locator('h3').textContent()) === 'Yönetici test haberi ' + cihaz);
    kontrol(c('ana: yüklenen kapak görseli gösteriliyor'), /^data:image\/png;base64,/.test(await ilk.locator('img').getAttribute('src') || ''));
    await git(p, 'maclar.html');
    await p.waitForSelector('#sonuclar .mac-satiri');
    const panelMaci = await metin(p, '#sonuclar .mac-satiri:first-child');
    kontrol(c('maçlar: panelden eklenen maç Türkiye saatiyle 19:30'), /Panel Rakibi/.test(panelMaci) && /1 - 3/.test(panelMaci) && /19:30/.test(panelMaci), panelMaci);
    await git(p, 'goller.html');
    await p.waitForSelector('#arsiv .arsiv-mac');
    kontrol(c('goller: panelden eklenen gol arşivde'), /Panel Golcü/.test(await metin(p, '#arsiv')));
    await p.click('#oturum-alani button');
    await p.waitForURL(/index\.html/);
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
    kontrol('kayıt: kısa şifre reddedildi', /en az 8/.test(await metin(p, '#giris-mesaj')));
    await p.fill('#k-sifre', 'uzunsifre123');
    await Promise.all([p.waitForURL(/index\.html/), p.click('#k-gonder')]);
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

  // ------------------------------------------------ ayar yapılmamışsa (sahte mod yok): uyarı
  await guvenli('ayar', async () => {
    const { ctx, p, hatalar } = await baglam({ width: 390, height: 844 });
    await git(p, 'index.html?sahte=0');
    await p.waitForSelector('.uyari');
    kontrol('ayar: ayar.js doldurulmamışsa Türkçe uyarı gösteriliyor', /assets\/ayar\.js/.test(await metin(p, '.uyari')));
    kontrol('ayar: uyarı sayfasında JavaScript hatası yok', !hatalar.length, hatalar.join(' | '));
    await ctx.close();
  });

  await tarayici.close();
  sunucu.close();
  return { gecen, kalan };
}

module.exports = { tarayiciTestleri, sunucuAc };

if (require.main === module) {
  tarayiciTestleri().then((s) => {
    console.log(JSON.stringify(s, null, 2));
    console.log(`Tarayıcı: ${s.gecen.length} geçti, ${s.kalan.length} kaldı`);
    process.exit(s.kalan.length ? 1 : 0);
  }).catch((e) => { console.error(e); process.exit(1); });
}
