/*
 * 3D chodba (ukázka – chodba z tělocvičny na cvičiště): volný pohyb, skok, lezení a svalovec.
 * Kreslí three.js (vendor/three, licence MIT). Načítá se až v této místnosti (dynamický import).
 *
 * Výukově: skok = impulz (síla odrazu × doba odrazu → rychlost v = J : m → výška h = v² : 2g),
 * batoh 15 kg sníží výskok, seskok a doskok (doba brzdění → síla), lezení = práce m·g·h a výkon,
 * svalovec = funkce svalů (zasáhni sval, který jeho útok provede).
 * Ovládání: myš (po kliknutí do obrazu) a W A S D / šipky, mezerník = skok (držet = delší odraz),
 * C = podřep, E = akce, klik / Enter / X = laser; na dotykovém displeji páčka a tlačítka.
 * Rozvržení a texty jsou v game.json (místnost → „world“); hra jen hlásí události (on.message…).
 */
import * as THREE from '../vendor/three/three.module.min.js';
import { Svalovec } from './svalovec.js?v=0.29';

const G = 9.81;
const EYE = 1.65, EYE_CROUCH = 1.12, R = 0.3, HEIGHT = 1.8;
const WALK = 3.2, CROUCH_WALK = 1.5, CLIMB = 0.9;
const MANTLE_MIN = 0.65, MANTLE_MAX = 1.35;
const SOFT_BRAKE = 0.3, HARD_BRAKE = 0.05, HURT_RATIO = 12;
const STICK_R = 60;   // poloměr dotykové páčky (px)

/* Číslo po česku (desetinná čárka, mezera mezi tisíci). */
function num(n, d = 2) {
  return n.toLocaleString('cs-CZ', { minimumFractionDigits: d, maximumFractionDigits: d });
}

/* Obdélníky stěn a podlah složené do jedné geometrie na materiál (méně volání kreslení). */
class Quads {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.uv = [];
  }

  /* a, b, c, d = rohy zleva dole proti směru hodinek (při pohledu na lícovou stranu). */
  add(a, b, c, d, n, uv) {
    const pts = [[a, uv[0]], [b, uv[1]], [c, uv[2]], [a, uv[0]], [c, uv[2]], [d, uv[3]]];
    for (const [p, t] of pts) {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(n[0], n[1], n[2]);
      this.uv.push(t[0], t[1]);
    }
  }

  mesh(material) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    return new THREE.Mesh(g, material);
  }
}

/* Textura s nápisem (cedule, nápis na bedně). */
function textTexture(text, opts = {}) {
  const w = opts.w || 512, h = opts.h || 128;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (opts.bg) {
    g.fillStyle = opts.bg;
    g.fillRect(0, 0, w, h);
  }
  if (opts.stripes) {
    // žlutočerné výstražné pruhy nahoře a dole
    for (let x = -h; x < w + h; x += 40) {
      g.fillStyle = '#d8b02a';
      g.beginPath();
      g.moveTo(x, 0); g.lineTo(x + 20, 0); g.lineTo(x + 20 - 14, 14); g.lineTo(x - 14, 14);
      g.fill();
      g.beginPath();
      g.moveTo(x, h - 14); g.lineTo(x + 20, h - 14); g.lineTo(x + 6, h); g.lineTo(x - 14, h);
      g.fill();
    }
  }
  g.fillStyle = opts.color || '#f2e6c2';
  g.font = `bold ${opts.size || 56}px Georgia, 'Times New Roman', serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const lines = String(text).split('\n');
  lines.forEach((line, i) => g.fillText(line, w / 2, h / 2 + (i - (lines.length - 1) / 2) * (opts.size || 56) * 1.1, w - 20));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/* Pohled ven dveřmi: noční obloha a obrys cvičiště (překážková dráha). */
function nightTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 384;
  const g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, 384);
  sky.addColorStop(0, '#070b16');
  sky.addColorStop(0.62, '#1d2c4a');
  sky.addColorStop(0.72, '#33476a');
  g.fillStyle = sky;
  g.fillRect(0, 0, 256, 384);
  g.fillStyle = '#05070c';
  g.fillRect(0, 276, 256, 108);
  // obrysy: stěna, šplhací rám, kladina, plot
  g.fillRect(18, 236, 70, 42);
  g.fillRect(120, 200, 6, 78);
  g.fillRect(170, 200, 6, 78);
  g.fillRect(120, 200, 56, 5);
  for (let y = 214; y < 276; y += 14) g.fillRect(120, y, 56, 3);
  g.fillRect(196, 258, 56, 5);
  g.fillRect(204, 258, 4, 20);
  g.fillRect(240, 258, 4, 20);
  for (let x = 0; x < 256; x += 12) g.fillRect(x, 262, 2, 16);
  g.fillRect(0, 266, 256, 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* Pohled dveřmi do další chodby GSPORT: tma, neonové pruhy a vzdálený nápis (door.view = "neon"). */
function neonTexture(label) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 384;
  const g = c.getContext('2d');
  g.fillStyle = '#05070c';
  g.fillRect(0, 0, 256, 384);
  // chodba v perspektivě: podlaha a strop se sbíhají
  g.fillStyle = '#0d1016';
  g.beginPath(); g.moveTo(0, 384); g.lineTo(256, 384); g.lineTo(176, 250); g.lineTo(80, 250); g.closePath(); g.fill();
  for (const [y0, y1, col] of [[40, 250, '#36c6e8'], [60, 258, '#e03cc8']]) {
    g.strokeStyle = col; g.lineWidth = 3; g.globalAlpha = 0.8;
    g.beginPath(); g.moveTo(0, y0); g.lineTo(80, y1); g.stroke();
    g.beginPath(); g.moveTo(256, y0); g.lineTo(176, y1); g.stroke();
  }
  g.globalAlpha = 1;
  g.fillStyle = '#ffb3f0';
  g.font = 'bold 28px Arial, sans-serif';
  g.textAlign = 'center';
  g.shadowColor = '#e03cc8'; g.shadowBlur = 16;
  g.fillText(label || 'SPIN ZONE', 128, 230);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* Dřevěná bedna s nápisem výšky. */
function crateTexture(label) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#8b6a3f';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 260; i++) {
    const y = Math.random() * 256;
    g.strokeStyle = `rgba(${60 + Math.random() * 40}, ${40 + Math.random() * 25}, 20, ${0.15 + Math.random() * 0.25})`;
    g.beginPath();
    g.moveTo(0, y);
    g.bezierCurveTo(80, y + Math.random() * 6 - 3, 170, y + Math.random() * 6 - 3, 256, y);
    g.stroke();
  }
  g.fillStyle = 'rgba(30, 18, 8, 0.6)';
  for (let y = 64; y < 256; y += 64) g.fillRect(0, y - 2, 256, 4);
  g.strokeStyle = '#5b4224';
  g.lineWidth = 22;
  g.strokeRect(11, 11, 234, 234);
  g.lineWidth = 16;
  g.beginPath();
  g.moveTo(22, 234);
  g.lineTo(234, 22);
  g.stroke();
  if (label) {
    g.fillStyle = 'rgba(20, 14, 8, 0.85)';
    g.fillRect(58, 100, 140, 56);
    g.fillStyle = '#f0dfb0';
    g.font = 'bold 40px Georgia, serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(label, 128, 130);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class World3D {
  /* def = room.world z game.json; opts: { reducedMotion, attacks, on: { message, sfx, stats, defeat, end } } */
  constructor(container, def, opts = {}) {
    this.def = def;
    this.texts = def.texts || {};
    this.on = opts.on || {};
    this.reducedMotion = Boolean(opts.reducedMotion);
    this.attacksOn = opts.attacks !== false;
    this.container = container;
    this.touchMode = window.matchMedia('(pointer: coarse)').matches;
    this.buildDom();
    // bez WebGL vyhodí chybu – ui.js ji zachytí a nabídne náhradní text
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.maxRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    this.ratio = this.maxRatio;
    this.renderer.setPixelRatio(this.ratio);
    this.keys = {};
    this.stick = { x: 0, y: 0 };
    this.paused = true;
    this.running = false;
    this.stats = { svaly_spravne: 0, svaly_chybne: 0, skok_max: 0 };
    this.hints = new Set();   // útoky, u kterých už bliká nápověda (po chybě nebo po prvním úderu)
    this.time = 0;
    this.frameBound = (t) => this.frame(t);
  }

  /* ---------- Obrazovka: plátno a ovládací prvky ---------- */

  buildDom() {
    const c = this.container;
    c.innerHTML = '';
    c.classList.add('w3d');
    c.tabIndex = -1;
    const el = (tag, cls, parent = c) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      parent.appendChild(e);
      return e;
    };
    this.canvas = el('canvas', 'w3d-canvas');
    const ui = {};
    ui.cross = el('div', 'w3d-cross');
    ui.gun = el('img', 'w3d-gun');
    ui.gun.alt = '';
    ui.lives = el('div', 'w3d-lives');
    ui.pack = el('div', 'w3d-pack');
    ui.prompt = el('div', 'w3d-prompt');
    ui.charge = el('div', 'w3d-charge');
    ui.chargeBar = el('div', 'w3d-charge-bar', ui.charge);
    ui.chargeText = el('span', 'w3d-charge-text', ui.charge);
    ui.hint = el('div', 'w3d-hint');
    ui.banner = el('div', 'w3d-banner');
    ui.bannerTitle = el('div', 'w3d-banner-title', ui.banner);
    ui.bannerText = el('div', 'w3d-banner-text', ui.banner);
    ui.bannerHint = el('div', 'w3d-banner-hint', ui.banner);
    ui.bannerBar = el('div', 'w3d-banner-bar', ui.banner);
    ui.bannerFill = el('div', 'w3d-banner-fill', ui.bannerBar);
    ui.toast = el('div', 'w3d-toast');
    ui.flash = el('div', 'w3d-flash');
    ui.fade = el('div', 'w3d-fade');
    ui.touch = el('div', 'w3d-touch');
    ui.moveZone = el('div', 'w3d-movezone', ui.touch);
    ui.stick = el('div', 'w3d-stick', ui.touch);
    ui.knob = el('div', 'w3d-knob', ui.stick);
    const btn = (cls, label) => {
      const b = el('button', `w3d-btn ${cls}`, ui.touch);
      b.type = 'button';
      b.textContent = label;
      return b;
    };
    ui.bJump = btn('w3d-b-jump', 'Skok');
    ui.bCrouch = btn('w3d-b-crouch', 'Podřep');
    ui.bAction = btn('w3d-b-action', 'Akce');
    ui.bFire = btn('w3d-b-fire', 'Laser');
    for (const k of ['cross', 'gun', 'pack', 'charge', 'bFire', 'banner', 'toast']) ui[k].hidden = true;
    ui.bannerHint.textContent = this.texts.bannerHint || '';
    ui.touch.hidden = !this.touchMode;
    ui.hint.textContent = this.texts.mouse || 'Klikni do obrazu – pak se rozhlížíš myší (Esc myš uvolní).';
    ui.hint.hidden = this.touchMode;
    this.ui = ui;
    if (this.touchMode) this.showTouchHint();
  }

  /* Na tabletu krátce ukázat, jak se chodí a rozhlíží. */
  showTouchHint() {
    if (!this.texts.touch) return;
    this.ui.hint.textContent = this.texts.touch;
    this.ui.hint.hidden = false;
    clearTimeout(this.touchHintTimer);
    this.touchHintTimer = setTimeout(() => { if (this.touchMode) this.ui.hint.hidden = true; }, 9000);
  }

  /* Krátká hláška uprostřed obrazu (výsledek zásahu); kind: ok / bad / info. */
  toast(text, kind = 'info') {
    const el = this.ui.toast;
    el.textContent = text;
    el.className = `w3d-toast w3d-toast-${kind}`;
    el.hidden = !text;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
  }

  /* ---------- Načtení a stavba světa ---------- */

  async load() {
    const def = this.def;
    const loader = new THREE.TextureLoader();
    const tex = async (src) => {
      const t = await loader.loadAsync(src);
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 4;
      return t;
    };
    const T = def.textures || {};
    const [wall, floor, ceiling, pipes] = await Promise.all([T.wall, T.floor, T.ceiling, T.pipes || T.wall].map(tex));
    this.tex = { wall, floor, ceiling, pipes };
    if (T.gun) this.ui.gun.src = T.gun;
    this.gunTexture = T.gun ? await tex(T.gun) : null;
    this.build();
    this.reset(true);
    this.bindInput();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    this.resize();
  }

  build() {
    const def = this.def;
    const hall = def.hall || { x: [-3, 3], z: [-32, 0.5], height: 4.2 };
    const [X0, X1] = hall.x, [Z0, Z1] = hall.z, H = hall.height;
    const TM = def.texMeters || 2.4;
    this.hall = { X0, X1, Z0, Z1, H };
    const scene = new THREE.Scene();
    this.scene = scene;
    scene.background = new THREE.Color(0x07070a);
    scene.fog = new THREE.Fog(0x07070a, 9, 34);
    this.camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.05, 80);
    this.camera.rotation.order = 'YXZ';
    scene.add(this.camera);

    // světla: rozptýlené, lampy u stropu, baterka hráče
    this.ambient = new THREE.AmbientLight(0xffffff, 0.3);
    this.hemi = new THREE.HemisphereLight(0x9aa2c0, 0x2a2018, 0.45);
    scene.add(this.ambient, this.hemi);
    this.lamps = [];
    const lampMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffe2b0, emissiveIntensity: 1.6 });
    for (const [x, z, flicker] of def.lamps || []) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.22), lampMat.clone());
      box.position.set(x, H - 0.04, z);
      const light = new THREE.PointLight(0xffe2b0, 9, 16, 1.6);
      light.position.set(x, H - 0.45, z);
      scene.add(box, light);
      this.lamps.push({ box, light, flicker: Boolean(flicker), base: 9 });
    }
    this.flashlight = new THREE.SpotLight(0xfff2dc, 0, 18, 0.48, 0.5, 1.4);
    this.flashlight.position.set(0.15, -0.1, 0);
    this.flashlight.target.position.set(0, -0.1, -1);
    this.camera.add(this.flashlight, this.flashlight.target);

    const mats = {
      wall: new THREE.MeshStandardMaterial({ map: this.tex.wall, roughness: 0.92 }),
      pipes: new THREE.MeshStandardMaterial({ map: this.tex.pipes, roughness: 0.85 }),
      floor: new THREE.MeshStandardMaterial({ map: this.tex.floor, roughness: 0.95 }),
      ceiling: new THREE.MeshStandardMaterial({ map: this.tex.ceiling, roughness: 1 }),
    };
    this.materials = mats;
    const q = { wall: new Quads(), pipes: new Quads(), floor: new Quads(), ceiling: new Quads() };
    this.solids = [];        // kolizní kvádry { min: [x, y, z], max: [x, y, z] }
    this.blocks = [];        // na co se dá vyskočit / vylézt
    this.rayMeshes = [];     // co zastaví laser
    const solid = (min, max, extra = {}) => {
      const s = { min, max, ...extra };
      this.solids.push(s);
      return s;
    };

    // stěna od (xa, za) do (xb, zb) zleva doprava při pohledu zevnitř; dole celá textura, nahoře omítka
    const pipesEvery = def.pipesEvery || 0;
    const wallRun = (xa, za, xb, zb, n, y0 = 0, y1 = H, pipesSide = false) => {
      const len = Math.hypot(xb - xa, zb - za);
      const segs = Math.max(1, Math.round(len / TM));
      for (let i = 0; i < segs; i++) {
        const f0 = i / segs, f1 = (i + 1) / segs;
        const p0 = [xa + (xb - xa) * f0, za + (zb - za) * f0], p1 = [xa + (xb - xa) * f1, za + (zb - za) * f1];
        const u1 = (len / segs) / TM;
        const lowTop = Math.min(y1, TM);
        const which = pipesSide && pipesEvery && i % pipesEvery === 2 ? q.pipes : q.wall;
        if (y0 < lowTop) {
          which.add([p0[0], y0, p0[1]], [p1[0], y0, p1[1]], [p1[0], lowTop, p1[1]], [p0[0], lowTop, p0[1]], n,
            [[0, y0 / TM], [u1, y0 / TM], [u1, lowTop / TM], [0, lowTop / TM]]);
        }
        if (y1 > TM) {
          q.wall.add([p0[0], TM, p0[1]], [p1[0], TM, p1[1]], [p1[0], y1, p1[1]], [p0[0], y1, p0[1]], n,
            [[0, 0.62], [u1, 0.62], [u1, 0.98], [0, 0.98]]);
        }
      }
    };
    const door = def.door || { x: [-0.75, 0.75], z: Z0, height: 2.3 };
    const DH = door.height || 2.3;
    wallRun(X0, Z1, X0, Z0, [1, 0, 0]);                     // levá stěna
    wallRun(X1, Z0, X1, Z1, [-1, 0, 0], 0, H, true);        // pravá stěna (místy potrubí)
    wallRun(X1, Z1, X0, Z1, [0, 0, -1]);                    // zadní stěna za startem
    wallRun(X0, Z0, door.x[0], Z0, [0, 0, 1]);              // čelní stěna vlevo od dveří
    wallRun(door.x[1], Z0, X1, Z0, [0, 0, 1]);              // vpravo od dveří
    q.wall.add([door.x[0], DH, Z0], [door.x[1], DH, Z0], [door.x[1], H, Z0], [door.x[0], H, Z0], [0, 0, 1],
      [[0, 0.62], [0.6, 0.62], [0.6, 0.98], [0, 0.98]]);
    // průchod za dveřmi a noc venku
    const TZ = Z0 - 2.5;
    wallRun(door.x[0], Z0, door.x[0], TZ, [1, 0, 0], 0, DH);
    wallRun(door.x[1], TZ, door.x[1], Z0, [-1, 0, 0], 0, DH);
    q.ceiling.add([door.x[0], DH, TZ], [door.x[1], DH, TZ], [door.x[1], DH, Z0], [door.x[0], DH, Z0], [0, -1, 0],
      [[0, 0], [0.6, 0], [0.6, 1], [0, 1]]);
    q.floor.add([door.x[0], 0, Z0], [door.x[1], 0, Z0], [door.x[1], 0, TZ], [door.x[0], 0, TZ], [0, 1, 0],
      [[0, 0], [0.6, 0], [0.6, 1], [0, 1]]);
    const night = new THREE.Mesh(new THREE.PlaneGeometry(door.x[1] - door.x[0], DH),
      new THREE.MeshBasicMaterial({ map: (def.door && def.door.view === 'neon') ? neonTexture(def.door.viewLabel) : nightTexture(), fog: false }));
    night.position.set((door.x[0] + door.x[1]) / 2, DH / 2, TZ + 0.01);
    scene.add(night);

    // podlaha a strop
    const fq = (x0, x1, z0, z1, y, quads, n) => {
      const uv = [[x0 / TM, z1 / TM], [x1 / TM, z1 / TM], [x1 / TM, z0 / TM], [x0 / TM, z0 / TM]];
      if (n > 0) quads.add([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [0, 1, 0], uv);
      else quads.add([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [0, -1, 0], uv);
    };
    fq(X0, X1, Z0, Z1, 0, q.floor, 1);
    fq(X0, X1, Z0, Z1, H, q.ceiling, -1);

    // stěny jako kolizní kvádry
    solid([X0 - 1, -1, Z0 - 4], [X0, H + 1, Z1 + 1]);
    solid([X1, -1, Z0 - 4], [X1 + 1, H + 1, Z1 + 1]);
    solid([X0 - 1, -1, Z1], [X1 + 1, H + 1, Z1 + 1]);
    solid([X0 - 1, -1, Z0 - 0.4], [door.x[0], H + 1, Z0]);
    solid([door.x[1], -1, Z0 - 0.4], [X1 + 1, H + 1, Z0]);
    solid([door.x[0] - 1, -1, TZ - 1], [door.x[0], H + 1, Z0]);
    solid([door.x[1], -1, TZ - 1], [door.x[1] + 1, H + 1, Z0]);
    solid([door.x[0] - 1, -1, TZ - 1], [door.x[1] + 1, H + 1, TZ]);

    // kvádry: bedny (dřevo s nápisem výšky) a plošina (beton, nahoře podlaha)
    for (const b of def.blocks || []) {
      const [x0, x1] = b.x, [z0, z1] = b.z, h = b.h;
      const block = solid([x0, 0, z0], [x1, h, z1], { kind: b.kind, label: b.label, top: h });
      this.blocks.push(block);
      if (b.kind === 'bedna') {
        const t = crateTexture(b.label);
        const top = crateTexture('');
        const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 });
        const mt = new THREE.MeshStandardMaterial({ map: top, roughness: 0.8 });
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, h, z1 - z0), [m, m, mt, mt, m, m]);
        mesh.position.set((x0 + x1) / 2, h / 2, (z0 + z1) / 2);
        scene.add(mesh);
        this.rayMeshes.push(mesh);
      } else {
        const L = (a, b2) => Math.abs(b2 - a) / TM;
        const vh = h / TM;
        q.wall.add([x0, 0, z1], [x1, 0, z1], [x1, h, z1], [x0, h, z1], [0, 0, 1], [[0, 0], [L(x0, x1), 0], [L(x0, x1), vh], [0, vh]]);
        q.wall.add([x1, 0, z0], [x0, 0, z0], [x0, h, z0], [x1, h, z0], [0, 0, -1], [[0, 0], [L(x0, x1), 0], [L(x0, x1), vh], [0, vh]]);
        q.wall.add([x0, 0, z0], [x0, 0, z1], [x0, h, z1], [x0, h, z0], [-1, 0, 0], [[0, 0], [L(z0, z1), 0], [L(z0, z1), vh], [0, vh]]);
        q.wall.add([x1, 0, z1], [x1, 0, z0], [x1, h, z0], [x1, h, z1], [1, 0, 0], [[0, 0], [L(z0, z1), 0], [L(z0, z1), vh], [0, vh]]);
        fq(x0, x1, z0, z1, h, q.floor, 1);
        if (b.label) {
          const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.3),
            new THREE.MeshStandardMaterial({ map: textTexture(b.label, { bg: '#1b1712', size: 70 }), roughness: 0.9 }));
          sign.position.set((x0 + x1) / 2 + 0.6, h - 0.35, z1 + 0.01);
          scene.add(sign);
        }
      }
    }
    for (const [k, quads] of Object.entries(q)) {
      if (!quads.pos.length) continue;
      const mesh = quads.mesh(mats[k]);
      scene.add(mesh);
      this.rayMeshes.push(mesh);
    }

    // žebřiny na čele plošiny
    const L = def.ladder;
    if (L) {
      const wood = new THREE.MeshStandardMaterial({ color: 0xb08852, roughness: 0.6 });
      const top = L.top + 0.9;
      const zf = L.z + 0.07;
      for (const x of L.x) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.07, top, 0.07), wood);
        post.position.set(x, top / 2, zf);
        scene.add(post);
      }
      const rungGeo = new THREE.CylinderGeometry(0.018, 0.018, L.x[1] - L.x[0], 8);
      for (let y = 0.2; y < top - 0.05; y += 0.2) {
        const rung = new THREE.Mesh(rungGeo, wood);
        rung.rotation.z = Math.PI / 2;
        rung.position.set((L.x[0] + L.x[1]) / 2, y, zf);
        scene.add(rung);
      }
      this.ladder = { x: L.x, z: L.z, top: L.top };
    }

    // nápis na okraji plošiny (seskok)
    const E = def.edgeSign;
    if (E) {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.55),
        new THREE.MeshStandardMaterial({ map: textTexture(E.text, { bg: '#1b1712', size: 30, stripes: true, w: 1024, h: 220 }), roughness: 0.9 }));
      sign.rotation.x = -Math.PI / 2;
      sign.position.set(E.at[0], E.y || 2.005, E.at[1]);
      scene.add(sign);
    }

    // stojan s cvičnou laserovou puškou (u levé stěny)
    if (def.rack) {
      const [rx, rz] = def.rack.at;
      const board = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.7, 1.1), new THREE.MeshStandardMaterial({ color: 0x2b2a26, roughness: 0.9 }));
      board.position.set(rx, 1.25, rz);
      scene.add(board);
      if (this.gunTexture) {
        const gunTex = this.gunTexture.clone();
        gunTex.wrapS = gunTex.wrapT = THREE.ClampToEdgeWrapping;
        gunTex.needsUpdate = true;
        this.rackGun = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.57), new THREE.MeshStandardMaterial({ map: gunTex, transparent: true, alphaTest: 0.3, roughness: 0.6 }));
        this.rackGun.position.set(rx + 0.04, 1.25, rz);
        this.rackGun.rotation.y = rx < 0 ? Math.PI / 2 : -Math.PI / 2;
        scene.add(this.rackGun);
      }
      this.rack = { x: rx, z: rz };
      const label = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.22),
        new THREE.MeshStandardMaterial({ map: textTexture(def.rack.label || 'CVIČNÁ LASEROVÁ PUŠKA', { bg: '#1b1712', size: 44, w: 1024, h: 220 }), roughness: 0.9 }));
      label.position.set(rx + 0.03, 1.75, rz);
      label.rotation.y = rx < 0 ? Math.PI / 2 : -Math.PI / 2;
      scene.add(label);
    }

    // batoh 15 kg
    if (def.backpack) {
      const g = new THREE.Group();
      const olive = new THREE.MeshStandardMaterial({ color: 0x4f5a2a, roughness: 0.85 });
      const dark = new THREE.MeshStandardMaterial({ color: 0x2c3018, roughness: 0.9 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.5, 0.24), olive);
      body.position.y = 0.25;
      const top = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 8), olive);
      top.scale.set(1, 0.45, 0.65);
      top.position.y = 0.5;
      const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.2, 0.08), dark);
      pocket.position.set(0, 0.2, 0.15);
      g.add(body, top, pocket);
      for (const x of [-0.11, 0.11]) {
        const strap = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.46, 0.03), dark);
        strap.position.set(x, 0.27, -0.13);
        g.add(strap);
      }
      g.position.set(def.backpack.at[0], 0, def.backpack.at[1]);
      g.rotation.y = 0.5;
      scene.add(g);
      this.backpack = g;
      this.packKg = def.backpack.kg || 15;
    }

    // dveře na cvičiště (otevřou se, až svalovec padne)
    const panelMat = new THREE.MeshStandardMaterial({ color: 0x3d4a3c, roughness: 0.7, metalness: 0.2 });
    const doorW = door.x[1] - door.x[0];
    this.door = new THREE.Group();
    const panel = new THREE.Mesh(new THREE.BoxGeometry(doorW, DH, 0.08), panelMat);
    panel.position.y = DH / 2;
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(doorW * 0.8, 0.3),
      new THREE.MeshStandardMaterial({ map: textTexture(door.label || 'CVIČIŠTĚ', { bg: '#e8dcc0', color: '#1b1712', size: 60 }), roughness: 0.8 }));
    plate.position.set(0, DH * 0.72, 0.045);
    this.door.add(panel, plate);
    this.door.position.set((door.x[0] + door.x[1]) / 2, 0, Z0 + 0.06);
    scene.add(this.door);
    this.doorDef = { x: door.x, z: Z0, w: doorW, tunnel: TZ };
    this.doorSolid = solid([door.x[0], 0, Z0 - 0.2], [door.x[1], DH + 1, Z0 + 0.12], { door: true });
    this.rayMeshes.push(panel);

    // svalovec
    const S = def.svalovec || { at: [0, Z0 + 5] };
    this.zone = def.zone3 || { x: [X0 + 0.4, X1 - 0.4], z: [Z0 + 0.7, Z0 + 15] };
    this.sval = new Svalovec({
      attacks: S.attacks,
      on: (ev, data) => this.svalEvent(ev, data),
    });
    this.sval.place(S.at[0], S.at[1], 0);
    this.sval.addTo(scene);

    // laserový paprsek a jiskra zásahu
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1, 6),
      new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.spark = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xff7050, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.beam.visible = this.spark.visible = false;
    scene.add(this.beam, this.spark);
    this.raycaster = new THREE.Raycaster();
  }

  /* Začátek (first = poprvé) nebo návrat po porážce: hráč na startu / pod plošinou. */
  reset(first) {
    const P = this.def.player || {};
    const atCheckpoint = !first && this.checkpoint;
    const start = atCheckpoint ? (this.def.checkpoint || [0, this.zone.z[1] - 0.6, 0]) : [P.start[0], P.start[1], P.yaw || 0];
    this.pos = new THREE.Vector3(start[0], 0, start[1]);
    this.vel = new THREE.Vector3();
    this.yaw = (start[2] || 0) * Math.PI / 180;
    this.pitch = -0.04;
    this.onGround = true;
    this.mode = 'walk';
    this.charge = null;
    this.apex = 0;
    this.eye = EYE;
    this.dip = 0;
    this.shake = 0;
    this.lives = 3;
    this.dead = false;
    this.stepTimer = 0;
    if (first) {
      this.hasGun = false;
      this.carrying = false;
      this.checkpoint = false;
      this.ended = false;
      this.doorOpen = 0;
      this.doorOpening = false;
    }
    if (first) {
      this.sval.reset();
      this.sval.place(this.sval.home.x, this.sval.home.z, 0);
    } else if (this.sval.alive) this.sval.respawn();
    this.hints.clear();
    this.sval.setHint(null);
    this.updateHud();
  }

  get mass() {
    return (this.def.player.kg || 70) + (this.carrying ? this.packKg : 0);
  }

  t(key, vars = {}) {
    const text = this.texts[key] || '';
    return text.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
  }

  /* Text s rozbalovacím vysvětlením: když je v texts i „<klíč>More“, vrátí { text, more } („Proč?“). */
  tm(key, vars = {}) {
    const text = this.t(key, vars);
    const more = this.texts[`${key}More`] ? this.t(`${key}More`, vars) : '';
    return more ? { text, more } : text;
  }

  message(lines) {
    if (this.on.message) this.on.message(Array.isArray(lines) ? lines.filter(Boolean) : [lines]);
  }

  sfx(name) {
    if (this.on.sfx) this.on.sfx(name);
  }

  /* ---------- Ovládání ---------- */

  bindInput() {
    const L = this.listeners = [];
    const on = (target, type, fn, opts) => {
      target.addEventListener(type, fn, opts);
      L.push([target, type, fn, opts]);
    };
    const codeOf = (e) => e.code || e.key;
    const capture = (el, e) => {
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* ukazatel už není aktivní */ }
    };
    const typing = (e) => e.target && e.target.matches && e.target.matches('input, textarea, select');
    on(window, 'keydown', (e) => {
      if (!this.active() || typing(e)) return;
      const code = codeOf(e);
      if (this.handleKey(code, true, e.repeat)) e.preventDefault();
    });
    on(window, 'keyup', (e) => {
      if (!this.active() || typing(e)) return;
      if (this.handleKey(codeOf(e), false, false)) e.preventDefault();
    });
    on(window, 'blur', () => { this.keys = {}; this.releaseCharge(true); });

    // myš: klik = rozhlížení myší (uzamčení ukazatele); když uzamčeno, klik = laser
    const cv = this.canvas;
    let drag = null;
    on(cv, 'pointerdown', (e) => {
      if (!this.active()) return;
      if (e.pointerType === 'touch') {
        this.setTouchMode(true);
        if (!this.lookTouch) this.lookTouch = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() };
        capture(cv, e);
        return;
      }
      this.container.focus({ preventScroll: true });
      if (this.locked) {
        if (e.button === 0) this.shoot(0, 0);
        return;
      }
      drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY };
    });
    on(cv, 'pointermove', (e) => {
      if (e.pointerType === 'touch') {
        const lt = this.lookTouch;
        if (lt && lt.id === e.pointerId) {
          this.look((e.clientX - lt.x) * 0.006, (e.clientY - lt.y) * 0.006);
          lt.x = e.clientX;
          lt.y = e.clientY;
        }
        return;
      }
      if (drag && !this.locked) {
        this.look((e.clientX - drag.x) * 0.005, (e.clientY - drag.y) * 0.005);
        drag.x = e.clientX;
        drag.y = e.clientY;
      }
    });
    const up = (e) => {
      if (e.pointerType === 'touch') {
        const lt = this.lookTouch;
        if (lt && lt.id === e.pointerId) {
          // krátké klepnutí do obrazu = výstřel do toho místa
          if (Math.hypot(e.clientX - lt.sx, e.clientY - lt.sy) < 10 && performance.now() - lt.t < 300) this.shootAt(e.clientX, e.clientY);
          this.lookTouch = null;
        }
        return;
      }
      if (drag && !this.locked) {
        const moved = Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy);
        drag = null;
        if (moved < 6) {
          if (this.hasGun) this.shootAt(e.clientX, e.clientY);
          if (this.active() && cv.requestPointerLock) {
            try {
              const p = cv.requestPointerLock();
              if (p && p.catch) p.catch(() => {});
            } catch (err) { /* uzamčení nepovoleno – rozhlížení tažením */ }
          }
        }
      }
    };
    on(cv, 'pointerup', up);
    on(cv, 'pointercancel', up);
    on(document, 'pointerlockchange', () => {
      this.locked = document.pointerLockElement === cv;
      this.ui.hint.hidden = this.locked || this.touchMode;
      this.ui.cross.hidden = !this.hasGun && !this.locked;
    });
    on(document, 'mousemove', (e) => {
      if (this.locked && this.active()) this.look(e.movementX * 0.0024, e.movementY * 0.0024);
    });

    // dotyk: chůze – prst kamkoli do levé části obrazu (páčka se objeví pod ním); klepnutí = výstřel
    const zone = this.ui.moveZone;
    on(zone, 'pointerdown', (e) => {
      if (!this.active() || this.stickTouch) return;
      e.preventDefault();
      capture(zone, e);
      this.setTouchMode(true);
      this.stickTouch = { id: e.pointerId, cx: e.clientX, cy: e.clientY, t: performance.now(), moved: 0 };
      const r = this.container.getBoundingClientRect();
      const st = this.ui.stick.style;
      st.left = `${e.clientX - r.left - STICK_R}px`;
      st.top = `${e.clientY - r.top - STICK_R}px`;
      st.bottom = 'auto';
      this.ui.stick.classList.add('w3d-stick-live');
    });
    on(zone, 'pointermove', (e) => {
      const s = this.stickTouch;
      if (s && s.id === e.pointerId) this.moveStick(e.clientX - s.cx, e.clientY - s.cy);
    });
    const zoneUp = (e) => {
      const s = this.stickTouch;
      if (!s || s.id !== e.pointerId) return;
      if (s.moved < 10 && performance.now() - s.t < 300) this.shootAt(e.clientX, e.clientY);
      this.stickTouch = null;
      this.stick.x = this.stick.y = 0;
      this.ui.knob.style.transform = '';
      this.ui.stick.removeAttribute('style');
      this.ui.stick.classList.remove('w3d-stick-live');
    };
    on(zone, 'pointerup', zoneUp);
    on(zone, 'pointercancel', zoneUp);
    const hold = (b, down, upFn) => {
      on(b, 'pointerdown', (e) => { e.preventDefault(); capture(b, e); if (this.active()) down(); });
      on(b, 'pointerup', (e) => { e.preventDefault(); upFn(); });
      on(b, 'pointercancel', () => upFn());
      on(b, 'click', (e) => e.preventDefault());
    };
    hold(this.ui.bJump, () => this.startCharge(), () => this.releaseCharge());
    hold(this.ui.bCrouch, () => { this.keys.crouch = true; }, () => { this.keys.crouch = false; });
    hold(this.ui.bAction, () => this.action(), () => {});
    hold(this.ui.bFire, () => this.shoot(0, 0), () => {});
  }

  setTouchMode(on) {
    if (this.touchMode === on) return;
    this.touchMode = on;
    this.ui.touch.hidden = !on;
    this.ui.hint.hidden = on || this.locked;
    if (on) this.showTouchHint();
  }

  /* Páčka: posun prstu od místa dotyku (px) → směr chůze; uprostřed mrtvá zóna. */
  moveStick(dx, dy) {
    const s = this.stickTouch;
    if (s) s.moved = Math.max(s.moved, Math.hypot(dx, dy));
    let x = dx / STICK_R, y = dy / STICK_R;
    let len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; len = 1; }
    this.ui.knob.style.transform = `translate(${x * STICK_R}px, ${y * STICK_R}px)`;
    const k = len < 0.15 ? 0 : (len - 0.15) / 0.85 / len;
    this.stick.x = x * k;
    this.stick.y = y * k;
  }

  /* Klávesa: true = zpracováno (zabrání posunu stránky / stisku tlačítka). */
  handleKey(code, down, repeat) {
    const map = {
      KeyW: 'fwd', ArrowUp: 'fwd', KeyS: 'back', ArrowDown: 'back', KeyA: 'left', KeyD: 'right',
      ArrowLeft: 'turnL', ArrowRight: 'turnR', PageUp: 'lookUp', PageDown: 'lookDown', KeyR: 'lookUp', KeyF: 'lookDown',
      KeyC: 'crouch',
    };
    if (map[code]) {
      this.keys[map[code]] = down;
      return true;
    }
    if (code === 'Space') {
      if (down && !repeat && this.mode === 'climb') this.letGo = true;
      else if (down && !repeat) this.startCharge();
      if (!down) this.releaseCharge();
      return true;
    }
    if (code === 'KeyE') {
      if (down && !repeat) this.action();
      return true;
    }
    if (code === 'Enter' || code === 'KeyX' || code === 'NumpadEnter') {
      if (down && !repeat) this.shoot(0, 0);
      return true;
    }
    return false;
  }

  look(dx, dy) {
    this.yaw -= dx;
    this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch - dy));
  }

  active() {
    return this.running && !this.paused && !this.dead && document.body.contains(this.container) && !this.container.hidden;
  }

  /* ---------- Skok: odraz se „nabíjí“ držením (impulz = síla × doba odrazu) ---------- */

  startCharge() {
    if (!this.active() || this.mode !== 'walk' || !this.onGround || this.charge) return;
    this.charge = { t0: this.time };
    this.ui.charge.hidden = false;
  }

  releaseCharge(cancel) {
    if (!this.charge) return;
    const P = this.def.player;
    const held = this.time - this.charge.t0;
    this.charge = null;
    this.ui.charge.hidden = true;
    if (cancel || this.mode !== 'walk' || !this.onGround) return;
    const tMax = P.pushMax || 0.6;
    const t = Math.max(0.05, Math.min(tMax, held));
    const F = P.force || 400;
    const J = F * t;
    const m = this.mass;
    const v = J / m;
    this.vel.y = v;
    this.onGround = false;
    this.apex = this.pos.y;
    this.jump = { t, F, J, m, v, h: v * v / (2 * G), startY: this.pos.y, limited: held > tMax + 0.05, target: this.blockAhead(1.4) };
    this.sfx('step');
  }

  /* Kvádr před hráčem (bedna, plošina): { block, dist, rise } nebo null. */
  blockAhead(maxDist, minDist = R + 0.02) {
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    for (let d = minDist; d <= maxDist; d += 0.05) {
      const x = this.pos.x + fx * d, z = this.pos.z + fz * d;
      for (const b of this.blocks) {
        if (x >= b.min[0] && x <= b.max[0] && z >= b.min[2] && z <= b.max[2] && b.top > this.pos.y + 0.15) {
          return { block: b, dist: d, rise: b.top - this.pos.y };
        }
      }
    }
    return null;
  }

  /* ---------- Akce (E): puška, batoh, vylézt, dveře ---------- */

  near(x, z, dist) {
    return Math.hypot(this.pos.x - x, this.pos.z - z) < dist && this.pos.y < 0.5;
  }

  availableAction() {
    if (this.mode !== 'walk' || !this.onGround) return null;
    if (this.rack && !this.hasGun && this.near(this.rack.x, this.rack.z, 1.4)) return { kind: 'gun', label: this.texts.promptGun || 'E – vzít laserovou pušku' };
    if (this.backpack && !this.carrying && this.backpack.visible && this.near(this.backpack.position.x, this.backpack.position.z, 1.2)) {
      return { kind: 'pack', label: this.t('promptPack', { kg: this.packKg }) || 'E – vzít batoh' };
    }
    const ahead = this.blockAhead(R + 0.45);
    if (ahead) {
      if (ahead.rise >= MANTLE_MIN && ahead.rise <= MANTLE_MAX) return { kind: 'mantle', ahead, label: this.t('promptMantle', { h: num(ahead.rise, 1) }) };
      return { kind: 'info', ahead };
    }
    const doorX = (this.doorDef.x[0] + this.doorDef.x[1]) / 2;
    if (this.doorSolid && this.near(doorX, this.doorDef.z + 0.6, 1.5)) return { kind: 'door', label: this.texts.promptDoor || 'Dveře na cvičiště' };
    if (this.carrying) return { kind: 'drop', label: '' };
    return null;
  }

  action() {
    if (!this.active()) return;
    const a = this.availableAction();
    if (!a) return;
    if (a.kind === 'gun') {
      this.hasGun = true;
      if (this.rackGun) this.rackGun.visible = false;
      this.sfx('pickup');
      this.message([this.t('gunTaken')]);
      if (this.on.flag) this.on.flag('puska_cviciste');   // pro vzkazy od D.
      this.sval.wake();
      this.updateHud();
    } else if (a.kind === 'pack') {
      this.carrying = true;
      this.backpack.visible = false;
      this.sfx('pickup');
      this.message([this.tm('packOn', { m: num(this.mass, 0), kg: this.packKg })]);
      this.updateHud();
    } else if (a.kind === 'drop') {
      this.carrying = false;
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      this.backpack.position.set(this.pos.x + fx * 0.7, this.pos.y, this.pos.z + fz * 0.7);
      this.backpack.visible = true;
      this.message([this.t('packOff', { m: num(this.mass, 0) })]);
      this.updateHud();
    } else if (a.kind === 'mantle') {
      this.startMantle(a.ahead);
    } else if (a.kind === 'info') {
      const h = num(a.ahead.rise, 1);
      this.message([a.ahead.rise > MANTLE_MAX ? this.t('tooHigh', { h }) : this.t('jumpHere', { h })]);
    } else if (a.kind === 'door') {
      this.message([this.t('doorLocked')]);
    }
  }

  startMantle(ahead) {
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const b = ahead.block;
    const tx = Math.max(b.min[0] + R, Math.min(b.max[0] - R, this.pos.x + fx * (ahead.dist + 0.6)));
    const tz = Math.max(b.min[2] + R, Math.min(b.max[2] - R, this.pos.z + fz * (ahead.dist + 0.6)));
    this.mode = 'mantle';
    this.mantle = { t: 0, from: this.pos.clone(), to: new THREE.Vector3(tx, b.top, tz), rise: ahead.rise };
    this.vel.set(0, 0, 0);
  }

  /* ---------- Laser ---------- */

  shootAt(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    this.shoot(((clientX - r.left) / r.width) * 2 - 1, -(((clientY - r.top) / r.height) * 2 - 1));
  }

  shoot(nx, ny) {
    if (!this.active() || !this.hasGun) return;
    const now = performance.now();
    if (now - (this.lastShot || 0) < 300) return;
    this.lastShot = now;
    this.sfx('laser');
    this.raycaster.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
    this.raycaster.far = 40;
    const wall = this.raycaster.intersectObjects(this.rayMeshes, false)[0];
    const hit = this.sval.hitTest(this.raycaster);
    let point;
    if (hit && (!wall || hit.distance < wall.distance)) {
      point = hit.point;
      this.handleHit(hit);
    } else {
      point = wall ? wall.point : this.raycaster.ray.at(30, new THREE.Vector3());
    }
    // paprsek od hlavně pušky (vpravo dole) k zásahu
    const from = new THREE.Vector3(0.2, -0.22, -0.5).applyMatrix4(this.camera.matrixWorld);
    const dir = point.clone().sub(from);
    this.beam.position.copy(from).addScaledVector(dir, 0.5);
    this.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    this.beam.scale.set(1, dir.length(), 1);
    this.beam.visible = this.spark.visible = true;
    this.spark.position.copy(point);
    this.beamT = 0.18;
    this.ui.gun.classList.remove('w3d-recoil');
    void this.ui.gun.offsetWidth;
    this.ui.gun.classList.add('w3d-recoil');
  }

  muscleInfo(id) {
    const m = (this.def.muscles || {})[id] || {};
    return { muscle: m.name || id, does: m.does || '' };
  }

  /* Zásah svalovce: správný sval (ten, který právě útok provádí) útok vypne. */
  handleHit(hit) {
    const sv = this.sval;
    if (!sv.alive) return;
    if (!sv.awake) sv.wake();
    if (hit.bone) {
      this.message([this.t('bone')]);
      this.toast(this.t('toastBone'));
      return;
    }
    const id = hit.muscle;
    const info = this.muscleInfo(id);
    const attacks = this.def.attacks || {};
    const current = sv.attacking;
    if (sv.isOff(id)) {
      this.message([this.t('disabled', info)]);
      this.toast(this.t('toastDisabled', info));
      return;
    }
    if (current && attacks[current] && attacks[current].target === id) {
      this.stats.svaly_spravne += 1;
      sv.flash(id, 0x50ff70);
      sv.setHint(null);
      this.hints.delete(current);
      this.toast(this.t('toastCorrect', info), 'ok');
      sv.interrupt();
      sv.disableAttack(current, id);
      const lines = [this.t('correct', { ...info, attack: attacks[current].name })];
      if (sv.attacks.length) lines.push(this.t('remaining', { list: sv.attacks.map((a) => (attacks[a] || {}).name || a).join(', ') }));
      this.message(lines);
      this.sfx('pass');
      this.pushStats();
      return;
    }
    sv.flash(id, 0xff5030);
    if (current) {
      // vedle: od teď bliká sval, který útok provede
      this.stats.svaly_chybne += 1;
      this.hints.add(current);
      sv.setHint((attacks[current] || {}).target || null);
      this.message([this.t('wrong', { ...info, prompt: (attacks[current] || {}).prompt || '' }), this.t('hint')]);
      this.toast(this.t('toastWrong', info), 'bad');
      this.pushStats();
      return;
    }
    const isTarget = sv.attacks.some((a) => (attacks[a] || {}).target === id);
    this.message([isTarget ? this.t('notNow', info) : this.t('info', info)]);
    this.toast(isTarget ? this.t('toastNotNow', info) : this.t('toastInfo', info));
  }

  pushStats() {
    const s = { ...this.stats };
    if (!s.skok_max) delete s.skok_max;   // neskákal – řádek na závěrečné obrazovce vynechat
    if (this.on.stats) this.on.stats(s);
  }

  /* Události svalovce. */
  svalEvent(ev, data) {
    const attacks = this.def.attacks || {};
    if (ev === 'wake') {
      this.sfx('kosti');
      this.message([this.hasGun ? this.t('wake') : this.t('wakeNoGun')]);
    } else if (ev === 'attack') {
      const a = attacks[data] || {};
      const hint = this.hints.has(data);
      this.sval.setHint(hint ? a.target : null);
      this.message([a.prompt || '', hint ? this.t('hint') : '']);
    } else if (ev === 'strike') {
      this.hints.add(data.attack);   // útok proběhl bez zásahu – příště bude cílový sval blikat
      if (!data.hit || this.dead) return;
      const name = (attacks[data.attack] || {}).name || data.attack;
      // odhodí hráče kousek dozadu
      const dx = this.pos.x - this.sval.root.position.x, dz = this.pos.z - this.sval.root.position.z;
      const d = Math.hypot(dx, dz) || 1;
      this.vel.x += (dx / d) * 3.5;
      this.vel.z += (dz / d) * 3.5;
      if (!this.attacksOn) {
        this.message([this.t('hitNoDamage', { attack: name })]);
        return;
      }
      this.hurt(this.t('hitPlayer', { attack: name, lives: this.lives - 1 }), 'death');
    } else if (ev === 'collapse') {
      this.sfx('rozpad');
      this.doorOpening = true;
      this.solids = this.solids.filter((s) => s !== this.doorSolid);
      this.doorSolid = null;
      this.message([this.t('defeated')]);
      this.pushStats();
      if (this.on.defeat) this.on.defeat({ ...this.stats });
      setTimeout(() => this.sfx('door'), 600);
    }
  }

  /* Ztráta života (úder svalovce nebo tvrdý dopad); text = řádek nebo pole řádků. */
  hurt(text, deathKey) {
    const lines = Array.isArray(text) ? text : [text];
    this.lives -= 1;
    this.sfx('au');
    this.ui.flash.classList.remove('w3d-hurt');
    void this.ui.flash.offsetWidth;
    this.ui.flash.classList.add('w3d-hurt');
    this.updateHud();
    if (this.lives > 0) {
      this.message(lines);
      return;
    }
    this.dead = true;
    if (this.on.fell) this.on.fell();
    this.keys = {};
    this.charge = null;
    this.ui.fade.classList.add('w3d-dark');
    setTimeout(() => {
      this.reset(false);
      this.ui.fade.classList.remove('w3d-dark');
      this.message([this.t(this.checkpoint ? deathKey : 'deathStart')]);
    }, 900);
  }

  /* ---------- Simulace ---------- */

  update(dt) {
    this.time += dt;   // čas simulace (odraz a lezení se měří v něm)
    const k = this.keys;
    // otáčení klávesami
    if (k.turnL) this.yaw += 2.0 * dt;
    if (k.turnR) this.yaw -= 2.0 * dt;
    if (k.lookUp) this.pitch = Math.min(1.35, this.pitch + 1.4 * dt);
    if (k.lookDown) this.pitch = Math.max(-1.35, this.pitch - 1.4 * dt);

    if (this.mode === 'mantle') this.updateMantle(dt);
    else if (this.mode === 'climb') this.updateClimb(dt);
    else this.updateWalk(dt);

    // svalovec
    const inZone = this.pos.z < this.zone.z[1] + 0.3 && this.pos.y < 0.3;
    const dist = Math.hypot(this.pos.x - this.sval.root.position.x, this.pos.z - this.sval.root.position.z);
    const S = this.def.svalovec || {};
    this.sval.update(dt, {
      player: this.pos,
      bounds: this.zone,
      see: inZone && (this.hasGun || dist < 5.5),
      windup: S.windup || 2.4,
      speed: S.speed || 1.0,
    });
    if (this.sval.alive && dist < 0.7 && dist > 0.001) {
      // svalovcem se nedá projít
      const dx = this.pos.x - this.sval.root.position.x, dz = this.pos.z - this.sval.root.position.z;
      this.pos.x = this.sval.root.position.x + (dx / dist) * 0.7;
      this.pos.z = this.sval.root.position.z + (dz / dist) * 0.7;
    }
    if (inZone && !this.checkpoint) this.checkpoint = true;
    this.updateBanner();

    // dveře
    if (this.doorOpening && this.doorOpen < 1) {
      this.doorOpen = Math.min(1, this.doorOpen + dt / 1.6);
      this.door.position.x = (this.doorDef.x[0] + this.doorDef.x[1]) / 2 + this.doorOpen * (this.doorDef.w + 0.1);
    }
    if (!this.ended && this.pos.z < this.doorDef.z - 0.8) {
      this.ended = true;
      this.message([this.t('end')]);
      if (this.on.end) this.on.end({ ...this.stats });
    }

    // lampy (jedna bliká), paprsek
    const tNow = performance.now() / 1000;
    for (const l of this.lamps) {
      let f = 1;
      if (l.flicker && !this.reducedMotion) f = Math.sin(tNow * 13) > 0.93 || Math.sin(tNow * 2.3 + 1) > 0.97 ? 0.15 : 1;
      const dim = this.flashlightOn ? 0.3 : 1;
      l.light.intensity = l.base * f * dim;
      l.box.material.emissiveIntensity = 1.6 * f * (this.flashlightOn ? 0.5 : 1);
    }
    if (this.beamT > 0) {
      this.beamT -= dt;
      const a = Math.max(0, this.beamT / 0.18);
      this.beam.material.opacity = 0.9 * a;
      this.spark.material.opacity = a;
      if (this.beamT <= 0) this.beam.visible = this.spark.visible = false;
    }
    this.updatePrompt();
    this.updateCamera(dt);
  }

  updateWalk(dt) {
    const k = this.keys;
    const crouch = Boolean(k.crouch);
    let mx = (k.right ? 1 : 0) - (k.left ? 1 : 0) + this.stick.x;
    let mz = (k.fwd ? 1 : 0) - (k.back ? 1 : 0) - this.stick.y;
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }
    const speed = (crouch ? CROUCH_WALK : WALK) * (this.charge ? 0.4 : 1) * (this.carrying ? 0.85 : 1);
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    // dopředu = (−sin, −cos), doprava = (cos, −sin)
    const tx = (-sin * mz + cos * mx) * speed, tz = (-cos * mz - sin * mx) * speed;
    const accel = this.onGround ? 14 : 2.5;
    const a = 1 - Math.exp(-accel * dt);
    this.vel.x += (tx - this.vel.x) * a;
    this.vel.z += (tz - this.vel.z) * a;

    // po žebřinách: stát před nimi, dívat se k nim a jít dopředu
    const L = this.ladder;
    if (L && this.onGround && mz > 0.3 && this.pos.y < L.top - 0.3 && this.pos.x > L.x[0] - 0.05 && this.pos.x < L.x[1] + 0.05
      && this.pos.z > L.z && this.pos.z < L.z + R + 0.3 && cos > 0.6) {
      this.mode = 'climb';
      this.climb = { y0: this.pos.y, t0: this.time };
      this.vel.set(0, 0, 0);
      this.pos.x = Math.max(L.x[0] + 0.15, Math.min(L.x[1] - 0.15, this.pos.x));
      this.pos.z = L.z + R + 0.08;
      return;
    }

    this.moveAxis(0, this.vel.x * dt);
    this.moveAxis(2, this.vel.z * dt);

    // svislý pohyb: gravitace, dopad
    const ground = this.groundAt(this.pos.x, this.pos.z, this.pos.y);
    if (this.onGround && ground < this.pos.y - 0.04) {
      this.onGround = false;   // sešel z okraje
      this.apex = this.pos.y;
      this.jump = null;
    }
    if (!this.onGround) {
      this.vel.y -= G * dt;
      const ny = this.pos.y + this.vel.y * dt;
      this.apex = Math.max(this.apex, ny);
      if (ny <= ground) {
        this.pos.y = ground;
        this.land(ground);
      } else this.pos.y = ny;
    } else {
      this.pos.y = ground;
      this.vel.y = 0;
      // kroky
      const moving = Math.hypot(this.vel.x, this.vel.z) > 0.8;
      if (moving) {
        this.stepTimer -= dt;
        if (this.stepTimer <= 0) {
          this.stepTimer = crouch ? 0.7 : 0.48;
          this.sfx('step');
        }
      }
    }
  }

  /* Dopad: výška pádu → dopadová rychlost → průměrná síla podle doby brzdění (podřep / propnutá kolena). */
  land(ground) {
    const fall = this.apex - ground;
    this.onGround = true;
    this.vel.y = 0;
    const jump = this.jump;
    this.jump = null;
    const m = this.mass;
    const lines = [];
    if (jump) {
      const vars = { t: num(jump.t), F: num(jump.F, 0), J: num(jump.J, 0), m: num(m, 0), v: num(jump.v), h: num(jump.h) };
      lines.push(this.tm('jump', vars));
      if (jump.limited) lines.push(this.t('pushLimit', { tmax: num(this.def.player.pushMax || 0.6, 1) }));
      this.stats.skok_max = Math.max(this.stats.skok_max, jump.h);
      const tg = jump.target;
      if (tg) {
        const need = Math.sqrt(2 * G * tg.rise);
        const Jneed = m * need;
        const box = { box: num(tg.rise, 1), label: tg.block.label || `${num(tg.rise, 1)} m`, vneed: num(need), Jneed: num(Jneed, 0), m: num(m, 0) };
        const P = this.def.player;
        const Jmax = (P.force || 400) * (P.pushMax || 0.6);
        if (Math.abs(ground - tg.block.top) < 0.02) lines.push(this.tm('jumpOnto', box));
        else if (Jmax < Jneed) {
          const hmax = (Jmax / m) ** 2 / (2 * G);
          lines.push(this.tm('jumpImpossible', { ...box, Jmax: num(Jmax, 0), hmax: num(hmax), extra: this.carrying ? this.t('tryNoPack') : this.t('climbInstead') }));
        } else lines.push(this.tm('jumpShort', box));
      }
    }
    if (fall >= 0.9) {
      const crouch = Boolean(this.keys.crouch);
      const brake = crouch ? SOFT_BRAKE : HARD_BRAKE;
      const v = Math.sqrt(2 * G * fall);
      const F = m * v / brake + m * G;
      const ratio = F / (m * G);
      const vars = { H: num(fall, 1), v: num(v, 1), dt: num(brake), F: num(F / 1000, 1), ratio: num(ratio, 0), m: num(m, 0) };
      lines.push(this.tm(crouch ? 'landSoft' : 'landHard', vars));
      this.stats.doskoky_mekke = (this.stats.doskoky_mekke || 0) + (crouch ? 1 : 0);   // odznak „Měkký doskok“
      this.stats.doskoky_tvrde = (this.stats.doskoky_tvrde || 0) + (crouch ? 0 : 1);
      this.pushStats();
      if (crouch) this.dip = this.reducedMotion ? 0.1 : 0.4;
      else this.shake = this.reducedMotion ? 0 : 0.3;
      this.sfx('step');
      if (!crouch && ratio > HURT_RATIO && this.attacksOn) {
        this.hurt([...lines, this.t('landHurt', { lives: this.lives - 1 })], 'deathFall');
        return;
      }
    }
    if (lines.length) this.message(lines);
  }

  updateClimb(dt) {
    const k = this.keys;
    const L = this.ladder;
    const dir = (k.fwd ? 1 : 0) - (k.back ? 1 : 0) - this.stick.y;
    this.pos.y = Math.max(0, this.pos.y + dir * CLIMB * dt);
    if (this.letGo || (dir < 0 && this.pos.y <= 0)) {
      // pustit se / sestoupit dolů
      this.letGo = false;
      this.mode = 'walk';
      this.onGround = this.pos.y <= 0.001;
      this.apex = this.pos.y;
      this.pos.z += 0.05;
      return;
    }
    if (this.pos.y >= L.top - 0.02) {
      // nahoře: přelézt na plošinu
      const h = L.top - this.climb.y0;
      const t = Math.max(0.5, this.time - this.climb.t0);
      const m = this.mass;
      const W = m * G * h;
      this.pos.y = L.top;
      this.pos.z = L.z - R - 0.1;
      this.mode = 'walk';
      this.onGround = true;
      this.message([this.tm('climb', { h: num(h, 1), t: num(t, 1), m: num(m, 0), W: num(W, 0), P: num(W / t, 0) })]);
      this.sfx('step');
    }
  }

  updateMantle(dt) {
    const M = this.mantle;
    M.t += dt / 0.9;
    const t = Math.min(1, M.t);
    // nejdřív nahoru, pak dopředu
    const up = Math.min(1, t / 0.6), fwd = Math.max(0, (t - 0.45) / 0.55);
    const ease = (x) => x * x * (3 - 2 * x);
    this.pos.y = M.from.y + (M.to.y - M.from.y) * ease(up);
    this.pos.x = M.from.x + (M.to.x - M.from.x) * ease(Math.min(1, fwd));
    this.pos.z = M.from.z + (M.to.z - M.from.z) * ease(Math.min(1, fwd));
    if (t >= 1) {
      this.mode = 'walk';
      this.onGround = true;
      const m = this.mass;
      this.message([this.tm('mantle', { h: num(M.rise, 1), m: num(m, 0), W: num(m * G * M.rise, 0) })]);
      this.sfx('step');
    }
  }

  /* Posun po ose (0 = x, 2 = z) s nárazem do kvádrů (hráč = čtverec 2R × 2R). */
  moveAxis(axis, d) {
    if (!d) return;
    this.pos.setComponent(axis, this.pos.getComponent(axis) + d);
    const px = this.pos.x, pz = this.pos.z, y = this.pos.y;
    for (const s of this.solids) {
      if (s.max[1] <= y + 0.05 || s.min[1] >= y + HEIGHT) continue;
      if (px + R > s.min[0] && px - R < s.max[0] && pz + R > s.min[2] && pz - R < s.max[2]) {
        const v = d > 0 ? s.min[axis] - R - 1e-4 : s.max[axis] + R + 1e-4;
        this.pos.setComponent(axis, v);
        this.vel.setComponent(axis, 0);
        return;
      }
    }
  }

  /* Na čem hráč stojí (nejvyšší horní plocha pod chodidly). */
  groundAt(x, z, y) {
    let g = 0;
    for (const s of this.solids) {
      if (s.max[1] > y + 0.06 || s.max[1] <= g) continue;
      if (x + R > s.min[0] && x - R < s.max[0] && z + R > s.min[2] && z - R < s.max[2]) g = s.max[1];
    }
    return g;
  }

  /* Pruh nahoře v obraze: jaký útok svalovec chystá, co zasáhnout, kolik zbývá času. */
  updateBanner() {
    const sv = this.sval;
    const ui = this.ui;
    const id = sv.alive ? sv.attacking : null;
    if (!id) {
      if (!ui.banner.hidden) {
        ui.banner.hidden = true;
        this.container.classList.remove('w3d-banner-on');
      }
      if (sv.hintMuscle) sv.setHint(null);
      this.bannerFor = null;
      return;
    }
    const a = (this.def.attacks || {})[id] || {};
    if (this.bannerFor !== id) {
      this.bannerFor = id;
      ui.bannerTitle.textContent = a.name || id;
      ui.bannerText.textContent = a.short || a.prompt || '';
      ui.banner.hidden = false;
      this.container.classList.add('w3d-banner-on');   // hláška o zásahu pod pruh, ne přes svalovce
    }
    const W = (this.def.svalovec || {}).windup || 2.4;
    const left = sv.state === 'windup' ? Math.max(0, 1 - sv.t / W) : 0;
    ui.bannerFill.style.width = `${left * 100}%`;
    ui.bannerHint.hidden = !sv.hintMuscle;
  }

  updatePrompt() {
    let text = '';
    const L = this.ladder;
    if (this.charge) {
      const P = this.def.player;
      const held = Math.min(P.pushMax || 0.6, this.time - this.charge.t0);
      const J = (P.force || 400) * held;
      const v = J / this.mass;
      this.ui.chargeBar.style.width = `${(held / (P.pushMax || 0.6)) * 100}%`;
      this.ui.chargeText.textContent = this.t('charge', { t: num(held), J: num(J, 0), h: num(v * v / (2 * G)) });
    } else if (this.mode === 'climb') {
      text = this.texts.promptClimbing || '';
    } else {
      const a = this.availableAction();
      if (a && a.label) text = a.label;
      else if (L && this.onGround && this.pos.y < 0.3 && this.pos.x > L.x[0] - 0.3 && this.pos.x < L.x[1] + 0.3 && this.pos.z > L.z && this.pos.z < L.z + 1.2) {
        text = this.texts.promptLadder || '';
      } else if (this.pos.y > 1.5 && this.pos.z < (this.def.edgeSign ? this.def.edgeSign.at[1] + 0.6 : -99)) {
        text = this.texts.promptEdge || '';
      } else if (a && a.kind === 'info') {
        text = a.ahead.rise > MANTLE_MAX ? this.t('tooHigh', { h: num(a.ahead.rise, 1) }) : this.t('promptJump', { h: num(a.ahead.rise, 1) });
      }
    }
    if (this.ui.prompt.textContent !== text) this.ui.prompt.textContent = text;
    this.ui.prompt.hidden = !text;
  }

  updateCamera(dt) {
    const crouch = this.keys.crouch || this.charge;
    const want = crouch && this.mode === 'walk' ? (this.charge && !this.keys.crouch ? EYE - (this.reducedMotion ? 0.05 : 0.22) : EYE_CROUCH) : EYE;
    this.eye += (want - this.eye) * (1 - Math.exp(-12 * dt));
    this.dip = Math.max(0, this.dip - dt * 0.9);
    let bob = 0;
    if (!this.reducedMotion && this.onGround && this.mode === 'walk') {
      const sp = Math.hypot(this.vel.x, this.vel.z);
      this.bobPhase = (this.bobPhase || 0) + sp * dt * 2.2;
      bob = Math.sin(this.bobPhase * 2) * 0.025 * Math.min(1, sp / WALK);
    }
    let sx = 0, sy = 0;
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      sx = (Math.random() - 0.5) * this.shake * 0.12;
      sy = (Math.random() - 0.5) * this.shake * 0.12;
    }
    this.camera.position.set(this.pos.x, this.pos.y + this.eye - this.dip + bob + sy, this.pos.z);
    this.camera.rotation.set(this.pitch + sx, this.yaw, 0);
  }

  updateHud() {
    const ui = this.ui;
    ui.lives.hidden = !this.attacksOn;
    ui.lives.textContent = '♥'.repeat(Math.max(0, this.lives)) + '♡'.repeat(Math.max(0, 3 - this.lives));
    ui.lives.setAttribute('aria-label', `Životy: ${this.lives}`);
    ui.pack.hidden = !this.carrying;
    ui.pack.textContent = this.t('packHud', { kg: this.packKg, m: num(this.mass, 0) });
    ui.gun.hidden = !this.hasGun;
    ui.cross.hidden = !this.hasGun && !this.locked;
    ui.bFire.hidden = !this.hasGun;
  }

  /* ---------- Smyčka, velikost, pauza ---------- */

  frame(now) {
    this.raf = 0;
    if (!this.running || this.paused) return;
    const dt = Math.min(0.05, Math.max(0, (now - (this.last || now)) / 1000));
    this.last = now;
    if (!this.dead && !this.testMode) this.update(dt);
    this.renderer.render(this.scene, this.camera);
    this.adaptQuality(dt);
    this.raf = requestAnimationFrame(this.frameBound);
  }

  /* Pomalý počítač: snížit rozlišení (a zase zvýšit, když to stačí). */
  adaptQuality(dt) {
    if (this.fixedQuality) return;
    this.qTime = (this.qTime || 0) + dt;
    this.qFrames = (this.qFrames || 0) + 1;
    if (this.qTime < 2) return;
    const avg = this.qTime / this.qFrames;
    this.qTime = this.qFrames = 0;
    let r = this.ratio;
    if (avg > 0.034 && r > 0.6) r = Math.max(0.6, r - 0.25);
    else if (avg < 0.018 && r < this.maxRatio) r = Math.min(this.maxRatio, r + 0.25);
    if (r !== this.ratio) {
      this.ratio = r;
      this.renderer.setPixelRatio(r);
      this.resize();
    }
  }

  /* Pro automatické testy (testMode = true): posunout simulaci o sec sekund po 1/60 s. */
  advance(sec) {
    for (let t = 0; t < sec - 1e-9; t += 1 / 60) if (!this.dead) this.update(1 / 60);
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.paused && this.scene) this.renderer.render(this.scene, this.camera);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = 0;
    if (!this.paused && !this.raf) this.raf = requestAnimationFrame(this.frameBound);
  }

  stop() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.keys = {};
    this.charge = null;
    if (this.locked && document.exitPointerLock) document.exitPointerLock();
  }

  setPaused(p) {
    this.paused = p;
    this.keys = {};
    this.charge = null;
    if (this.ui) this.ui.charge.hidden = true;
    if (p) {
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = 0;
      if (this.locked && document.exitPointerLock) document.exitPointerLock();
    } else {
      if (document.activeElement && document.activeElement !== document.body && this.container.contains(document.activeElement) === false) document.activeElement.blur();
      this.container.focus({ preventScroll: true });
      this.last = 0;
      if (this.running && !this.raf) this.raf = requestAnimationFrame(this.frameBound);
    }
  }

  setFlashlight(on) {
    this.flashlightOn = on;
    if (!this.flashlight) return;
    this.flashlight.intensity = on ? 22 : 0;
    this.ambient.intensity = on ? 0.06 : 0.3;
    this.hemi.intensity = on ? 0.12 : 0.45;
  }

  setAttacks(on) {
    this.attacksOn = on;
    this.updateHud();
  }

  destroy() {
    this.stop();
    for (const [target, type, fn, opts] of this.listeners || []) target.removeEventListener(type, fn, opts);
    if (this.resizeObserver) this.resizeObserver.disconnect();
    if (this.sval) this.sval.dispose();
    if (this.scene) {
      this.scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of ms) {
          if (m.map) m.map.dispose();
          m.dispose();
        }
      });
    }
    if (this.renderer) {
      this.renderer.dispose();
      if (this.renderer.forceContextLoss) this.renderer.forceContextLoss();
    }
    this.container.innerHTML = '';
    this.container.classList.remove('w3d');
  }
}
