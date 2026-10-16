# Poznámky k vývoji – Devět bran k pochopení pohybu

Sdílené pracovní poznámky pro práci na hře – pro autora i pro AI asistenta (Claude) v jakékoli
konverzaci, na kterémkoli počítači i v cloudu. **Na začátku práce si je přečti, při každé větší
změně je doplň** (nové místnosti, rozhodnutí autora, nové funkce enginu) a nahraj spolu se změnou.

Soukromé údaje sem nepatří (e-maily, hesla, nevydané texty) – repozitář je veřejný.

## Projekt

- Webová point-and-click adventura z biomechaniky pro studenty FTVS UK (výuka, týmy po 3–4,
  45–60 min). Autor: Michal Vágner, FTVS UK. Hra: <https://maikl76.github.io/hra-adventure/>,
  repozitář <https://github.com/Maikl76/hra-adventure> (veřejný, větev `main`, GitHub Pages).
- Příběh: docent, který léta učil biomechaniku, zmizel; zanechal „Devět bran. Otevřou se jen
  těm, kdo pohybu skutečně rozumějí.“ Vzkazy podepisuje „– D.“.
- Tři světy (sekce), každý bude mít vlastních devět bran: **Civilní studium**, **Vojenská
  tělovýchova**, **GSPORT** (hra a pohyb, „levely“ místo bran).
- Projekt je zcela oddělený od KinemaLab (jiný repozitář, jiný účel).

## Jak pracovat (pravidla)

- **Komunikace s autorem česky**, stručně, bez programátorského žargonu – autor je odborník na
  biomechaniku, ne programátor. Uživatelské rozhraní i dokumentace česky; kód (názvy) anglicky,
  komentáře česky.
- **Commit a push jen na pokyn autora.** Zprávy commitů česky. Po pushi ověřit, že GitHub Pages
  vydává novou verzi (`meta.version` v `data/game.json`).
- **Před prací stáhnout nejnovější verzi z GitHubu** (`git pull`). Nepracovat ve dvou konverzacích
  zároveň – obě nahrávají do stejné větve a mohly by si přepsat práci.
- Krátkou odpověď autora, která jde číst oběma směry, si **ověřit** (jednou větou napsat, jak ji
  chápu). Poučení: „lekačky můžou vyděsit hodně moc“ znamenalo *ano, chci je*.
- **Neměnit výpočty, správné odpovědi ani výchozí parametry bez upozornění** – fyzikální
  správnost ověřuje autor. Úlohy formulovat vlastními slovy (žádný doslovný text z cizích podkladů).
- **Veškerý obsah patří do `data/game.json`** (texty, hádanky, odpovědi, nápovědy, obrázky
  místností) – vyučující ho musí umět upravit bez programování.
- **`game.json` nikdy nepřeformátovat celý** (např. načíst a uložit s jiným odsazením) – části
  souboru mají ruční formát a vznikl by rozdíl přes tisíce řádků. Měnit jen dotčené místo;
  po úpravě ověřit, že soubor jde načíst (JSON) a že rozdíl obsahuje jen zamýšlené změny.
- Po každé změně hru vyzkoušet v prohlížeči. Při výměně obrázku zkontrolovat klikací místa
  (Menu → Vyznačit objekty v místnosti) a světla (`lights`).
- **Verze souborů:** skripty a styl mají v `index.html` parametr `?v=…`; kamerové moduly se
  importují s `?v=` v `js/ui.js` (`squats.js`, `skok.js`, `predklon.js`, `goblet.js`) a `skok.js`,
  `predklon.js` i `goblet.js` importují `squats.js` také s `?v=` (všude stejné číslo). Při každém nahrání změněného JS/CSS zvýšit
  spolu s `meta.version`, jinak prohlížeče hráčů míchají starý a nový kód.
- Do repozitáře **nikdy**: složka `podklady/` (originály obrázků, pomocné nástroje, odborné
  podklady – jen u autora), soubor `CLAUDE.md` v kořeni (lokální poznámky se soukromými údaji),
  `zkousky/` (lokální prototypy). Vše je v `.gitignore`.
- Nové závislosti jen s kompatibilní licencí (MIT, BSD, Apache 2.0). Nepoužívat názvy ani loga
  komerčních produktů.

## Technika a soubory

Čisté HTML, CSS a JavaScript, bez sestavování a bez serveru; hostování GitHub Pages.

```
index.html          obrazovky: vstup, úvod, titul, výběr světa, místnost, konec
css/style.css       vzhled (světy mají vlastní barevné téma: body[data-world])
js/engine.js        herní logika – nic nevykresluje, vrací „události“ pro ui.js
js/ui.js            vykreslování, okna (zámek, kniha, aktivity), lekačky, nápověda k tlačítkům
js/audio.js         zvuk generovaný v prohlížeči (Web Audio): podkresy a efekty, bez souborů
js/calc.js          plovoucí kalkulačka (vlastní rozbor výrazů, žádné eval)
js/brany.js         kresba bran v úvodním průletu
js/squats.js        počítání dřepů kamerou (GSPORT, herna)
js/skok.js          výskok z podřepu – doba letu (GSPORT, aréna)
js/predklon.js      zkouška stability – předklon (vojenská tělovýchova, sklad)
js/goblet.js        goblet dřep 90 s – platné a neplatné dřepy (vojenská tělovýchova, tělocvična)
vendor/mediapipe/   MediaPipe Tasks Vision 0.10.14 + model pose_landmarker_lite (Apache 2.0)
data/game.json      VEŠKERÝ obsah hry
assets/             rooms/ (pohledy a vrstvy), items/, closeups/, book/, scares/
docs/               tyto poznámky a zadání obrázků pro autora (zadani-obrazku-*.md)
```

- Kamerové moduly se načítají až při volbě „S kamerou“ (dynamický import), nejdřív žádost
  o kameru, pak model. **Obraz se zpracovává jen v prohlížeči**, nic se neukládá ani neposílá.
  Nic se nestahuje z cizích serverů (vše ve `vendor/`).
- Postup hry v `localStorage`, zvlášť pro každý svět (`brany-biomechaniky-ulozeni-<svět>`);
  nastavení (zvuk, světlo, lekačky, viděný úvod…) v `brany-biomechaniky-nastaveni`.
- Lokální spuštění: ve složce hry `python -m http.server 8765`, otevřít `http://127.0.0.1:8765`
  (dvojklik na `index.html` nestačí – hra načítá `data/game.json`).

## Formát `data/game.json` (stručně)

- `tracks` = světy a pořadí místností (`rooms`), vlastní `finish` (závěrečná obrazovka, `stats`
  = řádky s naměřenými hodnotami). `items` = předměty, `uses` = předmět na objekt,
  `combinations` = předmět + předmět.
- Místnost: `name`, `gateNumber`/`gateLabel`, `tracks`, `ambience` (podkres), `enterText`,
  `enter` (účinky při vstupu), `startView`, `views`, `gate` (kroky zámku brány), `locks` (malé
  zámky), `activities`, `scares` (lekačky), `phone` (polní telefon), `shortcut` (zkratka pro
  vyučující).
- Pohled: `background` (1672 × 941), `hotspots` (oblast v % obrázku, `click` = případy
  s podmínkou `when` a účinky `do`), `layers` (obrázky podle stavu), `lights`, `darkness`
  (síla tmy 0–1; tmavé obrázky autora ~0,6), `dust` (prach ve světle), sousedé `left`/`right`
  nebo `back`, `enterText`, `enter`.
- Podmínky `when`: `flags`, `notFlags`, `items`, `notItems`, `expr` (výraz s příznaky 1/0
  a proměnnými, umí `> < >= <= ==`).
- Účinky: `text`, `give`, `remove`, `set`/`unset`, `note` (+ `noteKey` = nahradí starší zápis),
  `closeup` (`image`, nebo `note` + `font` `"type"`/`"terminal"`), `sound`, `view`, `openItem`,
  `openGate`, `lock`, `activity`, `fx` (`"blackout"`), `scare`, `hint`, `leave`.
- Proměnné hráče `vars` (naměřené hodnoty) v textech: `{n}`, `{t:1}` (1 desetinné místo),
  `{=výraz:0}`. Zámek (`type` `code`/`choice`): `answer` může být vzorec, `toleranceRel`,
  `answerMin`/`answerMax`, `requiresVars` + `missingText`, `feedbackFormulas` (cílená rada podle
  typické chyby spočítané z hráčových hodnot), tři stupňovité `hints`.
- Aktivity (`activities`, typ `type`): `reflex`, `squats`, `tape` (měření tahem), `pack`
  (balení batohu), `lift` (zvedání bedny), `stance` (postoj), `lean` (zkouška stability), `jump`
  (výskok), `targets` (NEON AIM), `pushup` (kliky na decimální váze), `throw` (šikmý vrh –
  medicinbal, granát), `gobletsim` (panáček v dolní poloze goblet dřepu), `goblet` (goblet dřep
  90 s). Výsledky se uloží do `vars` a provedou se účinky `done` (`doneCases` = první platný
  případ s podmínkou).
- Kniha (`book` u předmětu): stránky z bloků `heading`, `p`, `formula`, `note`, `image`
  a `table` (`caption`, `head`, `rows`; první buňka řádku je záhlaví) – tabulky norem v brožuře.
- Lekačky `scares`: `image`, `sound` (`scareHit`/`scareStatic`/`scareRush`), `delay` (napětí,
  podkres ztichne), `duration`, `rush`, `position` (co zůstane v záběru na úzkém displeji),
  `after` (text připsaný potom). Každá jen jednou za hru.
- Engine při načtení kontroluje odkazy (`validate`) – chyby vypíše do konzole prohlížeče.

## Světy a místnosti (stav)

### Civilní studium – Brána I: Anatomický kabinet (`kabinet`)
Moment síly a páky. Šuplík zamčený klíčkem z kapsy docentova pláště → pravítko a lísteček
(závaží 50 N) → měření na modelu paže tahem (závaží 30 cm, úpon bicepsu 3 cm od lokte) → kniha
Základy biomechaniky (řešený příklad na jiných číslech) → zámek **500 N** + druh páky (3. druh).
Kalkulačka je opřená o židli. Grafika od autora.

### Vojenská tělovýchova – Brána I: Výstrojní sklad (`sklad`)
Těžiště a stabilita se zátěží (voják 70 kg, batoh 30 kg): měření metrem na figuríně, balení
batohu se živým těžištěm, zvedání bedny (moment v bedrech, síla zádových svalů), postoj a opěrná
plocha, slepení přelomené psí známky (kód skříňky), polní telefon s nápovědami, zkouška
stability před kamerou. Zámek: posun těžiště **6 cm**, co s tím udělat, kam patří těžké věci.
Všechny čtyři pohledy a otevřené dveře jsou od autora; zástupné zůstaly jen ikony klíčů, půlek
známky a pásky (`docs/zadani-obrazku-sklad.md`). Podrobnosti v `game.json`.
**Odloženo do dalších vojenských místností** (nápady autor schválil): protizávaží u přilby, mapa
se svahem, nosítka. Decimální váha a psací stroj jsou v tělocvičně (Brána II).

### Vojenská tělovýchova – Brána II: Tělocvična (`telocvicna`)
Výroční přezkoušení z fyzické zdatnosti podle autorova návrhu nových norem (Excel, první list;
soubor zůstává mimo repozitář, data jsou v brožuře **Normy** v `game.json`: 15 testů podle
pohlaví, zdravotní kategorie A/BI/C a věku I–VII, plus hod granátem z profesních testů).
Čtyři pohledy (stůl komise → hrazda → odhodový sektor → dřepová stanice a dveře).
Řetěz: brožura Normy + protokol rtn. Doubka (muž, 37 let = III, kat. A) → hlášení na psacím
stroji **2213** – běh, leh-sed, kliky, břemeno (cílené rady na špatný sloupec, na „čas – čím
méně, tím lépe“ a na shyby navíc) → P. S. →
běžecký pás **13,5 km/h** (jednička v běhu 2 700 m / 12 min) → klíček → skříň s náčiním
(kettlebell, závaží) → kliky na decimální váze (70 kg, těžiště 0,90 m, ruce 1,30 m od špiček;
pak s batohem 15 kg) → odhodový sektor (medicinbal 5,5 m/s z 1,6 m na 4,35 m; granát 20 m/s
z 2 m na 42 m) → panáček „Proč taková pravidla?“ → **goblet dřep 90 s** (kamerou, bez kamery
počítá kolega, nebo vynechat). Brána: síla rukou při kliku `80*9.81*0.9/1.3` N (±3 %, cílené rady),
práce při výdrži ve shybu **0 J**, úhel hodu z výšky (o něco níž než 45°), proč kettlebell vpředu.
Polní telefon (`telefon_tv_zvoni`), zkratka `?mistnost=telocvicna`. Od autora: hrazda, sektor
(+ rozjetý pás), dveře (+ otevřená skříň a otevřené dveře jako vrstvy); zástupný zatím stůl komise
(`docs/zadani-obrazku-telocvicna.md`).
- Goblet dřep (zadání autora): kettlebell 5 kg u hrudníku, lavička ve výšce kolene – **jen dotyk**,
  kolena ani hlava nesmí být po celou dobu před špičkami. Neplatný dřep se nepočítá, hra ukáže
  důvod (koleno, hlava, nedosedl, posadil se). Kamera ze stoje změří výšku kolene (= lavička)
  a svislici špiček; tolerance 2 cm (`kneeTolCm`, `headTolCm`). Náhrada kettlebellu (láhev,
  batoh) nebo bez zátěže = výsledek „orientační“. Normy ukázané po testu: BI, do 30 let.
- **Muži volí** (zadání autora): silová část leh-sed + kliky, nebo shyby; vytrvalost běh 12 min,
  nebo plavání 300 m. Doubek zvolil běh a leh-sed + kliky, proto v hlášení shyby nejsou.
- Normy přesně podle Excelu; opravena jen zřejmá chyba (plavání ženy VII 8:04 / 9:10 / 10:18)
  a desetinná opakování v kategoriích BI a C zaokrouhlena nahoru (autor schválil).

### GSPORT – LEVEL 1: Stará herna (`herna`)
Práce a výkon při dřepech. Styl kabinetu (staré dřevo, knihovna, kostra) + herní technika
a neony; čtyři pohledy (stůl → knihovna → kostra a stanice → dveře) + přiblížená pojistková skříň.
Řetěz: počítač se sám probudí → reflex test → odemkne šuplík → **UV svítilna** → pojistková skříň
se ptá přímo „Kolik kostí má tělo dospělého člověka?“ (kdo neví: UV na dvířka „KOSTRA“ → UV na
kostru „KOLIK NÁS JE?“ + šipka na štítek na podstavci = **206**) → vypínače (hlavní jistič
**max 1000 W**: počítač 400 nejde vypnout, TV 120, neony 60, lednice 300, stanice 150 → něco
vypnout) → žebříček (DOCENT 142 W) → kód **142** vitríny → hráčská karta → karta do stanice →
**15 dřepů** → kniha Fyzika dřepu (W = m·g·h·n, P = W/t; 70 kg, 0,4 m) → dveře: výkon
`70*9.81*0.4*n/t` (±4 %), pak počet hráčů na 400W počítač `ceil(400/P)`.
Kalkulačka je od začátku v bočním šuplíku stolu. Kostra po reflex testu otočí hlavu.
Lekačky: `odraz` (černý monitor), `tma` (první výpadek jističe), `televize` (karta z vitríny),
`chodba` (po otevření dveří); falešná: počítač po dřepech napíše „OTOČ SE.“. Grafika od autora.

### GSPORT – LEVEL 2: Skokanská aréna (`arena`)
Doba letu a výška výskoku, rychlost a přesnost pohybu. Automat JUMP (konektor z výherního
okénka NEON AIM, baterie ze skříňky s kódem = docentova výška výskoku ze značek na stěně) →
**výskok z podřepu (SJ)** kamerou, nebo „jump and reach“ bez kamery → výška h = g·t²/8 (zámek
`981*tl^2/8` cm) → NEON AIM (Fittsův zákon, ID = log₂(D/W + 1)) → otázka, proč malý vzdálený terč
trvá déle → skok na Měsíci (**6×**). Zkratka pro vyučující `?mistnost=arena` (hráč dostane věci
z herny). Grafika od autora (`docs/zadani-obrazku-arena.md`).

## Rozhodnutí autora (důležitá)

- **Každá věc, která se v místnosti dělá nebo skládá, má mít výukový význam** – student se tím
  má něco naučit (žádné úkoly jen „pro hru“).
- Výpočty v GSPORT jednoduché, **vzorec musí hráč najít v místnosti**; hratelné u vlastního
  notebooku. Standardní hráč **70 kg** (bez osobních údajů).
- Kamera měří **jen bokem** (2D úhly z bodů MediaPipe; 3D body dávaly ve stoji nesmysly, čelem
  se dřepy nepočítaly spolehlivě). Dřep platí pod **90°** v koleni. Vždy existuje náhradní cesta
  bez kamery a závěrečná obrazovka uvádí, zda měřila kamera.
- **Bezpečnost:** nic lekavého během pohybových úloh; u skoků a předklonů volné místo.
- **Lekačky** autor chce („hodně dobré“), ale **ve výchozím stavu jsou vypnuté** – zapínají se
  v Menu. Jedno objevení, žádné opakované blikání.
- **Světlo ve výchozím stavu Rozsvíceno** (režim Baterka si hráč zapne tlačítkem).
- Při prvním vstupu do hry **nápověda k tlačítkům vpravo nahoře** (znovu: Menu → Jak ovládat hru).
- **Zvuk nikdy nenese informaci k řešení** (třída bez zvuku, neslyšící studenti).
- Grafika nemusí být z fotek fakulty. Obrázky dodává autor sám (generátor obrázků).

## Obrázky od autora – postup

- Pohledy 1672 × 941 px (WebP), **vždy 16 : 9**. **Varianty jednoho pohledu se stejným záběrem**
  – nejlépe nechat generátor upravit stejný obrázek s jedinou změnou, ne vygenerovat nový
  (u arény měla každá varianta jiný záběr a dvě byly 4 : 3, vrstvy se pak musely skládat po
  částech a napasovat). Díly mohou mít průhledné pozadí. Text, na kterém záleží (čísla, nápisy na displejích, štítky), do obrázku
  nekreslit – doplňuje se jako SVG vrstva (generátory písmo komolí).
- Vrstvy (otevřený šuplík, otevřené dveře…) se z dílů skládají na autorově počítači pomocnými
  nástroji v `podklady/nastroje/` (v prohlížeči, výsledek WebP); v cloudové konverzaci tyto
  nástroje nejsou – tam vrstvy skládá AI asistent vlastními skripty (Python/Pillow), výsledek
  je stejný (malé WebP vrstvy přes celý obraz). Kde díl chybí, lze vrstvu složit
  z částí jiných obrázků autora. Velké obrázky vložené do SVG (MB) nahradit malými WebP vrstvami.
- Zadání obrázků pro autora: `docs/zadani-obrazku-*.md` – po dodání v nich označit, co je hotové.

## Testování

- Testovací prohlížeč AI asistenta nemá kameru – ověřit jde jen cesta bez kamery; kameru zkouší
  autor u sebe.
- **Zbývá ověřit skutečnou kamerou:** měření výskoku (`js/skok.js`, aréna), zkoušku stability –
  předklon (`js/predklon.js`, sklad) a goblet dřep (`js/goblet.js`, tělocvična – hlavně tolerance
  kolen a hlavy a výška lavičky). Zatím otestované jen na umělých datech (výskok: chyba
  doby letu do 10 ms, skok s protipohybem se nepočítá).
- **Po testu zavřít testovací záložky** – hra v nich hraje dál (podkres) i po zavření okna
  aplikace, protože aplikace na Windows běží v oznamovací oblasti.
- Testovací uložení dělat na jiném původu (`localhost` místo `127.0.0.1`), ať se nepřepíše
  autorova rozehraná hra, a po testu ho smazat.
