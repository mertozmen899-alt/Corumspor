// Ana sayfa varsayılan görseli: kırmızı-siyah tribün (özgün çizim, fotoğraf değil; telif sorunu yok).
// Çalıştırma: node araclar/hero-olustur.js  → assets/img/tribun-kirmizi-siyah.svg (yayına çıkmaz; yalnız çıktısı çıkar)
const fs = require('fs');
const W = 1280, H = 720;
let tohum = 11;
const r = () => (tohum = (tohum * 16807) % 2147483647) / 2147483647; // deterministik
const f = (n) => Math.round(n);

// Kalabalık: kırmızı dumanın önünde siluetler. Sıralar alttan yukarı; uzak sıra küçük ve biraz açık (hava perspektifi)
const SIRA = 8;
const katmanlar = [];
for (let i = SIRA - 1; i >= 0; i--) {
  const taban = 720 - i * 40;
  const s = 1 - i * 0.07;
  const k = 13 * s;                      // kafa yarıçapı
  const ara = 31 * s;
  const ton = 8 + i * 3;                 // yakın sıra en koyu
  let govde = '', atki = '';
  for (let x = -30 + (i % 2) * ara / 2; x < W + 30; x += ara * (0.8 + r() * 0.4)) {
    const kalk = r() < 0.12;             // ayağa kalkmış / zıplayan
    const y = taban - k * (2.6 + r() * 0.8) - (kalk ? 10 * s : 0);
    // kafa + omuzlar (aşağı doğru taşar, alt sıra örter)
    govde += `M${f(x)} ${f(y - k)}a${k.toFixed(1)} ${k.toFixed(1)} 0 1 0 .1 0zM${f(x - k * 1.7)} ${f(taban + 30)}V${f(y + k * 1.6)}q0-${f(k * 0.7)} ${f(k * 0.9)}-${f(k * 0.7)}h${f(k * 1.6)}q${f(k * 0.9)} 0 ${f(k * 0.9)} ${f(k * 0.7)}V${f(taban + 30)}z`;
    const orta = 1 - Math.abs(x - W / 2) / (W / 2);
    const p = r();
    if (p < 0.16 + orta * 0.18) {
      // havaya kaldırılmış atkı: kırmızı-beyaz çizgili dikey şerit, kolla birlikte
      const ah = 58 * s, aw = 13 * s, ax = x + k * 0.6, ay = y - k - ah;
      const aci = ((r() - 0.5) * 20).toFixed(0);
      atki += `<g transform="rotate(${aci} ${f(ax)} ${f(y)})"><rect x="${f(ax - 2 * s)}" y="${f(ay + ah - 4)}" width="${(4 * s).toFixed(1)}" height="${f(k * 1.6)}" fill="rgb(${ton} ${ton} ${ton})"/><rect x="${f(ax - aw / 2)}" y="${f(ay)}" width="${aw.toFixed(1)}" height="${f(ah)}" fill="url(#atki)"/></g>`;
    } else if (p > 0.965) {
      // iki elle gerilmiş yatay atkı
      const aw = 70 * s, ah = 11 * s;
      atki += `<rect x="${f(x - aw / 2)}" y="${f(y - k * 2.4)}" width="${f(aw)}" height="${ah.toFixed(1)}" fill="url(#atkiy)"/>`;
    }
  }
  katmanlar.push(`<rect x="0" y="${f(taban - k * 6)}" width="${W}" height="${f(k * 5)}" fill="url(#arka)" opacity="${(0.9 - i * 0.06).toFixed(2)}"/><g>${atki}<path d="${govde}" fill="rgb(${ton} ${f(ton * 0.75)} ${f(ton * 0.75)})"/></g>`);
}

// Meşale: parlak çekirdek + turuncu-kırmızı hale (çekirdek küçük, ışık geniş)
const mesale = (x, y, s) => `<circle cx="${x}" cy="${y}" r="${f(260 * s)}" fill="url(#hale)"/><circle cx="${x}" cy="${y}" r="${f(60 * s)}" fill="url(#cekirdek)"/>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice">
<title>Kırmızı-siyah tribün</title>
<defs>
<linearGradient id="gok" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#060606"/><stop offset=".45" stop-color="#140305"/><stop offset="1" stop-color="#2A0507"/></linearGradient>
<radialGradient id="isik" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FFF4DC" stop-opacity=".45"/><stop offset="1" stop-color="#FFF4DC" stop-opacity="0"/></radialGradient>
<radialGradient id="duman" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#E0201A" stop-opacity=".85"/><stop offset=".5" stop-color="#A30C0C" stop-opacity=".45"/><stop offset="1" stop-color="#7A0606" stop-opacity="0"/></radialGradient>
<radialGradient id="hale" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FF7A2E" stop-opacity=".9"/><stop offset=".3" stop-color="#E8331A" stop-opacity=".55"/><stop offset="1" stop-color="#CC0000" stop-opacity="0"/></radialGradient>
<radialGradient id="cekirdek" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FFFDF4"/><stop offset=".25" stop-color="#FFE08A"/><stop offset=".6" stop-color="#FF8A2E" stop-opacity=".6"/><stop offset="1" stop-color="#FF5A1F" stop-opacity="0"/></radialGradient>
<pattern id="serit" width="64" height="64" patternUnits="userSpaceOnUse"><rect width="32" height="64" fill="#CC0000"/><rect x="32" width="32" height="64" fill="#0B0B0B"/></pattern>
<pattern id="atki" width="10" height="16" patternUnits="userSpaceOnUse"><rect width="10" height="8" fill="#D40000"/><rect y="8" width="10" height="8" fill="#F4F1EA"/></pattern>
<pattern id="atkiy" width="16" height="10" patternUnits="userSpaceOnUse"><rect width="8" height="10" fill="#D40000"/><rect x="8" width="8" height="10" fill="#111"/></pattern>
<linearGradient id="arka" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#B3120E" stop-opacity="0"/><stop offset=".6" stop-color="#B3120E" stop-opacity=".55"/><stop offset="1" stop-color="#B3120E" stop-opacity="0"/></linearGradient>
<linearGradient id="kivrim" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".45"/><stop offset=".5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></linearGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#gok)"/>
<circle cx="110" cy="30" r="300" fill="url(#isik)"/><circle cx="1170" cy="30" r="300" fill="url(#isik)"/>
${[110, 1170].map((x) => `<g fill="#FFF8E6">${[-36, -12, 12].map((d) => `<rect x="${x + d}" y="16" width="20" height="12" rx="2"/>`).join('')}${[-36, -12, 12].map((d) => `<rect x="${x + d}" y="32" width="20" height="12" rx="2"/>`).join('')}</g>`).join('')}
<!-- tifo: kırmızı-siyah şeritli dev pankart ve özgün ÇT işareti (Çorum FK amblemi değildir) -->
<g transform="translate(640 205)">
<path d="M-560 -125 Q0 -158 560 -125 L560 125 Q0 100 -560 125 Z" fill="url(#serit)"/>
<path d="M-560 -125 Q0 -158 560 -125 L560 125 Q0 100 -560 125 Z" fill="url(#kivrim)"/>
<g transform="scale(1.05) translate(-100 -100)">
<circle cx="100" cy="100" r="99" fill="#0B0B0B"/>
<circle cx="100" cy="100" r="94" fill="#CC0000"/>
<circle cx="100" cy="100" r="85" fill="none" stroke="#FFFFFF" stroke-width="7" stroke-dasharray="4 14.5"/>
<circle cx="100" cy="100" r="74" fill="#0B0B0B"/>
<path d="M93 71 A32 32 0 1 0 93 125" fill="none" stroke="#FFFFFF" stroke-width="15"/>
<path d="M77 133 L73 142 Q83 142 82 148 Q81 154 72 153" fill="none" stroke="#FFFFFF" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
<rect x="101" y="64" width="54" height="15" fill="#FFFFFF"/><rect x="120.5" y="64" width="15" height="67" fill="#FFFFFF"/>
<path d="M152 90 L142 108 H150 L145 124 L161 102 H153 L158 90 Z" fill="#C9A227"/>
</g>
</g>
<!-- meşale dumanı: kalabalığın arkasında kırmızı ışık -->
<ellipse cx="240" cy="470" rx="420" ry="190" fill="url(#duman)"/><ellipse cx="1040" cy="480" rx="430" ry="200" fill="url(#duman)"/><ellipse cx="640" cy="520" rx="380" ry="150" fill="url(#duman)" opacity=".7"/>
${mesale(230, 420, 0.9)}${mesale(1050, 435, 1)}
${katmanlar.join('\n')}
${mesale(420, 575, 0.75)}${mesale(860, 600, 0.7)}
</svg>
`;
const cikti = process.argv[2] || require('path').join(__dirname, '..', 'assets', 'img', 'tribun-kirmizi-siyah.svg');
fs.writeFileSync(cikti, svg);
console.log(cikti, (Buffer.byteLength(svg) / 1024).toFixed(1) + ' KB');
