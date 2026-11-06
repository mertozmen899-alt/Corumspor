// Yönetim paneli. Buradaki rol kontrolü sadece kullanım kolaylığı içindir;
// her yazma işlemini sunucudaki RLS politikaları (public.is_admin()) ayrıca denetler.
import {
  supabase, h, $, mesaj, sayfaBaslat, hataMetni, tarihYaz, yerelGirdi, girdidenIso, guvenliGorsel,
  girisAdresi, DURUM_ADI, durumRozeti, skorMetni, evSahibiDeplasman, dakikaMetni, youtubeKimlik, mp4Mu, sekmeKlavyesi, avatarOgesi,
} from '../ortak.js';
import { gorselKucult, ENCOK_GIRDI_BAYT } from '../gorsel-kucult.js';
import {
  SAKATLIK_DURUMLARI, SAKATLIK_BAGLANTI_ZORUNLU, sakatlikHatalari, haberHatalari, golVideoGecerli, altyaziAdresiGecerli, GOL_VIDEO_KOVASI, kelimeBicimi, ON_ONAY,
  PROFIL_FOTO_KOVASI, profilFotoGecerli, golAniHatalari, oynamaDakikasi, VIDEO_ARALIK_SINIRI,
} from '../kurallar.js';

const KOVA = 'haber-gorselleri';
const EN_BUYUK_GORSEL = 3 * 1024 * 1024; // kova sınırı (002_depolama.sql); küçültülmüş dosya buna sığmalı
const GORSEL_TURLERI = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }; // GIF yok (013: hep WebP kopyalar)
const KOPYALAR = [1600, 800, 480]; // "<ad>-1600.webp" + -800 + -480: ziyaretçi sayfaları srcset ile ekrana uyanı alır
const HAK_NOTU = 'Yalnızca hakkına sahip olduğunuz (kendi çektiğiniz, yazılı izinle aldığınız ya da özgür lisanslı) fotoğrafları yükleyin. Tribün fotoğraflarında yüzler tanınmamalı.';

const oturum = await sayfaBaslat();
const yetki = $('#yetki-mesaj');
const bildir = (metin, tur = 'basari') => mesaj($('#panel-mesaj'), metin, tur);

function alan(id, etiket, girdi, not) {
  return h('div', { class: 'alan' }, h('label', { for: id }, etiket), girdi, not ? h('small', null, not) : null);
}

function onayla(soru) {
  return window.confirm(soru);
}

/** 018: kadrodaki oyuncu adları (gol formu "Golü atan" / "Asist" ve maç kadrosu için öneri listesi; serbest metin de olur). */
function kadroAdlariListesi() {
  let dl = document.getElementById('kadro-adlari');
  if (dl) return dl;
  dl = h('datalist', { id: 'kadro-adlari' });
  document.body.append(dl);
  supabase.from('oyuncular').select('ad').order('ad').limit(200).then(({ data }) => {
    dl.replaceChildren(...(data || []).map((o) => h('option', { value: o.ad })));
  });
  return dl;
}
const tamSayiOku = (id) => { const v = $(id).value.trim(); return v === '' ? null : Number(v); };

/**
 * Görseli tarayıcıda küçültüp 3 WebP kopya olarak yükler (<klasör>/<uuid>-1600.webp, -800, -480); döner: 1600'lük adres.
 * Kova sınırı (3 MB, 002) küçültülmüş dosyaya uygulanır. Hata: { hata }.
 */
async function kopyalariYukle(dosya, klasor = '') {
  if (!GORSEL_TURLERI[dosya.type]) return { hata: 'Görsel JPEG, PNG ya da WebP olmalı.' };
  if (dosya.size > ENCOK_GIRDI_BAYT) return { hata: 'Görsel çok büyük: en fazla 25 MB bir fotoğraf seçin.' };
  const kok = `${klasor}${crypto.randomUUID()}`;
  let ana = null;
  for (const gen of KOPYALAR) {
    const kucuk = await gorselKucult(dosya, { enGenis: gen, enYuksek: gen });
    if (kucuk.size > EN_BUYUK_GORSEL) return { hata: 'Görsel küçültüldükten sonra da 3 MB\'tan büyük. Daha küçük bir görsel seçin.' };
    const uzanti = GORSEL_TURLERI[kucuk.type] || 'webp';
    const yol = `${kok}-${gen}.${uzanti}`;
    const y = await supabase.storage.from(KOVA).upload(yol, kucuk, { contentType: kucuk.type, cacheControl: '31536000', upsert: false });
    if (y.error) return { hata: hataMetni(y.error, 'Görsel yüklenemedi.') };
    if (gen === 1600) ana = supabase.storage.from(KOVA).getPublicUrl(yol).data.publicUrl;
  }
  return { url: ana };
}

/** Depodaki görselin bütün kopyalarının yolları (silmek için). */
function depoYollari(url) {
  const i = typeof url === 'string' ? url.indexOf('/' + KOVA + '/') : -1;
  if (i < 0) return [];
  const yol = decodeURIComponent(url.slice(i + KOVA.length + 2).split('?')[0]);
  const m = /^(.*)-1600\.(webp|jpg)$/.exec(yol);
  return m ? KOPYALAR.map((g) => `${m[1]}-${g}.${m[2]}`) : [yol];
}

// ===================================================================== Haberler
function haberlerSekmesi(kok) {
  let duzenlenen = null; // { id, kapak_url }
  let kapakKaldir = false;
  const onizleme = h('div', { id: 'h-kapak-onizleme' });
  const form = h('form', { class: 'kutu', id: 'haber-formu', novalidate: true },
    h('h2', { id: 'haber-form-baslik' }, 'Yeni haber'),
    alan('h-baslik', 'Başlık', h('input', { type: 'text', id: 'h-baslik', maxlength: '200', required: true })),
    alan('h-ozet', 'Özet (isteğe bağlı)', h('textarea', { id: 'h-ozet', maxlength: '500', rows: '2' })),
    alan('h-govde', 'Haber metni', h('textarea', { id: 'h-govde', maxlength: '20000', rows: '10' }),
      'Düz metin. Paragrafları boş bir satırla ayırın. HTML kullanılamaz.'),
    alan('h-kapak', 'Kapak görseli', h('input', { type: 'file', id: 'h-kapak', accept: Object.keys(GORSEL_TURLERI).join(',') }),
      'JPEG, PNG ya da WebP. Yüklemeden önce 1600, 800 ve 480 piksellik WebP kopyaları yapılır (ziyaretçi ekranına uyanı indirir). ' + HAK_NOTU),
    onizleme,
    alan('h-kapak-kaynak', 'Kapak fotoğrafının sahibi / kaynağı (isteğe bağlı)', h('input', { type: 'text', id: 'h-kapak-kaynak', maxlength: '160', placeholder: 'ör. Fotoğraf: Ad Soyad, CC BY 4.0' }),
      'Kapağın üstünde küçük yazıyla gösterilir. Özgür lisanslı fotoğrafta atıf zorunludur.'),
    // 014 (başkan 3, erişilebilirlik 12): kaynak, düzeltme notu, kapak alt metni
    alan('h-kapak-alt', 'Kapak fotoğrafında ne var? (alt metin, isteğe bağlı)', h('input', { type: 'text', id: 'h-kapak-alt', maxlength: '200', placeholder: 'ör. Skor tabelası: Çorum FK 2 - 1 Örnekköy Spor' }),
      'Fotoğraf bilgi taşıyorsa (skor tabelası, oyuncu, pankart yazısı) yazın; yalnız süs ise boş bırakın.'),
    h('div', { class: 'iki-sutun' },
      alan('h-kaynak', 'Haberin kaynağı', h('input', { type: 'text', id: 'h-kaynak', maxlength: '120', placeholder: 'ör. Kulüp açıklaması, TFF, Çorum Valiliği' })),
      alan('h-kaynak-url', 'Kaynak bağlantısı (https, isteğe bağlı)', h('input', { type: 'url', id: 'h-kaynak-url', inputmode: 'url', placeholder: 'https://…' }))),
    // 015 (başkan 2): bu tür haberde kaynak zorunlu (istemci + sunucu: haberler.kaynak_gerekli)
    h('div', { class: 'alan' }, h('label', { class: 'onay' }, h('input', { type: 'checkbox', id: 'h-kaynak-gerekli', 'aria-describedby': 'h-kaynak-notu' }), 'Kadro / transfer / sakatlık / bilet haberi')),
    h('p', { class: 'yonetim-not', id: 'h-kaynak-notu' }, 'Kadro, transfer, sakatlık ve bilet haberlerinde kaynağı mutlaka yazın (kulüp açıklaması, TFF): yukarıdaki kutu işaretliyse kaynaksız kaydedilmez. Söylenti haber yapılmaz. Kaynak haberin sonunda "Kaynak: …" olarak görünür.'),
    alan('h-duzeltme', 'Düzeltme notu (yalnız haberde hata düzeltildiyse)', h('textarea', { id: 'h-duzeltme', maxlength: '500', rows: '2', placeholder: 'ör. İlk hâlinde maç saati 19.00 yazıyordu; doğrusu 20.00.' }),
      'Doluysa haberin başında "Düzeltme" kutusunda tarihiyle gösterilir. Düzeltilen bilgiyi sessizce değiştirmeyin.'),
    h('div', { class: 'alan' }, h('label', { class: 'onay' }, h('input', { type: 'checkbox', id: 'h-manset' }), 'Manşet (ana sayfanın büyük açılış görselinde gösterilir; en yeni manşet)')),
    h('div', { class: 'alan' }, h('label', { class: 'onay' }, h('input', { type: 'checkbox', id: 'h-yayinda' }), 'Yayında (herkes görebilir)')),
    h('div', { class: 'dugme-satir' },
      h('button', { type: 'submit', class: 'dugme', id: 'h-kaydet' }, 'Kaydet'),
      h('button', { type: 'button', class: 'dugme ikincil', id: 'h-yeni' }, 'Yeni haber')));
  const liste = h('ul', { class: 'yonetim-liste', id: 'haber-listesi' });
  kok.replaceChildren(form, h('div', { class: 'bolum-baslik' }, h('h2', null, 'Bütün haberler')), liste);

  function onizlemeGoster(url) {
    const src = guvenliGorsel(url);
    onizleme.replaceChildren(...(src && !kapakKaldir ? [
      h('img', { class: 'kapak-onizleme', src, alt: 'Kapak önizleme' }),
      h('button', { type: 'button', class: 'dugme-metin', onclick: () => { kapakKaldir = true; onizlemeGoster(null); } }, 'Kapağı kaldır'),
    ] : []));
  }

  function temizle() {
    duzenlenen = null; kapakKaldir = false;
    form.reset();
    $('#haber-form-baslik').textContent = 'Yeni haber';
    onizlemeGoster(null);
  }

  function doldur(haber) {
    duzenlenen = { id: haber.id, kapak_url: haber.kapak_url };
    kapakKaldir = false;
    $('#haber-form-baslik').textContent = 'Haberi düzenle';
    $('#h-baslik').value = haber.baslik;
    $('#h-ozet').value = haber.ozet || '';
    $('#h-govde').value = haber.govde || '';
    $('#h-kapak').value = '';
    $('#h-yayinda').checked = haber.yayinda;
    $('#h-manset').checked = !!haber.manset;
    $('#h-kapak-kaynak').value = haber.kapak_kaynak || '';
    $('#h-kapak-alt').value = haber.kapak_alt || '';
    $('#h-kaynak').value = haber.kaynak || '';
    $('#h-kaynak-url').value = haber.kaynak_url || '';
    $('#h-kaynak-gerekli').checked = !!haber.kaynak_gerekli;
    $('#h-duzeltme').value = haber.duzeltme_notu || '';
    onizlemeGoster(haber.kapak_url);
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('#h-baslik').focus();
  }

  $('#h-yeni').addEventListener('click', temizle);
  let onizlemeAdresi = null;
  $('#h-kapak').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (f && GORSEL_TURLERI[f.type] && f.size <= ENCOK_GIRDI_BAYT) {
      kapakKaldir = false;
      if (onizlemeAdresi) URL.revokeObjectURL(onizlemeAdresi);
      onizlemeAdresi = URL.createObjectURL(f);
      onizleme.replaceChildren(h('img', { class: 'kapak-onizleme', src: onizlemeAdresi, alt: 'Yeni kapak önizleme' }));
    }
  });


  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const baslik = $('#h-baslik').value.trim();
    if (baslik.length < 3) return bildir('Başlık en az 3 karakter olmalı.', 'hata');
    const kayit = {
      baslik,
      ozet: $('#h-ozet').value.trim() || null,
      govde: $('#h-govde').value.replace(/\r\n?/g, '\n').trim(),
      yayinda: $('#h-yayinda').checked,
      manset: $('#h-manset').checked,
      kapak_kaynak: $('#h-kapak-kaynak').value.trim() || null,
      kapak_alt: $('#h-kapak-alt').value.trim() || null,
      kaynak: $('#h-kaynak').value.trim() || null,
      kaynak_url: $('#h-kaynak-url').value.trim() || null,
      kaynak_gerekli: $('#h-kaynak-gerekli').checked,
      duzeltme_notu: $('#h-duzeltme').value.trim() || null,
    };
    const hHata = haberHatalari(kayit);
    const hIlk = Object.keys(hHata)[0];
    if (hIlk) {
      const girdi = $('#' + { kaynak: 'h-kaynak', kaynak_url: 'h-kaynak-url', duzeltme_notu: 'h-duzeltme', kapak_alt: 'h-kapak-alt' }[hIlk]);
      girdi.setAttribute('aria-invalid', 'true'); girdi.focus();
      return bildir(hHata[hIlk], 'hata');
    }
    form.querySelectorAll('[aria-invalid]').forEach((e) => e.removeAttribute('aria-invalid'));
    const dugme = $('#h-kaydet');
    dugme.disabled = true;
    try {
      const dosya = $('#h-kapak').files[0];
      const eski = duzenlenen && duzenlenen.kapak_url;
      if (dosya) {
        // Yüklemeden önce küçült (telefon fotoğrafı ziyaretçinin internetini yemesin); sunucu yine 3 MB / tür sınırı uygular
        const y = await kopyalariYukle(dosya);
        if (y.hata) return bildir(y.hata, 'hata');
        kayit.kapak_url = y.url;
      } else if (kapakKaldir) {
        kayit.kapak_url = null;
      }
      const sorgu = duzenlenen
        ? supabase.from('haberler').update(kayit).eq('id', duzenlenen.id)
        : supabase.from('haberler').insert(kayit);
      const { error } = await sorgu.select('id').single();
      if (error) return bildir(hataMetni(error, 'Haber kaydedilemedi.'), 'hata');
      // Değişen/kaldırılan eski kapağı depodan sil (başarısızsa önemsiz)
      if ('kapak_url' in kayit && depoYollari(eski).length) supabase.storage.from(KOVA).remove(depoYollari(eski)).catch(() => {});
      bildir(duzenlenen ? 'Haber güncellendi.' : 'Haber eklendi.');
      temizle();
      await yukle();
    } finally {
      dugme.disabled = false;
    }
  });

  async function yayinDegistir(haber) {
    const { error } = await supabase.from('haberler').update({ yayinda: !haber.yayinda }).eq('id', haber.id);
    if (error) return bildir(hataMetni(error), 'hata');
    bildir(haber.yayinda ? 'Haber yayından kaldırıldı.' : 'Haber yayınlandı.');
    await yukle();
  }

  async function sil(haber) {
    if (!onayla(`"${haber.baslik}" haberi ve yorumları silinsin mi?`)) return;
    const { error } = await supabase.from('haberler').delete().eq('id', haber.id);
    if (error) return bildir(hataMetni(error), 'hata');
    const yollar = depoYollari(haber.kapak_url);
    if (yollar.length) supabase.storage.from(KOVA).remove(yollar).catch(() => {});
    bildir('Haber silindi.');
    if (duzenlenen && duzenlenen.id === haber.id) temizle();
    await yukle();
  }

  async function yukle() {
    const { data, error } = await supabase.from('haberler')
      .select('id, baslik, ozet, govde, kapak_url, kapak_kaynak, kapak_alt, kaynak, kaynak_url, kaynak_gerekli, duzeltme_notu, duzeltme_tarihi, manset, yayinda, yayin_tarihi, created_at')
      .order('created_at', { ascending: false }).limit(200);
    if (error) { liste.replaceChildren(h('li', null, hataMetni(error, 'Haberler yüklenemedi.'))); return; }
    liste.replaceChildren(...(data.length ? data.map((haber) => h('li', { 'data-haber-id': haber.id },
      h('span', { class: 'satir-baslik' }, haber.baslik),
      h('span', { class: 'dugme-satir kucuk-yazi soluk' },
        h('span', { class: 'rozet ' + (haber.yayinda ? 'yayinda' : '') }, haber.yayinda ? 'Yayında' : 'Taslak'),
        haber.manset ? h('span', { class: 'rozet canli' }, 'Manşet') : null,
        haber.duzeltme_notu ? h('span', { class: 'rozet' }, 'Düzeltildi') : null,
        haber.kaynak ? null : h('span', { class: 'rozet', title: 'Kadro, transfer ve bilet haberlerinde kaynak yazın' }, 'Kaynaksız'),
        haber.kaynak_gerekli ? h('span', { class: 'rozet', title: 'Kadro / transfer / sakatlık / bilet haberi: kaynak zorunlu' }, 'Kaynak zorunlu') : null,
        tarihYaz(haber.yayin_tarihi || haber.created_at)),
      h('span', { class: 'dugme-satir' },
        h('button', { type: 'button', class: 'dugme ikincil kucuk', onclick: () => doldur(haber) }, 'Düzenle'),
        h('button', { type: 'button', class: 'dugme ikincil kucuk', onclick: () => yayinDegistir(haber) }, haber.yayinda ? 'Yayından kaldır' : 'Yayınla'),
        h('a', { class: 'dugme ikincil kucuk', href: 'haber.html?id=' + encodeURIComponent(haber.id) }, 'Görüntüle'),
        h('button', { type: 'button', class: 'dugme tehlike kucuk', onclick: () => sil(haber) }, 'Sil'))))
      : [h('li', { class: 'bos' }, 'Henüz haber yok.')]));
  }

  return yukle();
}

// ===================================================================== Maçlar
function maclarSekmesi(kok) {
  let duzenlenen = null;
  const sayi = (id, etiket) => alan(id, etiket, h('input', { type: 'number', id, min: '0', max: '99', inputmode: 'numeric' }));
  const form = h('form', { class: 'kutu', id: 'mac-formu', novalidate: true },
    h('h2', { id: 'mac-form-baslik' }, 'Yeni maç'),
    alan('m-rakip', 'Rakip', h('input', { type: 'text', id: 'm-rakip', maxlength: '80', required: true })),
    h('div', { class: 'iki-sutun' },
      alan('m-tarih', 'Tarih ve saat (Türkiye saati)', h('input', { type: 'datetime-local', id: 'm-tarih', required: true })),
      alan('m-ic-saha', 'Saha', h('select', { id: 'm-ic-saha' }, h('option', { value: 'true' }, 'İç saha'), h('option', { value: 'false' }, 'Deplasman')))),
    h('div', { class: 'iki-sutun' },
      alan('m-stadyum', 'Stadyum', h('input', { type: 'text', id: 'm-stadyum', maxlength: '120' })),
      alan('m-organizasyon', 'Organizasyon (lig, kupa…)', h('input', { type: 'text', id: 'm-organizasyon', maxlength: '80' }))),
    alan('m-durum', 'Durum', h('select', { id: 'm-durum' }, Object.entries(DURUM_ADI).map(([v, ad]) => h('option', { value: v }, ad)))),
    h('div', { class: 'iki-sutun' }, sayi('m-corum-skor', 'Çorum golü'), sayi('m-rakip-skor', 'Rakip golü')),
    // 016: lig haftası ve maç özeti videosu (gol arşivinde "N. Hafta · …" ve "Özeti izle ▶")
    h('div', { class: 'iki-sutun' }, sayi('m-hafta', 'Hafta (lig; kupada boş)'),
      alan('m-ozet-kaynak', 'Özet videonun kaynağı', h('input', { type: 'text', id: 'm-ozet-kaynak', maxlength: '120', placeholder: 'ör. beIN SPORTS Türkiye YouTube kanalı' }))),
    alan('m-ozet', 'Maç özeti videosu (YouTube bağlantısı; isteğe bağlı)', h('input', { type: 'url', id: 'm-ozet', maxlength: '2000', placeholder: 'https://www.youtube.com/watch?v=…' }),
      'Yalnız hak sahibinin (yayıncı ya da kulüp) kendi kanalındaki video. Maç sayfasında dokununca açılır.'),
    // 014 (taraftar 7): bilet / yayın / kapı saati notu; (başkan 4) maç günü yorum ön onayı
    alan('m-not', 'Maç notu (bilet, yayın, kapı saati; isteğe bağlı)', h('textarea', { id: 'm-not', maxlength: '280', rows: '2', placeholder: 'ör. Biletler kulübün resmî satış noktalarında. Kapılar 17.00\'de açılır.' }),
      'Maç sayfasında küçük bir bilgi kutusunda görünür. En fazla 280 karakter. Yalnız resmî duyurudaki bilgiyi yazın.'),
    h('div', { class: 'alan' }, h('label', { class: 'onay' }, h('input', { type: 'checkbox', id: 'm-on-onay' }),
      `Yorumlarda ön onay (maçtan ${ON_ONAY.onceSaat} saat önce → ${ON_ONAY.sonraSaat} saat sonra bu maça ve gollerine yazılan yorumlar siz onaylayınca görünür)`)),
    h('div', { class: 'dugme-satir' },
      h('button', { type: 'submit', class: 'dugme', id: 'm-kaydet' }, 'Kaydet'),
      h('button', { type: 'button', class: 'dugme ikincil', id: 'm-yeni' }, 'Yeni maç')));
  const liste = h('ul', { class: 'yonetim-liste', id: 'mac-listesi' });
  // 018: maç kadrosu (oyuncu sayfasındaki Maç / İlk 11 / Dakika / Sarı / Kırmızı bundan hesaplanır). Maç düzenlenirken görünür.
  kadroAdlariListesi();
  const kadroListe = h('ul', { class: 'yonetim-liste', id: 'kadro-listesi' });
  const kadroForm = h('form', { class: 'kutu', id: 'kadro-formu', novalidate: true },
    h('h3', { id: 'kadro-form-baslik' }, 'Oyuncu ekle'),
    alan('k-oyuncu', 'Oyuncu (kadrodaki adıyla)', h('input', { type: 'text', id: 'k-oyuncu', maxlength: '80', list: 'kadro-adlari', required: true })),
    h('div', { class: 'alan' }, h('label', { class: 'onay' }, h('input', { type: 'checkbox', id: 'k-ilk11' }), 'İlk 11')),
    h('div', { class: 'iki-sutun' },
      alan('k-giris', 'Oyuna giriş dakikası (yedekse)', h('input', { type: 'number', id: 'k-giris', min: '0', max: '130', inputmode: 'numeric' })),
      alan('k-cikis', 'Oyundan çıkış dakikası (kırmızıda kart dakikası)', h('input', { type: 'number', id: 'k-cikis', min: '0', max: '130', inputmode: 'numeric' }))),
    h('div', { class: 'iki-sutun' },
      alan('k-sari', 'Sarı kart', h('select', { id: 'k-sari' }, h('option', { value: '0' }, 'Yok'), h('option', { value: '1' }, '1'), h('option', { value: '2' }, '2'))),
      h('div', { class: 'alan' }, h('label', { class: 'onay' }, h('input', { type: 'checkbox', id: 'k-kirmizi' }), 'Kırmızı kart'))),
    h('div', { class: 'dugme-satir' },
      h('button', { type: 'submit', class: 'dugme', id: 'k-kaydet' }, 'Kadroya kaydet'),
      h('button', { type: 'button', class: 'dugme ikincil', id: 'k-yeni' }, 'Yeni oyuncu')));
  const kadroBolumu = h('section', { class: 'kutu', id: 'kadro-bolumu', 'aria-labelledby': 'kadro-baslik', hidden: true },
    h('h2', { id: 'kadro-baslik' }, 'Maç kadrosu'),
    h('p', { class: 'yonetim-not' }, 'Yalnız Çorum FK oyuncuları. Maça çıkmayan yedeği eklemeyin. Dakika: ilk 11 → çıkış (yoksa 90); yedek → çıkış (yoksa 90) − giriş; uzatmalar 90 sayılır. Oyuncu sayfasında adla eşlenir: kadrodaki adı aynen yazın.'),
    kadroListe, kadroForm);
  kok.replaceChildren(form, kadroBolumu, h('div', { class: 'bolum-baslik' }, h('h2', null, 'Bütün maçlar')), liste);

  let kadroDuzenlenen = null; // düzenlenen satırın oyuncu adı (birincil anahtar mac_id + oyuncu)
  function kadroTemizle() { kadroDuzenlenen = null; kadroForm.reset(); $('#kadro-form-baslik').textContent = 'Oyuncu ekle'; }
  $('#k-yeni').addEventListener('click', kadroTemizle);
  function kadroDoldur(s) {
    kadroDuzenlenen = s.oyuncu;
    $('#kadro-form-baslik').textContent = 'Oyuncuyu düzenle';
    $('#k-oyuncu').value = s.oyuncu;
    $('#k-ilk11').checked = !!s.ilk11;
    $('#k-giris').value = s.giris_dk ?? '';
    $('#k-cikis').value = s.cikis_dk ?? '';
    $('#k-sari').value = String(s.sari || 0);
    $('#k-kirmizi').checked = !!s.kirmizi;
    $('#k-oyuncu').focus();
  }
  async function kadroYukle() {
    if (!duzenlenen) return;
    const { data, error } = await supabase.from('mac_oyunculari').select('mac_id, oyuncu, ilk11, giris_dk, cikis_dk, sari, kirmizi').eq('mac_id', duzenlenen).limit(60);
    if (error) { kadroListe.replaceChildren(h('li', null, hataMetni(error, 'Kadro yüklenemedi.'))); return; }
    const l = [...data].sort((a, b) => Number(b.ilk11) - Number(a.ilk11) || (a.giris_dk ?? 0) - (b.giris_dk ?? 0) || a.oyuncu.localeCompare(b.oyuncu, 'tr'));
    kadroListe.replaceChildren(...(l.length ? l.map((s) => h('li', { 'data-oyuncu': s.oyuncu },
      h('span', { class: 'satir-baslik' }, s.oyuncu),
      h('span', { class: 'kucuk-yazi soluk' }, [s.ilk11 ? 'İlk 11' : `${s.giris_dk}' girdi`, s.cikis_dk != null ? `${s.cikis_dk}' çıktı` : null, `${oynamaDakikasi(s)} dk`, s.sari ? `${s.sari} sarı` : null, s.kirmizi ? 'kırmızı' : null].filter(Boolean).join(' · ')),
      h('span', { class: 'dugme-satir' },
        h('button', { type: 'button', class: 'dugme ikincil kucuk', onclick: () => kadroDoldur(s) }, 'Düzenle'),
        h('button', { type: 'button', class: 'dugme tehlike kucuk', onclick: () => kadroSil(s) }, 'Sil'))))
      : [h('li', { class: 'bos' }, 'Bu maçın kadrosu girilmedi.')]));
  }
  async function kadroSil(s) {
    if (!onayla(`${s.oyuncu} bu maçın kadrosundan çıkarılsın mı?`)) return;
    const { error } = await supabase.from('mac_oyunculari').delete().eq('mac_id', duzenlenen).eq('oyuncu', s.oyuncu);
    if (error) return bildir(hataMetni(error), 'hata');
    bildir('Oyuncu kadrodan çıkarıldı.');
    if (kadroDuzenlenen === s.oyuncu) kadroTemizle();
    await kadroYukle();
  }
  kadroForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!duzenlenen) return;
    const kayit = {
      oyuncu: $('#k-oyuncu').value.trim().replace(/\s+/g, ' '),
      ilk11: $('#k-ilk11').checked,
      giris_dk: tamSayiOku('#k-giris'),
      cikis_dk: tamSayiOku('#k-cikis'),
      sari: Number($('#k-sari').value),
      kirmizi: $('#k-kirmizi').checked,
    };
    const dk = (x) => x == null || (Number.isInteger(x) && x >= 0 && x <= 130);
    if (kayit.oyuncu.length < 2 || kayit.oyuncu.length > 80) return bildir('Oyuncunun adını yazın (2-80 karakter).', 'hata');
    if (!dk(kayit.giris_dk) || !dk(kayit.cikis_dk)) return bildir('Dakikalar 0-130 arasında tam sayı olmalı.', 'hata');
    if (kayit.ilk11 && kayit.giris_dk != null) return bildir("İlk 11'deki oyuncunun giriş dakikası olmaz.", 'hata');
    if (!kayit.ilk11 && kayit.giris_dk == null) return bildir('Yedekten giren oyuncunun giriş dakikasını yazın (maça çıkmayan yedeği eklemeyin).', 'hata');
    if (kayit.giris_dk != null && kayit.cikis_dk != null && kayit.cikis_dk < kayit.giris_dk) return bildir('Çıkış dakikası giriş dakikasından önce olamaz.', 'hata');
    if (kayit.kirmizi && kayit.cikis_dk == null) return bildir('Kırmızı kartta çıkış dakikası olarak kartın dakikasını yazın.', 'hata');
    const dugme = $('#k-kaydet');
    dugme.disabled = true;
    const sorgu = kadroDuzenlenen ? supabase.from('mac_oyunculari').update(kayit).eq('mac_id', duzenlenen).eq('oyuncu', kadroDuzenlenen)
      : supabase.from('mac_oyunculari').insert({ ...kayit, mac_id: duzenlenen });
    const { error } = await sorgu;
    dugme.disabled = false;
    if (error) return bildir(/duplicate|mac_oyunculari_pkey/.test(error.message || '') ? 'Bu oyuncu bu maçın kadrosunda zaten var: listeden "Düzenle"yi kullanın.' : hataMetni(error, 'Kadro kaydedilemedi.'), 'hata');
    bildir(kadroDuzenlenen ? 'Kadro satırı güncellendi.' : 'Oyuncu kadroya eklendi.');
    kadroTemizle();
    await kadroYukle();
  });

  function temizle() { duzenlenen = null; form.reset(); $('#mac-form-baslik').textContent = 'Yeni maç'; kadroBolumu.hidden = true; kadroTemizle(); }
  $('#m-yeni').addEventListener('click', temizle);

  function doldur(mac) {
    duzenlenen = mac.id;
    $('#mac-form-baslik').textContent = 'Maçı düzenle';
    $('#m-rakip').value = mac.rakip;
    $('#m-tarih').value = yerelGirdi(mac.tarih);
    $('#m-ic-saha').value = String(mac.ic_saha);
    $('#m-stadyum').value = mac.stadyum || '';
    $('#m-organizasyon').value = mac.organizasyon || '';
    $('#m-durum').value = mac.durum;
    $('#m-corum-skor').value = mac.corum_skor ?? '';
    $('#m-rakip-skor').value = mac.rakip_skor ?? '';
    $('#m-not').value = mac.mac_notu || '';
    $('#m-on-onay').checked = !!mac.on_onay;
    $('#m-hafta').value = mac.hafta ?? '';
    $('#m-ozet').value = mac.ozet_video_url || '';
    $('#m-ozet-kaynak').value = mac.ozet_video_kaynak || '';
    kadroBolumu.hidden = false;
    $('#kadro-baslik').textContent = `Maç kadrosu: ${mac.rakip}`;
    kadroTemizle();
    kadroYukle();
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const skorOku = (id) => {
    const v = $(id).value.trim();
    if (v === '') return null;
    const n = Number(v);
    return Number.isInteger(n) && n >= 0 && n <= 99 ? n : NaN;
  };

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const kayit = {
      rakip: $('#m-rakip').value.trim(),
      tarih: girdidenIso($('#m-tarih').value),
      ic_saha: $('#m-ic-saha').value === 'true',
      stadyum: $('#m-stadyum').value.trim() || null,
      organizasyon: $('#m-organizasyon').value.trim() || null,
      durum: $('#m-durum').value,
      corum_skor: skorOku('#m-corum-skor'),
      rakip_skor: skorOku('#m-rakip-skor'),
      mac_notu: $('#m-not').value.trim() || null,
      on_onay: $('#m-on-onay').checked,
      hafta: $('#m-hafta').value.trim() === '' ? null : Number($('#m-hafta').value),
      ozet_video_url: $('#m-ozet').value.trim() || null,
      ozet_video_kaynak: $('#m-ozet-kaynak').value.trim() || null,
    };
    if (kayit.hafta != null && !(Number.isInteger(kayit.hafta) && kayit.hafta >= 1 && kayit.hafta <= 60)) return bildir('Hafta 1-60 arasında tam sayı olmalı.', 'hata');
    if (kayit.ozet_video_url && !(youtubeKimlik(kayit.ozet_video_url) && golVideoGecerli(kayit.ozet_video_url))) return bildir('Maç özeti bir YouTube bağlantısı olmalı.', 'hata');
    if (kayit.ozet_video_url && (!kayit.ozet_video_kaynak || kayit.ozet_video_kaynak.length < 3)) return bildir('Özet videonun kaynağını yazın (ör. "beIN SPORTS Türkiye YouTube kanalı").', 'hata');
    if (kayit.mac_notu && (kayit.mac_notu.length < 2 || kayit.mac_notu.length > 280)) return bildir('Maç notu 2-280 karakter olmalı.', 'hata');
    if (kayit.rakip.length < 2) return bildir('Rakip adı en az 2 karakter olmalı.', 'hata');
    if (!kayit.tarih) return bildir('Tarih ve saat seçin.', 'hata');
    if (Number.isNaN(kayit.corum_skor) || Number.isNaN(kayit.rakip_skor)) return bildir('Skor 0-99 arasında tam sayı olmalı.', 'hata');
    if (kayit.durum === 'bitti' && (kayit.corum_skor == null || kayit.rakip_skor == null)) return bildir('Biten maç için iki skoru da girin.', 'hata');
    const dugme = $('#m-kaydet');
    dugme.disabled = true;
    const sorgu = duzenlenen ? supabase.from('maclar').update(kayit).eq('id', duzenlenen) : supabase.from('maclar').insert(kayit);
    const { error } = await sorgu.select('id').single();
    dugme.disabled = false;
    if (error) return bildir(hataMetni(error, 'Maç kaydedilemedi.'), 'hata');
    bildir(duzenlenen ? 'Maç güncellendi.' : 'Maç eklendi.');
    temizle();
    await yukle();
    golMaclariYenile();
  });

  async function sil(mac) {
    if (!onayla(`${mac.rakip} maçı, golleri ve yorumlarıyla birlikte silinsin mi?`)) return;
    const { error } = await supabase.from('maclar').delete().eq('id', mac.id);
    if (error) return bildir(hataMetni(error), 'hata');
    bildir('Maç silindi.');
    await yukle();
    golMaclariYenile();
  }

  async function yukle() {
    const { data, error } = await supabase.from('maclar').select('*').order('tarih', { ascending: false }).limit(300);
    if (error) { liste.replaceChildren(h('li', null, hataMetni(error))); return; }
    liste.replaceChildren(...(data.length ? data.map((mac) => {
      const [ev, dep] = evSahibiDeplasman(mac);
      return h('li', { 'data-mac-id': mac.id },
        h('span', { class: 'satir-baslik' }, `${ev} ${skorMetni(mac) || '-'} ${dep}`),
        h('span', { class: 'dugme-satir kucuk-yazi soluk' }, durumRozeti(mac.durum), tarihYaz(mac.tarih, { gun: true, kisa: true }), mac.on_onay ? h('span', { class: 'rozet' }, 'Yorumda ön onay') : null),
        h('span', { class: 'dugme-satir' },
          h('button', { type: 'button', class: 'dugme ikincil kucuk', onclick: () => doldur(mac) }, 'Düzenle'),
          h('a', { class: 'dugme ikincil kucuk', href: 'mac.html?id=' + encodeURIComponent(mac.id) }, 'Görüntüle'),
          h('button', { type: 'button', class: 'dugme tehlike kucuk', onclick: () => sil(mac) }, 'Sil')));
    }) : [h('li', { class: 'bos' }, 'Henüz maç yok.')]));
  }

  return yukle();
}

// ===================================================================== Goller
let golMaclariYenile = () => {};

function gollerSekmesi(kok) {
  let duzenlenen = null;
  const macSecim = h('select', { id: 'g-mac', required: true });
  const form = h('form', { class: 'kutu', id: 'gol-formu', novalidate: true },
    h('h2', { id: 'gol-form-baslik' }, 'Gol ekle'),
    alan('g-mac', 'Maç', macSecim),
    alan('g-oyuncu', 'Golü atan', h('input', { type: 'text', id: 'g-oyuncu', maxlength: '80', list: 'kadro-adlari', required: true })),
    // 018: asist (kadrodan seçilir ya da serbest yazılır; oyuncu sayfası adla eşler)
    alan('g-asist', 'Asist (isteğe bağlı)', h('input', { type: 'text', id: 'g-asist', maxlength: '80', list: 'kadro-adlari' }), 'Kadrodaki adıyla yazın; asist yoksa boş bırakın. Frikik, penaltı gibi notlar "Golün anlatımı"na.'),
    h('div', { class: 'iki-sutun' },
      alan('g-dakika', 'Dakika', h('input', { type: 'number', id: 'g-dakika', min: '1', max: '130', inputmode: 'numeric', required: true })),
      alan('g-ek', 'Uzatma dakikası (isteğe bağlı)', h('input', { type: 'number', id: 'g-ek', min: '1', max: '20', inputmode: 'numeric' }), 'Örnek: 90+3 için dakika 90, uzatma 3.')),
    h('div', { class: 'alan' }, h('label', { class: 'onay' }, h('input', { type: 'checkbox', id: 'g-penalti' }), 'Penaltı golü')),
    h('p', { class: 'yonetim-not', id: 'g-hak-notu' }, 'Yalnızca hak sahibinin resmî YouTube videolarını kullanın (yayıncının ya da kulübün resmî kanalı). Maç yayınından kesit, izinsiz yükleme ya da başka sitedeki video dosyası eklemeyin.'),
    alan('g-video', 'Video bağlantısı (isteğe bağlı)', h('input', { type: 'url', id: 'g-video', inputmode: 'url', placeholder: 'https://www.youtube.com/watch?v=…' }),
      'Resmî YouTube bağlantısı: gizlilik modunda, yalnız ziyaretçi dokununca yüklenir. Kendi çektiğiniz .mp4 videoyu aşağıdan yükleyin (başka sitedeki .mp4 kabul edilmez).'),
    // 014 (başkan 6): video kaynağı zorunlu, .mp4 yalnız sitenin deposundan; (erişilebilirlik 4) Türkçe altyazı .vtt
    alan('g-video-kaynak', 'Videonun kaynağı (video varsa zorunlu)', h('input', { type: 'text', id: 'g-video-kaynak', maxlength: '120', placeholder: 'ör. Çorum FK resmî YouTube kanalı' }),
      'Videonun altında "Video: …" diye görünür. Hak sahibini yazın.'),
    h('div', { class: 'iki-sutun' },
      alan('g-mp4', '.mp4 video yükle (isteğe bağlı, en fazla 50 MB)', h('input', { type: 'file', id: 'g-mp4', accept: 'video/mp4' }), 'Yalnız hakkı sizde olan video. Yüklenince video bağlantısı bu dosya olur.'),
      alan('g-vtt', 'Türkçe altyazı (.vtt, yalnız .mp4 için)', h('input', { type: 'file', id: 'g-vtt', accept: '.vtt,text/vtt' }), 'Spiker anlatımlı videoda altyazı ekleyin (WebVTT). YouTube videosunda altyazı YouTube\'da açılır.')),
    h('p', { class: 'kucuk-yazi soluk', id: 'g-altyazi-durum' }),
    h('div', { class: 'iki-sutun' },
      alan('g-kapak', 'Video kapağı (isteğe bağlı)', h('input', { type: 'file', id: 'g-kapak', accept: Object.keys(GORSEL_TURLERI).join(',') }), 'Kendi deponuza yüklenir; YouTube küçük resmi kullanılmaz (ziyaretçinin bilgisi YouTube\'a gitmesin). ' + HAK_NOTU),
      alan('g-sure', 'Video süresi (saniye, isteğe bağlı)', h('input', { type: 'number', id: 'g-sure', min: '1', max: '3600', inputmode: 'numeric' }))),
    // 018: gol anı: uzun özet videosunun yalnız golü gösteren aralığı (YouTube start/end)
    h('div', { class: 'iki-sutun' },
      alan('g-bas', 'Video başlangıç (sn, yalnız YouTube)', h('input', { type: 'number', id: 'g-bas', min: '0', max: String(VIDEO_ARALIK_SINIRI), inputmode: 'numeric' }), 'Özet videoda golün başladığı saniye (ör. 5:54 → 354).'),
      alan('g-bit', 'Bitiş (sn)', h('input', { type: 'number', id: 'g-bit', min: '1', max: String(VIDEO_ARALIK_SINIRI), inputmode: 'numeric' }), 'Boş bırakırsanız video baştan oynar. Ayrı gol klibinde gerekmez.')),
    h('div', { id: 'g-kapak-onizleme' }),
    alan('g-aciklama', 'Golün anlatımı (isteğe bağlı ama önerilir)', h('input', { type: 'text', id: 'g-aciklama', maxlength: '300' }), 'Videoyu izleyemeyenler için: kim, nasıl, hangi dakikada.'),
    // 015 (erişilebilirlik 4): altyazısız ve anlatımsız .mp4 kaydedilmeden önce uyarı (ikinci "Kaydet" ile yine de kaydedilir)
    h('p', { class: 'mesaj hata', id: 'g-altyazi-uyari', hidden: true }),
    h('div', { class: 'dugme-satir' },
      h('button', { type: 'submit', class: 'dugme', id: 'g-kaydet' }, 'Kaydet'),
      h('button', { type: 'button', class: 'dugme ikincil', id: 'g-yeni' }, 'Yeni gol')));
  const liste = h('ul', { class: 'yonetim-liste', id: 'gol-listesi' });
  kok.replaceChildren(form, h('div', { class: 'bolum-baslik' }, h('h2', null, 'Son goller')), liste);
  kadroAdlariListesi();

  let kapak = null; // { url } düzenlenen golün mevcut kapağı
  let altyazi = null; // düzenlenen golün altyazı adresi
  let altyaziUyarildi = false; // 015: uyarı gösterildi; ikinci "Kaydet" kaydeder
  const altyaziUyari = $('#g-altyazi-uyari');
  const uyariKaldir = () => { altyaziUyarildi = false; altyaziUyari.hidden = true; altyaziUyari.textContent = ''; };
  for (const id of ['#g-mp4', '#g-vtt', '#g-video', '#g-aciklama']) $(id).addEventListener('input', uyariKaldir);
  for (const id of ['#g-mp4', '#g-vtt']) $(id).addEventListener('change', uyariKaldir);
  function temizle() { uyariKaldir(); duzenlenen = null; kapak = null; altyazi = null; const m = macSecim.value; form.reset(); macSecim.value = m; $('#gol-form-baslik').textContent = 'Gol ekle'; $('#g-kapak-onizleme').replaceChildren(); $('#g-altyazi-durum').textContent = ''; }
  /** Gol medyası (mp4 / vtt) sitenin deposuna (gol-videolari kovası, 014): döner { url } ya da { hata }. */
  async function medyaYukle(dosya, uzanti, tur, enCok) {
    if (dosya.size > enCok) return { hata: `Dosya çok büyük: en fazla ${Math.round(enCok / 1048576)} MB.` };
    const yol = `${new Date().getUTCFullYear()}/${crypto.randomUUID()}.${uzanti}`;
    const y = await supabase.storage.from(GOL_VIDEO_KOVASI).upload(yol, dosya, { contentType: tur, cacheControl: '31536000', upsert: false });
    if (y.error) return { hata: hataMetni(y.error, 'Dosya yüklenemedi.') };
    return { url: supabase.storage.from(GOL_VIDEO_KOVASI).getPublicUrl(yol).data.publicUrl };
  }
  $('#g-yeni').addEventListener('click', temizle);

  async function maclariDoldur() {
    const secili = macSecim.value;
    const { data } = await supabase.from('maclar').select('id, rakip, tarih, ic_saha, corum_skor, rakip_skor, durum').order('tarih', { ascending: false }).limit(300);
    macSecim.replaceChildren(h('option', { value: '' }, 'Maç seçin…'),
      ...(data || []).map((m) => h('option', { value: m.id }, `${tarihYaz(m.tarih, { saat: false, kisa: true })} · ${m.rakip}${skorMetni(m) ? ' (' + skorMetni(m) + ')' : ''}`)));
    if (secili) macSecim.value = secili;
  }
  golMaclariYenile = maclariDoldur;

  function doldur(gol) {
    duzenlenen = gol.id;
    $('#gol-form-baslik').textContent = 'Golü düzenle';
    macSecim.value = gol.mac_id;
    $('#g-oyuncu').value = gol.oyuncu;
    $('#g-asist').value = gol.asist || '';
    $('#g-bas').value = gol.video_baslangic_sn ?? '';
    $('#g-bit').value = gol.video_bitis_sn ?? '';
    $('#g-dakika').value = gol.dakika;
    $('#g-ek').value = gol.ek_dakika ?? '';
    $('#g-penalti').checked = gol.penalti;
    $('#g-video').value = gol.video_url || '';
    $('#g-video-kaynak').value = gol.video_kaynak || '';
    altyazi = gol.altyazi_url || null;
    $('#g-altyazi-durum').textContent = altyazi ? 'Bu videonun Türkçe altyazısı var. Yeni dosya seçerseniz değişir.' : '';
    $('#g-aciklama').value = gol.aciklama || '';
    $('#g-sure').value = gol.sure_sn ?? '';
    kapak = gol.kapak_url || null;
    const src = guvenliGorsel(kapak);
    $('#g-kapak-onizleme').replaceChildren(...(src ? [h('img', { class: 'kapak-onizleme', src, alt: 'Kapak önizleme' })] : []));
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const dakika = Number($('#g-dakika').value);
    const ekHam = $('#g-ek').value.trim();
    const ek = ekHam === '' ? null : Number(ekHam);
    let video = $('#g-video').value.trim() || null;
    const kayit = {
      mac_id: macSecim.value,
      oyuncu: $('#g-oyuncu').value.trim(),
      dakika,
      ek_dakika: ek,
      penalti: $('#g-penalti').checked,
      video_url: video,
      video_kaynak: $('#g-video-kaynak').value.trim() || null,
      aciklama: $('#g-aciklama').value.trim() || null,
      sure_sn: $('#g-sure').value.trim() === '' ? null : Number($('#g-sure').value),
      asist: $('#g-asist').value.trim().replace(/\s+/g, ' ') || null,
      video_baslangic_sn: tamSayiOku('#g-bas'),
      video_bitis_sn: tamSayiOku('#g-bit'),
    };
    if (!kayit.mac_id) return bildir('Maç seçin.', 'hata');
    if (kayit.oyuncu.length < 2) return bildir('Golü atan oyuncunun adını yazın.', 'hata');
    if (!Number.isInteger(dakika) || dakika < 1 || dakika > 130) return bildir('Dakika 1-130 arasında olmalı.', 'hata');
    if (ek != null && (!Number.isInteger(ek) || ek < 1 || ek > 20)) return bildir('Uzatma dakikası 1-20 arasında olmalı.', 'hata');
    const mp4Dosya = $('#g-mp4').files[0];
    const vttDosya = $('#g-vtt').files[0];
    if (video && !mp4Dosya && (!(youtubeKimlik(video) || mp4Mu(video)) || !golVideoGecerli(video))) return bildir('Video bağlantısı bir YouTube adresi olmalı; .mp4 videoyu "mp4 video yükle" ile sitenin deposuna yükleyin.', 'hata');
    if ((video || mp4Dosya) && !kayit.video_kaynak) { $('#g-video-kaynak').setAttribute('aria-invalid', 'true'); $('#g-video-kaynak').focus(); return bildir('Videonun kaynağını yazın (ör. "Çorum FK resmî YouTube kanalı").', 'hata'); }
    $('#g-video-kaynak').removeAttribute('aria-invalid');
    if (mp4Dosya && mp4Dosya.type && mp4Dosya.type !== 'video/mp4') return bildir('Yalnız .mp4 video yüklenebilir.', 'hata');
    if (vttDosya && !/\.vtt$/i.test(vttDosya.name)) return bildir('Altyazı WebVTT (.vtt) dosyası olmalı.', 'hata');
    if (vttDosya && !mp4Dosya && !(video && /\.mp4$/i.test(video))) return bildir('Altyazı yalnız siteye yüklenen .mp4 videoya eklenir.', 'hata');
    if (kayit.sure_sn != null && (!Number.isInteger(kayit.sure_sn) || kayit.sure_sn < 1 || kayit.sure_sn > 3600)) return bildir('Video süresi 1-3600 saniye arasında tam sayı olmalı.', 'hata');
    // 018: asist ve gol anı aralığı (yüklenecek .mp4'te aralık olmaz: video yalnız YouTube sayılır)
    const aniHata = golAniHatalari({ ...kayit, video_url: mp4Dosya ? null : video });
    if (aniHata.length) { $(kayit.asist && /Asist/.test(aniHata[0]) ? '#g-asist' : '#g-bas').focus(); return bildir(aniHata[0], 'hata'); }
    // 015 (erişilebilirlik 4, WCAG 1.2.2): .mp4 + altyazı yok + anlatım boş → önce uyar; yönetici yine de kaydedebilir
    const mp4Var = !!mp4Dosya || (!!video && /\.mp4$/i.test(video));
    if (mp4Var && !vttDosya && !(altyazi && !mp4Dosya) && !kayit.aciklama && !altyaziUyarildi) {
      altyaziUyarildi = true;
      altyaziUyari.textContent = 'Bu .mp4 videonun altyazısı (.vtt) yok ve "Golün anlatımı" boş: işitme engelli taraftar golü anlayamaz. Spiker anlatımlı videoda altyazı yükle ya da golün anlatımını yaz. Yine de kaydetmek için "Kaydet"e yeniden bas.';
      altyaziUyari.hidden = false;
      $('#g-aciklama').focus();
      return bildir('Altyazı ya da golün anlatımı eksik (yine de kaydetmek için "Kaydet"e yeniden bas).', 'hata');
    }
    uyariKaldir();
    const dugme = $('#g-kaydet');
    dugme.disabled = true;
    const dosya = $('#g-kapak').files[0];
    if (dosya) {
      const y = await kopyalariYukle(dosya, 'gol/');
      if (y.hata) { dugme.disabled = false; return bildir(y.hata, 'hata'); }
      kayit.kapak_url = y.url;
    }
    if (mp4Dosya) {
      const y = await medyaYukle(mp4Dosya, 'mp4', 'video/mp4', 50 * 1048576);
      if (y.hata) { dugme.disabled = false; return bildir(y.hata, 'hata'); }
      kayit.video_url = video = y.url;
    }
    if (vttDosya) {
      const y = await medyaYukle(vttDosya, 'vtt', 'text/vtt', 1048576);
      if (y.hata) { dugme.disabled = false; return bildir(y.hata, 'hata'); }
      kayit.altyazi_url = y.url;
    } else if (!video || !/\.mp4$/i.test(video)) {
      kayit.altyazi_url = null; // YouTube'a geçildiyse eski altyazı bağı kalkar
    }
    if (kayit.altyazi_url && !altyaziAdresiGecerli(kayit.altyazi_url)) { dugme.disabled = false; return bildir('Altyazı yalnız sitenin deposundan olabilir.', 'hata'); }
    const sorgu = duzenlenen ? supabase.from('goller').update(kayit).eq('id', duzenlenen) : supabase.from('goller').insert(kayit);
    const { error } = await sorgu.select('id').single();
    dugme.disabled = false;
    if (error) return bildir(hataMetni(error, 'Gol kaydedilemedi.'), 'hata');
    bildir(duzenlenen ? 'Gol güncellendi.' : 'Gol eklendi.');
    temizle();
    await yukle();
  });

  async function sil(gol) {
    if (!onayla(`${gol.oyuncu} (${dakikaMetni(gol)}) golü silinsin mi?`)) return;
    const { error } = await supabase.from('goller').delete().eq('id', gol.id);
    if (error) return bildir(hataMetni(error), 'hata');
    bildir('Gol silindi.');
    await yukle();
  }

  async function yukle() {
    const { data, error } = await supabase.from('goller')
      .select('id, mac_id, oyuncu, dakika, ek_dakika, penalti, video_url, video_kaynak, altyazi_url, aciklama, kapak_url, sure_sn, asist, video_baslangic_sn, video_bitis_sn, created_at, maclar(rakip, tarih)')
      .order('created_at', { ascending: false }).limit(100);
    if (error) { liste.replaceChildren(h('li', null, hataMetni(error))); return; }
    liste.replaceChildren(...(data.length ? data.map((gol) => h('li', { 'data-gol-id': gol.id },
      h('span', { class: 'satir-baslik' }, `${dakikaMetni(gol)} ${gol.oyuncu}`, gol.penalti ? ' (P)' : '', gol.asist ? ` · Asist: ${gol.asist}` : ''),
      h('span', { class: 'kucuk-yazi soluk' }, gol.maclar ? `${gol.maclar.rakip} · ${tarihYaz(gol.maclar.tarih, { saat: false, kisa: true })}` : '', gol.video_url ? ' · videolu' : '', gol.video_kaynak ? ` (${gol.video_kaynak})` : '', gol.altyazi_url ? ' · altyazılı' : '', gol.kapak_url ? ' · kapaklı' : '', gol.video_baslangic_sn != null ? ` · gol anı ${gol.video_baslangic_sn}-${gol.video_bitis_sn} sn` : ''),
      h('span', { class: 'dugme-satir' },
        h('button', { type: 'button', class: 'dugme ikincil kucuk', onclick: () => doldur(gol) }, 'Düzenle'),
        h('button', { type: 'button', class: 'dugme tehlike kucuk', onclick: () => sil(gol) }, 'Sil'))))
      : [h('li', { class: 'bos' }, 'Henüz gol yok.')]));
  }

  return Promise.all([maclariDoldur(), yukle()]);
}

// ===================================================================== Yorumlar (moderasyon)
// Şikâyet sayıları (yorum_sikayetleri; yalnız yönetici okur) ve yorum yasağı (profiles.engelli; 013 politikası yazmayı keser).
const NEDEN_ADI = { hakaret: 'hakaret', nefret: 'ayrımcı söz', hedef_gosterme: 'hedef gösterme', spam: 'spam', kisisel_veri: 'kişisel veri', diger: 'diğer' };
function yorumlarSekmesi(kok) {
  // 014 (başkan 4): onay kuyruğu (kelime listesi / maçın ön onay penceresi), farklı 3 hesaptan şikâyetle kendiliğinden gizlenenler,
  // kısa kelime listesi. Kurallar sunucuda (yorum_moderasyon, sikayet_otomatik_gizle); burası yöneticinin işi kolaylaşsın diye.
  const filtre = h('select', { id: 'y-filtre', 'aria-label': 'Yorum filtresi' },
    h('option', { value: 'kuyruk' }, 'Onay kuyruğu (bekleyen + şikâyetle gizlenen)'),
    h('option', { value: 'hepsi' }, 'Bütün yorumlar'),
    h('option', { value: 'sikayet' }, 'Şikâyet edilenler'),
    h('option', { value: 'gorunur' }, 'Görünür olanlar'),
    h('option', { value: 'gizli' }, 'Gizlenenler'));
  filtre.value = 'hepsi';
  // 015 (denetçi 2): kuyruk (onay bekleyen + şikâyetle kendiliğinden gizlenen) sayfanın en üstünde, düğmeyle açılır
  const kuyrukMetni = h('span', { id: 'y-kuyruk-metni' });
  const kuyrukDugme = h('button', { type: 'button', class: 'dugme kucuk', id: 'y-kuyruk-ac', onclick: () => { filtre.value = 'kuyruk'; yukle().then(() => liste.querySelector('button')?.focus()); } }, 'Kuyruğu göster');
  const kuyrukSayisi = h('div', { class: 'mesaj hata', id: 'y-kuyruk-sayisi', hidden: true }, kuyrukMetni, ' ', kuyrukDugme);
  const liste = h('ul', { class: 'yonetim-liste', id: 'yorum-moderasyon' });
  const kelimeGirdi = h('input', { type: 'text', id: 'y-kelime', maxlength: '40', autocomplete: 'off', placeholder: 'ör. küfür kökü' });
  const kelimeListesi = h('ul', { class: 'etiket-listesi', id: 'y-kelimeler', 'aria-label': 'Kelime listesi' });
  const kelimeFormu = h('form', { class: 'kutu', id: 'kelime-formu', novalidate: true },
    h('h2', null, 'Kelime listesi'),
    h('p', { class: 'soluk kucuk-yazi' }, 'Taraftarın yorumunda bu kelimelerden biriyle BAŞLAYAN bir sözcük varsa yorum hemen yayımlanmaz, aşağıdaki onay kuyruğuna düşer. Büyük/küçük harf, Türkçe harf ve rakamla yazma (s4lak) fark etmez. En az 3 harf; kısa ve sık kullanılan sözcükleri eklemeyin. Liste yalnız yöneticilere görünür.'),
    h('div', { class: 'dugme-satir' }, alan('y-kelime', 'Kelime ekle', kelimeGirdi), h('button', { type: 'submit', class: 'dugme ikincil', id: 'y-kelime-ekle' }, 'Ekle')),
    kelimeListesi);
  kok.replaceChildren(kuyrukSayisi, h('div', { class: 'kutu' },
    h('h2', null, 'Yorum moderasyonu'),
    h('p', { class: 'soluk kucuk-yazi' }, 'Gizlenen ya da onay bekleyen yorumu sadece yazan kişi ve yöneticiler görür. Silinen yorum geri gelmez. Farklı 3 hesaptan şikâyet alan yorum kendiliğinden gizlenir; "Göster" ile geri açarsanız yalnız sonraki şikâyetler sayılır. Maçlar sekmesinde maç başına "ön onay" açılabilir. Şikâyet edilen yorumlara en kısa sürede bakın. "Yorumdan men et" kişinin yeni yorum yazmasını, yorumlarını düzenlemesini ve şikâyet göndermesini kapatır.'),
    alan('y-filtre', 'Göster', filtre)), liste, kelimeFormu);
  filtre.addEventListener('change', yukle);

  async function kelimeleriYukle() {
    const { data, error } = await supabase.from('yorum_kelimeleri').select('kelime').order('kelime');
    if (error) { kelimeListesi.replaceChildren(h('li', null, hataMetni(error))); return; }
    kelimeListesi.replaceChildren(...(data.length ? data.map((k) => h('li', { 'data-kelime': k.kelime }, k.kelime, ' ',
      h('button', { type: 'button', class: 'dugme-metin', 'aria-label': `"${k.kelime}" kelimesini sil`, onclick: async () => {
        const { error: e } = await supabase.from('yorum_kelimeleri').delete().eq('kelime', k.kelime);
        if (e) return bildir(hataMetni(e), 'hata');
        bildir(`"${k.kelime}" listeden çıkarıldı.`);
        kelimeleriYukle();
      } }, 'Sil'))) : [h('li', { class: 'bos' }, 'Liste boş.')]));
  }
  kelimeFormu.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const k = kelimeBicimi(kelimeGirdi.value);
    if (!k) { kelimeGirdi.setAttribute('aria-invalid', 'true'); kelimeGirdi.focus(); return bildir('Kelime 3-40 harf olmalı (rakam ve boşluk olmadan).', 'hata'); }
    kelimeGirdi.removeAttribute('aria-invalid');
    const { error } = await supabase.from('yorum_kelimeleri').insert({ kelime: k });
    if (error && error.code !== '23505') return bildir(hataMetni(error), 'hata');
    kelimeGirdi.value = '';
    bildir(`"${k}" listeye eklendi.`);
    kelimeleriYukle();
  });

  async function yorumuOnayla(y) {
    const { error } = await supabase.from('yorumlar').update({ onay_bekliyor: false, gizli: false }).eq('id', y.id);
    if (error) return bildir(hataMetni(error), 'hata');
    bildir('Yorum onaylandı, herkes görebilir.');
    await yukle();
  }
  async function kuyruktanGizle(y) {
    const { error } = await supabase.from('yorumlar').update({ onay_bekliyor: false, gizli: true }).eq('id', y.id);
    if (error) return bildir(hataMetni(error), 'hata');
    bildir('Yorum gizlendi.');
    await yukle();
  }

  async function gizle(y) {
    const { error } = await supabase.from('yorumlar').update({ gizli: !y.gizli }).eq('id', y.id);
    if (error) return bildir(hataMetni(error), 'hata');
    bildir(y.gizli ? 'Yorum yeniden görünür.' : 'Yorum gizlendi.');
    await yukle();
  }

  async function sil(y) {
    if (!onayla('Bu yorum kalıcı olarak silinsin mi?')) return;
    const { error } = await supabase.from('yorumlar').delete().eq('id', y.id);
    if (error) return bildir(hataMetni(error), 'hata');
    bildir('Yorum silindi.');
    await yukle();
  }

  async function engelle(y, ad, engelli) {
    if (!onayla(engelli ? `${ad} kullanıcısının yorum yasağı kaldırılsın mı?` : `${ad} kullanıcısı yorum yazmaktan men edilsin mi? Mevcut yorumları kalır; gerekirse ayrıca gizleyin.`)) return;
    const { error } = await supabase.from('profiles').update({ engelli: !engelli }).eq('id', y.kullanici_id);
    if (error) return bildir(hataMetni(error), 'hata');
    bildir(engelli ? `${ad} yeniden yorum yazabilir.` : `${ad} yorum yazmaktan men edildi.`);
    await yukle();
  }

  // 017: uygunsuz profil fotoğrafı: yönetici başkasınınkini yalnız kaldırır (profiles.foto_url = null), sonra depodan silmeyi dener
  async function fotoKaldir(y, ad) {
    if (!onayla(`${ad} kullanıcısının profil fotoğrafı kaldırılsın mı? Kişi kurallara uygun yeni bir fotoğraf yükleyebilir.`)) return;
    const url = y.profiles && y.profiles.foto_url;
    const { error } = await supabase.from('profiles').update({ foto_url: null }).eq('id', y.kullanici_id);
    if (error) return bildir(hataMetni(error), 'hata');
    const m = /\/profil-fotograflari\/([^?#]+)$/.exec(url || '');
    if (m) { try { await supabase.storage.from(PROFIL_FOTO_KOVASI).remove([decodeURIComponent(m[1])]); } catch (e) { /* sessiz: dosya depoda kalır */ } }
    bildir(`${ad} kullanıcısının profil fotoğrafı kaldırıldı.`);
    await yukle();
  }

  async function yukle() {
    let q = supabase.from('yorumlar')
      .select('id, metin, gizli, onay_bekliyor, gizleme_nedeni, created_at, haber_id, mac_id, gol_id, kullanici_id, ust_yorum_id, profiles(kullanici_adi, foto_url), haberler(baslik), maclar(rakip), goller(oyuncu)')
      .order('created_at', { ascending: false }).limit(150);
    if (filtre.value === 'gizli') q = q.eq('gizli', true);
    if (filtre.value === 'gorunur') q = q.eq('gizli', false).eq('onay_bekliyor', false);
    const kq = supabase.from('yorumlar').select('id, onay_bekliyor, gizleme_nedeni').eq('onay_bekliyor', true).limit(500);
    const sq = supabase.from('yorumlar').select('id').eq('gizli', true).eq('gizleme_nedeni', 'sikayet').limit(500);
    const [yr, sk, en, kb, sg] = await Promise.all([q, supabase.from('yorum_sikayetleri').select('yorum_id, neden').limit(1000), supabase.rpc('engelli_kullanicilar'), kq, sq]);
    if (yr.error) { liste.replaceChildren(h('li', null, hataMetni(yr.error))); return; }
    const bekleyen = (kb.data || []).length;
    const sikayetGizli = (sg.data || []).length;
    kuyrukSayisi.hidden = !(bekleyen || sikayetGizli);
    kuyrukMetni.textContent = [bekleyen ? `${bekleyen} yorum onay bekliyor.` : '', sikayetGizli ? `${sikayetGizli} yorum 3 şikâyetle kendiliğinden gizlendi: bakıp "Göster" ya da "Sil" deyin.` : ''].filter(Boolean).join(' ');
    kuyrukDugme.hidden = filtre.value === 'kuyruk';
    kuyrukSekmeSayisi(bekleyen + sikayetGizli);
    const sikayet = new Map();
    for (const x of sk.data || []) { const l = sikayet.get(x.yorum_id) || []; l.push(x.neden); sikayet.set(x.yorum_id, l); }
    const engelliler = new Set(Array.isArray(en.data) ? en.data.map((x) => (typeof x === 'string' ? x : x.engelli_kullanicilar || x.id)) : []);
    let data = yr.data;
    if (filtre.value === 'sikayet') data = data.filter((y) => sikayet.has(y.id)).sort((a, b) => sikayet.get(b.id).length - sikayet.get(a.id).length);
    if (filtre.value === 'kuyruk') data = data.filter((y) => y.onay_bekliyor || (y.gizli && y.gizleme_nedeni === 'sikayet'));
    liste.replaceChildren(...(data.length ? data.map((y) => {
      const ad = (y.profiles && y.profiles.kullanici_adi) || 'taraftar';
      const hedef = y.haber_id
        ? h('a', { href: 'haber.html?id=' + encodeURIComponent(y.haber_id) }, 'Haber: ' + ((y.haberler && y.haberler.baslik) || '—'))
        : y.gol_id ? h('a', { href: 'gol.html?id=' + encodeURIComponent(y.gol_id) }, 'Gol: ' + ((y.goller && y.goller.oyuncu) || '—'))
          : h('a', { href: 'mac.html?id=' + encodeURIComponent(y.mac_id) }, 'Maç: ' + ((y.maclar && y.maclar.rakip) || '—'));
      const s = sikayet.get(y.id) || [];
      const engelli = engelliler.has(y.kullanici_id);
      const foto = y.profiles && y.profiles.foto_url && profilFotoGecerli(y.profiles.foto_url, y.kullanici_id) ? y.profiles.foto_url : null;
      return h('li', { 'data-yorum-id': y.id },
        h('span', { class: 'dugme-satir kucuk-yazi' },
          foto ? avatarOgesi(ad, foto, y.kullanici_id, { boyut: 28, alt: `${ad} kullanıcısının profil fotoğrafı` }) : null,
          h('strong', null, ad),
          y.ust_yorum_id ? h('span', { class: 'soluk' }, '↳ yanıt') : null,
          h('span', { class: 'soluk' }, tarihYaz(y.created_at)),
          y.gizli ? h('span', { class: 'rozet gizli' }, y.gizleme_nedeni === 'sikayet' ? 'Gizli (3 şikâyet)' : 'Gizli') : null,
          y.onay_bekliyor ? h('span', { class: 'rozet canli' }, 'Onay bekliyor') : null,
          engelli ? h('span', { class: 'rozet gizli' }, 'Yasaklı') : null,
          s.length ? h('span', { class: 'sikayet-sayisi', 'data-sikayet': String(s.length) }, `⚑ ${s.length} şikâyet (${[...new Set(s)].map((n) => NEDEN_ADI[n] || n).join(', ')})`) : null),
        h('span', { class: 'kucuk-yazi' }, hedef),
        h('p', { class: 'yorum-metni' }, y.metin),
        h('span', { class: 'dugme-satir' },
          y.onay_bekliyor ? h('button', { type: 'button', class: 'dugme kucuk', onclick: () => yorumuOnayla(y) }, 'Onayla') : null,
          y.onay_bekliyor ? h('button', { type: 'button', class: 'dugme ikincil kucuk', onclick: () => kuyruktanGizle(y) }, 'Gizle') : h('button', { type: 'button', class: 'dugme ikincil kucuk', onclick: () => gizle(y) }, y.gizli ? 'Göster' : 'Gizle'),
          h('button', { type: 'button', class: 'dugme ikincil kucuk', onclick: () => engelle(y, ad, engelli) }, engelli ? 'Yasağı kaldır' : 'Yorumdan men et'),
          foto ? h('button', { type: 'button', class: 'dugme ikincil kucuk', onclick: () => fotoKaldir(y, ad) }, 'Profil fotoğrafını kaldır') : null,
          h('button', { type: 'button', class: 'dugme tehlike kucuk', onclick: () => sil(y) }, 'Sil')));
    }) : [h('li', { class: 'bos' }, filtre.value === 'kuyruk' ? 'Onay bekleyen yorum yok.' : 'Yorum yok.')]));
  }

  return Promise.all([yukle(), kelimeleriYukle()]);
}

// ===================================================================== Kadro
const MEVKI_ADI = { kaleci: 'Kaleci', defans: 'Defans', orta_saha: 'Orta saha', forvet: 'Forvet' };
function kadroSekmesi(kok) {
  let duzenlenen = null; // { id, foto_url }
  const form = h('form', { class: 'kutu', id: 'oyuncu-formu', novalidate: true },
    h('h2', { id: 'oyuncu-form-baslik' }, 'Oyuncu ekle'),
    h('p', { class: 'yonetim-not' }, 'Kadroyu kulübün açıkladığı listeden girin. Oyuncu fotoğrafı yalnız kulübün verdiği basın görseli ve yazılı izinle; yoksa boş bırakın (kartta forma numarası görünür).'),
    alan('o-ad', 'Ad soyad', h('input', { type: 'text', id: 'o-ad', maxlength: '80', required: true })),
    h('div', { class: 'iki-sutun' },
      alan('o-no', 'Forma numarası', h('input', { type: 'number', id: 'o-no', min: '1', max: '99', inputmode: 'numeric' })),
      alan('o-mevki', 'Mevki', h('select', { id: 'o-mevki' }, Object.entries(MEVKI_ADI).map(([v, t]) => h('option', { value: v }, t))))),
    h('div', { class: 'iki-sutun' },
      alan('o-sira', 'Sıra (mevki içinde)', h('input', { type: 'number', id: 'o-sira', min: '0', max: '999', value: '0', inputmode: 'numeric' })),
      alan('o-foto', 'Fotoğraf (isteğe bağlı)', h('input', { type: 'file', id: 'o-foto', accept: Object.keys(GORSEL_TURLERI).join(',') }), HAK_NOTU)),
    h('div', { class: 'alan' }, h('label', { class: 'onay' }, h('input', { type: 'checkbox', id: 'o-aktif', checked: true }), 'Kadroda (işaretli değilse sitede görünmez)')),
    h('div', { class: 'dugme-satir' }, h('button', { type: 'submit', class: 'dugme', id: 'o-kaydet' }, 'Kaydet'), h('button', { type: 'button', class: 'dugme ikincil', id: 'o-yeni' }, 'Yeni oyuncu')));
  const liste = h('ul', { class: 'yonetim-liste', id: 'oyuncu-listesi' });
  kok.replaceChildren(form, h('div', { class: 'bolum-baslik' }, h('h2', null, 'Kadro')), liste);
  const temizle = () => { duzenlenen = null; form.reset(); $('#o-aktif').checked = true; $('#o-sira').value = '0'; $('#oyuncu-form-baslik').textContent = 'Oyuncu ekle'; };
  $('#o-yeni').addEventListener('click', temizle);

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const no = $('#o-no').value.trim();
    const kayit = { ad: $('#o-ad').value.trim(), forma_no: no === '' ? null : Number(no), mevki: $('#o-mevki').value, sira: Number($('#o-sira').value || 0), aktif: $('#o-aktif').checked };
    if (kayit.ad.length < 2) return bildir('Oyuncunun adını yazın.', 'hata');
    if (kayit.forma_no != null && (!Number.isInteger(kayit.forma_no) || kayit.forma_no < 1 || kayit.forma_no > 99)) return bildir('Forma numarası 1-99 arasında olmalı.', 'hata');
    const d = $('#o-kaydet'); d.disabled = true;
    try {
      const dosya = $('#o-foto').files[0];
      if (dosya) { const y = await kopyalariYukle(dosya, 'oyuncu/'); if (y.hata) return bildir(y.hata, 'hata'); kayit.foto_url = y.url; }
      const sorgu = duzenlenen ? supabase.from('oyuncular').update(kayit).eq('id', duzenlenen.id) : supabase.from('oyuncular').insert(kayit);
      const { error } = await sorgu.select('id').single();
      if (error) return bildir(hataMetni(error, 'Oyuncu kaydedilemedi.'), 'hata');
      bildir(duzenlenen ? 'Oyuncu güncellendi.' : 'Oyuncu eklendi.');
      temizle();
      await yukle();
      sakatlikOyunculariYenile();
    } finally { d.disabled = false; }
  });

  async function sil(o) {
    if (!onayla(`${o.ad} kadrodan ve sakatlık kayıtlarıyla birlikte silinsin mi? (Yalnız gizlemek için "Kadroda" işaretini kaldırın.)`)) return;
    const { error } = await supabase.from('oyuncular').delete().eq('id', o.id);
    if (error) return bildir(hataMetni(error), 'hata');
    bildir('Oyuncu silindi.');
    await yukle();
    sakatlikOyunculariYenile();
  }

  async function yukle() {
    const { data, error } = await supabase.from('oyuncular').select('id, ad, forma_no, mevki, foto_url, aktif, sira').order('mevki').order('sira').limit(200);
    if (error) { liste.replaceChildren(h('li', null, hataMetni(error))); return; }
    liste.replaceChildren(...(data.length ? data.map((o) => h('li', { 'data-oyuncu-id': o.id },
      h('span', { class: 'satir-baslik' }, o.forma_no != null ? `${o.forma_no} · ` : '', o.ad),
      h('span', { class: 'dugme-satir kucuk-yazi soluk' }, MEVKI_ADI[o.mevki], o.aktif ? null : h('span', { class: 'rozet' }, 'Kadroda değil'), o.foto_url ? ' · fotoğraflı' : ''),
      h('span', { class: 'dugme-satir' },
        h('button', { type: 'button', class: 'dugme ikincil kucuk', onclick: () => {
          duzenlenen = { id: o.id }; $('#oyuncu-form-baslik').textContent = 'Oyuncuyu düzenle';
          $('#o-ad').value = o.ad; $('#o-no').value = o.forma_no ?? ''; $('#o-mevki').value = o.mevki; $('#o-sira').value = o.sira; $('#o-aktif').checked = o.aktif;
          form.scrollIntoView({ behavior: 'smooth', block: 'start' }); $('#o-ad').focus();
        } }, 'Düzenle'),
        h('button', { type: 'button', class: 'dugme tehlike kucuk', onclick: () => sil(o) }, 'Sil'))))
      : [h('li', { class: 'bos' }, 'Henüz oyuncu yok.')]));
  }
  return yukle();
}

// ===================================================================== Sakatlıklar
let sakatlikOyunculariYenile = () => {};
function sakatliklarSekmesi(kok) {
  let duzenlenen = null;
  const oyuncuSec = h('select', { id: 's-oyuncu', required: true });
  const aciklama = h('textarea', { id: 's-aciklama', rows: '2', 'aria-describedby': 's-aciklama-sayac' });
  const sayac = h('small', { id: 's-aciklama-sayac' }, '0/200');
  const form = h('form', { class: 'kutu', id: 'sakatlik-formu', novalidate: true },
    h('h2', { id: 'sakatlik-form-baslik' }, 'Sakatlık / ceza güncellemesi'),
    h('p', { class: 'yonetim-not', id: 's-kvkk-notu' }, 'Sağlık bilgisi hassas kişisel veridir (KVKK m.6). Sitede YALNIZ durum (Sakat, Cezalı, Durumu belirsiz, Döndü), kaynak ve tarih görünür; tanı ya da sakatlık ayrıntısı yazılmaz. Kaynak zorunlu; Sakat ve Durumu belirsiz kaydında kulübün açıklamasının bağlantısı da zorunlu. Söylenti girilmez. Hata fark edilirse hemen düzeltin.'),
    alan('s-oyuncu', 'Oyuncu', oyuncuSec),
    alan('s-durum', 'Durum', h('select', { id: 's-durum' }, Object.entries(SAKATLIK_DURUMLARI).map(([v, t]) => h('option', { value: v }, t)))),
    h('div', { class: 'alan' }, h('label', { for: 's-aciklama' }, 'İç not (yalnız yöneticiler görür; sitede gösterilmez, tanı yazmayın)'), aciklama, sayac),
    h('div', { class: 'iki-sutun' },
      alan('s-kaynak', 'Kaynak (zorunlu)', h('input', { type: 'text', id: 's-kaynak', maxlength: '120', required: true, placeholder: 'ör. Kulüp açıklaması' })),
      alan('s-kaynak-url', 'Kaynak bağlantısı (https; Sakat / Durumu belirsiz için zorunlu)', h('input', { type: 'url', id: 's-kaynak-url', inputmode: 'url', placeholder: 'https://corumfk.com.tr/…' }))),
    h('div', { class: 'iki-sutun' },
      alan('s-kaynak-tarihi', 'Kaynağın tarihi', h('input', { type: 'date', id: 's-kaynak-tarihi' }), 'Açıklamanın yayımlandığı gün. Sitede "Kaynak: … · tarih".'),
      alan('s-donus', 'Tahmini dönüş (isteğe bağlı)', h('input', { type: 'date', id: 's-donus' }), 'Yalnız kulübün açıklamasında tarih yazıyorsa girin; tahmin etmeyin.')),
    h('div', { class: 'alan' }, h('label', { class: 'onay' }, h('input', { type: 'checkbox', id: 's-yayinda' }), 'Yayında (ziyaretçi görür)')),
    h('div', { class: 'dugme-satir' }, h('button', { type: 'submit', class: 'dugme', id: 's-kaydet' }, 'Kaydet'), h('button', { type: 'button', class: 'dugme ikincil', id: 's-yeni' }, 'Yeni güncelleme')));
  const liste = h('ul', { class: 'yonetim-liste', id: 'sakatlik-listesi' });
  kok.replaceChildren(form, h('div', { class: 'bolum-baslik' }, h('h2', null, 'Güncellemeler')), liste);
  aciklama.addEventListener('input', () => { const n = aciklama.value.length; sayac.textContent = n > 200 ? `${n}/200 · ${n - 200} karakter fazla` : `${n}/200`; });
  const temizle = () => { duzenlenen = null; const o = oyuncuSec.value; form.reset(); oyuncuSec.value = o; sayac.textContent = '0/200'; $('#sakatlik-form-baslik').textContent = 'Sakatlık / ceza güncellemesi'; };
  $('#s-yeni').addEventListener('click', temizle);

  async function oyunculariDoldur() {
    const secili = oyuncuSec.value;
    const { data } = await supabase.from('oyuncular').select('id, ad, forma_no').order('ad').limit(200);
    oyuncuSec.replaceChildren(h('option', { value: '' }, 'Oyuncu seçin…'), ...(data || []).map((o) => h('option', { value: o.id }, `${o.ad}${o.forma_no != null ? ' (' + o.forma_no + ')' : ''}`)));
    if (secili) oyuncuSec.value = secili;
  }
  sakatlikOyunculariYenile = oyunculariDoldur;

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const kayit = {
      oyuncu_id: oyuncuSec.value, durum: $('#s-durum').value, aciklama: aciklama.value.trim() || null,
      kaynak: $('#s-kaynak').value.trim(), kaynak_url: $('#s-kaynak-url').value.trim() || null, kaynak_tarihi: $('#s-kaynak-tarihi').value || null,
      beklenen_donus: $('#s-donus').value || null, yayinda: $('#s-yayinda').checked,
    };
    const hatalar = sakatlikHatalari(kayit);
    const ilk = Object.keys(hatalar)[0];
    form.querySelectorAll('[aria-invalid]').forEach((e) => e.removeAttribute('aria-invalid'));
    if (ilk) {
      const girdi = { oyuncu_id: 's-oyuncu', durum: 's-durum', kaynak: 's-kaynak', aciklama: 's-aciklama', kaynak_url: 's-kaynak-url', kaynak_tarihi: 's-kaynak-tarihi' }[ilk];
      $('#' + girdi).setAttribute('aria-invalid', 'true'); $('#' + girdi).focus();
      return bildir(hatalar[ilk], 'hata');
    }
    const d = $('#s-kaydet'); d.disabled = true;
    const sorgu = duzenlenen ? supabase.from('sakatliklar').update(kayit).eq('id', duzenlenen) : supabase.from('sakatliklar').insert(kayit);
    const { error } = await sorgu.select('id').single();
    d.disabled = false;
    if (error) return bildir(hataMetni(error, 'Güncelleme kaydedilemedi.'), 'hata');
    bildir(duzenlenen ? 'Güncelleme kaydedildi.' : 'Sakatlık güncellemesi eklendi.');
    temizle();
    await yukle();
  });

  async function sil(s) {
    if (!onayla('Bu güncelleme silinsin mi?')) return;
    const { error } = await supabase.from('sakatliklar').delete().eq('id', s.id);
    if (error) return bildir(hataMetni(error), 'hata');
    bildir('Güncelleme silindi.');
    await yukle();
  }

  async function yukle() {
    // 014: açıklama (iç not) yalnız yöneticiye açık; sütun yetkisi kapalı olduğu için yönetici listesi RPC ile gelir
    const { data, error } = await supabase.rpc('sakatliklar_yonetim');
    if (error) { liste.replaceChildren(h('li', null, hataMetni(error))); return; }
    liste.replaceChildren(...(data.length ? data.map((s) => h('li', { 'data-sakatlik-id': s.id },
      h('span', { class: 'satir-baslik' }, s.oyuncu_ad || 'Oyuncu', ' · ', SAKATLIK_DURUMLARI[s.durum]),
      h('span', { class: 'dugme-satir kucuk-yazi soluk' }, h('span', { class: 'rozet ' + (s.yayinda ? 'yayinda' : '') }, s.yayinda ? 'Yayında' : 'Taslak'), `Kaynak: ${s.kaynak}`,
        s.kaynak_tarihi ? ` (${tarihYaz(s.kaynak_tarihi + 'T12:00:00Z', { saat: false })})` : '', ' · ', tarihYaz(s.guncellendi),
        SAKATLIK_BAGLANTI_ZORUNLU.includes(s.durum) && !s.kaynak_url ? h('span', { class: 'rozet gizli' }, 'Bağlantı eksik') : null),
      s.aciklama ? h('span', { class: 'kucuk-yazi' }, 'İç not: ', s.aciklama) : null,
      h('span', { class: 'dugme-satir' },
        h('button', { type: 'button', class: 'dugme ikincil kucuk', onclick: () => {
          duzenlenen = s.id; $('#sakatlik-form-baslik').textContent = 'Güncellemeyi düzenle';
          oyuncuSec.value = s.oyuncu_id; $('#s-durum').value = s.durum; aciklama.value = s.aciklama || ''; $('#s-kaynak').value = s.kaynak;
          $('#s-kaynak-url').value = s.kaynak_url || ''; $('#s-kaynak-tarihi').value = s.kaynak_tarihi || ''; $('#s-donus').value = s.beklenen_donus || ''; $('#s-yayinda').checked = s.yayinda;
          form.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } }, 'Düzenle'),
        h('button', { type: 'button', class: 'dugme tehlike kucuk', onclick: () => sil(s) }, 'Sil'))))
      : [h('li', { class: 'bos' }, 'Henüz güncelleme yok.')]));
  }
  return Promise.all([oyunculariDoldur(), yukle()]);
}

// ===================================================================== Reklamlar (ayrı modül)
// Reklam modülü assets/reklam/yonetim-reklamlar.js dosyasını sağlar. Varsa yüklenir ve
// #reklamlar-sekmesi öğesine bağlanır: export default / kur / mount (el, { supabase, oturum }).
async function reklamlarSekmesi() {
  const yer = $('#reklamlar-sekmesi');
  let modul = null;
  try { modul = await import('../reklam/yonetim-reklamlar.js'); } catch (e) { modul = null; }
  const kur = modul && [modul.default, modul.kur, modul.mount, modul.yonetimReklamlariniKur].find((f) => typeof f === 'function');
  if (!kur) { $('#reklam-modul-yok').hidden = false; return; }
  try {
    await kur(yer, { supabase, oturum });
  } catch (e) {
    $('#reklam-modul-yok').textContent = 'Reklam modülü yüklenirken bir sorun oluştu.';
    $('#reklam-modul-yok').hidden = false;
  }
  document.dispatchEvent(new CustomEvent('reklamlar-sekmesi-hazir', { detail: { el: yer } }));
}

/** 015 (denetçi 2): "Yorumlar" sekmesinde kuyruk sayısı (onay bekleyen + şikâyetle gizlenen); sekme açılmadan da görünür. */
function kuyrukSekmeSayisi(n) {
  const dugme = $('#sekme-yorumlar');
  if (!dugme) return;
  let rozet = $('#sekme-yorumlar-sayac');
  if (!n) { rozet?.remove(); return; }
  if (!rozet) { rozet = h('span', { class: 'rozet canli', id: 'sekme-yorumlar-sayac' }); dugme.append(' ', rozet); }
  rozet.textContent = String(n);
  rozet.setAttribute('aria-label', `${n} yorum bakılmayı bekliyor`);
}
async function kuyrukSayisiniYukle() {
  try {
    const [a, b] = await Promise.all([
      supabase.from('yorumlar').select('id').eq('onay_bekliyor', true).limit(500),
      supabase.from('yorumlar').select('id').eq('gizli', true).eq('gizleme_nedeni', 'sikayet').limit(500),
    ]);
    kuyrukSekmeSayisi((a.data || []).length + (b.data || []).length);
  } catch (e) { /* sayı alınamazsa sekme sayısız kalır */ }
}

// ===================================================================== sekmeler
const SEKMELER = {
  haberler: { panel: 'haberler-sekmesi', kur: haberlerSekmesi },
  maclar: { panel: 'maclar-sekmesi', kur: maclarSekmesi },
  goller: { panel: 'goller-sekmesi', kur: gollerSekmesi },
  kadro: { panel: 'kadro-sekmesi', kur: kadroSekmesi },
  sakatliklar: { panel: 'sakatliklar-sekmesi', kur: sakatliklarSekmesi },
  yorumlar: { panel: 'yorumlar-sekmesi', kur: yorumlarSekmesi },
  reklamlar: { panel: 'reklamlar-paneli', kur: reklamlarSekmesi },
};
const kurulan = new Set();
let sekmeTabindex = () => {};

function sekmeAc(ad) {
  if (!SEKMELER[ad]) ad = 'haberler';
  for (const [k, s] of Object.entries(SEKMELER)) {
    $('#sekme-' + k).setAttribute('aria-selected', String(k === ad));
    $('#' + s.panel).hidden = k !== ad;
  }
  sekmeTabindex();
  mesaj($('#panel-mesaj'), '');
  history.replaceState(null, '', '#' + ad);
  if (!kurulan.has(ad)) {
    kurulan.add(ad);
    SEKMELER[ad].kur($('#' + SEKMELER[ad].panel));
  }
}

if (!oturum.hazir) {
  // ayar eksik ya da bağlantı yok: sayfaBaslat uyarıyı gösterdi
} else if (!oturum.kullanici) {
  yetki.className = 'mesaj bilgi';
  yetki.replaceChildren('Yönetim paneli için ', h('a', { href: girisAdresi() }, 'giriş yapın'), '.');
  yetki.hidden = false;
} else if (!oturum.admin) {
  yetki.className = 'mesaj hata';
  yetki.setAttribute('role', 'alert');
  yetki.textContent = 'Bu sayfa sadece yöneticiler içindir.';
  yetki.hidden = false;
} else {
  $('#panel').hidden = false;
  document.querySelectorAll('[data-sekme]').forEach((b) => b.addEventListener('click', () => sekmeAc(b.dataset.sekme)));
  // WAI-ARIA sekmeler: ← → Home End, seçili sekme tabindex 0
  sekmeTabindex = sekmeKlavyesi($('.yonetim-sekmeler'), (t) => sekmeAc(t.dataset.sekme));
  sekmeAc(location.hash.slice(1));
  kuyrukSayisiniYukle();
}
