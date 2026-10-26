/*
 * Výklad „Šikmý vrh“ (Vojenská tělovýchova – odhodový sektor v tělocvičně): míček hozený rychlostí
 * 10 m/s z výšky 2 m. Rychlost se rozloží na vodorovnou složku (vx = v · cos α, ta se nemění)
 * a svislou (vy = v · sin α, ta se mění jako při vrhu vzhůru); dolet = vx · doba letu. Pak hody
 * pod 30°, 45° a 60°: na rovině by nejdál letěl 45° a 30° s 60° by dopadly stejně daleko; z výšky
 * dopadá míček níž, než vyletěl, a nejdál doletí pod menším úhlem (tady asi 40°). Odpor vzduchu
 * zanedbáváme. Čísla jsou ukázková – jiná než v kolech hodu. Vrhač je stejný jako v aktivitě hodu
 * (js/hod.js), společný základ v js/vyklad.js, texty kroků v game.json „explainers“ (type „projectile“).
 */
import { makeBody, drawBody } from './postava.js?v=0.33';
import { background } from './kresba.js?v=0.33';
import { Thrower } from './hod.js?v=0.33';
import { G, Explainer, fmt } from './vyklad.js?v=0.33';

const DEG = Math.PI / 180;
const VIEWS = { wide: { s: 38, ox: 70, oy: 470, kv: 9 }, tall: { s: 33, ox: 46, oy: 318, kv: 7.5 } };   // kv = px šipky na 1 m/s
const SWING = 0.3;        // švih paže do odhodu (s)
const FOLLOW = 0.3;       // dokončení švihu
const RECOVER = 0.4;      // návrat do nápřahu
const COLORS = { 45: '#ffd28a', 30: '#6fd6ff', 60: '#ff9ad0' };
const BEST_COLOR = '#7ee081';

/* Scény: co se při kroku přehraje a co je v obraze. */
export const SCENES = {
  intro: { at: 'start', show: ['aim'] },
  throw: { play: [['start', 'l45', 1]], show: ['trail'], sounds: [['r45', 'step', -0.05]] },
  split: { at: 'r45', show: ['components', 'formula'], formula: 'split' },
  horizontal: { play: [['r45', 'l45', 0.45]], show: ['trail', 'strobe', 'vxArrow', 'live'] },
  vertical: { play: [['r45', 'l45', 0.45]], show: ['trail', 'strobe', 'vyArrow', 'live'] },
  apex: { at: 'a45', show: ['trail', 'apexDim', 'live'] },
  time: { at: 'l45', show: ['trail', 'apexDim', 'formula'], formula: 'time' },
  range: { at: 'l45', show: ['trail', 'rangeDim', 'formula'], formula: 'range' },
  angles: { play: [['s30', 'l30', 1], ['s60', 'l60', 1]], show: ['trail', 'paths', 'marks', 'dots', 'live'], sounds: [['r30', 'step', -0.05], ['r60', 'step', -0.05]] },
  flat: { at: 'l60', show: ['paths', 'marks', 'dots', 'flat', 'formula'], formula: 'flat' },
  height: { play: [['s40', 'l40', 1]], show: ['trail', 'paths', 'marks', 'dots', 'curve', 'live'], sounds: [['r40', 'step', -0.05]] },
  speed: { at: 'l40', show: ['paths', 'marks', 'dots', 'curve', 'formula'], formula: 'speed' },
  outro: { at: 'l40', show: ['paths', 'marks', 'dots', 'curve', 'formula'], formula: 'all' },
};

export default class ProjectileExplainer extends Explainer {
  constructor(canvas, def) {
    super(canvas, def);
    this.v = def.speed || 10;
    this.h0 = def.releaseHeight ?? 2;
    this.body = makeBody({ style: 'sport', height: 1.8, mass: 78, colors: { jacket: '#b8513c', shorts: '#26282a', accent: '#f0c060' } });
    this.thr = new Thrower(this.body, [0, this.h0]);
    // nejlepší úhel z výšky h0: tg α = v / √(v² + 2 g h0)
    this.bestExact = Math.atan(this.v / Math.sqrt(this.v * this.v + 2 * G * this.h0)) / DEG;
    this.best = Math.round(this.bestExact);
    this.colors = { ...COLORS, [this.best]: BEST_COLOR };
    // hody za sebou: 45°, 30°, 60°, nejlepší
    const T = { start: 0 };
    this.throws = [];
    let t = 0.5;
    for (const a of [45, 30, 60, this.best]) {
      const sh = this.shot(a);
      T[`s${a}`] = t;
      T[`r${a}`] = t + SWING;
      T[`a${a}`] = t + SWING + sh.vy / G;
      T[`l${a}`] = t + SWING + sh.t;
      this.throws.push({ a, ...sh, s: t, r: t + SWING, l: t + SWING + sh.t });
      t += SWING + sh.t + RECOVER + 0.35;
    }
    T.s40 = T[`s${this.best}`];
    T.r40 = T[`r${this.best}`];
    T.a40 = T[`a${this.best}`];
    T.l40 = T[`l${this.best}`];
    T.end = t;
    this.T = T;
    this.scenes = SCENES;
    this.graphTitle = 'DOLET PODLE ÚHLU ODHODU (m)';
    const s45 = this.shot(45);
    const flat = (a) => (this.v * this.v * Math.sin(2 * a * DEG)) / G;
    this.vals = {
      v: fmt(this.v, 0), h: fmt(this.h0, 0), vx: fmt(s45.vx, 1), vy: fmt(s45.vy, 1),
      t1: fmt(s45.vy / G, 2), dH: fmt((s45.vy * s45.vy) / (2 * G), 2), H: fmt(this.h0 + (s45.vy * s45.vy) / (2 * G), 2),
      t: fmt(s45.t, 2), d: fmt(s45.d, 1), d30: fmt(this.shot(30).d, 1), d60: fmt(this.shot(60).d, 1),
      best: fmt(this.best, 0), dbest: fmt(this.shot(this.best).d, 1), flat45: fmt(flat(45), 1), flat30: fmt(flat(30), 1),
    };
  }

  /* Hod pod úhlem a (°) z výšky h0: složky rychlosti, doba letu, dolet. */
  shot(a) {
    const vx = this.v * Math.cos(a * DEG);
    const vy = this.v * Math.sin(a * DEG);
    const t = (vy + Math.sqrt(vy * vy + 2 * G * this.h0)) / G;
    return { vx, vy, t, d: vx * t };
  }

  layout(L) {
    this.view = VIEWS[L.name];
  }

  X(p) {
    const v = this.view;
    return [v.ox + p[0] * v.s, v.oy - p[1] * v.s];
  }

  pos(th, tt) {
    return [th.vx * tt, this.h0 + th.vy * tt - (G * tt * tt) / 2];
  }

  /* Stav v čase t: póza vrhače, míček (v ruce, v letu), právě letící hod. */
  state(t) {
    let cur = null;
    for (const th of this.throws) if (t >= th.s) cur = th;
    if (!cur) {
      const st = this.thr.ready();
      return { sk: st.sk, ball: st.grip, held: true, cur: null };
    }
    if (t < cur.r) {
      const st = this.thr.swing((t - cur.s) / SWING);
      return { sk: st.sk, ball: st.grip, held: true, cur };
    }
    if (t < cur.l) {
      const tt = t - cur.r;
      const sk = this.thr.follow(Math.min(1, tt / FOLLOW)).sk;
      return { sk, ball: this.pos(cur, tt), held: false, cur, tt, vy: cur.vy - G * tt };
    }
    const after = t - cur.l;
    if (after < RECOVER) {
      const st = this.thr.recover(after / RECOVER);
      return { sk: st.sk, ball: null, held: false, cur, landed: true };
    }
    const st = this.thr.ready();
    return { sk: st.sk, ball: st.grip, held: true, cur, landed: true };
  }

  paintStageBackground(g, L) {
    const S = L.stage;
    const v = this.view;
    const bg = background('hriste', S.w, S.h, this.dpr, v.oy - 30);
    g.drawImage(bg, S.x, S.y, S.w, S.h);
    // metry na zemi
    g.fillStyle = 'rgba(236,234,224,0.7)';
    g.fillRect(v.ox, v.oy, S.w - v.ox - 6, 2);
    g.font = this.font(600, 11, true);
    g.textAlign = 'center';
    g.textBaseline = 'top';
    for (let m = 0; v.ox + m * v.s < S.w - 4; m++) {
      const x = v.ox + m * v.s;
      g.fillStyle = 'rgba(236,234,224,0.65)';
      g.fillRect(x - 0.6, v.oy, 1.2, m % 2 === 0 ? 8 : 4);
      if (m % 2 === 0) {
        g.fillStyle = 'rgba(236,234,224,0.75)';
        g.fillText(`${m}${m === 12 ? ' m' : ''}`, x, v.oy + 10);
      }
    }
    g.fillStyle = '#e8e4d8';
    g.fillRect(v.ox - 2, v.oy - 3, 4, 9);
  }

  paintStage(ctx, t, show) {
    const st = this.state(t);
    const X = (p) => this.X(p);
    const v = this.view;
    const sf = this.L.sf;
    this.st = st;
    // dokončené hody: celé dráhy a místa dopadu
    if (show.has('paths') || show.has('marks')) {
      for (const th of this.throws) {
        if (t < th.l || (th === st.cur && show.has('trail'))) continue;
        if (show.has('paths')) this.path(ctx, th, th.t, this.colors[th.a], 2, 0.75);
      }
    }
    if (st.cur && show.has('trail')) this.path(ctx, st.cur, Math.min(t - st.cur.r, st.cur.t), this.colors[st.cur.a], 2.6, 1);
    if (show.has('marks')) {
      const done = this.throws.filter((th) => t >= th.l);
      done.forEach((th, i) => {
        const [lx, ly] = X([th.d, 0]);
        ctx.fillStyle = this.colors[th.a];
        ctx.beginPath();
        ctx.arc(lx, ly, 4.5, 0, Math.PI * 2);
        ctx.fill();
        this.tag(ctx, `${th.a}° → ${fmt(th.d, 1)} m`, lx, ly - (18 + 22 * (done.length - 1 - i)) * sf, this.colors[th.a], 'center');
      });
    }
    if (show.has('strobe') && st.cur && !st.held) {
      // stroboskop po 0,1 s: vodorovně stejné rozestupy, svisle se mění
      for (let q = 0; q <= Math.min(st.tt, st.cur.t) + 1e-9; q += 0.1) {
        const [x, y] = X(this.pos(st.cur, q));
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, v.oy);
        ctx.stroke();
        ctx.fillStyle = 'rgba(5,8,14,0.6)';
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffe9b8';
        ctx.beginPath();
        ctx.arc(x, y, 2.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,233,184,0.8)';
        ctx.fillRect(x - 1, v.oy - 4, 2, 8);
      }
    }
    if (show.has('apexDim')) {
      const th = this.throws[0];
      const ta = th.vy / G;
      const top = this.pos(th, ta);
      const [ax, ay] = X(top);
      const [, ry] = X([0, this.h0]);
      this.hline(ctx, X([0, 0])[0], ax + 40, ay, '', 'rgba(126,224,129,0.7)');
      this.hline(ctx, X([0, 0])[0], ax + 40, ry, '', 'rgba(255,210,138,0.6)');
      this.vdim(ctx, ax + 26, ry, ay, `+${this.vals.dH} m`, '#7ee081', 'right');
      this.tag(ctx, `vrchol po ${this.vals.t1} s`, ax, ay - 16 * sf, '#7ee081', 'center');
      this.vdim(ctx, X([0, 0])[0] + 14, v.oy, ry, `${this.vals.h} m`, '#ffd28a', 'right');
    }
    if (show.has('rangeDim')) {
      const th = this.throws[0];
      const y = v.oy - 18 * sf;
      const [x0] = X([0, 0]);
      const [x1] = X([th.d, 0]);
      ctx.save();
      ctx.strokeStyle = '#ffd28a';
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
      this.tag(ctx, `dolet ${this.vals.d} m`, (x0 + x1) / 2, y - 14 * sf, '#ffd28a', 'center');
    }

    drawBody(ctx, st.sk, v, { shadow: 0 });

    // míček (v ruce, v letu)
    if (st.ball) {
      const [bx, by] = X(st.ball);
      const r = Math.max(5, 0.035 * v.s) * sf;
      ctx.save();
      const gr = ctx.createRadialGradient(bx - r * 0.3, by - r * 0.3, 0.5, bx, by, r);
      gr.addColorStop(0, '#fff4c8');
      gr.addColorStop(1, '#d9a530');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(bx, Math.min(by, v.oy - r), r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#3a2a10';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.restore();
    }

    // míření a rozklad rychlosti
    const kv = v.kv * sf;
    const rel = X([0, this.h0]);
    if (show.has('aim')) {
      const a = 45 * DEG;
      this.arrow(ctx, rel[0], rel[1], rel[0] + this.v * kv * Math.cos(a), rel[1] - this.v * kv * Math.sin(a), '#ffd28a', 3);
      this.tag(ctx, `v = ${this.vals.v} m/s, 45°`, rel[0] + this.v * kv * 0.75 + 12, rel[1] - this.v * kv * 0.75, '#ffd28a');
      this.tag(ctx, `odhod ${this.vals.h} m nad zemí`, rel[0] + 14, rel[1] + 18 * sf, '#e8e0c4');
    }
    if (show.has('components')) {
      const th = this.throws[0];
      const [px, py] = rel;
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(px, py - th.vy * kv, th.vx * kv, th.vy * kv);
      ctx.restore();
      this.arrow(ctx, px, py, px + th.vx * kv, py, '#7ee081', 4);
      this.arrow(ctx, px, py, px, py - th.vy * kv, '#6fd6ff', 4);
      this.arrow(ctx, px, py, px + th.vx * kv, py - th.vy * kv, '#ffd28a', 3);
      this.tag(ctx, `vx = ${this.vals.vx} m/s`, px + th.vx * kv * 0.5, py + 16 * sf, '#9df09f', 'center');
      this.tag(ctx, `vy = ${this.vals.vy} m/s`, px - 10, py - th.vy * kv * 0.55, '#9fe3ff', 'right');
      this.tag(ctx, `v = ${this.vals.v} m/s`, px + th.vx * kv + 10, py - th.vy * kv, '#ffd28a');
    }
    if ((show.has('vxArrow') || show.has('vyArrow')) && st.ball && !st.held) {
      const [bx, by] = X(st.ball);
      if (show.has('vxArrow')) {
        this.arrow(ctx, bx, by, bx + st.cur.vx * kv, by, '#7ee081', 4);
        this.tag(ctx, `vx = ${fmt(st.cur.vx, 1)} m/s`, bx + st.cur.vx * kv + 8, by, '#9df09f');
      }
      if (show.has('vyArrow') && Math.abs(st.vy) > 0.15) {
        this.arrow(ctx, bx, by, bx, by - st.vy * kv, '#6fd6ff', 4);
        this.tag(ctx, `vy = ${fmt(Math.abs(st.vy), 1)} m/s ${st.vy > 0 ? '↑' : '↓'}`, bx + 10, by - st.vy * kv * 0.6, '#9fe3ff');
      }
    }
  }

  /* Dráha hodu od odhodu do času tt (s). */
  path(ctx, th, tt, col, w, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = col;
    ctx.lineWidth = w;
    ctx.beginPath();
    const n = 50;
    for (let i = 0; i <= n; i++) {
      const [x, y] = this.X(this.pos(th, (tt * i) / n));
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  paintGraph(ctx, t, show) {
    const dMax = Math.ceil((this.shot(this.bestExact).d + 1) / 2) * 2;
    const { gx, gy } = this.axes(ctx, { x0: 0, x1: 90, yMax: dMax, yStep: this.tall ? 4 : 2, xStep: 15, xLabel: 'úhel odhodu', xFmt: (v) => `${v}°` });
    const bright = show.has('curve') || show.has('flat');
    ctx.save();
    if (show.has('flat')) {
      // start i dopad ve stejné výšce: d = v² · sin 2α / g
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = 'rgba(200,215,235,0.75)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let a = 0; a <= 90; a += 1) {
        const d = (this.v * this.v * Math.sin(2 * a * DEG)) / G;
        if (a) ctx.lineTo(gx(a), gy(d));
        else ctx.moveTo(gx(a), gy(d));
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(200,215,235,0.85)';
      ctx.font = this.font(600, 11);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('na rovině', gx(45), gy((this.v * this.v) / G) + 4);
    }
    ctx.strokeStyle = bright ? '#7ee081' : 'rgba(126,224,129,0.3)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    for (let a = 0; a <= 90; a += 1) {
      const d = this.shot(a).d;
      if (a) ctx.lineTo(gx(a), gy(d));
      else ctx.moveTo(gx(a), gy(d));
    }
    ctx.stroke();
    if (bright) {
      ctx.fillStyle = '#9df09f';
      ctx.font = this.font(600, 11);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`z ${this.vals.h} m`, gx(this.bestExact) + 6, gy(this.shot(this.bestExact).d) - 2);
    }
    ctx.restore();
    if (show.has('dots') || show.has('curve')) {
      for (const th of this.throws) {
        if (t < th.l) continue;
        ctx.fillStyle = this.colors[th.a];
        ctx.strokeStyle = '#05080e';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(gx(th.a), gy(th.d), 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
  }

  paintBoard(ctx, t, show, scene) {
    if (show.has('formula')) {
      this.boardLines(ctx, this.formula(scene.formula));
      return;
    }
    if (!show.has('live')) {
      this.boardNote(ctx, `Míček: ${this.vals.v} m/s, odhod ${this.vals.h} m nad zemí`, 'odpor vzduchu zanedbáme');
      return;
    }
    const st = this.st || this.state(t);
    if (!st.cur || st.held) {
      this.boardRows(ctx, [
        ['úhel odhodu', st.cur ? `${st.cur.a}°` : '45°', '#ffd28a'],
        ['rychlost odhodu', `${this.vals.v} m/s`, '#e8f2ff'],
        ['čas letu', '–', '#ffe9b8'],
        ['vzdálenost · výška', '–', '#e8f2ff'],
      ]);
      return;
    }
    const tt = st.landed ? st.cur.t : st.tt;
    const vy = st.landed ? st.cur.vy - G * st.cur.t : st.vy;
    const p = this.pos(st.cur, tt);
    this.boardRows(ctx, [
      ['vodorovná rychlost vx', `${fmt(st.cur.vx, 1)} m/s`, '#7ee081'],
      ['svislá rychlost vy', `${fmt(Math.abs(vy), 1)} m/s ${vy > 0.05 ? '↑' : vy < -0.05 ? '↓' : ''}`.trim(), '#6fd6ff'],
      ['čas letu', `${fmt(tt, 2)} s`, '#ffe9b8'],
      ['vzdálenost · výška', `${fmt(p[0], 1)} m · ${fmt(Math.max(0, p[1]), 1)} m`, '#ffd28a'],
    ]);
  }

  formula(kind) {
    const v = this.vals;
    const big = (text, col) => this.big(text, col);
    const small = (text) => this.small(text);
    switch (kind) {
      case 'split':
        return [big(`vx = v · cos α = ${v.vx} m/s`, '#7ee081'), big(`vy = v · sin α = ${v.vy} m/s`, '#6fd6ff'), small('pod 45° jsou obě složky stejné')];
      case 'time':
        return [small(`nahoru ${v.t1} s, pak dolů z výšky ${v.H} m`), big(`doba letu t = ${v.t} s`, '#ffe9b8'), small(`dolů padá déle – začínal ${v.h} m nad zemí`)];
      case 'range':
        return [big('d = vx · t', '#e8f2ff'), big(`d = ${v.vx} · ${v.t} = ${v.d} m`, '#ffd28a'), small('vodorovně se míček nezpomaluje')];
      case 'flat':
        return [small('start i dopad ve stejné výšce:'), big('d = v² · sin 2α / g', '#e8f2ff'), small(`nejdál pod 45° (${v.flat45} m); 30° a 60° stejně (${v.flat30} m)`)];
      case 'speed':
        return [small('dolet roste s druhou mocninou rychlosti:'), big('2× rychleji → skoro 4× dál', '#ffd28a'), small('rychlost odhodu je důležitější než úhel')];
      default:
        return [big('vx = v · cos α   vy = v · sin α', '#e8f2ff'), big('d = vx · t', '#ffd28a'), small('vodorovně stálá rychlost, svisle jako vrh vzhůru'), small('na rovině nejdál 45°, z výšky o něco méně')];
    }
  }
}
