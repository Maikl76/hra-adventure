# Zadání obrázků: Vojenská tělovýchova – Pěchotní srub (Brána V)

Až budou hotové vaše obrázky, vyměním je za zástupné kresby a doladím klikací plochy.
Platí stejná pravidla jako u střelnice a nočního cvičiště.

**Stav (3. 11. 2026):** čtyři pohledy, dvě vrstvy (vzatá příručka, otevřená brána) a ikona příručky
jsou zástupné kresby (SVG → WebP). **Kresby uvnitř aktivit** (páka na loket, pohled shora na
chodidla, hod přes bok, pád vzad) kreslí hra sama postavami z `js/postava.js` – ty nenahrazujte,
jinak by nesouhlasila čísla (úhly, těžiště, výšky).

Vyzkoušet: <https://maikl76.github.io/hra-adventure/?mistnost=srub>

## Styl

Horní patro starého **pěchotního srubu** (betonový bunkr z 30. let) přestavěné na tělocvičnu boje
zblízka: hrubý beton se spárami po bednění, ocelové nosníky pod stropem, žárovky v ochranných
mřížkách, na podlaze **modré žíněnky**. Teplé umělé světlo, venku zataženo (bouřka se blíží).
Žádné zbraně, nikdo se nepere. Žádné skutečné vojenské znaky ani loga.

Postavy (stejné jako v kresbách aktivit):
- **Rtn. Doubek** – voják asi 37 let v olivové polní uniformě a polní čepici, **levá ruka v šátku**
  (zranil ho svalovec v chodbě), sedí na lavici.
- **Svob. Kratochvíl** – mladý voják v modrošedé cvičební blůze, krátké tmavé vlasy, klečí na
  žíněnce a **natahuje pravou ruku dopředu dlaní vzhůru**.
- **Svob. Hanák** – mladý voják, 180 cm, 80 kg, modrošedá blůza, hnědé vlasy, stojí rovně na
  tlusté pádové žíněnce čelem k hráči.

## Společná pravidla

- **Rozměr 1672 × 941 px**, formát WebP, PNG nebo JPG.
- **Varianty jednoho pohledu musí mít úplně stejný záběr.** Liší se jen tím, co se změnilo.
- **Nekreslete text, na kterém záleží** (rozpis výcviku, plakát BEZPEČNOST NA ŽÍNĚNCE, tabule,
  směrovka, displej číselníku, váha). Plochy nechte prázdné nebo s nečitelným písmem, texty
  doplním do hry. Velké V na bráně a šablonový nápis na zdi klidně nakreslete.
- Obrázek může být normálně světlý. Tmu a blesky přidává hra.

## Místnost má 4 strany (otáčí se šipkami doprava)

Žíněnky (sem hráč přijde) → Pádová žíněnka → Stěna s policí → Brána V → zpět.

Souřadnice jsou v pixelech obrázku (x zleva, y shora). Rozmístění nemusí sedět přesně –
klikací plochy posunu.

### 1. Žíněnky (`srub_zinenky`)

| Předmět | Přibližně kde | Poznámka |
|---|---|---|
| Střílna v zadní zdi, zavřená pancéřovou deskou | x 690–990, y 230–380 | |
| Rozpis výcviku připíchnutý na zdi | x 1080–1240, y 240–430 | **prázdný** list |
| Šablonový nápis SRUB 5 · TĚLOCVIČNA | x 110–560, y 270–310 | může být |
| Modré žíněnky na podlaze | dolní třetina | |
| Svob. Kratochvíl klečí, pravá ruka natažená dlaní vzhůru | x 470–900, y 460–840 | |
| Rtn. Doubek na lavici, levá ruka v šátku | x 1210–1560, y 300–690 | |
| Vak s výstrojí (chrániče) | x 100–300, y 650–790 | |

### 2. Pádová žíněnka (`srub_pady`)

| Předmět | Přibližně kde | Poznámka |
|---|---|---|
| Šablonový nápis NEJDŘÍV SE NAUČ PADAT | x 150–790, y 200–250 | může být |
| Tlustá (20 cm) zelená pádová žíněnka | x 360–1250, y 640–850 | |
| Svob. Hanák stojí na žíněnce čelem k hráči | x 720–890, y 255–725 | |
| Měřítko výšky 0–2 m namalované na zdi | x 1200–1330, y 140–570 | čísla **nekreslete**, jen dílky; červená čárka u 1 m |
| Hasicí přístroj | x 1460–1530, y 400–565 | |

### 3. Stěna s policí (`srub_stena`)

| Předmět | Přibližně kde | Poznámka |
|---|---|---|
| Police s knihami | x 260–780, y 220–380 | |
| **Zelená Příručka boje zblízka** stojící na polici | x 486–558, y 222–332 | výrazná, hráč ji sebere |
| Lékárnička (bílý kříž na **zeleném**, ne červený kříž) | x 150–280, y 420–520 | |
| Plakát BEZPEČNOST NA ŽÍNĚNCE | x 850–1130, y 180–530 | **prázdný** |
| Školní tabule s křídovým náčrtkem páky | x 1180–1580, y 200–500 | náčrtek klidně, vzorec ne |
| Lavice u zdi | x 300–860, y 650–760 | |
| Osobní váha na podlaze | x 1050–1270, y 740–800 | displej **prázdný** |

**Varianta (stejný záběr):** a) **police bez příručky** (mezera mezi knihami).

### 4. Brána V (`srub_brana`)

| Předmět | Přibližně kde | Poznámka |
|---|---|---|
| Pancéřové dveře s velkým V, nýty, klika | x 600–1080, y 140–580 | dole končí u podlahy |
| Číselník s klávesnicí vedle dveří | x 1110–1200, y 300–430 | displej **prázdný** |
| Směrovka (nahoru ke zvonu, dolů do tvrze) | x 1250–1520, y 200–370 | **prázdná** |
| Periskop – ocelová trubka ze stropu s okuláry | x 270–400, y 0–480 | |
| Schody dolů do tvrze | x 60–240, y 660–941 | |
| Modré žíněnky před bránou | dolní část | |

**Varianta (stejný záběr):** a) **otevřená brána** – dveře odsunuté, za nimi světlé betonové
schodiště nahoru k pozorovacímu zvonu, číselník svítí zeleně.

## Ikona

- `assets/items/prirucka_boje.svg` (nebo PNG 128 × 128): zelená knížka s jednoduchým symbolem
  páky (trojúhelník a břevno).
