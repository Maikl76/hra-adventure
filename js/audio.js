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
      if (!on && this.current) {
        this.current.stop(0.4);
        this.current = null;
      }
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
    /* Klávesa číselníku. */
    key(dest, t) {
      this.click(dest, 3200, t, 0.2);
      this.ping(dest, 1900, t, 0.02, 0.08);
    },

    /* Tlačítko kalkulačky: tiché pípnutí. */
    beep(dest, t) {
      this.ping(dest, 2300, t, 0.012, 0.06);
      this.click(dest, 4000, t, 0.03);
    },

    /* Přiložení pravítka: dvě dřevěná klepnutí. */
    measure(dest, t) {
      this.click(dest, 1400, t, 0.25);
      this.click(dest, 1150, t + 0.14, 0.2);
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
