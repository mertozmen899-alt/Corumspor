// Reklam modülü tarayıcı testleri: GERÇEK uygulama sayfalarında, ?sahte=1 (testler/sahte-supabase.js) ile uçtan uca.
// Kullanım: node testler/reklam-tarayici-testleri.js   (hepsi için: node testler/calistir.js)
// Akış: yönetici giriş → Reklamlar sekmesi → 3 alana reklam (ana_akis, haber_sonu, belirli maça mac_sponsoru) →
// masaüstü + telefon önizleme (sayım yok) → yayına al → ana sayfa / haber / maç yerleşimleri → gösterim (sayfa ziyareti
// başına 1) → tıklama (yeni sekme, rel sponsored; aynı sekmede 30 dk tekrar sayılmaz) → rapor + CSV → sahte saat ileri:
// süre bitince boş kutu yok. Ayrıca bileşen sağlamlığı (yeniden çizim, SPA, akış yuvası, flex/grid) ve
// CSP ihlali / 404 / JavaScript hatası olmadığı denenir. İnternete çıkmaz (127.0.0.1 dışı engellenir ya da taklit edilir).
// Uçtan uca akış reklamsız başlar (sahte_ornek_reklam = 'yok'); sahte verinin örnek reklamı (Narçil Cafe) ayrıca denenir.
const fs = require('fs'), path = require('path');
const { pathToFileURL } = require('url');
const { sunucuAc, ornekReklamGorseli, gorselTuru } = require('./tarayici-testleri');

const KOK = path.resolve(__dirname, '..');
const EKRAN = path.join(__dirname, 'ekran');
const GORSEL = path.join(__dirname, 'reklam', 'gorseller');
const ILK_REKLAM = path.join(KOK, 'docs', 'ilk-reklam'); // ilk gerçek reklam veren: Narçil Cafe (görseller + NASIL.md)
const H1 = '33333333-0000-4000-8000-000000000001';
const M1 = '11111111-0000-4000-8000-000000000001'; // Örnekköy Spor (golleri ve YouTube videosu var)
const M2 = '11111111-0000-4000-8000-000000000002';
const NARCIL = 'Narçil Cafe';
const NARCIL_URL = 'https://narcil.net/?category=espresso-bazli-kahveler'; // kahve bölümü (menünün başı nargile; tütün reklamı yasak)
const NARCIL_METIN = "Espresso bazlı kahveler, Türk kahvesi, bitki çayları, taze sıkılmış meyve suları ve tatlılar. Menünün tamamı narcil.net'te.";
const SIGORTA_URL = 'https://www.iskilip-sigorta-ornek.com.tr/kasko';
// 012: panel görseli yüklemeden önce küçültüp WebP'ye çevirir (tarayıcı WebP yazamazsa JPEG)
const DEPO_DESENI = /^https:\/\/sahte\.supabase\.co\/storage\/v1\/object\/public\/reklam-gorselleri\/\d{4}\/\d{2}\/[0-9a-f-]+\.webp$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

async function reklamTarayiciTestleri() {
  let chromium;
  try { ({ chromium } = require('playwright')); } catch (e) {
    return { gecen: [], kalan: ['Playwright bulunamadı (require("playwright")).'] };
  }
  const RM = await import(pathToFileURL(path.join(KOK, 'assets', 'reklam', 'reklam-mantik.js')).href);
  fs.mkdirSync(EKRAN, { recursive: true });
  const sunucu = await sunucuAc();
  const ADRES = 'http://127.0.0.1:' + sunucu.address().port;
  const gecen = [], kalan = [];
  const kontrol = (ad, ok, detay) => (ok ? gecen.push('reklam: ' + ad) : kalan.push(`reklam: ${ad}` + (detay !== undefined ? ` -> ${String(detay).slice(0, 400)}` : '')));
  const guvenli = async (ad, f) => { try { await f(); } catch (e) { kalan.push(`reklam: ${ad}: test yarıda kaldı -> ${String(e.message || e).split('\n')[0]}`); } };
  const bekle = (ms) => new Promise((c) => setTimeout(c, ms));
  const tarayici = await chromium.launch();

  // ------------------------------------------------------------ ortak bağlam
  const hatalar = [], ihlaller = [], bulunamayan = [];
  async function baglamAc({ ornekReklam = false } = {}) {
    const ctx = await tarayici.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'America/New_York', acceptDownloads: true });
    await ctx.route((url) => !url.href.startsWith(ADRES), (r) => r.abort());
    // Firma sayfaları (yeni sekmede açılır): internete çıkmadan taklit
    await ctx.route(/^https:\/\/(narcil\.net|www\.iskilip-sigorta-ornek\.com\.tr|wa\.me)\//, (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><title>Firma sayfası</title><h1>Firma sayfası</h1>' }));
    // Sahte Supabase deposu: reklam görselleri gerçekteki gibi https://<proje>.supabase.co/storage/... adresinden gelir
    await ctx.route(/^https:\/\/sahte\.supabase\.co\/storage\/v1\/object\/public\//, async (r) => {
      const yol = decodeURIComponent(new URL(r.request().url()).pathname.replace('/storage/v1/object/public/', ''));
      let sayfa = null;
      try { sayfa = r.request().frame().page(); } catch (e) { sayfa = null; }
      const adaylar = [sayfa, ...ctx.pages()].filter((x) => x && x.url().startsWith(ADRES));
      let veri = null;
      for (const s of adaylar) { veri = await s.evaluate((k) => localStorage.getItem(k), 'sahte-depo-v1:' + yol).catch(() => null); if (veri) break; }
      const m = veri && /^data:([^;,]+);base64,(.*)$/.exec(veri);
      const ornek = !m && ornekReklamGorseli(yol); // sahte verideki örnek Narçil reklamı: docs/ilk-reklam/
      if (ornek) return r.fulfill({ status: 200, contentType: gorselTuru(yol), body: ornek });
      if (!m) return r.fulfill({ status: 404, body: 'yok' });
      return r.fulfill({ status: 200, contentType: m[1], body: Buffer.from(m[2], 'base64') });
    });
    // Uçtan uca akış boş veriyle başlar (örnek Narçil reklamı olmadan); örnek veri ayrıca denenir (ornekReklam: true)
    if (!ornekReklam) await ctx.addInitScript(() => { try { if (/\.html$/.test(location.pathname)) localStorage.setItem('sahte_ornek_reklam', 'yok'); } catch (e) {} });
    await ctx.addInitScript(() => {
      window.__csp = [];
      document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI));
    });
    ctx.on('page', (p) => {
      p.setDefaultTimeout(10000);
      p.on('pageerror', (e) => hatalar.push(`${p.url()}: ${e.message}`));
      p.on('dialog', (d) => d.accept());
      p.on('response', (r) => { if (r.status() === 404) bulunamayan.push(r.url()); });
      p.on('framenavigated', () => {});
    });
    return ctx;
  }
  const cspTopla = async (p) => { const l = await p.evaluate(() => window.__csp || []).catch(() => []); ihlaller.push(...l.map((x) => p.url() + ': ' + x)); };
  const git = async (p, s) => { await cspTopla(p); await p.goto(ADRES + '/' + s); await p.waitForLoadState('networkidle').catch(() => {}); };
  const vt = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('sahte-db-v1')));
  const olaylar = async (p, firma, tur) => {
    const d = await vt(p);
    const r = d.reklamlar.find((x) => x.firma_adi === firma);
    return r ? d.reklam_olaylari.filter((o) => o.reklam_id === r.id && (!tur || o.tur === tur)) : null;
  };
  const olaySay = async (p, firma, tur) => { const l = await olaylar(p, firma, tur); return l ? l.length : -1; };
  const ekran = (p, ad, tam = false) => p.screenshot({ path: path.join(EKRAN, ad + '.png'), fullPage: tam, animations: 'disabled' });

  async function reklamFormu(p, o) {
    await p.click('#ry-yeni');
    await p.fill('#ry-firma_adi', o.firma);
    await p.fill('#ry-kisa_metin', o.metin);
    await p.setInputFiles('#ry-gorsel', path.resolve(GORSEL, o.gorsel));
    await p.waitForFunction(() => document.querySelector('#ry-gorsel-durum')?.textContent === 'Görsel yüklendi.');
    if (o.web) {
      await p.check('input[name="baglanti_turu"][value="web"]');
      await p.fill('#ry-baglanti_url', o.web);
      await p.locator('#ry-baglanti_url').blur();
    }
    if (o.telefon) {
      await p.check('input[name="baglanti_turu"][value="whatsapp"]');
      await p.fill('#ry-telefon', o.telefon);
      await p.fill('#ry-wa-mesaj', o.mesaj || '');
    }
    await p.selectOption('#ry-alan', o.alan);
    if (o.mac != null) await p.selectOption('#ry-mac_id', o.mac);
    const simdi = Date.now();
    await p.fill('#ry-baslangic', RM.isoYerelGirise(new Date(simdi + (o.basSaat ?? -1) * 3600e3)));
    await p.fill('#ry-bitis', RM.isoYerelGirise(new Date(simdi + (o.bitSaat ?? 48) * 3600e3)));
    await p.fill('#ry-oncelik', String(o.oncelik ?? 0));
  }
  async function onizlemeKontrol(p, firma, etiket) {
    const sonuc = [];
    for (const yer of ['#ry-onizleme-masaustu', '#ry-onizleme-telefon']) {
      const kart = p.locator(`${yer} .reklam-kart`);
      await kart.waitFor();
      await p.waitForFunction((s) => { const i = document.querySelector(s + ' .reklam-gorsel'); return i && i.complete && i.naturalWidth > 0; }, yer);
      sonuc.push((await kart.locator('.reklam-etiket').textContent()) === etiket && (await kart.locator('.reklam-firma').textContent()) === firma);
    }
    return sonuc.every(Boolean);
  }

  const ctx = await baglamAc();
  const yon = await ctx.newPage();
  let ana = null;

  // ============================================================ 1) yönetici: giriş → Reklamlar sekmesi
  await guvenli('yönetim', async () => {
    await git(yon, 'giris.html?sahte=1&donus=yonetim.html');
    await yon.fill('#g-eposta', 'yonetici@ornek.test');
    await yon.fill('#g-sifre', 'sifre1234');
    await Promise.all([yon.waitForURL(/yonetim\.html/), yon.click('#g-gonder')]);
    await yon.waitForSelector('#panel:not([hidden])');
    await yon.click('#sekme-reklamlar');
    await yon.waitForSelector('#reklamlar-sekmesi #ry-yeni');
    kontrol('yönetim: Reklamlar sekmesinde gerçek modül bağlandı, "modül yok" notu gizli', await yon.isHidden('#reklam-modul-yok'));
    kontrol('yönetim: panel başta boş liste gösteriyor', /Henüz reklam yok/.test(await yon.textContent('#ry-reklamlar')));
    kontrol('yönetim: sayfa adresi #reklamlar', yon.url().endsWith('#reklamlar'));

    // --- ana akış reklamı: önce hatalı (http) bağlantı
    await reklamFormu(yon, { firma: NARCIL, metin: NARCIL_METIN, gorsel: path.join(ILK_REKLAM, 'narcil-1200x628.png'), web: 'http://narcil.net', alan: 'ana_akis', oncelik: 10 });
    kontrol('form: Narçil metni sınırın içinde, sayaç "123/160"', (await yon.textContent('.ry-sayac')) === `${NARCIL_METIN.length}/160` && NARCIL_METIN.length === 123, await yon.textContent('.ry-sayac'));
    await yon.click('#ry-yayina-al');
    await yon.locator('#ry-baglanti_url-hata').filter({ hasText: 'https://' }).waitFor();
    kontrol('form: http:// bağlantı Türkçe uyarıyla reddedildi, kaydedilmedi', (await vt(yon)).reklamlar.length === 0);
    await yon.fill('#ry-baglanti_url', 'narcil.net/?category=espresso-bazli-kahveler'); // NASIL.md'deki gibi, https:// olmadan
    await yon.locator('#ry-baglanti_url').blur();
    kontrol('form: şemasız adres https:// ile tamamlandı', (await yon.inputValue('#ry-baglanti_url')) === NARCIL_URL, await yon.inputValue('#ry-baglanti_url'));
    kontrol('form: düzeltince hata özeti kalktı', (await yon.locator('.ry-hata-ozet li').count()) === 0);
    kontrol('form: yüklenen görsel adresi projenin Supabase deposu (reklam-gorselleri)', DEPO_DESENI.test(await yon.inputValue('#ry-gorsel_url')), await yon.inputValue('#ry-gorsel_url'));
    kontrol('önizleme: masaüstü ve telefon kartı ("Reklam" etiketi, firma, görsel)', await onizlemeKontrol(yon, NARCIL, 'Reklam'));
    const yonu = (s) => yon.locator(`${s} .reklam-govde`).evaluate((e) => getComputedStyle(e).flexDirection);
    const [ym, yt] = [await yonu('#ry-onizleme-masaustu'), await yonu('#ry-onizleme-telefon')];
    kontrol('önizleme: masaüstünde görsel solda (row), telefonda üstte (column)', ym === 'row' && yt === 'column', ym + '/' + yt);
    kontrol('önizleme: kart önizleme işaretli (data-onizleme=1)', (await yon.getAttribute('#ry-onizleme-masaustu .reklam-kart', 'data-onizleme')) === '1');
    kontrol('önizleme: "şu an bu alanda bu reklam gösterilir" bilgisi', /şu an bu alanda bu reklam gösterilir/.test(await yon.textContent('#ry-onizleme-bilgi')));
    let acildi = false;
    const dinle = () => { acildi = true; };
    ctx.on('page', dinle);
    await yon.locator('#ry-onizleme-masaustu a.reklam-baglanti').click();
    await yon.locator('#ry-onizleme-telefon').scrollIntoViewIfNeeded();
    await bekle(1500);
    ctx.off('page', dinle);
    kontrol('önizleme: bağlantıya tıklamak yeni sekme açmıyor', !acildi);
    kontrol('önizleme: hiçbir gösterim/tıklama kaydedilmedi', (await vt(yon)).reklam_olaylari.length === 0);
    await yon.evaluate(() => window.scrollTo(0, 0));
    await ekran(yon, 'reklam-yonetim-onizleme', true);
    await yon.click('#ry-yayina-al');
    const satir = yon.locator('#ry-reklamlar tr', { hasText: NARCIL });
    await satir.locator('.ry-rozet-yayinda').waitFor();
    kontrol('yayın: listede "Yayında" ve "Şu an gösteriliyor"', (await satir.locator('.ry-rozet').textContent()) === 'Yayında' && await satir.getByText('Şu an gösteriliyor').isVisible());
    const r0 = (await vt(yon)).reklamlar[0];
    kontrol('yayın: kayıt doğru (durum, yayina_alinma sunucuda, bağlantı, görsel)', r0.durum === 'yayinda' && !!r0.yayina_alinma && r0.baglanti_url === NARCIL_URL && r0.kisa_metin === NARCIL_METIN && DEPO_DESENI.test(r0.gorsel_url), JSON.stringify(r0).slice(0, 300));
    await yon.waitForFunction(() => { const i = document.querySelector('#ry-reklamlar .ry-firma img'); return i && i.complete && i.naturalWidth > 0; });
    kontrol('yayın: listedeki küçük görsel depodan yüklendi', true);

    // --- haber sonu: WhatsApp
    await reklamFormu(yon, { firma: 'Hitit Optik', metin: "Güneş ve numaralı gözlük çeşitleri. Bilgi için WhatsApp'tan yazın.", gorsel: 'optik.png', telefon: '0532 123 45 67', mesaj: 'Merhaba, Çorumspor Taraftar uygulamasından yazıyorum', alan: 'haber_sonu', oncelik: 5 });
    kontrol('WhatsApp: numaradan wa.me bağlantısı oluştu', /https:\/\/wa\.me\/905321234567\?text=/.test(await yon.textContent('#ry-wa-sonuc')));
    kontrol('WhatsApp: önizleme kartı', await onizlemeKontrol(yon, 'Hitit Optik', 'Reklam'));
    kontrol('WhatsApp: düğme yazısı "WhatsApp\'tan yazın"', (await yon.textContent('#ry-onizleme-telefon .reklam-eylem')) === "WhatsApp'tan yazın");
    await yon.click('#ry-yayina-al');
    await yon.locator('#ry-reklamlar tr', { hasText: 'Hitit Optik' }).locator('.ry-rozet-yayinda').waitFor();

    // --- maç sponsoru: belirli maça (M1)
    await reklamFormu(yon, { firma: 'İskilip Sigorta', metin: 'Bu maçın sponsoru. Kasko teklifi için tıklayın.', gorsel: 'logo.png', web: SIGORTA_URL, alan: 'mac_sponsoru', mac: M1, oncelik: 1 });
    const secenekler = await yon.locator('#ry-mac_id option').allTextContents();
    kontrol('maç sponsoru: maç listesi uygulamanın maclar tablosundan (Örnekköy Spor, Çorum FK adıyla)', secenekler.some((x) => /Çorum FK – Örnekköy Spor/.test(x)), JSON.stringify(secenekler));
    kontrol('maç sponsoru: önizleme etiketi "Maçın sponsoru"', await onizlemeKontrol(yon, 'İskilip Sigorta', 'Maçın sponsoru'));
    await yon.click('#ry-yayina-al');
    await yon.locator('#ry-reklamlar tr', { hasText: 'İskilip Sigorta' }).locator('.ry-rozet-yayinda').waitFor();
    kontrol('maç sponsoru: kayıt M1 maçına bağlı', (await vt(yon)).reklamlar.find((x) => x.firma_adi === 'İskilip Sigorta').mac_id === M1);

    // --- taslak genel sponsor + başlamamış reklam
    await reklamFormu(yon, { firma: 'Genel Sponsor Taslak', metin: 'Henüz yayında değil.', gorsel: 'logo.png', alan: 'mac_sponsoru', mac: '', oncelik: 50 });
    kontrol('genel sponsor: önizleme etiketi "Sponsor"', await onizlemeKontrol(yon, 'Genel Sponsor Taslak', 'Sponsor'));
    await yon.click('#ry-taslak');
    await yon.locator('#ry-reklamlar tr', { hasText: 'Genel Sponsor Taslak' }).locator('.ry-rozet-taslak').waitFor();
    await reklamFormu(yon, { firma: 'Yarın Başlayan', metin: 'Gelecek hafta.', gorsel: 'optik.png', alan: 'haber_sonu', oncelik: 99, basSaat: 24, bitSaat: 30 });
    await yon.click('#ry-yayina-al');
    const gelecek = yon.locator('#ry-reklamlar tr', { hasText: 'Yarın Başlayan' }).locator('.ry-rozet');
    await gelecek.waitFor();
    kontrol('rozetler: taslak "Taslak", ileri tarihli "Başlamadı"', (await gelecek.textContent()) === 'Başlamadı' && (await yon.locator('#ry-reklamlar tr', { hasText: 'Genel Sponsor Taslak' }).locator('.ry-rozet').textContent()) === 'Taslak');
    kontrol('yönetim paneli hiç olay yazmadı', (await vt(yon)).reklam_olaylari.length === 0);
    await ekran(yon, 'reklam-yonetim-liste', true);
  });

  // ============================================================ 2) ana sayfa akışı (telefon)
  await guvenli('ana akış', async () => {
    ana = await ctx.newPage();
    await ana.setViewportSize({ width: 390, height: 844 });
    await git(ana, 'index.html?sahte=1');
    const kart = ana.locator('#akis .reklam-yuvasi .reklam-kart');
    await kart.waitFor({ state: 'attached' });
    const yer = await ana.evaluate(() => {
      const y = document.querySelector('#akis .reklam-yuvasi[data-reklam-alan="ana_akis"]');
      let once = 0; let x = y.previousElementSibling;
      while (x) { if (x.classList.contains('haber-karti')) once++; x = x.previousElementSibling; }
      return { once, kart: y.querySelectorAll('.reklam-kart').length, durum: y.dataset.reklamDurum, tum: document.querySelectorAll('.reklam-kart').length };
    });
    kontrol('ana: kart 3. haberden sonra, tek kart, yükleyici "tamam"', yer.once === 3 && yer.kart === 1 && yer.tum === 1 && yer.durum === 'tamam', JSON.stringify(yer));
    kontrol('ana: "Reklam" etiketi', (await kart.locator('.reklam-etiket').textContent()) === 'Reklam');
    const img = kart.locator('img');
    kontrol('ana: görsel lazy ve açıklamalı (alt)', (await img.getAttribute('loading')) === 'lazy' && (await img.getAttribute('alt')) === NARCIL + ' reklam görseli');
    const a = kart.locator('a.reklam-baglanti');
    kontrol('ana: bağlantı yeni sekmede, rel="sponsored noopener", doğru adres', (await a.getAttribute('rel')) === 'sponsored noopener' && (await a.getAttribute('target')) === '_blank' && (await a.getAttribute('href')) === NARCIL_URL);
    const kutu = await kart.boundingBox();
    kontrol('ana: kart ilk ekranın altında (henüz görünmüyor)', kutu.y > 844, kutu.y);
    await bekle(1800);
    kontrol('ana: görünmeden gösterim sayılmadı', (await olaySay(ana, NARCIL, 'gosterim')) === 0);
    await kart.evaluate((e) => e.scrollIntoView({ block: 'center' }));
    await bekle(400);
    await ana.evaluate(() => window.scrollTo(0, 0));
    await bekle(1500);
    kontrol('ana: 1 saniyeden kısa görünme sayılmadı', (await olaySay(ana, NARCIL, 'gosterim')) === 0);
    await kart.evaluate((e) => e.scrollIntoView({ block: 'center' }));
    await ana.waitForFunction(() => document.querySelector('#akis .reklam-gorsel')?.naturalWidth > 0);
    await bekle(1700);
    kontrol('ana: %50 görünür + 1 sn sonra tam 1 gösterim', (await olaySay(ana, NARCIL, 'gosterim')) === 1);
    await ekran(ana, 'reklam-ana-akis-telefon');
    await ana.evaluate(() => window.scrollTo(0, 0));
    await bekle(300);
    await kart.evaluate((e) => e.scrollIntoView({ block: 'center' }));
    await bekle(1700);
    kontrol('ana: aynı sayfa ziyaretinde ikinci kez sayılmadı', (await olaySay(ana, NARCIL, 'gosterim')) === 1);
    const st = await ana.locator('#akis .reklam-yuvasi').evaluate((e) => { const c = getComputedStyle(e); const k = getComputedStyle(e.querySelector('.reklam-kart')); return [c.position, k.position, c.zIndex]; });
    kontrol('ana: yuva ve kart normal akışta (static, z-index yok)', st.join() === 'static,static,auto', st.join());
    await ana.reload();
    await ana.locator('#akis .reklam-kart').waitFor({ state: 'attached' });
    await ana.locator('#akis .reklam-kart').evaluate((e) => e.scrollIntoView({ block: 'center' }));
    await bekle(1700);
    kontrol('ana: yeni sayfa yüklemesi = yeni ziyaret, yeniden 1 gösterim (toplam 2)', (await olaySay(ana, NARCIL, 'gosterim')) === 2);
    const gz = (await olaylar(ana, NARCIL, 'gosterim')).map((o) => o.sayfa_ziyaret_id);
    kontrol('ana: iki gösterimin sayfa ziyareti kimlikleri farklı, sekme kimliği gösterimde yok', gz.length === 2 && gz[0] !== gz[1] && (await olaylar(ana, NARCIL, 'gosterim')).every((o) => o.sekme_id == null));
  });

  // ============================================================ 3) tıklama: yeni sekme, kayıt, sekme içinde 30 dk tekrar yok
  await guvenli('tıklama', async () => {
    const adres0 = ana.url();
    const [sekme] = await Promise.all([ctx.waitForEvent('page'), ana.locator('#akis a.reklam-baglanti').click()]);
    await sekme.waitForLoadState();
    kontrol('tıklama: firma sayfası yeni sekmede açıldı', sekme.url() === new URL(NARCIL_URL).href && (await sekme.title()) === 'Firma sayfası', sekme.url());
    kontrol('tıklama: uygulama sayfası yerinde kaldı', ana.url() === adres0);
    await ana.waitForFunction(() => JSON.parse(localStorage.getItem('sahte-db-v1')).reklam_olaylari.some((o) => o.tur === 'tiklama'));
    kontrol('tıklama: 1 tıklama kaydedildi', (await olaySay(ana, NARCIL, 'tiklama')) === 1);
    const t0 = (await olaylar(ana, NARCIL, 'tiklama'))[0];
    const sekmeId = await ana.evaluate(() => sessionStorage.getItem('reklam-sekme-kimligi'));
    kontrol('tıklama: olayda rastgele sekme kimliği (sessionStorage) var, kişisel alan yok', UUID.test(sekmeId) && t0.sekme_id === sekmeId && Object.keys(t0).sort().join() === 'alan,created_at,id,mac_id,reklam_id,sayfa_ziyaret_id,sekme_id,tur', JSON.stringify(t0));
    const [sekme2] = await Promise.all([ctx.waitForEvent('page'), ana.locator('#akis a.reklam-baglanti').click()]);
    await sekme2.waitForLoadState();
    await bekle(400);
    kontrol('tıklama: aynı sayfada hemen tekrar tıklama sayılmadı', (await olaySay(ana, NARCIL, 'tiklama')) === 1);
    await sekme.close(); await sekme2.close();
    // aynı sekmede başka sayfaya gidip geri gel: yeni sayfa ziyareti ama aynı sekme kimliği
    await git(ana, 'haber.html?id=' + H1);
    await git(ana, 'index.html');
    await ana.locator('#akis a.reklam-baglanti').waitFor();
    const [sekme3] = await Promise.all([ctx.waitForEvent('page'), ana.locator('#akis a.reklam-baglanti').click()]);
    await sekme3.waitForLoadState();
    await bekle(500);
    kontrol('tıklama: aynı sekmede sayfa değişse de 30 dk içinde tekrar tıklama sayılmadı', (await olaySay(ana, NARCIL, 'tiklama')) === 1);
    kontrol('tıklama: sekme kimliği sayfalar arasında aynı kaldı', (await ana.evaluate(() => sessionStorage.getItem('reklam-sekme-kimligi'))) === sekmeId);
    await sekme3.close();
    // yeni sekme = yeni sekme kimliği: sayılır
    const yeni = await ctx.newPage();
    await yeni.setViewportSize({ width: 390, height: 844 });
    await git(yeni, 'index.html?sahte=1');
    await yeni.locator('#akis a.reklam-baglanti').waitFor();
    const [sekme4] = await Promise.all([ctx.waitForEvent('page'), yeni.locator('#akis a.reklam-baglanti').click()]);
    await sekme4.waitForLoadState();
    await yeni.waitForFunction(() => JSON.parse(localStorage.getItem('sahte-db-v1')).reklam_olaylari.filter((o) => o.tur === 'tiklama').length >= 2);
    const yeniSekme = await yeni.evaluate(() => sessionStorage.getItem('reklam-sekme-kimligi'));
    kontrol('tıklama: başka sekmeden tıklama sayıldı (toplam 2), sekme kimliği farklı', (await olaySay(yeni, NARCIL, 'tiklama')) === 2 && UUID.test(yeniSekme) && yeniSekme !== sekmeId);
    await sekme4.close(); await cspTopla(yeni); await yeni.close();
  });

  // ============================================================ 4) haber sonu ve maç sponsoru
  await guvenli('haber/maç', async () => {
    const haber = await ctx.newPage();
    await haber.setViewportSize({ width: 390, height: 844 });
    await git(haber, 'haber.html?sahte=1&id=' + H1);
    const kart = haber.locator('.reklam-yuvasi[data-reklam-alan="haber_sonu"] .reklam-kart');
    await kart.waitFor();
    kontrol('haber: "Reklam" etiketi, WhatsApp bağlantısı', (await kart.locator('.reklam-etiket').textContent()) === 'Reklam' && /^https:\/\/wa\.me\/905321234567\?text=/.test(await kart.locator('a').getAttribute('href')));
    kontrol('haber: yayında olan (Hitit Optik) gösteriliyor, başlamamış yüksek öncelikli değil', (await kart.locator('.reklam-firma').textContent()) === 'Hitit Optik');
    const sira = await haber.evaluate(() => {
      const y = document.querySelector('.reklam-yuvasi[data-reklam-alan="haber_sonu"]');
      return { makaleden: !!(document.querySelector('#makale').compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING), yorumdan: !!(y.compareDocumentPosition(document.querySelector('#yorumlar')) & Node.DOCUMENT_POSITION_FOLLOWING) };
    });
    kontrol('haber: kart makaleden sonra, yorumlardan önce', sira.makaleden && sira.yorumdan, JSON.stringify(sira));
    await haber.waitForSelector('#yorum-listesi .yorum');
    await kart.evaluate((e) => e.scrollIntoView({ block: 'center' }));
    await haber.waitForFunction(() => document.querySelector('.reklam-yuvasi .reklam-gorsel')?.naturalWidth > 0);
    await bekle(1500);
    const kb = await kart.boundingBox(), yb = await haber.locator('#yorumlar .yorumlar, #yorumlar > *').first().boundingBox(), mb = await haber.locator('#makale').boundingBox();
    kontrol('haber: kart makale ile yorumlar arasında, örtüşme yok', kb.y >= mb.y + mb.height && yb.y >= kb.y + kb.height, JSON.stringify({ kb, yb, mb }));
    kontrol('haber: 1 gösterim', (await olaySay(haber, 'Hitit Optik', 'gosterim')) === 1);
    kontrol('haber: yorumlar hâlâ çalışıyor (yorum listesi dolu)', (await haber.$$('#yorum-listesi .yorum')).length >= 1);
    await ekran(haber, 'reklam-haber-sonu-telefon');
    await cspTopla(haber); await haber.close();

    const mac = await ctx.newPage();
    await mac.setViewportSize({ width: 390, height: 844 });
    await git(mac, 'mac.html?sahte=1&id=' + M1);
    const mk = mac.locator('.reklam-yuvasi[data-reklam-alan="mac_sponsoru"] .reklam-kart');
    await mk.waitFor();
    kontrol('maç: "Maçın sponsoru" etiketi ve firma', (await mk.locator('.reklam-etiket').textContent()) === 'Maçın sponsoru' && (await mk.locator('.reklam-firma').textContent()) === 'İskilip Sigorta');
    await mac.waitForSelector('#gol-listesi .gol');
    await mac.waitForFunction(() => document.querySelector('.reklam-yuvasi[data-reklam-alan="mac_sponsoru"] .reklam-gorsel')?.naturalWidth > 0);
    await bekle(1500);
    const bb = await mac.locator('#mac-basi').boundingBox(), sb = await mk.boundingBox(), gb = await mac.locator('#mac-golleri').boundingBox(), vb = await mac.locator('#gol-listesi .video').first().boundingBox();
    kontrol('maç: sponsor skorun altında, gollerin/videonun üstünde, örtüşme yok', sb.y >= bb.y + bb.height && gb.y >= sb.y + sb.height && vb.y >= sb.y + sb.height, JSON.stringify({ bb, sb, gb }));
    const st = await mac.locator('.reklam-yuvasi[data-reklam-alan="mac_sponsoru"]').evaluate((e) => [getComputedStyle(e).position, getComputedStyle(e.firstElementChild).position, getComputedStyle(e.firstElementChild).zIndex].join());
    kontrol('maç: kart normal akışta (static), videonun üstüne çıkamaz', st === 'static,static,auto', st);
    const mo = await olaylar(mac, 'İskilip Sigorta', 'gosterim');
    kontrol('maç: 1 gösterim, maç kimliğiyle', mo.length === 1 && mo[0].mac_id === M1, JSON.stringify(mo));
    kontrol('maç: goller ve YouTube videosu hâlâ çalışıyor', (await mac.$$('#gol-listesi .gol')).length === 2 && (await mac.getAttribute('#gol-listesi iframe', 'src')) === 'https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ');
    await ekran(mac, 'reklam-mac-sponsoru-telefon');
    await git(mac, 'mac.html?id=' + M2);
    await mac.waitForSelector('#mac-basi');
    await bekle(600);
    const bos = await mac.locator('.reklam-yuvasi[data-reklam-alan="mac_sponsoru"]').evaluate((e) => ({ cocuk: e.children.length, gizli: e.hidden, yukseklik: e.getBoundingClientRect().height, durum: e.dataset.reklamDurum }));
    kontrol('maç: başka maçta (genel sponsor taslak) hiçbir şey yok, boş kutu yok', bos.cocuk === 0 && bos.gizli && bos.yukseklik === 0 && bos.durum === 'tamam', JSON.stringify(bos));
    await cspTopla(mac); await mac.close();

    // masaüstü ana sayfa görüntüsü
    const masa = await ctx.newPage();
    await git(masa, 'index.html?sahte=1');
    await masa.locator('#akis .reklam-kart').waitFor();
    await masa.waitForFunction(() => document.querySelector('#akis .reklam-gorsel')?.naturalWidth > 0);
    const gen = await masa.locator('#akis .reklam-yuvasi').evaluate((e) => [Math.round(e.getBoundingClientRect().width), Math.round(e.parentElement.getBoundingClientRect().width), getComputedStyle(e.querySelector('.reklam-govde')).flexDirection]);
    kontrol('ana (masaüstü): kart ızgaranın tam genişliğinde, görsel solda', gen[0] === gen[1] && gen[2] === 'row', JSON.stringify(gen));
    await masa.locator('#akis .reklam-kart').evaluate((e) => e.scrollIntoView({ block: 'center' }));
    await bekle(300);
    await ekran(masa, 'reklam-ana-akis-masaustu');
    await cspTopla(masa); await masa.close();
  });

  // ============================================================ 5) rapor + CSV
  await guvenli('rapor', async () => {
    await yon.reload();
    await yon.waitForSelector('#reklamlar-sekmesi #ry-yeni');
    await yon.click('button[data-sekme="rapor"]');
    const satir = yon.locator('#ry-rapor-sonuc tbody tr', { hasText: NARCIL });
    await satir.waitFor();
    const g = await olaySay(yon, NARCIL, 'gosterim'), t = await olaySay(yon, NARCIL, 'tiklama');
    const oran = RM.tiklamaOrani(g, t);
    const hucre = await satir.locator('td').allTextContents();
    kontrol(`rapor: gösterim/tıklama/oran (bu ay) = ${g}/${t}/%${RM.oranBicimle(oran)}`, JSON.stringify(hucre) === JSON.stringify([NARCIL, 'Ana sayfa akışı', String(g), String(t), `%${RM.oranBicimle(oran)}`, '0']) && g >= 2 && t === 2, JSON.stringify(hucre));
    const bugun = RM.istanbulGunu(new Date());
    await yon.fill('#ry-rapor-bas', bugun);
    await yon.fill('#ry-rapor-bit', bugun);
    await yon.click('#ry-rapor-goster');
    await yon.locator('#ry-rapor-sonuc tbody tr', { hasText: 'Hitit Optik' }).waitFor();
    const hitit = await yon.locator('#ry-rapor-sonuc tbody tr', { hasText: 'Hitit Optik' }).locator('td').allTextContents();
    kontrol('rapor: bugün aralığında haber sonu reklamı 1 gösterim, 0 tıklama, %0,00', JSON.stringify(hitit) === JSON.stringify(['Hitit Optik', 'Haber sonu', '1', '0', '%0,00', '0']), JSON.stringify(hitit));
    kontrol('rapor: taslak reklam raporda yok', !/Genel Sponsor Taslak/.test(await yon.textContent('#ry-rapor-sonuc')));
    const [indirme] = await Promise.all([yon.waitForEvent('download'), yon.click('#ry-csv')]);
    kontrol('CSV: dosya adı gösterilen aralık', indirme.suggestedFilename() === `reklam-raporu_${bugun}_${bugun}.csv`, indirme.suggestedFilename());
    const csv = fs.readFileSync(await indirme.path(), 'utf8');
    kontrol('CSV: UTF-8 BOM ile başlıyor', csv.charCodeAt(0) === 0xfeff);
    kontrol('CSV: ";" ayraçlı Türkçe başlık, CRLF', csv.slice(1).startsWith('Firma;Alan;Gösterim;Tıklama;Tıklama oranı (%);Sınıra takılan dakika\r\n'), JSON.stringify(csv.slice(0, 80)));
    kontrol('CSV: satır "Narçil Cafe;Ana sayfa akışı;G;T;oran" (ondalık virgül)', csv.includes(`${NARCIL};Ana sayfa akışı;${g};${t};${RM.oranBicimle(oran)};0\r\n`) && csv.includes('Hitit Optik;Haber sonu;1;0;0,00;0\r\n'), csv);
    await yon.fill('#ry-rapor-bas', '2020-01-01');
    await yon.fill('#ry-rapor-bit', '2020-01-31');
    await yon.click('#ry-rapor-goster');
    await yon.getByText('Bu aralıkta veri yok.').waitFor();
    kontrol('rapor: veri olmayan aralıkta "Bu aralıkta veri yok", CSV kapalı', await yon.locator('#ry-csv').isDisabled());
    await yon.fill('#ry-rapor-bas', bugun);
    await yon.fill('#ry-rapor-bit', bugun);
    await yon.click('#ry-rapor-goster');
    await yon.locator('#ry-rapor-sonuc tbody tr').first().waitFor();
    await yon.fill('#ry-rapor-bas', '2031-01-01');
    await yon.fill('#ry-rapor-bit', '2031-01-31');
    const [ind2] = await Promise.all([yon.waitForEvent('download'), yon.click('#ry-csv')]);
    kontrol('CSV: tarih değişip "Göster"e basılmadıysa dosya adı tablodaki aralık', ind2.suggestedFilename() === `reklam-raporu_${bugun}_${bugun}.csv`, ind2.suggestedFilename());
    await yon.fill('#ry-rapor-bas', '2031-02-01');
    await yon.click('#ry-rapor-goster');
    await yon.getByText('Tarih aralığı geçersiz.').waitFor();
    kontrol('rapor: geçersiz aralıkta hata, eski satırlar CSV olarak inemez', await yon.locator('#ry-csv').isDisabled());
    await yon.fill('#ry-rapor-bas', RM.buAyAraligi(new Date()).baslangic);
    await yon.fill('#ry-rapor-bit', RM.buAyAraligi(new Date()).bitis);
    await yon.click('#ry-rapor-goster');
    await yon.locator('#ry-rapor-sonuc tbody tr').first().waitFor();
    // 012: dakika sınırı. Biri her istekte yeni ziyaret kimliğiyle gösterim gönderirse 121. ve sonrası sayılmaz;
    // rapordaki "Sınıra takılan dakika" sütunu ve CSV bunu gösterir (yönetici de reklam verene "yaklaşık" der).
    const saniye = new Date().getUTCSeconds();
    if (saniye > 48) await bekle((61 - saniye) * 1000); // 125 çağrı aynı takvim dakikasında kalsın
    const sinir = await yon.evaluate(async (firma) => {
      const { supabase } = await import('/assets/istemci.js');
      const db = JSON.parse(localStorage.getItem('sahte-db-v1'));
      const r = db.reklamlar.find((x) => x.firma_adi === firma);
      const sonuc = {};
      for (let i = 0; i < 125; i++) {
        const { data } = await supabase.rpc('reklam_olay_kaydet', { p_reklam_id: r.id, p_tur: 'gosterim', p_sayfa_ziyaret_id: crypto.randomUUID(), p_alan: r.alan, p_mac_id: null, p_sekme_id: null });
        sonuc[data] = (sonuc[data] || 0) + 1;
      }
      return sonuc;
    }, 'Hitit Optik');
    kontrol('dakika sınırı: bir reklama dakikada 120 gösterimden fazlası "sinir" (sahte istemci SQL\'in aynası)', sinir.sinir >= 5 && (sinir.kaydedildi || 0) <= RM.SINIRLAR.gosterimDakikaSiniri, JSON.stringify(sinir));
    await yon.fill('#ry-rapor-bas', bugun);
    await yon.fill('#ry-rapor-bit', bugun);
    await yon.click('#ry-rapor-goster');
    await yon.locator('#ry-rapor-sonuc tbody tr', { hasText: 'Hitit Optik' }).waitFor();
    const basliklar = await yon.locator('#ry-rapor-sonuc thead th').allTextContents();
    kontrol('rapor: "Sınıra takılan dakika" sütunu var', basliklar.includes('Sınıra takılan dakika'), JSON.stringify(basliklar));
    const hitit2 = await yon.locator('#ry-rapor-sonuc tbody tr', { hasText: 'Hitit Optik' }).locator('td').allTextContents();
    kontrol('rapor: Hitit Optik 1 dakika sınıra takıldı, gösterim sınırda kaldı', hitit2[5] === '1' && Number(hitit2[2].replace(/\./g, '')) <= RM.SINIRLAR.gosterimDakikaSiniri + 1, JSON.stringify(hitit2));
    const [ind3] = await Promise.all([yon.waitForEvent('download'), yon.click('#ry-csv')]);
    const csv3 = fs.readFileSync(await ind3.path(), 'utf8');
    kontrol('CSV: "Sınıra takılan dakika" değeri satırda', /\r\nHitit Optik;Haber sonu;\d+;0;0,00;1\r\n/.test(csv3), csv3);
    kontrol('rapor: yaklaşık sayım notu görünüyor', /yaklaşık/i.test(await yon.textContent('#ry-rapor')), await yon.textContent('#ry-rapor'));
    await yon.fill('#ry-rapor-bas', RM.buAyAraligi(new Date()).baslangic);
    await yon.fill('#ry-rapor-bit', RM.buAyAraligi(new Date()).bitis);
    await yon.click('#ry-rapor-goster');
    await yon.locator('#ry-rapor-sonuc tbody tr').first().waitFor();
    await ekran(yon, 'reklam-yonetim-rapor', true);
  });

  // ============================================================ 6) düzenleme ve duraklatma
  await guvenli('düzenleme', async () => {
    await yon.evaluate(() => {
      const d = JSON.parse(localStorage.getItem('sahte-db-v1'));
      const s = new Date(Date.now() - 3600e3).toISOString(), b = new Date(Date.now() + 48 * 3600e3).toISOString();
      d.reklamlar.push({ id: 'aaaaaaaa-1111-4000-8000-000000000001', firma_adi: 'Uygulama Bağlantılı', gorsel_url: d.reklamlar[0].gorsel_url, kisa_metin: 'Metin',
        baglanti_url: 'whatsapp://send?phone=905321234567&text=Merhaba%20usta', alan: 'haber_sonu', mac_id: null, baslangic: s, bitis: b,
        durum: 'taslak', oncelik: 0, yayina_alinma: null, created_at: s, updated_at: s });
      localStorage.setItem('sahte-db-v1', JSON.stringify(d));
    });
    await yon.reload();
    await yon.waitForSelector('#reklamlar-sekmesi #ry-yeni');
    await yon.locator('#ry-reklamlar tr', { hasText: 'Uygulama Bağlantılı' }).getByRole('button', { name: 'Düzenle' }).click();
    kontrol('düzenleme: whatsapp://send bağlantısı numara ve mesajla açıldı', (await yon.isChecked('input[name="baglanti_turu"][value="whatsapp"]')) && (await yon.inputValue('#ry-telefon')) === '05321234567' && (await yon.inputValue('#ry-wa-mesaj')) === 'Merhaba usta');
    await yon.click('#ry-taslak');
    await yon.locator('#ry-reklamlar tr', { hasText: 'Uygulama Bağlantılı' }).waitFor();
    const r = (await vt(yon)).reklamlar.find((x) => x.firma_adi === 'Uygulama Bağlantılı');
    kontrol('düzenleme: wa.me biçimine çevrilerek kaydedildi', r.baglanti_url === 'https://wa.me/905321234567?text=Merhaba%20usta', r.baglanti_url);
    await yon.locator('#ry-reklamlar tr', { hasText: 'Uygulama Bağlantılı' }).getByRole('button', { name: 'Sil' }).click();
    await yon.waitForFunction(() => !/Uygulama Bağlantılı/.test(document.querySelector('#ry-reklamlar').textContent));
    kontrol('düzenleme: reklam silindi (onay penceresiyle)', !(await vt(yon)).reklamlar.some((x) => x.firma_adi === 'Uygulama Bağlantılı'));
    // duraklat → ziyaretçi görmez → yeniden yayına al
    await yon.locator('#ry-reklamlar tr', { hasText: 'Hitit Optik' }).getByRole('button', { name: 'Duraklat' }).click();
    await yon.locator('#ry-reklamlar tr', { hasText: 'Hitit Optik' }).locator('.ry-rozet-duraklatildi').waitFor();
    const z = await ctx.newPage();
    await git(z, 'haber.html?sahte=1&id=' + H1);
    await z.waitForSelector('#makale');
    await z.waitForFunction(() => document.querySelector('.reklam-yuvasi[data-reklam-alan="haber_sonu"]')?.dataset.reklamDurum === 'tamam');
    kontrol('duraklat: ziyaretçi haber sonunda reklam görmüyor', (await z.locator('.reklam-kart').count()) === 0);
    await cspTopla(z); await z.close();
    await yon.locator('#ry-reklamlar tr', { hasText: 'Hitit Optik' }).getByRole('button', { name: 'Yayına al' }).click();
    await yon.locator('#ry-reklamlar tr', { hasText: 'Hitit Optik' }).locator('.ry-rozet-yayinda').waitFor();
    kontrol('duraklat: yeniden yayına alındı', true);
  });

  // ============================================================ 7) yetki: taraftar paneli de, RPC'yi de kullanamaz
  await guvenli('yetki', async () => {
    const c2 = await baglamAc();
    const p = await c2.newPage();
    await git(p, 'giris.html?sahte=1');
    await p.fill('#g-eposta', 'taraftar@ornek.test');
    await p.fill('#g-sifre', 'sifre1234');
    await Promise.all([p.waitForURL(/index\.html/), p.click('#g-gonder')]);
    await git(p, 'yonetim.html#reklamlar');
    await p.waitForSelector('#yetki-mesaj:not([hidden])');
    kontrol('yetki: taraftar yönetim sayfasında Reklamlar\'ı görmüyor', !(await p.isVisible('#panel')) && (await p.locator('#ry-yeni').count()) === 0);
    const d = await p.evaluate(async () => {
      const { supabase } = await import('/assets/istemci.js');
      const m = await import('/assets/reklam/yonetim-reklamlar.js');
      const el = document.createElement('section'); document.body.append(el);
      await m.kur(el, { supabase });
      const ek = await supabase.from('reklamlar').insert({ firma_adi: 'Sahte', kisa_metin: 'x', gorsel_url: 'https://sahte.supabase.co/storage/v1/object/public/reklam-gorselleri/x.png', alan: 'ana_akis', baslangic: new Date().toISOString(), bitis: new Date(Date.now() + 864e5).toISOString() });
      const rapor = await supabase.rpc('reklam_raporu', { p_baslangic_tarih: '2020-01-01', p_bitis_tarih: '2030-01-01' });
      const liste = await supabase.from('reklamlar').select('*');
      return { metin: el.textContent, ekHata: !!ek.error, raporHata: rapor.error && rapor.error.message, liste: liste.data.length };
    });
    kontrol('yetki: modül doğrudan bağlansa da "Yetkiniz yok" diyor', /yalnızca yöneticiler görebilir/.test(d.metin), d.metin);
    kontrol('yetki: taraftar reklam ekleyemez, rapor alamaz, tabloyu okuyamaz (sahte RLS)', d.ekHata && /yalnızca yöneticiler/.test(d.raporHata) && d.liste === 0, JSON.stringify(d));
    await cspTopla(p); await c2.close();
  });

  // ============================================================ 8) süre dolunca: hiçbir şey yok, boş kutu yok
  await guvenli('süre bitimi', async () => {
    await yon.evaluate(() => localStorage.setItem('sahte_saat_kayma', String(3 * 864e5)));
    await git(ana, 'index.html');
    await ana.waitForFunction(() => document.querySelector('#akis .reklam-yuvasi')?.dataset.reklamDurum === 'tamam');
    const durum = await ana.evaluate(() => {
      const l = document.querySelector('#akis');
      const y = l.querySelector(':scope > .reklam-yuvasi');
      const kartlar = [...l.querySelectorAll(':scope > .haber-karti')];
      const b3 = kartlar[2].getBoundingClientRect(), b4 = kartlar[3].getBoundingClientRect(), b1 = kartlar[0].getBoundingClientRect(), b2 = kartlar[1].getBoundingClientRect();
      return { cocuk: y.children.length, gizli: y.hidden, yukseklik: y.getBoundingClientRect().height, aralik: Math.round(b4.top - b3.bottom), normal: Math.round(b2.top - b1.bottom), kart: document.querySelectorAll('.reklam-kart').length };
    });
    kontrol('süre bitimi: ana sayfada kart yok, yuva gizli ve 0 px, haberler arası boşluk normal', durum.cocuk === 0 && durum.gizli && durum.yukseklik === 0 && durum.kart === 0 && durum.aralik === durum.normal, JSON.stringify(durum));
    for (const [url, alan] of [['haber.html?id=' + H1, 'haber_sonu'], ['mac.html?id=' + M1, 'mac_sponsoru']]) {
      await git(ana, url);
      await ana.waitForFunction((a) => document.querySelector(`.reklam-yuvasi[data-reklam-alan="${a}"]`)?.dataset.reklamDurum === 'tamam', alan);
      const y = await ana.locator(`.reklam-yuvasi[data-reklam-alan="${alan}"]`).evaluate((e) => [e.children.length, e.getBoundingClientRect().height]);
      kontrol(`süre bitimi: ${alan} yuvası boş ve 0 px`, y[0] === 0 && y[1] === 0 && (await ana.locator('.reklam-kart').count()) === 0, JSON.stringify(y));
    }
    await yon.reload();
    await yon.waitForSelector('#reklamlar-sekmesi #ry-yeni');
    const rozet = yon.locator('#ry-reklamlar tr', { hasText: NARCIL }).locator('.ry-rozet');
    kontrol('süre bitimi: panelde "Süresi doldu"', (await rozet.textContent()) === 'Süresi doldu');
    const ol = await yon.evaluate(() => JSON.parse(localStorage.getItem('sahte-db-v1')).reklam_olaylari.length);
    const sonuc = await yon.evaluate(async (id) => { const { supabase } = await import('/assets/istemci.js'); return supabase.rpc('reklam_olay_kaydet', { p_reklam_id: id, p_tur: 'tiklama', p_sayfa_ziyaret_id: crypto.randomUUID(), p_alan: 'ana_akis', p_mac_id: null }); },
      (await vt(yon)).reklamlar.find((x) => x.firma_adi === NARCIL).id);
    kontrol('süre bitimi: süresi dolmuş reklama olay yazılamaz', /yayında değil/.test(sonuc.error && sonuc.error.message) && ol === (await vt(yon)).reklam_olaylari.length, JSON.stringify(sonuc));
    await yon.evaluate(() => localStorage.removeItem('sahte_saat_kayma'));
  });

  for (const p of ctx.pages()) await cspTopla(p);
  await ctx.close();

  // ============================================================ 9) bileşen sağlamlığı (gecikmeli taklit istemci)
  const c3 = await baglamAc();
  async function bilesenSayfasi(govde) {
    const p = await c3.newPage();
    await p.setViewportSize({ width: 390, height: 800 });
    await p.goto(ADRES + '/assets/stil.css');
    await p.setContent(`<!doctype html><html><head><link rel="stylesheet" href="${ADRES}/assets/reklam/reklam.css"><link rel="stylesheet" href="${ADRES}/assets/stil.css"></head><body>${govde}</body></html>`);
    await p.evaluate(async (adres) => {
      window.M = await import(adres + '/assets/reklam/reklam.js');
      window.olaylar = [];
      window.M.reklamIstemciAyarla({ rpc: (ad, prm) => {
        if (ad !== 'aktif_reklam') { window.olaylar.push(prm); return Promise.resolve({ data: 'kaydedildi', error: null }); }
        const r = { id: 'r-' + prm.p_alan, firma_adi: 'Firma', gorsel_url: null, kisa_metin: 'Metin', baglanti_url: 'https://a.com', alan: prm.p_alan, mac_id: null };
        return new Promise((c) => setTimeout(() => c({ data: [r], error: null }), 60));
      } });
    }, ADRES);
    return p;
  }
  await guvenli('bileşen', async () => {
    let p = await bilesenSayfasi('<div id="y" class="reklam-yuvasi"></div>');
    const n = await p.evaluate(async () => {
      const y = document.getElementById('y');
      await Promise.all([M.reklamYerlestir(y, { alan: 'haber_sonu' }), M.reklamYerlestir(y, { alan: 'haber_sonu' }), M.reklamYuvalariniDoldur(document)]);
      return y.querySelectorAll('.reklam-kart').length;
    });
    kontrol('bileşen: aynı yuvaya üst üste reklamYerlestir tek kart bırakır', n === 1, n);
    await p.close();

    p = await bilesenSayfasi('<div id="y" class="reklam-yuvasi" data-reklam-alan="haber_sonu"></div>');
    const d = await p.evaluate(async () => {
      const y = document.getElementById('y');
      const s = M.reklamYerlestir(y, { alan: 'haber_sonu' });
      M.reklamKaldir(y);
      const sonuc = await s;
      await new Promise((c) => setTimeout(c, 1500));
      return { sonuc, kart: y.children.length, gizli: y.hidden, olay: olaylar.length };
    });
    kontrol('bileşen: istek sürerken reklamKaldir → kart belirmez, gösterim sayılmaz', JSON.stringify(d) === JSON.stringify({ sonuc: null, kart: 0, gizli: true, olay: 0 }), JSON.stringify(d));
    await p.close();

    p = await bilesenSayfasi('<ul id="l"><li>1</li><li>2</li><li>3</li><li>4</li></ul>');
    const e = await p.evaluate(async () => {
      let kopan = 0;
      const asil = IntersectionObserver.prototype.disconnect;
      IntersectionObserver.prototype.disconnect = function () { kopan++; return asil.call(this); };
      const l = document.getElementById('l');
      M.akisaReklamEkle(l, 3);
      await new Promise((c) => setTimeout(c, 150));
      M.akisaReklamEkle(l, 3);
      const temizlendi = kopan;
      await new Promise((c) => setTimeout(c, 150));
      l.children[0].remove(); l.children[0].remove();
      let hata = null;
      try { M.akisaReklamEkle(l, 3); } catch (x) { hata = x.message; }
      return { temizlendi, hata, yuva: l.querySelectorAll('[data-akis-yuvasi]').length, kart: l.querySelectorAll('.reklam-kart').length };
    });
    kontrol('bileşen: akış yuvası yeniden çağrılınca eski gözlemci bırakılır; liste kısalınca hata yok', e.temizlendi >= 1 && e.hata === null && e.yuva === 0 && e.kart === 0, JSON.stringify(e));
    await p.close();

    p = await bilesenSayfasi(`
      <main id="f" style="display:flex;flex-direction:column;align-items:center;width:390px"><div class="reklam-yuvasi" data-reklam-alan="haber_sonu"></div></main>
      <main id="g" style="display:grid;justify-items:center;width:390px"><div class="reklam-yuvasi" data-reklam-alan="ana_akis"></div></main>`);
    const gen = await p.evaluate(async () => {
      await M.reklamYuvalariniDoldur(document);
      return ['#f', '#g'].map((s) => Math.round(document.querySelector(s + ' .reklam-kart').getBoundingClientRect().width));
    });
    kontrol('bileşen: ortalanmış flex sütun ve grid içinde kart tam genişlikte', JSON.stringify(gen) === '[390,390]', JSON.stringify(gen));
    const tik = await p.evaluate(async () => {
      document.querySelector('#f a.reklam-baglanti').addEventListener('click', (x) => x.preventDefault());
      document.querySelector('#f a.reklam-baglanti').click();
      await new Promise((c) => setTimeout(c, 50));
      return { olay: olaylar[olaylar.length - 1], sekme: sessionStorage.getItem('reklam-sekme-kimligi'), anahtarlar: Object.keys(sessionStorage), yerel: Object.keys(localStorage), cerez: document.cookie };
    });
    kontrol('bileşen: tıklamada p_sekme_id = sessionStorage kimliği; başka depolama/çerez yok', tik.olay.p_tur === 'tiklama' && tik.olay.p_sekme_id === tik.sekme && UUID.test(tik.sekme) && JSON.stringify(tik.anahtarlar) === '["reklam-sekme-kimligi"]' && tik.yerel.length === 0 && tik.cerez === '', JSON.stringify(tik));
    await p.close();

    // sessionStorage kapalıysa bileşen yine çalışır (bellekte kimlik)
    p = await c3.newPage();
    await p.addInitScript(() => { Object.defineProperty(window, 'sessionStorage', { get() { throw new DOMException('engelli', 'SecurityError'); } }); });
    await p.goto(ADRES + '/assets/stil.css');
    const k = await p.evaluate(async (adres) => { const M = await import(adres + '/assets/reklam/reklam.js'); return M.SEKME_ID; }, ADRES);
    kontrol('bileşen: sessionStorage engelliyse sekme kimliği bellekte üretilir, hata yok', UUID.test(k), k);
    await p.close();
  });
  await c3.close();

  // ============================================================ 10) örnek veri (?sahte=1): ilk reklam veren Narçil Cafe
  await guvenli('örnek Narçil reklamı', async () => {
    const c4 = await baglamAc({ ornekReklam: true });
    const p = await c4.newPage();
    await p.setViewportSize({ width: 390, height: 844 });
    const kartBilgi = async (secici) => {
      const k = p.locator(secici + ' .reklam-kart');
      await k.waitFor();
      await k.evaluate((e) => e.scrollIntoView({ block: 'center' }));
      await p.waitForFunction((s) => { const i = document.querySelector(s + ' .reklam-gorsel'); return i && i.complete && i.naturalWidth > 0; }, secici);
      return k.evaluate((e) => ({ etiket: e.querySelector('.reklam-etiket').textContent, firma: e.querySelector('.reklam-firma').textContent,
        metin: e.querySelector('.reklam-metin')?.textContent, href: e.querySelector('a.reklam-baglanti')?.getAttribute('href'),
        gorsel: e.querySelector('.reklam-gorsel').getAttribute('src'), en: e.querySelector('.reklam-gorsel').naturalWidth, boy: e.querySelector('.reklam-gorsel').naturalHeight }));
    };
    const beklenen = (k, etiket, en, boy) => k.etiket === etiket && k.firma === NARCIL && k.metin === NARCIL_METIN && k.href === NARCIL_URL && k.en === en && k.boy === boy && RM.gorselAdresiGecerli(k.gorsel);
    await git(p, 'index.html?sahte=1');
    const a = await kartBilgi('#akis .reklam-yuvasi[data-reklam-alan="ana_akis"]');
    kontrol('örnek veri: ana sayfa akışında Narçil Cafe ("Reklam", metin, narcil.net kahve bölümü, 1200×628 depo görseli)', beklenen(a, 'Reklam', 1200, 628), JSON.stringify(a));
    await git(p, 'haber.html?id=' + H1);
    const hs = await kartBilgi('.reklam-yuvasi[data-reklam-alan="haber_sonu"]');
    kontrol('örnek veri: haber sonunda Narçil Cafe', beklenen(hs, 'Reklam', 1200, 628), JSON.stringify(hs));
    await git(p, 'mac.html?id=' + M1);
    const ms = await kartBilgi('.reklam-yuvasi[data-reklam-alan="mac_sponsoru"]');
    kontrol('örnek veri: M1 maçında "Maçın sponsoru" Narçil Cafe (600×600 kare görsel)', beklenen(ms, 'Maçın sponsoru', 600, 600), JSON.stringify(ms));
    await git(p, 'mac.html?id=' + M2);
    await p.waitForFunction(() => document.querySelector('.reklam-yuvasi[data-reklam-alan="mac_sponsoru"]')?.dataset.reklamDurum === 'tamam');
    kontrol('örnek veri: başka maçta sponsor yok (Narçil yalnız M1 maçına bağlı)', (await p.locator('.reklam-kart').count()) === 0);
    const d = await vt(p);
    const metinler = d.reklamlar.map((r) => r.firma_adi + ' ' + r.kisa_metin).join(' | ');
    kontrol('örnek veri: 3 reklam da Narçil, hepsi geçerli (SQL tetikleyicisinin kuralları), indirim/kupon yok',
      d.reklamlar.length === 3 && d.reklamlar.every((r) => r.firma_adi === NARCIL && Object.keys(RM.reklamDogrula(r, { simdi: new Date() })).length === 0) && !/indirim|kupon|%/i.test(metinler), metinler);
    await cspTopla(p); await c4.close();
  });

  // ============================================================ genel
  kontrol('reklam akışında JavaScript hatası yok', !hatalar.length, hatalar.join(' | '));
  kontrol('CSP ihlali yok (görseller, wa.me, reklam CSS/JS)', !ihlaller.length, ihlaller.join(' | '));
  kontrol('hiçbir istek 404 dönmedi (reklam.js artık var)', !bulunamayan.length, bulunamayan.join(' | '));

  await tarayici.close();
  sunucu.close();
  return { gecen, kalan };
}

module.exports = { reklamTarayiciTestleri };

if (require.main === module) {
  reklamTarayiciTestleri().then((s) => {
    console.log(JSON.stringify(s, null, 2));
    console.log(`Reklam tarayıcı: ${s.gecen.length} geçti, ${s.kalan.length} kaldı`);
    process.exit(s.kalan.length ? 1 : 0);
  }).catch((e) => { console.error(e); process.exit(1); });
}
