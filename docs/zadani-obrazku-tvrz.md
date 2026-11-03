# Zadání obrázků: Vojenská tělovýchova – Podzemí tvrze (chodba před Bránou V)

Chodba se kreslí z **textur** stejně jako sklepní bludiště (viz `zadani-obrazku-chodba.md`): hra
jimi „tapetuje“ zdi, podlahu a strop a hráč je vidí zblízka, z dálky i z boku v perspektivě.

**Stav (3. 11. 2026):** všechny textury jsou zástupné kresby (SVG → WebP 1024 × 1024) ve složce
`assets/tvrz/`. **Okno s figurínou** (ohýbání kloubu) kreslí hra sama v `js/figurina.js` – texturu
figuríny ve zdi kreslí stejný kód, aby seděla s oknem. Kdybyste chtěl figuríny po svém, pošlete je
a já podle nich upravím i kresbu v okně.

Vyzkoušet: <https://maikl76.github.io/hra-adventure/?mistnost=tvrz>

## Styl

Podzemí staré pevnostní tvrze pod pěchotním srubem: **holý šedý beton** se spárami po bednění,
vlhké mapy a rezavé stékance, nízký strop s trubkami, tu a tam žárovka v mřížce. Chladné, ale ne
hororové. Pohled **přímo zepředu, kolmo na zeď**, rovnoměrné světlo bez stínů (tmu přidává hra).

## Společná pravidla

- **Čtverec 1024 × 1024 px** (stačí i 512 × 512), WebP nebo PNG.
- **Zdi musí navazovat vlevo a vpravo.** Spáry po bednění a tmavý pruh u podlahy (asi 8 %) ve
  stejné výšce na všech zdech.
- Na zdech s předmětem je předmět **uprostřed** a kolem stejná zeď jako na obyčejné zdi (`beton`).
- **Nekreslete text, na kterém záleží** (nástěnka, cedule u šachty s hloubkou, plakát PÁDY se
  vzorcem, číselník na dveřích). Plochy nechte prázdné, texty doplním.

## Seznam textur

| Soubor | Co na ní je |
|---|---|
| `beton` | obyčejná betonová zeď |
| `podlaha` | betonová podlaha s kanálkem, vlhké skvrny |
| `strop` | nízký betonový strop s trubkami |
| `vchod` | pootevřené pancéřové vstupní dveře, venku svítá (proužek světla) |
| `nastenka` | dřevěná nástěnka s připíchnutým listem (**prázdný**) |
| `plakat_pady` | výcviková tabule „PÁDY“ – postavička padající vzad (**bez vzorce**) |
| `sachta` | otvor šachty v podlaze u zdi, kovový žebřík dolů, smaltovaná cedule (**prázdná**) |
| `ubikace` | průhled do ubikace s palandami |
| `filtrovna` | filtrovna vzduchu – velké válce filtrů, ruční kolo ventilátoru |
| `telefon` | starý polní telefon na zdi s kličkou |
| `cedule` | směrová cedule (**prázdná**) |
| `dvere_srub` | pancéřové dveře nahoru do srubu, vedle číselník (**prázdný displej**), nad nimi lampa |
| `dvere_srub_otevrene` | totéž, dveře odsunuté, za nimi strmé schodiště nahoru |
| `figurina1` – `figurina5` | dřevěná kloubová figurína v životní velikosti, která zatarasila chodbu; každá v jiném postoji: 1 paže natažená dopředu ve výšce ramen (loket), 2 noha natažená dopředu vodorovně (koleno), 3 hlava v záklonu (krk), 4 paže mírně za tělem (rameno), 5 stojí rovně (kyčel a koleno) |

Figuríny: světlé dřevo, kovové čepy v kloubech, stojí na kolejničce v podlaze (po uvolnění odjedou
stranou nebo do výklenku). Když je budete kreslit, držte proporce dospělého člověka (asi 180 cm).
