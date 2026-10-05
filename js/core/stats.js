// Hole and round statistics shared by scoring engines, titles and summaries (pure).
import { synthesize } from './fairway.js';
import { holeState, holeStrokes, isPlayerDone } from './game.js';
import { GREEN_ZONES, ZONE_RANK } from './shots.js';

export function holeResult(game, idx, pid) {
  const hole = game.course.holes[idx];
  const geo = synthesize(hole);
  const hs = holeState(game, idx);
  const shots = hs.shots[pid] || [];
  const strokes = holeStrokes(game, pid, idx);
  const nonPutts = shots.filter((s) => s.type !== 'putt');
  const tee = shots[0];
  let reachedGreenAt = null;
  let strokeCount = 0;
  for (const s of shots) {
    strokeCount += 1 + (s.penalty || 0);
    if (GREEN_ZONES.has(s.zone) && reachedGreenAt === null) reachedGreenAt = strokeCount;
  }
  const approachLandings = nonPutts.filter((s) => GREEN_ZONES.has(s.zone));
  const closest = approachLandings.length ? Math.min(...approachLandings.map((s) => s.distToPin)) : null;
  const bestZone = shots.reduce((b, s) => (ZONE_RANK[s.zone] > ZONE_RANK[b] ? s.zone : b), shots[0]?.zone || 'ob');
  return {
    pid, idx, par: hole.par, strokes, toPar: strokes - hole.par, shots,
    holed: shots.some((s) => s.holed), pickup: !!hs.pickup[pid], finished: isPlayerDone(game, pid, idx),
    fairwayHit: hole.par >= 4 && !!tee && tee.zone === 'fairway',
    fairwayChance: hole.par >= 4,
    gir: reachedGreenAt !== null && reachedGreenAt <= hole.par - 2,
    sand: shots.filter((s) => s.zone === 'sand').length,
    water: shots.filter((s) => s.zone === 'water').length,
    ob: shots.filter((s) => s.zone === 'ob').length,
    rough: shots.filter((s) => s.zone === 'roughL' || s.zone === 'roughR').length,
    longestCarry: Math.max(0, ...shots.filter((s) => s.type === 'drive' || s === tee).map((s) => s.carry)),
    closest,
    bullseyes: nonPutts.filter((s) => s.zone === 'bullseye' || s.zone === 'cup').length,
    putts: shots.filter((s) => s.type === 'putt').length,
    birdie: strokes < hole.par && !hs.pickup[pid],
    bestZone,
    yards: geo.yards,
  };
}

export function holeResults(game, idx = game.holeIdx) {
  const out = {};
  for (const p of game.players) out[p.id] = holeResult(game, idx, p.id);
  return out;
}

export function roundStats(game, pid) {
  const agg = {
    pid, holes: 0, strokes: 0, par: 0, fairways: 0, fairwayChances: 0, girs: 0, sand: 0, water: 0, ob: 0,
    longestCarry: 0, closest: null, bullseyes: 0, birdies: 0, putts: 0, holedOut: 0,
  };
  for (let i = 0; i < game.holes.length; i++) {
    if (!isPlayerDone(game, pid, i)) continue;
    const r = holeResult(game, i, pid);
    agg.holes++;
    agg.strokes += r.strokes;
    agg.par += r.par;
    agg.fairways += r.fairwayHit ? 1 : 0;
    agg.fairwayChances += r.fairwayChance ? 1 : 0;
    agg.girs += r.gir ? 1 : 0;
    agg.sand += r.sand;
    agg.water += r.water;
    agg.ob += r.ob;
    agg.longestCarry = Math.max(agg.longestCarry, r.longestCarry);
    if (r.closest !== null) agg.closest = agg.closest === null ? r.closest : Math.min(agg.closest, r.closest);
    agg.bullseyes += r.bullseyes;
    agg.birdies += r.birdie ? 1 : 0;
    agg.putts += r.putts;
    agg.holedOut += r.shots.some((s) => s.holed && s.type !== 'putt') ? 1 : 0;
  }
  agg.toPar = agg.strokes - agg.par;
  return agg;
}

export const allRoundStats = (game) => game.players.map((p) => roundStats(game, p.id));

/** Shared title awarding helper: returns pid with max (or min) of a metric, or null on no data / all zero. */
export function leaderBy(stats, key, { min = false, requirePositive = true } = {}) {
  let best = null;
  for (const s of stats) {
    const v = s[key];
    if (v === null || v === undefined) continue;
    if (requirePositive && !min && v <= 0) continue;
    if (!best || (min ? v < best.v : v > best.v)) best = { pid: s.pid, v };
  }
  return best;
}
