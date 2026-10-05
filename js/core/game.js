// Game state model (pure, JSON-serialisable). Mode plugins keep their own data in game.modeState.
import { synthesize } from './fairway.js';
import { makeShot, restingPoint, strokesFor, maxStrokes, teePoint, lieAt, simulateShot } from './shots.js';
import { dist, uid, mulberry32, hashStr } from './util.js';

export const PLAYER_COLORS = ['#e8443a', '#2f7de1', '#f4b62b', '#33b36b'];

export function createGame({ suite, modeId, players, course, options = {} }) {
  return {
    version: 1,
    id: uid(),
    suite,
    modeId,
    options,
    players: players.map((p, i) => ({ ...p, id: p.id || `p${i + 1}`, color: p.color || PLAYER_COLORS[i % 4] })),
    course,
    holeIdx: 0,
    phase: 'hole',
    holes: course.holes.map(() => ({ shots: {}, done: {}, pickup: {} })),
    modeState: {},
    log: [],
    createdAt: Date.now(),
    finishedAt: null,
  };
}

export const currentHole = (game) => game.course.holes[game.holeIdx];
export const currentGeo = (game) => synthesize(currentHole(game));
export const holeState = (game, idx = game.holeIdx) => game.holes[idx];
export const playerById = (game, pid) => game.players.find((p) => p.id === pid);

export function shotsOf(game, pid, idx = game.holeIdx) {
  return holeState(game, idx).shots[pid] || [];
}

export function ballPos(game, pid, idx = game.holeIdx) {
  const shots = shotsOf(game, pid, idx);
  const geo = synthesize(game.course.holes[idx]);
  if (!shots.length) return teePoint(geo);
  return restingPoint(shots[shots.length - 1]);
}

export function isOnTee(game, pid, idx = game.holeIdx) {
  const shots = shotsOf(game, pid, idx);
  return shots.length === 0 || shots.every((s) => s.penalty);
}

export function currentLie(game, pid) {
  const geo = currentGeo(game);
  const shots = shotsOf(game, pid);
  if (!shots.length) return 'tee';
  const last = shots[shots.length - 1];
  if (last.penalty) return shots.length === 1 || shots.slice(0, -1).every((s) => s.penalty) ? 'tee' : lieAt(geo, last.from, false);
  return lieAt(geo, last.to, false);
}

export const isPlayerDone = (game, pid, idx = game.holeIdx) => !!holeState(game, idx).done[pid];
export const isHoleDone = (game, idx = game.holeIdx) => game.players.every((p) => isPlayerDone(game, p.id, idx));

/** Golf etiquette: farthest from the pin plays next. */
export function nextToPlay(game) {
  const geo = currentGeo(game);
  let best = null;
  for (const p of game.players) {
    if (isPlayerDone(game, p.id)) continue;
    const d = dist(ballPos(game, p.id), geo.pin);
    const n = shotsOf(game, p.id).length;
    if (!best || d > best.d + 0.01 || (Math.abs(d - best.d) <= 0.01 && n < best.n)) best = { pid: p.id, d, n };
  }
  return best ? best.pid : null;
}

/**
 * Record a shot. input = {type, to?, zone?, source?}. Returns the canonical shot.
 * Enforces auto-pickup at par+5 strokes.
 */
export function addShot(game, pid, input) {
  const hs = holeState(game);
  if (hs.done[pid]) throw new Error('Player already finished this hole');
  const geo = currentGeo(game);
  const list = (hs.shots[pid] = hs.shots[pid] || []);
  const from = ballPos(game, pid);
  const shot = makeShot({
    geo, pid, stroke: list.length + 1, type: input.type, from,
    to: input.to || { ...geo.pin }, zone: input.zone, source: input.source || 'manual',
  });
  list.push(shot);
  const strokes = strokesFor(list);
  if (shot.holed) hs.done[pid] = true;
  else if (strokes >= maxStrokes(geo.par)) {
    hs.done[pid] = true;
    hs.pickup[pid] = true;
  }
  return shot;
}

export function undoShot(game, pid) {
  const hs = holeState(game);
  const list = hs.shots[pid] || [];
  if (!list.length) return null;
  const s = list.pop();
  hs.done[pid] = false;
  hs.pickup[pid] = false;
  return s;
}

export function holeStrokes(game, pid, idx = game.holeIdx) {
  const hs = holeState(game, idx);
  const list = hs.shots[pid] || [];
  const par = game.course.holes[idx].par;
  if (hs.pickup[pid]) return maxStrokes(par);
  return strokesFor(list);
}

/** Simulated shot for CPU players / indoor "Sim Shot" button. Deterministic per game/hole/stroke. */
export function simulateFor(game, pid, skill = 0.7) {
  const geo = currentGeo(game);
  const n = shotsOf(game, pid).length;
  const rng = mulberry32(hashStr(`${game.id}:${game.holeIdx}:${pid}:${n}:${Date.now() % 997}`));
  const from = ballPos(game, pid);
  const lie = currentLie(game, pid);
  return simulateShot(geo, from, lie, skill, rng);
}

export function totalStrokes(game, pid) {
  let s = 0;
  for (let i = 0; i <= Math.min(game.holeIdx, game.holes.length - 1); i++) {
    if (isPlayerDone(game, pid, i)) s += holeStrokes(game, pid, i);
  }
  return s;
}

export function completedHoles(game) {
  const out = [];
  for (let i = 0; i < game.holes.length; i++) if (isHoleDone(game, i)) out.push(i);
  return out;
}

/** Basic structural validation for restored/imported games. */
export function validateGame(g) {
  return !!g && typeof g === 'object' && g.version === 1 && Array.isArray(g.players) && g.players.length >= 1 &&
    g.players.length <= 4 && g.course && Array.isArray(g.course.holes) && Array.isArray(g.holes) &&
    g.holes.length === g.course.holes.length && typeof g.holeIdx === 'number' && typeof g.modeId === 'string';
}
