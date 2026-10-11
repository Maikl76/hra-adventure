/*
 * Počítání dřepů webkamerou (svět GSPORT). Načítá se až při zapnutí kamery (dynamický import).
 *
 * Postup ověřený na zkušební stránce zkousky/drepy.html:
 * - úhel v koleni ze 2D obrazu (hráč stojí BOKEM ke kameře – jen tak 2D úhel odpovídá flexi),
 * - stavový automat s hysterezí: stoj (> 160°) → sestup (< 145°) → dno (< hranice, výchozí 90°) → stoj,
 * - kontrola pohledu: stojí-li hráč čelem (široká ramena vůči trupu), dřepy se nepočítají a hra upozorní.
 * Obraz z kamery se zpracovává jen v prohlížeči, nic se neukládá ani neposílá.
 */

const BASE = new URL('../vendor/mediapipe/', import.meta.url).href;
const UP = 160;       // stoj
const START = 145;    // začátek sestupu
const VIS = 0.5;      // minimální viditelnost bodu
const FRONT_RATIO = 0.45;  // šířka ramen / délka trupu nad touto hodnotou = stojí čelem

let lib = null;
let landmarker = null;

async function loadModel(onStatus) {
  if (landmarker) return landmarker;
  onStatus('Načítám rozpoznávání postavy (poprvé asi 15 MB)…');
  lib = await import(`${BASE}vision_bundle.mjs`);
  const files = await lib.FilesetResolver.forVisionTasks(`${BASE}wasm`);
  const make = (delegate) => lib.PoseLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetPath: `${BASE}pose_landmarker_lite.task`, delegate },
    runningMode: 'VIDEO',
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  try {
    landmarker = await make('GPU');
  } catch (e) {
    landmarker = await make('CPU');
  }
  return landmarker;
}

/* Úhel v bodě b (stupně) mezi úsečkami b–a a b–c, v pixelech obrazu. */
function angle(a, b, c, w, h) {
  const ux = (a.x - b.x) * w, uy = (a.y - b.y) * h;
  const vx = (c.x - b.x) * w, vy = (c.y - b.y) * h;
  const nu = Math.hypot(ux, uy), nv = Math.hypot(vx, vy);
  if (!nu || !nv) return null;
  return Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (nu * nv)))) * 180 / Math.PI;
}

/* Úhel v koleni lépe viditelné nohy (bokem je bližší noha vidět lépe). */
function kneeAngle(lm, w, h) {
  const legs = [[23, 25, 27], [24, 26, 28]].map(([hp, k, a]) => ({
    vis: Math.min(lm[hp].visibility ?? 1, lm[k].visibility ?? 1, lm[a].visibility ?? 1),
    angle: angle(lm[hp], lm[k], lm[a], w, h),
    knee: lm[k],
  })).filter((l) => l.angle !== null).sort((x, y) => y.vis - x.vis);
  return legs[0] && legs[0].vis > VIS ? legs[0] : null;
}

/* Stojí hráč čelem? Šířka ramen v obraze vůči délce trupu (ramena–kyčle). */
function facingCamera(lm, w, h) {
  const sw = Math.hypot((lm[11].x - lm[12].x) * w, (lm[11].y - lm[12].y) * h);
  const mid = (i, j) => ({ x: (lm[i].x + lm[j].x) / 2, y: (lm[i].y + lm[j].y) / 2 });
  const s = mid(11, 12), p = mid(23, 24);
  const torso = Math.hypot((s.x - p.x) * w, (s.y - p.y) * h);
  return torso > 0 && sw / torso > FRONT_RATIO;
}

/**
 * Spustí kameru a počítání.
 * opts: { canvas, target, threshold, onStatus(text, kind), onCount(n), onAngle(deg), onBeep(kind), onDone(result) }
 * result: { n, t (s, od začátku prvního dřepu do konce posledního), uhel (nejhlubší úhel) }
 * Vrací objekt { stop() }.
 */
export async function startSquats(opts) {
  const { canvas, target = 15, threshold = 90 } = opts;
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
  try {
    await loadModel(status);
    await video.play();
  } catch (e) {
    stream.getTracks().forEach((t) => t.stop());
    throw e;
  }
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const draw = new lib.DrawingUtils(ctx);

  let raf = 0, lastTs = -1, stopped = false;
  let count = 0, phase = 'wait', minAngle = 999, reached = false, smooth = null;
  let firstStart = null, deepest = 999;

  function stop() {
    stopped = true;
    cancelAnimationFrame(raf);
    stream.getTracks().forEach((t) => t.stop());
  }

  function update(a, now) {
    smooth = smooth === null ? a : smooth * 0.6 + a * 0.4;
    const s = smooth;
    if (opts.onAngle) opts.onAngle(s);
    if (phase === 'wait') {
      if (s > UP) { phase = 'up'; status('Stojíš bokem – začni s dřepy.', 'ok'); }
      else status('Postav se rovně (natažená kolena).');
      return;
    }
    if (phase === 'up' && s < START) {
      phase = 'down'; minAngle = s; reached = false;
      if (firstStart === null) firstStart = now;
    }
    if (phase === 'down') {
      minAngle = Math.min(minAngle, s);
      if (!reached && s < threshold) { reached = true; status('Hloubka dosažena – nahoru!', 'ok'); }
      if (s > UP) {
        phase = 'up';
        if (reached) {
          count += 1;
          deepest = Math.min(deepest, minAngle);
          if (opts.onCount) opts.onCount(count);
          if (opts.onBeep) opts.onBeep('ok');
          if (count >= target) {
            const result = { n: count, t: Math.round((now - firstStart) / 100) / 10, uhel: Math.round(deepest) };
            status(`Hotovo! ${count} dřepů.`, 'ok');
            stop();
            if (opts.onDone) opts.onDone(result);
            return;
          }
          status(`Dřep č. ${count} započítán.`, 'ok');
        } else {
          if (opts.onBeep) opts.onBeep('shallow');
          status(`Mělký dřep (${Math.round(minAngle)}°) – hlouběji, pod ${threshold}°.`, 'bad');
        }
      }
    }
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
    if (!lm) { status('Nevidím tě – odstup dál a zkontroluj světlo.', 'bad'); return; }
    const mirrored = lm.map((p) => ({ ...p, x: 1 - p.x }));
    draw.drawConnectors(mirrored, lib.PoseLandmarker.POSE_CONNECTIONS, { color: 'rgba(63, 224, 255, 0.85)', lineWidth: 4 });
    draw.drawLandmarks(mirrored, { color: '#ff4fd8', radius: 4 });
    if (facingCamera(lm, w, h)) { status('Otoč se BOKEM ke kameře – čelem se dřepy nepočítají.', 'bad'); return; }
    const k = kneeAngle(lm, w, h);
    if (!k) { status('Nevidím celé nohy (kyčle, kolena, kotníky) – odstup dál.', 'bad'); return; }
    ctx.font = `${Math.round(h / 16)}px Georgia, serif`;
    ctx.fillStyle = '#9ff3ff';
    ctx.fillText(`${Math.round(smooth ?? k.angle)}°`, (1 - k.knee.x) * w + 14, k.knee.y * h);
    update(k.angle, now);
  }

  status('Postav se bokem ke kameře, celý v záběru.');
  loop();
  return { stop };
}
