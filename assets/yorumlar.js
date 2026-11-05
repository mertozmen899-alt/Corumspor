// Yorum bölümü (haber ve maç sayfalarında). Yorumlar sadece metin olarak gösterilir.
// Asıl kurallar sunucuda (001 + 012): uzunluk 1-1000, e-posta onayı, dakikada 5 / günde 50 yorum, aynı metin 10 dk içinde
// tekrar yok, düzenleme yalnız 30 dk içinde ve dakikada en fazla 10; gizli yorumlar herkese kapalı. Sunucunun Türkçe
// mesajları (hataMetni) formun altında gösterilir; buradaki denetimler yalnız kolaylıktır.
import { supabase, h, mesaj, tarihYaz, hataMetni, girisAdresi } from './ortak.js';
import { YORUM_SINIRLARI } from './kurallar.js';

const EN_FAZLA = YORUM_SINIRLARI.enUzun;
const LISTE_SINIRI = 200; // en yeni 200 yorum gösterilir

export async function yorumlariKur(kok, { haberId = null, macId = null, oturum }) {
  const hedefAlan = haberId ? 'haber_id' : 'mac_id';
  const hedefId = haberId || macId;
  const benim = oturum && oturum.kullanici ? oturum.kullanici.id : null;
  const admin = !!(oturum && oturum.admin);
  // E-postası onaylanmamış oturum (Supabase: user.email_confirmed_at boş; ör. anonim giriş): yorum yazamaz
  const onayli = !!(oturum && oturum.kullanici && oturum.kullanici.email_confirmed_at);

  const baslik = h('h2', { id: 'yorum-baslik' }, 'Yorumlar');
  const uyari = h('div', { hidden: true, id: 'yorum-mesaj' });
  const liste = h('ol', { class: 'yorum-listesi', id: 'yorum-listesi', 'aria-live': 'polite' });
  const sinirNotu = h('p', { class: 'soluk kucuk-yazi', id: 'yorum-sinir-notu', hidden: true }, `Son ${LISTE_SINIRI} yorum gösteriliyor.`);
  let form = null;

  if (benim && onayli) {
    const alan = h('textarea', { id: 'yorum-metni', name: 'metin', maxlength: String(EN_FAZLA), required: true, placeholder: 'Yorumunuzu yazın…', 'aria-label': 'Yorumunuz' });
    const sayac = h('span', { class: 'sayac', id: 'yorum-sayac' }, `0 / ${EN_FAZLA}`);
    const gonder = h('button', { type: 'submit', class: 'dugme' }, 'Gönder');
    alan.addEventListener('input', () => { sayac.textContent = `${alan.value.length} / ${EN_FAZLA}`; });
    form = h('form', { class: 'yorum-formu', id: 'yorum-formu', novalidate: true },
      alan,
      h('div', { class: 'dugme-satir' }, gonder, sayac));
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const metin = alan.value.trim();
      if (!metin) return mesaj(uyari, 'Boş yorum gönderilemez.');
      if (metin.length > EN_FAZLA) return mesaj(uyari, `Yorum en fazla ${EN_FAZLA} karakter olabilir.`);
      gonder.disabled = true;
      const { error } = await supabase.from('yorumlar').insert({ [hedefAlan]: hedefId, metin });
      gonder.disabled = false;
      if (error) return mesaj(uyari, hataMetni(error, 'Yorum gönderilemedi.'));
      alan.value = '';
      sayac.textContent = `0 / ${EN_FAZLA}`;
      mesaj(uyari, 'Yorumunuz eklendi.', 'basari');
      await yukle();
    });
  }

  const girisNotu = benim ? null : h('p', { class: 'mesaj bilgi', id: 'yorum-giris-notu' },
    'Yorum yazmak için ', h('a', { href: girisAdresi() }, 'giriş yapın'), '.');
  const onayNotu = benim && !onayli ? h('p', { class: 'mesaj bilgi', id: 'yorum-onay-notu' },
    'Yorum yazmak için e-posta adresinizi onaylayın: hesap açarken gelen e-postadaki bağlantıya tıklayın, sonra çıkış yapıp yeniden girin.') : null;

  kok.replaceChildren(h('section', { class: 'yorumlar', 'aria-labelledby': 'yorum-baslik' }, baslik, girisNotu, onayNotu, form, uyari, sinirNotu, liste));

  // Kendi yorumu yalnız yazıldıktan sonraki 30 dakika içinde düzenlenebilir (sunucu da denetler; yönetici muaf)
  const duzenlenebilir = (y) => admin || Date.now() - Date.parse(y.created_at) < YORUM_SINIRLARI.duzenlemeSuresiDakika * 60000;

  function yorumOgesi(y) {
    const ad = (y.profiles && y.profiles.kullanici_adi) || 'taraftar';
    const metinP = h('p', { class: 'yorum-metni' }, y.metin);
    const eylem = h('div', { class: 'yorum-eylem' });
    const li = h('li', { class: 'yorum' + (y.gizli ? ' gizlenmis' : ''), 'data-yorum-id': y.id },
      h('div', { class: 'yorum-ust' },
        h('span', { class: 'ad' }, ad),
        h('time', { class: 'tarih', datetime: y.created_at }, tarihYaz(y.created_at)),
        y.duzenlendi ? h('span', { class: 'soluk kucuk-yazi' }, '(düzenlendi)') : null,
        y.gizli ? h('span', { class: 'rozet gizli' }, 'Gizlendi') : null),
      metinP, eylem);

    if (y.kullanici_id === benim) {
      eylem.append(...[
        duzenlenebilir(y) ? h('button', { type: 'button', class: 'dugme ikincil kucuk', onclick: () => duzenle(y, li, metinP) }, 'Düzenle') : null,
        h('button', { type: 'button', class: 'dugme tehlike kucuk', onclick: () => sil(y) }, 'Sil')].filter(Boolean));
    } else if (admin) {
      eylem.append(
        h('button', { type: 'button', class: 'dugme ikincil kucuk', onclick: () => gizle(y) }, y.gizli ? 'Göster' : 'Gizle'),
        h('button', { type: 'button', class: 'dugme tehlike kucuk', onclick: () => sil(y) }, 'Sil'));
    }
    return li;
  }

  function duzenle(y, li, metinP) {
    const alan = h('textarea', { maxlength: String(EN_FAZLA), 'aria-label': 'Yorumu düzenle', value: y.metin });
    const kaydet = h('button', { type: 'button', class: 'dugme kucuk' }, 'Kaydet');
    const vazgec = h('button', { type: 'button', class: 'dugme ikincil kucuk', onclick: () => yukle() }, 'Vazgeç');
    const kutu = h('div', { class: 'yorum-duzenle' }, alan, h('div', { class: 'dugme-satir' }, kaydet, vazgec));
    metinP.replaceWith(kutu);
    li.querySelector('.yorum-eylem').hidden = true;
    alan.focus();
    kaydet.addEventListener('click', async () => {
      const metin = alan.value.trim();
      if (!metin || metin.length > EN_FAZLA) return mesaj(uyari, `Yorum 1-${EN_FAZLA} karakter olmalı.`);
      kaydet.disabled = true;
      const { error } = await supabase.from('yorumlar').update({ metin }).eq('id', y.id);
      if (error) { kaydet.disabled = false; return mesaj(uyari, hataMetni(error, 'Yorum kaydedilemedi.')); }
      mesaj(uyari, 'Yorum güncellendi.', 'basari');
      await yukle();
    });
  }

  async function sil(y) {
    if (!confirm('Bu yorum silinsin mi?')) return;
    const { error } = await supabase.from('yorumlar').delete().eq('id', y.id);
    if (error) return mesaj(uyari, hataMetni(error, 'Yorum silinemedi.'));
    mesaj(uyari, 'Yorum silindi.', 'basari');
    await yukle();
  }

  async function gizle(y) {
    const { error } = await supabase.from('yorumlar').update({ gizli: !y.gizli }).eq('id', y.id);
    if (error) return mesaj(uyari, hataMetni(error));
    await yukle();
  }

  async function yukle() {
    const { data, error } = await supabase.from('yorumlar')
      .select('id, metin, created_at, duzenlendi, gizli, kullanici_id, profiles(kullanici_adi)')
      .eq(hedefAlan, hedefId)
      .order('created_at', { ascending: false }) // en yeniler (201. yorumdan sonra yenisi kaybolmasın), sonra eskiden yeniye
      .limit(LISTE_SINIRI);
    if (error) { liste.replaceChildren(h('li', { class: 'bos' }, 'Yorumlar yüklenemedi.')); return; }
    data.reverse();
    sinirNotu.hidden = data.length < LISTE_SINIRI;
    const gorunur = data.filter((y) => !y.gizli).length;
    baslik.textContent = `Yorumlar (${gorunur})`;
    liste.replaceChildren(...(data.length ? data.map(yorumOgesi) : [h('li', { class: 'bos' }, 'Henüz yorum yok. İlk yorumu siz yazın!')]));
  }

  await yukle();
}
