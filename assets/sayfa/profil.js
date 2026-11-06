// Profil: misafire giriş / kayıt; üyeye kullanıcı adı, e-posta, yorumlarım, (yöneticiye) yönetim paneli, onaylı çıkış.
// Tema seçimi (Cihaz ayarı / Açık / Koyu) statik HTML'dedir, assets/tema.js bağlar (herkese açık).
// 017: profil fotoğrafı (profiles.foto_url): yüklemeden önce 256 px'e küçültülür (WebP, EXIF silinir), profil-fotograflari
// kovasında <kullanıcı id>/<rastgele uuid>.webp; eski dosya silinir. Onaysız e-posta / yasaklı hesapta düğme yerine açıklama.
import { supabase, hazir, h, $, sayfaBaslat, tarihYaz, cikisYap, hataMetni, simge, mesaj, avatarOgesi } from '../ortak.js';
import { PROFIL_FOTO_KOVASI } from '../kurallar.js';
import { TURLER, VARSAYILAN_TERCIH, ortamDurumu, mevcutAbonelik, aboneOl, tercihKaydet, aboneligiKapat, dudukAcik, dudukAyarla, dudukCal } from '../bildirim.js';

const kok = $('#profil');
const oturumS = sayfaBaslat();

// "Ana ekrana ekle" (taraftar 3. tur 3): tarayıcının yükleme olayı (beforeinstallprompt) saklanır, düğmeye basınca tarayıcının KENDİ
// onay penceresi açılır (bizim açılır penceremiz yok). Uygulama zaten yüklüyse ya da tarayıcı desteklemiyorsa bölüm gizli kalır;
// iPhone/iPad Safari'de (olay yok) "Paylaş › Ana Ekrana Ekle" ipucu yazılır.
function anaEkranKur() {
  const bolum = $('#ana-ekran'), dugme = $('#ana-ekran-ekle'), ios = $('#ana-ekran-ios');
  if (!bolum) return;
  const yuklu = () => (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  let olay = null;
  const gizle = () => { bolum.hidden = true; dugme.hidden = true; olay = null; };
  if (yuklu()) return;
  if (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) { ios.hidden = false; bolum.hidden = false; }
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // tarayıcının kendi alt şeridi açılmasın; öneri yalnız bu düğmede
    olay = e;
    dugme.hidden = false; bolum.hidden = false;
  });
  addEventListener('appinstalled', gizle);
  dugme.addEventListener('click', async () => {
    if (!olay) return;
    const o = olay;
    try { await o.prompt(); const secim = await o.userChoice; if (secim && secim.outcome === 'accepted') gizle(); } catch (x) { /* yok say */ }
    olay = null; // olay bir kez kullanılır; tarayıcı yeniden sunarsa düğme geri gelir
    dugme.hidden = true;
    if (ios.hidden) bolum.hidden = true;
  });
}
anaEkranKur();

function misafir() {
  kok.replaceChildren(h('div', { class: 'profil-bas' },
    h('span', { class: 'avatar misafir-avatar', 'aria-hidden': 'true' }, simge('M12 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM4 21c0-4.4 3.6-7 8-7s8 2.6 8 7', { boyut: 36 })),
    h('h2', null, 'Tribüne hoş geldin'),
    h('p', null, 'Taraftar hesabıyla habere, maça ve gole yorum yaz. Kayıt 30 saniye.'),
    h('div', { class: 'dugme-satir' },
      h('a', { class: 'dugme tam', href: 'giris.html?donus=profil.html', id: 'profil-giris' }, 'Giriş yap'),
      h('a', { class: 'dugme ikincil tam', href: 'giris.html?donus=profil.html#kayit', id: 'profil-kayit' }, 'Kayıt ol'))));
}

async function yorumlarim(kullaniciId) {
  const kart = h('div', { class: 'ayar-kart', id: 'yorumlarim' }, h('p', { class: 'ayar-metin' }, 'Yorumların yükleniyor…'));
  const { data, error } = await supabase.from('yorumlar')
    .select('id, metin, created_at, gizli, haber_id, mac_id, gol_id, haberler(baslik), maclar(rakip), goller(oyuncu)')
    .eq('kullanici_id', kullaniciId).order('created_at', { ascending: false }).limit(20);
  if (error) { kart.replaceChildren(h('p', { class: 'ayar-metin' }, hataMetni(error, 'Yorumların yüklenemedi.'))); return kart; }
  if (!data.length) { kart.replaceChildren(h('p', { class: 'ayar-metin' }, 'Henüz yorum yazmadın. Tribün seni bekliyor!')); return kart; }
  kart.replaceChildren(h('ul', { class: 'yorumlarim' }, data.map((y) => {
    const [href, ad] = y.haber_id ? ['haber.html?id=' + y.haber_id, (y.haberler && y.haberler.baslik) || 'Haber']
      : y.gol_id ? ['gol.html?id=' + y.gol_id, ((y.goller && y.goller.oyuncu) || 'Gol') + ' golü'] : ['mac.html?id=' + y.mac_id, ((y.maclar && y.maclar.rakip) || 'Maç') + ' maçı'];
    return h('li', null, h('a', { href }, ad, h('span', { class: 'gorunmez' }, ' – yazdığın yorum')),
      h('span', { class: 'soluk kucuk-yazi' }, ' · ', tarihYaz(y.created_at, { yil: false }), y.gizli ? ' · gizlendi' : ''),
      h('p', null, y.metin));
  })));
  return kart;
}

const PROFIL_FOTO_KURALI = 'Yalnız kendine ait ya da kullanma hakkın olan fotoğraf; başkasının fotoğrafı, kulüp arması, uygunsuz görsel yasak.';
const PROFIL_FOTO_EN_BUYUK = 300 * 1024; // kova sınırı (017)
const depoYolu = (url) => { const m = /\/profil-fotograflari\/([^?#]+)$/.exec(url || ''); return m ? decodeURIComponent(m[1]) : null; };

/** Profil fotoğrafı: avatar kutusunu çizer, yükle / değiştir / kaldır bölümünü döndürür. */
async function profilFotografi(o, ad, avatarKutu) {
  const uid = o.kullanici.id;
  const onayli = !!o.kullanici.email_confirmed_at;
  let engelli = false;
  if (onayli) { try { const r = await supabase.rpc('engelli_mi'); engelli = !!r && r.data === true; } catch (e) { engelli = false; } }
  let foto = null;
  try { const { data } = await supabase.from('profiles').select('foto_url').eq('id', uid).maybeSingle(); foto = (data && data.foto_url) || null; } catch (e) { foto = null; }

  const kutu = h('div', { class: 'profil-foto', id: 'profil-foto' });
  const durumP = h('p', { class: 'mesaj', id: 'profil-foto-mesaj', hidden: true });
  const yukleyebilir = onayli && !engelli;
  const dosya = h('input', { type: 'file', id: 'profil-foto-dosya', accept: 'image/*', hidden: true, tabindex: '-1' });
  const yukle = h('button', { type: 'button', class: 'dugme ikincil kucuk', id: 'profil-foto-yukle', 'aria-describedby': 'profil-foto-kural' });
  const kaldir = h('button', { type: 'button', class: 'dugme tehlike kucuk', id: 'profil-foto-kaldir' }, 'Fotoğrafı kaldır');
  const ciz = () => {
    avatarKutu.replaceChildren(avatarOgesi(ad, foto, uid, { boyut: 72, alt: 'Profil fotoğrafın' }));
    yukle.textContent = foto ? 'Fotoğrafı değiştir' : 'Fotoğraf yükle';
    kaldir.hidden = !foto;
  };
  const mesgul = (evet) => [yukle, kaldir].forEach((d) => (evet ? d.setAttribute('aria-disabled', 'true') : d.removeAttribute('aria-disabled')));
  const eskiyiSil = async (url) => { const yol = depoYolu(url); if (!yol) return; try { await supabase.storage.from(PROFIL_FOTO_KOVASI).remove([yol]); } catch (e) { /* sessiz: dosya depoda kalır */ } };

  yukle.addEventListener('click', () => { if (yukle.getAttribute('aria-disabled') !== 'true') dosya.click(); });
  dosya.addEventListener('change', async () => {
    const secilen = dosya.files && dosya.files[0];
    dosya.value = ''; // aynı dosya yeniden seçilebilsin
    if (!secilen) return;
    const hata = (metin) => { mesaj(durumP, metin, 'hata'); mesgul(false); yukle.focus(); };
    if (!/^image\/(jpeg|png|webp)$/.test(secilen.type)) return hata('Yalnız JPEG, PNG ya da WebP fotoğraf yükleyebilirsin.');
    mesgul(true);
    mesaj(durumP, 'Fotoğrafın hazırlanıyor…', 'bilgi');
    let kucuk;
    try {
      const { gorselKucult, ENCOK_GIRDI_BAYT } = await import('../gorsel-kucult.js'); // yalnız yüklerken (açılışta istek yok)
      if (secilen.size > ENCOK_GIRDI_BAYT) return hata('Fotoğraf çok büyük. Daha küçük bir fotoğraf seç.');
      kucuk = await gorselKucult(secilen, { enGenis: 256, enYuksek: 256 });
    } catch (e) { return hata('Fotoğraf hazırlanamadı. Başka bir fotoğraf dene.'); }
    if (!/^image\/(jpeg|png|webp)$/.test(kucuk.type)) return hata('Bu dosya açılamadı. JPEG, PNG ya da WebP bir fotoğraf seç.');
    if (kucuk.size > PROFIL_FOTO_EN_BUYUK) return hata('Fotoğraf küçültüldükten sonra da 300 KB\'tan büyük. Başka bir fotoğraf dene.');
    const uzanti = kucuk.type === 'image/webp' ? 'webp' : kucuk.type === 'image/png' ? 'png' : 'jpg';
    const yol = `${uid}/${crypto.randomUUID()}.${uzanti}`;
    const depo = supabase.storage.from(PROFIL_FOTO_KOVASI);
    const { error: ye } = await depo.upload(yol, kucuk, { contentType: kucuk.type, cacheControl: '31536000', upsert: false });
    if (ye) return hata(hataMetni(ye, 'Fotoğraf yüklenemedi. Tekrar dene.'));
    const yeni = depo.getPublicUrl(yol).data.publicUrl;
    const { error: ue } = await supabase.from('profiles').update({ foto_url: yeni }).eq('id', uid);
    if (ue) { await eskiyiSil(yeni); return hata(hataMetni(ue, 'Profil fotoğrafın kaydedilemedi.')); }
    const eski = foto;
    foto = yeni;
    ciz();
    mesgul(false);
    mesaj(durumP, 'Profil fotoğrafın güncellendi. Yorumlarında da görünecek.', 'basari');
    yukle.focus();
    if (eski) await eskiyiSil(eski);
  });
  kaldir.addEventListener('click', async () => {
    if (kaldir.getAttribute('aria-disabled') === 'true' || !foto) return;
    if (!confirm('Profil fotoğrafın kaldırılsın mı?')) return;
    mesgul(true);
    const { error } = await supabase.from('profiles').update({ foto_url: null }).eq('id', uid);
    mesgul(false);
    if (error) { mesaj(durumP, hataMetni(error, 'Profil fotoğrafın kaldırılamadı.'), 'hata'); kaldir.focus(); return; }
    const eski = foto;
    foto = null;
    ciz();
    mesaj(durumP, 'Profil fotoğrafın kaldırıldı.', 'basari');
    (yukleyebilir ? yukle : avatarKutu.closest('.profil-bas').querySelector('h2')).focus();
    await eskiyiSil(eski);
  });

  ciz();
  const not = !onayli
    ? 'Profil fotoğrafı eklemek için e-posta adresini onayla: hesap açarken gelen e-postadaki bağlantıya tıkla, sonra çıkış yapıp yeniden gir.'
    : engelli ? 'Hesabın topluluk kuralları nedeniyle kapatıldığı için profil fotoğrafı ekleyemezsin.' : null;
  kutu.append(...[
    h('div', { class: 'dugme-satir' }, yukleyebilir ? yukle : null, kaldir),
    yukleyebilir ? dosya : null,
    yukleyebilir ? h('p', { class: 'soluk kucuk-yazi', id: 'profil-foto-kural' }, PROFIL_FOTO_KURALI) : h('p', { class: 'mesaj bilgi', id: 'profil-foto-not' }, not),
    durumP].filter(Boolean));
  return kutu;
}

// 021: Bildirimler. Önce açıklama (ne gelir, örnek, sıklık, kapatma); izin YALNIZ "Bildirimleri aç" düğmesiyle istenir.
const BILDIRIM_NOTLARI = {
  'ios-ana-ekran': 'iPhone ve iPad\'de bildirimler yalnız ana ekrana eklenmiş uygulamada çalışır (iOS 16.4 ve sonrası): Safari\'de Paylaş › Ana Ekrana Ekle\'ye dokun, sonra uygulamayı ana ekrandaki simgeden açıp buraya gel.',
  'destek-yok': 'Bu tarayıcı bildirimleri desteklemiyor. Android\'de Chrome, bilgisayarda Chrome, Edge ya da Firefox ile dene.',
  kurulmadi: 'Bildirimler henüz kurulmadı. Yakında burada açabileceksin.',
  'sw-yok': 'Bildirimler yalnız yayındaki sitede çalışır. Sayfayı yenileyip tekrar dene.',
  reddedildi: 'Bu tarayıcıda bildirim izni kapalı. Açmak için: Android Chrome\'da adres çubuğundaki simgeye dokun › İzinler › Bildirimler; ana ekrana eklediysen telefonun Ayarlar › Uygulamalar › Çorumspor Taraftar › Bildirimler. iPhone\'da Ayarlar › Bildirimler › Çorumspor Taraftar. Sonra bu sayfayı yenile.',
};

async function bildirimBolumu() {
  const { durum: ilkDurum, kayit } = await ortamDurumu();
  let abonelik = null, tercih = { ...VARSAYILAN_TERCIH }, acik = false;
  if (ilkDurum === 'hazir') {
    try { const m = await mevcutAbonelik(supabase, kayit); abonelik = m.abonelik; acik = !!m.tercih; if (m.tercih) tercih = { ...tercih, ...m.tercih }; } catch (e) { acik = false; }
  }
  const mesajP = h('p', { class: 'mesaj', id: 'bildirim-mesaj', hidden: true });
  const notP = h('p', { class: 'mesaj bilgi', id: 'bildirim-not', hidden: true });
  const kutular = TURLER.map(([anahtar]) => h('input', { type: 'checkbox', id: 'bildirim-' + anahtar, name: anahtar, checked: tercih[anahtar] === true }));
  const turler = h('fieldset', { id: 'bildirim-turleri' }, h('legend', null, 'Hangi bildirimler gelsin?'),
    TURLER.map(([, ad, aciklama], i) => h('label', { class: 'onay' }, kutular[i], h('span', null, h('strong', null, ad), ' · ' + aciklama))));
  const ac = h('button', { type: 'button', class: 'dugme', id: 'bildirim-ac' }, 'Bildirimleri aç');
  const kapat = h('button', { type: 'button', class: 'dugme ikincil', id: 'bildirim-kapat' }, 'Bildirimleri kapat');
  const duduk = h('input', { type: 'checkbox', id: 'bildirim-duduk', checked: dudukAcik(), 'aria-describedby': 'bildirim-duduk-not' });
  const dene = h('button', { type: 'button', class: 'dugme ikincil kucuk', id: 'bildirim-duduk-dene' }, 'Sesi dene');
  const secilen = () => Object.fromEntries(TURLER.map(([anahtar], i) => [anahtar, kutular[i].checked]));
  const mesgul = (evet) => [ac, kapat].forEach((d) => (evet ? d.setAttribute('aria-disabled', 'true') : d.removeAttribute('aria-disabled')));
  const ciz = (durum) => {
    const engel = BILDIRIM_NOTLARI[durum];
    notP.hidden = !engel;
    notP.textContent = engel || '';
    turler.hidden = !!engel;
    ac.hidden = !!engel || acik;
    kapat.hidden = !!engel || !acik;
  };

  ac.addEventListener('click', async () => {
    if (ac.getAttribute('aria-disabled') === 'true') return;
    mesgul(true);
    mesaj(mesajP, 'Tarayıcın izin soracak…', 'bilgi');
    try {
      abonelik = await aboneOl(supabase, kayit, secilen());
      acik = true;
      ciz('hazir');
      mesaj(mesajP, 'Bildirimler açık. Maç günü görüşürüz!', 'basari');
      kapat.focus();
    } catch (e) {
      if (e && e.kod === 'reddedildi') { mesaj(mesajP, ''); ciz('reddedildi'); notP.focus(); }
      else mesaj(mesajP, e && e.kod === 'izin' ? 'İzin vermedin; bildirimler kapalı kaldı. İstersen tekrar dene.' : hataMetni(e, 'Bildirimler açılamadı. Tekrar dene.'), 'hata');
    }
    mesgul(false);
  });
  kapat.addEventListener('click', async () => {
    if (kapat.getAttribute('aria-disabled') === 'true') return;
    mesgul(true);
    try {
      await aboneligiKapat(supabase, kayit);
      abonelik = null; acik = false;
      ciz('hazir');
      mesaj(mesajP, 'Bildirimler kapandı. İstediğin zaman yeniden açabilirsin.', 'basari');
      ac.focus();
    } catch (e) { mesaj(mesajP, hataMetni(e, 'Bildirimler kapatılamadı. Tekrar dene.'), 'hata'); }
    mesgul(false);
  });
  kutular.forEach((k) => k.addEventListener('change', async () => {
    if (!acik || !abonelik) return; // kapalıyken seçim yalnız "Bildirimleri aç"ta kullanılır
    try { await tercihKaydet(supabase, abonelik.endpoint, secilen()); mesaj(mesajP, 'Tercihin kaydedildi.', 'basari'); }
    catch (e) { k.checked = !k.checked; mesaj(mesajP, hataMetni(e, 'Tercihin kaydedilemedi. Tekrar dene.'), 'hata'); }
  }));
  duduk.addEventListener('change', () => dudukAyarla(duduk.checked));
  dene.addEventListener('click', async () => { if (!(await dudukCal())) mesaj(mesajP, 'Bu tarayıcı sesi çalamadı.', 'hata'); });

  ciz(ilkDurum);
  notP.setAttribute('tabindex', '-1');
  return h('div', { class: 'ayar-kart', id: 'bildirimler' },
    h('p', { class: 'ayar-metin' }, 'Maç günü telefonuna kısa bildirim gelsin: sabah maç hatırlatması, ilk 11, Çorum FK golleri ve maç sonu skoru. Maç olmayan günlerde bildirim gelmez; maç günü genelde 3-6 bildirim. İstediğin zaman buradan kapatırsın.'),
    h('div', { class: 'ayar-metin' }, 'Örnek bildirim:',
      h('div', { class: 'mesaj bilgi', id: 'bildirim-ornek' }, h('strong', null, 'GOL! 59\' Kyziridis'), h('br'), 'Çorum FK 1-0 Rakip')),
    notP, turler,
    h('div', { class: 'ayar-metin' }, h('div', { class: 'dugme-satir' }, ac, kapat), mesajP),
    h('div', { class: 'ayar-metin' },
      h('label', { class: 'onay' }, duduk, h('span', null, 'Uygulama açıkken düdük sesi')),
      h('p', { class: 'soluk kucuk-yazi', id: 'bildirim-duduk-not' }, 'Uygulama ekrandayken gol bildirimi gelince kısa bir hakem düdüğü çalar. Bildirimin kendi sesi telefonunun bildirim sesidir; uygulama onu değiştiremez.'),
      h('div', { class: 'dugme-satir' }, dene)));
}

async function uye(o) {
  const ad = (o.profil && o.profil.kullanici_adi) || 'taraftar';
  const avatarKutu = h('div', { class: 'profil-avatar' });
  const fotoBolumu = await profilFotografi(o, ad, avatarKutu);
  // replaceChildren null'u "null" METNİNE çevirir (yönetici olmayanda "nullnull" yazıyordu): boşlar ayıklanır
  kok.replaceChildren(...[h('div', { class: 'profil-bas' },
    avatarKutu,
    h('h2', { id: 'profil-ad', tabindex: '-1' }, ad),
    h('dl', null, h('dt', { class: 'gorunmez' }, 'E-posta'), h('dd', null, o.kullanici.email || '')),
    fotoBolumu),
    h('h2', { class: 'grup-baslik-k' }, 'Yorumlarım'),
    await yorumlarim(o.kullanici.id),
    o.admin ? h('h2', { class: 'grup-baslik-k' }, 'Yönetim') : null,
    o.admin ? h('div', { class: 'ayar-kart' }, h('a', { class: 'ayar-satir', href: 'yonetim.html', id: 'yonetim-baglanti' }, 'Yönetim paneli', h('span', { class: 'ok', 'aria-hidden': 'true' }, '›'))) : null,
    h('h2', { class: 'grup-baslik-k', id: 'bildirim-baslik' }, 'Bildirimler'),
    await bildirimBolumu()].filter(Boolean));

  // Çıkış: onay penceresiyle (yanlışlıkla dokunma). Açılınca odak "Vazgeç"e, Esc kapatır, kapanınca odak düğmeye döner
  const cikis = h('button', { type: 'button', class: 'cikis-dugme', id: 'cikis' }, 'Çıkış yap');
  $('#cikis-alani').replaceChildren(cikis);
  const pencere = $('#cikis-onay');
  document.body.append(pencere); // main'in dışında: arka plan (main, menü) inert olurken pencere etkileşimli kalır
  const arka = [$('#icerik'), $('#alt-nav'), document.querySelector('header.ust'), document.querySelector('footer.alt')];
  cikis.addEventListener('click', () => {
    if (typeof pencere.showModal === 'function') {
      pencere.showModal();
      arka.forEach((e) => e && e.setAttribute('inert', ''));
      $('#cikis-vazgec').focus();
    } else if (confirm('Çıkış yapılsın mı?')) cikisYap();
  });
  pencere.addEventListener('close', () => { arka.forEach((e) => e && e.removeAttribute('inert')); cikis.focus(); });
  $('#cikis-vazgec').addEventListener('click', () => pencere.close());
  $('#cikis-evet').addEventListener('click', () => { $('#cikis-evet').setAttribute('aria-disabled', 'true'); cikisYap(); });
}

const o = await oturumS;
if (!hazir) kok.replaceChildren();
else if (!o.kullanici) misafir();
else await uye(o);
kok.dataset.durum = 'tamam';
