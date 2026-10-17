/*
 * Basketbalový automat (GSPORT, LEVEL 2): trestný hod z boku.
 *
 * Šikmý vrh míče z výšky rukou na koš ve skutečných rozměrech: obroučka 305 cm vysoko, 4,225 m od
 * čáry trestného hodu, vnitřní průměr 45 cm, míč 24 cm, deska 37,5 cm za středem obroučky. Míč se
 * odráží od předního a zadního okraje obroučky a od desky. Dopadový úhel ukazuje, jak velký otvor
 * obroučka míči nabízí: 45 cm · sin(úhel) – při plochém oblouku je menší než míč.
 *
 * Ovládání: tah od míče dozadu jako prak (směr = úhel odhodu, délka tahu = rychlost), puštění = hod.
 * ui.js k tomu přidává klávesy a tlačítka (± úhel, ± rychlost, hod se stejným nastavením).
 */

export const G = 9.81;
export const COURT = {
  release: 2.2,       // výška míče při vypuštění (ruce nad hlavou), m
  distance: 4.225,    // vodorovně od čáry trestného hodu ke středu obroučky, m
  rim: 3.05,          // výška obroučky, m
  ringR: 0.225,       // vnitřní poloměr obroučky, m
  ballR: 0.12,        // poloměr míče, m
  board: 0.375,       // deska za středem obroučky, m
  boardBottom: 2.9,
  boardTop: 3.95,
};
export const LIMITS = { angle: [15, 80], speed: [4, 11] };

const RIM_TUBE = 0.01;
const E_RIM = 0.55;   // odrazivost obroučky
const E_BOARD = 0.6;
const E_FLOOR = 0.55;

/* Let míče: vrací dráhu (body po 1/60 s), výsledek a průchod rovinou obroučky (kde, pod jakým úhlem). */
export function simulate(angleDeg, speed, court = COURT) {
  const c = court;
  const dt = 1 / 600;
  const a = (angleDeg * Math.PI) / 180;
  let x = 0, y = c.release, vx = speed * Math.cos(a), vy = speed * Math.sin(a);
  const rb = c.ballR;
  const rims = [{ x: c.distance - c.ringR, y: c.rim }, { x: c.distance + c.ringR, y: c.rim }];
  const boardX = c.distance + c.board;
  const path = [[0, x, y]];
  let t = 0, next = 1 / 60, prevY = y;
  let rim = false, board = false, made = false, bounces = 0;
  // kde a pod jakým úhlem by míč volným letem prošel rovinou obroučky směrem dolů (bez odrazů)
  const vy0 = vy, vx0 = vx, disc = vy0 * vy0 - 2 * G * (c.rim - c.release);
  let cross = null;
  if (disc >= 0) {
    const tc = (vy0 + Math.sqrt(disc)) / G;
    cross = { x: vx0 * tc, entry: (Math.atan2(G * tc - vy0, vx0) * 180) / Math.PI };
  }
  while (t < 5) {
    vy -= G * dt;
    x += vx * dt;
    y += vy * dt;
    t += dt;
    for (const p of rims) {
      const dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy), min = rb + RIM_TUBE;
      if (d < min && d > 0) {
        const nx = dx / d, ny = dy / d;
        const vn = vx * nx + vy * ny;
        if (vn < 0) {
          const tx = -ny, ty = nx, vt = (vx * tx + vy * ty) * 0.85;
          const vn2 = -vn * E_RIM;
          vx = vn2 * nx + vt * tx;
          vy = vn2 * ny + vt * ty;
        }
        x = p.x + nx * min;
        y = p.y + ny * min;
        rim = true;
      }
    }
    if (vx > 0 && x + rb > boardX && x < boardX && y > c.boardBottom - rb * 0.5 && y < c.boardTop + rb * 0.5) {
      x = boardX - rb;
      vx = -vx * E_BOARD;
      vy *= 0.9;
      board = true;
    }
    if (!made && prevY >= c.rim - 0.06 && y < c.rim - 0.06 && vy < 0 && x > rims[0].x && x < rims[1].x) {
      made = true;
      vx *= 0.3;   // síťka míč zbrzdí
    }
    if (y < rb) {
      y = rb;
      vy = -vy * E_FLOOR;
      vx *= 0.8;
      bounces += 1;
      if (bounces >= 2 || Math.abs(vy) < 0.8) { path.push([t, x, y]); break; }
    }
    if (x > 7 || x < -1.5) { path.push([t, x, y]); break; }
    if (t >= next) { path.push([t, x, y]); next += 1 / 60; }
    prevY = y;
  }
  let result;
  if (made) result = rim || board ? 'kos' : 'cisty';
  else if (!cross) result = 'nizko';
  else if (rim) result = 'obroucka';
  else if (board) result = 'deska';
  else result = cross.x < c.distance ? 'kratky' : 'dlouhy';
  const opening = cross ? 2 * c.ringR * Math.sin((cross.entry * Math.PI) / 180) : 0;
  return { path, made, result, rim, board, cross, opening, miss: cross ? cross.x - c.distance : null };
}

const round1 = (v) => Math.round(v * 10) / 10;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/* Kreslení a ovládání automatu na plátně 800 × 450. */
export class Basket {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    canvas.width = 800;
    canvas.height = 450;
    this.opts = opts;
    this.S = 90;                 // px na metr
    this.ox = 150;               // x místa odhodu
    this.floor = 430;            // y podlahy
    this.aim = { angle: opts.angle || 45, speed: opts.speed || 6.5 };
    this.ghosts = [];            // poslední dráhy (slabě)
    this.flying = null;
    this.drag = null;
    this.score = { throw: 0, made: 0, of: opts.throws || 10 };
    this.flash = null;
    this.raf = 0;
    this.onDown = (e) => this.pointer(e, 'down');
    this.onMove = (e) => this.pointer(e, 'move');
    this.onUp = (e) => this.pointer(e, 'up');
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onUp);
    this.draw();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.canvas.removeEventListener('pointerdown', this.onDown);
    this.canvas.removeEventListener('pointermove', this.onMove);
    this.canvas.removeEventListener('pointerup', this.onUp);
    this.canvas.removeEventListener('pointercancel', this.onUp);
  }

  px(x, y) {
    return [this.ox + x * this.S, this.floor - y * this.S];
  }

  ballPos() {
    return this.px(0, COURT.release);
  }

  setAim(angle, speed) {
    this.aim = { angle: clamp(Math.round(angle), ...LIMITS.angle), speed: clamp(round1(speed), ...LIMITS.speed) };
    if (this.opts.onAim) this.opts.onAim(this.aim);
    this.draw();
  }

  adjust(dAngle, dSpeed) {
    if (this.flying) return;
    this.setAim(this.aim.angle + dAngle, this.aim.speed + dSpeed);
  }

  /* Prak: tah od míče dozadu; směr opačný k tahu = směr hodu, délka tahu = rychlost. */
  pointer(e, kind) {
    if (this.flying || this.disabled) return;
    const r = this.canvas.getBoundingClientRect();
    const mx = ((e.clientX - r.left) / r.width) * 800, my = ((e.clientY - r.top) / r.height) * 450;
    if (kind === 'down') {
      this.drag = { moved: false };
      this.canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
    }
    if (!this.drag) return;
    const [bx, by] = this.ballPos();
    const dx = bx - mx, dy = my - by;
    const len = Math.hypot(dx, dy);
    if (len > 18) {
      this.drag.moved = true;
      this.setAim((Math.atan2(dy, dx) * 180) / Math.PI, 4 + len / 45);
    }
    if (kind === 'up') {
      const moved = this.drag.moved;
      this.drag = null;
      if (moved) this.throw();
      else this.draw();
    }
  }

  throw() {
    if (this.flying || this.disabled || this.score.throw >= this.score.of) return null;
    const res = simulate(this.aim.angle, this.aim.speed);
    this.score.throw += 1;
    this.flash = null;
    const speedUp = this.opts.reducedMotion ? 3 : 1;
    const t0 = performance.now();
    const end = res.path[res.path.length - 1][0];
    this.flying = { res, t: 0 };
    const tick = (now) => {
      const t = ((now - t0) / 1000) * speedUp;
      this.flying.t = Math.min(t, end);
      this.draw();
      if (t < end) {
        this.raf = requestAnimationFrame(tick);
        return;
      }
      if (res.made) this.score.made += 1;
      this.ghosts.push(res.path);
      if (this.ghosts.length > 3) this.ghosts.shift();
      this.flying = null;
      this.flash = { made: res.made, t0: performance.now() };
      this.draw();
      if (this.opts.onThrow) this.opts.onThrow(res, { ...this.score }, { ...this.aim });
    };
    this.raf = requestAnimationFrame(tick);
    return res;
  }

  newRound() {
    this.score = { throw: 0, made: 0, of: this.score.of };
    this.ghosts = [];
    this.draw();
  }

  /* ---------- kreslení ---------- */
  draw() {
    const g = this.ctx;
    const c = COURT;
    const neonPink = '#ff4fd8', neonCyan = '#36e4ff', orange = '#ff8a2a';
    const bg = g.createLinearGradient(0, 0, 0, 450);
    bg.addColorStop(0, '#1b1030');
    bg.addColorStop(1, '#0b0714');
    g.fillStyle = bg;
    g.fillRect(0, 0, 800, 450);
    // podlaha a čára trestného hodu
    g.fillStyle = '#2a1a12';
    g.fillRect(0, this.floor, 800, 20);
    g.strokeStyle = neonCyan;
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, this.floor); g.lineTo(800, this.floor); g.stroke();
    const [fx] = this.px(0, 0);
    g.fillStyle = '#e8e2d0';
    g.fillRect(fx - 14, this.floor - 2, 28, 4);
    // míry (malým písmem, ať je vidět, že jde o skutečné rozměry)
    g.fillStyle = 'rgba(255,255,255,0.45)';
    g.font = '13px sans-serif';
    g.textAlign = 'center';
    const [hx, hy] = this.px(c.distance, c.rim);
    g.fillText('4,225 m', (fx + hx) / 2, this.floor + 16);
    // koš: tyč, deska, obroučka, síťka
    const [bxL, byT] = this.px(c.distance + c.board, c.boardTop);
    const [, byB] = this.px(0, c.boardBottom);
    g.fillStyle = '#3b3b48';
    g.fillRect(bxL + 30, byT + 20, 12, this.floor - byT - 20);
    g.fillRect(bxL + 4, (byT + byB) / 2 - 4, 30, 8);
    g.fillStyle = 'rgba(230,240,255,0.12)';
    g.fillRect(bxL, byT, 6, byB - byT);
    g.strokeStyle = neonPink;
    g.lineWidth = 3;
    g.strokeRect(bxL, byT, 6, byB - byT);
    const [rx1] = this.px(c.distance - c.ringR, c.rim);
    const [rx2] = this.px(c.distance + c.ringR, c.rim);
    g.strokeStyle = 'rgba(255,255,255,0.55)';
    g.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const top = rx1 + ((rx2 - rx1) * i) / 4;
      const bot = rx1 + 8 + ((rx2 - rx1 - 16) * i) / 4;
      g.beginPath(); g.moveTo(top, hy); g.lineTo(bot, hy + 34); g.stroke();
    }
    g.beginPath(); g.moveTo(rx1 + 4, hy + 17); g.lineTo(rx2 - 4, hy + 17); g.stroke();
    g.strokeStyle = orange;
    g.lineWidth = 4;
    g.beginPath(); g.moveTo(rx1, hy); g.lineTo(rx2, hy); g.lineTo(bxL, hy); g.stroke();
    // kóta výšky obroučky
    g.strokeStyle = 'rgba(255,255,255,0.3)';
    g.lineWidth = 1;
    g.setLineDash([3, 4]);
    g.beginPath(); g.moveTo(rx1 - 14, this.floor); g.lineTo(rx1 - 14, hy); g.stroke();
    g.setLineDash([]);
    g.fillStyle = 'rgba(255,255,255,0.45)';
    g.textAlign = 'right';
    g.fillText('305 cm', rx1 - 20, (this.floor + hy) / 2);
    g.textAlign = 'center';
    // hráč (silueta s rukama nad hlavou)
    const [px0, py0] = this.px(0, 0);
    g.strokeStyle = '#8d86a8';
    g.lineWidth = 7;
    g.lineCap = 'round';
    const hip = [px0 - 6, py0 - 95], neck = [px0 - 10, py0 - 152];
    g.beginPath(); g.moveTo(px0 - 22, py0); g.lineTo(hip[0], hip[1]); g.lineTo(px0 + 10, py0); g.stroke();
    g.beginPath(); g.moveTo(hip[0], hip[1]); g.lineTo(neck[0], neck[1]); g.stroke();
    const [bx, by] = this.ballPos();
    g.beginPath(); g.moveTo(neck[0], neck[1] + 6); g.lineTo(bx - 14, by + 22); g.lineTo(bx - 6, by + 8); g.stroke();
    g.fillStyle = '#8d86a8';
    g.beginPath(); g.arc(neck[0] - 4, neck[1] - 16, 13, 0, Math.PI * 2); g.fill();
    // slabě předchozí dráhy
    g.lineWidth = 1.5;
    g.setLineDash([4, 6]);
    this.ghosts.forEach((p, i) => {
      g.strokeStyle = `rgba(255,138,42,${0.18 + 0.12 * i})`;
      g.beginPath();
      p.forEach(([, x, y], k) => { const [X, Y] = this.px(x, y); if (k) g.lineTo(X, Y); else g.moveTo(X, Y); });
      g.stroke();
    });
    g.setLineDash([]);
    // míč (v letu, nebo v rukou) a míření
    let ball = [bx, by];
    if (this.flying) {
      const { path } = this.flying.res;
      let k = 0;
      while (k < path.length - 1 && path[k + 1][0] <= this.flying.t) k += 1;
      const p = path[k], q = path[Math.min(k + 1, path.length - 1)];
      const f = q[0] > p[0] ? (this.flying.t - p[0]) / (q[0] - p[0]) : 0;
      ball = this.px(p[1] + (q[1] - p[1]) * f, p[2] + (q[2] - p[2]) * f);
    } else if (!this.disabled && this.score.throw < this.score.of) {
      const a = (this.aim.angle * Math.PI) / 180, L = this.aim.speed * 14;
      g.strokeStyle = this.drag ? neonCyan : 'rgba(54,228,255,0.6)';
      g.lineWidth = 3;
      g.setLineDash([8, 6]);
      g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + Math.cos(a) * L, by - Math.sin(a) * L); g.stroke();
      g.setLineDash([]);
      g.fillStyle = neonCyan;
      g.font = 'bold 16px sans-serif';
      g.textAlign = 'left';
      g.fillText(`${this.aim.angle}° · ${String(this.aim.speed.toFixed(1)).replace('.', ',')} m/s`, bx + Math.cos(a) * L + 8, by - Math.sin(a) * L - 6);
    }
    const r = COURT.ballR * this.S;
    g.fillStyle = orange;
    g.beginPath(); g.arc(ball[0], ball[1], r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#5a2a08';
    g.lineWidth = 1.5;
    g.beginPath(); g.arc(ball[0], ball[1], r, 0, Math.PI * 2); g.moveTo(ball[0] - r, ball[1]); g.lineTo(ball[0] + r, ball[1]);
    g.moveTo(ball[0], ball[1] - r); g.lineTo(ball[0], ball[1] + r); g.stroke();
    // tabule automatu
    g.textAlign = 'left';
    g.font = 'bold 22px monospace';
    g.fillStyle = neonPink;
    g.fillText(`HOD ${Math.min(this.score.throw, this.score.of)}/${this.score.of}`, 16, 34);
    g.fillStyle = neonCyan;
    g.fillText(`KOŠE ${this.score.made}`, 16, 62);
    if (this.flash && performance.now() - this.flash.t0 < 1400) {
      g.font = 'bold 40px monospace';
      g.textAlign = 'center';
      g.fillStyle = this.flash.made ? '#7dff9a' : 'rgba(255,90,90,0.9)';
      g.fillText(this.flash.made ? 'KOŠ!' : 'VEDLE', 400, 120);
      cancelAnimationFrame(this.raf);
      this.raf = requestAnimationFrame(() => this.draw());
    }
  }
}
