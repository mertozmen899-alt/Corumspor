// Yorum bölümü (haber, maç ve gol sayfalarında). Yorumlar yalnız metin olarak gösterilir (innerHTML yok).
// Asıl kurallar sunucuda (001 + 012 + 013): uzunluk 1-1000, e-posta onayı, yasaklı hesap yazamaz, dakikada 5 / günde 50,
// aynı metin 10 dk içinde tekrar yok, düzenleme yalnız 30 dk içinde ve dakikada en fazla 10; gizli yorumlar herkese kapalı.
// Erişilebilirlik (docs/TASARIM.md 9.3): görünür etiket, sayaç ve hata aria-describedby ile bağlı, sınır aşımı sessizce
// kesilmez; gönderirken düğme aria-disabled (odakta kalır); başarıda odak yazma alanında kalır ve YALNIZ yeni yorum eklenir
// (liste baştan çizilmez); düzenle/vazgeç/kaydet sonrası odak aynı yorumun "Düzenle" düğmesine, silince sonraki yoruma;
// duyurular sayfanın kalıcı #durum / #uyari bölgelerinden; listede aria-live yok.
// 014: moderasyon: yazanın kendi onay bekleyen yorumu "Onay bekliyor" rozetiyle görünür (başkası görmez); ipucu hedefe göre
// (maç / haber / gol); sıralama varsayılan "En yeni" üstte, "En eski" seçilebilir (saklanmaz); yasaklı hesap düzenleyemez/şikâyet edemez.
// 015: sıralama grubunun görünür adı "Sırala:" (aria-labelledby), seçili düğmede ✓ ve belirgin stil (stil.css "son tur: sunucu"),
// 2'den az yorumda grup gizli; başlık ve liste adı yazanın kendi bekleyen yorumunu da söyler: "Yorumlar (0 · 1 onay bekliyor)".
// 017: tek seviye yanıt (ust_yorum_id): "Yanıtla" yorumun altında küçük form açar; yanıtın yanıtı da ana yoruma bağlanır (sunucu).
// Yanıtlar ana yorumun içinde ol.yanitlar'da ESKİDEN YENİYE; sıralama yalnız ana yorumları çevirir; ana yorumu listede olmayan yanıt
// gösterilmez; sayaç yanıtları da sayar. Avatar: profil fotoğrafı (profiles.foto_url, kendi depo klasörü) ya da baş harf.
import { supabase, h, mesaj, duyur, tarihYaz, hataMetni, girisAdresi, avatarOgesi } from './ortak.js';
import { YORUM_SINIRLARI } from './kurallar.js';

const EN_FAZLA = YORUM_SINIRLARI.enUzun;
const LISTE_SINIRI = 200; // en yeni 200 yorum gösterilir
const ESIKLER = [100, 20, 0];
const SECIM = 'id, metin, created_at, duzenlendi, gizli, onay_bekliyor, kullanici_id, ust_yorum_id, profiles(kullanici_adi, foto_url)';
const IPUCU = { haber_id: 'Bu haber hakkında ne düşünüyorsun?', mac_id: 'Bu maç hakkında ne düşünüyorsun?', gol_id: 'Bu gol hakkında ne düşünüyorsun?' };
const herkeseAcik = (y) => !y.gizli && !y.onay_bekliyor;
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
  // Sıralama (taraftar 9): en yeni üstte varsayılan; "En eski" seçilince eskiden yeniye
  // 015 (erişilebilirlik 1, tasarımcı 1): görünür "Sırala:" etiketi grubun adı; seçili düğmede ✓ (yalnız renge dayanmaz)
  let sira = 'yeni';
  const isaret = (deger) => h('span', { class: 'sira-isaret', 'aria-hidden': 'true' }, sira === deger ? '✓ ' : '');
  const siraDugmesi = (deger, metin) => h('button', { type: 'button', class: 'hayalet', 'aria-pressed': String(sira === deger), 'data-sira': deger, onclick: () => siraDegistir(deger) }, isaret(deger), metin);
  const siralama = h('div', { class: 'dugme-satir yorum-siralama', id: 'yorum-siralama', role: 'group', 'aria-labelledby': 'yorum-siralama-etiket', hidden: true },
    h('span', { class: 'yorum-siralama-etiket', id: 'yorum-siralama-etiket' }, 'Sırala:'), siraDugmesi('yeni', 'En yeni'), siraDugmesi('eski', 'En eski'));
  const kural = h('p', { class: 'yorum-kural' }, 'Sıcak, saygılı, küfürsüz tribün: ', h('a', { href: 'kurallar.html' }, 'topluluk kuralları'), '.');
  let form = null;
  // Sayılar listeden okunur (li[data-durum]): acik = herkese açık, bekliyor = onay bekliyor (yazan ve yönetici görür)
  const sayiYaz = () => {
    const acik = liste.querySelectorAll('li.yorum[data-durum="acik"]').length;
    const bekleyen = liste.querySelectorAll('li.yorum[data-durum="bekliyor"]').length;
    baslik.textContent = bekleyen ? `Yorumlar (${acik} · ${bekleyen} onay bekliyor)` : `Yorumlar (${acik})`;
    siralama.hidden = liste.querySelectorAll(':scope > li.yorum').length < 2; // sıralama yalnız ana yorumları çevirir
  };
  const hataGoster = (alan, metin) => { mesaj(uyariKutu, metin, 'hata'); if (alan) { alan.setAttribute('aria-invalid', 'true'); alan.focus(); } };

  if (benim && onayli && !engelli) {
    const alan = h('textarea', { id: 'yorum-metni', name: 'metin', required: true, rows: '3', placeholder: IPUCU[hedefAlan] || IPUCU.mac_id, 'aria-describedby': 'yorum-ipucu yorum-mesaj' });
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
      if (sira === 'yeni') liste.prepend(yorumOgesi(data)); else liste.append(yorumOgesi(data));
      sayiYaz();
      if (data.onay_bekliyor) {
        mesaj(uyariKutu, 'Yorumun alındı; yönetici onaylayınca herkes görecek (maç günü ön onay ya da kelime kontrolü).', 'bilgi');
        duyur('Yorumun onay bekliyor.');
      } else {
        mesaj(uyariKutu, 'Yorumun tribüne düştü 👏', 'basari');
        duyur('Yorumun eklendi.');
      }
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

  kok.replaceChildren(h('section', { class: 'yorumlar', id: 'yorumlar-bolumu', 'aria-labelledby': 'yorum-baslik' }, baslik, kural, girisNotu, onayNotu, engelNotu, form, uyariKutu, siralama, sinirNotu, liste));

  // Kendi yorumu yalnız yazıldıktan sonraki 30 dakika içinde düzenlenebilir (sunucu da denetler; yönetici muaf)
  const duzenlenebilir = (y) => admin || Date.now() - Date.parse(y.created_at) < YORUM_SINIRLARI.duzenlemeSuresiDakika * 60000;

  const adiOku = (li) => li.querySelector('.ad').textContent; // ilk .ad yorumun kendisi (yanıtlar sonra gelir)
  const eylemi = (li) => li.querySelector(':scope > .yorum-govde > .yorum-eylem');
  /** Ana yorumun yanıt listesi (yoksa açılır; boş ol bırakılmaz). */
  function yanitListesi(anaLi) {
    let ol = anaLi.querySelector(':scope > .yorum-govde > ol.yanitlar');
    if (!ol) { ol = h('ol', { class: 'yanitlar', 'aria-label': `${adiOku(anaLi)} yorumuna yanıtlar` }); anaLi.querySelector('.yorum-govde').append(ol); }
    return ol;
  }

  function yorumOgesi(y, anaAd = null) {
    const ad = (y.profiles && y.profiles.kullanici_adi) || 'taraftar';
    const yanit = !!y.ust_yorum_id;
    const adId = `y-${y.id}-ad`, zamanId = `y-${y.id}-zaman`, bagli = `${adId} ${zamanId}`;
    const metinP = h('p', { class: 'yorum-metni' }, y.metin);
    const eylem = h('div', { class: 'yorum-eylem' });
    const li = h('li', { class: 'yorum' + (yanit ? ' yanit' : '') + (y.gizli ? ' gizlenmis' : ''), 'data-yorum-id': y.id, id: 'y-' + y.id, 'data-durum': herkeseAcik(y) ? 'acik' : y.gizli ? 'gizli' : 'bekliyor',
      'data-ust-yorum-id': y.ust_yorum_id || null, 'data-ana-ad': yanit ? (anaAd || 'taraftar') : null },
      avatarOgesi(ad, y.profiles && y.profiles.foto_url, y.kullanici_id),
      h('div', { class: 'yorum-govde' },
        h('p', { class: 'yorum-ust' },
          h('span', { class: 'ad', id: adId }, ad),
          // Kime yanıt: görünür "↳ ad", ekran okuyucuya "yanıt: ad"
          yanit ? h('span', { class: 'yanit-kime' }, h('span', { 'aria-hidden': 'true' }, '↳ '), h('span', { class: 'gorunmez' }, 'yanıt: '), anaAd || 'taraftar') : null,
          h('time', { class: 'tarih', id: zamanId, datetime: y.created_at }, tarihYaz(y.created_at, { yil: false })),
          y.duzenlendi ? h('span', null, '(düzenlendi)') : null,
          y.gizli ? h('span', { class: 'rozet gizli' }, 'Gizlendi') : null,
          y.onay_bekliyor ? h('span', { class: 'rozet gizli', id: `y-${y.id}-onay` }, 'Onay bekliyor') : null),
        metinP, eylem));
    const dugme = (metin, sinif, f) => h('button', { type: 'button', class: 'hayalet' + (sinif ? ' ' + sinif : ''), 'aria-describedby': bagli, onclick: f }, metin);
    // Yanıtla: giriş yapmış, onaylı, yasaklı olmayan herkes (kendi yorumunda da); yalnız herkese açık yoruma
    if (benim && onayli && !engelli && herkeseAcik(y)) eylem.append(dugme('Yanıtla', '', () => yanitAc(y, li)));

    if (y.kullanici_id === benim) {
      eylem.append(...[
        duzenlenebilir(y) && !engelli ? dugme('Düzenle', '', () => duzenle(y, li, metinP)) : null,
        dugme('Sil', 'tehlike', () => sil(y, li))].filter(Boolean));
    } else if (admin) {
      eylem.append(dugme(y.gizli ? 'Göster' : 'Gizle', '', () => gizle(y, li)), dugme('Sil', 'tehlike', () => sil(y, li)));
    } else if (benim && onayli && !engelli) {
      eylem.append(dugme('Şikâyet et', '', () => sikayet(y, li)));
    }
    return li;
  }

  function yenile(li, y, odakMetni) {
    const yeni = yorumOgesi(y, li.dataset.anaAd || null);
    const yanitlar = li.querySelector(':scope > .yorum-govde > ol.yanitlar');
    if (yanitlar) yeni.querySelector('.yorum-govde').append(yanitlar); // ana yorum yenilenince yanıtları yerinde kalır
    li.replaceWith(yeni);
    sayiYaz();
    const dugmeler = [...eylemi(yeni).querySelectorAll('button')];
    const hedef = dugmeler.find((b) => b.textContent === odakMetni) || dugmeler[0];
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
    eylemi(li).hidden = true;
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
      // Düzenleme kelime listesine takıldıysa yorum onay bekler (sunucu karar verir): son hâli tazele
      const { data: son } = await supabase.from('yorumlar').select(SECIM).eq('id', y.id).maybeSingle();
      const yeni = son || { ...y, metin, duzenlendi: new Date().toISOString() };
      if (herkeseAcik(y) && !herkeseAcik(yeni)) mesaj(uyariKutu, 'Yorumun güncellendi; yönetici onaylayınca herkes görecek.', 'bilgi');
      yenile(li, yeni, 'Düzenle');
    });
  }

  async function sil(y, li) {
    if (!confirm('Bu yorum silinsin mi?')) return;
    const { error } = await supabase.from('yorumlar').delete().eq('id', y.id);
    if (error) return mesaj(uyariKutu, hataMetni(error, 'Yorum silinemedi.'));
    const sonraki = li.nextElementSibling || li.previousElementSibling;
    const ana = li.parentElement.closest('li.yorum'); // yanıtsa ana yorumu
    li.remove(); // ana yorum yanıtlarıyla gider (sunucuda da on delete cascade)
    if (ana && !ana.querySelector('ol.yanitlar > li')) ana.querySelector('ol.yanitlar')?.remove();
    sayiYaz();
    mesaj(uyariKutu, 'Yorum silindi.', 'basari');
    duyur('Yorum silindi.');
    const hedef = (sonraki && sonraki.querySelector('button')) || (ana && eylemi(ana).querySelector('button'));
    if (hedef) hedef.focus(); else baslik.focus();
    if (!liste.children.length) liste.append(h('li', { class: 'bos' }, 'Tribün sessiz. İlk sözü sen söyle!'));
  }

  async function gizle(y, li) {
    const { error } = await supabase.from('yorumlar').update({ gizli: !y.gizli }).eq('id', y.id);
    if (error) return mesaj(uyariKutu, hataMetni(error));
    duyur(y.gizli ? 'Yorum yeniden görünür.' : 'Yorum gizlendi.');
    yenile(li, { ...y, gizli: !y.gizli }, y.gizli ? 'Gizle' : 'Göster');
  }

  /** 017: yanıt formu yorumun altında açılır; gönderimde ust_yorum_id = ana yorum (yanıtın yanıtı da ana yoruma bağlanır). */
  function yanitAc(y, li) {
    const id = `yanit-metni-${y.id}`;
    const acik = document.getElementById(id);
    if (acik) { acik.focus(); return; }
    const anaId = y.ust_yorum_id || y.id;
    const eylem = eylemi(li);
    const ipucuId = `yanit-ipucu-${y.id}`, hataId = `yanit-hata-${y.id}`;
    const ad = (y.profiles && y.profiles.kullanici_adi) || 'taraftar';
    // Yanıtın yanıtında kime yazıldığı metinde de okunsun
    const alan = h('textarea', { id, name: 'metin', rows: '2', required: true, 'aria-describedby': `${ipucuId} ${hataId}`, value: y.ust_yorum_id ? `@${ad} ` : '' });
    const hata = h('p', { class: 'mesaj', id: hataId, hidden: true });
    const gonder = h('button', { type: 'submit', class: 'dugme kucuk' }, 'Gönder');
    const vazgec = h('button', { type: 'button', class: 'dugme ikincil kucuk' }, 'Vazgeç');
    const kutu = h('form', { class: 'yorum-duzenle yanit-formu', novalidate: true },
      h('label', { for: id }, 'Yanıtın'), alan, h('p', { class: 'sayac', id: ipucuId }, `En fazla ${EN_FAZLA} karakter.`), hata,
      h('div', { class: 'dugme-satir' }, gonder, vazgec));
    const kapat = () => {
      kutu.remove();
      eylem.hidden = false;
      const d = [...eylem.querySelectorAll('button')];
      (d.find((b) => b.textContent === 'Yanıtla') || d[0])?.focus();
    };
    const yanlis = (metin) => { mesaj(hata, metin, 'hata'); alan.setAttribute('aria-invalid', 'true'); alan.focus(); };
    eylem.hidden = true;
    eylem.after(kutu);
    alan.focus();
    alan.setSelectionRange(alan.value.length, alan.value.length);
    vazgec.addEventListener('click', kapat);
    kutu.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (gonder.getAttribute('aria-disabled') === 'true') return; // çift dokunma tek kayıt
      const metin = alan.value.trim();
      if (!metin) return yanlis('Boş yanıt gönderilemez. Bir şeyler yaz!');
      if (metin.length > EN_FAZLA) return yanlis(`Yanıt en fazla ${EN_FAZLA} karakter olabilir (${metin.length - EN_FAZLA} karakter fazla).`);
      gonder.setAttribute('aria-disabled', 'true');
      const { data, error } = await supabase.from('yorumlar').insert({ [hedefAlan]: hedefId, metin, ust_yorum_id: anaId }).select(SECIM).single();
      gonder.removeAttribute('aria-disabled');
      if (error) return yanlis(hataMetni(error, 'Yanıt gönderilemedi.')); // yazılan metin kaybolmaz
      const anaLi = liste.querySelector(`li[data-yorum-id="${data.ust_yorum_id || anaId}"]`);
      if (anaLi) yanitListesi(anaLi).append(yorumOgesi(data, adiOku(anaLi)));
      sayiYaz();
      kapat();
      duyur(data.onay_bekliyor ? 'Yanıtın alındı; yönetici onaylayınca herkes görecek.' : 'Yanıtın eklendi.');
    });
  }

  function sikayet(y, li) {
    const eylem = eylemi(li);
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
      kutu.replaceWith(h('p', { class: 'soluk kucuk-yazi', tabindex: '-1', id: `sikayet-tamam-${y.id}` }, 'Şikâyetin bize ulaştı, teşekkürler. En kısa sürede bakıyoruz.'));
      li.querySelector(`#sikayet-tamam-${y.id}`).focus();
      duyur('Şikâyetin gönderildi.');
    });
  }

  async function yukle() {
    const { data, error } = await supabase.from('yorumlar').select(SECIM)
      .eq(hedefAlan, hedefId)
      .order('created_at', { ascending: false }) // en yeniler (201. yorumdan sonra yenisi kaybolmasın)
      .limit(LISTE_SINIRI);
    if (error) { liste.replaceChildren(h('li', { class: 'bos' }, 'Yorumlar yüklenemedi. Sayfayı yenileyip tekrar dene.')); return; }
    // Ana yorumlar seçili sırayla; yanıtlar ana yorumun içinde eskiden yeniye; ana yorumu listede olmayan yanıt gösterilmez
    const analar = data.filter((y) => !y.ust_yorum_id);
    if (sira === 'eski') analar.reverse();
    const ogeler = new Map(analar.map((y) => [y.id, yorumOgesi(y)]));
    data.filter((y) => y.ust_yorum_id && ogeler.has(y.ust_yorum_id))
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
      .forEach((y) => { const anaLi = ogeler.get(y.ust_yorum_id); yanitListesi(anaLi).append(yorumOgesi(y, adiOku(anaLi))); });
    sinirNotu.hidden = data.length < LISTE_SINIRI;
    liste.replaceChildren(...(ogeler.size ? ogeler.values() : [h('li', { class: 'bos' }, 'Tribün sessiz. İlk sözü sen söyle!')]));
    sayiYaz();
  }

  /** Sıralamayı çevirir: liste yeniden istenmez, aynı düğümler ters sıraya dizilir (odak ve düzenleme kutusu korunur). */
  function siraDegistir(yeni) {
    if (yeni === sira) return;
    sira = yeni;
    siralama.querySelectorAll('button').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.sira === sira));
      b.querySelector('.sira-isaret').textContent = b.dataset.sira === sira ? '✓ ' : '';
    });
    const ogeler = [...liste.children];
    if (ogeler.length > 1 && !ogeler.some((x) => x.classList.contains('bos'))) liste.append(...ogeler.reverse());
    duyur(sira === 'yeni' ? 'Yorumlar en yeniden eskiye sıralandı.' : 'Yorumlar en eskiden yeniye sıralandı.');
  }

  await yukle();
}
