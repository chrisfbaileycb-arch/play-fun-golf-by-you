// Shot model, lie-aware suggestions and CPU/simulated shot generation (pure).
import { synthesize, classifyPoint, landingFromCarry, carryOffline, pointForZone, projectToPath, pointAtS, distToPin, ringFor } from './fairway.js';
import { clamp, dist, gauss, round } from './util.js';

export const SHOT_TYPES = [
  { id: 'drive', label: 'Drive' },
  { id: 'approach', label: 'Approach' },
  { id: 'sand', label: 'Sand' },
  { id: 'putt', label: 'Putt' },
];

export const GREEN_ZONES = new Set(['cup', 'bullseye', 'inner', 'green']);
export const HAZARD_ZONES = new Set(['sand', 'water', 'ob']);
export const PENALTY_ZONES = new Set(['water', 'ob']);
export const ZONE_RANK = { cup: 9, bullseye: 8, inner: 7, green: 6, fairway: 5, roughL: 3, roughR: 3, sand: 2, water: 1, ob: 0 };

export function teePoint(geo) {
  return { x: geo.tee.x, y: geo.tee.y };
}

/** Lie of a ball position (tee counts as a perfect fairway lie). */
export function lieAt(geo, pos, isTee) {
  if (isTee) return 'tee';
  return classifyPoint(geo, pos);
}

export function suggestShotType(geo, pos, lie) {
  if (lie === 'tee') return geo.par === 3 ? 'approach' : 'drive';
  if (lie === 'sand') return 'sand';
  if (GREEN_ZONES.has(lie)) return 'putt';
  return 'approach';
}

export function suggestCarry(geo, pos, type) {
  const d = distToPin(geo, pos);
  if (type === 'drive') return Math.round(Math.min(d, 245));
  if (type === 'putt') return Math.round(d);
  if (type === 'sand') return Math.round(Math.min(d, 35));
  return Math.round(Math.min(d, 200));
}

/**
 * Build a canonical shot record. `to` is the landing point; zone may be explicitly provided
 * (quick-tap) or derived from the point. Penalty zones return the ball to `from` (stroke & distance).
 */
export function makeShot({ geo, pid, stroke, type, from, to, zone, source = 'manual' }) {
  const z = zone || classifyPoint(geo, to);
  const landing = z === 'cup' ? { x: geo.pin.x, y: geo.pin.y } : to;
  const co = carryOffline(geo, from, landing);
  const dBefore = distToPin(geo, from);
  const dAfter = z === 'cup' ? 0 : distToPin(geo, landing);
  return {
    pid, stroke, type, zone: z, source,
    from: { x: round(from.x, 2), y: round(from.y, 2) },
    to: { x: round(landing.x, 2), y: round(landing.y, 2) },
    carry: Math.max(0, Math.round(type === 'putt' ? dist(from, landing) : co.carry)),
    offline: Math.round(co.offline),
    distBefore: Math.round(dBefore),
    distToPin: Math.round(dAfter * 10) / 10,
    ring: z === 'cup' ? 'bullseye' : ringFor(geo, landing),
    holed: z === 'cup',
    penalty: PENALTY_ZONES.has(z) ? 1 : 0,
  };
}

/** Where the ball rests after a shot (stroke-and-distance for penalties). */
export function restingPoint(shot) {
  if (shot.penalty) return { ...shot.from };
  return { ...shot.to };
}

export function strokesFor(shots) {
  return shots.reduce((s, sh) => s + 1 + (sh.penalty || 0), 0);
}

export const maxStrokes = (par) => par + 5;

// ---------- Simulation (CPU rivals, "Sim Shot" for indoor testing) ----------

/** Putt make probability by distance in yards. */
export function puttMakeChance(d) {
  if (d <= 0.7) return 0.99;
  return clamp(1.05 * Math.exp(-0.21 * d), 0.04, 0.97);
}

/**
 * Generate a plausible shot from `from`. skill ∈ [0.3, 1]. Returns {type, to, zone}.
 */
export function simulateShot(geo, from, lie, skill, rng) {
  const type = suggestShotType(geo, from, lie);
  const d = distToPin(geo, from);
  const disp = 1.45 - skill; // dispersion factor

  if (type === 'putt') {
    if (rng() < puttMakeChance(d) * (0.75 + skill * 0.3)) return { type, zone: 'cup', to: { ...geo.pin } };
    const leave = Math.max(0.6, d * (0.08 + rng() * 0.22 * disp));
    const ang = rng() * Math.PI * 2;
    const to = { x: geo.pin.x + Math.cos(ang) * leave, y: geo.pin.y + Math.sin(ang) * leave };
    return { type, zone: classifyPoint(geo, to), to };
  }

  if ((type === 'approach' || type === 'sand') && d < 120 && rng() < 0.012 + skill * 0.02) {
    return { type, zone: 'cup', to: { ...geo.pin } };
  }

  // Aim: tee shots on long holes aim at the next landing zone; otherwise at the pin.
  let carry;
  let aimOff = 0;
  const maxCarry = type === 'drive' ? 200 + skill * 70 : type === 'sand' ? 40 : 150 + skill * 60;
  if (type === 'drive' && d > maxCarry) {
    const pr = projectToPath(geo.path, from);
    const target = pointAtS(geo.path, pr.s + maxCarry * 0.95);
    carry = dist(from, target);
    aimOff = carryOffline(geo, from, target).offline;
  } else {
    carry = Math.min(d, maxCarry);
  }
  const carryErr = gauss(rng) * carry * 0.06 * disp;
  const offErr = gauss(rng) * Math.max(3, carry * 0.075 * disp);
  const to = landingFromCarry(geo, from, Math.max(5, carry + carryErr), aimOff + offErr);
  return { type, zone: classifyPoint(geo, to), to };
}

/** Quick-tap zone selection → landing point. */
export function landingForZone(geo, zone, from, carry, rng) {
  return pointForZone(geo, zone, from, carry, rng);
}

export { synthesize };
