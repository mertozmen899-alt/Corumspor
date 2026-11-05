// Yönetim paneli. Buradaki rol kontrolü sadece kullanım kolaylığı içindir;
// her yazma işlemini sunucudaki RLS politikaları (public.is_admin()) ayrıca denetler.
import {
  supabase, h, $, mesaj, sayfaBaslat, hataMetni, tarihYaz, yerelGirdi, girdidenIso, guvenliGorsel,
  girisAdresi, DURUM_ADI, durumRozeti, skorMetni, evSahibiDeplasman, dakikaMetni, youtubeKimlik, mp4Mu,
} from '../ortak.js';

const KOVA = 'haber-gorselleri';
const EN_BUYUK_GORSEL = 3 * 1024 * 1024;
const GORSEL_TURLERI = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

const oturum = await sayfaBaslat();
const yetki = $('#yetki-mesaj');
const bildir = (metin, tur = 'basari') => mesaj($('#panel-mesaj'), metin, tur);

function alan(id, etiket, girdi, not) {
  return h('div', { class: 'alan' }, h('label', { for: id }, etiket), girdi, not ? h('small', null, not) : null);
}

function onayla(soru) {
  return window.confirm(soru);
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
      'JPEG, PNG, WebP ya da GIF; en fazla 3 MB.'),
    onizleme,
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
    onizlemeGoster(haber.kapak_url);
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('#h-baslik').focus();
  }

  $('#h-yeni').addEventListener('click', temizle);
  $('#h-kapak').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (f && GORSEL_TURLERI[f.type] && f.size <= EN_BUYUK_GORSEL) {
      kapakKaldir = false;
      const okuyucu = new FileReader();
      okuyucu.onload = () => onizleme.replaceChildren(h('img', { class: 'kapak-onizleme', src: okuyucu.result, alt: 'Yeni kapak önizleme' }));
      okuyucu.readAsDataURL(f);
    }
  });

  function eskiKapakYolu(url) {
    const i = typeof url === 'string' ? url.indexOf('/' + KOVA + '/') : -1;
    return i >= 0 ? decodeURIComponent(url.slice(i + KOVA.length + 2).split('?')[0]) : null;
  }

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const baslik = $('#h-baslik').value.trim();
    if (baslik.length < 3) return bildir('Başlık en az 3 karakter olmalı.', 'hata');
    const kayit = {
      baslik,
      ozet: $('#h-ozet').value.trim() || null,
      govde: $('#h-govde').value.replace(/\r\n?/g, '\n').trim(),
      yayinda: $('#h-yayinda').checked,
    };
    const dugme = $('#h-kaydet');
    dugme.disabled = true;
    try {
      const dosya = $('#h-kapak').files[0];
      const eski = duzenlenen && duzenlenen.kapak_url;
      if (dosya) {
        if (!GORSEL_TURLERI[dosya.type]) return bildir('Kapak görseli JPEG, PNG, WebP ya da GIF olmalı.', 'hata');
        if (dosya.size > EN_BUYUK_GORSEL) return bildir('Kapak görseli en fazla 3 MB olabilir.', 'hata');
        const yol = `${crypto.randomUUID()}.${GORSEL_TURLERI[dosya.type]}`;
        const yukleme = await supabase.storage.from(KOVA).upload(yol, dosya, { contentType: dosya.type, cacheControl: '31536000', upsert: false });
        if (yukleme.error) return bildir(hataMetni(yukleme.error, 'Görsel yüklenemedi.'), 'hata');
        kayit.kapak_url = supabase.storage.from(KOVA).getPublicUrl(yol).data.publicUrl;
      } else if (kapakKaldir) {
        kayit.kapak_url = null;
      }
      const sorgu = duzenlenen
        ? supabase.from('haberler').update(kayit).eq('id', duzenlenen.id)
        : supabase.from('haberler').insert(kayit);
      const { error } = await sorgu.select('id').single();
      if (error) return bildir(hataMetni(error, 'Haber kaydedilemedi.'), 'hata');
      // Değişen/kaldırılan eski kapağı depodan sil (başarısızsa önemsiz)
      if ('kapak_url' in kayit && eskiKapakYolu(eski)) supabase.storage.from(KOVA).remove([eskiKapakYolu(eski)]).catch(() => {});
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
    const yol = eskiKapakYolu(haber.kapak_url);
    if (yol) supabase.storage.from(KOVA).remove([yol]).catch(() => {});
    bildir('Haber silindi.');
    if (duzenlenen && duzenlenen.id === haber.id) temizle();
    await yukle();
  }

  async function yukle() {
    const { data, error } = await supabase.from('haberler')
      .select('id, baslik, ozet, govde, kapak_url, yayinda, yayin_tarihi, created_at')
      .order('created_at', { ascending: false }).limit(200);
    if (error) { liste.replaceChildren(h('li', null, hataMetni(error, 'Haberler yüklenemedi.'))); return; }
    liste.replaceChildren(...(data.length ? data.map((haber) => h('li', { 'data-haber-id': haber.id },
      h('span', { class: 'satir-baslik' }, haber.baslik),
      h('span', { class: 'dugme-satir kucuk-yazi soluk' },
        h('span', { class: 'rozet ' + (haber.yayinda ? 'yayinda' : '') }, haber.yayinda ? 'Yayında' : 'Taslak'),
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
    alan('g-video', 'Video bağlantısı (isteğe bağlı)', h('input', { type: 'url', id: 'g-video', inputmode: 'url', placeholder: 'https://www.youtube.com/watch?v=…' }),
      'YouTube bağlantısı (gizlilik modunda gömülür) ya da https:// ile başlayan .mp4 dosya adresi.'),
    alan('g-aciklama', 'Açıklama (isteğe bağlı)', h('input', { type: 'text', id: 'g-aciklama', maxlength: '300' })),
    h('div', { class: 'dugme-satir' },
      h('button', { type: 'submit', class: 'dugme', id: 'g-kaydet' }, 'Kaydet'),
      h('button', { type: 'button', class: 'dugme ikincil', id: 'g-yeni' }, 'Yeni gol')));
  const liste = h('ul', { class: 'yonetim-liste', id: 'gol-listesi' });
  kok.replaceChildren(form, h('div', { class: 'bolum-baslik' }, h('h2', null, 'Son goller')), liste);

  function temizle() { duzenlenen = null; const m = macSecim.value; form.reset(); macSecim.value = m; $('#gol-form-baslik').textContent = 'Gol ekle'; }
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
    };
    if (!kayit.mac_id) return bildir('Maç seçin.', 'hata');
    if (kayit.oyuncu.length < 2) return bildir('Golü atan oyuncunun adını yazın.', 'hata');
    if (!Number.isInteger(dakika) || dakika < 1 || dakika > 130) return bildir('Dakika 1-130 arasında olmalı.', 'hata');
    if (ek != null && (!Number.isInteger(ek) || ek < 1 || ek > 20)) return bildir('Uzatma dakikası 1-20 arasında olmalı.', 'hata');
    if (video && !youtubeKimlik(video) && !mp4Mu(video)) return bildir('Video bağlantısı bir YouTube adresi ya da https:// ile başlayan .mp4 adresi olmalı.', 'hata');
    const dugme = $('#g-kaydet');
    dugme.disabled = true;
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
      .select('id, mac_id, oyuncu, dakika, ek_dakika, penalti, video_url, aciklama, created_at, maclar(rakip, tarih)')
      .order('created_at', { ascending: false }).limit(100);
    if (error) { liste.replaceChildren(h('li', null, hataMetni(error))); return; }
    liste.replaceChildren(...(data.length ? data.map((gol) => h('li', { 'data-gol-id': gol.id },
      h('span', { class: 'satir-baslik' }, `${dakikaMetni(gol)} ${gol.oyuncu}`, gol.penalti ? ' (P)' : ''),
      h('span', { class: 'kucuk-yazi soluk' }, gol.maclar ? `${gol.maclar.rakip} · ${tarihYaz(gol.maclar.tarih, { saat: false, kisa: true })}` : '', gol.video_url ? ' · videolu' : ''),
      h('span', { class: 'dugme-satir' },
        h('button', { type: 'button', class: 'dugme ikincil kucuk', onclick: () => doldur(gol) }, 'Düzenle'),
        h('button', { type: 'button', class: 'dugme tehlike kucuk', onclick: () => sil(gol) }, 'Sil'))))
      : [h('li', { class: 'bos' }, 'Henüz gol yok.')]));
  }

  return Promise.all([maclariDoldur(), yukle()]);
}

// ===================================================================== Yorumlar (moderasyon)
function yorumlarSekmesi(kok) {
  const filtre = h('select', { id: 'y-filtre', 'aria-label': 'Yorum filtresi' },
    h('option', { value: 'hepsi' }, 'Bütün yorumlar'),
    h('option', { value: 'gorunur' }, 'Görünür olanlar'),
    h('option', { value: 'gizli' }, 'Gizlenenler'));
  const liste = h('ul', { class: 'yonetim-liste', id: 'yorum-moderasyon' });
  kok.replaceChildren(h('div', { class: 'kutu' },
    h('h2', null, 'Yorum moderasyonu'),
    h('p', { class: 'soluk kucuk-yazi' }, 'Gizlenen yorumu sadece yazan kişi ve yöneticiler görür. Silinen yorum geri gelmez.'),
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

  async function yukle() {
    let q = supabase.from('yorumlar')
      .select('id, metin, gizli, created_at, haber_id, mac_id, kullanici_id, profiles(kullanici_adi), haberler(baslik), maclar(rakip)')
      .order('created_at', { ascending: false }).limit(100);
    if (filtre.value === 'gizli') q = q.eq('gizli', true);
    if (filtre.value === 'gorunur') q = q.eq('gizli', false);
    const { data, error } = await q;
    if (error) { liste.replaceChildren(h('li', null, hataMetni(error))); return; }
    liste.replaceChildren(...(data.length ? data.map((y) => {
      const hedef = y.haber_id
        ? h('a', { href: 'haber.html?id=' + encodeURIComponent(y.haber_id) }, 'Haber: ' + ((y.haberler && y.haberler.baslik) || '—'))
        : h('a', { href: 'mac.html?id=' + encodeURIComponent(y.mac_id) }, 'Maç: ' + ((y.maclar && y.maclar.rakip) || '—'));
      return h('li', { 'data-yorum-id': y.id },
        h('span', { class: 'dugme-satir kucuk-yazi' },
          h('strong', null, (y.profiles && y.profiles.kullanici_adi) || 'taraftar'),
          h('span', { class: 'soluk' }, tarihYaz(y.created_at)),
          y.gizli ? h('span', { class: 'rozet gizli' }, 'Gizli') : null),
        h('span', { class: 'kucuk-yazi' }, hedef),
        h('p', { class: 'yorum-metni' }, y.metin),
        h('span', { class: 'dugme-satir' },
          h('button', { type: 'button', class: 'dugme ikincil kucuk', onclick: () => gizle(y) }, y.gizli ? 'Göster' : 'Gizle'),
          h('button', { type: 'button', class: 'dugme tehlike kucuk', onclick: () => sil(y) }, 'Sil')));
    }) : [h('li', { class: 'bos' }, 'Yorum yok.')]));
  }

  return yukle();
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
  yorumlar: { panel: 'yorumlar-sekmesi', kur: yorumlarSekmesi },
  reklamlar: { panel: 'reklamlar-paneli', kur: reklamlarSekmesi },
};
const kurulan = new Set();

function sekmeAc(ad) {
  if (!SEKMELER[ad]) ad = 'haberler';
  for (const [k, s] of Object.entries(SEKMELER)) {
    $('#sekme-' + k).setAttribute('aria-selected', String(k === ad));
    $('#' + s.panel).hidden = k !== ad;
  }
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
  sekmeAc(location.hash.slice(1));
}
