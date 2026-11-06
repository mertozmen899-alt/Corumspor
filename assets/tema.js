// Tema (açık / koyu). Varsayılan: cihazın tercihi (prefers-color-scheme).
// Ziyaretçi Profil › Görünüm'deki radyo düğmeleriyle (input[name="tema"]: sistem | light | dark) seçerse
// <html data-theme="light|dark"> olur ve seçim bu tarayıcıda hatırlanır (localStorage 'tema'; kişisel veri değil, sunucuya gitmez).
// "Cihaz ayarı" seçilince kayıt silinir. Sayfa çizilmeden önce çalışsın diye <head> içinde defer'siz yüklenir (renk sıçraması olmaz).
(function () {
  var kok = document.documentElement;
  try { var t = localStorage.getItem('tema'); if (t === 'light' || t === 'dark') kok.setAttribute('data-theme', t); } catch (e) {}
  // 022: siteye dışarıdan ilk giriş (adres çubuğu, ana ekran simgesi, başka site): üst bar ve alt menü kayarak gelir (stil.css 34. bölüm).
  // Site içi gezinmede gelmez (çubuklar sayfalar arasında yerinde kalır).
  try { if (!document.referrer || new URL(document.referrer).origin !== location.origin) kok.classList.add('ilk-acilis'); } catch (e) {}
  // Sayfa geçişinin yönü (stil.css 28. bölüm): geçmişte geri → "geri", ayrıntı sayfasına giriş ya da ileri → "ileri" (yeni sayfa sağdan
  // iter); alt menü bölümleri arasında (Ana Sayfa · Gol Arşivi · Takım · Profil) sıraya göre "bolum-ileri" / "bolum-geri" (kısa kayma).
  // pagereveal ilk çizimden önce gelir: bu yüzden modülde değil, burada (head, defer'siz).
  var BOLUM = { '': 0, index: 0, goller: 1, takim: 2, profil: 3 };
  var bolumSirasi = function (u) {
    try { var m = /\/([a-z]*?)(?:\.html)?$/.exec(new URL(u, location.href).pathname); return m && m[1] in BOLUM ? BOLUM[m[1]] : null; } catch (x) { return null; }
  };
  addEventListener('pagereveal', function (e) {
    var a = window.navigation && navigation.activation;
    if (!e.viewTransition || !a || !e.viewTransition.types) return;
    var tur = null;
    if (a.navigationType === 'traverse' && a.from && a.entry) tur = a.entry.index < a.from.index ? 'geri' : 'ileri';
    else if (a.navigationType === 'push' && /\/(haber|mac|gol|oyuncu)(\.html)?$/.test(location.pathname)) tur = 'ileri';
    else if (a.from && a.from.url) {
      var o = bolumSirasi(a.from.url), y = bolumSirasi(location.href);
      if (o !== null && y !== null && o !== y) tur = y > o ? 'bolum-ileri' : 'bolum-geri';
    }
    if (tur) e.viewTransition.types.add(tur);
  });
  document.addEventListener('DOMContentLoaded', function () {
    var radyolar = document.querySelectorAll('input[name="tema"]');
    if (!radyolar.length) return;
    var secili = kok.getAttribute('data-theme') || 'sistem';
    for (var i = 0; i < radyolar.length; i++) {
      radyolar[i].checked = radyolar[i].value === secili;
      radyolar[i].addEventListener('change', function (e) {
        var v = e.target.value;
        if (v === 'light' || v === 'dark') {
          kok.setAttribute('data-theme', v);
          try { localStorage.setItem('tema', v); } catch (x) {}
        } else {
          kok.removeAttribute('data-theme');
          try { localStorage.removeItem('tema'); } catch (x) {}
        }
      });
    }
  });
})();
