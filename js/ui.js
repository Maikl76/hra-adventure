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

  /* Tvary otvorů bran v jednotkách: výška otvoru 640, střed v 0,0. */
  const GATE_SHAPES = [
    'M-180,320 L-180,-140 A180,180 0 0 1 180,-140 L180,320 Z',              // půlkruhový oblouk
    'M-170,320 L-170,-120 Q-170,-250 0,-320 Q170,-250 170,-120 L170,320 Z', // lomený oblouk
    'M-160,320 L-160,-300 L160,-300 L160,320 Z',                            // pravoúhlé dveře
    'M-140,320 L-140,-180 A140,140 0 0 1 140,-180 L140,320 Z',              // úzký oblouk
  ];
  const WALL = 'M-4000,-4000 H4000 V4000 H-4000 Z ';
  const STONE_JOINTS = 'M-700,-200 H-260 M260,-200 H700 M-900,40 H-240 M240,40 H900 M-650,250 H-230 M230,250 H650';

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

    const gates = [];
    for (let i = 0; i < count; i++) {
      const shape = GATE_SHAPES[i % GATE_SHAPES.length];
      gates.push({
        z: i + 1,
        ox: Math.sin(i * 1.7) * 70,
        oy: Math.cos(i * 1.3) * 22,
        opening: new Path2D(shape),
        wall: new Path2D(WALL + shape),
        joints: new Path2D(STONE_JOINTS),
        numeral: ROMAN[i] || '',
        top: i % GATE_SHAPES.length === 2 ? -300 : -320,  // horní okraj otvoru (pro římské číslo)
      });
    }

    const smooth = (x) => x * x * (3 - 2 * x);
    const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
    const start = performance.now();
    let currentLine = -1;
    let lightPlayed = false;

    function size() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
    }
    size();
    window.addEventListener('resize', size);

    function frame(now) {
      const t = (now - start) / 1000;
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

      // Brány od nejvzdálenější po nejbližší.
      for (let i = gates.length - 1; i >= 0; i--) {
        const g = gates[i];
        const dz = g.z - camZ;
        if (!g.passed && dz < 0.6) {
          g.passed = true;           // svist ve chvíli, kdy brána míjí kameru
          sound.sfx('pass');
        }
        if (dz < 0.22) continue;
        const s = focal / dz;
        const fog = clamp(1.45 - dz * 0.36, 0, 1);
        const passing = s > 1.15 ? clamp(1 - (s - 1.15) / 0.9, 0, 1) : 1;
        const alpha = fog * passing;
        if (alpha < 0.01) continue;
        const scale = s * u;
        ctx.setTransform(scale, 0, 0, scale, W / 2 + (g.ox - camX) * scale, H / 2 + (g.oy - camY) * scale);

        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#0d0a07';
        ctx.fill(g.wall, 'evenodd');
        ctx.strokeStyle = '#1c150d';
        ctx.lineWidth = 6;
        ctx.stroke(g.joints);
        ctx.strokeStyle = '#2a2014';
        ctx.lineWidth = 26;
        ctx.stroke(g.opening);
        ctx.globalAlpha = alpha * (0.35 + 0.65 * clamp(s, 0, 1));
        ctx.strokeStyle = '#c9a45c';
        ctx.lineWidth = 3.5;
        ctx.stroke(g.opening);
        ctx.fillStyle = '#c9a45c';
        ctx.font = '64px Georgia, "Times New Roman", serif';
        ctx.textAlign = 'center';
        ctx.fillText(g.numeral, 0, g.top - 46);
      }

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
      if ((s.requires || []).some((v) => game.state.vars[v] === undefined)) continue;
      rows.push([s.label, game.fill(s.value)]);
    }
    if (st.camera !== undefined) rows.push(['Dřepy ověřené kamerou', st.camera ? 'ano' : 'ne']);
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
        sinceSave += delta;
        if (sinceSave >= 10000) {
          game.save();
          sinceSave = 0;
        }
      }
    }, 1000);
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

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(scene.clientWidth * dpr));
      canvas.height = Math.max(1, Math.round(scene.clientHeight * dpr));
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

  /* ---------- Aktivity GSPORT: reflex test, dřepy ---------- */

  let activityCleanup = null;  // zastavení časovačů / kamery při zavření okna
  let reflexHit = null;        // stisk mezerníku během reflex testu

  function openActivity(ref) {
    // aktivita zapsaná jménem odkazuje na „activities“ místnosti v game.json
    const act = typeof ref === 'string' ? (game.room.activities || {})[ref] : ref;
    if (!act) return;
    if (act.type === 'reflex') openReflex(act);
    else if (act.type === 'squats') openSquats(act);
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
          const mod = await import('./squats.js?v=0.6');
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
