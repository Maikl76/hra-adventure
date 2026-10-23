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
- Tři světy (sekce), každý bude mít vlastních devět bran: **Laboratoře** (dříve „Civilní studium“;
  id světa zůstává `civilni` kvůli uloženým hrám), **Vojenská tělovýchova**, **GSPORT** (hra
  a pohyb, „levely“ místo bran).
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
  `predklon.js` i `goblet.js` importují `squats.js` také s `?v=` (všude stejné číslo; také `chodba.js`,
  `chodba3d.js`, `basket.js` a `strelnice.js` v `js/ui.js` a `svalovec.js` v `js/chodba3d.js`). Při každém nahrání změněného JS/CSS zvýšit spolu s `meta.version`, jinak
  prohlížeče hráčů míchají starý a nový kód. **První slovo `meta.version` musí být stejné jako `?v=`
  u `ui.js`**: když se liší (stará stránka z mezipaměti – GitHub Pages ji drží až 10 minut, autor tak
  17. 10. 2026 neotevřel basketbalový automat), hra se jednou sama znovu načte s `?v=<verze>`.
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
js/audio.js         zvuk generovaný v prohlížeči (Web Audio): podkresy, bouřka (dunění, hromy) a efekty, bez souborů
js/calc.js          plovoucí kalkulačka (vlastní rozbor výrazů, žádné eval)
js/brany.js         kresba bran v úvodním průletu
js/squats.js        počítání dřepů kamerou (GSPORT, herna)
js/skok.js          výskok z podřepu – doba letu (GSPORT, aréna)
js/predklon.js      zkouška stability – předklon (vojenská tělovýchova, sklad)
js/goblet.js        goblet dřep 90 s – platné a neplatné dřepy (vojenská tělovýchova, tělocvična)
js/chodba.js        chodba „z vlastních očí“ – chůze po krocích, kreslení jako DOOM (zkouška: sklep)
js/chodba3d.js      3D chodba (ukázka) – volný pohyb, skok s impulzem, doskok, lezení, laser (three.js)
js/svalovec.js      svalovec – kostra se svaly z tvarů v kódu, pózy a chování (three.js)
js/strelnice.js     odstřelovací puška – výhled do údolí, dalekohled s křížem v mil, dech, tep, let kulky, vítr
vendor/mediapipe/   MediaPipe Tasks Vision 0.10.14 + model pose_landmarker_lite (Apache 2.0)
vendor/three/       three.js 0.186.1, zmenšené (MIT) – jen pro 3D chodbu, načte se až v ní
data/game.json      VEŠKERÝ obsah hry
assets/             rooms/ (pohledy a vrstvy), items/, closeups/, book/, scares/, chodba/ (textury)
docs/               tyto poznámky a zadání obrázků pro autora (zadani-obrazku-*.md)
```

- Kamerové moduly se načítají až při volbě „S kamerou“ (dynamický import), nejdřív žádost
  o kameru, pak model. **Obraz se zpracovává jen v prohlížeči**, nic se neukládá ani neposílá.
  Nic se nestahuje z cizích serverů (vše ve `vendor/`).
- Postup hry v `localStorage`, zvlášť pro každý svět (`brany-biomechaniky-ulozeni-<svět>`);
  nastavení (zvuk, světlo, lekačky, bouřka, viděný úvod…) v `brany-biomechaniky-nastaveni`.
- Lokální spuštění: ve složce hry `python -m http.server 8765`, otevřít `http://127.0.0.1:8765`
  (dvojklik na `index.html` nestačí – hra načítá `data/game.json`).

## Formát `data/game.json` (stručně)

- `tracks` = světy a pořadí místností (`rooms`), vlastní `finish` (závěrečná obrazovka, `stats`
  = řádky s naměřenými hodnotami). `items` = předměty, `uses` = předmět na objekt,
  `combinations` = předmět + předmět.
- Místnost: `name`, `gateNumber`/`gateLabel`, `tracks`, `ambience` (podkres), `enterText`,
  `enter` (účinky při vstupu), `startView`, `views`, `gate` (kroky zámku brány), `locks` (malé
  zámky), `activities`, `scares` (lekačky), `phone` (polní telefon), `shortcut` (zkratka pro
  vyučující), `storm` (bouřka venku: `place` = `okno` | `budova` | `sklep` | `venku`, `steps` = příznaky
  postupu – bouřka s každým splněným sílí, u otevřené brány je nejsilnější; `venku` = záblesk přes
  celé nebe a hrom bez tlumení).
- Pohled: `background` (1672 × 941), `hotspots` (oblast v % obrázku, `click` = případy
  s podmínkou `when` a účinky `do`), `layers` (obrázky podle stavu), `lights`, `darkness`
  (síla tmy 0–1; tmavé obrázky autora ~0,6), `dust` (prach ve světle), sousedé `left`/`right`
  nebo `back`, `enterText`, `enter`.
- Podmínky `when`: `flags`, `notFlags`, `items`, `notItems`, `expr` (výraz s příznaky 1/0
  a proměnnými, umí `> < >= <= ==`), `vars` (proměnné, které musí existovat), `exprs` (seznam výrazů,
  všechny musí platit – výraz umí jen jedno porovnání).
- Účinek `text` může mít `more` (+ `moreLabel`, výchozí „Proč?“): krátká věta hned, delší vysvětlení
  až po kliknutí (méně čtení najednou). Totéž u místnosti: `enterText` + `enterMore` (+ `enterMoreLabel`,
  např. „Ovládání“). Ve 3D chodbě stačí v `texts` přidat `<klíč>More`.
- **Vzkazy od D.** (`nudges` u místnosti bez telefonu, `nudgeSeconds` výchozí 180): když tým tak dlouho
  nepostoupí (žádný nový příznak, předmět, zápis ani měření), ukáže se první vyhovující vzkaz
  (`when` → `text`), při dalším zaseknutí další v pořadí; obecný vzkaz bez `when` až když žádný cílený
  nesedí. Říkají, kam se podívat, ne řešení, a **do nápověd se nepočítají** (telefon ve skladu
  a tělocvičně zůstal, jak ho autor napsal – ten se počítá, `{"hint": true}`).
- **Sady čísel** (`variants` u místnosti = seznam sad hodnot, **první sada = původní čísla**): při nové
  hře se pro každou místnost vybere sada z **kódu úlohy** (`state.seed`: kód třídy zadaný na obrazovce
  „Kdo vstupuje?“ nebo z odkazu `?kod=…`, jinak náhodné čtyřmístné číslo; výběr = hash kódu a id
  místnosti, `Game.variantIndex`). Hodnoty se uloží do proměnných hráče: v textech `{v_…}`
  (i textové, např. `{v_sloupec}`), v odpovědích zámků jako vzorec (`"answer": "v_tiha*10"`), cílené
  rady přes `feedbackFormulas` s `tolerance`/`toleranceRel`. Starší uložení bez kódu dostane sadu 0.
  Sady mají: kabinet (tíha závaží 50/40/60 N → síla bicepsu 500/400/600 N), tělocvična (rtn. Doubek
  37 let III / 33 let II / 44 let IV → hlášení 2213/2221/1222, pás 13,5/14,0/13,0 km/h, klik v bráně
  80 kg 0,90/1,30 m → 543 N, 75 kg 0,85/1,25 → 500 N, 85 kg 0,95/1,35 → 587 N; známky ověřené podle
  brožury Normy, muži A), bludiště (schodiště 18×17 / 16×18 / 20×16 cm → 3 002 / 2 825 / 3 139 J),
  noční cvičiště (nosítka 80 kg 1,30/2,20 m → 464 N, 75 kg 1,20/2,00 → 441 N, 90 kg 1,40/2,40 → 515 N;
  protizávaží 0,7 kg 12/15 cm → 0,56 kg, 0,6 kg 15/12 → 0,75 kg, 0,8 kg 10/16 → 0,50 kg; výstup
  75+25 kg 420→720 m → 294 kJ, 80+20 kg 380→700 → 314 kJ, 70+30 kg 450→720 → 265 kJ),
  Spin zóna (stolice 1,0 ot/s 4,0→1,2 kg·m² → 3,3 ot/s, 0,8 3,6→1,2 → 2,4, 1,2 4,5→1,5 → 3,6; zatáčka
  70 kg 36,5 m 10 m/s → 192 N, 65 kg 40 m 9 m/s → 132 N, 75 kg 45 m 11 m/s → 202 N), fotolaboratoř
  (rychlost 3,55/0,5 s → 7,1 m/s, 3,2 → 6,4, 2,6 → 5,2; zrychlení 2,1→5,2 → 6,2 m/s², 2,0→4,8 → 5,6,
  2,4→5,6 → 6,4; energie 0,6 kg 1,23 m → 7,2 J, 0,5 kg 1,8 m → 8,8 J, 0,8 kg 1,0 m → 7,8 J), archiv
  (výkon na schodech za 6/5/7 s → 350/420/300 W), servisní chodba (pohybová energie při 4/3/5 m/s →
  560/315/875 J), stanoviště na kótě 680 (tabule 1,0 m na 400 m = 2,5 mil / 0,9 m na 450 m = 2,0 mil /
  1,4 m na 350 m = 4,0 mil; boční vítr zprava 4/3/5 m/s; brána: kontejner 6 m zabírá 12/15/20 mil → 500/400/300 m,
  pokles bez vzduchu při 820 m/s na 300/400/250 m → 65,7/116,7/45,6 cm).
  Kódy pro testy: **1259** = sada 0 v kabinetu a ve vojenském světě (Spin zóna a fotolaboratoř sada 1,
  archiv a servis sada 2, stanoviště na kótě sada 1), **2280** = všude sada 1 (stanoviště sada 2),
  **1314** = všude sada 2 (stanoviště sada 0); kód se sadou 0 ve všech
  osmi místnostech se sadami neexistuje – testy si odpovědi počítají z uložených proměnných. Diplom ukazuje
  řádek „Kód úlohy“. Herna, aréna a 3D chodba mají čísla z vlastního měření, ta se liší sama.
- **Deník docenta D. a mapa bran** (`diary` v kořeni): `mapNote`, `pages` [{ `id`, `room`, `short`
  (název na mapě), `track`, `gate` (popisek brány), `title`, `text` (odstavce `\n`), `sign` }]; stránky
  se číslují po světech podle pořadí v seznamu. Stránku dá účinek
  `{ "denik": "<id>" }` (v `open` brány, u bludiště v `open` zámku mříže, ve 3D chodbě po porážce
  svalovce z `ui.js`) – jen jednou; příznak `denik_<id>` a zároveň **sdílené nastavení** `denik`
  v prohlížeči, takže mapa ukazuje postup napříč světy. Okno se stránkou (linkovaný papír, rukopis),
  zápisník má sekci „Deník docenta D.“, **Mapa bran** = tři světy vedle sebe, v každém
  `meta.totalGates` (9) bran odspodu nahoru: postavené brány (místnosti s `gate`) s číslem a jménem,
  chodby mezi nimi (bludiště, 3D chodba) jako menší kolečka, nepostavené přerušovaně; nahoře společná
  střecha, kam vede devátá brána každého světa. V Menu i na titulní obrazovce; zlatá = prošlá (klik
  otevře stránku). Teď 14 stránek (kabinet, archiv, fotolaboratoř; sklad, bludiště, tělocvična, chodba
  na cvičiště, noční cvičiště, stanoviště na kótě 680; herna, servisní chodba, aréna, chodba k LEVELU 3, Spin zóna).
- **Diplom** (závěrečná obrazovka): hvězdičky 1–3 podle nápověd a chybných pokusů (meze `finish.stars`,
  výchozí 3★ = 0 nápověd a ≤ 3 chyby, 2★ = ≤ 2 nápovědy a ≤ 8 chyb), odznaky společné (`badges` v kořeni:
  Bez nápovědy, Pevná ruka) a světa (`finish.badges`: `when`, `maxHints`, `maxErrors`, `maxMinutes`),
  tým, svět a datum (`state.finishedAt`). `finish` světa doplňuje společný `finish` hry (svět Laboratoře
  má jen odznaky). Nové proměnné: `padnuti` (pády v bludišti a 3D chodbě), `doskoky_mekke`,
  `doskoky_tvrde`; příznak `puska_cviciste`.
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
  medicinbal, granát; kolo má `speed`, `h0` = výška odhodu, `target`, volitelně `pose: "sed"`
  = postava sedí u stěny a `x0` = jak daleko před stěnou míč opouští ruku, dolet se měří od stěny), `gobletsim` (panáček v dolní poloze goblet dřepu), `goblet` (goblet dřep
  90 s), `stretcher` (nosítka: dva nosiči, raněný se táhne po nosítkách, momenty kolem rukou zadního
  nosiče; kola `goal` = `equal` | `rearMax`), `helmet` (přilba s noktovizorem: hmotnost a vzdálenost
  protizávaží, moment a síla šíje; kola `goal` = `balance` | `lightest`), `slope` (mapa se svahem:
  trasy `routes` se stejným převýšením, otázka `question`, rozkaz `mission` s mezí času a výkonu),
  `spin` (otočná stolice: zachování momentu hybnosti, kola s `dumbbellKg` a cílem `targetOt`), `curve`
  (zatáčka: dráhy oválu, kola `compare` s otázkou a `grip` s třením μ), `gyro` (pirueta měřená
  gyroskopem zařízení – `devicemotion`, na iOS s dotazem na povolení; bez senzoru čas tří otáček),
  `strobo` (stroboskopická fotografie: `frames` [{t, s}], pásmo `ruler`, měřítko `calib`, předmět
  `runner`|`ball`, cíl `speed`|`g`; ukazatele blízko značky přiskočí), `sniper` (odstřelovací puška,
  `js/strelnice.js`: `rifle` {v0, k, sight, zero}, `positions` {stoj|klek|leh: sway, breath, pulse, recoil, text},
  `heart` {start, again, rest, tau}, `breath` {rate, steady, max}, `targets` [{id, d, az, size, board, label}],
  `rounds` [{target, label, task, spot, wind {speed, from}, range {ask, tolerance}, hint, done, why}], `texts` =
  hlášky pozorovatele; viz Brána IV).
  Výsledky se uloží do `vars` a provedou se účinky `done` (`doneCases` = první platný
  případ s podmínkou).
- Kniha (`book` u předmětu): stránky z bloků `heading`, `p`, `formula`, `note`, `image`
  a `table` (`caption`, `head`, `rows`; první buňka řádku je záhlaví) – tabulky norem v brožuře.
- **Chodba „z vlastních očí“** (`"type": "corridor"`, kreslí `js/chodba.js`): místo pohledů má
  `corridor` – `map` (řádky; `.` = chodba, jiné znaky = zdi), `start` {x, y, dir N/E/S/W}, `legend`
  (znak → textura, nebo seznam variant s `when`), `textures` (obrázky 512 × 512), `floor`, `ceiling`,
  `lamps` (zářivky na stropě, `flicker` = bliká). Znak v `legend` může být i `{ texture, openWhen }`
  = zeď, která se při podmínce otevře (závora). Objekty jsou v `hotspots` s `cell` [x, y] místo
  `area`: kliká se na zeď přímo před hráčem; `hidden` = hra je neohlašuje (uvolněná cihla).
  Poloha hráče se ukládá (`state.places`). Kostlivci: `skeletons` (id, `cell`, `bones` = kosti
  k zásahu v pořadí), `skeleton` (obrázky `image`/`pile`, `zones` = oblasti kostí v % obrázku,
  `bones` = název a kde je, `texts` = hlášky, `lives`, `attackSeconds`, `firstAttackSeconds`,
  `moveSeconds`, `wakeCells`), `weapon` = obrázek pušky; zbraň = předmět `weaponItem`
  (výchozí `laserova_puska`). Účinek `heal` doplní životy. Poražený kostlivec = příznak `kostlivec_<id>`.
  Objekt s `pile: "<id kostlivce>"` místo `cell` = hromádka kostí na podlaze, kde kostlivec padl.
  Klikací plocha objektu na zdi je přes celou zeď; **hromádka kostí má plochu jen přes kosti** na
  podlaze (počítá ji `Corridor.pileRect`), takže klepnutí jinam do středu obrazu je dál krok vpřed.
  `hideWhen` = podmínka, kdy objekt zmizí – hromádky mají `{ "flags": ["kost_<id>_vzata"] }`, po
  sebrání kosti tedy plocha zmizí úplně. (Oprava 22. 10. 2026, verze 0.30: autor na tabletu nemohl
  po sebrání kosti jít dál – velká čárkovaná plocha přes střed obrazu zachytávala klepnutí a krok šel
  jen klepnutím úplně nahoru.)
- **3D chodba** (`"type": "world3d"`, kreslí `js/chodba3d.js` + `js/svalovec.js` přes three.js): místo
  pohledů má `world` – rozměry v metrech (x vlevo/vpravo, dopředu je −z): `hall` (x, z, výška),
  `textures` (zeď, podlaha, strop, potrubí, puška), `player` (`start`, `yaw`, `kg`, `force` = síla
  odrazu nad tíhu v N, `pushMax` = nejdelší odraz v s), `checkpoint` (návrat po porážce), `backpack`,
  `blocks` (bedny a plošina: `x`, `z`, `h`, `label`), `ladder` (žebřiny na čele plošiny), `edgeSign`,
  `rack` (stojan s puškou), `door`, `lamps` ([x, z, bliká]), `zone3` (kde chodí svalovec), `svalovec`
  (`at`, `attacks`, `windup` = délka nápřahu v s, `speed`), `attacks` (název, `target` = sval, který útok
  provádí, `prompt`), `muscles` (název a funkce svalu), `texts` (všechny hlášky s {proměnnými}),
  `ids` (příznaky a stránka deníku té chodby: `defeat`, `end`, `skipped`, `diary` – výchozí jsou hodnoty
  chodby na cvičiště, GSPORT chodba má vlastní), `door.view` = `"neon"` (za dveřmi neonová chodba místo
  nočního cvičiště), `door.label`.
  Svaly svalovce (id) a jejich úpony jsou v `js/svalovec.js`. Příznaky: `svalovec_porazen`,
  `prekazky_konec`; proměnné `svaly_spravne`, `svaly_chybne`, `skok_max`.
- Aktivita `basket` (basketbalový automat, `js/basket.js`): trestný hod z boku ve skutečných rozměrech
  (odhod z 2,2 m, obroučka 305 cm ve 4,225 m, průměr 45 cm, míč 24 cm, odrazy od obroučky a desky).
  Prak (tah od míče), šipky / tlačítka ± úhel a rychlost, „Hodit“ = znovu se stejným nastavením.
  `throws`, `need` (výhra), `hintAfter` + `hint` (nápověda po neúspěšných kolech); výsledek `kose`
  (nejlepší kolo), `kos_uhel`, `kos_rychlost`. Po hodu: kde míč prošel výškou obroučky a pod jakým
  úhlem (otvor = 45 cm · sin úhlu; pod 32° menší než míč). Funguje třeba 55° a 7,2 m/s.
- **Průhledy do vedlejších místností** (od verze 0.31, bez změny enginu): objekt s účinkem `{ "view": "<id>" }`
  vede do pohledu s `back` (tlačítko Zpět, šipka dolů) a `enter` = `{ "set": "nahled_<místnost>" }` jednou;
  otvor v pohledu místnosti od autora je vrstva bez podmínky (dveře, okno, závěs, stan). Odznak **Zvědavec**
  v každém světě, když jsou všechny příznaky `nahled_*` daného světa. Seznam v „Světy a místnosti“.
- Kontrola `validate` hlídá i oblasti objektů: `[x, y, šířka, výška]` v % obrázku, kladná velikost, uvnitř obrázku
  (23. 10. 2026: omylem zadané [x0, y0, x1, y1] daly zápornou šířku a objekt nešel kliknout).
- **Dohraný svět, do kterého přibyla místnost** (např. Brána IV za cvičištěm): uložená hra se při načtení vrátí
  z diplomu do nové místnosti (`loadSave`), jinak by ji hráč, který svět dohrál dřív, neviděl.
- Aktivita `skeleton` (skládání kostry): `image` (kostra s mezerami), `slots` [{ `id`, `item`, `name`,
  `image` (vyříznutá kost), `box` (její poloha v % obrázku), `marker` (otazník v %), `where`, `hint` }];
  vrácená kost = příznak `kostra_<id>`, chyby `kostra_chybne`, po poslední kosti `done`.
- **Zkušební místnost** světa: `trialRooms` u sekce ({ místnost: kam vede }). Hraje se jen přes
  odkaz `?mistnost=<id>`, běžná hra ji přeskočí; po odchodu pokračuje hra místností, kam vede.
  (Teď nepoužito – bludiště bylo zkušební do 17. 10. 2026, 3D chodba na cvičiště 19. 10. 2026.)
- **Změna pořadí místností** ve světě: uložená hra si pamatuje i id místnosti (`roomId`), takže
  pokračuje ve správné místnosti. Starší uložení `roomId` nemají – pro ně u sekce `roomsBefore` =
  pořadí před změnou (vojenska: `["sklad", "telocvicna"]`, než přibylo bludiště). Uložená zkušební
  místnost, která je mezitím běžnou místností, se převede na běžnou.
- Lekačky `scares`: `image`, `sound` (`scareHit`/`scareStatic`/`scareRush`), `delay` (napětí,
  podkres ztichne), `duration`, `rush`, `position` (co zůstane v záběru na úzkém displeji),
  `after` (text připsaný potom). Každá jen jednou za hru.
- Engine při načtení kontroluje odkazy (`validate`) – chyby vypíše do konzole prohlížeče.

## Světy a místnosti (stav)

### Laboratoře – Brána I: Anatomický kabinet (`kabinet`)
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
Nápady, které autor schválil pro další vojenské místnosti (protizávaží u přilby, mapa se svahem,
nosítka), jsou od verze 0.28 v Nočním cvičišti (Brána III). Decimální váha a psací stroj jsou
v tělocvičně (Brána II).

### Vojenská tělovýchova – Sklep: Sklepní bludiště (`chodba`)
Autor chtěl vyzkoušet pohyb jako v DOOMu (16. 10. 2026): chodby z vlastních očí, místnosti zůstávají
s obrázky. Chůze **po krocích** a otočení o 90° (méně se z toho dělá špatně, jde ovládat i tlačítky
na tabletu), krátká animace (při „omezit pohyb“ okamžitě). Vlastní kreslení (žádný kód DOOMu – jeho
licence by si vynutila změnu licence hry). Nejdřív zkušební místnost (`trialRooms`, jen přes odkaz);
**17. 10. 2026 autor schválil zařazení**: svět vojenska = sklad → bludiště → tělocvična (od 19. 10. 2026
ještě → 3D chodba na cvičiště). Ze skladu
vede schodiště nahoru do sklepních chodeb, z bludiště schodiště do tělocvičny. Odkaz
`?mistnost=chodba` začne rovnou v bludišti (s kalkulačkou). Laserovou pušku hráč u mříže vrátí do
stojanu (`remove`) – do tělocvičny se nenosí. Pozor na obrázky: otevřené dveře skladu ukazují
schodiště nahoru, ale textura `dvere_sklad` v bludišti ukazuje za dveřmi rovnou regály skladu –
texty to překlenují („tudy jsi přišel ze skladu“), čisté řešení by byla nová textura nebo vrstva.
Starší uložené hry: viz `roomsBefore` / `roomId` ve formátu game.json.
Po první zkoušce autor chtěl delší chodbu se zatáčkami a střelbu na kostlivce – zvolil (Menu otázek):
**anatomie** (trefit jmenovanou kost), **cvičná laserová puška** (laser game, bez krve, kostlivec se
rozsype na hromádku kostí), **kostlivci útočí, 3 životy** (po ztrátě všech zpět ke dveřím skladu;
Menu → „Kostlivci útočí: ano/ne“), **bludiště s odbočkami**.
Bludiště 21 × 16 políček (deska podlahy 2,4 m), cesta start → mříž 50 kroků (120 m), slepé uličky:
- **Azimut a vzdálenost**: nástěnka u startu – klíč od zbrojní skříně „od hasicího přístroje 4,8 m na
  azimut 0°, pak 9,6 m na azimut 90°, otoč se na 180°“ → uvolněná cihla (skrytý objekt). Kompas
  nahoře (0° S, 90° V, 180° J, 270° Z).
- Zbrojní skříň → **laserová puška**; závora s čidlem se otevře zásahem laserem.
- **8 kostlivců** (autor chtěl víc, 17. 10. 2026), každý 2 kosti:
  k1 (14,9) stehenní + pažní, k6 (12,9, slepá chodba s plakátem) žebra + předloktí,
  k2 (17,13) klíční + pánev, k3 (18,9) hrudní + holenní, k4 (16,4) čéška + lýtková,
  k8 (11,3) páteř + hrudní, k5 (11,1, slepá chodba) lebka + pažní, k7 (18,1, u mříže) kosti nohy + čéška.
  Rozmístění tak, aby se dva nebudili naráz (k8 je až na konci řady 3, z cesty k mříži ho hráč
  neprobudí). Oblasti kostí na obrázku kostlivce (`zones`); chybný zásah řekne, co hráč trefil
  a kde hledaná kost je. Plakát kostry ve slepé uličce (nápověda), lékárnička doplní životy.
  Kostlivec se probudí, když hráče uvidí (do 4 políček v přímé chodbě), jde k němu (1 políčko za
  2,2 s) a u hráče útočí (první po 5 s, pak každé 6 s).
- Po autorově zkoušce na tabletu („nemůžu trefit kost, pořád mě to vrací na začátek“): zásah počítá
  kost nejbližší místu ťuknutí, když je do 24 px obrázku (`tolerance`); kostlivec u hráče přistoupí
  k okraji políčka (větší terč); puška vpravo dole a nápis s kostí vlevo nezakrývají kostlivce;
  po chybě hledaná kost na kostlivci 2,6 s bliká; po poraženém kostlivci se doplní životy; po ztrátě
  životů se hráč vrátí jen tam, kde ho kostlivec uviděl (ne na start).
- **Mříž ke schodišti**: práce vojáka s batohem při výstupu W = m · g · h = 100 · 9,81 · 18 · 0,17
  ≈ **3 000 J** (±3 %; cílené rady), údaje na nástěnce a na ceduli (18 schodů × 17 cm).
- **Kostra z kabinetu** (autor zvolil 17. 10. 2026, varianta „vrátit kosti“): z každé hromádky po
  kostlivci hráč vezme jednu kost (vždy jednu z těch, na které střílel) – k1 stehenní, k2 klíční,
  k3 holenní, k4 lýtková, k5 pažní, k6 kosti předloktí, k7 čéška, k8 hrudní – a vrátí je kostře
  z anatomického kabinetu na stojanu u mříže (políčko X = 18,2, textury `stojan_kostra` / `_cela`).
  Otazníky jsou odtažené od kostry (u bérce jeden uvnitř, druhý vně), špatně vrácená kost řekne, kam
  patří a co na tom místě chybí. **Bez celé kostry se mříž neotevře** (z chodby se nedostane). Obrázky
  (kostra s mezerami, kosti, ikony, stojan) jsou vyříznuté z autorova kostlivce podle obrysů kostí
  (čéška zůstává na kostře); autor může později dodat vlastní obrázek stojanu.
- Závěrečná obrazovka: „Kostlivci – anatomie: … správných zásahů, … vedle“ (`kosti_spravne`, `kosti_chybne`)
  a „Kostra z kabinetu: složená, chyb při skládání …“ (`kostra_chybne`).
Ovládání: ↑ ↓ / W S krok, ← → / A D otočit, tlačítka ▲ ▼ ‹ ›, kliknutí do obrazu (vlevo / vpravo
otočit, uprostřed krok; když je vidět kostlivec, kliknutí střílí), Enter = věc před hráčem.
Malá mapa prošlých políček. Textury od autora (WebP 1024 × 1024): zed, hasicak, dvere_sklad,
cedule_schody, lekarnicka, nastenka, mriz, plakat_kostra, potrubi, schodiste, zavora, zbrojni_skrin,
zbrojni_skrin_prazdna, sipka, podlaha, strop, kostlivec, kosti, puska (všechny) – u zdí pruh podlahy pod soklem
oříznut, jas srovnán podle `zed`, okraje prolnuté do společného okraje zdi (pás 40 px), aby zdi
navazovaly v libovolném pořadí. Výjimky: u `potrubi` se řádky s trubkami neprolínají (trubka vede až
k okraji, prolnutá vypadala rozmazaně); `schodiste` je vodorovně natažené, aby rám otvoru seděl
s rámem mříže (po odemčení obraz neposkočí); na nástěnce generátor napsal ROZPIS – přepsáno na ROZKAZ
(jako text po kliknutí). Nápisy, které generátor napsal správně (cedule, popisky plakátu, šablona
TĚLOCVIČNA – SCHODIŠTĚ, štítky ČIDLO a ZBROJNÍ SKŘÍŇ), zůstaly. Podlaha a strop jen zmenšené
(spára po okraji = hranice desek 2,4 m, podle nich hráč počítá kroky). Kostlivec: autor poslal dvě
skoro stejné verze, použita druhá (světlejší, ve tmě lépe vidět); zmenšen na 256 × 512 (s vynásobenou
průhledností, aby okraje neztmavly) a posunut o 32 px dolů (chodidla v 99,5 % výšky, stojí na podlaze).
Oblasti kostí (`skeleton.zones`) změřené na novém obrázku; pánev ve dvou dílech (horní celá šíře,
dolní jen střed), stehenní je v pořadí před pánví, aby hlavice stehenní kosti počítaly za stehenní.
Hromádka kostí (256 × 128) a puška (400 × 240) jen zmenšené (z dvojic skoro stejných verzí: kosti
s více žebry, puška s výraznější zelenou září). Lebka na hromádce je stejně velká jako u stojícího
kostlivce. Ústí pušky vyšlo na (180, 78), hra počítá s (180, 82) – rozdíl pod 3 px, kód beze změny.
Zástupná SVG v `assets/chodba/` zůstala jako záloha (hra je nenačítá).
Kreslení ~15–20 ms na snímek v testovacím prohlížeči.

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
pak s batohem 15 kg) → odhodový sektor (odhod medicinbalu 4 kg **vsedě u stěny** – záda opřená,
nohy natažené, od hrudníku obloukem: 5,5 m/s z výšky 0,9 m, 0,5 m před stěnou, měří se od stěny;
jednička 4,35 m vyjde asi pod 35–42°, nejdál 4,38 m pod 38°, 45° dá jen 4,31 m; granát 20 m/s
z 2 m na 42 m) → panáček „Proč taková pravidla?“ → **goblet dřep 90 s** (kamerou, bez kamery
počítá kolega, nebo vynechat). Brána: síla rukou při kliku `80*9.81*0.9/1.3` N (±3 %, cílené rady),
práce při výdrži ve shybu **0 J**, úhel hodu z výšky (o něco níž než 45°), proč kettlebell vpředu.
Polní telefon (`telefon_tv_zvoni`), zkratka `?mistnost=telocvicna`. Všechny čtyři pohledy
a varianty od autora (varianty jako vrstvy; v hlášení dva řádky přepsané bez shybů); zástupné
zůstaly jen ikony předmětů
(`docs/zadani-obrazku-telocvicna.md`).
- Goblet dřep (zadání autora): kettlebell 5 kg u hrudníku, lavička ve výšce kolene – **jen dotyk**,
  kolena ani hlava nesmí být po celou dobu před špičkami. Neplatný dřep se nepočítá, hra ukáže
  důvod (koleno, hlava, nedosedl, posadil se). Kamera ze stoje změří výšku kolene (= lavička)
  a svislici špiček. Po autorově zkoušce (2 cm bylo „téměř nesplnitelné“) jsou tolerance
  velkorysé: koleno a hlava smí přes čáru špiček až 8 cm a musí to trvat aspoň 5 snímků za sebou
  (`kneeTolCm`, `headTolCm`), dotyk lavičky = kyčel do výšky kolene + 9 + 8 cm (`seatTolCm`),
  „posadil se“ = dole déle než 1,5 s (`sitSeconds`). Doladit v `game.json` podle zkoušek. Náhrada kettlebellu (láhev,
  batoh) nebo bez zátěže = výsledek „orientační“. Normy ukázané po testu: BI, do 30 let.
- **Muži volí** (zadání autora): silová část leh-sed + kliky, nebo shyby; vytrvalost běh 12 min,
  nebo plavání 300 m. Doubek zvolil běh a leh-sed + kliky, proto v hlášení shyby nejsou.
- Normy přesně podle Excelu; opravena jen zřejmá chyba (plavání ženy VII 8:04 / 9:10 / 10:18)
  a desetinná opakování v kategoriích BI a C zaokrouhlena nahoru (autor schválil).

### Vojenská tělovýchova – Chodba na cvičiště, 3D (`prekazky`)
Autor chtěl chodbu, kde se dá skákat, někam vylézt a bojovat s kostrou pokrytou svaly, která se
pohybuje jako ve 3D (19. 10. 2026). Zvolil (Menu otázek): **nová chodba za tělocvičnou** (tělocvična
končí „chodbou ven na cvičiště“), **volný pohyb jako v moderních hrách** (myš + klávesy; na tabletu
páčka a tlačítka), **svalovec postavený v kódu** (kosti + svaly jako vřetena mezi začátkem a úponem;
realistické modely mají licenci CC BY-SA, generované modely nejsou anatomicky přesné),
**boj cvičným laserem** (laser game, bez krve). Nejdřív zkušební místnost, **týž den autor schválil
zařazení za tělocvičnu**: vojenska = sklad → bludiště → tělocvična → chodba na cvičiště. Brána II
v tělocvičně vede do chodby, dveře na cvičiště (po svalovci) na závěrečnou obrazovku světa (text
upravený: „Chodba z tělocvičny je za tebou…“, lísteček od D. beze změny; řádky svalovec a nejvyšší
výskok). **Bez WebGL** hláška `noWebgl` a tlačítko „Přeskočit chodbu“ (proměnná
`prekazky_preskoceno`, řádek na závěrečné obrazovce). Odkaz `?mistnost=prekazky` začne rovnou
v chodbě. Knihovna three.js (MIT) je ve `vendor/three/`.
Řetěz (chodba 32 × 6 m, strop 4,2 m): bedny **0,4 m a 0,6 m** (skok) a batoh **15 kg** → bedna **1,2 m**
(vylézt, E) nebo **žebřiny** → plošina **2,0 m** → **seskok** (drž C = podřep) → stojan s puškou →
**svalovec** → dveře na cvičiště (otevřou se, až svalovec padne) → konec ukázky.
- **Skok = impulz:** mezerník se drží (odraz), impulz J = F · t (F = 420 N nad tíhu, t nejvýš 0,6 s
  → 252 N·s), v = J : m, h = v² : 2g → bez batohu nejvýš 0,66 m (0,6 m stačí odraz ≥ 0,57 s),
  s batohem (85 kg) jen 0,45 m – na 0,6 m nevyskočí, na 0,4 m těsně ano. Hláška po každém skoku
  s čísly; na bednu před hráčem: potřebná rychlost √(2gh) a impulz m · v.
- **Lezení = práce:** žebřiny 2,0 m (W = m · g · h = 1 373 J, výkon W : t), vylézt (E) na výšku
  0,65–1,35 m (1,2 m = 824 J, z bedny na plošinu 0,8 m = 549 J); na 2 m ze země „nevylezeš“.
- **Doskok:** pád z výšky ≥ 0,9 m → dopadová rychlost √(2gh), průměrná síla F = m · v : t + m · g;
  s podřepem (C) brzdění 0,3 s, jinak 0,05 s. Ze 2 m: 2,1 kN (3× tíha), resp. 9,5 kN (14×) → nad
  12× tíhy ztráta života (jen když jsou v Menu útoky zapnuté).
- **Svalovec (výukově funkce svalů):** útoky **kop** → čtyřhlavý sval stehenní (natahuje koleno),
  **sevření** → velký sval prsní (přitahuje paže před tělo), **úder shora** → trojhlavý sval pažní
  (natahuje loket; ruka nad hlavou, takže zadní strana paže je vidět zepředu – úder pěstí to neuměl).
  Při nápřahu (**4 s**) se nahoře v obraze ukáže pruh: název útoku, co zasáhnout a ubývající čas;
  hráč zasáhne sval, který útok **provede** (sval se při nápřahu natahuje, při úderu zkrátí, ztluští
  a rozzáří). Zásah platí při nápřahu, úderu i chvilku po něm. Správně = útok vypnutý (sval zešedne),
  po všech třech se svalovec zhroutí. Vedle = název a funkce trefeného svalu (i krátce v obraze);
  mimo útok „teď nepracuje“. **Nápověda:** po chybě (nebo když útok proběhne bez zásahu) cílový sval
  žlutě bliká – jako v bludišti bliká hledaná kost. **Shovívavé míření:** platí i výstřel těsně vedle
  svalu (do 5 cm od jeho okraje) nebo do kosti, za kterou sval leží. Úder svalovce = život (3), po
  porážce zpět pod plošinu, **vypnuté svaly zůstanou vypnuté**. Menu → „Kostlivci útočí“ platí
  i pro svalovce. (Úpravy 19. 10. 2026 po zkoušce autora: svalovec „skoro nešel zabít“.)
- Ovládání: klik do obrazu = rozhlížení myší (Esc uvolní – pak jdou tlačítka nahoře), W A S D /
  šipky, mezerník, C, E, laser klik / Enter / X; PageUp/PageDown nebo R/F = pohled nahoru/dolů.
  Dotyk: chůze = prst **kamkoli do levé části obrazu** a táhnout (páčka se objeví pod prstem – pevné
  kolečko autorovi na tabletu šlo hůř), tah prstem vpravo = rozhlížení, klepnutí = výstřel, tlačítka
  Skok, Podřep, Akce, Laser.
  Pomalý počítač: hra sama sníží rozlišení.
- Zkouška autora (19. 10. 2026): běží plynule; svalovce „skoro nešlo zabít“ a kolečko na tabletu šlo
  hůř → úpravy ve verzi 0.22 (viz výše).
- **Zbývá:** další svaly a útoky (např. výskok → trojhlavý sval lýtkový), případně uložení polohy
  v chodbě (teď se po zavření prohlížeče začíná na začátku chodby).

### Vojenská tělovýchova – Brána III: Noční cvičiště (`cviciste`)
Tři náměty, které autor schválil 21. 10. 2026 (nosítka, protizávaží u přilby, mapa se svahem),
postavené 22. 10. 2026 ve verzi 0.28 jako první místnost **venku** (noc, bez kamery, podkres
`cviciste` = vítr, cvrčci, sova, plachta, generátor; bouřka `venku`). Čtyři pohledy: polní stůl
s mapou (sem hráč přijde) → stojan s přilbami → brána → polní ošetřovna (stan) → zpět. Rtn. Doubek
sedí v ošetřovně s ramenem v šátku (svalovec ho trefil úderem shora), na radiostanici komise.
Řetěz (pořadí volné): **nosítka** (figurína 80 kg, 1,80 m, těžiště 56 % od chodidel, nosítka 9 kg,
ruce 2,40 m od sebe; kolo 1 oba stejně → raněný posunutý k nohám, kolo 2 Doubek vzadu nejvýš 370 N →
raněný dopředu, k tobě) → **noktovizor** z bedny v ošetřovně → **přilba** (noktovizor 0,7 kg 12 cm
před osou kloubu lebka–atlas = 0,82 N·m, šíje s ramenem 5 cm by držela 16 N; kolo 1 váček pevně
na 10 cm → 0,84 kg, kolo 2 nejlehčí = na 15 cm → 0,56 kg; ukazuje i celkovou hmotnost na krku) →
**mapa se svahem** (voják 70 + 20 kg, tábor 400 → stanoviště 680 m; trasy A spádnicí 560 m / 30° /
nejvýš 2,5 km/h, B serpentinami 1 400 m / 12° / 4,5 km/h, C po silnici 2 400 m / 7° / 5,5 km/h;
práce proti tíze 247 kJ **u všech stejná**, složka tíhy podél svahu m·g·sin α, čas a výkon podle
tempa; nejdřív otázka „kde nejvíc práce“ = stejně, pak rozkaz do 20 min a výkon ≤ 300 W: C to
nestihne, A jen pomalu, B pohodlně; po aktivitě „Proč je to ve skutečnosti víc?“ = účinnost ~25 %
a cena kroků). **Brána III** (číselník u brány, sady čísel): síla předního nosiče `m·g·x/L` v N,
protizávaží `m·d₁/d₂` v kg (±0,02), práce proti tíze `(m+výstroj)·g·Δh/1000` v kJ, volba „stejná práce,
vyšší výkon“. Cílené rady: celá tíha, polovina, kg místo N, zadní nosič; stejná hmotnost, prohozené
vzdálenosti, kg·cm, zbytečné g; jouly, bez výstroje, bez g, nadmořská výška místo převýšení.
Vzkazy od D. (`nudges`), deník strana „Vzdálenost od osy“, závěr světa „Brána III je otevřená“
(šest bran zbývá), nové řádky diplomu (nosítka, protizávaží, výstup) a odznak **Rychlá hlídka**
(na stanovišti do 15 min = trasa A pomalu); odznak Rychlík vojenského světa zvednut na 90 minut.
Zkratka `?mistnost=cviciste`. Zástupné kresby (noc, stan, stůl, stojan, brána + vrstva otevřené brány),
zadání pro autora `docs/zadani-obrazku-cviciste.md`.
- Fyzika: nosítka = páka s osou u rukou zadního nosiče, F·L = m_r·g·x + m_n·g·L/2 (nosítka mají
  těžiště uprostřed); přilba = rovnováha momentů m₁·d₁ = m₂·d₂ (g se vykrátí), protizávaží dál od osy
  = lehčí, ale každý gram nese krční páteř; svah = W = m·g·Δh nezávisí na cestě, P = W/t, síla podél
  svahu m·g·sin α; nejvyšší tempo klesá se sklonem (realistické meze, ne vzorec).
- Od verze 0.31 vede Brána III na **stanoviště na kótě 680** (Brána IV); noktovizor hráč při otevření Brány III vrátí
  do bedny (`remove`). Průhled: **polní kuchyně** (stan v dálce vlevo u stolu).
- **Zbývá:** obrázky od autora.

### Vojenská tělovýchova – Brána IV: Stanoviště na kótě 680 (`strelnice`)
Autor 23. 10. 2026: „střelba s odstřelovací puškou, kde je možné zaměřit přes dalekohled na zbrani, jako ve hrách
s tematikou odstřelovačů“ (výjimka ze zákazu zbraní – viz Rozhodnutí autora). Postaveno ve verzi 0.31 za nočním
cvičištěm: svítání na kótě 680 (kam vedl výstup z mapy se svahem), rtn. Doubek s rukou v šátku je pozorovatel.
Čtyři pohledy: palebné postavení (sem hráč přijde) → stan správce střelnice → Brána IV → pozorovací věž (+ průhled
do **pozorovatelny** pootevřenými dveřmi) a z postavení přiblížený **výhled do údolí** (obrázek kreslí `js/strelnice.js`,
stejná krajina jako v dalekohledu). Řetěz: kufr s puškou (kód = **úsťová rychlost 820 m/s** z krabice s náboji ve stanu,
cílené rady 343 = zvuk, 2952 = km/h) → chrániče sluchu (bez nich Doubek k pušce nepustí; „Proč?“ decibely) →
balistická karta (kniha s tabulkou, je vidět i v dalekohledu) a Příručka střelce → **střelba** (aktivita `sniper`) →
Brána IV. Podkres `strelnice` (vítr, skřivan, vrána, vzdálený zvon), bouřka `venku`.
- **Puška (`js/strelnice.js`)**: výhled do údolí → klepnutí na cíl zvedne dalekohled (zvětšení 4–16×, kříž v první
  ohniskové rovině s dělením po 0,5 mil, takže jím jde měřit). Tah prstem/myší posouvá krajinu, šipky jemně,
  kolečko a + − zvětšení, klávesy 1–3 polohy, Shift / tlačítko = zadržet dech, F / mezerník / Enter = výstřel, V = výhled.
  **Tělo střelce:** houpání podle polohy (vstoje 2,2 mil, vkleče 1,0, vleže na dvojnožce 0,22 – opěrná plocha a výška
  těžiště), dech zvedá pušku (cyklus nádech–výdech–**dechová pauza**, ukazatel v dalekohledu), zadržení dechu zklidní,
  po 5 s se ruce začnou třást a po 8 s si tělo vynutí nádech; každý tep cukne křížem, tep po výstupu 130/min klesá
  k 68 (τ = 40 s), změna polohy ho zvedne. **Střela:** v0 = 820 m/s, odpor vzduchu k = 0,00076 1/m (v = v0·e^(−kx),
  t = (e^(kx) − 1)/(k·v0)), pokles ½·g·t², dalekohled 5 cm nad hlavní, nastřelení na 100 m; boční vítr w·(t − x/v0);
  rozptyl asi 1 úhlová minuta. Karta: 300 m 1,6 mil, 400 m 2,8, 500 m 4,2 (vítr 0,26 mil na 1 m/s), 600 m 5,8.
  Dopad: gong se rozhoupe a zabliká, jinak prach na valu/zemi; stopa střely v dalekohledu; zvuk gongu přijde se
  zpožděním d/343 (jen atmosféra). Pozorovatel hlásí odchylku v mil (nízko/vysoko, vlevo/vpravo) a jednou za okno
  radí polohu, tep a dech; po 3 chybách nápověda úkolu.
- **Čtyři úkoly:** gong 100 m (40 cm, míří se přímo; vyzkoušet polohy), gong 300 m (karta: 1,6 mil výš), gong pod
  tabulí neznámé vzdálenosti (sady čísel; nejdřív změřit křížem a zapsat vzdálenost = velikost × 1 000 : mil, ±8 %),
  gong 500 m ve větru zprava (karta: 4,2 mil výš a vítr × 0,26 mil doprava). Každý úkol má „Proč?“ (posturální
  výkyvy, pád střely, podobné trojúhelníky, vítr po celou dobu letu). Výsledky: `strelba_strely`, `strelba_zasahy`,
  `strelba_vzdalenost`, `strelba_dech`, `strelba_vleze`; průběh se ukládá (`sn_kolo`…), zavřené okno pokračuje.
- **Brána IV** (5 kroků): vzdálenost kontejneru 6 m podle mil (sady), pokles bez vzduchu ½·g·(d/820)² v cm (sady),
  volby: vystřelená a upuštěná kulka dopadnou současně, proč je poloha vleže nejstabilnější, kdy stisknout spoušť
  (dechová pauza). Deník „Dechová pauza“ (kniha střelnice v pozorovatelně má zápis D.), závěr vojenského světa „Brána IV
  je otevřená“ (pět bran zbývá), řádky diplomu, odznaky **Odstřelovač** (≤ 8 výstřelů) a **Klidný dech** (všechny gongy
  se zadrženým dechem); Rychlík vojenského světa zvednut na 110 minut. Zkratka `?mistnost=strelnice`.
  Zástupné kresby (pozadí postavení z modulu pušky), `docs/zadani-obrazku-strelnice.md`. Bez kamery.

### Průhledy do vedlejších místností (všechny světy)
Autor 23. 10. 2026: „aby se v místnostech dalo nakouknout i do další místnosti, aby to nebyly jenom 4 stěny“.
Ve verzi 0.31 má každá místnost s pohledy jeden průhled se 4–6 věcmi a „Proč?“ (k bráně se nepotřebují):
- kabinet → **preparátorna** škvírou po zelené knize (model kolena a čéška jako kladka, trámečky kosti – Wolffův
  zákon, hmotnost kostry, páteř, věšák s prachem ve tvaru klobouku – narážka na konec příběhu),
- fotolaboratoř → **ateliér** za černým závěsem (mřížka jako měřítko, Marey, Muybridge, blesk 1/10 000 s, kolmý záběr),
- sklad → **sušárna** větrací mřížkou (kilogram na botách ≈ pět na zádech, mokrá blůza a výparné teplo, teploměr, batohy),
- tělocvična → **kabinet tělocvikářů** oknem (Ruffierův test, ruční stopky a reakční čas +0,24 s, spirometr, poháry),
- noční cvičiště → **polní kuchyně** (ohřev vody Q = m·c·ΔT, denní dávka 15 MJ, účinnost svalů ~25 %, pitný režim),
- stanoviště na kótě → **pozorovatelna** (průzor, dvojitý dalekohled, tabulka větru, kniha střelnice),
- herna → **streamovací koutek** (tlak na ploténky vsedě, hlava v předklonu ~27 kg, pauzy, myš a zápěstí, křeslo),
- aréna → **měřicí kabina** (silová plošina a impulz, křivka skoku, vysokorychlostní kamera, EMG),
- Spin zóna → **vestibulární koutek** (polokruhovité kanálky, točení hlavy po rotaci, pohled do bodu, rovnováha).
Otvory v obrázcích od autora (dveře v herně a aréně, okno v tělocvičně) jsou zatím zástupné vrstvy od AI asistenta,
ve skladu jsou mřížky a v kabinetu mezera po knize už v autorových obrázcích. Zadání: `docs/zadani-obrazku-nahledy.md`.

### Laboratoře – Sklep: Sklepní archiv (`archiv`) a GSPORT – Sklep: Servisní chodba (`servis`)
Autor 22. 10. 2026: **chodby mezi místnostmi mají být stejně ve všech světech**. Obě bludiště jsou
odvozená od vojenského sklepa (stejný engine `chodba.js`, stejné textury z `assets/chodba/`; mapa
archivu je zrcadlená vodorovně, servisní chodby svisle – zatáčky vlevo/vpravo jsou prohozené, azimuty
v nástěnce přepsané). Stejný řetěz: nástěnka → klíč za cihlou (azimuty) → skříň s laserem → závora →
osm kostlivců (kosti k zásahu) → kosti na hromádkách → kostra z kabinetu u mříže (skládání) → zámek
mříže. Vlastní jména a představení kostlivců (archiv: Alois … Hynek po bývalých asistentech; servis:
Lag, Ping, Glitch, Patch, Bot, Noob, Crash, Combo), vlastní zámek mříže: archiv = **výkon** při
výběhu 18 schodů po 17 cm (student 70 kg za 6/5/7 s → 350/420/300 W), servis = **pohybová energie**
běžícího hráče 70 kg (4/3/5 m/s → 560/315/875 J; vzorec je připsaný dole na plakátu kostry).
Nápis TĚLOCVIČNA – SCHODIŠTĚ (textura s textem) v nich není, cedule schodiště zůstává 18 × 17 cm
(text je v textuře autora). Příznaky jsou stejné jako ve sklepě (každý svět má vlastní uloženou hru),
použití kostí na kostru má v `uses` záznam pro každou chodbu (`room`). Zkratky `?mistnost=archiv`,
`?mistnost=servis`. Testy: `maze_test.js` (zrcadlené příkazy z `bludiste_seed.js`).

### GSPORT – Chodba k LEVELU 3, 3D (`chodba_l3`)
Mezi arénou (LEVEL 2) a Spin zónou (LEVEL 3), odvozená od chodby na cvičiště (`chodba3d.js`): bedny
0,5 / 0,6 / 1,1 m a plošina 2,0 m, batoh **10 kg**, dveře **LEVEL 3** s pohledem do neonové chodby
(`door.view: "neon"`), svalovec stejný (útoky úder, kop, sevření). Vlastní příznaky přes `world.ids`
(`svalovec_l3_porazen`, `chodba_l3_konec`, `chodba_l3_preskocena`) a stránka deníku `chodba_l3`.
Řádky diplomu a odznaky (Nezlomný, Pružina, Měkký doskok, Ostrostřelec, Anatom, Skladač kostí) jsou
teď i ve světě GSPORT, Anatom/Skladač/Nezlomný i v Laboratořích. Zkratka `?mistnost=chodba_l3`.

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
trvá déle → **basketbalový automat** (trestný hod, povinně aspoň 3 koše z 10) → otázka, proč se hází
vysokým obloukem → skok na Měsíci (**6×**). Zkratka pro vyučující `?mistnost=arena` (hráč dostane věci
z herny). Grafika od autora (`docs/zadani-obrazku-arena.md`).

### GSPORT – LEVEL 3: Spin zóna (`spin`)
Rotace (námět autor schválil 21. 10. 2026, postaveno 22. 10. 2026 ve verzi 0.29). Bývalá laboratoř
rovnováhy jako arkáda: **otočná stolice** (`spin`: roztočit s rozpaženýma rukama 1 ot/s, I = 0,9 +
2·m_činky·r² + 2·m_paže·r²/3; připažit → L = I·ω stálý, ω roste, energie otáčení roste – práci dodají
paže; kolo 1 s činkami 2 kg na 2,5 ot/s, kolo 2 bez činek na 1,8 ot/s), **stanice SPIN** (`gyro`:
pirueta s tabletem u hrudníku, `devicemotion` – nejvyšší |rotationRate| a počet otáček za 8 s; bez
senzoru čas tří otáček; výsledky pirueta_ot/omega/t/senzor), **automat CURVE** (`curve`: dráhy oválu
r = 36,5 + 1,22·(n−1) m, F = m·v²/r, tan α = v²/(g·r); kolo 1 otázka „proč sprinteři nechtějí dráhu
1“, kolo 2 mokrá dráha μ = 0,3 – najít nejvyšší rychlost √(μ·g·r) ≈ 10,4 m/s, při překročení běžec
uklouzne). Řetěz: skříňka s činkami (kód = docentova pirueta 1,9 ot/s v ot/min = **114**) → stolice;
SPIN → žeton z výdejního okénka → CURVE. Kniha **Fyzika rotace** (ω = 2π·n, I = m·r², L = I·ω,
zatáčka) a plakáty – vzorec musí hráč najít v místnosti. Dveře LEVEL 3: pirueta v rad/s
(`pirueta_ot·2π`, ±5 %), otáčky po připažení `ω₁·I₁/I₂` (sady), odkud se vzala energie (práce paží),
dostředivá síla `m·v²/r` (sady), proč se běžec naklání. Deník „Osa“, závěr GSPORT „LEVEL 3 splněn“
(šest levelů zbývá), řádky diplomu, odznak **Káča** (pirueta ≥ 1,5 ot/s), Rychlík GSPORT zvednut na
60 minut. Zástupné kresby, `docs/zadani-obrazku-spin.md`. Bez kamery; senzor je volitelný.

### Laboratoře – Brána II: Fotografická laboratoř (`fotolab`)
Rychlost, zrychlení, energie (námět autor schválil 21. 10. 2026, postaveno 22. 10. 2026 ve verzi 0.29).
Temná komora: nejdřív **vypínač červeného světla** (bez něj hlavní objekty „ve tmě nevidíš“; „Proč
červené?“), **stroboskop** = malý zámek (štítek: sprinter 10 m/s, mezery 5 m → **2 záblesky/s**),
**fotka sprintu** na šňůře (`strobo`: x(t) = 10·(t − 1 + e^(−t)), záblesky po 0,5 s, pásmo 0–12 m,
měřítko ukazateli na 0 a 10 m, ukazatel každého snímku na značku na kyčli, „Vyvolat“ → tabulka Δs,
v = Δs/Δt (2,13 / 5,23 / 7,10 / 8,24 m/s), a = Δv/Δt), **negativ** v šuplíku → **zvětšovák** („Proč je
na každé fotce pásmo?“ – zvětšovák mění velikost, měřítko se nastavuje znovu) → **fotka pádu**
(míč 0,6 kg, záblesky po 0,1 s, pásmo v cm, proložení s = ½gt² → g ≈ 9,81, tabulka energií m·g·h
vs. ½mv²). Brána II (mosazný zámek + závora jako v kabinetu): průměrná rychlost `Δs/Δt` (sady),
zrychlení `Δv/0,5 s` (sady), pohybová energie před dopadem `m·g·h` (sady), proč rostou mezery.
Plakát RYCHLOST – ZRYCHLENÍ – ENERGIE u brány. Deník „Čas mezi snímky“, závěr Laboratoří „Brána II je
otevřená“ (sedm bran zbývá), řádky diplomu, odznak **Fotograf** (g mezi 9,5 a 10,1), Rychlík
Laboratoří 45 minut. Podkres `fotolab` (ventilace, kapání, tikání časovače). Zástupné kresby a vrstvy
(červené světlo, druhá fotka, otevřená brána), `docs/zadani-obrazku-fotolab.md`. Bez kamery.

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
- **Bouřka venku** (autor chtěl, 17. 10. 2026): ve všech světech, **ve výchozím stavu zapnutá**
  (Menu → „Bouřka venku: ano/ne“), **sílí směrem k bráně**. **Bez deště** – generované šumění deště
  autorovi vadilo (vyzkoušeno i z kapek), zůstává jen vzdálené dunění pod podkresem místnosti,
  blesk a po něm hrom se zpožděním podle vzdálenosti (1 km ≈ 3 s; jen atmosféra, k řešení se
  nepoužívá). Okno (kabinet): měkký namodralý záblesk; budova (herna, aréna, tělocvična) a sklep
  (sklad, bludiště): probliknou světla, ve sklepě jen hluboké tlumené dunění. Bezpečnost: záblesk
  nejvýš jednou za 20 s, dvě změny jasu za sekundu, při „omezit pohyb“ žádný; během otevřeného
  okna (úloha, zámek, zápisník) ani lekačky blesk nepřijde a blízký hrom se nepřehraje;
  **blízké prásknutí hromu jen se zapnutými lekačkami**. Kabinet má v okně jasnou noc s měsícem –
  k bouřce by se hodila varianta okna s mraky (zatím neudělané).
- **Zbraně:** jinak ve hře žádné; výjimka je sklepní bludiště – autor chtěl střelbu na kostlivce:
  jen cvičná laserová puška (laser game), žádná krev, výukový smysl anatomie, útoky kostlivců
  se dají v Menu vypnout. Puška zůstává ve sklepě (u mříže ji hráč vrátí do stojanu).
  Druhá výjimka (19. 10. 2026, autor odsouhlasil boj laserem): 3D chodba na cvičiště se svalovcem –
  zase jen cvičný laser, výukový smysl funkce svalů; puška leží ve stojanu v chodbě.
  Třetí výjimka (23. 10. 2026, autor sám chtěl): **odstřelovací puška s dalekohledem** na střelnici na kótě 680 –
  střílí se **jen na ocelové gongy a tabule** (nic živého, žádná krev), s chrániči sluchu a pozorovatelem; výukový
  smysl balistika (pád střely, mil, vítr) a biomechanika střelce (stabilita polohy, dech, tep). Puška zůstává na stanovišti.
- **Sklepní bludiště je součást hry** (schváleno 17. 10. 2026): vojenska = sklad → bludiště → tělocvična,
  **od 19. 10. 2026 ještě → 3D chodba na cvičiště** (svalovec; dveře na cvičiště = konec světa).
  Z bludiště se dostane jen ten, kdo vrátí kosti po kostlivcích kostře z kabinetu.
- **Basketbal v aréně** (17. 10. 2026): ovládání jako prak, 10 hodů, **povinně aspoň 3 koše** (bez nich
  dveře LEVEL 2 nepustí), po dvou neúspěšných kolech automat napoví úhel a rychlost.
- **Větší zábava** (21. 10. 2026, autor schválil návrh a pořadí): 1) odznaky, hvězdičky a diplom,
  3) méně čtení („Proč?“) a vzkazy od D. při zaseknutí, 5) humor a postavy – hotovo ve verzi 0.24;
  2) **jiná čísla pro každý tým** (autor povolil měnit hodnoty úloh) – hotovo ve verzi 0.25 jako sady čísel
  s kódem třídy (viz formát); dál 4) příběh docenta D. s deníkem a mapou bran – **návrh autor schválil
  21. 10. 2026**: D. po třiceti letech na fakultě zmizel v den zrušení své poslední laboratoře a nechal
  devět bran = devět věcí k zapamatování; za každou branou stránka deníku (lekce + kousek života);
  mapa fakulty s branami napříč světy; zvrat: D. branami kdysi sám prošel, postavil mu je jeho učitel
  (fotografie katedry); konec: devátá brána vede na střechu za svítání, klobouk, klíč od laboratoře
  a lístek „Devět bran jsem kdysi prošel já. Teď vy. Nezavírejte je. – D.“ D. je naživu, jen odešel.
  **Hotovo ve verzi 0.26:** 7 stránek deníku (texty v `diary`), mapa bran, sekce v zápisníku.
  **22. 10. 2026 autor upřesnil: devět bran má každý svět zvlášť** (Laboratoře, Vojenská tělovýchova,
  GSPORT – tři oddělené světy), mapa od verze 0.27 kreslí tři sloupce po devíti branách.
  **Vojenská III Noční cvičiště** (nosítka, protizávaží u přilby, mapa se svahem) hotová ve verzi 0.28,
  **GSPORT LEVEL 3 Spin zóna** (rotace) a **Laboratoře II Fotografická laboratoř** (rychlost, zrychlení,
  energie) ve verzi 0.29. **Chodby mezi místnostmi stejně ve všech světech** (autor 22. 10. 2026): od
  verze 0.29 má každý svět mezi branami chodby – Laboratoře sklepní archiv (bludiště), GSPORT servisní
  chodbu (bludiště) a 3D chodbu k LEVELU 3; odvozené z vojenských chodeb (stejné enginy a textury, jiné
  mapy, jména, zámky). **Vojenská IV Stanoviště na kótě 680** (odstřelovací puška) a **průhledy do vedlejších místností** ve všech
  světech ve verzi 0.31. **Zbývá:** další brány (IV a výš v Laboratořích a GSPORT, V a výš ve vojenském), střecha s devátou branou a koncem
  příběhu (až bude svět dohraný), případně
  obrázky stránek od autora (`docs/zadani-obrazku-denik.md`) a zmínka o učiteli D. na fotografii
  katedry (zvrat až na posledních stránkách). **Docent D. = autor sám** (docent na FTVS), v příběhu zůstává
  jen „D.“ – žádné osobní údaje. Humor: kostlivci v bludišti mají jména a krátké představení
  (Bohouš, Leopold, Vendelín, Hugo, Kazimír, Ferda, Cyril, Metoděj), komisař a rtn. Doubek v tělocvičně
  (hodiny zastavil Doubkův medicinbal, „bazén je studenej“), D. je ve vzkazech uštěpačný, ale laskavý.
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
- **Senzor piruety (Spin zóna):** gyroskop jde v prohlížeči zkoušet jen na tabletu nebo telefonu
  (na iOS se prohlížeč zeptá na povolení pohybových senzorů, tlačítko musí stisknout hráč). V testech
  se posílají umělé události `devicemotion`; cesta bez senzoru (čas tří otáček) je vždy k dispozici.
- **Puška:** test `strelnice_test.js` prochází celou Bránu IV; v okně pušky je ovladač na `canvas.__sniper`
  (`test.noSway`, `test.noDispersion` = deterministická střelba, `targetInfo(id)`, `aimAt(az, el)`); fyzika je
  v exportech `holdMil`, `windMil`, `flightTime`, `ballisticCard` (karta v game.json musí sedět s nimi).
  `peek_test.js` projde průhledy ve všech osmi místnostech.
- Zrcadlená bludiště (archiv, servisní chodba) procházejí stejnou cestou jako sklep, jen s prohozenými
  zatáčkami vlevo/vpravo; kódy zámků si testy počítají z uložených proměnných (sady čísel).
