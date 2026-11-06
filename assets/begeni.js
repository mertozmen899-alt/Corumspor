// 020: beğeni düğmesi (haber ve gol sayfası, Paylaş'ın yanında): kalp + sayı, aria-pressed. Basınca kalp küçük bir patlamayla dolar
// (tek seferlik, ≤ 400 ms; stil.css .begeni.patladi), sayı kayarak artar / azalır; hareket azaltmada yalnız durum değişir. Herkes sayıyı
// görür, kimin beğendiğini görmez; "ben beğendim mi" ve sayı TEK istek (begeni_sayilari). Giriş yoksa düğmenin altında giriş çağrısı.
// İyimser güncelleme: sunucu reddederse (onaysız e-posta, yasak, dakikada 30 sınırı) eski hâline döner ve neden yazılır.
import { supabase, h, simge, duyur, hataMetni, girisAdresi, mesaj, rakamDegistir } from './ortak.js';

const KALP = 'M12 20.5S3 15 3 9a4.5 4.5 0 0 1 9-1.5A4.5 4.5 0 0 1 21 9c0 6-9 11.5-9 11.5z';

/** tur: 'haber' | 'gol'; oturumS: sayfaBaslat()'ın döndürdüğü oturum sözü. Döner: { dugme, not } (not düğme satırının altına konur). */
export function begeniDugmesi(tur, id, oturumS) {
  let sayi = null, benim = false, bekliyor = false;
  const sayiEl = h('span', { class: 'begeni-sayi', 'aria-hidden': 'true' }, '–');
  const okunus = h('span', { class: 'gorunmez' });
  const dugme = h('button', { type: 'button', class: 'paylas begeni', id: 'begeni', 'aria-pressed': 'false' },
    h('span', { class: 'kalp' }, simge(KALP, { boyut: 22 })), h('span', null, 'Beğen'), h('span', { class: 'sayi-pencere' }, sayiEl), okunus);
  const not = h('p', { class: 'begeni-not', id: 'begeni-not', hidden: true });
  const ciz = () => {
    dugme.setAttribute('aria-pressed', String(benim));
    okunus.textContent = sayi == null ? '' : `, ${sayi} beğeni`;
  };
  const yukle = supabase.rpc('begeni_sayilari', { p_tur: tur, p_idler: [id] }).then(({ data, error }) => {
    const r = !error && Array.isArray(data) ? data[0] : null;
    sayi = r ? r.sayi : 0; benim = !!(r && r.benim);
    sayiEl.textContent = String(sayi);
    ciz();
  }).catch(() => { sayi = 0; sayiEl.textContent = '0'; ciz(); });

  dugme.addEventListener('click', async () => {
    if (bekliyor) return;
    bekliyor = true;
    try {
      const oturum = await oturumS;
      if (!oturum || !oturum.kullanici) {
        not.replaceChildren('Beğenmek için ', h('a', { href: girisAdresi(), id: 'begeni-giris' }, 'giriş yap'), '.');
        not.classList.remove('hata'); not.hidden = false;
        duyur('Beğenmek için giriş yap.');
        return;
      }
      await yukle;
      const eski = { sayi, benim };
      benim = !benim; sayi = Math.max(0, sayi + (benim ? 1 : -1));
      ciz();
      rakamDegistir(sayiEl, String(sayi), benim ? 'yukari' : 'asagi');
      dugme.classList.remove('patladi');
      if (benim) { void dugme.offsetWidth; dugme.classList.add('patladi'); }
      const sorgu = benim ? supabase.from('begeniler').insert({ hedef_tur: tur, hedef_id: id })
        : supabase.from('begeniler').delete().eq('hedef_tur', tur).eq('hedef_id', id).eq('kullanici_id', oturum.kullanici.id);
      const { error } = await sorgu;
      if (error && error.code !== '23505') {
        ({ sayi, benim } = eski);
        ciz();
        rakamDegistir(sayiEl, String(sayi), 'asagi');
        dugme.classList.remove('patladi');
        mesaj(not, hataMetni(error, 'Beğeni kaydedilemedi.'));
        return;
      }
      mesaj(not, '');
      duyur(benim ? 'Beğendin.' : 'Beğenini geri aldın.');
    } finally { bekliyor = false; }
  });
  dugme.addEventListener('animationend', (e) => { if (e.animationName === 'kalp-pat') dugme.classList.remove('patladi'); });
  return { dugme, not };
}
