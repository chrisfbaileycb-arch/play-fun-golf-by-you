import { test, assert, setFile } from './harness.js';
import { TOKENS, TOKEN_KINDS, tokenOf, tokenLabel } from '../js/boardwalk/board.js';
import {
  GRID, COLS, FLEET, HULL, idxOf, cellLabel, shipCells, fitAnchor, validFleet, autoPlace, battleship
} from '../js/boardwalk/battleship.js';
import {
  START_CASH, GROUPS, holeDeeds, findDeed, deedForShot, monopoly
} from '../js/boardwalk/monopoly.js';
import { makeHole } from '../js/core/course.js';
import { synthesize } from '../js/core/fairway.js';
import { createGame } from '../js/core/game.js';
import { mulberry32 } from '../js/core/util.js';

setFile('boardwalk');

test('Boardwalk Board: tokens and helpers', () => {
  assert.equal(TOKENS.length, 4);
  assert.ok(TOKEN_KINDS.includes('tophat'));
  assert.ok(TOKEN_KINDS.includes('roadster'));
  assert.ok(TOKEN_KINDS.includes('scottie'));
  assert.ok(TOKEN_KINDS.includes('thimble'));
  assert.equal(tokenLabel('tophat'), 'Top Hat');
  assert.equal(tokenOf({ token: 'roadster' }), 'roadster');
  assert.equal(tokenOf({ token: 'invalid' }, 2), 'scottie');
});

test('Battleship: 10x10 grid math and fleet layout', () => {
  assert.equal(GRID, 10);
  assert.equal(COLS.length, 10);
  assert.equal(FLEET.length, 4);
  assert.equal(HULL, 14); // 5 + 4 + 3 + 2

  // Index conversions
  assert.equal(idxOf(0, 0), 0);
  assert.equal(idxOf(9, 9), 99);
  assert.equal(idxOf(4, 2), 24);
  assert.equal(cellLabel(0), 'A1');
  assert.equal(cellLabel(24), 'E3');
  assert.equal(cellLabel(99), 'J10');

  // Ship cell span
  const carrierHoriz = shipCells(0, 5, true);
  assert.deepEqual(carrierHoriz, [0, 1, 2, 3, 4]);

  const carrierVert = shipCells(0, 5, false);
  assert.deepEqual(carrierVert, [0, 10, 20, 30, 40]);

  // Out of bounds detection
  assert.equal(shipCells(7, 5, true), null); // overflows column 9
  assert.equal(shipCells(70, 5, false), null); // overflows row 9

  // Anchor clamping
  assert.equal(fitAnchor(8, 5, true), 5); // fits horizontally from col 5..9
  assert.equal(fitAnchor(85, 4, false), 65); // fits vertically
});

test('Battleship: fleet placement and auto-generator', () => {
  const rng = mulberry32(42);
  const fleet = autoPlace(rng);
  assert.ok(validFleet(fleet));

  // Invalid fleet checks
  assert.equal(validFleet([]), false);
  assert.equal(validFleet([{ id: 'carrier', cells: [0, 1, 2] }]), false);

  // Overlapping cells test
  const overlapping = [
    { id: 'carrier', cells: [0, 1, 2, 3, 4] },
    { id: 'battleship', cells: [4, 14, 24, 34] }, // collision at 4
    { id: 'destroyer', cells: [50, 51, 52] },
    { id: 'patrol', cells: [90, 91] },
  ];
  assert.equal(validFleet(overlapping), false);
});

test('Battleship: artillery shot resolution', () => {
  const hole = makeHole(1, 4, 360, 0);
  const game = createGame({
    suite: 'boardwalk',
    modeId: 'battleship',
    players: [
      { id: 'p1', name: 'Alice', token: 'tophat' },
      { id: 'p2', name: 'Bob', token: 'roadster' },
    ],
    course: { id: 'c', name: 'Boardwalk Links', holes: [hole] },
  });

  game.modeState = battleship.init(game);
  assert.ok(game.modeState.boards.p1);
  assert.ok(game.modeState.boards.p2);

  const geo = synthesize(hole);
  const shot = { zone: 'fairway', carry: 200, to: { x: 0, y: 200 } };
  const events = battleship.onShot(game, { player: game.players[0], shot, geo });
  assert.ok(events.length > 0);
});

test('Turf Monopoly: hole deeds and property generation', () => {
  const hole = makeHole(1, 4, 380, 0);
  const geo = synthesize(hole);
  const deeds = holeDeeds(geo, 0);

  // Par 4 gets 2 fairway segments + 1 green deed = 3 deeds
  assert.equal(deeds.length, 3);
  assert.equal(deeds[0].kind, 'fairway');
  assert.equal(deeds[2].kind, 'green');
  assert.ok(deeds[0].price > 0);
  assert.ok(deeds[0].rent > 0);
  assert.ok(deeds[2].price > deeds[0].price); // Green is most valuable

  const game = createGame({
    suite: 'boardwalk',
    modeId: 'monopoly',
    players: [
      { id: 'p1', name: 'Alice', token: 'tophat' },
      { id: 'p2', name: 'Bob', token: 'roadster' },
    ],
    course: { id: 'c', name: 'Boardwalk Links', holes: [hole] },
  });

  const found = findDeed(game, 'h0-f0');
  assert.ok(found);
  assert.equal(found.id, 'h0-f0');
});

test('Turf Monopoly: game initialization and shot deeds', () => {
  const hole = makeHole(1, 4, 380, 0);
  const game = createGame({
    suite: 'boardwalk',
    modeId: 'monopoly',
    players: [
      { id: 'p1', name: 'Alice', token: 'tophat' },
      { id: 'p2', name: 'Bob', token: 'roadster' },
    ],
    course: { id: 'c', name: 'Boardwalk Links', holes: [hole] },
  });

  game.modeState = monopoly.init(game);
  assert.equal(game.modeState.players.p1.cash, START_CASH);
  assert.equal(game.modeState.players.p2.cash, START_CASH);

  const geo = synthesize(hole);
  // Fairway drive landing on first fairway property segment
  const shot = { zone: 'fairway', carry: 180, to: { x: 0, y: 180 } };
  const d = deedForShot(geo, 0, shot);
  assert.ok(d);
  assert.equal(d.kind, 'fairway');

  const events = monopoly.onShot(game, { player: game.players[0], shot, geo });
  assert.ok(events.length > 0);
});
