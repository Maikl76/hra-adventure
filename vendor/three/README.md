# three.js ve hře

- Verze **0.186.1** z npm (`three`), licence MIT (viz [LICENSE](LICENSE)).
- Použité soubory: `build/three.core.js` a `build/three.module.js`, zmenšené nástrojem esbuild
  (`esbuild <soubor> --minify --format=esm --legal-comments=inline`). V `three.module.min.js`
  je import `./three.core.js` přepsaný na `./three.core.min.js`. Jinak beze změn.
- Používá jen 3D chodba (`js/chodba3d.js`, `js/svalovec.js`); načte se až při vstupu do ní.
