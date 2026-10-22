# Zadání obrázků: Laboratoře – Brána II: Fotografická laboratoř

Až budou hotové vaše obrázky, vyměním je za zástupné kresby a doladím klikací plochy i světla.
Platí stejná pravidla jako u kabinetu.

**Stav (22. 10. 2026):** všechny čtyři strany jsou zástupné kresby (SVG → WebP), stejně vrstvy
(červené světlo, druhá fotka na šňůře, otevřená brána) a ikona negativu.

## Styl

Stejný svět jako anatomický kabinet: stará budova fakulty, noc. Tady **temná komora** v bývalé
úklidové místnosti: kachlíkový sokl, nad ním tmavá omítka, pod stropem lampa s červeným filtrem.
Stůl s miskami, prádelní šňůra s fotkami, starý zvětšovák, skříňka se šuplíky. Nic strašidelného,
jen ticho a kapající voda.

## Společná pravidla

- **Rozměr 1672 × 941 px**, formát WebP, PNG nebo JPG.
- Každý pohled je potřeba **dvakrát se stejným záběrem: potmě (jen slabé světlo) a v červeném
  světle**. Když to generátor neumí, stačí světlá verze – červené světlo a tmu doplní hra.
- **Nekreslete text, na kterém záleží** (plakát, štítky, popisky na fotkách, číselník
  stroboskopu). Fotografie na šňůře kreslí hra sama (stroboskopické snímky), stačí **prázdné
  fotografické papíry** na kolíčcích.
- Obrázek může být normálně světlý. Tmu a světla přidává hra.

## Místnost má 4 strany (otáčí se šipkami doprava)

Vyvolávací stůl (sem hráč přijde) → Šňůra s fotkami → Zvětšovák → Brána II → zpět.

Souřadnice jsou v pixelech obrázku (x zleva, y shora).

### 1. Vyvolávací stůl

| Předmět | Přibližně kde | Poznámka |
|---|---|---|
| Dveře vlevo (kterými hráč přišel) | x 0–90, y 120–760 | |
| Vypínač u dveří | x 100–200, y 360–460 | |
| Červená lampa pod stropem | x 770–900, y 50–200 | |
| Vyvolávací časovač na zdi | x 740–920, y 230–420 | ciferník, štítek **prázdný** |
| Dlouhý stůl se třemi miskami | x 380–1280, y 500–900 | misky x 430–1240, y 500–570; v prostřední plave fotka |
| Dřez s kohoutkem | x 1300–1500, y 380–700 | kape voda |

### 2. Šňůra s fotkami

| Předmět | Přibližně kde | Poznámka |
|---|---|---|
| Prádelní šňůra s kolíčky | přes celou šířku, y 180–250 | |
| Velká fotografie na kolíčcích | x 330–830, y 240–540 | **prázdný papír** (snímky kreslí hra) |
| Prázdné místo se dvěma kolíčky | x 900–1300, y 240–540 | sem se pověsí druhá fotka |
| Stolek s lupou a krabičkou kolíčků | x 1280–1580, y 600–900 | |

**Varianta:** stejný záběr s **druhou fotografií** na prázdném místě (zase prázdný papír).

### 3. Zvětšovák

| Předmět | Přibližně kde | Poznámka |
|---|---|---|
| Skříňka se šuplíky | x 180–520, y 560–860 | druhý šuplík se štítkem (**prázdný**) |
| Zvětšovák na sloupu, rám na papír | x 620–1000, y 150–820 | |
| Stroboskop s číselníkem na polici | x 1100–1350, y 320–560 | ciferník, lampa, štítek **prázdný** |

### 4. Brána II

| Předmět | Přibližně kde | Poznámka |
|---|---|---|
| Plakát na zdi vlevo | x 200–520, y 200–620 | **prázdný** |
| Těžké dřevěné dveře s mosazným zámkem | x 600–1080, y 110–870 | nad nimi vyřezaná římská dvojka |
| Mosazný zámek | x 980–1050, y 470–570 | |
| Věšák s bílým laboratorním pláštěm | x 1300–1500, y 240–760 | |

**Varianta:** stejný záběr s **pootevřenou bránou** (za ní tma).

## Ikona předmětu (nepovinné)

| Soubor | Co na něm je |
|---|---|
| `negativ` | proužek filmu v papírové kapse, 64 × 64 px, průhledné pozadí |
