// Tema (açık / koyu). Varsayılan: cihazın tercihi (prefers-color-scheme).
// Ziyaretçi üst bardaki düğmeyle seçerse <html data-theme="light|dark"> olur ve seçim bu tarayıcıda
// hatırlanır (localStorage 'tema'; kişisel veri değil, sunucuya gitmez).
// Sayfa çizilmeden önce çalışsın diye <head> içinde defer'siz yüklenir (renk sıçraması olmaz).
(function () {
  var kok = document.documentElement;
  try { var t = localStorage.getItem('tema'); if (t === 'light' || t === 'dark') kok.setAttribute('data-theme', t); } catch (e) {}
  function koyuMu() {
    var t = kok.getAttribute('data-theme');
    if (t) return t === 'dark';
    return !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  }
  document.addEventListener('DOMContentLoaded', function () {
    var d = document.getElementById('tema-dugme');
    if (!d) return;
    function yaz() {
      var koyu = koyuMu();
      d.setAttribute('aria-pressed', String(koyu));
      d.setAttribute('aria-label', koyu ? 'Açık temaya geç' : 'Koyu temaya geç');
      d.title = d.getAttribute('aria-label');
    }
    yaz();
    d.addEventListener('click', function () {
      var yeni = koyuMu() ? 'light' : 'dark';
      kok.setAttribute('data-theme', yeni);
      try { localStorage.setItem('tema', yeni); } catch (e) {}
      yaz();
    });
  });
})();
