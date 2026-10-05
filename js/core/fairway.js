// Procedural Fairway Synthesizer.
// Converts compact hole data ({par, yards, dogleg, hazards, seed}) into deterministic
// geometry measured in YARDS. Hole space: tee at (0,0), +y runs toward the pin.
// Everything here is pure so it is unit-testable and shared by both suites.

import { mulberry32, hashStr, dist, clamp, randRange } from './util.js';

/** Unified landing zones. Suites relabel/merge these in their UIs. */
export const ZONES = ['cup', 'bullseye', 'inner', 'green', 'fairway', 'roughL', 'roughR', 'sand', 'water', 'ob'];

export const RING = { bullseye: 3, inner: 8 }; // yards from pin; outer ring = green radius
export const ROUGH_WIDTH = 28;

const geoCache = new Map();

export function holeKey(h) {
  return [h.par, h.yards, h.dogleg, h.hazards?.bunkers, h.hazards?.water ? 1 : 0, h.seed].join('|');
}

/** Build (and memoise) geometry for a hole definition. */
export function synthesize(hole) {
  const key = holeKey(hole);
  if (geoCache.has(key)) return geoCache.get(key);
  const geo = buildGeometry(hole);
  geoCache.set(key, geo);
  return geo;
}

function quad(p0, p1, p2, t) {
  const u = 1 - t;
  return { x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x, y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y };
}

function buildGeometry(hole) {
  const par = clamp(hole.par | 0 || 4, 3, 5);
  const yards = clamp(Number(hole.yards) || 350, 60, 700);
  const dogleg = clamp(Number(hole.dogleg) || 0, -1, 1);
  const seed = hole.seed ?? hashStr(`${par}-${yards}-${dogleg}`);
  const rng = mulberry32(seed);

  // Centre line: quadratic bezier, then rescaled so its arc length == yards.
  const p0 = { x: 0, y: 0 };
  const p1 = { x: 0, y: yards * 0.58 };
  const p2 = { x: dogleg * yards * 0.42, y: yards * 0.92 };
  const N = 72;
  let raw = [];
  for (let i = 0; i <= N; i++) raw.push(quad(p0, p1, p2, i / N));
  let L = 0;
  for (let i = 1; i < raw.length; i++) L += dist(raw[i - 1], raw[i]);
  const k = yards / L;
  const path = [];
  let s = 0;
  for (let i = 0; i < raw.length; i++) {
    const p = { x: raw[i].x * k, y: raw[i].y * k };
    if (i > 0) s += dist(path[i - 1], p);
    path.push({ x: p.x, y: p.y, s });
  }
  const pin = { x: path[N].x, y: path[N].y };

  const fairwayWidth = par === 3 ? 30 : par === 4 ? 38 : 42;
  const fairwayStart = par === 3 ? yards * 0.55 : Math.min(yards * 0.3, 140);
  const fairwayEnd = yards - (par === 3 ? 14 : 18);
  const greenR = par === 3 ? 13 : par === 4 ? 15 : 17;
  const green = { x: pin.x + randRange(rng, -3, 3), y: pin.y + randRange(rng, -2, 4), r: greenR };

  // Landing-zone drop targets (arcade-style fairway target rings).
  const landingZones = [];
  if (par >= 4) {
    const s1 = Math.min(250, yards * (par === 4 ? 0.62 : 0.45));
    landingZones.push({ id: 'LZ1', ...pointAtS(path, s1), r: 18, inner: 8 });
  }
  if (par === 5) {
    const s2 = Math.min(yards - 110, yards * 0.75);
    landingZones.push({ id: 'LZ2', ...pointAtS(path, s2), r: 16, inner: 7 });
  }

  // Bunkers: greenside first, then fairway bunkers flanking landing zones.
  const nb = hole.hazards?.bunkers ?? (par === 3 ? 2 : par === 4 ? 3 : 4);
  const bunkers = [];
  for (let i = 0; i < nb; i++) {
    if (i < 2 || landingZones.length === 0) {
      const ang = (i % 2 === 0 ? -1 : 1) * randRange(rng, 0.9, 2.1) + Math.PI / 2;
      const d = greenR + randRange(rng, 3, 6);
      bunkers.push({
        x: green.x + Math.cos(ang) * d, y: green.y + Math.sin(ang) * d * 0.9 - 4,
        rx: randRange(rng, 6, 9), ry: randRange(rng, 3.5, 5), rot: randRange(rng, -0.8, 0.8), greenside: true,
      });
    } else {
      const lz = landingZones[(i - 2) % landingZones.length];
      const side = i % 2 === 0 ? 1 : -1;
      const n = normalAtS(path, lz.s);
      const off = fairwayWidth / 2 + randRange(rng, -2, 4);
      bunkers.push({
        x: lz.x + n.x * off * side + randRange(rng, -4, 4), y: lz.y + n.y * off * side + randRange(rng, -8, 8),
        rx: randRange(rng, 8, 12), ry: randRange(rng, 4, 6), rot: randRange(rng, -0.5, 0.5), greenside: false,
      });
    }
  }

  // Water: a pond crossing/flanking mid-fairway (or fronting the green on par 3s).
  const water = [];
  if (hole.hazards?.water) {
    if (par === 3) {
      const before = pointAtS(path, yards - greenR - 22);
      water.push({ x: before.x, y: before.y, rx: 22, ry: 9, rot: 0 });
    } else {
      const ws = yards * randRange(rng, 0.42, 0.55);
      const p = pointAtS(path, ws);
      const n = normalAtS(path, ws);
      const side = rng() < 0.5 ? -1 : 1;
      const off = fairwayWidth * 0.55 + 8;
      water.push({ x: p.x + n.x * off * side, y: p.y + n.y * off * side, rx: 16, ry: 26, rot: randRange(rng, -0.4, 0.4) });
    }
  }

  const tee = { x: 0, y: 0, w: 14, h: 8 };
  const pad = fairwayWidth / 2 + ROUGH_WIDTH + 12;
  const xs = path.map((p) => p.x);
  const bounds = {
    minX: Math.min(...xs) - pad, maxX: Math.max(...xs) + pad,
    minY: -18, maxY: pin.y + greenR + 22,
  };

  return {
    par, yards, dogleg, seed, path, pin, green, tee, fairwayWidth, fairwayStart, fairwayEnd,
    roughWidth: ROUGH_WIDTH, landingZones, bunkers, water, bounds,
  };
}

export function pointAtS(path, s) {
  const target = clamp(s, 0, path[path.length - 1].s);
  for (let i = 1; i < path.length; i++) {
    if (path[i].s >= target) {
      const a = path[i - 1], b = path[i];
      const t = (target - a.s) / (b.s - a.s || 1);
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, s: target };
    }
  }
  const last = path[path.length - 1];
  return { x: last.x, y: last.y, s: last.s };
}

export function normalAtS(path, s) {
  const a = pointAtS(path, s - 2), b = pointAtS(path, s + 2);
  const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
  return { x: dy / l, y: -dx / l }; // right-hand normal (facing the pin)
}

/** Project point to the centre line: returns {s, d (unsigned), side (+1 right/-1 left)}. */
export function projectToPath(path, p) {
  let best = { d: Infinity, s: 0, side: 1 };
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const vx = b.x - a.x, vy = b.y - a.y;
    const len2 = vx * vx + vy * vy || 1;
    const t = clamp(((p.x - a.x) * vx + (p.y - a.y) * vy) / len2, 0, 1);
    const qx = a.x + vx * t, qy = a.y + vy * t;
    const d = Math.hypot(p.x - qx, p.y - qy);
    if (d < best.d) {
      const cross = vx * (p.y - a.y) - vy * (p.x - a.x);
      best = { d, s: a.s + (b.s - a.s) * t, side: cross > 0 ? -1 : 1 };
    }
  }
  return best;
}

export function inEllipse(e, p, grow = 0) {
  const c = Math.cos(-e.rot), s = Math.sin(-e.rot);
  const dx = p.x - e.x, dy = p.y - e.y;
  const x = dx * c - dy * s, y = dx * s + dy * c;
  return (x * x) / ((e.rx + grow) ** 2) + (y * y) / ((e.ry + grow) ** 2) <= 1;
}

/** Classify a hole-space point into a landing zone (never returns 'cup'; holing is explicit). */
export function classifyPoint(geo, p) {
  if (geo.water.some((w) => inEllipse(w, p))) return 'water';
  if (geo.bunkers.some((b) => inEllipse(b, p))) return 'sand';
  const dPin = dist(p, geo.pin);
  if (dPin <= RING.bullseye) return 'bullseye';
  if (dPin <= RING.inner) return 'inner';
  if (dist(p, geo.green) <= geo.green.r) return 'green';
  const pr = projectToPath(geo.path, p);
  const half = geo.fairwayWidth / 2;
  if (pr.d <= half && pr.s >= geo.fairwayStart && pr.s <= geo.fairwayEnd + 6) return 'fairway';
  if (dist(p, geo.tee) <= 9) return 'fairway';
  if (pr.d <= half + geo.roughWidth || dist(p, geo.green) <= geo.green.r + 10) return pr.side < 0 ? 'roughL' : 'roughR';
  if (p.y > geo.pin.y + geo.green.r + 14) return 'ob';
  return 'ob';
}

/** Target ring for proximity-based scoring. */
export function ringFor(geo, p) {
  const d = dist(p, geo.pin);
  if (d <= RING.bullseye) return 'bullseye';
  if (d <= RING.inner) return 'inner';
  if (d <= geo.green.r) return 'outer';
  return null;
}

/** Landing point from launch-monitor style numbers: carry along aim line + signed offline (right = +). */
export function landingFromCarry(geo, from, carry, offline = 0) {
  const dx = geo.pin.x - from.x, dy = geo.pin.y - from.y;
  const l = Math.hypot(dx, dy) || 1;
  const ux = dx / l, uy = dy / l;
  const nx = uy, ny = -ux; // right-hand normal
  return { x: from.x + ux * carry + nx * offline, y: from.y + uy * carry + ny * offline };
}

/** Recover carry/offline from two points (inverse of landingFromCarry). */
export function carryOffline(geo, from, to) {
  const dx = geo.pin.x - from.x, dy = geo.pin.y - from.y;
  const l = Math.hypot(dx, dy) || 1;
  const ux = dx / l, uy = dy / l;
  const vx = to.x - from.x, vy = to.y - from.y;
  return { carry: vx * ux + vy * uy, offline: vx * uy - vy * ux };
}

/**
 * Pick a believable point for a quick-tap zone selection. Prefers candidates whose distance from `from`
 * is close to `carry` (if given); falls back to sensible anchors.
 */
export function pointForZone(geo, zone, from, carry, rng = Math.random) {
  if (zone === 'cup') return { x: geo.pin.x, y: geo.pin.y };
  const want = carry ?? null;
  const cands = [];
  const anchors = zoneAnchors(geo, zone, from);
  for (const a of anchors) {
    for (let i = 0; i < 60; i++) {
      const r = a.r * Math.sqrt(rng());
      const t = rng() * Math.PI * 2;
      const p = { x: a.x + Math.cos(t) * r, y: a.y + Math.sin(t) * r };
      if (classifyPoint(geo, p) === zone) cands.push(p);
    }
  }
  if (!cands.length) {
    for (let i = 0; i < 1500; i++) {
      const b = geo.bounds;
      const p = { x: randRange(rng, b.minX - 20, b.maxX + 20), y: randRange(rng, b.minY, b.maxY + 20) };
      if (classifyPoint(geo, p) === zone) cands.push(p);
      if (cands.length > 40) break;
    }
  }
  if (!cands.length) return { x: geo.pin.x, y: geo.pin.y };
  if (want === null || !from) return cands[Math.floor(rng() * cands.length)];
  // Choose candidates closest to requested carry, forward of the ball.
  cands.sort((a, b) => Math.abs(dist(from, a) - want) - Math.abs(dist(from, b) - want));
  const top = cands.slice(0, Math.max(1, Math.ceil(cands.length * 0.15)));
  return top[Math.floor(rng() * top.length)];
}

function zoneAnchors(geo, zone, from) {
  const pin = geo.pin;
  switch (zone) {
    case 'bullseye': return [{ x: pin.x, y: pin.y, r: 3 }];
    case 'inner': return [{ x: pin.x, y: pin.y, r: 8 }];
    case 'green': return [{ x: geo.green.x, y: geo.green.y, r: geo.green.r }];
    case 'sand': return geo.bunkers.map((b) => ({ x: b.x, y: b.y, r: Math.max(b.rx, b.ry) }));
    case 'water': return geo.water.map((w) => ({ x: w.x, y: w.y, r: Math.max(w.rx, w.ry) }));
    case 'fairway': {
      const fromS = from ? projectToPath(geo.path, from).s : 0;
      const out = [];
      for (let s = Math.max(geo.fairwayStart, fromS + 30); s <= geo.fairwayEnd; s += 25) {
        const p = pointAtS(geo.path, s);
        out.push({ x: p.x, y: p.y, r: geo.fairwayWidth / 2 });
      }
      if (!out.length) {
        const p = pointAtS(geo.path, geo.fairwayEnd - 5);
        out.push({ x: p.x, y: p.y, r: geo.fairwayWidth / 2 });
      }
      return out;
    }
    case 'roughL':
    case 'roughR': {
      const side = zone === 'roughL' ? -1 : 1;
      const out = [];
      const fromS = from ? projectToPath(geo.path, from).s : 0;
      for (let s = Math.max(40, fromS + 30); s <= geo.yards; s += 30) {
        const p = pointAtS(geo.path, s);
        const n = normalAtS(geo.path, s);
        const off = geo.fairwayWidth / 2 + geo.roughWidth / 2;
        out.push({ x: p.x + n.x * off * side, y: p.y + n.y * off * side, r: geo.roughWidth / 2 });
      }
      return out;
    }
    case 'ob': {
      const out = [];
      for (let s = 60; s <= geo.yards; s += 40) {
        const p = pointAtS(geo.path, s);
        const n = normalAtS(geo.path, s);
        const off = geo.fairwayWidth / 2 + geo.roughWidth + 14;
        const side = s % 80 === 0 ? 1 : -1;
        out.push({ x: p.x + n.x * off * side, y: p.y + n.y * off * side, r: 8 });
      }
      return out;
    }
    default: return [{ x: pin.x, y: pin.y, r: 10 }];
  }
}

export const distToPin = (geo, p) => dist(p, geo.pin);
