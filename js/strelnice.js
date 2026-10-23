/*
 * Odstřelovací puška (Vojenská tělovýchova, Brána IV – Stanoviště na kótě 680).
 *
 * Výhled do údolí se střelnicí a dalekohled na pušce. Všechno se počítá v úhlech: 1 mil
 * (miliradián) = 1 m ve vzdálenosti 1 000 m. Kříž dalekohledu je v první ohniskové rovině – jeho
 * dělení platí při každém zvětšení, takže jde křížem i měřit vzdálenost (velikost × 1 000 : mil).
 *
 * Tělo střelce: puška se houpe podle polohy (vstoje malá opěrná plocha a vysoko těžiště, vkleče,
 * vleže na dvojnožce), zvedá se s nádechem (nejklidnější je přirozená dechová pauza po výdechu;
 * dech jde zadržet, po pár sekundách se ale ruce začnou třást) a každý tep srdce jí cukne (po
 * výstupu na kótu je tep vysoký, při odpočinku klesá).
 *
 * Střela: úsťová rychlost v0, odpor vzduchu úměrný v² (v = v0 · e^(−k·x)), doba letu
 * t = (e^(k·x) − 1) / (k · v0), pokles ½ · g · t². Puška je nastřelená na 100 m: dalekohled je
 * 5 cm nad hlavní a hlaveň míří o kousek výš, takže se střela s osou dalekohledu protne na 100 m.
 * Boční vítr posune střelu o w · (t − x / v0).
 *
 * Cíle jsou ocelové gongy a tabule – nic živého. Plátno 960 × 540 (logicky), ui.js k tomu
 * přidává tlačítka a texty z game.json.
 */

export const G = 9.81;
export const SOUND_SPEED = 343;
export const RIFLE = { v0: 820, k: 0.00076, sight: 0.05, zero: 100, spread: 0.07 };

/* ---------- Let střely ---------- */

export function flightTime(x, r = RIFLE) {
  return (Math.exp(r.k * x) - 1) / (r.k * r.v0);
}

/* Skutečný pokles pod osou hlavně ve vzdálenosti x (m). */
export function dropBelowBore(x, r = RIFLE) {
  const t = flightTime(x, r);
  return 0.5 * G * t * t;
}

function boreAngle(r) {
  return (dropBelowBore(r.zero, r) + r.sight) / r.zero;
}

/* Výška střely nad osou dalekohledu (záměrnou) ve vzdálenosti x, m; záporná = pod ní. */
export function lineHeight(x, r = RIFLE) {
  return x * boreAngle(r) - dropBelowBore(x, r) - r.sight;
}

/* O kolik mil mířit nad cíl ve vzdálenosti x (kladné = výš). */
export function holdMil(x, r = RIFLE) {
  return (-lineHeight(x, r) / x) * 1000;
}

/* Posun bočním větrem w (m/s) ve vzdálenosti x, v mil (kladný = po větru). */
export function windMil(x, w = 1, r = RIFLE) {
  return ((w * (flightTime(x, r) - x / r.v0)) / x) * 1000;
}

/* Pokles bez odporu vzduchu (ve vakuu) za dobu x / v0, m. */
export function vacuumDrop(x, r = RIFLE) {
  const t = x / r.v0;
  return 0.5 * G * t * t;
}

/* Balistická karta: řádky po `step` metrech. */
export function ballisticCard(r = RIFLE, from = 100, to = 600, step = 50) {
  const rows = [];
  for (let d = from; d <= to + 1e-9; d += step) {
    rows.push({
      d,
      t: flightTime(d, r),
      v: r.v0 * Math.exp(-r.k * d),
      drop: dropBelowBore(d, r),
      below: -lineHeight(d, r),
      hold: holdMil(d, r),
      wind: windMil(d, 1, r),
    });
  }
  return rows;
}

/* ---------- Pomůcky ---------- */

const W = 960;
const H = 540;
const EYE = 8;                         // oko střelce nad dnem údolí, m (stanoviště na hraně kóty)
const FOV_1X = 200;                    // polovina zorného pole dalekohledu při 1× (4× → ±50 mil)
const OVERVIEW = { az: 0, el: -38, half: 200 };
const SCOPE = { cx: 480, cy: 270, r: 252 };
const LIMIT = { az: [-600, 600], el: [-170, 90] };
const HAZE = [190, 199, 210];

const POSITIONS = {
  stoj: { name: 'Vstoje', sway: 2.2, breath: 1.6, pulse: 0.25, recoil: 9 },
  klek: { name: 'Vkleče', sway: 1.0, breath: 1.1, pulse: 0.2, recoil: 6 },
  leh: { name: 'Vleže', sway: 0.22, breath: 0.9, pulse: 0.12, recoil: 3.5 },
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const fmt = (v, d = 1) => v.toFixed(d).replace('.', ',').replace(/^-(0(,0+)?)$/, '$1');

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Barva [r, g, b] smíchaná s oparem podle vzdálenosti (vzdálené věci jsou světlejší a modřejší). */
function hazed(rgb, dist, extra = 0) {
  const f = clamp(1 - Math.exp(-dist / 2200) + extra, 0, 0.92);
  return `rgb(${rgb.map((c, i) => Math.round(c + (HAZE[i] - c) * f)).join(',')})`;
}

/* Výška terénu nad dnem údolí (m): mírné vlny, za 700 m údolí stoupá k lesnatému hřebeni. */
function groundH(X, D) {
  let h = 0.7 * Math.sin(D / 83 + X / 61) + 0.45 * Math.sin(D / 29 - X / 47);
  if (D > 700) h += (D - 700) * 0.055;
  return h;
}

/* Bod světa (X vpravo, D dopředu, výška nad dnem údolí) → úhly [az, el] v mil. */
function toAngles(X, D, height) {
  const dist = Math.hypot(X, D);
  return [Math.atan2(X, D) * 1000, Math.atan2(height - EYE, dist) * 1000];
}

/* Úhlová výška terénu ve směru az ve vzdálenosti D (dopředu). */
function groundEl(az, D) {
  const X = D * Math.tan(az / 1000);
  return toAngles(X, D, groundH(X, D))[1];
}

/* ---------- Krajina (jednou, pevné náhodné rozmístění) ---------- */

function buildScene(targets) {
  const rand = rng(4242);
  const objects = [];
  const nearLane = (X, D) => targets.some((t) => {
    const az = Math.atan2(X, D) * 1000;
    return D < t.D + 120 && Math.abs(az - t.az) < 26;
  });
  // stromy v údolí
  for (let i = 0; i < 170; i++) {
    const D = 140 + Math.pow(rand(), 0.8) * 1150;
    const X = (rand() * 2 - 1) * D * 0.75;
    if (nearLane(X, D)) continue;
    const conifer = rand() < 0.55;
    objects.push({ kind: 'tree', X, D, conifer, h: conifer ? 11 + rand() * 12 : 8 + rand() * 8, shade: rand() });
  }
  // remízky (skupinky stromů)
  for (const [cx, cd, n] of [[-150, 430, 9], [175, 640, 11], [-60, 820, 12], [260, 380, 7], [-310, 700, 10]]) {
    for (let i = 0; i < n; i++) {
      const D = cd + (rand() - 0.5) * 60, X = cx + (rand() - 0.5) * 70;
      if (nearLane(X, D)) continue;
      objects.push({ kind: 'tree', X, D, conifer: rand() < 0.4, h: 9 + rand() * 9, shade: rand() });
    }
  }
  // praporky větru u drah
  for (const [X, D] of [[-36, 190], [16, 360], [52, 560], [-70, 270]]) objects.push({ kind: 'flag', X, D, seed: rand() * 6 });
  // val (zákop proti střelám) za každým cílem a cíle samotné
  for (const t of targets) {
    objects.push({ kind: 'berm', X: t.X, D: t.D + 6, target: t });
    objects.push({ kind: 'target', X: t.X, D: t.D, target: t });
  }
  // trsy trávy kolem drah (v dalekohledu dávají louce strukturu)
  for (let i = 0; i < 520; i++) {
    const D = 70 + rand() * 600;
    const X = (rand() * 2 - 1) * D * 0.42;
    objects.push({ kind: 'tuft', X, D, h: 0.25 + rand() * 0.4, seed: rand() * 10 });
  }
  // chatka správce a seník
  objects.push({ kind: 'hut', X: -95, D: 520 });
  objects.push({ kind: 'hay', X: 120, D: 300 });
  objects.push({ kind: 'hay', X: 128, D: 306 });
  for (const o of objects) o.dist = Math.hypot(o.X, o.D);
  objects.sort((a, b) => b.dist - a.dist);
  // hory a hřeben lesa (úhlové obrysy)
  const ph = Array.from({ length: 8 }, () => rand() * Math.PI * 2);
  const mountains = [], hills = [], ridge = [];
  for (let az = -760; az <= 760; az += 6) {
    mountains.push([az, 50 + 9 * Math.sin(az / 95 + ph[0]) + 5 * Math.sin(az / 37 + ph[1]) + 2 * Math.sin(az / 11 + ph[2])]);
    hills.push([az, 38 + 6 * Math.sin(az / 70 + ph[3]) + 3 * Math.sin(az / 23 + ph[4])]);
    const D = 1500;
    const X = D * Math.tan(az / 1000);
    const base = toAngles(X, D, groundH(X, D))[1];
    ridge.push([az, base + 9 + 2.2 * Math.sin(az / 9 + ph[5]) + 1.4 * Math.sin(az / 3.7 + ph[6]) + 3 * Math.sin(az / 41 + ph[7])]);
  }
  // pole a cesta (obdélníky ve světě – v perspektivě se sbíhají)
  const fields = [
    { x: [-190, -70], d: [380, 560], rgb: [108, 88, 58], furrows: true },
    { x: [70, 230], d: [600, 830], rgb: [160, 150, 92] },
    { x: [-60, 50], d: [640, 790], rgb: [74, 96, 52] },
    { x: [-320, -200], d: [250, 420], rgb: [86, 104, 60] },
    { x: [160, 330], d: [200, 330], rgb: [120, 128, 70], furrows: true },
  ];
  const road = [[6, 40], [-2, 120], [-26, 260], [-8, 420], [38, 600], [30, 800], [-4, 1050], [10, 1350]];
  return { objects, mountains, hills, ridge, fields, road };
}

/* ====================================================================
 * Sniper – výhled, dalekohled, tělo střelce, střelba
 * ==================================================================== */

export class Sniper {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.opts = opts;
    this.q = clamp(Math.round((window.devicePixelRatio || 1) * 2) / 2, 1, 2);
    canvas.width = W * this.q;
    canvas.height = H * this.q;
    this.g = canvas.getContext('2d');
    this.rifle = { ...RIFLE, ...(opts.rifle || {}) };
    this.positions = {};
    for (const [id, p] of Object.entries(POSITIONS)) this.positions[id] = { ...p, ...((opts.positions || {})[id] || {}) };
    this.posId = this.positions[opts.position] ? opts.position : 'stoj';
    this.heartCfg = { start: 130, rest: 68, tau: 40, change: 6, ...(opts.heart || {}) };
    this.breathCfg = { rate: 12, steady: 5, max: 8, ...(opts.breath || {}) };
    this.zooms = opts.zooms || [4, 6, 8, 10, 12, 16];
    this.zoomIdx = 0;
    this.scoped = false;
    this.aim = { az: 0, el: -40 };
    this.targets = (opts.targets || []).map((t) => {
      const D = Number(t.d);
      const az = Number(t.az) || 0;
      const X = D * Math.tan(az / 1000);
      const ground = groundH(X, D);
      const size = Number(t.size) || 0.5;
      const board = t.board ? Number(t.board) : 0;
      const centerH = ground + 1.0;
      const [caz, cel] = toAngles(X, D, centerH);
      const dist = Math.hypot(X, D);
      return { ...t, D, X, az: caz, el: cel, dist, ground, size, board, centerH, rMil: (size / 2 / dist) * 1000, marks: [], hitT: -10 };
    });
    this.scene = buildScene(this.targets);
    this.card = opts.card ? ballisticCard(this.rifle) : null;
    this.cardMark = null;
    this.round = { target: null, wind: 0, locked: '', label: '', index: 0, of: 0 };
    this.wind = 0;
    this.stats = { shots: 0, hits: 0 };
    this.t = 0;
    this.hr = this.heartCfg.start;
    this.beat = { phase: 0, last: -10 };
    this.breath = { phase: 0.2, value: 0, held: false, holdT: 0, frozen: 0, gasp: 0 };
    this.posChange = -10;
    this.recoil = null;
    this.cycleUntil = 0;
    this.flying = [];
    this.puffs = [];
    this.traces = [];
    this.rand = rng(opts.seed || 680);
    const pr = rng(77);
    this.swayPh = Array.from({ length: 8 }, () => pr() * Math.PI * 2);
    this.test = { noSway: false, noDispersion: false };
    this.reduced = Boolean(opts.reducedMotion);
    this.drag = null;
    this.onDown = (e) => this.pointer(e, 'down');
    this.onMove = (e) => this.pointer(e, 'move');
    this.onUp = (e) => this.pointer(e, 'up');
    this.onCancel = (e) => this.pointer(e, 'cancel');
    this.onWheel = (e) => {
      if (!this.scoped) return;
      e.preventDefault();
      this.zoomBy(e.deltaY < 0 ? 1 : -1);
    };
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onCancel);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.last = performance.now();
    this.loop = (now) => {
      const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
      this.last = now;
      this.step(dt);
      this.draw();
      this.raf = requestAnimationFrame(this.loop);
    };
    this.raf = requestAnimationFrame(this.loop);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    const c = this.canvas;
    c.removeEventListener('pointerdown', this.onDown);
    c.removeEventListener('pointermove', this.onMove);
    c.removeEventListener('pointerup', this.onUp);
    c.removeEventListener('pointercancel', this.onCancel);
    c.removeEventListener('wheel', this.onWheel);
  }

  emit(name, data) {
    if (this.opts.onEvent) this.opts.onEvent(name, data || {});
  }

  /* ---------- Nastavení zvenku (ui.js) ---------- */

  setRound(r) {
    this.round = { target: null, wind: 0, locked: '', label: '', index: 0, of: 0, ...r };
    this.wind = Number(this.round.wind) || 0;
    this.cardMark = this.round.cardMark || null;
  }

  setLocked(reason) {
    this.round.locked = reason || '';
  }

  setCardMark(d) {
    this.cardMark = d;
  }

  setPosition(id) {
    if (!this.positions[id] || id === this.posId) return;
    this.posId = id;
    this.posChange = this.t;
    this.hr = Math.min(170, this.hr + this.heartCfg.change);
    this.emit('position', { id });
  }

  get zoom() {
    return this.zooms[this.zoomIdx];
  }

  zoomBy(dir) {
    if (!this.scoped) return;
    this.zoomIdx = clamp(this.zoomIdx + dir, 0, this.zooms.length - 1);
    this.emit('zoom', { zoom: this.zoom });
  }

  setScope(on, az, el) {
    this.scoped = Boolean(on);
    if (this.scoped && az !== undefined) this.aimAt(az, el);
    if (!this.scoped && this.breath.held) this.holdBreath(false);
    this.emit('scope', { on: this.scoped });
  }

  aimAt(az, el) {
    this.aim.az = clamp(az, ...LIMIT.az);
    this.aim.el = clamp(el, ...LIMIT.el);
  }

  aimBy(dAz, dEl) {
    this.aimAt(this.aim.az + dAz, this.aim.el + dEl);
  }

  /* jemný posun šipkami: asi 1,5 px obrazu za stisk */
  nudge(dx, dy) {
    if (!this.scoped) return;
    const step = 1.5 / this.scale();
    this.aimBy(dx * step, dy * step);
  }

  holdBreath(on) {
    const b = this.breath;
    if (on && !b.held) {
      b.held = true;
      b.holdT = 0;
      b.frozen = b.value;
      this.emit('breath', { held: true, value: b.value });
    } else if (!on && b.held) {
      this.releaseBreath(false);
    }
  }

  releaseBreath(forced) {
    const b = this.breath;
    b.held = false;
    const IN = 0.4, OUT = 0.36;
    if (forced) {
      b.phase = 0;
      b.gasp = 1;
      this.hr = Math.min(170, this.hr + 5);
    } else if (b.frozen > 0.02) {
      b.phase = IN + (OUT * Math.acos(clamp(2 * b.frozen - 1, -1, 1))) / Math.PI;
    } else {
      b.phase = 0;
    }
    this.emit('breath', { held: false, forced, holdT: b.holdT });
  }

  targetInfo(id) {
    const t = this.targets.find((x) => x.id === id);
    return t ? { az: t.az, el: t.el, rMil: t.rMil, dist: t.dist, D: t.D, board: t.board } : null;
  }

  scale() {
    return this.scoped ? SCOPE.r / (FOV_1X / this.zoom) : W / (2 * OVERVIEW.half);
  }

  /* ---------- Tělo střelce ---------- */

  breathValue(phase) {
    const IN = 0.4, OUT = 0.36;
    if (phase < IN) return 0.5 - 0.5 * Math.cos((Math.PI * phase) / IN);
    if (phase < IN + OUT) return 0.5 + 0.5 * Math.cos((Math.PI * (phase - IN)) / OUT);
    return 0;
  }

  breathState() {
    const b = this.breath;
    if (b.held) {
      const c = this.breathCfg;
      return { label: 'zadržený dech', held: true, holdT: b.holdT, steady: c.steady, max: c.max };
    }
    const IN = 0.4, OUT = 0.36;
    const label = b.phase < IN ? 'nádech' : b.phase < IN + OUT ? 'výdech' : 'dechová pauza';
    return { label, held: false, pause: b.phase >= IN + OUT };
  }

  breathRate() {
    return this.breathCfg.rate + Math.max(0, this.hr - this.heartCfg.rest) / 10;
  }

  step(dt) {
    this.t += dt;
    const hc = this.heartCfg;
    this.hr = hc.rest + (this.hr - hc.rest) * Math.exp(-dt / hc.tau);
    this.beat.phase += (dt * this.hr) / 60;
    if (this.beat.phase >= 1) {
      this.beat.phase -= 1;
      this.beat.last = this.t;
    }
    const b = this.breath;
    if (b.held) {
      b.holdT += dt;
      if (b.holdT >= this.breathCfg.max) this.releaseBreath(true);
    } else {
      b.phase += dt / (60 / this.breathRate());
      if (b.phase >= 1) {
        b.phase -= 1;
        b.gasp *= 0.35;
      }
      b.value = this.breathValue(b.phase);
    }
    // dopady střel v letu
    for (const s of this.flying) {
      if (!s.done && this.t - s.t0 >= s.tf) {
        s.done = true;
        this.impact(s);
      }
    }
    this.flying = this.flying.filter((s) => !s.done);
    this.puffs = this.puffs.filter((p) => this.t - p.t0 < 2.2);
    this.traces = this.traces.filter((p) => this.t - p.t0 < p.tf + 0.6);
  }

  /* Odchylka osy dalekohledu od místa, kam hráč míří (mil): houpání, dech, tep, zpětný ráz. */
  swayOffset() {
    const t = this.t;
    let az = 0, el = 0;
    if (this.recoil) {
      const tau = t - this.recoil.t0;
      if (tau < 1.5) {
        const k = this.reduced ? 0.15 : 1;
        const e = Math.exp(-tau / 0.16) * this.recoil.k * k;
        el += e;
        az += e * this.recoil.side;
      } else this.recoil = null;
    }
    if (this.test.noSway) return { az, el };
    const p = this.positions[this.posId];
    const b = this.breath;
    const c = this.breathCfg;
    let m = 1;
    let tremor = 0.04;
    if (b.held) {
      m = 0.5 + 0.35 * b.frozen;
      if (b.holdT > c.steady) {
        const f = (b.holdT - c.steady) / Math.max(0.1, c.max - c.steady);
        m += 1.7 * f;
        tremor += 0.5 * f;
      }
    }
    const hrf = 1 + Math.max(0, this.hr - this.heartCfg.rest) / 150;
    const A = p.sway * m * hrf;
    const ph = this.swayPh;
    const tau = t - this.posChange;
    const settle = tau < 3 ? 1 + 3 * Math.exp(-tau / 0.7) : 1;
    az += A * settle * (0.55 * Math.sin(2 * Math.PI * 0.31 * t + ph[0]) + 0.3 * Math.sin(2 * Math.PI * 0.73 * t + ph[1]) + 0.15 * Math.sin(2 * Math.PI * 1.9 * t + ph[2]));
    el += A * settle * (0.55 * Math.sin(2 * Math.PI * 0.27 * t + ph[3]) + 0.3 * Math.sin(2 * Math.PI * 0.61 * t + ph[4]) + 0.15 * Math.sin(2 * Math.PI * 1.6 * t + ph[5]));
    // zvednutí pušky do nové polohy (dosednutí)
    if (tau < 3 && !this.reduced) {
      const e = Math.exp(-tau / 0.5);
      el += 7 * e * Math.cos(tau * 4);
      az += 4 * e * Math.sin(tau * 3.3);
    }
    // jemný třes (při dlouhém zadržení dechu sílí)
    const tr = p.sway * tremor * hrf + tremor * 0.15;
    az += tr * Math.sin(2 * Math.PI * 8.3 * t + ph[6]);
    el += tr * Math.sin(2 * Math.PI * 9.1 * t + ph[7]);
    // dech: s nádechem se puška zvedá (zadržený = zamrzne)
    const bv = b.held ? b.frozen : b.value;
    const ba = p.breath * (1 + 0.7 * b.gasp);
    el += ba * bv;
    az += 0.18 * ba * bv;
    // tep: krátké cuknutí s každým úderem srdce
    const since = t - this.beat.last;
    if (since < 0.3) {
      const pulse = p.pulse * (this.hr / 70) * Math.sin((Math.PI * since) / 0.3);
      el += pulse;
      az += 0.3 * pulse;
    }
    return { az, el };
  }

  los() {
    const o = this.swayOffset();
    return { az: this.aim.az + o.az, el: this.aim.el + o.el };
  }

  /* ---------- Střelba ---------- */

  fire() {
    if (!this.scoped) return { blocked: 'scope' };
    if (this.round.locked) return { blocked: 'locked', reason: this.round.locked };
    if (this.t < this.cycleUntil) return { blocked: 'cycle' };
    const los = this.los();
    let azS = los.az, elS = los.el;
    if (!this.test.noDispersion) {
      // rozptyl pušky a náboje: asi 1 úhlová minuta (normální rozdělení)
      const u = Math.max(1e-6, this.rand()), v = this.rand();
      const rr = this.rifle.spread * Math.sqrt(-2 * Math.log(u));
      azS += rr * Math.cos(2 * Math.PI * v);
      elS += rr * Math.sin(2 * Math.PI * v);
    }
    const shot = this.resolve(azS, elS);
    shot.t0 = this.t;
    shot.held = this.breath.held;
    shot.holdT = this.breath.holdT;
    shot.breath = this.breathState().label;
    shot.position = this.posId;
    shot.hr = Math.round(this.hr);
    shot.zoom = this.zoom;
    shot.wind = this.wind;
    this.flying.push(shot);
    this.traces.push({ azS, elS, tf: shot.tf, D: shot.D, t0: this.t, wind: this.wind });
    this.stats.shots += 1;
    const p = this.positions[this.posId];
    this.recoil = { t0: this.t, k: p.recoil, side: (this.rand() - 0.5) * 0.5 };
    this.cycleUntil = this.t + 1.3;
    this.emit('fire', { shot });
    if (this.opts.onSound) {
      this.opts.onSound('shot', 0);
      this.opts.onSound('bolt', 0.75);
    }
    return { ok: true, shot };
  }

  /* Kam střela letí: první gong nebo val, který protne; jinak zem. Úhly v mil. */
  resolve(azS, elS) {
    const at = (D) => ({ az: azS + windMil(D, this.wind, this.rifle), el: elS - holdMil(D, this.rifle) });
    let hit = null, impact = null;
    const byDist = [...this.targets].sort((a, b) => a.dist - b.dist);
    for (const t of byDist) {
      const a = at(t.dist);
      const dAz = a.az - t.az, dEl = a.el - t.el;
      if (Math.hypot(dAz, dEl) <= t.rMil) {
        hit = t;
        impact = { ...a, D: t.dist, dx: (dAz * t.dist) / 1000, dy: (dEl * t.dist) / 1000 };
        break;
      }
      // val za cílem: 10 m široký, 3,2 m vysoký
      const bermD = t.dist + 6;
      const b = at(bermD);
      const [, bTop] = toAngles(t.X, t.D + 6, t.ground + 3.2);
      const half = (5 / bermD) * 1000;
      const baseEl = toAngles(t.X, t.D + 6, t.ground)[1];
      if (Math.abs(b.az - t.az) <= half && b.el <= bTop && b.el >= baseEl - 2) {
        impact = { ...b, D: bermD };
        break;
      }
    }
    if (!impact) {
      // zem: první vzdálenost, kde je střela pod terénem
      for (let D = 40; D <= 2600; D += 8) {
        const a = at(D);
        const g = groundEl(a.az, D);
        if (a.el <= g) {
          impact = { ...a, el: g, D };
          break;
        }
      }
    }
    const D = impact ? impact.D : 2600;
    const res = { hit: hit ? hit.id : null, D, tf: flightTime(Math.min(D, 1800), this.rifle), impact, over: !impact };
    // hlášení pozorovatele: kde střela prošla vzdáleností cíle tohoto úkolu
    const rt = this.targets.find((t) => t.id === this.round.target);
    if (rt) {
      const a = at(rt.dist);
      res.dAz = a.az - rt.az;
      res.dEl = a.el - rt.el;
      res.roundTarget = rt.id;
      res.rMil = rt.rMil;
    }
    return res;
  }

  impact(s) {
    if (s.hit) {
      const t = this.targets.find((x) => x.id === s.hit);
      t.hitT = this.t;
      t.marks.push([s.impact.dx, s.impact.dy]);
      if (t.marks.length > 12) t.marks.shift();
      this.stats.hits += 1;
      if (this.opts.onSound) this.opts.onSound('gong', t.dist / SOUND_SPEED, t.dist);
    } else if (s.impact) {
      this.puffs.push({ az: s.impact.az, el: s.impact.el, dist: s.impact.D, t0: this.t, seed: this.rand() * 10 });
    }
    if (this.opts.onShot) this.opts.onShot(s, { ...this.stats });
  }

  /* ---------- Ovládání prstem a myší ---------- */

  pointer(e, kind) {
    const r = this.canvas.getBoundingClientRect();
    const mx = ((e.clientX - r.left) / r.width) * W;
    const my = ((e.clientY - r.top) / r.height) * H;
    if (kind === 'down') {
      this.drag = { id: e.pointerId, x: mx, y: my, sx: mx, sy: my, moved: false };
      try { this.canvas.setPointerCapture(e.pointerId); } catch (err) { /* nic */ }
      e.preventDefault();
      return;
    }
    if (!this.drag || e.pointerId !== this.drag.id) return;
    if (kind === 'move') {
      const dx = mx - this.drag.x, dy = my - this.drag.y;
      if (Math.hypot(mx - this.drag.sx, my - this.drag.sy) > 6) this.drag.moved = true;
      if (this.scoped && this.drag.moved) {
        // krajina jede s prstem (jako mapa): tah doprava = míření doleva
        const s = this.scale();
        this.aimBy(-dx / s, dy / s);
      }
      this.drag.x = mx;
      this.drag.y = my;
      return;
    }
    const tap = kind === 'up' && !this.drag.moved;
    this.drag = null;
    if (tap && !this.scoped) {
      // klepnutí do výhledu = dalekohled k oku na to místo (u cíle přímo na cíl)
      const s = W / (2 * OVERVIEW.half);
      let az = OVERVIEW.az + (mx - W / 2) / s;
      let el = OVERVIEW.el - (my - H / 2) / s;
      let best = null, bd = 16;
      for (const t of this.targets) {
        const top = t.el + ((t.board ? 3 : 1.3) / t.dist) * 1000;
        const d = Math.hypot(az - t.az, el - (t.el + top) / 2);
        if (d < bd) { bd = d; best = t; }
      }
      if (best) { az = best.az; el = best.el; }
      this.setScope(true, az, el);
    }
  }

  /* ====================================================================
   * Kreslení
   * ==================================================================== */

  draw() {
    const g = this.g;
    g.setTransform(this.q, 0, 0, this.q, 0, 0);
    if (this.scoped) this.drawScope(g);
    else this.drawOverview(g);
  }

  /* Pohled pro kreslení: střed (az, el), měřítko s px/mil, střed obrazu (cx, cy), meze. */
  view(az, el, s, cx, cy, halfW, halfH) {
    return { az, el, s, cx, cy, az0: az - halfW / s, az1: az + halfW / s, el0: el - halfH / s, el1: el + halfH / s };
  }

  drawOverview(g) {
    const s = W / (2 * OVERVIEW.half);
    const v = this.view(OVERVIEW.az, OVERVIEW.el, s, W / 2, H / 2, W / 2, H / 2);
    this.drawWorld(g, v, true);
    this.drawLabels(g, v);
    // pruh nahoře
    g.fillStyle = 'rgba(8,10,14,0.62)';
    g.fillRect(0, 0, W, 34);
    g.font = '600 15px system-ui, sans-serif';
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillStyle = '#f2e6c8';
    const r = this.round;
    g.fillText(r.of ? `Úkol ${r.index}/${r.of}: ${r.label || ''}` : (r.label || 'Výhled do údolí'), 14, 17);
    g.textAlign = 'right';
    g.fillStyle = '#ffd36b';
    g.fillText('Klepni na cíl – dalekohled k oku', W - 14, 17);
    g.textBaseline = 'alphabetic';
  }

  drawLabels(g, v) {
    const P = (az, el) => [v.cx + (az - v.az) * v.s, v.cy - (el - v.el) * v.s];
    g.font = '600 13px system-ui, sans-serif';
    g.textAlign = 'center';
    for (const t of this.targets) {
      const topH = t.board ? t.ground + 3.2 : t.ground + 2.1;
      const [, elTop] = toAngles(t.X, t.D, topH);
      const [x, y] = P(t.az, elTop);
      const current = t.id === this.round.target;
      const label = t.label || `${Math.round(t.D)} m`;
      const w = g.measureText(label).width + 14;
      g.fillStyle = current ? 'rgba(255,211,107,0.92)' : 'rgba(10,12,16,0.7)';
      g.fillRect(x - w / 2, y - 30, w, 20);
      g.fillStyle = current ? '#1b1405' : '#e9e2cc';
      g.fillText(label, x, y - 15);
      g.strokeStyle = current ? 'rgba(255,211,107,0.92)' : 'rgba(233,226,204,0.5)';
      g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(x, y - 10); g.lineTo(x, y - 3); g.stroke();
      if (current) {
        const [cx, cy] = P(t.az, t.el);
        const pulse = 9 + 2 * Math.sin(this.t * 5);
        g.beginPath(); g.arc(cx, cy, pulse, 0, Math.PI * 2); g.stroke();
      }
    }
  }

  drawScope(g) {
    g.fillStyle = '#050607';
    g.fillRect(0, 0, W, H);
    const s = this.scale();
    const los = this.los();
    const { cx, cy, r } = SCOPE;
    const v = this.view(los.az, los.el, s, cx, cy, r, r);
    g.save();
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.clip();
    this.drawWorld(g, v, false);
    this.drawReticle(g, s);
    // okraj skla: tmavne k obvodu
    const vg = g.createRadialGradient(cx, cy, r * 0.72, cx, cy, r);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(0.75, 'rgba(0,0,0,0.25)');
    vg.addColorStop(1, 'rgba(0,0,0,0.92)');
    g.fillStyle = vg;
    g.fillRect(cx - r, cy - r, 2 * r, 2 * r);
    g.restore();
    // tubus dalekohledu
    g.lineWidth = 6;
    g.strokeStyle = '#15181c';
    g.beginPath(); g.arc(cx, cy, r + 3, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 1.5;
    g.strokeStyle = 'rgba(160,170,180,0.35)';
    g.beginPath(); g.arc(cx, cy, r + 6.5, 0, Math.PI * 2); g.stroke();
    this.drawArrow(g, v);
    this.drawHudLeft(g);
    this.drawHudRight(g);
    // záblesk výstřelu
    if (this.recoil && this.t - this.recoil.t0 < 0.08 && !this.reduced) {
      g.fillStyle = 'rgba(255,240,210,0.18)';
      g.fillRect(0, 0, W, H);
    }
  }

  /* Šipka k cíli úkolu, když je mimo zorné pole. */
  drawArrow(g, v) {
    const t = this.targets.find((x) => x.id === this.round.target);
    if (!t) return;
    const dx = (t.az - v.az) * v.s, dy = -(t.el - v.el) * v.s;
    const d = Math.hypot(dx, dy);
    if (d < SCOPE.r * 0.9) return;
    const a = Math.atan2(dy, dx);
    const x = SCOPE.cx + Math.cos(a) * (SCOPE.r - 26), y = SCOPE.cy + Math.sin(a) * (SCOPE.r - 26);
    g.save();
    g.translate(x, y);
    g.rotate(a);
    g.fillStyle = 'rgba(255,211,107,0.9)';
    g.beginPath(); g.moveTo(14, 0); g.lineTo(-8, -10); g.lineTo(-3, 0); g.lineTo(-8, 10); g.closePath(); g.fill();
    g.restore();
  }

  /* Kříž s dělením v mil (první ohnisková rovina: dělení se zvětšením roste). */
  drawReticle(g, s) {
    const { cx, cy, r } = SCOPE;
    const seg = (x1, y1, x2, y2, w) => {
      g.lineWidth = w + 1.6;
      g.strokeStyle = 'rgba(235,240,245,0.28)';
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      g.lineWidth = w;
      g.strokeStyle = 'rgba(8,8,8,0.92)';
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    };
    const post = 10 * s;
    seg(cx - r, cy, cx - post, cy, 3.2);
    seg(cx + post, cy, cx + r, cy, 3.2);
    seg(cx, cy + post, cx, cy + r, 3.2);
    seg(cx, cy - r, cx, cy - Math.min(post, 6 * s), 3.2);
    seg(cx - post, cy, cx + post, cy, 1.1);
    seg(cx, cy - Math.min(post, 6 * s), cx, cy + post, 1.1);
    const half = s >= 8;
    g.font = `${s >= 11 ? 11 : 10}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let m = 0.5; m <= 10.001; m += 0.5) {
      const major = Math.abs(m - Math.round(m)) < 1e-6;
      if (!major && !half) continue;
      const L = major ? 6.5 : 3.5;
      const d = m * s;
      if (d > r) break;
      seg(cx - d, cy - L, cx - d, cy + L, 1);
      seg(cx + d, cy - L, cx + d, cy + L, 1);
      seg(cx - L, cy + d, cx + L, cy + d, 1);
      if (m <= 6) seg(cx - L, cy - d, cx + L, cy - d, 1);
      const every = s >= 9 ? 2 : 5;
      if (major && Math.round(m) % every === 0) {
        g.fillStyle = 'rgba(10,10,10,0.95)';
        g.fillText(String(Math.round(m)), cx + d, cy + L + 8);
        g.fillText(String(Math.round(m)), cx - d, cy + L + 8);
        g.fillText(String(Math.round(m)), cx + L + 9, cy + d);
      }
    }
    g.textBaseline = 'alphabetic';
    g.fillStyle = 'rgba(8,8,8,0.95)';
    g.beginPath(); g.arc(cx, cy, Math.max(1.4, 0.12 * s), 0, Math.PI * 2); g.fill();
  }

  drawHudLeft(g) {
    const x = 16;
    let y = 30;
    const r = this.round;
    g.textAlign = 'left';
    g.fillStyle = '#ffd36b';
    g.font = '700 13px system-ui, sans-serif';
    if (r.of) g.fillText(`ÚKOL ${r.index}/${r.of}`, x, y);
    y += 20;
    g.fillStyle = '#f2e6c8';
    g.font = '600 15px system-ui, sans-serif';
    this.wrap(g, r.label || '', x, y, 196, 18).forEach((line, i) => g.fillText(line, x, y + i * 18));
    if (!this.card) return;
    // balistická karta
    let cy = 150;
    g.fillStyle = 'rgba(232,224,200,0.92)';
    g.fillRect(x - 6, cy - 22, 204, 24 + this.card.length * 17 + 40);
    g.fillStyle = '#1d1a12';
    g.font = '700 12px system-ui, sans-serif';
    g.fillText('BALISTICKÁ KARTA', x, cy - 6);
    g.font = '600 11px system-ui, sans-serif';
    g.fillStyle = '#4a4434';
    cy += 12;
    g.fillText('vzdál.', x, cy);
    g.fillText('mířit výš', x + 58, cy);
    g.fillText('vítr 1 m/s', x + 128, cy);
    g.font = '13px ui-monospace, monospace';
    for (const row of this.card) {
      cy += 17;
      const mark = this.cardMark !== null && Math.abs(row.d - this.cardMark) < 25;
      if (mark) {
        g.fillStyle = 'rgba(255,190,60,0.55)';
        g.fillRect(x - 4, cy - 12, 200, 16);
      }
      g.fillStyle = '#1d1a12';
      g.fillText(`${row.d} m`, x, cy);
      g.fillText(`${fmt(row.hold, 1)} mil`, x + 58, cy);
      g.fillText(`${fmt(row.wind, 2)} mil`, x + 128, cy);
    }
    g.font = '11px system-ui, sans-serif';
    g.fillStyle = '#4a4434';
    g.fillText(`nastřeleno na ${this.rifle.zero} m · ${this.rifle.v0} m/s`, x, cy + 20);
  }

  drawHudRight(g) {
    const x = 760;
    let y = 30;
    g.textAlign = 'left';
    // tep
    const since = this.t - this.beat.last;
    const beatScale = since < 0.18 ? 1.25 - since : 1;
    g.save();
    g.translate(x + 10, y - 5);
    g.scale(beatScale, beatScale);
    g.fillStyle = this.hr > 100 ? '#ff5a5a' : '#ff8f8f';
    g.beginPath();
    g.moveTo(0, 6);
    g.bezierCurveTo(-12, -2, -6, -12, 0, -5);
    g.bezierCurveTo(6, -12, 12, -2, 0, 6);
    g.fill();
    g.restore();
    g.fillStyle = '#f2e6c8';
    g.font = '700 18px ui-monospace, monospace';
    g.fillText(`${Math.round(this.hr)}`, x + 26, y + 1);
    g.font = '12px system-ui, sans-serif';
    g.fillText('tepů/min', x + 66, y);
    // dech
    y += 30;
    const st = this.breathState();
    g.font = '600 13px system-ui, sans-serif';
    g.fillStyle = st.held ? (st.holdT > st.steady ? '#ff9a5a' : '#8fe08f') : st.pause ? '#8fe08f' : '#f2e6c8';
    g.fillText(st.held ? `Dech zadržen ${fmt(st.holdT, 1)} s` : `Dech: ${st.label}`, x, y);
    y += 10;
    // průběh dechu: křivka cyklu, pauza zeleně, tečka = teď
    const gw = 176, gh = 34;
    g.fillStyle = 'rgba(255,255,255,0.07)';
    g.fillRect(x, y, gw, gh);
    const IN = 0.4, OUT = 0.36;
    g.fillStyle = 'rgba(120,220,120,0.22)';
    g.fillRect(x + gw * (IN + OUT), y, gw * (1 - IN - OUT), gh);
    g.strokeStyle = 'rgba(242,230,200,0.7)';
    g.lineWidth = 1.5;
    g.beginPath();
    for (let i = 0; i <= 60; i++) {
      const ph = i / 60;
      const yy = y + gh - 4 - this.breathValue(ph) * (gh - 8);
      if (i) g.lineTo(x + ph * gw, yy); else g.moveTo(x + ph * gw, yy);
    }
    g.stroke();
    const b = this.breath;
    const ph = b.held ? (b.frozen > 0.02 ? IN + (OUT * Math.acos(clamp(2 * b.frozen - 1, -1, 1))) / Math.PI : (IN + OUT + 1) / 2) : b.phase;
    const bv = b.held ? b.frozen : b.value;
    g.fillStyle = b.held ? '#8fe08f' : '#ffd36b';
    g.beginPath(); g.arc(x + ph * gw, y + gh - 4 - bv * (gh - 8), 4.5, 0, Math.PI * 2); g.fill();
    if (b.held) {
      // pruh zadržení: zelená do klidné doby, pak oranžová až červená
      const c = this.breathCfg;
      const f = clamp(b.holdT / c.max, 0, 1);
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.fillRect(x, y + gh + 4, gw, 6);
      g.fillStyle = b.holdT < c.steady ? '#6fd36f' : b.holdT < c.max - 1 ? '#ffb44a' : '#ff5a5a';
      g.fillRect(x, y + gh + 4, gw * f, 6);
    }
    y += gh + 34;
    g.font = '600 14px system-ui, sans-serif';
    g.fillStyle = '#f2e6c8';
    g.fillText(`Poloha: ${this.positions[this.posId].name.toLowerCase()}`, x, y);
    y += 22;
    g.fillText(`Zvětšení: ${this.zoom}×`, x, y);
    y += 22;
    g.fillText(`Výstřely: ${this.stats.shots} · zásahy: ${this.stats.hits}`, x, y);
    if (this.t < this.cycleUntil) {
      y += 22;
      g.fillStyle = '#ffb44a';
      g.fillText('přebíjím…', x, y);
    } else if (this.round.locked) {
      y += 22;
      g.fillStyle = '#ffb44a';
      this.wrap(g, this.round.locked, x, y, 186, 17).forEach((line, i) => g.fillText(line, x, y + i * 17));
    }
  }

  wrap(g, text, x, y, maxW) {
    const words = String(text).split(/\s+/);
    const lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (g.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }

  /* ---------- Svět: obloha, hory, údolí, stromy, cíle ---------- */

  drawWorld(g, v, overview) {
    const P = (az, el) => [v.cx + (az - v.az) * v.s, v.cy - (el - v.el) * v.s];
    const left = v.cx - (v.az - v.az0) * v.s, right = v.cx + (v.az1 - v.az) * v.s;
    const top = v.cy - (v.el1 - v.el) * v.s, bottom = v.cy + (v.el - v.el0) * v.s;
    // obloha za svítání
    const [, ySkyTop] = P(0, 120);
    const [, yHor] = P(0, 30);
    const sky = g.createLinearGradient(0, ySkyTop, 0, yHor);
    sky.addColorStop(0, '#2b3d68');
    sky.addColorStop(0.55, '#7d8fb4');
    sky.addColorStop(0.85, '#e6b98e');
    sky.addColorStop(1, '#f3cf9e');
    g.fillStyle = sky;
    g.fillRect(left, top, right - left, bottom - top);
    // slunce těsně pod obzorem vlevo: teplá záře
    const [sx, sy] = P(-430, 52);
    const glow = g.createRadialGradient(sx, sy, 0, sx, sy, 150 * v.s);
    glow.addColorStop(0, 'rgba(255,214,150,0.75)');
    glow.addColorStop(1, 'rgba(255,214,150,0)');
    g.fillStyle = glow;
    g.fillRect(left, top, right - left, bottom - top);
    // hory a kopce (obrysy v úhlech)
    const outline = (pts, fill) => {
      g.fillStyle = fill;
      g.beginPath();
      let lastX = null;
      for (const [az, el] of pts) {
        if (az < v.az0 - 12 || az > v.az1 + 12) continue;
        const [x, y] = P(az, el);
        if (lastX === null) { g.moveTo(x, bottom + 4); g.lineTo(x, y); } else g.lineTo(x, y);
        lastX = x;
      }
      if (lastX === null) return;
      g.lineTo(lastX, bottom + 4);
      g.closePath();
      g.fill();
    };
    outline(this.scene.mountains, '#9aa6c0');
    outline(this.scene.hills, '#7f8ea6');
    outline(this.scene.ridge, '#4a5d58');
    // údolí: pásy terénu od hřebene k nám
    const rows = [1500, 1250, 1050, 900, 780, 680, 590, 510, 440, 380, 325, 278, 238, 204, 175, 150, 128, 110, 95, 82, 70, 60];
    const palette = [[82, 104, 62], [92, 112, 66], [86, 108, 60], [98, 116, 70], [80, 101, 58]];
    const azA = v.az0 - 20, azB = v.az1 + 20;
    const n = 16;
    const rowPts = (D) => {
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const az = azA + ((azB - azA) * i) / n;
        pts.push(P(az, groundEl(az, D)));
      }
      return pts;
    };
    let prev = rowPts(rows[0]);
    for (let k = 1; k < rows.length; k++) {
      const cur = rowPts(rows[k]);
      const D = rows[k];
      g.fillStyle = hazed(palette[k % palette.length], D);
      g.beginPath();
      prev.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      for (let i = cur.length - 1; i >= 0; i--) g.lineTo(cur[i][0], cur[i][1]);
      g.closePath();
      g.fill();
      prev = cur;
    }
    g.fillStyle = hazed([74, 92, 52], 60);
    g.beginPath();
    prev.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.lineTo(prev[prev.length - 1][0], bottom + 4);
    g.lineTo(prev[0][0], bottom + 4);
    g.closePath();
    g.fill();
    // pole
    const quad = (X1, X2, D1, D2, steps = 6) => {
      const pts = [];
      for (let i = 0; i <= steps; i++) { const X = X1 + ((X2 - X1) * i) / steps; pts.push([X, D1]); }
      for (let i = steps; i >= 0; i--) { const X = X1 + ((X2 - X1) * i) / steps; pts.push([X, D2]); }
      return pts.map(([X, D]) => P(...toAngles(X, D, groundH(X, D))));
    };
    for (const f of this.scene.fields) {
      const [aL] = toAngles(f.x[0], f.d[1], 0), [aR] = toAngles(f.x[1], f.d[0], 0);
      if (Math.max(aL, aR) < v.az0 - 30 || Math.min(aL, aR) > v.az1 + 30) continue;
      const D = (f.d[0] + f.d[1]) / 2;
      g.fillStyle = hazed(f.rgb, D);
      g.beginPath();
      quad(f.x[0], f.x[1], f.d[0], f.d[1]).forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath();
      g.fill();
      if (f.furrows) {
        g.strokeStyle = hazed(f.rgb.map((c) => c * 0.8), D);
        g.lineWidth = Math.max(0.5, (0.6 / D) * 1000 * v.s * 0.4);
        g.beginPath();
        for (let X = f.x[0] + 4; X < f.x[1]; X += 8) {
          const [x1, y1] = P(...toAngles(X, f.d[0], groundH(X, f.d[0])));
          const [x2, y2] = P(...toAngles(X, f.d[1], groundH(X, f.d[1])));
          g.moveTo(x1, y1); g.lineTo(x2, y2);
        }
        g.stroke();
      }
    }
    // polní cesta
    const road = this.scene.road;
    const edge = (side) => road.map(([X, D]) => P(...toAngles(X + side * 2, D, groundH(X, D) + 0.05)));
    const L = edge(-1), R = edge(1);
    g.fillStyle = hazed([150, 132, 100], 400);
    g.beginPath();
    L.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    for (let i = R.length - 1; i >= 0; i--) g.lineTo(R[i][0], R[i][1]);
    g.closePath();
    g.fill();
    // ranní opar nad loukami v dálce
    for (const [D, a] of [[1150, 0.32], [950, 0.22], [800, 0.14]]) {
      const pts = rowPts(D);
      const hpx = Math.max(2, (9 / D) * 1000 * v.s);
      const grad = g.createLinearGradient(0, pts[0][1] - hpx, 0, pts[0][1] + hpx * 0.4);
      grad.addColorStop(0, 'rgba(235,236,240,0)');
      grad.addColorStop(0.7, `rgba(235,236,240,${a})`);
      grad.addColorStop(1, 'rgba(235,236,240,0)');
      g.fillStyle = grad;
      g.fillRect(left, pts[0][1] - hpx, right - left, hpx * 1.4);
    }
    // předměty od nejvzdálenějších; prach po dopadu se kreslí ve správné hloubce (za bližšími věcmi)
    const puffs = [...this.puffs].sort((p1, p2) => p2.dist - p1.dist);
    let pi = 0;
    for (const o of this.scene.objects) {
      while (pi < puffs.length && puffs[pi].dist >= o.dist) this.drawPuff(g, v, P, puffs[pi++]);
      const [az, el] = toAngles(o.X, o.D, groundH(o.X, o.D));
      if (o.kind === 'tuft' && (1000 / o.dist) * v.s * o.h < 2.5) continue;
      const spanMil = ((o.kind === 'tree' ? o.h : o.kind === 'berm' ? 12 : 8) / o.dist) * 1000;
      if (az + spanMil < v.az0 || az - spanMil > v.az1 || el - spanMil > v.el1 || el + 2 * spanMil < v.el0) continue;
      const [x, y] = P(az, el);
      const m = (1000 / o.dist) * v.s;   // px na metr v té vzdálenosti
      if (o.kind === 'tree') this.drawTree(g, o, x, y, m);
      else if (o.kind === 'flag') this.drawFlag(g, o, x, y, m);
      else if (o.kind === 'berm') this.drawBerm(g, o, x, y, m);
      else if (o.kind === 'target') this.drawTarget(g, o.target, x, y, m, v);
      else if (o.kind === 'hut') this.drawHut(g, o, x, y, m);
      else if (o.kind === 'hay') this.drawHay(g, o, x, y, m);
      else if (o.kind === 'tuft') this.drawTuft(g, o, x, y, m);
    }
    while (pi < puffs.length) this.drawPuff(g, v, P, puffs[pi++]);
    // stopy střel
    this.drawTraces(g, v, P);
    // okraj kóty před námi (tráva, v přehledu i pytle s pískem)
    this.drawBrow(g, v, P, bottom, overview);
  }

  drawTree(g, o, x, y, m) {
    const h = o.h * m;
    if (h < 1.2) return;
    const dark = hazed(o.conifer ? [34 + o.shade * 14, 58 + o.shade * 16, 40] : [52 + o.shade * 20, 76 + o.shade * 18, 40], o.dist);
    const trunk = hazed([58, 46, 34], o.dist);
    g.fillStyle = trunk;
    g.fillRect(x - Math.max(0.5, 0.25 * m), y - h * 0.25, Math.max(1, 0.5 * m), h * 0.25);
    g.fillStyle = dark;
    if (o.conifer) {
      const w = h * 0.36;
      for (let i = 0; i < 3; i++) {
        const yb = y - h * (0.12 + i * 0.26), yt = y - h * (0.5 + i * 0.25);
        const ww = w * (1 - i * 0.25);
        g.beginPath(); g.moveTo(x - ww / 2, yb); g.lineTo(x, yt); g.lineTo(x + ww / 2, yb); g.closePath(); g.fill();
      }
    } else {
      const r = h * 0.3;
      g.beginPath();
      g.arc(x, y - h * 0.62, r, 0, Math.PI * 2);
      g.arc(x - r * 0.6, y - h * 0.5, r * 0.75, 0, Math.PI * 2);
      g.arc(x + r * 0.6, y - h * 0.52, r * 0.8, 0, Math.PI * 2);
      g.fill();
    }
  }

  drawFlag(g, o, x, y, m) {
    const h = 4.5 * m;
    g.strokeStyle = hazed([40, 40, 40], o.dist);
    g.lineWidth = Math.max(0.8, 0.08 * m);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - h); g.stroke();
    // úhel praporku od svislice podle rychlosti větru (při 6 m/s vodorovně)
    const w = this.wind;
    const flutter = this.reduced ? 0 : Math.sin(this.t * 7 + o.seed) * (Math.abs(w) > 0.3 ? 0.08 : 0.04);
    const ang = (Math.PI / 2) * clamp(Math.abs(w) / 6, 0.06, 1) + flutter;
    const dir = w >= 0 ? 1 : -1;
    const len = 1.3 * m, wid = 0.7 * m;
    // u = směr praporku od žerdi (v klidu dolů, ve větru vodorovně), n = jeho šířka
    const ux = dir * Math.sin(ang), uy = Math.cos(ang);
    const nx = -dir * Math.cos(ang), ny = Math.sin(ang);
    const ax = x, ay = y - h;
    g.fillStyle = hazed([214, 48, 40], o.dist);
    g.beginPath();
    g.moveTo(ax, ay);
    g.lineTo(ax + ux * len, ay + uy * len);
    g.lineTo(ax + ux * len + nx * wid * 0.35, ay + uy * len + ny * wid * 0.35);
    g.lineTo(ax + nx * wid, ay + ny * wid);
    g.closePath();
    g.fill();
  }

  drawBerm(g, o, x, y, m) {
    const w = 10 * m, h = 3.2 * m;
    g.fillStyle = hazed([104, 86, 62], o.dist);
    g.beginPath();
    g.moveTo(x - w / 2 - 0.8 * m, y);
    g.lineTo(x - w / 2 + 0.6 * m, y - h);
    g.lineTo(x + w / 2 - 0.6 * m, y - h);
    g.lineTo(x + w / 2 + 0.8 * m, y);
    g.closePath();
    g.fill();
    g.fillStyle = hazed([82, 104, 58], o.dist);
    g.fillRect(x - w / 2 + 0.6 * m, y - h - 0.25 * m, w - 1.2 * m, 0.35 * m);
  }

  drawTarget(g, t, x, y, m) {
    const dark = hazed([38, 36, 32], t.dist);
    const postW = Math.max(0.8, 0.09 * m);
    // rám: dva sloupky a příčka
    g.fillStyle = dark;
    g.fillRect(x - 0.7 * m - postW / 2, y - 1.95 * m, postW, 1.95 * m);
    g.fillRect(x + 0.7 * m - postW / 2, y - 1.95 * m, postW, 1.95 * m);
    g.fillRect(x - 0.8 * m, y - 1.97 * m, 1.6 * m, Math.max(0.8, 0.08 * m));
    // gong: zhoupne se po zásahu
    const r = (t.size / 2) * m;
    const since = this.t - t.hitT;
    const swing = since < 4 && !this.reduced ? 0.55 * Math.exp(-since / 1.1) * Math.sin(since * 7) : 0;
    const cx = x, cy = y - 1.0 * m;
    g.strokeStyle = dark;
    g.lineWidth = Math.max(0.5, 0.025 * m);
    g.beginPath();
    g.moveTo(cx - r * 0.6, y - 1.95 * m); g.lineTo(cx - r * 0.6, cy - r * Math.cos(swing));
    g.moveTo(cx + r * 0.6, y - 1.95 * m); g.lineTo(cx + r * 0.6, cy - r * Math.cos(swing));
    g.stroke();
    g.fillStyle = hazed([238, 236, 228], t.dist, -0.1);
    g.beginPath();
    g.ellipse(cx, cy, Math.max(0.8, r), Math.max(0.8, r * Math.cos(swing)), 0, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = Math.max(0.6, 0.03 * m);
    g.strokeStyle = hazed([70, 66, 58], t.dist);
    g.stroke();
    // šedé stopy po zásazích (olovo na oceli)
    g.fillStyle = 'rgba(90,90,96,0.85)';
    for (const [dx, dy] of t.marks) {
      g.beginPath();
      g.arc(cx + dx * m, cy - dy * m * Math.cos(swing), Math.max(0.8, 0.035 * m), 0, Math.PI * 2);
      g.fill();
    }
    if (since < 0.35) {
      g.strokeStyle = `rgba(255,250,220,${0.9 * (1 - since / 0.35)})`;
      g.lineWidth = Math.max(1.5, 0.05 * m);
      g.beginPath(); g.arc(cx, cy, r * (1 + since * 3), 0, Math.PI * 2); g.stroke();
    }
    // tabule neznámé velikosti nad gongem, nebo cedulka se vzdáleností
    if (t.board) {
      const bw = t.board * m, bh = t.board * 0.55 * m;
      const by = y - 2.6 * m;
      g.fillStyle = dark;
      g.fillRect(x - bw * 0.38 - postW / 2, by, postW, 0.7 * m);
      g.fillRect(x + bw * 0.38 - postW / 2, by, postW, 0.7 * m);
      g.fillStyle = hazed([244, 242, 236], t.dist, -0.1);
      g.fillRect(x - bw / 2, by - bh / 2, bw, bh);
      g.strokeStyle = dark;
      g.lineWidth = Math.max(0.6, 0.04 * m);
      g.strokeRect(x - bw / 2, by - bh / 2, bw, bh);
      if (bh > 8) {
        g.fillStyle = '#1b1b1b';
        g.font = `700 ${Math.round(bh * 0.7)}px system-ui, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('?', x, by + bh * 0.04);
        g.textBaseline = 'alphabetic';
      }
    } else if (t.sign !== false) {
      const sw = 0.9 * m, sh = 0.45 * m;
      const sx = x - 1.6 * m, sy = y - 0.95 * m;
      g.fillStyle = dark;
      g.fillRect(sx - postW / 2, sy, postW, 0.95 * m);
      g.fillStyle = hazed([236, 210, 96], t.dist, -0.1);
      g.fillRect(sx - sw / 2, sy - sh / 2, sw, sh);
      if (sh > 7) {
        g.fillStyle = '#1b1b1b';
        g.font = `700 ${Math.round(sh * 0.72)}px system-ui, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(String(Math.round(t.D)), sx, sy + sh * 0.04);
        g.textBaseline = 'alphabetic';
      }
    }
  }

  drawHut(g, o, x, y, m) {
    const w = 6 * m, h = 3 * m;
    g.fillStyle = hazed([96, 70, 48], o.dist);
    g.fillRect(x - w / 2, y - h, w, h);
    g.fillStyle = hazed([70, 52, 44], o.dist);
    g.beginPath(); g.moveTo(x - w / 2 - 0.4 * m, y - h); g.lineTo(x, y - h - 2 * m); g.lineTo(x + w / 2 + 0.4 * m, y - h); g.closePath(); g.fill();
    g.fillStyle = hazed([40, 34, 28], o.dist);
    g.fillRect(x - 0.5 * m, y - 1.9 * m, m, 1.9 * m);
  }

  drawTuft(g, o, x, y, m) {
    const h = o.h * m;
    g.strokeStyle = hazed([66 + (o.seed % 1) * 30, 86 + (o.seed % 1) * 24, 46], o.dist);
    g.lineWidth = Math.max(0.6, 0.03 * m);
    g.beginPath();
    for (let i = -2; i <= 2; i++) {
      g.moveTo(x + i * 0.05 * m, y);
      g.lineTo(x + i * 0.12 * m + Math.sin(o.seed + i) * 0.05 * m, y - h * (0.7 + 0.3 * Math.cos(o.seed * 3 + i)));
    }
    g.stroke();
  }

  drawHay(g, o, x, y, m) {
    g.fillStyle = hazed([188, 162, 96], o.dist);
    g.beginPath(); g.ellipse(x, y - 0.6 * m, 0.8 * m, 0.6 * m, 0, 0, Math.PI * 2); g.fill();
  }

  drawTraces(g, v, P) {
    const r = this.rifle;
    for (const tr of this.traces) {
      const tau = this.t - tr.t0;
      const head = Math.min(tau, tr.tf);
      const xAt = (tt) => Math.log(1 + r.k * r.v0 * Math.max(0, tt)) / r.k;
      const pt = (x) => [tr.azS + windMil(x, tr.wind, r), tr.elS + (lineHeight(x, r) / x) * 1000];
      const fade = tau > tr.tf ? Math.max(0, 1 - (tau - tr.tf) / 0.6) : 1;
      const x1 = Math.max(25, xAt(head - 0.12)), x2 = Math.max(26, xAt(head));
      if (x2 <= 26) continue;
      g.strokeStyle = `rgba(230,236,240,${0.55 * fade})`;
      g.lineWidth = 2;
      g.beginPath();
      for (let i = 0; i <= 12; i++) {
        const x = x1 + ((x2 - x1) * i) / 12;
        const [px, py] = P(...pt(x));
        if (i) g.lineTo(px, py); else g.moveTo(px, py);
      }
      g.stroke();
    }
  }

  drawPuff(g, v, P, p) {
    {
      const tau = this.t - p.t0;
      const [x, y] = P(p.az, p.el);
      const m = (1000 / p.dist) * v.s;
      const a = Math.max(0, 1 - tau / 2.2);
      const r = (0.12 + 0.5 * Math.sqrt(tau)) * m;
      g.fillStyle = `rgba(150,128,96,${0.75 * a})`;
      for (let i = 0; i < 4; i++) {
        const ox = Math.sin(p.seed + i * 2.1) * r * 0.5, oy = -Math.abs(Math.cos(p.seed + i * 1.7)) * r * 0.6;
        g.beginPath(); g.arc(x + ox, y + oy - r * 0.3, Math.max(1, r * (0.55 + 0.1 * i)), 0, Math.PI * 2); g.fill();
      }
    }
  }

  drawBrow(g, v, P, bottom, overview) {
    const pts = [];
    const azA = v.az0 - 10, azB = v.az1 + 10;
    const step = Math.max(1, (azB - azA) / 60);
    for (let az = azA; az <= azB + 1e-6; az += step) pts.push(P(az, -112 + 5 * Math.sin(az / 37) + 2.5 * Math.sin(az / 11)));
    const [, yTop] = P(0, -104);
    if (yTop > bottom + 4) return;
    const grad = g.createLinearGradient(0, yTop, 0, bottom);
    grad.addColorStop(0, '#3e4a2a');
    grad.addColorStop(1, '#232a18');
    g.fillStyle = grad;
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.lineTo(pts[pts.length - 1][0], bottom + 4);
    g.lineTo(pts[0][0], bottom + 4);
    g.closePath();
    g.fill();
    // stébla trávy na hraně
    g.strokeStyle = 'rgba(96,112,62,0.9)';
    g.lineWidth = 1.2;
    g.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const [x, y] = pts[i];
      const hgt = 5 + 4 * Math.abs(Math.sin(i * 1.7));
      g.moveTo(x, y + 2); g.lineTo(x + Math.sin(i) * 3, y - hgt);
    }
    g.stroke();
    if (!overview) return;
    // pytle s pískem palebného postavení
    for (let i = -3; i <= 3; i++) {
      const [x, y] = P(i * 26, -142 - Math.abs(i) * 1.2);
      g.fillStyle = i % 2 ? '#8a7a56' : '#7d6f4e';
      g.beginPath(); g.ellipse(x, y, 34, 13, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(40,34,22,0.6)';
      g.lineWidth = 1;
      g.stroke();
    }
  }
}

/* Výhled do údolí bez popisků a bez dalekohledu na libovolně velké plátno (16 : 9) – podle něj
   vznikl obrázek pohledu „Výhled do údolí“ v místnosti, aby krajina seděla s dalekohledem.
   opts.view = { az, el, half } (střed a polovina šířky v mil), opts.brow = kreslit okraj kóty. */
export function drawPanorama(canvas, opts = {}) {
  const sn = new Sniper(document.createElement('canvas'), opts);
  sn.destroy();
  const g = canvas.getContext('2d');
  const k = canvas.width / W;
  g.setTransform(k, 0, 0, k, 0, 0);
  const ov = { ...OVERVIEW, ...(opts.view || {}) };
  const s = W / (2 * ov.half);
  const v = sn.view(ov.az, ov.el, s, W / 2, H / 2, W / 2, H / 2);
  if (opts.brow === false) sn.drawBrow = () => {};
  sn.drawWorld(g, v, true);
  // poloha cílů v obrázku (pro klikací místa), v % šířky a výšky
  return sn.targets.map((t) => {
    const x = (W / 2 + (t.az - v.az) * s) / W * 100;
    const y = (H / 2 - (t.el - v.el) * s) / H * 100;
    return { id: t.id, x, y, mPx: (1000 / t.dist) * s / W * 100 };
  });
}
