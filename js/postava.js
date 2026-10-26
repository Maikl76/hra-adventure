/*
 * Postava člověka z boku – společná kresba pro aktivity a výklady („videa“).
 *
 * Proporce a hmotnosti podle Wintera (Biomechanics and Motor Control of Human Movement): délky
 * segmentů jako díl výšky postavy H, hmotnosti jako díl hmotnosti těla, těžiště segmentu jako díl
 * jeho délky od horního kloubu. Póza = úhly segmentů ve stupních; postava se z nich postaví,
 * postaví se na zem (nebo těžištěm do daného bodu) a nakreslí obrysem se stínováním. Těžiště
 * celého těla se počítá ze segmentů – stejně jako v laboratoři z videa.
 *
 * Souřadnice v metrech: x dopředu (postava hledí doprava), y nahoru. Na plátno se převádí přes
 * „view“ { ox, oy, s }: X = ox + x · s, Y = oy − y · s (s = pixely na metr).
 *
 * Úhly pózy (stupně, od svislice):
 *   trunk – trup (kyčel → rameno), + = předklon;   bend – zakulacení zad, + = kulatá záda
 *   neck, head – předklon krku a hlavy vůči trupu (záporné = hlava vzhůru)
 *   thigh – stehno (kyčel → koleno), + = koleno vpředu;   shin – bérec (kotník → koleno), + = koleno vpředu
 *   foot – chodidlo, 0 = podrážka vodorovně, + = pata nahoře;   toeFlat – 1 = prsty zůstávají na zemi
 *   uarm, farm, hand – paže, předloktí, ruka (směr dolů), + = dopředu;   grip – 'open', 'fist', 'hip'
 *   far – { … } stejné úhly pro vzdálenější ruku a nohu (když se liší)
 */

const DEG = Math.PI / 180;
const add = (p, v, k = 1) => [p[0] + v[0] * k, p[1] + v[1] * k];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const unit = (v) => {
  const l = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / l, v[1] / l];
};
const rot = (v, a) => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)];
const dirDown = (deg) => [Math.sin(deg * DEG), -Math.cos(deg * DEG)];
const dirUp = (deg) => [Math.sin(deg * DEG), Math.cos(deg * DEG)];
const angDown = (v) => Math.atan2(v[0], -v[1]) / DEG;

/* Délky (díl výšky H), hmotnosti (díl hmotnosti těla) a těžiště (díl délky od horního kloubu). */
export const SEG = {
  len: { foot: 0.152, ankle: 0.039, shank: 0.246, thigh: 0.245, trunk: 0.288, uarm: 0.186, farm: 0.146, hand: 0.108 },
  mass: { head: 0.081, trunk: 0.497, uarm: 0.028, farm: 0.016, hand: 0.006, thigh: 0.1, shank: 0.0465, foot: 0.0145 },
  com: { uarm: 0.436, farm: 0.43, thigh: 0.433, shank: 0.433, trunk: 0.5 },
};

/* Oblečení: uniforma (vojenská tělovýchova) a sportovní (GSPORT). */
const STYLES = {
  uniforma: {
    skin: '#d4a07a', hair: '#3b2b1f', jacket: '#5f6b3b', trousers: '#57623a', boots: '#2b241c',
    sole: '#14110d', belt: '#3a3222', buckle: '#a8955f', laces: '#15120e',
  },
  sport: {
    skin: '#d4a07a', hair: '#2a1f17', jacket: '#7442c8', shorts: '#23232d', socks: '#ecebe6',
    shoe: '#efede8', sole: '#cfcbc2', accent: '#22c3b5', laces: '#9a978f',
  },
};

/* Obrysy v metrech pro postavu 1,75 m (zvětšují se poměrem H / 1,75).
   Končetiny: [t (díl délky od horního kloubu), šířka vpředu, šířka vzadu]. */
const PROF = {
  thigh: [[-0.14, 0.07, 0.08], [0, 0.075, 0.084], [0.16, 0.077, 0.077], [0.42, 0.072, 0.066], [0.72, 0.06, 0.054], [0.93, 0.053, 0.048], [1.06, 0.045, 0.044]],
  shank: [[-0.07, 0.048, 0.047], [0.05, 0.045, 0.054], [0.24, 0.04, 0.066], [0.42, 0.037, 0.058], [0.66, 0.031, 0.04], [0.88, 0.027, 0.03], [1.0, 0.028, 0.032]],
  uarm: [[-0.14, 0.056, 0.06], [0.03, 0.06, 0.058], [0.3, 0.05, 0.05], [0.7, 0.04, 0.041], [0.97, 0.036, 0.038], [1.06, 0.034, 0.035]],
  farm: [[-0.06, 0.036, 0.038], [0.2, 0.041, 0.038], [0.55, 0.032, 0.029], [0.88, 0.025, 0.023], [1.0, 0.024, 0.023]],
  neck: [[-0.25, 0.05, 0.05], [0.4, 0.044, 0.047], [1.0, 0.046, 0.05]],
};
/* Trup v ohnuté ose: [u (díl délky kyčel → rameno), v (m dopředu od osy)]. */
const TRUNK_BACK = [[-0.32, -0.05], [-0.2, -0.1], [-0.04, -0.124], [0.12, -0.114], [0.31, -0.09], [0.5, -0.104], [0.68, -0.122], [0.86, -0.112], [0.98, -0.088], [1.1, -0.058]];
const TRUNK_FRONT = [[1.1, 0.036], [1.0, 0.08], [0.86, 0.13], [0.72, 0.138], [0.56, 0.122], [0.38, 0.116], [0.19, 0.106], [0.03, 0.088], [-0.13, 0.072], [-0.26, 0.042]];
/* Hlava z profilu: počátek ve zvukovodu, x dopředu, y vzhůru. */
const HEAD = [[-0.045, -0.086], [-0.064, -0.06], [-0.092, -0.02], [-0.104, 0.036], [-0.09, 0.088], [-0.057, 0.112], [-0.005, 0.121], [0.05, 0.11], [0.082, 0.088], [0.096, 0.058], [0.099, 0.036], [0.092, 0.02], [0.115, -0.011], [0.113, -0.024], [0.098, -0.032], [0.102, -0.045], [0.095, -0.053], [0.1, -0.06], [0.091, -0.072], [0.094, -0.086], [0.077, -0.103], [0.04, -0.103], [0.012, -0.086]];
const HAIR = [[0.085, 0.086], [0.074, 0.114], [0.022, 0.131], [-0.042, 0.126], [-0.091, 0.095], [-0.113, 0.036], [-0.102, -0.022], [-0.07, -0.062], [-0.05, -0.032], [-0.036, 0.034], [-0.002, 0.05], [0.028, 0.054], [0.031, 0.02], [0.046, 0.057], [0.067, 0.074]];
/* Bota a tenisky v rámu chodidla: počátek v kotníku, x po podrážce dopředu. */
const BALL = 0.145;
const SOLE_Y = -0.074;
const BOOT = [[-0.05, 0.045], [-0.062, 0.0], [-0.073, -0.04], [-0.067, -0.066], [-0.04, -0.074], [0.06, -0.074], [0.145, -0.074], [0.19, -0.07], [0.213, -0.058], [0.211, -0.04], [0.188, -0.026], [0.14, -0.016], [0.085, 0.004], [0.045, 0.03], [0.03, 0.05]];
const SHOE = [[-0.046, 0.022], [-0.06, -0.008], [-0.071, -0.04], [-0.069, -0.066], [-0.04, -0.075], [0.06, -0.075], [0.145, -0.075], [0.19, -0.072], [0.214, -0.06], [0.211, -0.044], [0.186, -0.03], [0.135, -0.017], [0.082, 0.0], [0.045, 0.02], [0.028, 0.03]];
const SOLE_STRIP = 0.018;
/* Ruka v rámu ruky: počátek v zápěstí, x ke prstům, y na stranu palce. */
const HAND_OPEN = [[0, 0.024], [0.03, 0.03], [0.055, 0.04], [0.084, 0.038], [0.076, 0.026], [0.11, 0.025], [0.163, 0.016], [0.184, 0.004], [0.18, -0.01], [0.15, -0.021], [0.09, -0.028], [0.04, -0.026], [0, -0.022]];
const HAND_FIST = [[0, 0.025], [0.03, 0.033], [0.058, 0.038], [0.083, 0.032], [0.096, 0.014], [0.094, -0.012], [0.078, -0.03], [0.042, -0.031], [0, -0.023]];
const HAND_HIP = HAND_OPEN.map(([x, y]) => [x * 0.72, y]);
const GRIP = 0.06;   // střed sevřené ruky od zápěstí (m)

export const STAND = {
  trunk: 2, bend: 0, neck: 0, head: 0, thigh: 0, shin: 2, foot: 0, toeFlat: 1,
  uarm: 3, farm: 7, hand: 8, grip: 'open',
};

/* ---------- Tělo, póza, těžiště ---------- */

export function makeBody(o = {}) {
  const H = o.height || 1.75;
  const name = STYLES[o.style] ? o.style : 'uniforma';
  // délky v metrech; „lengths“ přepíše jednotlivé (např. když má aktivita vlastní rozměry)
  const L = {};
  for (const key of ['shank', 'thigh', 'trunk', 'uarm', 'farm']) L[key] = (o.lengths && o.lengths[key]) || SEG.len[key] * H;
  // délka boty od paty ke špičce (m); bez ní podle výšky postavy
  const fs = o.footLength ? o.footLength / (0.286 * (H / 1.75)) : 1;
  return { H, M: o.mass || 70, k: H / 1.75, L, fs, styleName: name, style: { ...STYLES[name], ...(o.colors || {}) } };
}

/* Plynulý přechod mezi dvěma pózami (úhly lineárně, sevření ruky v polovině). */
export function lerpPose(a, b, t) {
  const out = {};
  const keys = new Set([...Object.keys(STAND), ...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (key === 'far') continue;
    const va = key in a ? a[key] : STAND[key];
    const vb = key in b ? b[key] : STAND[key];
    out[key] = typeof va === 'number' && typeof vb === 'number' ? va + (vb - va) * t : (t < 0.5 ? va : vb);
  }
  if (a.far || b.far) {
    const fa = { ...pick(a), ...(a.far || {}) };
    const fb = { ...pick(b), ...(b.far || {}) };
    out.far = {};
    for (const key of Object.keys(fa)) out.far[key] = typeof fa[key] === 'number' ? fa[key] + (fb[key] - fa[key]) * t : (t < 0.5 ? fa[key] : fb[key]);
  }
  return out;
}
const LIMB_KEYS = ['thigh', 'shin', 'foot', 'toeFlat', 'uarm', 'farm', 'hand', 'grip'];
function pick(p) {
  const o = {};
  for (const key of LIMB_KEYS) o[key] = key in p ? p[key] : STAND[key];
  return o;
}

/* Postaví postavu z pózy. place: { ground, x, anchor: 'ankle'|'ball'|'toe'|'heel' } = na zemi,
   { hip: [x, y] } = kyčel do bodu, { com: [x, y] } = těžiště do bodu. */
export function pose(body, p0, place = {}) {
  const p = { ...STAND, ...p0 };
  const f = { ...pick(p), ...(p.far || {}) };
  const k = body.k;
  const Lt = body.L.trunk;
  const b = (p.bend || 0) * DEG;
  const th0 = p.trunk * DEG - b / 2;
  const U0 = -0.4;
  const U1 = 1.15;
  const phi = (u) => th0 + b * Math.max(U0, Math.min(U1, u));
  const arc = (u) => (Math.abs(b) < 1e-5
    ? [Lt * u * Math.sin(th0), Lt * u * Math.cos(th0)]
    : [(Lt / b) * (Math.cos(th0) - Math.cos(th0 + b * u)), (Lt / b) * (Math.sin(th0 + b * u) - Math.sin(th0))]);
  const axis = (u) => {
    const uc = Math.max(U0, Math.min(U1, u));
    const a = arc(uc);
    return uc === u ? a : add(a, [Math.sin(phi(uc)), Math.cos(phi(uc))], Lt * (u - uc));
  };
  const frontN = (u) => [Math.cos(phi(u)), -Math.sin(phi(u))];

  const leg = (q) => {
    const knee = add([0, 0], dirDown(q.thigh), body.L.thigh);
    const ankle = add(knee, [-Math.sin(q.shin * DEG), -Math.cos(q.shin * DEG)], body.L.shank);
    return { knee, ankle, foot: q.foot, toeFlat: q.toeFlat };
  };
  const shoulder = add(axis(1), frontN(1), 0);
  const arm = (q) => {
    const elbow = add(shoulder, dirDown(q.uarm), body.L.uarm);
    const wrist = add(elbow, dirDown(q.farm), body.L.farm);
    return { elbow, wrist, hand: q.hand, grip: q.grip };
  };
  // paže do bodu (sevřená ruka, nebo zápěstí u „ruce v bok“); loket se ohýbá dozadu
  const armTo = (target, L1, L2, grip, fist) => {
    const D = sub(target, shoulder);
    const dist = Math.hypot(D[0], D[1]);
    const d = Math.max(Math.abs(L1 - L2) + 1e-4, Math.min(L1 + L2 - 1e-4, dist));
    const a = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
    const u = unit(D);
    const elbow = add(shoulder, rot(u, -a), L1);
    const end = add(shoulder, u, d);
    const dirF = unit(sub(end, elbow));
    const wrist = fist ? add(elbow, dirF, L2 - GRIP * k) : end;
    const farm = angDown(dirF);
    return { elbow, wrist, hand: fist ? farm : farm + 42, grip, reach: dist <= L1 + L2 };
  };
  const legN = leg(p);
  const legF = leg(f);
  let armN = arm(p);
  let armF = arm(f);
  if (p.hips) {
    // ruce v bok: z boku je paže zkrácená (loket míří do strany)
    const hipPt = add(axis(0.22), frontN(0.22), -0.035 * k);
    armN = armTo(hipPt, body.L.uarm * 0.7, body.L.farm * 0.88, 'hip', false);
    armF = armTo(add(hipPt, [-0.01 * k, 0]), body.L.uarm * 0.7, body.L.farm * 0.88, 'hip', false);
  }
  const neckDeg = phi(1.06) / DEG + p.neck;
  const neck = add(axis(1.06), frontN(1.06), -0.012 * k);
  const head = add(neck, dirUp(neckDeg), 0.16 * k);

  // bod chodidla z rámu chodidla (prsty se při „toeFlat“ ohnou v bříšku a zůstanou na zemi)
  const footRaw = (lg, q) => {
    let [x, y] = [q[0] * (body.fs || 1), q[1]];
    const ball = BALL * (body.fs || 1);
    if (x > ball && lg.toeFlat) {
      const r = rot([x - ball, y - SOLE_Y], lg.foot * DEG * lg.toeFlat);
      x = ball + r[0];
      y = SOLE_Y + r[1];
    }
    return add(lg.ankle, rot([x * k, y * k], -lg.foot * DEG));
  };

  let o = [0, 0];
  if (place.hip) o = place.hip;
  else if (place.com) {
    const c = comOf({ k, hip: [0, 0], axis, frontN, head, headDeg: neckDeg + p.head, shoulder, armN, armF, legN, legF, footPt: footRaw });
    o = sub(place.com, c);
  } else {
    const soles = [];
    for (const lg of [legN, legF]) for (const q of [[-0.06, SOLE_Y], [BALL, SOLE_Y], [0.208, SOLE_Y + 0.008]]) soles.push(footRaw(lg, q));
    const minY = Math.min(...soles.map((s) => s[1]));
    const anchor = place.anchor || 'ankle';
    const ax = anchor === 'ball' ? footRaw(legN, [BALL, SOLE_Y])[0]
      : anchor === 'toe' ? footRaw(legN, [0.208, SOLE_Y])[0]
        : anchor === 'heel' ? footRaw(legN, [-0.06, SOLE_Y])[0]
          : legN.ankle[0];
    o = [(place.x || 0) - ax, (place.ground || 0) - minY];
  }
  if (p.reach) {
    // obě ruce drží bod (např. úchyt bedny) – zadaný ve světě, tedy po umístění postavy;
    // „flat“ = dlaň položená na plochu (bod je zápěstí, prsty míří dopředu)
    const tgt = sub(p.reach, o);
    if (p.grip === 'flat') {
      armN = armTo(tgt, body.L.uarm, body.L.farm, 'flat', false);
      armN.hand = p.handFlat ?? 90;
      armF = { ...armN };
    } else {
      armN = armTo(tgt, body.L.uarm, body.L.farm + GRIP * k, p.grip === 'open' ? 'fist' : p.grip, true);
      armF = armTo(tgt, body.L.uarm, body.L.farm + GRIP * k, armN.grip, true);
    }
  }
  const mv = (pt) => add(pt, o);
  const mvLeg = (lg) => ({ ...lg, knee: mv(lg.knee), ankle: mv(lg.ankle) });
  const mvArm = (am) => ({ ...am, elbow: mv(am.elbow), wrist: mv(am.wrist) });
  const sk = {
    body, p, k, o,
    hip: mv([0, 0]),
    shoulder: mv(shoulder),
    neck: mv(neck),
    head: mv(head),
    headDeg: neckDeg + p.head,
    neckDeg,
    legN: mvLeg(legN), legF: mvLeg(legF), armN: mvArm(armN), armF: mvArm(armF),
    axis: (u) => mv(axis(u)),
    frontN,
    T: (u, v) => mv(add(axis(u), frontN(u), v * k)),
  };
  sk.footPt = (lg, q) => mv(footRaw(lg === sk.legN ? legN : legF, q));
  sk.l5 = sk.T(0.11, -0.045);
  sk.reachOk = p.reach ? armN.reach : true;
  return sk;
}

/* Části těla s hmotností a těžištěm; „g“ je postava (nebo její rozpracovaná kostra). */
function massParts(g) {
  const k = g.k;
  const m = SEG.mass;
  const c = SEG.com;
  const at = (a, bb, t) => [a[0] + (bb[0] - a[0]) * t, a[1] + (bb[1] - a[1]) * t];
  const parts = [
    ['trunk', m.trunk, add(g.axis(0.5), g.frontN(0.5), 0.008 * k)],
    ['head', m.head, add(g.head, dirUp(g.headDeg), 0.012 * k)],
  ];
  for (const am of [g.armN, g.armF]) {
    parts.push(['uarm', m.uarm, at(g.shoulder, am.elbow, c.uarm)]);
    parts.push(['farm', m.farm, at(am.elbow, am.wrist, c.farm)]);
    parts.push(['hand', m.hand, add(am.wrist, dirDown(am.hand), 0.055 * k)]);
  }
  for (const lg of [g.legN, g.legF]) {
    parts.push(['thigh', m.thigh, at(g.hip, lg.knee, c.thigh)]);
    parts.push(['shank', m.shank, at(lg.knee, lg.ankle, c.shank)]);
    parts.push(['foot', m.foot, g.footPt(lg, [0.06, -0.035])]);
  }
  return parts;
}

const UPPER = ['trunk', 'head', 'uarm', 'farm', 'hand'];

function comOf(g, upper = false) {
  let sx = 0;
  let sy = 0;
  let sm = 0;
  for (const [name, mm, pt] of massParts(g)) {
    if (upper && !UPPER.includes(name)) continue;
    sx += mm * pt[0];
    sy += mm * pt[1];
    sm += mm;
  }
  return [sx / sm, sy / sm];
}

/* Těžiště celé postavy (nebo jen hlavy, trupu a paží: upper = true). */
export function centerOfMass(sk, upper = false) {
  return comOf(sk, upper);
}

/* Délka natažené paže k sevřené ruce (m). */
export function armReach(body) {
  return body.L.uarm + body.L.farm + GRIP * body.k;
}

/* ---------- Kreslení ---------- */

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  if (f >= 0) {
    r += (255 - r) * f;
    g += (255 - g) * f;
    b += (255 - b) * f;
  } else {
    r *= 1 + f;
    g *= 1 + f;
    b *= 1 + f;
  }
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

/* Uzavřená hladká křivka (Catmull-Rom) přes body plátna. */
function smoothClosed(pts) {
  const path = new Path2D();
  const n = pts.length;
  path.moveTo(pts[0][0], pts[0][1]);
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    path.bezierCurveTo(
      p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6,
      p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6,
      p2[0], p2[1],
    );
  }
  path.closePath();
  return path;
}

const LIGHT = unit([0.45, 0.9]);   // světlo shora zepředu

/* Nakreslí postavu. opts: { far: true (vzdálenější končetiny), hooks: { between, front, top },
   shadow: výška země pro stín, alpha, ghost (jen obrys pro „stroboskop“), ow: tloušťka obrysu v px
   (jinak podle měřítka – u velkých detailů, např. hlavy přes celé plátno, by byl obrys moc tlustý) }. */
export function drawBody(ctx, sk, view, opts = {}) {
  const st = sk.body.style;
  const sport = sk.body.styleName === 'sport';
  const k = sk.k;
  const S = view.s;
  const flip = view.flip ? -1 : 1;    // zrcadlo: postava hledí doleva
  const X = (pt) => [view.ox + pt[0] * S * flip, view.oy - pt[1] * S];
  const ow = opts.ow || Math.max(1.2, S * 0.0085);
  const outline = opts.outline || 'rgba(16, 12, 9, 0.92)';
  const hooks = opts.hooks || {};
  const farShift = [-0.014 * k, 0.009 * k];

  ctx.save();
  if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;

  if (opts.shadow !== undefined) {
    const xs = [sk.footPt(sk.legN, [-0.06, SOLE_Y])[0], sk.footPt(sk.legN, [0.21, SOLE_Y])[0], sk.hip[0]];
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const lift = Math.max(0, Math.min(...[sk.legN, sk.legF].map((lg) => Math.min(sk.footPt(lg, [-0.06, SOLE_Y])[1], sk.footPt(lg, [BALL, SOLE_Y])[1], sk.footPt(lg, [0.208, SOLE_Y])[1]))) - opts.shadow);
    const c = X([cx, opts.shadow]);
    const rw = (0.3 + Math.abs(Math.max(...xs) - Math.min(...xs)) * 0.6) * S * 0.6 / (1 + lift * 2);
    const g = ctx.createRadialGradient(c[0], c[1], 0, c[0], c[1], rw);
    g.addColorStop(0, `rgba(0,0,0,${0.42 / (1 + lift * 3)})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(c[0], c[1], rw, rw * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /* --- tvary částí (v souřadnicích plátna) --- */
  // končetina: obrys podle profilu; vrací { path, mid, n, w }
  const limb = (P0, P1, prof, extra = 0, shift = null) => {
    const a = shift ? add(P0, shift) : P0;
    const bb = shift ? add(P1, shift) : P1;
    const d = unit(sub(bb, a));
    const n = [-d[1], d[0]];
    const len = Math.hypot(bb[0] - a[0], bb[1] - a[1]);
    const F = [];
    const B = [];
    for (const [t, wf, wb] of prof) {
      const c = add(a, d, t * len);
      F.push(X(add(c, n, (wf + extra) * k)));
      B.push(X(add(c, n, -(wb + extra) * k)));
    }
    const first = prof[0];
    const last = prof[prof.length - 1];
    const capE = X(add(a, d, last[0] * len + ((last[1] + last[2]) / 2 + extra) * 0.85 * k));
    const capS = X(add(a, d, first[0] * len - ((first[1] + first[2]) / 2 + extra) * 0.85 * k));
    const pts = [...F, capE, ...B.reverse(), capS];
    const midT = 0.45;
    const cm = add(a, d, midT * len);
    return { path: smoothClosed(pts), a, d, n, len, mid: cm, w: 0.06 * k };
  };
  // gradient přes šířku části (osvětlená strana podle směru světla)
  const grad = (mid, n, w, base, far) => {
    const lit = dot(n, LIGHT) >= 0 ? n : [-n[0], -n[1]];
    const p1 = X(add(mid, lit, w));
    const p2 = X(add(mid, lit, -w));
    const gr = ctx.createLinearGradient(p1[0], p1[1], p2[0], p2[1]);
    const b0 = far ? -0.3 : 0;
    gr.addColorStop(0, shade(base, b0 - 0.04));
    gr.addColorStop(0.2, shade(base, far ? -0.2 : 0.13));
    gr.addColorStop(0.5, shade(base, b0));
    gr.addColorStop(0.86, shade(base, b0 - 0.3));
    gr.addColorStop(1, shade(base, b0 - 0.2));
    return gr;
  };
  // ořez polorovinou: jen část končetiny před (sign = 1) nebo za (sign = −1) příčnou čarou v t
  const clipAt = (lb, t, sign) => {
    const c = add(lb.a, lb.d, t * lb.len);
    const n = lb.n;
    const far = 3;
    const q = [add(c, n, far), add(c, n, -far), add(add(c, n, -far), lb.d, -sign * far), add(add(c, n, far), lb.d, -sign * far)].map(X);
    const pth = new Path2D();
    pth.moveTo(q[0][0], q[0][1]);
    for (let i = 1; i < 4; i++) pth.lineTo(q[i][0], q[i][1]);
    pth.closePath();
    return pth;
  };
  const hemLine = (lb, t, extra) => {
    const c = add(lb.a, lb.d, t * lb.len);
    return [X(add(c, lb.n, (0.06 + extra) * k)), X(add(c, lb.n, -(0.07 + extra) * k))];
  };

  // chodidlo / bota
  const footShape = (lg, shift) => {
    const sh = shift || [0, 0];
    const pts = (sport ? SHOE : BOOT).map((q) => X(add(sk.footPt(lg, q), sh)));
    return smoothClosed(pts);
  };
  const soleShape = (lg, shift) => {
    const sh = shift || [0, 0];
    const top = SOLE_Y + SOLE_STRIP;
    const q = [[-0.071, top], [-0.069, SOLE_Y + 0.006], [-0.04, SOLE_Y - 0.001], [BALL, SOLE_Y - 0.001], [0.19, SOLE_Y + 0.002], [0.214, SOLE_Y + 0.012], [0.212, top + 0.002], [0.17, top], [0.06, top]];
    return smoothClosed(q.map((pt) => X(add(sk.footPt(lg, pt), sh))));
  };
  const handShape = (am, shift) => {
    const sh = shift || [0, 0];
    const dx = dirDown(am.hand);
    const dy = [-dx[1], dx[0]];
    const shape = am.grip === 'open' || am.grip === 'flat' ? HAND_OPEN : am.grip === 'hip' ? HAND_HIP : HAND_FIST;
    const w0 = add(am.wrist, sh);
    return smoothClosed(shape.map(([x, y]) => X(add(add(w0, dx, x * k), dy, y * k))));
  };

  /* --- skupina částí se společným obrysem: nejdřív tlusté obrysy, pak výplně --- */
  const group = (items) => {
    ctx.lineJoin = 'round';
    ctx.strokeStyle = outline;
    ctx.lineWidth = ow * 2;
    for (const it of items) {
      if (it.clip) {
        ctx.save();
        ctx.clip(it.clip);
        ctx.stroke(it.path);
        ctx.restore();
      } else ctx.stroke(it.path);
    }
    for (const it of items) {
      ctx.save();
      if (it.clip) ctx.clip(it.clip);
      ctx.fillStyle = it.fill;
      ctx.fill(it.path);
      if (it.after) it.after();
      ctx.restore();
    }
  };

  const legItems = (lg, far) => {
    const shift = far ? farShift : null;
    const sf = (c) => (far ? shade(c, -0.3) : c);
    const items = [];
    const th = limb(sk.hip, lg.knee, PROF.thigh, sport ? 0 : 0.006, shift);
    const sh = limb(lg.knee, lg.ankle, PROF.shank, sport ? 0 : 0.01, shift);
    const legCol = sport ? st.skin : st.trousers;
    items.push({ path: th.path, fill: grad(th.mid, th.n, 0.08 * k, legCol, far) });
    items.push({ path: sh.path, fill: grad(sh.mid, sh.n, 0.06 * k, legCol, far) });
    if (sport) {
      const shorts = limb(sk.hip, lg.knee, PROF.thigh, 0.014, shift);
      items.push({ path: shorts.path, clip: clipAt(shorts, 0.5, 1), fill: grad(th.mid, th.n, 0.09 * k, st.shorts, far) });
      const sock = limb(lg.knee, lg.ankle, PROF.shank, 0.004, shift);
      items.push({ path: sock.path, clip: clipAt(sock, 0.8, -1), fill: grad(sh.mid, sh.n, 0.04 * k, st.socks, far) });
    } else {
      const shaft = limb(lg.knee, lg.ankle, PROF.shank, 0.019, shift);
      items.push({ path: shaft.path, clip: clipAt(shaft, 0.64, -1), fill: grad(sh.mid, sh.n, 0.05 * k, st.boots, far) });
    }
    items.push({ path: footShape(lg, shift), fill: sf(sport ? st.shoe : st.boots) });
    items.push({ path: soleShape(lg, shift), fill: sf(st.sole) });
    return { items, th, sh };
  };

  const armItems = (am, far) => {
    const shift = far ? farShift : null;
    const items = [];
    const ua = limb(sk.shoulder, am.elbow, PROF.uarm, sport ? 0 : 0.012, shift);
    const fa = limb(am.elbow, am.wrist, PROF.farm, sport ? 0 : 0.01, shift);
    const armCol = sport ? st.skin : st.jacket;
    items.push({ path: handShape(am, shift), fill: grad(add(am.wrist, dirDown(am.hand), 0.05 * k), [-dirDown(am.hand)[1], dirDown(am.hand)[0]], 0.035 * k, st.skin, far) });
    items.push({ path: fa.path, fill: grad(fa.mid, fa.n, 0.045 * k, armCol, far) });
    items.push({ path: ua.path, fill: grad(ua.mid, ua.n, 0.055 * k, armCol, far) });
    if (sport) {
      const sleeve = limb(sk.shoulder, am.elbow, PROF.uarm, 0.011, shift);
      items.push({ path: sleeve.path, clip: clipAt(sleeve, 0.42, 1), fill: grad(ua.mid, ua.n, 0.06 * k, st.jacket, far) });
    }
    return { items, ua, fa };
  };

  /* --- vzdálenější paže a noha --- */
  if (opts.far !== false) {
    const fa = armItems(sk.armF, true);
    group(fa.items);
    const fl = legItems(sk.legF, true);
    group(fl.items);
  }
  if (hooks.between) hooks.between(ctx, X);

  /* --- trup, krk, hlava a bližší noha (jeden obrys) --- */
  const trunkPts = [...TRUNK_BACK, ...TRUNK_FRONT].map(([u, v]) => X(sk.T(u, v)));
  const trunkPath = smoothClosed(trunkPts);
  const tMid = sk.T(0.55, 0);
  const tN = sk.frontN(0.55);
  const trunkGrad = (base) => grad(tMid, tN, 0.12 * k, base, false);

  const neckEnd = add(sk.head, dirUp(sk.neckDeg), 0.0);
  const nk = limb(sk.neck, neckEnd, PROF.neck, 0);
  const headPts = HEAD.map(([x, y]) => {
    const r = rot([x * k, y * k], -sk.headDeg * DEG);
    return X(add(sk.head, r));
  });
  const headPath = smoothClosed(headPts);
  const headC = X(add(sk.head, rot([0.03 * k, 0.03 * k], -sk.headDeg * DEG)));
  const headGrad = ctx.createRadialGradient(headC[0] + 0.04 * S, headC[1] - 0.05 * S, 0.01 * S, headC[0], headC[1], 0.16 * S * k);
  headGrad.addColorStop(0, shade(st.skin, 0.12));
  headGrad.addColorStop(0.55, st.skin);
  headGrad.addColorStop(1, shade(st.skin, -0.32));

  const near = legItems(sk.legN, false);
  // bedna mezi koleny: bližší paže je za bližší nohou (noha se kreslí až po paži)
  const armBehind = !!opts.armBehindLeg;
  const mainItems = [
    { path: nk.path, fill: grad(nk.mid, nk.n, 0.05 * k, st.skin, false) },
    {
      path: trunkPath,
      fill: trunkGrad(st.jacket),
      after: () => {
        // spodní díl (kalhoty / trenýrky) pod pasem a opasek – jen uvnitř trupu
        ctx.clip(trunkPath);
        const lower = sport ? st.shorts : st.trousers;
        const belt = sport ? 0.12 : 0.17;
        const a = sk.T(belt, -0.4);
        const bq = sk.T(belt, 0.4);
        const dn = unit(sub(sk.axis(belt - 0.3), sk.axis(belt)));
        const quad = [a, bq, add(bq, dn, 2), add(a, dn, 2)].map(X);
        const pq = new Path2D();
        pq.moveTo(quad[0][0], quad[0][1]);
        for (let i = 1; i < 4; i++) pq.lineTo(quad[i][0], quad[i][1]);
        pq.closePath();
        ctx.save();
        ctx.clip(pq);
        ctx.fillStyle = trunkGrad(lower);
        ctx.fill(trunkPath);
        ctx.restore();
        if (!sport) {
          const bandA = [sk.T(belt + 0.045, -0.4), sk.T(belt + 0.045, 0.4), sk.T(belt - 0.005, 0.4), sk.T(belt - 0.005, -0.4)].map(X);
          const pb = new Path2D();
          pb.moveTo(bandA[0][0], bandA[0][1]);
          for (let i = 1; i < 4; i++) pb.lineTo(bandA[i][0], bandA[i][1]);
          pb.closePath();
          ctx.fillStyle = trunkGrad(st.belt);
          ctx.fill(pb);
          // přezka vpředu
          const bk = X(sk.T(belt + 0.02, 0.1));
          ctx.fillStyle = st.buckle;
          ctx.beginPath();
          ctx.arc(bk[0], bk[1], Math.max(1.5, 0.012 * S), 0, Math.PI * 2);
          ctx.fill();
          // náprsní kapsa
          const kp = [sk.T(0.8, 0.118), sk.T(0.8, 0.03), sk.T(0.62, 0.035), sk.T(0.62, 0.11)].map(X);
          ctx.strokeStyle = 'rgba(0,0,0,0.28)';
          ctx.lineWidth = ow * 0.7;
          ctx.beginPath();
          ctx.moveTo(kp[0][0], kp[0][1]);
          for (let i = 1; i < 4; i++) ctx.lineTo(kp[i][0], kp[i][1]);
          ctx.closePath();
          ctx.stroke();
          const fl = [sk.T(0.8, 0.12), sk.T(0.8, 0.028), sk.T(0.74, 0.03), sk.T(0.74, 0.116)].map(X);
          ctx.fillStyle = 'rgba(0,0,0,0.12)';
          ctx.beginPath();
          ctx.moveTo(fl[0][0], fl[0][1]);
          for (let i = 1; i < 4; i++) ctx.lineTo(fl[i][0], fl[i][1]);
          ctx.closePath();
          ctx.fill();
        } else {
          // lem trička a gumička trenýrek
          const w1 = X(sk.T(belt, -0.2));
          const w2 = X(sk.T(belt, 0.2));
          ctx.strokeStyle = 'rgba(0,0,0,0.35)';
          ctx.lineWidth = ow;
          ctx.beginPath();
          ctx.moveTo(w1[0], w1[1]);
          ctx.lineTo(w2[0], w2[1]);
          ctx.stroke();
        }
      },
    },
    { path: headPath, fill: headGrad },
    ...(armBehind ? [] : near.items),
  ];
  group(mainItems);

  // límec u krku
  if (!sport) {
    const col = limb(sk.neck, neckEnd, PROF.neck, 0.012);
    ctx.save();
    ctx.clip(clipAt(col, 0.18, 1));
    ctx.fillStyle = grad(col.mid, col.n, 0.05 * k, shade(st.jacket, -0.05), false);
    ctx.fill(col.path);
    ctx.strokeStyle = outline;
    ctx.lineWidth = ow;
    ctx.stroke(col.path);
    ctx.restore();
  } else {
    const col = limb(sk.neck, neckEnd, PROF.neck, 0.004);
    ctx.save();
    ctx.clip(clipAt(col, 0.05, 1));
    ctx.fillStyle = shade(st.jacket, -0.1);
    ctx.fill(col.path);
    ctx.restore();
  }

  // vlasy, ucho, oko, obočí
  const H2 = (x, y) => X(add(sk.head, rot([x * k, y * k], -sk.headDeg * DEG)));
  const hairPath = smoothClosed(HAIR.map(([x, y]) => H2(x, y)));
  const hc = H2(-0.02, 0.085);
  const hairGrad = ctx.createRadialGradient(hc[0] + 0.02 * S, hc[1] - 0.03 * S, 0.005 * S, hc[0], hc[1], 0.13 * S * k);
  hairGrad.addColorStop(0, shade(st.hair, 0.22));
  hairGrad.addColorStop(1, shade(st.hair, -0.25));
  ctx.fillStyle = hairGrad;
  ctx.fill(hairPath);
  ctx.strokeStyle = outline;
  ctx.lineWidth = ow * 0.8;
  ctx.stroke(hairPath);
  const ear = H2(-0.013, 0.003);
  ctx.save();
  ctx.translate(ear[0], ear[1]);
  if (view.flip) ctx.scale(-1, 1);
  ctx.rotate((sk.headDeg - 12) * DEG);
  ctx.fillStyle = shade(st.skin, -0.08);
  ctx.beginPath();
  ctx.ellipse(0, 0, 0.017 * S * k, 0.03 * S * k, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(60,30,20,0.6)';
  ctx.lineWidth = ow * 0.7;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0.002 * S * k, 0.002 * S * k, 0.008 * S * k, 0.017 * S * k, 0, -1.2, 2.2);
  ctx.stroke();
  ctx.restore();
  const eye = H2(0.079, 0.026);
  ctx.save();
  ctx.translate(eye[0], eye[1]);
  if (view.flip) ctx.scale(-1, 1);
  ctx.rotate(sk.headDeg * DEG);
  ctx.fillStyle = '#f2ece4';
  ctx.beginPath();
  ctx.ellipse(0, 0, 0.0095 * S * k, 0.0045 * S * k, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2a1d14';
  ctx.beginPath();
  ctx.arc(0.0045 * S * k, 0, 0.0036 * S * k, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(40,20,10,0.85)';
  ctx.lineWidth = ow * 0.8;
  ctx.beginPath();
  ctx.moveTo(-0.011 * S * k, -0.002 * S * k);
  ctx.quadraticCurveTo(0, -0.008 * S * k, 0.011 * S * k, -0.001 * S * k);
  ctx.stroke();
  ctx.restore();
  const br1 = H2(0.064, 0.042);
  const br2 = H2(0.096, 0.04);
  const brc = H2(0.08, 0.048);
  ctx.strokeStyle = shade(st.hair, -0.1);
  ctx.lineWidth = Math.max(1.2, 0.0055 * S * k);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(br1[0], br1[1]);
  ctx.quadraticCurveTo(brc[0], brc[1], br2[0], br2[1]);
  ctx.stroke();
  const m1 = H2(0.082, -0.053);
  const m2 = H2(0.095, -0.053);
  ctx.strokeStyle = 'rgba(90,40,30,0.55)';
  ctx.lineWidth = ow * 0.7;
  ctx.beginPath();
  ctx.moveTo(m1[0], m1[1]);
  ctx.lineTo(m2[0], m2[1]);
  ctx.stroke();

  // detaily nohy: kapsa na stehně / tkaničky, záhyb pod kolenem
  const detailLeg = (lg, parts) => {
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = ow * 0.7;
    if (!sport) {
      const th = parts.th;
      const c1 = add(th.a, th.d, 0.4 * th.len);
      const c2 = add(th.a, th.d, 0.68 * th.len);
      const q = [add(c1, th.n, 0.045 * k), add(c2, th.n, 0.045 * k), add(c2, th.n, -0.045 * k), add(c1, th.n, -0.045 * k)].map(X);
      ctx.beginPath();
      ctx.moveTo(q[0][0], q[0][1]);
      for (let i = 1; i < 4; i++) ctx.lineTo(q[i][0], q[i][1]);
      ctx.closePath();
      ctx.stroke();
      const f1 = add(c1, th.d, 0.07 * k);
      const fq = [add(c1, th.n, 0.047 * k), add(f1, th.n, 0.047 * k), add(f1, th.n, -0.047 * k), add(c1, th.n, -0.047 * k)].map(X);
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.beginPath();
      ctx.moveTo(fq[0][0], fq[0][1]);
      for (let i = 1; i < 4; i++) ctx.lineTo(fq[i][0], fq[i][1]);
      ctx.closePath();
      ctx.fill();
      // tkaničky na předku boty
      const sh = parts.sh;
      ctx.strokeStyle = st.laces;
      ctx.lineWidth = Math.max(1, ow * 0.7);
      for (let i = 0; i < 4; i++) {
        const t = 0.7 + i * 0.075;
        const c = add(sh.a, sh.d, t * sh.len);
        const p1 = X(add(c, sh.n, 0.03 * k));
        const p2 = X(add(add(c, sh.n, 0.05 * k), sh.d, 0.02 * k));
        ctx.beginPath();
        ctx.moveTo(p1[0], p1[1]);
        ctx.lineTo(p2[0], p2[1]);
        ctx.stroke();
      }
      const hem = hemLine(sh, 0.64, 0.0);
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = ow * 0.8;
      ctx.beginPath();
      ctx.moveTo(hem[0][0], hem[0][1]);
      ctx.lineTo(hem[1][0], hem[1][1]);
      ctx.stroke();
    } else {
      // pruh na tenisce
      const a1 = X(sk.footPt(lg, [0.0, -0.04]));
      const a2 = X(sk.footPt(lg, [0.12, -0.05]));
      const a3 = X(sk.footPt(lg, [0.05, -0.02]));
      ctx.strokeStyle = st.accent;
      ctx.lineWidth = Math.max(1.4, 0.008 * S * k);
      ctx.beginPath();
      ctx.moveTo(a1[0], a1[1]);
      ctx.quadraticCurveTo(a3[0], a3[1], a2[0], a2[1]);
      ctx.stroke();
      const hem = hemLine(parts.th, 0.5, 0.0);
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth = ow * 0.8;
      ctx.beginPath();
      ctx.moveTo(hem[0][0], hem[0][1]);
      ctx.lineTo(hem[1][0], hem[1][1]);
      ctx.stroke();
    }
  };
  /* --- bližší paže --- */
  const nearArm = () => {
    const na = armItems(sk.armN, false);
    group(na.items);
    if (!sport) {
      // manžeta rukávu
      const fa = na.fa;
      const hem = hemLine(fa, 0.9, -0.022);
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth = ow * 0.8;
      ctx.beginPath();
      ctx.moveTo(hem[0][0], hem[0][1]);
      ctx.lineTo(hem[1][0], hem[1][1]);
      ctx.stroke();
    } else {
      const hem = hemLine(na.ua, 0.42, -0.004);
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = ow * 0.8;
      ctx.beginPath();
      ctx.moveTo(hem[0][0], hem[0][1]);
      ctx.lineTo(hem[1][0], hem[1][1]);
      ctx.stroke();
    }
    if (sk.armN.grip === 'fist') {
      // prsty sevřené ruky
      const dx = dirDown(sk.armN.hand);
      const dy = [-dx[1], dx[0]];
      ctx.strokeStyle = 'rgba(70,35,25,0.55)';
      ctx.lineWidth = ow * 0.6;
      for (const y of [-0.012, 0.0, 0.012]) {
        const p1 = X(add(add(sk.armN.wrist, dx, 0.064 * k), dy, y * k));
        const p2 = X(add(add(sk.armN.wrist, dx, 0.088 * k), dy, y * k));
        ctx.beginPath();
        ctx.moveTo(p1[0], p1[1]);
        ctx.lineTo(p2[0], p2[1]);
        ctx.stroke();
      }
    }
  };
  if (armBehind) {
    nearArm();
    group(near.items);
    detailLeg(sk.legN, near);
    if (hooks.front) hooks.front(ctx, X);
  } else {
    detailLeg(sk.legN, near);
    if (hooks.front) hooks.front(ctx, X);
    nearArm();
  }
  if (hooks.top) hooks.top(ctx, X);
  ctx.restore();
}
