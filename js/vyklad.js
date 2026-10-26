/*
 * Výklady („videa“): animace, která sama vypráví, co se při pohybu děje a jak se to spočítá.
 *
 * Tady je společný základ všech výkladů: rozvržení plátna (na šířku 960 × 540; na telefonu na výšku
 * 480 × 660 – scéna nahoře, monitor s grafem a tabule s čísly pod ní, větší písmo), rámy monitoru
 * a tabule, štítky, šipky, řádky čísel a vzorce, hlas (Narrator) a přehrávač kroků (Player).
 * Jednotlivé výklady jsou v js/vyklad-*.js a načtou se, až jsou potřeba (podle „type“ v game.json):
 * jump = Skok vypráví (vyklad-skok.js), lever = Biceps a páka (vyklad-paka.js), projectile = Šikmý
 * vrh (vyklad-vrh.js), bullet = Pád kulky (vyklad-kulka.js). Texty kroků (titulky a to, co čte hlas)
 * jsou v game.json „explainers“.
 *
 * Hlas je syntetický hlas prohlížeče (speechSynthesis, čeština). Titulky jsou vždy – zvuk nenese
 * nic, co by hráč neviděl.
 */

export const G = 9.81;

/* Rozvržení: stage = scéna, monitor = rám grafu, graph = plocha grafu, board = tabule s čísly.
   f = zvětšení písma na monitoru a tabuli, sf = ve scéně (na telefonu je plátno zmenšené). */
export const LAYOUTS = {
  wide: {
    name: 'wide', W: 960, H: 540, f: 1, sf: 1,
    stage: { x: 0, y: 0, w: 556, h: 540 },
    monitor: { x: 568, y: 16, w: 376, h: 264 },
    graph: { x: 590, y: 46, w: 342, h: 214 },
    board: { x: 562, y: 300, w: 380, h: 218 },
  },
  tall: {
    name: 'tall', W: 480, H: 660, f: 1.3, sf: 1.15,
    stage: { x: 0, y: 0, w: 480, h: 340 },
    monitor: { x: 12, y: 352, w: 456, h: 160 },
    graph: { x: 74, y: 386, w: 380, h: 100 },
    board: { x: 12, y: 524, w: 456, h: 124 },
  },
};

/* Telefon na výšku → „tall“, jinak „wide“. */
export function chooseLayout() {
  if (typeof window === 'undefined') return 'wide';
  return window.innerWidth < 640 && window.innerHeight > window.innerWidth ? 'tall' : 'wide';
}

export const fmt = (v, d = 0) => v.toFixed(d).replace('.', ',');
export const fmtN = (v) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
// plynulý rozjezd a dojezd (nulová rychlost i zrychlení na koncích)
export const smoother = (u) => u * u * u * (u * (u * 6 - 15) + 10);
export const lerp = (a, b, t) => a + (b - a) * t;

/* Doplnění {t}, {v}… do textu kroku. */
export function fill(text, vals) {
  return String(text || '').replace(/\{(\w+)\}/g, (m, k) => (k in vals ? vals[k] : m));
}

export function rrect(ctx, x, y, w, h, r) {
  const q = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + q, y);
  ctx.arcTo(x + w, y, x + w, y + h, q);
  ctx.arcTo(x + w, y + h, x, y + h, q);
  ctx.arcTo(x, y + h, x, y, q);
  ctx.arcTo(x, y, x + w, y, q);
  ctx.closePath();
}

/* Typy výkladů a jejich moduly. */
const TYPES = { jump: 'skok', lever: 'paka', projectile: 'vrh', bullet: 'kulka' };
export const EXPLAINER_TYPES = Object.keys(TYPES);

/* Načte třídu výkladu daného typu (výchozí je skok). */
export async function load(type) {
  const name = TYPES[type] || TYPES.jump;
  const mod = await import(`./vyklad-${name}.js?v=0.33`);
  return mod.default;
}

/* ---------- Společný základ výkladu ---------- */

/* Podtřída nastaví: scenes (co se v kroku přehraje a co je v obraze), T (časy v s), vals (čísla do
   textů), graphTitle; a nakreslí paintStageBackground, paintStage, paintGraph, paintBoard. */
export class Explainer {
  constructor(canvas, def) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.def = def;
    this.L = null;
    this.bg = null;
    this.dpr = 1;
    this.scenes = {};
    this.T = { start: 0 };
    this.vals = {};
    this.graphTitle = '';
  }

  /* Rozvržení podle okna – při otočení telefonu se přepne. */
  resize() {
    const L = LAYOUTS[chooseLayout()];
    const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    if (L !== this.L || this.canvas.width !== Math.round(L.W * dpr)) {
      this.L = L;
      this.canvas.width = Math.round(L.W * dpr);
      this.canvas.height = Math.round(L.H * dpr);
      this.canvas.classList.toggle('vyklad-tall', L.name === 'tall');
      this.bg = null;
      this.dpr = dpr;
      this.layout(L);
    }
    this.dpr = dpr;
  }

  /* Podtřída: pohled scény podle rozvržení. */
  layout() {}

  timeOf(key) {
    return key in this.T ? this.T[key] : 0;
  }

  get tall() {
    return this.L && this.L.name === 'tall';
  }

  font(weight, size, stage = false) {
    return `${weight} ${Math.round(size * (stage ? this.L.sf : this.L.f))}px system-ui, sans-serif`;
  }

  /* Vykreslení v čase t (s) se zapnutými prvky „show“ (z popisu scény). */
  render(t, scene) {
    this.resize();
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (!this.bg) this.bg = this.background();
    ctx.drawImage(this.bg, 0, 0, this.L.W, this.L.H);
    const show = new Set(scene.show || []);
    // scéna jen ve svém obdélníku (na výšku jsou pod ní monitor a tabule)
    const S = this.L.stage;
    ctx.save();
    ctx.beginPath();
    ctx.rect(S.x, S.y, S.w, S.h);
    ctx.clip();
    this.paintStage(ctx, t, show, scene);
    ctx.restore();
    this.paintGraph(ctx, t, show, scene);
    this.paintBoard(ctx, t, show, scene);
  }

  background() {
    const L = this.L;
    const c = document.createElement('canvas');
    c.width = Math.round(L.W * this.dpr);
    c.height = Math.round(L.H * this.dpr);
    const g = c.getContext('2d');
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.paintStageBackground(g, L);
    g.fillStyle = '#05080e';
    if (L.name === 'wide') g.fillRect(L.stage.w, 0, L.W - L.stage.w, L.H);
    else g.fillRect(0, L.stage.h, L.W, L.H - L.stage.h);
    this.frame(g, L.monitor, this.graphTitle);
    this.frame(g, L.board, null);
    this.paintBackgroundExtra(g, L);
    return c;
  }

  paintStageBackground() {}

  paintBackgroundExtra() {}

  paintStage() {}

  paintGraph() {}

  paintBoard() {}

  /* Rám monitoru nebo tabule. */
  frame(g, r, title) {
    g.fillStyle = '#1c2230';
    rrect(g, r.x - 6, r.y - 6, r.w + 12, r.h + 12, 12);
    g.fill();
    g.fillStyle = '#0a1018';
    rrect(g, r.x, r.y, r.w, r.h, 8);
    g.fill();
    if (title) {
      g.fillStyle = 'rgba(140,200,255,0.75)';
      g.font = this.font(700, 11);
      g.textAlign = 'left';
      g.textBaseline = 'top';
      g.fillText(title, r.x + 10, r.y + 8);
    }
  }

  /* Tabule: řádky „popisek – hodnota“ (na šířku pod sebou, na výšku po dvou vedle sebe). */
  boardRows(ctx, rows) {
    const B = this.L.board;
    if (!this.tall) {
      let y = B.y + 24;
      for (const [label, value, col] of rows) {
        ctx.font = this.font(500, 15);
        ctx.fillStyle = 'rgba(190,215,245,0.75)';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, B.x + 16, y);
        ctx.font = this.font(700, 19);
        ctx.fillStyle = col;
        ctx.textAlign = 'right';
        ctx.fillText(value, B.x + B.w - 16, y);
        y += 40;
      }
      return;
    }
    const cw = B.w / 2;
    rows.forEach(([label, value, col], i) => {
      const x = B.x + 12 + (i % 2) * cw;
      const y = B.y + 10 + Math.floor(i / 2) * 56;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.font = '500 15px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(190,215,245,0.75)';
      ctx.fillText(label, x, y);
      ctx.font = '700 20px system-ui, sans-serif';
      ctx.fillStyle = col;
      ctx.fillText(value, x, y + 21);
    });
  }

  /* Tabule: vzorce a věty – řádky { text, size, weight, col, gap }. */
  boardLines(ctx, lines) {
    const B = this.L.board;
    const k = this.tall ? 0.92 : 1;
    const kg = this.tall ? 0.6 : 1;
    let y = B.y + (this.tall ? 12 : 24);
    for (const ln of lines) {
      const size = (ln.size || 20) * k;
      ctx.fillStyle = ln.col || '#e8f2ff';
      ctx.font = `${ln.weight || 600} ${Math.round(size)}px system-ui, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(ln.text, B.x + 16, y + size / 2);
      y += size + (ln.gap ?? 14) * kg;
    }
  }

  big(text, col) {
    return { text, size: 26, weight: 700, col };
  }

  small(text) {
    return { text, size: 15, weight: 500, col: 'rgba(190,215,245,0.8)' };
  }

  /* Tabule před začátkem: o čem záznam je. */
  boardNote(ctx, title, sub) {
    const B = this.L.board;
    const y = B.y + (this.tall ? 18 : 24);
    ctx.fillStyle = 'rgba(200,225,255,0.75)';
    ctx.font = this.font(600, 17);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, B.x + 16, y + 10);
    ctx.fillStyle = 'rgba(200,225,255,0.55)';
    ctx.font = this.font(500, 15);
    // dlouhý řádek se na úzké tabuli zalomí (u „ · “ nebo u mezery blízko poloviny)
    const max = B.w - 32;
    let lines = [sub];
    if (ctx.measureText(sub).width > max) {
      const i = sub.indexOf(' · ') > 0 ? sub.indexOf(' · ') : sub.lastIndexOf(' ', Math.round(sub.length / 2));
      lines = [sub.slice(0, i), sub.slice(i).replace(/^\s*·?\s*/, '')];
    }
    lines.forEach((ln, k) => ctx.fillText(ln, B.x + 16, y + (this.tall ? 46 : 42) + k * (this.tall ? 26 : 22)));
  }

  /* Štítek s tmavým podkladem ve scéně. */
  tag(ctx, text, x, y, col, align = 'left') {
    ctx.font = this.font(600, 14, true);
    const s = this.L.sf;
    const w = ctx.measureText(text).width + 10 * s;
    const h = 20 * s;
    let lx = align === 'left' ? x : align === 'center' ? x - w / 2 : x - w;
    const S = this.L.stage;
    lx = Math.max(S.x + 2, Math.min(S.x + S.w - w - 2, lx));   // štítky jsou ve scéně – nevyjedou z ní
    ctx.fillStyle = 'rgba(5,8,14,0.78)';
    rrect(ctx, lx, y - h / 2, w, h, 5);
    ctx.fill();
    ctx.fillStyle = col;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, lx + 5 * s, y + 0.5);
  }

  /* Šipka síly nebo rychlosti s tmavým lemem. */
  arrow(ctx, x0, y0, x1, y1, col, w = 4) {
    const a = Math.atan2(y1 - y0, x1 - x0);
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 3) return;
    const hl = Math.min(14, len * 0.6);
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1 - Math.cos(a) * hl * 0.6, y1 - Math.sin(a) * hl * 0.6);
    };
    const head = () => {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1 - Math.cos(a - 0.42) * hl, y1 - Math.sin(a - 0.42) * hl);
      ctx.lineTo(x1 - Math.cos(a + 0.42) * hl, y1 - Math.sin(a + 0.42) * hl);
      ctx.closePath();
    };
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(5,8,14,0.85)';
    ctx.lineWidth = w + 3;
    path();
    ctx.stroke();
    head();
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.lineWidth = w;
    path();
    ctx.stroke();
    head();
    ctx.fill();
    ctx.restore();
  }

  /* Čárkovaná vodorovná čára s popiskem vpravo nad ní. */
  hline(ctx, x0, x1, y, text, col) {
    ctx.save();
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.stroke();
    ctx.restore();
    if (!text) return;
    ctx.fillStyle = col;
    ctx.font = this.font(600, 13, true);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(text, x1, y - 3);
  }

  /* Svislá kóta s popiskem vlevo (nebo vpravo). */
  vdim(ctx, x, y0, y1, text, col, side = 'left') {
    ctx.save();
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.lineTo(x, y1);
    ctx.moveTo(x - 6, y0);
    ctx.lineTo(x + 6, y0);
    ctx.moveTo(x - 6, y1);
    ctx.lineTo(x + 6, y1);
    ctx.stroke();
    ctx.restore();
    if (text) this.tag(ctx, text, side === 'left' ? x - 8 : x + 8, (y0 + y1) / 2, col, side === 'left' ? 'right' : 'left');
  }

  /* Značka těžiště (čtvrtiny černá a bílá). */
  comMark(ctx, x, y, r = 7) {
    ctx.save();
    ctx.fillStyle = '#f4efe4';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#14110c';
    for (const a of [0, Math.PI]) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.arc(x, y, r, a, a + Math.PI / 2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = '#14110c';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /* Osy grafu s mřížkou: x od x0 do x1, y od 0 do yMax; vrací převod (gx, gy). */
  axes(ctx, { x0, x1, yMax, yStep, xStep, xLabel, yFmt = fmtN, xFmt = (v) => fmt(v, 0) }) {
    const R = this.L.graph;
    const gx = (x) => R.x + ((x - x0) / (x1 - x0)) * R.w;
    const gy = (y) => R.y + R.h - (y / yMax) * R.h;
    ctx.save();
    ctx.font = this.font(600, 11);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let y = 0; y <= yMax + 1e-9; y += yStep) {
      const yy = gy(y);
      ctx.strokeStyle = y === 0 ? 'rgba(160,210,255,0.5)' : 'rgba(160,210,255,0.1)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(R.x, yy + 0.5);
      ctx.lineTo(R.x + R.w, yy + 0.5);
      ctx.stroke();
      ctx.fillStyle = 'rgba(160,210,255,0.6)';
      ctx.fillText(yFmt(y), R.x - 4, yy);
    }
    if (xStep) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let x = x0; x <= x1 + 1e-9; x += xStep) {
        const xx = gx(x);
        ctx.strokeStyle = 'rgba(160,210,255,0.1)';
        ctx.beginPath();
        ctx.moveTo(xx + 0.5, R.y);
        ctx.lineTo(xx + 0.5, R.y + R.h);
        ctx.stroke();
        ctx.fillStyle = 'rgba(160,210,255,0.6)';
        ctx.fillText(xFmt(x), xx, R.y + R.h + 4);
      }
    }
    if (xLabel) {
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = 'rgba(160,210,255,0.75)';
      ctx.fillText(xLabel, R.x + R.w, R.y - 3);
    }
    ctx.restore();
    return { gx, gy };
  }
}

/* ---------- Hlas (syntetický, čeština) ---------- */

export class Narrator {
  constructor() {
    this.synth = typeof window !== 'undefined' && window.speechSynthesis ? window.speechSynthesis : null;
    this.voice = null;
    this.timer = 0;
    this.token = 0;
    this.pickVoice();
    if (this.synth && 'onvoiceschanged' in this.synth) {
      this.onVoices = () => this.pickVoice();
      this.synth.addEventListener('voiceschanged', this.onVoices);
    }
  }

  pickVoice() {
    if (!this.synth) return;
    const voices = this.synth.getVoices() || [];
    const cs = voices.filter((v) => /^cs(-|_|$)/i.test(v.lang));
    this.voice = cs.find((v) => v.localService) || cs[0] || null;
    if (this.onChange) this.onChange();
  }

  /* Je k dispozici český hlas? */
  get ok() {
    return !!(this.synth && this.voice);
  }

  speak(text, onEnd) {
    this.cancel();
    const token = ++this.token;
    const done = () => {
      if (token !== this.token) return;
      clearTimeout(this.timer);
      this.token++;
      if (onEnd) onEnd();
    };
    if (!this.ok) {
      done();
      return;
    }
    // po větách (Chrome dlouhou řeč po ~15 s utne), krátké věty dohromady do ~160 znaků
    const chunks = [];
    for (const part of String(text).match(/[^.!?…]+[.!?…]*\s*/g) || [String(text)]) {
      const last = chunks[chunks.length - 1];
      if (last && (last + part).length < 160) chunks[chunks.length - 1] = last + part;
      else chunks.push(part);
    }
    // pojistka, kdyby prohlížeč konec řeči neohlásil
    this.timer = setTimeout(done, 4000 + text.length * 110);
    // řeč hned po cancel() Chrome občas zahodí – chvilku počkat
    this.delay = setTimeout(() => {
      if (token !== this.token) return;
      chunks.forEach((c, i) => {
        const u = new SpeechSynthesisUtterance(c.trim());
        u.lang = 'cs-CZ';
        u.voice = this.voice;
        u.rate = 1;
        if (i === chunks.length - 1) u.onend = done;
        u.onerror = done;
        this.synth.speak(u);
      });
    }, 60);
  }

  cancel() {
    this.token++;
    clearTimeout(this.timer);
    clearTimeout(this.delay);
    if (this.synth) this.synth.cancel();
  }

  destroy() {
    this.cancel();
    if (this.synth && this.onVoices) this.synth.removeEventListener('voiceschanged', this.onVoices);
  }
}

/* ---------- Přehrávač kroků ---------- */

/* ex = výklad (podtřída Explainer); opts: { narrator, voice (bool), onStep(i, text),
   onState({ playing, done }), onSound(name) }. Scéna kroku: play = úseky fyzikálního času
   [od, do, zpomalení], at = pevný čas, show = co je v obraze, sounds = [[čas, zvuk, předstih]]. */
export class Player {
  constructor(ex, def, opts) {
    this.def = def;
    this.opts = opts;
    this.ex = ex;
    this.vals = ex.vals;
    this.scenes = ex.scenes;
    this.steps = def.steps || [];
    this.narrator = opts.narrator;
    this.voice = !!opts.voice;
    this.speed = 1;
    this.playing = false;
    this.done = false;
    this.i = 0;
    this.raf = 0;
    this.last = 0;
    this.frame = this.frame.bind(this);
    // otočení telefonu: překreslit i v pauze (výklad si sám zvolí rozvržení)
    this.onResize = () => this.render();
    if (typeof window !== 'undefined') window.addEventListener('resize', this.onResize);
    this.go(0);
  }

  get scene() {
    const st = this.steps[this.i] || {};
    return this.scenes[st.scene] || this.scenes.intro || { show: [] };
  }

  /* Text kroku: titulky („text“) a to, co čte hlas („say“, jinak titulky). */
  text(i = this.i) {
    return fill((this.steps[i] || {}).text, this.vals);
  }

  say(i = this.i) {
    const st = this.steps[i] || {};
    return fill(st.say || st.text, this.vals);
  }

  go(i) {
    this.i = Math.max(0, Math.min(this.steps.length - 1, i));
    const sc = this.scene;
    this.seg = 0;
    this.phys = this.ex.timeOf(sc.play ? sc.play[0][0] : sc.at || 'start');
    this.animDone = !sc.play;
    this.elapsed = 0;
    this.speechDone = false;
    this.endAt = 0;
    this.played = new Set();
    this.done = false;
    if (this.opts.onStep) this.opts.onStep(this.i, this.text());
    if (this.playing) this.speak();
    else if (this.narrator) this.narrator.cancel();
    this.render();
    this.emit();
  }

  speak() {
    this.speechDone = false;
    this.readTime = Math.max(2.4, Math.min(11, this.text().length * 0.055));
    if (this.voice && this.narrator && this.narrator.ok) {
      this.narrator.speak(this.say(), () => {
        this.speechDone = true;
      });
    } else if (this.narrator) this.narrator.cancel();
  }

  play() {
    if (this.done) {
      this.playing = true;
      this.go(0);
    } else {
      this.playing = true;
      this.speak();
    }
    this.last = performance.now();
    this.loop();
    this.emit();
  }

  pause() {
    this.playing = false;
    if (this.narrator) this.narrator.cancel();
    this.emit();
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  next() {
    if (this.i < this.steps.length - 1) this.go(this.i + 1);
  }

  prev() {
    this.go(this.i - 1);
  }

  restart() {
    this.go(0);
  }

  setSpeed(f) {
    this.speed = f;
  }

  setVoice(on) {
    this.voice = on;
    if (!this.playing) return;
    if (on) this.speak();
    else {
      if (this.narrator) this.narrator.cancel();
      this.speechDone = this.elapsed >= this.readTime;
    }
  }

  emit() {
    if (this.opts.onState) this.opts.onState({ playing: this.playing, done: this.done, i: this.i, n: this.steps.length });
  }

  loop() {
    if (!this.raf) this.raf = requestAnimationFrame(this.frame);
  }

  frame(now) {
    this.raf = 0;
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (this.playing) this.tick(dt, now);
    this.render();
    if (this.playing) this.loop();
  }

  tick(dt, now) {
    const sc = this.scene;
    this.elapsed += dt;
    if (!this.animDone) {
      let left = dt * this.speed;
      while (left > 0 && this.seg < sc.play.length) {
        const [, toKey, rate] = sc.play[this.seg];
        const to = this.ex.timeOf(toKey);
        const need = (to - this.phys) / rate;
        if (need > left) {
          this.phys += left * rate;
          left = 0;
        } else {
          this.phys = to;
          left -= need;
          this.seg++;
          if (this.seg < sc.play.length) this.phys = this.ex.timeOf(sc.play[this.seg][0]);
        }
      }
      if (this.seg >= sc.play.length) this.animDone = true;
      for (const [key, name, lead = 0] of sc.sounds || []) {
        const id = `${key}:${name}`;
        if (!this.played.has(id) && this.phys >= this.ex.timeOf(key) + lead) {
          this.played.add(id);
          if (this.opts.onSound) this.opts.onSound(name);
        }
      }
    }
    if (!(this.voice && this.narrator && this.narrator.ok) && this.elapsed >= this.readTime) this.speechDone = true;
    if (this.animDone && this.speechDone) {
      if (!this.endAt) this.endAt = now;
      if (now - this.endAt > 650) {
        if (this.i < this.steps.length - 1) this.go(this.i + 1);
        else {
          this.playing = false;
          this.done = true;
          this.emit();
        }
      }
    }
  }

  render() {
    this.ex.render(this.phys, this.scene);
  }

  destroy() {
    this.playing = false;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (typeof window !== 'undefined') window.removeEventListener('resize', this.onResize);
    if (this.narrator) this.narrator.cancel();
  }
}
