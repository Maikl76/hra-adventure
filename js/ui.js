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
  let shortcut = null;       // odkaz pro vyučující ?mistnost=… { track, roomId, label } (null = bez zkratky)
  const newItems = new Set(); // předměty, které se mají v inventáři zvýraznit

  /* ====================================================================
   * Spuštění
   * ==================================================================== */

  /* Stará stránka z mezipaměti prohlížeče: game.json se načítá vždy čerstvý, ale index.html a skripty
     mohou být z mezipaměti (GitHub Pages je drží až 10 minut) – pak nový obsah narazí na starý kód
     (např. aktivita, kterou starý kód nezná, se neotevře). Když se verze skriptů (?v= u ui.js)
     neshoduje s verzí v game.json, stránka se jednou znovu načte s ?v=<verze>, aby prohlížeč vzal novou. */
  function reloadIfStale(d) {
    const want = String((d.meta && d.meta.version) || '').split(' ')[0];
    const el = document.querySelector('script[src*="js/ui.js"]');
    const have = el ? new URL(el.src, location.href).searchParams.get('v') : null;
    if (!want || !have || want === have) return false;
    try {
      const key = `brany-biomechaniky-obnoveno-${want}`;
      if (sessionStorage.getItem(key)) return false;   // jen jednou (žádné nekonečné obnovování)
      sessionStorage.setItem(key, '1');
    } catch (e) {
      return false;
    }
    const url = new URL(location.href);
    url.searchParams.set('v', want);
    location.replace(url.toString());
    return true;
  }

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

    if (reloadIfStale(data)) return;
    Game.migrateSave();   // starší jediné uložení → uložení podle světa
    game = new Game(data);
    const problems = game.validate();
    if (problems.length) console.warn('Problémy v data/game.json:\n' + problems.join('\n'));
    shortcut = readShortcut();
    try {
      // ?kod=… předvyplní kód třídy (odkaz pro vyučující: všichni stejná čísla)
      const kod = new URLSearchParams(location.search).get('kod');
      if (kod) $('class-code').value = kod.slice(0, 12);
    } catch (e) { /* bez parametrů */ }

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

  /* Označení místnosti pro texty: „LEVEL 2 – Skokanská aréna“, „Brána I – Výstrojní sklad“. */
  const roomLabel = (room) => `${room.gateLabel || `Brána ${room.gateNumber || ''}`} – ${room.name}`;

  /* Odkaz pro vyučující: …/?mistnost=<id> – nová hra začne rovnou v dané místnosti (např.
     ?mistnost=arena = GSPORT LEVEL 2, když tým LEVEL 1 dohrál minule nebo na jiném počítači).
     V nabídce je pak jen svět, kam místnost patří. */
  function readShortcut() {
    let id = null;
    try {
      id = new URLSearchParams(location.search).get('mistnost');
    } catch (e) {
      return null;
    }
    if (!id) return null;
    const track = data.tracks.find((t) => t.rooms.includes(id) || (t.trialRooms && id in t.trialRooms));
    if (!track) {
      console.warn(`Odkaz ?mistnost=${id}: taková místnost ve hře není.`);
      return null;
    }
    return { track, roomId: id, label: roomLabel(data.rooms[id]) };
  }

  /* Podkres pro jednotlivé obrazovky (místnost si ho určuje sama v game.json). */
  const SCREEN_AMBIENCE = { intro: 'intro', title: 'title', track: 'title', finish: 'finish' };

  function showScreen(id) {
    document.querySelectorAll('.screen').forEach((s) => { s.hidden = s.id !== id; });
    if (id === 'room') startSceneLoop();
    else {
      stopSceneLoop();
      if (corridor) { corridor.stop(); corridor.setPaused(true); }
      if (world3d) { world3d.stop(); world3d.setPaused(true); }
      if (calc) calc.close();
      if ($('hud-help')) hideHudHelp();
    }
    if (id in SCREEN_AMBIENCE) sound.ambience(SCREEN_AMBIENCE[id]);
    updateStorm();   // bouřka jen v místnostech
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

    $('btn-continue').addEventListener('click', () => continueGame(shortcut ? shortcut.track.id : undefined));
    $('btn-new').addEventListener('click', showTrack);
    $('btn-intro').addEventListener('click', () => playIntro(showTitle));
    $('btn-map').addEventListener('click', () => openMap());
    $('track-back').addEventListener('click', showTitle);
    // ze zkratky zpět na běžnou hru (adresa bez ?mistnost=…)
    $('track-all').addEventListener('click', () => { location.href = location.pathname; });
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

  /* Karty světů (Civilní / Vojenská / GSPORT); rozehraný svět jde dohrát nebo začít znovu.
     Se zkratkou pro vyučující jen svět dané místnosti a nová hra začne v ní. */
  function renderTrackCards() {
    const tracks = $('tracks');
    tracks.innerHTML = '';
    tracks.classList.toggle('single', Boolean(shortcut));
    $('track-all').hidden = !shortcut;
    for (const track of shortcut ? [shortcut.track] : data.tracks) {
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
        // se zkratkou říct, kde je rozehráno (může to být dřívější místnost, než kam vede odkaz)
        const at = shortcut && Game.savedRoomId(track.id, data);
        if (at) s.textContent = `Rozehráno v místnosti ${roomLabel(data.rooms[at])} – kliknutím pokračuješ`;
        card.appendChild(s);
      } else if (shortcut) {
        const s = document.createElement('p');
        s.className = 'track-saved';
        s.textContent = `Začne se v místnosti ${shortcut.label}`;
        card.appendChild(s);
      }
      card.addEventListener('click', () => (saved ? continueGame(track.id) : startNewGame(track.id)));
      wrap.appendChild(card);
      if (saved) {
        const again = document.createElement('button');
        again.type = 'button';
        again.className = 'link track-again';
        again.textContent = shortcut ? `Začít znovu od místnosti ${shortcut.label}` : 'Začít tento svět znovu';
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
    $('btn-continue').hidden = !Game.hasSave(shortcut ? shortcut.track.id : undefined);
    const note = $('shortcut-note');
    note.hidden = !shortcut;
    if (shortcut) note.textContent = `Odkaz pro vyučující: nová hra začne rovnou v místnosti ${shortcut.label} (${shortcut.track.name}).`;
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
    const start = shortcut && shortcut.track.id === trackId ? shortcut.roomId : undefined;
    if (world3d) {
      // nová hra = 3D chodba od začátku
      world3d.destroy();
      world3d = null;
      world3dRoom = null;
    }
    const events = game.newGame(trackId, $('team-name').value, start, $('class-code').value);
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
    const help3d = game && game.state && game.room.type === 'world3d' && (game.room.world.texts || {}).help;
    tip.textContent = help3d || 'Na věci v místnosti klikej. Šipkami ‹ › po stranách se otáčíš.';
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

  /* Závěrečná obrazovka jako diplom: tým, svět, datum, hvězdičky, odznaky a naměřené hodnoty. */
  function showFinish() {
    const st = game.stats();
    const fin = game.finishDef;
    if (!game.state.finishedAt) {
      game.state.finishedAt = Date.now();
      game.save();
    }
    $('finish-kicker').textContent = `${data.meta.title} · diplom`;
    $('finish-title').textContent = fin.title || 'Konec';
    $('finish-team').hidden = !st.team;
    $('finish-team').textContent = st.team ? `Tým ${st.team}` : '';
    $('finish-sub').textContent = `${st.track} · ${new Date(game.state.finishedAt).toLocaleDateString('cs-CZ')}`;
    const stars = game.stars();
    const starsEl = $('finish-stars');
    starsEl.textContent = '★'.repeat(stars.n) + '☆'.repeat(3 - stars.n);
    starsEl.setAttribute('aria-label', `${stars.n} ze 3 hvězdiček`);
    $('finish-stars-why').textContent = starsReason(stars);
    const badges = game.badges();
    const bx = $('finish-badges');
    bx.innerHTML = '';
    bx.hidden = !badges.length;
    for (const b of badges) {
      const chip = document.createElement('span');
      chip.className = 'badge';
      const name = document.createElement('b');
      name.textContent = b.label;
      const desc = document.createElement('small');
      desc.textContent = b.desc || '';
      chip.append(name, desc);
      bx.appendChild(chip);
    }
    $('finish-text').textContent = fin.text || '';
    $('finish-photo').textContent = fin.photoHint || '';
    const rows = [
      ['Tým', st.team || '—'],
      ['Sekce', st.track],
    ];
    // hra začala zkratkou v pozdější místnosti – čas, chyby a nápovědy platí až od ní
    const startRoom = game.state.startRoom && data.rooms[game.state.startRoom];
    if (startRoom) rows.push(['Začátek', `${roomLabel(startRoom)} (odkaz pro vyučující)`]);
    if (game.state.seed) rows.push(['Kód úlohy', game.state.seed]);
    rows.push(
      ['Čas', formatTime(st.playMs)],
      ['Chybné pokusy', String(st.errors)],
      ['Použité nápovědy', String(st.hints)],
      ['Otevřené brány', `${st.gatesOpen} z ${data.meta.totalGates || 9}`],
    );
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

  /* Proč tolik hvězdiček a co stačí na víc. */
  function starsReason({ n, limits }) {
    const hintsText = (k) => (k === 0 ? 'bez nápovědy' : `nejvýš ${k} nápověd${k === 1 ? 'a' : k < 5 ? 'y' : ''}`);
    const errorsText = (k) => `nejvýš ${k} chybn${k === 1 ? 'ý pokus' : k < 5 ? 'é pokusy' : 'ých pokusů'}`;
    if (n === 3) return `Tři hvězdičky: ${hintsText(limits.three.hints)} a ${errorsText(limits.three.errors)}.`;
    if (n === 2) return `Dvě hvězdičky. Na tři: ${hintsText(limits.three.hints)} a ${errorsText(limits.three.errors)}.`;
    return `Jedna hvězdička. Na dvě: ${hintsText(limits.two.hints)} a ${errorsText(limits.two.errors)}.`;
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
        checkNudge(delta);
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

  /* ---------- Vzkaz od D. ----------
     V místnosti bez telefonu: když tým nudgeSeconds (180 s) nepostoupí (žádný nový příznak, předmět,
     zápis ani měření), objeví se vzkaz od D. z „nudges“ místnosti – říká, kam se podívat, ne řešení,
     a do nápověd se nepočítá. Při dalším zaseknutí přijde další vzkaz v pořadí. */
  let nudgeSig = '';
  let nudgeIdle = 0;

  function checkNudge(delta) {
    const room = game.room;
    if (!room || room.phone || !(room.nudges || []).length || game.state.finished) return;
    const st = game.state;
    const sig = `${game.roomId}|${Object.keys(st.flags).length}|${st.inventory.join(',')}|${st.notes.length}|${JSON.stringify(st.vars).length}`;
    if (sig !== nudgeSig) { nudgeSig = sig; nudgeIdle = 0; }
    if (!$('modal').hidden || (room.gate && game.gateOpen())) return;
    nudgeIdle += delta;
    if (nudgeIdle < (room.nudgeSeconds || 180) * 1000) return;
    nudgeIdle = 0;
    const text = game.nextNudge();
    if (!text) return;
    sound.sfx('paper');
    showMessage([{ text, cls: 'nudge' }]);
  }

  /* ====================================================================
   * Místnost
   * ==================================================================== */

  /* Vykreslení aktuálního pohledu místnosti; direction = odkud přichází (animace otočení). */
  function renderRoom(direction) {
    const room = game.room;
    if (room.type === 'corridor') {
      leaveWorld3d();
      renderCorridor();
      return;
    }
    if (room.type === 'world3d') {
      leaveCorridor();
      renderWorld3d();
      return;
    }
    leaveCorridor();
    leaveWorld3d();
    const view = game.view;
    $('hud-gate').textContent = room.gateLabel || `Brána ${room.gateNumber || ''}`;
    $('hud-room').textContent = view !== room && view.name ? `${room.name} · ${view.name}` : room.name;
    $('scene-bg').src = view.background;
    $('scene-layers').innerHTML = '';
    sound.ambience(room.ambience || 'room');
    updateStorm();
    hideTooltip();
    renderNav(view);
    if (direction) animateView(direction);

    const hotspots = $('hotspots');
    hotspots.innerHTML = '';
    for (const h of view.hotspots || []) hotspots.appendChild(hotspotButton(h));
    renderState(false);
  }

  /* Klikací plocha objektu (area v % obrázku). */
  function hotspotButton(h) {
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
    return btn;
  }

  /* ---------- Chodba „z vlastních očí“ (zkouška; kreslí js/chodba.js) ----------
     Hráč chodí po krocích (↑ ↓ / W S) a otáčí se o 90° (← → / A D); šipky jsou i na obrazovce
     a kliknutí do obrazu vlevo / vpravo otočí, uprostřed udělá krok. Objekt na zdi přímo před
     hráčem dostane klikací plochu přes celou zeď (Enter / mezerník), hromádka kostí na podlaze jen
     plochu přes kosti a po sebrání kosti zmizí („hideWhen“). Poloha se ukládá do hry. */
  let corridor = null;        // instance Corridor
  let corridorRoom = null;    // id místnosti, pro kterou je načtená
  let corridorBusy = false;   // probíhá krok / otočení

  function corridorCanvas() {
    let c = $('scene-corridor');
    if (!c) {
      c = document.createElement('canvas');
      c.id = 'scene-corridor';
      c.className = 'scene-corridor';
      $('scene-bg').after(c);
      c.addEventListener('click', (e) => {
        e.stopPropagation();
        const r = c.getBoundingClientRect();
        const fx = (e.clientX - r.left) / r.width;
        if (!corridor || !$('modal').hidden) return;
        if (corridor.combat()) {
          corridorShoot(fx, (e.clientY - r.top) / r.height);
          return;
        }
        if (fx < 0.25) corridorMove('turn', -1);
        else if (fx > 0.75) corridorMove('turn', 1);
        else corridorMove('step', 1);
      });
    }
    return c;
  }

  async function renderCorridor() {
    const room = game.room;
    const roomId = game.roomId;
    $('hud-gate').textContent = room.gateLabel || '';
    $('hud-room').textContent = room.name;
    sound.ambience(room.ambience || 'room');
    updateStorm();
    hideTooltip();
    $('scene').classList.add('corridor');
    $('scene-bg').hidden = true;
    $('scene-layers').innerHTML = '';
    $('hotspots').innerHTML = '';
    renderCorridorNav();
    renderState(false);
    const canvas = corridorCanvas();
    canvas.hidden = false;
    if (!corridor || corridorRoom !== roomId) {
      if (corridor) corridor.destroy();
      corridor = null;
      const mod = await import('./chodba.js?v=0.30');
      const def = room.corridor;
      const c = new mod.Corridor(canvas, def, {
        check: (w) => game.check(w),
        reducedMotion: reducedMotion.matches,
        hasWeapon: () => game.hasItem(def.weaponItem || 'laserova_puska'),
        attacks: Game.getSetting('kostlivciUtoci', true),
        defeated: (def.skeletons || []).filter((k) => game.state.flags[`kostlivec_${k.id}`]).map((k) => k.id),
        on: corridorEvents(def),
      });
      await c.load();
      if (!game.state || game.roomId !== roomId) return;   // mezitím odešel
      corridor = c;
      corridorRoom = roomId;
      canvas.__corridor = c;   // pro automatické testy (poloha kostlivců na obrazovce)
      if (game.state.vars.padnuti === undefined) game.setVars({ padnuti: 0 });   // odznak „Nezlomný“
    }
    corridor.setFlashlight(flashlightOn);
    corridor.setPosition(game.corridorPos());
    corridor.setPaused(!$('modal').hidden);
    corridor.start();
    updateCorridorFacing(false);
  }

  /* Kostlivci: texty z game.json (corridor.skeleton.texts) s doplněním {name}, {where}, {hit}, {lives}. */
  function skeletonText(def, keyName, vars = {}) {
    const t = ((def.skeleton || {}).texts || {})[keyName] || '';
    return t.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
  }

  function boneInfo(def, id) {
    return ((def.skeleton || {}).bones || {})[id] || { name: id || '', where: '' };
  }

  function corridorEvents(def) {
    return {
      wake: (s) => {
        sound.sfx('kosti');
        const armed = game.hasItem(def.weaponItem || 'laserova_puska');
        const who = s.name ? ` ${s.name}` : '';
        const lines = [armed ? skeletonText(def, 'wake', { ...boneInfo(def, s.bones[s.progress]), who }) : skeletonText(def, 'wakeNoWeapon', { who })];
        if (s.intro) lines.push({ text: s.intro, cls: 'aside' });
        showMessage(lines);
      },
      attack: (lives) => {
        sound.sfx('au');
        showMessage([skeletonText(def, 'attack', { lives })]);
      },
      death: (killer) => {
        sound.sfx('au');
        game.setVars({ padnuti: (game.state.vars.padnuti || 0) + 1 });
        setTimeout(() => {
          if (!corridor) return;
          corridor.resetAfterDeath(killer);
          game.setCorridorPos(corridor.position());
          showMessage([skeletonText(def, 'death')]);
          updateCorridorFacing(false);
        }, 650);
      },
      defeat: (s) => {
        sound.sfx('rozpad');
        handleEvents(game.run([{ set: `kostlivec_${s.id}` }]));
      },
    };
  }

  /* Výstřel laserem do bodu obrazu (fx, fy 0–1): vyhodnotit, jestli hráč trefil správnou kost. */
  function corridorShoot(fx, fy) {
    const def = game.room.corridor;
    const target = corridor.target();
    const res = corridor.shoot(fx, fy);
    sound.sfx('laser');
    if (!target) return;
    const want = boneInfo(def, target.bone);
    const v = game.state.vars;
    if (!res || res.skeleton !== target.skeleton) {
      corridor.hit(target.skeleton, false);   // jen bliknutí hledané kosti, nepočítá se jako chyba
      showMessage([skeletonText(def, 'between', want)]);
      return;
    }
    if (res.bone === target.bone) {
      game.setVars({ kosti_spravne: (v.kosti_spravne || 0) + 1, kosti_chybne: v.kosti_chybne || 0 });
      const s = target.skeleton;
      corridor.hit(s, true);
      const lines = [skeletonText(def, 'hit', want)];
      lines.push(s.alive ? skeletonText(def, 'next', boneInfo(def, s.bones[s.progress])) : skeletonText(def, 'defeated', { who: s.name ? ` ${s.name}` : '' }));
      showMessage(lines);
      if (!s.alive) updateCorridorFacing(false);   // hromádka kostí před hráčem jde hned sebrat
      return;
    }
    game.setVars({ kosti_chybne: (v.kosti_chybne || 0) + 1, kosti_spravne: v.kosti_spravne || 0 });
    corridor.hit(target.skeleton, false);
    showMessage([res.bone ? skeletonText(def, 'wrong', { ...want, hit: boneInfo(def, res.bone).name }) : skeletonText(def, 'between', want)]);
  }

  function leaveCorridor() {
    $('scene').classList.remove('corridor');
    if (corridor) corridor.setPaused(true);
    $('scene-bg').hidden = false;
    const c = $('scene-corridor');
    if (c) c.hidden = true;
    if (corridor) corridor.stop();
  }

  function renderCorridorNav() {
    const nav = $('scene-nav');
    nav.innerHTML = '';
    const add = (cls, label, title, kind, delta) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = cls;
      btn.textContent = label;
      btn.title = title;
      btn.setAttribute('aria-label', title);
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        corridorMove(kind, delta);
      });
      nav.appendChild(btn);
    };
    add('nav-left', '‹', 'Otočit se doleva (←)', 'turn', -1);
    add('nav-right', '›', 'Otočit se doprava (→)', 'turn', 1);
    add('nav-forward', '▲', 'Krok vpřed (↑)', 'step', 1);
    add('nav-backward', '▼', 'Krok vzad (↓)', 'step', -1);
  }

  async function corridorMove(kind, delta) {
    if (!corridor || corridorBusy || !$('modal').hidden || $('room').hidden) return;
    corridorBusy = true;
    $('hotspots').innerHTML = '';
    hideTooltip();
    if (kind === 'step' && corridorOpen(delta)) sound.sfx('step');
    const moved = kind === 'step' ? await corridor.step(delta) : await corridor.turn(delta);
    corridorBusy = false;
    if (!game.state || !corridor) return;
    game.setCorridorPos(corridor.position());
    updateCorridorFacing(true, kind === 'step' && !moved);
  }

  /* Je ve směru kroku volno? (zvuk kroku jen při skutečném kroku) */
  function corridorOpen(delta) {
    const f = corridor.facing();
    const c = delta > 0 ? f.front : f.back;
    return corridor.isFloor(c.x, c.y);
  }

  function corridorHotspotAt(cell) {
    let h = null;
    if (corridor && corridor.isFloor(cell.x, cell.y)) {
      // na podlaze: hromádka kostí po poraženém kostlivci („pile“ = id kostlivce); jinak nic (otevřená závora apod.)
      const pile = corridor.pileAt(cell.x, cell.y);
      h = pile ? (game.room.hotspots || []).find((x) => x.pile === pile) || null : null;
    } else {
      h = (game.room.hotspots || []).find((x) => x.cell && x.cell[0] === cell.x && x.cell[1] === cell.y) || null;
    }
    // „hideWhen“: objekt zmizí, když podmínka platí (hromádka kostí, ze které hráč už kost vzal)
    return h && h.hideWhen && game.check(h.hideWhen) ? null : h;
  }

  /* Klikací plocha pro věc přímo před hráčem: věc na zdi dostane celou zeď, hromádka kostí na podlaze
     jen plochu přes kosti – klepnutí jinam do středu obrazu dál znamená krok vpřed. */
  function placeCorridorHotspot() {
    const hs = $('hotspots');
    hs.innerHTML = '';
    hs.dataset.front = '';
    if (!corridor) return null;
    const cell = corridor.facing().front;
    const front = corridorHotspotAt(cell);
    if (!front) return null;
    let area = [14, 20, 72, 72];
    if (front.pile) {
      const r = corridor.pileRect(cell.x, cell.y);
      const x0 = r ? Math.max(0, r.x0 - 0.06) : 0.35, x1 = r ? Math.min(1, r.x1 + 0.06) : 0.65;
      const y0 = r ? Math.max(0, r.y0 - 0.06) : 0.62, y1 = r ? Math.min(1, r.y1 + 0.05) : 0.92;
      area = [x0 * 100, y0 * 100, (x1 - x0) * 100, (y1 - y0) * 100];
    }
    hs.appendChild(hotspotButton({ ...front, area }));
    hs.dataset.front = front.id;
    return front;
  }

  function frontHotspot() {
    return corridor ? corridorHotspotAt(corridor.facing().front) : null;
  }

  /* Po kroku: klikací plocha na zdi před hráčem a krátká nápověda, co je kolem. */
  function updateCorridorFacing(replace, bumped) {
    if (!corridor) return;
    const f = corridor.facing();
    const front = placeCorridorHotspot();
    const lines = [];
    if (front && !front.hidden) lines.push(`Před tebou: ${front.name} (klikni, nebo stiskni Enter).`);
    const left = corridorHotspotAt(f.left), right = corridorHotspotAt(f.right);
    if (left && !left.hidden) lines.push(`Vlevo: ${left.name}.`);
    if (right && !right.hidden) lines.push(`Vpravo: ${right.name}.`);
    if (bumped) lines.unshift(corridor.skeletonAt(f.front.x, f.front.y) ? 'Cestu zastoupil kostlivec – zasáhni ho laserem.' : 'Tudy cesta nevede.');
    if (replace) showMessage([], lines);
    else lines.forEach((l) => appendMessage(l, true));
  }

  /* ---------- 3D chodba (ukázka; kreslí js/chodba3d.js a js/svalovec.js přes three.js) ----------
     Volný pohyb: myš + W A S D / šipky, mezerník skok, C podřep, E akce, klik / Enter / X laser;
     na dotykovém displeji páčka a tlačítka. Klávesy obsluhuje modul sám, sem jen hlásí události. */
  let world3d = null;         // instance World3D
  let world3dRoom = null;     // id místnosti, pro kterou je načtená (nová hra ji zahodí)

  async function renderWorld3d() {
    const room = game.room;
    const roomId = game.roomId;
    $('hud-gate').textContent = room.gateLabel || '';
    $('hud-room').textContent = room.name;
    sound.ambience(room.ambience || 'room');
    updateStorm();
    hideTooltip();
    $('scene').classList.add('world3d');
    $('scene-bg').hidden = true;
    $('scene-layers').innerHTML = '';
    $('hotspots').innerHTML = '';
    $('scene-nav').innerHTML = '';
    renderState(false);
    let box = $('scene-3d');
    if (!box) {
      box = document.createElement('div');
      box.id = 'scene-3d';
      box.className = 'scene-3d';
      $('scene-bg').after(box);
    }
    box.hidden = false;
    if (!world3d || world3dRoom !== roomId) {
      if (world3d) world3d.destroy();
      world3d = null;
      const save = game.state;
      let w;
      try {
        const mod = await import('./chodba3d.js?v=0.30');
        w = new mod.World3D(box, room.world, {
          reducedMotion: reducedMotion.matches,
          attacks: Game.getSetting('kostlivciUtoci', true),
          on: world3dEvents(),
        });
        await w.load();
      } catch (err) {
        console.error(err);
        if (w) w.destroy();
        if (game.state && game.roomId === roomId && !$('room').hidden) showSkipWorld3d(room);
        return;
      }
      if (!game.state || game.state !== save || game.roomId !== roomId || $('room').hidden) {
        w.destroy();
        return;
      }
      world3d = w;
      world3dRoom = roomId;
      box.__world3d = w;   // pro automatické testy
      if (game.state.vars.padnuti === undefined) game.setVars({ padnuti: 0 });
    }
    world3d.setFlashlight(flashlightOn);
    world3d.setAttacks(Game.getSetting('kostlivciUtoci', true));
    world3d.start();
    world3d.setPaused(!$('modal').hidden);
  }

  /* Příznaky a stránka deníku 3D chodby: z dat (room.world.ids), výchozí = chodba na cvičiště. */
  function world3dIds() {
    const ids = (game.room && game.room.world && game.room.world.ids) || {};
    return { defeat: ids.defeat || 'svalovec_porazen', diary: ids.diary || 'prekazky', end: ids.end || 'prekazky_konec', skipped: ids.skipped || 'prekazky_preskoceno' };
  }

  function world3dEvents() {
    return {
      message: (lines) => showMessage(lines),
      sfx: (name) => sound.sfx(name),
      stats: (vals) => game.setVars(vals),
      flag: (name) => handleEvents(game.run([{ set: name }])),
      fell: () => game.setVars({ padnuti: (game.state.vars.padnuti || 0) + 1 }),
      defeat: () => { const ids = world3dIds(); handleEvents(game.run([{ set: ids.defeat }, { denik: ids.diary }])); },
      // dveřmi ven: další místnost světa, nebo závěrečná obrazovka
      end: () => {
        const roomId = game.roomId;
        handleEvents(game.run([{ set: world3dIds().end }]));
        setTimeout(() => {
          if (game.state && game.roomId === roomId && !$('room').hidden) leaveRoom();
        }, 1400);
      },
    };
  }

  /* Prohlížeč bez 3D grafiky: chodbu jde přeskočit, aby šla hra dohrát (uvede se na konci). */
  function showSkipWorld3d(room) {
    const texts = room.world.texts || {};
    showMessage([texts.noWebgl || 'Tento prohlížeč neumí 3D grafiku (WebGL).']);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn go';
    btn.textContent = texts.skipButton || 'Přeskočit ›';
    btn.addEventListener('click', () => {
      game.setVars({ [world3dIds().skipped]: 1 });
      leaveRoom();
    });
    $('message').lastElementChild.appendChild(btn);
  }

  function leaveWorld3d() {
    $('scene').classList.remove('world3d');
    const box = $('scene-3d');
    if (box) box.hidden = true;
    if (world3d) {
      world3d.setPaused(true);
      world3d.stop();
    }
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
    if (corridor && game.room.type === 'corridor') {
      corridor.invalidate();
      // po akci (např. sebraná kost) se klikací plocha před hráčem může změnit nebo zmizet
      if (corridorRoom === game.roomId && !corridorBusy) {
        const front = corridorHotspotAt(corridor.facing().front);
        if ((front ? front.id : '') !== ($('hotspots').dataset.front || '')) {
          hideTooltip();
          placeCorridorHotspot();
        }
      }
    }
    updateStorm();   // síla bouřky podle postupu v místnosti
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
          texts.push(ev.more ? { text: ev.text, more: ev.more, moreLabel: ev.moreLabel } : ev.text);
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
        case 'heal':
          if (corridor) corridor.heal();
          break;
        case 'denik':
          modal = () => openDiaryPage(ev.id, true);
          break;
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

  /* Řádek zprávy: text, nebo { text, more, cls } – „more“ je delší vysvětlení za tlačítkem „Proč?“
     (méně čtení najednou: krátká věta hned, výpočet pro toho, kdo chce). */
  function messageLine(line, muted) {
    const obj = typeof line === 'string' ? { text: line } : line || { text: '' };
    const p = document.createElement('p');
    p.textContent = obj.text;
    if (muted) p.className = 'muted';
    if (obj.cls) p.classList.add(obj.cls);
    if (obj.more) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn why';
      btn.textContent = obj.moreLabel || 'Proč?';
      btn.setAttribute('aria-label', `${obj.moreLabel || 'Proč?'} – ukázat víc`);
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const ex = document.createElement('span');
        ex.className = 'why-text';
        ex.textContent = ` ${obj.more}`;
        btn.replaceWith(ex);
      });
      p.append(' ', btn);
    }
    return p;
  }

  /* Zpráva pod místností; „muted“ řádky jsou šedé (nápověda k ovládání). */
  function showMessage(lines, mutedLines) {
    const box = $('message');
    box.innerHTML = '';
    for (const line of lines) box.appendChild(messageLine(line));
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
    $('message').appendChild(messageLine(text, muted));
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
    if (corridor) corridor.setFlashlight(flashlightOn);
    if (world3d) world3d.setFlashlight(flashlightOn);
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
    if (corridor) corridor.setPaused(true);
    if (world3d) world3d.setPaused(true);
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
    if (corridor && game && game.state && game.room.type === 'corridor') corridor.setPaused(false);
    if (world3d && game && game.state && game.room.type === 'world3d' && !$('room').hidden) {
      world3d.setAttacks(Game.getSetting('kostlivciUtoci', true));
      world3d.setPaused(false);
    }
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

  /* ---------- Basketbalový automat (aréna) ----------
     Trestný hod z boku (js/basket.js): tah od míče dozadu jako prak, nebo šipky a tlačítka ± úhel
     a rychlost a „Hodit“ (hodí znovu se stejným nastavením – dobrý hod jde zopakovat). Kolo má
     act.throws hodů, výhra od act.need košů; po act.hintAfter neúspěšných kolech automat napoví
     (act.hint). Výsledek do „done“: kose (nejvíc košů v kole), kos_uhel a kos_rychlost (první koš). */
  let basketKey = null;

  function openBasket(act) {
    const need = act.need || 3;
    const hintAfter = act.hintAfter || 2;
    let failed = game.state.vars.kos_kola_neuspesna || 0;
    let first = null;
    let ctl = null;
    const fmt = (v, d = 1) => v.toFixed(d).replace('.', ',');
    const kose = (n) => `${n} ${n === 1 ? 'koš' : n >= 2 && n <= 4 ? 'koše' : 'košů'}`;

    openModal((box) => {
      box.classList.add('activity-box', 'basket-box');
      heading(box, act.title || 'Basketbalový automat');
      para(box, act.intro || '', 'question');
      const canvas = document.createElement('canvas');
      canvas.className = 'basket-canvas';
      canvas.setAttribute('aria-label', 'Hřiště s košem z boku. Táhni od míče dozadu jako prak a pusť.');
      box.appendChild(canvas);
      const bar = document.createElement('div');
      bar.className = 'basket-bar';
      box.appendChild(bar);
      const readout = document.createElement('span');
      readout.className = 'basket-readout';
      bar.appendChild(readout);
      const ctrl = (label, title, fn) => {
        const b = button(bar, label, 'btn basket-btn', () => { if (ctl) fn(); });
        b.title = title;
        b.setAttribute('aria-label', title);
        return b;
      };
      ctrl('◀ úhel', 'Snížit úhel o 1° (šipka vlevo)', () => ctl.adjust(-1, 0));
      ctrl('úhel ▶', 'Zvýšit úhel o 1° (šipka vpravo)', () => ctl.adjust(1, 0));
      ctrl('− rychlost', 'Snížit rychlost o 0,1 m/s (šipka dolů)', () => ctl.adjust(0, -0.1));
      ctrl('+ rychlost', 'Zvýšit rychlost o 0,1 m/s (šipka nahoru)', () => ctl.adjust(0, 0.1));
      const throwBtn = ctrl('Hodit', 'Hodit s tímto nastavením (mezerník)', () => ctl.throw());
      throwBtn.classList.add('primary');
      const feedback = para(box, '', 'basket-feedback');
      feedback.setAttribute('aria-live', 'polite');
      const hint = para(box, failed >= hintAfter ? act.hint || '' : '', 'basket-hint');
      const after = document.createElement('div');
      after.className = 'basket-after';
      box.appendChild(after);

      const describe = (res) => {
        const entry = res.cross ? Math.round(res.cross.entry) : 0;
        const open = Math.round(res.opening * 100);
        const miss = res.miss == null ? 0 : Math.round(Math.abs(res.miss) * 100);
        const where = res.miss < 0 ? 'před středem obroučky' : 'za středem obroučky';
        const opening = `Míč padal do obroučky pod úhlem ${entry}° – otvor pro něj měl ${open} cm (míč má 24 cm).`;
        const flat = entry < 32 && res.cross ? ' Při tak plochém dopadu je otvor menší než míč – čistě projít nemůže.' : '';
        switch (res.result) {
          case 'cisty': return `Čistý koš! ${opening}`;
          case 'kos': return `Koš – po odrazu od ${res.board ? 'desky' : 'obroučky'}. ${opening}${flat}`;
          case 'obroucka': return `Obroučka – míč šel o ${miss} cm ${where} a odrazil se ven. ${opening}${flat}`;
          case 'deska': return `Deska – míč letěl o ${miss} cm ${where} a odrazil se mimo. Uber rychlost.`;
          case 'kratky': return `Krátký – míč prošel výškou obroučky o ${miss} cm ${where}. Přidej rychlost.${flat}`;
          case 'dlouhy': return `Dlouhý – míč prošel výškou obroučky o ${miss} cm ${where}. Uber rychlost.`;
          default: return 'Nízko – míč ani nevystoupal do výšky obroučky (305 cm). Přidej rychlost nebo zvedni úhel.';
        }
      };

      const endRound = (score) => {
        throwBtn.disabled = true;
        after.innerHTML = '';
        if (score.made >= need) {
          const best = Math.max(score.made, game.state.vars.kose || 0);
          para(after, `Výhra! ${kose(score.made)} z ${score.of}. Automat zablikal: VÝHRA!`, 'basket-win');
          button(after, 'Pokračovat', 'btn primary', () => finishActivity(act, {
            kose: best, kos_uhel: first ? first.angle : null, kos_rychlost: first ? first.speed : null,
          }));
          ctl.disabled = true;
          ctl.draw();
        } else {
          failed += 1;
          game.setVars({ kos_kola_neuspesna: failed });
          para(after, `Jen ${kose(score.made)} z ${score.of}. Na výhru potřebuješ aspoň ${kose(need)}.`, 'basket-lose');
          if (failed >= hintAfter && act.hint) hint.textContent = act.hint;
          button(after, 'Nové kolo', 'btn primary', () => {
            after.innerHTML = '';
            throwBtn.disabled = false;
            first = null;
            ctl.newRound();
          });
        }
      };

      import('./basket.js?v=0.30').then((mod) => {
        if (!canvas.isConnected) return;
        ctl = new mod.Basket(canvas, {
          throws: act.throws || 10,
          reducedMotion: reducedMotion.matches,
          onAim: (aim) => { readout.textContent = `Úhel ${aim.angle}° · rychlost ${fmt(aim.speed)} m/s`; },
          onThrow: (res, score, aim) => {
            sound.sfx(res.made ? 'swish' : res.rim ? 'rim' : 'bounce');
            if (res.made && !first) first = aim;
            feedback.textContent = describe(res);
            if (score.throw >= score.of) endRound(score);
          },
        });
        readout.textContent = `Úhel ${ctl.aim.angle}° · rychlost ${fmt(ctl.aim.speed)} m/s`;
        activityCleanup = () => { ctl.destroy(); basketKey = null; };
        basketKey = (e) => {
          const k = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 0.1], ArrowDown: [0, -0.1] }[e.key];
          if (k) { ctl.adjust(k[0], k[1]); return true; }
          if (e.key === ' ' || e.key === 'Enter') {
            // jiné tlačítko v okně (Pokračovat, Nové kolo, zavřít) si klávesu vezme samo; jinak = hod
            const btn = e.target && e.target.closest ? e.target.closest('button') : null;
            if (btn && $('modal').contains(btn) && !btn.classList.contains('basket-btn')) return false;
            if (!e.repeat && !throwBtn.disabled) ctl.throw();
            return true;
          }
          return false;
        };
      });
    });
  }

  /* ---------- Skládání kostry (bludiště) ----------
     Kostře z anatomického kabinetu chybějí kosti; hráč je sebral z hromádek po kostlivcích.
     Vybere kost dole a klikne na značku místa (značky jsou odtažené od kostry, aby šly snadno
     trefit i prstem – u bérce jedna uvnitř, druhá vně). Správně: kost se vrátí na místo (příznak
     kostra_<id>), špatně: vysvětlení, kam ta kost patří a co na tom místě chybí. Hotovo: „done“.
     game.json: type „skeleton“, image (kostra s mezerami), slots [{ id, item, name, image, box
     (poloha kosti v % obrázku), marker (značka v %), where (kam kost patří), hint (co tu chybí),
     rightText (jen kde nesedí tvar „… je na svém místě“, např. množné číslo) }]. */
  function openSkeleton(act) {
    const NS = 'http://www.w3.org/2000/svg';
    const placed = (sl) => Boolean(game.state.flags[`kostra_${sl.id}`]);
    let selected = null;
    let errors = game.state.vars.kostra_chybne || 0;

    openModal((box) => {
      box.classList.add('activity-box', 'skel-box');
      heading(box, act.title || 'Kostra');
      para(box, act.intro || '', 'question');
      const wrap = document.createElement('div');
      wrap.className = 'skel-wrap';
      box.appendChild(wrap);
      const fig = document.createElement('div');
      fig.className = 'skel-fig';
      wrap.appendChild(fig);
      const side = document.createElement('div');
      side.className = 'skel-side';
      wrap.appendChild(side);
      const feedback = para(box, '', 'skel-feedback');
      feedback.setAttribute('aria-live', 'polite');

      const draw = () => {
        fig.innerHTML = '';
        const base = document.createElement('img');
        base.className = 'skel-base';
        base.src = act.image;
        base.alt = 'Kostra z anatomického kabinetu';
        fig.appendChild(base);
        const svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('viewBox', '0 0 100 200');
        svg.setAttribute('preserveAspectRatio', 'none');
        svg.classList.add('skel-lines');
        fig.appendChild(svg);
        for (const sl of act.slots) {
          const [x, y, w, h] = sl.box;
          if (placed(sl)) {
            const img = document.createElement('img');
            img.className = 'skel-bone';
            img.src = sl.image;
            img.alt = sl.name;
            Object.assign(img.style, { left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%` });
            fig.appendChild(img);
            continue;
          }
          // čárkovaná čára od značky k mezeře
          const line = document.createElementNS(NS, 'line');
          line.setAttribute('x1', sl.marker[0]);
          line.setAttribute('y1', sl.marker[1] * 2);
          line.setAttribute('x2', x + w / 2);
          line.setAttribute('y2', (y + h / 2) * 2);
          svg.appendChild(line);
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'skel-slot';
          btn.textContent = '?';
          btn.setAttribute('aria-label', sl.hint);
          btn.title = sl.hint;
          Object.assign(btn.style, { left: `${sl.marker[0]}%`, top: `${sl.marker[1]}%` });
          btn.addEventListener('click', () => tryPlace(sl));
          fig.appendChild(btn);
        }
        side.innerHTML = '';
        const have = act.slots.filter((sl) => !placed(sl) && game.hasItem(sl.item));
        const missing = act.slots.filter((sl) => !placed(sl) && !game.hasItem(sl.item)).length;
        para(side, have.length ? 'Tvoje kosti:' : 'Nemáš u sebe žádnou kost, která by kostře chyběla.', 'skel-label');
        for (const sl of have) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = `skel-pick${selected === sl ? ' selected' : ''}`;
          b.setAttribute('aria-pressed', String(selected === sl));
          const item = game.item(sl.item) || {};
          const ic = document.createElement('img');
          ic.src = item.icon || sl.image;
          ic.alt = '';
          b.append(ic, document.createTextNode(item.name || sl.name));
          b.addEventListener('click', () => {
            selected = selected === sl ? null : sl;
            feedback.textContent = selected ? `Vybráno: ${item.name || sl.name}. Teď klikni na otazník, kam patří.` : '';
            draw();
          });
          side.appendChild(b);
        }
        if (missing) para(side, (act.missingText || 'Chybí ještě kostí: {n}.').replace('{n}', missing), 'skel-missing');
      };

      const tryPlace = (sl) => {
        if (!selected) {
          feedback.textContent = act.pickText || 'Nejdřív vyber kost.';
          return;
        }
        const chosen = selected;
        if (chosen === sl) {
          selected = null;
          handleEvents(game.run([{ remove: sl.item }, { set: `kostra_${sl.id}` }]));
          sound.sfx('kosti');
          feedback.textContent = (sl.rightText || act.rightText || '{name} je na svém místě.').replace('{name}', sl.name);
          if (act.slots.every(placed)) {
            setTimeout(() => finishActivity(act, { kostra_chybne: errors }), 900);
          }
        } else {
          errors += 1;
          game.setVars({ kostra_chybne: errors });
          sound.sfx('wrong');
          feedback.textContent = `${chosen.name[0].toUpperCase()}${chosen.name.slice(1)} sem nepatří – ${chosen.where}. ${sl.hint}`;
        }
        draw();
      };
      draw();
    });
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

  /* ---------- Bouřka venku ----------
     Podkres pod zvuky místnosti: vzdálené dunění (audio.js storm; déšť záměrně ne), občas blesk
     a po něm hrom se zpožděním podle vzdálenosti (zvuk urazí 1 km asi za 3 s). Místnost v game.json:
     „storm“: { "place": "okno" | "budova" | "sklep", "steps": [příznaky postupu] } – bouřka sílí
     s každým splněným krokem, u otevřené brány je nejsilnější. Bezpečnost: záblesk je měkký
     a nejvýš jednou za 20 s, při „omezit pohyb“ žádný; během úlohy, zámku či lekačky (otevřené
     okno přes hru) blesk ani blízký hrom nepřijde; prásknutí blízkého hromu jen se zapnutými
     lekačkami. Menu → Bouřka: ano/ne (výchozí ano). Zvuk tu nenese žádnou informaci k řešení. */

  const stormOn = () => Game.getSetting('storm', true);
  let stormTimer = 0;

  /* Místo a síla bouřky v aktuální místnosti (null = hráč není v místnosti). */
  function stormInfo() {
    if (!game || !game.state || $('room').hidden) return null;
    const room = game.room;
    const st = room.storm || {};
    const steps = st.steps || [];
    const done = steps.filter((f) => game.state.flags[f]).length;
    let level = steps.length ? 0.15 + 0.85 * (done / steps.length) : 0.4;
    if (room.gate && room.gate.openFlag && game.state.flags[room.gate.openFlag]) level = 1;
    return { place: st.place || 'budova', level };
  }

  function updateStorm() {
    const info = stormOn() ? stormInfo() : null;
    sound.storm(info);
    if (!info) {
      clearTimeout(stormTimer);
      stormTimer = 0;
    } else if (!stormTimer) {
      scheduleStrike(info.level, true);
    }
  }

  function scheduleStrike(level, first) {
    const wait = Math.max(20, (55 - 30 * level) * (0.75 + Math.random() * 0.5));   // u brány častěji
    stormTimer = setTimeout(strike, wait * (first ? 0.5 : 1) * 1000);
  }

  const stormBusy = () => !$('modal').hidden || scareActive || Boolean(scareTimer) || document.hidden;

  function strike() {
    stormTimer = 0;
    const info = stormOn() ? stormInfo() : null;
    if (!info) return;
    if (!stormBusy()) {
      // blízko (pod 1 km, s prásknutím) jen se zapnutými lekačkami a u silné bouřky
      const near = scaresOn() && info.level > 0.5 && Math.random() < 0.35;
      const distance = near ? 0.4 + Math.random() * 0.6 : Math.max(1.3, (5.5 - 3.5 * info.level) * (0.7 + Math.random() * 0.6));
      lightning(info.place, distance);
      setTimeout(() => {
        const now = stormOn() ? stormInfo() : null;
        if (!now || (stormBusy() && distance < 2)) return;   // během úlohy žádné hlasité zahřmění
        sound.thunder({ distance, place: now.place });
      }, (distance / 0.343) * 1000);
    }
    scheduleStrike(info.level, false);
  }

  /* Blesk: u okna a venku měkký záblesk, jinde (budova, sklep) probliknou světla. */
  function lightning(place, distance) {
    const el = $('scene-storm');
    if (!el || reducedMotion.matches) return;
    el.className = 'scene-storm';
    void el.offsetWidth;   // znovu spustit animaci
    el.style.setProperty('--blesk', Math.max(0.35, Math.min(1, 1.2 / distance)).toFixed(2));
    el.className = `scene-storm ${place === 'okno' || place === 'venku' ? 'blesk' : 'probliknuti'}`;
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
    pageEl.className = pageEl.className.replace(/\s*(title-page|has-table)/g, '');
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
      } else if (block.table) {
        // tabulka (např. normy): { caption, head: [...], rows: [[...], …] }
        const t = block.table;
        el = document.createElement('table');
        el.className = 'book-table';
        if (t.caption) el.createCaption().textContent = t.caption;
        if (t.head) {
          const tr = el.createTHead().insertRow();
          for (const h of t.head) {
            const th = document.createElement('th');
            th.textContent = h;
            tr.appendChild(th);
          }
        }
        const body = el.createTBody();
        for (const r of t.rows || []) {
          const tr = body.insertRow();
          r.forEach((v, i) => {
            const td = document.createElement(i === 0 ? 'th' : 'td');
            td.textContent = v;
            tr.appendChild(td);
          });
        }
        pageEl.classList.add('has-table');
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
    else if (act.type === 'goblet') openGoblet(act);
    else if (act.type === 'gobletsim') openGobletSim(act);
    else if (act.type === 'pushup') openPushup(act);
    else if (act.type === 'throw') openThrow(act);
    else if (act.type === 'skeleton') openSkeleton(act);
    else if (act.type === 'basket') openBasket(act);
    else if (act.type === 'stretcher') openStretcher(act);
    else if (act.type === 'helmet') openHelmet(act);
    else if (act.type === 'slope') openSlope(act);
    else if (act.type === 'spin') openSpin(act);
    else if (act.type === 'curve') openCurve(act);
    else if (act.type === 'gyro') openGyro(act);
    else if (act.type === 'strobo') openStrobo(act);
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
          const mod = await import('./squats.js?v=0.30');
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
          const mod = await import('./skok.js?v=0.30');
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

  /* Goblet dřep s kettlebellem (tělocvična): limit „duration“ s, lavička ve výšce kolene – jen dotyk,
     kolena a hlava za špičkami. S kamerou měří js/goblet.js: neplatný dřep ukáže i s důvodem, ale
     nezapočítá ho. Bez kamery hra stopuje čas a počet platných dřepů zadá kolega; kdo cvičit nemůže,
     přeskočí. Hráč zvolí zátěž (kettlebell / náhrada / bez) – s náhradou nebo bez je výsledek orientační.
     Nakonec orientační známky podle „norms“ (řádky { label, limits: [1, 2, 3] }).
     Proměnné: goblet_n, goblet_neplatne, goblet_kamera, goblet_zatez (2 kettlebell, 1 náhrada, 0 bez),
     goblet_preskoceno, goblet_hotovo. */
  function openGoblet(act) {
    const duration = act.duration || 90;
    let load = 2;
    openModal((box) => {
      box.classList.add('activity-box', 'squat-box');
      heading(box, act.title || 'Goblet dřep');
      para(box, act.intro || '', 'question');
      const choice = document.createElement('div');
      choice.className = 'squat-choice';
      box.appendChild(choice);
      if (act.rules) {
        const ul = document.createElement('ul');
        ul.className = 'goblet-rules';
        for (const r of act.rules) {
          const li = document.createElement('li');
          li.textContent = r;
          ul.appendChild(li);
        }
        choice.appendChild(ul);
      }
      if (act.safety) para(choice, act.safety, 'lean-safety');
      const lw = document.createElement('div');
      lw.className = 'goblet-loads';
      choice.appendChild(lw);
      para(lw, act.loadLabel || 'S čím cvičíš?', 'muted');
      (act.loads || ['Kettlebell 5 kg', 'Náhrada (láhev s vodou, batoh na hrudníku)', 'Bez zátěže']).forEach((name, i) => {
        const l = document.createElement('label');
        const r = document.createElement('input');
        r.type = 'radio';
        r.name = 'goblet-load';
        r.checked = i === 0;
        r.addEventListener('change', () => { load = 2 - i; });
        l.append(r, document.createTextNode(` ${name}`));
        lw.appendChild(l);
      });
      para(choice, act.camera || 'S kamerou: postav se 2–3 m od notebooku BOKEM ke kameře, celý v záběru i s chodidly.', 'muted');
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
      counter.textContent = '0';
      const clock = document.createElement('div');
      clock.className = 'goblet-clock';
      clock.textContent = `${duration} s`;
      stage.append(canvas, counter, clock);
      box.appendChild(stage);
      const status = para(box, '', 'feedback');
      const log = document.createElement('ol');
      log.className = 'goblet-log';
      box.appendChild(log);
      const results = document.createElement('div');
      box.appendChild(results);
      const setStatus = (text, kind) => {
        status.textContent = text;
        status.className = `feedback${kind === 'ok' ? ' good' : kind === 'bad' ? ' bad' : ''}`;
      };
      const grade = (n, limits) => {
        for (let i = 0; i < limits.length; i++) if (n >= limits[i]) return String(i + 1);
        return act.failLabel || 'nesplnil(a)';
      };

      function finish(vars, summary) {
        sound.sfx('levelUp');
        stage.hidden = true;
        setStatus(summary, 'ok');
        if (vars.goblet_n !== null && act.norms) {
          if (act.normsTitle) para(results, act.normsTitle, 'muted');
          const t = document.createElement('table');
          t.className = 'lean-table';
          const row = (cells, tag) => {
            const tr = document.createElement('tr');
            for (const c of cells) { const td = document.createElement(tag); td.textContent = c; tr.appendChild(td); }
            t.appendChild(tr);
          };
          row(['', 'známka 1', '2', '3', `${vars.goblet_n} dřepů`], 'th');
          for (const nr of act.norms) row([nr.label, ...nr.limits.map(String), grade(vars.goblet_n, nr.limits)], 'td');
          results.appendChild(t);
          if (load < 2) para(results, act.orientText || 'Orientačně – normy platí pro kettlebell 5 kg.', 'muted small');
        }
        button(box, 'Pokračovat ›', 'btn activity-next', () => finishActivity(act, { ...vars, goblet_hotovo: 1 }));
      }

      // --- s kamerou ---
      button(btns, 'S kamerou', 'btn primary', async () => {
        choice.hidden = true;
        stage.hidden = false;
        let cancelled = false;
        let timer = 0;
        activityCleanup = () => { cancelled = true; clearInterval(timer); };
        try {
          const mod = await import('./goblet.js?v=0.30');
          let ctrl = null;
          const end = () => {
            clearInterval(timer);
            const r = ctrl.finish();
            ctrl.stop();
            const why = Object.entries(r.duvody).filter(([, v]) => v).map(([k, v]) => `${mod.REASONS[k]} ${v}×`).join(', ');
            finish({ goblet_n: r.n, goblet_neplatne: r.neplatne, goblet_kamera: 1, goblet_zatez: load, goblet_preskoceno: 0 },
              `Konec! Platných dřepů: ${r.n}. Neplatných: ${r.neplatne}${why ? ` (${why})` : ''}.`);
          };
          ctrl = await mod.startGoblet({
            canvas, kneeTol: act.kneeTolCm, headTol: act.headTolCm, seatTol: act.seatTolCm,
            sitMs: act.sitSeconds ? act.sitSeconds * 1000 : undefined,
            onStatus: setStatus,
            onReady: () => {
              // odpočet 3–2–1, pak měření „duration“ sekund
              let n = 3;
              sound.sfx('key');
              clock.textContent = `${n}…`;
              timer = setInterval(() => {
                n -= 1;
                if (n > 0) { clock.textContent = `${n}…`; sound.sfx('key'); return; }
                clearInterval(timer);
                sound.sfx('reflexGo');
                ctrl.start();
                const t0 = performance.now();
                timer = setInterval(() => {
                  const left = duration - (performance.now() - t0) / 1000;
                  clock.textContent = `${Math.max(0, Math.ceil(left))} s`;
                  if (left <= 0) end();
                }, 200);
              }, 800);
            },
            onRep: (rep, st) => {
              counter.textContent = String(st.n);
              counter.classList.remove('bump'); void counter.offsetWidth; counter.classList.add('bump');
              sound.sfx(rep.valid ? 'squatOk' : 'squatShallow');
              if (!rep.valid) {
                const li = document.createElement('li');
                li.textContent = `Neplatný: ${rep.reasons.map((k) => mod.REASONS[k]).join(', ')}`;
                log.prepend(li);
                while (log.children.length > 4) log.lastChild.remove();
              }
            },
          });
          if (cancelled) { ctrl.stop(); return; }
          activityCleanup = () => { clearInterval(timer); ctrl.stop(); };
        } catch (e) {
          if (cancelled) return;
          console.error(e);
          stage.hidden = true;
          choice.hidden = false;
          const msg = e && e.name === 'NotAllowedError' ? 'Přístup ke kameře byl odmítnut.'
            : e && e.name === 'NotFoundError' ? 'Kamera nebyla nalezena.'
            : 'Kameru se nepodařilo spustit.';
          setStatus(`${msg} Můžeš cvičit bez kamery – počítá kolega.`, 'bad');
        }
      });

      // --- bez kamery: hra stopuje, kolega počítá platné dřepy ---
      button(btns, act.manualLabel || 'Bez kamery (počítá kolega)', 'btn', () => {
        choice.hidden = true;
        setStatus('');
        const manual = document.createElement('div');
        manual.className = 'squat-manual';
        box.insertBefore(manual, status);
        para(manual, act.manualText || `Kolega hlídá pravidla a počítá jen platné dřepy. Klikni Start – hra odměří ${duration} s.`, 'muted');
        const clockP = para(manual, `${duration} s`, 'squat-clock');
        let iv = 0;
        const start = button(manual, 'Start', 'btn primary', () => {
          start.disabled = true;
          sound.sfx('reflexGo');
          const t0 = performance.now();
          iv = setInterval(() => {
            const left = duration - (performance.now() - t0) / 1000;
            clockP.textContent = `${Math.max(0, Math.ceil(left))} s`;
            if (left <= 0) {
              clearInterval(iv);
              sound.sfx('squatOk');
              const f = document.createElement('label');
              f.className = 'jump-field';
              const sp = document.createElement('span');
              sp.textContent = 'Počet platných dřepů';
              const inp = document.createElement('input');
              inp.type = 'number'; inp.inputMode = 'numeric'; inp.min = 0; inp.max = 99;
              f.append(sp, inp);
              manual.appendChild(f);
              button(manual, 'Hotovo', 'btn primary', () => {
                const n = Math.round(Number(inp.value));
                if (!inp.value || !Number.isFinite(n) || n < 0 || n > 99) { setStatus('Zadej počet platných dřepů (0–99).', 'bad'); return; }
                manual.remove();
                finish({ goblet_n: n, goblet_neplatne: null, goblet_kamera: 0, goblet_zatez: load, goblet_preskoceno: 0 }, `Platných dřepů: ${n}.`);
              });
              inp.focus();
            }
          }, 200);
        });
        activityCleanup = () => clearInterval(iv);
      });

      // --- nemohu cvičit ---
      button(btns, act.skipLabel || 'Nemohu cvičit', 'btn', () => {
        choice.hidden = true;
        finish({ goblet_n: null, goblet_neplatne: null, goblet_kamera: 0, goblet_zatez: load, goblet_preskoceno: 1 }, act.skipped || 'Dřep vynecháváš.');
      });
    });
  }

  /* Proč taková pravidla (simulace goblet dřepu): panáček z boku v dolní poloze – kyčel u lavičky ve výšce
     kolene. Hráč mění sklon bérce (kolena dopředu), předklon trupu a kettlebell u hrudníku. Kontroluje se:
     koleno a hlava za svislicí přes špičky a průmět společného těžiště nad chodidlem (na lavičku se jen
     dosedá – rovnováhu drží chodidla). Ukazují se momenty v koleni a v kyčli: tíha × vodorovná vzdálenost
     kloubu od svislice přes těžiště. Splněno, když platí všechna tři pravidla. Proměnné: goblet_sim, goblet_sim_kb. */
  function openGobletSim(act) {
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
    const M = act.bodyKg || 70, KBM = act.kbKg || 5;
    // délky v metrech (postava asi 175 cm): chodidlo 26 cm, bérec, stehno, trup, krk a hlava
    const TOE = 0.26, ANK = [0.07, 0.08], SHANK = 0.43, THIGH = 0.43, TRUNK = 0.52, NECK = 0.22, FACE = 0.07;
    const HIP_Y = act.hipY || 0.60;         // kyčelní kloub při dotyku lavičky (lavička ve výšce kolene 0,51 m)
    const KB_FWD = 0.25;                    // kettlebell před hrudníkem
    const COM_LO = 0.03, COM_HI = TOE - 0.03;
    const K = 230, X0 = 225, Y0 = 342;      // px na metr a počátek (pata, podlaha)
    const X = (x) => X0 + x * K, Y = (y) => Y0 - y * K;
    let shin = act.startShin ?? 34, trunk = act.startTrunk ?? 16, kb = false, done = false;

    const pose = () => {
      const a = shin * Math.PI / 180, b = trunk * Math.PI / 180;
      const knee = [ANK[0] + SHANK * Math.sin(a), ANK[1] + SHANK * Math.cos(a)];
      const dy = Math.max(-THIGH, Math.min(THIGH, HIP_Y - knee[1]));
      const hip = [knee[0] - Math.sqrt(THIGH * THIGH - dy * dy), knee[1] + dy];
      const u = [Math.sin(b), Math.cos(b)], fwd = [Math.cos(b), -Math.sin(b)];
      const sh = [hip[0] + TRUNK * u[0], hip[1] + TRUNK * u[1]];
      const head = [sh[0] + NECK * u[0], sh[1] + NECK * u[1]];
      const hands = [sh[0] - 0.15 * u[0] + KB_FWD * fwd[0], sh[1] - 0.15 * u[1] + KB_FWD * fwd[1]];
      const parts = [
        [0.08 * M, head], [0.50 * M, [hip[0] + 0.45 * TRUNK * u[0], hip[1] + 0.45 * TRUNK * u[1]]],
        [0.10 * M, [(sh[0] + hands[0]) / 2, (sh[1] + hands[1]) / 2]],
        [0.20 * M, [(knee[0] + hip[0]) / 2, (knee[1] + hip[1]) / 2]],
        [0.09 * M, [(ANK[0] + knee[0]) / 2, (ANK[1] + knee[1]) / 2]],
        [0.03 * M, [0.11, 0.04]],
      ];
      if (kb) parts.push([KBM, hands]);
      const mt = parts.reduce((s, p) => s + p[0], 0);
      const com = [parts.reduce((s, p) => s + p[0] * p[1][0], 0) / mt, parts.reduce((s, p) => s + p[0] * p[1][1], 0) / mt];
      const W = mt * g;
      const faceX = head[0] + FACE;
      return {
        knee, hip, sh, head, hands, com, mt, faceX,
        mk: W * Math.abs(knee[0] - com[0]), mh: W * Math.abs(hip[0] - com[0]),
        okKnee: knee[0] <= TOE, okHead: faceX <= TOE, okCom: com[0] >= COM_LO && com[0] <= COM_HI,
      };
    };

    openModal((box) => {
      box.classList.add('activity-box', 'pack-box');
      heading(box, act.title || 'Proč taková pravidla?');
      para(box, act.intro || '', 'question');
      const wrap = document.createElement('div');
      wrap.className = 'pack-wrap';
      box.appendChild(wrap);
      const svg = el('svg', { viewBox: '0 0 420 360', class: 'pack-svg' }, wrap);
      el('rect', { x: 0, y: 0, width: 420, height: 360, fill: 'rgba(0,0,0,0.25)', rx: 8 }, svg);
      // lavička ve výšce kolene za postavou
      el('rect', { x: X(-0.62), y: Y(0.51), width: (0.52) * K, height: 10, fill: '#6a4a2b', stroke: '#2d1f10' }, svg);
      el('rect', { x: X(-0.58), y: Y(0.51) + 10, width: 8, height: 0.51 * K - 10, fill: '#4a3420' }, svg);
      el('rect', { x: X(-0.17), y: Y(0.51) + 10, width: 8, height: 0.51 * K - 10, fill: '#4a3420' }, svg);
      el('text', { x: X(-0.36), y: Y(0.51) - 6, 'text-anchor': 'middle', 'font-size': 10, fill: '#d8cfae' }, svg, act.benchLabel || 'lavička – výška kolene');
      el('line', { x1: 0, y1: Y0, x2: 420, y2: Y0, stroke: '#5a4a30', 'stroke-width': 2 }, svg);
      const support = el('line', { x1: X(0), y1: Y0 + 4, x2: X(TOE), y2: Y0 + 4, 'stroke-width': 5, 'stroke-linecap': 'round' }, svg);
      const toeLine = el('line', { x1: X(TOE), y1: Y0, x2: X(TOE), y2: 8, 'stroke-width': 2, 'stroke-dasharray': '6 5' }, svg);
      el('text', { x: X(TOE) + 4, y: 20, 'font-size': 10, fill: '#d8cfae' }, svg, act.toeLabel || 'svislice špiček');
      const fig = el('g', {}, svg);
      const marks = el('g', { 'pointer-events': 'none' }, svg);

      const side = document.createElement('div');
      side.className = 'lift-side';
      wrap.appendChild(side);
      const slider = (min, max, get, set, label) => {
        const l = document.createElement('label');
        l.className = 'stance-slider';
        const t = document.createElement('span');
        const r = document.createElement('input');
        r.type = 'range'; r.min = min; r.max = max; r.step = 1; r.value = get();
        const upd = () => { t.textContent = label(get()); };
        r.addEventListener('input', () => { set(Number(r.value)); upd(); render(); });
        upd();
        l.append(t, r);
        side.appendChild(l);
      };
      slider(0, 40, () => shin, (v) => { shin = v; }, (v) => `${act.shinLabel || 'Kolena dopředu (sklon bérce)'}: ${v}°`);
      slider(0, 70, () => trunk, (v) => { trunk = v; }, (v) => `${act.trunkLabel || 'Předklon trupu'}: ${v}°`);
      const kbBtn = button(side, act.kbLabel || 'Kettlebell 5 kg u hrudníku', 'btn lift-posture', () => {
        kb = !kb;
        sound.sfx('step');
        render();
      });
      const checks = document.createElement('ul');
      checks.className = 'stance-results gsim-checks';
      side.appendChild(checks);
      const readout = document.createElement('div');
      readout.className = 'pack-readout';
      box.appendChild(readout);
      const status = para(box, '', 'feedback');
      const actions = document.createElement('div');
      actions.className = 'squat-buttons';
      box.appendChild(actions);

      const line = (a, b, w, c) => el('line', { x1: X(a[0]), y1: Y(a[1]), x2: X(b[0]), y2: Y(b[1]), stroke: c, 'stroke-width': w, 'stroke-linecap': 'round' }, fig);

      function render() {
        const p = pose();
        fig.innerHTML = '';
        marks.innerHTML = '';
        el('path', { d: `M${X(0)},${Y0} L${X(TOE)},${Y0} L${X(TOE) - 6},${Y0 - 8} L${X(ANK[0])},${Y(ANK[1]) - 4} L${X(0)},${Y0 - 10} Z`, fill: '#1c1915' }, fig);
        line(ANK, p.knee, 12, '#454c32');
        line(p.knee, p.hip, 14, '#4f5638');
        line(p.hip, p.sh, 20, '#566040');
        line(p.sh, p.hands, 7, '#c9b08a');
        el('circle', { cx: X(p.head[0]), cy: Y(p.head[1]), r: 0.1 * K, fill: '#6b6650', stroke: p.okHead ? 'none' : '#e0805f', 'stroke-width': 3 }, fig);
        el('circle', { cx: X(p.head[0]) + 0.06 * K, cy: Y(p.head[1]) - 3, r: 2.5, fill: '#1c1915' }, fig);
        if (kb) {
          el('circle', { cx: X(p.hands[0]), cy: Y(p.hands[1]) + 6, r: 13, fill: '#2a2a2a', stroke: '#111' }, fig);
          el('path', { d: `M${X(p.hands[0]) - 8},${Y(p.hands[1]) - 4} q8,-14 16,0`, fill: 'none', stroke: '#2a2a2a', 'stroke-width': 4 }, fig);
        }
        el('circle', { cx: X(p.knee[0]), cy: Y(p.knee[1]), r: 5, fill: p.okKnee ? '#ffd28a' : '#e0805f' }, marks);
        // společné těžiště a jeho průmět
        const cx = X(p.com[0]), cy = Y(p.com[1]);
        el('line', { x1: cx, y1: cy, x2: cx, y2: Y0, stroke: '#ffd28a', 'stroke-width': 1.5, 'stroke-dasharray': '4 4' }, marks);
        el('circle', { cx, cy, r: 8, fill: 'none', stroke: '#ffd28a', 'stroke-width': 2 }, marks);
        el('path', { d: `M${cx - 8},${cy} L${cx + 8},${cy} M${cx},${cy - 8} L${cx},${cy + 8}`, stroke: '#ffd28a', 'stroke-width': 1.5 }, marks);
        el('circle', { cx, cy: Y0, r: 4, fill: p.okCom ? '#9fbf7a' : '#e0805f' }, marks);
        support.setAttribute('stroke', p.okCom ? '#9fbf7a' : '#e0805f');
        toeLine.setAttribute('stroke', p.okKnee && p.okHead ? '#9fbf7a' : '#e0805f');
        kbBtn.classList.toggle('selected', kb);
        checks.innerHTML = '';
        for (const [ok, text] of [
          [p.okKnee, act.checkKnee || 'Kolena za špičkami'],
          [p.okHead, act.checkHead || 'Hlava za špičkami'],
          [p.okCom, act.checkCom || 'Těžiště nad chodidlem (jen dotyk lavičky)'],
        ]) {
          const li = document.createElement('li');
          li.className = ok ? 'ok' : 'bad';
          li.textContent = `${ok ? '✓' : '✗'} ${text}`;
          checks.appendChild(li);
        }
        readout.innerHTML = '';
        for (const [k, v] of [
          [`Hmotnost (${kb ? `s kettlebellem ${KBM} kg` : 'bez závaží'})`, `${fmt(p.mt)} kg`],
          ['Moment v koleni', `${fmt(p.mk)} N·m`],
          ['Moment v kyčli a zádech', `${fmt(p.mh)} N·m`],
          ['Těžiště od paty', `${fmt(p.com[0] * 100)} cm (chodidlo 0–${fmt(TOE * 100)} cm)`],
        ]) {
          const d = document.createElement('div');
          const a = document.createElement('span'); a.textContent = k;
          const b = document.createElement('strong'); b.textContent = v;
          d.append(a, b);
          readout.appendChild(d);
        }
        const all = p.okKnee && p.okHead && p.okCom;
        if (all && !done) {
          done = true;
          sound.sfx('unlock');
          button(actions, 'Pokračovat ›', 'btn activity-next', () => finishActivity(act, { goblet_sim: 1, goblet_sim_kb: kb ? 1 : 0 }));
        }
        if (all) {
          status.textContent = kb ? (act.success || 'Platí všechna pravidla.') : (act.successNoKb || act.success || 'Platí všechna pravidla.');
          status.className = 'feedback good';
        } else {
          status.textContent = !p.okCom ? (p.com[0] < COM_LO ? (act.tipBack || 'Těžiště je za patou – spadl bys dozadu na lavičku.') : (act.tipFront || 'Těžiště je před špičkami.'))
            : !p.okKnee ? (act.tipKnee || 'Koleno je před špičkou.') : (act.tipHead || 'Hlava je před špičkou.');
          status.className = 'feedback bad';
        }
      }
      render();
    });
  }

  /* Kliky na decimální váze: voják v poloze kliku z boku, špičky na zemi = osa otáčení, ruce na plošině
     decimální váhy (1 : 10). Hráč věší závaží na vahadlo, až se vyrovná: plošina nese
     F = Σ m·x / b (rovnováha momentů kolem špiček; x = vodorovná vzdálenost těžiště od špiček).
     Kola „rounds“ (např. klik, klik s batohem): { name, text, bodyKg, comM, handsM, extra: [{ label, kg, atM }],
     success, var }. Vyrovnáno, když se závaží × 10 liší od zatížení nejvýš o „toleranceKg“.
     Proměnné: <var>_kg a <var>_procent pro každé kolo. */
  function openPushup(act) {
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
    const tol = act.toleranceKg || 0.6;
    const weights = act.weights || [2, 1, 0.5, 0.2, 0.1];
    const K = 260, X0 = 40, Y0 = 268;
    const X = (x) => X0 + x * K, Y = (y) => Y0 - y * K;
    const PLAT = 0.10, SHOULDER = 0.68;           // výška plošiny a ramen nad zemí (m)
    let idx = 0, hung = [], balanced = false;
    const out = {};

    openModal((box) => {
      box.classList.add('activity-box', 'pack-box');
      heading(box, act.title || 'Kliky na decimální váze');
      para(box, act.intro || '', 'question');
      const info = para(box, '', 'lean-step');
      const wrap = document.createElement('div');
      wrap.className = 'pack-wrap';
      box.appendChild(wrap);
      const svg = el('svg', { viewBox: '0 0 600 320', class: 'pack-svg' }, wrap);
      const side = document.createElement('div');
      side.className = 'lift-side';
      wrap.appendChild(side);
      para(side, act.weightsLabel || 'Závaží na háček vahadla (1 kg vyváží 10 kg na plošině):', 'muted');
      const wbtns = document.createElement('div');
      wbtns.className = 'pushup-weights';
      side.appendChild(wbtns);
      for (const w of weights) {
        button(wbtns, `+${fmt(w, w < 1 ? 1 : 0)} kg`, 'btn', () => {
          if (balanced) return;
          hung.push(w);
          sound.sfx('key');
          render();
        });
      }
      const rm = button(side, act.removeLabel || 'Sundat poslední', 'btn', () => {
        if (balanced || !hung.length) return;
        hung.pop();
        sound.sfx('key');
        render();
      });
      const readout = document.createElement('div');
      readout.className = 'pack-readout';
      box.appendChild(readout);
      const status = para(box, '', 'feedback');
      const actions = document.createElement('div');
      actions.className = 'squat-buttons';
      box.appendChild(actions);

      const round = () => act.rounds[idx];
      const load = () => {
        const r = round();
        const mom = r.bodyKg * r.comM + (r.extra || []).reduce((s, e) => s + e.kg * e.atM, 0);
        return mom / r.handsM;
      };
      const sum = () => Math.round(hung.reduce((s, w) => s + w, 0) * 10) / 10;

      function render() {
        const r = round();
        info.textContent = `Kolo ${idx + 1}/${act.rounds.length}: ${r.name}`;
        svg.innerHTML = '';
        el('rect', { x: 0, y: 0, width: 600, height: 320, fill: 'rgba(0,0,0,0.25)', rx: 8 }, svg);
        el('line', { x1: 0, y1: Y0, x2: 600, y2: Y0, stroke: '#5a4a30', 'stroke-width': 2 }, svg);
        const b = r.handsM;
        const bodyY = (x) => 0.05 + (x / b) * (SHOULDER - 0.05);
        // decimální váha: plošina pod rukama, sloupek, vahadlo s háčkem
        el('rect', { x: X(b - 0.13), y: Y(PLAT), width: 0.26 * K, height: PLAT * K, fill: '#5d6066', stroke: '#2a2c30', 'stroke-width': 2, rx: 2 }, svg);
        const px = b + 0.22;
        el('rect', { x: X(px) - 4, y: Y(0.62), width: 8, height: 0.62 * K, fill: '#4a4d52' }, svg);
        const diff = sum() * 10 - load();
        const tilt = Math.max(-1, Math.min(1, diff / (0.25 * load()))) * 12;
        const beam = el('g', { transform: `rotate(${tilt} ${X(px)} ${Y(0.62)})` }, svg);
        el('rect', { x: X(px) - 0.06 * K, y: Y(0.62) - 3, width: 0.40 * K, height: 6, fill: '#8a8f96', rx: 2 }, beam);
        const hx = X(px + 0.33);
        el('line', { x1: hx, y1: Y(0.62), x2: hx, y2: Y(0.62) + 16, stroke: '#8a8f96', 'stroke-width': 2 }, beam);
        let wy = Y(0.62) + 16;
        for (const w of hung) {
          const hh = 4 + w * 5;
          el('rect', { x: hx - 9, y: wy, width: 18, height: hh, fill: '#b08a3a', stroke: '#4a3818', rx: 1 }, beam);
          wy += hh + 1;
        }
        el('circle', { cx: X(px), cy: Y(0.62), r: 5, fill: '#2a2c30' }, svg);
        // ukazatel rovnováhy
        el('path', { d: `M${X(px) + 0.30 * K},${Y(0.62) - 34} l-6,-10 h12 z`, fill: Math.abs(diff) <= tol ? '#9fbf7a' : '#e0805f' }, svg);
        // voják: špičky, trup, hlava, paže na plošině
        el('line', { x1: X(0), y1: Y(0.05), x2: X(b), y2: Y(SHOULDER), stroke: '#4f5638', 'stroke-width': 18, 'stroke-linecap': 'round' }, svg);
        el('circle', { cx: X(b + 0.13), cy: Y(SHOULDER + 0.04), r: 0.1 * K, fill: '#6b6650' }, svg);
        el('line', { x1: X(b), y1: Y(SHOULDER), x2: X(b), y2: Y(PLAT), stroke: '#c9b08a', 'stroke-width': 9, 'stroke-linecap': 'round' }, svg);
        el('path', { d: `M${X(-0.02)},${Y0} l16,-12 l4,12 z`, fill: '#1c1915' }, svg);
        for (const e of r.extra || []) {
          el('rect', { x: X(e.atM) - 0.11 * K, y: Y(bodyY(e.atM)) - 0.17 * K, width: 0.22 * K, height: 0.16 * K, fill: '#5b5a3a', stroke: '#2a2a18', 'stroke-width': 2, rx: 4 }, svg);
          el('text', { x: X(e.atM), y: Y(bodyY(e.atM)) - 0.07 * K, 'text-anchor': 'middle', 'font-size': 10, fill: '#e8e0c4' }, svg, `${e.kg} kg`);
        }
        const cx = X(r.comM), cy = Y(bodyY(r.comM));
        el('circle', { cx, cy, r: 8, fill: 'none', stroke: '#ffd28a', 'stroke-width': 2 }, svg);
        el('path', { d: `M${cx - 8},${cy} L${cx + 8},${cy} M${cx},${cy - 8} L${cx},${cy + 8}`, stroke: '#ffd28a', 'stroke-width': 1.5 }, svg);
        el('text', { x: cx, y: cy - 14, 'text-anchor': 'middle', 'font-size': 11, fill: '#ffd28a' }, svg, `${r.bodyKg} kg`);
        // kóty od špiček (osa otáčení)
        const dims = [[r.comM, '#ffd28a'], ...(r.extra || []).map((e) => [e.atM, '#c8c49a']), [b, '#e8e0c4']];
        dims.forEach(([x, c], i) => {
          const y = Y0 + 12 + i * 13;
          el('line', { x1: X(0), y1: y, x2: X(x), y2: y, stroke: c, 'stroke-width': 1 }, svg);
          el('line', { x1: X(x), y1: Y0, x2: X(x), y2: y + 2, stroke: c, 'stroke-width': 1, 'stroke-dasharray': '2 3' }, svg);
          el('text', { x: X(x) + 4, y: y + 4, 'font-size': 10, fill: c }, svg, `${fmt(x, 2)} m`);
        });
        el('text', { x: X(0) - 4, y: Y0 - 14, 'text-anchor': 'middle', 'font-size': 10, fill: '#d8cfae' }, svg, 'osa');
        readout.innerHTML = '';
        for (const [k, v] of [
          ['Závaží na háčku', `${fmt(sum(), 1)} kg`],
          ['Vyváží na plošině', `${fmt(sum() * 10, 0)} kg`],
        ]) {
          const d = document.createElement('div');
          const a = document.createElement('span'); a.textContent = k;
          const bb = document.createElement('strong'); bb.textContent = v;
          d.append(a, bb);
          readout.appendChild(d);
        }
        rm.disabled = balanced || !hung.length;
        if (balanced) return;
        if (Math.abs(diff) <= tol) {
          balanced = true;
          sound.sfx('unlock');
          const F = load();
          const pct = Math.round(F / (r.bodyKg + (r.extra || []).reduce((s, e) => s + e.kg, 0)) * 100);
          out[`${r.var}_kg`] = Math.round(F * 10) / 10;
          out[`${r.var}_procent`] = pct;
          const terms = [`${r.bodyKg} · ${fmt(r.comM, 2)}`, ...(r.extra || []).map((e) => `${e.kg} · ${fmt(e.atM, 2)}`)].join(' + ');
          status.textContent = `${r.success || 'Váha je vyrovnaná.'} Ruce nesou ${fmt(F, 1)} kg – ${pct} % hmotnosti. Momenty kolem špiček: (${terms}) · g = F · ${fmt(b, 2)} → F ≈ ${fmt(F * g)} N.`;
          status.className = 'feedback good';
          rm.disabled = true;
          const last = idx + 1 >= act.rounds.length;
          button(actions, last ? 'Pokračovat ›' : 'Další kolo ›', last ? 'btn activity-next' : 'btn primary', () => {
            actions.innerHTML = '';
            if (last) { finishActivity(act, out); return; }
            idx += 1;
            hung = [];
            balanced = false;
            status.textContent = round().text || '';
            status.className = 'feedback';
            render();
          });
        } else {
          status.textContent = hung.length ? (diff < 0 ? (act.tipMore || 'Plošina je těžší – přidej závaží.') : (act.tipLess || 'Závaží převažuje – uber.')) : (round().text || '');
          status.className = 'feedback';
        }
      }
      status.textContent = round().text || '';
      render();
    });
  }

  /* ---------- Noční cvičiště: společné drobnosti ---------- */

  /* Dosazení místních hodnot do textu: {front}, {t:1} (desetinná místa). */
  function tplLocal(text, vals) {
    const fmt = (v, d) => v.toFixed(d).replace('.', ',');
    return String(text || '').replace(/\{(\w+)(?::(\d))?\}/g, (m, k, d) => {
      if (!(k in vals)) return m;
      const v = vals[k];
      return typeof v === 'number' ? fmt(v, d ? Number(d) : 0) : String(v);
    });
  }

  function readoutRows(readout, rows) {
    readout.innerHTML = '';
    for (const [k, v] of rows) {
      const d = document.createElement('div');
      const a = document.createElement('span'); a.textContent = k;
      const b = document.createElement('strong'); b.textContent = v;
      d.append(a, b);
      readout.appendChild(d);
    }
  }

  /* Nosítka (noční cvičiště): dva nosiči, raněný na nosítkách. Rovnováha momentů kolem rukou
     zadního nosiče: F_přední · L = m_r · g · x + m_n · g · L/2 (x = těžiště raněného od zadních
     rukou, nosítka mají těžiště uprostřed). Hráč táhne raněného po nosítkách; kola „rounds“:
     { name, text, goal: "equal" | "rearMax", rearMaxN, tolN, success, fail, var }.
     Proměnné: <var>_predni, <var>_zadni (N), <var>_x (m), nositka_hotovo. */
  function openStretcher(act) {
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
    const L = act.lengthM || 2.4, mp = act.patientKg || 80, ms = act.stretcherKg || 9;
    const H = act.patientHeightM || 1.8, comFrac = act.comFrac || 0.56;
    const xMin = act.xMin || 0.85, xMax = act.xMax || 1.55;
    const names = act.carriers || { front: 'přední (ty)', rear: 'zadní (rtn. Doubek)' };
    const K = 150, X0 = 90, GY = 270, SY = 165;    // px na m, zadní ruce, země, výška nosítek
    const X = (m) => X0 + m * K;
    let idx = 0, x = act.xStart || 1.31, done = false;
    const out = { nositka_hotovo: 1 };

    const forces = () => {
      const wp = mp * g, ws = ms * g;
      const front = (wp * x + ws * L / 2) / L;
      return { wp, ws, front, rear: wp + ws - front, x };
    };

    openModal((box) => {
      box.classList.add('activity-box', 'pack-box');
      heading(box, act.title || 'Nosítka');
      para(box, act.intro || '', 'question');
      const info = para(box, '', 'lean-step');
      const wrap = document.createElement('div');
      wrap.className = 'pack-wrap';
      box.appendChild(wrap);
      const svg = el('svg', { viewBox: '0 0 600 300', class: 'pack-svg' }, wrap);
      const side = document.createElement('div');
      side.className = 'lift-side';
      wrap.appendChild(side);
      const roundText = para(side, '', 'muted');
      para(side, act.dragHint || 'Raněného táhni myší nebo prstem po nosítkách (nebo šipkami).', 'muted small');
      const readout = document.createElement('div');
      readout.className = 'pack-readout';
      box.appendChild(readout);
      const eq = para(box, '', 'muted small');
      const status = para(box, '', 'feedback');
      const actions = document.createElement('div');
      actions.className = 'squat-buttons';
      box.appendChild(actions);
      const lift = button(actions, act.liftLabel || 'Zvednout', 'btn primary', () => tryLift());
      const round = () => act.rounds[idx];

      const figure = (xc, handX, label, color) => {
        const line = (a, b, w, c) => el('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: c, 'stroke-width': w, 'stroke-linecap': 'round' }, svg);
        line([xc, GY], [xc, 200], 12, '#454c32');
        line([xc, 200], [xc, 140], 16, color);
        el('circle', { cx: xc, cy: 122, r: 13, fill: '#6b6650' }, svg);
        line([xc, 150], [handX, SY], 7, '#c9b08a');
        el('text', { x: xc, y: GY + 16, 'text-anchor': 'middle', 'font-size': 11, fill: '#d8cfae' }, svg, label);
      };
      const arrow = (ax, F, color, label) => {
        const len = Math.max(10, F / 6);
        const y1 = SY - 4, y2 = SY - 4 - len;
        el('line', { x1: ax, y1, x2: ax, y2: y2 + 6, stroke: color, 'stroke-width': 3 }, svg);
        el('path', { d: `M${ax - 6},${y2 + 8} L${ax},${y2} L${ax + 6},${y2 + 8} Z`, fill: color }, svg);
        el('text', { x: ax, y: y2 - 5, 'text-anchor': 'middle', 'font-size': 11, fill: color }, svg, label);
      };

      function render() {
        const r = round();
        const f = forces();
        info.textContent = `Kolo ${idx + 1}/${act.rounds.length}: ${r.name}`;
        svg.innerHTML = '';
        el('rect', { x: 0, y: 0, width: 600, height: 300, fill: 'rgba(0,0,0,0.25)', rx: 8 }, svg);
        el('line', { x1: 0, y1: GY, x2: 600, y2: GY, stroke: '#5a4a30', 'stroke-width': 2 }, svg);
        figure(X0 - 24, X0, names.rear, '#4f5638');
        figure(X(L) + 24, X(L), names.front, '#5a6240');
        // nosítka: tyče a plachta
        el('line', { x1: X0 - 6, y1: SY, x2: X(L) + 6, y2: SY, stroke: '#6a4a2b', 'stroke-width': 5, 'stroke-linecap': 'round' }, svg);
        el('rect', { x: X(0.12), y: SY - 8, width: (L - 0.24) * K, height: 12, rx: 3, fill: '#3f4a36', stroke: '#2a3024', 'stroke-width': 1.5 }, svg);
        // raněný (hlavou k přednímu nosiči)
        const feet = x - comFrac * H, head = x + (1 - comFrac) * H;
        const pg = el('g', { class: 'stretcher-patient' }, svg);
        el('rect', { x: X(feet), y: SY - 22, width: (x - 0.1 - feet) * K, height: 14, rx: 6, fill: '#5b5a3a', stroke: '#2a2a18', 'stroke-width': 1.5 }, pg);
        el('rect', { x: X(x - 0.1), y: SY - 28, width: (head - 0.22 - (x - 0.1)) * K, height: 20, rx: 7, fill: '#6a6a48', stroke: '#2a2a18', 'stroke-width': 1.5 }, pg);
        el('circle', { cx: X(head - 0.11), cy: SY - 18, r: 0.11 * K, fill: '#c9b08a', stroke: '#2a2a18', 'stroke-width': 1.5 }, pg);
        el('rect', { x: X(feet) - 4, y: SY - 40, width: (head - feet) * K + 8, height: 40, fill: 'transparent' }, pg);   // úchop
        const cx = X(x), cy = SY - 18;
        el('circle', { cx, cy, r: 7, fill: 'none', stroke: '#ffd28a', 'stroke-width': 2 }, pg);
        el('path', { d: `M${cx - 7},${cy} L${cx + 7},${cy} M${cx},${cy - 7} L${cx},${cy + 7}`, stroke: '#ffd28a', 'stroke-width': 1.5 }, pg);
        el('text', { x: cx, y: cy - 34, 'text-anchor': 'middle', 'font-size': 11, fill: '#ffd28a' }, svg, `těžiště ${mp} kg`);
        // síly nosičů
        arrow(X0, f.rear, '#e0b070', `${fmt(f.rear)} N`);
        arrow(X(L), f.front, '#9fd0a0', `${fmt(f.front)} N`);
        // osa a kóty
        el('circle', { cx: X0, cy: SY, r: 5, fill: '#ffd28a', stroke: '#1a1a16' }, svg);
        el('text', { x: X0, y: SY + 18, 'text-anchor': 'middle', 'font-size': 10, fill: '#d8cfae' }, svg, 'osa');
        const dim = (x2, y, c, label) => {
          el('line', { x1: X0, y1: y, x2, y2: y, stroke: c, 'stroke-width': 1 }, svg);
          el('line', { x1: x2, y1: SY + 6, x2, y2: y + 3, stroke: c, 'stroke-width': 1, 'stroke-dasharray': '2 3' }, svg);
          el('text', { x: (X0 + x2) / 2, y: y - 3, 'text-anchor': 'middle', 'font-size': 10, fill: c }, svg, label);
        };
        dim(X(x), 206, '#ffd28a', `x = ${fmt(x, 2)} m`);
        dim(X(L), 228, '#e8e0c4', `L = ${fmt(L, 2)} m`);
        readoutRows(readout, [
          [`Tíha raněného (${mp} kg)`, `${fmt(f.wp, 1)} N`],
          [`Tíha nosítek (${ms} kg, těžiště uprostřed)`, `${fmt(f.ws, 1)} N`],
          ['Těžiště raněného od zadních rukou', `${fmt(x, 2)} m`],
          ['Přední nosič', `${fmt(f.front)} N ≈ ${fmt(f.front / g, 1)} kg`],
          ['Zadní nosič', `${fmt(f.rear)} N ≈ ${fmt(f.rear / g, 1)} kg`],
          ['Dohromady', `${fmt(f.wp + f.ws)} N`],
        ]);
        eq.textContent = `Momenty kolem zadních rukou: F · ${fmt(L, 2)} m = ${fmt(f.wp, 1)} N · ${fmt(x, 2)} m + ${fmt(f.ws, 1)} N · ${fmt(L / 2, 2)} m → F (přední) ≈ ${fmt(f.front)} N, zadní nese zbytek.`;
        lift.disabled = done;
      }

      function tryLift() {
        const r = round();
        const f = forces();
        const vals = { front: f.front, rear: f.rear, x, frontKg: f.front / g, rearKg: f.rear / g, diff: Math.abs(f.front - f.rear) };
        let ok;
        if (r.goal === 'rearMax') ok = f.rear <= r.rearMaxN;
        else if (r.goal === 'frontMax') ok = f.front <= r.frontMaxN;
        else ok = Math.abs(f.front - f.rear) <= (r.tolN || 20);
        if (!ok) {
          sound.sfx('wrong');
          status.textContent = tplLocal(r.fail || act.fail || 'Přední nese {front} N, zadní {rear} N. Posuň raněného.', vals);
          status.className = 'feedback bad';
          return;
        }
        done = true;
        sound.sfx('unlock');
        const v = r.var || 'nositka';
        out[`${v}_predni`] = Math.round(f.front);
        out[`${v}_zadni`] = Math.round(f.rear);
        out[`${v}_x`] = Math.round(x * 100) / 100;
        status.textContent = tplLocal(r.success || 'Zvednuto.', vals);
        status.className = 'feedback good';
        const last = idx + 1 >= act.rounds.length;
        lift.hidden = true;
        button(actions, last ? 'Pokračovat ›' : 'Další kolo ›', last ? 'btn activity-next' : 'btn primary', () => {
          if (last) { finishActivity(act, out); return; }
          actions.lastChild.remove();
          idx += 1;
          done = false;
          lift.hidden = false;
          if (round().xStart) x = round().xStart;
          roundText.textContent = round().text || '';
          status.textContent = '';
          status.className = 'feedback';
          render();
        });
        render();
      }

      // tažení raněného
      let dragging = false, grab = 0;
      const toM = (e) => {
        const b = svg.getBoundingClientRect();
        return (((e.clientX - b.left) / b.width) * 600 - X0) / K;
      };
      const setX = (v) => { x = Math.max(xMin, Math.min(xMax, Math.round(v * 100) / 100)); render(); };
      svg.addEventListener('pointerdown', (e) => {
        if (done || !e.target.closest('.stretcher-patient')) return;
        e.preventDefault();
        dragging = true;
        grab = x - toM(e);
        svg.setPointerCapture(e.pointerId);
      });
      svg.addEventListener('pointermove', (e) => { if (dragging) setX(toM(e) + grab); });
      const up = () => { dragging = false; };
      svg.addEventListener('pointerup', up);
      svg.addEventListener('pointercancel', up);
      svg.tabIndex = 0;
      svg.addEventListener('keydown', (e) => {
        if (done) return;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          setX(x + (e.key === 'ArrowLeft' ? -0.01 : 0.01));
        }
      });
      roundText.textContent = round().text || '';
      render();
    });
  }

  /* Protizávaží u přilby (noční cvičiště): noktovizor vpředu před osou otáčení hlavy (kloub lebka –
     atlas) táhne hlavu dopředu momentem m · g · d; protizávaží vzadu ho vyrovná, když
     m_p · d_p = m_n · d_n. Co zbývá, drží šíjové svaly (rameno „muscleArmCm“ za osou). Kola „rounds“:
     { name, text, dc (pevná poloha v cm; bez ní volná, začíná na dcStart), goal: "balance" |
     "lightest", success, var }. Proměnné: <var>_kg, <var>_cm, prilba_f0 (síla šíje bez protizávaží
     v N), prilba_hotovo. */
  function openHelmet(act) {
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
    const nvgKg = act.nvgKg || 0.7, nvgCm = act.nvgCm || 12, armCm = act.muscleArmCm || 5;
    const headKg = act.headKg || 4.5, helmetKg = act.helmetKg || 1.4;
    const dcMin = act.dcMin || 5, dcMax = act.dcMax || 15;
    const mMax = act.massMax || 1.5, mStep = act.massStep || 0.05;
    const tol = act.toleranceNm || 0.05;
    const K = 10;                                    // px na cm
    const P = { x: 235, y: 200 };                    // osa otáčení hlavy (kloub lebka – atlas)
    let idx = 0, mc = 0, dc = act.rounds[0].dc || act.rounds[0].dcStart || dcMax, done = false;
    const out = { prilba_hotovo: 1, prilba_f0: Math.round(nvgKg * g * nvgCm / armCm) };

    const moments = () => {
      const mn = nvgKg * g * nvgCm / 100;          // N·m, táhne hlavu dopředu
      const mpz = mc * g * dc / 100;               // N·m, táhne dozadu
      const net = mn - mpz;
      return { mn, mp: mpz, net, f: Math.abs(net) / (armCm / 100), total: headKg + helmetKg + nvgKg + mc };
    };

    openModal((box) => {
      box.classList.add('activity-box', 'pack-box');
      heading(box, act.title || 'Přilba s noktovizorem');
      para(box, act.intro || '', 'question');
      const info = para(box, '', 'lean-step');
      const wrap = document.createElement('div');
      wrap.className = 'pack-wrap';
      box.appendChild(wrap);
      const svg = el('svg', { viewBox: '0 0 420 300', class: 'pack-svg' }, wrap);
      const side = document.createElement('div');
      side.className = 'lift-side';
      wrap.appendChild(side);
      const roundText = para(side, '', 'muted');
      const slider = (min, max, step, get, set, label) => {
        const l = document.createElement('label');
        l.className = 'stance-slider';
        const t = document.createElement('span');
        const r = document.createElement('input');
        r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = get();
        const upd = () => { t.textContent = label(get()); r.value = get(); };
        r.addEventListener('input', () => { if (done) return; set(Number(r.value)); upd(); render(); });
        upd();
        l.append(t, r);
        side.appendChild(l);
        return { input: r, upd };
      };
      const mS = slider(0, mMax, mStep, () => mc, (v) => { mc = v; }, (v) => `${act.massLabel || 'Protizávaží'}: ${fmt(v, 2)} kg`);
      const dS = slider(dcMin, dcMax, 1, () => dc, (v) => { dc = v; }, (v) => `${act.distLabel || 'Protizávaží za osou'}: ${v} cm`);
      para(side, act.dragHint || 'Váček s protizávažím můžeš i táhnout myší nebo prstem.', 'muted small');
      const readout = document.createElement('div');
      readout.className = 'pack-readout';
      box.appendChild(readout);
      const eq = para(box, '', 'muted small');
      const status = para(box, '', 'feedback');
      const actions = document.createElement('div');
      actions.className = 'squat-buttons';
      box.appendChild(actions);
      const fit = button(actions, act.fitLabel || 'Nasadit přilbu', 'btn primary', () => tryFit());
      const round = () => act.rounds[idx];

      function render() {
        const r = round();
        const m = moments();
        info.textContent = `Kolo ${idx + 1}/${act.rounds.length}: ${r.name}`;
        dS.input.disabled = Boolean(r.dc) || done;
        mS.input.disabled = done;
        svg.innerHTML = '';
        el('rect', { x: 0, y: 0, width: 420, height: 300, fill: 'rgba(0,0,0,0.25)', rx: 8 }, svg);
        // ramena a krk
        el('path', { d: 'M120,300 C150,262 190,250 222,246 L248,246 C280,250 320,262 350,300 Z', fill: '#4f5638' }, svg);
        const tilt = Math.max(-14, Math.min(14, m.net * 18));      // bez svalů by se hlava naklonila
        const hg = el('g', { transform: `rotate(${tilt} ${P.x} ${P.y})` }, svg);
        el('path', { d: `M${P.x - 14},${P.y + 48} L${P.x - 10},${P.y - 10} L${P.x + 14},${P.y - 10} L${P.x + 18},${P.y + 48} Z`, fill: '#c9b08a' }, hg);   // krk
        // hlava z profilu (čelem doprava)
        el('path', { d: `M${P.x - 40},${P.y + 10} C${P.x - 60},${P.y - 50} ${P.x - 30},${P.y - 100} ${P.x + 20},${P.y - 100} C${P.x + 70},${P.y - 100} ${P.x + 88},${P.y - 60} ${P.x + 80},${P.y - 30} L${P.x + 92},${P.y - 10} L${P.x + 78},${P.y - 4} L${P.x + 76},${P.y + 14} C${P.x + 60},${P.y + 30} ${P.x + 20},${P.y + 30} ${P.x - 10},${P.y + 18} Z`, fill: '#d8b98f', stroke: '#5a4a30', 'stroke-width': 1.5 }, hg);
        el('circle', { cx: P.x + 58, cy: P.y - 40, r: 3.5, fill: '#2a2418' }, hg);                 // oko
        el('path', { d: `M${P.x + 10},${P.y + 10} q10,6 24,0`, fill: 'none', stroke: '#5a4a30', 'stroke-width': 1.5 }, hg);   // ústa
        // přilba
        el('path', { d: `M${P.x - 62},${P.y - 36} C${P.x - 66},${P.y - 110} ${P.x + 70},${P.y - 125} ${P.x + 90},${P.y - 48} L${P.x + 100},${P.y - 42} L${P.x - 70},${P.y - 30} Z`, fill: '#56613f', stroke: '#2f3626', 'stroke-width': 2 }, hg);
        // noktovizor na držáku vpředu
        const nx = P.x + nvgCm * K;
        el('rect', { x: P.x + 60, y: P.y - 62, width: nx - P.x - 60, height: 6, fill: '#2a2a22' }, hg);
        el('rect', { x: nx - 14, y: P.y - 72, width: 28, height: 44, rx: 4, fill: '#1f2b1f', stroke: '#0f150f', 'stroke-width': 2 }, hg);
        el('circle', { cx: nx, cy: P.y - 36, r: 7, fill: '#0f150f', stroke: '#7dd37a', 'stroke-width': 1.5 }, hg);
        el('text', { x: nx, y: P.y - 80, 'text-anchor': 'middle', 'font-size': 10, fill: '#d8cfae' }, hg, `${fmt(nvgKg, 1)} kg`);
        // váček s protizávažím vzadu
        const px = P.x - dc * K;
        const pg = el('g', { class: 'helmet-pouch' }, hg);
        el('rect', { x: px, y: P.y - 50, width: P.x - 50 - px, height: 5, fill: '#2a2a22' }, pg);
        const ph = 14 + mc * 22;
        el('rect', { x: px - 12, y: P.y - 52, width: 24, height: ph, rx: 4, fill: '#6a6a48', stroke: '#2a2a18', 'stroke-width': 1.5 }, pg);
        el('rect', { x: px - 20, y: P.y - 70, width: 40, height: ph + 30, fill: 'transparent' }, pg);   // úchop
        el('text', { x: px, y: P.y - 58, 'text-anchor': 'middle', 'font-size': 10, fill: '#d8cfae' }, hg, `${fmt(mc, 2)} kg`);
        // osa a kóty (neotáčejí se)
        el('circle', { cx: P.x, cy: P.y, r: 5, fill: '#ffd28a', stroke: '#1a1a16' }, svg);
        el('text', { x: P.x, y: 293, 'text-anchor': 'middle', 'font-size': 10, fill: '#d8cfae' }, svg, 'osa otáčení hlavy (kloub lebka – atlas)');
        const dim = (x2, y, c, label, anchor) => {
          el('line', { x1: P.x, y1: y, x2, y2: y, stroke: c, 'stroke-width': 1 }, svg);
          el('line', { x1: x2, y1: y - 6, x2, y2: y + 6, stroke: c, 'stroke-width': 1 }, svg);
          el('text', { x: (P.x + x2) / 2, y: y - 4, 'text-anchor': anchor || 'middle', 'font-size': 10, fill: c }, svg, label);
        };
        dim(nx, 272, '#e0b070', `${nvgCm} cm`);
        dim(px, 272, '#9fd0a0', `${dc} cm`);
        // šíjové svaly: tah dolů za osou (rameno armCm)
        const fx = P.x - armCm * K;
        const w = 2 + Math.min(10, m.f / 6);
        el('line', { x1: fx, y1: P.y + 6, x2: fx - 8, y2: P.y + 46, stroke: m.f > 2 ? '#c0504a' : '#7a6a60', 'stroke-width': w, 'stroke-linecap': 'round' }, svg);
        el('text', { x: fx - 16, y: P.y + 36, 'text-anchor': 'end', 'font-size': 10, fill: '#e8e0c4' }, svg, `šíje ${fmt(m.f)} N`);
        // ukazatel: zelená = vyváženo
        el('circle', { cx: 396, cy: 24, r: 9, fill: Math.abs(m.net) <= tol ? '#9fbf7a' : '#e0805f', stroke: '#1a1a16' }, svg);
        el('text', { x: 383, y: 28, 'text-anchor': 'end', 'font-size': 11, fill: '#d8cfae' }, svg, Math.abs(m.net) <= tol ? 'vyváženo' : (m.net > 0 ? 'padá dopředu' : 'padá dozadu'));
        readoutRows(readout, [
          [`Moment noktovizoru (${fmt(nvgKg, 1)} kg · ${nvgCm} cm)`, `${fmt(m.mn, 2)} N·m dopředu`],
          [`Moment protizávaží (${fmt(mc, 2)} kg · ${dc} cm)`, `${fmt(m.mp, 2)} N·m dozadu`],
          [`Zbývá na šíjové svaly (rameno ${armCm} cm)`, `${fmt(Math.abs(m.net), 2)} N·m → F ≈ ${fmt(m.f)} N`],
          ['Celkem na krční páteři (hlava + přilba + výstroj)', `${fmt(m.total, 2)} kg`],
        ]);
        eq.textContent = `Vyváženo, když m · d protizávaží = m · d noktovizoru: ${fmt(nvgKg, 1)} kg · ${nvgCm} cm = ${fmt(nvgKg * nvgCm, 1)} kg·cm. Při ${dc} cm to je ${fmt(nvgKg * nvgCm / dc, 2)} kg.`;
        fit.disabled = done;
      }

      function tryFit() {
        const r = round();
        const m = moments();
        const vals = { mc, dc, f: m.f, f0: out.prilba_f0, net: Math.abs(m.net), total: m.total, need: nvgKg * nvgCm / dc, dcMax };
        const balanced = Math.abs(m.net) <= tol;
        let msg = null;
        if (!balanced) msg = m.net > 0 ? (act.tipForward || 'Hlava padá dopředu – šíje drží {f} N. Přidej protizávaží, nebo ho posuň dál od osy.') : (act.tipBack || 'Teď hlava padá dozadu – protizávaží je moc ({mc:2} kg). Uber.');
        else if (r.goal === 'lightest' && dc < dcMax - 0.5) msg = act.tipFarther || 'Vyváženo – ale jde to lehčí. Posuň váček dál dozadu (až na {dcMax} cm) a uber.';
        if (msg) {
          sound.sfx('wrong');
          status.textContent = tplLocal(msg, vals);
          status.className = 'feedback bad';
          return;
        }
        done = true;
        sound.sfx('unlock');
        const v = r.var || 'prilba';
        out[`${v}_kg`] = Math.round(mc * 100) / 100;
        out[`${v}_cm`] = dc;
        status.textContent = tplLocal(r.success || 'Vyváženo.', vals);
        status.className = 'feedback good';
        const last = idx + 1 >= act.rounds.length;
        fit.hidden = true;
        button(actions, last ? 'Pokračovat ›' : 'Další kolo ›', last ? 'btn activity-next' : 'btn primary', () => {
          if (last) { finishActivity(act, out); return; }
          actions.lastChild.remove();
          idx += 1;
          done = false;
          fit.hidden = false;
          dc = round().dc || round().dcStart || dc;
          mS.upd(); dS.upd();
          roundText.textContent = round().text || '';
          status.textContent = '';
          status.className = 'feedback';
          render();
        });
        render();
      }

      // tažení váčku (vodorovně, jen když je poloha volná)
      let dragging = false;
      svg.addEventListener('pointerdown', (e) => {
        if (done || round().dc || !e.target.closest('.helmet-pouch')) return;
        e.preventDefault();
        dragging = true;
        svg.setPointerCapture(e.pointerId);
      });
      svg.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const b = svg.getBoundingClientRect();
        const sx = ((e.clientX - b.left) / b.width) * 420;
        dc = Math.max(dcMin, Math.min(dcMax, Math.round((P.x - sx) / K)));
        dS.upd();
        render();
      });
      const up = () => { dragging = false; };
      svg.addEventListener('pointerup', up);
      svg.addEventListener('pointercancel', up);
      roundText.textContent = round().text || '';
      render();
    });
  }

  /* Mapa se svahem (noční cvičiště): výstup z tábora na stanoviště po jedné z tras se stejným
     převýšením. Práce proti tíze W = m · g · Δh je u všech stejná; liší se délka, průměrný sklon
     (složka tíhy podél svahu m · g · sin α), nejvyšší rozumné tempo, čas a tedy výkon P = W / t.
     „routes“: { id, name, lengthM, maxKmh, color }; nejdřív „question“ (options, correct, feedback),
     pak „mission“ (maxMin, maxW, success, failTime, failPower). Proměnné: svah_trasa, svah_delka,
     svah_sklon, svah_tempo, svah_t (min), svah_P (W), svah_W (kJ), svah_hotovo. */
  function openSlope(act) {
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
    const mass = (act.soldierKg || 70) + (act.gearKg || 20);
    const dh = act.h1 - act.h0;
    const W = mass * g * dh;
    const routes = act.routes;
    let sel = 0, tempo = Math.min(routes[0].maxKmh, act.tempoStart || 3), phase = 'question', raf = 0, running = false;
    const out = { svah_hotovo: 1 };
    const calc = (r, kmh) => {
      const sin = Math.min(1, dh / r.lengthM);
      const t = r.lengthM / (kmh / 3.6);
      return { sin, deg: Math.asin(sin) * 180 / Math.PI, fPar: mass * g * sin, t, P: W / t, tMin: t / 60 };
    };

    // mapa: vrchol vpravo nahoře, tábor vlevo dole, vrstevnice jako nepravidelné elipsy kolem vrcholu
    const S = { x: 470, y: 95 }, camp = { x: 80, y: 300 };
    const RATIO = 0.65, levels = [];
    for (let lv = act.h0; lv <= act.h1; lv += act.contourStep || 40) levels.push(lv);
    const rho0 = Math.hypot(camp.x - S.x, (camp.y - S.y) / RATIO);
    const thC = Math.atan2((camp.y - S.y) / RATIO, camp.x - S.x);
    const radius = (lv, th) => Math.max(14, rho0 * (act.h1 - lv) / dh) * (1 + 0.06 * Math.sin(3 * th + 0.8) + 0.04 * Math.sin(5 * th - 1.5));
    const pt = (lv, th) => [S.x + radius(lv, th) * Math.cos(th), S.y + radius(lv, th) * RATIO * Math.sin(th)];
    const campPt = pt(act.h0, thC);
    const paths = routes.map((r, i) => {
      const pts = [];
      if (r.shape === 'zigzag') {
        const n = r.turns || 7, dx = S.x - campPt[0], dy = S.y - campPt[1];
        const len = Math.hypot(dx, dy), nx = -dy / len, ny = dx / len;
        pts.push(campPt);
        for (let k = 1; k < n; k++) {
          const f = k / n, amp = 70 * (1 - f * 0.7) * (k % 2 ? 1 : -1);
          pts.push([campPt[0] + dx * f + nx * amp, campPt[1] + dy * f + ny * amp]);
        }
        pts.push([S.x, S.y]);
      } else if (r.shape === 'spiral') {
        const total = (r.turnDeg || 300) * Math.PI / 180, steps = 40;
        for (let k = 0; k <= steps; k++) {
          const f = k / steps;
          pts.push(pt(act.h0 + dh * f * 0.97, thC - total * f));
        }
        pts.push([S.x, S.y]);
      } else {
        pts.push(campPt, [campPt[0] * 0.55 + S.x * 0.45 + 18, campPt[1] * 0.55 + S.y * 0.45 + 10], [S.x, S.y]);
      }
      // délky úseků pro animaci
      const seg = [0];
      for (let k = 1; k < pts.length; k++) seg.push(seg[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
      return { pts, seg, total: seg[seg.length - 1], color: r.color || ['#e0805f', '#ffd28a', '#9fd0a0'][i % 3] };
    });
    const along = (p, f) => {
      const d = f * p.total;
      let k = 1;
      while (k < p.seg.length - 1 && p.seg[k] < d) k++;
      const a = p.pts[k - 1], b = p.pts[k], u = (d - p.seg[k - 1]) / Math.max(1e-6, p.seg[k] - p.seg[k - 1]);
      return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
    };

    openModal((box) => {
      box.classList.add('activity-box', 'pack-box');
      heading(box, act.title || 'Mapa se svahem');
      para(box, act.intro || '', 'question');
      const wrap = document.createElement('div');
      wrap.className = 'pack-wrap';
      box.appendChild(wrap);
      const svg = el('svg', { viewBox: '0 0 600 340', class: 'pack-svg slope-map' }, wrap);
      const side = document.createElement('div');
      side.className = 'lift-side';
      wrap.appendChild(side);
      para(side, act.routesLabel || 'Trasa:', 'muted');
      const rbtns = routes.map((r, i) => button(side, `${r.id} – ${r.name} (${r.lengthM} m)`, 'btn lift-posture', () => {
        if (running) return;
        sel = i;
        tempo = Math.min(tempo, routes[i].maxKmh);
        tS.input.max = routes[i].maxKmh;
        tS.upd();
        sound.sfx('step');
        render();
      }));
      const slider = (min, max, step, get, set, label) => {
        const l = document.createElement('label');
        l.className = 'stance-slider';
        const t = document.createElement('span');
        const r = document.createElement('input');
        r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = get();
        const upd = () => { t.textContent = label(get()); r.value = get(); };
        r.addEventListener('input', () => { if (running) return; set(Number(r.value)); upd(); render(); });
        upd();
        l.append(t, r);
        side.appendChild(l);
        return { input: r, upd };
      };
      const tS = slider(act.tempoMin || 1, routes[0].maxKmh, 0.1, () => tempo, (v) => { tempo = v; }, (v) => `${act.tempoLabel || 'Tempo'}: ${fmt(v, 1)} km/h (na téhle trase nejvýš ${fmt(routes[sel].maxKmh, 1)})`);
      const profile = el('svg', { viewBox: '0 0 260 110', class: 'pack-svg' }, side);
      const readout = document.createElement('div');
      readout.className = 'pack-readout';
      box.appendChild(readout);
      const eq = para(box, '', 'muted small');
      // otázka, potom rozkaz
      const qbox = document.createElement('div');
      qbox.className = 'slope-task';
      box.appendChild(qbox);
      const status = para(box, '', 'feedback');
      const actions = document.createElement('div');
      actions.className = 'squat-buttons';
      box.appendChild(actions);
      let dot = null, clock = null, go = null;

      function drawMap() {
        svg.innerHTML = '';
        el('rect', { x: 0, y: 0, width: 600, height: 340, fill: '#1b2418', rx: 8 }, svg);
        // vrstevnice
        levels.forEach((lv, i) => {
          const d = [];
          for (let k = 0; k <= 72; k++) {
            const th = (k / 72) * Math.PI * 2;
            const p = pt(lv, th);
            d.push(`${k ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`);
          }
          const major = i % 2 === 0;
          el('path', { d: d.join(' ') + ' Z', fill: 'none', stroke: major ? '#8a6a3a' : '#6a5230', 'stroke-width': major ? 1.4 : 0.8 }, svg);
          if (major) {
            const lp = pt(lv, Math.PI * 0.72);
            el('text', { x: lp[0], y: lp[1] - 3, 'font-size': 9, fill: '#b0905a', 'text-anchor': 'middle' }, svg, String(lv));
          }
        });
        // trasy (široká neviditelná čára pro klikání + barevná čára)
        paths.forEach((p, i) => {
          const d = p.pts.map((q, k) => `${k ? 'L' : 'M'}${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' ');
          el('path', { d, class: 'slope-route-hit', 'data-i': i }, svg);
          el('path', { d, class: `slope-route${i === sel ? ' selected' : ''}`, stroke: p.color, 'stroke-dasharray': routes[i].dash || 'none', 'data-i': i }, svg);
          const lp = along(p, routes[i].labelAt || 0.5);
          el('text', { x: lp[0] + 8, y: lp[1] - 6, 'font-size': 13, 'font-weight': 'bold', fill: p.color }, svg, routes[i].id);
        });
        // tábor a stanoviště
        el('rect', { x: campPt[0] - 9, y: campPt[1] - 7, width: 18, height: 14, fill: '#d8cfae', stroke: '#1a1a16' }, svg);
        el('text', { x: campPt[0] + 14, y: campPt[1] + 4, 'font-size': 11, fill: '#e8e0c4' }, svg, `${act.startName || 'Tábor'} ${act.h0} m`);
        el('path', { d: `M${S.x},${S.y - 10} L${S.x + 9},${S.y + 6} L${S.x - 9},${S.y + 6} Z`, fill: '#ffd28a', stroke: '#1a1a16' }, svg);
        el('text', { x: S.x + 14, y: S.y + 4, 'font-size': 11, fill: '#e8e0c4' }, svg, `${act.goalName || 'Stanoviště'} ${act.h1} m`);
        // severka a měřítko
        el('path', { d: 'M570,56 L576,74 L570,69 L564,74 Z', fill: '#e8e0c4' }, svg);
        el('text', { x: 570, y: 50, 'font-size': 11, 'text-anchor': 'middle', fill: '#e8e0c4' }, svg, 'S');
        dot = el('circle', { cx: campPt[0], cy: campPt[1], r: 6, fill: '#fff4d0', stroke: '#1a1a16', 'stroke-width': 1.5 }, svg);
        clock = el('text', { x: 590, y: 326, 'font-size': 14, 'text-anchor': 'end', fill: '#ffd28a' }, svg, '');
      }

      function drawProfile() {
        const r = routes[sel], c = calc(r, tempo);
        profile.innerHTML = '';
        el('rect', { x: 0, y: 0, width: 260, height: 110, fill: 'rgba(0,0,0,0.25)', rx: 6 }, profile);
        const x0 = 20, y0 = 92, run = 200, rise = run * Math.tan(c.deg * Math.PI / 180);
        const riseC = Math.min(70, rise), runC = rise > 70 ? 70 / Math.tan(c.deg * Math.PI / 180) : run;
        el('path', { d: `M${x0},${y0} L${x0 + runC},${y0 - riseC} L${x0 + runC},${y0} Z`, fill: '#3a4a30', stroke: '#8a6a3a', 'stroke-width': 1.5 }, profile);
        el('text', { x: x0 + 30, y: y0 - 4, 'font-size': 11, fill: '#e8e0c4' }, profile, `α ≈ ${fmt(c.deg)}°`);
        // panáček na svahu a složka tíhy podél svahu
        const mx = x0 + runC * 0.55, my = y0 - riseC * 0.55;
        el('circle', { cx: mx, cy: my - 16, r: 4, fill: '#c9b08a' }, profile);
        el('line', { x1: mx, y1: my - 12, x2: mx, y2: my, stroke: '#c9b08a', 'stroke-width': 3 }, profile);
        const a = c.deg * Math.PI / 180, len = 18 + c.sin * 50;
        el('line', { x1: mx, y1: my, x2: mx - len * Math.cos(a), y2: my + len * Math.sin(a), stroke: '#e0805f', 'stroke-width': 2.5 }, profile);
        el('text', { x: 250, y: 20, 'font-size': 11, 'text-anchor': 'end', fill: '#e0805f' }, profile, `podél svahu ${fmt(c.fPar)} N`);
        el('text', { x: 250, y: 104, 'font-size': 10, 'text-anchor': 'end', fill: '#d8cfae' }, profile, `${r.lengthM} m, převýšení ${dh} m`);
      }

      function render() {
        const r = routes[sel], c = calc(r, tempo);
        rbtns.forEach((b, i) => b.classList.toggle('selected', i === sel));
        svg.querySelectorAll('.slope-route').forEach((p) => p.classList.toggle('selected', Number(p.dataset.i) === sel));
        drawProfile();
        readoutRows(readout, [
          ['Trasa', `${r.id} – ${r.name}`],
          ['Délka trasy', `${r.lengthM} m`],
          ['Převýšení', `${dh} m (${act.h0} → ${act.h1} m n. m.)`],
          ['Průměrný sklon', `${fmt(c.deg)}°`],
          [`Práce proti tíze (${mass} kg · 9,81 · ${dh} m)`, `${fmt(W / 1000)} kJ`],
          ['Složka tíhy podél svahu (m · g · sin α)', `${fmt(c.fPar)} N`],
          ['Čas při tomto tempu', `${fmt(c.tMin, 1)} min`],
          ['Výkon proti tíze (W / t)', `${fmt(c.P)} W`],
        ]);
        eq.textContent = `W = m · g · Δh = ${mass} · 9,81 · ${dh} = ${fmt(W)} J ≈ ${fmt(W / 1000)} kJ – kudykoli. P = W / t = ${fmt(W)} / ${fmt(c.t)} s ≈ ${fmt(c.P)} W.`;
      }

      function showQuestion() {
        qbox.innerHTML = '';
        const q = act.question;
        para(qbox, q.text, 'question');
        const opts = document.createElement('div');
        opts.className = 'slope-options';
        qbox.appendChild(opts);
        q.options.forEach((o, i) => button(opts, o, 'btn lift-posture', () => {
          if (i === q.correct) {
            sound.sfx('unlock');
            status.textContent = q.success || 'Správně.';
            status.className = 'feedback good';
            phase = 'mission';
            showMission();
          } else {
            sound.sfx('wrong');
            status.textContent = (q.feedback || {})[i] || q.wrong || 'Ne. Porovnej u tras řádek „Práce proti tíze“.';
            status.className = 'feedback bad';
          }
        }));
      }

      function showMission() {
        qbox.innerHTML = '';
        const ms = act.mission;
        para(qbox, ms.text, 'question');
        go = button(actions, ms.goLabel || 'Vyrazit', 'btn primary', () => start());
      }

      function start() {
        if (running) return;
        running = true;
        go.disabled = true;
        tS.input.disabled = true;
        const r = routes[sel], c = calc(r, tempo), p = paths[sel];
        const t0 = performance.now(), dur = 2400;
        const step = (now) => {
          const f = Math.min(1, (now - t0) / dur);
          const q = along(p, f);
          dot.setAttribute('cx', q[0]); dot.setAttribute('cy', q[1]);
          clock.textContent = `${fmt(c.tMin * f, 1)} min`;
          if (f < 1) { raf = requestAnimationFrame(step); return; }
          raf = 0;
          running = false;
          tS.input.disabled = false;
          finishRun(r, c);
        };
        raf = requestAnimationFrame(step);
      }

      function finishRun(r, c) {
        const ms = act.mission;
        const vals = { name: r.name, id: r.id, tempo, t: c.tMin, P: c.P, maxMin: ms.maxMin, maxW: ms.maxW, W: W / 1000, deg: c.deg, fPar: c.fPar };
        if (c.tMin > ms.maxMin) {
          sound.sfx('wrong');
          status.textContent = tplLocal(ms.failTime || 'Po trase {id} tempem {tempo:1} km/h to trvá {t:1} min – pozdě. Rozkaz zní do {maxMin} min.', vals);
          status.className = 'feedback bad';
          go.disabled = false;
          return;
        }
        if (c.P > ms.maxW) {
          sound.sfx('wrong');
          status.textContent = tplLocal(ms.failPower || 'Za {t:1} min nahoře, ale s výkonem {P} W – hlídka dorazí uřícená. Nejvýš {maxW} W: zpomal, nebo vyber jinou trasu.', vals);
          status.className = 'feedback bad';
          go.disabled = false;
          return;
        }
        sound.sfx('unlock');
        phase = 'done';
        status.textContent = tplLocal(ms.success || 'Splněno.', vals);
        status.className = 'feedback good';
        out.svah_trasa = `${r.id} – ${r.name}`;
        out.svah_delka = r.lengthM;
        out.svah_sklon = Math.round(c.deg);
        out.svah_tempo = Math.round(tempo * 10) / 10;
        out.svah_t = Math.round(c.tMin * 10) / 10;
        out.svah_P = Math.round(c.P);
        out.svah_W = Math.round(W / 100) / 10;
        go.remove();
        button(actions, 'Pokračovat ›', 'btn activity-next', () => finishActivity(act, out));
      }

      svg.addEventListener('click', (e) => {
        const t = e.target.closest('[data-i]');
        if (!t || running) return;
        rbtns[Number(t.dataset.i)].click();
      });
      activityCleanup = () => { if (raf) cancelAnimationFrame(raf); };
      drawMap();
      render();
      showQuestion();
    });
  }

  /* Otočná stolice (Spin zóna): zachování momentu hybnosti. Hráč se roztočí s rozpaženýma rukama
     (ω₀), pak posuvníkem připažuje: I klesá, ω = L / I roste, energie otáčení roste (práci dodají
     paže). I = bodyI + 2 · m_činky · r² + 2 · m_paže · r² / 3 (paže jako tyče). Kola „rounds“:
     { name, text, dumbbellKg, targetOt (cíl v ot/s), success, var }. Proměnné: <var>_ot, <var>_i1,
     <var>_i2, <var>_l, spin_hotovo. */
  function openSpin(act) {
    const NS = 'http://www.w3.org/2000/svg';
    const el = (name, attrs, parent, text) => {
      const e = document.createElementNS(NS, name);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
      if (text !== undefined) e.textContent = text;
      if (parent) parent.appendChild(e);
      return e;
    };
    const fmt = (v, d = 0) => v.toFixed(d).replace('.', ',');
    const bodyI = act.bodyI || 0.9, armKg = act.armKg || 3.5;
    const rMin = act.rMin || 0.2, rMax = act.rMax || 0.7;
    const omega0 = act.omega0 || 1.0;                 // ot/s při rozpažení
    const K = 200, C = { x: 210, y: 150 };            // px na m, střed
    let idx = 0, r = rMax, spinning = false, L = 0, angle = 0, done = false, raf = 0, last = 0;
    const out = { spin_hotovo: 1 };
    const round = () => act.rounds[idx];
    const inertia = (rr) => bodyI + 2 * round().dumbbellKg * rr * rr + 2 * armKg * rr * rr / 3;
    const omegaOt = () => (spinning ? L / inertia(r) / (2 * Math.PI) : 0);

    openModal((box) => {
      box.classList.add('activity-box', 'pack-box');
      heading(box, act.title || 'Otočná stolice');
      para(box, act.intro || '', 'question');
      const info = para(box, '', 'lean-step');
      const wrap = document.createElement('div');
      wrap.className = 'pack-wrap';
      box.appendChild(wrap);
      const svg = el('svg', { viewBox: '0 0 420 300', class: 'pack-svg' }, wrap);
      const side = document.createElement('div');
      side.className = 'lift-side';
      wrap.appendChild(side);
      const roundText = para(side, '', 'muted');
      const l = document.createElement('label');
      l.className = 'stance-slider';
      const lt = document.createElement('span');
      const slider = document.createElement('input');
      slider.type = 'range'; slider.min = rMin; slider.max = rMax; slider.step = 0.01; slider.value = r;
      const updLabel = () => { lt.textContent = `${act.armLabel || 'Rozpažení (činky od osy)'}: ${fmt(r, 2)} m`; };
      slider.addEventListener('input', () => { if (done) return; r = Number(slider.value); updLabel(); render(); });
      updLabel();
      l.append(lt, slider);
      side.appendChild(l);
      const btns = document.createElement('div');
      btns.className = 'squat-buttons';
      side.appendChild(btns);
      const spinBtn = button(btns, act.spinLabel || 'Roztočit (s rozpaženýma rukama)', 'btn primary', () => {
        if (done) return;
        r = rMax; slider.value = r; updLabel();
        L = inertia(r) * omega0 * 2 * Math.PI;
        spinning = true;
        sound.sfx('step');
        render();
      });
      const stopBtn = button(btns, act.stopLabel || 'Zastavit', 'btn', () => { spinning = false; render(); });
      para(side, act.hint || 'Po roztočení posouvej rozpažení – sleduj otáčky a energii.', 'muted small');
      const readout = document.createElement('div');
      readout.className = 'pack-readout';
      box.appendChild(readout);
      const eq = para(box, '', 'muted small');
      const status = para(box, '', 'feedback');
      const actions = document.createElement('div');
      actions.className = 'squat-buttons';
      box.appendChild(actions);

      function draw() {
        svg.innerHTML = '';
        el('rect', { x: 0, y: 0, width: 420, height: 300, fill: 'rgba(0,0,0,0.25)', rx: 8 }, svg);
        el('circle', { cx: C.x, cy: C.y, r: 48, fill: '#3a3a30', stroke: '#1a1a16', 'stroke-width': 2 }, svg);   // stolice
        const g = el('g', { transform: `rotate(${(angle * 180 / Math.PI).toFixed(1)} ${C.x} ${C.y})` }, svg);
        const ra = r * K;
        el('line', { x1: C.x - ra, y1: C.y, x2: C.x + ra, y2: C.y, stroke: '#c9b08a', 'stroke-width': 9, 'stroke-linecap': 'round' }, g);   // paže
        el('ellipse', { cx: C.x, cy: C.y, rx: 34, ry: 22, fill: '#4f5638', stroke: '#2a3022', 'stroke-width': 2 }, g);   // ramena
        el('circle', { cx: C.x, cy: C.y, r: 16, fill: '#6b6650', stroke: '#2a2418', 'stroke-width': 2 }, g);             // hlava
        el('path', { d: `M${C.x - 6},${C.y - 14} q6,-6 12,0`, fill: 'none', stroke: '#2a2418', 'stroke-width': 2 }, g);  // nos (směr)
        if (round().dumbbellKg > 0) {
          for (const s of [-1, 1]) {
            el('rect', { x: C.x + s * ra - 9, y: C.y - 14, width: 18, height: 28, rx: 4, fill: '#2a2c30', stroke: '#111', 'stroke-width': 1.5 }, g);
            el('text', { x: C.x + s * ra, y: C.y + 30, 'text-anchor': 'middle', 'font-size': 10, fill: '#d8cfae' }, g, `${fmt(round().dumbbellKg)} kg`);
          }
        } else {
          for (const s of [-1, 1]) el('circle', { cx: C.x + s * ra, cy: C.y, r: 6, fill: '#c9b08a', stroke: '#2a2418' }, g);
        }
        // osa a šipka otáčení
        el('circle', { cx: C.x, cy: C.y, r: 3, fill: '#ffd28a' }, svg);
        const w = omegaOt();
        if (w > 0) {
          const R = 62 + Math.min(80, w * 20), a0 = -Math.PI * 0.85, a1 = a0 + Math.min(5.5, 1.2 + w * 1.3);
          el('path', { d: `M${C.x + R * Math.cos(a0)},${C.y + R * Math.sin(a0)} A${R},${R} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${C.x + R * Math.cos(a1)},${C.y + R * Math.sin(a1)}`, fill: 'none', stroke: '#9fd0a0', 'stroke-width': 3 }, svg);
        }
        el('text', { x: 12, y: 290, 'font-size': 11, fill: '#d8cfae' }, svg, 'pohled shora');
        el('text', { x: 408, y: 24, 'font-size': 14, 'text-anchor': 'end', fill: '#ffd28a' }, svg, w ? `${fmt(w, 2)} ot/s` : 'stojí');
      }

      function render() {
        const rd = round();
        info.textContent = `Kolo ${idx + 1}/${act.rounds.length}: ${rd.name}`;
        const I = inertia(r), w = omegaOt(), om = w * 2 * Math.PI;
        draw();
        readoutRows(readout, [
          ['Rozpažení (ruce od osy)', `${fmt(r, 2)} m`],
          [`Moment setrvačnosti I (tělo ${fmt(bodyI, 1)} + paže${rd.dumbbellKg ? ' + činky' : ''})`, `${fmt(I, 2)} kg·m²`],
          ['Otáčky ω', w ? `${fmt(w, 2)} ot/s = ${fmt(om, 2)} rad/s` : '0 (stojíš)'],
          ['Moment hybnosti L = I · ω', w ? `${fmt(L, 1)} kg·m²/s (stálý)` : '0'],
          ['Energie otáčení ½ I ω²', w ? `${fmt(0.5 * I * om * om)} J` : '0 J'],
        ]);
        eq.textContent = w ? `L = I · ω se zachová: ${fmt(L, 1)} = ${fmt(I, 2)} · ${fmt(om, 2)}. Menší I → větší ω.` : 'Roztoč se s rozpaženýma rukama, pak připažuj.';
        spinBtn.disabled = done;
        stopBtn.disabled = done || !spinning;
        if (!done && spinning && w >= rd.targetOt - 1e-9) {
          done = true;
          sound.sfx('unlock');
          const v = rd.var || 'spin';
          out[`${v}_ot`] = Math.round(w * 100) / 100;
          out[`${v}_i1`] = Math.round(inertia(rMax) * 100) / 100;
          out[`${v}_i2`] = Math.round(I * 100) / 100;
          out[`${v}_l`] = Math.round(L * 10) / 10;
          status.textContent = tplLocal(rd.success || 'Cíl splněn.', { ot: w, i1: inertia(rMax), i2: I, L, E0: 0.5 * L * omega0 * 2 * Math.PI, E: 0.5 * I * om * om, r });
          status.className = 'feedback good';
          const last = idx + 1 >= act.rounds.length;
          button(actions, last ? 'Pokračovat ›' : 'Další kolo ›', last ? 'btn activity-next' : 'btn primary', () => {
            if (last) { finishActivity(act, out); return; }
            actions.innerHTML = '';
            idx += 1; done = false; spinning = false; r = rMax; slider.value = r; updLabel();
            roundText.textContent = round().text || '';
            status.textContent = ''; status.className = 'feedback';
            render();
          });
        } else if (!done && spinning) {
          status.textContent = tplLocal(act.tipMore || 'Cíl: aspoň {target:1} ot/s. Přitáhni ruce blíž k ose.', { target: rd.targetOt });
          status.className = 'feedback';
        }
      }

      const tick = (now) => {
        if (spinning) {
          const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
          angle += omegaOt() * 2 * Math.PI * dt;
          draw();
        }
        last = now;
        raf = requestAnimationFrame(tick);
      };
      activityCleanup = () => { if (raf) cancelAnimationFrame(raf); };
      raf = requestAnimationFrame(tick);
      roundText.textContent = round().text || '';
      render();
    });
  }

  /* Zatáčka (automat CURVE): dostředivá síla F = m · v² / r, náklon tan α = v² / (g · r), nejvyšší
     rychlost bez uklouznutí v = √(μ · g · r). Dráhy běžeckého oválu: poloměr r = laneR + (dráha − 1) · laneW.
     Kola „rounds“: { name, text, kind: "compare" (otázka „question“ nad údaji drah) | "grip" (najít
     nejvyšší rychlost při μ, lane, tolV), success, … }. Proměnné: curve_draha, curve_v, curve_f,
     curve_uhel, curve_vmax, curve_hotovo. */
  function openCurve(act) {
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
    const m = act.runnerKg || 70, R1 = act.laneR || 36.5, LW = act.laneW || 1.22, LANES = act.lanes || 8;
    const vMin = act.vMin || 4, vMax = act.vMax || 12;
    let idx = 0, lane = 1, v = act.vStart || 10, running = false, raf = 0, done = false, prog = 0;
    const out = { curve_hotovo: 1 };
    const round = () => act.rounds[idx];
    const radius = (ln) => R1 + (ln - 1) * LW;
    const calc = () => {
      const r = radius(lane), a = v * v / r, F = m * a, deg = Math.atan(v * v / (g * r)) * 180 / Math.PI;
      const mu = round().mu, vm = mu ? Math.sqrt(mu * g * r) : null;
      return { r, a, F, deg, mu, vm, fMax: mu ? mu * m * g : null };
    };

    openModal((box) => {
      box.classList.add('activity-box', 'pack-box');
      heading(box, act.title || 'CURVE – zatáčka');
      para(box, act.intro || '', 'question');
      const info = para(box, '', 'lean-step');
      const wrap = document.createElement('div');
      wrap.className = 'pack-wrap';
      box.appendChild(wrap);
      const svg = el('svg', { viewBox: '0 0 600 300', class: 'pack-svg' }, wrap);
      const side = document.createElement('div');
      side.className = 'lift-side';
      wrap.appendChild(side);
      const roundText = para(side, '', 'muted');
      para(side, act.laneLabel || 'Dráha:', 'muted');
      const lb = document.createElement('div');
      lb.className = 'stance-push';
      side.appendChild(lb);
      const laneBtns = [];
      for (let i = 1; i <= LANES; i++) laneBtns.push(button(lb, String(i), 'btn lift-posture', () => { if (running || round().lane) return; lane = i; sound.sfx('step'); render(); }));
      const l = document.createElement('label');
      l.className = 'stance-slider';
      const lt = document.createElement('span');
      const slider = document.createElement('input');
      slider.type = 'range'; slider.min = vMin; slider.max = vMax; slider.step = 0.1; slider.value = v;
      const updLabel = () => { lt.textContent = `${act.speedLabel || 'Rychlost'}: ${fmt(v, 1)} m/s (${fmt(v * 3.6)} km/h)`; };
      slider.addEventListener('input', () => { if (running) return; v = Number(slider.value); updLabel(); render(); });
      updLabel();
      l.append(lt, slider);
      side.appendChild(l);
      const readout = document.createElement('div');
      readout.className = 'pack-readout';
      box.appendChild(readout);
      const eq = para(box, '', 'muted small');
      const qbox = document.createElement('div');
      qbox.className = 'slope-task';
      box.appendChild(qbox);
      const status = para(box, '', 'feedback');
      const actions = document.createElement('div');
      actions.className = 'squat-buttons';
      box.appendChild(actions);
      let runner = null, goBtn = null;

      // zatáčka shora: půlkruhy drah, běžec; z boku: náklon
      const CX = 150, CY = 290, S = 2.6;      // střed oblouku, px na m
      function draw() {
        svg.innerHTML = '';
        el('rect', { x: 0, y: 0, width: 600, height: 300, fill: 'rgba(0,0,0,0.25)', rx: 8 }, svg);
        for (let i = 0; i <= LANES; i++) {
          const rr = (R1 - LW / 2 + i * LW) * S;
          el('path', { d: `M${CX - rr},${CY} A${rr},${rr} 0 0 1 ${CX + rr},${CY}`, fill: 'none', stroke: i === 0 || i === LANES ? '#e8e0c4' : '#6a6250', 'stroke-width': i === 0 || i === LANES ? 2 : 1 }, svg);
        }
        const rs = radius(lane) * S;
        el('path', { d: `M${CX - rs},${CY} A${rs},${rs} 0 0 1 ${CX + rs},${CY}`, fill: 'none', stroke: '#ffd28a', 'stroke-width': 3, opacity: 0.8 }, svg);
        el('text', { x: CX, y: CY - 8, 'text-anchor': 'middle', 'font-size': 11, fill: '#d8cfae' }, svg, `dráha ${lane}: r = ${fmt(radius(lane), 1)} m`);
        const th = Math.PI + prog * Math.PI;
        const px = CX + rs * Math.cos(th), py = CY + rs * Math.sin(th);
        runner = el('circle', { cx: px, cy: py, r: 7, fill: '#fff4d0', stroke: '#1a1a16', 'stroke-width': 1.5 }, svg);
        // dostředivá síla: šipka ke středu
        const c = calc();
        const len = Math.min(60, c.F / 4);
        el('line', { x1: px, y1: py, x2: px + (CX - px) / rs * len, y2: py + (CY - py) / rs * len, stroke: '#e0805f', 'stroke-width': 2.5 }, svg);
        el('text', { x: 12, y: 290, 'font-size': 11, fill: '#d8cfae' }, svg, 'zatáčka shora (200 m)');
        // pohled zezadu: běžec nakloněný o α
        const BX = 460, BY = 250;
        el('line', { x1: 340, y1: BY, x2: 590, y2: BY, stroke: '#5a4a30', 'stroke-width': 2 }, svg);
        const a = c.deg * Math.PI / 180;
        const hx = BX - Math.sin(a) * 120, hy = BY - Math.cos(a) * 120;
        el('line', { x1: BX, y1: BY, x2: hx, y2: hy, stroke: '#4f5638', 'stroke-width': 14, 'stroke-linecap': 'round' }, svg);
        el('circle', { cx: hx - Math.sin(a) * 14, cy: hy - Math.cos(a) * 14, r: 13, fill: '#6b6650' }, svg);
        // síly: tíha dolů, reakce podložky podél těla, dostředivá vodorovně
        const gx = BX - Math.sin(a) * 70, gy = BY - Math.cos(a) * 70;
        el('line', { x1: gx, y1: gy, x2: gx, y2: gy + 50, stroke: '#9fd0a0', 'stroke-width': 2.5 }, svg);
        el('text', { x: gx + 6, y: gy + 50, 'font-size': 10, fill: '#9fd0a0' }, svg, 'tíha m·g');
        el('line', { x1: gx, y1: gy, x2: gx - 50 * Math.tan(a), y2: gy, stroke: '#e0805f', 'stroke-width': 2.5 }, svg);
        el('text', { x: gx - 50 * Math.tan(a) - 4, y: gy - 6, 'font-size': 10, fill: '#e0805f', 'text-anchor': 'end' }, svg, `dostředivá ${fmt(c.F)} N`);
        el('path', { d: `M${BX},${BY} m0,-36 a36,36 0 0 0 ${-36 * Math.sin(a)},${36 - 36 * Math.cos(a)}`, fill: 'none', stroke: '#ffd28a', 'stroke-width': 1.5 }, svg);
        el('text', { x: BX - 14 - 30 * Math.sin(a / 2), y: BY - 42, 'font-size': 11, fill: '#ffd28a', 'text-anchor': 'end' }, svg, `α ≈ ${fmt(c.deg, 1)}°`);
        el('text', { x: 590, y: 290, 'font-size': 11, fill: '#d8cfae', 'text-anchor': 'end' }, svg, 'náklon (pohled zezadu)');
      }

      function render() {
        const rd = round();
        info.textContent = `Kolo ${idx + 1}/${act.rounds.length}: ${rd.name}`;
        if (rd.lane) lane = rd.lane;
        laneBtns.forEach((b, i) => { b.classList.toggle('selected', i + 1 === lane); b.disabled = Boolean(rd.lane) || running; });
        const c = calc();
        draw();
        const rows = [
          ['Dráha a poloměr', `${lane} – r = ${fmt(c.r, 1)} m`],
          ['Rychlost', `${fmt(v, 1)} m/s`],
          ['Dostředivé zrychlení v² / r', `${fmt(c.a, 2)} m/s²`],
          [`Dostředivá síla m · v² / r (${m} kg)`, `${fmt(c.F)} N (${fmt(c.F / (m * g) * 100)} % tíhy)`],
          ['Náklon tan α = v² / (g · r)', `${fmt(c.deg, 1)}°`],
        ];
        if (c.mu) rows.push([`Nejvyšší třecí síla μ · m · g (μ = ${fmt(c.mu, 1)})`, `${fmt(c.fMax)} N`]);
        readoutRows(readout, rows);
        eq.textContent = `F = m · v² / r = ${m} · ${fmt(v, 1)}² / ${fmt(c.r, 1)} ≈ ${fmt(c.F)} N.` + (c.mu ? ` Bez uklouznutí musí platit m · v² / r ≤ μ · m · g, tedy v ≤ √(μ · g · r) – tu hodnotu hledej.` : '');
      }

      function showRound() {
        const rd = round();
        qbox.innerHTML = '';
        actions.innerHTML = '';
        roundText.textContent = rd.text || '';
        status.textContent = ''; status.className = 'feedback';
        if (rd.kind === 'compare') {
          const q = rd.question;
          para(qbox, q.text, 'question');
          const opts = document.createElement('div');
          opts.className = 'slope-options';
          qbox.appendChild(opts);
          q.options.forEach((o, i) => button(opts, o, 'btn lift-posture', () => {
            if (done) return;
            if (i === q.correct) {
              done = true;
              sound.sfx('unlock');
              status.textContent = q.success || rd.success || 'Správně.';
              status.className = 'feedback good';
              nextButton();
            } else {
              sound.sfx('wrong');
              status.textContent = (q.feedback || {})[i] || q.wrong || 'Ne. Porovnej dráhy.';
              status.className = 'feedback bad';
            }
          }));
        } else {
          goBtn = button(actions, rd.goLabel || 'Proběhnout zatáčku', 'btn primary', () => start());
        }
        render();
      }

      function nextButton() {
        const last = idx + 1 >= act.rounds.length;
        button(actions, last ? 'Pokračovat ›' : 'Další kolo ›', last ? 'btn activity-next' : 'btn primary', () => {
          if (last) { finishActivity(act, out); return; }
          idx += 1; done = false; prog = 0;
          showRound();
        });
      }

      function start() {
        if (running || done) return;
        running = true;
        goBtn.disabled = true; slider.disabled = true;
        const c = calc();
        const slip = c.mu && c.F > c.fMax + 1e-9;
        const t0 = performance.now(), dur = 2200;
        const step = (now) => {
          const f = Math.min(1, (now - t0) / dur);
          prog = slip ? Math.min(f, 0.55) : f;
          draw();
          if (slip && f > 0.55) {
            // uklouznutí: běžec vyletí z dráhy ven
            const rs = radius(lane) * S, th = Math.PI + 0.55 * Math.PI;
            const d = (f - 0.55) * 160;
            runner.setAttribute('cx', CX + (rs + d) * Math.cos(th));
            runner.setAttribute('cy', CY + (rs + d) * Math.sin(th));
          }
          if (f < 1) { raf = requestAnimationFrame(step); return; }
          raf = 0; running = false; slider.disabled = false;
          finishRun(c, slip);
        };
        raf = requestAnimationFrame(step);
      }

      function finishRun(c, slip) {
        const rd = round();
        const vals = { v, F: c.F, fMax: c.fMax, vmax: c.vm, deg: c.deg, lane, r: c.r, mu: c.mu };
        if (slip) {
          sound.sfx('wrong');
          status.textContent = tplLocal(rd.failSlip || 'Uklouznutí! Potřebná dostředivá síla {F} N je víc, než tření udrží ({fMax} N). Zpomal.', vals);
          status.className = 'feedback bad';
          goBtn.disabled = false;
          return;
        }
        if (c.vm && v < c.vm - (rd.tolV || 0.3)) {
          sound.sfx('step');
          status.textContent = tplLocal(rd.failSlow || 'Udržel ses – ale jde to rychleji. Zkus přidat, dokud tření stačí.', vals);
          status.className = 'feedback';
          goBtn.disabled = false;
          return;
        }
        done = true;
        sound.sfx('unlock');
        out.curve_draha = lane;
        out.curve_v = Math.round(v * 10) / 10;
        out.curve_f = Math.round(c.F);
        out.curve_uhel = Math.round(c.deg * 10) / 10;
        if (c.vm) out.curve_vmax = Math.round(c.vm * 10) / 10;
        status.textContent = tplLocal(rd.success || 'Zatáčka proběhnuta.', vals);
        status.className = 'feedback good';
        goBtn.remove();
        nextButton();
      }

      activityCleanup = () => { if (raf) cancelAnimationFrame(raf); };
      showRound();
    });
  }

  /* SPIN – pirueta měřená gyroskopem zařízení (tablet, telefon): hráč drží zařízení oběma rukama
     u hrudníku a jednou se otočí; měří se nejvyšší úhlová rychlost (rotationRate, °/s) a počet otáček.
     Bez senzoru: kolega stopne čas tří otáček. Proměnné: pirueta_ot (ot/s), pirueta_omega (rad/s),
     pirueta_t (s na otáčku), pirueta_senzor (1/0), pirueta_hotovo. */
  function openGyro(act) {
    const fmt = (v, d = 0) => v.toFixed(d).replace('.', ',');
    const seconds = act.seconds || 8;
    const bodyI = act.bodyI || 1.2;
    let listening = false, peak = 0, turns = 0, lastT = 0, timer = 0, handler = null, samples = 0;
    const out = { pirueta_hotovo: 1 };

    openModal((box) => {
      box.classList.add('activity-box', 'pack-box');
      heading(box, act.title || 'SPIN – pirueta');
      para(box, act.intro || '', 'question');
      para(box, act.safety || 'Bezpečnost: volné místo kolem sebe, zařízení drž oběma rukama u hrudníku, otoč se jen jednou a zastav se pomalu.', 'feedback bad');
      const big = document.createElement('p');
      big.className = 'tape-reading';
      big.textContent = '–';
      box.appendChild(big);
      const sub = para(box, '', 'muted small');
      sub.style.textAlign = 'center';
      const readout = document.createElement('div');
      readout.className = 'pack-readout';
      box.appendChild(readout);
      const status = para(box, '', 'feedback');
      const btns = document.createElement('div');
      btns.className = 'squat-buttons';
      box.appendChild(btns);
      const results = document.createElement('div');
      box.appendChild(results);

      const stopListening = () => {
        if (handler) window.removeEventListener('devicemotion', handler);
        handler = null; listening = false;
        clearTimeout(timer); timer = 0;
      };
      activityCleanup = stopListening;

      const finish = (degPerS, sensor, turnsDone) => {
        const ot = degPerS / 360, omega = degPerS * Math.PI / 180;
        out.pirueta_ot = Math.round(ot * 100) / 100;
        out.pirueta_omega = Math.round(omega * 100) / 100;
        out.pirueta_t = ot > 0 ? Math.round(100 / ot) / 100 : 0;
        out.pirueta_senzor = sensor ? 1 : 0;
        big.textContent = `${fmt(ot, 2)} ot/s`;
        sub.textContent = sensor ? `nejrychlejší okamžik piruety (${fmt(turnsDone, 1)} otáčky)` : 'průměr ze tří otáček (bez senzoru)';
        readoutRows(readout, [
          ['Úhlová rychlost ω', `${fmt(degPerS)} °/s = ${fmt(omega, 2)} rad/s`],
          ['Otáčky', `${fmt(ot, 2)} ot/s → jedna otáčka za ${fmt(out.pirueta_t, 2)} s`],
          [`Moment hybnosti L = I · ω (I ≈ ${fmt(bodyI, 1)} kg·m², připažení)`, `${fmt(bodyI * omega, 1)} kg·m²/s`],
          ['Energie otáčení ½ I ω²', `${fmt(0.5 * bodyI * omega * omega, 1)} J`],
        ]);
        status.textContent = act.success || 'Změřeno.';
        status.className = 'feedback good';
        btns.innerHTML = '';
        results.innerHTML = '';
        button(results, 'Pokračovat ›', 'btn activity-next', () => finishActivity(act, out));
      };

      const startSensor = async () => {
        if (listening) return;
        if (!window.DeviceMotionEvent) {
          status.textContent = act.noSensor || 'Tohle zařízení gyroskop nehlásí – použij měření bez senzoru.';
          status.className = 'feedback bad';
          return;
        }
        try {
          if (typeof DeviceMotionEvent.requestPermission === 'function') {
            const res = await DeviceMotionEvent.requestPermission();
            if (res !== 'granted') throw new Error('denied');
          }
        } catch (e) {
          status.textContent = act.noPermission || 'Prohlížeč přístup k pohybovému senzoru nepovolil – použij měření bez senzoru.';
          status.className = 'feedback bad';
          return;
        }
        listening = true; peak = 0; turns = 0; samples = 0; lastT = performance.now();
        status.textContent = act.listening || 'Měřím… otoč se jednou dokola a pomalu zastav.';
        status.className = 'feedback';
        big.textContent = '0 °/s';
        const started = performance.now();
        handler = (e) => {
          const rr = e.rotationRate || {};
          const mag = Math.hypot(rr.alpha || 0, rr.beta || 0, rr.gamma || 0);
          const now = performance.now();
          const dt = Math.min(0.1, (now - lastT) / 1000);
          lastT = now;
          turns += mag * dt / 360;
          if (mag > peak) peak = mag;
          samples++;
          big.textContent = `${fmt(mag)} °/s`;
          sub.textContent = `max ${fmt(peak)} °/s · otáčky ${fmt(turns, 1)} · zbývá ${Math.max(0, Math.ceil(seconds - (now - started) / 1000))} s`;
        };
        window.addEventListener('devicemotion', handler);
        timer = setTimeout(() => {
          stopListening();
          if (samples < 5 || peak < 20) {
            status.textContent = act.noData || 'Senzor nehlásil žádný pohyb. Zkus to znovu, nebo měř bez senzoru.';
            status.className = 'feedback bad';
            big.textContent = '–';
            return;
          }
          finish(peak, true, turns);
        }, seconds * 1000);
      };

      button(btns, act.sensorLabel || 'Spustit senzor (tablet, telefon)', 'btn primary', startSensor);
      button(btns, act.manualLabel || 'Bez senzoru (stopky)', 'btn', () => {
        stopListening();
        results.innerHTML = '';
        const form = document.createElement('div');
        form.className = 'squat-manual';
        results.appendChild(form);
        para(form, act.manualText || 'Kolega stopne čas, za který se otočíš třikrát dokola (ruce u těla). Zadej čas v sekundách.', 'muted');
        const l = document.createElement('label');
        l.className = 'jump-field';
        l.textContent = 'Čas tří otáček: ';
        const inp = document.createElement('input');
        inp.type = 'number'; inp.min = '1'; inp.max = '30'; inp.step = '0.1';
        l.appendChild(inp);
        form.appendChild(l);
        button(form, 'Spočítat', 'btn primary', () => {
          const t = Number(String(inp.value).replace(',', '.'));
          if (!(t >= 1 && t <= 30)) { status.textContent = 'Zadej čas mezi 1 a 30 s.'; status.className = 'feedback bad'; return; }
          finish(3 * 360 / t, false, 3);
        });
      });
    });
  }

  /* Stroboskopická fotografie (fotografická laboratoř): na „fotce“ je několik poloh téhož předmětu
     (sprinter, padající míč) v pravidelných časech a pásmo s metry. Hráč nejdřív nastaví měřítko
     (dva zelené ukazatele na značky pásma), pak položí ukazatel každého snímku na značku na předmětu
     a fotku „vyvolá“: tabulka Δs, průměrná rychlost v = Δs / Δt a zrychlení a = Δv / Δt; u míče
     proložení s = ½ g t² (g) a porovnání polohové a pohybové energie. Ukazatel blízko správné značky
     přiskočí (přesné odečtení). Nastavení: orientation x|y, frames [{t, s}] (m), unit m|cm, scalePx
     (px na jednotku), origin [px, px], ruler {from, to, step}, calib {a, b}, object runner|ball,
     massKg, goal 'speed'|'g', var. Proměnné: <var>_v (m/s, poslední úsek), <var>_a (m/s², první dva
     úseky), <var>_g (m/s², jen míč), <var>_hotovo. */
  function openStrobo(act) {
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
    const horiz = act.orientation !== 'y';
    const unitM = act.unit === 'cm' ? 0.01 : 1;        // jednotka pásma v metrech
    const K = act.scalePx || 44;                        // px na jednotku pásma
    const [OX, OY] = act.origin || (horiz ? [40, 230] : [300, 30]);
    const frames = act.frames;
    const ruler = act.ruler || { from: 0, to: 12, step: 1 };
    const calib = act.calib || { a: ruler.from, b: ruler.to };
    const SNAP = act.snapPx || 12;
    const pxOf = (u) => (horiz ? OX + u * K : OY + u * K);   // poloha v jednotkách pásma → px podél pohybu
    const truePx = frames.map((f) => pxOf(f.s / unitM));
    // ukazatele: 2 kalibrační + 1 na snímek; začínají rozházené
    const W = 600, H = 340, DIM = horiz ? W : H;
    // ukazatele začínají rozmístěné rovnoměrně (bez překryvů), ne na správných místech
    const cursors = [
      { kind: 'calib', key: 'a', label: `${fmt(calib.a)} ${act.unit || 'm'}`, px: DIM * 0.15, target: pxOf(calib.a) },
      { kind: 'calib', key: 'b', label: `${fmt(calib.b)} ${act.unit || 'm'}`, px: DIM * 0.85, target: pxOf(calib.b) },
      ...frames.map((f, i) => ({ kind: 'frame', i, label: `${fmt(f.t, 1)} s`, px: DIM * 0.25 + (DIM * 0.5) * (i / Math.max(1, frames.length - 1)), target: truePx[i] })),
    ];
    let done = false, dragging = null;
    const v = act.var || 'strobo';
    const out = {};

    openModal((box) => {
      box.classList.add('activity-box', 'pack-box');
      heading(box, act.title || 'Stroboskopická fotografie');
      para(box, act.intro || '', 'question');
      const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'pack-svg strobo-photo' }, box);
      para(box, act.dragHint || 'Zelené ukazatele přetáhni na značky pásma (měřítko), oranžové na značku na předmětu v každém snímku. Pak fotku vyvolej.', 'muted small');
      const readout = document.createElement('div');
      readout.className = 'pack-readout strobo-table';
      box.appendChild(readout);
      const eq = para(box, '', 'muted small');
      const status = para(box, '', 'feedback');
      const actions = document.createElement('div');
      actions.className = 'squat-buttons';
      box.appendChild(actions);
      const dev = button(actions, act.developLabel || 'Vyvolat fotku', 'btn primary', () => develop());

      function drawRunner(parent, x, y, i, n) {
        // běžec z boku (doprava), póza podle snímku; y = úroveň chodidel, značka na kyčli
        const ph = (i / Math.max(1, n - 1));
        const hipY = y - 1.0 * K / unitM * 1, headY = y - 1.65 * K / unitM;
        const scale = K / unitM;           // px na metr
        const hy = y - 1.0 * scale, hdY = y - 1.62 * scale;
        const lean = (1 - ph) * 0.35;      // na startu předkloněný
        const sx = x + lean * 0.5 * scale;
        el('line', { x1: x, y1: hy, x2: sx, y2: hdY + 0.12 * scale, stroke: '#cfd3d6', 'stroke-width': 4, 'stroke-linecap': 'round' }, parent);   // trup
        el('circle', { cx: sx + lean * 0.1 * scale, cy: hdY, r: 0.11 * scale, fill: '#cfd3d6' }, parent);
        const legA = 0.5 + 0.4 * Math.sin(i * 2.1), legB = -0.5 + 0.4 * Math.cos(i * 1.7);
        el('path', { d: `M${x},${hy} l${legA * 0.42 * scale},${0.48 * scale} l${0.1 * scale},${0.5 * scale}`, fill: 'none', stroke: '#cfd3d6', 'stroke-width': 4, 'stroke-linecap': 'round' }, parent);
        el('path', { d: `M${x},${hy} l${legB * 0.42 * scale},${0.5 * scale} l${-0.15 * scale},${0.45 * scale}`, fill: 'none', stroke: '#cfd3d6', 'stroke-width': 4, 'stroke-linecap': 'round' }, parent);
        const shY = hdY + 0.25 * scale;
        el('path', { d: `M${sx},${shY} l${0.35 * scale},${0.1 * scale} l${0.05 * scale},${-0.3 * scale}`, fill: 'none', stroke: '#cfd3d6', 'stroke-width': 3.5, 'stroke-linecap': 'round' }, parent);
        el('path', { d: `M${sx},${shY} l${-0.3 * scale},${0.15 * scale} l${-0.1 * scale},${0.3 * scale}`, fill: 'none', stroke: '#cfd3d6', 'stroke-width': 3.5, 'stroke-linecap': 'round' }, parent);
        el('circle', { cx: x, cy: hy, r: 5, fill: '#ffd28a', stroke: '#1a1a16', 'stroke-width': 1.5 }, parent);   // reflexní značka na kyčli
        void hipY; void headY;
      }

      function draw() {
        svg.innerHTML = '';
        el('rect', { x: 0, y: 0, width: W, height: H, fill: '#0c0d12', rx: 6 }, svg);
        el('rect', { x: 6, y: 6, width: W - 12, height: H - 12, fill: 'none', stroke: '#2b2d38', 'stroke-width': 2 }, svg);
        // pásmo
        const rg = el('g', {}, svg);
        if (horiz) {
          el('rect', { x: pxOf(ruler.from) - 10, y: OY + 8, width: pxOf(ruler.to) - pxOf(ruler.from) + 20, height: 18, fill: '#d9c25a' }, rg);
          for (let u = ruler.from; u <= ruler.to + 1e-9; u += ruler.step) {
            const x = pxOf(u);
            el('line', { x1: x, y1: OY + 8, x2: x, y2: OY + 26, stroke: '#1a1a16', 'stroke-width': 1.5 }, rg);
            el('text', { x, y: OY + 40, 'font-size': 10, 'text-anchor': 'middle', fill: '#d8cfae' }, rg, fmt(u));
          }
          el('text', { x: pxOf(ruler.to) + 14, y: OY + 22, 'font-size': 10, fill: '#d8cfae' }, rg, act.unit || 'm');
          el('line', { x1: 0, y1: OY, x2: W, y2: OY, stroke: '#3a3a44', 'stroke-width': 1 }, rg);   // dráha
        } else {
          el('rect', { x: OX - 150, y: pxOf(ruler.from) - 10, width: 18, height: pxOf(ruler.to) - pxOf(ruler.from) + 20, fill: '#d9c25a' }, rg);
          for (let u = ruler.from; u <= ruler.to + 1e-9; u += ruler.step) {
            const y = pxOf(u);
            el('line', { x1: OX - 150, y1: y, x2: OX - 132, y2: y, stroke: '#1a1a16', 'stroke-width': 1.5 }, rg);
            if (Math.round(u / ruler.step) % (act.labelEvery || 2) === 0) el('text', { x: OX - 156, y: y + 4, 'font-size': 10, 'text-anchor': 'end', fill: '#d8cfae' }, rg, fmt(u));
          }
          el('text', { x: OX - 141, y: pxOf(ruler.from) - 16, 'font-size': 10, 'text-anchor': 'middle', fill: '#d8cfae' }, rg, act.unit || 'm');
        }
        // snímky
        frames.forEach((f, i) => {
          const p = truePx[i];
          const fg = el('g', { opacity: 0.55 + 0.45 * (i / Math.max(1, frames.length - 1)) }, svg);
          if (act.object === 'ball') {
            el('circle', { cx: OX, cy: p, r: (act.ballR || 0.12) * K / unitM, fill: '#c0603a', stroke: '#2a1a10', 'stroke-width': 1.5 }, fg);
            el('circle', { cx: OX, cy: p, r: 4, fill: '#ffd28a', stroke: '#1a1a16', 'stroke-width': 1.2 }, fg);
          } else {
            drawRunner(fg, p, OY, i, frames.length);
          }
          el('text', horiz ? { x: p, y: OY - 1.8 * K / unitM, 'font-size': 10, 'text-anchor': 'middle', fill: '#8aa0b0' } : { x: OX + 40, y: p + 4, 'font-size': 10, fill: '#8aa0b0' }, svg, `t = ${fmt(f.t, 1)} s`);
        });
        // blesk stroboskopu
        el('text', { x: W - 10, y: 20, 'font-size': 10, 'text-anchor': 'end', fill: '#8aa0b0' }, svg, `stroboskop ${fmt(1 / (frames[1].t - frames[0].t), 1)} záblesků/s`);
        // ukazatele
        cursors.forEach((c, k) => {
          const col = c.kind === 'calib' ? '#9fd0a0' : '#e0a060';
          const grp = el('g', { class: 'strobo-cursor', 'data-k': k }, svg);
          if (horiz) {
            el('line', { x1: c.px, y1: 14, x2: c.px, y2: H - 14, stroke: col, 'stroke-width': 1.5, 'stroke-dasharray': c.kind === 'calib' ? '4 3' : 'none' }, grp);
            const ty = c.kind === 'calib' ? H - 18 : 30 + (c.i % 2) * 14;
            el('rect', { x: c.px - 20, y: ty - 11, width: 40, height: 14, rx: 4, fill: col }, grp);
            el('text', { x: c.px, y: ty, 'font-size': 10, 'text-anchor': 'middle', fill: '#111' }, grp, c.label);
            el('rect', { x: c.px - 10, y: 10, width: 20, height: H - 20, fill: 'transparent' }, grp);
          } else {
            el('line', { x1: 60, y1: c.px, x2: W - 14, y2: c.px, stroke: col, 'stroke-width': 1.5, 'stroke-dasharray': c.kind === 'calib' ? '4 3' : 'none' }, grp);
            const tx = c.kind === 'calib' ? 90 : W - 50 - (c.i % 2) * 52;   // popisky snímků střídavě, aby se nepřekrývaly
            el('rect', { x: tx - 20, y: c.px - 7, width: 40, height: 14, rx: 4, fill: col }, grp);
            el('text', { x: tx, y: c.px + 4, 'font-size': 10, 'text-anchor': 'middle', fill: '#111' }, grp, c.label);
            el('rect', { x: 60, y: c.px - 10, width: W - 74, height: 20, fill: 'transparent' }, grp);
          }
        });
      }

      function develop() {
        const ca = cursors[0], cb = cursors[1];
        if (Math.abs(ca.px - ca.target) > 6 || Math.abs(cb.px - cb.target) > 6) {
          sound.sfx('wrong');
          status.textContent = act.badCalib || `Měřítko nesedí: zelené ukazatele musí ležet přesně na značkách ${ca.label} a ${cb.label} pásma.`;
          status.className = 'feedback bad';
          return;
        }
        const scale = (cb.px - ca.px) / (calib.b - calib.a);        // px na jednotku pásma
        const off = cursors.slice(2).find((c) => Math.abs(c.px - c.target) > 6);
        if (off) {
          sound.sfx('wrong');
          status.textContent = tplLocal(act.badFrame || 'Ukazatel {t} s neleží na značce {mark}. Přisuň ho – blízko značky přiskočí.', { t: fmt(frames[off.i].t, 1), mark: act.object === 'ball' ? 'uprostřed míče' : 'na kyčli běžce' });
          status.className = 'feedback bad';
          return;
        }
        const s = cursors.slice(2).map((c) => ((c.px - ca.px) / scale + calib.a) * unitM);   // m
        const rows = [];
        const vs = [];
        for (let i = 1; i < frames.length; i++) {
          const dt = frames[i].t - frames[i - 1].t, ds = s[i] - s[i - 1], vv = ds / dt;
          vs.push(vv);
          const acc = i >= 2 ? (vv - vs[i - 2]) / dt : null;
          rows.push([`${fmt(frames[i - 1].t, 1)}–${fmt(frames[i].t, 1)} s: Δs = ${fmt(ds, act.object === 'ball' ? 3 : 2)} m`, `v = ${fmt(vv, 2)} m/s${acc !== null ? ` · a = ${fmt(acc, 1)} m/s²` : ''}`]);
        }
        let gFit = null;
        if (act.goal === 'g') {
          let num = 0, den = 0;
          frames.forEach((f, i) => { num += s[i] * f.t * f.t; den += 0.5 * Math.pow(f.t, 4); });
          gFit = num / den;
          const tl = frames[frames.length - 1].t, sl = s[frames.length - 1];
          const vEnd = gFit * tl;
          rows.push(['Proložení s = ½ g t² (všechny snímky)', `g ≈ ${fmt(gFit, 2)} m/s²`]);
          rows.push([`Polohová energie ztracená za ${fmt(tl, 1)} s: m · g · h = ${fmt(act.massKg, 1)} · 9,81 · ${fmt(sl, 2)}`, `${fmt(act.massKg * g * sl, 2)} J`]);
          rows.push([`Pohybová energie ½ m v² (v = g · t ≈ ${fmt(vEnd, 2)} m/s)`, `${fmt(0.5 * act.massKg * vEnd * vEnd, 2)} J`]);
        }
        readoutRows(readout, rows);
        eq.textContent = horiz
          ? `Měřítko: ${fmt(cb.px - ca.px)} px na fotce = ${fmt(calib.b - calib.a)} ${act.unit || 'm'}, tedy ${fmt(scale, 1)} px na ${act.unit || 'm'}. Průměrná rychlost v úseku = Δs / Δt, zrychlení = (v₂ − v₁) / Δt.`
          : `Měřítko: ${fmt(cb.px - ca.px)} px = ${fmt(calib.b - calib.a)} ${act.unit || 'm'}. Mezery mezi snímky rostou: míč zrychluje. Za stejný čas Δt urazí víc, protože v = g · t roste.`;
        done = true;
        sound.sfx('unlock');
        const lastV = vs[vs.length - 1];
        out[`${v}_v`] = Math.round(lastV * 100) / 100;
        if (vs.length >= 2) out[`${v}_a`] = Math.round((vs[1] - vs[0]) / (frames[1].t - frames[0].t) * 10) / 10;
        if (gFit !== null) out[`${v}_g`] = Math.round(gFit * 100) / 100;
        out[`${v}_hotovo`] = 1;
        status.textContent = tplLocal(act.success || 'Fotka vyvolaná.', { v: lastV, a: out[`${v}_a`] || 0, g: gFit || 0 });
        status.className = 'feedback good';
        dev.remove();
        button(actions, 'Pokračovat ›', 'btn activity-next', () => finishActivity(act, out));
      }

      // tažení ukazatelů (jen podél směru pohybu), s přiskočením ke značce
      const toPx = (e) => {
        const b = svg.getBoundingClientRect();
        return horiz ? ((e.clientX - b.left) / b.width) * W : ((e.clientY - b.top) / b.height) * H;
      };
      svg.addEventListener('pointerdown', (e) => {
        if (done) return;
        const t = e.target.closest('.strobo-cursor');
        if (!t) return;
        e.preventDefault();
        dragging = { c: cursors[Number(t.dataset.k)], grab: cursors[Number(t.dataset.k)].px - toPx(e) };
        svg.setPointerCapture(e.pointerId);
      });
      svg.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        dragging.c.px = Math.max(12, Math.min((horiz ? W : H) - 12, toPx(e) + dragging.grab));
        draw();
      });
      const up = () => {
        if (!dragging) return;
        const c = dragging.c;
        if (Math.abs(c.px - c.target) <= SNAP) { c.px = c.target; sound.sfx('key'); }
        dragging = null;
        draw();
      };
      svg.addEventListener('pointerup', up);
      svg.addEventListener('pointercancel', up);
      draw();
    });
  }

  /* Hod (šikmý vrh z výšky odhodu, bez odporu vzduchu). Kola „rounds“: { name, text, object, speed,
     h0, target, targetLabel, xMax, tick, success, var } – rychlost je daná, hráč hledá úhel, při kterém
     předmět doletí aspoň na normu. Po posledním kole lze zkoušet i jinou rychlost (dolet roste
     s druhou mocninou rychlosti). Proměnné: hod_hotovo, <var>_uhel a <var>_m (nejlepší hod kola). */
  function openThrow(act) {
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
    const X0 = 46, Y0 = 262;
    let idx = 0, angleDeg = act.startAngle || 60, speed = act.rounds[0].speed, free = false, flying = false;
    let throws = [], best = null, roundDone = false, raf = 0;
    const out = { hod_hotovo: 1 };

    // dolet měřený od místa, odkud se měří (u hodu vsedě od stěny): x0 = kde předmět opustí ruce
    const range = (v, a, h, x0 = 0) => {
      const r = a * Math.PI / 180, vx = v * Math.cos(r), vy = v * Math.sin(r);
      const t = (vy + Math.sqrt(vy * vy + 2 * g * h)) / g;
      return { d: x0 + vx * t, t, vx, vy };
    };

    openModal((box) => {
      box.classList.add('activity-box', 'pack-box');
      heading(box, act.title || 'Hod');
      para(box, act.intro || '', 'question');
      const info = para(box, '', 'lean-step');
      const svg = el('svg', { viewBox: '0 0 600 300', class: 'pack-svg throw-svg' }, box);
      const controls = document.createElement('div');
      controls.className = 'throw-controls';
      box.appendChild(controls);
      const mk = (label, min, max, step, get, set) => {
        const l = document.createElement('label');
        l.className = 'stance-slider';
        const t = document.createElement('span');
        const r = document.createElement('input');
        r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = get();
        const upd = () => { t.textContent = label(get()); };
        r.addEventListener('input', () => { set(Number(r.value)); upd(); drawScene(); });
        upd();
        l.append(t, r);
        controls.appendChild(l);
        return { r, upd };
      };
      const aS = mk((v) => `${act.angleLabel || 'Úhel odhodu'}: ${v}°`, 5, 85, 1, () => angleDeg, (v) => { angleDeg = v; });
      const vS = mk((v) => `${act.speedLabel || 'Rychlost odhodu'}: ${fmt(v, 1)} m/s${free ? '' : ' (daná)'}`, 2, 30, 0.5, () => speed, (v) => { speed = v; });
      const throwBtn = button(controls, act.throwLabel || 'Hodit', 'btn primary', () => doThrow());
      const readout = document.createElement('div');
      readout.className = 'pack-readout';
      box.appendChild(readout);
      const status = para(box, '', 'feedback');
      const actions = document.createElement('div');
      actions.className = 'squat-buttons';
      box.appendChild(actions);

      const round = () => act.rounds[idx];
      const K = () => (600 - X0 - 24) / round().xMax;
      const SX = (x) => X0 + x * K(), SY = (y) => Y0 - y * K();

      function drawScene(ball) {
        const r = round();
        info.textContent = `Kolo ${idx + 1}/${act.rounds.length}: ${r.name}`;
        svg.innerHTML = '';
        el('rect', { x: 0, y: 0, width: 600, height: 300, fill: 'rgba(0,0,0,0.25)', rx: 8 }, svg);
        el('line', { x1: 0, y1: Y0, x2: 600, y2: Y0, stroke: '#5a4a30', 'stroke-width': 2 }, svg);
        for (let x = 0; x <= r.xMax + 1e-9; x += r.tick) {
          el('line', { x1: SX(x), y1: Y0, x2: SX(x), y2: Y0 + 6, stroke: '#8d7a58' }, svg);
          el('text', { x: SX(x), y: Y0 + 18, 'text-anchor': 'middle', 'font-size': 10, fill: '#a39580' }, svg, `${fmt(x, x % 1 ? 1 : 0)}`);
        }
        el('text', { x: 590, y: Y0 + 32, 'text-anchor': 'end', 'font-size': 10, fill: '#a39580' }, svg, 'm');
        // norma
        el('line', { x1: SX(r.target), y1: Y0, x2: SX(r.target), y2: Y0 - 70, stroke: '#9fbf7a', 'stroke-width': 2 }, svg);
        el('path', { d: `M${SX(r.target)},${Y0 - 70} l22,7 l-22,7 z`, fill: '#9fbf7a' }, svg);
        el('text', { x: SX(r.target) + 4, y: Y0 - 76, 'font-size': 11, fill: '#9fbf7a' }, svg, r.targetLabel || `${fmt(r.target, 2)} m`);
        let relX, relY;
        if (r.pose === 'sed') {
          // odhod vsedě: záda opřená o stěnu, nohy natažené, míč od hrudníku (souřadnice v metrech)
          const P = (x, y) => [SX(x), SY(y)];
          const line = (a, b, color, w) => el('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: color, 'stroke-width': w, 'stroke-linecap': 'round' }, svg);
          el('rect', { x: SX(0) - 10, y: SY(2.2), width: 10, height: SY(0) - SY(2.2), fill: '#3a3a30', stroke: '#5a5a48' }, svg);
          el('text', { x: SX(0) - 14, y: SY(2.05), 'text-anchor': 'end', 'font-size': 10, fill: '#a39580' }, svg, 'stěna');
          const hip = P(0.16, 0.1), sh = P(0.12, 0.6), hand = P(r.x0 || 0, r.h0);
          line(hip, P(1.05, 0.05), '#4f5638', 7);                          // natažené nohy
          line(hip, sh, '#566040', 9);                                      // záda u stěny
          el('circle', { cx: SX(0.13), cy: SY(0.76), r: 0.09 * K(), fill: '#6b6650' }, svg);
          line(sh, hand, '#c9b08a', 4);                                     // paže k míči
          [relX, relY] = hand;
        } else {
          // vrhač ve stoje (výška ~1,8 m v měřítku, ale aspoň 40 px)
          const hpx = Math.max(40, 1.8 * K());
          relX = SX(r.x0 || 0) + 6;
          relY = Y0 - Math.max(r.h0 * K(), hpx * (r.h0 / 1.8));
          el('line', { x1: X0, y1: Y0, x2: X0, y2: Y0 - hpx * 0.55, stroke: '#4f5638', 'stroke-width': 6, 'stroke-linecap': 'round' }, svg);
          el('line', { x1: X0, y1: Y0 - hpx * 0.55, x2: X0, y2: Y0 - hpx * 0.85, stroke: '#566040', 'stroke-width': 8, 'stroke-linecap': 'round' }, svg);
          el('circle', { cx: X0, cy: Y0 - hpx * 0.93, r: Math.max(4, hpx * 0.07), fill: '#6b6650' }, svg);
          el('line', { x1: X0, y1: Y0 - hpx * 0.8, x2: relX, y2: relY, stroke: '#c9b08a', 'stroke-width': 4, 'stroke-linecap': 'round' }, svg);
        }
        // směr odhodu
        const a = angleDeg * Math.PI / 180;
        el('line', { x1: relX, y1: relY, x2: relX + 46 * Math.cos(a), y2: relY - 46 * Math.sin(a), stroke: '#ffd28a', 'stroke-width': 2, 'stroke-dasharray': '4 3' }, svg);
        if (!ball && !flying) el('circle', { cx: relX, cy: relY, r: r.object === 'granat' ? 4 : 7, fill: r.object === 'granat' ? '#55603a' : '#7a4a2a', stroke: '#111' }, svg);
        // předchozí hody
        throws.forEach((t, i) => {
          const last = i === throws.length - 1;
          el('path', { d: t.path, fill: 'none', stroke: last ? '#ffd28a' : 'rgba(255,210,138,0.3)', 'stroke-width': last ? 2 : 1.5 }, svg);
          el('circle', { cx: SX(t.d), cy: Y0, r: 3, fill: t.d >= r.target ? '#9fbf7a' : '#e0805f' }, svg);
          if (last) el('text', { x: SX(t.d), y: Y0 - 8, 'text-anchor': 'middle', 'font-size': 11, fill: '#ffd28a' }, svg, `${fmt(t.d, 2)} m · ${t.a}°`);
        });
        if (ball) el('circle', { cx: ball[0], cy: ball[1], r: r.object === 'granat' ? 4 : 7, fill: r.object === 'granat' ? '#55603a' : '#7a4a2a', stroke: '#111' }, svg);
        readout.innerHTML = '';
        for (const [k, v] of [
          ['Výška odhodu', `${fmt(r.h0, 1)} m${r.x0 ? `, ${fmt(r.x0, 1)} m před stěnou` : ''}`],
          ['Nejlepší hod', best ? `${fmt(best.d, 2)} m pod úhlem ${best.a}°` : '–'],
        ]) {
          const d = document.createElement('div');
          const s1 = document.createElement('span'); s1.textContent = k;
          const s2 = document.createElement('strong'); s2.textContent = v;
          d.append(s1, s2);
          readout.appendChild(d);
        }
        vS.r.disabled = !free;
        vS.upd();
      }

      function doThrow() {
        if (flying) return;
        const r = round();
        const x0 = r.x0 || 0;
        const res = range(speed, angleDeg, r.h0, x0);
        const pts = [];
        const n = 40;
        for (let i = 0; i <= n; i++) {
          const t = res.t * i / n;
          pts.push([SX(x0 + res.vx * t), SY(r.h0 + res.vy * t - g * t * t / 2)]);
        }
        const path = `M${pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' L')}`;
        flying = true;
        throwBtn.disabled = true;
        sound.sfx('step');
        const t0 = performance.now(), dur = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 900;
        const step = () => {
          const f = Math.min(1, (performance.now() - t0) / dur);
          const i = Math.min(n, Math.floor(f * n));
          drawScene(pts[i]);
          if (f < 1) { raf = requestAnimationFrame(step); return; }
          flying = false;
          throwBtn.disabled = false;
          const th = { d: res.d, a: angleDeg, v: speed, path };
          throws.push(th);
          if (throws.length > 6) throws.shift();
          if (!free && (!best || res.d > best.d)) best = { d: res.d, a: angleDeg };
          sound.sfx(res.d >= r.target ? 'squatOk' : 'squatShallow');
          drawScene();
          if (free) {
            status.textContent = `${fmt(speed, 1)} m/s pod ${angleDeg}° → ${fmt(res.d, 2)} m. ${act.freeTip || ''}`;
            status.className = 'feedback';
            return;
          }
          if (res.d >= r.target && !roundDone) {
            roundDone = true;
            out[`${r.var}_uhel`] = angleDeg;
            out[`${r.var}_m`] = Math.round(res.d * 100) / 100;
            status.textContent = r.success || 'Norma splněna!';
            status.className = 'feedback good';
            sound.sfx('unlock');
            const last = idx + 1 >= act.rounds.length;
            button(actions, last ? 'Pokračovat ›' : 'Další kolo ›', last ? 'btn activity-next' : 'btn primary', () => {
              actions.innerHTML = '';
              if (last) { finishActivity(act, out); return; }
              idx += 1;
              throws = []; best = null; roundDone = false;
              speed = round().speed;
              status.textContent = round().text || '';
              status.className = 'feedback';
              drawScene();
            });
            if (last && act.freeLabel) {
              button(actions, act.freeLabel, 'btn', () => {
                free = true;
                status.textContent = act.freeText || '';
                status.className = 'feedback';
                drawScene();
              });
            }
          } else if (!roundDone) {
            status.textContent = res.d < r.target ? `${fmt(res.d, 2)} m – ${act.shortTip || 'krátké. Zkus jiný úhel.'}` : '';
            status.className = 'feedback bad';
          }
        };
        raf = requestAnimationFrame(step);
      }
      activityCleanup = () => cancelAnimationFrame(raf);
      status.textContent = round().text || '';
      drawScene();
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
          const mod = await import('./predklon.js?v=0.30');
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
      } else {
        const ul = document.createElement('ul');
        ul.className = 'notes';
        for (const note of game.state.notes) {
          const li = document.createElement('li');
          li.textContent = note;
          ul.appendChild(li);
        }
        box.appendChild(ul);
      }
      // deník docenta D. – nalezené stránky (ze všech světů)
      const pages = diaryPages();
      if (!pages.length) return;
      const found = diaryFoundSet();
      const h3 = document.createElement('h3');
      h3.className = 'notes-sub';
      h3.textContent = `Deník docenta D. (nalezeno stran: ${found.size})`;
      box.appendChild(h3);
      const list = document.createElement('div');
      list.className = 'diary-list';
      for (const pg of pages) {
        if (!found.has(pg.id)) continue;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'link';
        const place = diaryPlace(pg);
        b.textContent = `${place.world} ${place.num}: ${pg.title}`;
        b.addEventListener('click', () => openDiaryPage(pg.id));
        list.appendChild(b);
      }
      if (!found.size) {
        const p = document.createElement('p');
        p.className = 'notes-empty';
        p.textContent = 'Stránky deníku leží za branami.';
        list.appendChild(p);
      }
      box.appendChild(list);
    });
  }

  /* ---------- Deník docenta D. a mapa bran ----------
     Za každou branou (a na konci chodeb) najde hráč stránku deníku: lekce brány jednou větou a kousek
     docentova života. Nalezené stránky se pamatují napříč světy (nastavení prohlížeče), čtou se
     v zápisníku a na mapě bran (Menu, titulní obrazovka). Texty jsou v game.json („diary“). */
  const diaryPages = () => (data.diary || {}).pages || [];
  const diaryFoundSet = () => Game.diaryFound(data, game && game.state);
  /* Číslo stránky v rámci světa a název světa (deník se čísluje po světech). */
  function diaryPlace(pg) {
    const same = diaryPages().filter((p) => p.track === pg.track);
    const track = data.tracks.find((tr) => tr.id === pg.track);
    return { num: same.indexOf(pg) + 1, world: track ? track.name : '' };
  }

  function openDiaryPage(id, fresh) {
    const pages = diaryPages();
    const idx = pages.findIndex((p) => p.id === id);
    if (idx < 0) return;
    const pg = pages[idx];
    openModal((box) => {
      heading(box, fresh ? 'Stránka z docentova deníku' : 'Deník docenta D.');
      const paper = document.createElement('div');
      paper.className = 'paper long diary';
      const num = document.createElement('div');
      num.className = 'diary-num';
      const place = diaryPlace(pg);
      num.textContent = `${place.world} · strana ${place.num}`;
      const h = document.createElement('div');
      h.className = 'diary-title';
      h.textContent = pg.title;
      const body = document.createElement('div');
      body.className = 'diary-text';
      body.textContent = pg.text;
      const sign = document.createElement('div');
      sign.className = 'diary-sign';
      sign.textContent = pg.sign || '– D.';
      paper.append(num, h, body, sign);
      box.appendChild(paper);
      const row = document.createElement('div');
      row.className = 'diary-actions';
      const found = diaryFoundSet();
      const prev = pages.slice(0, idx).reverse().find((p) => found.has(p.id));
      const next = pages.slice(idx + 1).find((p) => found.has(p.id));
      const mk = (label, fn, cls) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = cls || 'btn';
        b.textContent = label;
        b.addEventListener('click', fn);
        row.appendChild(b);
      };
      if (prev) mk('‹ Předchozí', () => openDiaryPage(prev.id));
      mk('Mapa bran', () => openMap());
      if (next) mk('Další ›', () => openDiaryPage(next.id));
      mk(fresh ? 'Pokračovat' : 'Zavřít', closeModal, 'btn primary');
      box.appendChild(row);
    });
    sound.sfx('page');
  }

  function openMap() {
    const pages = diaryPages();
    const found = diaryFoundSet();
    const diary = data.diary || {};
    openModal((box) => {
      heading(box, 'Mapa bran');
      const intro = document.createElement('p');
      intro.className = 'map-intro';
      intro.textContent = `${diary.mapNote || ''} Deník docenta D.: nalezeno stran ${found.size}.`.trim();
      box.appendChild(intro);
      box.appendChild(buildMapSvg(pages, found));
      const legend = document.createElement('p');
      legend.className = 'map-legend';
      legend.textContent = 'Zlatá = prošlá, se stránkou deníku (klikni). Tmavá = čeká. Přerušovaná = zatím nepřístupná. Malé kolečko = chodba mezi branami.';
      box.appendChild(legend);
      const row = document.createElement('div');
      row.className = 'diary-actions';
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn primary';
      b.textContent = 'Zavřít';
      b.addEventListener('click', closeModal);
      row.appendChild(b);
      box.appendChild(row);
    });
  }

  /* Mapa: tři světy vedle sebe, v každém devět bran odspodu nahoru (postavené s číslem a jménem,
     nepostavené přerušovaně), chodby mezi branami jako menší kolečka; nahoře společná střecha,
     kam vede devátá brána každého světa. */
  function buildMapSvg(pages, found) {
    const NS = 'http://www.w3.org/2000/svg';
    const el = (tag, attrs, text) => {
      const e = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
      if (text !== undefined) e.textContent = text;
      return e;
    };
    const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
    const GATES = data.meta.totalGates || 9;
    const cols = data.tracks.map((tr) => {
      const nodes = [];
      let gateNo = 0;
      for (const roomId of tr.rooms) {
        const room = data.rooms[roomId] || {};
        const page = pages.find((p) => p.room === roomId);
        if (room.gate) {
          gateNo += 1;
          nodes.push({ kind: 'gate', n: gateNo, room, page, label: room.gateLabel || `Brána ${room.gateNumber || ROMAN[gateNo]}` });
        } else nodes.push({ kind: 'passage', room, page, label: room.gateLabel || '' });
      }
      const sample = tr.rooms.map((r) => data.rooms[r]).find((r) => r && r.gate) || {};
      const levels = /^LEVEL/i.test(sample.gateLabel || '');
      for (let n = gateNo + 1; n <= GATES; n++) nodes.push({ kind: 'unknown', n, label: levels ? `LEVEL ${n}` : `Brána ${ROMAN[n]}` });
      return { track: tr, nodes };
    });
    const rows = Math.max(...cols.map((c) => c.nodes.length));
    const colW = 236, W = colW * cols.length + 16, step = 50, top = 96, bottom = top + rows * step, H = bottom + 44;
    const svg = el('svg', { class: 'map-svg', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Mapa bran: každý svět má ${GATES} bran, nalezeno ${found.size} stran deníku` });
    // střecha
    svg.appendChild(el('path', { class: 'building', d: `M 8 ${bottom + 14} V 70 L ${W / 2} 16 L ${W - 8} 70 V ${bottom + 14} Z` }));
    svg.appendChild(el('line', { class: 'link-line', x1: 8, y1: 70, x2: W - 8, y2: 70 }));
    svg.appendChild(el('text', { class: 'label', x: W / 2, y: 46, 'text-anchor': 'middle' }, 'Střecha'));
    svg.appendChild(el('text', { class: 'small', x: W / 2, y: 61, 'text-anchor': 'middle' }, 'devátá brána každého světa vede nahoru'));
    cols.forEach((c, ci) => {
      const x0 = 8 + ci * colW;
      const nx = x0 + 32;
      svg.appendChild(el('line', { class: 'link-line', x1: nx, y1: bottom - step / 2, x2: nx, y2: 70 }));
      svg.appendChild(el('text', { class: 'world', x: x0 + colW / 2, y: bottom + 34, 'text-anchor': 'middle' }, c.track.name));
      c.nodes.forEach((n, ri) => {
        const y = bottom - step / 2 - ri * step;
        const g = el('g', { class: 'gate' });
        const lit = Boolean(n.page && found.has(n.page.id));
        if (n.kind === 'unknown') {
          g.appendChild(el('circle', { class: 'node unknown', cx: nx, cy: y, r: 15 }));
          g.appendChild(el('text', { class: `num${ROMAN[n.n].length > 3 ? ' tight' : ''}`, x: nx, y }, ROMAN[n.n]));
          g.appendChild(el('text', { class: 'label dim', x: nx + 24, y: y + 1 }, n.label));
          g.appendChild(el('text', { class: 'small', x: nx + 24, y: y + 15 }, 'zatím nepřístupná'));
        } else {
          const name = (n.page && n.page.short) || n.room.name || '';
          const r = n.kind === 'gate' ? 15 : 9;
          const circle = el('circle', { class: `node${lit ? ' lit' : ''}${n.kind === 'passage' ? ' passage' : ''}`, cx: nx, cy: y, r });
          if (lit) {
            circle.setAttribute('tabindex', '0');
            circle.setAttribute('role', 'button');
            circle.setAttribute('aria-label', `Deník: ${n.page.title}`);
            circle.addEventListener('click', () => openDiaryPage(n.page.id));
            circle.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDiaryPage(n.page.id); } });
          }
          g.appendChild(circle);
          if (n.kind === 'gate') g.appendChild(el('text', { class: `num${ROMAN[n.n].length > 3 ? ' tight' : ''}`, x: nx, y }, ROMAN[n.n]));
          g.appendChild(el('text', { class: n.kind === 'gate' ? 'label' : 'label dim', x: nx + 24, y: y + 1 }, n.label ? `${n.label} · ${name}` : name));
          g.appendChild(el('text', { class: 'small', x: nx + 24, y: y + 15 }, lit ? `deník: ${n.page.title}` : n.page ? 'stránka deníku čeká' : ''));
        }
        svg.appendChild(g);
      });
    });
    return svg;
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
      add('Mapa bran a deník', () => { closeModal(); openMap(); });
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
      const stormLabel = () => `Bouřka venku: ${stormOn() ? 'ano' : 'ne'}`;
      const stormBtn = add(stormLabel(), () => {
        Game.setSetting('storm', !stormOn());
        updateStorm();
        stormBtn.textContent = stormLabel();
      });
      if (game.room && ((game.room.type === 'corridor' && (game.room.corridor.skeletons || []).length) || game.room.type === 'world3d')) {
        const atkLabel = () => `Kostlivci útočí: ${Game.getSetting('kostlivciUtoci', true) ? 'ano' : 'ne'}`;
        const atkBtn = add(atkLabel(), () => {
          const on = !Game.getSetting('kostlivciUtoci', true);
          Game.setSetting('kostlivciUtoci', on);
          if (corridor) corridor.setAttacks(on);
          if (world3d) world3d.setAttacks(on);
          atkBtn.textContent = atkLabel();
        });
      }
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
    // basketbalový automat: šipky = úhel a rychlost, mezerník / Enter = hod
    if (modalOpen && basketKey && basketKey(e)) {
      e.preventDefault();
      return;
    }
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
    // Chodba: ↑ ↓ / W S = krok, ← → / A D = otočit se, Enter / mezerník = věc před hráčem.
    if (!modalOpen && !$('room').hidden && corridor && game.room.type === 'corridor' && !e.target.matches('input, textarea')) {
      const move = {
        ArrowUp: ['step', 1], w: ['step', 1], W: ['step', 1], ArrowDown: ['step', -1], s: ['step', -1], S: ['step', -1],
        ArrowLeft: ['turn', -1], a: ['turn', -1], A: ['turn', -1], ArrowRight: ['turn', 1], d: ['turn', 1], D: ['turn', 1],
      }[e.key];
      if (move) {
        e.preventDefault();
        corridorMove(...move);
        return;
      }
      if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('button')) {
        const h = frontHotspot();
        if (h) {
          e.preventDefault();
          onHotspot(h);
          return;
        }
      }
    }
    // 3D chodba si klávesy obsluhuje sama (js/chodba3d.js).
    if (!modalOpen && !$('room').hidden && world3d && game.room && game.room.type === 'world3d') return;
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
