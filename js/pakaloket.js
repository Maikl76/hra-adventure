/*
 * Páka na loket (Vojenská tělovýchova – pěchotní srub, Brána V): kresba k aktivitě „armlock“.
 *
 * Partner (svob. Kratochvíl, js/postava.js) z boku zblízka, natažená paže dlaní vzhůru. Pod
 * loktem je tvoje předloktí – opěrný bod, osa otáčení je v lokti. Druhou rukou tlačíš na jeho
 * předloktí ve vzdálenosti r od lokte; proti tomu drží jeho biceps, který se upíná jen 4 cm od
 * lokte. Rovnováha momentů kolem lokte: F · r = F_svalu · d. Úchop jde táhnout po předloktí –
 * ui.js se ptá scény, kde je. Plátno 600 × 320.
 */
import { makeBody, pose, drawBody } from './postava.js?v=0.34';
import { fmt, setupCanvas, label, arrow, dash, dim } from './kresba.js?v=0.34';

const W = 600;
const H = 320;
const S = 480;                   // px na metr
const SHOULDER = [112, 160];     // rameno na plátně
const ARM = { trunk: 0, neck: 0, head: 0, uarm: 90, farm: 90, hand: 92, grip: 'open', far: { uarm: 4, farm: 8, hand: 8 } };

export class ArmlockScene {
  /* geo: { insertCm (úpon svalu od lokte), rMin, rMax (m) } */
  constructor(canvas, geo) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.geo = geo;
    this.body = makeBody({ style: 'uniforma', height: 1.78, mass: 78, colors: { jacket: '#5d6f84', hair: '#4a3020' } });
    this.sk = pose(this.body, ARM, { ground: 0, x: 0 });
    const sh = this.sk.shoulder;
    this.view = { ox: SHOULDER[0] - sh[0] * S, oy: SHOULDER[1] + sh[1] * S, s: S };
    this.st = null;
    this.cv = setupCanvas(canvas, W, H, (changed) => {
      if (changed) this.bg = null;
      this.render();
    });
  }

  destroy() {
    this.cv.destroy();
  }

  /* Stav z ui.js: { r (m), F, Fm, M (N·m), maxF, ok, done } */
  set(st) {
    this.st = st;
    this.render();
  }

  C(p) {
    return [this.view.ox + p[0] * S, this.view.oy - p[1] * S];
  }

  get elbow() {
    return this.C(this.sk.armN.elbow);
  }

  /* Bod na předloktí (a dál na ruce) ve vzdálenosti r (m) od lokte. */
  along(r) {
    const e = this.sk.armN.elbow;
    const w = this.sk.armN.wrist;
    const L = Math.hypot(w[0] - e[0], w[1] - e[1]);
    return this.C([e[0] + ((w[0] - e[0]) / L) * r, e[1] + ((w[1] - e[1]) / L) * r]);
  }

  /* Míří ukazatel na ruku s úchopem? Kolik cm od lokte je ukazatel? */
  gripAt(clientX, clientY) {
    if (!this.st) return false;
    const b = this.canvas.getBoundingClientRect();
    const x = ((clientX - b.left) / b.width) * W;
    const y = ((clientY - b.top) / b.height) * H;
    const g = this.along(this.st.r);
    return Math.abs(x - g[0]) < 34 && y > g[1] - 70 && y < g[1] + 26;
  }

  rAt(clientX) {
    const b = this.canvas.getBoundingClientRect();
    const x = ((clientX - b.left) / b.width) * W;
    return (x - this.elbow[0]) / S;
  }

  render() {
    if (!this.cv) return;
    const ctx = this.ctx;
    const dpr = this.cv.dpr;
    const ts = this.cv.ts;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!this.bg) this.bg = this.paintBackground();
    ctx.drawImage(this.bg, 0, 0, W, H);
    const st = this.st;
    if (!st) return;
    const g = this.geo;
    const E = this.elbow;
    // partner; paže zůstává natažená (páka se jen „nasadí“, nic se neláme)
    drawBody(ctx, this.sk, this.view, { ow: 2.2 });

    // tvoje ruce: předloktí pod loktem (opěrný bod) a ruka s úchopem shora
    const G = this.along(st.r);
    this.forearm(ctx, [E[0] - 4, E[1] + 12], [E[0] - 70, H + 20], '#55603d', true);
    this.forearm(ctx, [G[0] + 6, G[1] - 13], [G[0] + 70, -30], '#55603d', false);
    // osa otáčení
    ctx.fillStyle = '#ffd28a';
    ctx.strokeStyle = '#1a1a16';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(E[0], E[1], 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    label(ctx, 'osa – loket', E[0] - 8, E[1] - 40, '#ffd28a', { align: 'right', ts, W, size: 11 });
    dash(ctx, E[0], E[1] - 32, E[0], E[1] - 6, 'rgba(255,210,138,0.7)', 1.2);

    // biceps partnera: od ramene k úponu kousek za loktem, táhne vzhůru
    const ins = this.along(g.insertCm / 100);
    const sh = this.C(this.sk.shoulder);
    ctx.save();
    ctx.strokeStyle = 'rgba(214,72,60,0.85)';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sh[0] + 12, sh[1] + 4);
    ctx.quadraticCurveTo((sh[0] + ins[0]) / 2, sh[1] - 24, ins[0], ins[1] - 6);
    ctx.stroke();
    ctx.restore();
    const lm = 18 + Math.min(70, st.Fm / 30);
    arrow(ctx, ins[0], ins[1] - 4, ins[0], ins[1] - 4 - lm, '#e0605a', 4);
    label(ctx, `biceps ${fmt(st.Fm)} N`, ins[0] + 8, ins[1] - 8 - lm, '#ffb0a0', { align: 'left', ts, W, size: 11 });

    // síla tvé ruky dolů
    const lf = 16 + Math.min(90, st.F / 7);
    const over = st.F > st.maxF;
    arrow(ctx, G[0], G[1] + 12, G[0], G[1] + 12 + lf, over ? '#e0805f' : '#9fd0a0', 4);
    label(ctx, `F ${fmt(st.F)} N`, G[0] + 10, G[1] + 18 + lf * 0.6, over ? '#ffc0a8' : '#c8f0c0', { align: 'left', ts, W, size: 12 });

    // kóty od osy
    const dy = E[1] + 70;
    dash(ctx, E[0], E[1] + 8, E[0], dy + 6, 'rgba(255,210,138,0.6)', 1);
    dash(ctx, G[0], G[1] + 14, G[0], dy + 6, 'rgba(160,220,160,0.5)', 1);
    dim(ctx, E[0], G[0], dy, '#9fd0a0', `r = ${fmt(st.r * 100)} cm`, { at: 'center', ts, W, size: 11 });
    dim(ctx, E[0], ins[0], E[1] - 54, '#ffb0a0', `${g.insertCm} cm`, { ts, W, size: 10 });

    if (st.done) label(ctx, 'plác, plác – vzdává', W - 12, 24, '#ffe2a8', { align: 'right', ts, W, size: 13 });
    this.canvas.setAttribute('aria-label', `Páka na loket: úchop ${fmt(st.r * 100)} cm od lokte, potřebná síla ${fmt(st.F)} N, biceps partnera ${fmt(st.Fm)} N.`);
  }

  /* Tvoje předloktí s rukou (rukáv uniformy, dlaň na jejím předloktí). */
  forearm(ctx, hand, elbowOut, col, under) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(16,12,9,0.9)';
    ctx.lineWidth = 30;
    ctx.beginPath();
    ctx.moveTo(elbowOut[0], elbowOut[1]);
    ctx.lineTo(hand[0], hand[1]);
    ctx.stroke();
    ctx.strokeStyle = col;
    ctx.lineWidth = 27;
    ctx.stroke();
    // dlaň
    ctx.fillStyle = '#d4a07a';
    ctx.strokeStyle = 'rgba(16,12,9,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(hand[0], hand[1] + (under ? -4 : 4), 19, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  paintBackground() {
    const c = document.createElement('canvas');
    const dpr = this.cv.dpr;
    c.width = Math.round(W * dpr);
    c.height = Math.round(H * dpr);
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // betonová zeď srubu a modrá žíněnka
    const wall = g.createLinearGradient(0, 0, 0, H);
    wall.addColorStop(0, '#6b6a63');
    wall.addColorStop(1, '#4e4d47');
    g.fillStyle = wall;
    g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(40,40,36,0.35)';
    for (let y = 30; y < H; y += 40) {
      g.beginPath();
      g.moveTo(0, y + 0.5);
      g.lineTo(W, y + 0.5);
      g.stroke();
    }
    const lamp = g.createRadialGradient(360, 0, 20, 360, 0, 380);
    lamp.addColorStop(0, 'rgba(255,236,190,0.28)');
    lamp.addColorStop(1, 'rgba(255,236,190,0)');
    g.fillStyle = lamp;
    g.fillRect(0, 0, W, H);
    return c;
  }
}
