import { test, assert, setFile } from './harness.js';
import { scoreShot } from '../js/knight/scoring.js';
import { resolveDuel, resolveRaidBoss } from '../js/knight/combat.js';
import { castleConquest, duelingKnighthood, raidBoss } from '../js/knight/modes.js';
import { createGame, addShot } from '../js/core/game.js';
import { makeHole } from '../js/core/course.js';
import { synthesize } from '../js/core/fairway.js';

setFile('knight');

const testHole = makeHole(1, 4, 350, 0, { bunkers: 2 });
const geo = synthesize(testHole);

function makeTestGame(modeId = 'castle') {
  return createGame({
    suite: 'knight',
    modeId,
    players: [
      { id: 'p1', name: 'Sir Arthur', sigil: 'lion', weapon: 'broadsword', color: '#e74c3c' },
      { id: 'p2', name: 'Black Knight', sigil: 'dragon', weapon: 'battleaxe', color: '#2f7de1' },
    ],
    course: { id: 'c', name: 'Camelot', holes: [testHole] },
  });
}

test('Knight scoring: positive points & combo multiplier streak', () => {
  const pState = { points: 0, combo: 1.0, xp: 0 };
  
  // Shot 1: Fairway hit (combo 1.0 -> 1.5)
  const shot1 = { zone: 'fairway', carry: 120, to: { x: 0, y: 120 } };
  const res1 = scoreShot(shot1, geo, pState);
  assert.equal(res1.pts, 30); // 20 * 1.5
  assert.equal(pState.combo, 1.5);
  assert.equal(pState.points, 30);

  // Shot 2: Bullseye (combo 1.5 -> 2.0)
  const shot2 = { zone: 'bullseye', carry: 120, to: geo.pin };
  const res2 = scoreShot(shot2, geo, pState);
  assert.equal(res2.pts, 200); // 100 * 2.0
  assert.equal(pState.combo, 2.0);
  assert.equal(pState.points, 230);

  // Shot 3: Sand trap breaks combo back to 1.0
  const shot3 = { zone: 'sand', carry: 10, to: { x: 10, y: 340 } };
  const res3 = scoreShot(shot3, geo, pState);
  assert.equal(pState.combo, 1.0);
  assert.ok(pState.crackedArmor);
});

test('Knight combat: best zone executes critical strike on opponent', () => {
  const game = makeTestGame('castle');
  game.modeState = castleConquest.init(game);

  const results = {
    p1: { strokes: 3, bestZone: 'bullseye', birdie: true, bullseyes: 1, holed: true },
    p2: { strokes: 4, bestZone: 'roughL', birdie: false, bullseyes: 0, holed: true },
  };

  const { beats, events } = resolveDuel(game, results, 'castle');
  assert.ok(beats.length > 0);
  assert.equal(beats[0].attacker.id, 'p1');
  assert.equal(beats[0].defender.id, 'p2');
  assert.ok(game.modeState.players.p2.hp < 100);
});

test('Knight combat: Raid boss takes collective damage', () => {
  const game = makeTestGame('raid');
  game.modeState = raidBoss.init(game);
  const initialBossHp = game.modeState.bossHp;

  const results = {
    p1: { strokes: 4, bestZone: 'fairway', fairwayHit: true, holed: true, bullseyes: 0, sand: 0, water: 0, ob: 0 },
    p2: { strokes: 3, bestZone: 'inner', fairwayHit: true, holed: true, bullseyes: 1, sand: 0, water: 0, ob: 0 },
  };

  const { beats } = resolveRaidBoss(game, results);
  assert.ok(game.modeState.bossHp < initialBossHp);
  assert.equal(beats[0].defender.id, 'boss');
});
