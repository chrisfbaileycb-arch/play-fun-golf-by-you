import { test, assert, setFile } from './harness.js';
import { sorry } from '../js/boardwalk/sorry.js';
import { chutes } from '../js/boardwalk/chutes.js';
import { mousetrap, STAGES } from '../js/boardwalk/mousetrap.js';
import { robots, ROBOT_CONFIG } from '../js/boardwalk/robots.js';
import { makeHole } from '../js/core/course.js';
import { synthesize } from '../js/core/fairway.js';
import { createGame } from '../js/core/game.js';

setFile('boardwalk2');

function makeTestGame(modeId) {
  const hole = makeHole(1, 4, 370, 0);
  return createGame({
    suite: 'boardwalk',
    modeId,
    players: [
      { id: 'p1', name: 'Alice', token: 'tophat' },
      { id: 'p2', name: 'Bob', token: 'roadster' },
    ],
    course: { id: 'c', name: 'Boardwalk Links', holes: [hole] },
  });
}

test('Fairway Sorry: pawns, slides, and 15-yard bump-back', () => {
  const game = makeTestGame('sorry');
  game.modeState = sorry.init(game);

  assert.ok(game.modeState.pawns.p1);
  assert.ok(game.modeState.pawns.p2);
  assert.equal(game.modeState.pawns.p1.pos, 0);

  const hole = game.course.holes[0];
  const geo = synthesize(hole);

  // P1 drives to yard 200
  game.modeState.pawns.p1.pos = 200;

  // P2 lands at yard 205 (within 15 yards of P1) -> triggers SORRY bump!
  const p2Shot = { zone: 'fairway', carry: 205, to: { x: 0, y: 205 } };
  const events = sorry.onShot(game, { player: game.players[1], shot: p2Shot, geo });

  // P1 bumped back to tee (pos 0)
  assert.equal(game.modeState.pawns.p1.pos, 0);
  assert.equal(game.modeState.pawns.p1.bumped, 1);
  assert.equal(game.modeState.pawns.p2.bumps, 1);
  assert.ok(events.some((e) => e.text === 'SORRY!'));
});

test('Chutes & Ladders: 100-tile climb, ladders, and chutes', () => {
  const game = makeTestGame('chutes');
  game.modeState = chutes.init(game);

  const p1 = game.modeState.players.p1;
  assert.equal(p1.tile, 1);
  assert.equal(p1.ladders, 0);
  assert.equal(p1.chutes, 0);

  const hole = game.course.holes[0];
  const geo = synthesize(hole);

  // Sweet spot bullseye triggers towering ladder (+20-30 tiles)
  const ladderShot = { zone: 'bullseye', carry: 150, to: geo.pin };
  const events1 = chutes.onShot(game, { player: game.players[0], shot: ladderShot, geo });
  assert.ok(p1.tile > 20);
  assert.equal(p1.ladders, 1);
  assert.ok(events1.some((e) => e.name === 'ladder'));

  // Hazard sand trap triggers chute
  const initialTile = p1.tile;
  const chuteShot = { zone: 'sand', carry: 10, to: { x: 10, y: 300 } };
  const events2 = chutes.onShot(game, { player: game.players[0], shot: chuteShot, geo });
  assert.ok(p1.tile < initialTile);
  assert.equal(p1.chutes, 1);
  assert.ok(events2.some((e) => e.name === 'chute'));
});

test('Mouse Trap: 5 mechanical chain-reaction stages', () => {
  assert.equal(STAGES.length, 5);
  const game = makeTestGame('mousetrap');
  game.modeState = mousetrap.init(game);

  const p1 = game.modeState.players.p1;
  assert.equal(p1.stage, 0);

  const hole = game.course.holes[0];
  const geo = synthesize(hole);

  // Stage 1: Fairway drive triggers Crank & Gears
  const shot1 = { zone: 'fairway', carry: 220, to: { x: 0, y: 220 } };
  const ev1 = mousetrap.onShot(game, { player: game.players[0], shot: shot1, geo });
  assert.equal(p1.stage, 1);
  assert.ok(ev1.some((e) => e.name === 'crank'));

  // Stage 2: Approach triggers Plastic Boot
  const shot2 = { zone: 'green', carry: 120, to: { x: 0, y: 340 } };
  const ev2 = mousetrap.onShot(game, { player: game.players[0], shot: shot2, geo });
  assert.equal(p1.stage, 2);
  assert.ok(ev2.some((e) => e.name === 'bootKick'));

  // Stage 3: Sand escape triggers Marble Stairs
  const shot3 = { zone: 'sand', carry: 15, to: { x: 5, y: 355 } };
  const ev3 = mousetrap.onShot(game, { player: game.players[0], shot: shot3, geo });
  assert.equal(p1.stage, 3);
  assert.ok(ev3.some((e) => e.name === 'marble'));

  // Stage 4: Putt triggers Wash Tub Pole
  const shot4 = { zone: 'green', type: 'putt', carry: 8, distToPin: 2, to: { x: 0, y: 368 } };
  const ev4 = mousetrap.onShot(game, { player: game.players[0], shot: shot4, geo });
  assert.equal(p1.stage, 4);
  assert.ok(ev4.some((e) => e.name === 'tub'));

  // Stage 5: Drained Cup SNAPS CAGE
  const shot5 = { zone: 'cup', type: 'putt', carry: 2, holed: true, to: geo.pin };
  const ev5 = mousetrap.onShot(game, { player: game.players[0], shot: shot5, geo });
  assert.equal(p1.stage, 5);
  assert.equal(p1.trapsTriggered, 1);
  assert.ok(ev5.some((e) => e.name === 'cage'));
});

test("Rock 'Em Sock 'Em Robots: punch meters, chin blows, and head pop", () => {
  assert.ok(ROBOT_CONFIG.length >= 2);
  const game = makeTestGame('robots');
  game.modeState = robots.init(game);

  const p1 = game.modeState.players.p1;
  const p2 = game.modeState.players.p2;

  assert.equal(p1.meter, 0);
  assert.equal(p1.chinHp, 100);
  assert.equal(p1.headPopped, false);

  const hole = game.course.holes[0];
  const geo = synthesize(hole);

  // Bullseye charges punch meter by +50%
  const bullseyeShot = { zone: 'bullseye', carry: 150, to: geo.pin };
  const ev = robots.onShot(game, { player: game.players[0], shot: bullseyeShot, geo });
  assert.equal(p1.meter, 50);
  assert.ok(ev.some((e) => e.name === 'ratchet'));

  // Hole end duel: p1 with lower strokes beats p2
  p1.meter = 100;
  const results = {
    p1: { strokes: 3, bestZone: 'bullseye' },
    p2: { strokes: 5, bestZone: 'roughL' },
  };
  const duelEvents = robots.onHoleEnd(game, results);

  assert.ok(p2.chinHp < 100);
  assert.equal(p1.punchesLanded, 1);
  assert.ok(game.modeState.lastDuel);
  assert.equal(game.modeState.lastDuel.attackerId, 'p1');

  // Critical knockout if Chin HP reaches 0
  p2.chinHp = 10;
  p1.meter = 100;
  const koResults = robots.onHoleEnd(game, results);
  assert.equal(p2.headPopped, true);
  assert.equal(p1.knockouts, 1);
  assert.ok(koResults.some((e) => e.name === 'headPop'));
});
