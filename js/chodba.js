/*
 * Chodba „z vlastních očí“ (zkouška – sklepní chodba mezi výstrojním skladem a tělocvičnou).
 *
 * Hráč chodí po čtvercové síti po krocích a otáčí se o 90° (jako staré „dungeonovky“); přechod
 * mezi políčky je krátká plynulá animace (při „omezit pohyb“ v systému okamžitá). Svět se kreslí
 * po sloupcích obrazu jako ve hrách DOOM a Wolfenstein: pro každý sloupec se spočítá, kde paprsek
 * narazí na zeď, a podle vzdálenosti se nakreslí její výška. Podlaha a strop se dopočítají po řádcích.
 * Světlo: lampy na stropě (jedna může blikat), svítilna hráče a ztráta světla do dálky.
 *
 * Mapa a textury jsou v game.json u místnosti („corridor“): řádky mapy, kde „.“ je chodba a ostatní
 * znaky jsou zdi s texturou podle „legend“ (textura může záviset na stavu hry – „when“).
 * Načítá se až v chodbě (dynamický import z ui.js).
 */

const W = 800, H = 450;            // vnitřní rozlišení (CSS obraz roztáhne na scénu 16 : 9)
const TEX = 512;                    // textury se převzorkují na 512 × 512
const BACK = 0.36;                  // oko stojí kousek za středem políčka – zeď před hráčem je vidět celá
const FOV = 0.66;                   // šířka zorného pole (asi 66°)
const STEP_MS = 300, TURN_MS = 260, BUMP_MS = 220;
const DIRS = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
const ORDER = ['N', 'E', 'S', 'W'];
const ANGLE = { E: 0, S: Math.PI / 2, W: Math.PI, N: -Math.PI / 2 };

async function loadTexture(src) {
  const img = new Image();
  img.src = src;
  try {
    await img.decode();
  } catch (e) {
    await new Promise((ok, fail) => { img.onload = ok; img.onerror = fail; if (img.complete) ok(); });
  }
  const c = document.createElement('canvas');
  c.width = c.height = TEX;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, TEX, TEX);
  return new Uint32Array(g.getImageData(0, 0, TEX, TEX).data.buffer.slice(0));
}

/* Náhradní textura, když se obrázek nenačte (šedá s mřížkou). */
function fallbackTexture() {
  const t = new Uint32Array(TEX * TEX);
  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
      const line = x % 64 === 0 || y % 64 === 0;
      const v = line ? 60 : 110;
      t[y * TEX + x] = (255 << 24) | (v << 16) | (v << 8) | v;
    }
  }
  return t;
}

const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

export class Corridor {
  /* def = „corridor“ z game.json; opts: { check(when) → bool, reducedMotion } */
  constructor(canvas, def, opts = {}) {
    this.canvas = canvas;
    canvas.width = W;
    canvas.height = H;
    this.ctx = canvas.getContext('2d');
    this.image = this.ctx.createImageData(W, H);
    this.buf = new Uint32Array(this.image.data.buffer);
    this.def = def;
    this.map = def.map;
    this.check = opts.check || (() => true);
    this.reduced = Boolean(opts.reducedMotion);
    this.tex = {};
    this.flashlight = false;
    this.pos = { ...def.start };
    this.cam = { x: this.pos.x + 0.5, y: this.pos.y + 0.5, a: ANGLE[this.pos.dir] };
    this.anim = null;
    this.visited = new Set();
    this.dirty = true;
    this.raf = 0;
    this.lastFlicker = 0;
    this.hasFlicker = (def.lamps || []).some((l) => l.flicker);
  }

  async load() {
    const entries = Object.entries(this.def.textures || {});
    await Promise.all(entries.map(async ([name, src]) => {
      try {
        this.tex[name] = await loadTexture(src);
      } catch (e) {
        console.warn(`Chodba: textura ${name} (${src}) se nenačetla.`);
        this.tex[name] = fallbackTexture();
      }
    }));
  }

  /* ---------- mapa ---------- */

  cell(x, y) {
    if (y < 0 || y >= this.map.length || x < 0 || x >= this.map[y].length) return '#';
    return this.map[y][x];
  }

  isFloor(x, y) {
    return this.cell(x, y) === '.';
  }

  /* Textura zdi podle znaku v mapě; „legend“ může mít seznam variant s podmínkou „when“. */
  wallTexture(x, y) {
    let entry = (this.def.legend || {})[this.cell(x, y)];
    if (Array.isArray(entry)) {
      const hit = entry.find((v) => !v.when || this.check(v.when));
      entry = hit ? hit.texture : null;
    }
    return this.tex[entry] || this.tex[this.def.wall] || (this.tex._fallback ||= fallbackTexture());
  }

  /* ---------- poloha a pohyb ---------- */

  setPosition(p) {
    const dir = DIRS[p.dir] ? p.dir : 'N';
    this.pos = { x: p.x, y: p.y, dir };
    this.cam = { x: p.x + 0.5, y: p.y + 0.5, a: ANGLE[dir] };
    if (Array.isArray(p.visited)) p.visited.forEach((k) => this.visited.add(k));
    this.visited.add(`${p.x},${p.y}`);
    this.dirty = true;
  }

  position() {
    return { ...this.pos, visited: [...this.visited] };
  }

  /* Políčka kolem hráče: před ním, vlevo, vpravo, za ním. */
  facing() {
    const i = ORDER.indexOf(this.pos.dir);
    const at = (k) => {
      const d = DIRS[ORDER[(i + k) % 4]];
      return { x: this.pos.x + d[0], y: this.pos.y + d[1] };
    };
    const front = at(0);
    return { front, right: at(1), back: at(2), left: at(3), frontOpen: this.isFloor(front.x, front.y) };
  }

  /* Krok vpřed (1) nebo vzad (-1). Vrací true, když se hráč posunul; do zdi jen „narazí“. */
  step(delta) {
    if (this.anim) return Promise.resolve(false);
    const d = DIRS[this.pos.dir];
    const nx = this.pos.x + d[0] * delta, ny = this.pos.y + d[1] * delta;
    const from = { ...this.cam };
    if (!this.isFloor(nx, ny)) {
      const to = { x: from.x + d[0] * delta * 0.12, y: from.y + d[1] * delta * 0.12, a: from.a };
      return this.animate(from, to, BUMP_MS, true).then(() => false);
    }
    this.pos = { ...this.pos, x: nx, y: ny };
    this.visited.add(`${nx},${ny}`);
    return this.animate(from, { x: nx + 0.5, y: ny + 0.5, a: from.a }, STEP_MS).then(() => true);
  }

  /* Otočení doleva (-1) nebo doprava (1) o 90°. */
  turn(delta) {
    if (this.anim) return Promise.resolve(false);
    const i = ORDER.indexOf(this.pos.dir);
    this.pos = { ...this.pos, dir: ORDER[(i + delta + 4) % 4] };
    const from = { ...this.cam };
    return this.animate(from, { ...from, a: from.a + delta * Math.PI / 2 }, TURN_MS).then(() => {
      this.cam.a = ANGLE[this.pos.dir];
      return true;
    });
  }

  animate(from, to, ms, bounce = false) {
    if (this.reduced) {
      if (!bounce) this.cam = { ...to };
      this.dirty = true;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.anim = { from, to, t0: performance.now(), ms, bounce, resolve };
      this.dirty = true;
    });
  }

  setFlashlight(on) {
    this.flashlight = Boolean(on);
    this.dirty = true;
  }

  /* Stav hry se změnil (např. otevřená mříž) – překreslit. */
  invalidate() {
    this.dirty = true;
  }

  start() {
    if (this.raf) return;
    const loop = (now) => {
      this.raf = requestAnimationFrame(loop);
      if (this.anim) {
        const a = this.anim;
        let k = Math.min(1, (now - a.t0) / a.ms);
        const e = a.bounce ? Math.sin(k * Math.PI) : ease(k);
        this.cam = {
          x: a.from.x + (a.to.x - a.from.x) * e,
          y: a.from.y + (a.to.y - a.from.y) * e,
          a: a.from.a + (a.to.a - a.from.a) * e,
        };
        if (k >= 1) {
          if (a.bounce) this.cam = { ...a.from };
          this.anim = null;
          a.resolve();
        }
        this.render(now);
        return;
      }
      if (this.dirty || (this.hasFlicker && now - this.lastFlicker > 90)) {
        this.lastFlicker = now;
        this.render(now);
      }
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.anim) {
      const a = this.anim;
      this.anim = null;
      this.cam = a.bounce ? { ...a.from } : { ...a.to };
      a.resolve();
    }
  }

  destroy() {
    this.stop();
  }

  /* ---------- kreslení ---------- */

  render(now = performance.now()) {
    this.dirty = false;
    const buf = this.buf;
    const { a } = this.cam;
    const dX = Math.cos(a), dY = Math.sin(a);
    const px = this.cam.x - dX * BACK, py = this.cam.y - dY * BACK;
    const plX = -dY * FOV, plY = dX * FOV;
    const half = H / 2;
    const t = now / 1000;

    // světla tohoto snímku
    const lamps = (this.def.lamps || []).map((l) => {
      let s = l.strength == null ? 0.9 : l.strength;
      if (l.flicker) {
        const f = Math.sin(t * 7.3) + Math.sin(t * 17.9) * 0.6 + Math.sin(t * 2.1) * 0.4;
        s *= f > 1.25 ? 0.25 : 0.9 + 0.08 * Math.sin(t * 31);
      }
      const r = l.radius || 2.7;
      return { x: l.x + 0.5, y: l.y + 0.5, s, r2: r * r };
    });
    const fl = this.flashlight;
    const amb = fl ? 0.03 : 0.07;
    const pS = fl ? 1.0 : 0.38;
    const pR = fl ? 6.5 : 3.2;
    const light = (wx, wy, dist, sx) => {
      let L = amb;
      for (const l of lamps) {
        const ddx = wx - l.x, ddy = wy - l.y;
        const q = 1 - (ddx * ddx + ddy * ddy) / l.r2;
        if (q > 0) L += l.s * q * q;
      }
      let p = 1 - dist / pR;
      if (p > 0) {
        if (fl) { const c = (sx - 0.5) * 2; p *= Math.max(0, 1 - c * c * 0.75); }
        L += pS * p;
      }
      L /= 1 + dist * 0.12;   // ztráta světla do dálky
      return L > 1.3 ? 1.3 : L;
    };
    const shade = (c, L) => {
      let r = (c & 255) * L * 1.04, g = ((c >> 8) & 255) * L, b = ((c >> 16) & 255) * L * 0.9;
      if (r > 255) r = 255;
      if (g > 255) g = 255;
      if (b > 255) b = 255;
      return 0xff000000 | (b << 16) | (g << 8) | r;
    };

    // podlaha a strop (po řádcích)
    const floorT = this.tex[this.def.floor] || this.wallTexture(-1, -1);
    const ceilT = this.tex[this.def.ceiling] || floorT;
    const mw = Math.max(...this.map.map((r) => r.length)), mh = this.map.length;
    const lampAt = new Int16Array(mw * mh).fill(-1);
    (this.def.lamps || []).forEach((l, i) => { if (l.x >= 0 && l.y >= 0 && l.x < mw && l.y < mh) lampAt[l.y * mw + l.x] = i; });
    const rx0 = dX - plX, ry0 = dY - plY;
    const kx = (2 * plX) / W, ky = (2 * plY) / W;
    for (let y = Math.floor(half) + 1; y < H; y++) {
      const rowD = (0.5 * H) / (y - half);
      let fx = px + rowD * rx0, fy = py + rowD * ry0;
      const sx = rowD * kx, sy = rowD * ky;
      const fo = y * W, co = (H - 1 - y) * W;
      for (let x = 0; x < W; x++) {
        const cx = Math.floor(fx), cy = Math.floor(fy);
        const ux = fx - cx, uy = fy - cy;
        const ti = (((uy * TEX) | 0) & (TEX - 1)) * TEX + (((ux * TEX) | 0) & (TEX - 1));
        const L = light(fx, fy, rowD, x / W);
        buf[fo + x] = shade(floorT[ti], L * 0.92);
        // lampa: zářivka uprostřed políčka na stropě
        const li = cx >= 0 && cy >= 0 && cx < mw && cy < mh ? lampAt[cy * mw + cx] : -1;
        if (li >= 0 && Math.abs(ux - 0.5) < 0.09 && Math.abs(uy - 0.5) < 0.3) {
          const s = Math.min(1, 0.35 + lamps[li].s * 0.75);
          const v = (255 * s) | 0;
          buf[co + x] = 0xff000000 | (((v * 0.88) | 0) << 16) | (v << 8) | v;
        } else {
          buf[co + x] = shade(ceilT[ti], L * 0.8);
        }
        fx += sx;
        fy += sy;
      }
    }

    // zdi (po sloupcích)
    for (let x = 0; x < W; x++) {
      const camX = (2 * x) / W - 1;
      const rdx = dX + plX * camX, rdy = dY + plY * camX;
      let mx = Math.floor(px), my = Math.floor(py);
      const ddx = rdx === 0 ? 1e30 : Math.abs(1 / rdx);
      const ddy = rdy === 0 ? 1e30 : Math.abs(1 / rdy);
      let stepX, stepY, sdx, sdy;
      if (rdx < 0) { stepX = -1; sdx = (px - mx) * ddx; } else { stepX = 1; sdx = (mx + 1 - px) * ddx; }
      if (rdy < 0) { stepY = -1; sdy = (py - my) * ddy; } else { stepY = 1; sdy = (my + 1 - py) * ddy; }
      let side = 0, guard = 0;
      while (guard++ < 64) {
        if (sdx < sdy) { sdx += ddx; mx += stepX; side = 0; } else { sdy += ddy; my += stepY; side = 1; }
        if (!this.isFloor(mx, my)) break;
      }
      const perp = Math.max(0.0001, side === 0 ? sdx - ddx : sdy - ddy);
      let wallX = side === 0 ? py + perp * rdy : px + perp * rdx;
      wallX -= Math.floor(wallX);
      let tx = (wallX * TEX) | 0;
      if ((side === 0 && rdx < 0) || (side === 1 && rdy > 0)) tx = TEX - 1 - tx;
      const tex = this.wallTexture(mx, my);
      const lineH = H / perp;
      const y0 = Math.max(0, Math.floor(half - lineH / 2));
      const y1 = Math.min(H - 1, Math.floor(half + lineH / 2));
      const hx = px + perp * rdx - stepX * (side === 0 ? 0.02 : 0);
      const hy = py + perp * rdy - stepY * (side === 1 ? 0.02 : 0);
      const L = light(hx, hy, perp, x / W) * (side === 0 ? 1 : 0.86);
      const tStep = TEX / lineH;
      let tPos = (y0 - half + lineH / 2) * tStep;
      for (let y = y0; y <= y1; y++) {
        let ty = tPos | 0;
        if (ty > TEX - 1) ty = TEX - 1;
        buf[y * W + x] = shade(tex[ty * TEX + tx], L);
        tPos += tStep;
      }
    }

    this.ctx.putImageData(this.image, 0, 0);
    if (this.def.minimap !== false) this.drawMinimap();
  }

  /* Malá mapa vpravo nahoře: prošlá políčka chodby a šipka hráče. */
  drawMinimap() {
    const g = this.ctx;
    const s = 9;
    const rows = this.map.length, cols = Math.max(...this.map.map((r) => r.length));
    const ox = W - cols * s - 14, oy = 12;
    g.save();
    g.fillStyle = 'rgba(0, 0, 0, 0.45)';
    g.fillRect(ox - 6, oy - 6, cols * s + 12, rows * s + 12);
    const seen = (x, y) => this.visited.has(`${x},${y}`);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (this.isFloor(x, y) && seen(x, y)) {
          g.fillStyle = 'rgba(214, 196, 150, 0.75)';
          g.fillRect(ox + x * s, oy + y * s, s - 1, s - 1);
        } else if (!this.isFloor(x, y)) {
          const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => this.isFloor(x + a, y + b) && seen(x + a, y + b));
          if (near) {
            g.fillStyle = 'rgba(28, 25, 19, 0.95)';
            g.fillRect(ox + x * s, oy + y * s, s - 1, s - 1);
          }
        }
      }
    }
    const cx = ox + this.cam.x * s - 0.5, cy = oy + this.cam.y * s - 0.5;
    g.translate(cx, cy);
    g.rotate(this.cam.a);
    g.fillStyle = '#ffd28a';
    g.beginPath();
    g.moveTo(5, 0);
    g.lineTo(-4, -4);
    g.lineTo(-2, 0);
    g.lineTo(-4, 4);
    g.closePath();
    g.fill();
    g.restore();
  }
}
