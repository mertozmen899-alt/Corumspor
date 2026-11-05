// Giriş / kayıt / şifre sıfırlama (Supabase e-posta + şifre).
// Hatalar alanın altında (aria-invalid + aria-describedby), hepsi birden; odak ilk hatalı alana. "Göster" şifreyi açar.
// Kayıttan sonra "Hoş geldin" (e-posta onayı açıklamasıyla). "Şifremi unuttum": resetPasswordForEmail → sifre.html.
import { supabase, hazir, $, sayfaBaslat, hataMetni, param, guvenliDonus, sekmeKlavyesi, mesaj, duyur, uyar } from '../ortak.js';
import { kullaniciAdiHatasi } from '../kurallar.js';

const kutu = $('#giris-mesaj');
const donus = guvenliDonus(param('donus') || 'index.html');
const oturumS = sayfaBaslat();
const EPOSTA = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ------------------------------------------------------------ alan hataları
function alanHatasi(id, metin) {
  const girdi = $('#' + id), yer = $('#' + id + '-hata');
  if (yer) yer.textContent = metin || '';
  if (metin) girdi.setAttribute('aria-invalid', 'true'); else girdi.removeAttribute('aria-invalid');
}
function hatalariGoster(form, hatalar) {
  form.querySelectorAll('input').forEach((g) => { if (g.id) alanHatasi(g.id, hatalar[g.id] || ''); });
  const ilk = Object.keys(hatalar)[0];
  if (ilk) { $('#' + ilk).focus(); uyar(Object.values(hatalar).join(' ')); }
  return !!ilk;
}

// ------------------------------------------------------------ şifreyi göster
document.querySelectorAll('.sifre-goster').forEach((d) => d.addEventListener('click', () => {
  const g = $('#' + d.dataset.sifre);
  const ac = g.type === 'password';
  g.type = ac ? 'text' : 'password';
  d.setAttribute('aria-pressed', String(ac));
  d.textContent = ac ? 'Gizle' : 'Göster';
}));

// ------------------------------------------------------------ sekmeler
let sekmeTabindex = () => {};
function sekme(ad) {
  const giris = ad === 'giris';
  $('#sekme-giris').setAttribute('aria-selected', String(giris));
  $('#sekme-kayit').setAttribute('aria-selected', String(!giris));
  $('#giris-paneli').hidden = !giris;
  $('#kayit-paneli').hidden = giris;
  sekmeTabindex();
  mesaj(kutu, '');
}

function hosgeldin(ad, onayGerekli) {
  $('#formlar').hidden = true;
  $('#hosgeldin-baslik').textContent = `Hoş geldin ${ad}!`;
  $('#hosgeldin-metin').textContent = onayGerekli
    ? 'Hesabın açıldı. E-postana bir onay bağlantısı gönderdik: bağlantıya tıkla, sonra buradan giriş yap. Yorum yazmak için e-posta onayı gerekir (sahte hesapları böyle uzak tutuyoruz).'
    : 'Hesabın açıldı ve giriş yaptın. Artık habere, maça ve gole yorum yazabilirsin. Topluluk kurallarına bir göz at: sıcak, saygılı, küfürsüz tribün.';
  const devam = $('#hosgeldin-devam');
  devam.href = onayGerekli ? 'giris.html' + (donus !== 'index.html' ? '?donus=' + encodeURIComponent(donus) : '') : donus;
  devam.textContent = onayGerekli ? 'Giriş sayfasına dön' : 'Devam et';
  $('#hosgeldin').hidden = false;
  $('#hosgeldin').focus();
  duyur($('#hosgeldin-baslik').textContent);
}

const oturum = await oturumS;
if (!hazir || !oturum.hazir) {
  $('#formlar').hidden = true;
} else if (oturum.kullanici) {
  $('#formlar').hidden = true;
  $('#oturum-acik').hidden = false;
  $('#acik-ad').textContent = (oturum.profil && oturum.profil.kullanici_adi) || oturum.kullanici.email || '';
} else {
  $('#sekme-giris').addEventListener('click', () => sekme('giris'));
  $('#sekme-kayit').addEventListener('click', () => sekme('kayit'));
  sekmeTabindex = sekmeKlavyesi($('#formlar .sekme-dugmeleri'), (t) => sekme(t.id === 'sekme-kayit' ? 'kayit' : 'giris'));
  if (location.hash === '#kayit') sekme('kayit');
  if (location.hash === '#sifre') { $('#unuttum-formu').hidden = false; $('#unuttum-ac').setAttribute('aria-expanded', 'true'); }

  // --- giriş
  $('#giris-formu').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const email = $('#g-eposta').value.trim();
    const password = $('#g-sifre').value;
    const hatalar = {};
    if (!email) hatalar['g-eposta'] = 'E-postanı yaz.';
    else if (!EPOSTA.test(email)) hatalar['g-eposta'] = 'Geçerli bir e-posta adresi yaz (ör. ad@ornek.com).';
    if (!password) hatalar['g-sifre'] = 'Şifreni yaz.';
    mesaj(kutu, '');
    if (hatalariGoster(ev.target, hatalar)) return;
    const d = $('#g-gonder');
    if (d.getAttribute('aria-disabled') === 'true') return;
    d.setAttribute('aria-disabled', 'true');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    d.removeAttribute('aria-disabled');
    if (error) { mesaj(kutu, hataMetni(error, 'Giriş yapılamadı.')); $('#g-sifre').focus(); return; }
    location.href = donus;
  });

  // --- şifremi unuttum
  $('#unuttum-ac').addEventListener('click', () => {
    const f = $('#unuttum-formu');
    f.hidden = !f.hidden;
    $('#unuttum-ac').setAttribute('aria-expanded', String(!f.hidden));
    if (!f.hidden) { $('#u-eposta').value = $('#u-eposta').value || $('#g-eposta').value; $('#u-eposta').focus(); }
  });
  $('#unuttum-formu').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const email = $('#u-eposta').value.trim();
    if (hatalariGoster(ev.target, EPOSTA.test(email) ? {} : { 'u-eposta': 'Geçerli bir e-posta adresi yaz.' })) return;
    const d = $('#u-gonder');
    if (d.getAttribute('aria-disabled') === 'true') return;
    d.setAttribute('aria-disabled', 'true');
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: new URL('sifre.html', location.href).href });
    d.removeAttribute('aria-disabled');
    // Hesap var mı yok mu söylenmez (e-posta adresleri tahmin edilmesin): her durumda aynı mesaj
    const m = $('#unuttum-mesaj');
    m.className = 'mesaj ' + (error && /rate|too many/i.test(error.message || '') ? 'hata' : 'basari');
    m.textContent = error && /rate|too many/i.test(error.message || '') ? hataMetni(error)
      : 'Bu adresle bir hesap varsa şifre yenileme bağlantısı birkaç dakika içinde gelir. Gelen kutuna (ve istenmeyen klasörüne) bak.';
  });

  // --- kayıt
  $('#kayit-formu').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const kullanici_adi = $('#k-ad').value.trim();
    const email = $('#k-eposta').value.trim();
    const password = $('#k-sifre').value;
    const hatalar = {};
    const adHatasi = kullaniciAdiHatasi(kullanici_adi); // biçim + ayrılmış adlar (yönetici, resmî, kulüp, başkan…; sunucu da denetler)
    if (adHatasi) hatalar['k-ad'] = adHatasi;
    if (!EPOSTA.test(email)) hatalar['k-eposta'] = 'Geçerli bir e-posta adresi yaz (ör. ad@ornek.com).';
    if (password.length < 8) hatalar['k-sifre'] = 'Şifre en az 8 karakter olmalı.';
    const ozet = $('#kayit-ozet');
    ozet.textContent = Object.keys(hatalar).length > 1 ? `Hesap açmadan önce ${Object.keys(hatalar).length} alanı düzelt.` : '';
    mesaj(kutu, '');
    if (hatalariGoster(ev.target, hatalar)) return;
    const d = $('#k-gonder');
    if (d.getAttribute('aria-disabled') === 'true') return;
    d.setAttribute('aria-disabled', 'true');
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { kullanici_adi }, emailRedirectTo: new URL('giris.html', location.href).href },
    });
    d.removeAttribute('aria-disabled');
    if (error) { mesaj(kutu, hataMetni(error, 'Hesap açılamadı.')); return; }
    hosgeldin(kullanici_adi, !(data && data.session));
  });
}
