# Zadání obrázků: Vojenská tělovýchova – Výstrojní sklad (Brána I)

Až budou hotové vaše obrázky, vyměním je za zástupné kresby a doladím klikací plochy i světla.
Platí stejná pravidla jako u kabinetu a herny.

**Stav (12. 10. 2026):**
- Hotovo (vaše obrázky jsou ve hře): pancéřové dveře, detail měření na figuríně, ikony metru a příručky.
- Zbývá: výdejní pult, regály, figurína a varianty se stejným záběrem (vysunutý šuplík, otevřená skříňka, otevřené dveře). Zatím pro ně běží moje zástupné kresby (`assets/rooms/sklad_*.svg`).

## Styl

Stejný svět jako anatomický kabinet: stará budova fakulty, noc, přítmí. Tady **suterénní sklad
výstroje**: betonové stěny natřené do olivova, kovové regály, plechové skříňky, dřevěné bedny,
brezent. Svítí jediná žárovka pod stropem a stolní lampa na pultu. Žádné zbraně ani munice,
nic krvavého – atmosféru dělá ticho a tma.

## Společná pravidla

- **Rozměr 1672 × 941 px**, formát WebP, PNG nebo JPG.
- **Varianty jednoho pohledu musí mít úplně stejný záběr.** Liší se jen tím, co se změnilo.
  Vrstvy z nich vyříznu sám.
- **Nekreslete text, na kterém záleží** (čísla, nápisy, cedulky, štítky, mapy s popisky).
  Generátory písmo komolí. Plochy nechte prázdné, texty doplním do hry.
- Nekreslete loga ani skutečné vojenské znaky a označení.
- Obrázek může být normálně světlý. Tmu a světla přidává hra.

## Místnost má 4 strany (otáčí se šipkami doprava)

Výdejní pult → Regály s výstrojí → Figurína s batohem → Pancéřové dveře → zpět k pultu.

Souřadnice jsou v pixelech obrázku (x zleva, y shora). Rozmístění nemusí sedět přesně –
klikací plochy posunu.

### 1. Výdejní pult (sem hráč přijde)

| Předmět | Přibližně kde | Poznámka |
|---|---|---|
| Vojenská mapa na zdi | x 140–520, y 90–330 | jen vrstevnice, bez popisků |
| Prázdná cedule nad pultem | x 640–1030, y 120–170 | nápis VÝDEJ VÝSTROJE doplním |
| Police za pultem s krabicemi | x 560–1420, y 210–470 | |
| Dřevěný pult se šuplíkem uprostřed | x 250–1430, y 470–760 | šuplík x 640–940, y 590–660 |
| Kovová stolní lampa (svítí) | x 370–470, y 380–470 | |
| Otevřená výdejní kniha | x 545–815, y 445–475 | stránky bez čitelného textu |
| Starý psací stroj s listem | x 900–1130, y 350–470 | |
| Razítka na stojánku | x 1150–1255, y 430–470 | |
| Polní telefon v olivové bedýnce | x 1270–1390, y 400–470 | |
| Kartotéka se šuplíčky | x 1450–1640, y 150–700 | |
| Žárovka pod stropem | x ≈ 836, y 0–60 | |

**Varianta:** stejný záběr s **vysunutým šuplíkem pultu** (uvnitř formuláře, kalkulačku kreslit
nemusíte).

### 2. Regály s výstrojí

| Předmět | Přibližně kde | Poznámka |
|---|---|---|
| Kovový regál, 3 police | x 70–760, y 80–820 | |
| Přilby na horní polici | x 70–760, y 100–230 | jedna promáčknutá |
| Batohy různých velikostí | x 70–760, y 240–700 | **jedno místo prázdné** (vpravo dole) |
| Dřevěná bedna | x 800–1060, y 640–820 | šablonový nápis doplním |
| Vysoké kožené boty na bedně | x 830–1050, y 560–640 | |
| Vysoká plechová skříňka s číselným zámkem | x 1120–1420, y 140–820 | zámek vpravo uprostřed |
| Mrtvá zářivka pod stropem | x 640–1030, y 10–40 | |

**Varianta:** stejný záběr s **otevřenou skříňkou** (dvířka doprava, uvnitř prázdné police,
na vnitřní straně dvířek nalepený papír).

### 3. Figurína s batohem (nejdůležitější obrázek)

| Předmět | Přibližně kde | Poznámka |
|---|---|---|
| Figurína vojáka v polní uniformě a přilbě | x 750–900, y 120–860 | **přesně z boku, čelem doprava** |
| Velký batoh na zádech figuríny | x 665–790, y 210–500 | vlevo za figurínou |
| Psí známka na řetízku na hrudi | x 835–865, y 280–320 | |
| Kulatý podstavec | x 615–1015, y 840–910 | |
| Olovnice visící ze stropu | svisle v x ≈ 810 | provázek a kovové závaží těsně nad podstavcem |
| Stará decimální váha | x 190–430, y 580–860 | |
| Korková nástěnka s prázdným plakátem | x 1130–1530, y 110–560 | text a piktogramy doplním |

Figurína musí být **opravdu z boku**, aby bylo vidět, jak batoh trčí dozadu za olovnici.
Na figurínu ani batoh nekreslete značky těžiště – doplním je.

### 4. Pancéřové dveře (Brána I)

| Předmět | Přibližně kde | Poznámka |
|---|---|---|
| Ocelové dveře s nýty v betonovém rámu | x 540–1130, y 60–860 | |
| Vodorovná závora přes dveře | x 560–1110, y 290–325 | |
| Velké kolo zámku uprostřed | střed x 835, y 520, průměr ≈ 200 | |
| Malá pojistka s páčkou | x 1010–1070, y 640–730 | |
| Prázdná mosazná cedulka nad dveřmi | x 790–880, y 14–54 | římskou jedničku doplním |
| Dřevěná lavice se složenou blůzou | x 100–480, y 640–770 | |
| Hasicí přístroj | x 1150–1210, y 580–760 | |
| **Holá zeď** se šmouhami od pat dole a od zad výš | x 1240–1640 | sem se „stavěl patami ke zdi“ |

**Varianta:** stejný záběr s **otevřenými dveřmi** – za nimi betonové schodiště nahoru, shora
teplé světlo.

## Ikony předmětů (nepovinné)

Čtverec, průhledné pozadí: **svinovací metr** (žlutý pásek), **příručka v olivových deskách**.
Zatím pro ně běží moje kresby.
