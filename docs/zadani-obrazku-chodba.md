# Zadání obrázků: Sklepní chodba „z vlastních očí“ (zkouška)

Chodba se nekreslí z hotových pohledů jako místnosti, ale z **textur**: malých čtvercových
obrázků, kterými hra „tapetuje“ zdi, podlahu a strop. Hráč je vidí zblízka i z dálky a z boku
(v perspektivě), takže musí sedět na sebe.

**Stav (16. 10. 2026):** ve hře jsou moje zástupné kresby (`assets/chodba/*.svg`).
Vyzkoušet: <https://maikl76.github.io/hra-adventure/?mistnost=chodba>

## Styl

Stejný svět jako výstrojní sklad: betonový sklep pod fakultou, stěny dole natřené olivově,
nahoře omítka, zářivky. Pohled **přímo zepředu, kolmo na zeď**, rovnoměrné světlo bez stínů
(stíny a tmu přidává hra). Žádná perspektiva, žádné rohy.

## Společná pravidla

- **Čtverec 512 × 512 px** (stačí i 1024 × 1024), WebP nebo PNG.
- **Zdi musí navazovat vlevo a vpravo** (levý okraj plynule pokračuje pravým). Rozhraní omítky
  a olivového nátěru a sokl musí být na všech zdech **ve stejné výšce** – zhruba omítka nahoře
  45 %, nátěr pod ní, tmavý sokl dole 8 %.
- Na zdech s předmětem je předmět **uprostřed** a kolem stejná zeď jako na obyčejné zdi.
- **Nekreslete text, na kterém záleží** (cedule u schodiště, nápis TĚLOCVIČNA, nástěnka).
  Plochy nechte prázdné, nápisy doplním.

## Seznam textur

| Soubor | Co na něm je |
|---|---|
| `zed` | obyčejná zeď (omítka nahoře, olivový nátěr dole, sokl), pár skvrn |
| `podlaha` | betonová podlaha shora, jedna deska se spárou po okraji |
| `strop` | betonový strop zespodu, se spárou po okraji (zářivky kreslí hra) |
| `sipka` | zeď s prázdným místem pro šablonový nápis a šipku |
| `hasicak` | zeď s červeným hasicím přístrojem na háku |
| `nastenka` | zeď s korkovou nástěnkou a několika papíry |
| `potrubi` | zeď s vodorovným potrubím a červeným kolem ventilu |
| `cedule_schody` | zeď s prázdnou modrou smaltovanou cedulí |
| `mriz` | otvor ve zdi se schodištěm nahoru (tmavé), před ním zamčená ocelová mříž, malý číselník |
| `schodiste` | stejný otvor, mříž odsunutá stranou, schodiště nahoru, shora teplé světlo |
| `dvere_sklad` | otevřené pancéřové dveře skladu, za nimi tmavý sklad s regály |

`mriz` a `schodiste` musí mít **stejný záběr** (liší se jen mříží a světlem).
