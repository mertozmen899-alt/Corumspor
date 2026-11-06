// Profil: misafire giriş / kayıt; üyeye kullanıcı adı, e-posta, yorumlarım, (yöneticiye) yönetim paneli, onaylı çıkış.
// Tema seçimi (Cihaz ayarı / Açık / Koyu) statik HTML'dedir, assets/tema.js bağlar (herkese açık).
// 017: profil fotoğrafı (profiles.foto_url): yüklemeden önce 256 px'e küçültülür (WebP, EXIF silinir), profil-fotograflari
// kovasında <kullanıcı id>/<rastgele uuid>.webp; eski dosya silinir. Onaysız e-posta / yasaklı hesapta düğme yerine açıklama.
import { supabase, hazir, h, $, sayfaBaslat, tarihYaz, cikisYap, hataMetni, simge, mesaj, avatarOgesi } from '../ortak.js';
import { PROFIL_FOTO_KOVASI } from '../kurallar.js';

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
    o.admin ? h('div', { class: 'ayar-kart' }, h('a', { class: 'ayar-satir', href: 'yonetim.html', id: 'yonetim-baglanti' }, 'Yönetim paneli', h('span', { class: 'ok', 'aria-hidden': 'true' }, '›'))) : null].filter(Boolean));

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
