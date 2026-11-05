// Çorumspor reklam yönetim paneli (ES modülü, düz JS). Uygulamada yeri: assets/reklam/yonetim-reklamlar.js
// Uygulamanın yönetim paneli (assets/sayfa/yonetim.js) bu dosyayı "Reklamlar" sekmesi ilk açıldığında yükler ve
//   kur(document.getElementById('reklamlar-sekmesi'), { supabase, oturum })
// çağırır (AGENTS.md "Reklam yuvaları sözleşmesi"). Doğrudan kullanım için: reklamYonetimiBaslat(bolum, supabase).
// Stiller: assets/reklam/yonetim-reklamlar.css ve assets/reklam/reklam.css (önizleme için) sayfaya eklenmeli.
// Yazma işleri doğrudan tabloya gider; RLS yalnızca yöneticiye izin verir (sunucu tarafı kontrol esastır,
// buradaki kontroller sadece yöneticiye erken ve Türkçe uyarı vermek içindir).

import {
  ALANLAR, SINIRLAR, YASAKLI_SEKTORLER, baglantiGecerli, baglantiNormallestir, buAyAraligi, durumEtiketi, firmaSuz, isoYerelGirise,
  istanbulBicimle, oranBicimle, raporCsv, reklamDogrula, reklamDurumu, reklamSec, reklamSunulabilir, telefonKaydi,
  telefonuUluslararasiYap, tiklamaOrani, whatsappBaglantisiOlustur, yerelGiristenIso,
} from './reklam-mantik.js';
import { reklamKartiOlustur } from './reklam.js';
import { gorselKucult, ENCOK_GIRDI_BAYT } from '../gorsel-kucult.js';

// ---------------------------------------------------------------------------
// Uygulamaya göre değiştirilecek ayarlar
// ---------------------------------------------------------------------------
export const MAC_AYARI = {
  tablo: 'maclar',
  sutunlar: 'id, rakip, tarih',
  tarihSutunu: 'tarih',
  kacGunOncesinden: 30, // listede geçmiş maçlar da (son 30 gün) görünsün
  etiket: (m) => `${istanbulBicimle(m.tarih)} · ${TAKIM_ADI} – ${m.rakip}`,
};
export const DEPO_KOVASI = 'reklam-gorselleri';
// Görsel yüklemeden önce bu kutuya sığdırılır (en-boy oranı korunur) ve WebP yapılır (assets/gorsel-kucult.js)
export const GORSEL_KUTUSU = { enGenis: 1200, enYuksek: 1200 };
export const TAKIM_ADI = 'Çorum FK'; // uygulamanın assets/ayar.js'teki TAKIM_ADI ile aynı

// ---------------------------------------------------------------------------
const SAYI = new Intl.NumberFormat('tr-TR');

function h(etiket, ozellikler = {}, ...cocuklar) {
  const e = document.createElement(etiket);
  for (const [k, v] of Object.entries(ozellikler || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (k in e && typeof v !== 'string') e[k] = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of cocuklar.flat()) if (c != null && c !== false) e.append(c instanceof Node ? c : String(c));
  return e;
}

function hataMesaji(error) {
  if (!error) return '';
  const m = error.message || String(error);
  if (/row-level security|42501|permission denied/i.test(m + (error.code || ''))) return 'Bu işlem için yönetici yetkisi gerekiyor.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.';
  return m;
}

/**
 * Paneli başlatır.
 * @param {HTMLElement} kok
 * @param {object} sb supabase-js istemcisi
 * @param {{simdi?: () => Date}} ops
 */
export async function yonetimBaslat(kok, sb, ops = {}) {
  const simdi = ops.simdi || window.__reklamSimdi || (() => new Date());
  const durum = { reklamlar: [], maclar: [], duzenlenen: null, sekme: 'reklamlar' };
  kok.classList.add('ry');
  kok.replaceChildren(h('p', { class: 'ry-bekle', text: 'Yükleniyor…' }));

  // ----- Oturum ve yetki -----
  const { data: { session } = {} } = await sb.auth.getSession();
  if (!session) return girisGoster();
  const { data: yonetici, error: yetkiHata } = await sb.rpc('is_admin');
  if (yetkiHata || !yonetici) {
    kok.replaceChildren(h('section', { class: 'ry-kutu ry-uyari', role: 'alert' },
      h('h2', { text: 'Yetkiniz yok' }),
      h('p', { text: 'Bu sayfayı yalnızca yöneticiler görebilir.' }),
      h('button', { class: 'ry-dugme', type: 'button', onclick: async () => { await sb.auth.signOut(); location.reload(); } }, 'Çıkış yap')));
    return;
  }

  function girisGoster() {
    const eposta = h('input', { type: 'email', id: 'ry-eposta', autocomplete: 'username', required: true });
    const sifre = h('input', { type: 'password', id: 'ry-sifre', autocomplete: 'current-password', required: true });
    const mesaj = h('p', { class: 'ry-hata', role: 'alert' });
    const form = h('form', { class: 'ry-kutu ry-giris', onsubmit: async (e) => {
      e.preventDefault();
      mesaj.textContent = '';
      const { error } = await sb.auth.signInWithPassword({ email: eposta.value.trim(), password: sifre.value });
      if (error) { mesaj.textContent = 'E-posta ya da şifre hatalı.'; return; }
      yonetimBaslat(kok, sb, ops);
    } },
    h('h2', { text: 'Yönetici girişi' }),
    h('label', { for: 'ry-eposta', text: 'E-posta' }), eposta,
    h('label', { for: 'ry-sifre', text: 'Şifre' }), sifre,
    mesaj,
    h('button', { class: 'ry-dugme ry-ana', type: 'submit' }, 'Giriş yap'));
    kok.replaceChildren(form);
  }

  // ----- İskelet -----
  const bildirim = h('div', { class: 'ry-bildirim', role: 'status', 'aria-live': 'polite' });
  // WAI-ARIA sekmeler: tablist / tab / tabpanel, seçili sekme tabindex 0 (diğerleri -1), ← → Home End
  const sekmeReklam = h('button', { type: 'button', role: 'tab', class: 'ry-sekme', id: 'ry-sekme-reklamlar', 'aria-controls': 'ry-reklamlar', 'data-sekme': 'reklamlar', onclick: () => sekmeAc('reklamlar') }, 'Reklamlar');
  const sekmeRapor = h('button', { type: 'button', role: 'tab', class: 'ry-sekme', id: 'ry-sekme-rapor', 'aria-controls': 'ry-rapor', 'data-sekme': 'rapor', onclick: () => sekmeAc('rapor') }, 'Rapor');
  const reklamBolumu = h('section', { class: 'ry-bolum', id: 'ry-reklamlar', role: 'tabpanel', 'aria-labelledby': 'ry-sekme-reklamlar' });
  const raporBolumu = h('section', { class: 'ry-bolum', id: 'ry-rapor', role: 'tabpanel', 'aria-labelledby': 'ry-sekme-rapor', hidden: true });
  const sekmeListesi = h('div', { class: 'ry-sekmeler', role: 'tablist', 'aria-label': 'Reklam bölümleri' }, sekmeReklam, sekmeRapor);
  sekmeListesi.addEventListener('keydown', (e) => {
    const l = [sekmeReklam, sekmeRapor];
    const i = l.indexOf(document.activeElement);
    const hedef = i < 0 ? undefined : { ArrowRight: (i + 1) % l.length, ArrowLeft: (i - 1 + l.length) % l.length, Home: 0, End: l.length - 1 }[e.key];
    if (hedef === undefined) return;
    e.preventDefault();
    l[hedef].focus();
    sekmeAc(l[hedef].dataset.sekme);
  });
  kok.replaceChildren(
    h('div', { class: 'ry-ust' },
      sekmeListesi,
      h('span', { class: 'ry-kullanici', text: session.user && session.user.email ? session.user.email : '' })),
    bildirim, reklamBolumu, raporBolumu);

  function bildir(metin, tur = 'iyi') {
    bildirim.replaceChildren(h('p', { class: `ry-bildirim-${tur}`, text: metin }));
    clearTimeout(bildir.z);
    bildir.z = setTimeout(() => bildirim.replaceChildren(), 6000);
  }

  function sekmeAc(ad) {
    durum.sekme = ad;
    for (const b of [sekmeReklam, sekmeRapor]) { b.setAttribute('aria-selected', String(b.dataset.sekme === ad)); b.tabIndex = b.dataset.sekme === ad ? 0 : -1; }
    reklamBolumu.hidden = ad !== 'reklamlar';
    raporBolumu.hidden = ad !== 'rapor';
    if (ad === 'rapor' && !raporBolumu.dataset.kuruldu) raporKur();
  }

  // ----- Veri -----
  async function reklamlariYukle() {
    const { data, error } = await sb.from('reklamlar').select('*').order('created_at', { ascending: false });
    if (error) { bildir(hataMesaji(error), 'kotu'); return; }
    durum.reklamlar = data || [];
  }
  async function maclariYukle() {
    const once = new Date(simdi().getTime() - MAC_AYARI.kacGunOncesinden * 864e5).toISOString();
    try {
      const { data, error } = await sb.from(MAC_AYARI.tablo).select(MAC_AYARI.sutunlar)
        .gte(MAC_AYARI.tarihSutunu, once).order(MAC_AYARI.tarihSutunu, { ascending: true }).limit(200);
      durum.maclar = error ? [] : data || [];
      durum.macHata = error ? hataMesaji(error) : null;
    } catch (e) { durum.maclar = []; durum.macHata = hataMesaji(e); }
  }
  const macAdi = (id) => {
    const m = durum.maclar.find((x) => String(x.id) === String(id));
    return m ? MAC_AYARI.etiket(m) : `Maç #${id}`;
  };

  // ----- Liste -----
  function listeCiz() {
    const s = simdi();
    const tablo = h('table', { class: 'ry-tablo' },
      h('thead', {}, h('tr', {}, ['Firma', 'Alan', 'Tarihler (Türkiye saati)', 'Öncelik', 'Durum', ''].map((b) => h('th', { scope: 'col', text: b })))));
    const govde = h('tbody');
    if (!durum.reklamlar.length) {
      govde.append(h('tr', {}, h('td', { colspan: 6, class: 'ry-bos', text: 'Henüz reklam yok. "Yeni reklam" ile ilk reklamı ekleyin.' })));
    }
    for (const r of durum.reklamlar) {
      const kod = reklamDurumu(r, s);
      let gosterim = null;
      if (reklamSunulabilir(r, s)) {
        const kazanan = reklamSec(durum.reklamlar, { alan: r.alan, macId: r.mac_id }, s);
        gosterim = kazanan && kazanan.id === r.id
          ? h('span', { class: 'ry-not ry-not-iyi', text: 'Şu an gösteriliyor' })
          : h('span', { class: 'ry-not', text: `Sırada (önde: ${kazanan ? kazanan.firma_adi : '-'})` });
      }
      const yayinaAl = kod !== 'yayinda' && kod !== 'suresi_doldu' && kod !== 'baslamadi';
      govde.append(h('tr', { 'data-reklam-id': r.id },
        h('td', { 'data-baslik': 'Firma' }, h('div', { class: 'ry-firma' },
          r.gorsel_url ? h('img', { src: r.gorsel_url, alt: '', loading: 'lazy', width: 48, height: 48 }) : null,
          h('div', {}, h('strong', { text: r.firma_adi }), h('small', { text: r.kisa_metin }))) ),
        h('td', { 'data-baslik': 'Alan' }, ALANLAR[r.alan] || r.alan,
          r.alan === 'mac_sponsoru' ? h('small', { text: r.mac_id ? macAdi(r.mac_id) : 'Tüm maçlar' }) : null),
        h('td', { 'data-baslik': 'Tarihler' }, h('small', { text: `${istanbulBicimle(r.baslangic)} →` }), h('small', { text: istanbulBicimle(r.bitis) })),
        h('td', { 'data-baslik': 'Öncelik', text: String(r.oncelik) }),
        h('td', { 'data-baslik': 'Durum' }, h('span', { class: `ry-rozet ry-rozet-${kod}`, text: durumEtiketi(kod) }), gosterim),
        h('td', {}, h('div', { class: 'ry-islemler' },
          h('button', { type: 'button', class: 'ry-dugme ry-kucuk', onclick: () => formAc(r) }, 'Düzenle'),
          r.durum === 'yayinda' && kod !== 'suresi_doldu'
            ? h('button', { type: 'button', class: 'ry-dugme ry-kucuk', onclick: () => durumDegistir(r, 'duraklatildi') }, 'Duraklat')
            : yayinaAl ? h('button', { type: 'button', class: 'ry-dugme ry-kucuk', onclick: () => durumDegistir(r, 'yayinda') }, 'Yayına al') : null,
          h('button', { type: 'button', class: 'ry-dugme ry-kucuk ry-tehlike', onclick: () => sil(r) }, 'Sil')))));
    }
    tablo.append(govde);
    reklamBolumu.replaceChildren(
      h('div', { class: 'ry-arac' },
        h('h2', { text: 'Reklamlar' }),
        h('button', { type: 'button', class: 'ry-dugme ry-ana', id: 'ry-yeni', onclick: () => formAc(null) }, '+ Yeni reklam')),
      h('div', { class: 'ry-tablo-kap' }, tablo));
  }

  async function durumDegistir(r, yeni) {
    if (yeni === 'yayinda') {
      if (!r.sektor_onayi) { bildir('Önce "Düzenle" ile açıp yasaklı sektör listesini onaylayın.', 'kotu'); return; }
      const hatalar = reklamDogrula(r, { simdi: simdi(), yayinaAliniyor: true });
      if (Object.keys(hatalar).length) { bildir(Object.values(hatalar)[0], 'kotu'); return; }
    }
    const { error } = await sb.from('reklamlar').update({ durum: yeni }).eq('id', r.id).select().single();
    if (error) { bildir(hataMesaji(error), 'kotu'); return; }
    bildir(yeni === 'yayinda' ? `"${r.firma_adi}" yayına alındı.` : `"${r.firma_adi}" duraklatıldı.`);
    await reklamlariYukle();
    listeCiz();
  }

  async function sil(r) {
    if (!window.confirm(`"${r.firma_adi}" reklamı ve istatistikleri silinsin mi? Bu işlem geri alınamaz.`)) return;
    const { error } = await sb.from('reklamlar').delete().eq('id', r.id);
    if (error) { bildir(hataMesaji(error), 'kotu'); return; }
    bildir(`"${r.firma_adi}" silindi.`);
    await reklamlariYukle();
    listeCiz();
  }

  // ----- Form + önizleme -----
  function formAc(r) {
    durum.duzenlenen = r;
    const s = simdi();
    const yeniBas = new Date(Math.ceil(s.getTime() / 3600e3) * 3600e3);
    const d = r || { firma_adi: '', kisa_metin: '', gorsel_url: '', gorsel_kucuk_url: null, gorsel_metni: '', dugme_metni: '', telefon: null, sektor_onayi: false, baglanti_url: null, alan: 'ana_akis', mac_id: null,
      baslangic: yeniBas.toISOString(), bitis: new Date(yeniBas.getTime() + 7 * 864e5).toISOString(), oncelik: 0, durum: 'taslak' };

    const alan = (ad, etiket, girdi, yardim) => h('div', { class: 'ry-alan', 'data-alan': ad },
      h('label', { for: `ry-${ad}`, text: etiket }), girdi,
      yardim ? h('small', { class: 'ry-yardim', text: yardim }) : null,
      h('small', { class: 'ry-alan-hata', id: `ry-${ad}-hata`, role: 'alert' }));

    const firma = h('input', { id: 'ry-firma_adi', name: 'firma_adi', maxlength: SINIRLAR.firmaAdiEnUzun, value: d.firma_adi, required: true });
    // Sınır aşılınca metin SESSİZCE KESİLMEZ: sayaç kırmızı "14 karakter fazla" der, kayıt engellenir
    const metin = h('textarea', { id: 'ry-kisa_metin', name: 'kisa_metin', rows: 3, required: true, 'aria-describedby': 'ry-kisa_metin-sayac ry-kisa_metin-hata' });
    metin.value = d.kisa_metin;
    const sayac = h('small', { class: 'ry-sayac', id: 'ry-kisa_metin-sayac', 'aria-live': 'polite' });
    const dugmeMetni = h('input', { id: 'ry-dugme_metni', name: 'dugme_metni', maxlength: 40, placeholder: 'Ayrıntılar', value: d.dugme_metni || '' });
    const araTel = h('input', { id: 'ry-telefon_ara', type: 'tel', inputmode: 'tel', placeholder: '0364 213 19 19', value: d.telefon ? '0' + d.telefon.replace(/^\+90/, '') : '' });
    const gorselMetni = h('input', { id: 'ry-gorsel_metni', name: 'gorsel_metni', maxlength: SINIRLAR.gorselMetniEnUzun + 40, value: d.gorsel_metni || '', placeholder: 'ör. Narçil Cafe; görseldeki yazı: Loves you, espresso…' });
    let gorselKucukUrl = d.gorsel_kucuk_url || null;
    const sektorKutular = YASAKLI_SEKTORLER.map(([k, t]) => h('label', { class: 'ry-secenek' }, h('input', { type: 'checkbox', name: 'sektor', value: k, checked: !!d.sektor_onayi }), ' ', t));
    const sektorOnayli = () => sektorKutular.every((l) => l.querySelector('input').checked);
    const dosya = h('input', { id: 'ry-gorsel', type: 'file', accept: SINIRLAR.gorselTurleri.join(',') });
    const gorselUrl = h('input', { id: 'ry-gorsel_url', name: 'gorsel_url', type: 'url', value: d.gorsel_url || '', placeholder: 'https://…', 'aria-label': 'Görsel adresi' });
    const gorselDurum = h('small', { class: 'ry-yardim', id: 'ry-gorsel-durum' });

    // Kabul edilen iki WhatsApp biçimi de (wa.me ve whatsapp://send) numara + mesaj olarak forma dolsun
    const wa = d.baglanti_url && /^(?:https:\/\/wa\.me\/|whatsapp:\/\/send\?phone=)(\d+)/i.exec(d.baglanti_url);
    const turSec = h('div', { class: 'ry-secenekler', role: 'radiogroup', 'aria-label': 'Bağlantı türü' },
      ...[['yok', 'Bağlantı yok'], ['web', 'Web sitesi'], ['whatsapp', 'WhatsApp']].map(([v, t]) =>
        h('label', { class: 'ry-secenek' }, h('input', { type: 'radio', name: 'baglanti_turu', value: v }), ' ', t)));
    const baslangicTur = !d.baglanti_url ? 'yok' : wa || /^whatsapp:/i.test(d.baglanti_url) ? 'whatsapp' : 'web';
    turSec.querySelector(`input[value="${baslangicTur}"]`).checked = true;
    const web = h('input', { id: 'ry-baglanti_url', type: 'url', inputmode: 'url', placeholder: 'https://firmaniz.com.tr', value: baslangicTur === 'web' ? d.baglanti_url : '' });
    const telefon = h('input', { id: 'ry-telefon', type: 'tel', inputmode: 'tel', placeholder: '0532 123 45 67', value: wa ? '0' + wa[1].replace(/^90/, '') : '' });
    let eskiMesaj = '';
    if (wa) { try { eskiMesaj = new URL(d.baglanti_url).searchParams.get('text') || ''; } catch { /* yok */ } }
    const waMesaj = h('input', { id: 'ry-wa-mesaj', maxlength: 200, placeholder: 'Merhaba, Çorumspor uygulamasından yazıyorum', value: eskiMesaj });
    const waSonuc = h('small', { class: 'ry-yardim', id: 'ry-wa-sonuc' });
    const webKutu = alan('baglanti_url', 'Web adresi', web, 'Yalnızca güvenli (https://) adresler kabul edilir.');
    const waKutu = h('div', { class: 'ry-alan', 'data-alan': 'whatsapp' },
      h('label', { for: 'ry-telefon', text: 'WhatsApp numarası' }), telefon,
      h('label', { for: 'ry-wa-mesaj', text: 'Hazır mesaj (isteğe bağlı)' }), waMesaj, waSonuc,
      h('small', { class: 'ry-alan-hata', id: 'ry-whatsapp-hata', role: 'alert' }));

    const alanSec = h('select', { id: 'ry-alan', name: 'alan' }, ...Object.entries(ALANLAR).map(([v, t]) => h('option', { value: v, text: t })));
    alanSec.value = d.alan;
    const macSec = h('select', { id: 'ry-mac_id', name: 'mac_id' },
      h('option', { value: '', text: 'Tüm maçlar (genel sponsor)' }),
      ...durum.maclar.map((m) => h('option', { value: String(m.id), text: MAC_AYARI.etiket(m) })));
    if (d.mac_id && !durum.maclar.some((m) => String(m.id) === String(d.mac_id))) macSec.append(h('option', { value: String(d.mac_id), text: `Maç #${d.mac_id}` }));
    macSec.value = d.mac_id ? String(d.mac_id) : '';
    const macKutu = alan('mac_id', 'Maç', macSec, durum.macHata ? `Maç listesi alınamadı: ${durum.macHata}` : 'Belirli bir maç seçerseniz o maçta genel sponsorun yerine bu reklam çıkar.');

    const bas = h('input', { id: 'ry-baslangic', type: 'datetime-local', value: isoYerelGirise(d.baslangic) });
    const bit = h('input', { id: 'ry-bitis', type: 'datetime-local', value: isoYerelGirise(d.bitis) });
    const oncelik = h('input', { id: 'ry-oncelik', type: 'number', min: 0, max: 100, step: 1, value: String(d.oncelik ?? 0) });

    const ozet = h('div', { class: 'ry-hata-ozet', role: 'alert' });
    const bilgi = h('p', { class: 'ry-onizleme-bilgi', id: 'ry-onizleme-bilgi' });
    const onMasaustu = h('div', { class: 'ry-onizleme-icerik' });
    const onTelefon = h('div', { class: 'ry-onizleme-icerik' });

    const kaydetDugme = h('button', { type: 'button', class: 'ry-dugme', id: 'ry-taslak', onclick: () => kaydet('taslak') }, 'Taslak kaydet');
    const yayinDugme = h('button', { type: 'button', class: 'ry-dugme ry-ana', id: 'ry-yayina-al', onclick: () => kaydet('yayinda') }, r && r.durum === 'yayinda' ? 'Kaydet (yayında kalsın)' : 'Yayına al');
    const durDugme = r && r.durum === 'yayinda'
      ? h('button', { type: 'button', class: 'ry-dugme', id: 'ry-duraklat', onclick: () => kaydet('duraklatildi') }, 'Duraklat') : null;

    let yerelResim = null; // yükleme sürerken önizlemede gösterilecek nesne adresi
    let yukleniyor = false;

    function turu() { return turSec.querySelector('input:checked').value; }
    function satirTopla() {
      const t = turu();
      let baglanti = null;
      if (t === 'web') baglanti = baglantiNormallestir(web.value);
      else if (t === 'whatsapp') baglanti = whatsappBaglantisiOlustur(telefon.value, waMesaj.value) || (telefon.value.trim() ? 'gecersiz-whatsapp' : null);
      return {
        firma_adi: firma.value.trim(), kisa_metin: metin.value.trim(), gorsel_url: gorselUrl.value.trim(),
        gorsel_kucuk_url: gorselKucukUrl && gorselUrl.value.trim() ? gorselKucukUrl : null,
        gorsel_metni: gorselMetni.value.trim() || null, dugme_metni: dugmeMetni.value.trim() || null,
        telefon: araTel.value.trim() ? (telefonKaydi(araTel.value) || 'gecersiz') : null, sektor_onayi: sektorOnayli(),
        baglanti_url: baglanti, alan: alanSec.value, mac_id: alanSec.value === 'mac_sponsoru' && macSec.value ? macSec.value : null,
        baslangic: yerelGiristenIso(bas.value), bitis: yerelGiristenIso(bit.value),
        oncelik: oncelik.value === '' ? NaN : Number(oncelik.value),
      };
    }

    function guncelle() {
      const t = turu();
      webKutu.hidden = t !== 'web';
      waKutu.hidden = t !== 'whatsapp';
      macKutu.hidden = alanSec.value !== 'mac_sponsoru';
      const fazla = metin.value.trim().length - SINIRLAR.kisaMetinEnUzun;
      sayac.textContent = fazla > 0 ? `${metin.value.length}/${SINIRLAR.kisaMetinEnUzun} · ${fazla} karakter fazla` : `${metin.value.length}/${SINIRLAR.kisaMetinEnUzun}`;
      sayac.classList.toggle('asim', fazla > 0);
      if (t === 'whatsapp') {
        const b = whatsappBaglantisiOlustur(telefon.value, waMesaj.value);
        waSonuc.textContent = b ? `Oluşan bağlantı: ${b}` : telefon.value.trim() ? 'Numara geçersiz. Örnek: 0532 123 45 67' : '';
      }
      const satir = satirTopla();
      const onizlemeReklam = {
        id: r ? r.id : 'onizleme', firma_adi: satir.firma_adi || 'Firma adı', kisa_metin: satir.kisa_metin || 'Kısa reklam metni burada görünür.',
        gorsel_url: yerelResim || satir.gorsel_url, baglanti_url: baglantiGecerli(satir.baglanti_url) ? satir.baglanti_url : null,
        alan: satir.alan, mac_id: satir.mac_id, dugme_metni: satir.dugme_metni, telefon: satir.telefon === 'gecersiz' ? null : satir.telefon, gorsel_metni: satir.gorsel_metni,
      };
      onMasaustu.replaceChildren(sahne(onizlemeReklam, 'masaustu'));
      onTelefon.replaceChildren(sahne(onizlemeReklam, 'telefon'));
      bilgi.textContent = siraBilgisi(satir);
      if (sonHedef) hatalariGoster(hatalariHesapla(satir, sonHedef));
    }

    function siraBilgisi(satir) {
      if (!satir.baslangic || !satir.bitis) return '';
      const s = simdi();
      const aday = { ...satir, id: r ? r.id : '__yeni__', durum: 'yayinda', yayina_alinma: r && r.durum === 'yayinda' ? r.yayina_alinma : s.toISOString(), created_at: r ? r.created_at : s.toISOString() };
      const digerleri = durum.reklamlar.filter((x) => !r || x.id !== r.id);
      if (new Date(aday.bitis) <= s) return 'Bitiş tarihi geçmiş: bu reklam yayına alınamaz.';
      if (new Date(aday.baslangic) > s) return `Yayına alınırsa ${istanbulBicimle(aday.baslangic)} tarihinde görünmeye başlar.`;
      const kazanan = reklamSec([...digerleri, aday], { alan: aday.alan, macId: aday.mac_id }, s);
      if (kazanan && kazanan.id === aday.id) return 'Yayına alınırsa şu an bu alanda bu reklam gösterilir.';
      return kazanan ? `Yayına alınırsa sırada bekler: şu an "${kazanan.firma_adi}" daha yüksek öncelikli. Önceliği artırabilirsiniz.` : '';
    }

    async function gorselYukle() {
      const f = dosya.files && dosya.files[0];
      if (!f) return;
      if (!SINIRLAR.gorselTurleri.includes(f.type)) { gorselDurum.textContent = 'Yalnızca JPG, PNG ya da WEBP yükleyin.'; dosya.value = ''; return; }
      if (f.size > ENCOK_GIRDI_BAYT) { gorselDurum.textContent = 'Görsel çok büyük: en fazla 25 MB bir dosya seçin.'; dosya.value = ''; return; }
      if (yerelResim) URL.revokeObjectURL(yerelResim);
      yerelResim = URL.createObjectURL(f);
      guncelle();
      yukleniyor = true;
      gorselDurum.textContent = 'Görsel küçültülüp yükleniyor…';
      // Yüklemeden önce 1200 px'e sığdır ve WebP yap (ziyaretçinin internetini yemesin); kova yine 2 MB / tür sınırı uygular
      const k = await gorselKucult(f, GORSEL_KUTUSU);
      if (k.size > SINIRLAR.gorselEnBuyukBayt) { yukleniyor = false; gorselDurum.textContent = 'Görsel küçültüldükten sonra da 2 MB\'tan büyük. Daha sade bir görsel seçin.'; dosya.value = ''; return; }
      const s = simdi();
      const uzanti = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[k.type];
      const yol = `${s.getUTCFullYear()}/${String(s.getUTCMonth() + 1).padStart(2, '0')}/${crypto.randomUUID ? crypto.randomUUID() : Date.now()}.${uzanti}`;
      const { error } = await sb.storage.from(DEPO_KOVASI).upload(yol, k, { contentType: k.type, cacheControl: '31536000', upsert: false });
      yukleniyor = false;
      if (error) { gorselDurum.textContent = 'Görsel yüklenemedi: ' + hataMesaji(error); return; }
      // Küçük kopya (akış 480 px, maç sponsoru 192 px): kart srcset ile yuvasına uyanı indirir
      gorselKucukUrl = null;
      const kare = alanSec.value === 'mac_sponsoru';
      const kk = await gorselKucult(f, kare ? { enGenis: 192, enYuksek: 192 } : { enGenis: 480, enYuksek: 480 });
      const kyol = yol.replace(/\.(\w+)$/, '-k.' + ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[kk.type] || 'webp'));
      const ky = await sb.storage.from(DEPO_KOVASI).upload(kyol, kk, { contentType: kk.type, cacheControl: '31536000', upsert: false });
      if (!ky.error) gorselKucukUrl = sb.storage.from(DEPO_KOVASI).getPublicUrl(kyol).data.publicUrl;
      gorselUrl.value = sb.storage.from(DEPO_KOVASI).getPublicUrl(yol).data.publicUrl;
      gorselDurum.textContent = 'Görsel yüklendi.';
      guncelle();
    }

    function hatalariGoster(hatalar) {
      form.querySelectorAll('.ry-alan-hata').forEach((e) => { e.textContent = ''; });
      form.querySelectorAll('[aria-invalid]').forEach((e) => e.removeAttribute('aria-invalid'));
      const liste = Object.entries(hatalar);
      ozet.replaceChildren();
      if (!liste.length) return;
      ozet.append(h('strong', { text: 'Kaydetmeden önce düzeltin:' }), h('ul', {}, liste.map(([, m]) => h('li', { text: m }))));
      for (const [k, m] of liste) {
        const hedef = k === 'baglanti_url' && turu() === 'whatsapp' ? 'whatsapp' : k === 'telefon' ? 'telefon_ara' : k;
        const yer = form.querySelector(`#ry-${hedef}-hata`) || form.querySelector(`#ry-${k}-hata`);
        if (yer) yer.textContent = m;
        const girdi = form.querySelector(`#ry-${k === 'telefon' ? 'telefon_ara' : k}`);
        if (girdi) girdi.setAttribute('aria-invalid', 'true');
      }
    }

    let sonHedef = null; // hata bir kez gösterildiyse yazdıkça yeniden kontrol edilir
    function hatalariHesapla(satir, hedefDurum) {
      const yayinaAliniyor = hedefDurum === 'yayinda' && (!r || r.durum !== 'yayinda');
      const hatalar = reklamDogrula({ ...satir, baglanti_url: satir.baglanti_url === 'gecersiz-whatsapp' ? null : satir.baglanti_url }, { simdi: simdi(), yayinaAliniyor });
      if (hedefDurum === 'yayinda' && !satir.sektor_onayi) hatalar.sektor = 'Yayına almadan önce yasaklı sektör listesinin dört maddesini de kontrol edip işaretleyin (açılış sayfası dahil).';
      if (turu() === 'whatsapp' && satir.baglanti_url === 'gecersiz-whatsapp') hatalar.baglanti_url = 'WhatsApp numarası geçersiz. Örnek: 0532 123 45 67';
      else if (turu() === 'whatsapp' && !satir.baglanti_url) hatalar.baglanti_url = 'WhatsApp numarasını yazın.';
      else if (turu() === 'web' && !satir.baglanti_url) hatalar.baglanti_url = 'Web adresini yazın ya da "Bağlantı yok" seçin.';
      return hatalar;
    }

    async function kaydet(hedefDurum) {
      if (yukleniyor) { bildir('Görsel yüklenirken bekleyin.', 'kotu'); return; }
      const satir = satirTopla();
      sonHedef = hedefDurum;
      const hatalar = hatalariHesapla(satir, hedefDurum);
      hatalariGoster(hatalar);
      if (Object.keys(hatalar).length) return;
      const kayit = { ...satir, durum: hedefDurum };
      if (kayit.telefon === 'gecersiz') kayit.telefon = null;
      [kaydetDugme, yayinDugme, durDugme].forEach((b) => b && (b.disabled = true));
      const sorgu = r ? sb.from('reklamlar').update(kayit).eq('id', r.id) : sb.from('reklamlar').insert(kayit);
      const { error } = await sorgu.select().single();
      [kaydetDugme, yayinDugme, durDugme].forEach((b) => b && (b.disabled = false));
      if (error) { sonHedef = null; hatalariGoster({ genel: hataMesaji(error) }); return; }
      bildir(hedefDurum === 'yayinda' ? `"${satir.firma_adi}" yayında.` : hedefDurum === 'duraklatildi' ? `"${satir.firma_adi}" duraklatıldı.` : `"${satir.firma_adi}" taslak olarak kaydedildi.`);
      if (yerelResim) URL.revokeObjectURL(yerelResim);
      durum.duzenlenen = null;
      await reklamlariYukle();
      listeCiz();
    }

    const form = h('form', { class: 'ry-form', novalidate: true, onsubmit: (e) => e.preventDefault() },
      h('h2', { text: r ? 'Reklamı düzenle' : 'Yeni reklam' }),
      ozet,
      alan('firma_adi', 'Firma adı', firma),
      h('div', { class: 'ry-alan', 'data-alan': 'kisa_metin' }, h('label', { for: 'ry-kisa_metin', text: 'Kısa metin' }), metin, sayac,
        h('small', { class: 'ry-yardim', text: `En fazla ${SINIRLAR.kisaMetinEnUzun} karakter; telefonda 2-3 satırı geçmesin diye ${SINIRLAR.kisaMetinOnerilen} karakter önerilir. İndirim, kupon, "%" yazılmaz.` }),
        h('small', { class: 'ry-alan-hata', id: 'ry-kisa_metin-hata', role: 'alert' })),
      h('div', { class: 'ry-alan', 'data-alan': 'gorsel_url' }, h('label', { for: 'ry-gorsel', text: 'Görsel' }), dosya,
        h('small', { class: 'ry-yardim', text: 'Önerilen: 1200×628 piksel yatay görsel (maç sponsoru için kare logo). Büyük görsel yüklemeden önce 1200 piksele küçültülüp WebP yapılır (en fazla 2 MB).' }),
        h('small', { class: 'ry-yardim', text: 'Telefonda akışta 112 px, maçta 64 px görünür: önemli yazıyı görselin ortasına koyun, küçük yazı koymayın; kare görselde yalnız logo olsun.' }),
        gorselDurum, h('details', {}, h('summary', { text: 'Görsel adresini elle yaz' }), gorselUrl),
        h('small', { class: 'ry-alan-hata', id: 'ry-gorsel_url-hata', role: 'alert' })),
      alan('gorsel_metni', 'Görseldeki yazı (ekran okuyucu için, isteğe bağlı)', gorselMetni, 'Görselde yazı varsa buraya aynısını yazın. Boş bırakılırsa görsel süs sayılır.'),
      h('fieldset', { class: 'ry-alan' }, h('legend', { text: 'Düğmeye dokununca ne açılsın?' }), turSec), webKutu, waKutu,
      alan('dugme_metni', 'Düğme yazısı (isteğe bağlı)', dugmeMetni, 'Boşsa "Ayrıntılar" (WhatsApp\'ta "WhatsApp\'tan yazın"). Ör. "Menüyü gör", "Yol tarifi". 2-24 karakter.'),
      alan('telefon_ara', '"Ara" düğmesi için telefon (isteğe bağlı)', araTel, 'Doldurulursa kartta ikinci düğme "Ara" çıkar (telefonun arama ekranını açar).'),
      h('fieldset', { class: 'ry-alan ry-sektor', id: 'ry-sektor', 'data-alan': 'sektor' }, h('legend', { text: 'Yasaklı sektör kontrolü (yayına almadan önce zorunlu)' }), ...sektorKutular,
        h('small', { class: 'ry-alan-hata', id: 'ry-sektor-hata', role: 'alert' })),
      alan('alan', 'Nerede görünsün?', alanSec), macKutu,
      h('div', { class: 'ry-iki' }, alan('baslangic', 'Başlangıç', bas, 'Türkiye saati'), alan('bitis', 'Bitiş', bit, 'Bu saatte kendiliğinden kalkar')),
      alan('oncelik', 'Öncelik (0-100)', oncelik, 'Aynı yerde birden fazla reklam varsa yüksek olan gösterilir.'),
      h('small', { class: 'ry-alan-hata', id: 'ry-genel-hata', role: 'alert' }),
      h('div', { class: 'ry-dugmeler' }, kaydetDugme, yayinDugme, durDugme,
        h('button', { type: 'button', class: 'ry-dugme ry-ince', onclick: () => { durum.duzenlenen = null; listeCiz(); } }, 'Vazgeç')));

    form.addEventListener('input', guncelle);
    form.addEventListener('change', guncelle);
    dosya.addEventListener('change', gorselYukle);
    web.addEventListener('blur', () => { const n = baglantiNormallestir(web.value); if (n) web.value = n; guncelle(); });
    const telBicimle = (g) => () => { const no = telefonuUluslararasiYap(g.value); if (no) g.value = '0' + no.slice(2).replace(/^(\d{3})(\d{3})(\d{2})(\d{2})$/, '$1 $2 $3 $4'); guncelle(); };
    telefon.addEventListener('blur', telBicimle(telefon));
    araTel.addEventListener('blur', telBicimle(araTel));

    reklamBolumu.replaceChildren(
      h('div', { class: 'ry-arac' }, h('button', { type: 'button', class: 'ry-dugme ry-ince', onclick: () => { durum.duzenlenen = null; listeCiz(); } }, '← Listeye dön')),
      h('div', { class: 'ry-duzenleyici' },
        form,
        h('section', { class: 'ry-onizleme', 'aria-label': 'Önizleme' },
          h('h3', { text: 'Önizleme' }),
          h('p', { class: 'ry-yardim', text: 'Ziyaretçinin göreceği kart. Önizleme hiçbir gösterim ya da tıklama saymaz.' }),
          bilgi,
          h('div', { class: 'ry-onizlemeler' },
            h('figure', { class: 'ry-cerceve ry-cerceve-masaustu', id: 'ry-onizleme-masaustu' }, h('figcaption', { text: 'Masaüstü (600 px)' }), onMasaustu),
            h('figure', { class: 'ry-cerceve ry-cerceve-telefon', id: 'ry-onizleme-telefon' }, h('figcaption', { text: 'Telefon (360 px)' }), onTelefon)))));
    guncelle();
    firma.focus();
  }

  // Önizleme sahnesi: kart, yerleştiği sayfa bağlamıyla birlikte (gerçek bileşen işaretlemesi, sayım yok)
  function sahne(reklam, cihaz) {
    const yuva = h('div', { class: 'reklam-yuva reklam-yuva--dolu' }, reklamKartiOlustur(reklam, { onizleme: true }));
    const haber = (b) => h('div', { class: 'ry-sahte-haber' }, h('span', { class: 'ry-sahte-resim' }), h('span', { text: b }));
    if (reklam.alan === 'ana_akis') return h('div', { class: `ry-sahne ry-sahne-${cihaz}` }, haber(`${TAKIM_ADI} hazırlıklarını sürdürüyor`), yuva, haber('Biletler satışta'));
    if (reklam.alan === 'haber_sonu') return h('div', { class: `ry-sahne ry-sahne-${cihaz}` }, h('p', { class: 'ry-sahte-metin', text: '… teknik direktör maç sonrası açıklamasında taraftara teşekkür etti.' }), yuva, h('p', { class: 'ry-sahte-yorum', text: 'Yorumlar (12)' }));
    return h('div', { class: `ry-sahne ry-sahne-${cihaz}` }, h('div', { class: 'ry-sahte-skor', text: `${TAKIM_ADI} 2 - 1 Rakip` }), yuva);
  }

  // ----- Rapor -----
  function raporKur() {
    raporBolumu.dataset.kuruldu = '1';
    const aralik = buAyAraligi(simdi());
    const bas = h('input', { type: 'date', id: 'ry-rapor-bas', value: aralik.baslangic });
    const bit = h('input', { type: 'date', id: 'ry-rapor-bit', value: aralik.bitis });
    const sonuc = h('div', { class: 'ry-tablo-kap', id: 'ry-rapor-sonuc' });
    // Firma süzgeci: reklam verene giden CSV YALNIZ o firmanın satırlarını içerir (başka firmanın rakamı sızmaz)
    const firmaSec = h('select', { id: 'ry-rapor-firma' }, h('option', { value: '', text: 'Tüm firmalar (yalnız sizin için)' }));
    const csvNot = h('p', { class: 'ry-yardim', id: 'ry-csv-not', text: 'CSV reklam verene gönderilmek içindir: indirmek için bir firma seçin (dosyada yalnız o firmanın rakamları olur).' });
    let tumSatirlar = [];
    let secilenFirma = ''; // son seçilen firma: başka aralığa bakıp dönünce de seçili kalsın
    let satirlar = [];
    let gosterilenAralik = ''; // CSV dosya adı: tablodaki verinin aralığı (sonradan değiştirilen girişler değil)
    const dosyaAdi = (f) => String(f).toLocaleLowerCase('tr-TR').replace(/[çğıöşü]/g, (c) => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' }[c])).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const csvDugme = h('button', { type: 'button', class: 'ry-dugme', id: 'ry-csv', disabled: true, onclick: () => {
      if (!firmaSec.value) return;
      const blob = new Blob([raporCsv(firmaSuz(satirlar, firmaSec.value), { donem: gosterilenAralik.replace('_', ' – '), macAdi })], { type: 'text/csv;charset=utf-8' });
      const a = h('a', { href: URL.createObjectURL(blob), download: `reklam-raporu_${dosyaAdi(firmaSec.value)}_${gosterilenAralik}.csv` });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } }, 'CSV indir (Excel)');

    async function getir() {
      satirlar = []; tumSatirlar = []; // hata ya da geçersiz aralıkta eski satırlar CSV olarak inmesin
      csvDugme.disabled = true;
      if (!bas.value || !bit.value || bit.value < bas.value) { sonuc.replaceChildren(h('p', { class: 'ry-hata', text: 'Tarih aralığı geçersiz.' })); return; }
      sonuc.replaceChildren(h('p', { class: 'ry-bekle', text: 'Yükleniyor…' }));
      const istenen = [bas.value, bit.value];
      const { data, error } = await sb.rpc('reklam_raporu', { p_baslangic_tarih: istenen[0], p_bitis_tarih: istenen[1] });
      if (error) { sonuc.replaceChildren(h('p', { class: 'ry-hata', text: hataMesaji(error) })); return; }
      tumSatirlar = data || [];
      gosterilenAralik = istenen.join('_');
      const firmalar = [...new Set(tumSatirlar.map((x) => x.firma_adi))].sort((a, b) => a.localeCompare(b, 'tr'));
      firmaSec.replaceChildren(h('option', { value: '', text: 'Tüm firmalar (yalnız sizin için)' }), ...firmalar.map((f) => h('option', { value: f, text: f })));
      firmaSec.value = firmalar.includes(secilenFirma) ? secilenFirma : '';
      ciz();
    }

    function ciz() {
      satirlar = firmaSuz(tumSatirlar, firmaSec.value);
      csvDugme.disabled = !satirlar.length || !firmaSec.value;
      if (!satirlar.length) { sonuc.replaceChildren(h('p', { class: 'ry-bos', text: 'Bu aralıkta veri yok.' })); return; }
      const top = satirlar.reduce((t, s) => ({ g: t.g + Number(s.gosterim), t: t.t + Number(s.tiklama), m: t.m + (Number(s.supheli_dakika) || 0) }), { g: 0, t: 0, m: 0 });
      const oran = (s) => { const o = s.tiklama_orani != null ? Number(s.tiklama_orani) : tiklamaOrani(s.gosterim, s.tiklama); return o == null ? '–' : `%${oranBicimle(o)}`; };
      sonuc.replaceChildren(h('table', { class: 'ry-tablo ry-rapor-tablo' },
        h('thead', {}, h('tr', {}, ['Firma', 'Alan', 'Gösterim', 'Tıklama', 'Tıklama oranı', 'Sınıra takılan dakika'].map((b) => h('th', { scope: 'col', text: b })))),
        h('tbody', {}, satirlar.map((s) => h('tr', { 'data-reklam-id': s.reklam_id },
          h('td', { 'data-baslik': 'Firma', text: s.firma_adi }),
          h('td', { 'data-baslik': 'Alan', text: (ALANLAR[s.alan] || s.alan) + (s.mac_id ? ` · ${macAdi(s.mac_id)}` : '') }),
          h('td', { 'data-baslik': 'Gösterim', class: 'ry-sayi', text: SAYI.format(s.gosterim) }),
          h('td', { 'data-baslik': 'Tıklama', class: 'ry-sayi', text: SAYI.format(s.tiklama) }),
          h('td', { 'data-baslik': 'Oran', class: 'ry-sayi', text: oran(s) }),
          h('td', { 'data-baslik': 'Sınıra takılan dakika', class: 'ry-sayi' + (Number(s.supheli_dakika) > 0 ? ' ry-supheli' : ''), title: 'Bu reklamın dakika sınırına takıldığı dakika sayısı (fazlası sayılmadı)', text: SAYI.format(Number(s.supheli_dakika) || 0) })))),
        h('tfoot', {}, h('tr', {}, h('th', { scope: 'row', colspan: 2, text: 'Toplam' }),
          h('td', { 'data-baslik': 'Gösterim', class: 'ry-sayi', text: SAYI.format(top.g) }), h('td', { 'data-baslik': 'Tıklama', class: 'ry-sayi', text: SAYI.format(top.t) }),
          h('td', { 'data-baslik': 'Oran', class: 'ry-sayi', text: oran({ gosterim: top.g, tiklama: top.t }) }),
          h('td', { 'data-baslik': 'Sınıra takılan dakika', class: 'ry-sayi', text: SAYI.format(top.m) })))));
    }
    firmaSec.addEventListener('change', () => { secilenFirma = firmaSec.value; ciz(); });

    raporBolumu.replaceChildren(
      h('div', { class: 'ry-arac' }, h('h2', { text: 'Rapor' })),
      h('form', { class: 'ry-rapor-suzgec', onsubmit: (e) => { e.preventDefault(); getir(); } },
        h('label', {}, 'Başlangıç ', bas), h('label', {}, 'Bitiş ', bit),
        h('button', { type: 'submit', class: 'ry-dugme ry-ana', id: 'ry-rapor-goster' }, 'Göster'),
        h('label', {}, 'Firma ', firmaSec), csvDugme),
      csvNot,
      h('p', { class: 'ry-yardim', text: 'Tarihler Türkiye takvim günüdür (her iki gün dahil). Gösterim: kartın yarısı en az 1 saniye ekranda kaldı. Aynı ziyaretçinin aynı sayfa açılışındaki tekrarlar sayılmaz. Yöneticilerin (sizin) bakışları sayılmaz.' }),
      h('p', { class: 'ry-yardim', id: 'ry-rapor-yaklasik', text: `Sayılar yaklaşıktır: kişisel veri tutulmadığı için bilerek şişirme tam ayırt edilemez. Bir reklama dakikada ${SINIRLAR.gosterimDakikaSiniri} gösterimden ve ${SINIRLAR.tiklamaDakikaSiniri} tıklamadan fazlası sayılmaz; "Sınıra takılan dakika" 0'dan büyükse o aralıkta sayı şişirilmeye çalışılmış olabilir. Reklam verene rakamları "yaklaşık" diye verin.` }),
      sonuc);
    getir();
  }

  await Promise.all([reklamlariYukle(), maclariYukle()]);
  sekmeAc('reklamlar');
  listeCiz();
}

/** Uygulamanın yonetim.html'indeki <section id="reklamlar-sekmesi" data-modul="reklamlar"> için giriş noktası. */
export function reklamYonetimiBaslat(bolum, supabase, ops = {}) {
  if (!bolum) throw new Error('reklamYonetimiBaslat: bölüm öğesi yok');
  if (!supabase || typeof supabase.from !== 'function') throw new Error('reklamYonetimiBaslat: supabase istemcisi verilmeli');
  return yonetimBaslat(bolum, supabase, ops);
}

/**
 * Uygulama sözleşmesi (assets/sayfa/yonetim.js): kur(el, { supabase, oturum }).
 * Paylaşılan istemci (assets/istemci.js) yönetim sayfasından gelir; burada yeni istemci açılmaz.
 * oturum bilgisi kullanılmaz: panel oturumu ve public.is_admin()'i kendisi de denetler.
 */
export function kur(el, { supabase } = {}) {
  return reklamYonetimiBaslat(el, supabase);
}
