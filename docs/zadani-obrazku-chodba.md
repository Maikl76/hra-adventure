# Zadání obrázků: Sklepní bludiště „z vlastních očí“ (zkouška)

Chodba se nekreslí z hotových pohledů jako místnosti, ale z **textur**: malých čtvercových
obrázků, kterými hra „tapetuje“ zdi, podlahu a strop. Hráč je vidí zblízka i z dálky a z boku
(v perspektivě), takže musí sedět na sebe.

**Stav (17. 10. 2026):**
- Hotovo (vaše textury jsou ve hře): `zed`, `hasicak`, `dvere_sklad`, `cedule_schody`,
  `lekarnicka`, `nastenka`, `mriz`, `plakat_kostra`, `potrubi`, `schodiste`, `zavora`,
  `zbrojni_skrin`, `zbrojni_skrin_prazdna`, `sipka`, `podlaha`, `strop`, `kostlivec`. Zdi jsem
  upravil jen technicky: oříznutý pruh podlahy pod soklem, srovnaný jas a prolnuté okraje vlevo
  a vpravo, aby zdi na sebe navazovaly v jakémkoli pořadí.
- Drobné úpravy: na nástěnce jsem nadpis ROZPIS přepsal na ROZKAZ (tak se list jmenuje po
  kliknutí). Schodiště jsem trochu roztáhl do šířky, aby jeho rám seděl s rámem mříže – po
  odemčení obraz neposkočí. Trubky na potrubí vedou až k okraji obrázku (neprolínám je).
- Kostlivec: ze dvou skoro stejných verzí jsem použil druhou (je světlejší, ve tmě ho víc vidět).
  Posunul jsem ho o kousek dolů, aby stál na podlaze, a podle něj znovu změřil oblasti kostí pro
  zásah laserem.
- Zbývá: `kosti` (hromádka kostí s lebkou) a `puska`. U pušky musí být ústí nahoře zhruba
  uprostřed (v obrázku 400 × 240 kolem bodu 180, 82) – odtud vychází paprsek; když bude jinde,
  posunu ho.
- Nápisy, které generátor napsal správně (cedule u schodiště, popisky na plakátu kostry, šablona
  TĚLOCVIČNA – SCHODIŠTĚ, štítky ČIDLO a ZBROJNÍ SKŘÍŇ), jsem nechal.

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
| `zbrojni_skrin` | zamčená plechová zbrojní skříň, prázdná cedulka |
| `zbrojni_skrin_prazdna` | stejná skříň otevřená a prázdná (stejný záběr) |
| `zavora` | otvor ve zdi zavřený ocelovou závorou (mříží) s červeným čidlem uprostřed |
| `plakat_kostra` | zeď s plakátem kostry zepředu, popisky nechte prázdné |
| `lekarnicka` | zeď s bílou lékárničkou s červeným křížem |

## Postavy a puška (průhledné pozadí, PNG nebo WebP)

| Soubor | Rozměr | Co na něm je |
|---|---|---|
| `kostlivec` | 256 × 512 | kostlivec **přesně zepředu**, celý od lebky po chodidla, ruce podél těla, kosti dobře rozlišitelné (holenní silnější uvnitř, lýtková tenká vně, čéška, klíční kosti, hrudní kost) |
| `kosti` | 256 × 128 | hromádka kostí s lebkou (poražený kostlivec) |
| `puska` | 400 × 240 | cvičná laserová puška (laser game, oranžovo-šedá) z vlastních očí: zespodu do obrazu, ústí nahoře uprostřed |

Kostlivce kreslete **ve stejných proporcích jako můj zástupný** (lebka nahoře 3–20 % výšky, pánev
kolem 55–62 %, kolena kolem 80 %) – podle něj jsou nastavené oblasti kostí pro zásah laserem.
Po výměně je doladím.

`mriz` a `schodiste` musí mít **stejný záběr** (liší se jen mříží a světlem).
