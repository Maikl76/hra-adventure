# Zadání obrázků: Vojenská tělovýchova – Noční cvičiště (Brána III)

Až budou hotové vaše obrázky, vyměním je za zástupné kresby a doladím klikací plochy i světla.
Platí stejná pravidla jako u skladu a tělocvičny.

**Stav (22. 10. 2026):** všechny čtyři strany jsou zástupné kresby (SVG → WebP), stejně vrstva
otevřené brány a ikona noktovizoru.

## Styl

Poprvé **venku**: noc, cvičiště za budovou fakulty, mokrá tráva, hvězdy, kousek měsíce za mraky
(v dálce se blýská – bouřku dělá hra). Světlo jen z petrolejek, lampy na stojanu a reflektoru
nad bránou. Žádné zbraně ani skutečné vojenské znaky – přilby a noktovizor jsou cvičné.
Nic strašidelného: polní cvičení, ticho, cvrčci.

## Společná pravidla

- **Rozměr 1672 × 941 px**, formát WebP, PNG nebo JPG.
- **Varianty jednoho pohledu musí mít úplně stejný záběr.** Liší se jen tím, co se změnilo.
- **Nekreslete text, na kterém záleží** (rozkaz, plakát, cedule, směrovka, štítky, displej
  číselníku). Plochy nechte prázdné, texty doplním do hry.
- Obrázek může být normálně světlý. Tmu a světla přidává hra.

## Místnost má 4 strany (otáčí se šipkami doprava)

Polní stůl s mapou → Stojan s přilbami → Brána cvičiště → Polní ošetřovna (stan) → zpět ke stolu.

Souřadnice jsou v pixelech obrázku (x zleva, y shora). Rozmístění nemusí sedět přesně –
klikací plochy posunu.

### 1. Polní stůl s mapou (sem hráč přijde)

| Předmět | Přibližně kde | Poznámka |
|---|---|---|
| Napnutá plachta (přístřešek) přes horní část | y 60–360 | pod ní tma noci, vzadu kopec |
| Petrolejová lampa na háku plachty | x 770–905, y 110–310 | svítí |
| Polní stůl (dřevo, rozkládací) | x 330–1340, y 520–900 | deska asi y 520–650 |
| Mapa s vrstevnicemi na stole | x 410–1060, y 550–810 | vrstevnice kolem kopce, **bez popisků** (trasy a čísla doplním) |
| Buzola jako těžítko + proužek měřítka | x 965–1075, y 565–675 | |
| List rozkazu na kolíčku (prkénko na šňůrce) | x 1160–1350, y 290–530 | **prázdný** list |
| Světlo stanoviště na kopci v dálce | x ≈ 1540, y ≈ 215 | malý bod světla |

### 2. Stojan s přilbami

| Předmět | Přibližně kde | Poznámka |
|---|---|---|
| Dřevěný stojan s příčkami a kolíky | x 270–910, y 290–900 | na sloupku lampa (x 340–420, y 130–220) |
| Dvě přilby na kolících | x 350–490 a x 630–770, y 390–470 | obyčejné |
| Přilba s prázdným držákem vpředu (hlavní) | x 490–750, y 350–590 | držák na noktovizor, bez něj |
| Plátěné váčky s broky na háčcích | x 745–930, y 530–790 | tři váčky, pod nimi prázdný štítek |
| Tabule s plakátem | x 990–1410, y 190–630 | plakát **prázdný** (text doplním) |

### 3. Brána cvičiště

| Předmět | Přibližně kde | Poznámka |
|---|---|---|
| Plot z pletiva se sloupky | přes celou šířku, y 360–780 | |
| Brána z ocelových trubek (dvě křídla) | x 555–1115, y 320–830 | zavřená |
| Reflektor na stožáru nad bránou | x 750–920, y 30–230 | svítí dolů na bránu |
| Číselník na pravém sloupku | x 1118–1198, y 455–575 | displej **prázdný** |
| Smaltovaná cedule na plotě vlevo | x 240–530, y 370–530 | **prázdná** modrá cedule |
| Směrovka na sloupku vpravo | x 1270–1520, y 290–770 | šipka **bez textu** |
| Cesta za bránou vzhůru do kopce | x 700–980, y 560–800 | |

**Varianta:** stejný záběr s **otevřenými křídly brány** (zelený displej číselníku doplním).

### 4. Polní ošetřovna (stan)

| Předmět | Přibližně kde | Poznámka |
|---|---|---|
| Vnitřek stanu (šikmé plachty, tyč uprostřed) | celý obraz | vlevo otevřený vchod do noci |
| Petrolejka na háku | x 770–905, y 50–265 | svítí |
| Polní nosítka na dvou kozách | x 270–1265, y 460–690 | |
| Cvičná figurína „raněný“ na nosítkách | x 380–1180, y 500–600 | **hlavou doprava**, na hrudi prázdná cedulka |
| Rtn. Doubek sedící na bedně, levá ruka v šátku | x 1280–1570, y 330–810 | voják v polní uniformě, přilba vedle něj |
| Dřevěná bedna s výstrojí | x 100–460, y 630–870 | víko, šablonový nápis **nekreslit** (doplním) |
| Radiostanice na poličce | x 1370–1610, y 140–320 | stará polní radiostanice s anténou |

**Varianta (nepovinná):** stejný záběr s **otevřenou bednou** (hráč z ní bere noktovizor).

## Ikona předmětu (nepovinné)

| Soubor | Co na něm je |
|---|---|
| `noktovizor` | noktovizor s držákem na přilbu, 64 × 64 px, průhledné pozadí |
