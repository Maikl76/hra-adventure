/*
 * Svalovec – kostra pokrytá svaly pro 3D chodbu (kreslí three.js; vše z kódu, žádné modely).
 *
 * Výukově: svaly a jejich funkce. Kosti jsou soustružené tvary a koule, každý sval je vřeteno
 * napjaté mezi začátkem a úponem na dvou kostech (části jednoho svalu mají stejné id). Když se sval
 * zkrátí, ztluští se (objem zůstává stejný); pracující sval se navíc napne a rozzáří.
 * Klouby se otáčejí podle póz (spánek, chůze, nápřah a úder, kop, sevření, zásah, zhroucení).
 * Model stojí na zemi (y = 0) a dívá se ve směru +z; jeho pravá strana je −x.
 *
 * Svalovec sám rozhoduje, kdy jde k hráči a kdy útočí (update); o zásazích laserem rozhoduje
 * chodba3d.js a hlásí je sem (interrupt, disableAttack). Události posílá funkcí on(název, data).
 */
import * as THREE from '../vendor/three/three.module.min.js';

const DEG = Math.PI / 180;

/* Klouby: rodič a poloha ve stoji (anatomická poloha, metry). Levá strana vznikne zrcadlením. */
const JOINTS = {
  pelvis: [null, 0, 0.93, 0],
  spine: ['pelvis', 0, 1.03, -0.03],
  chest: ['spine', 0, 1.22, -0.035],
  neck: ['chest', 0, 1.47, -0.03],
  head: ['neck', 0, 1.56, -0.01],
  shoulder_r: ['chest', -0.19, 1.435, -0.025],
  elbow_r: ['shoulder_r', -0.2, 1.125, -0.03],
  wrist_r: ['elbow_r', -0.205, 0.865, -0.01],
  hip_r: ['pelvis', -0.085, 0.93, 0],
  knee_r: ['hip_r', -0.09, 0.5, 0.005],
  ankle_r: ['knee_r', -0.09, 0.075, -0.01],
};

const SIDE = { r: -1, l: 1 };
const mirrorName = (name) => name.replace(/_r$/, '_l');

/* Svaly (pravá strana; levá zrcadlením). Části: a/b = [kloub, x, y, z] začátek a úpon ve stoji,
   „patella“ = čéška (počítá se podle ohnutí kolene), w = poloměr bříška, flat = zploštění,
   n = kam sval „kouká“ (front/back/side), peak = kde je bříško nejsilnější, ta/tb = délka šlach. */
const MUSCLES = [
  ['deltoideus', [
    { a: ['chest', -0.135, 1.455, 0.035], b: ['shoulder_r', -0.212, 1.3, -0.004], w: 0.024, flat: 0.8, n: 'front' },
    { a: ['chest', -0.207, 1.468, -0.015], b: ['shoulder_r', -0.227, 1.3, -0.022], w: 0.028, flat: 0.75, n: 'side' },
    { a: ['chest', -0.155, 1.43, -0.085], b: ['shoulder_r', -0.214, 1.3, -0.04], w: 0.024, flat: 0.8, n: 'back' },
  ]],
  ['pectoralis', [
    { a: ['chest', -0.05, 1.44, 0.066], b: ['shoulder_r', -0.175, 1.39, 0.012], w: 0.02, flat: 0.5, n: 'front' },
    { a: ['chest', -0.018, 1.345, 0.103], b: ['shoulder_r', -0.175, 1.385, 0.01], w: 0.03, flat: 0.42, n: 'front' },
    { a: ['chest', -0.04, 1.255, 0.098], b: ['shoulder_r', -0.172, 1.378, 0.006], w: 0.022, flat: 0.42, n: 'front' },
  ]],
  ['biceps', [
    { a: ['chest', -0.165, 1.415, 0.02], b: ['elbow_r', -0.198, 1.075, 0.008], w: 0.021, flat: 0.9, n: 'front', peak: 0.62, ta: 0.2, tb: 0.14 },
  ]],
  ['triceps', [
    { a: ['chest', -0.17, 1.39, -0.065], b: ['elbow_r', -0.2, 1.1, -0.066], w: 0.022, flat: 0.85, n: 'back', peak: 0.45, ta: 0.12, tb: 0.16 },
    { a: ['shoulder_r', -0.212, 1.37, -0.045], b: ['elbow_r', -0.205, 1.1, -0.066], w: 0.02, flat: 0.85, n: 'side', peak: 0.45, ta: 0.08, tb: 0.18 },
  ]],
  ['predlokti', [
    { a: ['shoulder_r', -0.178, 1.125, -0.012], b: ['wrist_r', -0.19, 0.875, 0.012], w: 0.017, flat: 0.8, n: 'front', peak: 0.3, ta: 0.06, tb: 0.35 },
    { a: ['shoulder_r', -0.226, 1.13, -0.035], b: ['wrist_r', -0.218, 0.875, -0.028], w: 0.016, flat: 0.8, n: 'back', peak: 0.3, ta: 0.06, tb: 0.35 },
  ]],
  ['latissimus', [
    { a: ['spine', -0.02, 1.06, -0.085], b: ['chest', -0.15, 1.255, -0.065], w: 0.03, flat: 0.3, n: 'back' },
    { a: ['chest', -0.02, 1.25, -0.1], b: ['chest', -0.15, 1.27, -0.07], w: 0.025, flat: 0.3, n: 'back' },
    { a: ['chest', -0.15, 1.26, -0.068], b: ['shoulder_r', -0.172, 1.37, -0.01], w: 0.025, flat: 0.55, n: 'side' },
  ]],
  ['trapezius', [
    { a: ['head', -0.02, 1.615, -0.075], b: ['chest', -0.15, 1.462, -0.035], w: 0.022, flat: 0.4, n: 'back' },
    { a: ['chest', -0.004, 1.43, -0.095], b: ['chest', -0.155, 1.44, -0.07], w: 0.024, flat: 0.35, n: 'back' },
    { a: ['spine', -0.004, 1.13, -0.088], b: ['chest', -0.085, 1.39, -0.105], w: 0.024, flat: 0.35, n: 'back' },
  ]],
  ['zdvihac', [
    { a: ['chest', -0.022, 1.44, 0.064], b: ['head', -0.052, 1.598, -0.02], w: 0.011, flat: 0.8, n: 'front', ta: 0.12, tb: 0.1 },
  ]],
  ['rectus_abdominis', [
    { a: ['pelvis', -0.016, 0.885, 0.07], b: ['chest', -0.045, 1.27, 0.103], w: 0.032, flat: 0.32, n: 'front', ta: 0.06, tb: 0.04 },
  ]],
  ['obliquus', [
    { a: ['chest', -0.135, 1.215, 0.035], b: ['pelvis', -0.115, 1.0, 0.045], w: 0.034, flat: 0.35, n: 'side' },
    { a: ['chest', -0.12, 1.26, 0.075], b: ['pelvis', -0.05, 0.96, 0.08], w: 0.026, flat: 0.32, n: 'front' },
  ]],
  ['vzprimovac', [
    { a: ['pelvis', -0.03, 0.98, -0.095], b: ['spine', -0.03, 1.13, -0.098], w: 0.022, flat: 0.6, n: 'back' },
    { a: ['spine', -0.03, 1.12, -0.098], b: ['chest', -0.035, 1.4, -0.102], w: 0.02, flat: 0.6, n: 'back' },
  ]],
  ['gluteus', [
    { a: ['pelvis', -0.06, 1.02, -0.095], b: ['hip_r', -0.135, 0.86, -0.03], w: 0.05, flat: 0.45, n: 'back' },
    { a: ['pelvis', -0.03, 0.94, -0.105], b: ['hip_r', -0.125, 0.82, -0.04], w: 0.045, flat: 0.45, n: 'back' },
  ]],
  ['quadriceps', [
    { a: ['pelvis', -0.09, 0.97, 0.06], b: 'patella', w: 0.028, flat: 0.8, n: 'front', ta: 0.06, tb: 0.12 },
    { a: ['hip_r', -0.135, 0.875, 0.01], b: 'patella', w: 0.033, flat: 0.75, n: 'side', ta: 0.05, tb: 0.12 },
    { a: ['hip_r', -0.068, 0.72, 0.03], b: 'patella', w: 0.03, flat: 0.8, n: 'front', peak: 0.7, ta: 0.04, tb: 0.1 },
  ]],
  ['hamstringy', [
    { a: ['pelvis', -0.065, 0.86, -0.06], b: ['knee_r', -0.122, 0.455, -0.035], w: 0.026, flat: 0.85, n: 'back', ta: 0.08, tb: 0.18 },
    { a: ['pelvis', -0.055, 0.86, -0.06], b: ['knee_r', -0.065, 0.45, -0.03], w: 0.024, flat: 0.85, n: 'back', ta: 0.08, tb: 0.2 },
  ]],
  ['adduktory', [
    { a: ['pelvis', -0.03, 0.875, 0.035], b: ['hip_r', -0.078, 0.66, 0.0], w: 0.03, flat: 0.6, n: 'front' },
    { a: ['pelvis', -0.045, 0.86, -0.02], b: ['hip_r', -0.072, 0.56, -0.008], w: 0.024, flat: 0.6, n: 'side' },
  ]],
  ['lytkovy', [
    { a: ['hip_r', -0.07, 0.545, -0.035], b: ['ankle_r', -0.09, 0.035, -0.065], w: 0.03, flat: 0.8, n: 'back', peak: 0.28, ta: 0.04, tb: 0.38 },
    { a: ['hip_r', -0.11, 0.545, -0.035], b: ['ankle_r', -0.09, 0.035, -0.065], w: 0.027, flat: 0.8, n: 'back', peak: 0.28, ta: 0.04, tb: 0.38 },
    { a: ['knee_r', -0.1, 0.4, -0.03], b: ['ankle_r', -0.09, 0.035, -0.065], w: 0.025, flat: 0.75, n: 'back', peak: 0.38, ta: 0.05, tb: 0.3 },
  ]],
  ['tibialis', [
    { a: ['knee_r', -0.108, 0.41, 0.03], b: ['ankle_r', -0.078, 0.035, 0.07], w: 0.017, flat: 0.85, n: 'front', peak: 0.35, ta: 0.05, tb: 0.38 },
  ]],
  // čéšková šlacha (patří ke kostře – zásah do ní je zásah do kosti)
  [null, [
    { a: 'patella', b: ['knee_r', -0.09, 0.44, 0.042], w: 0.011, flat: 0.6, n: 'front', ta: 1, tb: 0 },
  ]],
];

/* Útoky: který sval útok provádí (cíl) a které svaly při úderu pracují. */
const ATTACK_MUSCLES = {
  uder: { triceps: 1, pectoralis: 0.5, deltoideus: 0.6 },
  kop: { quadriceps: 1 },
  sevreni: { pectoralis: 1, deltoideus: 0.4, biceps: 0.5 },
};

/* Pózy: „kloub.pohyb“ ve stupních (pelvis.y/z v metrech). Bez _r/_l = obě strany.
   flex = ohnutí (u ramene a kyčle předpažení / přednožení), abd = upažení / unožení,
   hor = vodorovné přitažení paže před tělo, twist = otočení, dorsi = přitažení špičky. */
const POSES = {
  stand: { 'spine.flex': 2, 'chest.flex': 3, 'neck.flex': 6, 'head.flex': 4, 'shoulder.abd': 6, 'elbow.flex': 14, 'knee.flex': 5, 'hip.flex': 2 },
  sleep: { 'spine.flex': 6, 'chest.flex': 12, 'neck.flex': 28, 'head.flex': 30, 'shoulder.abd': 3, 'shoulder.flex': 6, 'elbow.flex': 8, 'knee.flex': 9, 'hip.flex': 4, 'pelvis.y': -0.02 },
  uder_windup: { 'chest.twist': -35, 'spine.twist': -12, 'shoulder_r.flex': 8, 'shoulder_r.abd': 18, 'elbow_r.flex': 145, 'shoulder_l.flex': 38, 'shoulder_l.abd': 15, 'elbow_l.flex': 125, 'hip.flex': 12, 'knee.flex': 18, 'spine.flex': 6, 'neck.flex': 2, 'pelvis.y': -0.04 },
  uder_strike: { 'chest.twist': 24, 'spine.twist': 8, 'shoulder_r.flex': 88, 'shoulder_r.abd': 6, 'elbow_r.flex': 4, 'shoulder_l.flex': 34, 'elbow_l.flex': 122, 'spine.flex': 12, 'hip.flex': 14, 'knee.flex': 20, 'pelvis.z': 0.45, 'pelvis.y': -0.05 },
  kop_windup: { 'hip_r.flex': 95, 'knee_r.flex': 105, 'ankle_r.dorsi': 10, 'hip_l.flex': 4, 'knee_l.flex': 16, 'spine.flex': -8, 'chest.flex': -4, 'shoulder.abd': 38, 'elbow.flex': 60, 'pelvis.x': 0.07, 'pelvis.y': -0.03 },
  kop_strike: { 'hip_r.flex': 86, 'knee_r.flex': 4, 'ankle_r.dorsi': -25, 'hip_l.flex': 2, 'knee_l.flex': 12, 'spine.flex': -14, 'shoulder.abd': 42, 'elbow.flex': 50, 'pelvis.x': 0.07, 'pelvis.z': 0.3 },
  sevreni_windup: { 'shoulder.abd': 88, 'shoulder.hor': -28, 'elbow.flex': 22, 'spine.flex': 8, 'chest.flex': 6, 'neck.flex': -6, 'head.flex': -6, 'knee.flex': 14, 'hip.flex': 8, 'pelvis.y': -0.03 },
  sevreni_strike: { 'shoulder.abd': 82, 'shoulder.hor': 82, 'elbow.flex': 46, 'spine.flex': 14, 'chest.flex': 6, 'knee.flex': 16, 'hip.flex': 10, 'pelvis.z': 0.45, 'pelvis.y': -0.03 },
  hit: { 'spine.flex': -12, 'chest.flex': -8, 'head.flex': -16, 'neck.flex': -8, 'shoulder.abd': 22, 'elbow.flex': 42, 'knee.flex': 14, 'hip.flex': 6 },
  buckle: { 'knee.flex': 100, 'hip.flex': 84, 'ankle.dorsi': 20, 'spine.flex': 30, 'chest.flex': 15, 'neck.flex': 30, 'shoulder.flex': 10, 'shoulder.abd': 15, 'elbow.flex': 20, 'pelvis.y': -0.4 },
  down: { 'pelvis.flex': 86, 'pelvis.y': -0.8, 'pelvis.z': 0.25, 'hip.flex': 8, 'knee.flex': 22, 'ankle.dorsi': -30, 'spine.flex': 4, 'chest.flex': 2, 'neck.flex': -18, 'shoulder.abd': 45, 'shoulder.flex': 25, 'elbow.flex': 35 },
};

const NORMALS = { front: [0, 0, 1], back: [0, 0, -1], side: [-1, 0, 0] };
const COLORS = { bone: 0xe6dcc3, muscle: 0xa8352d, off: 0x77736e, tendon: [0.95, 0.9, 0.8] };

/* Rozbalit pózu: „shoulder.abd“ → obě strany. */
function expand(pose) {
  const out = {};
  for (const [k, v] of Object.entries(pose)) {
    const [joint, dof] = k.split('.');
    if (['shoulder', 'elbow', 'wrist', 'hip', 'knee', 'ankle'].includes(joint)) {
      out[`${joint}_r.${dof}`] = (out[`${joint}_r.${dof}`] || 0) + v;
      out[`${joint}_l.${dof}`] = (out[`${joint}_l.${dof}`] || 0) + v;
    } else out[k] = (out[k] || 0) + v;
  }
  return out;
}

const EXPANDED = Object.fromEntries(Object.entries(POSES).map(([k, v]) => [k, expand(v)]));

/* Chůze: fáze kroku φ (rad). */
function walkPose(phi) {
  const s = Math.sin(phi), c = Math.cos(phi);
  return expand({
    'hip_r.flex': 4 + 22 * s, 'hip_l.flex': 4 - 22 * s,
    'knee_r.flex': 8 + 46 * Math.max(0, c) ** 2, 'knee_l.flex': 8 + 46 * Math.max(0, -c) ** 2,
    'ankle_r.dorsi': 6 * c, 'ankle_l.dorsi': -6 * c,
    'shoulder_r.flex': -18 * s, 'shoulder_l.flex': 18 * s, 'shoulder.abd': 7, 'elbow.flex': 22,
    'pelvis.y': -0.02 + 0.018 * Math.cos(2 * phi), 'pelvis.twist': 6 * s, 'chest.twist': -7 * s,
    'spine.flex': 6, 'chest.flex': 4, 'neck.flex': 10, 'head.flex': 2, 'pelvis.lean': 2 * s,
  });
}

/* Vřeteno svalu: jednotková délka podél +y, šlachy na koncích světlé (barvy vrcholů). */
function spindleGeometry(peak = 0.5, ta = 0.12, tb = 0.12) {
  const pts = [];
  const N = 16;
  const belly = Math.max(0.01, 1 - ta - tb);
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    let r;
    if (i === 0 || i === N) r = 0;
    else if (t < ta || t > 1 - tb) r = 0.2;
    else {
      const u = (t - ta) / belly;
      const g = u < peak ? 0.5 * u / peak : 0.5 + 0.5 * (u - peak) / (1 - peak);
      r = 0.2 + 0.8 * Math.sin(Math.PI * g) ** 0.85;
    }
    pts.push(new THREE.Vector2(r, t));
  }
  const geo = new THREE.LatheGeometry(pts, 10);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i);
    const edge = Math.min(t - ta, 1 - tb - t);   // < 0 = šlacha
    const k = Math.max(0, Math.min(1, 0.5 + edge / 0.06));
    for (let c = 0; c < 3; c++) colors[i * 3 + c] = COLORS.tendon[c] * (1 - k) + 1 * k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

/* Textura svalových vláken: jemné podélné proužky. */
let fiberTexture = null;
function fibers() {
  if (fiberTexture) return fiberTexture;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#c8c8c8';
  g.fillRect(0, 0, 128, 32);
  for (let x = 0; x < 128; x++) {
    const v = 170 + Math.round(70 * Math.random());
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(x, 0, 1, 32);
  }
  fiberTexture = new THREE.CanvasTexture(c);
  fiberTexture.wrapS = fiberTexture.wrapT = THREE.RepeatWrapping;
  fiberTexture.repeat.set(2, 1);
  fiberTexture.colorSpace = THREE.SRGBColorSpace;
  return fiberTexture;
}

const LONG_BONE = new THREE.LatheGeometry([
  [0, 0], [0.55, 0.01], [0.95, 0.035], [1, 0.07], [0.72, 0.13], [0.5, 0.22], [0.44, 0.5],
  [0.5, 0.78], [0.72, 0.87], [1, 0.93], [0.95, 0.965], [0.55, 0.99], [0, 1],
].map(([r, y]) => new THREE.Vector2(r, y)), 10);
const BLOB = new THREE.SphereGeometry(1, 14, 10);
const ROD = new THREE.CylinderGeometry(1, 1, 1, 8);
const BOX = new THREE.BoxGeometry(1, 1, 1);

const UP = new THREE.Vector3(0, 1, 0);

export class Svalovec {
  /* opts: { attacks: ['kop', 'sevreni', 'uder'], on(event, data) } */
  constructor(opts = {}) {
    this.on = opts.on || (() => {});
    this.allAttacks = (opts.attacks || ['kop', 'sevreni', 'uder']).filter((a) => ATTACK_MUSCLES[a]);
    this.root = new THREE.Group();
    this.root.name = 'svalovec';
    this.muscleGroup = new THREE.Group();
    this.muscleGroup.matrixAutoUpdate = false;
    this.boneMat = new THREE.MeshStandardMaterial({ color: COLORS.bone, roughness: 0.72, metalness: 0 });
    this.darkMat = new THREE.MeshStandardMaterial({ color: 0x140d0b, roughness: 1 });
    this.joints = {};
    this.rest = {};
    this.boneMeshes = [];
    this.parts = [];
    this.materials = {};
    this.flashes = {};
    this.activation = {};
    this.pose = { ...EXPANDED.sleep };
    this.buildJoints();
    this.buildBones();
    this.buildMuscles();
    this.reset();
  }

  /* ---------- Stavba ---------- */

  buildJoints() {
    const defs = { ...JOINTS };
    for (const [name, [parent, x, y, z]] of Object.entries(JOINTS)) {
      if (name.endsWith('_r')) defs[mirrorName(name)] = [parent && mirrorName(parent), -x, y, z];
    }
    for (const [name, [parent, x, y, z]] of Object.entries(defs)) {
      const g = new THREE.Group();
      g.name = name;
      this.rest[name] = new THREE.Vector3(x, y, z);
      if (parent) {
        g.position.set(x, y, z).sub(this.rest[parent]);
        this.joints[parent].add(g);
      } else {
        g.position.set(x, y, z);
        this.root.add(g);
      }
      this.joints[name] = g;
    }
  }

  /* Bod ve stoji → místní souřadnice kloubu (pravá strana; zrcadlení přes side). */
  local(joint, p, side = 'r') {
    const s = side === 'l' ? -1 : 1;
    const j = side === 'l' ? mirrorName(joint) : joint;
    return { joint: j, p: new THREE.Vector3(p[0] * s, p[1], p[2]).sub(this.rest[j]) };
  }

  mesh(geo, mat, joint) {
    const m = new THREE.Mesh(geo, mat);
    m.userData.bone = true;
    this.joints[joint].add(m);
    this.boneMeshes.push(m);
    return m;
  }

  /* Dlouhá kost od bodu a do bodu b (souřadnice ve stoji), r = poloměr dříku. */
  longBone(joint, a, b, r, side) {
    const A = this.local(joint, a, side);
    const B = this.local(joint, b, side);
    const dir = B.p.clone().sub(A.p);
    const m = this.mesh(LONG_BONE, this.boneMat, A.joint);
    m.position.copy(A.p);
    m.quaternion.setFromUnitVectors(UP, dir.clone().normalize());
    m.scale.set(r / 0.44, dir.length(), r / 0.44);
    return m;
  }

  rod(joint, a, b, r, side, mat = this.boneMat) {
    const A = this.local(joint, a, side);
    const B = this.local(joint, b, side);
    const dir = B.p.clone().sub(A.p);
    const m = this.mesh(ROD, mat, A.joint);
    m.position.copy(A.p).addScaledVector(dir, 0.5);
    m.quaternion.setFromUnitVectors(UP, dir.clone().normalize());
    m.scale.set(r, dir.length(), r);
    return m;
  }

  blob(joint, c, size, side, mat = this.boneMat, rot = null) {
    const C = this.local(joint, c, side);
    const s = side === 'l' ? -1 : 1;
    const m = this.mesh(BLOB, mat, C.joint);
    m.position.copy(C.p);
    m.scale.set(size[0], size[1], size[2]);
    if (rot) m.rotation.set(rot[0] * DEG, rot[1] * DEG * s, rot[2] * DEG * s);
    return m;
  }

  box(joint, c, size, side, rot = null, mat = this.boneMat) {
    const C = this.local(joint, c, side);
    const s = side === 'l' ? -1 : 1;
    const m = this.mesh(BOX, mat, C.joint);
    m.position.copy(C.p);
    m.scale.set(size[0], size[1], size[2]);
    if (rot) m.rotation.set(rot[0] * DEG, rot[1] * DEG * s, rot[2] * DEG * s);
    return m;
  }

  buildBones() {
    // lebka: mozkovna, obličej, očnice, dolní čelist se zuby
    this.blob('head', [0, 1.66, -0.01], [0.092, 0.1, 0.108]);
    this.blob('head', [0, 1.61, 0.04], [0.07, 0.07, 0.065]);
    for (const side of ['r', 'l']) {
      this.blob('head', [-0.032, 1.637, 0.085], [0.021, 0.019, 0.016], side, this.darkMat);
      this.blob('head', [-0.06, 1.62, 0.02], [0.018, 0.016, 0.03], side);   // lícní kost
    }
    this.blob('head', [0, 1.6, 0.098], [0.011, 0.016, 0.01], 'r', this.darkMat);   // nosní otvor
    this.box('head', [0, 1.572, 0.083], [0.052, 0.012, 0.018], 'r');              // zuby
    this.box('head', [0, 1.548, 0.065], [0.06, 0.022, 0.05], 'r');                // brada
    for (const side of ['r', 'l']) this.rod('head', [-0.045, 1.6, 0.0], [-0.03, 1.545, 0.06], 0.008, side);

    // páteř: bederní (spine), hrudní (chest), krční (neck) obratle
    const vert = (joint, y, z, r) => {
      this.rod(joint, [0, y - 0.008, z], [0, y + 0.008, z], r);
      this.box(joint, [0, y, z - 0.026], [0.008, 0.012, 0.03], 'r', [-20, 0, 0]);
    };
    for (let i = 0; i < 5; i++) vert('spine', 0.99 + i * 0.045, -0.04 - 0.008 * Math.sin(i / 4 * Math.PI), 0.021);
    for (let i = 0; i < 10; i++) vert('chest', 1.215 + i * 0.026, -0.055 - 0.022 * Math.sin(i / 9 * Math.PI), 0.018);
    for (let i = 0; i < 4; i++) vert('neck', 1.48 + i * 0.022, -0.035, 0.014);

    // hrudník: žebra (oblouky od páteře ke hrudní kosti) a hrudní kost
    for (let i = 0; i < 9; i++) {
      const y = 1.43 - i * 0.027;
      const a = 0.075 + 0.07 * Math.sin(Math.min(1, (i + 1.6) / 7.5) * Math.PI / 2);
      const zBack = -0.065, zFront = 0.07 + 0.025 * Math.sin(Math.min(1, (i + 1) / 6) * Math.PI / 2);
      const drop = 0.035 + i * 0.004;
      for (const side of ['r', 'l']) {
        const s = SIDE[side];
        const pts = [];
        for (let k = 0; k <= 12; k++) {
          const th = (k / 12) * Math.PI * (i < 7 ? 0.98 : 0.8);   // od páteře dopředu
          const f = (1 - Math.cos(th)) / 2;
          pts.push(new THREE.Vector3(s * a * Math.sin(th), y - drop * f, zBack + (zFront - zBack) * f).sub(this.rest.chest));
        }
        const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 14, 0.0065, 5, false);
        this.mesh(geo, this.boneMat, 'chest');
      }
    }
    this.box('chest', [0, 1.34, 0.098], [0.032, 0.17, 0.014], 'r', [-8, 0, 0]);

    // pánev: lopaty kosti kyčelní, křížová kost, stydká spona
    for (const side of ['r', 'l']) {
      this.blob('pelvis', [-0.1, 1.0, -0.02], [0.062, 0.05, 0.012], side, this.boneMat, [0, -40, -14]);
      this.rod('pelvis', [-0.085, 0.93, 0.0], [-0.115, 1.0, 0.035], 0.011, side);   // od jamky kyčle k trnu
      this.rod('pelvis', [-0.085, 0.92, 0.02], [-0.02, 0.885, 0.065], 0.012, side);
      this.rod('pelvis', [-0.09, 0.915, -0.02], [-0.06, 0.86, -0.055], 0.012, side);   // sedací kost
    }
    this.box('pelvis', [0, 0.97, -0.075], [0.07, 0.11, 0.03], 'r', [25, 0, 0]);

    for (const side of ['r', 'l']) {
      // klíční kost a lopatka
      this.longBone('chest', [-0.02, 1.44, 0.065], [-0.17, 1.465, 0.0], 0.008, side);
      this.blob('chest', [-0.11, 1.35, -0.098], [0.05, 0.066, 0.009], side, this.boneMat, [10, -20, 0]);
      // paže: kost pažní, hlavice, loketní a vřetenní kost, ruka
      this.longBone('shoulder_r', [-0.19, 1.445, -0.025], [-0.2, 1.115, -0.03], 0.015, side);
      this.blob('shoulder_r', [-0.186, 1.44, -0.02], [0.026, 0.026, 0.026], side);
      this.longBone('elbow_r', [-0.198, 1.14, -0.052], [-0.21, 0.87, -0.022], 0.009, side);
      this.longBone('elbow_r', [-0.207, 1.118, -0.015], [-0.196, 0.87, 0.0], 0.0095, side);
      this.box('wrist_r', [-0.205, 0.82, -0.008], [0.06, 0.085, 0.022], side);
      for (let f = 0; f < 4; f++) {
        const x = -0.18 - f * 0.016;
        this.rod('wrist_r', [x, 0.78, -0.004], [x - 0.002, 0.71 + Math.abs(f - 1.5) * 0.012, 0.002], 0.0065, side);
      }
      this.rod('wrist_r', [-0.236, 0.835, 0.004], [-0.25, 0.775, 0.016], 0.0075, side);   // palec
      // noha: stehenní kost s hlavicí a chocholíkem, holenní a lýtková kost, chodidlo
      this.longBone('hip_r', [-0.088, 0.94, 0.0], [-0.09, 0.5, 0.005], 0.019, side);
      this.blob('hip_r', [-0.088, 0.935, 0.0], [0.024, 0.024, 0.024], side);
      this.rod('hip_r', [-0.09, 0.93, 0.0], [-0.13, 0.905, -0.005], 0.014, side);
      this.blob('hip_r', [-0.135, 0.905, -0.008], [0.021, 0.026, 0.021], side);
      this.blob('knee_r', [-0.09, 0.5, 0.0], [0.034, 0.018, 0.03], side);
      this.longBone('knee_r', [-0.089, 0.495, 0.004], [-0.089, 0.075, -0.006], 0.017, side);
      this.longBone('knee_r', [-0.125, 0.47, -0.02], [-0.118, 0.07, -0.018], 0.0075, side);
      this.blob('ankle_r', [-0.09, 0.045, -0.04], [0.026, 0.03, 0.04], side);
      this.box('ankle_r', [-0.09, 0.035, 0.045], [0.068, 0.034, 0.11], side, [-8, 0, 0]);
      this.box('ankle_r', [-0.089, 0.012, 0.142], [0.075, 0.018, 0.05], side);
    }
    // čéšky (poloha se počítá každý snímek podle ohnutí kolene)
    this.patella = {};
    for (const side of ['r', 'l']) {
      const m = new THREE.Mesh(BLOB, this.boneMat);
      m.userData.bone = true;
      m.scale.set(0.022, 0.026, 0.012);
      m.matrixAutoUpdate = false;
      m.matrixWorldAutoUpdate = false;
      this.muscleGroup.add(m);
      this.boneMeshes.push(m);
      this.patella[side] = m;
    }
  }

  buildMuscles() {
    const tex = fibers();
    for (const [id, parts] of MUSCLES) {
      const key = id || 'slacha';
      if (!this.materials[key]) {
        this.materials[key] = new THREE.MeshStandardMaterial({
          color: id ? COLORS.muscle : COLORS.bone, roughness: 0.48, metalness: 0,
          vertexColors: true, map: id ? tex : null, emissive: 0x000000,
        });
        this.activation[key] = 0;
      }
      for (const side of ['r', 'l']) {
        for (const def of parts) {
          const geo = spindleGeometry(def.peak ?? 0.5, def.ta ?? 0.12, def.tb ?? 0.12);
          const mesh = new THREE.Mesh(geo, this.materials[key]);
          mesh.matrixAutoUpdate = false;
          mesh.matrixWorldAutoUpdate = false;
          mesh.frustumCulled = false;
          if (id) mesh.userData.muscle = id;
          else mesh.userData.bone = true;
          mesh.userData.side = side;
          this.muscleGroup.add(mesh);
          const end = (e) => (e === 'patella' ? 'patella' : this.local(e[0], e.slice(1), side));
          const n = NORMALS[def.n || 'front'];
          const part = {
            id: key, side, mesh, w: def.w, flat: def.flat ?? 0.8,
            a: end(def.a), b: end(def.b),
            n: new THREE.Vector3(n[0] * (side === 'l' ? -1 : 1), n[1], n[2]),
            L0: 0,
          };
          this.parts.push(part);
          if (!id) this.boneMeshes.push(mesh);
        }
      }
    }
    // klidové délky (ve stoji)
    this.applyPose({});
    this.root.updateMatrixWorld(true);
    const A = new THREE.Vector3(), B = new THREE.Vector3();
    for (const part of this.parts) {
      this.endPoint(part.a, part.side, A);
      this.endPoint(part.b, part.side, B);
      part.L0 = A.distanceTo(B);
    }
  }

  /* ---------- Póza ---------- */

  applyPose(p) {
    const q = new THREE.Quaternion();
    const qx = new THREE.Quaternion(), qy = new THREE.Quaternion(), qz = new THREE.Quaternion();
    const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
    const v = (k) => (p[k] || 0) * DEG;
    for (const [name, g] of Object.entries(this.joints)) {
      const side = name.endsWith('_l') ? 1 : name.endsWith('_r') ? -1 : 0;
      const base = name.replace(/_[rl]$/, '');
      if (base === 'shoulder') {
        qx.setFromAxisAngle(X, -v(`${name}.flex`));
        qz.setFromAxisAngle(Z, side * v(`${name}.abd`));
        qy.setFromAxisAngle(Y, -side * v(`${name}.hor`));
        q.copy(qy).multiply(qz).multiply(qx);
      } else if (base === 'hip') {
        qx.setFromAxisAngle(X, -v(`${name}.flex`));
        qz.setFromAxisAngle(Z, side * v(`${name}.abd`));
        q.copy(qz).multiply(qx);
      } else if (base === 'elbow') {
        q.setFromAxisAngle(X, -v(`${name}.flex`));
      } else if (base === 'knee') {
        q.setFromAxisAngle(X, v(`${name}.flex`));
      } else if (base === 'ankle') {
        q.setFromAxisAngle(X, -v(`${name}.dorsi`));
      } else if (base === 'wrist') {
        q.identity();
      } else {
        qx.setFromAxisAngle(X, v(`${name}.flex`));
        qz.setFromAxisAngle(Z, v(`${name}.lean`));
        qy.setFromAxisAngle(Y, v(`${name}.twist`));
        q.copy(qy).multiply(qz).multiply(qx);
      }
      g.quaternion.copy(q);
    }
    const pel = this.joints.pelvis;
    pel.position.set(this.rest.pelvis.x + (p['pelvis.x'] || 0), this.rest.pelvis.y + (p['pelvis.y'] || 0), this.rest.pelvis.z + (p['pelvis.z'] || 0));
  }

  endPoint(end, side, out) {
    if (end === 'patella') return this.patellaPoint(side, out);
    return this.joints[end.joint].localToWorld(out.copy(end.p));
  }

  /* Čéška: před kolenem, na půl cesty mezi směrem „dopředu“ stehna a bérce. */
  patellaPoint(side, out) {
    const thigh = this.joints[`hip_${side}`], shank = this.joints[`knee_${side}`];
    const fT = this._v1.set(0, 0, 1).applyQuaternion(thigh.getWorldQuaternion(this._q1));
    const fS = this._v2.set(0, 0, 1).applyQuaternion(shank.getWorldQuaternion(this._q2));
    const up = this._v3.set(0, 1, 0).applyQuaternion(this._q1);
    shank.getWorldPosition(out);
    return out.addScaledVector(fT.add(fS).normalize(), 0.048).addScaledVector(up, 0.012);
  }

  /* Svaly: každé vřeteno natáhnout mezi začátek a úpon (po pohybu kostí). */
  updateMuscles() {
    this.root.updateMatrixWorld(true);
    const A = this._a, B = this._b, dir = this._d, n = this._n, x = this._x, m = this._m;
    for (const part of this.parts) {
      this.endPoint(part.a, part.side, A);
      this.endPoint(part.b, part.side, B);
      dir.subVectors(B, A);
      const L = Math.max(0.005, dir.length());
      dir.divideScalar(L);
      const act = this.activation[part.id] || 0;
      const k = Math.min(1.45, Math.max(0.72, Math.sqrt(part.L0 / L)));
      const w = part.w * k * (1 + 0.3 * act) * this.scale;
      // „kam sval kouká“ otáčet s kloubem začátku
      const jointA = part.a === 'patella' ? `knee_${part.side}` : part.a.joint;
      n.copy(part.n).applyQuaternion(this.joints[jointA].getWorldQuaternion(this._q1));
      n.addScaledVector(dir, -n.dot(dir));
      if (n.lengthSq() < 1e-6) n.set(0, 0, 1);
      n.normalize();
      x.crossVectors(dir, n);
      m.makeBasis(x.multiplyScalar(w), dir.multiplyScalar(L), n.multiplyScalar(w * part.flat));
      m.setPosition(A);
      part.mesh.matrixWorld.copy(m);
    }
    for (const side of ['r', 'l']) {
      const p = this.patella[side];
      this.patellaPoint(side, A);
      p.matrixWorld.compose(A, this.joints[`knee_${side}`].getWorldQuaternion(this._q1), this._s.set(0.022, 0.026, 0.013).multiplyScalar(this.scale));
    }
  }

  /* ---------- Stav a chování ---------- */

  reset() {
    this.state = 'sleep';
    this.t = 0;
    this.attacks = this.allAttacks.slice();
    this.current = null;
    this.cooldown = 1.2;
    this.phase = 0;
    this.lastStrike = 0;
    this.pose = { ...EXPANDED.sleep };
    for (const k of Object.keys(this.materials)) this.setMuscleOff(k, false);
    for (const k of Object.keys(this.activation)) this.activation[k] = 0;
  }

  /* Umístění a natočení (yaw: 0 = dívá se k +z). */
  place(x, z, yaw = 0) {
    this.root.position.set(x, 0, z);
    this.root.rotation.y = yaw;
    this.home = { x, z, yaw };
  }

  addTo(scene) {
    scene.add(this.root);
    scene.add(this.muscleGroup);
    this.scale = 1;
    this.applyPose(this.pose);
    this.updateMuscles();
  }

  get alive() {
    return this.state !== 'collapse' && this.state !== 'down';
  }

  get awake() {
    return this.state !== 'sleep';
  }

  /* Je útok ve fázi, kdy jde zastavit (nápřah nebo úder)? */
  get attacking() {
    return this.state === 'windup' || this.state === 'strike' ? this.current : null;
  }

  wake() {
    if (this.state === 'sleep') this.go('wake');
  }

  go(state) {
    this.state = state;
    this.t = 0;
  }

  /* Správný zásah: útok zastavit (svalovec se zapotácí). */
  interrupt() {
    if (this.alive) this.go('hit');
  }

  disableAttack(id, target = Object.keys(ATTACK_MUSCLES[id] || {})[0]) {
    this.attacks = this.attacks.filter((a) => a !== id);
    if (target) this.setMuscleOff(target, true);
    if (!this.attacks.length) this.go('collapse');
  }

  /* Okamžitě nastavit pózu (pro náhledy a testy). */
  setPoseNow(name) {
    this.pose = { ...(EXPANDED[name] || EXPANDED.stand) };
    this.applyPose(this.pose);
    this.updateMuscles();
  }

  setMuscleOff(id, off) {
    const mat = this.materials[id];
    if (!mat || id === 'slacha') return;
    mat.userData.off = off;
    mat.color.setHex(off ? COLORS.off : COLORS.muscle);
  }

  isOff(id) {
    return Boolean(this.materials[id] && this.materials[id].userData.off);
  }

  /* Bliknutí svalu po zásahu (barva: zelená = správně, žlutá = vedle). */
  flash(id, color) {
    if (this.materials[id]) this.flashes[id] = { color: new THREE.Color(color), t: 0.45 };
  }

  /* Zásah paprskem: { muscle, side, point } nebo { bone: true, point } nebo null. */
  hitTest(raycaster) {
    const meshes = this.parts.map((p) => p.mesh).concat(this.boneMeshes);
    const hits = raycaster.intersectObjects(meshes, false);
    if (!hits.length) return null;
    const h = hits[0];
    if (h.object.userData.muscle) return { muscle: h.object.userData.muscle, side: h.object.userData.side, point: h.point, distance: h.distance };
    return { bone: true, point: h.point, distance: h.distance };
  }

  /* Dosah úderu: kde je svalovec po výpadu (střed) a kam se dívá. */
  reach() {
    const yaw = this.root.rotation.y;
    const lunge = (this.pose['pelvis.z'] || 0);
    return {
      x: this.root.position.x + Math.sin(yaw) * lunge,
      z: this.root.position.z + Math.cos(yaw) * lunge,
      yaw,
    };
  }

  /* Jeden krok simulace. env: { player: {x, y, z}, bounds: {x: [a, b], z: [a, b]}, see: bool, speed } */
  update(dt, env) {
    this.t += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    const pos = this.root.position;
    const dx = env.player.x - pos.x, dz = env.player.z - pos.z;
    const dist = Math.hypot(dx, dz);
    const faceYaw = Math.atan2(dx, dz);
    let target = EXPANDED.stand;
    let rate = 6;
    const act = {};
    const turn = (speed) => {
      let d = faceYaw - this.root.rotation.y;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      this.root.rotation.y += Math.max(-speed * dt, Math.min(speed * dt, d));
      return Math.abs(d);
    };

    switch (this.state) {
      case 'sleep': {
        target = EXPANDED.sleep;
        rate = 3;
        if (env.see) this.go('wake');
        break;
      }
      case 'wake': {
        target = EXPANDED.stand;
        rate = 2.5;
        turn(1.5);
        if (this.t > 1.3) {
          this.on('wake');
          this.go('chase');
          this.cooldown = 1.0;
        }
        break;
      }
      case 'chase': {
        const off = turn(2.2);
        if (dist > 2.6 && off < 1.2) {
          // jít k hráči (ne skrz něj a ne ven z chodby)
          const speed = env.speed || 1.0;
          const step = Math.min(speed * dt, dist - 2.4);
          const yaw = this.root.rotation.y;
          pos.x = Math.max(env.bounds.x[0], Math.min(env.bounds.x[1], pos.x + Math.sin(yaw) * step));
          pos.z = Math.max(env.bounds.z[0], Math.min(env.bounds.z[1], pos.z + Math.cos(yaw) * step));
          this.phase += dt * 2 * Math.PI * 0.85 * (speed / 1.0);
          target = walkPose(this.phase);
          rate = 10;
        } else {
          target = EXPANDED.stand;
          rate = 5;
        }
        if (dist < 3.4 && this.cooldown <= 0 && off < 0.35 && this.attacks.length) {
          const next = this.allAttacks.find((a, i) => this.attacks.includes(a) && i > this.allAttacks.indexOf(this.current))
            || this.allAttacks.find((a) => this.attacks.includes(a));
          this.current = next;
          this.go('windup');
          this.on('attack', next);
        }
        break;
      }
      case 'windup': {
        turn(1.2);
        target = EXPANDED[`${this.current}_windup`];
        rate = 4;
        if (this.t > (env.windup || 2.4)) {
          this.go('strike');
          this.struck = false;
        }
        break;
      }
      case 'strike': {
        target = EXPANDED[`${this.current}_strike`];
        rate = 16;
        Object.assign(act, ATTACK_MUSCLES[this.current]);
        if (!this.struck && this.t > 0.18) {
          this.struck = true;
          const r = this.reach();
          const px = env.player.x - r.x, pz = env.player.z - r.z;
          const d = Math.hypot(px, pz);
          const ang = Math.abs(Math.atan2(Math.sin(Math.atan2(px, pz) - r.yaw), Math.cos(Math.atan2(px, pz) - r.yaw)));
          this.on('strike', { attack: this.current, hit: d < 1.45 && ang < 0.9 && env.player.y < 1.2 });
        }
        if (this.t > 0.55) {
          this.go('recover');
        }
        break;
      }
      case 'recover': {
        target = EXPANDED.stand;
        rate = 5;
        if (this.t > 0.8) {
          this.cooldown = 1.6;
          this.go('chase');
        }
        break;
      }
      case 'hit': {
        target = EXPANDED.hit;
        rate = 12;
        if (this.t > 0.7) {
          this.cooldown = 1.8;
          this.go(this.attacks.length ? 'chase' : 'collapse');
        }
        break;
      }
      case 'collapse': {
        target = this.t < 0.9 ? EXPANDED.buckle : EXPANDED.down;
        rate = this.t < 0.9 ? 6 : 4;
        if (this.t > 2.4) {
          this.go('down');
          this.on('collapse');
        }
        break;
      }
      case 'down': {
        target = EXPANDED.down;
        rate = 4;
        break;
      }
      default:
        break;
    }

    // plynulý přechod do cílové pózy
    const k = 1 - Math.exp(-rate * dt);
    const keys = new Set([...Object.keys(this.pose), ...Object.keys(target)]);
    for (const key of keys) {
      const a = this.pose[key] || 0, b = target[key] || 0;
      this.pose[key] = a + (b - a) * k;
    }
    this.applyPose(this.pose);

    // pracující svaly se napnou; bliknutí po zásahu
    const ka = 1 - Math.exp(-10 * dt);
    for (const id of Object.keys(this.activation)) {
      const want = this.isOff(id) ? 0 : (act[id] || 0);
      this.activation[id] += (want - this.activation[id]) * ka;
      const mat = this.materials[id];
      const f = this.flashes[id];
      if (f) {
        f.t -= dt;
        mat.emissive.copy(f.color).multiplyScalar(Math.max(0, f.t / 0.45) * 0.8);
        if (f.t <= 0) delete this.flashes[id];
      } else if (id !== 'slacha') {
        mat.emissive.setRGB(0.55 * this.activation[id], 0.04 * this.activation[id], 0.02 * this.activation[id]);
      }
    }
    this.updateMuscles();
  }

  dispose() {
    const geos = new Set();
    this.root.traverse((o) => { if (o.geometry) geos.add(o.geometry); });
    this.muscleGroup.traverse((o) => { if (o.geometry) geos.add(o.geometry); });
    for (const g of geos) if (![LONG_BONE, BLOB, ROD, BOX].includes(g)) g.dispose();
    for (const m of Object.values(this.materials)) m.dispose();
    this.boneMat.dispose();
    this.darkMat.dispose();
    if (this.root.parent) this.root.parent.remove(this.root);
    if (this.muscleGroup.parent) this.muscleGroup.parent.remove(this.muscleGroup);
  }
}

/* Pomocné vektory (sdílené, aby se v každém snímku nevytvářely nové). */
Object.assign(Svalovec.prototype, {
  _a: new THREE.Vector3(), _b: new THREE.Vector3(), _d: new THREE.Vector3(), _n: new THREE.Vector3(),
  _x: new THREE.Vector3(), _m: new THREE.Matrix4(), _s: new THREE.Vector3(),
  _v1: new THREE.Vector3(), _v2: new THREE.Vector3(), _v3: new THREE.Vector3(),
  _q1: new THREE.Quaternion(), _q2: new THREE.Quaternion(),
});

export { ATTACK_MUSCLES, POSES };
