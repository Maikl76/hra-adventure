/*
 * Herní logika – místnosti, inventář, kombinace, zámky bran, statistiky.
 *
 * Tento soubor nic nevykresluje. Vrací „události“ (např. text, nový předmět,
 * otevření zámku), které vykreslí ui.js. Veškerý obsah hry je v data/game.json.
 */
(function (global) {
  'use strict';

  const SAVE_KEY = 'brany-biomechaniky-ulozeni';   // + „-<svět>“: každý svět má vlastní uloženou hru
  const SAVE_VERSION = 1;
  const saveKey = (trackId) => `${SAVE_KEY}-${trackId}`;

  /* Bezpečný přístup k localStorage (v soukromém okně může selhat). */
  const storage = {
    get(key) {
      try {
        const raw = global.localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    },
    set(key, value) {
      try {
        global.localStorage.setItem(key, JSON.stringify(value));
      } catch (e) {
        /* Uložení se nepovedlo – hra běží dál, jen nepůjde pokračovat po zavření. */
      }
    },
    remove(key) {
      try {
        global.localStorage.removeItem(key);
      } catch (e) {
        /* nic */
      }
    },
  };

  /* Převod textu na číslo – přijímá desetinnou čárku i tečku. */
  function parseNumber(text) {
    const cleaned = String(text).trim().replace(/\s+/g, '').replace(',', '.');
    if (cleaned === '' || !/^-?\d*\.?\d+$/.test(cleaned)) return NaN;
    return Number(cleaned);
  }

  /* Normalizovaný klíč čísla pro vyhledání cílené zpětné vazby („15“, „0,5“ → „0.5“). */
  function numberKey(value) {
    return String(Math.round(value * 1e6) / 1e6);
  }

  /* Vyhodnocení vzorce z game.json s proměnnými hráče, např. „70*9.81*0.4*n/t“ nebo
     „ceil(400/P)“. Povolené: čísla, proměnné, + − * / ^, závorky, funkce ceil, floor,
     round, abs, min, max a porovnání > < >= <= == (výsledek 1 = platí, 0 = neplatí).
     missingZero: chybějící proměnná = 0 (pro podmínky z příznaků). Vlastní rozbor – žádné eval. */
  const FUNCS = { ceil: Math.ceil, floor: Math.floor, round: Math.round, abs: Math.abs, min: Math.min, max: Math.max, sqrt: Math.sqrt };

  function evalFormula(expr, vars, missingZero) {
    if (typeof expr === 'number') return expr;
    const s = String(expr).replace(/\s+/g, '');
    let i = 0;
    const fail = (msg) => { throw new Error(`Vzorec „${expr}“: ${msg}`); };
    const peek = () => s[i];

    function primary() {
      const c = peek();
      if (c === '(') {
        i++;
        const v = sum();
        if (peek() !== ')') fail('chybí závorka');
        i++;
        return v;
      }
      const num = /^\d+(\.\d+)?/.exec(s.slice(i));
      if (num) {
        i += num[0].length;
        return Number(num[0]);
      }
      const id = /^[A-Za-z_][A-Za-z_0-9]*/.exec(s.slice(i));
      if (id) {
        i += id[0].length;
        const name = id[0];
        if (peek() === '(') {
          if (!FUNCS[name]) fail(`neznámá funkce ${name}`);
          i++;
          const args = [sum()];
          while (peek() === ',') { i++; args.push(sum()); }
          if (peek() !== ')') fail('chybí závorka funkce');
          i++;
          return FUNCS[name](...args);
        }
        if (!(name in vars) || vars[name] === null || vars[name] === undefined) {
          if (missingZero) return 0;
          fail(`chybí hodnota ${name}`);
        }
        return Number(vars[name]);
      }
      return fail('nečekaný znak');
    }
    function power() {
      const base = primary();
      if (peek() === '^') { i++; return Math.pow(base, unary()); }
      return base;
    }
    function unary() {
      if (peek() === '-') { i++; return -unary(); }
      return power();
    }
    function product() {
      let v = unary();
      while (peek() === '*' || peek() === '/') {
        const op = s[i++];
        const r = unary();
        v = op === '*' ? v * r : v / r;
      }
      return v;
    }
    function sum() {
      let v = product();
      while (peek() === '+' || peek() === '-') {
        const op = s[i++];
        const r = product();
        v = op === '+' ? v + r : v - r;
      }
      return v;
    }
    function compare() {
      const l = sum();
      const op = /^(>=|<=|==|>|<)/.exec(s.slice(i));
      if (!op) return l;
      i += op[0].length;
      const r = sum();
      const res = { '>': l > r, '<': l < r, '>=': l >= r - 1e-9, '<=': l <= r + 1e-9, '==': Math.abs(l - r) < 1e-9 }[op[0]];
      return res ? 1 : 0;
    }
    const v = compare();
    if (i !== s.length) fail('nadbytečné znaky');
    return v;
  }

  /* Číslo s desetinnou čárkou (pro texty ve hře). */
  function formatNumber(v, decimals) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return '–';
    const d = decimals === undefined ? (Number.isInteger(v) ? 0 : 1) : decimals;
    return v.toFixed(d).replace('.', ',');
  }

  class Game {
    constructor(data) {
      this.data = data;
      this.state = null;
      this.lockId = null;   // právě otevřený malý zámek místnosti (null = zámek brány)
    }

    /* ---------- Založení, uložení, načtení ---------- */

    /* startRoomId: zkratka pro vyučující – začít rovnou v pozdější místnosti světa (odkaz ?mistnost=…).
       Může to být i zkušební místnost světa („trialRooms“: místnost → kam vede); běžná hra ji přeskočí. */
    newGame(trackId, team, startRoomId) {
      const track = this.data.tracks.find((t) => t.id === trackId) || this.data.tracks[0];
      const trialTo = (track.trialRooms || {})[startRoomId];
      const startIndex = Math.max(0, track.rooms.indexOf(trialTo || startRoomId));
      const shortcut = startIndex > 0 || Boolean(trialTo);
      this.state = {
        version: SAVE_VERSION,
        trackId: track.id,
        team: (team || '').trim(),
        roomIndex: startIndex,
        inventory: [],
        flags: {},
        notes: [],
        gates: {},
        vars: {},          // naměřené hodnoty hráče (dřepy, čas…) pro „chytré“ zámky
        playMs: 0,
        finished: false,
      };
      if (trialTo) this.state.trialRoom = startRoomId;                     // zkušební místnost, pak track.rooms[startIndex]
      if (shortcut) this.state.startRoom = trialTo ? startRoomId : track.rooms[startIndex];   // ukáže závěrečná obrazovka
      this.save();
      const events = this.enterRoom();
      // co by si hráč přinesl z dřívějších místností (např. kalkulačku): „shortcut“ u místnosti v game.json
      if (shortcut) events.push(...this.run(this.room.shortcut || []));
      return events;
    }

    /* Id místnosti, ve které je uložená hra daného světa (null = žádná). */
    static savedRoomId(trackId, data) {
      const saved = storage.get(saveKey(trackId));
      if (!saved || saved.version !== SAVE_VERSION) return null;
      const track = data.tracks.find((t) => t.id === trackId);
      return saved.trialRoom || (track && track.rooms[saved.roomIndex]) || null;
    }

    /* Starší verze ukládala jedinou hru pod společný klíč – převést na uložení podle světa. */
    static migrateSave() {
      const old = storage.get(SAVE_KEY);
      if (old && old.trackId) {
        storage.set(saveKey(old.trackId), old);
        Game.setSetting('lastTrack', old.trackId);
      }
      if (old) storage.remove(SAVE_KEY);
    }

    /* Je uložená hra pro daný svět (bez udání: pro naposledy hraný svět)? */
    static hasSave(trackId) {
      const id = trackId || Game.getSetting('lastTrack', null);
      if (!id) return false;
      const saved = storage.get(saveKey(id));
      return Boolean(saved && saved.version === SAVE_VERSION);
    }

    loadSave(trackId) {
      const id = trackId || Game.getSetting('lastTrack', null);
      const saved = id ? storage.get(saveKey(id)) : null;
      if (!saved || saved.version !== SAVE_VERSION) return false;
      if (!saved.vars) saved.vars = {};
      this.state = saved;
      Game.setSetting('lastTrack', saved.trackId);
      return true;
    }

    save() {
      if (!this.state) return;
      storage.set(saveKey(this.state.trackId), this.state);
      Game.setSetting('lastTrack', this.state.trackId);
    }

    static clearSave(trackId) {
      const id = trackId || Game.getSetting('lastTrack', null);
      if (id) storage.remove(saveKey(id));
    }

    /* ---------- Proměnné hráče a texty se šablonou ---------- */

    setVars(values) {
      Object.assign(this.state.vars, values);
      this.save();
    }

    /* Vzorec s proměnnými hráče → číslo. */
    evaluate(expr) {
      return evalFormula(expr, this.state ? this.state.vars : {});
    }

    /* Podmínka „expr“ (např. součet wattů zapnutých spotřebičů): příznaky jsou 1, chybějící 0. */
    condition(expr) {
      const ctx = {};
      for (const [f, on] of Object.entries(this.state.flags)) if (on) ctx[f] = 1;
      Object.assign(ctx, this.state.vars);
      try {
        return Boolean(evalFormula(expr, ctx, true));
      } catch (e) {
        return false;
      }
    }

    /* Doplnění hodnot do textu: „{t:1} s“ → „34,2 s“, „{=70*9.81*0.4*n/t:0} W“ → vypočtená hodnota. */
    fill(text) {
      if (typeof text !== 'string' || !text.includes('{')) return text;
      return text.replace(/\{(=?)([^{}:]+)(?::(\d))?\}/g, (whole, isExpr, body, dec) => {
        try {
          const v = isExpr ? this.evaluate(body) : this.state.vars[body];
          if (v === undefined || v === null) return '–';
          return formatNumber(Number(v), dec === undefined ? undefined : Number(dec));
        } catch (e) {
          return '–';
        }
      });
    }

    /* Drobné nastavení mimo postup hry (např. zda už hráč viděl úvod). */
    static getSetting(name, fallback) {
      const settings = storage.get('brany-biomechaniky-nastaveni') || {};
      return name in settings ? settings[name] : fallback;
    }

    static setSetting(name, value) {
      const settings = storage.get('brany-biomechaniky-nastaveni') || {};
      settings[name] = value;
      storage.set('brany-biomechaniky-nastaveni', settings);
    }

    /* ---------- Přehled stavu ---------- */

    get track() {
      return this.data.tracks.find((t) => t.id === this.state.trackId);
    }

    get roomId() {
      return this.state.trialRoom || this.track.rooms[this.state.roomIndex];
    }

    /* Chodba „z vlastních očí“: kde hráč stojí (políčko, směr, prošlá políčka). */
    corridorPos() {
      const saved = this.state.places && this.state.places[this.roomId];
      return saved || { ...this.room.corridor.start };
    }

    setCorridorPos(pos) {
      if (!this.state.places) this.state.places = {};
      this.state.places[this.roomId] = pos;
      this.save();
    }

    get room() {
      return this.data.rooms[this.roomId];
    }

    /* Pohled v místnosti (stěna, zvětšený stůl…). Místnost bez „views“ má jediný pohled – sebe. */
    get viewId() {
      const room = this.room;
      if (!room.views) return null;
      const saved = this.state.views && this.state.views[this.roomId];
      return saved && room.views[saved] ? saved : room.startView || Object.keys(room.views)[0];
    }

    get view() {
      const room = this.room;
      return room.views ? room.views[this.viewId] : room;
    }

    /* Přechod na jiný pohled; direction = left / right / back / in (kvůli animaci). */
    goView(viewId, direction) {
      const room = this.room;
      if (!room.views || !room.views[viewId]) return [];
      if (!this.state.views) this.state.views = {};
      this.state.views[this.roomId] = viewId;
      this.save();
      const events = [{ type: 'view', direction }];
      const view = room.views[viewId];
      if (view.enterText) events.push({ type: 'text', text: view.enterText });
      // účinky při vstupu do pohledu (např. kostra mezitím otočila hlavu)
      const match = (view.enter || []).find((c) => this.check(c.when));
      if (match) events.push(...this.run(match.do));
      return events;
    }

    /* Otočení doleva / doprava nebo návrat ze zvětšeného pohledu. */
    turn(direction) {
      const target = this.view[direction];
      return target ? this.goView(target, direction) : [];
    }

    item(id) {
      return this.data.items[id];
    }

    hasItem(id) {
      return this.state.inventory.includes(id);
    }

    /* Splňuje stav podmínku „when“? (flags, notFlags, items, notItems) */
    check(when) {
      if (!when) return true;
      const s = this.state;
      if (when.flags && !when.flags.every((f) => s.flags[f])) return false;
      if (when.notFlags && when.notFlags.some((f) => s.flags[f])) return false;
      if (when.items && !when.items.every((i) => s.inventory.includes(i))) return false;
      if (when.notItems && when.notItems.some((i) => s.inventory.includes(i))) return false;
      if (when.expr && !this.condition(when.expr)) return false;
      return true;
    }

    /* Viditelné vrstvy obrázku místnosti (např. otevřený šuplík). */
    visibleLayers() {
      return (this.view.layers || []).filter((layer) => this.check(layer.when));
    }

    /* Zdroje světla v pohledu (lampa, okno…), které právě svítí. */
    visibleLights() {
      return (this.view.lights || []).filter((light) => this.check(light.when));
    }

    /* ---------- Akce hráče ---------- */

    enterRoom() {
      this.lockId = null;
      const events = [{ type: 'room' }];
      if (this.room.enterText) events.push({ type: 'text', text: this.room.enterText });
      // účinky při vstupu do místnosti (např. tiché cvaknutí zámku za hráčem)
      const match = (this.room.enter || []).find((c) => this.check(c.when));
      if (match) events.push(...this.run(match.do));
      return events;
    }

    /* Kliknutí na objekt v místnosti: provede se první případ, jehož podmínka platí. */
    clickHotspot(hotspotId) {
      const hotspot = (this.view.hotspots || []).find((h) => h.id === hotspotId);
      if (!hotspot) return [];
      const cases = hotspot.click || [];
      const match = cases.find((c) => this.check(c.when));
      return match ? this.run(match.do) : [];
    }

    /* Otevření předmětu (detail, kniha): provedou se jeho účinky „examine“ (např. zápis do zápisníku). */
    examineItem(itemId) {
      const item = this.item(itemId);
      const match = ((item && item.examine) || []).find((c) => this.check(c.when));
      return match ? this.run(match.do) : [];
    }

    /* Pravidlo pro použití předmětu na objekt (nebo undefined, když žádné není). */
    findUse(itemId, hotspotId) {
      return (this.data.uses || []).find(
        (u) => u.item === itemId && u.on === hotspotId && (!u.room || u.room === this.roomId) && this.check(u.when)
      );
    }

    /* Použití předmětu z inventáře na objekt v místnosti. */
    useItemOn(itemId, hotspotId) {
      const rule = this.findUse(itemId, hotspotId);
      if (!rule) return [{ type: 'text', text: this.data.defaults.use }];
      return this.run(rule.do);
    }

    /* Kombinace dvou předmětů z inventáře (pořadí nehraje roli). */
    combineItems(a, b) {
      const rule = (this.data.combinations || []).find((c) => {
        const [x, y] = c.items;
        return ((x === a && y === b) || (x === b && y === a)) && this.check(c.when);
      });
      if (!rule) return [{ type: 'text', text: this.data.defaults.combine }];
      return this.run(rule.do);
    }

    /* Provedení seznamu účinků z game.json; vrací události pro vykreslení. */
    run(effects) {
      const events = [];
      const s = this.state;
      for (const effect of effects || []) {
        if ('text' in effect) events.push({ type: 'text', text: this.fill(effect.text) });
        if ('set' in effect) s.flags[effect.set] = true;
        if ('unset' in effect) delete s.flags[effect.unset];
        if ('give' in effect && !s.inventory.includes(effect.give)) {
          s.inventory.push(effect.give);
          events.push({ type: 'item', item: effect.give });
        }
        if ('remove' in effect) {
          s.inventory = s.inventory.filter((i) => i !== effect.remove);
          events.push({ type: 'itemRemoved', item: effect.remove });
        }
        if ('note' in effect) {
          const note = this.fill(effect.note);
          // noteKey: nová hodnota nahradí starší zápis téhož měření (např. opakované dřepy)
          if (effect.noteKey) {
            if (!s.noteKeys) s.noteKeys = {};
            const old = s.noteKeys[effect.noteKey];
            if (old !== undefined) s.notes = s.notes.filter((n) => n !== old);
            s.noteKeys[effect.noteKey] = note;
          }
          if (!s.notes.includes(note)) {
            s.notes.push(note);
            events.push({ type: 'note', text: note });
          }
        }
        if ('activity' in effect) events.push({ type: 'activity', activity: effect.activity });
        if ('sound' in effect) events.push({ type: 'sound', name: effect.sound });
        if ('closeup' in effect) events.push({ type: 'closeup', closeup: effect.closeup });
        if ('openItem' in effect) events.push({ type: 'openItem', item: effect.openItem });
        if ('view' in effect) events.push(...this.goView(effect.view, 'in'));
        if ('openGate' in effect) events.push({ type: 'gate', lock: null });
        if ('lock' in effect) events.push({ type: 'gate', lock: effect.lock });
        if ('fx' in effect) events.push({ type: 'fx', name: effect.fx });
        // lekačka z „scares“ místnosti – každá jen jednou za hru
        if ('scare' in effect) {
          const def = this.room.scares && this.room.scares[effect.scare];
          const flag = `lekacka_${effect.scare}`;
          if (def && !s.flags[flag]) {
            s.flags[flag] = true;
            events.push({ type: 'scare', scare: def });
          }
        }
        // nápověda mimo zámky (např. z polního telefonu) – započítá se do statistik
        if ('hint' in effect) s.extraHints = (s.extraHints || 0) + 1;
        if ('leave' in effect) events.push({ type: 'leave' });
      }
      events.push({ type: 'state' });
      this.save();
      return events;
    }

    /* ---------- Zámek brány a malé zámky místnosti (vitrína, skříň…) ---------- */

    /* Který zámek je otevřený v okně: id z „locks“ místnosti, nebo null = brána. */
    selectLock(lockId) {
      this.lockId = lockId && this.room.locks && this.room.locks[lockId] ? lockId : null;
    }

    lockDef() {
      return this.lockId ? this.room.locks[this.lockId] : this.room.gate;
    }

    isGateLock() {
      return !this.lockId;
    }

    gateState() {
      // brány v „gates“ (počítají se jako otevřené brány), malé zámky zvlášť v „locks“
      let store = this.state.gates;
      let id = this.roomId;
      if (this.lockId) {
        if (!this.state.locks) this.state.locks = {};
        store = this.state.locks;
        id = `${this.roomId}#${this.lockId}`;
      }
      if (!store[id]) store[id] = { step: 0, errors: 0, hints: [], open: false };
      return store[id];
    }

    /* Je brána místnosti otevřená? (nezávisle na tom, který zámek je právě v okně) */
    gateOpen() {
      const gs = this.state.gates[this.roomId];
      return Boolean(gs && gs.open);
    }

    gateStep() {
      const gate = this.lockDef();
      const gs = this.gateState();
      return gate && !gs.open ? gate.steps[gs.step] : null;
    }

    /* Zobrazené nápovědy k aktuálnímu kroku. */
    shownHints() {
      const gs = this.gateState();
      const step = this.gateStep();
      if (!step) return [];
      return (step.hints || []).slice(0, gs.hints[gs.step] || 0).map((h) => this.fill(h));
    }

    /* Další nápověda (počítá se do statistik). Vrací text, nebo null, když už žádná není. */
    takeHint() {
      const gs = this.gateState();
      const step = this.gateStep();
      if (!step) return null;
      const shown = gs.hints[gs.step] || 0;
      if (shown >= (step.hints || []).length) return null;
      gs.hints[gs.step] = shown + 1;
      this.save();
      return this.fill(step.hints[shown]);
    }

    /* Chybí kroku zámku naměřené hodnoty? (např. dřepy ještě nebyly) – pak text, co udělat dřív. */
    gateMissing() {
      const step = this.gateStep();
      if (!step || !step.requiresVars) return null;
      const missing = step.requiresVars.some((v) => this.state.vars[v] === undefined || this.state.vars[v] === null);
      return missing ? (step.missingText || 'Nejdřív musíš něco změřit.') : null;
    }

    /* Je číslo „blízko“ cíle? (relativní i absolutní tolerance) */
    near(value, target, step) {
      const tol = Math.max(step.tolerance || 0, Math.abs(target) * (step.toleranceRel || 0));
      return Math.abs(value - target) <= tol + 1e-9;
    }

    /* Vyhodnocení odpovědi (číslo u kódu, index u výběru). */
    answerGate(answer) {
      const step = this.gateStep();
      const gs = this.gateState();
      if (!step) return { ok: false, message: '' };

      const missing = this.gateMissing();
      if (missing) return { ok: false, message: missing, invalid: true };

      let ok = false;
      let feedbackKey = null;
      let formulaFeedback = null;
      if (step.type === 'code') {
        const value = parseNumber(answer);
        if (Number.isNaN(value)) return { ok: false, message: 'Zadej číslo.', invalid: true };
        if (step.answerMin !== undefined || step.answerMax !== undefined) {
          // správně je celé rozmezí (např. zaokrouhlení nahoru z mírně odlišného mezivýsledku)
          const lo = step.answerMin !== undefined ? this.evaluate(step.answerMin) : -Infinity;
          const hi = step.answerMax !== undefined ? this.evaluate(step.answerMax) : Infinity;
          ok = value >= lo - 1e-9 && value <= hi + 1e-9;
        } else {
          ok = this.near(value, this.evaluate(step.answer), step);
        }
        feedbackKey = numberKey(value);
        // cílená rada podle typické chyby spočítané z hráčových hodnot
        for (const f of step.feedbackFormulas || []) {
          let target;
          try { target = this.evaluate(f.value); } catch (e) { continue; }
          if (this.near(value, target, { tolerance: f.tolerance || 0, toleranceRel: f.toleranceRel ?? 0.03 })) {
            formulaFeedback = this.fill(f.text);
            break;
          }
        }
      } else if (step.type === 'choice') {
        ok = Number(answer) === step.correct;
        feedbackKey = String(answer);
      }

      if (!ok) {
        gs.errors += 1;
        this.save();
        const specific = formulaFeedback || (step.feedback && this.fill(step.feedback[feedbackKey]));
        return { ok: false, message: specific || this.fill(step.wrong) || 'Špatně.' };
      }

      const result = { ok: true, message: this.fill(step.success) || '', gate: this.isGateLock() };
      const def = this.lockDef();
      gs.step += 1;
      if (gs.step >= def.steps.length) {
        gs.open = true;
        if (def.openFlag) this.state.flags[def.openFlag] = true;
        result.opened = true;
        result.events = this.run(def.open);
      }
      this.save();
      return result;
    }

    /* Dokončená aktivita (reflex test, dřepy): uložit naměřené hodnoty a provést její účinky „done“. */
    completeActivity(activity, results) {
      this.setVars(results || {});
      const events = this.run(activity.done || []);
      // doneCases: případy s podmínkou (např. jiný zápis s kamerou a bez ní) – provede se první platný
      const match = (activity.doneCases || []).find((c) => this.check(c.when));
      if (match) events.push(...this.run(match.do));
      return events;
    }

    /* Přechod do další místnosti sekce; vrací false, když je sekce u konce. */
    nextRoom() {
      // ze zkušební místnosti se jde do místnosti, kam vede (roomIndex už na ni ukazuje)
      if (this.state.trialRoom) {
        delete this.state.trialRoom;
        this.save();
        return this.enterRoom();
      }
      if (this.state.roomIndex + 1 >= this.track.rooms.length) {
        this.state.finished = true;
        this.save();
        return false;
      }
      this.state.roomIndex += 1;
      this.save();
      return this.enterRoom();
    }

    /* ---------- Statistiky (pro vyhodnocení pilotu) ---------- */

    tick(ms) {
      if (this.state && !this.state.finished) this.state.playMs += ms;
    }

    stats() {
      const gates = Object.values(this.state.gates);
      const all = gates.concat(Object.values(this.state.locks || {}));   // chyby a nápovědy i u malých zámků
      const hintCount = all.reduce((sum, g) => sum + g.hints.reduce((a, b) => a + (b || 0), 0), 0) + (this.state.extraHints || 0);
      return {
        team: this.state.team,
        track: this.track.name,
        playMs: this.state.playMs,
        errors: all.reduce((sum, g) => sum + g.errors, 0),
        hints: hintCount,
        gatesOpen: gates.filter((g) => g.open).length,
        // měření kamerou (dřepy, zkouška stability): ověřeno kamerou? (undefined = svět bez měření)
        camera: this.state.vars.kamera === undefined ? undefined : Boolean(this.state.vars.kamera),
      };
    }

    /* Kontrola game.json – vypíše chybné odkazy (pomáhá při úpravách obsahu). */
    validate() {
      const problems = [];
      const d = this.data;
      for (const t of d.tracks) {
        for (const r of t.rooms) if (!d.rooms[r]) problems.push(`Sekce „${t.id}“ odkazuje na neexistující místnost „${r}“.`);
        for (const [r, to] of Object.entries(t.trialRooms || {})) {
          if (!d.rooms[r]) problems.push(`Sekce „${t.id}“: neexistující zkušební místnost „${r}“.`);
          if (!t.rooms.includes(to)) problems.push(`Sekce „${t.id}“: zkušební místnost „${r}“ vede do „${to}“, která v sekci není.`);
        }
      }
      // chodby „z vlastních očí“: mapa, start, textury, objekty na zdech
      for (const [roomId, r] of Object.entries(d.rooms)) {
        if (r.type !== 'corridor') continue;
        const c = r.corridor || {};
        const map = c.map || [];
        const at = (x, y) => (map[y] || '')[x];
        if (!map.length) problems.push(`Chodba „${roomId}“ nemá mapu.`);
        if (!c.start || at(c.start.x, c.start.y) !== '.') problems.push(`Chodba „${roomId}“: start není na políčku chodby.`);
        for (const ch of new Set(map.join('').replace(/\./g, ''))) {
          const e = (c.legend || {})[ch];
          const names = Array.isArray(e) ? e.map((v) => v.texture) : [e || c.wall];
          for (const n of names) if (!n || !(c.textures || {})[n]) problems.push(`Chodba „${roomId}“: znak „${ch}“ nemá texturu.`);
        }
        for (const h of r.hotspots || []) {
          const [x, y] = h.cell || [];
          if (at(x, y) === undefined || at(x, y) === '.') problems.push(`Chodba „${roomId}“, objekt „${h.id}“: „cell“ není zeď v mapě.`);
        }
      }
      let room = null;
      const checkEffects = (effects, where) => {
        for (const e of effects || []) {
          for (const key of ['give', 'remove']) {
            if (key in e && !d.items[e[key]]) problems.push(`${where}: neexistující předmět „${e[key]}“.`);
          }
          if (room && 'lock' in e && !(room.locks && room.locks[e.lock])) problems.push(`${where}: neexistující zámek „${e.lock}“.`);
          if (room && 'view' in e && !(room.views && room.views[e.view])) problems.push(`${where}: neexistující pohled „${e.view}“.`);
          if (room && 'scare' in e && !(room.scares && room.scares[e.scare])) problems.push(`${where}: neexistující lekačka „${e.scare}“.`);
        }
      };
      for (const [roomId, r] of Object.entries(d.rooms)) {
        room = r;
        for (const c of room.enter || []) checkEffects(c.do, `Místnost „${roomId}“, vstup`);
        if (room.shortcut) checkEffects(room.shortcut, `Místnost „${roomId}“, zkratka`);
        for (const [lockId, lock] of Object.entries(room.locks || {})) checkEffects(lock.open, `Místnost „${roomId}“, zámek „${lockId}“`);
        if (room.gate) checkEffects(room.gate.open, `Místnost „${roomId}“, brána`);
        for (const a of Object.values(room.activities || {})) {
          checkEffects(a.done, `Místnost „${roomId}“, aktivita`);
          for (const c of a.doneCases || []) checkEffects(c.do, `Místnost „${roomId}“, aktivita`);
        }
        const views = room.views ? Object.entries(room.views) : [[null, room]];
        for (const [viewId, view] of views) {
          for (const dir of ['left', 'right', 'back']) {
            if (view[dir] && !(room.views && room.views[view[dir]])) {
              problems.push(`Místnost „${roomId}“, pohled „${viewId}“: neexistující pohled „${view[dir]}“ (${dir}).`);
            }
          }
          for (const h of view.hotspots || []) {
            for (const c of h.click || []) checkEffects(c.do, `Místnost „${roomId}“, objekt „${h.id}“`);
          }
          for (const c of view.enter || []) checkEffects(c.do, `Místnost „${roomId}“, vstup do pohledu „${viewId}“`);
        }
      }
      room = null;
      for (const u of d.uses || []) {
        if (!d.items[u.item]) problems.push(`Použití: neexistující předmět „${u.item}“.`);
        checkEffects(u.do, `Použití „${u.item}“ na „${u.on}“`);
      }
      for (const c of d.combinations || []) {
        for (const i of c.items) if (!d.items[i]) problems.push(`Kombinace: neexistující předmět „${i}“.`);
        checkEffects(c.do, `Kombinace ${c.items.join(' + ')}`);
      }
      return problems;
    }
  }

  global.Game = Game;
})(window);
