/*
 * Goblet dřep s kettlebellem (vojenská tělovýchova – tělocvična). Načítá se až při zapnutí kamery.
 *
 * Pravidla testu: lavička ve výšce kolene, na kterou se jen DOSEDNE (dotyk, žádné sezení); kolena
 * ani hlava nesmí být po celou dobu pohybu před špičkami. Limit 90 s, počítají se platné dřepy.
 *
 * Hráč stojí BOKEM ke kameře. Ze stoje se změří: kam míří špičky (svislice přes špičky), výška
 * kolene (= výška lavičky) a délka nohy (přepočet na cm, standardní noha 85 cm jako u předklonu).
 * Dotyk lavičky = kyčelní kloub klesne do výšky kolene ze stoje + asi 9 cm (kyčel je nad sedákem).
 * Neplatné opakování (koleno nebo hlava před špičkami, nedosedl, posadil se) se nezapočítá, ale hra
 * ho ukáže i s důvodem. Obraz se zpracovává jen v prohlížeči, nic se neukládá ani neposílá.
 *
 * Tolerance jsou záměrně velkorysé: model určuje body jen přibližně (koleno = střed kloubu, špička
 * bývá odhadnutá u prstů), takže přísné centimetry dělaly z dobrých dřepů neplatné. Koleno a hlava
 * musí být přes čáru špiček déle než pár snímků za sebou (ne jen záškub modelu). Doladit jde
 * v game.json: kneeTolCm, headTolCm, seatTolCm, sitSeconds.
 */
import { loadModel, poseLib, angle, facingCamera } from './squats.js?v=0.33';

const VIS = 0.5;            // minimální viditelnost bodu
const LEG_CM = 85;          // standardní vzdálenost kyčel–kotník pro přepočet pixelů na cm
const CALIB_FRAMES = 15;    // snímků klidného stoje na kalibraci
const HIP_ABOVE_SEAT = 9;   // kyčelní kloub je při dosednutí asi 9 cm nad sedákem
const SEAT_TOL = 8;         // tolerance dosednutí (cm): kyčel stačí dostat do výšky kolene + 9 + 8 cm
const START_DROP = 15;      // kyčel níž o víc než 15 cm = začal dřep
const STAND_TOL = 8;        // kyčel do 8 cm od stoje = stoj (mezera proti začátku dřepu brání kmitání)
const KNEE_TOL = 8;         // koleno smí být nejvýš 8 cm „přes“ svislici špiček (nepřesnost modelu)
const HEAD_TOL = 8;         // totéž pro hlavu (nos)
const BAD_FRAMES = 5;       // přes čáru aspoň 5 snímků za sebou (asi 0,2 s) = opravdu přes
const SIT_ZONE = 3;         // „sedí“ = kyčel do 3 cm od polohy na sedáku…
const SIT_MS = 1500;        // …déle než 1,5 s

/* Body jedné strany těla: kyčel, koleno, kotník, pata, špička, rameno. */
const SIDES = [
  { hip: 23, knee: 25, ankle: 27, heel: 29, toe: 31, shoulder: 11 },
  { hip: 24, knee: 26, ankle: 28, heel: 30, toe: 32, shoulder: 12 },
];
const HEAD = [0, 7, 8];     // nos, uši – nejpřednější viditelný bod hlavy

const vis = (p) => (p && p.visibility !== undefined ? p.visibility : 1);

function pickSide(lm) {
  const scored = SIDES.map((s) => ({
    s, v: Math.min(vis(lm[s.hip]), vis(lm[s.knee]), vis(lm[s.ankle]), vis(lm[s.heel]), vis(lm[s.toe])),
  })).sort((a, b) => b.v - a.v);
  return scored[0].v > VIS ? scored[0].s : null;
}

export const REASONS = {
  koleno: 'koleno před špičkou',
  hlava: 'hlava před špičkou',
  nedosedl: 'nedosedl na lavičku',
  sed: 'posadil se – stačí dotyk',
};

/**
 * Vyhodnocení ze sledu snímků (čistá logika bez kamery – dá se testovat).
 * feed(lm, w, h, now) → { phase, message, kind, rep? }; rep = { valid, reasons: [...] } při dokončení dřepu.
 * Fáze: calib (stoj a měření) → ready (čeká na start()) → count (počítá) → done (po finish()).
 */
export class GobletTracker {
  /* opts: { kneeTol, headTol, seatTol } v cm, sitMs v ms (lze doladit v game.json) */
  constructor(opts = {}) {
    this.kneeTol = opts.kneeTol ?? KNEE_TOL;
    this.headTol = opts.headTol ?? HEAD_TOL;
    this.seatTol = opts.seatTol ?? SEAT_TOL;
    this.sitMs = opts.sitMs ?? SIT_MS;
    this.reset();
  }

  reset() {
    this.phase = 'calib';
    this.calib = [];
    this.base = null;
    this.smooth = {};
    this.valid = 0;
    this.invalid = 0;
    this.reasons = { koleno: 0, hlava: 0, nedosedl: 0, sed: 0 };
    this.rep = null;
    this.standToes = [];
  }

  ema(key, v, a = 0.5) {
    const p = this.smooth[key];
    const s = p === undefined ? v : p * (1 - a) + v * a;
    this.smooth[key] = s;
    return s;
  }

  start() {
    if (this.phase === 'ready') this.phase = 'count';
  }

  /* Konec limitu: rozpracovaný dřep se nepočítá. */
  finish() {
    this.phase = 'done';
    this.rep = null;
    return { n: this.valid, neplatne: this.invalid, duvody: { ...this.reasons } };
  }

  /* Geometrie pro kreslení do obrazu: svislice špiček a výška kyčle při dotyku lavičky (px). */
  guides() {
    if (!this.base) return null;
    const b = this.base;
    return { toeX: b.toeX, seatHipY: b.ground - (b.kneeH + HIP_ABOVE_SEAT + this.seatTol) / b.cm, dir: b.dir };
  }

  feed(lm, w, h, now) {
    if (this.phase === 'done') return { phase: 'done' };
    const s = pickSide(lm);
    if (!s) return { phase: this.phase, message: 'Nevidím celé nohy i s chodidly – odstup dál a zkontroluj světlo.', kind: 'bad' };
    const P = (i) => ({ x: lm[i].x * w, y: lm[i].y * h });
    const hip = P(s.hip), knee = P(s.knee), ank = P(s.ankle), heel = P(s.heel), toe = P(s.toe);
    const kneeAng = angle(lm[s.hip], lm[s.knee], lm[s.ankle], w, h) ?? 180;
    const heads = HEAD.filter((i) => vis(lm[i]) > VIS).map((i) => lm[i].x * w);

    if (this.phase === 'calib') {
      if (facingCamera(lm, w, h)) {
        this.calib = [];
        return { phase: 'calib', message: 'Otoč se BOKEM ke kameře.', kind: 'bad' };
      }
      if (kneeAng < 160) {
        this.calib = [];
        return { phase: 'calib', message: 'Postav se rovně s kettlebellem u hrudníku…', kind: '' };
      }
      this.calib.push({ hip, knee, ank, heel, toe });
      if (this.calib.length < CALIB_FRAMES) return { phase: 'calib', message: 'Stůj klidně… měřím stoj.', kind: '' };
      const avg = (f) => this.calib.reduce((sum, c) => sum + f(c), 0) / this.calib.length;
      const leg = avg((c) => Math.hypot(c.hip.x - c.ank.x, c.hip.y - c.ank.y));
      const cm = LEG_CM / leg;                                      // cm na pixel
      const ground = avg((c) => Math.max(c.heel.y, c.toe.y));
      this.base = {
        cm,
        dir: Math.sign(avg((c) => c.toe.x - c.heel.x)) || 1,       // kam míří špičky = dopředu
        toeX: avg((c) => c.toe.x),
        ground,
        kneeH: (ground - avg((c) => c.knee.y)) * cm,                // výška kolene ve stoje = výška lavičky (cm)
        hipH: (ground - avg((c) => c.hip.y)) * cm,                  // výška kyčle ve stoje (cm)
      };
      this.smooth = {};
      this.phase = 'ready';
      return { phase: 'ready', message: 'Stoj změřen. Za chvíli start.', kind: 'ok' };
    }

    const b = this.base;
    const hipRaw = (b.ground - hip.y) * b.cm;
    const hipH = this.ema('hipH', hipRaw);
    const kneeFwd = this.ema('knee', (knee.x - b.toeX) * b.dir * b.cm);   // + = koleno před špičkami
    const headFwd = heads.length ? this.ema('head', (b.dir > 0 ? Math.max(...heads) : Math.min(...heads)) - b.toeX) * b.dir * b.cm : null;
    const seatH = b.kneeH + HIP_ABOVE_SEAT + this.seatTol;               // kyčel při dotyku lavičky
    const sitH = b.kneeH + HIP_ABOVE_SEAT + SIT_ZONE;                     // kyčel na sedáku
    const standing = hipH >= b.hipH - STAND_TOL && kneeAng > 150;

    if (this.phase === 'ready') return { phase: 'ready', message: 'Připrav se…', kind: '' };

    // stojí-li mezi dřepy, svislici špiček zpřesnit (kdyby se chodidla trochu posunula)
    if (standing && !this.rep) {
      this.standToes.push(toe.x);
      if (this.standToes.length > 10) this.standToes.shift();
      b.toeX = this.standToes.reduce((a, v) => a + v, 0) / this.standToes.length;
    }

    if (!this.rep) {
      if (hipH < b.hipH - START_DROP) {
        this.rep = { seated: false, bottomSince: null, kneeBad: 0, headBad: 0, reasons: new Set() };
      } else {
        return { phase: 'count', message: 'Dřep: dosedni na lavičku a zase se postav.', kind: '' };
      }
    }

    const r = this.rep;
    // přes čáru špiček se počítá, až když to trvá několik snímků za sebou
    r.kneeBad = kneeFwd > this.kneeTol ? r.kneeBad + 1 : 0;
    r.headBad = headFwd !== null && headFwd > this.headTol ? r.headBad + 1 : 0;
    if (r.kneeBad >= BAD_FRAMES) r.reasons.add('koleno');
    if (r.headBad >= BAD_FRAMES) r.reasons.add('hlava');
    // dotyk: stačí jednou (i nevyhlazená hodnota – rychlý dotyk vyhlazení „ořízne“)
    if (Math.min(hipRaw, hipH) <= seatH) r.seated = true;
    if (hipH <= sitH) {
      if (r.bottomSince === null) r.bottomSince = now;
      else if (now - r.bottomSince > this.sitMs) r.reasons.add('sed');
    } else {
      r.bottomSince = null;
    }

    if (standing) {
      if (!r.seated) r.reasons.add('nedosedl');
      const reasons = [...r.reasons];
      const valid = reasons.length === 0;
      if (valid) this.valid += 1;
      else {
        this.invalid += 1;
        for (const k of reasons) this.reasons[k] += 1;
      }
      this.rep = null;
      return {
        phase: 'count', rep: { valid, reasons },
        message: valid ? `Platný dřep č. ${this.valid}.` : `Neplatný: ${reasons.map((k) => REASONS[k]).join(', ')}.`,
        kind: valid ? 'ok' : 'bad',
      };
    }
    if (r.reasons.has('koleno')) return { phase: 'count', message: 'Koleno je před špičkou – boky víc dozadu!', kind: 'bad' };
    if (r.reasons.has('hlava')) return { phase: 'count', message: 'Hlava je před špičkou – méně se předkloň.', kind: 'bad' };
    if (r.reasons.has('sed')) return { phase: 'count', message: 'Sedíš – na lavičku se jen dotkni.', kind: 'bad' };
    return { phase: 'count', message: r.seated ? 'Dotyk – nahoru!' : 'Níž… až na dotyk lavičky.', kind: r.seated ? 'ok' : '' };
  }
}

/**
 * Spustí kameru. Po kalibraci zavolá onReady(); měřit se začne až po start() (po odpočtu).
 * opts: { canvas, kneeTol, headTol, seatTol, sitMs, onStatus(text, kind), onReady(), onRep(rep, stav) }
 * Vrací { start(), finish() → výsledek, stop() }.
 */
export async function startGoblet(opts) {
  const { canvas } = opts;
  const status = opts.onStatus || (() => {});
  const ctx = canvas.getContext('2d');

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
  const tracker = new GobletTracker({ kneeTol: opts.kneeTol, headTol: opts.headTol, seatTol: opts.seatTol, sitMs: opts.sitMs });
  let raf = 0, lastTs = -1, stopped = false, readySent = false;

  function stop() {
    stopped = true;
    cancelAnimationFrame(raf);
    stream.getTracks().forEach((t) => t.stop());
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
    ctx.save();
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, w, h);
    ctx.restore();
    const lm = result.landmarks && result.landmarks[0];
    if (!lm) { status('Nevidím tě – odstup dál a zkontroluj světlo.', 'bad'); return; }
    const mirrored = lm.map((p) => ({ ...p, x: 1 - p.x }));
    draw.drawConnectors(mirrored, lib.PoseLandmarker.POSE_CONNECTIONS, { color: 'rgba(63, 224, 255, 0.85)', lineWidth: 4 });
    draw.drawLandmarks(mirrored, { color: '#ffd28a', radius: 4 });
    const r = tracker.feed(lm, w, h, now);
    // pomocné čáry: svislice přes špičky a výška kyčle při dotyku lavičky (v zrcadlovém obraze)
    const gd = tracker.guides();
    if (gd) {
      const x = w - gd.toeX;
      ctx.strokeStyle = r.kind === 'bad' ? 'rgba(255, 110, 90, 0.9)' : 'rgba(160, 230, 120, 0.9)';
      ctx.lineWidth = 3;
      ctx.setLineDash([12, 8]);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      ctx.strokeStyle = 'rgba(255, 210, 138, 0.85)';
      ctx.beginPath(); ctx.moveTo(0, gd.seatHipY); ctx.lineTo(w, gd.seatHipY); ctx.stroke();
      ctx.setLineDash([]);
    }
    if (r.phase === 'ready' && !readySent) { readySent = true; if (opts.onReady) opts.onReady(); }
    if (r.rep && opts.onRep) opts.onRep(r.rep, { n: tracker.valid, neplatne: tracker.invalid });
    if (r.message) status(r.message, r.kind);
  }

  status('Postav se bokem ke kameře, celý v záběru i s chodidly.');
  loop();
  return {
    start: () => tracker.start(),
    finish: () => tracker.finish(),
    stop,
  };
}
