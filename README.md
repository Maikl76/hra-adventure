# Brány biomechaniky

Výuková point-and-click adventura z biomechaniky pro studenty FTVS UK – se sekcí pro civilní
studium i pro vojenskou tělovýchovu.

**▶ Hrát: <https://maikl76.github.io/hra-adventure/>**

Docent, který léta učil biomechaniku, zmizel. Ve svém kabinetu zanechal jedinou větu:
*„Devět bran. Otevřou se jen těm, kdo pohybu skutečně rozumějí.“* Hráči (ideálně týmy po 3–4)
procházejí temnou fakultou, hledají předměty, skládají stopy a každou bránu otevřou jen
pochopením biomechanického principu.

## Stav

- **Brána I – Anatomický kabinet** (moment síly, rovnováha momentů, druhy pák): hotová.
- Další brány se připravují (laboratoř – výskok a doba letu, pohybové stanoviště GSPORT…).

## Ovládání

- Klikání na předměty v místnosti; šipky **‹ ›** (nebo klávesy ← →) = otočit se v místnosti.
- Předmět z inventáře vybereš kliknutím a použiješ ho kliknutím na předmět v místnosti;
  druhým kliknutím na předmět v inventáři si ho prohlédneš (knihu otevřeš a listuješ v ní).
- **Zápisník** si pamatuje zjištěné údaje, **Baterka/Rozsvíceno** přepíná tmu, **Zvuk** vypíná zvuk.
- Postup se ukládá v prohlížeči – po zavření stačí „Pokračovat“.

## Pro vyučující

- Veškerý obsah (texty, hádanky, správné odpovědi, nápovědy, obrázky místností) je v souboru
  [`data/game.json`](data/game.json) – upravuje se bez programování.
- **Výuka ve třídě:** v `game.json` nastavte `"audio": { "defaultOn": false }` – hra pak začne
  potichu (zvuk si hráči mohou zapnout, nejlépe se sluchátky).
- Závěrečná obrazovka ukazuje tým, sekci, čas, počet chybných pokusů a nápověd – studenti ji
  vyfotí pro vyhodnocení.
- Pozor: správné odpovědi jsou v `game.json` veřejně čitelné.

### Spuštění na vlastním počítači

Hra načítá `data/game.json`, takže ji nestačí otevřít dvojklikem. Ve složce hry spusťte:

```
python -m http.server 8765
```

a otevřete `http://127.0.0.1:8765`.

## Technika

Čisté HTML, CSS a JavaScript – bez knihoven, bez serveru a bez sestavování. Zvuk se generuje
přímo v prohlížeči (Web Audio API); generované zvuky lze v `game.json` nahradit nahrávkami.

## Autor a licence

- Autor: **Michal Vágner**, FTVS UK. Kód vznikl s pomocí AI asistenta Claude (Anthropic).
- **Kód** (`index.html`, `css/`, `js/`): licence [MIT](LICENSE).
- **Obsah** – obrázky, texty a hádanky (`assets/`, `data/`): licence
  [CC BY 4.0](LICENSE-obsah.md) – volné použití s uvedením autora.
