# Devět bran k pochopení pohybu

Výuková point-and-click adventura z biomechaniky, zasazená do prostředí Fakulty tělesné výchovy
a sportu UK. Má tři světy: civilní studium, vojenskou tělovýchovu a GSPORT (hra a pohyb).

**▶ Hrát: <https://maikl76.github.io/hra-adventure/>**

Docent, který léta učil biomechaniku, zmizel. Ve svém kabinetu zanechal jedinou větu:
*„Devět bran. Otevřou se jen těm, kdo pohybu skutečně rozumějí.“* Hráči (ideálně týmy po 3–4)
procházejí temnou fakultou, hledají předměty, skládají stopy a každou bránu otevřou jen
pochopením biomechanického principu.

## Stav

Každý svět bude mít vlastních devět bran.

- **Civilní studium – Brána I: Anatomický kabinet** (moment síly, rovnováha momentů, druhy pák):
  hotová. Vojenská tělovýchova zatím vede do stejné místnosti, vlastní brány se připravují.
- **GSPORT – LEVEL 1: Stará herna** (práce a výkon při dřepech, sčítání wattů): stará laboratoř
  v suterénu předělaná na hernu, čtyři strany místnosti a řetěz úkolů – reflex test, UV
  svítilna, vitrína a pojistková skříň s číselnými zámky, jistič na 1000 W. Pak hráč udělá
  15 dřepů u měřicí stanice a z vlastního času spočítá svůj výkon. Grafiku místnosti
  i lekaček dodal autor.
- Další brány se připravují.

## GSPORT: dřepy před webkamerou

- Hráč se postaví 2–3 m od notebooku **bokem ke kameře**. Hra sleduje úhel v koleni a dřep
  započítá, když úhel klesne pod 90° a hráč se znovu postaví. Každý dřep pípne.
- **Obraz z kamery se zpracovává jen v prohlížeči hráče** – nic se nenahrává ani neukládá.
- Bez kamery (nebo když ji hráč nepovolí) jde dřepy udělat i „na poctivost“: hra jen změří čas.
  Na závěrečné obrazovce je pak uvedeno „Dřepy ověřené kamerou: ne“.
- Výpočty počítají se standardním hráčem 70 kg, aby hra nepotřebovala osobní údaje.

## Ovládání

- Klikání na předměty v místnosti; šipky **‹ ›** (nebo klávesy ← →) = otočit se v místnosti.
- Předmět z inventáře vybereš kliknutím a použiješ ho kliknutím na předmět v místnosti;
  druhým kliknutím na předmět v inventáři si ho prohlédneš (knihu otevřeš a listuješ v ní).
- **Zápisník** si pamatuje zjištěné údaje, **Baterka/Rozsvíceno** přepíná tmu, **Zvuk** vypíná zvuk.
- **Kalkulačku** najdeš v kabinetu. Otevře se jako okno, které jde přesunout a zůstává otevřené
  i nad zámkem brány; výsledek se dá jedním tlačítkem přenést do zámku.
- Postup se ukládá v prohlížeči – po zavření stačí „Pokračovat“.

## Pro vyučující

- Veškerý obsah (texty, hádanky, správné odpovědi, nápovědy, obrázky místností) je v souboru
  [`data/game.json`](data/game.json) – upravuje se bez programování.
- **Výuka ve třídě:** v `game.json` nastavte `"audio": { "defaultOn": false }` – hra pak začne
  potichu (zvuk si hráči mohou zapnout, nejlépe se sluchátky).
- Závěrečná obrazovka ukazuje tým, sekci, čas, počet chybných pokusů a nápověd (v GSPORT i
  naměřené dřepy, výkon a reakční dobu) – studenti ji vyfotí pro vyhodnocení.
- **Lekačky:** svět GSPORT obsahuje několik lekaček (náhlý obrázek přes celou obrazovku
  s hlasitým zvukem). Hráč je může vypnout v Menu → „Lekačky: zapnuté/vypnuté“. Obraz
  nebliká opakovaně, ale citlivější studenty je dobré předem upozornit.
- Pozor: správné odpovědi jsou v `game.json` veřejně čitelné.

### Spuštění na vlastním počítači

Hra načítá `data/game.json`, takže ji nestačí otevřít dvojklikem. Ve složce hry spusťte:

```
python -m http.server 8765
```

a otevřete `http://127.0.0.1:8765`.

## Technika

Čisté HTML, CSS a JavaScript – bez serveru a bez sestavování. Zvuk se generuje přímo
v prohlížeči (Web Audio API); generované zvuky lze v `game.json` nahradit nahrávkami.

Jediná knihovna je **MediaPipe Tasks Vision** (Google, licence Apache 2.0) pro odhad polohy
těla z kamery ve světě GSPORT. Je uložená ve složce [`vendor/mediapipe`](vendor/mediapipe)
i s modelem, takže hra nestahuje nic z cizích serverů. Načte se, až když hráč zvolí dřepy
s kamerou.

## Autor a licence

- Autor: **Michal Vágner**, FTVS UK. Kód vznikl s pomocí AI asistenta Claude (Anthropic).
- **Kód** (`index.html`, `css/`, `js/`): licence [MIT](LICENSE).
- **Obsah** – obrázky, texty a hádanky (`assets/`, `data/`): licence
  [CC BY 4.0](LICENSE-obsah.md) – volné použití s uvedením autora.
- **MediaPipe** (`vendor/mediapipe/`): © Google, licence [Apache 2.0](vendor/mediapipe/LICENSE).
