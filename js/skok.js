/*
 * Výskok z podřepu (SJ, squat jump) – GSPORT LEVEL 2. Načítá se až při zapnutí kamery.
 *
 * Hráč stojí BOKEM ke kameře, ruce v bok. Postup:
 *   stoj (kalibrace: výška země a délka nohy) → podřep (koleno pod 120°) a výdrž 1,5 s v klidu
 *   → pípnutí → výskok jen nahoru → dopad.
 * Doba letu = od chvíle, kdy nejnižší bod chodidel (pata nebo špička) vystoupí víc než 3 cm nad zem,
 * do chvíle, kdy na zem znovu dopadne. Okraje se dopočítají mezi dvěma snímky (lineárně), takže
 * výsledek není „zaokrouhlený“ na snímky kamery; čas pod prahem 3 cm se dopočítá z paraboly letu.
 * Když se hráč po výdrži ještě znovu spustí dolů (protipohyb), skok se nepočítá – nebyl by to SJ.
 * Obraz se zpracovává jen v prohlížeči, nic se neukládá ani neposílá.
 */
import { loadModel, poseLib, angle, facingCamera } from './squats.js?v=0.16';

const VIS = 0.5;          // minimální viditelnost bodu
const LEG_CM = 85;        // standardní vzdálenost kyčel–kotník (pro přepočet pixelů na cm)
const THR_CM = 3;         // chodidla výš než 3 cm nad zemí = ve vzduchu
const STAND = 160;        // koleno nad 160° = stoj
const SQUAT = 120;        // koleno pod 120° = podřep
const HOLD_MS = 1500;     // jak dlouho vydržet v podřepu
const STILL_CM = 3;       // „v klidu“ = boky se nepohnou víc než o 3 cm
const DROP_CM = 4;        // po pípnutí boky níž o víc než 4 cm = protipohyb (už to není SJ)
const CALIB_FRAMES = 15;
const READY_MS = 6000;    // na výskok po pípnutí je 6 s

const vis = (p) => (p && p.visibility !== undefined ? p.visibility : 1);

/* Úhel v koleni lépe viditelné nohy (nebo null). */
function knee(lm, w, h) {
  const legs = [[23, 25, 27], [24, 26, 28]]
    .map(([a, b, c]) => ({ v: Math.min(vis(lm[a]), vis(lm[b]), vis(lm[c])), a: angle(lm[a], lm[b], lm[c], w, h), hip: a, ank: c }))
    .filter((l) => l.a !== null)
    .sort((x, y) => y.v - x.v);
  return legs[0] && legs[0].v > VIS ? legs[0] : null;
}

/* Nejnižší viditelný bod chodidel (pata, špička) – y v pixelech (větší = níž). */
function footY(lm, h) {
  const ys = [29, 30, 31, 32].filter((i) => vis(lm[i]) > VIS).map((i) => lm[i].y * h);
  return ys.length ? Math.max(...ys) : null;
}

/**
 * Vyhodnocení jednoho skoku ze sledu snímků (čistá logika bez kamery – dá se testovat).
 * feed(lm, w, h, now) vrací { phase, message, kind, beep } nebo { phase: 'done', result }.
 * result: { t (doba letu v s), valid, reason }
 */
export class JumpTracker {
  constructor() {
    this.reset();
  }

  reset() {
    this.phase = 'calib';
    this.calib = [];
    this.base = null;
    this.hist = [];        // posledních pár vzorků { t, up } – výška chodidel nad zemí (px)
    this.result = null;
  }

  /* Okamžik, kdy výška chodidel prošla prahem mezi dvěma vzorky (lineárně). */
  crossing(a, b) {
    const thr = this.base.thr;
    if (b.up === a.up) return b.t;
    const f = (thr - a.up) / (b.up - a.up);
    return a.t + Math.max(0, Math.min(1, f)) * (b.t - a.t);
  }

  feed(lm, w, h, now) {
    if (this.phase === 'done') return { phase: 'done', result: this.result };
    const k = knee(lm, w, h);
    const fy = footY(lm, h);
    const hips = [23, 24].filter((i) => vis(lm[i]) > VIS).map((i) => lm[i].y * h);
    const hipY = hips.length ? hips.reduce((a, b) => a + b, 0) / hips.length : null;
    const tracking = k && fy !== null && hipY !== null;

    if (this.phase === 'calib') {
      if (!tracking) return { phase: 'calib', message: 'Nevidím celé tělo i s chodidly – odstup dál a zkontroluj světlo.', kind: 'bad' };
      if (facingCamera(lm, w, h)) { this.calib = []; return { phase: 'calib', message: 'Otoč se BOKEM ke kameře.', kind: 'bad' }; }
      if (k.a < STAND) { this.calib = []; return { phase: 'calib', message: 'Stůj rovně, ruce v bok…', kind: '' }; }
      const ank = lm[k.ank];
      const hip = lm[k.hip];
      this.calib.push({ fy, leg: Math.hypot((hip.x - ank.x) * w, (hip.y - ank.y) * h) });
      if (this.calib.length < CALIB_FRAMES) return { phase: 'calib', message: 'Stůj rovně… měřím stoj.', kind: '' };
      const avg = (f) => this.calib.reduce((s, c) => s + f(c), 0) / this.calib.length;
      const cm = avg((c) => c.leg) / LEG_CM;          // pixelů na centimetr
      this.base = { ground: avg((c) => c.fy), cm, thr: THR_CM * cm };
      this.phase = 'down';
      return { phase: 'down', message: 'Pomalu se spusť do podřepu (koleno asi 90°) a vydrž.', kind: 'ok' };
    }

    const b = this.base;
    // výška chodidel nad zemí (může chybět, když model na chvíli ztratí nohy)
    if (fy !== null) {
      this.hist.push({ t: now, up: b.ground - fy });
      if (this.hist.length > 12) this.hist.shift();
    }

    if (this.phase === 'down') {
      if (!tracking) return { phase: 'down', message: 'Nevidím tě celého – odstup dál.', kind: 'bad' };
      if (k.a < SQUAT) {
        this.phase = 'hold';
        this.holdStart = now;
        this.holdHip = hipY;
        return { phase: 'hold', message: 'Vydrž v podřepu…', kind: '' };
      }
      return { phase: 'down', message: 'Pomalu se spusť do podřepu (koleno asi 90°) a vydrž.', kind: '' };
    }

    if (this.phase === 'hold') {
      if (!tracking) return { phase: 'hold', message: 'Vydrž v podřepu…', kind: '' };
      if (k.a > SQUAT + 15) { this.phase = 'down'; return { phase: 'down', message: 'Zůstaň dole v podřepu – a vydrž.', kind: 'bad' }; }
      if (Math.abs(hipY - this.holdHip) > STILL_CM * b.cm) {
        this.holdStart = now;
        this.holdHip = hipY;
        return { phase: 'hold', message: 'Vydrž v klidu…', kind: '' };
      }
      this.holdHip += (hipY - this.holdHip) * 0.2;   // pomalé dosednutí do podřepu nevadí, jen skutečný pohyb
      if (now - this.holdStart >= HOLD_MS) {
        this.phase = 'ready';
        this.readyAt = now;
        this.readyHip = hipY;
        this.countered = false;
        return { phase: 'ready', message: 'TEĎ! Vyskoč – jen nahoru, bez dalšího podřepu.', kind: 'ok', beep: 'go' };
      }
      return { phase: 'hold', message: 'Vydrž v podřepu…', kind: '' };
    }

    const last = this.hist[this.hist.length - 1];
    const prev = this.hist[this.hist.length - 2];

    if (this.phase === 'ready') {
      if (hipY !== null && hipY > this.readyHip + DROP_CM * b.cm) this.countered = true;   // boky ještě dolů = protipohyb
      // odraz: dva vzorky po sobě nad prahem
      if (last && prev && last.up > b.thr && prev.up > b.thr) {
        const i = this.hist.findIndex((s, j) => j > 0 && s.up > b.thr && this.hist.slice(j).every((x) => x.up > b.thr));
        this.takeoff = i > 0 ? this.crossing(this.hist[i - 1], this.hist[i]) : prev.t;
        this.phase = 'air';
        return { phase: 'air', message: 'Letíš…', kind: '' };
      }
      if (now - this.readyAt > READY_MS) {
        this.phase = 'down';
        return { phase: 'down', message: 'Výskok jsem neviděl. Zkus to znovu: podřep, výdrž, a po pípnutí skok.', kind: 'bad' };
      }
      return { phase: 'ready', message: 'TEĎ! Vyskoč – jen nahoru, bez dalšího podřepu.', kind: 'ok' };
    }

    if (this.phase === 'air') {
      if (now - this.takeoff > 1500) {
        this.phase = 'down';
        return { phase: 'down', message: 'Ztratil jsem tě ve vzduchu. Zkus to znovu.', kind: 'bad' };
      }
      // dopad: dva vzorky po sobě na zemi
      if (last && prev && last.up <= b.thr && prev.up <= b.thr) {
        // poslední vzorek ve vzduchu a první na zemi
        let j = this.hist.length - 2;
        while (j > 0 && this.hist[j - 1].up <= b.thr) j--;
        const landing = j > 0 ? this.crossing(this.hist[j - 1], this.hist[j]) : prev.t;
        // Chodidla jsou „ve vzduchu“ až nad prahem 3 cm, takže změřený čas je o kousek kratší než
        // skutečný let. Pro let po parabole platí přesně: T = √(t² + 8c/g), c = práh v metrech.
        const tm = (landing - this.takeoff) / 1000;
        const t = Math.sqrt(tm * tm + (8 * THR_CM / 100) / 9.81);
        let reason = '';
        if (this.countered) reason = 'cm';
        else if (t < 0.15 || t > 1.0) reason = 'range';
        this.result = { t: Math.round(t * 1000) / 1000, valid: !reason, reason };
        this.phase = 'done';
        return { phase: 'done', result: this.result, beep: 'land' };
      }
      return { phase: 'air', message: 'Letíš…', kind: '' };
    }
    return { phase: this.phase, message: '', kind: '' };
  }
}

/**
 * Spustí kameru. Měřit se začne až po begin(); každý dokončený skok vrátí onAttempt(result).
 * opts: { canvas, onStatus(text, kind), onAttempt(result), onBeep(kind) }
 * Vrací { begin(), stop() }.
 */
export async function startJump(opts) {
  const { canvas } = opts;
  const status = opts.onStatus || (() => {});
  const ctx = canvas.getContext('2d');

  status('Povol prosím přístup ke kameře…');
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 60 }, facingMode: 'user' },
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
  const tracker = new JumpTracker();
  let measuring = false;
  let raf = 0, lastVideoTime = -1, stopped = false;

  function stop() {
    stopped = true;
    if (rvfc && video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(raf);
    cancelAnimationFrame(raf);
    stream.getTracks().forEach((t) => t.stop());
  }

  function begin() {
    tracker.reset();
    measuring = true;
  }

  // Každý nový snímek kamery: čas snímku bereme z videa (requestVideoFrameCallback), je přesnější
  // než čas vykreslení stránky; starší prohlížeče dostanou requestAnimationFrame + currentTime.
  const rvfc = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
  function next() {
    if (stopped) return;
    if (rvfc) raf = video.requestVideoFrameCallback((t, meta) => frame(meta.mediaTime * 1000));
    else raf = requestAnimationFrame(() => {
      if (video.currentTime !== lastVideoTime) { lastVideoTime = video.currentTime; frame(video.currentTime * 1000); } else next();
    });
  }

  function frame(mediaMs) {
    if (stopped) return;
    next();
    if (video.readyState < 2) return;
    const now = performance.now();
    const w = canvas.width, h = canvas.height;
    const result = landmarker.detectForVideo(video, now);
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
    draw.drawLandmarks(mirrored, { color: '#ff4fd8', radius: 4 });
    if (!measuring) return;
    const r = tracker.feed(lm, w, h, mediaMs);
    if (r.beep && opts.onBeep) opts.onBeep(r.beep);
    if (r.phase === 'done') {
      measuring = false;
      if (opts.onAttempt) opts.onAttempt(r.result);
      return;
    }
    status(r.message, r.kind);
  }

  status('Postav se bokem ke kameře, celý v záběru i s chodidly.');
  next();
  return { begin, stop };
}
