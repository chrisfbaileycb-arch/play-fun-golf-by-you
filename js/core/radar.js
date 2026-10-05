// Top-down GPS/target radar renderer for a synthesized hole.
// The radar owns its animation loop; modes can draw on top via `overlay(ctx, view, t)`.
import { fitCanvas, clamp } from './util.js';
import { RING, pointAtS, normalAtS } from './fairway.js';

export const RADAR_THEMES = {
  knight: {
    bg: '#0e1f17', grid: 'rgba(120,255,180,0.06)', rough: '#2c5a32', fairway: '#4f9a3f', stripe: 'rgba(255,255,255,0.05)',
    green: '#6fcf5a', fringe: '#3f8f3a', sand: '#e7d39a', sandEdge: '#b89d5c', water: '#2a6fb0', waterEdge: '#8fd0ff',
    ring: ['#ffd76a', '#ff9f43', '#ff5e57'], lz: '#7ef9ff', tee: '#d6c9a1', ob: '#ffffff', sweep: 'rgba(120,255,180,0.18)',
    text: '#f5ecd2', textStroke: '#0b1510',
  },
  boardwalk: {
    bg: '#1b2a3a', grid: 'rgba(255,255,255,0.05)', rough: '#3d7d47', fairway: '#62b34f', stripe: 'rgba(255,255,255,0.07)',
    green: '#8be36f', fringe: '#4e9e45', sand: '#ffe2a0', sandEdge: '#d9a64a', water: '#2fa4e7', waterEdge: '#b8ecff',
    ring: ['#ff4fd8', '#ffe94a', '#4af2ff'], lz: '#ffe94a', tee: '#f2e6c8', ob: '#ffffff', sweep: 'rgba(74,242,255,0.14)',
    text: '#ffffff', textStroke: '#14202c',
  },
};

export class Radar {
  constructor(canvas, { theme = 'knight', onTap = null } = {}) {
    this.canvas = canvas;
    this.theme = RADAR_THEMES[theme] || RADAR_THEMES.knight;
    this.onTap = onTap;
    this.geo = null;
    this.balls = [];
    this.trails = [];
    this.aim = null;
    this.overlay = null;
    this.t = 0;
    this.running = false;
    this.view = null;
    this.flights = []; // animated ball flights {from,to,color,t,dur}
    this._onPointer = (e) => this.handlePointer(e);
    canvas.addEventListener('pointerdown', this._onPointer);
    this._ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => this.draw()) : null;
    if (this._ro) this._ro.observe(canvas);
  }

  setTheme(name) { this.theme = RADAR_THEMES[name] || this.theme; }
  setHole(geo) { this.geo = geo; this.flights = []; }
  setBalls(balls) { this.balls = balls; }
  setTrails(trails) { this.trails = trails; }
  setAim(p) { this.aim = p; }
  setOverlay(fn) { this.overlay = fn; }

  flight(from, to, color, dur = 0.9) {
    this.flights.push({ from, to, color, t: 0, dur });
  }

  start() {
    if (this.running) return;
    this.running = true;
    let last = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      this.t += dt;
      for (const f of this.flights) f.t += dt;
      this.flights = this.flights.filter((f) => f.t < f.dur + 0.4);
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  destroy() {
    this.stop();
    this.canvas.removeEventListener('pointerdown', this._onPointer);
    if (this._ro) this._ro.disconnect();
  }

  computeView(w, h) {
    const b = this.geo.bounds;
    const ww = b.maxX - b.minX, hh = b.maxY - b.minY;
    const k = Math.min((w - 24) / ww, (h - 24) / hh);
    const ox = w / 2 - ((b.minX + b.maxX) / 2) * k;
    const oy = h / 2 + ((b.minY + b.maxY) / 2) * k;
    return {
      k, w, h,
      toScreen: (p) => ({ x: ox + p.x * k, y: oy - p.y * k }),
      toWorld: (s) => ({ x: (s.x - ox) / k, y: (oy - s.y) / k }),
    };
  }

  handlePointer(e) {
    if (!this.geo || !this.view || !this.onTap) return;
    const r = this.canvas.getBoundingClientRect();
    const p = this.view.toWorld({ x: e.clientX - r.left, y: e.clientY - r.top });
    this.onTap(p);
  }

  draw() {
    if (!this.geo) return;
    const { w, h, ctx } = fitCanvas(this.canvas);
    const T = this.theme, g = this.geo;
    const v = (this.view = this.computeView(w, h));
    const S = v.toScreen, k = v.k;

    ctx.fillStyle = T.bg;
    ctx.fillRect(0, 0, w, h);
    // radar grid
    ctx.strokeStyle = T.grid;
    ctx.lineWidth = 1;
    const step = 25 * k;
    if (step > 6) {
      const o = S({ x: 0, y: 0 });
      for (let x = o.x % step; x < w; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      for (let y = o.y % step; y < h; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    }

    const strokePath = (width, color, from = 0, to = g.yards) => {
      ctx.beginPath();
      let first = true;
      for (const p of g.path) {
        if (p.s < from || p.s > to) continue;
        const s = S(p);
        if (first) { ctx.moveTo(s.x, s.y); first = false; } else ctx.lineTo(s.x, s.y);
      }
      ctx.lineWidth = width * k;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = color;
      ctx.stroke();
    };

    // OB stakes
    ctx.fillStyle = T.ob;
    for (let s = 20; s < g.yards; s += 22) {
      const p = pointAtS(g.path, s), n = normalAtS(g.path, s);
      const off = g.fairwayWidth / 2 + g.roughWidth + 2;
      for (const side of [-1, 1]) {
        const q = S({ x: p.x + n.x * off * side, y: p.y + n.y * off * side });
        ctx.globalAlpha = 0.7;
        ctx.fillRect(q.x - 1.5, q.y - 1.5, 3, 3);
      }
    }
    ctx.globalAlpha = 1;

    strokePath(g.fairwayWidth + g.roughWidth * 2, T.rough);
    strokePath(g.fairwayWidth, T.fairway, g.fairwayStart, g.fairwayEnd);
    // mow stripes
    for (let s = g.fairwayStart; s < g.fairwayEnd; s += 20) {
      if (Math.floor(s / 20) % 2) strokePath(g.fairwayWidth * 0.98, T.stripe, s, Math.min(s + 10, g.fairwayEnd));
    }

    // water
    for (const wtr of g.water) this.ellipse(ctx, v, wtr, T.water, T.waterEdge, true);
    // green
    const gc = S(g.green);
    ctx.beginPath(); ctx.arc(gc.x, gc.y, (g.green.r + 3) * k, 0, Math.PI * 2); ctx.fillStyle = T.fringe; ctx.fill();
    ctx.beginPath(); ctx.arc(gc.x, gc.y, g.green.r * k, 0, Math.PI * 2); ctx.fillStyle = T.green; ctx.fill();
    // bunkers
    for (const b of g.bunkers) this.ellipse(ctx, v, b, T.sand, T.sandEdge, false);

    // tee box
    const tp = S(g.tee);
    ctx.fillStyle = T.tee;
    ctx.fillRect(tp.x - (g.tee.w / 2) * k, tp.y - (g.tee.h / 2) * k, g.tee.w * k, g.tee.h * k);

    // landing zone target rings
    for (const lz of g.landingZones) {
      const c = S(lz);
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 2.4 + lz.s);
      this.glowRing(ctx, c, lz.r * k, T.lz, 0.35 + pulse * 0.3, 2);
      this.glowRing(ctx, c, lz.inner * k, T.lz, 0.6 + pulse * 0.3, 2.5);
    }

    // pin target rings (outer / inner / bullseye)
    const pc = S(g.pin);
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 3);
    this.glowRing(ctx, pc, g.green.r * k, T.ring[2], 0.55 + pulse * 0.25, 2.5);
    this.glowRing(ctx, pc, RING.inner * k, T.ring[1], 0.7 + pulse * 0.2, 3);
    this.glowRing(ctx, pc, Math.max(RING.bullseye * k, 4), T.ring[0], 0.9, 3.5, true);
    // flag
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(pc.x, pc.y); ctx.lineTo(pc.x, pc.y - 26); ctx.stroke();
    const wave = Math.sin(this.t * 5) * 2;
    ctx.fillStyle = T.ring[2];
    ctx.beginPath(); ctx.moveTo(pc.x, pc.y - 26); ctx.lineTo(pc.x + 14, pc.y - 21 + wave); ctx.lineTo(pc.x, pc.y - 16); ctx.closePath(); ctx.fill();

    // yardage markers from pin
    ctx.font = '700 11px system-ui';
    ctx.textAlign = 'left';
    for (const yd of [50, 100, 150, 200, 250]) {
      const s = g.yards - yd;
      if (s < 25) continue;
      const p = pointAtS(g.path, s), n = normalAtS(g.path, s);
      const q = S({ x: p.x + n.x * (g.fairwayWidth / 2 + 2), y: p.y + n.y * (g.fairwayWidth / 2 + 2) });
      ctx.fillStyle = yd === 100 ? '#ff6b6b' : yd === 150 ? '#ffffff' : yd === 200 ? '#4aa3ff' : '#ffd84a';
      ctx.beginPath(); ctx.arc(q.x, q.y, 3, 0, Math.PI * 2); ctx.fill();
      this.label(ctx, `${yd}`, q.x + 6, q.y + 4, 11);
    }

    // trails
    for (const tr of this.trails) {
      ctx.strokeStyle = tr.color;
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      for (const sh of tr.shots) {
        const a = S(sh.from), b = S(sh.to);
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 - Math.min(40, Math.hypot(b.x - a.x, b.y - a.y) * 0.25);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(mx, my, b.x, b.y); ctx.stroke();
        ctx.beginPath(); ctx.arc(b.x, b.y, 2.5, 0, Math.PI * 2); ctx.fillStyle = tr.color; ctx.fill();
      }
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    if (this.overlay) {
      try { this.overlay(ctx, v, this.t); } catch (err) { console.error('overlay error', err); }
    }

    // aim reticle
    if (this.aim) {
      const a = S(this.aim);
      const r = 10 + Math.sin(this.t * 6) * 2;
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(a.x, a.y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(a.x - r - 5, a.y); ctx.lineTo(a.x + r + 5, a.y); ctx.moveTo(a.x, a.y - r - 5); ctx.lineTo(a.x, a.y + r + 5); ctx.stroke();
    }

    // flights in progress
    for (const f of this.flights) {
      const tt = clamp(f.t / f.dur, 0, 1);
      const a = S(f.from), b = S(f.to);
      const hgt = Math.min(80, Math.hypot(b.x - a.x, b.y - a.y) * 0.35);
      const x = a.x + (b.x - a.x) * tt, y = a.y + (b.y - a.y) * tt - Math.sin(Math.PI * tt) * hgt;
      ctx.beginPath(); ctx.arc(a.x + (b.x - a.x) * tt, a.y + (b.y - a.y) * tt, 3, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.shadowColor = f.color; ctx.shadowBlur = 12; ctx.fill(); ctx.shadowBlur = 0;
    }

    // balls
    for (const bl of this.balls) {
      const s = S(bl.pos);
      const inFlight = this.flights.some((f) => f.color === bl.color && f.t < f.dur);
      if (inFlight) continue;
      if (bl.active) {
        ctx.strokeStyle = bl.color; ctx.lineWidth = 2; ctx.globalAlpha = 0.5 + 0.5 * pulse;
        ctx.beginPath(); ctx.arc(s.x, s.y, 11 + pulse * 3, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.beginPath(); ctx.arc(s.x, s.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = bl.color; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
      if (bl.label) this.label(ctx, bl.label, s.x + 9, s.y - 8, 12);
    }

    // sweep
    const sweepA = (this.t * 0.9) % (Math.PI * 2);
    const R = Math.hypot(w, h);
    const grad = ctx.createConicGradient ? ctx.createConicGradient(sweepA, pc.x, pc.y) : null;
    if (grad) {
      grad.addColorStop(0, T.sweep);
      grad.addColorStop(0.08, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(pc.x, pc.y, R, 0, Math.PI * 2); ctx.fill();
    }
  }

  ellipse(ctx, v, e, fill, edge, ripple) {
    const c = v.toScreen(e);
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(-e.rot);
    ctx.beginPath();
    ctx.ellipse(0, 0, e.rx * v.k, e.ry * v.k, 0, 0, Math.PI * 2);
    ctx.fillStyle = fill; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = edge; ctx.stroke();
    if (ripple) {
      ctx.globalAlpha = 0.35;
      const r = (this.t * 0.6) % 1;
      ctx.beginPath(); ctx.ellipse(0, 0, e.rx * v.k * r, e.ry * v.k * r, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  glowRing(ctx, c, r, color, alpha, width, fill = false) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.stroke();
    if (fill) { ctx.globalAlpha = alpha * 0.35; ctx.fillStyle = color; ctx.fill(); }
    ctx.restore();
  }

  label(ctx, text, x, y, size = 12) {
    ctx.font = `800 ${size}px system-ui`;
    ctx.textAlign = 'left';
    ctx.lineWidth = 3;
    ctx.strokeStyle = this.theme.textStroke;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = this.theme.text;
    ctx.fillText(text, x, y);
  }
}
