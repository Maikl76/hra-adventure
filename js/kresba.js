/*
 * Společné kreslení pro aktivity s postavou (canvas): plátno ostré i na jemných displejích,
 * pozadí místností (sklad, tělocvična, noční cvičiště, venkovní hřiště), popisky s podkladem, šipky sil, kóty,
 * značka těžiště a zaoblené obdélníky. Každá aktivita má vlastní modul se scénou (zvedani.js,
 * batoh.js…), tady je jen to, co mají společné – ať vypadají všude stejně.
 */

/* Zaoblený obdélník (roundRect neumí starší prohlížeče). */
export function rrect(ctx, x, y, w, h, r) {
  const q = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + q, y);
  ctx.arcTo(x + w, y, x + w, y + h, q);
  ctx.arcTo(x + w, y + h, x, y + h, q);
  ctx.arcTo(x, y + h, x, y, q);
  ctx.arcTo(x, y, x + w, y, q);
  ctx.closePath();
}

export const fmt = (v, d = 0) => v.toFixed(d).replace('.', ',');

/* Plátno W × H (logicky): ostré podle devicePixelRatio, „ts“ = zvětšení písma na malém displeji
   (aby popisky byly čitelné i na telefonu). onResize se zavolá po každé změně velikosti. */
export function setupCanvas(canvas, W, H, onResize) {
  const st = { dpr: 1, ts: 1 };
  const apply = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = canvas.clientWidth || W;
    st.ts = Math.max(1, Math.min(1.7, W / cw));
    const changed = canvas.width !== Math.round(W * dpr);
    if (changed) {
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
    }
    st.dpr = dpr;
    if (onResize) onResize(changed);
  };
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(apply) : null;
  if (ro) ro.observe(canvas);
  st.destroy = () => { if (ro) ro.disconnect(); };
  st.apply = apply;
  apply();
  return st;
}

/* Popisek s tmavým podkladem; align = 'left' | 'center' | 'right' vůči x, nevyjede z plátna (W). */
export function label(ctx, text, x, y, col, opts = {}) {
  const ts = opts.ts || 1;
  const size = (opts.size || 12) * ts;
  ctx.font = `${opts.weight || 600} ${Math.round(size)}px system-ui, sans-serif`;
  const pw = ctx.measureText(text).width + 8;
  const ph = size + 4;
  const align = opts.align || 'center';
  let lx = align === 'center' ? x - pw / 2 : align === 'right' ? x - pw : x;
  if (opts.W) lx = Math.max(2, Math.min(opts.W - pw - 2, lx));
  ctx.fillStyle = opts.bg || 'rgba(10,9,6,0.74)';
  rrect(ctx, lx, y - ph / 2, pw, ph, 4);
  ctx.fill();
  ctx.fillStyle = col;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, lx + 4, y + 0.5);
  return { x: lx, y: y - ph / 2, w: pw, h: ph };
}

/* Šipka síly s tmavým lemem (vidět je i na oblečení a dřevě). */
export function arrow(ctx, x0, y0, x1, y1, col, w = 3) {
  const a = Math.atan2(y1 - y0, x1 - x0);
  const len = Math.hypot(x1 - x0, y1 - y0);
  if (len < 2) return;
  const hl = Math.min(12, Math.max(6, len * 0.5));
  const shaft = () => {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1 - Math.cos(a) * hl * 0.6, y1 - Math.sin(a) * hl * 0.6);
  };
  const head = () => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - Math.cos(a - 0.45) * hl, y1 - Math.sin(a - 0.45) * hl);
    ctx.lineTo(x1 - Math.cos(a + 0.45) * hl, y1 - Math.sin(a + 0.45) * hl);
    ctx.closePath();
  };
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(12,10,6,0.82)';
  ctx.lineWidth = w + 3;
  shaft();
  ctx.stroke();
  head();
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.strokeStyle = col;
  ctx.fillStyle = col;
  ctx.lineWidth = w;
  shaft();
  ctx.stroke();
  head();
  ctx.fill();
  ctx.restore();
}

/* Čárkovaná čára (svislice, pomocné čáry). */
export function dash(ctx, x0, y0, x1, y1, col, w = 1) {
  ctx.save();
  ctx.strokeStyle = col;
  ctx.lineWidth = w;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.restore();
}

/* Vodorovná kóta od x0 do x1 ve výšce y s popiskem (vpravo za koncem, nebo uprostřed). */
export function dim(ctx, x0, x1, y, col, text, opts = {}) {
  ctx.save();
  ctx.strokeStyle = col;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(x1, y);
  ctx.moveTo(x0, y - 5);
  ctx.lineTo(x0, y + 5);
  ctx.moveTo(x1, y - 5);
  ctx.lineTo(x1, y + 5);
  ctx.stroke();
  ctx.restore();
  if (!text) return null;
  if (opts.at === 'center') return label(ctx, text, (x0 + x1) / 2, y - 11 * (opts.ts || 1), col, opts);
  const right = x1 >= x0;
  return label(ctx, text, x1 + (right ? 6 : -6), y, col, { ...opts, align: right ? 'left' : 'right' });
}

/* Značka těžiště: kruh se čtvrtinami (černá a bílá) – jako v biomechanických nákresech. */
export function comMark(ctx, x, y, r = 6.5, light = '#f4efe4', dark = '#1a1712') {
  ctx.save();
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = dark;
  for (const a of [0, Math.PI]) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, r, a, a + Math.PI / 2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = dark;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/* ---------- Pozadí místností (kreslí se jednou do pomocného plátna) ---------- */

function offscreen(W, H, dpr) {
  const c = document.createElement('canvas');
  c.width = Math.round(W * dpr);
  c.height = Math.round(H * dpr);
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { c, g };
}

/* Podlaha s perspektivními spárami od „horizon“ dolů. */
function floor(g, W, H, horizon, top, bottom, seam = 'rgba(255,255,255,0.04)', step = 70) {
  const fl = g.createLinearGradient(0, horizon, 0, H);
  fl.addColorStop(0, top);
  fl.addColorStop(1, bottom);
  g.fillStyle = fl;
  g.fillRect(0, horizon, W, H - horizon);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(0, horizon, W, 3);
  g.strokeStyle = seam;
  g.lineWidth = 1;
  for (let x = -W; x < W * 2; x += step) {
    g.beginPath();
    g.moveTo(x, horizon + 3);
    g.lineTo(x + (x - W / 2) * 0.35, H);
    g.stroke();
  }
}

/* Výstrojní sklad: kovové regály se siluetami beden a helem, šero od lampy shora. */
function sklad(g, W, H, horizon) {
  const wall = g.createLinearGradient(0, 0, 0, horizon);
  wall.addColorStop(0, '#202219');
  wall.addColorStop(1, '#30332a');
  g.fillStyle = wall;
  g.fillRect(0, 0, W, horizon);
  const shelves = [0.29, 0.57, 0.83].map((f) => Math.round(horizon * f));
  const rack = (x0, x1) => {
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (const y of shelves) g.fillRect(x0 + 4, y + 6, x1 - x0, 6);
    g.fillStyle = '#4a4c42';
    for (const x of [x0, x1]) g.fillRect(x - 4, 24, 8, horizon - 24);
    g.fillStyle = '#56584c';
    for (const y of shelves) g.fillRect(x0 - 4, y, x1 - x0 + 8, 6);
  };
  const rw = Math.min(170, W * 0.28);
  rack(18, 18 + rw);
  rack(W - 12 - rw, W - 12);
  const cols = ['#3f3a2a', '#3a3d2c', '#45402d', '#3c3f2d', '#4a3f2c', '#46402e', '#3b3e2c', '#423c2b'];
  let k = 0;
  const fillRack = (x0) => {
    for (const y of shelves) {
      let x = x0 + 8;
      while (x < x0 + rw - 30) {
        const w = 30 + ((k * 37) % 30);
        const h = 20 + ((k * 23) % 20);
        g.fillStyle = cols[k % cols.length];
        g.fillRect(x, y - h, Math.min(w, x0 + rw - 6 - x), h);
        g.fillStyle = 'rgba(255,255,255,0.05)';
        g.fillRect(x, y - h, Math.min(w, x0 + rw - 6 - x), 3);
        x += w + 6;
        k++;
      }
    }
  };
  fillRack(18);
  fillRack(W - 12 - rw);
  g.fillStyle = '#3d4430';
  for (const x of [W * 0.36, W * 0.42]) {
    g.beginPath();
    g.ellipse(x, shelves[0] - 30, 17, 13, 0, Math.PI, 0);
    g.fill();
  }
  const lamp = g.createRadialGradient(W * 0.45, -40, 30, W * 0.45, 40, W * 0.75);
  lamp.addColorStop(0, 'rgba(255,230,170,0.16)');
  lamp.addColorStop(1, 'rgba(0,0,0,0.35)');
  g.fillStyle = lamp;
  g.fillRect(0, 0, W, horizon);
  floor(g, W, H, horizon, '#3a382f', '#25241e');
}

/* Tělocvična: stěna se žebřinami, parkety s čárou hřiště. */
function telocvicna(g, W, H, horizon) {
  const wall = g.createLinearGradient(0, 0, 0, horizon);
  wall.addColorStop(0, '#2b2e2a');
  wall.addColorStop(1, '#3a3d34');
  g.fillStyle = wall;
  g.fillRect(0, 0, W, horizon);
  // obklad dole
  g.fillStyle = '#2f3a33';
  g.fillRect(0, horizon - 70, W, 70);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(0, horizon - 70, W, 3);
  // žebřiny
  const bars = (x0, n) => {
    for (let i = 0; i < n; i++) {
      const x = x0 + i * 64;
      g.fillStyle = '#6b5236';
      g.fillRect(x, 30, 7, horizon - 30);
      g.fillRect(x + 48, 30, 7, horizon - 30);
      g.fillStyle = '#8a6a44';
      for (let y = 46; y < horizon - 4; y += 22) g.fillRect(x + 5, y, 45, 4);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      for (let y = 50; y < horizon - 4; y += 22) g.fillRect(x + 5, y, 45, 2);
    }
  };
  bars(14, 2);
  bars(W - 14 - 2 * 64 + 9, 2);
  // světlo zářivek shora
  const lamp = g.createLinearGradient(0, 0, 0, horizon);
  lamp.addColorStop(0, 'rgba(255,250,230,0.10)');
  lamp.addColorStop(1, 'rgba(0,0,0,0.18)');
  g.fillStyle = lamp;
  g.fillRect(0, 0, W, horizon);
  // parkety
  floor(g, W, H, horizon, '#6e5434', '#4a3722', 'rgba(30,18,8,0.28)', 34);
  g.strokeStyle = 'rgba(240,235,220,0.55)';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(0, horizon + (H - horizon) * 0.62);
  g.lineTo(W, horizon + (H - horizon) * 0.62);
  g.stroke();
  const sheen = g.createLinearGradient(0, horizon, 0, H);
  sheen.addColorStop(0, 'rgba(255,240,200,0.10)');
  sheen.addColorStop(1, 'rgba(0,0,0,0.25)');
  g.fillStyle = sheen;
  g.fillRect(0, horizon, W, H - horizon);
}

/* Noční cvičiště: tmavé nebe s hvězdami, les na obzoru, stan a lampa (lamp: false = bez ní), tráva. */
function cviciste(g, W, H, horizon, opts = {}) {
  const sky = g.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, '#05080f');
  sky.addColorStop(1, '#162133');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, horizon);
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  g.fillStyle = 'rgba(230,236,255,0.8)';
  for (let i = 0; i < 70; i++) {
    const r = rnd() < 0.15 ? 1.4 : 0.8;
    g.globalAlpha = 0.3 + rnd() * 0.7;
    g.beginPath();
    g.arc(rnd() * W, rnd() * horizon * 0.8, r, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  // les na obzoru
  g.fillStyle = '#0a0f0c';
  g.beginPath();
  g.moveTo(0, horizon);
  for (let x = 0; x <= W; x += 14) g.lineTo(x, horizon - 18 - 22 * Math.abs(Math.sin(x * 0.07)) - 10 * rnd());
  g.lineTo(W, horizon);
  g.closePath();
  g.fill();
  // stan s rozsvíceným vchodem
  const tx = W * 0.8;
  g.fillStyle = '#1d2418';
  g.beginPath();
  g.moveTo(tx - 70, horizon + 4);
  g.lineTo(tx, horizon - 64);
  g.lineTo(tx + 70, horizon + 4);
  g.closePath();
  g.fill();
  g.fillStyle = 'rgba(255,190,110,0.5)';
  g.beginPath();
  g.moveTo(tx - 14, horizon + 4);
  g.lineTo(tx, horizon - 34);
  g.lineTo(tx + 14, horizon + 4);
  g.closePath();
  g.fill();
  // lampa
  if (opts.lamp !== false) {
    const glow = g.createRadialGradient(W * 0.2, horizon - 90, 4, W * 0.2, horizon - 90, 160);
    glow.addColorStop(0, 'rgba(255,214,150,0.45)');
    glow.addColorStop(1, 'rgba(255,214,150,0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#2a2a24';
    g.fillRect(W * 0.2 - 2, horizon - 90, 4, 94);
    g.fillStyle = '#ffe2a8';
    g.beginPath();
    g.arc(W * 0.2, horizon - 92, 4, 0, Math.PI * 2);
    g.fill();
  }
  // tráva
  const gr = g.createLinearGradient(0, horizon, 0, H);
  gr.addColorStop(0, '#1d2a1a');
  gr.addColorStop(1, '#0d140c');
  g.fillStyle = gr;
  g.fillRect(0, horizon, W, H - horizon);
  g.strokeStyle = 'rgba(120,150,90,0.12)';
  g.lineWidth = 1;
  for (let i = 0; i < 160; i++) {
    const x = rnd() * W;
    const y = horizon + 6 + rnd() * (H - horizon - 6);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (rnd() - 0.5) * 4, y - 4 - rnd() * 5);
    g.stroke();
  }
}

/* Venkovní hřiště za soumraku: nebe, les a stožár s reflektorem na obzoru, tráva s pruhy po sekačce. */
function hriste(g, W, H, horizon) {
  const sky = g.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, '#151d2a');
  sky.addColorStop(0.6, '#2a3646');
  sky.addColorStop(1, '#5e5446');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, horizon);
  let seed = 11;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  // řídké mraky
  g.fillStyle = 'rgba(200,190,170,0.07)';
  for (let i = 0; i < 5; i++) {
    const x = rnd() * W;
    const y = 20 + rnd() * horizon * 0.45;
    g.beginPath();
    g.ellipse(x, y, 60 + rnd() * 70, 7 + rnd() * 5, 0, 0, Math.PI * 2);
    g.fill();
  }
  // les na obzoru
  g.fillStyle = '#121812';
  g.beginPath();
  g.moveTo(0, horizon);
  for (let x = 0; x <= W; x += 12) g.lineTo(x, horizon - 12 - 16 * Math.abs(Math.sin(x * 0.05 + 1)) - 8 * rnd());
  g.lineTo(W, horizon);
  g.closePath();
  g.fill();
  // stožár s reflektorem
  const mx = W * 0.62;
  g.fillStyle = '#23272a';
  g.fillRect(mx - 1.5, horizon - 96, 3, 96);
  const glow = g.createRadialGradient(mx, horizon - 98, 2, mx, horizon - 98, 120);
  glow.addColorStop(0, 'rgba(255,236,190,0.35)');
  glow.addColorStop(1, 'rgba(255,236,190,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#fff1cc';
  g.fillRect(mx - 7, horizon - 101, 14, 5);
  // tráva s pruhy (k obzoru se zužují)
  const gr = g.createLinearGradient(0, horizon, 0, H);
  gr.addColorStop(0, '#34452b');
  gr.addColorStop(1, '#1b2616');
  g.fillStyle = gr;
  g.fillRect(0, horizon, W, H - horizon);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(0, horizon, W, 2);
  for (let i = 0; i < 7; i += 2) {
    const y0 = horizon + (H - horizon) * (i / 7) ** 1.5;
    const y1 = horizon + (H - horizon) * ((i + 1) / 7) ** 1.5;
    g.fillStyle = 'rgba(255,255,220,0.035)';
    g.fillRect(0, y0, W, y1 - y0);
  }
  g.strokeStyle = 'rgba(140,170,100,0.12)';
  g.lineWidth = 1;
  for (let i = 0; i < 140; i++) {
    const x = rnd() * W;
    const y = horizon + 6 + rnd() * (H - horizon - 6);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (rnd() - 0.5) * 4, y - 3 - rnd() * 4);
    g.stroke();
  }
}

/* Pozadí místnosti jako pomocné plátno; kind = 'sklad' | 'telocvicna' | 'cviciste' | 'hriste',
   opts = podrobnosti pro dané pozadí (cvičiště: { lamp: false }). */
export function background(kind, W, H, dpr, horizon, opts = {}) {
  const { c, g } = offscreen(W, H, dpr);
  const hz = horizon ?? Math.round(H * 0.7);
  if (kind === 'telocvicna') telocvicna(g, W, H, hz);
  else if (kind === 'cviciste') cviciste(g, W, H, hz, opts);
  else if (kind === 'hriste') hriste(g, W, H, hz);
  else sklad(g, W, H, hz);
  return c;
}
