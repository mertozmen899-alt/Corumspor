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
  // 2. tur (denetçi 11): aynı kökenden 404 dönen HER istek test hatasıdır (kırık kapak, eksik dosya). Kasıtlı 404 yok.
  const yok404 = new Set();

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
      // Kapaklar crossorigin="anonymous" ile istenir: gerçek Supabase deposu gibi CORS başlığı verilir
      const cors = { 'Access-Control-Allow-Origin': '*' };
      if (m) return r.fulfill({ status: 200, contentType: m[1], headers: cors, body: Buffer.from(m[2], 'base64') });
      const ornek = ornekReklamGorseli(yol);
      return ornek ? r.fulfill({ status: 200, contentType: gorselTuru(yol), headers: cors, body: ornek }) : r.fulfill({ status: 404, body: 'yok' });
    });
    // Sahte veri reklamsız başlasın (örnek Narçil reklamı reklam-tarayici-testleri.js'te denenir): boş yuva testleri için
    await ctx.addInitScript(() => { try { if (/\.html$/.test(location.pathname)) localStorage.setItem('sahte_ornek_reklam', 'yok'); } catch (e) {} });
    const p = await ctx.newPage();
    p.setDefaultTimeout(8000);
    const hatalar = [];
    p.on('pageerror', (e) => hatalar.push(e.message));
    p.on('dialog', (d) => d.accept());
    p.on('response', (r) => { if (r.status() === 404 && r.url().startsWith(ADRES)) yok404.add(r.url().replace(ADRES, '').split('?')[0]); });
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
    await p.waitForSelector('#ikili-siradaki');
    const sonraki = await metin(p, '#ikili-siradaki');
    kontrol(c('ana (019): ikili kartın sağı sıradaki maç (Deneme FK)'), /Deneme FK/.test(sonraki) && /Çorum FK/.test(sonraki), sonraki);
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
    kontrol(c('maçlar: deplasmanda ev sahibi önce yazılır'), /Kurgu Gençlik – Çorum FK/.test(sonuclar[0]) && /1\s–\s1/.test(sonuclar[0]), sonuclar[0]);
    await tasmaYok(p, cihaz, 'maçlar');

    // ------------------------------------------------ maç ayrıntısı
    await git(p, 'mac.html?id=' + M1);
    await p.waitForSelector('#mac-basi');
    const bas = await metin(p, '#mac-basi');
    kontrol(c('maç: rakip, skor, durum'), /Çorum FK/.test(bas) && /Örnekköy Spor/.test(bas) && (await metin(p, '#skor')) === '2 – 1' && /Bitti/.test(bas), bas);
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
    // Sekmeler (Özet · Olaylar · Yorumlar): yorum bileşeni Yorumlar sekmesi ilk açılınca yüklenir
    kontrol(c('maç: yorum bileşeni Yorumlar sekmesi açılmadan yüklenmez'), (await p.$$('#yorum-listesi')).length === 0);
    await p.click('#sekme-yorumlar');
    await p.waitForSelector('#yorum-listesi .yorum');
    kontrol(c('maç: yorumlar görünüyor (Yorumlar sekmesi, adres #yorumlar)'), /Tribünler muhteşemdi/.test(await metin(p, '#yorum-listesi')) && p.url().endsWith('#yorumlar'));
    await tasmaYok(p, cihaz, 'maç');
    await foto('mac');

    // ------------------------------------------------ gol arşivi
    await git(p, 'goller.html');
    await p.waitForSelector('#arsiv[data-durum="tamam"] .arsiv-mac');
    const arsiv = await p.$$eval('#arsiv .arsiv-mac', (l) => l.map((x) => ({ id: x.dataset.macId, gol: x.querySelectorAll('.gol').length })));
    kontrol(c('goller: sadece golü olan maçlar, yeniden eskiye'), arsiv.length === 2 && arsiv[0].id.endsWith('2') && arsiv[1].id === M1 && arsiv[1].gol === 2, JSON.stringify(arsiv));
    const satirlar = await p.$$eval('#arsiv a.gol-ani', (l) => l.map((a) => ({ href: a.getAttribute('href'), img: a.querySelectorAll('img').length })));
    kontrol(c('goller (018): her gol kompakt satır → gol.html; arşivde görsel, oynatıcı ve YouTube isteği yok'),
      satirlar.length === 3 && satirlar.every((k) => /^gol\.html\?id=/.test(k.href) && !k.img) && (await p.$$('#arsiv iframe, #arsiv video, #arsiv img')).length === 0, JSON.stringify(satirlar));
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

    await git(p, 'mac.html?id=' + M1 + '#yorumlar');
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
    kontrol(c('yönetim: yönetici paneli görüyor, üstte yönetici adı'), await p.isVisible('#panel') && /tribun_editor/.test(await metin(p, '#oturum-alani')));
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
    kontrol(c('yönetim: maç eklendi'), /Panel Rakibi 1 – 3 Çorum FK/.test(await metin(p, '#mac-listesi')), await metin(p, '#mac-listesi'));
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
    await p.fill('#g-video-kaynak', 'Kulübün resmî YouTube kanalı'); // 014: videolu golde kaynak zorunlu
    // 018: asist + gol anı aralığı (başlangıç ve bitiş birlikte, bitiş başlangıçtan sonra)
    await p.fill('#g-asist', 'Panel Asistçi');
    await p.fill('#g-bas', '30');
    await p.click('#g-kaydet');
    await p.waitForFunction(() => /birlikte/.test(document.querySelector('#panel-mesaj').textContent));
    await p.fill('#g-bit', '20');
    await p.click('#g-kaydet');
    await p.waitForFunction(() => /başlangıçtan sonra/.test(document.querySelector('#panel-mesaj').textContent));
    kontrol(c('yönetim (018): gol anı aralığı doğrulanır (birlikte; bitiş > başlangıç)'), true);
    await p.fill('#g-bit', '48');
    await p.click('#g-kaydet');
    await p.waitForFunction(() => /Gol eklendi/.test(document.querySelector('#panel-mesaj').textContent));
    kontrol(c('yönetim: gol eklendi'), /Panel Golcü/.test(await metin(p, '#gol-listesi')));
    kontrol(c('yönetim (018): gol listesinde asist ve gol anı aralığı'), /Panel Golcü · Asist: Panel Asistçi/.test(await metin(p, '#gol-listesi')) && /gol anı 30-48 sn/.test(await metin(p, '#gol-listesi')), await metin(p, '#gol-listesi'));
    // 018: maç kadrosu (maç düzenlenirken görünür)
    await p.click('#sekme-maclar');
    await p.locator('#mac-listesi li', { hasText: 'Panel Rakibi' }).getByRole('button', { name: 'Düzenle' }).click();
    await p.waitForSelector('#kadro-bolumu:not([hidden]) #kadro-listesi li');
    await p.fill('#k-oyuncu', 'Panel Golcü');
    await p.check('#k-ilk11');
    await p.fill('#k-cikis', '75');
    await p.selectOption('#k-sari', '1');
    await p.click('#k-kaydet');
    await p.waitForFunction(() => /kadroya eklendi/.test(document.querySelector('#panel-mesaj').textContent));
    await p.fill('#k-oyuncu', 'Panel Yedek');
    await p.fill('#k-giris', '75');
    await p.click('#k-kaydet');
    await p.waitForFunction(() => document.querySelectorAll('#kadro-listesi li[data-oyuncu]').length === 2);
    const kadroMetin = await metin(p, '#kadro-listesi');
    kontrol(c('yönetim (018): maç kadrosu: ilk 11 (75\' çıktı, 75 dk, 1 sarı) ve yedek (75\' girdi, 15 dk)'), /Panel Golcü\s*İlk 11 · 75' çıktı · 75 dk · 1 sarı/.test(kadroMetin) && /Panel Yedek\s*75' girdi · 15 dk/.test(kadroMetin), kadroMetin);
    await p.click('#m-yeni');
    kontrol(c('yönetim (018): yeni maçta kadro bölümü gizli'), await p.$eval('#kadro-bolumu', (e) => e.hidden));
    await p.click('#sekme-goller');

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
    kontrol(c('maçlar: panelden eklenen maç Türkiye saatiyle 19:30'), /Panel Rakibi/.test(panelMaci) && /1 – 3/.test(panelMaci) && /19:30/.test(panelMaci), panelMaci);
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
    // GEÇİCİ (son tur): gizlilik.html ve kurallar.html bu tur SUNUCU izindeydi; ortak satırlar (künye süresi, fetchpriority'siz supabase-js,
    // kalın yazı tipi preload'u yok) orada birleştirmede uygulanır. Birleştirmeden sonra bu liste BOŞALTILMALI.
    const SUNUCU_SAYFALARI_SON_TUR = []; // son tur birleşti: bütün sayfalar denetlenir
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
      // fetchpriority YOK (3. tur performans 1): high öncelik CSS, yazı tipleri ve hero ile bant genişliği yarışı yapıyordu — yonetim.html dahil
      const sb = /<script defer src="([^"]+)" integrity="([^"]+)"><\/script>/.exec(s) || [];
      if (!SUNUCU_SAYFALARI_SON_TUR.includes(ad)) kontrol(`statik: ${ad} supabase-js <script defer> (fetchpriority yok) yerel dosyadan, SRI ile`, sb[1] === SUPABASE_JS && sb[2] === SRI && !/fetchpriority="high" src="assets\/vendor/.test(s), sb[0] || '(etiket yok)');
      kontrol(`statik: ${ad} img-src yalnız 'self' + Supabase deposu + data:/blob: (her https adresi değil)`,
        JSON.stringify(yonerge('img-src')) === JSON.stringify(["'self'", 'https://*.supabase.co', 'data:', 'blob:']), yonerge('img-src').join(' '));
      kontrol(`statik: ${ad} og:image 1200×630 (assets/img/og-1200x630.png) + boyut + alt metin`,
        s.includes(`<meta property="og:image" content="${OG}">`) && s.includes('<meta property="og:image:width" content="1200">') && s.includes('<meta property="og:image:height" content="630">') && /<meta property="og:image:alt" content="[^"]{10,}">/.test(s), ad);
      kontrol(`statik: ${ad} CSP object-src 'none', base-uri, form-action`, yonerge('object-src')[0] === "'none'" && yonerge('base-uri').length && yonerge('form-action').length, csp);
      const alt = (/<footer class="alt">([\s\S]*?)<\/footer>/.exec(s) || [])[1] || '';
      kontrol(`statik: ${ad} alt bilgide "Çorum FK'nın resmî uygulaması değildir" (künye), gizlilik, kurallar ve fotoğraf kaynakları bağlantısı`,
        /Çorum FK'nın resmî uygulaması değildir/.test(alt) && /<a href="gizlilik\.html"/.test(alt) && /<a href="kurallar\.html"/.test(alt) && /<a href="kaynaklar\.html"/.test(alt) && /data-ayar="ILETISIM_EPOSTA"/.test(alt) && /kaldırma/i.test(alt), alt.slice(0, 120));
      // Son tur kararı (başkan 1): kaldırma taleplerine süre sözü geri geldi (yalnız kaldırma; şikâyete bakış "en kısa sürede" kalır)
      if (!SUNUCU_SAYFALARI_SON_TUR.includes(ad)) kontrol(`statik: ${ad} künyede "kaldırma taleplerine en geç 24 saat içinde dönülür"`, /\(kaldırma taleplerine en geç 24 saat içinde dönülür\)/.test(alt) && !/en kısa sürede dönülür/.test(alt), alt.slice(0, 200));
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
    kontrol('statik (013/016): hero görseli HTML\'de (önyükleme tarayıcısı bulur), fetchpriority=high, tribün çizimi, width/height, alt="", tek "high"',
      /fetchpriority="high"/.test(hero) && /src="assets\/img\/tribun-kirmizi-siyah\.svg"/.test(hero) && /width="1280" height="720"/.test(hero) && / alt=""/.test(hero) && (anaHtml.match(/<img[^>]*fetchpriority="high"/g) || []).length === 1, hero);
    kontrol('statik (son tur, tasarımcı 7): hero etiketi HTML\'de iskelet, "Manşet" yazmaz (yüklenirken yanlış etiket yok)', /<p class="hero-etiket iskelet hero-etiket-iskelet" id="hero-etiket" aria-hidden="true"><\/p>/.test(anaHtml));
    const heroBayt = fs.statSync(path.join(KOK, 'assets/img/tribun-kirmizi-siyah.svg')).size;
    const heroSvg = fs.readFileSync(path.join(KOK, 'assets/img/tribun-kirmizi-siyah.svg'), 'utf8');
    kontrol('statik (016): hero tribün çizimi ≤ 60 KB, betik ve dış kaynak yok', heroBayt <= 60 * 1024 && !/<script|href="http|xlink:href="http/i.test(heroSvg), `${heroBayt} B`);
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
    // Depodaki ayar.js gerçek proje ayarı: doldurulmamış hâl yer tutucularla taklit edilir
    const bosAyar = fs.readFileSync(path.join(KOK, 'assets/ayar.js'), 'utf8')
      .replace(/SUPABASE_URL = '[^']*'/, "SUPABASE_URL = 'https://PROJE-KODUNUZ.supabase.co'")
      .replace(/SUPABASE_ANON_KEY = '[^']*'/, "SUPABASE_ANON_KEY = 'ANON-ANAHTARINIZ'");
    await ctx.route('**/assets/ayar.js', (r) => r.fulfill({ contentType: 'text/javascript', body: bosAyar }));
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
    await git(p, 'mac.html?id=' + M1 + '#yorumlar');
    await p.waitForSelector('#yorum-listesi .yorum');
    const y = await p.$$eval('#yorum-listesi .yorum .yorum-metni', (l) => l.map((x) => x.textContent));
    // 014 (taraftar 9): varsayılan "En yeni" üstte; "En eski" seçimi eskiden yeniye çevirir
    kontrol('çok yorum: en yeni yorum (231.) listede, en yeni üstte', y[0] === 'Toplu yorum 230' && y.length <= 200 && y[1] === 'Toplu yorum 229', `${y.length} yorum, ilk: ${y[0]}`);
    kontrol('çok yorum: "son 200 yorum" notu görünüyor', /son 200 yorum/i.test(await metin(p, '.yorumlar')), await metin(p, '.yorumlar'));
    kontrol('maç başlığı: ekran okuyucu için takım adları ve skor boşlukla ayrılıyor', (await metin(p, '#mac-basi h1')) === 'Çorum FK 2 – 1 Örnekköy Spor', await metin(p, '#mac-basi h1'));
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

  // ------------------------------------------------ 2. tur (ön yüz): haber kapağı, profil, maç sonu, şerit, paylaş, maç notu, kaynaklar
  const dbYaz = (p, f, arg) => p.evaluate(([kod, arg]) => {
    const db = JSON.parse(localStorage.getItem('sahte-db-v1'));
    new Function('db', 'arg', kod)(db, arg);
    localStorage.setItem('sahte-db-v1', JSON.stringify(db));
  }, [`(${f.toString()})(db, arg)`, arg]);
  for (const [gen, yuk] of [[360, 740], [430, 932]]) {
    await guvenli(`haber kapağı ${gen}`, async () => {
      const { ctx, p } = await baglam({ width: gen, height: yuk });
      for (const id of [H1, H2]) {
        await git(p, `haber.html?sahte=1&id=${id}`);
        await p.waitForSelector('#haber[data-durum="tamam"] h1');
        await p.waitForFunction(() => { const i = document.querySelector('#makale .kapak-buyuk'); return i && (i.tagName !== 'IMG' || i.complete); });
        const d = await p.evaluate(() => {
          const k = document.querySelector('#makale .kapak-buyuk').getBoundingClientRect(), h1 = document.querySelector('#makale h1').getBoundingClientRect();
          const i = document.querySelector('#makale img.kapak-buyuk');
          return { kw: Math.round(k.width), kh: Math.round(k.height), h1Ust: Math.round(h1.top), h1Alt: Math.round(h1.bottom), ekran: innerHeight, yuklendi: !!i && i.naturalWidth > 0, src: i && i.currentSrc };
        });
        const ad = `haber kapağı (${gen}×${yuk}, ${id === H2 ? 'manşet Saat Kulesi' : 'Ulu Camii'})`;
        kontrol(`${ad}: kapak 16:9 (yükseklik ≈ genişlik × 9/16; height="900" özniteliği ezmez)`, Math.abs(d.kh - (d.kw * 9) / 16) <= 2, JSON.stringify(d));
        kontrol(`${ad}: h1 başlığı ilk ekranda (görünür alanın içinde biter)`, d.h1Alt > 0 && d.h1Alt <= d.ekran - 64, JSON.stringify(d));
        kontrol(`${ad}: kapak açıldı (gerçek genişlik kopyası; 404 yok)`, d.yuklendi, JSON.stringify(d));
      }
      await ctx.close();
    });
  }

  await guvenli('2. tur ön yüz', async () => {
    const { ctx, p, hatalar } = await baglam({ width: 390, height: 844 });
    await git(p, 'index.html?sahte=1');
    await p.waitForSelector(AKIS);
    // ---- 019: "Son maç | Sıradaki" ikili kartı hero'nun hemen altında, ilk ekranda (eski tek satırlık şerit + büyük kartın yerine)
    await p.waitForSelector('#ikili-siradaki');
    const ikili = await p.evaluate(() => {
      const k = (s) => { const a = document.querySelector(s); const r = a.getBoundingClientRect(); return { metin: a.textContent.replace(/\s+/g, ' ').trim(), href: a.getAttribute('href'), ust: Math.round(r.top), alt: Math.round(r.bottom), h: Math.round(r.height) }; };
      const hero = document.querySelector('#hero').getBoundingClientRect();
      return { son: k('#ikili-son'), sira: k('#ikili-siradaki'), heroAlt: Math.round(hero.bottom), heroH: Math.round(hero.height), ekran: innerHeight,
        eskiYok: !document.querySelector('#siradaki-serit, #sonraki-mac'), cf: document.querySelector('#mac-ikili').textContent.includes('ÇF') };
    });
    kontrol('ana (019): ikili kart: solda "Son maç" (Kurgu Gençlik 1 – 1, B), sağda "Sıradaki" Çorum FK – Deneme FK · 19:00 · kalan; ikisi de maç sayfasına',
      /^Son maç/.test(ikili.son.metin) && /Kurgu Gençlik/.test(ikili.son.metin) && /1 – 1/.test(ikili.son.metin) && /Beraberlik/.test(ikili.son.metin) && ikili.son.href === 'mac.html?id=11111111-0000-4000-8000-000000000002'
      && /^Sıradaki/.test(ikili.sira.metin) && /Çorum FK – Deneme FK/.test(ikili.sira.metin) && /19:00/.test(ikili.sira.metin) && /kaldı/.test(ikili.sira.metin) && ikili.sira.href === 'mac.html?id=11111111-0000-4000-8000-000000000003', JSON.stringify(ikili));
    kontrol('ana (019): ikili kart ilk ekranda (hero ≤ 60svh, kart hemen altında); eski şerit ve büyük sıradaki maç kartı yok; "ÇF" yok',
      ikili.sira.alt <= ikili.ekran && ikili.sira.ust >= ikili.heroAlt - 1 && ikili.heroH <= Math.ceil(ikili.ekran * 0.6) + 1 && ikili.eskiYok && !ikili.cf && ikili.son.ust === ikili.sira.ust, JSON.stringify(ikili));
    // ---- 019: son 24 saatte yayınlanan haberde "Yeni" rozeti (yazı; eski haberde yok)
    await dbYaz(p, (db) => { db.haberler.find((x) => x.baslik.startsWith('Test haberi 4')).yayin_tarihi = new Date(Date.now() - 2 * 3600e3).toISOString(); });
    await git(p, 'index.html?sahte=1');
    await p.waitForSelector(AKIS);
    const yeni = await p.evaluate(() => [...document.querySelectorAll('#akis .haber-satir')].map((a) => ({ b: a.querySelector('h3').textContent, yeni: a.querySelector('.yeni-rozet')?.textContent || null })));
    kontrol('ana (019): son 24 saatteki haberde görünür "Yeni" rozeti, eski haberlerde yok', yeni.some((x) => x.b.startsWith('Test haberi 4') && x.yeni === 'Yeni') && yeni.filter((x) => /Test haberi [5-7]/.test(x.b)).every((x) => !x.yeni), JSON.stringify(yeni));
    // ---- gol şeridi kapakları tembel (ilk ekranın altında)
    const golYukleme = await p.$$eval('#son-goller img', (l) => l.map((i) => i.getAttribute('loading')));
    kontrol('ana (2. tur): gol şeridindeki kapaklar loading=lazy', golYukleme.length >= 1 && golYukleme.every((x) => x === 'lazy'), JSON.stringify(golYukleme));
    // ---- "Daha fazla" bitince görünür "Hepsi bu kadar"
    await p.click('#daha-fazla');
    await p.waitForFunction(() => document.querySelectorAll('#akis .haber-satir').length > 6);
    kontrol('ana (2. tur): haberler bitince düğme yerine GÖRÜNÜR "Hepsi bu kadar" satırı', await p.isVisible('#akis-son') && /Hepsi bu kadar/.test(await metin(p, '#akis-son')) && !(await p.isVisible('#daha-fazla')));
    // ---- maç sonu: dün akşam biten maç ertesi sabah hero'da (36 saat)
    await dbYaz(p, (db) => { const m = db.maclar.find((x) => x.id.endsWith('02')); m.tarih = new Date(Date.now() - 14 * 3600e3).toISOString(); m.corum_skor = 3; m.rakip_skor = 0; m.durum = 'bitti'; });
    await git(p, 'index.html?sahte=1');
    await p.waitForSelector(AKIS);
    const ms = await p.evaluate(() => ({ etiket: document.querySelector('#hero-etiket').textContent, baslik: document.querySelector('#hero-baslik').textContent.replace(/\s+/g, ' '), href: document.querySelector('#hero-baslik a').getAttribute('href'), alt: document.querySelector('#hero-alt').textContent, akis: [...document.querySelectorAll('#akis h3')].map((h) => h.textContent) }));
    kontrol('ana (2. tur): maç bittikten sonraki sabah hero "Maç sonu · Kurgu Gençlik 0 – 3 Çorum FK · Galibiyet", maç sayfasına', ms.etiket === 'Maç sonu' && ms.baslik === 'Kurgu Gençlik 0 – 3 Çorum FK' && /mac\.html\?id=11111111-0000-4000-8000-000000000002/.test(ms.href) && /Galibiyet/.test(ms.alt) && /Golleri izle/.test(ms.alt), JSON.stringify(ms));
    kontrol('ana (2. tur): maç sonu hero\'dayken manşet haberi akışta görünür', ms.akis.includes('Test haberi 2: Deplasmanda bir puan'), JSON.stringify(ms.akis));
    await dbYaz(p, (db) => { db.maclar.find((x) => x.id.endsWith('02')).tarih = new Date(Date.now() - 40 * 3600e3).toISOString(); });
    await git(p, 'index.html?sahte=1');
    await p.waitForSelector(AKIS);
    kontrol('ana (2. tur): 36 saat geçince hero yine manşet', (await p.textContent('#hero-etiket')) === 'Manşet', await p.textContent('#hero-etiket'));

    // ---- haber: kaynak, düzeltme notu, kapak alt metni, paylaş
    await dbYaz(p, (db, id) => Object.assign(db.haberler.find((x) => x.id === id), { kaynak: 'Kulüp açıklaması', kaynak_url: 'https://ornek.test/aciklama/9', duzeltme_notu: 'İlk sürümde skor 2-0 yazılmıştı; doğrusu 2-1.', kapak_alt: 'Çorum Ulu Camii, bayraklarla' }), H1);
    await git(p, 'haber.html?sahte=1&id=' + H1);
    await p.waitForSelector('#haber[data-durum="tamam"] h1');
    const hb = await p.evaluate(() => {
      const k = document.querySelector('#haber-kaynak a'), d = document.querySelector('#haber-duzeltme');
      const sira = [...document.querySelectorAll('#makale > *')].map((e) => e.id || e.className || e.tagName);
      return { kaynak: document.querySelector('#haber-kaynak')?.textContent, href: k && k.getAttribute('href'), rel: k && k.getAttribute('rel'), hedef: k && k.target, duzeltme: d && d.textContent, sira, alt: document.querySelector('#makale img.kapak-buyuk')?.getAttribute('alt'), paylas: document.querySelector('#makale .paylas')?.getAttribute('href') || '' };
    });
    kontrol('haber (2. tur): "Kaynak: …" bağlantılı, yeni sekme (bildirimli), rel="noopener nofollow"', /^Kaynak: Kulüp açıklaması \(yeni sekmede açılır\)$/.test(hb.kaynak) && hb.href === 'https://ornek.test/aciklama/9' && hb.rel === 'noopener nofollow' && hb.hedef === '_blank', JSON.stringify(hb));
    kontrol('haber (2. tur): "Düzeltme:" kutusu metnin başında (başlık/tarihten sonra, gövdeden önce)', /^Düzeltme: İlk sürümde/.test(hb.duzeltme || '') && hb.sira.indexOf('haber-duzeltme') > 0 && hb.sira.indexOf('haber-duzeltme') < hb.sira.indexOf('haber-metni'), JSON.stringify(hb.sira));
    kontrol('haber (2. tur): kapak alt metni = kapak_alt', hb.alt === 'Çorum Ulu Camii, bayraklarla', hb.alt);
    kontrol('haber (2. tur): paylaş düğmesi (paylaşım menüsü yoksa wa.me; başlık ve adres metinde)', /^https:\/\/wa\.me\/\?text=/.test(hb.paylas) && decodeURIComponent(hb.paylas).includes('Test haberi 1') && decodeURIComponent(hb.paylas).includes('haber.html?'), hb.paylas);
    await dbYaz(p, (db, id) => Object.assign(db.haberler.find((x) => x.id === id), { kaynak_url: 'javascript:alert(1)', duzeltme_notu: null, kapak_alt: null }), H1);
    await git(p, 'haber.html?sahte=1&id=' + H1);
    await p.waitForSelector('#haber[data-durum="tamam"] h1');
    kontrol('haber (2. tur): https olmayan kaynak adresi bağlantı olmaz; düzeltme yoksa kutu yok; alt yoksa boş', !(await p.$('#haber-kaynak a')) && /Kulüp açıklaması/.test(await metin(p, '#haber-kaynak')) && !(await p.$('#haber-duzeltme')) && (await p.getAttribute('#makale img.kapak-buyuk', 'alt')) === '');
    // kırık kapak: yer tutucuya döner (kırık görsel yok, 16:9 korunur)
    await dbYaz(p, (db, id) => { db.haberler.find((x) => x.id === id).kapak_url = 'assets/img/olmayan-kapak-1600.webp'; }, H1);
    await ctx.route('**/assets/img/olmayan-kapak-*', (r) => r.fulfill({ status: 410, body: '' }));
    await git(p, 'haber.html?sahte=1&id=' + H1);
    await p.waitForSelector('#makale .kapak-buyuk.kapak-yok');
    const kk = await p.$eval('#makale .kapak-buyuk', (e) => { const r = e.getBoundingClientRect(); return { etiket: e.tagName, w: Math.round(r.width), h: Math.round(r.height) }; });
    kontrol('haber (2. tur): açılmayan kapak desenli yer tutucuya döner, 16:9 korunur', kk.etiket === 'SPAN' && Math.abs(kk.h - (kk.w * 9) / 16) <= 2, JSON.stringify(kk));
    // navigator.share varsa önce o
    await p.evaluate(() => { window.__paylasilan = null; });
    await ctx.addInitScript(() => { navigator.share = async (v) => { window.__paylasilan = v; }; });
    await git(p, 'haber.html?sahte=1&id=' + H2);
    await p.waitForSelector('#makale .paylas');
    const pd = await p.$eval('#makale .paylas', (a) => ({ metin: a.textContent, tur: a.dataset.paylas }));
    await p.click('#makale .paylas');
    const paylasilan = await p.evaluate(() => window.__paylasilan);
    kontrol('haber (2. tur): telefonun paylaşım menüsü varsa düğme "Paylaş" ve navigator.share({title, text, url}) çağrılır', pd.metin === 'Paylaş' && pd.tur === 'yerel' && paylasilan && /Test haberi 2/.test(paylasilan.text) && /haber\.html\?/.test(paylasilan.url), JSON.stringify({ pd, paylasilan }));

    // ---- maç: geri sayım rozeti (PLANLANDI değil), maç notu, paylaş
    await dbYaz(p, (db) => { db.maclar.find((x) => x.id.endsWith('03')).mac_notu = 'Biletler Passolig\'de. Kapılar 17:00\'de açılır; maç TV\'de canlı.'; });
    await git(p, 'mac.html?sahte=1&id=11111111-0000-4000-8000-000000000003');
    await p.waitForSelector('#mac[data-durum="tamam"]');
    const mc = await p.evaluate(() => ({ rozet: document.querySelector('#mac-basi .rozet').textContent, not: document.querySelector('#mac-notu')?.textContent, paylas: !!document.querySelector('#mac .paylas') }));
    kontrol('maç (2. tur): planlı maçta rozet "N gün kaldı" / "Yarın maç var" (resmî "Planlandı" yok)', /^(\d+ gün kaldı|Yarın maç var)$/.test(mc.rozet) && !/Planlandı/i.test(await metin(p, '#mac-basi')), JSON.stringify(mc));
    kontrol('maç (2. tur): maç notu (bilet / kapı / yayın) kutusu ve paylaş düğmesi', /^Maç notu: Biletler Passolig/.test(mc.not || '') && mc.paylas, JSON.stringify(mc));
    await dbYaz(p, (db) => { const m = db.maclar.find((x) => x.id.endsWith('03')); const d = new Date(Date.now() + 2 * 3600e3); m.tarih = d.toISOString(); });
    await git(p, 'mac.html?sahte=1&id=11111111-0000-4000-8000-000000000003');
    await p.waitForSelector('#mac[data-durum="tamam"]');
    const bugunMu = await p.evaluate(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date(Date.now() + 2 * 3600e3)) === new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date()));
    if (bugunMu) kontrol('maç (2. tur): maç günü rozet "Bugün maç var!"', (await p.textContent('#mac-basi .rozet')) === 'Bugün maç var!', await p.textContent('#mac-basi .rozet'));
    await git(p, 'mac.html?sahte=1&id=' + M1);
    await p.waitForSelector('#mac[data-durum="tamam"]');
    kontrol('maç (2. tur): maç notu yoksa kutu yok; biten maçta rozet "Bitti"', !(await p.$('#mac-notu')) && (await p.textContent('#mac-basi .rozet')) === 'Bitti');

    // ---- gol: video kaynağı, mp4 altyazısı (track)
    await dbYaz(p, (db) => { const g = db.goller.find((x) => x.id.endsWith('03')); g.video_kaynak = 'Çorum FK resmî YouTube kanalı'; g.altyazi_url = 'https://sahte.supabase.co/storage/v1/object/public/haber-gorselleri/altyazi/gol-3.vtt'; });
    await ctx.route(/sahte\.supabase\.co\/storage\/v1\/object\/public\/haber-gorselleri\/altyazi\//, (r) => r.fulfill({ status: 200, contentType: 'text/vtt', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'WEBVTT\n\n00:00.000 --> 00:02.000\nGol!\n' }));
    await git(p, 'gol.html?sahte=1&id=22222222-0000-4000-8000-000000000003');
    await p.waitForSelector('#gol[data-durum="tamam"] .video-baslat');
    const gk = await p.evaluate(() => ({ kaynak: document.querySelector('#video-kaynak')?.textContent, not: document.querySelector('#video-not').textContent, h1Once: document.querySelector('#gol-baslik').compareDocumentPosition(document.querySelector('.video')) & Node.DOCUMENT_POSITION_FOLLOWING, videoUstte: document.querySelector('.video').getBoundingClientRect().top < document.querySelector('#gol-baslik').getBoundingClientRect().top }));
    kontrol('gol (2. tur): videonun altında "Video: <hak sahibi>"; altyazı varken "altyazı yok" yazmaz', /^Video: Çorum FK resmî YouTube kanalı/.test(gk.kaynak || '') && !/altyazı yok/.test(gk.not) && /altyazılı/.test(gk.not), JSON.stringify(gk));
    kontrol('gol (2. tur): DOM\'da h1 videodan önce, ekranda video üstte (başlıkla gezinme video düğmesini atlamaz)', !!gk.h1Once && gk.videoUstte, JSON.stringify(gk));
    await p.click('.video-baslat');
    await p.waitForSelector('.video video');
    const tr = await p.$eval('.video video', (v) => { const t = v.querySelector('track'); return t ? { kind: t.kind, srclang: t.srclang, label: t.label, def: t.default, src: t.getAttribute('src'), co: v.getAttribute('crossorigin') } : null; });
    kontrol('gol (2. tur): mp4\'te <track kind="captions" srclang="tr" label="Türkçe" default> (kendi depomuzdan .vtt), crossorigin', tr && tr.kind === 'captions' && tr.srclang === 'tr' && tr.label === 'Türkçe' && tr.def && /\.vtt$/.test(tr.src) && tr.co === 'anonymous', JSON.stringify(tr));
    await dbYaz(p, (db) => { db.goller.find((x) => x.id.endsWith('03')).altyazi_url = 'https://kotu.example.com/a.vtt'; });
    await git(p, 'gol.html?sahte=1&id=22222222-0000-4000-8000-000000000003');
    await p.waitForSelector('#gol[data-durum="tamam"] .video-baslat');
    await p.click('.video-baslat');
    await p.waitForSelector('.video video');
    kontrol('gol (2. tur): başka sitedeki altyazı adresi kullanılmaz (track yok, "altyazı yok" notu)', !(await p.$('.video video track')) && /altyazı yok/.test(await p.textContent('#video-not')));

    // ---- takım: sakatlıkta açıklama/tanı HİÇ gösterilmez; "Durumu belirsiz"; kaynak tarihi
    await dbYaz(p, (db) => { const s3 = db.sakatliklar.find((x) => x.id.endsWith('03')); s3.yayinda = true; s3.kaynak_url = 'https://ornek.test/aciklama/3'; s3.kaynak_tarihi = '2026-11-03'; });
    await git(p, 'takim.html?sahte=1#sakatlik');
    await p.waitForSelector('#sakatlik-icerik[data-durum="tamam"] .sakatlik');
    const sk = await p.evaluate(() => ({ metin: document.querySelector('#sakatlik-icerik').textContent, belirsiz: [...document.querySelectorAll('.sakatlik')].find((l) => /Barış/.test(l.textContent))?.textContent || '' }));
    kontrol('takım (2. tur): sakatlık açıklaması (tanı) ziyaretçiye gösterilmez', !/adale|bireysel çalışıyor|Sarı kart cezalısı|Taslak: yayında değil/.test(sk.metin), sk.metin.slice(0, 200));
    kontrol('takım (2. tur): "belirsiz" durum "Durumu belirsiz" (Şüpheli değil), kaynak bağlantılı ve kaynak tarihli', /Durumu belirsiz/.test(sk.belirsiz) && !/Şüpheli/.test(sk.metin) && /Kaynak: Kulüp açıklaması/.test(sk.belirsiz) && /3 Kasım 2026/.test(sk.belirsiz), sk.belirsiz);

    // ---- profil: üye görünümünde "null" metni yok
    await girisYap(p, 'taraftar@ornek.test', 'profil.html');
    await p.waitForSelector('#profil[data-durum="tamam"] #profil-ad');
    const pm = await metin(p, '#profil');
    kontrol('profil (2. tur): üye (yönetici değil) profilinde "null" yazmıyor ("nullnull" hatası)', !/null/i.test(pm) && /ayse_19/.test(pm), pm);
    kontrol('2. tur ön yüz sayfalarında JavaScript hatası yok', !hatalar.length, hatalar.join(' | '));
    await ctx.close();
  });

  // ------------------------------------------------ son tur (3. tur incelemesi) ön yüz
  await guvenli('son tur ön yüz', async () => {
    const { ctx, p, hatalar } = await baglam({ width: 360, height: 740 });
    // data-durum geçişlerini ve ayrıntı sayfasındaki ilk kapak <img>'ini kaydet (önbellekten çizim → ağdan tazeleme)
    await ctx.addInitScript(() => {
      window.__durumlar = [];
      new MutationObserver((l) => {
        for (const m of l) {
          if (m.type === 'attributes' && m.attributeName === 'data-durum' && /^(haber|gol)$/.test(m.target.id)) window.__durumlar.push(m.target.dataset.durum);
          if (!window.__ilkKapak) window.__ilkKapak = document.querySelector('#makale img.kapak-buyuk, #gol .video-baslat img');
        }
      }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-durum'] });
    });
    const tekSatir = (sec) => p.$$eval(sec, (l) => l.map((e) => { const r = [...e.getClientRects()]; const lh = parseFloat(getComputedStyle(e).lineHeight) || parseFloat(getComputedStyle(e).fontSize) * 1.4; return { t: e.textContent, satir: new Set(r.map((x) => Math.round(x.top))).size, h: Math.round(e.getBoundingClientRect().height), lh: Math.round(lh) }; }));
    // ---- taraftar 1: maç sonu hero'sunda skor bölünmez (360 px)
    await git(p, 'index.html?sahte=1');
    await p.waitForSelector(AKIS);
    await dbYaz(p, (db) => { const m = db.maclar.find((x) => x.id.endsWith('02')); m.tarih = new Date(Date.now() - 14 * 3600e3).toISOString(); m.corum_skor = 3; m.rakip_skor = 0; m.durum = 'bitti'; m.rakip = 'Hayal Belediyespor Deneme'; });
    await dbYaz(p, (db) => { db.maclar.find((x) => x.id.endsWith('03')).rakip = 'Hayal Belediyespor Kulübü'; });
    await git(p, 'index.html?sahte=1');
    await p.waitForSelector(AKIS);
    const hs = await tekSatir('#hero-baslik .skor-blok');
    kontrol('son tur (taraftar 1): 360 px maç sonu hero\'sunda skor tek parça, tek satırda (nowrap)', hs.length === 1 && hs[0].t.replace(/\s+/g, ' ') === '0 – 3' && hs[0].satir === 1 && await p.$eval('#hero-baslik .skor-blok', (e) => getComputedStyle(e).whiteSpace === 'nowrap'), JSON.stringify(hs));
    // ---- tasarımcı 7: etiket yüklenirken iskelet (HTML'de "Manşet" yazmaz); veri gelince gerçek etiket
    const et = await p.$eval('#hero-etiket', (e) => ({ metin: e.textContent, iskelet: e.classList.contains('iskelet') }));
    kontrol('son tur (tasarımcı 7): veri gelince hero etiketi gerçek metin, iskelet sınıfı kalkar', et.metin === 'Maç sonu' && !et.iskelet, JSON.stringify(et));
    // ---- taraftar 5 / tasarımcı 5 (019: ikili kartta): uzun rakip adı karttan taşmaz (sarar), geri sayım tek parça "· 5 g 15 sa"
    const sp = await tekSatir('#ikili-siradaki .serit-kalan');
    const kalanMetin = await p.$eval('#ikili-siradaki .serit-kalan [aria-hidden="true"]', (e) => e.textContent).catch(() => '');
    const okunus = await p.$eval('#ikili-siradaki .serit-kalan .gorunmez', (e) => e.textContent).catch(() => '');
    const tasma = await p.$$eval('.ikili-kart', (l) => l.map((e) => e.scrollWidth - e.clientWidth));
    kontrol('son tur (taraftar 5, 019): ikili kartta uzun rakip adı sarar (yatay taşma yok); geri sayım tek satırda, ayraç "·" başta',
      sp.length === 1 && sp[0].satir === 1 && /^· /.test(kalanMetin) && tasma.every((x) => x <= 0), JSON.stringify({ sp, tasma }));
    kontrol('son tur (tasarımcı 5): geri sayım tek parça "N g M sa", ekran okuyucuya "N gün M saat kaldı"', /^· \d+ g \d+ sa$/.test(kalanMetin) && /^, \d+ gün \d+ saat kaldı$/.test(okunus), JSON.stringify({ kalanMetin, okunus }));
    // ---- fikstür ve gol arşivi satırlarında skor bölünmez
    await git(p, 'takim.html?sahte=1#fikstur');
    await p.waitForSelector('#sonuclar .fikstur-satir');
    const fs1 = await tekSatir('#sonuclar .fikstur-satir .skor');
    kontrol('son tur (taraftar 1): fikstür satırlarında skor tek satırda', fs1.length >= 2 && fs1.every((x) => x.satir === 1), JSON.stringify(fs1));
    await git(p, 'goller.html?sahte=1');
    await p.waitForSelector('#arsiv[data-durum="tamam"] .arsiv-mac');
    const gs = await tekSatir('#arsiv .mac-ac .skor-blok');
    kontrol('son tur (taraftar 1): gol arşivi grup başlıklarında skor tek parça, tek satırda', gs.length >= 2 && gs.every((x) => x.satir === 1), JSON.stringify(gs));
    // ---- 018: maç tek satır "2. Hafta · Çorum FK – Örnekköy Spor 2 – 1"; gol arşivinde "Özeti izle" YOK (özet maç sayfasında kalır)
    const m1 = await p.$eval(`#arsiv .arsiv-mac[data-mac-id="${M1}"]`, (s) => ({ satir: s.querySelector('.mac-ac-satir').textContent.replace(/\s+/g, ' '), ozet: [...s.querySelectorAll('a')].filter((a) => /#ozet|Özeti izle/.test(a.getAttribute('href') + a.textContent)).length }));
    kontrol('018: gol arşivinde maç satırı "2. Hafta · Çorum FK – Örnekköy Spor 2 – 1", "Özeti izle" bağlantısı yok', /^2\. Hafta · Çorum FK – Örnekköy Spor 2 – 1$/.test(m1.satir) && m1.ozet === 0 && !/Özeti izle/.test(await metin(p, '#arsiv')), JSON.stringify(m1));
    await git(p, `mac.html?sahte=1&id=${M1}#ozet`);
    await p.waitForSelector('#ozet:not([hidden]) #ozet-video .video');
    const oz = await p.evaluate(() => ({ iframe: document.querySelectorAll('#ozet iframe').length, kaynak: document.querySelector('#ozet-kaynak').textContent, ust: document.querySelector('#mac-basi .ust-satir').textContent }));
    kontrol('016: maç sayfasında özet video kapağı, "Video: …" kaynağı, "2. Hafta"; iframe dokunmadan yok', oz.iframe === 0 && /^Video: .+/.test(oz.kaynak) && /2\. Hafta/.test(oz.ust), JSON.stringify(oz));
    await git(p, 'goller.html?sahte=1');
    await p.waitForSelector('#arsiv[data-durum="tamam"] .arsiv-mac');
    // ---- 018: gol arşivi metin satırları (kapak görseli yok): fetchpriority=high görsel de yok
    kontrol('018: gol arşivinde fetchpriority=high görsel yok (LCP metin)', (await p.$$('#arsiv img')).length === 0 && (await p.$$('img[fetchpriority="high"]')).length === 0);
    // ---- 018: açılır maç satırı: kapalı başlar, tıklayınca golleri gösterir, adrese ?ac= yazar, klavyeyle (Enter / Boşluk) kapanır/açılır
    const acDugme = `#arsiv .arsiv-mac[data-mac-id="${M1}"] button.mac-ac`;
    const acDurum = () => p.$eval(acDugme, (b) => ({ acik: b.getAttribute('aria-expanded'), panel: b.getAttribute('aria-controls'), gizli: document.getElementById(b.getAttribute('aria-controls')).hidden, boy: Math.round(b.getBoundingClientRect().height), url: location.search, golSatir: [...document.getElementById(b.getAttribute('aria-controls')).querySelectorAll('a.gol-ani')].map((a) => a.textContent.replace(/\s+/g, ' ').trim()) }));
    const a0 = await acDurum();
    kontrol('018: maç satırı başta kapalı (aria-expanded=false, panel gizli, aria-controls), ≥44 px', a0.acik === 'false' && a0.gizli && a0.panel === 'goller-' + M1 && a0.boy >= 44, JSON.stringify(a0));
    await p.click(acDugme);
    const a1 = await acDurum();
    kontrol('018: dokununca açılır: goller dakika sırasıyla ("23\' Ali Örnek · Asist: Mehmet Deneme ▶"), adreste ?ac=', a1.acik === 'true' && !a1.gizli && a1.golSatir.length === 2 && a1.golSatir[0] === "23'Ali Örnek · Asist: Mehmet Deneme▶" && /^90\+2'Mehmet Deneme/.test(a1.golSatir[1]) && a1.url.includes('ac=' + M1), JSON.stringify(a1));
    await p.focus(acDugme);
    await p.keyboard.press('Enter');
    const a2 = await acDurum();
    await p.keyboard.press(' ');
    const a3 = await acDurum();
    kontrol('018: klavye: Enter kapatır (?ac= silinir), Boşluk yeniden açar', a2.acik === 'false' && a2.gizli && !a2.url.includes('ac=') && a3.acik === 'true' && !a3.gizli, JSON.stringify({ a2, a3 }));
    await git(p, `goller.html?sahte=1&ac=${M1}`);
    await p.waitForSelector('#arsiv[data-durum="tamam"] .arsiv-mac');
    const a4 = await acDurum();
    kontrol('018: ?ac=<maç> adresiyle açınca o maç açık gelir', a4.acik === 'true' && !a4.gizli, JSON.stringify(a4));
    const golHref = await p.getAttribute(`#goller-${M1} a.gol-ani`, 'href');
    kontrol('018: gol satırı bağlantısı gol.html?id=… (gol anı orada)', golHref === 'gol.html?id=22222222-0000-4000-8000-000000000001', golHref);
    // ---- 018: gol sayfası: asist satırı; video dokununca yalnız gol anı (YouTube start/end)
    await git(p, 'gol.html?sahte=1&id=22222222-0000-4000-8000-000000000001');
    await p.waitForSelector('#gol[data-durum="tamam"] .video-baslat');
    const ga = { asist: await metin(p, '#gol-asist'), iframe: (await p.$$('iframe')).length };
    await p.click('.video-baslat');
    await p.waitForSelector('.video iframe');
    ga.src = await p.getAttribute('.video iframe', 'src');
    kontrol('018: gol sayfasında "Asist: Mehmet Deneme"; dokunmadan iframe yok; dokununca embed adresinde start=5&end=47', ga.asist === 'Asist: Mehmet Deneme' && ga.iframe === 0 && /\/embed\/aqz-KE-bpKQ\?.*&start=5&end=47$/.test(ga.src || ''), JSON.stringify(ga));
    // ---- 018: oyuncu sayfası (Ali Örnek: 2 maç, 1 ilk 11, 70 + 30 dk, 2 gol, 0 asist, 1 sarı) ve boş durum
    await git(p, 'oyuncu.html?sahte=1&id=55555555-0000-4000-8000-000000000007');
    await p.waitForSelector('#oyuncu[data-durum="tamam"] #istatistikler');
    const oy = await p.evaluate(() => ({
      ad: document.querySelector('#oyuncu-ad').textContent,
      kutular: [...document.querySelectorAll('#istatistikler li')].map((li) => li.querySelector('.etiket').textContent + '=' + li.querySelector('.sayi').textContent).join(','),
      tabular: getComputedStyle(document.querySelector('#istatistikler .sayi')).fontVariantNumeric,
      goller: [...document.querySelectorAll('#oyuncu-goller a')].map((a) => a.getAttribute('href')),
      asist: document.querySelectorAll('#oyuncu-asistler a').length,
      nav: document.querySelector('#alt-nav a[aria-current]')?.textContent.trim() + ':' + document.querySelector('#alt-nav a[aria-current]')?.getAttribute('aria-current'),
      yasak: /piyasa değeri|şut|isabetli pas/i.test(document.querySelector('main').textContent),
      kaynak: document.querySelector('.istatistik-not')?.textContent || '',
    }));
    kontrol('018: oyuncu sayfası sayıları (Maç 2, İlk 11 1, Dakika 100, Gol 2, Asist 0, Gole katkı 2, Sarı 1, Kırmızı 0), tabular-nums',
      oy.ad === 'Ali Örnek' && oy.kutular === 'Maç=2,İlk 11=1,Dakika=100,Gol=2,Asist=0,Gole katkı=2,Sarı kart=1,Kırmızı kart=0' && /tabular-nums/.test(oy.tabular), JSON.stringify(oy));
    kontrol('018: oyuncu sayfasında goller gol.html bağlantısı; asist yok; alt menüde Takım aria-current="true"; pas/şut/piyasa değeri yok; kaynak notu',
      oy.goller.length === 2 && oy.goller.every((x) => /^gol\.html\?id=/.test(x)) && oy.asist === 0 && oy.nav === 'Takım:true' && !oy.yasak && /uzatmalar sayılmaz/.test(oy.kaynak), JSON.stringify(oy));
    const oc = await p.evaluate(() => ({ one: [...document.querySelectorAll('#one-cikan li')].map((l) => l.querySelector('.etiket').textContent + '=' + l.querySelector('.sayi').textContent).join(','), gezgin: [...document.querySelectorAll('#oyuncu-gezgin a')].map((a) => a.rel + ':' + a.querySelector('b').textContent).join('|'), diger: [...document.querySelectorAll('#diger-oyuncular a .ad')].map((x) => x.textContent).join(',') }));
    kontrol('hareket (oyuncu): üstte 3 büyük sayı Gol 2 · Asist 0 · Maç 2; önceki/sonraki kadro sırasıyla (Mehmet Deneme ← → Fikret Forvet); diğer forvetler şeritte',
      oc.one === 'Gol=2,Asist=0,Maç=2' && oc.gezgin === 'prev:Mehmet Deneme|next:Fikret Forvet' && oc.diger === 'Fikret Forvet', JSON.stringify(oc));
    await git(p, 'oyuncu.html?sahte=1&id=55555555-0000-4000-8000-000000000006');
    await p.waitForSelector('#oyuncu[data-durum="tamam"] #istatistikler');
    const md = await p.$$eval('#istatistikler li', (l) => l.map((li) => li.querySelector('.sayi').textContent).join(','));
    kontrol('018: Mehmet Deneme: 1 maç / 90 dk, 1 gol (penaltı) + 1 asist = 2 katkı; asist listesinde Ali Örnek golü', md === '1,1,90,1,1,2,0,0' && /Ali Örnek golü/.test(await metin(p, '#oyuncu-asistler')), md);
    await git(p, 'oyuncu.html?sahte=1&id=55555555-0000-4000-8000-000000000001');
    await p.waitForSelector('#oyuncu[data-durum="tamam"]');
    const bos = await p.evaluate(() => ({ one: document.querySelector('#one-cikan')?.textContent, ist: document.querySelectorAll('#istatistikler li').length, sayilar: [...document.querySelectorAll('#istatistikler .sayi')].map((s) => s.textContent).join(',') }));
    // Telefon incelemesi: forma giymemiş oyuncunun sayfası "boş" görünüyordu (yalnız metin): sayılar artık 0 olarak çizilir + tek satır not
    kontrol('hareket (oyuncu): verisi olmayan oyuncuda 3 büyük sayı ve 8 kutu 0 olarak çizilir, "henüz forma giymedi" notu, gol katkısı boş durumu',
      bos.one === '0Gol0Asist0Maç' && bos.ist === 8 && bos.sayilar === '0,0,0,0,0,0,0,0' && /henüz forma giymedi/.test(await metin(p, '#oyuncu-bos')) && /henüz gol katkısı yok/.test(await metin(p, '#katki-bos')), JSON.stringify(bos));
    const gz = await p.evaluate(() => ({ gezgin: [...document.querySelectorAll('#oyuncu-gezgin a')].map((a) => a.rel + ':' + a.dataset.oyuncuId.slice(-1)), diger: [...document.querySelectorAll('#diger-oyuncular a')].map((a) => a.dataset.oyuncuId.slice(-1)) }));
    kontrol('hareket (oyuncu): ilk kalecide yalnız "Sonraki" (kadro sırası: Yedek Eldiven); "Diğer oyuncular" aynı mevkiden', gz.gezgin.join() === 'next:2' && gz.diger.join() === '2', JSON.stringify(gz));
    await git(p, 'oyuncu.html?sahte=1&id=55555555-0000-4000-8000-0000000000ff');
    await p.waitForSelector('#oyuncu[data-durum="tamam"]');
    kontrol('018: olmayan oyuncu: "Oyuncu bulunamadı"', /Oyuncu bulunamadı/.test(await metin(p, '#oyuncu')));
    // ---- 018: kadro kartı oyuncu sayfasına TEK bağlantı (erişilebilir ad)
    await git(p, 'takim.html?sahte=1#kadro');
    await p.waitForSelector('#kadro-icerik[data-durum="tamam"] .oyuncu-kart');
    const kk = await p.$$eval('#kadro-icerik .oyuncu-kart', (l) => l.map((a) => ({ tag: a.tagName, href: a.getAttribute('href'), ad: a.getAttribute('aria-label'), ic: a.querySelectorAll('a').length })));
    kontrol('018: kadro kartları a.oyuncu-kart → oyuncu.html?id=, adı "<ad>, forma numarası N…: oyuncu sayfası", iç içe bağlantı yok',
      kk.length === 8 && kk.every((k) => k.tag === 'A' && /^oyuncu\.html\?id=55555555-/.test(k.href) && /: oyuncu sayfası$/.test(k.ad) && !k.ic) && kk.some((k) => k.ad === 'Ali Örnek, forma numarası 9: oyuncu sayfası'), JSON.stringify(kk.slice(0, 2)));
    await Promise.all([p.waitForURL(/oyuncu\.html/), p.click('#kadro-icerik .oyuncu-kart[data-oyuncu-id="55555555-0000-4000-8000-000000000007"]')]);
    await p.waitForSelector('#oyuncu[data-durum="tamam"]');
    kontrol('018: kadro kartına dokununca oyuncu sayfası açılır', (await metin(p, '#oyuncu-ad')) === 'Ali Örnek');

    // ---- hareket ve geçişler: maç sekmeleri (Özet · Olaylar · Yorumlar), olay çizelgesi, yapışkan skor çubuğu
    await git(p, 'mac.html?sahte=1&id=' + M1);
    await p.waitForSelector('#mac[data-durum="tamam"]');
    const ms = await p.evaluate(() => ({
      tablar: [...document.querySelectorAll('#mac-sekmeler [role="tab"]')].map((t) => t.textContent + ':' + t.getAttribute('aria-selected') + ':' + t.tabIndex),
      paneller: ['ozet', 'olaylar', 'yorumlar'].map((s) => document.getElementById('panel-' + s).hidden),
      sponsorUstte: !!(document.querySelector('.reklam-yuvasi[data-reklam-alan="mac_sponsoru"]').compareDocumentPosition(document.getElementById('mac-sekmeler')) & Node.DOCUMENT_POSITION_FOLLOWING),
      cubukGizli: document.getElementById('skor-cubugu').getAttribute('aria-hidden') === 'true' && !document.getElementById('skor-cubugu').classList.contains('acik'),
      cubuk: document.getElementById('skor-cubugu').textContent,
    }));
    kontrol('hareket: maç sekmeleri Özet (seçili, tabindex 0) · Olaylar · Yorumlar; yalnız Özet paneli açık; sponsor yuvası sekmelerin üstünde',
      ms.tablar.join('|') === 'Özet:true:0|Olaylar:false:-1|Yorumlar:false:-1' && ms.paneller.join() === 'false,true,true' && ms.sponsorUstte, JSON.stringify(ms));
    kontrol('hareket: skor çubuğu aria-hidden, başta kapalı, "Çorum FK 2 – 1 Örnekköy Spor"', ms.cubukGizli && ms.cubuk.replace(/\s+/g, ' ') === 'Çorum FK2 – 1Örnekköy Spor', JSON.stringify(ms));
    await p.focus('#sekme-ozet');
    await p.keyboard.press('ArrowRight');
    await p.waitForSelector('#olaylar[data-durum="tamam"]');
    const ol = await p.evaluate(() => ({
      odak: document.activeElement.id, url: location.hash,
      olaylar: [...document.querySelectorAll('#olay-cizelge .olay')].map((l) => l.className.split(' ')[1].replace('olay-', '') + ':' + l.dataset.taraf + '@' + l.querySelector('.dk [aria-hidden]').textContent),
      golHref: document.querySelector('#olay-cizelge .olay-gol a')?.getAttribute('href'),
      kartlar: document.querySelector('.kart-listesi')?.textContent || '',
      ilk11: [...document.querySelectorAll('#ilk11-baslik + .mac-kadro li')].map((l) => l.textContent),
      yedek: [...document.querySelectorAll('#yedek-baslik + .mac-kadro a')].map((a) => a.getAttribute('href')),
    }));
    kontrol('hareket: Olaylar sekmesi klavyeyle (sağ ok) açılır, adres #olaylar; çizelge dakika sırasıyla gol 23\' · rakip golü 55\' (019) · değişiklik 70\' · gol 90+2\'',
      ol.odak === 'sekme-olaylar' && ol.url === '#olaylar' && ol.olaylar.join('|') === "gol:biz@23'|rakip_gol:rakip@55'|degisiklik:biz@70'|gol:biz@90+2'", JSON.stringify(ol));
    kontrol('hareket: gol satırı gol.html\'e bağlanır; sarı kart dakikasız listede; İlk 11 ve oyuna girenler oyuncu sayfasına bağlı',
      ol.golHref === 'gol.html?id=22222222-0000-4000-8000-000000000001' && /Sarı kart: Ali Örnek/.test(ol.kartlar) && ol.ilk11.length === 2 && ol.yedek.join() === 'oyuncu.html?id=55555555-0000-4000-8000-000000000008', JSON.stringify(ol));
    await p.keyboard.press('End');
    await p.waitForSelector('#yorum-listesi .yorum');
    kontrol('hareket: End son sekmeye (Yorumlar) gider, yorum bileşeni yüklenir', (await p.evaluate(() => document.activeElement.id + location.hash)) === 'sekme-yorumlar#yorumlar');
    await p.goBack();
    kontrol('hareket: geri tuşu önceki sekmeye (Olaylar) döner', (await p.getAttribute('#sekme-olaylar', 'aria-selected')) === 'true');
    await git(p, 'mac.html?sahte=1&id=' + M1 + '#olaylar');
    await p.waitForSelector('#olaylar[data-durum="tamam"]');
    kontrol('hareket: #olaylar adresiyle açınca Olaylar sekmesi seçili', (await p.getAttribute('#sekme-olaylar', 'aria-selected')) === 'true' && !(await p.$eval('#panel-olaylar', (e) => e.hidden)));
    await p.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; scrollTo(0, 0); });
    const cls = await p.evaluate(async () => {
      let toplam = 0;
      const po = new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) toplam += e.value; });
      po.observe({ type: 'layout-shift', buffered: false });
      for (let y = 0; y <= 900; y += 60) { scrollTo(0, y); await new Promise((c) => requestAnimationFrame(() => setTimeout(c, 30))); }
      await new Promise((c) => setTimeout(c, 400));
      const c = document.getElementById('skor-cubugu'), u = document.querySelector('header.ust');
      const r = { acik: c.classList.contains('acik'), top: Math.round(c.getBoundingClientRect().top), ustGizli: document.documentElement.classList.contains('ust-gizli'), ustAlt: Math.round(u.getBoundingClientRect().bottom) };
      scrollBy(0, -40); await new Promise((c2) => setTimeout(c2, 400));
      r.yukari = { ustGizli: document.documentElement.classList.contains('ust-gizli'), top: Math.round(c.getBoundingClientRect().top), ustAlt: Math.round(u.getBoundingClientRect().bottom) };
      po.disconnect(); r.cls = toplam; return r;
    });
    kontrol('hareket: aşağı kaydırınca skor çubuğu açılır, üst bar gizlenir ve çubuk en üste kayar; yukarı kaydırınca üst bar geri gelir, çubuk altına iner; kayma (CLS) yok',
      cls.acik && cls.ustGizli && cls.top === 0 && cls.ustAlt <= 0 && !cls.yukari.ustGizli && cls.yukari.top === cls.yukari.ustAlt && cls.yukari.ustAlt > 0 && cls.cls < 0.01, JSON.stringify(cls));

    // ---- üst bar: odak üst bardayken gizlenmez; alt menü: açık sekmeye dokununca yeniden yüklenmez, başa kayar, odak main'e
    await git(p, 'index.html?sahte=1');
    await p.waitForSelector('#akis[data-durum="tamam"]');
    const ub = await p.evaluate(async () => {
      document.documentElement.style.scrollBehavior = 'auto';
      const bekle = (ms) => new Promise((c) => setTimeout(c, ms));
      const kaydir = async (y) => { scrollTo(0, y); await new Promise((c) => requestAnimationFrame(() => setTimeout(c, 40))); };
      await kaydir(3); const basta = document.documentElement.classList.contains('ust-gizli');
      for (let y = 0; y <= 800; y += 80) await kaydir(y);
      await bekle(50); const asagi = document.documentElement.classList.contains('ust-gizli');
      await kaydir(796); const esik = document.documentElement.classList.contains('ust-gizli');
      document.getElementById('profil-baglanti').focus({ preventScroll: true });
      await kaydir(900); await kaydir(1000); const odakta = document.documentElement.classList.contains('ust-gizli');
      document.getElementById('icerik').focus({ preventScroll: true });
      window.__yuklendi = 'evet';
      return { basta, asagi, esik, odakta };
    });
    kontrol('hareket: üst bar başta görünür, aşağı kaydırınca gizlenir, 8 px altı kıpırtıda değişmez, odak üst bardayken gizlenmez', !ub.basta && ub.asagi && ub.esik && !ub.odakta, JSON.stringify(ub));
    await p.evaluate(() => { for (let y = 0; y <= 800; y += 100) scrollTo(0, y); });
    await p.click('#alt-nav a[aria-current="page"]');
    await p.waitForFunction(() => scrollY === 0);
    const am = await p.evaluate(() => ({ ayni: window.__yuklendi === 'evet', odak: document.activeElement.id, y: scrollY }));
    kontrol('hareket: alt menüde açık sekmeye dokununca sayfa yeniden yüklenmez, en başa kayar, odak #icerik', am.ayni && am.odak === 'icerik' && am.y === 0, JSON.stringify(am));
    await git(p, 'mac.html?sahte=1&id=' + M1);
    await p.waitForSelector('#mac[data-durum="tamam"]');
    await Promise.all([p.waitForURL(/takim\.html/), p.click('#alt-nav a[aria-current="true"]')]);
    kontrol('hareket: ayrıntı sayfasında (aria-current="true") bölüm bağlantısı normal çalışır (Takım köküne gider)', /takim\.html$/.test(new URL(p.url()).pathname));

    // ---- maç: oynanmamış maçta ortada başlama saati (dev VS yok), maç notu + resmî duyuru satırı; bitince not yok; maç satırı tekrar yok
    await git(p, 'mac.html?sahte=1&id=11111111-0000-4000-8000-000000000003');
    await p.waitForSelector('#mac[data-durum="tamam"]');
    const mo = await p.evaluate(() => ({ orta: document.querySelector('#skor').textContent, saat: !!document.querySelector('#skor.mac-saat time'), denge: getComputedStyle(document.querySelector('.mac-basi h1 .takim-ad')).textWrap || getComputedStyle(document.querySelector('.mac-basi h1 .takim-ad')).textWrapStyle, not: document.querySelector('#mac-notu')?.textContent || '', kaynak: document.querySelector('#mac-notu-kaynak')?.textContent }));
    kontrol('son tur (tasarımcı 4): oynanmamış maçta ortada "19:00" saat kutusu (VS yok), takım adları text-wrap: balance', mo.saat && /^19:00/.test(mo.orta) && !/vs/i.test(mo.orta) && /balance/.test(mo.denge), JSON.stringify(mo));
    kontrol('son tur (başkan 5): maç notunun altında sabit "Kesin bilgi için kulübün resmî duyurusuna bak."', mo.kaynak === 'Kesin bilgi için kulübün resmî duyurusuna bak.' && /^Maç notu: /.test(mo.not), JSON.stringify(mo));
    await dbYaz(p, (db) => { const m = db.maclar.find((x) => x.id.endsWith('03')); m.durum = 'bitti'; m.corum_skor = 1; m.rakip_skor = 0; m.tarih = new Date(Date.now() - 60 * 864e5).toISOString(); });
    await git(p, 'mac.html?sahte=1&id=11111111-0000-4000-8000-000000000003');
    await p.waitForSelector('#mac[data-durum="tamam"]');
    kontrol('son tur (taraftar 2): biten maçta maç öncesi notu (bilet, kapı saati) gösterilmez', !(await p.$('#mac-notu')) && (await p.textContent('#mac-basi .rozet')) === 'Bitti');
    await git(p, 'mac.html?sahte=1&id=' + M1);
    await p.waitForSelector('#mac-golleri:not([hidden]) #gol-listesi .gol');
    kontrol('son tur (tasarımcı 2): maç sayfasındaki gol kartlarında maç satırı tekrar etmez', (await p.$$('#gol-listesi .meta')).length === 0 && (await p.$$('#gol-listesi .video-kart')).length >= 1);

    // ---- gol: düğme adı "Videoyu oynat: <başlık>" (tekrar yok), kapak fetchpriority=high, oynatınca fotoğraf künyesi gizli
    await git(p, 'gol.html?sahte=1&id=22222222-0000-4000-8000-000000000001');
    await p.waitForSelector('#gol[data-durum="tamam"] .video-baslat');
    const gf = await p.evaluate(() => ({ ad: document.querySelector('.video-baslat .gorunmez').textContent, fp: document.querySelector('.video-baslat img')?.getAttribute('fetchpriority'), atif: !!document.querySelector('.video .foto-atif:not([hidden])') }));
    kontrol('son tur (erişilebilirlik 2): facade adı "Videoyu oynat: Ali Örnek, 23. dakika, Örnekköy Spor maçı (0:42)" ("Gol videosu:" tekrarı yok)', gf.ad === 'Videoyu oynat: Ali Örnek, 23. dakika, Örnekköy Spor maçı (0:42)', gf.ad);
    kontrol('son tur (performans 2): gol sayfasının video kapağı (LCP) fetchpriority=high', gf.fp === 'high', gf.fp);
    await p.click('.video-baslat');
    await p.waitForSelector('.video iframe');
    const go = await p.evaluate(() => ({ atif: [...document.querySelectorAll('.video .foto-atif')].map((x) => x.hidden || getComputedStyle(x).display === 'none'), title: document.querySelector('.video iframe').title }));
    kontrol('son tur (taraftar 4): video oynayınca kapağın fotoğraf künyesi gizlenir; oynatıcının adı "Gol videosu: …"', go.atif.length === 1 && go.atif.every(Boolean) && /^Gol videosu: Ali Örnek, 23\. dakika/.test(go.title), JSON.stringify(go));
    await p.waitForSelector('#diger-goller-bolumu:not([hidden]) #diger-goller li');
    kontrol('son tur (tasarımcı 2): gol sayfasındaki "diğer goller" kartlarında maç satırı tekrar etmez', (await p.$$('#diger-goller .meta')).length === 0);

    // ---- performans 2: haber ve gol önce son görülen kayıttan çizilir, sonra ağdan; aynı kapak <img>'i yeniden kurulmaz
    await p.evaluate(() => { const k = 'son-veri-v1-sahte'; const v = JSON.parse(localStorage.getItem(k) || '{}'); delete v.haber; delete v.gol; localStorage.setItem(k, JSON.stringify(v)); });
    await git(p, 'index.html?sahte=1');
    await p.waitForSelector(AKIS);
    const h5 = '33333333-0000-4000-8000-000000000005';
    await git(p, 'haber.html?sahte=1&id=' + h5);
    await p.waitForSelector('#haber[data-durum="tamam"] #haber-metni p');
    const ilk = await p.evaluate(() => ({ durumlar: window.__durumlar, ayni: window.__ilkKapak === document.querySelector('#makale img.kapak-buyuk'), fp: document.querySelector('#makale img.kapak-buyuk')?.getAttribute('fetchpriority') }));
    kontrol('son tur (performans 2): haber ana sayfa listesindeki satırdan ANINDA çizilir (onbellek → tamam), kapak <img>\'i aynı düğüm',
      JSON.stringify(ilk.durumlar.slice(-2)) === '["onbellek","tamam"]' && ilk.ayni && ilk.fp === 'high', JSON.stringify(ilk));
    await git(p, 'haber.html?sahte=1&id=' + h5);
    await p.waitForSelector('#haber[data-durum="tamam"] #haber-metni p');
    const ikinci = await p.evaluate(() => ({ durumlar: window.__durumlar, kayit: (JSON.parse(localStorage.getItem('son-veri-v1-sahte')).haber || {}).veri.map((x) => x.id) }));
    kontrol('son tur (performans 2): açılan haber son görülen kayda yazılır, tekrar açılışta önce o çizilir', JSON.stringify(ikinci.durumlar.slice(-2)) === '["onbellek","tamam"]' && ikinci.kayit[0] === '33333333-0000-4000-8000-000000000005', JSON.stringify(ikinci));
    await git(p, 'gol.html?sahte=1&id=22222222-0000-4000-8000-000000000003');
    await p.waitForSelector('#gol[data-durum="tamam"] #video-not');
    const gc = await p.evaluate(() => ({ durumlar: window.__durumlar, ayni: window.__ilkKapak === document.querySelector('#gol .video-baslat img'), not: document.querySelector('#video-not').textContent }));
    kontrol('son tur (performans 2): gol ana sayfa şeridindeki satırdan anında çizilir (onbellek → tamam), kapak aynı düğüm, video notu ağdan', JSON.stringify(gc.durumlar.slice(-2)) === '["onbellek","tamam"]' && gc.ayni && /Video: /.test(gc.not), JSON.stringify(gc));

    // ---- başkan 3: düzeltme kutusunda tarih "Düzeltme (5 Kasım 2026, 14:20): …"
    await dbYaz(p, (db, id) => Object.assign(db.haberler.find((x) => x.id === id), { duzeltme_notu: 'Skor yanlış yazılmıştı.', duzeltme_tarihi: '2026-11-05T11:20:00Z' }), H1);
    await git(p, 'haber.html?sahte=1&id=' + H1);
    await p.waitForSelector('#haber[data-durum="tamam"] #haber-duzeltme');
    const dz = (await metin(p, '#haber-duzeltme'));
    kontrol('son tur (başkan 3): düzeltme kutusunda düzeltme tarihi (Türkiye saati) "Düzeltme (5 Kasım 2026, 14:20): …"', dz === 'Düzeltme (5 Kasım 2026, 14:20): Skor yanlış yazılmıştı.', dz);

    // ---- tasarımcı 6: sakatlık iki satır: kalın "Dönüş: …", soluk kaynak satırı; tarih parçaları bölünmez
    await git(p, 'takim.html?sahte=1#sakatlik');
    await p.waitForSelector('#sakatlik-icerik[data-durum="tamam"] .sakatlik');
    const sd = await p.evaluate(() => { const li = [...document.querySelectorAll('.sakatlik')].find((x) => x.querySelector('.donus')); const d = li && li.querySelector('.donus'); return li ? { donus: d.textContent, kalin: getComputedStyle(d).fontWeight, kaynak: li.querySelector('.kaynak').textContent, parca: [...li.querySelectorAll('.kaynak .parca')].map((x) => [x.textContent, getComputedStyle(x).whiteSpace]), ayri: d.getBoundingClientRect().bottom <= li.querySelector('.kaynak').getBoundingClientRect().top + 1 } : null; });
    kontrol('son tur (tasarımcı 6): sakatlıkta 1. satır kalın "Dönüş: 20 Kasım", 2. satır "Kaynak: … · tarih · Güncellendi …" (tarih parçaları nowrap)',
      sd && /^Dönüş: \d+ \S+$/.test(sd.donus) && Number(sd.kalin) >= 700 && sd.ayri && /^Kaynak: /.test(sd.kaynak) && !/dönüş/i.test(sd.kaynak) && sd.parca.length >= 2 && sd.parca.every(([t, w]) => /^· /.test(t) && w === 'nowrap'), JSON.stringify(sd));

    // ---- taraftar 3: Profil'de "Ana ekrana ekle" (yükleme olayı gelince), tarayıcının kendi onayı; yoksa gizli
    await git(p, 'profil.html?sahte=1');
    await p.waitForSelector('#profil[data-durum="tamam"]');
    const once = await p.evaluate(() => document.querySelector('#ana-ekran').hidden);
    await p.evaluate(() => { const e = new Event('beforeinstallprompt', { cancelable: true }); e.prompt = async () => { window.__soruldu = true; }; e.userChoice = Promise.resolve({ outcome: 'accepted' }); window.__olay = e; dispatchEvent(e); });
    const sonra = await p.evaluate(() => ({ bolum: document.querySelector('#ana-ekran').hidden, dugme: document.querySelector('#ana-ekran-ekle').hidden, engel: window.__olay.defaultPrevented, ad: document.querySelector('#ana-ekran-ekle').textContent }));
    await p.click('#ana-ekran-ekle');
    await p.waitForFunction(() => document.querySelector('#ana-ekran').hidden);
    const soruldu = await p.evaluate(() => window.__soruldu === true);
    kontrol('son tur (taraftar 3): Profil\'de "Ana ekrana ekle" yalnız tarayıcı yüklemeyi sununca görünür; dokununca tarayıcının kendi onayı (prompt), kabul edince gizlenir',
      once && !sonra.bolum && !sonra.dugme && sonra.engel && /^Ana ekrana ekle/.test(sonra.ad) && soruldu, JSON.stringify({ once, sonra, soruldu }));
    kontrol('son tur ön yüz sayfalarında JavaScript hatası yok', !hatalar.length, hatalar.join(' | '));
    await ctx.close();
    // yüklüyse (standalone) bölüm hiç açılmaz; iPhone'da (olay yok) "Paylaş › Ana Ekrana Ekle" ipucu
    const y = await baglam({ width: 360, height: 740 });
    await y.ctx.addInitScript(() => { const asil = window.matchMedia.bind(window); window.matchMedia = (q) => (q === '(display-mode: standalone)' ? { matches: true, media: q, addEventListener() {}, removeEventListener() {} } : asil(q)); });
    await git(y.p, 'profil.html?sahte=1');
    await y.p.waitForSelector('#profil[data-durum="tamam"]');
    await y.p.evaluate(() => { const e = new Event('beforeinstallprompt', { cancelable: true }); e.prompt = async () => {}; e.userChoice = Promise.resolve({ outcome: 'dismissed' }); dispatchEvent(e); });
    kontrol('son tur (taraftar 3): uygulama zaten yüklüyse (standalone) "Ana ekrana ekle" bölümü gizli', await y.p.evaluate(() => document.querySelector('#ana-ekran').hidden));
    await y.ctx.close();
    const ios = await baglam({ width: 390, height: 844 }, { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' });
    await git(ios.p, 'profil.html?sahte=1');
    await ios.p.waitForSelector('#profil[data-durum="tamam"]');
    const ii = await ios.p.evaluate(() => ({ bolum: document.querySelector('#ana-ekran').hidden, ipucu: document.querySelector('#ana-ekran-ios').hidden, dugme: document.querySelector('#ana-ekran-ekle').hidden, metin: document.querySelector('#ana-ekran-ios').textContent }));
    kontrol('son tur (taraftar 3): iPhone Safari\'de düğme yok, "Paylaş … Ana Ekrana Ekle" ipucu var (açılır pencere yok)', !ii.bolum && !ii.ipucu && ii.dugme && /Paylaş/.test(ii.metin) && /Ana Ekrana Ekle/.test(ii.metin), JSON.stringify(ii));
    await ios.ctx.close();
  });

  // ------------------------------------------------ son tur (performans 4): manşet kapağı varsayılan hero'nun yerine yalnız ÇÖZÜLDÜKTEN sonra,
  // tek seferde geçer; açılıştan 2,5 sn sonra hâlâ hazır değilse varsayılan fotoğraf kalır (ikinci görsel değişimi görünmez)
  await guvenli('son tur hero kapağı', async () => {
    for (const [gecikme, beklenen] of [[0, 'haber'], [3500, 'varsayilan']]) {
      const { ctx, p } = await baglam({ width: 390, height: 844 });
      await git(p, 'index.html?sahte=1');
      await p.waitForSelector(AKIS);
      await dbYaz(p, (db) => { const h = db.haberler.find((x) => x.id.endsWith('02')); h.kapak_url = 'assets/img/hattusa-aslanli-kapi-1600.webp'; h.kapak_kaynak = null; });
      await p.evaluate(() => { localStorage.removeItem('son-veri-v1-sahte'); });
      if (gecikme) await ctx.route(/hattusa-aslanli-kapi-\d+\.webp/, async (r) => { await new Promise((c) => setTimeout(c, gecikme)); await r.continue(); });
      await git(p, 'index.html?sahte=1');
      await p.waitForSelector('#hero[data-kapak]', { timeout: 10000 });
      const d = await p.evaluate(() => ({ kapak: document.querySelector('#hero').dataset.kapak, src: document.querySelector('#hero-gorsel').currentSrc, atif: document.querySelector('#hero-atif').textContent, atifGizli: document.querySelector('#hero-atif').hidden }));
      kontrol(`son tur (performans 4): manşet kapağı ${gecikme ? 'geç (3,5 sn) gelince varsayılan hero kalır' : 'çözülünce tek seferde hero olur (atfıyla)'}`,
        d.kapak === beklenen && (beklenen === 'haber' ? /hattusa-aslanli-kapi-\d+\.webp$/.test(d.src) && /Hattuşa|Hattusa|CC BY/.test(d.atif) : /tribun-kirmizi-siyah\.svg$/.test(d.src) && d.atifGizli), JSON.stringify(d));
      await ctx.close();
    }
  });

  // ------------------------------------------------ son tur: büyük yazı (32 px, 320×640): yapışkan alan ≤ %25, başlıklar kırpılmaz
  await guvenli('son tur büyük yazı', async () => {
    const { ctx, p } = await baglam({ width: 320, height: 640 });
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Page.enable');
    await cdp.send('Page.setFontSizes', { fontSizes: { standard: 32, fixed: 32 } });
    for (const [url, bekle] of [['goller.html?sahte=1', '#arsiv[data-durum="tamam"] .arsiv-mac'], ['takim.html?sahte=1', '#kadro-icerik[data-durum="tamam"]']]) {
      await git(p, url);
      await p.waitForSelector(bekle);
      await p.waitForTimeout(200);
      const d = await p.evaluate(() => { const e = document.querySelector('.filtreler, .sekme-yapiskan'); const b = (s) => document.querySelector(s).getBoundingClientRect().height; return { sinif: e.classList.contains('yapiskan-degil'), konum: getComputedStyle(e).position, toplam: Math.round(b('header.ust') + b('#alt-nav') + e.getBoundingClientRect().height), ekran: innerHeight }; });
      kontrol(`son tur (erişilebilirlik 3): ${url.split('?')[0]} 320×640 + 32 px yazı: üst bar + alt menü + çubuk ekranın %25'ini aşınca çubuk yapışkan değil`, d.toplam > d.ekran * 0.25 && d.sinif && d.konum === 'static', JSON.stringify(d));
    }
    await git(p, 'index.html?sahte=1');
    await p.waitForSelector(AKIS);
    await p.waitForSelector('#ikili-siradaki');
    const k = await p.evaluate(() => ({ sinif: document.documentElement.classList.contains('buyuk-yazi'), kirpik: [...document.querySelectorAll('.haber-satir h3, .video-kart .baslik')].filter((e) => { const c = getComputedStyle(e); return c.overflow !== 'visible' || (c.webkitLineClamp && c.webkitLineClamp !== 'none'); }).map((e) => e.textContent), clamp: getComputedStyle(document.querySelector('.haber-satir h3')).webkitLineClamp,
      ikili: getComputedStyle(document.querySelector('#mac-ikili')).gridTemplateColumns.split(' ').length }));
    kontrol('son tur (erişilebilirlik 5): büyük yazıda haber ve gol kartı başlıkları kırpılmaz (line-clamp yok); 019: ikili kart alt alta (tek sütun)', k.sinif && !k.kirpik.length && /none|unset/.test(k.clamp || 'none') && k.ikili === 1, JSON.stringify(k));
    await ctx.close();
  });

  // ------------------------------------------------ 017: yanıt (tek seviye), avatar (fotoğraf / baş harf), profil fotoğrafı yükleme
  await guvenli('yanıt ve profil fotoğrafı', async () => {
    const { ctx, p, hatalar } = await baglam({ width: 390, height: 844 });
    const H3 = '33333333-0000-4000-8000-000000000003';
    const Y4 = '44444444-0000-4000-8000-000000000004';
    const BURAK = 'bbbbbbbb-0000-4000-8000-000000000002', AYSE = 'bbbbbbbb-0000-4000-8000-000000000001';
    const depoAdresi = (yol) => 'https://sahte.supabase.co/storage/v1/object/public/profil-fotograflari/' + yol;
    // Misafir: örnek yanıt ana yorumun içinde, kime yanıt verildiği okunur, sayaç yanıtı da sayar, avatar baş harf
    await git(p, 'haber.html?sahte=1&id=' + H3);
    await p.waitForSelector('#yorum-listesi .yorum');
    const misafir = await p.evaluate(() => {
      const ust = [...document.querySelectorAll('#yorum-listesi > li.yorum')];
      const yanit = document.querySelector('#yorum-listesi > li.yorum > .yorum-govde > ol.yanitlar > li.yorum');
      const av = ust[0] && ust[0].querySelector('.avatar');
      return { ust: ust.length, yanit: yanit && yanit.querySelector('.yorum-metni').textContent, kime: yanit && yanit.querySelector('.yanit-kime').textContent.replace(/\s+/g, ' ').trim(),
        baslik: document.getElementById('yorum-baslik').textContent, avatar: av && av.tagName + ':' + av.textContent, dugme: document.querySelectorAll('#yorum-listesi button').length };
    });
    kontrol('yanıt (017): örnek yanıt ana yorumun içinde (ol.yanitlar), "↳ yanıt: burak" okunur, sayaç yanıtı da sayar',
      misafir.ust === 1 && /erken gidersen/.test(misafir.yanit || '') && /yanıt: burak/.test(misafir.kime || '') && misafir.baslik === 'Yorumlar (2)', JSON.stringify(misafir));
    kontrol('yanıt (017): fotoğrafı olmayanın avatarı baş harf; misafirde "Yanıtla" yok', misafir.avatar === 'SPAN:B' && misafir.dugme === 0, JSON.stringify(misafir));

    // burak (ana yorumun yazarı) kendi yorumuna yanıt yazar: form, odak, Vazgeç, boş / uzun yanıt hatası
    await girisYap(p, 'burak@ornek.test', 'haber.html?id=' + H3);
    await p.waitForSelector('#yorum-listesi .yorum');
    const ana = p.locator('#yorum-listesi > li.yorum').first();
    const anaYanitla = ana.locator('.yorum-eylem').first().getByRole('button', { name: 'Yanıtla' });
    await anaYanitla.click();
    const alan = ana.locator('textarea[id^="yanit-metni-"]');
    kontrol('yanıt (017): "Yanıtla" yorumun altında görünür etiketli ("Yanıtın") form açar, odak yazma alanında',
      (await alan.count()) === 1 && await p.evaluate(() => /^yanit-metni-/.test(document.activeElement.id) && document.activeElement.labels[0].textContent === 'Yanıtın'));
    await ana.getByRole('button', { name: 'Vazgeç' }).click();
    kontrol('yanıt (017): Vazgeç formu kapatır, odak "Yanıtla" düğmesine döner', (await alan.count()) === 0 && await p.evaluate(() => document.activeElement.textContent === 'Yanıtla'));
    await anaYanitla.click();
    await ana.getByRole('button', { name: 'Gönder' }).click();
    const yanitHata = ana.locator('[id^="yanit-hata-"]');
    kontrol('yanıt (017): boş yanıt Türkçe hata, alan aria-invalid', /Boş yanıt/.test(await yanitHata.textContent()) && (await alan.getAttribute('aria-invalid')) === 'true', await yanitHata.textContent());
    await alan.fill('x'.repeat(1001));
    await ana.getByRole('button', { name: 'Gönder' }).click();
    kontrol('yanıt (017): 1000 karakter sınırı Türkçe hata', /en fazla 1000 karakter/.test(await yanitHata.textContent()), await yanitHata.textContent());
    await alan.fill('Kuyruk yarım saat sürdü.');
    await ana.getByRole('button', { name: 'Gönder' }).click();
    await p.waitForFunction(() => /yarım saat/.test(document.querySelector('#yorum-listesi ol.yanitlar').textContent));
    const sonra = await p.evaluate(() => ({
      metinler: [...document.querySelectorAll('#yorum-listesi > li.yorum ol.yanitlar > li .yorum-metni')].map((x) => x.textContent),
      baslik: document.getElementById('yorum-baslik').textContent, ust: document.querySelectorAll('#yorum-listesi > li.yorum').length, odak: document.activeElement.textContent }));
    kontrol('yanıt (017): yeni yanıt ana yorumun altında en sonda (eskiden yeniye), sayaç 3, odak "Yanıtla"da',
      sonra.ust === 1 && sonra.metinler.length === 2 && sonra.metinler[1] === 'Kuyruk yarım saat sürdü.' && sonra.baslik === 'Yorumlar (3)' && sonra.odak === 'Yanıtla', JSON.stringify(sonra));
    // Yanıtın yanıtı: alan "@ad " ile başlar; sunucu (sahte) ana yoruma bağlar, hedefi ana yorumdan kopyalar
    const ilkYanit = p.locator('#yorum-listesi ol.yanitlar > li.yorum').first();
    await ilkYanit.getByRole('button', { name: 'Yanıtla' }).click();
    const ic = ilkYanit.locator('textarea');
    kontrol('yanıt (017): yanıtın yanıtında da "Yanıtla"; alan "@ayse_19 " ile başlar', (await ic.inputValue()) === '@ayse_19 ', await ic.inputValue());
    await ic.fill('@ayse_19 Teşekkürler!');
    await ilkYanit.getByRole('button', { name: 'Gönder' }).click();
    await p.waitForFunction(() => /Teşekkürler/.test(document.querySelector('#yorum-listesi ol.yanitlar').textContent));
    const kayit = await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('sahte-db-v1')); const y = d.yorumlar.find((x) => /Teşekkürler/.test(x.metin)); return { ust: y.ust_yorum_id, haber: y.haber_id }; });
    kontrol('yanıt (017): yanıtın yanıtı ana yoruma bağlandı (tek seviye), hedef ana yorumdan', kayit.ust === Y4 && kayit.haber === H3, JSON.stringify(kayit));
    const tasima = await p.evaluate(async (id) => {
      const { supabase } = await import('/assets/istemci.js');
      const d = JSON.parse(localStorage.getItem('sahte-db-v1'));
      const y = d.yorumlar.find((x) => /Teşekkürler/.test(x.metin));
      const r = await supabase.from('yorumlar').update({ ust_yorum_id: null }).eq('id', y.id);
      const g = await supabase.from('yorumlar').insert({ haber_id: id, metin: 'yok', ust_yorum_id: '44444444-0000-4000-8000-0000000000ff' });
      return { tasima: r.error && r.error.message, yok: g.error && g.error.message };
    }, H3);
    kontrol('yanıt (017): yanıt başka yere taşınamaz; olmayan yoruma yanıt Türkçe "bulunamadı"', /değiştirilemez/.test(tasima.tasima || '') && /bulunamadı/.test(tasima.yok || ''), JSON.stringify(tasima));
    // Sıralama yalnız ana yorumları çevirir (yanıtlar ana yorumun içinde eskiden yeniye kalır); yenileyince de aynı
    await git(p, 'haber.html?id=' + H3);
    await p.waitForSelector('#yorum-formu');
    await yorumGonder(p, 'Ben de gidiyorum.');
    await p.click('#yorum-siralama button[data-sira="eski"]');
    const sira = await p.evaluate(() => ({ ust: [...document.querySelectorAll('#yorum-listesi > li.yorum')].map((li) => li.querySelector('.yorum-metni').textContent),
      yanit: [...document.querySelectorAll('#yorum-listesi ol.yanitlar > li .yorum-metni')].map((x) => x.textContent) }));
    kontrol('yanıt (017): "En eski" yalnız ana yorumları çevirir, yanıtlar içeride eskiden yeniye kalır',
      sira.ust.join('|') === 'Bilet kuyruğu uzun mu, bilen var mı?|Ben de gidiyorum.' && sira.yanit.length === 3 && /erken gidersen/.test(sira.yanit[0]) && /Teşekkürler/.test(sira.yanit[2]), JSON.stringify(sira));
    // Ana yorum silinince yanıtlarıyla gider (DOM ve sahte veritabanı)
    await p.locator('#yorum-listesi > li.yorum', { hasText: 'Bilet kuyruğu' }).locator('.yorum-eylem').first().getByRole('button', { name: 'Sil' }).click();
    await p.waitForFunction(() => !/Bilet kuyruğu/.test(document.querySelector('#yorum-listesi').textContent));
    const silme = await p.evaluate((id) => ({ metin: document.querySelector('#yorum-listesi').textContent, baslik: document.getElementById('yorum-baslik').textContent,
      db: JSON.parse(localStorage.getItem('sahte-db-v1')).yorumlar.filter((x) => x.haber_id === id).length }), H3);
    kontrol('yanıt (017): ana yorum silinince yanıtları da DOM\'dan ve veritabanından gider', !/Teşekkürler|erken gidersen|yarım saat/.test(silme.metin) && silme.baslik === 'Yorumlar (1)' && silme.db === 1, JSON.stringify(silme));

    // Profil fotoğrafı: yükle (256 px'e küçülür, WebP, <uid>/<uuid>.webp), değiştir (eski dosya silinir), yorumda img, kaldır
    await git(p, 'profil.html');
    await p.waitForSelector('#profil[data-durum="tamam"]');
    kontrol('profil fotoğrafı (017): fotoğraf yokken baş harf, "Fotoğraf yükle" ve kural notu, "kaldır" yok',
      (await metin(p, '#profil .profil-avatar')) === 'B' && (await metin(p, '#profil-foto-yukle')) === 'Fotoğraf yükle' && /kulüp arması/.test(await metin(p, '#profil-foto-kural')) && !(await p.isVisible('#profil-foto-kaldir')));
    const fotoPng = Buffer.from(await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 800; c.height = 600; const x = c.getContext('2d'); x.fillStyle = '#CC0000'; x.fillRect(0, 0, 800, 600); return c.toDataURL('image/png').split(',')[1]; }), 'base64');
    await p.setInputFiles('#profil-foto-dosya', { name: 'ben.png', mimeType: 'image/png', buffer: fotoPng });
    await p.waitForFunction(() => /güncellendi/.test(document.getElementById('profil-foto-mesaj').textContent), null, { timeout: 15000 });
    const foto = await p.evaluate(async () => {
      const d = JSON.parse(localStorage.getItem('sahte-db-v1'));
      const pr = d.profiles.find((x) => x.kullanici_adi === 'burak');
      const yol = (pr.foto_url || '').split('/storage/v1/object/public/')[1] || '';
      const veri = localStorage.getItem('sahte-depo-v1:' + yol) || '';
      const im = new Image(); im.src = veri; await im.decode().catch(() => {});
      const ekran = document.querySelector('#profil .profil-avatar img');
      if (ekran && !ekran.complete) await Promise.race([new Promise((r) => { ekran.addEventListener('load', r, { once: true }); ekran.addEventListener('error', r, { once: true }); }), new Promise((r) => setTimeout(r, 3000))]);
      return { url: pr.foto_url, yol, tur: (/^data:([^;]+)/.exec(veri) || [])[1], w: im.naturalWidth, h: im.naturalHeight, alt: ekran && ekran.getAttribute('alt'), yuklendi: !!ekran && ekran.naturalWidth > 0,
        dugme: document.getElementById('profil-foto-yukle').textContent, odak: document.activeElement.id };
    });
    kontrol('profil fotoğrafı (017): yüklemeden önce 256 px\'e küçültüldü, WebP, <kullanıcı id>/<uuid>.webp yolunda',
      new RegExp(`/profil-fotograflari/${BURAK}/[0-9a-f-]{36}\\.webp$`).test(foto.url || '') && foto.tur === 'image/webp' && foto.w === 256 && foto.h === 192, JSON.stringify(foto));
    kontrol('profil fotoğrafı (017): profilde img (alt "Profil fotoğrafın", açılıyor), düğme "Fotoğrafı değiştir", odak düğmede',
      foto.alt === 'Profil fotoğrafın' && foto.yuklendi && foto.dugme === 'Fotoğrafı değiştir' && foto.odak === 'profil-foto-yukle' && await p.isVisible('#profil-foto-kaldir'), JSON.stringify(foto));
    await p.setInputFiles('#profil-foto-dosya', { name: 'ben2.png', mimeType: 'image/png', buffer: PNG });
    await p.waitForFunction((y) => { const pr = JSON.parse(localStorage.getItem('sahte-db-v1')).profiles.find((x) => x.kullanici_adi === 'burak'); return !!pr.foto_url && !pr.foto_url.endsWith(y); }, foto.yol);
    await p.waitForFunction((y) => !localStorage.getItem('sahte-depo-v1:' + y), foto.yol, { timeout: 3000 }).catch(() => {});
    kontrol('profil fotoğrafı (017): değiştirince eski dosya depodan silindi', await p.evaluate((y) => !localStorage.getItem('sahte-depo-v1:' + y), foto.yol));
    const guv = await p.evaluate(async ([ben, baska, adres]) => {
      const { supabase } = await import('/assets/istemci.js');
      const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' });
      const yukle = await supabase.storage.from('profil-fotograflari').upload(baska + '/x.webp', blob, { contentType: 'image/webp' });
      const dis = await supabase.from('profiles').update({ foto_url: 'https://baska-site.com/x.webp' }).eq('id', ben);
      const klasor = await supabase.from('profiles').update({ foto_url: adres }).eq('id', ben);
      const okunur = await supabase.from('profiles').select('id, foto_url').eq('id', ben).maybeSingle();
      return { yukle: !!yukle.error, dis: dis.error && dis.error.message, klasor: klasor.error && klasor.error.message, okunur: !!(okunur.data && okunur.data.foto_url) };
    }, [BURAK, AYSE, depoAdresi(AYSE + '/x.webp')]);
    kontrol('profil fotoğrafı (017): başkasının klasörüne yükleme ve başka adres / başkasının klasörü (profiles_foto) reddedilir; foto_url herkese okunur',
      guv.yukle && /profiles_foto/.test(guv.dis || '') && /profiles_foto/.test(guv.klasor || '') && guv.okunur, JSON.stringify(guv));
    // Yorumda: fotoğraflı yorumcuda img.avatar; açılmayan fotoğrafta baş harfe döner
    await p.evaluate(([ayse, h3, adres]) => {
      const d = JSON.parse(localStorage.getItem('sahte-db-v1'));
      d.profiles.find((x) => x.id === ayse).foto_url = adres; // depoda yok: açılmaz
      d.yorumlar.push({ id: '44444444-0000-4000-8000-0000000000aa', kullanici_id: ayse, haber_id: h3, mac_id: null, gol_id: null, ust_yorum_id: null, metin: 'Fotoğrafı açılmayan yorumcu', gizli: false, onay_bekliyor: false,
        gizleme_nedeni: null, moderasyon_zamani: null, created_at: new Date(Date.now() - 3600e3).toISOString(), duzenlendi: null });
      localStorage.setItem('sahte-db-v1', JSON.stringify(d));
    }, [AYSE, H3, depoAdresi(AYSE + '/yok.webp')]);
    await git(p, 'haber.html?id=' + H3);
    await p.waitForSelector('#yorum-listesi .yorum img.avatar');
    const av = await p.evaluate(() => { const i = document.querySelector('#yorum-listesi .yorum img.avatar'); return { alt: i.getAttribute('alt'), w: i.getAttribute('width'), lazy: i.getAttribute('loading'), co: i.getAttribute('crossorigin') }; });
    kontrol('avatar (017): fotoğraflı yorumcuda img.avatar (alt="", 36×36, lazy, crossorigin)', av.alt === '' && av.w === '36' && av.lazy === 'lazy' && av.co === 'anonymous', JSON.stringify(av));
    const kirik = p.locator('#yorum-listesi > li.yorum', { hasText: 'Fotoğrafı açılmayan' });
    await kirik.scrollIntoViewIfNeeded();
    await p.waitForFunction(() => { const li = [...document.querySelectorAll('#yorum-listesi > li.yorum')].find((x) => /Fotoğrafı açılmayan/.test(x.textContent)); return li && li.querySelector('span.avatar'); }, null, { timeout: 4000 }).catch(() => {});
    kontrol('avatar (017): açılmayan fotoğraf baş harfe döner (satır içi işleyici yok)', (await kirik.locator('span.avatar').textContent().catch(() => '')) === 'A' && (await kirik.locator('img').count()) === 0);
    // Kaldır (onaylı): veri null, dosya silinir, baş harf, odak "Fotoğraf yükle"de
    await git(p, 'profil.html');
    await p.waitForSelector('#profil[data-durum="tamam"] #profil-foto-kaldir');
    const sonYol = await p.evaluate(() => JSON.parse(localStorage.getItem('sahte-db-v1')).profiles.find((x) => x.kullanici_adi === 'burak').foto_url.split('/storage/v1/object/public/')[1]);
    await p.click('#profil-foto-kaldir');
    await p.waitForFunction(() => /kaldırıldı/.test(document.getElementById('profil-foto-mesaj').textContent));
    await p.waitForFunction((y) => !localStorage.getItem('sahte-depo-v1:' + y), sonYol, { timeout: 3000 }).catch(() => {});
    const kaldir = await p.evaluate((y) => ({ url: JSON.parse(localStorage.getItem('sahte-db-v1')).profiles.find((x) => x.kullanici_adi === 'burak').foto_url, dosya: !!localStorage.getItem('sahte-depo-v1:' + y),
      harf: document.querySelector('#profil .profil-avatar').textContent, odak: document.activeElement.id, kaldirGizli: document.getElementById('profil-foto-kaldir').hidden }), sonYol);
    kontrol('profil fotoğrafı (017): kaldırınca veri boş, dosya silindi, baş harf, odak "Fotoğraf yükle"de', kaldir.url === null && !kaldir.dosya && kaldir.harf === 'B' && kaldir.odak === 'profil-foto-yukle' && kaldir.kaldirGizli, JSON.stringify(kaldir));

    // Yönetici: Yorumlar sekmesinde fotoğraf önizlemesi ve "Profil fotoğrafını kaldır"
    await p.evaluate(([ben, adres, yol, png]) => {
      const d = JSON.parse(localStorage.getItem('sahte-db-v1'));
      d.profiles.find((x) => x.id === ben).foto_url = adres;
      localStorage.setItem('sahte-db-v1', JSON.stringify(d));
      localStorage.setItem('sahte-depo-v1:profil-fotograflari/' + yol, 'data:image/png;base64,' + png);
    }, [BURAK, depoAdresi(BURAK + '/uygunsuz.png'), BURAK + '/uygunsuz.png', PNG.toString('base64')]);
    await cikis(p);
    await girisYap(p, 'yonetici@ornek.test', 'yonetim.html');
    await p.waitForSelector('#panel:not([hidden])');
    await p.click('#sekme-yorumlar');
    await p.waitForSelector('#yorum-moderasyon li');
    const satir = p.locator('#yorum-moderasyon li', { hasText: 'Ben de gidiyorum.' });
    kontrol('yönetim (017): yorum sahibinin fotoğrafı küçük önizleme (anlamlı alt) ve "Profil fotoğrafını kaldır"',
      (await satir.locator('img.avatar').getAttribute('alt')) === 'burak kullanıcısının profil fotoğrafı' && (await satir.getByRole('button', { name: 'Profil fotoğrafını kaldır' }).count()) === 1);
    await satir.getByRole('button', { name: 'Profil fotoğrafını kaldır' }).click();
    await p.waitForFunction(() => /profil fotoğrafı kaldırıldı/.test(document.querySelector('#panel-mesaj').textContent));
    await p.waitForFunction(() => !localStorage.getItem('sahte-depo-v1:profil-fotograflari/bbbbbbbb-0000-4000-8000-000000000002/uygunsuz.png'), null, { timeout: 3000 }).catch(() => {});
    const yon = await p.evaluate(([ben, adres]) => ({ url: JSON.parse(localStorage.getItem('sahte-db-v1')).profiles.find((x) => x.id === ben).foto_url, dosya: !!localStorage.getItem('sahte-depo-v1:profil-fotograflari/' + ben + '/uygunsuz.png') }), [BURAK, '']);
    const koyma = await p.evaluate(async ([ben, adres]) => {
      const { supabase } = await import('/assets/istemci.js');
      const r = await supabase.from('profiles').update({ foto_url: adres }).eq('id', ben);
      return r.error && r.error.message;
    }, [BURAK, depoAdresi(BURAK + '/baska.webp')]);
    kontrol('yönetim (017): fotoğraf kaldırıldı (veri boş, dosya silindi); yönetici başkasına fotoğraf koyamaz', yon.url === null && !yon.dosya && /yalnız kaldırabilir/.test(koyma || ''), JSON.stringify({ yon, koyma }));

    // Onaysız e-posta: düğme yerine açıklama
    await cikis(p);
    await girisYap(p, 'onaysiz@ornek.test', 'profil.html');
    await p.waitForSelector('#profil[data-durum="tamam"]');
    kontrol('profil fotoğrafı (017): onaysız hesapta düğme yok, "e-posta adresini onayla" açıklaması', !(await p.$('#profil-foto-yukle')) && /e-posta adresini onayla/.test(await metin(p, '#profil-foto-not')), await metin(p, '#profil-foto'));
    kontrol('yanıt ve profil fotoğrafı sayfalarında JavaScript hatası yok', !hatalar.length, hatalar.join(' | '));
    await ctx.close();
  });

  // ------------------------------------------------ 019: kadro dönüş konumu, piyasa değeri, olay çizelgesi (rakip golleri), Takvime ekle,
  // fikstür takvimi + önizleme penceresi (klavye), Golü tekrar izle
  await guvenli('019 ön yüz', async () => {
    const { ctx, p, hatalar } = await baglam({ width: 390, height: 844 }, { acceptDownloads: true });
    const M2 = '11111111-0000-4000-8000-000000000002', M3 = '11111111-0000-4000-8000-000000000003';
    // ---- Kadro: Forvet'ten oyuncuya gir, geri dön → aynı kaydırma yeri (veri ağdan sonra gelse de)
    await git(p, 'takim.html?sahte=1#kadro');
    await p.waitForSelector('#kadro-icerik[data-durum="tamam"] a.oyuncu-kart');
    const hedef = '#kadro-icerik a[data-oyuncu-id="55555555-0000-4000-8000-000000000008"]';
    await p.$eval(hedef, (a) => a.scrollIntoView({ block: 'center' }));
    // Kartın ekrandaki yeri karşılaştırılır (tarayıcının kaydırma çapası üstte birkaç px büyüyen içerikte scrollY'yi kaydırabilir)
    const yer = () => p.$eval(hedef, (a) => ({ y: Math.round(scrollY), ust: Math.round(a.getBoundingClientRect().top) }));
    const y0 = await yer();
    // bfcache'i kapat (pageshow'la eski sayfa geri gelmesin; asıl yol: sayfa yeniden açılır, veri ağdan sonra gelir)
    await p.evaluate(() => addEventListener('unload', () => {}));
    await p.click(hedef);
    await p.waitForSelector('#oyuncu[data-durum="tamam"]');
    await p.goBack();
    await p.waitForSelector('#kadro-icerik[data-durum="tamam"] a.oyuncu-kart');
    await p.waitForFunction((u) => Math.abs(document.querySelector('#kadro-icerik a[data-oyuncu-id="55555555-0000-4000-8000-000000000008"]').getBoundingClientRect().top - u) <= 6, y0.ust, { timeout: 4000 }).catch(() => {});
    const y1 = await yer();
    kontrol('019: Kadro → oyuncu → geri: kaydırma yeri korunur (aynı kart ekranda aynı yerde; Kaleciler\'e atmaz)', y0.y > 0 && y1.y > 0 && Math.abs(y1.ust - y0.ust) <= 6, JSON.stringify({ y0, y1 }));
    kontrol('019: kadro kartlarında piyasa değeri yok (sade)', !/€/.test(await metin(p, '#kadro-icerik')));

    // ---- Oyuncu: piyasa değeri kutusu (yalnız girilmişse)
    await git(p, 'oyuncu.html?sahte=1&id=55555555-0000-4000-8000-000000000007');
    await p.waitForSelector('#oyuncu[data-durum="tamam"]');
    const pd = { deger: await metin(p, '#piyasa-degeri .piyasa-deger'), kaynak: await metin(p, '#piyasa-degeri .piyasa-kaynak') };
    await git(p, 'oyuncu.html?sahte=1&id=55555555-0000-4000-8000-000000000001');
    await p.waitForSelector('#oyuncu[data-durum="tamam"]');
    pd.yok = !(await p.$('#piyasa-degeri'));
    kontrol('019: oyuncu sayfasında "3,00 Mn €" + "Transfermarkt\'a göre, 30 Eylül 2026"; değer yoksa kutu hiç yok', pd.deger === '3,00 Mn €' && pd.kaynak === "Transfermarkt'a göre, 30 Eylül 2026" && pd.yok, JSON.stringify(pd));

    // ---- Maç Olaylar: skor 2 – 1 = 2 Çorum FK golü + 1 rakip golü; tam genişlik satır; taraf rozeti (yazı)
    await git(p, `mac.html?sahte=1&id=${M1}#olaylar`);
    await p.waitForSelector('#olaylar[data-durum="tamam"] #olay-cizelge');
    const ol = await p.evaluate(() => {
      const l = [...document.querySelectorAll('#olay-cizelge .olay')];
      const g = document.querySelector('#olay-cizelge').getBoundingClientRect();
      return {
        biz: l.filter((x) => x.matches('.olay-gol')).length, rakip: l.filter((x) => x.matches('.olay-rakip_gol')).length,
        rozetler: [...new Set(l.map((x) => x.querySelector('.taraf-rozet').textContent.replace(/^\s*·\s*/, '').trim()))],
        tamGenis: l.every((x) => Math.abs(x.getBoundingClientRect().width - g.width) <= 1),
        satir: l.filter((x) => x.matches('.olay-gol, .olay-rakip_gol')).map((x) => { const b = x.querySelector('b'); return Math.round(b.getBoundingClientRect().height / (parseFloat(getComputedStyle(b).lineHeight) || 20)); }),
        not: document.querySelector('#olay-not').textContent,
      };
    });
    kontrol('019: Olaylar: skor 2 – 1 = çizelgede 2 Çorum FK + 1 rakip golü; satırlar tam genişlik, "Çorum FK" / "Örnekköy Spor" rozetleri, adlar tek satır',
      ol.biz === 2 && ol.rakip === 1 && ol.tamGenis && ol.rozetler.includes('Çorum FK') && ol.rozetler.includes('Örnekköy Spor') && ol.satir.every((n) => n <= 1) && !/henüz yok/.test(ol.not), JSON.stringify(ol));
    kontrol('019: biten maçta "Takvime ekle" yok', !(await p.$('#takvime-ekle')));
    await git(p, `mac.html?sahte=1&id=${M2}#olaylar`);
    await p.waitForSelector('#olaylar[data-durum="tamam"]');
    const not2 = await metin(p, '#olay-not');
    kontrol('019: rakip golü girilmemiş maçta okuyan aramasın: "Çizelgede henüz yok: Kurgu Gençlik 1 gol"', /Çizelgede henüz yok: Kurgu Gençlik 1 gol/.test(not2), not2);

    // ---- Maç sayfası: Takvime ekle (.ics tarayıcıda; dış istek yok)
    await git(p, `mac.html?sahte=1&id=${M3}`);
    await p.waitForSelector('#takvime-ekle');
    const [indir] = await Promise.all([p.waitForEvent('download'), p.click('#takvime-ekle')]);
    const ics = fs.readFileSync(await indir.path(), 'utf8');
    const acik = ics.replace(/\r\n /g, '');
    kontrol('019: "Takvime ekle" .ics: dosya adı, 16:00Z başlangıç + 2 saat, başlık "Çorum FK – Deneme FK", yer, maç sayfası adresi, CRLF',
      /^corum-fk-deneme-fk-\d{4}-\d{2}-\d{2}\.ics$/.test(indir.suggestedFilename()) && /\r\nDTSTART:\d{8}T160000Z\r\n/.test(acik) && /\r\nDTEND:\d{8}T180000Z\r\n/.test(acik)
      && /\r\nSUMMARY:Çorum FK – Deneme FK\r\n/.test(acik) && /\r\nLOCATION:Çorum Şehir Stadyumu\r\n/.test(acik) && acik.includes(`mac.html?sahte=1&id=${M3}`) && !/[^\r]\n/.test(ics), acik.slice(0, 600));

    // ---- Fikstür → Takvim: segment, ay ızgarası, gün düğmesi, önizleme penceresi (klavye), geri dönüşte görünüm korunur
    await git(p, 'takim.html?sahte=1#fikstur');
    await p.waitForSelector('#gelecek[data-durum="tamam"]');
    await p.click('#fikstur-gorunum [data-gorunum="takvim"]');
    await p.waitForSelector('#takvim-izgara');
    const tk = await p.evaluate(() => ({
      basili: document.querySelector('[data-gorunum="takvim"]').getAttribute('aria-pressed'), liste: document.querySelector('#fikstur-liste').hidden,
      th: document.querySelectorAll('.takvim-izgara th').length, ay: document.querySelector('#takvim-ay').textContent, durum: document.querySelector('#durum').textContent,
      gunler: [...document.querySelectorAll('.takvim-gun')].map((b) => ({ sinif: b.className, ad: b.getAttribute('aria-label'), isaret: b.querySelector('.takvim-isaret').textContent, w: Math.round(b.getBoundingClientRect().width), h: Math.round(b.getBoundingClientRect().height) })),
    }));
    kontrol('019: Fikstür → Takvim: aria-pressed, liste gizli, 7 gün başlığı, #durum duyurur; maç günü ≥ 44×44, iç saha "İ" / deplasman "D", adı maçı söyler',
      tk.basili === 'true' && tk.liste && tk.th === 7 && /Takvim görünümü/.test(tk.durum) && tk.gunler.length >= 1
      && tk.gunler.every((g) => g.w >= 44 && g.h >= 44 && (/\bic\b/.test(g.sinif) ? g.isaret === 'İ' : g.isaret === 'D') && /Çorum FK/.test(g.ad)), JSON.stringify(tk));
    if ((await p.getAttribute('#takvim-onceki', 'aria-disabled')) !== 'true') {
      const ay0 = await metin(p, '#takvim-ay');
      await p.click('#takvim-onceki');
      const gz = await p.evaluate(() => ({ ay: document.querySelector('#takvim-ay').textContent, odak: document.activeElement.id }));
      kontrol('019: takvimde önceki ay düğmesi ayı değiştirir, odak düğmede kalır', gz.ay !== ay0 && gz.odak === 'takvim-onceki', JSON.stringify({ ay0, gz }));
      await p.click('#takvim-sonraki');
    }
    await p.focus('.takvim-gun[aria-label*="Deneme FK"]');
    await p.keyboard.press('Enter');
    await p.waitForSelector('#takvim-onizleme[open]');
    const dl = await p.evaluate(() => ({
      odak: document.activeElement.textContent, inert: ['#icerik', '#alt-nav', 'header.ust'].every((s) => document.querySelector(s).hasAttribute('inert')),
      metin: document.querySelector('#takvim-onizleme').textContent.replace(/\s+/g, ' '), ekle: !!document.querySelector('#takvim-onizleme .takvime-ekle'),
    }));
    await p.keyboard.press('Escape');
    await p.waitForFunction(() => !document.querySelector('#takvim-onizleme[open]'));
    const kapali = await p.evaluate(() => ({ odakGun: document.activeElement.classList.contains('takvim-gun'), inert: document.querySelector('#icerik').hasAttribute('inert') }));
    kontrol('019: takvim günü (Enter) alttan pencere açar: maç, 19:00, stadyum, odak "Maç sayfası", "Takvime ekle"; arka plan inert; Esc kapatır, odak güne döner',
      dl.odak === 'Maç sayfası' && dl.inert && /Deneme FK/.test(dl.metin) && /19:00/.test(dl.metin) && /Çorum Şehir Stadyumu/.test(dl.metin) && dl.ekle && kapali.odakGun && !kapali.inert, JSON.stringify({ dl, kapali }));
    await p.click('.takvim-gun[aria-label*="Deneme FK"]');
    await p.click('#takvim-onizleme a.dugme');
    await p.waitForSelector('#mac[data-durum="tamam"]');
    await p.goBack();
    await p.waitForSelector('#takvim-izgara');
    kontrol('019: maç sayfasından geri dönünce Takvim görünümü açık kalır', (await p.getAttribute('[data-gorunum="takvim"]', 'aria-pressed')) === 'true');

    // ---- Gol: "Golü tekrar izle" (iframe aynı start/end ile yeniden kurulur)
    await dbYaz(p, (db) => { const g = db.goller.find((x) => x.id.endsWith('0001')); g.video_baslangic_sn = 5; g.video_bitis_sn = 47; });
    await git(p, 'gol.html?sahte=1&id=22222222-0000-4000-8000-000000000001');
    await p.waitForSelector('#gol[data-durum="tamam"] .video-baslat');
    const once = !!(await p.$('#video-tekrar'));
    await p.click('.video-baslat');
    await p.waitForSelector('#video-tekrar');
    const src1 = await p.getAttribute('.video iframe', 'src');
    const eski = await p.$('.video iframe');
    await p.focus('#video-tekrar');
    await p.keyboard.press('Enter');
    const gt = await p.evaluate((e) => {
      const f = document.querySelector('.video iframe');
      const v = document.querySelector('.gol-makale > .video').getBoundingClientRect(), t = document.querySelector('#video-tekrar').getBoundingClientRect();
      return { yeni: f !== e, src: f.getAttribute('src'), odak: document.activeElement.id, ad: document.querySelector('#video-tekrar').textContent, durum: document.querySelector('#durum').textContent, altinda: t.top >= v.bottom - 1, h: Math.round(t.height) };
    }, eski);
    kontrol('019: "Golü tekrar izle": oynatmadan önce yok; oynatınca videonun altında (≥44 px); iframe yeniden kurulur, aynı start=5&end=47; odak düğmede; #durum duyurur',
      !once && gt.yeni && gt.src === src1 && /&start=5&end=47$/.test(gt.src) && gt.odak === 'video-tekrar' && /Golü tekrar izle/.test(gt.ad) && /golün başından/.test(gt.durum) && gt.altinda && gt.h >= 44, JSON.stringify(gt));
    kontrol('019 sayfalarında JavaScript hatası yok', !hatalar.length, hatalar.join(' | '));
    await ctx.close();
  });

  kontrol('hiçbir sayfa aynı kökenden 404 almadı (kırık kapak / eksik dosya; denetçi 11)', !yok404.size, [...yok404].join(' | '));
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
