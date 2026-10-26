/*
 * Protizávaží u přilby (Vojenská tělovýchova – noční cvičiště): kresba k aktivitě „helmet“.
 *
 * Hlava a ramena vojáka z js/postava.js zblízka (780 px na metr), na hlavě přilba s bočními lištami:
 * vpředu noktovizor na držáku (těžiště 12 cm před osou otáčení hlavy – kloubem mezi lebkou a atlasem),
 * vzadu na liště váček s protizávažím ve vzdálenosti dc za osou. Podle zbylého momentu se hlava
 * nakloní (jako by ji svaly nedržely) a šipka ukáže, kolik musí táhnout svaly krku. Momenty počítá
 * ui.js stejně jako dřív; váček jde táhnout – ui.js se ptá scény, kde je. Plátno 420 × 340.
 */
import { makeBody, pose, drawBody } from './postava.js?v=0.33';
import { fmt, setupCanvas, label, arrow, dash, dim } from './kresba.js?v=0.33';

const W = 420;
const H = 340;
const S = 780;                    // px na metr
const PC = [214, 188];            // osa otáčení hlavy na plátně (při vzpřímené hlavě)
const DEG = Math.PI / 180;
const PIV = [0.008, -0.028];      // osa (kloub lebka – atlas) v rámu hlavy: od zvukovodu dopředu a dolů (m)
const RAIL_Y = 0.064;             // boční lišta přilby nad zvukovodem (m)
/* Skořepina přilby v rámu hlavy (počátek ve zvukovodu, x dopředu, y nahoru; m) – vysoký střih nad uchem. */
const SHELL = [
  [0.104, 0.052], [0.104, 0.08], [0.09, 0.116], [0.061, 0.144], [0.02, 0.159], [-0.03, 0.16], [-0.076, 0.147],
  [-0.111, 0.116], [-0.131, 0.073], [-0.136, 0.03], [-0.129, -0.006], [-0.104, -0.003], [-0.074, 0.012],
  [-0.044, 0.035], [-0.01, 0.047], [0.03, 0.051], [0.07, 0.053],
];
const BUST = { trunk: 0, bend: 0, neck: 0, uarm: 4, farm: 6, hand: 6, grip: 'open' };

/* Uzavřená hladká křivka přes body. */
function smooth(ctx, pts) {
  const n = pts.length;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    ctx.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
  }
  ctx.closePath();
}

export class HelmetScene {
  /* geo: { nvgKg, nvgCm, armCm } */
  constructor(canvas, geo) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.geo = geo;
    this.body = makeBody({ style: 'uniforma', height: 1.75, mass: 75 });
    const sk = pose(this.body, { ...BUST, head: 0 }, { ground: 0, x: 0 });
    const p = this.pivot(sk);
    this.view = { ox: PC[0] - p[0] * S, oy: PC[1] + p[1] * S, s: S };
    this.st = null;
    this.pouchBox = null;
    this.cv = setupCanvas(canvas, W, H, (changed) => {
      if (changed) this.bg = null;
      this.render();
    });
  }

  destroy() {
    this.cv.destroy();
  }

  /* Stav z ui.js: { mc (kg), dc (cm), net (N·m, + = dopředu), f (N, svaly), tol, free (lze táhnout), done }. */
  set(st) {
    this.st = st;
    this.render();
  }

  /* Bod v rámu hlavy → svět (m). */
  headPt(sk, x, y) {
    const h = sk.headDeg * DEG;
    return [sk.head[0] + (x * Math.cos(h) + y * Math.sin(h)) * sk.k, sk.head[1] + (-x * Math.sin(h) + y * Math.cos(h)) * sk.k];
  }

  pivot(sk) {
    return this.headPt(sk, PIV[0], PIV[1]);
  }

  toCanvas(q) {
    return [this.view.ox + q[0] * S, this.view.oy - q[1] * S];
  }

  /* Míří ukazatel na váček? A kolik cm za osou to je? */
  pouchAt(clientX, clientY) {
    if (!this.pouchBox) return false;
    const b = this.canvas.getBoundingClientRect();
    const sx = ((clientX - b.left) / b.width) * W;
    const sy = ((clientY - b.top) / b.height) * H;
    const p = this.pouchBox;
    return sx >= p.x0 - 12 && sx <= p.x1 + 12 && sy >= p.y0 - 16 && sy <= p.y1 + 12;
  }

  dcAt(clientX) {
    const b = this.canvas.getBoundingClientRect();
    const sx = ((clientX - b.left) / b.width) * W;
    return ((this.pc ? this.pc[0] : PC[0]) - sx) / S * 100;
  }

  render() {
    const ctx = this.ctx;
    const dpr = this.cv ? this.cv.dpr : 1;
    const ts = this.cv ? this.cv.ts : 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.paintBackground(ctx);
    const st = this.st;
    if (!st) return;
    const g = this.geo;
    const balanced = Math.abs(st.net) <= st.tol;
    // bez svalů by se hlava naklonila podle zbylého momentu
    const tilt = Math.max(-14, Math.min(14, st.net * 18));
    const sk = pose(this.body, { ...BUST, head: tilt }, { ground: 0, x: 0 });
    const piv = this.pivot(sk);
    const pc = this.toCanvas(piv);
    this.pc = pc;
    const C = (x, y) => this.toCanvas(this.headPt(sk, x, y));
    const px = PIV[0] - st.dc / 100;           // váček v rámu hlavy
    const nx = PIV[0] + g.nvgCm / 100;         // noktovizor
    drawBody(ctx, sk, this.view, {
      ow: 2.4,
      hooks: { top: () => this.paintHelmet(ctx, C, sk, px, nx, st.mc) },
    });

    // osa otáčení hlavy
    ctx.save();
    ctx.fillStyle = '#ffd28a';
    ctx.strokeStyle = '#1a1a16';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(pc[0], pc[1], 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // svaly krku: táhnou dolů za osou (hlava padá dopředu), nebo před ní (padá dozadu)
    const back = st.net >= -st.tol;
    const fx = pc[0] + (back ? -1 : 1) * (g.armCm / 100) * S;
    const len = 14 + Math.min(46, st.f * 2);
    const strong = st.f > 2;
    arrow(ctx, fx, pc[1] + 10, fx - (back ? 4 : -4), pc[1] + 10 + len, strong ? '#e0605a' : '#8a7a70', strong ? 4 : 2.5);
    label(ctx, `${back ? 'šíje' : 'krk vpředu'} ${fmt(st.f)} N`, fx + (back ? -10 : 10), pc[1] + 18 + len * 0.55, '#e8e0c4', { align: back ? 'right' : 'left', ts, W, size: 11 });

    // kóty od osy (vodorovně, nenaklánějí se)
    const dy = pc[1] + 100;
    dash(ctx, pc[0], pc[1] + 7, pc[0], dy, 'rgba(255,210,138,0.7)', 1.2);
    dim(ctx, pc[0], pc[0] + (g.nvgCm / 100) * S, dy, '#e0b070', `${g.nvgCm} cm`, { at: 'center', ts, W, size: 10 });
    dim(ctx, pc[0], pc[0] - (st.dc / 100) * S, dy, '#9fd0a0', `${st.dc} cm`, { at: 'center', ts, W, size: 10 });
    label(ctx, 'osa otáčení hlavy (kloub lebka – atlas)', W / 2, H - 13, '#d8cfae', { ts, W, size: 10 });

    // hmotnosti nad noktovizorem a nad váčkem
    const nl = C(nx, 0.066);
    label(ctx, `${fmt(g.nvgKg, 1)} kg`, nl[0] + 8, nl[1] - 10, '#e0b070', { ts, W, size: 10 });
    const pl = C(px, RAIL_Y + 0.012);
    label(ctx, `${fmt(st.mc, 2)} kg`, pl[0], pl[1] - 12, '#9fd0a0', { ts, W, size: 10 });

    // ukazatel rovnováhy
    ctx.save();
    ctx.fillStyle = balanced ? '#9fbf7a' : '#e0805f';
    ctx.strokeStyle = '#1a1a16';
    ctx.beginPath();
    ctx.arc(W - 22, 22, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    label(ctx, balanced ? 'vyváženo' : (st.net > 0 ? 'padá dopředu' : 'padá dozadu'), W - 36, 22, '#d8cfae', { align: 'right', ts, W, size: 11 });
    this.canvas.setAttribute('aria-label', `Přilba: protizávaží ${fmt(st.mc, 2)} kg ${st.dc} cm za osou, ${balanced ? 'hlava vyvážená' : (st.net > 0 ? 'hlava padá dopředu' : 'hlava padá dozadu')}, svaly krku ${fmt(st.f)} N.`);
  }

  /* Noc: tmavé nebe s pár hvězdami a světlem lampy zboku. */
  paintBackground(ctx) {
    if (!this.bg) {
      const c = document.createElement('canvas');
      const dpr = this.cv ? this.cv.dpr : 1;
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
      const g = c.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const sky = g.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#060a12');
      sky.addColorStop(1, '#16202e');
      g.fillStyle = sky;
      g.fillRect(0, 0, W, H);
      let seed = 5;
      const rnd = () => {
        seed = (seed * 16807) % 2147483647;
        return seed / 2147483647;
      };
      g.fillStyle = 'rgba(230,236,255,0.8)';
      for (let i = 0; i < 40; i++) {
        g.globalAlpha = 0.25 + rnd() * 0.6;
        g.beginPath();
        g.arc(rnd() * W, rnd() * H * 0.7, rnd() < 0.15 ? 1.3 : 0.7, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
      const glow = g.createRadialGradient(W * 0.92, H * 0.25, 10, W * 0.92, H * 0.25, W * 0.8);
      glow.addColorStop(0, 'rgba(255,214,150,0.22)');
      glow.addColorStop(1, 'rgba(255,214,150,0)');
      g.fillStyle = glow;
      g.fillRect(0, 0, W, H);
      this.bg = c;
    }
    ctx.drawImage(this.bg, 0, 0, W, H);
  }

  /* Přilba, boční lišta, noktovizor na držáku a váček s protizávažím (vše v rámu hlavy). */
  paintHelmet(ctx, C, sk, px, nx, mc) {
    ctx.save();
    ctx.lineJoin = 'round';
    // skořepina
    const shell = SHELL.map(([x, y]) => C(x, y));
    const c0 = C(-0.03, 0.13);
    const gr = ctx.createRadialGradient(c0[0] + 18, c0[1] - 16, 6, c0[0], c0[1], 0.17 * S);
    gr.addColorStop(0, '#76825a');
    gr.addColorStop(0.55, '#56613f');
    gr.addColorStop(1, '#343b26');
    smooth(ctx, shell);
    ctx.fillStyle = gr;
    ctx.fill();
    ctx.strokeStyle = '#1b2014';
    ctx.lineWidth = 2.4;
    ctx.stroke();
    // lem okraje
    ctx.strokeStyle = '#262c1c';
    ctx.lineWidth = 4;
    ctx.beginPath();
    const rim = [[-0.129, -0.002], [-0.104, 0.001], [-0.074, 0.016], [-0.044, 0.039], [-0.01, 0.05], [0.03, 0.054], [0.07, 0.056], [0.1, 0.056]].map(([x, y]) => C(x, y));
    ctx.moveTo(rim[0][0], rim[0][1]);
    for (const q of rim.slice(1)) ctx.lineTo(q[0], q[1]);
    ctx.stroke();
    // boční lišta (vzadu přesahuje skořepinu, aby šel váček posunout dál)
    const r0 = C(0.072, RAIL_Y + 0.006);
    const r1 = C(PIV[0] - 0.166, RAIL_Y + 0.006);
    const r2 = C(PIV[0] - 0.166, RAIL_Y - 0.006);
    const r3 = C(0.072, RAIL_Y - 0.006);
    ctx.fillStyle = '#25261f';
    ctx.strokeStyle = '#0e0f0b';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(r0[0], r0[1]);
    ctx.lineTo(r1[0], r1[1]);
    ctx.lineTo(r2[0], r2[1]);
    ctx.lineTo(r3[0], r3[1]);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#4a4b40';
    for (let x = 0.06; x > PIV[0] - 0.16; x -= 0.014) {
      const q = C(x, RAIL_Y);
      ctx.fillRect(q[0] - 1.5, q[1] - 1.5, 3, 3);
    }
    // držák a noktovizor
    const m0 = C(0.094, 0.084);
    const m1 = C(0.108, 0.112);
    ctx.fillStyle = '#2a2b24';
    ctx.strokeStyle = '#0e0f0b';
    ctx.beginPath();
    ctx.moveTo(m0[0], m0[1]);
    const mq = [C(0.108, 0.084), m1, C(0.094, 0.112)];
    ctx.lineTo(mq[0][0], mq[0][1]);
    ctx.lineTo(mq[1][0], mq[1][1]);
    ctx.lineTo(mq[2][0], mq[2][1]);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    const arm = [C(0.104, 0.098), C(0.118, 0.072), C(nx - 0.004, 0.05)];
    ctx.strokeStyle = '#0e0f0b';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(arm[0][0], arm[0][1]);
    ctx.quadraticCurveTo(arm[1][0], arm[1][1], arm[2][0], arm[2][1]);
    ctx.stroke();
    ctx.strokeStyle = '#33352c';
    ctx.lineWidth = 4.5;
    ctx.stroke();
    const box = [C(nx - 0.03, 0.047), C(nx + 0.034, 0.047), C(nx + 0.034, 0.006), C(nx - 0.03, 0.006)];
    ctx.fillStyle = '#1f2a1f';
    ctx.strokeStyle = '#0b100b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(box[0][0], box[0][1]);
    for (const q of box.slice(1)) ctx.lineTo(q[0], q[1]);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    const lens = C(nx + 0.034, 0.026);
    ctx.fillStyle = '#0b100b';
    ctx.beginPath();
    ctx.ellipse(lens[0], lens[1], 4, 0.019 * S, -sk.headDeg * DEG, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#7dd37a';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // váček s protizávažím na liště
    const wv = 0.046;
    const hv = 0.024 + 0.03 * mc;
    const top = RAIL_Y - 0.006;
    const corners = [[px - wv / 2, top], [px + wv / 2, top], [px + wv / 2, top - hv], [px - wv / 2, top - hv]].map(([x, y]) => C(x, y));
    const xs = corners.map((q) => q[0]);
    const ys = corners.map((q) => q[1]);
    this.pouchBox = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    ctx.fillStyle = mc > 0 ? '#6a6a48' : '#55553c';
    ctx.strokeStyle = '#22220f';
    ctx.lineWidth = 1.8;
    smooth(ctx, [
      corners[0], [(corners[0][0] + corners[1][0]) / 2, (corners[0][1] + corners[1][1]) / 2], corners[1],
      [(corners[1][0] + corners[2][0]) / 2, (corners[1][1] + corners[2][1]) / 2], corners[2],
      [(corners[2][0] + corners[3][0]) / 2, (corners[2][1] + corners[3][1]) / 2], corners[3],
      [(corners[3][0] + corners[0][0]) / 2, (corners[3][1] + corners[0][1]) / 2],
    ]);
    ctx.fill();
    ctx.stroke();
    const clip = [C(px - 0.012, RAIL_Y + 0.008), C(px + 0.012, RAIL_Y - 0.01)];
    ctx.fillStyle = '#16170f';
    ctx.fillRect(Math.min(clip[0][0], clip[1][0]), Math.min(clip[0][1], clip[1][1]), Math.abs(clip[1][0] - clip[0][0]), Math.abs(clip[1][1] - clip[0][1]));
    ctx.restore();
  }
}
