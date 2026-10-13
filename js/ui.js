/*
 * Vykreslování a ovládání: úvodní průchod branami, obrazovky, místnost se světlem,
 * inventář, zápisník a zámky bran. Herní logiku řeší engine.js, obsah je v data/game.json.
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

  let data = null;
  let game = null;
  let sound = null;          // zvuk (audio.js)
  let calc = null;           // kalkulačka (calc.js)
  let selectedItem = null;   // id vybraného předmětu z inventáře
  let flashlightOn = true;   // baterka (tma kolem) / rozsvíceno
  const newItems = new Set(); // předměty, které se mají v inventáři zvýraznit

  /* ====================================================================
   * Spuštění
   * ==================================================================== */

  async function init() {
    try {
      const response = await fetch('data/game.json', { cache: 'no-cache' });
      if (!response.ok) throw new Error(`Soubor data/game.json se nenačetl (HTTP ${response.status}).`);
      const text = await response.text();
      try {
        data = JSON.parse(text);
      } catch (e) {
        throw new Error('V souboru data/game.json je chyba zápisu:\n' + e.message);
      }
    } catch (e) {
      const fromFile = location.protocol === 'file:';
      showFatal(fromFile
        ? 'Hra otevřená přímo ze souboru nemůže načíst svůj obsah (data/game.json).\nSpusťte ji přes webový server – například na GitHub Pages.'
        : e.message);
      return;
    }

    Game.migrateSave();   // starší jediné uložení → uložení podle světa
    game = new Game(data);
    const problems = game.validate();
    if (problems.length) console.warn('Problémy v data/game.json:\n' + problems.join('\n'));

    const audioConfig = data.audio || {};
    sound = new Sound(audioConfig);
    sound.setEnabled(Game.getSetting('sound', audioConfig.defaultOn !== false));
    calc = new Calculator({ onKey: () => sound.sfx('beep') });

    flashlightOn = Game.getSetting('flashlight', false);   // výchozí: Rozsvíceno
    setupStatic();
    setupScene();
    startClock();
    showEnter();
  }

  /* Podkres pro jednotlivé obrazovky (místnost si ho určuje sama v game.json). */
  const SCREEN_AMBIENCE = { intro: 'intro', title: 'title', track: 'title', finish: 'finish' };

  function showScreen(id) {
    document.querySelectorAll('.screen').forEach((s) => { s.hidden = s.id !== id; });
    if (id === 'room') startSceneLoop();
    else {
      stopSceneLoop();
      if (calc) calc.close();
      if ($('hud-help')) hideHudHelp();
    }
    if (id in SCREEN_AMBIENCE) sound.ambience(SCREEN_AMBIENCE[id]);
  }

  /* Vstupní obrazovka: kliknutí odemkne zvuk, pak úvod (poprvé) nebo titulní obrazovka. */
  function showEnter() {
    const silent = $('btn-enter-silent');
    silent.textContent = sound.enabled ? 'Vstoupit bez zvuku' : 'Vstoupit se zvukem';
    showScreen('enter');
  }

  function enterGame(toggleSound) {
    if (toggleSound) setSound(!sound.enabled);
    sound.unlock();
    if (Game.getSetting('introSeen', false)) showTitle();
    else playIntro(showTitle);
  }

  function setSound(on) {
    sound.setEnabled(on);
    Game.setSetting('sound', on);
    for (const btn of [$('btn-sound'), $('btn-sound-title')]) {
      btn.textContent = on ? 'Zvuk' : 'Bez zvuku';
      btn.setAttribute('aria-pressed', String(on));
      btn.title = on ? 'Vypnout zvuk' : 'Zapnout zvuk';
    }
  }

  function showFatal(text) {
    $('fatal-text').textContent = text;
    showScreen('fatal');
  }

  /* Pevné prvky: texty z game.json, tlačítka, klávesnice. */
  function setupStatic() {
    document.title = data.meta.title;
    $('game-title').textContent = data.meta.title;
    $('game-subtitle').textContent = data.meta.subtitle || '';
    $('version').textContent = data.meta.version ? `verze ${data.meta.version}` : '';

    $('btn-continue').addEventListener('click', () => continueGame());
    $('btn-new').addEventListener('click', showTrack);
    $('btn-intro').addEventListener('click', () => playIntro(showTitle));
    $('track-back').addEventListener('click', showTitle);
    $('btn-again').addEventListener('click', () => { Game.clearSave(); showTitle(); });

    $('btn-notes').addEventListener('click', openNotes);
    $('btn-menu').addEventListener('click', openMenu);
    $('btn-light').addEventListener('click', toggleFlashlight);
    updateLightButton();

    $('btn-enter').addEventListener('click', () => enterGame(false));
    $('btn-enter-silent').addEventListener('click', () => enterGame(true));
    $('btn-sound').addEventListener('click', () => setSound(!sound.enabled));
    $('btn-sound-title').addEventListener('click', () => setSound(!sound.enabled));
    setSound(sound.enabled);

    // Zvuk lze spustit až po akci hráče; v skryté záložce se pozastaví.
    document.addEventListener('pointerdown', () => sound.unlock());
    document.addEventListener('keydown', () => sound.unlock());
    document.addEventListener('visibilitychange', () => sound.pause(document.visibilityState !== 'visible'));

    $('modal').addEventListener('click', (e) => {
      if (e.target.matches('[data-close]')) closeModal();
    });

    document.addEventListener('keydown', onKeyDown);
  }

  /* Karty světů (Civilní / Vojenská / GSPORT); rozehraný svět jde dohrát nebo začít znovu. */
  function renderTrackCards() {
    const tracks = $('tracks');
    tracks.innerHTML = '';
    for (const track of data.tracks) {
      const saved = Game.hasSave(track.id);
      const wrap = document.createElement('div');
      wrap.className = `track-wrap-card world-${track.id}`;
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'track-card';
      const h = document.createElement('h3');
      h.textContent = track.name;
      const p = document.createElement('p');
      p.textContent = track.description || '';
      card.append(h, p);
      if (saved) {
        const s = document.createElement('p');
        s.className = 'track-saved';
        s.textContent = 'Rozehráno – kliknutím pokračuješ';
        card.appendChild(s);
      }
      card.addEventListener('click', () => (saved ? continueGame(track.id) : startNewGame(track.id)));
      wrap.appendChild(card);
      if (saved) {
        const again = document.createElement('button');
        again.type = 'button';
        again.className = 'link track-again';
        again.textContent = 'Začít tento svět znovu';
        again.addEventListener('click', () => {
          Game.clearSave(track.id);
          startNewGame(track.id);
        });
        wrap.appendChild(again);
      }
      tracks.appendChild(wrap);
    }
  }

  /* ====================================================================
   * Úvod: pomalý průchod tmou skrze řadu bran (kresleno na plátno)
   * ==================================================================== */

  let introRaf = 0;
  let introDone = null;

  function playIntro(done) {
    showScreen('intro');
    const canvas = $('tunnel');
    const ctx = canvas.getContext('2d');
    const lineEl = $('intro-line');
    lineEl.classList.remove('on');
    lineEl.textContent = '';

    const count = data.meta.totalGates || 9;
    const duration = (data.intro && data.intro.duration) || 30;
    const lines = (data.intro && data.intro.lines) || [];
    const focal = 0.55;           // „ohnisko“: brána ve vzdálenosti 1 má otvor 55 % výšky obrazovky
    const endZ = count + 0.7;     // světlo za poslední branou

    // vzhled bran kreslí js/brany.js (kámen, klenba, svorník s číslicí, lampy); tady jen poloha v chodbě
    const gates = [];
    for (let i = 0; i < count; i++) {
      gates.push(Object.assign(IntroGates.create(i), {
        z: i + 1,
        ox: Math.sin(i * 1.7) * 70,
        oy: Math.cos(i * 1.3) * 22,
        numeral: ROMAN[i] || '',
      }));
    }
    // prach v chodbě: zrnka rozptýlená po celé délce průletu (souřadnice v jednotkách brány)
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const motes = Array.from({ length: 260 }, () => ({
      x: (rnd() - 0.5) * 900, y: (rnd() - 0.5) * 560, z: 0.3 + rnd() * (count + 0.6), ph: rnd() * 6.28,
    })).sort((a, b) => b.z - a.z);

    const smooth = (x) => x * x * (3 - 2 * x);
    const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
    const start = performance.now();
    let currentLine = -1;
    let lightPlayed = false;

    // pojistka pro slabší počítače: když se průlet trhá, plátno se vykreslí v nižším rozlišení
    let quality = 1;
    let slowFrames = 0;
    let lastFrame = 0;
    function size() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2) * quality;
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
    }
    size();
    window.addEventListener('resize', size);

    function frame(now) {
      const t = (now - start) / 1000;
      if (lastFrame && t > 1 && quality > 0.5) {
        slowFrames = now - lastFrame > 28 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
        if (slowFrames > 20) { quality -= 0.2; slowFrames = 0; size(); }
      }
      lastFrame = now;
      const p = clamp(t / duration, 0, 1);
      const camZ = endZ * smooth(p);
      const W = canvas.width;
      const H = canvas.height;
      const u = H / 640;

      // Kamera míří na nejbližší bránu před sebou (plynulé „kličkování“).
      const k = Math.floor(camZ);
      const f = smooth(camZ - k);
      const prev = gates[k - 1] || { ox: 0, oy: 0 };
      const next = gates[k] || prev;
      const camX = prev.ox + (next.ox - prev.ox) * f;
      const camY = prev.oy + (next.oy - prev.oy) * f;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);

      // Světlo na konci chodby (v ose poslední brány).
      const last = gates[gates.length - 1];
      const lightDz = endZ + 0.25 - camZ;
      const lightScale = focal / Math.max(lightDz, 0.05);
      const lr = 260 * u * lightScale;
      const lx = W / 2 + (last.ox - camX) * u * lightScale;
      const ly = H / 2 + (last.oy - camY) * u * lightScale;
      const glow = ctx.createRadialGradient(lx, ly, 0, lx, ly, Math.max(lr, 1));
      const glowAlpha = clamp(0.25 + 0.75 * (1 - lightDz / endZ), 0, 1);
      glow.addColorStop(0, `rgba(255, 240, 210, ${0.95 * glowAlpha})`);
      glow.addColorStop(0.3, `rgba(220, 180, 110, ${0.35 * glowAlpha})`);
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);

      // Paprsky světla z konce chodby (brány je zakryjí – prosvítají jen otvory).
      ctx.globalCompositeOperation = 'lighter';
      for (let r = 0; r < 7; r++) {
        const a = r * 0.9 + t * 0.03;
        const len = Math.max(W, H) * 1.2;
        const ray = ctx.createLinearGradient(lx, ly, lx + Math.cos(a) * len, ly + Math.sin(a) * len);
        ray.addColorStop(0, `rgba(255, 225, 170, ${0.07 * glowAlpha})`);
        ray.addColorStop(1, 'rgba(255, 225, 170, 0)');
        ctx.fillStyle = ray;
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(lx + Math.cos(a - 0.06) * len, ly + Math.sin(a - 0.06) * len);
        ctx.lineTo(lx + Math.cos(a + 0.06) * len, ly + Math.sin(a + 0.06) * len);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';

      // zrnka prachu mezi dvěma hloubkami (kreslí se mezi branami, aby je bližší brány zakryly)
      let mi = 0;
      const drawMotes = (zMin) => {
        while (mi < motes.length && motes[mi].z > zMin) {
          const m = motes[mi++];
          const dz = m.z - camZ;
          if (dz < 0.15) continue;
          const ms = focal / dz * u;
          const x = W / 2 + (m.x + Math.sin(t * 0.5 + m.ph) * 12 - camX) * ms;
          const y = H / 2 + (m.y + Math.sin(t * 0.3 + m.ph * 2) * 8 - camY) * ms;
          if (x < -10 || y < -10 || x > W + 10 || y > H + 10) continue;
          const near = clamp(1.45 - dz * 0.36, 0, 1);
          const dl = Math.hypot(x - lx, y - ly) / Math.max(W, H);
          const a = near * (0.12 + 0.5 * clamp(1 - dl * 2.2, 0, 1)) * (0.7 + 0.3 * Math.sin(t * 2 + m.ph));
          if (a < 0.02) continue;
          ctx.fillStyle = `rgba(255, 226, 180, ${a})`;
          ctx.beginPath();
          ctx.arc(x, y, clamp(2.2 * ms / u, 0.6, 3.5) * (W / 1600 + 0.5), 0, Math.PI * 2);
          ctx.fill();
        }
      };

      // Poloha a průhlednost bran na obrazovce.
      const view = gates.map((g) => {
        const dz = g.z - camZ;
        if (dz < 0.22) return null;
        const s = focal / dz;
        const fog = clamp(1.45 - dz * 0.36, 0, 1);
        const passing = s > 1.15 ? clamp(1 - (s - 1.15) / 0.9, 0, 1) : 1;
        const alpha = fog * passing;
        if (alpha < 0.01) return null;
        const scale = s * u;
        const s2 = focal / (dz + 0.09) * u;      // zadní hrana otvoru (tloušťka zdi)
        return {
          alpha,
          s: scale, x: W / 2 + (g.ox - camX) * scale, y: H / 2 + (g.oy - camY) * scale,
          s2, x2: W / 2 + (g.ox - camX) * s2, y2: H / 2 + (g.oy - camY) * s2,
          near: s, light: g.z / gates.length, t, numeral: g.numeral,
        };
      });

      // Brány od nejvzdálenější po nejbližší. Vzdálenější brána je vidět jen otvorem bližší
      // neprůhledné brány – kreslí se jen tam (ušetří to většinu práce).
      for (let i = gates.length - 1; i >= 0; i--) {
        const g = gates[i];
        drawMotes(g.z);
        if (!g.passed && g.z - camZ < 0.6) {
          g.passed = true;           // svist ve chvíli, kdy brána míjí kameru
          sound.sfx('pass');
        }
        const v = view[i];
        if (!v) continue;
        let front = null;
        for (let n = i - 1; n >= 0; n--) {
          if (view[n] && view[n].alpha > 0.98) { front = n; break; }
        }
        if (front !== null) {
          const f = view[front];
          v.clip = new Path2D();
          v.clip.addPath(gates[front].opening, new DOMMatrix([f.s, 0, 0, f.s, f.x, f.y]));
        }
        IntroGates.draw(ctx, g, v);
      }
      drawMotes(camZ);

      // Vinětace (ztmavení okrajů).
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      const vig = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
      vig.addColorStop(0, 'rgba(0,0,0,0)');
      vig.addColorStop(1, 'rgba(0,0,0,0.75)');
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, W, H);

      // Závěr: vstup do světla.
      if (!lightPlayed && t > duration - 3.2) {
        lightPlayed = true;
        sound.sfx('light');
      }
      const flash = clamp((t - (duration - 2.2)) / 2.2, 0, 1);
      if (flash > 0) {
        ctx.fillStyle = `rgba(250, 238, 212, ${0.92 * flash * flash})`;
        ctx.fillRect(0, 0, W, H);
      }

      // Titulky.
      const idx = lines.findIndex((l) => t >= l.at && t < l.until);
      if (idx !== currentLine) {
        currentLine = idx;
        if (idx >= 0) {
          lineEl.textContent = lines[idx].text;
          lineEl.classList.add('on');
        } else {
          lineEl.classList.remove('on');
        }
      }

      if (t >= duration) finish();
      else introRaf = requestAnimationFrame(frame);
    }

    function finish() {
      cancelAnimationFrame(introRaf);
      window.removeEventListener('resize', size);
      $('intro').removeEventListener('click', finish);
      $('intro-skip').removeEventListener('click', finish);
      introDone = null;
      Game.setSetting('introSeen', true);
      done();
    }

    introDone = finish;
    $('intro').addEventListener('click', finish);
    $('intro-skip').addEventListener('click', finish);
    introRaf = requestAnimationFrame(frame);
  }

  /* ====================================================================
   * Titulní obrazovka, výběr sekce, závěr
   * ==================================================================== */

  /* Barevný styl podle světa (GSPORT = neon); na titulní obrazovce žádný. */
  function applyWorld(trackId) {
    if (trackId) document.body.dataset.world = trackId;
    else delete document.body.dataset.world;
  }

  function showTitle() {
    applyWorld(null);
    $('btn-continue').hidden = !Game.hasSave();
    showScreen('title');
  }

  function showTrack() {
    applyWorld(null);
    $('team-name').value = '';
    renderTrackCards();
    showScreen('track');
  }

  function startNewGame(trackId) {
    selectedItem = null;
    newItems.clear();
    const events = game.newGame(trackId, $('team-name').value);
    applyWorld(game.state.trackId);
    showScreen('room');
    handleEvents(events);
    maybeRotateHint();
    maybeHudHelp();
  }

  function continueGame(trackId) {
    if (!game.loadSave(trackId)) {
      showTrack();
      return;
    }
    selectedItem = null;
    applyWorld(game.state.trackId);
    if (game.state.finished) {
      showFinish();
      return;
    }
    showScreen('room');
    handleEvents(game.enterRoom());
    maybeRotateHint();
    maybeHudHelp();
  }

  /* ---------- Nápověda k tlačítkům vpravo nahoře ----------
     Při prvním vstupu do hry (a pak z Menu) se pod tlačítky ukáže panel se šipkou a tlačítka
     se rozsvítí. Zavře se tlačítkem „Rozumím“ nebo kliknutím kamkoli jinam. */

  function maybeHudHelp() {
    if (!Game.getSetting('hudHelpSeen', false)) setTimeout(showHudHelp, 900);
  }

  function showHudHelp() {
    hideHudHelp();
    if ($('room').hidden) return;
    const actions = document.querySelector('.hud-actions');
    const panel = document.createElement('div');
    panel.id = 'hud-help';
    panel.className = 'hud-help';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Tlačítka vpravo nahoře');
    const h = document.createElement('h3');
    h.textContent = 'Tlačítka vpravo nahoře';
    panel.appendChild(h);
    const rows = [
      ['Zápisník', 'vše důležité, co najdeš nebo změříš – čísla do výpočtů'],
      ['Rozsvíceno / Baterka', 'světlo: celá místnost osvětlená, nebo tma a svítilna pod kurzorem'],
      ['Zvuk / Bez zvuku', 'zapne nebo vypne zvuk'],
      ['Menu', 'vyznačení klikacích míst, lekačky (zapnout / vypnout), hlavní nabídka'],
    ];
    const dl = document.createElement('dl');
    for (const [name, text] of rows) {
      const dt = document.createElement('dt');
      dt.textContent = name;
      const dd = document.createElement('dd');
      dd.textContent = text;
      dl.append(dt, dd);
    }
    panel.appendChild(dl);
    const tip = document.createElement('p');
    tip.textContent = 'Na věci v místnosti klikej. Šipkami ‹ › po stranách se otáčíš.';
    panel.appendChild(tip);
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'btn primary';
    ok.textContent = 'Rozumím';
    ok.addEventListener('click', hideHudHelp);
    panel.appendChild(ok);
    document.body.appendChild(panel);
    actions.classList.add('coach');

    const place = () => {
      const r = actions.getBoundingClientRect();
      panel.style.top = `${Math.round(r.bottom + 12)}px`;
      panel.style.right = `${Math.max(8, Math.round(window.innerWidth - r.right))}px`;
      // šipka míří doprostřed skupiny tlačítek
      const pr = panel.getBoundingClientRect();
      const arrow = Math.min(Math.max(r.left + r.width / 2 - pr.left, 20), pr.width - 20);
      panel.style.setProperty('--arrow-x', `${Math.round(arrow)}px`);
    };
    place();
    window.addEventListener('resize', place);
    // kliknutí mimo panel ho zavře (ať nepřekáží hře)
    const outside = (e) => { if (!panel.contains(e.target)) hideHudHelp(); };
    setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
    hudHelpCleanup = () => {
      window.removeEventListener('resize', place);
      document.removeEventListener('pointerdown', outside, true);
    };
  }

  let hudHelpCleanup = null;

  function hideHudHelp() {
    const panel = $('hud-help');
    if (!panel) return;
    panel.remove();
    const actions = document.querySelector('.hud-actions');
    if (actions) actions.classList.remove('coach');
    if (hudHelpCleanup) { hudHelpCleanup(); hudHelpCleanup = null; }
    Game.setSetting('hudHelpSeen', true);
  }

  function showFinish() {
    const st = game.stats();
    const fin = game.track.finish || data.finish || {};
    $('finish-title').textContent = fin.title || 'Konec';
    $('finish-text').textContent = fin.text || '';
    $('finish-photo').textContent = fin.photoHint || '';
    const rows = [
      ['Tým', st.team || '—'],
      ['Sekce', st.track],
      ['Čas', formatTime(st.playMs)],
      ['Chybné pokusy', String(st.errors)],
      ['Použité nápovědy', String(st.hints)],
      ['Otevřené brány', `${st.gatesOpen} z ${data.meta.totalGates || 9}`],
    ];
    // naměřené hodnoty světa (např. GSPORT: dřepy, výkon, reflex) – řádek jen když hodnota existuje
    for (const s of fin.stats || []) {
      if ((s.requires || []).some((v) => game.state.vars[v] === undefined || game.state.vars[v] === null)) continue;
      // „bool“: řádek ano/ne podle proměnné (např. výskok ověřený kamerou)
      if (s.bool) {
        if (game.state.vars[s.bool] === undefined) continue;
        rows.push([s.label, game.state.vars[s.bool] ? 'ano' : 'ne']);
        continue;
      }
      rows.push([s.label, game.fill(s.value)]);
    }
    if (st.camera !== undefined) rows.push([fin.cameraLabel || 'Dřepy ověřené kamerou', st.camera ? 'ano' : 'ne']);
    const dl = $('finish-stats');
    dl.innerHTML = '';
    for (const [k, v] of rows) {
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.textContent = v;
      dl.append(dt, dd);
    }
    showScreen('finish');
  }

  function formatTime(ms) {
    const total = Math.round(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m} min ${String(s).padStart(2, '0')} s`;
  }

  /* Na úzkém telefonu na výšku poradit otočení. */
  function maybeRotateHint() {
    if (window.matchMedia('(orientation: portrait) and (max-width: 700px)').matches) {
      appendMessage('Tip: otoč telefon na šířku – místnost bude větší.', true);
    }
  }

  /* Měření času hry (jen když je místnost vidět). */
  function startClock() {
    let last = performance.now();
    let sinceSave = 0;
    setInterval(() => {
      const now = performance.now();
      const delta = now - last;
      last = now;
      // Čas běží a ukládá se jen při hraní v místnosti (jiné okno s hrou tak postup nepřepíše).
      if (game.state && !$('room').hidden && document.visibilityState === 'visible') {
        game.tick(delta);
        checkPhone(delta);
        sinceSave += delta;
        if (sinceSave >= 10000) {
          game.save();
          sinceSave = 0;
        }
      }
    }, 1000);
  }

  /* ---------- Telefon s nápovědou ----------
     Místnost může mít v game.json „phone“: { "flag", "idleSeconds", "ringEvery", "text" }.
     Když tým „idleSeconds“ nepostoupí (nezmění se příznaky, inventář ani zápisník), nastaví se
     příznak (telefon zvoní) a zvoní, dokud někdo nezvedne sluchátko. Co řekne, je v game.json
     u objektu telefonu (případy podle stavu hry). Po otevření brány už nezvoní. */
  let phoneIdle = 0;
  let phoneSig = '';
  let phoneRingIn = 0;

  function checkPhone(delta) {
    const cfg = game.room.phone;
    if (!cfg || game.gateOpen()) return;
    const st = game.state;
    const sig = `${Object.keys(st.flags).length}|${st.inventory.join(',')}|${st.notes.length}`;
    if (sig !== phoneSig) { phoneSig = sig; phoneIdle = 0; }
    if (st.flags[cfg.flag]) {
      // zvoní: opakovat zvonění (ne přes otevřené okno, aby nerušilo)
      phoneRingIn -= delta;
      if (phoneRingIn <= 0 && $('modal').hidden) {
        sound.sfx(cfg.sound || 'phoneRing');
        phoneRingIn = (cfg.ringEvery || 6) * 1000;
      }
      return;
    }
    if (!$('modal').hidden) return;
    phoneIdle += delta;
    if (phoneIdle >= (cfg.idleSeconds || 240) * 1000) {
      phoneIdle = 0;
      phoneRingIn = 0;
      handleEvents(game.run([{ set: cfg.flag }, { text: cfg.text || 'Zazvonil telefon.' }]));
      phoneSig = '';
    }
  }

  /* ====================================================================
   * Místnost
   * ==================================================================== */

  /* Vykreslení aktuálního pohledu místnosti; direction = odkud přichází (animace otočení). */
  function renderRoom(direction) {
    const room = game.room;
    const view = game.view;
    $('hud-gate').textContent = room.gateLabel || `Brána ${room.gateNumber || ''}`;
    $('hud-room').textContent = view !== room && view.name ? `${room.name} · ${view.name}` : room.name;
    $('scene-bg').src = view.background;
    $('scene-layers').innerHTML = '';
    sound.ambience(room.ambience || 'room');
    hideTooltip();
    renderNav(view);
    if (direction) animateView(direction);

    const hotspots = $('hotspots');
    hotspots.innerHTML = '';
    for (const h of view.hotspots || []) {
      const [x, y, w, hgt] = h.area;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'hotspot';
      btn.style.left = `${x}%`;
      btn.style.top = `${y}%`;
      btn.style.width = `${w}%`;
      btn.style.height = `${hgt}%`;
      btn.setAttribute('aria-label', h.name);
      btn.dataset.id = h.id;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        onHotspot(h);
      });
      btn.addEventListener('pointerenter', () => showTooltip(h));
      btn.addEventListener('focus', () => showTooltip(h));
      btn.addEventListener('pointerleave', hideTooltip);
      btn.addEventListener('blur', hideTooltip);
      hotspots.appendChild(btn);
    }
    renderState(false);
  }

  /* Šipky pro otočení v místnosti a návrat ze zvětšeného pohledu. */
  const NAV = {
    left: { label: '‹', title: 'Otočit se doleva (←)' },
    right: { label: '›', title: 'Otočit se doprava (→)' },
    back: { label: 'Zpět', title: 'Zpět (↓)' },
  };

  function renderNav(view) {
    const nav = $('scene-nav');
    nav.innerHTML = '';
    for (const dir of ['left', 'right', 'back']) {
      if (!view[dir]) continue;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `nav-${dir}`;
      btn.textContent = NAV[dir].label;
      btn.title = NAV[dir].title;
      btn.setAttribute('aria-label', NAV[dir].title);
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        turn(dir);
      });
      nav.appendChild(btn);
    }
  }

  function turn(direction) {
    if (!game.state || $('room').hidden || !$('modal').hidden) return;
    if (selectedItem) selectItem(null);
    handleEvents(game.turn(direction));
  }

  /* Krátká animace při otočení (posun do strany) nebo přiblížení. */
  function animateView(direction) {
    const scene = $('scene');
    const classes = ['enter-left', 'enter-right', 'enter-in', 'enter-back'];
    scene.classList.remove(...classes);
    void scene.offsetWidth;
    scene.classList.add(`enter-${direction}`);
    // Po doběhnutí animace třídu odebrat, ať na scéně nic nezůstane.
    clearTimeout(animateView.timer);
    animateView.timer = setTimeout(() => scene.classList.remove(...classes), 700);
  }

  /* Části, které se mění se stavem: vrstvy obrázku, inventář.
     animate = nově objevená vrstva se ukáže animací (např. vysunutí šuplíku); při otočení ne. */
  function renderState(animate = true) {
    const layers = $('scene-layers');
    const wanted = game.visibleLayers();
    const wantedSrc = wanted.map((l) => l.image);
    for (const img of Array.from(layers.children)) {
      if (!wantedSrc.includes(img.dataset.src)) img.remove();
    }
    let prev = null;
    for (const layer of wanted) {
      let img = Array.from(layers.children).find((el) => el.dataset.src === layer.image);
      if (!img) {
        img = document.createElement('img');
        img.src = layer.image;
        img.alt = '';
        img.dataset.src = layer.image;
        if (animate) img.classList.add(`anim-${layer.animate || 'fade'}`);
        // pořadí vrstev = pořadí v game.json
        if (prev) prev.after(img);
        else layers.prepend(img);
      }
      prev = img;
    }
    renderInventory();
  }

  function renderInventory() {
    const inv = $('inventory');
    inv.innerHTML = '';
    if (!game.state.inventory.length) {
      const empty = document.createElement('span');
      empty.className = 'empty';
      empty.textContent = 'Inventář je prázdný.';
      inv.appendChild(empty);
      return;
    }
    for (const id of game.state.inventory) {
      const item = game.item(id);
      const slot = document.createElement('button');
      slot.type = 'button';
      slot.className = 'slot';
      if (id === selectedItem) slot.classList.add('selected');
      if (newItems.has(id)) slot.classList.add('new');
      slot.title = item.name;
      const img = document.createElement('img');
      img.src = item.icon;
      img.alt = '';
      const label = document.createElement('span');
      label.textContent = item.name;
      slot.append(img, label);
      slot.addEventListener('click', (e) => {
        e.stopPropagation();
        onItem(id);
      });
      inv.appendChild(slot);
    }
    newItems.clear();
  }

  function onHotspot(hotspot) {
    hideTooltip();
    if (selectedItem && game.findUse(selectedItem, hotspot.id)) {
      const events = game.useItemOn(selectedItem, hotspot.id);
      selectItem(null);
      handleEvents(events);
      return;
    }
    // Předmět „v ruce“ sem nepasuje: vrátit ho do inventáře a provést běžnou akci (např. otevřít šuplík).
    const putBack = selectedItem ? game.item(selectedItem).name : null;
    if (putBack) selectItem(null);
    handleEvents(game.clickHotspot(hotspot.id));
    if (putBack) appendMessage(`(${putBack} sem nepasuje – vrátil jsi ho do inventáře.)`, true);
  }

  function onItem(id) {
    if (selectedItem && selectedItem !== id) {
      const a = selectedItem;
      selectItem(null);
      handleEvents(game.combineItems(a, id));
      return;
    }
    const item = game.item(id);
    if (selectedItem === id) {
      selectItem(null);
      openItemDetail(id);
      return;
    }
    selectItem(id);
    const lines = [`${item.name}: ${item.description}`];
    if (item.book) lines.push('Klikni na knihu znovu a otevřeš ji.');
    else if (item.calculator) lines.push('Klikni na kalkulačku znovu a otevře se.');
    else if (item.closeup) lines.push('Klikni na předmět znovu a prohlédneš si ho zblízka.');
    lines.push(data.defaults.selectHint);
    showMessage(lines.slice(0, 1), lines.slice(1));
  }

  function selectItem(id) {
    selectedItem = id;
    const cursor = $('cursor-item');
    if (id) {
      cursor.querySelector('img').src = game.item(id).icon;
    } else {
      cursor.hidden = true;
    }
    renderInventory();
  }

  /* Otevření předmětu: kniha k listování, nebo detail. */
  function openItemDetail(id) {
    const item = game.item(id);
    if (!item || (!item.book && !item.closeup && !item.calculator)) return;
    handleEvents(game.examineItem(id));
    if (item.calculator) {
      calc.open();
      return;
    }
    sound.sfx(item.book ? 'page' : 'paper');
    if (item.book) openBook(item.book);
    else openCloseup(item.closeup);
  }

  /* Zpracování událostí z enginu. */
  function handleEvents(events) {
    const texts = [];
    let modal = null;
    // Zvuk určený v game.json hraje hned; zvuk nového předmětu až po něm.
    const explicitSound = events.some((ev) => ev.type === 'sound');
    let pickupSound = false;
    for (const ev of events) {
      switch (ev.type) {
        case 'room':
          renderRoom();
          break;
        case 'view':
          renderRoom(ev.direction);
          if (!explicitSound) sound.sfx('step');
          break;
        case 'openItem':
          modal = () => openItemDetail(ev.item);
          break;
        case 'text':
          texts.push(ev.text);
          break;
        case 'sound':
          sound.sfx(ev.name);
          break;
        case 'item':
          newItems.add(ev.item);
          if (!pickupSound) {
            pickupSound = true;
            setTimeout(() => sound.sfx('pickup'), explicitSound ? 650 : 0);
          }
          break;
        case 'itemRemoved':
          if (selectedItem === ev.item) selectedItem = null;
          break;
        case 'note':
          toast('Zapsáno do zápisníku');
          pulse($('btn-notes'));
          break;
        case 'closeup':
          modal = () => openCloseup(ev.closeup);
          break;
        case 'gate':
          modal = () => openLock(ev.lock);
          break;
        case 'fx':
          sceneEffect(ev.name);
          break;
        case 'scare':
          scheduleScare(ev.scare);
          break;
        case 'activity':
          modal = () => openActivity(ev.activity);
          break;
        case 'leave':
          modal = null;
          leaveRoom();
          return;
        case 'state':
          break;
        default:
          break;
      }
    }
    renderState();
    if (texts.length) showMessage(texts);
    if (modal) setTimeout(modal, texts.length ? 450 : 0);
  }

  function leaveRoom() {
    // čeká-li ještě lekačka (např. z otevřené chodby), proběhne před odchodem
    if (scareTimer || scareActive) {
      scareThen = leaveRoom;
      if (scareTimer) {
        clearTimeout(scareTimer);
        runScare();
      }
      return;
    }
    closeModal();
    const events = game.nextRoom();
    if (events === false) {
      showFinish();
      return;
    }
    handleEvents(events);
  }

  /* Zpráva pod místností; „muted“ řádky jsou šedé (nápověda k ovládání). */
  function showMessage(lines, mutedLines) {
    const box = $('message');
    box.innerHTML = '';
    for (const line of lines) {
      const p = document.createElement('p');
      p.textContent = line;
      box.appendChild(p);
    }
    for (const line of mutedLines || []) appendMessage(line, true);
    // Po otevření brány nabídnout průchod (tlačítko v řádku, aby místnost neposkočila).
    if (game.state && game.room.gate && game.gateOpen()) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn go';
      btn.textContent = 'Projít branou ›';
      btn.addEventListener('click', leaveRoom);
      let last = box.lastElementChild;
      if (!last) {
        last = document.createElement('p');
        box.appendChild(last);
      }
      last.appendChild(btn);
    }
  }

  function appendMessage(text, muted) {
    const p = document.createElement('p');
    p.textContent = text;
    if (muted) p.className = 'muted';
    $('message').appendChild(p);
  }

  function showTooltip(hotspot) {
    const tip = $('tooltip');
    const [x, y, w] = hotspot.area;
    tip.textContent = selectedItem ? `${game.item(selectedItem).name} → ${hotspot.name}` : hotspot.name;
    tip.style.left = `${x + w / 2}%`;
    tip.style.top = `${Math.max(y, 6)}%`;
    tip.hidden = false;
  }

  function hideTooltip() {
    $('tooltip').hidden = true;
  }

  /* ====================================================================
   * Světlo v místnosti: tma s lampou, oknem a baterkou pod kurzorem
   * ==================================================================== */

  let sceneRaf = 0;
  const pointer = { x: 0.5, y: 0.55, inside: false };

  function setupScene() {
    const scene = $('scene');
    const canvas = $('scene-dark');

    const dust = $('scene-dust');
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      for (const c of [canvas, dust]) {
        c.width = Math.max(1, Math.round(scene.clientWidth * dpr));
        c.height = Math.max(1, Math.round(scene.clientHeight * dpr));
      }
    };
    new ResizeObserver(resize).observe(scene);

    const track = (e) => {
      const r = scene.getBoundingClientRect();
      pointer.x = (e.clientX - r.left) / r.width;
      pointer.y = (e.clientY - r.top) / r.height;
      pointer.inside = true;
    };
    scene.addEventListener('pointermove', track);
    scene.addEventListener('pointerdown', track);
    scene.addEventListener('click', () => {
      if (selectedItem) {
        selectItem(null);
        showMessage([], ['Předmět odložen zpět do inventáře.']);
      }
    });

    // Vybraný předmět „v ruce“ u kurzoru myši.
    document.addEventListener('pointermove', (e) => {
      const cursor = $('cursor-item');
      if (selectedItem && e.pointerType === 'mouse' && !$('room').hidden && $('modal').hidden) {
        cursor.style.left = `${e.clientX}px`;
        cursor.style.top = `${e.clientY}px`;
        cursor.hidden = false;
      } else {
        cursor.hidden = true;
      }
    });
  }

  function startSceneLoop() {
    if (sceneRaf) return;
    const draw = (now) => {
      drawDarkness(now / 1000);
      drawDust(now / 1000);
      sceneRaf = requestAnimationFrame(draw);
    };
    sceneRaf = requestAnimationFrame(draw);
  }

  function stopSceneLoop() {
    cancelAnimationFrame(sceneRaf);
    sceneRaf = 0;
  }

  function drawDarkness(t) {
    if (!game || !game.state) return;
    const canvas = $('scene-dark');
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;

    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, W, H);
    // Síla tmy: výchozí 0,86; pohled ji může změnit („darkness“ v game.json), např. u tmavé fotografie.
    const view = game.view;
    const darkness = typeof view.darkness === 'number' ? view.darkness : 0.86;
    ctx.fillStyle = `rgba(0, 0, 0, ${flashlightOn ? darkness : darkness * 0.35})`;
    ctx.fillRect(0, 0, W, H);

    ctx.globalCompositeOperation = 'destination-out';
    const lights = game.visibleLights().slice();
    if (flashlightOn) {
      lights.push({ x: pointer.x * 100, y: pointer.y * 100, radius: 15, strength: 0.95 });
    }
    for (const light of lights) {
      let strength = light.strength == null ? 0.8 : light.strength;
      if (light.flicker) {
        strength *= 0.94 + 0.04 * Math.sin(t * 7.3) + 0.02 * Math.sin(t * 17.9);
      }
      const x = (light.x / 100) * W;
      const y = (light.y / 100) * H;
      const r = (light.radius / 100) * W;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(0, 0, 0, ${strength})`);
      g.addColorStop(0.55, `rgba(0, 0, 0, ${strength * 0.6})`);
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ---------- Prach ve světle ----------
     Pohled může mít v game.json „dust“: { "count": 70, "area": [x, y, w, h] v % (výchozí celý obraz) }.
     Zrnka pomalu plují a jsou vidět hlavně tam, kam dopadá světlo (lampy, baterka).
     Při „omezit pohyb“ v systému se nekreslí. */

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let dustView = null;
  let dustParticles = [];
  let dustLast = 0;

  function drawDust(t) {
    const canvas = $('scene-dust');
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const view = game && game.state ? game.view : null;
    const cfg = view && view.dust;
    if (!cfg || reducedMotion.matches) {
      if (dustParticles.length) { ctx.clearRect(0, 0, W, H); dustParticles = []; dustView = null; }
      return;
    }
    const [ax, ay, aw, ah] = cfg.area || [0, 0, 100, 100];
    if (dustView !== view) {
      // nový pohled: rozsypat zrnka náhodně do oblasti
      dustView = view;
      dustParticles = Array.from({ length: cfg.count || 60 }, () => ({
        x: ax + Math.random() * aw, y: ay + Math.random() * ah,
        r: 0.8 + Math.random() * 1.8, sp: 0.15 + Math.random() * 0.5,
        ph: Math.random() * Math.PI * 2, a: 0.35 + Math.random() * 0.65,
      }));
    }
    const dt = Math.min(0.1, Math.max(0, t - dustLast));
    dustLast = t;
    ctx.clearRect(0, 0, W, H);
    const lights = game.visibleLights().slice();
    if (flashlightOn && pointer.inside) lights.push({ x: pointer.x * 100, y: pointer.y * 100, radius: 15, strength: 0.95 });
    const color = cfg.color || '255, 224, 170';
    const dpr = W / Math.max(1, $('scene').clientWidth);
    for (const p of dustParticles) {
      // pomalé klesání a vlnění (souřadnice v %)
      p.y += p.sp * dt * 1.2;
      p.x += Math.sin(t * 0.4 + p.ph) * dt * 0.6;
      if (p.y > ay + ah) { p.y = ay; p.x = ax + Math.random() * aw; }
      if (p.x < ax) p.x += aw; else if (p.x > ax + aw) p.x -= aw;
      // jas podle nejbližšího světla (vzdálenost v šířce obrazu, jako u tmy)
      let lit = flashlightOn ? 0.05 : 0.16;
      for (const l of lights) {
        const dx = p.x - l.x;
        const dy = (p.y - l.y) * (H / W);
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < l.radius) lit = Math.max(lit, (1 - d / l.radius) * (l.strength == null ? 0.8 : l.strength));
      }
      const twinkle = 0.75 + 0.25 * Math.sin(t * 1.7 + p.ph * 3);
      const alpha = Math.min(0.9, lit * p.a * twinkle * 2.2);
      if (alpha < 0.02) continue;
      ctx.beginPath();
      ctx.arc((p.x / 100) * W, (p.y / 100) * H, p.r * dpr, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${color}, ${alpha})`;
      ctx.fill();
    }
  }

  /* ---------- Přiblížení scény k předmětu (area v %), např. před měřením ---------- */

  function zoomScene(area, done) {
    const scene = $('scene');
    if (!area || reducedMotion.matches) { done(); return; }
    const [x, y, w, h] = area;
    const scale = Math.min(2.6, Math.max(1.4, 55 / Math.max(w, h * 9 / 16)));
    scene.style.transformOrigin = `${x + w / 2}% ${y + h / 2}%`;
    scene.classList.add('zooming');
    void scene.offsetWidth;
    scene.style.transform = `scale(${scale})`;
    setTimeout(done, 600);
  }

  function unzoomScene() {
    const scene = $('scene');
    if (!scene.style.transform) return;
    scene.style.transform = '';
    setTimeout(() => {
      if (!scene.style.transform) { scene.classList.remove('zooming'); scene.style.transformOrigin = ''; }
    }, 700);
  }

  function toggleFlashlight() {
    flashlightOn = !flashlightOn;
    Game.setSetting('flashlight', flashlightOn);
    updateLightButton();
  }

  function updateLightButton() {
    const btn = $('btn-light');
    btn.textContent = flashlightOn ? 'Baterka' : 'Rozsvíceno';
    btn.setAttribute('aria-pressed', String(flashlightOn));
    btn.title = flashlightOn ? 'Přepnout na rozsvícenou místnost' : 'Přepnout na baterku';
  }

  /* ====================================================================
   * Modální okna: detail, zápisník, menu, zámek brány
   * ==================================================================== */

  function openModal(build) {
    const box = $('modal-box');
    box.innerHTML = '';
    box.className = 'modal-box';
    bookNav = null;
    calc.setLockTarget(null);   // zámek (pokud se otevírá) si cíl nastaví znovu
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'modal-close';
    close.setAttribute('aria-label', 'Zavřít');
    close.textContent = '×';
    close.addEventListener('click', closeModal);
    box.appendChild(close);
    build(box);
    $('modal').hidden = false;
    $('cursor-item').hidden = true;
  }

  function closeModal() {
    $('modal').hidden = true;
    $('modal-box').innerHTML = '';
    bookNav = null;
    calc.setLockTarget(null);
    if (activityCleanup) {
      activityCleanup();   // zastavit kameru / časovače aktivity
      activityCleanup = null;
    }
    reflexHit = null;
    unzoomScene();
  }

  function heading(box, text) {
    const h = document.createElement('h2');
    h.textContent = text;
    box.appendChild(h);
  }

  function openCloseup(closeup) {
    openModal((box) => {
      const fig = document.createElement('figure');
      fig.className = 'closeup';
      fig.style.margin = '0';
      if (closeup.image) {
        const img = document.createElement('img');
        img.src = closeup.image;
        img.alt = closeup.caption || '';
        fig.appendChild(img);
      }
      if (closeup.note) {
        // Krátký vzkaz velkým rukopisem; delší text menším písmem; „type“ = tištěný text (účtenka).
        const paper = document.createElement('div');
        paper.className = 'paper';
        if (closeup.font === 'terminal') {
          // obrazovka, na které se text sám vypisuje (kliknutím se vypíše celý)
          paper.classList.add('terminal');
          typewrite(paper, game.fill(closeup.note));
        } else {
          if (closeup.font === 'type') paper.classList.add('type');
          else if (closeup.note.length > 30) paper.classList.add('long');
          paper.textContent = game.fill(closeup.note);
        }
        fig.appendChild(paper);
      }
      if (closeup.caption) {
        const cap = document.createElement('figcaption');
        cap.textContent = closeup.caption;
        fig.appendChild(cap);
      }
      box.appendChild(fig);
    });
  }

  /* Text vypisovaný po písmenech (obrazovka počítače). Časovač se zastaví při zavření okna. */
  function typewrite(el, text) {
    const out = document.createElement('span');
    const caret = document.createElement('span');
    caret.className = 'term-caret';
    caret.textContent = '█';
    el.append(out, caret);
    let i = 0;
    let timer = 0;
    const step = () => {
      i += 1;
      out.textContent = text.slice(0, i);
      if (i % 3 === 0 && text[i - 1] !== ' ') sound.sfx('termTick');
      if (i < text.length) timer = setTimeout(step, text[i - 1] === '\n' ? 380 : 42);
    };
    timer = setTimeout(step, 500);
    el.addEventListener('click', () => {
      clearTimeout(timer);
      i = text.length;
      out.textContent = text;
    });
    activityCleanup = () => clearTimeout(timer);
  }

  /* ---------- Lekačky ----------
     Obrázek přes celou obrazovku, náraz zvuku a otřes. Předtím podkres ztichne (napětí).
     Jedno krátké objevení, žádné opakované blikání. Vypínají se v Menu. */

  let scareTimer = 0;      // naplánovaná lekačka (čeká se na „delay“)
  let scareActive = false; // lekačka právě běží
  let scareCfg = null;
  let scareThen = null;    // co udělat po skončení (např. odejít z místnosti)

  const scaresOn = () => Game.getSetting('scares', false);   // výchozí: vypnuté (zapínají se v Menu)

  function scheduleScare(cfg) {
    if (!scaresOn() || !cfg || !cfg.image) return;
    clearTimeout(scareTimer);
    scareCfg = cfg;
    const delay = (cfg.delay || 0) * 1000;
    sound.tension(Math.max(delay / 1000, 0.3));
    // obrázek načíst předem, aby se ukázal přesně se zvukem
    new Image().src = cfg.image;
    scareTimer = setTimeout(runScare, delay);
  }

  function runScare() {
    scareTimer = 0;
    const cfg = scareCfg;
    scareCfg = null;
    if (!cfg) return;
    let el = $('scare');
    if (!el) {
      el = document.createElement('div');
      el.id = 'scare';
      el.className = 'scare';
      el.innerHTML = '<img alt="">';
      document.body.appendChild(el);
    }
    const img = el.querySelector('img');
    img.src = cfg.image;
    img.style.objectPosition = cfg.position || '50% 50%';   // co má zůstat v záběru na úzkém displeji
    el.style.setProperty('--rush', `${cfg.rush || 0.12}s`);
    el.classList.remove('out');
    el.hidden = false;
    void el.offsetWidth;
    el.classList.add('go');
    scareActive = true;
    sound.sfx(cfg.sound || 'scareHit');
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => {
        el.hidden = true;
        el.classList.remove('go', 'out');
        scareActive = false;
        sound.release();
        if (cfg.after) appendMessage(cfg.after);
        if (scareThen) {
          const fn = scareThen;
          scareThen = null;
          fn();
        }
      }, 200);
    }, (cfg.duration || 0.9) * 1000);
  }

  /* Efekt přes celou místnost (např. „blackout“ = výpadek proudu). */
  function sceneEffect(name) {
    const scene = $('scene');
    const cls = `fx-${name}`;
    scene.classList.remove(cls);
    void scene.offsetWidth;
    scene.classList.add(cls);
    setTimeout(() => scene.classList.remove(cls), 2700);
  }

  /* ---------- Kniha k listování ---------- */

  let bookNav = null; // { prev(), next() } – když je otevřená kniha (kvůli šipkám na klávesnici)

  /* Text se zápisem dolního indexu: „F_{sval}“ → F se spodním indexem „sval“. */
  function richText(el, text) {
    const parts = String(text).split(/_\{([^}]*)\}/);
    parts.forEach((part, i) => {
      if (i % 2) {
        const sub = document.createElement('sub');
        sub.textContent = part;
        el.appendChild(sub);
      } else if (part) {
        el.appendChild(document.createTextNode(part));
      }
    });
    return el;
  }

  function renderPage(pageEl, page, number) {
    pageEl.innerHTML = '';
    pageEl.className = pageEl.className.replace(/\s*title-page/, '');
    if (!page) {
      pageEl.classList.add('blank');
      return;
    }
    pageEl.classList.remove('blank');
    if (page.type === 'title') pageEl.classList.add('title-page');
    for (const block of page.blocks || []) {
      let el;
      if (block.heading) el = richText(document.createElement('h3'), block.heading);
      else if (block.p) el = richText(document.createElement('p'), block.p);
      else if (block.formula) {
        el = richText(document.createElement('p'), block.formula);
        el.className = 'formula';
      } else if (block.note) {
        el = richText(document.createElement('p'), block.note);
        el.className = 'margin-note';
      } else if (block.image) {
        el = document.createElement('img');
        el.src = block.image;
        el.alt = block.caption || '';
      } else if (block.toc) {
        // Obsah: název kapitoly … číslo strany
        el = document.createElement('div');
        el.className = 'toc';
        for (const [name, pageNo] of block.toc) {
          const row = document.createElement('div');
          const label = document.createElement('span');
          label.textContent = name;
          const dots = document.createElement('span');
          dots.className = 'dots';
          const no = document.createElement('span');
          no.textContent = String(pageNo);
          row.append(label, dots, no);
          el.appendChild(row);
        }
      }
      if (el) pageEl.appendChild(el);
    }
    if (number > 1) {
      const num = document.createElement('span');
      num.className = 'num';
      num.textContent = String(number);
      pageEl.appendChild(num);
    }
  }

  function openBook(book) {
    const pages = book.pages || [];
    const single = window.matchMedia('(max-width: 700px)').matches;
    const perView = single ? 1 : 2;
    let first = 0;

    openModal((box) => {
      box.classList.add('book-box');
      const spread = document.createElement('div');
      spread.className = `book${single ? ' single' : ''}`;
      const left = document.createElement('div');
      left.className = 'page left';
      const right = document.createElement('div');
      right.className = 'page right';
      spread.append(left, right);

      const nav = document.createElement('div');
      nav.className = 'book-nav';
      const prev = document.createElement('button');
      prev.type = 'button';
      prev.className = 'btn';
      prev.textContent = '‹ Předchozí';
      const counter = document.createElement('span');
      counter.className = 'book-counter';
      const next = document.createElement('button');
      next.type = 'button';
      next.className = 'btn';
      next.textContent = 'Další ›';
      nav.append(prev, counter, next);

      const title = document.createElement('p');
      title.className = 'book-title';
      title.textContent = book.title || '';
      box.append(title, spread, nav);

      const render = (direction) => {
        renderPage(left, pages[first], first + 1);
        if (!single) renderPage(right, pages[first + 1], first + 2);
        prev.disabled = first === 0;
        next.disabled = first + perView >= pages.length;
        const last = Math.min(first + perView, pages.length);
        counter.textContent = perView === 2 && last > first + 1
          ? `strana ${first + 1}–${last} z ${pages.length}`
          : `strana ${first + 1} z ${pages.length}`;
        if (direction) {
          spread.classList.remove('turn-next', 'turn-prev');
          void spread.offsetWidth;
          spread.classList.add(direction === 'next' ? 'turn-next' : 'turn-prev');
        }
      };
      const go = (step) => {
        const target = first + step * perView;
        if (target < 0 || target >= pages.length) return;
        first = target;
        sound.sfx('page');
        render(step > 0 ? 'next' : 'prev');
      };
      prev.addEventListener('click', () => go(-1));
      next.addEventListener('click', () => go(1));
      render();
      bookNav = { prev: () => go(-1), next: () => go(1) };
    });
  }

  /* ---------- Aktivity: reflex test, dřepy (GSPORT), zkouška stability (vojenská) ---------- */

  let activityCleanup = null;  // zastavení časovačů / kamery při zavření okna
  let reflexHit = null;        // stisk mezerníku během reflex testu

  function openActivity(ref) {
    // aktivita zapsaná jménem odkazuje na „activities“ místnosti v game.json
    const act = typeof ref === 'string' ? (game.room.activities || {})[ref] : ref;
    if (!act) return;
    if (act.type === 'reflex') openReflex(act);
    else if (act.type === 'squats') openSquats(act);
    else if (act.type === 'lean') openLean(act);
    else if (act.type === 'tape') openTape(act);
    else if (act.type === 'pack') openPack(act);
    else if (act.type === 'lift') openLift(act);
    else if (act.type === 'stance') openStance(act);
    else if (act.type === 'jump') openJump(act);
    else if (act.type === 'targets') openTargets(act);
  }

  function finishActivity(act, results) {
    closeModal();
    handleEvents(game.completeActivity(act, results));
  }

  function para(parent, text, cls) {
    const p = document.createElement('p');
    p.textContent = text;
    if (cls) p.className = cls;
    parent.appendChild(p);
    return p;
  }

  function button(parent, text, cls, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = cls || 'btn';
    b.textContent = text;
    b.addEventListener('click', onClick);
    parent.appendChild(b);
    return b;
  }

  /* Reflex test: až se kruh rozsvítí, co nejrychleji stisknout mezerník nebo kliknout. */
  function openReflex(act) {
    const rounds = act.rounds || 5;
    const times = [];
    let state = 'idle';
    let timer = 0;
    let t0 = 0;

    openModal((box) => {
      box.classList.add('activity-box');
      heading(box, act.title || 'Reflex test');
      para(box, act.intro || `Až se kruh rozsvítí, co nejrychleji stiskni MEZERNÍK (nebo klikni do kruhu). Pokusů: ${rounds}.`, 'question');
      const pad = document.createElement('button');
      pad.type = 'button';
      pad.className = 'reflex-pad idle';
      pad.textContent = 'Začít';
      box.appendChild(pad);
      const list = document.createElement('ol');
      list.className = 'reflex-list';
      box.appendChild(list);
      const result = para(box, '', 'feedback');

      const arm = () => {
        state = 'wait';
        pad.className = 'reflex-pad wait';
        pad.textContent = 'Připrav se…';
        timer = setTimeout(() => {
          state = 'go';
          pad.className = 'reflex-pad go';
          pad.textContent = 'TEĎ!';
          t0 = performance.now();
          sound.sfx('reflexGo');
        }, 1500 + Math.random() * 2500);
      };

      const finish = () => {
        state = 'done';
        const best = Math.min(...times);
        const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
        pad.className = 'reflex-pad done';
        pad.textContent = 'Hotovo';
        result.className = 'feedback good';
        result.textContent = `Nejlepší ${best} ms, průměr ${avg} ms.`;
        button(box, 'Pokračovat ›', 'btn activity-next', () => finishActivity(act, { reflex_best: best, reflex_avg: avg }));
      };

      reflexHit = () => {
        if (state === 'idle') { arm(); return; }
        if (state === 'wait') {
          clearTimeout(timer);
          state = 'pause';
          pad.className = 'reflex-pad early';
          pad.textContent = 'Moc brzy!';
          sound.sfx('wrong');
          setTimeout(arm, 1300);
          return;
        }
        if (state === 'go') {
          const ms = Math.round(performance.now() - t0);
          times.push(ms);
          const li = document.createElement('li');
          li.textContent = `${ms} ms`;
          list.appendChild(li);
          sound.sfx('key');
          if (times.length >= rounds) { finish(); return; }
          state = 'pause';
          pad.className = 'reflex-pad pause';
          pad.textContent = `${ms} ms`;
          setTimeout(arm, 1100);
        }
      };
      pad.addEventListener('pointerdown', (e) => { e.preventDefault(); reflexHit(); });
      activityCleanup = () => { clearTimeout(timer); reflexHit = null; };
    });
  }

  /* Squat Challenge: dřepy s kamerou (počítá js/squats.js), nebo bez kamery (měří se čas). */
  function openSquats(act) {
    const target = act.count || 15;
    const threshold = act.threshold || 90;

    openModal((box) => {
      box.classList.add('activity-box', 'squat-box');
      heading(box, act.title || 'Squat Challenge');
      para(box, act.intro || `${target} dřepů. Dřep se počítá, když úhel v koleni klesne pod ${threshold}° a znovu se postavíš.`, 'question');

      const choice = document.createElement('div');
      choice.className = 'squat-choice';
      box.appendChild(choice);
      para(choice, 'S kamerou: postav se 2–3 m od notebooku BOKEM ke kameře, aby byla vidět celá postava. Každý započítaný dřep pípne.', 'muted');
      para(choice, 'Obraz z kamery se zpracovává jen v tomto prohlížeči – nic se nenahrává ani neukládá.', 'muted small');
      const btns = document.createElement('div');
      btns.className = 'squat-buttons';
      choice.appendChild(btns);

      const stage = document.createElement('div');
      stage.className = 'squat-stage';
      stage.hidden = true;
      const canvas = document.createElement('canvas');
      const counter = document.createElement('div');
      counter.className = 'squat-counter';
      counter.textContent = `0 / ${target}`;
      stage.append(canvas, counter);
      box.appendChild(stage);
      const status = para(box, '', 'feedback');

      const setStatus = (text, kind) => {
        status.textContent = text;
        status.className = `feedback${kind === 'ok' ? ' good' : kind === 'bad' ? ' bad' : ''}`;
      };

      const done = (results) => {
        sound.sfx('levelUp');
        setStatus(`Hotovo: ${results.n} dřepů za ${results.t.toFixed(1).replace('.', ',')} s.`, 'ok');
        button(box, 'Pokračovat ›', 'btn activity-next', () => finishActivity(act, results));
      };

      // --- s kamerou ---
      button(btns, 'S kamerou', 'btn primary', async () => {
        choice.hidden = true;
        stage.hidden = false;
        // zavře-li hráč okno ještě během načítání, kamera se po spuštění hned zase vypne
        let cancelled = false;
        activityCleanup = () => { cancelled = true; };
        try {
          const mod = await import('./squats.js?v=0.11');
          const ctrl = await mod.startSquats({
            canvas, target, threshold,
            onStatus: setStatus,
            onCount: (n) => { counter.textContent = `${n} / ${target}`; counter.classList.remove('bump'); void counter.offsetWidth; counter.classList.add('bump'); },
            onBeep: (kind) => sound.sfx(kind === 'ok' ? 'squatOk' : 'squatShallow'),
            onDone: (r) => done({ n: r.n, t: r.t, uhel: r.uhel, kamera: 1 }),
          });
          if (cancelled) { ctrl.stop(); return; }
          activityCleanup = () => ctrl.stop();
        } catch (e) {
          if (cancelled) return;
          console.error(e);
          stage.hidden = true;
          choice.hidden = false;
          const msg = e && e.name === 'NotAllowedError' ? 'Přístup ke kameře byl odmítnut.'
            : e && e.name === 'NotFoundError' ? 'Kamera nebyla nalezena.'
            : 'Kameru se nepodařilo spustit.';
          setStatus(`${msg} Můžeš cvičit bez kamery.`, 'bad');
        }
      });

      // --- bez kamery: hráč klikne Start a Hotovo, hra změří čas ---
      button(btns, 'Bez kamery', 'btn', () => {
        choice.hidden = true;
        setStatus('');
        const manual = document.createElement('div');
        manual.className = 'squat-manual';
        box.insertBefore(manual, status);
        para(manual, `Klikni Start, udělej ${target} dřepů (do ${threshold}° v koleni) a klikni Hotovo.`, 'muted');
        const clock = para(manual, '0,0 s', 'squat-clock');
        const minSec = act.minSeconds || target;
        let t0 = 0;
        let iv = 0;
        const start = button(manual, 'Start', 'btn primary', () => {
          t0 = performance.now();
          start.disabled = true;
          sound.sfx('reflexGo');
          iv = setInterval(() => {
            const s = (performance.now() - t0) / 1000;
            clock.textContent = `${s.toFixed(1).replace('.', ',')} s`;
            stop.disabled = s < minSec;
          }, 100);
        });
        const stop = button(manual, 'Hotovo', 'btn', () => {
          clearInterval(iv);
          stop.disabled = true;
          const t = Math.round((performance.now() - t0) / 100) / 10;
          clock.textContent = `${t.toFixed(1).replace('.', ',')} s`;
          done({ n: target, t, uhel: null, kamera: 0 });
        });
        stop.disabled = true;
        activityCleanup = () => clearInterval(iv);
      });
    });
  }

  /* Měření metrem tahem: hráč chytí pouzdro metru a natáhne pásek od háčku (start) k cíli.
     Měří se vodorovně; souřadnice jsou v pixelech obrázku „image“, výřez „crop“ = [x, y, w, h].
     Správně, když je odečet do „tolerance“ cm od cíle; pak se provedou účinky „done“. */
  function openTape(act) {
    const [cx, cy, cw, ch] = act.crop;
    const [sx, sy] = act.start;
    const [tx, ty] = act.target;
    const ppc = act.pxPerCm;
    const goal = Math.abs(tx - sx) / ppc;
    const tol = act.tolerance || 1.5;
    const dir = Math.sign(tx - sx) || -1;
    const NS = 'http://www.w3.org/2000/svg';
    const el = (name, attrs, parent) => {
      const e = document.createElementNS(NS, name);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
      if (parent) parent.appendChild(e);
      return e;
    };

    zoomScene(act.zoomFrom, () => openModal((box) => {
      box.classList.add('activity-box', 'tape-box');
      heading(box, act.title || 'Měření metrem');
      para(box, act.intro || 'Chyť pouzdro metru a natáhni pásek až pod značku.', 'question');

      const stage = document.createElement('div');
      stage.className = 'tape-stage';
      stage.style.aspectRatio = `${cw} / ${ch}`;
      stage.style.maxWidth = `calc(48dvh * ${cw / ch})`;
      stage.style.margin = '0 auto';
      const [iw, ih] = act.imageSize;
      stage.style.backgroundImage = `url("${act.image}")`;
      stage.style.backgroundSize = `${(iw / cw) * 100}% ${(ih / ch) * 100}%`;
      stage.style.backgroundPosition = `${(cx / (iw - cw)) * 100}% ${(cy / (ih - ch)) * 100}%`;
      stage.tabIndex = 0;
      stage.setAttribute('aria-label', 'Metr: šipkami doleva a doprava natáhneš pásek, Enter = odečíst');
      const svg = el('svg', { viewBox: `${cx} ${cy} ${cw} ${ch}` }, stage);
      box.appendChild(stage);
      const reading = para(box, '', 'tape-reading');
      const status = para(box, '', 'feedback');

      // svislá pomocná čára od cílové značky dolů k pásku (měří se vodorovně)
      el('line', { x1: tx, y1: ty, x2: tx, y2: sy, stroke: '#ffd28a', 'stroke-width': 1.5, 'stroke-dasharray': '5 4', opacity: 0.55 }, svg);
      const tape = el('g', {}, svg);
      const band = el('rect', { y: sy - 6, height: 12, fill: act.color || '#f2d24a', stroke: act.edge || '#7a6312', 'stroke-width': 0.8 }, tape);
      const ticks = el('g', { stroke: '#2a2410', 'stroke-width': 0.8 }, tape);
      el('circle', { cx: sx, cy: sy, r: 4, fill: '#3a3a34', stroke: '#e8e0c4', 'stroke-width': 1.2 }, svg);   // háček na značce
      const casing = el('g', { style: 'cursor: grab' }, svg);
      el('rect', { x: -15, y: -15, width: 30, height: 30, rx: 7, fill: act.handle || '#d8b42c', stroke: '#3a2e0a', 'stroke-width': 1.5 }, casing);
      el('circle', { cx: 0, cy: 0, r: 7, fill: '#3a3a34' }, casing);

      let end = sx + dir * ppc * 3;   // pásek trochu povytažený
      let finished = false;
      const cm = () => Math.abs(end - sx) / ppc;
      const draw = () => {
        const a = Math.min(sx, end);
        const b = Math.max(sx, end);
        band.setAttribute('x', a);
        band.setAttribute('width', Math.max(0, b - a));
        ticks.innerHTML = '';
        for (let i = 1; i * ppc <= b - a; i++) {
          const x = sx + Math.sign(end - sx) * i * ppc;
          const big = i % 5 === 0;
          el('line', { x1: x, y1: sy - 6, x2: x, y2: sy - 6 + (big ? 7 : 3.5) }, ticks);
        }
        casing.setAttribute('transform', `translate(${end + Math.sign(end - sx || dir) * 15} ${sy})`);
        reading.textContent = `${Math.round(cm())} cm`;
      };
      const toImageX = (e) => {
        const r = svg.getBoundingClientRect();
        return cx + ((e.clientX - r.left) / r.width) * cw;
      };
      const check = () => {
        if (finished) return;
        const v = cm();
        if (Math.sign(end - sx) !== dir) {
          status.textContent = act.wrongDirection || 'Opačným směrem – táhni pásek ke značce.';
          status.className = 'feedback bad';
        } else if (Math.abs(v - goal) <= tol) {
          finished = true;
          end = tx;
          draw();
          sound.sfx('measure');
          status.textContent = act.success || `${Math.round(goal)} cm.`;
          status.className = 'feedback good';
          stage.style.cursor = 'default';
          button(box, 'Pokračovat ›', 'btn activity-next', () => finishActivity(act, {}));
        } else {
          status.textContent = v < goal ? (act.tooShort || 'Ještě kousek dál.') : (act.tooLong || 'To je moc daleko.');
          status.className = 'feedback bad';
        }
      };

      let dragging = false;
      stage.addEventListener('pointerdown', (e) => {
        if (finished) return;
        e.preventDefault();
        dragging = true;
        stage.classList.add('dragging');
        stage.setPointerCapture(e.pointerId);
        end = Math.min(cx + cw - 20, Math.max(cx + 20, toImageX(e)));
        draw();
      });
      stage.addEventListener('pointermove', (e) => {
        if (!dragging || finished) return;
        end = Math.min(cx + cw - 20, Math.max(cx + 20, toImageX(e)));
        draw();
      });
      const up = () => {
        if (!dragging) return;
        dragging = false;
        stage.classList.remove('dragging');
        check();
      };
      stage.addEventListener('pointerup', up);
      stage.addEventListener('pointercancel', up);
      stage.addEventListener('keydown', (e) => {
        if (finished) return;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          end = Math.min(cx + cw - 20, Math.max(cx + 20, end + (e.key === 'ArrowLeft' ? -ppc : ppc)));
          draw();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          check();
        }
      });
      draw();
      setTimeout(() => stage.focus(), 50);
    }));
  }

  /* Balení batohu: hráč přetahuje věci do částí batohu (nebo klikne na věc a pak na část).
     Živě se počítá těžiště batohu a o kolik se posune společné těžiště vojáka s batohem:
     posun = Σ(m · x) / (m_vojáka + m_batohu), x = vodorovná vzdálenost od těžiště vojáka.
     Hotovo, když jsou všechny věci zabalené a posun je nejvýš „goalMax“ cm. */
  function openPack(act) {
    const NS = 'http://www.w3.org/2000/svg';
    const el = (name, attrs, parent, text) => {
      const e = document.createElementNS(NS, name);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
      if (text !== undefined) e.textContent = text;
      if (parent) parent.appendChild(e);
      return e;
    };
    const fmt = (v, d = 1) => v.toFixed(d).replace('.', ',');
    const place = {};                       // id věci → id části batohu (nebo null = ještě venku)
    for (const it of act.items) place[it.id] = null;
    let selected = null;
    let done = false;
    const K = 5;                            // px na cm v nákresu
    const BX = 330;                         // x těžiště vojáka v nákresu

    openModal((box) => {
      box.classList.add('activity-box', 'pack-box');
      heading(box, act.title || 'Sbal batoh');
      para(box, act.intro || 'Přetáhni věci do batohu.', 'question');

      const wrap = document.createElement('div');
      wrap.className = 'pack-wrap';
      box.appendChild(wrap);

      // nákres z boku: voják vpravo (čelem doprava), batoh na zádech vlevo
      const svg = el('svg', { viewBox: '0 0 420 300', class: 'pack-svg' }, wrap);
      el('rect', { x: 0, y: 0, width: 420, height: 300, fill: 'rgba(0,0,0,0.25)', rx: 8 }, svg);
      el('line', { x1: 0, y1: 286, x2: 420, y2: 286, stroke: '#5a4a30', 'stroke-width': 2 }, svg);
      // voják (silueta)
      el('circle', { cx: 340, cy: 38, r: 16, fill: '#6b6650' }, svg);
      el('rect', { x: 318, y: 56, width: 42, height: 110, rx: 12, fill: '#4f5638' }, svg);
      el('rect', { x: 322, y: 160, width: 34, height: 120, rx: 8, fill: '#454c32' }, svg);
      el('path', { d: 'M318,282 L372,282 L378,286 L314,286 Z', fill: '#1c1915' }, svg);
      // části batohu = cíle pro věci
      const zones = {};
      for (const sl of act.slots) {
        const x = BX - sl.cm * K;
        const g = el('g', { class: 'pack-zone', 'data-slot': sl.id }, svg);
        el('rect', { x: x - 24, y: 60, width: 48, height: 150, rx: 6, fill: 'rgba(120,110,70,0.35)', stroke: '#a89a64', 'stroke-dasharray': '4 3' }, g);
        el('text', { x, y: 225, 'text-anchor': 'middle', 'font-size': 10, fill: '#d8cfae' }, g, sl.name);
        el('text', { x, y: 238, 'text-anchor': 'middle', 'font-size': 9, fill: '#9a9078' }, g, `${sl.cm} cm`);
        const list = el('g', {}, g);
        zones[sl.id] = { g, list, x, sl };
        g.addEventListener('click', () => { if (selected) moveTo(selected, sl.id); });
      }
      // svislice: těžiště vojáka, těžiště batohu, společné těžiště
      // ukazatele nesmí zachytávat ukazatel myši (pod nimi jsou části batohu)
      const marks = el('g', { 'pointer-events': 'none' }, svg);
      el('line', { x1: BX, y1: 20, x2: BX, y2: 286, stroke: '#e8e0c4', 'stroke-width': 1, 'stroke-dasharray': '3 3', opacity: 0.6 }, marks);
      el('circle', { cx: BX, cy: 150, r: 6, fill: '#efe8d0', stroke: '#1a1a16' }, marks);
      const packMark = el('g', {}, marks);
      el('circle', { cx: 0, cy: 0, r: 6, fill: 'none', stroke: '#efe8d0', 'stroke-width': 2 }, packMark);
      el('path', { d: 'M-4,-4 L4,4 M4,-4 L-4,4', stroke: '#efe8d0', 'stroke-width': 1.5 }, packMark);
      const comLine = el('line', { y1: 120, y2: 286, stroke: '#ffd28a', 'stroke-width': 2 }, marks);
      const comMark = el('polygon', { points: '0,0 -6,10 6,10', fill: '#ffd28a' }, marks);
      el('text', { x: BX + 6, y: 298, 'font-size': 9, fill: '#9a9078' }, marks, 'těžiště vojáka');

      // věci k zabalení
      const tray = document.createElement('div');
      tray.className = 'pack-tray';
      wrap.appendChild(tray);
      const chips = {};
      for (const it of act.items) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'pack-item';
        b.textContent = `${it.name} · ${fmt(it.kg, 0)} kg`;
        b.dataset.item = it.id;
        chips[it.id] = b;
        tray.appendChild(b);
      }

      const readout = document.createElement('div');
      readout.className = 'pack-readout';
      box.appendChild(readout);
      const status = para(box, '', 'feedback');
      const actions = document.createElement('div');
      actions.className = 'squat-buttons';
      box.appendChild(actions);
      const check = button(actions, act.checkLabel || 'Batoh je sbalený', 'btn primary', () => evaluate());

      function compute() {
        let m = act.packKg || 0;
        let mx = (act.packKg || 0) * (act.packCm || 0);
        for (const it of act.items) {
          const sl = act.slots.find((z) => z.id === place[it.id]);
          if (!sl) continue;
          m += it.kg;
          mx += it.kg * sl.cm;
        }
        const body = act.bodyKg || 70;
        return { m, d: m ? mx / m : 0, shift: mx / (body + m), all: act.items.every((it) => place[it.id]) };
      }

      function render() {
        for (const z of Object.values(zones)) z.list.innerHTML = '';
        for (const it of act.items) {
          const chip = chips[it.id];
          chip.classList.toggle('selected', selected === it.id);
          chip.classList.toggle('packed', Boolean(place[it.id]));
          const z = zones[place[it.id]];
          if (!z) continue;
          const n = z.list.childNodes.length;
          const t = el('text', { x: z.x, y: 78 + n * 13, 'text-anchor': 'middle', 'font-size': 9.5, fill: '#f2e6c2', class: 'pack-label', 'data-item': it.id }, z.list, `${it.short || it.name} ${it.kg}`);
          t.addEventListener('click', (e) => { e.stopPropagation(); if (!suppressClick) select(it.id); });
        }
        for (const z of Object.values(zones)) {
          const full = act.items.filter((it) => place[it.id] === z.sl.id).length >= z.sl.cap;
          z.g.classList.toggle('full', full);
        }
        const r = compute();
        packMark.setAttribute('transform', `translate(${BX - r.d * K} 150)`);
        const cx = BX - r.shift * K;
        comLine.setAttribute('x1', cx);
        comLine.setAttribute('x2', cx);
        comMark.setAttribute('transform', `translate(${cx} 276)`);
        const lean = Math.atan(r.shift / (act.comHeightCm || 100)) * 180 / Math.PI;
        readout.innerHTML = '';
        const rows = [
          ['Batoh', `${fmt(r.m, 0)} kg`],
          ['Těžiště batohu za těžištěm vojáka', `${fmt(r.d)} cm`],
          ['Společné těžiště se posune dozadu o', `${fmt(r.shift)} cm`],
          ['Potřebný předklon (přibližně)', `${fmt(lean)}°`],
        ];
        for (const [k, v] of rows) {
          const d = document.createElement('div');
          const a = document.createElement('span'); a.textContent = k;
          const b = document.createElement('strong'); b.textContent = v;
          d.append(a, b);
          readout.appendChild(d);
        }
        check.disabled = done || !r.all;
      }

      function select(id) {
        if (done) return;
        selected = selected === id ? null : id;
        render();
      }

      function moveTo(id, slotId) {
        if (done) return;
        const sl = act.slots.find((z) => z.id === slotId);
        const used = act.items.filter((it) => place[it.id] === slotId && it.id !== id).length;
        if (sl && used >= sl.cap) {
          status.textContent = `${sl.name}: tam už se nic nevejde.`;
          status.className = 'feedback bad';
          return;
        }
        place[id] = slotId;
        selected = null;
        status.textContent = '';
        status.className = 'feedback';
        sound.sfx('paper');
        render();
      }

      function evaluate() {
        const r = compute();
        if (r.shift <= act.goalMax + 1e-9) {
          done = true;
          sound.sfx('unlock');
          status.textContent = act.success || 'Sbaleno správně.';
          status.className = 'feedback good';
          check.remove();
          button(actions, 'Pokračovat ›', 'btn activity-next', () => finishActivity(act, { batoh_posun: Math.round(r.shift * 10) / 10 }));
        } else {
          sound.sfx('wrong');
          status.textContent = act.tryAgain || 'Těžiště je pořád moc vzadu.';
          status.className = 'feedback bad';
        }
        render();
      }

      // tažení věci myší / prstem; kliknutí = vybrat (pak klik na část batohu)
      let drag = null;
      let suppressClick = false;   // po tažení nepovažovat puštění za kliknutí
      tray.addEventListener('click', (e) => {
        const b = e.target.closest('.pack-item');
        if (b && !suppressClick) select(b.dataset.item);
      });
      const startDrag = (id, e) => {
        if (done) return;
        e.preventDefault();   // bez označování textu a nativního přetahování prohlížeče
        drag = { id, x0: e.clientX, y0: e.clientY, ghost: null };
      };
      tray.addEventListener('pointerdown', (e) => {
        const b = e.target.closest('.pack-item');
        if (b) startDrag(b.dataset.item, e);
      });
      svg.addEventListener('pointerdown', (e) => {
        const t = e.target.closest('.pack-label');
        if (!t) return;
        startDrag(t.getAttribute('data-item'), e);
      });
      const onMove = (e) => {
        if (!drag) return;
        if (!drag.ghost && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 6) {
          drag.ghost = document.createElement('div');
          drag.ghost.className = 'pack-ghost';
          drag.ghost.textContent = chips[drag.id].textContent;
          document.body.appendChild(drag.ghost);
        }
        if (drag.ghost) {
          drag.ghost.style.left = `${e.clientX}px`;
          drag.ghost.style.top = `${e.clientY}px`;
        }
      };
      const onUp = (e) => {
        if (!drag) return;
        const d = drag;
        drag = null;
        if (!d.ghost) return;            // jen kliknutí – vyřeší „click“
        d.ghost.remove();
        suppressClick = true;
        setTimeout(() => { suppressClick = false; }, 0);
        const hit = document.elementFromPoint(e.clientX, e.clientY);
        const zone = hit && hit.closest && hit.closest('.pack-zone');
        if (zone) moveTo(d.id, zone.dataset.slot);
        else if (hit && hit.closest && hit.closest('.pack-tray')) { place[d.id] = null; render(); }
      };
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      activityCleanup = () => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        if (drag && drag.ghost) drag.ghost.remove();
      };
      render();
    });
  }

  /* Zvedání břemene: hráč volí držení těla a tahem posouvá bednu blíž k tělu nebo dál.
     Moment v bedrech (osa L5/S1) = tíha trupu × rameno trupu + tíha bedny × rameno bedny;
     zádové svaly ho vyrovnávají na krátkém rameni „muscleArmCm“: F = M / r. Zvedne se, když M ≤ „goalMax“. */
  function openLift(act) {
    const NS = 'http://www.w3.org/2000/svg';
    const el = (name, attrs, parent, text) => {
      const e = document.createElementNS(NS, name);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
      if (text !== undefined) e.textContent = text;
      if (parent) parent.appendChild(e);
      return e;
    };
    const fmt = (v, d = 0) => v.toFixed(d).replace('.', ',');
    const g = 9.81;
    const K = 4;                       // px na cm v nákresu
    let posture = act.postures[0];
    let rk = posture.rMin;             // vodorovná vzdálenost bedny od beder (cm)
    let done = false;

    openModal((box) => {
      box.classList.add('activity-box', 'pack-box');
      heading(box, act.title || 'Zvedni bednu');
      para(box, act.intro || '', 'question');

      const wrap = document.createElement('div');
      wrap.className = 'pack-wrap';
      box.appendChild(wrap);
      const svg = el('svg', { viewBox: '0 0 420 300', class: 'pack-svg lift-svg' }, wrap);
      el('rect', { x: 0, y: 0, width: 420, height: 300, fill: 'rgba(0,0,0,0.25)', rx: 8 }, svg);
      el('line', { x1: 0, y1: 286, x2: 420, y2: 286, stroke: '#5a4a30', 'stroke-width': 2 }, svg);
      const figure = el('g', {}, svg);
      const caseG = el('g', { class: 'lift-case' }, svg);
      el('rect', { x: -22, y: -18, width: 44, height: 36, rx: 3, fill: '#6a4a2b', stroke: '#2d1f10', 'stroke-width': 2 }, caseG);
      el('line', { x1: -22, y1: 0, x2: 22, y2: 0, stroke: '#2d1f10', 'stroke-width': 1.5 }, caseG);
      el('text', { x: 0, y: 30, 'text-anchor': 'middle', 'font-size': 10, fill: '#d8cfae' }, caseG, `${act.loadKg} kg`);
      const arm = el('line', { stroke: '#c9b08a', 'stroke-width': 7, 'stroke-linecap': 'round' }, svg);
      const marks = el('g', { 'pointer-events': 'none' }, svg);
      const hip = el('circle', { r: 6, fill: '#ffd28a', stroke: '#1a1a16' }, marks);
      const arc = el('path', { fill: 'none', stroke: '#ffd28a', 'stroke-width': 3, 'stroke-linecap': 'round' }, marks);
      const dimLine = el('line', { stroke: '#e8e0c4', 'stroke-width': 1, 'stroke-dasharray': '3 3' }, marks);
      const dimText = el('text', { 'font-size': 10, fill: '#e8e0c4', 'text-anchor': 'middle' }, marks);

      const side = document.createElement('div');
      side.className = 'lift-side';
      wrap.appendChild(side);
      para(side, act.postureLabel || 'Jak bednu zvedáš?', 'muted');
      const pbtns = {};
      for (const p of act.postures) {
        pbtns[p.id] = button(side, p.name, 'btn lift-posture', () => {
          if (done) return;
          posture = p;
          rk = Math.max(p.rMin, Math.min(p.rMax, rk));
          sound.sfx('step');
          render();
        });
      }
      para(side, act.dragHint || 'Bednu táhni myší nebo prstem blíž k tělu a dál (nebo šipkami).', 'muted small');

      const readout = document.createElement('div');
      readout.className = 'pack-readout';
      box.appendChild(readout);
      const status = para(box, '', 'feedback');
      const actions = document.createElement('div');
      actions.className = 'squat-buttons';
      box.appendChild(actions);
      const lift = button(actions, act.liftLabel || 'Zvednout', 'btn primary', () => tryLift());

      const compute = () => {
        const mt = act.trunkKg * g * (posture.trunkArmCm / 100);
        const ml = act.loadKg * g * (rk / 100);
        const m = mt + ml;
        return { mt, ml, m, f: m / (act.muscleArmCm / 100) };
      };

      function render() {
        const p = posture;
        // postava z boku (čelem doprava): kotník, koleno, bedra (L5), rameno, hlava
        figure.innerHTML = '';
        const pts = p.figure;   // body postavy v nákresu: kotník, koleno, bedra, rameno, hlava
        const P = (i) => [pts[i][0], pts[i][1]];
        const line = (a, b, w, c) => el('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: c, 'stroke-width': w, 'stroke-linecap': 'round' }, figure);
        line(P(0), P(1), 12, '#454c32');
        line(P(1), P(2), 13, '#454c32');
        line(P(2), P(3), 18, '#4f5638');
        el('circle', { cx: pts[4][0], cy: pts[4][1], r: 13, fill: '#6b6650' }, figure);
        el('path', { d: `M${pts[0][0] - 6},286 L${pts[0][0] + 26},286 L${pts[0][0] + 26},280 L${pts[0][0] - 4},278 Z`, fill: '#1c1915' }, figure);
        // bedna před tělem ve výšce rukou
        const cx = pts[2][0] + rk * K;
        const cy = p.handY;
        caseG.setAttribute('transform', `translate(${cx} ${cy})`);
        arm.setAttribute('x1', pts[3][0]); arm.setAttribute('y1', pts[3][1]);
        arm.setAttribute('x2', cx - 16); arm.setAttribute('y2', cy - 10);
        hip.setAttribute('cx', pts[2][0]); hip.setAttribute('cy', pts[2][1]);
        // vodorovná kóta od beder k bedně
        dimLine.setAttribute('x1', pts[2][0]); dimLine.setAttribute('x2', cx);
        dimLine.setAttribute('y1', cy + 30); dimLine.setAttribute('y2', cy + 30);
        dimText.setAttribute('x', (pts[2][0] + cx) / 2); dimText.setAttribute('y', cy + 42);
        dimText.textContent = `${fmt(rk)} cm`;
        const r = compute();
        // oblouk u beder: čím větší moment, tím delší
        const ang = Math.min(300, r.m / 250 * 300) * Math.PI / 180;
        const R = 18;
        const a0 = -Math.PI / 2;
        arc.setAttribute('d', `M${pts[2][0] + R * Math.cos(a0)},${pts[2][1] + R * Math.sin(a0)} A${R},${R} 0 ${ang > Math.PI ? 1 : 0} 1 ${pts[2][0] + R * Math.cos(a0 + ang)},${pts[2][1] + R * Math.sin(a0 + ang)}`);
        arc.setAttribute('stroke', r.m <= act.goalMax ? '#9fbf7a' : '#e0805f');
        for (const [id, b] of Object.entries(pbtns)) b.classList.toggle('selected', id === p.id);
        readout.innerHTML = '';
        const rows = [
          ['Moment trupu v bedrech', `${fmt(r.mt)} N·m`],
          [`Moment bedny (${act.loadKg} kg)`, `${fmt(r.ml)} N·m`],
          ['Celkový moment v bedrech', `${fmt(r.m)} N·m`],
          [`Síla zádových svalů (rameno ${act.muscleArmCm} cm)`, `${fmt(r.f)} N ≈ ${fmt(r.f / g)} kg`],
        ];
        for (const [k, v] of rows) {
          const d = document.createElement('div');
          const a = document.createElement('span'); a.textContent = k;
          const b = document.createElement('strong'); b.textContent = v;
          d.append(a, b);
          readout.appendChild(d);
        }
        lift.disabled = done;
      }

      function tryLift() {
        const r = compute();
        if (r.m <= act.goalMax) {
          done = true;
          sound.sfx('unlock');
          status.textContent = act.success || 'Zvednuto.';
          status.className = 'feedback good';
          lift.remove();
          button(actions, 'Pokračovat ›', 'btn activity-next', () => finishActivity(act, {
            zvedani_m: Math.round(r.m), zvedani_f: Math.round(r.f),
          }));
        } else {
          sound.sfx('wrong');
          status.textContent = posture.id === act.postures[0].id ? (act.badPosture || 'Takhle to záda neudrží.') : (act.tooFar || 'Bedna je moc daleko od těla.');
          status.className = 'feedback bad';
        }
        render();
      }

      // tažení bedny (vodorovně)
      let dragging = false;
      const toR = (e) => {
        const b = svg.getBoundingClientRect();
        const x = ((e.clientX - b.left) / b.width) * 420;
        const r = (x - posture.figure[2][0]) / K;
        return Math.max(posture.rMin, Math.min(posture.rMax, Math.round(r)));
      };
      svg.addEventListener('pointerdown', (e) => {
        if (done || !e.target.closest('.lift-case')) return;
        e.preventDefault();
        dragging = true;
        svg.setPointerCapture(e.pointerId);
      });
      svg.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        rk = toR(e);
        render();
      });
      const up = () => { dragging = false; };
      svg.addEventListener('pointerup', up);
      svg.addEventListener('pointercancel', up);
      svg.tabIndex = 0;
      svg.addEventListener('keydown', (e) => {
        if (done) return;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          rk = Math.max(posture.rMin, Math.min(posture.rMax, rk + (e.key === 'ArrowLeft' ? -1 : 1)));
          render();
        }
      });
      render();
    });
  }

  /* Postoj a opěrná plocha (pohled shora). Hráč projde „rounds“ – kola s daným směrem nárazu.
     Mezi koly mění rozkročení, výpad (kladný = levá noha vpřed, záporný = pravá) a může pokrčit
     kolena: nižší těžiště → stejný náraz posune průmět těžiště jen o „crouchFactor“ násobek.
     Opěrná plocha = konvexní obal obou chodidel; voják ustojí, když průmět těžiště zůstane uvnitř.
     Výchozí průmět může být posunutý („comY“ = −6 cm: batoh). Po posledním kole účinky „done“. */
  function openStance(act) {
    const NS = 'http://www.w3.org/2000/svg';
    const el = (name, attrs, parent, text) => {
      const e = document.createElementNS(NS, name);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
      if (text !== undefined) e.textContent = text;
      if (parent) parent.appendChild(e);
      return e;
    };
    const K = 3;                          // px na cm
    const C = { x: 160, y: 165 };         // střed nákresu
    const FL = act.footLength || 26;
    const FW = act.footWidth || 10;
    let width = act.width0 || 16;         // vzdálenost středů chodidel do stran (cm)
    let stagger = 0;                      // výpad: kladný = levá noha vpřed (cm)
    let crouch = false;
    let round = 0;
    let pushed = false;                   // v tomto kole už se strkalo (ukázat šipku posunu)
    let done = false;

    const feet = () => {
      const pts = [];
      for (const [fx, fy] of [[-width / 2, stagger / 2], [width / 2, -stagger / 2]]) {
        for (const [dx, dy] of [[-FW / 2, -FL / 2], [FW / 2, -FL / 2], [FW / 2, FL / 2], [-FW / 2, FL / 2]]) pts.push([fx + dx, fy + dy]);
      }
      return pts;
    };
    const hull = (pts) => {
      const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
      const lower = [];
      for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
      const upper = [];
      for (const q of p.slice().reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
      return lower.slice(0, -1).concat(upper.slice(0, -1));
    };
    const inside = (poly, [x, y]) => poly.every((a, i) => {
      const b = poly[(i + 1) % poly.length];
      return (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]) >= -1e-9;
    });
    const toPx = ([x, y]) => [C.x + x * K, C.y - y * K];
    const base = () => [0, act.comY || 0];
    const target = () => {
      const r = act.rounds[round];
      const n = Math.hypot(r.dir[0], r.dir[1]) || 1;
      const k = r.push * (crouch ? (act.crouchFactor || 0.7) : 1);
      return [base()[0] + (r.dir[0] / n) * k, base()[1] + (r.dir[1] / n) * k];
    };

    openModal((box) => {
      box.classList.add('activity-box', 'pack-box');
      heading(box, act.title || 'Postoj a opěrná plocha');
      para(box, act.intro || '', 'question');
      const wrap = document.createElement('div');
      wrap.className = 'pack-wrap';
      box.appendChild(wrap);
      const svg = el('svg', { viewBox: '0 0 320 330', class: 'pack-svg' }, wrap);
      const defs = el('defs', {}, svg);
      for (const [id, col] of [['st-tip', '#e0805f'], ['st-in', '#e6c67e']]) {
        const mk = el('marker', { id, viewBox: '0 0 10 10', refX: 6, refY: 5, markerWidth: 5, markerHeight: 5, orient: 'auto' }, defs);
        el('path', { d: 'M0,0 L10,5 L0,10 Z', fill: col }, mk);
      }
      el('rect', { x: 0, y: 0, width: 320, height: 330, fill: 'rgba(0,0,0,0.25)', rx: 8 }, svg);
      el('text', { x: 160, y: 16, 'text-anchor': 'middle', 'font-size': 10, fill: '#9a9078' }, svg, 'dopředu ↑   (pohled shora)');
      const hullEl = el('polygon', { fill: 'rgba(159,191,122,0.18)', stroke: '#9fbf7a', 'stroke-width': 1.5, 'stroke-dasharray': '4 3' }, svg);
      const footG = el('g', {}, svg);
      const force = el('line', { stroke: '#e6c67e', 'stroke-width': 5, 'marker-end': 'url(#st-in)', opacity: 0.85 }, svg);
      const forceText = el('text', { 'font-size': 10, fill: '#e6c67e', 'text-anchor': 'middle' }, svg, 'náraz');
      const arrow = el('line', { stroke: '#e0805f', 'stroke-width': 3, 'marker-end': 'url(#st-tip)' }, svg);
      const com0 = el('circle', { r: 5, fill: 'none', stroke: '#efe8d0', 'stroke-width': 1.5 }, svg);
      const com = el('circle', { r: 6, fill: '#ffd28a', stroke: '#1a1a16' }, svg);
      el('text', { x: 160, y: 322, 'text-anchor': 'middle', 'font-size': 9.5, fill: '#9a9078' }, svg, act.comLabel || '● průmět těžiště   ○ bez nárazu');

      const side = document.createElement('div');
      side.className = 'lift-side';
      wrap.appendChild(side);
      const roundEl = para(side, '', 'lean-step');
      const sliders = [];
      const slider = (min, max, get, set, label) => {
        const l = document.createElement('label');
        l.className = 'stance-slider';
        const t = document.createElement('span');
        const r = document.createElement('input');
        r.type = 'range'; r.min = min; r.max = max; r.step = 1; r.value = get();
        const upd = () => { t.textContent = label(get()); };
        r.addEventListener('input', () => { if (done) return; set(Number(r.value)); pushed = false; upd(); render(); });
        upd();
        l.append(t, r);
        side.appendChild(l);
        sliders.push(upd);
      };
      slider(act.widthMin || 10, act.widthMax || 45, () => width, (v) => { width = v; }, (v) => `Rozkročení do stran: ${v} cm`);
      const sm = act.staggerMax || 40;
      slider(-sm, sm, () => stagger, (v) => { stagger = v; },
        (v) => (v === 0 ? 'Výpad: chodidla vedle sebe' : `Výpad: ${v > 0 ? 'levá' : 'pravá'} noha vpřed o ${Math.abs(v)} cm`));
      const crouchBtn = button(side, act.crouchLabel || 'Pokrčit kolena (nižší těžiště)', 'btn lift-posture', () => {
        if (done) return;
        crouch = !crouch;
        pushed = false;
        sound.sfx('step');
        render();
      });
      const pushBtn = button(side, act.pushLabel || 'Strč!', 'btn primary', () => push());
      const list = document.createElement('ul');
      list.className = 'stance-results';
      side.appendChild(list);
      const status = para(box, '', 'feedback');
      const actions = document.createElement('div');
      actions.className = 'squat-buttons';
      box.appendChild(actions);

      function render() {
        const r = act.rounds[Math.min(round, act.rounds.length - 1)];
        roundEl.textContent = done ? (act.allDone || 'Všechna kola zvládnutá.') : `Kolo ${round + 1}/${act.rounds.length}: ${r.name}`;
        const poly = hull(feet());
        hullEl.setAttribute('points', poly.map((p) => toPx(p).join(',')).join(' '));
        footG.innerHTML = '';
        for (const [fx, fy] of [[-width / 2, stagger / 2], [width / 2, -stagger / 2]]) {
          const [x, y] = toPx([fx, fy]);
          el('rect', { x: x - (FW / 2) * K, y: y - (FL / 2) * K, width: FW * K, height: FL * K, rx: 12, fill: crouch ? '#36302a' : '#2a2620', stroke: '#8a7e62', 'stroke-width': 1.5 }, footG);
          el('ellipse', { cx: x, cy: y - (FL / 2 - 4) * K, rx: (FW / 2 - 1) * K, ry: 3 * K, fill: '#3a352c' }, footG);
        }
        // šipka nárazu: přichází zvenku ve směru „dir“ k vojákovi
        const n = Math.hypot(r.dir[0], r.dir[1]) || 1;
        const ux = r.dir[0] / n, uy = r.dir[1] / n;
        const [bx, by] = toPx(base());
        const f1 = [bx - ux * 140, by + uy * 140];
        const f2 = [bx - ux * 62, by + uy * 62];
        force.setAttribute('x1', f1[0]); force.setAttribute('y1', f1[1]);
        force.setAttribute('x2', f2[0]); force.setAttribute('y2', f2[1]);
        forceText.setAttribute('x', f1[0]); forceText.setAttribute('y', f1[1] - 6);
        force.setAttribute('visibility', done ? 'hidden' : 'visible');
        forceText.setAttribute('visibility', done ? 'hidden' : 'visible');
        com0.setAttribute('cx', bx); com0.setAttribute('cy', by);
        let p = base();
        if (pushed && !done) {
          p = target();
          const [ax, ay] = toPx(p);
          arrow.setAttribute('x1', bx); arrow.setAttribute('y1', by);
          arrow.setAttribute('x2', ax); arrow.setAttribute('y2', ay);
          arrow.setAttribute('visibility', 'visible');
        } else {
          arrow.setAttribute('visibility', 'hidden');
        }
        const [cx, cy] = toPx(p);
        com.setAttribute('cx', cx); com.setAttribute('cy', cy);
        com.setAttribute('fill', pushed && !inside(poly, p) ? '#e0805f' : '#ffd28a');
        crouchBtn.classList.toggle('selected', crouch);
        crouchBtn.textContent = crouch ? (act.crouchOn || 'Kolena pokrčená ✓') : (act.crouchLabel || 'Pokrčit kolena (nižší těžiště)');
        pushBtn.disabled = done;
        list.innerHTML = '';
        act.rounds.forEach((q, i) => {
          const li = document.createElement('li');
          li.textContent = `${q.name}: ${i < round || done ? 'ustál ✓' : i === round ? 'teď' : '–'}`;
          if (i < round || done) li.className = 'ok';
          list.appendChild(li);
        });
      }

      function push() {
        if (done) return;
        const r = act.rounds[round];
        pushed = true;
        const ok = inside(hull(feet()), target());
        render();
        if (!ok) {
          sound.sfx('wrong');
          // rada: kolo může mít zvláštní text pro případ, kdy by pomohl podřep
          let tip = r.failText || 'Spadl.';
          if (!crouch && r.crouchHint) {
            crouch = true;
            const would = inside(hull(feet()), target());
            crouch = false;
            if (would) tip = r.crouchHint;
          }
          status.textContent = tip;
          status.className = 'feedback bad';
          return;
        }
        sound.sfx('step');
        status.textContent = r.okText || 'Ustál.';
        status.className = 'feedback good';
        round += 1;
        if (round >= act.rounds.length) {
          done = true;
          sound.sfx('unlock');
          status.textContent = act.success || 'Ustál všechno.';
          render();
          button(actions, 'Pokračovat ›', 'btn activity-next', () => finishActivity(act, {}));
          return;
        }
        // další kolo: krátce nechat vidět, že ustál, pak ukázat nový náraz
        setTimeout(() => { pushed = false; render(); }, 1100);
      }
      render();
    });
  }

  /* Výskok z podřepu (SJ): s kamerou měří dobu letu js/skok.js (až 3 pokusy, platí nejlepší);
     bez kamery hráč zadá dosah ve stoje a ve výskoku (test „jump and reach“) a hra z rozdílu
     dopočítá dobu letu; kdo skákat nemůže, počítá s hodnotou „defaultT“. Výšku hra neukazuje –
     tu má hráč spočítat sám. Proměnné: tl (doba letu v s), skok_kamera, skok_dosah, skok_preskoceno. */
  function openJump(act) {
    const fmt = (v, d) => v.toFixed(d).replace('.', ',');
    openModal((box) => {
      box.classList.add('activity-box', 'squat-box');
      heading(box, act.title || 'Výskok z podřepu');
      para(box, act.intro || '', 'question');
      const choice = document.createElement('div');
      choice.className = 'squat-choice';
      box.appendChild(choice);
      if (act.safety) para(choice, act.safety, 'lean-safety');
      para(choice, act.camera || 'S kamerou: postav se bokem ke kameře, celý v záběru i s chodidly.', 'muted');
      para(choice, 'Obraz z kamery se zpracovává jen v tomto prohlížeči – nic se nenahrává ani neukládá.', 'muted small');
      const btns = document.createElement('div');
      btns.className = 'squat-buttons';
      choice.appendChild(btns);

      const instr = para(box, '', 'lean-step');
      instr.hidden = true;
      const stage = document.createElement('div');
      stage.className = 'squat-stage';
      stage.hidden = true;
      const canvas = document.createElement('canvas');
      const counter = document.createElement('div');
      counter.className = 'squat-counter';
      counter.textContent = '–';
      stage.append(canvas, counter);
      box.appendChild(stage);
      const status = para(box, '', 'feedback');
      const results = document.createElement('div');
      box.appendChild(results);
      const setStatus = (text, kind) => {
        status.textContent = text;
        status.className = `feedback${kind === 'ok' ? ' good' : kind === 'bad' ? ' bad' : ''}`;
      };
      const finish = (vars, summary) => {
        sound.sfx('levelUp');
        instr.hidden = true;
        setStatus(summary, 'ok');
        button(box, 'Pokračovat ›', 'btn activity-next', () => finishActivity(act, vars));
      };

      // --- s kamerou: až „attempts“ pokusů, platí nejdelší doba letu ---
      button(btns, 'S kamerou', 'btn primary', async () => {
        choice.hidden = true;
        stage.hidden = false;
        instr.hidden = false;
        instr.textContent = act.steps || 'Stoj → podřep a výdrž → po pípnutí výskok jen nahoru.';
        let cancelled = false;
        activityCleanup = () => { cancelled = true; };
        const times = [];
        const max = act.attempts || 3;
        try {
          const mod = await import('./skok.js?v=0.11');
          let ctrl = null;
          const list = document.createElement('ol');
          list.className = 'reflex-list';
          results.appendChild(list);
          const done = () => {
            ctrl.stop();
            stage.hidden = true;
            const best = Math.max(...times);
            finish({ tl: best, skok_kamera: 1, skok_pokusy: times.length, skok_preskoceno: 0 },
              (act.resultCamera || 'Nejlepší doba letu: {t} s.').replace('{t}', fmt(best, 3)));
          };
          ctrl = await mod.startJump({
            canvas,
            onStatus: setStatus,
            onBeep: (k) => sound.sfx(k === 'go' ? 'reflexGo' : 'squatOk'),
            onAttempt: (r) => {
              if (!r.valid) {
                setStatus(r.reason === 'cm' ? (act.counterText || 'To byl skok s protipohybem – nepočítá se.') : (act.rangeText || 'Tenhle skok se nepodařilo změřit.'), 'bad');
                setTimeout(() => ctrl.begin(), 1800);
                return;
              }
              times.push(r.t);
              const li = document.createElement('li');
              li.textContent = `${fmt(r.t, 3)} s`;
              list.appendChild(li);
              counter.textContent = `${fmt(Math.max(...times), 3)} s`;
              counter.classList.remove('bump'); void counter.offsetWidth; counter.classList.add('bump');
              if (times.length >= max) { done(); return; }
              setStatus(`Pokus ${times.length}: doba letu ${fmt(r.t, 3)} s. Můžeš skočit znovu – platí nejlepší.`, 'ok');
              const again = results.querySelector('.jump-actions') || document.createElement('div');
              again.className = 'squat-buttons jump-actions';
              again.innerHTML = '';
              results.appendChild(again);
              button(again, 'Skočit znovu', 'btn', () => { again.innerHTML = ''; ctrl.begin(); });
              button(again, 'Hotovo', 'btn primary', () => { again.remove(); done(); });
            },
          });
          if (cancelled) { ctrl.stop(); return; }
          activityCleanup = () => ctrl.stop();
          ctrl.begin();
        } catch (e) {
          if (cancelled) return;
          console.error(e);
          stage.hidden = true;
          instr.hidden = true;
          choice.hidden = false;
          const msg = e && e.name === 'NotAllowedError' ? 'Přístup ke kameře byl odmítnut.'
            : e && e.name === 'NotFoundError' ? 'Kamera nebyla nalezena.'
            : 'Kameru se nepodařilo spustit.';
          setStatus(`${msg} Můžeš výšku změřit u stěny (bez kamery).`, 'bad');
        }
      });

      // --- bez kamery: dosah ve stoje a ve výskoku ---
      button(btns, act.reachLabel || 'Bez kamery (dosah na stěně)', 'btn', () => {
        choice.hidden = true;
        setStatus('');
        const form = document.createElement('div');
        form.className = 'squat-manual jump-reach';
        box.insertBefore(form, status);
        para(form, act.reachText || 'Změř dosah ve stoje a dosah ve výskoku (v cm) a zadej je.', 'muted');
        const field = (label) => {
          const l = document.createElement('label');
          l.className = 'jump-field';
          const t = document.createElement('span');
          t.textContent = label;
          const i = document.createElement('input');
          i.type = 'number'; i.inputMode = 'numeric'; i.min = 50; i.max = 400;
          l.append(t, i);
          form.appendChild(l);
          return i;
        };
        const a = field('Dosah ve stoje (cm)');
        const b = field('Dosah ve výskoku (cm)');
        button(form, 'Spočítat', 'btn primary', () => {
          const d = Number(b.value) - Number(a.value);
          if (!Number.isFinite(d) || !a.value || !b.value || d < 5 || d > 90) {
            setStatus(act.reachInvalid || 'Zkontroluj čísla: dosah ve výskoku musí být o 5–90 cm větší než ve stoje.', 'bad');
            return;
          }
          const t = Math.round(Math.sqrt((8 * d / 100) / 9.81) * 1000) / 1000;
          form.remove();
          finish({ tl: t, skok_kamera: 0, skok_dosah: d, skok_preskoceno: 0 },
            (act.resultReach || 'Rozdíl dosahu {d} cm odpovídá době letu {t} s.').replace('{d}', String(d)).replace('{t}', fmt(t, 3)));
        });
      });

      // --- nemohu skákat ---
      button(btns, act.skipLabel || 'Nemohu skákat', 'btn', () => {
        choice.hidden = true;
        const t = act.defaultT || 0.45;
        finish({ tl: t, skok_kamera: 0, skok_preskoceno: 1 }, (act.skipped || 'Počítáš s dobou letu {t} s.').replace('{t}', fmt(t, 2)));
      });
    });
  }

  /* Neonové terče: v každém kole se terče objevují jeden po druhém na náhodném místě, v náhodné
     barvě a velikosti z rozmezí kola, ve vzdálenosti z rozmezí kola od místa posledního zásahu.
     Hráč je trefuje myší nebo prstem. Měří se čas od objevení do zásahu (první terč kola se
     nepočítá – rozcvička) a „obtížnost“ podle Fittse: ID = log₂(D / Š + 1). Proměnné „vars“ kol
     (např. terce_a, terce_b) = průměrné časy v ms; terce_chyby = počet střel vedle. */
  function openTargets(act) {
    const COLORS = act.colors || ['#3fe0ff', '#ff4fd8', '#9dff6a', '#ffe14f', '#b48cff'];
    const fmt = (v, d = 0) => v.toFixed(d).replace('.', ',');
    openModal((box) => {
      box.classList.add('activity-box', 'squat-box', 'targets-box');
      heading(box, act.title || 'Neonové terče');
      para(box, act.intro || '', 'question');
      const info = para(box, '', 'lean-step');
      const arena = document.createElement('div');
      arena.className = 'targets-arena';
      box.appendChild(arena);
      const overlay = document.createElement('div');
      overlay.className = 'targets-overlay';
      arena.appendChild(overlay);
      const status = para(box, '', 'feedback');
      const results = document.createElement('div');
      box.appendChild(results);

      const out = {};
      let misses = 0;
      let roundIdx = 0;
      let current = null;       // { el, x, y, r, t0, D, W }
      let last = null;          // poslední místo zásahu (px v ploše)
      let hits = [];
      let running = false;
      let timer = 0;

      const rnd = (a, b) => a + Math.random() * (b - a);
      const size = () => arena.getBoundingClientRect();

      function showOverlay(title, text, label, onGo) {
        overlay.innerHTML = '';
        overlay.hidden = false;
        const h = document.createElement('h3');
        h.textContent = title;
        overlay.appendChild(h);
        if (text) para(overlay, text);
        button(overlay, label, 'btn primary', onGo);
      }

      function spawn() {
        const rd = act.rounds[roundIdx];
        const rect = size();
        const W = rect.width, H = rect.height;
        const scale = Math.min(W, H);
        // velikost: zlomek kratší strany plochy, ale aspoň minPx (prst na mobilu)
        const r = Math.max((act.minPx || 26) / 2, (rnd(rd.size[0], rd.size[1]) * scale) / 2);
        const from = last || { x: W / 2, y: H / 2 };
        let x = 0, y = 0, D = 0;
        for (let k = 0; k < 40; k++) {
          D = rnd(rd.dist[0], rd.dist[1]) * Math.hypot(W, H) / 1.4;
          const a = Math.random() * Math.PI * 2;
          x = from.x + Math.cos(a) * D;
          y = from.y + Math.sin(a) * D;
          if (x > r + 6 && x < W - r - 6 && y > r + 6 && y < H - r - 6) break;
          if (k === 39) { x = Math.min(W - r - 6, Math.max(r + 6, x)); y = Math.min(H - r - 6, Math.max(r + 6, y)); D = Math.hypot(x - from.x, y - from.y); }
        }
        const el = document.createElement('div');
        el.className = `neon-target appear-${Math.floor(Math.random() * 3)}`;
        const c = COLORS[Math.floor(Math.random() * COLORS.length)];
        el.style.setProperty('--c', c);
        el.style.left = `${x - r}px`;
        el.style.top = `${y - r}px`;
        el.style.width = el.style.height = `${2 * r}px`;
        arena.appendChild(el);
        current = { el, x, y, r, t0: performance.now(), D, W: 2 * r };
      }

      function startRound() {
        overlay.hidden = true;
        const rd = act.rounds[roundIdx];
        hits = [];
        last = null;
        running = true;
        info.textContent = `Kolo ${roundIdx + 1}/${act.rounds.length}: ${rd.name} – terč 0/${rd.count}`;
        let n = 3;
        status.textContent = `${n}…`;
        status.className = 'feedback';
        timer = setInterval(() => {
          n -= 1;
          if (n > 0) { status.textContent = `${n}…`; sound.sfx('key'); return; }
          clearInterval(timer);
          status.textContent = '';
          sound.sfx('reflexGo');
          spawn();
        }, 600);
      }

      function endRound() {
        running = false;
        const rd = act.rounds[roundIdx];
        const used = hits.slice(1);   // první terč kola = rozcvička
        const mt = used.reduce((s2, h) => s2 + h.mt, 0) / used.length;
        const id = used.reduce((s2, h) => s2 + Math.log2(h.D / h.W + 1), 0) / used.length;
        out[rd.var] = Math.round(mt);
        out[`${rd.var}_id`] = Math.round(id * 10) / 10;
        roundIdx += 1;
        if (roundIdx < act.rounds.length) {
          const nx = act.rounds[roundIdx];
          showOverlay(`Kolo ${roundIdx + 1}: ${nx.name}`, `${rd.name}: průměr ${fmt(mt)} ms. ${nx.text || ''}`, 'Start', startRound);
          return;
        }
        finishAll();
      }

      function finishAll() {
        info.textContent = act.doneTitle || 'Výsledky';
        sound.sfx('levelUp');
        results.innerHTML = '';
        const t = document.createElement('table');
        t.className = 'lean-table';
        const row = (cells, tag) => {
          const tr = document.createElement('tr');
          for (const c of cells) { const td = document.createElement(tag); td.textContent = c; tr.appendChild(td); }
          t.appendChild(tr);
        };
        row(['Kolo', 'Průměrný čas', 'Obtížnost (ID)'], 'th');
        for (const rd of act.rounds) row([rd.name, `${out[rd.var]} ms`, `${fmt(out[`${rd.var}_id`], 1)} bitu`], 'td');
        results.appendChild(t);
        para(results, `Střel vedle: ${misses}`, 'muted small');
        // poslední kolo (malé a daleko) by mělo trvat déle než první – jinak jiný text
        const first = out[act.rounds[0].var], lastMt = out[act.rounds[act.rounds.length - 1].var];
        const slower = lastMt > first;
        status.textContent = (slower ? act.success : act.successFlat || act.success) || '';
        status.className = `feedback${slower ? ' good' : ''}`;
        button(results, 'Pokračovat ›', 'btn activity-next', () => finishActivity(act, { ...out, terce_chyby: misses }));
        results.hidden = true;
        status.hidden = true;
        // po dohrání plochu s terči schovat, ať jsou výsledky i tlačítko vidět bez posouvání
        showOverlay(act.doneTitle || 'Hotovo', act.doneText || '', 'Zobrazit výsledky', () => {
          arena.hidden = true;
          results.hidden = false;
          status.hidden = false;
        });
      }

      // zásah / vedle – pointerdown (myš i dotyk, bez zpoždění kliknutí)
      arena.addEventListener('pointerdown', (e) => {
        if (!running || !current || e.target.closest('.targets-overlay')) return;
        e.preventDefault();
        const rect = size();
        const x = e.clientX - rect.left, y = e.clientY - rect.top;
        const hit = Math.hypot(x - current.x, y - current.y) <= current.r;
        if (!hit) {
          misses += 1;
          sound.sfx('squatShallow');
          const m = document.createElement('div');
          m.className = 'target-miss';
          m.style.left = `${x}px`; m.style.top = `${y}px`;
          arena.appendChild(m);
          setTimeout(() => m.remove(), 450);
          return;
        }
        const now = performance.now();
        hits.push({ mt: now - current.t0, D: current.D, W: current.W });
        sound.sfx('beep');
        current.el.classList.add('hit');
        const el = current.el;
        setTimeout(() => el.remove(), 250);
        last = { x, y };
        current = null;
        const rd = act.rounds[roundIdx];
        info.textContent = `Kolo ${roundIdx + 1}/${act.rounds.length}: ${rd.name} – terč ${hits.length}/${rd.count}`;
        if (hits.length >= rd.count) { endRound(); return; }
        spawn();
      });

      activityCleanup = () => { clearInterval(timer); running = false; };
      showOverlay(`Kolo 1: ${act.rounds[0].name}`, act.rounds[0].text || '', 'Start', startRound);
    });
  }

  /* Zkouška stability: předklon ke špičkám volně a patami u zdi. S kamerou měří js/predklon.js
     (pánev dozadu, ruce nad zemí, krok); bez kamery hráč jen odpoví, jak pokus dopadl. */
  function openLean(act) {
    // bez kamery: smazat čísla z případného dřívějšího měření kamerou (závěrečná obrazovka je ukazuje)
    const NO_CAMERA = { kamera: 0, preskoceno: 0, volne_panev: null, volne_ruce: null, zed_panev: null, zed_ruce: null };
    openModal((box) => {
      box.classList.add('activity-box', 'squat-box');
      heading(box, act.title || 'Zkouška stability');
      para(box, act.intro || 'Předkloň se a sáhni na špičky – jednou volně, jednou patami u zdi.', 'question');

      const choice = document.createElement('div');
      choice.className = 'squat-choice';
      box.appendChild(choice);
      if (act.safety) para(choice, act.safety, 'lean-safety');
      para(choice, act.camera || 'S kamerou: postav se 2–3 m od notebooku BOKEM ke kameře, celý v záběru (i chodidla).', 'muted');
      para(choice, 'Obraz z kamery se zpracovává jen v tomto prohlížeči – nic se nenahrává ani neukládá.', 'muted small');
      const btns = document.createElement('div');
      btns.className = 'squat-buttons';
      choice.appendChild(btns);

      const instr = para(box, '', 'lean-step');
      instr.hidden = true;
      const stage = document.createElement('div');
      stage.className = 'squat-stage';
      stage.hidden = true;
      const canvas = document.createElement('canvas');
      stage.appendChild(canvas);
      box.appendChild(stage);
      const status = para(box, '', 'feedback');
      const results = document.createElement('div');
      box.appendChild(results);

      const setStatus = (text, kind) => {
        status.textContent = text;
        status.className = `feedback${kind === 'ok' ? ' good' : kind === 'bad' ? ' bad' : ''}`;
      };
      const showStep = (text) => {
        instr.hidden = false;
        instr.textContent = text;
      };

      // srovnání obou pokusů (s kamerou)
      const table = (free, wall) => {
        const t = document.createElement('table');
        t.className = 'lean-table';
        const row = (cells, tag) => {
          const tr = document.createElement('tr');
          for (const c of cells) {
            const td = document.createElement(tag);
            td.textContent = c;
            tr.appendChild(td);
          }
          t.appendChild(tr);
        };
        const reach = (r) => (r.ruce === null ? '–' : `${r.ruce} cm${r.dosah ? ' (dosáhl)' : ''}`);
        row(['', 'Pánev dozadu', 'Ruce nad zemí', 'Krok'], 'th');
        row(['Volně', `${free.panev} cm`, reach(free), free.krok ? 'ano' : 'ne'], 'td');
        if (wall) row(['U zdi', `${wall.panev} cm`, reach(wall), wall.krok ? 'ano' : 'ne'], 'td');
        results.innerHTML = '';
        results.appendChild(t);
      };

      const done = (vars, summary) => {
        sound.sfx('levelUp');
        instr.hidden = true;
        setStatus(summary, 'ok');
        button(box, 'Pokračovat ›', 'btn activity-next', () => finishActivity(act, { ...vars, stabilita: 1 }));
      };

      // --- s kamerou: dva pokusy za sebou, kamera běží celou dobu ---
      button(btns, 'S kamerou', 'btn primary', async () => {
        choice.hidden = true;
        stage.hidden = false;
        let cancelled = false;
        activityCleanup = () => { cancelled = true; };
        let free = null;
        try {
          const mod = await import('./predklon.js?v=0.11');
          const ctrl = await mod.startLean({
            canvas,
            onStatus: setStatus,
            onAttempt: (r) => {
              sound.sfx('squatOk');
              if (!free) {
                free = r;
                table(free, null);
                setStatus(r.kolena ? 'Pokus 1 změřen.' : 'Pokus 1 změřen – kolena ale byla pokrčená. Můžeš ho zopakovat.', r.kolena ? 'ok' : 'bad');
                const again = button(results, 'Zopakovat pokus 1', 'btn', () => { free = null; results.innerHTML = ''; showStep(act.free); ctrl.begin(); });
                const next = button(results, 'Pokus 2: u zdi ›', 'btn primary', () => { again.remove(); next.remove(); showStep(act.wall); ctrl.begin(); });
                return;
              }
              ctrl.stop();
              stage.hidden = true;
              table(free, r);
              done({
                kamera: 1, preskoceno: 0,
                volne_panev: free.panev, volne_ruce: free.ruce, volne_dosah: free.dosah,
                zed_panev: r.panev, zed_ruce: r.ruce, zed_dosah: r.dosah, zed_krok: r.krok,
              }, act.result || 'Volně pánev ustoupila dozadu a tělo udrželo těžiště nad chodidly. U zdi to nešlo.');
            },
          });
          if (cancelled) { ctrl.stop(); return; }
          activityCleanup = () => ctrl.stop();
          showStep(act.free || 'POKUS 1 – VOLNĚ: předkloň se a sáhni ke špičkám, pak se narovnej.');
          ctrl.begin();
        } catch (e) {
          if (cancelled) return;
          console.error(e);
          stage.hidden = true;
          choice.hidden = false;
          const msg = e && e.name === 'NotAllowedError' ? 'Přístup ke kameře byl odmítnut.'
            : e && e.name === 'NotFoundError' ? 'Kamera nebyla nalezena.'
            : 'Kameru se nepodařilo spustit.';
          setStatus(`${msg} Můžeš pokus udělat bez kamery.`, 'bad');
        }
      });

      // --- bez kamery: hráč pokus udělá a odpoví, jak dopadl ---
      button(btns, 'Bez kamery', 'btn', () => {
        choice.hidden = true;
        setStatus('');
        const manual = document.createElement('div');
        manual.className = 'squat-manual';
        box.insertBefore(manual, status);
        showStep(act.free || 'POKUS 1 – VOLNĚ: předkloň se a sáhni ke špičkám, pak se narovnej.');
        para(manual, 'Dosáhl jsi prsty ke špičkám?', 'muted');
        const answer = (freeReach) => {
          manual.innerHTML = '';
          showStep(act.wall || 'POKUS 2 – U ZDI: paty a hýždě ke zdi, kolena natažená. Zkus totéž.');
          para(manual, 'Jak dopadl pokus u zdi?', 'muted');
          const end = (wallReach, step) => {
            manual.remove();
            done({ ...NO_CAMERA, volne_dosah: freeReach, zed_dosah: wallReach, zed_krok: step },
              wallReach ? (act.resultWallReach || 'Opravdu? Zkontroluj, že paty i hýždě byly u zdi a kolena natažená – skoro nikdo to tak nedokáže.')
                : (act.result || 'Volně pánev ustoupila dozadu a tělo udrželo těžiště nad chodidly. U zdi to nešlo.'));
          };
          button(manual, 'Dosáhl', 'btn', () => end(1, 0));
          button(manual, 'Nedosáhl', 'btn', () => end(0, 0));
          button(manual, 'Musel jsem udělat krok', 'btn', () => end(0, 1));
        };
        button(manual, 'Ano', 'btn', () => answer(1));
        button(manual, 'Ne', 'btn', () => answer(0));
      });

      // --- přeskočit (zdravotní důvody) ---
      button(btns, 'Přeskočit pokus', 'btn', () => {
        choice.hidden = true;
        done({ ...NO_CAMERA, preskoceno: 1 }, act.skipped || 'Pokus přeskočen. Princip najdeš v příručce a ve výsledku zkoušky na plakátu.');
      });
    });
  }

  function openNotes() {
    openModal((box) => {
      heading(box, 'Zápisník');
      if (!game.state.notes.length) {
        const p = document.createElement('p');
        p.className = 'notes-empty';
        p.textContent = 'Zatím nic. Sem se zapisuje vše důležité, co najdeš nebo změříš.';
        box.appendChild(p);
        return;
      }
      const ul = document.createElement('ul');
      ul.className = 'notes';
      for (const note of game.state.notes) {
        const li = document.createElement('li');
        li.textContent = note;
        ul.appendChild(li);
      }
      box.appendChild(ul);
    });
  }

  function openMenu() {
    openModal((box) => {
      heading(box, 'Menu');
      const menu = document.createElement('div');
      menu.className = 'modal-menu';
      const add = (label, fn, cls) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        if (cls) b.className = cls;
        b.addEventListener('click', fn);
        menu.appendChild(b);
        return b;
      };
      add('Zpět do hry', closeModal);
      add('Jak ovládat hru', () => { closeModal(); showHudHelp(); });
      const scene = $('scene');
      add(scene.classList.contains('show-hotspots') ? 'Skrýt vyznačení objektů' : 'Vyznačit objekty v místnosti', () => {
        scene.classList.toggle('show-hotspots');
        closeModal();
      });
      const scaresLabel = () => `Lekačky: ${scaresOn() ? 'zapnuté' : 'vypnuté'}`;
      const scareBtn = add(scaresLabel(), () => {
        Game.setSetting('scares', !scaresOn());
        scareBtn.textContent = scaresLabel();
      });
      add('Hlavní nabídka', () => { closeModal(); game.save(); showTitle(); });
      const reset = add('Začít znovu (smaže postup)', () => {
        if (reset.dataset.confirm) {
          Game.clearSave();
          closeModal();
          showTitle();
        } else {
          reset.dataset.confirm = '1';
          reset.textContent = 'Opravdu smazat postup? Klikni znovu.';
        }
      }, 'danger');
      box.appendChild(menu);
    });
  }

  /* Zámek brány: číselný kód nebo výběr odpovědi, s nápovědami. */
  let lockInput = '';

  /* Zámek brány (lockId = null) nebo malý zámek místnosti („locks“ v game.json). */
  function openLock(lockId) {
    game.selectLock(lockId);
    const step = game.gateStep();
    if (!step) return;
    lockInput = '';
    openModal((box) => buildLock(box, step));
  }

  function buildLock(box, step, previousSuccess) {
    heading(box, game.lockDef().title || 'Zámek');
    if (!game.isGateLock()) box.classList.add('small-lock');
    const lock = document.createElement('div');
    lock.className = 'lock';

    if (previousSuccess) {
      const prev = document.createElement('p');
      prev.className = 'feedback good';
      prev.style.margin = '0 0 12px';
      prev.style.textAlign = 'left';
      prev.textContent = previousSuccess;
      lock.appendChild(prev);
    }

    const q = document.createElement('p');
    q.className = 'question';
    q.textContent = game.fill(step.question);
    lock.appendChild(q);
    const missing = game.gateMissing();
    if (missing) {
      // kroku chybí naměřené hodnoty (např. ještě nebyly dřepy) – poradit, co udělat dřív
      const warn = document.createElement('p');
      warn.className = 'feedback bad';
      warn.style.margin = '0 0 12px';
      warn.textContent = missing;
      lock.appendChild(warn);
    }

    const feedback = document.createElement('p');
    feedback.className = 'feedback';
    feedback.id = 'lock-feedback';

    if (step.type === 'code') {
      const display = document.createElement('div');
      display.className = 'lock-display';
      display.id = 'lock-display';
      lock.appendChild(display);

      const pad = document.createElement('div');
      pad.className = 'keypad';
      const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', '⌫'];
      for (const k of keys) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'key';
        b.textContent = k;
        b.setAttribute('aria-label', k === '⌫' ? 'Smazat' : k);
        b.addEventListener('click', () => lockKey(k));
        pad.appendChild(b);
      }
      const ok = document.createElement('button');
      ok.type = 'button';
      ok.className = 'key ok wide';
      ok.style.gridColumn = '1 / -1';
      ok.textContent = 'Otevřít';
      ok.addEventListener('click', submitCode);
      pad.appendChild(ok);
      lock.appendChild(pad);

      // Kalkulačka z inventáře: otevřít ji a výsledek přenést do zámku jedním tlačítkem.
      if (game.state.inventory.some((id) => game.item(id).calculator)) {
        calc.setLockTarget((value) => {
          lockInput = value.replace(/\s/g, '').slice(0, 12);
          updateLockDisplay();
          sound.sfx('key');
        });
        const cb = document.createElement('button');
        cb.type = 'button';
        cb.className = 'btn calc-open';
        cb.textContent = 'Kalkulačka';
        cb.addEventListener('click', () => calc.open());
        lock.appendChild(cb);
      }
    } else if (step.type === 'choice') {
      const list = document.createElement('div');
      list.className = 'choices';
      step.options.forEach((opt, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'choice';
        b.textContent = opt;
        b.addEventListener('click', () => submitAnswer(i));
        list.appendChild(b);
      });
      lock.appendChild(list);
    }

    lock.appendChild(feedback);
    lock.appendChild(buildHints(step));
    box.appendChild(lock);
    updateLockDisplay();
  }

  function buildHints(step) {
    const wrap = document.createElement('div');
    wrap.className = 'hints';
    const ol = document.createElement('ol');
    for (const h of game.shownHints()) {
      const li = document.createElement('li');
      li.textContent = h;
      ol.appendChild(li);
    }
    wrap.appendChild(ol);
    const total = (step.hints || []).length;
    if (total) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn';
      const refresh = () => {
        const shown = game.shownHints().length;
        // bez naměřených hodnot by další nápovědy byly prázdné (–) – dát jen první
        const waiting = shown >= 1 && shown < total && game.gateMissing();
        btn.textContent = shown >= total ? 'Žádná další nápověda'
          : waiting ? 'Další nápověda až po měření' : `Nápověda (${shown + 1}/${total})`;
        btn.disabled = shown >= total || Boolean(waiting);
      };
      btn.addEventListener('click', () => {
        const hint = game.takeHint();
        if (hint) {
          sound.sfx('hint');
          const li = document.createElement('li');
          li.textContent = hint;
          ol.appendChild(li);
        }
        refresh();
      });
      refresh();
      wrap.appendChild(btn);
    }
    return wrap;
  }

  function lockKey(k) {
    sound.sfx('key');
    if (k === '⌫') lockInput = lockInput.slice(0, -1);
    else if (k === ',') { if (!lockInput.includes(',')) lockInput += lockInput ? ',' : '0,'; }
    else if (lockInput.length < 8) lockInput += k;
    updateLockDisplay();
  }

  function updateLockDisplay() {
    const display = $('lock-display');
    if (!display) return;
    const step = game.gateStep();
    display.innerHTML = '';
    const digits = document.createElement('span');
    digits.textContent = lockInput;
    const caret = document.createElement('span');
    caret.className = 'caret';
    display.append(digits, caret);
    if (step && step.unit) {
      const unit = document.createElement('span');
      unit.className = 'unit';
      unit.textContent = step.unit;
      display.appendChild(unit);
    }
  }

  function submitCode() {
    if (!lockInput) return;
    submitAnswer(lockInput);
  }

  function submitAnswer(answer) {
    const result = game.answerGate(answer);
    const fb = $('lock-feedback');
    if (!fb) return;
    fb.textContent = result.message;
    fb.className = `feedback ${result.ok ? 'good' : 'bad'}`;
    if (!result.ok) {
      if (!result.invalid) sound.sfx('wrong');
      const target = $('lock-display') || $('modal-box').querySelector('.choices');
      if (target) {
        target.classList.remove('shake');
        void target.offsetWidth;
        target.classList.add('shake');
      }
      if (!result.invalid) lockInput = '';
      updateLockDisplay();
      return;
    }
    // Správně: další krok zámku, nebo otevření brány.
    sound.sfx('unlock');
    const box = $('modal-box');
    box.querySelectorAll('button').forEach((b) => { if (!b.classList.contains('modal-close')) b.disabled = true; });
    setTimeout(() => {
      if (result.opened) {
        closeModal();
        sound.sfx(result.gate ? 'door' : 'unlockDrawer');
        handleEvents(result.events || []);
      } else {
        lockInput = '';
        openModal((b) => buildLock(b, game.gateStep(), result.message));
      }
    }, 1300);
  }

  /* ====================================================================
   * Drobnosti: klávesnice, oznámení
   * ==================================================================== */

  function onKeyDown(e) {
    if (introDone && !$('intro').hidden) {
      if (['Escape', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        introDone();
      }
      return;
    }
    const modalOpen = !$('modal').hidden;
    // reflex test: mezerník (bez automatického opakování při držení klávesy)
    if (modalOpen && reflexHit && (e.key === ' ' || e.code === 'Space')) {
      e.preventDefault();
      if (!e.repeat) reflexHit();
      return;
    }
    if (modalOpen && $('lock-display')) {
      if (/^[0-9]$/.test(e.key)) { lockKey(e.key); e.preventDefault(); return; }
      if (e.key === ',' || e.key === '.') { lockKey(','); e.preventDefault(); return; }
      if (e.key === 'Backspace') { lockKey('⌫'); e.preventDefault(); return; }
      if (e.key === 'Enter') { submitCode(); e.preventDefault(); return; }
    }
    // Listování v knize šipkami.
    if (modalOpen && bookNav) {
      if (e.key === 'ArrowRight') { bookNav.next(); e.preventDefault(); return; }
      if (e.key === 'ArrowLeft') { bookNav.prev(); e.preventDefault(); return; }
    }
    // Otáčení v místnosti šipkami (← → otočení, ↓ zpět ze zvětšeného pohledu).
    if (!modalOpen && !$('room').hidden && !e.target.matches('input, textarea')) {
      const dir = { ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'back' }[e.key];
      if (dir) {
        e.preventDefault();
        turn(dir);
        return;
      }
    }
    if (e.key === 'Escape') {
      if (modalOpen) closeModal();
      else if (selectedItem) selectItem(null);
      else if (calc.isOpen) calc.close();
    }
  }

  let toastTimer = 0;
  function toast(text) {
    const el = $('toast');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
  }

  function pulse(el) {
    el.classList.remove('pulse');
    void el.offsetWidth;
    el.classList.add('pulse');
  }

  init();
})();
