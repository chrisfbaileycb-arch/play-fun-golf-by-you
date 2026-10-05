import { test, assert, setFile } from './harness.js';
import { isHoleInOne, scoreTerm, createCelebrationScene, augmentSceneWithFestiveFX } from '../js/core/celebration.js';

setFile('celebration');

test('isHoleInOne correctly detects stroke 1 holed', () => {
  assert.equal(isHoleInOne({ holed: true, stroke: 1 }), true);
  assert.equal(isHoleInOne({ holed: true, stroke: 2 }), false);
  assert.equal(isHoleInOne({ holed: false, stroke: 1 }), false);
  assert.equal(isHoleInOne(null), false);
});

test('scoreTerm returns proper golf terminology for under par and others', () => {
  assert.equal(scoreTerm(1, 3), 'Hole in One');
  assert.equal(scoreTerm(2, 5), 'Albatross');
  assert.equal(scoreTerm(2, 4), 'Eagle');
  assert.equal(scoreTerm(3, 4), 'Birdie');
  assert.equal(scoreTerm(4, 4), 'Par');
  assert.equal(scoreTerm(5, 4), 'Bogey');
});

test('createCelebrationScene creates valid scene protocol object for Hole in One', () => {
  const dummyPlayer = { id: 'p1', name: 'Ace King', color: '#ffd700' };
  const dummyHole = { par: 3, yards: 165 };
  const scene = createCelebrationScene({
    player: dummyPlayer,
    hole: dummyHole,
    holeIdx: 0,
    strokes: 1,
    par: 3,
    isAce: true,
  });

  assert.ok(scene.title.includes('HOLE IN ONE'));
  assert.ok(scene.caption.includes('Ace King'));
  assert.equal(scene.done, false);
  assert.equal(typeof scene.init, 'function');
  assert.equal(typeof scene.update, 'function');
  assert.equal(typeof scene.draw, 'function');
});

test('createCelebrationScene creates valid scene protocol object for Birdie under par', () => {
  const dummyPlayer = { id: 'p2', name: 'Robin Fairway', color: '#2ecc71' };
  const dummyHole = { par: 4, yards: 380 };
  const scene = createCelebrationScene({
    player: dummyPlayer,
    hole: dummyHole,
    holeIdx: 2,
    strokes: 3,
    par: 4,
    isAce: false,
  });

  assert.ok(scene.title.includes('BIRDIE'));
  assert.ok(scene.caption.includes('Robin Fairway'));
  assert.equal(scene.done, false);
});

test('augmentSceneWithFestiveFX decorates base scene with celebration banner', () => {
  const baseScene = {
    title: 'Base Arena',
    caption: 'Knights clash',
    done: false,
    init: () => {},
    update: () => {},
    draw: () => {},
  };
  const augmented = augmentSceneWithFestiveFX(baseScene, {
    underParPlayers: [{ name: 'Sir Arthur', toPar: -1 }],
    isAce: false,
    hole: { par: 4 },
    holeIdx: 0,
  });

  assert.ok(augmented.title.includes('BIRDIE'));
  assert.ok(augmented.caption.includes('Sir Arthur'));
  assert.equal(typeof augmented.init, 'function');
  assert.equal(typeof augmented.draw, 'function');
});

test('FX.celebrateScore specifically triggers confetti on score of 1 and rejects others', async () => {
  const { FX } = await import('../js/core/fx.js');
  const fx = new FX();

  // Score of 2, 3, 4 should NOT trigger
  assert.equal(fx.celebrateScore(2), false);
  assert.equal(fx.celebrateScore(4), false);
  assert.equal(fx.parts.length, 0);

  // Score of 1 MUST trigger celebratory confetti
  const triggered = fx.celebrateScore(1, { w: 400, h: 300 });
  assert.equal(triggered, true);
  assert.ok(fx.parts.length > 50, 'confetti particles generated');
  assert.ok(fx.parts.some((p) => p.kind === 'confetti'));
  assert.ok(fx.texts.some((t) => t.str.includes('HOLE IN ONE')));
  assert.ok(fx.flashA > 0, 'screen flash triggered');
  assert.ok(fx.shakeMag > 0, 'camera shake triggered');
});

test('triggerScoreCelebration specifically detects score 1 from numeric or score engine results', async () => {
  const { triggerScoreCelebration } = await import('../js/core/fx.js');

  // Negative cases
  assert.equal(triggerScoreCelebration(2), false);
  assert.equal(triggerScoreCelebration(3), false);
  assert.equal(triggerScoreCelebration({ strokes: 4 }), false);
  assert.equal(triggerScoreCelebration(null), false);

  // Positive cases (score of 1)
  assert.equal(triggerScoreCelebration(1), true);
  assert.equal(triggerScoreCelebration({ strokes: 1 }), true);
  assert.equal(triggerScoreCelebration({ score: 1 }), true);
});

test('audioManager in audio.js integrates specific sound effects (wind, crowd cheers) on hole-in-one', async () => {
  const { audioManager, AudioManager, SOUND_NAMES } = await import('../js/core/audio.js');

  assert.ok(AudioManager, 'AudioManager class exported');
  assert.ok(audioManager, 'audioManager instance exported');
  assert.ok(SOUND_NAMES.includes('wind'), 'wind sound effect defined');
  assert.ok(SOUND_NAMES.includes('crowdCheer'), 'crowdCheer sound effect defined');

  let eventFired = false;
  let eventType = null;
  const unsubscribe = audioManager.on((event) => {
    eventFired = true;
    eventType = event;
  });

  audioManager._lastHoleInOne = 0; // reset debounce
  audioManager.onHoleInOne({ score: 1 });

  assert.equal(eventFired, true);
  assert.equal(eventType, 'hole-in-one');
  unsubscribe();
});

test('recording a hole-in-one in fx.js triggers audioManager sound effects', async () => {
  const { audioManager } = await import('../js/core/audio.js');
  const { FX, triggerScoreCelebration } = await import('../js/core/fx.js');

  let audioTriggered = false;
  const unsub = audioManager.on((evt) => {
    if (evt === 'hole-in-one') audioTriggered = true;
  });

  // Recording a score of 1 in FX
  audioManager._lastHoleInOne = 0;
  audioTriggered = false;
  const fx = new FX();
  fx.celebrateScore(1, { w: 400, h: 300 });
  assert.equal(audioTriggered, true, 'fx.celebrateScore(1) triggered audioManager');

  // Triggering score celebration with 1
  audioManager._lastHoleInOne = 0;
  audioTriggered = false;
  triggerScoreCelebration(1);
  assert.equal(audioTriggered, true, 'triggerScoreCelebration(1) triggered audioManager');

  // Non-ace score does not trigger audio
  audioTriggered = false;
  triggerScoreCelebration(3);
  assert.equal(audioTriggered, false, 'score of 3 did not trigger audioManager');

  unsub();
});

test('HUD in hud.js automatically displays gold ACE badge when hole score is 1 and triggers celebration', async () => {
  const { isAceScore, createHUDCard, createAceBadge, renderHUD } = await import('../js/core/hud.js');
  const { createGame } = await import('../js/core/game.js');
  const { PRESETS } = await import('../js/core/course.js');

  const course = PRESETS.pitch();
  const game = createGame({
    course,
    players: [
      { id: 'p1', name: 'Ace Arthur', color: '#ffd700' },
      { id: 'p2', name: 'Sir Bogey', color: '#33d6ff' },
    ],
  });

  // Hole 0: P1 has a score of 1 (holed)
  game.holes[0].shots.p1 = [{ stroke: 1, holed: true, zone: 'cup', carry: 120, to: { x: 0, y: 120 } }];
  game.holes[0].done.p1 = true;

  // P2 has a score of 3
  game.holes[0].shots.p2 = [
    { stroke: 1, holed: false, zone: 'fairway' },
    { stroke: 2, holed: false, zone: 'green' },
    { stroke: 3, holed: true, zone: 'cup' },
  ];
  game.holes[0].done.p2 = true;

  assert.equal(isAceScore(game, 'p1', 0), true, 'p1 has ace score');
  assert.equal(isAceScore(game, 'p2', 0), false, 'p2 has 3 strokes, not ace');

  if (typeof document !== 'undefined') {
    // Verify createHUDCard produces a gold ACE badge for p1
    const card1 = createHUDCard(game.players[0], { value: '1', label: 'strokes' }, false, { game, triggerCelebration: false });
    const badge1 = card1.querySelector('.hc-ace-badge');
    assert.ok(badge1, 'gold ACE badge element exists');
    assert.ok(badge1.className.includes('is-ace'), 'badge has is-ace class');
    assert.ok(badge1.textContent.includes('ACE'), 'badge text contains ACE');

    // Verify p2 does not have the ACE badge
    const card2 = createHUDCard(game.players[1], { value: '3', label: 'strokes' }, false, { game, triggerCelebration: false });
    const badge2 = card2.querySelector('.hc-ace-badge');
    assert.equal(badge2, null, 'p2 does not have ACE badge');

    // Verify renderHUD populates container with cards and ACE badge
    const host = document.createElement('div');
    renderHUD(host, game, { hud: () => [{ pid: 'p1', value: '1' }, { pid: 'p2', value: '3' }] }, { triggerCelebration: false });
    const renderedBadge = host.querySelector('.hc-ace-badge');
    assert.ok(renderedBadge, 'host contains rendered gold ACE badge');
  }
});

test('Career Stats module tracks aces across rounds in local storage and builds summary table', async () => {
  const {
    getCareerStats,
    saveCareerStats,
    resetCareerStats,
    recordAce,
    recordRoundAces,
    getPlayerStats,
    renderCareerStatsSummary,
  } = await import('../js/core/careerStats.js');
  const { createGame } = await import('../js/core/game.js');
  const { PRESETS } = await import('../js/core/course.js');

  // Start with clean state
  resetCareerStats();
  assert.deepEqual(getCareerStats(), {});

  // 1. Test manual recordAce
  recordAce('Sir Lancelot', { courseName: 'Camelot', holeIdx: 1 });
  let lancelotStats = getPlayerStats('Sir Lancelot');
  assert.equal(lancelotStats.aces, 1, 'Lancelot recorded 1 ace');

  recordAce('Sir Lancelot', { courseName: 'Camelot', holeIdx: 4 });
  lancelotStats = getPlayerStats('Sir Lancelot');
  assert.equal(lancelotStats.aces, 2, 'Lancelot recorded second ace');

  // 2. Test recordRoundAces with game state
  const course = PRESETS.pitch();
  const game = createGame({
    course,
    players: [
      { id: 'p1', name: 'Ace King', color: '#ffd700' },
      { id: 'p2', name: 'Queen Birdie', color: '#33d6ff' },
    ],
  });

  // Ace on hole 0 for Ace King
  game.holes[0].shots.p1 = [{ stroke: 1, holed: true, zone: 'cup' }];
  game.holes[0].done.p1 = true;

  // Ace on hole 2 for Ace King
  game.holes[2].shots.p1 = [{ stroke: 1, holed: true, zone: 'cup' }];
  game.holes[2].done.p1 = true;

  // Queen Birdie has 2 strokes on hole 0 (not ace)
  game.holes[0].shots.p2 = [{ stroke: 1, holed: false }, { stroke: 2, holed: true }];
  game.holes[0].done.p2 = true;

  // Process round aces
  recordRoundAces(game);

  const kingStats = getPlayerStats('Ace King');
  assert.equal(kingStats.aces, 2, 'Ace King has 2 aces from round');
  assert.equal(kingStats.rounds, 1, 'Ace King has 1 round played');

  const birdieStats = getPlayerStats('Queen Birdie');
  assert.equal(birdieStats.aces, 0, 'Queen Birdie has 0 aces');
  assert.equal(birdieStats.rounds, 1, 'Queen Birdie has 1 round played');

  // 3. Test idempotency (calling recordRoundAces again for same round does not duplicate)
  recordRoundAces(game);
  assert.equal(getPlayerStats('Ace King').aces, 2, 'Idempotent: aces count remains 2');
  assert.equal(getPlayerStats('Ace King').rounds, 1, 'Idempotent: rounds count remains 1');

  // 4. Test renderCareerStatsSummary
  if (typeof document !== 'undefined') {
    const summaryHost = document.createElement('div');
    const section = renderCareerStatsSummary(summaryHost, game);
    assert.ok(section, 'summary section created');
    assert.ok(summaryHost.querySelector('.career-stats-section'), 'section appended to host');
    assert.ok(summaryHost.querySelector('.career-stats-table'), 'table exists in section');

    const rows = summaryHost.querySelectorAll('.career-stats-table tbody tr');
    assert.ok(rows.length >= 2, 'table has rows for players');

    const aceCells = summaryHost.querySelectorAll('.career-stats-total');
    assert.ok(aceCells.length > 0, 'career stats total cell displayed');

    const exportBtn = summaryHost.querySelector('.btn-trophy-export');
    assert.ok(exportBtn, 'championship trophy certificate export button rendered');
  }

  // Clean up
  resetCareerStats();
  assert.deepEqual(getCareerStats(), {});
});

test('Championship Trophy Certificate SVG generator creates framed certificate of achievement', async () => {
  const {
    buildCareerCertificateSVG,
    recordAce,
    resetCareerStats,
    exportCareerCertificatePNG,
    exportCareerCertificateSVG,
    exportCareerStatsCSV,
    exportCareerStatsJSON,
  } = await import('../js/core/careerStats.js');

  resetCareerStats();
  recordAce('Sir Galahad', { courseName: 'Camelot Greens', holeIdx: 3 });
  recordAce('Sir Galahad', { courseName: 'Camelot Greens', holeIdx: 7 });

  const svg = buildCareerCertificateSVG();

  assert.ok(typeof svg === 'string', 'SVG is a string');
  assert.ok(svg.includes('<svg'), 'valid SVG element start');
  assert.ok(svg.includes('</svg>'), 'valid SVG element close');
  assert.ok(svg.includes('CHAMPIONSHIP HALL OF FAME'), 'includes championship title');
  assert.ok(svg.includes('OFFICIAL DIPLOMA OF ACCOMPLISHMENT & VALOR'), 'includes diploma text');
  assert.ok(svg.includes('SIR GALAHAD'), 'includes champion name');
  assert.ok(svg.includes('ARCADE LINKS'), 'includes arcade links plinth inscription');
  assert.ok(svg.includes('goldGrad'), 'includes gold gradient styling');

  // Verify export functions exist
  assert.ok(typeof exportCareerCertificatePNG === 'function');
  assert.ok(typeof exportCareerCertificateSVG === 'function');
  assert.ok(typeof exportCareerStatsCSV === 'function');
  assert.ok(typeof exportCareerStatsJSON === 'function');

  resetCareerStats();
});




