# Brány biomechaniky – výuková adventura (FTVS UK)

## O projektu
Webová point-and-click adventura pro studenty 1. ročníku FTVS UK v předmětu biomechanika.
Hráči (týmy po 3–4) procházejí temnou opuštěnou fakultou v noci. Každá místnost končí
zamčenou branou, kterou lze otevřít jen pochopením biomechanického principu.
Hra se hraje během jedné výukové jednotky (45–60 min) a kombinuje hádanky na obrazovce
s jedním pohybovým stanovištěm v tělocvičně (koncept GSport: gaming + pohyb).

Cílem první verze je pilot ve výuce. Musí být jednoduchá, spolehlivá a snadno upravitelná.

## Atmosféra
- Tma, ticho, pevný pohled kamery na každou místnost (žádný volný 3D pohyb).
- Úvodní sekvence: pomalý průchod tmou skrze řadu bran (CSS animace přiblížení a prolínání).
- Příběh: poznámky zmizelého docenta, který zamkl brány „pro ty, kdo pohybu skutečně rozumí“.
- Barvy: téměř černá, teplé světlo svíčky/lampy, akcent zašlé zlato. Patkové písmo pro nadpisy.
- Celá hra v češtině.

## Technika
- Čisté HTML, CSS a JavaScript, bez build kroku a bez frameworku.
- Žádný server, žádné přihlašování, žádná databáze. Hostování přes GitHub Pages.
- Musí fungovat na notebooku, tabletu i mobilu (dotyk i myš).
- Postup hry ukládat do localStorage, aby se po zavření prohlížeče dalo pokračovat.
- Grafika zatím jako zástupné obrázky nebo jednoduché SVG; skutečné obrázky doplníme později.

## Struktura
```
index.html
css/style.css
js/engine.js      – herní logika (místnosti, inventář, kombinace, zámky)
js/ui.js          – vykreslování, animace, úvodní sekvence
js/audio.js       – zvuk generovaný v prohlížeči (podkresy a efekty), bez souborů
data/game.json    – VEŠKERÝ obsah: místnosti, předměty, texty, kombinace, odpovědi
assets/           – obrázky a zvuky
podklady/         – odborné podklady pro úlohy (jen lokálně, v .gitignore)
```

**Klíčové pravidlo:** obsah (texty, hádanky, správné odpovědi, kódy stanovišť) patří pouze
do `data/game.json`. Vyučující musí být schopen upravit hádanky bez zásahu do kódu.

## Herní mechaniky
- **Místnost:** obrázek pozadí, klikací oblasti (hotspoty) s popisem.
- **Inventář:** lišta s nalezenými předměty. Předmět lze prozkoumat, kombinovat s jiným
  předmětem nebo použít na objekt v místnosti.
- **Kombinace:** pravidla v JSON ve tvaru `A + B = C` a `předmět X na objekt Y = událost`.
- **Zámek brány:** číselný kód nebo výběr odpovědi. Při chybě krátká nápověda, ne prozrazení.
- **Nápovědy:** u každé brány tři stupňovité nápovědy; jejich použití se zaznamená.
- **Závěrečná obrazovka:** celkový čas, počet chyb, počet použitých nápověd (pro vyhodnocení pilotu).

## Rozhodnutí autora (11. 10. 2026)
- Prvky GSPORT budou v **jedné samostatné místnosti**. Nejprve vznikají místnosti bez GSPORT;
  pohybové stanoviště (Brána 3 níže) přijde na řadu až potom.
- Grafika **nemusí být z fotek fakulty** (fakulta se přestavuje). Obrázky musí jít vyměnit
  bez zásahu do kódu.
- Termín pilotu zatím není – projekt je zatím nápad, postupujeme bez spěchu.
- **Dvě sekce hry:** pro studenty **vojenské tělovýchovy** a pro **civilní** studenty. Každá
  místnost má určeno, do které sekce patří (případně do obou). Sekce se vybírá na začátku hry.
- **Podklady pro úlohy:** rozpracovaná publikace o základní tělesné přípravě vojáka
  (autor + spoluautoři) v `podklady/`. Ve hře **vlastní formulace**, nikdy doslovný text ani
  obrázky z publikace. Publikace se teprve píše – nesrovnalosti v ní (čísla kapitol, tvrzení)
  neřešíme, pokud o to autor nepožádá.
- `podklady/` je v `.gitignore` – nikdy necommitovat (soubor má přes 100 MB a jde o nevydaný text).
- Které místnosti vzniknou, zatím není rozhodnuto; přidávají se postupně. Nejdřív
  vzniká ukázka vzhledu a ovládání (úvod, výběr sekce, anatomický kabinet).

## Obsah první verze (3 brány)

### Brána 1 – Páka (anatomický kabinet)
Na stole model paže v pravém úhlu v lokti, v dlani závaží. Hráč najde v šuplíku pravítko
a lísteček „Závaží: 50 N“. Použitím pravítka na model zjistí vzdálenosti:
závaží 30 cm od loketního kloubu, úpon m. biceps brachii 3 cm od kloubu.
Úkol: jakou silou musí biceps působit, aby paže zůstala v klidu?
Řešení: 50 N × 0,30 m = 15 N·m; 15 N·m / 0,03 m = **500 N** → kód zámku `500`.
Doplňující otázka (výběr): o jaký typ páky jde? Správně: páka třetího druhu.

### Brána 2 – Let (laboratoř)
Nefunkční kontaktní deska na podlaze. Hráč najde odpojený kabel a baterii.
Kombinace: kabel + deska = zapojená deska; baterie + zapojená deska = funkční deska.
Funkční deska zobrazí poslední záznam: čas letu výskoku 0,50 s.
Úkol: jaká byla výška výskoku v cm?
Řešení: h = g·t² / 8 = 9,81 × 0,25 / 8 ≈ 0,31 m → kód zámku `31`.

### Brána 3 – Pohybové stanoviště (tělocvična) – odloženo, samostatná místnost GSPORT
Hra pošle tým k fyzickému stanovišti. Každý člen týmu provede výskok z podřepu (SJ)
a výskok s protipohybem (CMJ), měřeno kontaktní deskou nebo metodou dosahu na stěnu.
Po provedení jim vyučující sdělí kód stanoviště (konfigurovatelný v `game.json`).
Ve hře zadají kód a odpoví na otázku: proč byl CMJ vyšší?
Správně: využití cyklu protažení–zkrácení (elastická energie a předaktivace svalu).
Otevření brány vede na závěrečnou obrazovku s náznakem dalších bran („Šest bran zůstává zavřených…“).

## Zásady práce
- Postupuj po malých krocích a po každém kroku ověř, že hra běží v prohlížeči.
- Kód piš čitelně, s komentáři v češtině.
- Neměň obsah hádanek ani výpočty bez upozornění; fyzikální správnost ověřuje vyučující.
- Žádné externí knihovny, pokud nejsou nutné.

## Jak hru vyzkoušet
Hra načítá `data/game.json`, takže otevření `index.html` dvojklikem nestačí (prohlížeč to
ze souboru nedovolí). Lokálně: ve složce projektu `python -m http.server 8765` a v prohlížeči
`http://127.0.0.1:8765`. Na GitHub Pages funguje bez úprav.

## Stav (11. 10. 2026) – ukázka vzhledu a ovládání (verze 0.1)
Hotovo:
- Úvod: průchod tmou devíti branami (I–IX) s titulky z `game.json`, lze přeskočit; po prvním
  zhlédnutí se spouští rovnou titulní obrazovka (znovu: „Přehrát úvod“).
- Titulní obrazovka, výběr sekce (civilní / vojenská) a název týmu.
- Anatomický kabinet (Brána I): tma s lampou a „baterkou“ pod kurzorem (přepínač Rozsvíceno),
  šuplík → pravítko + lísteček, pravítko na model paže → detail s kótami, plakát pák,
  zámek: kód 500 N + výběr druhu páky, cílená zpětná vazba na typické chyby, 3 nápovědy na krok.
- Zápisník (zjištěné údaje), ukládání postupu, závěrečná obrazovka se statistikami.
- Notebook, tablet, telefon na šířku i na výšku.
- Zvuk (`js/audio.js`, Web Audio, žádné soubory ani licence): vstupní obrazovka „Vstoupit“
  (prohlížeč pustí zvuk až po kliknutí), podkres úvodu (hluboký tón, „sbor“ d moll, vítr, zvon,
  svist při průletu branou, vstup do světla), tišší podkres titulní obrazovky, kabinet (ticho,
  hodiny, zaskřípání), efekty (šuplík, pravítko, papír, předmět, klávesy, chyba, cvaknutí zámku,
  otevření brány, nápověda). Vypínač Zvuk v liště i na titulní obrazovce; skrytá záložka = pauza.
  `audio.defaultOn: false` v game.json = hra začne potichu (výuka ve třídě). `audio.files`
  umožní nahradit generovaný zvuk souborem (stejné jméno podkresu/efektu).
- Zásada: zvuk nikdy nenese informaci k řešení (třída bez zvuku, neslyšící studenti).
- Verze 0.2: kabinet má **pohledy** – U stolu, Knihovna, Kostra a tabule, Vchod (otáčení
  šipkami ‹ › nebo klávesami ←/→) a zvětšený **Stůl zblízka** (Zpět / ↓). Na stole 5 papírů,
  jen vytržený list z bloku je užitečný (odkáže na knihu se zeleným hřbetem); ostatní jsou
  falešné stopy. V knihovně jde vytáhnout **kniha k listování** (9 stran: síla a tíha, moment
  síly, páky, rovnováha momentů s obrázkem, řešený příklad na jiných číslech: 40 N, 35 cm,
  5 cm → 280 N). Ostatní kouty mají jen atmosféru a drobné vtipy.
- Skutečná grafika (dodal autor, 1672 × 941 WebP): všech pět pohledů kabinetu –
  `kabinet.webp`, `knihovna.webp`, `kostra.webp`, `vchod.webp`, `stul.webp`. Původní SVG kresby
  zůstaly v `assets/rooms/` jen jako záloha (hra je nepoužívá).
- Šuplík je **zamčený**: klíček (přívěsek „Š“) je v dolní kapse docentova pláště u vchodu –
  klik na plášť přiblíží kapsu (pohled `kapsa`, zástupná kresba `kapsa.svg` + vrstva
  `kapsa_klic.svg`), klíček se vezme a použije na šuplík (pak zmizí z inventáře, šuplík vydá
  pravítko a lísteček). Bez klíčku šuplík jen zachrastí; s klíčkem v inventáři hra poradí, jak ho použít.
- Zpráva i předměty v inventáři jsou vždy pod místností a vycentrované (na nízkých oknech menší).
- Vrstvy stavů jsou z autorových dílů s průhledným pozadím (originály v `podklady/obrazky/`):
  vysunutý šuplík, chodba za otevřenou bránou (oblouk dílu přesně odpovídá oblouku brány),
  mezera po zelené knize. Skládají se v prohlížeči nástrojem `podklady/nastroje/vrstvy2.html`
  (pomocný server `nastroj_server.py` uloží výsledek POSTem); souřadnice dílů jsou v nástroji. Pohled může mít `darkness` (síla tmy 0–1, výchozí 0,86) – tmavé obrázky ~0,6.
  Při výměně obrázku zkontrolovat klikací místa (Menu → Vyznačit objekty v místnosti) a `lights`.

Doplněno do zadání Brány 1: „(Hmotnost předloktí zanedbej.)“ – čeká na potvrzení autorem.

Formát `game.json` (stručně): `tracks` = sekce a pořadí místností; `items` = předměty;
`uses` = předmět na objekt; `combinations` = předmět + předmět; v místnosti `hotspots`
(oblast v % obrázku, `click` = seznam případů s podmínkou `when` a účinky `do`), `layers`
(obrázky podle stavu), `lights` (zdroje světla) a `gate` (kroky zámku). Účinky: `text`, `give`,
`remove`, `set`/`unset` (příznak), `note` (zápisník), `closeup` (detail), `sound` (efekt),
`openGate`, `leave`, `view` (přepnout pohled, např. přiblížit stůl), `openItem` (otevřít předmět).
Místnost má `ambience` (jméno podkresu), `startView` a `views`; každý pohled má `background`,
`hotspots`, `layers`, `lights`, sousedy `left`/`right` (otočení) nebo `back` (návrat) a `enterText`.
Předmět může mít `closeup` (`image`, nebo `note` + `font: "type"` pro tištěný text), `book`
(`pages` → `blocks`: `heading`, `p`, `formula`, `image`, `note` = poznámka na okraji, `toc`;
dolní index se píše `F_{sval}`) a `examine` (účinky při otevření, např. zápis do zápisníku).
