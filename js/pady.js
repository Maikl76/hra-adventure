/*
 * Pádová technika (Vojenská tělovýchova – pěchotní srub, Brána V): kresba k aktivitě „fall“.
 *
 * Svob. Hanák (js/postava.js) z boku padá vzad na žíněnku. Hráč volí techniku: nejdřív dřep
 * (těžiště padá z menší výšky → menší rychlost dopadu v = √(2 · g · h)), kulatá záda a převal
 * (delší brzdění t → menší průměrná síla F = m · v / t), plácnutí rukama (větší plocha S →
 * menší tlak p = F / S) a bradu na hruď (hlava nenarazí). Pro srovnání pád na nataženou ruku:
 * na ruku připadne jen horní část těla, ale zastaví se rychle a na malé ploše dlaně.
 * Čísla počítá fallResult (ui.js i scéna); animace jen ukazuje, co se děje. Plátno 600 × 340.
 */
import { makeBody, pose, drawBody, lerpPose } from './postava.js?v=0.34';
import { fmt, setupCanvas, label } from './kresba.js?v=0.34';

const W = 600;
const H = 340;
const S = 150;
const FLOOR = 300;
const OX = 360;

/* Výchozí čísla modelu (game.json je může přepsat). */
export const FALL = {
  mass: 80,            // kg
  hStand: 0.9,         // pokles těžiště při pádu ze stoje (m)
  hSquat: 0.5,         // po dřepu (m)
  tStiff: 0.06,        // brzdění tvrdě na záda (s)
  tRoll: 0.2,          // s kulatými zády a převalem (s)
  sBack: 0.1,          // dotyková plocha bez plácnutí (m²)
  sSlap: 0.3,          // se záky a rukama (m²)
  handMass: 25,        // na ruku připadne horní část těla (kg)
  tHand: 0.05,
  sHand: 0.01,
};

/* Výsledek pádu: o = { squat, roll, slap, chin, hand } */
export function fallResult(o, P = FALL) {
  const g = 9.81;
  if (o.hand) {
    const v = Math.sqrt(2 * g * P.hStand);
    const F = (P.handMass * v) / P.tHand;
    return { h: P.hStand, v, t: P.tHand, m: P.handMass, S: P.sHand, F, p: F / P.sHand, head: true };
  }
  const h = o.squat ? P.hSquat : P.hStand;
  const v = Math.sqrt(2 * g * h);
  const t = o.roll ? P.tRoll : P.tStiff;
  const Sx = o.slap ? P.sSlap : P.sBack;
  const F = (P.mass * v) / t;
  return { h, v, t, m: P.mass, S: Sx, F, p: F / Sx, head: Boolean(o.chin) };
}

/* Pózy (úhly jako v js/postava.js; Hanák hledí doprava, padá dozadu doleva). */
const POSES = {
  stand: { trunk: 2, neck: 0, thigh: 0, shin: 2, uarm: 6, farm: 10, hand: 10 },
  squat: { trunk: 38, bend: 26, neck: 30, thigh: 82, shin: 48, uarm: 82, farm: 84, hand: 84, far: { thigh: 80, shin: 46, uarm: 78, farm: 80 } },
  sit: { trunk: -18, bend: 30, neck: 34, thigh: 140, shin: -30, foot: 30, toeFlat: 0, uarm: 70, farm: 80, hand: 80, far: { thigh: 136, shin: -34, uarm: 66, farm: 76 } },
  roll: { trunk: -74, bend: 40, neck: 40, thigh: 150, shin: 40, foot: 0, toeFlat: 0, uarm: 140, farm: 150, hand: 150, far: { thigh: 146, shin: 36, uarm: 136, farm: 146 } },
  rollSlap: { trunk: -74, bend: 40, neck: 40, thigh: 150, shin: 40, foot: 0, toeFlat: 0, uarm: 66, farm: 66, hand: 66, far: { thigh: 146, shin: 36, uarm: 70, farm: 70 } },
  flat: { trunk: -90, bend: 0, neck: 30, thigh: 92, shin: -88, foot: 0, toeFlat: 0, uarm: 40, farm: 60, hand: 60, far: { thigh: 90, shin: -90, uarm: 36, farm: 56 } },
  flatSlap: { trunk: -90, bend: 0, neck: 30, thigh: 92, shin: -88, foot: 0, toeFlat: 0, uarm: 98, farm: 96, hand: 96, far: { thigh: 90, shin: -90, uarm: 100, farm: 98 } },
  hand: { trunk: -45, bend: 6, neck: -6, thigh: 120, shin: -30, foot: 20, toeFlat: 0, uarm: -24, farm: -24, hand: -40, far: { thigh: 114, shin: -34, uarm: 40, farm: 50 } },
};

const smooth = (u) => u * u * (3 - 2 * u);
const mix = (a, b, u) => a + (b - a) * u;

export class FallScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.body = makeBody({ style: 'uniforma', height: 1.8, mass: 80, colors: { jacket: '#5d6f84', hair: '#4a3020' } });
    this.view = { ox: OX, oy: FLOOR + 4, s: S };
    this.hip0 = pose(this.body, POSES.stand, { ground: 0, x: 0 }).hip;
    this.st = { o: { squat: false, roll: false, slap: false, chin: false }, t: 0, res: null };
    this.cv = setupCanvas(canvas, W, H, (changed) => {
      if (changed) this.bg = null;
      this.render();
    });
  }

  destroy() {
    this.cv.destroy();
  }

  /* Stav z ui.js: { o: { squat, roll, slap, chin, hand }, t (0–1 animace), res (fallResult po dopadu) } */
  set(st) {
    this.st = { ...this.st, ...st };
    this.render();
  }

  /* Póza a kyčel v čase t (0 = stojí, 1 = leží). */
  frame(t) {
    const o = this.st.o;
    const h0 = this.hip0;
    const neckEnd = o.chin ? null : -24;
    if (o.hand) {
      const u = smooth(Math.min(1, t / 0.8));
      const p = lerpPose(POSES.stand, POSES.hand, u);
      return { p, hip: [mix(h0[0], -0.25, u), mix(h0[1], 0.25, u)] };
    }
    const end = o.roll ? (o.slap ? POSES.rollSlap : POSES.roll) : (o.slap ? POSES.flatSlap : POSES.flat);
    const endHip = o.roll ? [-0.42, 0.16] : [-0.62, 0.12];
    const fix = (p) => (neckEnd === null ? p : { ...p, neck: mix(p.neck, neckEnd, Math.min(1, t * 1.4)) });
    if (o.squat) {
      if (t < 0.28) {
        const u = smooth(t / 0.28);
        return { p: fix(lerpPose(POSES.stand, POSES.squat, u)), hip: [mix(h0[0], -0.06, u), mix(h0[1], 0.5, u)] };
      }
      if (t < 0.58) {
        const u = smooth((t - 0.28) / 0.3);
        return { p: fix(lerpPose(POSES.squat, POSES.sit, u)), hip: [mix(-0.06, -0.2, u), mix(0.5, 0.12, u)] };
      }
      const u = smooth(Math.min(1, (t - 0.58) / 0.32));
      return { p: fix(lerpPose(POSES.sit, end, u)), hip: [mix(-0.2, endHip[0], u), mix(0.12, endHip[1], u)] };
    }
    // bez dřepu: celé tělo padá dozadu jako kmen
    const u = smooth(Math.min(1, t / 0.7));
    return { p: fix(lerpPose(POSES.stand, end, u)), hip: [mix(h0[0], endHip[0], u), mix(h0[1], endHip[1], u)] };
  }

  render() {
    if (!this.cv) return;
    const ctx = this.ctx;
    const dpr = this.cv.dpr;
    const ts = this.cv.ts;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!this.bg) this.bg = this.paintHall();
    ctx.drawImage(this.bg, 0, 0, W, H);
    const st = this.st;
    const fr = this.frame(st.t);
    const sk = pose(this.body, fr.p, { hip: fr.hip });
    const X = (q) => [this.view.ox + q[0] * S, this.view.oy - q[1] * S];
    // dotyková plocha zad po dopadu (čím širší, tím menší tlak)
    if (st.res && !st.o.hand) {
      const a = X(sk.hip);
      const b = X(sk.shoulder);
      ctx.save();
      ctx.strokeStyle = st.o.slap ? 'rgba(126,224,129,0.75)' : 'rgba(224,128,95,0.85)';
      ctx.lineWidth = st.o.slap ? 12 : 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(Math.min(a[0], b[0]) - 6, FLOOR + 3);
      ctx.lineTo(Math.max(a[0], b[0]) + (st.o.slap ? 40 : 6), FLOOR + 3);
      ctx.stroke();
      ctx.restore();
    }
    drawBody(ctx, sk, this.view, { ow: 1.8, shadow: 0 });
    if (st.res) {
      const r = st.res;
      if (st.o.hand) {
        const w = X(sk.armN.wrist);
        this.burst(ctx, w, '#ff6a55');
        label(ctx, `zápěstí ${fmt(r.F / 1000, 1)} kN!`, w[0] + 10, w[1] - 22, '#ffc0a8', { align: 'left', ts, W, size: 12 });
      } else {
        if (!r.head) {
          const hd = X(sk.head);
          this.burst(ctx, [hd[0] - 6, FLOOR - 2], '#ff6a55');
          label(ctx, 'hlava!', hd[0] - 10, FLOOR - 40, '#ffc0a8', { align: 'right', ts, W, size: 12 });
        }
        if (st.o.slap) {
          const w = X(sk.armN.wrist);
          this.burst(ctx, w, '#fff0c0');
          label(ctx, 'plesk!', w[0] + 8, w[1] - 24, '#ffe2a8', { align: 'left', ts, W, size: 12 });
        }
      }
    }
    this.canvas.setAttribute('aria-label', st.res ? `Pád vzad: dopad ${fmt(st.res.v, 1)} m/s, síla ${fmt(st.res.F)} N, tlak ${fmt(st.res.p / 1000, 1)} kPa${st.res.head ? '' : ', hlava narazila'}.` : 'Svobodník Hanák stojí na žíněnce a čeká na povel k pádu vzad.');
  }

  burst(ctx, c, col) {
    ctx.save();
    ctx.strokeStyle = col;
    ctx.lineWidth = 2.5;
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * (1 + i / 6);
      ctx.beginPath();
      ctx.moveTo(c[0] + Math.cos(a) * 9, c[1] + Math.sin(a) * 9);
      ctx.lineTo(c[0] + Math.cos(a) * 20, c[1] + Math.sin(a) * 20);
      ctx.stroke();
    }
    ctx.restore();
  }

  paintHall() {
    const c = document.createElement('canvas');
    const dpr = this.cv.dpr;
    c.width = Math.round(W * dpr);
    c.height = Math.round(H * dpr);
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const wall = g.createLinearGradient(0, 0, 0, H);
    wall.addColorStop(0, '#6b6a63');
    wall.addColorStop(1, '#4e4d47');
    g.fillStyle = wall;
    g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(40,40,36,0.3)';
    for (let y = 26; y < FLOOR; y += 38) {
      g.beginPath();
      g.moveTo(0, y + 0.5);
      g.lineTo(W, y + 0.5);
      g.stroke();
    }
    g.fillStyle = '#2f5d7a';
    g.fillRect(0, FLOOR, W, 18);
    g.fillStyle = '#244a62';
    g.fillRect(0, FLOOR + 18, W, H - FLOOR - 18);
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(0, FLOOR, W, 2);
    return c;
  }
}
