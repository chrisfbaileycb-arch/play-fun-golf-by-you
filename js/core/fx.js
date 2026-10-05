// Canvas FX (particles, floating text, camera shake) and a reusable full-screen scene runner.
import { fitCanvas, prefersReducedMotion, clamp, ease } from './util.js';
import { audioManager, sfx } from './audio.js';

export class FX {
  constructor() {
    this.parts = [];
    this.texts = [];
    this.shakeMag = 0;
    this.shakeT = 0;
    this.shakeDur = 0;
    this.flashA = 0;
    this.flashColor = '#fff';
  }

  sparks(x, y, { n = 24, color = '#ffd25a', speed = 260, life = 0.6, size = 2.5, gravity = 500, spread = Math.PI * 2, dir = 0, glow = true } = {}) {
    const count = prefersReducedMotion() ? Math.ceil(n / 3) : n;
    for (let i = 0; i < count; i++) {
      const a = dir + (Math.random() - 0.5) * spread;
      const v = speed * (0.35 + Math.random() * 0.8);
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: life * (0.6 + Math.random() * 0.6), max: life, size: size * (0.6 + Math.random() * 0.8), color: Array.isArray(color) ? color[i % color.length] : color, gravity, glow, kind: 'spark' });
    }
  }

  smoke(x, y, { n = 10, color = 'rgba(80,80,80,0.5)', life = 1.2, size = 14 } = {}) {
    for (let i = 0; i < n; i++) {
      this.parts.push({ x: x + (Math.random() - 0.5) * 20, y, vx: (Math.random() - 0.5) * 40, vy: -30 - Math.random() * 50, life: life * (0.7 + Math.random() * 0.5), max: life, size: size * (0.6 + Math.random()), color, gravity: -10, glow: false, kind: 'smoke' });
    }
  }

  confetti(x, y, { n = 60, colors = ['#e8443a', '#2f7de1', '#f4b62b', '#33b36b', '#fff'] } = {}) {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const v = 200 + Math.random() * 360;
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1.8 + Math.random(), max: 2.5, size: 4 + Math.random() * 4, color: colors[i % colors.length], gravity: 420, glow: false, kind: 'confetti', rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12 });
    }
  }

  /**
   * High-energy celebratory confetti blast specifically designed for Ace / Hole-In-One celebrations.
   */
  celebratoryConfetti(x, y, {
    n = 70,
    colors = ['#ffd700', '#f4b62b', '#e8443a', '#2f7de1', '#33b36b', '#9b59b6', '#ffffff'],
    power = 480,
    spread = 2.0,
  } = {}) {
    const count = prefersReducedMotion() ? Math.ceil(n / 3) : n;
    for (let i = 0; i < count; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * spread;
      const v = power * (0.35 + Math.random() * 0.85);
      this.parts.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: 2.2 + Math.random() * 1.2,
        max: 3.5,
        size: 5 + Math.random() * 6,
        color: colors[i % colors.length],
        gravity: 380,
        glow: false,
        kind: 'confetti',
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 14,
      });
    }
  }

  /**
   * Fires a festive sequence (cannons + banner text + flash + audio effects) specifically when score is 1.
   */
  celebrateScore(score, { w = 400, h = 300, x = null, y = null, triggerAudio = true } = {}) {
    const numericScore = typeof score === 'object' && score !== null ? (score.strokes ?? score.score) : Number(score);
    if (numericScore !== 1) return false;

    // Trigger audio manager hole-in-one sound effects (wind whoosh, crowd cheers, fanfare)
    if (triggerAudio !== false) {
      audioManager.onHoleInOne({ score: 1, w, h });
    }

    this.flash('#ffd700', 0.6);
    this.shake(12, 0.4);
    const cx = x ?? w / 2;
    const cy = y ?? h * 0.85;
    const leftX = w * 0.15;
    const rightX = w * 0.85;
    this.celebratoryConfetti(leftX, cy, { n: 45, spread: 1.2 });
    this.celebratoryConfetti(rightX, cy, { n: 45, spread: 1.2 });
    this.celebratoryConfetti(cx, cy * 0.7, { n: 60, spread: 2.4 });
    this.text(cx, h * 0.35, 'HOLE IN ONE! ⛳', {
      color: '#ffd700',
      size: Math.max(24, Math.round(w * 0.07)),
      stroke: '#051108',
      life: 2.5,
    });
    return true;
  }

  text(x, y, str, { color = '#fff', size = 28, life = 1.2, vy = -60, stroke = '#000', font = 'system-ui' } = {}) {
    this.texts.push({ x, y, str, color, size, life, max: life, vy, stroke, font });
  }

  shake(mag = 10, dur = 0.35) {
    if (prefersReducedMotion()) mag *= 0.25;
    this.shakeMag = Math.max(this.shakeMag, mag);
    this.shakeDur = dur;
    this.shakeT = dur;
  }

  flash(color = '#fff', a = 0.8) {
    this.flashColor = color;
    this.flashA = prefersReducedMotion() ? a * 0.3 : a;
  }

  update(dt) {
    for (const p of this.parts) {
      p.life -= dt;
      p.vy += p.gravity * dt;
      p.vx *= p.kind === 'confetti' ? 0.985 : 0.99;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.vr) p.rot += p.vr * dt;
    }
    this.parts = this.parts.filter((p) => p.life > 0);
    for (const t of this.texts) { t.life -= dt; t.y += t.vy * dt; }
    this.texts = this.texts.filter((t) => t.life > 0);
    if (this.shakeT > 0) this.shakeT -= dt;
    this.flashA = Math.max(0, this.flashA - dt * 2.5);
  }

  offset() {
    if (this.shakeT <= 0) return { x: 0, y: 0 };
    const k = this.shakeMag * (this.shakeT / this.shakeDur);
    return { x: (Math.random() - 0.5) * 2 * k, y: (Math.random() - 0.5) * 2 * k };
  }

  draw(ctx, w, h) {
    for (const p of this.parts) {
      const a = clamp(p.life / p.max, 0, 1);
      ctx.globalAlpha = p.kind === 'smoke' ? a * 0.6 : a;
      ctx.fillStyle = p.color;
      if (p.kind === 'confetti') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      } else {
        if (p.glow) { ctx.shadowColor = p.color; ctx.shadowBlur = 10; }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.kind === 'smoke' ? p.size * (1.6 - a) : p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
    ctx.globalAlpha = 1;
    for (const t of this.texts) {
      const a = clamp(t.life / t.max, 0, 1);
      const pop = ease.outBack(clamp((t.max - t.life) / 0.25, 0, 1));
      ctx.globalAlpha = a;
      ctx.font = `900 ${Math.round(t.size * (0.6 + 0.4 * pop))}px ${t.font}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 5;
      ctx.strokeStyle = t.stroke;
      ctx.lineJoin = 'round';
      ctx.strokeText(t.str, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, t.x, t.y);
    }
    ctx.globalAlpha = 1;
    if (this.flashA > 0) {
      ctx.globalAlpha = this.flashA;
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(-50, -50, w + 100, h + 100);
      ctx.globalAlpha = 1;
    }
  }
}

/** Shake a DOM element briefly (CSS transform only, compositor friendly). */
export function shakeElement(node, mag = 8, dur = 380) {
  if (!node || !node.animate) return;
  const m = prefersReducedMotion() ? mag * 0.25 : mag;
  const frames = [];
  for (let i = 0; i <= 8; i++) {
    const k = m * (1 - i / 8);
    frames.push({ transform: `translate(${(Math.random() - 0.5) * 2 * k}px, ${(Math.random() - 0.5) * 2 * k}px)` });
  }
  frames.push({ transform: 'translate(0,0)' });
  node.animate(frames, { duration: dur, easing: 'linear' });
}

/**
 * Run a canvas scene until it reports done or the user skips.
 * scene: { init?(api), update(dt, api), draw(ctx, w, h, api), done: boolean, onSkip?() }
 * Returns a Promise resolving with scene.result (if any).
 */
export function runScene(canvas, scene, { skipButton = null, speed = 1 } = {}) {
  return new Promise((resolve) => {
    const fx = new FX();
    const api = { fx, w: 0, h: 0, t: 0, canvas };
    let last = performance.now();
    let raf = 0;
    let finished = false;

    if (canvas) {
      canvas._activeFX = fx;
    }

    const finish = () => {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      if (skipButton) skipButton.removeEventListener('click', onSkip);
      if (canvas && canvas._activeFX === fx) {
        delete canvas._activeFX;
        delete canvas._activeFXW;
        delete canvas._activeFXH;
      }
      resolve(scene.result);
    };

    const onSkip = () => {
      if (scene.onSkip) scene.onSkip(api);
      finish();
    };

    const onResize = () => {
      const f = fitCanvas(canvas);
      api.w = f.w;
      api.h = f.h;
      if (canvas) {
        canvas._activeFXW = f.w;
        canvas._activeFXH = f.h;
      }
    };
    onResize();
    window.addEventListener('resize', onResize);
    if (skipButton) skipButton.addEventListener('click', onSkip);

    // Detect if this scene represents a Hole-in-One / score of 1
    const isScoreOfOne = Boolean(
      scene && (
        scene.score === 1 ||
        scene.strokes === 1 ||
        scene.isAce === true ||
        (scene.result && (scene.result.score === 1 || scene.result.strokes === 1)) ||
        (typeof scene.title === 'string' && /hole[- ]in[- ]one/i.test(scene.title))
      )
    );

    if (scene.init) scene.init(api);

    // Trigger celebratory confetti on the canvas specifically when score is 1
    let aceBurst2 = false;
    if (isScoreOfOne) {
      fx.celebrateScore(1, { w: api.w, h: api.h });
    }

    let doneAt = null;
    const frame = (now) => {
      if (finished) return;
      const dt = Math.min(0.05, (now - last) / 1000) * speed;
      last = now;
      api.t += dt;
      const ctx = canvas.getContext('2d');
      const { dpr } = fitCanvas(canvas);
      scene.update(dt, api);
      fx.update(dt);

      if (isScoreOfOne && !aceBurst2 && api.t >= 1.0) {
        aceBurst2 = true;
        fx.celebratoryConfetti(api.w * 0.5, api.h * 0.4, { n: 40, spread: 2.2 });
      }

      const o = fx.offset();
      ctx.setTransform(dpr, 0, 0, dpr, o.x * dpr, o.y * dpr);
      ctx.clearRect(-60, -60, api.w + 120, api.h + 120);
      scene.draw(ctx, api.w, api.h, api);
      fx.draw(ctx, api.w, api.h);
      if (scene.done && doneAt === null) doneAt = now;
      if (doneAt !== null && now - doneAt >= (scene.holdMs ?? 900)) return finish();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  });
}

/**
 * Triggers a celebratory confetti particle effect on the scene-canvas specifically
 * when the score engine detects a score of 1 on any hole.
 *
 * @param {number|object} score - The score from the score engine (or hole result with strokes: 1)
 * @param {HTMLCanvasElement|string} [canvas] - Target canvas element or selector (defaults to #scene-canvas)
 * @param {object} [options] - Additional options (particle count, colors, etc.)
 * @returns {boolean} True if the effect was triggered (score === 1), false otherwise
 */
export function triggerScoreCelebration(score, canvas = null, options = {}) {
  const numericScore = typeof score === 'object' && score !== null ? (score.strokes ?? score.score) : Number(score);
  if (numericScore !== 1) {
    return false;
  }

  // Trigger audio manager hole-in-one sound effects (crowd cheers, wind, etc.)
  if (options.triggerAudio !== false) {
    audioManager.onHoleInOne({ score: 1 });
  }

  const targetCanvas = typeof canvas === 'string'
    ? (typeof document !== 'undefined' && document.querySelector ? document.querySelector(canvas) : null)
    : (canvas || (typeof document !== 'undefined' ? (document.getElementById?.('scene-canvas') || (document.querySelector ? document.querySelector('.scene-canvas') : null)) : null));

  return triggerCelebratoryConfetti(targetCanvas, { ...options, triggerAudio: false });
}

/**
 * Triggers a celebratory confetti particle effect on the given or default #scene-canvas.
 *
 * @param {HTMLCanvasElement|string} [canvas] - Target canvas (defaults to #scene-canvas)
 * @param {object} [options] - Confetti options
 * @returns {boolean}
 */
export function triggerCelebratoryConfetti(canvas = null, options = {}) {
  const targetCanvas = typeof canvas === 'string'
    ? (typeof document !== 'undefined' && document.querySelector ? document.querySelector(canvas) : null)
    : (canvas || (typeof document !== 'undefined' ? (document.getElementById?.('scene-canvas') || (document.querySelector ? document.querySelector('.scene-canvas') : null)) : null));

  if (!targetCanvas) {
    return true; // Headless / simulated environment
  }

  if (targetCanvas._activeFX) {
    const w = targetCanvas._activeFXW || targetCanvas.width || 400;
    const h = targetCanvas._activeFXH || targetCanvas.height || 300;
    targetCanvas._activeFX.celebrateScore(1, { w, h, ...options });
    return true;
  }

  const fx = new FX();
  const { dpr, w, h } = fitCanvas(targetCanvas);
  targetCanvas._activeFX = fx;
  targetCanvas._activeFXW = w;
  targetCanvas._activeFXH = h;
  fx.celebrateScore(1, { w, h, ...options });

  if (typeof requestAnimationFrame === 'undefined') {
    delete targetCanvas._activeFX;
    return true;
  }

  let last = performance.now();
  let raf = 0;
  const loop = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    fx.update(dt);
    const ctx = targetCanvas.getContext?.('2d');
    if (ctx) {
      const o = fx.offset();
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, o.x * dpr, o.y * dpr);
      fx.draw(ctx, w, h);
      ctx.restore();
    }
    if (fx.parts.length > 0 || fx.texts.length > 0 || fx.flashA > 0 || fx.shakeT > 0) {
      raf = requestAnimationFrame(loop);
    } else {
      cancelAnimationFrame(raf);
      delete targetCanvas._activeFX;
      delete targetCanvas._activeFXW;
      delete targetCanvas._activeFXH;
    }
  };
  raf = requestAnimationFrame(loop);
  return true;
}

export const celebrateHoleInOne = (canvas, options) => triggerScoreCelebration(1, canvas, options);
export const checkScoreAndCelebrate = (score, canvas, options) => triggerScoreCelebration(score, canvas, options);

/** Simple timeline helper for scripted scenes: list of {at, fn} fired once as time passes. */
export class Timeline {
  constructor(events = []) {
    this.events = events.slice().sort((a, b) => a.at - b.at);
    this.i = 0;
    this.t = 0;
  }
  add(at, fn) { this.events.push({ at, fn }); this.events.sort((a, b) => a.at - b.at); return this; }
  update(dt) {
    this.t += dt;
    while (this.i < this.events.length && this.events[this.i].at <= this.t) {
      this.events[this.i].fn(this.t);
      this.i++;
    }
  }
  get finished() { return this.i >= this.events.length; }
}
