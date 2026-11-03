/*
 * Kloubová figurína (Vojenská tělovýchova – podzemí tvrze): kresba k aktivitě „figurine“.
 *
 * Dřevěná figurína z boku (délky segmentů podle Wintera jako v js/postava.js), stojí na stojanu
 * v betonové chodbě. Zadaný kloub (nebo dva) jde ohýbat tahem myší / prstem – nebo posuvníkem
 * v ui.js – ale jen v rozsahu skutečného kloubu: loket a koleno se ohnou jen jedním směrem,
 * rameno a kyčel víc, krk dopředu i dozadu. U kyčle s kolenem hlídá i zadní stehenní svaly
 * (vedou přes oba klouby: s nataženým kolenem pustí stehno jen asi do 80°). Když hráč tlačí za
 * zarážku, scéna to ohlásí (onChange s „limit“) a ui.js ukáže vysvětlení z game.json.
 *
 * Úhly kloubů ve stupních od základního postoje: shoulder (+ = paže dopředu a nahoru, − = dozadu),
 * elbow (+ = ohnutí), hip (+ = stehno dopředu, − = dozadu), knee (+ = ohnutí), neck (+ = brada
 * k hrudníku, − = záklon). Plátno 600 × 380.
 */
import { SEG } from './postava.js?v=0.34';
import { setupCanvas, label } from './kresba.js?v=0.34';

const W = 600;
const H = 380;
const S = 140;                  // px na metr
const BODY_H = 1.75;            // výška figuríny (m)
const GROUND = 352;
const DEG = Math.PI / 180;
const L = Object.fromEntries(Object.entries(SEG.len).map(([k, v]) => [k, v * BODY_H]));
const NECK = 0.05 * BODY_H;
const HEAD_R = 0.068 * BODY_H;

/* Rozsahy kloubů (stupně) – základní hodnoty, game.json je může přepsat. */
export const JOINTS = {
  shoulder: { name: 'rameno', min: -50, max: 180 },
  elbow: { name: 'loket', min: 0, max: 145 },
  hip: { name: 'kyčel', min: -15, max: 120 },
  knee: { name: 'koleno', min: 0, max: 140 },
  neck: { name: 'krk', min: -70, max: 45 },
};
/* Zadní stehenní svaly: kyčel − 0,8 · koleno ≤ 80° (s nataženým kolenem stehno jen do 80°). */
const HAM_K = 0.8;
const HAM_MAX = 80;

const dirDown = (deg) => [Math.sin(deg * DEG), -Math.cos(deg * DEG)];
const angDown = (v) => Math.atan2(v[0], -v[1]) / DEG;
const add = (p, v, k) => [p[0] + v[0] * k, p[1] + v[1] * k];
const wrap = (a) => ((((a + 180) % 360) + 360) % 360) - 180;

export class FigurineScene {
  /* opts: { pose, joints (aktivní), ranges, goal { kloub: [od, do] }, hamstrings, number, onChange(st) } */
  constructor(canvas, opts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.opts = opts;
    this.ranges = {};
    for (const [k, r] of Object.entries(JOINTS)) this.ranges[k] = { ...r, ...((opts.ranges || {})[k] || {}) };
    this.a = { shoulder: 0, elbow: 0, hip: 0, knee: 0, neck: 0, ...(opts.pose || {}) };
    this.active = opts.joints || [];
    this.drag = null;
    this.flash = null;          // { joint, t0 } – zarážka (červený kroužek)
    this.done = false;
    this.bg = null;
    this.hip = [250 / S, L.shank + L.thigh + L.ankle];   // kyčel (m; x od levého okraje, y od podlahy)
    this.cv = setupCanvas(canvas, W, H, (changed) => {
      if (changed) this.bg = null;
      this.render();
    });
    this.onDown = (e) => this.pointerDown(e);
    this.onMove = (e) => this.pointerMove(e);
    this.onUp = () => this.pointerUp();
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onUp);
    this.render();
  }

  destroy() {
    this.cv.destroy();
    cancelAnimationFrame(this.raf);
    this.canvas.removeEventListener('pointerdown', this.onDown);
    this.canvas.removeEventListener('pointermove', this.onMove);
    this.canvas.removeEventListener('pointerup', this.onUp);
    this.canvas.removeEventListener('pointercancel', this.onUp);
  }

  /* Horní mez kloubu (u kyčle podle kolena, u kolena podle kyčle – zadní stehenní svaly). */
  maxOf(j) {
    let m = this.ranges[j].max;
    if (this.opts.hamstrings && j === 'hip') m = Math.min(m, HAM_MAX + HAM_K * this.a.knee);
    return m;
  }

  minOf(j) {
    let m = this.ranges[j].min;
    if (this.opts.hamstrings && j === 'knee') m = Math.max(m, (this.a.hip - HAM_MAX) / HAM_K);
    return m;
  }

  /* Nastavit úhel kloubu s hlídáním rozsahu; vrací, na kterou zarážku narazil (nebo null). */
  setAngle(j, want, quiet = false) {
    if (this.done) return null;
    const lo = this.minOf(j);
    const hi = this.maxOf(j);
    let limit = null;
    let v = want;
    if (v < lo - 0.01) {
      v = lo;
      limit = this.opts.hamstrings && j === 'knee' && lo > this.ranges.knee.min ? 'hamstring' : 'min';
    } else if (v > hi + 0.01) {
      v = hi;
      limit = this.opts.hamstrings && j === 'hip' && hi < this.ranges.hip.max ? 'hamstring' : 'max';
    }
    this.a[j] = v;
    if (limit) this.flash = { joint: j, t0: performance.now() };
    if (!quiet) this.emit(j, limit);
    this.render();
    return limit;
  }

  emit(joint, limit) {
    if (this.opts.onChange) this.opts.onChange({ angles: { ...this.a }, joint, limit, ranges: this.liveRanges() });
  }

  /* Aktuální meze aktivních kloubů (pro posuvníky v ui.js). */
  liveRanges() {
    const out = {};
    for (const j of this.active) out[j] = [this.minOf(j), this.maxOf(j)];
    return out;
  }

  setDone(on) {
    this.done = on;
    this.drag = null;
    this.render();
  }

  /* ---------- poloha segmentů (m, y nahoru) ---------- */

  skeleton() {
    const a = this.a;
    const hip = this.hip;
    const sh = [hip[0], hip[1] + L.trunk];
    const uarm = a.shoulder;
    const elbow = add(sh, dirDown(uarm), L.uarm);
    const farm = uarm + a.elbow;
    const wrist = add(elbow, dirDown(farm), L.farm);
    const hand = add(wrist, dirDown(farm), L.hand * 0.8);
    const knee = add(hip, dirDown(a.hip), L.thigh);
    const shank = a.hip - a.knee;
    const ankle = add(knee, dirDown(shank), L.shank);
    const toe = add(ankle, dirDown(shank + 90), L.foot * 0.78);
    const heel = add(ankle, dirDown(shank + 90), -L.foot * 0.22);
    // krk a hlava: krk se nakloní o půlku, hlava o celý úhel (směr „nahoru“ od svislice)
    const up = (deg) => [Math.sin(deg * DEG), Math.cos(deg * DEG)];
    const neckTop = add(sh, up(a.neck * 0.5), NECK);
    const head = add(neckTop, up(a.neck), HEAD_R * 0.95);
    // vzdálenější končetiny – stojí, paže volně dolů
    const fElbow = add(sh, dirDown(-6), L.uarm);
    const fWrist = add(fElbow, dirDown(4), L.farm);
    const fHand = add(fWrist, dirDown(4), L.hand * 0.8);
    const fKnee = add(hip, dirDown(0), L.thigh);
    const fAnkle = add(fKnee, dirDown(0), L.shank);
    return {
      hip, sh, elbow, wrist, hand, knee, ankle, toe, heel, neckTop, head, headDeg: a.neck,
      far: { elbow: fElbow, wrist: fWrist, hand: fHand, knee: fKnee, ankle: fAnkle, toe: add(fAnkle, [1, 0], L.foot * 0.78), heel: add(fAnkle, [1, 0], -L.foot * 0.22) },
      abs: { shoulder: uarm, elbow: farm, hip: a.hip, knee: shank, neck: a.neck },
    };
  }

  /* Kloub, kolem kterého se otáčí, a jeho „dítě“ (konec segmentu) pro tah. */
  pivotOf(j, sk) {
    return { shoulder: sk.sh, elbow: sk.elbow, hip: sk.hip, knee: sk.knee, neck: sk.sh }[j];
  }

  tipOf(j, sk) {
    return { shoulder: sk.wrist, elbow: sk.hand, hip: sk.knee, knee: sk.ankle, neck: sk.head }[j];
  }

  /* ---------- tah myší / prstem ---------- */

  toWorld(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * W;
    const y = ((clientY - r.top) / r.height) * H;
    return [x / S, (GROUND - y) / S];
  }

  pointerDown(e) {
    if (this.done || !this.active.length) return;
    const p = this.toWorld(e.clientX, e.clientY);
    const sk = this.skeleton();
    // nejbližší aktivní segment (u kyčle s kolenem: stehno, nebo bérec)
    let best = null;
    for (const j of this.active) {
      const a = this.pivotOf(j, sk);
      const b = this.tipOf(j, sk);
      const d = segDist(p, a, b);
      if (!best || d < best.d) best = { j, d };
    }
    if (!best || best.d > 0.45) return;
    e.preventDefault();
    this.drag = { joint: best.j };
    this.canvas.setPointerCapture(e.pointerId);
    this.canvas.style.cursor = 'grabbing';
    this.pointerMove(e);
  }

  pointerMove(e) {
    if (!this.drag) {
      if (this.done) return;
      const p = this.toWorld(e.clientX, e.clientY);
      const sk = this.skeleton();
      const near = this.active.some((j) => segDist(p, this.pivotOf(j, sk), this.tipOf(j, sk)) < 0.45);
      this.canvas.style.cursor = near ? 'grab' : '';
      return;
    }
    const j = this.drag.joint;
    const p = this.toWorld(e.clientX, e.clientY);
    const sk = this.skeleton();
    const piv = this.pivotOf(j, sk);
    const v = [p[0] - piv[0], p[1] - piv[1]];
    if (Math.hypot(v[0], v[1]) < 0.04) return;
    let want;
    if (j === 'neck') {
      // hlava: úhel od svislice nahoru, + = dopředu (brada k hrudníku)
      want = Math.atan2(v[0], v[1]) / DEG;
      want = this.a.neck + wrap(want - this.a.neck);
    } else {
      const parentAbs = { shoulder: 0, elbow: sk.abs.shoulder, hip: 0, knee: sk.abs.hip }[j];
      const abs = angDown(v);
      if (j === 'knee') want = this.a.knee + wrap(parentAbs - abs - this.a.knee);
      else want = this.a[j] + wrap(abs - parentAbs - this.a[j]);
    }
    this.setAngle(j, want);
  }

  pointerUp() {
    if (!this.drag) return;
    this.drag = null;
    this.canvas.style.cursor = '';
    this.emit(null, null);
  }

  /* ---------- kreslení ---------- */

  render() {
    if (!this.cv) return;   // setupCanvas volá překreslení ještě před dokončením konstruktoru
    const ctx = this.ctx;
    const dpr = this.cv.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!this.bg) this.bg = this.paintBackground();
    ctx.drawImage(this.bg, 0, 0, W, H);
    const sk = this.skeleton();
    const P = (q) => [q[0] * S, GROUND - q[1] * S];   // metry → plátno
    // rozsahy aktivních kloubů (oblouky) pod figurínou
    for (const j of this.active) this.paintRange(ctx, j, sk, P);
    this.paintFigure(ctx, sk, P);
    for (const j of this.active) this.paintJointLabel(ctx, j, sk, P);
    if (this.flash && performance.now() - this.flash.t0 < 700) {
      const c = P(this.pivotOf(this.flash.joint, sk));
      const k = (performance.now() - this.flash.t0) / 700;
      ctx.strokeStyle = `rgba(255,90,70,${1 - k})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(c[0], c[1], 10 + 16 * k, 0, Math.PI * 2);
      ctx.stroke();
      cancelAnimationFrame(this.raf);
      this.raf = requestAnimationFrame(() => this.render());
    }
  }

  paintBackground() {
    const c = document.createElement('canvas');
    const dpr = this.cv.dpr;
    c.width = Math.round(W * dpr);
    c.height = Math.round(H * dpr);
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // betonová chodba tvrze: stěna z bednění, podlaha, světlo lampy
    const wall = g.createLinearGradient(0, 0, 0, GROUND);
    wall.addColorStop(0, '#5d5d58');
    wall.addColorStop(1, '#46463f');
    g.fillStyle = wall;
    g.fillRect(0, 0, W, GROUND);
    g.strokeStyle = 'rgba(30,30,26,0.35)';
    g.lineWidth = 1;
    for (let y = 22; y < GROUND; y += 34) {
      g.beginPath();
      g.moveTo(0, y + 0.5);
      g.lineTo(W, y + 0.5);
      g.stroke();
    }
    for (let i = 0; i < 26; i++) {
      const x = (i * 97) % W;
      const y = 22 + ((i * 53) % 9) * 34;
      g.beginPath();
      g.moveTo(x + 0.5, y);
      g.lineTo(x + 0.5, y + 34);
      g.stroke();
    }
    // vlhká skvrna
    const st = g.createRadialGradient(470, 250, 10, 470, 250, 110);
    st.addColorStop(0, 'rgba(32,36,30,0.45)');
    st.addColorStop(1, 'rgba(32,36,30,0)');
    g.fillStyle = st;
    g.fillRect(340, 120, 260, 232);
    const lamp = g.createRadialGradient(300, 10, 10, 300, 10, 360);
    lamp.addColorStop(0, 'rgba(255,236,190,0.35)');
    lamp.addColorStop(1, 'rgba(255,236,190,0)');
    g.fillStyle = lamp;
    g.fillRect(0, 0, W, GROUND);
    const fl = g.createLinearGradient(0, GROUND, 0, H);
    fl.addColorStop(0, '#3a3a33');
    fl.addColorStop(1, '#25251f');
    g.fillStyle = fl;
    g.fillRect(0, GROUND, W, H - GROUND);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(0, GROUND, W, 3);
    // šablonou na zdi číslo figuríny
    if (this.opts.number) {
      g.font = '700 30px "Courier New", monospace';
      g.fillStyle = 'rgba(214,206,170,0.32)';
      g.textAlign = 'left';
      g.textBaseline = 'top';
      g.fillText(`FIGURÍNA ${this.opts.number}`, 18, 16);
    }
    return c;
  }

  /* Oblouk rozsahu kloubu: zeleně povolený rozsah, zlatě cíl, červeně zarážky. */
  paintRange(ctx, j, sk, P) {
    const c = P(this.pivotOf(j, sk));
    const r = { shoulder: 64, elbow: 50, hip: 62, knee: 50, neck: 40 }[j];
    // úhel kloubu → úhel na plátně (atan2 v souřadnicích plátna, y dolů)
    const toCanvas = (deg) => {
      let abs;
      if (j === 'neck') {
        const v = [Math.sin(deg * DEG), Math.cos(deg * DEG)];
        return Math.atan2(-v[1], v[0]);
      }
      if (j === 'shoulder' || j === 'hip') abs = deg;
      else if (j === 'elbow') abs = sk.abs.shoulder + deg;
      else abs = sk.abs.hip - deg;
      const v = dirDown(abs);
      return Math.atan2(-v[1], v[0]);
    };
    const arc = (d0, d1, col, w) => {
      const steps = Math.max(2, Math.ceil(Math.abs(d1 - d0) / 3));
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const t = toCanvas(d0 + ((d1 - d0) * i) / steps);
        const x = c[0] + Math.cos(t) * r;
        const y = c[1] + Math.sin(t) * r;
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.stroke();
    };
    ctx.save();
    ctx.lineCap = 'round';
    const lo = this.minOf(j);
    const hi = this.maxOf(j);
    arc(this.ranges[j].min, this.ranges[j].max, 'rgba(10,12,10,0.55)', 9);
    arc(lo, hi, 'rgba(126,224,129,0.55)', 5);
    const goal = (this.opts.goal || {})[j];
    if (goal) arc(Math.max(lo, goal[0]), Math.min(this.ranges[j].max, goal[1]), 'rgba(255,210,120,0.95)', 5);
    for (const d of [lo, hi]) {
      const t = toCanvas(d);
      ctx.strokeStyle = '#ff6a55';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(c[0] + Math.cos(t) * (r - 8), c[1] + Math.sin(t) * (r - 8));
      ctx.lineTo(c[0] + Math.cos(t) * (r + 8), c[1] + Math.sin(t) * (r + 8));
      ctx.stroke();
    }
    ctx.restore();
  }

  paintJointLabel(ctx, j, sk, P) {
    const c = P(this.pivotOf(j, sk));
    const name = this.ranges[j].name;
    const v = Math.round(this.a[j]);
    const dx = j === 'neck' ? -44 : j === 'shoulder' ? -58 : j === 'hip' ? -56 : 34;
    const dy = j === 'neck' ? -30 : j === 'knee' ? 6 : 0;
    label(ctx, `${name} ${v}°`, c[0] + dx, c[1] + dy, '#ffe2a8', { W, size: 13, ts: this.cv.ts });
  }

  paintFigure(ctx, sk, P) {
    const wood = (far) => (far ? ['#a37d4f', '#7d5a32'] : ['#e0b985', '#a87a45']);
    const limb = (a, b, w0, w1, far) => capsule(ctx, P(a), P(b), w0 * S, w1 * S, wood(far));
    const joint = (p, r, far) => ball(ctx, P(p), r * S, far);
    // stojan: kovová tyč od podstavy za pánev
    const base = P([sk.hip[0] - 0.12, 0]);
    const top = P([sk.hip[0] - 0.06, sk.hip[1] - 0.02]);
    ctx.fillStyle = '#2b2b27';
    ctx.beginPath();
    ctx.ellipse(base[0], GROUND - 2, 46, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#6f6f69';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(base[0], GROUND - 4);
    ctx.lineTo(base[0], top[1] + 12);
    ctx.lineTo(top[0], top[1]);
    ctx.stroke();
    // vzdálenější paže a noha (tmavší)
    const f = sk.far;
    limb(sk.hip, f.knee, 0.06, 0.045, true);
    limb(f.knee, f.ankle, 0.045, 0.032, true);
    foot(ctx, P(f.heel), P(f.toe), wood(true));
    joint(f.knee, 0.034, true);
    limb(sk.sh, f.elbow, 0.04, 0.032, true);
    limb(f.elbow, f.wrist, 0.032, 0.024, true);
    hand(ctx, P(f.wrist), P(f.hand), wood(true));
    joint(f.elbow, 0.028, true);
    // trup: pánev, pas, hrudník
    const hp = P(sk.hip);
    const sp = P(sk.sh);
    torso(ctx, hp, sp, wood(false));
    // krk a hlava
    limb(sk.sh, sk.neckTop, 0.03, 0.028, false);
    headShape(ctx, P(sk.head), HEAD_R * S, sk.headDeg, wood(false));
    joint(sk.neckTop, 0.022, false);
    // bližší noha a paže
    limb(sk.hip, sk.knee, 0.064, 0.048, false);
    limb(sk.knee, sk.ankle, 0.048, 0.034, false);
    foot(ctx, P(sk.heel), P(sk.toe), wood(false));
    joint(sk.hip, 0.05, false);
    joint(sk.knee, 0.036, false);
    joint(sk.ankle, 0.026, false);
    limb(sk.sh, sk.elbow, 0.042, 0.034, false);
    limb(sk.elbow, sk.wrist, 0.034, 0.026, false);
    hand(ctx, P(sk.wrist), P(sk.hand), wood(false));
    joint(sk.sh, 0.042, false);
    joint(sk.elbow, 0.03, false);
    joint(sk.wrist, 0.02, false);
    // aktivní klouby: zlatý kroužek (sem se táhne)
    if (!this.done) {
      for (const j of this.active) {
        const t = P(this.tipOf(j, sk));
        ctx.strokeStyle = 'rgba(255,210,120,0.9)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.arc(t[0], t[1], 13, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }
}

/* Vzdálenost bodu od úsečky (m). */
function segDist(p, a, b) {
  const v = [b[0] - a[0], b[1] - a[1]];
  const l2 = v[0] * v[0] + v[1] * v[1] || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * v[0] + (p[1] - a[1]) * v[1]) / l2));
  return Math.hypot(p[0] - a[0] - v[0] * t, p[1] - a[1] - v[1] * t);
}

/* Zúžený válec segmentu s dřevěným stínováním. */
function capsule(ctx, a, b, w0, w1, col) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy) || 1;
  const n = [-dy / l, dx / l];
  const g = ctx.createLinearGradient(a[0] + n[0] * w0, a[1] + n[1] * w0, a[0] - n[0] * w0, a[1] - n[1] * w0);
  g.addColorStop(0, col[0]);
  g.addColorStop(1, col[1]);
  ctx.fillStyle = g;
  ctx.strokeStyle = 'rgba(40,26,12,0.75)';
  ctx.lineWidth = 1.2;
  // obrys: bok – půlkruh za koncem b – druhý bok – půlkruh za začátkem a
  const an = Math.atan2(n[1], n[0]);
  ctx.beginPath();
  ctx.moveTo(a[0] + (n[0] * w0) / 2, a[1] + (n[1] * w0) / 2);
  ctx.lineTo(b[0] + (n[0] * w1) / 2, b[1] + (n[1] * w1) / 2);
  ctx.arc(b[0], b[1], w1 / 2, an, an - Math.PI, true);
  ctx.lineTo(a[0] - (n[0] * w0) / 2, a[1] - (n[1] * w0) / 2);
  ctx.arc(a[0], a[1], w0 / 2, an - Math.PI, an - 2 * Math.PI, true);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // žilkování dřeva
  ctx.strokeStyle = 'rgba(90,58,26,0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(a[0] + n[0] * w0 * 0.15, a[1] + n[1] * w0 * 0.15);
  ctx.lineTo(b[0] + n[0] * w1 * 0.15, b[1] + n[1] * w1 * 0.15);
  ctx.stroke();
}

/* Kloub figuríny: dřevěná kulička. */
function ball(ctx, c, r, far) {
  const g = ctx.createRadialGradient(c[0] - r * 0.35, c[1] - r * 0.35, r * 0.1, c[0], c[1], r);
  g.addColorStop(0, far ? '#b08a5a' : '#f0cf9c');
  g.addColorStop(1, far ? '#6e4e2a' : '#8f6436');
  ctx.fillStyle = g;
  ctx.strokeStyle = 'rgba(40,26,12,0.8)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(c[0], c[1], r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function torso(ctx, hp, sp, col) {
  const len = hp[1] - sp[1];
  const g = ctx.createLinearGradient(hp[0] + 30, 0, hp[0] - 30, 0);
  g.addColorStop(0, col[0]);
  g.addColorStop(1, col[1]);
  ctx.fillStyle = g;
  ctx.strokeStyle = 'rgba(40,26,12,0.8)';
  ctx.lineWidth = 1.3;
  // pánev
  ctx.beginPath();
  ctx.ellipse(hp[0] - 2, hp[1] - len * 0.1, len * 0.26, len * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // pas
  ctx.beginPath();
  ctx.ellipse(hp[0], hp[1] - len * 0.42, len * 0.17, len * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // hrudník (vpředu vypouklý)
  ctx.beginPath();
  ctx.ellipse(sp[0] + 3, sp[1] + len * 0.24, len * 0.27, len * 0.3, -0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

/* Hlava: vejce, užší konec u brady – podle něj je vidět, kam figurína hledí. */
function headShape(ctx, c, r, deg, col) {
  ctx.save();
  ctx.translate(c[0], c[1]);
  ctx.rotate(deg * DEG);
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.4, r * 0.2, 0, 0, r * 1.3);
  g.addColorStop(0, col[0]);
  g.addColorStop(1, col[1]);
  ctx.fillStyle = g;
  ctx.strokeStyle = 'rgba(40,26,12,0.8)';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(-r * 0.85, -r * 0.2);
  ctx.bezierCurveTo(-r * 0.9, -r * 1.25, r * 0.95, -r * 1.3, r * 0.9, -r * 0.25);
  ctx.bezierCurveTo(r * 0.92, r * 0.35, r * 0.6, r * 0.95, r * 0.25, r * 1.0);
  ctx.bezierCurveTo(-r * 0.25, r * 1.05, -r * 0.8, r * 0.6, -r * 0.85, -r * 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // čára očí – ukazuje směr pohledu
  ctx.strokeStyle = 'rgba(60,38,16,0.7)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(r * 0.35, -r * 0.2);
  ctx.lineTo(r * 0.85, -r * 0.2);
  ctx.stroke();
  ctx.restore();
}

function hand(ctx, a, b, col) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const ang = Math.atan2(dy, dx);
  const l = Math.hypot(dx, dy);
  ctx.save();
  ctx.translate(a[0], a[1]);
  ctx.rotate(ang);
  ctx.fillStyle = col[1];
  ctx.strokeStyle = 'rgba(40,26,12,0.8)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(l * 0.55, 0, l * 0.6, l * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function foot(ctx, heel, toe, col) {
  const dx = toe[0] - heel[0];
  const dy = toe[1] - heel[1];
  const ang = Math.atan2(dy, dx);
  const l = Math.hypot(dx, dy);
  ctx.save();
  ctx.translate(heel[0], heel[1]);
  ctx.rotate(ang);
  ctx.fillStyle = col[1];
  ctx.strokeStyle = 'rgba(40,26,12,0.8)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(0, -l * 0.16);
  ctx.quadraticCurveTo(l * 0.6, -l * 0.26, l, -l * 0.06);
  ctx.lineTo(l, l * 0.06);
  ctx.lineTo(0, l * 0.08);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
