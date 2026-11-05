// Giriş / kayıt (Supabase e-posta + şifre)
import { supabase, $, mesaj, sayfaBaslat, hataMetni, param, guvenliDonus, cikisYap, sekmeKlavyesi } from '../ortak.js';
import { kullaniciAdiHatasi } from '../kurallar.js';

const kutu = $('#giris-mesaj');
const donus = guvenliDonus(param('donus') || 'index.html');
const oturum = await sayfaBaslat();

let sekmeTabindex = () => {};
function sekme(ad) {
  const giris = ad === 'giris';
  $('#sekme-giris').setAttribute('aria-selected', String(giris));
  $('#sekme-kayit').setAttribute('aria-selected', String(!giris));
  $('#giris-formu').hidden = !giris;
  $('#kayit-formu').hidden = giris;
  sekmeTabindex();
  mesaj(kutu, '');
}

if (!oturum.hazir) {
  $('#formlar').hidden = true;
} else if (oturum.kullanici) {
  $('#formlar').hidden = true;
  $('#oturum-acik').hidden = false;
  $('#acik-ad').textContent = (oturum.profil && oturum.profil.kullanici_adi) || oturum.kullanici.email || '';
  $('#cikis').addEventListener('click', cikisYap);
} else {
  $('#sekme-giris').addEventListener('click', () => sekme('giris'));
  $('#sekme-kayit').addEventListener('click', () => sekme('kayit'));
  sekmeTabindex = sekmeKlavyesi($('#formlar .sekme-dugmeleri'), (t) => sekme(t.id === 'sekme-kayit' ? 'kayit' : 'giris'));
  if (location.hash === '#kayit') sekme('kayit');

  $('#giris-formu').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const email = $('#g-eposta').value.trim();
    const password = $('#g-sifre').value;
    if (!email || !password) return mesaj(kutu, 'E-posta ve şifre gerekli.');
    const d = $('#g-gonder');
    d.disabled = true;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    d.disabled = false;
    if (error) return mesaj(kutu, hataMetni(error, 'Giriş yapılamadı.'));
    location.href = donus;
  });

  $('#kayit-formu').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const kullanici_adi = $('#k-ad').value.trim();
    const email = $('#k-eposta').value.trim();
    const password = $('#k-sifre').value;
    const adHatasi = kullaniciAdiHatasi(kullanici_adi); // biçim + ayrılmış adlar (yönetici, resmî, kulüp…; sunucu da denetler)
    if (adHatasi) return mesaj(kutu, adHatasi);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return mesaj(kutu, 'Geçerli bir e-posta adresi yazın.');
    if (password.length < 8) return mesaj(kutu, 'Şifre en az 8 karakter olmalı.');
    const d = $('#k-gonder');
    d.disabled = true;
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { kullanici_adi }, emailRedirectTo: new URL('giris.html', location.href).href },
    });
    d.disabled = false;
    if (error) return mesaj(kutu, hataMetni(error, 'Hesap açılamadı.'));
    if (data && data.session) { location.href = donus; return; }
    sekme('giris');
    mesaj(kutu, 'Hesabınız açıldı. E-posta adresinize gelen onay bağlantısına tıklayın (yorum yazmak için e-posta onayı gerekir), sonra buradan giriş yapın.', 'basari');
  });
}
