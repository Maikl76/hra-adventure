# Zadání obrázků: GSPORT – Skokanská aréna (LEVEL 2)

Až budou hotové vaše obrázky, vyměním je za zástupné kresby a doladím klikací plochy i světla.
Platí stejná pravidla jako u herny.

**Stav (14. 10. 2026):**
- Hotovo (vaše obrázky jsou ve hře): **všechny čtyři strany místnosti** – automat JUMP, neonová
  střelnice, stěna s ryskami a dveře LEVEL 2.
  - Varianty měly každá trochu jiný záběr, takže jsem z nich vrstvy poskládal po částech:
    displej „9.0 V“ a baterii, zástrčku (kabel k ní dokreslený), otevřené dveře (chodba a křídlo
    napasované do rámu), otevřenou skříňku na stěně a mezeru po knize.
  - Obrázky střelnice a otevřené skříňky byly 4 : 3 – střelnici jsem ořízl na 16 : 9 (zůstala
    neonová trubice nahoře, spodek automatu je uříznutý), ze skříňky stačil výřez.
  - Dohraný NEON AIM: obrazovku s HOTOVO a rozsvícené okénko jsem z vašeho obrázku napasoval
    do automatu (obrazovku po stranách mírně oříznutou, aby terče zůstaly kulaté).
  - Dokreslil jsem sám: čísla a docentovy křídové značky na desce (sedí na vaše rysky po 2 cm)
    a zapnutý automat JUMP (text na obrazovce, svítící stupnici).
- Ikony konektoru, baterie a knihy Fyzika skoku a obrázek do knihy zůstávají moje (autor je
  ponechal, 14. 10. 2026).
- Tip pro varianty: nejlépe nechat generátor **upravit stejný obrázek** (jedna změna), ne
  vygenerovat nový – pak varianta sedí na pixel a vrstva se z ní vyřízne celá. A vždy 16 : 9.

## Styl

Stejný svět jako herna (LEVEL 1): stará budova fakulty, noc, přítmí. Tady **stará skokanská
laboratoř předělaná na arkádu**: tmavé stěny, dřevěné obložení do půlky výšky, opotřebované
parkety, arkádové automaty a **neonová světla** (tyrkysová a růžová). Je tu ticho a je to
tísnivé. Nic krvavého.

Neonové terče na obrazovce NEON AIM ani čísla na stupnici nekreslete – hra je animuje sama.

## Společná pravidla

- **Rozměr 1672 × 941 px**, formát WebP, PNG nebo JPG.
- **Varianty jednoho pohledu musí mít úplně stejný záběr.** Liší se jen tím, co se změnilo.
  Vrstvy z nich vyříznu sám.
- **Nekreslete text, na kterém záleží** (čísla, nápisy na displejích, cedulky, štítky, rysky
  s čísly). Generátory písmo komolí. Plochy nechte prázdné, texty doplním do hry.
- Nekreslete loga skutečných značek (automaty, herní periferie, VR brýle).
- Obrázek může být normálně světlý. Tmu a světla přidává hra.

## Místnost má 4 strany (otáčí se šipkami doprava)

Automat JUMP → Neonová střelnice → Stěna s ryskami → Dveře LEVEL 2 → zpět k automatu JUMP.
Kabel od kontaktní desky vede po zemi **doleva** k malému měřiči.

Souřadnice jsou v pixelech obrázku (x zleva, y shora). Rozmístění nemusí sedět přesně –
klikací plochy posunu.

### 1. Automat JUMP (sem hráč přijde)

| Předmět | Přibližně kde | Poznámka |
|---|---|---|
| Obrazovka žebříčku na zdi | x 90–330, y 180–360 | prázdná |
| Malý šedý měřič na stoličce | x 380–520, y 560–700 | displej x 400–500, y 580–620 (černý); **prázdná šachta na baterii** x 400–440, y 640–690; zdířka na konektor vpravo |
| Kabel od desky, volný konec **bez konektoru** leží na zemi | od desky (x ≈ 560, y 880) pod měřič (x ≈ 470, y 770) | |
| Vysoký arkádový automat se třemi tlačítky | x 700–980, y 160–820 | horní cedule x 700–980, y 160–240 bez nápisu; obrazovka x 735–945, y 260–420 tmavá |
| Malá kamera na střeše automatu | x 815–865, y 128–160 | |
| Vysoká svislá neonová stupnice (zhasnutá) | x 1010–1050, y 200–800 | čísla doplním |
| Kontaktní deska na podlaze: černá gumová podložka se žlutým okrajem | x 530–1150, y 840–915 | |
| Křídová tabule rekordů | x 1180–1520, y 180–420 | prázdná |
| Herní křeslo, přes opěradlo ručník | x 1240–1520, y 520–840 | |
| Neonová lišta pod stropem | x 300–1370, y 40–48 | |

Varianty: **a)** výchozí, **b)** kabel zapojený do měřiče (konektor ve zdířce), **c)** v měřiči
je baterie a displej svítí zeleně (bez textu), **d)** b + c a navíc automat zapnutý – svítí
obrazovka, horní cedule i stupnice (bez textu a čísel).

### 2. Neonová střelnice

| Předmět | Přibližně kde | Poznámka |
|---|---|---|
| Plakát: velký terč blízko, malý terč daleko, čárkovaná dráha pohybu | x 150–430, y 180–560 | nadpis RYCHLOST × PŘESNOST doplním |
| Velký automat NEON AIM s dotykovou obrazovkou | x 520–1150, y 120–820 | horní cedule x 520–1150, y 120–190 bez nápisu; obrazovka x 570–1100, y 210–560 tmavá |
| Výdejní okénko na výhry (dvířka s lamelami) | x 760–910, y 620–700 | |
| Stará police s přístroji: osciloskop, krabička, kabely | x 1250–1560, y 250–700 | |
| Neonová lišta pod stropem | x 120–1550, y 40–48 | |

Varianta: **b)** automat dohraný – obrazovka a horní cedule svítí tyrkysově (bez textu),
výdejní okénko je zevnitř nasvícené.

### 3. Stěna s ryskami (nejdůležitější obrázek)

| Předmět | Přibližně kde | Poznámka |
|---|---|---|
| **Vysoká dřevěná deska s ryskami** (měření výskoku „jump and reach“) | x 260–400, y 60–620 | **přesně svisle a rovnoměrně**: 200 cm dole (y 600), 280 cm nahoře (y 80); rysky klidně kreslete, čísla ne |
| Plechová skříňka s malým číselníkem | x 520–760, y 220–520 | číselník vpravo x 690–746, y 330–410 |
| Police s knihami | x 860–1260, y 180–560 | 4 police |
| **Jedna kniha s tmavým hřbetem a svítící zelenou páskou** | x 1010–1040, y 276–360 | druhá police shora |
| Basketbalový automat: deska s košem, pod ní rampa s míči | x 1320–1600, y 120–820 | |

Čísla na desce a docentovy křídové značky (dosah ve stoje 221 cm a ve výskoku 252 cm)
doplňuji sám – hráč z nich počítá kód skříňky, takže musí sedět přesně na rysky.

Varianty: **a)** výchozí, **b)** skříňka otevřená (dvířka doleva, uvnitř prázdná police),
**c)** svítící kniha chybí (mezera v polici).

### 4. Dveře LEVEL 2

| Předmět | Přibližně kde | Poznámka |
|---|---|---|
| Kovové dveře v neonovém rámu | x 600–1070, y 110–830 | |
| Neonový nápis nad dveřmi | x 600–1070, y 40–100 | prázdný, LEVEL 2 doplním |
| Číselník vedle dveří | x 1110–1190, y 400–520 | displej prázdný |
| Monitor na zdi | x 160–460, y 220–420 | obrazovka prázdná |
| Věšák: VR brýle a mikina | x 1280–1420, y 290–540 | |
| Žlutočerná páska na podlaze před dveřmi | x 520–1150, y 850–915 | nápis JUMP ZONE doplním |

Varianta: **b)** dveře otevřené – za nimi tmavá chodba, na jejím konci malá svítící obrazovka
(bez textu).

## Lekačky (nepovinné)

LEVEL 2 zatím žádnou lekačku nemá. Jestli chcete, navrhuji tři. Zapojím je, až budou
obrázky. Pravidla jsou stejná jako u herny: velký detail přes celý obraz, tvrdé světlo,
hodně tmy, žádná krev. Rozměr 1672 × 941 px, střed obrazu musí fungovat i na úzkém displeji.

| Soubor | Kdy | Co je na obrázku |
|---|---|---|
| `jump` | automat JUMP se poprvé rozsvítí | obrazovka automatu zrní a v šumu je obličej kostry se sluchátky přitisknutý na sklo |
| `okenko` | hráč sahá do výdejního okénka NEON AIM pro konektor | z okénka vystřelí kostěná ruka, nasvícená zespodu neonem |
| `chodba2` | po otevření dveří LEVEL 2 | z tmavé chodby se řítí kostra s VR brýlemi na lebce, ruce natažené k hráči |

Během samotného měření (výskok, terče) lekačka nebude – kazila by výsledky.

## Zvlášť (nejsou součástí místnosti)

- **Ikony předmětů** (čtverec, např. 256 × 256 px, průhledné pozadí): kovový kulatý konektor
  s pěti kolíky, baterie 9 V (nálepka bez textu), tenká kniha s tmavou vazbou a svítící
  zelenou páskou.
- Obrázek do knihy (parabola letu: odraz, nejvyšší bod, dopad, dvakrát t/2) může zůstat můj.

## Návrh zadání pro generátor obrázků (anglicky)

Společný začátek pro všechny pohledy:

> Old university jump-testing laboratory turned into a neon arcade at night, dark walls,
> wooden wainscoting, worn parquet floor, retro arcade cabinets, cyan and magenta neon
> accents, eerie and quiet atmosphere, no people, no text, no logos, stylised digital
> illustration in the same style as the previous rooms, 16:9.

Pak pro každý pohled jeho obsah, například:

> …front view of a tall retro arcade cabinet with a dark screen and three buttons, a small
> webcam on top, a black rubber contact mat with a yellow border on the floor in front of it,
> a loose cable from the mat lying on the floor next to a small grey measuring box on a stool
> on the left, a tall unlit vertical neon scale on the right, an empty chalk record board and
> a gaming chair with a towel on the right, an empty leaderboard screen on the left wall.

Pro varianty pak stačí požádat o stejný obrázek s jednou změnou, například
*„the same image, but the arcade screen and the neon scale are glowing“*.
