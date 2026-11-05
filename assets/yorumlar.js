// Yorum bölümü (haber ve maç sayfalarında). Yorumlar sadece metin olarak gösterilir.
// Asıl kurallar sunucuda: uzunluk 1-1000, dakikada 5 yorum, gizli yorumlar herkese kapalı.
import { supabase, h, mesaj, tarihYaz, hataMetni, girisAdresi } from './ortak.js';

const EN_FAZLA = 1000;

export async function yorumlariKur(kok, { haberId = null, macId = null, oturum }) {
  const hedefAlan = haberId ? 'haber_id' : 'mac_id';
  const hedefId = haberId || macId;
  const benim = oturum && oturum.kullanici ? oturum.kullanici.id : null;
  const admin = !!(oturum && oturum.admin);

  const baslik = h('h2', { id: 'yorum-baslik' }, 'Yorumlar');
  const uyari = h('div', { hidden: true, id: 'yorum-mesaj' });
  const liste = h('ol', { class: 'yorum-listesi', id: 'yorum-listesi', 'aria-live': 'polite' });
  let form = null;

  if (benim) {
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

  kok.replaceChildren(h('section', { class: 'yorumlar', 'aria-labelledby': 'yorum-baslik' }, baslik, girisNotu, form, uyari, liste));

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
      eylem.append(
        h('button', { type: 'button', class: 'dugme ikincil kucuk', onclick: () => duzenle(y, li, metinP) }, 'Düzenle'),
        h('button', { type: 'button', class: 'dugme tehlike kucuk', onclick: () => sil(y) }, 'Sil'));
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
      .order('created_at', { ascending: true })
      .limit(200);
    if (error) { liste.replaceChildren(h('li', { class: 'bos' }, 'Yorumlar yüklenemedi.')); return; }
    const gorunur = data.filter((y) => !y.gizli).length;
    baslik.textContent = `Yorumlar (${gorunur})`;
    liste.replaceChildren(...(data.length ? data.map(yorumOgesi) : [h('li', { class: 'bos' }, 'Henüz yorum yok. İlk yorumu siz yazın!')]));
  }

  await yukle();
}
