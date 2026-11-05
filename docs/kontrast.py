def lum(h):
    h=h.lstrip('#'); r,g,b=[int(h[i:i+2],16)/255 for i in (0,2,4)]
    f=lambda c: c/12.92 if c<=0.04045 else ((c+0.055)/1.055)**2.4
    return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b)
def cr(a,b):
    la,lb=sorted([lum(a),lum(b)],reverse=True); return (la+0.05)/(lb+0.05)
L=dict(bg="#FFFFFF",yuzey="#F6F4F0",yuzey2="#ECE8E1",metin="#141414",soluk="#5C5A57",kirmizi="#CC0000",kirmiziKoyu="#A80000",siyah="#0B0B0B",altin="#C9A227",altinMetin="#7A5C00",reklamZemin="#FFF6DB",reklamMetin="#6B4F00",kenar="#D9D4CB",galibiyet="#1E7D3A",beraber="#5F6368")
D=dict(bg="#0B0B0B",yuzey="#161618",yuzey2="#202024",metin="#F3F1EC",soluk="#A9A6A0",kirmizi="#CC0000",kirmiziMetin="#FF6B66",altin="#C9A227",altinMetin="#E3BE55",reklamZemin="#2A2312",reklamMetin="#F0CF73",kenar="#34343A",galibiyet="#4CC074",beraber="#A9A6A0")
rows=[]
def t(mode,fg,bg,p,role,need=4.5):
    r=cr(p[fg],p[bg]); rows.append((mode,role,fg,p[fg],bg,p[bg],r,need)); 
for p,m in ((L,'Açık'),):
    for bg in ('bg','yuzey','yuzey2'):
        t(m,'metin',bg,p,'gövde metni'); t(m,'soluk',bg,p,'ikincil metin'); t(m,'kirmizi',bg,p,'kırmızı metin / bağlantı'); t(m,'kirmiziKoyu',bg,p,'koyu kırmızı metin'); t(m,'altinMetin',bg,p,'altın vurgulu metin')
    L2=dict(L,beyaz="#FFFFFF")
    t(m,'beyaz','kirmizi',L2,'buton: beyaz / kırmızı'); t(m,'beyaz','kirmiziKoyu',L2,'buton hover: beyaz / koyu kırmızı'); t(m,'beyaz','siyah',L2,'başlık çubuğu: beyaz / siyah'); t(m,'siyah','altin',L2,'altın etiket: siyah / altın'); t(m,'reklamMetin','reklamZemin',L2,'Reklam etiketi'); t(m,'beyaz','galibiyet',L2,'G rozeti: beyaz / yeşil'); t(m,'beyaz','beraber',L2,'B rozeti: beyaz / gri')
    t(m,'kirmizi','siyah',L2,'kırmızı / siyah (yalnız dekor)',3.0)
    t(m,'kenar','bg',L2,'kenarlık (dekor, eşik yok)',1.0)
for p,m in ((D,'Koyu'),):
    for bg in ('bg','yuzey','yuzey2'):
        t(m,'metin',bg,p,'gövde metni'); t(m,'soluk',bg,p,'ikincil metin'); t(m,'kirmiziMetin',bg,p,'kırmızı metin / bağlantı'); t(m,'altinMetin',bg,p,'altın vurgulu metin')
    D2=dict(D,beyaz="#FFFFFF",siyah="#0B0B0B")
    t(m,'beyaz','kirmizi',D2,'buton: beyaz / kırmızı'); t(m,'kirmizi','bg',D2,'buton zemini / sayfa (UI ≥3)',3.0); t(m,'siyah','altin',D2,'altın etiket: siyah / altın'); t(m,'reklamMetin','reklamZemin',D2,'Reklam etiketi'); t(m,'siyah','galibiyet',D2,'G rozeti: siyah / yeşil'); t(m,'siyah','beraber',D2,'B rozeti: siyah / gri')
print("| Tema | Kullanım | Ön plan | Arka plan | Oran | Eşik | Sonuç |\n|---|---|---|---|---|---|---|")
bad=0
for mode,role,fg,fh,bg,bh,r,need in rows:
    ok=r>=need; bad+= not ok
    print(f"| {mode} | {role} | `{fg}` {fh} | `{bg}` {bh} | {r:.2f}:1 | {need} | {'✅' if ok else '❌'} |")
import sys; print("\nFAIL:",bad,file=sys.stderr)
# --- ek satırlar ---
ext=[("Açık","kategori etiketi","#A80000","#FBEAEA"),("Koyu","kategori etiketi","#FF8A85","#3A1213"),
("Her iki","manşet: beyaz / degrade (en kötü: beyaz foto, %75 siyah)","#FFFFFF","#484848"),
("Her iki","manşet meta #D6D3CD / degrade en kötü","#D6D3CD","#484848"),
("Her iki","menü & alt bilgi #C9C6C0 / siyah","#C9C6C0","#0B0B0B"),
("Her iki","gol dakikası: beyaz / siyah","#FFFFFF","#0B0B0B"),
("Her iki","video süresi: beyaz / %78 siyah (beyaz kare üstü)","#FFFFFF","#4A4A4A"),
("Açık","reklam butonu: beyaz / metin rengi","#FFFFFF","#141414"),("Koyu","reklam butonu: #0B0B0B / #F3F1EC","#0B0B0B","#F3F1EC"),
("Koyu","reklam ikincil metin (soluk / reklam zemini)","#A9A6A0","#2A2312"),("Açık","reklam ikincil metin (soluk / reklam zemini)","#5C5A57","#FFF6DB"),
("Açık","Reklam etiketi / kart zemini","#6B4F00","#FFF6DB"),
("Her iki","kırmızı alt çizgi / siyah başlık (UI ≥3)","#CC0000","#0B0B0B"),
("Açık","form alanı kenarı / beyaz (UI ≥3)","#858077","#FFFFFF"),("Açık","form alanı kenarı / yüzey (UI ≥3)","#858077","#F6F4F0"),("Koyu","form alanı kenarı / zemin (UI ≥3)","#74747E","#0B0B0B"),("Koyu","form alanı kenarı / yüzey (UI ≥3)","#74747E","#161618"),
("Açık","odak halkası / beyaz (UI ≥3)","#0B57D0","#FFFFFF"),("Koyu","odak halkası / siyah (UI ≥3)","#8AB4F8","#0B0B0B")]
print("\n| Tema | Kullanım | Ön plan | Arka plan | Oran |\n|---|---|---|---|---|")
for m,r,a,b in ext: print(f"| {m} | {r} | {a} | {b} | {cr(a,b):.2f}:1 |")
# --- 013 mobil tasarım çiftleri (alt menü, haplar, sakatlık çipleri, hero/foto atfı en kötü durum) ---
# En kötü durum: yarı saydam siyah katman BEYAZ fotoğraf üstünde (ör. .70 siyah → #4D4D4D, .62 → #616161, .72 → #474747).
y013=[("Açık","alt menü edilgin / zemin","#5C5A57","#FFFFFF",4.5),("Açık","alt menü etkin / zemin","#CC0000","#FFFFFF",4.5),
("Açık","hap edilgin / hap izi","#5C5A57","#ECE8E1",4.5),("Açık","çip metni / hap izi","#141414","#ECE8E1",4.5),
("Her iki","seçili hap: beyaz / kırmızı","#FFFFFF","#CC0000",4.5),("Açık","seçili hap / hap izi (UI ≥3)","#CC0000","#ECE8E1",3.0),
("Açık","Sakat çipi","#A80000","#FBEAEA",4.5),("Açık","Cezalı / Şüpheli çipi","#7A5C00","#FFF6DB",4.5),("Açık","Döndü çipi","#1E7D3A","#E9F5EC",4.5),
("Açık","saat kutusu metni","#141414","#ECE8E1",4.5),("Açık","Sponsor etiketi / kart","#6B4F00","#FFF6DB",4.5),
("Koyu","alt menü edilgin / yüzey","#A9A6A0","#161618",4.5),("Koyu","alt menü etkin / yüzey","#FF6B66","#161618",4.5),
("Koyu","hap edilgin / hap izi (--yuzey)","#A9A6A0","#161618",4.5),("Koyu","çip metni / hap izi","#F3F1EC","#161618",4.5),
("Koyu","seçili hap / hap izi (UI ≥3)","#CC0000","#161618",3.0),("Koyu","hap izi / sayfa zemini (dekor, eşik yok)","#161618","#0B0B0B",1.0),
("Koyu","Sakat çipi","#FF8A85","#3A1213",4.5),("Koyu","Cezalı / Şüpheli çipi","#E3BE55","#2A2312",4.5),("Koyu","Döndü çipi","#4CC074","#10261A",4.5),
("Koyu","Sponsor etiketi / kart","#F0CF73","#2A2312",4.5),
("Her iki","hero başlığı: beyaz / .70 katman (beyaz foto)","#FFFFFF","#4D4D4D",4.5),("Her iki","hero meta #E4E1DB / .70 katman","#E4E1DB","#4D4D4D",4.5),
("Her iki","foto atfı: beyaz / .62 katman","#FFFFFF","#616161",4.5),("Her iki","video süresi: beyaz / .72 katman","#FFFFFF","#474747",4.5),
("Her iki","odak halkası (koyu zemin) / siyah üst bar (UI ≥3)","#8AB4F8","#0B0B0B",3.0)]
bad013=0
print("\n**013 çiftleri**\n\n| Tema | Kullanım | Ön plan | Arka plan | Oran | Eşik | Sonuç |\n|---|---|---|---|---|---|---|")
for m,r,a,b,need in y013:
    o=cr(a,b); ok=o>=need; bad013+= not ok
    print(f"| {m} | {r} | {a} | {b} | {o:.2f}:1 | {need} | {'✅' if ok else '❌'} |")
print("FAIL 013:",bad013,file=sys.stderr)
