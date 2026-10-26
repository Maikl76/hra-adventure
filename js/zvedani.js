/*
 * Zvedání bedny (Vojenská tělovýchova – výstrojní sklad): kresba k aktivitě „lift“.
 *
 * Postava z js/postava.js drží bednu za úchyt. Ruce se k bedně natahují samy (dosah paže), takže
 * když hráč bednu táhne blíž nebo dál, postava ji opravdu drží. V obraze jsou síly a ramena:
 * tíha trupu a tíha bedny (šipky dlouhé podle velikosti síly), jejich vodorovné vzdálenosti od
 * beder (L5/S1) a oblouk momentu kolem beder. Moment počítá ui.js stejně jako dřív – tady se
 * jen kreslí. Plátno 600 × 420 (logicky); kamera je u shrbené postavy blíž a při narovnání
 * s bednou se oddálí.
 */
import { makeBody, pose, drawBody, lerpPose, armReach, centerOfMass } from './postava.js?v=0.32';
import { rrect, fmt, setupCanvas, label, arrow, dash, dim, comMark, background } from './kresba.js?v=0.32';

const W = 600;
const H = 420;
const CAM = { crouch: { s: 245, ground: 336 }, stand: { s: 185, ground: 352 } };
const BOX = { w: 0.34, h: 0.28, grip: 0.07 };   // bedna z boku: šířka, výška, úchyt pod horní hranou
const FORCE = 0.00042;    // délka šipky v metrech na 1 N
const G = 9.81;
const STAND = { trunk: 3, bend: 0, neck: 0, head: 0, thigh: 2, shin: 4 };

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const lerp = (a, b, t) => a + (b - a) * t;

export class LiftScene {
  /* opts: { loadKg, trunkKg, posture, rk, reducedMotion, onDrag(rk), canDrag() } */
  constructor(canvas, opts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.opts = opts;
    this.body = makeBody({ style: 'uniforma', height: 1.75, mass: 70 });
    this.posture = opts.posture;
    this.rk = opts.rk;
    this.moment = 0;
    this.ok = false;
    this.standOx = this.camX(null);
    this.cur = { pose: { ...opts.posture.pose }, rk: opts.rk, stand: 0, shake: 0, ox: this.camX(opts.posture) };
    this.anim = null;
    this.flash = 0;
    this.raf = 0;
    this.dragging = false;
    this.frame = this.frame.bind(this);
    this.bindPointer();
    this.cv = setupCanvas(canvas, W, H, (changed) => {
      if (changed) this.bg = null;
      this.render();
    });
    canvas.__lift = this;   // pro testy
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.cv.destroy();
    this.canvas.removeEventListener('pointerdown', this.onDown);
    this.canvas.removeEventListener('pointermove', this.onMove);
    this.canvas.removeEventListener('pointerup', this.onUp);
    this.canvas.removeEventListener('pointercancel', this.onUp);
  }

  /* Vodorovná poloha kamery, aby postava s bednou (uprostřed rozsahu) byla uprostřed obrazu. */
  camX(posture) {
    if (!posture) return W / 2 - CAM.stand.s * 0.17;
    const s = CAM.crouch.s;
    const sk = pose(this.body, posture.pose, { ground: 0, x: 0 });
    const minX = Math.min(sk.T(-0.04, -0.13)[0], -0.08);
    const maxX = Math.max(sk.l5[0] + (posture.rMin + posture.rMax) / 200 + BOX.w / 2, sk.head[0] + 0.12);
    return W / 2 + 24 - s * (minX + maxX) / 2;
  }

  /* Nový stav z ui.js: držení těla, vzdálenost bedny (cm), moment a jestli stačí. */
  set({ posture, rk, moment, ok }) {
    const changed = posture && posture !== this.posture;
    if (moment !== undefined) this.moment = moment;
    if (ok !== undefined) this.ok = ok;
    if (changed) {
      this.posture = posture;
      this.rk = rk;
      this.animate({ pose: { ...posture.pose }, rk, ox: this.camX(posture) }, this.opts.reducedMotion ? 0 : 450);
      return;
    }
    if (rk !== undefined) {
      this.rk = rk;
      if (!this.anim) this.cur.rk = rk;
      else if (this.anim.to) this.anim.to.rk = rk;
    }
    this.render();
  }

  animate(to, dur) {
    const from = { pose: { ...this.cur.pose }, rk: this.cur.rk, stand: this.cur.stand, ox: this.cur.ox };
    if (!dur) {
      Object.assign(this.cur, to);
      this.render();
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.anim = { from, to: { ...from, ...to }, t0: performance.now(), dur, resolve };
      this.loop();
    });
  }

  /* Pokus o zvednutí: úspěch = postava se s bednou narovná; neúspěch = záda se zachvějí. */
  lift(success) {
    if (success) return this.animate({ stand: 1 }, this.opts.reducedMotion ? 0 : 1500);
    this.flash = performance.now();
    if (this.opts.reducedMotion) {
      this.loop();
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.anim = { shake: true, t0: performance.now(), dur: 650, resolve };
      this.loop();
    });
  }

  loop() {
    if (!this.raf) this.raf = requestAnimationFrame(this.frame);
  }

  frame(now) {
    this.raf = 0;
    const a = this.anim;
    if (a) {
      const t = Math.min(1, (now - a.t0) / a.dur);
      if (a.shake) {
        this.cur.shake = Math.sin(t * Math.PI * 9) * (1 - t) * 1.6;
      } else {
        const e = ease(t);
        this.cur.pose = lerpPose(a.from.pose, a.to.pose, e);
        this.cur.rk = lerp(a.from.rk, a.to.rk, e);
        this.cur.stand = lerp(a.from.stand, a.to.stand, e);
        this.cur.ox = lerp(a.from.ox, a.to.ox, e);
      }
      if (t >= 1) {
        this.anim = null;
        this.cur.shake = 0;
        if (!a.shake) this.cur.rk = this.rk;
        a.resolve();
      }
    }
    this.render();
    if (this.anim || (this.flash && now - this.flash < 900)) this.loop();
    else this.flash = 0;
  }

  /* ---------- Geometrie: kamera, póza, úchyt bedny ---------- */

  view() {
    const e = ease(this.cur.stand);
    return {
      ox: lerp(this.cur.ox, this.standOx, e),
      oy: lerp(CAM.crouch.ground, CAM.stand.ground, e),
      s: lerp(CAM.crouch.s, CAM.stand.s, e),
    };
  }

  layout() {
    const body = this.body;
    const st = this.cur.stand;
    const base = { ...this.cur.pose, trunk: (this.cur.pose.trunk || 0) + this.cur.shake };
    const p = st > 0 ? lerpPose(base, STAND, ease(st)) : base;
    const place = { ground: 0, x: 0 };
    const sk0 = pose(body, p, place);
    // úchyt bedny: vodorovně „rk“ od beder, výškou tam, kam dosáhne skoro natažená paže
    const R = armReach(body) * 0.965;
    let gx = sk0.l5[0] + this.cur.rk / 100;
    const dx = gx - sk0.shoulder[0];
    let gy = sk0.shoulder[1] - Math.sqrt(Math.max(0, R * R - dx * dx));
    gy = Math.max(gy, BOX.h - BOX.grip + 0.012);
    if (st > 0) {
      // při zvedání se bedna přesune k břichu do výšky pasu
      const skS = pose(body, STAND, place);
      const hold = [skS.l5[0] + 0.27, skS.hip[1] + 0.03];
      const e = ease(st);
      gx = lerp(gx, hold[0], e);
      gy = lerp(gy, hold[1], e);
    }
    const sk = pose(body, { ...p, reach: [gx, gy], grip: 'fist' }, place);
    const box = { cx: gx, cy: gy - (BOX.h / 2 - BOX.grip), w: BOX.w, h: BOX.h };
    return { sk, box };
  }

  /* ---------- Kreslení ---------- */

  render() {
    const ctx = this.ctx;
    const dpr = this.cv ? this.cv.dpr : 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!this.bg) this.bg = background('sklad', W, H, dpr, 296);
    ctx.drawImage(this.bg, 0, 0, W, H);
    const { sk, box } = this.layout();
    const view = this.view();
    this.lastBox = box;
    this.lastSk = sk;
    this.lastView = view;
    const X = (p) => [view.ox + p[0] * view.s, view.oy - p[1] * view.s];

    // stín bedny na zemi
    const bc = X([box.cx, 0]);
    const lift = box.cy - box.h / 2;
    ctx.fillStyle = `rgba(0,0,0,${0.35 / (1 + lift * 4)})`;
    ctx.beginPath();
    ctx.ellipse(bc[0], bc[1], (box.w / 2) * view.s * (1 + lift * 0.6), 6, 0, 0, Math.PI * 2);
    ctx.fill();

    const drawBox = () => this.paintBox(ctx, X, box, view.s);
    const between = this.posture.boxBetweenLegs && this.cur.stand < 0.5;
    drawBody(ctx, sk, view, {
      shadow: 0,
      armBehindLeg: between,
      hooks: between ? { between: drawBox } : { front: drawBox },
    });
    this.paintOverlay(ctx, X, sk, box, view);
    this.canvas.setAttribute('aria-label', `Postava zvedá bednu ${this.opts.loadKg} kg, bedna je ${fmt(this.rk)} cm od beder.`);
  }

  paintBox(ctx, X, b, s) {
    const [x, y] = X([b.cx - b.w / 2, b.cy + b.h / 2]);
    const w = b.w * s;
    const h = b.h * s;
    ctx.save();
    const wood = ctx.createLinearGradient(x, y, x, y + h);
    wood.addColorStop(0, '#8a6038');
    wood.addColorStop(1, '#5c3d22');
    ctx.fillStyle = wood;
    rrect(ctx, x, y, w, h, 3);
    ctx.fill();
    // prkna a lišty
    ctx.strokeStyle = 'rgba(30,18,8,0.7)';
    ctx.lineWidth = 1.2;
    for (const f of [1 / 3, 2 / 3]) {
      ctx.beginPath();
      ctx.moveTo(x + 2, y + h * f);
      ctx.lineTo(x + w - 2, y + h * f);
      ctx.stroke();
    }
    const bw = 0.028 * s;
    ctx.fillStyle = 'rgba(40,24,10,0.45)';
    ctx.fillRect(x + 2, y + 2, bw, h - 4);
    ctx.fillRect(x + w - 2 - bw, y + 2, bw, h - 4);
    ctx.strokeStyle = 'rgba(255,220,170,0.08)';
    for (let i = 0; i < 6; i++) {
      const yy = y + 6 + (i * h) / 6.4;
      ctx.beginPath();
      ctx.moveTo(x + bw + 5, yy);
      ctx.bezierCurveTo(x + w * 0.4, yy + 2, x + w * 0.6, yy - 2, x + w - bw - 5, yy + 1);
      ctx.stroke();
    }
    ctx.fillStyle = '#2a2a26';
    const nx = 2 + bw / 2;
    for (const [px, py] of [[x + nx, y + 6], [x + nx, y + h - 6], [x + w - nx, y + 6], [x + w - nx, y + h - 6]]) {
      ctx.beginPath();
      ctx.arc(px, py, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // výřez úchytu
    const gy = y + BOX.grip * s;
    ctx.fillStyle = '#140d07';
    rrect(ctx, x + w / 2 - 0.055 * s, gy - 0.017 * s, 0.11 * s, 0.034 * s, 0.017 * s);
    ctx.fill();
    // nápis barvou přes šablonu
    ctx.fillStyle = 'rgba(232,220,180,0.55)';
    ctx.font = `700 ${Math.round(0.05 * s)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${this.opts.loadKg} kg`, x + w / 2, y + h * 0.7);
    ctx.strokeStyle = '#1e140b';
    ctx.lineWidth = 1.8;
    rrect(ctx, x, y, w, h, 3);
    ctx.stroke();
    ctx.restore();
  }

  paintOverlay(ctx, X, sk, box, view) {
    const ts = this.cv ? this.cv.ts : 1;
    const lab = (text, x, y, col, align = 'center') => label(ctx, text, x, y, col, { align, ts, W });
    const arrowW = (p0, p1, col, w) => arrow(ctx, ...X(p0), ...X(p1), col, w);
    const dashW = (p0, p1, col) => dash(ctx, ...X(p0), ...X(p1), col);
    const standing = this.cur.stand > 0.02;
    const l5 = sk.l5;
    const col = this.ok ? '#9fd07a' : '#ff8a66';
    const flashOn = this.flash && (performance.now() - this.flash) < 900;

    if (!standing) {
      const trunkArm = this.posture.trunkArmCm / 100;
      const hat = centerOfMass(sk, true);
      const tx = l5[0] + trunkArm;
      const tTop = [tx, hat[1]];
      const tBot = [tx, hat[1] - this.opts.trunkKg * G * FORCE];
      const bTop = [box.cx, box.cy];
      const bBot = [box.cx, box.cy - this.opts.loadKg * G * FORCE];
      // kóty pod sebou; na malé obrazovce jsou popisky větší, tak víc od sebe
      const y1 = -0.07;
      const y2 = y1 - Math.max(0.075, (16 * ts + 5) / view.s);
      // svislice beder, svislice sil a ramena (kóty na podlaze před postavou)
      dashW([l5[0], l5[1] + 0.12], [l5[0], y2], 'rgba(232,224,196,0.55)');
      dashW(tBot, [tx, y1], 'rgba(255,179,92,0.55)');
      dashW([box.cx, box.cy - box.h / 2], [box.cx, y2], 'rgba(255,210,138,0.55)');
      const kota = (x0, x1, y, c, text) => dim(ctx, X([x0, y])[0], X([x1, y])[0], X([0, y])[1], c, text, { ts, W });
      kota(l5[0], tx, y1, '#ffb35c', `rameno trupu ${fmt(this.posture.trunkArmCm)} cm`);
      kota(l5[0], box.cx, y2, '#ffd28a', `rameno bedny ${fmt(this.rk)} cm`);
      // tíha trupu a bedny
      arrowW(tTop, tBot, '#ffb35c', 3.2);
      comMark(ctx, ...X(tTop));
      arrowW(bTop, bBot, '#ffd28a', 3.2);
      const tb = X(tBot);
      lab(`tíha trupu ${fmt(this.opts.trunkKg * G)} N`, tb[0] + 10, tb[1] + 4, '#ffb35c', 'left');
      const bb = X([box.cx + box.w / 2, box.cy + box.h / 2]);
      lab(`tíha bedny ${fmt(this.opts.loadKg * G)} N`, bb[0] + 6, bb[1] - 10, '#ffd28a', 'left');
      // zádové svaly táhnou podél zad na krátkém rameni
      arrowW(sk.T(0.03, -0.17), sk.T(0.45, -0.17), '#ff7a59', 2.6);
      const bm = X(sk.T(0.5, -0.2));
      lab('zádové svaly', bm[0] - 4, bm[1] - 14, '#ff9a7a', 'right');
    }

    // oblouk momentu kolem beder
    const [lx, ly] = X(l5);
    const R = 22;
    if (!standing && this.moment > 0) {
      const ang = Math.min(300, (this.moment / 250) * 300) * Math.PI / 180;
      const a0 = -Math.PI / 2;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(12,10,6,0.75)';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(lx, ly, R, a0, a0 + ang);
      ctx.stroke();
      ctx.strokeStyle = col;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(lx, ly, R, a0, a0 + ang);
      ctx.stroke();
      const ex = lx + R * Math.cos(a0 + ang);
      const ey = ly + R * Math.sin(a0 + ang);
      const ta = a0 + ang + Math.PI / 2;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(ex + Math.cos(ta) * 8, ey + Math.sin(ta) * 8);
      ctx.lineTo(ex + Math.cos(ta - 2.3) * 8, ey + Math.sin(ta - 2.3) * 8);
      ctx.lineTo(ex + Math.cos(ta + 2.3) * 8, ey + Math.sin(ta + 2.3) * 8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    // bod beder (L5/S1)
    const pulse = flashOn ? 0.5 + 0.5 * Math.sin((performance.now() - this.flash) / 60) : 0;
    const glow = ctx.createRadialGradient(lx, ly, 0, lx, ly, 14 + pulse * 10);
    glow.addColorStop(0, flashOn ? 'rgba(255,90,60,0.9)' : 'rgba(255,210,138,0.75)');
    glow.addColorStop(1, 'rgba(255,210,138,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(lx, ly, 14 + pulse * 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd28a';
    ctx.strokeStyle = '#1a1a16';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(lx, ly, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (!standing) {
      lab('bedra (L5/S1)', lx - R - 8, ly + 4, '#ffd28a', 'right');
      lab(`moment ${fmt(this.moment)} N·m`, lx - R - 8, ly + 6 + 17 * ts, col, 'right');
    }
  }

  /* ---------- Tažení bedny ---------- */

  bindPointer() {
    const toLocal = (e) => {
      const r = this.canvas.getBoundingClientRect();
      return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
    };
    const onBox = ([x, y]) => {
      const b = this.lastBox;
      const v = this.lastView;
      if (!b || !v) return false;
      const m = 12;
      const x0 = v.ox + (b.cx - b.w / 2) * v.s - m;
      const x1 = v.ox + (b.cx + b.w / 2) * v.s + m;
      const y0 = v.oy - (b.cy + b.h / 2) * v.s - m;
      const y1 = v.oy - (b.cy - b.h / 2) * v.s + m;
      return x >= x0 && x <= x1 && y >= y0 && y <= y1;
    };
    const canDrag = () => !this.opts.canDrag || this.opts.canDrag();
    this.onDown = (e) => {
      if (!canDrag()) return;
      const p = toLocal(e);
      if (!onBox(p)) return;
      e.preventDefault();
      this.dragging = true;
      this.grabDx = p[0] - (this.lastView.ox + this.lastBox.cx * this.lastView.s);
      this.canvas.setPointerCapture(e.pointerId);
      this.canvas.style.cursor = 'grabbing';
    };
    this.onMove = (e) => {
      const p = toLocal(e);
      if (!this.dragging) {
        this.canvas.style.cursor = canDrag() && onBox(p) ? 'grab' : '';
        return;
      }
      const v = this.lastView;
      const wx = (p[0] - this.grabDx - v.ox) / v.s;
      const rk = Math.round((wx - this.lastSk.l5[0]) * 100);
      const r = Math.max(this.posture.rMin, Math.min(this.posture.rMax, rk));
      if (r !== this.rk && this.opts.onDrag) this.opts.onDrag(r);
    };
    this.onUp = () => {
      if (!this.dragging) return;
      this.dragging = false;
      this.canvas.style.cursor = '';
    };
    this.canvas.addEventListener('pointerdown', this.onDown);
    this.canvas.addEventListener('pointermove', this.onMove);
    this.canvas.addEventListener('pointerup', this.onUp);
    this.canvas.addEventListener('pointercancel', this.onUp);
  }
}
