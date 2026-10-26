/*
 * Výklad „Biceps a páka“ (Laboratoře – anatomický kabinet): předloktí jako páka. Osa je v lokti,
 * biceps se upíná blízko osy (4 cm), činka v ruce je daleko (asi 32 cm). V klidu se momenty
 * vyrovnají, takže sval táhne mnohonásobkem tíhy činky – zato se zkrátí jen o kousek, zatímco ruka
 * urazí dlouhou dráhu. Pak se mění úhel v lokti: rameno činky (vodorovná vzdálenost od lokte)
 * i její moment jsou největší s předloktím vodorovně. Hmotnost předloktí zanedbáváme jako v kabinetu;
 * čísla jsou ukázková (jiná než v zámku i v řešeném příkladu v knize). Postava z js/postava.js,
 * společný základ v js/vyklad.js, texty kroků v game.json „explainers“ (type „lever“).
 */
import { makeBody, pose, drawBody } from './postava.js?v=0.33';
import { G, Explainer, fmt, fmtN, smoother } from './vyklad.js?v=0.33';

const DEG = Math.PI / 180;
const MASS = 3;           // činka (kg)
const D_MUSCLE = 0.04;    // úpon bicepsu od osy lokte (m)
const ELBOW_AT = { wide: [212, 330, 480], tall: [168, 226, 330] };   // loket na plátně a měřítko (px/m)
const F_PX = 0.62;        // px šipky na 1 N (při 480 px/m)

const BASE = {
  trunk: 0, neck: 0, head: 0, thigh: 0, shin: 2, foot: 0, uarm: 0, grip: 'fist',
  far: { uarm: 6, farm: 10, hand: 12, grip: 'open' },
};

/* Scény: co se při kroku přehraje a co je v obraze. */
export const SCENES = {
  intro: { at: 'start', show: [] },
  lever: { at: 'start', show: ['lever', 'axis'] },
  load: { at: 'start', show: ['lever', 'axis', 'weight', 'dimLoad', 'live'] },
  moment: { at: 'start', show: ['axis', 'weight', 'dimLoad', 'arcLoad', 'live'] },
  muscle: { at: 'start', show: ['axis', 'weight', 'dimLoad', 'biceps', 'dimMuscle', 'live'] },
  balance: { at: 'start', show: ['axis', 'weight', 'dimLoad', 'biceps', 'dimMuscle', 'arcLoad', 'arcMuscle', 'formula'], formula: 'balance' },
  force: { at: 'start', show: ['axis', 'weight', 'biceps', 'muscleForce', 'formula'], formula: 'force' },
  classes: { at: 'start', show: ['lever', 'axis', 'weight', 'biceps', 'roles'] },
  why: { play: [['curl0', 'curl1', 0.45]], show: ['axis', 'biceps', 'paths', 'live'] },
  ratio: { at: 'curl1', show: ['axis', 'biceps', 'paths', 'formula'], formula: 'ratio' },
  angle: { play: [['back', 'down', 0.6], ['down', 'up', 0.5]], show: ['axis', 'weight', 'armH', 'live', 'sweep'] },
  hardest: { play: [['up', 'back2', 0.7]], show: ['axis', 'weight', 'armH', 'live', 'sweep'] },
  outro: { at: 'back2', show: ['axis', 'weight', 'biceps', 'muscleForce', 'formula'], formula: 'all' },
};

export default class LeverExplainer extends Explainer {
  constructor(canvas, def) {
    super(canvas, def);
    this.body = makeBody({ style: 'sport', height: 1.78, mass: 75, colors: { jacket: '#3d6587', shorts: '#26282a', accent: '#8fb8d8' } });
    this.m = def.mass || MASS;
    this.d = def.muscleArm || D_MUSCLE;
    this.W = this.m * G;
    this.r = this.body.L.farm + 0.06 * this.body.k;   // loket → střed sevřené ruky s činkou
    this.M = this.W * this.r;
    this.F = this.M / this.d;
    this.T = { start: 0, curl0: 0.5, curl1: 2.1, back: 3.2, down: 4.4, up: 6.8, back2: 8.0, end: 8.2 };
    this.scenes = SCENES;
    this.graphTitle = 'MOMENT ČINKY KOLEM LOKTE (N·m)';
    const dth = 40 * DEG;
    this.vals = {
      m: fmt(this.m, 0), W: fmt(this.W, 0), r: fmt(this.r * 100, 0), rm: fmt(this.r, 2),
      d: fmt(this.d * 100, 0), dm: fmt(this.d, 2), M: fmt(this.M, 1), F: fmtN(this.F),
      k: fmt(this.F / this.W, 0), du: fmt(this.d * dth * 100, 1), dh: fmt(this.r * dth * 100, 0),
    };
  }

  /* Úhel předloktí od svislice dolů (90° = vodorovně) v čase t. */
  theta(t) {
    const T = this.T;
    const seg = (a, b, t0, t1) => a + (b - a) * smoother(Math.max(0, Math.min(1, (t - t0) / (t1 - t0))));
    if (t <= T.curl0) return 90;
    if (t <= T.curl1) return seg(90, 130, T.curl0, T.curl1);
    if (t <= T.back) return seg(130, 90, T.curl1, T.back);
    if (t <= T.down) return seg(90, 30, T.back, T.down);
    if (t <= T.up) return seg(30, 150, T.down, T.up);
    if (t <= T.back2) return seg(150, 90, T.up, T.back2);
    return 90;
  }

  layout(L) {
    const [ex, ey, s] = ELBOW_AT[L.name];
    const sk = pose(this.body, { ...BASE, farm: 90, hand: 90 }, { ground: 0, x: 0 });
    const e = sk.armN.elbow;
    this.view = { s, ox: ex - e[0] * s, oy: ey + e[1] * s };
  }

  X(p) {
    const v = this.view;
    return [v.ox + p[0] * v.s, v.oy - p[1] * v.s];
  }

  /* Postava a body páky pro úhel th. */
  geometry(th) {
    const sk = pose(this.body, { ...BASE, farm: th, hand: th }, { ground: 0, x: 0 });
    const e = sk.armN.elbow;
    const u = [Math.sin(th * DEG), -Math.cos(th * DEG)];
    const hand = [e[0] + u[0] * this.r, e[1] + u[1] * this.r];
    const ins = [e[0] + u[0] * this.d, e[1] + u[1] * this.d];
    const org = [sk.shoulder[0] + 0.03 * sk.k, sk.shoulder[1] - 0.015 * sk.k];
    return { sk, e, u, hand, ins, org };
  }

  paintStageBackground(g, L) {
    const S = L.stage;
    const wall = g.createLinearGradient(0, S.y, 0, S.y + S.h);
    wall.addColorStop(0, '#15120d');
    wall.addColorStop(1, '#241e16');
    g.fillStyle = wall;
    g.fillRect(S.x, S.y, S.w, S.h);
    const lamp = g.createRadialGradient(S.x + S.w * 0.75, S.y + 30, 10, S.x + S.w * 0.75, S.y + 30, S.w * 0.8);
    lamp.addColorStop(0, 'rgba(255,220,160,0.12)');
    lamp.addColorStop(1, 'rgba(255,220,160,0)');
    g.fillStyle = lamp;
    g.fillRect(S.x, S.y, S.w, S.h);
    // mřížka po 5 cm od lokte
    const s = this.view.s;
    const [ex, ey] = this.X(this.geometry(90).e);
    g.lineWidth = 1;
    for (let i = -12; i <= 12; i++) {
      const x = ex + i * 0.05 * s;
      const y = ey + i * 0.05 * s;
      g.strokeStyle = i % 2 === 0 ? 'rgba(255,230,190,0.07)' : 'rgba(255,230,190,0.035)';
      if (x > S.x && x < S.x + S.w) {
        g.beginPath();
        g.moveTo(x + 0.5, S.y);
        g.lineTo(x + 0.5, S.y + S.h);
        g.stroke();
      }
      if (y > S.y && y < S.y + S.h) {
        g.beginPath();
        g.moveTo(S.x, y + 0.5);
        g.lineTo(S.x + S.w, y + 0.5);
        g.stroke();
      }
    }
    g.fillStyle = 'rgba(255,230,190,0.4)';
    g.font = this.font(600, 11, true);
    g.textAlign = 'left';
    g.textBaseline = 'bottom';
    g.fillText('mřížka po 5 cm', S.x + 8, S.y + S.h - 6);
  }

  paintStage(ctx, t, show) {
    const th = this.theta(t);
    const geo = this.geometry(th);
    this.th = th;
    const X = (p) => this.X(p);
    const s = this.view.s;
    const kF = F_PX * (s / 480);
    drawBody(ctx, geo.sk, this.view, { hooks: { top: (c) => this.paintArmOverlays(c, geo, show) } });
    const [ex, ey] = X(geo.e);
    const [hx, hy] = X(geo.hand);
    const [ix, iy] = X(geo.ins);
    const sf = this.L.sf;

    if (show.has('axis')) {
      ctx.save();
      ctx.fillStyle = '#ffd28a';
      ctx.strokeStyle = '#14110c';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ex, ey, 6 * sf, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      if (!show.has('roles')) this.tag(ctx, 'osa (loket)', ex - 14, ey - 4, '#ffd28a', 'right');
    }
    if (show.has('arcLoad')) this.arcArrow(ctx, ex, ey, 0.115 * s, -0.2, 0.6, '#ff8a7a', `moment činky ${this.vals.M} N·m`, 'below');
    if (show.has('arcMuscle')) this.arcArrow(ctx, ex, ey, 0.155 * s, 0.35, -0.55, '#7ee081', 'moment svalu', 'above');
    if (show.has('weight')) {
      // stejné měřítko jako síla svalu – je vidět, kolikrát je sval silnější
      const len = this.W * kF;
      this.arrow(ctx, hx, hy + 0.065 * s, hx, hy + 0.065 * s + len, '#ff6b5e', 5);
      this.tag(ctx, `tíha činky ${this.vals.W} N`, hx + 14, hy + 0.065 * s + len * 0.5 + 4, '#ff9a90');
    }
    if (show.has('muscleForce')) {
      const dir = [geo.org[0] - geo.ins[0], geo.org[1] - geo.ins[1]];
      const l = Math.hypot(dir[0], dir[1]);
      const len = Math.min(this.F * kF, l * s * 0.95);
      const [ox, oy] = [ix + (dir[0] / l) * len, iy - (dir[1] / l) * len];
      this.arrow(ctx, ix, iy, ox, oy, '#7ee081', 6);
      this.tag(ctx, `biceps ${this.vals.F} N`, ox + 12, oy + 14, '#9df09f');
    }
    const dimY = ey + 0.16 * s;
    if (show.has('dimLoad')) this.hdim(ctx, ex, hx, dimY + 18 * sf, `${this.vals.r} cm`, '#ffd28a');
    if (show.has('dimMuscle')) this.hdim(ctx, ex, ix, dimY, `${this.vals.d} cm`, '#9df09f', 'right');
    if (show.has('armH')) {
      // rameno činky = vodorovná vzdálenost od lokte k přímce tíhy
      ctx.save();
      ctx.strokeStyle = 'rgba(255,210,138,0.8)';
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx, ey);
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex + Math.max(hx - ex, 0) + 4, ey);
      ctx.stroke();
      ctx.restore();
      const rh = this.r * Math.sin(th * DEG);
      this.hdim(ctx, ex, hx, ey + 26 * sf, `rameno ${fmt(rh * 100, 0)} cm`, '#ffd28a');
    }
    if (show.has('paths')) {
      const a0 = 90;
      const sweep = (rad, col, text, place) => {
        const R = rad * s;
        const s0 = (90 - a0) * DEG;
        const s1 = (90 - th) * DEG;
        ctx.save();
        ctx.strokeStyle = col;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(ex, ey, R, Math.min(s0, s1), Math.max(s0, s1));
        ctx.stroke();
        ctx.restore();
        const mid = (s0 + s1) / 2;
        if (Math.abs(th - a0) > 2) this.tag(ctx, text, ex + Math.cos(mid) * (R + place), ey + Math.sin(mid) * (R + place), col, place > 0 ? 'left' : 'right');
      };
      const dth = Math.abs(th - 90) * DEG;
      sweep(this.r, '#6fd6ff', `ruka ${fmt(this.r * dth * 100, 0)} cm`, 14);
      sweep(this.d, '#9df09f', `úpon ${fmt(this.d * dth * 100, 1)} cm`, -16);
    }
    if (show.has('roles')) {
      this.tag(ctx, 'osa', ex - 12, ey + 18 * sf, '#ffd28a', 'right');
      this.tag(ctx, 'síla – sval', ix + 4, iy + 34 * sf, '#9df09f', 'center');
      this.tag(ctx, 'břemeno – činka', hx, hy + 0.17 * s, '#ff9a90', 'center');
    }
  }

  /* Páka (zvýrazněné předloktí), biceps a činka – kreslí se přes postavu. */
  paintArmOverlays(ctx, geo, show) {
    const X = (p) => this.X(p);
    const s = this.view.s;
    const [ex, ey] = X(geo.e);
    const [hx, hy] = X(geo.hand);
    if (show.has('lever')) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,210,138,0.55)';
      ctx.lineCap = 'round';
      ctx.lineWidth = 0.028 * s;
      ctx.beginPath();
      ctx.moveTo(ex - (hx - ex) * 0.06, ey - (hy - ey) * 0.06);
      ctx.lineTo(hx, hy);
      ctx.stroke();
      ctx.restore();
    }
    if (show.has('biceps')) {
      // vřetenovitý sval od lopatky k úponu na předloktí, šlachy na koncích
      const [ox, oy] = X(geo.org);
      const [ix, iy] = X(geo.ins);
      const dx = ix - ox;
      const dy = iy - oy;
      const l = Math.hypot(dx, dy);
      const n = [dy / l, -dx / l];   // kolmice dopředu (sval leží na přední straně paže)
      const w = 0.03 * s * (show.has('muscleForce') ? 1.25 : 1);
      const p = (f, side) => [ox + dx * f + n[0] * side, oy + dy * f + n[1] * side];
      ctx.save();
      ctx.strokeStyle = 'rgba(240,220,200,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(...p(0.16, 0));
      ctx.moveTo(...p(0.86, 0));
      ctx.lineTo(ix, iy);
      ctx.stroke();
      const a = p(0.16, 0);
      const b = p(0.86, 0);
      ctx.beginPath();
      ctx.moveTo(...a);
      ctx.quadraticCurveTo(...p(0.45, w * 2), ...b);
      ctx.quadraticCurveTo(...p(0.45, -w * 0.6), ...a);
      ctx.closePath();
      const gr = ctx.createLinearGradient(...p(0.45, w * 1.2), ...p(0.45, -w * 0.4));
      gr.addColorStop(0, show.has('muscleForce') ? 'rgba(236,84,66,0.9)' : 'rgba(204,74,60,0.78)');
      gr.addColorStop(1, 'rgba(120,30,24,0.85)');
      ctx.fillStyle = gr;
      ctx.fill();
      ctx.strokeStyle = 'rgba(70,14,10,0.9)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
      if (!show.has('roles') && !show.has('muscleForce')) this.tag(ctx, 'biceps', ...p(0.42, w * 2 + 10), '#ff9a90', 'left');
    }
    // činka (kotouč na straně k nám, tyč prochází pěstí)
    const R = 0.062 * s;
    ctx.save();
    const gr = ctx.createRadialGradient(hx - R * 0.3, hy - R * 0.35, R * 0.1, hx, hy, R);
    gr.addColorStop(0, '#5c6066');
    gr.addColorStop(0.7, '#2b2e33');
    gr.addColorStop(1, '#16181b');
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(hx, hy, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0b0c0e';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#8e939a';
    ctx.beginPath();
    ctx.arc(hx, hy, R * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d6c58a';
    ctx.font = `700 ${Math.round(R * 0.5)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${this.vals.m} kg`, hx, hy + R * 0.58);
    ctx.restore();
  }

  /* Oblouk se šipkou kolem lokte (a0 → a1 v radiánech plátna) a popisek. */
  arcArrow(ctx, cx, cy, R, a0, a1, col, text, place) {
    ctx.save();
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, R, a0, a1, a1 < a0);
    ctx.stroke();
    const dir = a1 > a0 ? 1 : -1;
    const tip = [cx + Math.cos(a1) * R, cy + Math.sin(a1) * R];
    const tan = [-Math.sin(a1) * dir, Math.cos(a1) * dir];
    const nrm = [Math.cos(a1), Math.sin(a1)];
    ctx.beginPath();
    ctx.moveTo(tip[0] + tan[0] * 9, tip[1] + tan[1] * 9);
    ctx.lineTo(tip[0] - tan[0] * 2 + nrm[0] * 6, tip[1] - tan[1] * 2 + nrm[1] * 6);
    ctx.lineTo(tip[0] - tan[0] * 2 - nrm[0] * 6, tip[1] - tan[1] * 2 - nrm[1] * 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    const am = (a0 + a1) / 2;
    const off = place === 'below' ? 18 : 22;
    this.tag(ctx, text, cx + Math.cos(am) * (R + off), cy + Math.sin(am) * (R + off) + (place === 'below' ? 10 : -10), col, 'left');
  }

  /* Vodorovná kóta od osy (x0) k bodu (x1) s popiskem. */
  hdim(ctx, x0, x1, y, text, col, side = 'center') {
    ctx.save();
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.moveTo(x0, y - 5);
    ctx.lineTo(x0, y + 5);
    ctx.moveTo(x1, y - 5);
    ctx.lineTo(x1, y + 5);
    ctx.stroke();
    ctx.restore();
    if (side === 'right') this.tag(ctx, text, Math.max(x0, x1) + 8, y, col, 'left');
    else this.tag(ctx, text, (x0 + x1) / 2, y + 14 * this.L.sf, col, 'center');
  }

  paintGraph(ctx, t, show) {
    const bright = show.has('sweep');
    const yMax = Math.ceil(this.M / 2 + 0.01) * 2;
    const { gx, gy } = this.axes(ctx, { x0: 0, x1: 180, yMax, yStep: this.tall ? 4 : 2, xStep: 30, xLabel: 'úhel v lokti', xFmt: (v) => `${v}°` });
    ctx.save();
    ctx.strokeStyle = bright ? '#ff9a90' : 'rgba(255,154,144,0.35)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    for (let a = 0; a <= 180; a += 2) {
      const x = gx(a);
      const y = gy(this.M * Math.sin(a * DEG));
      if (a) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.stroke();
    // nejtěžší místo: předloktí vodorovně (loket 90°)
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(255,210,138,0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(gx(90), gy(0));
    ctx.lineTo(gx(90), gy(this.M));
    ctx.stroke();
    ctx.restore();
    const phi = 180 - (this.th ?? 90);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(gx(phi), gy(this.M * Math.sin(phi * DEG)), 4, 0, Math.PI * 2);
    ctx.fill();
  }

  paintBoard(ctx, t, show, scene) {
    if (show.has('formula')) {
      this.boardLines(ctx, this.formula(scene.formula));
      return;
    }
    if (!show.has('live')) {
      this.boardNote(ctx, `Činka ${this.vals.m} kg v ruce`, `loket v pravém úhlu · hmotnost předloktí zanedbáme`);
      return;
    }
    const th = this.th ?? 90;
    const rh = this.r * Math.sin(th * DEG);
    const M = this.W * rh;
    this.boardRows(ctx, [
      ['úhel v lokti', `${fmt(180 - th, 0)}°`, '#e8f2ff'],
      ['rameno činky', `${fmt(rh * 100, 0)} cm`, '#ffd28a'],
      ['moment činky', `${fmt(M, 1)} N·m`, '#ff9a90'],
      ['síla bicepsu', `${fmtN(M / this.d)} N`, '#7ee081'],
    ]);
  }

  formula(kind) {
    const v = this.vals;
    const big = (text, col) => this.big(text, col);
    const small = (text) => this.small(text);
    switch (kind) {
      case 'balance':
        return [small('V klidu se momenty kolem lokte vyrovnají:'), big(`F · ${v.dm} m = ${v.W} N · ${v.rm} m`, '#e8f2ff'), small('rameno = kolmá vzdálenost od osy (v metrech)')];
      case 'force':
        return [big(`F = ${v.W} · ${v.rm} / ${v.dm}`, '#e8f2ff'), big(`F ≈ ${v.F} N`, '#7ee081'), small(`asi ${v.k}× víc, než je tíha činky`)];
      case 'ratio':
        return [small(`Ruka je ${v.k}× dál od osy než úpon svalu:`), big(`dráha ruky = ${v.k} × dráha úponu`, '#6fd6ff'), small('sval se zkrátí o kousek, ruka urazí dlouhou dráhu')];
      default:
        return [big('M = F · r', '#ffd28a'), big('F_sval · r_sval = F_činka · r_činka', '#e8f2ff'), small('r … kolmá vzdálenost od osy kloubu (m)'), small('blízko osy: velká síla, malý pohyb svalu')];
    }
  }
}
