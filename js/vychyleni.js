/*
 * Vychýlení z rovnováhy a hod přes bok (Vojenská tělovýchova – pěchotní srub, Brána V): kresby
 * k aktivitě „balance“.
 *
 * Pohled shora (BalanceScene): chodidla partnera (svob. Hanáka) a jeho opěrná plocha – konvexní
 * obal obou chodidel – a průmět těžiště. Hráč táhne šipku tahu kolem těžiště; scéna i ui.js
 * počítají, jak daleko je v tom směru okraj opěrné plochy (d). Aby se partner převrátil přes
 * okraj, musí tah ve výšce h překonat moment tíhy: F · h = m · g · d. Nejslabší směr je ten
 * s nejkratším d – u postoje snožmo dozadu (nebo dopředu), u výpadu kolmo na spojnici chodidel.
 *
 * Z boku (HipThrowScene): po vychýlení hráč podsedne – pokrčí kolena, aby měl bok níž než
 * Hanákovo těžiště. Bok je pak osa, přes kterou se Hanák převalí; když je bok výš, Hanák na něm
 * visí a hráč by ho musel celého zvednout. Postavy z js/postava.js, plátno 600 × 340.
 */
import { makeBody, pose, drawBody, centerOfMass } from './postava.js?v=0.34';
import { fmt, setupCanvas, label, arrow, dash, comMark } from './kresba.js?v=0.34';

const W = 600;
const H = 340;
const DEG = Math.PI / 180;

/* ---------- geometrie postoje (m; x doprava, y dopředu – kam partner hledí) ---------- */

const FOOT_L = 0.28;
const FOOT_W = 0.105;

/* Obrys chodidla: obdélník se zaoblenou špičkou, střed c, natočení a (° od „dopředu“, + = ven doprava). */
function footPoly(c, a) {
  const pts = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.25], [0.32, 0.5], [-0.32, 0.5], [-0.5, 0.25]];
  const r = a * DEG;
  return pts.map(([u, v]) => {
    const x = u * FOOT_W;
    const y = v * FOOT_L;
    return [c[0] + x * Math.cos(r) + y * Math.sin(r), c[1] - x * Math.sin(r) + y * Math.cos(r)];
  });
}

function hull(pts) {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [];
  for (const q of p) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
    lo.push(q);
  }
  const up = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
    up.push(q);
  }
  up.pop();
  lo.pop();
  return lo.concat(up);
}

/* Postoje: chodidla (střed, natočení) a průmět těžiště. */
export const STANCES = {
  snozmo: { name: 'rozkročmo, chodidla vedle sebe', feet: [[[-0.16, 0], -4], [[0.16, 0], 4]], com: [0, -0.025] },
  vypad: { name: 'výpad – levá noha vpředu', feet: [[[-0.09, 0.28], 0], [[0.09, -0.26], 8]], com: [0, 0.01] },
};

export function stanceGeom(name) {
  const s = STANCES[name] || STANCES.snozmo;
  const feet = s.feet.map(([c, a]) => footPoly(c, a));
  return { ...s, feetPolys: feet, base: hull(feet.flat()) };
}

/* Vzdálenost od těžiště k okraji opěrné plochy ve směru ang (° od „dopředu“, + = doprava). */
export function edgeDist(g, ang) {
  const d = [Math.sin(ang * DEG), Math.cos(ang * DEG)];
  const o = g.com;
  let best = Infinity;
  const b = g.base;
  for (let i = 0; i < b.length; i++) {
    const p = b[i];
    const q = b[(i + 1) % b.length];
    const e = [q[0] - p[0], q[1] - p[1]];
    const den = d[0] * e[1] - d[1] * e[0];
    if (Math.abs(den) < 1e-9) continue;
    const t = ((p[0] - o[0]) * e[1] - (p[1] - o[1]) * e[0]) / den;
    const u = ((p[0] - o[0]) * d[1] - (p[1] - o[1]) * d[0]) / den;
    if (t > 0 && u >= -1e-9 && u <= 1 + 1e-9) best = Math.min(best, t);
  }
  return best;
}

/* Nejslabší směr (nejkratší d) po 1°. */
export function weakest(g) {
  let best = { ang: 0, d: Infinity };
  for (let a = -180; a < 180; a++) {
    const d = edgeDist(g, a);
    if (d < best.d) best = { ang: a, d };
  }
  return best;
}

/* ---------- pohled shora ---------- */

export class BalanceScene {
  /* opts: { stance } */
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.S = 380;
    this.c = [300, 178];
    this.st = { stance: opts.stance || 'snozmo', ang: 180, fall: 0, done: false };
    this.g = stanceGeom(this.st.stance);
    this.cv = setupCanvas(canvas, W, H, (changed) => {
      if (changed) this.bg = null;
      this.render();
    });
  }

  destroy() {
    this.cv.destroy();
    cancelAnimationFrame(this.raf);
  }

  /* Stav z ui.js: { stance, ang (směr tahu), d (m), F (N), fall (0–1 animace pádu), done } */
  set(st) {
    if (st.stance && st.stance !== this.st.stance) this.g = stanceGeom(st.stance);
    this.st = { ...this.st, ...st };
    this.render();
  }

  P(q) {
    return [this.c[0] + q[0] * this.S, this.c[1] - q[1] * this.S];
  }

  /* Úhel tahu podle ukazatele (° od „dopředu“, + = doprava). */
  angAt(clientX, clientY) {
    const b = this.canvas.getBoundingClientRect();
    const x = ((clientX - b.left) / b.width) * W;
    const y = ((clientY - b.top) / b.height) * H;
    const o = this.P(this.g.com);
    return Math.atan2(x - o[0], o[1] - y) / DEG;
  }

  render() {
    if (!this.cv) return;
    const ctx = this.ctx;
    const dpr = this.cv.dpr;
    const ts = this.cv.ts;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!this.bg) this.bg = this.paintMat();
    ctx.drawImage(this.bg, 0, 0, W, H);
    const g = this.g;
    const st = this.st;
    const P = (q) => this.P(q);
    // opěrná plocha
    ctx.save();
    ctx.fillStyle = 'rgba(126,224,129,0.2)';
    ctx.strokeStyle = 'rgba(126,224,129,0.9)';
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 5]);
    ctx.beginPath();
    g.base.forEach((q, i) => (i ? ctx.lineTo(...P(q)) : ctx.moveTo(...P(q))));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    // chodidla
    for (const f of g.feetPolys) {
      ctx.fillStyle = '#2f2a24';
      ctx.strokeStyle = '#0e0c0a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      f.forEach((q, i) => (i ? ctx.lineTo(...P(q)) : ctx.moveTo(...P(q))));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    // tělo shora (poloprůhledně, ať jsou vidět chodidla): ramena a hlava
    const shift = st.fall > 0 ? [Math.sin(st.ang * DEG) * 0.3 * st.fall, Math.cos(st.ang * DEG) * 0.3 * st.fall] : [0, 0];
    const bc = P([g.com[0] + shift[0], g.com[1] + shift[1] + 0.02]);
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = '#5d6f84';
    ctx.beginPath();
    ctx.ellipse(bc[0], bc[1], 0.23 * this.S, 0.12 * this.S, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4a3020';
    ctx.beginPath();
    ctx.arc(bc[0], bc[1] - 0.02 * this.S, 0.095 * this.S, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    label(ctx, 'Hanák hledí sem ↑', W / 2, 16, '#d8cfae', { ts, W, size: 11 });
    // směr tahu a okraj opěrné plochy
    const o = P(g.com);
    const dir = [Math.sin(st.ang * DEG), Math.cos(st.ang * DEG)];
    const d = edgeDist(g, st.ang);
    const edge = P([g.com[0] + dir[0] * d, g.com[1] + dir[1] * d]);
    const tip = P([g.com[0] + dir[0] * 0.3, g.com[1] + dir[1] * 0.3]);
    ctx.save();
    ctx.strokeStyle = '#ffd28a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(o[0], o[1]);
    ctx.lineTo(edge[0], edge[1]);
    ctx.stroke();
    ctx.restore();
    arrow(ctx, edge[0], edge[1], tip[0], tip[1], st.done ? '#9fd0a0' : '#e8b060', 4);
    ctx.fillStyle = '#ff6a55';
    ctx.beginPath();
    ctx.arc(edge[0], edge[1], 5, 0, Math.PI * 2);
    ctx.fill();
    // popisky d a těžiště na opačné strany od šipky, ať se nepřekrývají
    const ds = [dir[0], -dir[1]];               // směr tahu na plátně
    const nrm = ds[0] >= 0 ? [ds[1], -ds[0]] : [-ds[1], ds[0]];   // kolmo, spíš nahoru
    label(ctx, `d = ${fmt(d * 100)} cm`, (o[0] + edge[0]) / 2 + nrm[0] * 22, (o[1] + edge[1]) / 2 + nrm[1] * 22, '#ffe2a8', { ts, W, size: 12 });
    if (st.F && !st.done) label(ctx, `tah ${fmt(st.F)} N`, tip[0], tip[1] + (tip[1] > o[1] ? 16 : -16), '#ffe2a8', { ts, W, size: 12 });
    // těžiště (při pádu se posune za okraj)
    const cm = P([g.com[0] + shift[0], g.com[1] + shift[1]]);
    comMark(ctx, cm[0], cm[1], 8);
    label(ctx, 'těžiště', cm[0] - ds[0] * 34 - nrm[0] * 14, cm[1] - ds[1] * 34 - nrm[1] * 14 + 4, '#f4efe4', { ts, W, size: 11 });
    if (st.done) label(ctx, 'Hanák ztratil rovnováhu!', W / 2, H - 16, '#c8f0c0', { ts, W, size: 13 });
    this.canvas.setAttribute('aria-label', `Pohled shora: ${g.name}. Tah ve směru ${Math.round(st.ang)}°, těžiště je ${fmt(d * 100)} cm od okraje opěrné plochy.`);
  }

  paintMat() {
    const c = document.createElement('canvas');
    const dpr = this.cv.dpr;
    c.width = Math.round(W * dpr);
    c.height = Math.round(H * dpr);
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#2f5d7a';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(10,20,30,0.45)';
    g.lineWidth = 2;
    for (let x = 0; x <= W; x += 104) {
      g.beginPath();
      g.moveTo(x + 0.5, 0);
      g.lineTo(x + 0.5, H);
      g.stroke();
    }
    for (let y = 0; y <= H; y += 208) {
      g.beginPath();
      g.moveTo(0, y + 0.5);
      g.lineTo(W, y + 0.5);
      g.stroke();
    }
    return c;
  }
}

/* ---------- z boku: hod přes bok ---------- */

const UKE = { trunk: 24, neck: -6, head: 0, thigh: 6, shin: 4, uarm: 68, farm: 84, hand: 86, grip: 'open', far: { thigh: -12, shin: 2, uarm: 74, farm: 88 } };

export class HipThrowScene {
  /* opts: {} – Hanák (uke) se vychýlil dopředu a opřel o tvůj bok */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.S = 150;
    this.view = { ox: 140, oy: 306, s: this.S };
    this.uke = makeBody({ style: 'uniforma', height: 1.8, mass: 80, colors: { jacket: '#5d6f84', hair: '#4a3020' } });
    this.tori = makeBody({ style: 'uniforma', height: 1.76, mass: 75 });
    this.st = { s: 0, throwT: 0, lift: 0, done: false };
    this.cv = setupCanvas(canvas, W, H, (changed) => {
      if (changed) this.bg = null;
      this.render();
    });
  }

  destroy() {
    this.cv.destroy();
  }

  /* Póza tebe (tori) podle podsazení s (0 = stoj, 1 = hluboký podřep) – bok je osa hodu. */
  toriSk(s) {
    const p = { trunk: 12 + 22 * s, neck: -10 - 10 * s, thigh: 8 + 52 * s, shin: 6 + 40 * s, uarm: -30, farm: -55, hand: -60, grip: 'fist', far: { thigh: 2 + 46 * s, shin: 4 + 36 * s, uarm: 40, farm: 70 } };
    return pose(this.tori, p, { ground: 0, x: 0.62 });
  }

  /* Osa hodu: tvůj bok – zadní obrys pánve ve výšce opasku (nad kyčelním kloubem), kde se o tebe
     opírá Hanák podbřiškem. Ve stoji je u stejně vysokých lidí zhruba ve výšce jeho těžiště. */
  pivot(sk) {
    return sk.T(0.12, -0.114);
  }

  ukeSk(pv) {
    // Hanák stojí za tebou v předklonu, podbřiškem na tvém boku
    const sk0 = pose(this.uke, UKE, { ground: 0, x: 0 });
    const belly = sk0.T(0.2, 0.13);
    const dx = pv[0] - belly[0];
    return pose(this.uke, UKE, { ground: 0, x: dx });
  }

  /* Výšky pro ui.js: těžiště Hanáka a osa (bok) při podsazení s. */
  heights(s) {
    const tsk = this.toriSk(s);
    const pv = this.pivot(tsk);
    const usk = this.ukeSk(pv);
    return { com: centerOfMass(usk)[1], pivot: pv[1] };
  }

  /* Stav z ui.js: { s (podsazení), throwT (0–1 animace hodu), lift (0–1 marný zvedák), done } */
  set(st) {
    this.st = { ...this.st, ...st };
    this.render();
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
    const S = this.S;
    const X = (q) => [this.view.ox + q[0] * S, this.view.oy - q[1] * S];
    const tsk = this.toriSk(st.s);
    const pv = this.pivot(tsk);
    let usk = this.ukeSk(pv);
    const com = centerOfMass(usk);
    const PV = X(pv);
    const lift = Math.sin(Math.min(1, st.lift) * Math.PI) * 0.03;
    // hod: Hanák se otáčí kolem tvého boku a dopadne na záda před tebou
    const t = st.throwT;
    const rotPhase = Math.min(1, t / 0.65);
    const landPhase = Math.max(0, (t - 0.65) / 0.35);
    ctx.save();
    if (t > 0 && landPhase === 0) {
      ctx.translate(PV[0], PV[1]);
      ctx.rotate(rotPhase * 150 * DEG);
      ctx.translate(-PV[0], -PV[1]);
    }
    if (landPhase > 0) {
      // ležící Hanák na zádech, ruce plácnou do žíněnky
      const up = 60 * (1 - landPhase);   // ruce se zvednou a plácnou do žíněnky
      const lie = { trunk: -86, bend: 14, neck: 32, head: 0, thigh: 115, shin: -40, foot: 0, toeFlat: 0, uarm: 92 + up, farm: 92 + up, hand: 92 + up, grip: 'open', far: { thigh: 100, shin: -55, uarm: 96 + up, farm: 96 + up } };
      usk = pose(this.uke, lie, { hip: [pv[0] + 1.3, 0.13] });
    } else if (lift) {
      usk = pose(this.uke, UKE, { ground: lift, x: usk.legN.ankle[0] - (pose(this.uke, UKE, { ground: 0, x: 0 }).legN.ankle[0]) });
    }
    drawBody(ctx, usk, this.view, { ow: 1.8 });
    ctx.restore();
    drawBody(ctx, tsk, this.view, { ow: 1.8, shadow: 0 });
    if (t > 0.97) {
      const hand = X(usk.armN.wrist);
      ctx.strokeStyle = 'rgba(255,240,200,0.8)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        const a = Math.PI * (1.1 + i * 0.2);
        ctx.beginPath();
        ctx.moveTo(hand[0] + Math.cos(a) * 8, hand[1] + Math.sin(a) * 8);
        ctx.lineTo(hand[0] + Math.cos(a) * 18, hand[1] + Math.sin(a) * 18);
        ctx.stroke();
      }
      label(ctx, 'plesk!', hand[0], hand[1] - 26, '#ffe2a8', { ts, W, size: 12 });
    }
    if (t === 0) {
      // těžiště Hanáka, osa (tvůj bok) a jejich výšky
      const C = X(com);
      dash(ctx, 20, C[1], W - 20, C[1], 'rgba(244,239,228,0.55)', 1.2);
      dash(ctx, 20, PV[1], W - 20, PV[1], 'rgba(255,210,138,0.7)', 1.2);
      comMark(ctx, C[0], C[1], 8);
      label(ctx, `těžiště Hanáka ${fmt(com[1], 2)} m`, W - 18, C[1] - 12, '#f4efe4', { align: 'right', ts, W, size: 11 });
      ctx.fillStyle = '#ffd28a';
      ctx.strokeStyle = '#1a1a16';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(PV[0], PV[1], 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      label(ctx, `tvůj bok (osa) ${fmt(pv[1], 2)} m`, W - 18, PV[1] + 14, '#ffd28a', { align: 'right', ts, W, size: 11 });
      arrow(ctx, C[0], C[1], C[0], C[1] + 46, '#e0805f', 3);
    }
    this.canvas.setAttribute('aria-label', `Hod přes bok z boku: těžiště Hanáka ${fmt(com[1], 2)} m, tvůj bok ${fmt(pv[1], 2)} m nad žíněnkou.`);
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
    for (let y = 26; y < 300; y += 38) {
      g.beginPath();
      g.moveTo(0, y + 0.5);
      g.lineTo(W, y + 0.5);
      g.stroke();
    }
    // žíněnka
    g.fillStyle = '#2f5d7a';
    g.fillRect(0, 300, W, 18);
    g.fillStyle = '#244a62';
    g.fillRect(0, 318, W, H - 318);
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(0, 300, W, 2);
    return c;
  }
}

