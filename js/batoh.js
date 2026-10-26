/*
 * Balení batohu (Vojenská tělovýchova – výstrojní sklad): kresba k aktivitě „pack“.
 *
 * Vpravo voják z js/postava.js ve skutečném měřítku s batohem v řezu: věci jsou vidět v částech
 * batohu, značky ukazují těžiště vojáka, těžiště batohu a společné těžiště se svislicí k zemi.
 * Voják se předkloní o úhel, který vychází z výpočtu (předklon = atan(posun / výška těžiště)),
 * takže je vidět, proč špatně sbalený batoh nutí chodit v předklonu. Vlevo je zvětšený řez
 * batohem – do jeho tří částí se věci přetahují (ve skutečném měřítku by byly moc úzké). Výpočet
 * posunu dělá ui.js stejně jako dřív. Plátno 600 × 440 (logicky).
 */
import { makeBody, pose, drawBody, centerOfMass } from './postava.js?v=0.33';
import { rrect, fmt, setupCanvas, label, dash, comMark, background } from './kresba.js?v=0.33';

const W = 600;
const H = 440;
const VIEW = { ox: 478, oy: 418, s: 222 };          // svět → plátno (x = 0 kotník)
const STAND = { trunk: 2, thigh: 0, shin: 2, neck: 0, head: 0, uarm: 4, farm: 10, hand: 12, grip: 'open' };
const DIAG = { x: 18, bottom: 356, colW: 82, gap: 8, slotH: 44, pad: 6 };   // zvětšený řez batohem
const COLORS = {
  voda: '#3d6f9e', stan: '#6e7c3c', jidlo: '#8c6a3a', spacak: '#3f5a3a', obleceni: '#8a8460',
  varic: '#6b6f74', lopatka: '#596066', lekarnicka: '#d6cfbd',
};
const DEG = Math.PI / 180;

/* Barva věci ztlumená látkou batohu (na zádech jsou věci jen tušené). */
function muted(hex, f = 0.55) {
  const a = parseInt(hex.slice(1), 16);
  const b = 0x4a5230;
  const mix = (sh) => Math.round(((a >> sh) & 255) * (1 - f) + ((b >> sh) & 255) * f);
  return `rgb(${mix(16)},${mix(8)},${mix(0)})`;
}

export class PackScene {
  /* opts: { bodyKg, packKg, packCm, comHeightCm, slots: [{id, name, cm, cap}], items, reducedMotion } */
  constructor(canvas, opts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.opts = opts;
    this.body = makeBody({ style: 'uniforma', height: 1.75, mass: opts.bodyKg || 70 });
    this.state = { place: {}, selected: null, shift: 0, d: 0, m: opts.packKg || 0 };
    this.lean = 0;          // zobrazený předklon (plynule doběhne k vypočtenému)
    this.target = 0;
    this.hover = null;
    this.raf = 0;
    this.frame = this.frame.bind(this);
    // sloupce řezu: zleva vnější kapsa → u zad (podle vzdálenosti od těžiště vojáka)
    this.cols = [...opts.slots].sort((a, b) => b.cm - a.cm).map((sl, i) => {
      const x = DIAG.x + i * (DIAG.colW + DIAG.gap);
      const h = sl.cap * DIAG.slotH + DIAG.pad * 2;
      return { sl, x, y: DIAG.bottom - h, w: DIAG.colW, h };
    });
    this.cv = setupCanvas(canvas, W, H, (changed) => {
      if (changed) this.bg = null;
      this.render();
    });
    canvas.__pack = this;   // pro testy
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.cv.destroy();
  }

  /* Stav z ui.js: kde je která věc, vybraná věc, výsledek výpočtu (shift, d, m). */
  set(st) {
    Object.assign(this.state, st);
    const h = (this.opts.comHeightCm || 100) / 100;
    this.target = Math.atan((this.state.shift || 0) / 100 / h) / DEG;
    if (this.opts.reducedMotion) this.lean = this.target;
    this.loop();
  }

  setHover(slotId) {
    if (slotId === this.hover) return;
    this.hover = slotId;
    this.loop();
  }

  loop() {
    if (!this.raf) this.raf = requestAnimationFrame(this.frame);
  }

  frame() {
    this.raf = 0;
    const d = this.target - this.lean;
    this.lean += Math.abs(d) < 0.02 ? d : d * 0.18;
    this.render();
    if (this.lean !== this.target) this.loop();
  }

  /* Která část batohu (id) je pod bodem okna, nebo null. */
  slotAt(clientX, clientY) {
    const [x, y] = this.toLocal(clientX, clientY);
    const c = this.cols.find((col) => x >= col.x - 6 && x <= col.x + col.w + 6 && y >= col.y - 30 && y <= DIAG.bottom + 8);
    return c ? c.sl.id : null;
  }

  /* Která zabalená věc (id) je pod bodem okna, nebo null. */
  itemAt(clientX, clientY) {
    const [x, y] = this.toLocal(clientX, clientY);
    const hit = (this.blocks || []).find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
    return hit ? hit.id : null;
  }

  toLocal(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    return [((clientX - r.left) / r.width) * W, ((clientY - r.top) / r.height) * H];
  }

  /* ---------- Kreslení ---------- */

  render() {
    const ctx = this.ctx;
    const dpr = this.cv ? this.cv.dpr : 1;
    const ts = this.cv ? this.cv.ts : 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!this.bg) this.bg = background('sklad', W, H, dpr, 372);
    ctx.drawImage(this.bg, 0, 0, W, H);
    const X = (p) => [VIEW.ox + p[0] * VIEW.s, VIEW.oy - p[1] * VIEW.s];

    // předklon: celé tělo se nakloní kolem kotníku (bérec, stehno a trup o stejný úhel)
    const L = this.lean;
    const p = { ...STAND, shin: STAND.shin + L, thigh: STAND.thigh - L, trunk: STAND.trunk + L };
    const sk = pose(this.body, p, { ground: 0, x: 0 });
    const packPts = this.packShape(sk);
    drawBody(ctx, sk, VIEW, {
      shadow: 0,
      hooks: {
        between: () => this.paintPack(ctx, X, sk, packPts),
        front: () => this.paintStraps(ctx, X, sk),
      },
    });

    // těžiště: voják, batoh, společné (svislice k zemi)
    const s = this.state;
    const comBody = centerOfMass(sk);
    const back = [-Math.cos(sk.p.trunk * DEG), Math.sin(sk.p.trunk * DEG)];   // směr dozadu kolmo na trup
    const packCom = [comBody[0] + back[0] * (s.d / 100), comBody[1] + back[1] * (s.d / 100) + 0.18];
    const total = (this.opts.bodyKg || 70) + s.m;
    const common = [
      (comBody[0] * (this.opts.bodyKg || 70) + packCom[0] * s.m) / total,
      (comBody[1] * (this.opts.bodyKg || 70) + packCom[1] * s.m) / total,
    ];
    const [cx, cy] = X(common);
    dash(ctx, cx, cy, cx, VIEW.oy + 6, 'rgba(255,210,138,0.85)', 1.5);
    comMark(ctx, ...X(comBody), 6);
    if (s.m > 0) {
      const [px, py] = X(packCom);
      ctx.save();
      ctx.strokeStyle = '#efe8d0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.moveTo(px - 4, py - 4);
      ctx.lineTo(px + 4, py + 4);
      ctx.moveTo(px + 4, py - 4);
      ctx.lineTo(px - 4, py + 4);
      ctx.stroke();
      ctx.restore();
    }
    ctx.save();
    ctx.fillStyle = '#ffd28a';
    ctx.strokeStyle = '#1a1a16';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 8);
    ctx.lineTo(cx + 7, cy + 4);
    ctx.lineTo(cx - 7, cy + 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    // chodidlo = opěrná plocha; průmět společného těžiště
    const heel = X(sk.footPt(sk.legN, [-0.06, -0.074]))[0];
    const toe = X(sk.footPt(sk.legN, [0.21, -0.074]))[0];
    const inside = cx >= heel - 1 && cx <= toe + 1;
    ctx.save();
    ctx.strokeStyle = inside ? '#9fd07a' : '#ff8a66';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(heel, VIEW.oy + 5);
    ctx.lineTo(toe, VIEW.oy + 5);
    ctx.stroke();
    ctx.restore();
    // úhel předklonu u kotníku
    const ank = X(sk.legN.ankle);
    if (L > 0.05) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,210,138,0.9)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(ank[0], ank[1]);
      ctx.lineTo(ank[0], ank[1] - 130);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(ank[0], ank[1], 110, -Math.PI / 2, -Math.PI / 2 + L * DEG);
      ctx.stroke();
      ctx.restore();
      label(ctx, `předklon ${fmt(L, 1)}°`, ank[0] + 10, ank[1] - 122, '#ffd28a', { align: 'left', ts, W });
    }
    const lc = X([comBody[0], comBody[1]]);
    label(ctx, 'těžiště vojáka', lc[0] + 12, lc[1] + 14, '#efe8d0', { align: 'left', ts, W, size: 11 });
    label(ctx, 'společné těžiště', cx + 12, cy - 16, '#ffd28a', { align: 'left', ts, W, size: 11 });

    this.paintDiagram(ctx, packPts, X, ts);
    this.canvas.setAttribute('aria-label', `Voják s batohem. Společné těžiště se posunulo o ${fmt(s.shift || 0, 1)} cm dozadu, předklon ${fmt(L, 1)} stupně.`);
  }

  /* Obrys batohu v rámu trupu: u (díl délky trupu) × v (m dozadu od osy trupu). */
  packShape(sk) {
    const v0 = -0.11;
    const v1 = -0.45;
    const u0 = 0.2;
    const u1 = 1.12;
    const corner = (u, v) => sk.T(u, v);
    return {
      v0, v1, u0, u1,
      outline: [corner(u0 + 0.04, v0), corner(u0, v0 - 0.04), corner(u0, v1 + 0.05), corner(u0 + 0.05, v1), corner(u1 - 0.08, v1 + 0.01),
        corner(u1, v1 + 0.06), corner(u1 + 0.02, (v0 + v1) / 2), corner(u1, v0 - 0.02), corner(u1 - 0.1, v0)],
      at: corner,
    };
  }

  paintPack(ctx, X, sk, pk) {
    const s = this.state;
    const pts = pk.outline.map(X);
    ctx.save();
    ctx.beginPath();
    pts.forEach((pt, i) => (i ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1])));
    ctx.closePath();
    const g = ctx.createLinearGradient(...X(pk.at(0.6, pk.v1)), ...X(pk.at(0.6, pk.v0)));
    g.addColorStop(0, '#3f4527');
    g.addColorStop(1, '#5d6638');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = '#15170d';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.clip();
    // části batohu v řezu: přepážky a věci (malé obdélníky barvou věci)
    const sorted = [...this.opts.slots].sort((a, b) => a.cm - b.cm);
    const edges = [];
    for (let i = 0; i < sorted.length - 1; i++) edges.push(-(sorted[i].cm + sorted[i + 1].cm) / 200);
    ctx.strokeStyle = 'rgba(15,17,10,0.75)';
    ctx.lineWidth = 1.5;
    for (const v of edges) {
      const a = X(pk.at(pk.u0, v));
      const b = X(pk.at(pk.u1 - 0.05, v));
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
    }
    // věci odspodu nahoru v každé části
    const lim = [pk.v0, ...edges, pk.v1];
    sorted.forEach((sl, i) => {
      const items = this.opts.items.filter((it) => s.place[it.id] === sl.id);
      const vA = lim[i] - 0.012;
      const vB = lim[i + 1] + 0.012;
      let u = pk.u0 + 0.03;
      const du = (pk.u1 - pk.u0 - 0.12) / Math.max(sl.cap, 1);
      for (const it of items) {
        const q = [pk.at(u, vA), pk.at(u, vB), pk.at(u + du - 0.015, vB), pk.at(u + du - 0.015, vA)].map(X);
        ctx.fillStyle = muted(COLORS[it.id] || '#7a7350');
        ctx.beginPath();
        q.forEach((pt, j) => (j ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1])));
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.45)';
        ctx.lineWidth = 1;
        ctx.stroke();
        u += du;
      }
    });
    ctx.restore();
    // víko a švy
    ctx.save();
    ctx.strokeStyle = 'rgba(10,12,6,0.6)';
    ctx.lineWidth = 1.2;
    const l1 = X(pk.at(pk.u1 - 0.12, pk.v0 - 0.01));
    const l2 = X(pk.at(pk.u1 - 0.12, pk.v1 + 0.02));
    ctx.beginPath();
    ctx.moveTo(l1[0], l1[1]);
    ctx.lineTo(l2[0], l2[1]);
    ctx.stroke();
    ctx.restore();
  }

  paintStraps(ctx, X, sk) {
    // ramenní popruh přes rameno dopředu a bederní pás
    const strap = [sk.T(1.02, -0.12), sk.T(1.08, -0.02), sk.T(1.0, 0.09), sk.T(0.78, 0.13), sk.T(0.6, 0.1)].map(X);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#15170d';
    ctx.lineWidth = 0.05 * VIEW.s + 2;
    ctx.beginPath();
    strap.forEach((pt, i) => (i ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1])));
    ctx.stroke();
    ctx.strokeStyle = '#4a5230';
    ctx.lineWidth = 0.05 * VIEW.s;
    ctx.stroke();
    const belt = [sk.T(0.2, -0.13), sk.T(0.2, 0.0), sk.T(0.21, 0.11)].map(X);
    ctx.strokeStyle = '#15170d';
    ctx.lineWidth = 0.045 * VIEW.s + 2;
    ctx.beginPath();
    belt.forEach((pt, i) => (i ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1])));
    ctx.stroke();
    ctx.strokeStyle = '#4a5230';
    ctx.lineWidth = 0.045 * VIEW.s;
    ctx.stroke();
    ctx.restore();
  }

  /* Zvětšený řez batohem s částmi (cíle pro přetahování) a věcmi s názvem a hmotností. */
  paintDiagram(ctx, pk, X, ts) {
    const s = this.state;
    const top = Math.min(...this.cols.map((c) => c.y));
    const left = DIAG.x - 10;
    const right = this.cols[this.cols.length - 1].x + DIAG.colW + 10;
    // průmět „lupy“ k batohu na zádech
    const a = X(pk.at(pk.u1, pk.v1));
    const b = X(pk.at(pk.u0, pk.v1));
    ctx.save();
    ctx.fillStyle = 'rgba(255,230,170,0.06)';
    ctx.strokeStyle = 'rgba(255,230,170,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(right, top - 34);
    ctx.lineTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.lineTo(right, DIAG.bottom + 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // plátno řezu
    ctx.fillStyle = 'rgba(16,18,10,0.82)';
    rrect(ctx, left, top - 40, right - left, DIAG.bottom - top + 52, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,230,170,0.35)';
    ctx.stroke();
    ctx.restore();
    label(ctx, 'batoh v řezu (cm = vzdálenost za těžištěm vojáka)', (left + right) / 2, top - 52, '#d8cfae', { ts, W, size: 11 });
    this.blocks = [];
    for (const c of this.cols) {
      const items = this.opts.items.filter((it) => s.place[it.id] === c.sl.id);
      const full = items.length >= c.sl.cap;
      const hot = this.hover === c.sl.id;
      ctx.save();
      ctx.fillStyle = hot ? 'rgba(160,145,90,0.42)' : 'rgba(120,110,70,0.22)';
      ctx.strokeStyle = hot ? '#ffd28a' : full ? '#6b6250' : '#a89a64';
      ctx.lineWidth = hot ? 2 : 1.4;
      ctx.setLineDash(full || hot ? [] : [4, 3]);
      rrect(ctx, c.x, c.y, c.w, c.h, 6);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      // název a vzdálenost nad sloupcem
      ctx.save();
      ctx.fillStyle = '#e8dfbf';
      ctx.font = `600 ${Math.round(11 * Math.min(ts, 1.3))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(c.sl.name, c.x + c.w / 2, c.y - 15);
      ctx.fillStyle = '#ffd28a';
      ctx.font = `600 ${Math.round(10.5 * Math.min(ts, 1.3))}px system-ui, sans-serif`;
      ctx.fillText(`${c.sl.cm} cm`, c.x + c.w / 2, c.y - 2);
      ctx.restore();
      // věci odspodu
      items.forEach((it, i) => {
        const bh = DIAG.slotH - 4;
        const by = c.y + c.h - DIAG.pad - (i + 1) * DIAG.slotH + 2;
        const bx = c.x + 5;
        const bw = c.w - 10;
        const sel = s.selected === it.id;
        ctx.save();
        ctx.fillStyle = COLORS[it.id] || '#7a7350';
        rrect(ctx, bx, by, bw, bh, 5);
        ctx.fill();
        ctx.strokeStyle = sel ? '#ffd28a' : 'rgba(0,0,0,0.55)';
        ctx.lineWidth = sel ? 2.5 : 1.2;
        ctx.stroke();
        const lightItem = it.id === 'lekarnicka';
        if (lightItem) {
          ctx.fillStyle = '#b8352c';
          ctx.fillRect(bx + bw - 16, by + 6, 10, 3);
          ctx.fillRect(bx + bw - 12.5, by + 2.5, 3, 10);
        }
        ctx.fillStyle = lightItem ? '#2a2418' : '#f4ecd2';
        ctx.font = `600 ${Math.round(11 * Math.min(ts, 1.25))}px system-ui, sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(it.name.length > 9 ? (it.short || it.name) : it.name, bx + 6, by + bh * 0.36);
        ctx.font = `500 ${Math.round(10 * Math.min(ts, 1.25))}px system-ui, sans-serif`;
        ctx.fillText(`${it.kg} kg`, bx + 6, by + bh * 0.72);
        ctx.restore();
        this.blocks.push({ id: it.id, x: bx, y: by, w: bw, h: bh });
      });
    }
    // šipka „blíž k zádům“ pod řezem
    ctx.save();
    ctx.fillStyle = '#a89c7c';
    ctx.font = `500 ${Math.round(10 * Math.min(ts, 1.3))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('dál od zad  ←  →  blíž k zádům', (left + right) / 2, DIAG.bottom + 3);
    ctx.restore();
  }
}
