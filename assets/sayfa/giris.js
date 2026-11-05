// Giriş / kayıt (Supabase e-posta + şifre)
import { supabase, $, mesaj, sayfaBaslat, hataMetni, param, guvenliDonus, cikisYap } from '../ortak.js';

const kutu = $('#giris-mesaj');
const donus = guvenliDonus(param('donus') || 'index.html');
const oturum = await sayfaBaslat();

function sekme(ad) {
  const giris = ad === 'giris';
  $('#sekme-giris').setAttribute('aria-selected', String(giris));
  $('#sekme-kayit').setAttribute('aria-selected', String(!giris));
  $('#giris-formu').hidden = !giris;
  $('#kayit-formu').hidden = giris;
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
    if (!/^[A-Za-z0-9_.çğıöşüÇĞİÖŞÜ]{3,24}$/.test(kullanici_adi)) return mesaj(kutu, 'Kullanıcı adı 3-24 karakter olmalı; sadece harf, rakam, alt çizgi ve nokta.');
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
    mesaj(kutu, 'Hesabınız açıldı. E-posta adresinize gelen onay bağlantısına tıklayın, sonra buradan giriş yapın.', 'basari');
  });
}
