// Yönetim paneli. Buradaki rol kontrolü sadece kullanım kolaylığı içindir;
// her yazma işlemini sunucudaki RLS politikaları (public.is_admin()) ayrıca denetler.
import {
  supabase, h, $, mesaj, sayfaBaslat, hataMetni, tarihYaz, yerelGirdi, girdidenIso, guvenliGorsel,
  girisAdresi, DURUM_ADI, durumRozeti, skorMetni, evSahibiDeplasman, dakikaMetni, youtubeKimlik, mp4Mu, sekmeKlavyesi,
} from '../ortak.js';
import { gorselKucult, ENCOK_GIRDI_BAYT } from '../gorsel-kucult.js';
import { SAKATLIK_DURUMLARI, sakatlikHatalari } from '../kurallar.js';

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
    };
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
      .select('id, baslik, ozet, govde, kapak_url, kapak_kaynak, manset, yayinda, yayin_tarihi, created_at')
      .order('created_at', { ascending: false }).limit(200);
    if (error) { liste.replaceChildren(h('li', null, hataMetni(error, 'Haberler yüklenemedi.'))); return; }
    liste.replaceChildren(...(data.length ? data.map((haber) => h('li', { 'data-haber-id': haber.id },
      h('span', { class: 'satir-baslik' }, haber.baslik),
      h('span', { class: 'dugme-satir kucuk-yazi soluk' },
        h('span', { class: 'rozet ' + (haber.yayinda ? 'yayinda' : '') }, haber.yayinda ? 'Yayında' : 'Taslak'),
        haber.manset ? h('span', { class: 'rozet canli' }, 'Manşet') : null,
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
    h('div', { class: 'dugme-satir' },
      h('button', { type: 'submit', class: 'dugme', id: 'm-kaydet' }, 'Kaydet'),
      h('button', { type: 'button', class: 'dugme ikincil', id: 'm-yeni' }, 'Yeni maç')));
  const liste = h('ul', { class: 'yonetim-liste', id: 'mac-listesi' });
  kok.replaceChildren(form, h('div', { class: 'bolum-baslik' }, h('h2', null, 'Bütün maçlar')), liste);

  function temizle() { duzenlenen = null; form.reset(); $('#mac-form-baslik').textContent = 'Yeni maç'; }
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
    };
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
        h('span', { class: 'dugme-satir kucuk-yazi soluk' }, durumRozeti(mac.durum), tarihYaz(mac.tarih, { gun: true, kisa: true })),
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
    alan('g-oyuncu', 'Golü atan', h('input', { type: 'text', id: 'g-oyuncu', maxlength: '80', required: true })),
    h('div', { class: 'iki-sutun' },
      alan('g-dakika', 'Dakika', h('input', { type: 'number', id: 'g-dakika', min: '1', max: '130', inputmode: 'numeric', required: true })),
      alan('g-ek', 'Uzatma dakikası (isteğe bağlı)', h('input', { type: 'number', id: 'g-ek', min: '1', max: '20', inputmode: 'numeric' }), 'Örnek: 90+3 için dakika 90, uzatma 3.')),
    h('div', { class: 'alan' }, h('label', { class: 'onay' }, h('input', { type: 'checkbox', id: 'g-penalti' }), 'Penaltı golü')),
    h('p', { class: 'yonetim-not', id: 'g-hak-notu' }, 'Yalnızca hak sahibinin resmî YouTube videolarını kullanın (yayıncının ya da kulübün resmî kanalı). Maç yayınından kesit, izinsiz yükleme ya da başka sitedeki video dosyası eklemeyin.'),
    alan('g-video', 'Video bağlantısı (isteğe bağlı)', h('input', { type: 'url', id: 'g-video', inputmode: 'url', placeholder: 'https://www.youtube.com/watch?v=…' }),
      'Resmî YouTube bağlantısı: gizlilik modunda, yalnız ziyaretçi dokununca yüklenir. (https:// ile başlayan .mp4 adresi de kabul edilir; yalnız hakkı varsa.)'),
    h('div', { class: 'iki-sutun' },
      alan('g-kapak', 'Video kapağı (isteğe bağlı)', h('input', { type: 'file', id: 'g-kapak', accept: Object.keys(GORSEL_TURLERI).join(',') }), 'Kendi deponuza yüklenir; YouTube küçük resmi kullanılmaz (ziyaretçinin bilgisi YouTube\'a gitmesin). ' + HAK_NOTU),
      alan('g-sure', 'Video süresi (saniye, isteğe bağlı)', h('input', { type: 'number', id: 'g-sure', min: '1', max: '3600', inputmode: 'numeric' }))),
    h('div', { id: 'g-kapak-onizleme' }),
    alan('g-aciklama', 'Golün anlatımı (isteğe bağlı ama önerilir)', h('input', { type: 'text', id: 'g-aciklama', maxlength: '300' }), 'Videoyu izleyemeyenler için: kim, nasıl, hangi dakikada.'),
    h('div', { class: 'dugme-satir' },
      h('button', { type: 'submit', class: 'dugme', id: 'g-kaydet' }, 'Kaydet'),
      h('button', { type: 'button', class: 'dugme ikincil', id: 'g-yeni' }, 'Yeni gol')));
  const liste = h('ul', { class: 'yonetim-liste', id: 'gol-listesi' });
  kok.replaceChildren(form, h('div', { class: 'bolum-baslik' }, h('h2', null, 'Son goller')), liste);

  let kapak = null; // { url } düzenlenen golün mevcut kapağı
  function temizle() { duzenlenen = null; kapak = null; const m = macSecim.value; form.reset(); macSecim.value = m; $('#gol-form-baslik').textContent = 'Gol ekle'; $('#g-kapak-onizleme').replaceChildren(); }
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
    $('#g-dakika').value = gol.dakika;
    $('#g-ek').value = gol.ek_dakika ?? '';
    $('#g-penalti').checked = gol.penalti;
    $('#g-video').value = gol.video_url || '';
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
    const video = $('#g-video').value.trim() || null;
    const kayit = {
      mac_id: macSecim.value,
      oyuncu: $('#g-oyuncu').value.trim(),
      dakika,
      ek_dakika: ek,
      penalti: $('#g-penalti').checked,
      video_url: video,
      aciklama: $('#g-aciklama').value.trim() || null,
      sure_sn: $('#g-sure').value.trim() === '' ? null : Number($('#g-sure').value),
    };
    if (!kayit.mac_id) return bildir('Maç seçin.', 'hata');
    if (kayit.oyuncu.length < 2) return bildir('Golü atan oyuncunun adını yazın.', 'hata');
    if (!Number.isInteger(dakika) || dakika < 1 || dakika > 130) return bildir('Dakika 1-130 arasında olmalı.', 'hata');
    if (ek != null && (!Number.isInteger(ek) || ek < 1 || ek > 20)) return bildir('Uzatma dakikası 1-20 arasında olmalı.', 'hata');
    if (video && !youtubeKimlik(video) && !mp4Mu(video)) return bildir('Video bağlantısı bir YouTube adresi ya da https:// ile başlayan .mp4 adresi olmalı.', 'hata');
    if (kayit.sure_sn != null && (!Number.isInteger(kayit.sure_sn) || kayit.sure_sn < 1 || kayit.sure_sn > 3600)) return bildir('Video süresi 1-3600 saniye arasında tam sayı olmalı.', 'hata');
    const dugme = $('#g-kaydet');
    dugme.disabled = true;
    const dosya = $('#g-kapak').files[0];
    if (dosya) {
      const y = await kopyalariYukle(dosya, 'gol/');
      if (y.hata) { dugme.disabled = false; return bildir(y.hata, 'hata'); }
      kayit.kapak_url = y.url;
    }
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
      .select('id, mac_id, oyuncu, dakika, ek_dakika, penalti, video_url, aciklama, kapak_url, sure_sn, created_at, maclar(rakip, tarih)')
      .order('created_at', { ascending: false }).limit(100);
    if (error) { liste.replaceChildren(h('li', null, hataMetni(error))); return; }
    liste.replaceChildren(...(data.length ? data.map((gol) => h('li', { 'data-gol-id': gol.id },
      h('span', { class: 'satir-baslik' }, `${dakikaMetni(gol)} ${gol.oyuncu}`, gol.penalti ? ' (P)' : ''),
      h('span', { class: 'kucuk-yazi soluk' }, gol.maclar ? `${gol.maclar.rakip} · ${tarihYaz(gol.maclar.tarih, { saat: false, kisa: true })}` : '', gol.video_url ? ' · videolu' : '', gol.kapak_url ? ' · kapaklı' : ''),
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
  const filtre = h('select', { id: 'y-filtre', 'aria-label': 'Yorum filtresi' },
    h('option', { value: 'hepsi' }, 'Bütün yorumlar'),
    h('option', { value: 'sikayet' }, 'Şikâyet edilenler'),
    h('option', { value: 'gorunur' }, 'Görünür olanlar'),
    h('option', { value: 'gizli' }, 'Gizlenenler'));
  const liste = h('ul', { class: 'yonetim-liste', id: 'yorum-moderasyon' });
  kok.replaceChildren(h('div', { class: 'kutu' },
    h('h2', null, 'Yorum moderasyonu'),
    h('p', { class: 'soluk kucuk-yazi' }, 'Gizlenen yorumu sadece yazan kişi ve yöneticiler görür. Silinen yorum geri gelmez. Şikâyet edilen yorumlara maç günü 1 saat, diğer günler 12 saat içinde bakın (kurallar.html). "Yorumdan men et" kişinin yeni yorum yazmasını kapatır.'),
    alan('y-filtre', 'Göster', filtre)), liste);
  filtre.addEventListener('change', yukle);

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

  async function yukle() {
    let q = supabase.from('yorumlar')
      .select('id, metin, gizli, created_at, haber_id, mac_id, gol_id, kullanici_id, profiles(kullanici_adi), haberler(baslik), maclar(rakip), goller(oyuncu)')
      .order('created_at', { ascending: false }).limit(150);
    if (filtre.value === 'gizli') q = q.eq('gizli', true);
    if (filtre.value === 'gorunur') q = q.eq('gizli', false);
    const [yr, sk, en] = await Promise.all([q, supabase.from('yorum_sikayetleri').select('yorum_id, neden').limit(1000), supabase.rpc('engelli_kullanicilar')]);
    if (yr.error) { liste.replaceChildren(h('li', null, hataMetni(yr.error))); return; }
    const sikayet = new Map();
    for (const x of sk.data || []) { const l = sikayet.get(x.yorum_id) || []; l.push(x.neden); sikayet.set(x.yorum_id, l); }
    const engelliler = new Set(Array.isArray(en.data) ? en.data.map((x) => (typeof x === 'string' ? x : x.engelli_kullanicilar || x.id)) : []);
    let data = yr.data;
    if (filtre.value === 'sikayet') data = data.filter((y) => sikayet.has(y.id)).sort((a, b) => sikayet.get(b.id).length - sikayet.get(a.id).length);
    liste.replaceChildren(...(data.length ? data.map((y) => {
      const ad = (y.profiles && y.profiles.kullanici_adi) || 'taraftar';
      const hedef = y.haber_id
        ? h('a', { href: 'haber.html?id=' + encodeURIComponent(y.haber_id) }, 'Haber: ' + ((y.haberler && y.haberler.baslik) || '—'))
        : y.gol_id ? h('a', { href: 'gol.html?id=' + encodeURIComponent(y.gol_id) }, 'Gol: ' + ((y.goller && y.goller.oyuncu) || '—'))
          : h('a', { href: 'mac.html?id=' + encodeURIComponent(y.mac_id) }, 'Maç: ' + ((y.maclar && y.maclar.rakip) || '—'));
      const s = sikayet.get(y.id) || [];
      const engelli = engelliler.has(y.kullanici_id);
      return h('li', { 'data-yorum-id': y.id },
        h('span', { class: 'dugme-satir kucuk-yazi' },
          h('strong', null, ad),
          h('span', { class: 'soluk' }, tarihYaz(y.created_at)),
          y.gizli ? h('span', { class: 'rozet gizli' }, 'Gizli') : null,
          engelli ? h('span', { class: 'rozet gizli' }, 'Yasaklı') : null,
          s.length ? h('span', { class: 'sikayet-sayisi', 'data-sikayet': String(s.length) }, `⚑ ${s.length} şikâyet (${[...new Set(s)].map((n) => NEDEN_ADI[n] || n).join(', ')})`) : null),
        h('span', { class: 'kucuk-yazi' }, hedef),
        h('p', { class: 'yorum-metni' }, y.metin),
        h('span', { class: 'dugme-satir' },
          h('button', { type: 'button', class: 'dugme ikincil kucuk', onclick: () => gizle(y) }, y.gizli ? 'Göster' : 'Gizle'),
          h('button', { type: 'button', class: 'dugme ikincil kucuk', onclick: () => engelle(y, ad, engelli) }, engelli ? 'Yasağı kaldır' : 'Yorumdan men et'),
          h('button', { type: 'button', class: 'dugme tehlike kucuk', onclick: () => sil(y) }, 'Sil')));
    }) : [h('li', { class: 'bos' }, 'Yorum yok.')]));
  }

  return yukle();
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
    h('p', { class: 'yonetim-not', id: 's-kvkk-notu' }, 'Sağlık bilgisi hassas kişisel veridir (KVKK m.6). YALNIZ kulübün resmî olarak açıkladığı bilgiyi, açıklamadaki ayrıntıdan fazlasını yazmadan girin. Kaynak zorunlu; söylenti girilmez. Hata fark edilirse hemen düzeltin.'),
    alan('s-oyuncu', 'Oyuncu', oyuncuSec),
    alan('s-durum', 'Durum', h('select', { id: 's-durum' }, Object.entries(SAKATLIK_DURUMLARI).map(([v, t]) => h('option', { value: v }, t)))),
    h('div', { class: 'alan' }, h('label', { for: 's-aciklama' }, 'Kısa açıklama (en fazla 200 karakter)'), aciklama, sayac),
    h('div', { class: 'iki-sutun' },
      alan('s-kaynak', 'Kaynak (zorunlu)', h('input', { type: 'text', id: 's-kaynak', maxlength: '120', required: true, placeholder: 'ör. Kulüp açıklaması' })),
      alan('s-kaynak-url', 'Kaynak bağlantısı (https)', h('input', { type: 'url', id: 's-kaynak-url', inputmode: 'url', placeholder: 'https://corumfk.com.tr/…' }))),
    alan('s-donus', 'Tahmini dönüş (isteğe bağlı; yalnız kulüp açıkladıysa)', h('input', { type: 'date', id: 's-donus' })),
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
      kaynak: $('#s-kaynak').value.trim(), kaynak_url: $('#s-kaynak-url').value.trim() || null,
      beklenen_donus: $('#s-donus').value || null, yayinda: $('#s-yayinda').checked,
    };
    const hatalar = sakatlikHatalari(kayit);
    const ilk = Object.keys(hatalar)[0];
    form.querySelectorAll('[aria-invalid]').forEach((e) => e.removeAttribute('aria-invalid'));
    if (ilk) {
      const girdi = { oyuncu_id: 's-oyuncu', durum: 's-durum', kaynak: 's-kaynak', aciklama: 's-aciklama', kaynak_url: 's-kaynak-url' }[ilk];
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
    const { data, error } = await supabase.from('sakatliklar').select('id, oyuncu_id, durum, aciklama, kaynak, kaynak_url, beklenen_donus, guncellendi, yayinda, oyuncular(ad)').order('guncellendi', { ascending: false }).limit(200);
    if (error) { liste.replaceChildren(h('li', null, hataMetni(error))); return; }
    liste.replaceChildren(...(data.length ? data.map((s) => h('li', { 'data-sakatlik-id': s.id },
      h('span', { class: 'satir-baslik' }, (s.oyuncular && s.oyuncular.ad) || 'Oyuncu', ' · ', SAKATLIK_DURUMLARI[s.durum]),
      h('span', { class: 'dugme-satir kucuk-yazi soluk' }, h('span', { class: 'rozet ' + (s.yayinda ? 'yayinda' : '') }, s.yayinda ? 'Yayında' : 'Taslak'), `Kaynak: ${s.kaynak}`, ' · ', tarihYaz(s.guncellendi)),
      s.aciklama ? h('span', { class: 'kucuk-yazi' }, s.aciklama) : null,
      h('span', { class: 'dugme-satir' },
        h('button', { type: 'button', class: 'dugme ikincil kucuk', onclick: () => {
          duzenlenen = s.id; $('#sakatlik-form-baslik').textContent = 'Güncellemeyi düzenle';
          oyuncuSec.value = s.oyuncu_id; $('#s-durum').value = s.durum; aciklama.value = s.aciklama || ''; $('#s-kaynak').value = s.kaynak;
          $('#s-kaynak-url').value = s.kaynak_url || ''; $('#s-donus').value = s.beklenen_donus || ''; $('#s-yayinda').checked = s.yayinda;
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
}
