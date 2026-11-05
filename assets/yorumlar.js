// Yorum bölümü (haber, maç ve gol sayfalarında). Yorumlar yalnız metin olarak gösterilir (innerHTML yok).
// Asıl kurallar sunucuda (001 + 012 + 013): uzunluk 1-1000, e-posta onayı, yasaklı hesap yazamaz, dakikada 5 / günde 50,
// aynı metin 10 dk içinde tekrar yok, düzenleme yalnız 30 dk içinde ve dakikada en fazla 10; gizli yorumlar herkese kapalı.
// Erişilebilirlik (docs/TASARIM.md 9.3): görünür etiket, sayaç ve hata aria-describedby ile bağlı, sınır aşımı sessizce
// kesilmez; gönderirken düğme aria-disabled (odakta kalır); başarıda odak yazma alanında kalır ve YALNIZ yeni yorum eklenir
// (liste baştan çizilmez); düzenle/vazgeç/kaydet sonrası odak aynı yorumun "Düzenle" düğmesine, silince sonraki yoruma;
// duyurular sayfanın kalıcı #durum / #uyari bölgelerinden; listede aria-live yok.
import { supabase, h, mesaj, duyur, tarihYaz, hataMetni, girisAdresi } from './ortak.js';
import { YORUM_SINIRLARI } from './kurallar.js';

const EN_FAZLA = YORUM_SINIRLARI.enUzun;
const LISTE_SINIRI = 200; // en yeni 200 yorum gösterilir
const ESIKLER = [100, 20, 0];
const SECIM = 'id, metin, created_at, duzenlendi, gizli, kullanici_id, profiles(kullanici_adi)';
const NEDENLER = [['hakaret', 'Küfür / hakaret'], ['nefret', 'Irkçı, ayrımcı söz'], ['hedef_gosterme', 'Hedef gösterme, şiddete çağrı'], ['spam', 'Reklam / spam'], ['kisisel_veri', 'Kişisel bilgi paylaşımı'], ['diger', 'Başka bir neden']];

export async function yorumlariKur(kok, { haberId = null, macId = null, golId = null, oturum }) {
  const hedefAlan = haberId ? 'haber_id' : golId ? 'gol_id' : 'mac_id';
  const hedefId = haberId || golId || macId;
  const benim = oturum && oturum.kullanici ? oturum.kullanici.id : null;
  const admin = !!(oturum && oturum.admin);
  // E-postası onaylanmamış oturum (Supabase: user.email_confirmed_at boş; ör. anonim giriş): yorum yazamaz
  const onayli = !!(oturum && oturum.kullanici && oturum.kullanici.email_confirmed_at);
  let engelli = false;
  if (benim && onayli) { try { const r = await supabase.rpc('engelli_mi'); engelli = r && r.data === true; } catch (e) { engelli = false; } }

  const baslik = h('h2', { id: 'yorum-baslik', tabindex: '-1' }, 'Yorumlar');
  const uyariKutu = h('p', { class: 'mesaj', id: 'yorum-mesaj', hidden: true });
  const liste = h('ol', { class: 'yorum-listesi', id: 'yorum-listesi', 'aria-labelledby': 'yorum-baslik' });
  const sinirNotu = h('p', { class: 'soluk kucuk-yazi', id: 'yorum-sinir-notu', hidden: true }, `Son ${LISTE_SINIRI} yorum gösteriliyor.`);
  const kural = h('p', { class: 'yorum-kural' }, 'Sıcak, saygılı, küfürsüz tribün: ', h('a', { href: 'kurallar.html' }, 'topluluk kuralları'), '.');
  let form = null;
  let gorunurSayi = 0;
  const sayiYaz = () => { baslik.textContent = `Yorumlar (${gorunurSayi})`; };
  const hataGoster = (alan, metin) => { mesaj(uyariKutu, metin, 'hata'); if (alan) { alan.setAttribute('aria-invalid', 'true'); alan.focus(); } };

  if (benim && onayli && !engelli) {
    const alan = h('textarea', { id: 'yorum-metni', name: 'metin', required: true, rows: '3', placeholder: 'Maç hakkında ne düşünüyorsun?', 'aria-describedby': 'yorum-ipucu yorum-mesaj' });
    const sayac = h('span', { class: 'sayac', id: 'yorum-sayac' }, `0 / ${EN_FAZLA}`);
    const gonder = h('button', { type: 'submit', class: 'dugme' }, 'Gönder');
    let sonEsik = null;
    alan.addEventListener('input', () => {
      const n = alan.value.length, kalan = EN_FAZLA - n;
      sayac.textContent = kalan < 0 ? `${n} / ${EN_FAZLA} · ${-kalan} karakter fazla` : `${n} / ${EN_FAZLA}`;
      sayac.classList.toggle('asim', kalan < 0);
      if (kalan >= 0 && alan.getAttribute('aria-invalid') === 'true') { alan.removeAttribute('aria-invalid'); mesaj(uyariKutu, ''); }
      const esik = ESIKLER.find((e) => kalan <= e && kalan > e - 10);
      if (esik !== undefined && esik !== sonEsik) { sonEsik = esik; duyur(esik === 0 ? 'Karakter sınırına geldin.' : `${kalan} karakter kaldı.`); }
      if (kalan > 100) sonEsik = null;
    });
    form = h('form', { class: 'yorum-formu', id: 'yorum-formu', novalidate: true },
      h('label', { for: 'yorum-metni' }, 'Yorumun'),
      alan,
      h('div', { class: 'alt-satir' }, h('p', { class: 'sayac', id: 'yorum-ipucu' }, `En fazla ${EN_FAZLA} karakter. `, sayac), gonder));
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (gonder.getAttribute('aria-disabled') === 'true') return; // çift dokunma tek kayıt
      const metin = alan.value.trim();
      if (!metin) return hataGoster(alan, 'Boş yorum gönderilemez. Bir şeyler yaz!');
      if (metin.length > EN_FAZLA) return hataGoster(alan, `Yorum en fazla ${EN_FAZLA} karakter olabilir (${metin.length - EN_FAZLA} karakter fazla).`);
      gonder.setAttribute('aria-disabled', 'true');
      liste.setAttribute('aria-busy', 'true');
      const { data, error } = await supabase.from('yorumlar').insert({ [hedefAlan]: hedefId, metin }).select(SECIM).single();
      gonder.removeAttribute('aria-disabled');
      liste.removeAttribute('aria-busy');
      if (error) return hataGoster(alan, hataMetni(error, 'Yorum gönderilemedi.')); // yazılan metin kaybolmaz
      alan.value = '';
      alan.removeAttribute('aria-invalid');
      sayac.textContent = `0 / ${EN_FAZLA}`;
      sayac.classList.remove('asim');
      liste.querySelector('.bos')?.remove();
      liste.append(yorumOgesi(data));
      gorunurSayi += data.gizli ? 0 : 1;
      sayiYaz();
      mesaj(uyariKutu, 'Yorumun tribüne düştü 👏', 'basari');
      duyur('Yorumun eklendi.');
      alan.focus();
    });
  }

  const girisNotu = benim ? null : h('div', { class: 'giris-cagri', id: 'yorum-giris-notu' },
    h('p', null, 'Sen de yaz: giriş yap ya da 30 saniyede üye ol.'),
    h('a', { class: 'dugme ikincil', href: girisAdresi('#yorumlar') }, 'Yorum yazmak için giriş yap'));
  const onayNotu = benim && !onayli ? h('p', { class: 'mesaj bilgi', id: 'yorum-onay-notu' },
    'Yorum yazmak için e-posta adresini onayla: hesap açarken gelen e-postadaki bağlantıya tıkla, sonra çıkış yapıp yeniden gir.') : null;
  const engelNotu = engelli ? h('p', { class: 'mesaj bilgi', id: 'yorum-engel-notu' },
    'Hesabın topluluk kuralları nedeniyle yorum yazmaya kapatıldı. İtiraz için alt bilgideki iletişim adresine yaz.') : null;

  kok.replaceChildren(h('section', { class: 'yorumlar', id: 'yorumlar-bolumu', 'aria-labelledby': 'yorum-baslik' }, baslik, kural, girisNotu, onayNotu, engelNotu, form, uyariKutu, sinirNotu, liste));

  // Kendi yorumu yalnız yazıldıktan sonraki 30 dakika içinde düzenlenebilir (sunucu da denetler; yönetici muaf)
  const duzenlenebilir = (y) => admin || Date.now() - Date.parse(y.created_at) < YORUM_SINIRLARI.duzenlemeSuresiDakika * 60000;

  function yorumOgesi(y) {
    const ad = (y.profiles && y.profiles.kullanici_adi) || 'taraftar';
    const adId = `y-${y.id}-ad`, zamanId = `y-${y.id}-zaman`, bagli = `${adId} ${zamanId}`;
    const metinP = h('p', { class: 'yorum-metni' }, y.metin);
    const eylem = h('div', { class: 'yorum-eylem' });
    const li = h('li', { class: 'yorum' + (y.gizli ? ' gizlenmis' : ''), 'data-yorum-id': y.id, id: 'y-' + y.id },
      h('span', { class: 'avatar', 'aria-hidden': 'true' }, ad.slice(0, 1).toLocaleUpperCase('tr-TR')),
      h('div', { class: 'yorum-govde' },
        h('p', { class: 'yorum-ust' },
          h('span', { class: 'ad', id: adId }, ad),
          h('time', { class: 'tarih', id: zamanId, datetime: y.created_at }, tarihYaz(y.created_at, { yil: false })),
          y.duzenlendi ? h('span', null, '(düzenlendi)') : null,
          y.gizli ? h('span', { class: 'rozet gizli' }, 'Gizlendi') : null),
        metinP, eylem));
    const dugme = (metin, sinif, f) => h('button', { type: 'button', class: 'hayalet' + (sinif ? ' ' + sinif : ''), 'aria-describedby': bagli, onclick: f }, metin);

    if (y.kullanici_id === benim) {
      eylem.append(...[
        duzenlenebilir(y) ? dugme('Düzenle', '', () => duzenle(y, li, metinP)) : null,
        dugme('Sil', 'tehlike', () => sil(y, li))].filter(Boolean));
    } else if (admin) {
      eylem.append(dugme(y.gizli ? 'Göster' : 'Gizle', '', () => gizle(y, li)), dugme('Sil', 'tehlike', () => sil(y, li)));
    } else if (benim && onayli) {
      eylem.append(dugme('Şikâyet et', '', () => sikayet(y, li)));
    }
    return li;
  }

  function yenile(li, y, odakMetni) {
    const yeni = yorumOgesi(y);
    li.replaceWith(yeni);
    const hedef = [...yeni.querySelectorAll('.yorum-eylem button')].find((b) => b.textContent === odakMetni) || yeni.querySelector('.yorum-eylem button');
    if (hedef) hedef.focus(); else baslik.focus();
    return yeni;
  }

  function duzenle(y, li, metinP) {
    const id = `yorum-duzenle-${y.id}`;
    const alan = h('textarea', { id, value: y.metin });
    const kaydet = h('button', { type: 'button', class: 'dugme kucuk' }, 'Kaydet');
    const vazgec = h('button', { type: 'button', class: 'dugme ikincil kucuk', onclick: () => yenile(li, y, 'Düzenle') }, 'Vazgeç');
    const kutu = h('div', { class: 'yorum-duzenle' }, h('label', { for: id }, 'Yorumu düzenle'), alan, h('div', { class: 'dugme-satir' }, kaydet, vazgec));
    metinP.replaceWith(kutu);
    li.querySelector('.yorum-eylem').hidden = true;
    alan.focus();
    kaydet.addEventListener('click', async () => {
      if (kaydet.getAttribute('aria-disabled') === 'true') return;
      const metin = alan.value.trim();
      if (!metin || metin.length > EN_FAZLA) { alan.setAttribute('aria-invalid', 'true'); mesaj(uyariKutu, `Yorum 1-${EN_FAZLA} karakter olmalı.`); alan.focus(); return; }
      kaydet.setAttribute('aria-disabled', 'true');
      const { error } = await supabase.from('yorumlar').update({ metin }).eq('id', y.id);
      kaydet.removeAttribute('aria-disabled');
      if (error) { mesaj(uyariKutu, hataMetni(error, 'Yorum kaydedilemedi.')); alan.focus(); return; }
      mesaj(uyariKutu, 'Yorum güncellendi.', 'basari');
      duyur('Yorum güncellendi.');
      yenile(li, { ...y, metin, duzenlendi: new Date().toISOString() }, 'Düzenle');
    });
  }

  async function sil(y, li) {
    if (!confirm('Bu yorum silinsin mi?')) return;
    const { error } = await supabase.from('yorumlar').delete().eq('id', y.id);
    if (error) return mesaj(uyariKutu, hataMetni(error, 'Yorum silinemedi.'));
    const sonraki = li.nextElementSibling || li.previousElementSibling;
    li.remove();
    if (!y.gizli) { gorunurSayi -= 1; sayiYaz(); }
    mesaj(uyariKutu, 'Yorum silindi.', 'basari');
    duyur('Yorum silindi.');
    const hedef = sonraki && sonraki.querySelector('button');
    if (hedef) hedef.focus(); else baslik.focus();
    if (!liste.children.length) liste.append(h('li', { class: 'bos' }, 'Tribün sessiz. İlk sözü sen söyle!'));
  }

  async function gizle(y, li) {
    const { error } = await supabase.from('yorumlar').update({ gizli: !y.gizli }).eq('id', y.id);
    if (error) return mesaj(uyariKutu, hataMetni(error));
    gorunurSayi += y.gizli ? 1 : -1; sayiYaz();
    duyur(y.gizli ? 'Yorum yeniden görünür.' : 'Yorum gizlendi.');
    yenile(li, { ...y, gizli: !y.gizli }, y.gizli ? 'Gizle' : 'Göster');
  }

  function sikayet(y, li) {
    const eylem = li.querySelector('.yorum-eylem');
    const sec = h('select', { id: `sikayet-neden-${y.id}` }, NEDENLER.map(([v, t]) => h('option', { value: v }, t)));
    const gonder = h('button', { type: 'button', class: 'dugme kucuk' }, 'Şikâyeti gönder');
    const vazgec = h('button', { type: 'button', class: 'hayalet' }, 'Vazgeç');
    const kutu = h('div', { class: 'yorum-duzenle', role: 'group', 'aria-label': 'Yorumu şikâyet et' },
      h('label', { for: sec.id }, 'Neden şikâyet ediyorsun?'), sec, h('div', { class: 'dugme-satir' }, gonder, vazgec));
    eylem.hidden = true;
    eylem.after(kutu);
    sec.focus();
    vazgec.addEventListener('click', () => { kutu.remove(); eylem.hidden = false; eylem.querySelector('button')?.focus(); });
    gonder.addEventListener('click', async () => {
      if (gonder.getAttribute('aria-disabled') === 'true') return;
      gonder.setAttribute('aria-disabled', 'true');
      const { error } = await supabase.from('yorum_sikayetleri').insert({ yorum_id: y.id, neden: sec.value });
      gonder.removeAttribute('aria-disabled');
      const tamam = !error || error.code === '23505' || /yorum_sikayeti_tek/.test(error.message || '');
      if (!tamam) { mesaj(uyariKutu, hataMetni(error, 'Şikâyet gönderilemedi.')); return; }
      kutu.replaceWith(h('p', { class: 'soluk kucuk-yazi', tabindex: '-1', id: `sikayet-tamam-${y.id}` }, 'Şikâyetin bize ulaştı, teşekkürler. Maç günleri 1 saat içinde bakıyoruz.'));
      li.querySelector(`#sikayet-tamam-${y.id}`).focus();
      duyur('Şikâyetin gönderildi.');
    });
  }

  async function yukle() {
    const { data, error } = await supabase.from('yorumlar').select(SECIM)
      .eq(hedefAlan, hedefId)
      .order('created_at', { ascending: false }) // en yeniler (201. yorumdan sonra yenisi kaybolmasın), sonra eskiden yeniye
      .limit(LISTE_SINIRI);
    if (error) { liste.replaceChildren(h('li', { class: 'bos' }, 'Yorumlar yüklenemedi. Sayfayı yenileyip tekrar dene.')); return; }
    data.reverse();
    sinirNotu.hidden = data.length < LISTE_SINIRI;
    gorunurSayi = data.filter((y) => !y.gizli).length;
    sayiYaz();
    liste.replaceChildren(...(data.length ? data.map(yorumOgesi) : [h('li', { class: 'bos' }, 'Tribün sessiz. İlk sözü sen söyle!')]));
  }

  await yukle();
}
