// Tasarım ve erişilebilirlik testleri (013 mobil tasarım): docs/TASARIM.md ve erişilebilirlik isterlerinin (T-xx) Playwright'a çevrilmiş hâli.
// Kullanım: node testler/tasarim-testleri.js   (ya da hepsi için: node testler/calistir.js)
// Sahte Supabase (?sahte=1) ile çalışır; 127.0.0.1 dışına istek atmaz.
// Kapsam: yer işaretleri, atlama bağlantısı, başlık sırası, alt menü (aria-current, 44 px, örtme), canlı bölgeler, sonsuz animasyon yok,
// 320 px taşma, filtreler (radyo, klavye, adres), video facade (odak iframe'e), yorum erişilebilirliği, profil teması ve çıkış penceresi,
// Takım, sponsor kartı (sıklık, aynı firma bir kez, boşsa tamamen kalkar, geç gelince kaydırmaz), şifre sıfırlama, şikâyet / men,
// çevrimdışı (son veri anında), fotoğraf atıfları.
// axe-core bu ortamda kurulu değil: T-01/T-110 (axe taraması) yerine tek tek ölçülen kurallar denenir.
const path = require('path');
const { sunucuAc, ornekReklamGorseli, gorselTuru } = require('./tarayici-testleri');

const H1 = '33333333-0000-4000-8000-000000000001';
const M1 = '11111111-0000-4000-8000-000000000001';
const G1 = '22222222-0000-4000-8000-000000000001';
const HABER_ID = (n) => `33333333-0000-4000-8000-${String(100000000000 + n).slice(1)}`;
const REKLAM_ID = (n) => `aaaaaaaa-3333-4000-8000-${String(100000000000 + n).slice(1)}`;

async function tasarimTestleri() {
  let chromium;
  try { ({ chromium } = require('playwright')); } catch (e) {
    return { gecen: [], kalan: ['Playwright bulunamadı (require("playwright"))'] };
  }
  const sunucu = await sunucuAc();
  const ADRES = 'http://127.0.0.1:' + sunucu.address().port;
  const gecen = [], kalan = [];
  const kontrol = (ad, ok, detay) => (ok ? gecen.push(ad) : kalan.push(detay !== undefined ? `${ad} -> ${String(detay).slice(0, 300)}` : ad));
  const tarayici = await chromium.launch();
  const hatalar = [];

  async function baglam(vp = { width: 390, height: 844 }, { reklam = false, ekstra = {}, once = null } = {}) {
    const ctx = await tarayici.newContext({ viewport: vp, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul', ...ekstra });
    await ctx.route((url) => !url.href.startsWith(ADRES), (r) => r.abort());
    await ctx.route(/^https:\/\/sahte\.supabase\.co\/storage\/v1\/object\/public\//, (r) => {
      const yol = decodeURIComponent(new URL(r.request().url()).pathname.replace('/storage/v1/object/public/', ''));
      const ornek = ornekReklamGorseli(yol);
      return ornek ? r.fulfill({ status: 200, contentType: gorselTuru(yol), body: ornek }) : r.fulfill({ status: 404, body: 'yok' });
    });
    await ctx.addInitScript(([reklam, once]) => {
      try {
        if (!sessionStorage.getItem('__kuruldu')) {
          sessionStorage.setItem('__kuruldu', '1');
          if (!reklam) localStorage.setItem('sahte_ornek_reklam', 'yok');
          if (once) for (const [k, v] of Object.entries(once)) localStorage.setItem(k, v);
        }
      } catch (e) {}
    }, [reklam, once]);
    const p = await ctx.newPage();
    p.setDefaultTimeout(8000);
    p.on('pageerror', (e) => hatalar.push(e.message));
    p.on('dialog', (d) => d.accept());
    return { ctx, p };
  }
  const git = async (p, s, bekle) => {
    const [yol, parca = ''] = s.split('#');
    await p.goto(ADRES + '/' + yol + (yol.includes('?') ? '&' : '?') + 'sahte=1' + (parca ? '#' + parca : ''));
    if (bekle) await p.waitForSelector(bekle, { state: 'attached' });
  };
  /** Kaydırma (yumuşak kaydırma dahil) durana kadar bekler. */
  const durulsun = (p) => p.evaluate(() => new Promise((c) => { let son = -1, ayni = 0; const t = () => { const y = scrollY + ',' + scrollX; if (y === son) ayni += 1; else { ayni = 0; son = y; } if (ayni >= 4) c(); else requestAnimationFrame(t); }; requestAnimationFrame(t); }));
  const duyuruBekle = (p, re) => p.waitForFunction((k) => new RegExp(k).test(document.getElementById('durum').textContent), re.source).catch(() => {});
  // Tek bölüm denemek için: TASARIM_SADECE="profil|takım" node testler/tasarim-testleri.js
  const sadece = process.env.TASARIM_SADECE ? new RegExp(process.env.TASARIM_SADECE) : null;
  async function guvenli(ad, f) { if (sadece && !sadece.test(ad)) return; try { await f(); } catch (e) { kalan.push(`${ad}: yarıda kaldı -> ${String(e.message || e).split('\n')[0]}`); } }
  /** Sahte veritabanını değiştirir (sayfa açıkken; sonra yeniden yüklenmeli). */
  const dbDegistir = (p, f, arg) => p.evaluate(([kod, arg]) => {
    const db = JSON.parse(localStorage.getItem('sahte-db-v1'));
    new Function('db', 'arg', kod)(db, arg);
    localStorage.setItem('sahte-db-v1', JSON.stringify(db));
  }, [`(${f.toString()})(db, arg)`, arg]);
  // Odaklanan öğe sabit/yapışkan çubukların altında mı? Öğenin üzerinde 9 noktada en üstteki öğeye bakılır (z sırası hesaba katılır):
  // nokta bir çubuğa (üst bar, alt menü, yapışkan filtre/sekme) aitse örtülmüş sayılır. Sonuç 0..1 (0 = hiç örtülmemiş).
  const ortulme = (p) => p.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return 0;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return 0;
    const cubuk = 'header.ust, nav.alt-nav, .filtreler, .sekme-yapiskan';
    let ortu = 0, n = 0;
    for (const fx of [0.1, 0.5, 0.9]) for (const fy of [0.15, 0.5, 0.85]) {
      const x = r.left + r.width * fx, y = r.top + r.height * fy;
      if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
      n += 1;
      const ust = document.elementFromPoint(x, y);
      if (ust && !el.contains(ust) && !ust.contains(el) && ust.closest(cubuk) && !el.closest(cubuk)) ortu += 1;
    }
    const oran = n ? Math.round((ortu / n) * 100) / 100 : 0;
    // Görünür alandan büyük öğe (ör. odaklanabilir sekme paneli) tamamen sığamaz: onda ölçüt "tamamen örtülmemiş" (2.4.11)
    if (r.height > innerHeight * 0.6) return oran >= 1 ? 1 : 0;
    return oran;
  });
  const odakBodyde = (p) => p.evaluate(() => !document.activeElement || document.activeElement === document.body);

  // ------------------------------------------------------------------ her ekran: yapı, menü, canlı bölgeler
  const EKRANLAR = [
    ['index.html', '#akis[data-durum="tamam"]', 'Ana Sayfa', 'page'],
    ['goller.html', '#arsiv[data-durum="tamam"]', 'Gol Arşivi', 'page'],
    ['takim.html', '#kadro-icerik[data-durum="tamam"]', 'Takım', 'page'],
    ['profil.html', '#profil[data-durum="tamam"]', 'Profil', 'page'],
    [`gol.html?id=${G1}`, '#gol[data-durum="tamam"]', 'Gol Arşivi', 'true'],
    [`haber.html?id=${H1}`, '#haber[data-durum="tamam"]', 'Ana Sayfa', 'true'],
    [`mac.html?id=${M1}`, '#mac[data-durum="tamam"]', 'Takım', 'true'],
    ['oyuncu.html?id=55555555-0000-4000-8000-000000000007', '#oyuncu[data-durum="tamam"]', 'Takım', 'true'], // 018
    ['giris.html', '#g-eposta', 'Profil', 'true'],
    ['sifre.html', '#sifre-icerik, main form, main .mesaj', 'Profil', 'true'],
    // Künye sayfalarına Profil'den gidilir: Profil sekmesi etkin (true) ve üst barda geri düğmesi (tasarımcı 9)
    ['kurallar.html', '#kurallar', 'Profil', 'true'],
    ['gizlilik.html', '#son-guncelleme', 'Profil', 'true'],
    ['kaynaklar.html', '#kaynak-listesi', 'Profil', 'true'],
  ];
  await guvenli('ekran yapısı', async () => {
    const { ctx, p } = await baglam();
    const basliklar = new Set();
    for (const [url, bekle, etkin, deger] of EKRANLAR) {
      const ad = url.split('?')[0];
      await git(p, url, bekle);
      const d = await p.evaluate(() => {
        const gorunur = (e) => { const r = e.getBoundingClientRect(); return !e.closest('[hidden]') && (r.width > 0 || e.classList.contains('gorunmez')); };
        const hs = [...document.querySelectorAll('h1,h2,h3,h4')].filter((e) => !e.closest('dialog,[hidden],.reklam-kart') && gorunur(e)).map((e) => Number(e.tagName[1]));
        const nav = document.querySelector('nav.alt-nav');
        const linkler = nav ? [...nav.querySelectorAll('a')] : [];
        const main = document.querySelector('main'), foot = document.querySelector('footer');
        return {
          lang: document.documentElement.lang, title: document.title,
          mainSayi: document.querySelectorAll('main').length, header: document.querySelectorAll('body > header, header.ust').length,
          navEtiket: nav && nav.getAttribute('aria-label'), resmiDegil: !!document.querySelector('.resmi-degil')?.closest('header,main'),
          hs, linkAd: linkler.map((a) => a.textContent.trim()), linkCurrent: linkler.map((a) => a.getAttribute('aria-current')),
          tabRol: nav ? nav.querySelectorAll('[role=tab]').length : -1,
          simgeGizli: linkler.every((a) => [...a.querySelectorAll('svg')].every((s) => s.getAttribute('aria-hidden') === 'true')),
          sira: main && nav && foot ? !!(main.compareDocumentPosition(nav) & 4) && !!(nav.compareDocumentPosition(foot) & 4) : false,
          viewport: document.querySelector('meta[name=viewport]')?.content || '',
          durum: (() => { const a = document.getElementById('durum'), b = document.getElementById('uyari'); return a && b && a.getAttribute('role') === 'status' && b.getAttribute('role') === 'alert'; })(),
          canliListe: [...document.querySelectorAll('ul, ol, #akis, #arsiv, #yorum-listesi')].filter((e) => e.closest('[aria-live]')).map((e) => e.id || e.className).slice(0, 3),
        };
      });
      basliklar.add(d.title);
      kontrol(`${ad}: lang=tr, başlık "… · Çorumspor Taraftar" (T-02)`, d.lang === 'tr' && / · Çorumspor Taraftar$/.test(d.title), d.title);
      kontrol(`${ad}: tek main, üst bilgi, "Ana gezinme" menüsü, şerit main içinde (T-03)`, d.mainSayi === 1 && d.header >= 1 && d.navEtiket === 'Ana gezinme' && d.resmiDegil, JSON.stringify(d).slice(0, 200));
      kontrol(`${ad}: tek h1, ilk başlık h1, seviye atlaması yok (T-05)`, d.hs[0] === 1 && d.hs.filter((x) => x === 1).length === 1 && d.hs.every((x, i) => i === 0 || x - d.hs[i - 1] <= 1), d.hs.join(','));
      kontrol(`${ad}: alt menüde sırayla Ana Sayfa · Gol Arşivi · Takım · Profil, rol=tab yok, simgeler gizli (T-90/T-93)`, d.linkAd.join('|') === 'Ana Sayfa|Gol Arşivi|Takım|Profil' && d.tabRol === 0 && d.simgeGizli, d.linkAd.join('|'));
      const beklenen = ['Ana Sayfa', 'Gol Arşivi', 'Takım', 'Profil'].map((x) => (x === etkin ? deger : null));
      kontrol(`${ad}: aria-current yalnız ${etkin ? `"${etkin}" bağlantısında (${deger})` : 'hiçbir bağlantıda değil (künye sayfası)'} (T-91)`, JSON.stringify(d.linkCurrent) === JSON.stringify(beklenen), JSON.stringify(d.linkCurrent));
      kontrol(`${ad}: DOM sırası main → alt menü → alt bilgi; viewport-fit=cover (T-95/T-97)`, d.sira && /viewport-fit=cover/.test(d.viewport));
      kontrol(`${ad}: #durum (status) ve #uyari (alert) hazır; listeler aria-live içinde değil (T-13/T-61)`, d.durum && !d.canliListe.length, JSON.stringify(d.canliListe));
    }
    kontrol('her ekranın sekme başlığı farklı (T-02)', basliklar.size === EKRANLAR.length, [...basliklar].join(' | '));
    // safe-area: alt menünün alt boşluğu env(safe-area-inset-bottom) (CSSOM)
    const safe = await p.evaluate(() => [...document.styleSheets].some((s) => { try { return [...s.cssRules].some((r) => r.selectorText === '.alt-nav' && /safe-area-inset-bottom/.test(r.style.padding || r.style.paddingBottom || r.cssText)); } catch (e) { return false; } }));
    kontrol('alt menü: padding-bottom env(safe-area-inset-bottom) (T-95)', safe);
    await ctx.close();
  });

  // ------------------------------------------------------------------ klavye: atlama bağlantısı, odak halkası, örtme
  for (const vp of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
    await guvenli(`klavye ${vp.width}`, async () => {
      const { ctx, p } = await baglam(vp);
      for (const [url, bekle] of [['index.html', '#akis[data-sponsor-durum="tamam"]'], ['goller.html', '#arsiv[data-durum="tamam"] .arsiv-mac'], [`gol.html?id=${G1}`, '#yorumlar .yorumlar'], ['takim.html#fikstur', '#gelecek[data-durum="tamam"]']]) {
        const ad = `${url.split(/[?#]/)[0]} ${vp.width}×${vp.height}`;
        await git(p, url, bekle);
        await p.keyboard.press('Tab');
        const ilk = await p.evaluate(() => document.activeElement.textContent.trim());
        kontrol(`${ad}: ilk Tab "İçeriğe geç" (T-04)`, ilk === 'İçeriğe geç', ilk);
        await p.keyboard.press('Enter');
        kontrol(`${ad}: Enter sonrası odak içerikte (T-04)`, await p.evaluate(() => !!document.activeElement.closest('#icerik')));
        const sorunlar = [];
        let adim = 0;
        for (const yon of ['Tab', 'Shift+Tab']) {
          for (let i = 0; i < 30; i++) {
            await p.keyboard.press(yon);
            adim += 1;
            await durulsun(p);
            const o = await ortulme(p);
            const halka = await p.evaluate(() => {
              const e = document.activeElement; if (!e || e === document.body || e.tagName === 'IFRAME') return 'yok';
              const c = getComputedStyle(e); const lab = e.matches('input[type=radio],input[type=checkbox]') ? e.labels && e.labels[0] : null;
              const cl = lab ? getComputedStyle(lab) : null;
              // Halka öğenin kendisinde, radyonun etiketinde ya da :focus-within ile kartın kendisinde (hero) olabilir
              const kap = e.closest('.hero'); const kc = kap ? getComputedStyle(kap) : null;
              const ok = (c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) >= 2) || /\d+px/.test(c.boxShadow) || (cl && cl.outlineStyle !== 'none' && parseFloat(cl.outlineWidth) >= 2) || (kc && kc.outlineStyle !== 'none' && parseFloat(kc.outlineWidth) >= 2);
              return ok ? '' : (e.id || e.className || e.tagName) + ' ' + (e.getAttribute('href') || '') + ' ' + c.outlineStyle + '/' + c.outlineWidth;
            });
            if (o > 0) sorunlar.push(`örtülme ${o} @${await p.evaluate(() => document.activeElement.textContent.trim().slice(0, 30) || document.activeElement.id)}`);
            if (halka && halka !== 'yok') sorunlar.push('halka yok: ' + halka);
          }
        }
        kontrol(`${ad}: Tab/Shift+Tab ${adim} adım: her odakta görünür halka (≥2 px), sabit çubuklar odağı örtmüyor (T-06/T-07/T-96)`, !sorunlar.length, [...new Set(sorunlar)].join(' | '));
      }
      await ctx.close();
    });
  }

  // ------------------------------------------------------------------ dokunma hedefleri, taşma, animasyon
  await guvenli('hedef ve taşma', async () => {
    for (const tema of ['light', 'dark']) {
      const { ctx, p } = await baglam({ width: 320, height: 800 }, { ekstra: { colorScheme: tema } });
      for (const [url, bekle] of EKRANLAR) {
        const ad = `${url.split('?')[0]} 320 (${tema === 'dark' ? 'koyu' : 'açık'})`;
        await git(p, url, bekle);
        await p.waitForTimeout(80);
        const d = await p.evaluate(() => {
          const kucuk = [];
          for (const e of document.querySelectorAll('main a, main button, main input, main select, main textarea, main [role=tab], nav.alt-nav a, header a, header button')) {
            if (e.closest('[hidden], dialog:not([open]), .atla') || e.classList.contains('gorunmez')) continue;
            const hedef = e.matches('input[type=radio],input[type=checkbox]') && e.labels && e.labels[0] ? e.labels[0] : e;
            const r = hedef.getBoundingClientRect();
            if (!r.width && !r.height) continue;
            const satirIci = getComputedStyle(e).display === 'inline' && e.closest('p, li, dd, td, figcaption, .foto-atif, small, label');
            if (satirIci) { if (r.height < 16) kucuk.push('satır içi ' + e.textContent.trim().slice(0, 20)); continue; }
            if (r.width < 44 - 0.5 || r.height < 44 - 0.5) kucuk.push(`${(e.id || e.textContent.trim().slice(0, 20) || e.className)} ${Math.round(r.width)}×${Math.round(r.height)}`);
          }
          const etiketler = [...document.querySelectorAll('nav.alt-nav a')].map((a) => a.scrollWidth <= a.clientWidth + 1);
          const navUst = [...document.querySelectorAll('nav.alt-nav a')].map((a) => Math.round(a.getBoundingClientRect().top));
          return { tasma: document.documentElement.scrollWidth - innerWidth, kucuk, etiket: etiketler.every(Boolean), tekSatir: new Set(navUst).size === 1 };
        });
        kontrol(`${ad}: yatay taşma yok (T-09)`, d.tasma <= 0, d.tasma);
        kontrol(`${ad}: bağımsız dokunma hedefleri ≥44×44 (satır içi metin bağlantıları hariç) (T-08)`, !d.kucuk.length, d.kucuk.join(', '));
        kontrol(`${ad}: alt menü 4 öğe tek satır, etiketler kırpılmıyor (T-92)`, d.etiket && d.tekSatir);
      }
      await ctx.close();
    }
    // 320 px + %200 yazı: alt menü etiketleri yine kırpılmıyor, hero yazısı kesilmiyor (T-23/T-92)
    const { ctx, p } = await baglam({ width: 320, height: 800 });
    await git(p, 'index.html', '#akis[data-durum="tamam"]');
    await p.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    await p.waitForTimeout(100);
    const b = await p.evaluate(() => {
      const y = document.querySelector('.hero-yazi');
      return { etiket: [...document.querySelectorAll('nav.alt-nav a')].every((a) => a.scrollWidth <= a.clientWidth + 1), hero: y ? y.scrollHeight <= y.clientHeight + 1 && document.querySelector('.hero').getBoundingClientRect().height >= y.getBoundingClientRect().height - 1 : false, tasma: document.documentElement.scrollWidth - innerWidth };
    });
    kontrol('ana 320 + %200 yazı: menü etiketleri ve hero yazısı kırpılmıyor, taşma yok (T-23/T-92)', b.etiket && b.hero && b.tasma <= 0, JSON.stringify(b));
    // 1.4.4 / 1.4.10: diğer ekranlar da %200 yazıda yatay kaydırma istemez
    for (const [url, bekle] of EKRANLAR.slice(1)) {
      await git(p, url, bekle);
      await p.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
      await p.waitForTimeout(80);
      const t = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      kontrol(`${url.split('?')[0]} 320 + %200 yazı: yatay taşma yok (T-23)`, t <= 0, t);
    }
    await ctx.close();
  });

  // 019: fikstür takvimi 320 px'te (ve %200 yazıda) taşmaz, maç günleri ≥44×44; önizleme penceresi klavyeyle (Tab penceren dışına çıkmaz)
  await guvenli('takvim (019)', async () => {
    const { ctx, p } = await baglam({ width: 320, height: 800 });
    await git(p, 'takim.html#fikstur', '#gelecek[data-durum="tamam"]');
    await p.click('#fikstur-gorunum [data-gorunum="takvim"]');
    await p.waitForSelector('#takvim-izgara');
    for (const yazi of ['100%', '200%']) {
      await p.evaluate((y) => { document.documentElement.style.fontSize = y; }, yazi);
      await p.waitForTimeout(80);
      const d = await p.evaluate(() => ({
        tasma: document.documentElement.scrollWidth - innerWidth,
        kucuk: [...document.querySelectorAll('#fikstur-takvim button, #fikstur-gorunum button')].map((b) => b.getBoundingClientRect()).filter((r) => r.width < 43.5 || r.height < 43.5).map((r) => `${Math.round(r.width)}×${Math.round(r.height)}`),
      }));
      kontrol(`takvim (019) 320 px + ${yazi} yazı: yatay taşma yok, maç günü / ay / görünüm düğmeleri ≥44×44 (T-08/T-09)`, d.tasma <= 0 && !d.kucuk.length, JSON.stringify(d));
    }
    await p.evaluate(() => { document.documentElement.style.fontSize = ''; });
    await p.click('.takvim-gun:not(.oynandi)'); // oynanmamış maç: Maç sayfası, Takvime ekle, Kapat
    await p.waitForSelector('#takvim-onizleme[open]');
    const icerde = [];
    for (let i = 0; i < 2; i++) { await p.keyboard.press('Tab'); icerde.push(await p.evaluate(() => !!document.activeElement.closest('#takvim-onizleme'))); }
    kontrol('takvim (019): önizleme penceresi açıkken Tab pencerenin içinde kalır (arka plan inert)', icerde.every(Boolean), JSON.stringify(icerde));
    await ctx.close();
  });

  await guvenli('animasyon', async () => {
    for (const hareket of ['no-preference', 'reduce']) {
      const { ctx, p } = await baglam({ width: 390, height: 844 }, { reklam: true, ekstra: { reducedMotion: hareket } });
      for (const [url, bekle] of [['index.html', '#akis[data-sponsor-durum="tamam"]'], ['goller.html', '#arsiv[data-durum="tamam"]'], [`mac.html?id=${M1}`, '#mac[data-durum="tamam"]'], ['takim.html', '#kadro-icerik[data-durum="tamam"]']]) {
        await git(p, url, bekle);
        await p.waitForTimeout(400);
        const d = await p.evaluate(() => {
          const l = document.getAnimations();
          return { sonsuz: l.filter((a) => a.effect && a.effect.getTiming().iterations === Infinity).map((a) => a.animationName || a.id || 'anim'), calisan: l.filter((a) => a.playState === 'running').length };
        });
        kontrol(`${url.split('?')[0]} (${hareket}): sonsuz animasyon yok (canlı rozeti ve iskeletler dahil) (T-11/T-124)`, !d.sonsuz.length, d.sonsuz.join(','));
        if (hareket === 'reduce') kontrol(`${url.split('?')[0]} (reduce): yüklendikten sonra çalışan animasyon yok (T-11/T-109)`, d.calisan === 0, d.calisan);
      }
      await ctx.close();
    }
  });

  // ------------------------------------------------------------------ alt menü sanal klavyede gizlenir
  await guvenli('sanal klavye', async () => {
    const { ctx, p } = await baglam({ width: 390, height: 844 });
    await git(p, 'giris.html', '#g-eposta');
    await p.setViewportSize({ width: 390, height: 500 });
    await p.focus('#g-eposta');
    await p.waitForTimeout(150);
    const d = await p.evaluate(() => { const n = document.querySelector('nav.alt-nav'); const r = n.getBoundingClientRect(); return { gizli: n.hasAttribute('inert') || r.top >= innerHeight - 1 || getComputedStyle(n).visibility === 'hidden' }; });
    kontrol('sanal klavye açıkken (yükseklik 500) alt menü gizli/inert ve odaklı alanı örtmüyor (T-62)', d.gizli && (await ortulme(p)) === 0, JSON.stringify(d));
    await ctx.close();
  });

  // ------------------------------------------------------------------ filtreler (gol arşivi)
  await guvenli('filtreler', async () => {
    const { ctx, p } = await baglam({ width: 390, height: 844 });
    await git(p, 'goller.html', '#arsiv[data-durum="tamam"] .arsiv-mac');
    const sezon = p.getByRole('group', { name: 'Sezon' }), rakip = p.getByRole('group', { name: 'Rakip' });
    kontrol('goller: "Sezon" ve "Rakip" grupları (fieldset/legend), içlerinde radyolar (T-40)', (await sezon.getByRole('radio').count()) >= 1 && (await rakip.getByRole('radio').count()) >= 3);
    const girdi = await p.evaluate(() => { const i = document.querySelector('input[name=rakip]'); return { gorunum: getComputedStyle(i).display }; });
    kontrol('goller: radyo girdisi display:none değil (klavye/ekran okuyucu erişir) (T-45)', girdi.gorunum !== 'none');
    // Tab ile Rakip grubuna gel: odak seçili radyoda
    await p.focus('input[name=rakip]:checked');
    const y0 = await p.evaluate(() => scrollY);
    await p.keyboard.press('ArrowRight');
    await p.waitForFunction(() => document.querySelector('#arsiv').dataset.durum === 'tamam');
    await duyuruBekle(p, /gol\.|bulunamadı/);
    const d = await p.evaluate(() => ({ odak: document.activeElement.name + ':' + document.activeElement.checked, deger: document.querySelector('input[name=rakip]:checked').value, durum: document.getElementById('durum').textContent, y: scrollY, url: location.search, halka: getComputedStyle(document.activeElement.labels[0]).outlineStyle }));
    kontrol('goller: → sonraki rakibi seçer, odak radyoda kalır, kaydırma değişmez (T-41/T-42)', d.odak === 'rakip:true' && d.deger !== '' && Math.abs(d.y - y0) < 2, JSON.stringify(d));
    kontrol('goller: sonuç sayısı #durum ile duyurulur ("N gol" ya da "bulunamadı") (T-42)', /\d+ gol\.|bulunamadı/.test(d.durum), d.durum);
    kontrol('goller: odaktaki hapın etiketinde görünür halka (T-45)', d.halka !== 'none', d.halka);
    kontrol('goller: adres ?sezon=…&rakip=… güncellendi (T-43)', /sezon=/.test(d.url) && /rakip=/.test(d.url), d.url);
    const say = await p.$$eval('#arsiv .gol-satir, #arsiv .video-kart', (l) => l.length);
    await p.goto(ADRES + '/goller.html' + d.url);
    await p.waitForSelector('#arsiv[data-durum="tamam"]');
    const d2 = await p.evaluate(() => ({ deger: document.querySelector('input[name=rakip]:checked').value, n: document.querySelectorAll('#arsiv .gol-satir, #arsiv .video-kart').length }));
    kontrol('goller: bu adresle açınca aynı radyo seçili, aynı sonuç (T-43)', d2.deger === d.deger && d2.n === say, JSON.stringify(d2));
    // Seçili hap ile seçilmemiş arasındaki fark: ✓ işareti (renk dışında) (T-44)
    const isaret = await p.evaluate(() => { const l = document.querySelector('input[name=rakip]:checked').labels[0]; const z = document.querySelector('input[name=rakip]:not(:checked)').labels[0]; return [getComputedStyle(l, '::before').content, getComputedStyle(z, '::before').content]; });
    kontrol('goller: seçili hapta ✓ şekli var, seçilmemişte yok (yalnız renkle ayrılmıyor) (T-44)', isaret[0] !== 'none' && isaret[1] === 'none', isaret.join(' / '));
    // Sezon adı Temmuz–Haziran
    const sezonlar = await p.$$eval('input[name=sezon]', (l) => l.map((i) => i.value));
    kontrol('goller: sezon değerleri "2026-27" biçiminde (Temmuz–Haziran)', sezonlar.length && sezonlar.every((s) => /^\d{4}-\d{2}$/.test(s)), sezonlar.join(','));
    // her kapak gol.html?id= bağlantısı; adı oyuncu ve dakika içerir; görsel alt="" (T-31)
    const kartlar = await p.$$eval('#arsiv a.video-kart, #arsiv a.gol-satir', (l) => l.map((a) => ({ href: a.getAttribute('href'), ad: (a.getAttribute('aria-label') || a.textContent).replace(/\s+/g, ' ').trim(), alt: [...a.querySelectorAll('img')].map((i) => i.getAttribute('alt')) })));
    kontrol('goller: her gol tek bağlantı gol.html?id=…, adında dakika, kapak görseli alt="" (T-31)', kartlar.length > 0 && kartlar.every((k) => /^gol\.html\?id=[0-9a-f-]{36}$/.test(k.href) && /dakika/.test(k.ad) && k.alt.every((x) => x === '')), JSON.stringify(kartlar[0]));
    // 2. tur (erişilebilirlik 9): ad tek cümle; rakip bir kez, başıboş " , " yok
    kontrol('goller (2. tur): gol kartı adı tek cümle ("Ali Örnek, 67. dakika · Kurgu Gençlik 1 – 1 Çorum FK, 29 Ekim · Kafa golü · video 0:38"), rakip bir kez', kartlar.every((k) => /^[^,]+, \d+(\+\d+)?\. dakika · /.test(k.ad) && !/ , /.test(k.ad) && (k.ad.match(/Kurgu Gençlik|Örnekköy Spor/g) || []).length <= 1), JSON.stringify(kartlar.map((k) => k.ad)));
    await ctx.close();
  });

  // ------------------------------------------------------------------ gol sayfası: facade, odak, paylaş
  await guvenli('gol sayfası', async () => {
    const { ctx, p } = await baglam({ width: 390, height: 844 });
    const yt = [];
    p.on('request', (r) => { if (/youtube|ytimg|googlevideo/.test(r.url())) yt.push(r.url()); });
    await git(p, `gol.html?id=${G1}`, '#gol[data-durum="tamam"] .video-baslat');
    const d = await p.evaluate(() => ({ h1: [...document.querySelectorAll('h1')].map((x) => x.textContent), iframe: document.querySelectorAll('iframe').length, video: [...document.querySelectorAll('video')].map((v) => v.paused), not: document.getElementById('video-not')?.textContent || '', paylas: document.querySelector('a[href^="https://wa.me/?text="]')?.textContent.trim() || '' }));
    kontrol('gol: tek h1 oyuncu adını içeriyor (T-50)', d.h1.length === 1 && /Ali Örnek/i.test(d.h1[0]), d.h1.join('|'));
    kontrol('gol: açılışta iframe yok, oynayan medya yok, YouTube\'a istek yok (facade) (T-51)', d.iframe === 0 && d.video.every(Boolean) && yt.length === 0, yt.join(' '));
    kontrol('gol: "altyazı" notu görünür (T-53), WhatsApp ile paylaş bağlantısı var', /altyazı/i.test(d.not) && /WhatsApp/.test(d.paylas), JSON.stringify(d));
    await p.focus('.video-baslat');
    await p.keyboard.press('Enter');
    await p.waitForSelector('iframe');
    const i = await p.evaluate(() => ({ etkin: document.activeElement.tagName, title: document.querySelector('iframe').title, src: document.querySelector('iframe').src }));
    kontrol('gol: Enter ile oynatıcı eklenir, odak iframe\'e geçer, başlığı var, nocookie adresi (T-52)', i.etkin === 'IFRAME' && i.title.length > 5 && /^https:\/\/www\.youtube-nocookie\.com\/embed\//.test(i.src) && /cc_lang_pref=tr/.test(i.src), JSON.stringify(i));
    await ctx.close();
  });

  // ------------------------------------------------------------------ yorumlar (gol sayfasında, gol_id ile)
  await guvenli('yorum erişilebilirliği', async () => {
    const { ctx, p } = await baglam({ width: 390, height: 844 });
    await git(p, 'giris.html?donus=' + encodeURIComponent(`gol.html?id=${G1}`), '#g-eposta');
    await p.fill('#g-eposta', 'taraftar@ornek.test');
    await p.fill('#g-sifre', 'sifre1234');
    await Promise.all([p.waitForURL((u) => u.pathname.endsWith('/gol.html')), p.click('#g-gonder')]);
    await p.waitForSelector('#yorum-metni');
    const e = await p.evaluate(() => ({ etiket: document.querySelector('label[for=yorum-metni]')?.textContent, tarif: document.getElementById('yorum-metni').getAttribute('aria-describedby'), maks: document.getElementById('yorum-metni').hasAttribute('maxlength') }));
    kontrol('yorum: görünür etiket "Yorumun" (label[for]), aria-describedby ipucu + mesaj, maxlength yok (sessiz kesme yok) (T-54)', e.etiket === 'Yorumun' && /yorum-ipucu/.test(e.tarif) && /yorum-mesaj/.test(e.tarif) && !e.maks, JSON.stringify(e));
    await p.click('#yorum-formu button[type=submit]');
    const bos = await p.evaluate(() => ({ gecersiz: document.getElementById('yorum-metni').getAttribute('aria-invalid'), odak: document.activeElement.id, mesaj: document.getElementById('yorum-mesaj').textContent, rol: document.getElementById('yorum-mesaj').getAttribute('role') }));
    kontrol('yorum: boş gönderim aria-invalid, odak alanda, hata metni bağlı (T-55)', bos.gecersiz === 'true' && bos.odak === 'yorum-metni' && /Boş yorum/.test(bos.mesaj), JSON.stringify(bos));
    // ekleme: eski li'ler aynı düğüm kalır, tek li eklenir, odak alanda
    await p.evaluate(() => document.querySelectorAll('#yorum-listesi > li').forEach((li) => { li.dataset.eski = '1'; }));
    const once = await p.$$eval('#yorum-listesi > li:not(.bos)', (l) => l.length);
    await p.fill('#yorum-metni', 'Bu gol için tribün ayağa kalktı!');
    await p.evaluate(() => { const b = document.querySelector('#yorum-formu button[type=submit]'); window.__dis = []; new MutationObserver(() => window.__dis.push(b.disabled + ':' + b.getAttribute('aria-disabled'))).observe(b, { attributes: true }); });
    await p.dblclick('#yorum-formu button[type=submit]');
    await p.waitForFunction(() => /tribüne düştü/.test(document.getElementById('yorum-mesaj').textContent));
    await p.waitForTimeout(150);
    const s = await p.evaluate(() => ({ yeni: document.querySelectorAll('#yorum-listesi > li:not([data-eski]):not(.bos)').length, eski: document.querySelectorAll('#yorum-listesi > li[data-eski]:not(.bos)').length, odak: document.activeElement.id, dis: window.__dis, durum: document.getElementById('durum').textContent }));
    kontrol('yorum: çift tıklama tek kayıt, gönderirken aria-disabled (disabled değil) (T-57)', s.yeni === 1 && s.dis.includes('false:true') && !s.dis.some((x) => x.startsWith('true')), JSON.stringify(s));
    kontrol('yorum: liste yeniden çizilmedi (eski öğeler aynı düğüm), odak yazı alanında, duyuru yapıldı (T-56/T-121)', s.eski === once && s.odak === 'yorum-metni' && /eklendi/.test(s.durum), JSON.stringify(s));
    // Sil: odak body'ye düşmez (T-59)
    const benim = p.locator('#yorum-listesi .yorum', { hasText: 'Bu gol için tribün' });
    await benim.getByRole('button', { name: 'Sil' }).click();
    await p.waitForFunction(() => !/Bu gol için tribün/.test(document.querySelector('#yorum-listesi').textContent));
    await duyuruBekle(p, /silindi/);
    kontrol('yorum: silince odak body\'ye düşmez, "silindi" duyurulur (T-59/T-121)', !(await odakBodyde(p)) && /silindi/i.test(await p.textContent('#durum')), await p.textContent('#durum'));
    // Başkasının yorumunda "Şikâyet et" (maç sayfası, burak'ın yorumu): neden seçilir, gönderilir, odak teşekkür notuna
    await git(p, `mac.html?id=${M1}#yorumlar`, '#yorum-listesi .yorum');
    const baska = p.locator('#yorum-listesi .yorum').filter({ hasNot: p.getByRole('button', { name: 'Sil' }) }).first();
    if (await baska.count()) {
      await baska.getByRole('button', { name: 'Şikâyet et' }).click();
      const sec = baska.locator('select');
      kontrol('yorum (013): "Şikâyet et" neden listesi açar (etiketli seçim)', (await sec.count()) === 1 && (await sec.evaluate((s) => !!(s.labels && s.labels.length) || !!s.getAttribute('aria-label'))));
      await sec.selectOption('hakaret');
      await baska.getByRole('button', { name: 'Şikâyeti gönder' }).click();
      await p.waitForFunction(() => /Şikâyetin bize ulaştı/.test(document.querySelector('#yorum-listesi').textContent));
      kontrol('yorum (013): şikâyet gönderildi, odak teşekkür notunda (body\'ye düşmez)', await p.evaluate(() => /^sikayet-tamam-/.test(document.activeElement.id)));
    } else kontrol('yorum (013): sayfada başkasının yorumu var (şikâyet denemesi)', false);
    await ctx.close();
  });

  // ------------------------------------------------------------------ profil: tema grubu, çıkış penceresi
  await guvenli('profil', async () => {
    const { ctx, p } = await baglam({ width: 390, height: 844 });
    await git(p, 'giris.html?donus=profil.html', '#g-eposta');
    await p.fill('#g-eposta', 'taraftar@ornek.test');
    await p.fill('#g-sifre', 'sifre1234');
    await Promise.all([p.waitForURL((u) => u.pathname.endsWith('/profil.html')), p.click('#g-gonder')]);
    await p.waitForSelector('#profil[data-durum="tamam"]');
    await p.waitForSelector('#cikis');
    kontrol('profil: üye görünümü kullanıcı adını, "Yorumlarım" ve çıkışı gösterir', /ayse_19/.test(await p.textContent('#profil')) && (await p.$$('#yorumlarim')).length === 1);
    await p.focus('#tema-sistem');
    await p.keyboard.press('ArrowRight');
    kontrol('profil: tema radyolarında ok tuşu "Açık"ı seçer, odak radyoda (T-80)', await p.evaluate(() => document.activeElement.id === 'tema-acik' && document.documentElement.dataset.theme === 'light'));
    await p.click('#cikis');
    await p.waitForTimeout(200); // odak değişimi sonrası klavye izleyicisi (50 ms) menünün inert'ini kaldırmamalı
    const ac = await p.evaluate(() => ({ acik: document.getElementById('cikis-onay').open, odakIcinde: !!document.activeElement.closest('dialog'), inert: ['#icerik', '#alt-nav'].every((s) => document.querySelector(s).hasAttribute('inert')) }));
    kontrol('profil: çıkış onayı dialog[open], odak pencerede, arkada main ve alt menü inert (T-82)', ac.acik && ac.odakIcinde && ac.inert, JSON.stringify(ac));
    await p.keyboard.press('Escape');
    await p.waitForFunction(() => !document.querySelector('#icerik').hasAttribute('inert')).catch(() => {}); // close olayı bir görev sonra
    const kapa = await p.evaluate(() => ({ acik: document.getElementById('cikis-onay').open, odak: document.activeElement.id, inert: document.querySelector('#icerik').hasAttribute('inert') }));
    kontrol('profil: Esc kapatır, odak "Çıkış yap" düğmesine döner, inert kalkar (T-82)', !kapa.acik && kapa.odak === 'cikis' && !kapa.inert, JSON.stringify(kapa));
    await p.click('#cikis');
    await Promise.all([p.waitForURL((u) => u.pathname.endsWith('/index.html')), p.click('#cikis-evet')]);
    await git(p, 'profil.html', '#profil[data-durum="tamam"] #profil-giris');
    kontrol('profil: "Çıkış yap" onaylanınca ana sayfaya döner; Profil misafir görünümü (Giriş yap / Kayıt ol, simgeli avatar)', (await p.$$('#profil-kayit')).length === 1 && (await p.$$('.misafir-avatar svg')).length === 1);
    await ctx.close();
  });

  // ------------------------------------------------------------------ takım
  await guvenli('takım', async () => {
    const { ctx, p } = await baglam({ width: 390, height: 844 });
    await git(p, 'takim.html', '#kadro-icerik[data-durum="tamam"]');
    const d = await p.evaluate(() => ({ h1: document.querySelector('h1').textContent, h2: [...document.querySelectorAll('[role=tabpanel] > h2')].map((h) => h.textContent), mevki: [...document.querySelectorAll('#kadro-icerik h3')].map((h) => h.textContent) }));
    kontrol('takım: h1 "Takım", panel h2\'leri Kadro / Sakatlık güncellemeleri / Fikstür, mevki h3\'leri (T-70)', d.h1 === 'Takım' && d.h2.join('|') === 'Kadro|Sakatlık güncellemeleri|Fikstür' && d.mevki.length >= 3, JSON.stringify(d));
    await p.click('#sekme-sakatlik');
    await p.waitForSelector('#sakatlik-icerik[data-durum="tamam"]');
    const s = await p.$$eval('#sakatlik-icerik li', (l) => l.map((li) => ({ m: li.textContent, t: !!li.querySelector('time[datetime]'), kaynak: /Kaynak:/.test(li.textContent) })));
    kontrol('takım: sakatlık kayıtlarında durum METİN olarak (Sakat/Cezalı/Durumu belirsiz/Döndü), kaynak ve time[datetime] güncelleme zamanı (T-72)', s.length >= 2 && s.every((x) => /Sakat|Cezalı|Durumu belirsiz|Döndü/.test(x.m) && x.t && x.kaynak), JSON.stringify(s).slice(0, 200));
    kontrol('takım: taslak sakatlık kaydı ziyaretçiye görünmüyor (seed: 3 kayıttan 1\'i taslak)', s.length === 2, s.length);
    kontrol('takım: adres #sakatlik oldu (paylaşılabilir sekme)', /#sakatlik$/.test(p.url()));
    await p.click('#sekme-fikstur');
    await p.waitForSelector('#sonuclar .fikstur-satir');
    const f = await p.$$eval('#gelecek a, #sonuclar a', (l) => l.map((a) => a.textContent.replace(/\s+/g, ' ').trim()));
    kontrol('takım: fikstür bağlantı adlarında saat bir kez; biten maçlarda Galibiyet/Beraberlik/Mağlubiyet sözcüğü (T-73)', f.length >= 3 && f.every((x) => !/(\d{2}:\d{2}).*\1/.test(x)) && f.filter((x) => /Galibiyet|Beraberlik|Mağlubiyet/.test(x)).length >= 2, f.join(' | '));
    await p.goBack();
    await p.waitForFunction(() => document.getElementById('sekme-sakatlik').getAttribute('aria-selected') === 'true');
    kontrol('takım: geri tuşu önceki sekmeye döner (popstate)', true);
    // maclar.html eski adresi takim.html#fikstur'a yönlendirir
    await p.goto(ADRES + '/maclar.html');
    await p.waitForURL(/takim\.html#fikstur/);
    kontrol('maclar.html → takim.html#fikstur yönlendirmesi', /takim\.html#fikstur$/.test(p.url()));
    await ctx.close();
  });

  // ------------------------------------------------------------------ sponsor kartı: sıklık, aynı firma bir kez, boşsa kalkar, geç gelirse kaydırmaz
  const reklamSatiri = (n, firma, ek = {}) => ({
    id: REKLAM_ID(n), firma_adi: firma, kisa_metin: `${firma} taraftara özel menü.`, gorsel_url: 'https://sahte.supabase.co/storage/v1/object/public/reklam-gorselleri/ornek/narcil-1200x628.webp',
    gorsel_kucuk_url: 'https://sahte.supabase.co/storage/v1/object/public/reklam-gorselleri/ornek/narcil-480x251.webp', gorsel_metni: null, dugme_metni: null, telefon: null, sektor_onayi: true,
    baglanti_url: `https://ornek${n}.com.tr/menu`, alan: 'ana_akis', mac_id: null, baslangic: new Date(Date.now() - 864e5).toISOString(), bitis: new Date(Date.now() + 30 * 864e5).toISOString(),
    durum: 'yayinda', oncelik: 10 + n, yayina_alinma: new Date(Date.now() - 864e5).toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), olusturan: 'aaaaaaaa-0000-4000-8000-000000000001', ...ek,
  });
  const haberEkle = (db, arg) => {
    for (let i = 0; i < arg.adet; i++) {
      const t = new Date(Date.now() - (9 + i) * 864e5).toISOString();
      db.haberler.push({ id: arg.idler[i], baslik: `Ek haber ${i + 1}`, ozet: 'Sıklık denemesi.', kapak_url: null, kapak_kaynak: null, manset: false, yayinda: true, yayin_tarihi: t, govde: 'x', yazar_id: db.profiles[0].id, created_at: t, updated_at: t });
    }
  };
  const akisDurumu = (p) => p.evaluate(() => {
    const ogeler = [...document.querySelectorAll('#akis > li')];
    return { sira: ogeler.map((li) => (li.classList.contains('akis-sponsor') ? 'S:' + (li.querySelector('.reklam-firma')?.textContent || '?') : 'H')).join(','), haber: ogeler.filter((li) => !li.classList.contains('akis-sponsor')).length };
  });

  await guvenli('sponsor sıklığı', async () => {
    const { ctx, p } = await baglam({ width: 390, height: 844 });
    await git(p, 'index.html', '#akis[data-sponsor-durum="tamam"]');
    await dbDegistir(p, haberEkle, { adet: 12, idler: Array.from({ length: 12 }, (_, i) => HABER_ID(500 + i)) });
    await dbDegistir(p, (db, arg) => { db.reklamlar.push(...arg); }, [reklamSatiri(1, 'Kebapçı Halil'), reklamSatiri(2, 'Hitit Fırın'), reklamSatiri(3, '  kebapçı halil ', { oncelik: 99 }), reklamSatiri(4, 'Leblebici Ali')]);
    await p.reload();
    await p.waitForSelector('#akis[data-sponsor-durum="tamam"]');
    await p.click('#daha-fazla');
    await p.waitForFunction(() => document.querySelectorAll('#akis > li:not(.akis-sponsor)').length >= 12);
    await p.waitForFunction(() => document.querySelectorAll('#akis > li.akis-sponsor .reklam-kart').length >= 2).catch(() => {});
    const d = await akisDurumu(p);
    const s = d.sira.split(',');
    const yer = s.map((x, i) => (x.startsWith('S:') ? s.slice(0, i).filter((y) => y === 'H').length : -1)).filter((x) => x >= 0);
    const firmalar = s.filter((x) => x.startsWith('S:')).map((x) => x.slice(2).trim().toLocaleLowerCase('tr-TR'));
    kontrol('sponsor (013): ilk kart 3. haberden sonra, sonraki 8 haber sonra (11. haberden sonra)', yer[0] === 3 && yer[1] === 11, d.sira);
    kontrol('sponsor (013): akışta aynı firma iki kez yok (büyük/küçük harf ve boşluk farkı sayılmaz)', firmalar.length >= 2 && new Set(firmalar).size === firmalar.length, firmalar.join(','));
    const kart = p.locator('#akis .akis-sponsor').first();
    const k = await kart.evaluate((li) => {
      const etiket = li.querySelector('.reklam-etiket');
      const odak = [...li.querySelectorAll('a[href], button, [tabindex]')].filter((e) => e.tabIndex >= 0);
      const a = li.querySelector('a.reklam-baglanti');
      const ilkMetin = (() => { const w = document.createTreeWalker(li, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.textContent.trim() && !n.parentElement.closest('[aria-hidden=true]') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP) }); const n = w.nextNode(); return n && n.textContent.trim(); })();
      const yer = li.querySelector('[role=group][aria-label], [role=complementary], aside'); // 014: akışta div role=group (aside li içinde olmaz)
      let canli = false; for (let e = li; e; e = e.parentElement) if (e.hasAttribute && e.hasAttribute('aria-live')) canli = true;
      return {
        ilkMetin, gorunur: !!etiket && etiket.getBoundingClientRect().height > 0, oncesi: getComputedStyle(etiket, '::before').content,
        odak: odak.length, ad: a && (a.innerText || a.textContent).replace(/\s+/g, ' ').trim(), adTam: a && a.textContent.replace(/\s+/g, ' ').trim(),
        rel: a ? [...a.relList] : [], hedef: a && a.target, baslik: li.querySelectorAll('h1,h2,h3,h4,h5,h6').length, canli,
        alt: [...li.querySelectorAll('img')].map((i) => i.getAttribute('alt')), yerAd: yer && (yer.getAttribute('aria-label') || document.getElementById(yer.getAttribute('aria-labelledby') || '')?.textContent || ''),
      };
    });
    kontrol('sponsor: kartın ilk okunan metni "Sponsor" (DOM metni, CSS content değil) ve görünür (T-100/T-14)', k.ilkMetin === 'Sponsor' && k.gorunur && (k.oncesi === 'none' || k.oncesi === 'normal'), JSON.stringify(k));
    kontrol('sponsor: adlandırılmış grup (014: liste öğesinde aside değil), adı "Sponsor" içerir (T-100)', /Sponsor/.test(k.yerAd || ''), k.yerAd);
    kontrol('sponsor: kartta tek odak durağı: düğme bağlantısı; ad "Sponsor: <firma> – Ayrıntılar (yeni sekmede açılır)" (T-101/T-126)', k.odak === 1 && /^Sponsor: .+ – Ayrıntılar \(yeni sekmede açılır\)$/.test(k.adTam), k.adTam);
    kontrol('sponsor: rel sponsored + noopener, target=_blank (T-102)', k.rel.includes('sponsored') && k.rel.includes('noopener') && k.hedef === '_blank', k.rel.join(' '));
    kontrol('sponsor: kartta başlık öğesi yok, aria-live atası yok, görselde alt var ve "reklam görseli" değil (T-103/T-104/T-105)', k.baslik === 0 && !k.canli && k.alt.every((x) => x !== null && !/reklam görseli/i.test(x)), JSON.stringify(k));
    // Kartın kendisi bağlantı değil: firma adına/görsele tıklamak sayfayı terk ettirmez
    await kart.locator('.reklam-firma').click();
    kontrol('sponsor: firma adına dokunmak bağlantı açmaz (yalnız düğme)', /index\.html/.test(p.url()) && ctx.pages().length === 1);
    await ctx.close();
  });

  await guvenli('sponsor boş durum', async () => {
    for (const [ad, hazirla] of [['reklam yok', null], ['modül 404', (ctx) => ctx.route(/\/assets\/reklam\/reklam\.js/, (r) => r.fulfill({ status: 404, body: 'yok' }))]]) {
      const { ctx, p } = await baglam({ width: 390, height: 844 }, { reklam: ad !== 'reklam yok' });
      if (hazirla) await hazirla(ctx);
      await git(p, 'index.html', '#akis[data-sponsor-durum="tamam"]');
      const d = await p.evaluate(() => {
        const li = [...document.querySelectorAll('#akis > li')];
        const r = li.map((x) => x.getBoundingClientRect());
        const bosluk = r.slice(1).map((b, i) => Math.round(b.top - r[i].bottom));
        return { sponsor: document.querySelectorAll('#akis .akis-sponsor, #akis [data-reklam-alan]').length, metin: /Sponsor/i.test(document.querySelector('#akis').textContent), li: li.length, haber: document.querySelectorAll('#akis .haber-satir').length, bosluk };
      });
      kontrol(`sponsor (${ad}): yuva DOM'dan tamamen kalkar, "Sponsor" yazısı yok, li sayısı = haber sayısı, aralıklar eşit (T-106/T-107/SP-9)`, d.sponsor === 0 && !d.metin && d.li === d.haber && d.li >= 6 && new Set(d.bosluk).size <= 1, JSON.stringify(d));
      await ctx.close();
    }
  });

  await guvenli('sponsor geç yerleşme', async () => {
    const { ctx, p } = await baglam({ width: 390, height: 844 }, { reklam: true, once: { sahte_reklam_gecikme: '1500' } });
    await git(p, 'index.html', '#akis[data-durum="tamam"] .haber-satir');
    // Okur 5. haberin bağlantısına odaklanmış (kartın yeri 3. haberden sonra, yani odağın ÜSTÜ)
    const hedef = p.locator('#akis > li:not(.akis-sponsor) a').nth(4);
    await hedef.focus();
    await durulsun(p);
    const y0 = await hedef.evaluate((a) => a.getBoundingClientRect().top);
    await p.waitForSelector('#akis[data-sponsor-durum="tamam"]', { timeout: 6000 });
    const y1 = await hedef.evaluate((a) => a.getBoundingClientRect().top);
    kontrol('sponsor (013): geç gelen kart okunan yeri / odağı kaydırmaz (eklenmez) (T-108/SP-10)', Math.abs(y1 - y0) < 1 && (await p.$$('#akis .akis-sponsor')).length === 0, `${y0} → ${y1}`);
    await p.evaluate(() => localStorage.removeItem('sahte_reklam_gecikme'));
    await p.reload();
    await p.waitForSelector('#akis[data-sponsor-durum="tamam"]');
    kontrol('sponsor: gecikme yokken kart akışla birlikte gelir', (await p.$$('#akis .akis-sponsor .reklam-kart')).length === 1);
    await ctx.close();
  });

  // ------------------------------------------------------------------ şifre sıfırlama (resetPasswordForEmail + sifre.html)
  await guvenli('şifre sıfırlama', async () => {
    const { ctx, p } = await baglam({ width: 390, height: 844 });
    await git(p, 'giris.html', '#g-eposta');
    await p.click('#unuttum-ac');
    await p.waitForSelector('#unuttum-formu:not([hidden])');
    await p.fill('#u-eposta', 'yok-boyle@');
    await p.click('#u-gonder');
    kontrol('şifre: geçersiz e-posta satır içi hata, aria-invalid, odak alanda', await p.evaluate(() => document.getElementById('u-eposta').getAttribute('aria-invalid') === 'true' && document.activeElement.id === 'u-eposta'));
    await p.fill('#u-eposta', 'taraftar@ornek.test');
    await p.click('#u-gonder');
    await p.waitForFunction(() => /şifre yenileme bağlantısı/.test(document.getElementById('unuttum-mesaj').textContent));
    const istek = await p.evaluate(() => JSON.parse(localStorage.getItem('sahte_sifre_sifirlama') || 'null'));
    kontrol('şifre: "Şifremi unuttum" resetPasswordForEmail çağırır, dönüş sifre.html; hesap var/yok söylenmez', istek && istek.email === 'taraftar@ornek.test' && /\/sifre\.html$/.test(istek.redirectTo || ''), JSON.stringify(istek));
    await p.goto(ADRES + '/sifre.html?sahte=1');
    await p.waitForSelector('#sifre-gecersiz:not([hidden])');
    kontrol('şifre: kurtarma oturumu yoksa "Bağlantı geçersiz" ve yeni bağlantı iste', !(await p.isVisible('#sifre-formu')));
    await p.goto(ADRES + '/sifre.html?sahte=1#sahte_kurtarma=taraftar@ornek.test');
    await p.reload(); // yalnız # değişti: aynı belge; e-postadaki bağlantı gibi sayfa baştan açılsın
    await p.waitForSelector('#sifre-formu:not([hidden])');
    await p.fill('#s-sifre', 'yenisifre99');
    await p.fill('#s-sifre2', 'yenisifre98');
    await p.click('#s-gonder');
    kontrol('şifre: iki şifre farklıysa satır içi hata ve odak ikinci alanda', await p.evaluate(() => document.activeElement.id === 's-sifre2' && /aynı değil/.test(document.getElementById('s-sifre2-hata').textContent)));
    await p.fill('#s-sifre2', 'yenisifre99');
    await p.click('#s-gonder');
    await p.waitForSelector('#sifre-bitti:not([hidden])');
    kontrol('şifre: "Şifren yenilendi", odak sonuç kutusunda', await p.evaluate(() => document.activeElement.id === 'sifre-bitti'));
    await p.evaluate(() => import('./assets/istemci.js').then((m) => m.supabase.auth.signOut()));
    // yeni şifreyle giriş
    await git(p, 'giris.html', '#g-eposta');
    await p.fill('#g-eposta', 'taraftar@ornek.test');
    await p.fill('#g-sifre', 'yenisifre99');
    await Promise.all([p.waitForURL((u) => !u.pathname.endsWith('/giris.html')), p.click('#g-gonder')]);
    kontrol('şifre: sifre.html yeni şifreyi kaydeder (updateUser), yeni şifreyle giriş olur', true);
    await ctx.close();
  });

  // ------------------------------------------------------------------ men edilen taraftar yorum yazamaz (profiles.engelli)
  await guvenli('men', async () => {
    const { ctx, p } = await baglam({ width: 390, height: 844 });
    await git(p, 'index.html', '#akis[data-durum="tamam"]');
    await dbDegistir(p, (db) => { db.profiles.find((x) => x.kullanici_adi === 'burak').engelli = true; });
    await git(p, 'giris.html?donus=' + encodeURIComponent(`haber.html?id=${H1}`), '#g-eposta');
    await p.fill('#g-eposta', 'burak@ornek.test');
    await p.fill('#g-sifre', 'sifre1234');
    await Promise.all([p.waitForURL((u) => u.pathname.endsWith('/haber.html')), p.click('#g-gonder')]);
    await p.waitForSelector('#yorumlar .yorumlar');
    kontrol('men (013): engelli hesapta yorum formu yok, açıklama notu var', (await p.$$('#yorum-metni')).length === 0 && /yorum yazmaya kapatıldı/.test(await p.textContent('#yorum-engel-notu')));
    const ek = await p.evaluate(async () => { const { supabase } = await import('./assets/istemci.js'); const r = await supabase.from('yorumlar').insert({ haber_id: '33333333-0000-4000-8000-000000000001', metin: 'deneme' }); return r.error && r.error.message; });
    kontrol('men (013): sunucu (sahte RLS) de engelli hesabın yorumunu reddeder', !!ek, ek);
    await ctx.close();
  });

  // ------------------------------------------------------------------ çevrimdışı: son haberler anında, ağ gelince yenilenir; hata durumu
  await guvenli('çevrimdışı', async () => {
    const { ctx, p } = await baglam({ width: 390, height: 844 });
    await git(p, 'index.html', '#akis[data-durum="tamam"] .haber-satir');
    await git(p, 'goller.html', '#arsiv[data-durum="tamam"] .arsiv-mac');
    const ilk = await p.$$eval('#akis .haber-satir h3', (l) => l.map((h) => h.textContent)).catch(() => []);
    await git(p, 'index.html', '#akis[data-durum="tamam"] .haber-satir');
    const basliklar0 = await p.$$eval('#akis .haber-satir h3', (l) => l.map((h) => h.textContent));
    // Ağ kesildi: her sorgu "Failed to fetch" döner (sahte test modu açık kalır: önbellek anahtarı son-veri-v1-sahte)
    await ctx.route('**/assets/istemci.js', (r) => r.fulfill({ contentType: 'text/javascript', body: `
      const hata = { message: 'Failed to fetch' };
      const zincir = () => new Proxy(function () {}, { get(t, k) { if (k === 'then') return (ok) => setTimeout(() => ok({ data: null, error: hata }), 400); return () => zincir(); } });
      export const sahteMod = true, ayarEksik = false;
      export const supabase = { from: () => zincir(), rpc: () => Promise.resolve({ data: null, error: hata }), storage: { from: () => zincir() },
        auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => ({ error: null }) } };` }));
    await p.reload();
    // Ağ yanıtından ÖNCE (400 ms gecikme) önbellekten çizilmiş olmalı
    await p.waitForSelector('#akis[data-durum="onbellek"] .haber-satir', { timeout: 350 });
    const d0 = await p.$$eval('#akis .haber-satir h3', (l) => l.map((h) => h.textContent));
    await p.waitForSelector('#akis-durum button');
    const d = await p.evaluate(() => ({ durum: document.querySelector('#akis').dataset.durum, not: document.querySelector('#akis-durum').textContent }));
    kontrol('çevrimdışı (013): son haberler localStorage\'dan ANINDA çizilir (ağ yanıtı beklenmez, boş sayfa yok)', d0.length >= 3 && d0[0] === basliklar0[0], JSON.stringify(d0));
    kontrol('çevrimdışı (013): ağ hatasında son görülenler kalır, "Bağlantı yok" notu, son güncelleme zamanı ve "Tekrar dene"', d.durum === 'onbellek' && /Bağlantı yok/.test(d.not) && /itibarıyla/.test(d.not) && /Tekrar dene/.test(d.not), JSON.stringify(d));
    await git(p, 'goller.html', '#arsiv[data-durum="onbellek"]');
    kontrol('çevrimdışı (013): gol arşivi de son görülen golleri gösterir', (await p.$$('#arsiv .arsiv-mac')).length >= 1 && /Bağlantı yok/.test(await p.textContent('#arsiv')));
    // Önbellek de yoksa: hata kutusu + tekrar dene (iskelet sonsuza kadar dönmez)
    await p.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('son-veri')).forEach((k) => localStorage.removeItem(k)));
    await git(p, 'goller.html', '#arsiv[data-durum="hata"]');
    kontrol('çevrimdışı (013): veri ve önbellek yoksa hata kutusu ve "Tekrar dene" (boş sayfa değil)', (await p.getByRole('button', { name: 'Tekrar dene' }).count()) >= 1 && !(await p.$$('#arsiv .iskelet')).length);
    await git(p, 'index.html', '#akis[data-durum="hata"]');
    kontrol('çevrimdışı (013): ana sayfa önbelleksiz: hero metni ve "Tekrar dene"', /İnternet gitti/.test(await p.textContent('#hero-baslik')) && (await p.getByRole('button', { name: 'Tekrar dene' }).count()) >= 1);
    // 2. tur (tasarımcı 4): iskelet sonsuza kadar kalmaz; hero etiketi "Manşet" değil "Bağlantı yok"
    await p.waitForTimeout(500);
    const iskelet = await p.evaluate(() => ({ kalan: [...document.querySelectorAll('main .iskelet')].filter((e) => e.getClientRects().length && !e.closest('[hidden]')).map((e) => e.parentElement.id || e.parentElement.className), etiket: document.querySelector('#hero-etiket').textContent, serit: document.querySelector('#siradaki-serit').textContent }));
    kontrol('çevrimdışı (2. tur): ana sayfada görünür iskelet kalmaz (gol şeridi, maç kartı gizli; şerit fikstür bağlantısı), hero etiketi "Bağlantı yok"', !iskelet.kalan.length && iskelet.etiket === 'Bağlantı yok' && /Fikstür/.test(iskelet.serit), JSON.stringify(iskelet));
    await git(p, 'goller.html', '#arsiv[data-durum="hata"]');
    const gi = await p.evaluate(() => [...document.querySelectorAll('main .iskelet')].filter((e) => e.getClientRects().length && !e.closest('[hidden]')).length);
    kontrol('çevrimdışı (2. tur): gol arşivinde filtre iskeletleri kalmaz', gi === 0, gi);
    void ilk;
    await ctx.close();
  });

  // ------------------------------------------------------------------ 2. tur: odak göstergeleri, gerçek çubuk boyları, yapışkan filtre
  await guvenli('2. tur odak', async () => {
    const { ctx, p } = await baglam({ width: 390, height: 844 });
    // Video "Oynat": halka kapak görselinin ÜSTÜNDE görünür (önceden ekran görüntüsü farkı 0 pikseldi)
    await git(p, `gol.html?id=${G1}`, '#gol[data-durum="tamam"] .video-baslat img');
    await p.waitForFunction(() => document.querySelector('.video-baslat img').complete);
    const once = await p.locator('.video').screenshot({ animations: 'disabled' });
    for (let i = 0; i < 40 && !(await p.evaluate(() => document.activeElement.classList.contains('video-baslat'))); i++) await p.keyboard.press('Tab');
    const odakta = await p.evaluate(() => ({ el: document.activeElement.className, fv: document.activeElement.matches(':focus-visible'), golge: getComputedStyle(document.querySelector('.video-baslat .odak-halka')).boxShadow }));
    const sonra = await p.locator('.video').screenshot({ animations: 'disabled' });
    kontrol('gol (2. tur): klavyeyle odaklanan "Oynat" düğmesinde halka görünür (ekran görüntüsü değişir; halka görselin üstünde) (2.4.7)', odakta.el === 'video-baslat' && odakta.fv && /px/.test(odakta.golge) && !once.equals(sonra), JSON.stringify(odakta));
    // Hero bağlantısı: halka bağlantının kendisinde (outline: none değil)
    await git(p, 'index.html', '#akis[data-durum="tamam"]');
    const heroOnce = await p.locator('#hero').screenshot({ animations: 'disabled' });
    for (let i = 0; i < 20 && !(await p.evaluate(() => !!document.activeElement.closest('#hero-baslik'))); i++) await p.keyboard.press('Tab');
    const hl = await p.evaluate(() => { const c = getComputedStyle(document.activeElement); return { hero: !!document.activeElement.closest('#hero-baslik'), stil: c.outlineStyle, gen: parseFloat(c.outlineWidth), renk: c.outlineColor }; });
    const heroSonra = await p.locator('#hero').screenshot({ animations: 'disabled' });
    kontrol('ana (2. tur): hero bağlantısında ≥3 px açık mavi halka (bağlantının kendisinde), görüntü değişir (2.4.7)', hl.hero && hl.stil === 'solid' && hl.gen >= 3 && hl.renk === 'rgb(138, 180, 248)' && !heroOnce.equals(heroSonra), JSON.stringify(hl));
    // Koyu temada iskelet parıltısı hafif (beyaz leke değil)
    const parilti = await p.evaluate(() => { document.documentElement.dataset.theme = 'dark'; const v = getComputedStyle(document.documentElement).getPropertyValue('--iskelet-parilti').trim(); document.documentElement.removeAttribute('data-theme'); return v; });
    kontrol('iskelet (2. tur): koyu temada parıltı belirteci çok hafif (≤ .1)', /\/\s*0?\.0\d\s*\)/.test(parilti), parilti);
    await ctx.close();
  });

  await guvenli('2. tur çubuklar', async () => {
    // %200 yazı (320×640): çubukların GERÇEK boyu ölçülür; künyenin son bağlantısı alt menünün altında kalmaz (1.4.4 / 2.4.11)
    const { ctx, p } = await baglam({ width: 320, height: 640 });
    for (const [url, bekle] of [['index.html', '#akis[data-durum="tamam"]'], ['kurallar.html', '#kurallar']]) {
      await git(p, url, bekle);
      await p.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
      await p.waitForTimeout(250);
      const v = await p.evaluate(() => ({ alt: getComputedStyle(document.documentElement).getPropertyValue('--alt-menu-gercek').trim(), ust: getComputedStyle(document.documentElement).getPropertyValue('--ust-gercek').trim(), nav: Math.ceil(document.querySelector('#alt-nav').getBoundingClientRect().height), bar: Math.ceil(document.querySelector('header.ust').getBoundingClientRect().height) }));
      kontrol(`${url} %200 yazı (2. tur): --alt-menu-gercek / --ust-gercek ölçülen boy (sabit 64/56 px değil)`, v.alt === v.nav + 'px' && v.ust === v.bar + 'px' && v.nav > 64, JSON.stringify(v));
      const sonuc = [];
      for (const ad of ['Gizlilik ve KVKK', 'Topluluk kuralları', 'Fotoğraf kaynakları']) {
        await p.evaluate((ad) => { const a = [...document.querySelectorAll('footer .baglantilar a')].find((x) => x.textContent === ad); a.focus(); }, ad);
        await durulsun(p);
        sonuc.push([ad, await ortulme(p)]);
      }
      // sayfanın en altına inince son bağlantı tamamen menünün üstünde
      await p.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; scrollTo(0, document.documentElement.scrollHeight); });
      await p.waitForTimeout(80);
      const enAlt = await p.evaluate(() => { const a = [...document.querySelectorAll('footer .baglantilar a')].pop().getBoundingClientRect(); return { bag: Math.round(a.bottom), nav: Math.round(document.querySelector('#alt-nav').getBoundingClientRect().top) }; });
      kontrol(`${url} %200 yazı (2. tur): künye bağlantıları odakta alt menünün altında kalmaz, en altta tamamen görünür`, sonuc.every(([, o]) => o === 0) && enAlt.bag <= enAlt.nav, JSON.stringify({ sonuc, enAlt }));
    }
    // Gol arşivi: %200 yazıda yapışkan filtre ekranın %20'sinden uzunsa yapışmaz
    await git(p, 'goller.html', '#arsiv[data-durum="tamam"] .arsiv-mac');
    await p.evaluate(() => { document.documentElement.style.fontSize = '200%'; dispatchEvent(new Event('resize')); });
    await p.waitForTimeout(250);
    const f = await p.evaluate(() => { const e = document.querySelector('.filtreler'); return { sinif: e.classList.contains('yapiskan-degil'), konum: getComputedStyle(e).position, boy: Math.round(e.getBoundingClientRect().height), ekran: innerHeight }; });
    kontrol('goller %200 yazı (2. tur): filtre çubuğu uzadıysa yapışkan değil (ekranın yarısı çubuklara gitmez; 1.4.10)', f.boy <= f.ekran * 0.2 || (f.sinif && f.konum === 'static'), JSON.stringify(f));
    await ctx.close();
    // Normal yazı 360×740: kaydırınca sabit alan (üst bar + yapışkan rakip satırı + alt menü) ≤ %25
    for (const vp of [{ width: 360, height: 740 }, { width: 430, height: 932 }]) {
      const b = await baglam(vp);
      await git(b.p, 'goller.html', '#arsiv[data-durum="tamam"] .arsiv-mac');
      await b.p.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; scrollTo(0, 600); });
      await b.p.waitForTimeout(150);
      const d = await b.p.evaluate(() => {
        const ust = document.querySelector('header.ust').getBoundingClientRect(), fl = document.querySelector('.filtreler').getBoundingClientRect(), nav = document.querySelector('#alt-nav').getBoundingClientRect();
        return { yapisti: Math.round(fl.top) === Math.round(ust.bottom), sabit: Math.round(ust.height + fl.height + nav.height), ekran: innerHeight, sezonAkista: getComputedStyle(document.querySelector('.sezon-formu')).position !== 'sticky' };
      });
      kontrol(`goller ${vp.width}×${vp.height} (2. tur): yalnız rakip satırı yapışır, sabit alan ≤ %25 (tasarımcı 3)`, d.yapisti && d.sezonAkista && d.sabit <= d.ekran * 0.25, JSON.stringify(d));
      const tek = await b.p.evaluate(() => { const iz = document.querySelector('#sezonlar'); return { tek: iz.classList.contains('tek'), zemin: getComputedStyle(iz).backgroundColor, n: iz.querySelectorAll('input').length }; });
      if (tek.n === 1) kontrol(`goller ${vp.width} (2. tur): tek sezonda iz (hap içinde hap) yok`, tek.tek && /rgba\(0, 0, 0, 0\)|transparent/.test(tek.zemin), JSON.stringify(tek));
      // 018: her maç tek satır (kapalı açılır düğme, ≥44 px); gol satırları açılınca görünür, büyük video kartı yok
      const kart = await b.p.evaluate(() => ({ satir: document.querySelectorAll('#arsiv button.mac-ac[aria-expanded="false"]').length, kucuk: [...document.querySelectorAll('#arsiv button.mac-ac')].filter((x) => x.getBoundingClientRect().height < 44).length, gorunurGol: [...document.querySelectorAll('#arsiv .gol-ani')].filter((x) => x.getClientRects().length).length, kart: document.querySelectorAll('#arsiv .video-kart').length }));
      kontrol(`goller ${vp.width} (018): maçlar kapalı tek satır (≥44 px), gol satırları gizli, büyük video kartı yok`, kart.satir >= 1 && kart.kucuk === 0 && kart.gorunurGol === 0 && kart.kart === 0, JSON.stringify(kart));
      await b.ctx.close();
    }
  });

  // ------------------------------------------------------------------ fotoğraf atıfları
  await guvenli('fotoğraf atıfları', async () => {
    const { ctx, p } = await baglam({ width: 390, height: 844 });
    await git(p, 'index.html', '#akis[data-durum="tamam"]');
    // 016: varsayılan hero özgün tribün çizimi: fotoğraf değil, atıf satırı gizli (manşet kapağı gelirse onun atfı görünür)
    const atif = await p.textContent('#hero-atif');
    kontrol('hero (016): özgün tribün çiziminde fotoğraf atfı yok (#hero-atif gizli)', !(await p.isVisible('#hero-atif')) && /tribun-kirmizi-siyah\.svg$/.test(await p.$eval('#hero-gorsel', (i) => i.currentSrc)), atif);
    const alt = await p.$eval('#hero-gorsel', (i) => i.getAttribute('alt'));
    kontrol('hero: görselin alt özniteliği var (süs: boş) ve başlık DOM metni (T-20)', alt === '' && (await p.textContent('#hero-baslik')).trim().length > 5);
    kontrol('hero: en fazla bir bağlantı, adı başlığı içerir (T-22)', await p.evaluate(() => { const l = document.querySelectorAll('.hero a'); return l.length <= 1 && (!l.length || l[0].textContent.includes(document.getElementById('hero-baslik').textContent.trim())); }));
    await git(p, 'kaynaklar.html', '#kaynak-listesi');
    const k = await p.$$eval('#kaynak-listesi li', (l) => l.map((li) => li.textContent));
    kontrol('kaynaklar: her paketlenmiş fotoğrafın yazarı, lisansı ve Commons bağlantısı listelenir', k.length >= 7 && k.every((x) => /CC BY/.test(x) && /Wikimedia Commons|commons/i.test(x)), k.length);
    await ctx.close();
  });

  // ------------------------------------------------------------------ kontrast (docs/kontrast.py) ve hero perdesi
  await guvenli('kontrast', async () => {
    const { spawnSync } = require('child_process');
    const k = spawnSync('python3', [path.join(__dirname, '..', 'docs', 'kontrast.py')], { encoding: 'utf8' });
    if (k.error) { kontrol('kontrast: python3 docs/kontrast.py çalıştı', false, k.error.message); return; }
    kontrol('kontrast: docs/kontrast.py 0 başarısız (eski + 013 çiftleri: alt menü, haplar, çipler, hero/atıf en kötü durum) (T-12)', /FAIL: 0/.test(k.stderr) && /FAIL 013: 0/.test(k.stderr) && !/❌/.test(k.stdout), k.stderr.trim());
    const { ctx, p } = await baglam({ width: 390, height: 844 });
    await git(p, 'index.html', '#akis[data-durum="tamam"]');
    const perde = await p.evaluate(() => {
      const y = document.querySelector('.hero-yazi'), b = document.getElementById('hero-baslik');
      const ust = b.getBoundingClientRect().top - y.getBoundingClientRect().top;
      const duraklar = [...getComputedStyle(y).backgroundImage.matchAll(/rgba?\(([^)]+)\)\s*([\d.]+)(px|%)?/g)].map((m) => { const c = m[1].split(/[,/ ]+/).filter(Boolean); return { a: c.length > 3 ? Number(c[3]) : 1, konum: Number(m[2]), birim: m[3] || '' }; });
      return { ust: Math.round(ust), duraklar };
    });
    // Yazının başladığı yerde (ve altında) perde en az .60 koyu (T-21, tasarım kararı)
    const yazida = perde.duraklar.filter((d) => (d.birim === 'px' && d.konum >= 40) || (d.birim === '%' && d.konum === 100));
    kontrol('hero: başlık perdenin ≥ .60 olduğu bölgede başlıyor (beyaz fotoğrafta da okunur) (T-21)', perde.ust >= 40 && yazida.length >= 2 && Math.min(...yazida.map((d) => d.a)) >= 0.6, JSON.stringify(perde));
    await ctx.close();
  });

  // ------------------------------------------------------------------ hareket ve geçişler (docs/TASARIM.md 9.10)
  await guvenli('hareket', async () => {
    const { ctx, p } = await baglam({ width: 390, height: 844 }, { ekstra: { hasTouch: true, isMobile: true } });
    await git(p, 'index.html', '#akis[data-durum="tamam"]');
    const kurallar = () => p.evaluate(() => {
      const hepsi = [];
      const gez = (l, medya) => { for (const r of l) { if (r.cssRules && r.media) gez(r.cssRules, r.media.mediaText); else if (r.cssRules && r.conditionText) gez(r.cssRules, r.conditionText); else hepsi.push({ t: r.cssText, medya: medya || '' }); } };
      for (const s of document.styleSheets) { try { gez(s.cssRules, ''); } catch (e) {} }
      return hepsi;
    });
    const k = await kurallar();
    const aktif = (sec) => k.some((r) => r.t.split('{')[0].split(',').some((x) => x.includes(sec) && x.includes(':active')));
    const d = await p.evaluate(() => ({ tap: getComputedStyle(document.documentElement).webkitTapHighlightColor, ust: getComputedStyle(document.querySelector('header.ust')).viewTransitionName, alt: getComputedStyle(document.getElementById('alt-nav')).viewTransitionName }));
    kontrol('hareket: mavi/gri dokunma kutusu yok (-webkit-tap-highlight-color saydam)', /rgba\(0, 0, 0, 0\)|transparent/.test(d.tap), d.tap);
    const secenekler = ['.dugme', '.paylas', '.hayalet', '.alt-nav a', '.sekme-iz [role="tab"]', '.hap-iz label', '.cip-satir label', '.video-kart', 'a.oyuncu-kart', '.haber-satir', '.fikstur-satir', '.gol-satir', '.mac-ac'];
    kontrol('hareket: düğme, alt menü, sekme, hap/çip, kart ve satırlarda :active geri bildirimi var', secenekler.every(aktif), secenekler.filter((x) => !aktif(x)).join(', '));
    kontrol('hareket: :active küçülmesi (transform) yalnız hareket azaltma kapalıyken', k.filter((r) => /:active/.test(r.t) && /transform:/.test(r.t)).every((r) => /no-preference/.test(r.medya)), '');
    kontrol('hareket: @view-transition { navigation: auto } yalnız prefers-reduced-motion: no-preference içinde; üst bar ve alt menü ayrı katman',
      k.some((r) => /@view-transition/.test(r.t) && /navigation: auto/.test(r.t) && /no-preference/.test(r.medya)) && !k.some((r) => /@view-transition/.test(r.t) && !/no-preference/.test(r.medya)) && d.ust === 'ust-bar' && d.alt === 'alt-menu', JSON.stringify(d));
    // Sayfa içinde dokunma: odak halkası kalır (tap highlight kapalıyken :focus-visible outline'ı hâlâ var)
    await p.keyboard.press('Tab'); await p.keyboard.press('Tab');
    const halka = await p.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
    kontrol('hareket: klavye odağında odak halkası korunur', halka !== 'none', halka);
    await ctx.close();
    // Hareket azaltma: view transition kuralı etkin değil, :active'de küçülme yok, alt menü başa ANINDA kayar
    const b = await baglam({ width: 390, height: 844 }, { ekstra: { reducedMotion: 'reduce' } });
    await git(b.p, 'index.html', '#akis[data-durum="tamam"]');
    const r = await b.p.evaluate(async () => {
      const vt = [...document.styleSheets].flatMap((s) => { try { return [...s.cssRules]; } catch (e) { return []; } }).filter((x) => x.media && /no-preference/.test(x.media.mediaText) && /@view-transition/.test(x.cssText));
      const etkin = vt.some((x) => matchMedia(x.media.mediaText).matches);
      const dugme = document.querySelector('.dugme, .paylas, #alt-nav a');
      for (let y = 0; y <= 800; y += 80) { scrollTo(0, y); await new Promise((c) => requestAnimationFrame(() => setTimeout(c, 30))); }
      const gizli = document.documentElement.classList.contains('ust-gizli');
      const sure = getComputedStyle(document.querySelector('header.ust')).transitionDuration;
      document.querySelector('#alt-nav a[aria-current="page"]').click();
      await new Promise((c) => requestAnimationFrame(c));
      return { etkin, y: scrollY, gizli, sure, dugme: !!dugme };
    });
    kontrol('hareket (azaltılmış): sayfa geçişi kapalı, üst bar gizlenir ama animasyonsuz, alt menü başa anında kayar', !r.etkin && r.gizli && parseFloat(r.sure) < 0.01 && r.y === 0, JSON.stringify(r));
    await b.ctx.close();
  });

  kontrol('tasarım testlerinde JavaScript hatası yok', !hatalar.length, [...new Set(hatalar)].join(' | '));
  await tarayici.close();
  sunucu.close();
  return { gecen, kalan };
}

module.exports = { tasarimTestleri };

if (require.main === module) {
  tasarimTestleri().then((s) => {
    console.log(JSON.stringify(s.kalan, null, 2));
    console.log(`Tasarım/erişilebilirlik: ${s.gecen.length} geçti, ${s.kalan.length} kaldı`);
    process.exit(s.kalan.length ? 1 : 0);
  }).catch((e) => { console.error(e); process.exit(1); });
}
