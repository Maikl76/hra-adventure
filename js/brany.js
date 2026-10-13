/*
 * Kresba bran v úvodním průletu (jen vzhled – pohyb kamery, tempo a titulky řídí ui.js).
 *
 * Brána je zeď s otvorem v „jednotkách brány“: otvor je vysoký 640 (y od −320 do +320), střed 0,0.
 * Každá brána má materiál (kámen, cihla, dřevo, ocel), zdivo, klenbu z klenáků se svorníkem
 * s římskou číslicí, nárožní kameny, tloušťku zdi (ostění) prosvícenou světlem z konce chodby
 * a dvě lampy s mihotavým plamenem. Cesty (Path2D) se připraví jednou, při kreslení se jen
 * přenásobí transformací – je to rychlé i na slabších noteboocích.
 */
(function (global) {
  'use strict';

  /* Tvary otvorů (stejné jako dřív): půlkruh, lomený oblouk, pravoúhlé dveře, úzký půlkruh. */
  const SHAPES = [
    { kind: 'round', w: 180, spring: -140 },
    { kind: 'pointed', w: 170, spring: -120, ctrl: -250 },
    { kind: 'rect', w: 160, top: -300 },
    { kind: 'round', w: 140, spring: -180 },
  ];

  /* Materiály: barva zdi, klenby, spár; cihla má menší kvádry; dřevo a ocel mají vlastní ozdoby. */
  const MATERIALS = {
    stone: { wall: '#140f0b', band: '#231c14', quoin: '#1f1913', joint: '#070504', hi: 'rgba(255, 225, 170, 0.07)', row: 86, col: 150 },
    brick: { wall: '#170e09', band: '#26170f', quoin: '#22140d', joint: '#080403', hi: 'rgba(255, 190, 140, 0.07)', row: 40, col: 92 },
    wood: { wall: '#130f0a', band: '#28190e', quoin: '#24170c', joint: '#070503', hi: 'rgba(255, 210, 150, 0.06)', row: 86, col: 150, grain: true },
    metal: { wall: '#101011', band: '#1c1e21', quoin: '#18191b', joint: '#060607', hi: 'rgba(210, 225, 255, 0.07)', row: 86, col: 150, rivets: true },
  };
  const ORDER = ['stone', 'brick', 'stone', 'wood', 'metal', 'stone', 'brick', 'metal', 'stone'];

  const BAND = 64;        // šířka klenby / ostění kolem otvoru
  const WALL_R = 4000;    // zeď sahá daleko za okraj obrazovky

  /* Jemná zrnitost kamene: jedna dlaždice s náhodnými skvrnami, opakuje se po celé zdi. */
  let noise = null;
  function noisePattern(ctx) {
    if (noise) return noise;
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 2600; i++) {
      const light = rnd() < 0.5;
      g.fillStyle = light ? `rgba(255, 230, 190, ${0.01 + rnd() * 0.035})` : `rgba(0, 0, 0, ${0.06 + rnd() * 0.14})`;
      const r = 0.6 + rnd() * 2.6;
      g.beginPath();
      g.arc(rnd() * 256, rnd() * 256, r, 0, Math.PI * 2);
      g.fill();
    }
    noise = ctx.createPattern(c, 'repeat');
    return noise;
  }

  /* Body obrysu otvoru (po směru: levý dolní roh → nahoru → oblouk → dolů) a seznam bodů oblouku. */
  function outline(shape) {
    const pts = [];
    const arc = [];
    const { w } = shape;
    if (shape.kind === 'rect') {
      pts.push([-w, 320], [-w, shape.top], [w, shape.top], [w, 320]);
      return { pts, arc, top: shape.top, spring: shape.top };
    }
    pts.push([-w, 320]);
    if (shape.kind === 'round') {
      for (let i = 0; i <= 36; i++) {
        const a = Math.PI + (i / 36) * Math.PI;
        const p = [w * Math.cos(a), shape.spring + w * Math.sin(a)];
        pts.push(p);
        arc.push(p);
      }
    } else {
      // lomený oblouk ze dvou kvadratických křivek (jako původní tvar)
      const q = (p0, c, p1, t) => [
        (1 - t) * (1 - t) * p0[0] + 2 * (1 - t) * t * c[0] + t * t * p1[0],
        (1 - t) * (1 - t) * p0[1] + 2 * (1 - t) * t * c[1] + t * t * p1[1],
      ];
      const L = [-w, shape.spring];
      const T = [0, -320];
      const R = [w, shape.spring];
      for (let i = 0; i <= 18; i++) { const p = q(L, [-w, shape.ctrl], T, i / 18); pts.push(p); arc.push(p); }
      for (let i = 1; i <= 18; i++) { const p = q(T, [w, shape.ctrl], R, i / 18); pts.push(p); arc.push(p); }
    }
    pts.push([w, 320]);
    return { pts, arc, top: -320, spring: shape.spring };
  }

  const pathFrom = (pts, close = true) => {
    const p = new Path2D();
    pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
    if (close) p.closePath();
    return p;
  };

  /* Vnější normála v bodě oblouku (od středu otvoru ven). */
  function normals(arc) {
    return arc.map((p, i) => {
      const a = arc[Math.max(0, i - 1)];
      const b = arc[Math.min(arc.length - 1, i + 1)];
      let nx = b[1] - a[1];
      let ny = -(b[0] - a[0]);
      const len = Math.hypot(nx, ny) || 1;
      nx /= len; ny /= len;
      if (nx * p[0] + ny * (p[1] - 100) < 0) { nx = -nx; ny = -ny; }   // ven od středu
      return [nx, ny];
    });
  }

  /* Připraví jednu bránu (cesty se počítají jen jednou). */
  function create(index) {
    const shape = SHAPES[index % SHAPES.length];
    const mat = MATERIALS[ORDER[index % ORDER.length]];
    const o = outline(shape);
    const opening = pathFrom(o.pts);
    const wall = new Path2D(`M${-WALL_R},${-WALL_R} H${WALL_R} V${WALL_R} H${-WALL_R} Z`);
    wall.addPath(opening);

    // zdivo: řady kvádrů s vystřídanými spárami (pod klenbou je zakryje)
    const masonry = new Path2D();
    for (let y = 320, r = 0; y > -900; y -= mat.row, r++) {
      masonry.moveTo(-1400, y);
      masonry.lineTo(1400, y);
      const off = (r % 2) * (mat.col / 2);
      for (let x = -1400 + off; x < 1400; x += mat.col) {
        masonry.moveTo(x, y);
        masonry.lineTo(x, y - mat.row);
      }
    }

    // klenba / překlad a nárožní kameny kolem otvoru
    const band = new Path2D();
    const bandJoints = new Path2D();
    let keystone;
    const { w } = shape;
    if (o.arc.length) {
      const n = normals(o.arc);
      const outer = o.arc.map((p, i) => [p[0] + n[i][0] * BAND, p[1] + n[i][1] * BAND]);
      band.addPath(pathFrom(o.arc.concat(outer.slice().reverse())));
      // dělení na klenáky (lichý počet, svorník uprostřed je širší)
      const stones = 9;
      const step = (o.arc.length - 1) / stones;
      for (let s = 1; s < stones; s++) {
        const i = Math.round(s * step);
        bandJoints.moveTo(o.arc[i][0], o.arc[i][1]);
        bandJoints.lineTo(outer[i][0], outer[i][1]);
      }
      const top = o.arc[Math.round((o.arc.length - 1) / 2)];
      keystone = { x: top[0], y: top[1] - BAND / 2 - 6, w: 70, h: BAND + 24 };
    } else {
      band.rect(-w - BAND, shape.top - BAND - 20, 2 * (w + BAND), BAND + 20);   // překlad
      keystone = { x: 0, y: shape.top - BAND / 2 - 10, w: 120, h: BAND + 4 };
    }
    // nárožní kameny po stranách (střídavě dlouhé a krátké)
    const quoins = new Path2D();
    for (let y = 320, k = 0; y > o.spring + 4; y -= 80, k++) {
      const h = Math.min(80, y - o.spring);
      const len = k % 2 ? 44 : 74;
      quoins.rect(-w - len, y - h, len, h);
      quoins.rect(w, y - h, len, h);
    }

    // ozdoby materiálu: letokruhy dřeva, nýty oceli
    const extra = new Path2D();
    if (mat.grain) {
      for (let x = -w - 70; x <= w + 70; x += 18) {
        if (Math.abs(x) < w) continue;
        extra.moveTo(x, 320);
        extra.bezierCurveTo(x + 4, 150, x - 4, 0, x + 2, o.spring);
      }
    }
    if (mat.rivets) {
      for (let y = 300; y > o.spring; y -= 40) {
        extra.moveTo(-w - 22 + 4, y); extra.arc(-w - 22, y, 4, 0, Math.PI * 2);
        extra.moveTo(w + 22 + 4, y); extra.arc(w + 22, y, 4, 0, Math.PI * 2);
      }
    }

    return {
      shape, mat, opening, wall, masonry, band, bandJoints, quoins, extra, keystone,
      lamps: [[-w - 150, -40], [w + 150, -40]],
      phase: index * 1.9,
    };
  }

  /**
   * Nakreslí bránu.
   * v: { alpha, s (měřítko na obrazovce), x, y (střed otvoru na obrazovce),
   *      s2, x2, y2 (zadní hrana otvoru – o tloušťku zdi dál), near (blízkost 0–1+),
 *      light (0–1, jak blízko je světlo), t, numeral }
   */
  function draw(ctx, g, v) {
    const { mat } = g;
    const M = (s, x, y) => new DOMMatrix([s, 0, 0, s, x, y]);
    const near = M(v.s, v.x, v.y);
    const far = M(v.s2, v.x2, v.y2);

    ctx.save();
    ctx.globalAlpha = v.alpha;
    if (v.clip) {                       // vidět jen otvorem bližší brány
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clip(v.clip);
    }

    // ostění (tloušťka zdi): plocha mezi přední a zadní hranou otvoru
    const reveal = new Path2D();
    reveal.addPath(g.opening, near);
    reveal.addPath(g.opening, far);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = mat.wall;
    ctx.fill(reveal, 'evenodd');
    ctx.fillStyle = `rgba(255, 210, 140, ${0.03 + 0.13 * v.light})`;   // ostění prosvícené světlem z konce chodby
    ctx.fill(reveal, 'evenodd');

    // zeď
    ctx.setTransform(near);
    ctx.fillStyle = mat.wall;           // zrnitost jen na klenbě a nárožích (na celé zdi by zpomalovala)
    ctx.fill(g.wall, 'evenodd');

    // zdivo (jen na zdi, ne v otvoru)
    ctx.save();
    ctx.clip(g.wall, 'evenodd');
    ctx.strokeStyle = mat.joint;
    ctx.lineWidth = 4;
    ctx.stroke(g.masonry);
    ctx.translate(0, 3);
    ctx.strokeStyle = mat.hi;
    ctx.lineWidth = 2;
    ctx.stroke(g.masonry);
    ctx.restore();

    // nárožní kameny, klenba, ozdoby
    ctx.fillStyle = mat.quoin;
    ctx.fill(g.quoins);
    ctx.fillStyle = noisePattern(ctx);
    ctx.fill(g.quoins);
    ctx.strokeStyle = mat.joint;
    ctx.lineWidth = 4;
    ctx.stroke(g.quoins);
    ctx.fillStyle = mat.band;
    ctx.fill(g.band);
    ctx.fillStyle = noisePattern(ctx);
    ctx.fill(g.band);
    ctx.stroke(g.band);
    ctx.stroke(g.bandJoints);
    if (mat.grain) { ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)'; ctx.lineWidth = 2; ctx.stroke(g.extra); }
    if (mat.rivets) { ctx.fillStyle = '#4a4d52'; ctx.fill(g.extra); }

    // svorník s vytesanou římskou číslicí
    const k = g.keystone;
    ctx.fillStyle = mat.band;
    ctx.beginPath();
    ctx.moveTo(k.x - k.w / 2, k.y - k.h / 2);
    ctx.lineTo(k.x + k.w / 2, k.y - k.h / 2);
    ctx.lineTo(k.x + k.w / 2 - 8, k.y + k.h / 2);
    ctx.lineTo(k.x - k.w / 2 + 8, k.y + k.h / 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = mat.joint;
    ctx.stroke();
    ctx.font = '44px Georgia, "Times New Roman", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#050403';
    ctx.fillText(v.numeral, k.x, k.y + 2);
    ctx.fillStyle = `rgba(214, 176, 100, ${0.55 + 0.4 * v.light})`;
    ctx.fillText(v.numeral, k.x, k.y);

    // přední hrana otvoru: tenká zlatá linka (původní podpis úvodu), slabší
    ctx.strokeStyle = '#c9a45c';
    ctx.globalAlpha = v.alpha * (0.25 + 0.45 * Math.min(1, v.near));
    ctx.lineWidth = 3;
    ctx.stroke(g.opening);

    // lampy s mihotavým plamenem a světlem na kameni
    ctx.globalAlpha = v.alpha;
    for (const [lx, ly] of g.lamps) {
      const fl = 0.85 + 0.1 * Math.sin(v.t * 9 + g.phase + lx) + 0.05 * Math.sin(v.t * 23 + g.phase);
      ctx.globalCompositeOperation = 'lighter';
      const glow = ctx.createRadialGradient(lx, ly, 0, lx, ly, 190);
      glow.addColorStop(0, `rgba(255, 170, 80, ${0.32 * fl})`);
      glow.addColorStop(0.4, `rgba(200, 110, 40, ${0.1 * fl})`);
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(lx - 190, ly - 190, 380, 380);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#0b0907';
      ctx.fillRect(lx - 5, ly + 8, 10, 46);                    // držák
      ctx.fillRect(lx - 16, ly + 4, 32, 8);
      ctx.fillStyle = `rgba(255, 214, 140, ${fl})`;            // plamen
      ctx.beginPath();
      ctx.ellipse(lx, ly - 8 - 3 * fl, 7, 15 * fl, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 250, 225, 0.9)';
      ctx.beginPath();
      ctx.ellipse(lx, ly - 4, 3, 7 * fl, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // stín k okrajům zdi (brána je nejsvětlejší kolem otvoru)
    const vg = ctx.createRadialGradient(0, 0, 360, 0, 0, 1300);
    vg.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vg.addColorStop(1, 'rgba(0, 0, 0, 0.7)');
    ctx.fillStyle = vg;
    ctx.fill(g.wall, 'evenodd');

    ctx.restore();
  }

  global.IntroGates = { create, draw };
})(window);
