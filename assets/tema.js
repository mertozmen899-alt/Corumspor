// Tema (açık / koyu). Varsayılan: cihazın tercihi (prefers-color-scheme).
// Ziyaretçi Profil › Görünüm'deki radyo düğmeleriyle (input[name="tema"]: sistem | light | dark) seçerse
// <html data-theme="light|dark"> olur ve seçim bu tarayıcıda hatırlanır (localStorage 'tema'; kişisel veri değil, sunucuya gitmez).
// "Cihaz ayarı" seçilince kayıt silinir. Sayfa çizilmeden önce çalışsın diye <head> içinde defer'siz yüklenir (renk sıçraması olmaz).
(function () {
  var kok = document.documentElement;
  try { var t = localStorage.getItem('tema'); if (t === 'light' || t === 'dark') kok.setAttribute('data-theme', t); } catch (e) {}
  // Sayfa geçişinin yönü (stil.css 28. bölüm): geçmişte geri → "geri" (soldan), ayrıntı sayfasına giriş ya da ileri → "ileri" (sağdan),
  // öbür geçişler yalnız solma. pagereveal ilk çizimden önce gelir: bu yüzden modülde değil, burada (head, defer'siz).
  addEventListener('pagereveal', function (e) {
    var a = window.navigation && navigation.activation;
    if (!e.viewTransition || !a || !e.viewTransition.types) return;
    var tur = null;
    if (a.navigationType === 'traverse' && a.from && a.entry) tur = a.entry.index < a.from.index ? 'geri' : 'ileri';
    else if (a.navigationType === 'push' && /\/(haber|mac|gol|oyuncu)(\.html)?$/.test(location.pathname)) tur = 'ileri';
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
