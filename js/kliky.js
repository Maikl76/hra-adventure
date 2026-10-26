/*
 * Kliky na decimální váze (Vojenská tělovýchova – tělocvična): kresba k aktivitě „pushup“.
 *
 * Voják z js/postava.js v poloze kliku: špičky na zemi (osa otáčení), dlaně na plošině decimální
 * váhy. Na vahadle visí závaží (1 kg vyváží 10 kg na plošině), vahadlo se naklání podle rozdílu.
 * Ve druhém kole má voják na zádech batoh. Kóty od špiček: těžiště, batoh, ruce. Rovnováhu
 * momentů počítá ui.js stejně jako dřív; po vyrovnání se ukáže síla v rukou. Plátno 600 × 340.
 */
import { makeBody, pose, drawBody, centerOfMass } from './postava.js?v=0.33';
import { rrect, fmt, setupCanvas, label, arrow, dash, dim, comMark, background } from './kresba.js?v=0.33';

const W = 600;
const H = 340;
const VIEW = { ox: 44, oy: 252, s: 280 };     // svět → plátno (x = 0 špičky)
const PLAT = 0.1;                              // výška plošiny váhy (m)
const COL = 0.62;                              // výška sloupku s vahadlem (m)
const G = 9.81;
const FORCE = 0.00016;                         // m šipky na 1 N
const DEG = Math.PI / 180;

/* Mnohoúhelník se zaoblenými rohy (batoh). */
function roundedPoly(ctx, pts, r) {
  const n = pts.length;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n];
    const b = pts[i];
    const c = pts[(i + 1) % n];
    const m1 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const m2 = [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2];
    if (i === 0) ctx.moveTo(m1[0], m1[1]);
    ctx.arcTo(b[0], b[1], m2[0], m2[1], r);
  }
  ctx.closePath();
}

export class PushupScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.body = makeBody({ style: 'uniforma', height: 1.75, mass: 70 });
    this.st = null;
    this.tilt = 0;
    this.tiltTarget = 0;
    this.raf = 0;
    this.frame = this.frame.bind(this);
    this.cv = setupCanvas(canvas, W, H, (changed) => {
      if (changed) this.bg = null;
      this.render();
    });
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.cv.destroy();
  }

  /* Stav z ui.js: kolo (bodyKg, comM, handsM, extra), zavěšená závaží, rozdíl, vyrovnáno, síla. */
  set(st) {
    this.st = st;
    this.tiltTarget = st.tilt;
    if (st.reducedMotion) this.tilt = st.tilt;
    this.loop();
  }

  loop() {
    if (!this.raf) this.raf = requestAnimationFrame(this.frame);
  }

  frame() {
    this.raf = 0;
    const d = this.tiltTarget - this.tilt;
    this.tilt += Math.abs(d) < 0.05 ? d : d * 0.2;
    this.render();
    if (this.tilt !== this.tiltTarget) this.loop();
  }

  /* Póza kliku: sklon těla tak, aby ramena byla nad rukama (ruce b metrů od špiček). */
  plank(b) {
    const make = (a) => {
      const q = 90 - a;
      return { trunk: q, bend: -2, thigh: -q, shin: q, foot: 78, toeFlat: 1, neck: -10, head: -8 };
    };
    let lo = 12;
    let hi = 45;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      const sk = pose(this.body, make(mid), { ground: 0, x: 0, anchor: 'toe' });
      if (sk.shoulder[0] > b) lo = mid;
      else hi = mid;
    }
    return make((lo + hi) / 2);
  }

  render() {
    const ctx = this.ctx;
    const dpr = this.cv ? this.cv.dpr : 1;
    const ts = this.cv ? this.cv.ts : 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!this.bg) this.bg = background('telocvicna', W, H, dpr, 206);
    ctx.drawImage(this.bg, 0, 0, W, H);
    const st = this.st;
    if (!st) return;
    const r = st.round;
    const b = r.handsM;
    const X = (p) => [VIEW.ox + p[0] * VIEW.s, VIEW.oy - p[1] * VIEW.s];
    const p = this.plank(b);
    const sk = pose(this.body, { ...p, grip: 'flat', reach: [b - 0.03, PLAT + 0.035] }, { ground: 0, x: 0, anchor: 'toe' });

    this.paintScale(ctx, X, b, st);
    drawBody(ctx, sk, VIEW, {
      shadow: 0,
      hooks: { front: () => (r.extra || []).forEach((e) => this.paintPack(ctx, X, sk, e)) },
    });

    // těžiště vojáka (vodorovně podle zadání kola) a jeho tíha
    const com = centerOfMass(sk);
    const cTop = [r.comM, com[1]];
    const wN = r.bodyKg * G;
    arrow(ctx, ...X(cTop), ...X([r.comM, com[1] - wN * FORCE]), '#ffb35c', 3);
    comMark(ctx, ...X(cTop));
    const cl = X([r.comM, com[1] - wN * FORCE]);
    label(ctx, `${r.bodyKg} kg → ${fmt(wN)} N`, cl[0], cl[1] + 12, '#ffb35c', { ts, W });
    // síla v rukou až po vyrovnání
    if (st.balanced) {
      const F = st.F * G;
      arrow(ctx, ...X([b + 0.07, PLAT + 0.01]), ...X([b + 0.07, PLAT + 0.01 + F * FORCE]), '#9fd07a', 3.5);
      const hl = X([b + 0.07, PLAT + 0.01 + F * FORCE]);
      label(ctx, `ruce ${fmt(st.F, 1)} kg`, hl[0] + 8, hl[1] + 4, '#9fd07a', { align: 'left', ts, W });
    }
    // osa a kóty od špiček
    const toe = X([0, 0]);
    ctx.save();
    ctx.fillStyle = '#ffd28a';
    ctx.strokeStyle = '#1a1a16';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(toe[0], toe[1], 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    label(ctx, 'osa = špičky', toe[0] + 4, toe[1] - 16, '#ffd28a', { align: 'left', ts, W, size: 11 });
    const dims = [[r.comM, '#ffb35c', 'těžiště'], ...(r.extra || []).map((e) => [e.atM, '#c8c49a', e.label || 'batoh']), [b, '#e8e0c4', 'ruce']];
    const gap = Math.max(14, 13 * ts + 2);
    dims.forEach(([x, c, name], i) => {
      const y = VIEW.oy + 18 + i * gap;
      dash(ctx, X([x, 0])[0], VIEW.oy, X([x, 0])[0], y, c);
      dim(ctx, toe[0], X([x, 0])[0], y, c, `${name} ${fmt(x, 2)} m`, { ts, W, size: 11 });
    });
    this.canvas.setAttribute('aria-label', `Voják v kliku, ruce na decimální váze ${fmt(b, 2)} m od špiček.`);
  }

  paintPack(ctx, X, sk, e) {
    // batoh na zádech (záda míří nahoru), těžiště batohu ve vzdálenosti e.atM od špiček
    let u = 0.55;
    for (let i = 0; i < 20; i++) {
      const x = sk.T(u, -0.24)[0];
      u += (e.atM - x) / (sk.body.L.trunk * 0.95);
    }
    const q = [sk.T(u - 0.36, -0.1), sk.T(u - 0.33, -0.36), sk.T(u + 0.33, -0.37), sk.T(u + 0.37, -0.1)].map(X);
    ctx.save();
    roundedPoly(ctx, q, 9);
    const g = ctx.createLinearGradient(...q[1], ...q[0]);
    g.addColorStop(0, '#5d6638');
    g.addColorStop(1, '#3f4527');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = '#15170d';
    ctx.lineWidth = 2;
    ctx.stroke();
    // vnější kapsa a popruh přes rameno
    const k = [sk.T(u - 0.2, -0.3), sk.T(u - 0.18, -0.37), sk.T(u + 0.18, -0.37), sk.T(u + 0.2, -0.3)].map(X);
    roundedPoly(ctx, k, 5);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fill();
    const strap = [sk.T(u + 0.3, -0.1), sk.T(1.06, -0.03), sk.T(0.98, 0.1)].map(X);
    ctx.strokeStyle = '#15170d';
    ctx.lineWidth = 0.05 * VIEW.s + 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    strap.forEach((pt, i) => (i ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1])));
    ctx.stroke();
    ctx.strokeStyle = '#4a5230';
    ctx.lineWidth = 0.05 * VIEW.s;
    ctx.stroke();
    ctx.restore();
    const c = X(sk.T(u, -0.24));
    ctx.save();
    ctx.strokeStyle = '#efe8d0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(c[0], c[1], 6, 0, Math.PI * 2);
    ctx.moveTo(c[0] - 4, c[1] - 4);
    ctx.lineTo(c[0] + 4, c[1] + 4);
    ctx.moveTo(c[0] + 4, c[1] - 4);
    ctx.lineTo(c[0] - 4, c[1] + 4);
    ctx.stroke();
    ctx.restore();
    label(ctx, `${e.kg} kg`, c[0], c[1] - 18, '#e8e0c4', { ts: this.cv ? this.cv.ts : 1, W, size: 11 });
  }

  /* Decimální váha: plošina pod rukama, sloupek, vahadlo s háčkem a závažím, jazýček rovnováhy. */
  paintScale(ctx, X, b, st) {
    const s = VIEW.s;
    const ts = this.cv ? this.cv.ts : 1;
    const [x0, y0] = X([b - 0.16, PLAT]);
    const [x1, yb] = X([b + 0.16, 0]);
    ctx.save();
    // plošina s gumovou podložkou
    const metal = ctx.createLinearGradient(0, y0, 0, yb);
    metal.addColorStop(0, '#6f757d');
    metal.addColorStop(1, '#3e4248');
    ctx.fillStyle = metal;
    rrect(ctx, x0, y0, x1 - x0, yb - y0 - 4, 3);
    ctx.fill();
    ctx.strokeStyle = '#1c1e22';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#26282b';
    ctx.fillRect(x0 + 4, y0 - 3, x1 - x0 - 8, 4);
    ctx.fillStyle = '#1c1e22';
    ctx.fillRect(x0 + 6, yb - 5, 8, 5);
    ctx.fillRect(x1 - 14, yb - 5, 8, 5);
    // sloupek
    const px = b + 0.24;
    const [cx, cyTop] = X([px, COL]);
    const [, cyBase] = X([px, PLAT * 0.6]);
    const col = ctx.createLinearGradient(cx - 6, 0, cx + 6, 0);
    col.addColorStop(0, '#5b6067');
    col.addColorStop(0.5, '#8a9098');
    col.addColorStop(1, '#4a4e54');
    ctx.fillStyle = col;
    ctx.fillRect(cx - 5, cyTop, 10, cyBase - cyTop);
    ctx.fillStyle = '#2c2f33';
    ctx.fillRect(x1 - 6, cyBase - 2, cx - x1 + 16, 8);
    // štítek
    ctx.fillStyle = '#c9b98a';
    ctx.fillRect(cx - 14, cyTop + 46, 28, 16);
    ctx.fillStyle = '#2a2418';
    ctx.font = `700 ${Math.round(9 * Math.min(ts, 1.3))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('1 : 10', cx, cyTop + 54);
    // vahadlo (naklání se podle rozdílu) s háčkem a závažím
    ctx.translate(cx, cyTop);
    ctx.rotate(this.tilt * DEG);
    const beamL = -0.07 * s;
    const beamR = 0.36 * s;
    const bar = ctx.createLinearGradient(0, -4, 0, 4);
    bar.addColorStop(0, '#a3a9b0');
    bar.addColorStop(1, '#5f646b');
    ctx.fillStyle = bar;
    rrect(ctx, beamL, -3.5, beamR - beamL, 7, 2);
    ctx.fill();
    ctx.strokeStyle = '#2c2f33';
    ctx.lineWidth = 1;
    ctx.stroke();
    // rysky na vahadle
    ctx.strokeStyle = 'rgba(30,30,30,0.6)';
    for (let i = 1; i < 10; i++) {
      const xx = (i / 10) * 0.32 * s;
      ctx.beginPath();
      ctx.moveTo(xx, -3.5);
      ctx.lineTo(xx, -1);
      ctx.stroke();
    }
    const hx = 0.33 * s;
    ctx.strokeStyle = '#8a8f96';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(hx, 3);
    ctx.lineTo(hx, 18);
    ctx.stroke();
    // závaží: kotouče, výška podle hmotnosti (ruka je drží svisle – proti naklonění vahadla)
    ctx.rotate(-this.tilt * DEG);
    const hookX = hx * Math.cos(this.tilt * DEG);
    let wy = hx * Math.sin(this.tilt * DEG) + 18;
    for (const w of st.hung) {
      const hh = 4 + w * 5;
      const brass = ctx.createLinearGradient(hookX - 10, 0, hookX + 10, 0);
      brass.addColorStop(0, '#7a5a22');
      brass.addColorStop(0.45, '#d0a64e');
      brass.addColorStop(1, '#6a4c1a');
      ctx.fillStyle = brass;
      rrect(ctx, hookX - 10, wy, 20, hh, 2);
      ctx.fill();
      ctx.strokeStyle = '#3a2a10';
      ctx.lineWidth = 1;
      ctx.stroke();
      wy += hh + 1;
    }
    ctx.restore();
    // čep a jazýček
    ctx.save();
    ctx.fillStyle = '#26282b';
    ctx.beginPath();
    ctx.arc(cx, cyTop, 5, 0, Math.PI * 2);
    ctx.fill();
    const ok = Math.abs(st.diff) <= st.tol;
    const tipX = cx + 0.36 * s * Math.cos(this.tilt * DEG);
    const tipY = cyTop + 0.36 * s * Math.sin(this.tilt * DEG);
    ctx.strokeStyle = 'rgba(232,224,196,0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx + 0.36 * s, cyTop - 14);
    ctx.lineTo(cx + 0.36 * s, cyTop + 14);
    ctx.stroke();
    ctx.fillStyle = ok ? '#9fd07a' : '#ff8a66';
    ctx.beginPath();
    ctx.moveTo(tipX + 9, tipY);
    ctx.lineTo(tipX + 1, tipY - 5);
    ctx.lineTo(tipX + 1, tipY + 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    label(ctx, ok ? 'vyrovnáno' : st.diff < 0 ? 'plošina těžší' : 'závaží těžší', cx + 0.36 * s + 12, cyTop - 22, ok ? '#9fd07a' : '#ff9a7a', { align: 'right', ts, W, size: 11 });
  }
}
