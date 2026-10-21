/*
 * Chodba „z vlastních očí“ (zkouška – sklepní bludiště mezi výstrojním skladem a tělocvičnou).
 *
 * Hráč chodí po čtvercové síti po krocích a otáčí se o 90° (jako staré „dungeonovky“); přechod
 * mezi políčky je krátká plynulá animace (při „omezit pohyb“ v systému okamžitá). Svět se kreslí
 * po sloupcích obrazu jako ve hrách DOOM a Wolfenstein: pro každý sloupec se spočítá, kde paprsek
 * narazí na zeď, a podle vzdálenosti se nakreslí její výška. Podlaha a strop se dopočítají po řádcích,
 * postavy (kostlivci) se kreslí jako obrázky natočené k hráči a schovají se za zeď (paměť hloubky).
 * Světlo: lampy na stropě (některá bliká), svítilna hráče a ztráta světla do dálky.
 *
 * Kostlivci (výukově: anatomie): probudí se, když hráče uvidí, jdou k němu a zastoupí cestu.
 * Cvičná laserová puška ukáže, kterou kost je třeba zasáhnout; zásah se vyhodnotí podle oblastí
 * kostí na obrázku kostlivce („zones“ v game.json). Kostlivec u hráče útočí – hráč ztrácí životy
 * (lze vypnout v Menu). Hra jen hlásí události (onWake, onAttack, onDeath…), co s nimi, řeší ui.js.
 *
 * Mapa, textury a kostlivci jsou v game.json u místnosti („corridor“). Načítá se až v chodbě.
 */

const W = 800, H = 450;            // vnitřní rozlišení (CSS obraz roztáhne na scénu 16 : 9)
const TEX = 512;                    // textury zdí se převzorkují na 512 × 512
const BACK = 0.36;                  // oko stojí kousek za středem políčka – zeď před hráčem je vidět celá
const FOV = 0.66;                   // šířka zorného pole (asi 66°)
const STEP_MS = 300, TURN_MS = 260, BUMP_MS = 220, SK_STEP_MS = 420;
const DIRS = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
const ORDER = ['N', 'E', 'S', 'W'];
const ANGLE = { E: 0, S: Math.PI / 2, W: Math.PI, N: -Math.PI / 2 };
const AZIMUTH = { N: [0, 'S'], E: [90, 'V'], S: [180, 'J'], W: [270, 'Z'] };   // sever, východ, jih, západ

async function loadImage(src) {
  const img = new Image();
  img.src = src;
  try {
    await img.decode();
  } catch (e) {
    await new Promise((ok, fail) => { img.onload = ok; img.onerror = fail; if (img.complete) ok(); });
  }
  return img;
}

/* Obrázek → pole pixelů (w × h) pro rychlé čtení při kreslení. */
function pixels(img, w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, w, h);
  return new Uint32Array(g.getImageData(0, 0, w, h).data.buffer.slice(0));
}

/* Náhradní textura, když se obrázek nenačte (šedá s mřížkou). */
function fallbackTexture() {
  const t = new Uint32Array(TEX * TEX);
  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
      const v = x % 64 === 0 || y % 64 === 0 ? 60 : 110;
      t[y * TEX + x] = (255 << 24) | (v << 16) | (v << 8) | v;
    }
  }
  return t;
}

const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
const key = (x, y) => `${x},${y}`;

export class Corridor {
  /* def = „corridor“ z game.json; opts: { check(when) → bool, reducedMotion, hasWeapon() → bool,
     attacks: bool, defeated: [id…], on: { wake(sk), attack(lives), death(), defeat(sk) } } */
  constructor(canvas, def, opts = {}) {
    this.canvas = canvas;
    canvas.width = W;
    canvas.height = H;
    this.ctx = canvas.getContext('2d');
    this.image = this.ctx.createImageData(W, H);
    this.buf = new Uint32Array(this.image.data.buffer);
    this.zbuf = new Float32Array(W);
    this.def = def;
    this.map = def.map;
    this.mw = Math.max(...this.map.map((r) => r.length));
    this.mh = this.map.length;
    this.check = opts.check || (() => true);
    this.hasWeapon = opts.hasWeapon || (() => false);
    this.on = opts.on || {};
    this.reduced = Boolean(opts.reducedMotion);
    this.attacks = opts.attacks !== false;
    this.tex = {};
    this.sprites = {};
    this.flashlight = false;
    this.pos = { ...def.start };
    this.cam = { x: this.pos.x + 0.5, y: this.pos.y + 0.5, a: ANGLE[this.pos.dir] };
    this.anim = null;
    this.visited = new Set();
    this.dirty = true;
    this.raf = 0;
    this.lastFrame = 0;
    this.lastFlicker = 0;
    this.paused = false;
    this.hasFlicker = (def.lamps || []).some((l) => l.flicker);
    this.beam = null;          // záblesk laseru { x, y, t0, hit }
    this.hurt = 0;             // čas posledního zásahu hráče (červený záblesk)
    this.visibleSprites = [];  // kostlivci na obrazovce při posledním kreslení (pro zásah)
    const sk = def.skeleton || {};
    this.cfg = {
      lives: sk.lives || 3,
      attackMs: (sk.attackSeconds || 4) * 1000,
      firstAttackMs: (sk.firstAttackSeconds || 3) * 1000,
      moveMs: (sk.moveSeconds || 2.2) * 1000,
      wake: sk.wakeCells || 4,
      height: sk.height || 0.92,
      tolerance: sk.tolerance == null ? 24 : sk.tolerance,   // px obrázku kostlivce: kolik smí prst minout kost
    };
    this.hint = null;          // po chybě na chvíli blikne hledaná kost { s, bone, t0 }
    this.lives = this.cfg.lives;
    const dead = new Set(opts.defeated || []);
    this.skeletons = (def.skeletons || []).map((s) => ({
      id: s.id, name: s.name, intro: s.intro, bones: s.bones || [], home: { x: s.cell[0], y: s.cell[1] },
      x: s.cell[0], y: s.cell[1], rx: s.cell[0] + 0.5, ry: s.cell[1] + 0.5,
      alive: !dead.has(s.id), awake: false, progress: 0, nextMove: 0, nextAttack: 0, adjacent: false, tween: null, fallT: 0,
      lunge: 0, wakePos: null,
    }));
  }

  async load() {
    const jobs = Object.entries(this.def.textures || {}).map(async ([name, src]) => {
      try {
        this.tex[name] = pixels(await loadImage(src), TEX, TEX);
      } catch (e) {
        console.warn(`Chodba: textura ${name} (${src}) se nenačetla.`);
        this.tex[name] = fallbackTexture();
      }
    });
    const sk = this.def.skeleton;
    const sprite = async (name, src, w, h) => {
      if (!src) return;
      try {
        const img = await loadImage(src);
        this.sprites[name] = { px: pixels(img, w, h), w, h, img };
      } catch (e) {
        console.warn(`Chodba: obrázek ${name} (${src}) se nenačetl.`);
      }
    };
    if (sk) {
      jobs.push(sprite('skeleton', sk.image, 256, 512));
      jobs.push(sprite('pile', sk.pile, 256, 128));
    }
    if (this.def.weapon) jobs.push(sprite('weapon', this.def.weapon, 400, 240));
    await Promise.all(jobs);
  }

  /* ---------- mapa ---------- */

  cell(x, y) {
    if (y < 0 || y >= this.mh || x < 0 || x >= this.map[y].length) return '#';
    return this.map[y][x];
  }

  legendEntry(x, y) {
    let e = (this.def.legend || {})[this.cell(x, y)];
    if (Array.isArray(e)) e = e.find((v) => !v.when || this.check(v.when)) || null;
    return e;
  }

  /* Volné políčko: chodba, nebo zeď, která se otevřela (např. závora po zásahu čidla). */
  isFloor(x, y) {
    if (this.cell(x, y) === '.') return true;
    const e = this.legendEntry(x, y);
    return Boolean(e && typeof e === 'object' && e.openWhen && this.check(e.openWhen));
  }

  skeletonAt(x, y) {
    return this.skeletons.find((s) => s.alive && s.x === x && s.y === y) || null;
  }

  /* Hromádka kostí po poraženém kostlivci na políčku (id kostlivce, nebo null). */
  pileAt(x, y) {
    const s = this.skeletons.find((k) => !k.alive && k.x === x && k.y === y);
    return s ? s.id : null;
  }

  /* Textura zdi podle znaku v mapě; „legend“: název textury, { texture, openWhen }, nebo varianty s „when“. */
  wallTexture(x, y) {
    const e = this.legendEntry(x, y);
    const name = e && typeof e === 'object' ? e.texture : e;
    return this.tex[name] || this.tex[this.def.wall] || (this.tex._fallback ||= fallbackTexture());
  }

  /* ---------- poloha a pohyb ---------- */

  setPosition(p) {
    const dir = DIRS[p.dir] ? p.dir : 'N';
    this.pos = { x: p.x, y: p.y, dir };
    this.cam = { x: p.x + 0.5, y: p.y + 0.5, a: ANGLE[dir] };
    if (Array.isArray(p.visited)) p.visited.forEach((k) => this.visited.add(k));
    this.visited.add(key(p.x, p.y));
    this.dirty = true;
  }

  position() {
    return { x: this.pos.x, y: this.pos.y, dir: this.pos.dir, visited: [...this.visited] };
  }

  /* Políčka kolem hráče: před ním, vlevo, vpravo, za ním. */
  facing() {
    const i = ORDER.indexOf(this.pos.dir);
    const at = (k) => {
      const d = DIRS[ORDER[(i + k) % 4]];
      return { x: this.pos.x + d[0], y: this.pos.y + d[1] };
    };
    const front = at(0);
    return { front, right: at(1), back: at(2), left: at(3), frontOpen: this.isFloor(front.x, front.y), azimuth: AZIMUTH[this.pos.dir] };
  }

  /* Krok vpřed (1) nebo vzad (-1). Vrací true, když se hráč posunul; do zdi nebo kostlivce jen „narazí“. */
  step(delta) {
    if (this.anim) return Promise.resolve(false);
    const d = DIRS[this.pos.dir];
    const nx = this.pos.x + d[0] * delta, ny = this.pos.y + d[1] * delta;
    const from = { ...this.cam };
    if (!this.isFloor(nx, ny) || this.skeletonAt(nx, ny)) {
      const to = { x: from.x + d[0] * delta * 0.12, y: from.y + d[1] * delta * 0.12, a: from.a };
      return this.animate(from, to, BUMP_MS, true).then(() => false);
    }
    this.pos = { ...this.pos, x: nx, y: ny };
    this.visited.add(key(nx, ny));
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

  setAttacks(on) {
    this.attacks = Boolean(on);
    this.dirty = true;
  }

  /* Okno přes hru (zámek, detail…): kostlivci čekají. */
  setPaused(on) {
    const now = performance.now();
    if (on && !this.paused) this.pausedAt = now;
    if (!on && this.paused) {
      const dt = now - (this.pausedAt || now);
      for (const s of this.skeletons) { s.nextMove += dt; s.nextAttack += dt; }
    }
    this.paused = Boolean(on);
  }

  /* Stav hry se změnil (např. otevřená mříž) – překreslit. */
  invalidate() {
    this.dirty = true;
  }

  heal() {
    this.lives = this.cfg.lives;
    this.dirty = true;
  }

  start() {
    if (this.raf) return;
    const loop = (now) => {
      this.raf = requestAnimationFrame(loop);
      if (!this.paused) this.updateSkeletons(now);
      let busy = false;
      if (this.anim) {
        const a = this.anim;
        const k = Math.min(1, (now - a.t0) / a.ms);
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
        busy = true;
      }
      for (const s of this.skeletons) {
        if (s.tween) {
          const k = Math.min(1, (now - s.tween.t0) / SK_STEP_MS);
          s.rx = s.tween.fx + (s.x + 0.5 - s.tween.fx) * ease(k);
          s.ry = s.tween.fy + (s.y + 0.5 - s.tween.fy) * ease(k);
          if (k >= 1) s.tween = null;
          busy = true;
        }
        if (s.fallT && now - s.fallT < 600) busy = true;
        const want = s.alive && s.adjacent && !s.tween ? 1 : 0;
        if (Math.abs(s.lunge - want) > 0.01) {
          s.lunge += (want - s.lunge) * (this.reduced ? 1 : 0.18);
          busy = true;
        } else {
          s.lunge = want;
        }
        if (s.awake && s.alive) busy = true;   // kostlivec se pohupuje
      }
      if (this.beam && now - this.beam.t0 < 220) busy = true;
      if (this.hurt && now - this.hurt < 500) busy = true;
      if (this.hint && now - this.hint.t0 < 2600) busy = true;
      const flick = this.hasFlicker && now - this.lastFlicker > 90;
      if (busy || this.dirty || flick) {
        if (busy && now - this.lastFrame < 14) return;
        this.lastFrame = now;
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

  /* ---------- kostlivci ---------- */

  /* Vidí kostlivec hráče? (stejná řada nebo sloupec, mezi nimi jen chodba, do „wake“ políček) */
  sees(s) {
    const { x, y } = this.pos;
    if (s.x !== x && s.y !== y) return false;
    const n = Math.abs(s.x - x) + Math.abs(s.y - y);
    if (n > this.cfg.wake) return false;
    const sx = Math.sign(x - s.x), sy = Math.sign(y - s.y);
    for (let i = 1; i < n; i++) if (!this.isFloor(s.x + sx * i, s.y + sy * i)) return false;
    return true;
  }

  /* Další krok kostlivce k hráči (nejkratší cesta chodbou, jiní kostlivci překážejí). */
  nextStep(s) {
    const goal = key(this.pos.x, this.pos.y);
    const prev = new Map([[key(s.x, s.y), null]]);
    const queue = [[s.x, s.y]];
    while (queue.length) {
      const [cx, cy] = queue.shift();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy, k = key(nx, ny);
        if (prev.has(k) || !this.isFloor(nx, ny)) continue;
        if (k !== goal && this.skeletonAt(nx, ny)) continue;
        prev.set(k, key(cx, cy));
        if (k === goal) {
          let cur = k, path = [];
          while (prev.get(cur) !== key(s.x, s.y)) { path.push(cur); cur = prev.get(cur); }
          return path.length > 10 ? null : cur.split(',').map(Number);
        }
        queue.push([nx, ny]);
      }
    }
    return null;
  }

  updateSkeletons(now) {
    if (!this.skeletons.length) return;
    for (const s of this.skeletons) {
      if (!s.alive) continue;
      const dist = Math.abs(s.x - this.pos.x) + Math.abs(s.y - this.pos.y);
      if (!s.awake && (this.sees(s) || dist <= 1)) {
        s.awake = true;
        s.wakePos = { x: this.pos.x, y: this.pos.y, dir: this.pos.dir };
        s.nextMove = now + this.cfg.moveMs * 0.6;
        this.dirty = true;
        if (this.on.wake) this.on.wake(s);
      }
      if (!s.awake) continue;
      const adjacent = dist === 1;
      if (adjacent && !s.adjacent) s.nextAttack = now + this.cfg.firstAttackMs;
      s.adjacent = adjacent;
      if (adjacent) {
        if (this.attacks && now >= s.nextAttack && !this.anim) {
          s.nextAttack = now + this.cfg.attackMs;
          this.hitPlayer(now);
        }
      } else if (now >= s.nextMove && !s.tween) {
        s.nextMove = now + this.cfg.moveMs;
        const n = this.nextStep(s);
        if (n && !(n[0] === this.pos.x && n[1] === this.pos.y)) {
          s.tween = { fx: s.rx, fy: s.ry, t0: now };
          s.x = n[0];
          s.y = n[1];
        }
      }
    }
  }

  hitPlayer(now) {
    this.lives -= 1;
    this.hurt = now;
    this.dirty = true;
    if (this.lives <= 0) {
      if (this.on.death) this.on.death(this.skeletons.find((k) => k.alive && k.adjacent) || null);
    } else if (this.on.attack) {
      this.on.attack(this.lives);
    }
  }

  /* Po ztrátě všech životů: hráč zpět tam, kde ho kostlivec uviděl (bez kostlivce na start),
     živí kostlivci domů a „srostou“. */
  resetAfterDeath(killer) {
    const back = (killer && killer.wakePos) || this.def.start;
    this.setPosition({ ...back, visited: [...this.visited] });
    for (const s of this.skeletons) {
      if (!s.alive) continue;
      Object.assign(s, { x: s.home.x, y: s.home.y, rx: s.home.x + 0.5, ry: s.home.y + 0.5, awake: false, progress: 0, adjacent: false, tween: null, lunge: 0 });
    }
    this.lives = this.cfg.lives;
    this.hurt = 0;
    this.hint = null;
    this.dirty = true;
  }

  /* Bojuje se? (živý probuzený kostlivec je vidět) – pak kliknutí do obrazu střílí. */
  combat() {
    return this.hasWeapon() && this.visibleSprites.some((v) => v.s.alive && v.s.awake);
  }

  /* Cíl: nejbližší viditelný probuzený kostlivec a kost, kterou má hráč zasáhnout. */
  target() {
    const v = this.visibleSprites.filter((o) => o.s.alive && o.s.awake).sort((a, b) => a.depth - b.depth)[0];
    if (!v) return null;
    return { skeleton: v.s, bone: v.s.bones[v.s.progress] };
  }

  /* Výstřel do bodu obrazu (fx, fy v 0–1). Vrací { skeleton, bone } (bone = kost v místě zásahu, nebo
     null = mezi kostmi), nebo null = minul kostlivce. Vyhodnocení (správná kost?) dělá ui přes hit(). */
  shoot(fx, fy) {
    const sx = fx * W, sy = fy * H;
    let found = null;
    const col = Math.max(0, Math.min(W - 1, Math.floor(sx)));
    const spr = this.sprites.skeleton;
    const sw = spr ? spr.w : 256, sh = spr ? spr.h : 512;
    const tol = this.cfg.tolerance;
    for (const v of this.visibleSprites.slice().sort((a, b) => a.depth - b.depth)) {
      if (!v.s.alive) continue;
      const kx = (v.x1 - v.x0) / sw, ky = (v.y1 - v.y0) / sh;        // obrazovka / obrázek
      const padX = tol * kx, padY = tol * ky;
      if (sx < v.x0 - padX || sx > v.x1 + padX || sy < v.y0 - padY || sy > v.y1 + padY) continue;
      if (v.depth >= this.zbuf[col]) continue;   // za zdí
      // bod v pixelech obrázku kostlivce; vzdálenost k oblasti každé kosti (0 = uvnitř)
      const ix = (sx - v.x0) / kx, iy = (sy - v.y0) / ky;
      let bone = null, best = Infinity;
      for (const [id, rects] of Object.entries((this.def.skeleton || {}).zones || {})) {
        for (const [x, y, rw, rh] of rects) {
          const x0 = x / 100 * sw, y0 = y / 100 * sh, x1 = (x + rw) / 100 * sw, y1 = (y + rh) / 100 * sh;
          const dx = Math.max(x0 - ix, 0, ix - x1), dy = Math.max(y0 - iy, 0, iy - y1);
          const d = Math.hypot(dx, dy);
          if (d < best) { best = d; bone = id; }
        }
      }
      found = { skeleton: v.s, bone: best <= tol ? bone : null };
      break;
    }
    this.beam = { x: sx, y: sy, t0: performance.now(), hit: Boolean(found && found.bone) };
    this.dirty = true;
    return found;
  }

  /* Výsledek zásahu: správná kost posune kostlivce k rozpadu, chybná ho popožene k útoku. */
  hit(s, correct) {
    const now = performance.now();
    if (correct) {
      this.hint = null;
      s.progress += 1;
      if (s.progress >= s.bones.length) {
        s.alive = false;
        s.fallT = now;
        this.lives = this.cfg.lives;   // oddech po souboji
        if (this.on.defeat) this.on.defeat(s);
      }
    } else {
      this.hint = { s, bone: s.bones[s.progress], t0: now };
    }
    this.dirty = true;
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
    const lamps = (this.def.lamps || []).map((l, i) => {
      let s = l.strength == null ? 0.9 : l.strength;
      if (l.flicker) {
        const f = Math.sin(t * 7.3 + i) + Math.sin(t * 17.9 + i * 2) * 0.6 + Math.sin(t * 2.1) * 0.4;
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
    const mw = this.mw, mh = this.mh;
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

    // zdi (po sloupcích) + paměť hloubky pro postavy
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
      while (guard++ < 96) {
        if (sdx < sdy) { sdx += ddx; mx += stepX; side = 0; } else { sdy += ddy; my += stepY; side = 1; }
        if (!this.isFloor(mx, my)) break;
      }
      const perp = Math.max(0.0001, side === 0 ? sdx - ddx : sdy - ddy);
      this.zbuf[x] = perp;
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

    // postavy: kostlivci (živí stojí, poražení leží jako hromádka kostí), od nejvzdálenějšího
    this.visibleSprites = [];
    const invDet = 1 / (plX * dY - dX * plY);
    const list = this.skeletons.map((s) => ({ s, d: (s.rx - px) ** 2 + (s.ry - py) ** 2 })).sort((p, q) => q.d - p.d);
    for (const { s } of list) {
      const spr = s.alive ? this.sprites.skeleton : this.sprites.pile;
      if (!spr) continue;
      // u hráče kostlivec přistoupí až k okraji políčka (větší terč)
      const lx = s.lunge ? Math.sign(this.pos.x - s.x) * 0.32 * s.lunge : 0;
      const ly = s.lunge ? Math.sign(this.pos.y - s.y) * 0.32 * s.lunge : 0;
      const relX = s.rx + lx - px, relY = s.ry + ly - py;
      const tX = invDet * (dY * relX - dX * relY);
      const tY = invDet * (-plY * relX + plX * relY);
      if (tY <= 0.15) continue;
      const screenX = (W / 2) * (1 + tX / tY);
      const floorY = half + H / (2 * tY);
      let hgt = (H / tY) * (s.alive ? this.cfg.height : 0.24);
      let wid = hgt * (spr.w / spr.h);
      let sink = 0;
      if (!s.alive && s.fallT && now - s.fallT < 600) {
        // rozpad: kostlivec se sesune (krátce ještě stojí a klesá)
        const k = (now - s.fallT) / 600;
        hgt = (H / tY) * (this.cfg.height * (1 - k) + 0.24 * k);
        wid = hgt * (spr.w / spr.h);
      }
      if (s.alive && s.awake) sink = Math.sin(t * 6 + s.home.x) * hgt * 0.012;   // pohupování
      const x0 = screenX - wid / 2, x1 = screenX + wid / 2;
      const y1 = floorY + sink, y0 = y1 - hgt;
      const L = light(s.rx, s.ry, tY, 0.5) * 1.05;
      const cx0 = Math.max(0, Math.floor(x0)), cx1 = Math.min(W - 1, Math.floor(x1));
      const cy0 = Math.max(0, Math.floor(y0)), cy1 = Math.min(H - 1, Math.floor(y1));
      let drawn = false;
      for (let x = cx0; x <= cx1; x++) {
        if (tY >= this.zbuf[x]) continue;
        drawn = true;
        const u = ((x - x0) / wid * spr.w) | 0;
        if (u < 0 || u >= spr.w) continue;
        for (let y = cy0; y <= cy1; y++) {
          const v = ((y - y0) / hgt * spr.h) | 0;
          if (v < 0 || v >= spr.h) continue;
          const c = spr.px[v * spr.w + u];
          if ((c >>> 24) < 128) continue;
          buf[y * W + x] = shade(c, L);
        }
      }
      if (drawn) this.visibleSprites.push({ s, x0, x1, y0, y1, depth: tY });
    }

    this.ctx.putImageData(this.image, 0, 0);
    this.drawOverlay(now);
  }

  /* Nad obraz: puška, laser, kompas, životy, cíl (kost), červený záblesk, malá mapa. */
  drawOverlay(now) {
    const g = this.ctx;
    // červený záblesk po zásahu kostlivcem
    if (this.hurt && now - this.hurt < 500) {
      const k = 1 - (now - this.hurt) / 500;
      const grd = g.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.8);
      grd.addColorStop(0, 'rgba(160, 0, 0, 0)');
      grd.addColorStop(1, `rgba(170, 10, 10, ${0.55 * k})`);
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);
    }
    const armed = this.hasWeapon();
    const fight = this.combat();
    if (this.canvas.dataset.combat !== String(fight)) {
      this.canvas.dataset.combat = String(fight);
      this.canvas.style.cursor = fight ? 'crosshair' : 'pointer';
    }
    // laser
    const WPW = 300, WPH = 180;                         // puška vpravo dole (nezakrývá kostlivce)
    const wpX = W - WPW - 6, wpY = H - WPH + 8;
    const muzzle = { x: wpX + 180 * WPW / 400, y: wpY + 82 * WPH / 240 };
    if (armed && this.beam && now - this.beam.t0 < 220) {
      const k = 1 - (now - this.beam.t0) / 220;
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = `rgba(90, 255, 140, ${0.9 * k})`;
      g.lineWidth = 3;
      g.shadowColor = 'rgba(90, 255, 140, 0.9)';
      g.shadowBlur = 14;
      g.beginPath();
      g.moveTo(muzzle.x, muzzle.y);
      g.lineTo(this.beam.x, this.beam.y);
      g.stroke();
      g.fillStyle = `rgba(${this.beam.hit ? '255, 240, 160' : '120, 255, 170'}, ${k})`;
      g.beginPath();
      g.arc(this.beam.x, this.beam.y, 5 + 10 * (1 - k), 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    // puška dole uprostřed (při výstřelu cukne)
    const wp = this.sprites.weapon;
    if (armed && wp) {
      const kick = this.beam && now - this.beam.t0 < 160 ? (1 - (now - this.beam.t0) / 160) * 14 : 0;
      const bob = this.anim && !this.anim.bounce ? Math.sin((now - this.anim.t0) / this.anim.ms * Math.PI) * 6 : 0;
      g.drawImage(wp.img, wpX + kick * 0.3, wpY + kick + bob, WPW, WPH);
    }
    // kompas nahoře uprostřed
    const [az, letter] = AZIMUTH[this.pos.dir];
    g.save();
    g.fillStyle = 'rgba(0, 0, 0, 0.5)';
    g.fillRect(W / 2 - 62, 10, 124, 30);
    g.fillStyle = '#e8d7a8';
    g.font = 'bold 18px Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(`▲ ${az}° ${letter}`, W / 2, 26);
    // cíl: kterou kost zasáhnout
    const tg = armed ? this.target() : null;
    const bones = (this.def.skeleton || {}).bones || {};
    if (tg && tg.bone) {
      const name = ((bones[tg.bone] && bones[tg.bone].name) || tg.bone).toUpperCase();
      g.textAlign = 'left';
      g.font = 'bold 24px Arial, sans-serif';
      const tw = Math.max(g.measureText(name).width, 120) + 28;
      g.fillStyle = 'rgba(20, 60, 30, 0.78)';
      g.fillRect(12, 52, tw, 70);
      g.fillStyle = '#c9f5d6';
      g.font = 'bold 16px Arial, sans-serif';
      g.fillText('ZASÁHNI:', 26, 72);
      g.fillStyle = '#8dffb0';
      g.font = 'bold 24px Arial, sans-serif';
      g.fillText(name, 26, 102);
      g.textAlign = 'center';
    }
    // po chybě: hledaná kost na kostlivci bliká
    const hint = this.hint;
    if (hint && now - hint.t0 < 2600 && hint.s.alive) {
      const v = this.visibleSprites.find((o) => o.s === hint.s);
      const rects = ((this.def.skeleton || {}).zones || {})[hint.bone] || [];
      if (v && Math.floor((now - hint.t0) / 260) % 2 === 0) {
        g.save();
        g.strokeStyle = '#ffe14a';
        g.lineWidth = 3;
        g.shadowColor = '#ffe14a';
        g.shadowBlur = 10;
        for (const [x, y, rw, rh] of rects) {
          g.strokeRect(v.x0 + x / 100 * (v.x1 - v.x0) - 3, v.y0 + y / 100 * (v.y1 - v.y0) - 3, rw / 100 * (v.x1 - v.x0) + 6, rh / 100 * (v.y1 - v.y0) + 6);
        }
        g.restore();
      }
    }
    // životy vlevo nahoře
    if (this.attacks && this.skeletons.length && (armed || this.skeletons.some((s) => s.awake))) {
      for (let i = 0; i < this.cfg.lives; i++) {
        const x = 26 + i * 30, y = 26;
        g.fillStyle = i < this.lives ? '#d8333a' : 'rgba(80, 70, 60, 0.8)';
        g.beginPath();
        g.moveTo(x, y + 9);
        g.bezierCurveTo(x - 16, y - 2, x - 8, y - 14, x, y - 5);
        g.bezierCurveTo(x + 8, y - 14, x + 16, y - 2, x, y + 9);
        g.fill();
      }
    }
    g.restore();
    if (this.def.minimap !== false) this.drawMinimap();
  }

  /* Malá mapa vpravo nahoře: prošlá políčka chodby, poražení kostlivci a šipka hráče. */
  drawMinimap() {
    const g = this.ctx;
    const s = 7;
    const rows = this.mh, cols = this.mw;
    const ox = W - cols * s - 14, oy = 12;
    g.save();
    g.fillStyle = 'rgba(0, 0, 0, 0.45)';
    g.fillRect(ox - 6, oy - 6, cols * s + 12, rows * s + 12);
    const seen = (x, y) => this.visited.has(key(x, y));
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (this.isFloor(x, y) && seen(x, y)) {
          g.fillStyle = 'rgba(214, 196, 150, 0.75)';
          g.fillRect(ox + x * s, oy + y * s, s - 1, s - 1);
        } else if (!this.isFloor(x, y)) {
          const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([p, q]) => this.isFloor(x + p, y + q) && seen(x + p, y + q));
          if (near) {
            g.fillStyle = 'rgba(28, 25, 19, 0.95)';
            g.fillRect(ox + x * s, oy + y * s, s - 1, s - 1);
          }
        }
      }
    }
    for (const sk of this.skeletons) {
      if (!seen(sk.x, sk.y)) continue;
      g.fillStyle = sk.alive ? '#f0f0e0' : 'rgba(150, 140, 120, 0.8)';
      g.fillRect(ox + sk.x * s + 2, oy + sk.y * s + 2, s - 5, s - 5);
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
