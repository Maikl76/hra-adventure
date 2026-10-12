/*
 * Zkouška stability (vojenská tělovýchova): předklon s dosahem ke špičkám – jednou volně,
 * jednou patami u zdi. Načítá se až při zapnutí kamery (dynamický import).
 *
 * Hráč stojí BOKEM ke kameře. Z bodů MediaPipe (kyčel, kotník, pata, špička, zápěstí, rameno)
 * se měří:
 * - o kolik pánev ustoupila dozadu proti stoji (tělo tak drží těžiště nad chodidly),
 * - jak nízko nad zemí se dostaly ruce,
 * - zda hráč udělal krok dopředu (pata se posunula) – u zdi se těžiště dostane před špičky.
 * Centimetry jsou přibližné: přepočet přes standardní délku nohy (jako 70 kg u dřepů).
 * Kamera a model jsou stejné jako u dřepů (squats.js). Nic se neukládá ani neposílá.
 */
import { loadModel, poseLib, angle, facingCamera } from './squats.js?v=0.9';

const VIS = 0.5;          // minimální viditelnost bodu
const LEG_CM = 85;        // standardní vzdálenost kyčel–kotník (hráč asi 175 cm) pro přepočet na cm
const UPRIGHT = 20;       // trup do 20° od svislice = stoj
const BENT = 45;          // trup víc než 45° od svislice = předklon
const KNEE_STRAIGHT = 155;  // koleno pod tímto úhlem = pokrčené
const STEP_CM = 12;       // pata se posunula dopředu o víc = krok
const CALIB_FRAMES = 15;  // kolik snímků klidného stoje stačí na kalibraci
const END_FRAMES = 8;     // kolik snímků stoje po předklonu ukončí pokus
const REACH_DONE_CM = 5;  // ruce do 5 cm nad zemí = dosáhl ke špičkám

/* Body jedné strany těla (MediaPipe Pose): rameno, zápěstí, kyčel, koleno, kotník, pata, špička. */
const SIDES = [
  { shoulder: 11, wrist: 15, hip: 23, knee: 25, ankle: 27, heel: 29, toe: 31 },
  { shoulder: 12, wrist: 16, hip: 24, knee: 26, ankle: 28, heel: 30, toe: 32 },
];

const vis = (p) => (p && p.visibility !== undefined ? p.visibility : 1);

/* Lépe viditelná strana (bokem je bližší strana vidět lépe); null = nohy nejsou vidět. */
function pickSide(lm) {
  const scored = SIDES.map((s) => ({
    s,
    v: Math.min(vis(lm[s.hip]), vis(lm[s.knee]), vis(lm[s.ankle]), vis(lm[s.heel]), vis(lm[s.toe]), vis(lm[s.shoulder])),
  })).sort((a, b) => b.v - a.v);
  return scored[0].v > VIS ? scored[0].s : null;
}

/**
 * Vyhodnocení jednoho pokusu ze sledu snímků (čistá logika bez kamery – dá se testovat).
 * feed(lm, w, h) vrací { phase, message, kind } nebo { phase: 'done', result }.
 * result: { panev (cm dozadu), ruce (cm nad zemí), dosah (1/0), krok (1/0), kolena (1 = držel natažená) }
 */
export class LeanTracker {
  constructor() {
    this.reset();
  }

  reset() {
    this.phase = 'calib';
    this.calib = [];
    this.base = null;
    this.endCount = 0;
    this.best = null;
    this.smooth = {};
  }

  /* Vyhlazení hodnoty (šum z modelu). */
  ema(key, value, a = 0.5) {
    const prev = this.smooth[key];
    const v = prev === undefined ? value : prev * (1 - a) + value * a;
    this.smooth[key] = v;
    return v;
  }

  feed(lm, w, h) {
    if (this.phase === 'done') return { phase: 'done', result: this.result };
    const s = pickSide(lm);
    if (!s) return { phase: this.phase, message: 'Nevidím celé tělo i s chodidly – odstup dál a zkontroluj světlo.', kind: 'bad' };
    const P = (i) => ({ x: lm[i].x * w, y: lm[i].y * h });
    const sh = P(s.shoulder), hip = P(s.hip), ank = P(s.ankle), heel = P(s.heel), toe = P(s.toe);
    // sklon trupu od svislice (rameno nad kyčlí = 0°)
    const trunk = this.ema('trunk', Math.atan2(Math.abs(sh.x - hip.x), hip.y - sh.y) * 180 / Math.PI);
    const knee = angle(lm[s.hip], lm[s.knee], lm[s.ankle], w, h) ?? 180;

    if (this.phase === 'calib') {
      if (facingCamera(lm, w, h)) {
        this.calib = [];
        return { phase: 'calib', message: 'Otoč se BOKEM ke kameře.', kind: 'bad' };
      }
      if (trunk > UPRIGHT || knee < 160) {
        this.calib = [];
        return { phase: 'calib', message: 'Stůj rovně, nohy u sebe, kolena natažená…', kind: '' };
      }
      this.calib.push({ hip, ank, heel, toe });
      if (this.calib.length < CALIB_FRAMES) return { phase: 'calib', message: 'Stůj rovně… měřím stoj.', kind: '' };
      const avg = (f) => this.calib.reduce((sum, c) => sum + f(c), 0) / this.calib.length;
      const leg = avg((c) => Math.hypot(c.hip.x - c.ank.x, c.hip.y - c.ank.y));
      const dir = Math.sign(avg((c) => c.toe.x - c.heel.x)) || 1;   // kam míří špičky = dopředu
      this.base = {
        cm: LEG_CM / leg,                                         // cm na pixel
        dir,
        hip: avg((c) => (c.hip.x - c.heel.x) * dir),              // kyčel před patou (px)
        heel: avg((c) => c.heel.x),
        ground: avg((c) => Math.max(c.heel.y, c.toe.y)),
      };
      this.best = { back: 0, reach: Infinity, step: 0, knee: 180 };
      this.smooth = { trunk };
      this.phase = 'ready';
      return { phase: 'ready', message: 'Teď se pomalu předkloň a sáhni co nejníž ke špičkám.', kind: 'ok' };
    }

    // měření během předklonu
    const b = this.base;
    const back = this.ema('back', (b.hip - (hip.x - heel.x) * b.dir) * b.cm);      // o kolik pánev ustoupila dozadu
    const step = this.ema('step', (heel.x - b.heel) * b.dir * b.cm);              // posun paty dopředu
    const wrists = [lm[15], lm[16]].filter((p) => vis(p) > VIS).map((p) => p.y * h);
    if (wrists.length) {
      const reach = this.ema('reach', (b.ground - Math.max(...wrists)) * b.cm);
      if (this.phase === 'bend') this.best.reach = Math.min(this.best.reach, reach);
    }
    if (this.phase === 'ready') {
      if (trunk > BENT) {
        this.phase = 'bend';
        return { phase: 'bend', message: 'Níž… sáhni ke špičkám. Pak se narovnej.', kind: '' };
      }
      return { phase: 'ready', message: 'Teď se pomalu předkloň a sáhni co nejníž ke špičkám.', kind: 'ok' };
    }

    // phase === 'bend'
    this.best.back = Math.max(this.best.back, back);
    this.best.step = Math.max(this.best.step, step);
    this.best.knee = Math.min(this.best.knee, knee);
    if (trunk < UPRIGHT + 5) this.endCount += 1;
    else this.endCount = 0;
    if (this.endCount >= END_FRAMES) {
      const reach = Number.isFinite(this.best.reach) ? Math.max(0, Math.round(this.best.reach)) : null;
      this.result = {
        panev: Math.max(0, Math.round(this.best.back)),
        ruce: reach,
        dosah: reach !== null && reach <= REACH_DONE_CM ? 1 : 0,
        krok: this.best.step > STEP_CM ? 1 : 0,
        kolena: this.best.knee >= KNEE_STRAIGHT - 10 ? 1 : 0,
      };
      this.phase = 'done';
      return { phase: 'done', result: this.result };
    }
    if (knee < KNEE_STRAIGHT) return { phase: 'bend', message: 'Kolena nech natažená!', kind: 'bad' };
    if (this.best.step > STEP_CM) return { phase: 'bend', message: 'Krok dopředu – těžiště ti uteklo před špičky. Narovnej se.', kind: 'bad' };
    return { phase: 'bend', message: 'Níž… sáhni ke špičkám. Pak se narovnej.', kind: '' };
  }
}

/**
 * Spustí kameru. Měřit se začne až po begin(); každý dokončený pokus vrátí onAttempt(result).
 * opts: { canvas, onStatus(text, kind), onAttempt(result) }
 * Vrací { begin(), stop() }.
 */
export async function startLean(opts) {
  const { canvas } = opts;
  const status = opts.onStatus || (() => {});
  const ctx = canvas.getContext('2d');

  // nejdřív kamera (při odmítnutí se zbytečně nestahuje model), pak model
  status('Povol prosím přístup ke kameře…');
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
    audio: false,
  });
  const video = document.createElement('video');
  video.playsInline = true;
  video.muted = true;
  video.srcObject = stream;
  let landmarker;
  try {
    landmarker = await loadModel(status);
    await video.play();
  } catch (e) {
    stream.getTracks().forEach((t) => t.stop());
    throw e;
  }
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const lib = poseLib();
  const draw = new lib.DrawingUtils(ctx);

  const tracker = new LeanTracker();
  let measuring = false;
  let raf = 0, lastTs = -1, stopped = false;

  function stop() {
    stopped = true;
    cancelAnimationFrame(raf);
    stream.getTracks().forEach((t) => t.stop());
  }

  function begin() {
    tracker.reset();
    measuring = true;
  }

  function loop() {
    if (stopped) return;
    raf = requestAnimationFrame(loop);
    if (video.readyState < 2) return;
    const now = performance.now();
    if (now === lastTs) return;
    lastTs = now;
    const w = canvas.width, h = canvas.height;
    const result = landmarker.detectForVideo(video, now);
    // zrcadlový obraz
    ctx.save();
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, w, h);
    ctx.restore();
    const lm = result.landmarks && result.landmarks[0];
    if (!lm) {
      if (measuring) status('Nevidím tě – odstup dál a zkontroluj světlo.', 'bad');
      return;
    }
    const mirrored = lm.map((p) => ({ ...p, x: 1 - p.x }));
    draw.drawConnectors(mirrored, lib.PoseLandmarker.POSE_CONNECTIONS, { color: 'rgba(63, 224, 255, 0.85)', lineWidth: 4 });
    draw.drawLandmarks(mirrored, { color: '#ffd28a', radius: 4 });
    if (!measuring) return;
    const r = tracker.feed(lm, w, h);
    if (r.phase === 'done') {
      measuring = false;
      if (opts.onAttempt) opts.onAttempt(r.result);
      return;
    }
    status(r.message, r.kind);
  }

  status('Postav se bokem ke kameře, celý v záběru.');
  loop();
  return { begin, stop };
}
