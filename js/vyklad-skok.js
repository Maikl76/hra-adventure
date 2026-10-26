/*
 * Výklad „Skok vypráví“ (GSPORT – měřicí kabina skokanské arény): výskok z podřepu na silové
 * plošině. Postava z js/postava.js se hýbe podle fyziky: síla plošiny při odrazu dává impulz
 * (J = m · v), let je volný pád (výstup i pád trvají t/2), dopad brzdí pokrčená kolena. Na monitoru
 * graf síly jako v kabině, na tabuli čísla a vzorce. Společný základ (rozvržení na šířku i na výšku,
 * hlas, přehrávač) je v js/vyklad.js, texty kroků v game.json „explainers“ (type „jump“).
 */
import { makeBody, pose, drawBody, lerpPose, centerOfMass } from './postava.js?v=0.33';
import { G, Explainer, fmt, fmtN, smoother } from './vyklad.js?v=0.33';

const VIEWS = {                                    // svět → plátno (x = 0 bříško chodidla na plošině)
  wide: { s: 158, ox: 292, oy: 478 },
  tall: { s: 118, ox: 250, oy: 322 },
};
const ARROW_N = 0.06;     // px šipky síly na 1 N (při měřítku 158 px/m)
const ARROW_V = 34;       // px šipky rychlosti na 1 m/s

const POSES = {
  stand: { trunk: 3, thigh: 0, shin: 2, foot: 0, hips: true },
  squat: { trunk: 40, bend: -2, neck: -12, head: -6, thigh: 68, shin: 30, foot: 0, hips: true },
  ext: { trunk: 6, thigh: -2, shin: 1, foot: 0, hips: true },
  takeoff: { trunk: 4, thigh: -4, shin: -3, foot: 40, toeFlat: 0.85, hips: true },
  air: { trunk: 9, thigh: 16, shin: 3, foot: 24, toeFlat: 0, hips: true },
  landFlat: { trunk: 8, thigh: 4, shin: 4, foot: 0, hips: true },
  landLow: { trunk: 30, bend: -2, neck: -10, head: -6, thigh: 52, shin: 27, foot: 0, hips: true },
};

/* Scény: co se při kroku přehraje (úseky fyzikálního času a zpomalení) a co je v obraze. */
export const SCENES = {
  intro: { at: 'start', show: [] },
  weight: { at: 'start', show: ['forces', 'live'] },
  squat: { play: [['start', 'push', 1]], show: ['forces', 'live'] },
  push: { play: [['push', 'off', 0.14]], show: ['forces', 'impulseFill', 'live'], sounds: [['push', 'beep', -0.05]] },
  impulse: { at: 'off', show: ['forces', 'impulse', 'live'] },
  takeoff: { at: 'off', show: ['velocity', 'takeoffLine', 'live'] },
  rise: { play: [['off', 'apex', 0.3]], show: ['velocity', 'trace', 'takeoffLine', 'rise', 'live'] },
  apex: { at: 'apex', show: ['trace', 'takeoffLine', 'apexLine', 'rise', 'live'] },
  fall: { play: [['apex', 'touch', 0.3]], show: ['velocity', 'trace', 'takeoffLine', 'apexLine', 'halves', 'live'] },
  land: { play: [['touch', 'low', 0.18], ['low', 'end', 0.8]], show: ['forces', 'landing', 'live'], sounds: [['touch', 'step']] },
  measure: { at: 'end', show: ['flight', 'formula'], formula: 'measure' },
  derive: { at: 'end', show: ['flight', 'halves', 'ghost', 'formula'], formula: 'derive' },
  height: { at: 'end', show: ['ghost', 'flight', 'formula'], formula: 'height' },
  speed: { at: 'end', show: ['ghost', 'flight', 'formula'], formula: 'speed' },
  outro: { at: 'end', show: ['ghost', 'flight', 'formula'], formula: 'all' },
};

/* ---------- Fyzika skoku ---------- */

const NT = 240;
function table(fn) {
  const a = new Float64Array(NT + 1);
  for (let i = 0; i <= NT; i++) a[i] = fn(i / NT);
  return a;
}
// hodnota z tabulky v bodě u ∈ [0, 1]
function at(tab, u) {
  const n = tab.length - 1;
  const x = Math.max(0, Math.min(1, u)) * n;
  const i = Math.min(n - 1, Math.floor(x));
  return tab[i] + (tab[i + 1] - tab[i]) * (x - i);
}
// obrácená tabulka: kde rostoucí tabulka dosáhne hodnoty y (vrací u ∈ [0, 1])
function inverse(tab, y) {
  const n = tab.length - 1;
  if (y <= tab[0]) return 0;
  if (y >= tab[n]) return 1;
  let lo = 0;
  let hi = n;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (tab[mid] < y) lo = mid;
    else hi = mid;
  }
  return (lo + (y - tab[lo]) / (tab[hi] - tab[lo])) / n;
}

const pushShape = (tau, beta) => (1 - tau ** 10) * (1 + beta * Math.pow(Math.sin(Math.PI * tau), 0.6));
const LAND_PEAK = 0.16;
const landShape = (tau) => {
  const q = tau / LAND_PEAK;
  return q * q * Math.exp(2 * (1 - q));
};

export class JumpModel {
  constructor({ flightTime = 0.58, mass = 70, height = 1.78 } = {}) {
    this.tl = flightTime;
    this.m = mass;
    this.body = makeBody({ style: 'sport', height, mass });
    this.v0 = (G * this.tl) / 2;
    this.h = (G * this.tl * this.tl) / 8;
    this.mg = mass * G;
    const ground = { ground: 0, x: 0, anchor: 'ball' };
    this.ground = ground;
    const comOf = (p) => centerOfMass(pose(this.body, p, ground));

    // dráhy póz: odraz (nejdřív kolena a kyčle, nakonec kotníky), dopad (pata dolů, pak kolena)
    this.pushPose = (u) => (u < 0.72 ? lerpPose(POSES.squat, POSES.ext, u / 0.72) : lerpPose(POSES.ext, POSES.takeoff, (u - 0.72) / 0.28));
    this.landPose = (u) => (u < 0.22 ? lerpPose(POSES.takeoff, POSES.landFlat, u / 0.22) : lerpPose(POSES.landFlat, POSES.landLow, (u - 0.22) / 0.78));
    this.pushCom = table((u) => comOf(this.pushPose(u))[1]);
    this.landCom = table((u) => -comOf(this.landPose(u))[1]);   // rostoucí (záporná výška)
    this.d = this.pushCom[NT] - this.pushCom[0];                 // dráha těžiště při odrazu
    this.dl = this.landCom[NT] - this.landCom[0];                // dráha těžiště při brzdění
    const off = comOf(POSES.takeoff);
    this.xc = off[0];
    this.y0 = off[1];

    // odraz: tvar síly (β) a doba (tp) tak, aby těžiště na dráze d dosáhlo rychlosti v0
    const integ = (beta) => {
      let I1 = 0;
      let I2 = 0;
      const M = 400;
      for (let i = 0; i < M; i++) {
        const tau = (i + 0.5) / M;
        const e = pushShape(tau, beta) - 1;
        I1 += e / M;
        I2 += ((1 - tau) * e) / M;
      }
      return [I1, I2];
    };
    const target = (G * this.d) / (this.v0 * this.v0);
    let lo = 0.2;
    let hi = 60;
    for (let k = 0; k < 60; k++) {
      const mid = (lo + hi) / 2;
      const [I1, I2] = integ(mid);
      if (I1 <= 0 || I2 / (I1 * I1) > target) lo = mid;
      else hi = mid;
    }
    this.beta = (lo + hi) / 2;
    const [I1] = integ(this.beta);
    this.tp = this.v0 / (G * I1);
    // kinematika odrazu (tabulky po τ)
    const M = 600;
    this.pushV = new Float64Array(M + 1);
    this.pushX = new Float64Array(M + 1);
    for (let i = 1; i <= M; i++) {
      const t0 = (i - 1) / M;
      const t1 = i / M;
      const a0 = G * (pushShape(t0, this.beta) - 1);
      const a1 = G * (pushShape(t1, this.beta) - 1);
      this.pushV[i] = this.pushV[i - 1] + ((a0 + a1) / 2) * (this.tp / M);
      this.pushX[i] = this.pushX[i - 1] + ((this.pushV[i - 1] + this.pushV[i]) / 2) * (this.tp / M);
    }
    const fixX = this.d / this.pushX[M];
    for (let i = 0; i <= M; i++) this.pushX[i] *= fixX;
    this.fmax = 0;
    for (let i = 0; i <= 200; i++) this.fmax = Math.max(this.fmax, pushShape(i / 200, this.beta));

    // dopad: špička síly a doba brzdění tak, aby se těžiště na dráze dl zastavilo
    let J1 = 0;
    let J2 = 0;
    for (let i = 0; i < 400; i++) {
      const tau = (i + 0.5) / 400;
      J1 += landShape(tau) / 400;
      J2 += ((1 - tau) * landShape(tau)) / 400;
    }
    this.tland = this.dl / (this.v0 * (1 - J2 / J1));
    this.A = this.v0 / (G * this.tland * J1);
    this.landV = new Float64Array(M + 1);
    this.landX = new Float64Array(M + 1);
    this.landV[0] = -this.v0;
    for (let i = 1; i <= M; i++) {
      const a0 = G * this.A * landShape((i - 1) / M);
      const a1 = G * this.A * landShape(i / M);
      this.landV[i] = this.landV[i - 1] + ((a0 + a1) / 2) * (this.tland / M);
      this.landX[i] = this.landX[i - 1] + ((this.landV[i - 1] + this.landV[i]) / 2) * (this.tland / M);
    }
    const fixL = -this.dl / this.landX[M];
    for (let i = 0; i <= M; i++) this.landX[i] *= fixL;
    this.flmax = 1 + this.A;

    // časová osa (s)
    const T = { start: 0, down: 1.0, squat: 2.0, push: 3.0 };
    T.off = T.push + this.tp;
    T.apex = T.off + this.tl / 2;
    T.touch = T.off + this.tl;
    T.low = T.touch + this.tland;
    T.up = T.low + 1.0;
    T.end = T.up + 0.4;
    this.T = T;

    // spuštění do podřepu a narovnání po dopadu: póza plynule, síla z pohybu těžiště (F = m · (g + a))
    const slow = (fromPose, toPose, t0, t1) => {
      const n = 200;
      const ys = new Float64Array(n + 1);
      for (let i = 0; i <= n; i++) ys[i] = comOf(lerpPose(fromPose, toPose, smoother(i / n)))[1];
      const dt = (t1 - t0) / n;
      const v = new Float64Array(n + 1);
      const f = new Float64Array(n + 1);
      for (let i = 0; i <= n; i++) {
        const a = Math.max(0, i - 1);
        const b = Math.min(n, i + 1);
        v[i] = (ys[b] - ys[a]) / ((b - a) * dt);
        const acc = i > 0 && i < n ? (ys[i + 1] - 2 * ys[i] + ys[i - 1]) / (dt * dt) : 0;
        f[i] = this.mg + this.m * acc;
      }
      return { v, f };
    };
    this.downK = slow(POSES.stand, POSES.squat, T.down, T.squat);
    this.upK = slow(POSES.landLow, POSES.stand, T.low, T.up);

    // graf: okno od chvíle před odrazem do konce brzdění
    this.win = [T.push - 0.55, T.low + 0.5];
  }

  /* Stav v čase t: póza, umístění, síla plošiny F (N), svislá rychlost těžiště v (m/s), fáze. */
  state(t) {
    const T = this.T;
    const g = this.ground;
    if (t < T.down) return { pose: POSES.stand, place: g, F: this.mg, v: 0, phase: 'stand' };
    if (t < T.squat) {
      const u = (t - T.down) / (T.squat - T.down);
      return { pose: lerpPose(POSES.stand, POSES.squat, smoother(u)), place: g, F: at(this.downK.f, u), v: at(this.downK.v, u), phase: 'down' };
    }
    if (t < T.push) return { pose: POSES.squat, place: g, F: this.mg, v: 0, phase: 'hold' };
    if (t < T.off) {
      const tau = (t - T.push) / this.tp;
      const u = inverse(this.pushCom, this.pushCom[0] + at(this.pushX, tau));
      return { pose: this.pushPose(u), place: g, F: this.mg * pushShape(tau, this.beta), v: at(this.pushV, tau), phase: 'push' };
    }
    if (t < T.touch) {
      const s = t - T.off;
      const y = this.y0 + this.v0 * s - 0.5 * G * s * s;
      const w = Math.pow(Math.sin((Math.PI * s) / this.tl), 1.5) * 0.85;
      return { pose: lerpPose(POSES.takeoff, POSES.air, w), place: { com: [this.xc, y] }, F: 0, v: this.v0 - G * s, phase: 'air', y };
    }
    if (t < T.low) {
      const tau = (t - T.touch) / this.tland;
      const u = inverse(this.landCom, this.landCom[0] - at(this.landX, tau));
      return { pose: this.landPose(u), place: g, F: this.mg * (1 + this.A * landShape(tau)), v: at(this.landV, tau), phase: 'land' };
    }
    if (t < T.up) {
      const u = (t - T.low) / (T.up - T.low);
      return { pose: lerpPose(POSES.landLow, POSES.stand, smoother(u)), place: g, F: at(this.upK.f, u), v: at(this.upK.v, u), phase: 'up' };
    }
    return { pose: POSES.stand, place: g, F: this.mg, v: 0, phase: 'stand' };
  }

  /* Hodnoty pro texty kroků. */
  values(jumper) {
    return {
      jumper: jumper || '',
      t: fmt(this.tl, 2),
      th: fmt(this.tl / 2, 2),
      v: fmt(this.v0, 1),
      kmh: fmt(this.v0 * 3.6, 0),
      h: fmt(this.h * 100, 0),
      hm: fmt(this.h, 2),
      m: fmt(this.m, 0),
      G: fmtN(Math.round(this.mg / 10) * 10),
      fmax: fmt(this.fmax, 1),
      tp: fmt(this.tp, 2),
      flmax: fmt(this.flmax, 1),
      J: fmtN(this.m * this.v0),
    };
  }
}

/* ---------- Kreslení ---------- */

export default class JumpExplainer extends Explainer {
  constructor(canvas, def) {
    super(canvas, def);
    this.model = new JumpModel({ flightTime: def.flightTime, mass: def.mass, height: def.height });
    this.vals = this.model.values(def.jumper);
    this.T = this.model.T;
    this.scenes = SCENES;
    this.graphTitle = 'SÍLA POD NOHAMA (N) – silová plošina';
    this.samples = this.sampleGraph();
  }

  layout(L) {
    this.view = VIEWS[L.name];
  }

  sampleGraph() {
    const [a, b] = this.model.win;
    const n = 700;
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = a + ((b - a) * i) / n;
      out.push([t, this.model.state(t).F]);
    }
    return out;
  }

  X(p) {
    const v = this.view;
    return [v.ox + p[0] * v.s, v.oy - p[1] * v.s];
  }

  paintStageBackground(g, L) {
    const S = L.stage;
    const v = this.view;
    const wall = g.createLinearGradient(0, S.y, 0, v.oy);
    wall.addColorStop(0, '#0b1220');
    wall.addColorStop(1, '#17233a');
    g.fillStyle = wall;
    g.fillRect(S.x, S.y, S.w, S.h);
    // měřicí mřížka za skokanem (10 cm, silněji po 50 cm)
    const X = (x, y) => this.X([x, y]);
    for (let i = 0; i <= 26; i++) {
      const y = i * 0.1;
      const [x0, yy] = X(-1.2, y);
      const [x1] = X(1.45, y);
      if (yy < S.y + 6) continue;
      g.strokeStyle = i % 5 === 0 ? 'rgba(150,200,255,0.2)' : 'rgba(150,200,255,0.07)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x0, yy + 0.5);
      g.lineTo(x1, yy + 0.5);
      g.stroke();
      if (i % 5 === 0 && i > 0) {
        g.fillStyle = 'rgba(170,210,255,0.55)';
        g.font = this.font(600, 12, true);
        g.textAlign = 'left';
        g.textBaseline = 'middle';
        g.fillText(`${i * 10} cm`, 8, yy);
      }
    }
    for (let i = -12; i <= 14; i++) {
      const [xx, y0] = X(i * 0.1, 0);
      const [, y1] = X(i * 0.1, 2.6);
      g.strokeStyle = i % 5 === 0 ? 'rgba(150,200,255,0.14)' : 'rgba(150,200,255,0.05)';
      g.beginPath();
      g.moveTo(xx + 0.5, y0);
      g.lineTo(xx + 0.5, Math.max(S.y, y1));
      g.stroke();
    }
    // podlaha a silová plošina
    const floor = g.createLinearGradient(0, v.oy, 0, S.y + S.h);
    floor.addColorStop(0, '#1b2433');
    floor.addColorStop(1, '#0c111a');
    g.fillStyle = floor;
    g.fillRect(S.x, v.oy, S.w, S.y + S.h - v.oy);
    const [px0, py] = X(-0.34, 0);
    const [px1] = X(0.38, 0);
    const plate = g.createLinearGradient(0, py, 0, py + 14);
    plate.addColorStop(0, '#8a96a8');
    plate.addColorStop(1, '#3d4656');
    g.fillStyle = plate;
    g.fillRect(px0, py, px1 - px0, 12);
    g.fillStyle = '#c7d2e2';
    g.fillRect(px0, py, px1 - px0, 2);
    g.fillStyle = 'rgba(10,14,22,0.7)';
    g.font = this.font(700, 9, true);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('SILOVÁ PLOŠINA', (px0 + px1) / 2, py + 7.5);
  }

  /* Kabel od plošiny k monitoru. */
  paintBackgroundExtra(g, L) {
    const [, py] = this.X([0, 0]);
    const [px1] = this.X([0.38, 0]);
    g.strokeStyle = '#0a0d14';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(px1, py + 8);
    if (L.name === 'wide') g.bezierCurveTo(px1 + 60, py + 40, 520, py + 40, L.stage.w, py + 24);
    else {
      const mx = L.monitor.x + L.monitor.w - 40;
      g.bezierCurveTo(px1 + 50, py + 26, mx, py + 10, mx, L.monitor.y - 6);
    }
    g.stroke();
  }

  paintStage(ctx, t, show) {
    const m = this.model;
    const st = m.state(t);
    const sk = pose(m.body, st.pose, st.place);
    const com = centerOfMass(sk);
    const X = (p) => this.X(p);
    this.st = st;
    this.paintStageBack(ctx, X, t, show);
    if (show.has('ghost')) {
      const ap = m.state(m.T.apex);
      drawBody(ctx, pose(m.body, ap.pose, ap.place), this.view, { alpha: 0.28 });
    }
    drawBody(ctx, sk, this.view, { shadow: 0 });
    this.paintStageFront(ctx, X, t, st, com, show);
  }

  paintStageBack(ctx, X, t, show) {
    const m = this.model;
    const lineAt = (y, text, col) => {
      const [x0, yy] = X([-1.0, y]);
      const [x1] = X([1.4, y]);
      this.hline(ctx, x0, x1, yy, text, col);
    };
    if (show.has('takeoffLine') || show.has('ghost')) lineAt(m.y0, 'těžiště při odrazu', 'rgba(255,210,138,0.7)');
    if (show.has('apexLine') || show.has('ghost')) lineAt(m.y0 + m.h, 'vrchol', 'rgba(126,224,129,0.75)');
  }

  paintStageFront(ctx, X, t, st, com, show) {
    const m = this.model;
    const s = this.view.s;
    const kN = ARROW_N * (s / 158);
    const kV = ARROW_V * (s / 158);
    const sf = this.L.sf;
    const [cx, cy] = X(com);
    if (show.has('trace') && t > m.T.off) {
      // stopa těžiště po 29 ms (jako stroboskop)
      const t1 = Math.min(t, m.T.touch);
      for (let q = 0; q <= t1 - m.T.off + 1e-9; q += 0.029) {
        const y = m.y0 + m.v0 * q - 0.5 * G * q * q;
        const [x, yy] = X([m.xc, y]);
        ctx.fillStyle = 'rgba(5,8,14,0.6)';
        ctx.beginPath();
        ctx.arc(x, yy, 3.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#6fd6ff';
        ctx.beginPath();
        ctx.arc(x, yy, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (show.has('forces')) {
      const up = st.F * kN;
      const dn = m.mg * kN;
      this.arrow(ctx, cx + 7, cy, cx + 7, cy - up, '#7ee081', 5);
      this.arrow(ctx, cx - 7, cy, cx - 7, cy + dn, '#ff6b5e', 5);
      if (up > 4) this.tag(ctx, `síla plošiny ${fmtN(st.F)} N`, cx + 18, cy - Math.max(up, 26 * sf) + 4, '#9df09f');
      this.tag(ctx, `tíha ${fmtN(m.mg)} N`, cx - 18, cy + dn - 6, '#ff9a90', 'right');
    }
    if (show.has('velocity') && Math.abs(st.v) > 0.02) {
      const vx = cx + 0.42 * s;
      this.arrow(ctx, vx, cy, vx, cy - st.v * kV, '#6fd6ff', 5);
      this.tag(ctx, `v = ${fmt(Math.abs(st.v), 1)} m/s`, vx + 12, cy - st.v * kV * 0.5, '#9fe3ff');
    }
    if (show.has('rise') && t >= m.T.off) {
      // výška těžiště nad odrazem
      const y = st.phase === 'air' ? st.y : m.y0;
      const [, y0] = X([0, m.y0]);
      const [, y1] = X([0, y]);
      if (y1 < y0 - 4) this.vdim(ctx, cx - 0.55 * s, y0, y1, `+${fmt((y - m.y0) * 100, 0)} cm`, '#ffd28a');
    }
    if (show.has('ghost')) {
      const [, y0] = X([0, m.y0]);
      const [, y1] = X([0, m.y0 + m.h]);
      this.vdim(ctx, X([m.xc - 0.55, 0])[0], y0, y1, `h = ${this.vals.h} cm`, '#ffd28a');
    }
    this.comMark(ctx, cx, cy);
  }

  paintGraph(ctx, t, show) {
    const m = this.model;
    const R = this.L.graph;
    const [ta, tb] = m.win;
    const fMax = Math.max(2000, Math.ceil((m.mg * Math.max(m.flmax, m.fmax) * 1.05) / 250) * 250);
    const gx = (tt) => R.x + ((tt - ta) / (tb - ta)) * R.w;
    const gy = (F) => R.y + R.h - (F / fMax) * R.h;
    // mřížka a osy
    ctx.font = this.font(600, 11);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let F = 0; F <= fMax; F += this.tall ? 1000 : 500) {
      const y = gy(F);
      ctx.strokeStyle = F === 0 ? 'rgba(160,210,255,0.5)' : 'rgba(160,210,255,0.1)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(R.x, y + 0.5);
      ctx.lineTo(R.x + R.w, y + 0.5);
      ctx.stroke();
      ctx.fillStyle = 'rgba(160,210,255,0.6)';
      ctx.fillText(fmtN(F), R.x - 4, y);
    }
    // měřítko času
    const sx0 = R.x + R.w - 6 - ((0.1 / (tb - ta)) * R.w);
    const sx1 = R.x + R.w - 6;
    const sy = R.y + R.h + (this.tall ? 12 : 14);
    ctx.strokeStyle = 'rgba(160,210,255,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx0, sy);
    ctx.lineTo(sx1, sy);
    ctx.stroke();
    ctx.fillStyle = 'rgba(160,210,255,0.75)';
    ctx.textAlign = 'right';
    ctx.fillText('0,1 s', sx0 - 4, sy);
    // tíha
    const yBW = gy(m.mg);
    ctx.save();
    ctx.strokeStyle = 'rgba(255,107,94,0.85)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(R.x, yBW);
    ctx.lineTo(R.x + R.w, yBW);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#ff9a90';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`tíha ${fmtN(m.mg)} N`, R.x + 4, yBW - 2);

    const tNow = Math.min(t, tb);
    const pts = this.samples.filter(([tt]) => tt <= tNow + 1e-9);
    // impulz: plocha nad čarou tíhy během odrazu
    if ((show.has('impulse') || show.has('impulseFill')) && t > m.T.push) {
      const t1 = Math.min(t, m.T.off);
      ctx.fillStyle = show.has('impulse') ? 'rgba(126,224,129,0.45)' : 'rgba(126,224,129,0.28)';
      ctx.beginPath();
      ctx.moveTo(gx(m.T.push), yBW);
      for (const [tt, F] of this.samples) {
        if (tt < m.T.push || tt > t1) continue;
        ctx.lineTo(gx(tt), gy(Math.max(F, m.mg)));
      }
      ctx.lineTo(gx(t1), yBW);
      ctx.closePath();
      ctx.fill();
      if (show.has('impulse')) {
        ctx.fillStyle = '#b9f5bb';
        ctx.font = this.font(700, 13);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('impulz', gx((m.T.push + m.T.off) / 2), gy(m.mg * m.fmax) - 4);
      }
    }
    // křivka síly
    if (pts.length > 1) {
      ctx.strokeStyle = '#6fd6ff';
      ctx.lineWidth = 2.4;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      pts.forEach(([tt, F], i) => (i ? ctx.lineTo(gx(tt), gy(F)) : ctx.moveTo(gx(tt), gy(F))));
      ctx.stroke();
    }
    // úseky: let (a jeho poloviny), dopad – závorka nad nulou (v mezeře, kdy nohy nejsou na zemi)
    const bracket = (t0, t1, y, text, col) => {
      const x0 = gx(t0);
      const x1 = gx(t1);
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x0, y + 5);
      ctx.lineTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.lineTo(x1, y + 5);
      ctx.stroke();
      ctx.fillStyle = col;
      ctx.font = this.font(700, 12);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(text, (x0 + x1) / 2, y - 2);
    };
    const off1 = this.tall ? 10 : 12;
    const off2 = this.tall ? 32 : 36;
    const yB = gy(0) - off1;
    if ((show.has('flight') || show.has('halves')) && t >= m.T.touch - 1e-6) {
      if (show.has('halves')) {
        bracket(m.T.off, m.T.apex, yB, 't/2', '#ffd28a');
        bracket(m.T.apex, m.T.touch, yB, 't/2', '#ffd28a');
      }
      bracket(m.T.off, m.T.touch, gy(0) - (show.has('halves') ? off2 : off1), `let t = ${this.vals.t} s`, '#ffe9b8');
    } else if (show.has('halves') && t > m.T.apex) {
      bracket(m.T.off, m.T.apex, yB, 't/2', '#ffd28a');
      bracket(m.T.apex, Math.min(t, m.T.touch), yB, 't/2', '#ffd28a');
    }
    if (show.has('landing') && t > m.T.touch + 0.03) {
      ctx.fillStyle = '#ffb35c';
      ctx.font = this.font(700, 12);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('dopad', gx(m.T.touch + m.tland * LAND_PEAK) + 6, gy(m.mg * m.flmax) + 2);
    }
    // ukazatel času
    ctx.fillStyle = '#ffffff';
    if (t >= ta && t <= tb) {
      const x = gx(t);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, R.y);
      ctx.lineTo(x, R.y + R.h);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, gy(m.state(t).F), 3.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (t < ta) {
      ctx.beginPath();
      ctx.arc(R.x, gy(m.state(t).F), 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  paintBoard(ctx, t, show, scene) {
    const m = this.model;
    const st = this.st || m.state(t);
    if (show.has('formula')) {
      this.boardLines(ctx, this.formula(scene.formula));
      return;
    }
    if (!show.has('live')) {
      this.boardNote(ctx, this.def.jumper ? `Záznam: ${this.def.jumper}` : 'Záznam skoku', `hmotnost ${fmt(m.m, 0)} kg · doba letu ${this.vals.t} s`);
      return;
    }
    const arrowCh = st.v > 0.02 ? '↑' : st.v < -0.02 ? '↓' : '';
    const flight = t < m.T.off ? '–' : `${fmt(Math.min(t, m.T.touch) - m.T.off, 2)} s`;
    const rise = st.phase === 'air' ? `+${fmt((st.y - m.y0) * 100, 0)} cm` : t >= m.T.touch ? `nejvýš +${this.vals.h} cm` : '–';
    this.boardRows(ctx, [
      ['síla plošiny', `${fmtN(st.F)} N (${fmt(st.F / m.mg, 1)} × tíha)`, '#7ee081'],
      ['rychlost těžiště', `${fmt(Math.abs(st.v), 1)} m/s ${arrowCh}`.trim(), '#6fd6ff'],
      ['čas ve vzduchu', flight, '#ffe9b8'],
      ['těžiště nad odrazem', rise, '#ffd28a'],
    ]);
  }

  formula(kind) {
    const v = this.vals;
    const big = (text, col) => this.big(text, col);
    const small = (text) => this.small(text);
    switch (kind) {
      case 'measure':
        return [small('Kontaktní deska změří jen dobu letu:'), big(`t = ${v.t} s`, '#ffe9b8'), small('(od odlepení špiček do dopadu)')];
      case 'derive':
        return [small('Pád z vrcholu trvá t/2:'), big('h = ½ · g · (t/2)²', '#e8f2ff'), big('h = g · t² / 8', '#ffd28a')];
      case 'height':
        return [big('h = g · t² / 8'), big(`h = 9,81 · ${v.t}² / 8`, '#e8f2ff'), big(`h = ${v.hm} m = ${v.h} cm`, '#ffd28a')];
      case 'speed':
        return [big('v = g · t / 2'), big(`v = 9,81 · ${v.t} / 2`, '#e8f2ff'), big(`v = ${v.v} m/s`, '#6fd6ff')];
      default:
        return [big('h = g · t² / 8', '#ffd28a'), big('v = g · t / 2', '#6fd6ff'), small('t … doba letu (s), g = 9,81 m/s²'), small('h vyjde v metrech')];
    }
  }
}
