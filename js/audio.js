/*
 * Zvuk hry – generovaný přímo v prohlížeči (Web Audio API), bez zvukových souborů.
 *
 * Podkresy (ambience: „intro“, „title“, „kabinet“…) a efekty („drawer“, „wrong“…) mají jména.
 * V game.json lze jménu přiřadit soubor (audio.files), např. "kabinet": "assets/audio/kabinet.mp3";
 * hra pak místo generovaného zvuku přehraje soubor. Hudbu lze tedy později vyměnit bez zásahu do kódu.
 */
(function (global) {
  'use strict';

  /* Kmitočty tónů (Hz). */
  const NOTE = {
    D2: 73.42, A2: 110.0, D3: 146.83, F3: 174.61, Fs3: 185.0, A3: 220.0,
    D4: 293.66, F4: 349.23, Fs4: 369.99, A4: 440.0, D5: 587.33, Fs5: 739.99, A5: 880.0, E6: 1318.51,
  };

  /* Obálka hlasitosti: rychlý nástup a exponenciální dozvuk. */
  function env(param, t, attack, peak, decay) {
    param.cancelScheduledValues(t);
    param.setValueAtTime(0.0001, t);
    param.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
    param.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  const pick = (list) => list[Math.floor(Math.random() * list.length)];

  class Sound {
    constructor(config) {
      this.config = config || {};
      this.files = this.config.files || {};
      this.ctx = null;
      this.enabled = true;
      this.wanted = null;   // jméno podkresu, který má hrát
      this.current = null;  // právě hrající podkres
      this.buffers = {};    // načtené zvukové soubory
      this.stormWanted = null;   // bouřka venku: { place, level } nebo null
      this.stormLayer = null;
    }

    /* Spuštění zvuku – prohlížeče ho dovolí až po kliknutí nebo stisku klávesy. */
    unlock() {
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return;
      if (!this.ctx) {
        try {
          this.ctx = new AC();
        } catch (e) {
          return;
        }
        this.build();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      if (this.enabled && this.wanted && !this.current) this.startAmbience(this.wanted);
      if (this.enabled && this.stormWanted && !this.stormLayer) this.storm(this.stormWanted);
    }

    /* Mixážní pult: hudba a efekty → společný dozvuk (místnost) → hlavní hlasitost. */
    build() {
      const ctx = this.ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.enabled ? 0.9 : 0;
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -16;
      limiter.ratio.value = 4;
      this.master.connect(limiter);
      limiter.connect(ctx.destination);

      this.reverb = ctx.createConvolver();
      this.reverb.buffer = this.impulse(3.8, 2.6);
      const reverbOut = ctx.createGain();
      reverbOut.gain.value = 0.6;
      this.reverb.connect(reverbOut);
      reverbOut.connect(this.master);

      this.music = this.bus(0.55, 0.65);
      this.fx = this.bus(0.85, 0.3);
      this.noise = this.noiseBuffer(3, false);
      this.brown = this.noiseBuffer(4, true);
    }

    bus(level, reverbSend) {
      const g = this.ctx.createGain();
      g.gain.value = level;
      g.connect(this.master);
      const send = this.ctx.createGain();
      send.gain.value = reverbSend;
      g.connect(send);
      send.connect(this.reverb);
      return g;
    }

    /* Umělý dozvuk velké tmavé místnosti (doznívající šum). */
    impulse(seconds, decay) {
      const rate = this.ctx.sampleRate;
      const len = Math.floor(rate * seconds);
      const buf = this.ctx.createBuffer(2, len, rate);
      for (let c = 0; c < 2; c++) {
        const d = buf.getChannelData(c);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
      return buf;
    }

    /* Bílý šum (vítr, papír) nebo „hnědý“ hlubší šum (hučení místnosti). */
    noiseBuffer(seconds, brown) {
      const rate = this.ctx.sampleRate;
      const len = Math.floor(rate * seconds);
      const buf = this.ctx.createBuffer(1, len, rate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (brown) {
          last = (last + 0.02 * w) / 1.02;
          d[i] = last * 3.5;
        } else {
          d[i] = w;
        }
      }
      return buf;
    }

    /* Pozastavení při skryté záložce (aby hra nehrála „do prázdna“). */
    pause(paused) {
      if (!this.ctx) return;
      if (paused) this.ctx.suspend().catch(() => {});
      else this.ctx.resume().catch(() => {});
    }

    setEnabled(on) {
      this.enabled = on;
      if (!this.ctx) return;
      this.master.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.15);
      if (on && this.wanted && !this.current) this.startAmbience(this.wanted);
      if (on && this.stormWanted && !this.stormLayer) this.storm(this.stormWanted);
      if (!on && this.current) {
        this.current.stop(0.4);
        this.current = null;
      }
      if (!on) this.stopStorm(0.4);
    }

    /* Napětí před lekačkou: podkres během „seconds“ skoro utichne… */
    tension(seconds) {
      if (!this.ctx) return;
      this.music.gain.setTargetAtTime(0.06, this.ctx.currentTime, Math.max(seconds, 0.2) / 3);
    }

    /* …a po lekačce se pomalu vrátí. */
    release() {
      if (!this.ctx) return;
      this.music.gain.setTargetAtTime(0.55, this.ctx.currentTime + 0.6, 1.2);
    }

    /* ---------- Bouřka venku (vrstva pod podkresem místnosti) ----------
       storm({ place, level }) zapne nebo upraví vzdálené dunění, storm(null) ho vypne. Déšť záměrně
       není (autorovi šumění vadilo). place: „okno“, „budova“, „sklep“ (ve sklepě dunění silnější
       a hromy tlumené); level 0–1 = síla bouřky (u brány nejsilnější). Hromy hraje thunder(). */
    storm(opts) {
      this.stormWanted = opts || null;
      if (!this.ctx || !this.enabled) return;
      if (!opts) {
        this.stopStorm(3);
        return;
      }
      if (!this.stormLayer) this.startStorm();
      const s = this.stormLayer;
      const lvl = Math.max(0, Math.min(1, opts.level || 0));
      const t = this.ctx.currentTime;
      s.rumble.gain.setTargetAtTime((opts.place === 'sklep' ? 0.05 : 0.035) + 0.04 * lvl, t, 3);
    }

    startStorm() {
      const ctx = this.ctx;
      const t = ctx.currentTime;
      const group = this.gain(0.0001, this.music);
      group.gain.setTargetAtTime(1, t, 2.5);
      const h = { sources: [], timers: [] };
      // vzdálené dunění bouřky: velmi hluboký šum, pomalu se vlní
      const rumble = this.gain(0, group);
      h.sources.push(this.noiseSource(this.filter('lowpass', 180, 0.6, rumble), t, 0, this.brown, true));   // pod ~150 Hz malé reproduktory nehrají
      this.lfo(rumble.gain, 0.031, 0.02, t, h);
      this.stormLayer = { group, h, rumble };
    }

    stopStorm(fade) {
      const s = this.stormLayer;
      if (!s) return;
      this.stormLayer = null;
      const t = this.ctx.currentTime;
      s.group.gain.cancelScheduledValues(t);
      s.group.gain.setTargetAtTime(0.0001, t, Math.max(fade, 0.1) / 3);
      setTimeout(() => {
        s.h.timers.forEach(clearInterval);
        s.h.sources.forEach((x) => {
          try { x.stop(); } catch (e) { /* už skončil */ }
        });
        s.group.disconnect();
      }, fade * 1000 + 300);
    }

    /* Hrom: distance v km (blesk bliká hned, hrom přijde po distance / 0,343 s – to hlídá hra),
       place jako u storm(). Blízko: prásknutí a jasné dunění; daleko: jen hluboké převalování;
       ve sklepě vždy tlumené. Hraje do sběrnice podkresu (lekačka ho ztiší jako hudbu). */
    thunder(o) {
      if (!this.ctx || !this.enabled) return;
      const opts = o || {};
      const t = this.ctx.currentTime + 0.02;
      const d = Math.max(0.3, opts.distance || 3);
      const muffle = { sklep: 0.6, budova: 0.8 }[opts.place] || 1;
      const out = this.gain(Math.min(0.8, 0.75 / Math.pow(d, 0.7)) * muffle, this.music);
      const cutoff = opts.place === 'sklep' ? 260 : Math.min(1600, 900 / Math.sqrt(d)) * (opts.place === 'budova' ? 0.65 : 1);
      const tone = this.filter('lowpass', cutoff, 0.7, out);
      // blízký úder: ostré prásknutí a praskání (jen nad zemí a když je blesk opravdu blízko)
      if (d < 1.2 && opts.place !== 'sklep') {
        const crack = this.gain(muffle * 0.9, out);
        this.noiseBurst(crack, t, 0.18, 'highpass', 900, 0.6);
        for (let i = 0; i < 5; i++) this.noiseBurst(crack, t + 0.05 + Math.random() * 0.45, 0.06, 'bandpass', 1200 + Math.random() * 2000, 0.25 * Math.random());
      }
      // dunění: nástup tím pomalejší, čím je bouřka dál; pak několik vln a dlouhé doznění
      const dur = 3.2 + 1.1 * Math.min(d, 4) + Math.random() * 2;
      const attack = 0.06 + 0.12 * Math.min(d, 5);
      const g = this.gain(0.0001, tone);
      this.noiseSource(g, t, t + dur + 0.5, this.brown, true);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(1, t + attack);
      const waves = 3 + Math.floor(Math.random() * 3);
      const span = dur - attack - 0.8;
      let peak = 1;
      for (let i = 0; i < waves; i++) {
        const a = t + attack + span * ((i + 0.35 + Math.random() * 0.3) / waves);
        peak *= 0.55 + Math.random() * 0.3;
        g.gain.exponentialRampToValueAtTime(peak * (0.3 + Math.random() * 0.25), a);
        g.gain.exponentialRampToValueAtTime(peak, a + 0.12 + Math.random() * 0.12);
      }
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      setTimeout(() => out.disconnect(), (dur + 1) * 1000);
    }

    /* ---------- Podkresy ---------- */

    ambience(name) {
      this.wanted = name;
      if (!this.ctx || !this.enabled) return;
      if (this.current && this.current.name === name) return;
      if (this.current) this.current.stop(2.5);
      this.current = null;
      if (name) this.startAmbience(name);
    }

    startAmbience(name) {
      const ctx = this.ctx;
      const now = ctx.currentTime;
      const group = ctx.createGain();
      group.gain.value = 0.0001;
      group.connect(this.music);
      const handle = { name, sources: [], timers: [], stopped: false };

      if (this.files[name]) this.playFile(this.files[name], group, true, handle);
      else (AMBIENCE[name] || AMBIENCE.room).call(this, group, handle);

      group.gain.setTargetAtTime(1, now, 1.0);
      handle.stop = (fade) => {
        handle.stopped = true;
        const t = ctx.currentTime;
        group.gain.cancelScheduledValues(t);
        group.gain.setTargetAtTime(0.0001, t, Math.max(fade, 0.1) / 3);
        setTimeout(() => {
          handle.timers.forEach(clearInterval);
          handle.sources.forEach((s) => {
            try { s.stop(); } catch (e) { /* už skončil */ }
          });
          group.disconnect();
        }, fade * 1000 + 300);
      };
      this.current = handle;
    }

    /* Opakované náhodně rozmístěné události (zvon, zaskřípání). */
    every(handle, minSec, maxSec, fn) {
      let next = this.ctx.currentTime + 1 + Math.random() * minSec;
      const id = setInterval(() => {
        const t = this.ctx.currentTime;
        while (next < t + 0.3) {
          fn(Math.max(next, t + 0.02));
          next += minSec + Math.random() * (maxSec - minSec);
        }
      }, 100);
      handle.timers.push(id);
    }

    /* Pravidelné události (tikání hodin). */
    metronome(handle, period, fn) {
      let next = this.ctx.currentTime + 0.4;
      let count = 0;
      const id = setInterval(() => {
        const t = this.ctx.currentTime;
        if (next < t) next = t + 0.02;
        while (next < t + 0.3) {
          fn(next, count++);
          next += period;
        }
      }, 100);
      handle.timers.push(id);
    }

    /* ---------- Efekty ---------- */

    sfx(name) {
      if (!this.ctx || !this.enabled) return;
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      if (this.files[name]) {
        this.playFile(this.files[name], this.fx, false, null);
        return;
      }
      const fn = SFX[name];
      if (fn) fn.call(this, this.fx, this.ctx.currentTime + 0.01);
    }

    /* Přehrání zvukového souboru (pro výměnu generovaného zvuku za nahrávku). */
    async playFile(path, dest, loop, handle) {
      try {
        if (!this.buffers[path]) {
          const data = await fetch(path).then((r) => r.arrayBuffer());
          this.buffers[path] = await this.ctx.decodeAudioData(data);
        }
        if (handle && handle.stopped) return;
        const src = this.ctx.createBufferSource();
        src.buffer = this.buffers[path];
        src.loop = loop;
        src.connect(dest);
        src.start();
        if (handle) handle.sources.push(src);
      } catch (e) {
        console.warn(`Zvuk ${path} se nepodařilo přehrát.`, e);
      }
    }

    /* ---------- Stavební kameny zvuků ---------- */

    osc(type, freq, dest, t, stop, detune) {
      const o = this.ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      if (detune) o.detune.value = detune;
      o.connect(dest);
      o.start(t);
      if (stop) o.stop(stop);
      return o;
    }

    filter(type, freq, q, dest) {
      const f = this.ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      f.connect(dest);
      return f;
    }

    gain(value, dest) {
      const g = this.ctx.createGain();
      g.gain.value = value;
      g.connect(dest);
      return g;
    }

    noiseSource(dest, t, stop, buffer, loop) {
      const src = this.ctx.createBufferSource();
      src.buffer = buffer || this.noise;
      src.loop = Boolean(loop);
      src.connect(dest);
      src.start(t, Math.random() * 2);
      if (stop) src.stop(stop);
      return src;
    }

    /* Pomalé kolísání parametru (LFO). */
    lfo(param, freq, depth, t, handle) {
      const o = this.ctx.createOscillator();
      o.frequency.value = freq;
      const g = this.ctx.createGain();
      g.gain.value = depth;
      o.connect(g);
      g.connect(param);
      o.start(t);
      if (handle) handle.sources.push(o);
      return o;
    }

    /* Krátké klepnutí (dřevo, kov, klávesa). */
    click(dest, freq, t, level) {
      const g = this.gain(0, dest);
      env(g.gain, t, 0.001, level * 3, 0.045);  // úzké pásmo šumu je tiché – proto ×3
      const bp = this.filter('bandpass', freq, 1.8, g);
      this.noiseSource(bp, t, t + 0.09);
    }

    /* Čistý zvonivý tón. */
    ping(dest, freq, t, level, decay) {
      const g = this.gain(0, dest);
      env(g.gain, t, 0.004, level, decay);
      this.osc('sine', freq, g, t, t + decay + 0.1);
      const g2 = this.gain(0, dest);
      env(g2.gain, t, 0.004, level * 0.25, decay * 0.5);
      this.osc('sine', freq * 2.01, g2, t, t + decay + 0.1);
    }

    /* Houkání sovy: dva tiché tóny, druhý delší a klesající. */
    hoot(dest, t, level) {
      const out = this.gain(0.0001, dest);
      const lp = this.filter('lowpass', 900, 0.7, out);
      const o = this.osc('sine', 400, lp, t, t + 1.5);
      o.frequency.setValueAtTime(410, t);
      o.frequency.linearRampToValueAtTime(380, t + 0.3);
      o.frequency.setValueAtTime(405, t + 0.5);
      o.frequency.linearRampToValueAtTime(350, t + 1.3);
      out.gain.setValueAtTime(0.0001, t);
      out.gain.exponentialRampToValueAtTime(level, t + 0.06);
      out.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
      out.gain.exponentialRampToValueAtTime(level, t + 0.56);
      out.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    }

    /* Kovový / zvonový tón (frekvenční modulace s neharmonickým poměrem). */
    fm(dest, freq, ratio, index, t, level, decay) {
      const g = this.gain(0, dest);
      env(g.gain, t, 0.004, level, decay);
      const carrier = this.osc('sine', freq, g, t, t + decay + 0.1);
      const modGain = this.ctx.createGain();
      modGain.gain.setValueAtTime(index, t);
      modGain.gain.exponentialRampToValueAtTime(1, t + decay * 0.7);
      modGain.connect(carrier.frequency);
      this.osc('sine', freq * ratio, modGain, t, t + decay + 0.1);
    }

    bell(dest, freq, t, level, decay) {
      this.fm(dest, freq, 1.41, freq * 1.8, t, level, decay);
    }

    /* Hluboké žuchnutí (dopad, zavření). */
    thump(dest, t, level, freq) {
      const f = freq || 60;
      const g = this.gain(0, dest);
      env(g.gain, t, 0.005, level, 0.4);
      const o = this.osc('sine', f * 1.6, g, t, t + 0.5);
      o.frequency.setValueAtTime(f * 1.6, t);
      o.frequency.exponentialRampToValueAtTime(f * 0.6, t + 0.3);
    }

    /* Šum s filtrem (papír, šoupání). */
    noiseBurst(dest, t, dur, type, freq, level) {
      const g = this.gain(0, dest);
      env(g.gain, t, Math.min(0.01, dur / 3), level, dur);
      const f = this.filter(type, freq, 0.8, g);
      this.noiseSource(f, t, t + dur + 0.05);
    }

    /* Zaskřípání dřeva (prkna, panty). */
    creak(dest, t, level, duration) {
      const dur = duration || 1.3;
      const g = this.gain(0, dest);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(level, t + 0.15);
      g.gain.setValueAtTime(level, t + dur * 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      const bp = this.filter('bandpass', 700, 5, g);
      const base = 95 + Math.random() * 40;
      const o = this.osc('sawtooth', base, bp, t, t + dur + 0.05);
      o.frequency.setValueAtTime(base, t);
      o.frequency.linearRampToValueAtTime(base * (0.8 + Math.random() * 0.5), t + dur);
      const wob = this.ctx.createOscillator();
      wob.frequency.value = 5 + Math.random() * 4;
      const wg = this.ctx.createGain();
      wg.gain.value = 14;
      wob.connect(wg);
      wg.connect(o.frequency);
      wob.start(t);
      wob.stop(t + dur + 0.05);
    }

    /* Plochý akord (smyčce / sbor), pomalý nástup i dozvuk. */
    pad(dest, freqs, t, attack, release, level) {
      for (const f of freqs) {
        const g = this.gain(0, dest);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(level, t + attack);
        g.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
        const lp = this.filter('lowpass', 1400, 0.5, g);
        this.osc('triangle', f, lp, t, t + attack + release + 0.1, -6);
        this.osc('triangle', f, lp, t, t + attack + release + 0.1, 7);
      }
    }
  }

  /* ====================================================================
   * Podkresy (běží ve smyčce, dokud se nepřepnou)
   * ==================================================================== */

  const AMBIENCE = {
    /* Úvod: hluboký tón, „sbor“ v d moll, vítr a vzdálený zvon. */
    intro(group, h, opts) {
      const o = opts || {};
      const ctx = this.ctx;
      const t = ctx.currentTime;
      const out = this.gain(o.level || 1, group);

      // Hluboký tón D2 přes dolní propust s pomalým „dýcháním“.
      const droneGain = this.gain(0.15, out);
      const lp = this.filter('lowpass', 220, 0.8, droneGain);
      for (const det of [-6, 5]) h.sources.push(this.osc('sawtooth', NOTE.D2, lp, t, 0, det));
      this.lfo(lp.frequency, 0.05, 90, t, h);

      // „Sbor“: tóny akordu d moll se střídavě nadechují.
      [NOTE.D3, NOTE.F3, NOTE.A3, NOTE.D4].forEach((f, i) => {
        const vg = this.gain(0.022, out);
        const vlp = this.filter('lowpass', 1100, 0.5, vg);
        h.sources.push(this.osc('triangle', f, vlp, t, 0, -7));
        h.sources.push(this.osc('triangle', f, vlp, t, 0, 8));
        this.lfo(vg.gain, 0.035 + i * 0.013, 0.02, t, h);
      });

      // Vítr: šum přes pásmovou propust, která se pomalu přelévá; mírně i do stran.
      const pan = ctx.createStereoPanner();
      const windGain = this.gain(0.045, pan);
      pan.connect(out);
      const bp = this.filter('bandpass', 500, 0.7, windGain);
      h.sources.push(this.noiseSource(bp, t, 0, this.noise, true));
      this.lfo(bp.frequency, 0.07, 280, t, h);
      this.lfo(pan.pan, 0.03, 0.6, t, h);

      // Vzdálený zvon.
      if (o.bells !== false) {
        this.every(h, 6, 11, (when) => this.bell(out, pick([NOTE.D4, NOTE.A3, NOTE.F4]), when, 0.06, 5));
      }
    },

    /* Titulní obrazovka a výběr: totéž, jen tišší a bez zvonu. */
    title(group, h) {
      AMBIENCE.intro.call(this, group, h, { level: 0.55, bells: false });
    },

    /* Obecná tichá místnost. */
    room(group, h) {
      const t = this.ctx.currentTime;
      const hum = this.gain(0.06, group);
      const lp = this.filter('lowpass', 450, 0.5, hum);
      h.sources.push(this.noiseSource(lp, t, 0, this.brown, true));
      this.every(h, 14, 30, (when) => this.creak(group, when, 0.03));
    },

    /* Anatomický kabinet: ticho, hodiny, slabý tón, občas zaskřípe podlaha. */
    kabinet(group, h) {
      const t = this.ctx.currentTime;
      AMBIENCE.room.call(this, group, h);

      // Nástěnné hodiny: tik – tak.
      this.metronome(h, 1.0, (when, n) => {
        this.click(group, n % 2 ? 2100 : 2700, when, 0.02);
      });

      // Sotva slyšitelný tón (prázdnota budovy).
      const tone = this.gain(0.012, group);
      h.sources.push(this.osc('sine', NOTE.D2, tone, t));
      h.sources.push(this.osc('sine', NOTE.A2, tone, t));
      this.lfo(tone.gain, 0.06, 0.008, t, h);
    },

    /* Stará herna GSPORT: ventilátory, bzučení neonů, temný nejistý akord, občas zapraská
       dřevo nebo zašumí televizor. Vše tiché a pozvolné – žádné náhlé hlasité zvuky. */
    herna(group, h) {
      const t = this.ctx.currentTime;
      // ventilátory počítačů
      const fans = this.gain(0.04, group);
      const lp = this.filter('lowpass', 800, 0.5, fans);
      h.sources.push(this.noiseSource(lp, t, 0, this.brown, true));
      // bzučení neonů (síť 50 Hz → 100 Hz), pomalu kolísá
      const hum = this.gain(0.008, group);
      h.sources.push(this.osc('sine', 100, hum, t));
      h.sources.push(this.osc('sine', 200, this.gain(0.4, hum), t));
      this.lfo(hum.gain, 0.13, 0.004, t, h);
      // podkres: nízký akord s „nepatřičnou“ malou sekundou, pomalu dýchá
      const pad = this.gain(0.0001, group);
      pad.gain.setTargetAtTime(1, t, 3);
      const plp = this.filter('lowpass', 520, 0.7, pad);
      [NOTE.A2, 116.54, 130.81, 164.81].forEach((f, i) => {
        const vg = this.gain(0.013, plp);
        h.sources.push(this.osc('sawtooth', f, vg, t, 0, i % 2 ? 7 : -7));
        this.lfo(vg.gain, 0.03 + i * 0.011, 0.011, t, h);
      });
      this.lfo(plp.frequency, 0.025, 220, t, h);
      // staré dřevo
      this.every(h, 12, 26, (when) => this.creak(group, when, 0.025, 1 + Math.random()));
      // vzdálený šum televizoru se pozvolna zvedne a zase utichne
      this.every(h, 18, 34, (when) => {
        const g = this.gain(0, group);
        g.gain.setValueAtTime(0.0001, when);
        g.gain.exponentialRampToValueAtTime(0.018, when + 1.5);
        g.gain.exponentialRampToValueAtTime(0.0001, when + 4);
        this.noiseSource(this.filter('bandpass', 3000, 0.6, g), when, when + 4.2);
      });
      // vzácné tiché pípnutí z monitorů (nízko, ne vesele)
      this.every(h, 16, 30, (when) => this.ping(group, pick([880, 698.46]), when, 0.008, 0.4));
    },

    /* Výstrojní sklad (vojenská): vzduchotechnika, bzučící zářivka, tichý temný tón, kapající voda,
       občas vzdálené kovové zadunění a vrzání plechu. Hladiny jako u herny, ať je to slyšet i z notebooku. */
    sklad(group, h) {
      const t = this.ctx.currentTime;
      // vzduchotechnika (šum vzduchu v potrubí)
      const air = this.gain(0.035, group);
      h.sources.push(this.noiseSource(this.filter('lowpass', 900, 0.5, air), t, 0, this.brown, true));
      this.lfo(air.gain, 0.05, 0.01, t, h);
      // zářivka: bzučení 100 Hz s vyššími harmonickými (slyšitelné i z malých reproduktorů), občas zakolísá
      const buzz = this.gain(0.006, group);
      h.sources.push(this.osc('sawtooth', 100, this.filter('bandpass', 1200, 1.2, buzz), t));
      this.lfo(buzz.gain, 0.21, 0.003, t, h);
      // temný tón (d moll bez tercie), pomalu dýchá
      const pad = this.gain(0.0001, group);
      pad.gain.setTargetAtTime(1, t, 3);
      [NOTE.D2, NOTE.A2, 2 * NOTE.D2].forEach((f, i) => {
        const vg = this.gain(0.012, this.filter('lowpass', 600, 0.7, pad));
        h.sources.push(this.osc(i === 2 ? 'triangle' : 'sine', f, vg, t, 0, i ? 4 : -4));
        this.lfo(vg.gain, 0.04 + i * 0.013, 0.008, t, h);
      });
      // kapka vody ze stropu
      this.every(h, 3, 7, (when) => this.ping(group, 1300 + Math.random() * 600, when, 0.035, 0.18));
      // vzdálené kovové zadunění (někde v budově zapadly dveře)
      this.every(h, 18, 36, (when) => {
        this.thump(group, when, 0.06, 65);
        this.ping(group, 196, when + 0.02, 0.018, 0.9);
      });
      // plech regálu
      this.every(h, 14, 28, (when) => this.creak(group, when, 0.03, 0.6 + Math.random() * 0.6));
    },

    /* Tělocvična (vojenská, Brána II): prázdný velký sál, bzučení zářivek, tichý tón, občas
       vzdálené doskakování míče a zavrzání parket. Nic náhlého ani hlasitého. */
    telocvicna(group, h) {
      const t = this.ctx.currentTime;
      // tón prázdného sálu
      const hall = this.gain(0.03, group);
      h.sources.push(this.noiseSource(this.filter('lowpass', 500, 0.5, hall), t, 0, this.brown, true));
      this.lfo(hall.gain, 0.04, 0.008, t, h);
      // řada zářivek: 100 Hz s harmonickými, dvě trubice mírně rozladěné
      for (const [f, lvl] of [[100, 0.006], [100.6, 0.004]]) {
        const buzz = this.gain(lvl, group);
        h.sources.push(this.osc('sawtooth', f, this.filter('bandpass', 1500, 1.1, buzz), t));
        this.lfo(buzz.gain, 0.17 + f / 2000, 0.002, t, h);
      }
      // tichý tón (d moll bez tercie), pomalu dýchá
      const pad = this.gain(0.0001, group);
      pad.gain.setTargetAtTime(1, t, 3);
      [NOTE.D2, NOTE.A2].forEach((f, i) => {
        const vg = this.gain(0.01, this.filter('lowpass', 500, 0.7, pad));
        h.sources.push(this.osc('sine', f, vg, t, 0, i ? 3 : -3));
        this.lfo(vg.gain, 0.05 + i * 0.017, 0.006, t, h);
      });
      // vzdálený míč: doskakuje, údery se zkracují a slábnou
      this.every(h, 25, 45, (when) => {
        let dt = 0;
        let gap = 0.55;
        for (let i = 0; i < 6; i++) {
          this.thump(group, when + dt, 0.07 * Math.pow(0.7, i), 110);
          dt += gap;
          gap *= 0.72;
        }
      });
      // parkety
      this.every(h, 16, 30, (when) => this.creak(group, when, 0.025, 0.5 + Math.random() * 0.5));
    },

    /* Noční cvičiště (venku): vítr v trávě, cvrčci, vzdálená sova, plachta stanu a tichý generátor
       reflektoru. Všechno tiché a pozvolné. */
    cviciste(group, h) {
      const ctx = this.ctx;
      const t = ctx.currentTime;
      // vítr: šum přes pásmovou propust, pomalu se přelévá ze strany na stranu
      const pan = ctx.createStereoPanner();
      pan.connect(group);
      const wind = this.gain(0.05, pan);
      const bp = this.filter('bandpass', 420, 0.6, wind);
      h.sources.push(this.noiseSource(bp, t, 0, this.noise, true));
      this.lfo(bp.frequency, 0.05, 220, t, h);
      this.lfo(wind.gain, 0.08, 0.02, t, h);
      this.lfo(pan.pan, 0.025, 0.5, t, h);
      // tráva: tichý vyšší šum
      const grass = this.gain(0.01, group);
      h.sources.push(this.noiseSource(this.filter('highpass', 2500, 0.5, grass), t, 0, this.noise, true));
      this.lfo(grass.gain, 0.11, 0.006, t, h);
      // generátor reflektoru daleko: hluboký tón s harmonickými
      const gen = this.gain(0.012, group);
      const glp = this.filter('lowpass', 300, 0.8, gen);
      h.sources.push(this.osc('sawtooth', 50, glp, t));
      h.sources.push(this.osc('sawtooth', 100.7, glp, t, 0, 4));
      this.lfo(gen.gain, 0.3, 0.003, t, h);
      // cvrčci: krátké trylky kolem 4,5 kHz
      this.every(h, 1.2, 3.5, (when) => {
        const n = 3 + Math.floor(Math.random() * 4);
        const f = 4200 + Math.random() * 700;
        for (let i = 0; i < n; i++) this.ping(group, f, when + i * 0.07, 0.005, 0.05);
      });
      // sova: dvě tichá houknutí daleko
      this.every(h, 25, 60, (when) => this.hoot(group, when, 0.03));
      // plachta stanu: občas zapleská
      this.every(h, 9, 20, (when) => {
        const n = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) this.noiseBurst(group, when + i * (0.12 + Math.random() * 0.1), 0.08, 'lowpass', 600, 0.05);
      });
    },

    /* Stanoviště na kótě 680 za svítání: vítr přes hranu kopce, tráva, skřivan nad loukou,
       občas vrána v údolí a vzdálený zvon z vesnice. */
    strelnice(group, h) {
      const ctx = this.ctx;
      const t = ctx.currentTime;
      const pan = ctx.createStereoPanner();
      pan.connect(group);
      const wind = this.gain(0.045, pan);
      const bp = this.filter('bandpass', 380, 0.6, wind);
      h.sources.push(this.noiseSource(bp, t, 0, this.noise, true));
      this.lfo(bp.frequency, 0.04, 180, t, h);
      this.lfo(wind.gain, 0.07, 0.02, t, h);
      this.lfo(pan.pan, 0.02, 0.6, t, h);
      const grass = this.gain(0.008, group);
      h.sources.push(this.noiseSource(this.filter('highpass', 2800, 0.5, grass), t, 0, this.noise, true));
      this.lfo(grass.gain, 0.09, 0.005, t, h);
      // skřivan: rychlé trylky vysoko
      this.every(h, 2.5, 6, (when) => {
        const n = 6 + Math.floor(Math.random() * 10);
        let dt = 0;
        for (let i = 0; i < n; i++) {
          this.ping(group, 3000 + Math.random() * 1800, when + dt, 0.006, 0.06);
          dt += 0.05 + Math.random() * 0.06;
        }
      });
      // vrána v údolí: dvě chraplavá zakrákání
      this.every(h, 18, 40, (when) => {
        for (let i = 0; i < 2; i++) this.noiseBurst(group, when + i * 0.42, 0.22, 'bandpass', 900, 0.02);
      });
      // vzdálený zvon z vesnice
      this.every(h, 40, 80, (when) => this.bell(group, pick([NOTE.D5, NOTE.A4]), when, 0.012, 5));
    },

    /* Fotografická laboratoř (temná komora): ventilace, kapání vody do dřezu, tikání časovače,
       občas zabublá ustalovač. Tiché a pravidelné. */
    fotolab(group, h) {
      const t = this.ctx.currentTime;
      AMBIENCE.room.call(this, group, h);
      // ventilace: úzký šum
      const fan = this.gain(0.03, group);
      const bp = this.filter('bandpass', 260, 1.2, fan);
      h.sources.push(this.noiseSource(bp, t, 0, this.brown, true));
      this.lfo(fan.gain, 0.09, 0.008, t, h);
      // kapání: asi jednou za sekundu, nepravidelně, vysoké „plink“ s krátkým dozvukem
      this.every(h, 0.7, 1.6, (when) => this.ping(group, 1800 + Math.random() * 900, when, 0.028, 0.35));
      // časovač: tiché tikání
      this.metronome(h, 1.0, (when) => this.click(group, 2400, when, 0.012));
      // bublina v misce
      this.every(h, 12, 28, (when) => this.ping(group, 300 + Math.random() * 120, when, 0.02, 0.2));
    },

    /* Závěrečná obrazovka: klidnější tón. */
    finish(group, h) {
      AMBIENCE.intro.call(this, group, h, { level: 0.5, bells: false });
      this.every(h, 9, 14, (when) => this.bell(group, pick([NOTE.D5, NOTE.A4]), when, 0.04, 6));
    },
  };

  /* ====================================================================
   * Efekty (jednorázové)
   * ==================================================================== */

  const SFX = {
    /* Basketbal: míč prolétl síťkou (šustnutí). */
    swish(dest, t) {
      this.noiseBurst(dest, t, 0.22, 'bandpass', 3200, 0.12);
      this.noiseBurst(dest, t + 0.05, 0.18, 'bandpass', 2200, 0.06);
    },

    /* Basketbal: míč ťukl do obroučky (kovové cinknutí). */
    rim(dest, t) {
      this.ping(dest, 880, t, 0.09, 0.5);
      this.ping(dest, 1390, t, 0.05, 0.35);
      this.thump(dest, t, 0.08, 120);
    },

    /* Basketbal: míč dopadl na podlahu. */
    bounce(dest, t) {
      this.thump(dest, t, 0.22, 85);
      this.thump(dest, t + 0.42, 0.1, 85);
    },

    /* Klávesa číselníku. */
    key(dest, t) {
      this.click(dest, 3200, t, 0.2);
      this.ping(dest, 1900, t, 0.02, 0.08);
    },

    /* Reflex test: signál „teď!“. */
    reflexGo(dest, t) {
      this.ping(dest, 1320, t, 0.06, 0.18);
    },

    /* Započítaný dřep: dva rychlé stoupající tóny. */
    squatOk(dest, t) {
      this.ping(dest, 1046.5, t, 0.07, 0.15);
      this.ping(dest, 1568, t + 0.08, 0.06, 0.2);
    },

    /* Mělký dřep: krátké nízké bzučení. */
    squatShallow(dest, t) {
      const g = this.gain(0, dest);
      env(g.gain, t, 0.01, 0.05, 0.25);
      const lp = this.filter('lowpass', 900, 0.5, g);
      this.osc('square', 140, lp, t, t + 0.3);
    },

    /* Vložení hráčské karty: cvaknutí a dvě pípnutí. */
    cardInsert(dest, t) {
      this.click(dest, 1200, t, 0.25);
      this.ping(dest, 1760, t + 0.15, 0.04, 0.12);
      this.ping(dest, 2349, t + 0.28, 0.04, 0.18);
    },

    /* LEKAČKA: hluboký úder, disonantní „orchestrální“ shluk, skřípot a ostrý šum. */
    scareHit(dest, t) {
      this.thump(dest, t, 1.0, 38);
      this.noiseBurst(dest, t, 0.45, 'highpass', 700, 0.55);
      const cl = this.gain(0, dest);
      cl.gain.setValueAtTime(0.0001, t);
      cl.gain.exponentialRampToValueAtTime(0.5, t + 0.006);
      cl.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
      const lp = this.filter('lowpass', 3800, 0.6, cl);
      [207.65, 220, 233.08, 246.94, 415.3, 440, 466.16].forEach((f, i) => {
        this.osc('sawtooth', f, this.gain(0.12, lp), t, t + 1.7, i % 2 ? 9 : -9);
      });
      const sc = this.gain(0, dest);
      sc.gain.setValueAtTime(0.0001, t);
      sc.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
      sc.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      const bp = this.filter('bandpass', 2200, 1.5, sc);
      for (const f of [1661, 1760]) {
        const o = this.osc('sawtooth', f, bp, t, t + 1.2);
        o.frequency.setValueAtTime(f, t);
        o.frequency.exponentialRampToValueAtTime(f * 1.5, t + 0.9);
      }
    },

    /* LEKAČKA: televizor zařve – hlasitý šum, skřípot a úder. */
    scareStatic(dest, t) {
      const g = this.gain(0, dest);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.7, t + 0.01);
      g.gain.setValueAtTime(0.7, t + 0.8);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
      const chop = this.gain(0.6, g);
      this.lfo(chop.gain, 31, 0.4, t, null).stop(t + 1.25);
      this.noiseSource(this.filter('bandpass', 3000, 0.5, chop), t, t + 1.25);
      SFX.scareHit.call(this, dest, t);
    },

    /* LEKAČKA: něco se řítí chodbou – rychle sílící svist a pak úder. */
    scareRush(dest, t) {
      const g = this.gain(0, dest);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.4, t + 0.28);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      const bp = this.filter('bandpass', 300, 1.2, g);
      bp.frequency.setValueAtTime(300, t);
      bp.frequency.exponentialRampToValueAtTime(3200, t + 0.28);
      this.noiseSource(bp, t, t + 0.55);
      SFX.scareHit.call(this, dest, t + 0.26);
    },

    /* Obrazovka počítače píše: velmi tiché cvaknutí. */
    termTick(dest, t) {
      this.click(dest, 2800 + Math.random() * 600, t, 0.025);
    },

    /* Páčkový vypínač v pojistkové skříni. */
    switch(dest, t) {
      this.click(dest, 900, t, 0.3);
      this.thump(dest, t, 0.2, 120);
      this.click(dest, 2200, t + 0.02, 0.08);
    },

    /* Vypadlý jistič: krátké zabzučení, cvak a pozvolné dobíhání (tiché, bez úleku). */
    breaker(dest, t) {
      const g = this.gain(0, dest);
      env(g.gain, t, 0.15, 0.05, 0.5);
      const lp = this.filter('lowpass', 700, 0.6, g);
      this.osc('sawtooth', 100, lp, t, t + 0.7);
      this.click(dest, 800, t + 0.45, 0.25);
      this.thump(dest, t + 0.45, 0.15, 80);
      const w = this.gain(0, dest);
      w.gain.setValueAtTime(0.0001, t + 0.5);
      w.gain.exponentialRampToValueAtTime(0.025, t + 0.6);
      w.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
      const o = this.osc('sine', 420, w, t + 0.5, t + 2.3);
      o.frequency.setValueAtTime(420, t + 0.5);
      o.frequency.exponentialRampToValueAtTime(60, t + 2.2);
    },

    /* Naskočení proudu: relé a pozvolné zabzučení. */
    powerOn(dest, t) {
      this.click(dest, 1300, t, 0.2);
      const g = this.gain(0, dest);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.03, t + 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
      const o = this.osc('sine', 60, g, t, t + 1.9);
      o.frequency.exponentialRampToValueAtTime(240, t + 1.2);
      this.ping(dest, 1318.5, t + 1.0, 0.03, 0.3);
    },

    /* Dveře se za hráčem tiše zavřou a cvakne zámek. */
    doorSoft(dest, t) {
      this.creak(dest, t, 0.04, 1.1);
      this.thump(dest, t + 1.1, 0.18, 60);
      this.click(dest, 1500, t + 1.5, 0.15);
      this.click(dest, 900, t + 1.56, 0.12);
    },

    /* Tiché zaskřípání (kostra pootočila hlavou). */
    creakSoft(dest, t) {
      this.creak(dest, t, 0.035, 1.4);
    },

    /* UV svítilna: cvaknutí a slabé elektrické zabzučení. */
    uv(dest, t) {
      this.click(dest, 1600, t, 0.15);
      const g = this.gain(0, dest);
      env(g.gain, t + 0.05, 0.1, 0.02, 0.9);
      this.osc('triangle', 3400, this.filter('bandpass', 3400, 4, g), t + 0.05, t + 1.1);
    },

    /* Level up: stoupající arpeggio. */
    levelUp(dest, t) {
      [NOTE.A4, 554.37, 659.25, NOTE.A5].forEach((f, i) => this.ping(dest, f, t + i * 0.09, 0.05, 0.5));
    },

    /* Tlačítko kalkulačky: tiché pípnutí. */
    /* Starý polní telefon: dvě krátká zvonění mechanického zvonku (rychle opakovaný úder). */
    phoneRing(dest, t) {
      for (const start of [0, 0.55]) {
        for (let i = 0; i < 9; i++) {
          const when = t + start + i * 0.042;
          this.ping(dest, 1250 + (i % 2) * 60, when, 0.05, 0.05);
          this.click(dest, 3200, when, 0.02);
        }
      }
    },

    beep(dest, t) {
      this.ping(dest, 2300, t, 0.012, 0.06);
      this.click(dest, 4000, t, 0.03);
    },

    /* Přiložení pravítka: dvě dřevěná klepnutí. */
    measure(dest, t) {
      this.click(dest, 1400, t, 0.25);
      this.click(dest, 1150, t + 0.14, 0.2);
    },

    /* Cvičná laserová puška (laser game): krátké klesající „píí“. */
    laser(dest, t) {
      const g = this.gain(0, dest);
      env(g.gain, t, 0.005, 0.12, 0.18);
      const o = this.osc('square', 1800, this.filter('lowpass', 3200, 0.8, g), t, t + 0.2);
      o.frequency.setValueAtTime(1800, t);
      o.frequency.exponentialRampToValueAtTime(380, t + 0.18);
    },

    /* Odstřelovací puška přes chrániče sluchu: tupá rána, krátký šum a ozvěna z údolí. */
    shot(dest, t) {
      this.thump(dest, t, 0.4, 62);
      this.noiseBurst(dest, t, 0.16, 'lowpass', 900, 0.22);
      this.noiseBurst(dest, t + 0.02, 0.5, 'lowpass', 320, 0.12);
      // ozvěna od protějšího svahu
      this.noiseBurst(dest, t + 0.9, 0.7, 'lowpass', 260, 0.035);
    },

    /* Přebití závěru: otevřít a zavřít – dvakrát dvojí kovové cvaknutí. */
    bolt(dest, t) {
      this.click(dest, 2600, t, 0.12);
      this.click(dest, 1700, t + 0.09, 0.1);
      this.click(dest, 2100, t + 0.32, 0.11);
      this.click(dest, 3000, t + 0.4, 0.09);
    },

    /* Zásah ocelového gongu v dálce: zvonivý tón s nehudebními alikvotami. */
    gong(dest, t) {
      this.ping(dest, 610, t, 0.07, 1.6);
      this.ping(dest, 1473, t, 0.035, 1.1);
      this.ping(dest, 2290, t, 0.018, 0.7);
      this.thump(dest, t, 0.05, 180);
    },

    /* Chrastění kostí (kostlivec se probudil). */
    kosti(dest, t) {
      for (let i = 0; i < 10; i++) {
        const w = t + i * 0.045 + Math.random() * 0.03;
        this.click(dest, 1100 + Math.random() * 1500, w, 0.16);
        this.thump(dest, w, 0.04, 220 + Math.random() * 120);
      }
    },

    /* Kostlivec rozsypaný na hromádku: dopadající kosti. */
    rozpad(dest, t) {
      let dt = 0;
      for (let i = 0; i < 12; i++) {
        this.click(dest, 700 + Math.random() * 1400, t + dt, 0.2 * (1 - i / 14));
        this.thump(dest, t + dt, 0.09 * (1 - i / 14), 160 + Math.random() * 80);
        dt += 0.03 + Math.random() * 0.07;
      }
    },

    /* Hráče zasáhl kostlivec: tupá rána. */
    au(dest, t) {
      this.thump(dest, t, 0.35, 70);
      this.noiseBurst(dest, t, 0.12, 'lowpass', 600, 0.15);
    },

    /* Psací stroj: rychlé údery kláves a na konci zvonek a posun válce. */
    typewriter(dest, t) {
      let dt = 0;
      for (let i = 0; i < 14; i++) {
        this.click(dest, 1700 + Math.random() * 900, t + dt, 0.22);
        this.thump(dest, t + dt, 0.07, 140);
        dt += 0.07 + Math.random() * 0.08;
      }
      this.ping(dest, 2350, t + dt + 0.05, 0.05, 0.6);
      this.noiseBurst(dest, t + dt + 0.2, 0.3, 'bandpass', 1400, 0.08);
      this.click(dest, 900, t + dt + 0.52, 0.2);
    },

    /* Nový předmět v inventáři. */
    pickup(dest, t) {
      this.ping(dest, NOTE.A5, t, 0.06, 0.9);
      this.ping(dest, NOTE.E6, t + 0.09, 0.045, 1.1);
    },

    /* Papír (lísteček, zápisník, plakát). */
    paper(dest, t) {
      this.noiseBurst(dest, t, 0.07, 'highpass', 2600, 0.07);
      this.noiseBurst(dest, t + 0.11, 0.09, 'highpass', 3200, 0.05);
      this.noiseBurst(dest, t + 0.24, 0.06, 'highpass', 2800, 0.04);
    },

    /* Otočení listu v knize. */
    page(dest, t) {
      const g = this.gain(0, dest);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09, t + 0.06);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
      const bp = this.filter('bandpass', 1800, 0.9, g);
      bp.frequency.setValueAtTime(1200, t);
      bp.frequency.exponentialRampToValueAtTime(4200, t + 0.25);
      this.noiseSource(bp, t, t + 0.4);
    },

    /* Vytažení knihy z police: šoupnutí a tupé klepnutí. */
    book(dest, t) {
      this.noiseBurst(dest, t, 0.28, 'bandpass', 900, 0.12);
      this.thump(dest, t + 0.3, 0.3, 95);
      this.click(dest, 600, t + 0.3, 0.12);
    },

    /* Otočení se v místnosti: tichý krok po prknech. */
    step(dest, t) {
      this.thump(dest, t, 0.12, 70);
      this.noiseBurst(dest, t, 0.08, 'lowpass', 900, 0.05);
      if (Math.random() < 0.4) this.creak(dest, t + 0.05, 0.02, 0.5);
    },

    /* Šuplík: šoupání dřeva (trhavé) a dojetí na doraz. */
    drawer(dest, t) {
      const dur = 0.55;
      const g = this.gain(0, dest);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.22, t + 0.05);
      g.gain.setValueAtTime(0.22, t + dur - 0.1);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      const chop = this.gain(0.5, g);
      this.lfo(chop.gain, 23, 0.5, t, null).stop(t + dur);
      const bp = this.filter('bandpass', 450, 3, chop);
      bp.frequency.setValueAtTime(450, t);
      bp.frequency.linearRampToValueAtTime(820, t + dur);
      this.noiseSource(bp, t, t + dur + 0.05);
      this.thump(dest, t + dur, 0.35, 85);
      this.click(dest, 900, t + dur, 0.2);
    },

    /* Zamčený šuplík: dvakrát zachrastí o zámek. */
    locked(dest, t) {
      for (const dt of [0, 0.13]) {
        this.thump(dest, t + dt, 0.22, 90);
        this.click(dest, 700, t + dt, 0.18);
        this.click(dest, 2600, t + dt + 0.01, 0.06);
      }
    },

    /* Odemčení šuplíku klíčkem: zasunutí, otočení (cvak) a vysunutí šuplíku. */
    unlockDrawer(dest, t) {
      this.noiseBurst(dest, t, 0.14, 'bandpass', 3200, 0.06);
      this.click(dest, 1900, t + 0.22, 0.25);
      this.click(dest, 1200, t + 0.27, 0.2);
      this.ping(dest, 2400, t + 0.22, 0.02, 0.15);
      SFX.drawer.call(this, dest, t + 0.5);
    },

    /* Špatná odpověď: kovové zadrnčení zámku. */
    wrong(dest, t) {
      this.fm(dest, 196, 2.76, 420, t, 0.16, 0.7);
      this.thump(dest, t, 0.25, 70);
      this.click(dest, 700, t, 0.25);
    },

    /* Správný krok: cvaknutí mechanismu a dva stoupající tóny. */
    unlock(dest, t) {
      this.click(dest, 1500, t, 0.3);
      this.click(dest, 900, t + 0.08, 0.28);
      this.thump(dest, t + 0.08, 0.2, 110);
      this.ping(dest, NOTE.D5, t + 0.25, 0.05, 1.3);
      this.ping(dest, NOTE.A5, t + 0.4, 0.04, 1.5);
    },

    /* Otevření brány: závora, vrzání pantů, dunění a světlý akord. */
    door(dest, t) {
      this.click(dest, 800, t, 0.3);
      this.thump(dest, t, 0.3, 90);
      this.creak(dest, t + 0.25, 0.09, 1.8);
      this.thump(dest, t + 1.9, 0.4, 50);
      this.pad(dest, [NOTE.D3, NOTE.Fs3, NOTE.A3, NOTE.D4], t + 1.3, 1.6, 4, 0.035);
    },

    /* Nápověda: tichý zvon. */
    hint(dest, t) {
      this.bell(dest, NOTE.D5, t, 0.05, 2.5);
    },

    /* Úvod: průlet branou (svist a hluboký úder). */
    pass(dest, t) {
      const g = this.gain(0, dest);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.14, t + 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.7);
      const bp = this.filter('bandpass', 250, 1.2, g);
      bp.frequency.setValueAtTime(250, t);
      bp.frequency.exponentialRampToValueAtTime(1300, t + 0.7);
      bp.frequency.exponentialRampToValueAtTime(300, t + 1.6);
      this.noiseSource(bp, t, t + 1.8);
      this.thump(dest, t + 0.6, 0.22, 45);
    },

    /* Úvod: vstup do světla. */
    light(dest, t) {
      this.noiseBurst(dest, t, 2.5, 'highpass', 5000, 0.04);
      this.pad(dest, [NOTE.A4, NOTE.D5, NOTE.Fs5], t, 1.8, 4, 0.03);
      this.pad(dest, [NOTE.D3, NOTE.A3], t, 2.2, 4, 0.04);
    },
  };

  global.Sound = Sound;
})(window);
