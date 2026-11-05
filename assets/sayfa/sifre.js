// Yeni şifre (Supabase "Reset password" e-postasındaki bağlantı buraya gelir: supabase-js adresteki anahtarla oturum açar).
// Oturum yoksa (bağlantı eski / kullanılmış) yeni bağlantı istenir. Başarıda: "Şifren yenilendi".
import { supabase, hazir, $, sayfaBaslat, hataMetni, mesaj, uyar, duyur } from '../ortak.js';

const oturumS = sayfaBaslat();
const form = $('#sifre-formu');
document.querySelectorAll('.sifre-goster').forEach((d) => d.addEventListener('click', () => {
  const g = $('#' + d.dataset.sifre); const ac = g.type === 'password';
  g.type = ac ? 'text' : 'password'; d.setAttribute('aria-pressed', String(ac)); d.textContent = ac ? 'Gizle' : 'Göster';
}));
function alanHatasi(id, metin) {
  $('#' + id + '-hata').textContent = metin || '';
  if (metin) $('#' + id).setAttribute('aria-invalid', 'true'); else $('#' + id).removeAttribute('aria-invalid');
}

const o = await oturumS;
if (!hazir) { /* sayfaBaslat uyarıyı gösterdi */ }
else if (!o.kullanici) $('#sifre-gecersiz').hidden = false;
else {
  form.hidden = false;
  $('#s-sifre').focus();
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const a = $('#s-sifre').value, b = $('#s-sifre2').value;
    alanHatasi('s-sifre', a.length < 8 ? 'Şifre en az 8 karakter olmalı.' : '');
    alanHatasi('s-sifre2', a.length >= 8 && a !== b ? 'İki şifre aynı değil.' : '');
    if (a.length < 8) { $('#s-sifre').focus(); uyar('Şifre en az 8 karakter olmalı.'); return; }
    if (a !== b) { $('#s-sifre2').focus(); uyar('İki şifre aynı değil.'); return; }
    const d = $('#s-gonder');
    if (d.getAttribute('aria-disabled') === 'true') return;
    d.setAttribute('aria-disabled', 'true');
    const { error } = await supabase.auth.updateUser({ password: a });
    d.removeAttribute('aria-disabled');
    if (error) { mesaj($('#sifre-mesaj'), hataMetni(error, 'Şifre kaydedilemedi.')); return; }
    form.hidden = true;
    $('#sifre-bitti').hidden = false;
    $('#sifre-bitti').focus();
    duyur('Şifren yenilendi.');
  });
}
