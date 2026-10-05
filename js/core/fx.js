// Canvas FX (particles, floating text, camera shake) and a reusable full-screen scene runner.
import { fitCanvas, prefersReducedMotion, clamp, ease } from './util.js';

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
    const finish = () => {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      if (skipButton) skipButton.removeEventListener('click', onSkip);
      resolve(scene.result);
    };
    const onSkip = () => {
      if (scene.onSkip) scene.onSkip(api);
      finish();
    };
    const onResize = () => { const f = fitCanvas(canvas); api.w = f.w; api.h = f.h; };
    onResize();
    window.addEventListener('resize', onResize);
    if (skipButton) skipButton.addEventListener('click', onSkip);
    if (scene.init) scene.init(api);
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
