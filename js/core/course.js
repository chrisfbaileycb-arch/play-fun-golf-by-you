// Course data model, presets and validation (pure).
import { clamp, hashStr } from './util.js';

export function makeHole(n, par, yards, dogleg = 0, hazards = {}, name = '') {
  return {
    n, par, yards, dogleg,
    hazards: { bunkers: hazards.bunkers ?? (par === 3 ? 2 : par === 4 ? 3 : 4), water: !!hazards.water },
    name,
    seed: hashStr(`${n}:${par}:${yards}:${dogleg}:${name}`),
  };
}

export const PRESETS = {
  camelot: () => ({
    id: 'camelot',
    name: 'Camelot Greens Executive 9',
    holes: [
      makeHole(1, 4, 312, 0.25, { bunkers: 3 }, 'The Drawbridge'),
      makeHole(2, 3, 148, 0, { bunkers: 2, water: true }, 'Moat Crossing'),
      makeHole(3, 4, 341, -0.45, { bunkers: 3 }, "Merlin's Bend"),
      makeHole(4, 3, 122, 0.1, { bunkers: 3 }, 'Squire\u2019s Pitch'),
      makeHole(5, 5, 468, 0.35, { bunkers: 4, water: true }, 'The Long Crusade'),
      makeHole(6, 3, 171, -0.15, { bunkers: 2 }, 'Archer\u2019s Tower'),
      makeHole(7, 4, 288, -0.2, { bunkers: 2, water: true }, 'Lady of the Lake'),
      makeHole(8, 3, 105, 0, { bunkers: 3 }, 'The Joust'),
      makeHole(9, 4, 356, 0.5, { bunkers: 4 }, 'Excalibur'),
    ],
  }),
  boardwalk: () => ({
    id: 'boardwalk',
    name: 'Boardwalk Municipal 9',
    holes: [
      makeHole(1, 4, 334, 0.2, { bunkers: 3 }),
      makeHole(2, 4, 362, -0.35, { bunkers: 3, water: true }),
      makeHole(3, 3, 156, 0, { bunkers: 2 }),
      makeHole(4, 5, 489, 0.4, { bunkers: 4 }),
      makeHole(5, 4, 301, -0.1, { bunkers: 2, water: true }),
      makeHole(6, 3, 138, 0.05, { bunkers: 3, water: true }),
      makeHole(7, 4, 377, 0.55, { bunkers: 3 }),
      makeHole(8, 3, 182, -0.2, { bunkers: 2 }),
      makeHole(9, 5, 512, -0.4, { bunkers: 4, water: true }),
    ],
  }),
  pitch: () => ({
    id: 'pitch',
    name: 'Seaside Pitch & Putt (Par-3 9)',
    holes: [95, 120, 88, 142, 110, 76, 133, 101, 155].map((y, i) =>
      makeHole(i + 1, 3, y, [0, 0.1, -0.1, 0.15, 0, -0.05, 0.1, 0, -0.15][i], { bunkers: 2, water: i % 3 === 1 })),
  }),
};

export function clampHole(h, n) {
  const par = clamp(parseInt(h.par, 10) || 4, 3, 5);
  const yards = clamp(parseInt(h.yards, 10) || defaultYards(par), 60, 700);
  const dogleg = clamp(Number(h.dogleg) || 0, -1, 1);
  const bunkers = clamp(parseInt(h.hazards?.bunkers, 10) || 0, 0, 6);
  return makeHole(n, par, yards, Math.round(dogleg * 100) / 100, { bunkers, water: !!h.hazards?.water }, String(h.name || '').slice(0, 40));
}

export function defaultYards(par) {
  return par === 3 ? 150 : par === 4 ? 350 : 500;
}

/** Validate untrusted course JSON (imports / localStorage). Returns sanitized course or null. */
export function sanitizeCourse(c) {
  if (!c || typeof c !== 'object' || !Array.isArray(c.holes)) return null;
  const holes = c.holes.slice(0, 18).map((h, i) => clampHole(h || {}, i + 1));
  if (!holes.length) return null;
  return { id: String(c.id || 'custom').slice(0, 32), name: String(c.name || 'Custom Course').slice(0, 60), holes };
}

export const coursePar = (course) => course.holes.reduce((s, h) => s + h.par, 0);
export const courseYards = (course) => course.holes.reduce((s, h) => s + h.yards, 0);
