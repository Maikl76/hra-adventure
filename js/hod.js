/*
 * Odhodový sektor (Vojenská tělovýchova – tělocvična): kresba k aktivitě „throw“.
 *
 * Kolo vsedě: voják sedí zády u stěny, nohy natažené, a tlačí medicinbal od hrudníku do bodu
 * odhodu (h0 nad zemí, x0 před stěnou); odtud míč letí po parabole. Kolo vestoje: vrhač
 * v uniformě odhodí granát švihem nad hlavou. Na 50m poli je postava ve skutečném měřítku malá,
 * proto je vpravo nahoře detail odhodu. Dolety a vyhodnocení počítá ui.js stejně jako dřív –
 * scéna dostane hotový hod (rychlosti, čas letu) a jen ho nakreslí a přehraje. Plátno 600 × 320.
 */
import { makeBody, pose, drawBody, lerpPose } from './postava.js?v=0.32';
import { rrect, fmt, setupCanvas, label, arrow, background } from './kresba.js?v=0.32';

const W = 600;
const H = 320;
const X0 = 46;                  // x = 0 (stěna, odhodová čára) na plátně
const Y0 = 268;                 // země
const G = 9.81;
const DEG = Math.PI / 180;
const BALL_R = 0.115;           // medicinbal 4 kg (poloměr, m)
const NADE = 0.12;              // cvičný granát (délka, m)
const INSET = { x: 392, y: 8, w: 200, h: 176, s: 56, ox: 488, gy: 166 };   // detail odhodu granátu
const PUSH_MS = 260;            // tlak od hrudníku / švih paže až do odhodu
const FOLLOW_MS = 300;          // dokončení švihu po odhodu
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (f) => f * f * (3 - 2 * f);
const add = (p, v, k = 1) => [p[0] + v[0] * k, p[1] + v[1] * k];
const rot = (v, a) => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)];
const unit = (v) => {
  const l = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / l, v[1] / l];
};
const angDown = (v) => Math.atan2(v[0], -v[1]) / DEG;

/* Sed u stěny: záda opřená, nohy natažené na zemi; paže se dopočítají k míči. */
const SEAT = {
  trunk: -3, bend: 4, neck: 6, head: -8, thigh: 90, shin: -90, foot: -72, toeFlat: 0,
  far: { thigh: 90, shin: -90, foot: -66, toeFlat: 0 },
};
const SEAT_HIP_Y = 0.095;       // kyčelní kloub vsedě nad podlahou (m)
/* Zadní obrys trupu (jako v postava.js) – podle něj a podle týla se postava přisune ke stěně. */
const BACK = [[-0.2, -0.1], [-0.04, -0.124], [0.12, -0.114], [0.31, -0.09], [0.5, -0.104], [0.68, -0.122], [0.86, -0.112]];

/* Odhod granátu (pravák, levá noha vpředu): nápřah, odhod nad hlavou, dokončení švihu. */
const COCK = {
  trunk: -10, bend: -4, neck: 0, head: -6, thigh: -18, shin: 12, foot: 4, toeFlat: 1,
  far: { thigh: 22, shin: -16, foot: 0, toeFlat: 1, uarm: 92, farm: 90, hand: 94, grip: 'open' },
};
const RELEASE = {
  trunk: 8, bend: 4, neck: -4, head: -8, thigh: -24, shin: 20, foot: 24, toeFlat: 1,
  far: { thigh: 18, shin: -10, foot: 0, toeFlat: 1, uarm: 34, farm: 52, hand: 56, grip: 'fist' },
};
const FOLLOW = {
  trunk: 24, bend: 10, neck: -2, head: -4, thigh: -26, shin: 34, foot: 50, toeFlat: 1,
  far: { thigh: 22, shin: -4, foot: 0, toeFlat: 1, uarm: -6, farm: 24, hand: 26, grip: 'fist' },
};
const COCK_HAND = [-0.3, 0.27];               // granát za hlavou (od ramene, m)
const FOLLOW_HAND = { th: 118, r: 0.6 };      // ruka po odhodu: úhel od svislice nahoru (°), vzdálenost (m)

/* Úhly paže (jako v postava.js), aby konec paže byl v bodě. bend +1 = loket dozadu (švih nad
   hlavou), −1 = loket dolů (tlak od hrudníku). */
function armTo(shoulder, target, L1, L2, bend) {
  const D = [target[0] - shoulder[0], target[1] - shoulder[1]];
  const dist = Math.hypot(D[0], D[1]) || 1e-6;
  const d = Math.max(Math.abs(L1 - L2) + 1e-4, Math.min(L1 + L2 - 1e-4, dist));
  const a = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
  const u = [D[0] / dist, D[1] / dist];
  const e = rot(u, a * bend);
  const elbow = add(shoulder, e, L1);
  const end = add(shoulder, u, d);
  return { uarm: angDown(e), farm: angDown([end[0] - elbow[0], end[1] - elbow[1]]) };
}

/* Medicinbal: kůže se švy, „spin“ = pootočení (rad). */
function paintBall(ctx, x, y, r, spin) {
  ctx.save();
  ctx.translate(x, y);
  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
  g.addColorStop(0, '#b27c4c');
  g.addColorStop(0.55, '#7a4a2a');
  g.addColorStop(1, '#3e2414');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(12,8,4,0.9)';
  ctx.lineWidth = Math.max(1, r * 0.1);
  ctx.stroke();
  ctx.rotate(spin);
  ctx.strokeStyle = 'rgba(30,16,8,0.7)';
  ctx.lineWidth = Math.max(0.8, r * 0.08);
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.4, r * 0.97, 0, 0, Math.PI * 2);
  ctx.moveTo(-r * 0.97, 0);
  ctx.lineTo(r * 0.97, 0);
  ctx.stroke();
  ctx.restore();
}

/* Cvičný granát: vejčitý trup, zapalovač s pákou; len = délka (px), ang = natočení (rad). */
function paintNade(ctx, x, y, len, ang) {
  const rx = len * 0.4;
  const ry = len * 0.3;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  const g = ctx.createRadialGradient(-rx * 0.4, -ry * 0.4, 0.5, 0, 0, rx);
  g.addColorStop(0, '#8d9659');
  g.addColorStop(1, '#383e22');
  ctx.fillStyle = g;
  ctx.strokeStyle = '#141610';
  ctx.lineWidth = Math.max(0.8, len * 0.06);
  ctx.beginPath();
  ctx.ellipse(-len * 0.08, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#9a988c';
  ctx.fillRect(len * 0.28, -ry * 0.42, len * 0.2, ry * 0.84);
  ctx.strokeRect(len * 0.28, -ry * 0.42, len * 0.2, ry * 0.84);
  ctx.strokeStyle = '#a8a69a';
  ctx.lineWidth = Math.max(0.8, len * 0.07);
  ctx.beginPath();
  ctx.moveTo(len * 0.44, -ry * 0.45);
  ctx.quadraticCurveTo(len * 0.1, -ry * 1.15, -len * 0.3, -ry * 0.85);
  ctx.stroke();
  ctx.restore();
}

/* Úhel odhodu: vodorovná čárkovaná čára, oblouk a popisek pod ní (šipku nezakryje při žádném úhlu). */
function paintAngle(ctx, R, deg, rArc, ts) {
  const th = deg * DEG;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,210,138,0.75)';
  ctx.lineWidth = 1.2;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(R[0], R[1]);
  ctx.lineTo(R[0] + rArc + 16, R[1]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(R[0], R[1], rArc, -th, 0);
  ctx.stroke();
  ctx.restore();
  label(ctx, `${Math.round(deg)}°`, R[0] + rArc * 0.55, R[1] + 11 * ts, '#ffd28a', { align: 'left', ts, W, size: 11 });
}

export class ThrowScene {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.reduced = !!opts.reducedMotion;
    this.sitter = makeBody({
      style: 'sport', height: 1.78, mass: 75,
      colors: { jacket: '#5c6a3a', shorts: '#26282a', shoe: '#3a3b38', sole: '#1e1f1d', accent: '#8a9a52', socks: '#d9d6cc' },
    });
    this.thrower = makeBody({ style: 'uniforma', height: 1.8, mass: 80 });
    this.r = null;
    this.angle = 45;
    this.throws = [];
    this.anim = null;
    this.raf = 0;
    this.frame = this.frame.bind(this);
    this.cv = setupCanvas(canvas, W, H, (changed) => {
      if (changed) this.bg = null;
      if (!this.anim) this.render();
    });
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.anim = null;
    this.cv.destroy();
  }

  /* Stav z ui.js: round (kolo z game.json), angle (°), throws – předchozí hody { x0, h0, vx, vy, t, d, a }. */
  set(st) {
    if (st.round !== this.r) {
      this.r = st.round;
      this.bg = null;
      this.prep();
    }
    this.angle = st.angle;
    this.throws = st.throws || [];
    if (!this.anim) this.render();
  }

  /* Přehraje hod { x0, h0, vx, vy, t, d }: tlak / švih paže, let; pak zavolá done(). */
  play(shot, done) {
    cancelAnimationFrame(this.raf);
    const fly = this.r.pose === 'sed' ? 900 : 1100;
    this.anim = { shot, done, t0: performance.now(), el: 0, push: this.reduced ? 0 : PUSH_MS, fly: this.reduced ? 0 : fly };
    this.raf = requestAnimationFrame(this.frame);
  }

  frame(now) {
    const a = this.anim;
    if (!a) return;
    a.el = Math.max(0, now - a.t0);
    if (a.el < a.push + a.fly) {
      this.render();
      this.raf = requestAnimationFrame(this.frame);
      return;
    }
    this.raf = 0;
    this.anim = null;
    this.render();
    a.done();
  }

  /* Rozestavění postavy pro kolo: sedící se přisune zády ke stěně, vrhač tak, aby ruka při
     odhodu byla přesně v bodě odhodu (x0, h0). */
  prep() {
    const r = this.r;
    if (r.pose === 'sed') {
      const b = this.sitter;
      const sk = pose(b, SEAT, { hip: [0, SEAT_HIP_Y] });
      let minX = Infinity;
      for (const [u, v] of BACK) minX = Math.min(minX, sk.T(u, v)[0]);
      minX = Math.min(minX, add(sk.head, rot([-0.104 * sk.k, 0.036 * sk.k], -sk.headDeg * DEG))[0]);   // týl
      this.hip = [0.006 - minX, SEAT_HIP_Y];
      const sk2 = pose(b, SEAT, { hip: this.hip });
      this.shoulder = sk2.shoulder;
      this.chest = add(sk2.T(0.74, 0.14), [BALL_R + 0.012, -0.02]);   // míč u hrudníku
    } else {
      const b = this.thrower;
      const reach = b.L.uarm + b.L.farm + 0.06 * b.k;
      const sk = pose(b, RELEASE, { ground: 0, x: 0 });
      const tgt = [r.x0 || 0, r.h0];
      const dy = tgt[1] - sk.shoulder[1];
      const rho = Math.min(0.97 * reach, Math.max(Math.abs(dy), 0.3));
      const dx = Math.sqrt(Math.max(0, rho * rho - dy * dy)) || 0.04;
      this.standX = tgt[0] - dx - sk.shoulder[0];
      this.relHand = { th: Math.atan2(dx, dy) / DEG, r: Math.hypot(dx, dy) };
      this.cockHand = { th: Math.atan2(COCK_HAND[0], COCK_HAND[1]) / DEG, r: Math.hypot(COCK_HAND[0], COCK_HAND[1]) };
    }
  }

  /* Sedící s míčem se středem v c; ruce za míčem, prsty po směru tlaku dir. */
  sitterAt(c, dir) {
    const b = this.sitter;
    const wrist = add(c, rot([-0.085, -0.03], Math.atan2(dir[1], dir[0])));
    const a = armTo(this.shoulder, wrist, b.L.uarm, b.L.farm, -1);
    const arms = { uarm: a.uarm, farm: a.farm, hand: angDown(dir), grip: 'flat' };
    return pose(b, { ...SEAT, ...arms, far: { ...SEAT.far, ...arms } }, { hip: this.hip });
  }

  /* Dráha míče od hrudníku do bodu odhodu; na konci míří ve směru odhodu (deg). */
  pushPath(deg) {
    const c0 = this.chest;
    const c1 = [this.r.x0 || 0, this.r.h0];
    const P = add(c1, [Math.cos(deg * DEG), Math.sin(deg * DEG)], -0.22);
    return (s) => {
      const u = 1 - s;
      return {
        c: [u * u * c0[0] + 2 * u * s * P[0] + s * s * c1[0], u * u * c0[1] + 2 * u * s * P[1] + s * s * c1[1]],
        dir: unit([u * (P[0] - c0[0]) + s * (c1[0] - P[0]), u * (P[1] - c0[1]) + s * (c1[1] - P[1])]),
      };
    };
  }

  /* Vrhač v póze base, ruka s granátem v hand = { th (° od svislice), r (m) } od ramene. */
  throwerAt(base, hand) {
    const b = this.thrower;
    const place = { ground: 0, x: this.standX };
    const sh = pose(b, base, place).shoulder;
    const grip = add(sh, [hand.r * Math.sin(hand.th * DEG), hand.r * Math.cos(hand.th * DEG)]);
    const a = armTo(sh, grip, b.L.uarm, b.L.farm + 0.06 * b.k, 1);
    return { sk: pose(b, { ...base, uarm: a.uarm, farm: a.farm, hand: a.farm, grip: 'fist' }, place), grip };
  }

  /* Fáze odhodu granátu: klid (nápřah), švih do odhodu, dokončení švihu za letu. */
  throwerStage() {
    const a = this.anim;
    if (!a) {
      const st = this.throwerAt(COCK, this.cockHand);
      return { sk: st.sk, held: st.grip };
    }
    if (a.el < a.push) {
      const f = a.el / a.push;
      const e = f * f;                     // ruka zrychluje až do odhodu
      const hand = { th: lerp(this.cockHand.th, this.relHand.th, e), r: lerp(this.cockHand.r, this.relHand.r, e) };
      const st = this.throwerAt(lerpPose(COCK, RELEASE, smooth(f)), hand);
      return { sk: st.sk, held: st.grip };
    }
    const g = Math.min(1, (a.el - a.push) / FOLLOW_MS);
    const e = 1 - (1 - g) * (1 - g);
    const hand = { th: lerp(this.relHand.th, FOLLOW_HAND.th, e), r: lerp(this.relHand.r, FOLLOW_HAND.r, e) };
    return { sk: this.throwerAt(lerpPose(RELEASE, FOLLOW, smooth(g)), hand).sk, held: null };
  }

  render() {
    const ctx = this.ctx;
    const r = this.r;
    const dpr = this.cv ? this.cv.dpr : 1;
    const ts = this.cv ? this.cv.ts : 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!r) return;
    const sed = r.pose === 'sed';
    if (!this.bg) this.bg = background(sed ? 'telocvicna' : 'hriste', W, H, dpr, sed ? 246 : 236);
    ctx.drawImage(this.bg, 0, 0, W, H);
    const K = (W - X0 - 24) / r.xMax;
    const SX = (x) => X0 + x * K;
    const SY = (y) => Y0 - y * K;
    const a = this.anim;
    const shot = a ? a.shot : null;
    const flying = !!a && a.el >= a.push;
    const tau = flying ? (a.fly ? Math.min(1, (a.el - a.push) / a.fly) : 1) * shot.t : 0;
    const rel = [r.x0 || 0, r.h0];

    this.paintSite(ctx, sed, SX, ts);
    this.paintTape(ctx, r, SX, sed, ts);
    this.paintTarget(ctx, r, SX, ts);
    this.paintThrows(ctx, SX, SY, ts);

    // postava a předmět v rukou
    const view = { ox: X0, oy: Y0, s: K };
    if (sed) {
      let q = null;
      if (!a) q = this.pushPath(this.angle)(0);
      else if (!flying) q = this.pushPath(Math.atan2(shot.vy, shot.vx) / DEG)((a.el / a.push) ** 2);
      const sk = q ? this.sitterAt(q.c, q.dir) : this.sitterAt(rel, unit([shot.vx, shot.vy]));
      drawBody(ctx, sk, view, {
        shadow: 0,
        hooks: { front: q ? () => paintBall(ctx, SX(q.c[0]), SY(q.c[1]), BALL_R * K, 0) : null },
      });
    } else {
      const st = this.throwerStage();
      drawBody(ctx, st.sk, view, { shadow: 0 });
      if (st.held) paintNade(ctx, SX(st.held[0]), SY(st.held[1]), 9, -0.6);
    }

    // míření: kde předmět opustí ruce a kam míří
    if (!a) {
      const R = [SX(rel[0]), SY(rel[1])];
      const rad = sed ? BALL_R * K : 5;
      ctx.save();
      ctx.strokeStyle = 'rgba(255,210,138,0.85)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(R[0], R[1], rad, 0, Math.PI * 2);
      if (sed) {
        ctx.moveTo(R[0], R[1] + rad);
        ctx.lineTo(R[0], Y0);
      }
      ctx.stroke();
      ctx.restore();
      const th = this.angle * DEG;
      const L = sed ? 58 : 44;
      arrow(ctx, R[0] + rad * Math.cos(th), R[1] - rad * Math.sin(th), R[0] + (rad + L) * Math.cos(th), R[1] - (rad + L) * Math.sin(th), '#ffd28a', 2);
      if (sed) {
        paintAngle(ctx, R, this.angle, rad + 18, ts);
        label(ctx, `${fmt(rel[1], 1)} m`, R[0] + 5, R[1] + rad + (Y0 - R[1] - rad) * 0.62, '#ffd28a', { align: 'left', ts, W, size: 10 });
      }
    }

    // let: stopa a předmět
    if (flying) {
      const pos = (t) => [shot.x0 + shot.vx * t, shot.h0 + shot.vy * t - (G * t * t) / 2];
      ctx.save();
      ctx.strokeStyle = 'rgba(255,210,138,0.8)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      for (let j = 0; j <= 40; j++) {
        const p = pos((tau * j) / 40);
        if (j) ctx.lineTo(SX(p[0]), SY(p[1]));
        else ctx.moveTo(SX(p[0]), SY(p[1]));
      }
      ctx.stroke();
      ctx.restore();
      const p = pos(tau);
      if (sed) paintBall(ctx, SX(p[0]), Math.min(SY(p[1]), Y0 - BALL_R * K), BALL_R * K, -tau * 7);
      else paintNade(ctx, SX(p[0]), SY(p[1]), 9, -0.6 + tau * 9);
    }
    if (!sed) this.paintInset(ctx, rel, ts);

    const last = this.throws[this.throws.length - 1];
    this.canvas.setAttribute('aria-label', `${r.name}: úhel odhodu ${Math.round(this.angle)}°${last ? `, poslední hod ${fmt(last.d, 2)} m` : ''}.`);
  }

  /* Stěna za zády (vsedě), nebo odhodová čára (vestoje). */
  paintSite(ctx, sed, SX, ts) {
    const x = SX(0);
    if (!sed) {
      ctx.fillStyle = '#e8e4d8';
      ctx.fillRect(x - 2, Y0 - 3, 4, 9);
      return;
    }
    const g = ctx.createLinearGradient(0, 0, x, 0);
    g.addColorStop(0, '#2a2e28');
    g.addColorStop(1, '#495046');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, x, Y0 + 3);
    ctx.fillStyle = 'rgba(255,255,240,0.2)';
    ctx.fillRect(x - 2, 0, 2, Y0 + 3);
    ctx.fillStyle = '#2b2721';
    ctx.fillRect(0, Y0 - 9, x, 12);
    label(ctx, 'stěna', x / 2, 14, '#d8cfae', { ts, W, size: 10 });
  }

  /* Metr na podlaze (tělocvična) nebo čára na trávě s dílky po metrech. */
  paintTape(ctx, r, SX, sed, ts) {
    const x1 = SX(r.xMax);
    ctx.fillStyle = sed ? 'rgba(214,184,84,0.92)' : 'rgba(236,234,224,0.7)';
    ctx.fillRect(SX(0), Y0, x1 - SX(0), sed ? 5 : 2.5);
    const minor = sed ? 0.1 : 1;
    ctx.fillStyle = sed ? 'rgba(30,24,12,0.85)' : 'rgba(236,234,224,0.65)';
    for (let i = 0; i * minor <= r.xMax + 1e-9; i++) {
      const x = i * minor;
      const q = x / r.tick;
      const major = Math.abs(q - Math.round(q)) < 1e-6;
      const half = !major && Math.abs(q * 2 - Math.round(q * 2)) < 1e-6;
      ctx.fillRect(SX(x) - 0.6, Y0, 1.2, major ? 9 : half ? 6 : 3);
    }
    for (let x = 0; x <= r.xMax + 1e-9; x += r.tick) {
      const end = x + r.tick > r.xMax + 1e-9;
      label(ctx, `${fmt(x, x % 1 ? 1 : 0)}${end ? ' m' : ''}`, SX(x), Y0 + 17, '#d8cfae', { ts, W, size: 10, bg: 'rgba(0,0,0,0)' });
    }
  }

  /* Norma: praporek na zemi a popisek pod metrem. */
  paintTarget(ctx, r, SX, ts) {
    const x = SX(r.target);
    ctx.save();
    ctx.strokeStyle = '#9fbf7a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, Y0 + 24);
    ctx.lineTo(x, Y0 - 58);
    ctx.stroke();
    ctx.fillStyle = '#9fbf7a';
    ctx.beginPath();
    ctx.moveTo(x, Y0 - 58);
    ctx.lineTo(x + 20, Y0 - 51);
    ctx.lineTo(x, Y0 - 44);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    label(ctx, r.targetLabel || `${fmt(r.target, 2)} m`, x, Y0 + 36, '#9fbf7a', { ts, W, size: 11 });
  }

  /* Předchozí hody: dráhy (poslední výrazně), místa dopadu a popisek posledního. */
  paintThrows(ctx, SX, SY, ts) {
    const n = this.throws.length;
    this.throws.forEach((t, i) => {
      const last = i === n - 1;
      ctx.save();
      ctx.strokeStyle = last ? '#ffd28a' : 'rgba(255,210,138,0.3)';
      ctx.lineWidth = last ? 2 : 1.5;
      ctx.beginPath();
      for (let j = 0; j <= 48; j++) {
        const tt = (t.t * j) / 48;
        const x = SX(t.x0 + t.vx * tt);
        const y = SY(t.h0 + t.vy * tt - (G * tt * tt) / 2);
        if (j) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.stroke();
      ctx.fillStyle = t.d >= this.r.target ? '#9fbf7a' : '#e0805f';
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(SX(t.d), Y0, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    });
    if (!n) return;
    const t = this.throws[n - 1];
    const text = `${fmt(t.d, 2)} m · ${t.a}°`;
    if (SX(t.d) <= W - 8) label(ctx, text, SX(t.d), Y0 - 14, '#ffd28a', { ts, W, size: 11 });
    else label(ctx, `${text} →`, W - 6, Y0 - 14, '#ffd28a', { align: 'right', ts, W, size: 11 });
  }

  /* Detail odhodu granátu (vpravo nahoře): vrhač zblízka, výška odhodu a úhel. */
  paintInset(ctx, rel, ts) {
    const I = INSET;
    const s = I.s;
    const X = (q) => [I.ox + q[0] * s, I.gy - q[1] * s];
    ctx.save();
    rrect(ctx, I.x, I.y, I.w, I.h, 8);
    ctx.fillStyle = 'rgba(12,14,11,0.86)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(216,207,174,0.5)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.clip();
    ctx.fillStyle = '#2c3a24';
    ctx.fillRect(I.x, I.gy, I.w, I.y + I.h - I.gy);
    ctx.fillStyle = '#e8e4d8';
    ctx.fillRect(I.ox - 1.5, I.gy, 3, 4);
    const st = this.throwerStage();
    drawBody(ctx, st.sk, { ox: I.ox, oy: I.gy, s }, {
      shadow: 0,
      hooks: {
        front: st.held ? () => {
          const p = X(st.held);
          paintNade(ctx, p[0], p[1], NADE * s * 1.4, -0.6);
        } : null,
      },
    });
    const a = this.anim;
    if (a && a.el >= a.push) {
      // granát vylétá z detailu
      const t = (a.fly ? Math.min(1, (a.el - a.push) / a.fly) : 1) * a.shot.t;
      const p = X([a.shot.x0 + a.shot.vx * t, a.shot.h0 + a.shot.vy * t - (G * t * t) / 2]);
      paintNade(ctx, p[0], p[1], NADE * s * 1.4, -0.6 + t * 9);
    }
    const R = X(rel);
    if (!a) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,210,138,0.85)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(R[0], R[1], 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      const th = this.angle * DEG;
      arrow(ctx, R[0] + 6 * Math.cos(th), R[1] - 6 * Math.sin(th), R[0] + 46 * Math.cos(th), R[1] - 46 * Math.sin(th), '#ffd28a', 2);
      paintAngle(ctx, R, this.angle, 24, ts);
    }
    // výška odhodu
    const dx = I.ox + 1.5 * s;
    ctx.save();
    ctx.strokeStyle = '#e8c48a';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(dx, I.gy);
    ctx.lineTo(dx, R[1]);
    ctx.moveTo(dx - 4, I.gy);
    ctx.lineTo(dx + 4, I.gy);
    ctx.moveTo(dx - 4, R[1]);
    ctx.lineTo(dx + 4, R[1]);
    ctx.stroke();
    ctx.restore();
    label(ctx, `${fmt(rel[1], 1)} m`, dx - 5, (I.gy + R[1]) / 2, '#e8c48a', { align: 'right', ts, W, size: 10 });
    ctx.restore();
    label(ctx, 'detail odhodu', I.x + 8, I.y + 13, '#d8cfae', { align: 'left', ts, W, size: 10, bg: 'rgba(0,0,0,0)' });
  }
}
