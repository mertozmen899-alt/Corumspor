// Reklam yuvası yükleyici.
// Sayfadaki <div class="reklam-yuvasi" data-reklam-alan="..."> öğelerini bulur,
// ./reklam/reklam.js modülünü yükler, ona uygulamanın TEK supabase istemcisini verir
// (reklamIstemciAyarla; ?sahte=1 test modunda sahte istemci) ve her yuva için
//   reklamYerlestir(el, { alan, macId })
// çağırır. Modül yüklenemezse ya da hata verirse sessizce hiçbir şey yapmaz:
// reklamın bozulması sayfayı asla bozmaz. data-reklam-durum: modul-yok | hata | tamam.
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

export async function reklamYuvalariniDoldur(kok = document) {
  const yuvalar = [...kok.querySelectorAll('.reklam-yuvasi[data-reklam-alan]:not([data-reklam-durum])')];
  if (!yuvalar.length) return;
  yuvalar.forEach((el) => { el.dataset.reklamDurum = 'bekliyor'; });
  const modul = await modulAl();
  const yerlestir = modul && typeof modul.reklamYerlestir === 'function' ? modul.reklamYerlestir : null;
  await Promise.all(yuvalar.map(async (el) => {
    if (!yerlestir) { el.dataset.reklamDurum = 'modul-yok'; return; }
    try {
      await yerlestir(el, { alan: el.dataset.reklamAlan, macId: el.dataset.macId || null });
      el.dataset.reklamDurum = 'tamam';
    } catch (e) {
      el.replaceChildren();
      el.dataset.reklamDurum = 'hata';
    }
  }));
}
