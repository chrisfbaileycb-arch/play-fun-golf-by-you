import { test, assert, setFile } from './harness.js';
import { synthesize, classifyPoint, landingFromCarry, carryOffline, pointForZone, projectToPath, pointAtS, RING } from '../js/core/fairway.js';
import { PRESETS, sanitizeCourse, coursePar, makeHole } from '../js/core/course.js';
import { createGame, addShot, ballPos, nextToPlay, isHoleDone, holeStrokes, undoShot, currentLie, validateGame, simulateFor } from '../js/core/game.js';
import { holeResult, roundStats, leaderBy } from '../js/core/stats.js';
import { puttMakeChance, makeShot } from '../js/core/shots.js';
import { toHoleSpace, haversineYards } from '../js/core/gps.js';
import { mulberry32, dist } from '../js/core/util.js';

setFile('core');

const hole4 = makeHole(1, 4, 360, 0.3, { bunkers: 3, water: true });

test('synthesized path length equals yardage', () => {
  const g = synthesize(hole4);
  assert.near(g.path[g.path.length - 1].s, 360, 0.5);
  assert.near(dist(g.pin, { x: g.path.at(-1).x, y: g.path.at(-1).y }), 0, 1e-9);
});

test('geometry is deterministic per hole seed', () => {
  const a = synthesize(makeHole(2, 5, 480, -0.2, { bunkers: 4 }));
  const b = synthesize(makeHole(2, 5, 480, -0.2, { bunkers: 4 }));
  assert.deepEqual(a.bunkers, b.bunkers);
  assert.equal(a.landingZones.length, 2);
});

test('classifyPoint: rings around the pin', () => {
  const g = synthesize(hole4);
  assert.equal(classifyPoint(g, { x: g.pin.x + 1, y: g.pin.y }), 'bullseye');
  assert.equal(classifyPoint(g, { x: g.pin.x + RING.inner - 1, y: g.pin.y }), 'inner');
});

test('classifyPoint: fairway centre, rough sides, OB far away', () => {
  const g = synthesize(makeHole(3, 4, 380, 0, { bunkers: 0 }));
  const p = pointAtS(g.path, 220);
  assert.equal(classifyPoint(g, p), 'fairway');
  assert.equal(classifyPoint(g, { x: p.x - (g.fairwayWidth / 2 + 8), y: p.y }), 'roughL');
  assert.equal(classifyPoint(g, { x: p.x + (g.fairwayWidth / 2 + 8), y: p.y }), 'roughR');
  assert.equal(classifyPoint(g, { x: p.x + 200, y: p.y }), 'ob');
});

test('landingFromCarry and carryOffline are inverse', () => {
  const g = synthesize(hole4);
  const from = { x: 0, y: 0 };
  const to = landingFromCarry(g, from, 210, -12);
  const co = carryOffline(g, from, to);
  assert.near(co.carry, 210, 1e-6);
  assert.near(co.offline, -12, 1e-6);
});

test('pointForZone returns a point in the requested zone', () => {
  const g = synthesize(hole4);
  const rng = mulberry32(42);
  for (const z of ['fairway', 'roughL', 'roughR', 'sand', 'water', 'green', 'inner', 'bullseye', 'ob']) {
    const p = pointForZone(g, z, { x: 0, y: 0 }, 200, rng);
    assert.equal(classifyPoint(g, p), z, `zone ${z}`);
  }
});

test('projectToPath side: +x is golfer right', () => {
  const g = synthesize(makeHole(4, 4, 350, 0, { bunkers: 0 }));
  assert.equal(projectToPath(g.path, { x: 10, y: 100 }).side, 1);
  assert.equal(projectToPath(g.path, { x: -10, y: 100 }).side, -1);
});

test('presets: Camelot Greens has 9 holes', () => {
  const c = PRESETS.camelot();
  assert.equal(c.holes.length, 9);
  assert.equal(c.name, 'Camelot Greens Executive 9');
  assert.ok(coursePar(c) >= 27);
});

test('sanitizeCourse clamps hostile input', () => {
  const c = sanitizeCourse({ name: 'x'.repeat(500), holes: [{ par: 9, yards: 99999, dogleg: 7, hazards: { bunkers: 50 } }] });
  assert.equal(c.holes[0].par, 5);
  assert.equal(c.holes[0].yards, 700);
  assert.equal(c.holes[0].dogleg, 1);
  assert.equal(c.holes[0].hazards.bunkers, 6);
  assert.equal(c.name.length, 60);
  assert.equal(sanitizeCourse({ holes: 'nope' }), null);
});

function twoPlayerGame() {
  return createGame({ suite: 'knight', modeId: 'castle', players: [{ name: 'A' }, { name: 'B' }], course: { id: 't', name: 'T', holes: [hole4, makeHole(2, 3, 150)] } });
}

test('water is a 1-stroke penalty and ball returns to previous lie', () => {
  const game = twoPlayerGame();
  const g = synthesize(hole4);
  const wp = { x: g.water[0].x, y: g.water[0].y };
  const s = addShot(game, 'p1', { type: 'drive', to: wp });
  assert.equal(s.zone, 'water');
  assert.equal(s.penalty, 1);
  assert.deepEqual(ballPos(game, 'p1'), { x: 0, y: 0 });
  assert.equal(currentLie(game, 'p1'), 'tee');
  assert.equal(holeStrokes(game, 'p1'), 2);
});

test('farthest from pin plays next; holing completes the player', () => {
  const game = twoPlayerGame();
  const g = synthesize(hole4);
  addShot(game, 'p1', { type: 'drive', to: pointAtS(g.path, 250) });
  assert.equal(nextToPlay(game), 'p2');
  addShot(game, 'p2', { type: 'drive', to: pointAtS(g.path, 200) });
  assert.equal(nextToPlay(game), 'p2');
  addShot(game, 'p2', { type: 'approach', zone: 'cup' });
  assert.equal(nextToPlay(game), 'p1');
  addShot(game, 'p1', { type: 'approach', zone: 'cup' });
  assert.ok(isHoleDone(game));
});

test('auto-pickup at par + 5', () => {
  const game = twoPlayerGame();
  for (let i = 0; i < 9; i++) addShot(game, 'p1', { type: 'drive', zone: 'roughL', to: { x: -30, y: 50 + i } });
  assert.ok(game.holes[0].done.p1);
  assert.equal(holeStrokes(game, 'p1'), 9);
  assert.throws(() => addShot(game, 'p1', { type: 'putt', zone: 'cup' }));
  undoShot(game, 'p1');
  assert.ok(!game.holes[0].done.p1);
});

test('holeResult stats: fairway hit, GIR, birdie', () => {
  const game = twoPlayerGame();
  const g = synthesize(hole4);
  addShot(game, 'p1', { type: 'drive', to: pointAtS(g.path, 240) });
  addShot(game, 'p1', { type: 'approach', to: { x: g.pin.x + 2, y: g.pin.y } });
  addShot(game, 'p1', { type: 'putt', zone: 'cup' });
  const r = holeResult(game, 0, 'p1');
  assert.ok(r.fairwayHit);
  assert.ok(r.gir);
  assert.ok(r.birdie);
  assert.equal(r.strokes, 3);
  assert.equal(r.bullseyes, 1);
  assert.ok(r.closest <= 3);
  const rs = roundStats(game, 'p1');
  assert.equal(rs.birdies, 1);
  assert.equal(leaderBy([rs], 'longestCarry').pid, 'p1');
});

test('simulated shots always produce valid zones and finish holes', () => {
  const game = twoPlayerGame();
  let guard = 0;
  while (!isHoleDone(game) && guard++ < 40) {
    const pid = nextToPlay(game);
    addShot(game, pid, simulateFor(game, pid, 0.7));
  }
  assert.ok(isHoleDone(game));
  assert.ok(validateGame(JSON.parse(JSON.stringify(game))));
});

test('putt make chance decreases with distance', () => {
  assert.gt(puttMakeChance(1), puttMakeChance(5));
  assert.gt(puttMakeChance(5), puttMakeChance(15));
});

test('makeShot cup lands on the pin with 0 distance', () => {
  const g = synthesize(hole4);
  const s = makeShot({ geo: g, pid: 'p1', stroke: 1, type: 'approach', from: { x: 0, y: 0 }, to: { x: 5, y: 5 }, zone: 'cup' });
  assert.equal(s.distToPin, 0);
  assert.ok(s.holed);
});

test('GPS: point 100 yds along bearing maps to +y', () => {
  const anchor = { lat: 40, lon: -105 };
  const north = { lat: 40 + 91.44 / 111195, lon: -105 };
  const p = toHoleSpace(anchor, 0, north);
  assert.near(p.y, 100, 0.6);
  assert.near(p.x, 0, 0.3);
  const east = toHoleSpace(anchor, 90, { lat: 40, lon: -105 + 91.44 / (111195 * Math.cos(40 * Math.PI / 180)) });
  assert.near(east.y, 100, 0.6);
  assert.near(haversineYards(anchor, north), 100, 0.6);
});
