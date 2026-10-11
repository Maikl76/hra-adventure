/*
 * Herní logika – místnosti, inventář, kombinace, zámky bran, statistiky.
 *
 * Tento soubor nic nevykresluje. Vrací „události“ (např. text, nový předmět,
 * otevření zámku), které vykreslí ui.js. Veškerý obsah hry je v data/game.json.
 */
(function (global) {
  'use strict';

  const SAVE_KEY = 'brany-biomechaniky-ulozeni';
  const SAVE_VERSION = 1;

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

  class Game {
    constructor(data) {
      this.data = data;
      this.state = null;
    }

    /* ---------- Založení, uložení, načtení ---------- */

    newGame(trackId, team) {
      const track = this.data.tracks.find((t) => t.id === trackId) || this.data.tracks[0];
      this.state = {
        version: SAVE_VERSION,
        trackId: track.id,
        team: (team || '').trim(),
        roomIndex: 0,
        inventory: [],
        flags: {},
        notes: [],
        gates: {},
        playMs: 0,
        finished: false,
      };
      this.save();
      return this.enterRoom();
    }

    static hasSave() {
      const saved = storage.get(SAVE_KEY);
      return Boolean(saved && saved.version === SAVE_VERSION);
    }

    loadSave() {
      const saved = storage.get(SAVE_KEY);
      if (!saved || saved.version !== SAVE_VERSION) return false;
      this.state = saved;
      return true;
    }

    save() {
      if (this.state) storage.set(SAVE_KEY, this.state);
    }

    static clearSave() {
      storage.remove(SAVE_KEY);
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
      return this.track.rooms[this.state.roomIndex];
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
      const events = [{ type: 'room' }];
      if (this.room.enterText) events.push({ type: 'text', text: this.room.enterText });
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
        if ('text' in effect) events.push({ type: 'text', text: effect.text });
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
        if ('note' in effect && !s.notes.includes(effect.note)) {
          s.notes.push(effect.note);
          events.push({ type: 'note', text: effect.note });
        }
        if ('sound' in effect) events.push({ type: 'sound', name: effect.sound });
        if ('closeup' in effect) events.push({ type: 'closeup', closeup: effect.closeup });
        if ('openItem' in effect) events.push({ type: 'openItem', item: effect.openItem });
        if ('view' in effect) events.push(...this.goView(effect.view, 'in'));
        if ('openGate' in effect) events.push({ type: 'gate' });
        if ('leave' in effect) events.push({ type: 'leave' });
      }
      events.push({ type: 'state' });
      this.save();
      return events;
    }

    /* ---------- Zámek brány ---------- */

    gateState() {
      const id = this.roomId;
      if (!this.state.gates[id]) {
        this.state.gates[id] = { step: 0, errors: 0, hints: [], open: false };
      }
      return this.state.gates[id];
    }

    gateStep() {
      const gate = this.room.gate;
      const gs = this.gateState();
      return gate && !gs.open ? gate.steps[gs.step] : null;
    }

    /* Zobrazené nápovědy k aktuálnímu kroku. */
    shownHints() {
      const gs = this.gateState();
      const step = this.gateStep();
      if (!step) return [];
      return (step.hints || []).slice(0, gs.hints[gs.step] || 0);
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
      return step.hints[shown];
    }

    /* Vyhodnocení odpovědi (číslo u kódu, index u výběru). */
    answerGate(answer) {
      const step = this.gateStep();
      const gs = this.gateState();
      if (!step) return { ok: false, message: '' };

      let ok = false;
      let feedbackKey = null;
      if (step.type === 'code') {
        const value = parseNumber(answer);
        if (Number.isNaN(value)) return { ok: false, message: 'Zadej číslo.', invalid: true };
        ok = Math.abs(value - step.answer) <= (step.tolerance || 0) + 1e-9;
        feedbackKey = numberKey(value);
      } else if (step.type === 'choice') {
        ok = Number(answer) === step.correct;
        feedbackKey = String(answer);
      }

      if (!ok) {
        gs.errors += 1;
        this.save();
        const specific = step.feedback && step.feedback[feedbackKey];
        return { ok: false, message: specific || step.wrong || 'Špatně.' };
      }

      const result = { ok: true, message: step.success || '' };
      gs.step += 1;
      if (gs.step >= this.room.gate.steps.length) {
        gs.open = true;
        this.state.flags[this.room.gate.openFlag] = true;
        result.opened = true;
        result.events = this.run(this.room.gate.open);
      }
      this.save();
      return result;
    }

    /* Přechod do další místnosti sekce; vrací false, když je sekce u konce. */
    nextRoom() {
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
      const hintCount = gates.reduce((sum, g) => sum + g.hints.reduce((a, b) => a + (b || 0), 0), 0);
      return {
        team: this.state.team,
        track: this.track.name,
        playMs: this.state.playMs,
        errors: gates.reduce((sum, g) => sum + g.errors, 0),
        hints: hintCount,
        gatesOpen: gates.filter((g) => g.open).length,
      };
    }

    /* Kontrola game.json – vypíše chybné odkazy (pomáhá při úpravách obsahu). */
    validate() {
      const problems = [];
      const d = this.data;
      for (const t of d.tracks) {
        for (const r of t.rooms) if (!d.rooms[r]) problems.push(`Sekce „${t.id}“ odkazuje na neexistující místnost „${r}“.`);
      }
      const checkEffects = (effects, where) => {
        for (const e of effects || []) {
          for (const key of ['give', 'remove']) {
            if (key in e && !d.items[e[key]]) problems.push(`${where}: neexistující předmět „${e[key]}“.`);
          }
        }
      };
      for (const [roomId, room] of Object.entries(d.rooms)) {
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
        }
      }
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
