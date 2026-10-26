/*
 * Nosítka (Vojenská tělovýchova – noční cvičiště): kresba k aktivitě „stretcher“.
 *
 * Dva nosiči v uniformě z js/postava.js drží nosítka za rukojeti: vzadu Doubek (hledí k nosítkům),
 * vpředu hráč (jde první, nosítka má za zády). Raněný leží na zádech hlavou k přednímu nosiči,
 * jeho těžiště je x od rukou zadního nosiče (osa páky). Síly v rukou, těžiště a kóty x a L kreslí
 * scéna; momenty počítá ui.js stejně jako dřív. Raněného jde táhnout – ui.js se ptá scény, jestli
 * ukazatel míří na něj a kolik metrů od osy to je. Plátno 600 × 340.
 */
import { makeBody, pose, drawBody } from './postava.js?v=0.33';
import { fmt, setupCanvas, label, arrow, dash, dim, comMark, background } from './kresba.js?v=0.33';

const W = 600;
const H = 340;
const X0 = 92;                  // ruce zadního nosiče (osa), px
const GY = 300;                 // země
const K = 150;                  // px na metr
const HS = 0.78;                // výška rukojetí nad zemí (m)
const SY = GY - HS * K;         // rukojeti na plátně
const VIEW = { ox: X0, oy: GY, s: K };
const DEG = Math.PI / 180;

/* Nosiči: mírně pokrčená kolena, ruce dolů k rukojetím (dopočítá je postava.js). */
const REAR = { trunk: 8, neck: -4, head: -4, thigh: 16, shin: 12, foot: 0, grip: 'fist' };
const FRONT = { trunk: 3, neck: -2, head: -2, thigh: 14, shin: 10, foot: 0, grip: 'fist' };
/* Raněný na zádech: postava se zrcadlí, aby ležela hlavou dopředu; trup vodorovně, nohy natažené. */
const LYING = {
  trunk: -90, bend: 0, neck: 4, head: 0, thigh: 87, shin: -88, foot: -78, toeFlat: 0,
  uarm: 86, farm: 92, hand: 96, grip: 'open',
  far: { thigh: 87, shin: -88, foot: -72, toeFlat: 0, uarm: 82, farm: 88, hand: 92, grip: 'open' },
};
const LIE_COM = HS + 0.135;     // těžiště raněného nad zemí (leží na plachtě)

export class StretcherScene {
  /* geo: { L (m), H (výška raněného, m), comFrac (těžiště od chodidel, díl výšky), mp (kg), names: { front, rear } } */
  constructor(canvas, geo) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.geo = geo;
    this.patient = makeBody({ style: 'uniforma', height: geo.H, mass: geo.mp, colors: { jacket: '#4e5935', trousers: '#4a5433' } });
    // nosiči stojí pořád stejně – postaví se jednou
    this.rear = this.carrier(makeBody({ style: 'uniforma', height: 1.8, mass: 80 }), REAR, 0, -0.2);
    this.front = this.carrier(makeBody({ style: 'uniforma', height: 1.78, mass: 78, colors: { jacket: '#69743f', trousers: '#5f6a3e' } }), FRONT, geo.L, geo.L + 0.15);
    this.st = null;
    this.cv = setupCanvas(canvas, W, H, (changed) => {
      if (changed) this.bg = null;
      this.render();
    });
  }

  destroy() {
    this.cv.destroy();
  }

  /* Stav z ui.js: { x (m), front, rear (N), done }. */
  set(st) {
    this.st = st;
    this.render();
  }

  /* Metry od zadních rukou pod bodem clientX (pro tažení). */
  toM(clientX) {
    const b = this.canvas.getBoundingClientRect();
    return (((clientX - b.left) / b.width) * W - X0) / K;
  }

  /* Míří ukazatel na raněného? */
  patientAt(clientX, clientY) {
    if (!this.st) return false;
    const b = this.canvas.getBoundingClientRect();
    const sx = ((clientX - b.left) / b.width) * W;
    const sy = ((clientY - b.top) / b.height) * H;
    const g = this.geo;
    const feet = this.st.x - g.comFrac * g.H;
    const head = this.st.x + (1 - g.comFrac) * g.H;
    return sx >= X0 + feet * K - 6 && sx <= X0 + head * K + 6 && sy >= SY - 0.36 * K && sy <= SY + 12;
  }

  /* Nosič s rukama na rukojeti v handX; rameno ve vzdálenosti shoulderX (m od osy). */
  carrier(body, base, handX, shoulderX) {
    const sh = pose(body, base, { ground: 0, x: 0 }).shoulder;
    return pose(body, { ...base, reach: [handX, HS] }, { ground: 0, x: shoulderX - sh[0] });
  }

  render() {
    const ctx = this.ctx;
    const dpr = this.cv ? this.cv.dpr : 1;
    const ts = this.cv ? this.cv.ts : 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!this.bg) this.bg = background('cviciste', W, H, dpr, 262, { lamp: false });   // lampa by svítila na konci nosítek
    ctx.drawImage(this.bg, 0, 0, W, H);
    const st = this.st;
    if (!st) return;
    const g = this.geo;
    const X = (m) => X0 + m * K;

    // nosítka: vzdálenější tyč, plachta, nožky
    this.pole(ctx, SY - 6, true);
    ctx.save();
    const fx0 = X(0.1);
    const fx1 = X(g.L - 0.1);
    ctx.fillStyle = '#3d4834';
    ctx.strokeStyle = '#1f261a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(fx0, SY - 6);
    ctx.lineTo(fx1, SY - 6);
    ctx.lineTo(fx1, SY + 1);
    ctx.quadraticCurveTo((fx0 + fx1) / 2, SY + 9, fx0, SY + 1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#5a5e58';
    ctx.lineWidth = 3;
    for (const lx of [0.32, g.L - 0.32]) {
      ctx.beginPath();
      ctx.moveTo(X(lx) - 6, SY);
      ctx.lineTo(X(lx) - 3, SY + 15);
      ctx.lineTo(X(lx) + 3, SY + 15);
      ctx.lineTo(X(lx) + 6, SY);
      ctx.stroke();
    }
    ctx.restore();

    // raněný (zrcadlená postava, těžiště v x) s obvazem na hlavě
    const sk = pose(this.patient, LYING, { com: [0, LIE_COM] });
    drawBody(ctx, sk, { ox: X(st.x), oy: GY, s: K, flip: true }, {
      hooks: {
        top: (c, Xf) => {
          const P = (x, y) => Xf([sk.head[0] + (x * Math.cos(sk.headDeg * DEG) + y * Math.sin(sk.headDeg * DEG)) * sk.k, sk.head[1] + (-x * Math.sin(sk.headDeg * DEG) + y * Math.cos(sk.headDeg * DEG)) * sk.k]);
          const q = [P(0.098, 0.074), P(0.1, 0.044), P(-0.106, 0.016), P(-0.101, 0.05)];
          c.save();
          c.fillStyle = '#e9e4d6';
          c.strokeStyle = 'rgba(40,30,20,0.6)';
          c.lineWidth = 1;
          c.beginPath();
          c.moveTo(q[0][0], q[0][1]);
          for (let i = 1; i < 4; i++) c.lineTo(q[i][0], q[i][1]);
          c.closePath();
          c.fill();
          c.stroke();
          c.restore();
        },
      },
    });
    this.pole(ctx, SY, false);

    // nosiči
    drawBody(ctx, this.rear, VIEW, { shadow: 0 });
    drawBody(ctx, this.front, VIEW, { shadow: 0 });
    label(ctx, g.names.rear, this.rear.head[0] * K + X0, 13, '#d8cfae', { ts, W, size: 11 });
    label(ctx, g.names.front, this.front.head[0] * K + X0, 13, '#d8cfae', { ts, W, size: 11 });

    // síly v rukou (šipka nahoru, délka podle síly)
    const len = (F) => Math.max(10, F / 6);
    for (const [ax, F, col] of [[X(0), st.rear, '#e0b070'], [X(g.L), st.front, '#9fd0a0']]) {
      arrow(ctx, ax, SY - 7, ax, SY - 7 - len(F), col, 3);
      label(ctx, `${fmt(F)} N`, ax, SY - 17 - len(F) - 2 * ts, col, { ts, W, size: 11 });
    }

    // těžiště raněného, osa, kóty
    const cx = X(st.x);
    const cy = GY - LIE_COM * K;
    dash(ctx, cx, cy + 8, cx, SY + 41, 'rgba(255,210,138,0.85)', 1.2);
    comMark(ctx, cx, cy, 7);
    label(ctx, `těžiště ${g.mp} kg`, cx, cy - 36, '#ffd28a', { ts, W, size: 11 });
    ctx.save();
    ctx.fillStyle = '#ffd28a';
    ctx.strokeStyle = '#1a1a16';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(X0, SY, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    label(ctx, 'osa', X0, SY + 19, '#d8cfae', { ts, W, size: 10 });
    dim(ctx, X0, cx, SY + 41, '#ffd28a', `x = ${fmt(st.x, 2)} m`, { at: 'center', ts, W, size: 10 });
    dim(ctx, X0, X(g.L), SY + 66, '#e8e0c4', `L = ${fmt(g.L, 2)} m`, { at: 'center', ts, W, size: 10 });
    this.canvas.setAttribute('aria-label', `Nosítka: těžiště raněného ${fmt(st.x, 2)} m od rukou zadního nosiče, přední nese ${fmt(st.front)} N, zadní ${fmt(st.rear)} N.`);
  }

  /* Tyč nosítek s rukojetmi na koncích (vzdálenější je výš a tmavší). */
  pole(ctx, y, far) {
    const g = this.geo;
    const x0 = X0 - 0.1 * K;
    const x1 = X0 + (g.L + 0.1) * K;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#14100a';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.stroke();
    ctx.strokeStyle = far ? '#5a432a' : '#7a5a36';
    ctx.lineWidth = 4.5;
    ctx.stroke();
    ctx.strokeStyle = far ? '#2c2a26' : '#3b3934';   // rukojeti
    ctx.lineWidth = 5.5;
    for (const [a, b] of [[x0, X0 + 0.06 * K], [X0 + (g.L - 0.06) * K, x1]]) {
      ctx.beginPath();
      ctx.moveTo(a, y);
      ctx.lineTo(b, y);
      ctx.stroke();
    }
    ctx.restore();
  }
}
