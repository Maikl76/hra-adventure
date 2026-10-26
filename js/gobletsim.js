/*
 * Proč taková pravidla (simulace goblet dřepu, Vojenská tělovýchova – tělocvična): kresba
 * k aktivitě „gobletsim“.
 *
 * Postava z js/postava.js prochází přesně body, které počítá simulace v ui.js (kotník, koleno,
 * kyčel, rameno, ruce s kettlebellem; hlava tak, aby obličej byl tam, kde ho kontroluje pravidlo
 * „hlava za špičkami“). Délky segmentů a délka boty jsou stejné jako v simulaci, takže to, co
 * hráč vidí, sedí s tím, co se kontroluje. Výpočty (těžiště, momenty, pravidla) dělá ui.js
 * beze změny. Plátno 600 × 440 (logicky).
 */
import { makeBody, pose, drawBody } from './postava.js?v=0.33';
import { rrect, fmt, setupCanvas, label, dash, dim, comMark, background } from './kresba.js?v=0.33';

const W = 600;
const H = 440;
const VIEW = { ox: 312, oy: 416, s: 270 };   // svět → plátno (x = 0 pata)
const DEG = Math.PI / 180;
const angUp = (v) => Math.atan2(v[0], v[1]) / DEG;
const angDown = (v) => Math.atan2(v[0], -v[1]) / DEG;

export class GobletSimScene {
  /* geo: { TOE, ANK, SHANK, THIGH, TRUNK, bench: { x0, x1, h } } – rozměry simulace v metrech */
  constructor(canvas, geo) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.geo = geo;
    this.body = makeBody({
      style: 'sport', height: 1.75, mass: 70,
      lengths: { shank: geo.SHANK, thigh: geo.THIGH, trunk: geo.TRUNK },
      footLength: geo.TOE,
      colors: { jacket: '#5c6a3a', shorts: '#26282a', shoe: '#3a3b38', sole: '#1e1f1d', accent: '#8a9a52', socks: '#d9d6cc' },
    });
    this.p = null;
    this.cv = setupCanvas(canvas, W, H, (changed) => {
      if (changed) this.bg = null;
      this.render();
    });
  }

  destroy() {
    this.cv.destroy();
  }

  /* Póza ze simulace: { knee, hip, sh, head, hands, com, faceX, ok…, kb, mk, mh } (metry). */
  set(p) {
    this.p = p;
    this.render();
  }

  /* Úhly postavy z bodů simulace; krk tak, aby špička nosu byla tam, kde simulace kontroluje obličej. */
  figure(p) {
    const g = this.geo;
    const shin = angUp([p.knee[0] - g.ANK[0], p.knee[1] - g.ANK[1]]);
    const thigh = angDown([p.knee[0] - p.hip[0], p.knee[1] - p.hip[1]]);
    const trunk = angUp([p.sh[0] - p.hip[0], p.sh[1] - p.hip[1]]);
    const base = { trunk, bend: 0, thigh, shin, foot: 0, grip: 'fist' };
    const place = { hip: p.hip };
    const noseX = (neck) => {
      const head = 4 - (trunk + neck);      // hlava skoro vzpřímeně, pohled dopředu
      const sk = pose(this.body, { ...base, neck, head }, place);
      return sk.head[0] + sk.k * (0.115 * Math.cos(sk.headDeg * DEG) - 0.011 * Math.sin(sk.headDeg * DEG));   // špička nosu
    };
    let lo = -40;
    let hi = 70;
    const target = p.faceX;
    const fLo = noseX(lo) - target;
    const fHi = noseX(hi) - target;
    let neck = 0;
    if (fLo * fHi > 0) neck = Math.abs(fLo) < Math.abs(fHi) ? lo : hi;
    else {
      for (let i = 0; i < 30; i++) {
        const mid = (lo + hi) / 2;
        if ((noseX(mid) - target) * fLo > 0) lo = mid;
        else hi = mid;
      }
      neck = (lo + hi) / 2;
    }
    return pose(this.body, { ...base, neck, head: 4 - (trunk + neck), reach: p.hands }, place);
  }

  render() {
    const ctx = this.ctx;
    const dpr = this.cv ? this.cv.dpr : 1;
    const ts = this.cv ? this.cv.ts : 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!this.bg) this.bg = background('telocvicna', W, H, dpr, 366);
    ctx.drawImage(this.bg, 0, 0, W, H);
    const p = this.p;
    if (!p) return;
    const g = this.geo;
    const X = (q) => [VIEW.ox + q[0] * VIEW.s, VIEW.oy - q[1] * VIEW.s];
    const s = VIEW.s;

    // lavička ve výšce kolene za postavou
    const [bx0, by] = X([g.bench.x0, g.bench.h]);
    const [bx1] = X([g.bench.x1, 0]);
    ctx.save();
    const wood = ctx.createLinearGradient(0, by, 0, by + 12);
    wood.addColorStop(0, '#9a7448');
    wood.addColorStop(1, '#5e4226');
    ctx.fillStyle = wood;
    rrect(ctx, bx0, by, bx1 - bx0, 12, 3);
    ctx.fill();
    ctx.strokeStyle = '#2d1f10';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#4a3420';
    for (const lx of [bx0 + 10, bx1 - 20]) ctx.fillRect(lx, by + 12, 10, VIEW.oy - by - 12);
    ctx.restore();
    label(ctx, 'lavička – výška kolene', bx1 + 6, VIEW.oy + 12, '#d8cfae', { align: 'right', ts, W, size: 11 });   // pod lavičkou, postava ho nezakryje

    const sk = this.figure(p);
    drawBody(ctx, sk, VIEW, {
      shadow: 0,
      hooks: { front: p.kb ? () => this.paintKettlebell(ctx, X, p.hands, s) : null },
    });

    // svislice špiček, opěrná plocha, těžiště a jeho průmět
    const toeX = X([g.TOE, 0])[0];
    const okLine = p.okKnee && p.okHead;
    ctx.save();
    ctx.strokeStyle = okLine ? '#9fd07a' : '#ff8a66';
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 5]);
    ctx.beginPath();
    ctx.moveTo(toeX, VIEW.oy);
    ctx.lineTo(toeX, 16);
    ctx.stroke();
    ctx.restore();
    label(ctx, 'svislice špiček', toeX + 6, 24, okLine ? '#9fd07a' : '#ff9a7a', { align: 'left', ts, W, size: 11 });
    ctx.save();
    ctx.strokeStyle = p.okCom ? '#9fd07a' : '#ff8a66';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(X([0, 0])[0], VIEW.oy + 7);
    ctx.lineTo(toeX, VIEW.oy + 7);
    ctx.stroke();
    ctx.restore();
    const [cx, cy] = X(p.com);
    dash(ctx, cx, cy, cx, VIEW.oy, 'rgba(255,210,138,0.9)', 1.5);
    comMark(ctx, cx, cy, 7);
    ctx.save();
    ctx.fillStyle = p.okCom ? '#9fd07a' : '#ff8a66';
    ctx.beginPath();
    ctx.arc(cx, VIEW.oy, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    label(ctx, 'těžiště', cx - 10, cy - 16, '#ffd28a', { align: 'right', ts, W, size: 11 });

    // ramena momentů: vodorovně od svislice těžiště ke kolenu a ke kyčli
    const [kx, ky] = X(p.knee);
    const [hx, hy] = X(p.hip);
    dim(ctx, cx, kx, ky + 26, '#ffb35c', `koleno ${fmt(Math.abs(p.knee[0] - p.com[0]) * 100)} cm`, { ts, W, size: 11 });
    dim(ctx, cx, hx, hy - 34, '#e8c48a', `kyčel ${fmt(Math.abs(p.hip[0] - p.com[0]) * 100)} cm`, { ts, W, size: 11 });
    // koleno a hlava: zvýraznění při porušení pravidla
    ctx.save();
    ctx.fillStyle = p.okKnee ? '#ffd28a' : '#ff8a66';
    ctx.strokeStyle = '#1a1a16';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(kx, ky, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (!p.okHead) {
      const [fx, fy] = X([p.faceX, sk.head[1] - 0.01]);
      ctx.strokeStyle = '#ff8a66';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(fx - 0.06 * s, fy, 0.11 * s, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    this.canvas.setAttribute('aria-label', `Goblet dřep: koleno ${p.okKnee ? 'za' : 'před'} špičkou, hlava ${p.okHead ? 'za' : 'před'} špičkou, těžiště ${p.okCom ? 'nad chodidlem' : 'mimo chodidlo'}.`);
  }

  paintKettlebell(ctx, X, hands, s) {
    const [hx, hy] = X(hands);
    const r = 0.068 * s;
    const bx = hx + 0.01 * s;
    const byy = hy + 0.085 * s;
    ctx.save();
    // ucho drží obě ruce, koule visí pod nimi
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 0.022 * s;
    ctx.beginPath();
    ctx.arc(bx, byy - r * 0.9, r * 0.62, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
    const gr = ctx.createRadialGradient(bx - r * 0.35, byy - r * 0.4, r * 0.1, bx, byy, r);
    gr.addColorStop(0, '#6a6a6a');
    gr.addColorStop(0.6, '#2c2c2c');
    gr.addColorStop(1, '#141414');
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(bx, byy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0a0a0a';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#d8c070';
    ctx.font = `700 ${Math.round(0.03 * s)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('5', bx, byy + r * 0.25);
    ctx.restore();
  }
}
