// Reklam yuvası yükleyici.
// Sayfadaki <div class="reklam-yuvasi" data-reklam-alan="..." [data-reklam-sira="0"]> öğelerini bulur,
// ./reklam/reklam.js modülünü yükler, ona uygulamanın TEK supabase istemcisini verir
// (reklamIstemciAyarla; ?sahte=1 test modunda sahte istemci) ve her yuva için
//   reklamYerlestir(el, { alan, macId, sira, gecGelirseAtla })
// çağırır. Modül yüklenemezse ya da hata verirse sessizce hiçbir şey yapmaz:
// reklamın bozulması sayfayı asla bozmaz. data-reklam-durum: modul-yok | hata | tamam.
// Akış (ana_akis) yuvaları sıralıdır: sira 0 = ilk sponsor, 1 = ikinci (farklı firma) …; geç gelen kart, yuva o an
// ekranda ya da okunan yerin üstündeyse eklenmez (okuma konumu kaymaz).
import { supabase } from './istemci.js';

let modulSozu = null;

function modulAl() {
  if (!modulSozu) {
    modulSozu = import('./reklam/reklam.js').then((m) => {
      if (m && typeof m.reklamIstemciAyarla === 'function' && supabase) m.reklamIstemciAyarla(supabase);
      return m;
    }).catch(() => null);
  }
  return modulSozu;
}

/** Sayfa açılır açılmaz (haber sorgusuyla paralel) reklam modülünü yükler ve akışın reklam sorgusunu başlatır. */
export function reklamOnYukle(alan) {
  modulAl().then((m) => { if (m && typeof m.reklamOnYukle === 'function') m.reklamOnYukle(alan); }).catch(() => {});
}

export async function reklamYuvalariniDoldur(kok = document) {
  const yuvalar = [...kok.querySelectorAll('.reklam-yuvasi[data-reklam-alan]:not([data-reklam-durum])')];
  if (!yuvalar.length) return;
  yuvalar.forEach((el) => { el.dataset.reklamDurum = 'bekliyor'; el._acilis = performance.now(); });
  const modul = await modulAl();
  const yerlestir = modul && typeof modul.reklamYerlestir === 'function' ? modul.reklamYerlestir : null;
  await Promise.all(yuvalar.map(async (el) => {
    if (!yerlestir) { el.dataset.reklamDurum = 'modul-yok'; return; }
    try {
      const sira = el.dataset.reklamSira != null ? Number(el.dataset.reklamSira) : null;
      await yerlestir(el, { alan: el.dataset.reklamAlan, macId: el.dataset.macId || null, sira, gecGelirseAtla: el.dataset.reklamAlan === 'ana_akis' });
      el.dataset.reklamDurum = 'tamam';
    } catch (e) {
      el.replaceChildren();
      el.dataset.reklamDurum = 'hata';
    }
  }));
}
