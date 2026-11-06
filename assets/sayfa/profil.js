// Profil: misafire giriş / kayıt; üyeye kullanıcı adı, e-posta, yorumlarım, (yöneticiye) yönetim paneli, onaylı çıkış.
// Tema seçimi (Cihaz ayarı / Açık / Koyu) statik HTML'dedir, assets/tema.js bağlar (herkese açık).
import { supabase, hazir, h, $, sayfaBaslat, tarihYaz, cikisYap, hataMetni, simge } from '../ortak.js';

const kok = $('#profil');
const oturumS = sayfaBaslat();

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

async function uye(o) {
  const ad = (o.profil && o.profil.kullanici_adi) || 'taraftar';
  // replaceChildren null'u "null" METNİNE çevirir (yönetici olmayanda "nullnull" yazıyordu): boşlar ayıklanır
  kok.replaceChildren(...[h('div', { class: 'profil-bas' },
    h('span', { class: 'avatar', 'aria-hidden': 'true' }, ad.slice(0, 1).toLocaleUpperCase('tr-TR')),
    h('h2', { id: 'profil-ad' }, ad),
    h('dl', null, h('dt', { class: 'gorunmez' }, 'E-posta'), h('dd', null, o.kullanici.email || ''))),
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
