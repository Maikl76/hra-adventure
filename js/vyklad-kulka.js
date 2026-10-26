/*
 * Výklad „Pád kulky“ (Vojenská tělovýchova – střelnice na kótě 680): puška míří přesně vodorovně
 * na střed gongu 200 m daleko a kulka vyletí rychlostí 800 m/s (čísla z Příručky střelce – jiná než
 * na číselníku brány). Kulka padá od chvíle, kdy opustí hlaveň, stejně jako upuštěná: za dobu letu
 * t = d : v klesne o h = ½ · g · t², takže gong mine. Dvakrát dál → dvakrát déle → čtyřikrát větší
 * pokles; proto se míří výš (pokles v milech). Nakonec vzduch: kulku brzdí, letí déle a spadne víc
 * (stejný odpor jako u pušky na střelnici, js/strelnice.js). Pohled z boku je svisle zvětšený 200×,
 * jinak by pokles nebyl vidět. Společný základ v js/vyklad.js, texty kroků v game.json „explainers“
 * (type „bullet“).
 */
import { RIFLE, flightTime } from './strelnice.js?v=0.33';
import { G, Explainer, fmt, smoother, rrect } from './vyklad.js?v=0.33';

const VIEWS = {
  wide: { ox: 160, oy: 250, sx: 1.7, ground: 440, rs: 0.82 },
  tall: { ox: 128, oy: 132, sx: 1.55, ground: 300, rs: 0.66 },
};
const ZOOM = 200;          // svislé zvětšení pohledu z boku
const GONG_R = 0.2;        // gong ⌀ 40 cm jako na střelnici (m)
const BERM = 214;          // val za gongem (m)
const STROBE = 0.025;      // stroboskop po 0,025 s
const PUFF = 0.25;         // obláček hlíny, když kulka zajede do valu (s)
const SHOT = '#ffd28a';
const DROP = '#6fd6ff';
const AIR = '#ff9a5c';

/* Scény: co se při kroku přehraje a co je v obraze. */
export const SCENES = {
  intro: { at: 'start', show: ['aim'] },
  shot: { play: [['start', 'fireA', 1], ['fireA', 'endA', 0.1], ['endA', 'puffA', 0.5]], show: ['shotA', 'miss', 'live'], sounds: [['fireA', 'shot']] },
  drop: { play: [['start', 'fireA', 1], ['fireA', 't200A', 0.1]], show: ['shotA', 'dropped', 'strobe', 'live'], sounds: [['fireA', 'shot']] },
  same: { at: 't200A', show: ['shotA', 'dropped', 'strobe', 'levels', 'live'] },
  time: { at: 't200A', show: ['shotA', 'distDim', 'formula', 'g200'], formula: 'time' },
  fall: { at: 't200A', show: ['shotA', 'dropDim', 'formula', 'g200'], formula: 'fall' },
  double: { at: 't200A', show: ['shotA', 'dropDim', 'dim100', 'formula', 'g100', 'g200'], formula: 'double' },
  mil: { play: [['tiltS', 'tiltE', 0.5], ['tiltE', 'fireB', 1], ['fireB', 't200B', 0.1], ['t200B', 'endB', 1]], show: ['ghostA', 'shotB', 'aimB', 'hit', 'formula'], formula: 'mil', sounds: [['fireB', 'shot'], ['t200B', 'gong']] },
  air: { play: [['start', 'fireA', 1], ['fireA', 'airPuff', 0.1]], show: ['shotA', 'air', 'airDim', 'formula', 'g200', 'gAir'], formula: 'air', sounds: [['fireA', 'shot']] },
  outro: { at: 'endB', show: ['ghostA', 'shotB', 'aimB', 'formula', 'g100', 'g200'], formula: 'all' },
};

export default class BulletExplainer extends Explainer {
  constructor(canvas, def) {
    super(canvas, def);
    this.v = def.speed || 800;
    this.d = def.distance || 200;
    this.air = { ...RIFLE, v0: this.v };     // stejný odpor vzduchu jako puška na střelnici
    this.tD = this.d / this.v;
    this.hD = this.fall(this.tD);
    this.theta = this.hD / this.d;           // o kolik zvednout hlaveň (rad), aby kulka trefila střed
    this.tAir = flightTime(this.d, this.air);
    const T = { start: 0, fireA: 0.4 };
    T.t200A = T.fireA + this.tD;
    T.endA = T.fireA + BERM / this.v;
    T.puffA = T.endA + PUFF;
    T.airEnd = T.fireA + flightTime(BERM, this.air);
    T.airPuff = T.airEnd + PUFF;
    T.tiltS = Math.max(T.puffA, T.airPuff) + 0.05;
    T.tiltE = T.tiltS + 0.6;
    T.fireB = T.tiltE + 0.3;
    T.t200B = T.fireB + this.tD;
    T.endB = T.t200B + 0.9;
    T.end = T.endB;
    this.T = T;
    this.scenes = SCENES;
    this.graphTitle = 'POKLES KULKY (cm)';
    const t100 = 100 / this.v;
    this.vals = {
      v: fmt(this.v, 0), d: fmt(this.d, 0), r: fmt(GONG_R * 100, 0),
      t: fmt(this.tD, 2), hm: fmt(this.hD, 2), hm3: fmt(this.hD, 3), h: fmt(this.hD * 100, 0),
      t100: fmt(t100, 3), h100: fmt(this.fall(t100) * 100, 1),
      mil: fmt(this.theta * 1000, 1), deg: fmt((this.theta * 180) / Math.PI, 2),
      tAir: fmt(this.tAir, 2), hAir: fmt(this.fall(this.tAir) * 100, 0),
      h500: fmt(this.fall(500 / this.v), 1), h500Air: fmt(this.fall(flightTime(500, this.air)), 1),
    };
  }

  /* Pád za čas tt (m). */
  fall(tt) {
    return (G * tt * tt) / 2;
  }

  layout(L) {
    const v = VIEWS[L.name];
    this.view = { ...v, sy: v.sx * ZOOM };
  }

  /* Metry (x dopředu, y nahoru od osy hlavně) → body plátna. */
  X(x, y) {
    const v = this.view;
    return [v.ox + x * v.sx, v.oy - y * v.sy];
  }

  get gx() {
    return this.view.ox + this.d * this.view.sx;
  }

  /* Kulka tt s po výstřelu: A = hlaveň vodorovně, B = zvednutá o theta, air = vodorovně se vzduchem. */
  bullet(kind, tt) {
    if (kind === 'air') {
      const k = this.air.k;
      return [Math.log(1 + k * this.v * tt) / k, -this.fall(tt)];
    }
    const x = this.v * tt;
    return [x, (kind === 'B' ? x * this.theta : 0) - this.fall(tt)];
  }

  /* Výstřel v čase t: doba od výstřelu (nejvýš do konce letu), konec letu – do valu, B do gongu. */
  shotState(kind, t) {
    const fire = kind === 'B' ? this.T.fireB : this.T.fireA;
    const stop = kind === 'B' ? this.d : BERM;
    const tEnd = kind === 'air' ? flightTime(stop, this.air) : stop / this.v;
    const tt = t - fire;
    if (tt < 0) return null;
    return { kind, tt: Math.min(tt, tEnd), since: tt, after: Math.max(0, tt - tEnd), done: tt >= tEnd };
  }

  /* Zvednutí hlavně na obrázku (zvětšené stejně jako svislý směr). */
  tilt(t) {
    const T = this.T;
    const full = Math.atan(this.theta * ZOOM);
    if (t <= T.tiltS) return 0;
    return full * smoother(Math.min(1, (t - T.tiltS) / (T.tiltE - T.tiltS)));
  }

  paintStageBackground(g, L) {
    const S = L.stage;
    const v = this.view;
    const sf = L.sf;
    // svítání nad údolím
    const sky = g.createLinearGradient(0, S.y, 0, v.ground);
    sky.addColorStop(0, '#0d1830');
    sky.addColorStop(0.55, '#2c3f63');
    sky.addColorStop(0.86, '#7d7488');
    sky.addColorStop(1, '#c99468');
    g.fillStyle = sky;
    g.fillRect(S.x, S.y, S.w, v.ground - S.y);
    this.ridge(g, S, v.ground, 74 * sf, '#3a4766', 1.3);
    this.ridge(g, S, v.ground, 40 * sf, '#29334b', 4.1);
    const mist = g.createLinearGradient(0, v.ground - 44 * sf, 0, v.ground);
    mist.addColorStop(0, 'rgba(220,226,236,0)');
    mist.addColorStop(1, 'rgba(220,226,236,0.26)');
    g.fillStyle = mist;
    g.fillRect(S.x, v.ground - 44 * sf, S.w, 44 * sf);
    const grass = g.createLinearGradient(0, v.ground, 0, S.y + S.h);
    grass.addColorStop(0, '#34402c');
    grass.addColorStop(1, '#1a2017');
    g.fillStyle = grass;
    g.fillRect(S.x, v.ground, S.w, S.y + S.h - v.ground);

    // rám gongu z boku: trám nad gongem a sloupek za ním (dole ho zakryje val)
    const gx = this.gx;
    const beamY = v.oy - GONG_R * v.sy - 30 * sf;
    const post = gx + 26 * sf;
    g.fillStyle = '#4b3b2a';
    g.fillRect(post - 3 * sf, beamY - 4 * sf, 6 * sf, v.ground - beamY);
    g.fillRect(gx - 8 * sf, beamY - 4 * sf, post - gx + 11 * sf, 6 * sf);
    // val z hlíny – zachytí kulky, které gong minou
    const xf = v.ox + BERM * v.sx;
    const yMid = v.oy + 0.38 * v.sy;
    const face = (y) => xf + (yMid - y) * 0.12;
    const top = v.oy + 0.06 * v.sy;
    const berm = g.createLinearGradient(0, top, 0, v.ground);
    berm.addColorStop(0, '#6b5a3e');
    berm.addColorStop(1, '#3b3122');
    g.fillStyle = berm;
    g.beginPath();
    g.moveTo(face(v.ground + 4), v.ground + 4);
    g.lineTo(face(top + 14 * sf), top + 14 * sf);
    g.quadraticCurveTo(face(top), top - 4 * sf, face(top) + 26 * sf, top - 6 * sf);
    g.lineTo(S.x + S.w, top - 10 * sf);
    g.lineTo(S.x + S.w, v.ground + 4);
    g.closePath();
    g.fill();

    // osa hlavně (vodorovně) s metry
    g.save();
    g.strokeStyle = 'rgba(236,240,248,0.55)';
    g.lineWidth = 1.4;
    g.setLineDash([7, 6]);
    g.beginPath();
    g.moveTo(v.ox + 4, v.oy);
    g.lineTo(gx - 4 * sf, v.oy);
    g.stroke();
    g.setLineDash([]);
    g.font = this.font(600, 11, true);
    g.textAlign = 'center';
    g.textBaseline = 'bottom';
    for (let m = 50; m < this.d; m += 50) {
      const [x] = this.X(m, 0);
      g.fillStyle = 'rgba(236,240,248,0.7)';
      g.fillRect(x - 0.7, v.oy - 4, 1.4, 8);
      g.fillStyle = 'rgba(236,240,248,0.8)';
      g.fillText(`${m}`, x, v.oy - 7);
    }
    g.fillText(`${this.d} m`, gx + 9 * sf, beamY - 7 * sf);
    g.restore();
    g.fillStyle = 'rgba(225,232,245,0.78)';
    g.font = this.font(600, 12, true);
    g.textAlign = 'left';
    g.textBaseline = 'top';
    g.fillText(`pohled z boku · svisle zvětšeno ${ZOOM}×`, S.x + 10, S.y + 10);
  }

  /* Vzdálený hřeben (obrys z několika sinusovek). */
  ridge(g, S, base, amp, col, seed) {
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(S.x, base);
    for (let x = 0; x <= S.w; x += 6) {
      const f = 0.62 + 0.22 * Math.sin(x * 0.011 + seed) + 0.12 * Math.sin(x * 0.029 + seed * 2.3) + 0.04 * Math.sin(x * 0.09 + seed);
      g.lineTo(S.x + x, base - amp * f);
    }
    g.lineTo(S.x + S.w, base);
    g.closePath();
    g.fill();
  }

  paintStage(ctx, t, show) {
    const v = this.view;
    const sf = this.L.sf;
    const gx = this.gx;
    const ang = show.has('aimB') ? this.tilt(t) : 0;
    const A = show.has('shotA') ? this.shotState('A', t) : null;
    const B = show.has('shotB') ? this.shotState('B', t) : null;
    const R = show.has('air') ? this.shotState('air', t) : null;
    const [, yD] = this.X(this.d, -this.hD);

    this.gong(ctx, B && B.done ? B.after : -1);

    if (show.has('aimB')) {
      // zvednutá osa hlavně a úhel (na obrázku zvětšený)
      const len = (gx + 14 * sf - v.ox) / Math.cos(ang);
      const ex = v.ox + Math.cos(ang) * len;
      const ey = v.oy - Math.sin(ang) * len;
      ctx.save();
      ctx.strokeStyle = 'rgba(126,224,129,0.75)';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([7, 6]);
      ctx.beginPath();
      ctx.moveTo(v.ox, v.oy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.setLineDash([]);
      if (ang > 0.01) {
        const r = 70 * sf;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(v.ox, v.oy, r, -ang, 0);
        ctx.stroke();
      }
      ctx.restore();
      if (ang > 0.01) {
        // popisky nad puškou – dráha a metry jsou vpravo
        this.tag(ctx, 'osa hlavně', v.ox + (ex - v.ox) * 0.62, v.oy - (v.oy - ey) * 0.62 - 16 * sf, '#9df09f', 'center');
        this.tag(ctx, `hlaveň o ${this.vals.mil} mil výš`, v.ox + 30 * sf, v.oy - 58 * sf, '#9df09f', 'right');
        if (ang > Math.atan(this.theta * ZOOM) * 0.99) this.tag(ctx, `(ve skutečnosti jen ${this.vals.deg}°)`, v.ox + 30 * sf, v.oy - 34 * sf, 'rgba(200,225,255,0.85)', 'right');
      }
    }
    if (show.has('ghostA')) this.path(ctx, 'A', BERM / this.v, 'rgba(255,210,138,0.4)', 1.6, [5, 5]);

    // stroboskop: polohy po 0,025 s; s upuštěnou kulkou je spojí vodorovná čárka
    if (show.has('strobe') && A) {
      const n = Math.floor(Math.min(A.tt, this.tD) / STROBE + 1e-6);
      for (let k = 0; k <= n; k++) {
        const [x, y] = this.bullet('A', k * STROBE);
        const [px, py] = this.X(x, y);
        if (show.has('dropped')) {
          ctx.save();
          ctx.strokeStyle = 'rgba(255,255,255,0.28)';
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 4]);
          ctx.beginPath();
          ctx.moveTo(v.ox + 6 * sf, py);
          ctx.lineTo(px, py);
          ctx.stroke();
          ctx.restore();
          this.dot(ctx, v.ox + 6 * sf, py, DROP);
        }
        this.dot(ctx, px, py, SHOT);
      }
    }

    if (A) this.path(ctx, 'A', A.tt, SHOT, 2.2);
    if (R) this.path(ctx, 'air', R.tt, AIR, 2.2, [8, 5]);
    if (B) this.path(ctx, 'B', B.tt, SHOT, 2.2);
    if (show.has('dropped') && A) {
      const [, py] = this.X(0, -this.fall(Math.min(A.tt, this.tD)));
      this.slug(ctx, v.ox + 6 * sf, py, 0, DROP, false);
    }
    if (A) this.round(ctx, A, SHOT);
    if (R) this.round(ctx, R, AIR);
    if (B) this.round(ctx, B, SHOT);

    // puška na střeleckých holích; záblesk z hlavně
    this.sticks(ctx, ang);
    this.rifle(ctx, ang);
    const fired = [A, B, R].filter(Boolean).map((s) => s.since);
    if (fired.length && Math.min(...fired) < 0.014) this.flash(ctx, ang, Math.min(...fired) / 0.014);

    // štítky a kóty
    if (show.has('aim')) {
      const len = (this.tall ? 56 : 74) * sf;   // šipka končí před značkou 50 m
      this.arrow(ctx, v.ox + 10 * sf, v.oy, v.ox + len, v.oy, SHOT, 3);
      this.tag(ctx, `${this.vals.v} m/s`, v.ox + (10 * sf + len) / 2, v.oy - 30 * sf, SHOT, 'center');
      this.tag(ctx, 'osa hlavně míří na střed gongu', (v.ox + gx) / 2, v.oy + 24 * sf, '#e8eef8', 'center');
      this.tag(ctx, 'gong ⌀ 40 cm', gx - 10 * sf, v.oy - GONG_R * v.sy + 12 * sf, '#e8eef8', 'right');
    }
    if (show.has('miss') && A && A.tt >= this.tD) {
      this.dropDim(ctx, `${this.vals.h} cm`);
      this.tag(ctx, 'pod gongem – vedle!', gx - 22 * sf, yD + 26 * sf, '#ffb4a0', 'right');
    }
    if (show.has('levels')) {
      this.vdim(ctx, v.ox + 24 * sf, v.oy, yD, `${this.vals.h} cm`, DROP, 'right');
      this.dropDim(ctx, `${this.vals.h} cm`);
      this.tag(ctx, 'v každé chvíli stejně nízko', (v.ox + gx) / 2, yD - 16 * sf, '#e8eef8', 'center');
    }
    if (show.has('distDim')) {
      const y = v.oy - 46 * sf;
      this.hdim(ctx, v.ox, gx, y, SHOT);
      this.tag(ctx, `${this.vals.d} m za ${this.vals.t} s`, (v.ox + gx) / 2, y - 14 * sf, SHOT, 'center');
    }
    if (show.has('dropDim')) this.dropDim(ctx, `h = ${this.vals.h} cm`);
    if (show.has('dim100')) {
      const [x1, y1] = this.X(100, -this.fall(100 / this.v));
      this.dot(ctx, x1, y1, SHOT);
      this.vdim(ctx, x1 - 10 * sf, v.oy, y1, `${this.vals.h100} cm`, SHOT);
    }
    if (show.has('airDim') && R && R.tt >= this.tAir) {
      // legenda vlevo dole – u gongu jsou obě dráhy těsně u sebe
      const lx = this.L.stage.x + 10;
      this.legend(ctx, lx, v.ground - 54 * sf, `bez vzduchu: ${this.vals.h} cm u gongu`, SHOT, null);
      this.legend(ctx, lx, v.ground - 28 * sf, `se vzduchem: ${this.vals.hAir} cm u gongu`, AIR, [8, 5]);
    }
    if (show.has('hit') && B && B.done) this.tag(ctx, 'střed – zásah!', gx - 16 * sf, v.oy + 26 * sf, '#9df09f', 'right');
  }

  /* Kóta poklesu u gongu (kousek vlevo od něj) a tečkovaná spojnice ke kulce. */
  dropDim(ctx, text) {
    const v = this.view;
    const sf = this.L.sf;
    const x = this.gx - 14 * sf;
    const [, y] = this.X(this.d, -this.hD);
    this.vdim(ctx, x, v.oy, y, '', SHOT);
    // na úzké scéně by popisek uprostřed zakryl dráhu – dát ho nahoru
    this.tag(ctx, text, x - 8, this.tall ? v.oy + 16 * sf : (v.oy + y) / 2, SHOT, 'right');
    ctx.save();
    ctx.strokeStyle = SHOT;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(x + 6, y);
    ctx.lineTo(this.gx, y);
    ctx.stroke();
    ctx.restore();
  }

  /* Řádek legendy: ukázka čáry a popisek. */
  legend(ctx, x, y, text, col, dash) {
    const sf = this.L.sf;
    ctx.font = this.font(600, 14, true);
    const w = ctx.measureText(text).width + 46 * sf;
    const h = 22 * sf;
    ctx.fillStyle = 'rgba(5,8,14,0.78)';
    rrect(ctx, x, y - h / 2, w, h, 5);
    ctx.fill();
    ctx.save();
    ctx.strokeStyle = col;
    ctx.lineWidth = 2.4;
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(x + 8 * sf, y);
    ctx.lineTo(x + 36 * sf, y);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = col;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + 42 * sf, y + 0.5);
  }

  /* Gong z boku na řetězech; po zásahu (after ≥ 0 s) se zhoupne. */
  gong(ctx, after) {
    const v = this.view;
    const sf = this.L.sf;
    const r = GONG_R * v.sy;
    const chain = 30 * sf;
    let psi = 0;
    if (after >= 0 && after < 0.9) psi = 0.14 * Math.exp(-3 * after) * Math.sin((2 * Math.PI * after) / 0.45) * (1 - after / 0.9);
    ctx.save();
    ctx.translate(this.gx, v.oy - r - chain);
    ctx.rotate(-psi);
    ctx.strokeStyle = 'rgba(196,202,210,0.85)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 2]);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, chain);
    ctx.stroke();
    ctx.setLineDash([]);
    const w = 6 * sf;
    const grd = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
    grd.addColorStop(0, '#b4bbc2');
    grd.addColorStop(1, '#596066');
    ctx.fillStyle = grd;
    rrect(ctx, -w / 2, chain, w, 2 * r, 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(10,12,16,0.7)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // střed gongu
    ctx.fillStyle = '#e8eef8';
    ctx.fillRect(-w / 2 - 3, chain + r - 0.75, w + 6, 1.5);
    if (after >= 0) {
      ctx.fillStyle = '#ff8a3c';
      ctx.beginPath();
      ctx.arc(-w / 2, chain + r, 2.6 * sf, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /* Dráha kulky od výstřelu do času tt. */
  path(ctx, kind, tt, col, w, dash) {
    if (tt <= 0) return;
    ctx.save();
    ctx.strokeStyle = col;
    ctx.lineWidth = w;
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    const n = 60;
    for (let i = 0; i <= n; i++) {
      const [px, py] = this.X(...this.bullet(kind, (tt * i) / n));
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    }
    ctx.stroke();
    ctx.restore();
  }

  /* Kulka v letu; na konci obláček hlíny ve valu nebo jiskra na gongu. */
  round(ctx, st, col) {
    const [px, py] = this.X(...this.bullet(st.kind, st.tt));
    if (!st.done) {
      const [qx, qy] = this.X(...this.bullet(st.kind, st.tt + 0.002));
      this.slug(ctx, px, py, Math.atan2(qy - py, qx - px), col, true);
      return;
    }
    const sf = this.L.sf;
    if (st.kind === 'B') {
      if (st.after < 0.12) {
        const u = st.after / 0.12;
        ctx.save();
        ctx.strokeStyle = `rgba(255,241,192,${1 - u})`;
        ctx.lineWidth = 2;
        for (let i = 0; i < 8; i++) {
          const a = Math.PI * (0.5 + i / 7);
          const r0 = 4 * sf;
          const r1 = (8 + 22 * u) * sf;
          ctx.beginPath();
          ctx.moveTo(px + Math.cos(a) * r0, py + Math.sin(a) * r0);
          ctx.lineTo(px + Math.cos(a) * r1, py + Math.sin(a) * r1);
          ctx.stroke();
        }
        ctx.restore();
      }
      return;
    }
    const u = Math.min(1, st.after / PUFF);
    ctx.save();
    if (u < 1) {
      ctx.fillStyle = `rgba(184,154,116,${0.65 * (1 - u)})`;
      for (const [dx, dy, r] of [[-4, -3, 1], [-9, 2, 0.8], [-3, 5, 0.7]]) {
        ctx.beginPath();
        ctx.arc(px + dx * sf * (1 + u), py + dy * sf * (1 + u), (3 + 11 * u) * r * sf, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.fillStyle = '#21180f';
    ctx.beginPath();
    ctx.arc(px, py, 2.4 * sf, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /* Tvar kulky natočený ve směru a (rad), volitelně se stopou letu. */
  slug(ctx, x, y, a, col, streak) {
    const sf = this.L.sf;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    if (streak) {
      const grd = ctx.createLinearGradient(-30 * sf, 0, 0, 0);
      grd.addColorStop(0, 'rgba(255,240,200,0)');
      grd.addColorStop(1, 'rgba(255,240,200,0.75)');
      ctx.strokeStyle = grd;
      ctx.lineWidth = 3 * sf;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-30 * sf, 0);
      ctx.lineTo(-4 * sf, 0);
      ctx.stroke();
    }
    ctx.fillStyle = col;
    ctx.strokeStyle = 'rgba(10,12,16,0.85)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(7 * sf, 0);
    ctx.quadraticCurveTo(3 * sf, -2.8 * sf, -5 * sf, -2.8 * sf);
    ctx.lineTo(-5 * sf, 2.8 * sf);
    ctx.quadraticCurveTo(3 * sf, 2.8 * sf, 7 * sf, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  dot(ctx, x, y, col) {
    const sf = this.L.sf;
    ctx.fillStyle = 'rgba(5,8,14,0.65)';
    ctx.beginPath();
    ctx.arc(x, y, 4.2 * sf, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(x, y, 2.7 * sf, 0, Math.PI * 2);
    ctx.fill();
  }

  /* Vodorovná kóta. */
  hdim(ctx, x0, x1, y, col) {
    ctx.save();
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.moveTo(x0, y - 5);
    ctx.lineTo(x0, y + 5);
    ctx.moveTo(x1, y - 5);
    ctx.lineTo(x1, y + 5);
    ctx.stroke();
    ctx.restore();
  }

  /* Puška (hlaveň vpravo, ústí v počátku); ang = zvednutí hlavně, otáčí se kolem ústí. */
  rifle(ctx, ang) {
    const v = this.view;
    ctx.save();
    ctx.translate(v.ox, v.oy);
    ctx.rotate(-ang);
    ctx.scale(v.rs, v.rs);
    ctx.lineJoin = 'round';
    const stock = '#58603f';
    const metal = '#272b2f';
    // pažba s lícnicí a pistolovou rukojetí
    ctx.fillStyle = stock;
    ctx.beginPath();
    ctx.moveTo(-122, -6);
    ctx.lineTo(-150, -7);
    ctx.lineTo(-160, -12);
    ctx.lineTo(-178, -12);
    ctx.quadraticCurveTo(-184, -11, -184, -5);
    ctx.lineTo(-184, 18);
    ctx.lineTo(-172, 19);
    ctx.quadraticCurveTo(-152, 8, -134, 8);
    ctx.lineTo(-131, 22);
    ctx.lineTo(-123, 23);
    ctx.lineTo(-120, 7);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#1b1d1f';
    ctx.fillRect(-186, -10, 4, 28);                 // botka
    // pouzdro závěru, spoušť, zásobník
    ctx.fillStyle = metal;
    rrect(ctx, -124, -7, 36, 13, 2);
    ctx.fill();
    ctx.fillRect(-113, 6, 11, 11);
    ctx.strokeStyle = metal;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(-122, 10, 5, 0, Math.PI);
    ctx.stroke();
    ctx.beginPath();                                // páka závěru
    ctx.moveTo(-104, 2);
    ctx.lineTo(-100, 9);
    ctx.stroke();
    ctx.fillStyle = metal;
    ctx.beginPath();
    ctx.arc(-100, 10, 2.4, 0, Math.PI * 2);
    ctx.fill();
    // předpažbí
    ctx.fillStyle = stock;
    rrect(ctx, -90, -5, 40, 11, 3);
    ctx.fill();
    // hlaveň a úsťová brzda
    ctx.fillStyle = metal;
    ctx.fillRect(-52, -2.2, 46, 4.4);
    rrect(ctx, -10, -3.4, 10, 6.8, 1.2);
    ctx.fill();
    ctx.fillStyle = '#0c0d0f';
    ctx.fillRect(-7, -3.4, 1.4, 6.8);
    ctx.fillRect(-4, -3.4, 1.4, 6.8);
    // dalekohled na montáži
    ctx.fillStyle = '#1d2023';
    ctx.fillRect(-114, -11, 6, 5);
    ctx.fillRect(-96, -11, 6, 5);
    rrect(ctx, -122, -19, 44, 8, 4);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-82, -19);
    ctx.lineTo(-66, -22);
    ctx.lineTo(-66, -8);
    ctx.lineTo(-82, -11);
    ctx.closePath();
    ctx.fill();
    rrect(ctx, -132, -20, 12, 10, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(140,200,255,0.45)';
    ctx.fillRect(-66.5, -21, 1.5, 12);
    // odlesky
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-120, -18);
    ctx.lineTo(-80, -18);
    ctx.moveTo(-50, -1.5);
    ctx.lineTo(-8, -1.5);
    ctx.moveTo(-176, -10.5);
    ctx.lineTo(-160, -10.5);
    ctx.stroke();
    ctx.restore();
  }

  /* Střelecké hole: zkřížené pod předpažbím, dole na zemi. */
  sticks(ctx, ang) {
    const v = this.view;
    const k = v.rs;
    // bod pod předpažbím (otočený s puškou kolem ústí)
    const lx = -70 * k;
    const ly = 7 * k;
    const cx = v.ox + lx * Math.cos(ang) + ly * Math.sin(ang);
    const cy = v.oy - lx * Math.sin(ang) + ly * Math.cos(ang);
    const spread = 34 * k;
    ctx.save();
    ctx.strokeStyle = '#6e5639';
    ctx.lineWidth = 3.2 * k + 0.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - spread, v.ground + 2);
    ctx.lineTo(cx + 8 * k, cy - 6 * k);
    ctx.moveTo(cx + spread, v.ground + 2);
    ctx.lineTo(cx - 8 * k, cy - 6 * k);
    ctx.stroke();
    // provázek v místě překřížení
    ctx.strokeStyle = '#c9b48a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy + 2 * k, 3 * k, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /* Záblesk z ústí (u = 0 → 1 za prvních 14 ms). */
  flash(ctx, ang, u) {
    const v = this.view;
    const sf = this.L.sf;
    const r = (10 + 16 * Math.sin(Math.PI * Math.min(1, u))) * sf;
    ctx.save();
    ctx.translate(v.ox, v.oy);
    ctx.rotate(-ang);
    const grd = ctx.createRadialGradient(r * 0.4, 0, 0, r * 0.4, 0, r);
    grd.addColorStop(0, 'rgba(255,250,220,0.95)');
    grd.addColorStop(0.4, 'rgba(255,196,90,0.75)');
    grd.addColorStop(1, 'rgba(255,140,40,0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const rr = i % 2 ? r * 0.45 : r;
      const px = r * 0.4 + Math.cos(a) * rr * (Math.cos(a) > 0 ? 1.3 : 0.6);
      const py = Math.sin(a) * rr * 0.7;
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  paintGraph(ctx, t, show) {
    const tall = this.tall;
    const { gx, gy } = this.axes(ctx, { x0: 0, x1: 0.3, yMax: 50, yStep: tall ? 25 : 10, xStep: tall ? 0.1 : 0.05, xLabel: 'čas od výstřelu (s)', xFmt: (v) => fmt(v, tall ? 1 : 2) });
    const cm = (tt) => this.fall(tt) * 100;
    const curve = (t0, t1, col, w) => {
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.beginPath();
      for (let i = 0; i <= 40; i++) {
        const tt = t0 + ((t1 - t0) * i) / 40;
        if (i) ctx.lineTo(gx(tt), gy(cm(tt)));
        else ctx.moveTo(gx(tt), gy(cm(tt)));
      }
      ctx.stroke();
    };
    ctx.save();
    curve(0, 0.3, 'rgba(255,210,138,0.28)', 2);
    // právě letící kulka: všechny (i upuštěná a ta se vzduchem) padají podle stejné křivky
    const kind = show.has('shotB') ? 'B' : show.has('air') ? 'air' : show.has('shotA') ? 'A' : null;
    const st = kind && this.shotState(kind, t);
    const tt = st ? Math.min(st.tt, kind === 'air' ? this.tAir : this.tD) : 0;
    if (tt > 0) {
      curve(0, tt, kind === 'air' ? AIR : SHOT, 2.6);
      if (show.has('dropped')) {
        ctx.strokeStyle = DROP;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(gx(tt), gy(cm(tt)), 8, 0, Math.PI * 2);
        ctx.stroke();
      }
      this.gdot(ctx, gx(tt), gy(cm(tt)), kind === 'air' ? AIR : SHOT);
    }
    ctx.restore();
    const mark = (tt0, text, col, below) => {
      const x = gx(tt0);
      const y = gy(cm(tt0));
      ctx.save();
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.6;
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, gy(0));
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.restore();
      this.gdot(ctx, x, y, col);
      this.glabel(ctx, text, x - 8, below ? y + 12 : y - 12, col);
    };
    if (show.has('g100')) mark(100 / this.v, `100 m: ${this.vals.h100} cm`, SHOT, false);
    if (show.has('gAir')) {
      // se vzduchem: značky až ve chvíli, kdy kulky na 200 m doletí
      if (st && st.tt >= this.tD) mark(this.tD, `bez vzduchu: ${this.vals.h} cm`, SHOT, true);
      if (st && st.tt >= this.tAir) mark(this.tAir, `se vzduchem: ${this.vals.hAir} cm`, AIR, false);
    } else if (show.has('g200')) mark(this.tD, `${this.vals.d} m: ${this.vals.h} cm`, SHOT, false);
  }

  gdot(ctx, x, y, col) {
    ctx.fillStyle = col;
    ctx.strokeStyle = '#05080e';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  /* Popisek v grafu s tmavým podkladem (zarovnaný vpravo k x). */
  glabel(ctx, text, x, y, col) {
    ctx.font = this.font(600, 11);
    const w = ctx.measureText(text).width + 8;
    const h = 16 * this.L.f;
    const R = this.L.graph;
    const lx = Math.max(R.x + 2, x - w);
    ctx.fillStyle = 'rgba(10,16,24,0.85)';
    rrect(ctx, lx, y - h / 2, w, h, 4);
    ctx.fill();
    ctx.fillStyle = col;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, lx + 4, y + 0.5);
  }

  paintBoard(ctx, t, show, scene) {
    if (show.has('formula')) {
      this.boardLines(ctx, this.formula(scene.formula));
      return;
    }
    if (!show.has('live')) {
      this.boardNote(ctx, `Kulka ${this.vals.v} m/s, gong ⌀ 40 cm na ${this.vals.d} m`, 'puška míří přesně vodorovně · vzduch zatím zanedbáme');
      return;
    }
    const st = this.shotState('A', t);
    const tt = st ? Math.min(st.tt, this.tD) : 0;
    const h = `${fmt(this.fall(tt) * 100, 1)} cm`;
    this.boardRows(ctx, [
      ['čas od výstřelu', `${fmt(tt, 3)} s`, '#ffe9b8'],
      ['vzdálenost', `${fmt(this.v * tt, 0)} m`, '#e8f2ff'],
      ['pokles kulky', h, SHOT],
      show.has('dropped') ? ['upuštěná kulka', h, DROP] : ['rychlost', `${this.vals.v} m/s`, '#e8f2ff'],
    ]);
  }

  formula(kind) {
    const v = this.vals;
    const big = (text, col) => this.big(text, col);
    const small = (text) => this.small(text);
    switch (kind) {
      case 'time':
        return [big('t = d : v', '#e8f2ff'), big(`t = ${v.d} : ${v.v} = ${v.t} s`, '#ffe9b8'), small('bez vzduchu letí kulka pořád stejně rychle')];
      case 'fall':
        return [big('h = ½ · g · t²', '#e8f2ff'), big(`h = ½ · 9,81 · ${v.t}² ≈ ${v.hm} m`, SHOT), small(`${v.h} cm pod osou – víc než poloměr gongu (${v.r} cm)`)];
      case 'double':
        return [small(`100 m: t = ${v.t100} s → h = ${v.h100} cm`), small(`${v.d} m: t = ${v.t} s → h = ${v.h} cm`), big('2× dál → 4× větší pokles', SHOT)];
      case 'mil':
        return [small(`pokles ${v.h} cm na ${v.d} m – v milech:`), big(`${v.hm3} × 1 000 : ${v.d} ≈ ${v.mil} mil`, '#7ee081'), small(`hlaveň o ${v.mil} mil výš → kulka trefí střed`)];
      case 'air':
        return [small('vzduch kulku brzdí – letí déle, spadne víc:'), big(`${v.d} m: ${v.tAir} s → ${v.hAir} cm`, AIR), small(`500 m: ${v.h500} m bez vzduchu, ${v.h500Air} m se vzduchem`)];
      default:
        return [big('t = d : v', '#e8f2ff'), big('h = ½ · g · t²', SHOT), small('kulka padá stejně jako upuštěná'), small('2× dál → 4× víc · vzduch → ještě víc')];
    }
  }
}
