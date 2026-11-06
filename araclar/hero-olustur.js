// Ana sayfa varsayılan hero zemini (manşetin kendi kapak fotoğrafı yoksa): kırmızı-siyah kulüp renklerinde soyut desen
// (çapraz şeritler, kırmızı ışık, projektör parıltısı). Fotoğraf ya da çizim değil: telif / atıf gerekmez.
// Çalıştırma: node araclar/hero-olustur.js → assets/img/hero-zemin-genis.svg (600 px ve üstü, 1600×640) +
// hero-zemin-dikey.svg (telefon, 800×1000). index.html <picture> ile ekrana uyanı alır: tek dosya iner (ikisi de birkaç KB).
// 020: eski tribün çizimi (dev "ÇT" pankartı) kaldırıldı. Desen başlığın olduğu yerde (genişte sol, dikeyde alt) söner: başlık hep
// düz koyu zeminde okunur; amblem ayrı <img> (net kalsın, kaldırılabilsin diye zemine gömülmez). araclar/ yayına çıkmaz.
const fs = require('fs');
const path = require('path');

function zemin({ W, H, genis }) {
  // Desenin odağı: genişte sağ (amblem orada), dikeyde üst
  const ox = genis ? W * 0.74 : W * 0.6, oy = genis ? H * 0.42 : H * 0.26;
  const R = genis ? W * 0.5 : H * 0.62;
  const serit = genis ? 92 : 70;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice">
<title>Kırmızı-siyah</title>
<defs>
<linearGradient id="taban" x1="0" y1="0" x2="${genis ? 1 : 0}" y2="1"><stop offset="0" stop-color="#0B0B0B"/><stop offset=".6" stop-color="#140708"/><stop offset="1" stop-color="#0B0B0B"/></linearGradient>
<pattern id="serit" width="${serit * 2}" height="${serit * 2}" patternUnits="userSpaceOnUse" patternTransform="rotate(-24)"><rect width="${serit}" height="${serit * 2}" fill="#C00000"/></pattern>
<radialGradient id="odak" gradientUnits="userSpaceOnUse" cx="${f(ox)}" cy="${f(oy)}" r="${f(R)}"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".45" stop-color="#fff" stop-opacity=".5"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
<mask id="maske" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="url(#odak)"/></mask>
<radialGradient id="isik" gradientUnits="userSpaceOnUse" cx="${f(ox)}" cy="${f(oy)}" r="${f(R * 0.95)}"><stop offset="0" stop-color="#E01010" stop-opacity=".55"/><stop offset=".6" stop-color="#8A0000" stop-opacity=".22"/><stop offset="1" stop-color="#8A0000" stop-opacity="0"/></radialGradient>
<radialGradient id="parilti" gradientUnits="userSpaceOnUse" cx="${f(W * (genis ? 0.9 : 0.85))}" cy="0" r="${f(genis ? W * 0.32 : H * 0.42)}"><stop offset="0" stop-color="#FF5A4A" stop-opacity=".16"/><stop offset="1" stop-color="#FF5A4A" stop-opacity="0"/></radialGradient>
<linearGradient id="perde" x1="0" y1="${genis ? 0 : 0}" x2="${genis ? 1 : 0}" y2="${genis ? 0 : 1}">${genis
    ? '<stop offset="0" stop-color="#0B0B0B" stop-opacity=".92"/><stop offset=".38" stop-color="#0B0B0B" stop-opacity=".55"/><stop offset=".62" stop-color="#0B0B0B" stop-opacity="0"/>'
    : '<stop offset=".45" stop-color="#0B0B0B" stop-opacity="0"/><stop offset=".75" stop-color="#0B0B0B" stop-opacity=".75"/><stop offset="1" stop-color="#0B0B0B" stop-opacity=".95"/>'}</linearGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#taban)"/>
<rect width="${W}" height="${H}" fill="url(#isik)"/>
<rect width="${W}" height="${H}" fill="url(#serit)" mask="url(#maske)" opacity=".72"/>
<rect width="${W}" height="${H}" fill="url(#parilti)"/>
<path d="M${genis ? f(W * 0.46) : 0} ${H} L${genis ? f(W * 0.86) : f(W * 0.9)} 0" stroke="#FFFFFF" stroke-opacity=".08" stroke-width="2"/>
<rect width="${W}" height="${H}" fill="url(#perde)"/>
</svg>
`;
}
const f = (n) => Math.round(n);

const klasor = process.argv[2] || path.join(__dirname, '..', 'assets', 'img');
for (const [ad, ayar] of [['hero-zemin-genis.svg', { W: 1600, H: 640, genis: true }], ['hero-zemin-dikey.svg', { W: 800, H: 1000, genis: false }]]) {
  const svg = zemin(ayar);
  fs.writeFileSync(path.join(klasor, ad), svg);
  console.log(ad, (Buffer.byteLength(svg) / 1024).toFixed(1) + ' KB');
}
